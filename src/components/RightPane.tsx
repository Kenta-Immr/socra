'use client'

// RightPane — 焦点深度マップ型（彩設計 v2）
// 3ゾーン構成: FOCUS ZONE（最上部）/ DEPTH MAP（中央）/ ANCHOR POINTS（下部）
// 2026-04-19 律が直接実装（Agent toolのsandbox制約のため）

import type {
  FocusPoint,
  DiscussionPhase,
  AgentResponse,
  CrossBorderRecord,
  SynthesisResult,
  HatColor,
} from '@/types'
import { AGENTS } from '@/types'

interface RightPaneProps {
  focusPoint: FocusPoint | null
  discussionPhase: DiscussionPhase | null
  agents: AgentResponse[]
  crossBorders: CrossBorderRecord[]
  synthesis: SynthesisResult | null
}

const CROSS_BORDER_LIMIT = 3

export function RightPane({
  focusPoint,
  discussionPhase,
  agents,
  crossBorders,
  synthesis,
}: RightPaneProps) {
  return (
    <div className="flex flex-col h-full w-full bg-gray-950 border-l border-gray-800 text-gray-100 overflow-hidden">
      <FocusZone
        focusPoint={focusPoint}
        discussionPhase={discussionPhase}
        crossBorderCount={crossBorders.length}
      />
      <DepthMap
        agents={agents}
        crossBorders={crossBorders}
        discussionPhase={discussionPhase}
      />
      <AnchorPoints
        agents={agents}
        synthesis={synthesis}
      />
    </div>
  )
}

// ── FOCUS ZONE ──────────────────────────────────────────
function FocusZone({
  focusPoint,
  discussionPhase,
  crossBorderCount,
}: {
  focusPoint: FocusPoint | null
  discussionPhase: DiscussionPhase | null
  crossBorderCount: number
}) {
  const phaseLabel: Record<DiscussionPhase, string> = {
    pre_focus: '焦点を定めています…',
    focused: '焦点で議論中',
    converging: '統合に向かっています',
  }

  return (
    <div className="shrink-0 border-b border-gray-800 p-4">
      <div className="text-xs text-gray-500 mb-2 tracking-wider uppercase">Focus</div>
      {focusPoint ? (
        <>
          <div className="text-base font-medium leading-snug mb-2">
            {focusPoint.question}
          </div>
          {focusPoint.rationale && (
            <div className="text-xs text-gray-400 leading-relaxed">
              {focusPoint.rationale}
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-gray-500 italic">
          {discussionPhase === 'pre_focus' ? '焦点を定めています…' : 'まだ焦点が定まっていません'}
        </div>
      )}

      {/* 応酬プログレス */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-orange-400 transition-all duration-500"
            style={{ width: `${Math.min(100, (crossBorderCount / CROSS_BORDER_LIMIT) * 100)}%` }}
          />
        </div>
        <div className="text-xs text-gray-500 tabular-nums shrink-0">
          越境 {crossBorderCount}/{CROSS_BORDER_LIMIT}
        </div>
      </div>

      {discussionPhase && (
        <div className="mt-2 text-xs text-gray-500">
          {phaseLabel[discussionPhase]}
        </div>
      )}
    </div>
  )
}

// ── DEPTH MAP ─────────────────────────────────────────
function DepthMap({
  agents,
  crossBorders,
  discussionPhase,
}: {
  agents: AgentResponse[]
  crossBorders: CrossBorderRecord[]
  discussionPhase: DiscussionPhase | null
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <div className="text-xs text-gray-500 mb-3 tracking-wider uppercase">Depth Map</div>

      {agents.length === 0 ? (
        <div className="text-sm text-gray-600 italic py-8 text-center">
          議論が始まると、ここに思考の軌跡が積み上がります
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent, idx) => {
            const crossBorderHere = crossBorders.find(cb => cb.fromHat === agent.hat)
            return (
              <div key={`${agent.hat}-${idx}`}>
                <AgentNode agent={agent} />
                {crossBorderHere && (
                  <CrossBorderArrow record={crossBorderHere} />
                )}
              </div>
            )
          })}
          {discussionPhase === 'converging' && (
            <div className="mt-4 text-xs text-orange-300 italic text-center">
              叡が統合に向かっています…
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AgentNode({ agent }: { agent: AgentResponse }) {
  const identity = AGENTS[agent.hat]
  const stanceBadge = {
    support: { label: '賛成', bg: 'bg-green-900/40', text: 'text-green-300' },
    caution: { label: '留保', bg: 'bg-yellow-900/40', text: 'text-yellow-300' },
    oppose: { label: '反対', bg: 'bg-red-900/40', text: 'text-red-300' },
  }[agent.stance]

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg border border-gray-800 bg-gray-900/50"
      style={{ borderLeftColor: identity.hex, borderLeftWidth: '3px' }}
    >
      <div
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
        style={{ backgroundColor: identity.hex, color: agent.hat === 'white' ? '#111' : '#fff' }}
      >
        {identity.kanji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{identity.name}</span>
          <span className="text-xs text-gray-500">{identity.label}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${stanceBadge.bg} ${stanceBadge.text}`}>
            {stanceBadge.label}
          </span>
          <IntensityBar intensity={agent.intensity} />
        </div>
        <div className="text-xs text-gray-300 leading-relaxed line-clamp-3">
          {agent.reasoning}
        </div>
      </div>
    </div>
  )
}

function IntensityBar({ intensity }: { intensity: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className={`w-1 h-3 rounded-sm ${i <= intensity ? 'bg-blue-400' : 'bg-gray-700'}`}
        />
      ))}
    </div>
  )
}

function CrossBorderArrow({ record }: { record: CrossBorderRecord }) {
  const fromIdentity = AGENTS[record.fromHat]
  const toIdentity = AGENTS[record.toHat]
  const levelLabel = record.level === 'L3' ? '転換' : '気づき'
  const levelColor = record.level === 'L3' ? 'text-orange-300' : 'text-amber-300'

  return (
    <div className="ml-4 my-1.5 pl-3 border-l-2 border-orange-500/50 py-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-gray-500">{fromIdentity.name}</span>
        <span className="text-orange-400 text-sm">→</span>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ backgroundColor: toIdentity.hex + '40', color: toIdentity.hex }}
        >
          {toIdentity.kanji} {toIdentity.name}
        </span>
        <span className={`text-xs ${levelColor} font-medium`}>{record.level} {levelLabel}</span>
      </div>
      <div className="text-xs text-gray-300 italic">
        「{record.content}」
      </div>
      {record.reason && (
        <div className="text-xs text-gray-500 mt-1">
          {record.reason}
        </div>
      )}
    </div>
  )
}

// ── ANCHOR POINTS ─────────────────────────────────────
function AnchorPoints({
  agents,
  synthesis,
}: {
  agents: AgentResponse[]
  synthesis: SynthesisResult | null
}) {
  if (!synthesis && agents.length === 0) {
    return null
  }

  return (
    <div className="shrink-0 border-t border-gray-800 p-4 max-h-64 overflow-y-auto">
      <div className="text-xs text-gray-500 mb-2 tracking-wider uppercase">Anchor Points</div>

      {/* エージェントの要点チップ */}
      {agents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {agents.flatMap((a, i) =>
            a.keyPoints.slice(0, 2).map((kp, j) => (
              <KeyPointChip key={`${a.hat}-${i}-${j}`} hat={a.hat} text={kp} />
            ))
          )}
        </div>
      )}

      {/* 叡の統合サマリー */}
      {synthesis && (
        <div className="text-xs text-blue-200 leading-relaxed bg-blue-950/30 rounded p-2 border border-blue-900/40">
          <div className="text-blue-400 font-medium mb-1">叡の統合</div>
          <div className="line-clamp-4">{synthesis.recommendation}</div>
        </div>
      )}
    </div>
  )
}

function KeyPointChip({ hat, text }: { hat: HatColor; text: string }) {
  const identity = AGENTS[hat]
  return (
    <div
      className="text-xs px-2 py-1 rounded-full border max-w-full truncate"
      style={{
        borderColor: identity.hex + '80',
        backgroundColor: identity.hex + '15',
        color: '#e5e7eb',
      }}
      title={text}
    >
      <span className="mr-1 opacity-60">{identity.kanji}</span>
      {text}
    </div>
  )
}
