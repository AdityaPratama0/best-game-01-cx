// The run state and its one fixed step: make a fresh sea, then advance it by 1/60 s with the steering
// the caller gives. Spawning, pressure, pickups and strikes live here so both the live loop and the
// screenshot staging drive exactly the same rules, with no second copy to drift out of tune.

import { createIslands, createPlayer, spawnBuoy, spawnMine, stepEntities, WORLD } from './entities.js';
import { advanceStorm, collectBuoys, RULES, strikeMines, tickTimers } from './rules.js';
import { createRandom } from './random.js';

const BUOY_COUNT = 5;
const MINE_BASE = 2;

export function createRun(seed) {
  const rng = createRandom(seed);
  const state = {
    seed,
    rng,
    time: 0,
    elapsed: 0,
    over: false,
    lastCause: 'mine',
    score: 0,
    hull: RULES.HULL_MAX,
    storm: RULES.STORM_START,
    stormPeak: RULES.STORM_START,
    buoysCollected: 0,
    combo: 0,
    comboTimer: 0,
    flareCooldown: 0,
    invuln: 0,
    shake: 0,
    player: createPlayer(),
    islands: [],
    buoys: [],
    mines: [],
    flares: [],
    scorches: [],
    floaters: [],
    events: [],
  };
  state.islands = createIslands(rng);
  for (let i = 0; i < BUOY_COUNT; i += 1) state.buoys.push(spawnBuoy(rng, state.islands, i === 0 ? state.player : null));
  for (let i = 0; i < MINE_BASE; i += 1) state.mines.push(spawnMine(rng, state.islands, state.player));
  return state;
}

export function mineTarget(state) {
  return Math.min(12, MINE_BASE + Math.floor(state.elapsed / 11));
}

export function stepRun(state, dt, direction) {
  if (state.over) return;
  state.elapsed += dt;
  state.time += dt;

  stepEntities(state, dt, direction);
  collectBuoys(state);
  strikeMines(state);
  advanceStorm(state, dt);
  tickTimers(state, dt);

  if (state.storm > state.stormPeak) state.stormPeak = state.storm;

  for (const floater of state.floaters) floater.life -= dt;
  state.floaters = state.floaters.filter((floater) => floater.life > 0);

  while (state.buoys.length < BUOY_COUNT) {
    state.buoys.push(spawnBuoy(state.rng, state.islands, state.player));
  }
  if (state.mines.length < mineTarget(state)) {
    state.mines.push(spawnMine(state.rng, state.islands, state.player));
  }
}

/** Events are drained once a frame by main: sound, floaters and the red flash are reactions, not rules. */
export function drainEvents(state) {
  const events = state.events;
  state.events = [];
  return events;
}

export function summaryOf(state, best) {
  const reasons = {
    mine: 'A mine took the last of the hull. The tender is lost.',
    surge: 'The front broke over the light. The watch is over.',
  };
  return {
    title: state.lastCause === 'surge' ? 'Storm takes the light' : 'Signal lost',
    reason: reasons[state.lastCause] ?? reasons.mine,
    score: state.score,
    buoys: state.buoysCollected,
    time: state.elapsed,
    storm: state.stormPeak,
    best: Math.max(best, state.score),
    record: state.score > best,
  };
}

export { WORLD };
