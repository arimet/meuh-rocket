import { describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, completeLevel, loadProgress, saveProgress, starsFor } from '../src/ui/progress'

const DEFAULT = { unlocked: 1, completed: [], stars: {} }
const store = (value: string | null) => ({ getItem: vi.fn(() => value) })

describe('progress', () => {
  it('defaults when storage throws', () => {
    expect(loadProgress({ getItem: () => { throw new Error('denied') } })).toEqual(DEFAULT)
  })

  it('defaults without storage', () => {
    expect(loadProgress(null)).toEqual(DEFAULT)
  })

  it('defaults on corrupt or absurd data', () => {
    for (const raw of ['{', 'null', '42', '{"unlocked":-4}', '{"unlocked":"x"}', '{"unlocked":2,"completed":"x"}', '{"unlocked":2.5}'])
      expect(loadProgress(store(raw))).toEqual(DEFAULT)
  })

  it('loads saved progress and drops bad ids', () => {
    expect(loadProgress(store('{"unlocked":4,"completed":[1,2,"x",-1,3]}'))).toEqual({ unlocked: 4, completed: [1, 2, 3], stars: {} })
    expect(loadProgress(store('{"unlocked":4,"completed":[1],"stars":{"1":3,"2":9,"x":1,"3":-1,"4":2.5}}')).stars).toEqual({ 1: 3 })
  })

  it('round-trips through storage', () => {
    const data = new Map<string, string>()
    const s = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    saveProgress({ unlocked: 3, completed: [1, 2], stars: { 1: 3, 2: 1 } }, s)
    expect(data.has(STORAGE_KEY)).toBe(true)
    expect(loadProgress(s)).toEqual({ unlocked: 3, completed: [1, 2], stars: { 1: 3, 2: 1 } })
  })

  it('save never throws', () => {
    expect(() => saveProgress(DEFAULT, { setItem: () => { throw new Error('quota') } })).not.toThrow()
    expect(() => saveProgress(DEFAULT, null)).not.toThrow()
  })

  it('completeLevel unlocks next but not past total', () => {
    expect(completeLevel({ unlocked: 10, completed: [], stars: {} }, 10, 10, 3).unlocked).toBe(10)
    expect(completeLevel({ unlocked: 3, completed: [1, 2], stars: {} }, 3, 10, 2)).toEqual({ unlocked: 4, completed: [1, 2, 3], stars: { 3: 2 } })
    expect(completeLevel({ unlocked: 4, completed: [1, 2, 3], stars: {} }, 2, 10, 1).completed).toEqual([1, 2, 3])
  })

  it('keeps the best stars, and a revealed solution earns none', () => {
    const p = completeLevel({ unlocked: 2, completed: [1], stars: { 1: 2 } }, 1, 10, 0)
    expect(p.stars[1]).toBe(2)
    expect(completeLevel(p, 1, 10, 3).stars[1]).toBe(3)
    expect(completeLevel({ unlocked: 2, completed: [], stars: {} }, 2, 10, 0)).toEqual({ unlocked: 3, completed: [2], stars: { 2: 0 } })
  })

  it('starsFor rewards few launches', () => {
    expect(starsFor(1, false)).toBe(3)
    expect(starsFor(2, false)).toBe(2)
    expect(starsFor(3, false)).toBe(2)
    expect(starsFor(4, false)).toBe(1)
    expect(starsFor(1, true)).toBe(0)
  })
})
