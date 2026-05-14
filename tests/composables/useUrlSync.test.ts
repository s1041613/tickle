import { describe, it, expect } from 'vitest'
import { parseWarnings, serializeWarnings } from '../../src/composables/useUrlSync'
import type { Warning } from '../../src/types'

describe('parseWarnings', () => {
  it('T1: returns correctly-shaped warnings for well-formed input', () => {
    const result = parseWarnings('60:orange:bell,30:red:gong')
    expect(result).toEqual([
      { id: 1, at: 60, color: 'orange', sound: 'bell' },
      { id: 2, at: 30, color: 'red', sound: 'gong' },
    ])
  })

  it('T2: skips invalid items but keeps valid ones', () => {
    const result = parseWarnings('60:orange:bell,abc:xyz:wrong,30:red:gong')
    expect(result).toHaveLength(2)
    expect(result?.[0]).toMatchObject({ at: 60, color: 'orange', sound: 'bell' })
    expect(result?.[1]).toMatchObject({ at: 30, color: 'red', sound: 'gong' })
  })

  it('T2b: skips items with non-positive seconds', () => {
    const result = parseWarnings('0:orange:bell,-5:red:gong,30:yellow:chime')
    expect(result).toHaveLength(1)
    expect(result?.[0]).toMatchObject({ at: 30 })
  })

  it('T2c: skips items with missing parts', () => {
    const result = parseWarnings('60:orange,30:red:gong')
    expect(result).toHaveLength(1)
    expect(result?.[0]).toMatchObject({ at: 30 })
  })

  it('T3: returns null for null input', () => {
    expect(parseWarnings(null)).toBeNull()
  })

  it('T3b: returns null for empty string input', () => {
    expect(parseWarnings('')).toBeNull()
  })

  it('T3c: returns empty array if all items are invalid', () => {
    const result = parseWarnings('abc:xyz:wrong')
    expect(result).toEqual([])
  })

  it('T3d: accepts polite and cheer clap sounds as valid', () => {
    const result = parseWarnings('60:yellow:polite,30:red:cheer')
    expect(result).toEqual([
      { id: 1, at: 60, color: 'yellow', sound: 'polite' },
      { id: 2, at: 30, color: 'red', sound: 'cheer' },
    ])
  })
})

describe('serializeWarnings', () => {
  it('serializes a list to comma-separated triples', () => {
    const input: Warning[] = [
      { id: 1, at: 60, color: 'orange', sound: 'bell' },
      { id: 2, at: 30, color: 'red', sound: 'gong' },
    ]
    expect(serializeWarnings(input)).toBe('60:orange:bell,30:red:gong')
  })

  it('returns empty string for empty list', () => {
    expect(serializeWarnings([])).toBe('')
  })
})

describe('parseWarnings ↔ serializeWarnings', () => {
  it('T4: round-trip preserves at/color/sound for valid inputs', () => {
    const original: Warning[] = [
      { id: 1, at: 120, color: 'yellow', sound: 'chime' },
      { id: 2, at: 60, color: 'orange', sound: 'bell' },
      { id: 3, at: 10, color: 'red', sound: 'gong' },
    ]
    const serialized = serializeWarnings(original)
    const parsed = parseWarnings(serialized)
    expect(parsed).not.toBeNull()
    expect(parsed).toHaveLength(original.length)
    parsed?.forEach((w, i) => {
      expect(w.at).toBe(original[i].at)
      expect(w.color).toBe(original[i].color)
      expect(w.sound).toBe(original[i].sound)
    })
  })

  it('T4b: round-trip preserves polite / cheer clap sounds', () => {
    const original: Warning[] = [
      { id: 1, at: 30, color: 'yellow', sound: 'polite' },
      { id: 2, at: 10, color: 'red', sound: 'cheer' },
    ]
    const serialized = serializeWarnings(original)
    expect(serialized).toBe('30:yellow:polite,10:red:cheer')
    const parsed = parseWarnings(serialized)
    expect(parsed).toHaveLength(2)
    expect(parsed?.[0].sound).toBe('polite')
    expect(parsed?.[1].sound).toBe('cheer')
  })
})
