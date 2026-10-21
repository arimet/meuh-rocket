// Difficulty report for every level: npm run levels
// npm run levels -- --write  also stores the solver's solution in each level file
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLevel } from '../src/sim/level'
import { solve } from '../src/sim/solver'

const dir = join(import.meta.dirname, '../src/levels')
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort()
if (files.length === 0) {
  console.log('aucun niveau')
} else {
  const rows = files.map(f => {
    const raw = readFileSync(join(dir, f), 'utf8')
    const level = parseLevel(JSON.parse(raw))
    const t0 = performance.now()
    const r = solve(level)
    if (process.argv.includes('--write') && r.example) {
      const sol = [...r.example].map(([c, d]) => `[${c % level.width}, ${Math.floor(c / level.width)}, "${d}"]`).join(', ')
      const body = raw.replace(/,\n  "solution": \[[^\n]*\]/, '').replace(/\n}\s*$/, `,\n  "solution": [${sol}]\n}\n`)
      writeFileSync(join(dir, f), body)
    }
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
