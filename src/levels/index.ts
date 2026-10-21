import { parseLevel } from '../sim/level'
import type { Level } from '../sim/types'

const files = import.meta.glob<{ default: unknown }>('./*.json', { eager: true })

export const LEVELS: Level[] = Object.keys(files).sort().map(k => parseLevel(files[k].default)).sort((a, b) => a.id - b.id)
