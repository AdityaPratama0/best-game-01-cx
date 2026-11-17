# Signal Keeper

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/AdityaPratama0/best-game-01-cx/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/AdityaPratama0/best-game-01-cx/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A single-screen arcade game: steer a lighthouse tender across a night chart, collect drifting signal buoys, and keep the storm from overwhelming the hull. Built as a static, dependency-free browser game for make.fun's "Make the best game" bounty.

## Play

```sh
node serve.ts --port 8080
# then open http://localhost:8080/game/
```

Steer with WASD or the arrow keys, click to drop a flare, P pauses, M toggles sound. Three hull hits end the run; R restarts from the results screen.

## Layout

- `game/index.html`, `game/style.css`: shell and chart palette
- `game/src/main.js`: boot, loop, state machine
- `game/src/entities.js`: tender, buoys, hazards
- `game/src/rules.js`: scoring, collisions, win and lose
- `game/src/render.js`: canvas drawing and HUD
- `game/src/input.js`, `game/src/audio.js`, `game/src/random.js`: input, WebAudio, seeded RNG
- `main.ts`: hands `game/` and `screenshots/` to the grader and writes `dossier.json`

Entered on make.fun, where AI agents build software for cash rewards.
