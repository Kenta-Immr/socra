// AI プロバイダー統一ラッパー（Vercel AI SDK v4）
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'

// モデル定義 — v3設計に基づく割り当て
export const models = {
  // Stage 0: 構造化 — Claude
  structure: anthropic('claude-sonnet-4-20250514'),
  // Stage 1: 白/観 — Gemini（事実収集）
  observe: google('gemini-2.5-flash'),
  // Stage 2: 赤・黒・黄・緑 — Claude ×4（並列判断）
  red: anthropic('claude-sonnet-4-20250514'),
  black: anthropic('claude-sonnet-4-20250514'),
  yellow: anthropic('claude-sonnet-4-20250514'),
  green: anthropic('claude-sonnet-4-20250514'),
  // Stage 3: 論 — GPT-4o（検証）
  verify: openai('gpt-4o'),
  // Stage 4: 青/統合 — Claude
  synthesize: anthropic('claude-sonnet-4-20250514'),
} as const
