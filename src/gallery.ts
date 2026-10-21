// Visual sign-off sheet for the voxel models (not part of the game).
import * as THREE from 'three'
import { parseLevel } from './sim/level'
import {
  MATERIALS, arrowGeometry, boardGeometry, createCow, createUfo, farmDecor, rocketGeometry, tileCenter, ufoBeam,
} from './render/models'
import { createStage } from './render/stage'

const level = parseLevel({
  grid: [
    '+-+-+-+-+-+-+-+-+-+-+-+-+',
    '|. . . . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . .|. . . . . . . .|',
    '+ + + + + + + +-+-+ + + +',
    '|. . O . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . . . R . .|',
    '+ + + +-+-+ + + + + + + +',
    '|. . . . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . .|. . . O . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . . . . . .|',
    '+ + + + + + + + + + + + +',
    '|. . . . . . . . . . . .|',
    '+-+-+-+-+-+-+-+-+-+-+-+-+',
  ],
  cows: [], ufos: [], stock: {},
})

const canvas = document.getElementById('c') as HTMLCanvasElement
const { renderer, scene } = createStage(canvas)
const lit = MATERIALS.lit
const shadowed = <T extends THREE.Object3D>(o: T) => { o.traverse(c => { c.castShadow = c.receiveShadow = true }); return o }

const makeUfo = createUfo

// --- board view
const boardView = new THREE.Group()
const decor = farmDecor(level)
boardView.add(shadowed(new THREE.Mesh(boardGeometry(level), lit)), decor)
const arrowGeo = arrowGeometry()
const at = (o: THREE.Object3D, x: number, y: number, rot = 0) => {
  o.position.copy(tileCenter(level, x, y))
  o.rotation.y = rot
  boardView.add(o)
  return o
}
at(shadowed(new THREE.Mesh(rocketGeometry(), lit)), 9, 3)
for (const [x, y, r] of [[1, 1, 0], [2, 1, 0], [5, 4, Math.PI / 2], [8, 6, -Math.PI / 2], [3, 7, Math.PI]] as const)
  at(createCow(lit), x, y, r)
for (const [x, y, r] of [[4, 1, -Math.PI / 2], [7, 4, 0], [9, 6, Math.PI / 2]] as const)
  at(shadowed(new THREE.Mesh(arrowGeo, lit)), x, y, r)
const boardUfo = at(makeUfo(), 6, 6)
boardUfo.position.y = 1.15
const beam = ufoBeam()
beam.scale.y = 1.15
boardUfo.add(beam)

// --- models view
const modelsView = new THREE.Group()
const plinth = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.2, 48), new THREE.MeshStandardMaterial({ color: '#3a4a2c' })))
plinth.position.y = -0.1
const turntable = new THREE.Group()
turntable.add(plinth)
const place = (o: THREE.Object3D, x: number, z: number, y = 0) => { o.position.set(x, y, z); turntable.add(o); return o }
place(createCow(lit), -1.2, 0.6)
place(shadowed(new THREE.Mesh(rocketGeometry(), lit)), 1.1, -0.6)
place(makeUfo(), -0.6, -1.3, 0.9)
place(shadowed(new THREE.Mesh(arrowGeo, lit)), 0.9, 1.3)
modelsView.add(turntable)

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200)
const zoom = new URLSearchParams(location.search).get('cam') === 'wide' ? 1.55 : 1
let view: 'board' | 'models' = new URLSearchParams(location.search).get('view') === 'models' ? 'models' : 'board'
const show = () => {
  scene.remove(boardView, modelsView)
  scene.add(view === 'board' ? boardView : modelsView)
  document.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === view))
}
document.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { view = b.dataset.view as typeof view; show() }))
show()

const resize = () => {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

renderer.setAnimationLoop(t => {
  const s = t / 1000
  if (view === 'board') {
    decor.userData.update(s)
    const a = Math.sin(s * 0.25) * 0.25
    camera.position.set(Math.sin(a) * 13 * zoom, 14 * zoom, Math.cos(a) * 13 * zoom)
    camera.lookAt(0, -0.5, zoom > 1 ? -0.6 : 0.6)
    boardUfo.position.y = 1.15 + Math.sin(s * 2) * 0.04
    boardUfo.rotation.y = s * 0.6
  } else {
    camera.position.set(0, 2.6, 6.2)
    camera.lookAt(0, 0.55, 0)
    turntable.rotation.y = s * 0.4
  }
  renderer.render(scene, camera)
})
