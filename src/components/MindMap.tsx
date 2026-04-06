'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { AGENTS } from '@/types'
import type { PipelineUI } from '@/lib/usePipeline'

type Props = {
  pipeline: PipelineUI
}

interface MindNode {
  id: string
  label: string
  color: string
  type: 'question' | 'agent' | 'synthesis' | 'keypoint'
  parentId?: string
  stance?: string
}

interface MindEdge {
  source: string
  target: string
  type: 'branch' | 'contradict' | 'agree'
}

function buildMindMapData(pipeline: PipelineUI): { nodes: MindNode[]; edges: MindEdge[] } {
  const nodes: MindNode[] = []
  const edges: MindEdge[] = []

  if (!pipeline.structured) return { nodes, edges }

  // 中心: 質問
  nodes.push({
    id: 'q',
    label: pipeline.structured.clarified.slice(0, 40),
    color: '#3B82F6',
    type: 'question',
  })

  // エージェントの核心1文 + スタンス
  pipeline.agents.forEach(agent => {
    const agentInfo = AGENTS[agent.hat]
    const nodeId = `a-${agent.hat}`
    nodes.push({
      id: nodeId,
      label: agent.keyPoints[0]?.slice(0, 35) ?? agent.reasoning.slice(0, 35),
      color: agentInfo.hex,
      type: 'agent',
      stance: agent.stance,
    })
    edges.push({ source: 'q', target: nodeId, type: 'branch' })

    // キーポイント（最大2個）
    agent.keyPoints.slice(1, 3).forEach((kp, i) => {
      const kpId = `kp-${agent.hat}-${i}`
      nodes.push({
        id: kpId,
        label: kp.slice(0, 30),
        color: agentInfo.hex,
        type: 'keypoint',
        parentId: nodeId,
      })
      edges.push({ source: nodeId, target: kpId, type: 'branch' })
    })
  })

  // 矛盾エッジ
  if (pipeline.verification) {
    pipeline.verification.contradictions.forEach(c => {
      edges.push({
        source: `a-${c.hat1}`,
        target: `a-${c.hat2}`,
        type: 'contradict',
      })
    })
  }

  // 統合
  if (pipeline.synthesis) {
    nodes.push({
      id: 'ei',
      label: pipeline.synthesis.recommendation.split('\n')[0]?.slice(0, 40) ?? 'Synthesis',
      color: AGENTS.blue.hex,
      type: 'synthesis',
    })
    pipeline.agents.forEach(agent => {
      edges.push({ source: `a-${agent.hat}`, target: 'ei', type: 'branch' })
    })
  }

  return { nodes, edges }
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  color: string
  type: MindNode['type']
  stance?: string
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  type: MindEdge['type']
}

export default function MindMap({ pipeline }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !pipeline.synthesis) return
    const svgEl = svgRef.current
    const svg = d3.select(svgEl)

    const width = svgEl.clientWidth
    const height = 400
    svgEl.setAttribute('height', String(height))

    const { nodes: rawNodes, edges: rawEdges } = buildMindMapData(pipeline)
    if (rawNodes.length === 0) return

    // テーマ検出
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const bgColor = isDark ? '#111' : '#f8f9fa'
    const textColor = isDark ? '#e5e5e5' : '#1a1a1a'
    const mutedColor = isDark ? '#888' : '#666'
    const lineColor = isDark ? '#444' : '#ccc'

    const simNodes: SimNode[] = rawNodes.map(n => ({ ...n }))
    const nodeMap = new Map(simNodes.map(n => [n.id, n]))
    const simEdges: SimEdge[] = rawEdges
      .filter(e => nodeMap.has(e.source as string) && nodeMap.has(e.target as string))
      .map(e => ({ source: e.source, target: e.target, type: e.type }))

    // 初期配置
    simNodes.forEach(n => {
      if (n.type === 'question') { n.x = width / 2; n.y = height / 2 }
      else if (n.type === 'synthesis') { n.x = width / 2; n.y = height - 50 }
    })

    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    // エッジ
    const linkGroup = svg.append('g')
    const links = linkGroup.selectAll('line')
      .data(simEdges)
      .enter().append('line')
      .attr('stroke', d => d.type === 'contradict' ? '#EF4444' : lineColor)
      .attr('stroke-width', d => d.type === 'contradict' ? 2 : 1)
      .attr('stroke-dasharray', d => d.type === 'contradict' ? '6,3' : 'none')
      .attr('opacity', 0.7)

    // ノード
    const nodeGroup = svg.append('g')
    const nodeGs = nodeGroup.selectAll('g')
      .data(simNodes)
      .enter().append('g')

    // ノード背景（角丸長方形）
    nodeGs.append('rect')
      .attr('rx', d => d.type === 'question' || d.type === 'synthesis' ? 12 : 8)
      .attr('ry', d => d.type === 'question' || d.type === 'synthesis' ? 12 : 8)
      .attr('fill', d => {
        if (d.type === 'question') return bgColor
        return `${d.color}15`
      })
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => d.type === 'question' || d.type === 'synthesis' ? 2 : 1)

    // テキスト
    nodeGs.append('text')
      .text(d => d.label)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', d => {
        if (d.type === 'question' || d.type === 'synthesis') return textColor
        if (d.type === 'keypoint') return mutedColor
        return d.color
      })
      .attr('font-size', d => {
        if (d.type === 'question') return '13px'
        if (d.type === 'synthesis') return '12px'
        if (d.type === 'agent') return '11px'
        return '10px'
      })
      .attr('font-weight', d => d.type === 'question' || d.type === 'synthesis' ? '600' : '400')

    // スタンスアイコン
    nodeGs.filter(d => d.type === 'agent' && d.stance !== undefined)
      .append('text')
      .text(d => d.stance === 'support' ? '▲' : d.stance === 'oppose' ? '▼' : '◆')
      .attr('text-anchor', 'start')
      .attr('fill', d => d.stance === 'support' ? '#22C55E' : d.stance === 'oppose' ? '#EF4444' : '#F59E0B')
      .attr('font-size', '9px')

    // rectのサイズをテキストに合わせる
    nodeGs.each(function () {
      const g = d3.select(this)
      const text = g.select('text')
      const bbox = (text.node() as SVGTextElement).getBBox()
      const paddingX = 14
      const paddingY = 8
      g.select('rect')
        .attr('width', bbox.width + paddingX * 2)
        .attr('height', bbox.height + paddingY * 2)
        .attr('x', -bbox.width / 2 - paddingX)
        .attr('y', -bbox.height / 2 - paddingY)

      // スタンスアイコンの位置調整
      const stance = g.select('text:nth-of-type(2)')
      if (!stance.empty()) {
        stance.attr('x', bbox.width / 2 + paddingX + 4).attr('dy', '0.35em')
      }
    })

    // シミュレーション
    const sim = d3.forceSimulation<SimNode>(simNodes)
      .alphaDecay(0.08)
      .velocityDecay(0.5)
      .force('link', d3.forceLink<SimNode, SimEdge>(simEdges)
        .id(d => d.id)
        .distance(d => d.type === 'branch' ? 90 : 150)
        .strength(0.5)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide<SimNode>().radius(50).strength(0.8))
      .force('y', d3.forceY<SimNode>(d => {
        if (d.type === 'question') return height * 0.2
        if (d.type === 'synthesis') return height * 0.85
        if (d.type === 'agent') return height * 0.45
        return height * 0.6
      }).strength(0.15))
      .on('tick', () => {
        links
          .attr('x1', d => (d as unknown as { source: SimNode }).source.x ?? 0)
          .attr('y1', d => (d as unknown as { source: SimNode }).source.y ?? 0)
          .attr('x2', d => (d as unknown as { target: SimNode }).target.x ?? 0)
          .attr('y2', d => (d as unknown as { target: SimNode }).target.y ?? 0)
        nodeGs.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })

    // 出現アニメーション
    nodeGs
      .attr('opacity', 0)
      .transition()
      .duration(500)
      .delay((_, i) => i * 80)
      .attr('opacity', 1)

    links
      .attr('opacity', 0)
      .transition()
      .duration(400)
      .delay(300)
      .attr('opacity', 0.7)

    return () => { sim.stop() }
  }, [pipeline.synthesis, pipeline.agents, pipeline.verification, pipeline.structured])

  if (!pipeline.synthesis) return null

  return (
    <div className="mt-4 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-secondary)' }}>
      <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>Discussion Structure</span>
      </div>
      <svg ref={svgRef} className="w-full" style={{ minHeight: '400px' }} />
    </div>
  )
}
