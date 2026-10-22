import { parseLevel } from '../sim/level'
import type { Level } from '../sim/types'

const files = import.meta.glob<{ default: unknown }>('./*.json', { eager: true })

export const LEVELS: Level[] = Object.keys(files).sort().map(k => parseLevel(files[k].default)).sort((a, b) => a.id - b.id)

export type Theme = 'farm' | 'desert'
export interface World { id: number; name: string; theme: Theme }

// Ten levels per world: ids 1-10 are world 1, 11-20 world 2.
export const WORLDS: World[] = [
  { id: 1, name: 'La ferme', theme: 'farm' },
  { id: 2, name: 'Roswell, 1947', theme: 'desert' },
]

export const worldOf = (levelId: number): World => WORLDS[Math.min(WORLDS.length, Math.ceil(levelId / 10)) - 1]
