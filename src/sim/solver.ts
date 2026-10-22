import { DIRS } from './level'
import { canPlace, run } from './sim'
import type { Arrows, Dir, Level, SimEvent, SimState } from './types'

export interface SolveReport {
  solvable: boolean
  minArrows: number | null
  solutions: number // distinct winning placements where every arrow is hit
  explored: number // distinct placements simulated
  example: Arrows | null // one minimal solution
  complete: boolean // false when the search stopped at its budget: the figures are then lower bounds
}

// The actors whose own paths decide a failure. A winning placement either avoids the failure
// (one of these actors moves differently before it) or wins before it happens, which needs every
// cow still on its way to move differently — the first of them is enough to name.
// `before` is the state one tick before the failure: a cow saved on the failure tick itself still counts.
function culprits(cause: SimEvent, before: SimState): number[] | null {
  if (cause.actor < 0) return null // the whole board cycles: anyone may need to change
  const who = cause.type === 'abducted' ? [cause.actor, cause.by!] : [cause.actor]
  const waiting = before.actors.findIndex(a => a.kind === 'cow' && a.status === 'active')
  if (waiting >= 0 && !who.includes(waiting)) who.push(waiting)
  return who
}

const keyOf = (p: Arrows) => [...p].sort((a, b) => a[0] - b[0]).map(([c, d]) => `${c}${d}`).join(',')

// Only cells visited by the current run can hold the next useful arrow: the run
// with and without that arrow is identical until someone reaches its cell.
// And when the run fails at tick t, that arrow must be reached before t by one of the actors the
// failure involves (each actor moves only by its own state and the arrows), or the same failure
// happens again. A looping cow has already gone round its whole cycle by then.
export function solve(level: Level, budget = Infinity): SolveReport {
  const seen = new Set<string>()
  let complete = true
  let solutions = 0
  let example: Arrows | null = null

  const explore = (p: Map<number, Dir>) => {
    const key = keyOf(p)
    if (seen.has(key) || !complete) return
    if (seen.size >= budget) { complete = false; return }
    seen.add(key)
    const r = run(level, p)
    if (r.outcome.result === 'won' && [...p.keys()].every(c => r.arrowsHit.has(c))) {
      solutions++
      if (!example || p.size < example.size) example = new Map(p)
    }
    const failed = r.outcome.result === 'failed' ? r.outcome.cause : null
    const who = failed && culprits(failed, r.history[Math.max(0, r.history.length - 2)])
    const candidates = new Map<number, number>()
    for (const visits of who ? who.map(i => r.firstVisitBy[i]) : [r.firstVisit])
      for (const [cell, tick] of visits) if (!failed || tick < failed.tick) candidates.set(cell, tick)
    for (const cell of candidates.keys()) {
      for (const dir of DIRS) {
        if (!canPlace(level, p, cell, dir)) continue
        p.set(cell, dir)
        explore(p)
        p.delete(cell)
      }
    }
  }

  explore(new Map())
  const best = example as Arrows | null
  return { solvable: best !== null, minArrows: best?.size ?? null, solutions, explored: seen.size, example: best, complete }
}
