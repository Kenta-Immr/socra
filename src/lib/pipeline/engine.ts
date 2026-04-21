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
  FocusPoint,
  FocusPointProposal,
  CrossBorderRecord,
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
      context: z.array(z.string()).describe('判断に必要な文脈情報（最大3個）'),
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
    intensity: z.number().describe('スタンスの強度（1〜5の整数）'),
    reasoning: z.string(),
    keyPoints: z.array(z.string()).describe('キーポイント（最大5個）'),
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

// ============================================================
// v0.2 追加：フォーカスポイント・越境・順次deliberate
// 2026-04-19 研太さん指示で追加。既存 runDeliberate（並列）は残存。
// ============================================================

// ── v0.2: フォーカスポイント候補生成（observe後・deliberate前）──────
export async function runFocusPoint(
  sq: StructuredQuestion,
  facts: Fact[]
): Promise<FocusPointProposal> {
  const { text } = await generateText({
    model: models.focusPoint,
    prompt: prompts.focusPoint(sq, facts),
  })

  // JSONブロック or 生JSONを抽出
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    // フォールバック: 単一候補として問いそのものを返す
    return {
      mode: 'auto',
      candidates: [{
        id: 'fp_fallback',
        question: sq.clarified,
        rationale: 'フォーカス解析に失敗したため、構造化された問いをそのまま採用しました',
        proposedAt: new Date().toISOString(),
      }],
    }
  }

  try {
    const jsonStr = jsonMatch[1] ?? jsonMatch[0]
    const parsed = JSON.parse(jsonStr)
    const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : []

    const candidates: FocusPoint[] = rawCandidates.slice(0, 3).map((c: { id?: string; question?: string; rationale?: string; options?: string[] }, i: number) => ({
      id: c.id ?? `fp_${i + 1}`,
      question: c.question ?? '',
      rationale: c.rationale ?? '',
      options: c.options,
      proposedAt: new Date().toISOString(),
    })).filter((c: FocusPoint) => c.question.length > 0)

    if (candidates.length === 0) {
      return {
        mode: 'auto',
        candidates: [{
          id: 'fp_fallback',
          question: sq.clarified,
          rationale: '候補生成に失敗したため、構造化された問いをそのまま採用しました',
          proposedAt: new Date().toISOString(),
        }],
      }
    }

    const mode = parsed.mode === 'user_select' && candidates.length >= 2 ? 'user_select' : 'auto'
    return { mode, candidates: mode === 'auto' ? candidates.slice(0, 1) : candidates }
  } catch {
    return {
      mode: 'auto',
      candidates: [{
        id: 'fp_fallback',
        question: sq.clarified,
        rationale: 'JSONパース失敗のフォールバック',
        proposedAt: new Date().toISOString(),
      }],
    }
  }
}

// ── v0.2: 越境判定（軽量モデル・各エージェント発言後）──────
// デフォルトの越境候補マップ: この発言をした色 → 越境候補の色（フォールバック）
const DEFAULT_CROSS_BORDER_MAP: Partial<Record<HatColor, HatColor>> = {
  red: 'green',     // 情 → 創（感情×創造）
  black: 'yellow',  // 戒 → 光（リスク×価値）
  yellow: 'black',  // 光 → 戒（価値×リスク）
  green: 'black',   // 創 → 戒（創造×リスク）
}

// エージェント名と HatColor のマッピング（7体全員を対象）
//
// 設計方針: プロンプト側で「他エージェントは 漢字(英字) のセット表記で参照せよ」と
// 強制することで、漢字単体マッチによる一般語衝突（「情報」「戒律」「光景」「創業」等）
// を構造的に排除する。検出は以下の優先順位で行う:
//   1. セット表記（漢字(英字) または 英字(漢字)）— プロンプトで強制する第一形式
//   2. 英字名単独 — LLMがプロンプトを守らない場合のフォールバック
// 漢字単体マッチは意図的に採用しない（false positive の温床になるため）。
// 7体の HatColor: white(明/Mei), red(情/Jo), black(戒/Kai), yellow(光/Ko),
//                 green(創/So), blue(叡/Ei)。理(Ri) は HatColor='verify' で
//                 別軸のため、発言内参照としては検出対象外。
export const AGENT_NAME_PATTERNS: Array<[RegExp, HatColor]> = [
  // 第一優先: セット表記「漢字(英字)」「英字(漢字)」— 全角/半角カッコ両対応
  [/明\s*[（(]\s*Mei\s*[)）]|Mei\s*[（(]\s*明\s*[)）]/i, 'white'],
  [/情\s*[（(]\s*Jo\s*[)）]|Jo\s*[（(]\s*情\s*[)）]/i, 'red'],
  [/戒\s*[（(]\s*Kai\s*[)）]|Kai\s*[（(]\s*戒\s*[)）]/i, 'black'],
  [/光\s*[（(]\s*Ko\s*[)）]|Ko\s*[（(]\s*光\s*[)）]/i, 'yellow'],
  [/創\s*[（(]\s*So\s*[)）]|So\s*[（(]\s*創\s*[)）]/i, 'green'],
  [/叡\s*[（(]\s*Ei\s*[)）]|Ei\s*[（(]\s*叡\s*[)）]/i, 'blue'],
  // フォールバック: 英字名単独（プロンプト指示を守らなかった場合の保険）
  // 単語境界 \b で「Joseph」等の複合語にマッチしないよう保護
  [/\bMei\b/i, 'white'],
  [/\bJo\b/i, 'red'],
  [/\bKai\b/i, 'black'],
  [/\bKo\b/i, 'yellow'],
  [/\bSo\b/i, 'green'],
  [/\bEi\b/i, 'blue'],
]

// 発言中に明示参照されている他エージェントの HatColor を返す（話者自身は除外）
export function detectNameReferences(speech: string, fromHat: HatColor): HatColor[] {
  const found = new Set<HatColor>()
  for (const [pattern, hat] of AGENT_NAME_PATTERNS) {
    if (hat !== fromHat && pattern.test(speech)) {
      found.add(hat)
    }
  }
  return Array.from(found)
}

export async function runCrossBorder(
  fromHat: HatColor,
  focusQuestion: string,
  lastSpeech: string,
): Promise<CrossBorderRecord | null> {
  // 候補リスト: 名前参照エージェントを優先し、固定マップをフォールバックとして追加
  const nameReferenced = detectNameReferences(lastSpeech, fromHat)
  const fixedTarget = DEFAULT_CROSS_BORDER_MAP[fromHat]
  const candidates = Array.from(
    new Set<HatColor>([...nameReferenced, ...(fixedTarget ? [fixedTarget] : [])])
  )

  if (candidates.length === 0) return null

  // 各候補を順に試行し、最初に L2/L3 を返したものを採用
  for (const toHat of candidates) {
    try {
      const { text } = await generateText({
        model: models.crossBorder,
        prompt: prompts.crossBorder(fromHat, toHat, focusQuestion, lastSpeech),
      })

      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) continue

      const jsonStr = jsonMatch[1] ?? jsonMatch[0]
      const parsed = JSON.parse(jsonStr) as {
        shouldCross?: boolean
        level?: 'L2' | 'L3' | null
        content?: string | null
        reason?: string
      }

      if (!parsed.shouldCross) continue
      if (parsed.level !== 'L2' && parsed.level !== 'L3') continue
      if (!parsed.content) continue

      return {
        id: `cb_${Date.now()}_${toHat}`,
        fromHat,
        toHat,
        level: parsed.level,
        content: parsed.content,
        reason: parsed.reason ?? '',
        timestamp: new Date().toISOString(),
      }
    } catch {
      continue
    }
  }

  return null
}

// ── v0.2: 順次deliberate（フォーカスポイント＋越境対応）──────
// 既存 runDeliberate（並列）は保持。新規APIとして並立。
const CROSS_BORDER_LIMIT_PER_FP = 3

export async function runDeliberateSequential(
  sq: StructuredQuestion,
  facts: Fact[],
  focusPoint: FocusPoint,
  onEvent?: {
    onAgentStart?: (hat: HatColor) => void
    onAgentComplete?: (agent: AgentResponse) => void
    onCrossBorder?: (record: CrossBorderRecord) => void
  },
): Promise<{ agents: AgentResponse[]; crossBorders: CrossBorderRecord[] }> {
  type JudgmentHat = 'red' | 'black' | 'yellow' | 'green'
  const order: JudgmentHat[] = ['red', 'black', 'yellow', 'green']
  const agents: AgentResponse[] = []
  const crossBorders: CrossBorderRecord[] = []

  const agentSchema = z.object({
    stance: z.enum(['support', 'caution', 'oppose']),
    intensity: z.number().describe('スタンスの強度（1〜5の整数）'),
    reasoning: z.string(),
    keyPoints: z.array(z.string()).describe('キーポイント（最大5個）'),
  })

  for (let i = 0; i < order.length; i++) {
    const hat = order[i]
    onEvent?.onAgentStart?.(hat)

    // 前エージェントの発言＋フォーカスポイントをコンテキストに追加
    const previousContext = agents.length > 0
      ? `\n\n## Previous speakers in this deliberation\n${
          agents.map(a => `- **${a.name} (${a.hat})** [${a.stance}, intensity ${a.intensity}]: ${a.reasoning}`).join('\n')
        }${
          crossBorders.length > 0
            ? `\n\n## Cross-border interventions so far\n${
                crossBorders.map(cb => `- **${cb.toHat}** challenged **${cb.fromHat}** (${cb.level}): ${cb.content}`).join('\n')
              }`
            : ''
        }`
      : ''
    const focusContext = `\n\n## Focus Point (stay focused on this)\n**${focusPoint.question}**\n${focusPoint.rationale}`

    const basePrompt = prompts.deliberate(hat, sq, facts)
    const fullPrompt = basePrompt + previousContext + focusContext

    const { object } = await generateObject({
      model: models[hat] as typeof models.red,
      schema: agentSchema,
      prompt: fullPrompt,
    })

    const agentResponse: AgentResponse = {
      hat,
      name: AGENTS[hat].name,
      model: 'claude',
      ...object,
    }
    agents.push(agentResponse)
    onEvent?.onAgentComplete?.(agentResponse)

    // 越境判定（最後のエージェントを除く・上限3回）
    // reasoning + keyPoints を渡すことで名前参照の検出精度を向上
    if (i < order.length - 1 && crossBorders.length < CROSS_BORDER_LIMIT_PER_FP) {
      const speechContext = agentResponse.keyPoints.length > 0
        ? `${agentResponse.reasoning}\n\nKey points: ${agentResponse.keyPoints.join('; ')}`
        : agentResponse.reasoning
      const record = await runCrossBorder(
        hat,
        focusPoint.question,
        speechContext,
      )
      if (record) {
        crossBorders.push(record)
        onEvent?.onCrossBorder?.(record)
      }
    }
  }

  return { agents, crossBorders }
}
