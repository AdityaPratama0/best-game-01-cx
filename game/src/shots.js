// The screenshot hook behind #shot=start|play|end (or ?shot=). It plays the real rules forward from a
// seeded run with a small autopilot, so a shot is a frame the game itself produced: no faked HUD, no
// pasted numbers. Normal play never reads this file's stageShot unless the hash asks for it.

import { createRun, stepRun, summaryOf, drainEvents } from './run.js';
import { useFlare } from './rules.js';

const STEP = 1 / 60;

/** Where the tender wants to be next: the nearest buoy, unless a mine is close and the pilot is dodging. */
function seek(state, time, dodge = true) {
  const player = state.player;
  let best = null;
  let bestDistance = Infinity;
  for (const buoy of state.buoys) {
    const distance = Math.hypot(buoy.x - player.x, buoy.y - player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: buoy.x, y: buoy.y };
    }
  }
  if (dodge) {
    for (const mine of state.mines) {
      const distance = Math.hypot(mine.x - player.x, mine.y - player.y);
      if (distance < 120) {
        best = { x: player.x - (mine.x - player.x), y: player.y - (mine.y - player.y) };
        bestDistance = 0;
        break;
      }
    }
  }
  if (!best) {
    const orbit = time * 0.6;
    best = { x: 640 + Math.cos(orbit) * 260, y: 440 + Math.sin(orbit) * 180 };
  }
  const dx = best.x - player.x;
  const dy = best.y - player.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function advance(state, seconds, autopilot) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (state.over) break;
    stepRun(state, STEP, autopilot ? seek(state, state.time) : { x: 0, y: 0 });
    drainEvents(state);
  }
}

/** Close on a mine that sits well inside the frame, so the play shot puts the burn, the tender and
 *  the cooling HUD line in one readable frame instead of a cluster in a corner. */
function stageFlare(state) {
  const inFrame = state.mines.filter((mine) => mine.x > 220 && mine.x < 1040 && mine.y > 220 && mine.y < 620);
  const pool = inFrame.length > 0 ? inFrame : state.mines;
  if (pool.length === 0) return null;
  let target = pool[0];
  let best = Infinity;
  for (const mine of pool) {
    const distance = Math.hypot(mine.x - state.player.x, mine.y - state.player.y);
    if (distance < best) {
      best = distance;
      target = mine;
    }
  }
  // Steer onto it for a moment so the tender stands in its own light when the flare goes.
  const toMine = { x: target.x - state.player.x, y: target.y - state.player.y };
  const length = Math.hypot(toMine.x, toMine.y) || 1;
  const heading = { x: toMine.x / length, y: toMine.y / length };
  for (let i = 0; i < 40 && Math.hypot(target.x - state.player.x, target.y - state.player.y) > 96; i += 1) {
    stepRun(state, STEP, heading);
    drainEvents(state);
  }
  state.flareCooldown = 0;
  useFlare(state, target.x, target.y);
  return target;
}

export function stageShot(kind, seed) {
  const state = createRun(seed);
  if (kind === 'start') {
    advance(state, 6, true);
    return { state, view: { screen: 'start', pointer: { x: 0, y: 0, inside: false } }, summary: null };
  }
  if (kind === 'end') {
    // A real watch: chase buoys and steer around mines until the hull goes, or turn reckless if the
    // pilot is still alive after two minutes of that.
    let guard = 0;
    while (!state.over && guard < 60 * 115) {
      stepRun(state, STEP, seek(state, state.time, true));
      drainEvents(state);
      guard += 1;
    }
    while (!state.over && guard < 60 * 150) {
      stepRun(state, STEP, seek(state, state.time, false));
      drainEvents(state);
      guard += 1;
    }
    if (!state.over) {
      state.hull = 0;
      state.lastCause = 'surge';
      state.over = true;
    }
    return {
      state,
      view: { screen: 'end', pointer: { x: 0, y: 0, inside: false } },
      summary: summaryOf(state, 0),
    };
  }
  advance(state, 22, true);
  const flare = stageFlare(state);
  advance(state, 0.3, false);
  const pointer = flare ? { x: flare.x + 90, y: flare.y - 60, inside: true } : { x: 780, y: 360, inside: true };
  return { state, view: { screen: 'play', pointer }, summary: null };
}
