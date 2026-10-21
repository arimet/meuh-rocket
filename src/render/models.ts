import * as THREE from 'three'
import type { Level } from '../sim/types'
import { PALETTE } from './palette'
import { VOXELS_PER_TILE as V, VoxelGrid, meshVoxels } from './voxel'

type ColorName = keyof typeof PALETTE

const NAMES = Object.keys(PALETTE) as ColorName[]
const COLORS = ['', ...NAMES.map(n => PALETTE[n])]
const C = (name: ColorName) => NAMES.indexOf(name) + 1

const hash = (x: number, y: number, z = 0) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Recolour solid voxels inside an ellipsoid (spots, patches, trims).
function paint(g: VoxelGrid, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (g.get(x, y, z) && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1) g.set(x, y, z, c)
}

function disk(g: VoxelGrid, cx: number, y: number, cz: number, r: number, c: number) {
  for (let z = Math.floor(cz - r); z <= cz + r; z++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) g.set(x, y, z, c)
}

const mesh = (g: VoxelGrid, opts?: Parameters<typeof meshVoxels>[2]) => meshVoxels(g, COLORS, opts)

// Actors use finer voxels than the board.
const R = 24
const actor = (g: VoxelGrid) => mesh(g, { voxelSize: 1 / R, jitter: 0.035 })

// Rounded box: superellipsoid of power 4.
function blob(g: VoxelGrid, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number, p = 4) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (Math.abs((x - cx) / rx) ** p + Math.abs((y - cy) / ry) ** p + Math.abs((z - cz) / rz) ** p <= 1) g.set(x, y, z, c)
}

export const MATERIALS = {
  lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.75 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  glass: new THREE.MeshPhysicalMaterial({
    color: PALETTE.dome, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.42,
    emissive: PALETTE.dome, emissiveIntensity: 0.25, depthWrite: false,
  }),
}

// Cow facing +x, standing on y = 0.
export function cowGeometry(): THREE.BufferGeometry {
  const g = new VoxelGrid(23, 20, 11)
  const white = C('cowWhite'), spot = C('cowSpot')
  for (const x of [4, 12]) for (const z of [1, 7]) {
    g.box(x, 0, z, x + 2, 6, z + 2, white)
    g.box(x, 0, z, x + 2, 1, z + 2, C('hoof'))
  }
  blob(g, 9, 9, 5, 7.4, 4.4, 5.4, white)
  blob(g, 11, 4.6, 5, 1.6, 1, 1.6, C('cowPink'), 2)
  // spots: unions of blobs, only on the hide
  for (const [x, y, z, rx, ry, rz] of [
    [6, 10, 0, 3, 2.6, 2.2], [8.5, 8.5, 0, 2, 2, 2], [12, 11, 10, 2.8, 2.2, 2.2], [10.5, 9.5, 10, 1.6, 1.6, 1.6],
    [9, 13.5, 5, 2.2, 1.2, 2.6], [2, 9, 3, 1.6, 2.2, 2.2], [4, 7, 10, 1.4, 1.6, 1.6],
  ]) paint(g, x, y, z, rx, ry, rz, spot)
  // tail with tuft
  for (let y = 7; y <= 12; y++) g.set(1, y, 5, white)
  g.set(0, 12, 5, white)
  g.box(1, 5, 4, 1, 6, 6, spot)
  // neck, collar, bell
  g.box(14, 9, 3, 16, 14, 7, white)
  g.box(15, 9, 3, 15, 13, 7, C('woodDark'))
  g.box(16, 7, 4, 17, 8, 6, C('bell'))
  // head and muzzle
  blob(g, 18, 14, 5, 3.6, 3.6, 3.9, white)
  paint(g, 18.5, 16, 2, 1.8, 1.6, 1.4, spot)
  blob(g, 20.6, 12, 5, 1.9, 2.3, 3.3, C('cowPink'))
  g.set(22, 12, 3, C('cowNose')); g.set(22, 12, 7, C('cowNose'))
  g.box(22, 10, 4, 22, 10, 6, C('cowNose'))
  // eyes
  for (const z of [2, 8]) { g.box(20, 15, z, 20, 16, z, C('eye')); g.set(21, 16, z === 2 ? 3 : 7, C('eye')) }
  // ears and horns
  for (const z of [0, 10]) { g.box(16, 15, z, 17, 16, z, C('cowPink')); g.set(16, 16, z, white) }
  // horns curve outward so both read from the side and from above
  for (const [z, z1, z2] of [[2, 1, 0], [8, 9, 10]]) {
    g.set(18, 17, z, C('horn')); g.set(18, 18, z1, C('horn')); g.set(18, 19, z2, C('horn'))
  }
  return actor(g).translate(-0.06, 0, 0)
}

// Saucer with a little alien in the cockpit, rim lights and a glass dome.
export function createUfo(): THREE.Group {
  const g = new VoxelGrid(30, 15, 30)
  const c = 14.5
  const profile = [6, 9.5, 12, 13.3, 14, 12.8, 10.8, 8]
  profile.forEach((r, y) => disk(g, c, y, c, r, y < 3 ? C('metal') : y === 4 ? C('metalDark') : C('metalLight')))
  disk(g, c, 0, c, 3.5, C('metalDark'))
  for (let a = 0; a < 36; a++) {
    if (a % 3 === 0) continue
    const t = (a / 36) * Math.PI * 2
    g.set(Math.round(c + Math.cos(t) * 13.6), 4, Math.round(c + Math.sin(t) * 13.6), C('metal'))
  }
  // alien: green head, big black eyes, looking toward +z
  blob(g, c, 10, c, 2.4, 2.2, 2.4, C('dome'), 2)
  g.box(13, 10, 16, 13, 11, 16, C('eye'))
  g.box(16, 10, 16, 16, 11, 16, C('eye'))
  g.set(c | 0, 13, c | 0, C('dome')); g.set((c | 0) + 1, 13, c | 0, C('dome'))
  g.set(c | 0, 14, c | 0, C('ufoLight'))
  const hull = new THREE.Mesh(actor(g), MATERIALS.metal)
  hull.castShadow = hull.receiveShadow = true

  const lights = new VoxelGrid(30, 6, 30)
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2
    lights.set(Math.round(c + Math.cos(t) * 14.2), 4, Math.round(c + Math.sin(t) * 14.2), C('ufoLight'))
  }
  disk(lights, c, 0, c, 2.2, C('beam'))
  const glowMesh = new THREE.Mesh(mesh(lights, { voxelSize: 1 / R }).translate(0, -0.004, 0), MATERIALS.glow)

  const dome = new VoxelGrid(30, 15, 30)
  for (let y = 8; y <= 14; y++) disk(dome, c, y, c, Math.sqrt(Math.max(0, 6.8 ** 2 - (y - 8) ** 2)), C('dome'))
  const domeMesh = new THREE.Mesh(mesh(dome, { voxelSize: 1 / R }), MATERIALS.glass)
  domeMesh.renderOrder = 2

  const group = new THREE.Group()
  group.add(hull, glowMesh, domeMesh)
  return group
}

export function ufoBeam(): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.1, 0.42, 1, 32, 1, true).translate(0, -0.5, 0)
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: PALETTE.beam, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  }))
  m.renderOrder = 3
  return m
}

// Escape rocket on its launch pad, standing on y = 0. Porthole faces +z.
export function rocketGeometry(): THREE.BufferGeometry {
  const g = new VoxelGrid(22, 34, 22)
  const c = 10.5
  // pad with hazard ring
  for (let z = 0; z < 22; z++) for (let x = 0; x < 22; x++) {
    const d = Math.hypot(x - c, z - c)
    if (d > 10.4) continue
    const seg = Math.floor(((Math.atan2(z - c, x - c) + Math.PI) / (Math.PI * 2)) * 16)
    g.set(x, 0, z, d > 8.6 ? (seg % 2 ? C('ufoLight') : C('cowSpot')) : C('metalDark'))
  }
  disk(g, c, 1, c, 7.4, C('metal'))
  // nozzle
  disk(g, c, 2, c, 3.2, C('metalDark'))
  disk(g, c, 3, c, 3.8, C('metalDark'))
  disk(g, c, 4, c, 4.4, C('metal'))
  // body with a slight bulge
  for (let y = 5; y <= 22; y++) disk(g, c, y, c, 4.8 + 0.6 * Math.sin((Math.PI * (y - 5)) / 17), C('rocketWhite'))
  for (const y of [8, 20]) disk(g, c, y, c, 5.4, C('rocketRed'))
  // nose cone
  for (let y = 23; y <= 32; y++) disk(g, c, y, c, 5.2 * (1 - ((y - 23) / 10) ** 1.5), C('rocketRed'))
  g.box(10, 33, 10, 11, 33, 11, C('rocketRedDark'))
  // cow spots, away from the porthole
  for (const [x, y, z, rx, ry, rz] of [
    [c - 4, 12, c + 2, 2, 2.6, 2.4], [c - 3, 18, c - 3, 1.8, 1.6, 1.8], [c + 4, 18, c - 2, 2.2, 2, 2.2], [c + 3, 11, c - 4, 1.8, 2, 2],
  ]) paint(g, x, y, z, rx, ry, rz, C('cowSpot'))
  // porthole
  for (let y = 11; y <= 19; y++) for (let x = 6; x <= 15; x++) for (let z = 14; z < 22; z++) {
    if (!g.get(x, y, z)) continue
    const d = Math.hypot(x - c, y - 15)
    if (d <= 2.3) g.set(x, y, z, C('window'))
    else if (d <= 3.4) g.set(x, y, z, C('metalLight'))
  }
  // four swept fins on the diagonals, visible from the camera
  for (let k = 0; k < 4; k++) {
    const t = Math.PI / 4 + (k * Math.PI) / 2
    const ux = Math.cos(t), uz = Math.sin(t)
    for (let z = 0; z < 22; z++) for (let x = 0; x < 22; x++) {
      const dx = x - c, dz = z - c
      const along = dx * ux + dz * uz, across = Math.abs(dx * uz - dz * ux)
      if (along < 4 || along > 9.6 || across > 0.75) continue
      const top = 15 - (along - 4) * 1.5, bottom = 2 + Math.max(0, along - 8) * 1.5
      for (let y = Math.ceil(bottom); y <= top; y++) {
        if (g.get(x, y, z) === C('rocketWhite')) continue
        g.set(x, y, z, along > 8.8 || y >= top - 1 ? C('rocketRedDark') : C('rocketRed'))
      }
    }
  }
  return actor(g)
}

const ARROW = [
  '.....##.....',
  '....####....',
  '...######...',
  '..########..',
  '.##########.',
  '############',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
]

// Flat arrow pointing -z (north), lying on y = 0.
export function arrowGeometry(): THREE.BufferGeometry {
  const g = new VoxelGrid(14, 2, 13)
  ARROW.forEach((row, z) => [...row].forEach((ch, x) => {
    if (ch !== '#') return
    g.set(x + 1, 0, z + 1, C('arrowDark'))
    g.set(x + 1, 1, z + 1, C('arrow'))
  }))
  // light rim on the arrow head
  ARROW.slice(0, 6).forEach((row, z) => {
    const first = row.indexOf('#'), last = row.lastIndexOf('#')
    g.set(first + 1, 1, z + 1, C('arrowLight'))
    g.set(last + 1, 1, z + 1, C('arrowLight'))
  })
  return mesh(g, { voxelSize: 1 / V }).translate(0, 0.005, 0)
}

export const BOARD_MARGIN = 3 // voxels of field around the tiles
const GROUND = 4 // voxels of earth under the grass top

export function tileCenter(level: Level, x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x - (level.width - 1) / 2, 0, y - (level.height - 1) / 2)
}

// The playing field as one chunk of earth: tiles, grid lines, holes, fences on walls.
export function boardGeometry(level: Level): THREE.BufferGeometry {
  const M = BOARD_MARGIN
  const sx = level.width * V + 2 * M, sz = level.height * V + 2 * M
  const g = new VoxelGrid(sx, GROUND + 10, sz)
  const top = GROUND - 1

  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    g.set(x, 0, z, C('soil'))
    g.set(x, 1, z, hash(x, z, 1) < 0.5 ? C('dirtDark') : C('dirt'))
    g.set(x, 2, z, hash(x, z, 2) < 0.3 ? C('dirtDark') : C('dirt'))
    const tx = Math.floor((x - M) / V), ty = Math.floor((z - M) / V)
    const inside = tx >= 0 && ty >= 0 && tx < level.width && ty < level.height
    const lx = x - M - tx * V, lz = z - M - ty * V
    let c: number
    if (!inside) c = C('grass3')
    else if (lx === 0 || lz === 0) c = C('grassLine')
    else c = (tx + ty) % 2 ? C('grass1') : C('grass2')
    if (inside && c !== C('grassLine') && hash(x, z) < 0.06) c = C('grass3')
    g.set(x, top, z, c)
    // sparse tufts away from tile centres
    if (inside && hash(x, z, 7) < 0.012 && (lx < 4 || lx > 11 || lz < 4 || lz > 11) && lx > 1 && lz > 1 && lx < 14 && lz < 14)
      g.set(x, top + 1, z, C('grass3'))
  }

  // holes
  level.cells.forEach((kind, i) => {
    if (kind !== 'hole') return
    const cx = M + (i % level.width) * V + 7.5, cz = M + Math.floor(i / level.width) * V + 7.5
    for (let z = Math.floor(cz - 7); z <= cz + 7; z++) for (let x = Math.floor(cx - 7); x <= cx + 7; x++) {
      const d = Math.hypot(x - cx, z - cz)
      if (d <= 5.2) {
        for (let y = 1; y <= top + 1; y++) g.set(x, y, z, 0)
        g.set(x, 0, z, C('hole'))
      } else if (d <= 6.4) {
        g.set(x, top, z, C('dirtDark'))
        g.set(x, top + 1, z, 0)
      }
    }
  })

  // fences: posts at the ends, two rails
  const fence = (x0: number, z0: number, alongX: boolean) => {
    const at = (k: number, y: number, c: number) => {
      for (const o of [-1, 0]) g.set(alongX ? x0 + k : x0 + o, y, alongX ? z0 + o : z0 + k, c)
    }
    for (let k = -1; k <= V; k++) {
      const post = k <= 0 || k >= V - 1
      if (post) for (let y = GROUND; y <= GROUND + 6; y++) at(k, y, C('woodDark'))
      else {
        at(k, GROUND + 2, C('woodLight'))
        at(k, GROUND + 5, C('woodLight'))
      }
    }
  }
  for (let y = 0; y <= level.height; y++) for (let x = 0; x < level.width; x++) {
    const wall = y === 0 || y === level.height || level.wallN[y * level.width + x]
    if (wall) fence(M + x * V, M + y * V, true)
  }
  for (let y = 0; y < level.height; y++) for (let x = 0; x <= level.width; x++) {
    const wall = x === 0 || x === level.width || level.wallW[y * level.width + x]
    if (wall) fence(M + x * V, M + y * V, false)
  }

  const geo = mesh(g, { voxelSize: 1 / V, jitter: 0.05 })
  return geo.translate(0, -GROUND / V, 0)
}

function haybale(): THREE.BufferGeometry {
  const g = new VoxelGrid(14, 12, 16)
  for (let z = 0; z < 16; z++) for (let y = 0; y < 12; y++) for (let x = 0; x < 14; x++) {
    if ((x - 6.5) ** 2 + (y - 5.5) ** 2 > 36) continue
    const ring = (z === 0 || z === 15)
    g.set(x, y, z, ring ? ((Math.hypot(x - 6.5, y - 5.5) | 0) % 2 ? C('hayDark') : C('hay')) : hash(x, y, z) < 0.2 ? C('hayDark') : C('hay'))
  }
  return mesh(g, { voxelSize: 1 / V, jitter: 0.06 })
}

function tree(seed: number): THREE.BufferGeometry {
  const g = new VoxelGrid(16, 30, 16)
  g.box(7, 0, 7, 8, 12, 8, C('trunk'))
  for (const [cy, r] of [[14, 6.5], [19, 5.5], [23, 3.8]] as const)
    for (let y = cy - r; y <= cy + r; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++)
      if ((x - 7.5) ** 2 + ((y - cy) * 1.15) ** 2 + (z - 7.5) ** 2 <= r * r && hash(x, Math.round(y), z + seed) > 0.08)
        g.set(x, Math.round(y), z, hash(x, Math.round(y), z + seed) < 0.3 ? C('leafDark') : C('leaf'))
  return mesh(g, { voxelSize: 1 / 10, jitter: 0.06 })
}

function barn(): THREE.BufferGeometry {
  const g = new VoxelGrid(26, 26, 20)
  g.box(0, 0, 0, 25, 13, 19, C('barnRed'))
  // gable roof
  for (let k = 0; k <= 11; k++) {
    g.box(k - 1 < 0 ? 0 : k - 1, 14 + k, 0, Math.min(25, 26 - k), 14 + k, 19, C('barnRoof'))
    g.box(k + 1, 14 + k, 1, 24 - k, 14 + k, 18, C('barnRed'))
  }
  // big doors with white X on the +z face
  g.box(8, 0, 19, 17, 10, 19, C('woodDark'))
  for (let k = 0; k <= 9; k++) {
    g.set(8 + k, k + 1, 19, C('rocketWhite'))
    g.set(17 - k, k + 1, 19, C('rocketWhite'))
  }
  g.box(8, 11, 19, 17, 11, 19, C('rocketWhite'))
  g.box(11, 16, 19, 14, 19, 19, C('ufoLight'))
  return mesh(g, { voxelSize: 1 / 6, jitter: 0.05 })
}

function outerFence(length: number): THREE.BufferGeometry {
  const g = new VoxelGrid(length, 8, 2)
  for (let x = 0; x < length; x++) {
    if (x % 12 === 0) g.box(x, 0, 0, x + 1, 7, 1, C('woodDark'))
    else { g.box(x, 3, 0, x, 3, 0, C('wood')); g.box(x, 6, 0, x, 6, 0, C('wood')) }
  }
  return mesh(g, { voxelSize: 1 / V, anchor: 'corner' })
}

// Night farm around the board. Kept outside the playing field so the grid stays readable.
export function farmDecor(level: Level): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.y = ry
    m.castShadow = m.receiveShadow = true
    group.add(m)
    return m
  }
  const hw = level.width / 2 + BOARD_MARGIN / V, hh = level.height / 2 + BOARD_MARGIN / V

  // surrounding field, darker than the board
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#1f3a1b', roughness: 1 }),
  )
  field.position.y = -GROUND / V - 0.001
  field.receiveShadow = true
  group.add(field)

  const bale = haybale()
  add(bale, -hw - 1.4, -GROUND / V, hh - 1.5, 0.3)
  add(bale, -hw - 1.1, -GROUND / V, hh - 3, -0.2)
  add(bale, hw + 1.2, -GROUND / V, -hh + 1, 1.2)
  const t1 = tree(1), t2 = tree(5)
  add(t1, -hw - 2.6, -GROUND / V, -hh + 1.2)
  add(t2, hw + 2.8, -GROUND / V, hh - 2)
  add(t2, -hw - 3.5, -GROUND / V, 0.5, 1)
  add(t1, hw + 3.2, -GROUND / V, -1.5, 2)
  add(barn(), -2.5, -GROUND / V, -hh - 5.5)
  const fence = outerFence(16 * 8)
  add(fence, -hw - 4.5, -GROUND / V, -hh - 3.2)
  add(fence, hw - 3.5, -GROUND / V, -hh - 3.2)

  // starry sky
  const stars = new Float32Array(900)
  for (let i = 0; i < 300; i++) {
    const t = hash(i, 1) * Math.PI * 2, p = 0.15 + hash(i, 2) * 0.8
    stars.set([Math.cos(t) * 60 * Math.cos(p), 8 + Math.sin(p) * 40, Math.sin(t) * 60 * Math.cos(p) - 20], i * 3)
  }
  const sky = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(stars, 3)),
    new THREE.PointsMaterial({ color: PALETTE.star, size: 0.25, sizeAttenuation: true, fog: false }),
  )
  group.add(sky)
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5, 1), new THREE.MeshBasicMaterial({ color: '#fff1c9', fog: false }))
  moon.position.set(18, 22, -40)
  group.add(moon)
  return group
}
