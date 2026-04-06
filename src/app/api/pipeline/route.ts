// Socra パイプライン SSE エンドポイント
// 5段パイプラインを順次実行し、各ステージの結果をSSEでストリーミング
import { runStructure, runObserve, runDeliberate, runVerify, runSynthesize, runRouting } from '@/lib/pipeline/engine'
import { detectCrisis, getCrisisResponse } from '@/lib/safety'
import type { SSEEvent } from '@/types'

export const maxDuration = 300  // Vercel Pro: 最大300秒。Web検索込みで余裕を持つ

export async function POST(req: Request) {
  const { question, context, locale } = await req.json()

  if (!question || typeof question !== 'string') {
    return new Response(JSON.stringify({ error: 'question is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // セーフティフィルター: 危機的状況を検出した場合、パイプラインを停止し専門機関に接続
  if (detectCrisis(question) || (context && detectCrisis(context))) {
    return new Response(JSON.stringify(getCrisisResponse(locale)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        // ── Stage 0: 問いの構造化 ──────────────────
        send({ type: 'stage:start', stage: 'structure', data: null, timestamp: now() })
        let structured
        try {
          structured = await runStructure(question, context)
        } catch {
          // 構造化失敗時のフォールバック
          structured = {
            original: question,
            clarified: question,
            context: context ? [context] : [],
            stakeholders: ['You'],
            timeHorizon: 'Unknown',
            reversibility: 'reversible' as const,
          }
        }
        send({ type: 'stage:complete', stage: 'structure', data: structured, timestamp: now() })

        // ── 叡のルーティング判断 ─────────────────
        const routing = await runRouting(structured)

        if (routing.mode === 'quick') {
          // 簡易モード: 叡が直接回答
          send({ type: 'stage:start', stage: 'synthesize', data: null, timestamp: now() })
          const quickSynthesis = await runSynthesize(
            structured,
            [],  // 事実収集なし
            [],  // 議論なし
            { hat: 'blue', model: 'openai', contradictions: [], factGaps: [], overallConsistency: 100 },
            routing.reason
          )
          send({ type: 'stage:complete', stage: 'synthesize', data: quickSynthesis, timestamp: now() })

          send({
            type: 'pipeline:complete',
            data: { structured, synthesis: quickSynthesis, routing },
            timestamp: now(),
          })
        } else {
          // フルモード: 全チーム動員
          // ── Stage 1: 白/観 — 事実収集 ──────────────
          send({ type: 'stage:start', stage: 'observe', data: null, timestamp: now() })
          const observation = await runObserve(structured)
          send({ type: 'stage:complete', stage: 'observe', data: observation, timestamp: now() })

          // ── Stage 2: 赤・黒・黄・緑 — 並列判断 ────
          send({ type: 'stage:start', stage: 'deliberate', data: null, timestamp: now() })

          const hatColors = ['red', 'black', 'yellow', 'green'] as const
          hatColors.forEach(hat => {
            send({ type: 'agent:start', stage: 'deliberate', hat, data: null, timestamp: now() })
          })

          const deliberation = await runDeliberate(structured, observation.facts)

          deliberation.agents.forEach(agent => {
            send({ type: 'agent:complete', stage: 'deliberate', hat: agent.hat, data: agent, timestamp: now() })
          })
          send({ type: 'stage:complete', stage: 'deliberate', data: deliberation, timestamp: now() })

          // ── Stage 3: 論 — 検証 ─────────────────────
          send({ type: 'stage:start', stage: 'verify', data: null, timestamp: now() })
          const verification = await runVerify(structured, deliberation.agents)
          send({ type: 'stage:complete', stage: 'verify', data: verification, timestamp: now() })

          // ── Stage 4: 青/統合 ────────────────────────
          send({ type: 'stage:start', stage: 'synthesize', data: null, timestamp: now() })
          const synthesis = await runSynthesize(structured, observation.facts, deliberation.agents, verification)
          send({ type: 'stage:complete', stage: 'synthesize', data: synthesis, timestamp: now() })

          // ── 完了 ────────────────────────────────────
          send({
            type: 'pipeline:complete',
            data: { structured, observation, deliberation, verification, synthesis, routing },
            timestamp: now(),
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        send({ type: 'pipeline:error', data: { error: message }, timestamp: now() })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

function now(): string {
  return new Date().toISOString()
}
