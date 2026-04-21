import { describe, it, expect } from 'vitest'
import { detectNameReferences } from '../engine'

// detectNameReferences の単体テスト
// 観点:
//   1. 英字名（Jo/Kai/Ko/So）が正しく検出される
//   2. 漢字名（情/戒/光/創）が「エージェント名として使われる文脈」でのみ検出される
//   3. 一般語（情報・戒律・光景・創業 等）は誤検出しない
//   4. 話者自身（fromHat）は除外される
//   5. 複数参照は全て検出される

describe('detectNameReferences', () => {
  // ── 英字名検出 ─────────────────────────────────
  describe('英字名検出', () => {
    it('Jo を単独で検出する', () => {
      expect(detectNameReferences('Joが指摘した点は重要だ', 'yellow')).toContain('red')
    })

    it('Kai を単独で検出する', () => {
      expect(detectNameReferences('Kaiの視点は見落とせない', 'red')).toContain('black')
    })

    it('Ko を単独で検出する', () => {
      expect(detectNameReferences('Koが提示したチャンスを活かす', 'red')).toContain('yellow')
    })

    it('So を単独で検出する', () => {
      expect(detectNameReferences('Soの創造的な代案に注目', 'red')).toContain('green')
    })

    it('複数の英字名を同時に検出する', () => {
      const result = detectNameReferences('JoとKaiの両方が懸念を示した', 'yellow')
      expect(result).toContain('red')
      expect(result).toContain('black')
    })

    it('大文字小文字を区別しない', () => {
      expect(detectNameReferences('joも同意している', 'yellow')).toContain('red')
    })

    it('単語境界を守る（Joseph は Jo としてマッチしない）', () => {
      expect(detectNameReferences('Josephの意見は別物', 'yellow')).not.toContain('red')
    })
  })

  // ── 漢字名の正検出 ─────────────────────────────
  describe('漢字名の正検出', () => {
    it('主語助詞付きの漢字名を検出する', () => {
      expect(detectNameReferences('情が指摘したように、感情面が鍵だ', 'yellow')).toContain('red')
    })

    it('句読点後の漢字名を検出する', () => {
      expect(detectNameReferences('先ほど、戒が警告した通りだ', 'red')).toContain('black')
    })

    it('引用符付きの漢字名を検出する', () => {
      expect(detectNameReferences('「光」の観点から賛成する', 'red')).toContain('yellow')
    })

    it('敬称付きの漢字名を検出する', () => {
      expect(detectNameReferences('創さんの提案に乗りたい', 'red')).toContain('green')
    })

    it('ラベル記法の漢字名を検出する', () => {
      expect(detectNameReferences('情: この選択は怖い', 'yellow')).toContain('red')
    })
  })

  // ── 一般語の誤検出なし ───────────────────────
  describe('一般語の誤検出なし', () => {
    it('「情報」は情として検出しない', () => {
      expect(detectNameReferences('情報を収集して判断する', 'yellow')).not.toContain('red')
    })

    it('「情熱」は情として検出しない', () => {
      expect(detectNameReferences('情熱を持って取り組む', 'yellow')).not.toContain('red')
    })

    it('「感情」は情として検出しない', () => {
      expect(detectNameReferences('感情を抑えて議論する', 'yellow')).not.toContain('red')
    })

    it('「戒律」は戒として検出しない', () => {
      expect(detectNameReferences('戒律を守る必要がある', 'red')).not.toContain('black')
    })

    it('「警戒」は戒として検出しない', () => {
      expect(detectNameReferences('警戒は必要だが過剰にしない', 'red')).not.toContain('black')
    })

    it('「光景」は光として検出しない', () => {
      expect(detectNameReferences('素晴らしい光景を想像する', 'red')).not.toContain('yellow')
    })

    it('「観光」は光として検出しない', () => {
      expect(detectNameReferences('観光業界の動向を見る', 'red')).not.toContain('yellow')
    })

    it('「創業」は創として検出しない', () => {
      expect(detectNameReferences('創業時の理念を思い出す', 'red')).not.toContain('green')
    })

    it('「創造」は創として検出しない', () => {
      expect(detectNameReferences('創造的な解決が必要だ', 'red')).not.toContain('green')
    })

    it('「独創」は創として検出しない', () => {
      expect(detectNameReferences('独創は評価されるが…', 'red')).not.toContain('green')
    })
  })

  // ── 話者自身の除外 ─────────────────────────
  describe('話者自身の除外', () => {
    it('fromHat=red の場合、Jo / 情 は検出しない', () => {
      const result = detectNameReferences('Joの立場から言えば、情が優先だ', 'red')
      expect(result).not.toContain('red')
    })

    it('fromHat=black の場合、Kai / 戒 は検出しない', () => {
      const result = detectNameReferences('Kaiとして警告する', 'black')
      expect(result).not.toContain('black')
    })
  })

  // ── 空入力・エッジケース ──────────────────
  describe('エッジケース', () => {
    it('空文字列は空配列を返す', () => {
      expect(detectNameReferences('', 'red')).toEqual([])
    })

    it('エージェント名を一切含まない文は空配列', () => {
      expect(detectNameReferences('この判断は難しい', 'red')).toEqual([])
    })

    it('複合的な参照（英字+漢字+話者除外）を正しく処理', () => {
      const speech = 'Kaiが指摘し、「光」も懸念、情が賛成、Soは保留'
      const result = detectNameReferences(speech, 'red') // 話者=情
      expect(result).toContain('black')  // Kai
      expect(result).toContain('yellow') // 光
      expect(result).toContain('green')  // So
      expect(result).not.toContain('red') // 情（話者自身）は除外
    })
  })
})
