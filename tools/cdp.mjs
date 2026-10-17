// Minimal Chrome DevTools Protocol driver. No dependencies: Node 22+ (global WebSocket + fetch).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEYCODES = {
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32, Enter: 13, Escape: 27,
  ShiftLeft: 16, ShiftRight: 16, ControlLeft: 17, ControlRight: 17, Tab: 9, Backspace: 8,
};
// `text` is set for keys that type a character, so they are sent as real keyDown events (with keypress), like
// hardware keys: Enter and Space then activate a focused button natively.
function keyInfo(code) {
  if (code === 'Enter' || code === 'NumpadEnter') return { code, key: 'Enter', vk: 13, text: '\r' };
  if (code === 'Space') return { code, key: ' ', vk: 32, text: ' ' };
  if (code === 'Slash') return { code, key: '/', vk: 191, text: '/' };
  if (KEYCODES[code] !== undefined) {
    const key = code.replace(/(Left|Right)$/, (m) => (/^(Shift|Control)/.test(code) ? '' : m));
    return { code, key: code.startsWith('Arrow') ? code : key, vk: KEYCODES[code] };
  }
  const m = /^Key([A-Z])$/.exec(code);
  if (m) return { code, key: m[1].toLowerCase(), vk: m[1].charCodeAt(0), text: m[1].toLowerCase() };
  const d = /^Digit([0-9])$/.exec(code);
  if (d) return { code, key: d[1], vk: d[1].charCodeAt(0), text: d[1] };
  const n = /^Numpad([0-9])$/.exec(code);
  if (n) return { code, key: n[1], vk: 96 + Number(n[1]), text: n[1] };
  return { code, key: code, vk: 0 };
}

export async function launch({ width = 720, height = 1280, gpu = 'default', uncapped = false } = {}) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const userDir = mkdtempSync(join(tmpdir(), 'sl-chrome-'));
  const args = [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', `--window-size=${width},${height}`,
    '--allow-file-access-from-files',
  ];
  if (gpu === 'swiftshader') args.push('--enable-unsafe-swiftshader', '--use-angle=swiftshader');
  // Uncapped: frames are not paced by the display clock, so fps shows real headroom (perf checks only).
  if (uncapped) args.push('--disable-frame-rate-limit');
  // Extra Chrome switches, space separated (for example "--disable-frame-rate-limit --disable-gpu-vsync").
  if (process.env.CHROME_ARGS) args.push(...process.env.CHROME_ARGS.split(/\s+/).filter(Boolean));
  args.push('about:blank');
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 150 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(100);
  }
  if (!wsUrl) { proc.kill(); throw new Error('Chrome did not start (no DevTools endpoint)'); }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('DevTools socket failed')); });
  let nextId = 0;
  let mouseHeld = false;
  const pending = new Map();
  const listeners = new Set();
  const logs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++nextId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  listeners.add((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
      logs.push({ level: msg.params.type, text });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push({ level: 'exception', text: (d.exception && d.exception.description) || d.text, line: d.lineNumber, col: d.columnNumber, url: d.url });
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error' || e.level === 'warning') logs.push({ level: 'log-' + e.level, text: e.text, url: e.url });
    }
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  // Keep the page focused whatever the desktop does, so OS focus changes never fire blur (and blur-pause) in tests.
  try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}

  const api = {
    send, logs,
    async goto(url, { waitMs = 0 } = {}) {
      const loaded = new Promise((res) => {
        const l = (m) => { if (m.method === 'Page.loadEventFired') { listeners.delete(l); res(); } };
        listeners.add(l);
      });
      await send('Page.navigate', { url });
      await Promise.race([loaded, sleep(15000)]);
      if (waitMs) await sleep(waitMs);
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
      return r.result.value;
    },
    /** clip: optional [x, y, w, h, scale] in CSS px (scale 2 = zoomed close-up). */
    async screenshot(clip) {
      const p = { format: 'png' };
      if (Array.isArray(clip) && clip.length >= 4) p.clip = { x: clip[0], y: clip[1], width: clip[2], height: clip[3], scale: clip[4] || 1 };
      const r = await send('Page.captureScreenshot', p);
      return Buffer.from(r.data, 'base64');
    },
    /** type: 'down' | 'move' | 'up' (left button held between down and up) | 'right' (right click). */
    async mouse(type, x, y) {
      if (type === 'right') {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
        return;
      }
      const t = { down: 'mousePressed', move: 'mouseMoved', up: 'mouseReleased' }[type] || 'mouseMoved';
      const held = type === 'down' || type === 'up' || mouseHeld;
      await send('Input.dispatchMouseEvent', { type: t, x, y, button: held ? 'left' : 'none', buttons: type === 'up' || !held ? 0 : 1, clickCount: type === 'move' ? 0 : 1 });
      mouseHeld = type === 'down' ? true : type === 'up' ? false : mouseHeld;
    },
    async key(code, type) {
      const k = keyInfo(code);
      const base = { code: k.code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
      if (type !== 'up') await send('Input.dispatchKeyEvent', k.text ? { type: 'keyDown', ...base, text: k.text, unmodifiedText: k.text } : { type: 'rawKeyDown', ...base });
      if (type !== 'down') await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
    async click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    async touch(type, x, y) {
      const t = { touchStart: 'touchStart', touchMove: 'touchMove', touchEnd: 'touchEnd' }[type];
      await send('Input.dispatchTouchEvent', { type: t, touchPoints: t === 'touchEnd' ? [] : [{ x, y }] });
    },
    async close() {
      try { await send('Browser.close'); } catch {}
      try { ws.close(); } catch {}
      await sleep(300);
      try { proc.kill(); } catch {}
      try { rmSync(userDir, { recursive: true, force: true }); } catch {}
    },
  };
  return api;
}
