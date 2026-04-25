'use client'

import { useState, useCallback, useRef } from 'react'
import type { SSEEvent, PipelineStage, AgentResponse, StructuredQuestion, ObservationResult, VerificationResult, SynthesisResult, PreMortemResult, HatColor, FocusPoint, FocusPointProposal, CrossBorderRecord, DiscussionPhase, ConflictEdge } from '@/types'

export type TimelineEntry = {
  id: string
  type: 'system' | 'agent' | 'synthesis' | 'user'
  name?: string
  hat?: string
  stage: PipelineStage
  content: string
  stance?: string
  intensity?: number
  timestamp: string
}

// ラウンドごとのエージェント結果（マップ累積用）
export type RoundData = {
  round: number
  question: string
  agents: AgentResponse[]
  structured: StructuredQuestion | null
}

export type PipelineUI = {
  status: 'idle' | 'running' | 'complete' | 'error'
  currentStage: PipelineStage | null
  timeline: TimelineEntry[]
  structured: StructuredQuestion | null
  observation: ObservationResult | null
  agents: AgentResponse[]
  verification: VerificationResult | null
  preMortem: PreMortemResult | null
  // v4 軽量複数シナリオ拡張: 「別の壊し方を見る」で追加生成された variants
  preMortemVariants: PreMortemResult[]
  variantLoading: boolean
  variantError: string | null
  synthesis: SynthesisResult | null
  error: string | null
  // マップ成長用: 全ラウンドの累積データ
  round: number
  allRounds: RoundData[]
  // アバターフィールド用: 現在thinking中のエージェント
  thinkingAgents: HatColor[]
  // v0.2: フォーカスポイント・越境・議論フェーズ
  focusProposal: FocusPointProposal | null
  focusPoint: FocusPoint | null
  discussionPhase: DiscussionPhase | null
  crossBorders: CrossBorderRecord[]
  // v0.3: AvatarField蓄積用のコンフリクト線（2026-04-19 深設計）
  conflictEdges: ConflictEdge[]
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  structure: 'Structuring your question...',
  observe: 'Mei is gathering facts...',
  deliberate: 'Your team is thinking...',
  verify: 'Ri is checking logic...',
  premortem: 'Ei is remembering the failure from three years ahead...',
  synthesize: 'Ei is synthesizing...',
}

export function usePipeline() {
  const [state, setState] = useState<PipelineUI>({
    status: 'idle',
    currentStage: null,
    timeline: [],
    structured: null,
    observation: null,
    agents: [],
    verification: null,
    preMortem: null,
    preMortemVariants: [],
    variantLoading: false,
    variantError: null,
    synthesis: null,
    error: null,
    round: 0,
    allRounds: [],
    thinkingAgents: [],
    focusProposal: null,
    focusPoint: null,
    discussionPhase: null,
    crossBorders: [],
    conflictEdges: [],
  })

  const roundRef = useRef(0)

  const addTimeline = useCallback((entry: TimelineEntry) => {
    setState(prev => ({ ...prev, timeline: [...prev.timeline, entry] }))
  }, [])

  const run = useCallback(async (question: string, context?: string, userName?: string, memoryContext?: unknown) => {
    const currentRound = roundRef.current
    roundRef.current += 1

    const userEntry: TimelineEntry = {
      id: `user-${Date.now()}`,
      type: 'user',
      stage: 'structure',
      content: question,
      timestamp: new Date().toISOString(),
    }

    // 前ラウンドのデータを保存してから新ラウンド開始
    setState(prev => {
      // 前ラウンドの結果をallRoundsに追加（初回以外）
      const updatedRounds = prev.agents.length > 0
        ? [...prev.allRounds, {
            round: currentRound,
            question: prev.structured?.clarified ?? question,
            agents: prev.agents,
            structured: prev.structured,
          }]
        : prev.allRounds

      return {
        status: 'running' as const,
        currentStage: 'structure' as PipelineStage,
        timeline: [...prev.timeline, userEntry],
        structured: null,
        observation: null,
        agents: [],
        verification: null,
        preMortem: null,
        preMortemVariants: [],
        variantLoading: false,
        variantError: null,
        synthesis: null,
        error: null,
        round: currentRound + 1,
        allRounds: updatedRounds,
        thinkingAgents: [],
        focusProposal: null,
        focusPoint: null,
        discussionPhase: 'pre_focus' as DiscussionPhase,
        crossBorders: [],
        conflictEdges: [],
      }
    })

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context, userName, round: currentRound, memoryContext }),
      })

      // セーフティフィルター: 危機的状況検出時はJSONレスポンスが返る
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const crisisData = await res.json()
        if (crisisData.type === 'crisis') {
          const helplineText = crisisData.helplines
            .map((h: { name: string; number: string }) => `${h.name}: ${h.number}`)
            .join('\n')
          const findHelpLine = crisisData.findHelpUrl
            ? `\n\n🌐 あなたの地域の相談窓口を探す:\n${crisisData.findHelpUrl}`
            : ''
          setState(prev => ({
            ...prev,
            status: 'error',
            error: `${crisisData.message}\n\n${helplineText}${findHelpLine}`,
          }))
          return
        }
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')

      const decoder = new TextDecoder()
      let buffer = ''

      try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const event: SSEEvent = JSON.parse(line.slice(6))

          switch (event.type) {
            case 'stage:start': {
              const stageHatMap: Partial<Record<PipelineStage, HatColor>> = {
                observe: 'white',
                verify: 'verify' as HatColor,  // 理: HatColorに含まないが便宜上キャスト
                synthesize: 'blue',
              }
              const stageHat = stageHatMap[event.stage!]
              setState(prev => ({
                ...prev,
                currentStage: event.stage!,
                thinkingAgents: stageHat && !prev.thinkingAgents.includes(stageHat)
                  ? [...prev.thinkingAgents, stageHat]
                  : prev.thinkingAgents,
              }))
              addTimeline({
                id: `stage-${event.stage}-start-${Date.now()}`,
                type: 'system',
                stage: event.stage!,
                content: STAGE_LABELS[event.stage!],
                timestamp: event.timestamp,
              })
              break
            }

            case 'stage:complete':
              if (event.stage === 'structure') {
                setState(prev => ({ ...prev, structured: event.data as StructuredQuestion }))
              } else if (event.stage === 'observe') {
                const obs = event.data as ObservationResult
                setState(prev => ({ ...prev, observation: obs }))
                addTimeline({
                  id: `mei-facts-${Date.now()}`,
                  type: 'agent',
                  name: 'Mei',
                  hat: 'white',
                  stage: 'observe',
                  content: `Found ${obs.facts.length} relevant facts`,
                  timestamp: event.timestamp,
                })
              } else if (event.stage === 'verify') {
                const ver = event.data as VerificationResult
                setState(prev => ({ ...prev, verification: ver }))
                addTimeline({
                  id: `ri-verify-${Date.now()}`,
                  type: 'agent',
                  name: 'Ri',
                  hat: 'verify',
                  stage: 'verify',
                  content: [
                    `論理整合性: ${ver.overallConsistency}/100`,
                    ...ver.contradictions.map(c => `⚡ ${c.description}`),
                    ...ver.factGaps.map(g => `❓ ${g}`),
                  ].join('\n'),
                  timestamp: event.timestamp,
                })
              } else if (event.stage === 'premortem') {
                // v4 Phase 4: Pre-mortem 結果。error ペイロードの場合はスキップ。
                const raw = event.data as unknown
                if (raw && typeof raw === 'object' && 'narrative' in raw) {
                  const pm = raw as PreMortemResult
                  setState(prev => ({ ...prev, preMortem: pm }))
                  addTimeline({
                    id: `ei-premortem-${Date.now()}`,
                    type: 'synthesis',
                    name: 'Ei',
                    hat: 'blue',
                    stage: 'premortem',
                    content: [
                      pm.scenarioTitle,
                      '',
                      pm.narrative,
                      '',
                      pm.coreQuestionBack,
                    ].filter(Boolean).join('\n'),
                    timestamp: event.timestamp,
                  })
                }
              } else if (event.stage === 'synthesize') {
                const syn = event.data as SynthesisResult
                setState(prev => ({ ...prev, synthesis: syn }))
                addTimeline({
                  id: `ei-synthesis-${Date.now()}`,
                  type: 'synthesis',
                  name: 'Ei',
                  hat: 'blue',
                  stage: 'synthesize',
                  content: syn.recommendation,
                  timestamp: event.timestamp,
                })
              }
              break

            case 'agent:start':
              if (event.hat) {
                setState(prev => ({
                  ...prev,
                  thinkingAgents: [...prev.thinkingAgents, event.hat as HatColor],
                }))
              }
              break

            case 'agent:complete':
              if (event.stage === 'deliberate') {
                const agent = event.data as AgentResponse
                setState(prev => ({ ...prev, agents: [...prev.agents, agent] }))
                addTimeline({
                  id: `agent-${agent.hat}-${Date.now()}`,
                  type: 'agent',
                  name: agent.name,
                  hat: agent.hat,
                  stage: 'deliberate',
                  content: agent.reasoning,
                  stance: agent.stance,
                  intensity: agent.intensity,
                  timestamp: event.timestamp,
                })
              }
              break

            case 'pipeline:complete':
              setState(prev => ({ ...prev, status: 'complete', currentStage: null }))
              break

            case 'pipeline:error':
              const errData = event.data as { error: string }
              setState(prev => ({ ...prev, status: 'error', error: errData.error }))
              break

            // v0.2: フォーカスポイント・越境・議論フェーズ
            case 'focus:proposed':
              if (event.focusProposal) {
                const proposal = event.focusProposal
                setState(prev => ({ ...prev, focusProposal: proposal }))
              }
              break

            case 'focus:decided':
              if (event.focusPoint) {
                const fp = event.focusPoint
                setState(prev => ({ ...prev, focusPoint: fp }))
              }
              break

            case 'phase:transition':
              if (event.phase) {
                const newPhase = event.phase
                setState(prev => ({ ...prev, discussionPhase: newPhase }))
              }
              break

            case 'cross_border:triggered':
              if (event.crossBorder) {
                const cb = event.crossBorder
                // v0.3: 越境記録を conflictEdges にも蓄積（AvatarField用）
                // L2/L3のみ（L1は深設計で線を引かない）
                const newEdge: ConflictEdge = {
                  id: cb.id,
                  fromHat: cb.fromHat,
                  toHat: cb.toHat,
                  level: cb.level,
                  content: cb.content,
                  reason: cb.reason,
                  timestamp: cb.timestamp,
                  referencedCount: 0,
                }
                setState(prev => ({
                  ...prev,
                  crossBorders: [...prev.crossBorders, cb],
                  conflictEdges: [...prev.conflictEdges, newEdge],
                }))
              }
              break
          }
        }
      }
      } finally {
        reader.cancel().catch(() => {})
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [addTimeline])

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, status: 'error', error }))
  }, [])

  // v4 軽量複数シナリオ拡張: 「別の壊し方を見る」呼び出し
  const loadPreMortemVariant = useCallback(async () => {
    // setState の updater 内で最新スナップショットを掴む（再レンダーは最小1回）
    let proceed = true
    let snapshot: PipelineUI | null = null
    setState(prev => {
      if (prev.variantLoading || !prev.structured || !prev.preMortem) {
        proceed = false
        return prev
      }
      snapshot = prev
      return { ...prev, variantLoading: true, variantError: null }
    })
    if (!proceed || !snapshot) return
    const snap = snapshot as PipelineUI

    const avoidScenarios = [
      snap.preMortem!.scenarioTitle,
      ...snap.preMortemVariants.map(v => v.scenarioTitle),
    ].filter(s => typeof s === 'string' && s.trim().length > 0)

    try {
      const res = await fetch('/api/pipeline/premortem-variant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structured: snap.structured,
          facts: snap.observation?.facts ?? [],
          agents: snap.agents,
          verification: snap.verification,
          avoidScenarios,
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setState(prev => ({
          ...prev,
          variantLoading: false,
          variantError: typeof errBody.error === 'string' ? errBody.error : 'variant load failed',
        }))
        return
      }

      const variant = await res.json() as PreMortemResult
      if (!variant || typeof variant.narrative !== 'string') {
        setState(prev => ({ ...prev, variantLoading: false, variantError: 'invalid variant response' }))
        return
      }

      setState(prev => ({
        ...prev,
        preMortemVariants: [...prev.preMortemVariants, variant],
        variantLoading: false,
        variantError: null,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        variantLoading: false,
        variantError: err instanceof Error ? err.message : 'variant fetch failed',
      }))
    }
  }, [])

  // セッション復元: 過去のラウンドデータからUI状態を再構築
  const restore = useCallback((rounds: Array<{
    question?: string
    agents?: Array<{ hat: string; name: string; stance: string; intensity: number; reasoning: string; keyPoints: string[] }>
    synthesis?: { recommendation: string; nextSteps: string[] }
    verification?: { overallConsistency: number; contradictions: Array<{ hat1: string; hat2: string; description: string }> }
    observation?: ObservationResult | null
  }>) => {
    const timeline: TimelineEntry[] = []
    const allRounds: RoundData[] = []

    rounds.forEach((round, ri) => {
      // ユーザーの質問
      if (round.question) {
        timeline.push({
          id: `restored-user-${ri}`,
          type: 'user',
          stage: 'structure',
          content: round.question,
          timestamp: new Date().toISOString(),
        })
      }

      // エージェント発言
      const agents: AgentResponse[] = (round.agents ?? []).map(a => ({
        ...a,
        hat: a.hat as AgentResponse['hat'],
        stance: a.stance as AgentResponse['stance'],
        keyPoints: a.keyPoints ?? [],
        model: 'openai' as const,
      })) as AgentResponse[]

      agents.forEach(a => {
        timeline.push({
          id: `restored-agent-${a.hat}-${ri}`,
          type: 'agent',
          name: a.name,
          hat: a.hat,
          stage: 'deliberate',
          content: a.reasoning,
          stance: a.stance,
          intensity: a.intensity,
          timestamp: new Date().toISOString(),
        })
      })

      // 検証
      if (round.verification) {
        timeline.push({
          id: `restored-ri-${ri}`,
          type: 'agent',
          name: 'Ri',
          hat: 'verify',
          stage: 'verify',
          content: [
            `論理整合性: ${round.verification.overallConsistency}/100`,
            ...round.verification.contradictions.map(c => `⚡ ${c.description}`),
          ].join('\n'),
          timestamp: new Date().toISOString(),
        })
      }

      // 統合
      if (round.synthesis) {
        timeline.push({
          id: `restored-ei-${ri}`,
          type: 'synthesis',
          name: 'Ei',
          hat: 'blue',
          stage: 'synthesize',
          content: round.synthesis.recommendation,
          timestamp: new Date().toISOString(),
        })
      }

      allRounds.push({
        round: ri,
        question: round.question ?? '',
        agents,
        structured: null,
      })
    })

    const lastRound = rounds[rounds.length - 1]
    const lastAgents = (lastRound?.agents ?? []).map(a => ({
      ...a,
      hat: a.hat as AgentResponse['hat'],
      stance: a.stance as AgentResponse['stance'],
      keyPoints: a.keyPoints ?? [],
      model: 'openai' as const,
    })) as AgentResponse[]

    roundRef.current = rounds.length

    setState({
      status: 'complete',
      currentStage: null,
      timeline,
      structured: null,
      observation: lastRound?.observation ?? null,
      agents: lastAgents,
      preMortem: null,
      preMortemVariants: [],
      variantLoading: false,
      variantError: null,
      verification: lastRound?.verification ? {
        overallConsistency: lastRound.verification.overallConsistency,
        contradictions: lastRound.verification.contradictions.map(c => ({
          ...c,
          hat1: c.hat1 as HatColor,
          hat2: c.hat2 as HatColor,
          severity: 'moderate' as const,
        })),
        factGaps: [],
        hat: 'blue' as const,
        model: 'openai' as const,
      } satisfies VerificationResult : null,
      synthesis: lastRound?.synthesis ? {
        hat: 'blue' as const,
        model: 'claude' as const,
        recommendation: lastRound.synthesis.recommendation,
        nextSteps: lastRound.synthesis.nextSteps,
        dominantAgents: [],
        riskNodes: [],
        decisionMap: { nodes: [], edges: [] },
        radarChart: { axes: [], pattern: 'Balanced' },
      } as SynthesisResult : null,
      error: null,
      round: rounds.length,
      allRounds,
      thinkingAgents: [],
      focusProposal: null,
      focusPoint: null,
      discussionPhase: null,
      crossBorders: [],
      conflictEdges: [],
    })
  }, [])

  return { ...state, run, setError, restore, loadPreMortemVariant }
}
