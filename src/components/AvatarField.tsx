'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence, type TargetAndTransition } from 'framer-motion'
import type { HatColor } from '@/types'
import type { PipelineUI } from '@/lib/usePipeline'

// ============================================================
// Types
// ============================================================

type Phase = 'idle' | 'active' | 'converging' | 'unified'

type AvatarDef = {
  key: string        // AGENTS key (white, red, black, yellow, green, verify, blue)
  name: string
  kanji: string
  hex: string
  shape: 'circle' | 'flame' | 'hexagon' | 'sunburst' | 'branch' | 'mesh' | 'orb'
  animation: 'still' | 'flicker' | 'shadow' | 'pulse' | 'stretch' | 'rotate' | 'breathe'
}

export type AvatarNode = {
  id: string
  agentName: string
  kanji: string
  hat: string
  stance: string
  intensity: number
  round: number
  reasoning: string
}

type Props = {
  pipeline: PipelineUI
  fullScreen?: boolean
  onNodeClick?: (node: AvatarNode) => void
}

// ============================================================
// Avatar definitions (confirmed spec)
// ============================================================

const AVATAR_DEFS: AvatarDef[] = [
  { key: 'white',  name: 'Mei', kanji: '\u660E', hex: '#E2E8F0', shape: 'circle',   animation: 'still' },
  { key: 'red',    name: 'Jo',  kanji: '\u60C5', hex: '#EF4444', shape: 'flame',    animation: 'flicker' },
  { key: 'black',  name: 'Kai', kanji: '\u6212', hex: '#1E293B', shape: 'hexagon',  animation: 'shadow' },
  { key: 'yellow', name: 'Ko',  kanji: '\u5149', hex: '#F59E0B', shape: 'sunburst', animation: 'pulse' },
  { key: 'green',  name: 'So',  kanji: '\u5275', hex: '#22C55E', shape: 'branch',   animation: 'stretch' },
  { key: 'verify', name: 'Ri',  kanji: '\u7406', hex: '#8B5CF6', shape: 'mesh',     animation: 'rotate' },
  { key: 'blue',   name: 'Ei',  kanji: '\u53E1', hex: '#3B82F6', shape: 'orb',      animation: 'breathe' },
]

// Order in which avatars appear in the arc
const ARC_ORDER = ['white', 'red', 'black', 'yellow', 'green', 'verify', 'blue']

// ============================================================
// Shape components
// ============================================================

function AvatarShape({ def, size, phase, isThinking, isDark }: {
  def: AvatarDef
  size: number
  phase: Phase
  isThinking: boolean
  isDark: boolean
}) {
  const r = size / 2
  const glowOpacity = isDark ? (def.key === 'black' ? 0.5 : 0.35) : 0.2
  const strokeWidth = isDark ? 0 : 1.5
  const kaiVisible = def.key === 'black' ? (isThinking ? 1 : 0.35) : 1
  const lightHex = def.key === 'yellow' && !isDark ? '#D97706' : def.hex
  const meiStroke = def.key === 'white' && !isDark ? lightHex : 'none'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ opacity: kaiVisible, transition: 'opacity 0.5s' }}>
      <defs>
        <radialGradient id={`glow-${def.key}`} cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor={lightHex} stopOpacity={glowOpacity * 1.5} />
          <stop offset="100%" stopColor={lightHex} stopOpacity={0} />
        </radialGradient>
        <filter id={`blur-${def.key}`}>
          <feGaussianBlur in="SourceGraphic" stdDeviation={def.key === 'blue' ? 4 : 2.5} />
        </filter>
      </defs>

      {/* Glow backdrop */}
      <circle cx={r} cy={r} r={r * 0.9} fill={`url(#glow-${def.key})`} filter={`url(#blur-${def.key})`} />

      {/* Shape */}
      {def.shape === 'circle' && (
        <circle cx={r} cy={r} r={r * 0.45} fill={lightHex} fillOpacity={0.15} stroke={meiStroke} strokeWidth={strokeWidth || 1.5} strokeOpacity={0.6} />
      )}
      {def.shape === 'flame' && (
        <path
          d={`M${r} ${r - r * 0.45} Q${r + r * 0.35} ${r - r * 0.15} ${r + r * 0.2} ${r + r * 0.35} Q${r + r * 0.05} ${r + r * 0.45} ${r} ${r + r * 0.5} Q${r - r * 0.05} ${r + r * 0.45} ${r - r * 0.2} ${r + r * 0.35} Q${r - r * 0.35} ${r - r * 0.15} ${r} ${r - r * 0.45}`}
          fill={lightHex}
          fillOpacity={0.2}
          stroke={lightHex}
          strokeWidth={1}
          strokeOpacity={0.4}
        />
      )}
      {def.shape === 'hexagon' && (() => {
        const pts = Array.from({ length: 6 }, (_, i) => {
          const angle = (Math.PI / 3) * i - Math.PI / 2
          return `${r + r * 0.42 * Math.cos(angle)},${r + r * 0.42 * Math.sin(angle)}`
        }).join(' ')
        return <polygon points={pts} fill={lightHex} fillOpacity={isDark ? 0.15 : 0.15} stroke={isDark ? '#94A3B8' : lightHex} strokeWidth={isDark ? 2 : 1.5} strokeOpacity={isDark ? 0.7 : 0.5} />
      })()}
      {def.shape === 'sunburst' && (
        <>
          <circle cx={r} cy={r} r={r * 0.3} fill={lightHex} fillOpacity={0.2} />
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (Math.PI / 4) * i
            const x1 = r + r * 0.35 * Math.cos(angle)
            const y1 = r + r * 0.35 * Math.sin(angle)
            const x2 = r + r * 0.55 * Math.cos(angle)
            const y2 = r + r * 0.55 * Math.sin(angle)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lightHex} strokeWidth={1.5} strokeOpacity={0.4} />
          })}
        </>
      )}
      {def.shape === 'branch' && (
        <g transform={`translate(${r}, ${r})`}>
          <circle r={r * 0.2} fill={lightHex} fillOpacity={0.15} />
          {[[-0.35, -0.3], [0.35, -0.2], [-0.25, 0.35], [0.3, 0.3]].map(([dx, dy], i) => (
            <g key={i}>
              <line x1={0} y1={0} x2={r * dx} y2={r * dy} stroke={lightHex} strokeWidth={1} strokeOpacity={0.3} />
              <circle cx={r * dx} cy={r * dy} r={r * 0.1} fill={lightHex} fillOpacity={0.2} />
            </g>
          ))}
        </g>
      )}
      {def.shape === 'mesh' && (
        <g>
          <circle cx={r} cy={r} r={r * 0.4} fill="none" stroke={lightHex} strokeWidth={1} strokeOpacity={0.3} />
          <circle cx={r} cy={r} r={r * 0.25} fill="none" stroke={lightHex} strokeWidth={0.8} strokeOpacity={0.25} />
          {Array.from({ length: 6 }, (_, i) => {
            const angle = (Math.PI / 3) * i
            return <line key={i} x1={r} y1={r} x2={r + r * 0.4 * Math.cos(angle)} y2={r + r * 0.4 * Math.sin(angle)} stroke={lightHex} strokeWidth={0.6} strokeOpacity={0.2} />
          })}
        </g>
      )}
      {def.shape === 'orb' && (
        <>
          <circle cx={r} cy={r} r={r * 0.5} fill={lightHex} fillOpacity={0.1} />
          <circle cx={r} cy={r} r={r * 0.5} fill="none" stroke={lightHex} strokeWidth={1.5} strokeOpacity={0.3} />
        </>
      )}

      {/* Kanji label */}
      <text x={r} y={r + 1} textAnchor="middle" dominantBaseline="central"
        fill={lightHex} fillOpacity={phase === 'unified' ? 0.9 : 0.6}
        fontSize={size * 0.22} fontWeight="600"
        style={{ transition: 'fill-opacity 0.5s' }}
      >
        {def.kanji}
      </text>
    </svg>
  )
}

// ============================================================
// Inner animation wrapper (separates idle animation from position)
// ============================================================

type OffsetData = { floatX: number; floatY: number; pulsePeriod: number; pulseDelay: number; rotateDir: number }

function AvatarInner({ def, index, phase, isThinking, isDark, randomOffsets }: {
  def: AvatarDef
  index: number
  phase: Phase
  isThinking: boolean
  isDark: boolean
  randomOffsets: OffsetData[]
}) {
  const off = randomOffsets[index]

  // Build idle animation based on avatar type
  const getAnim = (): TargetAndTransition => {
    if (phase === 'unified') {
      // Synchronized pulse in unified phase
      return { scale: [1, 1.04, 1], transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }
    }
    if (phase !== 'active') return {}

    switch (def.animation) {
      case 'flicker':
        return {
          x: [0, off.floatX * 0.3, -off.floatX * 0.2, 0],
          y: [0, -off.floatY * 0.4, off.floatY * 0.2, 0],
          transition: { duration: off.pulsePeriod, repeat: Infinity, ease: 'easeInOut' },
        }
      case 'pulse':
        return {
          scale: [1, 1.08, 1],
          transition: { duration: off.pulsePeriod, repeat: Infinity, ease: 'easeInOut', delay: off.pulseDelay },
        }
      case 'stretch':
        return {
          scaleX: [1, 1.05, 0.97, 1],
          scaleY: [1, 0.97, 1.04, 1],
          transition: { duration: off.pulsePeriod * 1.2, repeat: Infinity, ease: 'easeInOut' },
        }
      case 'rotate':
        return {
          rotate: [0, 360 * off.rotateDir],
          transition: { duration: 12, repeat: Infinity, ease: 'linear' },
        }
      case 'breathe':
        return {
          scale: [1, 1.06, 1],
          transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
        }
      default:
        return {}
    }
  }

  return (
    <>
      {/* Glow effect - shifts toward user in unified phase */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 50% ${phase === 'unified' ? '65%' : '50%'}, ${def.hex}${isDark ? '40' : '25'}, transparent 70%)`,
          filter: `blur(${def.key === 'blue' ? 12 : 8}px)`,
        }}
      />
      {/* Animated inner */}
      <motion.div className="w-full h-full" animate={getAnim()}>
        <AvatarShape
          def={def}
          size={72}
          phase={phase}
          isThinking={isThinking}
          isDark={isDark}
        />
      </motion.div>
    </>
  )
}

// ============================================================
// Main component
// ============================================================

export default function AvatarField({ pipeline, fullScreen, onNodeClick }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [isDark, setIsDark] = useState(true)

  // Track theme
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Derive visible avatars from pipeline state
  const visibleKeys = useMemo(() => {
    const keys = new Set<string>()
    // thinkingAgents tracks agent:start and stage:start events
    for (const hat of pipeline.thinkingAgents) {
      keys.add(hat)
    }
    // Also include completed agents
    for (const agent of pipeline.agents) {
      keys.add(agent.hat)
    }
    // Observation done → white visible
    if (pipeline.observation) keys.add('white')
    // Verification done → verify visible
    if (pipeline.verification) keys.add('verify')
    // Synthesis done → blue visible
    if (pipeline.synthesis) keys.add('blue')
    return keys
  }, [pipeline.thinkingAgents, pipeline.agents, pipeline.observation, pipeline.verification, pipeline.synthesis])

  // Phase transitions (SSE-driven)
  useEffect(() => {
    if (pipeline.status === 'idle') {
      setPhase('idle')
      return
    }
    if (pipeline.status === 'running') {
      if (pipeline.currentStage === 'synthesize') {
        setPhase('converging')
        // After converging animation (0.8s + 0.3s pause), transition to unified
        const timer = setTimeout(() => setPhase('unified'), 1100)
        return () => clearTimeout(timer)
      }
      setPhase('active')
      return
    }
    if (pipeline.status === 'complete') {
      setPhase('unified')
    }
  }, [pipeline.status, pipeline.currentStage])

  // Stable random offsets per avatar (useMemo to prevent re-render jitter)
  const randomOffsets = useMemo(() =>
    AVATAR_DEFS.map((_, i) => ({
      floatX: Math.sin(i * 2.3 + 1.7) * 12,
      floatY: Math.cos(i * 1.9 + 0.5) * 10,
      pulsePeriod: 2.5 + (i % 3) * 0.7,
      pulseDelay: i * 0.15,
      rotateDir: i % 2 === 0 ? 1 : -1,
    })), [])

  // Calculate positions based on phase
  const getPosition = useCallback((index: number, total: number) => {
    if (phase === 'idle') {
      return { x: 0, y: 0, scale: 0, opacity: 0 }
    }

    if (phase === 'active') {
      // Scattered positions — loose circle with random offsets
      const angle = (2 * Math.PI / total) * index - Math.PI / 2
      const radius = 110
      const off = randomOffsets[index]
      return {
        x: Math.cos(angle) * radius + off.floatX,
        y: Math.sin(angle) * radius + off.floatY,
        scale: 1,
        opacity: 1,
      }
    }

    if (phase === 'converging') {
      // Semi-arc alignment
      const arcSpan = Math.PI * 0.85
      const startAngle = -Math.PI / 2 - arcSpan / 2
      const angle = startAngle + (arcSpan / (total - 1)) * index
      const radius = 120
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius + 15,
        scale: 1,
        opacity: 1,
      }
    }

    // unified: same arc but moved forward (toward user, i.e. +y)
    const arcSpan = Math.PI * 0.85
    const startAngle = -Math.PI / 2 - arcSpan / 2
    const angle = startAngle + (arcSpan / (total - 1)) * index
    const radius = 120
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius + 15 + 12,
      scale: 1.15,
      opacity: 1,
    }
  }, [phase, randomOffsets])

  // Click handler
  const handleClick = useCallback((def: AvatarDef) => {
    if (!onNodeClick) return
    const agent = pipeline.agents.find(a => a.hat === def.key)
    if (agent) {
      onNodeClick({
        id: `avatar-${def.key}`,
        agentName: def.name,
        kanji: def.kanji,
        hat: def.key,
        stance: agent.stance,
        intensity: agent.intensity,
        round: pipeline.round,
        reasoning: agent.reasoning,
      })
    }
  }, [onNodeClick, pipeline.agents, pipeline.round])

  const visibleAvatars = AVATAR_DEFS.filter(d => visibleKeys.has(d.key))

  return (
    <div
      className={`relative ${fullScreen ? 'w-full h-full' : 'w-full aspect-square'} overflow-hidden`}
      style={{
        background: isDark
          ? 'radial-gradient(ellipse at center, #0a0a1a 0%, #060608 70%)'
          : 'radial-gradient(ellipse at center, #e8ecf5 0%, #f0f2f5 70%)',
      }}
    >
      {/* Dot grid background */}
      <div className="absolute inset-0 map-dots opacity-30" />

      {/* Center point / question indicator */}
      {phase !== 'idle' && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            className="w-3 h-3 rounded-full"
            style={{ background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }}
            animate={phase === 'unified' ? { scale: [1, 1.5, 1], opacity: [0.15, 0.3, 0.15] } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
      )}

      {/* Avatars */}
      <div className="absolute left-1/2 top-1/2" style={{ transform: 'translate(-50%, -50%)' }}>
        <AnimatePresence>
          {visibleAvatars.map((def) => {
            const arcIndex = ARC_ORDER.indexOf(def.key)
            const pos = getPosition(arcIndex, ARC_ORDER.length)
            const isThinking = pipeline.thinkingAgents.includes(def.key as HatColor) &&
                               !pipeline.agents.some(a => a.hat === def.key)

            return (
              <motion.div
                key={def.key}
                className="absolute cursor-pointer"
                style={{
                  width: 72,
                  height: 72,
                  marginLeft: -36,
                  marginTop: -36,
                }}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: pos.x,
                  y: pos.y,
                  scale: pos.scale,
                  opacity: pos.opacity,
                }}
                exit={{ scale: 0, opacity: 0 }}
                transition={
                  phase === 'converging'
                    ? { duration: 0.8, delay: arcIndex * 0.05, ease: 'easeInOut' }
                    : phase === 'unified'
                    ? { duration: 0.6, ease: 'easeOut' }
                    : { duration: 0.5, ease: 'easeOut' }
                }
                onClick={() => handleClick(def)}
                whileHover={{ scale: (pos.scale || 1) * 1.1 }}
              >
                {/* Inner animation wrapper (idle/individual animations) */}
                <AvatarInner
                  def={def}
                  index={arcIndex}
                  phase={phase}
                  isThinking={isThinking}
                  isDark={isDark}
                  randomOffsets={randomOffsets}
                />

                {/* Name label */}
                <motion.span
                  className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap font-medium"
                  style={{ color: def.hex }}
                  animate={{ opacity: phase === 'unified' ? 0.8 : 0.4 }}
                >
                  {def.name}
                </motion.span>

                {/* Thinking indicator */}
                {isThinking && (
                  <motion.div
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
                    style={{ background: def.hex }}
                    animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0.4, 0.8] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Phase indicator */}
      {phase !== 'idle' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <span className="text-[10px] px-3 py-1 rounded-full" style={{
            background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
          }}>
            {phase === 'active' && `${visibleAvatars.length} perspectives`}
            {phase === 'converging' && 'Converging...'}
            {phase === 'unified' && 'Together'}
          </span>
        </div>
      )}
    </div>
  )
}
