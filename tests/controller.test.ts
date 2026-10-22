import { describe, expect, it, vi } from 'vitest'
import { ABDUCT_SECONDS, CAUSE_SECONDS, GameController, REWIND_SECONDS, UNDO_ABDUCT_SECONDS, type Phase } from '../src/game/controller'
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
    c.update(0.35)
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

  it('an abduction is shown longer, with its progress and cause exposed to the renderer', () => {
    const c = new GameController(lvl(['+-+-+-+-+-+-+', '|. . . . . .|', '+-+-+-+-+-+-+'], { cows: [[0, 0, 'E']], ufos: [[5, 0, 'W']] }))
    c.launch()
    let f = c.update(0)
    while (f.phase === 'running') f = c.update(0.02)
    expect(f.phase).toBe('cause')
    expect(f.cause?.type).toBe('abducted')
    expect(f.cause?.by).toBe(1)
    let t = 0, last = -1
    while (f.phase === 'cause') {
      expect(f.causeT).toBeGreaterThanOrEqual(last)
      expect(f.causeT).toBeLessThanOrEqual(1)
      last = f.causeT
      f = c.update(0.02)
      t += 0.02
    }
    expect(Math.abs(t - ABDUCT_SECONDS)).toBeLessThan(0.05)
    expect(ABDUCT_SECONDS).toBeGreaterThan(CAUSE_SECONDS)
    expect(f.phase).toBe('rewinding')
  })

  it('a fall keeps the short cause', () => {
    const c = new GameController(lvl(['+-+-+-+', '|. O R|', '+-+-+-+'], { cows: [[0, 0, 'E']] }))
    c.launch()
    let f = c.update(0)
    while (f.phase === 'running') f = c.update(0.02)
    let t = 0
    while (f.phase === 'cause') { f = c.update(0.02); t += 0.02 }
    expect(Math.abs(t - CAUSE_SECONDS)).toBeLessThan(0.05)
  })

  it('rewinds the abduction itself before rewinding the board', () => {
    const c = new GameController(lvl(['+-+-+-+-+-+-+', '|. . . . . .|', '+-+-+-+-+-+-+'], { cows: [[0, 0, 'E']], ufos: [[5, 0, 'W']] }))
    c.launch()
    let f = c.update(0)
    while (f.phase !== 'rewinding') f = c.update(0.02)
    const undo: number[] = [], board: number[] = []
    let t = 0
    while (f.phase === 'rewinding') {
      expect(f.cause?.type).toBe('abducted')
      if (f.causeT > 0) { expect(board).toHaveLength(0); undo.push(f.causeT) } else board.push(f.from.tick)
      f = c.update(0.02)
      t += 0.02
    }
    expect(undo[0]).toBeGreaterThan(0.9)
    expect(undo.every((v, k) => k === 0 || v <= undo[k - 1])).toBe(true)
    expect(board[0]).toBeGreaterThan(board.at(-1)!)
    expect(Math.abs(t - (UNDO_ABDUCT_SECONDS + REWIND_SECONDS))).toBeLessThan(0.06)
    expect(UNDO_ABDUCT_SECONDS + REWIND_SECONDS).toBeLessThanOrEqual(2)
  })

  it('counts launches', () => {
    const c = make()
    expect(c.launches).toBe(0)
    c.launch()
    c.update(0.35)
    c.stop()
    c.launch()
    expect(c.launches).toBe(2)
  })

  it('applies the stored solution and remembers it was used', () => {
    const l = lvl(reference, { cows: [[0, 0, 'E']], stock: { S: 1, W: 1 } })
    const c = new GameController({ ...l, solution: new Map([[1, 'S']]) })
    c.place(2, 'W')
    expect(c.usedSolution).toBe(false)
    expect(c.showSolution()).toBe(true)
    expect([...c.arrows]).toEqual([[1, 'S']])
    expect(c.usedSolution).toBe(true)
    c.launch()
    expect(c.showSolution()).toBe(false) // not while running
  })

  it('has no solution to show when the level stores none', () => {
    expect(make().showSolution()).toBe(false)
  })

  it('fast-forward speeds up the run but not the rewind', () => {
    const timeTo = (speed: number, phase: Phase) => {
      const c = new GameController(lvl(['+-+-+-+-+-+-+-+-+-+-+-+-+', '|. . . . . . . . . . . .|', '+-+-+-+-+-+-+-+-+-+-+-+-+'], { cows: [[0, 0, 'E']] }))
      c.speed = speed
      c.launch()
      let t = 0, f = c.update(0)
      while (f.phase !== phase && t < 60) { f = c.update(0.01); t += 0.01 }
      return { t, c }
    }
    const slow = timeTo(1, 'cause').t, fast = timeTo(4, 'cause').t
    expect(fast).toBeLessThan(slow / 3)
    const { c } = timeTo(4, 'rewinding')
    let r = 0, f = c.update(0)
    while (f.phase === 'rewinding') { f = c.update(0.01); r += 0.01 }
    expect(Math.abs(r - REWIND_SECONDS)).toBeLessThan(0.05)
  })

  it('only accepts 1, 2 or 4 as speed', () => {
    const c = make()
    c.speed = 3
    expect(c.speed).toBe(1)
    c.speed = 4
    expect(c.speed).toBe(4)
  })

  it('ignores a Stop that lands right after Launch (double click)', () => {
    const c = make()
    c.launch()
    c.update(0.05)
    expect(c.stop()).toBe(false)
    expect(c.update(0).phase).toBe('running')
    c.update(0.4)
    expect(c.stop()).toBe(true)
  })

  it('a disposed controller fires no more hooks', () => {
    const onWin = vi.fn(), onEvent = vi.fn()
    const c = make({ S: 1 }, { onWin, onEvent })
    c.place(1, 'S')
    c.launch()
    c.dispose()
    runFor(c, 3)
    expect(onWin).not.toHaveBeenCalled()
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('blinks the cow that loops', () => {
    const c = new GameController(lvl(['+-+-+', '|. .|', '+-+-+'], { cows: [[0, 0, 'E']] }))
    c.launch()
    let f = c.update(0)
    while (f.phase === 'running') f = c.update(0.02)
    expect(f.phase).toBe('cause')
    expect(f.highlight).toBe(0)
  })
})
