// Screenshot capture over the Chrome DevTools Protocol, so the viewport is exactly 1280x800 and the
// PNG is the page alone (no window chrome, no virtual-time guesses). Launches the installed Chrome
// headless, opens game/index.html at a #shot= URL, waits for window.__shotReady, and writes the PNG.
//
//   node tools/shoot.mjs --url http://127.0.0.1:8097/index.html --out screenshots --seed 7
//
// This is build tooling, not part of the game: nothing under game/ imports it.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join, resolve } from 'node:path';

const CHROME = '/home/azureuser/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const DEBUG_PORT = Number(process.env.SHOOT_PORT ?? 9300 + (process.pid % 500));
const PROFILE = `/tmp/signal-keeper-cdp-${process.pid}`;
const VIEW = { width: 1280, height: 800 };

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function httpJson(path) {
  return new Promise((resolvePromise, reject) => {
    const req = request({ host: '127.0.0.1', port: DEBUG_PORT, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolvePromise(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await httpJson('/json/version');
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('Chrome did not open its debug port');
}

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.next = 1;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const slot = this.pending.get(message.id);
        if (!slot) return;
        this.pending.delete(message.id);
        if (message.error) slot.reject(new Error(`${message.error.message} (${slot.method})`));
        else slot.resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolvePromise, reject) => {
      socket.addEventListener('open', resolvePromise, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CDP(socket);
  }

  send(method, params = {}, sessionId) {
    const id = this.next;
    this.next += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject, method });
      this.socket.send(JSON.stringify(payload));
    });
  }

  onEvent(listener) {
    this.listeners.push(listener);
  }
}

const BASE = arg('url', 'http://127.0.0.1:8097/index.html');
const OUT = resolve(arg('out', 'screenshots'));
const SEED = arg('seed', '7');
const SHOTS = [
  ['1-start.png', 'start'],
  ['2-play.png', 'play'],
  ['3-end.png', 'end'],
];

mkdirSync(OUT, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-proxy-server',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE}`,
    `--window-size=${VIEW.width},${VIEW.height}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
let chromeErrors = '';
chrome.stderr.on('data', (chunk) => {
  chromeErrors += chunk.toString();
});

try {
  const version = await waitForChrome();
  const cdp = await CDP.connect(version.webSocketDebuggerUrl);
  const problems = [];
  cdp.onEvent((message) => {
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params?.exceptionDetails;
      problems.push(`exception: ${detail?.exception?.description ?? detail?.text ?? 'unknown'}`);
    }
    if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
      problems.push(`log: ${message.params.entry.text}`);
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      problems.push(`console: ${message.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
  });

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const session = (method, params) => cdp.send(method, params, sessionId);
  await session('Page.enable');
  await session('Runtime.enable');
  await session('Log.enable');
  await session('Emulation.setDeviceMetricsOverride', {
    width: VIEW.width,
    height: VIEW.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await session('Page.navigate', { url: 'about:blank' });
  const results = [];
  for (const [file, kind] of SHOTS) {
    // The query, not the hash, carries the shot: a query change is a real navigation, so each stage
    // boots fresh, and it also keeps every screenshot's URL distinct in a reference log.
    const url = `${BASE}?shot=${kind}&seed=${SEED}`;
    await session('Page.navigate', { url });
    let meta = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((r) => setTimeout(r, 100));
      // The URL check keeps a poll from reading the previous page's ready flag before the new
      // document has committed; only a page whose own query names this shot may answer.
      const probe = await session('Runtime.evaluate', {
        expression: `location.search.includes('shot=${kind}') && window.__shotReady === true ? JSON.stringify(window.__shotMeta) : null`,
        returnByValue: true,
      });
      if (probe.result?.value) {
        meta = JSON.parse(probe.result.value);
        break;
      }
    }
    if (!meta) throw new Error(`${kind}: window.__shotReady never became true`);
    if (meta.kind !== kind) throw new Error(`${kind}: the page staged ${meta.kind} instead`);
    await new Promise((r) => setTimeout(r, 200));
    const shot = await session('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const bytes = Buffer.from(shot.data, 'base64');
    const path = join(OUT, file);
    writeFileSync(path, bytes);
    results.push({ file: path, bytes: bytes.length, meta });
    console.log(`${file} ${bytes.length} bytes ${JSON.stringify(meta)}`);
  }

  if (problems.length > 0) {
    console.error('page problems:');
    for (const problem of problems) console.error(`  ${problem}`);
  }

  await cdp.send('Browser.close');
  await new Promise((r) => setTimeout(r, 300));
  process.exitCode = problems.length > 0 ? 2 : 0;
} catch (error) {
  console.error(`shoot failed: ${error.message}`);
  if (chromeErrors.trim()) console.error(chromeErrors.trim().split('\n').slice(-8).join('\n'));
  process.exitCode = 1;
} finally {
  chrome.kill('SIGKILL');
}
