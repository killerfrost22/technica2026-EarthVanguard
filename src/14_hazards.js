/* 14_hazards.js (hazards)
   Provides the six hazards of GDD section 9 through SL.hazards.define:
     black_hole      sizes small | medium | large. Options size, x, y, vx, vy, life (0 = until the mission ends),
                     fixed, pullMul (1), grow (1.5 s), attachTo + offsetX / offsetY, binary {cx, cy, r, w, vy},
                     horizonDamage (18 per 0.5 s), and overrides r, range, pull, strength.
     asteroid_storm  variants rock | ice | debris. Options duration, density (1 = 1.4 rocks/s), dir, sizes, variant.
     ion_storm       options cells, duration, strikeEvery.
     solar_flare     options from ('left'|'right'|'top'), count, every, first, warn, burn, cover.
     mine_field      options count, duration, drift, rigged; def methods rig(h) and setDrift(h, px).
     wormhole        options a [x, y], b [x, y], life, bullets ('both'|'enemy'|'none'), players.
   Hazard prop prop_shade_rock (skins rock, mirror). Helpers on SL.hazards: shadeRock(x, y, {r, vy, skin, life}),
   end(h) (graceful end), shaded(x, y, from), segmentShaded(ax, ay, bx, by), shadeSources(), gravitySources(),
   rigMines(), setMineDrift(px), propDefs. Every hazard emits SL.bus 'hazardWarning' {id, text, h} before it can
   hurt anyone and deals no player damage during its first 1.5 s; gravity sources publish
   h.gravity = {x, y, pull, range, r} every update. Sandboxes: 'hazard:<id>' and 'hazard:<id>:<variant>'
   (docs/api/hazards.md). */
(function (SL) {
  'use strict';

  const U = SL.util, C = SL.color, A = SL.art, EZ = SL.ease;
  const TAU = Math.PI * 2, W = SL.W, H = SL.H;
  const GRACE = 1.5;
  const rnd = Math.random;
  const rr = (a, b) => a + (b - a) * rnd();

  // ================================================================== shared helpers
  const reported = new Set();
  function report(key, err) {
    if (reported.has(key)) return;
    reported.add(key);
    console.error('[hazards] ' + key + ' threw (further errors are ignored):', err);
  }
  function sfx(id, x, vol) { U.sfx(id, vol != null ? { x, vol } : { x }); }
  function loopStart(id) {
    const l = U.audio('loop', id, { vol: 0 });
    return l && typeof l.set === 'function' ? l : null;
  }
  function loopSet(l, vol, x) {
    if (!l) return;
    try { l.set({ vol: U.clamp(vol, 0, 1), pan: U.clamp((x - W / 2) / (W / 2), -1, 1) }); } catch (err) { report('audio loop set', err); }
  }
  function loopStop(l, fade) {
    if (!l || typeof l.stop !== 'function') return;
    try { l.stop(fade != null ? fade : 0.5); } catch (err) { report('audio loop stop', err); }
  }
  function warn(h, text) { SL.bus.emit('hazardWarning', { id: h.typeId, text, h }); }
  function diff() { return (SL.game && SL.game.diff) || { enemyHp: 1, damage: 1 }; }
  function session() { return SL.game && SL.game.session; }
  function lowQ() { return SL.render && SL.render.quality === 'low'; }
  function live(p) { return p && p.alive && !p.down && !p.display; }
  const HEAVY_IDS = { hive: 1, bastion: 1, tug: 1 };
  function isHeavy(e) {
    if (!e) return false;
    const d = e.def || {};
    return !!(e.isBoss || e.heavy || d.heavy || d.class === 'heavy' || d.cls === 'heavy' || d.klass === 'heavy' ||
      d.explosion === 'xl' || HEAVY_IDS[e.typeId]);
  }
  /** Player damage from a hazard: nothing during the hazard's first 1.5 s; source 'hazard' unless given. */
  function hurtPlayer(h, p, amount, source) {
    if (h && h.age < GRACE) return 0;
    return SL.damagePlayer(p, amount, { source: source || 'hazard', hazard: h ? h.typeId : null }) || 0;
  }
  function hurtEnemy(e, amount, x, y) {
    if (!e || e.dead || e.dying) return 0;
    return SL.damageEnemy(e, amount, { type: 'hazard', x: x != null ? x : e.x, y: y != null ? y : e.y }) || 0;
  }
  function addScore(n, x, y) {
    const s = session();
    if (!s || !SL.game || !SL.game.addScore) return;
    // floating text only for the big ones (as registerKill does), so a rock storm does not spam numbers
    const pts = Math.round(n * (s.mult || 1));
    if (n >= 200) SL.game.addScore(pts, x, y); else SL.game.addScore(pts);
  }
  function dropCredits(x, y, range) {
    const n = SL.rng.int(range[0], range[1]);
    for (let i = 0; i < n; i++) {
      const o = { vx: (SL.rng.next() - 0.5) * 140, vy: -70 - SL.rng.next() * 80, value: 1 };
      try {
        if (SL.pickups && SL.pickups.spawn) SL.pickups.spawn('credit', x, y, o);
        else SL.world.spawnPickup('credit', x, y, o);
      } catch (err) { report('credit spawn', err); }
    }
  }
  /** Erases enemy bullets within r of (x, y) with small sparks; returns the count. */
  function clearBulletsIn(x, y, r, color) {
    const r2 = r * r;
    let n = 0;
    for (const b of SL.world.ebullets) {
      if (b.dead) continue;
      const dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy > r2) continue;
      b.dead = true;
      n++;
      if (n <= 70) SL.fx.emit({ x: b.x, y: b.y, vx: dx * 0.8, vy: dy * 0.8, life: 0.4, size: 11, size2: 2, color: color || b.color || '#ffffff', drag: 3 });
    }
    return n;
  }
  function onScreenish(x, y, m) { return x > -m && x < W + m && y > -m && y < H + m; }
  /** Portal / teleport cooldown bookkeeping on any entity or pooled bullet (b.data is a known key on bullets). */
  function dataOf(o) { if (!o.data) o.data = {}; return o.data; }

  // bilinear sample of a tileable noise field, wrapping both axes
  function nsample(n, w, h, x, y) {
    x = ((x % w) + w) % w;
    y = ((y % h) + h) % h;
    const x0 = x | 0, y0 = y | 0, x1 = (x0 + 1) % w, y1 = (y0 + 1) % h, fx = x - x0, fy = y - y0;
    const a = n[y0 * w + x0], b = n[y0 * w + x1], c = n[y1 * w + x0], d = n[y1 * w + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  /** [[t, color], ...] -> Uint8ClampedArray(n * 3) color ramp. */
  function rampLUT(stops, n) {
    const lut = new Uint8ClampedArray(n * 3), cs = stops.map((s) => [s[0], C.parse(s[1])]);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let k = 0;
      while (k < cs.length - 2 && t > cs[k + 1][0]) k++;
      const a = cs[k], b = cs[k + 1], f = U.clamp((t - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * f;
    }
    return lut;
  }
  /** Square texture built per pixel in polar coordinates: f(rho 0..1, u 0..1 angle from +x, out[r,g,b,a 0..255]). */
  function polarTexture(S, f) {
    const c = A.canvas(S, S), x = c.getContext('2d');
    const img = x.createImageData(S, S), px = img.data, half = S / 2, out = [0, 0, 0, 0];
    for (let j = 0; j < S; j++) {
      const dy = (j + 0.5 - half) / half;
      for (let i = 0; i < S; i++) {
        const dx = (i + 0.5 - half) / half;
        const rho = Math.sqrt(dx * dx + dy * dy);
        if (rho > 1) continue;
        let u = Math.atan2(dy, dx) / TAU;
        if (u < 0) u += 1;
        out[3] = 0;
        f(rho, u, out);
        if (!(out[3] > 0)) continue;
        const k = (j * S + i) * 4;
        px[k] = out[0]; px[k + 1] = out[1]; px[k + 2] = out[2]; px[k + 3] = out[3];
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function defineCanvas(key, S, fn) {
    // a raw S x S texture (no pad) built by fn() -> canvas
    A.define(key, S, S, (ctx) => { ctx.drawImage(fn(), 0, 0); }, { pad: 0 });
  }
  /** Offscreen compositing buffers (black-hole disks), pooled by size. Draw-time cosmetics only. */
  const bufPool = [];
  function takeBuf(S) {
    for (let i = 0; i < bufPool.length; i++) if (bufPool[i].width === S) return bufPool.splice(i, 1)[0];
    return A.canvas(S, S);
  }
  function giveBuf(c) { if (c && bufPool.length < 8) bufPool.push(c); }

  // ================================================================== black hole: art
  const BH_TEX = 512, BH_IN = 320;   // outer disk texture (full disk) and inner hot ring texture (inner half)
  const DISK_K = 6.4;                // disk outer radius in horizon radii
  const DISK_RI = 0.2;               // inner edge of the outer texture (fraction of the disk radius)

  /** Polar accretion-disk texture: orbit-stretched filaments x hot clumps x ridged dust lanes, a white-hot inner
      edge, colored by temperature (t = 0 at the inner edge). */
  function diskTexture(S, o) {
    const fa = o.fa, fr = o.fr;
    const nF = A.noise(fa, fr, { scale: o.fs, octaves: 4, seed: o.seed, gain: 0.6 });
    const nB = A.noise(64, 64, { scale: o.bs, octaves: 3, seed: o.seed + 11, gain: 0.5 });
    const nL = A.noise(128, 128, { scale: o.ls, octaves: 3, seed: o.seed + 23, gain: 0.45, ridged: true });
    const lut = rampLUT(o.stops, 256);
    const ri = o.ri, ro = o.ro, amax = o.amax * 255;
    return polarTexture(S, (rho, u, out) => {
      if (rho < ri * 0.95 || rho > ro) return;
      const t = U.clamp((rho - ri) / (ro - ri), 0, 1);
      const us = u + t * o.twist;
      const f = nsample(nF, fa, fr, us * fa, t * fr * o.rf);
      const b = nsample(nB, 64, 64, (u + t * o.twist * 0.6) * 64, t * 64 * o.bf);
      const l = nsample(nL, 128, 128, (u + t * o.twist * 0.8) * 128, t * 128 * o.lf);
      const fil = Math.pow(f, o.gamma);
      const clump = o.c0 + o.c1 * b * b;
      const lane = 1 - o.lane * Math.pow(l, 2.2);
      const edge = U.smoothstep(ri * 0.95, ri * 1.025, rho) * (1 - U.smoothstep(o.fade, 1, t));
      const hz = (t - o.hotT) / o.hotW, hot = Math.exp(-hz * hz);
      const v = edge * (o.prof(t) * (o.base + o.gain * fil * clump) * lane + o.hot * hot * (0.55 + 0.7 * f));
      if (v <= 0.004) return;
      const ci = (U.clamp(t * o.ct + (1 - fil) * 0.16 - hot * 0.16 + (1 - lane) * 0.12, 0, 1) * 255) | 0;
      out[0] = lut[ci * 3]; out[1] = lut[ci * 3 + 1]; out[2] = lut[ci * 3 + 2];
      out[3] = Math.min(amax, v * 255);
    });
  }

  function defineBlackHoleArt() {
    // outer disk: white-gold inner edge -> gold -> orange -> deep red, spiral filaments, hot clumps, dust lanes
    defineCanvas('hz:bh:diskO', BH_TEX, () => diskTexture(BH_TEX, {
      seed: 41, fa: 112, fr: 384, fs: 16, rf: 1, bs: 16, bf: 0.55, ls: 16, lf: 0.6,
      ri: DISK_RI, ro: 1, twist: 0.36, gamma: 1.7, base: 0.22, gain: 1.55, c0: 0.4, c1: 1.5, lane: 0.62,
      hot: 0.75, hotT: 0.02, hotW: 0.035, fade: 0.55, ct: 0.95, amax: 0.8,
      prof: (t) => 0.1 + 1.15 * Math.exp(-t * 3.2),
      stops: [[0, '#fffdf4'], [0.05, '#fff0c6'], [0.14, '#ffd27a'], [0.3, '#ffa247'], [0.5, '#f4642a'], [0.72, '#b42a2b'], [1, '#4a0b22']],
    }));
    // inner hot ring (drawn at half the disk radius, spinning faster): thin bright filaments
    defineCanvas('hz:bh:diskI', BH_IN, () => diskTexture(BH_IN, {
      seed: 77, fa: 96, fr: 256, fs: 16, rf: 1.3, bs: 16, bf: 0.8, ls: 16, lf: 0.9,
      ri: DISK_RI / 0.5 * 0.985, ro: 1, twist: 0.25, gamma: 2.2, base: 0.05, gain: 1.35, c0: 0.3, c1: 1.6, lane: 0.5,
      hot: 0.55, hotT: 0.01, hotW: 0.05, fade: 0.45, ct: 0.75, amax: 0.8,
      prof: (t) => Math.exp(-t * 3.6),
      stops: [[0, '#ffffff'], [0.1, '#fff4d6'], [0.3, '#ffd88a'], [0.6, '#ffa04a'], [1, '#e2552c']],
    }));
    // two-tone tint (source-atop): the approaching side (left) runs white-gold, the receding side deep crimson
    defineCanvas('hz:bh:tint', BH_TEX, () => polarTexture(BH_TEX, (rho, u, out) => {
      const c = Math.cos(u * TAU);
      if (c < 0) { const a = Math.pow(-c, 1.4) * 0.5; out[0] = 255; out[1] = 244; out[2] = 214; out[3] = a * 255; }
      else { const a = Math.pow(c, 1.1) * 0.62; out[0] = 168; out[1] = 26; out[2] = 34; out[3] = a * 255; }
    }));
    // Doppler beaming (destination-in): full brightness where the disk comes toward us (left), dim where it recedes
    defineCanvas('hz:bh:dop', BH_TEX, () => polarTexture(BH_TEX, (rho, u, out) => {
      const k = (1 - Math.cos(u * TAU)) / 2;
      out[0] = out[1] = out[2] = 255;
      out[3] = (0.25 + 0.75 * k) * 255;
    }));
    // 2D fallback: lensed far side of the disk arching over the horizon, and the thin under-arch (mask)
    defineCanvas('hz:bh:archm', BH_TEX, () => polarTexture(BH_TEX, (rho, u, out) => {
      const s = Math.sin(u * TAU);                 // < 0 on top
      const top = Math.pow(Math.max(0, -s), 0.42), bot = Math.pow(Math.max(0, s), 1.6);
      const rT = U.smoothstep(0.19, 0.205, rho) * Math.pow(1 - U.smoothstep(0.205, 0.46, rho), 1.3);
      const rB = U.smoothstep(0.19, 0.2, rho) * (1 - U.smoothstep(0.2, 0.27, rho));
      const dop = 0.4 + 0.6 * Math.pow((1 - Math.cos(u * TAU)) / 2, 1.2);
      out[0] = out[1] = out[2] = 255;
      out[3] = Math.min(1, (top * rT + 0.55 * bot * rB) * dop) * 255;
    }));
    // white-hot inner edge (ISCO) added into the disk composite: radially symmetric, so a plain gradient
    A.define('hz:bh:hot', 512, 512, (ctx, w, h) => {
      const R0 = w / 2, g = ctx.createRadialGradient(R0, R0, 0, R0, R0, R0);
      const st = [[0, 0, '255,240,210'], [DISK_RI * 0.95, 0, '255,240,210'], [DISK_RI * 1.0, 0.45, '255,248,232'],
        [DISK_RI * 1.03, 1, '255,252,244'], [DISK_RI * 1.09, 0.55, '255,226,160'], [DISK_RI * 1.25, 0.22, '255,170,90'],
        [DISK_RI * 1.6, 0.06, '255,120,60'], [DISK_RI * 2.1, 0, '255,100,50'], [1, 0, '255,100,50']];
      for (const q of st) g.addColorStop(q[0], 'rgba(' + q[2] + ',' + q[1] + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { pad: 0 });
    // gravitational darkening of the sky around the hole (normal blend)
    A.define('hz:bh:shade', 256, 256, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.98)');
      g.addColorStop(0.3, 'rgba(1,0,3,0.92)');
      g.addColorStop(0.5, 'rgba(3,1,8,0.6)');
      g.addColorStop(0.74, 'rgba(4,2,10,0.22)');
      g.addColorStop(1, 'rgba(4,2,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { pad: 0 });
    // 2D horizon: pure black disc (radius 60) with a crisp anti-aliased edge
    A.define('hz:bh:hz', 128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 60, 0, TAU);
      ctx.fill();
    }, { pad: 0 });
    // 2D photon ring (radius 64 in a 176 box): a razor #fff1d6 line in a warm glow, brighter on the approaching side
    A.define('hz:bh:ring', 176, 176, (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 240; i++) {
        const a0 = (i / 240) * TAU, a1 = ((i + 1.2) / 240) * TAU, am = (a0 + a1) / 2;
        const k = 0.3 + 0.7 * Math.pow((1 - Math.cos(am)) / 2, 1.3);
        const arc = (r, lw, col, a) => {
          ctx.strokeStyle = 'rgba(' + col + ',' + (a * k).toFixed(3) + ')';
          ctx.lineWidth = lw;
          ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
        };
        arc(66, 16, '255,120,50', 0.07);
        arc(65, 8, '255,170,90', 0.16);
        arc(64.4, 3.6, '255,222,170', 0.45);
        arc(64, 1.4, '255,246,226', 1);
      }
    }, { pad: 0 });
    // lensed starlight: an Einstein ring of tiny smeared star images (2D fallback; slowly rotated)
    A.define('hz:bh:einstein', 256, 256, (ctx, w, h) => {
      const cx = w / 2, cy = h / 2, rg = SL.makeRng(913);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, 88, cx, cy, 114);
      g.addColorStop(0, 'rgba(160,180,255,0)');
      g.addColorStop(0.45, 'rgba(180,196,255,0.07)');
      g.addColorStop(1, 'rgba(160,180,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 34; i++) {
        const a = rg.next() * TAU, r = 100 + rg.gauss() * 4, s = 0.5 + rg.next() * 1.1;
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        const gg = ctx.createRadialGradient(px, py, 0, px, py, s * 2.6);
        const col = rg.chance(0.3) ? '255,220,180' : '225,235,255';
        gg.addColorStop(0, 'rgba(' + col + ',' + (0.5 + 0.5 * rg.next()).toFixed(2) + ')');
        gg.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(px, py, s * 2.6, 0, TAU); ctx.fill();
      }
    }, { pad: 0 });
    // GL only: a small hot blob drawn at the very center (inside the masked horizon). The point-mass lens maps the
    // region right behind the hole onto the Einstein ring, so this seed paints a crisp, Doppler-bright photon ring.
    A.define('hz:bh:seed', 64, 64, (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      for (let i = 0; i < 3; i++) {
        const ox = [-5, 0, 6][i], col = ['255,250,236', '255,214,150', '255,120,60'][i], a = [1, 0.85, 0.55][i];
        const g = ctx.createRadialGradient(cx + ox, cy, 0, cx + ox, cy, 22);
        g.addColorStop(0, 'rgba(' + col + ',' + a + ')');
        g.addColorStop(0.55, 'rgba(' + col + ',' + (a * 0.6).toFixed(2) + ')');
        g.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    }, { pad: 0 });
    // infalling spark streak (points +x)
    A.define('hz:bh:streak', 40, 10, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,120,50,0)');
      g.addColorStop(0.55, 'rgba(255,190,110,0.55)');
      g.addColorStop(1, 'rgba(255,250,235,1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(w * 0.55, h / 2, w * 0.45, h * 0.32, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(w * 0.8, h / 2, w * 0.14, h * 0.18, 0, 0, TAU);
      ctx.fill();
    }, { pad: 1 });
  }
  defineBlackHoleArt();

  // ================================================================== black hole: logic
  const BH = {
    small: { r: 26, range: 360, pull: 700, lens: 0.8 },
    medium: { r: 40, range: 480, pull: 950, lens: 1.0 },
    large: { r: 56, range: 620, pull: 1200, lens: 1.2 },
  };
  const BH_TEXT = 'BLACK HOLE: NEVER FOCUS NEAR IT';
  const COLLAPSE_T = 0.9;
  const SPARKS = 46;

  function newSpark(s, init) {
    s.rho = init ? rr(1.25, DISK_K * 0.95) : rr(DISK_K * 0.55, DISK_K * 0.98);
    s.th = rnd() * TAU;
    s.w = rr(0.75, 1.3);
    s.vr = rr(0.18, 0.5);
    s.size = rr(0.55, 1.25);
    s.age = init ? 1 : 0;
    return s;
  }

  function placeBinary(h) {
    const d = h.data, b = d.bin, t = h.age;
    const a = b.a0 + b.w * t + d.binPhase;
    const cx = b.cx, cy = b.cy + b.vy * t;
    h.x = cx + Math.cos(a) * b.r;
    h.y = cy + Math.sin(a) * b.r;
    h.vx = -Math.sin(a) * b.r * b.w;
    h.vy = Math.cos(a) * b.r * b.w + b.vy;
  }

  function bhInit(h, o) {
    const d = h.data;
    if (o.size && !BH[o.size]) U.warnOnce('bh-size:' + o.size, 'black_hole: unknown size "' + o.size + '"; using medium');
    const sz = BH[o.size] || BH.medium;
    d.size = BH[o.size] ? o.size : 'medium';
    d.R = o.r || sz.r;
    d.range = o.range || sz.range;
    d.pull = o.pull || sz.pull;
    d.pullMul = o.pullMul != null ? o.pullMul : 1;
    d.lens = o.strength != null ? o.strength : o.lens != null ? o.lens : sz.lens;
    d.growT = o.grow != null ? Math.max(0.05, o.grow) : 1.5;
    d.life = o.life || 0;
    d.fixed = !!o.fixed;
    d.horizonDamage = o.horizonDamage != null ? o.horizonDamage : 18;
    d.hd = [0, 0];
    d.k = 0;
    d.kv = 0;
    d.state = 'grow';
    d.att = o.attachTo || null;
    d.ox = o.offsetX || 0;
    d.oy = o.offsetY || 0;
    d.cap = [];
    const P = SL.debug.params || {};
    d.tilt = o.tilt != null ? o.tilt : P.bhtilt != null ? +P.bhtilt : -0.17;
    d.squash = o.squash != null ? o.squash : P.bhsq != null ? +P.bhsq : 0.27;
    d.shadeA = P.bhshade != null ? +P.bhshade : 0.96;
    d.diskK = P.bhdisk != null ? +P.bhdisk : 1;
    d.spinI = rnd() * TAU;
    d.spinO = rnd() * TAU;
    d.flare = 0;
    d.sparks = [];
    for (let i = 0; i < SPARKS; i++) d.sparks.push(newSpark({}, true));
    d.ghosts = [];
    if (d.fixed) { h.vx = 0; h.vy = 0; }
    if (d.att) { h.x = d.att.x + d.ox; h.y = d.att.y + d.oy; }
    h.r = 0;
    h.gravity = { x: h.x, y: h.y, pull: 0, range: d.range, r: 0 };
    if (o.binary && !o.partner) {
      const bc = o.binary;
      d.bin = { cx: bc.cx != null ? bc.cx : W / 2, cy: bc.cy != null ? bc.cy : 300, r: bc.r || 170, w: bc.w != null ? bc.w : 0.35, vy: bc.vy || 0, a0: bc.a0 || 0 };
      d.binPhase = 0;
      placeBinary(h);
      const p2 = SL.spawnHazard('black_hole', Object.assign({}, o, { binary: null, partner: h, binState: d.bin, silent: true }));
      d.partner = p2 && !p2.dead ? p2 : null;
    } else if (o.partner && o.binState) {
      d.bin = o.binState;
      d.binPhase = Math.PI;
      d.partner = o.partner;
      placeBinary(h);
    }
    if (!o.silent) warn(h, BH_TEXT);
    d.hum = loopStart('bh_loop');
  }

  function bhRelease(h) {
    const d = h.data;
    d.att = null;
    if (d.state === 'collapse') return;
    d.state = 'release';
    d.relT = 6;
    d.k = 1;
  }

  function bhCollapse(h) {
    const d = h.data;
    if (d.state === 'collapse' || h.dead) return;
    d.state = 'collapse';
    d.colT = 0;
    d.kv0 = d.kv;
    sfx('bh_collapse', h.x);
    if (d.partner && !d.partner.dead && d.partner.data.state !== 'collapse') bhCollapse(d.partner);
  }

  function bhBoom(h) {
    const x = h.x, y = h.y, d = h.data;
    clearBulletsIn(x, y, 200, '#fff1d6');
    if (!onScreenish(x, y, 120)) return;
    const s = d.R / 40;
    SL.fx.shockwave(x, y, { radius: 340 * s + 60, duration: 0.85, strength: 1.8, color: '#ffd9a0' });
    SL.fx.shockwave(x, y, { radius: 190 * s + 40, duration: 0.5, strength: 0.9, color: '#c9a2ff' });
    SL.fx.flash('#fff1d6', 0.3, 0.35);
    SL.fx.chromatic(0.55, 0.5);
    SL.fx.shake(8 + 4 * s, 0.45);
    SL.fx.emit({ x, y, life: 0.55, size: 40 * s, size2: 300 * s, color: '#ffffff', color2: '#ff9a3d', alpha: 1, alpha2: 0, ease: true });
    SL.fx.emit({ x, y, life: 0.9, size: 30, size2: 160 * s, color: '#ffd27a', color2: '#7a1830', alpha: 0.8, alpha2: 0 });
    SL.fx.sparks(x, y, { count: 46, color: '#ffe2a8', speed: 760, life: 0.7, size: 6 });
    SL.fx.sparks(x, y, { count: 24, color: '#c9a2ff', speed: 520, life: 0.6, size: 5 });
  }

  function podLose(pod, h) {
    ghostFrom(h, pod, '#5dffb0');
    if (SL.rescue && typeof SL.rescue.lose === 'function') {
      try { SL.rescue.lose(pod, 'horizon'); } catch (err) { report('SL.rescue.lose', err); pod.dead = true; }
    } else if (pod.def && typeof pod.def.onExit === 'function') {
      try { pod.def.onExit(pod); } catch (err) { report('pod onExit', err); }
      pod.dead = true;
    } else {
      pod.dead = true;
      SL.bus.emit('podLost', { pod, reason: 'horizon' });
    }
    if (!pod.dead) pod.dead = true;
  }

  /** Spaghettified image of something the hole swallowed (cosmetic). */
  function ghostFrom(h, e, color) {
    const d = h.data;
    if (d.ghosts.length >= 10) d.ghosts.shift();
    let spr = null;
    const key = e.sprite || (e.def && e.def.sprite);
    if (key) { try { spr = A.get(key); } catch (err) { spr = null; } }
    d.ghosts.push({
      spr, ang: Math.atan2(e.y - h.y, e.x - h.x), dist: Math.max(h.r, Math.sqrt(U.dist2(e.x, e.y, h.x, h.y))),
      t: 0, life: 0.6, rot: e.rot || 0, sc: e.scale || 1, color: color || '#ffb36b', size: (e.r || 16),
    });
  }

  function bhSwallowEnemy(h, e) {
    ghostFrom(h, e);
    sfx('bh_swallow', e.x);
    hurtEnemy(e, 9999);
    h.data.flare = Math.min(1.6, h.data.flare + 0.7);
  }

  // bullets about to cross the horizon flare and stream in (cosmetic; applyGravity removes them)
  function bhSwallowFx(h, R) {
    const r2 = R * R;
    let n = 0;
    const lists = [SL.world.ebullets, SL.world.pbullets];
    for (let l = 0; l < 2 && n < 8; l++) {
      const list = lists[l];
      for (let i = 0; i < list.length && n < 8; i++) {
        const b = list[i];
        if (b.dead) continue;
        const dx = b.x - h.x, dy = b.y - h.y;
        if (dx * dx + dy * dy >= r2) continue;
        n++;
        const dd = Math.sqrt(dx * dx + dy * dy) || 1;
        SL.fx.emit({ x: b.x, y: b.y, vx: -dy / dd * 260 - dx * 2, vy: dx / dd * 260 - dy * 2, life: 0.22, size: 9, size2: 1, color: l ? '#bfefff' : '#ffd0a0', drag: 2 });
      }
    }
  }

  function bhUpdate(h, dt) {
    const d = h.data;
    // ---- motion
    if (d.bin && d.state !== 'release') placeBinary(h);
    else if (d.att) {
      const e = d.att;
      if (e.dead || e.dying) bhRelease(h);
      else { h.x = e.x + d.ox; h.y = e.y + d.oy; h.vx = e.vx || 0; h.vy = e.vy || 0; }
    } else if (d.state === 'release') {
      h.vx = U.approach(h.vx, 0, 90 * dt);
      h.vy = U.approach(h.vy, 40, 90 * dt);
      h.x += h.vx * dt;
      h.y += h.vy * dt;
    } else if (!d.fixed) { h.x += h.vx * dt; h.y += h.vy * dt; }

    // ---- lifecycle
    if (d.state === 'grow') { d.k = Math.min(1, d.k + dt / d.growT); if (d.k >= 1) d.state = 'live'; }
    else if (d.state === 'release') { d.relT -= dt; if (d.relT <= 0) bhCollapse(h); }
    if ((d.state === 'grow' || d.state === 'live') && d.life > 0 && h.age >= d.life) bhCollapse(h);
    let kp = d.k;
    if (d.state === 'collapse') {
      d.colT += dt;
      const c = d.colT / COLLAPSE_T;
      if (c >= 1) { bhBoom(h); h.dead = true; return; }
      d.kv = (d.kv0 || 1) * (1 - EZ.inCubic(c)) * (1 + 0.12 * Math.sin(c * Math.PI));
      kp = 1 - c;
    } else d.kv = EZ.outCubic(d.k);
    const gone = d.bin ? d.bin.cy + d.bin.vy * h.age - d.bin.r > H + d.range + 140 : h.y > H + d.range + 140;
    if (gone && !d.fixed && !d.att) { h.dead = true; return; }

    const kv = d.kv, R = d.R * kv;
    h.r = R;
    const pull = d.pull * d.pullMul * kp;
    const g = h.gravity;
    g.x = h.x; g.y = h.y; g.pull = pull; g.range = d.range; g.r = R;

    // ---- cosmetic motion (spin, sparks, ghosts)
    const spinMul = d.state === 'collapse' ? 1 + 5 * d.colT / COLLAPSE_T : 1;
    d.spinI -= dt * 1.25 * spinMul;
    d.spinO -= dt * 0.42 * spinMul;
    d.flare = Math.max(0, d.flare - dt * 1.8);
    for (let i = 0; i < d.sparks.length; i++) {
      const s = d.sparks[i];
      s.age += dt;
      const om = 2.4 * s.w * Math.pow(s.rho, -1.5) * spinMul;
      s.th -= om * dt;
      s.rho -= s.vr * dt * (0.35 + 1.5 / s.rho) * spinMul;
      if (s.rho < 1.05) newSpark(s, false);
    }
    for (let i = d.ghosts.length - 1; i >= 0; i--) {
      const gh = d.ghosts[i];
      gh.t += dt / gh.life;
      gh.ang -= dt * (2 + 6 * gh.t);
      if (gh.t >= 1) d.ghosts.splice(i, 1);
    }

    // ---- gravity and the horizon
    d.cap.length = 0;
    const wd = SL.world;
    if (pull > 0 && R > 0.5) {
      bhSwallowFx(h, R);
      wd.applyGravity(h.x, h.y, pull, d.range, { bullets: false, pods: false, consume: R });
      wd.applyGravity(h.x, h.y, pull * 0.6, d.range, { players: false, pickups: false, pods: false, consume: R });
      wd.applyGravity(h.x, h.y, pull * 0.35, d.range, { players: false, bullets: false, pbullets: true, pickups: false, pods: false, consume: R });
      const range = d.range, r2 = range * range;
      const pp = pull * 0.5;
      for (const pod of wd.pods) {
        if (pod.dead) continue;
        const dx = h.x - pod.x, dy = h.y - pod.y, d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const dist = Math.sqrt(d2) || 1, f = 1 - dist / range, a = pp * f * f;
        pod.vx += (dx / dist) * a * dt;
        pod.vy += (dy / dist) * a * dt;
        const pr = (pod.r || 18) * 0.4;
        if (R > 4 && dist < R + pr) {
          if (pod.data && pod.data.pilot) {
            const k = (R + pr + 1) / dist;
            pod.x = h.x - dx * k;
            pod.y = h.y - dy * k;
          } else podLose(pod, h);
        }
      }
      for (const e of wd.enemies) {
        if (e.dead || e.dying || e.isBoss || e === d.att || e.gravityImmune || (e.def && e.def.gravityImmune) || isHeavy(e)) continue;
        const dx = h.x - e.x, dy = h.y - e.y, d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const dist = Math.sqrt(d2) || 1, f = 1 - dist / range, a = pp * f * f;
        e.vx = (e.vx || 0) + (dx / dist) * a * dt;
        e.vy = (e.vy || 0) + (dy / dist) * a * dt;
        const er = e.r || 14;
        if (R > 4 && dist < R + er) bhSwallowEnemy(h, e);
        else if (R > 4 && dist < R + er + 48) d.cap.push(e);
      }
    }
    // players: horizon contact and proximity cues
    let near = 1e9;
    for (const p of wd.players) {
      if (!live(p)) continue;
      const dist = Math.sqrt(U.dist2(p.x, p.y, h.x, h.y));
      if (dist < near) near = dist;
      const i = p.index ? 1 : 0;
      if (d.hd[i] > 0) d.hd[i] -= dt;
      if (R > 4 && d.horizonDamage > 0 && dist < R + (p.r || 22) && d.hd[i] <= 0 && h.age >= GRACE) {
        if (hurtPlayer(h, p, d.horizonDamage) > 0) {
          d.hd[i] = 0.5;
          d.flare = Math.min(1.6, d.flare + 0.5);
          SL.fx.sparks(p.x, p.y, { count: 10, color: '#ffc27a', speed: 300, angle: Math.atan2(h.y - p.y, h.x - p.x), spread: 1.6, life: 0.3 });
        }
      }
    }
    loopSet(d.hum, 0.85 * kv * U.clamp(1 - (near - R) / (d.range * 1.15), 0, 1), h.x);
    if (near < R * 4.2 && R > 4) SL.render.chromatic(U.clamp((R * 4.2 - near) / (R * 3.2), 0, 1) * 0.16);
    SL.render.addLens(h.x, h.y, R, d.lens * kv);
  }

  // positional capture after everything moved this step: path-driven enemies close to the horizon fall in too
  SL.bus.on('tick', (ev) => {
    const dt = ev && ev.dt;
    if (!dt) return;
    const hz = SL.world.hazards;
    for (let i = 0; i < hz.length; i++) {
      const h = hz[i];
      if (h.dead || h.typeId !== 'black_hole' || !h.data.cap || !h.data.cap.length) continue;
      const cap = h.data.cap, R = h.r;
      for (let j = 0; j < cap.length; j++) {
        const e = cap[j];
        if (e.dead || e.dying) continue;
        const dx = h.x - e.x, dy = h.y - e.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const k = U.clamp(1 - (dist - R - (e.r || 14)) / 48, 0, 1);
        const v = (90 + 520 * k * k) * dt;
        const m = Math.min(v, Math.max(0, dist - R * 0.5));
        e.x += (dx / dist) * m;
        e.y += (dy / dist) * m;
      }
      cap.length = 0;
    }
  });

  // ---- black hole drawing
  /** Per frame: spin the disk textures into the hole's buffer, tint the two sides and apply Doppler beaming
      (arch = the 2D fallback's lensed far side, masked into an arch over the horizon). */
  function composeDisk(h, arch) {
    const d = h.data;
    const S = lowQ() ? 256 : BH_TEX;
    const field = arch ? 'archBuf' : 'diskBuf';
    let buf = d[field];
    if (!buf || buf.width !== S) { giveBuf(buf); buf = d[field] = takeBuf(S); }
    const x = buf.getContext('2d');
    const o = A.get('hz:bh:diskO').canvas, ii = A.get('hz:bh:diskI').canvas;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.clearRect(0, 0, S, S);
    const c = S / 2;
    x.setTransform(Math.cos(d.spinO), Math.sin(d.spinO), -Math.sin(d.spinO), Math.cos(d.spinO), c, c);
    x.drawImage(o, -c, -c, S, S);
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = Math.min(1, 0.85 + 0.3 * Math.min(1, d.flare));
    x.setTransform(Math.cos(d.spinI), Math.sin(d.spinI), -Math.sin(d.spinI), Math.cos(d.spinI), c, c);
    x.drawImage(ii, -c / 2, -c / 2, c, c);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = Math.min(1, 0.72 + 0.3 * Math.min(1, d.flare));
    x.drawImage(A.get('hz:bh:hot').canvas, 0, 0, S, S);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-atop';
    x.drawImage(A.get('hz:bh:tint').canvas, 0, 0, S, S);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(A.get(arch ? 'hz:bh:archm' : 'hz:bh:dop').canvas, 0, 0, S, S);
    x.globalCompositeOperation = 'source-over';
    return buf;
  }

  function drawSparks(h, ctx, R, part) {
    // part: 0 all, 1 far half only, 2 near half only
    const d = h.data, b = SL.render.base, bs = b.s;
    const spr = A.get('hz:bh:streak');
    const ct = Math.cos(d.tilt), st = Math.sin(d.tilt), q = d.squash;
    const sw = spr.cw, sh = spr.ch;
    const pa = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < d.sparks.length; i++) {
      const s = d.sparks[i];
      const sn = Math.sin(s.th), cs = Math.cos(s.th);
      if (part === 1 && sn > 0) continue;
      if (part === 2 && sn <= 0) continue;
      const lx = cs * s.rho * R, ly = sn * s.rho * R * q;
      const px = h.x + lx * ct - ly * st, py = h.y + lx * st + ly * ct;
      // tangential direction of travel (theta decreasing)
      const vx0 = sn, vy0 = -cs * q;
      const vx = vx0 * ct - vy0 * st, vy = vx0 * st + vy0 * ct;
      const vl = Math.sqrt(vx * vx + vy * vy) || 1;
      const heat = U.clamp(1.6 / s.rho, 0.15, 1);
      const dop = 0.45 + 0.55 * (1 - cs) / 2;
      const a = Math.min(1, s.age * 2) * heat * dop * (0.6 + 0.4 * Math.min(1, d.flare + 0.5));
      if (a < 0.03) continue;
      const len = (0.35 + 0.65 * heat) * s.size * (R / 40) * 0.9;
      const ux = vx / vl, uy = vy / vl;
      ctx.globalAlpha = pa * a;
      ctx.setTransform(ux * len * bs, uy * len * bs, -uy * len * 0.7 * bs, ux * len * 0.7 * bs, b.x + px * bs, b.y + py * bs);
      ctx.drawImage(spr.canvas, -sw / 2, -sh / 2, sw, sh);
    }
    ctx.globalAlpha = pa;
    SL.render.resetTransform(ctx);
  }

  function drawGhosts(h, ctx, R) {
    const d = h.data;
    for (let i = 0; i < d.ghosts.length; i++) {
      const g = d.ghosts[i];
      const k = EZ.inCubic(g.t);
      const dist = U.lerp(g.dist, R * 0.7, k);
      const px = h.x + Math.cos(g.ang) * dist, py = h.y + Math.sin(g.ang) * dist;
      const a = (1 - g.t) * 0.9;
      if (g.spr) {
        SL.render.setTransform(ctx, px, py, g.ang, g.sc * (1 + 2.4 * k), g.sc * Math.max(0.08, 1 - 0.85 * k));
        ctx.rotate(g.rot - g.ang);
        ctx.globalAlpha = a;
        const s = g.spr;
        ctx.drawImage(s.canvas, -s.cw / 2, -s.ch / 2, s.cw, s.ch);
        SL.render.resetTransform(ctx);
      }
      A.drawGlow(ctx, px, py, g.size * (1.4 + k), g.color, a * 0.8);
    }
  }

  /** The whole hole draws under entities and bullets (readability). GL: flat disk + sparks, the post lens does the
      rest. 2D: far half of the disk, lensed arch, black horizon, Einstein ring, photon ring, then the near half
      crossing in front of the horizon. */
  function bhDrawUnder(h, ctx) {
    const d = h.data, kv = d.kv;
    if (!(kv > 0.01)) return;
    const R = d.R * kv, x = h.x, y = h.y;
    const col = d.state === 'collapse' ? d.colT / COLLAPSE_T : 0;
    const Rd = R * DISK_K * d.diskK * (1 + 0.3 * col);
    if (!onScreenish(x, y, Rd + 40)) return;
    const gl = SL.render.distortion;
    const grow = d.state === 'grow' ? EZ.outCubic(d.k) : 1;
    // 1. gravitational darkening of the sky around the hole
    A.drawSprite(ctx, 'hz:bh:shade', x, y, 0, (R * (gl ? 2.6 : 3.8)) / 128, gl ? 0.95 : d.shadeA);
    // 2. warm scattered light (GL: only the wide halo; a small central glow would lens into a flat grey annulus)
    A.drawGlow(ctx, x, y, R * 5.8, '#ff6a2a', (0.09 + 0.05 * d.flare) * grow);
    if (!gl) A.drawGlow(ctx, x, y, R * 2.9, '#ffb36b', (0.07 + 0.07 * d.flare) * grow);
    // 3. accretion disk (2D: far half here, the near half crosses in front of the horizon below)
    const buf = composeDisk(h, false);
    const da = Math.min(1, 0.97 * grow);
    SL.render.setTransform(ctx, x, y, d.tilt, 1, d.squash);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = da;
    if (gl) ctx.drawImage(buf, -Rd, -Rd, Rd * 2, Rd * 2);
    else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-Rd, -Rd, Rd * 2, Rd);
      ctx.clip();
      ctx.drawImage(buf, -Rd, -Rd, Rd * 2, Rd * 2);
      ctx.restore();
    }
    SL.render.resetTransform(ctx);
    if (gl) {
      const P = SL.debug.params || {};
      const sa = P.bhseed != null ? +P.bhseed : 1, sr = P.bhseedr != null ? +P.bhseedr : 0.3;
      if (sa > 0) {
        ctx.globalCompositeOperation = 'lighter';
        A.drawSprite(ctx, 'hz:bh:seed', x, y, d.tilt, (R * sr) / 22, Math.min(1, sa * grow * (0.9 + 0.1 * Math.sin(h.age * 3.1) + 0.3 * d.flare)));
      }
      drawSparks(h, ctx, R, 0);
      drawGhosts(h, ctx, R);
      return;
    }
    drawSparks(h, ctx, R, 1);
    // 4. lensed far side of the disk arching over (and thinly under) the horizon
    const arch = composeDisk(h, true);
    const RA = (R * 1.07) / 0.2;
    SL.render.setTransform(ctx, x, y, d.tilt, 1, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = grow;
    ctx.drawImage(arch, -RA, -RA, RA * 2, RA * 2);
    ctx.globalAlpha = 0.6 * grow;
    ctx.drawImage(arch, -RA, -RA, RA * 2, RA * 2);
    SL.render.resetTransform(ctx);
    // 5. horizon, lensed starlight, photon ring
    A.drawSprite(ctx, 'hz:bh:hz', x, y, 0, R / 60, 1);
    const E = R * (1 + 1.2 * d.lens);
    ctx.globalCompositeOperation = 'lighter';
    A.drawSprite(ctx, 'hz:bh:einstein', x, y, d.spinO * 0.08, E / 100, 0.75 * grow);
    const pr = (0.88 + 0.12 * Math.sin(h.age * 3.1)) + 0.35 * d.flare;
    A.drawSprite(ctx, 'hz:bh:ring', x, y, d.tilt, (R * 1.035) / 64, Math.min(1, pr * grow));
    // 6. near half of the disk, in front of the horizon
    SL.render.setTransform(ctx, x, y, d.tilt, 1, d.squash);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = da;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-Rd, 0, Rd * 2, Rd);
    ctx.clip();
    ctx.drawImage(buf, -Rd, -Rd, Rd * 2, Rd * 2);
    ctx.restore();
    SL.render.resetTransform(ctx);
    drawSparks(h, ctx, R, 2);
    drawGhosts(h, ctx, R);
  }
  SL.hazards.define('black_hole', {
    r: 40,
    manualMove: true,
    init: bhInit,
    update: bhUpdate,
    drawUnder: bhDrawUnder,
    end(h) { if (h.data.att) bhRelease(h); else bhCollapse(h); },
    release: bhRelease,
    collapse: bhCollapse,
    onEnd(h) {
      const d = h.data;
      loopStop(d.hum, 0.6);
      d.hum = null;
      giveBuf(d.diskBuf); d.diskBuf = null;
      giveBuf(d.archBuf); d.archBuf = null;
    },
  });

  // heavy disk textures are generated in idle time after boot, one per tick, so the first black hole never hitches
  SL.onBoot(() => {
    const keys = ['hz:bh:diskO', 'hz:bh:diskI', 'hz:bh:tint', 'hz:bh:dop', 'hz:bh:archm', 'hz:bh:hot'];
    let i = 0;
    const step = () => {
      if (i >= keys.length) return;
      try { A.get(keys[i++]); } catch (err) { report('prewarm', err); }
      setTimeout(step, 60);
    };
    setTimeout(step, 1200);
  });

  // ================================================================== rocks: art (rotation frames, light fixed)
  /* Rocks (rock, ice), shade rocks and debris are pre-rendered into rotation frames with the key light fixed at the
     upper left: the draw picks the frame nearest the rock's angle and rotates it by the small remainder, so the
     lighting never spins with the rock. Rock and ice frames are shaded per pixel from a cached model (outline
     harmonics, dome + noise + crater height field, normals, albedo, occlusion; ice adds Voronoi facets and cracks);
     debris plates use SL.art.metal with the light angle counter-rotated. Frames are generated lazily and prewarmed a
     few per step while a storm's warning runs. */
  const RK_EXT = 1.12;
  const RK_R = { s: 16, m: 32, l: 54, x: 76 };
  const RK_FRAMES = { s: 16, m: 24, l: 24, x: 24 };
  const LIGHT_ANG = Math.atan2(A.lightDir.y, A.lightDir.x);
  function norm3(x, y, z) { const l = Math.sqrt(x * x + y * y + z * z) || 1; return [x / l, y / l, z / l]; }
  const LGT = norm3(-0.5, -0.66, 0.56), HLF = norm3(LGT[0], LGT[1], LGT[2] + 1);
  const RSKIN = {
    rock: { lo: '#1e1924', mid: '#3a3440', hi: '#615660', dark: '#050408', rim: '#8c7a66', spec: '#f4e2c8', bounce: '#2d3d63',
      ks: 0.3, shin: 18, amb: 0.1, relief: 1, crat: [2, 4], pits: [5, 9], lumpy: 0.13, bump: 0.11, fine: 0.05, planes: [3, 5], off: [0.6, 0.82] },
    ice: { lo: '#12304f', mid: '#3a73a3', hi: '#9ac6e6', dark: '#04101e', rim: '#7fe8ff', spec: '#ffffff', bounce: '#3fc8ff',
      ks: 1.1, shin: 70, amb: 0.2, relief: 0.6, crat: [0, 0], pits: [0, 0], lumpy: 0.1, bump: 0.025, fine: 0.012, facets: 10, alpha: 0.8,
      crack: '#cfe6f5', planes: [6, 8], off: [0.5, 0.74] },
    shade: { lo: '#141419', mid: '#2b2b33', hi: '#4b4b56', dark: '#030305', rim: '#8d92a6', spec: '#d6dae8', bounce: '#24304e',
      ks: 0.2, shin: 14, amb: 0.1, relief: 1.1, crat: [4, 7], pits: [8, 14], lumpy: 0.08, bump: 0.1, fine: 0.05, planes: [3, 5], off: [0.62, 0.84] },
  };
  function edgeR(hm, a) { let r = 1; for (let i = 0; i < hm.length; i += 3) r += hm[i + 1] * Math.cos(hm[i] * a + hm[i + 2]); return r; }
  function bil(arr, M, x, y) {
    x = x < 0 ? 0 : x > M - 1.001 ? M - 1.001 : x;
    y = y < 0 ? 0 : y > M - 1.001 ? M - 1.001 : y;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, k = y0 * M + x0;
    const a = arr[k], b = arr[k + 1], c = arr[k + M], d = arr[k + M + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  const rkModels = new Map();
  /** Cached rock model in its own frame (unit radius): rho (outline-normalized radius), normals, albedo, occlusion. */
  function rockModel(skin, seed, R) {
    const key = skin + ':' + seed + ':' + R;
    let m = rkModels.get(key);
    if (m) return m;
    const S = RSKIN[skin], rg = SL.makeRng(seed * 7919 + 101);
    const hm = [];
    for (let k = 2; k <= 8; k++) hm.push(k, rg.range(0.35, 1) * S.lumpy * 1.9 / Math.pow(k - 0.6, 1.05), rg.next() * TAU);
    let mx = 0;
    for (let i = 0; i < 256; i++) mx = Math.max(mx, edgeR(hm, (i / 256) * TAU));
    const crat = [];
    for (let i = 0, n = rg.int(S.crat[0], S.crat[1]); i < n; i++) {
      const a = rg.next() * TAU, dd = Math.sqrt(rg.next()) * 0.7;
      crat.push(Math.cos(a) * dd, Math.sin(a) * dd, rg.range(0.13, 0.32), rg.range(0.55, 1));
    }
    for (let i = 0, n = rg.int(S.pits[0], S.pits[1]); i < n; i++) {
      const a = rg.next() * TAU, dd = Math.sqrt(rg.next()) * 0.82;
      crat.push(Math.cos(a) * dd, Math.sin(a) * dd, rg.range(0.04, 0.09), rg.range(0.6, 1));
    }
    // planar chips: flat facets with crisp creases, and straight runs in the silhouette
    const pl = [];
    for (let i = 0, n = rg.int(S.planes[0], S.planes[1]); i < n; i++) {
      const a = (i / n) * TAU + rg.range(-0.5, 0.5), nzp = rg.range(0.32, 0.72), s2 = Math.sqrt(1 - nzp * nzp);
      pl.push(Math.cos(a) * s2, Math.sin(a) * s2, nzp, rg.range(S.off[0], S.off[1]));
    }
    const fac = [];
    for (let i = 0; i < (S.facets || 0); i++) {
      const a = rg.next() * TAU, dd = Math.sqrt(rg.next()) * 0.95;
      fac.push(Math.cos(a) * dd, Math.sin(a) * dd, rg.range(-0.5, 0.5), rg.range(-0.5, 0.5), rg.range(-0.16, 0.16));
    }
    const M = Math.min(240, Math.ceil(RK_EXT * 2 * R * 1.5));
    const nB = A.noise(64, 64, { scale: 16, octaves: 4, seed: seed + 3, gain: 0.55 });
    const nA = A.noise(64, 64, { scale: 32, octaves: 3, seed: seed + 9, gain: 0.5 });
    const nC = A.noise(64, 64, { scale: 8, octaves: 3, seed: seed + 17, gain: 0.5 });
    const N = M * M;
    const rh = new Float32Array(N), hg = new Float32Array(N), al = new Float32Array(N), ao = new Float32Array(N);
    const ck = new Float32Array(N), fi = new Int16Array(N);
    const du = (2 * RK_EXT) / M;
    for (let j = 0; j < M; j++) {
      const ly = (j + 0.5) * du - RK_EXT;
      for (let i = 0; i < M; i++) {
        const lx = (i + 0.5) * du - RK_EXT, k = j * M + i;
        let rho = Math.sqrt(lx * lx + ly * ly) / (edgeR(hm, Math.atan2(ly, lx)) / mx);
        let h = Math.sqrt(Math.max(0, 1 - Math.min(1, rho * rho))) * 0.9;
        for (let q = 0; q < pl.length; q += 4) {
          const hp = (pl[q + 3] - pl[q] * lx - pl[q + 1] * ly) / pl[q + 2];
          if (hp < h) h = hp;
          if (1 - hp * 1.6 > rho) rho = 1 - hp * 1.6;
        }
        rh[k] = rho;
        h += (nsample(nB, 64, 64, lx * 20 + 64, ly * 20 + 64) - 0.5) * S.bump * 2;
        h += (nsample(nC, 64, 64, lx * 46 + 64, ly * 46 + 64) - 0.5) * S.fine * 2;
        let a = 0.7 + 0.6 * nsample(nA, 64, 64, lx * 13 + 64, ly * 13 + 64), occ = 1;
        for (let c = 0; c < crat.length; c += 4) {
          const ex = lx - crat[c], ey = ly - crat[c + 1], dd = Math.sqrt(ex * ex + ey * ey) / crat[c + 2];
          if (dd < 1) { h -= crat[c + 3] * crat[c + 2] * 0.55 * (1 - dd * dd); occ *= 0.6 + 0.4 * dd * dd; a *= 0.84 + 0.16 * dd; }
          else if (dd < 1.7) { const z = (dd - 1.08) / 0.22; h += crat[c + 3] * crat[c + 2] * 0.2 * Math.exp(-z * z); }
        }
        if (fac.length) {
          let d1 = 9, d2 = 9, b1 = 0;
          for (let f = 0; f < fac.length; f += 5) {
            const ex = lx - fac[f], ey = ly - fac[f + 1], dd = ex * ex + ey * ey;
            if (dd < d1) { d2 = d1; d1 = dd; b1 = f; } else if (dd < d2) d2 = dd;
          }
          fi[k] = b1;
          const e = (Math.sqrt(d2) - Math.sqrt(d1)) / 0.028;
          ck[k] = rho < 0.95 ? Math.exp(-e * e) : 0;
          a = (0.72 + 0.5 * rho) * (0.85 + 0.3 * a) + fac[b1 + 4];
        }
        hg[k] = h * S.relief;
        al[k] = U.clamp(a, 0, 1.3);
        ao[k] = occ;
      }
    }
    const nx = new Float32Array(N), ny = new Float32Array(N), nz = new Float32Array(N);
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < M; i++) {
        const k = j * M + i;
        const hx = (hg[j * M + Math.min(M - 1, i + 1)] - hg[j * M + Math.max(0, i - 1)]) / (2 * du);
        const hy = (hg[Math.min(M - 1, j + 1) * M + i] - hg[Math.max(0, j - 1) * M + i]) / (2 * du);
        let n = norm3(-hx, -hy, 1);
        if (fac.length) {
          const f = fi[k], sx = fac[f], sy = fac[f + 1];
          const fn = norm3(sx * 1.3 + fac[f + 2], sy * 1.3 + fac[f + 3], Math.sqrt(Math.max(0.08, 1 - sx * sx - sy * sy)));
          n = norm3(fn[0] * 0.8 + n[0] * 0.2, fn[1] * 0.8 + n[1] * 0.2, fn[2] * 0.8 + n[2] * 0.2);
        }
        nx[k] = n[0]; ny[k] = n[1]; nz[k] = n[2];
      }
    }
    m = { M, rh, al, ao, nx, ny, nz, ck: fac.length ? ck : null };
    rkModels.set(key, m);
    return m;
  }
  /** One lit rotation frame: back-rotates each pixel into the model, rotates the normal out, shades it
      (wrapped Lambert + Blinn specular + warm rim on the lit side + cool bounce on the far side; ice: cracks and
      Fresnel translucency). Generator only (getImageData-free: createImageData + putImageData). */
  function renderRock(ctx, w, h, skin, m, th, R) {
    const S = RSKIN[skin], M = m.M, sc = M / (2 * RK_EXT);
    const lo = C.parse(S.lo), mid = C.parse(S.mid), hi = C.parse(S.hi), dk = C.parse(S.dark);
    const rim = C.parse(S.rim), sp = C.parse(S.spec), bo = C.parse(S.bounce), ckc = C.parse(S.crack || S.rim);
    const img = ctx.createImageData(w, h), px = img.data;
    const ct = Math.cos(th), st = Math.sin(th), cx = w / 2, cy = h / 2, E2 = RK_EXT * RK_EXT;
    for (let j = 0; j < h; j++) {
      const oy = (j + 0.5 - cy) / R;
      for (let i = 0; i < w; i++) {
        const ox = (i + 0.5 - cx) / R;
        if (ox * ox + oy * oy > E2) continue;
        const lx = ct * ox + st * oy, ly = -st * ox + ct * oy;
        const mi = (lx + RK_EXT) * sc - 0.5, mj = (ly + RK_EXT) * sc - 0.5;
        const rho = bil(m.rh, M, mi, mj);
        const cov = U.clamp((1 - rho) * R + 0.5, 0, 1);
        if (cov <= 0) continue;
        const n0 = bil(m.nx, M, mi, mj), n1 = bil(m.ny, M, mi, mj), n2 = bil(m.nz, M, mi, mj);
        const nl = Math.sqrt(n0 * n0 + n1 * n1 + n2 * n2) || 1;
        const nx = (ct * n0 - st * n1) / nl, ny = (st * n0 + ct * n1) / nl, nz = n2 / nl;
        const ndl = nx * LGT[0] + ny * LGT[1] + nz * LGT[2];
        const dif = ndl > -0.12 ? (ndl + 0.12) / 1.12 : 0;
        const ndh = nx * HLF[0] + ny * HLF[1] + nz * HLF[2];
        const spc = ndh > 0 ? Math.pow(ndh, S.shin) * S.ks : 0;
        const fr = Math.pow(1 - (nz > 0 ? nz : 0), 1.7);
        const side = -(nx * 0.6 + ny * 0.8);
        const rimK = fr * U.clamp(0.1 + side * 0.9, 0, 1) * 1.2;
        const boK = fr * U.clamp(-side, 0, 1) * 0.55;
        const ta = U.clamp((bil(m.al, M, mi, mj) - 0.7) / 0.6, 0, 1), ao = bil(m.ao, M, mi, mj);
        let br, bg, bb;
        if (ta < 0.5) { const f = ta * 2; br = lo[0] + (mid[0] - lo[0]) * f; bg = lo[1] + (mid[1] - lo[1]) * f; bb = lo[2] + (mid[2] - lo[2]) * f; }
        else { const f = ta * 2 - 1; br = mid[0] + (hi[0] - mid[0]) * f; bg = mid[1] + (hi[1] - mid[1]) * f; bb = mid[2] + (hi[2] - mid[2]) * f; }
        const lit = (S.amb + dif * 1.25) * ao;
        let r = dk[0] + (br - dk[0]) * lit + rim[0] * rimK * 0.9 + bo[0] * boK + sp[0] * spc;
        let g = dk[1] + (bg - dk[1]) * lit + rim[1] * rimK * 0.9 + bo[1] * boK + sp[1] * spc;
        let b = dk[2] + (bb - dk[2]) * lit + rim[2] * rimK * 0.9 + bo[2] * boK + sp[2] * spc;
        let a = cov;
        if (m.ck) {
          const c = bil(m.ck, M, mi, mj) * (0.3 + 0.6 * dif);
          r += ckc[0] * c; g += ckc[1] * c; b += ckc[2] * c;
          a *= S.alpha + (1 - S.alpha) * Math.min(1, fr + c);
        }
        const k = (j * w + i) * 4;
        px[k] = r; px[k + 1] = g; px[k + 2] = b; px[k + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---- debris plates (foundry wreckage): metal lit by a counter-rotated light, glowing broken edges
  const dbGeoms = new Map();
  function debrisGeom(shape, R) {
    const key = shape + ':' + R;
    let g = dbGeoms.get(key);
    if (g) return g;
    const rg = SL.makeRng(shape * 131 + R * 7 + 5);
    const jag = (a, b, n, amp) => {
      const out = [], nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.sqrt(nx * nx + ny * ny) || 1;
      for (let i = 1; i < n; i++) {
        const t = i / n, o = (rg.next() - 0.5) * 2 * amp * (i % 2 ? 1 : 0.45);
        out.push([a[0] + (b[0] - a[0]) * t + (nx / l) * o, a[1] + (b[1] - a[1]) * t + (ny / l) * o]);
      }
      return out;
    };
    const P = (x, y) => [x * R, y * R];
    g = { pts: null, hot: [], seams: [], rivets: [], holes: [], port: null, stripe: null };
    if (shape === 0) {
      const a = P(-0.95, -0.5), b = P(0.82, -0.72), c = P(0.96, 0.32), e = P(-0.78, 0.62);
      const j = jag(c, e, 8, 0.13 * R);
      g.pts = [a, b, c].concat(j, [e]);
      g.hot.push([c].concat(j, [e]));
      g.seams.push([P(-0.3, -0.62), P(-0.12, 0.5)], [P(0.36, -0.68), P(0.5, 0.42)]);
      for (let i = 0; i < 4; i++) g.rivets.push(P(-0.27 + i * 0.05, -0.45 + i * 0.27), P(0.39 + i * 0.035, -0.5 + i * 0.25));
      g.stripe = [P(-0.95, -0.5), P(-0.55, -0.56), P(-0.42, 0.56), P(-0.78, 0.62)];
    } else if (shape === 1) {
      const a = P(-1, -0.3), b = P(0.92, -0.24), c = P(0.98, 0.28), e = P(-0.9, 0.3);
      const j1 = jag(b, c, 5, 0.12 * R), j2 = jag(e, a, 5, 0.12 * R);
      g.pts = [a, b].concat(j1, [c, e], j2);
      g.hot.push([b].concat(j1, [c]), [e].concat(j2, [a]));
      for (let i = 0; i < 4; i++) {
        const x0 = -0.72 + i * 0.42, up = i % 2 === 0;
        g.holes.push(up ? [P(x0, 0.16), P(x0 + 0.17, -0.14), P(x0 + 0.34, 0.16)] : [P(x0, -0.14), P(x0 + 0.34, -0.14), P(x0 + 0.17, 0.16)]);
      }
      for (let i = 0; i < 7; i++) g.rivets.push(P(-0.82 + i * 0.27, -0.22), P(-0.78 + i * 0.27, 0.22));
    } else {
      const a = P(-0.72, -0.78), b = P(0.6, -0.86), c = P(0.92, 0.08), e = P(0.08, 0.88), f = P(-0.88, 0.5);
      const j = jag(c, e, 6, 0.14 * R);
      g.pts = [a, b, c].concat(j, [e, f]);
      g.hot.push([c].concat(j, [e]));
      g.seams.push([P(-0.8, -0.1), P(0.75, -0.2)], [P(-0.2, -0.82), P(-0.3, 0.7)]);
      g.port = [-0.52 * R, -0.42 * R, 0.22 * R];
      for (let i = 0; i < 3; i++) g.holes.push([P(0.05, -0.62 + i * 0.16), P(0.45, -0.66 + i * 0.16), P(0.45, -0.58 + i * 0.16), P(0.05, -0.54 + i * 0.16)]);
      for (let i = 0; i < 3; i++) g.rivets.push(P(-0.7 + i * 0.2, 0.3), P(-0.12, -0.7 + i * 0.5));
    }
    dbGeoms.set(key, g);
    return g;
  }
  function drawDebris(ctx, w, h, shape, R, th) {
    const g = debrisGeom(shape, R);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(th);
    const body = A.poly(g.pts), bounds = { x: -R, y: -R, w: R * 2, h: R * 2 };
    const la = LIGHT_ANG - th, lx = Math.cos(la), ly = Math.sin(la);
    A.metal(ctx, body, { base: '#565d6d', angle: la, bounds, spec: 0.5, specPos: 0.3, edge: Math.max(1, R * 0.06), rimLight: Math.max(1, R * 0.05) });
    ctx.save();
    ctx.clip(body);
    if (g.stripe) {
      ctx.save();
      ctx.clip(A.poly(g.stripe));
      const s = Math.max(4, R * 0.16);
      for (let i = -8; i < 8; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(196,160,64,0.62)' : 'rgba(18,19,26,0.7)';
        ctx.beginPath();
        ctx.moveTo(-R + i * s, -R); ctx.lineTo(-R + (i + 1) * s, -R); ctx.lineTo(-R + (i + 1) * s + 2 * R, R); ctx.lineTo(-R + i * s + 2 * R, R);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const sm of g.seams) A.panelLines(ctx, A.poly(sm, true), '#0a0b10', 0.6);
    for (const hl of g.holes) {
      const p = A.poly(hl);
      ctx.fillStyle = '#07080c';
      ctx.fill(p);
      ctx.strokeStyle = 'rgba(255,190,140,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke(p);
    }
    if (g.port) {
      const [px, py, pr] = g.port, gr = ctx.createRadialGradient(px, py, 0, px, py, pr);
      gr.addColorStop(0, '#ffd2a8'); gr.addColorStop(0.35, '#ff8a5c'); gr.addColorStop(0.7, '#5a1a14'); gr.addColorStop(1, '#0c0608');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(20,22,30,0.9)'; ctx.lineWidth = Math.max(1, pr * 0.25); ctx.stroke();
    }
    for (const rv of g.rivets) {
      const rr2 = Math.max(0.9, R * 0.035);
      ctx.fillStyle = '#20232c';
      ctx.beginPath(); ctx.arc(rv[0], rv[1], rr2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(230,236,248,0.55)';
      ctx.beginPath(); ctx.arc(rv[0] + lx * rr2 * 0.4, rv[1] + ly * rr2 * 0.4, rr2 * 0.45, 0, TAU); ctx.fill();
    }
    ctx.restore();
    for (const hp of g.hot) A.emissive(ctx, A.poly(hp, true), '#ff8a5c', Math.max(4, R * 0.22), { stroke: Math.max(1.1, R * 0.055) });
  }

  // rotation frame keys, defined on first use
  function rockFrameKey(skin, size, shape, frame) {
    const key = 'hz:rk:' + skin + ':' + size + ':' + shape + ':' + frame;
    if (!A.has(key)) {
      const R = RK_R[size], th = (frame / RK_FRAMES[size]) * TAU;
      const box = Math.ceil(R * RK_EXT * 2) + 2;
      if (skin === 'debris') A.define(key, box, box, (ctx, w, h) => drawDebris(ctx, w, h, shape, R, th), { pad: Math.ceil(R * 0.25) + 3 });
      else A.define(key, box, box, (ctx, w, h) => renderRock(ctx, w, h, skin, rockModel(skin, shape + 1 + R * 3, R), th, R), { pad: 0 });
    }
    return key;
  }
  /** Draws a rock-like body: the frame nearest `rot`, turned by the remainder; white hit flash. */
  function drawRockSprite(ctx, skin, size, shape, x, y, rot, scale, alpha, flash) {
    const F = RK_FRAMES[size], step = TAU / F;
    let a = rot % TAU;
    if (a < 0) a += TAU;
    let f = Math.round(a / step);
    const rem = a - f * step;
    f %= F;
    const key = rockFrameKey(skin, size, shape, f);
    A.drawSprite(ctx, key, x, y, rem, scale, alpha);
    if (flash > 0) A.drawFlash(ctx, key, x, y, rem, scale, Math.min(1, flash / 0.06) * 0.45 * alpha);
  }

  // small chips for impacts and breaks (particle sprites)
  function defineChips() {
    const mk = (key, seed, fill, edge, glow) => A.define(key, 14, 14, (ctx, w, h) => {
      const rg = SL.makeRng(seed), n = rg.int(4, 6), pts = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rg.range(-0.3, 0.3), r = rg.range(3.2, 6.6); pts.push([w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r]); }
      const p = A.poly(pts), gr = ctx.createLinearGradient(2, 2, w - 2, h - 2);
      gr.addColorStop(0, fill[0]); gr.addColorStop(1, fill[1]);
      if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 5; }
      ctx.fillStyle = gr;
      ctx.fill(p);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.stroke(p);
    }, { pad: 3 });
    for (let i = 0; i < 3; i++) {
      mk('hz:chip:rock:' + i, 11 + i, ['#6e6068', '#1e1820'], 'rgba(160,140,118,0.6)');
      mk('hz:chip:ice:' + i, 23 + i, ['rgba(226,244,255,0.95)', 'rgba(90,150,200,0.7)'], 'rgba(200,250,255,0.9)', '#7fe8ff');
      mk('hz:chip:debris:' + i, 37 + i, ['#9aa2b4', '#2a2e38'], 'rgba(255,150,100,0.85)', '#ff8a5c');
      mk('hz:chip:shade:' + i, 51 + i, ['#4a4a55', '#121218'], 'rgba(150,154,170,0.5)');
    }
    // dust streak (points +x) and an ice glint
    A.define('hz:dust', 64, 6, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2, h * 0.28, 0, 0, TAU); ctx.fill();
    }, { pad: 1 });
    A.define('hz:glint', 40, 40, (ctx, w, h) => {
      ctx.globalCompositeOperation = 'lighter';
      for (const [l, t] of [[20, 1.6], [12, 1]]) {
        for (let k = 0; k < 2; k++) {
          const g = k ? ctx.createLinearGradient(w / 2, h / 2 - l, w / 2, h / 2 + l) : ctx.createLinearGradient(w / 2 - l, h / 2, w / 2 + l, h / 2);
          g.addColorStop(0, 'rgba(200,245,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(200,245,255,0)');
          ctx.fillStyle = g;
          if (k) ctx.fillRect(w / 2 - t / 2, h / 2 - l, t, l * 2); else ctx.fillRect(w / 2 - l, h / 2 - t / 2, l * 2, t);
        }
      }
      const gg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 6);
      gg.addColorStop(0, 'rgba(255,255,255,1)'); gg.addColorStop(1, 'rgba(127,232,255,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, w, h);
    }, { pad: 0 });
  }
  defineChips();

  // ================================================================== asteroid_storm
  const ROCK = {
    s: { r: 16, hp: 30, v: [260, 320], dmg: 12, split: null, score: 30, credits: [0, 1] },
    m: { r: 32, hp: 120, v: [200, 260], dmg: 20, split: 's', score: 80, credits: [1, 2] },
    l: { r: 54, hp: 400, v: [150, 190], dmg: 30, split: 'm', score: 200, credits: [2, 4] },
  };
  const ROCK_MIX = { s: 0.6, m: 0.3, l: 0.1 };
  const STORM_TEXT = 'ROCKS INBOUND';
  const VARIANTS = ['rock', 'ice', 'debris'];
  const DUST_COL = { rock: '#c8b498', ice: '#d8ecff', debris: '#ffb088' };

  function segDist2(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = ax + vx * t - px, dy = ay + vy * t - py;
    return dx * dx + dy * dy;
  }
  /** Player beams (lance) only hit enemies in core: this gives shootable rocks and mines the same damage. */
  function beamDps(pr) {
    let dps = 0;
    for (const bm of SL.world.beams) {
      if (bm.dead || !bm.active) continue;
      const len = bm.length || 1400, ex = bm.x + Math.cos(bm.angle) * len, ey = bm.y + Math.sin(bm.angle) * len;
      const rr = pr.r + (bm.width || 20) * 0.5;
      if (segDist2(pr.x, pr.y, bm.x, bm.y, ex, ey) < rr * rr) dps += bm.dps || 300;
    }
    return dps;
  }
  function chipKey(v) { return 'hz:chip:' + v + ':' + ((rnd() * 3) | 0); }

  function breakFx(x, y, r, v, vx, vy, big) {
    const fx = SL.fx, n = lowQ() ? 0.5 : 1;
    if (v === 'debris') {
      fx.explode(x, y, { size: big > 1.4 ? 'm' : 's', palette: 'enemy', debris: true, shake: big > 1.4, sound: false, scale: 0.55 + 0.3 * big });
      fx.sparks(x, y, { count: (10 * big * n) | 0, color: '#ffb088', speed: 420, life: 0.45 });
    } else {
      const ice = v === 'ice';
      for (let i = 0; i < (4 + 5 * big) * n; i++) {
        const a = rnd() * TAU, s = rr(20, 90) * big;
        if (ice) fx.emit({ x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.4, vx: Math.cos(a) * s + vx * 0.3, vy: Math.sin(a) * s + vy * 0.3, life: rr(0.4, 0.7), size: r * 0.9, size2: r * 2.2, color: '#bfe6ff', alpha: 0.28, alpha2: 0, drag: 2.5 });
        else fx.emit({ shape: 'smoke', x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.4, vx: Math.cos(a) * s + vx * 0.3, vy: Math.sin(a) * s + vy * 0.3, life: rr(0.7, 1.2), size: r * 0.8, size2: r * 2.2, color: '#40363c', alpha: 0.6, alpha2: 0, drag: 2.4, rot: rnd() * TAU, spin: rr(-1, 1) });
      }
      for (let i = 0; i < (5 + 8 * big) * n; i++) {
        const a = rnd() * TAU, s = rr(90, 340) * Math.sqrt(big);
        fx.emit({ shape: chipKey(ice ? 'ice' : 'rock'), x, y, vx: Math.cos(a) * s + vx * 0.4, vy: Math.sin(a) * s + vy * 0.4, life: rr(0.6, 1.1), size: rr(5, 11) * Math.sqrt(big), size2: 3, alpha: 1, alpha2: 0.2, drag: 1.4, rot: rnd() * TAU, spin: rr(-12, 12), blend: ice ? 'add' : 'normal' });
      }
      fx.sparks(x, y, { count: (8 * big * n) | 0, color: ice ? '#dff6ff' : '#ffcf9a', speed: 320, life: 0.35 });
      fx.emit({ x, y, life: 0.18, size: r * 1.6, size2: r * 3, color: ice ? '#dff6ff' : '#ffd8b0', alpha: 0.55, alpha2: 0 });
    }
    if (big > 1.4) {
      fx.shake(3, 0.2);
      fx.shockwave(x, y, { radius: 150, duration: 0.45, strength: 0.6, color: v === 'ice' ? '#bfe6ff' : '#ffd8b0' });
    }
  }

  function rockBreak(pr, byPlayer) {
    const d = pr.data, S = ROCK[d.size], x = pr.x, y = pr.y, v = d.variant;
    const big = d.size === 'l' ? 1.6 : d.size === 'm' ? 1.15 : 0.75;
    sfx('rock_break', x, 0.45 + 0.25 * big);
    if (onScreenish(x, y, 60)) breakFx(x, y, pr.r, v, pr.vx, pr.vy, big);
    if (S.split) {
      const C2 = ROCK[S.split], sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy) || 200, base = Math.atan2(pr.vy, pr.vx);
      for (let k = -1; k <= 1; k += 2) {
        const a = base + k * SL.rng.range(0.32, 0.6), v2 = Math.max(sp, SL.rng.range(C2.v[0], C2.v[1]));
        const pa = base + k * Math.PI / 2;
        SL.spawnProp(ROCK_PROP, { x: x + Math.cos(pa) * C2.r * 0.8, y: y + Math.sin(pa) * C2.r * 0.8, vx: Math.cos(a) * v2, vy: Math.sin(a) * v2,
          size: S.split, variant: v, storm: d.storm, nc: 0.45 });
      }
    }
    if (byPlayer) { addScore(S.score, x, y); dropCredits(x, y, S.credits); }
  }

  /** Rock prop (hazard-owned): shootable, blocks bullets both ways, splits, contact damage by size. */
  const ROCK_PROP = {
    shootable: true,
    blocksBullets: true,
    isRock: true,
    init(pr, o) {
      const d = pr.data, S = ROCK[o.size] || ROCK.m;
      d.size = ROCK[o.size] ? o.size : 'm';
      d.variant = VARIANTS.indexOf(o.variant) >= 0 ? o.variant : 'rock';
      d.shape = o.shape != null ? o.shape % 3 : SL.rng.int(0, 2);
      d.storm = o.storm || null;
      d.spin = (o.spin != null ? o.spin : SL.rng.range(0.2, 1.2)) * (SL.rng.chance(0.5) ? 1 : -1);
      d.nc = o.nc || 0;
      d.touchT = 0;
      d.vx0 = pr.vx; d.vy0 = pr.vy;
      d.glint = rnd() * 4;
      pr.typeId = 'rock';
      pr.r = S.r * 0.9;
      pr.hp = pr.maxHp = Math.max(1, Math.round(S.hp * (diff().enemyHp || 1)));
      pr.rot = rnd() * TAU;
    },
    update(pr, dt) {
      const d = pr.data;
      pr.rot += d.spin * dt;
      if (d.nc > 0) d.nc -= dt;
      if (d.touchT > 0) d.touchT -= dt;
      d.glint += dt;
      // flow: velocity relaxes back toward the storm's after bumps
      const kf = Math.min(1, 0.6 * dt);
      pr.vx += (d.vx0 - pr.vx) * kf;
      pr.vy += (d.vy0 - pr.vy) * kf;
      if (!pr.entered && pr.y > -pr.r && pr.x > -pr.r && pr.x < W + pr.r) pr.entered = true;
      if (pr.entered && ((pr.x < -pr.r - 60 && pr.vx < 0) || (pr.x > W + pr.r + 60 && pr.vx > 0))) { pr.dead = true; return; }
      if (SL.world.beams.length) {
        const dps = beamDps(pr);
        if (dps > 0) {
          pr.hp -= dps * dt;
          pr.flash = 0.06;
          if (rnd() < dt * 12) SL.fx.emit({ shape: chipKey(d.variant), x: pr.x + rr(-0.5, 0.5) * pr.r, y: pr.y + pr.r * 0.6, vx: rr(-120, 120), vy: rr(80, 220), life: 0.5, size: 6, size2: 2, alpha: 1, alpha2: 0, rot: rnd() * TAU, spin: rr(-10, 10) });
          if (pr.hp <= 0) { pr.dead = true; rockBreak(pr, true); return; }
        }
      }
      // rock vs rock: momentum exchange (each pair once)
      const props = SL.world.props;
      for (let i = 0; i < props.length; i++) {
        const o = props[i];
        if (o.def !== ROCK_PROP || o.dead || o.id <= pr.id) continue;
        if (d.nc > 0 && o.data.nc > 0) continue;
        const dx = o.x - pr.x, dy = o.y - pr.y, rs = pr.r + o.r, d2 = dx * dx + dy * dy;
        if (d2 >= rs * rs || d2 < 1e-6) continue;
        const dist = Math.sqrt(d2), nx = dx / dist, ny = dy / dist, ov = rs - dist;
        const m1 = pr.r * pr.r, m2 = o.r * o.r, mt = m1 + m2;
        pr.x -= nx * ov * (m2 / mt); pr.y -= ny * ov * (m2 / mt);
        o.x += nx * ov * (m1 / mt); o.y += ny * ov * (m1 / mt);
        const rv = (o.vx - pr.vx) * nx + (o.vy - pr.vy) * ny;
        if (rv < 0) {
          const j = (-(1 + 0.55) * rv) / (1 / m1 + 1 / m2);
          pr.vx -= (j / m1) * nx; pr.vy -= (j / m1) * ny;
          o.vx += (j / m2) * nx; o.vy += (j / m2) * ny;
          if (-rv > 70 && onScreenish(pr.x, pr.y, 0)) {
            const cx = pr.x + nx * pr.r, cy = pr.y + ny * pr.r;
            SL.fx.sparks(cx, cy, { count: 5, color: d.variant === 'ice' ? '#dff6ff' : '#ffcf9a', speed: 220, life: 0.25 });
            SL.fx.emit({ shape: chipKey(d.variant), x: cx, y: cy, vx: -ny * 160, vy: nx * 160, life: 0.6, size: 7, size2: 3, alpha: 1, alpha2: 0, rot: rnd() * TAU, spin: rr(-9, 9) });
          }
        }
      }
    },
    draw(pr, ctx) {
      const d = pr.data;
      if (d.variant === 'debris') A.drawGlow(ctx, pr.x, pr.y, pr.r * 1.5, '#ff7a3d', 0.07 + 0.03 * Math.sin(pr.age * 7 + d.glint));
      drawRockSprite(ctx, d.variant, d.size, d.shape, pr.x, pr.y, pr.rot, 1, pr.alpha, pr.flash);
      if (d.variant === 'ice') {
        // a crystal glint sweeps the lit shoulder every few seconds
        const g = d.glint % 3.2;
        if (g < 0.35) {
          const k = Math.sin((g / 0.35) * Math.PI);
          ctx.globalCompositeOperation = 'lighter';
          A.drawSprite(ctx, 'hz:glint', pr.x - pr.r * 0.38, pr.y - pr.r * 0.42, 0, (0.45 + pr.r / 60) * (0.6 + 0.4 * k), k * 0.9);
        }
      }
    },
    onHit(pr, dmg, b) {
      if (rnd() < 0.6) {
        const a = (b ? b.angle || -Math.PI / 2 : -Math.PI / 2) + Math.PI + rr(-0.7, 0.7), s = rr(80, 220);
        SL.fx.emit({ shape: chipKey(pr.data.variant), x: b ? b.x : pr.x, y: b ? b.y : pr.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rr(0.35, 0.6), size: rr(4, 8), size2: 2, alpha: 1, alpha2: 0, rot: rnd() * TAU, spin: rr(-12, 12), drag: 1.5 });
      }
    },
    onDeath(pr) { rockBreak(pr, true); },
    onTouch(pr, p) {
      if (!live(p)) return;
      const d = pr.data, S = ROCK[d.size];
      const dx = p.x - pr.x, dy = p.y - pr.y, dist = Math.sqrt(dx * dx + dy * dy) || 1, nx = dx / dist, ny = dy / dist;
      const ov = pr.r + (p.r || 22) - dist;
      if (ov > 0) { p.x += nx * ov * 0.35; p.y += ny * ov * 0.35; }
      if (SL.player && SL.player.push) SL.player.push(p, nx * 5200, ny * 5200, SL.world.dt || 1 / 60);
      if (p.invuln > 0 || d.touchT > 0) return;
      const st = d.storm && !d.storm.dead ? d.storm : null;
      if (st && st.age < GRACE) return;
      d.touchT = 0.5;
      const dealt = SL.damagePlayer(p, S.dmg, { source: 'rock', hazard: 'asteroid_storm' }) || 0;
      if (dealt > 0) {
        const cx = pr.x + nx * pr.r, cy = pr.y + ny * pr.r;
        SL.fx.sparks(cx, cy, { count: 12, color: '#ffd8b0', speed: 360, angle: Math.atan2(ny, nx), spread: 2.2, life: 0.35 });
        for (let i = 0; i < 4; i++) SL.fx.emit({ shape: chipKey(d.variant), x: cx, y: cy, vx: nx * rr(80, 240) + rr(-80, 80), vy: ny * rr(80, 240) + rr(-80, 80), life: 0.6, size: 7, size2: 3, alpha: 1, alpha2: 0, rot: rnd() * TAU, spin: rr(-10, 10) });
      }
    },
  };

  function stInit(h, o) {
    const d = h.data;
    d.variant = VARIANTS.indexOf(o.variant) >= 0 ? o.variant : 'rock';
    if (o.variant && d.variant !== o.variant) U.warnOnce('storm-var:' + o.variant, 'asteroid_storm: unknown variant "' + o.variant + '"; using rock');
    d.duration = o.duration != null ? +o.duration || 0 : 30;
    d.density = o.density != null ? Math.max(0, +o.density || 0) : 1;
    d.dir = o.dir === 'ul' || o.dir === 'ur' ? o.dir : 'down';
    let sizes = Array.isArray(o.sizes) ? o.sizes.filter((s) => ROCK[s]) : [];
    if (!sizes.length) sizes = ['s', 'm', 'l'];
    d.sizes = sizes;
    d.wsum = sizes.reduce((a, s) => a + ROCK_MIX[s], 0);
    d.lead = o.lead != null ? Math.max(0, o.lead) : 2;
    d.next = d.lead;
    d.stopped = false;
    d.endT = 0;
    d.recent = [];
    d.dust = [];
    d.dustAcc = 0;
    // ul: from the upper left (rocks travel down-right); ur: from the upper right
    d.ang = d.dir === 'ul' ? Math.PI / 2 - 0.5 : d.dir === 'ur' ? Math.PI / 2 + 0.5 : Math.PI / 2;
    d.pre = [];
    for (const s of sizes) for (let sh = 0; sh < 3; sh++) for (let f = RK_FRAMES[s] - 1; f >= 0; f--) d.pre.push([d.variant, s, sh, f]);
    h.x = W / 2; h.y = -40; h.vx = 0; h.vy = 0;
    warn(h, STORM_TEXT);
  }
  function stSpawn(h) {
    const d = h.data;
    let pick = SL.rng.next() * d.wsum, size = d.sizes[0];
    for (const s of d.sizes) { pick -= ROCK_MIX[s]; if (pick <= 0) { size = s; break; } }
    const S = ROCK[size], R = S.r;
    const a = d.ang + SL.rng.range(-0.1, 0.1), ca = Math.cos(a), sa = Math.sin(a);
    let sx = 0, sy = -R - 16;
    for (let tries = 0; tries < 4; tries++) {
      const tx = SL.rng.range(40, W - 40), ty = SL.rng.range(0, H * 0.55);
      const L = (ty - sy) / sa;
      sx = tx - ca * L;
      let ok = true;
      for (const q of d.recent) if (h.age - q[2] < 1.3 && Math.abs(q[0] - sx) < (R + q[1]) * 1.25) { ok = false; break; }
      if (ok) break;
    }
    d.recent.push([sx, R, h.age]);
    if (d.recent.length > 6) d.recent.shift();
    const v = SL.rng.range(S.v[0], S.v[1]);
    SL.spawnProp(ROCK_PROP, { x: sx, y: sy, vx: ca * v, vy: sa * v, size, variant: d.variant, storm: h });
  }
  function stUpdate(h, dt) {
    const d = h.data, t = h.age;
    for (let n = 0; n < 4 && d.pre.length; n++) {
      const q = d.pre.pop();
      try { A.get(rockFrameKey(q[0], q[1], q[2], q[3])); } catch (err) { report('rock prewarm', err); d.pre.length = 0; }
    }
    if (!d.stopped && d.duration > 0 && t >= d.lead + d.duration) stStop(h);
    if (!d.stopped && t >= d.next && d.density > 0) {
      stSpawn(h);
      const rate = 1.4 * d.density;
      d.next = t + (rate > 0 ? SL.rng.range(0.55, 1.45) / rate : 1e9);
    }
    // dust streaks along the storm: a thick telegraph during the lead-in, a light stream during the storm
    const rate = d.stopped ? 0 : t < d.lead ? 44 : 10 * Math.min(1.5, d.density + 0.2);
    d.dustAcc += rate * dt;
    const ca = Math.cos(d.ang), sa = Math.sin(d.ang);
    while (d.dustAcc >= 1) {
      d.dustAcc -= 1;
      if (d.dust.length >= 70) break;
      const tx = rr(-60, W + 60), ty = rr(-40, H * 0.9), L = (ty + 80) / sa, v = rr(900, 1500);
      d.dust.push({ x: tx - ca * L, y: -80, vx: ca * v, vy: sa * v, len: rr(50, 150), w: rr(0.9, 2.2), a: rr(0.1, 0.28) * (t < d.lead ? 1.3 : 1) });
    }
    for (let i = d.dust.length - 1; i >= 0; i--) {
      const q = d.dust[i];
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.y > H + 120 || q.x < -260 || q.x > W + 260) d.dust.splice(i, 1);
    }
    if (d.stopped && t > d.endT + 3 && !d.dust.length) h.dead = true;
  }
  function stStop(h) {
    const d = h.data;
    if (d.stopped) return;
    d.stopped = true;
    d.endT = h.age;
  }
  function stDrawUnder(h, ctx) {
    const d = h.data;
    if (!d.dust.length) return;
    const spr = A.get('hz:dust'), col = DUST_COL[d.variant];
    const b = SL.render.base, bs = b.s;
    ctx.globalCompositeOperation = 'lighter';
    const tint = A.glow(col, 8);
    for (const q of d.dust) {
      const sp = Math.sqrt(q.vx * q.vx + q.vy * q.vy) || 1, ux = q.vx / sp, uy = q.vy / sp;
      ctx.globalAlpha = q.a;
      ctx.setTransform(ux * q.len / 64 * bs, uy * q.len / 64 * bs, -uy * q.w / 6 * bs, ux * q.w / 6 * bs, b.x + q.x * bs, b.y + q.y * bs);
      ctx.drawImage(spr.canvas, -spr.cw, -spr.ch / 2, spr.cw, spr.ch);
      ctx.globalAlpha = q.a * 0.35;
      ctx.drawImage(tint, -8, -8, 16, 16);
    }
    SL.render.resetTransform(ctx);
  }
  SL.hazards.define('asteroid_storm', {
    r: 0,
    manualMove: true,
    init: stInit,
    update: stUpdate,
    drawUnder: stDrawUnder,
    end: stStop,
    stop: stStop,
  });

  // ================================================================== prop_shade_rock (cover from solar flares)
  const SHADE_LEN = 700;
  const FL = { k: 0, dx: 1, dy: 0, t: -1 };     // current flare light (written by solar_flare each step) for rim lights
  function defineShadeArt() {
    // mirror segment (skin 'mirror'): a polished hexagonal mirror in a bevelled gunmetal frame. The silvered face
    // reflects the bright sky toward the key light (upper left) and falls to deep blue, concave-shaded, with a crisp
    // specular streak, faint reflected stars, hairline segment seams and a sensor hub.
    A.define('hz:shade:mirror', 160, 160, (ctx, w, h) => {
      const cx = w / 2, cy = h / 2, rot = Math.PI / 6;
      const hex = (r) => { const p = new Path2D(); for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU; if (i) p.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else p.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } p.closePath(); return p; };
      const outer = hex(76), inner = hex(63), lip = hex(66.5);
      // frame
      A.metal(ctx, outer, { base: '#6a7186', spec: 0.7, specPos: 0.28, bounds: { x: 4, y: 4, w: 152, h: 152 } });
      ctx.fillStyle = 'rgba(8,10,16,0.55)';
      ctx.fill(lip);
      const lines = new Path2D();
      for (let i = 0; i < 6; i++) {
        const a = rot + (i / 6) * TAU;
        lines.moveTo(cx + Math.cos(a) * 66.5, cy + Math.sin(a) * 66.5); lines.lineTo(cx + Math.cos(a) * 76, cy + Math.sin(a) * 76);
      }
      A.panelLines(ctx, lines, '#0b0d14', 0.7);
      // mirror face
      ctx.save();
      ctx.clip(inner);
      const g = ctx.createLinearGradient(cx - 52, cy - 62, cx + 46, cy + 58);
      g.addColorStop(0, '#aebfe2'); g.addColorStop(0.2, '#7487bb'); g.addColorStop(0.45, '#3c4d80'); g.addColorStop(0.75, '#1a2440'); g.addColorStop(1, '#0b1020');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const cv = ctx.createRadialGradient(cx - 12, cy - 14, 4, cx, cy, 70);
      cv.addColorStop(0, 'rgba(255,255,255,0.22)'); cv.addColorStop(0.55, 'rgba(255,255,255,0)'); cv.addColorStop(1, 'rgba(0,0,10,0.42)');
      ctx.fillStyle = cv;
      ctx.fillRect(0, 0, w, h);
      // reflected starfield (sparse) and a faint nebula band
      const rg = SL.makeRng(5150);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const sx = rg.range(cx - 62, cx + 62), sy = rg.range(cy - 62, cy + 62), sr = rg.range(0.4, 1.2);
        ctx.fillStyle = 'rgba(220,232,255,' + rg.range(0.25, 0.7).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
      }
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(-0.72);
      for (const [o, wd, al] of [[-30, 14, 0.32], [-30, 2.5, 0.6], [-8, 5, 0.16], [26, 22, 0.08]]) {
        const sg = ctx.createLinearGradient(o - wd, 0, o + wd, 0);
        sg.addColorStop(0, 'rgba(200,220,255,0)'); sg.addColorStop(0.5, 'rgba(236,244,255,' + al + ')'); sg.addColorStop(1, 'rgba(200,220,255,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(o - wd, -100, wd * 2, 200);
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(10,16,32,0.35)';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) {
        const a = rot + (i / 3) * Math.PI;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 63, cy + Math.sin(a) * 63); ctx.lineTo(cx - Math.cos(a) * 63, cy - Math.sin(a) * 63); ctx.stroke();
      }
      ctx.restore();
      // bevel: lit upper-left inner edge, shadowed lower-right
      ctx.save();
      ctx.clip(inner);
      ctx.lineWidth = 3;
      const bv = ctx.createLinearGradient(cx - 60, cy - 60, cx + 60, cy + 60);
      bv.addColorStop(0, 'rgba(255,255,255,0.85)'); bv.addColorStop(0.5, 'rgba(255,255,255,0.08)'); bv.addColorStop(0.52, 'rgba(0,0,0,0.1)'); bv.addColorStop(1, 'rgba(0,0,0,0.75)');
      ctx.strokeStyle = bv;
      ctx.stroke(inner);
      ctx.restore();
      // bolts at the frame corners
      for (let i = 0; i < 6; i++) {
        const a = rot + ((i + 0.5) / 6) * TAU, bx = cx + Math.cos(a) * 62.5, by = cy + Math.sin(a) * 62.5;
        const bg = ctx.createRadialGradient(bx - 0.8, by - 1, 0.2, bx, by, 2.8);
        bg.addColorStop(0, '#e8edf7'); bg.addColorStop(0.5, '#6b7287'); bg.addColorStop(1, '#16181f');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(bx, by, 2.6, 0, TAU); ctx.fill();
      }
      // sensor hub
      const hub = new Path2D(); hub.arc(cx, cy, 7.5, 0, TAU);
      A.metal(ctx, hub, { base: '#4c5466', spec: 0.6, bounds: { x: cx - 8, y: cy - 8, w: 16, h: 16 } });
      ctx.fillStyle = '#05070c';
      ctx.beginPath(); ctx.arc(cx, cy, 3.6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(127,227,255,0.9)';
      ctx.beginPath(); ctx.arc(cx - 1.1, cy - 1.2, 1.1, 0, TAU); ctx.fill();
    }, { pad: 4, res: 2 });
    // moving sheen band (mirror) and the flare rim crescent (faces +x)
    A.define('hz:shade:sheen', 64, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(143,179,255,0)'); g.addColorStop(0.42, 'rgba(170,200,255,0.5)'); g.addColorStop(0.5, 'rgba(235,244,255,0.9)');
      g.addColorStop(0.58, 'rgba(170,200,255,0.5)'); g.addColorStop(1, 'rgba(143,179,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { pad: 0 });
    A.define('hz:shade:rim', 160, 160, (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 120; i++) {
        const a0 = -1.35 + (i / 120) * 2.7, a1 = a0 + 2.7 / 120 + 0.004, k = Math.pow(Math.cos((a0 + a1) / 2), 1.6);
        for (const [r, lw, col, al] of [[64, 9, '170,200,255', 0.12], [63, 3.5, '230,240,255', 0.4], [62.6, 1.4, '255,255,255', 0.9]]) {
          ctx.strokeStyle = 'rgba(' + col + ',' + (al * k).toFixed(3) + ')';
          ctx.lineWidth = lw;
          ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
        }
      }
    }, { pad: 4 });
  }
  defineShadeArt();
  function hexPath(ctx, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU; if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath();
  }
  const SHADE_PROP = {
    shootable: true,
    blocksBullets: true,
    isShade: true,
    init(pr, o) {
      const d = pr.data;
      pr.typeId = 'prop_shade_rock';
      d.skin = o.skin === 'mirror' ? 'mirror' : 'rock';
      if (o.skin && o.skin !== d.skin) U.warnOnce('shade-skin:' + o.skin, 'prop_shade_rock: unknown skin "' + o.skin + '"; using rock');
      pr.r = U.clamp(o.r || SL.rng.range(60, 90), 24, 140);
      d.drift = o.vy != null ? o.vy : SL.rng.range(35, 40);
      pr.vy = d.drift;
      pr.vx = o.vx || 0;
      d.ty = o.targetY != null ? o.targetY : null;
      d.life = o.life || 0;
      d.shape = SL.rng.int(0, 2);
      d.spin = SL.rng.range(0.03, 0.09) * SL.rng.sign();
      d.ph = rnd() * 10;
      d.fade = 1;
      d.inT = 0;
      pr.rot = d.skin === 'mirror' ? 0 : rnd() * TAU;
      pr.hp = pr.maxHp = 1e9;
    },
    update(pr, dt) {
      const d = pr.data;
      pr.hp = 1e9;
      d.inT = Math.min(1, d.inT + dt / 0.5);
      if (d.ty != null) {
        pr.vy = d.drift + Math.max(0, d.ty - pr.y) * 1.7;
        if (pr.y >= d.ty - 2) d.ty = null;
      } else pr.vy = U.approach(pr.vy, d.drift, 120 * dt);
      if (d.skin === 'rock') pr.rot += d.spin * dt;
      else pr.rot = Math.sin(pr.age * 0.45 + d.ph) * 0.05;
      if (d.life > 0 && pr.age > d.life) {
        d.fade -= dt / 0.8;
        if (d.fade <= 0) { pr.dead = true; return; }
      }
      pr.alpha = Math.min(d.inT, Math.max(0, d.fade));
      // jets are eased aside, never trapped
      for (const p of SL.world.players) {
        if (!live(p)) continue;
        const dx = p.x - pr.x, dy = p.y - pr.y, rs = pr.r + (p.r || 22) * 0.6, d2 = dx * dx + dy * dy;
        if (d2 >= rs * rs) continue;
        const dist = Math.sqrt(d2) || 1, k = 1 - dist / rs;
        if (SL.player && SL.player.push) SL.player.push(p, (dx / dist) * 2600 * k, (dy / dist) * 2600 * k, dt);
      }
    },
    draw(pr, ctx) {
      const d = pr.data, a = pr.alpha;
      if (a <= 0.01) return;
      if (d.skin === 'mirror') {
        const sc = pr.r / 76;
        A.drawSprite(ctx, 'hz:shade:mirror', pr.x, pr.y, pr.rot, sc, a);
        // frame beacons at the top and bottom vertices (cyan and amber, alternating at 1 Hz)
        const bl = (pr.age + d.ph) % 1, cr = Math.cos(pr.rot), sr2 = Math.sin(pr.rot), vr = 70 * sc;
        A.drawGlow(ctx, pr.x + sr2 * vr, pr.y - cr * vr, 9, '#7fe3ff', (bl < 0.5 ? 0.95 : 0.25) * a);
        A.drawGlow(ctx, pr.x - sr2 * vr, pr.y + cr * vr, 9, '#ffb070', (bl >= 0.5 ? 0.95 : 0.25) * a);
        const ph = (pr.age * 0.3 + d.ph) % 1;
        if (ph < 0.45) {
          const k = ph / 0.45, R = 64 * sc, sh = A.get('hz:shade:sheen');
          ctx.save();
          SL.render.setTransform(ctx, pr.x, pr.y, pr.rot, 1, 1);
          hexPath(ctx, R, Math.PI / 6);
          ctx.clip();
          ctx.rotate(-0.7);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.55 * Math.sin(k * Math.PI) * a;
          ctx.drawImage(sh.canvas, -R * 1.6 + k * R * 3.2 - R * 0.35, -R * 1.3, R * 0.7, R * 2.6);
          ctx.restore();
        }
      } else drawRockSprite(ctx, 'shade', 'x', d.shape, pr.x, pr.y, pr.rot, pr.r / RK_R.x, a, 0);
      if (FL.k > 0.01 && FL.t === SL.world.t) {
        ctx.globalCompositeOperation = 'lighter';
        A.drawSprite(ctx, 'hz:shade:rim', pr.x, pr.y, Math.atan2(-FL.dy, -FL.dx), (pr.r * (d.skin === 'mirror' ? 1.02 : 0.98)) / 63, Math.min(1, FL.k) * a);
      }
    },
    onHit(pr, dmg, b) {
      pr.hp = 1e9;
      if (b && rnd() < 0.5) SL.fx.emit({ shape: chipKey('shade'), x: b.x, y: b.y, vx: rr(-90, 90), vy: rr(40, 160), life: 0.45, size: rr(4, 7), size2: 2, alpha: 1, alpha2: 0, rot: rnd() * TAU, spin: rr(-10, 10) });
    },
  };
  /** Shade rock (or mirror segment) prop: SL.hazards.shadeRock(x, y, {r, vy, vx, skin, life, targetY}). */
  function shadeRock(x, y, o) {
    o = o || {};
    return SL.spawnProp(SHADE_PROP, Object.assign({}, o, { x, y }));
  }

  // ================================================================== solar_flare
  const FLARE_TEXT = 'SOLAR FLARE: GET IN THE SHADOW';
  const FL_DIR = { left: [1, 0], right: [-1, 0], top: [0, 1] };
  /** Shade sources as a flat [x, y, r, ...] list: shade rocks, heavy enemies and boss circles. */
  function shadeSources(out) {
    out = out || [];
    out.length = 0;
    for (const pr of SL.world.props) if (!pr.dead && pr.def && pr.def.isShade) out.push(pr.x, pr.y, pr.r);
    for (const e of SL.world.enemies) {
      if (e.dead || e.hidden || !(e.isBoss || isHeavy(e)) || (e.def && e.def.noShade)) continue;
      if (e.circles && e.circles.length) {
        const sc = e.scale || 1;
        for (const c of e.circles) out.push(e.x + c.x * sc, e.y + c.y * sc, c.r * sc);
      } else out.push(e.x, e.y, e.r);
    }
    return out;
  }
  /** True when a source lies between (x, y) and the flare edge along dir within 700 px. Shadows taper to 82%. */
  function shadedBy(src, x, y, dir) {
    for (let i = 0; i < src.length; i += 3) {
      const vx = x - src[i], vy = y - src[i + 1], r = src[i + 2];
      const along = vx * dir[0] + vy * dir[1];
      if (along < -r || along > SHADE_LEN) continue;
      const perp = Math.abs(vx * dir[1] - vy * dir[0]);
      const hw = along > 0 ? r * (1 - 0.18 * (along / SHADE_LEN)) : Math.sqrt(Math.max(0, r * r - along * along));
      if (perp < hw) return true;
    }
    return false;
  }
  function podHit(pod, reason) {
    if (pod.dead || (pod.data && pod.data.pilot)) return;
    if (SL.rescue && typeof SL.rescue.hitPod === 'function') {
      try { SL.rescue.hitPod(pod, 1, reason); } catch (err) { report('SL.rescue.hitPod', err); }
      return;
    }
    if (pod.def && typeof pod.def.onBullet === 'function') {
      try { pod.def.onBullet(pod, { x: pod.x, y: pod.y, damage: 1, typeId: reason, type: reason, color: '#f4f8ff', hazard: true, dead: false }); } catch (err) { report('pod onBullet', err); }
    }
  }
  function defineFlareArt() {
    defineCanvas('hz:fl:wash', 256, () => {
      const c = A.canvas(256, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, 'rgba(250,252,255,1)'); g.addColorStop(0.08, 'rgba(236,244,255,0.82)'); g.addColorStop(0.35, 'rgba(214,228,255,0.5)');
      g.addColorStop(1, 'rgba(184,204,255,0.26)');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);
      return c;
    });
    defineCanvas('hz:fl:edge', 128, () => {
      const c = A.canvas(128, 128), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 128, 0);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.1, 'rgba(240,246,255,0.85)'); g.addColorStop(0.4, 'rgba(170,198,255,0.3)');
      g.addColorStop(1, 'rgba(140,170,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
      return c;
    });
    // god rays: streaks along +x, tileable along y
    defineCanvas('hz:fl:rays', 256, () => {
      const c = A.canvas(256, 256), x = c.getContext('2d'), rg = SL.makeRng(77);
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 90; i++) {
        const y = rg.next() * 256, hh = rg.range(1, 7), a = rg.range(0.04, 0.2), x0 = rg.range(-60, 120), len = rg.range(120, 360);
        const g = x.createLinearGradient(x0, 0, x0 + len, 0);
        g.addColorStop(0, 'rgba(230,240,255,0)'); g.addColorStop(0.2, 'rgba(230,240,255,' + a + ')'); g.addColorStop(1, 'rgba(200,220,255,0)');
        x.fillStyle = g;
        for (const oy of [-256, 0, 256]) x.fillRect(x0, y + oy - hh / 2, len, hh);
      }
      return c;
    });
    // shadow band (+x away from the light): full width at the source, 82% at the far end; crisp sides
    defineCanvas('hz:fl:shadow', 256, () => {
      const c = A.canvas(256, 256), x = c.getContext('2d');
      const img = x.createImageData(256, 256), px = img.data;
      for (let j = 0; j < 256; j++) {
        for (let i = 0; i < 256; i++) {
          const t = i / 255, hw = 0.5 * (1 - 0.18 * t), v = Math.abs((j + 0.5) / 256 - 0.5);
          const side = U.clamp((hw - v) * 256 / 1.6, 0, 1);
          const along = U.smoothstep(0, 0.035, t) * (1 - U.smoothstep(0.88, 1, t));
          const k = (j * 256 + i) * 4;
          px[k] = 3; px[k + 1] = 5; px[k + 2] = 12; px[k + 3] = side * along * 255;
        }
      }
      x.putImageData(img, 0, 0);
      return c;
    });
    A.define('hz:fl:chev', 36, 44, (ctx, w, h) => {
      const p = A.poly([[6, 4], [20, 4], [32, 22], [20, 40], [6, 40], [18, 22]]);
      ctx.shadowColor = '#ffe2a0';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#fff4d8';
      ctx.fill(p);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 1.2;
      ctx.stroke(p);
    }, { pad: 8 });
  }
  defineFlareArt();

  function flInit(h, o) {
    const d = h.data;
    d.from = FL_DIR[o.from] ? o.from : 'left';
    if (o.from && !FL_DIR[o.from]) U.warnOnce('flare-from:' + o.from, 'solar_flare: unknown from "' + o.from + '"; using left');
    d.dir = FL_DIR[d.from];
    d.count = o.count != null ? Math.max(1, o.count | 0) : 3;
    d.every = o.every != null ? Math.max(0.5, +o.every) : 9;
    d.first = o.first != null ? Math.max(0, +o.first) : 3;
    d.warn = o.warn != null ? Math.max(0.5, +o.warn) : 2.5;
    d.burn = o.burn != null ? Math.max(0.2, +o.burn) : 1.2;
    d.cover = o.cover != null ? Math.max(0, o.cover | 0) : 2;
    d.i = 0;
    d.ci = 0;
    d.phase = 'idle';
    d.k = 0;
    d.bk = 0;
    d.after = 0;
    d.src = [];
    d.hit = new Set();
    d.prevPhase = null;
    d.rays = 0;
    h.x = W / 2; h.y = H / 2; h.vx = 0; h.vy = 0;
    if (d.first + d.warn < 1.5) U.warnOnce('flare-early', 'solar_flare: first burn before 1.5 s; delayed to keep the grace rule');
    d.first = Math.max(d.first, 1.5 - d.warn);
  }
  function flSpawnCover(h) {
    const d = h.data, srcs = [];
    for (const pr of SL.world.props) if (!pr.dead && pr.def === SHADE_PROP) srcs.push(pr.x, pr.data.ty != null ? pr.data.ty : pr.y);
    for (let n = 0; n < d.cover; n++) {
      let x = 0, ty = 0;
      for (let tries = 0; tries < 10; tries++) {
        if (d.from === 'top') { x = SL.rng.range(130, W - 130); ty = SL.rng.range(200, 430); }
        else { const near = SL.rng.range(110, 300); x = d.from === 'left' ? near : W - near; ty = SL.rng.range(280, 860); }
        let ok = true;
        for (let i = 0; i < srcs.length; i += 2) if (U.dist2(x, ty, srcs[i], srcs[i + 1]) < 210 * 210) { ok = false; break; }
        if (ok) break;
      }
      srcs.push(x, ty);
      const r = SL.rng.range(60, 90);
      shadeRock(x, -r - 30, { r, targetY: ty, skin: 'rock' });
    }
  }
  function flUpdate(h, dt) {
    const d = h.data, t = h.age, wd = SL.world;
    // cover rocks enter 4 s before each burn
    while (d.ci < d.count && t >= d.first + d.ci * d.every + d.warn - 4) { flSpawnCover(h); d.ci++; }
    if (d.i < d.count) {
      const tw = d.first + d.i * d.every, tb = tw + d.warn, te = tb + d.burn;
      if (d.phase === 'idle' && t >= tw) {
        d.phase = 'warn';
        warn(h, FLARE_TEXT);
        sfx('flare_warn', d.from === 'left' ? 0 : d.from === 'right' ? W : W / 2);
      }
      if (d.phase === 'warn') {
        d.k = U.clamp((t - tw) / d.warn, 0, 1);
        if (t >= tb) {
          d.phase = 'burn';
          d.hit.clear();
          SL.fx.flash('#f4f8ff', 0.35, d.burn);
          SL.fx.shake(5, 0.35);
          SL.fx.chromatic(0.22, 0.4);
          const bg = wd.bg;
          d.prevPhase = bg ? bg.phase : null;
          if (bg && bg.phase !== 'flare') wd.setPhase('flare');
          sfx('flare_burn', W / 2);
        }
      }
      if (d.phase === 'burn') {
        const u = (t - tb) / d.burn;
        d.bk = Math.min(1, u / 0.06) * (u > 0.75 ? Math.max(0, 1 - (u - 0.75) / 0.25) * 0.6 + 0.4 : 1);
        const src = shadeSources(d.src), dir = d.dir;
        for (const p of wd.players) {
          if (!live(p) || d.hit.has(p) || shadedBy(src, p.x, p.y, dir)) continue;
          d.hit.add(p);
          if (hurtPlayer(h, p, 30, 'flare') > 0) {
            SL.fx.sparks(p.x, p.y, { count: 14, color: '#fff1d6', speed: 320, angle: Math.atan2(dir[1], dir[0]), spread: 1.8, life: 0.4 });
            SL.fx.emit({ x: p.x, y: p.y, life: 0.35, size: 40, size2: 90, color: '#f4f8ff', alpha: 0.6, alpha2: 0 });
          }
        }
        for (const e of wd.enemies) {
          if (e.dead || e.dying || e.isBoss || d.hit.has(e) || (e.def && e.def.flareImmune) || !wd.onScreen(e, 0)) continue;
          if (shadedBy(src, e.x, e.y, dir)) continue;
          d.hit.add(e);
          hurtEnemy(e, 200);
          if (!e.dead) SL.fx.sparks(e.x, e.y, { count: 8, color: '#fff1d6', speed: 260, angle: Math.atan2(dir[1], dir[0]), spread: 1.6, life: 0.3 });
        }
        for (const pod of wd.pods) {
          if (pod.dead || d.hit.has(pod) || !wd.onScreen(pod, 0) || shadedBy(src, pod.x, pod.y, dir)) continue;
          d.hit.add(pod);
          podHit(pod, 'flare');
        }
        if (t >= te) {
          d.phase = 'idle';
          d.i++;
          d.k = 0;
          d.after = 0.6;
          const bg = wd.bg;
          if (bg && bg.phase === 'flare') wd.setPhase(d.prevPhase && d.prevPhase !== 'flare' ? d.prevPhase : 'default');
        }
      }
    } else if (d.after <= 0) { h.dead = true; return; }
    if (d.phase !== 'burn') d.bk = 0;
    if (d.after > 0) d.after -= dt;
    d.rays += dt;
    const lk = d.phase === 'burn' ? d.bk : d.phase === 'warn' ? d.k * 0.45 : d.after > 0 ? d.after * 0.4 : 0;
    if (lk > FL.k || FL.t !== wd.t) { FL.k = lk; FL.dx = d.dir[0]; FL.dy = d.dir[1]; FL.t = wd.t; }
  }
  /** Draws a sprite whose +x axis runs along the flare from the source edge for `depth` px across the whole edge. */
  function flAlong(ctx, d, key, depth, offset) {
    const spr = A.get(key), c = spr.canvas, span = d.from === 'top' ? W : H;
    const ox = d.from === 'left' ? 0 : W, oy = d.from === 'right' ? H : 0;
    const rot = d.from === 'left' ? 0 : d.from === 'right' ? Math.PI : Math.PI / 2;
    SL.render.setTransform(ctx, ox, oy, rot, 1, 1);
    if (offset == null) ctx.drawImage(c, 0, 0, depth, span);
    else {
      const o = ((offset % span) + span) % span;
      ctx.drawImage(c, 0, o - span, depth, span);
      ctx.drawImage(c, 0, o, depth, span);
    }
  }
  function flShadows(ctx, d, alpha) {
    if (alpha <= 0.005) return;
    const src = shadeSources(d.src), spr = A.get('hz:fl:shadow').canvas;
    const rot = Math.atan2(d.dir[1], d.dir[0]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, alpha);
    for (let i = 0; i < src.length; i += 3) {
      const r = src[i + 2];
      SL.render.setTransform(ctx, src[i], src[i + 1], rot, SHADE_LEN / 256, (r * 2) / 256);
      ctx.drawImage(spr, 0, -128, 256, 256);
    }
    SL.render.resetTransform(ctx);
  }
  function flDrawUnder(h, ctx) {
    const d = h.data;
    if (d.phase === 'warn') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.05 + 0.13 * d.k;
      flAlong(ctx, d, 'hz:fl:wash', d.from === 'top' ? H : W);
      SL.render.resetTransform(ctx);
      flShadows(ctx, d, 0.12 + 0.3 * d.k);
    } else if (d.phase === 'burn' || d.after > 0) {
      const k = d.phase === 'burn' ? d.bk : d.after / 0.6 * 0.35;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * k;
      flAlong(ctx, d, 'hz:fl:wash', d.from === 'top' ? H : W);
      ctx.globalAlpha = 0.55 * k;
      flAlong(ctx, d, 'hz:fl:rays', d.from === 'top' ? H : W, d.rays * 40);
      SL.render.resetTransform(ctx);
      flShadows(ctx, d, 0.82 * Math.min(1, k * 1.4));
    }
  }
  function flDrawOver(h, ctx) {
    const d = h.data;
    if (d.phase !== 'warn' && d.phase !== 'burn' && !(d.after > 0)) return;
    const t = h.age;
    const k = d.phase === 'warn' ? d.k : d.phase === 'burn' ? 1 : d.after / 0.6;
    const pulse = d.phase === 'warn' ? 0.5 + 0.5 * Math.sin(t * (8 + 10 * d.k)) : 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, (0.3 + 0.5 * k) * (0.75 + 0.25 * pulse) * (d.phase === 'burn' ? 1.2 : 1));
    flAlong(ctx, d, 'hz:fl:edge', 90 + 170 * k);
    SL.render.resetTransform(ctx);
    if (d.phase !== 'warn') return;
    // chevron rows marching away from the source edge
    const chev = A.get('hz:fl:chev'), along = d.from === 'top' ? W : H, rows = d.from === 'top' ? 5 : 8;
    const rot = Math.atan2(d.dir[1], d.dir[0]);
    for (let i = 0; i < rows; i++) {
      const s = (along * (i + 0.5)) / rows;
      for (let j = 0; j < 3; j++) {
        const a = Math.max(0, Math.sin(t * 7 - j * 1.15 - i * 0.25));
        const al = (0.18 + 0.82 * a * a) * (0.45 + 0.55 * d.k);
        const dd = 22 + j * 24 + a * 3;
        const x = d.from === 'left' ? dd : d.from === 'right' ? W - dd : s;
        const y = d.from === 'top' ? dd : s;
        A.drawSprite(ctx, chev, x, y, rot, 0.8, al);
      }
    }
  }
  SL.hazards.define('solar_flare', {
    r: 0,
    manualMove: true,
    init: flInit,
    update: flUpdate,
    drawUnder: flDrawUnder,
    drawOver: flDrawOver,
    end(h) { const d = h.data; if (d.phase === 'burn') return; d.count = Math.min(d.count, d.i + (d.phase === 'warn' ? 1 : 0)); },
    onEnd(h) {
      const bg = SL.world.bg, d = h.data;
      if (bg && bg.phase === 'flare' && d.phase === 'burn') SL.world.setPhase(d.prevPhase && d.prevPhase !== 'flare' ? d.prevPhase : 'default');
    },
  });

  // ================================================================== ion_storm
  const ION_TEXT = 'ION STORM: STAY OUT OF THE GLOW';
  const ION_R = 100;              // visible cloud edge in the 256 px cloud texture
  const STRIKE_R = 70, STRIKE_T = 1.2;
  /** Billowing ion cloud: a cumulus of soft puffs (a big core, a ring of mid puffs and a lumpy rim of small ones),
      each lit like a sphere from the upper left, eroded by fbm wisps; translucent #9fb8ff haze with bright crowns. */
  function cloudTexture(S, seed) {
    const rg = SL.makeRng(seed), Rr = (ION_R * S) / 256, half = S / 2;
    const puffs = [[0, 0, Rr * 0.62, 1]];
    const ring = (n, d0, d1, r0, r1, w) => {
      const a0 = rg.next() * TAU;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU + rg.range(-0.18, 0.18), dd = Rr * rg.range(d0, d1);
        puffs.push([Math.cos(a) * dd, Math.sin(a) * dd, Rr * rg.range(r0, r1), w]);
      }
    };
    ring(7, 0.4, 0.55, 0.36, 0.46, 0.85);
    ring(10, 0.7, 0.82, 0.22, 0.3, 0.7);
    const N = 128, nd = A.noise(N, N, { scale: 32, octaves: 5, seed: seed + 3, gain: 0.55 });
    const nw = A.noise(64, 64, { scale: 16, octaves: 3, seed: seed + 9, gain: 0.5, warp: 0.4 });
    const L = norm3(-0.55, -0.62, 0.56);
    const deep = C.parse('#27306e'), haze = C.parse('#9fb8ff'), hi = C.parse('#eef3ff');
    const c = A.canvas(S, S), x = c.getContext('2d'), img = x.createImageData(S, S), px = img.data;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const u = i + 0.5 - half, v = j + 0.5 - half;
        if (u * u + v * v > (Rr * 1.18) * (Rr * 1.18)) continue;
        let D = 0, lit = 0;
        for (let q = 0; q < puffs.length; q++) {
          const P = puffs[q], dx = (u - P[0]) / P[2], dy = (v - P[1]) / P[2], t2 = dx * dx + dy * dy;
          if (t2 >= 1) continue;
          const b = (1 - t2) * (1 - t2) * P[3], nz = Math.sqrt(1 - t2);
          D += b;
          lit += b * Math.max(0, dx * L[0] + dy * L[1] + nz * L[2]);
        }
        if (D <= 0.002) continue;
        const sh = 0.3 + 0.7 * (lit / D);
        const det = nsample(nd, N, N, (i / S) * N, (j / S) * N), wisp = nsample(nw, 64, 64, (i / S) * 64, (j / S) * 64);
        const dens = (1 - Math.exp(-D * 2.2)) * U.clamp(0.35 + 1.1 * det - 0.4 * wisp * (1 - Math.min(1, D)), 0, 1.3);
        if (dens <= 0.004) continue;
        const rc = (u * u + v * v) / (Rr * Rr * 0.35), em = Math.exp(-rc) * 0.3;
        const l = U.clamp(sh * (0.6 + 0.6 * det), 0, 1), lc = Math.min(1, l + em);
        const k = (j * S + i) * 4;
        let r0 = deep[0] + (haze[0] - deep[0]) * lc, g0 = deep[1] + (haze[1] - deep[1]) * lc, b0 = deep[2] + (haze[2] - deep[2]) * lc;
        if (l > 0.72) { const q = Math.min(1, (l - 0.72) / 0.28) * 0.55; r0 += (hi[0] - r0) * q; g0 += (hi[1] - g0) * q; b0 += (hi[2] - b0) * q; }
        px[k] = r0; px[k + 1] = g0; px[k + 2] = b0;
        px[k + 3] = Math.min(255, Math.min(0.5, dens * (0.19 + 0.26 * l + 0.25 * em)) * 255);
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function defineIonArt() {
    for (let i = 0; i < 3; i++) defineCanvas('hz:ion:cloud' + i, 256, () => cloudTexture(256, 301 + i * 17));
    // the jam boundary: a broken, crackling filament at the cloud radius over a soft glow band (two noise seeds,
    // drawn counter-rotating so the breaks crawl)
    for (let e = 0; e < 2; e++) {
      defineCanvas('hz:ion:edge' + e, 256, () => {
        const ne = A.noise(128, 16, { scale: 8 + e * 8, octaves: 3, seed: 61 + e * 7 });
        return polarTexture(256, (rho, u, out) => {
          const rp = rho * 128, nv = nsample(ne, 128, 16, u * 128, 4);
          const z = (rp - ION_R + 1.5 * (nv - 0.5)) / 1.6, z2 = (rp - ION_R + 4) / 8;
          const a = Math.exp(-z * z) * U.smoothstep(0.62, 0.86, nv) * 0.7 + Math.exp(-z2 * z2) * 0.3 * (0.25 + nv);
          if (a < 0.01) return;
          out[0] = 196; out[1] = 214; out[2] = 255; out[3] = Math.min(255, a * 255);
        });
      });
    }
    // strike telegraph: dashed ring r 70 (in a 160 box) and the light shaft above it
    A.define('hz:ion:dash', 160, 160, (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      ctx.shadowColor = '#9fb8ff';
      ctx.shadowBlur = 6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * TAU, a1 = a0 + (TAU / 16) * 0.55;
        ctx.strokeStyle = 'rgba(205,220,255,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 70, a0, a1); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 16; i++) { const a0 = (i / 16) * TAU, a1 = a0 + (TAU / 16) * 0.55; ctx.beginPath(); ctx.arc(cx, cy, 70, a0, a1); ctx.stroke(); }
    }, { pad: 6 });
    defineCanvas('hz:ion:col', 64, () => {
      const c = A.canvas(64, 64), x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(159,184,255,0)'); g.addColorStop(0.5, 'rgba(200,215,255,1)'); g.addColorStop(1, 'rgba(159,184,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      x.globalCompositeOperation = 'destination-in';
      const v = x.createLinearGradient(0, 0, 0, 64);
      v.addColorStop(0, 'rgba(0,0,0,0.15)'); v.addColorStop(1, 'rgba(0,0,0,1)');
      x.fillStyle = v;
      x.fillRect(0, 0, 64, 64);
      return c;
    });
  }
  defineIonArt();

  /** Jagged lightning polyline from (ax, ay) to (bx, by): midpoint displacement into a flat [x, y, ...] list. */
  function boltPath(ax, ay, bx, by, depth, rough) {
    let pts = [ax, ay, bx, by];
    let amp = Math.sqrt(U.dist2(ax, ay, bx, by)) * rough;
    for (let d = 0; d < depth; d++) {
      const next = [pts[0], pts[1]];
      for (let i = 0; i < pts.length - 2; i += 2) {
        const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
        const dx = x1 - x0, dy = y1 - y0, l = Math.sqrt(dx * dx + dy * dy) || 1, o = (rnd() - 0.5) * 2 * amp;
        next.push((x0 + x1) / 2 - (dy / l) * o, (y0 + y1) / 2 + (dx / l) * o, x1, y1);
      }
      pts = next;
      amp *= 0.55;
    }
    return pts;
  }
  function strokeBolt(ctx, pts, a, wMul) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.globalAlpha = 0.16 * a; ctx.strokeStyle = '#6f86ff'; ctx.lineWidth = 16 * wMul; ctx.stroke();
    ctx.globalAlpha = 0.42 * a; ctx.strokeStyle = '#a9bcff'; ctx.lineWidth = 6 * wMul; ctx.stroke();
    ctx.globalAlpha = 0.95 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2 * wMul; ctx.stroke();
  }

  function ionNewCell(h, i, initial) {
    const d = h.data, n = d.n;
    const r = SL.rng.range(150, 190);
    const lane = (W * (i + 0.5)) / n;
    return {
      x: U.clamp(lane + SL.rng.range(-60, 60), r * 0.5, W - r * 0.5),
      y: initial ? SL.rng.range(160, 760) - i * 40 : -r - 30,
      r, vx: SL.rng.range(10, 20) * SL.rng.sign(), vy: 30, k: 0,
      tex: (i + (initial ? 0 : 1)) % 3, rot1: rnd() * TAU, rot2: rnd() * TAU, w1: rr(0.05, 0.1) * (rnd() < 0.5 ? 1 : -1), w2: rr(0.08, 0.15),
      arcs: [], arcT: rr(0.05, 0.3), fl: [], ph: rnd() * 10,
    };
  }
  function ionInit(h, o) {
    const d = h.data;
    d.n = Math.max(1, Math.min(5, (o.cells != null ? o.cells : 2) | 0));
    d.duration = o.duration != null ? +o.duration || 0 : 25;
    d.every = Math.max(0.4, o.strikeEvery != null ? +o.strikeEvery : 2.4);
    d.cells = [];
    for (let i = 0; i < d.n; i++) d.cells.push(ionNewCell(h, i, true));
    d.strikes = [];
    d.bolts = [];
    d.st = Math.max(GRACE - STRIKE_T + 0.4, Math.min(d.every, 2));
    d.ending = false;
    h.x = W / 2; h.y = H / 2; h.vx = 0; h.vy = 0;
    d.jam = loopStart('ion_jam');
    warn(h, ION_TEXT);
  }
  function ionInside(d, x, y, m) {
    for (const c of d.cells) if (c.k > 0.5 && U.dist2(x, y, c.x, c.y) < (c.r * m) * (c.r * m)) return c;
    return null;
  }
  function ionStrike(h, s) {
    const d = h.data, wd = SL.world, x = s.x, y = s.y;
    for (const p of wd.players) if (live(p) && U.dist2(p.x, p.y, x, y) < STRIKE_R * STRIKE_R) hurtPlayer(h, p, 18, 'ion');
    for (const e of wd.enemies) {
      if (e.dead || e.dying || e.typeId === 'stormcaller' || (e.def && e.def.ionImmune)) continue;
      if (wd.hitTest(e, x, y, STRIKE_R)) hurtEnemy(e, 60, x, y);
    }
    clearBulletsIn(x, y, STRIKE_R, '#cfe0ff');
    sfx('storm_strike', x);
    // the bolt: main channel from above the screen plus forks
    const x0 = x + rr(-90, 90), main = boltPath(x0, -40, x, y, 6, 0.16), forks = [];
    for (let f = 0; f < 3; f++) {
      const k = 2 * (((rr(0.25, 0.8) * (main.length / 2)) | 0));
      const fx0 = main[k], fy0 = main[k + 1], a = Math.PI / 2 + rr(-1, 1);
      const len = rr(60, 150);
      forks.push(boltPath(fx0, fy0, fx0 + Math.cos(a) * len, fy0 + Math.sin(a) * len, 4, 0.22));
    }
    if (d.bolts.length > 5) d.bolts.shift();
    d.bolts.push({ x, y, main, forks, t: 0, life: 0.32, rej: 0.08 });
    if (onScreenish(x, y, 80)) {
      SL.fx.shockwave(x, y, { radius: 170, duration: 0.45, strength: 0.9, color: '#b8caff' });
      SL.fx.sparks(x, y, { count: 26, color: '#dfe8ff', speed: 520, life: 0.4 });
      SL.fx.emit({ x, y, life: 0.3, size: 70, size2: 200, color: '#ffffff', color2: '#7d95ff', alpha: 0.9, alpha2: 0 });
      SL.fx.flash('#cfe0ff', 0.18, 0.16);
      SL.fx.shake(4, 0.2);
    }
  }
  function ionUpdate(h, dt) {
    const d = h.data, wd = SL.world;
    if (!d.ending && d.duration > 0 && h.age >= d.duration) d.ending = true;
    let alive = false;
    for (let i = 0; i < d.cells.length; i++) {
      const c = d.cells[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if ((c.x < c.r * 0.45 && c.vx < 0) || (c.x > W - c.r * 0.45 && c.vx > 0)) c.vx = -c.vx;
      c.rot1 += c.w1 * dt;
      c.rot2 -= c.w2 * dt;
      c.k = U.approach(c.k, d.ending ? 0 : 1, dt / (d.ending ? 2 : GRACE));
      if (c.k > 0) alive = true;
      if (c.y - c.r > H + 30 && !d.ending) d.cells[i] = ionNewCell(h, i, false);
      // crawling sparks and inner flickers (cosmetic)
      c.arcT -= dt;
      if (c.arcT <= 0 && c.k > 0.3) {
        c.arcT = rr(0.06, 0.22);
        if (c.arcs.length > 4) c.arcs.shift();
        if (rnd() < 0.45) {
          // a spark crawling along the boundary: a short arc of the rim, jagged
          const a0 = rnd() * TAU, a1 = a0 + rr(0.25, 0.6) * (rnd() < 0.5 ? 1 : -1), rd = c.r * rr(0.9, 0.98);
          const am = (a0 + a1) / 2, bow = c.r * 1.02;
          const pts = boltPath(Math.cos(a0) * rd, Math.sin(a0) * rd, Math.cos(a1) * rd, Math.sin(a1) * rd, 3, 0.18);
          for (let q = 2; q < pts.length - 2; q += 2) { const f = q / (pts.length - 2), bw = Math.sin(f * Math.PI) * (bow - rd); pts[q] += Math.cos(am) * bw; pts[q + 1] += Math.sin(am) * bw; }
          c.arcs.push({ pts, t: 0, life: rr(0.12, 0.26), rim: true });
        } else {
          const a = rnd() * TAU, rd = Math.sqrt(rnd()) * c.r * 0.75, ax = Math.cos(a) * rd, ay = Math.sin(a) * rd;
          const b = a + rr(-1.4, 1.4), len = rr(40, 110);
          c.arcs.push({ pts: boltPath(ax, ay, ax + Math.cos(b) * len, ay + Math.sin(b) * len, 3, 0.3), t: 0, life: rr(0.1, 0.22) });
        }
        if (c.fl.length > 2) c.fl.shift();
        const fa = rnd() * TAU, fr = Math.sqrt(rnd()) * c.r * 0.7;
        c.fl.push({ x: Math.cos(fa) * fr, y: Math.sin(fa) * fr, t: 0, life: rr(0.2, 0.4), s: rr(50, 90) });
      }
      for (let j = c.arcs.length - 1; j >= 0; j--) { const q = c.arcs[j]; q.t += dt; if (q.t >= q.life) c.arcs.splice(j, 1); }
      for (let j = c.fl.length - 1; j >= 0; j--) { const q = c.fl[j]; q.t += dt; if (q.t >= q.life) c.fl.splice(j, 1); }
    }
    // ion jam
    let jammed = false;
    for (const p of wd.players) {
      if (!live(p)) continue;
      if (ionInside(d, p.x, p.y, 0.95)) { if (!p.data) p.data = {}; p.data.ionJamT = 0.1; jammed = true; }
    }
    loopSet(d.jam, jammed ? 0.7 : 0, W / 2);
    // strikes
    if (!d.ending) {
      d.st -= dt;
      if (d.st <= 0) {
        d.st += d.every;
        const inCells = [];
        for (const p of wd.players) if (live(p) && ionInside(d, p.x, p.y, 0.95)) inCells.push(p);
        let x, y;
        if (inCells.length && SL.rng.chance(0.4)) { const p = SL.rng.pick(inCells); x = p.x; y = p.y; }
        else {
          const cs = d.cells.filter((c) => c.k > 0.5 && c.y > 60 && c.y < H - 60);
          const c = cs.length ? SL.rng.pick(cs) : null;
          if (c) { const a = SL.rng.next() * TAU, rd = Math.sqrt(SL.rng.next()) * c.r * 0.8; x = U.clamp(c.x + Math.cos(a) * rd, 30, W - 30); y = U.clamp(c.y + Math.sin(a) * rd, 40, H - 40); }
        }
        if (x != null) { d.strikes.push({ x, y, t: 0 }); sfx('storm_strike_warn', x); }
      }
    }
    for (let i = d.strikes.length - 1; i >= 0; i--) {
      const s = d.strikes[i];
      s.t += dt;
      if (s.t >= STRIKE_T) { d.strikes.splice(i, 1); ionStrike(h, s); }
    }
    for (let i = d.bolts.length - 1; i >= 0; i--) {
      const b = d.bolts[i];
      b.t += dt;
      b.rej -= dt;
      if (b.rej <= 0 && b.t < b.life * 0.7) {
        b.rej = 0.07;
        b.main = boltPath(b.main[0] + rr(-12, 12), -40, b.x, b.y, 6, 0.15);
      }
      if (b.t >= b.life) d.bolts.splice(i, 1);
    }
    if (d.ending && !alive && !d.strikes.length && !d.bolts.length) h.dead = true;
  }
  function ionDrawUnder(h, ctx) {
    const d = h.data, t = h.age;
    for (const c of d.cells) {
      if (c.k <= 0.01 || !onScreenish(c.x, c.y, c.r * 1.4)) continue;
      const sc = c.r / ION_R, k = c.k;
      const breathe = 1 + 0.025 * Math.sin(t * 0.9 + c.ph);
      A.drawSprite(ctx, 'hz:ion:cloud' + c.tex, c.x, c.y, c.rot1, sc * breathe, 0.95 * k);
      ctx.globalCompositeOperation = 'lighter';
      A.drawSprite(ctx, 'hz:ion:cloud' + ((c.tex + 1) % 3), c.x, c.y, c.rot2, sc * 0.92, 0.38 * k);
      A.drawGlow(ctx, c.x, c.y, c.r * 1.2, '#5f78e8', (0.1 + 0.03 * Math.sin(t * 1.7 + c.ph)) * k);
      for (const f of c.fl) {
        const q = 1 - f.t / f.life;
        A.drawGlow(ctx, c.x + f.x, c.y + f.y, f.s, '#9fb8ff', 0.16 * q * q * k);
      }
      ctx.globalCompositeOperation = 'lighter';
      A.drawSprite(ctx, 'hz:ion:edge0', c.x, c.y, -c.rot1 * 1.6, sc, (0.34 + 0.12 * Math.sin(t * 2.3 + c.ph)) * k);
      A.drawSprite(ctx, 'hz:ion:edge1', c.x, c.y, c.rot2 * 1.3 + 1, sc, (0.26 + 0.1 * Math.sin(t * 3.1 + c.ph * 2)) * k);
      if (c.arcs.length) {
        SL.render.setTransform(ctx, c.x, c.y, 0, 1, 1);
        ctx.globalCompositeOperation = 'lighter';
        for (const q of c.arcs) strokeBolt(ctx, q.pts, (1 - q.t / q.life) * 0.75 * k, 0.45);
        SL.render.resetTransform(ctx);
      }
    }
  }
  function ionDrawOver(h, ctx) {
    const d = h.data;
    ctx.globalCompositeOperation = 'lighter';
    for (const s of d.strikes) {
      const u = s.t / STRIKE_T, fl = u > 0.75 ? 0.6 + 0.4 * Math.sin(s.t * 60) : 1;
      // light shaft above the target, building toward the hit
      const col = A.get('hz:ion:col').canvas;
      ctx.globalAlpha = 0.1 + 0.22 * u * u;
      ctx.drawImage(col, s.x - 36, -20, 72, s.y + 20);
      ctx.globalAlpha = 1;
      A.drawGlow(ctx, s.x, s.y, STRIKE_R * 1.1, '#9fb8ff', (0.1 + 0.25 * u) * fl);
      A.drawSprite(ctx, 'hz:ion:dash', s.x, s.y, s.t * 1.6, 1 + 0.05 * Math.sin(s.t * 14), (0.65 + 0.35 * u) * fl);
      // countdown arc
      ctx.strokeStyle = 'rgba(235,242,255,0.9)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(s.x, s.y, STRIKE_R - 9, -Math.PI / 2, -Math.PI / 2 + u * TAU);
      ctx.stroke();
    }
    for (const b of d.bolts) {
      const q = 1 - b.t / b.life, a = q * (0.75 + 0.25 * Math.sin(b.t * 90));
      ctx.globalCompositeOperation = 'lighter';
      strokeBolt(ctx, b.main, a, 1.2);
      for (const f of b.forks) strokeBolt(ctx, f, a * 0.7, 0.7);
      ctx.globalAlpha = 1;
      A.drawGlow(ctx, b.x, b.y, 120 * (0.6 + 0.4 * q), '#cfe0ff', 0.7 * q);
    }
    ctx.globalAlpha = 1;
  }
  SL.hazards.define('ion_storm', {
    r: 0,
    manualMove: true,
    init: ionInit,
    update: ionUpdate,
    drawUnder: ionDrawUnder,
    drawOver: ionDrawOver,
    end(h) { h.data.ending = true; },
    onEnd(h) {
      loopStop(h.data.jam, 0.3);
      h.data.jam = null;
      for (const p of SL.world.players) if (p.data && p.data.ionJamT > 0.1) p.data.ionJamT = 0.1;
    },
  });

  // ================================================================== mine_field
  const MINE_TEXT = 'MINE FIELD: SHOOT THEM EARLY';
  const MN = { r: 18, hp: 20, arm: 110, fuse: 0.6, blast: 90, dmg: 18, edmg: 150, chain: 120, chainT: 0.12, score: 60, credits: [0, 1], rigBlast: 140, rigDmg: 600 };
  const MINE_FRAMES = 16;
  function drawMineFrame(ctx, w, h, th, gold) {
    const cx = w / 2, cy = h / 2, R = 13, tip = 23;
    const all = { x: 0, y: 0, w, h };
    // spikes around the rim (behind the body), lit from the upper left
    for (let k = 0; k < 8; k++) {
      const a = th + (k / 8) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const b0 = a - 0.3, b1 = a + 0.3;
      const p = A.poly([[cx + Math.cos(b0) * R * 0.86, cy + Math.sin(b0) * R * 0.86], [cx + ca * tip, cy + sa * tip], [cx + Math.cos(b1) * R * 0.86, cy + Math.sin(b1) * R * 0.86]]);
      A.metal(ctx, p, { base: gold ? '#7a6634' : '#5a6178', bounds: all, spec: 0.45, edge: 0.8, rimLight: 1.1, rimWidth: 0.8 });
      ctx.fillStyle = gold ? 'rgba(255,226,140,0.85)' : 'rgba(255,92,138,0.75)';
      ctx.beginPath(); ctx.arc(cx + ca * (tip - 1.2), cy + sa * (tip - 1.2), 1.1, 0, TAU); ctx.fill();
    }
    // the sphere
    const g = ctx.createRadialGradient(cx - 4.5, cy - 5.5, 1, cx, cy, R);
    g.addColorStop(0, gold ? '#b39a5e' : '#9aa3c2'); g.addColorStop(0.4, gold ? '#5a4a28' : '#424a63'); g.addColorStop(1, '#10121a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(4,5,8,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
    // key-light rim (upper left) and the faction-colored back rim (lower right)
    ctx.strokeStyle = gold ? 'rgba(255,224,150,0.7)' : 'rgba(190,204,240,0.65)';
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(cx, cy, R - 1, Math.PI * 0.95, Math.PI * 1.6); ctx.stroke();
    ctx.strokeStyle = gold ? 'rgba(255,200,90,0.75)' : 'rgba(255,70,120,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R - 0.9, -0.15, Math.PI * 0.62); ctx.stroke();
    const hs = ctx.createRadialGradient(cx - 5, cy - 6, 0, cx - 5, cy - 6, 4.5);
    hs.addColorStop(0, 'rgba(255,255,255,0.85)'); hs.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hs;
    ctx.beginPath(); ctx.arc(cx - 5, cy - 6, 4.5, 0, TAU); ctx.fill();
    // foreshortened spike stubs on the face (rotate with the mine)
    for (let k = 0; k < 4; k++) {
      const a = th + Math.PI / 8 + (k / 4) * TAU, sx = cx + Math.cos(a) * R * 0.56, sy = cy + Math.sin(a) * R * 0.56;
      const sg = ctx.createRadialGradient(sx - 1, sy - 1.2, 0.2, sx, sy, 2.8);
      sg.addColorStop(0, gold ? '#fff0c0' : '#c9d2ee'); sg.addColorStop(0.5, gold ? '#8a7440' : '#535a72'); sg.addColorStop(1, '#14161e');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(sx, sy, 2.8, 0, TAU); ctx.fill();
    }
    // seam ring and the lens socket
    ctx.strokeStyle = gold ? 'rgba(255,211,77,0.9)' : 'rgba(10,11,16,0.85)';
    ctx.lineWidth = gold ? 1.4 : 1.1;
    ctx.beginPath(); ctx.arc(cx, cy, 7.2, th, th + TAU * 0.82); ctx.stroke();
    if (gold) { ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 5; ctx.stroke(); ctx.shadowBlur = 0; }
    ctx.fillStyle = '#07080c';
    ctx.beginPath(); ctx.arc(cx, cy, 4.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = gold ? 'rgba(255,230,160,0.8)' : 'rgba(150,160,190,0.7)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  function mineKey(gold, f) {
    const key = 'hz:mine:' + (gold ? 'gold' : 'norm') + ':' + f;
    if (!A.has(key)) A.define(key, 52, 52, (ctx, w, h) => drawMineFrame(ctx, w, h, (f / MINE_FRAMES) * TAU, gold), { pad: 2 });
    return key;
  }
  function mineBlast(pr, scored) {
    const d = pr.data;
    if (d.boomed) return;
    d.boomed = true;
    pr.dead = true;
    const x = pr.x, y = pr.y, wd = SL.world, rig = d.rigged, R = rig ? MN.rigBlast : MN.blast;
    const h = d.field && !d.field.dead ? d.field : null;
    if (!rig) for (const p of wd.players) if (live(p) && U.dist2(p.x, p.y, x, y) < R * R) hurtPlayer(h || { age: 99, typeId: 'mine_field' }, p, MN.dmg, 'mine');
    for (const e of wd.enemies) {
      if (e.dead || e.dying) continue;
      if (wd.hitTest(e, x, y, R)) hurtEnemy(e, rig ? MN.rigDmg : MN.edmg, x, y);
    }
    for (const o of wd.props) {
      if (o === pr || o.dead || o.def !== MINE_PROP || o.data.boomed || o.data.chain > 0) continue;
      if (U.dist2(o.x, o.y, x, y) < MN.chain * MN.chain) { o.data.chain = MN.chainT; o.data.chainScored = scored; }
    }
    sfx('mine_blast', x);
    if (onScreenish(x, y, 100)) {
      SL.fx.explode(x, y, { size: rig ? 'l' : 'm', palette: rig ? 'gold' : 'enemy', sound: false, scale: rig ? 0.9 : 0.75 });
      SL.fx.shockwave(x, y, { radius: R * 1.15, duration: 0.38, strength: rig ? 1.1 : 0.8, color: rig ? '#ffd34d' : '#ff5c8a' });
      SL.fx.emit({ shape: 'ring', x, y, life: 0.3, size: R * 0.6, size2: R * 2.1, color: rig ? '#ffe9a0' : '#ff8ab0', alpha: 0.9, alpha2: 0 });
    }
    if (scored) { addScore(MN.score, x, y); dropCredits(x, y, MN.credits); }
  }
  /** Field mine prop: arms near jets (0.6 s fuse), chains, gold when rigged (enemy-only, r 140, 600). */
  const MINE_PROP = {
    shootable: true,
    isMine: true,
    init(pr, o) {
      const d = pr.data;
      pr.typeId = 'field_mine';
      pr.r = MN.r;
      pr.hp = pr.maxHp = Math.max(1, Math.round(MN.hp * (diff().enemyHp || 1)));
      d.field = o.field || null;
      d.rigged = !!o.rigged;
      d.goldK = d.rigged ? 1 : 0;
      d.tagT = -1;
      d.armed = false;
      d.fuse = 0;
      d.chain = 0;
      d.ph = rnd() * TAU;
      d.blink = rnd();
      d.drift = o.vy != null ? o.vy : 50;
      pr.rot = rnd() * TAU;
    },
    update(pr, dt) {
      const d = pr.data, wd = SL.world;
      const f = d.field && !d.field.dead ? d.field.data : null;
      const drift = f ? f.drift : d.drift;
      pr.vy = U.approach(pr.vy, drift, Math.max(60, Math.abs(drift - pr.vy) * 1.5) * dt);
      pr.vx = Math.sin(pr.age * 1.1 + d.ph) * 12;
      pr.rot = d.ph + Math.sin(pr.age * 0.8 + d.ph) * 0.55 + pr.age * 0.15;
      d.blink += dt;
      if (d.tagT >= 0) { d.tagT -= dt; if (d.tagT < 0) { d.goldK = 0.001; mineTagFx(pr); } }
      if (d.goldK > 0 && d.goldK < 1) d.goldK = Math.min(1, d.goldK + dt / 0.35);
      if (SL.world.beams.length) {
        const dps = beamDps(pr);
        if (dps > 0) { pr.hp -= dps * dt; pr.flash = 0.06; if (pr.hp <= 0) { mineBlast(pr, true); return; } }
      }
      if (d.chain > 0) { d.chain -= dt; if (d.chain <= 0) { mineBlast(pr, !!d.chainScored); return; } }
      if (d.rigged) {
        for (const e of wd.enemies) {
          if (e.dead || e.dying || e.intangible) continue;
          if (wd.hitTest(e, pr.x, pr.y, pr.r)) { mineBlast(pr, false); return; }
        }
        return;
      }
      if (d.armed) {
        d.fuse -= dt;
        if (d.fuse <= 0) mineBlast(pr, false);
        return;
      }
      if (d.field && d.field.age < GRACE) return;
      for (const p of wd.players) {
        if (live(p) && U.dist2(p.x, p.y, pr.x, pr.y) < MN.arm * MN.arm) {
          d.armed = true;
          d.fuse = MN.fuse;
          sfx('mine_arm', pr.x);
          break;
        }
      }
    },
    draw(pr, ctx) {
      const d = pr.data, x = pr.x, y = pr.y;
      const step = TAU / MINE_FRAMES;
      let a = pr.rot % TAU;
      if (a < 0) a += TAU;
      let fi = Math.round(a / step);
      const rem = a - fi * step;
      fi %= MINE_FRAMES;
      const g = d.goldK;
      if (g < 1) A.drawGlow(ctx, x, y, 34, '#ff3b6b', (0.1 + 0.05 * Math.sin(pr.age * 2.4 + d.ph)) * (1 - g));
      if (g > 0) A.drawGlow(ctx, x, y, 34 + 4 * Math.sin(pr.age * 3 + d.ph), '#ffd34d', 0.2 * g);
      if (g < 1) A.drawSprite(ctx, mineKey(false, fi), x, y, rem, 1, pr.alpha);
      if (g > 0) A.drawSprite(ctx, mineKey(true, fi), x, y, rem, 1, pr.alpha * g);
      if (pr.flash > 0) A.drawFlash(ctx, mineKey(g >= 1, fi), x, y, rem, 1, 0.5);
      // blinking light: slow pink pulse; fast when armed; steady when a chain is about to take it
      const col = g >= 0.5 ? '#ffd34d' : '#ff3b6b';
      let on;
      if (d.armed || d.chain > 0) on = d.chain > 0 || Math.floor(d.blink * 12) % 2 === 0;
      else on = (d.blink % (g >= 0.5 ? 1.6 : 1.1)) < 0.16;
      const la = on ? 1 : 0.28;
      A.drawGlow(ctx, x, y, on ? 20 : 9, col, la);
      A.drawGlow(ctx, x, y, 5, '#ffffff', on ? 0.9 : 0.25);
      if (d.armed && !d.rigged) {
        // blast-radius ring while the fuse burns
        const u = 1 - d.fuse / MN.fuse;
        ctx.globalCompositeOperation = 'lighter';
        A.drawSprite(ctx, A.ring('#ff5c8a', 64, 3), x, y, 0, (MN.blast * (0.92 + 0.08 * u)) / 64, 0.25 + 0.55 * u);
      }
      if (g >= 1) {
        ctx.globalCompositeOperation = 'lighter';
        A.drawSprite(ctx, 'hz:ion:dash', x, y, pr.age * 0.8, 0.45, 0.22 + 0.1 * Math.sin(pr.age * 4 + d.ph));
      }
    },
    onDeath(pr) { mineBlast(pr, true); },
  };
  function mineTagFx(pr) {
    if (!onScreenish(pr.x, pr.y, 40)) return;
    SL.fx.sparks(pr.x, pr.y, { count: 10, color: '#ffe9a0', speed: 260, life: 0.35 });
    SL.fx.emit({ shape: 'ring', x: pr.x, y: pr.y, life: 0.4, size: 20, size2: 90, color: '#ffd34d', alpha: 0.9, alpha2: 0 });
  }
  function mfRig(h) {
    if (!h || !h.data) return;
    const d = h.data;
    d.rigged = true;
    for (const pr of SL.world.props) {
      if (pr.dead || pr.def !== MINE_PROP || pr.data.field !== h || pr.data.rigged) continue;
      pr.data.rigged = true;
      pr.data.armed = false;
      pr.data.tagT = rr(0, 0.5);
    }
  }
  function mfSetDrift(h, px) {
    if (!h || !h.data || !isFinite(px)) return;
    h.data.drift = +px;
  }
  function mfInit(h, o) {
    const d = h.data;
    d.count = Math.max(1, (o.count != null ? o.count : 12) | 0);
    d.duration = Math.max(0, o.duration != null ? +o.duration : 20);
    d.drift = o.drift != null ? +o.drift : 50;
    d.rigged = !!o.rigged;
    d.spawned = 0;
    d.lanes = [];
    d.last = [];
    h.x = W / 2; h.y = 0; h.vx = 0; h.vy = 0;
    warn(h, MINE_TEXT);
  }
  function mfUpdate(h, dt) {
    const d = h.data;
    while (d.spawned < d.count && h.age >= 0.4 + (d.count > 1 ? (d.spawned * d.duration) / d.count : 0)) {
      if (!d.lanes.length) { for (let i = 0; i < 7; i++) d.lanes.push(i); for (let i = 6; i > 0; i--) { const j = SL.rng.int(0, i); const t = d.lanes[i]; d.lanes[i] = d.lanes[j]; d.lanes[j] = t; } }
      const lane = d.lanes.pop();
      let x = 60 + ((W - 120) * (lane + SL.rng.range(0.15, 0.85))) / 7;
      for (const q of d.last) if (Math.abs(q - x) < 70) x = U.clamp(x + 80 * SL.rng.sign(), 50, W - 50);
      d.last.push(x);
      if (d.last.length > 2) d.last.shift();
      SL.spawnProp(MINE_PROP, { x, y: -26 - SL.rng.range(0, 30), vy: d.drift, field: h, rigged: d.rigged });
      d.spawned++;
    }
    if (d.spawned >= d.count) {
      let any = false;
      for (const pr of SL.world.props) if (!pr.dead && pr.def === MINE_PROP && pr.data.field === h) { any = true; break; }
      if (!any) h.dead = true;
    }
  }
  SL.hazards.define('mine_field', {
    r: 0,
    manualMove: true,
    init: mfInit,
    update: mfUpdate,
    rig: mfRig,
    setDrift: mfSetDrift,
    end(h) { h.data.count = h.data.spawned; },
  });

  // ================================================================== wormhole
  const WH_TEXT = 'WORMHOLE: WHAT GOES IN COMES OUT';
  const WH = { r: 46, enter: 30, exit: 36, open: 1.0, close: 0.8, cool: 0.4, jetCool: 0.6, jetIframes: 0.3, ripple: 1.2, lens: 0.35 };
  const WH_COL = ['#9fe8ff', '#ffb070'];
  function defineWormholeArt() {
    // swirling interior: logarithmic spiral arms with wispy noise, bright toward the rim, dark throat
    defineCanvas('hz:wh:swirl', 256, () => {
      const ns = A.noise(128, 64, { scale: 16, octaves: 4, seed: 88, gain: 0.55 });
      const deep = C.parse('#2a3a6a'), mid = C.parse('#6f8fd8'), hi = C.parse('#d8e6ff');
      return polarTexture(256, (rho, u, out) => {
        if (rho > 0.99) return;
        const ph = u * TAU * 3 + Math.log(rho + 0.04) * 4.2;
        const arm = 0.5 + 0.5 * Math.cos(ph);
        const wisp = nsample(ns, 128, 64, (u + Math.log(rho + 0.04) * 0.22) * 128, rho * 40);
        const prof = U.smoothstep(0.08, 0.7, rho) * (1 - U.smoothstep(0.88, 0.99, rho));
        const v = prof * (0.25 + 0.75 * Math.pow(arm, 2.2)) * (0.45 + 0.8 * wisp);
        if (v < 0.01) return;
        const c = U.clamp(v * 1.25, 0, 1);
        const c0 = c < 0.6 ? deep : mid, c1 = c < 0.6 ? mid : hi, f = c < 0.6 ? c / 0.6 : (c - 0.6) / 0.4;
        out[0] = c0[0] + (c1[0] - c0[0]) * f; out[1] = c0[1] + (c1[1] - c0[1]) * f; out[2] = c0[2] + (c1[2] - c0[2]) * f;
        out[3] = Math.min(255, v * 255);
      });
    });
    A.define('hz:wh:core', 128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(1,2,6,1)'); g.addColorStop(0.35, 'rgba(4,7,20,1)'); g.addColorStop(0.72, 'rgba(18,28,64,0.98)');
      g.addColorStop(0.9, 'rgba(42,58,106,0.9)'); g.addColorStop(1, 'rgba(42,58,106,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { pad: 0 });
    // energetic rim per portal color: razor edge + flickering corona
    WH_COL.forEach((col, i) => {
      defineCanvas('hz:wh:rim' + i, 256, () => {
        const ne = A.noise(128, 16, { scale: 16, octaves: 4, seed: 140 + i });
        const c = C.parse(col);
        return polarTexture(256, (rho, u, out) => {
          const rp = rho * 128, nv = nsample(ne, 128, 16, u * 128, 3);
          const z = (rp - 92) / 2.2, zo = (rp - 96 - 6 * nv) / (7 + 6 * nv), zi = (rp - 84) / 9;
          const a = Math.exp(-z * z) + 0.5 * Math.exp(-zo * zo) * (0.4 + 0.6 * nv) + 0.16 * Math.exp(-zi * zi);
          if (a < 0.01) return;
          const wt = Math.exp(-z * z);
          out[0] = c[0] + (255 - c[0]) * wt * 0.85; out[1] = c[1] + (255 - c[1]) * wt * 0.85; out[2] = c[2] + (255 - c[2]) * wt * 0.85;
          out[3] = Math.min(255, a * 255);
        });
      });
    });
  }
  defineWormholeArt();

  function whInit(h, o) {
    const d = h.data;
    const a = Array.isArray(o.a) ? o.a : [180, 380], b = Array.isArray(o.b) ? o.b : [540, 900];
    d.P = [
      { x: +a[0], y: +a[1], col: WH_COL[0], flash: 0, rip: [], ripT: 0, spin: rnd() * TAU, sp: [] },
      { x: +b[0], y: +b[1], col: WH_COL[1], flash: 0, rip: [], ripT: WH.ripple / 2, spin: rnd() * TAU, sp: [] },
    ];
    d.life = o.life || 0;
    d.bullets = o.bullets === 'enemy' || o.bullets === 'none' ? o.bullets : 'both';
    d.players = o.players !== false;
    d.state = 'open';
    d.k = 0;
    d.sfxT = 0;
    h.x = (d.P[0].x + d.P[1].x) / 2;
    h.y = (d.P[0].y + d.P[1].y) / 2;
    h.vx = 0; h.vy = 0;
    warn(h, WH_TEXT);
    sfx('wormhole_open', h.x);
  }
  function whClose(h) {
    const d = h.data;
    if (d.state === 'close') return;
    d.state = 'close';
  }
  /** Moves o from portal i to the other one: 36 px beyond it along its velocity, velocity kept. */
  function whMove(h, o, i, kind) {
    const d = h.data, A0 = d.P[i], B0 = d.P[1 - i];
    let vx = o.vx || 0, vy = o.vy || 0;
    if (kind === 'player') { vx += (o.push && o.push.x) || 0; vy += (o.push && o.push.y) || 0; }
    const sp = Math.sqrt(vx * vx + vy * vy);
    let ux, uy;
    if (sp > 1) { ux = vx / sp; uy = vy / sp; } else {
      const dx = o.x - A0.x, dy = o.y - A0.y, l = Math.sqrt(dx * dx + dy * dy);
      if (l > 0.5) { ux = dx / l; uy = dy / l; } else { ux = 0; uy = 1; }
    }
    const nx = B0.x + ux * WH.exit, ny = B0.y + uy * WH.exit, ddx = nx - o.x, ddy = ny - o.y;
    o.x = nx; o.y = ny;
    if (o.px != null) { o.px = nx; o.py = ny; }
    if (o.bx != null) { o.bx += ddx; o.by += ddy; }
    if (o.lx != null) { o.lx = nx; o.ly = ny; }
    A0.flash = Math.min(1, A0.flash + 0.5);
    B0.flash = Math.min(1, B0.flash + 0.5);
    const now = SL.world.t;
    const big = kind !== 'ebullet' && kind !== 'pbullet';
    if (big || now - d.sfxT > 0.08) { d.sfxT = now; sfx('wormhole_warp', nx, big ? 1 : 0.4); }
    if (big || rnd() < 0.35) {
      SL.fx.sparks(nx, ny, { count: big ? 12 : 3, color: B0.col, speed: big ? 320 : 200, angle: Math.atan2(uy, ux), spread: 1.4, life: 0.3 });
      SL.fx.emit({ x: A0.x, y: A0.y, life: 0.25, size: big ? 70 : 30, size2: 6, color: A0.col, alpha: 0.6, alpha2: 0 });
      SL.fx.emit({ x: B0.x, y: B0.y, life: 0.3, size: 10, size2: big ? 90 : 40, color: B0.col, alpha: 0.6, alpha2: 0 });
    }
    if (big) SL.bus.emit('wormholeWarp', { h, obj: o, kind, from: i, x: nx, y: ny });
  }
  function whScan(h, list, kind, cool, filter) {
    const d = h.data, P = d.P, now = SL.world.t, r2 = WH.enter * WH.enter;
    for (let n = 0; n < list.length; n++) {
      const o = list[n];
      if (o.dead || (filter && !filter(o))) continue;
      for (let i = 0; i < 2; i++) {
        const dx = o.x - P[i].x, dy = o.y - P[i].y;
        if (dx * dx + dy * dy >= r2) continue;
        const od = dataOf(o);
        if (od.whT > now) break;
        whMove(h, o, i, kind);
        od.whT = now + cool;
        if (kind === 'player') o.invuln = Math.max(o.invuln || 0, WH.jetIframes);
        break;
      }
    }
  }
  function isWarper(e) { return !e.isBoss && (e.typeId === 'warper' || e.useWormholes || (e.def && e.def.useWormholes)); }
  function whUpdate(h, dt) {
    const d = h.data, wd = SL.world;
    if (d.state === 'open') { d.k = Math.min(1, d.k + dt / WH.open); if (d.k >= 1) d.state = 'live'; }
    else if (d.state === 'close') { d.k = Math.max(0, d.k - dt / WH.close); if (d.k <= 0) { h.dead = true; return; } }
    if (d.life > 0 && h.age >= d.life && d.state !== 'close') whClose(h);
    const k = d.k;
    for (const P of d.P) {
      P.spin += dt * (1.6 + 0.8 * P.flash);
      P.flash = Math.max(0, P.flash - dt * 2.5);
      P.ripT -= dt;
      if (P.ripT <= 0 && k > 0.3) { P.ripT += WH.ripple; P.rip.push(0); }
      for (let i = P.rip.length - 1; i >= 0; i--) {
        P.rip[i] += dt;
        const u = P.rip[i] / 0.9;
        if (u >= 1) { P.rip.splice(i, 1); continue; }
        SL.render.addRipple(P.x, P.y, WH.r * k * (1 + 2.3 * u), 7 * (1 - u) * k, 26);
      }
      if (k > 0.05) SL.render.addLens(P.x, P.y, WH.r * 0.26 * k, WH.lens * k);
      // infalling motes (cosmetic)
      if (P.sp.length < 18 && rnd() < dt * 22 * k) P.sp.push({ a: rnd() * TAU, r: WH.r * rr(1.25, 2.1), w: rr(1.6, 2.6), t: 0 });
      for (let i = P.sp.length - 1; i >= 0; i--) {
        const s = P.sp[i];
        s.t += dt;
        s.a += s.w * dt * (WH.r * 1.6 / s.r);
        s.r -= dt * (28 + 60 / Math.max(0.3, s.r / WH.r));
        if (s.r < WH.r * 0.55) P.sp.splice(i, 1);
      }
    }
    if (d.state !== 'live') return;
    if (d.players) whScan(h, wd.players, 'player', WH.jetCool, live);
    if (d.bullets !== 'none') whScan(h, wd.ebullets, 'ebullet', WH.cool);
    if (d.bullets === 'both') whScan(h, wd.pbullets, 'pbullet', WH.cool);
    whScan(h, wd.pods, 'pod', WH.cool);
    whScan(h, wd.pickups, 'pickup', WH.cool);
    whScan(h, wd.enemies, 'enemy', WH.cool, isWarper);
  }
  function whDrawUnder(h, ctx) {
    const d = h.data, k = d.k;
    if (k <= 0.005) return;
    const ko = d.state === 'close' ? EZ.inCubic(k) : EZ.outBack(Math.min(1, k));
    const gl = SL.render.distortion;
    for (let i = 0; i < 2; i++) {
      const P = d.P[i], x = P.x, y = P.y, R = WH.r * Math.max(0, ko), other = d.P[1 - i];
      if (!onScreenish(x, y, R * 3)) continue;
      // outer scattered glow and ripple rings
      A.drawGlow(ctx, x, y, R * 2.6, P.col, (0.13 + 0.12 * P.flash) * k);
      ctx.globalCompositeOperation = 'lighter';
      for (const t of P.rip) {
        const u = t / 0.9, rad = WH.r * k * (1 + 2.3 * u);
        A.drawSprite(ctx, A.ring(P.col, 64, 2.5), x, y, 0, rad / 64, (gl ? 0.18 : 0.32) * (1 - u) * (1 - u) * k);
      }
      // interior: dark well, two counter-rotating swirl layers, a glimpse of the other side in the throat
      ctx.globalCompositeOperation = 'source-over';
      A.drawSprite(ctx, 'hz:wh:core', x, y, 0, (R * 1.02) / 64, Math.min(1, k * 1.4));
      ctx.globalCompositeOperation = 'lighter';
      A.drawSprite(ctx, 'hz:wh:swirl', x, y, P.spin, (R * 0.98) / 128, 0.95 * k);
      A.drawSprite(ctx, 'hz:wh:swirl', x, y, -P.spin * 0.55 + 1.3, (R * 0.8) / 128, 0.4 * k);
      A.drawGlow(ctx, x, y, R * 0.5, other.col, (0.22 + 0.1 * Math.sin(h.age * 5 + i)) * k);
      A.drawGlow(ctx, x, y, R * 0.16, '#ffffff', 0.35 * k);
      // rim
      A.drawSprite(ctx, 'hz:wh:rim' + i, x, y, -P.spin * 0.35, R / 92, Math.min(1, (0.9 + 0.3 * P.flash) * k));
      A.drawSprite(ctx, 'hz:wh:rim' + i, x, y, P.spin * 0.5 + 2, (R * 1.04) / 92, 0.35 * k);
      // motes spiralling into the rim
      for (const s of P.sp) {
        const px2 = x + Math.cos(s.a) * s.r * ko, py2 = y + Math.sin(s.a) * s.r * ko;
        const a = Math.min(1, s.t * 4) * U.clamp((s.r / WH.r - 0.55) * 2, 0, 1);
        A.drawGlow(ctx, px2, py2, 7, P.col, 0.8 * a * k);
      }
    }
  }
  SL.hazards.define('wormhole', {
    r: WH.r,
    manualMove: true,
    init: whInit,
    update: whUpdate,
    drawUnder: whDrawUnder,
    end: whClose,
    close: whClose,
  });

  // ================================================================== public helpers
  /** Graceful end: black holes collapse (or release when carried), storms stop, portals close, fields fade. */
  SL.hazards.end = function (h) {
    if (!h || h.dead) return;
    const def = h.def;
    if (def && typeof def.end === 'function') {
      try { def.end(h); return; } catch (err) { report('hazard end', err); }
    }
    h.dead = true;
  };
  /** Every live gravity source: hazards' h.gravity plus enemies' and bosses' gravity / gravityList. */
  SL.hazards.gravitySources = function (out) {
    out = out || [];
    for (const h of SL.world.hazards) if (!h.dead && h.gravity && h.gravity.pull > 0) out.push(h.gravity);
    for (const e of SL.world.enemies) {
      if (e.dead) continue;
      if (e.gravity && e.gravity.pull > 0) out.push(e.gravity);
      if (Array.isArray(e.gravityList)) for (const g of e.gravityList) if (g && g.pull > 0) out.push(g);
    }
    return out;
  };
  /** Spawns a prop_shade_rock: opts {r (60-90), vy (35-40), vx, skin 'rock'|'mirror', life (s, 0 = until it leaves),
      targetY (eases in from above, then drifts)}. Blocks bullets both ways, cannot be destroyed, eases jets aside. */
  SL.hazards.shadeRock = shadeRock;
  /** Shade test of GDD 9.4: true when a shade source lies between (x, y) and the `from` edge within 700 px. */
  SL.hazards.shaded = function (x, y, from) { return shadedBy(shadeSources(SHADE_TMP), x, y, FL_DIR[from] || FL_DIR.left); };
  const SHADE_TMP = [];
  /** Flat [x, y, r, ...] list of shade sources (shade rocks, heavy enemies, boss circles). */
  SL.hazards.shadeSources = function (out) { return shadeSources(out || []); };
  /** Rigs every live mine field (s3 rig_mines) / sets every field's drift (s3 mines_drift). */
  SL.hazards.rigMines = function () { for (const h of SL.world.hazards) if (!h.dead && h.typeId === 'mine_field') mfRig(h); };
  SL.hazards.setMineDrift = function (px) { for (const h of SL.world.hazards) if (!h.dead && h.typeId === 'mine_field') mfSetDrift(h, px); };
  /** Open wormhole pairs: [{h, a: {x, y}, b: {x, y}, open (transporting now), r}] (warpers path toward them). */
  SL.hazards.portals = function (out) {
    out = out || [];
    for (const h of SL.world.hazards) {
      if (h.dead || h.typeId !== 'wormhole') continue;
      const P = h.data.P;
      out.push({ h, a: { x: P[0].x, y: P[0].y }, b: { x: P[1].x, y: P[1].y }, open: h.data.state === 'live', r: WH.enter });
    }
    return out;
  };
  /** Hazard-owned prop defs (rocks, field mines, shade rocks), for type checks: pr.def === SL.hazards.propDefs.rock. */
  SL.hazards.propDefs = { rock: ROCK_PROP, mine: MINE_PROP, prop_shade_rock: SHADE_PROP };
  SL.hazards.tables = { BH, ROCK, MN, WH };

  // ================================================================== sandboxes
  // a plain sandbox drone (used only when the enemies module has no 'gnat' yet)
  A.define('hz:sb:drone', 40, 36, (ctx, w, h) => {
    const p = A.symPath(w / 2, [[0, 33], [9, 22], [18, 8], [12, 4], [5, 9], [3, 2]]);
    A.metal(ctx, p, { base: SL.pal.enemy.hull2 });
    A.emissive(ctx, A.symPath(w / 2, [[0, 26], [3, 18], [0, 12]]), SL.pal.enemy.seam, 6);
  });
  const SB_DRONE = { name: 'Sandbox drone', hp: 40, r: 15, score: 50, credits: [0, 1], sprite: 'hz:sb:drone', offscreenKill: true };
  function sbEnemy(x, y, vx, vy) {
    if (SL.enemies.has('gnat')) return SL.spawnEnemy('gnat', { x, y, vx, vy, drop: false });
    const e = SL.spawnEnemy(SB_DRONE, { x, y, vx, vy, drop: false });
    e.rot = Math.atan2(vy, vx) - Math.PI / 2;
    return e;
  }
  function sbBullets(x, y, angle, n, spread, speed, color) {
    for (let i = 0; i < n; i++) {
      const a = angle + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
      SL.fireEnemy(x, y, a, speed, 'orb', { color: color || SL.pal.ebullet.pink });
    }
  }
  function keepHazard(id, opts, gap) {
    let h = null, wait = 0.2;
    return (dt) => {
      if (h && !h.dead) return h;
      wait -= dt;
      if (wait <= 0) { h = SL.spawnHazard(id, typeof opts === 'function' ? opts() : Object.assign({}, opts)); wait = gap || 1.5; }
      return h;
    };
  }

  // black holes: bullets streaming past, drones and credits falling in
  function bhSandbox(opts, extra) {
    return () => {
      const keep = keepHazard('black_hole', opts, 1.2);
      let ft = 0.4, et = 1.2, ct = 0.8, side = 0;
      return (dt) => {
        const h = keep(dt);
        if (extra) extra(dt, h);
        ft -= dt;
        if (ft <= 0) {
          ft = 0.5;
          side ^= 1;
          sbBullets(side ? 90 : 630, 60, side ? 1.05 : Math.PI - 1.05, 3, 0.18, 230, side ? SL.pal.ebullet.pink : SL.pal.ebullet.orange);
        }
        et -= dt;
        if (et <= 0) { et = 1.7; const l = SL.rng.chance(0.5); sbEnemy(l ? -20 : W + 20, 260 + SL.rng.next() * 380, l ? 150 : -150, 50); }
        ct -= dt;
        if (ct <= 0) { ct = 1.1; SL.world.spawnPickup('credit', 120 + SL.rng.next() * 480, -10, { vy: 60 }); }
      };
    };
  }
  SL.debug.sandbox('hazard:black_hole', bhSandbox({ size: 'medium', x: 360, y: 470, fixed: true, life: 0 }), { name: 'Black hole (medium)', god: true });
  SL.debug.sandbox('hazard:black_hole:small', bhSandbox({ size: 'small', x: 360, y: 470, fixed: true, life: 0 }), { name: 'Black hole (small)', god: true });
  SL.debug.sandbox('hazard:black_hole:medium', bhSandbox({ size: 'medium', x: 360, y: 470, fixed: true, life: 0 }), { name: 'Black hole (medium)', god: true });
  SL.debug.sandbox('hazard:black_hole:large', bhSandbox({ size: 'large', x: 360, y: 470, fixed: true, life: 0 }), { name: 'Black hole (large)', god: true });
  SL.debug.sandbox('hazard:black_hole:drift', bhSandbox({ size: 'small', x: 360, y: -120, vy: 55, life: 26 }), { name: 'Black hole (m2 drifter)', god: true });
  SL.debug.sandbox('hazard:black_hole:binary', bhSandbox({ size: 'medium', binary: { cx: 360, cy: 500, r: 170, w: 0.35, vy: 0 }, life: 0 }), { name: 'Binary black holes', god: true });
  // tug-carried hole: the carrier dies after 5 s, the hole drifts down and collapses 6 s later
  SL.debug.sandbox('hazard:black_hole:tug', () => {
    let h = null, carrier = null, t = 0;
    const CARRIER = { name: 'Sandbox tug', hp: 999999, r: 40, sprite: 'hz:sb:drone', scale: 2.4, offscreenKill: false, noClear: true,
      update(e, dt) { e.data.t = (e.data.t || 0) + dt; e.vx = Math.cos(e.data.t * 0.7) * 70; e.vy = e.y < 260 ? 80 : 0; } };
    return (dt) => {
      t += dt;
      if (!h || h.dead) {
        if (t < 1) return;
        carrier = SL.spawnEnemy(CARRIER, { x: 360, y: -40, noCount: true, drop: false });
        h = SL.spawnHazard('black_hole', { size: 'medium', attachTo: carrier, offsetX: 0, offsetY: 120 });
        t = 0;
      }
      if (carrier && !carrier.dead && t > 5) { SL.fx.explode(carrier.x, carrier.y, { size: 'l', palette: 'violet' }); SL.world.kill ? SL.world.kill(carrier) : (carrier.dead = true); }
    };
  }, { name: 'Black hole carried, released and collapsing', god: true });

  // asteroid storms: a turret line fires down into the rocks (they eat bullets both ways)
  function stormSandbox(o) {
    return () => {
      const keep = keepHazard('asteroid_storm', Object.assign({ duration: 0, density: 1.25 }, o), 1);
      let ft = 1.2;
      return (dt) => {
        keep(dt);
        ft -= dt;
        if (ft <= 0) { ft = 0.9; sbBullets(120 + SL.rng.next() * 480, -10, Math.PI / 2, 5, 0.7, 220); }
      };
    };
  }
  SL.debug.sandbox('hazard:asteroid_storm', stormSandbox({ variant: 'rock' }), { name: 'Asteroid storm (rock)', god: true, autopilot: true });
  SL.debug.sandbox('hazard:asteroid_storm:rock', stormSandbox({ variant: 'rock' }), { name: 'Asteroid storm (rock)', god: true, autopilot: true });
  SL.debug.sandbox('hazard:asteroid_storm:ice', stormSandbox({ variant: 'ice' }), { name: 'Asteroid storm (ice)', god: true, autopilot: true });
  SL.debug.sandbox('hazard:asteroid_storm:debris', stormSandbox({ variant: 'debris' }), { name: 'Asteroid storm (debris)', god: true, autopilot: true });
  SL.debug.sandbox('hazard:asteroid_storm:ul', stormSandbox({ variant: 'rock', dir: 'ul' }), { name: 'Asteroid storm from the upper left', god: true, autopilot: true });

  SL.debug.sandbox('hazard:ion_storm', () => {
    const keep = keepHazard('ion_storm', { cells: 3, duration: 0, strikeEvery: 1.4 }, 1);
    let et = 1;
    return (dt) => {
      keep(dt);
      et -= dt;
      if (et <= 0) { et = 1.5; const l = SL.rng.chance(0.5); sbEnemy(l ? -20 : W + 20, 200 + SL.rng.next() * 500, l ? 160 : -160, 30); }
    };
  }, { name: 'Ion storm', god: true, autopilot: true });

  function flareSandbox(from) {
    return () => {
      const keep = keepHazard('solar_flare', { from, count: 4, every: 7, first: 1, cover: 2 }, 0.5);
      let et = 1.5;
      return (dt) => {
        keep(dt);
        et -= dt;
        if (et <= 0) { et = 2; const l = SL.rng.chance(0.5); sbEnemy(l ? -20 : W + 20, 150 + SL.rng.next() * 400, l ? 120 : -120, 40); }
      };
    };
  }
  SL.debug.sandbox('hazard:solar_flare', flareSandbox('left'), { name: 'Solar flare (left)', god: true });
  SL.debug.sandbox('hazard:solar_flare:left', flareSandbox('left'), { name: 'Solar flare (left)', god: true });
  SL.debug.sandbox('hazard:solar_flare:right', flareSandbox('right'), { name: 'Solar flare (right)', god: true });
  SL.debug.sandbox('hazard:solar_flare:top', flareSandbox('top'), { name: 'Solar flare (top)', god: true });

  function mineSandbox(o, script) {
    return () => {
      const keep = keepHazard('mine_field', Object.assign({ count: 22, duration: 22, drift: 50 }, o), 1);
      let et = 2, t = 0;
      return (dt) => {
        const h = keep(dt);
        t += dt;
        if (script) script(h, t);
        et -= dt;
        if (o.rigged && et <= 0) { et = 1.3; const l = SL.rng.chance(0.5); sbEnemy(l ? -20 : W + 20, 120 + SL.rng.next() * 500, l ? 170 : -170, 20); }
      };
    };
  }
  SL.debug.sandbox('hazard:mine_field', mineSandbox({}), { name: 'Mine field', god: true, autopilot: true });
  SL.debug.sandbox('hazard:mine_field:rigged', mineSandbox({ rigged: true, drift: 60 }), { name: 'Mine field (rigged)', god: true });
  SL.debug.sandbox('hazard:mine_field:rig', mineSandbox({}, (h, t) => {
    if (!h || h.dead || !h.data) return;
    if (t > 6 && !h.data.rigged) SL.hazards.get('mine_field').rig(h);
    if (t > 10 && h.data.drift < 160) SL.hazards.get('mine_field').setDrift(h, 160);
  }), { name: 'Mine field rigged at 6 s, drifting at 160 px/s from 10 s', god: true });

  SL.debug.sandbox('hazard:wormhole', () => {
    const keep = keepHazard('wormhole', { a: [200, 400], b: [520, 880], life: 0 }, 1);
    let ft = 1.2, ct = 1, et = 2;
    return (dt) => {
      keep(dt);
      ft -= dt;
      if (ft <= 0) { ft = 0.35; SL.fireEnemy(200 + SL.rng.range(-14, 14), -10, Math.PI / 2, 260, 'orb', { color: SL.pal.ebullet.pink }); }
      ct -= dt;
      if (ct <= 0) { ct = 0.9; SL.world.spawnPickup('credit', 200 + SL.rng.range(-10, 10), 300, { vy: 90 }); }
      et -= dt;
      if (et <= 0) { et = 2.4; sbEnemy(-20, 400, 180, 0); }
    };
  }, { name: 'Wormhole', god: true });

  SL.debug.sandbox('hazard:prop_shade_rock', () => {
    let made = false, ft = 1;
    return (dt) => {
      if (!made) {
        made = true;
        shadeRock(200, 420, { r: 84, vy: 0 });
        shadeRock(520, 560, { r: 66, vy: 0 });
        shadeRock(330, 800, { r: 76, vy: 0, skin: 'mirror' });
      }
      ft -= dt;
      if (ft <= 0) { ft = 0.6; sbBullets(360, -10, Math.PI / 2, 9, 1.1, 230); }
    };
  }, { name: 'Shade rocks (rock and mirror)', god: true });
})(window.SL = window.SL || {});
