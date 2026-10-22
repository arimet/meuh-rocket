import type { Dir } from '../sim/types'
import { t } from './i18n'
import { icon } from './icons'

export function clampToViewport(x: number, y: number, size: number, vw: number, vh: number, margin: number) {
  const half = size / 2 + margin
  const clamp = (v: number, max: number) => (max < 2 * half ? max / 2 : Math.min(Math.max(v, half), max - half))
  return { x: clamp(x, vw), y: clamp(y, vh) }
}

export const PICKER_SIZE = 156

// Four direction buttons around the tapped tile.
export function createPicker(root: HTMLElement, onPick: (dir: Dir) => void) {
  const el = document.createElement('div')
  el.className = 'picker'
  el.hidden = true
  const buttons = {} as Record<Dir, HTMLButtonElement>
  for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
    const b = document.createElement('button')
    b.className = `block picker-${d}`
    b.innerHTML = `${icon('arrow', `dir-${d}`)}<span class="count"></span>`
    b.addEventListener('pointerdown', e => e.stopPropagation())
    b.addEventListener('click', e => { e.stopPropagation(); if (!b.disabled) onPick(d) })
    buttons[d] = b
    el.append(b)
  }
  el.addEventListener('pointerdown', e => e.stopPropagation())
  root.append(el)

  let hideTimer = 0
  return {
    // (x, y) is the tile centre; the picker may be pushed inward, but its blocks still fly out from the tile.
    open(x: number, y: number, enabled: Record<Dir, number>) {
      const p = clampToViewport(x, y, PICKER_SIZE, innerWidth, innerHeight, 8)
      clearTimeout(hideTimer)
      el.style.left = `${p.x}px`
      el.style.top = `${p.y}px`
      el.style.setProperty('--ox', `${x - p.x}px`)
      el.style.setProperty('--oy', `${y - p.y}px`)
      for (const d of Object.keys(buttons) as Dir[]) {
        buttons[d].setAttribute('aria-label', t().arrow(d))
        buttons[d].disabled = enabled[d] <= 0
        buttons[d].querySelector('.count')!.textContent = String(Math.max(0, enabled[d]))
      }
      el.hidden = false
      el.classList.remove('closing')
      el.classList.remove('opening')
      void el.offsetWidth
      el.classList.add('opening')
      ;(Object.values(buttons).find(b => !b.disabled))?.focus({ preventScroll: true })
    },
    close() {
      if (el.hidden || el.classList.contains('closing')) return
      el.classList.add('closing')
      hideTimer = window.setTimeout(() => { el.hidden = true; el.classList.remove('closing') }, 120)
    },
    get isOpen() { return !el.hidden && !el.classList.contains('closing') },
  }
}
