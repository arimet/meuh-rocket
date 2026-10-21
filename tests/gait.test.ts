import { describe, expect, it } from 'vitest'
import { HIP_HEIGHT, STRIDE, gait } from '../src/render/gait'

describe('gait', () => {
  it('moves diagonal leg pairs together and opposite to the other pair', () => {
    for (const d of [0.03, 0.11, 0.2, 0.37]) {
      const { legs } = gait(d)
      expect(legs[0]).toBeCloseTo(legs[3]) // front-left with back-right
      expect(legs[1]).toBeCloseTo(legs[2]) // front-right with back-left
      expect(legs[0]).toBeCloseTo(-legs[1])
    }
  })

  it('repeats every stride', () => {
    expect(gait(0.13).legs[0]).toBeCloseTo(gait(0.13 + STRIDE).legs[0])
  })

  it('plants the feet: a foot sweeps back exactly as far as the body moves forward', () => {
    // during stance the leg swings from +a to -a; the foot travels 2·L·sin(a) relative to the hip,
    // and the body covers half a stride in that time
    const swing = (d: number) => HIP_HEIGHT * Math.sin(gait(d).legs[0])
    const top = STRIDE / 4, bottom = (3 * STRIDE) / 4
    expect(swing(top) - swing(bottom)).toBeCloseTo(STRIDE / 2, 2)
  })

  it('bobs the body twice per stride, never below rest', () => {
    const bobs = Array.from({ length: 40 }, (_, k) => gait((k / 40) * STRIDE).bob)
    expect(Math.min(...bobs)).toBeGreaterThanOrEqual(0)
    expect(gait(0).bob).toBeCloseTo(gait(STRIDE / 2).bob)
  })
})
