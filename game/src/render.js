// All painting: the night sea and everything on it, the lighthouse beams, the flare light, and the
// DOM HUD and screens around the canvas. The renderer owns no rules and no timing: main hands it a
// run state and a view, and it draws and labels exactly that.

import { dangerLevel, WORLD } from './entities.js';
import { formatClock, formatScore, multiplierFor, RULES } from './rules.js';

const COLOR = {
  sea: '#07171a',
  seaDeep: '#051214',
  grid: 'rgba(103, 198, 180, 0.10)',
  gridMajor: 'rgba(233, 226, 210, 0.075)',
  cream: '#e9e2d2',
  creamSoft: 'rgba(233, 226, 210, 0.55)',
  creamFaint: 'rgba(233, 226, 210, 0.24)',
  amber: '#f0a13a',
  amberDeep: '#9a550f',
  rust: '#c8503c',
  rustDeep: '#7d2a20',
  teal: '#67c6b4',
  island: '#0c2528',
  islandEdge: 'rgba(233, 226, 210, 0.42)',
};

const LIGHTHOUSE = { x: 1184, y: 316, base: 316 };

function hashString(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function rngFrom(text) {
  let state = hashString(text);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function diamond(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
}

function text(ctx, value, x, y, size, color, align = 'left', weight = 400, font = 'mono') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${font === 'serif' ? '"Bitstream Charter", "DejaVu Serif", Georgia, serif' : '"DejaVu Sans Mono", "Liberation Mono", monospace'}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
}

function drawSeaMarks(ctx, marks, time) {
  for (const mark of marks) {
    const drift = Math.sin(time * 0.5 + mark.phase) * 3;
    ctx.strokeStyle = mark.major ? COLOR.gridMajor : COLOR.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mark.x + drift, mark.y);
    ctx.lineTo(mark.x + drift + mark.length, mark.y);
    ctx.stroke();
  }
}

function drawGrid(ctx, time) {
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD.width; x += 64) {
    ctx.strokeStyle = x % 256 === 0 ? COLOR.gridMajor : COLOR.grid;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, WORLD.height);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD.height; y += 64) {
    ctx.strokeStyle = y % 256 === 0 ? COLOR.gridMajor : COLOR.grid;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(WORLD.width, y + 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(240, 161, 58, 0.14)';
  for (const x of [320, 640, 960]) {
    for (const y of [200, 520]) {
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y);
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 4);
      ctx.stroke();
    }
  }
  const sweep = (time * 40) % (WORLD.width + 400) - 200;
  ctx.strokeStyle = 'rgba(103, 198, 180, 0.05)';
  ctx.beginPath();
  ctx.moveTo(sweep, 0);
  ctx.lineTo(sweep + 120, WORLD.height);
  ctx.stroke();
}

function drawStormEdge(ctx, storm, time) {
  const strength = storm / 100;
  if (strength <= 0.02) return;
  const reach = 24 + strength * 168;
  ctx.save();
  // The front is a flat rust wash creeping in from the top and right, never a gradient.
  ctx.fillStyle = `rgba(200, 80, 60, ${0.035 + strength * 0.05})`;
  ctx.fillRect(0, 0, WORLD.width, reach * 0.55);
  ctx.fillRect(WORLD.width - reach, 0, reach, WORLD.height);
  ctx.fillStyle = `rgba(5, 18, 20, ${0.2 + strength * 0.3})`;
  ctx.fillRect(0, 0, WORLD.width, reach * 0.2);
  ctx.fillRect(WORLD.width - reach * 0.35, 0, reach * 0.35, WORLD.height);
  ctx.strokeStyle = COLOR.rust;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.3 + strength * 0.4;
  ctx.setLineDash([16, 10]);
  ctx.lineDashOffset = -time * 26;
  ctx.beginPath();
  ctx.moveTo(0, reach * 0.55);
  for (let x = 0; x <= WORLD.width; x += 80) {
    const jag = Math.sin(x * 0.045 + time * 1.7) * 9;
    ctx.lineTo(x, reach * 0.55 + jag);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(WORLD.width - reach, 0);
  for (let y = 0; y <= WORLD.height; y += 80) {
    const jag = Math.cos(y * 0.05 + time * 1.4) * 9;
    ctx.lineTo(WORLD.width - reach + jag, y);
  }
  ctx.stroke();
  ctx.setLineDash([4, 12]);
  ctx.globalAlpha = 0.14 + strength * 0.22;
  ctx.beginPath();
  ctx.moveTo(WORLD.width - reach * 0.55, 0);
  ctx.lineTo(WORLD.width - reach * 0.55, WORLD.height);
  ctx.stroke();
  ctx.setLineDash([]);
  if (storm > 78) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = COLOR.rust;
    ctx.fillRect(0, 0, WORLD.width, 4);
    ctx.fillRect(WORLD.width - 4, 0, 4, WORLD.height);
  }
  ctx.restore();
}

function drawLighthouse(ctx, time) {
  const { x, base } = LIGHTHOUSE;
  const top = 196;
  // Rock the tower stands on.
  ctx.fillStyle = COLOR.island;
  ctx.strokeStyle = COLOR.islandEdge;
  ctx.lineWidth = 2;
  polygon(ctx, [
    [x - 86, base],
    [x - 50, base - 24],
    [x + 44, base - 26],
    [x + 90, base],
    [x + 62, base + 20],
    [x - 58, base + 20],
  ]);
  ctx.fill();
  ctx.stroke();

  // The tower: flat cream bands with a rust cap, no gradient anywhere.
  const body = [
    [x - 22, base - 22],
    [x + 22, base - 22],
    [x + 13, top],
    [x - 13, top],
  ];
  ctx.fillStyle = COLOR.cream;
  polygon(ctx, body);
  ctx.fill();
  ctx.save();
  polygon(ctx, body);
  ctx.clip();
  ctx.fillStyle = COLOR.rust;
  for (let band = 0; band < 5; band += 1) {
    ctx.fillRect(x - 30, base - 44 - band * 28, 60, 12);
  }
  ctx.restore();
  ctx.strokeStyle = COLOR.cream;
  ctx.lineWidth = 2;
  polygon(ctx, body);
  ctx.stroke();

  // Gallery, lamp room and cap.
  ctx.fillStyle = COLOR.cream;
  ctx.fillRect(x - 20, top - 6, 40, 6);
  ctx.fillStyle = COLOR.sea;
  ctx.fillRect(x - 14, top - 26, 28, 20);
  ctx.strokeStyle = COLOR.cream;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 14, top - 26, 28, 20);
  ctx.fillStyle = COLOR.amber;
  ctx.fillRect(x - 8, top - 21, 16, 10);
  ctx.fillStyle = COLOR.rust;
  polygon(ctx, [[x - 17, top - 26], [x, top - 40], [x + 17, top - 26]]);
  ctx.fill();

  // The beam, two flat wedges on a slow rotation.
  const angle = time * 0.42;
  for (const direction of [0, Math.PI]) {
    const a = angle + direction;
    const spread = 0.19;
    const reach = 520;
    ctx.beginPath();
    ctx.moveTo(x, top - 16);
    ctx.lineTo(x + Math.cos(a - spread) * reach, top - 16 + Math.sin(a - spread) * reach);
    ctx.lineTo(x + Math.cos(a + spread) * reach, top - 16 + Math.sin(a + spread) * reach);
    ctx.closePath();
    ctx.fillStyle = 'rgba(240, 161, 58, 0.09)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(240, 161, 58, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = COLOR.amber;
  ctx.fillRect(x - 6, top - 21, 12, 10);
}

function drawIsland(ctx, island) {
  ctx.save();
  ctx.translate(island.x, island.y);
  ctx.rotate(island.spin * 0.08);
  const points = island.shape.map(([px, py]) => [(px - 0.5) * island.radius * 2, (py - 0.5) * island.radius * 2]);
  polygon(ctx, points);
  ctx.fillStyle = COLOR.island;
  ctx.fill();
  ctx.strokeStyle = COLOR.islandEdge;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Sounding rings and a shoreline hatch, the chart-sheet way of saying shoal.
  ctx.strokeStyle = 'rgba(233, 226, 210, 0.14)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, island.radius * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(240, 161, 58, 0.5)';
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(6, 0);
  ctx.moveTo(0, -6);
  ctx.lineTo(0, 6);
  ctx.stroke();
  ctx.restore();
}

function drawBuoy(ctx, buoy, time) {
  const bob = Math.sin(time * 1.8 + buoy.phase) * 2;
  const x = buoy.x;
  const y = buoy.y + bob;
  ctx.strokeStyle = 'rgba(240, 161, 58, 0.24)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, RULES.BUOY_RADIUS + 8 + Math.sin(time * 2.2 + buoy.phase) * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COLOR.amber;
  diamond(ctx, x, y, 9);
  ctx.fill();
  ctx.strokeStyle = COLOR.sea;
  ctx.lineWidth = 2;
  diamond(ctx, x, y, 9);
  ctx.stroke();
  ctx.fillStyle = COLOR.sea;
  ctx.fillRect(x - 2, y - 2, 4, 4);
  ctx.strokeStyle = COLOR.amber;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 17);
  ctx.lineTo(x, y - 12);
  ctx.moveTo(x, y + 12);
  ctx.lineTo(x, y + 17);
  ctx.stroke();
}

function drawMine(ctx, mine, lit, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3 + mine.phase);
  if (!lit) {
    ctx.strokeStyle = 'rgba(200, 80, 60, 0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.arc(mine.x, mine.y, 14 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(200, 80, 60, 0.35)';
    ctx.fillRect(mine.x - 2, mine.y - 2, 4, 4);
    return;
  }
  ctx.save();
  ctx.translate(mine.x, mine.y);
  ctx.strokeStyle = COLOR.rust;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + time * 0.3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
    ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
    ctx.stroke();
  }
  ctx.fillStyle = COLOR.rustDeep;
  ctx.strokeStyle = COLOR.rust;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLOR.rust;
  ctx.beginPath();
  ctx.arc(0, 0, 3 + pulse * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function mineIsLit(state, mine) {
  if (Math.hypot(mine.x - state.player.x, mine.y - state.player.y) < 150) return true;
  for (const flare of state.flares) {
    if (Math.hypot(mine.x - flare.x, mine.y - flare.y) < RULES.FLARE_RADIUS + 18) return true;
  }
  return false;
}

/** A burned mine leaves a flat rust X on the water for a moment, so the flare's work is visible in its light. */
function drawScorches(ctx, scorches) {
  for (const scorch of scorches) {
    const fade = Math.min(1, scorch.life / 1.2);
    ctx.save();
    ctx.globalAlpha = fade * 0.85;
    ctx.strokeStyle = COLOR.rust;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scorch.x - 8, scorch.y - 8);
    ctx.lineTo(scorch.x + 8, scorch.y + 8);
    ctx.moveTo(scorch.x + 8, scorch.y - 8);
    ctx.lineTo(scorch.x - 8, scorch.y + 8);
    ctx.stroke();
    ctx.globalAlpha = fade * 0.5;
    ctx.fillStyle = COLOR.amber;
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + scorch.life * 2;
      ctx.fillRect(scorch.x + Math.cos(a) * 15 - 1.5, scorch.y + Math.sin(a) * 15 - 1.5, 3, 3);
    }
    ctx.restore();
  }
}

function drawFlare(ctx, flare) {
  const remaining = Math.max(0, flare.life / RULES.FLARE_LIFE);
  const grow = 1 + (1 - remaining) * 0.16;
  const reach = RULES.FLARE_RADIUS * grow;
  ctx.save();
  // The light on the water is a flat, very faint disc; the flame itself is a small hard diamond.
  ctx.strokeStyle = COLOR.amber;
  ctx.globalAlpha = 0.34 + remaining * 0.5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(flare.x, flare.y, reach, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.18 + remaining * 0.26;
  ctx.setLineDash([5, 9]);
  ctx.beginPath();
  ctx.arc(flare.x, flare.y, reach * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // Four short range ticks at the diagonals, turning slowly with the burn.
  ctx.globalAlpha = 0.3 + remaining * 0.4;
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + remaining * 1.6;
    ctx.beginPath();
    ctx.moveTo(flare.x + Math.cos(a) * reach * 0.9, flare.y + Math.sin(a) * reach * 0.9);
    ctx.lineTo(flare.x + Math.cos(a) * reach, flare.y + Math.sin(a) * reach);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOR.cream;
  diamond(ctx, flare.x, flare.y, 7);
  ctx.fill();
  ctx.strokeStyle = COLOR.sea;
  ctx.lineWidth = 2;
  diamond(ctx, flare.x, flare.y, 7);
  ctx.stroke();
  ctx.fillStyle = COLOR.amber;
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.fillRect(flare.x + Math.cos(a) * 14 - 1.5, flare.y + Math.sin(a) * 14 - 1.5, 3, 3);
  }
  ctx.restore();
}

function drawWake(ctx, trail) {
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    const mark = trail[i];
    if (mark.life <= 0) continue;
    ctx.globalAlpha = mark.life * 0.34;
    ctx.fillStyle = COLOR.teal;
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, 4 + (1 - mark.life) * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTender(ctx, state, time) {
  const player = state.player;
  if (state.invuln > 0 && Math.floor(state.elapsed * 12) % 2 === 0) return;
  const speed = Math.hypot(player.vx, player.vy);
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.heading + Math.PI / 2);

  // Searchlight ahead, flat and faint.
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(-54, -140);
  ctx.lineTo(54, -140);
  ctx.closePath();
  ctx.fillStyle = 'rgba(233, 226, 210, 0.055)';
  ctx.fill();

  // Hull: a workboat outline, cream gunwale over a dark deck.
  polygon(ctx, [[0, -24], [13, -8], [15, 14], [8, 22], [-8, 22], [-15, 14], [-13, -8]]);
  ctx.fillStyle = COLOR.seaDeep;
  ctx.fill();
  ctx.strokeStyle = COLOR.cream;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Wheelhouse and mast lamp.
  ctx.fillStyle = COLOR.cream;
  ctx.fillRect(-7, -12, 14, 12);
  ctx.fillStyle = COLOR.amber;
  ctx.fillRect(-4, -9, 8, 5);
  ctx.fillStyle = COLOR.cream;
  ctx.fillRect(-1, -23, 2, 8);
  ctx.fillStyle = COLOR.amber;
  ctx.beginPath();
  ctx.arc(0, -27, 3, 0, Math.PI * 2);
  ctx.fill();

  // Deck stripes, amber at the bow and a transom line.
  ctx.strokeStyle = COLOR.amber;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(0, -6);
  ctx.moveTo(-11, 16);
  ctx.lineTo(11, 16);
  ctx.stroke();

  // Thrust mark: a short teal line off the stern when moving.
  if (speed > 40) {
    ctx.strokeStyle = 'rgba(103, 198, 180, 0.6)';
    ctx.lineWidth = 2;
    const flutter = Math.sin(time * 22) * 3;
    ctx.beginPath();
    ctx.moveTo(-5, 24);
    ctx.lineTo(flutter, 34 + Math.min(16, speed * 0.04));
    ctx.lineTo(5, 24);
    ctx.stroke();
  }
  ctx.restore();
}

function drawReticle(ctx, pointer, state) {
  if (!pointer.inside) return;
  const ready = state.flareCooldown <= 0;
  ctx.save();
  ctx.strokeStyle = ready ? COLOR.amber : 'rgba(233, 226, 210, 0.3)';
  ctx.fillStyle = ready ? COLOR.amber : 'rgba(233, 226, 210, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pointer.x - 20, pointer.y);
  ctx.lineTo(pointer.x - 15, pointer.y);
  ctx.moveTo(pointer.x + 15, pointer.y);
  ctx.lineTo(pointer.x + 20, pointer.y);
  ctx.moveTo(pointer.x, pointer.y - 20);
  ctx.lineTo(pointer.x, pointer.y - 15);
  ctx.moveTo(pointer.x, pointer.y + 15);
  ctx.lineTo(pointer.x, pointer.y + 20);
  ctx.stroke();
  if (ready) {
    ctx.font = '9px "DejaVu Sans Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FLARE', pointer.x + 22, pointer.y - 10);
  } else {
    const frac = 1 - state.flareCooldown / RULES.FLARE_COOLDOWN;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 13, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFloaters(ctx, floaters) {
  for (const floater of floaters) {
    if (floater.life <= 0) continue;
    ctx.globalAlpha = Math.min(1, floater.life / 0.5);
    text(ctx, floater.label, floater.x, floater.y - (1 - floater.life) * 26, 13, floater.color, 'center', 700);
  }
  ctx.globalAlpha = 1;
}

function drawCompass(ctx, time) {
  const x = 1216;
  const y = 712;
  ctx.save();
  ctx.strokeStyle = 'rgba(233, 226, 210, 0.24)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 25, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(240, 161, 58, 0.5)';
  ctx.beginPath();
  ctx.moveTo(x, y - 34);
  ctx.lineTo(x, y - 40);
  ctx.moveTo(x, y + 34);
  ctx.lineTo(x, y + 40);
  ctx.moveTo(x - 34, y);
  ctx.lineTo(x - 40, y);
  ctx.moveTo(x + 34, y);
  ctx.lineTo(x + 40, y);
  ctx.stroke();
  const needle = -Math.PI / 2 + Math.sin(time * 0.7) * 0.12;
  ctx.strokeStyle = COLOR.cream;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(needle) * 20, y - Math.sin(needle) * 20);
  ctx.lineTo(x + Math.cos(needle) * 26, y + Math.sin(needle) * 26);
  ctx.stroke();
  text(ctx, 'N', x, y - 50, 9, COLOR.creamSoft, 'center', 700);
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const marks = [];
  const markRng = rngFrom('signal-keeper-sea');
  for (let i = 0; i < 90; i += 1) {
    marks.push({
      x: markRng() * WORLD.width,
      y: markRng() * WORLD.height,
      length: 8 + markRng() * 26,
      phase: markRng() * Math.PI * 2,
      major: markRng() > 0.82,
    });
  }

  const dom = {
    hud: document.getElementById('hud'),
    score: document.getElementById('hudScore'),
    buoys: document.getElementById('hudBuoys'),
    hull: document.getElementById('hudHull'),
    time: document.getElementById('hudTime'),
    storm: document.getElementById('hudStorm'),
    stormBar: document.getElementById('hudStormBar'),
    flares: document.getElementById('hudFlare'),
    combo: document.getElementById('hudCombo'),
    start: document.getElementById('screenStart'),
    pause: document.getElementById('screenPause'),
    end: document.getElementById('screenEnd'),
    startBest: document.getElementById('startBest'),
    endScore: document.getElementById('endScore'),
    endBuoys: document.getElementById('endBuoys'),
    endTime: document.getElementById('endTime'),
    endStorm: document.getElementById('endStorm'),
    endBest: document.getElementById('endBest'),
    endBestLabel: document.getElementById('endBestLabel'),
    endReason: document.getElementById('endReason'),
    endTitle: document.getElementById('endTitle'),
    flash: document.getElementById('screenFlash'),
    muteFlag: document.getElementById('muteFlag'),
  };

  const shown = new Map();
  let screen = 'start';
  let scale = 1;

  function setScale(value) {
    scale = Math.max(0.5, value);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function put(element, key, value) {
    if (shown.get(key) === value) return;
    shown.set(key, value);
    element.textContent = value;
  }

  function updateHud(state) {
    put(dom.score, 'score', formatScore(state.score));
    put(dom.buoys, 'buoys', String(state.buoysCollected).padStart(2, '0'));
    put(dom.time, 'time', formatClock(state.elapsed));
    put(dom.storm, 'storm', `${Math.round(state.storm)}%`);
    const bar = `${Math.min(100, state.storm).toFixed(1)}%`;
    if (shown.get('bar') !== bar) {
      shown.set('bar', bar);
      dom.stormBar.style.width = bar;
    }
    const hullKey = state.hull;
    if (shown.get('hull') !== hullKey) {
      shown.set('hull', hullKey);
      const pips = dom.hull.querySelectorAll('i');
      pips.forEach((pip, index) => pip.classList.toggle('is-lost', index >= state.hull));
      dom.hull.setAttribute('aria-label', `${state.hull} of ${RULES.HULL_MAX} hull points`);
    }
    const ready = state.flareCooldown <= 0;
    put(dom.flares, 'flare', ready ? 'Flare ready' : `Flare ${state.flareCooldown.toFixed(1)}s`);
    dom.flares.classList.toggle('is-cooling', !ready);
    const mult = multiplierFor(state.combo);
    put(dom.combo, 'combo', `x${mult}`);
    dom.combo.classList.toggle('is-hot', mult > 1 && state.comboTimer > 0);
  }

  function setScreen(name) {
    screen = name;
    dom.start.classList.toggle('is-hidden', name !== 'start');
    dom.pause.classList.toggle('is-hidden', name !== 'pause');
    dom.end.classList.toggle('is-hidden', name !== 'end');
    dom.hud.classList.toggle('is-hidden', name === 'start' || name === 'end');
    document.body.dataset.screen = name;
  }

  function showStart(best) {
    put(dom.startBest, 'startBest', formatScore(best));
  }

  function showEnd(summary) {
    put(dom.endTitle, 'endTitle', summary.title);
    put(dom.endReason, 'endReason', summary.reason);
    put(dom.endScore, 'endScore', String(Math.floor(summary.score)));
    put(dom.endBuoys, 'endBuoys', String(summary.buoys));
    put(dom.endTime, 'endTime', formatClock(summary.time));
    put(dom.endStorm, 'endStorm', `${Math.round(summary.storm)}%`);
    put(dom.endBest, 'endBest', String(Math.floor(summary.best)));
    put(dom.endBestLabel, 'endBestLabel', summary.record ? 'New personal best' : 'Personal best');
    document.querySelector('.end-best').classList.toggle('is-record', Boolean(summary.record));
  }

  function flash() {
    dom.flash.style.opacity = '0.34';
    window.setTimeout(() => {
      dom.flash.style.opacity = '0';
    }, 70);
  }

  function setMuted(muted) {
    dom.muteFlag.classList.toggle('is-hidden', !muted);
  }

  function draw(state, view) {
    const time = state.time;
    const storm = state.storm;
    const danger = dangerLevel(state);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.save();
    ctx.fillStyle = COLOR.sea;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    if (state.shake > 0.01) {
      const power = state.shake * 7;
      ctx.translate(Math.sin(time * 61) * power, Math.cos(time * 47) * power);
    }

    drawGrid(ctx, time);
    drawSeaMarks(ctx, marks, time);

    // Danger is a flat wash, not a glow: the sea gets colder as the front comes on.
    if (danger > 0.02) {
      ctx.fillStyle = `rgba(125, 42, 32, ${danger * 0.16})`;
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    }
    drawStormEdge(ctx, storm, time);
    drawLighthouse(ctx, time);

    for (const island of state.islands) drawIsland(ctx, island);

    // A burning flare throws a flat disc of light over the water before anything on it is drawn.
    for (const flare of state.flares) {
      const remaining = Math.max(0, flare.life / RULES.FLARE_LIFE);
      ctx.fillStyle = `rgba(240, 161, 58, ${0.015 + remaining * 0.025})`;
      ctx.beginPath();
      ctx.arc(flare.x, flare.y, RULES.FLARE_RADIUS * 1.16, 0, Math.PI * 2);
      ctx.fill();
    }

    drawScorches(ctx, state.scorches);
    for (const mine of state.mines) drawMine(ctx, mine, mineIsLit(state, mine), time);
    for (const buoy of state.buoys) drawBuoy(ctx, buoy, time);
    drawWake(ctx, state.player.trail);
    drawTender(ctx, state, time);
    for (const flare of state.flares) drawFlare(ctx, flare);
    drawFloaters(ctx, state.floaters);
    drawCompass(ctx, time);

    if (view.screen === 'play') drawReticle(ctx, view.pointer, state);
    ctx.restore();

    // The lighthouse label sits outside the shake so it never wobbles with a strike.
    text(ctx, 'N. SHOAL LIGHT 04', LIGHTHOUSE.x, LIGHTHOUSE.base + 34, 9, COLOR.creamSoft, 'center', 400);
  }

  return {
    draw,
    setScale,
    setScreen,
    updateHud,
    showStart,
    showEnd,
    flash,
    setMuted,
    currentScreen() {
      return screen;
    },
  };
}
