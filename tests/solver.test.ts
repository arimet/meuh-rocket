import { describe, expect, it } from 'vitest'
import { solve } from '../src/sim/solver'
import { lvl } from './helpers'

// Without arrows the cow walks the top row, turns right at (2,0) and falls in the hole.
const reference = ['+-+-+-+', '|. . .|', '+ + + +', '|R . O|', '+-+-+-+']

describe('solve', () => {
  it('no arrow needed', () => {
    const r = solve(lvl(['+-+-+-+-+', '|. . . R|', '+-+-+-+-+'], { cows: [[0, 0, 'E']] }))
    expect(r.solvable).toBe(true)
    expect(r.minArrows).toBe(0)
  })

  it('one arrow needed', () => {
    const r = solve(lvl(reference, { cows: [[0, 0, 'E']], stock: { S: 1 } }))
    expect(r.minArrows).toBe(1)
    expect(r.solutions).toBe(1)
    expect([...r.example!]).toEqual([[1, 'S']])
  })

  it('respects stock', () => {
    const r = solve(lvl(reference, { cows: [[0, 0, 'E']] }))
    expect(r.solvable).toBe(false)
    expect(r.minArrows).toBeNull()
    expect(r.example).toBeNull()
    expect(r.explored).toBe(1)
  })

  it('counts distinct solutions', () => {
    // (1,0)S, (1,0)W, (2,0)W, and (1,0)S + (1,1)W (the W arrow is hit even though it matches the wall rule)
    const r = solve(lvl(reference, { cows: [[0, 0, 'E']], stock: { S: 1, W: 1 } }))
    expect(r.solutions).toBe(4)
    expect(r.minArrows).toBe(1)
  })
})
