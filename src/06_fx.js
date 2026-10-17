/* 06_fx.js (core)
   Provides: SL.fx = { emit(p), explode(x, y, {size, palette, debris, shake, sound, scale}), hit(x, y, color, {dir}),
   sparks(x, y, {count, color, speed, angle, spread, life, size}), shockwave(x, y, {radius, duration, strength,
   ring, color}), shake(px, seconds), flash(color, alpha, seconds), chromatic(amount, seconds), hitstop(seconds),
   slowmo(scale, seconds),
   text(x, y, str, {color, size, life, rise, font}), update(dt), realUpdate(realDt), draw(ctx), clear(),
   count(), setCap(n), cap, shakeOffset(), timeScale(), hitstopLeft(), PALETTES }.
   Particles live in one pooled ring buffer (cap 2500 / 1600 / 900 by quality; the oldest is dropped
   when full). Sprites per shape and color are generated once. Normal-blend particles (smoke, debris)
   draw before additive ones. Shake, flash, hit-stop and slow-mo run on real time. */
(function (SL) {
  'use strict';

  const U = SL.util, C = SL.color;
  const TAU = Math.PI * 2;
  const rnd = Math.random;
  const rr = (a, b) => a + (b - a) * rnd();

  // ------------------------------------------------------------------ sprites
  const SHAPES = { glow: 0, spark: 1, square: 2, ring: 3, smoke: 4, debris: 5, sprite: 6, fire: 7 };
  const spriteCache = new Map();

  function qColor(c) {
    const p = C.parse(c);
    return C.toHex(p[0] & 0xf8, p[1] & 0xf8, p[2] & 0xf8);
  }

  function makeShape(shape, color) {
    const A = SL.art;
    if (shape === SHAPES.glow) return A.glow(color, 32);
    if (shape === SHAPES.ring) return A.ring(color, 64, 5);
    if (shape === SHAPES.spark) {
      const c = A.canvas(64, 16), x = c.getContext('2d');
      x.translate(32, 8);
      x.scale(4, 1);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 8);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.28, C.rgba(C.mix(color, '#ffffff', 0.5), 0.95));
      g.addColorStop(0.6, C.rgba(color, 0.55));
      g.addColorStop(1, C.rgba(color, 0));
      x.fillStyle = g;
      x.beginPath();
      x.arc(0, 0, 8, 0, TAU);
      x.fill();
      return c;
    }
    if (shape === SHAPES.square) {
      const c = A.canvas(16, 16), x = c.getContext('2d');
      x.fillStyle = color;
      x.fillRect(2, 2, 12, 12);
      x.fillStyle = C.rgba('#ffffff', 0.55);
      x.fillRect(4, 4, 6, 6);
      return c;
    }
    if (shape === SHAPES.smoke) {
      const c = A.canvas(64, 64), x = c.getContext('2d');
      const mask = smokeMask();
      x.drawImage(mask, 0, 0);
      x.globalCompositeOperation = 'source-in';
      const g = x.createLinearGradient(8, 8, 56, 56);
      g.addColorStop(0, C.lighten(color, 0.22));
      g.addColorStop(1, C.darken(color, 0.3));
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      return c;
    }
    if (shape === SHAPES.fire) {
      const c = A.canvas(64, 64), x = c.getContext('2d');
      x.drawImage(fireMask(), 0, 0);
      x.globalCompositeOperation = 'source-in';
      const g = x.createRadialGradient(28, 26, 2, 32, 32, 34);
      g.addColorStop(0, C.mix(color, '#ffffff', 0.5));
      g.addColorStop(0.55, color);
      g.addColorStop(1, C.darken(color, 0.35));
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      return c;
    }
    if (shape === SHAPES.debris) {
      const out = [];
      for (let v = 0; v < 4; v++) {
        const c = A.canvas(24, 24), x = c.getContext('2d');
        const n = 3 + v % 3, pts = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rr(-0.4, 0.4);
          const r = rr(5, 10.5);
          pts.push(12 + Math.cos(a) * r, 12 + Math.sin(a) * r * rr(0.45, 1));
        }
        const path = A.poly(pts);
        A.metal(x, path, { base: color, spec: 0.7, edge: 1.2, rimWidth: 0.8, bounds: { x: 0, y: 0, w: 24, h: 24 } });
        out.push(c);
      }
      return out;
    }
    return A.glow(color, 32);
  }

  // Billowy fire puff: radial falloff eaten into by fbm noise, so overlapping puffs read as flame.
  let fireMaskCanvas = null;
  function fireMask() {
    if (fireMaskCanvas) return fireMaskCanvas;
    const A = SL.art, S = 64;
    const n = A.noise(S, S, { scale: 12, octaves: 4, seed: 91, warp: 0.25 });
    const c = A.canvas(S, S), x = c.getContext('2d');
    const img = x.createImageData(S, S), d = img.data;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const dx = ((i + 0.5) / S) * 2 - 1, dy = ((j + 0.5) / S) * 2 - 1;
        const r = Math.sqrt(dx * dx + dy * dy);
        let a = Math.max(0, 1 - r) * 1.7 - (1 - n[j * S + i]) * 0.9 * (0.35 + r);
        a = a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a);
        const k = (j * S + i) * 4;
        d[k] = d[k + 1] = d[k + 2] = 255;
        d[k + 3] = Math.round(a * 255);
      }
    }
    x.putImageData(img, 0, 0);
    fireMaskCanvas = c;
    return c;
  }

  let smokeMaskCanvas = null;
  function smokeMask() {
    if (smokeMaskCanvas) return smokeMaskCanvas;
    const A = SL.art;
    const c = A.canvas(64, 64), x = c.getContext('2d');
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, r = i ? 11 : 0;
      const cx = 32 + Math.cos(a) * r, cy = 32 + Math.sin(a) * r;
      const rad = i ? 17 : 24;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cy, rad, 0, TAU);
      x.fill();
    }
    const n = A.noiseCanvas(64, 64, { scale: 16, octaves: 3, seed: 77, palette: [[0, '#ffffff', 0.25], [1, '#ffffff', 1]] });
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(n, 0, 0);
    smokeMaskCanvas = c;
    return c;
  }

  function sprite(shape, color) {
    const key = shape + '|' + color;
    let s = spriteCache.get(key);
    if (!s) {
      if (spriteCache.size > 1500) spriteCache.clear();
      s = makeShape(shape, color);
      spriteCache.set(key, s);
    }
    return s;
  }
  /** Six-step color ramp of a shape (cached): c1 -> c2, or c1 -> c2 -> c3 when c3 is given. */
  function ramp(shape, c1, c2, c3) {
    const key = 'r' + shape + '|' + c1 + '|' + c2 + '|' + (c3 || '');
    let r = spriteCache.get(key);
    if (!r) {
      r = [];
      for (let i = 0; i < 6; i++) {
        const u = i / 5;
        const c = !c3 ? C.mix(c1, c2, u) : u < 0.5 ? C.mix(c1, c2, u * 2) : C.mix(c2, c3, u * 2 - 1);
        r.push(sprite(shape, qColor(c)));
      }
      spriteCache.set(key, r);
    }
    return r;
  }

  // ------------------------------------------------------------------ particle pool (ring buffer)
  const MAXCAP = 2500;
  let cap = 2500;
  let pool = [];
  let head = 0, used = 0, alive = 0;
  function newParticle() {
    return {
      alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 1, age: 0, size: 8, size2: 8, alpha: 1, alpha2: 0,
      add: true, drag: 0, gravity: 0, rot: 0, spin: 0, stretch: 0, shape: 0, spr: null, ramp: null, sprites: null,
      trail: null, trailEvery: 0, trailT: 0, ease: 0,
    };
  }
  for (let i = 0; i < cap; i++) pool.push(newParticle());

  function alloc() {
    if (used >= cap) {
      const old = pool[head];
      if (old.alive) { old.alive = false; alive--; }
      head = (head + 1) % cap;
      used--;
    }
    const p = pool[(head + used) % cap];
    used++;
    alive++;
    p.alive = true;
    p.age = 0;
    p.ramp = null;
    p.sprites = null;
    p.trail = null;
    p.rot = 0;
    p.spin = 0;
    p.stretch = 0;
    p.gravity = 0;
    p.drag = 0;
    p.ease = 0;
    return p;
  }

  /** Internal fast spawn (no option object). */
  function spawn(shape, x, y, vx, vy, life, size, size2, a1, a2, add, drag, spr, rmp) {
    const p = alloc();
    p.shape = shape; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = Math.max(0.01, life);
    p.size = size; p.size2 = size2; p.alpha = a1; p.alpha2 = a2; p.add = add; p.drag = drag;
    p.spr = spr; p.ramp = rmp;
    return p;
  }

  // ------------------------------------------------------------------ palettes
  const PALETTES = {
    enemy: { flash: '#fff2dc', core: '#ffd27a', fire: ['#ffe7a0', '#ff7a2f', '#b8183c'], spark: '#ffd88a', ember: '#ff7a3d', smoke: '#2a2030', ring: '#ff9a5c', debris: '#3a3f55' },
    player: { flash: '#ffffff', core: '#c9f6ff', fire: ['#eefcff', '#55cfff', '#1c4fd0'], spark: '#c4f4ff', ember: '#7fe3ff', smoke: '#1a2433', ring: '#9fe8ff', debris: '#c8d2e2' },
    blue: { flash: '#f2f8ff', core: '#9fc8ff', fire: ['#e0f0ff', '#4f8bff', '#2a2fb8'], spark: '#b8d6ff', ember: '#6f9dff', smoke: '#161c34', ring: '#7fa8ff', debris: '#4a5578' },
    green: { flash: '#f0fff6', core: '#a8ffd6', fire: ['#e8fff3', '#3fe89a', '#0f7a55'], spark: '#b8ffdc', ember: '#5dffb0', smoke: '#14261f', ring: '#7dffc4', debris: '#3c5a4c' },
    violet: { flash: '#fbf2ff', core: '#d9b0ff', fire: ['#f6e8ff', '#b26bff', '#5a1fb0'], spark: '#e2c4ff', ember: '#c48aff', smoke: '#211631', ring: '#c99bff', debris: '#4a3e66' },
    gold: { flash: '#fffbe8', core: '#ffe9a0', fire: ['#fff6d0', '#ffcf3d', '#c76a10'], spark: '#fff0b0', ember: '#ffd34d', smoke: '#2a2414', ring: '#ffe27a', debris: '#7a6430' },
  };
  const SIZES = {
    s: { k: 1, shake: 0, shakeT: 0 },
    m: { k: 1.7, shake: 4, shakeT: 0.22 },
    l: { k: 2.6, shake: 8, shakeT: 0.35 },
    xl: { k: 3.6, shake: 13, shakeT: 0.5 },
    boss: { k: 5.2, shake: 22, shakeT: 1.1 },
  };

  // ------------------------------------------------------------------ waves, flashes, texts, timers
  const waves = [];
  const flashes = [];
  const texts = [];
  for (let i = 0; i < 48; i++) texts.push({ alive: false, x: 0, y: 0, str: '', color: '#fff', size: 26, life: 1, age: 0, rise: 60, font: '' });
  let textCursor = 0;
  const shakeState = { amp: 0, t: 0, dur: 0, time: 0 };
  const shakeOut = { x: 0, y: 0 };
  let hitstopT = 0;
  const slow = { scale: 1, t: 0, dur: 0 };
  const chroma = { a: 0, t: 0, dur: 0 };

  function settings() { return (SL.save && SL.save.settings) || {}; }
  function reduced() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  let reducedMotion = false;

  /** Burning streak behind a debris chunk, aligned with its velocity (draw time only, no particles). */
  function drawStreak(ctx, p, bs, bx, by) {
    const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (sp < 30) return;
    const fade = 1 - p.age / p.life;
    const len = 10 + sp * 0.09;
    const th = Math.max(3, p.size * 0.75);
    const c = (p.vx / sp) * bs, s = (p.vy / sp) * bs;
    ctx.globalAlpha = 0.85 * fade;
    ctx.setTransform(c, s, -s, c, bx + p.x * bs, by + p.y * bs);
    ctx.drawImage(p.trail.streak, -len, -th / 2, len + th * 0.5, th);
  }

  const F = SL.fx = {
    PALETTES,
    SHAPES,
    get cap() { return cap; },

    emit(o) {
      if (!o) return null;
      const shapeName = o.shape || 'glow';
      let shape = SHAPES[shapeName];
      const color = qColor(o.color || '#ffffff');
      let spr = null, rmp = null;
      if (shape === undefined) {
        shape = SHAPES.sprite;
        spr = SL.art.has(shapeName) ? SL.art.get(shapeName).canvas : sprite(SHAPES.glow, color);
      } else if (o.color2 && shape !== SHAPES.debris) {
        rmp = ramp(shape, color, qColor(o.color2));
      } else spr = sprite(shape, color);
      const add = o.blend ? o.blend !== 'normal' : !(shape === SHAPES.smoke || shape === SHAPES.debris || shape === SHAPES.sprite);
      const size = o.size != null ? o.size : 12;
      const p = spawn(shape, o.x || 0, o.y || 0, o.vx || 0, o.vy || 0, o.life || 0.6, size,
        o.size2 != null ? o.size2 : size, o.alpha != null ? o.alpha : 1, o.alpha2 != null ? o.alpha2 : 0, add,
        o.drag || 0, spr, rmp);
      if (shape === SHAPES.debris) { p.sprites = spr; p.spr = spr[(rnd() * spr.length) | 0]; }
      p.gravity = o.gravity || 0;
      p.rot = o.rot || 0;
      p.spin = o.spin || 0;
      p.stretch = o.stretch || 0;
      p.ease = o.ease ? 1 : 0;
      if (o.delay > 0) p.age = -o.delay;
      return p;
    },

    explode(x, y, o) {
      o = o || {};
      const sz = SIZES[o.size] ? o.size : 's';
      const S = SIZES[sz];
      const k = S.k * (o.scale || 1);
      const P = PALETTES[o.palette] || PALETTES.enemy;
      const G = SHAPES.glow, FI = SHAPES.fire;
      const kp = Math.pow(k, 0.6), ks = Math.pow(k, 0.75);
      let p;
      // smoke first, so the fire paints over it; it shows as the fire cools
      const smk = sprite(SHAPES.smoke, qColor(P.smoke));
      const nk = Math.round(2 + 2.4 * k);
      for (let i = 0; i < nk; i++) {
        const a = rnd() * TAU, sp = rr(15, 80) * kp, off = rr(0, 12 * k);
        p = spawn(SHAPES.smoke, x + Math.cos(a) * off, y + Math.sin(a) * off, Math.cos(a) * sp, Math.sin(a) * sp - 18,
          rr(0.9, 1.7) * Math.pow(k, 0.25), rr(30, 46) * ks, rr(84, 120) * ks, rr(0.45, 0.65), 0, false, 1.3, smk, null);
        p.rot = rnd() * TAU;
        p.spin = rr(-0.7, 0.7);
        p.ease = 1;
        p.age = -rr(0.06, 0.2);
      }
      // fireball: billowy puffs, painted (normal blend) so they keep their colour, cooling to deep red
      const fire = ramp(FI, qColor(P.fire[0]), qColor(P.fire[1]), qColor(P.fire[2]));
      const fireMid = ramp(FI, qColor(P.fire[1]), qColor(P.fire[2]), qColor(C.mix(P.fire[2], P.smoke, 0.55)));
      const nf = Math.round(5 + 5 * k);
      for (let i = 0; i < nf; i++) {
        const a = rnd() * TAU, sp = rr(40, 220) * kp, off = rr(0, 10 * k);
        p = spawn(FI, x + Math.cos(a) * off, y + Math.sin(a) * off, Math.cos(a) * sp, Math.sin(a) * sp,
          rr(0.36, 0.66) * Math.pow(k, 0.3), rr(16, 26) * ks, rr(46, 72) * ks, rr(0.8, 0.98), 0, false, 3.2, null, i % 3 ? fire : fireMid);
        p.rot = rnd() * TAU;
        p.spin = rr(-2.5, 2.5);
        p.ease = 1;
        if (k >= 2.5 && i % 3 === 2) p.age = -rr(0.04, 0.28);
      }
      // light: white flash, hot core and heat glows (additive, these feed the bloom)
      spawn(G, x, y, 0, 0, 0.1 + 0.014 * k, 120 * Math.pow(k, 0.8), 40 * k, 1, 0, true, 0, sprite(G, qColor(P.flash)), null);
      p = spawn(G, x, y, 0, 0, 0.24 + 0.05 * k, 40 * k, 92 * k, 0.5, 0, true, 0, sprite(G, qColor(P.core)), null);
      p.ease = 1;
      const heat = sprite(G, qColor(P.fire[1]));
      const nh = Math.round(1 + k);
      for (let i = 0; i < nh; i++) {
        const a = rnd() * TAU, d = rr(0, 22) * k;
        p = spawn(G, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a) * 60, Math.sin(a) * 60, rr(0.3, 0.5) * Math.pow(k, 0.3),
          34 * ks, 96 * ks, 0.32, 0, true, 2, heat, null);
        p.ease = 1;
      }
      // sparks
      const sparkR = ramp(SHAPES.spark, qColor(P.spark), qColor(P.ember));
      const ns = Math.round(8 + 7 * k);
      for (let i = 0; i < ns; i++) {
        const a = rnd() * TAU, sp = rr(260, 820) * Math.pow(k, 0.35);
        p = spawn(SHAPES.spark, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.2, 0.55), rr(5, 8), 2, 1, 0, true, 2.8, null, sparkR);
        p.stretch = 0.045;
      }
      // embers
      const emb = sprite(G, qColor(P.ember));
      const ne = Math.round(3 + 3 * k);
      for (let i = 0; i < ne; i++) {
        const a = rnd() * TAU, sp = rr(40, 170) * Math.pow(k, 0.5);
        p = spawn(G, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.7, 1.5), rr(7, 12), 2, 1, 0, true, 1.6, emb, null);
        p.gravity = -12;
      }
      // debris with burning streaks and smoke trails
      if (o.debris !== false && k >= 1.5) {
        const deb = sprite(SHAPES.debris, qColor(P.debris));
        const trail = { streak: sprite(SHAPES.spark, qColor(P.fire[1])), smoke: smk };
        const nd = Math.round(1 + 1.6 * k);
        for (let i = 0; i < nd; i++) {
          const a = rnd() * TAU, sp = rr(170, 440) * Math.pow(k, 0.3);
          p = spawn(SHAPES.debris, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.8, 1.4), rr(10, 18) * Math.pow(k, 0.4),
            rr(8, 14) * Math.pow(k, 0.4), 1, 0.2, false, 1.2, deb[(rnd() * deb.length) | 0], null);
          p.sprites = deb;
          p.rot = rnd() * TAU;
          p.spin = rr(-9, 9);
          p.trail = trail;
          p.trailEvery = cap > 1000 ? 0.05 : 0.1;
          p.trailT = 0;
        }
      }
      // ring and shockwave
      p = spawn(SHAPES.ring, x, y, 0, 0, 0.3 + 0.05 * k, 14 * k, 170 * Math.pow(k, 0.85), 0.85, 0, true, 0, sprite(SHAPES.ring, qColor(P.ring)), null);
      p.ease = 1;
      if (k >= 1.7) F.shockwave(x, y, { radius: 105 * k, duration: 0.42 + 0.08 * k, strength: 0.45 + 0.22 * k, ring: k >= 2.6, color: P.ring });
      if (sz === 'boss') {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU + rr(-0.2, 0.2), d = rr(50, 120);
          p = spawn(FI, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a) * 150, Math.sin(a) * 150, rr(0.6, 1),
            rr(44, 64), rr(120, 170), 0.9, 0, false, 2.5, null, i % 2 ? fire : fireMid);
          p.rot = rnd() * TAU;
          p.spin = rr(-1.5, 1.5);
          p.ease = 1;
          p.age = -rr(0.1, 0.45);
        }
        F.flash(P.flash, 0.75, 0.6);
        F.chromatic(0.8, 0.5);
        F.hitstop(0.08);
      } else if (k >= 2.6) {
        F.flash(P.flash, Math.min(0.32, 0.06 * k), 0.14 + 0.03 * k);
      }
      if (o.shake !== false && S.shake) F.shake(S.shake * (o.scale || 1), S.shakeT);
      if (o.sound !== false) U.sfx('explode_' + sz, { x });
    },

    hit(x, y, color, o) {
      color = qColor(color || '#ffd27a');
      const dir = o && o.dir != null ? o.dir : -Math.PI / 2;
      const spr = sprite(SHAPES.spark, color);
      for (let i = 0; i < 4; i++) {
        const a = dir + rr(-0.75, 0.75), sp = rr(200, 460);
        const p = spawn(SHAPES.spark, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.1, 0.22), rr(4, 6), 2, 1, 0, true, 4, spr, null);
        p.stretch = 0.04;
      }
      spawn(SHAPES.glow, x, y, 0, 0, 0.09, 26, 40, 0.9, 0, true, 0, sprite(SHAPES.glow, color), null);
    },

    sparks(x, y, o) {
      o = o || {};
      const color = qColor(o.color || '#ffd27a');
      const n = Math.min(80, o.count != null ? o.count : 8);
      const speed = o.speed || 420, life = o.life || 0.35;
      const angle = o.angle != null ? o.angle : 0, spread = o.spread != null ? o.spread : TAU;
      const spr = sprite(SHAPES.spark, color);
      for (let i = 0; i < n; i++) {
        const a = angle + (rnd() - 0.5) * spread, sp = speed * rr(0.45, 1);
        const p = spawn(SHAPES.spark, x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * rr(0.6, 1.1), o.size || 5, 2, 1, 0, true, 3, spr, null);
        p.stretch = 0.04;
      }
    },

    shockwave(x, y, o) {
      o = o || {};
      if (waves.length >= 12) waves.shift();
      waves.push({
        x, y, radius: o.radius || 260, dur: Math.max(0.05, o.duration || 0.6), t: 0,
        strength: o.strength != null ? o.strength : 1, ring: o.ring !== false,
        ringSpr: SL.art.ring(qColor(o.color || '#bfeaff'), 128, 7),
      });
    },

    shake(px, seconds) {
      const s = settings();
      const mul = (s.shake != null ? s.shake : 1) * (reducedMotion ? 0.4 : 1);
      const amp = (+px || 0) * mul;
      if (amp <= 0) return;
      const curAmp = shakeState.dur > 0 ? shakeState.amp * (shakeState.t / shakeState.dur) : 0;
      if (amp >= curAmp) {
        shakeState.amp = amp;
        shakeState.t = shakeState.dur = Math.max(0.05, +seconds || 0.25);
      }
    },

    flash(color, alpha, seconds) {
      const s = settings();
      let a = U.clamp(+alpha || 0, 0, 1);
      if (s.flashes === false || reducedMotion) a *= 0.3;
      if (a <= 0) return;
      if (flashes.length >= 4) flashes.shift();
      flashes.push({ color: color || '#ffffff', a, t: 0, dur: Math.max(0.03, +seconds || 0.15) });
    },

    hitstop(seconds) { hitstopT = Math.max(hitstopT, U.clamp(+seconds || 0, 0, 0.12)); },

    /** Timed chromatic aberration pulse (0..1) that decays over `seconds` of real time. */
    chromatic(amount, seconds) {
      const a = U.clamp(+amount || 0, 0, 1) * (reducedMotion ? 0.5 : 1);
      const cur = chroma.dur > 0 ? chroma.a * (chroma.t / chroma.dur) : 0;
      if (a <= cur) return;
      chroma.a = a;
      chroma.t = chroma.dur = Math.max(0.03, +seconds || 0.3);
    },

    slowmo(scale, seconds) {
      slow.scale = U.clamp(+scale || 1, 0.05, 1);
      slow.t = slow.dur = Math.max(0, +seconds || 0);
    },

    text(x, y, str, o) {
      o = o || {};
      let t = null;
      for (let i = 0; i < texts.length; i++) {
        const c = texts[(textCursor + i) % texts.length];
        if (!c.alive) { t = c; break; }
      }
      if (!t) t = texts[textCursor];
      textCursor = (textCursor + 1) % texts.length;
      t.alive = true; t.x = x; t.y = y; t.str = String(str); t.color = o.color || '#ffffff';
      t.size = o.size || 26; t.life = o.life || 0.9; t.rise = o.rise != null ? o.rise : 60; t.age = 0;
      t.font = (o.weight || 700) + ' ' + Math.round(t.size) + 'px ' + (o.font || 'Oxanium, "Segoe UI", sans-serif');
    },

    /** Game-time update (particles, shockwaves, floating text). */
    update(dt) {
      for (let k = 0; k < used; k++) {
        const p = pool[(head + k) % cap];
        if (!p.alive) continue;
        p.age += dt;
        if (p.age < 0) continue;
        if (p.age >= p.life) { p.alive = false; alive--; continue; }
        if (p.drag) { const f = 1 / (1 + p.drag * dt); p.vx *= f; p.vy *= f; }
        if (p.gravity) p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.spin) p.rot += p.spin * dt;
        if (p.trail) {
          p.trailT -= dt;
          for (let g = 0; g < 2 && p.trailT <= 0; g++) {
            p.trailT += p.trailEvery;
            const fade = 1 - p.age / p.life;
            const q = spawn(SHAPES.smoke, p.x, p.y, p.vx * 0.05, p.vy * 0.05 - 14, 0.7, 8 + 6 * fade, 26, 0.32 * fade, 0, false, 1.5, p.trail.smoke, null);
            q.rot = rnd() * TAU;
            q.spin = rr(-1, 1);
            q.ease = 1;
          }
        }
      }
      while (used > 0 && !pool[head].alive) { head = (head + 1) % cap; used--; }
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.t += dt;
        if (w.t >= w.dur) { waves.splice(i, 1); continue; }
        const k = w.t / w.dur;
        const r = w.radius * SL.ease.outCubic(k);
        const s = Math.min(2.2, w.strength);
        if (SL.render) SL.render.addRipple(w.x, w.y, r, 16 * s * Math.pow(1 - k, 1.3), 20 + 46 * k * Math.min(1.5, s));
      }
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i];
        if (!t.alive) continue;
        t.age += dt;
        if (t.age >= t.life) t.alive = false;
      }
    },

    /** Real-time update (shake, flash, hit-stop, slow-mo); frozen while paused. */
    realUpdate(dt) {
      shakeState.time += dt;
      if (shakeState.t > 0) shakeState.t = Math.max(0, shakeState.t - dt);
      if (hitstopT > 0) hitstopT = Math.max(0, hitstopT - dt);
      if (slow.t > 0) slow.t = Math.max(0, slow.t - dt);
      if (chroma.t > 0) {
        chroma.t = Math.max(0, chroma.t - dt);
        const k = chroma.t / chroma.dur;
        if (SL.render) SL.render.chromatic(chroma.a * k * k);
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.t += dt;
        if (f.t >= f.dur) { flashes.splice(i, 1); continue; }
        const k = 1 - f.t / f.dur;
        if (SL.render) SL.render.flash(f.color, f.a * k * k);
      }
    },

    shakeOffset() {
      if (shakeState.t <= 0 || shakeState.dur <= 0) { shakeOut.x = 0; shakeOut.y = 0; return shakeOut; }
      const a = shakeState.amp * (shakeState.t / shakeState.dur);
      const t = shakeState.time;
      shakeOut.x = a * (Math.sin(t * 53.1) * 0.6 + Math.sin(t * 31.7 + 1.3) * 0.4);
      shakeOut.y = a * (Math.sin(t * 47.3 + 0.7) * 0.6 + Math.sin(t * 27.9 + 2.1) * 0.4);
      return shakeOut;
    },

    /** Current slow-mo factor (eases back to 1 over the last quarter). */
    timeScale() {
      if (slow.t <= 0) return 1;
      const k = slow.t / Math.max(0.0001, slow.dur);
      return k > 0.25 ? slow.scale : U.lerp(1, slow.scale, k / 0.25);
    },
    hitstopLeft() { return hitstopT; },

    draw(ctx) {
      const b = SL.render.base, bs = b.s, bx = b.x, by = b.y;
      for (let pass = 0; pass < 2; pass++) {
        const add = pass === 1;
        ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
        for (let k = 0; k < used; k++) {
          const p = pool[(head + k) % cap];
          if (!p.alive || p.age < 0) continue;
          if (add && p.trail) drawStreak(ctx, p, bs, bx, by);
          if (p.add !== add) continue;
          const t = p.age / p.life;
          const a = p.alpha + (p.alpha2 - p.alpha) * (p.ease ? t * t : t);
          if (a <= 0.004) continue;
          const size = p.size + (p.size2 - p.size) * (p.ease ? t * (2 - t) : t);
          if (size <= 0.1) continue;
          const img = p.ramp ? p.ramp[Math.min(5, (t * 6) | 0)] : p.spr;
          if (!img) continue;
          ctx.globalAlpha = a > 1 ? 1 : a;
          if (p.shape === 1) {
            const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            const len = size * 2 + sp * p.stretch;
            const ang = Math.atan2(p.vy, p.vx);
            const c = Math.cos(ang) * bs, s = Math.sin(ang) * bs;
            ctx.setTransform(c, s, -s, c, bx + p.x * bs, by + p.y * bs);
            ctx.drawImage(img, -len / 2, -size / 2, len, size);
          } else if (p.rot) {
            const c = Math.cos(p.rot) * bs, s = Math.sin(p.rot) * bs;
            ctx.setTransform(c, s, -s, c, bx + p.x * bs, by + p.y * bs);
            ctx.drawImage(img, -size / 2, -size / 2, size, size);
          } else {
            ctx.setTransform(bs, 0, 0, bs, bx, by);
            ctx.drawImage(img, p.x - size / 2, p.y - size / 2, size, size);
          }
        }
        ctx.setTransform(bs, 0, 0, bs, bx, by);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < waves.length; i++) {
        const w = waves[i];
        if (!w.ring) continue;
        const k = w.t / w.dur;
        const r = w.radius * SL.ease.outCubic(k);
        ctx.globalAlpha = Math.min(1, 0.65 * Math.min(1.5, w.strength)) * (1 - k) * (1 - k);
        ctx.drawImage(w.ringSpr, w.x - r, w.y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const land = !!(SL.render && SL.render.land);
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i];
        if (!t.alive) continue;
        const k = t.age / t.life;
        const pop = k < 0.12 ? SL.ease.outBack(k / 0.12) : 1;
        ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
        ctx.font = t.font;
        const rise = t.rise * SL.ease.outCubic(k), sp = bs * pop;
        // landscape shows the world turned a quarter turn: counter-turn the text so it reads upright and rises up
        if (land) ctx.setTransform(0, -sp, sp, 0, bx + (t.x - rise) * bs, by + t.y * bs);
        else ctx.setTransform(sp, 0, 0, sp, bx + t.x * bs, by + (t.y - rise) * bs);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(4,6,14,0.75)';
        ctx.strokeText(t.str, 0, 0);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, 0, 0);
      }
      ctx.setTransform(bs, 0, 0, bs, bx, by);
      ctx.globalAlpha = 1;
    },

    clear() {
      for (let i = 0; i < pool.length; i++) pool[i].alive = false;
      head = 0; used = 0; alive = 0;
      waves.length = 0;
      flashes.length = 0;
      for (const t of texts) t.alive = false;
      shakeState.t = 0;
      hitstopT = 0;
      slow.t = 0;
      chroma.t = 0;
    },

    count() { return alive; },

    setCap(n) {
      n = U.clamp(Math.round(+n || 2500), 100, MAXCAP);
      if (n === cap) return;
      const keep = [];
      for (let k = 0; k < used; k++) {
        const p = pool[(head + k) % cap];
        if (p.alive) keep.push(p);
      }
      const all = new Set(pool);
      const fresh = keep.slice(Math.max(0, keep.length - n));
      for (const p of keep.slice(0, Math.max(0, keep.length - n))) p.alive = false;
      const spare = [];
      for (const p of all) if (!p.alive) spare.push(p);
      const next = fresh.slice();
      while (next.length < n) next.push(spare.pop() || newParticle());
      pool = next;
      cap = n;
      head = 0;
      used = fresh.length;
      alive = fresh.length;
    },
  };

  SL.onBoot(() => {
    reducedMotion = reduced();
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.addEventListener) mq.addEventListener('change', () => { reducedMotion = reduced(); });
    } catch (e) { /* matchMedia missing */ }
  });
})(window.SL = window.SL || {});
