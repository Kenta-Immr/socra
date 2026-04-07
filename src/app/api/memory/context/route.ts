// メモリコンテキスト取得API — パイプライン実行前に呼ばれる
import { createClient } from '@/lib/supabase/server'
import type { MemoryContext } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ memoryContext: null })
  }

  // 並列取得
  const [profileRes, memoriesRes, vocabRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('profession, background, session_count')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_memory_entries')
      .select('memory_type, content, pattern_note, weight')
      .eq('user_id', user.id)
      .order('weight', { ascending: false })
      .limit(30),
    supabase
      .from('user_vocab')
      .select('word')
      .eq('user_id', user.id)
      .order('frequency', { ascending: false })
      .limit(5),
  ])

  const memories = memoriesRes.data ?? []
  const profile = profileRes.data

  const stuckPatterns = memories
    .filter(m => m.memory_type === 'stuck_pattern')
    .slice(0, 3)
    .map(m => m.pattern_note || m.content)

  const deepReflections = memories
    .filter(m => m.memory_type === 'deep_reflection')
    .slice(0, 3)
    .map(m => m.content)

  const decisions = memories
    .filter(m => m.memory_type === 'decision_made' || m.memory_type === 'decision_deferred')
    .slice(0, 3)
    .map(m => `[${m.memory_type === 'decision_made' ? 'decided' : 'deferred'}] ${m.content}`)

  const vocab = (vocabRes.data ?? []).map(v => v.word)

  const memoryContext: MemoryContext = {
    stuckPatterns,
    deepReflections,
    decisions,
    vocab,
    sessionCount: profile?.session_count ?? 0,
    profession: profile?.profession ?? undefined,
    background: profile?.background ?? undefined,
  }

  return Response.json({ memoryContext })
}
