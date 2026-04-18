// AI プロバイダー統一ラッパー（Vercel AI SDK v4）
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'

// モデル定義 — 2026-04-18 更新
// - Sonnet 4 (2025-05-14) は 2026-06-15 廃止 → Sonnet 4.6 へ
// - GPT-4o (旧世代) → GPT-5.4 Standard へ（Intelligence 57, 1M context）
// - 統合（叡）は最重要ステージのため Opus 4.7 に格上げ
// - 観察（明）は Gemini 2.5 Flash 維持（コスト・速度優先）
export const models = {
  // Stage 0: 構造化 — Claude Sonnet 4.6
  structure: anthropic('claude-sonnet-4-6'),
  // Stage 1: 白/観（明）— Gemini 2.5 Flash（事実収集・速度優先）
  observe: google('gemini-2.5-flash'),
  // Stage 2: 赤・黒・黄・緑（情/戒/光/創）— Claude Sonnet 4.6 ×4 並列判断
  red: anthropic('claude-sonnet-4-6'),
  black: anthropic('claude-sonnet-4-6'),
  yellow: anthropic('claude-sonnet-4-6'),
  green: anthropic('claude-sonnet-4-6'),
  // Stage 3: 理 — GPT-5.4 Standard（論理検証・Intelligence 57）
  verify: openai('gpt-5.4'),
  // Stage 4: 青/統合（叡）— Claude Opus 4.7（最重要ステージ・最高推論）
  synthesize: anthropic('claude-opus-4-7'),
} as const
