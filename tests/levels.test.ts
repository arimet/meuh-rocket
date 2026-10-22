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

// World 2 (Roswell): every level is solved through a teleporter, and teaches one more thing about them.
const teleports = (l: Level, sol: Arrows) => run(l, sol).events.filter(e => e.type === 'teleport')
const cowJumps = (l: Level, sol: Arrows) => teleports(l, sol).filter(e => l.cows[e.actor])
const pairs = (l: Level) => l.portals.filter((t, i) => t > i).length
const W2: Record<number, (l: Level, sol: Arrows) => void> = {
  11: (l) => { expect(pairs(l)).toBe(1); expect(l.ufos).toHaveLength(0) },
  12: (l) => { expect(pairs(l)).toBe(1); expect(total(l)).toBeGreaterThanOrEqual(2) },
  13: (l, sol) => {
    // a teleported cow comes out against a wall and turns
    const r = run(l, sol)
    expect(r.events.some(e => e.type === 'teleport' && l.cows[e.actor] && r.history[e.tick].actors[e.actor].dir !== r.history[e.tick - 1].actors[e.actor].dir)).toBe(true)
  },
  14: (l, sol) => { expect(pairs(l)).toBe(2); expect(new Set(teleports(l, sol).map(e => Math.min(e.cell!, e.to!))).size).toBe(2) },
  15: (l, sol) => { expect(l.ufos.length).toBeGreaterThan(0); expect(teleports(l, sol).some(e => e.actor >= l.cows.length)).toBe(true) },
  16: (l, sol) => {
    const hits = run(l, sol).events.filter(e => e.type === 'arrow' && e.actor >= l.cows.length)
    expect([...sol.keys()].some(c => hits.filter(e => e.cell === c).length >= 2)).toBe(true)
  },
  17: (l) => { expect(l.cows.length).toBeGreaterThanOrEqual(6) },
  18: (l) => { expect(holes(l)).toBeGreaterThanOrEqual(7) },
  19: (l) => { expect(l.ufos).toHaveLength(2) },
  20: (l) => { expect(pairs(l)).toBeGreaterThanOrEqual(2); expect(l.ufos.length).toBeGreaterThan(0); expect(holes(l)).toBeGreaterThan(0); expect(total(l)).toBeGreaterThanOrEqual(3) },
}

describe('levels', () => {
  it('are 12×9 with ids 1..n in order', () => {
    expect(LEVELS.length).toBeGreaterThan(0)
    LEVELS.forEach((l, i) => {
      expect(l.id).toBe(i + 1)
      expect([l.width, l.height]).toEqual([12, 9])
      for (const lang of ['fr', 'en'] as const) {
        expect(l.name[lang]).not.toBe('')
        expect(l.idea[lang]).not.toBe('')
      }
    })
  })

  for (const level of LEVELS) {
    describe(`level ${level.id} (${level.name.en})`, () => {
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
        if (level.id > 20) {
          // world 3: hard boards — many arrows truly needed, plenty of cows, (almost) one answer
          expect(r.minArrows).toBeGreaterThanOrEqual(level.id >= 37 ? 6 : level.id >= 34 ? 5 : 4)
          expect(level.cows.length).toBeGreaterThanOrEqual(5)
          expect(r.solutions).toBeLessThanOrEqual(2)
        } else if (level.id > 10) {
          expect(cowJumps(level, r.example!).length).toBeGreaterThan(0)
          W2[level.id]?.(level, r.example!)
        }
      }, 30_000)
    })
  }
})
