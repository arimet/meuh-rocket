import { describe, expect, it } from 'vitest'
import { LEVELS } from '../src/levels'
import { run } from '../src/sim/sim'
import { solve } from '../src/sim/solver'
import type { Arrows, Level } from '../src/sim/types'

const total = (l: Level) => Object.values(l.stock).reduce((a, b) => a + b, 0)
const holes = (l: Level) => l.cells.filter(c => c === 'hole').length
const innerWall = (l: Level) =>
  l.wallN.some((w, i) => w && i >= l.width) || l.wallW.some((w, i) => w && i % l.width !== 0)

// The idea each tutorial level teaches, as checkable facts.
const IDEAS: Record<number, (l: Level, minArrows: number, example: Arrows) => void> = {
  1: (l) => { expect(l.cows).toHaveLength(1); expect(l.ufos).toHaveLength(0); expect(total(l)).toBe(1); expect(holes(l)).toBe(0) },
  2: (l) => { expect(innerWall(l)).toBe(true); expect(l.ufos).toHaveLength(0) },
  3: (l, m) => { expect(holes(l)).toBeGreaterThan(0); expect(l.ufos).toHaveLength(0); expect(m).toBeGreaterThanOrEqual(2) },
  4: (l) => { expect(l.cows).toHaveLength(3); expect(l.ufos).toHaveLength(0) },
  5: (l) => { expect(l.ufos).toHaveLength(1) },
  6: (l, _m, example) => {
    // one arrow of the solution guides two different cows, at two different moments
    const events = run(l, example).events.filter(e => e.type === 'arrow')
    const shared = [...example.keys()].some(cell => {
      const hits = events.filter(e => e.cell === cell && l.cows[e.actor])
      return new Set(hits.map(e => e.actor)).size >= 2 && new Set(hits.map(e => e.tick)).size >= 2
    })
    expect(shared).toBe(true)
  },
  7: (l) => { expect(l.cows.length).toBeGreaterThanOrEqual(8); expect(l.ufos).toHaveLength(0) },
  8: (l, _m, example) => {
    expect(l.ufos).toHaveLength(1)
    // the solution traps the UFO: one arrow sends it round and round
    const ufoHits = run(l, example).events.filter(e => e.type === 'arrow' && e.actor >= l.cows.length)
    expect([...example.keys()].some(cell => ufoHits.filter(e => e.cell === cell).length >= 2)).toBe(true)
  },
  9: (l) => { expect(l.ufos).toHaveLength(2) },
  10: (l) => { expect(holes(l)).toBeGreaterThan(0); expect(innerWall(l)).toBe(true); expect(l.ufos.length).toBeGreaterThan(0) },
}

describe('levels', () => {
  it('are 12×9 with ids 1..n in order', () => {
    expect(LEVELS.length).toBeGreaterThan(0)
    LEVELS.forEach((l, i) => {
      expect(l.id).toBe(i + 1)
      expect([l.width, l.height]).toEqual([12, 9])
      expect(l.name).not.toBe('')
      expect(l.idea).not.toBe('')
    })
  })

  for (const level of LEVELS) {
    describe(`level ${level.id} (${level.name})`, () => {
      it('stores a winning solution within its stock', () => {
        const sol = level.solution!
        expect(sol).toBeDefined()
        expect(run(level, sol).outcome.result).toBe('won')
        for (const d of ['N', 'E', 'S', 'W'] as const)
          expect([...sol.values()].filter(v => v === d).length).toBeLessThanOrEqual(level.stock[d])
      })
      it('is not won without arrows', () => {
        expect(run(level, new Map()).outcome.result).toBe('failed')
      })
      it('is solvable within its stock and teaches its idea', () => {
        const r = solve(level)
        expect(r.solvable).toBe(true)
        IDEAS[level.id]?.(level, r.minArrows!, r.example!)
      }, 30_000)
    })
  }
})
