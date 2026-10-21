import './style.css'
import { sfx, unlockAudio } from './audio/sfx'
import { GameController, type Phase } from './game/controller'
import { LEVELS } from './levels'
import { BoardScene } from './render/boardScene'
import { DIRS } from './sim/level'
import { canPlace } from './sim/sim'
import type { Dir, Level } from './sim/types'
import { createPicker } from './ui/picker'
import { completeLevel, loadProgress, saveProgress } from './ui/progress'
import { createScreens } from './ui/screens'

const canvas = document.getElementById('scene') as HTMLCanvasElement
const ui = document.getElementById('ui')!
const scene = new BoardScene(canvas)
let progress = loadProgress()
let level: Level = LEVELS[0]
let game = new GameController(level)
let playing = false
let phase: Phase = 'placing'

const remaining = () => Object.fromEntries(DIRS.map(d => [d, game.remaining(d)])) as Record<Dir, number>
const refreshHud = () => screens.updateHud({ remaining: remaining(), running: phase === 'running', busy: phase !== 'placing' })

function startLevel(id: number) {
  level = LEVELS.find(l => l.id === id) ?? LEVELS[0]
  phase = 'placing'
  game = new GameController(level, {
    onPhase: p => { phase = p; picker.close(); refreshHud(); if (p === 'cause') sfx.fail() },
    onEvent: e => { if (e.type === 'saved') sfx.moo(); if (e.type === 'abducted') sfx.beam() },
    onWin: async r => {
      progress = completeLevel(progress, level.id, LEVELS.length)
      saveProgress(progress)
      const current = game
      sfx.launch()
      await scene.launchRocket()
      if (game !== current) return
      sfx.win()
      screens.showVictory({ excellent: r.excellent, hasNext: level.id < LEVELS.length })
    },
  })
  scene.loadLevel(level)
  scene.setArrows(game.arrows)
  playing = true
  screens.showHud(level)
  refreshHud()
}

function backdrop() {
  playing = false
  picker.close()
  scene.setHover(null)
}

const screens = createScreens(ui, {
  onPlay: () => { backdrop(); screens.showSelect(LEVELS, progress) },
  onSelect: id => startLevel(id),
  onLaunch: () => { picker.close(); if (game.launch()) sfx.moo(); else game.stop() },
  onClear: () => { game.clear(); scene.setArrows(game.arrows); refreshHud() },
  onMenu: () => { backdrop(); screens.showSelect(LEVELS, progress) },
  onNext: () => startLevel(level.id + 1),
})

let target: number | null = null
const picker = createPicker(ui, dir => {
  if (target !== null && game.place(target, dir)) { scene.setArrows(game.arrows); refreshHud(); sfx.place() }
  picker.close()
})
const placeable = (cell: number) =>
  Object.fromEntries(DIRS.map(d => [d, canPlace(level, game.arrows, cell, d) ? game.remaining(d) : 0])) as Record<Dir, number>

canvas.addEventListener('pointerdown', e => {
  if (!playing) return
  if (picker.isOpen) { picker.close(); return }
  const cell = scene.cellAt(e.clientX, e.clientY)
  if (cell === null || phase !== 'placing') return
  if (game.arrows.has(cell)) {
    if (game.remove(cell)) { scene.setArrows(game.arrows); refreshHud(); sfx.remove() }
    return
  }
  const enabled = placeable(cell)
  if (!DIRS.some(d => enabled[d] > 0)) return
  target = cell
  const p = scene.cellToScreen(cell)
  picker.open(p.x, p.y, enabled)
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
  if (e.key === 'Escape') picker.close()
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
sound.className = 'sound'
const paintSound = () => {
  sound.textContent = sfx.muted ? '🔇' : '🔊'
  sound.setAttribute('aria-label', sfx.muted ? 'Activer le son' : 'Couper le son')
}
sound.addEventListener('click', () => { sfx.setMuted(!sfx.muted); paintSound() })
paintSound()
screens.hudExtra.append(sound)

const onResize = () => { scene.resize(); picker.close() }
addEventListener('resize', onResize)
addEventListener('orientationchange', onResize)

scene.loadLevel(level)
screens.showTitle()
// dev shortcut: ?level=N opens a level directly, locked or not
const direct = Number(new URLSearchParams(location.search).get('level'))
if (import.meta.env.DEV && LEVELS.some(l => l.id === direct)) startLevel(direct)

let prev = performance.now()
scene.renderer.setAnimationLoop(now => {
  const frame = game.update(Math.min(0.1, (now - prev) / 1000))
  prev = now
  scene.render(frame, now / 1000)
})

if (import.meta.env.DEV) Object.assign(window, { __mr: { scene, get game() { return game } } })
