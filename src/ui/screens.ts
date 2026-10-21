import type { Dir, Level } from '../sim/types'
import { icon } from './icons'
import type { Progress } from './progress'

export interface ScreenHandlers {
  onPlay(): void
  onSelect(id: number): void
  onLaunch(): void
  onClear(): void
  onMenu(): void
  onNext(): void
}

const DIR_LABEL: Record<Dir, string> = { N: 'haut', E: 'droite', S: 'bas', W: 'gauche' }

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text) el.textContent = text
  return el
}
const button = (label: string, cls: string, onClick: () => void, ico = '') => {
  const b = h('button', `block ${cls}`)
  b.innerHTML = ico
  b.append(h('span', 'label', label))
  b.addEventListener('click', onClick)
  return b
}
// A sign hanging from two ropes, with its own drop shadow (clip-path would cut it).
const hanging = (cls: string, ...children: HTMLElement[]) => {
  const wrap = h('div', 'sign-wrap')
  const sign = h('div', `sign ${cls}`)
  sign.append(...children)
  wrap.append(h('span', 'hanging-ropes'), sign)
  return wrap
}
const actions = (...children: HTMLElement[]) => {
  const el = h('div', 'actions')
  el.append(...children)
  return el
}

// Re-trigger a CSS animation class on an element.
const replay = (el: HTMLElement, cls: string) => {
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
}

// DOM screens layered over the 3D canvas, dressed as farm signs and wooden blocks.
export function createScreens(root: HTMLElement, on: ScreenHandlers) {
  const title = h('section', 'screen title')
  const note = h('p', 'paper', 'Guide les vaches jusqu’à la fusée avant que les ovnis ne les enlèvent.')
  title.append(hanging('big', h('h1', 'logo', 'Meuh Rocket!')), note, actions(button('Jouer', 'red big', on.onPlay, icon('play'))))

  const select = h('section', 'screen select')
  const grid = h('div', 'crates')
  select.append(hanging('', h('h2', '', 'Monde 1 · La ferme')), grid)

  const hud = h('section', 'hud')
  const top = h('header', 'hud-top')
  const plate = h('div', 'plate')
  const plateNum = h('span', 'plate-num')
  const plateName = h('span', 'plate-name')
  plate.append(plateNum, plateName)
  const idea = h('p', 'paper idea')
  const info = h('div', 'hud-info')
  info.append(plate, idea)
  const stock = h('div', 'stock')
  stock.setAttribute('aria-label', 'Flèches restantes')
  const chips = {} as Record<Dir, { el: HTMLElement; count: HTMLElement; value: number }>
  for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
    const el = h('span', 'tag')
    el.innerHTML = icon('arrow', `dir-${d}`)
    const count = h('b', 'tag-count')
    el.append(count)
    stock.append(el)
    chips[d] = { el, count, value: -1 }
  }
  const extra = h('div', 'hud-extra')
  top.append(info, stock, extra)
  const bar = h('footer', 'hud-bar')
  const launch = button('Lancer', 'red launch', on.onLaunch, icon('play'))
  const clear = button('Retirer les flèches', 'small', on.onClear, icon('clear'))
  bar.append(button('Menu', 'small', on.onMenu, icon('menu')), clear, launch)
  hud.append(top, bar)

  const victory = h('section', 'screen victory')
  const vStars = h('div', 'stars')
  const vTitle = h('h2', 'logo')
  const vText = h('p', 'paper')
  const vNext = button('Niveau suivant', 'red big', on.onNext, icon('play'))
  victory.append(hanging('big', vStars, vTitle), vText, actions(button('Menu', '', on.onMenu, icon('menu')), vNext))

  const portrait = h('div', 'portrait paper', 'Tourne ton téléphone pour jouer')
  root.append(title, select, hud, victory, portrait)
  const all = [title, select, hud, victory]
  const only = (el: HTMLElement) => all.forEach(s => s.classList.toggle('on', s === el))

  return {
    hudExtra: extra,
    showTitle: () => only(title),
    showSelect(levels: Level[], progress: Progress) {
      grid.replaceChildren(...levels.map((l, i) => {
        const locked = l.id > progress.unlocked
        const done = progress.completed.includes(l.id)
        const next = !locked && !done
        const b = h('button', `crate${locked ? ' locked' : ''}${done ? ' done' : ''}${next ? ' next' : ''}`)
        b.style.setProperty('--i', String(i))
        b.disabled = locked
        b.innerHTML = locked ? icon('lock', 'crate-lock') : `<span class="crate-num">${l.id}</span>`
        if (!locked) b.append(h('span', 'crate-name', l.name))
        if (done) b.insertAdjacentHTML('beforeend', `<span class="crate-star">${icon('star')}</span>`)
        b.setAttribute('aria-label', `Niveau ${l.id} : ${locked ? 'verrouillé' : l.name}${done ? ', réussi' : ''}`)
        b.addEventListener('click', () => { if (!locked) on.onSelect(l.id) })
        return b
      }))
      only(select)
    },
    showHud(level: Level) {
      plateNum.textContent = `Niveau ${level.id}`
      plateName.textContent = level.name
      idea.textContent = level.idea
      for (const c of Object.values(chips)) c.value = -1
      only(hud)
    },
    updateHud(s: { remaining: Record<Dir, number>; running: boolean; busy: boolean }) {
      for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
        const c = chips[d], n = s.remaining[d]
        if (c.value === n) continue
        if (c.value >= 0) replay(c.el, 'bump')
        c.value = n
        c.count.textContent = String(n)
        c.el.classList.toggle('empty', n === 0)
        c.el.setAttribute('aria-label', `${n} flèche${n > 1 ? 's' : ''} vers le ${DIR_LABEL[d]}`)
      }
      launch.innerHTML = icon(s.running ? 'stop' : 'play')
      launch.append(h('span', 'label', s.running ? 'Stop' : 'Lancer'))
      launch.classList.toggle('running', s.running)
      launch.disabled = s.busy && !s.running
      clear.disabled = s.busy
    },
    showVictory(r: { excellent: boolean; hasNext: boolean }) {
      vStars.innerHTML = icon('star') + icon('star') + (r.excellent ? icon('star') : '')
      vTitle.textContent = r.excellent ? 'Excellent !' : 'Bravo !'
      vText.textContent = r.hasNext
        ? r.excellent ? 'Toutes les vaches sont à bord, avec moins de flèches que prévu.' : 'Toutes les vaches sont à bord.'
        : 'Toutes les vaches de la ferme sont sauvées. Monde terminé !'
      vNext.hidden = !r.hasNext
      only(victory)
    },
  }
}
