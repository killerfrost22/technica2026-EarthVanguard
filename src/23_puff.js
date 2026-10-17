/* 23_puff.js (puff)
   Provides: SL.puff = { unlocked(), titleButton() -> <button>, open(), state, mode, run, level, sim(seconds),
   simRuns(count, seconds) -> report } and the 'puff' screen: Puff's Ocean, a voice-controlled minigame unlocked
   by clearing m1.
   Puff is {callsign}'s pufferfish buddy aboard the Halcyon. In the minigame Puff swims home through Earth's polluted
   ocean. Loudness sets Puff's size and buoyancy: loud = puff up and float, quiet = shrink and sink. Big Puff can't
   fit under the garbage patch; small Puff sinks into the oil-free deep. Keys / touch / gamepad hold work too.
   The mic only measures loudness inside the page (getUserMedia -> AnalyserNode RMS); nothing is recorded or sent.
   The screen draws on its own canvas inside #ui with its own requestAnimationFrame loop, started in onShow and
   stopped in onHide (which also releases the mic).
   URL test hooks (with ?screen=puff): puff=play (start in keys mode), puff=bot (start with the bot flying),
   t=<sec> (fast-forward), puffsim=<runs> (bot-play that many 90 s runs, report in window.__PUFF__ and the console). */
(function (SL) {
  'use strict';

  const U = SL.util;
  const W = SL.W, H = SL.H;
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ tuning
  const SURFACE = 170;          // water line
  const BED = 1150;             // top of the sand
  const FX = 210;               // Puff's x
  const R_MIN = 26, R_MAX = 72; // body radius, deflated .. fully puffed
  const V_SINK = 330, V_RISE = -400; // vertical speed at level 0 and level 1 (neutral near 0.45)
  const V_RESP = 7;             // how fast Puff reaches that speed (1/s)
  const MAX_HEARTS = 3;
  const STAR_COOLDOWN = 14;
  const UNLOCK_MISSION = 'm1';
  // TEMPORARY for team playtesting: Puff's Ocean is open without clearing m1. Set to false before submitting.
  const PLAYTEST_UNLOCK = true;

  function radiusFor(L) { return R_MIN + (R_MAX - R_MIN) * Math.pow(U.clamp(L, 0, 1), 0.9); }
  function speedFor(t) { return 230 + Math.min(130, t * 1.1); }
  function levelForVy(vy) { return U.clamp((V_SINK - vy) / (V_SINK - V_RISE), 0, 1); }

  const FACTS = [
    'About 11 million metric tons of plastic flow into the ocean every year.',
    'Lost fishing nets make up nearly half the weight of the Great Pacific Garbage Patch.',
    'Sea turtles can mistake floating plastic bags for jellyfish, one of their favorite foods.',
    'Six-pack rings can trap fish and seabirds. Snip every loop before you throw them away.',
    'One gallon of used motor oil can contaminate a million gallons of fresh water (US EPA).',
    'Leaking drums of chemicals can sit on the seafloor for decades.',
  ];

  // ------------------------------------------------------------------ save
  function store() {
    const d = SL.save.data;
    if (!U.isPlain(d.puff)) d.puff = {};
    const p = d.puff;
    p.best = Math.max(0, Math.floor(+p.best || 0));
    p.plays = Math.max(0, Math.floor(+p.plays || 0));
    p.pearls = Math.max(0, Math.floor(+p.pearls || 0));
    p.sens = U.clamp(+p.sens || 1, 0.5, 2);
    return p;
  }
  function unlocked() {
    const d = SL.save.data;
    if (PLAYTEST_UNLOCK) return true;
    return !!((d.flags && d.flags.unlock_puff) || (SL.save.mission && SL.save.mission(UNLOCK_MISSION).done));
  }
  function callsign() { return (SL.save.data && SL.save.data.callsign) || 'LANCE'; }

  // ------------------------------------------------------------------ audio (own context: it also hosts the mic)
  const snd = { ac: null, out: null, noise: null, amb: null, lastBubble: 0 };
  function audioOn() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!snd.ac) {
        snd.ac = new AC();
        snd.out = snd.ac.createGain();
        snd.out.connect(snd.ac.destination);
      }
      if (snd.ac.state === 'suspended') snd.ac.resume().catch(() => {});
      const s = SL.save.settings || {};
      snd.out.gain.value = SL.audio && SL.audio.muted ? 0 : (s.master != null ? s.master : 0.9) * (s.sfx != null ? s.sfx : 0.85);
      return snd.ac;
    } catch (e) { return null; }
  }
  function noiseBuf() {
    if (snd.noise || !snd.ac) return snd.noise;
    const n = snd.ac.sampleRate;
    const b = snd.ac.createBuffer(1, n, n);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return (snd.noise = b);
  }
  function tone(f0, f1, dur, gain, type, delay) {
    const ac = snd.ac;
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(snd.out);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  function hiss(dur, gain, freq, q) {
    const ac = snd.ac;
    if (!ac || ac.state !== 'running' || !noiseBuf()) return;
    const t = ac.currentTime;
    const s = ac.createBufferSource();
    s.buffer = snd.noise;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q || 1;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(snd.out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }
  // In voice mode the effects stay short and quiet so the mic doesn't hear them as the player.
  function sfx(id) {
    if (G.simulating) return;
    const v = G.mode === 'voice' ? 0.45 : 1;
    switch (id) {
      case 'pearl': tone(1320, 1760, 0.12, 0.08 * v); tone(1980, 2640, 0.1, 0.04 * v, 'sine', 0.05); break;
      case 'star': [660, 880, 1320].forEach((f, i) => tone(f, f * 1.01, 0.16, 0.08 * v, 'triangle', i * 0.07)); break;
      case 'shield': tone(520, 1040, 0.3, 0.07 * v, 'sine'); hiss(0.25, 0.05 * v, 2400, 2); break;
      case 'pop': hiss(0.18, 0.18 * v, 1800, 0.8); tone(900, 300, 0.12, 0.06 * v); break;
      case 'bonk': tone(240, 80, 0.3, 0.2 * v, 'triangle'); hiss(0.2, 0.12 * v, 500, 1); break;
      case 'bubble': {
        const now = performance.now();
        if (now - snd.lastBubble < 140) return;
        snd.lastBubble = now;
        tone(280 + Math.random() * 120, 700 + Math.random() * 300, 0.09, 0.035 * v);
        break;
      }
      case 'start': [523, 659, 784].forEach((f, i) => tone(f, f, 0.14, 0.07 * v, 'triangle', i * 0.08)); break;
      case 'over': [440, 349, 262].forEach((f, i) => tone(f, f * 0.98, 0.26, 0.08 * v, 'triangle', i * 0.16)); break;
      case 'tick': tone(880, 880, 0.06, 0.05 * v, 'square'); break;
      default: break;
    }
  }
  // Soft surf rumble in keys mode only (never while the mic listens).
  function ambient(on) {
    const ac = snd.ac;
    if (on && !snd.amb && ac && ac.state === 'running' && noiseBuf()) {
      const s = ac.createBufferSource();
      s.buffer = snd.noise;
      s.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 380;
      const g = ac.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.05, ac.currentTime + 1.2);
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.frequency.value = 0.12;
      lg.gain.value = 0.02;
      lfo.connect(lg);
      lg.connect(g.gain);
      s.connect(f);
      f.connect(g);
      g.connect(snd.out);
      s.start();
      lfo.start();
      snd.amb = { s, lfo, g };
    } else if (!on && snd.amb) {
      const a = snd.amb;
      snd.amb = null;
      try {
        a.g.gain.cancelScheduledValues(ac.currentTime);
        a.g.gain.setValueAtTime(a.g.gain.value, ac.currentTime);
        a.g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
        a.s.stop(ac.currentTime + 0.45);
        a.lfo.stop(ac.currentTime + 0.45);
      } catch (e) { /* already stopped */ }
    }
  }

  // ------------------------------------------------------------------ mic
  const mic = { stream: null, src: null, an: null, buf: null, db: -100, floor: -60, peak: -20, ok: false };
  async function micStart() {
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) throw new Error('nomic');
    const ac = audioOn();
    if (!ac) throw new Error('noaudio');
    if (!mic.stream) {
      mic.stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
      mic.src = ac.createMediaStreamSource(mic.stream);
      mic.an = ac.createAnalyser();
      mic.an.fftSize = 1024;
      mic.buf = new Float32Array(mic.an.fftSize);
      mic.src.connect(mic.an);
    }
    mic.ok = true;
  }
  function micStop() {
    if (mic.stream) mic.stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* gone */ } });
    if (mic.src) { try { mic.src.disconnect(); } catch (e) { /* gone */ } }
    mic.stream = mic.src = mic.an = mic.buf = null;
    mic.ok = false;
  }
  function micRead() {
    if (!mic.an) return -100;
    mic.an.getFloatTimeDomainData(mic.buf);
    let s = 0;
    for (let i = 0; i < mic.buf.length; i++) s += mic.buf[i] * mic.buf[i];
    const rms = Math.sqrt(s / mic.buf.length);
    mic.db = 20 * Math.log10(Math.max(rms, 1e-5));
    return mic.db;
  }
  function micLevel(db) {
    const lo = mic.floor + 4, hi = Math.max(lo + 6, mic.peak - 3);
    const k = (db - lo) / (hi - lo);
    return U.clamp(k * store().sens, 0, 1);
  }
  function pct(arr, p) {
    if (!arr.length) return -100;
    const a = arr.slice().sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(p * a.length))];
  }

  // ------------------------------------------------------------------ state
  const G = SL.puff = {
    state: 'off',   // off | intro | micwait | calib | ready | play | paused | over | error
    mode: 'keys',   // keys | voice
    run: null,
    level: 0,       // smoothed control level 0..1
    bot: false,
    simulating: false,
    unlocked,
  };
  let rng = SL.makeRng(1);
  let ui = null; // { root, canvas, ctx, panel, meter }

  function newRun(seed) {
    rng = SL.makeRng(seed != null ? seed : (Date.now() & 0x7fffffff));
    G.level = 0;
    G.run = {
      t: 0, dist: 0, score: 0, pearls: 0, hearts: MAX_HEARTS, shield: false, inv: 0, hits: 0,
      y: (SURFACE + BED) / 2, vy: 0, r: radiusFor(0.45), mood: 0, moodKind: '', dead: 0, over: false,
      obs: [], items: [], parts: [], wait: 420, prevOut: (SURFACE + BED) / 2, pending: null, lastStar: -99, lastBubble: 0,
      lanes: [], hitLog: [], scroll: 0, startT: 0, hintT: 0, newBest: false,
    };
    G.run.pending = pickPattern(G.run);
    G.run.wait = 260 + travel(G.run.y, G.run.pending, speedFor(0));
  }

  // ------------------------------------------------------------------ obstacles and the spawner
  // Each pattern: { kind, tin (safe y entering), tout (safe y leaving), w (extent), make(x) }.
  function pickPattern(R) {
    const t = R.t;
    const tier = t < 20 ? 0 : t < 50 ? 1 : 2;
    const weights = [
      ['net', 3], ['patch', tier ? 2.4 : 1.6], ['oil', tier ? 1.6 : 1], ['bags', 2],
      ['rings', tier ? 1.4 : 0.6], ['barrel', tier ? 1.4 : 0.5], ['cans', 1],
    ];
    let sum = 0;
    for (const w of weights) if (w[0] !== R.lastKind || w[0] === 'net') sum += w[1];
    let k = rng.next() * sum, kind = 'net';
    for (const w of weights) {
      if (w[0] === R.lastKind && w[0] !== 'net') continue;
      k -= w[1];
      if (k <= 0) { kind = w[0]; break; }
    }
    return PATTERNS[kind](R, tier);
  }

  const PATTERNS = {
    net(R, tier) {
      const gh = [340, 300, 270][tier] - rng.range(0, 20);
      const c = rng.range(SURFACE + gh / 2 + 40, BED - gh / 2 - 40);
      return {
        kind: 'net', tin: c, tout: c, w: 80,
        make(x) {
          R.obs.push({ type: 'net', x, w: 80, top: c - gh / 2, bot: c + gh / 2, seed: rng.next() * 100 });
          pearlLine(R, x - 150, c, x + 40, c, 4);
          maybeStar(R, x + 40, c, 0.35);
        },
      };
    },
    patch(R, tier) {
      const th = [125, 110, 98][tier];
      const w = rng.range(260, 340) + tier * 50;
      const floorY = BED - 34;
      return {
        kind: 'patch', tin: floorY, tout: floorY, w,
        make(x) {
          R.obs.push(makePatch(x, w, BED - th));
          pearlLine(R, x + 30, floorY, x + w - 30, floorY, Math.round(w / 70));
          maybeStar(R, x + w / 2, floorY - 4, 0.55);
        },
      };
    },
    oil(R, tier) {
      const depth = rng.range(250, 320) + tier * 60;
      const w = rng.range(420, 560);
      const lane = U.clamp(SURFACE + depth + rng.range(130, 260), SURFACE + depth + 110, BED - 80);
      return {
        kind: 'oil', tin: lane, tout: lane, w,
        make(x) {
          R.obs.push(makeOil(x, w, depth));
          pearlLine(R, x + 40, lane, x + w - 40, lane, Math.round(w / 90));
        },
      };
    },
    bags(R, tier) {
      // two drifting bags with a swimmable lane between them
      const lane = rng.range(SURFACE + 220, BED - 220);
      const half = [170, 150, 135][tier];
      return {
        kind: 'bags', tin: lane, tout: lane, w: 260,
        make(x) {
          R.obs.push(makeBag(x + 70, lane - half - 36, rng));
          R.obs.push(makeBag(x + 200, lane + half + 36, rng));
          if (lane - half - 260 > SURFACE + 40 && rng.chance(0.5)) R.obs.push(makeBag(x + 300, lane - half - 230, rng));
          pearlLine(R, x, lane, x + 260, lane, 4);
        },
      };
    },
    rings(R, tier) {
      const c = rng.range(SURFACE + 260, BED - 260);
      const up = rng.chance(0.5);
      const lane = up ? c + 210 : c - 210;
      return {
        kind: 'rings', tin: lane, tout: lane, w: 120,
        make(x) {
          R.obs.push({ type: 'rings', x: x + 60, y: c, y0: c, w: 0, r: 46, amp: 60 + tier * 20, ph: rng.next() * TAU, rot: 0, spin: rng.range(-1.2, 1.2) });
          pearlLine(R, x - 30, lane, x + 150, lane, 3);
        },
      };
    },
    barrel(R) {
      // a leaking drum sinking from the surface: stay high and let it fall past
      // w covers the drum, which ends up resting on the sand: the next pattern starts past it
      const lane = SURFACE + 110;
      return {
        kind: 'barrel', tin: lane, tout: lane, w: 260,
        make(x) {
          R.obs.push({ type: 'barrel', x: x + 160, y: SURFACE - 70, w: 0, r: 42, vy: 170, rot: rng.range(-0.3, 0.3), spin: rng.range(-0.6, 0.6), drip: 0 });
          pearlLine(R, x + 60, lane, x + 260, lane, 3);
        },
      };
    },
    cans(R) {
      const c = rng.range(SURFACE + 200, BED - 200);
      const up = rng.chance(0.5);
      const lane = U.clamp(up ? c - 170 : c + 170, SURFACE + 80, BED - 60);
      return {
        kind: 'cans', tin: lane, tout: lane, w: 160,
        make(x) {
          for (let i = 0; i < 3; i++) {
            R.obs.push({ type: 'can', x: x + 30 + i * 55, y: c + rng.range(-40, 40), w: 0, r: 20, rot: rng.range(0, TAU), spin: rng.range(-2, 2), ph: rng.next() * TAU, hue: rng.int(0, 2) });
          }
          pearlLine(R, x, lane, x + 160, lane, 3);
        },
      };
    },
  };

  function makePatch(x, w, bottom) {
    const items = [];
    const n = Math.round(w / 9);
    for (let i = 0; i < n; i++) {
      items.push({
        dx: rng.range(8, w - 8), dy: rng.range(0, bottom - SURFACE + 10), kind: rng.int(0, 5),
        rot: rng.range(-1.2, 1.2), s: rng.range(0.8, 1.3), c: rng.int(0, 3),
      });
    }
    items.sort((a, b) => a.dy - b.dy);
    const bumps = [];
    for (let i = 0; i <= 8; i++) bumps.push(rng.range(-14, 6));
    const sides = [];
    for (let i = 0; i <= 6; i++) sides.push([rng.range(-10, 12), rng.range(-10, 12)]);
    const drips = [];
    for (let i = 0; i < 4; i++) drips.push({ dx: rng.range(20, w - 20), len: rng.range(16, 34), ph: rng.next() * TAU });
    return { type: 'patch', x, w, bottom, items, bumps, sides, drips };
  }
  function makeOil(x, w, depth) {
    const drips = [];
    for (let i = 0; i < Math.round(w / 60); i++) drips.push({ dx: rng.range(20, w - 20), len: rng.range(20, 60), ph: rng.next() * TAU, r: rng.range(6, 11) });
    const wave = [];
    for (let i = 0; i <= 10; i++) wave.push(rng.range(-18, 10));
    return { type: 'oil', x, w, depth, drips, wave };
  }
  function makeBag(x, y, r) {
    return { type: 'bag', x, y, y0: y, w: 0, r: 36, ph: r.next() * TAU, vx: r.range(-30, 20), tint: r.int(0, 2) };
  }

  function pearlLine(R, x0, y0, x1, y1, n) {
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0.5 : i / (n - 1);
      R.items.push({ type: 'pearl', x: U.lerp(x0, x1, k), y: U.lerp(y0, y1, k), r: 13, ph: rng.next() * TAU });
    }
  }
  function maybeStar(R, x, y, chance) {
    if (R.t - R.lastStar < STAR_COOLDOWN || !rng.chance(chance)) return;
    R.lastStar = R.t;
    // the pearl that sits there gives way to the starfish
    for (const it of R.items) if (it.type === 'pearl' && Math.abs(it.x - x) < 40 && Math.abs(it.y - y) < 40) it.dead = true;
    R.items.push({ type: 'star', x, y, r: 22, ph: 0 });
  }

  // distance Puff needs to swim from one safe line to the next pattern's entry line
  function travel(fromY, next, spd) {
    const vmax = next.tin > fromY ? V_SINK : -V_RISE;
    return spd * (Math.abs(next.tin - fromY) / (vmax * 0.8) + 0.8);
  }

  function spawnUpdate(R, spd, dt) {
    R.wait -= spd * dt;
    if (R.wait > 0) return;
    const x = W + 60;
    const cur = R.pending;
    cur.make(x);
    R.lanes.push({ x: x + cur.w, tin: cur.tin, x0: x });
    R.lastKind = cur.kind;
    R.prevOut = cur.tout;
    if (R.t > 8 && R.t - R.lastBubble > 22 && rng.chance(0.35)) {
      R.lastBubble = R.t;
      R.items.push({ type: 'bubble', x: x + cur.w + 120, y: cur.tout, r: 24, ph: 0 });
    }
    const next = pickPattern(R);
    R.pending = next;
    // leave room to swim from this pattern's exit line to the next one's entry line
    R.wait += cur.w + Math.max(travel(cur.tout, next, spd), 230 + rng.range(0, 120));
  }

  // ------------------------------------------------------------------ collision helpers
  function hitRect(cx, cy, r, x, y, w, h) {
    const nx = U.clamp(cx, x, x + w), ny = U.clamp(cy, y, y + h);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }
  function hitCirc(cx, cy, r, x, y, r2) {
    const dx = cx - x, dy = cy - y, rr = r + r2;
    return dx * dx + dy * dy < rr * rr;
  }
  // Fairness: once a wall's far edge is behind Puff's center, it can no longer hit (puffing up after a tunnel
  // must not grow the hitbox backward into the wall just cleared).
  function collides(o, R) {
    const r = R.r * 0.84, cx = FX, cy = R.y;
    switch (o.type) {
      case 'net':
        if (cx > o.x + o.w) return false;
        return hitRect(cx, cy, r, o.x + 8, SURFACE - 60, o.w - 16, o.top - SURFACE + 60) || hitRect(cx, cy, r, o.x + 8, o.bot, o.w - 16, H);
      case 'patch':
        if (cx > o.x + o.w) return false;
        return hitRect(cx, cy, r, o.x + 10, SURFACE - 60, o.w - 20, o.bottom - SURFACE + 60 - 8);
      case 'oil':
        if (cx > o.x + o.w) return false;
        return hitRect(cx, cy, r, o.x + 16, SURFACE - 60, o.w - 32, o.depth + 60 - 14);
      case 'bag': return hitCirc(cx, cy, r, o.x, o.y, o.r * 0.8);
      case 'rings': return hitCirc(cx, cy, r, o.x, o.y, o.r * 0.85);
      case 'barrel': return hitCirc(cx, cy, r, o.x, o.y, o.r * 0.8);
      case 'can': return hitCirc(cx, cy, r, o.x, o.y, o.r * 0.75);
      default: return false;
    }
  }

  // ------------------------------------------------------------------ input -> level
  let pointerHeld = false;
  function heldInput() {
    const I = SL.input;
    if (!I) return { up: false, down: false };
    const h = (c) => I.isHeld && I.isHeld(c);
    const p = I.players && I.players[0];
    const up = h('Space') || h('ArrowUp') || h('KeyW') || h('KeyZ') || h('KeyJ') || pointerHeld || !!(p && (p.fire || p.my < -0.4));
    const down = h('ArrowDown') || h('KeyS') || !!(p && p.my > 0.4);
    return { up, down };
  }
  function targetLevel(dt) {
    if (G.bot && G.run) return botLevel(G.run);
    if (G.mode === 'voice' && mic.ok) {
      const raw = micLevel(micRead());
      const k = heldInput().up ? 1 : raw;
      return k;
    }
    const inp = heldInput();
    // keys: the level glides toward full while held and back to empty when released, so taps hover
    const goal = inp.up ? 1 : 0;
    const rate = inp.up ? 2.6 : inp.down ? 5 : 2.4;
    return U.approach(G.keyLevel || 0, goal, rate * dt);
  }
  function smoothLevel(target, dt) {
    if (G.mode !== 'voice' || G.bot) {
      G.keyLevel = target;
      G.level = target;
      return;
    }
    // voice: fast attack, slower release so a breath between syllables doesn't drop Puff
    const k = target > G.level ? 14 : 5;
    G.level += (target - G.level) * Math.min(1, k * dt);
  }

  // The bot flies the lane of the nearest pattern ahead (used by the fairness sim and the attract demo).
  function botLevel(R) {
    let goal = R.prevOut;
    let best = Infinity;
    for (const l of R.lanes) {
      if (l.x < FX - 20) continue;
      if (l.x0 - FX < best) { best = l.x0 - FX; goal = l.tin; }
    }
    if (best === Infinity && R.pending) goal = R.pending.tin;
    // drop to the sand for low lanes
    if (goal > BED - 60) return 0;
    const vdes = U.clamp((goal - R.y) * 3.2, V_RISE, V_SINK);
    const vneed = vdes + (vdes - R.vy) * 0.25;
    return levelForVy(vneed);
  }

  // ------------------------------------------------------------------ update
  function step(dt) {
    const R = G.run;
    if (!R) return;
    R.scroll += dt;
    if (G.state !== 'play') {
      // idle bob in the menus
      const tl = G.state === 'calib' ? G.level : 0.45 + Math.sin(R.scroll * 0.9) * 0.08;
      R.r += (radiusFor(tl) - R.r) * Math.min(1, 8 * dt);
      R.y = U.lerp(R.y, (SURFACE + BED) / 2 + Math.sin(R.scroll * 1.3) * 26, Math.min(1, 2 * dt));
      updateParts(R, dt, 120);
      return;
    }
    if (R.over) {
      R.dead += dt;
      R.y = Math.min(BED - R.r, R.y + 120 * dt);
      updateParts(R, dt, 0);
      if (R.dead >= 1.1 && !G.simulating) showOver();
      return;
    }
    R.t += dt;
    const spd = speedFor(R.t);
    R.dist += spd * dt;

    const prev = G.level;
    smoothLevel(targetLevel(dt), dt);
    const L = G.level;
    if (L - prev > 0.025) { sfx('bubble'); emitBubbles(R, 1); }

    const vt = V_SINK + (V_RISE - V_SINK) * L;
    R.vy += (vt - R.vy) * Math.min(1, V_RESP * dt);
    R.r += (radiusFor(L) - R.r) * Math.min(1, 10 * dt);
    R.y += R.vy * dt;
    const top = SURFACE + R.r * 0.5, bot = BED - R.r * 0.92;
    if (R.y < top) { R.y = top; if (R.vy < 0) R.vy = 0; }
    if (R.y > bot) { R.y = bot; if (R.vy > 0) R.vy = 0; }

    spawnUpdate(R, spd, dt);
    for (const o of R.obs) {
      o.x -= spd * dt;
      switch (o.type) {
        case 'bag': o.x += o.vx * dt; o.ph += dt; o.y = o.y0 + Math.sin(o.ph * 1.4) * 34; break;
        case 'rings': o.ph += dt * 1.1; o.y = o.y0 + Math.sin(o.ph) * o.amp; o.rot += o.spin * dt; break;
        case 'barrel':
          o.y = Math.min(BED - 34, o.y + o.vy * dt);
          if (o.y >= BED - 34) o.spin *= 0.9;
          o.rot += o.spin * dt;
          o.drip += dt;
          if (o.drip > 0.12 && !G.simulating) { o.drip = 0; part(R, o.x + rng.range(-10, 10), o.y - 30, rng.range(-10, 10), -rng.range(30, 70), 1.4, 'goo'); }
          break;
        case 'can': o.ph += dt; o.rot += o.spin * dt; o.y += Math.sin(o.ph * 2) * 18 * dt; break;
        default: break;
      }
    }
    for (const l of R.lanes) {
      l.x -= spd * dt;
      l.x0 -= spd * dt;
    }
    for (const it of R.items) { it.x -= spd * dt; it.ph += dt; }
    R.obs = R.obs.filter((o) => o.x + (o.w || 0) + (o.r || 0) > -160);
    R.lanes = R.lanes.filter((l) => l.x > -40);

    if (R.inv > 0) R.inv -= dt;
    if (R.mood > 0) R.mood -= dt;

    // pickups
    for (const it of R.items) {
      if (it.dead || !hitCirc(FX, R.y, R.r + 6, it.x, it.y, it.r)) continue;
      it.dead = true;
      if (it.type === 'pearl') {
        R.pearls++;
        R.score += 10;
        sfx('pearl');
        sparkle(R, it.x, it.y, '#e9f7ff', 6);
      } else if (it.type === 'star') {
        if (R.hearts < MAX_HEARTS) { R.hearts++; floatText(R, it.x, it.y - 30, '+1 HEART', '#ffb3c7'); } else { R.score += 50; floatText(R, it.x, it.y - 30, '+50', '#ffd34d'); }
        sfx('star');
        sparkle(R, it.x, it.y, '#ffd34d', 14);
        R.mood = 0.8; R.moodKind = 'happy';
      } else if (it.type === 'bubble') {
        R.shield = true;
        sfx('shield');
        sparkle(R, it.x, it.y, '#bff4ff', 10);
      }
    }
    R.items = R.items.filter((it) => !it.dead && it.x > -60);

    // hazards
    if (R.inv <= 0) {
      for (const o of R.obs) {
        if (!collides(o, R)) continue;
        hurt(R, o);
        break;
      }
    }
    R.score = Math.max(R.score, 0);
    updateParts(R, dt, spd);
  }

  function hurt(R, o) {
    if (R.shield) {
      R.shield = false;
      R.inv = 1.0;
      sfx('pop');
      sparkle(R, FX, R.y, '#bff4ff', 16);
      return;
    }
    R.hearts--;
    R.hits++;
    R.hitLog.push(o.type);
    R.inv = 1.5;
    R.mood = 0.9;
    R.moodKind = 'ouch';
    sfx('bonk');
    sparkle(R, FX + R.r * 0.6, R.y, o.type === 'oil' ? '#3b3a34' : '#ffffff', 10);
    if (R.hearts <= 0) gameOver(R);
  }

  function gameOver(R) {
    R.over = true;
    R.dead = 0;
    R.moodKind = 'ouch';
    R.mood = 99;
    sfx('over');
    const st = store();
    const total = finalScore(R);
    st.plays++;
    st.pearls += R.pearls;
    if (total > st.best) { st.best = total; R.newBest = true; }
    if (!G.simulating) SL.save.commit();
  }
  function finalScore(R) { return Math.floor(R.dist / 40) + R.score; }

  // ------------------------------------------------------------------ particles
  function part(R, x, y, vx, vy, life, kind, color, size) {
    if (R.parts.length > 260) R.parts.shift();
    R.parts.push({ x, y, vx, vy, life, max: life, kind, color: color || '#ffffff', size: size || 4 });
  }
  function emitBubbles(R, n) {
    if (G.simulating) return;
    for (let i = 0; i < n; i++) part(R, FX - R.r * 0.6 + Math.random() * 10, R.y + (Math.random() - 0.5) * R.r, -40 - Math.random() * 40, -60 - Math.random() * 60, 1.4, 'bubble', '#dff6ff', 3 + Math.random() * 4);
  }
  function sparkle(R, x, y, color, n) {
    if (G.simulating) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 60 + Math.random() * 160;
      part(R, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + Math.random() * 0.3, 'spark', color, 2 + Math.random() * 3);
    }
  }
  function floatText(R, x, y, text, color) {
    if (G.simulating) return;
    R.parts.push({ x, y, vx: 0, vy: -50, life: 1, max: 1, kind: 'text', text, color, size: 26 });
  }
  function updateParts(R, dt, spd) {
    if (!G.simulating && R.scroll - (R.lastTrail || 0) > 0.35) { R.lastTrail = R.scroll; emitBubbles(R, 1); }
    for (const p of R.parts) {
      p.life -= dt;
      p.x += (p.vx - (p.kind === 'text' ? 0 : spd * 0.35)) * dt;
      p.y += p.vy * dt;
      if (p.kind === 'bubble') p.vx *= 0.97;
      if (p.kind === 'spark') { p.vx *= 0.92; p.vy *= 0.92; }
      if (p.y < SURFACE && p.kind !== 'text') p.life = 0;
    }
    R.parts = R.parts.filter((p) => p.life > 0);
  }

  // ------------------------------------------------------------------ drawing
  let bgCache = null;
  const snow = [];
  for (let i = 0; i < 70; i++) snow.push({ x: Math.random() * W, y: SURFACE + Math.random() * (BED - SURFACE), z: 0.2 + Math.random() * 0.8, ph: Math.random() * TAU });

  function backdrop() {
    if (bgCache) return bgCache;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    // sky
    let gr = g.createLinearGradient(0, 0, 0, SURFACE);
    gr.addColorStop(0, '#8fcbe6');
    gr.addColorStop(1, '#d7eef2');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, SURFACE);
    g.fillStyle = 'rgba(255,248,220,0.9)';
    g.beginPath();
    g.arc(560, 70, 34, 0, TAU);
    g.fill();
    const sun = g.createRadialGradient(560, 70, 20, 560, 70, 150);
    sun.addColorStop(0, 'rgba(255,240,200,0.55)');
    sun.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = sun;
    g.fillRect(380, 0, 340, SURFACE);
    // water
    gr = g.createLinearGradient(0, SURFACE, 0, BED);
    gr.addColorStop(0, '#2a9cc0');
    gr.addColorStop(0.35, '#13729c');
    gr.addColorStop(0.75, '#0a4c74');
    gr.addColorStop(1, '#073a5c');
    g.fillStyle = gr;
    g.fillRect(0, SURFACE, W, H - SURFACE);
    // sand
    gr = g.createLinearGradient(0, BED - 20, 0, H);
    gr.addColorStop(0, '#d8bd82');
    gr.addColorStop(0.25, '#c4a467');
    gr.addColorStop(1, '#7d6440');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 24) g.lineTo(x, BED + Math.sin(x * 0.018) * 8 + Math.sin(x * 0.05) * 3);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
    // sand speckles
    const r = SL.makeRng(7);
    for (let i = 0; i < 220; i++) {
      g.fillStyle = r.chance(0.5) ? 'rgba(255,240,200,0.35)' : 'rgba(90,64,30,0.3)';
      g.fillRect(r.range(0, W), r.range(BED + 10, H), r.range(1, 3), r.range(1, 2.5));
    }
    bgCache = c;
    return c;
  }

  function drawWorld(ctx, R) {
    const t = R.scroll;
    ctx.drawImage(backdrop(), 0, 0);
    // distant kelp and rocks (parallax)
    const off = (R.dist * 0.25) % 260;
    ctx.strokeStyle = 'rgba(6,58,70,0.55)';
    ctx.lineCap = 'round';
    for (let i = -1; i < 5; i++) {
      const bx = i * 260 - off + 90;
      for (let s = 0; s < 3; s++) {
        ctx.lineWidth = 7 - s * 1.5;
        ctx.beginPath();
        const x0 = bx + s * 22, hgt = 300 + s * 70 + ((i * 37) % 60);
        ctx.moveTo(x0, BED + 4);
        for (let k = 1; k <= 10; k++) {
          const yy = BED - (hgt * k) / 10;
          ctx.lineTo(x0 + Math.sin(t * 1.2 + k * 0.6 + i + s) * (4 + k * 1.6), yy);
        }
        ctx.stroke();
      }
    }
    const off2 = (R.dist * 0.5) % 380;
    ctx.fillStyle = 'rgba(9,40,58,0.75)';
    for (let i = -1; i < 4; i++) {
      const x = i * 380 - off2 + 120;
      ctx.beginPath();
      ctx.ellipse(x, BED + 8, 70, 34, 0, Math.PI, TAU);
      ctx.ellipse(x + 60, BED + 8, 44, 22, 0, Math.PI, TAU);
      ctx.fill();
    }
    // light rays
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 170 - R.dist * 0.08) % (W + 300) + W + 300) % (W + 300) - 150;
      const a = 0.05 + 0.035 * Math.sin(t * 0.7 + i * 1.7);
      const gr = ctx.createLinearGradient(0, SURFACE, 0, BED - 200);
      gr.addColorStop(0, 'rgba(190,240,255,' + a.toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(190,240,255,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(x, SURFACE);
      ctx.lineTo(x + 70, SURFACE);
      ctx.lineTo(x + 230, BED - 200);
      ctx.lineTo(x + 90, BED - 200);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // marine snow
    ctx.fillStyle = 'rgba(220,245,255,0.5)';
    for (const s of snow) {
      const x = ((s.x - R.dist * 0.3 * s.z) % W + W) % W;
      const y = s.y + Math.sin(t * 0.6 + s.ph) * 8;
      ctx.globalAlpha = 0.25 + s.z * 0.4;
      ctx.fillRect(x, y, 1.5 + s.z * 2, 1.5 + s.z * 2);
    }
    ctx.globalAlpha = 1;
    // surface: wavy line with a lighter band
    ctx.fillStyle = 'rgba(210,245,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, SURFACE - 6);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, SURFACE + Math.sin(x * 0.03 + t * 2.2) * 5 + Math.sin(x * 0.011 - t * 1.3) * 4);
    ctx.lineTo(W, SURFACE + 14);
    ctx.lineTo(0, SURFACE + 14);
    ctx.closePath();
    ctx.fill();
  }

  // --- obstacles
  function drawNet(ctx, o, t) {
    const parts = [[SURFACE - 8, o.top], [o.bot, BED + 30]];
    for (let i = 0; i < 2; i++) {
      const [y0, y1] = parts[i];
      if (y1 <= y0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(o.x, y0, o.w, y1 - y0);
      ctx.clip();
      ctx.fillStyle = 'rgba(30,60,55,0.25)';
      ctx.fillRect(o.x, y0, o.w, y1 - y0);
      ctx.strokeStyle = 'rgba(150,175,150,0.75)';
      ctx.lineWidth = 2.2;
      const sway = Math.sin(t * 1.5 + o.seed) * 4;
      ctx.beginPath();
      for (let k = -(y1 - y0); k < o.w + 20; k += 20) {
        ctx.moveTo(o.x + k, y0);
        ctx.lineTo(o.x + k + (y1 - y0) + sway, y1);
        ctx.moveTo(o.x + k + (y1 - y0), y0);
        ctx.lineTo(o.x + k + sway, y1);
      }
      ctx.stroke();
      ctx.restore();
      // ropes on both sides
      ctx.strokeStyle = '#6f7f5f';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(o.x + 2, y0);
      ctx.lineTo(o.x + 2, y1);
      ctx.moveTo(o.x + o.w - 2, y0);
      ctx.lineTo(o.x + o.w - 2, y1);
      ctx.stroke();
      // frayed edge facing the gap
      const ey = i === 0 ? y1 : y0;
      ctx.strokeStyle = 'rgba(160,180,140,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 6; k < o.w; k += 9) {
        const len = 10 + ((k * 7 + o.seed * 10) % 14);
        ctx.moveTo(o.x + k, ey);
        ctx.lineTo(o.x + k + Math.sin(t * 3 + k) * 4, ey + (i === 0 ? len : -len));
      }
      ctx.stroke();
      ctx.strokeStyle = '#8e9a6a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(o.x - 4, ey);
      ctx.lineTo(o.x + o.w + 4, ey);
      ctx.stroke();
    }
    // floats at the surface and a weight on the sand
    for (let k = 0; k < 2; k++) {
      const fx = o.x + 14 + k * (o.w - 28);
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.arc(fx, SURFACE - 2 + Math.sin(t * 2 + k) * 3, 11, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(fx - 3, SURFACE - 6 + Math.sin(t * 2 + k) * 3, 4, 0, TAU);
      ctx.fill();
    }
    // a bottle caught in the mesh
    const by = o.top - 60;
    if (by > SURFACE + 30) drawBottle(ctx, o.x + o.w / 2, by, 0.5 + Math.sin(t + o.seed) * 0.1, 1, 0);
  }

  const TRASH_COLORS = [['#7fd1b9', '#4c9c86'], ['#9fc7ef', '#5b8bc0'], ['#e9e4d4', '#b5ad95'], ['#e25a4a', '#a8392d']];
  function drawBottle(ctx, x, y, rot, s, c) {
    const col = TRASH_COLORS[c % 2];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.fillStyle = col[0];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-9, -18, 18, 32, 5); else ctx.rect(-9, -18, 18, 32);
    ctx.fill();
    ctx.fillRect(-4, -27, 8, 10);
    ctx.fillStyle = '#e8eef7';
    ctx.fillRect(-5, -31, 10, 5);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-6, -14, 3, 22);
    ctx.restore();
  }
  function drawCanShape(ctx, x, y, rot, s, hue) {
    const body = ['#e25a4a', '#3fa7e0', '#5dc76d'][hue % 3];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.fillStyle = body;
    ctx.fillRect(-9, -15, 18, 30);
    ctx.fillStyle = '#d6dbe3';
    ctx.fillRect(-9, -17, 18, 4);
    ctx.fillRect(-9, 13, 18, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(-6, -12, 3, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-2, -8, 10, 3);
    ctx.restore();
  }
  function drawBagShape(ctx, x, y, s, t, tint, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const wob = Math.sin(t * 2.2) * 5;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ['rgba(240,246,250,0.78)', 'rgba(250,240,220,0.75)', 'rgba(225,240,250,0.7)'][tint % 3];
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-28, -20);
    ctx.quadraticCurveTo(-22 + wob, -48, -12, -24);
    ctx.lineTo(12, -24);
    ctx.quadraticCurveTo(22 - wob, -48, 28, -20);
    ctx.quadraticCurveTo(38 + wob, 10, 22, 34 + wob);
    ctx.quadraticCurveTo(0, 46, -22, 34 - wob);
    ctx.quadraticCurveTo(-38 - wob, 10, -28, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160,180,200,0.6)';
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.quadraticCurveTo(-4 + wob, 12, -12, 28);
    ctx.moveTo(10, -6);
    ctx.quadraticCurveTo(14 - wob, 14, 8, 30);
    ctx.stroke();
    ctx.restore();
  }
  function drawPatch(ctx, o, t) {
    const bob = Math.sin(t * 0.8 + o.x * 0.01) * 4;
    const x = o.x, w = o.w, bottom = o.bottom + bob;
    // murky mass
    ctx.fillStyle = 'rgba(58,60,44,0.94)';
    // lumpy sides (they bulge out a little past the hitbox, never in)
    const sn = o.sides.length - 1, top = SURFACE - 10, sh = bottom - 18 - top;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + w, top);
    for (let i = 1; i <= sn; i++) ctx.quadraticCurveTo(x + w + 4 + o.sides[i - 1][1], top + (sh * (i - 0.5)) / sn, x + w + Math.max(0, o.sides[i][1]) * 0.5, top + (sh * i) / sn);
    const n = o.bumps.length - 1;
    for (let i = n; i >= 0; i--) {
      const px = x + (w * i) / n;
      ctx.quadraticCurveTo(px + w / n / 2, bottom + o.bumps[i] + 10, px, bottom + o.bumps[i]);
    }
    for (let i = sn - 1; i >= 0; i--) ctx.quadraticCurveTo(x - 4 - o.sides[i + 1][0], top + (sh * (i + 0.5)) / sn, x - Math.max(0, o.sides[i][0]) * 0.5, top + (sh * i) / sn);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,32,22,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // trash inside
    ctx.save();
    ctx.clip();
    for (const it of o.items) {
      const ix = x + it.dx, iy = SURFACE + it.dy + bob;
      const r = it.rot + Math.sin(t * 0.7 + it.dx) * 0.08;
      switch (it.kind) {
        case 0: drawBottle(ctx, ix, iy, r, it.s, it.c); break;
        case 1: drawCanShape(ctx, ix, iy, r, it.s * 1.2, it.c); break;
        case 2: drawBagShape(ctx, ix, iy, it.s * 0.8, t + it.dx, it.c, 0.7); break;
        case 3:
          ctx.strokeStyle = '#22231c';
          ctx.lineWidth = 9 * it.s;
          ctx.beginPath();
          ctx.ellipse(ix, iy, 22 * it.s, 14 * it.s, r, 0, TAU);
          ctx.stroke();
          break;
        case 4:
          ctx.fillStyle = TRASH_COLORS[2 + (it.c % 2)][1];
          ctx.save();
          ctx.translate(ix, iy);
          ctx.rotate(r);
          ctx.fillRect(-18 * it.s, -12 * it.s, 36 * it.s, 24 * it.s);
          ctx.restore();
          break;
        default:
          ctx.fillStyle = 'rgba(120,130,90,0.8)';
          ctx.beginPath();
          ctx.arc(ix, iy, 10 * it.s, 0, TAU);
          ctx.fill();
      }
    }
    ctx.restore();
    // murk drips
    ctx.fillStyle = 'rgba(58,60,44,0.85)';
    for (const d of o.drips) {
      const len = d.len * (0.7 + 0.3 * Math.sin(t * 1.5 + d.ph));
      ctx.beginPath();
      ctx.ellipse(x + d.dx, bottom + len * 0.5, 5, len * 0.5 + 4, 0, 0, TAU);
      ctx.fill();
    }
    // a sign of what it is
    if (w > 200) {
      ctx.fillStyle = 'rgba(255,215,120,0.85)';
      ctx.font = '700 15px Oxanium, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GO QUIET', x + w / 2, bottom - 26);
    }
  }
  function oilPath(ctx, o, t) {
    const x = o.x, w = o.w, y1 = SURFACE + o.depth, rc = 34;
    const n = o.wave.length - 1;
    ctx.beginPath();
    ctx.moveTo(x + 6, SURFACE - 12);
    ctx.lineTo(x + w - 6, SURFACE - 12);
    // right edge sags a little, then the wavy underside, then back up the left edge
    ctx.bezierCurveTo(x + w + 6, SURFACE + o.depth * 0.4, x + w + 4, y1 - rc, x + w - rc * 0.4, y1 + o.wave[n] * 0.5);
    for (let i = n - 1; i >= 1; i--) {
      const px = x + (w * i) / n;
      const py = y1 + o.wave[i] + Math.sin(t * 1.4 + i) * 5;
      ctx.quadraticCurveTo(px + w / n / 2, py + 9, px, py);
    }
    ctx.bezierCurveTo(x + rc * 0.4, y1 + o.wave[0] * 0.5, x - 4, y1 - rc, x - 6, SURFACE + o.depth * 0.4);
    ctx.closePath();
  }
  function drawOil(ctx, o, t) {
    const x = o.x, w = o.w, y1 = SURFACE + o.depth;
    const gr = ctx.createLinearGradient(0, SURFACE, 0, y1);
    gr.addColorStop(0, 'rgba(8,7,6,0.98)');
    gr.addColorStop(0.7, 'rgba(22,17,12,0.96)');
    gr.addColorStop(1, 'rgba(46,32,18,0.92)');
    ctx.fillStyle = gr;
    oilPath(ctx, o, t);
    ctx.fill();
    ctx.save();
    ctx.clip();
    // iridescent film: soft rainbow bands that slide slowly across the slick
    ctx.globalCompositeOperation = 'lighter';
    const hues = [280, 200, 140, 50, 330];
    for (let i = 0; i < 5; i++) {
      const cy = SURFACE + 30 + i * (o.depth / 5) + Math.sin(t * 0.6 + i) * 10;
      ctx.strokeStyle = 'hsla(' + ((hues[i] + t * 20) % 360).toFixed(0) + ',70%,55%,0.09)';
      ctx.lineWidth = 30;
      ctx.beginPath();
      ctx.moveTo(x - 20, cy);
      for (let k = 1; k <= 6; k++) ctx.lineTo(x - 20 + ((w + 40) * k) / 6, cy + Math.sin(k * 1.3 + t * 0.8 + i) * 14);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // glossy highlights
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(x + w * (0.25 + i * 0.25) + Math.sin(t * 0.7 + i) * 10, SURFACE + 40 + i * 30, 46, 9, -0.15, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(90,70,40,0.6)';
    ctx.lineWidth = 2;
    oilPath(ctx, o, t);
    ctx.stroke();
    // drips that stretch, break off and sink
    for (const d of o.drips) {
      const k = (t * 0.45 + d.ph) % 1;
      const dx = x + d.dx;
      const top = y1 - 6;
      if (k < 0.5) {
        const len = d.len * (k / 0.5);
        ctx.fillStyle = 'rgba(16,12,9,0.95)';
        ctx.beginPath();
        ctx.moveTo(dx - d.r * 0.7, top);
        ctx.quadraticCurveTo(dx - d.r * 0.3, top + len * 0.7, dx - d.r * 0.8, top + len);
        ctx.arc(dx, top + len, d.r * 0.8, Math.PI, 0, true);
        ctx.quadraticCurveTo(dx + d.r * 0.3, top + len * 0.7, dx + d.r * 0.7, top);
        ctx.fill();
      } else {
        const yy = top + d.len + (k - 0.5) * d.len * 2.4;
        ctx.globalAlpha = 1 - (k - 0.5) * 1.4;
        ctx.fillStyle = 'rgba(16,12,9,0.95)';
        ctx.beginPath();
        ctx.arc(dx, yy, d.r * 0.75, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.arc(dx - d.r * 0.25, yy - d.r * 0.25, d.r * 0.22, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = 'rgba(255,215,120,0.85)';
    ctx.font = '700 15px Oxanium, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OIL SPILL · STAY LOW', x + w / 2, y1 - 30);
  }
  function drawRings(ctx, o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    ctx.strokeStyle = 'rgba(235,242,250,0.9)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.beginPath();
        ctx.ellipse(-28 + i * 28, -13 + j * 26, 13, 11, 0, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-44, -26, 88, 52);
    ctx.restore();
  }
  function drawBarrel(ctx, o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    const gr = ctx.createLinearGradient(-28, 0, 28, 0);
    gr.addColorStop(0, '#9a7a12');
    gr.addColorStop(0.35, '#f2c93a');
    gr.addColorStop(1, '#8a6a0c');
    ctx.fillStyle = gr;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-28, -38, 56, 76, 8); else ctx.rect(-28, -38, 56, 76);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,30,10,0.55)';
    ctx.fillRect(-28, -22, 56, 5);
    ctx.fillRect(-28, 17, 56, 5);
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(0, -1, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f2c93a';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.arc(0, -1, 9, i * TAU / 3 - 0.45, i * TAU / 3 + 0.45);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(0, -1, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // --- pickups
  function drawItem(ctx, it) {
    if (it.type === 'pearl') {
      const y = it.y + Math.sin(it.ph * 3) * 3;
      const g = ctx.createRadialGradient(it.x - 4, y - 4, 1, it.x, y, 13);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#f1ecf7');
      g.addColorStop(1, '#bcb4d0');
      ctx.fillStyle = 'rgba(220,240,255,0.25)';
      ctx.beginPath();
      ctx.arc(it.x, y, 19, 0, TAU);
      ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(it.x, y, 11, 0, TAU);
      ctx.fill();
    } else if (it.type === 'star') {
      const s = 1 + Math.sin(it.ph * 4) * 0.08;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(Math.sin(it.ph * 1.5) * 0.25);
      ctx.scale(s, s);
      ctx.fillStyle = 'rgba(255,211,77,0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffc93c';
      ctx.strokeStyle = '#d98a1a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 10, r = i % 2 ? 9 : 22;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff0b8';
      ctx.beginPath();
      ctx.arc(-3, -3, 3, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (it.type === 'bubble') {
      bubbleShape(ctx, it.x, it.y + Math.sin(it.ph * 2) * 6, 22, 1);
    }
  }
  function bubbleShape(ctx, x, y, r, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(190,240,255,0.18)';
    ctx.strokeStyle = 'rgba(220,250,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.22, r * 0.12, -0.6, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // --- Puff
  function drawPuff(ctx, x, y, r, L, t, mood, vy) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(U.clamp(vy / 1400, -0.25, 0.25));
    const rx = r * 1.1, ry = r * (0.86 + 0.14 * L);
    // tail
    const wag = Math.sin(t * (10 - L * 4)) * 0.35;
    ctx.save();
    ctx.translate(-rx * 0.92, 0);
    ctx.rotate(wag);
    ctx.fillStyle = '#e7a93a';
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(-r * 0.35, -r * 0.5, -r * 0.55, -r * 0.42);
    ctx.quadraticCurveTo(-r * 0.4, 0, -r * 0.55, r * 0.42);
    ctx.quadraticCurveTo(-r * 0.35, r * 0.5, 4, 0);
    ctx.fill();
    ctx.restore();
    // spikes grow as Puff inflates
    const sl = r * (0.06 + 0.34 * L);
    if (sl > 2) {
      ctx.fillStyle = '#d99a2b';
      ctx.strokeStyle = 'rgba(120,70,10,0.6)';
      ctx.lineWidth = 1.5;
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.1;
        const cx = Math.cos(a), cy = Math.sin(a);
        const bx = cx * rx * 0.94, by = cy * ry * 0.94;
        const px = -cy * 5, py = cx * 5;
        ctx.beginPath();
        ctx.moveTo(bx + px, by + py);
        ctx.lineTo(cx * (rx + sl), cy * (ry + sl));
        ctx.lineTo(bx - px, by - py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    // body
    const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.4, r * 0.1, 0, 0, r * 1.15);
    g.addColorStop(0, '#fff6c4');
    g.addColorStop(0.45, '#f8cf55');
    g.addColorStop(1, '#d58f22');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fill();
    // belly
    ctx.fillStyle = 'rgba(255,250,232,0.85)';
    ctx.beginPath();
    ctx.ellipse(rx * 0.08, ry * 0.42, rx * 0.72, ry * 0.5, 0, 0, Math.PI);
    ctx.fill();
    // spots
    ctx.fillStyle = 'rgba(150,90,20,0.55)';
    const spots = [[-0.45, -0.45, 0.1], [-0.15, -0.62, 0.08], [-0.62, -0.1, 0.08], [0.1, -0.4, 0.07], [-0.3, -0.18, 0.06]];
    for (const s of spots) {
      ctx.beginPath();
      ctx.arc(s[0] * rx, s[1] * ry, s[2] * r, 0, TAU);
      ctx.fill();
    }
    // side fin
    ctx.fillStyle = 'rgba(240,170,60,0.95)';
    ctx.save();
    ctx.translate(-rx * 0.05, ry * 0.15);
    ctx.rotate(Math.sin(t * 12) * 0.5 - 0.3);
    ctx.beginPath();
    ctx.ellipse(-r * 0.18, 0, r * 0.24, r * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // eye
    const ex = rx * 0.48, ey = -ry * 0.2, er = 9 + r * 0.14;
    if (mood === 'ouch') {
      ctx.strokeStyle = '#2b1a08';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(ex - er * 0.7, ey - er * 0.6);
      ctx.lineTo(ex + er * 0.5, ey);
      ctx.lineTo(ex - er * 0.7, ey + er * 0.6);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,70,10,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const pr = er * (mood === 'happy' ? 0.66 : 0.55);
      ctx.fillStyle = '#1c2230';
      ctx.beginPath();
      ctx.arc(ex + er * 0.25, ey + U.clamp(vy / 900, -0.3, 0.3) * er, pr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex + er * 0.05, ey - er * 0.25, pr * 0.38, 0, TAU);
      ctx.fill();
      // blink
      if ((t % 3.7) < 0.12) {
        ctx.fillStyle = '#f2c14a';
        ctx.beginPath();
        ctx.ellipse(ex, ey, er + 1, er + 1, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#7a4a10';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ex - er, ey);
        ctx.lineTo(ex + er, ey);
        ctx.stroke();
      }
    }
    // cheek and mouth
    ctx.fillStyle = 'rgba(255,120,120,0.35)';
    ctx.beginPath();
    ctx.ellipse(ex - er * 0.2, ey + er * 1.25, er * 0.55, er * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#7a3a12';
    ctx.beginPath();
    const mx = rx * 0.94, my = ry * 0.16;
    if (mood === 'happy') {
      ctx.arc(mx - 4, my, 6, 0, Math.PI);
    } else {
      ctx.ellipse(mx, my, 3 + L * 3 + (mood === 'ouch' ? 3 : 0), 4 + L * 3, 0, 0, TAU);
    }
    ctx.fill();
    ctx.restore();
  }

  function drawParts(ctx, R) {
    for (const p of R.parts) {
      const a = U.clamp(p.life / p.max, 0, 1);
      if (p.kind === 'bubble') {
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = 'rgba(225,248,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
      } else if (p.kind === 'goo') {
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = '#7dff6a';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, TAU);
        ctx.fill();
      } else if (p.kind === 'text') {
        ctx.globalAlpha = a;
        ctx.font = '800 26px Oxanium, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(2,20,30,0.7)';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function heart(ctx, x, y, s, full) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(-14, -4, -10, -16, 0, -9);
    ctx.bezierCurveTo(10, -16, 14, -4, 0, 6);
    ctx.closePath();
    ctx.fillStyle = full ? '#ff5c8a' : 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = full ? '#ffd0dc' : 'rgba(255,255,255,0.4)';
    ctx.stroke();
    ctx.restore();
  }
  function label(ctx, str, x, y, font, color, align) {
    ctx.font = font;
    ctx.textAlign = align || 'left';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(2,24,38,0.55)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawHud(ctx, R) {
    ctx.textBaseline = 'alphabetic';
    if (G.state === 'play' || G.state === 'paused' || G.state === 'over') {
      for (let i = 0; i < MAX_HEARTS; i++) heart(ctx, 46 + i * 46, 214, 1.9, i < R.hearts);
      label(ctx, U.fmtInt(finalScore(R)), 690, 222, '800 34px Oxanium, sans-serif', '#ffffff', 'right');
      label(ctx, 'BEST ' + U.fmtInt(Math.max(store().best, R.over ? 0 : finalScore(R))), 690, 250, '600 16px Oxanium, sans-serif', 'rgba(230,248,255,0.85)', 'right');
      if (R.shield) bubbleShape(ctx, 46 + MAX_HEARTS * 46, 208, 14, 0.9);
    }
    // level meter: what Puff hears
    if (G.state !== 'intro' && G.state !== 'error' && G.state !== 'micwait') {
      const x = 30, y = 1196, w = 300, h = 16;
      ctx.fillStyle = 'rgba(2,20,32,0.55)';
      ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
      const gr = ctx.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, '#5dffb0');
      gr.addColorStop(0.5, '#ffe27a');
      gr.addColorStop(1, '#ff8a5c');
      ctx.fillStyle = gr;
      ctx.fillRect(x, y, w * U.clamp(G.level, 0, 1), h);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const nx = x + w * levelForVy(0);
      ctx.fillRect(nx - 1, y - 6, 2, h + 12);
      label(ctx, (G.mode === 'voice' ? 'MIC' : 'KEYS') + '  ·  quiet = sink   loud = puff up', x, y - 12, '600 14px Oxanium, sans-serif', 'rgba(240,250,255,0.9)');
      label(ctx, 'hover', nx, y + h + 22, '600 12px Oxanium, sans-serif', 'rgba(240,250,255,0.75)', 'center');
    }
    if (G.state === 'ready') {
      const a = 0.65 + 0.35 * Math.sin(R.scroll * 4);
      ctx.globalAlpha = a;
      label(ctx, G.mode === 'voice' ? 'Make a sound to start' : 'Hold Space, click or tap to start', W / 2, 330, '800 34px Oxanium, sans-serif', '#ffffff', 'center');
      ctx.globalAlpha = 1;
    }
    if (G.state === 'play' && R.t < 6) {
      ctx.globalAlpha = U.clamp(6 - R.t, 0, 1);
      label(ctx, G.mode === 'voice' ? 'Get loud to puff up. Go quiet to sink.' : 'Hold to puff up. Let go to sink.', W / 2, 330, '700 26px Oxanium, sans-serif', '#ffffff', 'center');
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    if (!ui) return;
    const c = ui.canvas;
    const cw = c.clientWidth, chh = c.clientHeight;
    if (!cw || !chh) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(cw * dpr), bh = Math.round(chh * dpr);
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
    const ctx = ui.ctx;
    ctx.setTransform(bw / W, 0, 0, bh / H, 0, 0);
    const R = G.run;
    drawWorld(ctx, R);
    const t = R.scroll;
    for (const o of R.obs) {
      if (o.x > W + 200) continue;
      switch (o.type) {
        case 'net': drawNet(ctx, o, t); break;
        case 'patch': drawPatch(ctx, o, t); break;
        case 'oil': drawOil(ctx, o, t); break;
        case 'bag': drawBagShape(ctx, o.x, o.y, 1, o.ph, o.tint, 1); break;
        case 'rings': drawRings(ctx, o); break;
        case 'barrel': drawBarrel(ctx, o); break;
        case 'can': drawCanShape(ctx, o.x, o.y, o.rot, 1.3, o.hue); break;
        default: break;
      }
    }
    for (const it of R.items) drawItem(ctx, it);
    const flick = R.inv > 0 && !R.over && Math.floor(R.inv * 12) % 2 === 0;
    ctx.globalAlpha = flick ? 0.45 : 1;
    const mood = R.over || R.mood > 0 ? R.moodKind : '';
    drawPuff(ctx, FX, R.y, R.r, G.state === 'play' ? G.level : U.invLerp(R_MIN, R_MAX, R.r), t, mood, R.vy);
    ctx.globalAlpha = 1;
    if (R.shield) bubbleShape(ctx, FX, R.y, R.r * 1.35 + 8, 0.85);
    drawParts(ctx, R);
    drawHud(ctx, R);
    if (ui.meter) ui.meter.style.width = (U.clamp(G.level, 0, 1) * 100).toFixed(1) + '%';
  }

  // ------------------------------------------------------------------ flow
  let raf = 0, last = 0, calib = null, readyHold = 0, overHold = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 1 / 30);
    try {
      tickFlow(dt);
      if (G.state !== 'paused') step(dt);
      render();
    } catch (err) {
      U.warnOnce('puff-frame', '[SL.puff] frame threw:', err);
    }
  }

  /** One frame of the screen without requestAnimationFrame (tests drive this headless). */
  G.tick = function (dt) {
    tickFlow(dt);
    if (G.state !== 'paused') step(dt);
    render();
  };

  function tickFlow(dt) {
    if (G.state === 'calib' && calib) {
      const db = micRead();
      calib.t += dt;
      if (calib.phase === 'quiet') {
        calib.quiet.push(db);
        G.level = U.clamp((db + 70) / 50, 0, 1);
        setCalibText(calib);
        if (calib.t >= 2.2) { calib.phase = 'loud'; calib.t = 0; sfx('tick'); setCalibText(calib); }
      } else {
        calib.loud.push(db);
        G.level = U.clamp((db + 70) / 50, 0, 1);
        setCalibText(calib);
        if (calib.t >= 2.8) finishCalibration();
      }
      return;
    }
    if (G.state === 'ready') {
      const goal = targetLevel(dt);
      smoothLevel(goal, dt);
      // armed only after the player lets go / goes quiet, so the press or shout that got here doesn't start the run
      const go = G.mode === 'voice' ? G.level > 0.5 : heldInput().up;
      if (!G.readyArmed) { G.readyArmed = G.mode === 'voice' ? G.level < 0.3 : !go; readyHold = 0; return; }
      readyHold = go ? readyHold + dt : 0;
      if (readyHold > (G.mode === 'voice' ? 0.25 : 0.01)) beginPlay();
      return;
    }
    if (G.state === 'over' && G.mode === 'voice' && mic.ok) {
      // hands-free: a steady hum restarts
      smoothLevel(micLevel(micRead()), dt);
      overHold = G.level > 0.55 ? overHold + dt : Math.max(0, overHold - dt);
      if (overHold > 0.8) { overHold = 0; restart(); }
    }
  }

  function setCalibText(c) {
    if (!ui || !ui.calibText) return;
    const left = Math.max(0, Math.ceil((c.phase === 'quiet' ? 2.2 : 2.8) - c.t));
    ui.calibStep.textContent = c.phase === 'quiet' ? 'Step 1 of 2' : 'Step 2 of 2';
    ui.calibText.textContent = c.phase === 'quiet'
      ? 'Stay quiet for a moment… ' + left
      : 'Now make your loudest comfortable sound: ahh, a hum, a whistle… ' + left;
  }

  function finishCalibration() {
    const floor = pct(calib.quiet, 0.6);
    const peak = pct(calib.loud, 0.85);
    calib = null;
    if (!(peak - floor >= 8)) {
      showError('Puff couldn\'t hear much difference between quiet and loud. Try again a little louder or closer to the mic, or play with keys.');
      return;
    }
    mic.floor = floor;
    mic.peak = peak;
    toReady();
  }

  function clearPanel() {
    if (ui && ui.panel) { ui.panel.remove(); ui.panel = null; ui.meter = null; ui.calibText = null; }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(text, cls, fn) {
    const b = el('button', 'sl-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (SL.audio && SL.audio.sfx) SL.audio.sfx('ui_confirm');
      fn();
    });
    return b;
  }
  function panel(cls) {
    clearPanel();
    const wrap = el('div', 'sl-puff__overlay ' + (cls || ''));
    const p = el('div', 'sl-panel sl-puff__panel');
    wrap.appendChild(p);
    ui.root.appendChild(wrap);
    ui.panel = wrap;
    return p;
  }
  function focusFirst() {
    if (!ui || !ui.panel) return;
    const b = ui.panel.querySelector('button');
    if (b && SL.input.lastDevice !== 'touch') b.focus({ preventScroll: true });
  }

  function showIntro() {
    G.state = 'intro';
    ambient(false);
    const st = store();
    const p = panel('sl-puff__overlay--intro');
    p.append(el('div', 'sl-label', 'Minigame · Puff\'s Ocean'), el('h2', 'sl-title sl-title--md sl-puff__title', 'Puff\'s Ocean'));
    const story = el('p', 'sl-puff__story');
    story.textContent = 'Puff the pufferfish is ' + callsign() + '\'s best buddy, riding along in a water bubble aboard the Halcyon. ' +
      'Between sorties Puff dreams of home: Earth\'s ocean, choking on our trash. Help Puff swim through it.';
    p.appendChild(story);
    const how = el('ul', 'sl-puff__how');
    [['Loud', 'Puff puffs up and floats'], ['Quiet', 'Puff shrinks and sinks: squeeze under the garbage patch'], ['Avoid', 'ghost nets, oil spills, bags, six-pack rings, leaking drums'], ['Grab', 'pearls for points, starfish for hearts, bubbles for a shield']]
      .forEach(([k, v]) => { const li = el('li'); li.append(el('b', '', k + ': '), document.createTextNode(v)); how.appendChild(li); });
    p.appendChild(how);
    if (st.best) p.appendChild(el('div', 'sl-puff__best sl-num', 'Best: ' + U.fmtInt(st.best)));
    const b = el('div', 'sl-stack');
    b.append(
      btn('Play with your voice', 'sl-btn--primary', () => startVoice()),
      btn('Keys or touch', '', () => startKeys()),
      btn('Back to title', 'sl-btn--ghost', () => leave()));
    p.appendChild(b);
    p.appendChild(el('p', 'sl-puff__note', 'Any voice works: a hum, a whistle, a soft "ahh". The mic only measures loudness inside this page; nothing is recorded or sent.'));
    focusFirst();
  }

  async function startVoice() {
    G.mode = 'voice';
    G.state = 'micwait';
    ambient(false);
    const p = panel();
    p.append(el('div', 'sl-label', 'Microphone'), el('h2', 'sl-title sl-title--sm', 'Asking for the mic…'), el('p', 'sl-puff__story', 'Allow microphone access when your browser asks.'));
    try {
      await micStart();
    } catch (e) {
      if (G.state !== 'micwait') return;
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      showError(denied
        ? 'The microphone is blocked here. You can allow it in the browser\'s site settings, or play with keys or touch.'
        : 'No microphone is available here. You can play with keys or touch instead.');
      return;
    }
    if (G.state !== 'micwait') return;
    startCalibration();
  }
  function startCalibration() {
    G.state = 'calib';
    G.mode = 'voice';
    calib = { phase: 'quiet', t: 0, quiet: [], loud: [] };
    const p = panel('sl-puff__overlay--low');
    ui.calibStep = el('div', 'sl-label', 'Step 1 of 2');
    ui.calibText = el('p', 'sl-puff__story sl-puff__calib', '');
    const m = el('div', 'sl-puff__meter');
    ui.meter = el('i');
    m.appendChild(ui.meter);
    p.append(ui.calibStep, el('h2', 'sl-title sl-title--sm', 'Tune Puff to your voice'), ui.calibText, m);
    setCalibText(calib);
  }
  function startKeys() {
    G.mode = 'keys';
    micStop();
    audioOn();
    toReady();
  }
  function toReady() {
    clearPanel();
    G.state = 'ready';
    G.readyArmed = false;
    readyHold = 0;
    G.keyLevel = 0;
    newRun();
    if (G.mode === 'keys') ambient(true);
  }
  function beginPlay() {
    G.state = 'play';
    clearPanel();
    G.run.t = 0;
    sfx('start');
  }
  function restart() {
    clearPanel();
    G.state = 'ready';
    G.readyArmed = false;
    readyHold = 0;
    newRun();
    // a fresh run starts as soon as the player is still holding / still humming
  }

  function showError(msg) {
    G.state = 'error';
    const p = panel();
    p.append(el('div', 'sl-label', 'Microphone'), el('h2', 'sl-title sl-title--sm', 'Can\'t hear you'), el('p', 'sl-puff__story', msg));
    const b = el('div', 'sl-stack');
    b.append(
      btn('Keys or touch', 'sl-btn--primary', () => startKeys()),
      btn('Try the mic again', '', () => startVoice()),
      btn('Back', 'sl-btn--ghost', () => showIntro()));
    p.appendChild(b);
    focusFirst();
  }

  function showPause() {
    if (G.state !== 'play') return;
    G.state = 'paused';
    ambient(false);
    const p = panel();
    p.append(el('div', 'sl-label', 'Puff\'s Ocean'), el('h2', 'sl-title sl-title--md', 'Paused'));
    const b = el('div', 'sl-stack');
    b.append(btn('Resume', 'sl-btn--primary', () => resume()));
    if (G.mode === 'voice') b.append(btn('Retune voice', '', () => startCalibration()));
    b.append(btn('Restart', '', () => restart()), btn('Quit to title', 'sl-btn--ghost', () => leave()));
    p.appendChild(b);
    const sens = el('div', 'sl-puff__sens');
    if (G.mode === 'voice') {
      const val = el('span', 'sl-num', '');
      const upd = () => { val.textContent = 'Mic sensitivity ×' + store().sens.toFixed(2); };
      const adj = (d) => { const st = store(); st.sens = U.clamp(Math.round((st.sens + d) * 4) / 4, 0.5, 2); SL.save.commit(); upd(); };
      sens.append(btn('−', 'sl-btn--small', () => adj(-0.25)), val, btn('+', 'sl-btn--small', () => adj(0.25)));
      upd();
      p.appendChild(sens);
    }
    focusFirst();
  }
  function resume() {
    if (G.state !== 'paused') return;
    clearPanel();
    G.state = 'play';
    if (G.mode === 'keys') ambient(true);
  }

  function showOver() {
    const R = G.run;
    G.state = 'over';
    overHold = 0;
    ambient(false);
    const st = store();
    const total = finalScore(R);
    const p = panel();
    p.append(el('div', 'sl-label', R.newBest ? 'New best!' : 'Puff needs a breather'), el('h2', 'sl-title sl-title--md sl-puff__title', U.fmtInt(total)));
    const dl = el('dl', 'sl-ui-stats sl-puff__stats');
    const add = (k, v) => dl.append(el('dt', '', k), el('dd', 'sl-num', v));
    add('Distance', U.fmtInt(Math.floor(R.dist / 40)) + ' m');
    add('Pearls', String(R.pearls));
    add('Best', U.fmtInt(st.best));
    p.appendChild(dl);
    const fact = el('p', 'sl-puff__fact');
    fact.append(el('b', '', 'Ocean fact: '), document.createTextNode(FACTS[st.plays % FACTS.length]));
    p.appendChild(fact);
    const b = el('div', 'sl-stack');
    b.append(btn('Swim again', 'sl-btn--primary', () => restart()));
    if (G.mode === 'voice') b.append(btn('Retune voice', '', () => startCalibration()));
    b.append(btn('Back to title', 'sl-btn--ghost', () => leave()));
    p.appendChild(b);
    if (G.mode === 'voice') p.appendChild(el('p', 'sl-puff__note', 'Hands-free: hum for a second to swim again.'));
    focusFirst();
  }

  function leave() {
    if (SL.ui && SL.screens.has('title')) SL.ui.show('title');
  }

  // ------------------------------------------------------------------ the screen
  SL.screens.define('puff', {
    build(root) {
      root.classList.add('sl-puff');
      const canvas = el('canvas', 'sl-puff__canvas');
      canvas.setAttribute('aria-label', 'Puff\'s Ocean: Puff the pufferfish swimming through ocean pollution');
      canvas.setAttribute('role', 'img');
      root.appendChild(canvas);
      ui = { root, canvas, ctx: canvas.getContext('2d'), panel: null, meter: null };
      const down = (e) => {
        if (e.target !== canvas) return;
        pointerHeld = true;
        if (SL.audio && SL.audio.unlock) SL.audio.unlock();
        e.preventDefault();
      };
      const up = () => { pointerHeld = false; };
      canvas.addEventListener('pointerdown', down);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      ui.cleanup = () => {
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
    },
    onShow() {
      const d = SL.save.data;
      if (!U.isPlain(d.flags)) d.flags = {};
      if (!d.flags.puff_seen) { d.flags.puff_seen = true; SL.save.commit(); }
      newRun();
      showIntro();
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
      window.addEventListener('blur', onBlur);
      debugHooks();
    },
    onHide() {
      cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener('blur', onBlur);
      micStop();
      ambient(false);
      calib = null;
      pointerHeld = false;
      G.bot = false;
      G.state = 'off';
      if (ui && ui.cleanup) ui.cleanup();
      ui = null;
    },
    onInput(m) {
      const s = G.state;
      if (s === 'play') {
        if (m.pause || m.back) showPause();
        return true;
      }
      if (s === 'ready' || s === 'calib' || s === 'micwait') {
        if (m.back || m.pause) showIntro();
        return true;
      }
      if (s === 'paused' && (m.pause || m.back)) { resume(); return true; }
      if (s === 'intro' && m.back) { leave(); return true; }
      if ((s === 'over' || s === 'error') && m.back) { showIntro(); return true; }
      return false;
    },
  });
  function onBlur() { if (G.state === 'play' && !G.bot) showPause(); }

  // ------------------------------------------------------------------ title button, unlock note
  G.titleButton = function () {
    const open = unlocked();
    const b = el('button', 'sl-btn sl-puff-btn' + (open ? '' : ' sl-puff-btn--locked'));
    b.type = 'button';
    const name = el('span', 'sl-puff-btn__name', 'Puff\'s Ocean');
    b.appendChild(name);
    if (!open) {
      b.setAttribute('aria-disabled', 'true');
      b.appendChild(el('small', 'sl-puff-btn__sub', 'Locked · clear Mission 1'));
      b.addEventListener('click', () => { if (SL.ui && SL.ui.toast) SL.ui.toast('Clear Mission 1 to meet Puff.'); });
    } else {
      if (!(SL.save.data.flags && SL.save.data.flags.puff_seen)) b.appendChild(el('small', 'sl-puff-btn__new', 'NEW'));
      b.addEventListener('click', () => {
        if (SL.audio && SL.audio.sfx) SL.audio.sfx('ui_confirm');
        G.open();
      });
    }
    return b;
  };
  G.open = function () { if (SL.ui) SL.ui.show('puff'); };

  let justUnlocked = false;
  SL.onBoot(() => {
    SL.bus.on('missionComplete', (e) => {
      const r = e && e.result;
      if (!r || r.missionId !== UNLOCK_MISSION || (e.session && e.session.sandbox)) return;
      const d = SL.save.data;
      if (!U.isPlain(d.flags)) d.flags = {};
      if (!d.flags.unlock_puff) {
        d.flags.unlock_puff = true;
        justUnlocked = true;
        SL.save.commit();
      }
    });
    SL.bus.on('screenShow', (e) => {
      if (!e || e.id !== 'results' || !justUnlocked) return;
      justUnlocked = false;
      const panelEl = document.querySelector('#ui .sl-ui-results .sl-ui-panel');
      if (!panelEl) return;
      const note = el('div', 'sl-puff-unlock');
      note.append(el('b', '', 'Unlocked: Puff\'s Ocean'), el('span', '', 'Your pufferfish buddy has a minigame. Find it on the title screen.'));
      const row = panelEl.querySelector('.sl-row');
      panelEl.insertBefore(note, row || null);
    });
  });

  // ------------------------------------------------------------------ test hooks
  function simFrames(seconds) {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n && !(G.run && G.run.over); i++) step(1 / 60);
  }
  G.sim = function (seconds) {
    G.simulating = true;
    try { simFrames(seconds); } finally { G.simulating = false; }
  };
  /** Bot-plays `count` runs of up to `seconds` each and reports hits and survival (fairness check). */
  G.simRuns = function (count, seconds) {
    const keep = { state: G.state, mode: G.mode, bot: G.bot, run: G.run, st: JSON.stringify(store()) };
    const runs = [];
    G.simulating = true;
    G.bot = true;
    G.mode = 'keys';
    try {
      for (let i = 0; i < count; i++) {
        newRun(1000 + i);
        G.state = 'play';
        simFrames(seconds);
        const R = G.run;
        runs.push({ seed: 1000 + i, t: Math.round(R.t), hits: R.hits, hitLog: R.hitLog, alive: !R.over, pearls: R.pearls, score: finalScore(R) });
      }
    } finally {
      G.simulating = false;
      G.bot = keep.bot;
      G.mode = keep.mode;
      G.state = keep.state;
      G.run = keep.run;
      SL.save.data.puff = JSON.parse(keep.st);
    }
    const rep = { runs, survived: runs.filter((r) => r.alive).length, totalHits: runs.reduce((a, r) => a + r.hits, 0) };
    window.__PUFF__ = rep;
    console.log('[PUFF] sim: ' + rep.survived + '/' + count + ' survived, ' + rep.totalHits + ' hits total ' + JSON.stringify(runs.map((r) => r.hits)));
    return rep;
  };

  function debugHooks() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    const mode = q.get('puff');
    if (q.get('puffsim')) {
      const rep = G.simRuns(+q.get('puffsim') || 10, +q.get('puffsec') || 90);
      const pre = el('pre', 'sl-puff-report', JSON.stringify(rep));
      pre.id = 'puff-report';
      pre.hidden = true;
      document.body.appendChild(pre);
    }
    if (mode === 'play' || mode === 'bot') {
      G.mode = 'keys';
      toReady();
      G.bot = mode === 'bot';
      newRun(+q.get('seed') || 7);
      beginPlay();
      if (+q.get('t') > 0) G.sim(+q.get('t'));
    } else if (mode === 'calib') {
      G.mode = 'voice';
      startCalibration();
      calib.t = 0.4;
    } else if (mode === 'over') {
      G.mode = 'keys';
      newRun(7);
      G.run.dist = 52000;
      G.run.pearls = 37;
      G.run.score = 370;
      G.state = 'play';
      showOver();
    } else if (mode === 'pause') {
      G.mode = 'keys';
      newRun(7);
      G.bot = true;
      G.state = 'play';
      G.sim(+q.get('t') || 10);
      G.bot = false;
      showPause();
    }
  }
})(window.SL = window.SL || {});
