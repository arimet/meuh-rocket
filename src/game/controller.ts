import { TICK_HZ } from '../sim/constants'
import { DIRS } from '../sim/level'
import { canPlace, createState, run } from '../sim/sim'
import type { Arrows, Dir, Level, RunResult, SimEvent, SimState } from '../sim/types'

export type Phase = 'placing' | 'running' | 'cause' | 'rewinding' | 'won'

export interface Frame {
  from: SimState
  to: SimState
  alpha: number
  phase: Phase
  highlight: number | null // actor index to blink
  cause: SimEvent | null // set while showing a failure
  causeT: number // 0..1 progress through the cause phase
}

export interface ControllerHooks {
  onWin?(r: { excellent: boolean; arrowsUsed: number }): void
  onEvent?(e: SimEvent): void
  onPhase?(p: Phase): void
}

export const CAUSE_SECONDS = 0.8
export const ABDUCT_SECONDS = 1.8 // the abduction plays out as its own little scene
export const REWIND_SECONDS = 1.5

// Plays a precomputed run forward, then on failure shows the cause and rewinds it.
export class GameController {
  private placed = new Map<number, Dir>()
  private phase: Phase = 'placing'
  private result: RunResult | null = null
  private clock = 0
  private emitted = 0 // ticks whose events were emitted

  constructor(readonly level: Level, private hooks: ControllerHooks = {}) {}

  get arrows(): Arrows {
    return this.placed
  }

  remaining(dir: Dir): number {
    let used = 0
    for (const d of this.placed.values()) if (d === dir) used++
    return this.level.stock[dir] - used
  }

  place(cell: number, dir: Dir): boolean {
    if (this.phase !== 'placing' || !canPlace(this.level, this.placed, cell, dir)) return false
    this.placed.set(cell, dir)
    return true
  }

  remove(cell: number): boolean {
    return this.phase === 'placing' && this.placed.delete(cell)
  }

  clear(): void {
    if (this.phase === 'placing') this.placed.clear()
  }

  launch(): boolean {
    if (this.phase !== 'placing') return false
    this.result = run(this.level, this.placed)
    this.emitted = 0
    this.enter('running')
    return true
  }

  stop(): boolean {
    if (this.phase !== 'running') return false
    this.result = null
    this.enter('placing')
    return true
  }

  update(dt: number): Frame {
    this.clock += dt
    const r = this.result
    if (!r || this.phase === 'placing') {
      const s = createState(this.level, this.placed)
      return this.frame(s, s, 0)
    }
    const h = r.history
    const last = h.length - 1

    if (this.phase === 'running') {
      const pos = this.clock * TICK_HZ
      const idx = Math.min(Math.floor(pos), last)
      for (; this.emitted < idx; this.emitted++) {
        const tick = this.emitted + 1
        for (const e of r.events) if (e.tick === tick) this.hooks.onEvent?.(e)
      }
      if (idx < last) return this.frame(h[idx], h[idx + 1], pos - idx)
      if (r.outcome.result === 'won') {
        this.enter('won')
        const total = DIRS.reduce((n, d) => n + this.level.stock[d], 0)
        this.hooks.onWin?.({ excellent: this.placed.size < total, arrowsUsed: this.placed.size })
      } else this.enter('cause')
    }

    if (this.phase === 'cause' && this.clock >= this.causeSeconds()) this.enter('rewinding')

    if (this.phase === 'rewinding') {
      const p = this.clock / REWIND_SECONDS
      if (p >= 1) {
        this.result = null
        this.enter('placing')
        return this.update(0)
      }
      const f = (1 - p) * last
      const idx = Math.floor(f)
      return this.frame(h[idx], h[Math.min(idx + 1, last)], f - idx)
    }
    return this.frame(h[last], h[last], 0)
  }

  private causeSeconds() {
    const r = this.result
    return r?.outcome.result === 'failed' && r.outcome.cause.type === 'abducted' ? ABDUCT_SECONDS : CAUSE_SECONDS
  }

  private frame(from: SimState, to: SimState, alpha: number): Frame {
    const r = this.result
    const failure = this.phase === 'cause' && r?.outcome.result === 'failed' ? r.outcome.cause : null
    const highlight = failure && failure.type !== 'loop' ? failure.actor : null
    const causeT = failure ? Math.min(1, this.clock / this.causeSeconds()) : 0
    return { from, to, alpha, phase: this.phase, highlight, cause: failure, causeT }
  }

  private enter(p: Phase) {
    this.phase = p
    this.clock = 0
    this.hooks.onPhase?.(p)
  }
}
