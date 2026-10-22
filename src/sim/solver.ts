import { DIRS } from './level'
import { canPlace, run } from './sim'
import type { Arrows, Dir, Level } from './types'

export interface SolveReport {
  solvable: boolean
  minArrows: number | null
  solutions: number // distinct winning placements where every arrow is hit
  explored: number // distinct placements simulated
  example: Arrows | null // one minimal solution
}

const keyOf = (p: Arrows) => [...p].sort((a, b) => a[0] - b[0]).map(([c, d]) => `${c}${d}`).join(',')

// Only cells visited by the current run can hold the next useful arrow: the run
// with and without that arrow is identical until someone reaches its cell.
// And when the run fails at tick t, that arrow must be reached before t, or the same failure
// happens again (a looping cow has already gone round its whole cycle by then).
export function solve(level: Level): SolveReport {
  const seen = new Set<string>()
  let solutions = 0
  let example: Arrows | null = null

  const explore = (p: Map<number, Dir>) => {
    const key = keyOf(p)
    if (seen.has(key)) return
    seen.add(key)
    const r = run(level, p)
    if (r.outcome.result === 'won' && [...p.keys()].every(c => r.arrowsHit.has(c))) {
      solutions++
      if (!example || p.size < example.size) example = new Map(p)
    }
    const failedAt = r.outcome.result === 'failed' ? r.outcome.cause.tick : Infinity
    for (const [cell, tick] of r.firstVisit) {
      if (tick >= failedAt) continue
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
  return { solvable: best !== null, minArrows: best?.size ?? null, solutions, explored: seen.size, example: best }
}
