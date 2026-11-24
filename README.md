# gal-omer-offroad

Gal Omer's portfolio as a place you drive through: a small desert, an
off-road buggy in the white / navy / yellow livery of his bike, and eight
places — six that open the real content, a playground, and a guestbook. The
classic one-page portfolio is `gal-omer-portfolio`; each links to the other.

## Run it

```sh
npm install
npm run dev                  # the site, http://localhost:5190

cd server && npm install
npm run dev                  # the API, http://localhost:8790 (in-memory database)
npm test                     # API tests, no database to install
```

Without the API running the site still works; the guestbook and lap board
say "offline". Deploying: see [DEPLOY.md](DEPLOY.md) (Render Blueprint + Neon).

## Controls

| Keyboard | Phone | Gamepad | |
|---|---|---|---|
| W A S D / arrows | joystick | left stick, RT / LT | drive |
| Shift | Boost | B | boost |
| Space | Jump | A | jump |
| B / Ctrl | Brake | X | brake |
| Enter | tap the prompt | Y | open the place you stopped in |
| M | M button | Select | map |
| R | R button | Start | back to the nearest place |
| N | ☀ button | | time of day: sunrise, noon, sunset |
| T | ↺ button | | put knocked-over things back |
| H | Horn | L3 | horn |
| L | ♪ button | | music on / off |
| mouse drag, wheel | one-finger drag | right stick | look around, zoom |

## How it is built

- **three.js** draws everything; every model is built from primitives in
  code (`src/vehicle.ts`, `src/props.ts`, `src/toys.ts`), so there are no
  model files and nothing licensed.
- **Rapier** does the physics: a ray-cast vehicle with four-wheel suspension
  and drive, a trimesh of the same terrain you see, and real bodies for
  everything you can knock over. Its WebAssembly ships as its own file.
- **The body sway** is a visual spring on top of the physics
  (`VEHICLE.sway*` in `src/config.ts`): the body leans out of turns and
  pitches on throttle and brake without making the physics less stable.
- **Music** is generative and synthesised with Web Audio (`src/audio.ts`): a
  pad, a bass and a pentatonic melody in D major, no audio files.
- **Loading**: `src/main.ts` is tiny; it shows the loading screen, checks the
  browser can draw WebGL, and only then loads `src/game.ts`, three.js and the
  physics, so a browser that cannot never downloads them.
- **Content** (`src/content/`) is copied from the classic portfolio's
  `src/data`. When a fact changes there, copy the files across again.
- **Saved in the browser only**: language, music, achievements, personal best.
- **Saved on the server** (`server/`): guestbook messages and lap times with
  the names visitors typed. Never the IP address — only a salted hash of it,
  for rate limits.

| File | What it holds |
|---|---|
| `src/config.ts` | palette, where every place is, how the car feels |
| `src/terrain.ts` | one height function for the mesh, physics, props and map |
| `src/areas.ts` | the places and what each one opens |
| `src/toys.ts` | bowling pins, the goal, cube walls, beach balls |
| `src/sky.ts` | sunrise / noon / sunset and the light that goes with them |
| `src/social.ts` | guestbook and lap board, talking to `server/` |
| `src/ui.ts` | intro, HUD, cards, map, achievements, touch controls |
| `server/src/app.js` | the API: five routes, validation, rate limits |
