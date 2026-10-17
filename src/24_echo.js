/* 24_echo.js (echo)
   Provides: SL.echo = { unlocked(), unlock(), titleButton() -> <button>, open(), state, run, reveal, tick(dt),
   sim(seconds) } and the 'echo' screen: Echo, a stealth minigame about one escape.
   Blue Arrow, the main character, before Earth Vanguard and before she met Puff: a test subject the facility only
   called Subject 7, raised inside a sealed facility run by the Directorate, an arm of a
   civilization far older than ours. The experiments left her one gift: she can see with sound. Tonight the power
   failed. The facility is dark; each echo she sends out lights the walls for a few seconds as the ring passes, then
   they fade. Security drones carry their own red light and hear every echo, so seeing the way means being heard.
   Three sectors (B3 Cell Block, B2 Research Wing, B1 Containment Gate), each locked behind a keycard door. Being
   seen fills the alarm; a full alarm means capture and a retry of that sector. Memory shards are optional story.
   There is no in-game unlock trigger yet: PLAYTEST_UNLOCK keeps it open on the title screen, and unlock() sets
   save.flags.unlock_echo for whatever trigger comes later.
   The screen draws on its own canvas inside #ui (screen space, 720x1280 portrait or 1280x720 landscape view) with
   its own requestAnimationFrame loop, started in onShow and stopped in onHide.
   URL test hooks (with ?screen=echo): echo=play (start), sector=<0..2>, t=<sec> (fast-forward), echo=reveal (play
   with every wall lit), echo=caught, echo=escaped (open those panels). */
(function (SL) {
  'use strict';

  const U = SL.util;
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ tuning
  const T = 64;                  // tile size
  const PR = 15;                 // her radius
  const SPEED = 215, SNEAK = 105;
  const PING_R = 560;            // how far an echo reaches
  const PING_V = 760;            // ring speed (px/s)
  const PING_CD = 1.1;
  const HEAR_R = 360;            // drones hear an echo this far away
  const FADE = 0.34;             // lit walls fade per second (about 3 s)
  const AURA = 92;               // she always feels walls this close
  const FILL = 0.55, FILL_NEAR = 1.25; // alarm per second while seen (+ more up close)
  const DRAIN = 0.32, DRAIN_DELAY = 1.1;
  const LASER_HIT = 0.45;
  // TEMPORARY: no in-game trigger unlocks Echo yet, so it is open from the title screen. Set to false once one exists.
  const PLAYTEST_UNLOCK = true;

  // ------------------------------------------------------------------ the facility
  // # wall  . floor  S start  X exit hatch  D keycard door  k keycard  m memory shard
  // Guards use tile units: sentries walk their path as a loop (two points = back and forth); cameras sit at (x, y)
  // facing angle a and sweep +-sweep over period seconds; lasers cross tile (c, r) horizontally (h) or vertically (v).
  const SECTORS = [
    {
      floor: 'B3', name: 'Cell Block', hint: 'Send out an echo to see the walls.',
      map: [
        '#############',
        '######X######',
        '######D######',
        '#...........#',
        '#.###.###.#.#',
        '#.#m#.#k#.#.#',
        '#.#.#.#.#.#.#',
        '#...#...#...#',
        '#####.#######',
        '#.....#.....#',
        '#.#####.###.#',
        '#.#...#.#...#',
        '#.#.#.#.#.###',
        '#...#...#...#',
        '#######.###.#',
        '#m....#.....#',
        '###.#.#####.#',
        '#...#.......#',
        '#.#########.#',
        '#.....S.....#',
        '#############',
      ],
      sentries: [],
      cams: [{ x: 12, y: 3.5, a: Math.PI, sweep: 0.6, period: 6, range: 430 }],
      lasers: [],
    },
    {
      floor: 'B2', name: 'Research Wing', hint: 'Drones hear your echoes. Let them pass.',
      map: [
        '#############',
        '####X########',
        '####D########',
        '#...........#',
        '#.#########.#',
        '#.#...m...#.#',
        '#.#.#####.#.#',
        '#...#...#...#',
        '###.#.#.#.###',
        '#.....#.....#',
        '#.###.#.###.#',
        '#.#k..#...#.#',
        '#.#####.#.#.#',
        '#.......#...#',
        '#####.#######',
        '#...........#',
        '#.##.###.##.#',
        '#.##.#m#.##.#',
        '#....#.#....#',
        '#.####.####.#',
        '#.....S.....#',
        '#############',
      ],
      sentries: [
        { path: [[1, 15], [11, 15]], speed: 78 },
        { path: [[1, 3], [11, 3]], speed: 70 },
        { path: [[9, 7], [9, 9], [11, 9], [7, 9], [9, 9]], speed: 64 },
      ],
      cams: [],
      lasers: [{ c: 5, r: 14, dir: 'h', on: 1.6, off: 1.7, ph: 0 }],
    },
    {
      floor: 'B1', name: 'Containment Gate', hint: 'The surface hatch is close. Keep to the dark.',
      map: [
        '#############',
        '########X####',
        '########D####',
        '#...........#',
        '#.###.#.###.#',
        '#.#.......#.#',
        '#.#.#####.#.#',
        '#...#.m.#...#',
        '###.#...#.###',
        '#.........#k#',
        '#.#######.#.#',
        '#.#.....#...#',
        '#.#.###.#####',
        '#...#.......#',
        '#####.#####.#',
        '#m....#.....#',
        '#.#####.###.#',
        '#.....#.#...#',
        '#####.#.#.###',
        '#.......#...#',
        '#.#####.###.#',
        '#.....#S....#',
        '#############',
      ],
      sentries: [
        { path: [[5, 13], [11, 13]], speed: 80 },
        { path: [[1, 9], [9, 9]], speed: 76 },
        { path: [[1, 3], [11, 3]], speed: 92 },
      ],
      cams: [
        { x: 6.5, y: 5, a: Math.PI / 2, sweep: 0.8, period: 5, range: 300 },
        { x: 12, y: 15.5, a: Math.PI, sweep: 0.45, period: 4.4, range: 380 },
      ],
      lasers: [
        { c: 11, r: 20, dir: 'h', on: 1.4, off: 1.5, ph: 0.6 },
        { c: 5, r: 14, dir: 'h', on: 1.5, off: 1.4, ph: 0 },
      ],
    },
  ];

  const MEMORIES = [
    'Subject 7. That is what the clipboard said. Someone called me something else, once.',
    'The tests were always the same: a dark room, a tone, a wall I had to find without touching it.',
    'They never told me what I was for. Only that I was improving.',
    'A screen was left on in the lab once. Blue, with white shapes drifting across it. I think it was the sky.',
    'The reactor floors hum all night. I learned the shape of every hall from that hum.',
    'They gave me a number so I would forget my name. I never did. My name is Blue Arrow.',
  ];
  // shard ids: two per sector, in reading order of the map
  const SHARD_BASE = [0, 2, 4];

  // ------------------------------------------------------------------ save
  function store() {
    const d = SL.save.data;
    if (!U.isPlain(d.echo)) d.echo = {};
    const e = d.echo;
    e.best = Math.max(0, +e.best || 0);
    e.wins = Math.max(0, Math.floor(+e.wins || 0));
    e.plays = Math.max(0, Math.floor(+e.plays || 0));
    e.reached = U.clamp(Math.floor(+e.reached || 0), 0, SECTORS.length - 1);
    if (!Array.isArray(e.mem)) e.mem = [];
    e.mem = e.mem.filter((i) => Number.isInteger(i) && i >= 0 && i < MEMORIES.length);
    return e;
  }
  function flags() {
    const d = SL.save.data;
    if (!U.isPlain(d.flags)) d.flags = {};
    return d.flags;
  }
  function unlocked() { return PLAYTEST_UNLOCK || !!flags().unlock_echo; }

  // ------------------------------------------------------------------ audio (own small context, like Puff's Ocean)
  const snd = { ac: null, out: null, noise: null, hum: null };
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
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
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
  function sfx(id, k) {
    if (G.simulating) return;
    switch (id) {
      case 'ping': // the call and two fainter returns
        tone(1500, 1050, 0.2, 0.09);
        tone(1500, 1050, 0.18, 0.035, 'sine', 0.24);
        tone(1500, 1050, 0.16, 0.015, 'sine', 0.48);
        break;
      case 'seen': tone(560 + 640 * k, 560 + 640 * k, 0.07, 0.045, 'square'); break;
      case 'key': tone(880, 880, 0.1, 0.07, 'triangle'); tone(1320, 1320, 0.16, 0.07, 'triangle', 0.08); break;
      case 'shard': [523, 784, 1046].forEach((f, i) => tone(f, f * 1.002, 0.5, 0.05, 'sine', i * 0.12)); break;
      case 'door': tone(300, 700, 0.18, 0.08, 'triangle'); hiss(0.35, 0.06, 900, 0.8); break;
      case 'locked': tone(220, 200, 0.16, 0.08, 'square'); break;
      case 'laser': hiss(0.25, 0.14, 3200, 1.5); tone(1800, 300, 0.2, 0.07, 'sawtooth'); break;
      case 'caught': tone(220, 110, 0.7, 0.11, 'sawtooth'); tone(233, 116, 0.7, 0.08, 'sawtooth', 0.05); break;
      case 'sector': tone(392, 392, 0.2, 0.06, 'triangle'); tone(523, 523, 0.3, 0.06, 'triangle', 0.14); break;
      case 'free': [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.5, 0.07, 'triangle', i * 0.13)); break;
      default: break;
    }
  }
  // low reactor hum while she moves through the facility
  function hum(on) {
    const ac = snd.ac;
    if (on && !snd.hum && ac && ac.state === 'running' && noiseBuf()) {
      const g = ac.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(1, ac.currentTime + 1.5);
      g.connect(snd.out);
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(), og = ac.createGain();
      o1.frequency.value = 55;
      o2.frequency.value = 82.7;
      og.gain.value = 0.018;
      o1.connect(og);
      o2.connect(og);
      og.connect(g);
      const n = ac.createBufferSource();
      n.buffer = snd.noise;
      n.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const ng = ac.createGain();
      ng.gain.value = 0.03;
      n.connect(f);
      f.connect(ng);
      ng.connect(g);
      o1.start();
      o2.start();
      n.start();
      snd.hum = { g, srcs: [o1, o2, n] };
    } else if (!on && snd.hum) {
      const h = snd.hum;
      snd.hum = null;
      try {
        h.g.gain.cancelScheduledValues(ac.currentTime);
        h.g.gain.setValueAtTime(h.g.gain.value, ac.currentTime);
        h.g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
        h.srcs.forEach((s) => s.stop(ac.currentTime + 0.45));
      } catch (e) { /* already stopped */ }
    }
  }

  // ------------------------------------------------------------------ state
  const G = SL.echo = {
    state: 'off',   // off | intro | play | paused | caught | escaped
    run: null,
    reveal: false,  // debug: every wall stays lit
    simulating: false,
    unlocked,
  };
  let ui = null;    // { root, canvas, ctx, panel, cleanup }

  function newRun(sector) {
    G.run = { sector: 0, t: 0, captures: 0, frags: [], pings: [], parts: [], msg: null, flash: 0 };
    loadSector(G.run, sector || 0);
  }

  function loadSector(R, i) {
    const S = SECTORS[i];
    R.sector = i;
    R.grid = S.map.map((row) => row.split(''));
    R.rows = R.grid.length;
    R.cols = R.grid[0].length;
    R.rev = new Float32Array(R.rows * R.cols);
    R.edges = new Uint8Array(R.rows * R.cols);
    computeEdges(R);
    R.key = false;
    R.alarm = 0;
    R.calm = 99;
    R.watch = -1;
    R.seenBeep = 0;
    R.pingCd = 0;
    R.pings.length = 0;
    R.parts.length = 0;
    R.laserCd = 0;
    R.st = 0;
    R.caughtT = 0;
    R.doorMsg = 0;
    R.fragsAtStart = R.frags.slice();
    R.banner = 3.2;
    R.shardIds = {};
    let si = 0;
    for (let r = 0; r < R.rows; r++) {
      for (let c = 0; c < R.cols; c++) {
        const ch = R.grid[r][c];
        if (ch === 'S') { R.px = (c + 0.5) * T; R.py = (r + 0.5) * T; R.grid[r][c] = '.'; }
        if (ch === 'm') {
          const id = SHARD_BASE[i] + si++;
          if (R.frags.indexOf(id) >= 0) R.grid[r][c] = '.';
          else R.shardIds[r * R.cols + c] = id;
        }
      }
    }
    R.face = -Math.PI / 2;
    R.walk = 0;
    R.sentries = S.sentries.map((d) => {
      const pts = d.path.map((p) => ({ x: (p[0] + 0.5) * T, y: (p[1] + 0.5) * T }));
      const n = pts[1] || pts[0];
      return {
        x: pts[0].x, y: pts[0].y, a: Math.atan2(n.y - pts[0].y, n.x - pts[0].x), pts, wi: pts.length > 1 ? 1 : 0,
        speed: d.speed || 75, range: d.range || 250, half: 0.52, mode: 'patrol', route: [], wait: 0, timer: 0,
        lostT: 0, lastX: 0, lastY: 0, scanA: 0, bob: Math.random() * TAU,
      };
    });
    R.cams = S.cams.map((d) => ({
      x: d.x * T, y: d.y * T, base: d.a, a: d.a, sweep: d.sweep, period: d.period, range: d.range || 340, half: 0.34,
      ph: 0, lock: false, lostT: 0, callT: 0,
    }));
    R.lasers = S.lasers.map((d) => {
      const cx = (d.c + 0.5) * T, cy = (d.r + 0.5) * T;
      return d.dir === 'v'
        ? { x0: cx, y0: d.r * T, x1: cx, y1: (d.r + 1) * T, on: d.on, off: d.off, ph: d.ph || 0, live: false, warn: false }
        : { x0: d.c * T, y0: cy, x1: (d.c + 1) * T, y1: cy, on: d.on, off: d.off, ph: d.ph || 0, live: false, warn: false };
    });
    R.cam = null;
    const st = store();
    if (i > st.reached) { st.reached = i; SL.save.commit(); }
  }

  // ------------------------------------------------------------------ grid helpers
  function tileAt(R, c, r) { return c < 0 || r < 0 || c >= R.cols || r >= R.rows ? '#' : R.grid[r][c]; }
  function solid(R, c, r) { const ch = tileAt(R, c, r); return ch === '#' || ch === 'D'; }
  function solidAt(R, x, y) { return solid(R, Math.floor(x / T), Math.floor(y / T)); }
  function computeEdges(R) {
    for (let r = 0; r < R.rows; r++) {
      for (let c = 0; c < R.cols; c++) {
        if (R.grid[r][c] !== '#') continue;
        let m = 0;
        if (r > 0 && R.grid[r - 1][c] !== '#') m |= 1;
        if (c < R.cols - 1 && R.grid[r][c + 1] !== '#') m |= 2;
        if (r < R.rows - 1 && R.grid[r + 1][c] !== '#') m |= 4;
        if (c > 0 && R.grid[r][c - 1] !== '#') m |= 8;
        R.edges[r * R.cols + c] = m;
      }
    }
  }
  /** Tile index of the first solid tile on the segment, or -1 if it is clear. */
  function firstSolid(R, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 7));
    for (let i = 1; i <= n; i++) {
      const x = x0 + (dx * i) / n, y = y0 + (dy * i) / n;
      const c = Math.floor(x / T), r = Math.floor(y / T);
      if (solid(R, c, r)) return r * R.cols + c;
    }
    return -1;
  }
  function clear(R, x0, y0, x1, y1) { return firstSolid(R, x0, y0, x1, y1) < 0; }
  /** How far a ray goes before a wall (for drawing light cones). */
  function rayLen(R, x, y, a, max) {
    const cx = Math.cos(a) * 8, cy = Math.sin(a) * 8;
    let d = 0;
    while (d < max) {
      x += cx;
      y += cy;
      d += 8;
      if (solidAt(R, x, y)) return d - 4;
    }
    return max;
  }
  /** Shortest walkable route (tile centers) from one point to another; empty when unreachable. */
  function route(R, x0, y0, x1, y1) {
    const cols = R.cols, n = R.rows * cols;
    const s = Math.floor(y0 / T) * cols + Math.floor(x0 / T);
    const g = Math.floor(y1 / T) * cols + Math.floor(x1 / T);
    if (s === g) return [{ x: x1, y: y1 }];
    const prev = new Int16Array(n).fill(-1);
    const q = [s];
    prev[s] = s;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (i === g) break;
      const c = i % cols, r = (i - c) / cols;
      const nb = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]];
      for (const [nc, nr] of nb) {
        if (solid(R, nc, nr)) continue;
        const j = nr * cols + nc;
        if (prev[j] >= 0) continue;
        prev[j] = i;
        q.push(j);
      }
    }
    if (prev[g] < 0) return [];
    const out = [];
    for (let i = g; i !== s; i = prev[i]) {
      const c = i % cols;
      out.push({ x: (c + 0.5) * T, y: ((i - c) / cols + 0.5) * T });
    }
    return out.reverse();
  }
  function wrapA(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  function turn(cur, goal, max) { const d = wrapA(goal - cur); return cur + U.clamp(d, -max, max); }

  // ------------------------------------------------------------------ input
  const touch = { id: -1, x0: 0, y0: 0, x: 0, y: 0, t0: 0, moved: false, tap: false };
  let pingWas = false;
  function readInput() {
    const out = { x: 0, y: 0, sneak: false, ping: false };
    if (G.simulating) return out;
    const I = SL.input;
    const p = I && I.players && I.players[0];
    const h = (c) => I && I.isHeld && I.isHeld(c);
    if (p) {
      out.x = p.sx != null ? p.sx : p.mx;
      out.y = p.sy != null ? p.sy : p.my;
      out.sneak = !!p.focus;
    }
    if (touch.id >= 0 && touch.moved) {
      const dx = touch.x - touch.x0, dy = touch.y - touch.y0;
      const d = Math.hypot(dx, dy);
      const k = Math.min(1, d / 46) / (d || 1);
      out.x = dx * k;
      out.y = dy * k;
    }
    const pad = I && I.lastDevice === 'gamepad';
    const down = h('Space') || h('KeyZ') || h('KeyJ') || h('KeyE') || h('KeyX') || !!(p && pad && (p.bomb || p.skill || p.fire));
    out.ping = (down && !pingWas) || touch.tap;
    pingWas = down;
    touch.tap = false;
    return out;
  }

  // ------------------------------------------------------------------ update
  function step(dt) {
    const R = G.run;
    if (!R) return;
    R.flash = Math.max(0, R.flash - dt * 2.5);
    updateParts(R, dt);
    updatePings(R, dt);
    if (G.state === 'caught') {
      R.caughtT += dt;
      for (const s of R.sentries) s.a = turn(s.a, Math.atan2(R.py - s.y, R.px - s.x), 3 * dt);
      if (R.caughtT > 1.4 && !R.caughtShown) { R.caughtShown = true; showCaught(); }
      return;
    }
    if (G.state !== 'play') return;
    R.t += dt;
    R.st += dt;
    R.banner = Math.max(0, R.banner - dt);
    if (R.msg) { R.msg.t -= dt; if (R.msg.t <= 0) R.msg = null; }
    R.doorMsg = Math.max(0, R.doorMsg - dt);
    R.laserCd = Math.max(0, R.laserCd - dt);
    R.pingCd = Math.max(0, R.pingCd - dt);

    const inp = readInput();
    if (inp.ping && R.pingCd <= 0) ping(R);
    let mx = inp.x, my = inp.y;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    const sp = inp.sneak ? SNEAK : SPEED;
    if (m > 0.15) {
      R.face = turn(R.face, Math.atan2(my, mx), 12 * dt);
      R.walk += dt * (inp.sneak ? 5 : 9) * Math.min(1, m);
    }
    R.px += mx * sp * dt;
    collide(R);
    R.py += my * sp * dt;
    collide(R);
    touchTiles(R);
    if (G.state !== 'play') return;

    // reveal decay
    if (!G.reveal) {
      const f = FADE * dt;
      for (let i = 0; i < R.rev.length; i++) if (R.rev[i] > 0) R.rev[i] = Math.max(0, R.rev[i] - f);
    }

    R.watch = -1;
    for (const s of R.sentries) updSentry(R, s, dt);
    for (const c of R.cams) updCam(R, c, dt);
    updLasers(R);

    if (R.watch >= 0) {
      R.alarm += dt * (FILL + FILL_NEAR * R.watch);
      R.calm = 0;
      R.seenBeep -= dt;
      if (R.seenBeep <= 0) { R.seenBeep = 0.24 - 0.12 * R.alarm; sfx('seen', R.alarm); }
    } else {
      R.calm += dt;
      if (R.calm > DRAIN_DELAY) R.alarm = Math.max(0, R.alarm - DRAIN * dt);
    }
    if (R.alarm >= 1) caught(R);
  }

  function collide(R) {
    for (let pass = 0; pass < 2; pass++) {
      const c0 = Math.floor((R.px - PR) / T), c1 = Math.floor((R.px + PR) / T);
      const r0 = Math.floor((R.py - PR) / T), r1 = Math.floor((R.py + PR) / T);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (!solid(R, c, r)) continue;
          const qx = U.clamp(R.px, c * T, c * T + T), qy = U.clamp(R.py, r * T, r * T + T);
          const dx = R.px - qx, dy = R.py - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= PR * PR) continue;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            R.px += (dx / d) * (PR - d);
            R.py += (dy / d) * (PR - d);
          } else {
            R.py = r * T + T + PR; // center inside a wall: push down (never happens on open floor)
          }
        }
      }
    }
  }

  function touchTiles(R) {
    // doors: opened by walking into them with the keycard
    const c0 = Math.floor((R.px - PR - 3) / T), c1 = Math.floor((R.px + PR + 3) / T);
    const r0 = Math.floor((R.py - PR - 3) / T), r1 = Math.floor((R.py + PR + 3) / T);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (tileAt(R, c, r) !== 'D') continue;
        if (R.key) {
          R.grid[r][c] = 'd';
          R.rev[r * R.cols + c] = 1;
          sfx('door');
          say(R, 'Door open. The hatch is right above.', 2.6);
          sparkle(R, (c + 0.5) * T, (r + 0.5) * T, '#ffd35a', 18);
        } else if (R.doorMsg <= 0) {
          R.doorMsg = 2.5;
          sfx('locked');
          say(R, 'Locked. A keycard opens it.', 2.4);
        }
      }
    }
    const c = Math.floor(R.px / T), r = Math.floor(R.py / T);
    const ch = tileAt(R, c, r);
    if (ch === 'k') {
      R.grid[r][c] = '.';
      R.key = true;
      sfx('key');
      say(R, 'Keycard. Now find the door.', 2.6);
      sparkle(R, R.px, R.py, '#ffd35a', 16);
    } else if (ch === 'm') {
      R.grid[r][c] = '.';
      const id = R.shardIds[r * R.cols + c];
      if (R.frags.indexOf(id) < 0) R.frags.push(id);
      const st = store();
      if (st.mem.indexOf(id) < 0) { st.mem.push(id); SL.save.commit(); }
      sfx('shard');
      say(R, MEMORIES[id], 6, true);
      sparkle(R, R.px, R.py, '#c9a6ff', 22);
    } else if (ch === 'X') {
      sectorDone(R);
    }
  }

  function say(R, text, t, memory) { R.msg = { text, t, max: t, memory: !!memory }; }

  function ping(R) {
    R.pingCd = PING_CD;
    const x = R.px, y = R.py;
    // which tiles this echo can reach, nearest first (walls block it; the wall face it hits lights up)
    const list = [];
    const cols = R.cols;
    const cr = Math.ceil(PING_R / T);
    const pc = Math.floor(x / T), pr = Math.floor(y / T);
    for (let r = Math.max(0, pr - cr); r <= Math.min(R.rows - 1, pr + cr); r++) {
      for (let c = Math.max(0, pc - cr); c <= Math.min(cols - 1, pc + cr); c++) {
        const i = r * cols + c;
        const cx = (c + 0.5) * T, cy = (r + 0.5) * T;
        const d = Math.hypot(cx - x, cy - y);
        if (d > PING_R) continue;
        let seen;
        if (solid(R, c, r)) {
          const qx = U.clamp(x, c * T, c * T + T), qy = U.clamp(y, r * T, r * T + T);
          const qd = Math.hypot(qx - x, qy - y) || 1;
          seen = firstSolid(R, x, y, qx + ((qx - x) / qd) * 3, qy + ((qy - y) / qd) * 3) === i || firstSolid(R, x, y, cx, cy) === i;
        } else {
          seen = clear(R, x, y, cx, cy);
        }
        if (seen) list.push({ d, i });
      }
    }
    list.sort((a, b) => a.d - b.d);
    R.pings.push({ x, y, r: 0, list, idx: 0 });
    if (R.pings.length > 4) R.pings.shift();
    sfx('ping');
    // drones hear it and come to look
    for (const s of R.sentries) {
      if (s.mode === 'watch') continue;
      if (Math.hypot(s.x - x, s.y - y) < HEAR_R) search(R, s, x, y);
    }
  }
  function updatePings(R, dt) {
    for (let k = R.pings.length - 1; k >= 0; k--) {
      const p = R.pings[k];
      p.r += PING_V * dt;
      while (p.idx < p.list.length && p.list[p.idx].d <= p.r) R.rev[p.list[p.idx++].i] = 1;
      if (p.r > PING_R + 120) R.pings.splice(k, 1);
    }
  }

  // --- watchers: >= 0 (closeness 0..1) when they can see her, -1 when not
  function sees(R, w) {
    const dx = R.px - w.x, dy = R.py - w.y;
    const d = Math.hypot(dx, dy);
    if (d > w.range + PR) return -1;
    const off = Math.abs(wrapA(Math.atan2(dy, dx) - w.a));
    if (off > w.half + Math.asin(Math.min(1, PR / Math.max(d, PR)))) return -1;
    if (!clear(R, w.x, w.y, R.px, R.py)) return -1;
    return U.clamp(1 - d / w.range, 0, 1);
  }

  function search(R, s, x, y) {
    s.route = route(R, s.x, s.y, x, y);
    s.mode = s.route.length ? 'search' : 'scan';
    s.timer = 2.4;
    s.scanA = s.a;
  }
  function moveSentry(R, s, tx, ty, spd, dt, turnRate) {
    const dx = tx - s.x, dy = ty - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const k = Math.min(1, (spd * dt) / d);
    s.x += dx * k;
    s.y += dy * k;
    if (turnRate) s.a = turn(s.a, Math.atan2(dy, dx), turnRate * dt);
    return k >= 1;
  }
  function updSentry(R, s, dt) {
    s.bob += dt * 3;
    const see = sees(R, s);
    if (see >= 0) {
      s.mode = 'watch';
      s.lostT = 0;
      s.lastX = R.px;
      s.lastY = R.py;
      s.a = turn(s.a, Math.atan2(R.py - s.y, R.px - s.x), 2.6 * dt);
      R.watch = Math.max(R.watch, see);
      return;
    }
    switch (s.mode) {
      case 'watch':
        s.lostT += dt;
        s.a = turn(s.a, Math.atan2(s.lastY - s.y, s.lastX - s.x), 2.6 * dt);
        if (s.lostT > 0.5) search(R, s, s.lastX, s.lastY);
        break;
      case 'search': {
        const n = s.route[0];
        if (!n) { s.mode = 'scan'; s.timer = 2.4; s.scanA = s.a; break; }
        if (moveSentry(R, s, n.x, n.y, s.speed * 1.6, dt, 5)) s.route.shift();
        break;
      }
      case 'scan':
        s.timer -= dt;
        s.a = s.scanA + Math.sin((2.4 - s.timer) * 2.4) * 1.1;
        if (s.timer <= 0) {
          const p = s.pts[s.wi];
          s.route = route(R, s.x, s.y, p.x, p.y);
          s.mode = 'return';
        }
        break;
      case 'return': {
        const n = s.route[0];
        if (!n) { s.mode = 'patrol'; break; }
        if (moveSentry(R, s, n.x, n.y, s.speed * 1.1, dt, 5)) s.route.shift();
        break;
      }
      default: { // patrol
        if (s.wait > 0) {
          s.wait -= dt;
          const p = s.pts[s.wi];
          s.a = turn(s.a, Math.atan2(p.y - s.y, p.x - s.x), 3 * dt);
          break;
        }
        const p = s.pts[s.wi];
        if (moveSentry(R, s, p.x, p.y, s.speed, dt, 5)) {
          s.wi = (s.wi + 1) % s.pts.length;
          s.wait = 0.7;
        }
      }
    }
  }
  function updCam(R, c, dt) {
    const see = sees(R, c);
    if (see >= 0) {
      c.lock = true;
      c.lostT = 0;
      c.a = turn(c.a, Math.atan2(R.py - c.y, R.px - c.x), 1.3 * dt);
      R.watch = Math.max(R.watch, see);
      // it calls the nearest drone over
      c.callT -= dt;
      if (c.callT <= 0) {
        c.callT = 2.5;
        let best = null, bd = 760;
        for (const s of R.sentries) {
          const d = Math.hypot(s.x - R.px, s.y - R.py);
          if (d < bd && s.mode !== 'watch') { bd = d; best = s; }
        }
        if (best) search(R, best, R.px, R.py);
      }
      return;
    }
    c.callT = Math.min(c.callT, 0.6);
    if (c.lock) {
      c.lostT += dt;
      if (c.lostT > 1.3) c.lock = false;
      return;
    }
    c.ph += dt;
    c.a = turn(c.a, c.base + Math.sin((c.ph * TAU) / c.period) * c.sweep, 1.6 * dt);
  }
  function updLasers(R) {
    for (const L of R.lasers) {
      const cyc = L.on + L.off;
      const k = (R.st + L.ph) % cyc;
      L.live = k < L.on;
      L.warn = !L.live && k > cyc - 0.45;
      if (!L.live || R.laserCd > 0) continue;
      // distance from her to the beam
      const dx = L.x1 - L.x0, dy = L.y1 - L.y0;
      const t = U.clamp(((R.px - L.x0) * dx + (R.py - L.y0) * dy) / (dx * dx + dy * dy), 0, 1);
      const d = Math.hypot(R.px - (L.x0 + dx * t), R.py - (L.y0 + dy * t));
      if (d < PR + 2) {
        R.alarm += LASER_HIT;
        R.calm = 0;
        R.laserCd = 1;
        R.flash = 1;
        sfx('laser');
        sparkle(R, R.px, R.py, '#ff4d6d', 14);
        say(R, 'Tripped a laser. Wait for it to switch off.', 2.4);
      }
    }
  }

  function caught(R) {
    G.state = 'caught';
    R.alarm = 1;
    R.caughtT = 0;
    R.caughtShown = false;
    R.captures++;
    R.flash = 1;
    hum(false);
    sfx('caught');
  }

  function sectorDone(R) {
    if (R.sector + 1 < SECTORS.length) {
      loadSector(R, R.sector + 1);
      sfx('sector');
      for (let i = 0; i < 24; i++) part(R, R.px, R.py, U.lerp(-120, 120, Math.random()), U.lerp(-120, 120, Math.random()), 0.8, '#9fe8ff', 3);
      return;
    }
    G.state = 'escaped';
    hum(false);
    sfx('free');
    const st = store();
    st.wins++;
    R.newBest = !st.best || R.t < st.best;
    if (R.newBest) st.best = Math.round(R.t * 10) / 10;
    st.reached = 0;
    flags().echo_escaped = true;
    SL.save.commit();
    showEscaped();
  }

  // ------------------------------------------------------------------ particles
  function part(R, x, y, vx, vy, life, color, size) {
    if (R.parts.length >= 140) R.parts.shift();
    R.parts.push({ x, y, vx, vy, life, max: life, color, size });
  }
  function sparkle(R, x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = 40 + Math.random() * 120;
      part(R, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.5, color, 2 + Math.random() * 2);
    }
  }
  function updateParts(R, dt) {
    for (let i = R.parts.length - 1; i >= 0; i--) {
      const p = R.parts[i];
      p.life -= dt;
      if (p.life <= 0) { R.parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2 * dt;
      p.vy *= 1 - 2 * dt;
    }
  }

  // ------------------------------------------------------------------ drawing
  function viewSize() {
    const Rn = SL.render;
    const land = !!(Rn && Rn.land);
    return { w: (Rn && Rn.vw) || (land ? SL.H : SL.W), h: (Rn && Rn.vh) || (land ? SL.W : SL.H) };
  }
  function hudK() {
    return (SL.save && SL.save.settings && +SL.save.settings.textScale) || 1.15;
  }
  let vignette = null;
  function vignetteFor(w, h) {
    if (vignette && vignette.w === w && vignette.h === h) return vignette.c;
    const c = document.createElement('canvas');
    c.width = w * 2;
    c.height = h * 2;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(w, h, 60, w, h, Math.max(w, h) * 0.75);
    gr.addColorStop(0, 'rgba(2,4,9,0)');
    gr.addColorStop(0.45, 'rgba(2,4,9,0.35)');
    gr.addColorStop(1, 'rgba(2,4,9,0.92)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w * 2, h * 2);
    vignette = { w, h, c };
    return c;
  }
  let skyCache = null;
  function sky(w, h) {
    if (skyCache && skyCache.w === w && skyCache.h === h) return skyCache.c;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#060b22');
    gr.addColorStop(0.55, '#1b2f5e');
    gr.addColorStop(0.8, '#a05a6a');
    gr.addColorStop(0.92, '#ffb46b');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const r = SL.makeRng(11);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = 'rgba(255,255,255,' + r.range(0.2, 0.9).toFixed(2) + ')';
      const s = r.range(1, 2.6);
      g.fillRect(r.range(0, w), r.range(0, h * 0.6), s, s);
    }
    // hills and the facility hatch behind her
    g.fillStyle = '#0a0f1c';
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 40) g.lineTo(x, h * 0.86 + Math.sin(x * 0.011) * 18 + Math.sin(x * 0.031) * 7);
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    g.fillStyle = '#151c2c';
    g.fillRect(w * 0.12, h * 0.83, 70, 30);
    g.fillStyle = 'rgba(93,255,176,0.6)';
    g.fillRect(w * 0.12 + 10, h * 0.83 + 6, 50, 4);
    skyCache = { w, h, c };
    return c;
  }

  function render() {
    if (!ui) return;
    const c = ui.canvas;
    const cw = c.clientWidth, chh = c.clientHeight;
    if (!cw || !chh) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(cw * dpr), bh = Math.round(chh * dpr);
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
    const V = viewSize();
    const ctx = ui.ctx;
    ctx.setTransform(bw / V.w, 0, 0, bh / V.h, 0, 0);
    const R = G.run;
    if (G.state === 'escaped') {
      ctx.drawImage(sky(V.w, V.h), 0, 0);
      drawGirl(ctx, V.w * 0.5, V.h * 0.86 - 4, -Math.PI / 2, R ? R.t * 2 : 0, 1.6);
      return;
    }
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, V.w, V.h);
    if (!R) return;

    // camera follows her (centered when the map is narrower than the view)
    const mw = R.cols * T, mh = R.rows * T;
    const gx = mw <= V.w ? (mw - V.w) / 2 : U.clamp(R.px - V.w / 2, -T * 0.5, mw - V.w + T * 0.5);
    const gy = mh <= V.h ? (mh - V.h) / 2 : U.clamp(R.py - V.h * 0.55, -T * 0.5, mh - V.h + T * 0.5);
    if (!R.cam) R.cam = { x: gx, y: gy };
    const k = Math.min(1, (G.simulating ? 1 : 1 / 60) * 7);
    R.cam.x += (gx - R.cam.x) * k;
    R.cam.y += (gy - R.cam.y) * k;
    const ox = Math.round(R.cam.x), oy = Math.round(R.cam.y);
    const now = performance.now() / 1000;

    ctx.save();
    ctx.translate(-ox, -oy);
    drawTiles(ctx, R, ox, oy, V, now);
    drawPings(ctx, R);
    drawLasers(ctx, R, now);
    for (const cam of R.cams) drawCone(ctx, R, cam, cam.lock ? 'watch' : 'cam', now);
    for (const s of R.sentries) drawCone(ctx, R, s, s.mode, now);
    for (const cam of R.cams) drawCamBody(ctx, cam);
    for (const s of R.sentries) drawDrone(ctx, s, now);
    drawGirl(ctx, R.px, R.py, R.face, R.walk, 1);
    drawCooldown(ctx, R);
    drawParts(ctx, R);
    ctx.restore();

    // darkness falls off around her
    ctx.drawImage(vignetteFor(V.w, V.h), R.px - ox - V.w, R.py - oy - V.h);
    const red = G.state === 'caught' ? Math.min(0.55, R.caughtT * 0.6) : R.alarm > 0.6 ? (R.alarm - 0.6) * 0.35 * (0.6 + 0.4 * Math.sin(now * 10)) : 0;
    if (red > 0 || R.flash > 0) {
      ctx.fillStyle = 'rgba(255,40,80,' + Math.max(red, R.flash * 0.35).toFixed(3) + ')';
      ctx.fillRect(0, 0, V.w, V.h);
    }
    drawHud(ctx, R, V, now);
  }

  function drawTiles(ctx, R, ox, oy, V, now) {
    const c0 = Math.max(0, Math.floor(ox / T)), c1 = Math.min(R.cols - 1, Math.floor((ox + V.w) / T));
    const r0 = Math.max(0, Math.floor(oy / T)), r1 = Math.min(R.rows - 1, Math.floor((oy + V.h) / T));
    const auraR = AURA + T * 0.7;
    ctx.lineCap = 'round';
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * R.cols + c;
        const ch = R.grid[r][c];
        const x = c * T, y = r * T;
        const d = Math.hypot(x + T / 2 - R.px, y + T / 2 - R.py);
        const aura = d < auraR ? (1 - d / auraR) * 0.75 : 0;
        const vis = G.reveal ? 1 : Math.max(R.rev[i], aura);
        if (ch === '#') {
          const e = R.edges[i];
          if (!e || vis < 0.02) continue;
          ctx.globalAlpha = vis * 0.8;
          ctx.fillStyle = '#0b1a2a';
          ctx.fillRect(x, y, T, T);
          ctx.globalAlpha = vis;
          ctx.strokeStyle = '#7fe3ff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          if (e & 1) { ctx.moveTo(x, y); ctx.lineTo(x + T, y); }
          if (e & 2) { ctx.moveTo(x + T, y); ctx.lineTo(x + T, y + T); }
          if (e & 4) { ctx.moveTo(x, y + T); ctx.lineTo(x + T, y + T); }
          if (e & 8) { ctx.moveTo(x, y); ctx.lineTo(x, y + T); }
          ctx.stroke();
          continue;
        }
        if (vis > 0.02) {
          ctx.globalAlpha = vis * 0.09;
          ctx.fillStyle = '#5fc8ff';
          ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
          ctx.globalAlpha = vis * 0.35;
          ctx.fillRect(x + T / 2 - 1, y + T / 2 - 1, 2, 2);
        }
        if (ch === 'D' || ch === 'd') drawDoor(ctx, x, y, ch === 'd', Math.max(vis, 0.4), R.key, now);
        else if (ch === 'X') drawExit(ctx, x, y, now);
        else if (ch === 'k') drawKey(ctx, x + T / 2, y + T / 2, Math.max(vis, 0.3 + 0.2 * Math.sin(now * 3)), now);
        else if (ch === 'm') drawShard(ctx, x + T / 2, y + T / 2, Math.max(vis, 0.3 + 0.2 * Math.sin(now * 2.2 + c)), now);
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawDoor(ctx, x, y, open, a, key, now) {
    ctx.globalAlpha = a;
    if (open) {
      ctx.strokeStyle = 'rgba(255,211,90,0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, y + 4, T - 8, T - 8);
      return;
    }
    ctx.fillStyle = '#3a2a08';
    ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
    ctx.strokeStyle = '#ffd35a';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 3, y + 3, T - 6, T - 6);
    ctx.beginPath();
    for (let i = 1; i < 4; i++) { ctx.moveTo(x + 6, y + (i * T) / 4); ctx.lineTo(x + T - 6, y + (i * T) / 4); }
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = key ? (Math.sin(now * 6) > 0 ? '#5dffb0' : '#1d6a48') : '#ff4d6d';
    ctx.fillRect(x + T / 2 - 5, y + T - 14, 10, 6);
  }
  function drawExit(ctx, x, y, now) {
    const p = 0.6 + 0.4 * Math.sin(now * 2.5);
    ctx.globalAlpha = 0.25 * p;
    ctx.fillStyle = '#5dffb0';
    ctx.beginPath();
    ctx.arc(x + T / 2, y + T / 2, T * 0.9, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#5dffb0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + T / 2, y + T / 2, T * 0.32, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const yy = y + T / 2 + 10 - i * 9;
      ctx.moveTo(x + T / 2 - 8, yy);
      ctx.lineTo(x + T / 2, yy - 7);
      ctx.lineTo(x + T / 2 + 8, yy);
    }
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  function drawKey(ctx, x, y, a, now) {
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = '#ffd35a';
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, a + 0.2);
    ctx.save();
    ctx.translate(x, y + Math.sin(now * 3) * 2);
    ctx.rotate(-0.25);
    ctx.fillStyle = '#ffd35a';
    ctx.fillRect(-13, -9, 26, 18);
    ctx.fillStyle = '#3a2a08';
    ctx.fillRect(-9, -4, 10, 3);
    ctx.fillRect(4, 2, 6, 4);
    ctx.restore();
  }
  function drawShard(ctx, x, y, a, now) {
    ctx.globalAlpha = a * 0.4;
    ctx.fillStyle = '#c9a6ff';
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, a + 0.25);
    ctx.save();
    ctx.translate(x, y + Math.sin(now * 2) * 3);
    ctx.rotate(now * 0.8);
    ctx.fillStyle = '#efe4ff';
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 12);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawPings(ctx, R) {
    ctx.lineWidth = 3;
    for (const p of R.pings) {
      const a = U.clamp(1 - p.r / PING_R, 0, 1);
      if (a <= 0) continue;
      ctx.globalAlpha = a * 0.75;
      ctx.strokeStyle = '#9fe8ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.stroke();
      if (p.r > 30) {
        ctx.globalAlpha = a * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r - 26, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawLasers(ctx, R, now) {
    for (const L of R.lasers) {
      ctx.fillStyle = '#ff4d6d';
      for (const [x, y] of [[L.x0, L.y0], [L.x1, L.y1]]) {
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, TAU);
        ctx.fill();
      }
      if (L.live) {
        ctx.strokeStyle = '#ff4d6d';
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(L.x0, L.y0);
        ctx.lineTo(L.x1, L.y1);
        ctx.stroke();
        ctx.globalAlpha = 0.9 + 0.1 * Math.sin(now * 40);
        ctx.strokeStyle = '#ffd0dc';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (L.warn && Math.sin(now * 30) > 0) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(L.x0, L.y0);
        ctx.lineTo(L.x1, L.y1);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  const CONE = {
    patrol: ['rgba(255,80,96,0.13)', 'rgba(255,80,96,0.5)'],
    cam: ['rgba(255,80,96,0.10)', 'rgba(255,80,96,0.4)'],
    search: ['rgba(255,181,63,0.15)', 'rgba(255,181,63,0.55)'],
    scan: ['rgba(255,181,63,0.15)', 'rgba(255,181,63,0.55)'],
    return: ['rgba(255,80,96,0.13)', 'rgba(255,80,96,0.5)'],
    watch: ['rgba(255,40,70,0.28)', 'rgba(255,120,140,0.9)'],
  };
  function drawCone(ctx, R, w, mode, now) {
    const col = CONE[mode] || CONE.patrol;
    const n = 18;
    ctx.beginPath();
    ctx.moveTo(w.x, w.y);
    for (let i = 0; i <= n; i++) {
      const a = w.a - w.half + (2 * w.half * i) / n;
      const d = rayLen(R, w.x, w.y, a, w.range);
      ctx.lineTo(w.x + Math.cos(a) * d, w.y + Math.sin(a) * d);
    }
    ctx.closePath();
    ctx.fillStyle = col[0];
    ctx.globalAlpha = mode === 'watch' ? 0.8 + 0.2 * Math.sin(now * 14) : 1;
    ctx.fill();
    ctx.strokeStyle = col[1];
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawDrone(ctx, s, now) {
    const y = s.y + Math.sin(s.bob) * 2;
    ctx.save();
    ctx.translate(s.x, y);
    ctx.rotate(s.a);
    // rotor arms
    ctx.strokeStyle = '#3c4a5c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, -14);
    ctx.lineTo(14, 14);
    ctx.moveTo(-14, 14);
    ctx.lineTo(14, -14);
    ctx.stroke();
    ctx.fillStyle = 'rgba(160,190,220,0.35)';
    const spin = now * 30;
    for (const [rx, ry] of [[-14, -14], [14, 14], [-14, 14], [14, -14]]) {
      ctx.beginPath();
      ctx.ellipse(rx, ry, 8, 2.5, spin, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#1b2533';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#6b7f98';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = s.mode === 'watch' ? '#ff2f55' : s.mode === 'search' || s.mode === 'scan' ? '#ffb53f' : '#ff5c6d';
    ctx.beginPath();
    ctx.arc(7, 0, 4.5, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (s.mode === 'watch' || s.mode === 'search' || s.mode === 'scan') {
      ctx.font = '800 22px Oxanium, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = s.mode === 'watch' ? '#ff4d6d' : '#ffb53f';
      ctx.fillText(s.mode === 'watch' ? '!' : '?', s.x, y - 24);
    }
  }
  function drawCamBody(ctx, c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = '#2a3646';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.rotate(c.a);
    ctx.fillStyle = '#4b5d74';
    ctx.fillRect(0, -6, 16, 12);
    ctx.fillStyle = c.lock ? '#ff2f55' : '#ff5c6d';
    ctx.beginPath();
    ctx.arc(16, 0, 3.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // Blue Arrow, seen from above: pale gown, dark hair, a faint glow
  function drawGirl(ctx, x, y, face, walk, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#9fe8ff';
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(face + Math.PI / 2);
    const sw = Math.sin(walk) * 4;
    // feet
    ctx.fillStyle = '#c9d6e3';
    ctx.beginPath();
    ctx.ellipse(-5, -sw, 3, 5, 0, 0, TAU);
    ctx.ellipse(5, sw, 3, 5, 0, 0, TAU);
    ctx.fill();
    // gown and shoulders
    ctx.fillStyle = '#e8eef5';
    ctx.beginPath();
    ctx.ellipse(0, 2, 12, 8, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#9fb3c8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // head and hair (hair falls behind her)
    ctx.fillStyle = '#1c1420';
    ctx.beginPath();
    ctx.ellipse(0, 3, 7.5, 9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f1d3c2';
    ctx.beginPath();
    ctx.arc(0, -2, 5.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1c1420';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI);
    ctx.fill();
    ctx.restore();
  }
  function drawCooldown(ctx, R) {
    if (R.pingCd <= 0 || G.state !== 'play') return;
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#9fe8ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(R.px, R.py, 24, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - R.pingCd / PING_CD));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawParts(ctx, R) {
    for (const p of R.parts) {
      ctx.globalAlpha = U.clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function label(ctx, str, x, y, font, color, align) {
    ctx.font = font;
    ctx.textAlign = align || 'left';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(2,4,9,0.7)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }
  /** Splits text into lines no wider than w (in the current font). */
  function wrapText(ctx, text, w) {
    const out = [];
    let line = '';
    for (const word of text.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }
  function drawHud(ctx, R, V, now) {
    if (G.state === 'intro' || G.state === 'off') return;
    const k = hudK();
    const w = V.w / k;
    ctx.save();
    ctx.scale(k, k);
    ctx.textBaseline = 'alphabetic';
    const S = SECTORS[R.sector];
    label(ctx, S.floor + ' · ' + S.name.toUpperCase(), 22, 36, '800 18px Oxanium, sans-serif', '#9fe8ff');
    label(ctx, U.fmtTime ? U.fmtTime(R.t) : Math.floor(R.t) + 's', w - 22, 36, '700 18px Oxanium, sans-serif', '#eef6ff', 'right');
    // keycard and shards
    let x = 22;
    ctx.globalAlpha = R.key ? 1 : 0.3;
    ctx.fillStyle = '#ffd35a';
    ctx.fillRect(x, 50, 22, 15);
    ctx.globalAlpha = 1;
    x += 34;
    label(ctx, '◆ ' + R.frags.length + '/' + MEMORIES.length, x, 64, '700 15px Oxanium, sans-serif', '#c9a6ff');
    // alarm, under the timer
    const bw = 180, bx = w - 22 - bw, by = 52;
    ctx.fillStyle = 'rgba(2,4,9,0.65)';
    ctx.fillRect(bx - 3, by - 3, bw + 6, 16);
    ctx.strokeStyle = 'rgba(159,232,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 3.5, by - 3.5, bw + 7, 17);
    const a = U.clamp(R.alarm, 0, 1);
    ctx.fillStyle = a > 0.66 ? '#ff2f55' : a > 0.33 ? '#ffb53f' : '#5fc8ff';
    ctx.fillRect(bx, by, bw * a, 10);
    const spotted = R.watch >= 0 && G.state === 'play';
    if (spotted && Math.sin(now * 14) > -0.3) label(ctx, 'SPOTTED', w - 22, by + 32, '800 17px Oxanium, sans-serif', '#ff4d6d', 'right');
    else label(ctx, 'ALARM', w - 22, by + 30, '600 13px Oxanium, sans-serif', 'rgba(200,220,240,0.7)', 'right');
    // sector banner
    if (R.banner > 0 && G.state === 'play') {
      ctx.globalAlpha = U.clamp(Math.min(R.banner, 3.2 - R.banner) * 2.5, 0, 1);
      const cy = V.h / k * 0.33;
      label(ctx, S.floor, w / 2, cy, '800 54px Oxanium, sans-serif', '#ffffff', 'center');
      label(ctx, S.name, w / 2, cy + 36, '700 24px Oxanium, sans-serif', '#9fe8ff', 'center');
      label(ctx, S.hint, w / 2, cy + 66, '600 17px "Barlow Semi Condensed", sans-serif', 'rgba(230,240,255,0.9)', 'center');
      ctx.globalAlpha = 1;
    }
    // messages and memories
    if (R.msg) {
      ctx.globalAlpha = U.clamp(Math.min(R.msg.t, R.msg.max - R.msg.t) * 3, 0, 1);
      ctx.font = (R.msg.memory ? 'italic 600 19px' : '600 18px') + ' "Barlow Semi Condensed", sans-serif';
      const lines = wrapText(ctx, R.msg.text, Math.min(w - 60, 560));
      const hgt = V.h / k;
      let y = hgt - 70 - (lines.length - 1) * 24;
      if (R.msg.memory) label(ctx, 'MEMORY', w / 2, y - 28, '700 13px Oxanium, sans-serif', '#c9a6ff', 'center');
      for (const ln of lines) { label(ctx, ln, w / 2, y, ctx.font, R.msg.memory ? '#efe4ff' : '#eef6ff', 'center'); y += 24; }
      ctx.globalAlpha = 1;
    } else if (R.sector === 0 && R.st < 9 && G.state === 'play') {
      const touchDev = SL.input && SL.input.lastDevice === 'touch';
      ctx.globalAlpha = U.clamp(9 - R.st, 0, 1);
      label(ctx, touchDev ? 'Tap: echo · Drag: move' : 'Space: echo · WASD / arrows: move · Shift: sneak', w / 2, V.h / k - 60, '600 18px "Barlow Semi Condensed", sans-serif', 'rgba(230,240,255,0.9)', 'center');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ flow
  let raf = 0, last = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 1 / 30);
    try {
      step(dt);
      render();
    } catch (err) {
      U.warnOnce('echo-frame', '[SL.echo] frame threw:', err);
    }
  }

  /** One frame of the screen without requestAnimationFrame (tests drive this headless). */
  G.tick = function (dt) {
    step(dt);
    render();
  };

  function clearPanel() {
    if (ui && ui.panel) { ui.panel.remove(); ui.panel = null; }
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
    const wrap = el('div', 'sl-echo__overlay ' + (cls || ''));
    const p = el('div', 'sl-panel sl-echo__panel');
    wrap.appendChild(p);
    ui.root.appendChild(wrap);
    ui.panel = wrap;
    return p;
  }
  /** Two content columns: stacked in portrait, side by side in landscape (CSS). */
  function cols(p) {
    const wrap = el('div', 'sl-echo__cols');
    const a = el('div', 'sl-echo__col'), b = el('div', 'sl-echo__col sl-echo__col--side');
    wrap.append(a, b);
    p.appendChild(wrap);
    return [a, b];
  }
  function focusFirst() {
    if (!ui || !ui.panel) return;
    const b = ui.panel.querySelector('button');
    if (b && SL.input.lastDevice !== 'touch') b.focus({ preventScroll: true });
  }

  function showIntro() {
    G.state = 'intro';
    hum(false);
    const st = store();
    const p = panel('sl-echo__overlay--intro');
    p.append(el('div', 'sl-label', 'Minigame · Echo'), el('h2', 'sl-title sl-title--md sl-echo__title', 'Echo'));
    const [a, b] = cols(p);
    a.appendChild(el('p', 'sl-echo__story',
      'Blue Arrow has never seen the sky. All she remembers is Cell 7, deep inside a facility run by the Directorate, an ' +
      'arm of a civilization far older than ours, and the experiments. They left her one gift: she can see with sound. ' +
      'Tonight the power failed. The doors are dead, the halls are dark, and this is her chance.'));
    const how = el('ul', 'sl-echo__how');
    [['Echo', 'Space, Z or tap. Walls light up as the ring passes, then fade.'],
      ['Listen', 'drones hear every echo and come to look where it started.'],
      ['Hide', 'stay out of the red light. If the alarm fills, she is caught.'],
      ['Escape', 'find the keycard, open the door, climb the hatch. Three floors to the surface.']]
      .forEach(([k, v]) => { const li = el('li'); li.append(el('b', '', k + ': '), document.createTextNode(v)); how.appendChild(li); });
    a.appendChild(how);
    if (st.best) b.appendChild(el('div', 'sl-echo__best sl-num', 'Best escape: ' + (U.fmtTime ? U.fmtTime(st.best) : st.best + ' s')));
    if (st.mem.length) b.appendChild(el('div', 'sl-echo__best sl-num', 'Memories found: ' + st.mem.length + ' / ' + MEMORIES.length));
    const bs = el('div', 'sl-stack');
    bs.append(btn('Begin the escape', 'sl-btn--primary', () => startRun(0)));
    if (st.reached > 0) bs.append(btn('Continue from ' + SECTORS[st.reached].floor, '', () => startRun(st.reached)));
    bs.append(btn('Back to title', 'sl-btn--ghost', () => leave()));
    b.appendChild(bs);
    b.appendChild(el('p', 'sl-echo__note', 'Headphones help: every echo comes back to you.'));
    focusFirst();
  }

  function startRun(sector) {
    audioOn();
    clearPanel();
    newRun(sector);
    const st = store();
    st.plays++;
    SL.save.commit();
    G.state = 'play';
    pingWas = true; // the key that pressed the button doesn't also send an echo
    sfx('sector');
    hum(true);
  }
  function retrySector() {
    const R = G.run;
    clearPanel();
    R.frags = R.fragsAtStart.slice();
    loadSector(R, R.sector);
    G.state = 'play';
    pingWas = true;
    hum(true);
  }

  function showPause() {
    if (G.state !== 'play') return;
    G.state = 'paused';
    hum(false);
    const p = panel();
    p.append(el('div', 'sl-label', 'Echo · ' + SECTORS[G.run.sector].floor + ' ' + SECTORS[G.run.sector].name), el('h2', 'sl-title sl-title--md', 'Paused'));
    const b = el('div', 'sl-stack');
    b.append(
      btn('Resume', 'sl-btn--primary', () => resume()),
      btn('Restart floor', '', () => retrySector()),
      btn('Quit to title', 'sl-btn--ghost', () => leave()));
    p.appendChild(b);
    focusFirst();
  }
  function resume() {
    if (G.state !== 'paused') return;
    clearPanel();
    G.state = 'play';
    pingWas = true;
    hum(true);
  }

  const CAUGHT_LINES = [
    'Lights. Hands on her shoulders. A voice says "Back to Cell 7." Not tonight. Try again.',
    'The drone\'s light pins her to the wall. She hears the guards coming. Try again.',
    'The alarm screams through the floor. She is not going back. Try again.',
  ];
  function showCaught() {
    const R = G.run;
    const S = SECTORS[R.sector];
    const p = panel('sl-echo__overlay--caught');
    p.classList.add('sl-panel--danger');
    p.append(el('div', 'sl-label', S.floor + ' · ' + S.name), el('h2', 'sl-title sl-title--md sl-title--danger', 'Caught'));
    p.appendChild(el('p', 'sl-echo__story', CAUGHT_LINES[(R.captures - 1) % CAUGHT_LINES.length]));
    const b = el('div', 'sl-stack');
    b.append(btn('Try again', 'sl-btn--primary', () => retrySector()), btn('Quit to title', 'sl-btn--ghost', () => leave()));
    p.appendChild(b);
    focusFirst();
  }

  function showEscaped() {
    const R = G.run;
    const st = store();
    const p = panel('sl-echo__overlay--free');
    p.append(el('div', 'sl-label', R.newBest ? 'New best escape!' : 'The surface'), el('h2', 'sl-title sl-title--md sl-echo__title', 'Free'));
    const [a, b] = cols(p);
    a.appendChild(el('p', 'sl-echo__story',
      'The hatch gives way to cold air and more sky than she has words for. Behind her the alarms fade into the hum ' +
      'of the facility. She doesn\'t look back. Her name is Blue Arrow, and she is free.'));
    const dl = el('dl', 'sl-ui-stats sl-echo__stats');
    const add = (k, v) => dl.append(el('dt', '', k), el('dd', 'sl-num', v));
    add('Time', U.fmtTime ? U.fmtTime(R.t) : Math.round(R.t) + ' s');
    add('Caught', String(R.captures));
    add('Memories', R.frags.length + ' / ' + MEMORIES.length);
    add('Best', U.fmtTime ? U.fmtTime(st.best) : st.best + ' s');
    b.appendChild(dl);
    const bs = el('div', 'sl-stack');
    // In the story (after the prologue, before Mission 1), Continue carries on to Earth Vanguard (26_cutscenes.js).
    if (SL.cutscenes && SL.cutscenes.inStory()) {
      bs.append(btn('Continue', 'sl-btn--primary', () => SL.cutscenes.afterEcho()), btn('Escape again', '', () => startRun(0)));
    } else {
      bs.append(btn('Escape again', 'sl-btn--primary', () => startRun(0)), btn('Back to title', 'sl-btn--ghost', () => leave()));
    }
    b.appendChild(bs);
    focusFirst();
  }

  function leave() {
    if (SL.ui && SL.screens.has('title')) SL.ui.show('title');
  }

  // ------------------------------------------------------------------ the screen
  SL.screens.define('echo', {
    build(root) {
      root.classList.add('sl-echo');
      const canvas = el('canvas', 'sl-echo__canvas');
      canvas.setAttribute('aria-label', 'Echo: Blue Arrow escaping a dark facility by sound');
      canvas.setAttribute('role', 'img');
      root.appendChild(canvas);
      ui = { root, canvas, ctx: canvas.getContext('2d'), panel: null };
      // touch / mouse: drag to move, tap to echo
      const down = (e) => {
        if (e.target !== canvas || touch.id >= 0) return;
        touch.id = e.pointerId;
        touch.x0 = touch.x = e.clientX;
        touch.y0 = touch.y = e.clientY;
        touch.t0 = performance.now();
        touch.moved = false;
        if (SL.audio && SL.audio.unlock) SL.audio.unlock();
        audioOn();
        e.preventDefault();
      };
      const move = (e) => {
        if (e.pointerId !== touch.id) return;
        touch.x = e.clientX;
        touch.y = e.clientY;
        if (Math.hypot(touch.x - touch.x0, touch.y - touch.y0) > 12) touch.moved = true;
      };
      const up = (e) => {
        if (e.pointerId !== touch.id) return;
        if (!touch.moved && performance.now() - touch.t0 < 350) touch.tap = true;
        touch.id = -1;
        touch.moved = false;
      };
      canvas.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      ui.cleanup = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
    },
    onShow() {
      const f = flags();
      if (!f.echo_seen) { f.echo_seen = true; SL.save.commit(); }
      newRun(0);
      G.reveal = false;
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
      hum(false);
      touch.id = -1;
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
      if (s === 'caught') return true;
      if (s === 'paused' && (m.pause || m.back)) { resume(); return true; }
      if ((s === 'intro' || s === 'escaped') && m.back) { leave(); return true; }
      return false;
    },
  });
  function onBlur() { if (G.state === 'play') showPause(); }

  // ------------------------------------------------------------------ title button
  G.titleButton = function () {
    const open = unlocked();
    const b = el('button', 'sl-btn sl-echo-btn' + (open ? '' : ' sl-echo-btn--locked'));
    b.type = 'button';
    b.appendChild(el('span', 'sl-echo-btn__name', 'Echo'));
    if (!open) {
      b.setAttribute('aria-disabled', 'true');
      b.appendChild(el('small', 'sl-echo-btn__sub', 'Locked'));
      b.addEventListener('click', () => { if (SL.ui && SL.ui.toast) SL.ui.toast('Echo is still locked.'); });
    } else {
      if (!flags().echo_seen) b.appendChild(el('small', 'sl-echo-btn__new', 'NEW'));
      b.addEventListener('click', () => {
        if (SL.audio && SL.audio.sfx) SL.audio.sfx('ui_confirm');
        G.open();
      });
    }
    return b;
  };
  G.open = function () { if (SL.ui) SL.ui.show('echo'); };
  /** For the future story trigger: opens Echo on the title screen for good. */
  G.unlock = function () {
    const f = flags();
    if (f.unlock_echo) return false;
    f.unlock_echo = true;
    SL.save.commit();
    return true;
  };

  SL.onBoot(() => {
    SL.bus.on('orient', () => { vignette = null; skyCache = null; });
  });

  // ------------------------------------------------------------------ test hooks
  G.sim = function (seconds) {
    G.simulating = true;
    try {
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n && G.state === 'play'; i++) step(1 / 60);
    } finally { G.simulating = false; }
  };

  function debugHooks() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    const mode = q.get('echo');
    const sec = U.clamp(+q.get('sector') || 0, 0, SECTORS.length - 1);
    if (mode === 'play' || mode === 'reveal') {
      startRun(sec);
      G.reveal = mode === 'reveal';
      if (+q.get('t') > 0) G.sim(+q.get('t'));
    } else if (mode === 'caught') {
      startRun(sec);
      caught(G.run);
      G.run.caughtT = 2;
      G.run.caughtShown = true;
      showCaught();
    } else if (mode === 'escaped') {
      startRun(SECTORS.length - 1);
      G.run.t = 312.4;
      G.run.frags = [0, 1, 3, 4];
      G.run.captures = 2;
      sectorDone(G.run);
    }
  }
})(window.SL = window.SL || {});
