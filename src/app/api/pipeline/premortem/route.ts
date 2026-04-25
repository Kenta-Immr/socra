// Socra v4: Pre-mortem 分離 API
// 2026-04-25: メイン /api/pipeline は observe→deliberate→verify までで終了し、
// Pre-mortem（叡の Phase 4・時間の座）はクライアントから別エンドポイントで呼ぶ。
// これによりメインパイプラインの maxDuration 300秒消費を観察+討論+検証の範囲に
// 抑える（Anthropic レイテンシが高い日でもタイムアウトしない）。
import { runPreMortem } from '@/lib/pipeline/engine'
import type {
  StructuredQuestion,
  Fact,
  AgentResponse,
  VerificationResult,
} from '@/types'

export const maxDuration = 90  // Pre-mortem 単独は通常 30-50 秒。余裕を持って 90 秒。
export const dynamic = 'force-dynamic'

interface PreMortemRequest {
  structured: StructuredQuestion
  facts?: Fact[]
  agents?: AgentResponse[]
  verification?: VerificationResult | null
}

export async function POST(req: Request) {
  let body: PreMortemRequest
  try {
    body = await req.json() as PreMortemRequest
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { structured, facts, agents, verification } = body

  if (!structured || typeof structured.clarified !== 'string') {
    return new Response(JSON.stringify({ error: 'structured question is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const preMortem = await runPreMortem(
      structured,
      facts ?? [],
      agents ?? [],
      verification ?? { hat: 'blue', model: 'openai', contradictions: [], factGaps: [], overallConsistency: 100 },
    )
    return new Response(JSON.stringify(preMortem), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'premortem failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
