import * as THREE from 'three'
import type { Frame } from '../game/controller'
import { TILE } from '../sim/constants'
import type { Actor, Arrows, Dir, Level } from '../sim/types'
import {
  BOARD_MARGIN, MATERIALS, arrowGeometry, boardGeometry, createCow, createUfo, farmDecor, rocketGeometry, tileCenter, ufoBeam,
} from './models'
import { createStage } from './stage'
import { type Pose, gait } from './gait'
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
const smooth = (p: number) => { const q = Math.max(0, Math.min(1, p)); return q * q * (3 - 2 * q) }

interface CowRig { rig: THREE.Group; head: THREE.Mesh; tail: THREE.Mesh; legFL: THREE.Mesh; legFR: THREE.Mesh; legBL: THREE.Mesh; legBR: THREE.Mesh }

// Legs swing about the cow's side axis (z); `splay` spreads them outward (about x).
function poseCow(c: CowRig, pose: Pose, splay = 0) {
  const legs = [c.legFL, c.legFR, c.legBL, c.legBR]
  legs.forEach((leg, k) => leg.rotation.set(k % 2 === 0 ? splay : -splay, 0, pose.legs[k]))
  c.rig.position.y = pose.bob
  c.head.rotation.set(0, 0, pose.nod)
  c.tail.rotation.set(pose.tail, 0, 0)
}

// Standing still: a slow breath, the odd head bob and tail swish.
function idlePose(time: number, i: number): Pose {
  const t = time + i * 1.7
  return { legs: [0, 0, 0, 0], bob: 0.004 * Math.sin(t * 2), nod: 0.05 * Math.sin(t * 1.3) - 0.04, tail: 0.35 * Math.sin(t * 2.2) * Math.max(0, Math.sin(t * 0.6)) }
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
  private walked: number[] = []
  private lastPos: THREE.Vector2[] = []
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
  private glow = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.5, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#c8ff7a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  private sparkles = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(28 * 3), 3)),
    new THREE.PointsMaterial({ color: '#eaff9a', size: 0.07, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  private level: Level | null = null
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
    this.sparkles.visible = this.glow.visible = false
    this.root.add(this.arrowsGroup, this.cursor, this.sparkles, this.glow)
    this.actors = []
    this.beams = []
    for (const _ of level.cows) this.actors.push(createCow(MATERIALS.lit))
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
    this.walked = this.actors.map(() => 0)
    this.lastPos = this.actors.map(() => new THREE.Vector2(-99, -99))
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
    this.sparkles.visible = this.glow.visible = false
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

    const abduction = frame.cause?.type === 'abducted' ? frame.cause : null

    if (to.kind === 'ufo') {
      o.position.y = UFO_HEIGHT + Math.sin(time * 2 + i) * 0.05
      o.rotation.set(0, time * 0.7 + i, 0)
      const beam = this.beams[i - level.cows.length]
      ;(beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(time * 3 + i) * 0.03
      beam.scale.set(1, o.position.y, 1)
      if (abduction?.by === i) this.abductUfo(o, beam, frame.causeT, time)
      else if (to.status === 'lost') {
        if (from.status === 'active') { o.position.y -= a * 1.2; o.scale.setScalar(1 - a * 0.8) }
        else o.visible = frame.phase === 'cause' && frame.highlight === i && Math.floor(time * 6) % 2 === 0
      }
      return
    }

    // cow
    const parts = o.userData as CowRig
    this.yaw[i] = snap ? target : lerpAngle(this.yaw[i], target, Math.min(1, dt * 18))
    o.rotation.set(0, this.yaw[i], 0)
    const step = Math.hypot(x - this.lastPos[i].x, y - this.lastPos[i].y)
    this.lastPos[i].set(x, y)
    if (step < 0.5) this.walked[i] += frame.phase === 'rewinding' ? -step : step
    if (moving && (frame.phase === 'running' || frame.phase === 'rewinding')) poseCow(parts, gait(this.walked[i]))
    else poseCow(parts, idlePose(time, i))

    if (to.status === 'saved') {
      o.visible = from.status === 'active'
      o.scale.setScalar(1 - a)
    } else if (to.status === 'lost') {
      const hole = level.cells[Math.round(to.y / TILE) * level.width + Math.round(to.x / TILE)] === 'hole'
      if (!hole) {
        // abducted: stays put until the cause phase plays the abduction
        const ufo = abduction ? this.actors[abduction.by!] : null
        o.visible = frame.phase === 'running' || (abduction?.actor === i && !!ufo && this.abductCow(o, parts, ufo, frame.causeT, time, i))
        return
      }
      const blink = frame.highlight === i ? Math.floor(time * 6) % 2 === 0 : true
      const k = from.status === 'active' ? a : 1
      o.position.y = -0.45 * k
      o.scale.setScalar(1 - 0.3 * k)
      o.visible = blink && frame.phase !== 'placing' && frame.phase !== 'won' // rewinding lifts it back out of the hole
    }
  }

  // The UFO holds its position: it dips, lowers its beam to the grass, takes the cow in through its hatch,
  // retracts the beam and wobbles back up.
  private abductUfo(o: THREE.Object3D, beam: THREE.Mesh, t: number, time: number) {
    const dip = smooth(t / 0.15) * (1 - smooth((t - 0.78) / 0.12))
    o.position.y = UFO_HEIGHT - 0.14 * dip + Math.sin(time * 2) * 0.02
    const wob = t > 0.86 ? Math.sin(((t - 0.86) / 0.14) * Math.PI * 3) * 0.22 * (1 - (t - 0.86) / 0.14) : 0
    o.rotation.set(wob, time * (0.7 + dip * 0.8), wob * 0.6)
    // beam: grows down from the hatch, retracts back up into it
    const down = smooth(t / 0.12), up = smooth((t - 0.8) / 0.1)
    const len = o.position.y * down * (1 - up)
    beam.scale.set(1 + 0.4 * down, Math.max(0.001, len), 1 + 0.4 * down)
    const flash = t > 0.68 && t < 0.8 ? Math.sin(((t - 0.68) / 0.12) * Math.PI) : 0
    ;(beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + down * (1 - up) * (0.4 + Math.sin(time * 20) * 0.06) + flash * 0.4
    const on = down * (1 - up)
    this.glow.visible = this.sparkles.visible = on > 0.01
    this.glow.position.set(o.position.x, 0.015, o.position.z)
    this.glow.scale.setScalar(0.6 + on * 0.6 + Math.sin(time * 12) * 0.04)
    ;(this.glow.material as THREE.MeshBasicMaterial).opacity = on * 0.6
    this.sparkles.position.set(o.position.x, 0, o.position.z)
    const pos = this.sparkles.geometry.attributes.position as THREE.BufferAttribute
    for (let k = 0; k < pos.count; k++) {
      const h = (time * 0.9 + k / pos.count) % 1
      const r = 0.1 + 0.25 * (1 - h)
      pos.setXYZ(k, Math.cos(k * 2.4 + time * 4) * r, h * len, Math.sin(k * 2.4 + time * 4) * r)
    }
    pos.needsUpdate = true
  }

  // The cow startles, then is pulled up and into the beam axis, legs pedalling, tumbling slowly,
  // and shrinks through the hatch. Returns whether it is still visible.
  private abductCow(o: THREE.Object3D, parts: CowRig, ufo: THREE.Object3D, t: number, time: number, i: number): boolean {
    if (t >= 0.76) return false
    const startle = t > 0.06 && t < 0.2 ? Math.sin(((t - 0.06) / 0.14) * Math.PI) : 0
    const p = Math.max(0, Math.min(1, (t - 0.2) / 0.54))
    const pull = p * p // the beam pulls harder as the cow gets closer
    const ground = o.position.clone()
    const hatch = new THREE.Vector3(ufo.position.x, ufo.position.y - 0.12, ufo.position.z)
    const center = Math.min(1, pull * 2.2)
    o.position.set(ground.x + (hatch.x - ground.x) * center, startle * 0.14 + (hatch.y - 0.18) * pull, ground.z + (hatch.z - ground.z) * center)
    o.rotation.set(0, this.yaw[i] + pull * Math.PI * 1.6, startle * 0.25 + pull * 0.7)
    const shrink = t > 0.66 ? 1 - (t - 0.66) / 0.1 : 1
    o.scale.setScalar(Math.max(0.001, (1 - pull * 0.3) * shrink))
    // legs: splay on the startle, then pedal in the air
    const kick = (k: number) => (p > 0 ? Math.sin(time * 26 + k * 1.9) * 0.65 * Math.min(1, p * 4) : 0)
    poseCow(parts, {
      legs: [kick(0) + startle * 0.5, kick(1) + startle * 0.5, kick(2) - startle * 0.5, kick(3) - startle * 0.5],
      bob: 0, nod: -0.35 * startle - 0.25 * p, tail: Math.sin(time * 18) * 0.6 * (startle + p),
    }, startle * 0.45 + p * 0.35)
    return true
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
