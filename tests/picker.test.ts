import { describe, expect, it } from 'vitest'
import { clampToViewport } from '../src/ui/picker'

describe('clampToViewport', () => {
  it('keeps picker inside viewport', () => {
    expect(clampToViewport(5, 5, 120, 800, 400, 8)).toEqual({ x: 68, y: 68 })
    expect(clampToViewport(795, 395, 120, 800, 400, 8)).toEqual({ x: 732, y: 332 })
  })
  it('leaves a central point unchanged', () => {
    expect(clampToViewport(400, 200, 120, 800, 400, 8)).toEqual({ x: 400, y: 200 })
  })
  it('centres when the viewport is smaller than the picker', () => {
    expect(clampToViewport(10, 10, 120, 100, 100, 8)).toEqual({ x: 50, y: 50 })
  })
})
