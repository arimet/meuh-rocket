// Trot for the cow rig, driven by distance walked (in tiles) so hooves never slide on the grass.
export const HIP_HEIGHT = 5 / 24 // leg length: hip pivot sits 5 actor voxels above the ground
const SWING = 0.7 // max leg angle, radians
// a planted foot sweeps 2·L·sin(SWING) while the body covers half a stride
export const STRIDE = 4 * HIP_HEIGHT * Math.sin(SWING)

export interface Pose {
  legs: [number, number, number, number] // front-left, front-right, back-left, back-right (rotation about the side axis)
  bob: number // body lift
  nod: number // head pitch
  tail: number // tail sway
}

export function gait(distance: number): Pose {
  const phi = (distance / STRIDE) * Math.PI * 2
  const a = SWING * Math.sin(phi)
  return { legs: [a, -a, -a, a], bob: 0.022 * Math.abs(Math.cos(phi)), nod: 0.07 * Math.sin(2 * phi), tail: 0.5 * Math.sin(phi) }
}
