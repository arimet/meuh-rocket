import type { World } from '../levels'
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
  onSolution(): void
  onSpeed(): void
  onWorld(world: World): void // the select screen now shows this world
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
const starRow = (n: number, cls = 'stars') => {
  const el = h('div', cls)
  el.innerHTML = [0, 1, 2].map(k => icon('star', k < n ? 'on' : 'off')).join('')
  el.setAttribute('aria-label', `${n} étoile${n > 1 ? 's' : ''} sur 3`)
  return el
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
  // one world at a time, with arrows to flip between them
  const worldTitle = h('h2', '', '')
  const prevWorld = button('', 'small world-prev', () => shownSelect?.(-1), icon('arrow', 'dir-W'))
  const nextWorld = button('', 'small world-next', () => shownSelect?.(1), icon('arrow', 'dir-E'))
  prevWorld.setAttribute('aria-label', 'Monde précédent')
  nextWorld.setAttribute('aria-label', 'Monde suivant')
  const worldBar = h('div', 'world-bar')
  worldBar.append(prevWorld, hanging('', worldTitle), nextWorld)
  const worldLocked = h('p', 'paper world-locked', '')
  select.append(worldBar, grid, worldLocked)
  let shownSelect: ((step: number) => void) | null = null
  let worldIndex = -1

  const hud = h('section', 'hud')
  const top = h('header', 'hud-top')
  const plate = h('button', 'plate')
  plate.setAttribute('aria-label', 'Afficher la consigne')
  const plateNum = h('span', 'plate-num')
  const plateName = h('span', 'plate-name')
  plate.append(plateNum, plateName)
  const idea = h('p', 'paper idea')
  const info = h('div', 'hud-info')
  info.append(plate, idea)
  // the hint folds into the plate after a while (it would hide the board's corner); tap the plate to see it again
  let foldTimer = 0
  const showIdea = (open: boolean) => {
    clearTimeout(foldTimer)
    idea.classList.toggle('open', open)
    plate.setAttribute('aria-expanded', String(open))
    if (open) foldTimer = window.setTimeout(() => showIdea(false), 6000)
  }
  plate.addEventListener('click', () => showIdea(!idea.classList.contains('open')))
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
  // arrow controls sit together: the stock, and the button that empties the board back into it
  const clear = button('Retirer les flèches', 'small clear', on.onClear, icon('clear'))
  clear.setAttribute('aria-label', 'Retirer les flèches')
  const solution = button('Solution', 'small solution', () => openConfirm(), icon('bulb'))
  solution.setAttribute('aria-label', 'Afficher la solution')
  const arrows = h('div', 'hud-arrows')
  arrows.append(stock, clear, solution)
  const menu = button('Menu', 'small menu', on.onMenu, icon('menu'))
  menu.setAttribute('aria-label', 'Menu')
  const extra = h('div', 'hud-extra')
  extra.append(menu)
  top.append(info, arrows, extra)
  const bar = h('footer', 'hud-bar')
  const launch = button('Lancer', 'red launch', on.onLaunch, icon('play'))
  const speed = button('×1', 'small speed', on.onSpeed, icon('fast'))
  speed.setAttribute('aria-label', 'Vitesse ×1 (touche F)')
  bar.append(launch, speed)
  hud.append(top, bar)

  const victory = h('section', 'screen victory')
  let vStars: HTMLElement = h('div', 'stars')
  const vTitle = h('h2', 'logo')
  const vText = h('p', 'paper')
  const vNext = button('Niveau suivant', 'red big', on.onNext, icon('play'))
  const vSignWrap = hanging('big', vStars, vTitle)
  const vSign = vSignWrap.querySelector('.sign') as HTMLElement
  victory.append(vSignWrap, vText, actions(button('Menu', '', on.onMenu, icon('menu')), vNext))

  // confirmation before revealing the solution: it costs the level's stars
  // a native modal dialog: it traps focus and closes on Escape
  const confirm = h('dialog', 'dialog')
  confirm.setAttribute('aria-labelledby', 'confirm-title')
  const cTitle = h('h2', '', 'Afficher la solution\u00a0?')
  cTitle.id = 'confirm-title'
  const cYes = button('Afficher', 'red', () => { closeConfirm(); on.onSolution() }, icon('bulb'))
  const cNo = button('Annuler', '', () => closeConfirm())
  confirm.append(hanging('', cTitle), h('p', 'paper', 'Tu pourras toujours finir le niveau, mais tu ne gagneras pas d’étoile cette fois.'), actions(cNo, cYes))
  const openConfirm = () => { confirm.showModal(); cYes.focus() }
  const closeConfirm = () => confirm.close()
  confirm.addEventListener('close', () => solution.focus())
  confirm.addEventListener('click', e => { if (e.target === confirm) closeConfirm() })

  const portrait = h('div', 'portrait paper', 'Tourne ton téléphone pour jouer')
  root.append(title, select, hud, victory, confirm, portrait)
  const all = [title, select, hud, victory]
  const only = (el: HTMLElement) => all.forEach(s => s.classList.toggle('on', s === el))

  return {
    hudExtra: extra,
    showTitle: () => only(title),
    // `focus` opens a given world (the one just played); otherwise the first visit opens on the most
    // advanced playable level, and later visits keep the world the player browsed to
    showSelect(all: Level[], progress: Progress, worlds: World[], worldOf: (id: number) => World, focus?: World) {
      if (focus) worldIndex = worlds.indexOf(focus)
      else if (worldIndex < 0) worldIndex = worlds.indexOf(worldOf(Math.min(progress.unlocked, all.at(-1)?.id ?? 1)))
      shownSelect = step => {
        worldIndex = Math.max(0, Math.min(worlds.length - 1, worldIndex + step))
        this.showSelect(all, progress, worlds, worldOf)
      }
      const world = worlds[worldIndex]
      on.onWorld(world)
      worldTitle.textContent = `Monde ${world.id} · ${world.name}`
      prevWorld.disabled = worldIndex === 0
      nextWorld.disabled = worldIndex === worlds.length - 1
      const levels = all.filter(l => worldOf(l.id) === world)
      const closed = levels.length > 0 && levels[0].id > progress.unlocked
      worldLocked.hidden = !closed
      worldLocked.textContent = closed ? `Termine le monde ${world.id - 1} pour ouvrir ${world.name}.` : ''
      grid.replaceChildren(...levels.map((l, i) => {
        const locked = l.id > progress.unlocked
        const done = progress.completed.includes(l.id)
        const next = !locked && !done
        const b = h('button', `crate${locked ? ' locked' : ''}${done ? ' done' : ''}${next ? ' next' : ''}`)
        b.style.setProperty('--i', String(i))
        b.disabled = locked
        b.innerHTML = locked ? icon('lock', 'crate-lock') : `<span class="crate-num">${l.id}</span>`
        if (!locked) b.append(h('span', 'crate-name', l.name))
        const stars = progress.stars[l.id] ?? 0
        if (done) b.append(starRow(stars, 'crate-stars'))
        b.setAttribute('aria-label', `Niveau ${l.id} : ${locked ? 'verrouillé' : l.name}${done ? `, réussi, ${stars} étoile${stars > 1 ? 's' : ''}` : ''}`)
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
      showIdea(true)
    },
    foldIdea: () => showIdea(false),
    setSpeed(n: number) {
      speed.querySelector('.label')!.textContent = `×${n}`
      speed.setAttribute('aria-label', `Vitesse ×${n} (touche F)`)
      speed.classList.toggle('on', n > 1)
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
      solution.disabled = s.busy
    },
    showVictory(r: { excellent: boolean; hasNext: boolean; stars: number; usedSolution: boolean; worldDone?: string }) {
      vStars.replaceWith(starRow(r.stars))
      vStars = vSign.querySelector('.stars') as HTMLElement
      vTitle.textContent = r.usedSolution ? 'Mission accomplie' : r.excellent ? 'Excellent\u00a0!' : 'Bravo\u00a0!'
      const line = r.usedSolution ? 'Solution utilisée : pas d’étoile cette fois.'
        : r.excellent ? 'Toutes les vaches sont à bord, avec moins de flèches que prévu.' : 'Toutes les vaches sont à bord.'
      vText.textContent = r.worldDone ? `${line} Monde terminé ! Direction ${r.worldDone}.` : r.hasNext ? line : `${line} Monde terminé !`
      vNext.hidden = !r.hasNext
      only(victory)
    },
  }
}
