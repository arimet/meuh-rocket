import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { VoxelGrid, meshVoxels } from '../src/render/voxel'

const palette = ['', '#ff8800']
const brightness = (geo: THREE.BufferGeometry) => {
  const c = geo.getAttribute('color')
  const base = new THREE.Color(palette[1])
  return Array.from({ length: c.count }, (_, i) => c.getX(i) / base.r)
}

describe('VoxelGrid', () => {
  it('reads 0 outside bounds', () => {
    const g = new VoxelGrid(2, 2, 2).box(0, 0, 0, 1, 1, 1, 1)
    expect(g.get(0, 0, 0)).toBe(1)
    expect(g.get(-1, 0, 0)).toBe(0)
    expect(g.get(2, 0, 0)).toBe(0)
  })

  it('fills a symmetric ellipsoid', () => {
    const g = new VoxelGrid(9, 9, 9).ellipsoid(4, 4, 4, 3, 2, 3, 1)
    expect(g.get(4, 4, 4)).toBe(1)
    expect(g.get(1, 4, 4)).toBe(1)
    expect(g.get(7, 4, 4)).toBe(1)
    expect(g.get(4, 1, 4)).toBe(0)
  })
})

describe('meshVoxels', () => {
  it('single voxel has 6 faces', () => {
    const geo = meshVoxels(new VoxelGrid(1, 1, 1).box(0, 0, 0, 0, 0, 0, 1), palette)
    expect(geo.getAttribute('position').count).toBe(24)
    expect(geo.getIndex()!.count).toBe(36)
    expect(brightness(geo).every(b => Math.abs(b - 1) < 1e-6)).toBe(true)
  })

  it('shared face is culled', () => {
    const geo = meshVoxels(new VoxelGrid(2, 1, 1).box(0, 0, 0, 1, 0, 0, 1), palette)
    expect(geo.getAttribute('position').count).toBe(40)
  })

  it('concave corner is darker', () => {
    const g = new VoxelGrid(2, 2, 1).box(0, 0, 0, 1, 0, 0, 1)
    g.set(1, 1, 0, 1)
    const geo = meshVoxels(g, palette, { anchor: 'corner', voxelSize: 1 })
    const pos = geo.getAttribute('position')
    const nor = geo.getAttribute('normal')
    const b = brightness(geo)
    // top face of voxel (0,0,0): y = 1, x in [0, 1], normal +y
    const top = b.filter((_, i) => nor.getY(i) === 1 && pos.getY(i) === 1 && pos.getX(i) <= 1)
    expect(top).toHaveLength(4)
    expect(Math.min(...top)).toBeLessThan(1)
    expect(Math.max(...top)).toBe(1)
  })

  it('bottom-center anchor', () => {
    const geo = meshVoxels(new VoxelGrid(4, 2, 4).box(0, 0, 0, 3, 1, 3, 1), palette, { voxelSize: 0.25 })
    geo.computeBoundingBox()
    const { min, max } = geo.boundingBox!
    expect(min.y).toBe(0)
    expect(max.y).toBe(0.5)
    expect(min.x).toBe(-0.5)
    expect(max.z).toBe(0.5)
  })
})
