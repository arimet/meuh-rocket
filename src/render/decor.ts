import type * as THREE from 'three'
import type { Theme } from '../levels'
import type { Level } from '../sim/types'
import { desertDecor } from './desert'
import { farmDecor } from './models'

const cache = new Map<string, THREE.Group>()

// The decor depends only on the world's theme and the board size: build it once per pair.
export function decorFor(level: Level, theme: Theme = 'farm'): THREE.Group {
  const key = `${theme}:${level.width}x${level.height}`
  let decor = cache.get(key)
  if (!decor) cache.set(key, (decor = theme === 'desert' ? desertDecor(level) : farmDecor(level)))
  return decor
}
