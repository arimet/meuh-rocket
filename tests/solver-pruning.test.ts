import { describe, expect, it } from 'vitest'
import { DIRS, parseLevel } from '../src/sim/level'
import { canPlace, run } from '../src/sim/sim'
import { solve } from '../src/sim/solver'
import type { Dir, Level } from '../src/sim/types'

// The unpruned search the solver started from: any visited cell may take the next arrow.
function reference(level: Level) {
  const seen = new Set<string>()
  let solutions = 0, min = Infinity
  const key = (p: Map<number, Dir>) => [...p].sort((a, b) => a[0] - b[0]).map(([c, d]) => `${c}${d}`).join(',')
  const explore = (p: Map<number, Dir>) => {
    const k = key(p); if (seen.has(k)) return; seen.add(k)
    const r = run(level, p)
    if (r.outcome.result === 'won' && [...p.keys()].every(c => r.arrowsHit.has(c))) { solutions++; min = Math.min(min, p.size) }
    for (const c of r.visited) for (const d of DIRS) if (canPlace(level, p, c, d)) { p.set(c, d); explore(p); p.delete(c) }
  }
  explore(new Map())
  return { solutions, min: min === Infinity ? null : min }
}

// Small random boards with every element of the game.
function randomLevel(seed: number): Level | null {
  let s = seed
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const W = 6, H = 5, ri = (n: number) => Math.floor(rnd() * n)
  const cells = Array.from({ length: H }, () => Array(W).fill('.'))
  const used = new Set<string>()
  const free = () => { for (;;) { const x = ri(W), y = ri(H); if (!used.has(`${x},${y}`)) { used.add(`${x},${y}`); return [x, y] } } }
  const [rx, ry] = free(); cells[ry][rx] = 'R'
  for (let k = ri(3); k > 0; k--) { const [x, y] = free(); cells[y][x] = 'O' }
  if (rnd() < 0.5) for (let k = 0; k < 2; k++) { const [x, y] = free(); cells[y][x] = '1' }
  const g = Array.from({ length: 2 * H + 1 }, (_, yy) => Array.from({ length: 2 * W + 1 }, (_, xx) =>
    yy % 2 === 0 && xx % 2 === 0 ? '+' : yy % 2 === 1 && xx % 2 === 1 ? cells[(yy - 1) / 2][(xx - 1) / 2] : ' '))
  for (let x = 0; x < W; x++) { g[0][2 * x + 1] = '-'; g[2 * H][2 * x + 1] = '-' }
  for (let y = 0; y < H; y++) { g[2 * y + 1][0] = '|'; g[2 * y + 1][2 * W] = '|' }
  for (let k = ri(4); k > 0; k--) { if (rnd() < 0.5) g[2 * (1 + ri(H - 1))][2 * ri(W) + 1] = '-'; else g[2 * ri(H) + 1][2 * (1 + ri(W - 1))] = '|' }
  const cows = Array.from({ length: 1 + ri(3) }, () => [...free(), DIRS[ri(4)]])
  const ufos = Array.from({ length: ri(2) }, () => [...free(), DIRS[ri(4)]])
  const stock: Record<Dir, number> = { N: 0, E: 0, S: 0, W: 0 }
  for (let k = 1 + ri(3); k > 0; k--) stock[DIRS[ri(4)]]++
  try { return parseLevel({ grid: g.map(r => r.join('')), cows, ufos, stock }) } catch { return null }
}

describe('solver pruning', () => {
  it('finds exactly the same solutions as the unpruned search', () => {
    let checked = 0, solvable = 0
    for (let seed = 1; checked < 150; seed++) {
      const level = randomLevel(seed)
      if (!level) continue
      checked++
      const ref = reference(level), got = solve(level)
      expect([got.solutions, got.minArrows], `seed ${seed}`).toEqual([ref.solutions, ref.min])
      if (ref.min !== null) solvable++
    }
    expect(solvable).toBeGreaterThan(20) // the sample really exercises winning boards
  }, 120_000)

  it('explores fewer placements when runs fail early', () => {
    let pruned = 0, full = 0
    for (let seed = 1; seed < 60; seed++) {
      const level = randomLevel(seed)
      if (!level) continue
      pruned += solve(level).explored
      const seen = new Set<string>()
      const explore = (p: Map<number, Dir>) => {
        const k = [...p].sort((a, b) => a[0] - b[0]).map(([c, d]) => `${c}${d}`).join(','); if (seen.has(k)) return; seen.add(k)
        for (const c of run(level, p).visited) for (const d of DIRS) if (canPlace(level, p, c, d)) { p.set(c, d); explore(p); p.delete(c) }
      }
      explore(new Map())
      full += seen.size
    }
    expect(pruned).toBeLessThan(full)
  }, 120_000)

  it('keeps the cow saved on the very tick a ufo reaches another rocket', () => {
    // bare run: the cow boards at (0,1) on the tick the ufo enters (5,6); a shorter cow route wins
    const level = parseLevel({
      grid: ['+-+-+-+-+-+-+', '|. . . . .|.|', '+ + + + + + +', '|R . . . .|.|', '+-+-+-+-+-+ +',
        ...Array(4).fill(['|. . . . .|.|', '+ + + + + + +']).flat(), '|. . . . .|R|', '+-+-+-+-+-+-+'],
      cows: [[0, 0, 'E']], ufos: [[5, 0, 'S']], stock: { N: 0, E: 0, S: 1, W: 0 },
    })
    expect(run(level, new Map()).outcome).toMatchObject({ result: 'failed', cause: { type: 'ufoInRocket' } })
    expect(solve(level)).toMatchObject({ solvable: true, solutions: reference(level).solutions })
  })
})
