# Meuh Rocket!

A browser puzzle game in the spirit of *ChuChu Rocket!*'s puzzle mode: cows walk in straight lines, turn right at walls and follow the arrows you lay down. Get every cow into the escape rocket before a UFO beams one up. Voxel diorama, Three.js, no server.

Three worlds, unlocked in order: ten levels, ten levels, then twenty. The interface is in French.

- **World 1, *La ferme***: the tutorial — arrows, walls, holes, UFOs.
- **World 2, *Roswell, 1947***: a night desert around a crashed saucer, built on teleporters.
- **World 3, *Le vaisseau-mère***: inside the mothership, hard boards with many cows and four to seven arrows, each one needed.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # simulation, solver, levels, UI logic
npm run build    # static site in dist/
```

URL options: `?fps` shows a frame counter and `?quality=high|low` forces a renderer tier (both also work on the published site). In dev only, `?level=N` opens a level directly and `?level=5&demo=cause&t=0.5` freezes a failure scene; `gallery.html` shows the voxel models.

## Deploy

`.github/workflows/deploy.yml` tests, builds and publishes `dist/` to GitHub Pages on every push to `main`. In the repository settings, set Pages to *Source: GitHub Actions*. The build uses relative URLs, so it works under `/meuh-rocket/`.

## Rules

- Cows and UFOs move tile to tile at a constant speed (UFOs are slower).
- At a tile centre: an arrow sets the direction; then if a wall blocks the way, turn right, else left, else back.
- A cow that reaches a rocket is saved; one that falls in a hole or meets a UFO is lost. A UFO that enters a rocket loses the level; one that falls in a hole just disappears.
- Teleporters come in pairs: a creature (cow or UFO) entering one comes out of its twin with the same heading, then the wall rule applies. Arrows cannot go on a teleporter.
- Each level gives a stock of arrows per direction. Winning with fewer arrows than the stock shows *Excellent !*.
- Stars: 3 on the first launch, 2 within three launches, 1 after that, none if the solution was shown.

The simulation is deterministic and runs ahead of the renderer, which plays it back, rewinds it on failure and fast-forwards it on request.

## Levels

One JSON file per level in `src/levels/`; ids 1–10 are world 1, 11–20 world 2 and 21–40 world 3 (`WORLDS` in `src/levels/index.ts` names them and picks their theme):

```json
{
  "id": 1,
  "name": "Premier pas",
  "idea": "Pose une flèche pour guider la vache jusqu’à la fusée.",
  "grid": ["+-+-+-+", "|. . .|", "+ +-+ +", "|R . O|", "+-+-+-+"],
  "cows": [[0, 0, "E"]],
  "ufos": [],
  "stock": { "N": 0, "E": 0, "S": 0, "W": 1 },
  "solution": [[2, 0, "W"]]
}
```

`grid` has `2H+1` rows of `2W+1` characters: odd rows and columns are tiles (`.` empty, `O` hole, `R` rocket, a digit `1`–`9` for a teleporter, each digit used exactly twice), `-` and `|` between them are walls, and the border must be walled. Spawns are `[x, y, direction]` with `y` going down.

`npm run levels` prints each level's difficulty (minimum arrows, number of solutions, positions searched). `npm run levels -- --write` also stores the solver's solution in each file, which the in-game *Solution* button uses. The tests check that every level is solvable, fails without arrows, teaches its idea and that its stored solution wins.

## Credits

Inspired by *ChuChu Rocket!* (Sonic Team, 1999). Not affiliated with Sega. Boards, models and sounds are original; models are drawn in code, sounds are synthesised with Web Audio, the font is [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) (OFL).
