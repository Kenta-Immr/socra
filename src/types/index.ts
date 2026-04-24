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
  | 'premortem'   // Stage 3.5: 叡 — Pre-mortem（時間の座・v4 Phase 4）
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
  url?: string
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

// ── Stage 3.5: Pre-mortem（v4 Phase 4・叡の「時間の座」） ────
// 2026-04-24 v4 追加: 提出前レッドチームとしての Socra の心臓部。
// 「3年後、この決定は失敗だった。何がそれを招いたのか。」を叡が語る。
export interface PreMortemResult {
  hat: 'blue'
  model: 'claude'
  scenarioTitle: string          // 失敗シナリオのタイトル（例: "3年後、拡大は内部崩壊で頓挫した"）
  narrative: string              // 3年後から振り返る物語（未来完了形）
  rootCauses: string[]           // 失敗を招いた根本原因（3〜5個）
  warningSigns: string[]         // 早期警戒サイン（このサインが出たら黄信号・3〜5個）
  retractionTriggers: string[]   // 撤回条件（これが起きたら引き返す・2〜4個）
  coreQuestionBack: string       // 現在に戻って叡が問う核心の問い（1文）
}

// ── Stage 4: 統合 ──────────────────────────────────────
export interface SynthesisResult {
  hat: 'blue'
  model: 'claude'
  recommendation: string
  sessionTitle?: string    // 叡が生成するセッションタイトル（問いの本質）
  dominantAgents: HatColor[]  // 議論で最も影響が大きかったエージェント（intensity上位2体）
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
  type: 'question' | 'fact' | 'perspective' | 'risk' | 'opportunity' | 'synthesis' | 'user'
  hat?: HatColor
  stance?: Stance
  intensity?: number
  round?: number  // ラウンド番号（0=初回, 1=フォローアップ1回目...）
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

// ── ユーザーメモリ ────────────────────────────────────
export type MemoryType =
  | 'stuck_pattern'      // 思考の止まりパターン
  | 'deep_reflection'    // 深く考えた問い
  | 'surface_pass'       // 表面で流した問い
  | 'decision_made'      // 何を選んだか
  | 'decision_deferred'  // 何を保留したか

export interface UserMemoryEntry {
  id: string
  userId: string
  sessionId?: string
  memoryType: MemoryType
  content: string          // ユーザー自身の言葉
  patternNote?: string     // 抽出されたパターンの説明
  questionContext?: string  // どんな問いへの反応か
  agentName?: string
  weight: number           // 1-10（繰り返しで加算）
  createdAt: string
}

export interface UserVocab {
  id: string
  userId: string
  word: string
  context?: string
  frequency: number
  createdAt: string
}

export interface MemoryContext {
  stuckPatterns: string[]     // 上位3件のpattern_note
  deepReflections: string[]   // 上位3件のcontent
  decisions: string[]         // 直近3件の判断内容
  vocab: string[]             // 頻出語彙 上位5語
  sessionCount: number
  profession?: string
  background?: string
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
  preMortem?: PreMortemResult
  synthesis?: SynthesisResult
  createdAt: string
  completedAt?: string
}

// ── v0.2: フォーカスポイント・越境・議論フェーズ ───────────
// 2026-04-19 研太さん指示: deliberateステージ内で順次+越境+FP動的決定
export interface FocusPoint {
  id: string
  question: string           // フォーカスポイントの問い
  rationale: string          // なぜこの問いが重要か
  options?: string[]         // 選択肢（あれば）
  proposedAt: string         // ISO timestamp
}

export interface FocusPointProposal {
  candidates: FocusPoint[]       // 1件なら自動確定、2-3件ならユーザー選択
  mode: 'auto' | 'user_select'
}

export interface CrossBorderRecord {
  id: string
  fromHat: HatColor              // 越境元（本来発言順ではないエージェント）
  toHat: HatColor                // 越境先（誰の発言に反論しているか）
  level: 'L2' | 'L3'             // 越境品質（L1は出さない）
  content: string                // 越境内容（1文・疑問形が原則）
  reason: string                 // なぜこの越境が必要か
  timestamp: string
}

export type DiscussionPhase = 'pre_focus' | 'focused' | 'converging'

// ── v0.3: コンフリクト線（AvatarField蓄積用） ──────────────
// 2026-04-19 決定: 深のTOC設計に基づき「コンフリクト線のみ」を記録
// 3条件: ①明示的参照 ②異なる結論 ③L2以上の品質
export interface ConflictEdge {
  id: string
  fromHat: HatColor      // 越境元（反論を投げたエージェント）
  toHat: HatColor        // 越境先（反論された発言の主）
  level: 'L2' | 'L3'     // L1は線を引かない
  content: string        // 越境内容
  reason: string         // なぜ反論するか
  timestamp: string
  // 影響度計算用: 後続エージェントがこのエッジを参照した回数
  referencedCount: number
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
  // v0.2 追加
  | 'focus:proposed'          // 叡がフォーカスポイント候補を提示
  | 'focus:decided'           // フォーカスポイント確定（auto or user_select）
  | 'phase:transition'        // 議論フェーズ移行
  | 'cross_border:triggered'  // 越境発生

export interface SSEEvent {
  type: SSEEventType
  stage?: PipelineStage
  hat?: HatColor
  data: unknown
  timestamp: string
  // v0.2 追加フィールド
  focusProposal?: FocusPointProposal    // focus:proposed で使用
  focusPoint?: FocusPoint               // focus:decided で使用
  phase?: DiscussionPhase               // phase:transition で使用
  crossBorder?: CrossBorderRecord       // cross_border:triggered で使用
}
