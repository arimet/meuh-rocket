import * as THREE from 'three'
import type { Frame } from '../game/controller'
import { TILE } from '../sim/constants'
import type { Actor, Arrows, Dir, Level } from '../sim/types'
import {
  BOARD_MARGIN, MATERIALS, arrowGeometry, boardGeometry, cowGeometry, createUfo, farmDecor, rocketGeometry, tileCenter, ufoBeam,
} from './models'
import { createStage } from './stage'
import { VOXELS_PER_TILE } from './voxel'

// Arrow model points north (-z), cow model faces east (+x).
const ARROW_YAW: Record<Dir, number> = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 }
const COW_YAW: Record<Dir, number> = { E: 0, N: Math.PI / 2, W: Math.PI, S: -Math.PI / 2 }
const UFO_HEIGHT = 1.05
const PITCH = THREE.MathUtils.degToRad(58) // camera elevation above the board

const shadowed = <T extends THREE.Object3D>(o: T) => {
  o.traverse(c => { if ((c as THREE.Mesh).isMesh && c.userData.noShadow !== true) c.castShadow = c.receiveShadow = true })
  return o
}

const lerpAngle = (a: number, b: number, t: number) => {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * t
}

export class BoardScene {
  readonly renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200)
  private root = new THREE.Group()
  private arrowsGroup = new THREE.Group()
  private actors: THREE.Object3D[] = []
  private beams: THREE.Mesh[] = []
  private yaw: number[] = []
  private decor: THREE.Group | null = null
  private hover: THREE.Mesh
  private level: Level | null = null
  private cowGeo = cowGeometry()
  private arrowGeo = arrowGeometry()
  private rocketGeo = rocketGeometry()
  private raycaster = new THREE.Raycaster()
  private lastTime = 0

  constructor(private canvas: HTMLCanvasElement) {
    const stage = createStage(canvas)
    this.renderer = stage.renderer
    this.scene = stage.scene
    this.scene.add(this.root)
    this.hover = new THREE.Mesh(
      new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.22, depthWrite: false }),
    )
    this.hover.position.y = 0.01
    this.hover.visible = false
  }

  loadLevel(level: Level): void {
    this.level = level
    this.root.clear()
    this.root.add(shadowed(new THREE.Mesh(boardGeometry(level), MATERIALS.lit)))
    this.decor = farmDecor(level)
    this.root.add(this.decor)
    level.cells.forEach((kind, i) => {
      if (kind !== 'rocket') return
      const r = shadowed(new THREE.Mesh(this.rocketGeo, MATERIALS.lit))
      r.position.copy(tileCenter(level, i % level.width, Math.floor(i / level.width)))
      r.userData.rocket = true
      this.root.add(r)
    })
    this.arrowsGroup.clear()
    this.root.add(this.arrowsGroup, this.hover)
    this.actors = []
    this.beams = []
    for (const _ of level.cows) this.actors.push(shadowed(new THREE.Mesh(this.cowGeo, MATERIALS.lit)))
    for (const _ of level.ufos) {
      const u = shadowed(createUfo())
      const beam = ufoBeam()
      beam.scale.y = UFO_HEIGHT
      beam.userData.noShadow = true
      beam.castShadow = beam.receiveShadow = false
      u.add(beam)
      this.beams.push(beam)
      this.actors.push(u)
    }
    this.yaw = this.actors.map(() => 0)
    this.root.add(...this.actors)
    this.resize()
  }

  setArrows(arrows: Arrows): void {
    const level = this.level
    if (!level) return
    this.arrowsGroup.clear()
    for (const [cell, dir] of arrows) {
      const m = shadowed(new THREE.Mesh(this.arrowGeo, MATERIALS.lit))
      m.position.copy(tileCenter(level, cell % level.width, Math.floor(cell / level.width)))
      m.rotation.y = ARROW_YAW[dir]
      this.arrowsGroup.add(m)
    }
  }

  setHover(cell: number | null): void {
    const level = this.level
    this.hover.visible = cell !== null && !!level
    if (cell !== null && level) this.hover.position.copy(tileCenter(level, cell % level.width, Math.floor(cell / level.width))).setY(0.012)
  }

  render(frame: Frame, time: number): void {
    const level = this.level
    if (!level) return
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime))
    this.lastTime = time
    const snap = this.yaw.length === 0 || frame.phase === 'placing' || frame.phase === 'rewinding'
    frame.to.actors.forEach((to, i) => this.place(i, frame.from.actors[i], to, frame, time, dt, snap))
    this.decor?.userData.update?.(time)
    this.renderer.render(this.scene, this.camera)
  }

  private place(i: number, from: Actor, to: Actor, frame: Frame, time: number, dt: number, snap: boolean) {
    const level = this.level!
    const o = this.actors[i]
    const a = frame.alpha
    const x = (from.x + (to.x - from.x) * a) / TILE, y = (from.y + (to.y - from.y) * a) / TILE
    o.position.copy(tileCenter(level, x, y))
    o.visible = true
    o.scale.setScalar(1)
    const moving = from.x !== to.x || from.y !== to.y
    const heading: Dir = !moving ? to.dir
      : Math.abs(to.x - from.x) > 0 ? (to.x > from.x ? 'E' : 'W') : (to.y > from.y ? 'S' : 'N')
    const target = COW_YAW[heading] // while rewinding cows slide backwards, like a tape

    if (to.kind === 'ufo') {
      o.position.y = UFO_HEIGHT + Math.sin(time * 2 + i) * 0.05
      o.rotation.y = time * 0.7 + i
      const beam = this.beams[i - level.cows.length]
      const abducting = frame.highlight !== null && frame.to.actors[frame.highlight]?.status === 'lost'
      ;(beam.material as THREE.MeshBasicMaterial).opacity = abducting ? 0.32 : 0.14 + Math.sin(time * 3 + i) * 0.03
      if (to.status === 'lost') {
        if (from.status === 'active') { o.position.y -= a * 1.2; o.scale.setScalar(1 - a * 0.8) }
        else o.visible = frame.phase === 'cause' && frame.highlight === i && Math.floor(time * 6) % 2 === 0
      }
      return
    }

    this.yaw[i] = snap ? target : lerpAngle(this.yaw[i], target, Math.min(1, dt * 18))
    o.rotation.set(0, this.yaw[i], 0)
    if (moving && frame.phase === 'running') o.position.y = Math.abs(Math.sin(time * 16 + i * 1.7)) * 0.04

    if (to.status === 'saved') {
      o.visible = from.status === 'active'
      o.scale.setScalar(1 - a)
    } else if (to.status === 'lost') {
      const blink = frame.highlight === i ? Math.floor(time * 6) % 2 === 0 : true
      const hole = level.cells[Math.round(to.y / TILE) * level.width + Math.round(to.x / TILE)] === 'hole'
      const k = from.status === 'active' ? a : 1
      if (hole) { o.position.y = -0.45 * k; o.scale.setScalar(1 - 0.3 * k) }
      else { o.position.y = 0.6 * k; o.rotation.z = 0.5 * k; o.scale.setScalar(1 - 0.25 * k) }
      o.visible = blink && (frame.phase === 'cause' || frame.phase === 'running')
    }
  }

  cellAt(clientX: number, clientY: number): number | null {
    const level = this.level
    if (!level) return null
    const r = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null
    const x = Math.round(hit.x + (level.width - 1) / 2), y = Math.round(hit.z + (level.height - 1) / 2)
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return null
    return y * level.width + x
  }

  cellToScreen(cell: number): { x: number; y: number } {
    const level = this.level!
    const p = tileCenter(level, cell % level.width, Math.floor(cell / level.width)).project(this.camera)
    const r = this.canvas.getBoundingClientRect()
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
  }

  resize(): void {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.fitCamera()
  }

  // Closest camera, on a fixed plunging angle, that keeps the whole board inside a safe frame.
  private fitCamera() {
    const level = this.level
    if (!level) return
    const m = BOARD_MARGIN / VOXELS_PER_TILE
    const hw = level.width / 2 + m, hh = level.height / 2 + m
    const corners = [-hw, hw].flatMap(x => [-hh, hh].flatMap(z => [0, 0.45].map(y => new THREE.Vector3(x, y, z))))
    const portrait = this.camera.aspect < 1
    this.camera.fov = portrait ? 42 : 30
    this.camera.updateProjectionMatrix()
    const dir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH))
    const target = new THREE.Vector3(0, 0, 0.35)
    const fits = (d: number) => {
      this.camera.position.copy(target).addScaledVector(dir, d)
      this.camera.lookAt(target)
      this.camera.updateMatrixWorld()
      return corners.every(c => {
        const p = c.clone().project(this.camera)
        return Math.abs(p.x) < 0.94 && p.y < 0.78 && p.y > -0.86
      })
    }
    let lo = 3, hi = 80
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid }
    fits(hi)
  }
}
