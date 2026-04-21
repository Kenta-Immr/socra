import { describe, it, expect } from 'vitest'
import { detectNameReferences } from '../engine'

// detectNameReferences の単体テスト
//
// 検出方針（engine.ts の AGENT_NAME_PATTERNS 設計）:
//   1. セット表記「漢字(英字)」「英字(漢字)」— プロンプトで強制する第一形式
//   2. 英字名単独 — LLM がプロンプトを守らなかった場合のフォールバック
//   3. 漢字単体（「情が」等）は検出対象外 — 一般語（情報・戒律・光景・創業）との衝突を避ける
//
// 対象エージェント: 7体
//   white(明/Mei), red(情/Jo), black(戒/Kai), yellow(光/Ko), green(創/So), blue(叡/Ei)
//   ※ 理(Ri) は HatColor='verify' のため発言内参照の検出対象外

describe('detectNameReferences', () => {
  // ── セット表記の検出（全7体）────────────────────────
  describe('セット表記「漢字(英字)」の検出', () => {
    it('明(Mei) を検出する', () => {
      expect(detectNameReferences('明(Mei)の事実整理を踏まえて判断する', 'red')).toContain('white')
    })

    it('情(Jo) を検出する', () => {
      expect(detectNameReferences('情(Jo)の感覚を尊重したい', 'yellow')).toContain('red')
    })

    it('戒(Kai) を検出する', () => {
      expect(detectNameReferences('戒(Kai)の警告は的を射ている', 'red')).toContain('black')
    })

    it('光(Ko) を検出する', () => {
      expect(detectNameReferences('光(Ko)が示した好機を見逃さない', 'red')).toContain('yellow')
    })

    it('創(So) を検出する', () => {
      expect(detectNameReferences('創(So)の第三案に可能性を感じる', 'red')).toContain('green')
    })

    it('叡(Ei) を検出する', () => {
      expect(detectNameReferences('叡(Ei)の統合に委ねる', 'red')).toContain('blue')
    })
  })

  describe('セット表記「英字(漢字)」の検出', () => {
    it('Jo(情) の逆順も検出する', () => {
      expect(detectNameReferences('Jo(情)が言った通り', 'yellow')).toContain('red')
    })

    it('Kai(戒) の逆順も検出する', () => {
      expect(detectNameReferences('Kai(戒)の指摘', 'red')).toContain('black')
    })
  })

  describe('セット表記の全角カッコ対応', () => {
    it('情（Jo）— 全角カッコでも検出', () => {
      expect(detectNameReferences('情（Jo）が指摘した', 'yellow')).toContain('red')
    })

    it('戒（Kai）— 全角カッコでも検出', () => {
      expect(detectNameReferences('戒（Kai）の警戒は重要', 'red')).toContain('black')
    })
  })

  // ── 英字名単独フォールバック ────────────────────────
  describe('英字名単独のフォールバック検出', () => {
    it('Jo を単独で検出する', () => {
      expect(detectNameReferences('Joが言った', 'yellow')).toContain('red')
    })

    it('Kai を単独で検出する', () => {
      expect(detectNameReferences('Kaiの視点', 'red')).toContain('black')
    })

    it('Mei/Ei も単独で検出する', () => {
      const r1 = detectNameReferences('Meiの事実整理', 'red')
      const r2 = detectNameReferences('Eiが統合する', 'red')
      expect(r1).toContain('white')
      expect(r2).toContain('blue')
    })

    it('大文字小文字を区別しない', () => {
      expect(detectNameReferences('joも同意', 'yellow')).toContain('red')
    })

    it('単語境界を守る（Joseph は Jo としてマッチしない）', () => {
      expect(detectNameReferences('Josephの意見は別物', 'yellow')).not.toContain('red')
    })
  })

  // ── 漢字単体は検出しない（設計上の意図） ──────────
  describe('漢字単体は検出しない（false positive防止）', () => {
    it('「情が」は検出しない（一般語「情報」等との衝突を避ける設計）', () => {
      expect(detectNameReferences('情が指摘した', 'yellow')).not.toContain('red')
    })

    it('「戒が」は検出しない', () => {
      expect(detectNameReferences('戒が警告した', 'red')).not.toContain('black')
    })

    it('「光が」は検出しない', () => {
      expect(detectNameReferences('光が示した', 'red')).not.toContain('yellow')
    })

    it('「創が」は検出しない', () => {
      expect(detectNameReferences('創が提案', 'red')).not.toContain('green')
    })
  })

  // ── 一般語の誤検出なし（構造的保証） ──────────────
  describe('一般語の誤検出なし', () => {
    it('情報・情熱・感情 は情として検出しない', () => {
      expect(detectNameReferences('情報を収集する', 'yellow')).not.toContain('red')
      expect(detectNameReferences('情熱を持って', 'yellow')).not.toContain('red')
      expect(detectNameReferences('感情を抑える', 'yellow')).not.toContain('red')
    })

    it('戒律・警戒 は戒として検出しない', () => {
      expect(detectNameReferences('戒律を守る', 'red')).not.toContain('black')
      expect(detectNameReferences('警戒は必要', 'red')).not.toContain('black')
    })

    it('光景・観光・日光 は光として検出しない', () => {
      expect(detectNameReferences('光景を想像する', 'red')).not.toContain('yellow')
      expect(detectNameReferences('観光業界', 'red')).not.toContain('yellow')
      expect(detectNameReferences('日光のもとで', 'red')).not.toContain('yellow')
    })

    it('創業・創造・独創 は創として検出しない', () => {
      expect(detectNameReferences('創業時の理念', 'red')).not.toContain('green')
      expect(detectNameReferences('創造的解決', 'red')).not.toContain('green')
      expect(detectNameReferences('独創的発想', 'red')).not.toContain('green')
    })

    it('明確・明日・透明 は明として検出しない', () => {
      expect(detectNameReferences('明確に示す', 'red')).not.toContain('white')
      expect(detectNameReferences('明日やろう', 'red')).not.toContain('white')
      expect(detectNameReferences('透明性を保つ', 'red')).not.toContain('white')
    })

    it('叡智 は叡として検出しない', () => {
      expect(detectNameReferences('叡智を集める', 'red')).not.toContain('blue')
    })
  })

  // ── 話者自身の除外 ───────────────────────────────
  describe('話者自身の除外', () => {
    it('fromHat=red で情(Jo) は除外される', () => {
      expect(detectNameReferences('情(Jo)として発言する', 'red')).not.toContain('red')
    })

    it('fromHat=black で戒(Kai) は除外される', () => {
      expect(detectNameReferences('戒(Kai)として警告する', 'black')).not.toContain('black')
    })

    it('fromHat=blue で叡(Ei) は除外される', () => {
      expect(detectNameReferences('叡(Ei)の立場から統合する', 'blue')).not.toContain('blue')
    })
  })

  // ── 複合・エッジケース ─────────────────────────
  describe('複合ケース・エッジケース', () => {
    it('空文字列は空配列を返す', () => {
      expect(detectNameReferences('', 'red')).toEqual([])
    })

    it('エージェント名を含まない文は空配列', () => {
      expect(detectNameReferences('この判断は難しい', 'red')).toEqual([])
    })

    it('複数の他エージェントを同時に検出する', () => {
      const speech = '戒(Kai)の懸念に加え、光(Ko)の提案、そして創(So)の代案も考慮したい'
      const result = detectNameReferences(speech, 'red')
      expect(result).toContain('black')
      expect(result).toContain('yellow')
      expect(result).toContain('green')
      expect(result).not.toContain('red') // 話者
    })

    it('セット表記とフォールバックの混在も正しく処理', () => {
      const speech = '戒(Kai)の指摘を受けて、Joとしても同意する'
      // fromHat=yellow なので戒(black) と Jo(red) の両方を検出
      const result = detectNameReferences(speech, 'yellow')
      expect(result).toContain('black')
      expect(result).toContain('red')
    })

    it('7体全員が1文に出ても正しく検出（話者除外）', () => {
      const speech = '明(Mei)の事実、情(Jo)の感覚、戒(Kai)の警戒、光(Ko)の好機、創(So)の代案、叡(Ei)の統合、全てを踏まえて'
      const result = detectNameReferences(speech, 'red') // 話者=情
      expect(result).toContain('white')
      expect(result).toContain('black')
      expect(result).toContain('yellow')
      expect(result).toContain('green')
      expect(result).toContain('blue')
      expect(result).not.toContain('red')
    })
  })
})
