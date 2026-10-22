import { parseLevel } from '../src/sim/level'
import type { Dir, Level } from '../src/sim/types'

type SpawnTuple = [number, number, Dir]

export function lvl(
  grid: string[],
  extra: { cows?: SpawnTuple[]; ufos?: SpawnTuple[]; stock?: Partial<Record<Dir, number>> } = {},
): Level {
  return parseLevel({
    id: 0,
    name: { fr: 'test', en: 'test' },
    idea: { fr: 'test', en: 'test' },
    grid,
    cows: extra.cows ?? [],
    ufos: extra.ufos ?? [],
    stock: { N: 0, E: 0, S: 0, W: 0, ...extra.stock },
  })
}
