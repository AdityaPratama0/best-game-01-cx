// Every sound is an oscillator or a noise burst made at the moment it plays: no files, no samples.
// The context starts suspended and is resumed by the first key or click, as browsers require; the
// player can mute with M and the choice is kept for the visit.

const MUTE_KEY = 'signal-keeper-muted';

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function createAudio() {
  let context = null;
  let master = null;
  let muted = readMuted();

  function ensure() {
    if (context !== null) return context;
    const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtor) return null;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);
    return context;
  }

  function tone(frequency, duration, type, volume, slideTo) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx || ctx.state === 'suspended') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function noise(duration, volume, cutoff) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx || ctx.state === 'suspended') return;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  return {
    /** Called on the first real gesture; safe to call every time. */
    unlock() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // Private windows drop the storage: the setting then lasts this visit.
      }
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (!muted) this.unlock();
      return muted;
    },
    play(event) {
      switch (event.type) {
        case 'buoy': {
          const step = Math.min(8, Math.max(0, (event.mult ?? 1) - 1));
          tone(520 + step * 90, 0.12, 'triangle', 0.32);
          tone(780 + step * 90, 0.09, 'sine', 0.16);
          break;
        }
        case 'flare':
          tone(320, 0.35, 'sawtooth', 0.24, 90);
          noise(0.4, 0.22, 1400);
          if (event.burned > 0) tone(660, 0.18, 'sine', 0.2, 990);
          break;
        case 'burn':
          tone(210, 0.16, 'square', 0.12, 70);
          break;
        case 'hit':
          noise(0.35, 0.5, 900);
          tone(120, 0.3, 'sawtooth', 0.3, 48);
          break;
        case 'surge':
          noise(0.6, 0.42, 520);
          tone(90, 0.5, 'sawtooth', 0.26, 40);
          break;
        case 'over':
          tone(300, 0.5, 'triangle', 0.3, 90);
          tone(190, 0.9, 'sine', 0.24, 52);
          break;
        case 'start':
          tone(392, 0.1, 'triangle', 0.22);
          tone(523, 0.1, 'triangle', 0.22);
          tone(659, 0.18, 'triangle', 0.24);
          break;
        default:
          break;
      }
    },
  };
}
