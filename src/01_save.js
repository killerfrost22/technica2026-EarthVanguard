/* 01_save.js (core)
   Provides: SL.save = { data, settings, load(), commit(), flush(), reset({settings}), defaults(),
   defaultSettings(), exportCode(), importCode(str), sample(name), useSample(name), setSetting(key, value),
   mission(id), samples, memoryOnly, storageAvailable }.
   Every storage access is wrapped in try/catch with an in-memory fallback, so the game works with no
   storage at all. Keys: earthvanguard.save.v1 and earthvanguard.settings.v1. Emits 'settingsChanged', 'saveLoaded',
   'saveImported', 'saveReset'. */
(function (SL) {
  'use strict';

  const U = SL.util;
  const KEY = 'earthvanguard.save.v1';
  const SKEY = 'earthvanguard.settings.v1';
  const DIFFS = ['cadet', 'pilot', 'ace'];
  const QUALITIES = ['auto', 'high', 'medium', 'low'];
  const memory = Object.create(null);

  function storage() {
    try { return window.localStorage || null; } catch (e) { return null; }
  }
  function read(key) {
    try {
      const s = storage();
      if (s) {
        const v = s.getItem(key);
        if (v != null) return v;
      }
    } catch (e) { /* blocked storage: fall through to memory */ }
    return memory[key] != null ? memory[key] : null;
  }
  function write(key, value) {
    memory[key] = value;
    try {
      const s = storage();
      if (!s) return false;
      s.setItem(key, value);
      return true;
    } catch (e) { return false; }
  }
  function probe() {
    try {
      const s = storage();
      if (!s) return false;
      s.setItem('earthvanguard.probe', '1');
      s.removeItem('earthvanguard.probe');
      return true;
    } catch (e) { return false; }
  }

  function defaults() {
    return {
      v: 1, callsign: 'LANCE', p2callsign: '', credits: 0, sp: 0, difficulty: 'pilot',
      missions: {}, choices: {}, flags: {}, upgrades: {},
      skills: { owned: [], equipped: [null, null] },
      rescuedTotal: 0, stats: { kills: 0, deaths: 0, playSeconds: 0, bombs: 0 }, updatedAt: 0,
    };
  }
  function defaultSettings() {
    return {
      master: 0.9, music: 0.7, sfx: 0.85, autoFire: true, quality: 'auto', shake: 1.0, flashes: true,
      showHitbox: 'focus', touchSensitivity: 1.0, radioSpeed: 1.0,
    };
  }

  function num(v, def, lo, hi) {
    v = +v;
    if (!isFinite(v)) return def;
    return U.clamp(v, lo, hi);
  }
  function obj(v) { return U.isPlain(v) ? v : {}; }

  function normalizeData(d) {
    d = U.deepMerge(defaults(), obj(d));
    d.v = 1;
    d.callsign = String(d.callsign || 'LANCE').slice(0, 16);
    d.p2callsign = String(d.p2callsign || '').slice(0, 16);
    d.credits = Math.floor(num(d.credits, 0, 0, 1e9));
    d.sp = Math.floor(num(d.sp, 0, 0, 1e6));
    if (DIFFS.indexOf(d.difficulty) < 0) d.difficulty = 'pilot';
    d.missions = obj(d.missions);
    d.choices = obj(d.choices);
    d.flags = obj(d.flags);
    d.upgrades = obj(d.upgrades);
    d.skills = obj(d.skills);
    if (!Array.isArray(d.skills.owned)) d.skills.owned = [];
    if (!Array.isArray(d.skills.equipped)) d.skills.equipped = [null, null];
    while (d.skills.equipped.length < 2) d.skills.equipped.push(null);
    d.rescuedTotal = Math.floor(num(d.rescuedTotal, 0, 0, 1e9));
    d.stats = U.deepMerge({ kills: 0, deaths: 0, playSeconds: 0, bombs: 0 }, obj(d.stats));
    return d;
  }
  function normalizeSettings(s) {
    s = U.deepMerge(defaultSettings(), obj(s));
    s.master = num(s.master, 0.9, 0, 1);
    s.music = num(s.music, 0.7, 0, 1);
    s.sfx = num(s.sfx, 0.85, 0, 1);
    s.autoFire = s.autoFire !== false;
    if (QUALITIES.indexOf(s.quality) < 0) s.quality = 'auto';
    s.shake = num(s.shake, 1, 0, 2);
    s.flashes = s.flashes !== false;
    if (s.showHitbox !== 'always') s.showHitbox = 'focus';
    s.touchSensitivity = num(s.touchSensitivity, 1, 0.25, 3);
    s.radioSpeed = num(s.radioSpeed, 1, 0.25, 4);
    return s;
  }
  function parseJSON(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  // Sample saves for tests and the ?save= param. Progress may override any of these through
  // SL.save.samples[name] (an object merged over defaults, or a function returning one).
  const MAIN = ['m1', 'm2', 'm3', 'm4', 'm5'];
  const SIDE = ['s1', 's2', 's3', 's4'];
  function rec(rank, best) { return { done: true, best, rank, rescued: 6, plays: 2 }; }
  const CORE_SAMPLES = {
    fresh: () => ({}),
    mid: () => ({
      credits: 2400, sp: 2, rescuedTotal: 14,
      missions: { m1: rec('A', 184200), m2: rec('B', 152900) },
      flags: { unlock_s1: true },
      stats: { kills: 640, deaths: 3, playSeconds: 1500, bombs: 6 },
    }),
    late: () => ({
      credits: 6800, sp: 5, rescuedTotal: 41,
      missions: { m1: rec('S', 240100), m2: rec('A', 210400), m3: rec('A', 233000), m4: rec('B', 198300),
        s1: rec('A', 90100), s2: rec('B', 75600) },
      choices: { s1: ['a'], s2: ['b'] },
      flags: { unlock_s1: true, unlock_s2: true, unlock_s3: true },
      stats: { kills: 2310, deaths: 9, playSeconds: 5200, bombs: 21 },
    }),
    full: () => {
      const missions = {};
      MAIN.concat(SIDE).forEach((id, i) => { missions[id] = rec('S', 250000 + i * 9000); });
      const flags = {};
      SIDE.forEach((id) => { flags['unlock_' + id] = true; });
      return {
        credits: 50000, sp: 20, rescuedTotal: 120, missions, flags,
        choices: { s1: ['a', 'b'], s2: ['a', 'b'], s3: ['a', 'b'], s4: ['a', 'b'] },
        stats: { kills: 6400, deaths: 20, playSeconds: 14400, bombs: 60 },
      };
    },
  };

  let timer = 0;
  let pending = false;
  let firstPending = 0;

  const S = SL.save = {
    KEY, SKEY,
    data: defaults(),
    settings: defaultSettings(),
    samples: {},
    /** true after useSample(): nothing is written to storage for the rest of the session. */
    memoryOnly: false,
    storageAvailable: false,
    defaults,
    defaultSettings,

    load() {
      S.storageAvailable = probe();
      const hot = SL.hotData || {};
      const d = U.isPlain(hot.save) ? hot.save : parseJSON(read(KEY));
      const s = U.isPlain(hot.settings) ? hot.settings : parseJSON(read(SKEY));
      S.data = normalizeData(d);
      S.settings = normalizeSettings(s);
      SL.bus.emit('saveLoaded', { data: S.data, settings: S.settings });
      return S.data;
    },

    /** Debounced (300 ms) write of progress and settings. A steady stream of commits still writes at least every 2 s. */
    commit() {
      const now = Date.now();
      if (!pending) firstPending = now;
      pending = true;
      clearTimeout(timer);
      timer = setTimeout(S.flush, Math.max(0, Math.min(300, firstPending + 2000 - now)));
    },

    flush() {
      clearTimeout(timer);
      if (!pending) return;
      pending = false;
      S.data.updatedAt = Date.now();
      if (S.memoryOnly) return;
      let text, stext;
      try { text = JSON.stringify(S.data); stext = JSON.stringify(S.settings); } catch (e) { console.warn('[SL.save] save data is not serializable', e); return; }
      write(KEY, text);
      write(SKEY, stext);
    },

    /** Resets progress (and settings too with {settings:true}). */
    reset(opts) {
      S.data = defaults();
      if (opts && opts.settings) S.settings = defaultSettings();
      S.commit();
      SL.bus.emit('saveReset', { data: S.data });
      return S.data;
    },

    exportCode() {
      let json;
      try { json = JSON.stringify(S.data); } catch (e) { console.warn('[SL.save] save data is not serializable', e); return ''; }
      const bytes = new TextEncoder().encode(json);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const body = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return 'SL1.' + body + '.' + (U.hash(body) % 46656).toString(36).padStart(3, '0');
    },

    importCode(str) {
      try {
        const clean = String(str || '').replace(/\s+/g, '');
        const m = /^SL1\.([A-Za-z0-9_-]+)\.([0-9a-z]{3})$/.exec(clean);
        if (!m) return false;
        if ((U.hash(m[1]) % 46656).toString(36).padStart(3, '0') !== m[2]) return false;
        let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const d = JSON.parse(new TextDecoder().decode(bytes));
        if (!U.isPlain(d) || d.v !== 1) return false;
        S.data = normalizeData(d);
        S.commit();
        SL.bus.emit('saveImported', { data: S.data });
        return true;
      } catch (e) {
        return false;
      }
    },

    /** Returns a fresh save object for 'fresh' | 'mid' | 'late' | 'full' (does not apply it). */
    sample(name) {
      const over = S.samples[name];
      let extra;
      if (typeof over === 'function') extra = over();
      else if (U.isPlain(over)) extra = over;
      else if (CORE_SAMPLES[name]) extra = CORE_SAMPLES[name]();
      else {
        U.warnOnce('save-sample:' + name, 'unknown sample save "' + name + '"; using fresh');
        extra = {};
      }
      return normalizeData(U.deepMerge(defaults(), extra));
    },

    /** Applies a sample in memory only (storage is left untouched for the rest of the session). */
    useSample(name) {
      S.data = S.sample(name);
      S.memoryOnly = true;
      SL.bus.emit('saveLoaded', { data: S.data, settings: S.settings, sample: name });
      return S.data;
    },

    setSetting(key, value) {
      const next = normalizeSettings(Object.assign({}, S.settings, { [key]: value }));
      S.settings[key] = next[key];
      S.commit();
      SL.bus.emit('settingsChanged', { key, value: S.settings[key], settings: S.settings });
      return S.settings[key];
    },

    /** The record for a mission id, with defaults (does not create it). */
    mission(id) {
      return Object.assign({ done: false, best: 0, rank: '', rescued: 0, plays: 0 }, S.data.missions[id] || {});
    },
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') S.flush();
  });
  window.addEventListener('pagehide', () => S.flush());

  SL.onBoot(() => { S.load(); });
})(window.SL = window.SL || {});
