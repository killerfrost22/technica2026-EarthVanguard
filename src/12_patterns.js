/* 12_patterns.js (enemies builder)
   Provides: the 12 enemy bullet types of GDD 7.2 (SL.ebulletTypes: orb orbBig orb_huge needle shard mine missile
   spark petal flare void_orb beam), the enemy beam restyle, warning markers (pseudo-beams that never damage),
   the 23 patterns of GDD 7.3 and SL.patterns.target (GDD 7.4).
   - SL.fireEnemy is wrapped once at load so a bullet type may carry init(b, opts) / update(b, dt) hooks: mines,
     missiles, petals, sparks and void orbs behave correctly even when bosses call SL.fireEnemy directly.
   - Volley patterns return the bullets fired. Continuous patterns (spiral, double_spiral, stream, pinwheel,
     rain_curtain, lattice, mine_lay, ring_stagger) take (state, src, dt, opts) each frame and return this step's
     bullets, or (src, opts) to start a self-driven emitter (returned; stop() ends it).
   - mission.tune applies when src (or opts.owner) is a non-boss enemy entity; SL.game.diff always applies.
   See docs/api/enemies.md. */
(function (SL) {
  'use strict';

  const U = SL.util, A = SL.art, C = SL.color;
  const W = SL.W, H = SL.H, TAU = Math.PI * 2, PI = Math.PI, HALF = Math.PI / 2;
  const EB = SL.pal.ebullet;
  const WARN = '#ff3b4f';
  const VIOLET = '#b26bff';
  const EMPTY = Object.freeze([]);
  const NO_TUNE = Object.freeze({ bulletSpeed: 1, fireRate: 1 });
  const BASE_DIFF = { bulletSpeed: 1, fireRate: 1, damage: 1, enemyHp: 1 };

  function diff() { return (SL.game && SL.game.diff) || BASE_DIFF; }
  function missionTune() {
    const s = SL.game && SL.game.session;
    const t = s && s.mission && s.mission.tune;
    return t || NO_TUNE;
  }
  /** Tune applies to non-boss enemy entities (GDD: bosses ignore mission tune); opts.tune forces it on or off. */
  function isTuned(src, o) {
    if (o && o.tune != null) return !!o.tune;
    const e = (o && o.owner) || src;
    if (!e || e.kind !== 'enemy' || e.isBoss || e.boss || (e.params && e.params.boss) || (e.def && e.def.bossPart)) return false;
    return true;
  }
  function tuneOf(src, o) { return isTuned(src, o) ? missionTune() : NO_TUNE; }
  function frOf(src, o) {
    if (o && o.fr != null) return o.fr;
    return (diff().fireRate || 1) * (tuneOf(src, o).fireRate || 1);
  }
  /** Counts marked x fr in GDD 7.3: rounded, never below 60% of base. */
  function scaleCount(n, fr) { return Math.max(1, Math.round(n * 0.6), Math.round(n * fr)); }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function nearPlayer(x, y, r) {
    const ps = SL.world.players, r2 = r * r;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.alive || p.down || p.display) continue;
      const dx = p.x - x, dy = p.y - y;
      if (dx * dx + dy * dy < r2) return true;
    }
    return false;
  }

  // opts that pass through to SL.fireEnemy (pattern-level keys such as count or spread stay behind)
  const SCR = {};
  const PASS = ['accel', 'maxSpeed', 'minSpeed', 'turn', 'homing', 'homingTime', 'wave', 'delay', 'life', 'split',
    'color', 'scale', 'damage', 'update'];
  function passOpts(o, src, tb) {
    for (let i = 0; i < PASS.length; i++) SCR[PASS[i]] = o[PASS[i]];
    SCR.owner = o.owner || (src && src.kind ? src : null);
    SCR.data = undefined;
    if (tb !== 1) {
      if (SCR.accel) SCR.accel *= tb;
      if (SCR.maxSpeed != null) SCR.maxSpeed *= tb;
      if (SCR.minSpeed) SCR.minSpeed *= tb;
    }
    return SCR;
  }
  /** One bullet; skipped (null) within 120 px of a living player unless safe === false (GDD 7.1). */
  function shoot(x, y, a, sp, type, so, out, safe) {
    if (safe !== false && nearPlayer(x, y, 120)) return null;
    const b = SL.fireEnemy(x, y, a, sp, type, so);
    if (b.dead) return null;
    if (out) out.push(b);
    return b;
  }
  function finish(out, o, x) {
    if (out.length) {
      U.sfx('enemy_fire', { x });
      if (o.each) for (let i = 0; i < out.length; i++) o.each(out[i], i);
    }
    return out;
  }
  function pick(v, i) { return Array.isArray(v) ? v[i % v.length] : v || 0; }

  // ------------------------------------------------------------------ targeting (GDD 7.4)
  function baitOf(e) {
    if (!e) return 0;
    if (e.aimBait > 0) return e.aimBait;
    if (e.data && e.data.aimBait > 0) return e.data.aimBait;
    if (e.def && e.def.aimBait > 0) return e.def.aimBait;
    return 0;
  }
  function podVip(p) { return !!(p.vip || (p.data && p.data.vip) || p.kind === 'vip' || (p.data && p.data.kind === 'vip')); }
  function findMissionTarget(id, sx, sy) {
    const w = SL.world;
    if (id === 'vip') {
      let best = null;
      for (const pod of w.pods) if (!pod.dead && podVip(pod) && (!best || pod.id > best.id)) best = pod;
      return best;
    }
    if (id === 'pod') {
      let best = null, bd = Infinity;
      for (const pod of w.pods) {
        if (pod.dead) continue;
        const d = (pod.x - sx) * (pod.x - sx) + (pod.y - sy) * (pod.y - sy);
        if (d < bd) { bd = d; best = pod; }
      }
      return best;
    }
    const lists = [w.allies, w.props, w.enemies];
    for (let l = 0; l < lists.length; l++) {
      const L = lists[l];
      for (let i = 0; i < L.length; i++) {
        const e = L[i];
        if (!e.dead && (e.targetId === id || (e.def && e.def.targetId === id))) return e;
      }
    }
    return null;
  }
  /** Aim point for src: its mission target, an aimBait entity, else the nearest living player. */
  function target(src) {
    const w = SL.world;
    const sx = src && src.x != null ? src.x : W / 2, sy = src && src.y != null ? src.y : 0;
    const tid = src ? (src.target != null ? src.target : src.params && src.params.target != null ? src.params.target : null) : null;
    if (tid) {
      const ent = typeof tid === 'string' ? findMissionTarget(tid, sx, sy) : (tid.dead ? null : tid);
      if (ent && ent.x != null) return { x: ent.x, y: ent.y, ref: ent };
    }
    for (let i = 0; i < w.allies.length; i++) {
      const a = w.allies[i];
      if (a.dead) continue;
      const k = baitOf(a);
      if (k > 0 && SL.rng.next() < k) return { x: a.x, y: a.y, ref: a };
    }
    for (let i = 0; i < w.players.length; i++) {
      const p = w.players[i];
      if (!p.alive || p.down || p.display) continue;
      const k = baitOf(p);
      if (k > 0 && SL.rng.next() < k) return { x: p.x, y: p.y, ref: p };
    }
    const p = w.nearestPlayer(sx, sy);
    if (p) return { x: p.x, y: p.y, ref: p };
    return { x: sx, y: Math.max(sy + 600, H * 0.85), ref: null };
  }
  function aimFrom(src, x, y, tgt) {
    let tx, ty;
    if (tgt && typeof tgt === 'object' && tgt.x != null && !tgt.dead) { tx = tgt.x; ty = tgt.y; } else {
      const t = target(src);
      tx = t.x;
      ty = t.y;
    }
    const dx = tx - x, dy = ty - y;
    return dx || dy ? Math.atan2(dy, dx) : HALF;
  }
  function refPos(ref, src) {
    if (ref && !ref.dead && ref.x != null && !(ref.kind === 'player' && (ref.down || !ref.alive))) return ref;
    return target(src);
  }

  // ------------------------------------------------------------------ bullet art
  const sprCache = new Map();
  function sprite(kind, color, gen, w, h, pad) {
    const key = 'ebx:' + kind + ':' + color;
    let s = sprCache.get(key);
    if (s) return s;
    if (!A.has(key)) A.define(key, w, h, gen(color), { pad: pad || 0, res: 2 });
    s = A.get(key);
    sprCache.set(key, s);
    return s;
  }

  function orbGen(R, coreR, haloR, ringR) {
    return (color) => (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      let g = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, haloR);
      g.addColorStop(0, C.rgba(color, 1));
      g.addColorStop(0.3, C.rgba(color, 0.46));
      g.addColorStop(0.62, C.rgba(color, 0.14));
      g.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, TAU);
      ctx.fill();
      if (ringR) {
        ctx.strokeStyle = C.rgba(C.mix(color, '#ffffff', 0.35), 0.42);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, TAU);
        ctx.stroke();
      }
      g = ctx.createRadialGradient(cx - R * 0.12, cy - R * 0.16, 0, cx, cy, R);
      const kc = coreR / R;
      g.addColorStop(0, '#ffffff');
      g.addColorStop(kc * 0.8, '#ffffff');
      g.addColorStop(Math.min(0.92, kc + 0.17), C.mix(color, '#ffffff', 0.55));
      g.addColorStop(0.84, color);
      g.addColorStop(1, C.darken(color, 0.3));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.rgba(C.darken(color, 0.62), 0.85);
      ctx.lineWidth = Math.max(0.9, R * 0.11);
      ctx.beginPath();
      ctx.arc(cx, cy, R - ctx.lineWidth * 0.4, 0, TAU);
      ctx.stroke();
    };
  }
  const GEN = {
    orb: orbGen(6, 3, 15),
    orbBig: orbGen(11, 5, 21, 15.5),
    orb_huge: orbGen(20, 9, 34),
    needle: (color) => (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 0.34);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
      g.addColorStop(0, C.rgba(color, 0.95));
      g.addColorStop(0.5, C.rgba(color, 0.34));
      g.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, w / 2, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(cx - 11, cy - 2.3, 22, 4.6, 2.3);
      ctx.fill();
      const lg = ctx.createLinearGradient(cx - 10, 0, cx + 11, 0);
      lg.addColorStop(0, C.rgba('#ffffff', 0.2));
      lg.addColorStop(0.45, '#ffffff');
      lg.addColorStop(1, '#ffffff');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.roundRect(cx - 9.5, cy - 1.3, 20, 2.6, 1.3);
      ctx.fill();
      ctx.strokeStyle = C.rgba(C.darken(color, 0.6), 0.8);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.roundRect(cx - 11, cy - 2.3, 22, 4.6, 2.3);
      ctx.stroke();
    },
    shard: (color) => (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, w / 2);
      g.addColorStop(0, C.rgba(color, 0.95));
      g.addColorStop(0.4, C.rgba(color, 0.32));
      g.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const p = A.poly([cx - 7, cy, cx, cy - 4, cx + 7, cy, cx, cy + 4]);
      ctx.fillStyle = color;
      ctx.fill(p);
      ctx.fillStyle = '#ffffff';
      ctx.fill(A.poly([cx - 4.2, cy, cx, cy - 2.1, cx + 4.2, cy, cx, cy + 2.1]));
      ctx.strokeStyle = C.rgba(C.darken(color, 0.6), 0.9);
      ctx.lineWidth = 0.8;
      ctx.stroke(p);
    },
    petal: (color) => (ctx, w, h) => {
      const cx = w / 2, cy = h / 2, hx = cx + 4;
      ctx.save();
      ctx.translate(cx + 1, cy);
      ctx.scale(1, 0.62);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
      g.addColorStop(0, C.rgba(color, 0.7));
      g.addColorStop(0.5, C.rgba(color, 0.22));
      g.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, w / 2, 0, TAU);
      ctx.fill();
      ctx.restore();
      const p = new Path2D();
      p.moveTo(cx - 10, cy);
      p.quadraticCurveTo(cx - 3, cy - 6.2, hx, cy - 5.2);
      p.arc(hx, cy, 5.2, -HALF, HALF);
      p.quadraticCurveTo(cx - 3, cy + 6.2, cx - 10, cy);
      p.closePath();
      const lg = ctx.createLinearGradient(cx - 10, 0, hx + 5, 0);
      lg.addColorStop(0, VIOLET);
      lg.addColorStop(0.55, C.mix(VIOLET, color, 0.6));
      lg.addColorStop(1, color);
      ctx.fillStyle = lg;
      ctx.fill(p);
      const cg = ctx.createRadialGradient(hx, cy, 0, hx, cy, 4.4);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.55, '#ffffff');
      cg.addColorStop(1, C.rgba('#ffffff', 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(hx, cy, 4.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.rgba(C.darken(VIOLET, 0.55), 0.85);
      ctx.lineWidth = 0.8;
      ctx.stroke(p);
    },
    mine: (color) => (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      const body = new Path2D();
      body.arc(cx, cy, 10, 0, TAU);
      A.metal(ctx, body, { base: '#2c3142', spec: 0.5, edge: 1.4, rimLight: 1.4, rimWidth: 1, bounds: { x: cx - 10, y: cy - 10, w: 20, h: 20 } });
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 6.2, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.fillStyle = C.darken(color, 0.55);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, 1.6, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = C.darken(color, 0.4);
      ctx.beginPath();
      ctx.arc(cx, cy, 2.4, 0, TAU);
      ctx.fill();
    },
    mineLit: (color) => (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, w / 2);
      g.addColorStop(0, C.rgba(color, 0));
      g.addColorStop(0.32, C.rgba(color, 0.55));
      g.addColorStop(0.45, C.rgba(color, 0.22));
      g.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = C.rgba(C.mix(color, '#ffffff', 0.3), 0.9);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, 10.6, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU, x = cx + Math.cos(a) * 8, y = cy + Math.sin(a) * 8;
        const lg = ctx.createRadialGradient(x, y, 0, x, y, 3.6);
        lg.addColorStop(0, '#ffffff');
        lg.addColorStop(0.4, C.mix(color, '#ffffff', 0.4));
        lg.addColorStop(1, C.rgba(color, 0));
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(x, y, 3.6, 0, TAU);
        ctx.fill();
      }
      const c2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 3.4);
      c2.addColorStop(0, '#ffffff');
      c2.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = c2;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.4, 0, TAU);
      ctx.fill();
    },
    missile: (color) => (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      const B = { x: cx - 10, y: cy - 4, w: 20, h: 8 };
      for (const s of [-1, 1]) {
        const fin = A.poly([cx - 10, cy + s * 2, cx - 10, cy + s * 6.4, cx - 6.6, cy + s * 6.4, cx - 3.4, cy + s * 2.4]);
        A.metal(ctx, fin, { base: '#4a5068', spec: 0.3, edge: 0.6, rimLight: 0.8, rimWidth: 0.7, bounds: B });
      }
      const body = new Path2D();
      body.moveTo(cx - 10, cy - 3.2);
      body.lineTo(cx + 4.5, cy - 3.2);
      body.quadraticCurveTo(cx + 10.5, cy - 2.4, cx + 11, cy);
      body.quadraticCurveTo(cx + 10.5, cy + 2.4, cx + 4.5, cy + 3.2);
      body.lineTo(cx - 10, cy + 3.2);
      body.closePath();
      A.metal(ctx, body, { base: '#5a6178', spec: 0.6, edge: 0.8, rimLight: 1, rimWidth: 0.8, bounds: B });
      const nose = new Path2D();
      nose.moveTo(cx + 4.5, cy - 3.2);
      nose.quadraticCurveTo(cx + 10.5, cy - 2.4, cx + 11, cy);
      nose.quadraticCurveTo(cx + 10.5, cy + 2.4, cx + 4.5, cy + 3.2);
      nose.closePath();
      A.metal(ctx, nose, { base: '#c9d1de', spec: 0.75, edge: 0.6, rimLight: 1, rimWidth: 0.7, bounds: B });
      ctx.fillStyle = color;
      ctx.fillRect(cx - 2.2, cy - 3.2, 2.2, 6.4);
      A.emissive(ctx, A.poly([cx - 2.2, cy - 3.2, cx, cy - 3.2, cx, cy + 3.2, cx - 2.2, cy + 3.2]), color, 4);
      const ng = ctx.createRadialGradient(cx - 10, cy, 0, cx - 10, cy, 4);
      ng.addColorStop(0, '#ffffff');
      ng.addColorStop(0.45, C.mix(color, '#ffffff', 0.5));
      ng.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(cx - 10, cy, 4, 0, TAU);
      ctx.fill();
    },
    void_orb: (color) => (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, w / 2);
      g.addColorStop(0, C.rgba(color, 0.55));
      g.addColorStop(0.35, C.rgba(color, 0.2));
      g.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const dg = ctx.createRadialGradient(cx - 1.5, cy - 1.5, 0, cx, cy, 8);
      dg.addColorStop(0, '#120a22');
      dg.addColorStop(0.7, '#05030c');
      dg.addColorStop(1, '#1d0b38');
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, TAU);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = C.rgba(C.mix(color, '#ffffff', 0.6), 0.9);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, 8.2, PI * 1.05, PI * 1.6);
      ctx.stroke();
      const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 2.6);
      pg.addColorStop(0, '#ffffff');
      pg.addColorStop(0.45, '#ffffff');
      pg.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.6, 0, TAU);
      ctx.fill();
    },
    voidShimmer: (color) => (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      ctx.lineCap = 'round';
      const hi = C.mix(color, '#ffffff', 0.55);
      ctx.strokeStyle = C.rgba(hi, 0.75);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, 11.5, 0, 1.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 11.5, PI, PI + 1.0);
      ctx.stroke();
      ctx.strokeStyle = C.rgba(color, 0.5);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 2.1, 2.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 5.0, 5.6);
      ctx.stroke();
    },
    hugeRing: (color) => (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = C.rgba(C.mix(color, '#ffffff', 0.35), 0.95);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, TAU);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = C.rgba(color, 0.35);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, TAU);
      ctx.stroke();
    },
  };
  // jagged spark bolts (3 frames) and flickering flare fireballs (3 frames)
  function sparkGen(seed) {
    return (color) => (ctx, w, h) => {
      const R = SL.makeRng(seed * 977 + 13);
      const cx = w / 2, cy = h / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
      g.addColorStop(0, C.rgba(color, 0.5));
      g.addColorStop(0.5, C.rgba(color, 0.16));
      g.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const pts = [cx - 10, cy + R.range(-1.5, 1.5)];
      const s0 = R.chance(0.5) ? 1 : -1;
      pts.push(cx - 3.5, cy + s0 * R.range(3, 5));
      pts.push(cx + 3, cy - s0 * R.range(3, 5));
      pts.push(cx + 10, cy + R.range(-1.5, 1.5));
      const p = A.poly(pts, true);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.6;
      ctx.stroke(p);
      ctx.restore();
      ctx.strokeStyle = C.mix(color, '#ffffff', 0.55);
      ctx.lineWidth = 2.2;
      ctx.stroke(p);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.stroke(p);
      // a tiny forked twig
      const tw = A.poly([cx + 3, cy - s0 * 3.5, cx + 6, cy - s0 * R.range(6, 8)], true);
      ctx.strokeStyle = C.rgba(C.mix(color, '#ffffff', 0.4), 0.8);
      ctx.lineWidth = 0.9;
      ctx.stroke(tw);
    };
  }
  function flareGen(seed) {
    return (color) => (ctx, w, h) => {
      const R = SL.makeRng(seed * 131 + 7);
      const cx = w / 2, cy = h / 2;
      ctx.globalCompositeOperation = 'lighter';
      const deep = C.mix(color, '#ff2a2a', 0.55);
      const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, w / 2);
      halo.addColorStop(0, C.rgba(deep, 0.55));
      halo.addColorStop(0.5, C.rgba(deep, 0.18));
      halo.addColorStop(1, C.rgba(deep, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      const glowC = A.glow(color, 32, { core: C.mix(color, '#fff2b0', 0.6) });
      const n = 13;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + R.range(-0.2, 0.2);
        const len = R.range(15, 25);
        for (let j = 0; j < 5; j++) {
          const k = j / 4, rr = 6.5 * (1 - k * 0.7);
          ctx.globalAlpha = 0.5 * (1 - k * 0.8);
          const x = cx + Math.cos(a) * (8 + k * len), y = cy + Math.sin(a) * (8 + k * len);
          ctx.drawImage(glowC, x - rr, y - rr, rr * 2, rr * 2);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createRadialGradient(cx - 1, cy - 1.5, 0, cx, cy, 16);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.32, '#fff6c8');
      g.addColorStop(0.55, '#ffd36a');
      g.addColorStop(0.8, color);
      g.addColorStop(1, C.rgba(deep, 0.85));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, TAU);
      ctx.fill();
    };
  }
  const SPARK_GEN = [sparkGen(1), sparkGen(2), sparkGen(3)];
  const FLARE_GEN = [flareGen(1), flareGen(2), flareGen(3)];

  const SPR = {
    orb: (c) => sprite('orb', c, GEN.orb, 32, 32),
    orbBig: (c) => sprite('orbBig', c, GEN.orbBig, 44, 44),
    orb_huge: (c) => sprite('orb_huge', c, GEN.orb_huge, 70, 70),
    hugeRing: (c) => sprite('hugeRing', c, GEN.hugeRing, 64, 64),
    needle: (c) => sprite('needle', c, GEN.needle, 34, 14),
    shard: (c) => sprite('shard', c, GEN.shard, 30, 30),
    petal: (c) => sprite('petal', c, GEN.petal, 30, 20),
    mine: (c) => sprite('mine', c, GEN.mine, 24, 24, 1),
    mineLit: (c) => sprite('mineLit', c, GEN.mineLit, 40, 40),
    missile: (c) => sprite('missile', c, GEN.missile, 26, 16),
    spark: (c, i) => sprite('spark' + i, c, SPARK_GEN[i], 30, 22),
    flare: (c, i) => sprite('flare' + i, c, FLARE_GEN[i], 64, 64),
    void_orb: (c) => sprite('void_orb', c, GEN.void_orb, 34, 34),
    voidShimmer: (c) => sprite('voidShimmer', c, GEN.voidShimmer, 34, 34),
  };

  // ------------------------------------------------------------------ bullet draw helpers
  let B0 = null, BS = 1;
  function beginDraw() { B0 = SL.render.base; BS = B0.s; }
  function blit(ctx, s, x, y, rot, sc, alpha, add) {
    const w = s.cw * sc, h = s.ch * sc;
    ctx.globalAlpha = alpha;
    if (add) ctx.globalCompositeOperation = 'lighter';
    if (rot) {
      const c = Math.cos(rot) * BS, sn = Math.sin(rot) * BS;
      ctx.setTransform(c, sn, -sn, c, B0.x + x * BS, B0.y + y * BS);
      ctx.drawImage(s.canvas, -w / 2, -h / 2, w, h);
      ctx.setTransform(BS, 0, 0, BS, B0.x, B0.y);
    } else ctx.drawImage(s.canvas, x - w / 2, y - h / 2, w, h);
    if (add) ctx.globalCompositeOperation = 'source-over';
  }
  /** Spawn telegraph (core delay): grows in, half transparent. Returns [scale, alpha]. */
  const DK = [1, 1];
  function delayK(b) {
    if (b.delay > 0 && b.delay0 > 0) {
      const k = 1 - b.delay / b.delay0;
      DK[0] = b.scale * (0.35 + 0.65 * k);
      DK[1] = 0.45 + 0.4 * k;
    } else {
      DK[0] = b.scale;
      DK[1] = 1;
    }
    return DK;
  }
  function hash01(x) { const s = Math.sin(x * 12.9898) * 43758.5453; return s - Math.floor(s); }

  // ------------------------------------------------------------------ bullet behaviors
  function mineInit(b, o) {
    b.data.s0 = b.speed;
    b.data.mt = -1;
    b.data.fz = o.life || 6;
    b.life = 0;
    b.spr = SPR.mine(b.color);
  }
  function mineUpdate(b, dt) {
    const d = b.data;
    if (b.age < 0.4) {
      const sp = d.s0 * (1 - b.age / 0.4);
      b.speed = sp;
      b.vx = Math.cos(b.angle) * sp;
      b.vy = Math.sin(b.angle) * sp;
    } else {
      const k = Math.exp(-6 * dt);
      b.vx *= k;
      b.vy *= k;
      b.speed *= k;
    }
    if (d.mt < 0) {
      if (b.age >= 0.5 && nearPlayer(b.x, b.y, 90)) {
        d.mt = b.age;
        U.sfx('mine_arm', { x: b.x });
      } else if (b.age >= d.fz) {
        b.dead = true;
        SL.fx.emit({ x: b.x, y: b.y, life: 0.5, size: 18, size2: 30, color: '#5a5f70', alpha: 0.5, shape: 'smoke' });
        SL.fx.emit({ x: b.x, y: b.y, life: 0.25, size: 26, size2: 6, color: b.color, alpha: 0.8 });
      }
    } else if (b.age - d.mt >= 0.3) {
      b.dead = true;
      const tb = isTuned(b.owner, null) ? missionTune().bulletSpeed || 1 : 1;
      const so = passOpts(EMPTY_O, b.owner, 1);
      so.color = b.color;
      const off = SL.rng.next() * TAU;
      for (let i = 0; i < 8; i++) shoot(b.x, b.y, off + (i / 8) * TAU, 160 * tb, 'orb', so, null, false);
      SL.fx.emit({ x: b.x, y: b.y, life: 0.22, size: 54, size2: 12, color: b.color, alpha: 1 });
      SL.fx.sparks(b.x, b.y, { count: 8, color: b.color, speed: 260, life: 0.3 });
      U.sfx('enemy_fire', { x: b.x });
    }
  }
  const EMPTY_O = Object.freeze({});
  function mineDraw(b, ctx) {
    beginDraw();
    const d = b.data, dk = delayK(b);
    let sc = dk[0], al = dk[1], lit;
    if (d.mt >= 0) {
      const k = U.clamp((b.age - d.mt) / 0.3, 0, 1);
      sc *= 1 + 0.25 * k;
      lit = (b.age * 16) % 1 < 0.5 ? 1 : 0.45;
    } else if (b.age >= 0.5) lit = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(b.age * TAU * 4));
    else lit = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(b.age * TAU * 2));
    if (d.fz - b.age < 0.6 && d.mt < 0) al *= (b.age * 12) % 1 < 0.5 ? 1 : 0.55;
    blit(ctx, b.spr || SPR.mine(b.color), b.x, b.y, b.rot, sc, al, false);
    blit(ctx, SPR.mineLit(b.color), b.x, b.y, b.rot, sc, al * lit, true);
    if (d.mt >= 0) A.drawGlow(ctx, b.x, b.y, 26 * sc, '#ffffff', 0.5 * lit);
    ctx.globalAlpha = 1;
  }

  function missileInit(b, o) {
    const bs = diff().bulletSpeed || 1;
    if (!o.accel) b.accel = 140 * bs;
    if (o.maxSpeed == null) b.maxSpeed = 260 * bs;
    if (!o.homing) {
      b.homing = 1.6;
      b.homingTime = o.homingTime != null ? o.homingTime : 2.5;
    }
    b.data.hp = 10;
    b.data.st = 0;
    b.spr = SPR.missile(b.color);
  }
  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - px, qy = ay + dy * t - py;
    return qx * qx + qy * qy;
  }
  function missileUpdate(b, dt) {
    const d = b.data;
    // shootable: player bolts (swept) and player beams
    const pbs = SL.world.pbullets;
    for (let i = 0; i < pbs.length && !b.dead; i++) {
      const p = pbs[i];
      if (p.dead) continue;
      const rr = b.r + (p.r || 6) + 2;
      const ax = p.px != null ? p.px : p.x, ay = p.py != null ? p.py : p.y;
      if (segDist2(b.x, b.y, ax, ay, p.x, p.y) > rr * rr) continue;
      d.hp -= p.dmg || 7;
      if (!p.pierce) p.dead = true;
      SL.fx.hit(b.x, b.y, '#ffd0a0', { dir: -HALF });
      if (d.hp <= 0) missilePop(b);
    }
    const bms = SL.world.beams;
    for (let i = 0; i < bms.length && !b.dead; i++) {
      const bm = bms[i];
      if (bm.dead || !bm.active) continue;
      const len = bm.hitLength != null ? bm.hitLength : bm.length || 1400;
      const hw = (bm.width || 20) * 0.5 + b.r;
      if (segDist2(b.x, b.y, bm.x, bm.y, bm.x + Math.cos(bm.angle) * len, bm.y + Math.sin(bm.angle) * len) > hw * hw) continue;
      d.hp -= (bm.dps || 300) * dt;
      if (d.hp <= 0) missilePop(b);
    }
    if (b.dead) return;
    d.st -= dt;
    if (d.st <= 0) {
      d.st = 0.035;
      const c = Math.cos(b.angle), s = Math.sin(b.angle);
      SL.fx.emit({ x: b.x - c * 12, y: b.y - s * 12, vx: -c * 50 + (Math.random() - 0.5) * 30, vy: -s * 50 + (Math.random() - 0.5) * 30,
        life: 0.5, size: 5, size2: 15, color: '#7a6a72', alpha: 0.42, alpha2: 0, shape: 'smoke', drag: 2.5 });
    }
  }
  function missilePop(b) {
    if (b.dead) return;
    b.dead = true;
    SL.fx.explode(b.x, b.y, { size: 's', scale: 0.55, debris: false, shake: false });
    if (SL.game && SL.game.state === 'mission' && SL.game.addScore) SL.game.addScore(20);
  }
  function missileDraw(b, ctx) {
    beginDraw();
    const dk = delayK(b), sc = dk[0];
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    // exhaust plume pointing backwards: flame draws +y, so rotate +y onto -velocity
    const ra = b.rot + HALF;
    const ca = Math.cos(ra) * BS, sa = Math.sin(ra) * BS;
    const tx = b.x - c * 10 * sc, ty = b.y - s * 10 * sc;
    ctx.globalAlpha = dk[1];
    ctx.setTransform(ca, sa, -sa, ca, B0.x + tx * BS, B0.y + ty * BS);
    A.flame(ctx, 0, 0, 9 * sc, (20 + 10 * Math.min(1, b.speed / 260)) * sc, '#ffffff', b.color, SL.time.t + b.bx * 0.01);
    ctx.setTransform(BS, 0, 0, BS, B0.x, B0.y);
    A.drawGlow(ctx, b.x - c * 6 * sc, b.y - s * 6 * sc, 22 * sc, b.color, 0.55 * dk[1]);
    blit(ctx, b.spr || SPR.missile(b.color), b.x, b.y, b.rot, sc, dk[1], false);
    const blink = (b.age * 5) % 1 < 0.5;
    A.drawGlow(ctx, b.x + c * 11 * sc, b.y + s * 11 * sc, blink ? 12 : 6, WARN, blink ? 1 : 0.55);
    ctx.globalAlpha = 1;
  }

  function sparkInit(b, o) {
    if (!o.wave) {
      b.waveAmp = 18;
      b.waveFreq = 12;
    }
    b.spr = SPR.spark(b.color, 0);
  }
  function sparkDraw(b, ctx) {
    beginDraw();
    const dk = delayK(b);
    const i = (Math.floor(SL.time.t * 18 + hash01(b.bx * 0.013 + b.by * 0.007) * 3) % 3 + 3) % 3;
    blit(ctx, SPR.spark(b.color, i), b.x, b.y, b.rot, dk[0], dk[1], false);
    ctx.globalAlpha = 1;
  }

  function petalUpdate(b) {
    if (b.turn && b.age >= (b.data.turnT || 1.2)) b.turn = 0;
  }

  function flareInit(b) { b.spr = SPR.flare(b.color, 0); }
  function flareDraw(b, ctx) {
    beginDraw();
    const dk = delayK(b);
    const t = SL.time.t + hash01(b.bx * 0.01) * 5;
    const i = Math.floor(t * 14) % 3;
    const fl = 1 + 0.07 * Math.sin(t * 31) + 0.05 * Math.sin(t * 47);
    blit(ctx, SPR.flare(b.color, i), b.x, b.y, b.rot, dk[0] * fl, dk[1], false);
    A.drawGlow(ctx, b.x, b.y, 30 * dk[0], b.color, 0.35);
    ctx.globalAlpha = 1;
  }

  function hugeInit(b) { b.spr = SPR.orb_huge(b.color); }
  function hugeDraw(b, ctx) {
    beginDraw();
    const dk = delayK(b);
    const ph = 0.5 + 0.5 * Math.sin((b.age * 3) * TAU);
    blit(ctx, b.spr || SPR.orb_huge(b.color), b.x, b.y, 0, dk[0], dk[1], false);
    blit(ctx, SPR.hugeRing(b.color), b.x, b.y, 0, dk[0] * (0.96 + 0.1 * ph), dk[1] * (0.35 + 0.55 * ph), true);
    ctx.globalAlpha = 1;
  }

  function voidInit(b) { b.spr = SPR.void_orb(b.color); }
  function pullOn(b, g, k, dt) {
    if (!g || !(g.range > 0) || !g.pull) return;
    const dx = g.x - b.x, dy = g.y - b.y, d2 = dx * dx + dy * dy;
    if (d2 >= g.range * g.range || d2 < 1) return;
    const d = Math.sqrt(d2), f = 1 - d / g.range, a = g.pull * f * f * k * dt;
    b.vx += (dx / d) * a;
    b.vy += (dy / d) * a;
    b.speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    b.angle = Math.atan2(b.vy, b.vx);
  }
  /** Gravity coupling 2.5: core bending gives 0.6x (hazards), this adds 1.5x of the local pull on top. */
  function voidUpdate(b, dt) {
    const hz = SL.world.hazards;
    for (let i = 0; i < hz.length; i++) {
      const h = hz[i];
      if (!h.dead && h.gravity) pullOn(b, h.gravity, 1.5, dt);
    }
    const en = SL.world.enemies;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (e.dead || (!e.gravity && !e.gravityList)) continue;
      if (e.gravity) pullOn(b, e.gravity, 1.5, dt);
      if (e.gravityList) for (let j = 0; j < e.gravityList.length; j++) pullOn(b, e.gravityList[j], 1.5, dt);
    }
  }
  function voidDraw(b, ctx) {
    beginDraw();
    const dk = delayK(b);
    blit(ctx, b.spr || SPR.void_orb(b.color), b.x, b.y, 0, dk[0], dk[1], false);
    const sh = 0.55 + 0.45 * Math.sin(b.age * 7.3);
    blit(ctx, SPR.voidShimmer(b.color), b.x, b.y, b.age * 3.1, dk[0] * (0.94 + 0.08 * sh), dk[1] * (0.35 + 0.4 * sh), true);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ type registry
  const spriteFor = (kind) => (id, color) => SPR[kind](color);
  SL.ebulletTypes.define('orb', { r: 6, damage: 's', color: EB.pink, spriteFor: spriteFor('orb') });
  SL.ebulletTypes.define('orbBig', { r: 11, damage: 'm', color: EB.orange, spriteFor: spriteFor('orbBig') });
  SL.ebulletTypes.define('orb_huge', { r: 20, damage: 'l', color: EB.red, init: hugeInit, draw: hugeDraw });
  SL.ebulletTypes.define('needle', { r: 4, damage: 's', color: EB.violet, orient: true, spriteFor: spriteFor('needle') });
  SL.ebulletTypes.define('shard', { r: 6, damage: 's', color: EB.orange, spin: 9, spriteFor: spriteFor('shard') });
  SL.ebulletTypes.define('mine', { r: 10, damage: 'm', color: EB.pink, spin: 0.9, init: mineInit, update: mineUpdate, draw: mineDraw });
  SL.ebulletTypes.define('missile', { r: 8, damage: 'm', color: EB.orange, orient: true, init: missileInit, update: missileUpdate, draw: missileDraw });
  SL.ebulletTypes.define('spark', { r: 5, damage: 's', color: EB.violet, orient: true, init: sparkInit, draw: sparkDraw });
  SL.ebulletTypes.define('petal', { r: 6, damage: 's', color: EB.pink, orient: true, update: petalUpdate, spriteFor: spriteFor('petal') });
  SL.ebulletTypes.define('flare', { r: 16, damage: 'l', color: EB.orange, spin: 1.4, init: flareInit, draw: flareDraw });
  SL.ebulletTypes.define('void_orb', { r: 8, damage: 'm', color: VIOLET, init: voidInit, update: voidUpdate, draw: voidDraw });

  // SL.fireEnemy wrapper: run the bullet type's own init/update hooks (kept alongside a caller's opts.update)
  const coreFire = SL.fireEnemy;
  function runBoth(b, dt) {
    b.type.update(b, dt);
    if (!b.dead && b.data._uu) b.data._uu(b, dt);
  }
  SL.fireEnemy = function (x, y, angle, speed, type, opts) {
    const b = coreFire(x, y, angle, speed, type, opts);
    const t = b.type;
    if (t && (t.init || t.update)) {
      const o = opts || EMPTY_O;
      if (t.update) {
        if (b.update && b.update !== t.update) { b.data._uu = b.update; b.update = runBoth; } else b.update = t.update;
      }
      if (t.init) {
        try { t.init(b, o); } catch (err) {
          if (!t._initBroken) { t._initBroken = true; console.error('[SL] ebullet "' + b.typeId + '" init threw:', err); }
        }
      }
    }
    return b;
  };

  // ------------------------------------------------------------------ beam restyle and warning markers
  const beamCache = new Map();
  function beamSet(color) {
    let S = beamCache.get(color);
    if (S) return S;
    const k = 'ebx:beam:' + color;
    if (!A.has(k + ':body')) {
      A.define(k + ':body', 8, 64, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, C.rgba(color, 0));
        g.addColorStop(0.1, C.rgba(color, 0.28));
        g.addColorStop(0.26, C.rgba(color, 0.92));
        g.addColorStop(0.38, C.rgba(C.mix(color, '#ffffff', 0.45), 1));
        g.addColorStop(0.5, C.rgba(C.mix(color, '#ffffff', 0.8), 1));
        g.addColorStop(0.62, C.rgba(C.mix(color, '#ffffff', 0.45), 1));
        g.addColorStop(0.74, C.rgba(color, 0.92));
        g.addColorStop(0.9, C.rgba(color, 0.28));
        g.addColorStop(1, C.rgba(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }, { pad: 0 });
      A.define(k + ':glow', 8, 64, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, C.rgba(color, 0));
        g.addColorStop(0.3, C.rgba(color, 0.18));
        g.addColorStop(0.5, C.rgba(color, 0.5));
        g.addColorStop(0.7, C.rgba(color, 0.18));
        g.addColorStop(1, C.rgba(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }, { pad: 0 });
      A.define(k + ':core', 8, 32, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.3, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }, { pad: 0 });
      A.define(k + ':spark', 18, 10, (ctx, w, h) => {
        const p = A.poly([1, h * 0.7, 6, h * 0.25, 10, h * 0.62, 17, h * 0.2], true);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.stroke(p);
        ctx.restore();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.9;
        ctx.stroke(p);
      }, { pad: 2, res: 2 });
    }
    S = { body: A.get(k + ':body'), glow: A.get(k + ':glow'), core: A.get(k + ':core'), spark: A.get(k + ':spark') };
    beamCache.set(color, S);
    return S;
  }
  function visLen(x, y, c, s) {
    let t = 1800;
    if (c > 1e-6) t = Math.min(t, (W + 40 - x) / c); else if (c < -1e-6) t = Math.min(t, (-40 - x) / c);
    if (s > 1e-6) t = Math.min(t, (H + 40 - y) / s); else if (s < -1e-6) t = Math.min(t, (-40 - y) / s);
    return Math.max(0, t);
  }
  function warnLine(ctx, len, white, alpha, color) {
    const pulse = 0.5 + 0.5 * Math.sin(SL.time.t * TAU * 6);
    ctx.globalAlpha = white ? 0.95 : alpha * (0.6 + 0.4 * pulse);
    ctx.fillStyle = white ? '#ffffff' : color || WARN;
    ctx.fillRect(0, -1, len, 2);
  }
  function drawSweepArrow(ctx, bm) {
    const to = bm.sweep.to;
    const d = U.angleDiff(bm.angle, to);
    const R = 120;
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = WARN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, d, d < 0);
    ctx.stroke();
    const ex = Math.cos(d) * R, ey = Math.sin(d) * R, tg = d >= 0 ? d + HALF : d - HALF;
    ctx.fillStyle = WARN;
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(tg) * 10, ey + Math.sin(tg) * 10);
    ctx.lineTo(ex + Math.cos(tg + 2.5) * 9, ey + Math.sin(tg + 2.5) * 9);
    ctx.lineTo(ex + Math.cos(tg - 2.5) * 9, ey + Math.sin(tg - 2.5) * 9);
    ctx.closePath();
    ctx.fill();
    // faint end line
    ctx.rotate(d);
    ctx.globalAlpha = 0.16;
    ctx.fillRect(0, -1, 900, 2);
    ctx.rotate(-d);
  }
  function drawArc(bm, ctx, k, w) {
    // stormcaller pair arc: a crackling violet-white lightning bolt between the coils
    const len = bm.length;
    const segs = Math.max(4, Math.min(16, (len / 34) | 0));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let i = 1; i < segs; i++) ctx.lineTo((i / segs) * len, (Math.random() - 0.5) * w * 1.1);
      ctx.lineTo(len, 0);
      ctx.globalAlpha = k * (pass ? 0.9 : 0.55);
      ctx.strokeStyle = pass ? '#ffffff' : C.mix(bm.color, '#ffffff', 0.35);
      ctx.lineWidth = pass ? 2 : 5;
      ctx.stroke();
    }
  }
  function drawBeam(bm, ctx) {
    const fx = bm.data && bm.data.fx;
    if (fx) { drawWarn(bm, ctx, fx); return; }
    beginDraw();
    const t = SL.time.t;
    const ca = Math.cos(bm.angle), sa = Math.sin(bm.angle);
    const arc = bm.data && bm.data.arc;
    const len = arc ? bm.length : Math.min(bm.length, visLen(bm.x, bm.y, ca, sa));
    ctx.setTransform(ca * BS, sa * BS, -sa * BS, ca * BS, B0.x + bm.x * BS, B0.y + bm.y * BS);
    if (bm.state === 'telegraph') {
      const k = U.clamp(bm.t / Math.max(0.01, bm.telegraph), 0, 1);
      const white = bm.telegraph - bm.t <= 0.15;
      if (!arc) {
        const hw = bm.width * 0.5;
        ctx.globalAlpha = 0.07 + 0.12 * k;
        ctx.fillStyle = WARN;
        ctx.fillRect(0, -hw, len, 1);
        ctx.fillRect(0, hw - 1, len, 1);
      }
      warnLine(ctx, len, white, 0.45, arc ? '#c99bff' : WARN);
      if (bm.sweep && bm.sweep.to != null) drawSweepArrow(ctx, bm);
      ctx.setTransform(BS, 0, 0, BS, B0.x, B0.y);
      A.drawGlow(ctx, bm.x, bm.y, 8 + 24 * k, bm.color, 0.3 + 0.6 * k);
      if (arc) A.drawGlow(ctx, bm.x + ca * len, bm.y + sa * len, 8 + 24 * k, bm.color, 0.3 + 0.6 * k);
      ctx.globalAlpha = 1;
      return;
    }
    const k = bm.state === 'fade' ? Math.max(0, 1 - bm.fade / 0.22) : Math.min(1, bm.t / 0.08);
    const flick = 1 + 0.05 * Math.sin(t * 57) + 0.03 * Math.sin(t * 91);
    const w = bm.width * (0.7 + 0.3 * k) * flick;
    const S = beamSet(bm.color);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * k;
    ctx.drawImage(S.glow.canvas, 0, -w * 1.3, len, w * 2.6);
    if (arc) drawArc(bm, ctx, k, w);
    else {
      ctx.globalAlpha = 0.95 * k;
      ctx.drawImage(S.body.canvas, 0, -w / 2, len, w);
      ctx.globalAlpha = k;
      ctx.drawImage(S.core.canvas, 0, -w * 0.19, len, w * 0.38);
      // crackling edge sparks
      const n = Math.min(18, 4 + ((len / 80) | 0));
      const sp = S.spark, sw = sp.cw, sh = sp.ch;
      for (let i = 0; i < n; i++) {
        const d = Math.random() * len, side = Math.random() < 0.5 ? -1 : 1;
        const off = side * (w * 0.4 + Math.random() * w * 0.3);
        const sc = 0.6 + Math.random() * 0.9;
        ctx.globalAlpha = k * (0.45 + Math.random() * 0.55);
        ctx.drawImage(sp.canvas, d - sw * sc * 0.5, off - sh * sc * 0.5, sw * sc, sh * sc);
      }
    }
    ctx.setTransform(BS, 0, 0, BS, B0.x, B0.y);
    A.drawGlow(ctx, bm.x, bm.y, w * 1.7, bm.color, k);
    A.drawGlow(ctx, bm.x, bm.y, w * 0.8, '#ffffff', 0.85 * k);
    if (arc) {
      A.drawGlow(ctx, bm.x + ca * len, bm.y + sa * len, w * 1.7, bm.color, k);
      A.drawGlow(ctx, bm.x + ca * len, bm.y + sa * len, w * 0.8, '#ffffff', 0.85 * k);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  function chevron(ctx, x, y, s, up) {
    const d = up ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x - s, y - d * s * 0.2);
    ctx.lineTo(x, y + d * s * 0.6 - d * s);
    ctx.lineTo(x + s, y - d * s * 0.2);
    ctx.stroke();
  }
  function drawWarn(bm, ctx, fx) {
    beginDraw();
    const t = SL.time.t, d = bm.data;
    const left = d.life - bm.t;
    const pulse = 0.5 + 0.5 * Math.sin(t * TAU * 6);
    if (fx === 'line') {
      const ca = Math.cos(bm.angle), sa = Math.sin(bm.angle);
      const len = Math.min(bm.length, visLen(bm.x, bm.y, ca, sa));
      ctx.setTransform(ca * BS, sa * BS, -sa * BS, ca * BS, B0.x + bm.x * BS, B0.y + bm.y * BS);
      warnLine(ctx, len, d.flash || left <= 0.15, 0.45, bm.color);
      ctx.setTransform(BS, 0, 0, BS, B0.x, B0.y);
      if (d.flash) A.drawGlow(ctx, bm.x, bm.y, 26, '#ffffff', 0.9);
    } else if (fx === 'charge') {
      const k = U.clamp(bm.t / Math.max(0.05, d.life), 0, 1);
      const r = d.r;
      A.drawGlow(ctx, bm.x, bm.y, r * (0.5 + 1.1 * k), bm.color, 0.35 + 0.65 * k);
      A.drawGlow(ctx, bm.x, bm.y, r * (0.2 + 0.45 * k), '#ffffff', 0.25 + 0.75 * k);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = C.mix(bm.color, '#ffffff', 0.5);
      for (let i = 0; i < 6; i++) {
        const f = (k * 2.2 + i / 6) % 1;
        const a = i * 1.047 + bm.t * 2.4;
        const rr = r * 2.2 * (1 - f);
        ctx.globalAlpha = f * 0.9;
        ctx.beginPath();
        ctx.arc(bm.x + Math.cos(a) * rr, bm.y + Math.sin(a) * rr, 1.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (fx === 'chevrons') {
      const k = U.clamp(bm.t / 0.25, 0, 1);
      const y0 = H - 18;
      A.drawGlow(ctx, bm.x, H + 10, 120, WARN, (0.45 + 0.35 * pulse) * k);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < 3; i++) {
        const ph = (t * 3 + i / 3) % 1;
        ctx.globalAlpha = k * (0.35 + 0.65 * (1 - Math.abs(ph - 0.5) * 2)) * (left <= 0.15 ? 1 : 0.9);
        ctx.strokeStyle = left <= 0.15 ? '#ffffff' : WARN;
        chevron(ctx, bm.x, y0 - i * 22, 16, true);
      }
    } else if (fx === 'edge') {
      const k = U.clamp(bm.t / 0.25, 0, 1);
      const right = d.side === 'right';
      const ex = right ? W + 10 : -10;
      A.drawGlow(ctx, ex, bm.y, 110, WARN, (0.4 + 0.35 * pulse) * k);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = left <= 0.15 ? '#ffffff' : WARN;
      for (let i = 0; i < 3; i++) {
        const ph = (t * 3 + i / 3) % 1;
        ctx.globalAlpha = k * (0.35 + 0.65 * (1 - Math.abs(ph - 0.5) * 2));
        const x = right ? W - 18 - i * 20 : 18 + i * 20, s = 14;
        ctx.beginPath();
        ctx.moveTo(x + (right ? 0.2 : -0.2) * s, bm.y - s);
        ctx.lineTo(x + (right ? -0.6 : 0.6) * s, bm.y);
        ctx.lineTo(x + (right ? 0.2 : -0.2) * s, bm.y + s);
        ctx.stroke();
      }
    } else if (fx === 'ring') {
      const k = U.clamp(bm.t / 0.18, 0, 1);
      const r = d.r * (1.25 - 0.25 * k);
      ctx.globalAlpha = (0.55 + 0.35 * pulse) * k;
      ctx.strokeStyle = left <= 0.15 ? '#ffffff' : bm.color;
      ctx.lineWidth = 2;
      if (d.dashed !== false) ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.arc(bm.x, bm.y, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      A.drawGlow(ctx, bm.x, bm.y, r * 1.3, bm.color, 0.25 * k);
    }
    ctx.globalAlpha = 1;
  }
  SL.ebulletTypes.define('beam', { color: EB.pink, draw: drawBeam });

  /** Non-damaging marker drawn in the beam layer (above enemies): fx 'line' | 'charge' | 'chevrons' | 'edge' | 'ring'. */
  function warn(src, o) {
    o = o || EMPTY_O;
    const w = SL.world;
    const ox = o.ox || 0, oy = o.oy || 0;
    const bm = {
      kind: 'ebeam', src: src || null, ox, oy, x: (src ? src.x : num(o.x, W / 2)) + ox, y: (src ? src.y : num(o.y, 0)) + oy,
      angle: num(o.angle, HALF), angle0: 0, width: o.width || 2, length: o.length || 1800, telegraph: Infinity, duration: 0,
      sweep: 0, color: o.color || WARN, follow: !!src && o.follow !== false, dps: 0, t: 0, state: 'telegraph', fade: 0,
      dead: false, track: 0, warn: true,
      data: { fx: o.fx || 'line', life: o.life != null ? o.life : 1, r: o.r || 30, flash: false, side: o.side, dashed: o.dashed },
    };
    if (w.ebeams.length >= w.CAPS.ebeams - 4) { bm.dead = true; return bm; }
    w.ebeams.push(bm);
    return bm;
  }
  /** Charge glow on an emitter before a big volley (GDD 7.1), with sfx enemy_charge. */
  function charge(src, o) {
    o = o || EMPTY_O;
    U.sfx('enemy_charge', { x: src ? src.x : W / 2 });
    return warn(src, { fx: 'charge', ox: o.ox, oy: o.oy, x: o.x, y: o.y, life: o.time != null ? o.time : 0.45, color: o.color || EB.pink, r: o.r || 18 });
  }

  // ------------------------------------------------------------------ emitters
  const active = [];
  function emStop() {
    this.done = true;
    if (this.warn) { this.warn.dead = true; this.warn = null; }
  }
  function newEm(kind, src, o, step) {
    return { kind, src, o, t: 0, dur: Infinity, done: false, out: [], step, d: {}, warn: null, stop: emStop };
  }
  function srcGone(s) { return !s || s.dead || s.dying; }
  function runEm(em, dt) {
    em.out.length = 0;
    if (em.done) return em.out;
    if (srcGone(em.src)) { em.stop(); return em.out; }
    em.t += dt;
    try { em.step(em, dt); } catch (err) {
      console.error('[SL] pattern "' + em.kind + '" step threw:', err);
      em.stop();
    }
    if (em.t >= em.dur) em.stop();
    if (em.out.length) U.sfx('enemy_fire', { x: em.src.x });
    return em.out;
  }
  /** (state, src, dt, opts): step a stateful emitter now; (src, opts): start a self-driven one (returned). */
  function continuous(kind, step, defDur) {
    return function (a, b, c, d) {
      if (typeof c === 'number') {
        const state = a || {};
        const o = d || EMPTY_O;
        let em = state.em;
        if (!em || em.kind !== kind) {
          em = state.em = newEm(kind, b, o, step);
          em.dur = o.duration != null ? o.duration : Infinity;
        }
        em.src = b;
        em.o = o;
        return runEm(em, c);
      }
      const o = b || EMPTY_O;
      const em = newEm(kind, a, o, step);
      em.dur = o.duration != null ? o.duration : defDur;
      active.push(em);
      return em;
    };
  }
  SL.bus.on('tick', (ev) => {
    const dt = ev && ev.dt;
    if (!(dt > 0)) return;
    for (let i = active.length - 1; i >= 0; i--) {
      const em = active[i];
      runEm(em, dt);
      if (em.done) active.splice(i, 1);
    }
    const eb = SL.world.ebeams;
    for (let i = 0; i < eb.length; i++) {
      const bm = eb[i];
      if (!bm.dead && bm.warn && bm.t >= bm.data.life) bm.dead = true;
    }
  });
  SL.bus.on('worldReset', () => { active.length = 0; });
  function softCap() { return SL.world.ebullets.length > 520 ? 0.5 : 1; }
  function ex(em) { return em.src.x + (em.o.ox || 0); }
  function ey(em) { return em.src.y + (em.o.oy || 0); }

  // ------------------------------------------------------------------ volley patterns
  function aimed(src, tgt, o) {
    o = o || EMPTY_O;
    const x = src.x + pick(o.ox, 0), y = src.y + pick(o.oy, 0);
    const n = Math.max(1, o.count || 1);
    const spread = o.spread != null ? o.spread : 0.18 * (n - 1);
    const a0 = (o.angle != null ? o.angle : aimFrom(src, x, y, tgt)) + (o.angleOffset || 0);
    const tb = tuneOf(src, o).bulletSpeed || 1;
    const so = passOpts(o, src, tb), sp = num(o.speed, 240) * tb, type = o.type || 'orb';
    const out = [];
    for (let i = 0; i < n; i++) shoot(x, y, n === 1 ? a0 : a0 + (i / (n - 1) - 0.5) * spread, sp, type, so, out);
    return finish(out, o, x);
  }
  function fan(src, angle, o) {
    o = o || EMPTY_O;
    const x = src.x + (o.ox || 0), y = src.y + (o.oy || 0);
    const n = Math.max(1, o.count || 5), spread = o.spread != null ? o.spread : 0.9;
    const a0 = angle === 'aim' ? aimFrom(src, x, y, o.target) : num(angle, HALF);
    const tb = tuneOf(src, o).bulletSpeed || 1;
    const so = passOpts(o, src, tb), sp = num(o.speed, 220) * tb, type = o.type || 'orb';
    const out = [];
    for (let i = 0; i < n; i++) shoot(x, y, n === 1 ? a0 : a0 + (i / (n - 1) - 0.5) * spread, sp, type, so, out);
    return finish(out, o, x);
  }
  function ring(src, o) {
    o = o || EMPTY_O;
    const x = src.x + (o.ox || 0), y = src.y + (o.oy || 0);
    const n = Math.max(3, scaleCount(o.count || 12, frOf(src, o)) + (o.extra || 0));
    let off = o.offset || 0;
    if (o.aim) off += aimFrom(src, x, y, o.target);
    const tb = tuneOf(src, o).bulletSpeed || 1;
    const so = passOpts(o, src, tb), sp = num(o.speed, 180) * tb, type = o.type || 'orb';
    const out = [];
    for (let i = 0; i < n; i++) shoot(x, y, off + (i / n) * TAU, sp, type, so, out);
    return finish(out, o, x);
  }
  function stagger(src, o, st) {
    const n = Math.max(3, scaleCount(o.count || 12, frOf(src, o)) + (o.extra || 0));
    st.rsPar = !st.rsPar;
    const off = (o.offset || 0) + (st.rsPar ? PI / n : 0);
    return ring(src, Object.assign({}, o, { count: n, fr: 1, extra: 0, offset: off, speed: num(o.speed, 150) }));
  }
  const ringStaggerEm = continuous('ring_stagger', (em, dt) => {
    const o = em.o, d = em.d;
    if (d.next == null) d.next = 0; else d.next -= dt;
    if (d.next <= 0) {
      d.next += num(o.every, 2.2) / frOf(em.src, o);
      const out = stagger(em.src, o, d);
      for (let i = 0; i < out.length; i++) em.out.push(out[i]);
    }
  }, 6.6);
  function ring_stagger(a, b, c, d) {
    if (typeof c === 'number') return ringStaggerEm(a, b, c, d);
    const o = b || EMPTY_O;
    if (o.every != null || o.duration != null) return ringStaggerEm(a, o);
    const st = o.state || (a.data && typeof a.data === 'object' ? a.data : a);
    return stagger(a, o, st);
  }
  function wave(src, angle, o) {
    o = o || EMPTY_O;
    const w = { amp: num(o.amp, 40), freq: num(o.freq, 1.2) };
    return fan(src, angle == null ? HALF : angle, Object.assign({}, o, { count: o.count || 7, spread: o.spread != null ? o.spread : 1.0, speed: num(o.speed, 180), wave: w }));
  }
  function flower(src, o) {
    o = o || EMPTY_O;
    const x = src.x + (o.ox || 0), y = src.y + (o.oy || 0);
    const n = Math.max(4, scaleCount(o.count || 16, frOf(src, o)) + (o.extra || 0));
    const turn = num(o.turn, 0.9), off = o.offset || 0;
    const tb = tuneOf(src, o).bulletSpeed || 1;
    const so = passOpts(o, src, tb), sp = num(o.speed, 150) * tb, type = o.type || 'petal';
    const out = [];
    for (let i = 0; i < n; i++) {
      so.turn = (i % 2 ? -1 : 1) * turn;
      shoot(x, y, off + (i / n) * TAU, sp, type, so, out);
    }
    return finish(out, o, x);
  }
  function wall_gap(src, o) {
    o = o || EMPTY_O;
    const n = Math.max(2, o.count || 14), spacing = num(o.spacing, 52), gap = num(o.gap, 104);
    const y = src.y + (o.oy || 0);
    const span = (n - 1) * spacing;
    let cx = o.x != null ? o.x : src.x + (o.ox || 0);
    if (span >= W - 40) cx = W / 2; else cx = U.clamp(cx, span / 2 + 10, W - span / 2 - 10);
    const gx = o.gapX != null ? o.gapX : target(src).x;
    const tb = tuneOf(src, o).bulletSpeed || 1;
    const so = passOpts(o, src, tb), sp = num(o.speed, 140) * tb, type = o.type || 'orb';
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * spacing;
      if (Math.abs(x - gx) < gap / 2) continue;
      shoot(x, y, HALF, sp, type, so, out);
    }
    return finish(out, o, cx);
  }
  function homing_salvo(src, o) {
    o = o || EMPTY_O;
    const n = Math.max(1, o.count || 2), kick = num(o.kick, 120);
    const tb = tuneOf(src, o).bulletSpeed || 1;
    const sp0 = num(o.speed, 150);
    const so = passOpts(o, src, tb);
    so.accel = num(o.accel, 140) * tb;
    so.maxSpeed = num(o.maxSpeed, 260) * tb;
    so.homing = num(o.homing, 1.6);
    so.homingTime = num(o.homingTime, 2.5);
    const type = o.type || 'missile', out = [];
    const kickA = Math.asin(U.clamp(kick / Math.max(1, sp0), 0, 0.98));
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, row = (i / 2) | 0;
      const x = src.x + pick(o.ox, i) , y = src.y + pick(o.oy, i);
      const a = (o.angle != null ? o.angle : HALF) - side * (kickA + 0.18 * row);
      shoot(x, y, a, sp0 * tb, type, so, out);
    }
    if (out.length) U.sfx('missile_enemy', { x: src.x });
    return finish(out, o, src.x);
  }
  function split_shot(src, o) {
    o = o || EMPTY_O;
    const sp = o.split || {};
    const split = { at: num(o.at, 1.2), count: sp.count || 6, type: sp.type || 'shard', speed: num(sp.speed, 180) * (tuneOf(src, o).bulletSpeed || 1), spread: sp.spread, aim: sp.aim, color: sp.color };
    const a = o.angle != null ? o.angle : 'aim';
    return fan(src, a, Object.assign({}, o, { type: o.type || 'flare', count: o.count || 5, spread: o.spread != null ? o.spread : 0.9, speed: num(o.speed, 120), split }));
  }
  function gravity_sling(src, o) {
    o = o || EMPTY_O;
    let g = o.center || src.gravity || null;
    if (!g) {
      let bd = Infinity;
      for (const h of SL.world.hazards) {
        if (h.dead || !h.gravity) continue;
        const dd = U.dist2(h.gravity.x, h.gravity.y, src.x, src.y);
        if (dd < bd) { bd = dd; g = h.gravity; }
      }
    }
    const cx = g ? g.x : src.x, cy = g ? g.y : src.y;
    const n = Math.max(1, o.count || 8), dir = o.dir || 1;
    const R = num(o.radius, g && g !== src.gravity ? Math.max(90, Math.min(260, Math.hypot(src.x - cx, src.y - cy))) : 120);
    const tb = tuneOf(src, o).bulletSpeed || 1;
    const so = passOpts(o, src, tb), sp = num(o.speed, 200) * tb, type = o.type || 'void_orb';
    const off = o.offset != null ? o.offset : Math.atan2(src.y - cy, src.x - cx);
    const out = [];
    for (let i = 0; i < n; i++) {
      const th = off + (i / n) * TAU;
      shoot(cx + Math.cos(th) * R, cy + Math.sin(th) * R, th + dir * HALF, sp, type, so, out);
    }
    return finish(out, o, cx);
  }
  /** Bullets orbit the source, then release toward the target. */
  function orbitUpdate(b) {
    const d = b.data, v = d.vol;
    if (d.rel) return;
    const s = v.src;
    if (!srcGone(s)) { v.cx = s.x + v.ox; v.cy = s.y + v.oy; }
    const k = Math.min(1, b.age / 0.3);
    const a = d.a + v.w * b.age, r = v.R * (k * (2 - k));
    b.x = b.bx = v.cx + Math.cos(a) * r;
    b.y = b.by = v.cy + Math.sin(a) * r;
    if (b.age >= v.T || srcGone(s)) {
      d.rel = true;
      if (!v.aimed) {
        v.aimed = true;
        const t = target(srcGone(s) ? { x: v.cx, y: v.cy } : s);
        v.tx = t.x;
        v.ty = t.y;
      }
      const ang = Math.atan2(v.ty - b.y, v.tx - b.x);
      b.angle = ang;
      b.speed = v.sp;
      b.vx = Math.cos(ang) * v.sp;
      b.vy = Math.sin(ang) * v.sp;
      if (b.type.orient) b.rot = ang;
    }
  }
  function orbit_release(src, o) {
    o = o || EMPTY_O;
    const n = Math.max(1, o.count || 16);
    const tb = tuneOf(src, o).bulletSpeed || 1;
    const vol = { src, ox: o.ox || 0, oy: o.oy || 0, cx: src.x + (o.ox || 0), cy: src.y + (o.oy || 0), R: num(o.radius, 120),
      T: num(o.orbit, 1.2), w: num(o.spin, 2) * (o.dir || 1), sp: num(o.speed, 200) * tb * (diff().bulletSpeed || 1), aimed: false, tx: 0, ty: 0 };
    const so = passOpts(o, src, tb);
    so.update = orbitUpdate;
    const type = o.type || 'orb', out = [];
    for (let i = 0; i < n; i++) {
      const a = (o.offset || 0) + (i / n) * TAU;
      const b = shoot(vol.cx, vol.cy, a, 0, type, so, out);
      if (b) { b.data.vol = vol; b.data.a = a; b.data.rel = false; }
    }
    return finish(out, o, vol.cx);
  }

  // ------------------------------------------------------------------ timed and continuous patterns
  const burstEm = (em, dt) => {
    const o = em.o, d = em.d;
    d.next -= dt;
    while (d.next <= 0 && d.shot < d.shots) {
      d.next += num(o.gap, 0.12);
      volleyOf(em, d.shot++);
    }
    if (d.shot >= d.shots) em.stop();
  };
  function volleyOf(em, i) {
    const o = em.o, d = em.d;
    const oo = Object.assign({}, o, { ox: pick(o.ox, i), oy: pick(o.oy, i), speed: num(o.speed, 230) });
    if (o.lock) oo.angle = d.lockA;
    const out = aimed(em.src, o.target || null, oo);
    if (o.onShot) o.onShot(i, out);
    for (let k = 0; k < out.length; k++) em.out.push(out[k]);
    return out;
  }
  function burst(src, tgt, o) {
    o = Object.assign({}, o || EMPTY_O);
    if (tgt) o.target = tgt;
    const em = newEm('burst', src, o, burstEm);
    em.d = { next: 0, shot: 0, shots: Math.max(1, o.shots || 3), lockA: 0 };
    if (o.lock) em.d.lockA = aimFrom(src, src.x + pick(o.ox, 0), src.y + pick(o.oy, 0), o.target);
    const first = volleyOf(em, em.d.shot++).slice();
    em.d.next = num(o.gap, 0.12);
    if (em.d.shot < em.d.shots) active.push(em); else em.done = true;
    first.emitter = em;
    return first;
  }

  function spiralStep(em, dt) {
    const o = em.o, d = em.d;
    const arms = Math.max(1, o.arms || 3);
    const on = num(o.on, 2.0), off = num(o.off, 1.2), period = on + off;
    const chargeT = o.charge != null ? o.charge : 0.45;
    if (d.cyc == null) {
      d.cyc = off > 0 && chargeT > 0 ? period - chargeT : 0;
      d.ang = o.offset || 0;
      d.acc = 0;
      d.charged = false;
    }
    d.cyc += dt;
    if (d.cyc >= period) { d.cyc -= period; d.charged = false; }
    d.ang += num(o.spin, 1.4) * (o.dir || 1) * dt;
    em.phase = d.cyc < on ? 'on' : 'off';
    em.chargeK = d.cyc >= on && chargeT > 0 ? U.clamp(1 - (period - d.cyc) / chargeT, 0, 1) : 0;
    if (em.chargeK > 0 && !d.charged && o.chargeFx !== false) {
      d.charged = true;
      charge(em.src, { ox: o.ox, oy: o.oy, time: Math.max(0.05, period - d.cyc), color: o.color || EB.pink, r: o.chargeR || 20 });
    }
    if (em.phase !== 'on') return;
    const rate = num(o.rate, 9) * (o.rateFr === false ? 1 : frOf(em.src, o)) * softCap();
    d.acc += rate * dt;
    if (d.acc < 1) return;
    const tb = tuneOf(em.src, o).bulletSpeed || 1;
    const so = passOpts(o, em.src, tb), sp = num(o.speed, 170) * tb, type = o.type || 'orb';
    const x = ex(em), y = ey(em), r0 = o.radius || 0;
    while (d.acc >= 1) {
      d.acc -= 1;
      for (let i = 0; i < arms; i++) {
        const a = d.ang + (i / arms) * TAU;
        shoot(x + Math.cos(a) * r0, y + Math.sin(a) * r0, a, sp, type, so, em.out);
      }
    }
  }
  const spiral = continuous('spiral', spiralStep, 6);
  const double_spiral = continuous('double_spiral', (em, dt) => {
    const o = em.o, d = em.d;
    if (!d.a) {
      const base = { arms: o.arms || 2, rate: num(o.rate, 8), speed: num(o.speed, 160), type: o.type, color: o.color, ox: o.ox, oy: o.oy,
        on: o.on != null ? o.on : 1e9, off: o.off || 0, charge: 0, owner: o.owner, tune: o.tune, fr: o.fr, radius: o.radius };
      const sp = num(o.spin, 1.2);
      d.a = { em: newEm('spiral', em.src, Object.assign({}, base, { spin: sp, dir: 1, offset: o.offset || 0 }), spiralStep) };
      d.b = { em: newEm('spiral', em.src, Object.assign({}, base, { spin: sp, dir: -1, offset: (o.offset || 0) + PI / (base.arms), color: o.color2 || o.color, type: o.type2 || o.type }), spiralStep) };
    }
    for (const s of [d.a.em, d.b.em]) {
      s.src = em.src;
      s.out.length = 0;
      s.t += dt;
      s.step(s, dt);
      for (let i = 0; i < s.out.length; i++) em.out.push(s.out[i]);
    }
  }, 4);
  const stream = continuous('stream', (em, dt) => {
    const o = em.o, d = em.d;
    const x = ex(em), y = ey(em);
    if (d.aim == null) {
      const t = o.target && o.target.x != null ? { x: o.target.x, y: o.target.y, ref: o.target } : target(em.src);
      d.ref = t.ref || null;
      d.tx = t.x;
      d.ty = t.y;
      d.aim = Math.atan2(t.y - y, t.x - x);
      d.acc = 1;
    }
    const p = d.ref && !d.ref.dead ? d.ref : d.tp || (d.tp = { x: d.tx, y: d.ty });
    const want = Math.atan2(p.y - y, p.x - x), tr = num(o.track, 0.6) * dt;
    d.aim += U.clamp(U.angleDiff(d.aim, want), -tr, tr);
    d.acc += num(o.rate, 12) * softCap() * dt;
    if (d.acc < 1) return;
    const tb = tuneOf(em.src, o).bulletSpeed || 1;
    const so = passOpts(o, em.src, tb), sp = num(o.speed, 320) * tb, type = o.type || 'needle';
    while (d.acc >= 1) { d.acc -= 1; shoot(x, y, d.aim, sp, type, so, em.out); }
  }, 1.0);
  const pinwheel = continuous('pinwheel', (em, dt) => {
    const o = em.o, d = em.d;
    if (d.ang == null) { d.ang = o.offset || 0; d.acc = 1; }
    d.ang += num(o.spin, 0.9) * (o.dir || 1) * dt;
    d.acc += num(o.rate, 10) * dt;
    if (d.acc < 1) return;
    const arms = Math.max(1, o.arms || 4);
    const tb = tuneOf(em.src, o).bulletSpeed || 1;
    const so = passOpts(o, em.src, tb), sp = num(o.speed, 200) * tb, type = o.type || 'orb';
    const x = ex(em), y = ey(em);
    while (d.acc >= 1) {
      d.acc -= 1;
      for (let i = 0; i < arms; i++) shoot(x, y, d.ang + (i / arms) * TAU, sp, type, so, em.out);
    }
  }, 3);
  const rain_curtain = continuous('rain_curtain', (em, dt) => {
    const o = em.o, d = em.d;
    const nl = o.safeLanes != null ? o.safeLanes : 2, lw = num(o.laneWidth, 90);
    if (!d.lanes) {
      d.lanes = [];
      d.goal = [];
      const px = target(em.src).x;
      for (let i = 0; i < nl; i++) {
        const x = i === 0 ? U.clamp(px, 70, W - 70) : U.clamp(px + (i % 2 ? 1 : -1) * (220 + 40 * i), 70, W - 70);
        d.lanes.push(x);
        d.goal.push(x);
      }
      d.shift = num(o.laneShift, 1.5);
      d.acc = 0;
    }
    d.shift -= dt;
    if (d.shift <= 0) {
      d.shift += num(o.laneShift, 1.5);
      for (let i = 0; i < nl; i++) d.goal[i] = U.clamp(d.lanes[i] + SL.rng.range(-160, 160), 70, W - 70);
    }
    for (let i = 0; i < nl; i++) d.lanes[i] = U.approach(d.lanes[i], d.goal[i], 130 * dt);
    d.acc += num(o.rate, 14) * softCap() * dt;
    if (d.acc < 1) return;
    const tb = tuneOf(em.src, o).bulletSpeed || 1;
    const so = passOpts(o, em.src, tb), type = o.type || 'shard';
    const col = num(o.column, 40), ncol = Math.floor(W / col);
    const sp0 = num(o.speed, 220), jit = num(o.speedJitter, 40);
    let guard = 0;
    while (d.acc >= 1 && guard++ < 40) {
      const x = (SL.rng.int(0, ncol - 1) + 0.5) * col;
      let safe = true;
      for (let i = 0; i < nl; i++) if (Math.abs(x - d.lanes[i]) < lw / 2 + 8) { safe = false; break; }
      if (!safe) continue;
      d.acc -= 1;
      shoot(x, -16, HALF, (sp0 + SL.rng.range(-jit, jit)) * tb, type, so, em.out);
    }
  }, 3);
  /** Two families of diagonal bullet lanes flowing along fixed lines: static diamond safe cells. */
  const lattice = continuous('lattice', (em, dt) => {
    const o = em.o, d = em.d;
    const tb = tuneOf(em.src, o).bulletSpeed || 1;
    const sp = num(o.speed, 160) * tb, step = num(o.step, 54), type = o.type || 'orb';
    if (!d.lines) {
      const lines = Math.max(1, o.lines || 6), th = num(o.angle, 0.5), spacing = num(o.spacing, 120);
      const tg = target(em.src), yRef = U.clamp(tg.y, 400, H - 120);
      const hx = spacing / Math.cos(th), tanT = Math.tan(th);
      d.lines = [];
      for (const side of [-1, 1]) {
        // side -1: lanes heading down-right (angle PI/2 - th); +1: down-left
        const a = HALF + side * th;
        const dx = Math.cos(a), dy = Math.sin(a);
        for (let i = 0; i < lines; i++) {
          const xr = tg.x + (i - (lines - 1) / 2) * hx + (side < 0 ? hx / 4 : -hx / 4);
          // the lane passes (xr, yRef); find where it enters the screen (top or side edge)
          const x0 = xr + side * tanT * yRef;
          if ((side > 0 && x0 < -12) || (side < 0 && x0 > W + 12)) continue;
          let sx = x0, sy = -12;
          if (x0 < -12) { sy = (-12 - x0) / (-side * tanT); sx = -12; } else if (x0 > W + 12) { sy = (x0 - W - 12) / (side * tanT); sx = W + 12; }
          if (sy > H) continue;
          d.lines.push({ sx, sy, a, dx, dy, acc: 0 });
        }
      }
      // prefill each lane with telegraphed (delayed, harmless) bullets
      const so = passOpts(o, em.src, tb);
      so.delay = num(o.telegraph, 0.7);
      for (const L of d.lines) {
        for (let s = 0; ; s += step) {
          const x = L.sx + L.dx * s, y = L.sy + L.dy * s;
          if (y > H + 20 || x < -20 || x > W + 20) break;
          shoot(x, y, L.a, sp, type, so, em.out);
        }
      }
      d.wait = so.delay;
      return;
    }
    if (d.wait > 0) { d.wait -= dt; return; }
    const so = passOpts(o, em.src, tb);
    for (const L of d.lines) {
      L.acc += (sp / step) * dt;
      while (L.acc >= 1) { L.acc -= 1; shoot(L.sx, L.sy, L.a, sp, type, so, em.out); }
    }
  }, 3.2);
  const mine_lay = continuous('mine_lay', (em, dt) => {
    const o = em.o, d = em.d, s = em.src;
    if (d.next == null) d.next = num(o.first, 0.2);
    d.next -= dt * frOf(s, o);
    if (d.next > 0) return;
    d.next += num(o.every, 0.7);
    const vx = s.vx || 0, vy = s.vy || 0, v = Math.hypot(vx, vy);
    const back = v > 5 ? Math.atan2(-vy, -vx) : -HALF;
    const x = s.x + (o.ox || 0) + Math.cos(back) * (o.behind || 18), y = s.y + (o.oy || 0) + Math.sin(back) * (o.behind || 18);
    const tb = tuneOf(s, o).bulletSpeed || 1;
    const so = passOpts(o, s, tb);
    // drift backwards and a little down while the mine decelerates to a stop
    const dvx = Math.cos(back) * 70, dvy = Math.sin(back) * 70 + 60;
    shoot(x, y, Math.atan2(dvy, dvx), Math.hypot(dvx, dvy) * tb, o.type || 'mine', so, em.out);
  }, 6);

  function sniperStep(em, dt) {
    const o = em.o, d = em.d, s = em.src;
    const x = ex(em), y = ey(em);
    if (!d.phase) {
      const t = o.target && o.target.x != null ? { ref: o.target, x: o.target.x, y: o.target.y } : target(s);
      d.ref = t.ref;
      d.tx = t.x;
      d.ty = t.y;
      d.ang = o.angle != null ? o.angle : Math.atan2(t.y - y, t.x - x);
      d.phase = 'track';
      d.pt = 0;
      d.shot = 0;
      em.warn = warn(s, { fx: 'line', ox: o.ox || 0, oy: o.oy || 0, angle: d.ang, life: 1e9, color: o.lineColor || WARN });
    }
    d.pt += dt;
    if (d.phase === 'track') {
      const p = refPos(d.ref, s);
      const want = Math.atan2(p.y - y, p.x - x), tr = num(o.trackRate, 1.2) * dt;
      d.ang += U.clamp(U.angleDiff(d.ang, want), -tr, tr);
      if (d.pt >= num(o.track, 1.0)) {
        d.phase = 'lock';
        d.pt = 0;
        if (em.warn) em.warn.data.flash = true;
        U.sfx('sniper_lock', { x });
      }
    } else if (d.phase === 'lock') {
      if (d.pt >= num(o.lock, 0.25)) { d.phase = 'fire'; d.pt = num(o.gap, 0.08); }
    }
    if (em.warn) { em.warn.angle = d.ang; em.warn.ox = o.ox || 0; em.warn.oy = o.oy || 0; }
    em.angle = d.ang;
    em.phase = d.phase;
    if (d.phase === 'fire') {
      const shots = Math.max(1, o.shots || 1);
      while (d.pt >= num(o.gap, 0.08) && d.shot < shots) {
        d.pt -= num(o.gap, 0.08);
        d.shot++;
        const tb = tuneOf(s, o).bulletSpeed || 1;
        const so = passOpts(o, s, tb);
        shoot(x, y, d.ang, num(o.speed, 620) * tb, o.type || 'needle', so, em.out);
        SL.fx.emit({ x: x + Math.cos(d.ang) * 6, y: y + Math.sin(d.ang) * 6, life: 0.12, size: 30, size2: 8, color: '#ffffff' });
      }
      if (d.shot >= shots) em.stop();
    }
  }
  const sniperCont = continuous('sniper_line', sniperStep, 3);
  function sniper_line(a, b, c, d) { return sniperCont(a, b, c, d); }

  // ------------------------------------------------------------------ beams
  function beamAngle(src, o) {
    if (typeof o.angle === 'number') return o.angle;
    const x = src.x + (o.ox || 0), y = src.y + (o.oy || 0);
    return aimFrom(src, x, y, o.target);
  }
  function beam(src, o) {
    o = o || EMPTY_O;
    return SL.fireEnemyBeam(src, {
      angle: beamAngle(src, o), width: num(o.width, 26), telegraph: num(o.telegraph, 0.8), duration: num(o.duration, 1.2),
      follow: o.follow === true, ox: o.ox || 0, oy: o.oy || 0, color: o.color, sweep: o.sweep, track: o.track, length: o.length,
      dps: o.dps, data: o.data,
    });
  }
  function beam_sweep(src, o) {
    o = o || EMPTY_O;
    const mid = beamAngle(src, o);
    const from = o.from != null ? o.from : mid - 0.7, to = o.to != null ? o.to : mid + 0.7;
    return SL.fireEnemyBeam(src, {
      angle: from, sweep: { to }, width: num(o.width, 30), telegraph: num(o.telegraph, 0.9), duration: num(o.duration, 1.6),
      follow: o.follow !== false, ox: o.ox || 0, oy: o.oy || 0, color: o.color, length: o.length, dps: o.dps, data: o.data,
    });
  }
  function cross_beams(src, o) {
    o = o || EMPTY_O;
    const n = Math.max(1, o.arms || 4), off = o.offset || 0, out = [];
    for (let i = 0; i < n; i++) {
      out.push(SL.fireEnemyBeam(src, {
        angle: off + (i / n) * TAU, sweep: num(o.spin, 0.5) * (o.dir || 1), width: num(o.width, 22), telegraph: num(o.telegraph, 1.0),
        duration: num(o.duration, 6), follow: o.follow !== false, ox: o.ox || 0, oy: o.oy || 0, color: o.color, length: o.length, dps: o.dps,
      }));
    }
    return out;
  }

  // ------------------------------------------------------------------ public surface
  const IDS = ['aimed', 'burst', 'fan', 'ring', 'ring_stagger', 'spiral', 'double_spiral', 'stream', 'wave', 'flower', 'wall_gap',
    'rain_curtain', 'lattice', 'pinwheel', 'orbit_release', 'homing_salvo', 'split_shot', 'sniper_line', 'beam', 'beam_sweep',
    'cross_beams', 'mine_lay', 'gravity_sling'];
  SL.patterns = {
    aimed, burst, fan, ring, ring_stagger, spiral, double_spiral, stream, wave, flower, wall_gap, rain_curtain, lattice,
    pinwheel, orbit_release, homing_salvo, split_shot, sniper_line, beam, beam_sweep, cross_beams, mine_lay, gravity_sling,
    target,
    /** Helpers (not patterns): */
    ids: () => IDS.slice(),
    warn,
    charge,
    fire(x, y, angle, speed, type, opts) {
      const o = opts || EMPTY_O, src = o.owner || null;
      const tb = tuneOf(src, o).bulletSpeed || 1;
      return shoot(x, y, angle, speed * tb, type || 'orb', passOpts(o, src, tb), null, o.safe);
    },
    aimAngle: (src, x, y, tgt) => aimFrom(src, x != null ? x : src.x, y != null ? y : src.y, tgt),
    fireRate: (src, o) => frOf(src, o),
    tune: (src, o) => tuneOf(src, o),
    reset(state) { if (state && state.em) { state.em.stop(); state.em = null; } },
    stopAll(src) { for (const em of active) if (!src || em.src === src) em.stop(); },
    active: () => active.length,
    sprite: (type, color) => (SPR[type] ? SPR[type](color || (SL.ebulletTypes.defs[type] || {}).color || EB.pink, 0) : null),
  };

  // ------------------------------------------------------------------ sandbox: 'patterns'
  const LAB_EMITTER = {
    id: '_lab_emitter', name: 'Pattern emitter', hp: 1e9, r: 26, score: 0, credits: null, noCount: true, noClear: true,
    offscreenKill: false, contactDamage: 0, manualMove: true,
    init(e) { e.invuln = true; e.untargetable = true; e.intangible = true; },
    update(e) { e.x = e.params.hx + Math.sin(e.age * 0.7) * (e.params.sway || 0); e.y = e.params.hy; },
    draw(e, ctx) {
      const t = SL.time.t;
      const g = e.gravity;
      if (g) {
        A.drawGlow(ctx, g.x, g.y, 90, VIOLET, 0.45);
        ctx.fillStyle = '#020104';
        ctx.beginPath();
        ctx.arc(g.x, g.y, 18, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = C.rgba('#fff1d6', 0.85);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 20, 0, TAU);
        ctx.stroke();
      }
      A.drawGlow(ctx, e.x, e.y, 46, EB.pink, 0.55);
      A.drawGlow(ctx, e.x, e.y, 18, '#ffffff', 0.9);
      ctx.strokeStyle = C.rgba(EB.pink, 0.8);
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, 22 + i * 7, t * (1.5 + i) + i, t * (1.5 + i) + i + 2.2);
        ctx.stroke();
      }
    },
  };
  const LABEL = {
    draw(pr, ctx) {
      ctx.font = '700 26px Oxanium, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(232,238,247,0.92)';
      ctx.fillText(pr.data.text || '', pr.x, pr.y);
      if (pr.data.sub) {
        ctx.font = '500 17px "Barlow Semi Condensed", sans-serif';
        ctx.fillStyle = 'rgba(147,160,186,0.95)';
        ctx.fillText(pr.data.sub, pr.x, pr.y + 24);
      }
    },
  };
  const DEMO = {
    aimed: (e) => SL.patterns.aimed(e, null, { count: 3, speed: 260 }),
    burst: (e) => SL.patterns.burst(e, null, { shots: 5, count: 2, spread: 0.12, speed: 280, type: 'orbBig' }),
    fan: (e) => SL.patterns.fan(e, 'aim', { count: 9, spread: 1.2, speed: 230, type: 'needle' }),
    ring: (e) => { SL.patterns.ring(e, { count: 24, speed: 170 }); SL.after(0.5, () => SL.patterns.ring(e, { count: 24, speed: 170, offset: PI / 24, type: 'orbBig', color: EB.orange })); },
    ring_stagger: (e) => SL.patterns.ring_stagger(e, { every: 0.75, duration: 3.0 }),
    spiral: (e) => SL.patterns.spiral(e, { duration: 4.2, arms: 3, on: 2, off: 0.8 }),
    double_spiral: (e) => SL.patterns.double_spiral(e, { duration: 3.4, color2: EB.violet }),
    stream: (e) => { SL.patterns.stream(e, { duration: 1.6 }); SL.after(1.9, () => SL.patterns.stream(e, { duration: 1.2, type: 'orb', speed: 300 })); },
    wave: (e) => { SL.patterns.wave(e, 'aim', {}); SL.after(0.9, () => SL.patterns.wave(e, 'aim', { color: EB.violet })); SL.after(1.8, () => SL.patterns.wave(e, 'aim', {})); },
    flower: (e) => { SL.patterns.flower(e, {}); SL.after(1.1, () => SL.patterns.flower(e, { offset: PI / 16, color: EB.violet })); },
    wall_gap: (e) => { SL.patterns.wall_gap(e, {}); SL.after(1.4, () => SL.patterns.wall_gap(e, { type: 'orbBig', color: EB.orange })); },
    rain_curtain: (e) => SL.patterns.rain_curtain(e, { duration: 4 }),
    lattice: (e) => SL.patterns.lattice(e, { duration: 3.2 }),
    pinwheel: (e) => SL.patterns.pinwheel(e, { duration: 3.2, type: 'needle', color: EB.violet }),
    orbit_release: (e) => SL.patterns.orbit_release(e, { type: 'orbBig', color: EB.orange }),
    homing_salvo: (e) => { SL.patterns.homing_salvo(e, { count: 4 }); SL.after(1.5, () => SL.patterns.homing_salvo(e, { count: 2 })); },
    split_shot: (e) => SL.patterns.split_shot(e, {}),
    sniper_line: (e) => { SL.patterns.sniper_line(e, { shots: 3 }); SL.after(2.0, () => SL.patterns.sniper_line(e, { shots: 1, ox: -60 })); },
    beam: (e) => SL.patterns.beam(e, { oy: 24 }),
    beam_sweep: (e) => SL.patterns.beam_sweep(e, { oy: 24 }),
    cross_beams: (e) => SL.patterns.cross_beams(e, { duration: 2.6, offset: PI / 4 }),
    mine_lay: (e) => { e.params.sway = 220; SL.patterns.mine_lay(e, { duration: 3.4, every: 0.35 }); SL.after(3.8, () => { e.params.sway = 0; }); },
    gravity_sling: (e) => { e.gravity = { x: e.x, y: e.y + 140, pull: 380, range: 420, r: 20 }; SL.patterns.gravity_sling(e, { center: e.gravity, radius: 110 }); SL.after(2.5, () => { e.gravity = null; }); },
  };
  function pin(b) {
    const d = b.data;
    b.vx = b.vy = 0;
    b.speed = 0;
    b.age = Math.min(b.age, d.maxAge || 1e9);
    b.x = b.bx = d.px;
    b.y = b.by = d.py;
    if (b.type.orient) b.rot = b.angle = d.pa;
  }
  SL.lab = SL.lab || {};
  SL.lab.patterns = {
    demo: DEMO,
    /** Standing specimens of every bullet type (frozen in place), for close-up screenshots. */
    gallery(y0) {
      const types = ['orb', 'orbBig', 'orb_huge', 'needle', 'shard', 'mine', 'missile', 'spark', 'petal', 'flare', 'void_orb'];
      const out = [];
      types.forEach((id, i) => {
        const x = 70 + (i % 6) * 116, y = (y0 || 420) + Math.floor(i / 6) * 120;
        const b = SL.fireEnemy(x, y, -0.6, 0, id, { update: pin, life: 0 });
        b.data.px = x;
        b.data.py = y;
        b.data.pa = -0.6;
        if (id === 'mine') b.data.maxAge = 0.45;
        out.push(b);
        const l = SL.spawnProp(LABEL, { x, y: y + 52 });
        l.data.text = '';
        l.data.sub = id;
      });
      return out.length;
    },
    fire(id) {
      const e = SL.lab.patterns.emitter;
      if (!e || e.dead || !DEMO[id]) return false;
      const lbl = SL.lab.patterns.label;
      if (lbl && !lbl.dead) { lbl.data.text = id; lbl.data.sub = 'SL.patterns.' + id; }
      DEMO[id](e);
      return true;
    },
  };
  SL.debug.sandbox('patterns', (s) => {
    const only = SL.debug.params.p;
    const e = SL.spawnEnemy(LAB_EMITTER, { x: 360, y: 300, params: { hx: 360, hy: 300 }, offscreenKill: false, noCount: true });
    const lbl = SL.spawnProp(LABEL, { x: 360, y: 120 });
    lbl.data.text = 'PATTERNS';
    SL.lab.patterns.emitter = e;
    SL.lab.patterns.label = lbl;
    let i = 0, t = 1.0;
    const list = only ? [only] : IDS;
    return (dt) => {
      t -= dt;
      if (t > 0 || SL.lab.patterns.manual) return;
      const id = list[i++ % list.length];
      t = id === 'cross_beams' || id === 'lattice' || id === 'rain_curtain' ? 5.2 : 4.4;
      SL.lab.patterns.fire(id);
    };
  }, { name: 'Pattern library', god: true });
})(window.SL = window.SL || {});
