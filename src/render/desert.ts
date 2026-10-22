import * as THREE from 'three'
import type { Level } from '../sim/types'
import { BOARD_MARGIN, GROUND, MATERIALS, createUfo } from './models'
import { PALETTE } from './palette'
import { VOXELS_PER_TILE as V, VoxelGrid } from './voxel'
import { C, type ColorName, blob, disk, hash, mesh, vnoise } from './voxelKit'

// Roswell, 1947: a desert night around the board — dunes, mesas, saguaros, a crashed saucer, an army hangar.

function saguaro(seed: number): THREE.BufferGeometry {
  const g = new VoxelGrid(14, 34, 8)
  const body = (x: number, y0: number, y1: number) => g.box(x, y0, 3, x + 2, y1, 5, C(hash(x, y0, seed) < 0.5 ? 'cactus' : 'cactusLight'))
  body(6, 0, 30)
  const armL = 9 + Math.floor(hash(seed, 1) * 6), armR = 12 + Math.floor(hash(seed, 2) * 6)
  g.box(2, armL, 3, 5, armL + 2, 5, C('cactus')); body(2, armL, armL + 10)
  g.box(9, armR, 3, 11, armR + 2, 5, C('cactus')); body(10, armR, armR + 8)
  // ribs: darker vertical lines
  for (let y = 0; y <= 30; y += 2) g.set(7, y, 2, C('cactusDark'))
  g.box(6, 31, 3, 8, 31, 5, C('cactusLight'))
  return mesh(g, { voxelSize: 1 / 14, jitter: 0.06 })
}

function brush(seed: number): THREE.BufferGeometry {
  const g = new VoxelGrid(9, 5, 9)
  for (let y = 0; y < 5; y++) for (let z = 0; z < 9; z++) for (let x = 0; x < 9; x++)
    if ((x - 4) ** 2 + ((y - 0.5) * 1.6) ** 2 + (z - 4) ** 2 <= 17 && hash(x, y, z + seed) > 0.35)
      g.set(x, y, z, hash(x, y, z + seed) < 0.5 ? C('brushDark') : C('brush'))
  return mesh(g, { voxelSize: 1 / V, jitter: 0.08 })
}

function stone(): THREE.BufferGeometry {
  const g = new VoxelGrid(7, 4, 6)
  blob(g, 3, 1, 2.5, 3.2, 2.4, 2.6, C('clayDark'), 2)
  for (let x = 0; x < 7; x++) for (let z = 0; z < 6; z++) if (g.get(x, 2, z)) g.set(x, 2, z, C('rockRed'))
  return mesh(g, { voxelSize: 1 / V, jitter: 0.08 })
}

// Flat-topped mesa with strata, eroded edges.
function mesa(w: number, d: number, h: number, seed: number): THREE.BufferGeometry {
  const g = new VoxelGrid(w, h, d)
  const strata: ColorName[] = ['rockRed', 'rockOrange', 'rockRed', 'rockPale', 'rockOrange', 'rockRed']
  for (let y = 0; y < h; y++) {
    const shrink = (y / h) * 2.5
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      const edge = Math.min(x, z, w - 1 - x, d - 1 - z)
      if (edge + vnoise(x + y * 3, z, 5, seed) * 3 < shrink) continue
      g.set(x, y, z, C(strata[Math.floor(y / Math.max(2, h / 6)) % strata.length]))
    }
  }
  return mesh(g, { voxelSize: 1 / 5, jitter: 0.07 })
}

function hangar(): { body: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const g = new VoxelGrid(30, 14, 22), glow = new VoxelGrid(30, 14, 22)
  // quonset hut: half cylinder along z, corrugated
  for (let z = 1; z < 21; z++) for (let y = 0; y < 14; y++) for (let x = 0; x < 30; x++) {
    const r = Math.hypot(x - 14.5, y)
    if (r <= 14.2 && r > 12.6) g.set(x, y, z, C(z % 2 ? 'hangar' : 'hangarDark'))
  }
  // front wall with lit doors (+z faces the board)
  for (let y = 0; y < 14; y++) for (let x = 0; x < 30; x++) if (Math.hypot(x - 14.5, y) <= 14.2) g.set(x, y, 21, C('hangarDark'))
  g.box(9, 0, 21, 20, 8, 21, C('steel'))
  glow.box(10, 0, 21, 19, 7, 21, C('windowGlow'))
  g.box(13, 10, 21, 16, 11, 21, C('warnRed'))
  return { body: mesh(g, { voxelSize: 1 / 8, jitter: 0.04 }), glow: mesh(glow, { voxelSize: 1 / 8 }) }
}

function radar(): THREE.BufferGeometry {
  const g = new VoxelGrid(16, 34, 16)
  for (const [x, z] of [[4, 4], [11, 4], [4, 11], [11, 11]]) for (let y = 0; y < 20; y++) g.set(x + Math.round((7.5 - x) * y / 40), y, z + Math.round((7.5 - z) * y / 40), C('steel'))
  for (let y = 4; y < 20; y += 5) for (let k = 4; k <= 11; k++) { g.set(k, y, 4, C('steelLight')); g.set(k, y, 11, C('steelLight')) }
  disk(g, 7.5, 20, 7.5, 3, C('steel'))
  // tilted dish
  for (let y = 21; y < 34; y++) for (let x = 0; x < 16; x++) {
    const r = Math.hypot(x - 7.5, y - 27)
    if (r <= 6.5) g.set(x, y, Math.round(9 - (r * r) / 9), C(r > 5.5 ? 'steel' : 'steelLight'))
  }
  return mesh(g, { voxelSize: 1 / 8, jitter: 0.04 })
}

function barbedFence(length: number): THREE.BufferGeometry {
  const g = new VoxelGrid(length, 9, 1)
  for (let x = 0; x < length; x++) {
    if (x % 14 === 0) g.box(x, 0, 0, x, 8, 0, C('woodDark'))
    else for (const y of [3, 5, 7]) if ((x + y) % 3) g.set(x, y, 0, C('steelLight'))
  }
  return mesh(g, { voxelSize: 1 / V, anchor: 'corner', jitter: 0.05 })
}

export function desertDecor(level: Level): THREE.Group {
  const group = new THREE.Group()
  const mat = MATERIALS.lit
  const base = -GROUND / V
  const hw = level.width / 2 + BOARD_MARGIN / V, hh = level.height / 2 + BOARD_MARGIN / V
  const add = (geo: THREE.BufferGeometry, x: number, z: number, ry = 0, y = base, m: THREE.Material = mat) => {
    const o = new THREE.Mesh(geo, m)
    o.position.set(x, y, z)
    o.rotation.y = ry
    o.castShadow = o.receiveShadow = m === mat
    group.add(o)
    return o
  }
  const inBoard = (x: number, z: number, pad = 0) => Math.abs(x) < hw + pad && Math.abs(z) < hh + pad

  // sand with dunes rising away from the board
  const S = 8, WU = 38, DU = 30
  const g = new VoxelGrid(WU * S, 7, DU * S)
  for (let iz = 0; iz < DU * S; iz++) for (let ix = 0; ix < WU * S; ix++) {
    const x = (ix + 0.5) / S - WU / 2, z = (iz + 0.5) / S - DU / 2
    if (inBoard(x, z, -0.02)) continue
    const far = Math.max(Math.abs(x) - hw, Math.abs(z) - hh)
    const dune = Math.sin(x * 0.55 + z * 0.25) * 0.5 + 0.5
    const h = far < 1.2 ? 1 : 1 + Math.round((vnoise(ix, iz, 26, 9) * 0.6 + dune * 0.4) * Math.min(5, far - 1))
    for (let y = 0; y < h - 1; y++) g.set(ix, y, iz, C('dune3'))
    const n = vnoise(ix, iz, 12, 4)
    const ripple = Math.sin((x * 0.8 + z * 0.3) * 6 + vnoise(ix, iz, 18, 2) * 9) > 0.93 && n > 0.45
    g.set(ix, h - 1, iz, C(ripple ? 'duneLight' : n < 0.35 ? 'dune3' : n < 0.7 ? 'dune1' : 'dune2'))
  }
  add(mesh(g, { voxelSize: 1 / S, anchor: 'bottom-center', jitter: 0.05 }), 0, 0, 0, base - 1 / S)

  // scatter: dry brush and stones
  const scatter = (geo: THREE.BufferGeometry, count: number, scale: [number, number]) => {
    const inst = new THREE.InstancedMesh(geo, mat, count)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3()
    let n = 0
    for (let i = 0; n < count && i < count * 40; i++) {
      const x = (hash(i, 41, count) - 0.5) * WU * 0.9, z = (hash(i, 42, count) - 0.5) * DU * 0.9
      if (inBoard(x, z, 0.15)) continue
      const k = scale[0] + hash(i, 43) * (scale[1] - scale[0])
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i, 44) * Math.PI * 2)
      inst.setMatrixAt(n++, m.compose(p.set(x, base, z), q, sc.set(k, k, k)))
    }
    inst.count = n
    inst.castShadow = inst.receiveShadow = true
    group.add(inst)
  }
  scatter(brush(3), 160, [0.7, 1.3])
  scatter(stone(), 70, [0.6, 1.8])

  // landmarks
  add(mesa(40, 26, 26, 1), -hw - 9, -hh - 9, 0.2)
  add(mesa(30, 22, 18, 2), hw + 6, -hh - 8, -0.3)
  add(mesa(24, 18, 14, 3), -hw - 11, hh - 2, 1.1)
  const cacti = [saguaro(1), saguaro(2), saguaro(3)]
  for (const [i, x, z] of [[0, -hw - 1.8, -hh + 1.5], [1, hw + 2.2, -hh + 0.6], [2, hw + 1.6, hh - 1.8], [0, -hw - 2.4, 1.2],
    [1, -hw - 4.2, hh + 1.6], [2, hw + 4.6, 0.4], [1, -2.5, -hh - 2.8], [0, 4.4, -hh - 4.2]] as const)
    add(cacti[i], x, z, hash(x, z) * 6)
  const h = hangar()
  const hx = -hw + 3, hz = -hh - 2.6
  add(h.body, hx, hz)
  add(h.glow, hx, hz, 0, base, MATERIALS.glow)
  add(radar(), hw - 1.6, -hh - 2.4, -0.6)
  const fence = barbedFence(16 * 9)
  add(fence, hx + 2.2, -hh - 1.3)
  add(fence, -hw - 6, hh + 2.6)

  // the crashed saucer, half buried at the front right, still smoking
  const wreck = createUfo()
  wreck.position.set(hw + 2.6, base - 0.12, hh + 0.6)
  wreck.rotation.set(0.45, 0.8, -0.25)
  wreck.scale.setScalar(1.6)
  group.add(wreck)
  const debris = new THREE.BoxGeometry(0.12, 0.05, 0.2)
  for (let k = 0; k < 9; k++) {
    const d = new THREE.Mesh(debris, MATERIALS.metal)
    d.position.set(hw + 1.6 + hash(k, 1) * 2.2, base + 0.02, hh - 0.6 + hash(k, 2) * 2.4)
    d.rotation.set(hash(k, 3), hash(k, 4) * 3, hash(k, 5))
    group.add(d)
  }
  const SMOKE = 40
  const smokePos = new Float32Array(SMOKE * 3)
  const smoke = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(smokePos, 3)),
    new THREE.PointsMaterial({ color: '#8f8a99', size: 0.22, transparent: true, opacity: 0.35, depthWrite: false }))
  group.add(smoke)
  const crashLight = new THREE.PointLight('#7df0c8', 3, 5, 2)
  crashLight.position.set(hw + 2.6, base + 0.6, hh + 0.6)
  group.add(crashLight)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: PALETTE.warnRed, toneMapped: false }))
  beacon.position.set(hw - 1.6, base + 4.4, -hh - 2.4)
  group.add(beacon)

  // night sky: more stars, a big moon low on the horizon
  const stars = new Float32Array(1500)
  for (let i = 0; i < 500; i++) {
    const t = hash(i, 7) * Math.PI * 2, p = 0.1 + hash(i, 8) * 0.85
    stars.set([Math.cos(t) * 60 * Math.cos(p), 6 + Math.sin(p) * 42, Math.sin(t) * 60 * Math.cos(p) - 22], i * 3)
  }
  group.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(stars, 3)),
    new THREE.PointsMaterial({ color: PALETTE.star, size: 0.22, sizeAttenuation: true, fog: false })))
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 1), new THREE.MeshBasicMaterial({ color: '#ffd9a8', fog: false }))
  moon.position.set(-22, 14, -44)
  group.add(moon)

  group.userData.update = (t: number) => {
    for (let k = 0; k < SMOKE; k++) {
      const life = (t * 0.25 + k / SMOKE) % 1
      smokePos.set([hw + 2.4 + Math.sin(k * 3.1 + t * 0.5) * 0.3 * life + life * 0.6, base + 0.3 + life * 3.2, hh + 0.6 + Math.cos(k * 1.7) * 0.25 * life], k * 3)
    }
    smoke.geometry.attributes.position.needsUpdate = true
    crashLight.intensity = 2.4 + Math.sin(t * 17) * 0.8 + (Math.sin(t * 3.3) > 0.9 ? -2 : 0)
    beacon.visible = Math.floor(t * 1.2) % 2 === 0
  }
  group.userData.update(0)
  return group
}
