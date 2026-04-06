'use client'

import { useState, useEffect } from 'react'
import { LOCALE_FLAGS, LOCALE_LABELS, type Locale } from '@/i18n/locales'

interface SavedSession {
  id: string
  question: string
  date: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onSelectSession: (id: string) => void
  onNewSession: () => void
  locale: Locale
  onLocaleChange: (locale: Locale) => void
}

export default function SessionSidebar({ isOpen, onClose, onSelectSession, onNewSession, locale, onLocaleChange }: Props) {
  const [sessions, setSessions] = useState<SavedSession[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('socra-sessions')
    if (saved) {
      try { setSessions(JSON.parse(saved)) } catch { /* ignore */ }
    }
  }, [isOpen])

  // 日付グループ分け
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const grouped: { label: string; items: SavedSession[] }[] = []

  const todayItems = sessions.filter(s => new Date(s.date).toDateString() === today)
  const yesterdayItems = sessions.filter(s => new Date(s.date).toDateString() === yesterday)
  const olderItems = sessions.filter(s => {
    const d = new Date(s.date).toDateString()
    return d !== today && d !== yesterday
  })

  if (todayItems.length > 0) grouped.push({ label: 'Today', items: todayItems })
  if (yesterdayItems.length > 0) grouped.push({ label: 'Yesterday', items: yesterdayItems })
  if (olderItems.length > 0) grouped.push({ label: 'Earlier', items: olderItems })

  return (
    <>
      {/* オーバーレイ */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      )}

      {/* サイドバー */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-[280px] md:w-[300px] flex flex-col border-r transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-semibold">Socra</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)]" style={{ color: 'var(--text-dim)' }}>
            ✕
          </button>
        </div>

        {/* 新規セッション */}
        <button
          onClick={() => { onNewSession(); onClose() }}
          className="mx-3 mt-3 px-4 py-2.5 rounded-xl border text-sm font-medium text-center transition-colors hover:bg-[var(--bg-tertiary)]"
          style={{ borderColor: 'var(--border-input)', color: 'var(--text-primary)' }}
        >
          + New Session
        </button>

        {/* セッション一覧 */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {grouped.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-ghost)' }}>No sessions yet</p>
          )}
          {grouped.map(group => (
            <div key={group.label}>
              <p className="text-[10px] uppercase tracking-wider mb-1.5 px-1" style={{ color: 'var(--text-ghost)' }}>{group.label}</p>
              <div className="space-y-1">
                {group.items.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { onSelectSession(s.id); onClose() }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs truncate hover:bg-[var(--bg-tertiary)] transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {s.question || 'Untitled session'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 下部: 言語切替 */}
        <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: 'var(--border)', paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>Language</p>
          <div className="flex flex-wrap gap-1.5">
            {(['en', 'ja', 'zh', 'es'] as const).map(loc => (
              <button
                key={loc}
                onClick={() => onLocaleChange(loc)}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${locale === loc ? 'font-bold' : ''}`}
                style={{
                  background: locale === loc ? 'var(--bg-tertiary)' : 'transparent',
                  color: locale === loc ? 'var(--text-primary)' : 'var(--text-dim)',
                }}
              >
                {LOCALE_FLAGS[loc]} {LOCALE_LABELS[loc]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
