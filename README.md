# Balloon Blitz V3

A clean, standalone production baseline for Balloon Blitz. The V2 repository remains untouched.

## Features
- Blitz, Survival, and 30-stage Campaign modes
- Responsive canvas gameplay with keyboard-accessible menus
- Versioned, normalized, debounced local saves
- Honest atomic score/coin/XP settlement
- Pause, restart, resume, visibility recovery, sound and haptic controls
- Reduced-effects mode and browser zoom support
- Atomic offline shell caching
- Runtime error reporting and automated static verification

## Run locally
Serve the repository over HTTP, then open it in a modern browser.

```bash
python3 -m http.server 8080
```

## Verify

```bash
npm test
```

## Scope
V3 intentionally removes fake global leaderboards, placeholder advertising, duplicate audio engines, hidden game modes, runtime monkey-patch layers, and retired stylesheets. Online accounts, cloud saves, competitive leaderboards, and monetization require a real backend and are not misrepresented as completed features.
