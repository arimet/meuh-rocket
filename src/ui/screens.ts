import type { Dir, Level } from '../sim/types'
import type { Progress } from './progress'

export interface ScreenHandlers {
  onPlay(): void
  onSelect(id: number): void
  onLaunch(): void
  onClear(): void
  onMenu(): void
  onNext(): void
}

const GLYPH: Record<Dir, string> = { N: '↑', E: '→', S: '↓', W: '←' }

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text) el.textContent = text
  return el
}
const button = (label: string, cls: string, onClick: () => void) => {
  const b = h('button', cls, label)
  b.addEventListener('click', onClick)
  return b
}

// DOM screens layered over the 3D canvas.
export function createScreens(root: HTMLElement, on: ScreenHandlers) {
  const title = h('section', 'screen title')
  title.append(
    h('h1', '', 'Meuh Rocket!'),
    h('p', '', 'Guide les vaches jusqu’à la fusée avant que les ovnis ne les enlèvent.'),
    button('Jouer', 'primary big', on.onPlay),
  )

  const select = h('section', 'screen select')
  const grid = h('div', 'levels')
  select.append(h('h2', '', 'Monde 1 · La ferme'), grid)

  const hud = h('section', 'hud')
  const top = h('header', 'hud-top')
  const name = h('div', 'hud-name')
  const idea = h('div', 'hud-idea')
  const stock = h('div', 'stock')
  const info = h('div', 'hud-info')
  info.append(name, idea)
  top.append(info, stock)
  const bar = h('footer', 'hud-bar')
  const launch = button('Lancer', 'primary', on.onLaunch)
  const clear = button('Retirer les flèches', '', on.onClear)
  const extra = h('div', 'hud-extra')
  bar.append(button('Menu', '', on.onMenu), clear, launch)
  top.append(extra)
  hud.append(top, bar)

  const victory = h('section', 'screen victory')
  const vTitle = h('h2')
  const vText = h('p')
  const vNext = button('Niveau suivant', 'primary big', on.onNext)
  const vActions = h('div', 'actions')
  vActions.append(button('Menu', '', on.onMenu), vNext)
  victory.append(vTitle, vText, vActions)

  const portrait = h('div', 'portrait', 'Tourne ton téléphone pour jouer')
  root.append(title, select, hud, victory, portrait)
  const all = [title, select, hud, victory]
  const only = (...els: HTMLElement[]) => all.forEach(el => el.classList.toggle('on', els.includes(el)))

  return {
    hudExtra: extra,
    showTitle: () => only(title),
    showSelect(levels: Level[], progress: Progress) {
      grid.replaceChildren(...levels.map(l => {
        const locked = l.id > progress.unlocked
        const done = progress.completed.includes(l.id)
        const b = button('', `level${locked ? ' locked' : ''}${done ? ' done' : ''}`, () => { if (!locked) on.onSelect(l.id) })
        b.disabled = locked
        b.append(h('span', 'num', String(l.id)), h('span', 'lname', locked ? 'Verrouillé' : l.name))
        if (done) b.append(h('span', 'tick', '✓'))
        b.setAttribute('aria-label', `Niveau ${l.id} : ${locked ? 'verrouillé' : l.name}${done ? ', réussi' : ''}`)
        return b
      }))
      only(select)
    },
    showHud(level: Level) {
      name.textContent = `Niveau ${level.id} · ${level.name}`
      idea.textContent = level.idea
      only(hud)
    },
    updateHud(s: { remaining: Record<Dir, number>; running: boolean; busy: boolean }) {
      stock.replaceChildren(...(['N', 'E', 'S', 'W'] as Dir[]).map(d => {
        const chip = h('span', `chip${s.remaining[d] ? '' : ' empty'}`)
        chip.append(h('b', '', GLYPH[d]), h('span', '', String(s.remaining[d])))
        return chip
      }))
      launch.textContent = s.running ? 'Stop' : 'Lancer'
      launch.disabled = s.busy && !s.running
      clear.disabled = s.busy
    },
    showVictory(r: { excellent: boolean; hasNext: boolean }) {
      vTitle.textContent = r.excellent ? 'Excellent !' : 'Bravo !'
      vText.textContent = r.hasNext
        ? r.excellent ? 'Toutes les vaches sont à bord, avec moins de flèches que prévu.' : 'Toutes les vaches sont à bord.'
        : 'Toutes les vaches de la ferme sont sauvées. Monde terminé !'
      vNext.hidden = !r.hasNext
      only(victory)
    },
  }
}
