// Socra 型定義

export type NodeType = 'question' | 'answer' | 'insight' | 'branch'
export type EdgeType = 'leads_to' | 'contradicts' | 'supports' | 'deepens'
export type SessionStatus = 'active' | 'completed' | 'archived'
export type MessageRole = 'user' | 'assistant' | 'system'
export type ModelProvider = 'claude' | 'gpt' | 'gemini'

export interface Session {
  id: string
  user_id: string
  title: string
  topic: string | null
  status: SessionStatus
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  session_id: string
  role: MessageRole
  content: string
  model: ModelProvider
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface ThoughtNode {
  id: string
  session_id: string
  parent_id: string | null
  content: string
  node_type: NodeType
  position_x: number
  position_y: number
  depth: number
  created_at: string
}

export interface ThoughtEdge {
  id: string
  session_id: string
  source_id: string
  target_id: string
  edge_type: EdgeType
  created_at: string
}
