import * as THREE from 'three'
import type { Theme } from '../levels'
import type { Level } from '../sim/types'
import { PALETTE } from './palette'
import { VOXELS_PER_TILE as V, VoxelGrid } from './voxel'
import { C, type ColorName, blob, disk, hash, mesh, paint, segDist, vnoise } from './voxelKit'

// Actors use finer voxels than the board.
const R = 24
const actor = (g: VoxelGrid) => mesh(g, { voxelSize: 1 / R, jitter: 0.035 })

export const MATERIALS = {
  lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.75 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  glass: new THREE.MeshPhysicalMaterial({
    color: PALETTE.dome, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.42,
    emissive: PALETTE.dome, emissiveIntensity: 0.25, depthWrite: false,
  }),
}

// Cow facing +x, standing on y = 0, drawn as one voxel grid.
function drawCow(): VoxelGrid {
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
  return g
}

export function cowGeometry(): THREE.BufferGeometry {
  return actor(drawCow()).translate(-0.06, 0, 0)
}

type CowPart = 'body' | 'head' | 'tail' | 'legFL' | 'legFR' | 'legBL' | 'legBR'
// Pivot of each moving part, in cow voxel coordinates (hips, neck, tail root).
const COW_PIVOTS: Record<CowPart, [number, number, number]> = {
  body: [0, 0, 0], head: [15.5, 12, 5], tail: [1, 12.5, 5],
  legFL: [13, 5, 2], legFR: [13, 5, 8], legBL: [5, 5, 2], legBR: [5, 5, 8],
}
const cowPart = (x: number, y: number, z: number): CowPart => {
  if (y <= 4 && (x >= 4 && x <= 6 || x >= 12 && x <= 14)) return `leg${x > 9 ? 'F' : 'B'}${z < 5 ? 'L' : 'R'}` as CowPart
  if (x >= 16 && y >= 9) return 'head'
  if (x <= 1) return 'tail'
  return 'body'
}

let cowParts: Record<CowPart, THREE.BufferGeometry> | null = null

// Articulated cow: legs, head and tail are separate meshes pivoting at their joints.
// Left is the cow's left (−z when facing +x).
export function createCow(material: THREE.Material): THREE.Group {
  if (!cowParts) {
    const src = drawCow()
    const grids = {} as Record<CowPart, VoxelGrid>
    for (const k of Object.keys(COW_PIVOTS) as CowPart[]) grids[k] = new VoxelGrid(src.sx, src.sy, src.sz)
    for (let y = 0; y < src.sy; y++) for (let z = 0; z < src.sz; z++) for (let x = 0; x < src.sx; x++) {
      const c = src.get(x, y, z)
      if (c) grids[cowPart(x, y, z)].set(x, y, z, c)
    }
    // AO is computed per part, so meshes keep their own shading when they move
    cowParts = {} as Record<CowPart, THREE.BufferGeometry>
    for (const k of Object.keys(grids) as CowPart[]) {
      const [px, py, pz] = COW_PIVOTS[k]
      cowParts[k] = mesh(grids[k], { voxelSize: 1 / R, anchor: 'corner', jitter: 0.035 }).translate(-px / R, -py / R, -pz / R)
    }
  }
  const group = new THREE.Group()
  const rig = new THREE.Group() // body bob and tilt happen here, legs stay attached
  group.add(rig)
  const parts = {} as Record<CowPart, THREE.Mesh>
  for (const k of Object.keys(COW_PIVOTS) as CowPart[]) {
    const [px, py, pz] = COW_PIVOTS[k]
    const m = new THREE.Mesh(cowParts[k], material)
    m.position.set(px / R - 23 / 2 / R - 0.06, py / R, pz / R - 11 / 2 / R)
    m.castShadow = m.receiveShadow = true
    rig.add(m)
    parts[k] = m
  }
  group.userData = { rig, ...parts }
  return group
}

let ufoParts: { hull: THREE.BufferGeometry; lights: THREE.BufferGeometry; dome: THREE.BufferGeometry } | null = null

// Saucer with a little alien in the cockpit, rim lights and a glass dome. Geometries are shared by every saucer.
export function createUfo(): THREE.Group {
  ufoParts ??= buildUfoParts()
  const hull = new THREE.Mesh(ufoParts.hull, MATERIALS.metal)
  hull.castShadow = hull.receiveShadow = true
  const glowMesh = new THREE.Mesh(ufoParts.lights, MATERIALS.glow)
  const domeMesh = new THREE.Mesh(ufoParts.dome, MATERIALS.glass)
  domeMesh.renderOrder = 2
  const group = new THREE.Group()
  group.add(hull, glowMesh, domeMesh)
  return group
}

function buildUfoParts() {
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
  const hull = actor(g)

  const lights = new VoxelGrid(30, 6, 30)
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2
    lights.set(Math.round(c + Math.cos(t) * 14.2), 4, Math.round(c + Math.sin(t) * 14.2), C('ufoLight'))
  }
  disk(lights, c, 0, c, 2.2, C('beam'))
  const lightsGeo = mesh(lights, { voxelSize: 1 / R }).translate(0, -0.004, 0)

  const dome = new VoxelGrid(30, 15, 30)
  for (let y = 8; y <= 14; y++) disk(dome, c, y, c, Math.sqrt(Math.max(0, 6.8 ** 2 - (y - 8) ** 2)), C('dome'))
  return { hull, lights: lightsGeo, dome: mesh(dome, { voxelSize: 1 / R }) }
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
export const GROUND = 4 // voxels of earth under the grass top

export function tileCenter(level: Level, x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x - (level.width - 1) / 2, 0, y - (level.height - 1) / 2)
}

export interface BoardTheme {
  tiles: [ColorName, ColorName]; speck: ColorName; line: ColorName; margin: ColorName
  ground: [ColorName, ColorName, ColorName]; rim: ColorName; post: ColorName; rail: ColorName
}
export const BOARD_THEMES: Record<Theme, BoardTheme> = {
  farm: { tiles: ['grass1', 'grass2'], speck: 'grass3', line: 'grassLine', margin: 'grass3', ground: ['soil', 'dirt', 'dirtDark'], rim: 'dirtDark', post: 'woodDark', rail: 'woodLight' },
  ship: { tiles: ['deck1', 'deck2'], speck: 'deckSpeck', line: 'deckLine', margin: 'deckMargin', ground: ['hullDark', 'hull', 'hull'], rim: 'screenWarn', post: 'hullDark', rail: 'energy' },
  desert: { tiles: ['sand1', 'sand2'], speck: 'sandSpeck', line: 'sandLine', margin: 'sandMargin', ground: ['clayDark', 'clay', 'rockRed'], rim: 'clayDark', post: 'steel', rail: 'steelLight' },
}

// The playing field as one chunk of earth: tiles, grid lines, holes, fences on walls.
export function boardGeometry(level: Level, theme: BoardTheme = BOARD_THEMES.farm): THREE.BufferGeometry {
  const M = BOARD_MARGIN
  const sx = level.width * V + 2 * M, sz = level.height * V + 2 * M
  const g = new VoxelGrid(sx, GROUND + 10, sz)
  const top = GROUND - 1

  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    g.set(x, 0, z, C(theme.ground[0]))
    g.set(x, 1, z, hash(x, z, 1) < 0.5 ? C(theme.ground[2]) : C(theme.ground[1]))
    g.set(x, 2, z, hash(x, z, 2) < 0.3 ? C(theme.ground[2]) : C(theme.ground[1]))
    const tx = Math.floor((x - M) / V), ty = Math.floor((z - M) / V)
    const inside = tx >= 0 && ty >= 0 && tx < level.width && ty < level.height
    const lx = x - M - tx * V, lz = z - M - ty * V
    let c: number
    if (!inside) c = C(theme.margin)
    else if (lx === 0 || lz === 0) c = C(theme.line)
    else c = (tx + ty) % 2 ? C(theme.tiles[0]) : C(theme.tiles[1])
    if (inside && c !== C(theme.line) && hash(x, z) < 0.06) c = C(theme.speck)
    g.set(x, top, z, c)
    // sparse tufts away from tile centres
    if (inside && hash(x, z, 7) < 0.012 && (lx < 4 || lx > 11 || lz < 4 || lz > 11) && lx > 1 && lz > 1 && lx < 14 && lz < 14)
      g.set(x, top + 1, z, C(theme.speck))
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
        g.set(x, top, z, C(theme.rim))
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
      if (post) for (let y = GROUND; y <= GROUND + 6; y++) at(k, y, C(theme.post))
      else {
        at(k, GROUND + 2, C(theme.rail))
        at(k, GROUND + 5, C(theme.rail))
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

function barn(): { body: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const g = new VoxelGrid(28, 28, 22)
  const glow = new VoxelGrid(28, 28, 22)
  g.box(1, 0, 1, 26, 14, 20, C('barnRed'))
  // vertical planks
  for (let x = 1; x <= 26; x += 3) g.box(x, 0, 20, x, 14, 20, C('rocketRedDark'))
  // white corner trims
  for (const x of [1, 26]) for (const z of [1, 20]) g.box(x, 0, z, x, 14, z, C('rocketWhite'))
  // gable roof with overhang
  for (let k = 0; k <= 12; k++) {
    g.box(Math.max(0, k - 1), 15 + k, 0, Math.min(27, 28 - k), 15 + k, 21, C('barnRoof'))
    if (k < 12) g.box(k + 1, 15 + k, 1, 26 - k, 15 + k, 20, C('barnRed'))
  }
  // big doors with white X, facing +z
  g.box(9, 0, 21, 18, 10, 21, C('woodDark'))
  for (let k = 0; k <= 9; k++) { g.set(9 + k, k + 1, 21, C('rocketWhite')); g.set(18 - k, k + 1, 21, C('rocketWhite')) }
  g.box(9, 11, 21, 18, 11, 21, C('rocketWhite'))
  // lit hayloft and side windows
  glow.box(12, 17, 21, 15, 20, 21, C('windowGlow'))
  glow.box(3, 6, 21, 5, 8, 21, C('windowGlow'))
  glow.box(22, 6, 21, 24, 8, 21, C('windowGlow'))
  return { body: mesh(g, { voxelSize: 1 / 8, jitter: 0.05 }), glow: mesh(glow, { voxelSize: 1 / 8 }) }
}

function silo(): THREE.BufferGeometry {
  const g = new VoxelGrid(16, 44, 16)
  for (let y = 0; y <= 34; y++) disk(g, 7.5, y, 7.5, 6.8, y % 6 === 0 ? C('siloDark') : C('silo'))
  for (let y = 35; y <= 41; y++) disk(g, 7.5, y, 7.5, Math.sqrt(Math.max(0, 7 ** 2 - (y - 34) ** 2)), C('metalDark'))
  g.box(7, 42, 7, 8, 43, 8, C('metalDark'))
  return mesh(g, { voxelSize: 1 / 8, jitter: 0.04 })
}

function outerFence(length: number): THREE.BufferGeometry {
  const g = new VoxelGrid(length, 8, 2)
  for (let x = 0; x < length; x++) {
    if (x % 12 === 0) g.box(x, 0, 0, x + 1, 7, 1, C('woodDark'))
    else { g.box(x, 3, 0, x, 3, 0, C('wood')); g.box(x, 6, 0, x, 6, 0, C('wood')) }
  }
  return mesh(g, { voxelSize: 1 / V, anchor: 'corner', jitter: 0.06 })
}

function tuft(): THREE.BufferGeometry {
  const g = new VoxelGrid(7, 7, 7)
  const blades: [number, number, number, ColorName][] = [
    [3, 3, 6, 'tuft1'], [1, 2, 4, 'tuft2'], [5, 2, 5, 'tuft3'], [2, 5, 5, 'tuft1'], [4, 5, 3, 'tuft2'], [5, 4, 4, 'tuft3'], [1, 4, 3, 'tuft3'],
  ]
  for (const [x, z, h, c] of blades) for (let y = 0; y < h; y++) g.set(x, y, z, C(c))
  return mesh(g, { voxelSize: 1 / V, jitter: 0.08 })
}

function flower(): THREE.BufferGeometry {
  const g = new VoxelGrid(3, 5, 3)
  for (let y = 0; y < 3; y++) g.set(1, y, 1, C('tuft2'))
  g.box(0, 3, 1, 2, 3, 1, C('petal')); g.box(1, 3, 0, 1, 3, 2, C('petal')); g.set(1, 4, 1, C('petal'))
  return mesh(g, { voxelSize: 1 / V })
}

function rock(): THREE.BufferGeometry {
  const g = new VoxelGrid(7, 4, 6)
  blob(g, 3, 1, 2.5, 3.2, 2.4, 2.6, C('rock'), 2)
  paint(g, 4, 3, 2, 2, 1, 2, C('rockDark'))
  return mesh(g, { voxelSize: 1 / V, jitter: 0.08 })
}

function bush(seed: number): THREE.BufferGeometry {
  const g = new VoxelGrid(12, 9, 12)
  for (let y = 0; y < 9; y++) for (let z = 0; z < 12; z++) for (let x = 0; x < 12; x++)
    if ((x - 5.5) ** 2 + ((y - 2) * 1.3) ** 2 + (z - 5.5) ** 2 <= 30 && hash(x, y, z + seed) > 0.1)
      g.set(x, y, z, hash(x, y, z + seed) < 0.35 ? C('leafDark') : C('leaf'))
  return mesh(g, { voxelSize: 1 / V, jitter: 0.06 })
}

// Night farm around the board. Everything stays outside the playing field so the grid reads clearly.
export function farmDecor(level: Level): THREE.Group {
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

  // landmarks (world units, board centred on the origin, camera on +z)
  const barnAt = { x: -hw + 2.2, z: -hh - 2.2 }
  const door = { x: barnAt.x, z: barnAt.z + 1.45 }
  const pond = { x: hw + 1.9, z: hh - 1.6, r: 1.25 }
  const onPath = (x: number, z: number) => segDist(x, z, door.x, door.z, door.x + 1.2, -hh - 0.05) < 0.42
  const inBoard = (x: number, z: number, pad = 0) => Math.abs(x) < hw + pad && Math.abs(z) < hh + pad
  const inPond = (x: number, z: number, pad = 0) => Math.hypot(x - pond.x, z - pond.z) < pond.r + pad

  // voxel meadow with gentle mounds; skipped under the board
  const S = 8, WU = 36, DU = 28
  const g = new VoxelGrid(WU * S, 5, DU * S)
  for (let iz = 0; iz < DU * S; iz++) for (let ix = 0; ix < WU * S; ix++) {
    const x = (ix + 0.5) / S - WU / 2, z = (iz + 0.5) / S - DU / 2
    if (inBoard(x, z, -0.02)) continue
    const edge = Math.min(Math.abs(Math.abs(x) - hw), Math.abs(Math.abs(z) - hh))
    const far = Math.max(Math.abs(x) - hw, Math.abs(z) - hh)
    const h = far < 1.2 ? 1 : 1 + Math.round(vnoise(ix, iz, 22, 3) * Math.min(3, far - 1))
    for (let y = 0; y < h - 1; y++) g.set(ix, y, iz, C('dirt'))
    let c: ColorName
    if (inPond(x, z)) { g.set(ix, 0, iz, C('pondBed')); continue }
    if (onPath(x, z)) c = hash(ix, iz, 9) < 0.35 ? 'pathDark' : 'path'
    else {
      const n = vnoise(ix, iz, 14, 5)
      c = n < 0.3 ? 'meadow3' : n < 0.62 ? 'meadow1' : n < 0.85 ? 'meadow2' : 'meadowLight'
      if (edge < 0.25 && hash(ix, iz, 4) < 0.5) c = 'meadow3'
    }
    g.set(ix, h - 1, iz, C(c))
  }
  add(mesh(g, { voxelSize: 1 / S, anchor: 'bottom-center', jitter: 0.06 }), 0, 0, 0, base - 1 / S)

  // pond water and lily pads
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(pond.r + 0.05, 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#2f6f8c', emissive: '#0d2a3a', roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.9 }),
  )
  water.position.set(pond.x, base + 0.012, pond.z)
  group.add(water)
  const lily = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 7), new THREE.MeshStandardMaterial({ color: PALETTE.lily }))
  for (const [dx, dz] of [[-0.6, 0.3], [0.5, -0.5], [0.2, 0.8]]) {
    const l = lily.clone()
    l.position.set(pond.x + dx, base + 0.025, pond.z + dz)
    group.add(l)
  }

  // instanced scatter: grass tufts, flowers, rocks
  const scatter = (geo: THREE.BufferGeometry, count: number, accept: (x: number, z: number, i: number) => boolean,
    tint?: (i: number) => string, scale: [number, number] = [0.8, 1.3]) => {
    const inst = new THREE.InstancedMesh(geo, mat, count)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3()
    let n = 0
    for (let i = 0; n < count && i < count * 40; i++) {
      const x = (hash(i, 11, count) - 0.5) * WU * 0.92, z = (hash(i, 12, count) - 0.5) * DU * 0.92
      if (inBoard(x, z, 0.12) || inPond(x, z, 0.1) || onPath(x, z) || !accept(x, z, i)) continue
      const k = scale[0] + hash(i, 13) * (scale[1] - scale[0])
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i, 14) * Math.PI * 2)
      inst.setMatrixAt(n, m.compose(p.set(x, base, z), q, sc.set(k, k * (0.8 + hash(i, 15) * 0.6), k)))
      if (tint) inst.setColorAt(n, new THREE.Color(tint(i)))
      n++
    }
    inst.count = n
    inst.castShadow = inst.receiveShadow = true
    group.add(inst)
  }
  const nearBoard = (x: number, z: number) => Math.max(Math.abs(x) - hw, Math.abs(z) - hh)
  scatter(tuft(), 800, (x, z, i) => hash(i, 16) < 1.1 - nearBoard(x, z) * 0.06, undefined, [0.55, 0.95])
  scatter(tuft(), 110, (x, z) => nearBoard(x, z) < 0.5, undefined, [0.7, 1.05]) // thicker along the board edge
  const flowerTints = ['#ffffff', '#ffe066', '#f7a3d0', '#b9a6ff']
  scatter(flower(), 220, (x, z) => vnoise(x * 8, z * 8, 18, 21) > 0.5, i => flowerTints[i % 4], [0.9, 1.2])
  scatter(rock(), 40, () => true, undefined, [0.6, 1.6])

  // farm buildings close behind the board
  const b = barn()
  add(b.body, barnAt.x, barnAt.z)
  add(b.glow, barnAt.x, barnAt.z, 0, base, MATERIALS.glow)
  add(silo(), barnAt.x + 2.6, barnAt.z - 0.4)
  const lantern = new THREE.PointLight('#ffb35c', 6, 7, 2)
  lantern.position.set(door.x, base + 1.6, door.z + 0.4)
  group.add(lantern)
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), new THREE.MeshBasicMaterial({ color: '#ffd28a' }))
  lamp.position.copy(lantern.position).add(new THREE.Vector3(0, 0, -0.1))
  group.add(lamp)

  const bale = haybale()
  add(bale, -hw - 1.3, hh - 1.4, 0.3)
  add(bale, -hw - 1.0, hh - 2.6, -0.2)
  add(bale, barnAt.x - 2.3, barnAt.z + 1.2, 1.2)
  add(bale, hw + 1.1, -hh + 0.8, 0.9)
  const trees = [tree(1), tree(5), tree(9)]
  for (const [i, x, z] of [[0, -hw - 3, -hh + 1], [1, hw + 2.6, -hh - 0.8], [2, hw + 3.8, -1.2], [0, -hw - 3.6, 1.2],
    [1, hw + 5.2, hh + 1.5], [2, -hw - 5.5, -hh - 2.5], [1, barnAt.x + 5, barnAt.z - 2.4], [0, -hw - 2.4, hh + 2.4]] as const)
    add(trees[i], x, z, hash(x, z) * 6)
  const bushes = [bush(2), bush(7)]
  for (const [i, x, z] of [[0, -hw - 1.6, -hh + 2.6], [1, hw + 1.5, hh - 2.3], [0, pond.x + 0.9, pond.z - 2.3], [1, barnAt.x - 1.8, barnAt.z - 0.6],
    [0, hw + 1.4, 0.8], [1, -hw - 1.5, 0.2]] as const)
    add(bushes[i], x, z, hash(z, x) * 6)
  const fence = outerFence(16 * 7)
  add(fence, barnAt.x + 4.2, -hh - 3.4)
  add(fence, -hw - 5, hh + 3)

  // fireflies drifting over the meadow
  const FLIES = 70
  const fly = new Float32Array(FLIES * 3)
  const seeds = Array.from({ length: FLIES }, (_, i) => {
    let x = 0, z = 0
    for (let k = 0; k < 20; k++) {
      x = (hash(i, 31, k) - 0.5) * 20; z = (hash(i, 32, k) - 0.5) * 16
      if (!inBoard(x, z, 0.3)) break
    }
    return { x, z, y: 0.2 + hash(i, 33) * 0.9, p: hash(i, 34) * 10 }
  })
  const fireflies = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(fly, 3)),
    new THREE.PointsMaterial({ color: '#e8ff7a', size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  group.add(fireflies)

  // starry sky and moon
  const stars = new Float32Array(900)
  for (let i = 0; i < 300; i++) {
    const t = hash(i, 1) * Math.PI * 2, p = 0.15 + hash(i, 2) * 0.8
    stars.set([Math.cos(t) * 60 * Math.cos(p), 8 + Math.sin(p) * 40, Math.sin(t) * 60 * Math.cos(p) - 20], i * 3)
  }
  group.add(new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(stars, 3)),
    new THREE.PointsMaterial({ color: PALETTE.star, size: 0.25, sizeAttenuation: true, fog: false }),
  ))
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5, 1), new THREE.MeshBasicMaterial({ color: '#fff1c9', fog: false }))
  moon.position.set(18, 22, -40)
  group.add(moon)

  group.userData.update = (t: number) => {
    seeds.forEach((s, i) => fly.set([
      s.x + Math.sin(t * 0.35 + s.p) * 0.6, s.y + Math.sin(t * 0.9 + s.p * 2) * 0.15, s.z + Math.cos(t * 0.3 + s.p) * 0.6,
    ], i * 3))
    fireflies.geometry.attributes.position.needsUpdate = true
    lantern.intensity = 6 + Math.sin(t * 7) * 0.4 + Math.sin(t * 13) * 0.3
  }
  group.userData.update(0)
  return group
}
