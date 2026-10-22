import '@fontsource/pixelify-sans/500.css'
import '@fontsource/pixelify-sans/700.css'
import './style.css'
import digitsFont from '@fontsource/pixelify-sans/files/pixelify-sans-latin-500-normal.woff2?url'

// The bold cut draws 2 and 3 like 8: digits always use the regular cut, whatever the weight around them.
document.fonts.add(new FontFace('Pixelify Digits', `url(${digitsFont})`, { unicodeRange: 'U+30-39', weight: '100 900' }))
import { sfx, unlockAudio } from './audio/sfx'
import { GameController, type Phase } from './game/controller'
import { LEVELS, WORLDS, worldOf } from './levels'
import { BoardScene } from './render/boardScene'
import { DIRS } from './sim/level'
import { canPlace } from './sim/sim'
import type { Dir, Level } from './sim/types'
import { getLang, setLang, t } from './ui/i18n'
import { icon } from './ui/icons'
import { createPicker } from './ui/picker'
import { completeLevel, loadProgress, saveProgress, starsFor } from './ui/progress'
import { createScreens } from './ui/screens'

document.documentElement.lang = getLang()
const canvas = document.getElementById('scene') as HTMLCanvasElement
const ui = document.getElementById('ui')!
const scene = new BoardScene(canvas)
let progress = loadProgress()
let level: Level = LEVELS[0]
let game = new GameController(level)
let playing = false
let phase: Phase = 'placing'
let speed = 1 // kept across levels
let hovered: number | null = null

const remaining = () => Object.fromEntries(DIRS.map(d => [d, game.remaining(d)])) as Record<Dir, number>
const refreshHud = () => screens.updateHud({ remaining: remaining(), running: phase === 'running', busy: phase !== 'placing' })

function startLevel(id: number) {
  level = LEVELS.find(l => l.id === id) ?? LEVELS[0]
  phase = 'placing'
  hovered = null
  game.dispose()
  game = new GameController(level, {
    onPhase: p => { phase = p; closePicker(); refreshHud(); if (p === 'cause') sfx.fail() },
    onEvent: e => { if (e.type === 'saved') sfx.moo(); if (e.type === 'abducted') sfx.beam() },
    onWin: async r => {
      const stars = starsFor(game.launches, game.usedSolution)
      progress = completeLevel(progress, level.id, stars)
      saveProgress(progress)
      const current = game
      sfx.launch()
      await scene.launchRocket()
      if (game !== current || !playing) return // the player left during the lift-off
      sfx.win()
      const next = LEVELS.find(l => l.id === level.id + 1)
      const worldDone = next && worldOf(next.id) !== worldOf(level.id) ? worldOf(next.id).name : undefined
      screens.showVictory({ excellent: r.excellent, hasNext: !!next, stars, usedSolution: game.usedSolution, worldDone })
    },
  })
  game.speed = speed
  scene.loadLevel(level, worldOf(level.id).theme)
  scene.setArrows(game.arrows)
  playing = true
  screens.showHud(level)
  refreshHud()
}

// Leaving a level abandons its run: no more sounds, saves or victory screen from it.
function backdrop() {
  game.dispose()
  // a won level stays behind the menu: put its cows and rockets back
  game = new GameController(level)
  scene.resetLaunch()
  scene.setArrows(game.arrows)
  hovered = null
  playing = false
  closePicker()
  scene.setHover(null)
}

const screens = createScreens(ui, {
  onPlay: () => { backdrop(); screens.showSelect(LEVELS, progress, WORLDS, worldOf) },
  onSelect: id => startLevel(id),
  onLaunch: () => { closePicker(); screens.foldIdea(); if (game.launch()) sfx.moo(); else game.stop() },
  onClear: () => { game.clear(); scene.setArrows(game.arrows); refreshHud() },
  onMenu: () => { backdrop(); screens.showSelect(LEVELS, progress, WORLDS, worldOf, worldOf(level.id)) },
  onNext: () => startLevel(level.id + 1),
  onSpeed: () => cycleSpeed(),
  onLang: lang => { setLang(lang); paintSound() },
  onWorld: world => {
    // behind the select screen, show the first level of the world being browsed
    if (playing || worldOf(level.id) === world) return
    const first = LEVELS.find(l => worldOf(l.id) === world)
    if (!first) return
    level = first
    game.dispose()
    game = new GameController(level)
    scene.loadLevel(level, world.theme)
    scene.setArrows(game.arrows)
  },
  onSolution: () => {
    closePicker()
    if (game.showSolution()) { scene.setArrows(game.arrows); refreshHud(); sfx.place() }
  },
})

function cycleSpeed() {
  speed = speed === 1 ? 2 : speed === 2 ? 4 : 1
  game.speed = speed
  screens.setSpeed(speed)
}

let target: number | null = null
function closePicker() {
  picker.close()
  scene.setSelected(null)
}
const picker = createPicker(ui, dir => {
  if (target !== null && game.place(target, dir)) { scene.setArrows(game.arrows); refreshHud(); sfx.place() }
  closePicker()
})
const placeable = (cell: number) =>
  Object.fromEntries(DIRS.map(d => [d, canPlace(level, game.arrows, cell, d) ? game.remaining(d) : 0])) as Record<Dir, number>

canvas.addEventListener('pointerdown', e => {
  if (!playing) return
  if (picker.isOpen) { closePicker(); return }
  const cell = scene.cellAt(e.clientX, e.clientY)
  if (cell === null || phase !== 'placing') return
  if (game.arrows.has(cell)) {
    if (game.remove(cell)) { scene.setArrows(game.arrows); refreshHud(); sfx.remove() }
    return
  }
  const enabled = placeable(cell)
  if (!DIRS.some(d => enabled[d] > 0)) return
  target = cell
  screens.foldIdea()
  const p = scene.cellToScreen(cell)
  picker.open(p.x, p.y, enabled)
  scene.setSelected(cell)
})

canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !playing) return
  hovered = phase === 'placing' ? scene.cellAt(e.clientX, e.clientY) : null
  scene.setHover(hovered)
})
canvas.addEventListener('pointerleave', () => { hovered = null; scene.setHover(null) })

const KEYS: Record<string, Dir> = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W' }
addEventListener('keydown', e => {
  if (!playing) return
  if (e.key === 'Escape') closePicker()
  if (e.key === 'f' || e.key === 'F') cycleSpeed()
  if (hovered === null) return
  const dir = KEYS[e.key]
  if (dir) {
    e.preventDefault()
    const old = game.arrows.get(hovered)
    if (old) game.remove(hovered)
    if (game.place(hovered, dir)) sfx.place()
    else if (old) game.place(hovered, old)
    scene.setArrows(game.arrows)
    refreshHud()
  }
  if ((e.key === 'Backspace' || e.key === 'Delete') && game.remove(hovered)) { scene.setArrows(game.arrows); refreshHud(); sfx.remove() }
})

addEventListener('pointerdown', unlockAudio, { capture: true })
addEventListener('keydown', unlockAudio, { capture: true })

const sound = document.createElement('button')
sound.className = 'block sound'
const paintSound = () => {
  sound.innerHTML = icon(sfx.muted ? 'mute' : 'sound')
  sound.setAttribute('aria-label', sfx.muted ? t().soundOn : t().soundOff)
}
sound.addEventListener('click', () => { sfx.setMuted(!sfx.muted); paintSound() })
paintSound()
screens.hudExtra.append(sound)

const onResize = () => { scene.resize(); closePicker() }
addEventListener('resize', onResize)
addEventListener('orientationchange', onResize)

scene.loadLevel(level)
screens.showTitle()
// dev shortcut: ?level=N opens a level directly, locked or not
const direct = Number(new URLSearchParams(location.search).get('level'))
if (import.meta.env.DEV && LEVELS.some(l => l.id === direct)) startLevel(direct)

let clock = 0
// dev-only: slow motion, and manual stepping for frame-by-frame captures
const dev = {
  timeScale: 1,
  step(dt: number) { clock += dt; scene.render(game.update(dt), clock) },
}
// ?fps shows a frame counter
const fpsEl = new URLSearchParams(location.search).has('fps') ? document.createElement('div') : null
let frames = 0, fpsAt = performance.now()
if (fpsEl) {
  fpsEl.className = 'fps'
  document.body.append(fpsEl)
}

let prev = performance.now()
scene.renderer.setAnimationLoop(now => {
  if (fpsEl && ++frames && now - fpsAt > 500) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsAt))} ${t().fps} · ${scene.quality}`
    frames = 0
    fpsAt = now
  }
  const dt = Math.min(0.1, (now - prev) / 1000) * dev.timeScale
  prev = now
  clock += dt
  scene.render(game.update(dt), clock)
})

if (import.meta.env.DEV) {
  Object.assign(window, { __mr: { scene, dev, get game() { return game } } })
  // ?level=5&demo=cause&t=0.5 freezes the failure scene at that point, for screenshots
  const q = new URLSearchParams(location.search)
  if (q.get('demo') === 'cause' && game.launch()) {
    let f = game.update(0)
    while (f.phase === 'running') f = game.update(1 / 60)
    const t = Number(q.get('t') ?? 0.5)
    for (let k = 0; k < 200 && f.phase === 'cause' && f.causeT < t; k++) f = game.update(1 / 120)
    dev.timeScale = 0
  }
}
