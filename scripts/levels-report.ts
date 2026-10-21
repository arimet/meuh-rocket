// Difficulty report for every level: npm run levels
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLevel } from '../src/sim/level'
import { solve } from '../src/sim/solver'

const dir = join(import.meta.dirname, '../src/levels')
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort()
if (files.length === 0) {
  console.log('aucun niveau')
} else {
  const rows = files.map(f => {
    const level = parseLevel(JSON.parse(readFileSync(join(dir, f), 'utf8')))
    const t0 = performance.now()
    const r = solve(level)
    const stock = Object.values(level.stock).reduce((a, b) => a + b, 0)
    return {
      id: level.id,
      nom: level.name,
      idée: level.idea,
      'min flèches': r.minArrows ?? '✗ insoluble',
      stock,
      solutions: r.solutions,
      'positions essayées': r.explored,
      'temps (ms)': Math.round(performance.now() - t0),
    }
  })
  console.table(rows)
}
