export interface Progress {
  unlocked: number // highest playable level id
  completed: number[]
}

export const STORAGE_KEY = 'meuh-rocket:progress'

const fresh = (): Progress => ({ unlocked: 1, completed: [] })
const isId = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1

const browserStorage = (): Storage | null => {
  try { return globalThis.localStorage ?? null } catch { return null }
}

// Never throws: private browsing, quota errors and corrupt data all fall back to a fresh start.
export function loadProgress(storage: Pick<Storage, 'getItem'> | null = browserStorage()): Progress {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return fresh()
    const data = JSON.parse(raw)
    if (typeof data !== 'object' || data === null || !isId(data.unlocked)) return fresh()
    if (data.completed !== undefined && !Array.isArray(data.completed)) return fresh()
    return { unlocked: data.unlocked, completed: [...new Set<number>((data.completed ?? []).filter(isId))] }
  } catch {
    return fresh()
  }
}

export function saveProgress(p: Progress, storage: Pick<Storage, 'setItem'> | null = browserStorage()): void {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(p)) } catch { /* progress just won't persist */ }
}

export function completeLevel(p: Progress, id: number, total: number): Progress {
  return {
    unlocked: Math.max(p.unlocked, Math.min(id + 1, total)),
    completed: p.completed.includes(id) ? p.completed : [...p.completed, id],
  }
}
