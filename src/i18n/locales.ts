export type Locale = 'en' | 'ja' | 'zh' | 'es'

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  zh: '中文',
  es: 'Español',
}

export const LOCALE_FLAGS: Record<Locale, string> = {
  en: '🇺🇸',
  ja: '🇯🇵',
  zh: '🇨🇳',
  es: '🇪🇸',
}

type Messages = {
  tagline: string
  subtitle: string
  inputPlaceholder: string
  inputPlaceholderContext: string
  inputPlaceholderFollowup: string
  askButton: string
  answerButton: string
  followUpButton: string
  skipButton: string
  tryScenario: string
  scenario1: string
  scenario2: string
  scenario3: string
  mapPlaceholder: string
  mapHint: string
  chatTab: string
  mapTab: string
  eiAsks: string
  eiPreparing: string
  clickToExpand: string
  clickToSeeFacts: string
  clickToSeeDetails: string
  whatWillYouDoNext: string
  legendTitle: string
  support: string
  caution: string
  oppose: string
  contradiction: string
  deepens: string
  round: string
  stageStructure: string
  stageObserve: string
  stageDeliberate: string
  stageVerify: string
  stageSynthesize: string
}

const en: Messages = {
  tagline: 'Think alone. Decide together.',
  subtitle: '7 perspectives. One clear path.',
  inputPlaceholder: 'What decision are you facing?',
  inputPlaceholderContext: 'Your answer...',
  inputPlaceholderFollowup: 'Follow up to deepen thinking...',
  askButton: 'Ask',
  answerButton: 'Answer',
  followUpButton: 'Follow up',
  skipButton: 'Skip',
  tryScenario: 'Try a scenario',
  scenario1: 'Should I leave my stable job to start a business?',
  scenario2: 'Should we invest in AI automation for our factory?',
  scenario3: 'Launch now with basic features or wait for the full version?',
  mapPlaceholder: 'Your thinking, visualized',
  mapHint: 'Ask a question or pick a scenario to begin',
  chatTab: '💬 Chat',
  mapTab: '🗺️ Map',
  eiAsks: 'Ei asks',
  eiPreparing: 'Ei is preparing questions...',
  clickToExpand: 'Click to expand',
  clickToSeeFacts: 'Click to see facts',
  clickToSeeDetails: 'Click to see details',
  whatWillYouDoNext: 'What will you do next?',
  legendTitle: 'Legend',
  support: 'Support',
  caution: 'Caution',
  oppose: 'Oppose',
  contradiction: 'Contradiction',
  deepens: 'Deepens',
  round: 'Round',
  stageStructure: 'Clarifying your question...',
  stageObserve: '🔍 Mei — Gathering real-world facts',
  stageDeliberate: 'Team debating your question...',
  stageVerify: '⚡ Ri — Checking contradictions',
  stageSynthesize: '🔮 Ei — Weaving all perspectives',
}

const ja: Messages = {
  tagline: '一人で考え、みんなで決める。',
  subtitle: '7つの視点。ひとつの明確な道。',
  inputPlaceholder: 'どんな意思決定に直面していますか？',
  inputPlaceholderContext: 'あなたの回答...',
  inputPlaceholderFollowup: 'さらに深く考えるための質問...',
  askButton: '質問する',
  answerButton: '回答する',
  followUpButton: '深掘り',
  skipButton: 'スキップ',
  tryScenario: 'シナリオを試す',
  scenario1: '安定した仕事を辞めて起業すべきか？',
  scenario2: '工場にAI自動化を導入すべきか？',
  scenario3: '基本機能で今すぐリリースか、完全版を待つか？',
  mapPlaceholder: 'あなたの思考を可視化',
  mapHint: '質問を入力するか、シナリオを選んでください',
  chatTab: '💬 チャット',
  mapTab: '🗺️ マップ',
  eiAsks: '叡が質問します',
  eiPreparing: '叡が質問を準備中...',
  clickToExpand: 'クリックで展開',
  clickToSeeFacts: 'クリックで事実を表示',
  clickToSeeDetails: 'クリックで詳細を表示',
  whatWillYouDoNext: 'あなたは次に何をしますか？',
  legendTitle: '凡例',
  support: '賛成',
  caution: '注意',
  oppose: '反対',
  contradiction: '矛盾',
  deepens: '深化',
  round: 'ラウンド',
  stageStructure: '質問を整理中...',
  stageObserve: '🔍 明 — 事実を収集中',
  stageDeliberate: 'チームが議論中...',
  stageVerify: '⚡ 理 — 矛盾をチェック中',
  stageSynthesize: '🔮 叡 — 全体を統合中',
}

const zh: Messages = {
  tagline: '独立思考，共同决策。',
  subtitle: '7个视角，一条清晰路径。',
  inputPlaceholder: '您面临什么决策？',
  inputPlaceholderContext: '您的回答...',
  inputPlaceholderFollowup: '追问以深入思考...',
  askButton: '提问',
  answerButton: '回答',
  followUpButton: '追问',
  skipButton: '跳过',
  tryScenario: '试试这些场景',
  scenario1: '我是否应该辞去稳定工作去创业？',
  scenario2: '我们是否应该为工厂投资AI自动化？',
  scenario3: '现在发布基础版还是等待完整版？',
  mapPlaceholder: '将您的思考可视化',
  mapHint: '输入问题或选择场景开始',
  chatTab: '💬 对话',
  mapTab: '🗺️ 地图',
  eiAsks: '叡在提问',
  eiPreparing: '叡正在准备问题...',
  clickToExpand: '点击展开',
  clickToSeeFacts: '点击查看事实',
  clickToSeeDetails: '点击查看详情',
  whatWillYouDoNext: '你接下来要做什么？',
  legendTitle: '图例',
  support: '支持',
  caution: '谨慎',
  oppose: '反对',
  contradiction: '矛盾',
  deepens: '深化',
  round: '回合',
  stageStructure: '正在整理您的问题...',
  stageObserve: '🔍 明 — 收集真实数据',
  stageDeliberate: '团队正在讨论...',
  stageVerify: '⚡ 理 — 检查矛盾',
  stageSynthesize: '🔮 叡 — 整合所有观点',
}

const es: Messages = {
  tagline: 'Piensa solo. Decide en equipo.',
  subtitle: '7 perspectivas. Un camino claro.',
  inputPlaceholder: '¿Qué decisión enfrentas?',
  inputPlaceholderContext: 'Tu respuesta...',
  inputPlaceholderFollowup: 'Profundiza tu reflexión...',
  askButton: 'Preguntar',
  answerButton: 'Responder',
  followUpButton: 'Profundizar',
  skipButton: 'Omitir',
  tryScenario: 'Prueba un escenario',
  scenario1: '¿Debería dejar mi trabajo estable para emprender?',
  scenario2: '¿Deberíamos invertir en automatización con IA para nuestra fábrica?',
  scenario3: '¿Lanzar ahora con funciones básicas o esperar la versión completa?',
  mapPlaceholder: 'Tu pensamiento, visualizado',
  mapHint: 'Haz una pregunta o elige un escenario para comenzar',
  chatTab: '💬 Chat',
  mapTab: '🗺️ Mapa',
  eiAsks: 'Ei pregunta',
  eiPreparing: 'Ei está preparando preguntas...',
  clickToExpand: 'Clic para expandir',
  clickToSeeFacts: 'Clic para ver hechos',
  clickToSeeDetails: 'Clic para ver detalles',
  whatWillYouDoNext: '¿Qué harás a continuación?',
  legendTitle: 'Leyenda',
  support: 'Apoya',
  caution: 'Precaución',
  oppose: 'Opone',
  contradiction: 'Contradicción',
  deepens: 'Profundiza',
  round: 'Ronda',
  stageStructure: 'Aclarando tu pregunta...',
  stageObserve: '🔍 Mei — Recopilando datos reales',
  stageDeliberate: 'El equipo está debatiendo...',
  stageVerify: '⚡ Ri — Verificando contradicciones',
  stageSynthesize: '🔮 Ei — Integrando todas las perspectivas',
}

const MESSAGES: Record<Locale, Messages> = { en, ja, zh, es }

export function t(locale: Locale): Messages {
  return MESSAGES[locale]
}
