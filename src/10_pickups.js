/* 10_pickups.js (weapons)
   Provides: SL.pickupTypes credit, credit_big, weapon_up, weapon_pulse, weapon_spread, weapon_lance, missile, shield,
   bomb, repair (GDD 10.2) and SL.pickups = { spawn(id, x, y, opts), drop(e), roll(tableId), tables, spill(x, y, total,
   opts), vacuum(seconds), vacuumActive(), mercy(), CAPSULES, ids }.
   Art: glossy glass power-cell capsules (metal end caps, emissive core, white symbol, orbiting motes, sweeping
   glint), a white-gold diamond chip that flips, and faceted gold crystals pre-rendered in 8 spin frames.
   Rules: capsules drift down at 70 px/s with a sideways drift that bounces off the side edges, live 14 s, magnet 0.6x;
   credits use the full magnet and live 10 s. drop(e) spills e.credits / def.credits ([min, max] or a number; 10-value
   crystals first), then rolls def.dropChance (x1.25 in co-op) on def.dropTable; e.drop (spawn opts.drop) === false
   skips the item, a pickup id forces it, a table id / weight object / true always rolls that table. Mercy rule: while any jet is at hull <= 30%, rolled bombs become repairs. At bossDeath and
   missionOutro every pickup flies to the nearest jet. Sandbox: 'pickups'. */
(function (SL) {
  'use strict';

  const U = SL.util, C = SL.color, A = SL.art;
  const TAU = Math.PI * 2, W = SL.W, H = SL.H;

  // ------------------------------------------------------------------ data (GDD 10.2, 10.3)
  const CAPSULES = {
    weapon_pulse: { color: '#3fc8ff', icon: 'pulse', cap: 'chrome', type: 'pulse' },
    weapon_spread: { color: '#46f0a8', icon: 'spread', cap: 'chrome', type: 'spread' },
    weapon_lance: { color: '#b98bff', icon: 'lance', cap: 'chrome', type: 'lance' },
    missile: { color: '#ff9d4a', icon: 'rocket', cap: 'dark' },
    shield: { color: '#4fb4ff', icon: 'hex', cap: 'white' },
    bomb: { color: '#ff5a4a', icon: 'B', cap: 'dark' },
    repair: { color: '#5dffb0', icon: 'wrench', cap: 'white' },
  };
  const TABLES = {
    drop_small: { weapon_up: 40, missile: 20, shield: 20, bomb: 10, repair: 10 },
    drop_fighter: { weapon_up: 30, weapon_pulse: 10, weapon_spread: 10, weapon_lance: 10, missile: 15, shield: 15, bomb: 5, repair: 5 },
    drop_gunship: { weapon_up: 35, missile: 20, shield: 20, bomb: 10, repair: 15 },
    drop_heavy: { weapon_up: 40, missile: 20, shield: 15, bomb: 15, repair: 10 },
    drop_formation: { weapon_up: 45, weapon_pulse: 10, weapon_spread: 10, weapon_lance: 10, missile: 10, shield: 10, bomb: 5 },
  };
  const IDS = ['credit', 'credit_big', 'weapon_up', 'weapon_pulse', 'weapon_spread', 'weapon_lance', 'missile', 'shield', 'bomb', 'repair'];
  const CAP_LIFE = 14, CREDIT_LIFE = 10, CAP_DRIFT = 70, MERCY_HULL = 0.3, COOP_DROP = 1.25;
  const GOLD = '#ffd34d', CHIP_GLOW = '#ffd27a';

  const sprCache = new Map();
  function spr(key) {
    let s = sprCache.get(key);
    if (!s) { s = A.get(key); sprCache.set(key, s); }
    return s;
  }
  function sfx(id, o) { U.sfx(id, o); }

  // ------------------------------------------------------------------ art: symbols
  /** Strokes a techy capital B or P (vector, so sprites never depend on font loading). */
  function letter(ctx, ch, cx, cy, s) {
    const h = s, w = s * 0.6, x0 = cx - w * 0.5, y0 = cy - h * 0.5;
    const r1 = h * 0.25, bx = x0 + w - r1;
    ctx.lineWidth = s * 0.21;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + h);
    ctx.lineTo(x0, y0);
    ctx.lineTo(bx - (ch === 'P' ? 0 : r1 * 0.2), y0);
    ctx.arc(bx - (ch === 'P' ? 0 : r1 * 0.2), y0 + r1, r1, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x0, y0 + 2 * r1);
    if (ch === 'B') {
      ctx.moveTo(x0, y0 + 2 * r1);
      ctx.lineTo(bx, y0 + 2 * r1);
      ctx.arc(bx, y0 + 3 * r1, r1, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x0, y0 + h);
    }
    ctx.stroke();
  }

  function hexPath(cx, cy, r) {
    const p = new Path2D();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU - Math.PI / 2;
      if (k === 0) p.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else p.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    p.closePath();
    return p;
  }

  function drawIconShape(ctx, icon, cx, cy, fill, glow) {
    const col = glow || fill;
    ctx.save();
    if (glow) {
      ctx.shadowColor = C.mix(glow, '#ffffff', 0.2);
      ctx.shadowBlur = 6;
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.translate(cx, cy);
    ctx.scale(1.08, 1.08);
    ctx.translate(-cx, -cy);
    if (icon === 'pulse') {
      for (const s of [-1, 1]) {
        const x = cx + s * 3.7;
        ctx.beginPath();
        ctx.moveTo(x, cy - 9);
        ctx.lineTo(x + 1.7, cy - 5.6);
        ctx.lineTo(x + 1.7, cy + 8);
        ctx.lineTo(x - 1.7, cy + 8);
        ctx.lineTo(x - 1.7, cy - 5.6);
        ctx.closePath();
        ctx.fill();
      }
    } else if (icon === 'spread') {
      ctx.lineWidth = 1.9;
      const hy = cy + 7;
      for (let k = -2; k <= 2; k++) {
        const a = -Math.PI / 2 + k * 0.43;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 4, hy + Math.sin(a) * 4);
        ctx.lineTo(cx + Math.cos(a) * 14.5, hy + Math.sin(a) * 14.5);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, hy, 2.4, 0, TAU);
      ctx.fill();
    } else if (icon === 'lance') {
      ctx.fillRect(cx - 2.1, cy - 5, 4.2, 14);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx - 5.2, cy - 1);
      ctx.lineTo(cx - 5.2, cy + 9);
      ctx.moveTo(cx + 5.2, cy - 1);
      ctx.lineTo(cx + 5.2, cy + 9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 11.5);
      ctx.lineTo(cx + 2.6, cy - 7.4);
      ctx.lineTo(cx, cy - 4.4);
      ctx.lineTo(cx - 2.6, cy - 7.4);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - 6.2, cy - 7.4);
      ctx.lineTo(cx + 6.2, cy - 7.4);
      ctx.stroke();
    } else if (icon === 'rocket') {
      ctx.translate(cx, cy);
      ctx.rotate(0.62);
      const body = new Path2D();
      body.moveTo(0, -11);
      body.quadraticCurveTo(3.6, -7, 3.2, 2.5);
      body.lineTo(-3.2, 2.5);
      body.quadraticCurveTo(-3.6, -7, 0, -11);
      body.closePath();
      ctx.fill(body);
      ctx.fill(A.poly([3.1, -1.5, 6.4, 4.6, 3.1, 3.4]));
      ctx.fill(A.poly([-3.1, -1.5, -6.4, 4.6, -3.1, 3.4]));
      ctx.globalAlpha = 0.85;
      ctx.fill(A.poly([-2.1, 4, 2.1, 4, 0, 10.5]));
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      if (glow) {
        ctx.fillStyle = C.darken(col, 0.35);
        ctx.beginPath();
        ctx.arc(0, -4.6, 1.5, 0, TAU);
        ctx.fill();
      }
    } else if (icon === 'hex') {
      ctx.lineWidth = 2.3;
      ctx.stroke(hexPath(cx, cy, 9));
      ctx.globalAlpha = 0.9;
      ctx.fill(hexPath(cx, cy, 4.2));
    } else if (icon === 'B' || icon === 'P') {
      letter(ctx, icon, cx + 0.8, cy, 17);
    } else if (icon === 'wrench') {
      ctx.translate(cx, cy + 1);
      ctx.rotate(-Math.PI / 4);
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(0, -1.5);
      ctx.lineTo(0, 10);
      ctx.stroke();
      ctx.lineWidth = 3.3;
      ctx.beginPath();
      ctx.arc(0, -6, 4.6, -Math.PI / 2 + 0.8, -Math.PI / 2 - 0.8 + TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ art: capsules (glass power cells)
  const CAP_STYLE = {
    chrome: { base: '#a8b3c6', light: '#ffffff', dark: '#2c3341' },
    dark: { base: '#3b4151', light: '#a4adc0', dark: '#0b0d13' },
    white: { base: '#dbe2ec', light: '#ffffff', dark: '#56617a' },
  };
  const PW = 46, PH = 28, CAPW = 7;

  function genCapsule(cfg) {
    return (ctx, w, h) => {
      const col = cfg.color, cy = h / 2, st = CAP_STYLE[cfg.cap];
      const deep = C.darken(col, 0.62), mid = C.darken(col, 0.18);
      const body = new Path2D();
      body.roundRect(1, 1, w - 2, h - 2, (h - 2) / 2);
      // saturated glass: bright crown, deep colored belly
      let g = ctx.createLinearGradient(0, 1, 0, h - 1);
      g.addColorStop(0, C.mix(col, '#ffffff', 0.2));
      g.addColorStop(0.35, mid);
      g.addColorStop(0.75, deep);
      g.addColorStop(1, C.darken(col, 0.8));
      ctx.fillStyle = g;
      ctx.fill(body);
      ctx.save();
      ctx.clip(body);
      // energy core behind the symbol (colored, not white, so the white icon stays readable)
      g = ctx.createRadialGradient(w / 2, cy + 1, 0, w / 2, cy + 1, h * 0.62);
      g.addColorStop(0, C.rgba(C.mix(col, '#ffffff', 0.25), 0.7));
      g.addColorStop(0.55, C.rgba(col, 0.3));
      g.addColorStop(1, C.rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // inner rim light along the lower glass edge (refraction)
      const rimIn = new Path2D();
      rimIn.roundRect(3, 3, w - 6, h - 6, (h - 6) / 2);
      ctx.strokeStyle = C.rgba(C.mix(col, '#ffffff', 0.45), 0.55);
      ctx.lineWidth = 1.2;
      ctx.stroke(rimIn);
      // metal end caps
      for (let side = 0; side < 2; side++) {
        const x0 = side ? w - CAPW : 0;
        ctx.save();
        const clip = new Path2D();
        clip.rect(x0, 0, CAPW, h);
        ctx.clip(clip);
        A.metal(ctx, body, { base: st.base, light: st.light, dark: st.dark, angle: -Math.PI / 2 - 0.3, spec: 0.75, specPos: 0.26, edge: 0, rimLight: 0, rim: false, bounds: { x: 0, y: 0, w, h } });
        if (cfg.cap === 'dark') {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = C.mix(col, '#ffd060', 0.4);
          for (let k = -3; k < 4; k++) {
            const sx = x0 + k * 3.6;
            ctx.beginPath();
            ctx.moveTo(sx, h);
            ctx.lineTo(sx + 1.8, h);
            ctx.lineTo(sx + 1.8 + h * 0.4, 0);
            ctx.lineTo(sx + h * 0.4, 0);
            ctx.closePath();
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, 'rgba(255,255,255,0.35)');
          g.addColorStop(0.35, 'rgba(255,255,255,0)');
          g.addColorStop(1, 'rgba(0,0,0,0.55)');
          ctx.fillStyle = g;
          ctx.fillRect(x0, 0, CAPW, h);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 0.7;
        const xx = side ? x0 + CAPW * 0.45 : x0 + CAPW * 0.55;
        ctx.beginPath();
        ctx.moveTo(xx, 0);
        ctx.lineTo(xx, h);
        ctx.stroke();
        ctx.restore();
        // seam: dark groove, light lip, emissive ring
        const sx = side ? w - CAPW : CAPW;
        ctx.fillStyle = 'rgba(4,6,12,0.8)';
        ctx.fillRect(sx - 0.8, 0, 1.6, h);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(side ? sx + 0.8 : sx - 1.5, 0, 0.7, h);
        ctx.fillStyle = C.rgba(C.mix(col, '#ffffff', 0.35), 0.95);
        ctx.fillRect(side ? sx - 2.2 : sx + 0.8, 0, 1.4, h);
      }
      ctx.restore();
      // symbol: dark under-shadow, then white with a colored glow
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.translate(0.7, 1.1);
      drawIconShape(ctx, cfg.icon, w / 2, cy, C.darken(col, 0.85), false);
      ctx.restore();
      drawIconShape(ctx, cfg.icon, w / 2, cy, '#ffffff', col);
      // gloss: thin highlight along the crown and a small hot spot
      ctx.save();
      ctx.clip(body);
      g = ctx.createLinearGradient(0, 2, 0, h * 0.4);
      g.addColorStop(0, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.22, w / 2 - 6, h * 0.12, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(w * 0.27, h * 0.22, 3.2, 1.25, -0.1, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(5,8,14,0.92)';
      ctx.lineWidth = 1.5;
      ctx.stroke(body);
    };
  }

  // ------------------------------------------------------------------ art: weapon_up chip (white-gold diamond with P)
  function genChip(back) {
    return (ctx, w, h) => {
      const cx = w / 2, cy = h / 2, R = w / 2 - 1.5;
      const outer = A.poly([cx, cy - R, cx + R, cy, cx, cy + R, cx - R, cy]);
      A.metal(ctx, outer, {
        base: back ? '#d9a63c' : '#efe0b4', light: '#ffffff', dark: back ? '#5c3a06' : '#7d5d18',
        spec: 0.8, specPos: 0.3, edge: 0.9, rimLight: 1.6, rimWidth: 1.2,
      });
      const ri = R * 0.66;
      const inner = A.poly([cx, cy - ri, cx + ri, cy, cx, cy + ri, cx - ri, cy]);
      // bevel facets between the rims
      ctx.save();
      ctx.clip(outer);
      ctx.strokeStyle = 'rgba(70,44,6,0.4)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const [ax, ay, bx, by] of [[cx, cy - R, cx, cy - ri], [cx + R, cy, cx + ri, cy], [cx, cy + R, cx, cy + ri], [cx - R, cy, cx - ri, cy]]) {
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
      // lower-right bevels in shadow
      ctx.fillStyle = 'rgba(60,36,4,0.28)';
      ctx.fill(A.poly([cx + R, cy, cx, cy + R, cx, cy + ri, cx + ri, cy]));
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill(A.poly([cx - R, cy, cx, cy - R, cx, cy - ri, cx - ri, cy]));
      ctx.restore();
      // recessed face (lit from the lower right: it sits below the bevel)
      A.metal(ctx, inner, {
        base: back ? '#c88a22' : '#fff2cc', light: back ? '#ffe1a0' : '#ffffff', dark: back ? '#6a4208' : '#b88a2a',
        angle: Math.atan2(0.8, 0.6), spec: 0.35, specPos: 0.35, edge: 0.6, rimLight: 0.9, rimWidth: 0.8,
      });
      A.emissive(ctx, inner, '#ffcf5a', 5, { stroke: 1.1 });
      if (!back) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        letter(ctx, 'P', cx + 1.4, cy + 0.6, 15);
        ctx.strokeStyle = '#7a4806';
        letter(ctx, 'P', cx + 0.9, cy, 15);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(255,240,200,0.9)';
        ctx.fill(A.poly([cx, cy - 7, cx + 2, cy - 2, cx + 7, cy, cx + 2, cy + 2, cx, cy + 7, cx - 2, cy + 2, cx - 7, cy, cx - 2, cy - 2]));
      }
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(cx - R * 0.4, cy - R * 0.4, 3.2, 1.3, -Math.PI / 4, 0, TAU);
      ctx.fill();
    };
  }

  // ------------------------------------------------------------------ art: gold crystals (8 spin frames)
  const GEM_FRAMES = 8;
  const GL = (() => { const l = Math.hypot(-0.6, -0.8, 1.2); return [-0.6 / l, -0.8 / l, 1.2 / l]; })();
  const GH = (() => { const x = GL[0], y = GL[1], z = GL[2] + 1, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })();

  function genGem(f, sides, big) {
    return (ctx, w, h) => {
      const cx = w / 2, top = 0.8, bot = h - 0.8, eq = h * 0.4, R = w / 2 - 0.8;
      const phi0 = (f / GEM_FRAMES) * (TAU / sides);
      const V = [];
      for (let k = 0; k < sides; k++) {
        const a = phi0 + (k / sides) * TAU;
        V.push([cx + Math.cos(a) * R, eq, Math.sin(a) * R]);
      }
      const faces = [];
      const T = [cx, top, 0], B = [cx, bot, 0];
      for (let k = 0; k < sides; k++) {
        const p = V[k], q = V[(k + 1) % sides];
        for (const apex of [T, B]) {
          const ux = p[0] - apex[0], uy = p[1] - apex[1], uz = p[2] - apex[2];
          const vx = q[0] - apex[0], vy = q[1] - apex[1], vz = q[2] - apex[2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          // orient outward (away from the gem's axis center)
          const mx = (p[0] + q[0] + apex[0]) / 3 - cx, my = (p[1] + q[1] + apex[1]) / 3 - eq, mz = (p[2] + q[2] + apex[2]) / 3;
          if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l; ny /= l; nz /= l;
          if (nz <= 0.02) continue;
          faces.push({ pts: [[apex[0], apex[1]], [p[0], p[1]], [q[0], q[1]]], d: Math.max(0, nx * GL[0] + ny * GL[1] + nz * GL[2]), s: Math.pow(Math.max(0, nx * GH[0] + ny * GH[1] + nz * GH[2]), 18) });
        }
      }
      const dark = big ? '#8a4f04' : '#7a4806', base = big ? '#ffc93a' : '#f2b928', light = '#fff7cf';
      for (const fc of faces) {
        const path = A.poly(fc.pts);
        const k = fc.d;
        let col = k < 0.55 ? C.mix(dark, base, k / 0.55) : C.mix(base, light, Math.min(1, (k - 0.55) / 0.45));
        if (fc.s > 0.02) col = C.mix(col, '#ffffff', Math.min(1, fc.s * 1.2));
        ctx.fillStyle = col;
        ctx.fill(path);
        ctx.strokeStyle = 'rgba(255,240,190,0.55)';
        ctx.lineWidth = 0.55;
        ctx.stroke(path);
      }
      // inner fire: a soft hot core through the facets
      const g = ctx.createRadialGradient(cx, eq + 1, 0, cx, eq + 1, w * 0.42);
      g.addColorStop(0, 'rgba(255,255,230,0.55)');
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      // dark outline keeps the gem readable on bright backgrounds
      ctx.strokeStyle = 'rgba(70,36,2,0.75)';
      ctx.lineWidth = 0.8;
      let minX = Infinity, maxX = -Infinity;
      for (const v of V) { if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0]; }
      ctx.stroke(A.poly([cx, top, maxX, eq, cx, bot, minX, eq]));
    };
  }

  // ------------------------------------------------------------------ art: small effect sprites
  function genMote(ctx, w, h) {
    const cx = w / 2, cy = h / 2;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const r of [0, Math.PI / 2]) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(r);
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.5, w * 0.045, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  function genRays(ctx, w, h) {
    const cx = w / 2, cy = h / 2;
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 6; k++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((k / 6) * TAU);
      const g = ctx.createLinearGradient(0, 0, w / 2, 0);
      g.addColorStop(0, 'rgba(255,236,170,0.9)');
      g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w / 2, -w * 0.07);
      ctx.lineTo(w / 2, w * 0.07);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  const CAP_KEYS = {}, GEM_SMALL = [], GEM_BIG = [];
  for (const id of Object.keys(CAPSULES)) {
    CAP_KEYS[id] = 'pk:' + id;
    A.define(CAP_KEYS[id], PW, PH, genCapsule(CAPSULES[id]), { pad: 3, res: 2 });
  }
  A.define('pk:chip', 38, 38, genChip(false), { pad: 3, res: 2 });
  A.define('pk:chip_b', 38, 38, genChip(true), { pad: 3, res: 2 });
  for (let f = 0; f < GEM_FRAMES; f++) {
    GEM_SMALL[f] = 'pk:credit:' + f;
    GEM_BIG[f] = 'pk:credit_big:' + f;
    A.define(GEM_SMALL[f], 13, 19, genGem(f, 6, false), { pad: 1, res: 3 });
    A.define(GEM_BIG[f], 21, 30, genGem(f, 6, true), { pad: 1, res: 3 });
  }
  A.define('pk:mote', 16, 16, genMote, { pad: 0, res: 1 });
  A.define('pk:rays', 96, 96, genRays, { pad: 0, res: 1 });

  // ------------------------------------------------------------------ drawing (live overlays)
  function addSprite(ctx, key, x, y, rot, scale, alpha) {
    const po = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    A.drawSprite(ctx, spr(key), x, y, rot, scale, alpha);
    ctx.globalCompositeOperation = po;
  }
  function mote(ctx, x, y, color, a, s) {
    A.drawGlow(ctx, x, y, 9 * s, color, a * 0.8);
    addSprite(ctx, 'pk:mote', x, y, 0, 0.75 * s, a);
  }

  function drawCapsule(pk, ctx) {
    const cfg = pk.def.cfg, t = pk.age + pk.bob;
    const x = pk.x, y = pk.y + Math.sin(t * 3.1) * 3.5;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.2);
    A.drawGlow(ctx, x, y, 40 + 8 * pulse, cfg.color, 0.36 + 0.18 * pulse);
    // two motes orbit the cell (spin): the far one passes behind it
    const a = t * 2.5, ca = Math.cos(a), sa = Math.sin(a);
    const fx = x + ca * 29, fy = y + sa * 8, bx = x - ca * 29, by = y - sa * 8;
    const frontA = sa > 0;
    mote(ctx, frontA ? bx : fx, frontA ? by : fy, cfg.color, 0.4, 0.8);
    const rot = Math.sin(t * 1.9) * 0.13;
    A.drawSprite(ctx, spr(pk.def.key), x, y, rot, 1, 1);
    // glint sweeping across the glass
    const g = (t * 0.42) % 1;
    if (g < 0.3) {
      const k = g / 0.3, gx = x + (k - 0.5) * 26 * Math.cos(rot), gy = y - 6.5 + (k - 0.5) * 26 * Math.sin(rot);
      addSprite(ctx, 'pk:mote', gx, gy, 0, 0.9, Math.sin(k * Math.PI) * 0.9);
    }
    mote(ctx, frontA ? fx : bx, frontA ? fy : by, cfg.color, 0.95, 1);
  }

  function drawChip(pk, ctx) {
    const t = pk.age + pk.bob, x = pk.x, y = pk.y + Math.sin(t * 2.9) * 3.5;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.6);
    addSprite(ctx, 'pk:rays', x, y, t * 0.7, 0.62 + 0.06 * pulse, 0.32 + 0.12 * pulse);
    A.drawGlow(ctx, x, y, 44 + 8 * pulse, CHIP_GLOW, 0.42 + 0.2 * pulse);
    // coin flip: dwell facing front, then a quick turn
    const ph = (t * 0.4) % 1, ang = ph < 0.66 ? 0 : ((ph - 0.66) / 0.34) * TAU;
    const c = Math.cos(ang), sx = Math.max(0.06, Math.abs(c));
    const s = spr(c >= 0 ? 'pk:chip' : 'pk:chip_b');
    SL.render.setTransform(ctx, x, y, 0, sx, 1);
    ctx.drawImage(s.canvas, -s.cw / 2, -s.ch / 2, s.cw, s.ch);
    if (sx < 0.35) {
      // the chip's gold edge shows while it is side-on
      ctx.fillStyle = 'rgba(255,214,120,0.95)';
      ctx.fillRect(-1.6 / sx, -s.h * 0.48, 3.2 / sx, s.h * 0.96);
    }
    SL.render.resetTransform(ctx);
    const tw = (t * 0.55) % 1;
    if (tw < 0.22) addSprite(ctx, 'pk:mote', x - 8, y - 9, 0, 1.2, Math.sin((tw / 0.22) * Math.PI));
  }

  function drawCredit(pk, ctx) {
    const big = pk.def.big, keys = big ? GEM_BIG : GEM_SMALL;
    const sp = pk.data.vac ? 3.2 : big ? 1.1 : 1.5;
    const f = Math.floor((pk.age * sp + pk.bob) * GEM_FRAMES) % GEM_FRAMES;
    const tw = 0.5 + 0.5 * Math.sin(pk.age * 7 + pk.bob * 3);
    A.drawGlow(ctx, pk.x, pk.y, big ? 30 : 17, GOLD, (big ? 0.46 : 0.36) + 0.14 * tw);
    A.drawSprite(ctx, spr(keys[f]), pk.x, pk.y, 0, 1, 1);
    if (big) {
      const k = (pk.age * 0.8 + pk.bob) % 1;
      if (k < 0.2) addSprite(ctx, 'pk:mote', pk.x + 4, pk.y - 7, 0, 1.15, Math.sin((k / 0.2) * Math.PI));
    }
  }

  // ------------------------------------------------------------------ vacuum + movement
  const VAC = { until: -1 };
  function vacuumActive() { return SL.time.t < VAC.until; }
  function vacuum(seconds) {
    const s = seconds == null ? 6 : seconds;
    VAC.until = s === Infinity ? Infinity : Math.max(VAC.until, SL.time.t + s);
  }

  function vacuumStep(pk, dt) {
    const p = SL.world.nearestPlayer(pk.x, pk.y);
    if (!p) return false;
    const d = pk.data;
    d.vac = true;
    d.vacT = (d.vacT || 0) + dt;
    if (pk.life) pk.life = Math.max(pk.life, pk.age + 3);
    const dx = p.x - pk.x, dy = p.y - pk.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const sp = 520 + Math.min(1, d.vacT / 0.45) * 1280;
    const k = Math.min(1, dt * 10);
    pk.vx += ((dx / dist) * sp - pk.vx) * k;
    pk.vy += ((dy / dist) * sp - pk.vy) * k;
    return true;
  }

  function updatePickup(pk, dt) {
    const d = pk.data;
    if (d.display) {
      pk.x = d.hx;
      pk.y = d.hy;
      pk.vx = pk.vy = 0;
      return;
    }
    if ((d.vac || VAC.until > SL.time.t) && vacuumStep(pk, dt)) return;
    if (pk.def.capsule) {
      pk.vx = U.approach(pk.vx, d.dvx || 0, 150 * dt);
      pk.vy = U.approach(pk.vy, CAP_DRIFT, 240 * dt);
      const m = pk.r + 8;
      if (pk.x < m && pk.vx < 0) { pk.vx = -pk.vx; d.dvx = Math.abs(d.dvx || 40); }
      else if (pk.x > W - m && pk.vx > 0) { pk.vx = -pk.vx; d.dvx = -Math.abs(d.dvx || 40); }
    } else {
      const f = 1 / (1 + 2.6 * dt);
      pk.vx *= f;
      pk.vy = U.approach(pk.vy, 80, 330 * dt);
    }
  }

  function initCapsule(pk, o) {
    const d = pk.data;
    if (o && o.display) { d.display = true; d.hx = pk.x; d.hy = pk.y; return; }
    const dir = o && o.vx ? Math.sign(o.vx) : SL.rng.chance(0.5) ? -1 : 1;
    d.dvx = dir * (28 + SL.rng.next() * 30);
  }
  function initCredit(pk, o) {
    if (!o || o.value == null) pk.value = pk.def.big ? 10 : 1;
    if (o && o.display) { pk.data.display = true; pk.data.hx = pk.x; pk.data.hy = pk.y; }
  }

  // ------------------------------------------------------------------ apply (GDD 10.2)
  const LBL = [{ t: -9, n: 0 }, { t: -9, n: 0 }];
  function label(p, text, color) {
    // labels that pop close together stack upward instead of overprinting
    const L = LBL[p.index ? 1 : 0], now = SL.time.real;
    L.n = now - L.t < 0.45 ? Math.min(4, L.n + 1) : 0;
    L.t = now;
    SL.fx.text(p.x, p.y - 52 - L.n * 27, text, { color: C.mix(color, '#ffffff', 0.35), size: 25, life: 1.05, rise: 58, weight: 800 });
  }
  function collectFx(pk, p, color) {
    SL.fx.emit({ x: pk.x, y: pk.y, shape: 'ring', size: 16, size2: 92, life: 0.3, color, alpha: 0.85 });
    SL.fx.emit({ x: pk.x, y: pk.y, shape: 'glow', size: 70, size2: 10, life: 0.22, color, alpha: 0.9 });
    SL.fx.sparks(pk.x, pk.y, { count: 10, color: C.mix(color, '#ffffff', 0.4), speed: 340, life: 0.32, size: 4 });
    if (p) SL.fx.emit({ x: p.x, y: p.y, shape: 'ring', size: 40, size2: 120, life: 0.35, color, alpha: 0.5 });
  }
  function mult() { const s = SL.game && SL.game.session; return (s && s.mult) || 1; }
  function bonus(p, pts) { if (SL.game && SL.game.addScore) SL.game.addScore(pts, p.x, p.y - 22); }

  function weaponMaxBonus(p) {
    bonus(p, 2000 * mult());
    if (SL.game && SL.game.addCredits) SL.game.addCredits(20, p.x + 30, p.y - 4, p);
    label(p, 'MAX POWER', '#ffe9a0');
    sfx('weapon_max', { x: p.x });
  }
  function levelUp(p) {
    if (SL.weapons && SL.weapons.levelUp) return SL.weapons.levelUp(p);
    if (p.weapon.level >= 5) return false;
    p.weapon.level++;
    return true;
  }
  function applyWeaponUp(p, pk) {
    collectFx(pk, p, CHIP_GLOW);
    if ((p.weapon.level | 0) >= 5) { weaponMaxBonus(p); return; }
    levelUp(p);
    label(p, 'POWER UP', '#ffe9a0');
    sfx(p.weapon.level >= 5 ? 'weapon_max' : 'powerup', { x: p.x });
  }
  function applyWeaponType(p, pk) {
    const cfg = pk.def.cfg, type = cfg.type;
    collectFx(pk, p, cfg.color);
    if (p.weapon.type === type) {
      if ((p.weapon.level | 0) >= 5) { weaponMaxBonus(p); return; }
      levelUp(p);
    } else if (SL.weapons && SL.weapons.setType) SL.weapons.setType(p, type);
    else p.weapon.type = type;
    label(p, type.toUpperCase() + ' L' + (p.weapon.level | 0), cfg.color);
    sfx(p.weapon.level >= 5 ? 'weapon_max' : 'powerup', { x: p.x });
  }
  function applyMissile(p, pk) {
    collectFx(pk, p, CAPSULES.missile.color);
    if ((p.missiles | 0) >= 3) { bonus(p, 1000); sfx('powerup', { x: p.x }); return; }
    if (SL.weapons && SL.weapons.addMissile) SL.weapons.addMissile(p); else p.missiles = (p.missiles | 0) + 1;
    label(p, 'MISSILES L' + (p.missiles | 0), CAPSULES.missile.color);
    sfx('powerup', { x: p.x });
  }
  function applyShield(p, pk) {
    collectFx(pk, p, CAPSULES.shield.color);
    if (p.shield >= p.maxShield) { bonus(p, 500); sfx('shield_up', { x: p.x }); return; }
    SL.player.addShield(p, 40);
    label(p, 'SHIELD +40', CAPSULES.shield.color);
    sfx('shield_up', { x: p.x });
  }
  function applyBomb(p, pk) {
    collectFx(pk, p, CAPSULES.bomb.color);
    if (!SL.player.addBomb(p, 1)) { bonus(p, 2000); sfx('bomb_pickup', { x: p.x }); return; }
    label(p, 'BOMB +1', CAPSULES.bomb.color);
    sfx('bomb_pickup', { x: p.x });
  }
  function applyRepair(p, pk) {
    collectFx(pk, p, CAPSULES.repair.color);
    if (p.hull >= p.maxHull) { bonus(p, 500); sfx('repair', { x: p.x }); return; }
    SL.player.heal(p, 35);
    label(p, 'REPAIR +35', CAPSULES.repair.color);
    sfx('repair', { x: p.x });
  }

  const COMBO = { t: -9, n: 0 };
  function applyCredit(p, pk) {
    const big = pk.def.big;
    const now = SL.time.real;
    COMBO.n = now - COMBO.t < 0.35 ? Math.min(14, COMBO.n + 1) : 0;
    COMBO.t = now;
    if (SL.game && SL.game.addCredits) SL.game.addCredits(pk.value || (big ? 10 : 1), big ? pk.x : null, big ? pk.y : null, p);
    SL.fx.emit({ x: pk.x, y: pk.y, shape: 'glow', size: big ? 46 : 26, size2: 4, life: 0.16, color: GOLD, alpha: 0.9 });
    if (big) SL.fx.sparks(pk.x, pk.y, { count: 6, color: '#ffe9a0', speed: 260, life: 0.25, size: 3.5 });
    sfx(big ? 'credit_big' : 'credit', { x: pk.x, pitch: 1 + COMBO.n * 0.045, vol: big ? 0.7 : 0.5 });
  }

  // ------------------------------------------------------------------ type definitions
  for (const id of Object.keys(CAPSULES)) {
    const cfg = CAPSULES[id];
    const apply = cfg.type ? applyWeaponType : id === 'missile' ? applyMissile : id === 'shield' ? applyShield : id === 'bomb' ? applyBomb : applyRepair;
    SL.pickupTypes.define(id, {
      r: 22, magnet: 0.6, life: CAP_LIFE, capsule: true, cfg, key: CAP_KEYS[id], sprite: CAP_KEYS[id], color: cfg.color,
      init: initCapsule, update: updatePickup, draw: drawCapsule, apply,
    });
  }
  SL.pickupTypes.define('weapon_up', {
    r: 22, magnet: 0.6, life: CAP_LIFE, capsule: true, sprite: 'pk:chip', color: CHIP_GLOW,
    init: initCapsule, update: updatePickup, draw: drawChip, apply: applyWeaponUp,
  });
  SL.pickupTypes.define('credit', {
    r: 12, magnet: true, life: CREDIT_LIFE, big: false, sprite: GEM_SMALL[0], color: GOLD,
    init: initCredit, update: updatePickup, draw: drawCredit, apply: applyCredit,
  });
  SL.pickupTypes.define('credit_big', {
    r: 16, magnet: true, life: CREDIT_LIFE, big: true, sprite: GEM_BIG[0], color: GOLD,
    init: initCredit, update: updatePickup, draw: drawCredit, apply: applyCredit,
  });

  // ------------------------------------------------------------------ drops (GDD 10.3)
  function mercy() {
    for (const p of SL.world.players) {
      if (!p.alive || p.down || p.display || !(p.maxHull > 0)) continue;
      if (p.hull <= p.maxHull * MERCY_HULL) return true;
    }
    return false;
  }

  function roll(tableId) {
    const t = typeof tableId === 'object' && tableId ? tableId : TABLES[tableId];
    if (!t) { U.warnOnce('pk-table:' + tableId, 'SL.pickups.roll: unknown drop table "' + tableId + '"'); return null; }
    let sum = 0, last = null;
    for (const k in t) if (t[k] > 0) { sum += t[k]; last = k; }
    if (!last) return null;
    let r = SL.rng.next() * sum, pick = last;
    for (const k in t) {
      if (!(t[k] > 0)) continue;
      r -= t[k];
      if (r < 0) { pick = k; break; }
    }
    if (pick === 'bomb' && mercy()) pick = 'repair';
    return pick;
  }

  function spawn(id, x, y, opts) {
    return SL.world.spawnPickup(id, x, y, opts || {});
  }

  function spillOne(id, x, y, r, value) {
    const rng = SL.rng, a = -Math.PI / 2 + (rng.next() - 0.5) * 2.6, sp = (id === 'credit_big' ? 130 : 150) + rng.next() * 190;
    const ox = (rng.next() - 0.5) * r, oy = (rng.next() - 0.5) * r;
    return spawn(id, x + ox, y + oy, { value, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
  }

  /** Spills `total` credits as crystals at (x, y): 10-value crystals first, at most ~40 crystals. */
  function spill(x, y, total, o) {
    total = Math.round(total);
    if (!(total > 0)) return 0;
    const r = Math.min(80, (o && o.r) || 20);
    let bigVal = 10, big = Math.floor(total / 10);
    if (big > 30) { bigVal = Math.ceil(total / 30); big = Math.floor(total / bigVal); }
    const small = Math.min(12, total - big * bigVal);
    let n = 0;
    for (let i = 0; i < big; i++) if (!spillOne('credit_big', x, y, r, bigVal).dead) n++;
    for (let i = 0; i < small; i++) if (!spillOne('credit', x, y, r, 1).dead) n++;
    return n;
  }

  function dropItem(id, x, y) {
    if (!id) return null;
    const rng = SL.rng;
    return spawn(id, x, y, { vx: (rng.next() - 0.5) * 80, vy: -110 });
  }

  function drop(e) {
    if (!e) return;
    const def = e.def || {};
    const rng = SL.rng;
    const cr = e.credits != null ? e.credits : def.credits;
    let total = 0;
    if (Array.isArray(cr)) total = rng.int(cr[0] | 0, (cr[1] != null ? cr[1] : cr[0]) | 0);
    else if (typeof cr === 'number') total = Math.round(cr);
    if (total > 0) spill(e.x, e.y, total, { r: e.r });
    if (e.drop === false) return;
    // opts.drop: a pickup id (always dropped), a drop-table id (always rolled) or true (always roll the def's table)
    if (typeof e.drop === 'string') { dropItem(TABLES[e.drop] ? roll(e.drop) : e.drop, e.x, e.y); return; }
    if (e.drop && typeof e.drop === 'object') { dropItem(roll(e.drop), e.x, e.y); return; }
    const table = e.dropTable || def.dropTable;
    if (e.drop === true) { dropItem(roll(table || 'drop_small'), e.x, e.y); return; }
    if (table) {
      let ch = e.dropChance != null ? e.dropChance : def.dropChance != null ? def.dropChance : 0.1;
      if (ch > 1) ch /= 100;
      if (SL.game && SL.game.coop) ch *= COOP_DROP;
      if (rng.next() < ch) dropItem(roll(table), e.x, e.y);
      return;
    }
    // legacy stub format: def.drops = 'id' | [{id, chance}]
    const d = def.drops;
    if (!d) return;
    const list = Array.isArray(d) ? d : [d];
    for (const it of list) {
      const id = typeof it === 'string' ? it : it && it.id;
      const chance = typeof it === 'string' ? 1 : it && it.chance != null ? it.chance : 1;
      if (id && rng.chance(chance)) { dropItem(id, e.x, e.y); break; }
    }
  }

  SL.pickups = { spawn, drop, roll, tables: TABLES, spill, vacuum, vacuumActive, mercy, CAPSULES, ids: IDS };

  // boss and outro credit vacuum (GDD 10.3)
  SL.bus.on('bossDeath', () => vacuum(8));
  SL.bus.on('bossDefeated', () => { if (VAC.until !== Infinity) VAC.until = Math.min(VAC.until, SL.time.t + 1.5); });
  SL.bus.on('missionOutro', () => vacuum(Infinity));
  SL.bus.on('missionStart', () => { VAC.until = -1; });
  SL.bus.on('worldReset', () => { VAC.until = -1; });

  SL.onBoot(() => {
    const keys = ['pk:chip', 'pk:chip_b', 'pk:mote', 'pk:rays'].concat(GEM_SMALL, GEM_BIG);
    for (const id of Object.keys(CAP_KEYS)) keys.push(CAP_KEYS[id]);
    A.prewarm(keys);
  });

  // ------------------------------------------------------------------ sandbox: labeled grid + live drops
  const NAMES = {
    weapon_up: ['WEAPON UP', '+1 level  ·  max: MAX POWER'],
    weapon_pulse: ['PULSE', 'twin lasers'],
    weapon_spread: ['SPREAD', 'fan of darts'],
    weapon_lance: ['LANCE', 'piercing beam'],
    missile: ['MISSILE', 'missiles +1'],
    shield: ['SHIELD', '+40 shield'],
    bomb: ['BOMB', '+1 bomb'],
    repair: ['REPAIR', '+35 hull'],
    credit: ['CREDIT', 'value 1'],
    credit_big: ['CREDIT BIG', 'value 10'],
  };
  const DUMMY = {
    id: 'pk_dummy', name: 'Cargo drone', hp: 1, r: 26, score: 0, noCount: true, noClear: true, offscreenKill: false,
    manualMove: true, credits: [24, 34], dropTable: 'drop_fighter', dropChance: 1, sprite: 'wpn:target',
    update(e) { e.x = e.params.hx + Math.sin(e.age * 1.3) * 20; e.y = e.params.hy; },
  };

  if (SL.debug && SL.debug.sandbox) {
    SL.debug.sandbox('pickups', () => {
      const ps = SL.world.players.filter((q) => !q.display);
      for (const q of ps) q.data.wpnSafe = true;
      const cols = [130, 290, 450, 610];
      const order = ['weapon_up', 'weapon_pulse', 'weapon_spread', 'weapon_lance', 'missile', 'shield', 'bomb', 'repair', 'credit', 'credit_big'];
      const cells = order.map((id, i) => {
        const row = i < 8 ? (i / 4) | 0 : 2;
        const x = i < 8 ? cols[i % 4] : (i === 8 ? 290 : 450);
        const y = 250 + row * 190;
        spawn(id, x, y, { display: true, life: 0, value: id === 'credit_big' ? 10 : 1 });
        return { id, x, y };
      });
      SL.spawnProp({
        r: 1, update() {},
        draw(pr, ctx) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '800 26px Oxanium, "Segoe UI", sans-serif';
          ctx.fillStyle = '#e8eef7';
          ctx.fillText('PICKUPS', W / 2, 142);
          for (const c of cells) {
            const n = NAMES[c.id], col = (CAPSULES[c.id] && CAPSULES[c.id].color) || (c.id === 'weapon_up' ? CHIP_GLOW : GOLD);
            ctx.font = '700 17px Oxanium, "Segoe UI", sans-serif';
            ctx.fillStyle = C.mix(col, '#ffffff', 0.35);
            ctx.fillText(n[0], c.x, c.y + 50);
            ctx.font = '600 14px "Barlow Semi Condensed", "Segoe UI", sans-serif';
            ctx.fillStyle = '#93a0ba';
            ctx.fillText(n[1], c.x, c.y + 70);
            ctx.fillText(c.id, c.x, c.y + 88);
          }
          ctx.font = '600 15px "Barlow Semi Condensed", "Segoe UI", sans-serif';
          ctx.fillStyle = '#93a0ba';
          ctx.fillText('live: cargo drones burst into credits + a drop_fighter item; the jet sweeps them up (magnet)', W / 2, 860);
          ctx.restore();
        },
      }, { x: W / 2, y: 40 });
      let t = 0, k = 0;
      return (dt) => {
        t += dt;
        // a cargo drone pops every 2.6 s and the jet sweeps across to collect the spill
        if (t > 1.0) {
          t -= 2.6;
          const e = SL.spawnEnemy(DUMMY, { x: 360, y: 960, noCount: true, offscreenKill: false, params: { hx: 200 + (k % 3) * 160, hy: 960 } });
          k++;
          SL.after(0.35, () => { if (!e.dead) SL.world.kill(e, ps[0]); });
        }
        const p = ps[0];
        if (p && p.alive) {
          const tx = 360 + Math.sin(SL.time.t * 0.9) * 230, ty = 1080 + Math.sin(SL.time.t * 1.7) * 60;
          SL.input.inject(p.index, { mx: U.clamp((tx - p.x) / 40, -1, 1), my: U.clamp((ty - p.y) / 40, -1, 1) });
        }
      };
    }, { name: 'Pickups', god: true });
  }
})(window.SL = window.SL || {});
