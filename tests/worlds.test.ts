import { describe, expect, it } from 'vitest'
import { WORLDS, worldOf } from '../src/levels'

describe('worlds', () => {
  it('maps level ids to worlds of ten', () => {
    expect(worldOf(1).id).toBe(1)
    expect(worldOf(10).id).toBe(1)
    expect(worldOf(11).id).toBe(2)
    expect(worldOf(20).id).toBe(2)
    expect(worldOf(21).id).toBe(3)
    expect(worldOf(40).id).toBe(3)
  })
  it('names each world and gives it a theme', () => {
    expect(WORLDS.map(w => w.theme)).toEqual(['farm', 'desert', 'ship'])
    expect(WORLDS[1].name).toBe('Roswell, 1947')
  })
})
