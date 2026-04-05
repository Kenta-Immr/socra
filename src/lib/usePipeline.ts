'use client'

import { useState, useCallback } from 'react'
import type { SSEEvent, PipelineStage, AgentResponse, StructuredQuestion, ObservationResult, VerificationResult, SynthesisResult } from '@/types'

export type TimelineEntry = {
  id: string
  type: 'system' | 'agent' | 'synthesis'
  name?: string
  hat?: string
  stage: PipelineStage
  content: string
  stance?: string
  intensity?: number
  timestamp: string
}

export type PipelineUI = {
  status: 'idle' | 'running' | 'complete' | 'error'
  currentStage: PipelineStage | null
  timeline: TimelineEntry[]
  structured: StructuredQuestion | null
  observation: ObservationResult | null
  agents: AgentResponse[]
  verification: VerificationResult | null
  synthesis: SynthesisResult | null
  error: string | null
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  structure: 'Structuring your question...',
  observe: 'Mei is gathering facts...',
  deliberate: 'Your team is thinking...',
  verify: 'Ri is checking logic...',
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
    synthesis: null,
    error: null,
  })

  const addTimeline = useCallback((entry: TimelineEntry) => {
    setState(prev => ({ ...prev, timeline: [...prev.timeline, entry] }))
  }, [])

  const run = useCallback(async (question: string, context?: string) => {
    setState({
      status: 'running',
      currentStage: 'structure',
      timeline: [],
      structured: null,
      observation: null,
      agents: [],
      verification: null,
      synthesis: null,
      error: null,
    })

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context }),
      })

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
            case 'stage:start':
              setState(prev => ({ ...prev, currentStage: event.stage! }))
              addTimeline({
                id: `stage-${event.stage}-start`,
                type: 'system',
                stage: event.stage!,
                content: STAGE_LABELS[event.stage!],
                timestamp: event.timestamp,
              })
              break

            case 'stage:complete':
              if (event.stage === 'structure') {
                setState(prev => ({ ...prev, structured: event.data as StructuredQuestion }))
              } else if (event.stage === 'observe') {
                const obs = event.data as ObservationResult
                setState(prev => ({ ...prev, observation: obs }))
                addTimeline({
                  id: 'mei-facts',
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
                  id: 'ri-verify',
                  type: 'agent',
                  name: 'Ri',
                  hat: 'verify',
                  stage: 'verify',
                  content: `Consistency: ${ver.overallConsistency}/100 · ${ver.contradictions.length} contradiction(s)`,
                  timestamp: event.timestamp,
                })
              } else if (event.stage === 'synthesize') {
                const syn = event.data as SynthesisResult
                setState(prev => ({ ...prev, synthesis: syn }))
                addTimeline({
                  id: 'ei-synthesis',
                  type: 'synthesis',
                  name: 'Ei',
                  hat: 'blue',
                  stage: 'synthesize',
                  content: syn.recommendation,
                  timestamp: event.timestamp,
                })
              }
              break

            case 'agent:complete':
              if (event.stage === 'deliberate') {
                const agent = event.data as AgentResponse
                setState(prev => ({ ...prev, agents: [...prev.agents, agent] }))
                addTimeline({
                  id: `agent-${agent.hat}`,
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

  return { ...state, run }
}
