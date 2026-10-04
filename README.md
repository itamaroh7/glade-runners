# Glade Runners

A fan-made, mobile-first action game inspired by *The Maze Runner*, drawn in a chunky Brawl-style look.
Everything (models, textures, sounds, music) is generated in code; no third-party game or film assets are used.

## The game

- **Morning** — plan the Glade: assign gladers to jobs (farmer, woodcutter, smith, med-jack, guard),
  build (fields, homestead, watchtower, forge) and pick your runner.
- **Day (5 min)** — the doors open. Run the maze, break crates for supplies, fight Grinders, dodge
  Scuttlers, and find the day's code piece under the light beam. Get back before the doors close.
- **Trapped?** Survive a night in the maze until dawn.
- **Evening** — farms grow food, the Glade eats, the Box sends new gladers and supplies.
- **Final day** — with all 6 code pieces, the doors stay open: defend the Glade, then reach the Grinder Hole.

Runners: Theo (spear / dash), Minjae (machete / whirlwind), Nate (stones / heal + net),
Garrick (club / ground slam), Tessa (darts / recall).

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL. Phones on the same Wi-Fi can use the "Network" URL.

URL flags: `?debug` (FPS overlay + `window.gr` test hooks), `?day=60` (shorter day, in seconds).

## Deploy

Every push to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml`.

## Controls

- Phone: left thumb runs, right thumb aims & attacks (tap = auto-aim), yellow button = Super. Tap the minimap for the full map.
- Desktop: WASD/arrows, mouse to aim, click to attack, Space/E/right-click for Super, `M` map, `Esc` pause.
