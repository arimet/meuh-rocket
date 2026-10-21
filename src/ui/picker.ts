import type { Dir } from '../sim/types'

export function clampToViewport(x: number, y: number, size: number, vw: number, vh: number, margin: number) {
  const half = size / 2 + margin
  const clamp = (v: number, max: number) => (max < 2 * half ? max / 2 : Math.min(Math.max(v, half), max - half))
  return { x: clamp(x, vw), y: clamp(y, vh) }
}

const GLYPH: Record<Dir, string> = { N: '↑', E: '→', S: '↓', W: '←' }
const LABEL: Record<Dir, string> = { N: 'Flèche vers le haut', E: 'Flèche vers la droite', S: 'Flèche vers le bas', W: 'Flèche vers la gauche' }
export const PICKER_SIZE = 156

// Four direction buttons around the tapped tile.
export function createPicker(root: HTMLElement, onPick: (dir: Dir) => void) {
  const el = document.createElement('div')
  el.className = 'picker'
  el.hidden = true
  const buttons = {} as Record<Dir, HTMLButtonElement>
  for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
    const b = document.createElement('button')
    b.className = `picker-${d}`
    b.setAttribute('aria-label', LABEL[d])
    b.innerHTML = `<span class="glyph">${GLYPH[d]}</span><span class="count"></span>`
    b.addEventListener('pointerdown', e => e.stopPropagation())
    b.addEventListener('click', e => { e.stopPropagation(); if (!b.disabled) onPick(d) })
    buttons[d] = b
    el.append(b)
  }
  el.addEventListener('pointerdown', e => e.stopPropagation())
  root.append(el)

  return {
    open(x: number, y: number, enabled: Record<Dir, number>) {
      const p = clampToViewport(x, y, PICKER_SIZE, innerWidth, innerHeight, 8)
      el.style.left = `${p.x}px`
      el.style.top = `${p.y}px`
      for (const d of Object.keys(buttons) as Dir[]) {
        buttons[d].disabled = enabled[d] <= 0
        buttons[d].querySelector('.count')!.textContent = String(Math.max(0, enabled[d]))
      }
      el.hidden = false
    },
    close() { el.hidden = true },
    get isOpen() { return !el.hidden },
  }
}
