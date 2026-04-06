# セッション保存設計メモ（W3実装予定）

## テーブル設計（Supabase）
```sql
sessions (id uuid PK, created_at timestamptz, title text, initial_context jsonb)
messages (id uuid PK, session_id uuid FK, role text, content text, created_at timestamptz)
agent_responses (id uuid PK, session_id uuid FK, stage text, agent_name text, hat text, content text, created_at timestamptz)
```

## 方針
- 自動保存（Stage完了時にバッチINSERT）
- URL共有: `?session=uuid`
- 認証: W3でRLS有効化必須
- 長期的価値: 過去の思考プロセスの振り返り = 個人版CRT
