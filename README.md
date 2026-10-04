# Balloon Blitz V3 — Sky Realms

A standalone, offline-friendly balloon-popping arcade. V3 keeps its lightweight canvas engine, warm sky-and-paper art direction, normalized local saves, accessible menus, and honest personal records while bringing V2's complete player-facing stage content and campaign mechanics into the V3 experience.

## Game modes

- **Blitz:** a 60-second score run with combos, golden balloons, bombs, fever scoring, and collectible powerups.
- **Survival:** keep popping before balloons drift away; three lives and an escalating pace.
- **Campaign:** all **600 V2 stages across 24 themed worlds**, with the original 25-stage world boundaries and mission data. Pop, color, gold, bomb, shield, freeze, sequence, escort, mid-boss, and boss goals are backed by V2's move budgets, hazards, shield breaks, wind, stage speed, escort health, and boss HP. The stage HUD shows the exact objective and progress.
- **Puzzle:** all **50 V2 directional chain puzzles**, including multi-ray arrows, limited darts, bomb blasts, and freeze-themed directional arrows. Three imported late-game layouts receive small connector-position repairs where the original geometry otherwise blocked every advertised solution.
- **Slingshot:** all **50 V2 target layouts**, with limited arrows, piercing physics, bombs, gold targets, and eight HP boss stages.

## Progression and player features

- Campaign, puzzle, and slingshot maps unlock the next stage when the current stage is cleared; campaign worlds are browsable in 25-stage pages, and best results award up to three stars.
- Local coins and XP, six achievements, a seven-day daily gift cycle, and three daily missions.
- A cosmetic-only balloon skin and pop-effect shop using earnable coins or daily gems; no ads or real-money purchases.
- Editable player name and avatar, level/rank display, and personal bests per mode.
- Settings for sound, haptics, reduced effects, and local progress reset.
- Versioned, normalized, debounced local saves; pause/resume and visibility recovery; offline caching includes the full campaign catalog; browser zoom remains available.

## What remains V3-specific

- The V3 **Sky Realms** identity, warm storybook UI, and lightweight canvas presentation.
- The supplied bubble-button atlas, cropped into compact local sprites for play, navigation, campaign, and game controls; all are bundled for offline use.
- V3's versioned, device-local save format and personal-record screens; scores remain local rather than being represented as an online leaderboard.
- The objective-matched accessible campaign progress bar, protected canvas pointer routing, and personal-best detection-before-save behavior retained on the existing campaign-progress PR branch.

## Run locally

Serve the repository over HTTP, then open it in a modern browser:

```bash
python3 -m http.server 8080
```

## Verify

```bash
npm test
```


## Runtime structure

The browser entry in `js/app.js` only boots the application. The composition root in `js/game/application.js` coordinates a run and connects the UI to services; reusable rules and platform work live outside it:

- `js/core/progression.js` contains pure unlock, campaign-objective, star, streak, and payout rules.
- `js/modes/` owns the V2-derived campaign, puzzle, slingshot, world, cosmetic, achievement, and daily-mission content.
- `js/persistence/save-store.js` owns the versioned local save key, normalization, debounced writes, and page lifecycle flushing.
- `js/input/game-input.js` owns canvas pointer, drag, slingshot aim/release, Escape pause, and background-pause listeners.
- `js/ui/canvas-renderer.js` owns canvas drawing; it receives a read-only frame model and does not access screens or saved data.
- `assets/ui/` remains the source of local UI sprites; `sw.js` caches the full runtime module graph for offline play.

The module tests cover progression and save contracts, input routing, and architectural boundaries; the static suite still validates every campaign stage, puzzle solution, slingshot layout, accessible UI contract, and offline asset.
