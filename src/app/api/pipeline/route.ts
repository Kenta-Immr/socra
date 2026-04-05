// Socra パイプライン SSE エンドポイント
// 5段パイプラインを順次実行し、各ステージの結果をSSEでストリーミング
import { runStructure, runObserve, runDeliberate, runVerify, runSynthesize } from '@/lib/pipeline/engine'
import type { SSEEvent } from '@/types'

export const maxDuration = 120  // Vercel Pro: 最大300秒。Free: 60秒

export async function POST(req: Request) {
  const { question } = await req.json()

  if (!question || typeof question !== 'string') {
    return new Response(JSON.stringify({ error: 'question is required' }), {
      status: 400,
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
        const structured = await runStructure(question)
        send({ type: 'stage:complete', stage: 'structure', data: structured, timestamp: now() })

        // ── Stage 1: 白/観 — 事実収集 ──────────────
        send({ type: 'stage:start', stage: 'observe', data: null, timestamp: now() })
        const observation = await runObserve(structured)
        send({ type: 'stage:complete', stage: 'observe', data: observation, timestamp: now() })

        // ── Stage 2: 赤・黒・黄・緑 — 並列判断 ────
        send({ type: 'stage:start', stage: 'deliberate', data: null, timestamp: now() })

        // 各エージェントの開始を通知してから並列実行
        const hatColors = ['red', 'black', 'yellow', 'green'] as const
        hatColors.forEach(hat => {
          send({ type: 'agent:start', stage: 'deliberate', hat, data: null, timestamp: now() })
        })

        const deliberation = await runDeliberate(structured, observation.facts)

        // 各エージェントの完了を通知
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
          data: { structured, observation, deliberation, verification, synthesis },
          timestamp: now(),
        })
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
