import type { CellKind, Dir, Level, Spawn } from './types'

export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W']
export const DELTA: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

export const turnRight = (d: Dir): Dir => DIRS[(DIRS.indexOf(d) + 1) % 4]
export const turnLeft = (d: Dir): Dir => DIRS[(DIRS.indexOf(d) + 3) % 4]
export const reverse = (d: Dir): Dir => DIRS[(DIRS.indexOf(d) + 2) % 4]

export const cellIndex = (level: Level, x: number, y: number) => y * level.width + x

export function blocked(level: Level, x: number, y: number, dir: Dir): boolean {
  const { width: w, height: h } = level
  switch (dir) {
    case 'N': return y === 0 || level.wallN[y * w + x]
    case 'W': return x === 0 || level.wallW[y * w + x]
    case 'S': return y === h - 1 || level.wallN[(y + 1) * w + x]
    case 'E': return x === w - 1 || level.wallW[y * w + x + 1]
  }
}

const CELL_CHARS: Record<string, CellKind> = { '.': 'empty', O: 'hole', R: 'rocket' }

function fail(msg: string): never {
  throw new Error(msg)
}

const isDir = (d: unknown): d is Dir => typeof d === 'string' && (DIRS as string[]).includes(d)

export function parseLevel(json: unknown): Level {
  if (typeof json !== 'object' || json === null) fail('Niveau invalide : objet attendu')
  const j = json as Record<string, unknown>
  const grid = j.grid
  if (!Array.isArray(grid) || grid.length < 3 || grid.length % 2 === 0 || !grid.every(r => typeof r === 'string'))
    fail('Grille invalide : nombre impair de lignes attendu')
  const rows = grid as string[]
  const lineLen = rows[0].length
  if (lineLen < 3 || lineLen % 2 === 0) fail('Grille invalide : nombre impair de colonnes attendu')
  rows.forEach((r, i) => { if (r.length !== lineLen) fail(`Ligne ${i + 1} : longueur ${r.length}, attendu ${lineLen}`) })

  const width = (lineLen - 1) / 2
  const height = (rows.length - 1) / 2
  const cells: CellKind[] = []
  const pairs: Record<string, number[]> = {}
  const wallN: boolean[] = []
  const wallW: boolean[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = rows[2 * y + 1][2 * x + 1]
      const kind = /[1-9]/.test(c) ? 'portal' : CELL_CHARS[c]
      if (kind === 'portal') (pairs[c] ??= []).push(y * width + x)
      if (!kind) fail(`Case (${x}, ${y}) : caractère inconnu « ${c} »`)
      cells.push(kind)
      wallN.push(rows[2 * y][2 * x + 1] === '-')
      wallW.push(rows[2 * y + 1][2 * x] === '|')
    }
  }
  const portals = cells.map(() => -1)
  for (const [digit, at] of Object.entries(pairs)) {
    if (at.length !== 2) fail(`Téléporteur « ${digit} » : ${at.length} case(s), il en faut exactement 2`)
    portals[at[0]] = at[1]
    portals[at[1]] = at[0]
  }
  for (let x = 0; x < width; x++) {
    if (rows[0][2 * x + 1] !== '-') fail(`Mur de bord manquant en ligne 1, case ${x}`)
    if (rows[2 * height][2 * x + 1] !== '-') fail(`Mur de bord manquant en ligne ${2 * height + 1}, case ${x}`)
  }
  for (let y = 0; y < height; y++) {
    if (rows[2 * y + 1][0] !== '|') fail(`Mur de bord manquant en ligne ${2 * y + 2}, à gauche`)
    if (rows[2 * y + 1][2 * width] !== '|') fail(`Mur de bord manquant en ligne ${2 * y + 2}, à droite`)
  }

  const spawns = (key: string): Spawn[] => {
    const list = j[key] ?? []
    if (!Array.isArray(list)) fail(`« ${key} » doit être une liste`)
    return list.map((s, i) => {
      if (!Array.isArray(s) || s.length !== 3) fail(`${key}[${i}] : [x, y, direction] attendu`)
      const [x, y, dir] = s
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height)
        fail(`${key}[${i}] : hors de la grille`)
      if (!isDir(dir)) fail(`${key}[${i}] : direction « ${dir} » inconnue`)
      if (cells[y * width + x] !== 'empty') fail(`${key}[${i}] : départ sur un trou ou une fusée`)
      return { x, y, dir }
    })
  }

  const rawStock = (j.stock ?? {}) as Record<string, unknown>
  const stock = {} as Record<Dir, number>
  for (const d of DIRS) {
    const n = rawStock[d] ?? 0
    if (!Number.isInteger(n) || (n as number) < 0) fail(`Stock « ${d} » invalide`)
    stock[d] = n as number
  }

  let solution: Map<number, Dir> | undefined
  if (j.solution !== undefined) {
    if (!Array.isArray(j.solution)) fail('« solution » doit être une liste')
    solution = new Map()
    for (const [i, s] of (j.solution as unknown[]).entries()) {
      if (!Array.isArray(s) || s.length !== 3) fail(`solution[${i}] : [x, y, direction] attendu`)
      const [x, y, dir] = s
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) fail(`solution[${i}] : hors de la grille`)
      if (!isDir(dir)) fail(`solution[${i}] : direction « ${dir} » inconnue`)
      solution.set(y * width + x, dir)
    }
  }

  return {
    id: Number(j.id ?? 0),
    name: String(j.name ?? ''),
    idea: String(j.idea ?? ''),
    width,
    height,
    cells,
    wallN,
    wallW,
    portals,
    cows: spawns('cows'),
    ufos: spawns('ufos'),
    stock,
    solution,
  }
}
