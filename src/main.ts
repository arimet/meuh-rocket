import './style.css'
import { GameController } from './game/controller'
import { BoardScene } from './render/boardScene'
import { DIRS, parseLevel } from './sim/level'
import { canPlace } from './sim/sim'
import type { Dir } from './sim/types'
import { createPicker } from './ui/picker'

// Temporary wiring (Task 7): one hard-coded level, until screens and level files land.
const level = parseLevel({
  id: 0, name: 'Essai', idea: 'Poser une flèche',
  grid: [
    '+-+-+-+-+-+-+-+-+-+-+-+-+',
    '|. . . . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . O . . R .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . . . . . .|',
    '+-+-+-+-+-+-+-+-+-+-+-+-+',
  ],
  cows: [[1, 1, 'E'], [1, 3, 'E']], ufos: [[10, 1, 'W']], stock: { S: 2, E: 1 },
})

const canvas = document.getElementById('scene') as HTMLCanvasElement
const ui = document.getElementById('ui')!
const scene = new BoardScene(canvas)
const game = new GameController(level)
scene.loadLevel(level)

let target: number | null = null
const picker = createPicker(ui, dir => { if (target !== null && game.place(target, dir)) scene.setArrows(game.arrows); picker.close() })
const placeable = (cell: number) => Object.fromEntries(DIRS.map(d => [d, canPlace(level, game.arrows, cell, d) ? game.remaining(d) : 0])) as Record<Dir, number>

canvas.addEventListener('pointerdown', e => {
  if (picker.isOpen) { picker.close(); return }
  const cell = scene.cellAt(e.clientX, e.clientY)
  if (cell === null) return
  if (game.arrows.has(cell)) { if (game.remove(cell)) scene.setArrows(game.arrows); return }
  const enabled = placeable(cell)
  if (!DIRS.some(d => enabled[d] > 0)) return
  target = cell
  const p = scene.cellToScreen(cell)
  picker.open(p.x, p.y, enabled)
})
let hovered: number | null = null
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return
  hovered = scene.cellAt(e.clientX, e.clientY)
  scene.setHover(hovered)
})
const KEYS: Record<string, Dir> = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W' }
addEventListener('keydown', e => {
  if (KEYS[e.key] && hovered !== null && game.place(hovered, KEYS[e.key])) { scene.setArrows(game.arrows); e.preventDefault() }
  if ((e.key === 'Backspace' || e.key === 'Delete') && hovered !== null && game.remove(hovered)) scene.setArrows(game.arrows)
  if (e.key === 'Enter') game.launch() || game.stop()
})
addEventListener('resize', () => scene.resize())

const go = document.createElement('button')
go.textContent = 'Lancer'
go.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);padding:10px 24px;border-radius:10px;border:0;background:#ffd84a'
go.onclick = () => game.launch() || game.stop()
ui.append(go)

let prev = performance.now()
scene.renderer.setAnimationLoop(now => {
  const frame = game.update((now - prev) / 1000)
  prev = now
  scene.render(frame, now / 1000)
})

if (import.meta.env.DEV) Object.assign(window, { __mr: { scene, game } })
