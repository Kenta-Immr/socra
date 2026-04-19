// Socra パイプライン SSE エンドポイント
// 5段パイプラインを順次実行し、各ステージの結果をSSEでストリーミング
import { runStructure, runObserve, runDeliberateSequential, runVerify, runSynthesize, runRouting, runFocusPoint } from '@/lib/pipeline/engine'
import { detectCrisis, getCrisisResponse } from '@/lib/safety'
import type { SSEEvent, MemoryContext } from '@/types'

export const maxDuration = 300  // Vercel Pro: 最大300秒。Web検索込みで余裕を持つ

export async function POST(req: Request) {
  const { question, context, locale, userName, round = 0, memoryContext } = await req.json() as {
    question: string; context?: string; locale?: string; userName?: string; round?: number; memoryContext?: MemoryContext
  }

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
          structured = await runStructure(question, context, userName, memoryContext)
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
            routing.reason,
            userName
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

          // ── v0.2: フォーカスポイント候補生成（observe→deliberateの間）────
          const focusProposal = await runFocusPoint(structured, observation.facts)
          send({
            type: 'focus:proposed',
            data: focusProposal,
            focusProposal,
            timestamp: now(),
          })

          // MVP: auto/user_select 共に最初の候補を採用（user_select UIは Phase3）
          const confirmedFocus = focusProposal.candidates[0]
          send({
            type: 'focus:decided',
            data: confirmedFocus,
            focusPoint: confirmedFocus,
            timestamp: now(),
          })

          // フェーズ移行: pre_focus → focused
          send({
            type: 'phase:transition',
            data: { phase: 'focused' },
            phase: 'focused',
            timestamp: now(),
          })

          // ── Stage 2: 順次 deliberate（越境対応）────
          send({ type: 'stage:start', stage: 'deliberate', data: null, timestamp: now() })

          const { agents: deliberateAgents, crossBorders } = await runDeliberateSequential(
            structured,
            observation.facts,
            confirmedFocus,
            {
              onAgentStart: (hat) => send({
                type: 'agent:start',
                stage: 'deliberate',
                hat,
                data: null,
                timestamp: now(),
              }),
              onAgentComplete: (agent) => send({
                type: 'agent:complete',
                stage: 'deliberate',
                hat: agent.hat,
                data: agent,
                timestamp: now(),
              }),
              onCrossBorder: (cb) => send({
                type: 'cross_border:triggered',
                data: cb,
                crossBorder: cb,
                timestamp: now(),
              }),
            }
          )

          // 越境上限到達で converging へ
          if (crossBorders.length >= 3) {
            send({
              type: 'phase:transition',
              data: { phase: 'converging' },
              phase: 'converging',
              timestamp: now(),
            })
          }

          const deliberation = { agents: deliberateAgents }
          send({ type: 'stage:complete', stage: 'deliberate', data: deliberation, timestamp: now() })

          // ── Stage 3: 論 — 検証 ─────────────────────
          send({ type: 'stage:start', stage: 'verify', data: null, timestamp: now() })
          const verification = await runVerify(structured, deliberation.agents)
          send({ type: 'stage:complete', stage: 'verify', data: verification, timestamp: now() })

          // ── Stage 4: 青/統合 ────────────────────────
          send({ type: 'stage:start', stage: 'synthesize', data: null, timestamp: now() })
          const synthesis = await runSynthesize(structured, observation.facts, deliberation.agents, verification, undefined, userName, round, memoryContext)
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
