import { parseLevel } from '../sim/level'
import type { Level } from '../sim/types'

const files = import.meta.glob<{ default: unknown }>('./*.json', { eager: true })

export const LEVELS: Level[] = Object.keys(files).sort().map(k => parseLevel(files[k].default)).sort((a, b) => a.id - b.id)

export type Theme = 'farm' | 'desert' | 'ship'
export interface World { id: number; name: string; theme: Theme }

// Worlds 1 and 2 hold ten levels each (ids 1-20); world 3 holds every level from 21 on.
export const WORLDS: World[] = [
  { id: 1, name: 'La ferme', theme: 'farm' },
  { id: 2, name: 'Roswell, 1947', theme: 'desert' },
  { id: 3, name: 'Le vaisseau-mère', theme: 'ship' },
]

export const worldOf = (levelId: number): World => WORLDS[Math.min(WORLDS.length, Math.ceil(levelId / 10)) - 1]
