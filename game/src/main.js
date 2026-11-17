// Boot and the one loop. The run advances in fixed 1/60 s steps while the frame catches up; the
// renderer paints whatever is there. The game moves through four screens, title, play, pause and
// results, and the screenshot stage behind #shot=start|play|end paints a scene once and sets
// window.__shotReady. Nothing outside this file decides which screen is up.

import { ACTION_FLARE, ACTION_PAUSE, ACTION_RESTART, ACTION_SOUND, ACTION_START, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { createRun, drainEvents, stepRun, summaryOf } from './run.js';
import { RULES, useFlare } from './rules.js';
import { stageShot } from './shots.js';
import { WORLD } from './entities.js';

const BEST_KEY = 'signal-keeper-best';
const STEP = RULES.STEP;
const MAX_FRAME = 0.25;

const SCREENS = { START: 'start', PLAY: 'play', PAUSE: 'pause', END: 'end' };

const stage = document.getElementById('stage');
const canvas = document.getElementById('sea');
const renderer = createRenderer(canvas);
const audio = createAudio();

// The menus' buttons queue the keys they stand for: Start = Enter, Resume = P, Run again = R.
for (const [id, action] of [['startButton', ACTION_START], ['resumeButton', ACTION_PAUSE], ['restartButton', ACTION_RESTART]]) {
  const button = document.getElementById(id);
  if (button) button.addEventListener('click', () => window.__queueAction?.(action));
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(Math.floor(value)));
  } catch {
    // A private window keeps the best for this visit only.
  }
}

function readSeed() {
  const fromQuery = Number.parseInt(new URLSearchParams(window.location.search).get('seed') ?? '', 10);
  if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;
  return Math.floor(Math.random() * 4294967296);
}

function readShot() {
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('shot');
  if (fromHash) return fromHash;
  return new URLSearchParams(window.location.search).get('shot');
}

/** The stage is a fixed 1280x800 chart, scaled whole into the window so menus and sea keep their composition. */
function fitStage() {
  const fit = Math.min(window.innerWidth / WORLD.width, window.innerHeight / WORLD.height);
  stage.style.transform = `translate(-50%, -50%) scale(${fit})`;
}

/** The backing store follows the pixel ratio; the drawn chart stays 1280x800 and is scaled into it. */
function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(WORLD.width * dpr);
  canvas.height = Math.round(WORLD.height * dpr);
  canvas.dataset.dpr = String(dpr);
  renderer.setScale(dpr);
}

function createRunner({ best, seed }) {
  let screen = SCREENS.START;
  let state = createRun(seed);
  let bestScore = Math.max(best, readBest());
  let accumulator = 0;
  let last = performance.now();
  let announced = false;

  function start() {
    state = createRun(Math.floor(Math.random() * 4294967296));
    accumulator = 0;
    screen = SCREENS.PLAY;
    renderer.setScreen(SCREENS.PLAY);
    renderer.updateHud(state);
    audio.unlock();
    audio.play({ type: 'start' });
  }

  function finish() {
    if (screen === SCREENS.END) return;
    screen = SCREENS.END;
    const summary = summaryOf(state, bestScore);
    if (state.score > bestScore) {
      bestScore = Math.floor(state.score);
      saveBest(bestScore);
    }
    renderer.setScreen(SCREENS.END);
    renderer.showEnd(summary);
  }

  function handleActions() {
    const actions = input.take();
    if (actions & ACTION_SOUND) {
      audio.toggleMute();
      renderer.setMuted(audio.isMuted());
    }
    if (actions & ACTION_RESTART && screen !== SCREENS.START) {
      start();
      return;
    }
    if (screen === SCREENS.START) {
      if (actions & (ACTION_START | ACTION_FLARE)) start();
      return;
    }
    if (screen === SCREENS.END) {
      if (actions & ACTION_START) start();
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = screen === SCREENS.PLAY ? SCREENS.PAUSE : SCREENS.PLAY;
      renderer.setScreen(screen);
      if (screen === SCREENS.PLAY) audio.unlock();
      accumulator = 0;
      return;
    }
    if (screen === SCREENS.PLAY && actions & ACTION_FLARE) {
      const pointer = input.pointer();
      const spot = pointer.inside ? pointer : { x: state.player.x, y: state.player.y - 90 };
      useFlare(state, spot.x, spot.y);
    }
  }

  function react(events) {
    for (const event of events) {
      audio.play(event);
      if (event.type === 'buoy') {
        state.floaters.push({ x: event.x, y: event.y, life: 0.9, label: `+${event.gained}${event.mult > 1 ? ` x${event.mult}` : ''}`, color: '#f0a13a' });
      } else if (event.type === 'burn') {
        state.floaters.push({ x: event.x, y: event.y, life: 0.7, label: '+25', color: '#e9e2d2' });
      } else if (event.type === 'hit' || event.type === 'surge') {
        renderer.flash();
      } else if (event.type === 'over') {
        finish();
      }
    }
  }

  function step() {
    if (screen !== SCREENS.PLAY) return;
    stepRun(state, STEP, input.direction());
    react(drainEvents(state));
    if (state.over && screen === SCREENS.PLAY) finish();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREENS.PLAY) {
      let guard = 0;
      while (accumulator >= STEP && screen === SCREENS.PLAY && guard < 8) {
        step();
        accumulator -= STEP;
        guard += 1;
      }
      if (guard >= 8) accumulator = 0;
    } else {
      accumulator = 0;
    }
    renderer.updateHud(state);
    renderer.draw(state, { screen, pointer: input.pointer() });
    if (!announced) {
      announced = true;
      renderer.showStart(bestScore);
    }
  }

  // Leaving the tab pauses a live run rather than letting the front close unseen.
  function suspend() {
    if (screen === SCREENS.PLAY) {
      screen = SCREENS.PAUSE;
      renderer.setScreen(SCREENS.PAUSE);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
  });
  window.addEventListener('blur', suspend);

  // The first gesture anywhere unlocks WebAudio, as browsers require.
  const unlock = () => audio.unlock();
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('pointerdown', unlock, { once: true });

  const input = createInput(canvas);
  window.__queueAction = (action) => input.queue(action);

  return {
    begin() {
      renderer.setScreen(SCREENS.START);
      renderer.showStart(bestScore);
      renderer.updateHud(state);
      renderer.setMuted(audio.isMuted());
      requestAnimationFrame(frame);
    },
  };
}

function mountShot(kind) {
  const seed = readSeed();
  const scene = stageShot(kind, seed);
  canvas.width = WORLD.width;
  canvas.height = WORLD.height;
  renderer.setScale(1);
  renderer.setScreen(scene.view.screen);
  if (scene.view.screen === 'start') renderer.showStart(0);
  if (scene.summary) renderer.showEnd(scene.summary);
  renderer.updateHud(scene.state);
  renderer.setMuted(false);
  renderer.draw(scene.state, scene.view);
  // A second frame lets fonts settle, then the screenshot script may go.
  requestAnimationFrame(() => {
    renderer.draw(scene.state, scene.view);
    window.__shotReady = true;
    window.__shotMeta = {
      kind,
      seed,
      screen: scene.view.screen,
      score: scene.state.score,
      hull: scene.state.hull,
      buoys: scene.state.buoysCollected,
      storm: Math.round(scene.state.storm),
      flares: scene.state.flares.length,
    };
  });
}

fitStage();
window.addEventListener('resize', fitStage);

const shot = readShot();
if (shot) {
  mountShot(shot);
} else {
  const runner = createRunner({ best: readBest(), seed: readSeed() });
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  runner.begin();
}
