// Keyboard and mouse, read once a frame. The tender steers from the keys held now, not from the last
// key event, so a lost or blocked repeat never leaves it stuck at a heading. Actions (start, pause,
// restart, sound, flare) are queued as bit flags and drained by the state machine.

export const ACTION_START = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_SOUND = 8;
export const ACTION_FLARE = 16;

const KEY_TO_ACTION = new Map([
  ['Enter', ACTION_START],
  ['p', ACTION_PAUSE],
  ['P', ACTION_PAUSE],
  ['r', ACTION_RESTART],
  ['R', ACTION_RESTART],
  ['m', ACTION_SOUND],
  ['M', ACTION_SOUND],
]);

const LEFT = new Set(['ArrowLeft', 'a', 'A']);
const RIGHT = new Set(['ArrowRight', 'd', 'D']);
const UP = new Set(['ArrowUp', 'w', 'W']);
const DOWN = new Set(['ArrowDown', 's', 'S']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let pointer = { x: 0, y: 0, inside: false };

  /** The stage is drawn at 1280x800 and scaled into the window, so a click maps by the box, not the backing store. */
  function viewSize() {
    return { width: canvas.width / (Number(canvas.dataset.dpr) || 1), height: canvas.height / (Number(canvas.dataset.dpr) || 1) };
  }

  function press(code) {
    if (LEFT.has(code)) held.add('left');
    else if (RIGHT.has(code)) held.add('right');
    else if (UP.has(code)) held.add('up');
    else if (DOWN.has(code)) held.add('down');
    if (KEY_TO_ACTION.has(code)) actions |= KEY_TO_ACTION.get(code);
  }

  function release(code) {
    if (LEFT.has(code)) held.delete('left');
    else if (RIGHT.has(code)) held.delete('right');
    else if (UP.has(code)) held.delete('up');
    else if (DOWN.has(code)) held.delete('down');
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) event.preventDefault();
      return;
    }
    press(event.key);
    if (KEY_TO_ACTION.has(event.key) || event.key === ' ') {
      actions |= event.key === ' ' ? ACTION_START : 0;
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    release(event.key);
  });

  window.addEventListener('blur', () => {
    held.clear();
  });

  function track(event) {
    const box = canvas.getBoundingClientRect();
    const size = viewSize();
    pointer.x = ((event.clientX - box.left) / box.width) * size.width;
    pointer.y = ((event.clientY - box.top) / box.height) * size.height;
    pointer.inside = true;
  }

  canvas.addEventListener('mousemove', track);
  canvas.addEventListener('mouseleave', () => {
    pointer.inside = false;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    track(event);
    actions |= ACTION_FLARE;
    event.preventDefault();
  });
  // A click on the sea when no run is on is also a start, so a player who reaches for the mouse is not stuck.
  canvas.addEventListener('click', () => {
    actions |= ACTION_START;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    direction() {
      let x = 0;
      let y = 0;
      if (held.has('left')) x -= 1;
      if (held.has('right')) x += 1;
      if (held.has('up')) y -= 1;
      if (held.has('down')) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    pointer() {
      return { x: pointer.x, y: pointer.y, inside: pointer.inside };
    },
    take() {
      const pending = actions;
      actions = 0;
      return pending;
    },
    /** A button on a menu queues the same action its key does, so mouse and keyboard share one path. */
    queue(action) {
      actions |= action;
    },
  };
}
