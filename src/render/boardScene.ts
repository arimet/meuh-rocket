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

const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const easeOut = (p: number) => 1 - (1 - p) ** 3

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
  private cursor = new THREE.Group()
  private cursorFill: THREE.Mesh
  private cursorMat = new THREE.MeshBasicMaterial({ color: '#fff3d0', toneMapped: false })
  private hoverCell: number | null = null
  private selectedCell: number | null = null
  private selectedAt = -1
  private arrowMeshes = new Map<number, THREE.Mesh>()
  private dying: THREE.Mesh[] = []
  private dust: { mesh: THREE.Mesh; vel: THREE.Vector3; born: number }[] = []
  private dustGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06)
  private dustMat = new THREE.MeshStandardMaterial({ color: '#c9a777', roughness: 1 })
  private level: Level | null = null
  private cowGeo = cowGeometry()
  private arrowGeo = arrowGeometry()
  private rocketGeo = rocketGeometry()
  private raycaster = new THREE.Raycaster()
  private lastTime = 0
  private rockets: THREE.Mesh[] = []
  private launchAt: number | null = null
  private flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.6, 12).rotateX(Math.PI).translate(0, -0.25, 0),
    new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  )

  constructor(private canvas: HTMLCanvasElement) {
    const stage = createStage(canvas)
    this.renderer = stage.renderer
    this.scene = stage.scene
    this.scene.add(this.root)
    // selection cursor: four voxel corner brackets over a soft fill
    this.cursorFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#fff3d0', transparent: true, opacity: 0.16, depthWrite: false }),
    )
    this.cursorFill.position.y = 0.01
    this.cursor.add(this.cursorFill)
    const bar = (w: number, d: number) => new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), this.cursorMat)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const a = bar(0.2, 0.06), b = bar(0.06, 0.2)
      a.position.set(sx * 0.4, 0.04, sz * 0.45)
      b.position.set(sx * 0.45, 0.04, sz * 0.4)
      this.cursor.add(a, b)
    }
    this.cursor.visible = false
  }

  loadLevel(level: Level): void {
    this.level = level
    this.root.clear()
    this.root.add(shadowed(new THREE.Mesh(boardGeometry(level), MATERIALS.lit)))
    this.decor = farmDecor(level)
    this.root.add(this.decor)
    this.rockets = []
    this.launchAt = null
    level.cells.forEach((kind, i) => {
      if (kind !== 'rocket') return
      const r = shadowed(new THREE.Mesh(this.rocketGeo, MATERIALS.lit))
      r.position.copy(tileCenter(level, i % level.width, Math.floor(i / level.width)))
      r.userData.base = r.position.clone()
      this.rockets.push(r)
      this.root.add(r)
    })
    this.arrowsGroup.clear()
    this.arrowMeshes.clear()
    this.dying = []
    for (const d of this.dust) d.mesh.removeFromParent()
    this.dust = []
    this.hoverCell = this.selectedCell = null
    this.root.add(this.arrowsGroup, this.cursor)
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

  // Arrows drop in when placed and hop away when removed.
  setArrows(arrows: Arrows): void {
    const level = this.level
    if (!level) return
    for (const [cell, m] of this.arrowMeshes) {
      if (arrows.get(cell) === m.userData.dir) continue
      m.userData.dying = this.lastTime
      this.dying.push(m)
      this.arrowMeshes.delete(cell)
    }
    for (const [cell, dir] of arrows) {
      if (this.arrowMeshes.has(cell)) continue
      const m = shadowed(new THREE.Mesh(this.arrowGeo, MATERIALS.lit))
      m.position.copy(this.cellCenter(cell))
      m.rotation.y = ARROW_YAW[dir]
      m.userData = { dir, born: this.lastTime, landed: false }
      this.arrowMeshes.set(cell, m)
      this.arrowsGroup.add(m)
    }
  }

  setHover(cell: number | null): void {
    this.hoverCell = cell
  }

  // The tile whose picker is open: the cursor locks onto it and turns hay yellow.
  setSelected(cell: number | null): void {
    if (cell !== null && cell !== this.selectedCell) this.selectedAt = this.lastTime
    this.selectedCell = cell
  }

  private cellCenter(cell: number) {
    const level = this.level!
    return tileCenter(level, cell % level.width, Math.floor(cell / level.width))
  }

  private animateSelection(time: number, dt: number) {
    const target = this.selectedCell ?? this.hoverCell
    if (target === null) { this.cursor.visible = false; return }
    const goal = this.cellCenter(target)
    const jump = !this.cursor.visible || this.cursor.position.distanceTo(goal) > 4
    this.cursor.visible = true
    if (jump || REDUCED_MOTION) this.cursor.position.copy(goal)
    else this.cursor.position.lerp(goal, 1 - Math.exp(-dt * 22))
    const selected = this.selectedCell !== null
    this.cursorMat.color.set(selected ? '#ffd24a' : '#fff3d0')
    ;(this.cursorFill.material as THREE.MeshBasicMaterial).opacity = selected ? 0.3 : 0.14
    const since = time - this.selectedAt
    const snapIn = selected && since < 0.22 ? 1.25 - 0.25 * easeOut(since / 0.22) : 1
    const breathe = REDUCED_MOTION ? 1 : 1 + Math.sin(time * (selected ? 9 : 4)) * (selected ? 0.025 : 0.035)
    this.cursor.scale.set(snapIn * breathe, 1, snapIn * breathe)
    this.cursor.position.y = REDUCED_MOTION ? 0 : 0.01 + Math.sin(time * 4) * 0.012
  }

  private animateArrows(time: number, dt: number) {
    const DROP = 0.22, SQUASH = 0.16
    for (const m of this.arrowMeshes.values()) {
      const t = time - m.userData.born
      if (REDUCED_MOTION || t >= DROP + SQUASH) { m.position.y = 0; m.scale.set(1, 1, 1); continue }
      if (t < DROP) {
        const p = t / DROP
        m.position.y = 0.6 * (1 - p * p)
        m.scale.setScalar(0.8 + 0.2 * p)
      } else {
        if (!m.userData.landed) { m.userData.landed = true; this.puff(m.position, time) }
        const p = (t - DROP) / SQUASH
        m.position.y = 0
        m.scale.set(1 + 0.18 * (1 - p), 1 - 0.45 * (1 - p), 1 + 0.18 * (1 - p))
      }
    }
    this.dying = this.dying.filter(m => {
      const p = (time - m.userData.dying) / 0.16
      if (p >= 1 || REDUCED_MOTION) { m.removeFromParent(); return false }
      m.position.y = 0.3 * p
      m.scale.setScalar(1 - p)
      m.rotation.y += dt * 12
      return true
    })
    this.dust = this.dust.filter(d => {
      const p = (time - d.born) / 0.45
      if (p >= 1) { d.mesh.removeFromParent(); return false }
      d.mesh.position.addScaledVector(d.vel, dt)
      d.vel.y -= dt * 2.5
      d.mesh.scale.setScalar(1 - p)
      return true
    })
  }

  private puff(at: THREE.Vector3, time: number) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.random() * 0.4
      const mesh = new THREE.Mesh(this.dustGeo, this.dustMat)
      mesh.position.set(at.x + Math.cos(a) * 0.25, 0.04, at.z + Math.sin(a) * 0.25)
      this.root.add(mesh)
      this.dust.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * 1.1, 0.9 + Math.random() * 0.5, Math.sin(a) * 1.1), born: time })
    }
  }

  render(frame: Frame, time: number): void {
    const level = this.level
    if (!level) return
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime))
    this.lastTime = time
    const snap = this.yaw.length === 0 || frame.phase === 'placing' || frame.phase === 'rewinding'
    frame.to.actors.forEach((to, i) => this.place(i, frame.from.actors[i], to, frame, time, dt, snap))
    this.decor?.userData.update?.(time)
    this.animateSelection(time, dt)
    this.animateArrows(time, dt)
    this.animateLaunch(time)
    this.renderer.render(this.scene, this.camera)
  }

  // Rockets lift off with the saved cows; resolves once they are out of frame.
  launchRocket(): Promise<void> {
    this.launchAt = this.lastTime
    return new Promise(resolve => setTimeout(resolve, 1600))
  }

  private animateLaunch(time: number) {
    if (this.launchAt === null) {
      this.flame.removeFromParent()
      for (const r of this.rockets) r.position.y = 0
      return
    }
    const t = Math.max(0, time - this.launchAt)
    const shake = t < 0.35 ? Math.sin(t * 90) * 0.02 : 0
    const rise = t < 0.35 ? 0 : (t - 0.35) ** 2 * 5
    this.rockets.forEach((r, k) => {
      const base = r.userData.base as THREE.Vector3
      r.position.set(base.x + shake, rise, base.z)
      if (k === 0 && !this.flame.parent) r.add(this.flame)
    })
    this.flame.scale.set(1, 0.8 + Math.random() * 0.5 + Math.min(2, t * 2), 1)
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
    // fence tops, plus hovering UFOs over the far row so the HUD never covers them
    const corners = [-hw, hw].flatMap(x => [-hh, hh].flatMap(z => [0, 0.45].map(y => new THREE.Vector3(x, y, z))))
    if (level.ufos.length) corners.push(new THREE.Vector3(-hw + 0.5, UFO_HEIGHT + 0.2, -hh + 0.5), new THREE.Vector3(hw - 0.5, UFO_HEIGHT + 0.2, -hh + 0.5))
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
