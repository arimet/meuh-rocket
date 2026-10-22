import * as THREE from 'three'
import { PALETTE } from './palette'
import { VOXELS_PER_TILE as V, VoxelGrid } from './voxel'
import { C, hash, mesh } from './voxelKit'

export const PORTAL_COLORS = [PALETTE.portal1, PALETTE.portal2, PALETTE.portal3, PALETTE.portal4]

// A teleporter pad: a metal ring around a glowing disc, a shimmering veil and orbiting sparks.
export function createPortal(color: string): THREE.Group {
  {
    var g = new VoxelGrid(16, 2, 16)
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const r = Math.hypot(x - 7.5, z - 7.5)
      if (r <= 7.6 && r > 5.6) g.set(x, 0, z, C('steel'))
      if (r <= 7.6 && r > 6.6) g.set(x, 1, z, hash(x, z) < 0.5 ? C('steelLight') : C('steel'))
    }
  }
  const ring = mesh(g, { voxelSize: 1 / V, jitter: 0.05 })
  const group = new THREE.Group()
  const pad = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 }))
  pad.receiveShadow = true
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false }))
  core.position.y = 0.03
  const veil = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.7, 32, 1, true).translate(0, 0.35, 0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
  const N = 14
  const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)),
    new THREE.PointsMaterial({ color, size: 0.06, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
  group.add(pad, core, veil, sparks)
  let flashAt = -10
  group.userData.flash = (t: number) => { flashAt = t }
  group.userData.update = (t: number) => {
    const f = Math.max(0, 1 - (t - flashAt) / 0.35)
    ;(core.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 4) * 0.15 + f * 0.3
    ;(veil.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(t * 3 + 1) * 0.04 + f * 0.5
    veil.scale.set(1 + f * 0.25, 1 + f * 0.6, 1 + f * 0.25)
    const pos = sparks.geometry.attributes.position as THREE.BufferAttribute
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2 + t * 1.8, h = ((t * 0.5 + k / N) % 1)
      pos.setXYZ(k, Math.cos(a) * 0.3, 0.05 + h * 0.65, Math.sin(a) * 0.3)
    }
    pos.needsUpdate = true
  }
  group.userData.update(0)
  return group
}
