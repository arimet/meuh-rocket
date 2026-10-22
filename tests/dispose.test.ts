import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { disposeTree } from '../src/render/dispose'
import { decorFor } from '../src/render/decor'
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

describe('decorFor', () => {
  it('builds the decor once per theme and board size', () => {
    const a = lvl(['+-+-+', '|. R|', '+-+-+'])
    const b = lvl(['+-+-+', '|R .|', '+-+-+'])
    expect(decorFor(a, 'farm')).toBe(decorFor(b, 'farm'))
    expect(decorFor(a, 'desert')).not.toBe(decorFor(a, 'farm'))
  })
})
