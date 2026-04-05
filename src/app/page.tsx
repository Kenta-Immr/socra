'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePipeline, type TimelineEntry } from '@/lib/usePipeline'
import { AGENTS } from '@/types'
import type { HatColor } from '@/types'
import { useTheme } from '@/hooks/useTheme'

// ── 色ヘルパー ───────────────────────────────────────
function hatColor(hat?: string): string {
  if (!hat) return '#6B7280'
  const agent = AGENTS[hat as HatColor | 'verify']
  return agent?.hex ?? '#6B7280'
}

function stanceLabel(stance?: string): { icon: string; color: string; text: string } {
  if (stance === 'support') return { icon: '▲', color: '#22C55E', text: 'Support' }
  if (stance === 'oppose') return { icon: '▼', color: '#EF4444', text: 'Oppose' }
  if (stance === 'caution') return { icon: '◆', color: '#F59E0B', text: 'Caution' }
  return { icon: '', color: '#6B7280', text: '' }
}

// ── メインページ（1カラム・チャットストリーム型） ──────
export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null)
  const pipeline = usePipeline()
  const { theme, toggle: toggleTheme } = useTheme()
  const streamEndRef = useRef<HTMLDivElement>(null)

  // 文脈収集
  type ContextPhase = 'idle' | 'asking' | 'done'
  const [contextPhase, setContextPhase] = useState<ContextPhase>('idle')
  const [originalQuestion, setOriginalQuestion] = useState('')
  const [contextQuestions, setContextQuestions] = useState<string[]>([])
  const [contextAnswers, setContextAnswers] = useState<string[]>([])
  const [currentContextQ, setCurrentContextQ] = useState(0)
  const [loadingContextQs, setLoadingContextQs] = useState(false)

  // セッション
  const [sessionContext, setSessionContext] = useState('')
  const [sessionHistory, setSessionHistory] = useState<string[]>([])
  const [, setCurrentRound] = useState(0)

  // エージェント詳細の展開状態
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [pipeline.timeline.length, pipeline.status])

  useEffect(() => {
    if (pipeline.status === 'complete') {
      const summaryParts: string[] = []
      if (pipeline.structured) summaryParts.push(`Question: ${pipeline.structured.clarified}`)
      if (pipeline.synthesis) summaryParts.push(`Ei: ${pipeline.synthesis.recommendation.slice(0, 300)}`)
      pipeline.agents.forEach(a => summaryParts.push(`${a.name}(${a.stance}): ${a.reasoning.slice(0, 100)}`))
      setSessionHistory(prev => [...prev, summaryParts.join('\n')])
      setCurrentRound(prev => prev + 1)
    }
  }, [pipeline.status, pipeline.structured, pipeline.synthesis, pipeline.agents])

  // ── 送信ハンドラー ────────────────────────────
  async function handleInitialSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = inputRef.current?.value?.trim()
    if (!q || pipeline.status === 'running' || contextPhase === 'asking') return
    setOriginalQuestion(q)
    if (inputRef.current) inputRef.current.value = ''
    setContextPhase('asking')
    setContextAnswers([])
    setCurrentContextQ(0)
    setLoadingContextQs(true)
    try {
      const res = await fetch('/api/context-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      const questions = data.questions ?? []
      if (questions.length === 0 || data.error) {
        setContextPhase('done')
        pipeline.run(q)
      } else {
        setContextQuestions(questions)
      }
    } catch {
      setContextPhase('done')
      pipeline.run(q)
    } finally {
      setLoadingContextQs(false)
    }
  }

  function handleContextAnswer(e: React.FormEvent) {
    e.preventDefault()
    const answer = inputRef.current?.value?.trim()
    if (!answer) return
    const newAnswers = [...contextAnswers, answer]
    setContextAnswers(newAnswers)
    if (inputRef.current) inputRef.current.value = ''
    if (currentContextQ + 1 >= contextQuestions.length) {
      setContextPhase('done')
      const contextStr = contextQuestions.map((q, i) => `Q: ${q}\nA: ${newAnswers[i]}`).join('\n\n')
      setSessionContext(contextStr)
      pipeline.run(originalQuestion, contextStr)
    } else {
      setCurrentContextQ(prev => prev + 1)
    }
  }

  function handleSkipContext() {
    setContextPhase('done')
    const contextStr = contextAnswers.length > 0
      ? contextQuestions.slice(0, contextAnswers.length).map((q, i) => `Q: ${q}\nA: ${contextAnswers[i]}`).join('\n\n')
      : ''
    if (contextStr) setSessionContext(contextStr)
    pipeline.run(originalQuestion, contextStr)
  }

  function handleFollowUp(e: React.FormEvent) {
    e.preventDefault()
    const q = inputRef.current?.value?.trim()
    if (!q || pipeline.status === 'running') return
    if (inputRef.current) inputRef.current.value = ''
    const historyStr = sessionHistory.length > 0
      ? `\n\n## Previous conversation:\n${sessionHistory.join('\n---\n')}`
      : ''
    setOriginalQuestion(q)
    pipeline.run(q, `${sessionContext}${historyStr}`)
  }

  function handleSubmit(e: React.FormEvent) {
    if (contextPhase === 'asking') handleContextAnswer(e)
    else if (pipeline.status === 'complete' || pipeline.status === 'error') handleFollowUp(e)
    else handleInitialSubmit(e)
  }

  const toggleExpand = useCallback((id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── レンダリング ──────────────────────────────
  return (
    <main className="flex flex-col h-screen" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Socra</h1>
          <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Think alone. Decide together.</p>
        </div>
        <div className="flex items-center gap-3">
          {pipeline.status === 'running' && pipeline.currentStage && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
              <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {pipeline.currentStage === 'structure' ? 'Structuring...'
                  : pipeline.currentStage === 'observe' ? 'Mei gathering facts...'
                  : pipeline.currentStage === 'deliberate' ? 'Team thinking...'
                  : pipeline.currentStage === 'verify' ? 'Ri checking logic...'
                  : 'Ei synthesizing...'}
              </span>
            </div>
          )}
          <button onClick={toggleTheme} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)]">
            <span className="text-sm">{theme === 'dark' ? '☀' : '☽'}</span>
          </button>
        </div>
      </header>

      {/* ストリーム（1カラム） */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">

          {/* 初期状態 */}
          {pipeline.status === 'idle' && contextPhase === 'idle' && pipeline.timeline.length === 0 && (
            <div className="text-center py-20 space-y-4">
              <div className="text-4xl font-bold tracking-tighter bg-gradient-to-b from-[var(--text-primary)] to-[var(--text-faint)] bg-clip-text text-transparent">
                Socra
              </div>
              <p className="text-sm" style={{ color: 'var(--text-faint)' }}>7 perspectives. One clear path.</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {(['white', 'red', 'black', 'yellow', 'green', 'verify', 'blue'] as const).map(key => {
                  const agent = AGENTS[key]
                  return (
                    <div key={key} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: agent.hex }} />
                      <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{agent.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 文脈質問 */}
          {contextPhase === 'asking' && !loadingContextQs && contextQuestions.length > 0 && (
            <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: AGENTS.blue.hex }} />
                <span className="text-xs font-medium" style={{ color: AGENTS.blue.hex }}>Ei asks ({currentContextQ + 1}/{contextQuestions.length})</span>
              </div>
              <p className="text-sm leading-relaxed">{contextQuestions[currentContextQ]}</p>
              {contextAnswers.length > 0 && (
                <div className="mt-3 space-y-1 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  {contextAnswers.map((a, i) => (
                    <p key={i} className="text-xs pl-3 border-l-2" style={{ borderColor: 'var(--border-input)', color: 'var(--text-muted)' }}>
                      <span className="font-medium">Q{i + 1}:</span> {a}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          {loadingContextQs && (
            <div className="flex items-center gap-2 p-4 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
              <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Ei is preparing questions...</span>
            </div>
          )}

          {/* タイムラインストリーム */}
          {pipeline.timeline.map((entry) => (
            <StreamEntry
              key={entry.id}
              entry={entry}
              pipeline={pipeline}
              expanded={expandedEntries.has(entry.id)}
              onToggle={() => toggleExpand(entry.id)}
            />
          ))}

          {/* エラー */}
          {pipeline.error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {pipeline.error}
            </div>
          )}

          <div ref={streamEndRef} />
        </div>
      </div>

      {/* 入力（画面下部固定） */}
      <div className="border-t px-6 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            ref={inputRef}
            placeholder={
              contextPhase === 'asking' ? 'Your answer...'
              : pipeline.status === 'complete' ? 'Ask a follow-up to deepen your thinking...'
              : 'What decision are you facing?'
            }
            disabled={pipeline.status === 'running' || loadingContextQs}
            className="flex-1 px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:border-[#3B82F6] transition-colors disabled:opacity-50"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-input)', color: 'var(--text-primary)' }}
          />
          <button
            type="submit"
            disabled={pipeline.status === 'running' || loadingContextQs}
            className="px-5 py-2.5 rounded-xl bg-[#3B82F6] text-white text-sm font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-30"
          >
            {pipeline.status === 'running' ? '...'
              : contextPhase === 'asking' ? 'Answer'
              : pipeline.status === 'complete' ? 'Follow up'
              : 'Ask'}
          </button>
          {contextPhase === 'asking' && (
            <button type="button" onClick={handleSkipContext}
              className="px-3 py-2.5 rounded-xl text-xs hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-dim)' }}>
              Skip
            </button>
          )}
        </form>
      </div>
    </main>
  )
}

// ── ストリームエントリー ─────────────────────────────────
function StreamEntry({ entry, pipeline, expanded, onToggle }: {
  entry: TimelineEntry
  pipeline: ReturnType<typeof usePipeline>
  expanded: boolean
  onToggle: () => void
}) {
  // ユーザーの質問
  if (entry.type === 'user') {
    return (
      <div className="flex items-start gap-3 py-2">
        <div className="w-8 h-8 rounded-full bg-[#8B5CF6]/20 flex items-center justify-center flex-shrink-0">
          <span className="text-xs text-[#8B5CF6] font-bold">You</span>
        </div>
        <p className="text-sm font-medium pt-1.5">{entry.content}</p>
      </div>
    )
  }

  // システムメッセージ（ステージ開始）
  if (entry.type === 'system') {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--text-ghost)' }} />
        <span className="text-[11px]" style={{ color: 'var(--text-ghost)' }}>{entry.content}</span>
      </div>
    )
  }

  // エージェント発言（段階的開示: 1行要約 → クリックで全文）
  if (entry.type === 'agent') {
    const color = hatColor(entry.hat)
    const stance = stanceLabel(entry.stance)
    const agent = entry.hat ? AGENTS[entry.hat as HatColor | 'verify'] : null
    const fullAgent = pipeline.agents.find(a => a.hat === entry.hat)

    return (
      <div
        className="rounded-xl border transition-all cursor-pointer hover:shadow-sm"
        style={{ borderColor: `${color}33`, borderLeftWidth: '3px', borderLeftColor: color }}
        onClick={onToggle}
      >
        <div className="px-4 py-3">
          {/* ヘッダー: 名前 + スタンス */}
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs font-semibold" style={{ color }}>{entry.name}</span>
            {agent && <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{agent.label}</span>}
            {entry.stance && (
              <span className="text-[10px] ml-auto font-medium" style={{ color: stance.color }}>
                {stance.icon} {stance.text} {entry.intensity}/5
              </span>
            )}
          </div>

          {/* 1行要約（常に表示） */}
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {expanded ? entry.content : `${entry.content.slice(0, 100)}...`}
          </p>

          {/* 展開時: キーポイント */}
          {expanded && fullAgent && (
            <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>Key Points</p>
              {fullAgent.keyPoints.map((kp, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{kp}</p>
                </div>
              ))}
            </div>
          )}

          {!expanded && (
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-ghost)' }}>Click to expand</p>
          )}
        </div>
      </div>
    )
  }

  // 叡の統合（メンター — 視覚的に区別）
  if (entry.type === 'synthesis') {
    const synthesis = pipeline.synthesis
    if (!synthesis) return null

    // 最初の1文と残りを分離
    const lines = synthesis.recommendation.split('\n').filter(l => l.trim())
    const firstLine = lines[0] ?? ''
    const rest = lines.slice(1)

    return (
      <div className="rounded-xl border-2 p-5 mt-2" style={{ borderColor: AGENTS.blue.hex, background: `${AGENTS.blue.hex}08` }}>
        {/* メンターヘッダー */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${AGENTS.blue.hex}20` }}>
            <span className="text-sm font-bold" style={{ color: AGENTS.blue.hex }}>叡</span>
          </div>
          <div>
            <span className="text-sm font-semibold" style={{ color: AGENTS.blue.hex }}>Ei — Mentor</span>
            <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Synthesis of all perspectives</p>
          </div>
        </div>

        {/* 核心の1文（大きく表示） */}
        <p className="text-base font-medium leading-relaxed mb-4">{firstLine}</p>

        {/* 詳細（残りのテキスト） */}
        <div className="space-y-2">
          {rest.map((line, i) => {
            if (line.startsWith('##')) return <h3 key={i} className="text-sm font-semibold mt-3">{line.replace(/^#+\s*/, '')}</h3>
            if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="text-sm font-semibold">{line.slice(2, -2)}</p>
            if (line.trim() === '') return null
            return <p key={i} className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{line}</p>
          })}
        </div>

        {/* レーダーチャート */}
        {synthesis.radarChart && (
          <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
            <p className="text-[10px] mb-2" style={{ color: 'var(--text-dim)' }}>
              Team Pattern: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{synthesis.radarChart.pattern}</span>
            </p>
            <div className="space-y-1">
              {synthesis.radarChart.axes.map(axis => (
                <div key={axis.hat} className="flex items-center gap-2">
                  <span className="w-8 text-[10px] text-right" style={{ color: hatColor(axis.hat) }}>{axis.label}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden relative" style={{ background: 'var(--bg-primary)' }}>
                    <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: 'var(--border)' }} />
                    {axis.value > 0 ? (
                      <div className="absolute inset-y-0 left-1/2 rounded-r-full bg-[#22C55E]" style={{ width: `${(axis.value / 5) * 50}%` }} />
                    ) : axis.value < 0 ? (
                      <div className="absolute inset-y-0 rounded-l-full bg-[#EF4444]" style={{ right: '50%', width: `${(Math.abs(axis.value) / 5) * 50}%` }} />
                    ) : null}
                  </div>
                  <span className="w-6 text-[10px] text-right" style={{ color: 'var(--text-dim)' }}>{axis.value > 0 ? '+' : ''}{axis.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 次の一歩の問いかけ */}
        <div className="mt-4 pt-3 border-t text-center" style={{ borderColor: `${AGENTS.blue.hex}30` }}>
          <p className="text-sm font-medium" style={{ color: AGENTS.blue.hex }}>
            What will you do next?
          </p>
        </div>
      </div>
    )
  }

  return null
}
