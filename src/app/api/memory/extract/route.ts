// メモリ自動抽出API — パイプライン完了後に非同期で呼ばれる
import { createClient } from '@/lib/supabase/server'

const STUCK_KEYWORDS = [
  'わかりません', 'わからない', '迷って', '迷う', 'どちらも', 'どれも',
  '難しい', '決められない', 'confused', "don't know", "not sure", 'hard to decide',
]

const DECISION_KEYWORDS = [
  'にします', 'を選び', 'に決め', 'やります', 'いきます', 'にする',
  "I'll go with", "I choose", "I've decided", "let's go with",
]

const DEFER_KEYWORDS = [
  'まだ決められない', '保留', 'もう少し考え', '後で',
  'not yet', 'hold off', 'need more time', 'later',
]

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { sessionId, userMessages, question } = await req.json()

  if (!sessionId || !userMessages || !Array.isArray(userMessages)) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const entries: Array<{
    user_id: string
    session_id: string
    memory_type: string
    content: string
    pattern_note: string | null
    question_context: string
    weight: number
  }> = []

  // メッセージ長の平均を計算
  const avgLen = userMessages.reduce((sum: number, m: string) => sum + m.length, 0) / (userMessages.length || 1)

  for (const msg of userMessages) {
    const msgStr = String(msg)

    // stuck_pattern 検出
    if (STUCK_KEYWORDS.some(kw => msgStr.includes(kw))) {
      entries.push({
        user_id: user.id,
        session_id: sessionId,
        memory_type: 'stuck_pattern',
        content: msgStr.slice(0, 500),
        pattern_note: `「${msgStr.slice(0, 50)}...」— 決断に迷いが見られる`,
        question_context: question,
        weight: 1,
      })
    }

    // deep_reflection 検出（平均の1.5倍以上の長さ）
    if (msgStr.length > avgLen * 1.5 && msgStr.length > 100) {
      entries.push({
        user_id: user.id,
        session_id: sessionId,
        memory_type: 'deep_reflection',
        content: msgStr.slice(0, 500),
        pattern_note: null,
        question_context: question,
        weight: 1,
      })
    }

    // decision_made 検出
    if (DECISION_KEYWORDS.some(kw => msgStr.includes(kw))) {
      entries.push({
        user_id: user.id,
        session_id: sessionId,
        memory_type: 'decision_made',
        content: msgStr.slice(0, 500),
        pattern_note: null,
        question_context: question,
        weight: 1,
      })
    }

    // decision_deferred 検出
    if (DEFER_KEYWORDS.some(kw => msgStr.includes(kw))) {
      entries.push({
        user_id: user.id,
        session_id: sessionId,
        memory_type: 'decision_deferred',
        content: msgStr.slice(0, 500),
        pattern_note: null,
        question_context: question,
        weight: 1,
      })
    }
  }

  // DB保存
  if (entries.length > 0) {
    await supabase.from('user_memory_entries').insert(entries)
  }

  // session_count インクリメント（upsertで対応）
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('session_count')
    .eq('id', user.id)
    .single()

  if (profile) {
    await supabase
      .from('user_profiles')
      .update({ session_count: (profile.session_count ?? 0) + 1 })
      .eq('id', user.id)
  } else {
    await supabase
      .from('user_profiles')
      .insert({ id: user.id, session_count: 1 })
  }

  return Response.json({ extracted: entries.length })
}
