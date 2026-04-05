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
}

// ── テーマ色 ─────────────────────────────────────────────
function themeColors(theme: Theme) {
  return theme === 'dark' ? {
    nodeBg: '#0a0a0a',
    nodeFillAlpha: '22',
    labelColor: '#999',
    edgeDefault: '#556',
    edgeDeepen: '#445',
    contradictGlow: 'rgba(239, 68, 68, 0.3)',
  } : {
    nodeBg: '#f8f9fa',
    nodeFillAlpha: '25',
    labelColor: '#555',
    edgeDefault: '#ccc',
    edgeDeepen: '#ddd',
    contradictGlow: 'rgba(239, 68, 68, 0.2)',
  }
}

// ── 主要ノード構築（段階的開示: 初期は主要ノードのみ） ────
function buildPrimaryNodes(pipeline: PipelineUI): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes: MapNode[] = []
  const edges: MapEdge[] = []

  // 中心: 質問
  if (pipeline.structured) {
    nodes.push({ id: 'question', label: pipeline.structured.clarified.slice(0, 60), type: 'question' })
  }

  // 明の事実 → 小さいノードで最大3個
  if (pipeline.observation) {
    pipeline.observation.facts.slice(0, 3).forEach((fact, i) => {
      nodes.push({ id: `fact-${i}`, label: fact.content.slice(0, 30), type: 'fact', hat: 'white' })
      edges.push({ source: 'question', target: `fact-${i}`, type: 'leads_to' })
    })
  }

  // 4体のエージェント（主要ノードのみ）
  pipeline.agents.forEach(agent => {
    nodes.push({
      id: `agent-${agent.hat}`,
      label: agent.keyPoints[0]?.slice(0, 30) ?? agent.reasoning.slice(0, 30),
      type: 'perspective',
      hat: agent.hat,
      stance: agent.stance,
      intensity: agent.intensity,
    })
    edges.push({ source: 'question', target: `agent-${agent.hat}`, type: 'leads_to' })
  })

  // 矛盾エッジ
  if (pipeline.verification) {
    pipeline.verification.contradictions.forEach(c => {
      edges.push({ source: `agent-${c.hat1}`, target: `agent-${c.hat2}`, type: 'contradicts' })
    })
  }

  // 統合
  if (pipeline.synthesis) {
    nodes.push({ id: 'synthesis', label: 'Synthesis', type: 'synthesis' })
    pipeline.agents.forEach(agent => {
      edges.push({ source: `agent-${agent.hat}`, target: 'synthesis', type: 'leads_to' })
    })
  }

  return { nodes, edges }
}

// ── 展開ノード（クリック時に追加） ──────────────────────
function buildExpandedNodes(pipeline: PipelineUI, expandedAgent: string): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes: MapNode[] = []
  const edges: MapEdge[] = []

  const agent = pipeline.agents.find(a => a.hat === expandedAgent)
  if (!agent) return { nodes, edges }

  agent.keyPoints.forEach((kp, i) => {
    const kpId = `kp-${agent.hat}-${i}`
    nodes.push({
      id: kpId,
      label: kp.slice(0, 25),
      type: agent.hat === 'black' ? 'risk' : agent.hat === 'yellow' ? 'opportunity' : 'perspective',
      hat: agent.hat as HatColor,
      stance: agent.stance,
    })
    edges.push({ source: `agent-${agent.hat}`, target: kpId, type: 'deepens' })
  })

  return { nodes, edges }
}

// ── ノード色・サイズ ─────────────────────────────────────
function nodeColor(node: MapNode): string {
  if (node.type === 'question') return '#3B82F6'
  if (node.type === 'synthesis') return AGENTS.blue.hex
  if (node.hat) return AGENTS[node.hat as HatColor]?.hex ?? '#6B7280'
  return '#6B7280'
}

function nodeRadius(node: MapNode): number {
  if (node.type === 'question') return 30
  if (node.type === 'synthesis') return 26
  if (node.type === 'perspective') return 20
  if (node.type === 'fact') return 8
  return 7  // サブノード（キーポイント）
}

function edgeColor(edge: MapEdge, theme: Theme): string {
  const tc = themeColors(theme)
  if (edge.type === 'contradicts') return '#EF4444'
  if (edge.type === 'supports') return '#22C55E'
  if (edge.type === 'deepens') return tc.edgeDeepen
  return tc.edgeDefault
}

// ── 円形初期配置 ─────────────────────────────────────────
function assignInitialPositions(nodes: SimNode[]) {
  const questionNode = nodes.find(n => n.type === 'question')
  if (questionNode) { questionNode.x = 0; questionNode.y = 0 }

  // エージェントノードを質問の周りに円形配置
  const agentNodes = nodes.filter(n => n.id.startsWith('agent-'))
  agentNodes.forEach((n, i) => {
    const angle = (i / agentNodes.length) * 2 * Math.PI - Math.PI / 2
    n.x = Math.cos(angle) * 140
    n.y = Math.sin(angle) * 140
  })

  // 事実ノードを上部に
  const factNodes = nodes.filter(n => n.id.startsWith('fact-'))
  factNodes.forEach((n, i) => {
    const spread = (i - (factNodes.length - 1) / 2) * 40
    n.x = spread
    n.y = -100
  })

  // 統合ノードを下に
  const synthNode = nodes.find(n => n.type === 'synthesis')
  if (synthNode) { synthNode.x = 0; synthNode.y = 160 }

  // サブノード（キーポイント）を親の近くに
  const subNodes = nodes.filter(n => n.id.startsWith('kp-'))
  subNodes.forEach(n => {
    const parentId = `agent-${n.hat}`
    const parent = nodes.find(p => p.id === parentId)
    if (parent) {
      n.x = (parent.x ?? 0) + (Math.random() - 0.5) * 50
      n.y = (parent.y ?? 0) + (Math.random() - 0.5) * 50
    }
  })
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
  const zoomRef = useRef<d3.ZoomTransform | null>(null)
  const onNodeClickRef = useRef(onNodeClick)
  onNodeClickRef.current = onNodeClick
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set())

  // 段階的開示: 主要ノード + 展開済みサブノード
  const { nodes: rawNodes, edges: rawEdges } = useMemo(() => {
    const primary = buildPrimaryNodes(pipeline)
    let allNodes = [...primary.nodes]
    let allEdges = [...primary.edges]

    expandedAgents.forEach(hat => {
      const expanded = buildExpandedNodes(pipeline, hat)
      allNodes = [...allNodes, ...expanded.nodes]
      allEdges = [...allEdges, ...expanded.edges]
    })

    return { nodes: allNodes, edges: allEdges }
  }, [pipeline.structured, pipeline.observation, pipeline.agents, pipeline.verification, pipeline.synthesis, expandedAgents])

  const stableNodeClick = useCallback((nodeId: string) => {
    // エージェントノードダブルクリックでサブノード展開/折りたたみ
    const hatMatch = nodeId.match(/^agent-(.+)$/)
    if (hatMatch) {
      setExpandedAgents(prev => {
        const next = new Set(prev)
        if (next.has(hatMatch[1])) {
          next.delete(hatMatch[1])
        } else {
          next.add(hatMatch[1])
        }
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

    // ── データ変換 + 円形初期配置 ────────────────
    const simNodes: SimNode[] = rawNodes.map(n => ({
      ...n,
      radius: nodeRadius(n),
      color: nodeColor(n),
    }))
    assignInitialPositions(simNodes)

    const nodeMap = new Map(simNodes.map(n => [n.id, n]))

    const simEdges: SimEdge[] = rawEdges
      .filter(e => nodeMap.has(e.source as string) && nodeMap.has(e.target as string))
      .map(e => ({
        source: e.source, target: e.target,
        type: e.type, color: edgeColor(e, theme),
      }))

    // ── 描画 ────────────────────────────────────
    const isNew = prevNodeCount.current === 0 && simNodes.length > 0

    svg.selectAll('*').remove()
    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
        zoomRef.current = event.transform
      })
    svg.call(zoom)

    // 前回のzoom状態を復元、なければセンタリング
    const savedZoom = zoomRef.current
    if (savedZoom && !isNew) {
      svg.call(zoom.transform, savedZoom)
    } else {
      const initialTransform = d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85)
      svg.call(zoom.transform, initialTransform)
      zoomRef.current = initialTransform
    }

    // ── エッジ描画 ──────────────────────────────
    const linkGroup = g.append('g').attr('class', 'links')
    const links = linkGroup.selectAll('line')
      .data(simEdges)
      .enter().append('line')
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => d.type === 'contradicts' ? 2.5 : d.type === 'deepens' ? 0.5 : 1)
      .attr('stroke-dasharray', d => d.type === 'contradicts' ? '8,4' : 'none')
      .attr('opacity', d => d.type === 'contradicts' ? 0.9 : 0.6)

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
          // ドラッグ後は位置固定
          d.fx = d.x; d.fy = d.y
        })
      )

    // 外側グロー円（大きいノードのみ）
    nodeGs.filter(d => d.radius >= 18)
      .append('circle')
      .attr('r', d => d.radius + 5)
      .attr('fill', d => d.color)
      .attr('opacity', 0.12)

    // メイン円
    nodeGs.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => {
        if (d.type === 'question') return tc.nodeBg
        return `${d.color}${tc.nodeFillAlpha}`
      })
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => {
        if (d.type === 'question') return 3
        if (d.type === 'synthesis') return 2.5
        if (d.type === 'perspective') return 2
        return 1
      })

    // 漢字ラベル（エージェント・質問・統合のみ）
    nodeGs.filter(d => d.radius >= 20)
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
      .attr('font-size', d => d.type === 'question' ? '20px' : '16px')
      .attr('font-weight', 'bold')

    // 名前ラベル（大きいノードの下）
    nodeGs.filter(d => d.radius >= 18)
      .append('text')
      .text(d => {
        if (d.type === 'question') return ''
        if (d.type === 'synthesis') return 'Ei'
        if (d.hat) return AGENTS[d.hat as HatColor]?.name ?? ''
        return ''
      })
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.radius + 14)
      .attr('fill', tc.labelColor)
      .attr('font-size', '11px')
      .attr('font-weight', '500')

    // スタンスインジケーター（エージェントノード上部）
    nodeGs.filter(d => d.type === 'perspective' && d.radius >= 18 && d.stance !== undefined)
      .append('text')
      .text(d => {
        if (d.stance === 'support') return '▲'
        if (d.stance === 'oppose') return '▼'
        return '◆'
      })
      .attr('text-anchor', 'middle')
      .attr('dy', d => -(d.radius + 6))
      .attr('fill', d => {
        if (d.stance === 'support') return '#22C55E'
        if (d.stance === 'oppose') return '#EF4444'
        return '#F59E0B'
      })
      .attr('font-size', '10px')

    // サブノード（キーポイント）のラベル — キーポイント要約を表示
    nodeGs.filter(d => d.id.startsWith('kp-'))
      .append('text')
      .text(d => d.label)
      .attr('text-anchor', 'start')
      .attr('dx', d => d.radius + 4)
      .attr('dy', '0.35em')
      .attr('fill', tc.labelColor)
      .attr('font-size', '9px')
      .attr('opacity', 0.8)

    // ── 出現アニメーション（中心から拡散） ──────
    const newNodeCount = simNodes.length
    if (newNodeCount > prevNodeCount.current) {
      nodeGs.filter((_d, i) => i >= prevNodeCount.current)
        .attr('opacity', 0)
        .transition()
        .duration(500)
        .delay((_d, i) => i * 60)
        .attr('opacity', 1)

      // 新しいエッジもフェードイン
      links.filter((_d, i) => i >= (prevNodeCount.current > 0 ? prevNodeCount.current - 1 : 0))
        .attr('opacity', 0)
        .transition()
        .duration(400)
        .delay(300)
        .attr('opacity', d => d.type === 'contradicts' ? 0.9 : 0.6)
    }
    prevNodeCount.current = newNodeCount

    // ── シミュレーション（高速収束） ──────────
    const sim = d3.forceSimulation<SimNode>(simNodes)
      .alphaDecay(0.05)  // 高速収束（デフォルト0.0228→0.05）
      .velocityDecay(0.4)  // 摩擦強め
      .force('link', d3.forceLink<SimNode, SimEdge>(simEdges)
        .id(d => d.id)
        .distance(d => {
          if (d.type === 'deepens') return 45
          if (d.type === 'contradicts') return 180
          return 100
        })
        .strength(d => d.type === 'deepens' ? 0.8 : 0.3)
      )
      .force('charge', d3.forceManyBody()
        .strength(d => {
          const node = d as SimNode
          if (node.type === 'question') return -500
          if (node.type === 'synthesis') return -300
          if (node.radius >= 18) return -250
          return -50
        })
      )
      .force('center', d3.forceCenter(0, 0).strength(0.1))
      .force('collision', d3.forceCollide<SimNode>().radius(d => d.radius + 12).strength(0.8))
      .force('radial', d3.forceRadial<SimNode>(
        d => {
          if (d.type === 'question') return 0
          if (d.type === 'synthesis') return 160
          if (d.type === 'perspective' && d.radius >= 18) return 130
          if (d.type === 'fact') return 80
          return 170  // サブノード
        },
        0, 0
      ).strength(d => {
        const node = d as SimNode
        if (node.type === 'question') return 1
        return 0.3
      }))
      .on('tick', () => {
        linkGroup.selectAll('line')
          .attr('x1', d => (d as unknown as { source: SimNode }).source.x ?? 0)
          .attr('y1', d => (d as unknown as { source: SimNode }).source.y ?? 0)
          .attr('x2', d => (d as unknown as { target: SimNode }).target.x ?? 0)
          .attr('y2', d => (d as unknown as { target: SimNode }).target.y ?? 0)
        nodeGs.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })

    simRef.current = sim

    // リサイズ
    const resizeObserver = new ResizeObserver(() => {
      if (svgEl.clientWidth > 0 && svgEl.clientHeight > 0) {
        sim.alpha(0.05).restart()
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

      {/* 展開ヒント */}
      {pipeline.status === 'complete' && expandedAgents.size === 0 && pipeline.agents.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-input)' }}>
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Click an agent node to expand key points</span>
        </div>
      )}
    </div>
  )
}
