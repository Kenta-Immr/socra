'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePipeline, type TimelineEntry } from '@/lib/usePipeline'
import { AGENTS } from '@/types'
import type { HatColor } from '@/types'
import { useTheme } from '@/hooks/useTheme'
import dynamic from 'next/dynamic'

const MindMap = dynamic(() => import('@/components/MindMap'), { ssr: false })
import type { MindNode } from '@/components/MindMap'

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

  // マップノード詳細パネル
  const [selectedNode, setSelectedNode] = useState<MindNode | null>(null)

  // モバイルタブ切り替え
  const [mobileTab, setMobileTab] = useState<'chat' | 'map'>('chat')

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [pipeline.timeline.length, pipeline.status])

  // モバイルキーボード表示時に入力欄を見える位置に保つ
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const handleResize = () => {
      const offset = window.innerHeight - vv.height
      document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`)
    }
    vv.addEventListener('resize', handleResize)
    return () => vv.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (pipeline.status === 'complete') {
      const summaryParts: string[] = []
      if (pipeline.structured) summaryParts.push(`Question: ${pipeline.structured.clarified}`)
      if (pipeline.synthesis) summaryParts.push(`Ei: ${pipeline.synthesis.recommendation.slice(0, 300)}`)
      pipeline.agents.forEach(a => summaryParts.push(`${a.name}(${a.stance}): ${a.reasoning.slice(0, 100)}`))
      setSessionHistory(prev => [...prev, summaryParts.join('\n')])
      setCurrentRound(prev => prev + 1)
      // モバイル: 完走時にMapタブへ自動切り替え
      if (window.innerWidth < 768) setMobileTab('map')
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
    <main className="flex flex-col h-[100dvh]" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-4 md:px-6 py-2 md:py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h1 className="text-base md:text-lg font-semibold tracking-tight">Socra</h1>
          <p className="text-[10px] hidden md:block" style={{ color: 'var(--text-faint)' }}>Think alone. Decide together.</p>
        </div>
        <div className="flex items-center gap-3">
          {pipeline.status === 'running' && pipeline.currentStage && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
              <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {pipeline.currentStage === 'structure' ? 'Clarifying your question...'
                  : pipeline.currentStage === 'observe' ? '🔍 Mei — Gathering real-world facts'
                  : pipeline.currentStage === 'deliberate' ? 'Team debating your question...'
                  : pipeline.currentStage === 'verify' ? '⚡ Ri — Checking contradictions'
                  : '🔮 Ei — Weaving all perspectives'}
              </span>
            </div>
          )}
          <button onClick={toggleTheme} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)]">
            <span className="text-sm">{theme === 'dark' ? '☀' : '☽'}</span>
          </button>
        </div>
      </header>

      {/* メインエリア: PC=2ペイン、モバイル=タブ切り替え */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左: チャットストリーム（モバイルではタブで表示/非表示） */}
        <div className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} md:flex w-full md:w-1/3 md:min-w-[360px] md:max-w-[480px] md:border-r flex-col overflow-y-auto`} style={{ borderColor: 'var(--border)' }}>
          <div className="px-4 py-4 space-y-3 flex-1">

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

          {/* 文脈質問（PC用 — モバイルでは入力欄直上に表示） */}
          {contextPhase === 'asking' && !loadingContextQs && contextQuestions.length > 0 && (
            <div className="hidden md:block p-4 rounded-xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
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
            <div className="hidden md:flex items-center gap-2 p-4 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
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

        {/* 右: マインドマップ（PC=常時表示、モバイル=Mapタブ時） */}
        <div className={`${mobileTab === 'map' ? 'flex' : 'hidden'} md:flex flex-1 relative flex-col`} style={{ background: 'var(--bg-map)' }}>
          {(pipeline.status === 'running' || pipeline.status === 'complete') ? (
            <MindMap pipeline={pipeline} fullScreen onNodeClick={setSelectedNode} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <div className="text-3xl font-bold tracking-tighter bg-gradient-to-b from-[var(--text-primary)] to-[var(--text-faint)] bg-clip-text text-transparent">Socra</div>
                <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>Your thinking, visualized</p>
              </div>
            </div>
          )}

          {/* ノード詳細パネル */}
          {selectedNode && (
            <NodeDetailPanel
              node={selectedNode}
              pipeline={pipeline}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </div>
      </div>

      {/* 入力エリア（画面下部固定） */}
      <div className="border-t px-4 md:px-6 py-2 md:py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
        {/* 文脈質問を入力欄の直上に表示（キーボード表示時も質問が見える） */}
        {contextPhase === 'asking' && !loadingContextQs && contextQuestions.length > 0 && (
          <div className="mb-2 p-3 rounded-lg border max-w-3xl md:max-w-[480px]" style={{ background: 'var(--bg-secondary)', borderColor: `${AGENTS.blue.hex}33` }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: AGENTS.blue.hex }} />
              <span className="text-[10px] font-medium" style={{ color: AGENTS.blue.hex }}>Ei asks ({currentContextQ + 1}/{contextQuestions.length})</span>
            </div>
            <p className="text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>{contextQuestions[currentContextQ]}</p>
          </div>
        )}
        {loadingContextQs && (
          <div className="mb-2 flex items-center gap-2 p-3 rounded-lg max-w-3xl md:max-w-[480px]" style={{ background: 'var(--bg-secondary)' }}>
            <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Ei is preparing questions...</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="max-w-3xl md:max-w-[480px] flex gap-2">
          <input
            type="text"
            ref={inputRef}
            placeholder={
              contextPhase === 'asking' ? 'Your answer...'
              : pipeline.status === 'complete' ? 'Follow up to deepen thinking...'
              : 'What decision are you facing?'
            }
            disabled={pipeline.status === 'running' || loadingContextQs}
            className="flex-1 px-3 md:px-4 py-2 md:py-2.5 rounded-xl border text-sm focus:outline-none focus:border-[#3B82F6] transition-colors disabled:opacity-50"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-input)', color: 'var(--text-primary)' }}
          />
          <button
            type="submit"
            disabled={pipeline.status === 'running' || loadingContextQs}
            className="px-4 md:px-5 py-2 md:py-2.5 rounded-xl bg-[#3B82F6] text-white text-sm font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-30"
          >
            {pipeline.status === 'running' ? '...'
              : contextPhase === 'asking' ? 'Answer'
              : pipeline.status === 'complete' ? 'Follow up'
              : 'Ask'}
          </button>
          {contextPhase === 'asking' && (
            <button type="button" onClick={handleSkipContext}
              className="px-3 py-2 rounded-xl text-xs hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-dim)' }}>
              Skip
            </button>
          )}
        </form>
      </div>

      {/* モバイルタブバー（md以上では非表示） */}
      <div className="md:hidden flex border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <button
          onClick={() => setMobileTab('chat')}
          className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors ${mobileTab === 'chat' ? 'text-[#3B82F6]' : ''}`}
          style={{ color: mobileTab === 'chat' ? '#3B82F6' : 'var(--text-dim)', borderTop: mobileTab === 'chat' ? '2px solid #3B82F6' : '2px solid transparent' }}
        >
          💬 Chat
        </button>
        <button
          onClick={() => setMobileTab('map')}
          className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors relative ${mobileTab === 'map' ? 'text-[#3B82F6]' : ''}`}
          style={{ color: mobileTab === 'map' ? '#3B82F6' : 'var(--text-dim)', borderTop: mobileTab === 'map' ? '2px solid #3B82F6' : '2px solid transparent' }}
        >
          🗺️ Map
          {pipeline.status === 'complete' && mobileTab === 'chat' && (
            <span className="absolute top-1.5 right-[calc(50%-24px)] w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
          )}
        </button>
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

  // 明(Mei)の事実 — 特別表示
  if (entry.type === 'agent' && entry.hat === 'white') {
    const color = hatColor(entry.hat)
    const obs = pipeline.observation

    return (
      <div
        className="rounded-xl border transition-all cursor-pointer hover:shadow-sm"
        style={{ borderColor: `${color}33`, borderLeftWidth: '3px', borderLeftColor: color }}
        onClick={onToggle}
      >
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs font-semibold" style={{ color }}>Mei</span>
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Facts</span>
            {obs && (
              <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>
                {obs.facts.length} facts
              </span>
            )}
          </div>

          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{entry.content}</p>

          {/* 展開時: 事実一覧 */}
          {expanded && obs && (
            <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
              {obs.facts.map((fact, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${
                    fact.confidence === 'high' ? 'bg-green-500/20 text-green-600' :
                    fact.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-600' :
                    'bg-gray-500/20 text-gray-500'
                  }`}>{fact.confidence}</span>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fact.content}</p>
                    {fact.url ? (
                      <a href={fact.url} target="_blank" rel="noopener noreferrer" className="text-[10px] hover:underline" style={{ color: 'var(--text-ghost)' }}>
                        {fact.source} ↗
                      </a>
                    ) : (
                      <p className="text-[10px]" style={{ color: 'var(--text-ghost)' }}>{fact.source}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!expanded && (
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-ghost)' }}>Click to see facts</p>
          )}
        </div>
      </div>
    )
  }

  // 理(Ri)の検証結果 — 特別表示
  if (entry.type === 'agent' && entry.hat === 'verify') {
    const color = hatColor(entry.hat)
    const ver = pipeline.verification
    const lines = entry.content.split('\n')
    const consistencyLine = lines[0] ?? ''
    const details = lines.slice(1)

    return (
      <div
        className="rounded-xl border transition-all cursor-pointer hover:shadow-sm"
        style={{ borderColor: `${color}33`, borderLeftWidth: '3px', borderLeftColor: color }}
        onClick={onToggle}
      >
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs font-semibold" style={{ color }}>Ri</span>
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Logic</span>
            {ver && (
              <span className="text-[10px] ml-auto font-medium" style={{
                color: ver.overallConsistency >= 80 ? '#22C55E' : ver.overallConsistency >= 60 ? '#F59E0B' : '#EF4444'
              }}>
                {consistencyLine}
              </span>
            )}
          </div>

          {/* 矛盾・ファクトギャップを常に表示 */}
          {details.length > 0 && (
            <div className="space-y-1.5">
              {details.map((line, i) => (
                <p key={i} className="text-sm leading-relaxed" style={{
                  color: line.startsWith('⚡') ? '#EF4444' : line.startsWith('❓') ? '#F59E0B' : 'var(--text-secondary)'
                }}>
                  {line}
                </p>
              ))}
            </div>
          )}

          {/* 展開時: 詳細 */}
          {expanded && ver && (
            <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
              {ver.contradictions.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-ghost)' }}>Contradictions</p>
                  {ver.contradictions.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        c.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        c.severity === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>{c.severity}</span>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        <span style={{ color: hatColor(c.hat1) }}>{AGENTS[c.hat1]?.name}</span>
                        {' vs '}
                        <span style={{ color: hatColor(c.hat2) }}>{AGENTS[c.hat2]?.name}</span>
                        {': '}{c.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {ver.factGaps.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-ghost)' }}>Fact Gaps</p>
                  {ver.factGaps.map((gap, i) => (
                    <p key={i} className="text-xs pl-2 border-l-2" style={{ borderColor: '#F59E0B', color: 'var(--text-muted)' }}>{gap}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {!expanded && details.length > 0 && (
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-ghost)' }}>Click to see details</p>
          )}
        </div>
      </div>
    )
  }

  // 他のエージェント発言（段階的開示: 1行要約 → クリックで全文）
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

        {/* マインドマップはモバイルではMapタブで表示 */}

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

// ── ノード詳細パネル（マップ上のフローティング） ────────
function NodeDetailPanel({ node, pipeline, onClose }: {
  node: MindNode
  pipeline: ReturnType<typeof usePipeline>
  onClose: () => void
}) {
  const agent = node.hat ? pipeline.agents.find(a => a.hat === node.hat) : null
  const agentInfo = node.hat ? AGENTS[node.hat as HatColor | 'verify'] : null
  const stance = stanceLabel(node.stance)

  return (
    <div className="absolute top-4 right-4 w-80 max-h-[calc(100%-2rem)] overflow-y-auto rounded-xl border shadow-xl animate-in fade-in slide-in-from-right-2 duration-200 z-50"
      style={{ background: 'var(--bg-primary)', borderColor: `${node.color}44` }}>

      {/* ヘッダー */}
      <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b rounded-t-xl" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: node.color }} />
          <span className="text-sm font-semibold" style={{ color: node.color }}>
            {agentInfo?.name ?? (node.type === 'question' || node.type === 'followup' ? 'Question' : node.type === 'synthesis' ? 'Ei' : 'Detail')}
          </span>
          {agentInfo && <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{agentInfo.label}</span>}
        </div>
        <button onClick={onClose} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)]" style={{ color: 'var(--text-dim)' }}>
          <span className="text-xs">✕</span>
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* スタンス + Intensity */}
        {node.stance && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: stance.color }}>{stance.icon} {stance.text}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-dim)' }}>
              Intensity {node.importance}/5
            </span>
          </div>
        )}

        {/* 全文 */}
        {node.fullText && (
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {node.fullText}
          </p>
        )}

        {/* キーポイント（エージェントの場合） */}
        {agent && agent.keyPoints.length > 0 && (
          <div className="pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>Key Points</p>
            {agent.keyPoints.map((kp, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: node.color }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{kp}</p>
              </div>
            ))}
          </div>
        )}

        {/* 統合ノード: nextSteps */}
        {node.type === 'synthesis' && pipeline.synthesis?.nextSteps && (
          <div className="pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>Next Steps</p>
            {pipeline.synthesis.nextSteps.map((step, i) => (
              <p key={i} className="text-xs" style={{ color: 'var(--text-muted)' }}>{step}</p>
            ))}
          </div>
        )}

        {/* 質問ノード: stakeholders, timeHorizon */}
        {(node.type === 'question' || node.type === 'followup') && pipeline.structured && (
          <div className="pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
            {pipeline.structured.stakeholders.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>Stakeholders</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{pipeline.structured.stakeholders.join(', ')}</p>
              </div>
            )}
            {pipeline.structured.timeHorizon && (
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>Time Horizon</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{pipeline.structured.timeHorizon}</p>
              </div>
            )}
          </div>
        )}

        {/* ラウンド情報 */}
        {node.round !== undefined && (
          <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px]" style={{ color: 'var(--text-ghost)' }}>Round {node.round + 1}</p>
          </div>
        )}
      </div>
    </div>
  )
}
