// セーフティフィルター — 危機的状況の検出と専門機関への接続

const CRISIS_KEYWORDS = [
  // 日本語
  '死にたい', '自殺', '死のう', '殺してほしい', '死んでしまいたい', '生きていたくない',
  '命を絶つ', '首を吊る', '飛び降り', '練炭', '死ぬ方法', '遺書',
  // English
  'suicide', 'kill myself', 'want to die', 'end my life', 'take my own life',
  'suicidal', 'no reason to live', 'better off dead',
  // 中文
  '自杀', '不想活', '想死', '结束生命',
  // Español
  'suicidio', 'quiero morir', 'matarme', 'no quiero vivir',
]

export function detectCrisis(text: string): boolean {
  const lower = text.toLowerCase()
  return CRISIS_KEYWORDS.some(kw => lower.includes(kw))
}

export interface CrisisResponse {
  type: 'crisis'
  message: string
  helplines: { name: string; number: string; url?: string }[]
}

export function getCrisisResponse(locale?: string): CrisisResponse {
  const helplines: Record<string, { name: string; number: string; url?: string }[]> = {
    ja: [
      { name: 'いのちの電話', number: '0120-783-556', url: 'https://www.inochinodenwa.org/' },
      { name: 'よりそいホットライン', number: '0120-279-338', url: 'https://yorisoi-chat.jp/' },
      { name: 'こころの健康相談統一ダイヤル', number: '0570-064-556' },
    ],
    en: [
      { name: 'National Suicide Prevention Lifeline (US)', number: '988', url: 'https://988lifeline.org/' },
      { name: 'Crisis Text Line', number: 'Text HOME to 741741', url: 'https://www.crisistextline.org/' },
      { name: 'Samaritans (UK)', number: '116 123', url: 'https://www.samaritans.org/' },
    ],
    zh: [
      { name: '北京心理危机研究与干预中心', number: '010-82951332' },
      { name: '全国心理援助热线', number: '400-161-9995' },
    ],
    es: [
      { name: 'Teléfono de la Esperanza (España)', number: '717 003 717' },
      { name: 'Línea de la Vida (México)', number: '800 911 2000' },
    ],
  }

  const messages: Record<string, string> = {
    ja: 'あなたの気持ちは大切です。Socraは意思決定支援ツールであり、命に関わる問題には専門の相談窓口をご利用ください。今すぐ、下記に連絡してください。あなたは一人ではありません。',
    en: 'Your feelings matter. Socra is a decision-support tool and is not equipped to help with crisis situations. Please reach out to a professional helpline immediately. You are not alone.',
    zh: '您的感受很重要。Socra是一个决策支持工具，无法处理危机情况。请立即联系专业求助热线。您并不孤单。',
    es: 'Tus sentimientos importan. Socra es una herramienta de apoyo a la toma de decisiones y no está preparada para situaciones de crisis. Por favor, contacta una línea de ayuda profesional inmediatamente. No estás solo/a.',
  }

  const lang = locale && ['ja', 'en', 'zh', 'es'].includes(locale) ? locale : 'en'

  return {
    type: 'crisis',
    message: messages[lang],
    helplines: helplines[lang],
  }
}
