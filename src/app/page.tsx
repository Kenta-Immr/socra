'use client'

import { useState, useRef, useEffect } from 'react'
import { usePipeline, type TimelineEntry } from '@/lib/usePipeline'
import { AGENTS } from '@/types'
import type { HatColor } from '@/types'

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
  const timelineEndRef = useRef<HTMLDivElement>(null)
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null)

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [pipeline.timeline.length])

  // 最新のsynthesisエントリを自動選択
  useEffect(() => {
    if (pipeline.status === 'complete' && pipeline.synthesis) {
      const synthEntry = pipeline.timeline.find(e => e.type === 'synthesis')
      if (synthEntry) setSelectedEntry(synthEntry)
    }
  }, [pipeline.status, pipeline.synthesis, pipeline.timeline])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = inputRef.current?.value?.trim()
    if (!q || pipeline.status === 'running') return
    setSelectedEntry(null)
    pipeline.run(q)
  }

  return (
    <main className="flex h-screen bg-[#0a0a0a] text-[#e5e5e5]">
      {/* ── 左: タイムライン ─────────────────────────── */}
      <div className="w-[420px] min-w-[420px] border-r border-[#222] flex flex-col">
        {/* ヘッダー */}
        <div className="p-5 border-b border-[#222]">
          <h1 className="text-xl font-semibold tracking-tight">Socra</h1>
          <p className="text-xs text-[#888] mt-1">Think alone. Decide together.</p>
        </div>

        {/* 入力 */}
        <form onSubmit={handleSubmit} className="p-4 border-b border-[#222]">
          <input
            type="text"
            ref={inputRef}
            placeholder="What decision are you facing?"
            disabled={pipeline.status === 'running'}
            className="w-full px-3 py-2.5 rounded-lg bg-[#141414] border border-[#333] text-sm text-[#e5e5e5] placeholder:text-[#555] focus:outline-none focus:border-[#3B82F6] transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pipeline.status === 'running'}
            className="w-full mt-2 px-3 py-2 rounded-lg bg-[#3B82F6] text-white text-sm font-medium hover:bg-[#2563EB] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {pipeline.status === 'running' ? 'Thinking...' : 'Ask your team'}
          </button>
        </form>

        {/* タイムライン */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {pipeline.timeline.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setSelectedEntry(entry)}
              className={`w-full text-left p-3 rounded-lg transition-all ${
                selectedEntry?.id === entry.id
                  ? 'bg-[#1a1a2e] ring-1 ring-[#3B82F6]/50'
                  : 'hover:bg-[#141414]'
              }`}
            >
              {entry.type === 'system' ? (
                <div className="flex items-center gap-2">
                  {pipeline.currentStage === entry.stage && pipeline.status === 'running' ? (
                    <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-[#333]" />
                  )}
                  <span className="text-xs text-[#888]">{entry.content}</span>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: hatColor(entry.hat) }}
                    />
                    <span className="text-sm font-medium" style={{ color: hatColor(entry.hat) }}>
                      {entry.name}
                    </span>
                    {entry.stance && (
                      <span className="text-xs ml-auto" style={{ color: stanceColor(entry.stance) }}>
                        {stanceIcon(entry.stance)} {entry.intensity}/5
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#aaa] line-clamp-2 pl-[18px]">
                    {entry.content.slice(0, 120)}...
                  </p>
                </div>
              )}
            </button>
          ))}

          {/* ローディングインジケータ */}
          {pipeline.status === 'running' && pipeline.currentStage === 'deliberate' && (
            <div className="flex gap-3 p-3">
              {(['red', 'black', 'yellow', 'green'] as const).map(hat => {
                const done = pipeline.agents.some(a => a.hat === hat)
                const agent = AGENTS[hat]
                return (
                  <div key={hat} className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${done ? '' : 'animate-pulse'}`}
                      style={{ backgroundColor: done ? agent.hex : `${agent.hex}66` }}
                    />
                    <span className={`text-xs ${done ? 'text-[#aaa]' : 'text-[#555]'}`}>
                      {agent.name}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {pipeline.error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {pipeline.error}
            </div>
          )}

          <div ref={timelineEndRef} />
        </div>
      </div>

      {/* ── 右: 詳細表示 ────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {!selectedEntry && pipeline.status === 'idle' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4 max-w-md">
              <div className="text-4xl font-bold tracking-tight">Socra</div>
              <p className="text-[#888] text-sm">
                Your AI decision-making team.<br />
                7 perspectives. One clear path.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {(['white', 'red', 'black', 'yellow', 'green', 'verify', 'blue'] as const).map(key => {
                  const agent = AGENTS[key]
                  return (
                    <div key={key} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#141414]">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: agent.hex }} />
                      <span className="text-xs text-[#aaa]">{agent.name}</span>
                      <span className="text-xs text-[#555]">{agent.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {!selectedEntry && pipeline.status === 'running' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-[#888]">
                {pipeline.currentStage && STAGE_LABELS_EN[pipeline.currentStage]}
              </p>
            </div>
          </div>
        )}

        {selectedEntry && (
          <DetailView entry={selectedEntry} pipeline={pipeline} />
        )}
      </div>
    </main>
  )
}

const STAGE_LABELS_EN: Record<string, string> = {
  structure: 'Structuring your question...',
  observe: 'Mei is gathering facts...',
  deliberate: 'Your team is deliberating...',
  verify: 'Ri is checking logic...',
  synthesize: 'Ei is synthesizing...',
}

// ── 詳細ビュー ───────────────────────────────────────
function DetailView({ entry, pipeline }: { entry: TimelineEntry; pipeline: ReturnType<typeof usePipeline> }) {
  if (entry.type === 'system') {
    // 構造化の結果を表示
    if (entry.stage === 'structure' && pipeline.structured) {
      const sq = pipeline.structured
      return (
        <div className="p-8 max-w-2xl mx-auto space-y-6">
          <h2 className="text-lg font-semibold">Question Structured</h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#888] uppercase tracking-wider">Original</label>
              <p className="text-sm mt-1 text-[#aaa]">{sq.original}</p>
            </div>
            <div>
              <label className="text-xs text-[#888] uppercase tracking-wider">Clarified</label>
              <p className="text-sm mt-1">{sq.clarified}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider">Time Horizon</label>
                <p className="text-sm mt-1">{sq.timeHorizon}</p>
              </div>
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider">Reversibility</label>
                <p className="text-sm mt-1">{sq.reversibility}</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-[#888] uppercase tracking-wider">Stakeholders</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {sq.stakeholders.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-[#1a1a1a] text-xs text-[#aaa]">{s}</span>
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
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[#555]">{entry.content}</p>
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
      <div className="p-8 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: AGENTS.verify.hex }} />
          <h2 className="text-lg font-semibold">Ri — Logic Verification</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-3xl font-bold">{ver.overallConsistency}</div>
          <div className="text-sm text-[#888]">/ 100 consistency</div>
        </div>
        {ver.contradictions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[#aaa]">Contradictions</h3>
            {ver.contradictions.map((c, i) => (
              <div key={i} className="p-3 rounded-lg bg-[#141414] border border-[#222]">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    c.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    c.severity === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>{c.severity}</span>
                  <span className="text-xs text-[#888]">{c.hat1} vs {c.hat2}</span>
                </div>
                <p className="text-sm">{c.description}</p>
              </div>
            ))}
          </div>
        )}
        {ver.factGaps.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[#aaa]">Fact Gaps</h3>
            {ver.factGaps.map((gap, i) => (
              <p key={i} className="text-sm text-[#aaa] pl-3 border-l-2 border-[#333]">{gap}</p>
            ))}
          </div>
        )}
      </div>
    )
  }

  // 叡（Ei）の統合
  if (entry.type === 'synthesis' && pipeline.synthesis) {
    return (
      <div className="p-8 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: AGENTS.blue.hex }} />
          <h2 className="text-lg font-semibold">Ei — Synthesis</h2>
        </div>
        <div className="prose prose-invert prose-sm max-w-none">
          {pipeline.synthesis.recommendation.split('\n').map((line, i) => {
            if (line.startsWith('## ')) return <h2 key={i} className="text-base font-semibold mt-6 mb-2">{line.slice(3)}</h2>
            if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-[#e5e5e5]">{line.slice(2, -2)}</p>
            if (line.trim() === '') return <br key={i} />
            return <p key={i} className="text-sm text-[#ccc] leading-relaxed mb-2">{line}</p>
          })}
        </div>

        {/* レーダーチャート的なサマリー */}
        <div className="p-4 rounded-lg bg-[#141414] border border-[#222]">
          <div className="text-xs text-[#888] mb-3">Team Pattern: <span className="text-[#e5e5e5] font-medium">{pipeline.synthesis.radarChart.pattern}</span></div>
          <div className="space-y-2">
            {pipeline.synthesis.radarChart.axes.map(axis => (
              <div key={axis.hat} className="flex items-center gap-3">
                <span className="w-12 text-xs text-right" style={{ color: hatColor(axis.hat) }}>{axis.label}</span>
                <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden relative">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-[#333]" />
                  {axis.value > 0 ? (
                    <div
                      className="absolute inset-y-0 left-1/2 rounded-r-full"
                      style={{
                        width: `${(axis.value / 5) * 50}%`,
                        backgroundColor: '#22C55E',
                      }}
                    />
                  ) : axis.value < 0 ? (
                    <div
                      className="absolute inset-y-0 rounded-l-full"
                      style={{
                        right: '50%',
                        width: `${(Math.abs(axis.value) / 5) * 50}%`,
                        backgroundColor: '#EF4444',
                      }}
                    />
                  ) : null}
                </div>
                <span className="w-8 text-xs text-[#888] text-right">{axis.value > 0 ? '+' : ''}{axis.value}</span>
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
      <div className="p-8 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: hatColor(entry.hat) }} />
          <h2 className="text-lg font-semibold" style={{ color: hatColor(entry.hat) }}>
            {entry.name}
          </h2>
          <span className="text-xs text-[#888]">
            {AGENTS[entry.hat as HatColor]?.label}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm font-medium" style={{ color: stanceColor(entry.stance) }}>
            {stanceIcon(entry.stance)} {entry.stance?.toUpperCase()}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="w-2 h-6 rounded-sm"
                style={{
                  backgroundColor: i < (entry.intensity ?? 0)
                    ? stanceColor(entry.stance)
                    : '#222',
                }}
              />
            ))}
          </div>
        </div>

        <p className="text-sm leading-relaxed text-[#ccc]">{entry.content}</p>

        {/* keyPoints */}
        {pipeline.agents.filter(a => a.hat === entry.hat).map(agent => (
          <div key={agent.hat} className="space-y-2">
            <h3 className="text-xs text-[#888] uppercase tracking-wider">Key Points</h3>
            {agent.keyPoints.map((point, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: hatColor(entry.hat) }} />
                <p className="text-sm text-[#aaa]">{point}</p>
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
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: AGENTS.white.hex }} />
        <h2 className="text-lg font-semibold">Mei — Facts</h2>
      </div>
      <div className="space-y-3">
        {observation.facts.map((fact, i) => (
          <div key={i} className="p-3 rounded-lg bg-[#141414] border border-[#222]">
            <p className="text-sm">{fact.content}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                fact.confidence === 'high' ? 'bg-green-500/20 text-green-400' :
                fact.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>{fact.confidence}</span>
              <span className="text-xs text-[#666]">{fact.source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
