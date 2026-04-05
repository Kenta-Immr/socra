'use client'

import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import * as d3 from 'd3'
import { AGENTS } from '@/types'
import type { PipelineUI } from '@/lib/usePipeline'
import type { MapNode, MapEdge, HatColor } from '@/types'
import type { Theme } from '@/hooks/useTheme'

type Props = {
  pipeline: PipelineUI
  onNodeClick?: (nodeId: string) => void
  theme: Theme
  round: number
}

// ── テーマ色 ─────────────────────────────────────────────
function themeColors(theme: Theme) {
  return theme === 'dark' ? {
    nodeBg: '#0a0a0a',
    nodeFillAlpha: '22',
    labelColor: '#999',
    edgeDefault: '#556',
    edgeDeepen: '#445',
    ringStroke: '#1a1a2a',
    userNodeBg: '#1a1a3a',
  } : {
    nodeBg: '#f8f9fa',
    nodeFillAlpha: '25',
    labelColor: '#555',
    edgeDefault: '#bbb',
    edgeDeepen: '#ccc',
    ringStroke: '#e0e0f0',
    userNodeBg: '#e8ecf5',
  }
}

// ── 累積ノード型（round付き） ────────────────────────────
interface RoundNode extends MapNode {
  round: number
}
interface RoundEdge extends MapEdge {
  round: number
}

// ── ノードデータ構築（round付き） ────────────────────────
function buildCurrentRoundNodes(pipeline: PipelineUI, round: number): { nodes: RoundNode[]; edges: RoundEdge[] } {
  const nodes: RoundNode[] = []
  const edges: RoundEdge[] = []

  // ユーザーの質問ノード
  if (pipeline.structured) {
    nodes.push({
      id: `user-r${round}`,
      label: pipeline.structured.original.slice(0, 40),
      type: 'user',
      round,
    })

    // 質問（構造化された問い）
    nodes.push({
      id: `question-r${round}`,
      label: pipeline.structured.clarified.slice(0, 50),
      type: 'question',
      round,
    })
    edges.push({ source: `user-r${round}`, target: `question-r${round}`, type: 'leads_to', round })
  }

  // 事実ノード（最大3個）
  if (pipeline.observation) {
    pipeline.observation.facts.slice(0, 3).forEach((fact, i) => {
      nodes.push({ id: `fact-r${round}-${i}`, label: fact.content.slice(0, 30), type: 'fact', hat: 'white', round })
      edges.push({ source: `question-r${round}`, target: `fact-r${round}-${i}`, type: 'leads_to', round })
    })
  }

  // エージェント
  pipeline.agents.forEach(agent => {
    nodes.push({
      id: `agent-${agent.hat}-r${round}`,
      label: agent.keyPoints[0]?.slice(0, 30) ?? agent.reasoning.slice(0, 30),
      type: 'perspective',
      hat: agent.hat,
      stance: agent.stance,
      intensity: agent.intensity,
      round,
    })
    edges.push({ source: `question-r${round}`, target: `agent-${agent.hat}-r${round}`, type: 'leads_to', round })
  })

  // 矛盾エッジ
  if (pipeline.verification) {
    pipeline.verification.contradictions.forEach(c => {
      edges.push({ source: `agent-${c.hat1}-r${round}`, target: `agent-${c.hat2}-r${round}`, type: 'contradicts', round })
    })
  }

  // 統合
  if (pipeline.synthesis) {
    nodes.push({ id: `synthesis-r${round}`, label: 'Ei', type: 'synthesis', round })
    pipeline.agents.forEach(agent => {
      edges.push({ source: `agent-${agent.hat}-r${round}`, target: `synthesis-r${round}`, type: 'leads_to', round })
    })

    // 前ラウンドの統合→今ラウンドのユーザー質問を繋ぐ
    if (round > 0) {
      edges.push({ source: `synthesis-r${round - 1}`, target: `user-r${round}`, type: 'deepens', round })
    }
  }

  return { nodes, edges }
}

// ── ノード色・サイズ ─────────────────────────────────────
function nodeColor(node: RoundNode): string {
  if (node.type === 'user') return '#8B5CF6'  // 紫 — ユーザー
  if (node.type === 'question') return '#3B82F6'
  if (node.type === 'synthesis') return AGENTS.blue.hex
  if (node.hat) return AGENTS[node.hat as HatColor]?.hex ?? '#6B7280'
  return '#6B7280'
}

function nodeRadius(node: RoundNode): number {
  if (node.type === 'user') return 22
  if (node.type === 'question') return 26
  if (node.type === 'synthesis') return 22
  if (node.type === 'perspective') return 18
  if (node.type === 'fact') return 9
  return 7
}

function nodeKanji(node: { type: string; hat?: HatColor }): string {
  if (node.type === 'user') return 'あ'  // ユーザー
  if (node.type === 'question') return '?'
  if (node.type === 'synthesis') return '叡'
  if (node.hat) return AGENTS[node.hat as HatColor]?.kanji ?? ''
  return ''
}

function edgeColor(edge: RoundEdge, theme: Theme): string {
  const tc = themeColors(theme)
  if (edge.type === 'contradicts') return '#EF4444'
  if (edge.type === 'supports') return '#22C55E'
  if (edge.type === 'deepens') return '#8B5CF6'  // 紫 — ラウンド間接続
  return tc.edgeDefault
}

// ── 同心円配置 ───────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function assignConcentricPositions(nodes: SimNode[], _maxRound: number) {
  const RING_SPACING = 180  // ラウンド間の距離

  for (const node of nodes) {
    const r = node.roundNum
    const ringRadius = r * RING_SPACING

    if (node.type === 'user') {
      // ユーザーノード: リングの上部
      node.x = 0
      node.y = -ringRadius - 40
    } else if (node.type === 'question') {
      // 質問ノード: リングの中心
      node.x = 0
      node.y = -ringRadius
    } else if (node.type === 'synthesis') {
      // 統合ノード: リングの下部
      node.x = 0
      node.y = -ringRadius + RING_SPACING * 0.6
    } else if (node.id.startsWith('agent-')) {
      // エージェント: リングの円周上
      const agentNodes = nodes.filter(n => n.roundNum === r && n.id.startsWith('agent-'))
      const idx = agentNodes.indexOf(node)
      const count = agentNodes.length
      const angle = (idx / count) * 2 * Math.PI - Math.PI / 2
      const agentRadius = RING_SPACING * 0.45
      node.x = Math.cos(angle) * agentRadius
      node.y = -ringRadius + Math.sin(angle) * agentRadius
    } else if (node.id.startsWith('fact-')) {
      // 事実ノード: 質問ノードの近く
      const factNodes = nodes.filter(n => n.roundNum === r && n.id.startsWith('fact-'))
      const idx = factNodes.indexOf(node)
      const spread = (idx - (factNodes.length - 1) / 2) * 35
      node.x = spread
      node.y = -ringRadius - 25
    } else {
      // サブノード: 親の近く
      node.x = (Math.random() - 0.5) * 60
      node.y = -ringRadius + (Math.random() - 0.5) * 60
    }
  }
}

// ── D3型 ─────────────────────────────────────────────────
interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  type: RoundNode['type']
  hat?: HatColor
  stance?: string
  intensity?: number
  radius: number
  color: string
  roundNum: number
  opacity: number  // ラウンドに基づく透明度
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  type: RoundEdge['type']
  color: string
  roundNum: number
}

// ── コンポーネント ───────────────────────────────────────
export default function DecisionMap({ pipeline, onNodeClick, theme, round }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimEdge> | null>(null)
  const zoomRef = useRef<d3.ZoomTransform | null>(null)
  const onNodeClickRef = useRef(onNodeClick)
  onNodeClickRef.current = onNodeClick

  // 累積ノード・エッジを保持
  const [cumulativeNodes, setCumulativeNodes] = useState<RoundNode[]>([])
  const [cumulativeEdges, setCumulativeEdges] = useState<RoundEdge[]>([])
  const [, setExpandedAgents] = useState<Set<string>>(new Set())
  const prevNodeCount = useRef(0)

  // パイプライン完了時に累積データに追加
  useEffect(() => {
    if (pipeline.status === 'complete') {
      const { nodes, edges } = buildCurrentRoundNodes(pipeline, round)
      setCumulativeNodes(prev => {
        // 同じラウンドのノードがあれば置き換え
        const filtered = prev.filter(n => n.round !== round)
        return [...filtered, ...nodes]
      })
      setCumulativeEdges(prev => {
        const filtered = prev.filter(e => e.round !== round)
        return [...filtered, ...edges]
      })
    }
  }, [pipeline.status, pipeline.structured, pipeline.observation, pipeline.agents, pipeline.verification, pipeline.synthesis, round])

  // パイプライン進行中のノード（累積 + 現在のラウンドの途中経過）
  const allNodes = useMemo(() => {
    if (pipeline.status === 'running' || pipeline.status === 'complete') {
      const current = buildCurrentRoundNodes(pipeline, round)
      const pastNodes = cumulativeNodes.filter(n => n.round !== round)
      const pastEdges = cumulativeEdges.filter(e => e.round !== round)
      return {
        nodes: [...pastNodes, ...current.nodes],
        edges: [...pastEdges, ...current.edges],
      }
    }
    return { nodes: cumulativeNodes, edges: cumulativeEdges }
  }, [pipeline.status, pipeline.structured, pipeline.observation, pipeline.agents, pipeline.verification, pipeline.synthesis, round, cumulativeNodes, cumulativeEdges])

  const stableNodeClick = useCallback((nodeId: string) => {
    const hatMatch = nodeId.match(/^agent-(.+)-r\d+$/)
    if (hatMatch) {
      setExpandedAgents(prev => {
        const next = new Set(prev)
        if (next.has(hatMatch[1])) next.delete(hatMatch[1])
        else next.add(hatMatch[1])
        return next
      })
    }
    onNodeClickRef.current?.(nodeId)
  }, [])

  useEffect(() => {
    if (!svgRef.current) return
    const svgEl = svgRef.current
    const svg = d3.select(svgEl)
    const tc = themeColors(theme)

    const width = svgEl.clientWidth
    const height = svgEl.clientHeight
    if (width === 0 || height === 0) return

    const maxRound = allNodes.nodes.reduce((max, n) => Math.max(max, n.round ?? 0), 0)

    // ── データ変換 ───────────────────────────────
    const simNodes: SimNode[] = allNodes.nodes.map(n => {
      const r = n.round ?? 0
      // 色の濃淡: 最新ラウンド=1.0, 古い=薄く
      const opacity = maxRound === 0 ? 1 : 0.3 + 0.7 * (r / maxRound)
      return {
        ...n,
        radius: nodeRadius(n),
        color: nodeColor(n),
        roundNum: r,
        opacity,
      }
    })

    assignConcentricPositions(simNodes, maxRound)

    const nodeMap = new Map(simNodes.map(n => [n.id, n]))
    const simEdges: SimEdge[] = allNodes.edges
      .filter(e => nodeMap.has(e.source as string) && nodeMap.has(e.target as string))
      .map(e => ({
        source: e.source, target: e.target,
        type: e.type, color: edgeColor(e, theme),
        roundNum: e.round,
      }))

    // ── 描画 ────────────────────────────────────
    const isFirst = prevNodeCount.current === 0 && simNodes.length > 0

    svg.selectAll('*').remove()
    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
        zoomRef.current = event.transform
      })
    svg.call(zoom)

    const saved = zoomRef.current
    if (saved && !isFirst) {
      svg.call(zoom.transform, saved)
    } else {
      const centerY = maxRound > 0 ? -(maxRound * 180) / 2 : 0
      const scale = maxRound > 1 ? 0.6 : 0.8
      const t = d3.zoomIdentity.translate(width / 2, height / 2 - centerY * scale).scale(scale)
      svg.call(zoom.transform, t)
      zoomRef.current = t
    }

    // ── 同心円リングガイド ──────────────────────
    if (maxRound > 0) {
      const ringGroup = g.append('g').attr('class', 'rings')
      for (let r = 0; r <= maxRound; r++) {
        const ringY = -r * 180
        // ラウンドラベル
        ringGroup.append('text')
          .attr('x', -250)
          .attr('y', ringY)
          .attr('fill', tc.ringStroke)
          .attr('font-size', '10px')
          .attr('opacity', 0.6)
          .text(r === 0 ? 'Round 1' : `Round ${r + 1}`)
      }
    }

    // ── エッジ描画 ──────────────────────────────
    const linkGroup = g.append('g').attr('class', 'links')
    linkGroup.selectAll('line')
      .data(simEdges)
      .enter().append('line')
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => {
        if (d.type === 'contradicts') return 2.5
        if (d.type === 'deepens') return 2  // ラウンド間接続は太め
        return 1
      })
      .attr('stroke-dasharray', d => {
        if (d.type === 'contradicts') return '8,4'
        if (d.type === 'deepens') return '4,4'
        return 'none'
      })
      .attr('opacity', d => {
        const maxR = maxRound || 1
        return 0.3 + 0.5 * (d.roundNum / maxR)
      })

    // ── ノード描画 ──────────────────────────────
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const nodeGs = nodeGroup.selectAll('g')
      .data(simNodes)
      .enter().append('g')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => { stableNodeClick(d.id) })
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0.1).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0)
          d.fx = d.x; d.fy = d.y
        })
      )

    // グロー（大きいノードのみ）
    nodeGs.filter(d => d.radius >= 18)
      .append('circle')
      .attr('r', d => d.radius + 5)
      .attr('fill', d => d.color)
      .attr('opacity', d => 0.12 * d.opacity)

    // メイン円
    nodeGs.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => {
        if (d.type === 'question') return tc.nodeBg
        if (d.type === 'user') return tc.userNodeBg
        return `${d.color}${tc.nodeFillAlpha}`
      })
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => d.type === 'question' || d.type === 'synthesis' || d.type === 'user' ? 2.5 : 1.5)
      .attr('opacity', d => d.opacity)

    // 漢字ラベル
    nodeGs.filter(d => d.radius >= 18)
      .append('text')
      .text(d => nodeKanji(d))
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', d => d.color)
      .attr('font-size', d => d.type === 'question' ? '18px' : '14px')
      .attr('font-weight', 'bold')
      .attr('opacity', d => d.opacity)

    // 名前ラベル
    nodeGs.filter(d => d.radius >= 16)
      .append('text')
      .text(d => {
        if (d.type === 'user') return 'You'
        if (d.type === 'question') return ''
        if (d.type === 'synthesis') return 'Ei'
        if (d.hat) return AGENTS[d.hat as HatColor]?.name ?? ''
        return ''
      })
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.radius + 14)
      .attr('fill', tc.labelColor)
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .attr('opacity', d => d.opacity)

    // スタンス
    nodeGs.filter(d => d.type === 'perspective' && d.radius >= 18 && d.stance !== undefined)
      .append('text')
      .text(d => d.stance === 'support' ? '▲' : d.stance === 'oppose' ? '▼' : '◆')
      .attr('text-anchor', 'middle')
      .attr('dy', d => -(d.radius + 6))
      .attr('fill', d => d.stance === 'support' ? '#22C55E' : d.stance === 'oppose' ? '#EF4444' : '#F59E0B')
      .attr('font-size', '10px')
      .attr('opacity', d => d.opacity)

    // ── 出現アニメーション ──────────────────────
    const newNodeCount = simNodes.length
    if (newNodeCount > prevNodeCount.current) {
      nodeGs.filter((_d, i) => i >= prevNodeCount.current)
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .delay((_d, i) => i * 50)
        .attr('opacity', 1)
    }
    prevNodeCount.current = newNodeCount

    // ── シミュレーション ────────────────────────
    const sim = d3.forceSimulation<SimNode>(simNodes)
      .alphaDecay(0.06)
      .velocityDecay(0.45)
      .force('link', d3.forceLink<SimNode, SimEdge>(simEdges)
        .id(d => d.id)
        .distance(d => {
          if (d.type === 'deepens') return 100  // ラウンド間
          if (d.type === 'contradicts') return 150
          return 80
        })
        .strength(d => d.type === 'deepens' ? 0.2 : 0.4)
      )
      .force('charge', d3.forceManyBody()
        .strength(d => {
          const n = d as SimNode
          if (n.type === 'question' || n.type === 'user') return -400
          if (n.type === 'synthesis') return -250
          if (n.radius >= 18) return -200
          return -50
        })
      )
      .force('collision', d3.forceCollide<SimNode>().radius(d => d.radius + 10).strength(0.8))
      .force('y', d3.forceY<SimNode>(d => {
        // 同心円レイヤー: ラウンドごとにy位置を固定
        return -d.roundNum * 180
      }).strength(0.15))
      .force('x', d3.forceX(0).strength(0.03))
      .on('tick', () => {
        linkGroup.selectAll('line')
          .attr('x1', d => (d as unknown as { source: SimNode }).source.x ?? 0)
          .attr('y1', d => (d as unknown as { source: SimNode }).source.y ?? 0)
          .attr('x2', d => (d as unknown as { target: SimNode }).target.x ?? 0)
          .attr('y2', d => (d as unknown as { target: SimNode }).target.y ?? 0)
        nodeGs.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })

    simRef.current = sim

    const resizeObserver = new ResizeObserver(() => {
      if (svgEl.clientWidth > 0 && svgEl.clientHeight > 0) {
        sim.alpha(0.05).restart()
      }
    })
    resizeObserver.observe(svgEl)

    return () => { sim.stop(); resizeObserver.disconnect() }
  }, [allNodes, stableNodeClick, theme])

  // ── ステータス ─────────────────────────────────────────
  const stageLabel = pipeline.currentStage ? {
    structure: 'Structuring...',
    observe: 'Mei gathering facts...',
    deliberate: 'Team deliberating...',
    verify: 'Ri verifying logic...',
    synthesize: 'Ei synthesizing...',
  }[pipeline.currentStage] : null

  return (
    <div className="relative w-full h-full" style={{ background: 'var(--bg-map)' }}>
      <svg ref={svgRef} className="w-full h-full" style={{ background: 'var(--bg-map-gradient)' }} />

      {pipeline.status === 'running' && stageLabel && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-input)' }}>
          <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{stageLabel}</span>
        </div>
      )}

      {pipeline.status === 'idle' && cumulativeNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="text-5xl font-bold tracking-tighter bg-gradient-to-b from-[var(--text-primary)] to-[var(--text-faint)] bg-clip-text text-transparent">
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
        </div>
      )}

      {pipeline.status === 'running' && pipeline.currentStage === 'deliberate' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 px-4 py-2 rounded-full backdrop-blur border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-input)' }}>
          {(['red', 'black', 'yellow', 'green'] as const).map(hat => {
            const done = pipeline.agents.some(a => a.hat === hat)
            const agent = AGENTS[hat]
            return (
              <div key={hat} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${done ? '' : 'animate-pulse'}`} style={{ backgroundColor: done ? agent.hex : `${agent.hex}44` }} />
                <span className="text-xs" style={{ color: done ? 'var(--text-secondary)' : 'var(--text-ghost)' }}>{agent.name}</span>
              </div>
            )
          })}
        </div>
      )}

      {pipeline.status === 'complete' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-input)' }}>
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
            Round {round + 1} · Click nodes to explore · Ask a follow-up to deepen
          </span>
        </div>
      )}
    </div>
  )
}
