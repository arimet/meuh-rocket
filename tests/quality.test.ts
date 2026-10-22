import { describe, expect, it } from 'vitest'
import { qualityFor } from '../src/render/quality'

describe('qualityFor', () => {
  it('keeps full effects on a desktop', () => expect(qualityFor({ coarse: false, dpr: 2, width: 1440 })).toBe('high'))
  it('drops to low on touch devices', () => expect(qualityFor({ coarse: true, dpr: 3, width: 844 })).toBe('low'))
  it('drops to low on small dense screens', () => expect(qualityFor({ coarse: false, dpr: 3, width: 900 })).toBe('low'))
  it('can be forced from the URL', () => {
    expect(qualityFor({ coarse: true, dpr: 3, width: 844, forced: 'high' })).toBe('high')
    expect(qualityFor({ coarse: false, dpr: 1, width: 1920, forced: 'low' })).toBe('low')
  })
})
