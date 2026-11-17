// The watch rules, kept apart from motion and paint: how fast the front closes, what a buoy is
// worth, when a chain multiplies, what a flare burns, and what a strike costs. Every function
// here mutates the run state it is handed and reports what happened on state.events, which the
// sound layer drains once a frame.

export const RULES = {
  STEP: 1 / 60,
  HULL_MAX: 3,
  PLAYER_RADIUS: 14,
  BUOY_RADIUS: 10,
  MINE_RADIUS: 12,
  PICKUP_RADIUS: 30,
  STRIKE_RADIUS: 26,
  FLARE_RADIUS: 146,
  FLARE_COOLDOWN: 4.6,
  FLARE_LIFE: 1.5,
  BUOY_POINTS: 10,
  MINE_POINTS: 25,
  STORM_RELIEF: 2,
  STORM_START: 22,
  STORM_SURGE_TO: 58,
  STORM_PER_MINE: 5,
  COMBO_WINDOW: 3.4,
  COMBO_MAX: 5,
  INVULN: 1.9,
  ISLAND_CLEARANCE: 30,
};

export function emit(state, event) {
  if (state.events.length < 64) state.events.push(event);
}

/** The multiplier a chain of `combo` collected buoys is worth: x1, x1, x2, x2, x3, ... x5. */
export function multiplierFor(combo) {
  if (combo <= 0) return 1;
  return Math.min(RULES.COMBO_MAX, 1 + Math.floor((combo - 1) / 2));
}

/** Percentage points of storm pressure added per second; the front speeds up as a run goes on. */
export function stormRate(state) {
  return 2.4 + Math.min(2.2, state.elapsed * 0.02);
}

/** Close the front. At full pressure it breaks over the tender: one hull, then it falls back. */
export function advanceStorm(state, dt) {
  if (state.elapsed < 1.5 || state.over) return;
  state.storm = Math.min(100, state.storm + stormRate(state) * dt);
  if (state.storm >= 100) {
    state.storm = RULES.STORM_SURGE_TO;
    strikeHull(state, 'surge');
  }
}

/** Take one hull point, whatever the cause. The tender blinks clear of further strikes for a moment. */
export function strikeHull(state, cause) {
  if (state.invuln > 0 || state.over) return;
  state.hull = Math.max(0, state.hull - 1);
  state.lastCause = cause;
  state.invuln = RULES.INVULN;
  state.combo = 0;
  state.comboTimer = 0;
  state.shake = 1;
  emit(state, { type: cause === 'surge' ? 'surge' : 'hit', x: state.player.x, y: state.player.y });
  if (state.hull === 0) {
    state.over = true;
    emit(state, { type: 'over', x: state.player.x, y: state.player.y });
  }
}

/** Pick up every buoy the tender is touching. The chain timer is the only thing that decays; a boom
 *  chain is worth x2 to x5 and each buoy also eases the front by a few points. */
export function collectBuoys(state) {
  const player = state.player;
  for (let i = state.buoys.length - 1; i >= 0; i -= 1) {
    const buoy = state.buoys[i];
    const dx = buoy.x - player.x;
    const dy = buoy.y - player.y;
    if (dx * dx + dy * dy > RULES.PICKUP_RADIUS * RULES.PICKUP_RADIUS) continue;
    state.buoys.splice(i, 1);
    state.combo += 1;
    state.comboTimer = RULES.COMBO_WINDOW;
    const mult = multiplierFor(state.combo);
    const gained = RULES.BUOY_POINTS * mult;
    state.score += gained;
    state.buoysCollected += 1;
    state.storm = Math.max(0, state.storm - RULES.STORM_RELIEF);
    emit(state, { type: 'buoy', x: buoy.x, y: buoy.y, gained, mult });
  }
}

/** Mines strike the hull; a strike removes the mine. While blinking, the tender passes through. */
export function strikeMines(state) {
  if (state.invuln > 0 || state.over) return;
  const player = state.player;
  for (let i = 0; i < state.mines.length; i += 1) {
    const mine = state.mines[i];
    const dx = mine.x - player.x;
    const dy = mine.y - player.y;
    if (dx * dx + dy * dy > RULES.STRIKE_RADIUS * RULES.STRIKE_RADIUS) continue;
    state.mines.splice(i, 1);
    state.storm = Math.min(99, state.storm + RULES.STORM_PER_MINE);
    emit(state, { type: 'minebreak', x: mine.x, y: mine.y });
    strikeHull(state, 'mine');
    return;
  }
}

/** A flare burns out every mine in its light and pays for each one. Its cooldown is the whole cost. */
export function useFlare(state, x, y) {
  if (state.over || state.flareCooldown > 0) return false;
  state.flareCooldown = RULES.FLARE_COOLDOWN;
  state.flares.push({ x, y, life: RULES.FLARE_LIFE, age: 0 });
  let burned = 0;
  for (let i = state.mines.length - 1; i >= 0; i -= 1) {
    const mine = state.mines[i];
    const dx = mine.x - x;
    const dy = mine.y - y;
    if (dx * dx + dy * dy > RULES.FLARE_RADIUS * RULES.FLARE_RADIUS) continue;
    state.mines.splice(i, 1);
    state.score += RULES.MINE_POINTS;
    state.scorches.push({ x: mine.x, y: mine.y, life: 1.5 });
    burned += 1;
    emit(state, { type: 'burn', x: mine.x, y: mine.y });
  }
  emit(state, { type: 'flare', x, y, burned });
  return true;
}

export function tickTimers(state, dt) {
  for (const scorch of state.scorches) scorch.life -= dt;
  state.scorches = state.scorches.filter((scorch) => scorch.life > 0);
  state.invuln = Math.max(0, state.invuln - dt);
  state.flareCooldown = Math.max(0, state.flareCooldown - dt);
  if (state.comboTimer > 0) {
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    if (state.comboTimer === 0) state.combo = 0;
  }
  state.shake = Math.max(0, state.shake - dt * 2.4);
}

export function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(whole / 60)).padStart(2, '0');
  const ss = String(whole % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function formatScore(score) {
  return String(Math.max(0, Math.floor(score))).padStart(4, '0');
}
