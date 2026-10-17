/* 00_core.js (core)
   Provides: SL.W, SL.H, SL.VERSION, SL.util, SL.ease, SL.color, SL.makeRng, SL.rng, SL.bus,
   SL.registry and the shared registries (enemies, bosses, hazards, backgrounds, missions, formations,
   pickupTypes, ebulletTypes, pbulletTypes, screens, sandboxes), SL.time, SL.onBoot, SL.after, SL.every,
   and the load-time debug hooks SL.debug.params (URL query) and SL.debug.sandbox(id, fn, opts).
   Internal (driven by 21_game.js): SL._updateTimers(dt), SL._clearTimers().
   Boot: runs every SL.onBoot hook once after the DOM is ready (through window.claude.hot.ready when the
   artifact host provides it), then emits 'boot'. */
(function (SL) {
  'use strict';

  SL.W = 720;
  SL.H = 1280;
  SL.VERSION = '0.9.0';

  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- util
  const warned = new Set();
  let uidSeq = 1;

  function isPlain(o) {
    if (o === null || typeof o !== 'object' || Array.isArray(o)) return false;
    const p = Object.getPrototypeOf(o);
    return p === Object.prototype || p === null;
  }
  function cloneValue(v) {
    if (Array.isArray(v)) return v.map(cloneValue);
    if (isPlain(v)) return U.deepMerge(v, null);
    return v;
  }

  const U = SL.util = {
    TAU,
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    invLerp(a, b, v) { return a === b ? 0 : (v - a) / (b - a); },
    /** Unclamped: maps v from [a0, a1] to [b0, b1]. */
    remap(v, a0, a1, b0, b1) { return b0 + (b1 - b0) * U.invLerp(a0, a1, v); },
    smoothstep(e0, e1, x) {
      const t = U.clamp(U.invLerp(e0, e1, x), 0, 1);
      return t * t * (3 - 2 * t);
    },
    approach(cur, target, maxDelta) {
      return cur < target ? Math.min(cur + maxDelta, target) : Math.max(cur - maxDelta, target);
    },
    dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); },
    dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
    angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },
    /** Wraps to [-PI, PI). */
    wrapAngle(a) {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    },
    /** Signed shortest turn from angle a to angle b, in [-PI, PI). */
    angleDiff(a, b) { return U.wrapAngle(b - a); },
    lerpAngle(a, b, t) { return a + U.angleDiff(a, b) * t; },
    rotate(x, y, a) {
      const c = Math.cos(a), s = Math.sin(a);
      return { x: x * c - y * s, y: x * s + y * c };
    },
    sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; },
    fmtInt(n) {
      n = Math.round(+n || 0);
      const s = String(Math.abs(n));
      let out = '';
      for (let i = 0; i < s.length; i++) {
        if (i && (s.length - i) % 3 === 0) out += ',';
        out += s[i];
      }
      return (n < 0 ? '-' : '') + out;
    },
    fmtTime(sec) {
      const s = Math.max(0, Math.floor(+sec || 0));
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
      const ss = (r < 10 ? '0' : '') + r;
      if (h) return h + ':' + (m < 10 ? '0' : '') + m + ':' + ss;
      return m + ':' + ss;
    },
    warnOnce(key, ...msg) {
      if (warned.has(key)) return;
      warned.add(key);
      console.warn('[SL]', ...(msg.length ? msg : [key]));
    },
    /** Returns a new object: plain objects merge recursively, everything else in b replaces a. */
    deepMerge(a, b) {
      const out = {};
      if (isPlain(a)) for (const k of Object.keys(a)) out[k] = cloneValue(a[k]);
      if (isPlain(b)) {
        for (const k of Object.keys(b)) {
          const v = b[k];
          if (v === undefined) continue;
          out[k] = isPlain(v) && isPlain(out[k]) ? U.deepMerge(out[k], v) : cloneValue(v);
        }
      }
      return out;
    },
    clone(v) { return cloneValue(v); },
    isPlain,
    hash(str) {
      let h = 2166136261 >>> 0;
      str = String(str);
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },
    uid() { return uidSeq++; },
    noop() {},
    /** Calls SL.audio[method](...args) when it exists; a throwing audio module is reported once, never fatal. */
    audio(method, ...args) {
      const A = SL.audio, fn = A && A[method];
      if (typeof fn !== 'function') return undefined;
      try { return fn.apply(A, args); } catch (err) {
        if (!warned.has('audio-threw:' + method)) {
          warned.add('audio-threw:' + method);
          console.error('[SL] SL.audio.' + method + ' threw (further errors from it are ignored):', err);
        }
        return undefined;
      }
    },
    sfx(id, opts) { return U.audio('sfx', id, opts); },
  };

  // ---------------------------------------------------------------- easing
  SL.ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => t * (2 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => { const u = t - 1; return u * u * u + 1; },
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; },
    outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };

  // ---------------------------------------------------------------- color
  const parsed = new Map();
  const strCache = new Map();
  const MAGENTA = [255, 0, 255, 1];

  function parseBasic(s) {
    if (s[0] === '#') {
      let h = s.slice(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
      if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) {
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16),
          h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
      }
      return null;
    }
    const m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && p.every((x) => !isNaN(x))) return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    return null;
  }
  // Any other CSS color (hsl(), named colors, ...) is normalized by a 1x1 canvas, once per distinct string.
  let normCtx = null;
  function parseCss(s) {
    try {
      if (!normCtx) normCtx = document.createElement('canvas').getContext('2d');
      const SENTINEL = '#010203';
      normCtx.fillStyle = SENTINEL;
      normCtx.fillStyle = s;
      const out = String(normCtx.fillStyle);
      if (out === SENTINEL && s.replace(/\s/g, '').toLowerCase() !== SENTINEL) return null;
      return parseBasic(out);
    } catch (e) { return null; }
  }

  function parse(c) {
    if (Array.isArray(c)) return c;
    let v = parsed.get(c);
    if (v) return v;
    const s = String(c).trim();
    v = parseBasic(s) || parseCss(s);
    if (!v) {
      U.warnOnce('color:' + s, 'cannot parse color "' + s + '"; using magenta');
      v = MAGENTA;
    }
    if (parsed.size > 2048) parsed.clear();
    parsed.set(c, v);
    return v;
  }
  function hex2(n) {
    n = Math.max(0, Math.min(255, Math.round(n)));
    return (n < 16 ? '0' : '') + n.toString(16);
  }
  function toHex(r, g, b) { return '#' + hex2(r) + hex2(g) + hex2(b); }

  SL.color = {
    parse,
    toHex,
    rgba(hex, a = 1) {
      // alpha is quantized to 1/1000 (the output precision) so animated alphas hit the cache
      const qa = Math.round(U.clamp(+a || 0, 0, 1) * 1000);
      const key = hex + '|' + qa;
      let s = strCache.get(key);
      if (s) return s;
      const p = parse(hex);
      s = 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + (qa / 1000).toFixed(3) + ')';
      if (strCache.size > 4096) strCache.clear();
      strCache.set(key, s);
      return s;
    },
    mix(a, b, t) {
      const p = parse(a), q = parse(b);
      return toHex(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
    },
    /** h in degrees, s and l in percent (0..100), a in 0..1. */
    hsl(h, s, l, a = 1) {
      return 'hsla(' + (+h).toFixed(1) + ',' + (+s).toFixed(1) + '%,' + (+l).toFixed(1) + '%,' + (+a).toFixed(3) + ')';
    },
    lighten(hex, amt) { return SL.color.mix(hex, '#ffffff', U.clamp(amt, 0, 1)); },
    darken(hex, amt) { return SL.color.mix(hex, '#000000', U.clamp(amt, 0, 1)); },
    luma(hex) { const p = parse(hex); return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255; },
  };

  // ---------------------------------------------------------------- rng (mulberry32)
  SL.makeRng = function (seed) {
    let s = 0;
    const r = {
      next() {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range(a, b) { return a + (b - a) * r.next(); },
      int(a, b) { return a + Math.floor(r.next() * (b - a + 1)); },
      pick(arr) { return arr && arr.length ? arr[Math.floor(r.next() * arr.length)] : undefined; },
      chance(p) { return r.next() < p; },
      sign() { return r.next() < 0.5 ? -1 : 1; },
      gauss() {
        let u = 0;
        while (u === 0) u = r.next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r.next());
      },
      seed(n) {
        s = (typeof n === 'string' ? U.hash(n) : Math.floor(+n || 0)) >>> 0;
        r.initial = s;
        return r;
      },
      initial: 0,
    };
    r.seed(seed == null ? (Date.now() ^ 0x5bd1e995) : seed);
    return r;
  };
  SL.rng = SL.makeRng();

  // ---------------------------------------------------------------- event bus
  const listeners = new Map();
  const dirty = new Set();
  let emitting = 0;

  function compact() {
    for (const evt of dirty) {
      const a = listeners.get(evt);
      if (a) listeners.set(evt, a.filter(Boolean));
    }
    dirty.clear();
  }
  function call(fn, data, evt) {
    try { fn(data, evt); } catch (err) { console.error('[SL.bus] listener for "' + evt + '" threw:', err); }
  }

  SL.bus = {
    on(evt, fn) {
      if (typeof fn !== 'function') return U.noop;
      let a = listeners.get(evt);
      if (!a) listeners.set(evt, (a = []));
      a.push(fn);
      return () => SL.bus.off(evt, fn);
    },
    once(evt, fn) {
      const off = SL.bus.on(evt, function onceWrapper(data, e) { off(); fn(data, e); });
      return off;
    },
    off(evt, fn) {
      const a = listeners.get(evt);
      if (!a) return;
      const i = a.indexOf(fn);
      if (i < 0) return;
      if (emitting) { a[i] = null; dirty.add(evt); } else a.splice(i, 1);
    },
    emit(evt, data) {
      const a = listeners.get(evt), w = listeners.get('*');
      if ((!a || !a.length) && (!w || !w.length)) return;
      emitting++;
      if (a) for (let i = 0, n = a.length; i < n; i++) if (a[i]) call(a[i], data, evt);
      if (w) for (let i = 0, n = w.length; i < n; i++) if (w[i]) call(w[i], data, evt);
      emitting--;
      if (!emitting && dirty.size) compact();
    },
    count(evt) { const a = listeners.get(evt); return a ? a.filter(Boolean).length : 0; },
    /** Like on(), but the listener is removed automatically at the next 'missionEnd' (mission complete, fail, quit or
        restart), so per-mission listeners added in onStart / init cannot pile up across runs. Returns off(). */
    onMission(evt, fn) {
      const off = SL.bus.on(evt, fn);
      if (off !== U.noop) missionOffs.push(off);
      return off;
    },
  };
  const missionOffs = [];
  SL.bus.on('missionEnd', () => {
    const list = missionOffs.splice(0, missionOffs.length);
    for (let i = 0; i < list.length; i++) list[i]();
  });

  // ---------------------------------------------------------------- registries
  SL.registry = function (kind) {
    const defs = Object.create(null);
    const reg = {
      kind,
      defs,
      define(id, def) {
        if (typeof id !== 'string' || !id) {
          console.warn('[SL] ' + kind + '.define needs a string id; got', id);
          return def;
        }
        if (def && (typeof def === 'object' || typeof def === 'function')) {
          try { def.id = id; } catch (e) { /* frozen def: keep as is */ }
        }
        defs[id] = def;
        return def;
      },
      get(id) {
        const d = defs[id];
        if (d !== undefined) return d;
        U.warnOnce(kind + ':' + id, 'unknown ' + kind + ' id "' + id + '"');
        return null;
      },
      has(id) { return defs[id] !== undefined; },
      ids() { return Object.keys(defs); },
      all() { return Object.keys(defs).map((k) => defs[k]); },
    };
    return reg;
  };
  ['enemies', 'bosses', 'hazards', 'backgrounds', 'missions', 'formations', 'pickupTypes',
    'ebulletTypes', 'pbulletTypes', 'screens', 'sandboxes'].forEach((k) => { SL[k] = SL.registry(k); });
  // Path helpers (owned by 11_enemies.js): a registry too, so SL.paths.define(id, fn) / get(id) work from load time;
  // plain properties (SL.paths.swoop = fn) also work.
  SL.paths = SL.registry('paths');

  // ---------------------------------------------------------------- time + game-time timers
  SL.time = { t: 0, real: 0, scale: 1, paused: false };

  const timers = [];
  let timerGen = 0;
  function addTimer(sec, fn, every, count) {
    const tm = {
      t: Math.max(0, +sec || 0), every, count, n: 0, fn, dead: false,
      cancel() { tm.dead = true; },
    };
    if (typeof fn === 'function' && count > 0) timers.push(tm); else tm.dead = true;
    return tm;
  }
  /** Calls fn once after `seconds` of game time. Returns {cancel()}. Cleared at mission start/end. */
  SL.after = function (seconds, fn) { return addTimer(seconds, fn, 0, 1); };
  /** Calls fn(i) every `seconds` of game time, `count` times (default forever). Returns {cancel()}. */
  SL.every = function (seconds, fn, count) {
    const every = Math.max(1 / 240, +seconds || 0);
    return addTimer(every, fn, every, count == null ? Infinity : count);
  };
  SL._updateTimers = function (dt) {
    let anyDead = false;
    const gen = timerGen;
    for (let i = 0, n = timers.length; i < n; i++) {
      // a callback that ended the run (completeMission, retry, quitMission ...) cleared the list: stop here
      if (gen !== timerGen) return;
      const tm = timers[i];
      if (!tm) break;
      if (tm.dead) { anyDead = true; continue; }
      tm.t -= dt;
      let guard = 8;
      while (tm.t <= 0 && !tm.dead && guard-- > 0) {
        try { tm.fn(tm.n); } catch (err) { console.error('[SL] timer callback threw:', err); }
        tm.n++;
        if (!tm.every || tm.n >= tm.count) { tm.dead = true; break; }
        tm.t += tm.every;
      }
      if (tm.dead) anyDead = true;
    }
    if (anyDead) {
      let j = 0;
      for (let i = 0; i < timers.length; i++) if (!timers[i].dead) timers[j++] = timers[i];
      timers.length = j;
    }
  };
  SL._clearTimers = function () {
    for (const tm of timers) tm.dead = true;
    timers.length = 0;
    timerGen++;
  };
  SL._timerCount = function () { return timers.length; };

  // ---------------------------------------------------------------- debug hooks usable at load time
  // 22_debug.js loads last and fills in the rest of SL.debug. URL params and sandbox registration live
  // here so every file can read params and register sandboxes while it loads.
  function parseParams() {
    const out = {};
    try { new URLSearchParams(window.location.search).forEach((v, k) => { out[k] = v; }); } catch (e) { /* no location */ }
    return out;
  }
  SL.debug = SL.debug || {};
  SL.debug.params = parseParams();
  /** Registers a sandbox: fn(session) runs inside an empty endless mission; it may return update(dt). */
  SL.debug.sandbox = function (id, fn, opts) {
    if (typeof fn !== 'function') { console.warn('[SL] debug.sandbox("' + id + '") needs a function'); return; }
    SL.sandboxes.define(id, Object.assign({ run: fn }, opts || {}));
  };

  // ---------------------------------------------------------------- boot
  const bootFns = [];
  let booted = false;
  SL.booted = false;
  SL.hotData = {};

  /** Runs fn once after every script has loaded and the DOM is ready (in registration order). */
  SL.onBoot = function (fn) {
    if (typeof fn !== 'function') return;
    if (booted) {
      try { fn(); } catch (err) { console.error('[SL] onBoot hook threw:', err); }
    } else bootFns.push(fn);
  };

  function runBoot(hotData) {
    if (booted) return;
    booted = true;
    SL.hotData = hotData && typeof hotData === 'object' ? hotData : {};
    for (let i = 0; i < bootFns.length; i++) {
      try { bootFns[i](); } catch (err) { console.error('[SL] onBoot hook threw:', err); }
    }
    bootFns.length = 0;
    SL.booted = true;
    SL.bus.emit('boot', {});
  }

  function kick() {
    let hot = null;
    try { hot = window.claude && window.claude.hot; } catch (e) { hot = null; }
    if (hot && typeof hot.ready === 'function') {
      let done = false;
      const go = (data) => {
        if (done) return;
        done = true;
        let d = data;
        if (!d || typeof d !== 'object') { try { d = hot.data; } catch (e) { d = null; } }
        runBoot(d || {});
      };
      try { hot.ready(go); } catch (e) { go(null); }
      setTimeout(() => go(null), 2500);
    } else {
      let d = null;
      try { d = hot && hot.data; } catch (e) { d = null; }
      runBoot(d || {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kick, { once: true });
  else setTimeout(kick, 0);
})(window.SL = window.SL || {});
