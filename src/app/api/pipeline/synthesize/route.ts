// Socra v4: Synthesize 分離 API
// 2026-04-25: メインパイプライン /api/pipeline は Pre-mortem 完了で打ち切り、
// Synthesis（叡の最終統合）を別エンドポイントに分離して Vercel maxDuration 300秒の
// 二重消費を回避する。
import { runSynthesize } from '@/lib/pipeline/engine'
import type {
  StructuredQuestion,
  Fact,
  AgentResponse,
  VerificationResult,
  MemoryContext,
} from '@/types'

export const maxDuration = 120  // 単独 Synthesis は通常 30-60 秒。余裕を持って 120 秒。
export const dynamic = 'force-dynamic'

interface SynthesizeRequest {
  structured: StructuredQuestion
  facts?: Fact[]
  agents?: AgentResponse[]
  verification?: VerificationResult | null
  quickReason?: string
  userName?: string
  round?: number
  memoryContext?: MemoryContext
}

export async function POST(req: Request) {
  let body: SynthesizeRequest
  try {
    body = await req.json() as SynthesizeRequest
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { structured, facts, agents, verification, quickReason, userName, round, memoryContext } = body

  if (!structured || typeof structured.clarified !== 'string') {
    return new Response(JSON.stringify({ error: 'structured question is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const synthesis = await runSynthesize(
      structured,
      facts ?? [],
      agents ?? [],
      verification ?? { hat: 'blue', model: 'openai', contradictions: [], factGaps: [], overallConsistency: 100 },
      quickReason,
      userName,
      typeof round === 'number' ? round : 0,
      memoryContext,
    )
    return new Response(JSON.stringify(synthesis), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'synthesize failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
