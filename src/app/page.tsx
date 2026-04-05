'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Home() {
  const router = useRouter()
  const [topic, setTopic] = useState('')

  function startSession() {
    const sessionId = crypto.randomUUID()
    const params = topic ? `?topic=${encodeURIComponent(topic)}` : ''
    router.push(`/session/${sessionId}${params}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight">Socra</h1>
        <p className="text-[var(--text-secondary)] text-lg">
          AI that asks, not answers.
        </p>
        <p className="text-[var(--text-secondary)] text-sm">
          考えるとき、画面が思考になる。
        </p>
      </div>

      <div className="w-full max-w-md space-y-4">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && startSession()}
          placeholder="何について考えたいですか？"
          className="w-full px-4 py-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--edge)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
        <button
          onClick={startSession}
          className="w-full px-4 py-3 rounded-lg bg-[var(--accent)] text-white font-medium hover:bg-blue-600 transition-colors"
        >
          思考を始める
        </button>
      </div>
    </main>
  )
}
