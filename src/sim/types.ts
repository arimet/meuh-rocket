import type { Text } from '../ui/i18n'
export type Dir = 'N' | 'E' | 'S' | 'W'
export type CellKind = 'empty' | 'hole' | 'rocket' | 'portal'

export interface Spawn {
  x: number
  y: number
  dir: Dir
}

export interface Level {
  id: number
  name: Text
  idea: Text
  width: number
  height: number
  cells: CellKind[] // index = y * width + x
  wallN: boolean[] // wall on the north side of each cell
  wallW: boolean[] // wall on the west side of each cell
  portals: number[] // for a portal cell, the index of its twin; -1 elsewhere
  cows: Spawn[]
  ufos: Spawn[]
  stock: Record<Dir, number>
  solution?: Arrows // a known solution, shown on request
}

export type Arrows = ReadonlyMap<number, Dir>

export type Status = 'active' | 'saved' | 'lost'

export interface Actor {
  kind: 'cow' | 'ufo'
  x: number // units, cell centre = cx * TILE
  y: number
  dir: Dir
  status: Status
}

export interface SimState {
  tick: number
  actors: Actor[] // cows first, then ufos, in level order
}

export type SimEventType = 'saved' | 'hole' | 'abducted' | 'ufoInRocket' | 'ufoHole' | 'arrow' | 'loop' | 'teleport'

export interface SimEvent {
  tick: number
  type: SimEventType
  actor: number
  by?: number
  cell?: number
  to?: number // teleport: the exit portal
}

export type Outcome = { result: 'won' } | { result: 'failed'; cause: SimEvent }

export interface RunResult {
  outcome: Outcome
  history: SimState[]
  events: SimEvent[]
  visited: Set<number>
  firstVisit: Map<number, number> // cell → tick an actor first reached its centre
  firstVisitBy: Map<number, number>[] // the same, per actor
  arrowsHit: Set<number>
}
