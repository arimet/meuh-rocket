import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { disposeTree } from '../src/render/dispose'
import { farmDecorFor } from '../src/render/models'
import { lvl } from './helpers'

describe('disposeTree', () => {
  it('frees geometries and materials it owns, never the shared ones', () => {
    const shared = new THREE.BoxGeometry(), sharedMat = new THREE.MeshBasicMaterial()
    const own = new THREE.BoxGeometry(), ownMat = new THREE.MeshBasicMaterial()
    const freed: string[] = []
    shared.addEventListener('dispose', () => freed.push('shared'))
    sharedMat.addEventListener('dispose', () => freed.push('sharedMat'))
    own.addEventListener('dispose', () => freed.push('own'))
    ownMat.addEventListener('dispose', () => freed.push('ownMat'))
    const g = new THREE.Group()
    g.add(new THREE.Mesh(shared, sharedMat), new THREE.Mesh(own, ownMat))
    disposeTree(g, new Set([shared, sharedMat]))
    expect(freed.sort()).toEqual(['own', 'ownMat'])
  })
})

describe('farmDecorFor', () => {
  it('builds the decor once per board size', () => {
    const a = lvl(['+-+-+', '|. R|', '+-+-+'])
    const b = lvl(['+-+-+', '|R .|', '+-+-+'])
    expect(farmDecorFor(a)).toBe(farmDecorFor(b))
  })
})
