'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePipeline, type TimelineEntry } from '@/lib/usePipeline'
import { AGENTS } from '@/types'
import type { HatColor } from '@/types'
import DecisionMap from '@/components/DecisionMap'
import { useTheme } from '@/hooks/useTheme'

// ── 色ヘルパー ───────────────────────────────────────
function hatColor(hat?: string): string {
  if (!hat) return '#6B7280'
  const agent = AGENTS[hat as HatColor | 'verify']
  return agent?.hex ?? '#6B7280'
}

function stanceIcon(stance?: string): string {
  if (stance === 'support') return '▲'
  if (stance === 'oppose') return '▼'
  if (stance === 'caution') return '◆'
  return ''
}

function stanceColor(stance?: string): string {
  if (stance === 'support') return '#22C55E'
  if (stance === 'oppose') return '#EF4444'
  if (stance === 'caution') return '#F59E0B'
  return '#6B7280'
}

// ── メインページ ──────────────────────────────────────
export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null)
  const pipeline = usePipeline()
  const { theme, toggle: toggleTheme } = useTheme()
  const timelineEndRef = useRef<HTMLDivElement>(null)
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  // Stage 0 対話型: 文脈収集フェーズ
  type ContextPhase = 'idle' | 'asking' | 'done'
  const [contextPhase, setContextPhase] = useState<ContextPhase>('idle')
  const [originalQuestion, setOriginalQuestion] = useState('')
  const [contextQuestions, setContextQuestions] = useState<string[]>([])
  const [contextAnswers, setContextAnswers] = useState<string[]>([])
  const [currentContextQ, setCurrentContextQ] = useState(0)
  const [loadingContextQs, setLoadingContextQs] = useState(false)

  // セッション履歴（フォローアップ用）
  const [sessionContext, setSessionContext] = useState('')
  const [sessionHistory, setSessionHistory] = useState<string[]>([])
  const [currentRound, setCurrentRound] = useState(0)

  // パイプライン完了時にセッションコンテキストを蓄積
  useEffect(() => {
    if (pipeline.status === 'complete') {
      const summaryParts: string[] = []
      if (pipeline.structured) summaryParts.push(`Question: ${pipeline.structured.clarified}`)
      if (pipeline.synthesis) summaryParts.push(`Ei's answer: ${pipeline.synthesis.recommendation.slice(0, 300)}`)
      pipeline.agents.forEach(a => {
        summaryParts.push(`${a.name}(${a.stance}): ${a.reasoning.slice(0, 100)}`)
      })
      const newEntry = summaryParts.join('\n')
      setSessionHistory(prev => [...prev, newEntry])
      setCurrentRound(prev => prev + 1)
    }
  }, [pipeline.status, pipeline.structured, pipeline.synthesis, pipeline.agents])

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [pipeline.timeline.length])

  // 最新のsynthesisエントリを自動選択
  useEffect(() => {
    if (pipeline.status === 'complete' && pipeline.synthesis) {
      const synthEntry = pipeline.timeline.find(e => e.type === 'synthesis')
      if (synthEntry) {
        setSelectedEntry(synthEntry)
        setShowDetail(true)
      }
    }
  }, [pipeline.status, pipeline.synthesis, pipeline.timeline])

  // 最初の質問を受け取り → 文脈質問を生成
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
        // 質問がない or エラー → 直接パイプライン実行
        setContextPhase('done')
        setSelectedEntry(null)
        setShowDetail(false)
        pipeline.run(q)
      } else {
        setContextQuestions(questions)
      }
    } catch {
      // フォールバック: 文脈質問なしで直接実行
      setContextPhase('done')
      setSelectedEntry(null)
      setShowDetail(false)
      pipeline.run(q)
    } finally {
      setLoadingContextQs(false)
    }
  }

  // 文脈回答を送信
  function handleContextAnswer(e: React.FormEvent) {
    e.preventDefault()
    const answer = inputRef.current?.value?.trim()
    if (!answer) return

    const newAnswers = [...contextAnswers, answer]
    setContextAnswers(newAnswers)

    if (inputRef.current) inputRef.current.value = ''

    if (currentContextQ + 1 >= contextQuestions.length) {
      // 全質問完了 → パイプライン開始
      setContextPhase('done')
      setSelectedEntry(null)
      setShowDetail(false)
      const contextStr = contextQuestions.map((q, i) => `Q: ${q}\nA: ${newAnswers[i]}`).join('\n\n')
      setSessionContext(contextStr)
      pipeline.run(originalQuestion, contextStr)
    } else {
      setCurrentContextQ(prev => prev + 1)
    }
  }

  // スキップ
  function handleSkipContext() {
    setContextPhase('done')
    setSelectedEntry(null)
    setShowDetail(false)
    const contextStr = contextAnswers.length > 0
      ? contextQuestions.slice(0, contextAnswers.length).map((q, i) => `Q: ${q}\nA: ${contextAnswers[i]}`).join('\n\n')
      : ''
    pipeline.run(originalQuestion, contextStr)
  }

  // フォローアップ送信（前回のコンテキストを引き継ぐ）
  function handleFollowUp(e: React.FormEvent) {
    e.preventDefault()
    const q = inputRef.current?.value?.trim()
    if (!q || pipeline.status === 'running') return

    if (inputRef.current) inputRef.current.value = ''
    setSelectedEntry(null)
    setShowDetail(false)

    // 前回の文脈 + セッション履歴をコンテキストとして渡す
    const prevContext = sessionContext
    const historyStr = sessionHistory.length > 0
      ? `\n\n## Previous conversation in this session:\n${sessionHistory.join('\n---\n')}`
      : ''
    const fullContext = `${prevContext}${historyStr}`

    setOriginalQuestion(q)
    pipeline.run(q, fullContext)
  }

  function handleSubmit(e: React.FormEvent) {
    if (contextPhase === 'asking') {
      handleContextAnswer(e)
    } else if (pipeline.status === 'complete' || pipeline.status === 'error') {
      // 前回完了後 → フォローアップ
      handleFollowUp(e)
    } else {
      handleInitialSubmit(e)
    }
  }

  function handleTimelineClick(entry: TimelineEntry) {
    setSelectedEntry(entry)
    setShowDetail(true)
  }

  const handleMapNodeClick = useCallback((nodeId: string) => {
    // ノードIDからタイムラインエントリを探す
    const hatMatch = nodeId.match(/^agent-(.+)$/)
    if (hatMatch) {
      const entry = pipeline.timeline.find(e => e.hat === hatMatch[1] && e.type === 'agent')
      if (entry) {
        setSelectedEntry(entry)
        setShowDetail(true)
      }
    } else if (nodeId === 'synthesis') {
      const entry = pipeline.timeline.find(e => e.type === 'synthesis')
      if (entry) {
        setSelectedEntry(entry)
        setShowDetail(true)
      }
    } else if (nodeId.startsWith('fact-')) {
      const entry = pipeline.timeline.find(e => e.name === 'Mei')
      if (entry) {
        setSelectedEntry(entry)
        setShowDetail(true)
      }
    } else if (nodeId === 'question' && pipeline.structured) {
      const entry = pipeline.timeline.find(e => e.stage === 'structure')
      if (entry) {
        setSelectedEntry(entry)
        setShowDetail(true)
      }
    }
  }, [pipeline.timeline, pipeline.structured])

  return (
    <main className="flex h-screen" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* ── 左: タイムライン（狭め） ─────────────── */}
      <div className="w-[340px] min-w-[340px] border-r flex flex-col" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
        {/* ヘッダー */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">Socra</h1>
            <button
              onClick={toggleTheme}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-tertiary)]"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span className="text-sm">{theme === 'dark' ? '☀' : '☽'}</span>
            </button>
          </div>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>Think alone. Decide together.</p>
        </div>

        {/* 入力 */}
        <form onSubmit={handleSubmit} className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
          {/* 文脈質問フェーズ */}
          {contextPhase === 'asking' && !loadingContextQs && contextQuestions.length > 0 && (
            <div className="mb-2 p-2.5 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-dim)' }}>
                  Ei asks ({currentContextQ + 1}/{contextQuestions.length})
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {contextQuestions[currentContextQ]}
              </p>
            </div>
          )}
          {loadingContextQs && (
            <div className="mb-2 p-2.5 rounded-lg flex items-center gap-2" style={{ background: 'var(--bg-tertiary)' }}>
              <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
              <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>Ei is preparing questions...</span>
            </div>
          )}

          {/* 回答済みの表示 */}
          {contextPhase === 'asking' && contextAnswers.length > 0 && (
            <div className="mb-2 space-y-1">
              {contextAnswers.map((a, i) => (
                <div key={i} className="text-[10px] pl-3 border-l-2 border-[#3B82F6]/30" style={{ color: 'var(--text-dim)' }}>
                  <span className="font-medium">Q{i + 1}:</span> {a}
                </div>
              ))}
            </div>
          )}

          <input
            type="text"
            ref={inputRef}
            placeholder={
              contextPhase === 'asking' ? 'Your answer...'
              : pipeline.status === 'complete' ? 'Ask a follow-up...'
              : 'What decision are you facing?'
            }
            disabled={pipeline.status === 'running' || loadingContextQs}
            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:border-[#3B82F6] transition-colors disabled:opacity-50"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-input)', color: 'var(--text-primary)' }}
          />
          <div className="flex gap-2 mt-2">
            <button
              type="submit"
              disabled={pipeline.status === 'running' || loadingContextQs}
              className="flex-1 px-3 py-1.5 rounded-lg bg-[#3B82F6] text-white text-xs font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {pipeline.status === 'running' ? 'Thinking...'
                : contextPhase === 'asking' ? 'Answer'
                : pipeline.status === 'complete' ? 'Follow up'
                : 'Ask your team'}
            </button>
            {contextPhase === 'asking' && (
              <button
                type="button"
                onClick={handleSkipContext}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-dim)' }}
              >
                Skip
              </button>
            )}
          </div>
        </form>

        {/* タイムライン */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {pipeline.timeline.map((entry) => {
            const isAgent = entry.type === 'agent' || entry.type === 'synthesis'
            const color = hatColor(entry.hat)
            return (
              <button
                key={entry.id}
                onClick={() => handleTimelineClick(entry)}
                className={`timeline-entry w-full text-left p-2.5 rounded-lg transition-all ${
                  isAgent ? 'agent-bubble' : ''
                } ${
                  selectedEntry?.id === entry.id
                    ? 'bg-[#141420] ring-1 ring-[#3B82F6]/40'
                    : 'hover:bg-[#111]'
                } ${entry.type === 'synthesis' ? 'synthesis-glow' : ''}`}
                style={isAgent ? { '--agent-color': color } as React.CSSProperties : undefined}
              >
                {entry.type === 'user' ? (
                  <div className="flex items-start gap-2">
                    <span className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>You</span>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      {entry.content}
                    </p>
                  </div>
                ) : entry.type === 'system' ? (
                  <div className="flex items-center gap-2">
                    {pipeline.currentStage === entry.stage && pipeline.status === 'running' ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-pulse" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#333]" />
                    )}
                    <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>{entry.content}</span>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-medium" style={{ color }}>
                        {entry.name}
                      </span>
                      {entry.stance && (
                        <span className="text-[10px] ml-auto" style={{ color: stanceColor(entry.stance) }}>
                          {stanceIcon(entry.stance)} {entry.intensity}/5
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#777] line-clamp-2 pl-4">
                      {entry.content.slice(0, 100)}...
                    </p>
                  </div>
                )}
              </button>
            )
          })}

          {pipeline.error && (
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {pipeline.error}
            </div>
          )}

          <div ref={timelineEndRef} />
        </div>
      </div>

      {/* ── 右: D3.jsマップ + 詳細オーバーレイ ──── */}
      <div className="flex-1 relative">
        {/* D3.jsマップ（常に背景に） */}
        <DecisionMap pipeline={pipeline} onNodeClick={handleMapNodeClick} theme={theme} round={currentRound} />

        {/* 詳細パネル（オーバーレイ） */}
        {showDetail && selectedEntry && (
          <div className="absolute inset-y-0 right-0 w-[420px] backdrop-blur-lg border-l overflow-y-auto" style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-light)' }}>
            <div className="sticky top-0 z-10 flex justify-between items-center p-3 border-b backdrop-blur" style={{ borderColor: 'var(--border)', background: 'var(--bg-overlay)' }}>
              <span className="text-xs text-[#555]">Detail</span>
              <button
                onClick={() => setShowDetail(false)}
                className="text-[#555] hover:text-[#aaa] transition-colors text-sm px-2"
              >
                ✕
              </button>
            </div>
            <DetailView entry={selectedEntry} pipeline={pipeline} />
          </div>
        )}
      </div>
    </main>
  )
}

// ── 詳細ビュー ───────────────────────────────────────
function DetailView({ entry, pipeline }: { entry: TimelineEntry; pipeline: ReturnType<typeof usePipeline> }) {
  if (entry.type === 'system') {
    // 構造化の結果を表示
    if (entry.stage === 'structure' && pipeline.structured) {
      const sq = pipeline.structured
      return (
        <div className="p-6 space-y-5">
          <h2 className="text-sm font-semibold">Question Structured</h2>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-[#555] uppercase tracking-wider">Original</label>
              <p className="text-xs mt-1 text-[#888]">{sq.original}</p>
            </div>
            <div>
              <label className="text-[10px] text-[#555] uppercase tracking-wider">Clarified</label>
              <p className="text-xs mt-1">{sq.clarified}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#555] uppercase tracking-wider">Time Horizon</label>
                <p className="text-xs mt-1">{sq.timeHorizon}</p>
              </div>
              <div>
                <label className="text-[10px] text-[#555] uppercase tracking-wider">Reversibility</label>
                <p className="text-xs mt-1">{sq.reversibility}</p>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[#555] uppercase tracking-wider">Stakeholders</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {sq.stakeholders.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-[#141414] text-[10px] text-[#888]">{s}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    }

    // 事実収集のシステムメッセージ
    if (entry.stage === 'observe' && pipeline.observation) {
      return <MeiDetail observation={pipeline.observation} />
    }

    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-xs text-[#444]">{entry.content}</p>
      </div>
    )
  }

  // 明（Mei）の事実
  if (entry.name === 'Mei' && pipeline.observation) {
    return <MeiDetail observation={pipeline.observation} />
  }

  // 理（Ri）の検証
  if (entry.name === 'Ri' && pipeline.verification) {
    const ver = pipeline.verification
    return (
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: AGENTS.verify.hex }} />
          <h2 className="text-sm font-semibold">Ri — Logic Verification</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold">{ver.overallConsistency}</div>
          <div className="text-xs text-[#666]">/ 100 consistency</div>
        </div>
        {ver.contradictions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-[#888]">Contradictions</h3>
            {ver.contradictions.map((c, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-[#111] border border-[#1a1a1a]">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    c.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    c.severity === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>{c.severity}</span>
                  <span className="text-[10px] text-[#666]">{c.hat1} vs {c.hat2}</span>
                </div>
                <p className="text-xs">{c.description}</p>
              </div>
            ))}
          </div>
        )}
        {ver.factGaps.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-[#888]">Fact Gaps</h3>
            {ver.factGaps.map((gap, i) => (
              <p key={i} className="text-xs text-[#888] pl-2 border-l-2 border-[#222]">{gap}</p>
            ))}
          </div>
        )}
      </div>
    )
  }

  // 叡（Ei）の統合
  if (entry.type === 'synthesis' && pipeline.synthesis) {
    return (
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: AGENTS.blue.hex }} />
          <h2 className="text-sm font-semibold">Ei — Synthesis</h2>
        </div>
        <div className="prose prose-invert prose-sm max-w-none">
          {pipeline.synthesis.recommendation.split('\n').map((line, i) => {
            if (line.startsWith('## ')) return <h2 key={i} className="text-sm font-semibold mt-4 mb-1">{line.slice(3)}</h2>
            if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-xs text-[#e5e5e5]">{line.slice(2, -2)}</p>
            if (line.trim() === '') return <br key={i} />
            return <p key={i} className="text-xs text-[#bbb] leading-relaxed mb-1.5">{line}</p>
          })}
        </div>

        {/* レーダーチャート的なサマリー */}
        <div className="p-3 rounded-lg bg-[#111] border border-[#1a1a1a]">
          <div className="text-[10px] text-[#666] mb-2">
            Team Pattern: <span className="text-[#e5e5e5] font-medium">{pipeline.synthesis.radarChart.pattern}</span>
          </div>
          <div className="space-y-1.5">
            {pipeline.synthesis.radarChart.axes.map(axis => (
              <div key={axis.hat} className="flex items-center gap-2">
                <span className="w-10 text-[10px] text-right" style={{ color: hatColor(axis.hat) }}>{axis.label}</span>
                <div className="flex-1 h-1.5 bg-[#0a0a0a] rounded-full overflow-hidden relative">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-[#222]" />
                  {axis.value > 0 ? (
                    <div
                      className="absolute inset-y-0 left-1/2 rounded-r-full"
                      style={{ width: `${(axis.value / 5) * 50}%`, backgroundColor: '#22C55E' }}
                    />
                  ) : axis.value < 0 ? (
                    <div
                      className="absolute inset-y-0 rounded-l-full"
                      style={{ right: '50%', width: `${(Math.abs(axis.value) / 5) * 50}%`, backgroundColor: '#EF4444' }}
                    />
                  ) : null}
                </div>
                <span className="w-6 text-[10px] text-[#666] text-right">{axis.value > 0 ? '+' : ''}{axis.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // 4体のエージェント詳細
  if (entry.type === 'agent' && entry.stance) {
    return (
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hatColor(entry.hat) }} />
          <h2 className="text-sm font-semibold" style={{ color: hatColor(entry.hat) }}>
            {entry.name}
          </h2>
          <span className="text-[10px] text-[#666]">
            {AGENTS[entry.hat as HatColor]?.label}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium" style={{ color: stanceColor(entry.stance) }}>
            {stanceIcon(entry.stance)} {entry.stance?.toUpperCase()}
          </span>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-5 rounded-sm"
                style={{
                  backgroundColor: i < (entry.intensity ?? 0)
                    ? stanceColor(entry.stance)
                    : '#1a1a1a',
                }}
              />
            ))}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-[#bbb]">{entry.content}</p>

        {/* keyPoints */}
        {pipeline.agents.filter(a => a.hat === entry.hat).map(agent => (
          <div key={agent.hat} className="space-y-1.5">
            <h3 className="text-[10px] text-[#666] uppercase tracking-wider">Key Points</h3>
            {agent.keyPoints.map((point, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: hatColor(entry.hat) }} />
                <p className="text-xs text-[#888]">{point}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  return null
}

// ── Mei詳細 ──────────────────────────────────────────
function MeiDetail({ observation }: { observation: NonNullable<ReturnType<typeof usePipeline>['observation']> }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: AGENTS.white.hex }} />
        <h2 className="text-sm font-semibold">Mei — Facts</h2>
      </div>
      <div className="space-y-2">
        {observation.facts.map((fact, i) => (
          <div key={i} className="p-2.5 rounded-lg bg-[#111] border border-[#1a1a1a]">
            <p className="text-xs">{fact.content}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[10px] px-1 py-0.5 rounded ${
                fact.confidence === 'high' ? 'bg-green-500/20 text-green-400' :
                fact.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>{fact.confidence}</span>
              <span className="text-[10px] text-[#555]">{fact.source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
