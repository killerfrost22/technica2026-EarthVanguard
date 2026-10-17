/* 11_enemies.js (enemies builder)
   Provides: the 16 enemies of GDD 6 (gnat dart wasp snatcher spear needler skimmer hornet phantom warper manta weaver
   stormcaller hive bastion tug) with elites, the 11 formations of GDD 6.1 plus the formation bonus, SL.paths (path
   builders, transforms, movers and named presets) and the sandboxes 'enemies' and 'formations'.
   - Art: every enemy is a glossy body sprite (SL.art.metal hulls lit from the upper left, grain, panel lines,
     smoked-glass canopies) plus an additive emissive layer (seams and lights) pulsing at 0.8 Hz; elites use #ffb0c8
     seams and a 1 px gold rim. Animated parts (legs, spokes, turrets, barrels, rings, coils) are separate cached
     sprites; engines are live SL.art.flame plumes.
   - Every def is manualMove: a mover (SL.paths.follow) or the enemy's own AI moves it. Formation members fly the
     formation path and attack while on it; spears leave it to lock and dash, darts peel off toward the player.
   See docs/api/enemies.md. */
(function (SL) {
  'use strict';

  const U = SL.util, A = SL.art, C = SL.color;
  const W = SL.W, H = SL.H, TAU = Math.PI * 2, PI = Math.PI, HALF = Math.PI / 2;
  const PAL = SL.pal.enemy, EB = SL.pal.ebullet;
  const VIOLET = '#b26bff', GOLD = '#ffd34d', WARN = '#ff3b4f', TRACTOR = '#ff9a9a', STORM = '#b9c6ff';
  const NO_TUNE = Object.freeze({ bulletSpeed: 1, fireRate: 1 });
  const BASE_DIFF = { bulletSpeed: 1, fireRate: 1, damage: 1, enemyHp: 1 };
  const EMPTY = Object.freeze({});
  const PT = { x: 0, y: 0 }, PT2 = { x: 0, y: 0 };

  // ------------------------------------------------------------------ small helpers
  function diff() { return (SL.game && SL.game.diff) || BASE_DIFF; }
  function session() { return SL.game && SL.game.session; }
  function tune() { const s = session(); return (s && s.mission && s.mission.tune) || NO_TUNE; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function sfx(id, x) { U.sfx(id, { x }); }
  function pats() { return SL.patterns || null; }
  function isPlayer(by) { return !!by && (by.kind === 'player' || (by.owner && by.owner.kind === 'player')); }

  /** Mission tier 1..5 for the GDD's "from m3" rules: m1..m5 -> 1..5, sN -> N + 1, sandbox and menus -> 5;
      mission.tier and ?tier= override. */
  function missionTier() {
    const q = SL.debug && SL.debug.params ? +SL.debug.params.tier : 0;
    if (q >= 1) return Math.min(5, q | 0);
    const s = session();
    if (!s || s.sandbox) return 5;
    if (s.mission && s.mission.tier) return s.mission.tier;
    const id = String(s.missionId || '');
    let m = /^m(\d)/.exec(id);
    if (m) return U.clamp(+m[1], 1, 5);
    m = /^s(\d)/.exec(id);
    if (m) return U.clamp(+m[1] + 1, 1, 5);
    return 5;
  }
  /** Enemy fire-rate multiplier: diff.fireRate x mission.tune.fireRate x 1.25 for elites. */
  function rate(e) { return (diff().fireRate || 1) * (tune().fireRate || 1) * (e.elite ? 1.25 : 1); }
  /** Cooldown helper: counts e.data[key] down at the enemy's fire rate; true (and re-armed by `every`) when due. */
  function ready(e, key, every, dt) {
    const d = e.data;
    d[key] -= dt * rate(e);
    if (d[key] > 0) return false;
    d[key] = Math.max(d[key] + every, every * 0.25);
    return true;
  }
  /** GDD 6: no aimed shots in an enemy's first 0.6 s on screen. */
  function canAim(e) { return e.data.vis >= 0.6; }
  function plus(e) { return e.elite ? 1 : 0; }
  function aimAt(e) {
    const P = pats();
    if (P && P.target) return P.target(e);
    const p = SL.world.nearestPlayer(e.x, e.y);
    return p ? { x: p.x, y: p.y, ref: p } : { x: e.x, y: H * 0.85, ref: null };
  }
  function charge(e, ox, oy, time, color, r) {
    const P = pats();
    if (P && P.charge) return P.charge(e, { ox, oy, time, color, r });
    sfx('enemy_charge', e.x);
    return null;
  }
  function onScreen(e, m) { return e.x > -m && e.x < W + m && e.y > -m && e.y < H + m; }
  /** Velocity that eases e toward (tx, ty) (critically damped feel), capped at maxV. */
  function seek(e, tx, ty, maxV, k) {
    k = k || 2.6;
    let vx = (tx - e.x) * k, vy = (ty - e.y) * k;
    const v = Math.hypot(vx, vy);
    if (v > maxV) { vx *= maxV / v; vy *= maxV / v; }
    e.vx = vx;
    e.vy = vy;
  }
  /** Marks an enemy as escaped (like core culling): no score, no enemyKilled, def.onExit runs. */
  function leave(e) {
    if (e.dead) return;
    e.dead = true;
    e.escaped = true;
    try { if (e.def.onExit) e.def.onExit(e); } catch (err) { console.error('[SL] enemy "' + e.typeId + '" onExit threw:', err); }
  }
  function rotPoly(cx, cy, a, pts, open) {
    const c = Math.cos(a), s = Math.sin(a), flat = [];
    for (let i = 0; i < pts.length; i++) flat.push(cx + pts[i][0] * c - pts[i][1] * s, cy + pts[i][0] * s + pts[i][1] * c);
    return A.poly(flat, open);
  }
  function circ(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; }
  function ell(x, y, rx, ry, rot) { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot || 0, 0, TAU); return p; }
  function rrect(x, y, w, h, r) { const p = new Path2D(); p.roundRect(x, y, w, h, r); return p; }
  function seg(pts) { return A.poly(pts, true); }

  // ------------------------------------------------------------------ art kit
  // One draw function per enemy renders both layers: the body (layer 'body': hulls, glass, dim seams) and the
  // emissive layer (layer 'glow': seams and lights only, drawn additively at runtime with a 0.8 Hz pulse).
  let GRAIN = null;
  function grainCanvas() {
    if (!GRAIN) GRAIN = A.noiseCanvas(128, 128, { scale: 22, octaves: 4, seed: 11, palette: [[0, '#000000', 1], [0.5, '#7f7f7f', 1], [1, '#ffffff', 1]] });
    return GRAIN;
  }
  function Kit(ctx, w, h, P, glow) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.cx = w / 2;
    this.cy = h / 2;
    this.P = P;
    this.glow = glow;
  }
  const KP = Kit.prototype;
  /** Glossy hull part; b = [x, y, w, h] gradient bounds (default: the whole sprite). */
  KP.metal = function (path, base, b, o) {
    if (this.glow) return;
    const opt = { base: base || this.P.hull, spec: 0.5, edge: 1.3, rimLight: 1.5, rimWidth: 1 };
    if (o) for (const k in o) opt[k] = o[k];
    opt.bounds = b ? { x: b[0], y: b[1], w: b[2], h: b[3] } : { x: 0, y: 0, w: this.w, h: this.h };
    A.metal(this.ctx, path, opt);
  };
  /** Fine material grain (overlay) inside a path. */
  KP.grain = function (path, alpha) {
    if (this.glow) return;
    const c = this.ctx, g = grainCanvas();
    c.save();
    c.clip(path);
    c.globalAlpha = alpha == null ? 0.16 : alpha;
    c.globalCompositeOperation = 'overlay';
    for (let y = -4; y < this.h + 4; y += 128) for (let x = -4; x < this.w + 4; x += 128) c.drawImage(g, x, y);
    c.restore();
  };
  /** Soft ambient-occlusion blot inside a path. */
  KP.shade = function (path, x, y, r, alpha) {
    if (this.glow) return;
    const c = this.ctx;
    c.save();
    c.clip(path);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + (alpha == null ? 0.5 : alpha) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
  };
  /** Soft highlight blot inside a path (glossy bulges). */
  KP.sheen = function (path, x, y, r, alpha) {
    if (this.glow) return;
    const c = this.ctx;
    c.save();
    c.clip(path);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(225,232,255,' + (alpha == null ? 0.35 : alpha) + ')');
    g.addColorStop(1, 'rgba(225,232,255,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
  };
  KP.lines = function (path, alpha) { if (!this.glow) A.panelLines(this.ctx, path, '#000000', alpha == null ? 0.55 : alpha); };
  /** Emissive seam: a dim groove in the body, a bright bloom line in the glow layer. */
  KP.seam = function (path, width, color, blur) {
    const c = this.ctx, col = color || this.P.seam, wd = width || 1.3;
    if (this.glow) { A.emissive(c, path, col, blur == null ? 6 : blur, { stroke: wd }); return; }
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.lineWidth = wd + 1.6;
    c.stroke(path);
    c.strokeStyle = C.mix(col, '#1a0812', 0.3);
    c.lineWidth = wd;
    c.stroke(path);
    c.restore();
  };
  /** Emissive area (eyes, vents, caps, lights). */
  KP.lamp = function (path, color, blur) {
    const c = this.ctx, col = color || this.P.glow;
    if (this.glow) { A.emissive(c, path, col, blur == null ? 8 : blur); return; }
    c.save();
    c.fillStyle = C.mix(col, '#1a0610', 0.25);
    c.fill(path);
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 0.8;
    c.stroke(path);
    c.restore();
  };
  KP.dot = function (x, y, r, color, blur) { this.lamp(circ(x, y, r), color, blur); };
  /** White specular glint (body only). */
  KP.glint = function (x, y, r, a) {
    if (this.glow) return;
    const c = this.ctx;
    c.save();
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,' + (a == null ? 0.95 : a) + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
  };
  /** Smoked-glass canopy with a colored reflection streak and a glint. b = [x, y, w, h]. */
  KP.glass = function (path, b, tint) {
    const c = this.ctx, col = tint || this.P.glow;
    if (this.glow) {
      c.save();
      c.globalAlpha = 0.5;
      A.emissive(c, path, col, 5);
      c.restore();
      return;
    }
    c.save();
    const g = c.createLinearGradient(b[0], b[1], b[0] + b[2], b[1] + b[3]);
    g.addColorStop(0, '#4a3550');
    g.addColorStop(0.4, '#160d1c');
    g.addColorStop(1, '#040308');
    c.fillStyle = g;
    c.fill(path);
    c.clip(path);
    c.globalAlpha = 0.55;
    c.strokeStyle = col;
    c.lineCap = 'round';
    c.lineWidth = Math.max(0.9, Math.min(b[2], b[3]) * 0.16);
    c.beginPath();
    c.moveTo(b[0] + b[2] * 0.3, b[1] + b[3] * 0.12);
    c.lineTo(b[0] + b[2] * 0.14, b[1] + b[3] * 0.62);
    c.stroke();
    c.restore();
    this.glint(b[0] + b[2] * 0.32, b[1] + b[3] * 0.24, Math.max(1.2, Math.min(b[2], b[3]) * 0.22));
    c.save();
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.lineWidth = 0.9;
    c.stroke(path);
    c.restore();
  };
  KP.rivets = function (pts, r) {
    if (this.glow) return;
    const c = this.ctx;
    r = r || 0.9;
    for (let i = 0; i < pts.length; i += 2) {
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.beginPath();
      c.arc(pts[i] + 0.35, pts[i + 1] + 0.45, r, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(205,215,240,0.6)';
      c.beginPath();
      c.arc(pts[i] - 0.2, pts[i + 1] - 0.25, r * 0.62, 0, TAU);
      c.fill();
    }
  };
  /** Glossy sphere (radial shading, hotspot, rim) of radius r. Returns its path. */
  KP.sphere = function (x, y, r, base, spec) {
    const p = circ(x, y, r);
    if (this.glow) return p;
    const c = this.ctx;
    base = base || this.P.hull;
    c.save();
    const g = c.createRadialGradient(x - r * 0.38, y - r * 0.46, r * 0.04, x, y, r * 1.02);
    g.addColorStop(0, C.lighten(base, 0.55));
    g.addColorStop(0.3, C.lighten(base, 0.18));
    g.addColorStop(0.72, base);
    g.addColorStop(1, C.darken(base, 0.72));
    c.fillStyle = g;
    c.fill(p);
    c.clip(p);
    const s = c.createRadialGradient(x - r * 0.42, y - r * 0.5, 0, x - r * 0.42, y - r * 0.5, r * 0.5);
    s.addColorStop(0, 'rgba(255,255,255,' + (spec == null ? 0.7 : spec) + ')');
    s.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = s;
    c.fill(p);
    c.lineWidth = r * 0.16;
    c.strokeStyle = 'rgba(150,160,200,0.22)';
    c.beginPath();
    c.arc(x, y, r * 0.95, 0.15 * PI, 0.75 * PI);
    c.stroke();
    c.restore();
    c.save();
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.lineWidth = 1;
    c.stroke(p);
    c.restore();
    this.grain(p, 0.1);
    return p;
  };
  /** Dark recess (vents, bays, intakes) with an inner shadow. */
  KP.recess = function (path, b) {
    if (this.glow) return;
    const c = this.ctx;
    c.save();
    const g = c.createLinearGradient(b[0], b[1], b[0], b[1] + b[3]);
    g.addColorStop(0, '#020205');
    g.addColorStop(1, '#151826');
    c.fillStyle = g;
    c.fill(path);
    c.strokeStyle = 'rgba(160,170,200,0.25)';
    c.lineWidth = 0.8;
    c.stroke(path);
    c.restore();
  };

  /** Post-process for elite bodies: a 1 px gold rim around the whole silhouette. */
  function goldRim(ctx) {
    const cv = ctx.canvas, cw = cv.width, ch = cv.height;
    const r = Math.max(1, Math.round(ctx.getTransform().a));
    const body = A.canvas(cw, ch), bx = body.getContext('2d');
    bx.drawImage(cv, 0, 0);
    const rim = A.canvas(cw, ch), rx = rim.getContext('2d');
    for (let k = 0; k < 8; k++) rx.drawImage(body, Math.round(Math.cos(k * PI / 4) * r), Math.round(Math.sin(k * PI / 4) * r));
    rx.globalCompositeOperation = 'source-in';
    rx.fillStyle = GOLD;
    rx.fillRect(0, 0, cw, ch);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(rim, 0, 0);
    ctx.drawImage(rim, 0, 0);
    ctx.drawImage(body, 0, 0);
    ctx.restore();
  }

  const PN = { hull: PAL.hull, hull2: PAL.hull2, plate: '#4a5068', steel: '#5a6078', seam: PAL.seam, glow: PAL.glow, engine: PAL.engine, elite: false };
  const PE = Object.assign({}, PN, { seam: '#ffb0c8', glow: '#ffc2d6', elite: true });
  const ART_KEYS = [];
  /** Defines 'en:<key>' (body) and 'en:<key>:g' (emissive) plus elite variants ':E' / ':g:E'. */
  function art(key, w, h, fn, o) {
    o = o || EMPTY;
    const pad = o.pad != null ? o.pad : 8, res = o.res || 2;
    for (let v = 0; v < 2; v++) {
      const P = Object.assign({}, v ? PE : PN, o.pal || null);
      if (v && o.palE) Object.assign(P, o.palE);
      const suf = v ? ':E' : '';
      const kb = 'en:' + key + suf, kg = 'en:' + key + ':g' + suf;
      A.define(kb, w, h, (ctx) => { fn(new Kit(ctx, w, h, P, false)); if (v && !o.noRim) goldRim(ctx); }, { pad, res });
      A.define(kg, w, h, (ctx) => fn(new Kit(ctx, w, h, P, true)), { pad, res });
      if (!v || o.prewarmElite) ART_KEYS.push(kb, kg);
    }
  }
  /** {b, g} sprite records of an art key for an enemy (elite-aware). */
  function skin(e, key) {
    const E = e.elite ? ':E' : '';
    return { b: A.get('en:' + key + E), g: A.get('en:' + key + ':g' + E) };
  }

  // ------------------------------------------------------------------ drawing helpers
  const R = () => SL.render;
  /** Draws a sprite record centered at (x, y) with rotation and non-uniform scale (add = additive). */
  function blit(ctx, s, x, y, rot, sx, sy, a, add) {
    if (!s || !(a > 0.004)) return;
    SL.render.setTransform(ctx, x, y, rot, sx, sy);
    ctx.globalAlpha = a > 1 ? 1 : a;
    if (add) ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(s.canvas, -s.cw / 2, -s.ch / 2, s.cw, s.ch);
    SL.render.resetTransform(ctx);
  }
  /** Body + pulsing emissive layer of a skin at a draw frame F (x, y, rot, sx, sy, a). */
  function drawSkin(ctx, sk, F, x, y, rot, glowK) {
    blit(ctx, sk.b, x, y, rot, F.sx, F.sy, F.a, false);
    blit(ctx, sk.g, x, y, rot, F.sx, F.sy, F.a * glowK, true);
  }
  /** Local sprite point (lx, ly) -> world, through draw frame F; writes PT. */
  function loc(F, lx, ly) {
    const c = Math.cos(F.rot), s = Math.sin(F.rot), px = lx * F.sx, py = ly * F.sy;
    PT.x = F.x + px * c - py * s;
    PT.y = F.y + px * s + py * c;
    return PT;
  }
  /** Engine plume at local (lx, ly) pointing along local angle dir (default -y: the hull's rear). */
  function plume(ctx, F, lx, ly, w, len, dir, t, color) {
    if (!(len > 0.5)) return;
    loc(F, lx, ly);
    let dl = dir == null ? -HALF : dir;
    if (F.sx < 0) dl = PI - dl;
    SL.render.setTransform(ctx, PT.x, PT.y, F.rot + dl - HALF, 1, 1);
    if (F.a < 1) ctx.globalAlpha = F.a;
    A.flame(ctx, 0, 0, w, len, '#ffffff', color || PAL.engine, t);
    SL.render.resetTransform(ctx);
  }
  function glowAt(ctx, F, lx, ly, r, color, a) {
    if (!(a > 0.01)) return;
    loc(F, lx, ly);
    A.drawGlow(ctx, PT.x, PT.y, r, color, a * F.a);
  }

  // ------------------------------------------------------------------ paths (SL.paths)
  // A path is a sampled polyline with cumulative arc length. Positions past its end continue straight along the
  // last segment, so a member that finishes its path keeps flying (and leaves the screen).
  function mkPath(xs, ys) {
    const n = xs.length, cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    return { xs, ys, cum, n, len: n ? cum[n - 1] : 0, isPath: true };
  }
  function fromFn(fn, steps) {
    const xs = new Float32Array(steps + 1), ys = new Float32Array(steps + 1);
    for (let i = 0; i <= steps; i++) { fn(i / steps, PT2); xs[i] = PT2.x; ys[i] = PT2.y; }
    return mkPath(xs, ys);
  }
  function line(x0, y0, x1, y1) {
    if (x0 === x1 && y0 === y1) y1 += 1;
    return mkPath(new Float32Array([x0, x1]), new Float32Array([y0, y1]));
  }
  /** Catmull-Rom spline through [[x, y], ...], sampled about every `step` px. */
  function spline(pts, step) {
    step = step || 8;
    const n = pts.length;
    if (n < 2) return line(pts[0][0], pts[0][1], pts[0][0], pts[0][1] + 1);
    const xs = [], ys = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      const m = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let j = 0; j < m; j++) {
        const t = j / m, t2 = t * t, t3 = t2 * t;
        xs.push(0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3));
        ys.push(0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3));
      }
    }
    xs.push(pts[n - 1][0]);
    ys.push(pts[n - 1][1]);
    return mkPath(Float32Array.from(xs), Float32Array.from(ys));
  }
  function arc(cx, cy, r, a0, a1) {
    return fromFn((u, o) => { const a = a0 + (a1 - a0) * u; o.x = cx + Math.cos(a) * r; o.y = cy + Math.sin(a) * r; },
      Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / 8)));
  }
  /** Sine weave from (x0, y0) to (x1, y1): amplitude amp, wavelength wl (px along the line), phase (rad). */
  function sine(x0, y0, x1, y1, amp, wl, phase) {
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    return fromFn((u, o) => {
      const s = u * L, off = amp * Math.sin((s / wl) * TAU + (phase || 0));
      o.x = x0 + ux * s - uy * off;
      o.y = y0 + uy * s + ux * off;
    }, Math.max(8, Math.ceil(L / 8)));
  }
  /** Spiral around (cx, cy) from radius r0 at angle a0 to radius r1 at angle a1. */
  function spiral(cx, cy, r0, r1, a0, a1) {
    return fromFn((u, o) => { const r = r0 + (r1 - r0) * u, a = a0 + (a1 - a0) * u; o.x = cx + Math.cos(a) * r; o.y = cy + Math.sin(a) * r; },
      Math.max(16, Math.ceil(Math.abs(a1 - a0) * Math.max(r0, r1) / 8)));
  }
  function xform(p, f) {
    const xs = new Float32Array(p.n), ys = new Float32Array(p.n);
    for (let i = 0; i < p.n; i++) { f(p.xs[i], p.ys[i], PT2); xs[i] = PT2.x; ys[i] = PT2.y; }
    return mkPath(xs, ys);
  }
  function mirror(p, cx) { cx = cx == null ? W / 2 : cx; return xform(p, (x, y, o) => { o.x = 2 * cx - x; o.y = y; }); }
  function flipY(p) { return xform(p, (x, y, o) => { o.x = x; o.y = H - y; }); }
  function offset(p, dx, dy) { return xform(p, (x, y, o) => { o.x = x + dx; o.y = y + dy; }); }
  function concat(a, b) {
    const xs = new Float32Array(a.n + b.n - 1), ys = new Float32Array(a.n + b.n - 1);
    xs.set(a.xs);
    ys.set(a.ys);
    xs.set(b.xs.subarray(1), a.n);
    ys.set(b.ys.subarray(1), a.n);
    return mkPath(xs, ys);
  }
  /** Position at arc length s (out: {x, y}); past the end it extrapolates along the last segment. */
  function at(p, s, out) {
    const cum = p.cum, n = p.n;
    if (n < 2 || s <= 0) { out.x = p.xs[0]; out.y = p.ys[0]; return out; }
    if (s >= p.len) {
      let j = n - 2;
      while (j > 0 && cum[n - 1] - cum[j] < 0.5) j--;
      const L = Math.max(1e-3, cum[n - 1] - cum[j]), k = (s - p.len) / L;
      out.x = p.xs[n - 1] + (p.xs[n - 1] - p.xs[j]) * k;
      out.y = p.ys[n - 1] + (p.ys[n - 1] - p.ys[j]) * k;
      return out;
    }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const sg = cum[hi] - cum[lo], k = sg > 0 ? (s - cum[lo]) / sg : 0;
    out.x = p.xs[lo] + (p.xs[hi] - p.xs[lo]) * k;
    out.y = p.ys[lo] + (p.ys[hi] - p.ys[lo]) * k;
    return out;
  }

  // ------------------------------------------------------------------ movers
  // e.data.mv = { legs, i, s, t, sp, delay, ox, oy, dist, total, done }. Legs: {path, speed, accel, max} |
  // {hold: seconds} | {escort: leader, ox, oy} | {fn(e, dt, leg, mv) -> true when done}. While `delay` runs the
  // member is parked (hidden, intangible) at its path start.
  function follow(e, legs, o) {
    o = o || EMPTY;
    if (!e || !e.data) return null;
    if (legs && legs.isPath) legs = [{ path: legs }];
    const d = e.data;
    const mv = { legs, i: 0, s: 0, t: 0, sp: 0, delay: o.delay || 0, ox: o.ox || 0, oy: o.oy || 0, dist: 0, total: 0, done: false };
    for (let i = 0; i < legs.length; i++) if (legs[i].path) mv.total += legs[i].path.len;
    const L0 = legs[0];
    mv.sp = o.startSpeed != null ? o.startSpeed : L0 && L0.speed != null ? L0.speed : num(d.spd, 200);
    if (L0 && L0.path) { at(L0.path, 0, PT); e.x = PT.x + mv.ox; e.y = PT.y + mv.oy; }
    d.mv = mv;
    d.parked = mv.delay > 0;
    if (o.peel) d.peel = o.peel;
    e.vx = e.vy = 0;
    return mv;
  }
  function nextLeg(mv) { mv.i++; mv.s = 0; mv.t = 0; }
  function stepMover(e, dt) {
    const d = e.data, mv = d.mv;
    if (mv.delay > 0) {
      mv.delay -= dt;
      e.vx = e.vy = 0;
      if (mv.delay > 0) return;
      d.parked = false;
      dt = -mv.delay;
      mv.delay = 0;
      if (!(dt > 0)) return;
    }
    const L = mv.legs[mv.i];
    if (!L) { d.mv = null; return; }
    const x0 = e.x, y0 = e.y;
    if (L.hold != null) {
      mv.t += dt;
      e.vx = e.vy = 0;
      if (mv.t >= L.hold) nextLeg(mv);
      return;
    }
    if (L.escort) {
      const ld = L.escort;
      if (ld.dead || ld.dying) { d.mv = null; breakAway(e); return; }
      const k = 1 - Math.exp(-6 * dt);
      e.x += (ld.x + L.ox - e.x) * k;
      e.y += (ld.y + L.oy - e.y) * k;
      e.vx = (e.x - x0) / dt;
      e.vy = (e.y - y0) / dt;
      return;
    }
    if (L.fn) { if (L.fn(e, dt, L, mv)) nextLeg(mv); return; }
    if (!L.path) { nextLeg(mv); return; }
    const want = L.speed != null ? L.speed : num(d.spd, 200);
    if (L.accel) mv.sp = Math.min(L.max || want * 1.6, mv.sp + L.accel * dt);
    else mv.sp = U.approach(mv.sp, want, 520 * dt);
    mv.s += mv.sp * dt;
    mv.dist += mv.sp * dt;
    const last = mv.i >= mv.legs.length - 1;
    if (!last && mv.s >= L.path.len) {
      const over = mv.s - L.path.len;
      at(L.path, L.path.len, PT);
      nextLeg(mv);
      const N = mv.legs[mv.i];
      if (N && N.path) { mv.s = over; at(N.path, over, PT); }
    } else {
      at(L.path, mv.s, PT);
      if (last && mv.s >= L.path.len) mv.done = true;
    }
    e.x = PT.x + mv.ox;
    e.y = PT.y + mv.oy;
    e.vx = (e.x - x0) / dt;
    e.vy = (e.y - y0) / dt;
  }
  /** Default break-off: an accelerating dive toward the target's x and out of the bottom. */
  function dive(e, o) {
    o = o || EMPTY;
    const t = aimAt(e), sp = Math.max(260, num(e.data.spd, 200) * 1.3);
    const tx = U.clamp(t.x, 40, W - 40);
    const up = e.vy < -40 && e.y > H * 0.5;
    const ey = up ? -160 : H + 160;
    const p = spline([[e.x, e.y], [e.x + (tx - e.x) * 0.3 + e.vx * 0.25, e.y + (up ? -1 : 1) * 130], [tx, up ? e.y - 520 : Math.max(e.y + 420, H * 0.72)], [tx + (tx - e.x) * 0.25, ey]]);
    return follow(e, [{ path: p, speed: sp, accel: o.accel || 320, max: sp * 1.35 }], { startSpeed: Math.max(80, Math.hypot(e.vx, e.vy)) });
  }
  function breakAway(e) {
    const spec = e.def && e.def.spec;
    if (spec && spec.breakAway) spec.breakAway(e); else dive(e);
  }
  /** opts.path for SL.spawnEnemy: a path, [[x, y], ...], a legs array, {legs, delay, ox, oy, peel}, a registered
      SL.paths id (fn(opts) -> any of these) or a function (e, opts) -> any of these. */
  function resolvePath(p, e, o) {
    if (typeof p === 'string') {
      const fn = SL.paths.get(p);
      if (!fn) return null;
      p = typeof fn === 'function' ? fn(Object.assign({ x: e.x, y: e.y, speed: e.data.spd, side: o.side }, o.pathOpts || EMPTY), e) : fn;
    } else if (typeof p === 'function') p = p(e, o);
    if (!p) return null;
    if (p.isPath) return { legs: [{ path: p }] };
    if (Array.isArray(p)) {
      if (!p.length) return null;
      if (Array.isArray(p[0])) return { legs: [{ path: spline(p) }] };
      return { legs: p };
    }
    if (p.legs) return p;
    if (p.path) return { legs: [p] };
    return null;
  }

  // ------------------------------------------------------------------ formation groups and the bonus (GDD 6.1)
  function newGroup(kind) { return { kind, total: 0, alive: 0, lost: 0, done: false }; }
  function join(g, e) {
    if (!e || e.dead || !e.data) return e;
    e.data.grp = g;
    g.total++;
    g.alive++;
    return e;
  }
  function groupGone(e, byPlayer) {
    const g = e.data && e.data.grp;
    if (!g) return;
    e.data.grp = null;
    g.alive--;
    if (!byPlayer) g.lost++;
    if (g.alive <= 0 && !g.done) {
      g.done = true;
      if (g.lost === 0 && g.total >= 2) awardBonus(g, e);
    }
  }
  function awardBonus(g, e) {
    const s = session(), mult = s ? s.mult || 1 : 1;
    const bonus = Math.round(100 * g.total * mult);
    const x = U.clamp(e.x, 70, W - 70), y = U.clamp(e.y, 90, H - 160);
    if (SL.game && SL.game.addScore) SL.game.addScore(bonus);
    SL.fx.text(x, y - 30, 'FORMATION +' + U.fmtInt(bonus), { color: GOLD, size: 30, life: 1.5, rise: 80, weight: 800 });
    SL.fx.explode(x, y, { size: 's', palette: 'gold', debris: false, shake: false, sound: false });
    SL.fx.sparks(x, y, { count: 16, color: GOLD, speed: 360 });
    if (SL.pickups && SL.pickups.roll && SL.pickups.spawn) {
      const id = SL.pickups.roll('drop_formation');
      if (id) SL.pickups.spawn(id, x, y, { vx: 0, vy: -110 });
    }
    sfx('formation_bonus', x);
    SL.bus.emit('formationBonus', { kind: g.kind, members: g.total, bonus, x, y });
  }
  SL.bus.on('enemyKilled', (ev) => {
    const e = ev && ev.e;
    if (e && e.data && e.data.grp) groupGone(e, isPlayer(ev.by));
  });

  // ------------------------------------------------------------------ the common enemy def
  // spec: { name, cls, hp, r, speed, score, credits, dropChance, dropTable, explosion, palette, art (key), face
  // ('down' | 'move' | 'auto' | 'none'), bob, ripple, engines [[lx, ly, w, len, dir]], circles [[x, y, r]],
  // init(e, o), enter(e, o) (standalone movement), move(e, dt) (AI movement when no mover), act(e, dt) (attacks),
  // under / over (e, ctx, F) draw hooks, die(e) (death fx), onDeath(e), onExit(e), hit(e, dmg, o), breakAway(e) }.
  const DR = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, a: 1, t: 0, bob: 0 };
  function defineEnemy(id, spec) {
    spec.art = spec.art || id;
    const def = {
      name: spec.name, hp: spec.hp, r: spec.r, score: spec.score, credits: spec.credits, speed: spec.speed,
      dropTable: spec.dropTable, dropChance: spec.dropChance, explosion: spec.explosion, palette: spec.palette || 'enemy',
      cls: spec.cls, manualMove: true, sprite: 'en:' + spec.art, spec, ionImmune: !!spec.ionImmune, aimBait: 0,
      init: baseInit, update: baseUpdate, draw: baseDraw, onHit: baseHit, onDeath: baseDeath, onExit: baseExit,
    };
    if (spec.contactDamage != null) def.contactDamage = spec.contactDamage;
    if (spec.offscreenKill === false) def.offscreenKill = false;
    return SL.enemies.define(id, def);
  }
  function baseInit(e, o) {
    const spec = e.def.spec, d = e.data;
    d.tier = o.tier || missionTier();
    d.spd = num(o.speed, spec.speed);
    d.vis = 0;
    d.bank = 0;
    d.ph = Math.random() * TAU;
    d.slot = o.slot | 0;
    d.bobA = spec.bob != null ? spec.bob : 1.4;
    d.glowK = 1;
    d.thrust = 1;
    d.mv = null;
    d.grp = null;
    d.ems = [];
    d.svx = d.svy = d.gvx = d.gvy = 0;
    d.emerge = o.emerge > 0 ? o.emerge : 0;
    d.emerge0 = d.emerge;
    e.elite = !!o.elite;
    if (o.target) e.target = o.target;
    if (e.elite) {
      e.hp = e.maxHp = Math.round(e.maxHp * 1.6);
      e.score = Math.round((spec.score || 0) * 1.5);
      if (Array.isArray(spec.credits)) e.credits = [Math.round(spec.credits[0] * 1.5), Math.round(spec.credits[1] * 1.5)];
      e.dropChance = (spec.dropChance || 0) + 0.1;
    }
    d.skin = skin(e, spec.art);
    e.sprite = d.skin.b;
    if (spec.circles) e.circles = spec.circles.map((c) => ({ x: c[0], y: c[1], r: c[2] }));
    e.rot = 0;
    if (o.specimen) { d.specimen = true; e.invuln = true; e.intangible = true; e.untargetable = true; e.noCount = true; e.offscreenKill = false; e.noClear = true; }
    if (spec.init) spec.init(e, o);
    if (d.specimen) return;
    const path = o.path != null ? resolvePath(o.path, e, o) : null;
    if (path) follow(e, path.legs, path);
    else if (spec.enter) spec.enter(e, o);
    d.svx = e.vx;
    d.svy = e.vy;
  }
  function baseUpdate(e, dt) {
    if (!(dt > 0)) return;
    const d = e.data, spec = e.def.spec;
    if (d.specimen) {
      if (spec.idle) spec.idle(e, dt);
      e.vx = e.vy = 0;
      return;
    }
    if (e.x > -2 && e.x < W + 2 && e.y > -2 && e.y < H + 2) d.vis += dt;
    // velocity added by others since our last write (black-hole pull, repulsors) becomes a drift on top of the
    // mover or AI, so path-driven members still bend toward gravity sources
    const ax = e.vx - d.svx, ay = e.vy - d.svy;
    if (ax * ax + ay * ay > 0.01 && !spec.heavy) { d.gvx += ax; d.gvy += ay; }
    if (d.mv) stepMover(e, dt);
    else {
      if (spec.move) spec.move(e, dt);
      if (e.dead) return;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    if (e.dead) return;
    if (d.gvx || d.gvy) {
      e.x += d.gvx * dt;
      e.y += d.gvy * dt;
      if (d.mv) { d.mv.ox += d.gvx * dt; d.mv.oy += d.gvy * dt; }
      const k = Math.exp(-0.8 * dt);
      d.gvx *= k;
      d.gvy *= k;
      if (d.gvx * d.gvx + d.gvy * d.gvy < 1) d.gvx = d.gvy = 0;
    }
    if (d.emerge > 0 && !d.parked) { d.emerge = Math.max(0, d.emerge - dt); e.scale = 1 - 0.65 * (d.emerge / d.emerge0); }
    if (spec.act && !d.parked) spec.act(e, dt);
    if (e.dead) return;
    orient(e, dt, spec);
    const ghost = !!(d.parked || d.ghost);
    e.intangible = ghost;
    e.untargetable = ghost || !!d.cloak;
    e.invuln = ghost || !!d.shield || !!d.cloak;
    e.hidden = !!d.parked;
    d.svx = e.vx;
    d.svy = e.vy;
  }
  function orient(e, dt, spec) {
    const d = e.data, f = spec.face || 'down';
    if (f === 'none') { d.bank += (U.clamp(e.vy / 400, -0.2, 0.2) - d.bank) * Math.min(1, dt * 5); return; }
    const sp = Math.hypot(e.vx, e.vy);
    const prev = e.rot;
    if (f === 'move') {
      if (sp > 20 && !d.rotLock) e.rot = U.lerpAngle(e.rot, Math.atan2(e.vy, e.vx) - HALF, Math.min(1, dt * 10));
      const b = U.clamp(U.angleDiff(prev, e.rot) / dt * 0.12, -0.3, 0.3);
      d.bank += (b - d.bank) * Math.min(1, dt * 6);
      return;
    }
    let want = 0;
    if (f === 'auto' && sp > 90 && e.vy > -0.25 * sp) want = U.clamp(U.wrapAngle(Math.atan2(e.vy, e.vx) - HALF), -1.25, 1.25);
    const b = U.clamp(e.vx / Math.max(80, num(d.spd, 200)) * 0.3, -0.3, 0.3);
    d.bank += (b - d.bank) * Math.min(1, dt * 5);
    e.rot = U.lerpAngle(e.rot, want - d.bank * 0.55 + (d.tilt || 0), Math.min(1, dt * 6));
  }
  function baseDraw(e, ctx) {
    const d = e.data, spec = e.def.spec;
    if (d.parked || !d.skin) return;
    const t = SL.time.t;
    const F = DR;
    F.bob = d.bobA ? Math.sin(e.age * 2.3 + d.ph) * d.bobA : 0;
    F.x = e.x;
    F.y = e.y + F.bob;
    F.rot = e.rot;
    F.t = t;
    const roll = 1 - Math.abs(d.bank) * 0.28;
    let sx = (e.scale || 1) * roll;
    if (spec.ripple) sx *= 1 + spec.ripple * Math.sin(t * TAU * 0.7 + d.ph);
    F.sx = d.flip ? -sx : sx;
    F.sy = e.scale || 1;
    F.a = e.alpha == null ? 1 : e.alpha;
    if (spec.under) spec.under(e, ctx, F);
    const eng = spec.engines;
    if (eng && F.a > 0.02 && d.thrust > 0.02) {
      for (let i = 0; i < eng.length; i++) {
        const g = eng[i];
        plume(ctx, F, g[0], g[1], g[2] * (0.8 + 0.2 * d.thrust) * F.sy, g[3] * d.thrust * F.sy, g[4], t + e.id * 0.37 + i * 0.23);
      }
    }
    if (spec.body) spec.body(e, ctx, F);
    else {
      blit(ctx, d.skin.b, F.x, F.y, F.rot, F.sx, F.sy, F.a, false);
      const pulse = 0.5 + 0.5 * Math.sin(t * TAU * 0.8 + d.ph);
      blit(ctx, d.skin.g, F.x, F.y, F.rot, F.sx, F.sy, F.a * d.glowK * (0.45 + 0.55 * pulse), true);
    }
    if (e.flash > 0 && F.a > 0.3) blit(ctx, A.getFlash(d.skin.b), F.x, F.y, F.rot, F.sx, F.sy, Math.min(1, e.flash / 0.06) * 0.6 * F.a, false);
    if (spec.over) spec.over(e, ctx, F);
  }
  function pulseK(e) { return 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(SL.time.t * TAU * 0.8 + e.data.ph)); }
  function baseHit(e, dmg, o) {
    const spec = e.def.spec;
    if (spec.hit) spec.hit(e, dmg, o);
  }
  function stopAll(e) {
    const d = e.data;
    if (d.ems) { for (let i = 0; i < d.ems.length; i++) if (d.ems[i] && d.ems[i].stop) d.ems[i].stop(); d.ems.length = 0; }
    if (d.loop) { try { d.loop.stop(); } catch (err) { /* audio stub */ } d.loop = null; }
    if (d.warnLine) { d.warnLine.dead = true; d.warnLine = null; }
    if (d.arc && d.arc.bm && !d.arc.bm.dead && d.arc.bm.state !== 'fade') { d.arc.bm.state = 'fade'; d.arc.bm.fade = 0; }
    d.arc = null;
  }
  function baseDeath(e) {
    const spec = e.def.spec;
    stopAll(e);
    if (spec.die) spec.die(e);
    else SL.fx.explode(e.x, e.y, { size: spec.explosion, palette: spec.palette || 'enemy' });
    if (spec.onDeath) spec.onDeath(e);
    if (SL.pickups && SL.pickups.drop) SL.pickups.drop(e);
  }
  function baseExit(e) {
    const spec = e.def.spec;
    stopAll(e);
    if (spec.onExit) spec.onExit(e);
    groupGone(e, false);
  }
  /** Keeps a pattern emitter tied to the enemy (stopped on death or exit). */
  function own(e, em) { if (em && e.data.ems) e.data.ems.push(em); return em; }

  /** Heavy death: a chain of explosions over ~0.8 s ending in the big one. */
  function chainDeath(e, pal, n) {
    const x = e.x, y = e.y, r = e.r;
    SL.fx.explode(x, y, { size: 'l', palette: pal });
    for (let i = 0; i < (n || 5); i++) {
      const a = Math.random() * TAU, rr = r * (0.3 + Math.random() * 0.6);
      SL.after(0.1 + i * 0.12, () => SL.fx.explode(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8, { size: 'm', palette: pal, sound: i % 2 === 0, shake: i % 2 === 0 }));
    }
    SL.after(0.72, () => SL.fx.explode(x, y, { size: 'xl', palette: pal }));
  }

  // ================================================================== popcorn
  art('gnat', 34, 30, (K) => {
    const cx = K.cx, P = K.P;
    for (const s of [-1, 1]) {
      const fin = A.poly([cx + s * 6.5, 12.5, cx + s * 16.6, 2.2, cx + s * 15.4, 7.6, cx + s * 9.2, 16]);
      K.metal(fin, P.hull2, [cx - 17, 1, 34, 16], { spec: 0.6, edge: 1 });
      K.seam(seg([cx + s * 9, 11.8, cx + s * 15.2, 4.4]), 0.9);
    }
    const body = A.symPath(cx, [[0, 29.6], [3.2, 24.5], [8.4, 14], [11.8, 6.6], [9.4, 4.6], [5.2, 7], [3.4, 2.4], [0, 1.6]]);
    K.metal(body, P.hull, [cx - 12, 1, 24, 29], { spec: 0.62, specPos: 0.3 });
    K.grain(body, 0.14);
    const keel = A.symPath(cx, [[0, 25.5], [2.5, 20], [4.8, 11.5], [3, 5.4], [0, 4.8]]);
    K.metal(keel, P.hull2, [cx - 5, 4, 10, 22], { spec: 0.75, edge: 0.7, rimLight: 1.1 });
    K.lines(seg([cx - 7.6, 13.2, cx - 2.6, 15.6, cx + 2.6, 15.6, cx + 7.6, 13.2]));
    K.seam(seg([cx, 8.4, cx, 22.6]), 1.1);
    K.dot(cx, 3.3, 1.8, P.engine, 6);
    K.dot(cx, 25.6, 1.1, P.glow, 5);
  }, { pad: 6, res: 3 });

  defineEnemy('gnat', {
    name: 'Gnat drone', cls: 'popcorn', hp: 22, r: 14, speed: 240, score: 50, credits: [1, 1], dropChance: 0.01, dropTable: 'drop_small',
    explosion: 's', face: 'move', bob: 1, engines: [[0, -11.7, 5, 10]],
    init(e) { const d = e.data; d.shoots = d.tier >= 3 && SL.rng.chance(0.15); d.shot = false; },
    enter(e) {
      const t = aimAt(e), x1 = U.clamp(e.x + U.clamp((t.x - e.x) * 0.6, -220, 220), 30, W - 30);
      follow(e, [{ path: spline([[e.x, e.y], [e.x, Math.max(e.y + 200, 120)], [x1, H * 0.62], [x1, H + 90]]) }]);
    },
    act(e) {
      const d = e.data;
      if (d.shoots && !d.shot && e.ly < 300 && e.y >= 300) {
        d.shot = true;
        if (canAim(e) && pats()) pats().aimed(e, null, { speed: 200, type: 'orb', count: 1 + plus(e) });
      }
    },
    die(e) {
      SL.fx.emit({ x: e.x, y: e.y, life: 0.16, size: 48, size2: 8, color: '#ffffff' });
      SL.fx.emit({ x: e.x, y: e.y, life: 0.32, size: 26, size2: 64, color: PAL.glow, alpha: 0.55 });
      SL.fx.sparks(e.x, e.y, { count: 6, color: '#ffd6e4', speed: 400, life: 0.3 });
      sfx('explode_s', e.x);
    },
  });

  art('dart', 44, 48, (K) => {
    const cx = K.cx, P = K.P;
    for (const s of [-1, 1]) {
      const wing = A.poly([cx + s * 4.5, 11, cx + s * 13.5, 14.6, cx + s * 21.6, 31.6, cx + s * 18.6, 33.8, cx + s * 12.4, 25.6, cx + s * 5, 27.4]);
      K.metal(wing, P.hull, [cx - 22, 10, 44, 25], { spec: 0.55 });
      const pl = A.poly([cx + s * 7.2, 15.8, cx + s * 12.8, 17.8, cx + s * 18.4, 29.2, cx + s * 13.4, 23.4, cx + s * 7.2, 24.4]);
      K.metal(pl, P.hull2, [cx - 19, 15, 38, 15], { spec: 0.65, edge: 0.7, rimLight: 1.1 });
      K.seam(seg([cx + s * 8.2, 17.6, cx + s * 17, 29]), 1);
      K.dot(cx + s * 20.3, 32.3, 1.1, P.glow, 4);
      const pod = rrect(cx + s * 4.8 - 2.7, 2.6, 5.4, 13.5, 2.3);
      K.metal(pod, '#454b63', [cx + s * 4.8 - 3, 2.6, 6, 14], { spec: 0.7, edge: 0.7, rimLight: 1 });
      K.dot(cx + s * 4.8, 3.5, 1.4, P.engine, 5);
    }
    const fus = A.symPath(cx, [[0, 47.6], [1.3, 42], [3, 32], [4.6, 20], [4.4, 8], [2.6, 2.4], [0, 1.8]]);
    K.metal(fus, P.hull, [cx - 5, 2, 10, 46], { spec: 0.72, specPos: 0.28 });
    K.grain(fus, 0.12);
    K.lines(seg([cx - 4.3, 20.5, cx + 4.3, 20.5]));
    K.lines(seg([cx - 3.6, 12, cx + 3.6, 12]));
    K.glass(rrect(cx - 1.5, 26.4, 3, 10.4, 1.5), [cx - 1.5, 26.4, 3, 10.4]);
    K.lamp(rrect(cx - 0.75, 27.8, 1.5, 7.6, 0.75), P.glow, 6);
    K.seam(seg([cx, 38.5, cx, 44.6]), 0.8);
  }, { pad: 6, res: 3 });

  function peelDue(e, p) {
    const mv = e.data.mv;
    if (p.leg != null && mv.i >= p.leg) return true;
    if (p.s != null && mv.dist >= p.s) return true;
    if (p.f != null && mv.dist >= p.f * mv.total) return true;
    if (p.y != null && e.ly !== e.y && (e.ly - p.y) * (e.y - p.y) <= 0) return true;
    return mv.done;
  }
  let dartN = 0;
  defineEnemy('dart', {
    name: 'Dart interceptor', cls: 'popcorn', hp: 32, r: 18, speed: 300, score: 80, credits: [1, 2], dropChance: 0.02, dropTable: 'drop_small',
    explosion: 's', face: 'move', bob: 1, engines: [[-4.8, -20.6, 4.6, 12], [4.8, -20.6, 4.6, 12]],
    init(e) { const d = e.data; d.fires = d.tier >= 2 || dartN++ % 2 === 0; d.shot = false; d.peeled = false; },
    enter(e, o) {
      follow(e, [{ path: line(e.x, e.y, e.x, H + 100) }], { peel: { y: num(o.peelY, 300 + SL.rng.next() * 140) } });
    },
    move(e, dt) {
      const d = e.data;
      if (!d.peeled) return;
      const cur = Math.atan2(e.vy, e.vx), want = Math.atan2(d.py - e.y, d.px - e.x);
      const na = cur + U.clamp(U.angleDiff(cur, want), -2.6 * dt, 2.6 * dt);
      d.pv = Math.min(d.pv + 280 * dt, num(d.spd, 300) * 1.3);
      e.vx = Math.cos(na) * d.pv;
      e.vy = Math.sin(na) * d.pv;
    },
    act(e) {
      const d = e.data;
      if (d.fires && !d.shot && e.ly < 220 && e.y >= 220) {
        d.shot = true;
        if (canAim(e) && pats()) pats().aimed(e, null, { speed: 340, type: 'needle', count: 1 + plus(e), oy: 16 });
      }
      if (d.mv && !d.peeled && d.peel && peelDue(e, d.peel)) {
        const t = aimAt(e), up = e.vy < -30;
        d.peeled = true;
        d.mv = null;
        d.px = U.clamp(t.x, 30, W - 30);
        d.py = up ? -320 : H + 320;
        d.pv = Math.max(140, Math.hypot(e.vx, e.vy));
        if (!(Math.hypot(e.vx, e.vy) > 1)) e.vy = up ? -d.pv : d.pv;
      }
    },
    breakAway(e) {
      const d = e.data, t = aimAt(e);
      d.peeled = true;
      d.px = U.clamp(t.x, 30, W - 30);
      d.py = H + 320;
      d.pv = Math.max(160, Math.hypot(e.vx, e.vy));
      if (!(Math.hypot(e.vx, e.vy) > 1)) e.vy = d.pv;
    },
  });

  // ================================================================== fighters
  art('wasp', 64, 60, (K) => {
    const cx = K.cx, P = K.P;
    const tail = A.symPath(cx, [[0, 2.6], [21.5, 4.4], [23.4, 9.6], [8, 11.4], [0, 11]]);
    K.metal(tail, P.hull2, [cx - 24, 2, 48, 10], { spec: 0.55 });
    K.seam(seg([cx - 17.5, 7.2, cx + 17.5, 7.2]), 0.9);
    for (const s of [-1, 1]) {
      const wing = A.poly([cx + s * 8, 19.5, cx + s * 27.5, 21.6, cx + s * 31.4, 29.5, cx + s * 29.6, 36.4, cx + s * 8, 35.4]);
      K.metal(wing, P.hull, [cx - 32, 19, 64, 18], { spec: 0.55 });
      K.grain(wing, 0.12);
      K.lines(seg([cx + s * 12, 28.2, cx + s * 27.4, 29.2]));
      K.seam(seg([cx + s * 11, 33.2, cx + s * 26.5, 33.8]), 0.9);
      const gun = rrect(cx + s * 29.4 - 2.3, 24, 4.6, 22.5, 1.7);
      K.metal(gun, P.steel, [cx + s * 29.4 - 3, 24, 6, 23], { spec: 0.75, edge: 0.6, rimLight: 1 });
      K.lines(seg([cx + s * 29.4 - 2.3, 40, cx + s * 29.4 + 2.3, 40]), 0.6);
      K.dot(cx + s * 29.4, 45.4, 1.7, P.engine, 7);
    }
    for (const s of [-1, 1]) {
      const bx = cx + s * 19;
      const boom = rrect(bx - 4.3, 1.6, 8.6, 44, 4);
      K.metal(boom, P.hull, [bx - 5, 1.6, 10, 44], { spec: 0.68 });
      K.grain(boom, 0.12);
      const nac = ell(bx, 42, 5.5, 9.2);
      K.metal(nac, P.hull2, [bx - 6, 33, 12, 19], { spec: 0.75, edge: 0.8 });
      K.lines(seg([bx - 4.6, 38, bx + 4.6, 38]), 0.5);
      K.seam(seg([bx, 7, bx, 31]), 1);
      K.dot(bx, 50, 1.3, P.glow, 5);
      K.dot(bx, 3, 1.9, P.engine, 6);
    }
    const pod = A.symPath(cx, [[0, 57.6], [5.6, 52.4], [9.2, 40], [9.6, 22], [7.6, 9], [4, 4.6], [0, 4.2]]);
    K.metal(pod, P.hull, [cx - 10, 4, 20, 54], { spec: 0.7, specPos: 0.3 });
    K.grain(pod, 0.14);
    const spine = A.symPath(cx, [[0, 34], [3.4, 30], [4.4, 18], [3, 9], [0, 8]]);
    K.metal(spine, P.hull2, [cx - 5, 8, 10, 26], { spec: 0.75, edge: 0.6, rimLight: 1 });
    K.lines(seg([cx - 9.2, 21.6, cx + 9.2, 21.6]));
    K.lines(seg([cx - 7.6, 12.6, cx + 7.6, 12.6]));
    K.seam(seg([cx - 6.4, 31.5, cx, 35.2, cx + 6.4, 31.5]), 1);
    K.glass(ell(cx, 45, 4.6, 7.4), [cx - 4.6, 37.6, 9.2, 14.8]);
    K.dot(cx, 47, 1.2, P.glow, 6);
  }, { pad: 8, res: 2 });

  const GUN_OX = [-29.4, 29.4];
  defineEnemy('wasp', {
    name: 'Wasp fighter', cls: 'fighter', hp: 75, r: 26, speed: 220, score: 200, credits: [2, 4], dropChance: 0.06, dropTable: 'drop_fighter',
    explosion: 'm', face: 'auto', engines: [[-19, -27.5, 5.5, 13], [19, -27.5, 5.5, 13], [0, -26.5, 6.5, 15]],
    circles: [[0, 2, 20], [-26, 4, 10], [26, 4, 10]],
    init(e, o) {
      const d = e.data;
      d.fire = 0.9 + d.slot * 0.17;
      d.gunT = 0;
      d.mz = 0;
      d.mzS = 1;
      d.st = 'in';
      d.hoverY = num(o.hoverY, 280);
    },
    enter(e) { e.vy = e.data.spd; },
    move(e, dt) {
      const d = e.data;
      if (d.st === 'in') {
        seek(e, e.x, d.hoverY, d.spd, 2.8);
        if (Math.abs(e.y - d.hoverY) < 6) { d.st = 'strafe'; d.t = 0; d.x0 = U.clamp(e.x, 170, W - 170); }
      } else if (d.st === 'strafe') {
        d.t += dt;
        seek(e, d.x0 + 140 * Math.sin(d.t * TAU * 0.5), d.hoverY, d.spd * 1.4, 7);
        if (d.t >= 6) { d.st = 'out'; d.ex = e.x < W / 2 ? -1 : 1; }
      } else {
        e.vx = U.approach(e.vx, d.ex * 170, 260 * dt);
        e.vy = U.approach(e.vy, 260, 240 * dt);
      }
    },
    act(e, dt) {
      const d = e.data;
      if (d.mz > 0) d.mz -= dt;
      if (d.gunT > 0) {
        d.gunT -= dt;
        if (d.gunT <= 0 && pats()) {
          const first = pats().burst(e, null, {
            shots: 3 + plus(e), gap: 0.12, speed: 230, type: 'orb', ox: GUN_OX, oy: 16,
            onShot(i) { d.mz = 0.08; d.mzS = i % 2 ? 1 : -1; },
          });
          own(e, first && first.emitter);
        }
        return;
      }
      if (!onScreen(e, -20)) return;
      if (ready(e, 'fire', 1.3, dt)) { if (canAim(e)) d.gunT = 0.3; else d.fire = 0.15; }
    },
    over(e, ctx, F) {
      const d = e.data;
      if (d.gunT > 0) {
        const k = 1 - d.gunT / 0.3;
        glowAt(ctx, F, -29.4, 15.6, 5 + 11 * k, PAL.engine, 0.35 + 0.65 * k);
        glowAt(ctx, F, 29.4, 15.6, 5 + 11 * k, PAL.engine, 0.35 + 0.65 * k);
      }
      if (d.mz > 0) glowAt(ctx, F, 29.4 * d.mzS, 17, 15, '#ffd2a0', d.mz / 0.08);
    },
  });

  const LEG_A = [0.62, 2.52, -0.62, -2.52];
  art('snatcher', 56, 56, (K) => {
    const cx = K.cx, cy = K.cy - 2, P = K.P;
    const abd = ell(cx, cy - 11.5, 10.6, 8.6);
    K.metal(abd, P.hull2, [cx - 11, cy - 21, 22, 18], { spec: 0.55 });
    K.grain(abd, 0.12);
    K.lines(seg([cx - 8.6, cy - 12.5, cx + 8.6, cy - 12.5]), 0.5);
    K.seam(seg([cx - 6, cy - 15, cx, cy - 17.4, cx + 6, cy - 15]), 1);
    K.dot(cx, cy - 19.4, 1.7, P.engine, 6);
    for (const a of LEG_A) {
      const hx = cx + Math.cos(a) * 12.2, hy = cy + 2 + Math.sin(a) * 12.2;
      K.metal(circ(hx, hy, 3.4), P.steel, [hx - 3.4, hy - 3.4, 6.8, 6.8], { spec: 0.8, edge: 0.5, rimLight: 0.8 });
    }
    const body = circ(cx, cy + 2, 13.8);
    K.metal(body, P.hull, [cx - 14, cy - 12, 28, 28], { spec: 0.68, specPos: 0.26 });
    K.grain(body, 0.14);
    const crown = A.symPath(cx, [[0, cy - 10.6], [7.5, cy - 8], [10.4, cy - 1], [6.4, cy + 3.6], [0, cy + 4.6]]);
    K.metal(crown, P.hull2, [cx - 11, cy - 11, 22, 16], { spec: 0.75, edge: 0.7, rimLight: 1.1 });
    K.lines(seg([cx - 9, cy - 3.4, cx + 9, cy - 3.4]));
    K.seam(seg([cx, cy - 9.5, cx, cy + 3]), 1);
    K.seam(seg([cx - 11.4, cy + 6, cx - 7, cy + 11]), 0.8);
    K.seam(seg([cx + 11.4, cy + 6, cx + 7, cy + 11]), 0.8);
    const em = ell(cx, cy + 13.2, 7.6, 4.5);
    K.metal(em, '#262a3a', [cx - 7.6, cy + 8.7, 15.2, 9], { spec: 0.45, edge: 0.6 });
    K.lamp(ell(cx, cy + 13.8, 4.6, 2.4), TRACTOR, 7);
    K.lamp(ell(cx, cy + 5.4, 3.9, 3.2), P.glow, 10);
    K.glint(cx - 1.3, cy + 4.3, 1.5);
  }, { pad: 6, res: 3 });
  art('snatcher_femur', 30, 8, (K) => {
    const f = A.poly([15, 2.3, 25.6, 2.6, 28.6, 4, 25.6, 5.4, 15, 5.7]);
    K.metal(f, K.P.hull2, [15, 2, 14, 4], { spec: 0.75, edge: 0.6, rimLight: 1 });
    K.seam(seg([17.4, 4, 25, 4]), 0.6);
  }, { pad: 2, res: 3 });
  art('snatcher_claw', 32, 12, (K) => {
    const c = A.poly([16, 4.4, 25, 3.3, 30.4, 5.6, 31.4, 8.8, 28.6, 6.8, 24.6, 7.5, 16, 7.6]);
    K.metal(c, K.P.hull, [16, 3, 16, 6], { spec: 0.8, edge: 0.6, rimLight: 1 });
    K.lines(seg([21.5, 3.9, 21.5, 7.5]), 0.5);
    K.dot(29.9, 7.4, 0.9, K.P.glow, 4);
  }, { pad: 2, res: 3 });
  A.define('en:fx:tractor', 40, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,190,190,0.9)');
    g.addColorStop(0.5, 'rgba(255,110,120,0.45)');
    g.addColorStop(1, 'rgba(255,90,110,0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 4, 0);
    ctx.lineTo(w / 2 + 4, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,200,200,0.5)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(w / 2, (h * i) / 6, 4 + (w / 2 - 4) * (i / 6), 2 + i * 0.6, 0, 0, TAU);
      ctx.stroke();
    }
  }, { pad: 2, res: 2 });

  function towedByOther(p, e) { const t = p.towedBy; return !!t && t !== e && !t.dead && !t.dying; }
  function findPod(e) {
    let best = null, bd = Infinity, vip = null, vd = Infinity;
    const pods = SL.world.pods;
    for (let i = 0; i < pods.length; i++) {
      const p = pods[i];
      if (p.dead || (p.data && p.data.pilot) || p.y < 20 || p.y > H - 40 || p.x < 0 || p.x > W || towedByOther(p, e)) continue;
      const dd = U.dist2(p.x, p.y, e.x, e.y);
      if (p.data && p.data.vip) { if (dd < vd) { vd = dd; vip = p; } } else if (dd < bd) { bd = dd; best = p; }
    }
    return vip || best;
  }
  function releasePod(e, freed) {
    const d = e.data, p = d.pod;
    d.pod = null;
    if (d.loop) { try { d.loop.stop(); } catch (err) { /* stub */ } d.loop = null; }
    if (!p || p.dead || p.towedBy !== e) return;
    p.towedBy = null;
    p.vy = 30;
    if (!freed) return;
    const s = session(), mult = s ? s.mult || 1 : 1;
    if (SL.game && SL.game.addScore) SL.game.addScore(300 * mult);
    SL.fx.text(p.x, p.y - 30, '+300 SAVED', { color: SL.pal.rescue, size: 24, life: 1.2 });
    SL.fx.sparks(p.x, p.y, { count: 10, color: SL.pal.rescue, speed: 260 });
    SL.bus.emit('podFreed', { pod: p, e });
  }
  defineEnemy('snatcher', {
    name: 'Snatcher tow drone', cls: 'fighter', hp: 70, r: 22, speed: 240, score: 400, credits: [4, 6], dropChance: 0.1, dropTable: 'drop_fighter',
    explosion: 'm', face: 'down', bob: 1.6, engines: [[0, -21.5, 5, 11]],
    init(e, o) {
      const d = e.data;
      d.st = 'hover';
      d.pod = null;
      d.look = 0;
      d.ring = 2.2;
      d.chg = 0;
      d.gripK = 0;
      d.idleT = 0;
      d.hoverY = num(o.hoverY, 250);
      d.femur = skin(e, 'snatcher_femur');
      d.claw = skin(e, 'snatcher_claw');
      if (o.side === 'left' || o.side === 'right') { e.x = o.side === 'left' ? -40 : W + 40; e.y = num(o.y, 300); }
    },
    move(e, dt) {
      const d = e.data;
      if (d.st !== 'tow' && d.st !== 'leave') {
        d.look -= dt;
        if (d.look <= 0) {
          d.look = 0.35;
          const p = findPod(e);
          if (p) { d.pod = p; d.st = 'seek'; } else if (d.st === 'seek') { d.pod = null; d.st = 'hover'; }
        }
      }
      if (d.st === 'seek') {
        const p = d.pod;
        if (!p || p.dead || towedByOther(p, e)) { d.pod = null; d.st = 'hover'; d.look = 0; return; }
        seek(e, p.x, p.y - 34, d.spd, 3.4);
        if (U.dist(e.x, e.y, p.x, p.y - 34) <= 30) {
          d.st = 'tow';
          p.towedBy = e;
          if (SL.audio && SL.audio.loop) { try { d.loop = SL.audio.loop('snatch_tractor', { x: e.x }); } catch (err) { d.loop = null; } }
          SL.bus.emit('podSnatched', { pod: p, e });
        }
      } else if (d.st === 'tow') {
        const p = d.pod;
        if (!p || p.dead) { releasePod(e, false); d.st = 'hover'; return; }
        e.vx *= 1 / (1 + 3 * dt);
        e.vy = U.approach(e.vy, -90, 220 * dt);
      } else if (d.st === 'hover') {
        d.idleT += dt;
        const p = SL.world.nearestPlayer(e.x, e.y);
        const tx = U.clamp(p ? e.x + (p.x - e.x) * 0.25 : e.x, 70, W - 70);
        seek(e, tx, d.hoverY + Math.sin(e.age * 1.3 + d.ph) * 18, 160, 1.5);
        if (d.idleT > 18) d.st = 'leave';
      } else {
        e.vx *= 1 / (1 + dt);
        e.vy = U.approach(e.vy, -220, 240 * dt);
      }
    },
    act(e, dt) {
      const d = e.data;
      d.gripK = U.approach(d.gripK, d.st === 'tow' ? 1 : 0, dt * 4);
      if (d.st === 'tow') {
        const p = d.pod;
        if (p && !p.dead) { p.x = e.x; p.y = e.y + 34; p.vx = 0; p.vy = 0; p.towedBy = e; }
        if (d.loop && d.loop.set) { try { d.loop.set({ x: e.x }); } catch (err) { /* stub */ } }
        if (e.y < -36 && p) {
          releasePod(e, false);
          p.towedBy = null;
          if (SL.rescue && SL.rescue.lose) SL.rescue.lose(p, 'snatched');
          else if (!p.dead) {
            p.dead = true;
            const s = session();
            if (s) s.podsLost++;
            SL.bus.emit('podLost', { pod: p, reason: 'snatched' });
          }
          leave(e);
        }
        return;
      }
      if (d.chg > 0) {
        d.chg -= dt;
        if (d.chg <= 0 && pats()) pats().ring(e, { count: 6 + plus(e), speed: 150, type: 'orb', offset: e.age, oy: 12 });
        return;
      }
      if (d.st === 'hover' && onScreen(e, -10) && ready(e, 'ring', 3, dt)) { d.chg = 0.45; charge(e, 0, 13, 0.45, PAL.glow, 16); }
    },
    onDeath(e) { releasePod(e, true); },
    onExit(e) { releasePod(e, false); },
    under(e, ctx, F) {
      const d = e.data, t = F.t;
      if (d.gripK > 0.05) {
        loc(F, 0, 14);
        const tr = A.get('en:fx:tractor');
        blit(ctx, tr, PT.x, PT.y + 21 * F.sy, F.rot, 0.9 + 0.1 * Math.sin(t * 23), 0.68, d.gripK * (0.55 + 0.25 * Math.sin(t * 31)), true);
      }
      for (let i = 0; i < 4; i++) {
        const a0 = LEG_A[i], side = Math.cos(a0) >= 0 ? 1 : -1, front = Math.sin(a0) > 0;
        const sw = Math.sin(t * 6.5 + i * 1.7 + d.ph) * 0.2 * (1 - d.gripK);
        const ha = a0 + sw + d.gripK * (front ? side * 0.5 : side * 0.25);
        const ca = ha + side * (0.95 + 0.55 * d.gripK + 0.12 * Math.sin(t * 6.5 + i));
        loc(F, Math.cos(a0) * 12.2, Math.sin(a0) * 12.2);
        const hx = PT.x, hy = PT.y;
        blit(ctx, d.femur.b, hx, hy, F.rot + ha, 1, 1, F.a, false);
        const kx = hx + Math.cos(F.rot + ha) * 12.6, ky = hy + Math.sin(F.rot + ha) * 12.6;
        blit(ctx, d.claw.b, kx, ky, F.rot + ca, 1, 1, F.a, false);
        blit(ctx, d.claw.g, kx, ky, F.rot + ca, 1, 1, F.a * pulseK(e), true);
      }
    },
    over(e, ctx, F) {
      const d = e.data;
      if (d.gripK > 0.05) glowAt(ctx, F, 0, 14, 14, TRACTOR, d.gripK * (0.6 + 0.3 * Math.sin(F.t * 27)));
    },
  });

  art('spear', 40, 70, (K) => {
    const cx = K.cx, P = K.P;
    for (const s of [-1, 1]) {
      const wing = A.poly([cx + s * 5, 9, cx + s * 19.6, 5.4, cx + s * 18.2, 10.2, cx + s * 6, 24]);
      K.metal(wing, P.hull, [cx - 20, 5, 40, 20], { spec: 0.55 });
      K.seam(seg([cx + s * 7, 11.2, cx + s * 16.6, 8]), 1);
      K.dot(cx + s * 18.6, 6.6, 1, P.glow, 4);
    }
    const eng = A.symPath(cx, [[0, 0.8], [6.6, 1.8], [8.2, 9], [7.2, 20], [0, 21]]);
    K.metal(eng, '#454b63', [cx - 8, 1, 16, 20], { spec: 0.62 });
    K.recess(ell(cx, 2.6, 4.4, 1.8), [cx - 4.4, 0.8, 8.8, 3.6]);
    const lance = A.symPath(cx, [[0, 69.6], [1.2, 62], [2.6, 46], [4.6, 34], [6.6, 22], [6.8, 12], [4.5, 6], [0, 5.5]]);
    K.metal(lance, P.hull, [cx - 7, 5, 14, 65], { spec: 0.74, specPos: 0.28 });
    K.grain(lance, 0.12);
    const ridge = A.symPath(cx, [[0, 50], [1.8, 40], [3.2, 26], [3, 14], [0, 11]]);
    K.metal(ridge, P.hull2, [cx - 3, 11, 6, 39], { spec: 0.8, edge: 0.6, rimLight: 1 });
    K.lines(seg([cx - 5.6, 22, cx + 5.6, 22]));
    K.lines(seg([cx - 4.6, 32, cx + 4.6, 32]));
    K.seam(seg([cx - 4.2, 34.5, cx - 1.6, 52, cx, 60, cx + 1.6, 52, cx + 4.2, 34.5]), 0.9);
    K.dot(cx, 66.5, 1.1, WARN, 5);
    K.dot(cx, 2.6, 2.4, P.engine, 6);
  }, { pad: 6, res: 3 });

  defineEnemy('spear', {
    name: 'Spear rammer', cls: 'fighter', hp: 60, r: 20, speed: 200, score: 150, credits: [2, 3], dropChance: 0.05, dropTable: 'drop_fighter',
    explosion: 'm', face: 'move', bob: 1, engines: [[0, -32.4, 11, 24]],
    circles: [[0, 4, 14], [0, 24, 8]],
    init(e, o) {
      const d = e.data;
      d.st = 'in';
      d.lockY = num(o.lockY, 160 + SL.rng.next() * 140);
      d.nose = 0;
      d.ang = HALF;
      d.trail = 0;
    },
    enter(e) {
      const d = e.data;
      follow(e, [{ path: line(e.x, e.y, e.x, d.lockY), speed: d.spd }, { hold: 0.05 }]);
      d.standalone = true;
    },
    move(e, dt) {
      const d = e.data;
      if (d.st === 'lock') {
        e.vx = U.approach(e.vx, 0, 700 * dt);
        e.vy = U.approach(e.vy, 0, 700 * dt);
        d.t += dt;
        const tg = aimAt(e), want = Math.atan2(tg.y - e.y, tg.x - e.x);
        d.ang += U.clamp(U.angleDiff(d.ang, want), -4 * dt, 4 * dt);
        e.rot = d.ang - HALF;
        if (d.warnLine && !d.warnLine.dead) { d.warnLine.angle = d.ang; d.warnLine.ox = Math.cos(d.ang) * 34; d.warnLine.oy = Math.sin(d.ang) * 34; }
        d.nose = Math.min(1, d.t / 0.8);
        if (d.t >= 0.8) {
          d.st = 'dash';
          d.thrust = 2.3;
          if (d.warnLine) { d.warnLine.dead = true; d.warnLine = null; }
          if (d.tier >= 4 && pats()) {
            for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
              const along = 10 - k * 18;
              pats().fire(e.x + Math.cos(d.ang) * along, e.y + Math.sin(d.ang) * along, d.ang + s * HALF, 120, 'shard', { owner: e });
            }
          }
          SL.fx.emit({ x: e.x - Math.cos(d.ang) * 30, y: e.y - Math.sin(d.ang) * 30, life: 0.22, size: 50, size2: 10, color: '#ffd2a0' });
        }
      } else if (d.st === 'dash') {
        e.vx = Math.cos(d.ang) * 720;
        e.vy = Math.sin(d.ang) * 720;
        e.rot = d.ang - HALF;
        d.trail = Math.min(1, d.trail + dt * 6);
      }
    },
    act(e) {
      const d = e.data;
      if (d.st !== 'in') return;
      const go = d.mv ? (d.standalone ? d.mv.i >= 1 : d.vis >= 0.9 + d.slot * 0.15 && onScreen(e, -30)) : true;
      if (!go) return;
      d.st = 'lock';
      d.mv = null;
      d.t = 0;
      d.rotLock = true;
      d.ang = e.rot + HALF;
      d.thrust = 0.45;
      const P = pats();
      d.warnLine = P && P.warn ? P.warn(e, { fx: 'line', angle: d.ang, life: 0.8, ox: Math.cos(d.ang) * 34, oy: Math.sin(d.ang) * 34 }) : null;
      sfx('spear_lock', e.x);
    },
    under(e, ctx, F) {
      const d = e.data;
      if (d.st !== 'dash') return;
      const c = Math.cos(d.ang), s = Math.sin(d.ang);
      for (let i = 1; i <= 3; i++) blit(ctx, d.skin.b, F.x - c * i * 26, F.y - s * i * 26, F.rot, F.sx, F.sy, d.trail * (0.32 - i * 0.08), false);
      SL.render.setTransform(ctx, F.x, F.y, d.ang + HALF, 1, 1);
      A.flame(ctx, 0, 30, 16, 120 * d.trail, '#ffffff', WARN, F.t);
      SL.render.resetTransform(ctx);
    },
    over(e, ctx, F) {
      const d = e.data;
      if (d.nose > 0.01 && d.st !== 'in') {
        glowAt(ctx, F, 0, 33, 6 + 16 * d.nose, WARN, 0.4 + 0.6 * d.nose);
        if (d.st === 'lock' && d.t > 0.65) glowAt(ctx, F, 0, 33, 12, '#ffffff', 0.9);
      }
    },
  });

  art('needler', 70, 70, (K) => {
    const cx = K.cx, cy = K.cy, P = K.P;
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + i * HALF;
      const vane = rotPoly(cx, cy, a, [[11, -6.4], [27, -5.2], [31.6, -2.4], [32.4, 0], [31.6, 2.4], [27, 5.2], [11, 6.4]]);
      K.metal(vane, P.hull, null, { spec: 0.55 });
      const fin = rotPoly(cx, cy, a, [[14, -3.2], [26, -2.6], [28.6, 0], [26, 2.6], [14, 3.2]]);
      K.metal(fin, P.hull2, null, { spec: 0.72, edge: 0.6, rimLight: 1 });
      K.lines(rotPoly(cx, cy, a, [[21, -5.8], [21, 5.8]], true), 0.5);
      K.seam(rotPoly(cx, cy, a, [[16, 0], [27, 0]], true), 1);
      K.dot(cx + Math.cos(a) * 30.8, cy + Math.sin(a) * 30.8, 1.3, P.glow, 5);
    }
    const sph = K.sphere(cx, cy, 17.6, '#2b3044');
    K.lines(ell(cx, cy + 2, 17.2, 6.4), 0.45);
    K.seam(rotPoly(cx, cy, 0, [[-12.5, 7.5], [-5, 10.4], [5, 10.4], [12.5, 7.5]], true), 1);
    K.shade(sph, cx + 8, cy + 10, 16, 0.35);
    K.metal(circ(cx, cy, 7.6), P.steel, [cx - 7.6, cy - 7.6, 15.2, 15.2], { spec: 0.85, edge: 0.6, rimLight: 1 });
    K.recess(circ(cx, cy, 4.2), [cx - 4.2, cy - 4.2, 8.4, 8.4]);
  }, { pad: 6, res: 2 });
  art('needler_barrel', 80, 14, (K) => {
    const P = K.P, y = 7;
    K.metal(rrect(42, y - 3.6, 9, 7.2, 2), P.hull, [42, y - 3.6, 9, 7.2], { spec: 0.7, edge: 0.6 });
    K.metal(rrect(49, y - 2.4, 22, 4.8, 1.8), P.steel, [49, y - 3, 22, 6], { spec: 0.9, edge: 0.6, rimLight: 1 });
    K.metal(rrect(70, y - 3.4, 7.4, 6.8, 1.6), P.hull2, [70, y - 3.5, 7.4, 7], { spec: 0.85, edge: 0.6 });
    K.lines(seg([73.5, y - 3.4, 73.5, y + 3.4]), 0.6);
    K.seam(seg([52, y, 68, y]), 0.6, WARN);
    K.dot(76.4, y, 1, WARN, 5);
  }, { pad: 3, res: 3 });

  defineEnemy('needler', {
    name: 'Needler sniper', cls: 'fighter', hp: 90, r: 24, speed: 200, score: 240, credits: [3, 5], dropChance: 0.08, dropTable: 'drop_fighter',
    explosion: 'm', face: 'down', bob: 4, engines: [[-12.4, -12.4, 4.6, 11, -2.36], [12.4, -12.4, 4.6, 11, -0.79]],
    init(e, o) {
      const d = e.data;
      d.st = 'in';
      d.hoverY = num(o.hoverY, 190 + SL.rng.next() * 120);
      d.aim = HALF;
      d.fire = 0.35;
      d.t = 0;
      d.em = null;
      d.so = null;
      d.barrel = skin(e, 'needler_barrel');
    },
    enter(e) { e.vy = e.data.spd; },
    move(e, dt) {
      const d = e.data;
      if (d.st === 'in') {
        seek(e, e.x, d.hoverY, d.spd, 2.6);
        if (Math.abs(e.y - d.hoverY) < 5) { d.st = 'park'; d.t = 0; }
      } else if (d.st === 'park') {
        d.t += dt;
        seek(e, e.x, d.hoverY, 60, 2);
        if (d.t > 12 && !d.em) d.st = 'out';
      } else {
        e.vx *= 1 / (1 + dt);
        e.vy = U.approach(e.vy, -230, 260 * dt);
      }
    },
    act(e, dt) {
      const d = e.data, em = d.em;
      const bob = Math.sin(e.age * 2.3 + d.ph) * d.bobA;
      if (em && !em.done) {
        if (em.angle != null) d.aim = em.angle;
        d.so.ox = Math.cos(d.aim) * 36;
        d.so.oy = Math.sin(d.aim) * 36 + bob;
        d.lockK = em.phase === 'lock' || em.phase === 'fire' ? 1 : 0;
      } else {
        d.em = null;
        d.lockK = 0;
        const p = SL.world.nearestPlayer(e.x, e.y);
        const want = p ? Math.atan2(p.y - e.y, p.x - e.x) : HALF;
        d.aim += U.clamp(U.angleDiff(d.aim, want), -1.2 * dt, 1.2 * dt);
      }
      if (d.st === 'park' && ready(e, 'fire', 3.0, dt) && !d.em) {
        if (canAim(e) && pats()) {
          d.so = { track: 1.0, trackRate: 1.2, lock: 0.25, shots: (d.tier >= 4 ? 3 : 1) + plus(e), gap: 0.08, speed: 620, type: 'needle',
            ox: Math.cos(d.aim) * 36, oy: Math.sin(d.aim) * 36 + bob, angle: d.aim };
          d.em = own(e, pats().sniper_line(e, d.so));
        } else d.fire = 0.2;
      }
    },
    over(e, ctx, F) {
      const d = e.data, a = d.aim;
      blit(ctx, d.barrel.b, F.x, F.y, a, 1, 1, F.a, false);
      blit(ctx, d.barrel.g, F.x, F.y, a, 1, 1, F.a * (0.6 + 0.4 * pulseK(e)), true);
      const sx = F.x + Math.cos(a) * 9, sy = F.y + Math.sin(a) * 9;
      const blink = 0.55 + 0.45 * Math.sin(F.t * 9 + d.ph);
      A.drawGlow(ctx, sx, sy, 7 + 6 * (d.lockK || 0), WARN, F.a * (d.lockK ? 1 : blink));
      if (d.lockK) A.drawGlow(ctx, sx, sy, 9, '#ffffff', F.a);
    },
  });

  // ================================================================== skimmer: sideways catamaran minelayer
  // Art faces +x (nose right); flipped when it flies left. Engines sit on the trailing ends of the pontoons.
  art('skimmer', 90, 46, (K) => {
    const P = K.P;
    const deck = A.poly([19, 12.5, 63, 12.5, 71, 17.5, 71, 28.5, 63, 33.5, 19, 33.5, 13.5, 28.5, 13.5, 17.5]);
    K.metal(deck, P.hull2, [13, 12, 59, 22], { spec: 0.45 });
    K.grain(deck, 0.12);
    K.lines(seg([20, 23, 61, 23]), 0.45);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const x = 25 + i * 11, y = 18.4 + j * 9.2;
        K.recess(circ(x, y, 4), [x - 4, y - 4, 8, 8]);
        K.sphere(x - 0.2, y - 0.2, 2.8, '#2a2433', 0.55);
        K.seam(circ(x, y, 4), 0.7, VIOLET, 5);
        K.dot(x + 0.6, y + 0.6, 0.9, VIOLET, 5);
      }
    }
    for (let j = 0; j < 2; j++) {
      const y0 = j ? 36 : 10;
      const pon = A.poly([3.6, y0 - 4.2, 12, y0 - 6.1, 66, y0 - 5.7, 79, y0 - 3.7, 88.8, y0 + 0.3, 79, y0 + 3.9, 66, y0 + 5.7, 12, y0 + 6.1, 3.6, y0 + 4.2]);
      K.metal(pon, P.hull, [3, y0 - 7, 86, 14], { spec: 0.62, specPos: 0.3 });
      K.grain(pon, 0.13);
      const ridge = A.poly([15, y0 - 3.1, 64, y0 - 3, 77, y0 - 1.2, 64, y0 + 0.4, 15, y0 + 0.6]);
      K.metal(ridge, P.hull2, [15, y0 - 4, 62, 5], { spec: 0.8, edge: 0.6, rimLight: 1 });
      K.lines(seg([31, y0 - 5.8, 31, y0 + 5.8]), 0.5);
      K.lines(seg([52, y0 - 5.6, 52, y0 + 5.6]), 0.5);
      K.seam(seg([17, y0 + 3.4, 66, y0 + 3.3, 79, y0 + 1.7]), 0.9);
      K.metal(rrect(1.2, y0 - 3.7, 6.4, 7.4, 1.8), P.steel, [1, y0 - 4, 7, 8], { spec: 0.8, edge: 0.5, rimLight: 0.8 });
      K.recess(ell(2.4, y0, 1.4, 2.8), [1, y0 - 2.8, 2.8, 5.6]);
      K.dot(2.6, y0, 1.6, P.engine, 6);
      K.dot(86.8, y0 + 0.3, 1, P.glow, 4);
    }
    const br = A.poly([57, 16.6, 67, 17.8, 75, 23, 67, 28.2, 57, 29.4]);
    K.metal(br, P.hull, [56, 16, 20, 14], { spec: 0.7 });
    K.glass(A.poly([61.5, 19.6, 68.6, 21, 72.4, 23, 68.6, 25, 61.5, 26.4]), [61.5, 19.6, 11, 6.8]);
    K.seam(seg([57.6, 18.4, 57.6, 27.6]), 0.8);
  }, { pad: 8, res: 2 });

  defineEnemy('skimmer', {
    name: 'Skimmer minelayer', cls: 'fighter', hp: 85, r: 28, speed: 180, score: 220, credits: [3, 4], dropChance: 0.08, dropTable: 'drop_fighter',
    explosion: 'm', face: 'none', bob: 1.5, engines: [[-42.4, -13, 6, 15, PI], [-42.4, 13, 6, 15, PI]],
    circles: [[-18, 0, 20], [16, 0, 20]],
    init(e, o) {
      const d = e.data;
      const side = o.side === 'left' || o.side === 'right' ? o.side : o.x != null && o.x > W / 2 ? 'right' : o.x != null ? 'left' : SL.rng.chance(0.5) ? 'left' : 'right';
      d.dir = side === 'left' ? 1 : -1;
      d.flip = d.dir < 0;
      d.y0 = o.y > 100 && o.y < H - 320 ? o.y : 260 + SL.rng.next() * 160;
      d.fire = 1.1 + d.slot * 0.3;
      d.mines = null;
      d.mz = 0;
    },
    enter(e) {
      const d = e.data;
      e.x = d.dir > 0 ? -60 : W + 60;
      e.y = d.y0;
      e.vx = d.dir * d.spd;
      e.vy = 0;
    },
    move(e, dt) {
      const d = e.data;
      e.vx = U.approach(e.vx, d.dir * d.spd, 220 * dt);
      e.vy = (d.y0 + Math.sin(e.age * 1.7 + d.ph) * 10 - e.y) * 2;
      if ((d.dir > 0 && e.x > W + 70) || (d.dir < 0 && e.x < -70)) leave(e);
    },
    act(e, dt) {
      const d = e.data;
      if (Math.abs(e.vx) > 20) d.flip = e.vx < 0;
      if (d.mz > 0) d.mz -= dt;
      const inside = e.x > 36 && e.x < W - 36 && e.y > 30 && e.y < H - 260;
      if (inside && !d.mines && pats()) d.mines = own(e, pats().mine_lay(e, { every: 0.7, behind: 4, duration: Infinity }));
      else if (!inside && d.mines) { d.mines.stop(); d.mines = null; }
      if (!onScreen(e, -20)) return;
      if (ready(e, 'fire', 2, dt)) {
        if (canAim(e) && pats()) {
          pats().aimed(e, null, { count: 2 + plus(e), speed: 200, type: 'orb', ox: d.flip ? -30 : 30 });
          d.mz = 0.1;
        } else d.fire = 0.2;
      }
    },
    over(e, ctx, F) {
      const d = e.data;
      if (d.mz > 0) glowAt(ctx, F, 30, 0, 16, '#ffc2d6', d.mz / 0.1);
      // the next mine glows in its rack just before it drops
      const em = d.mines;
      if (em && em.d && em.d.next != null && em.d.next < 0.25) glowAt(ctx, F, -9, 0, 12, VIOLET, 1 - em.d.next / 0.25);
    },
  });

  // ================================================================== hornet: missile boat
  const TUBES = [[-10.5, 11], [10.5, 11], [-25, 11], [25, 11]];
  art('hornet', 80, 74, (K) => {
    const cx = K.cx, P = K.P;
    for (const s of [-1, 1]) {
      const fin = A.poly([cx + s * 6, 10.5, cx + s * 15.4, 3.4, cx + s * 16.6, 8.6, cx + s * 9.4, 16.5]);
      K.metal(fin, P.hull2, [cx - 17, 3, 34, 14], { spec: 0.6 });
      const wing = A.poly([cx + s * 12.5, 25.5, cx + s * 33, 29.6, cx + s * 38.8, 35.6, cx + s * 37.8, 45.4, cx + s * 33, 48.4, cx + s * 14, 52.4]);
      K.metal(wing, P.hull, [cx - 39, 25, 78, 28], { spec: 0.55 });
      K.grain(wing, 0.12);
      K.lines(seg([cx + s * 17, 38.4, cx + s * 36.6, 38]), 0.5);
      K.seam(seg([cx + s * 15, 49.6, cx + s * 32.6, 46]), 0.9);
      K.dot(cx + s * 37.6, 40.6, 1.2, P.glow, 4);
    }
    const fus = A.symPath(cx, [[0, 72.6], [6.5, 70], [11.6, 62], [15.2, 50], [16.2, 34], [14.8, 18], [11, 8], [6, 3.4], [0, 2.6]]);
    K.metal(fus, P.hull, [cx - 17, 2, 34, 71], { spec: 0.68, specPos: 0.3 });
    K.grain(fus, 0.14);
    K.shade(fus, cx + 9, 58, 18, 0.3);
    K.lines(seg([cx - 15, 30, cx + 15, 30]), 0.5);
    K.seam(seg([cx, 9, cx, 22]), 1);
    for (const s of [-1, 1]) {
      K.metal(rrect(cx + s * 7 - 3.2, 1.2, 6.4, 6.4, 1.6), P.steel, [cx + s * 7 - 3.4, 1, 7, 7], { spec: 0.85, edge: 0.5 });
      K.dot(cx + s * 7, 2.6, 1.7, P.engine, 6);
    }
    // four missile tubes with orange caps (inner pair on the spine, outer pair on the wings)
    for (let i = 0; i < 4; i++) {
      const x = cx + TUBES[i][0];
      const tube = rrect(x - 3.7, 22, 7.4, 26.5, 3.4);
      K.metal(tube, P.steel, [x - 4, 22, 8, 27], { spec: 0.85, edge: 0.6, rimLight: 1 });
      K.lines(seg([x - 3.7, 30, x + 3.7, 30]), 0.55);
      K.lines(seg([x - 3.7, 40, x + 3.7, 40]), 0.55);
      K.recess(ell(x, 47.2, 3.3, 2.5), [x - 3.3, 44.7, 6.6, 5]);
      K.lamp(ell(x, 47.6, 2.5, 1.8), '#ff8a3d', 7);
    }
    const nose = A.symPath(cx, [[0, 73.2], [6.2, 70.4], [11, 63], [12.6, 55], [6, 52.4], [0, 52]]);
    K.metal(nose, P.plate, [cx - 13, 52, 26, 22], { spec: 0.72, edge: 1 });
    K.lines(seg([cx - 11.6, 62, cx + 11.6, 62]), 0.6);
    K.rivets([cx - 9, 57, cx + 9, 57, cx - 6.5, 67, cx + 6.5, 67, cx, 55.4]);
    K.glass(ell(cx, 46.5, 3.6, 4.6), [cx - 3.6, 41.9, 7.2, 9.2]);
    K.dot(cx, 71, 1.1, P.glow, 5);
  }, { pad: 8, res: 2 });

  defineEnemy('hornet', {
    name: 'Hornet missile boat', cls: 'fighter', hp: 100, r: 30, speed: 160, score: 260, credits: [3, 5], dropChance: 0.1, dropTable: 'drop_fighter',
    explosion: 'm', face: 'down', bob: 1.6, engines: [[-7, -34.4, 6.5, 15], [7, -34.4, 6.5, 15]],
    circles: [[0, 3, 22], [-27, 3, 12], [27, 3, 12]],
    init(e, o) {
      const d = e.data;
      d.st = 'in';
      d.hoverY = num(o.hoverY, 230 + SL.rng.next() * 90);
      d.fire = 1.2 + d.slot * 0.35;
      d.capT = 0;
      d.pair = 0;
      d.t = 0;
      d.drift = SL.rng.sign() * 40;
    },
    enter(e) { e.vy = e.data.spd; },
    move(e, dt) {
      const d = e.data;
      if (d.st === 'in') {
        seek(e, e.x, d.hoverY, d.spd, 2.4);
        if (Math.abs(e.y - d.hoverY) < 6) { d.st = 'hover'; d.t = 0; }
      } else if (d.st === 'hover') {
        d.t += dt;
        if ((e.x < 90 && d.drift < 0) || (e.x > W - 90 && d.drift > 0)) d.drift = -d.drift;
        e.vx = U.approach(e.vx, d.drift, 70 * dt);
        e.vy = (d.hoverY - e.y) * 2;
        if (d.t >= 8 && d.capT <= 0) d.st = 'out';
      } else {
        e.vx *= 1 / (1 + 2 * dt);
        e.vy = U.approach(e.vy, -230, 220 * dt);
        if (e.y < -e.r - 30) leave(e);
      }
    },
    act(e, dt) {
      const d = e.data;
      if (d.capT > 0) {
        d.capT -= dt;
        if (d.capT <= 0 && pats()) {
          const a = d.pair ? 2 : 0;
          pats().homing_salvo(e, { count: 2 + plus(e), kick: 120, ox: [TUBES[a][0], TUBES[a + 1][0]], oy: TUBES[a][1] + 2 });
          d.pair ^= 1;
          d.kick = 0.25;
        }
        return;
      }
      if (d.kick > 0) d.kick -= dt;
      if (d.st === 'out' || !onScreen(e, -10)) return;
      if (ready(e, 'fire', 2.4, dt)) { if (canAim(e)) d.capT = 0.4; else d.fire = 0.2; }
    },
    over(e, ctx, F) {
      const d = e.data;
      if (d.capT > 0) {
        const k = 1 - d.capT / 0.4, blink = (F.t * 14) % 1 < 0.55 ? 1 : 0.45, a = d.pair ? 2 : 0;
        for (let i = a; i < a + 2; i++) {
          glowAt(ctx, F, TUBES[i][0], TUBES[i][1], 7 + 10 * k, '#ff8a3d', (0.4 + 0.6 * k) * blink);
          glowAt(ctx, F, TUBES[i][0], TUBES[i][1], 4, '#ffffff', 0.5 + 0.5 * k);
        }
      }
      if (d.kick > 0) {
        const a = d.pair ? 0 : 2;
        for (let i = a; i < a + 2; i++) glowAt(ctx, F, TUBES[i][0], TUBES[i][1] + 3, 16, '#ffd2a0', d.kick / 0.25);
      }
    },
  });

  // ================================================================== phantom: faceted black-glass stealth delta
  const PH_OUT = [[0, 63.4], [9, 48], [22, 31], [34.6, 14], [24, 6.4], [14, 12], [6, 3], [0, 8]];
  function phFacets(cx, s) {
    const X = (dx) => cx + s * dx;
    return [
      [[cx, 63.4], [X(9), 48], [cx, 44]],
      [[X(9), 48], [X(22), 31], [X(12), 30], [cx, 44]],
      [[X(22), 31], [X(34.6), 14], [X(24), 6.4], [X(12), 30]],
      [[X(12), 30], [X(24), 6.4], [X(14), 12], [X(7), 22]],
      [[cx, 44], [X(12), 30], [X(7), 22], [cx, 22]],
      [[cx, 22], [X(7), 22], [X(14), 12], [X(6), 3], [cx, 8]],
    ];
  }
  const PH_TONE_L = [0.62, 0.46, 0.55, 0.26, 0.36, 0.2], PH_TONE_R = [0.24, 0.15, 0.21, 0.07, 0.12, 0.05];
  art('phantom', 72, 64, (K) => {
    const cx = K.cx, P = K.P, c = K.ctx;
    const out = A.symPath(cx, PH_OUT);
    if (!K.glow) {
      for (const s of [-1, 1]) {
        const fs = phFacets(cx, s);
        for (let i = 0; i < fs.length; i++) {
          const pts = fs[i], path = A.poly(pts.flat());
          const tone = (s < 0 ? PH_TONE_L : PH_TONE_R)[i];
          const g = c.createLinearGradient(pts[0][0] - 10, pts[0][1] - 24, pts[1][0] + 10, pts[1][1] + 24);
          g.addColorStop(0, C.mix('#06050c', '#7a6fa8', Math.min(1, tone * 1.15)));
          g.addColorStop(1, C.mix('#06050c', '#4a4170', tone * 0.7));
          c.fillStyle = g;
          c.fill(path);
          c.strokeStyle = 'rgba(0,0,0,0.85)';
          c.lineWidth = 0.9;
          c.stroke(path);
          c.strokeStyle = 'rgba(178,107,255,0.22)';
          c.lineWidth = 0.5;
          c.stroke(path);
        }
      }
      // glossy reflections: a sharp streak across the lit (left) facets and a soft sky sheen
      c.save();
      c.clip(out);
      c.globalCompositeOperation = 'lighter';
      const st = c.createLinearGradient(cx - 26, 14, cx - 4, 40);
      st.addColorStop(0, 'rgba(200,190,255,0)');
      st.addColorStop(0.48, 'rgba(220,210,255,0.0)');
      st.addColorStop(0.52, 'rgba(235,228,255,0.62)');
      st.addColorStop(0.58, 'rgba(200,190,255,0)');
      st.addColorStop(1, 'rgba(200,190,255,0)');
      c.fillStyle = st;
      c.fillRect(0, 0, K.w, K.h);
      c.restore();
      K.sheen(out, cx - 14, 20, 26, 0.12);
      K.grain(out, 0.08);
      K.rivets([cx - 17, 25, cx + 17, 25], 0.6);
    }
    K.seam(out, 0.7, '#8a5cd0', 3);
    K.seam(seg([cx, 44, cx, 23]), 0.6, '#8a5cd0', 2);
    if (!K.glow) {
      // lit ridge highlights on the facet edges facing the key light
      c.save();
      c.strokeStyle = 'rgba(205,195,255,0.55)';
      c.lineWidth = 0.7;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(cx - 9, 48); c.lineTo(cx - 22, 31);
      c.moveTo(cx - 12, 30); c.lineTo(cx - 34.6, 14);
      c.moveTo(cx, 63.4); c.lineTo(cx - 9, 48);
      c.stroke();
      c.restore();
    }
    K.glass(A.poly([cx, 55.4, cx + 3.6, 48, cx, 43, cx - 3.6, 48]), [cx - 3.6, 43, 7.2, 12.4], VIOLET);
    K.dot(cx, 50, 0.9, P.glow, 4);
    for (const s of [-1, 1]) {
      K.recess(A.poly([cx + s * 6.6, 8.4, cx + s * 11.4, 7, cx + s * 11.4, 10.6, cx + s * 6.6, 11.6]), [cx - 12, 7, 24, 5]);
      K.dot(cx + s * 9, 9.2, 1.1, P.engine, 5);
      K.dot(cx + s * 33.6, 14.4, 0.9, VIOLET, 4);
    }
  }, { pad: 6, res: 2, noRim: false });
  // cloak shimmer: the outline with a bright band sweeping across it (8 frames)
  const PH_SH = [];
  for (let i = 0; i < 8; i++) {
    const key = 'en:phantom:sh' + i;
    PH_SH.push(key);
    A.define(key, 72, 64, (ctx, w, h) => {
      const out = A.symPath(w / 2, PH_OUT), u = i / 8;
      const g = ctx.createLinearGradient(-20, -10, w + 20, h + 10);
      const a = Math.max(0, u - 0.16), b = Math.min(1, u + 0.16);
      g.addColorStop(0, 'rgba(178,107,255,0.22)');
      g.addColorStop(a, 'rgba(178,107,255,0.22)');
      g.addColorStop(u, 'rgba(240,225,255,1)');
      g.addColorStop(b, 'rgba(178,107,255,0.22)');
      g.addColorStop(1, 'rgba(178,107,255,0.22)');
      ctx.lineJoin = 'round';
      ctx.shadowColor = VIOLET;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.stroke(out);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(w / 2, 44);
      ctx.lineTo(w / 2, 22);
      ctx.stroke();
    }, { pad: 6, res: 2 });
  }

  defineEnemy('phantom', {
    name: 'Phantom cloak jet', cls: 'fighter', hp: 100, r: 26, speed: 260, score: 350, credits: [4, 6], dropChance: 0.1, dropTable: 'drop_fighter',
    explosion: 'm', palette: 'violet', face: 'auto', bob: 1.2, engines: [[-9, -22.8, 4, 9], [9, -22.8, 4, 9]],
    circles: [[0, 2, 18], [-20, -12, 10], [20, -12, 10]],
    init(e, o) {
      const d = e.data;
      d.st = 'move';
      d.ck = 1;
      d.cloak = true;
      d.goal = false;
      d.t = 0;
      d.cyc = 0;
      d.chg = null;
      e.alpha = 0.12;
      if (o.specimen) { d.ck = 0; d.cloak = false; e.alpha = 1; }
    },
    enter(e) { e.vy = e.data.spd * 0.7; },
    move(e, dt) {
      const d = e.data;
      if (d.st === 'move') {
        if (!d.goal) {
          const t = aimAt(e);
          d.gx = U.clamp(t.x + SL.rng.range(-70, 70), 70, W - 70);
          d.gy = 200 + SL.rng.next() * 200;
          d.goal = true;
          d.t = 0;
        }
        d.t += dt;
        seek(e, d.gx, d.gy, d.spd, 2.2);
        if ((U.dist(e.x, e.y, d.gx, d.gy) < 16 && d.t > 0.6) || d.t > 4.5) {
          d.st = 'decloak';
          d.t = 0;
          sfx('phantom_decloak', e.x);
          d.chg = charge(e, 0, 18, 0.4, VIOLET, 18);
        }
      } else if (d.st === 'leave') {
        e.vx = U.approach(e.vx, 0, 200 * dt);
        e.vy = U.approach(e.vy, -330, 320 * dt);
        if (e.y < -60) leave(e);
      } else {
        const k = 1 / (1 + 4 * dt);
        e.vx *= k;
        e.vy *= k;
      }
    },
    act(e, dt) {
      const d = e.data;
      if (d.st === 'decloak') {
        d.t += dt;
        d.ck = Math.max(0, 1 - d.t / 0.4);
        // sparkle telegraph around the hull
        if (Math.random() < dt * 40) {
          const a = Math.random() * TAU, rr = 10 + Math.random() * 26;
          SL.fx.emit({ x: e.x + Math.cos(a) * rr, y: e.y + Math.sin(a) * rr * 0.8, vx: 0, vy: -20, life: 0.35, size: 9, size2: 1,
            color: Math.random() < 0.5 ? '#ffffff' : VIOLET, shape: 'spark', stretch: 1 });
        }
        if (d.t >= 0.4) {
          d.st = 'shown';
          d.t = 0;
          d.cloak = false;
          d.ck = 0;
          if (pats() && canAim(e)) pats().fan(e, 'aim', { count: 5 + plus(e), speed: 300, spread: 0.5, type: 'needle', oy: 18 });
          SL.fx.emit({ x: e.x, y: e.y + 18, life: 0.18, size: 40, size2: 8, color: '#e6d4ff' });
        }
      } else if (d.st === 'shown') {
        d.t += dt;
        if (d.t >= 1.4) { d.st = 'recloak'; d.t = 0; }
      } else if (d.st === 'recloak') {
        d.t += dt;
        d.ck = Math.min(1, d.t / 0.3);
        if (d.ck >= 0.5) d.cloak = true;
        if (d.t >= 0.3) {
          d.cyc++;
          d.goal = false;
          d.t = 0;
          d.st = d.cyc >= 3 ? 'leave' : 'move';
        }
      }
      e.alpha = 0.12 + 0.88 * (1 - d.ck);
    },
    over(e, ctx, F) {
      const d = e.data;
      if (d.ck <= 0.02) return;
      const fr = A.get(PH_SH[Math.floor(F.t * 9 + d.ph * 3) % 8]);
      blit(ctx, fr, F.x, F.y, F.rot, F.sx, F.sy, d.ck * (0.55 + 0.25 * Math.sin(F.t * 7 + d.ph)), true);
    },
  });

  // ================================================================== warper: blink jet (torus ring-wing)
  art('warper_ring', 76, 76, (K) => {
    const cx = K.cx, cy = K.cy, P = K.P, c = K.ctx;
    const ann = new Path2D();
    ann.arc(cx, cy, 36.5, 0, TAU, false);
    ann.moveTo(cx + 25, cy);
    ann.arc(cx, cy, 25, TAU, 0, true);
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + i * HALF;
      const st = rotPoly(cx, cy, a, [[10, -2.4], [26, -3], [26, 3], [10, 2.4]]);
      K.metal(st, P.steel, null, { spec: 0.8, edge: 0.6, rimLight: 1 });
      K.seam(rotPoly(cx, cy, a, [[13, 0], [24, 0]], true), 0.6, VIOLET, 4);
    }
    K.metal(ann, P.hull, null, { spec: 0.6 });
    if (!K.glow) {
      // tube shading: dark inner and outer edges, a lit crest along the middle
      c.save();
      c.clip(ann);
      const g = c.createRadialGradient(cx, cy, 25, cx, cy, 36.5);
      g.addColorStop(0, 'rgba(0,0,0,0.6)');
      g.addColorStop(0.42, 'rgba(0,0,0,0)');
      g.addColorStop(0.62, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.65)');
      c.fillStyle = g;
      c.fillRect(0, 0, K.w, K.h);
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(220,228,255,0.42)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cy, 31.2, PI * 0.95, PI * 1.62);
      c.stroke();
      c.strokeStyle = 'rgba(220,228,255,0.12)';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(cx, cy, 31.2, PI * 0.75, PI * 1.85);
      c.stroke();
      c.restore();
      K.grain(ann, 0.12);
    }
    for (let i = 0; i < 6; i++) {
      const a = i * PI / 3;
      K.lines(rotPoly(cx, cy, a + PI / 6, [[25.4, 0], [36.2, 0]], true), 0.55);
      const node = rotPoly(cx, cy, a, [[27, -3.4], [35.4, -3], [35.4, 3], [27, 3.4]]);
      K.metal(node, P.hull2, null, { spec: 0.8, edge: 0.6, rimLight: 1 });
      K.dot(cx + Math.cos(a) * 31.4, cy + Math.sin(a) * 31.4, 1.4, VIOLET, 6);
    }
    for (let i = 0; i < 6; i++) {
      const a0 = i * PI / 3 + 0.2, a1 = a0 + PI / 3 - 0.4, p = new Path2D();
      p.arc(cx, cy, 26.6, a0, a1);
      K.seam(p, 0.8, P.seam, 5);
    }
  }, { pad: 6, res: 2 });
  art('warper', 76, 76, (K) => {
    const cx = K.cx, cy = K.cy, P = K.P;
    K.metal(rrect(cx - 4, cy - 17, 8, 8, 2), P.steel, [cx - 4, cy - 17, 8, 8], { spec: 0.8, edge: 0.5 });
    K.dot(cx, cy - 15.6, 1.6, P.engine, 6);
    const pod = K.sphere(cx, cy, 12.4, '#2c3146', 0.65);
    K.lines(ell(cx, cy + 1, 12, 4.2), 0.4);
    K.recess(circ(cx, cy + 1.5, 6.6), [cx - 6.6, cy - 5, 13.2, 13.2]);
    K.lamp(circ(cx, cy + 1.5, 4.8), VIOLET, 12);
    K.lamp(circ(cx, cy + 1.5, 2), '#efe0ff', 6);
    K.seam(seg([cx - 9.6, cy + 6.8, cx - 4, cy + 10.6, cx + 4, cy + 10.6, cx + 9.6, cy + 6.8]), 0.9);
    K.shade(pod, cx + 6, cy + 8, 10, 0.3);
    K.glint(cx - 4.6, cy - 5.6, 2.2, 0.8);
  }, { pad: 6, res: 2 });

  defineEnemy('warper', {
    name: 'Warper blink jet', cls: 'fighter', hp: 95, r: 26, speed: 220, score: 380, credits: [4, 6], dropChance: 0.1, dropTable: 'drop_fighter',
    explosion: 'm', palette: 'violet', face: 'none', bob: 1.2, engines: [[0, -16, 5, 11]],
    init(e, o) {
      const d = e.data;
      d.st = 'in';
      d.blinks = 0;
      d.t = 0;
      d.k = 1;
      d.spin = Math.random() * TAU;
      d.inY = num(o.hoverY, 170 + SL.rng.next() * 130);
      d.ring = skin(e, 'warper_ring');
      d.mark = null;
      d.lastX = e.x;
      d.lastY = e.y;
    },
    enter(e) { e.vy = e.data.spd; },
    move(e, dt) {
      const d = e.data;
      d.spin += dt * (0.7 + 4 * (1 - d.k));
      if (d.st === 'in') {
        seek(e, e.x, d.inY, d.spd, 2.4);
        if (Math.abs(e.y - d.inY) < 8) { d.st = 'wait'; d.t = 0.5; }
      } else if (d.st === 'wait') {
        d.t += dt;
        e.vx *= 1 / (1 + 3 * dt);
        e.vy = Math.sin(e.age * 2 + d.ph) * 10;
        if (d.t >= 0.84) warperPlan(e);
      } else if (d.st === 'mark') {
        d.t += dt;
        e.vx = e.vy = 0;
        if (d.t >= 0.5) { d.st = 'collapse'; d.t = 0; d.ghost = true; sfx('warper_blink', e.x); }
      } else if (d.st === 'collapse') {
        d.t += dt;
        e.vx = e.vy = 0;
        d.k = Math.max(0, 1 - d.t / 0.12);
        if (d.t >= 0.12) {
          SL.fx.emit({ x: e.x, y: e.y, life: 0.3, size: 34, size2: 4, color: VIOLET, alpha: 0.9 });
          e.x = d.tx;
          e.y = d.ty;
          d.st = 'expand';
          d.t = 0;
          SL.fx.emit({ x: e.x, y: e.y, life: 0.25, size: 8, size2: 70, color: '#e8d8ff', alpha: 0.9 });
        }
      } else if (d.st === 'expand') {
        d.t += dt;
        e.vx = e.vy = 0;
        d.k = Math.min(1, d.t / 0.14);
        if (d.t >= 0.14) warperArrive(e);
      } else if (d.st === 'portal') {
        const P = d.portal;
        d.t += dt;
        if (Math.hypot(e.x - d.lastX, e.y - d.lastY) > 110) warperArrive(e);
        else if (!P || d.t > 3) { d.st = 'wait'; d.t = 0; }
        else seek(e, P.x, P.y, 320, 3.2);
      } else {
        e.vx = U.approach(e.vx, 0, 200 * dt);
        e.vy = U.approach(e.vy, -300, 300 * dt);
        if (e.y < -60) leave(e);
      }
      d.lastX = e.x;
      d.lastY = e.y;
      d.thrust = d.k;
    },
    body(e, ctx, F) {
      const d = e.data, k = d.k, t = F.t;
      if (k > 0.02) {
        const pulse = pulseK(e);
        blit(ctx, d.ring.b, F.x, F.y, d.spin, F.sx * k, F.sy * k, F.a, false);
        blit(ctx, d.ring.g, F.x, F.y, d.spin, F.sx * k, F.sy * k, F.a * pulse, true);
        blit(ctx, d.skin.b, F.x, F.y, 0, F.sx * k, F.sy * k, F.a, false);
        blit(ctx, d.skin.g, F.x, F.y, 0, F.sx * k, F.sy * k, F.a * (0.6 + 0.4 * pulse), true);
        if (e.flash > 0) blit(ctx, A.getFlash(d.ring.b), F.x, F.y, d.spin, F.sx * k, F.sy * k, Math.min(1, e.flash / 0.06) * 0.5, false);
        A.drawGlow(ctx, F.x, F.y + 1.5 * k, 16 + 4 * Math.sin(t * 5 + d.ph), VIOLET, 0.35 * F.a * k);
      }
      if (k < 1) {
        const p = 1 - k;
        A.drawGlow(ctx, F.x, F.y, 10 + 36 * p, VIOLET, p * F.a);
        A.drawGlow(ctx, F.x, F.y, 4 + 14 * p, '#ffffff', p * F.a);
      }
    },
  });
  function warperPlan(e) {
    const d = e.data;
    if (d.blinks >= 4) { d.st = 'out'; return; }
    // a wormhole end within 200 px: fly through it instead of blinking
    const ports = SL.hazards && SL.hazards.portals ? SL.hazards.portals() : null;
    if (ports) {
      for (let i = 0; i < ports.length; i++) {
        const P = ports[i];
        if (!P.open) continue;
        const ends = [P.a, P.b];
        for (let j = 0; j < 2; j++) {
          if (U.dist(e.x, e.y, ends[j].x, ends[j].y) < 200) { d.st = 'portal'; d.portal = ends[j]; d.t = 0; return; }
        }
      }
    }
    const tg = aimAt(e);
    let tx = e.x, ty = e.y;
    for (let i = 0; i < 12; i++) {
      tx = 80 + SL.rng.next() * (W - 160);
      ty = 130 + SL.rng.next() * 400;
      if (U.dist(tx, ty, e.x, e.y) > 180 && U.dist(tx, ty, tg.x, tg.y) > 300) break;
    }
    d.tx = tx;
    d.ty = ty;
    d.st = 'mark';
    d.t = 0;
    const P = pats();
    if (P && P.warn) {
      d.mark = P.warn(null, { fx: 'ring', x: tx, y: ty, r: 30, color: VIOLET, life: 0.78 });
      P.warn(null, { fx: 'charge', x: tx, y: ty, r: 18, color: VIOLET, life: 0.62 });
    }
  }
  function warperArrive(e) {
    const d = e.data;
    d.k = 1;
    d.ghost = false;
    d.blinks++;
    d.st = 'wait';
    d.t = 0;
    if (pats() && onScreen(e, -10)) pats().ring(e, { count: 10 + plus(e), speed: 140, type: 'orb', color: EB.violet, offset: SL.rng.next() * TAU, fr: 1 });
    SL.fx.sparks(e.x, e.y, { count: 10, color: '#e0ccff', speed: 300, life: 0.3 });
  }

  // ================================================================== gunships
  // ---- manta: wide back-swept wings, raised spine, two horns, three plumes; wings ripple (spec.ripple)
  const MANTA_OUT = [[0, 91], [7, 89], [13, 86], [24, 80.5], [38, 71], [51, 57], [60, 40], [66, 22], [69.6, 4.6], [62, 9.4], [52, 15.4],
    [40, 20], [28, 22.2], [18, 19.4], [11, 12.4], [6.4, 5], [3, 1.2], [0, 0.8]];
  const HORN_X = 14, HORN_Y = 47;
  art('manta', 140, 100, (K) => {
    const cx = K.cx, P = K.P;
    const out = A.symPath(cx, MANTA_OUT);
    K.metal(out, P.hull, [0, 0, 140, 92], { spec: 0.5, specPos: 0.34 });
    K.grain(out, 0.13);
    K.shade(out, cx + 40, 46, 46, 0.32);
    for (const s of [-1, 1]) {
      const inner = A.poly([cx + s * 12, 82, cx + s * 27, 74.5, cx + s * 39, 59, cx + s * 44, 38, cx + s * 37, 26, cx + s * 21, 23.5, cx + s * 12, 30]);
      K.metal(inner, P.hull2, [cx - 45, 22, 90, 62], { spec: 0.62, edge: 0.8, rimLight: 1.1 });
      K.grain(inner, 0.1);
      K.lines(seg([cx + s * 16, 77.5, cx + s * 33, 68, cx + s * 46.5, 52, cx + s * 56.5, 32, cx + s * 61.5, 15]), 0.5);
      K.lines(seg([cx + s * 44, 38, cx + s * 58, 22]), 0.45);
      K.lines(seg([cx + s * 38, 60, cx + s * 52, 50]), 0.45);
      K.seam(seg([cx + s * 20, 80.4, cx + s * 35, 71.6, cx + s * 48.4, 56.6, cx + s * 57.4, 38.6, cx + s * 63.2, 20.4]), 1);
      K.seam(seg([cx + s * 40, 20, cx + s * 54, 13.4, cx + s * 63, 8.6]), 0.8);
      for (let i = 0; i < 4; i++) K.seam(seg([cx + s * 16.5, 45 + i * 6.6, cx + s * 23.5, 43.4 + i * 6.6]), 1.3, P.glow, 7);
      K.dot(cx + s * 68.4, 6.4, 1.3, P.glow, 5);
      const horn = A.poly([cx + s * 8, 84.5, cx + s * 15.5, 82.8, cx + s * 18.2, 90, cx + s * HORN_X, 99.4, cx + s * 11, 92.4]);
      K.metal(horn, P.hull2, [cx + s * 13 - 6, 82, 12, 18], { spec: 0.8, edge: 0.7, rimLight: 1 });
      K.dot(cx + s * HORN_X, 97, 1.5, P.glow, 6);
      K.metal(rrect(cx + s * 18 - 4, 13.4, 8, 8, 2), P.steel, [cx + s * 18 - 4, 13, 8, 9], { spec: 0.85, edge: 0.5 });
      K.dot(cx + s * 18, 15.4, 1.8, P.engine, 6);
      K.dot(cx + s * 7, 85.6, 1.6, P.glow, 7);
    }
    const spine = A.symPath(cx, [[0, 91.5], [8, 87.4], [12.6, 74], [13.6, 52], [11.6, 30], [8, 12], [4.4, 4], [0, 2]]);
    K.metal(spine, P.hull2, [cx - 14, 2, 28, 90], { spec: 0.78, specPos: 0.26, edge: 0.9 });
    K.grain(spine, 0.1);
    K.lines(seg([cx - 12.4, 62, cx + 12.4, 62]), 0.55);
    K.lines(seg([cx - 13, 40, cx + 13, 40]), 0.55);
    K.lines(seg([cx - 9.6, 20, cx + 9.6, 20]), 0.5);
    K.seam(seg([cx, 86.5, cx, 9]), 1.4);
    K.metal(rrect(cx - 4.6, 0.6, 9.2, 8, 2.4), P.steel, [cx - 5, 0.4, 10, 8.4], { spec: 0.85, edge: 0.5 });
    K.dot(cx, 2.6, 2.2, P.engine, 7);
    K.glass(ell(cx, 80.5, 4.2, 5.6), [cx - 4.2, 74.9, 8.4, 11.2]);
  }, { pad: 8, res: 2 });

  defineEnemy('manta', {
    name: 'Manta gunship', cls: 'gunship', hp: 320, r: 48, speed: 120, score: 900, credits: [10, 14], dropChance: 0.3, dropTable: 'drop_gunship',
    explosion: 'l', face: 'down', bob: 2, ripple: 0.02,
    engines: [[0, -47.4, 8.5, 24], [-18, -34.6, 6.5, 17], [18, -34.6, 6.5, 17]],
    circles: [[0, 12, 32], [-42, -18, 22], [42, -18, 22]],
    init(e, o) {
      const d = e.data;
      d.st = 'in';
      d.hoverY = num(o.hoverY, 260);
      d.stay = num(o.stay, 14);
      d.ring = 1.0;
      d.fan = 2.2;
      d.chg = 0;
      d.fchg = 0;
      d.horn = 1;
      d.t = 0;
    },
    enter(e) { e.vy = e.data.spd; },
    move(e, dt) {
      const d = e.data;
      if (d.st === 'in') {
        seek(e, e.x, d.hoverY, d.spd, 2);
        if (Math.abs(e.y - d.hoverY) < 6) { d.st = 'glide'; d.t = 0; d.x0 = U.clamp(e.x, 180, W - 180); }
      } else if (d.st === 'glide') {
        d.t += dt;
        seek(e, d.x0 + 160 * Math.sin(d.t * TAU * 0.1), d.hoverY + 8 * Math.sin(d.t * 1.3), d.spd * 1.4, 2.2);
        if (d.t >= 10 || (d.stay > 0 && e.age >= d.stay)) { d.st = 'out'; d.ex = e.x < W / 2 ? -1 : 1; }
      } else {
        e.vx = U.approach(e.vx, d.ex * 90, 80 * dt);
        e.vy = U.approach(e.vy, -170, 120 * dt);
        if (e.y < -e.r - 40) leave(e);
      }
    },
    act(e, dt) {
      const d = e.data;
      if (d.chg > 0) {
        d.chg -= dt;
        if (d.chg <= 0 && pats()) pats().ring_stagger(e, { count: 12 + plus(e), speed: 150, type: 'orb', state: d, oy: 14 });
      } else if (d.st !== 'out' && onScreen(e, -20) && ready(e, 'ring', 2.2, dt)) {
        d.chg = 0.45;
        charge(e, 0, 14, 0.45, PAL.glow, 26);
      }
      if (d.tier < 2) return;
      if (d.fchg > 0) {
        d.fchg -= dt;
        if (d.fchg <= 0 && pats()) pats().fan(e, 'aim', { count: 5 + plus(e), speed: 200, spread: 0.6, type: 'orb', ox: d.horn * HORN_X, oy: HORN_Y });
      } else if (d.st !== 'out' && onScreen(e, -20) && ready(e, 'fan', 3.3, dt)) {
        if (canAim(e)) {
          d.horn = -d.horn;
          d.fchg = 0.4;
          charge(e, d.horn * HORN_X, HORN_Y, 0.4, PAL.glow, 14);
        } else d.fan = 0.25;
      }
    },
  });

  // ---- weaver: disc with three rotating spokes ending in emitter pods, central eye dome
  const SPOKE_R = 46;
  art('weaver', 110, 110, (K) => {
    const cx = K.cx, cy = K.cy, P = K.P, c = K.ctx;
    for (const s of [-1, 1]) {
      const a = -HALF + s * 0.39, hx = cx + Math.cos(a) * 39, hy = cy + Math.sin(a) * 39;
      K.metal(rotPoly(hx, hy, a + HALF, [[-6, -5], [6, -5], [5, 4], [-5, 4]]), P.steel, [hx - 7, hy - 7, 14, 14], { spec: 0.85, edge: 0.6 });
      K.dot(hx, hy - 3, 1.8, P.engine, 6);
    }
    const disc = circ(cx, cy, 41);
    K.metal(disc, P.hull, [cx - 41, cy - 41, 82, 82], { spec: 0.55, specPos: 0.3 });
    K.grain(disc, 0.13);
    K.shade(disc, cx + 18, cy + 20, 44, 0.42);
    K.sheen(disc, cx - 16, cy - 18, 28, 0.2);
    for (let i = 0; i < 6; i++) {
      const a0 = i * PI / 3 + 0.12, a1 = a0 + PI / 3 - 0.24;
      const pl = new Path2D();
      pl.arc(cx, cy, 41, a0, a1);
      pl.arc(cx, cy, 33.5, a1, a0, true);
      pl.closePath();
      K.metal(pl, P.hull2, [cx - 41, cy - 41, 82, 82], { spec: 0.66, edge: 0.7, rimLight: 1 });
      const sm = new Path2D();
      sm.arc(cx, cy, 37.2, a0 + 0.08, a1 - 0.08);
      K.seam(sm, 0.9);
    }
    K.lines(circ(cx, cy, 33), 0.55);
    K.lines(circ(cx, cy, 23), 0.5);
    for (let i = 0; i < 12; i++) {
      const a = i * PI / 6 + PI / 12;
      K.lines(seg([cx + Math.cos(a) * 23.5, cy + Math.sin(a) * 23.5, cx + Math.cos(a) * 32.5, cy + Math.sin(a) * 32.5]), 0.45);
    }
    for (let i = 0; i < 3; i++) {
      const a = PI / 6 + i * TAU / 3, vx = cx + Math.cos(a) * 28, vy = cy + Math.sin(a) * 28;
      K.recess(rotPoly(vx, vy, a, [[-3.5, -2], [3.5, -2], [3.5, 2], [-3.5, 2]]), [vx - 4, vy - 4, 8, 8]);
      K.dot(vx, vy, 1, P.glow, 5);
    }
    if (!K.glow) {
      c.save();
      c.strokeStyle = 'rgba(0,0,0,0.8)';
      c.lineWidth = 1.2;
      c.stroke(disc);
      c.restore();
    }
  }, { pad: 8, res: 2 });
  art('weaver_spokes', 110, 110, (K) => {
    const cx = K.cx, cy = K.cy, P = K.P;
    const hub = new Path2D();
    hub.arc(cx, cy, 17, 0, TAU, false);
    hub.moveTo(cx + 12.5, cy);
    hub.arc(cx, cy, 12.5, TAU, 0, true);
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3;
      const arm = rotPoly(cx, cy, a, [[13, -4.6], [30, -3.4], [40, -2.6], [41, 0], [40, 2.6], [30, 3.4], [13, 4.6]]);
      K.metal(arm, P.steel, null, { spec: 0.85, edge: 0.6, rimLight: 1.1 });
      K.lines(rotPoly(cx, cy, a, [[24, -3.8], [24, 3.8]], true), 0.55);
      K.seam(rotPoly(cx, cy, a, [[17, 0], [38, 0]], true), 0.8);
      const px = cx + Math.cos(a) * SPOKE_R, py = cy + Math.sin(a) * SPOKE_R;
      K.metal(rotPoly(px, py, a, [[-9, -4.4], [-4, -6.6], [-4, 6.6], [-9, 4.4]]), P.hull2, [px - 9, py - 9, 18, 18], { spec: 0.7, edge: 0.6 });
      K.sphere(px, py, 6.6, '#30364c', 0.7);
      K.lamp(circ(px + Math.cos(a) * 3.6, py + Math.sin(a) * 3.6, 2.4), P.glow, 9);
    }
    K.metal(hub, P.hull2, [cx - 17, cy - 17, 34, 34], { spec: 0.8, edge: 0.6, rimLight: 1 });
  }, { pad: 8, res: 2 });
  art('weaver_eye', 34, 34, (K) => {
    const cx = K.cx, cy = K.cy, P = K.P;
    const dome = circ(cx, cy, 12.4);
    K.glass(dome, [cx - 12.4, cy - 12.4, 24.8, 24.8], P.glow);
    K.lamp(circ(cx, cy + 1, 6.2), P.glow, 12);
    K.lamp(ell(cx, cy + 1, 1.6, 4.4), '#fff0f5', 5);
    K.glint(cx - 4.4, cy - 5, 2.6, 0.9);
  }, { pad: 6, res: 3 });

  defineEnemy('weaver', {
    name: 'Weaver spiral gunship', cls: 'gunship', hp: 380, r: 46, speed: 140, score: 1000, credits: [12, 16], dropChance: 0.3, dropTable: 'drop_gunship',
    explosion: 'l', face: 'none', bob: 2, engines: [[-15.2, -40.4, 6, 15], [15.2, -40.4, 6, 15]],
    init(e, o) {
      const d = e.data;
      d.st = 'in';
      d.hoverY = num(o.hoverY, 300);
      d.stay = num(o.stay, 12);
      d.spin = Math.random() * TAU;
      d.em = null;
      d.em2 = null;
      d.t = 0;
      d.spokes = skin(e, 'weaver_spokes');
      d.eye = skin(e, 'weaver_eye');
    },
    enter(e) { e.vy = e.data.spd; },
    move(e, dt) {
      const d = e.data;
      if (d.st === 'in') {
        seek(e, e.x, d.hoverY, d.spd, 2);
        if (Math.abs(e.y - d.hoverY) < 6) { d.st = 'hover'; d.t = 0; d.x0 = U.clamp(e.x, 120, W - 120); }
      } else if (d.st === 'hover') {
        d.t += dt;
        seek(e, d.x0 + 40 * Math.sin(d.t * 0.5), d.hoverY + 10 * Math.sin(d.t * 0.8), 80, 2);
        if (d.t >= d.stay) {
          d.st = 'out';
          if (d.em) d.em.stop();
          if (d.em2) d.em2.stop();
        }
      } else {
        e.vx *= 1 / (1 + dt);
        e.vy = U.approach(e.vy, -170, 120 * dt);
        if (e.y < -e.r - 40) leave(e);
      }
    },
    act(e, dt) {
      const d = e.data;
      if (d.st === 'hover' && !d.em && pats()) {
        d.em = own(e, pats().spiral(e, { arms: 3, rate: 1 / 0.11, speed: 170, spin: 1.4, on: 2.0, off: 1.2, radius: SPOKE_R, offset: d.spin, duration: Infinity, chargeR: 24 }));
        if (e.elite) d.em2 = own(e, pats().spiral(e, { arms: 3, rate: 1 / 0.11, speed: 150, spin: 1.4, dir: -1, type: 'petal', on: 2.0, off: 1.2, radius: 22, offset: -d.spin, duration: Infinity, chargeFx: false }));
      }
      if (d.em && !d.em.done && d.em.d && d.em.d.ang != null) d.spin = d.em.d.ang;
      else d.spin += 1.4 * dt;
    },
    body(e, ctx, F) {
      const d = e.data, k = pulseK(e);
      drawSkin(ctx, d.skin, F, F.x, F.y, 0, k);
      const on = d.em && !d.em.done && d.em.phase === 'on' ? 1 : 0;
      drawSkin(ctx, d.spokes, F, F.x, F.y, d.spin, 0.5 + 0.5 * k + on * 0.4);
      drawSkin(ctx, d.eye, F, F.x, F.y, 0, 0.7 + 0.3 * k);
      if (e.flash > 0) blit(ctx, A.getFlash(d.spokes.b), F.x, F.y, d.spin, F.sx, F.sy, Math.min(1, e.flash / 0.06) * 0.5, false);
      if (on) {
        for (let i = 0; i < 3; i++) {
          const a = d.spin + i * TAU / 3;
          A.drawGlow(ctx, F.x + Math.cos(a) * (SPOKE_R + 4) * F.sx, F.y + Math.sin(a) * (SPOKE_R + 4) * F.sy, 13, EB.pink, 0.75 * F.a);
        }
      }
    },
  });

  // ---- stormcaller: two tesla-coil towers crawling with sparks; pair arc between two stormcallers
  const COIL_X = 43, COIL_TOP = -34, COIL_RINGS = [[-2, 12], [-12, 11], [-21, 10], [-30, 9]];
  art('stormcaller', 120, 90, (K) => {
    const cx = K.cx, P = K.P, c = K.ctx;
    for (const s of [-1, 1]) {
      const strut = A.poly([cx + s * 24, 40, cx + s * 38, 37.5, cx + s * 40, 57, cx + s * 23, 62]);
      K.metal(strut, P.hull2, [cx - 40, 37, 80, 26], { spec: 0.6 });
      K.lines(seg([cx + s * 27, 49, cx + s * 37, 48]), 0.5);
    }
    const hull = A.symPath(cx, [[0, 89.2], [7, 86.4], [16, 77], [24, 64], [30, 50], [32.4, 38], [29.4, 24], [22, 12], [12, 5], [0, 3.6]]);
    K.metal(hull, P.hull, [cx - 33, 3, 66, 87], { spec: 0.6, specPos: 0.3 });
    K.grain(hull, 0.14);
    K.shade(hull, cx + 18, 66, 26, 0.3);
    const plate = A.symPath(cx, [[0, 76], [10, 70], [17, 56], [19.4, 40], [16, 24], [9, 13], [0, 10.4]]);
    K.metal(plate, P.hull2, [cx - 20, 10, 40, 66], { spec: 0.75, edge: 0.8, rimLight: 1.1 });
    K.lines(seg([cx - 18.4, 44, cx + 18.4, 44]), 0.55);
    K.lines(seg([cx - 15, 26, cx + 15, 26]), 0.5);
    K.seam(seg([cx - 13, 56, cx, 64, cx + 13, 56]), 1.1);
    K.seam(seg([cx - 11, 33, cx, 38, cx + 11, 33]), 0.9);
    K.seam(seg([cx, 14, cx, 30]), 0.9);
    K.glass(ell(cx, 49, 4.4, 6), [cx - 4.4, 43, 8.8, 12]);
    K.recess(rrect(cx - 6.5, 77.4, 13, 7.4, 3.2), [cx - 6.5, 77.4, 13, 7.4]);
    K.lamp(ell(cx, 81.2, 4.6, 2.3), VIOLET, 10);
    K.dot(cx - 20, 72, 1.2, P.glow, 5);
    K.dot(cx + 20, 72, 1.2, P.glow, 5);
    for (const t of [[0, 1.4, 4.8], [-12, 4.2, 3.8], [12, 4.2, 3.8]]) {
      K.metal(rrect(cx + t[0] - t[2], t[1] - 1, t[2] * 2, 7, 2), P.steel, [cx + t[0] - t[2], t[1] - 1, t[2] * 2, 7], { spec: 0.85, edge: 0.5 });
      K.dot(cx + t[0], t[1] + 1, t[2] * 0.42, P.engine, 6);
    }
    for (const s of [-1, 1]) {
      const px = cx + s * COIL_X, py = 50;
      const pod = ell(px, py, 13, 16);
      K.metal(pod, P.hull2, [px - 13, py - 16, 26, 32], { spec: 0.66 });
      K.grain(pod, 0.12);
      K.lines(seg([px - 12.6, py + 4, px + 12.6, py + 4]), 0.55);
      K.seam(seg([px - 8, py + 11, px, py + 14.4, px + 8, py + 11]), 0.9);
      K.metal(rrect(px - 2.3, 10, 4.6, 40, 2), P.steel, [px - 3, 10, 6, 40], { spec: 0.9, edge: 0.5, rimLight: 0.8 });
      for (const rg of COIL_RINGS) {
        const ry = py + rg[0], rx = rg[1];
        if (!K.glow) {
          const g = c.createLinearGradient(px - rx, 0, px + rx, 0);
          g.addColorStop(0, '#9aa3c4');
          g.addColorStop(0.35, '#566082');
          g.addColorStop(1, '#141724');
          c.strokeStyle = 'rgba(0,0,0,0.85)';
          c.lineWidth = 4.6;
          c.beginPath();
          c.ellipse(px, ry, rx, 3.3, 0, 0, TAU);
          c.stroke();
          c.strokeStyle = g;
          c.lineWidth = 3;
          c.stroke();
          c.strokeStyle = 'rgba(235,240,255,0.55)';
          c.lineWidth = 0.8;
          c.beginPath();
          c.ellipse(px, ry - 0.9, rx - 0.5, 2.6, 0, PI * 1.05, PI * 1.6);
          c.stroke();
        } else {
          const p = new Path2D();
          p.ellipse(px, ry, rx, 3.3, 0, 0, PI);
          A.emissive(c, p, '#c9b4ff', 5, { stroke: 0.7 });
        }
      }
      K.sphere(px, 11, 6, '#3a4058', 0.75);
      K.lamp(circ(px, 11.6, 2.6), '#e2d4ff', 9);
    }
  }, { pad: 8, res: 2 });

  function bolt(ctx, x0, y0, x1, y1, n, jag) {
    ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i++) {
      const u = i / n;
      ctx.lineTo(x0 + (x1 - x0) * u + (Math.random() - 0.5) * jag, y0 + (y1 - y0) * u + (Math.random() - 0.5) * jag);
    }
    ctx.lineTo(x1, y1);
  }
  function coilWorld(e, s, out) {
    out.x = e.x + s * COIL_X;
    out.y = e.y + COIL_TOP;
    return out;
  }
  const CA = { x: 0, y: 0 }, CB = { x: 0, y: 0 };
  function arcPartner(e) {
    const en = SL.world.enemies;
    let best = null, bd = 520 * 520;
    for (let i = 0; i < en.length; i++) {
      const o = en[i];
      if (o === e || o.dead || o.dying || o.typeId !== 'stormcaller' || o.id < e.id || !o.data || o.data.specimen || o.data.arc) continue;
      if (!onScreen(o, -10)) continue;
      const dd = U.dist2(o.x, o.y, e.x, e.y);
      if (dd < bd) { bd = dd; best = o; }
    }
    return best;
  }
  function arcGeom(e, p, bm) {
    const se = p.x >= e.x ? 1 : -1;
    coilWorld(e, se, CA);
    coilWorld(p, -se, CB);
    bm.ox = se * COIL_X;
    bm.oy = COIL_TOP;
    bm.x = CA.x;
    bm.y = CA.y;
    bm.angle = Math.atan2(CB.y - CA.y, CB.x - CA.x);
    bm.length = Math.max(4, Math.hypot(CB.x - CA.x, CB.y - CA.y));
  }
  defineEnemy('stormcaller', {
    name: 'Stormcaller', cls: 'gunship', hp: 420, r: 44, speed: 120, score: 1100, credits: [12, 18], dropChance: 0.3, dropTable: 'drop_gunship',
    explosion: 'l', palette: 'blue', face: 'down', bob: 2, ionImmune: true,
    engines: [[0, -42, 7, 18], [-12, -39.4, 5.5, 13], [12, -39.4, 5.5, 13]],
    circles: [[0, 6, 30], [-42, 2, 15], [42, 2, 15]],
    init(e, o) {
      const d = e.data;
      d.st = 'in';
      d.hoverY = num(o.hoverY, 230 + SL.rng.next() * 110);
      d.stay = num(o.stay, 20);
      d.fire = 1.3;
      d.link = 1.8 + SL.rng.next();
      d.chg = 0;
      d.arc = null;
      d.t = 0;
      d.zap = 0;
    },
    enter(e) { e.vy = e.data.spd; },
    move(e, dt) {
      const d = e.data;
      if (d.st === 'in') {
        seek(e, e.x, d.hoverY, d.spd, 2);
        if (Math.abs(e.y - d.hoverY) < 6) { d.st = 'hover'; d.t = 0; d.x0 = U.clamp(e.x, 110, W - 110); }
      } else if (d.st === 'hover') {
        d.t += dt;
        seek(e, d.x0 + 60 * Math.sin(d.t * 0.42 + d.ph), d.hoverY + 8 * Math.sin(d.t * 1.1), 70, 2);
        if (d.stay > 0 && d.t >= d.stay && !d.arc) d.st = 'out';
      } else {
        e.vx *= 1 / (1 + dt);
        e.vy = U.approach(e.vy, -160, 110 * dt);
        if (e.y < -e.r - 50) leave(e);
      }
    },
    act(e, dt) {
      const d = e.data;
      if (d.zap > 0) d.zap -= dt;
      // the pair arc: geometry follows both coils every step; either death breaks it
      if (d.arc) {
        const a = d.arc, bm = a.bm, p = a.p;
        if (!bm || bm.dead) d.arc = null;
        else if (p.dead || p.dying || !p.data) { if (bm.state !== 'fade') { bm.state = 'fade'; bm.fade = 0; } d.arc = null; }
        else { arcGeom(e, p, bm); if (bm.state === 'active') d.zap = 0.1; }
      }
      if (d.chg > 0) {
        d.chg -= dt;
        if (d.chg <= 0 && pats()) pats().fan(e, 'aim', { count: 5 + plus(e), speed: 210, spread: 0.8, type: 'spark', oy: 38 });
      } else if (d.st === 'hover' && onScreen(e, -20) && ready(e, 'fire', 2.4, dt)) {
        if (canAim(e)) { d.chg = 0.45; charge(e, 0, 38, 0.45, VIOLET, 18); } else d.fire = 0.2;
      }
      if (!d.arc && d.st === 'hover' && ready(e, 'link', 4, dt)) {
        const p = arcPartner(e);
        if (p) {
          const bm = SL.fireEnemyBeam(e, { angle: 0, length: 10, width: 14, telegraph: 0.8, duration: 0.6, color: VIOLET, follow: true, data: { arc: true } });
          if (!bm.dead) { d.arc = { p, bm }; p.data.arcBy = e; arcGeom(e, p, bm); }
        }
      }
    },
    over(e, ctx, F) {
      const d = e.data, t = F.t;
      const arcOn = (d.arc && d.arc.bm && !d.arc.bm.dead) || (d.arcBy && !d.arcBy.dead && d.arcBy.data && d.arcBy.data.arc && d.arcBy.data.arc.p === e);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of [-1, 1]) {
        loc(F, s * COIL_X, COIL_TOP);
        const tx = PT.x, ty = PT.y;
        A.drawGlow(ctx, tx, ty, 13 + 5 * Math.sin(t * 9 + s + d.ph) + (arcOn ? 10 : 0), VIOLET, (0.55 + (arcOn ? 0.45 : 0)) * F.a);
        A.drawGlow(ctx, tx, ty, 5, '#ffffff', 0.8 * F.a);
        // crawling sparks between the stacked rings and up to the terminal
        const n = (Math.random() < 0.7 ? 1 : 0) + (arcOn || d.zap > 0 ? 2 : 0);
        for (let k = 0; k < n; k++) {
          const r0 = COIL_RINGS[(Math.random() * 4) | 0], r1 = COIL_RINGS[(Math.random() * 4) | 0];
          const side0 = Math.random() < 0.5 ? -1 : 1, side1 = Math.random() < 0.5 ? -1 : 1;
          loc(F, s * COIL_X + side0 * r0[1], 50 - 45 + r0[0]);
          const ax = PT.x, ay = PT.y;
          let bx = tx, by = ty;
          if (Math.random() < 0.5) { loc(F, s * COIL_X + side1 * r1[1] * 0.7, 50 - 45 + r1[0] - 4); bx = PT.x; by = PT.y; }
          ctx.globalAlpha = (0.55 + Math.random() * 0.45) * F.a;
          ctx.strokeStyle = '#d9c8ff';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          bolt(ctx, ax, ay, bx, by, 4, 6);
          ctx.stroke();
          ctx.globalAlpha = F.a;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  });

  // ================================================================== heavies
  /** Tapered limb segment from (x0, y0) to (x1, y1), half-widths w0 -> w1. */
  function limb(x0, y0, x1, y1, w0, w1) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    return A.poly([x0 + nx * w0, y0 + ny * w0, x1 + nx * w1, y1 + ny * w1, x1 - nx * w1, y1 - ny * w1, x0 - nx * w0, y0 - ny * w0]);
  }
  function hexPath(x, y, r) {
    const p = new Path2D();
    for (let i = 0; i < 6; i++) {
      const a = PI / 6 + i * PI / 3;
      if (i) p.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else p.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    p.closePath();
    return p;
  }
  /** Draws part sprite `sk` pivoting at local (px, py) of frame F: the sprite center sits at local (cx, cy) when
      unrotated; s = 1 right side, -1 mirrored left side; th = pivot rotation (right-side convention). */
  function drawLimb(ctx, F, sk, s, px, py, cx, cy, th, glowK) {
    const c = Math.cos(th), sn = Math.sin(th), vx = cx - px, vy = cy - py;
    loc(F, s * (px + vx * c - vy * sn), py + vx * sn + vy * c);
    const x = PT.x, y = PT.y;
    blit(ctx, sk.b, x, y, F.rot + s * th, s * F.sx, F.sy, F.a, false);
    if (glowK > 0) blit(ctx, sk.g, x, y, F.rot + s * th, s * F.sx, F.sy, F.a * glowK, true);
  }

  // ---- hive: bulbous carrier, honeycomb hangar face, four docking claws, two big engines
  const HIVE_BAY = { x: 110, y: 138, rx: 74, ry: 48 };
  art('hive', 220, 200, (K) => {
    const cx = K.cx, P = K.P;
    for (const s of [-1, 1]) {
      const x = cx + s * 46;
      K.metal(rrect(x - 16, 2, 32, 38, 9), P.steel, [x - 16, 2, 32, 38], { spec: 0.8, edge: 0.8 });
      K.lines(seg([x - 16, 16, x + 16, 16]), 0.55);
      K.lines(seg([x - 16, 26, x + 16, 26]), 0.5);
      K.recess(ell(x, 6, 11, 3.6), [x - 11, 2.4, 22, 7.2]);
      K.dot(x, 6.2, 3, P.engine, 8);
    }
    const hull = A.symPath(cx, [[0, 196], [26, 194], [56, 186], [82, 168], [100, 140], [106, 104], [102, 68], [90, 40], [70, 22], [40, 13], [0, 11]]);
    K.metal(hull, P.hull, [4, 10, 212, 188], { spec: 0.5, specPos: 0.3 });
    K.grain(hull, 0.14);
    K.shade(hull, cx + 60, 150, 90, 0.4);
    K.sheen(hull, cx - 50, 50, 60, 0.16);
    const dors = A.symPath(cx, [[0, 18], [36, 21], [62, 32], [80, 50], [88, 72], [84, 84], [60, 79], [30, 76], [0, 75]]);
    K.metal(dors, P.hull2, [cx - 88, 18, 176, 68], { spec: 0.62, edge: 1 });
    K.grain(dors, 0.1);
    for (let k = 0; k < 3; k++) {
      const y = 34 + k * 15, w = 52 + k * 12;
      K.lines(seg([cx - w, y + 12 - k * 2, cx - w * 0.5, y + 3, cx, y, cx + w * 0.5, y + 3, cx + w, y + 12 - k * 2]), 0.6);
    }
    K.seam(seg([cx - 70, 70, cx - 36, 64, cx, 62, cx + 36, 64, cx + 70, 70]), 1.3);
    K.seam(seg([cx - 46, 40, cx - 20, 35, cx, 34, cx + 20, 35, cx + 46, 40]), 1);
    K.seam(seg([cx, 20, cx, 32]), 1.1);
    K.rivets([cx - 80, 76, cx - 66, 80, cx + 66, 80, cx + 80, 76, cx - 30, 74, cx + 30, 74]);
    // rim of the hangar face
    const rim = new Path2D();
    rim.ellipse(HIVE_BAY.x, HIVE_BAY.y, HIVE_BAY.rx + 6, HIVE_BAY.ry + 6, 0, 0, TAU);
    rim.ellipse(HIVE_BAY.x, HIVE_BAY.y, HIVE_BAY.rx, HIVE_BAY.ry, 0, TAU, 0, true);
    const face = ell(HIVE_BAY.x, HIVE_BAY.y, HIVE_BAY.rx, HIVE_BAY.ry);
    K.recess(face, [HIVE_BAY.x - HIVE_BAY.rx, HIVE_BAY.y - HIVE_BAY.ry, HIVE_BAY.rx * 2, HIVE_BAY.ry * 2]);
    const hr = 8.6, dx = hr * Math.sqrt(3) + 1.2, dy = hr * 1.5 + 1;
    for (let row = -4; row <= 4; row++) {
      for (let col = -6; col <= 6; col++) {
        const x = HIVE_BAY.x + col * dx + (row & 1 ? dx / 2 : 0), y = HIVE_BAY.y + row * dy;
        const u = (x - HIVE_BAY.x) / (HIVE_BAY.rx - 6), v = (y - HIVE_BAY.y) / (HIVE_BAY.ry - 6);
        if (u * u + v * v > 1) continue;
        const hx = hexPath(x, y, hr);
        const bay = Math.abs(row) <= 1 && Math.abs(col + (row & 1 ? 0.5 : 0)) <= 1.2;
        K.metal(hx, bay ? '#2a2f42' : '#23283a', [x - hr, y - hr, hr * 2, hr * 2], { spec: 0.5, edge: 0.5, rimLight: 0.8, rimWidth: 0.7 });
        if (bay) {
          K.recess(hexPath(x, y, hr - 2.4), [x - hr, y - hr, hr * 2, hr * 2]);
          K.lamp(hexPath(x, y, hr - 3.6), '#ff8a3d', 8);
          K.lines(seg([x - hr + 3, y, x + hr - 3, y]), 0.7);
        } else {
          K.lines(seg([x - hr * 0.55, y - hr * 0.3, x + hr * 0.55, y - hr * 0.3]), 0.35);
          if ((row * 7 + col * 3) % 5 === 0) K.dot(x, y + 1.5, 0.9, '#ff8a3d', 3);
        }
      }
    }
    K.metal(rim, P.hull2, [HIVE_BAY.x - 80, HIVE_BAY.y - 54, 160, 108], { spec: 0.75, edge: 0.7, rimLight: 1.2 });
    K.seam(seg([cx - 56, 96, cx - 30, 89, cx, 87, cx + 30, 89, cx + 56, 96]), 1);
    for (const t of [[-14, 82], [0, 80], [14, 82]]) K.dot(cx + t[0], t[1], 2.4, P.glow, 8);
    K.dot(cx - 92, 104, 1.6, P.glow, 5);
    K.dot(cx + 92, 104, 1.6, P.glow, 5);
  }, { pad: 10, res: 2 });
  art('hive_claw', 70, 30, (K) => {
    const P = K.P;
    const up = limb(10, 15, 44, 11.5, 6.4, 4.6);
    K.metal(up, P.hull2, [6, 6, 42, 16], { spec: 0.7, edge: 0.6, rimLight: 1 });
    const hook = A.poly([42, 7.4, 52, 8, 62, 13, 68.4, 22.6, 64, 20.6, 58, 17.4, 48, 15.8, 42, 15.6]);
    K.metal(hook, P.hull, [42, 7, 27, 16], { spec: 0.8, edge: 0.6, rimLight: 1 });
    K.lines(seg([28, 8.4, 28, 17.6]), 0.55);
    K.seam(seg([14, 15, 40, 12.2]), 0.8);
    K.metal(circ(10, 15, 7), P.steel, [3, 8, 14, 14], { spec: 0.85, edge: 0.5 });
    K.dot(10, 15, 2, '#ff8a3d', 6);
    K.metal(circ(44, 11.6, 4.6), P.steel, [39, 7, 10, 10], { spec: 0.85, edge: 0.5 });
  }, { pad: 4, res: 2 });
  const HIVE_CLAWS = [[96, 52, 0.62], [101, -12, 0.12]];

  function hiveLaunch(e) {
    const d = e.data;
    for (const s of [-1, 1]) {
      const bx = e.x + s * 16, by = e.y + 58;
      const ex = U.clamp(e.x + s * (150 + SL.rng.next() * 90), 40, W - 40);
      const path = spline([[bx, by], [bx + s * 46, by + 54], [ex, by + 200], [ex + s * 30, by + 430], [ex + s * 50, H + 90]]);
      const g = SL.spawnEnemy('gnat', { x: bx, y: by, path, emerge: 0.3, tier: d.tier, target: e.target });
      if (g && !g.dead) d.kids.push(g);
    }
    d.bayT = 0.6;
    d.open = 1;
    sfx('hive_launch', e.x);
    SL.fx.emit({ x: e.x, y: e.y + 52, life: 0.3, size: 30, size2: 90, color: '#ff8a3d', alpha: 0.5 });
  }
  defineEnemy('hive', {
    name: 'Hive carrier', cls: 'heavy', heavy: true, hp: 1000, r: 86, speed: 80, score: 3500, credits: [35, 50], dropChance: 1, dropTable: 'drop_heavy',
    explosion: 'xl', face: 'none', bob: 2.4, engines: [[-46, -95, 17, 42], [46, -95, 17, 42]],
    init(e, o) {
      const d = e.data;
      d.st = 'in';
      d.goalY = num(o.hoverY, 220);
      d.stay = num(o.stay, 30);
      d.launch = 1.4;
      d.kids = [];
      d.bayT = 0;
      d.open = 0;
      d.chg = 0;
      d.ring = 2.6;
      d.t = 0;
      d.claw = skin(e, 'hive_claw');
    },
    enter(e) { e.vy = e.data.spd; },
    move(e, dt) {
      const d = e.data;
      if (d.st === 'in') {
        seek(e, e.x, d.goalY, d.spd, 1.4);
        if (Math.abs(e.y - d.goalY) < 6) { d.st = 'hold'; d.t = 0; d.x0 = U.clamp(e.x, 150, W - 150); }
      } else if (d.st === 'hold') {
        d.t += dt;
        seek(e, d.x0 + 50 * Math.sin(d.t * 0.45), d.goalY + 6 * Math.sin(d.t * 0.9), 40, 1.5);
        if (d.stay > 0 && d.t >= d.stay) d.st = 'out';
      } else {
        e.vx *= 1 / (1 + dt);
        e.vy = U.approach(e.vy, -80, 60 * dt);
        if (e.y < -e.r - 70) leave(e);
      }
    },
    act(e, dt) {
      const d = e.data;
      if (d.bayT > 0) d.bayT -= dt;
      d.open = U.approach(d.open, 0, dt * 1.6);
      for (let i = d.kids.length - 1; i >= 0; i--) if (d.kids[i].dead) d.kids.splice(i, 1);
      if (d.st === 'out' || !onScreen(e, -40)) return;
      d.launch -= dt;
      if (d.launch <= 0) {
        d.launch = 2.5;
        if (d.kids.length <= 8) hiveLaunch(e);
      }
      if (d.tier < 3) return;
      if (d.chg > 0) {
        d.chg -= dt;
        if (d.chg <= 0 && pats()) pats().ring(e, { count: 8 + plus(e), speed: 120, type: 'orbBig', offset: SL.rng.next() * TAU, oy: 10, fr: 1 });
      } else if (ready(e, 'ring', 4, dt)) {
        d.chg = 0.5;
        charge(e, 0, 10, 0.5, EB.orange, 30);
      }
    },
    hit(e, dmg, o) {
      const d = e.data;
      if (d.bayT > 0 && o && o.y != null && o.y > e.y + 26 && Math.abs(o.x - e.x) < 84) {
        e.hp -= dmg * 0.5;
        if (Math.random() < 0.35) SL.fx.hit(o.x, o.y, '#ffb070', { dir: -HALF });
      }
    },
    under(e, ctx, F) {
      const d = e.data, t = F.t;
      for (let i = 0; i < 2; i++) {
        const c = HIVE_CLAWS[i];
        for (const s of [-1, 1]) {
          const th = c[2] + 0.06 * Math.sin(t * 1.3 + i * 1.7 + s + d.ph) + d.open * (i ? 0.2 : 0.42);
          drawLimb(ctx, F, d.claw, s, c[0], c[1], c[0] + 25, c[1], th, pulseK(e));
        }
      }
    },
    over(e, ctx, F) {
      const d = e.data;
      const k = Math.max(d.open, d.bayT > 0 ? 0.6 : 0);
      const flick = 0.75 + 0.25 * Math.sin(F.t * 13 + d.ph);
      glowAt(ctx, F, 0, 58, 40 + 30 * k, '#ff8a3d', (0.22 + 0.6 * k) * flick);
      if (k > 0.05) glowAt(ctx, F, 0, 58, 18, '#fff1d6', k);
    },
  });

  // ---- bastion: brick-shaped armored barge, stepped superstructure, two twin-barrel turrets, armored prow
  const BT = [[-80, 12], [80, 12]];
  function bastionHull(K, cargo) {
    const cx = K.cx, P = K.P;
    for (const t of [[-30, 3.4, 11], [30, 3.4, 11], [-78, 6, 10], [78, 6, 10]]) {
      const x = cx + t[0];
      K.metal(rrect(x - t[2], t[1], t[2] * 2, 20, 4), P.steel, [x - t[2], t[1], t[2] * 2, 20], { spec: 0.8, edge: 0.6 });
      K.lines(seg([x - t[2], t[1] + 10, x + t[2], t[1] + 10]), 0.5);
      K.recess(ell(x, t[1] + 2.4, t[2] * 0.72, 2.4), [x - t[2], t[1], t[2] * 2, 5]);
      K.dot(x, t[1] + 2.6, t[2] * 0.26, P.engine, 7);
    }
    const hull = A.poly([24, 14, 216, 14, 228, 26, 230, 122, 216, 146, 24, 146, 10, 122, 12, 26]);
    K.metal(hull, P.hull, [10, 14, 220, 132], { spec: 0.48, specPos: 0.3 });
    K.grain(hull, 0.14);
    K.shade(hull, 200, 120, 90, 0.35);
    for (const s of [-1, 1]) {
      const deck = s < 0 ? A.poly([18, 28, 74, 24, 76, 118, 18, 120]) : A.poly([222, 28, 166, 24, 164, 118, 222, 120]);
      K.metal(deck, P.hull2, s < 0 ? [18, 24, 58, 96] : [164, 24, 58, 96], { spec: 0.58, edge: 0.9 });
      K.grain(deck, 0.1);
      const x0 = s < 0 ? 18 : 164;
      for (let y = 42; y < 116; y += 18) K.lines(seg([x0 + 2, y, x0 + 56, y]), 0.5);
      for (let i = 0; i < 3; i++) K.recess(rrect(x0 + 8 + i * 15, 108, 10, 4, 1.5), [x0 + 8 + i * 15, 108, 10, 4]);
      K.seam(seg(s < 0 ? [22, 30, 70, 27] : [218, 30, 170, 27]), 1);
      K.rivets(s < 0 ? [24, 36, 68, 34, 24, 114, 70, 114] : [216, 36, 172, 34, 216, 114, 170, 114]);
    }
    // stepped superstructure
    K.metal(rrect(82, 28, 76, 86, 6), P.hull2, [82, 28, 76, 86], { spec: 0.64, edge: 1 });
    K.lines(seg([84, 72, 156, 72]), 0.55);
    K.metal(rrect(92, 38, 56, 62, 5), P.hull, [92, 38, 56, 62], { spec: 0.7, edge: 0.9, rimLight: 1.2 });
    K.metal(rrect(103, 46, 34, 40, 4), P.hull2, [103, 46, 34, 40], { spec: 0.8, edge: 0.8, rimLight: 1.3 });
    K.lamp(rrect(106, 78, 28, 3.6, 1.6), P.glow, 7);
    K.sphere(120, 56, 5.4, '#3a4058', 0.7);
    K.dot(120, 56, 1.6, P.glow, 6);
    K.seam(seg([86, 108, 120, 112, 154, 108]), 1.1);
    K.seam(seg([95, 96, 120, 99, 145, 96]), 0.9);
    K.rivets([88, 34, 152, 34, 88, 108, 152, 108, 96, 44, 144, 44]);
    if (cargo) {
      for (const s of [-1, 1]) {
        for (let col = 0; col < 2; col++) {
          for (let row = 0; row < 3; row++) {
            const x = cx + s * (37 + col * 15) - 6, y = 33 + row * 16;
            K.metal(rrect(x, y, 12, 12, 3), '#2e3448', [x, y, 12, 12], { spec: 0.6, edge: 0.5 });
            K.recess(rrect(x + 2, y + 2, 8, 8, 2), [x + 2, y + 2, 8, 8]);
            K.lamp(rrect(x + 3, y + 3, 6, 6, 2), '#7dffc4', 8);
            K.lamp(rrect(x + 4.6, y + 4, 2.8, 2, 1), '#f4fff9', 4);
          }
        }
      }
    }
    // the armored prow: thick riveted plates
    const prow = A.poly([12, 116, 228, 116, 235, 132, 205, 166, 152, 178.6, 88, 178.6, 35, 166, 5, 132]);
    K.metal(prow, P.plate, [5, 116, 230, 63], { spec: 0.62, specPos: 0.28, edge: 1.4, rimLight: 1.6 });
    K.grain(prow, 0.12);
    K.lines(seg([86, 120, 76, 173]), 0.7);
    K.lines(seg([154, 120, 164, 173]), 0.7);
    K.lines(seg([10, 131, 230, 131]), 0.6);
    K.sheen(prow, 70, 128, 60, 0.18);
    const rv = [];
    for (let x = 22; x <= 218; x += 13) rv.push(x, 123.5);
    for (let x = 96; x <= 144; x += 12) rv.push(x, 170);
    rv.push(30, 150, 48, 160, 210, 150, 192, 160, 96, 140, 144, 140);
    K.rivets(rv, 1.1);
    K.seam(seg([18, 136, 70, 136]), 1);
    K.seam(seg([170, 136, 222, 136]), 1);
    K.recess(rrect(108, 166, 24, 8, 3), [108, 166, 24, 8]);
    K.lamp(rrect(111, 168.4, 18, 3.2, 1.5), P.glow, 8);
  }
  art('bastion', 240, 180, (K) => bastionHull(K, false), { pad: 10, res: 2 });
  art('bastion_cargo', 240, 180, (K) => bastionHull(K, true), { pad: 10, res: 2 });
  art('bastion_turret', 60, 60, (K) => {
    const cx = K.cx, cy = K.cy, P = K.P;
    for (const s of [-1, 1]) {
      const by = cy + s * 5.4;
      K.metal(rrect(cx + 3, by - 2.5, 24, 5, 1.8), P.steel, [cx + 3, by - 2.6, 24, 5.2], { spec: 0.9, edge: 0.5, rimLight: 0.8 });
      K.lines(seg([cx + 14, by - 2.5, cx + 14, by + 2.5]), 0.5);
      K.metal(rrect(cx + 23, by - 3.3, 5.6, 6.6, 1.5), P.hull2, [cx + 23, by - 3.3, 5.6, 6.6], { spec: 0.8, edge: 0.5 });
      K.dot(cx + 27, by, 1.3, P.engine, 5);
    }
    const base = A.poly([cx - 15, cy - 11.5, cx + 5, cy - 15, cx + 14, cy - 7.5, cx + 14, cy + 7.5, cx + 5, cy + 15, cx - 15, cy + 11.5, cx - 18, cy]);
    K.metal(base, P.hull2, [cx - 18, cy - 15, 32, 30], { spec: 0.75, edge: 0.9, rimLight: 1.2 });
    K.grain(base, 0.1);
    const cap = A.poly([cx - 9, cy - 7, cx + 4, cy - 9, cx + 9, cy - 4.5, cx + 9, cy + 4.5, cx + 4, cy + 9, cx - 9, cy + 7]);
    K.metal(cap, P.hull, [cx - 9, cy - 9, 18, 18], { spec: 0.85, edge: 0.7, rimLight: 1.2 });
    K.lines(seg([cx - 6, cy - 13, cx - 6, cy + 13]), 0.55);
    K.rivets([cx - 13, cy - 7.5, cx - 13, cy + 7.5, cx + 8, cy - 10.5, cx + 8, cy + 10.5], 0.9);
    K.seam(seg([cx - 15, cy - 3, cx - 15, cy + 3]), 0.9);
    K.dot(cx + 4, cy, 2.2, P.glow, 7);
  }, { pad: 4, res: 3 });

  defineEnemy('bastion', {
    name: 'Bastion armored barge', cls: 'heavy', heavy: true, hp: 1200, r: 90, speed: 70, score: 4000, credits: [40, 55], dropChance: 1, dropTable: 'drop_heavy',
    explosion: 'xl', face: 'none', bob: 1.5,
    engines: [[-30, -86, 10, 27], [30, -86, 10, 27], [-78, -84, 9, 23], [78, -84, 9, 23]],
    circles: [[-58, -16, 58], [58, -16, 58], [0, 30, 64]],
    init(e, o) {
      const d = e.data;
      d.st = 'in';
      d.goalY = num(o.hoverY, 280);
      d.stay = num(o.stay, 22);
      d.cargo = Array.isArray(o.cargo) && o.cargo.length ? o.cargo.slice() : null;
      if (d.cargo) { d.skin = skin(e, 'bastion_cargo'); e.sprite = d.skin.b; }
      d.ta = [HALF, HALF];
      d.tf = [0.9, 1.8];
      d.mz = [0, 0];
      d.wall = 3.2;
      d.chg = 0;
      d.t = 0;
      d.turret = skin(e, 'bastion_turret');
    },
    enter(e) { e.vy = e.data.spd; },
    move(e, dt) {
      const d = e.data;
      if (d.st === 'in') {
        seek(e, e.x, d.goalY, d.spd, 1.3);
        if (Math.abs(e.y - d.goalY) < 6) { d.st = 'hold'; d.t = 0; d.x0 = U.clamp(e.x, 180, W - 180); }
      } else if (d.st === 'hold') {
        d.t += dt;
        seek(e, d.x0 + 60 * Math.sin(d.t * 0.38), d.goalY + 5 * Math.sin(d.t * 0.8), 40, 1.4);
        if (!d.cargo && d.stay > 0 && d.t >= d.stay) d.st = 'out';
      } else {
        e.vx *= 1 / (1 + dt);
        e.vy = U.approach(e.vy, -75, 50 * dt);
        if (e.y < -e.r - 80) leave(e);
      }
    },
    act(e, dt) {
      const d = e.data;
      const tg = aimAt(e);
      for (let i = 0; i < 2; i++) {
        const tx = e.x + BT[i][0], ty = e.y + BT[i][1];
        d.ta[i] += U.clamp(U.angleDiff(d.ta[i], Math.atan2(tg.y - ty, tg.x - tx)), -1.8 * dt, 1.8 * dt);
        if (d.mz[i] > 0) d.mz[i] -= dt;
      }
      if (d.st === 'out' || !onScreen(e, -30)) return;
      for (let i = 0; i < 2; i++) {
        if (!ready(e, i ? 'tfR' : 'tfL', 1.8, dt)) continue;
        if (!canAim(e) || !pats()) continue;
        const a = d.ta[i];
        pats().aimed(e, null, { count: 2 + plus(e), speed: 190, type: 'orbBig', spread: 0.14, ox: BT[i][0] + Math.cos(a) * 28, oy: BT[i][1] + Math.sin(a) * 28 });
        d.mz[i] = 0.12;
      }
      if (d.chg > 0) {
        d.chg -= dt;
        if (d.chg <= 0 && pats()) pats().wall_gap(e, { oy: 92 });
      } else if (ready(e, 'wall', 5, dt)) {
        d.chg = 0.5;
        charge(e, 0, 92, 0.5, PAL.glow, 26);
      }
    },
    hit(e, dmg, o) {
      if (!o || o.type === 'bomb') return;
      const px = o.x != null ? o.x : o.by && o.by.x, py = o.y != null ? o.y : o.by && o.by.y;
      if (px == null || py == null) return;
      if (Math.abs(U.angleDiff(HALF, Math.atan2(py - e.y, px - e.x))) > PI / 3) return;
      e.hp += dmg * 0.5;
      if (o.x != null && Math.random() < 0.5) SL.fx.sparks(o.x, o.y, { count: 3, color: '#ffffff', speed: 320, angle: Math.atan2(py - e.y, px - e.x), spread: 1.4, life: 0.2, size: 6 });
      sfx('hit_armor', e.x);
    },
    onDeath(e) {
      const d = e.data;
      if (!d.cargo) return;
      const n = d.cargo.length;
      for (let i = 0; i < n; i++) {
        const c = d.cargo[i] || [];
        const x = U.clamp(e.x + (i - (n - 1) / 2) * 44, 40, W - 40), y = U.clamp(e.y + 10 + (i % 2) * 22, 60, H - 200);
        if (SL.rescue && SL.rescue.spawnPod) SL.rescue.spawnPod(x, y, { kind: c[0] || 'captive', people: c[1] || 2, vip: c[2] || null });
        else U.warnOnce('bastion-cargo', '[SL] bastion cargo: SL.rescue.spawnPod is missing');
      }
    },
    over(e, ctx, F) {
      const d = e.data;
      for (let i = 0; i < 2; i++) {
        loc(F, BT[i][0], BT[i][1]);
        const x = PT.x, y = PT.y, a = d.ta[i];
        blit(ctx, d.turret.b, x, y, a, F.sy, F.sy, F.a, false);
        blit(ctx, d.turret.g, x, y, a, F.sy, F.sy, F.a * pulseK(e), true);
        if (d.mz[i] > 0) {
          const k = d.mz[i] / 0.12, r = 28 * F.sy;
          A.drawGlow(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, 18 * k + 6, '#ffc78a', k * F.a);
        }
      }
    },
  });

  // ---- tug: squat armored body, two long claw arms cradling a black hole 120 px below its center
  const TUG_S = [74, 8], TUG_C = [66, 87], TUG_COIL = [79, 104];
  art('tug', 200, 160, (K) => {
    const cx = K.cx, P = K.P;
    for (const s of [-1, 1]) {
      const x = cx + s * 34;
      K.metal(rrect(x - 13, 2, 26, 20, 5), P.steel, [x - 13, 2, 26, 20], { spec: 0.8, edge: 0.6 });
      K.recess(ell(x, 4.6, 9, 3), [x - 9, 1.6, 18, 6]);
      K.dot(x, 4.8, 2.8, P.engine, 8);
    }
    const body = A.poly([42, 12, 158, 12, 186, 38, 192, 74, 172, 102, 28, 102, 8, 74, 14, 38]);
    K.metal(body, P.hull, [8, 12, 184, 90], { spec: 0.52, specPos: 0.3 });
    K.grain(body, 0.14);
    K.shade(body, 160, 90, 60, 0.35);
    for (const s of [-1, 1]) {
      const pl = s < 0 ? A.poly([16, 40, 44, 28, 52, 74, 12, 72]) : A.poly([184, 40, 156, 28, 148, 74, 188, 72]);
      K.metal(pl, P.hull2, s < 0 ? [12, 28, 40, 46] : [148, 28, 40, 46], { spec: 0.62, edge: 0.9 });
      K.lines(seg(s < 0 ? [18, 56, 48, 54] : [182, 56, 152, 54]), 0.55);
      K.seam(seg(s < 0 ? [20, 44, 44, 34] : [180, 44, 156, 34]), 1);
      K.rivets(s < 0 ? [20, 66, 44, 66, 22, 48] : [180, 66, 156, 66, 178, 48]);
    }
    const band = A.poly([16, 78, 184, 78, 172, 102, 28, 102]);
    K.metal(band, P.plate, [16, 78, 168, 24], { spec: 0.66, edge: 1.1, rimLight: 1.3 });
    const rv = [];
    for (let x = 30; x <= 170; x += 14) rv.push(x, 84, x + 7, 97);
    K.rivets(rv, 1);
    K.lines(seg([62, 79, 58, 101]), 0.6);
    K.lines(seg([138, 79, 142, 101]), 0.6);
    // magnetic core housing
    K.metal(circ(cx, 48, 25), P.steel, [cx - 25, 23, 50, 50], { spec: 0.8, edge: 0.8, rimLight: 1.2 });
    K.recess(circ(cx, 48, 18.5), [cx - 18.5, 29.5, 37, 37]);
    K.seam(circ(cx, 48, 14), 1.6, VIOLET, 9);
    K.lamp(circ(cx, 48, 7.5), VIOLET, 12);
    K.lamp(circ(cx, 48, 3), '#f0e4ff', 5);
    for (const y of [41, 48, 55]) K.lines(seg([cx - 16, y, cx - 9, y]), 0.6);
    for (const y of [41, 48, 55]) K.lines(seg([cx + 9, y, cx + 16, y]), 0.6);
    K.seam(seg([60, 20, cx, 30, 140, 20]), 1.1);
    K.seam(seg([66, 74, cx, 70, 134, 74]), 1);
    K.dot(cx - 40, 66, 1.6, P.glow, 6);
    K.dot(cx + 40, 66, 1.6, P.glow, 6);
    for (const s of [-1, 1]) K.metal(circ(cx + s * TUG_S[0], 80 + TUG_S[1], 9.5), P.steel, [cx + s * TUG_S[0] - 10, 78, 20, 20], { spec: 0.85, edge: 0.6 });
  }, { pad: 10, res: 2 });
  // right arm in its own 80 x 190 box: arm-sprite (ax, ay) = tug-local (lx - 26, ly + 8)
  art('tug_arm', 80, 190, (K) => {
    const P = K.P;
    const S = [48, 16], E = [62, 82], Wr = [40, 148], T = [10, 177], F2 = [24, 120];
    K.metal(limb(S[0], S[1], E[0], E[1], 9.5, 7.5), P.hull2, [36, 6, 36, 80], { spec: 0.7, edge: 0.8, rimLight: 1.1 });
    K.lines(limb(S[0], S[1], E[0], E[1], 5, 4), 0.35);
    K.metal(limb(E[0], E[1], Wr[0], Wr[1], 8.4, 6.4), P.hull, [30, 74, 42, 80], { spec: 0.72, edge: 0.8, rimLight: 1.1 });
    K.grain(limb(E[0], E[1], Wr[0], Wr[1], 8.4, 6.4), 0.12);
    // magnetic coils on the forearm
    for (let i = 0; i < 3; i++) {
      const u = 0.28 + i * 0.2, x = E[0] + (Wr[0] - E[0]) * u, y = E[1] + (Wr[1] - E[1]) * u;
      const cp = limb(x - 1.2, y - 3.6, x + 1.2, y + 3.6, 9.6, 9.6);
      K.metal(cp, P.steel, [x - 10, y - 6, 20, 12], { spec: 0.9, edge: 0.5 });
      K.seam(limb(x - 0.6, y - 1.8, x + 0.6, y + 1.8, 8, 8), 0.9, VIOLET, 7);
    }
    const claw = A.poly([Wr[0] + 6, Wr[1] - 3, Wr[0] + 2, Wr[1] + 14, T[0] + 12, T[1] - 2, T[0], T[1] + 1.6, T[0] + 6, T[1] - 7, Wr[0] - 10, Wr[1] + 4, Wr[0] - 6, Wr[1] - 4]);
    K.metal(claw, P.hull2, [8, 140, 42, 40], { spec: 0.8, edge: 0.7, rimLight: 1.1 });
    K.lines(seg([Wr[0] - 6, Wr[1] + 12, T[0] + 9, T[1] - 4]), 0.45);
    const fin = A.poly([Wr[0] - 4, Wr[1] - 6, F2[0] + 2, F2[1] - 2, F2[0] - 3, F2[1] + 1, Wr[0] - 8, Wr[1] + 2]);
    K.metal(fin, P.steel, [20, 116, 22, 36], { spec: 0.85, edge: 0.6 });
    K.dot(F2[0] + 0.5, F2[1], 1.4, VIOLET, 6);
    K.dot(T[0] + 2, T[1] - 1, 1.3, VIOLET, 6);
    K.seam(seg([S[0] + 7, S[1] + 4, E[0] + 6.4, E[1] - 2, Wr[0] + 5, Wr[1] - 4]), 0.9);
    K.metal(circ(E[0], E[1], 8.6), P.steel, [E[0] - 9, E[1] - 9, 18, 18], { spec: 0.85, edge: 0.6 });
    K.dot(E[0], E[1], 2.2, P.glow, 6);
    K.metal(circ(Wr[0], Wr[1], 7.4), P.steel, [Wr[0] - 8, Wr[1] - 8, 16, 16], { spec: 0.85, edge: 0.6 });
  }, { pad: 6, res: 2 });

  function tugRelease(e) {
    const d = e.data, h = d.hole;
    d.hole = null;
    if (!h || h.dead) return;
    const rel = h.def && (h.def.release || h.def.end);
    if (rel) { try { rel(h); } catch (err) { console.error('[SL] tug: black hole release threw:', err); } }
  }
  defineEnemy('tug', {
    name: 'Collapsar tug', cls: 'heavy', heavy: true, hp: 1400, r: 80, speed: 60, score: 4500, credits: [45, 60], dropChance: 1, dropTable: 'drop_heavy',
    explosion: 'xl', palette: 'violet', face: 'none', bob: 1.5, engines: [[-34, -75.6, 12, 32], [34, -75.6, 12, 32]],
    circles: [[0, -18, 66], [-78, 60, 20], [78, 60, 20]],
    init(e, o) {
      const d = e.data;
      d.st = 'in';
      d.goalY = num(o.hoverY, 240);
      d.stay = num(o.stay, 32);
      d.fire = 1.6;
      d.side = 1;
      d.coil = 0;
      d.t = 0;
      d.arm = skin(e, 'tug_arm');
      d.hole = null;
      if (!o.specimen && !o.noHole && SL.spawnHazard && SL.hazards && SL.hazards.has && SL.hazards.has('black_hole')) {
        const h = SL.spawnHazard('black_hole', { size: o.hole || 'medium', attachTo: e, offsetY: 120 });
        d.hole = h && !h.dead ? h : null;
      }
    },
    enter(e) { e.vy = e.data.spd; },
    move(e, dt) {
      const d = e.data;
      if (d.st === 'in') {
        seek(e, e.x, d.goalY, d.spd, 1.3);
        if (Math.abs(e.y - d.goalY) < 6) { d.st = 'hold'; d.t = 0; d.x0 = U.clamp(e.x, 170, W - 170); }
      } else if (d.st === 'hold') {
        d.t += dt;
        seek(e, d.x0 + 80 * Math.sin(d.t * 0.32), d.goalY + 6 * Math.sin(d.t * 0.7), 45, 1.4);
        if (d.stay > 0 && d.t >= d.stay) d.st = 'out';
      } else {
        e.vx *= 1 / (1 + dt);
        e.vy = U.approach(e.vy, -65, 45 * dt);
        if (e.y < -e.r - 200) leave(e);
      }
    },
    act(e, dt) {
      const d = e.data;
      if (d.coil > 0) d.coil -= dt;
      if (d.st === 'out' || !onScreen(e, -30)) return;
      if (ready(e, 'fire', 2, dt)) {
        if (canAim(e) && pats()) {
          d.side = -d.side;
          pats().aimed(e, null, { count: 3 + plus(e), speed: 160, type: 'void_orb', ox: d.side * TUG_COIL[0], oy: TUG_COIL[1] });
          d.coil = 0.3;
        } else d.fire = 0.25;
      }
    },
    onDeath(e) { tugRelease(e); },
    onExit(e) { tugRelease(e); },
    under(e, ctx, F) {
      const d = e.data, t = F.t;
      const gk = 0.55 + 0.45 * Math.sin(t * TAU * 1.6 + d.ph);
      for (const s of [-1, 1]) {
        const th = 0.035 * Math.sin(t * 0.9 + s * 1.3 + d.ph);
        drawLimb(ctx, F, d.arm, s, TUG_S[0], TUG_S[1], TUG_C[0], TUG_C[1], th, gk + (d.coil > 0 && s === d.side ? 0.8 : 0));
      }
      if (d.specimen || !d.hole) {
        // the empty cradle shows a dim containment field
        loc(F, 0, 120);
        A.drawGlow(ctx, PT.x, PT.y, 54, VIOLET, 0.35 * F.a);
      }
    },
    over(e, ctx, F) {
      const d = e.data;
      if (Math.random() < 0.5) {
        // containment sparks from a claw tip toward the hole
        const s = Math.random() < 0.5 ? -1 : 1;
        loc(F, s * 37, 168);
        const ax = PT.x, ay = PT.y;
        loc(F, s * 14, 136);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.7 * F.a;
        ctx.strokeStyle = '#d9c8ff';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        bolt(ctx, ax, ay, PT.x, PT.y, 4, 7);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (d.coil > 0) glowAt(ctx, F, d.side * TUG_COIL[0], TUG_COIL[1], 22, VIOLET, d.coil / 0.3);
    },
  });

  // ================================================================== SL.paths: helpers and named presets
  Object.assign(SL.paths, {
    make: mkPath, fromFn, line, spline, arc, sine, spiral, xform, mirror, flipY, offset, concat, at, follow, dive,
    resolve: resolvePath,
    /** Length-preserving speed for a path to take `seconds`. */
    speedFor: (p, seconds) => (p && p.len ? p.len / Math.max(0.05, seconds) : 200),
  });
  function px(o) { return U.clamp(num(o.x, W / 2), 30, W - 30); }
  function py(o) { return num(o.y, -60) > 0 ? -60 : num(o.y, -60); }
  function sideDir(o) { return o.side === 'right' ? -1 : 1; }
  SL.paths.define('straight', (o) => line(px(o), py(o), px(o), H + 100));
  SL.paths.define('swoop', (o) => {
    const x = px(o), s = x < W / 2 ? 1 : -1;
    return spline([[x, py(o)], [x, 220], [x + s * 160, 470], [W / 2 + s * 120, 760], [W / 2 + s * 200, H + 90]]);
  });
  SL.paths.define('zigzag', (o) => sine(px(o), py(o), px(o), H + 100, num(o.amp, 120), num(o.wl, 300), 0));
  SL.paths.define('u_turn', (o) => {
    const x = px(o), s = x < W / 2 ? 1 : -1;
    return spline([[x, py(o)], [x, 360], [x + s * 70, 470], [x + s * 150, 380], [x + s * 160, -120]]);
  });
  SL.paths.define('loop', (o) => {
    const x = U.clamp(px(o), 140, W - 140), s = o.side === 'right' ? -1 : 1;
    return spline([[x, py(o)], [x, 300], [x + s * 90, 410], [x, 500], [x - s * 90, 410], [x, 320], [x + s * 30, 560], [x + s * 60, H + 100]]);
  });
  SL.paths.define('cross', (o) => {
    const s = sideDir(o), x0 = s > 0 ? -50 : W + 50, y = U.clamp(num(o.y, 260) > 0 ? num(o.y, 260) : 260, 120, 700);
    return spline([[x0, y], [W / 2, y + 130], [W - x0, y + 260]]);
  });
  SL.paths.define('sweep', (o) => sweepPath(o));
  SL.paths.define('dive', (o) => {
    const t = SL.patterns && SL.patterns.target ? SL.patterns.target(null) : { x: W / 2 };
    const x = px(o);
    return spline([[x, py(o)], [x, 200], [U.clamp(t.x, 40, W - 40), 640], [U.clamp(t.x, 40, W - 40), H + 100]]);
  });

  // ================================================================== formations (GDD 6.1)
  function enemySpeed(id, o) {
    if (o.speed != null) return o.speed;
    const def = SL.enemies.has(id) ? SL.enemies.get(id) : null;
    return def && def.speed ? def.speed : 220;
  }
  /** A formation run: spawns members (o.enemy), joins them to one bonus group, handles fromBottom. */
  function Formation(kind, o) {
    this.kind = kind;
    this.o = o;
    this.g = newGroup(kind);
    this.out = [];
    this.id = o.enemy || 'gnat';
    this.sp = enemySpeed(this.id, o);
    this.up = !!o.fromBottom;
    this.lead = this.up ? 1.0 : 0;
    this.warnX = [];
  }
  /** Member with legs; paths are flipped for fromBottom; delay (s) parks it hidden until its turn. */
  Formation.prototype.add = function (legs, delay, extra, id) {
    const o = this.o;
    if (this.up) legs = legs.map((L) => (L.path ? Object.assign({}, L, { path: flipY(L.path) }) : L));
    const so = { elite: !!o.elite, target: o.target, tier: o.tier, slot: this.out.length, formation: this.kind, speed: o.speed, hpMul: o.hpMul };
    if (extra) Object.assign(so, extra);
    so.path = { legs, delay: Math.max(0, (delay || 0) + this.lead), peel: extra && extra.peel };
    const L0 = legs[0];
    if (L0 && L0.path) {
      so.x = L0.path.xs[0];
      so.y = L0.path.ys[0];
      if (this.up) this.warnX.push(so.x);
    }
    const e = SL.spawnEnemy(id || this.id, so);
    if (e && !e.dead) { join(this.g, e); this.out.push(e); }
    return e;
  };
  Formation.prototype.done = function () {
    if (this.up && this.warnX.length && SL.patterns && SL.patterns.warn) {
      const xs = this.warnX.map((x) => U.clamp(x, 40, W - 40)).sort((a, b) => a - b);
      const pickX = xs.length > 2 ? [xs[0], xs[(xs.length / 2) | 0], xs[xs.length - 1]] : xs;
      let last = -1e9;
      for (const x of pickX) {
        if (x - last < 90) continue;
        last = x;
        SL.patterns.warn(null, { fx: 'chevrons', x, life: 1.0 });
      }
      sfx('hazard_warning', W / 2);
    }
    return this.out;
  };
  function nOf(o, def, lo, hi) { return U.clamp(Math.round(num(o.count, def)), lo, hi); }
  function defineFormation(id, build) {
    SL.formations.define(id, (opts) => {
      const o = opts || EMPTY, f = new Formation(id, o);
      build(f, o);
      return f.done();
    });
  }

  // vee: V of 5-9 at 70 px spacing descending at 180 px/s, holds 1 s at y 260, then the wings peel outward and dive
  function peelLeg(s, rank) {
    return {
      fn(e) {
        const t = aimAt(e), tx = U.clamp(t.x + s * 40, 40, W - 40), sp = Math.max(280, num(e.data.spd, 220) * 1.25);
        const up = e.data.mv && e.data.mv.legs && e.data.mv.legs[0].path && e.data.mv.legs[0].path.ys[0] > H;
        const dir = up ? -1 : 1;
        const p = rank === 0
          ? spline([[e.x, e.y], [e.x, e.y + dir * 90], [tx, e.y + dir * 420], [tx, dir > 0 ? H + 120 : -140]])
          : spline([[e.x, e.y], [e.x + s * 70, e.y + dir * 26], [e.x + s * 120 + (tx - e.x) * 0.2, e.y + dir * 190], [tx + s * 60, e.y + dir * 520], [tx + s * 90, dir > 0 ? H + 120 : -140]]);
        follow(e, [{ path: p, speed: sp, accel: 260, max: sp * 1.4 }], { startSpeed: 60 });
        return false;
      },
    };
  }
  defineFormation('vee', (f, o) => {
    const n = nOf(o, 5, 3, 9), x = U.clamp(num(o.x, W / 2), 120, W - 120), sp = num(o.speed, 180);
    const D = 70 / Math.SQRT2, kmax = Math.ceil((n - 1) / 2);
    for (let i = 0; i < n; i++) {
      const k = Math.ceil(i / 2), s = i === 0 ? 0 : i % 2 ? -1 : 1;
      const mx = x + s * k * D, my = -60 - k * D;
      const legs = [{ path: line(mx, my, mx, 260 - k * D), speed: sp }, { hold: 1 + (kmax - k) * 0.16 + (k ? 0 : 0.2) }, peelLeg(s || (mx < W / 2 ? 1 : -1), k)];
      f.add(legs, 0);
    }
  });
  // line: horizontal line (gap 80 px, stagger ms between members) descending straight
  defineFormation('line', (f, o) => {
    const n = nOf(o, 5, 1, 9), gap = num(o.gap, 80), span = (n - 1) * gap;
    const cx = U.clamp(num(o.x, W / 2), span / 2 + 30, W - span / 2 - 30), st = num(o.stagger, 0) / 1000;
    for (let i = 0; i < n; i++) {
      const x = span >= W - 60 ? 30 + i * ((W - 60) / Math.max(1, n - 1)) : cx + (i - (n - 1) / 2) * gap;
      f.add([{ path: line(x, -60, x, H + 100) }], i * st);
    }
  });
  // column: single file down x at 60 px spacing; optional weave (sine amplitude px)
  defineFormation('column', (f, o) => {
    const n = nOf(o, 6, 1, 14), wv = num(o.weave, 0), x = U.clamp(num(o.x, W / 2), 40 + wv, W - 40 - wv);
    const p = wv > 0 ? sine(x, -60, x, H + 100, wv, num(o.wavelength, 360), 0) : line(x, -60, x, H + 100);
    for (let i = 0; i < n; i++) f.add([{ path: p }], (i * num(o.spacing, 60)) / f.sp);
  });
  // arc_sweep: enters at a top corner (side) and sweeps a quarter circle (r 420) across to the far side
  function sweepPath(o) {
    const s = sideDir(o), R = 420, cy = num(o.depth, -60), cx = W / 2;
    const a0 = s > 0 ? PI * 0.75 : PI * 0.25, a1 = s > 0 ? PI * 0.25 : PI * 0.75;
    const sx = cx + Math.cos(a0) * R, sy = cy + Math.sin(a0) * R, ex = cx + Math.cos(a1) * R, ey = cy + Math.sin(a1) * R;
    const inP = line(sx - s * 210 * Math.SQRT1_2, sy - 210 * Math.SQRT1_2, sx, sy);
    const outP = line(ex, ey, ex + s * 240 * Math.SQRT1_2, ey - 240 * Math.SQRT1_2);
    return concat(concat(inP, arc(cx, cy, R, a0, a1)), outP);
  }
  defineFormation('arc_sweep', (f, o) => {
    const n = nOf(o, 6, 1, 12), p = sweepPath(o);
    for (let i = 0; i < n; i++) f.add([{ path: p }], i * num(o.gapT, 0.18));
  });
  // pincer: two halves from both top corners cross in an X at y 400 and exit the opposite bottom corners
  defineFormation('pincer', (f, o) => {
    const n = nOf(o, 8, 2, 16), cy = num(o.crossY, 400);
    const pa = spline([[-50, -40], [170, cy - 200], [W / 2, cy], [W - 160, cy + 300], [W + 60, H + 60]]);
    const pb = mirror(pa);
    for (let i = 0; i < n; i++) {
      const half = i % 2, k = (i / 2) | 0;
      f.add([{ path: half ? pb : pa }], k * 0.24 + half * 0.12);
    }
  });
  // snake: follow-the-leader sine down the screen from x (amplitude 140, wavelength 360 px)
  defineFormation('snake', (f, o) => {
    const n = nOf(o, 7, 1, 14), amp = num(o.amp, 140), x = U.clamp(num(o.x, W / 2), 40 + amp, W - 40 - amp);
    const p = sine(x, -60, x, H + 100, amp, num(o.wavelength, 360), 0);
    for (let i = 0; i < n; i++) f.add([{ path: p }], (i * num(o.spacing, 52)) / f.sp);
  });
  // staircase: diagonal stagger from side (x steps 90, y steps 60), descend ~200 px, then turn toward the far side
  defineFormation('staircase', (f, o) => {
    const n = nOf(o, 5, 1, 7), s = sideDir(o);
    for (let i = 0; i < n; i++) {
      const x = s > 0 ? 70 + i * 90 : W - 70 - i * 90, y = 200 + i * 60, ex = s > 0 ? W + 70 : -70;
      const p = spline([[x, -50], [x, y - 70], [x + s * 30, y + 12], [x + s * 120, y + 44], [(x + ex) / 2 + s * 40, y + 70], [ex, y + 96]]);
      f.add([{ path: p }], i * 0.26);
    }
  });
  // ring_in: members appear on a circle (r 300) around (x, 360), spiral inward for 2 s, then fall out the bottom
  defineFormation('ring_in', (f, o) => {
    const n = nOf(o, 8, 3, 16), cx = U.clamp(num(o.x, W / 2), 330, W - 330), cy = num(o.cy, 360), R = num(o.r, 300);
    const turn = num(o.turn, 1.6) * (o.dir === -1 ? -1 : 1), off = num(o.offset, -HALF);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      const sp = spiral(cx, cy, R, 80, a, a + turn);
      const ex = cx + Math.cos(a + turn) * 80, ey = cy + Math.sin(a + turn) * 80;
      const fall = spline([[ex, ey], [ex + Math.cos(a + turn + HALF * Math.sign(turn)) * 40, ey + 60], [ex * 0.7 + cx * 0.3, ey + 300], [ex * 0.6 + cx * 0.4, H + 100]]);
      const appear = {
        fn(e) {
          SL.fx.emit({ x: e.x, y: e.y, life: 0.35, size: 70, size2: 6, color: VIOLET, alpha: 0.8 });
          SL.fx.emit({ x: e.x, y: e.y, life: 0.2, size: 26, size2: 4, color: '#ffffff' });
          return true;
        },
      };
      f.add([appear, { path: sp, speed: sp.len / 2 }, { path: fall, speed: 120, accel: 380, max: 520 }], i * 0.07, { emerge: 0.45 });
    }
  });
  // side_stream: a stream from side at y 200-500 crossing horizontally on a gentle arc; 0.25 s between members
  defineFormation('side_stream', (f, o) => {
    const n = nOf(o, 7, 1, 16), s = sideDir(o);
    const y = num(o.y, -1) >= 200 && num(o.y, -1) <= 500 ? o.y : 200 + SL.rng.next() * 300;
    const x0 = s > 0 ? -50 : W + 50, x1 = W - x0, sag = num(o.sag, 90);
    const p = spline([[x0, y], [W / 2 - s * W * 0.22, y + sag * 0.75], [W / 2 + s * W * 0.22, y + sag * 0.75], [x1, y + sag * 0.1]]);
    for (let i = 0; i < n; i++) f.add([{ path: p }], i * num(o.gapT, 0.25));
  });
  // rain: members dropped at seeded random x over 3 s, straight down, speed +-20%
  defineFormation('rain', (f, o) => {
    const n = nOf(o, 10, 1, 24), dur = num(o.duration, 3);
    for (let i = 0; i < n; i++) {
      const x = 40 + SL.rng.next() * (W - 80), t = SL.rng.next() * dur, sp = f.sp * (0.8 + SL.rng.next() * 0.4);
      f.add([{ path: line(x, -60, x, H + 100), speed: sp }], t, { speed: sp });
    }
  });
  // escort_box: a leader with `count` escorts at box corners mirroring its moves; escorts break and dive when it dies
  SL.formations.define('escort_box', (opts) => {
    const o = opts || EMPTY;
    const lid = o.leader || 'wasp', eid = o.escort || o.enemy || 'dart';
    const lead = SL.spawnEnemy(lid, Object.assign({ x: U.clamp(num(o.x, W / 2), 130, W - 130), y: -90, elite: !!o.leaderElite, target: o.target, tier: o.tier }, o.leaderOpts || EMPTY));
    if (!lead || lead.dead) return [];
    const g = newGroup('escort_box'), out = [lead];
    const b = Math.max(90, (lead.r || 30) + 40);
    const slots = [[-b, -b], [b, -b], [-b, b], [b, b], [0, -b], [0, b], [-b, 0], [b, 0]];
    const n = nOf(o, 4, 1, 8);
    for (let i = 0; i < n; i++) {
      const sl = slots[i];
      const e = SL.spawnEnemy(eid, { x: lead.x + sl[0], y: lead.y + sl[1], elite: !!o.elite, target: o.target, tier: o.tier, slot: i,
        path: { legs: [{ escort: lead, ox: sl[0], oy: sl[1] }] } });
      if (e && !e.dead) {
        e.x = lead.x + sl[0];
        e.y = lead.y + sl[1];
        join(g, e);
        out.push(e);
      }
    }
    return out;
  });

  // ================================================================== sandboxes: 'enemies', 'formations'
  const LABEL = {
    name: 'Label', noClear: true,
    draw(pr, ctx) {
      const d = pr.data;
      ctx.textAlign = 'center';
      ctx.font = '700 ' + (d.size || 15) + 'px Oxanium, sans-serif';
      ctx.fillStyle = 'rgba(232,238,247,0.94)';
      ctx.fillText(d.text || '', pr.x, pr.y);
      if (d.sub) {
        ctx.font = '500 ' + Math.round((d.size || 15) * 0.82) + 'px "Barlow Semi Condensed", sans-serif';
        ctx.fillStyle = d.subColor || 'rgba(255,120,160,0.9)';
        ctx.fillText(d.sub, pr.x, pr.y + (d.size || 15) + 2);
      }
    },
  };
  function label(x, y, text, sub, size, subColor) {
    const l = SL.spawnProp(LABEL, { x, y });
    l.data.text = text;
    l.data.sub = sub;
    l.data.size = size;
    l.data.subColor = subColor;
    return l;
  }
  const ENEMY_IDS = ['gnat', 'dart', 'wasp', 'snatcher', 'spear', 'needler', 'skimmer', 'hornet', 'phantom', 'warper', 'manta', 'weaver',
    'stormcaller', 'hive', 'bastion', 'tug'];
  const GRID = [
    ['gnat', 70, 200, 1.35], ['dart', 185, 200, 1.35], ['spear', 300, 205, 1.3], ['wasp', 445, 200, 1.3], ['snatcher', 610, 200, 1.3],
    ['needler', 85, 400, 1.2], ['skimmer', 260, 400, 1.15], ['hornet', 445, 400, 1.2], ['phantom', 615, 400, 1.2],
    ['warper', 85, 600, 1.05], ['manta', 270, 600, 1], ['weaver', 470, 600, 1], ['stormcaller', 640, 600, 0.95],
    ['hive', 118, 855, 0.82], ['bastion', 362, 850, 0.82], ['tug', 606, 840, 0.82],
  ];
  const lab = SL.lab = SL.lab || {};
  const LE = lab.enemies = { ids: ENEMY_IDS, items: [], mode: '', i: 0 };
  function clearLab() {
    for (const e of LE.items) {
      if (e.dead) continue;
      if (e.kind === 'enemy') { stopAll(e); e.dead = true; } else e.dead = true;
    }
    LE.items.length = 0;
    const en = SL.world.enemies;
    for (let i = 0; i < en.length; i++) if (!en[i].dead) { stopAll(en[i]); en[i].dead = true; }
    for (const h of SL.world.hazards) if (!h.dead) { if (h.def && h.def.end) { try { h.def.end(h); } catch (err) { /* hazard stub */ } } h.dead = true; }
    SL.world.clearEnemyBullets({ beams: true });
  }
  function parkPlayers(on) {
    for (const p of SL.world.players) {
      p.control = !on;
      if (on) { p.x = 360; p.y = 1190; p.vx = p.vy = 0; }
    }
  }
  LE.grid = function () {
    clearLab();
    parkPlayers(true);
    LE.mode = 'grid';
    LE.items.push(label(360, 118, 'NYX ARMADA', '16 enemy types  ·  elites: ?elite=1', 24, 'rgba(147,160,186,0.95)'));
    const elite = SL.debug && SL.debug.params && SL.debug.params.elite === '1';
    for (const g of GRID) {
      const e = SL.spawnEnemy(g[0], { x: g[1], y: g[2], specimen: true, elite, offscreenKill: false });
      if (!e || e.dead) continue;
      e.scale = g[3];
      LE.items.push(e);
      const def = SL.enemies.get(g[0]);
      const below = g[0] === 'tug' ? 168 : g[0] === 'hive' ? 98 : g[0] === 'bastion' ? 92 : (e.r + 16) * g[3] + 14;
      LE.items.push(label(g[1], g[2] + below, def.name.replace(/^Collapsar /, '').replace(/ (drone|interceptor|fighter|rammer|sniper|minelayer|missile boat|cloak jet|blink jet|gunship|spiral gunship|carrier|armored barge|tow drone)$/, ''), g[0], 15));
    }
    return LE.items.length;
  };
  const WAVES = {
    gnat: () => { SL.formations.get('vee')({ enemy: 'gnat', count: 7, x: 360 }); SL.after(3, () => SL.formations.get('snake')({ enemy: 'gnat', count: 7, x: 260 })); },
    dart: () => { SL.formations.get('line')({ enemy: 'dart', count: 5, stagger: 160 }); SL.after(2.6, () => SL.formations.get('staircase')({ enemy: 'dart', side: 'right' })); },
    wasp: () => { [150, 360, 570].forEach((x, i) => SL.spawnEnemy('wasp', { x, y: -60 - i * 50, hoverY: 240 + i * 50, slot: i })); },
    snatcher: () => {
      if (SL.rescue && SL.rescue.spawnPod) { SL.rescue.spawnPod(220, 560, { people: 3, kind: 'civilian' }); SL.rescue.spawnPod(500, 620, { people: 2, kind: 'crew' }); }
      SL.after(0.6, () => { SL.spawnEnemy('snatcher', { x: 160, y: -60 }); SL.spawnEnemy('snatcher', { x: 560, y: -60 }); });
    },
    spear: () => { [140, 360, 580].forEach((x, i) => SL.spawnEnemy('spear', { x, y: -60 - i * 70, lockY: 180 + i * 50 })); },
    needler: () => { SL.spawnEnemy('needler', { x: 200, y: -60, hoverY: 220 }); SL.spawnEnemy('needler', { x: 520, y: -90, hoverY: 300 }); },
    skimmer: () => { SL.spawnEnemy('skimmer', { side: 'left', y: 300 }); SL.after(1.2, () => SL.spawnEnemy('skimmer', { side: 'right', y: 430 })); },
    hornet: () => { SL.spawnEnemy('hornet', { x: 230, y: -60, hoverY: 260 }); SL.spawnEnemy('hornet', { x: 500, y: -100, hoverY: 320 }); },
    phantom: () => { SL.spawnEnemy('phantom', { x: 200, y: -60 }); SL.after(1.5, () => SL.spawnEnemy('phantom', { x: 520, y: -60 })); },
    warper: () => { SL.spawnEnemy('warper', { x: 240, y: -60 }); SL.after(0.8, () => SL.spawnEnemy('warper', { x: 500, y: -60 })); },
    manta: () => { SL.spawnEnemy('manta', { x: 360, y: -80 }); },
    weaver: () => { SL.spawnEnemy('weaver', { x: 360, y: -80, elite: true }); },
    stormcaller: () => { SL.spawnEnemy('stormcaller', { x: 200, y: -80, hoverY: 260 }); SL.spawnEnemy('stormcaller', { x: 520, y: -110, hoverY: 300 }); },
    hive: () => { SL.spawnEnemy('hive', { x: 360, y: -120 }); },
    bastion: () => { SL.spawnEnemy('bastion', { x: 360, y: -120, cargo: [['captive', 3], ['crew', 2], ['medical', 2]] }); },
    tug: () => { SL.spawnEnemy('tug', { x: 360, y: -120 }); },
  };
  LE.wave = function (id) {
    clearLab();
    parkPlayers(false);
    LE.mode = 'live';
    const def = SL.enemies.has(id) ? SL.enemies.get(id) : null;
    if (!def || !WAVES[id]) return false;
    LE.items.push(label(360, 150, def.name.toUpperCase(), 'live wave · ' + id, 22, 'rgba(147,160,186,0.95)'));
    WAVES[id]();
    LE.cur = id;
    LE.t = 0;
    return true;
  };
  function liveCount() {
    let n = 0;
    for (const e of SL.world.enemies) if (!e.dead && !(e.data && e.data.specimen)) n++;
    return n;
  }
  SL.debug.sandbox('enemies', () => {
    const P = SL.debug.params || {};
    const only = P.e && WAVES[P.e] ? P.e : null;
    const gridOnly = P.grid === '1';
    let t = 0, phase = only ? 'live' : 'grid', i = 0;
    if (only) LE.wave(only); else LE.grid();
    return (dt) => {
      t += dt;
      if (LE.manual) return;
      if (phase === 'grid') {
        if (!gridOnly && t > num(+P.gridT, 7)) { phase = 'live'; t = 0; LE.wave(ENEMY_IDS[i++ % ENEMY_IDS.length]); }
        return;
      }
      const big = LE.cur === 'hive' || LE.cur === 'bastion' || LE.cur === 'tug';
      if ((t > 3 && liveCount() === 0) || t > (big ? 30 : 16)) {
        t = 0;
        LE.wave(only || ENEMY_IDS[i++ % ENEMY_IDS.length]);
      }
    };
  }, { name: 'Enemy roster', god: true, autopilot: true });

  const FORM_LIST = [
    ['vee', { enemy: 'gnat', count: 7 }], ['line', { enemy: 'dart', count: 6, stagger: 120 }], ['column', { enemy: 'gnat', count: 8, weave: 90 }],
    ['arc_sweep', { enemy: 'gnat', side: 'left', count: 8 }], ['pincer', { enemy: 'gnat', count: 10 }], ['snake', { enemy: 'gnat', count: 8 }],
    ['staircase', { enemy: 'dart', side: 'right' }], ['ring_in', { enemy: 'gnat', count: 10 }], ['side_stream', { enemy: 'gnat', side: 'left', y: 300, count: 9 }],
    ['rain', { enemy: 'gnat', count: 14 }], ['escort_box', { leader: 'manta', escort: 'dart', count: 4 }], ['vee', { enemy: 'dart', count: 5, fromBottom: true }],
  ];
  const LF = lab.formations = { list: FORM_LIST, items: [] };
  LF.run = function (k) {
    for (const l of LF.items) l.dead = true;
    LF.items.length = 0;
    const it = typeof k === 'string' ? FORM_LIST.find((f) => f[0] === k) || [k, {}] : FORM_LIST[k % FORM_LIST.length];
    const fn = SL.formations.get(it[0]);
    if (!fn) return 0;
    const sub = it[1].fromBottom ? 'fromBottom · ' + (it[1].enemy || 'gnat') : (it[0] === 'escort_box' ? it[1].leader + ' + ' + it[1].escort : it[1].enemy || 'gnat');
    LF.items.push(label(360, 150, it[0], sub, 24, 'rgba(147,160,186,0.95)'));
    const out = fn(Object.assign({}, it[1]));
    return out.length;
  };
  SL.debug.sandbox('formations', () => {
    const P = SL.debug.params || {};
    let i = 0, t = 0;
    const only = P.f || null;
    LF.run(only || i++);
    return (dt) => {
      t += dt;
      if (LF.manual) return;
      if ((t > 2.5 && liveCount() === 0) || t > 13) { t = 0; LF.run(only || i++); }
    };
  }, { name: 'Formations', god: true, autopilot: true });
})(window.SL = window.SL || {});
