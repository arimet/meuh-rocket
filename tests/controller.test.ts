import { describe, expect, it, vi } from 'vitest'
import { CAUSE_SECONDS, GameController, REWIND_SECONDS, type Phase } from '../src/game/controller'
import type { Dir } from '../src/sim/types'
import { lvl } from './helpers'

// One arrow (S at (1,0)) saves the cow; without it she falls in the hole.
const reference = ['+-+-+-+', '|. . .|', '+ + + +', '|R . O|', '+-+-+-+']
const make = (stock: Partial<Record<Dir, number>> = { S: 1 }, hooks = {}) => new GameController(lvl(reference, { cows: [[0, 0, 'E']], stock }), hooks)
const runFor = (c: GameController, seconds: number, dt = 0.05) => {
  let f = c.update(0)
  for (let t = 0; t < seconds; t += dt) f = c.update(dt)
  return f
}

describe('GameController', () => {
  it('launch runs then wins', () => {
    const onWin = vi.fn()
    const c = make({ S: 1 }, { onWin })
    expect(c.place(1, 'S')).toBe(true)
    expect(c.launch()).toBe(true)
    expect(c.update(0.01).phase).toBe('running')
    const f = runFor(c, 3)
    expect(f.phase).toBe('won')
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onWin).toHaveBeenCalledWith({ excellent: false, arrowsUsed: 1 })
  })

  it('excellent when fewer arrows than stock', () => {
    const onWin = vi.fn()
    const c = make({ S: 1, W: 1 }, { onWin })
    c.place(1, 'S')
    c.launch()
    runFor(c, 3)
    expect(onWin).toHaveBeenCalledWith({ excellent: true, arrowsUsed: 1 })
  })

  it('failure goes cause → rewinding → placing and keeps arrows', () => {
    const phases: Phase[] = []
    const c = make({ S: 1, W: 1 }, { onPhase: (p: Phase) => phases.push(p) })
    c.place(2, 'S') // same as the wall rule: still falls in the hole
    c.launch()
    let t = 0, failedAt = -1, back = -1
    for (; t < 10 && back < 0; t += 0.02) {
      const f = c.update(0.02)
      if (f.phase === 'cause' && failedAt < 0) { failedAt = t; expect(f.highlight).toBe(0) }
      if (f.phase === 'placing') back = t
    }
    expect(phases).toEqual(['running', 'cause', 'rewinding', 'placing'])
    expect(back - failedAt).toBeGreaterThanOrEqual(1)
    expect(back - failedAt).toBeLessThanOrEqual(CAUSE_SECONDS + REWIND_SECONDS + 0.05)
    expect([...c.arrows]).toEqual([[2, 'S']])
  })

  it('rewind length is independent of history length', () => {
    const rewindTime = (grid: string[]) => {
      const c = new GameController(lvl(grid, { cows: [[0, 0, 'E']] }))
      c.launch()
      let start = -1
      for (let t = 0; t < 60; t += 0.02) {
        const p = c.update(0.02).phase
        if (p === 'rewinding' && start < 0) start = t
        if (p === 'placing' && start >= 0) return t - start
      }
      return Infinity
    }
    const long = rewindTime(['+-+-+-+-+-+-+-+-+-+-+-+-+', '|. . . . . . . . . . . .|', '+-+-+-+-+-+-+-+-+-+-+-+-+'])
    const short = rewindTime(['+-+-+-+', '|. O R|', '+-+-+-+'])
    expect(Math.abs(long - REWIND_SECONDS)).toBeLessThan(0.05)
    expect(Math.abs(short - REWIND_SECONDS)).toBeLessThan(0.05)
  })

  it('rewinding plays the history backwards', () => {
    const c = make()
    c.launch()
    let last = Infinity
    for (let t = 0; t < 10; t += 0.05) {
      const f = c.update(0.05)
      if (f.phase === 'rewinding') { expect(f.from.tick).toBeLessThanOrEqual(last); last = f.from.tick }
      if (f.phase === 'placing' && last !== Infinity) break
    }
    expect(last).toBeLessThan(3)
  })

  it('stop returns to placing, but not during rewind', () => {
    const c = make()
    c.place(1, 'S')
    c.launch()
    c.update(0.1)
    expect(c.stop()).toBe(true)
    expect(c.update(0).phase).toBe('placing')
    expect([...c.arrows]).toEqual([[1, 'S']])
    c.remove(1)
    c.launch()
    let f = c.update(0)
    while (f.phase !== 'rewinding') f = c.update(0.05)
    expect(c.stop()).toBe(false)
    expect(c.update(0).phase).toBe('rewinding')
  })

  it('ignores input while not placing', () => {
    const c = make({ S: 1, W: 1 })
    expect(c.launch()).toBe(true)
    expect(c.launch()).toBe(false)
    expect(c.place(1, 'S')).toBe(false)
    expect(c.remove(1)).toBe(false)
    c.clear()
    expect(c.arrows.size).toBe(0)
  })

  it('stock enforced', () => {
    const c = make({ S: 1 })
    expect(c.remaining('S')).toBe(1)
    expect(c.place(1, 'S')).toBe(true)
    expect(c.remaining('S')).toBe(0)
    expect(c.place(2, 'S')).toBe(false)
    expect(c.remove(1)).toBe(true)
    expect(c.remaining('S')).toBe(1)
    c.place(1, 'S')
    c.clear()
    expect(c.remaining('S')).toBe(1)
  })

  it('interpolates between consecutive ticks while running', () => {
    const c = make()
    c.place(1, 'S')
    c.launch()
    for (let i = 0; i < 10; i++) {
      const f = c.update(0.023)
      if (f.phase !== 'running') break
      expect(f.alpha).toBeGreaterThanOrEqual(0)
      expect(f.alpha).toBeLessThan(1)
      expect(f.to.tick).toBe(f.from.tick + 1)
    }
  })

  it('emits each simulation event once', () => {
    const onEvent = vi.fn()
    const c = make({ S: 1 }, { onEvent })
    c.place(1, 'S')
    c.launch()
    runFor(c, 3, 0.2)
    const types = onEvent.mock.calls.map(([e]) => e.type)
    expect(types.filter(t => t === 'saved')).toHaveLength(1)
    expect(types.filter(t => t === 'arrow')).toHaveLength(1)
  })
})
