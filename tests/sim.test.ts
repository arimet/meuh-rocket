import { describe, expect, it } from 'vitest'
import { canPlace, createState, run } from '../src/sim/sim'
import type { Arrows, Dir } from '../src/sim/types'
import { lvl } from './helpers'

const arrows = (entries: [number, Dir][] = []): Arrows => new Map(entries)

describe('run', () => {
  it('cow walks to rocket', () => {
    const l = lvl(['+-+-+-+-+', '|. . . R|', '+-+-+-+-+'], { cows: [[0, 0, 'E']] })
    const r = run(l, arrows())
    expect(r.outcome.result).toBe('won')
    expect(r.events.find(e => e.type === 'saved')?.tick).toBe(12)
  })

  it('wall turns right, then left, then back', () => {
    const left = lvl(['+-+-+', '|. .|', '+-+-+'], { cows: [[1, 0, 'N']] })
    expect(createState(left, arrows()).actors[0].dir).toBe('W')
    const back = lvl(['+-+', '|.|', '+ +', '|.|', '+-+'], { cows: [[0, 0, 'N']] })
    expect(createState(back, arrows()).actors[0].dir).toBe('S')
    const right = lvl(['+-+-+', '|. .|', '+ + +', '|. .|', '+-+-+'], { cows: [[0, 0, 'N']] })
    expect(createState(right, arrows()).actors[0].dir).toBe('E')
  })

  it('arrow redirects', () => {
    const l = lvl(['+-+-+', '|. .|', '+-+ +', '|. R|', '+-+-+'], { cows: [[0, 0, 'E']] })
    // without the arrow the cow turns right (S) on its own; force a real test with a wall
    const walled = lvl(['+-+-+-+', '|. . .|', '+-+ +-+', '|. R .|', '+-+-+-+'], { cows: [[0, 0, 'E']] })
    expect(run(walled, arrows()).outcome.result).toBe('failed')
    const r = run(walled, arrows([[1, 'S']]))
    expect(r.outcome.result).toBe('won')
    expect(r.arrowsHit.has(1)).toBe(true)
    expect(run(l, arrows()).outcome.result).toBe('won')
  })

  it('cow in hole fails', () => {
    const l = lvl(['+-+-+-+', '|. O R|', '+-+-+-+'], { cows: [[0, 0, 'E']] })
    const r = run(l, arrows())
    expect(r.outcome).toMatchObject({ result: 'failed', cause: { type: 'hole', actor: 0 } })
  })

  it('head-on abduction', () => {
    const l = lvl(['+-+-+-+-+-+-+', '|. . . . . .|', '+-+-+-+-+-+-+'], { cows: [[0, 0, 'E']], ufos: [[5, 0, 'W']] })
    const r = run(l, arrows())
    expect(r.outcome).toMatchObject({ result: 'failed', cause: { type: 'abducted', actor: 0, by: 1 } })
  })

  it('ufo in hole is not a failure', () => {
    const l = lvl(['+-+-+-+-+', '|. . . R|', '+-+-+-+-+', '|. . . .|', '+-+-+-+-+', '|. O . .|', '+-+-+-+-+'],
      { cows: [[0, 0, 'E']], ufos: [[0, 2, 'E']] })
    const r = run(l, arrows())
    expect(r.outcome.result).toBe('won')
    expect(r.events.some(e => e.type === 'ufoHole' && e.actor === 1)).toBe(true)
  })

  it('ufo in rocket fails', () => {
    const l = lvl(['+-+-+-+-+', '|. . . .|', '+-+-+-+-+', '|. . R .|', '+-+-+-+-+'],
      { cows: [[0, 0, 'E']], ufos: [[0, 1, 'E']] })
    expect(run(l, arrows()).outcome).toMatchObject({ result: 'failed', cause: { type: 'ufoInRocket', actor: 1 } })
  })

  it('failure beats win on the same tick', () => {
    const l = lvl(['+-+-+-+-+', '|. . . R|', '+-+-+-+-+', '|. . . .|', '+-+-+-+-+', '|. . R .|', '+-+-+-+-+'],
      { cows: [[0, 0, 'E']], ufos: [[0, 2, 'E']] })
    const r = run(l, arrows())
    expect(r.outcome).toMatchObject({ result: 'failed', cause: { type: 'ufoInRocket', tick: 12 } })
    expect(r.events.some(e => e.type === 'saved' && e.tick === 12)).toBe(true)
  })

  it('two cows on rocket same tick both saved', () => {
    const l = lvl(['+-+-+-+-+-+', '|. . R . .|', '+-+-+-+-+-+'], { cows: [[0, 0, 'E'], [4, 0, 'W']] })
    const r = run(l, arrows())
    expect(r.outcome.result).toBe('won')
    const saved = r.events.filter(e => e.type === 'saved')
    expect(saved.map(e => e.tick)).toEqual([8, 8])
  })

  it('loop detected', () => {
    const l = lvl(['+-+-+', '|. .|', '+-+-+'], { cows: [[0, 0, 'E']] })
    expect(run(l, arrows()).outcome).toMatchObject({ result: 'failed', cause: { type: 'loop' } })
  })

  it('history starts at the initial state and records visited cells', () => {
    const l = lvl(['+-+-+-+-+', '|. . . R|', '+-+-+-+-+'], { cows: [[0, 0, 'E']] })
    const r = run(l, arrows())
    expect(r.history[0].tick).toBe(0)
    expect(r.history.at(-1)!.tick).toBe(12)
    expect([...r.visited].sort()).toEqual([1, 2, 3])
  })

  it('deterministic', () => {
    const l = lvl(['+-+-+-+-+-+-+', '|. . . . . .|', '+-+-+-+-+-+-+'], { cows: [[0, 0, 'E']], ufos: [[5, 0, 'W']] })
    expect(JSON.stringify(run(l, arrows()).history)).toBe(JSON.stringify(run(l, arrows()).history))
  })
})

describe('canPlace', () => {
  const l = lvl(['+-+-+-+-+', '|. . O R|', '+-+-+-+-+'], { cows: [[0, 0, 'E']], stock: { S: 1 } })
  it('accepts an empty cell with stock', () => expect(canPlace(l, arrows(), 1, 'S')).toBe(true))
  it('refuses hole, rocket, start', () => {
    expect(canPlace(l, arrows(), 2, 'S')).toBe(false)
    expect(canPlace(l, arrows(), 3, 'S')).toBe(false)
    expect(canPlace(l, arrows(), 0, 'S')).toBe(false)
  })
  it('refuses an arrowed cell or empty stock', () => {
    expect(canPlace(l, arrows([[1, 'S']]), 1, 'S')).toBe(false)
    expect(canPlace(l, arrows(), 1, 'N')).toBe(false)
  })
  it('refuses when stock is used up', () => {
    const two = lvl(['+-+-+-+-+', '|. . . R|', '+-+-+-+-+'], { stock: { S: 1 } })
    expect(canPlace(two, arrows([[1, 'S']]), 2, 'S')).toBe(false)
  })
  it('refuses out of range cells', () => expect(canPlace(l, arrows(), 9, 'S')).toBe(false))
})
