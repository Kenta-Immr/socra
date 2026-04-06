import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// セッション型
export interface SessionData {
  id?: string
  question: string
  locale: string
  rounds: unknown[]
  created_at?: string
  updated_at?: string
}

// セッション保存
export async function saveSession(data: Omit<SessionData, 'id' | 'created_at' | 'updated_at'>): Promise<string | null> {
  const { data: result, error } = await supabase
    .from('sessions')
    .insert(data)
    .select('id')
    .single()

  if (error) {
    console.error('Failed to save session:', error)
    return null
  }
  return result.id
}

// セッション更新（ラウンド追加）
export async function updateSession(id: string, rounds: unknown[]): Promise<boolean> {
  const { error } = await supabase
    .from('sessions')
    .update({ rounds, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('Failed to update session:', error)
    return false
  }
  return true
}

// セッション読み込み
export async function loadSession(id: string): Promise<SessionData | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Failed to load session:', error)
    return null
  }
  return data
}
