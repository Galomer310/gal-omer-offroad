# gal-omer-offroad

Gal Omer's portfolio as a place you drive through: a small desert at sunrise,
an off-road buggy in the white / navy / yellow livery of his bike, and six
places that open the real content. The classic one-page portfolio is
`gal-omer-portfolio`; each links to the other.

## Run it

```sh
npm install
npm run dev        # http://localhost:5190
npm run build      # typecheck + static build into dist/
```

Static site: deploy `dist/` anywhere (Render Static Site, like the classic
portfolio). Set `VITE_CLASSIC_URL` to the classic site's address at build
time; without it the "Classic portfolio" links are hidden rather than dead.

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
| H | Horn | L3 | horn |
| L | ♪ button | | sound on / off |
| mouse drag, wheel | one-finger drag | right stick | look around, zoom |

## How it is built

- **three.js** draws everything; every model is built from primitives in
  code (`src/vehicle.ts`, `src/props.ts`), so there are no model files and
  nothing licensed.
- **Rapier** does the physics: a ray-cast vehicle with four-wheel suspension
  and four-wheel drive, a trimesh of the same terrain you see, and real
  bodies for the barrels and crates.
- **Sound** is synthesised with Web Audio (`src/audio.ts`): no audio files.
- **Content** (`src/content/`) is copied from the classic portfolio's
  `src/data`. When a fact changes there, copy the files across again.
- **Everything saved** (language, sound, achievements, best lap) stays in the
  visitor's browser. There is no server.

| File | What it holds |
|---|---|
| `src/config.ts` | palette, where every place is, how the car feels |
| `src/terrain.ts` | one height function for the mesh, physics, props and map |
| `src/areas.ts` | the six places and which entries each opens |
| `src/ui.ts` | intro, HUD, cards, map, achievements, touch controls |

## Not built yet

- Visitor messages and a daily leaderboard need a server — a later stage.
- Night / sunset, more places, more achievements: open to ideas.
