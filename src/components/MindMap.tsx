'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { AGENTS } from '@/types'
import type { PipelineUI, RoundData } from '@/lib/usePipeline'

type Props = {
  pipeline: PipelineUI
  fullScreen?: boolean  // 2ペインの右側で使う場合
  onNodeClick?: (node: MindNode) => void
}

export interface MindNode {
  id: string
  label: string
  color: string
  type: 'question' | 'agent' | 'synthesis' | 'keypoint' | 'followup'
  hat?: string
  stance?: string
  round?: number
  importance: number  // 1-5: ノードサイズを決定。5=最大（叡・質問）、1=最小（keypoint）
  fullText?: string   // 元テキスト全文（詳細表示用）
}

interface MindEdge {
  source: string
  target: string
  type: 'branch' | 'contradict' | 'deepens'
}

function buildMindMapData(pipeline: PipelineUI): { nodes: MindNode[]; edges: MindEdge[] } {
  const nodes: MindNode[] = []
  const edges: MindEdge[] = []

  // 過去ラウンドのノードを追加
  let prevSynthesisId: string | null = null
  pipeline.allRounds.forEach((rd: RoundData) => {
    const qId = `q-r${rd.round}`
    nodes.push({ id: qId, label: rd.question.slice(0, 30), color: '#3B82F6', type: rd.round === 0 ? 'question' : 'followup', round: rd.round, importance: 4, fullText: rd.question })

    // 前ラウンドの統合ノードから繋ぐ
    if (prevSynthesisId) {
      edges.push({ source: prevSynthesisId, target: qId, type: 'deepens' })
    }

    rd.agents.forEach(agent => {
      const info = AGENTS[agent.hat]
      const nodeId = `a-${agent.hat}-r${rd.round}`
      nodes.push({
        id: nodeId,
        label: `${info.name}: ${agent.keyPoints[0]?.slice(0, 20) ?? ''}`,
        color: info.hex,
        type: 'agent',
        hat: agent.hat,
        stance: agent.stance,
        round: rd.round,
        importance: agent.intensity,
        fullText: agent.reasoning,
      })
      edges.push({ source: qId, target: nodeId, type: 'branch' })
    })

    // 過去ラウンドの統合ノード
    const eiId = `ei-r${rd.round}`
    nodes.push({ id: eiId, label: `叡 R${rd.round + 1}`, color: AGENTS.blue.hex, type: 'synthesis', round: rd.round, importance: 5, fullText: '' })
    rd.agents.forEach(agent => {
      edges.push({ source: `a-${agent.hat}-r${rd.round}`, target: eiId, type: 'branch' })
    })
    prevSynthesisId = eiId
  })

  // 現在のラウンド
  if (!pipeline.structured) return { nodes, edges }

  const currentRound = pipeline.round
  const qId = `q-r${currentRound}`
  nodes.push({ id: qId, label: pipeline.structured.clarified.slice(0, 30), color: '#3B82F6', type: currentRound === 0 ? 'question' : 'followup', round: currentRound, importance: 5, fullText: pipeline.structured.clarified })

  if (prevSynthesisId) {
    edges.push({ source: prevSynthesisId, target: qId, type: 'deepens' })
  }

  pipeline.agents.forEach(agent => {
    const info = AGENTS[agent.hat]
    const nodeId = `a-${agent.hat}-r${currentRound}`
    nodes.push({
      id: nodeId,
      label: `${info.name}: ${agent.keyPoints[0]?.slice(0, 25) ?? agent.reasoning.slice(0, 25)}`,
      color: info.hex,
      type: 'agent',
      hat: agent.hat,
      stance: agent.stance,
      round: currentRound,
      importance: agent.intensity,
      fullText: agent.reasoning,
    })
    edges.push({ source: qId, target: nodeId, type: 'branch' })

    if (agent.keyPoints.length > 1) {
      const kpId = `kp-${agent.hat}-r${currentRound}`
      nodes.push({ id: kpId, label: agent.keyPoints[1].slice(0, 20), color: info.hex, type: 'keypoint', hat: agent.hat, round: currentRound, importance: 2, fullText: agent.keyPoints[1] })
      edges.push({ source: nodeId, target: kpId, type: 'branch' })
    }
  })

  if (pipeline.verification) {
    pipeline.verification.contradictions.forEach(c => {
      edges.push({ source: `a-${c.hat1}-r${currentRound}`, target: `a-${c.hat2}-r${currentRound}`, type: 'contradict' })
    })
  }

  if (pipeline.synthesis) {
    const eiId = `ei-r${currentRound}`
    nodes.push({
      id: eiId,
      label: `叡: ${pipeline.synthesis.recommendation.split('\n')[0]?.slice(0, 30) ?? ''}`,
      color: AGENTS.blue.hex,
      type: 'synthesis',
      round: currentRound,
      importance: 5,
      fullText: pipeline.synthesis.recommendation,
    })
    pipeline.agents.forEach(agent => {
      edges.push({ source: `a-${agent.hat}-r${currentRound}`, target: eiId, type: 'branch' })
    })
  }

  return { nodes, edges }
}

// テキストを折り返す（maxWidth文字で改行、最大3行で省略）
function wrapText(text: string, maxChars: number, maxLines = 3): string[] {
  const lines: string[] = []
  for (let i = 0; i < text.length; i += maxChars) {
    lines.push(text.slice(i, i + maxChars))
    if (lines.length >= maxLines) {
      if (i + maxChars < text.length) {
        lines[lines.length - 1] = lines[lines.length - 1].slice(0, maxChars - 1) + '…'
      }
      break
    }
  }
  return lines
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  color: string
  type: MindNode['type']
  hat?: string
  stance?: string
  round?: number
  importance: number
  fullText?: string
  width: number
  height: number
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  type: MindEdge['type']
}

export default function MindMap({ pipeline, fullScreen, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const onNodeClickRef = useRef(onNodeClick)
  onNodeClickRef.current = onNodeClick

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !pipeline.synthesis) return
    const svgEl = svgRef.current
    const container = containerRef.current
    const svg = d3.select(svgEl)

    const width = container.clientWidth
    const height = fullScreen ? container.clientHeight : 420

    const { nodes: rawNodes, edges: rawEdges } = buildMindMapData(pipeline)
    if (rawNodes.length === 0) return

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const bgColor = isDark ? '#0a0a0a' : '#f8f9fa'
    const textColor = isDark ? '#e5e5e5' : '#1a1a1a'
    const mutedColor = isDark ? '#999' : '#555'
    const lineColor = isDark ? '#556' : '#bbb'

    // ノードサイズを重要度(importance)基準で計算
    const maxChars = 15
    const currentRound = pipeline.round
    const simNodes: SimNode[] = rawNodes.map(n => {
      const lines = wrapText(n.label, maxChars)
      // importance(1-5)でサイズを決定。5=最大、1=最小
      const scale = 0.6 + (n.importance / 5) * 0.6  // 0.72〜1.2倍
      const baseW = Math.min(n.label.length, maxChars) * 7 + 28
      const baseH = lines.length * 16 + 20
      // 過去ラウンドは縮小
      const isOldRound = n.round !== undefined && n.round < currentRound
      const roundScale = isOldRound ? 0.75 : 1
      const w = baseW * scale * roundScale
      const h = baseH * scale * roundScale
      return { ...n, width: w, height: h }
    })

    const nodeMap = new Map(simNodes.map(n => [n.id, n]))
    const simEdges: SimEdge[] = rawEdges
      .filter(e => nodeMap.has(e.source as string) && nodeMap.has(e.target as string))
      .map(e => ({ source: e.source, target: e.target, type: e.type }))

    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height)

    const g = svg.append('g')

    // ズーム
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => { g.attr('transform', event.transform) })
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(fullScreen ? 0.7 : 0.85))

    // エッジ
    const linkGroup = g.append('g')
    const links = linkGroup.selectAll('line')
      .data(simEdges)
      .enter().append('line')
      .attr('stroke', d => d.type === 'contradict' ? '#EF4444' : d.type === 'deepens' ? '#3B82F6' : lineColor)
      .attr('stroke-width', d => d.type === 'contradict' ? 2.5 : d.type === 'deepens' ? 2 : 1)
      .attr('stroke-dasharray', d => d.type === 'contradict' ? '8,4' : d.type === 'deepens' ? '12,4' : 'none')
      .attr('opacity', 0.7)

    // ノード
    const nodeGroup = g.append('g')
    const nodeGs = nodeGroup.selectAll('g')
      .data(simNodes)
      .enter().append('g')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        onNodeClickRef.current?.({
          id: d.id, label: d.label, color: d.color, type: d.type,
          hat: d.hat, stance: d.stance, round: d.round, importance: d.importance,
          fullText: d.fullText,
        })
      })
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) sim.alphaTarget(0.1).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => {
          if (!event.active) sim.alphaTarget(0)
          d.fx = d.x; d.fy = d.y
        })
      )

    // 過去ラウンドかどうか
    const isOld = (d: SimNode) => d.round !== undefined && d.round < currentRound

    // 角丸長方形
    nodeGs.append('rect')
      .attr('rx', 10).attr('ry', 10)
      .attr('width', d => d.width)
      .attr('height', d => d.height)
      .attr('x', d => -d.width / 2)
      .attr('y', d => -d.height / 2)
      .attr('fill', d => {
        if (d.type === 'question' || d.type === 'followup') return bgColor
        return `${d.color}18`
      })
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => d.type === 'question' || d.type === 'synthesis' ? 2 : 1.5)
      .attr('opacity', d => isOld(d) ? 0.5 : 1)

    // テキスト（折り返し対応）
    nodeGs.each(function (d) {
      const g = d3.select(this)
      const lines = wrapText(d.label, maxChars)
      const lineHeight = 14
      const startY = -(lines.length - 1) * lineHeight / 2

      const oldNode = isOld(d)
      lines.forEach((line, i) => {
        g.append('text')
          .text(line)
          .attr('text-anchor', 'middle')
          .attr('dy', startY + i * lineHeight + 4)
          .attr('fill', d.type === 'keypoint' ? mutedColor : d.type === 'question' || d.type === 'followup' ? textColor : d.color)
          .attr('font-size', d.type === 'keypoint' ? '10px' : '11px')
          .attr('font-weight', d.type === 'question' || d.type === 'synthesis' ? '600' : '400')
          .attr('opacity', oldNode ? 0.5 : 1)
      })
    })

    // スタンスアイコン
    nodeGs.filter(d => d.type === 'agent' && d.stance !== undefined)
      .append('text')
      .text(d => d.stance === 'support' ? '▲' : d.stance === 'oppose' ? '▼' : '◆')
      .attr('text-anchor', 'middle')
      .attr('dy', d => -d.height / 2 - 6)
      .attr('fill', d => d.stance === 'support' ? '#22C55E' : d.stance === 'oppose' ? '#EF4444' : '#F59E0B')
      .attr('font-size', '10px')

    // 叡ノードの視覚的強調: グロー + パルス
    nodeGs.filter(d => d.type === 'synthesis' && !isOld(d))
      .insert('rect', ':first-child')
      .attr('rx', 14).attr('ry', 14)
      .attr('width', d => d.width + 12)
      .attr('height', d => d.height + 12)
      .attr('x', d => -(d.width + 12) / 2)
      .attr('y', d => -(d.height + 12) / 2)
      .attr('fill', 'none')
      .attr('stroke', AGENTS.blue.hex)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.4)

    nodeGs.filter(d => d.type === 'synthesis' && !isOld(d))
      .insert('rect', ':first-child')
      .attr('rx', 18).attr('ry', 18)
      .attr('width', d => d.width + 24)
      .attr('height', d => d.height + 24)
      .attr('x', d => -(d.width + 24) / 2)
      .attr('y', d => -(d.height + 24) / 2)
      .attr('fill', `${AGENTS.blue.hex}08`)
      .attr('stroke', 'none')

    // シミュレーション
    const sim = d3.forceSimulation<SimNode>(simNodes)
      .alphaDecay(0.06)
      .velocityDecay(0.45)
      .force('link', d3.forceLink<SimNode, SimEdge>(simEdges)
        .id(d => d.id)
        .distance(d => d.type === 'contradict' ? 200 : 100)
        .strength(0.4)
      )
      .force('charge', d3.forceManyBody().strength(-500))
      .force('collide', d3.forceCollide<SimNode>()
        .radius(d => Math.max(d.width, d.height) / 2 + 15)
        .strength(1)
      )
      .force('center', d3.forceCenter(0, 0).strength(0.05))
      .force('y', d3.forceY<SimNode>(d => {
        if (d.type === 'question') return -80
        if (d.type === 'synthesis') return 120
        if (d.type === 'agent') return 0
        return 60
      }).strength(0.1))
      .on('tick', () => {
        links
          .attr('x1', d => (d as unknown as { source: SimNode }).source.x ?? 0)
          .attr('y1', d => (d as unknown as { source: SimNode }).source.y ?? 0)
          .attr('x2', d => (d as unknown as { target: SimNode }).target.x ?? 0)
          .attr('y2', d => (d as unknown as { target: SimNode }).target.y ?? 0)
        nodeGs.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })

    // アニメーション
    nodeGs.attr('opacity', 0).transition().duration(500).delay((_, i) => i * 60).attr('opacity', 1)
    links.attr('opacity', 0).transition().duration(400).delay(300).attr('opacity', 0.7)

    // リサイズ対応
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = fullScreen ? container.clientHeight : 420
      svg.attr('width', w).attr('height', h)
      sim.force('center', d3.forceCenter(0, 0))
      sim.alpha(0.05).restart()
    })
    resizeObserver.observe(container)

    return () => { sim.stop(); resizeObserver.disconnect() }
  }, [pipeline.synthesis, pipeline.agents, pipeline.verification, pipeline.structured, fullScreen])

  if (!pipeline.synthesis && !fullScreen) return null

  return (
    <div
      ref={containerRef}
      className={fullScreen ? 'relative w-full h-full' : 'relative mt-4 rounded-xl border overflow-hidden'}
      style={fullScreen ? { background: 'var(--bg-map)' } : { borderColor: 'var(--border-light)', background: 'var(--bg-secondary)' }}
    >
      {!fullScreen && (
        <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>Discussion Structure</span>
        </div>
      )}
      <svg ref={svgRef} className="w-full" style={{ minHeight: fullScreen ? '100%' : '420px', background: fullScreen ? 'var(--bg-map-gradient)' : 'transparent' }} />

      {/* 凡例 */}
      {pipeline.synthesis && (
        <div className="absolute bottom-3 right-3 px-3 py-2 rounded-lg border text-[10px] space-y-1" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)', color: 'var(--text-dim)' }}>
          <div className="flex items-center gap-2"><span style={{ color: '#22C55E' }}>▲</span> Support</div>
          <div className="flex items-center gap-2"><span style={{ color: '#F59E0B' }}>◆</span> Caution</div>
          <div className="flex items-center gap-2"><span style={{ color: '#EF4444' }}>▼</span> Oppose</div>
          <div className="flex items-center gap-2"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: '#EF4444' }} /> Contradiction</div>
          <div className="flex items-center gap-2"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: '#3B82F6' }} /> Deepens</div>
        </div>
      )}
    </div>
  )
}
