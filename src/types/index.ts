// Socra v3 型定義 — Six Thinking Hats × 飛車角パイプライン

// ── Six Thinking Hats ──────────────────────────────────
export type HatColor = 'white' | 'red' | 'black' | 'yellow' | 'green' | 'blue'

export interface AgentIdentity {
  name: string
  kanji: string
  hex: string
  label: string
  question: string
  model: ModelProvider
}

export const AGENTS: Record<HatColor | 'verify', AgentIdentity> = {
  white:  { name: 'Mei',  kanji: '明', hex: '#E2E8F0', label: 'Facts',    question: 'What are the facts?',             model: 'gemini' },
  red:    { name: 'Jo',   kanji: '情', hex: '#EF4444', label: 'Instinct', question: 'What does your gut say?',          model: 'claude' },
  black:  { name: 'Kai',  kanji: '戒', hex: '#1E293B', label: 'Risk',     question: 'What could go wrong?',             model: 'claude' },
  yellow: { name: 'Ko',   kanji: '光', hex: '#F59E0B', label: 'Value',    question: 'What is the opportunity?',         model: 'claude' },
  green:  { name: 'So',   kanji: '創', hex: '#22C55E', label: 'Create',   question: 'What else is possible?',           model: 'claude' },
  verify: { name: 'Ri',   kanji: '理', hex: '#9CA3AF', label: 'Logic',    question: 'Does this hold together?',         model: 'openai' },
  blue:   { name: 'Ei',   kanji: '叡', hex: '#3B82F6', label: 'Mentor',   question: 'What matters most to you?',        model: 'claude' },
} as const

// ── パイプライン ──────────────────────────────────────
export type PipelineStage =
  | 'structure'   // Stage 0: 問いの構造化
  | 'observe'     // Stage 1: 白/観 — 事実収集
  | 'deliberate'  // Stage 2: 赤・黒・黄・緑 — 並列判断
  | 'verify'      // Stage 3: 論 — 検証
  | 'synthesize'  // Stage 4: 青/統合者 — 統合

export type PipelineStatus = 'pending' | 'running' | 'done' | 'error'

export interface PipelineState {
  sessionId: string
  question: string
  currentStage: PipelineStage
  stages: Record<PipelineStage, StageResult>
}

export interface StageResult {
  status: PipelineStatus
  data: unknown
  startedAt?: string
  completedAt?: string
  error?: string
}

// ── エージェント応答 ──────────────────────────────────
export type Stance = 'support' | 'caution' | 'oppose'
export type ModelProvider = 'claude' | 'openai' | 'gemini'

export interface AgentResponse {
  hat: HatColor
  name: string
  model: ModelProvider
  stance: Stance
  intensity: number  // 1-5
  reasoning: string
  keyPoints: string[]
}

// ── Stage 0: 問いの構造化 ─────────────────────────────
export interface StructuredQuestion {
  original: string
  clarified: string
  context: string[]       // ユーザーから聞き出した文脈（最大3問）
  stakeholders: string[]
  timeHorizon: string
  reversibility: 'reversible' | 'partially' | 'irreversible'
}

// ── Stage 1: 事実収集 ─────────────────────────────────
export interface ObservationResult {
  hat: 'white'
  model: 'gemini'
  facts: Fact[]
  dataSources: string[]
}

export interface Fact {
  content: string
  source: string
  confidence: 'high' | 'medium' | 'low'
}

// ── Stage 2: 並列判断 ─────────────────────────────────
export interface DeliberationResult {
  agents: AgentResponse[]  // 赤・黒・黄・緑の4体
}

// ── Stage 3: 検証 ─────────────────────────────────────
export interface VerificationResult {
  hat: 'blue'  // 論理検証用（色なし、便宜上blue外）
  model: 'openai'
  contradictions: Contradiction[]
  factGaps: string[]
  overallConsistency: number  // 0-100
}

export interface Contradiction {
  hat1: HatColor
  hat2: HatColor
  description: string
  severity: 'critical' | 'moderate' | 'minor'
}

// ── Stage 4: 統合 ──────────────────────────────────────
export interface SynthesisResult {
  hat: 'blue'
  model: 'claude'
  recommendation: string
  riskNodes: RiskNode[]
  nextSteps: string[]
  decisionMap: DecisionMapData
  radarChart: RadarChartData
}

export interface RiskNode {
  id: string
  label: string
  severity: 'high' | 'medium' | 'low'
  fromHat: HatColor
}

// ── 可視化データ ──────────────────────────────────────
export interface DecisionMapData {
  nodes: MapNode[]
  edges: MapEdge[]
}

export interface MapNode {
  id: string
  label: string
  type: 'question' | 'fact' | 'perspective' | 'risk' | 'opportunity' | 'synthesis'
  hat?: HatColor
  stance?: Stance
  intensity?: number
  x?: number
  y?: number
}

export interface MapEdge {
  source: string
  target: string
  type: 'supports' | 'contradicts' | 'leads_to' | 'deepens'
}

export interface RadarChartData {
  axes: { hat: HatColor; label: string; value: number }[]
  pattern: string  // e.g. "防衛型", "拡張型", "バランス型"
}

// ── セッション ────────────────────────────────────────
export type SessionStatus = 'structuring' | 'observing' | 'deliberating' | 'verifying' | 'synthesizing' | 'complete'

export interface Session {
  id: string
  question: string
  status: SessionStatus
  structuredQuestion?: StructuredQuestion
  observation?: ObservationResult
  deliberation?: DeliberationResult
  verification?: VerificationResult
  synthesis?: SynthesisResult
  createdAt: string
  completedAt?: string
}

// ── SSE イベント ──────────────────────────────────────
export type SSEEventType =
  | 'stage:start'
  | 'stage:progress'
  | 'stage:complete'
  | 'agent:start'
  | 'agent:chunk'
  | 'agent:complete'
  | 'pipeline:complete'
  | 'pipeline:error'

export interface SSEEvent {
  type: SSEEventType
  stage?: PipelineStage
  hat?: HatColor
  data: unknown
  timestamp: string
}
