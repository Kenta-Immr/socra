// Socra パイプラインエンジン — 5段パイプラインの実行制御
import { generateText, generateObject } from 'ai'
import { z } from 'zod'
import { google } from '@ai-sdk/google'
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
  MemoryContext,
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
export async function runStructure(question: string, userContext?: string, userName?: string, memory?: MemoryContext): Promise<StructuredQuestion> {
  const { object } = await generateObject({
    model: models.structure,
    schema: z.object({
      clarified: z.string().describe('明確化された問い'),
      context: z.array(z.string()).max(3).describe('判断に必要な文脈情報'),
      stakeholders: z.array(z.string()).describe('影響を受ける関係者'),
      timeHorizon: z.string().describe('判断の時間軸'),
      reversibility: z.enum(['reversible', 'partially', 'irreversible']),
    }),
    prompt: prompts.structure(question, userContext, userName, memory),
  })

  return { original: question, ...object }
}

// ── Stage 1: 明（Mei）— 事実収集（Gemini + Web検索）──────
export async function runObserve(sq: StructuredQuestion): Promise<ObservationResult> {
  // Gemini + Google Search Grounding で最新情報を取得
  const result = await generateText({
    model: models.observe,
    tools: { google_search: google.tools.googleSearch({}) },
    prompt: prompts.observe(sq),
  })

  const text = result.text

  // sourcesからURL型のみ抽出
  const groundingSources = (result.sources ?? [])
    .filter(s => s.sourceType === 'url')
    .map(s => ({ url: (s as { url: string }).url, title: (s as { title?: string }).title }))

  // テキスト応答をJSONとしてパース
  let parsed: { facts: Array<{ content: string; source: string; url?: string; confidence: string }>; dataSources: string[] }
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0])
    } else {
      throw new Error('No JSON found')
    }
  } catch {
    // JSONパース失敗時はテキストからfactを構成
    parsed = {
      facts: [{ content: text.slice(0, 500), source: 'Web search results', confidence: 'medium' }],
      dataSources: groundingSources.map(s => s.url),
    }
  }

  // grounding sourcesのURLをfactに紐付け
  const facts: Fact[] = parsed.facts.map((f, i) => ({
    content: f.content,
    source: f.source,
    url: f.url || groundingSources[i]?.url,
    confidence: (['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'medium') as Fact['confidence'],
  }))

  // データソースにgrounding URLも追加
  const allSources = Array.from(new Set([
    ...(parsed.dataSources ?? []),
    ...groundingSources.map(s => s.url),
  ]))

  return { hat: 'white', model: 'gemini', facts, dataSources: allSources }
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
        hat1: z.enum(['red', 'black', 'yellow', 'green']),
        hat2: z.enum(['red', 'black', 'yellow', 'green']),
        description: z.string(),
        severity: z.enum(['critical', 'moderate', 'minor']),
      })),
      factGaps: z.array(z.string()),
      overallConsistency: z.number().describe('論理整合性スコア（0〜100の整数値）'),
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
  quickReason?: string,
  userName?: string,
  round: number = 0,
  memory?: MemoryContext,
): Promise<SynthesisResult> {
  const prompt = quickReason
    ? prompts.synthesizeQuick(sq, quickReason, userName)
    : prompts.synthesize(sq, facts, agents, verification, userName, round, memory)

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

  // nextStepsをテキストから抽出（Next Steps / 次のステップ セクション内の箇条書き）
  const nextStepsMatch = text.match(/(?:Next Steps|次のステップ|next steps)[:\s]*\n((?:[-•*]\s*.+\n?)+)/i)
  const nextSteps = nextStepsMatch
    ? nextStepsMatch[1].split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
    : []

  // セッションタイトル抽出（"Your question was really about: ..." / "あなたの問いの本質は: ..."）
  const titleMatch = text.match(/(?:Your question was really about|あなたの問いの本質は)[:\s]*(.+)/i)
  const sessionTitle = titleMatch ? titleMatch[1].replace(/^["「]|["」]$/g, '').trim() : undefined

  // タイトル行をrecommendation本文から除去（UIで別表示するため）
  const cleanedText = titleMatch
    ? text.replace(/\n*(?:Your question was really about|あなたの問いの本質は)[:\s]*.+/i, '').trim()
    : text

  // 議論で最も影響が大きかったエージェント（intensity上位2体）
  const dominantAgents = [...agents]
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 2)
    .map(a => a.hat)

  return {
    hat: 'blue',
    model: 'claude',
    recommendation: cleanedText,
    sessionTitle,
    dominantAgents,
    riskNodes,
    nextSteps,
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
