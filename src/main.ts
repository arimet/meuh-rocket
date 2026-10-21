import '@fontsource/pixelify-sans/500.css'
import '@fontsource/pixelify-sans/700.css'
import './style.css'
import { sfx, unlockAudio } from './audio/sfx'
import { GameController, type Phase } from './game/controller'
import { LEVELS } from './levels'
import { BoardScene } from './render/boardScene'
import { DIRS } from './sim/level'
import { canPlace } from './sim/sim'
import type { Dir, Level } from './sim/types'
import { icon } from './ui/icons'
import { createPicker } from './ui/picker'
import { completeLevel, loadProgress, saveProgress, starsFor } from './ui/progress'
import { createScreens } from './ui/screens'

const canvas = document.getElementById('scene') as HTMLCanvasElement
const ui = document.getElementById('ui')!
const scene = new BoardScene(canvas)
let progress = loadProgress()
let level: Level = LEVELS[0]
let game = new GameController(level)
let playing = false
let phase: Phase = 'placing'
let speed = 1 // kept across levels

const remaining = () => Object.fromEntries(DIRS.map(d => [d, game.remaining(d)])) as Record<Dir, number>
const refreshHud = () => screens.updateHud({ remaining: remaining(), running: phase === 'running', busy: phase !== 'placing' })

function startLevel(id: number) {
  level = LEVELS.find(l => l.id === id) ?? LEVELS[0]
  phase = 'placing'
  game = new GameController(level, {
    onPhase: p => { phase = p; closePicker(); refreshHud(); if (p === 'cause') sfx.fail() },
    onEvent: e => { if (e.type === 'saved') sfx.moo(); if (e.type === 'abducted') sfx.beam() },
    onWin: async r => {
      const stars = starsFor(game.launches, game.usedSolution)
      progress = completeLevel(progress, level.id, LEVELS.length, stars)
      saveProgress(progress)
      const current = game
      sfx.launch()
      await scene.launchRocket()
      if (game !== current) return
      sfx.win()
      screens.showVictory({ excellent: r.excellent, hasNext: level.id < LEVELS.length, stars, usedSolution: game.usedSolution })
    },
  })
  game.speed = speed
  scene.loadLevel(level)
  scene.setArrows(game.arrows)
  playing = true
  screens.showHud(level)
  refreshHud()
}

function backdrop() {
  playing = false
  closePicker()
  scene.setHover(null)
}

const screens = createScreens(ui, {
  onPlay: () => { backdrop(); screens.showSelect(LEVELS, progress) },
  onSelect: id => startLevel(id),
  onLaunch: () => { closePicker(); screens.foldIdea(); if (game.launch()) sfx.moo(); else game.stop() },
  onClear: () => { game.clear(); scene.setArrows(game.arrows); refreshHud() },
  onMenu: () => { backdrop(); screens.showSelect(LEVELS, progress) },
  onNext: () => startLevel(level.id + 1),
  onSpeed: () => cycleSpeed(),
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

let hovered: number | null = null
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
  sound.setAttribute('aria-label', sfx.muted ? 'Activer le son' : 'Couper le son')
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
let prev = performance.now()
scene.renderer.setAnimationLoop(now => {
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
