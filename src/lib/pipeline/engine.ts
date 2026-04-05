// Socra パイプラインエンジン — 5段パイプラインの実行制御
import { generateText, generateObject } from 'ai'
import { z } from 'zod'
import { models } from './providers'
import { prompts } from './prompts'
import { AGENTS } from '@/types'
import type {
  StructuredQuestion,
  ObservationResult,
  AgentResponse,
  DeliberationResult,
  VerificationResult,
  SynthesisResult,
  HatColor,
  Fact,
} from '@/types'

// ── ルーティング判断（叡が判断）──────────────────────
export interface RoutingResult {
  mode: 'quick' | 'full'
  reason: string
}

export async function runRouting(sq: StructuredQuestion): Promise<RoutingResult> {
  const { object } = await generateObject({
    model: models.structure,
    schema: z.object({
      mode: z.enum(['quick', 'full']).describe('quick = Ei answers alone, full = full team deliberation'),
      reason: z.string().describe('Why this mode was chosen'),
    }),
    prompt: `You are Ei (叡), the mentor of Socra. You must decide how to handle this question.

## The Question
"${sq.clarified}"

## Context
- Time Horizon: ${sq.timeHorizon}
- Reversibility: ${sq.reversibility}
- Stakeholders: ${sq.stakeholders.join(', ')}

## Decision Criteria

Choose "full" (mobilize the entire team of 7 agents) when:
- The decision is irreversible or partially reversible
- Multiple stakeholders are affected
- The time horizon is long-term (months/years)
- The question involves significant risk or trade-offs
- The question is complex with multiple dimensions

Choose "quick" (you answer alone) when:
- The question is simple, factual, or has a clear answer
- The decision is easily reversible
- Low stakes with few stakeholders
- The question is more of an information request than a decision
- A quick, focused answer serves the user better than a full deliberation

Be honest: most real decisions deserve "full". Only use "quick" for genuinely simple questions.

Respond briefly.`,
  })

  return object
}

// ── Stage 0: 問いの構造化 ─────────────────────────────
export async function runStructure(question: string, userContext?: string): Promise<StructuredQuestion> {
  const { object } = await generateObject({
    model: models.structure,
    schema: z.object({
      clarified: z.string().describe('明確化された問い'),
      context: z.array(z.string()).max(3).describe('判断に必要な文脈情報'),
      stakeholders: z.array(z.string()).describe('影響を受ける関係者'),
      timeHorizon: z.string().describe('判断の時間軸'),
      reversibility: z.enum(['reversible', 'partially', 'irreversible']),
    }),
    prompt: prompts.structure(question, userContext),
  })

  return { original: question, ...object }
}

// ── Stage 1: 明（Mei）— 事実収集（Gemini）──────────────
export async function runObserve(sq: StructuredQuestion): Promise<ObservationResult> {
  const { object } = await generateObject({
    model: models.observe,
    schema: z.object({
      facts: z.array(z.object({
        content: z.string(),
        source: z.string(),
        confidence: z.enum(['high', 'medium', 'low']),
      })).describe('収集した事実'),
      dataSources: z.array(z.string()).describe('参照した情報源'),
    }),
    prompt: prompts.observe(sq),
  })

  return { hat: 'white', model: 'gemini', ...object }
}

// ── Stage 2: 並列判断（情・戒・光・創）───────────────
export async function runDeliberate(
  sq: StructuredQuestion,
  facts: Fact[]
): Promise<DeliberationResult> {
  const hats: Array<{ hat: HatColor; model: typeof models.red }> = [
    { hat: 'red', model: models.red },
    { hat: 'black', model: models.black },
    { hat: 'yellow', model: models.yellow },
    { hat: 'green', model: models.green },
  ]

  const agentSchema = z.object({
    stance: z.enum(['support', 'caution', 'oppose']),
    intensity: z.number().min(1).max(5),
    reasoning: z.string(),
    keyPoints: z.array(z.string()).max(5),
  })

  // 4体を並列実行
  const results = await Promise.all(
    hats.map(async ({ hat, model }) => {
      const { object } = await generateObject({
        model,
        schema: agentSchema,
        prompt: prompts.deliberate(hat, sq, facts),
      })
      const agent = AGENTS[hat]
      return { hat, name: agent.name, model: 'claude' as const, ...object }
    })
  )

  return { agents: results }
}

// ── Stage 3: 理（Ri）— 検証（GPT-4o）─────────────────
export async function runVerify(
  sq: StructuredQuestion,
  agents: AgentResponse[]
): Promise<VerificationResult> {
  const { object } = await generateObject({
    model: models.verify,
    schema: z.object({
      contradictions: z.array(z.object({
        hat1: z.enum(['white', 'red', 'black', 'yellow', 'green', 'blue']),
        hat2: z.enum(['white', 'red', 'black', 'yellow', 'green', 'blue']),
        description: z.string(),
        severity: z.enum(['critical', 'moderate', 'minor']),
      })),
      factGaps: z.array(z.string()),
      overallConsistency: z.number().min(0).max(100),
    }),
    prompt: prompts.verify(sq, agents),
  })

  return { hat: 'blue', model: 'openai', ...object }
}

// ── Stage 4: 叡（Ei）— 統合（Claude）────────────────
export async function runSynthesize(
  sq: StructuredQuestion,
  facts: Fact[],
  agents: AgentResponse[],
  verification: VerificationResult,
  quickReason?: string
): Promise<SynthesisResult> {
  const prompt = quickReason
    ? prompts.synthesizeQuick(sq, quickReason)
    : prompts.synthesize(sq, facts, agents, verification)

  const { text } = await generateText({
    model: models.synthesize,
    prompt,
  })

  return parseSynthesis(text, agents)
}

// 統合テキストから構造化データを抽出
function parseSynthesis(text: string, agents: AgentResponse[]): SynthesisResult {
  const blackAgent = agents.find(a => a.hat === 'black')
  const riskNodes = (blackAgent?.keyPoints ?? []).map((point, i) => ({
    id: `risk-${i}`,
    label: point,
    severity: (blackAgent?.intensity ?? 3) >= 4 ? 'high' as const : 'medium' as const,
    fromHat: 'black' as const,
  }))

  const radarAxes = agents.map(a => ({
    hat: a.hat,
    label: AGENTS[a.hat].name,
    value: a.stance === 'support' ? a.intensity : a.stance === 'oppose' ? -a.intensity : 0,
  }))

  const supportCount = agents.filter(a => a.stance === 'support').length
  const pattern = supportCount >= 3 ? 'Expansive' : supportCount <= 1 ? 'Defensive' : 'Balanced'

  return {
    hat: 'blue',
    model: 'claude',
    recommendation: text,
    riskNodes,
    nextSteps: [],
    decisionMap: {
      nodes: agents.map(a => ({
        id: `agent-${a.hat}`,
        label: a.keyPoints[0] ?? a.reasoning.slice(0, 50),
        type: 'perspective' as const,
        hat: a.hat,
        stance: a.stance,
        intensity: a.intensity,
      })),
      edges: [],
    },
    radarChart: { axes: radarAxes, pattern },
  }
}
