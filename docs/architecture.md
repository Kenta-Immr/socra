# Socra — 技術設計書

> AI that asks, not answers.
> 考えるとき、画面が思考になる。

## 1. システム概要

Socraは「問いの力」で思考を拡張するAIファシリテーションシステム。
ソクラテス式問答法をベースに、ユーザーの思考プロセスを可視化し、
マルチLLMオーケストレーションで最適な「問い」を生成する。

## 2. アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│                    Frontend                      │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │  Thought Space   │  │   Chat Sidebar      │  │
│  │  (Canvas/Framer) │  │   (Streaming)       │  │
│  │                  │  │                     │  │
│  │  ノード配置      │  │  会話タイムライン    │  │
│  │  関係線          │  │  問い生成           │  │
│  │  アニメーション   │  │  モデル選択         │  │
│  └──────────────────┘  └─────────────────────┘  │
└────────────────────┬────────────────────────────┘
                     │ Vercel AI SDK (streaming)
                     ▼
┌─────────────────────────────────────────────────┐
│                  Backend (API Routes)            │
│  ┌─────────────────────────────────────────┐    │
│  │         Facilitation Engine              │    │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐  │    │
│  │  │ Claude  │ │  GPT    │ │ Gemini   │  │    │
│  │  │(深い問い)│ │(多角的) │ │(広い視野)│  │    │
│  │  └─────────┘ └─────────┘ └──────────┘  │    │
│  └─────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│              Supabase                            │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │  Auth    │ │ Sessions │ │ Thought Trees  │  │
│  │ (OAuth)  │ │ (会話)   │ │ (思考ノード)   │  │
│  └──────────┘ └──────────┘ └────────────────┘  │
└─────────────────────────────────────────────────┘
```

## 3. データモデル

### sessions（セッション/会話）
| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| title | text | セッションタイトル（自動生成） |
| topic | text | 議題・テーマ |
| status | text | active / completed / archived |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

### messages（チャットメッセージ）
| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK → sessions |
| role | text | user / assistant / system |
| content | text | メッセージ本文 |
| model | text | claude / gpt / gemini |
| metadata | jsonb | トークン数・レイテンシ等 |
| created_at | timestamptz | 作成日時 |

### thought_nodes（思考空間ノード）
| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK → sessions |
| parent_id | uuid | FK → thought_nodes（nullable） |
| content | text | ノードの内容（問い or 回答の要約） |
| node_type | text | question / answer / insight / branch |
| position_x | float | Canvas上のX座標 |
| position_y | float | Canvas上のY座標 |
| depth | int | ツリーの深さ（0=ルート） |
| created_at | timestamptz | 作成日時 |

### thought_edges（ノード間の関係）
| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK → sessions |
| source_id | uuid | FK → thought_nodes |
| target_id | uuid | FK → thought_nodes |
| edge_type | text | leads_to / contradicts / supports / deepens |
| created_at | timestamptz | 作成日時 |

## 4. Facilitation Engine（核心ロジック）

### 問いの生成戦略
LLMは「答え」ではなく「次の問い」を生成する。

```
システムプロンプト:
- あなたはソクラテス式のファシリテーター
- 答えを与えず、問いで思考を深める
- ユーザーの前提を揺さぶる
- 思考の盲点を照らす
- 1回の応答で問いは1-2個まで（認知負荷を考慮）
```

### マルチLLMオーケストレーション
| モデル | 役割 | いつ使うか |
|---|---|---|
| Claude | 深い問い・哲学的問い | デフォルト。思考を深掘りしたいとき |
| GPT | 多角的な視点・具体例 | 視野を広げたいとき |
| Gemini | 情報探索・知識接続 | 事実や文脈を補完したいとき |

MVP（W2）ではClaude単体。W3でGPT/Gemini追加。

## 5. UI設計方針

### Thought Space（メイン画面）
- 深紺の背景に白いノードが浮かぶ
- ノードはドラッグ可能、自動レイアウト（force-directed）
- 新しい問いが生まれるとアニメーションで展開
- ズーム・パンで思考の全体像を俯瞰

### Chat Sidebar（右サイド）
- 幅 350px、折りたたみ可能
- ストリーミング表示（Vercel AI SDK useChat）
- モデル切替UI（アイコン3つ）

### カラーパレット
- Background: #0f172a（深紺）
- Node: #ffffff（白）
- Accent: #3b82f6（青）
- Question node: #f59e0b（琥珀）
- Edge: #475569（スレートグレー）

## 6. ディレクトリ構造

```
src/
├── app/
│   ├── layout.tsx          # ルートレイアウト
│   ├── page.tsx            # ランディング / セッション一覧
│   ├── session/[id]/
│   │   └── page.tsx        # メイン画面（ThoughtSpace + Chat）
│   └── api/
│       ├── chat/
│       │   └── route.ts    # チャットAPI（ストリーミング）
│       └── auth/
│           └── callback/
│               └── route.ts # Supabase OAuth callback
├── components/
│   ├── thought-space/
│   │   ├── ThoughtSpace.tsx    # Canvas + ノード管理
│   │   ├── ThoughtNode.tsx     # 個別ノード
│   │   └── ThoughtEdge.tsx     # ノード間の線
│   ├── chat/
│   │   ├── ChatSidebar.tsx     # サイドバー全体
│   │   ├── ChatMessage.tsx     # メッセージ単体
│   │   └── ModelSelector.tsx   # LLM切替
│   └── ui/
│       └── ...                 # 共通UIコンポーネント
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # ブラウザ用クライアント
│   │   └── server.ts           # サーバー用クライアント
│   ├── facilitation.ts         # 問い生成ロジック
│   └── thought-graph.ts        # ノード・エッジ管理
├── hooks/
│   ├── useThoughtSpace.ts      # 思考空間状態管理
│   └── useSession.ts           # セッション管理
└── types/
    └── index.ts                # 型定義
```

## 7. 開発フェーズ

| フェーズ | 内容 | 期間 |
|---|---|---|
| W1 | 技術設計（本ドキュメント）+ 初期セットアップ | 4/6-4/9 |
| W2 | チャット基盤 + Claude単体MVP + Supabase認証 | 4/10-4/16 |
| W3 | 思考空間UI + Docker + マルチLLM | 4/17-4/23 |
| W4 | Before/After + 画像対応 + ドライラン | 4/24-4/30 |
| W5 | GW集中: Vultr + ピッチ完成 | 5/1-5/7 |
| W6 | 動画撮影 + 最終調整 | 5/8-5/12 |
