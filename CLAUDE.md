# CLAUDE.md - Socra（AI facilitation tool・凍結中）

> **状態**: 2026-05-19 AI Agent Olympics Hackathon 2026 提出済み → **凍結中**。
> 復帰時は本ファイル + `~/CLAUDE.md`（Home司令塔）+ memory の Socra関連ドキュメントから起点。

---

## プロジェクト概要

- **コンセプト**: "AI that asks, not answers." — 単一回答ではなく **7つの視点** で問いを照らし、決定は使い手に返すSocratic AI
- **哲学**: Edward de Bono + 稲盛和夫「動機善なりか」の融合
- **理念上のオーナー**: Decision Works（律・研太さん共作）
- **ライブデモ**: https://socra-nine.vercel.app
- **GitHub**: `Kenta-Immr/socra`

---

## システム構成

- **フレームワーク**: Next.js 14 (App Router)
- **UI**: D3.js（力学ベースのマインドマップ）+ Tailwind CSS + framer-motion
- **AI パイプライン**: 5段階SSEストリーミング・3プロバイダー並列
  - Anthropic Claude（Opus 4.7 + Sonnet 4.6 + Haiku 4.5）
  - Google Gemini 2.5 Flash（Search Grounding付）
  - OpenAI GPT-5.5
- **DB**: Supabase (`@supabase/ssr` + `@supabase/supabase-js`)
- **バリデーション**: Zod
- **アーキテクチャ**: Agentic engineering — 多様性はモデルではなく **ペルソナ設計** から出る

### 7つの視点（Persona Design が核）

| Agent | Role | Model |
|---|---|---|
| 🔍 明 (Mei) | Facts & Evidence | Gemini 2.5 Flash（Search Grounding）|
| ❤️ 情 (Jo) | Gut Feeling & Values | Claude Sonnet 4.6 |
| ⚫ 戒 (Kai) | Risks & Warnings | Claude Sonnet 4.6 |
| ✨ 光 (Ko) | Opportunities & Optimism | Claude Sonnet 4.6 |
| 🌱 創 (So) | Creative Alternatives | Claude Sonnet 4.6 |
| ⚡ 理 (Ri) | Logic & Contradiction Check | GPT-5.5 |
| 🔮 叡 (Ei) | Synthesis & Mentorship | Claude Opus 4.7 |

---

## 開発起点

```bash
cd ~/dev/socra
npm install
cp .env.local.example .env.local  # APIキー投入
npm run dev
npm run test  # vitest
```

---

## 凍結中の理由と復帰時の起点

- ハッカソン提出完了（`project_socra_hackathon_submitted_20260519`）
- 続きの商用化・機能拡張は保留中
- **復帰時に必ず読むべき memory**:
  - [[project_socra_requirements_v2]]（要件v2）
  - [[project_socra_architecture_v3]]（アーキテクチャv3）
  - [[project_socra_agents_naming]]（7エージェント命名の意図）
  - [[project_socra_experience_principles]]（体験設計原則）
  - [[project_socra_avatar_spec]]（アバター仕様）
  - [[project_socra_core_insight]] [[project_socra_dw_philosophy_extraction]] [[project_socra_origin_story]]
  - [[project_socra_30percent_insight]] [[project_ai_facilitation_vision]]
  - [[feedback_socra_diversity_level3]]（多様性設計の教訓）

---

## Socra 固有の設計原則（凍結解除しても守る）

- **多様性はペルソナ設計から出る**（モデル切替は補助・詳細は [[feedback_socra_diversity_level3]]）
- **叡（Ei）は答えを出さない**。統合と "What will YOU do next?" の問い返しのみ
- **理（Ri）の役割は論理矛盾検出**。GPT-5.5 を使う理由はここ（詳細 [[project_socra_agents_naming]]）
- **D3の力学レイアウトが体験の核**。差替はUXの再設計になる

---

## 復帰時の第一手

1. `git status` と `git log --oneline -20` で最終コミット確認
2. 上記memoryを順に読み、当時の設計意図を取り戻す
3. `.env.local` のAPIキー有効期限・料金プランを確認
4. `npm run dev` で起動 → 3プロバイダー全部で応答が戻るか実確認
5. Live Demo (`socra-nine.vercel.app`) と比較して現状把握

---

## 関連
- `~/.claude/CLAUDE.md`（グローバル律）／`~/.claude/rules/`（全ルール）
- `~/CLAUDE.md`（Home司令塔）
- README.md（プロジェクト公式紹介）
