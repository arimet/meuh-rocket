import { CATCH_DIST, COW_SPEED, MAX_TICKS, TILE, UFO_SPEED } from './constants'
import { DELTA, blocked, reverse, turnLeft, turnRight } from './level'
import type { Actor, Arrows, Dir, Level, RunResult, SimEvent, SimState } from './types'

const FAILURES = new Set(['hole', 'abducted', 'ufoInRocket'])

// Arrow first, then the wall rule: right, else left, else back.
function chooseDir(level: Level, arrows: Arrows, cx: number, cy: number, dir: Dir): Dir {
  const arrow = arrows.get(cy * level.width + cx)
  const d = arrow ?? dir
  if (!blocked(level, cx, cy, d)) return d
  if (!blocked(level, cx, cy, turnRight(d))) return turnRight(d)
  if (!blocked(level, cx, cy, turnLeft(d))) return turnLeft(d)
  return reverse(d)
}

export function createState(level: Level, arrows: Arrows): SimState {
  const spawn = (kind: Actor['kind']) => (s: Level['cows'][number]): Actor => ({
    kind, x: s.x * TILE, y: s.y * TILE, dir: chooseDir(level, arrows, s.x, s.y, s.dir), status: 'active',
  })
  return { tick: 0, actors: [...level.cows.map(spawn('cow')), ...level.ufos.map(spawn('ufo'))] }
}

export function step(level: Level, arrows: Arrows, state: SimState): { state: SimState; events: SimEvent[] } {
  const tick = state.tick + 1
  const events: SimEvent[] = []
  const actors = state.actors.map(a => ({ ...a }))

  actors.forEach((a, i) => {
    if (a.status !== 'active') return
    const [dx, dy] = DELTA[a.dir]
    const v = a.kind === 'cow' ? COW_SPEED : UFO_SPEED
    a.x += dx * v
    a.y += dy * v
    if (a.x % TILE !== 0 || a.y % TILE !== 0) return
    const cx = a.x / TILE, cy = a.y / TILE
    const cell = cy * level.width + cx
    const kind = level.cells[cell]
    if (kind === 'rocket') {
      a.status = a.kind === 'cow' ? 'saved' : 'lost'
      events.push({ tick, type: a.kind === 'cow' ? 'saved' : 'ufoInRocket', actor: i, cell })
    } else if (kind === 'portal') {
      // jump to the twin portal, keep the heading, then the wall rule applies at the exit
      const to = level.portals[cell]
      a.x = (to % level.width) * TILE
      a.y = Math.floor(to / level.width) * TILE
      events.push({ tick, type: 'teleport', actor: i, cell, to })
      a.dir = chooseDir(level, arrows, to % level.width, Math.floor(to / level.width), a.dir)
    } else if (kind === 'hole') {
      a.status = 'lost'
      events.push({ tick, type: a.kind === 'cow' ? 'hole' : 'ufoHole', actor: i, cell })
    } else {
      if (arrows.has(cell)) events.push({ tick, type: 'arrow', actor: i, cell })
      a.dir = chooseDir(level, arrows, cx, cy, a.dir)
    }
  })

  actors.forEach((cow, i) => {
    if (cow.kind !== 'cow' || cow.status !== 'active') return
    const by = actors.findIndex(u => u.kind === 'ufo' && u.status === 'active' &&
      (u.x - cow.x) ** 2 + (u.y - cow.y) ** 2 < CATCH_DIST ** 2)
    if (by < 0) return
    cow.status = 'lost'
    events.push({ tick, type: 'abducted', actor: i, by })
  })

  return { state: { tick, actors }, events }
}

const stateKey = (s: SimState) => s.actors.map(a => `${a.x},${a.y},${a.dir},${a.status}`).join('|')

export function run(level: Level, arrows: Arrows): RunResult {
  let state = createState(level, arrows)
  const history = [state]
  const events: SimEvent[] = []
  const visited = new Set<number>()
  const firstVisit = new Map<number, number>()
  const firstVisitBy = state.actors.map(() => new Map<number, number>())
  const arrowsHit = new Set<number>()
  const seen = new Set([stateKey(state)])
  // A cow's path depends only on its own state and the board, so once it repeats a state
  // it will never reach a rocket: fail right away rather than waiting for every actor to cycle.
  const cowSeen = state.actors.map(a => (a.kind === 'cow' ? new Set([`${a.x},${a.y},${a.dir}`]) : null))

  for (;;) {
    const prev = state
    const res = step(level, arrows, prev)
    state = res.state
    history.push(state)
    events.push(...res.events)
    for (const e of res.events) if (e.type === 'arrow') arrowsHit.add(e.cell!)
    state.actors.forEach((a, i) => {
      if (prev.actors[i].status !== 'active' || a.x % TILE !== 0 || a.y % TILE !== 0) return
      const cell = (a.y / TILE) * level.width + a.x / TILE
      visited.add(cell)
      if (!firstVisit.has(cell)) firstVisit.set(cell, state.tick)
      if (!firstVisitBy[i].has(cell)) firstVisitBy[i].set(cell, state.tick)
    })
    const failure = res.events.find(e => FAILURES.has(e.type))
    if (failure) return { outcome: { result: 'failed', cause: failure }, history, events, visited, firstVisit, firstVisitBy, arrowsHit }
    if (state.actors.every(a => a.kind !== 'cow' || a.status === 'saved'))
      return { outcome: { result: 'won' }, history, events, visited, firstVisit, firstVisitBy, arrowsHit }
    const looping = state.actors.findIndex((a, i) => {
      if (a.kind !== 'cow' || a.status !== 'active') return false
      const k = `${a.x},${a.y},${a.dir}`
      if (cowSeen[i]!.has(k)) return true
      cowSeen[i]!.add(k)
      return false
    })
    const key = stateKey(state)
    if (looping >= 0 || seen.has(key) || state.tick >= MAX_TICKS) {
      // actor -1: the whole board cycles (or ran too long) rather than one identified cow
      const loop: SimEvent = { tick: state.tick, type: 'loop', actor: looping }
      events.push(loop)
      return { outcome: { result: 'failed', cause: loop }, history, events, visited, firstVisit, firstVisitBy, arrowsHit }
    }
    seen.add(key)
  }
}

export function canPlace(level: Level, arrows: Arrows, cell: number, dir: Dir): boolean {
  if (!Number.isInteger(cell) || cell < 0 || cell >= level.cells.length) return false
  if (level.cells[cell] !== 'empty' || arrows.has(cell)) return false
  if ([...level.cows, ...level.ufos].some(s => s.y * level.width + s.x === cell)) return false
  let used = 0
  for (const d of arrows.values()) if (d === dir) used++
  return used < level.stock[dir]
}
