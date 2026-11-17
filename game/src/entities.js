// The tender, the buoys, the mines, the flare lights and the sea furniture (islands and the grid
// lines that scroll under the tender). Layout is made once per run into the run state; motion is
// per fixed step and never reads the keyboard or the canvas.

import { RULES } from './rules.js';
import { between, pick } from './random.js';

export const WORLD = { width: 1280, height: 800 };

const ISLAND_SHAPES = [
  [[0.5, 0.04], [0.92, 0.3], [0.8, 0.78], [0.3, 0.94], [0.06, 0.55], [0.16, 0.18]],
  [[0.18, 0.16], [0.7, 0.05], [0.96, 0.42], [0.78, 0.9], [0.28, 0.84], [0.04, 0.5]],
  [[0.34, 0.03], [0.86, 0.14], [0.95, 0.62], [0.56, 0.95], [0.1, 0.74], [0.12, 0.26]],
];

export function createPlayer() {
  return {
    x: WORLD.width * 0.5,
    y: WORLD.height * 0.62,
    vx: 0,
    vy: 0,
    heading: -Math.PI / 2,
    speed: 268,
    radius: RULES.PLAYER_RADIUS,
    trail: [],
  };
}

/** Six islands, placed clear of the tender's start and of each other, sized so the channels stay wide. */
export function createIslands(rng) {
  const islands = [];
  const start = { x: WORLD.width * 0.5, y: WORLD.height * 0.62 };
  for (let attempt = 0; attempt < 240 && islands.length < 6; attempt += 1) {
    const radius = between(rng, 42, 84);
    const x = between(rng, 90, WORLD.width - 90);
    const y = between(rng, 150, WORLD.height - 80);
    if (Math.hypot(x - start.x, y - start.y) < 200 + radius) continue;
    if (islands.some((island) => Math.hypot(x - island.x, y - island.y) < radius + island.radius + 130)) continue;
    islands.push({ x, y, radius, shape: pick(rng, ISLAND_SHAPES), spin: between(rng, 0, Math.PI * 2) });
  }
  return islands;
}

/** Keep a point out of every island, by pushing it along the shortest way out. */
export function clearOfIslands(point, islands, margin) {
  for (const island of islands) {
    const dx = point.x - island.x;
    const dy = point.y - island.y;
    const distance = Math.hypot(dx, dy);
    const minimum = island.radius + margin;
    if (distance < minimum && distance > 0.001) {
      point.x = island.x + (dx / distance) * minimum;
      point.y = island.y + (dy / distance) * minimum;
    } else if (distance <= 0.001) {
      point.x = island.x + minimum;
    }
  }
}

export function spawnBuoy(rng, islands, avoid) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const buoy = {
      x: between(rng, 70, WORLD.width - 70),
      y: between(rng, 170, WORLD.height - 60),
      phase: between(rng, 0, Math.PI * 2),
      drift: between(rng, 0.28, 0.62),
      spin: between(rng, -0.4, 0.4),
    };
    if (avoid && Math.hypot(buoy.x - avoid.x, buoy.y - avoid.y) < 120) continue;
    if (islands.some((island) => Math.hypot(buoy.x - island.x, buoy.y - island.y) < island.radius + 46)) continue;
    return buoy;
  }
  return { x: WORLD.width / 2, y: 220, phase: 0, drift: 0.4, spin: 0 };
}

export function spawnMine(rng, islands, avoid) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const mine = {
      x: between(rng, 60, WORLD.width - 60),
      y: between(rng, 170, WORLD.height - 50),
      phase: between(rng, 0, Math.PI * 2),
      armed: between(rng, 0.2, 1),
    };
    if (avoid && Math.hypot(mine.x - avoid.x, mine.y - avoid.y) < 180) continue;
    if (islands.some((island) => Math.hypot(mine.x - island.x, mine.y - island.y) < island.radius + 52)) continue;
    return mine;
  }
  return { x: WORLD.width - 120, y: 160, phase: 0, armed: 0.6 };
}

/** One fixed step: steer, drag, hull drift, trail, buoy bob and mine wander. */
export function stepEntities(state, dt, direction) {
  const player = state.player;
  const accel = 1180;
  const target = { x: direction.x, y: direction.y };
  const length = Math.hypot(target.x, target.y);
  if (length > 0) {
    target.x /= length;
    target.y /= length;
    player.vx += target.x * accel * dt;
    player.vy += target.y * accel * dt;
  }
  const drag = Math.exp(-5.4 * dt);
  player.vx *= drag;
  player.vy *= drag;
  const top = player.speed * (state.storm > 72 ? 0.88 : 1);
  const current = Math.hypot(player.vx, player.vy);
  if (current > top) {
    player.vx = (player.vx / current) * top;
    player.vy = (player.vy / current) * top;
  }
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  const margin = 22;
  if (player.x < margin) {
    player.x = margin;
    player.vx = Math.abs(player.vx) * 0.3;
  }
  if (player.x > WORLD.width - margin) {
    player.x = WORLD.width - margin;
    player.vx = -Math.abs(player.vx) * 0.3;
  }
  if (player.y < 150) {
    player.y = 150;
    player.vy = Math.abs(player.vy) * 0.3;
  }
  if (player.y > WORLD.height - margin) {
    player.y = WORLD.height - margin;
    player.vy = -Math.abs(player.vy) * 0.3;
  }
  clearOfIslands(player, state.islands, player.radius + 6);

  if (current > 26) {
    player.heading = Math.atan2(player.vy, player.vx);
    player.trail.unshift({ x: player.x - Math.cos(player.heading) * 16, y: player.y - Math.sin(player.heading) * 16, life: 1 });
    if (player.trail.length > 26) player.trail.pop();
  }
  for (const wake of player.trail) wake.life -= dt * 1.5;

  for (const buoy of state.buoys) {
    buoy.phase += dt * buoy.drift;
    buoy.x += Math.cos(buoy.phase * 0.9) * 7 * dt;
    buoy.y += Math.sin(buoy.phase * 1.3) * 7 * dt;
    clearOfIslands(buoy, state.islands, RULES.BUOY_RADIUS + 8);
    if (buoy.x < 40 || buoy.x > WORLD.width - 40) buoy.x = Math.min(WORLD.width - 40, Math.max(40, buoy.x));
    if (buoy.y < 160 || buoy.y > WORLD.height - 30) buoy.y = Math.min(WORLD.height - 30, Math.max(160, buoy.y));
  }

  for (const mine of state.mines) {
    mine.phase += dt * 0.9;
    mine.x += Math.cos(mine.phase) * 10 * dt;
    mine.y += Math.sin(mine.phase * 1.4) * 10 * dt;
    clearOfIslands(mine, state.islands, RULES.MINE_RADIUS + 8);
  }

  for (const flare of state.flares) {
    flare.age += dt;
    flare.life -= dt;
  }
  state.flares = state.flares.filter((flare) => flare.life > 0);
}

/** Danger reads the pressure and how close the nearest mine is; the renderer uses it to tint the sea. */
export function dangerLevel(state) {
  let nearest = Infinity;
  for (const mine of state.mines) {
    nearest = Math.min(nearest, Math.hypot(mine.x - state.player.x, mine.y - state.player.y));
  }
  const nearby = nearest === Infinity ? 0 : Math.max(0, 1 - nearest / 260);
  return Math.min(1, state.storm / 100 * 0.75 + nearby * 0.25);
}
