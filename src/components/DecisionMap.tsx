'use client'

import { useEffect, useRef, useMemo } from 'react'
import * as d3 from 'd3'
import { AGENTS } from '@/types'
import type { PipelineUI } from '@/lib/usePipeline'
import type { MapNode, MapEdge, HatColor } from '@/types'

type Props = {
  pipeline: PipelineUI
  onNodeClick?: (nodeId: string) => void
}

// ── ノードデータ構築 ─────────────────────────────────────
function buildNodes(pipeline: PipelineUI): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes: MapNode[] = []
  const edges: MapEdge[] = []

  // 中心: 質問ノード
  if (pipeline.structured) {
    nodes.push({
      id: 'question',
      label: pipeline.structured.clarified.slice(0, 60),
      type: 'question',
    })
  }

  // Stage 1: 明の事実
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

  // Stage 2: 4体のエージェント
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

    // 各キーポイントをサブノードに
    agent.keyPoints.slice(0, 3).forEach((kp, i) => {
      const kpId = `kp-${agent.hat}-${i}`
      const nodeType = agent.hat === 'black' ? 'risk' as const
        : agent.hat === 'yellow' ? 'opportunity' as const
        : 'perspective' as const
      nodes.push({
        id: kpId,
        label: kp.slice(0, 40),
        type: nodeType,
        hat: agent.hat,
        stance: agent.stance,
      })
      edges.push({ source: `agent-${agent.hat}`, target: kpId, type: 'deepens' })
    })
  })

  // Stage 3: 理の矛盾をエッジに
  if (pipeline.verification) {
    pipeline.verification.contradictions.forEach(c => {
      edges.push({
        source: `agent-${c.hat1}`,
        target: `agent-${c.hat2}`,
        type: 'contradicts',
      })
    })
  }

  // Stage 4: 叡の統合
  if (pipeline.synthesis) {
    nodes.push({
      id: 'synthesis',
      label: 'Ei: Synthesis',
      type: 'synthesis',
    })
    // 統合ノードは全エージェントから
    pipeline.agents.forEach(agent => {
      edges.push({
        source: `agent-${agent.hat}`,
        target: 'synthesis',
        type: 'leads_to',
      })
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

function edgeColor(edge: MapEdge): string {
  if (edge.type === 'contradicts') return '#EF4444'
  if (edge.type === 'supports') return '#22C55E'
  if (edge.type === 'deepens') return '#333'
  return '#2a2a2a'
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
export default function DecisionMap({ pipeline, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimEdge> | null>(null)
  const prevNodeCount = useRef(0)

  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => buildNodes(pipeline),
    [pipeline.structured, pipeline.observation, pipeline.agents, pipeline.verification, pipeline.synthesis]
  )

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight
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
        color: edgeColor(e),
      }))

    // ── 初回 or 更新 ────────────────────────────
    const isNew = prevNodeCount.current === 0 && simNodes.length > 0

    // SVGクリア＆再描画
    svg.selectAll('*').remove()

    const g = svg.append('g')

    // ズーム
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // 初期位置をセンターに
    if (isNew) {
      svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.9))
    }

    // ── グロー・グラデーション定義 ───────────────
    const defs = svg.append('defs')

    // 各ノード色のグロー
    const uniqueColors = Array.from(new Set(simNodes.map(n => n.color)))
    uniqueColors.forEach(color => {
      const filter = defs.append('filter')
        .attr('id', `glow-${color.slice(1)}`)
        .attr('x', '-50%').attr('y', '-50%')
        .attr('width', '200%').attr('height', '200%')
      filter.append('feGaussianBlur')
        .attr('stdDeviation', '4')
        .attr('result', 'blur')
      filter.append('feFlood')
        .attr('flood-color', color)
        .attr('flood-opacity', '0.3')
      filter.append('feComposite')
        .attr('in2', 'blur')
        .attr('operator', 'in')
      filter.append('feMerge')
        .selectAll('feMergeNode')
        .data(['blur', 'SourceGraphic'])
        .enter().append('feMergeNode')
        .attr('in', d => d === 'blur' ? 'blur' : 'SourceGraphic')
    })

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
      .on('click', (_event, d) => {
        if (onNodeClick) onNodeClick(d.id)
      })
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
      )

    // 外側グロー円
    nodeGs.append('circle')
      .attr('r', d => d.radius + 4)
      .attr('fill', d => d.color)
      .attr('opacity', 0.15)

    // メイン円
    nodeGs.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => {
        if (d.type === 'question') return '#0a0a0a'
        return `${d.color}22`
      })
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => d.type === 'question' || d.type === 'synthesis' ? 2.5 : 1.5)

    // ラベル（大きいノードのみ）
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

    // ラベルテキスト（ノードの下）
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
      .attr('fill', '#888')
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
      .force('collision', d3.forceCollide<SimNode>()
        .radius(d => d.radius + 8)
      )
      .on('tick', () => {
        linkGroup.selectAll('line')
          .attr('x1', d => (d as unknown as { source: SimNode }).source.x ?? 0)
          .attr('y1', d => (d as unknown as { source: SimNode }).source.y ?? 0)
          .attr('x2', d => (d as unknown as { target: SimNode }).target.x ?? 0)
          .attr('y2', d => (d as unknown as { target: SimNode }).target.y ?? 0)

        nodeGs.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })

    simRef.current = sim

    return () => {
      sim.stop()
    }
  }, [rawNodes, rawEdges, onNodeClick])

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

      {/* ステージインジケーター */}
      {pipeline.status === 'running' && stageLabel && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-input)' }}>
          <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{stageLabel}</span>
        </div>
      )}

      {/* 空状態 */}
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

      {/* エージェントステータスバー（deliberate中） */}
      {pipeline.status === 'running' && pipeline.currentStage === 'deliberate' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 px-4 py-2 rounded-full bg-[#111]/80 backdrop-blur border border-[#222]">
          {(['red', 'black', 'yellow', 'green'] as const).map(hat => {
            const done = pipeline.agents.some(a => a.hat === hat)
            const agent = AGENTS[hat]
            return (
              <div key={hat} className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${done ? '' : 'animate-pulse'}`}
                  style={{ backgroundColor: done ? agent.hex : `${agent.hex}44` }}
                />
                <span className={`text-xs ${done ? 'text-[#aaa]' : 'text-[#444]'}`}>
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
