'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadSession, type SessionData } from '@/lib/supabase'
import { AGENTS } from '@/types'
import type { HatColor } from '@/types'

function hatColor(hat?: string): string {
  if (!hat) return '#6B7280'
  const agent = AGENTS[hat as HatColor | 'verify']
  return agent?.hex ?? '#6B7280'
}

function stanceIcon(stance?: string): string {
  if (stance === 'support') return '▲'
  if (stance === 'oppose') return '▼'
  return '◆'
}

function stanceColor(stance?: string): string {
  if (stance === 'support') return '#22C55E'
  if (stance === 'oppose') return '#EF4444'
  return '#F59E0B'
}

export default function SessionPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 自分のセッション（localStorageに記録あり）ならトップで復元モードで開く
    try {
      const saved = JSON.parse(localStorage.getItem('socra-sessions') ?? '[]') as Array<{ id: string }>
      if (saved.some(s => s.id === id)) {
        router.replace(`/?session=${id}`)
        return
      }
    } catch { /* ignore */ }

    loadSession(id).then(data => {
      if (data) setSession(data)
      else setError('Session not found')
    }).catch(() => setError('Failed to load session'))
      .finally(() => setLoading(false))
  }, [id, router])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="text-center space-y-2">
        <div className="text-2xl font-bold">Socra</div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading session...</p>
      </div>
    </div>
  )

  if (error || !session) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="text-center space-y-3">
        <div className="text-2xl font-bold">Socra</div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error || 'Session not found'}</p>
        <a href="/" className="text-sm text-[#3B82F6] hover:underline">Start a new session</a>
      </div>
    </div>
  )

  const rounds = session.rounds as Array<{
    question?: string
    agents?: Array<{ hat: string; name: string; stance: string; intensity: number; reasoning: string; keyPoints: string[] }>
    synthesis?: { recommendation: string; nextSteps: string[] }
    verification?: { overallConsistency: number; contradictions: Array<{ hat1: string; hat2: string; description: string }> }
  }>

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <a href="/" className="text-lg font-semibold tracking-tight hover:opacity-80">Socra</a>
          <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Shared session</p>
        </div>
        <a href="/" className="text-xs px-3 py-1.5 rounded-lg bg-[#3B82F6] text-white hover:bg-[#2563EB]">
          Try Socra
        </a>
      </header>

      {/* セッション内容 */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* メタ情報 */}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">{session.question}</h1>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {new Date(session.created_at!).toLocaleDateString()} · {rounds.length} round{rounds.length > 1 ? 's' : ''}
          </p>
        </div>

        {/* ラウンド */}
        {rounds.map((round, ri) => (
          <div key={ri} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-dim)' }}>
                Round {ri + 1}
              </span>
            </div>

            {/* エージェント発言 */}
            {round.agents?.map(agent => {
              const color = hatColor(agent.hat)
              const agentInfo = AGENTS[agent.hat as HatColor | 'verify']
              return (
                <div key={agent.hat} className="rounded-xl border p-4" style={{ borderColor: `${color}33`, borderLeftWidth: '3px', borderLeftColor: color }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs font-semibold" style={{ color }}>{agentInfo?.name ?? agent.name}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{agentInfo?.label}</span>
                    <span className="text-[10px] ml-auto font-medium" style={{ color: stanceColor(agent.stance) }}>
                      {stanceIcon(agent.stance)} {agent.stance} {agent.intensity}/5
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{agent.reasoning}</p>
                  {agent.keyPoints.length > 0 && (
                    <div className="mt-2 pt-2 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
                      {agent.keyPoints.map((kp, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{kp}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* 検証 */}
            {round.verification && round.verification.contradictions.length > 0 && (
              <div className="rounded-xl border p-4" style={{ borderColor: '#9CA3AF33', borderLeftWidth: '3px', borderLeftColor: '#9CA3AF' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold" style={{ color: '#9CA3AF' }}>Ri — Logic Check</span>
                  <span className="text-[10px] ml-auto" style={{ color: round.verification.overallConsistency >= 80 ? '#22C55E' : '#F59E0B' }}>
                    Consistency {round.verification.overallConsistency}%
                  </span>
                </div>
                {round.verification.contradictions.map((c, i) => (
                  <p key={i} className="text-sm" style={{ color: '#EF4444' }}>
                    ⚡ {c.description}
                  </p>
                ))}
              </div>
            )}

            {/* 統合 */}
            {round.synthesis && (
              <div className="rounded-xl border-2 p-5" style={{ borderColor: AGENTS.blue.hex, background: `${AGENTS.blue.hex}08` }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${AGENTS.blue.hex}20` }}>
                    <span className="text-sm font-bold" style={{ color: AGENTS.blue.hex }}>叡</span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: AGENTS.blue.hex }}>Ei — Synthesis</span>
                </div>
                <div className="text-sm leading-relaxed space-y-2" style={{ color: 'var(--text-secondary)' }}>
                  {round.synthesis.recommendation.split('\n').filter(l => l.trim()).map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
                {round.synthesis.nextSteps.length > 0 && (
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: `${AGENTS.blue.hex}30` }}>
                    <p className="text-sm font-medium mb-2" style={{ color: AGENTS.blue.hex }}>What will you do next?</p>
                    {round.synthesis.nextSteps.map((step, i) => (
                      <p key={i} className="text-xs" style={{ color: 'var(--text-muted)' }}>• {step}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* CTA */}
        <div className="text-center pt-6 pb-10">
          <a href="/" className="inline-block px-6 py-3 rounded-xl bg-[#3B82F6] text-white text-sm font-medium hover:bg-[#2563EB]">
            Start your own Socra session
          </a>
        </div>
      </div>
    </div>
  )
}
