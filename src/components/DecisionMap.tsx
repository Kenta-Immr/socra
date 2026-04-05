'use client'

import { useEffect, useRef, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { AGENTS } from '@/types'
import type { PipelineUI } from '@/lib/usePipeline'
import type { MapNode, MapEdge, HatColor } from '@/types'
import type { Theme } from '@/hooks/useTheme'

type Props = {
  pipeline: PipelineUI
  onNodeClick?: (nodeId: string) => void
  theme: Theme
}

// ── テーマ色 ─────────────────────────────────────────────
function themeColors(theme: Theme) {
  return theme === 'dark' ? {
    nodeBg: '#0a0a0a',
    nodeFillAlpha: '22',
    labelColor: '#888',
    edgeDefault: '#2a2a2a',
    edgeDeepen: '#333',
  } : {
    nodeBg: '#f8f9fa',
    nodeFillAlpha: '30',
    labelColor: '#666',
    edgeDefault: '#ccc',
    edgeDeepen: '#bbb',
  }
}

// ── ノードデータ構築 ─────────────────────────────────────
function buildNodes(pipeline: PipelineUI): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes: MapNode[] = []
  const edges: MapEdge[] = []

  if (pipeline.structured) {
    nodes.push({
      id: 'question',
      label: pipeline.structured.clarified.slice(0, 60),
      type: 'question',
    })
  }

  if (pipeline.observation) {
    pipeline.observation.facts.forEach((fact, i) => {
      nodes.push({
        id: `fact-${i}`,
        label: fact.content.slice(0, 50),
        type: 'fact',
        hat: 'white',
      })
      edges.push({ source: 'question', target: `fact-${i}`, type: 'leads_to' })
    })
  }

  pipeline.agents.forEach(agent => {
    nodes.push({
      id: `agent-${agent.hat}`,
      label: `${AGENTS[agent.hat].name}: ${agent.keyPoints[0]?.slice(0, 40) ?? agent.reasoning.slice(0, 40)}`,
      type: 'perspective',
      hat: agent.hat,
      stance: agent.stance,
      intensity: agent.intensity,
    })
    edges.push({ source: 'question', target: `agent-${agent.hat}`, type: 'leads_to' })

    agent.keyPoints.slice(0, 3).forEach((kp, i) => {
      const kpId = `kp-${agent.hat}-${i}`
      const nodeType = agent.hat === 'black' ? 'risk' as const
        : agent.hat === 'yellow' ? 'opportunity' as const
        : 'perspective' as const
      nodes.push({ id: kpId, label: kp.slice(0, 40), type: nodeType, hat: agent.hat, stance: agent.stance })
      edges.push({ source: `agent-${agent.hat}`, target: kpId, type: 'deepens' })
    })
  })

  if (pipeline.verification) {
    pipeline.verification.contradictions.forEach(c => {
      edges.push({ source: `agent-${c.hat1}`, target: `agent-${c.hat2}`, type: 'contradicts' })
    })
  }

  if (pipeline.synthesis) {
    nodes.push({ id: 'synthesis', label: 'Ei: Synthesis', type: 'synthesis' })
    pipeline.agents.forEach(agent => {
      edges.push({ source: `agent-${agent.hat}`, target: 'synthesis', type: 'leads_to' })
    })
  }

  return { nodes, edges }
}

// ── ノード色 ─────────────────────────────────────────────
function nodeColor(node: MapNode): string {
  if (node.type === 'question') return '#3B82F6'
  if (node.type === 'synthesis') return AGENTS.blue.hex
  if (node.hat) return AGENTS[node.hat as HatColor]?.hex ?? '#6B7280'
  return '#6B7280'
}

function nodeRadius(node: MapNode): number {
  if (node.type === 'question') return 28
  if (node.type === 'synthesis') return 24
  if (node.type === 'perspective') return 18
  return 10
}

function edgeColor(edge: MapEdge, theme: Theme): string {
  const tc = themeColors(theme)
  if (edge.type === 'contradicts') return '#EF4444'
  if (edge.type === 'supports') return '#22C55E'
  if (edge.type === 'deepens') return tc.edgeDeepen
  return tc.edgeDefault
}

// ── D3シミュレーション型 ─────────────────────────────────
interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  type: MapNode['type']
  hat?: HatColor
  stance?: string
  intensity?: number
  radius: number
  color: string
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  type: MapEdge['type']
  color: string
}

// ── コンポーネント ───────────────────────────────────────
export default function DecisionMap({ pipeline, onNodeClick, theme }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimEdge> | null>(null)
  const prevNodeCount = useRef(0)
  const onNodeClickRef = useRef(onNodeClick)
  onNodeClickRef.current = onNodeClick

  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => buildNodes(pipeline),
    [pipeline.structured, pipeline.observation, pipeline.agents, pipeline.verification, pipeline.synthesis]
  )

  // onNodeClickをrefで保持し、D3の依存配列から外す
  const stableNodeClick = useCallback((nodeId: string) => {
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

    // ── データ変換 ───────────────────────────────
    const simNodes: SimNode[] = rawNodes.map(n => ({
      ...n,
      radius: nodeRadius(n),
      color: nodeColor(n),
    }))

    const nodeMap = new Map(simNodes.map(n => [n.id, n]))

    const simEdges: SimEdge[] = rawEdges
      .filter(e => nodeMap.has(e.source as string) && nodeMap.has(e.target as string))
      .map(e => ({
        source: e.source,
        target: e.target,
        type: e.type,
        color: edgeColor(e, theme),
      }))

    // ── 初回 or 更新 ────────────────────────────
    const isNew = prevNodeCount.current === 0 && simNodes.length > 0

    svg.selectAll('*').remove()
    const g = svg.append('g')

    // ズーム
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => { g.attr('transform', event.transform) })
    svg.call(zoom)

    if (isNew) {
      svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.9))
    }

    // ── エッジ描画 ──────────────────────────────
    const linkGroup = g.append('g').attr('class', 'links')
    linkGroup.selectAll('line')
      .data(simEdges)
      .enter().append('line')
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => d.type === 'contradicts' ? 2 : 1)
      .attr('stroke-dasharray', d => d.type === 'contradicts' ? '6,3' : 'none')
      .attr('opacity', 0.6)

    // ── ノード描画 ──────────────────────────────
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const nodeGs = nodeGroup.selectAll('g')
      .data(simNodes)
      .enter().append('g')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => { stableNodeClick(d.id) })
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0.3).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0)
          d.fx = null; d.fy = null
        })
      )

    // 外側グロー円
    nodeGs.append('circle')
      .attr('r', d => d.radius + 4)
      .attr('fill', d => d.color)
      .attr('opacity', 0.15)

    // メイン円（テーマ対応）
    nodeGs.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => {
        if (d.type === 'question') return tc.nodeBg
        return `${d.color}${tc.nodeFillAlpha}`
      })
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => d.type === 'question' || d.type === 'synthesis' ? 2.5 : 1.5)

    // 漢字ラベル（大きいノードのみ）
    nodeGs.filter(d => d.radius >= 18)
      .append('text')
      .text(d => {
        if (d.type === 'question') return '?'
        if (d.type === 'synthesis') return '叡'
        if (d.hat) return AGENTS[d.hat as HatColor]?.kanji ?? ''
        return ''
      })
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', d => d.color)
      .attr('font-size', d => d.type === 'question' ? '18px' : '14px')
      .attr('font-weight', 'bold')

    // 名前ラベル（テーマ対応）
    nodeGs.filter(d => d.radius >= 14)
      .append('text')
      .text(d => {
        if (d.type === 'question') return ''
        if (d.hat) return AGENTS[d.hat as HatColor]?.name ?? ''
        if (d.type === 'synthesis') return 'Synthesis'
        return ''
      })
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.radius + 14)
      .attr('fill', tc.labelColor)
      .attr('font-size', '10px')

    // ── 出現アニメーション ──────────────────────
    const newNodeCount = simNodes.length
    if (newNodeCount > prevNodeCount.current) {
      nodeGs.filter((_d, i) => i >= prevNodeCount.current)
        .attr('opacity', 0)
        .attr('transform', 'scale(0)')
        .transition()
        .duration(600)
        .delay((_d, i) => i * 80)
        .attr('opacity', 1)
        .attr('transform', 'scale(1)')
    }
    prevNodeCount.current = newNodeCount

    // ── シミュレーション ────────────────────────
    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimEdge>(simEdges)
        .id(d => d.id)
        .distance(d => d.type === 'deepens' ? 60 : 120)
        .strength(0.5)
      )
      .force('charge', d3.forceManyBody()
        .strength(d => {
          const node = d as SimNode
          return node.type === 'question' ? -400 : node.radius >= 18 ? -200 : -80
        })
      )
      .force('center', d3.forceCenter(0, 0).strength(0.05))
      .force('collision', d3.forceCollide<SimNode>().radius(d => d.radius + 8))
      .on('tick', () => {
        linkGroup.selectAll('line')
          .attr('x1', d => (d as unknown as { source: SimNode }).source.x ?? 0)
          .attr('y1', d => (d as unknown as { source: SimNode }).source.y ?? 0)
          .attr('x2', d => (d as unknown as { target: SimNode }).target.x ?? 0)
          .attr('y2', d => (d as unknown as { target: SimNode }).target.y ?? 0)
        nodeGs.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })

    simRef.current = sim

    // ── リサイズ対応 ────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      const w = svgEl.clientWidth
      const h = svgEl.clientHeight
      if (w > 0 && h > 0) {
        sim.force('center', d3.forceCenter(0, 0).strength(0.05))
        sim.alpha(0.1).restart()
      }
    })
    resizeObserver.observe(svgEl)

    return () => {
      sim.stop()
      resizeObserver.disconnect()
    }
  }, [rawNodes, rawEdges, stableNodeClick, theme])

  // ── ステータス表示 ─────────────────────────────────────
  const stageLabel = pipeline.currentStage ? {
    structure: 'Structuring...',
    observe: 'Mei gathering facts...',
    deliberate: 'Team deliberating...',
    verify: 'Ri verifying logic...',
    synthesize: 'Ei synthesizing...',
  }[pipeline.currentStage] : null

  return (
    <div className="relative w-full h-full" style={{ background: 'var(--bg-map)' }}>
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ background: 'var(--bg-map-gradient)' }}
      />

      {pipeline.status === 'running' && stageLabel && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-input)' }}>
          <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{stageLabel}</span>
        </div>
      )}

      {pipeline.status === 'idle' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="text-5xl font-bold tracking-tighter bg-gradient-to-b from-[var(--text-primary)] to-[var(--text-faint)] bg-clip-text text-transparent">
              Socra
            </div>
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
              7 perspectives. One clear path.
            </p>
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
                <span
                  className={`w-2 h-2 rounded-full ${done ? '' : 'animate-pulse'}`}
                  style={{ backgroundColor: done ? agent.hex : `${agent.hex}44` }}
                />
                <span className="text-xs" style={{ color: done ? 'var(--text-secondary)' : 'var(--text-ghost)' }}>
                  {agent.name}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
