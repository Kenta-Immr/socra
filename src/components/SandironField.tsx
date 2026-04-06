'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { AGENTS } from '@/types'
import type { HatColor } from '@/types'
import type { PipelineUI } from '@/lib/usePipeline'

// ============================================================
// Types
// ============================================================

export interface SandironNode {
  id: string
  agentId: string
  agentName: string
  kanji: string
  hat: string
  stance: string
  intensity: number
  round: number
  summary: string
  reasoning: string
}

type Props = {
  pipeline: PipelineUI
  fullScreen?: boolean
  onNodeClick?: (node: SandironNode) => void
}

// ============================================================
// Constants
// ============================================================

const HAT_COLORS: Record<string, string> = {
  white:  '#E2E8F0',
  red:    '#EF4444',
  black:  '#64748B', // lighter for visibility
  yellow: '#F59E0B',
  green:  '#22C55E',
  blue:   '#3B82F6',
  verify: '#9CA3AF',
}

const STANCE_HUE = {
  support: { r: 74, g: 222, b: 128 },   // green
  oppose:  { r: 248, g: 113, b: 113 },  // red
  caution: { r: 250, g: 204, b: 21 },   // yellow
}

// ============================================================
// Helpers
// ============================================================

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`
}

// ============================================================
// Agent geometry per frame
// ============================================================

interface AgentGeo {
  x: number
  y: number
  hat: string
  name: string
  kanji: string
  stance: string
  intensity: number // 1-5
  isDominant: boolean
  color: [number, number, number]
  baseRadius: number
}

// ============================================================
// Component
// ============================================================

export default function SandironField({ pipeline, fullScreen, onNodeClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const tRef = useRef(0)

  // ripple queue
  const ripplesRef = useRef<Array<{ cx: number; cy: number; r: number; alpha: number }>>([])

  // thinking animation
  const thinkingPhaseRef = useRef(0)
  const prevThinkingRef = useRef(false)

  // theme from html attribute
  const [isDark, setIsDark] = useState(true)
  useEffect(() => {
    const check = () => {
      const html = document.documentElement
      setIsDark(html.getAttribute('data-theme') !== 'light')
    }
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // hover
  const [hovered, setHovered] = useState<{ name: string; kanji: string; stance: string; x: number; y: number } | null>(null)

  // cached geometry
  const geoRef = useRef<AgentGeo[]>([])
  const centerRef = useRef({ x: 0, y: 0 })
  const orbitRef = useRef(200)

  // ============================================================
  // Build geometry from pipeline data
  // ============================================================

  const buildGeo = useCallback((W: number, H: number) => {
    const cx = W / 2
    const cy = H / 2
    centerRef.current = { x: cx, y: cy }
    const orbit = Math.min(W, H) * 0.35
    orbitRef.current = orbit

    const dominantHats = pipeline.synthesis?.dominantAgents ?? []

    // Collect latest agent data per hat
    const agentMap: Record<string, { stance: string; intensity: number; name: string; kanji: string }> = {}

    // From past rounds
    for (const rd of pipeline.allRounds) {
      for (const a of rd.agents) {
        const info = AGENTS[a.hat]
        agentMap[a.hat] = { stance: a.stance, intensity: a.intensity, name: info?.name ?? a.hat, kanji: info?.kanji ?? '' }
      }
    }
    // From current round
    for (const a of pipeline.agents) {
      const info = AGENTS[a.hat]
      agentMap[a.hat] = { stance: a.stance, intensity: a.intensity, name: info?.name ?? a.hat, kanji: info?.kanji ?? '' }
    }
    // 明(white) — 事実収集者。observationがあれば存在
    if (pipeline.observation && !agentMap['white']) {
      const info = AGENTS['white']
      const factCount = pipeline.observation.facts?.length ?? 0
      agentMap['white'] = { stance: 'support', intensity: Math.min(factCount, 5), name: info?.name ?? 'Mei', kanji: info?.kanji ?? '明' }
    }
    // 理(verify) — 検証者。stanceはneutral、intensityは矛盾数ベース
    if (pipeline.verification && !agentMap['verify']) {
      const info = AGENTS['verify']
      const contradictions = pipeline.verification.contradictions?.length ?? 0
      agentMap['verify'] = { stance: 'neutral', intensity: Math.min(contradictions + 1, 5), name: info?.name ?? 'Ri', kanji: info?.kanji ?? '理' }
    }
    // 叡(blue) — 統合者。synthesisがあれば存在
    if (pipeline.synthesis && !agentMap['blue']) {
      const info = AGENTS['blue']
      agentMap['blue'] = { stance: 'support', intensity: 5, name: info?.name ?? 'Ei', kanji: info?.kanji ?? '叡' }
    }

    // 7体全員を周囲に配置（中央は「問い」の核）
    const hatOrder: (HatColor | 'verify')[] = ['white', 'red', 'black', 'yellow', 'green', 'verify', 'blue']
    const geos: AgentGeo[] = []

    hatOrder.forEach((hat, idx) => {
      const data = agentMap[hat]
      if (!data) return
      const n = hatOrder.length
      const angle = (idx / n) * Math.PI * 2 - Math.PI / 2
      // 叡(blue)はやや中央寄り（統合者）、他は均等配置
      const isEi = hat === 'blue'
      const r = isEi ? orbit * 0.6 : orbit
      const color = hexToRgb(HAT_COLORS[hat] ?? '#94a3b8')
      // intensity の絶対値でビジュアル強度を決定（色ではなく数値が支配する）
      const absIntensity = Math.abs(data.intensity)
      const baseRadius = 5 + (absIntensity / 5) * 12  // 0→5px, 5→17px
      geos.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        hat,
        name: data.name,
        kanji: data.kanji,
        stance: data.stance,
        intensity: data.intensity,
        isDominant: dominantHats.includes(hat as HatColor),
        color,
        baseRadius: isEi ? Math.max(baseRadius, 10) : baseRadius, // 叡は最低サイズ保証
      })
    })

    geoRef.current = geos
  }, [pipeline])

  // ============================================================
  // Magnetic field vector at any point (プロトタイプ忠実移植)
  // ============================================================

  const fieldAt = useCallback((
    x: number, y: number, geos: AgentGeo[], cx: number, cy: number, t: number,
  ): { x: number; y: number } => {
    let bx = 0, by = 0

    // 中央核の引力
    const dxc = cx - x, dyc = cy - y
    const dc = Math.sqrt(dxc * dxc + dyc * dyc) + 1
    bx += dxc / (dc * dc) * 800
    by += dyc / (dc * dc) * 800

    // 各エージェントの影響（引力・斥力・揺れ）
    for (const ag of geos) {
      const dx = ag.x - x, dy = ag.y - y
      const d = Math.sqrt(dx * dx + dy * dy) + 1

      let charge = ag.stance === 'support' ? 1.0
        : ag.stance === 'oppose' ? -1.0
        : Math.sin(t * 1.5 + ag.x * 0.01) * 0.8  // caution = 揺れ

      // intensityで影響の強さをスケール
      charge *= (ag.intensity / 5) * 1.5 + 0.3  // intensity 0でも微弱な影響

      const strength = charge * 400 / (d * d)
      bx += dx * strength
      by += dy * strength
    }

    const mag = Math.sqrt(bx * bx + by * by) + 0.001
    return { x: bx / mag, y: by / mag }
  }, [])

  // ============================================================
  // Trace a field line (磁場ベクトルに沿って追跡)
  // ============================================================

  const traceLine = useCallback((
    startX: number, startY: number, geos: AgentGeo[], cx: number, cy: number,
    steps: number, stepSize: number, t: number, _sourceStance: string,
  ) => {
    const pts: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]
    let px = startX, py = startY

    for (let s = 0; s < steps; s++) {
      const f = fieldAt(px, py, geos, cx, cy, t)
      px += f.x * stepSize
      py += f.y * stepSize

      // 中央核に近すぎたら停止
      const dc = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
      if (dc < 15) break

      pts.push({ x: px, y: py })
    }
    return pts
  }, [fieldAt])

  // ============================================================
  // Draw
  // ============================================================

  const draw = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    const geos = geoRef.current
    const { x: cx, y: cy } = centerRef.current
    const isThinking = pipeline.status === 'running'

    const BG = isDark ? '#050a18' : '#f0f4ff'
    const CORE_COLOR = isDark ? [255, 253, 240] : [30, 64, 175]

    // Background
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // Subtle background dots (dark mode only)
    if (isDark) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      for (let i = 0; i < 60; i++) {
        const sx = (Math.sin(i * 127.1 + 311.7) * 0.5 + 0.5) * W
        const sy = (Math.sin(i * 269.5 + 183.3) * 0.5 + 0.5) * H
        const ss = 0.4 + Math.sin(t * 0.3 + i) * 0.2
        ctx.beginPath()
        ctx.arc(sx, sy, ss, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      // Light mode: subtle grid
      ctx.strokeStyle = 'rgba(30,64,175,0.05)'
      ctx.lineWidth = 0.5
      for (let gx = 0; gx < W; gx += 30) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }
      for (let gy = 0; gy < H; gy += 30) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke() }
    }

    if (geos.length === 0 && !isThinking) return

    // ── Field lines ──
    for (let ai = 0; ai < geos.length; ai++) {
      const ag = geos[ai]

      // Thinking: only show lit agents
      if (isThinking) {
        const litIdx = Math.floor(thinkingPhaseRef.current) % Math.max(geos.length, 1)
        if (ai > litIdx) continue
      }

      // 力線の本数・太さ・透明度 = intensity の絶対値に厳密対応
      // intensity 0 でも1本の薄い力線を残す（全員が力場に存在する）
      const absInt = Math.abs(ag.intensity)
      const lineCount = absInt === 0 ? 1 : Math.round(absInt * 2)  // 0→1本, 1→2, 3→6, 5→10
      const stanceHue = STANCE_HUE[ag.stance as keyof typeof STANCE_HUE] ?? STANCE_HUE.caution

      for (let li = 0; li < lineCount; li++) {
        const spreadAngle = (li / lineCount) * Math.PI * 2
        const startDist = ag.baseRadius + 5
        const sx = ag.x + Math.cos(spreadAngle) * startDist
        const sy = ag.y + Math.sin(spreadAngle) * startDist

        const pts = traceLine(sx, sy, geos, cx, cy, 150, 2.5, t, ag.stance)
        if (pts.length < 2) continue

        // Line width: intensity の絶対値に厳密対応
        const lineWidth = 0.3 + (absInt / 5) * 2.2  // 1→0.74, 3→1.62, 5→2.5

        // Alpha: intensity の絶対値に対応
        const baseAlpha = 0.15 + (absInt / 5) * 0.5  // 1→0.25, 3→0.45, 5→0.65
        const thinkingDim = isThinking ? 0.6 : 1

        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let pi = 1; pi < pts.length; pi++) ctx.lineTo(pts[pi].x, pts[pi].y)

        ctx.strokeStyle = rgba(stanceHue.r, stanceHue.g, stanceHue.b, baseAlpha * thinkingDim)
        ctx.lineWidth = lineWidth
        if (isDark) { ctx.shadowColor = rgba(stanceHue.r, stanceHue.g, stanceHue.b, 0.3); ctx.shadowBlur = ag.isDominant ? 8 : 3 }
        ctx.stroke()
        ctx.shadowBlur = 0
      }
    }

    // ── Ripples ──
    const ripples = ripplesRef.current
    for (let ri = ripples.length - 1; ri >= 0; ri--) {
      const rp = ripples[ri]
      rp.r += 3
      rp.alpha -= 0.015
      if (rp.alpha <= 0) { ripples.splice(ri, 1); continue }
      ctx.beginPath()
      ctx.arc(rp.cx, rp.cy, rp.r, 0, Math.PI * 2)
      ctx.strokeStyle = isDark ? rgba(196, 181, 253, rp.alpha) : rgba(30, 64, 175, rp.alpha)
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // ── Central core (叡) ──
    const corePulse = isThinking ? 0.6 + 0.4 * Math.sin(t * 4) : 1
    const coreR = 12 + Math.sin(t * (isThinking ? 3 : 1.2)) * (isThinking ? 3 : 1.5)

    // Outer glow
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 4)
    coreGrad.addColorStop(0, rgba(CORE_COLOR[0], CORE_COLOR[1], CORE_COLOR[2], 0.25 * corePulse))
    coreGrad.addColorStop(0.5, rgba(CORE_COLOR[0], CORE_COLOR[1], CORE_COLOR[2], 0.08 * corePulse))
    coreGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = coreGrad
    ctx.beginPath()
    ctx.arc(cx, cy, coreR * 4, 0, Math.PI * 2)
    ctx.fill()

    // Inner core
    ctx.beginPath()
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
    ctx.fillStyle = isDark ? '#ffffff' : '#3b82f6'
    ctx.shadowColor = isDark ? '#a78bfa' : '#3b82f6'
    ctx.shadowBlur = isDark ? 18 : 10
    ctx.fill()
    ctx.shadowBlur = 0

    // 中央は「問い」の核（叡ではない）
    if (pipeline.structured?.clarified) {
      const topic = pipeline.structured.clarified
      const label = topic.length > 18 ? topic.slice(0, 18) + '…' : topic
      ctx.font = `${Math.min(10, 800 / label.length)}px sans-serif`
      ctx.fillStyle = isDark ? 'rgba(226,232,240,0.5)' : 'rgba(30,58,138,0.4)'
      ctx.textAlign = 'center'
      ctx.fillText(label, cx, cy + coreR + 14)
    }

    // ── Agent nodes ──
    for (let ai = 0; ai < geos.length; ai++) {
      const ag = geos[ai]

      // Thinking: dim unlit agents
      let nodeAlpha = 1
      if (isThinking) {
        const litIdx = Math.floor(thinkingPhaseRef.current) % Math.max(geos.length, 1)
        nodeAlpha = ai <= litIdx ? 1 : 0.15
      }

      const absInt = Math.abs(ag.intensity)
      const pulse = Math.sin(t * 3 + ai * 1.2) * (absInt / 5) * 2.5  // intensity高い→脈動大きい
      const r = ag.baseRadius + pulse

      // Glow: intensity の絶対値に比例
      const glowR = r * (1.5 + (absInt / 5) * 3)  // 0→1.5倍, 5→4.5倍
      const glowGrad = ctx.createRadialGradient(ag.x, ag.y, 0, ag.x, ag.y, glowR)
      const [gr, gg, gb] = ag.color
      glowGrad.addColorStop(0, rgba(gr, gg, gb, 0.3 * nodeAlpha))
      glowGrad.addColorStop(1, 'transparent')
      ctx.fillStyle = glowGrad
      ctx.beginPath()
      ctx.arc(ag.x, ag.y, glowR, 0, Math.PI * 2)
      ctx.fill()

      // Core dot
      ctx.beginPath()
      ctx.arc(ag.x, ag.y, r, 0, Math.PI * 2)
      ctx.fillStyle = rgba(gr, gg, gb, nodeAlpha)
      if (isDark) { ctx.shadowColor = rgba(gr, gg, gb, 0.5); ctx.shadowBlur = 2 + (absInt / 5) * 14 }
      ctx.fill()
      ctx.shadowBlur = 0

      // Inner highlight
      ctx.beginPath()
      ctx.arc(ag.x, ag.y, r * 0.35, 0, Math.PI * 2)
      ctx.fillStyle = rgba(255, 255, 255, 0.5 * nodeAlpha)
      ctx.fill()

      // Dominant ring（intensity 3以上で表示）
      if (absInt >= 3) {
        ctx.beginPath()
        ctx.arc(ag.x, ag.y, r + 4, 0, Math.PI * 2)
        ctx.strokeStyle = rgba(gr, gg, gb, (absInt / 5) * 0.7 * nodeAlpha)
        ctx.lineWidth = 0.8 + (absInt / 5) * 1.5
        ctx.stroke()
      }

      // Stance indicator
      const stanceHue = STANCE_HUE[ag.stance as keyof typeof STANCE_HUE]
      if (stanceHue) {
        const sym = ag.stance === 'support' ? '▲' : ag.stance === 'oppose' ? '▼' : '◆'
        ctx.font = '9px sans-serif'
        ctx.fillStyle = rgba(stanceHue.r, stanceHue.g, stanceHue.b, 0.8 * nodeAlpha)
        ctx.textAlign = 'center'
        ctx.fillText(sym, ag.x, ag.y - r - 6)
      }

      // Name label
      ctx.font = `${ag.isDominant ? 'bold ' : ''}10px sans-serif`
      ctx.fillStyle = isDark ? rgba(226, 232, 240, 0.7 * nodeAlpha) : rgba(30, 58, 138, 0.7 * nodeAlpha)
      ctx.textAlign = 'center'
      ctx.fillText(`${ag.kanji} ${ag.name}`, ag.x, ag.y + r + 14)
    }

    // ── Tension arcs between oppose agents ──
    const opposeGeos = geos.filter(g => g.stance === 'oppose')
    for (let i = 0; i < opposeGeos.length; i++) {
      for (let j = i + 1; j < opposeGeos.length; j++) {
        const a = opposeGeos[i], b = opposeGeos[j]
        ctx.beginPath()
        ctx.setLineDash([5, 7])
        const midX = (a.x + b.x) / 2 + Math.sin(t) * 15
        const midY = (a.y + b.y) / 2 + Math.cos(t) * 15
        ctx.moveTo(a.x, a.y)
        ctx.quadraticCurveTo(midX, midY, b.x, b.y)
        ctx.strokeStyle = isDark ? rgba(248, 113, 113, 0.15) : rgba(239, 68, 68, 0.12)
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // ── Legend ──
    const legendY = H - 16
    const legendX = 14
    ctx.font = '9px sans-serif'
    const legends = [
      { sym: '▲', label: 'Support', c: STANCE_HUE.support },
      { sym: '◆', label: 'Caution', c: STANCE_HUE.caution },
      { sym: '▼', label: 'Oppose', c: STANCE_HUE.oppose },
    ]
    legends.forEach((lg, i) => {
      const lx = legendX + i * 70
      ctx.fillStyle = rgba(lg.c.r, lg.c.g, lg.c.b, 0.7)
      ctx.textAlign = 'left'
      ctx.fillText(`${lg.sym} ${lg.label}`, lx, legendY)
    })

    // ── Thinking dots ──
    if (isThinking) {
      for (let di = 0; di < 3; di++) {
        const alpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 2.5 - di * 0.8))
        ctx.beginPath()
        ctx.arc(cx + (di - 1) * 12, H - 36, 3, 0, Math.PI * 2)
        ctx.fillStyle = isDark ? rgba(196, 181, 253, alpha) : rgba(30, 64, 175, alpha)
        ctx.fill()
      }
    }
  }, [pipeline, isDark, traceLine])

  // ============================================================
  // Resize + rebuild
  // ============================================================

  const rebuild = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const W = container.clientWidth
    const H = container.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(dpr, dpr)
    buildGeo(W, H)
  }, [buildGeo])

  // ============================================================
  // Animation loop
  // ============================================================

  useEffect(() => {
    rebuild()
    const canvas = canvasRef.current
    if (!canvas) return

    let last = performance.now()
    const isThinking = () => pipeline.status === 'running'

    const loop = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      tRef.current += dt

      if (isThinking()) thinkingPhaseRef.current += dt * 4

      // Detect thinking→done transition: fire ripple
      const wasThinking = prevThinkingRef.current
      prevThinkingRef.current = isThinking()
      if (wasThinking && !isThinking()) {
        ripplesRef.current.push({ cx: centerRef.current.x, cy: centerRef.current.y, r: 14, alpha: 0.8 })
      }

      const ctx = canvas.getContext('2d')
      if (ctx) {
        const W = canvas.width / (window.devicePixelRatio || 1)
        const H = canvas.height / (window.devicePixelRatio || 1)
        draw(ctx, W, H, tRef.current)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [rebuild, draw, pipeline.status])

  // Rebuild when data changes
  useEffect(() => { rebuild() }, [pipeline.agents, pipeline.synthesis, pipeline.allRounds, rebuild])

  // Resize observer
  useEffect(() => {
    const ro = new ResizeObserver(() => rebuild())
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [rebuild])

  // ============================================================
  // Mouse interaction
  // ============================================================

  const hitTest = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top
    for (const ag of geoRef.current) {
      const dx = mx - ag.x, dy = my - ag.y
      if (Math.sqrt(dx * dx + dy * dy) < ag.baseRadius + 12) return ag
    }
    return null
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const hit = hitTest(e.clientX, e.clientY)
    setHovered(hit ? { name: hit.name, kanji: hit.kanji, stance: hit.stance, x: e.clientX, y: e.clientY } : null)
  }, [hitTest])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const hit = hitTest(e.clientX, e.clientY)
    if (!hit || !onNodeClick) return
    // Find latest response for this agent
    const allAgents = [...(pipeline.allRounds.flatMap(r => r.agents)), ...pipeline.agents]
    const resp = [...allAgents].reverse().find(a => a.hat === hit.hat)
    if (resp) {
      onNodeClick({
        id: `${hit.hat}-${pipeline.round}`,
        agentId: hit.hat,
        agentName: hit.name,
        kanji: hit.kanji,
        hat: hit.hat,
        stance: resp.stance,
        intensity: resp.intensity,
        round: pipeline.round,
        summary: resp.keyPoints?.[0] ?? '',
        reasoning: resp.reasoning,
      })
    }
  }, [hitTest, onNodeClick, pipeline])

  // ============================================================
  // Render
  // ============================================================

  const hasData = pipeline.agents.length > 0 || pipeline.allRounds.length > 0

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${fullScreen ? 'h-full' : 'h-[420px]'} select-none`}
      style={{ cursor: hovered ? 'pointer' : 'default' }}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
        onClick={handleClick}
      />

      {/* Hover tooltip */}
      {hovered && (
        <div
          className="pointer-events-none fixed z-50 px-3 py-1.5 rounded-lg text-sm font-medium shadow-xl"
          style={{
            left: hovered.x + 14,
            top: hovered.y - 30,
            background: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(248,250,255,0.95)',
            color: isDark ? '#e2e8f0' : '#1e3a8a',
            border: isDark ? '1px solid rgba(196,181,253,0.3)' : '1px solid rgba(30,64,175,0.2)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span>{hovered.kanji} {hovered.name}</span>
          <span className="ml-2 text-xs opacity-75 capitalize">{hovered.stance}</span>
        </div>
      )}

      {/* Empty state */}
      {!hasData && pipeline.status !== 'running' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm opacity-30 text-center px-8"
            style={{ color: isDark ? '#e2e8f0' : '#1e3a8a' }}
          >
            Share your question — the field will take shape
          </p>
        </div>
      )}
    </div>
  )
}
