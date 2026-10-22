import { describe, expect, it } from 'vitest'
import { detectLang } from '../src/ui/i18n'

describe('detectLang', () => {
  it('keeps a saved choice', () => {
    expect(detectLang('en', ['fr-FR'])).toBe('en')
    expect(detectLang('fr', ['en-US'])).toBe('fr')
  })
  it('follows the browser, English unless French is listed', () => {
    expect(detectLang(null, ['fr-CA', 'en'])).toBe('fr')
    expect(detectLang(null, ['de-DE', 'FR'])).toBe('fr')
    expect(detectLang(null, ['es-ES'])).toBe('en')
    expect(detectLang('xx', [])).toBe('en')
  })
})
