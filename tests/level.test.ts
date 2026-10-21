import { describe, expect, it } from 'vitest'
import { blocked, parseLevel, reverse, turnLeft, turnRight } from '../src/sim/level'
import { lvl } from './helpers'

const corridor = ['+-+-+-+', '|. .|R|', '+-+-+-+']

describe('parseLevel', () => {
  it('parses cells and walls', () => {
    const l = lvl(corridor)
    expect(l.width).toBe(3)
    expect(l.height).toBe(1)
    expect(l.cells[2]).toBe('rocket')
    expect(l.cells[0]).toBe('empty')
    expect(blocked(l, 1, 0, 'E')).toBe(true)
    expect(blocked(l, 0, 0, 'E')).toBe(false)
    expect(blocked(l, 0, 0, 'N')).toBe(true)
    expect(blocked(l, 0, 0, 'W')).toBe(true)
    expect(blocked(l, 2, 0, 'E')).toBe(true)
    expect(blocked(l, 0, 0, 'S')).toBe(true)
  })

  it('reads internal horizontal walls', () => {
    const l = lvl(['+-+-+', '|. .|', '+-+ +', '|. .|', '+-+-+'])
    expect(blocked(l, 0, 0, 'S')).toBe(true)
    expect(blocked(l, 0, 1, 'N')).toBe(true)
    expect(blocked(l, 1, 0, 'S')).toBe(false)
  })

  it('parses holes', () => {
    expect(lvl(['+-+-+', '|. O|', '+-+-+']).cells[1]).toBe('hole')
  })

  it('parses spawns and stock', () => {
    const l = lvl(corridor, { cows: [[0, 0, 'E']], ufos: [[1, 0, 'W']], stock: { S: 2 } })
    expect(l.cows[0]).toEqual({ x: 0, y: 0, dir: 'E' })
    expect(l.ufos[0]).toEqual({ x: 1, y: 0, dir: 'W' })
    expect(l.stock).toEqual({ N: 0, E: 0, S: 2, W: 0 })
  })

  it('rejects missing border wall', () => {
    expect(() => lvl(['+-+-+-+', '|. .|R ', '+-+-+-+'])).toThrow(/bord/i)
    expect(() => lvl(['+-+ +-+', '|. .|R|', '+-+-+-+'])).toThrow(/bord/i)
  })

  it('rejects unknown cell char', () => {
    expect(() => lvl(['+-+-+', '|. X|', '+-+-+'])).toThrow(/X/)
  })

  it('rejects ragged grid', () => {
    expect(() => lvl(['+-+-+', '|. .|', '+-+-'])).toThrow()
  })

  it('rejects spawn outside grid or on hole/rocket', () => {
    expect(() => lvl(corridor, { cows: [[3, 0, 'E']] })).toThrow()
    expect(() => lvl(corridor, { cows: [[2, 0, 'E']] })).toThrow()
    expect(() => lvl(['+-+-+', '|. O|', '+-+-+'], { ufos: [[1, 0, 'E']] })).toThrow()
  })

  it('rejects bad direction or stock', () => {
    expect(() => lvl(corridor, { cows: [[0, 0, 'X' as never]] })).toThrow()
    expect(() => lvl(corridor, { stock: { N: -1 } })).toThrow()
  })

  it('rejects non-object input', () => {
    expect(() => parseLevel(null)).toThrow()
  })
})

describe('directions', () => {
  it('turns', () => {
    expect(turnRight('N')).toBe('E')
    expect(turnRight('W')).toBe('N')
    expect(turnLeft('N')).toBe('W')
    expect(turnLeft('E')).toBe('N')
    expect(reverse('E')).toBe('W')
    expect(reverse('N')).toBe('S')
  })
})

describe('stored solution', () => {
  it('parses an optional solution into arrows', () => {
    const l = parseLevel({ grid: ['+-+-+-+', '|. . R|', '+-+-+-+'], cows: [[0, 0, 'E']], stock: { S: 1 }, solution: [[1, 0, 'S']] })
    expect([...l.solution!]).toEqual([[1, 'S']])
  })
  it('is undefined when absent', () => {
    expect(parseLevel({ grid: ['+-+-+', '|. R|', '+-+-+'], cows: [[0, 0, 'E']] }).solution).toBeUndefined()
  })
  it('rejects a solution outside the grid', () => {
    expect(() => parseLevel({ grid: ['+-+-+', '|. R|', '+-+-+'], cows: [[0, 0, 'E']], solution: [[5, 0, 'S']] })).toThrow()
  })
})
