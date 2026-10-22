import type { Dir } from '../sim/types'

export type Lang = 'fr' | 'en'
export type Text = Record<Lang, string> // a text shipped in both languages (level and world names)

export const LANGS: readonly Lang[] = ['fr', 'en']
export const LANG_KEY = 'meuh-rocket:lang'

// A saved choice wins; otherwise French for French-speaking browsers, English for everyone else.
export function detectLang(saved: string | null, browser: readonly string[]): Lang {
  if (saved === 'fr' || saved === 'en') return saved
  return browser.some(l => l.toLowerCase().startsWith('fr')) ? 'fr' : 'en'
}

// French counts 0 and 1 as singular, English only 1
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`
const pluralEn = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const fr = {
  switchTo: 'English',
  switchLabel: 'Play in English',
  tagline: 'Guide les vaches jusqu’à la fusée avant que les ovnis ne les enlèvent.',
  play: 'Jouer',
  prevWorld: 'Monde précédent',
  nextWorld: 'Monde suivant',
  world: (id: number, name: string) => `Monde ${id} · ${name}`,
  worldLocked: (prev: number, name: string) => `Termine le monde ${prev} pour ouvrir ${name}.`,
  level: (id: number) => `Niveau ${id}`,
  crate: (id: number, name: string | null, stars: number | null) =>
    `Niveau ${id} : ${name ?? 'verrouillé'}${stars === null ? '' : `, réussi, ${plural(stars, 'étoile')}`}`,
  stars: (n: number) => `${plural(n, 'étoile')} sur 3`,
  showHint: 'Afficher la consigne',
  arrowsLeft: 'Flèches restantes',
  arrowStock: (n: number, d: Dir) => `${plural(n, 'flèche')} ${({ N: 'vers le haut', E: 'vers la droite', S: 'vers le bas', W: 'vers la gauche' })[d]}`,
  arrow: (d: Dir) => ({ N: 'Flèche vers le haut', E: 'Flèche vers la droite', S: 'Flèche vers le bas', W: 'Flèche vers la gauche' })[d],
  clear: 'Retirer les flèches',
  solution: 'Solution',
  showSolution: 'Afficher la solution',
  menu: 'Menu',
  launch: 'Lancer',
  stop: 'Stop',
  speed: (n: number) => `Vitesse ×${n} (touche F)`,
  soundOn: 'Activer le son',
  soundOff: 'Couper le son',
  confirmTitle: 'Afficher la solution ?',
  confirmText: 'Tu pourras toujours finir le niveau, mais tu ne gagneras pas d’étoile cette fois.',
  confirmYes: 'Afficher',
  cancel: 'Annuler',
  nextLevel: 'Niveau suivant',
  missionDone: 'Mission accomplie',
  excellent: 'Excellent !',
  wellDone: 'Bravo !',
  usedSolution: 'Solution utilisée : pas d’étoile cette fois.',
  aboardFewer: 'Toutes les vaches sont à bord, avec moins de flèches que prévu.',
  aboard: 'Toutes les vaches sont à bord.',
  worldDone: (next: string | null) => next ? `Monde terminé ! Direction ${next}.` : 'Monde terminé !',
  portrait: 'Tourne ton téléphone pour jouer',
  fps: 'i/s',
}

export type Strings = typeof fr

const en: Strings = {
  switchTo: 'Français',
  switchLabel: 'Jouer en français',
  tagline: 'Guide the cows to the rocket before the UFOs beam them up.',
  play: 'Play',
  prevWorld: 'Previous world',
  nextWorld: 'Next world',
  world: (id, name) => `World ${id} · ${name}`,
  worldLocked: (prev, name) => `Finish world ${prev} to open ${name}.`,
  level: id => `Level ${id}`,
  crate: (id, name, stars) => `Level ${id}: ${name ?? 'locked'}${stars === null ? '' : `, cleared, ${pluralEn(stars, 'star')}`}`,
  stars: n => `${pluralEn(n, 'star')} out of 3`,
  showHint: 'Show the hint',
  arrowsLeft: 'Arrows left',
  arrowStock: (n, d) => `${pluralEn(n, 'arrow')} pointing ${({ N: 'up', E: 'right', S: 'down', W: 'left' })[d]}`,
  arrow: d => `Arrow pointing ${({ N: 'up', E: 'right', S: 'down', W: 'left' })[d]}`,
  clear: 'Remove arrows',
  solution: 'Solution',
  showSolution: 'Show the solution',
  menu: 'Menu',
  launch: 'Launch',
  stop: 'Stop',
  speed: n => `Speed ×${n} (F key)`,
  soundOn: 'Turn sound on',
  soundOff: 'Mute',
  confirmTitle: 'Show the solution?',
  confirmText: 'You can still finish the level, but you won’t earn a star this time.',
  confirmYes: 'Show',
  cancel: 'Cancel',
  nextLevel: 'Next level',
  missionDone: 'Mission complete',
  excellent: 'Excellent!',
  wellDone: 'Well done!',
  usedSolution: 'Solution used: no star this time.',
  aboardFewer: 'Every cow is aboard, with fewer arrows than planned.',
  aboard: 'Every cow is aboard.',
  worldDone: next => next ? `World complete! Next stop: ${next}.` : 'World complete!',
  portrait: 'Turn your phone to play',
  fps: 'fps',
}

const DICT: Record<Lang, Strings> = { fr, en }

let lang: Lang = (() => {
  let saved: string | null = null
  try { saved = localStorage.getItem(LANG_KEY) } catch { /* private mode */ }
  return detectLang(saved, typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language])
})()

export const getLang = () => lang
export const t = (): Strings => DICT[lang]
export const pick = (text: Text) => text[lang]

export function setLang(next: Lang): void {
  lang = next
  document.documentElement.lang = next
  try { localStorage.setItem(LANG_KEY, next) } catch { /* not persisted */ }
}
