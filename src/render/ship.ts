import * as THREE from 'three'
import type { Level } from '../sim/types'
import { BOARD_MARGIN, GROUND, MATERIALS, createCow } from './models'
import { PALETTE } from './palette'
import { VOXELS_PER_TILE as V, VoxelGrid } from './voxel'
import { C, blob, disk, hash, mesh } from './voxelKit'

// Le vaisseau-mère: a hangar deck floating in space. Plates, light strips, consoles, cows in tanks, a few aliens.

function console_(): { body: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const g = new VoxelGrid(20, 14, 10), glow = new VoxelGrid(20, 14, 10)
  g.box(0, 0, 2, 19, 7, 9, C('hull'))
  g.box(1, 8, 4, 18, 13, 6, C('hullDark')) // slanted screen back
  for (let x = 2; x < 18; x += 3) glow.box(x, 6, 9, x + 1, 6, 9, C(hash(x, 1) < 0.3 ? 'screenWarn' : 'energy'))
  glow.box(3, 9, 7, 16, 12, 7, C('screen'))
  return { body: mesh(g, { voxelSize: 1 / V, jitter: 0.04 }), glow: mesh(glow, { voxelSize: 1 / V }) }
}

function tankBase(): THREE.BufferGeometry {
  const g = new VoxelGrid(16, 30, 16)
  disk(g, 7.5, 0, 7.5, 7.6, C('hullDark'))
  disk(g, 7.5, 1, 7.5, 7, C('hull'))
  disk(g, 7.5, 28, 7.5, 7.6, C('hullDark'))
  disk(g, 7.5, 29, 7.5, 5, C('hull'))
  for (let y = 2; y < 28; y += 6) for (const [x, z] of [[0, 7], [15, 8], [7, 0], [8, 15]]) g.set(x, y, z, C('energyDark'))
  return mesh(g, { voxelSize: 1 / V, jitter: 0.04 })
}

function alien(): THREE.BufferGeometry {
  const g = new VoxelGrid(10, 16, 8)
  blob(g, 4.5, 3, 3.5, 2.2, 3, 1.8, C('hullLight'), 2) // little suit
  blob(g, 4.5, 11, 3.5, 3.6, 3.4, 3.2, C('alienSkin'), 2)
  g.box(2, 11, 7, 3, 12, 7, C('eye')); g.box(6, 11, 7, 7, 12, 7, C('eye'))
  g.set(4, 15, 3, C('alienSkin')); g.set(5, 15, 4, C('energy'))
  return mesh(g, { voxelSize: 1 / V, jitter: 0.04 })
}

function pipe(length: number): THREE.BufferGeometry {
  const g = new VoxelGrid(length, 4, 4)
  for (let x = 0; x < length; x++) {
    g.box(x, 0, 0, x, 3, 3, C(x % 10 === 0 ? 'hullLight' : 'hull'))
    if (x % 10 === 5) g.box(x, 0, 0, x, 3, 3, C('energyDark'))
  }
  return mesh(g, { voxelSize: 1 / V, anchor: 'corner', jitter: 0.04 })
}

export function shipDecor(level: Level): THREE.Group {
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

  // the deck: riveted plates with glowing seams, ending on open space
  const S = 8, WU = 28, DU = 22
  const deck = new VoxelGrid(WU * S, 3, DU * S), strips = new VoxelGrid(WU * S, 3, DU * S)
  for (let iz = 0; iz < DU * S; iz++) for (let ix = 0; ix < WU * S; ix++) {
    const x = (ix + 0.5) / S - WU / 2, z = (iz + 0.5) / S - DU / 2
    if (Math.abs(x) < hw - 0.02 && Math.abs(z) < hh - 0.02) continue
    const edge = ix === 0 || iz === 0 || ix === WU * S - 1 || iz === DU * S - 1
    deck.set(ix, 0, iz, C('hullDark'))
    deck.set(ix, 1, iz, C('hullDark'))
    const seam = ix % 16 === 0 || iz % 16 === 0
    const rivet = (ix % 16 === 2 || ix % 16 === 13) && (iz % 16 === 2 || iz % 16 === 13)
    if (seam && (ix % 48 === 0 || iz % 48 === 0) && !edge) strips.set(ix, 1, iz, C('energyDark'))
    else deck.set(ix, 2, iz, C(edge ? 'energyDark' : seam ? 'hull' : rivet ? 'hullLight' : hash(ix >> 4, iz >> 4) < 0.5 ? 'deck2' : 'deck1'))
  }
  add(mesh(deck, { voxelSize: 1 / S, jitter: 0.04 }), 0, 0, 0, base - 3 / S)
  add(mesh(strips, { voxelSize: 1 / S }), 0, 0, 0, base - 3 / S + 0.005, MATERIALS.glow)

  // consoles along the far side, tanks holding abducted cows on the sides, pipes and aliens
  const cons = console_()
  const screens: THREE.Mesh[] = []
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    add(cons.body, x, -hh - 1.4)
    screens.push(add(cons.glow, x, -hh - 1.4, 0, base, MATERIALS.glow))
  }
  const glass = new THREE.MeshPhysicalMaterial({ color: '#9ff7ff', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false })
  const liquid = new THREE.MeshBasicMaterial({ color: PALETTE.liquid, transparent: true, opacity: 0.22, depthWrite: false })
  const tank = tankBase()
  const cows: THREE.Object3D[] = []
  for (const [x, z] of [[-hw - 1.6, -2.4], [-hw - 1.6, 1.4], [hw + 1.6, -2.4], [hw + 1.6, 1.4], [-hw - 1.6, hh - 0.6], [hw + 1.6, hh - 0.6]]) {
    add(tank, x, z)
    const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 1.6, 24), liquid)
    fluid.position.set(x, base + 0.95, z)
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 1.62, 24, 1, true), glass)
    shell.position.copy(fluid.position)
    shell.renderOrder = 2
    const cow = createCow(mat)
    cow.scale.setScalar(0.7)
    cow.position.set(x, base + 0.6, z)
    group.add(cow, fluid, shell)
    cows.push(cow)
  }
  const p = pipe(16 * 18)
  add(p, -hw - 0.6, -hh - 0.55)
  add(p, -hw - 0.6, hh + 0.4)
  const a = alien()
  const aliens = [add(a, -6.2, -hh - 2.4, 0.3), add(a, 3.1, -hh - 2.5, -0.4), add(a, hw + 2.4, hh + 0.9, -2.2)]

  // open space around the deck: stars all around, Earth below, a red alarm light
  const stars = new Float32Array(2400)
  for (let i = 0; i < 800; i++) {
    const t = hash(i, 11) * Math.PI * 2, ph = (hash(i, 12) - 0.5) * Math.PI
    stars.set([Math.cos(t) * Math.cos(ph) * 55, Math.sin(ph) * 55 - 8, Math.sin(t) * Math.cos(ph) * 55], i * 3)
  }
  group.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(stars, 3)),
    new THREE.PointsMaterial({ color: PALETTE.star, size: 0.2, sizeAttenuation: true, fog: false })))
  const earth = new THREE.Mesh(new THREE.SphereGeometry(9, 48, 32), new THREE.MeshStandardMaterial({ color: '#2f6fd0', emissive: '#0c2a5a', roughness: 0.8, fog: false }))
  earth.position.set(9, -7, -34) // beyond the far edge of the deck
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(9.15, 48, 32), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, fog: false }))
  clouds.position.copy(earth.position)
  group.add(earth, clouds)
  const alarm = new THREE.PointLight('#ff5f4a', 0, 9, 2)
  alarm.position.set(0, base + 2.5, -hh - 2)
  group.add(alarm)

  group.userData.update = (t: number) => {
    cows.forEach((c, i) => {
      c.position.y = base + 0.55 + Math.sin(t * 1.2 + i) * 0.08
      c.rotation.set(Math.sin(t * 0.7 + i) * 0.2, t * 0.3 + i, Math.sin(t * 0.5 + i * 2) * 0.25)
    })
    screens.forEach((s, i) => { s.visible = Math.sin(t * (2 + i) + i * 3) > -0.85 })
    aliens.forEach((m, i) => { m.position.y = base + Math.abs(Math.sin(t * 2 + i)) * 0.03 })
    clouds.rotation.y = t * 0.02
    alarm.intensity = Math.sin(t * 2) > 0.6 ? 4 : 0
  }
  group.userData.update(0)
  return group
}
