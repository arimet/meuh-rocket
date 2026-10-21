import { describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, completeLevel, loadProgress, saveProgress } from '../src/ui/progress'

const DEFAULT = { unlocked: 1, completed: [] }
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
    expect(loadProgress(store('{"unlocked":4,"completed":[1,2,"x",-1,3]}'))).toEqual({ unlocked: 4, completed: [1, 2, 3] })
  })

  it('round-trips through storage', () => {
    const data = new Map<string, string>()
    const s = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    saveProgress({ unlocked: 3, completed: [1, 2] }, s)
    expect(data.has(STORAGE_KEY)).toBe(true)
    expect(loadProgress(s)).toEqual({ unlocked: 3, completed: [1, 2] })
  })

  it('save never throws', () => {
    expect(() => saveProgress(DEFAULT, { setItem: () => { throw new Error('quota') } })).not.toThrow()
    expect(() => saveProgress(DEFAULT, null)).not.toThrow()
  })

  it('completeLevel unlocks next but not past total', () => {
    expect(completeLevel({ unlocked: 10, completed: [] }, 10, 10).unlocked).toBe(10)
    expect(completeLevel({ unlocked: 3, completed: [1, 2] }, 3, 10)).toEqual({ unlocked: 4, completed: [1, 2, 3] })
    expect(completeLevel({ unlocked: 4, completed: [1, 2, 3] }, 2, 10)).toEqual({ unlocked: 4, completed: [1, 2, 3] })
  })
})
