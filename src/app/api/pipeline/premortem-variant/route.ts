// Socra v4 軽量複数シナリオ拡張: Pre-mortem Variant 単体実行 API
// 2026-04-25 追加: 既存 Pre-mortem の後に「別の壊し方を見る」で呼ばれる。
// セッション状態（structured/facts/agents/verification）はクライアントから渡す。
import { runPreMortemVariant } from '@/lib/pipeline/engine'
import type { StructuredQuestion, Fact, AgentResponse, VerificationResult } from '@/types'

export const maxDuration = 60  // Pre-mortem 単体は20-30秒。余裕を持って60秒。
export const dynamic = 'force-dynamic'

interface VariantRequest {
  structured: StructuredQuestion
  facts: Fact[]
  agents: AgentResponse[]
  verification: VerificationResult
  avoidScenarios: string[]
}

export async function POST(req: Request) {
  let body: VariantRequest
  try {
    body = await req.json() as VariantRequest
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { structured, facts, agents, verification, avoidScenarios } = body

  if (!structured || !structured.clarified) {
    return new Response(JSON.stringify({ error: 'structured question is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const variant = await runPreMortemVariant(
      structured,
      facts ?? [],
      agents ?? [],
      verification ?? { hat: 'blue', model: 'openai', contradictions: [], factGaps: [], overallConsistency: 100 },
      avoidScenarios ?? [],
    )
    return new Response(JSON.stringify(variant), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'variant generation failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
