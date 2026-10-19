/* 09_weapons.js (weapons)
   Provides: SL.weapons = { update(p, dt), drawShip(p, ctx), setType(p, type), levelUp(p), onPlayerDown(p),
   addMissile(p), levelDown(p), fireMissile(p, x, y, angle, dmg, opts), drawJet(ctx, opts), label(p), dps(type, level),
   linked(p), twinLink, TYPES, PULSE, SPREAD, LANCE, MISSILES, debugSet(index, type, level, missiles) }.
   Player bullet types pulse, spread, missile (SL.pbulletTypes); player beams lance and twin_link (SL.world.beams).
   Jet art: XF-9 Starlance (P1) and XF-9B Sunlance (P2), 9 bank frames each rendered from a small 3D model (rolled
   projection, per-part lighting, moving canopy/spine/fins), plus live engine plumes with afterburner, nav lights,
   canopy glint, breathing trim glow, muzzle flashes and low-hull damage. Numbers follow GDD 10.1 and 12.
   Cross-module: reads p.data.ionJamT (hazards) and p.data.overdrive (progress); emits weaponChange, weaponMax and
   twinLink on SL.bus. Sandboxes: weapons, twinlink, jets. */
(function (SL) {
  'use strict';

  const U = SL.util, C = SL.color, A = SL.art;
  const TAU = Math.PI * 2, W = SL.W, H = SL.H;
  const UP = -Math.PI / 2;

  // ------------------------------------------------------------------ numbers (GDD 10.1, Pilot)
  const TYPES = ['pulse', 'spread', 'lance'];
  // layout rows: [x offset, gun y (relative to the jet center), angle offset, thickness]
  const PULSE = {
    bolts: [2, 3, 4, 5, 6], rate: [10, 10.5, 11, 11.5, 12], dmg: [7, 6, 5.5, 5, 4.6], speed: 1400,
    layout: [
      [[-6.5, -24, 0, 1], [6.5, -24, 0, 1]],
      [[-7.5, -24, 0, 1], [0, -50, 0, 1.15], [7.5, -24, 0, 1]],
      [[-16, -2, 0, 1], [-6.5, -24, 0, 1], [6.5, -24, 0, 1], [16, -2, 0, 1]],
      [[-17, -2, 0, 1], [-7, -24, 0, 1], [0, -50, 0, 1.6], [7, -24, 0, 1], [17, -2, 0, 1]],
      [[-27, 10, -0.08, 1], [-16, -2, 0, 1], [-3.6, -48, 0, 1.25], [3.6, -48, 0, 1.25], [16, -2, 0, 1], [27, 10, 0.08, 1]],
    ],
  };
  const SPREAD = { rays: [3, 5, 5, 7, 9], arc: [0.30, 0.45, 0.55, 0.70, 0.85], rate: [7, 7.5, 8, 8.5, 9], dmg: [6.5, 5.2, 5.8, 4.8, 4.2], speed: 1250 };
  const LANCE = { width: [10, 14, 18, 24, 30], dps: [120, 160, 200, 240, 280], length: 1400 };
  const MISSILES = { count: [0, 2, 3, 4], every: [0, 1.0, 0.8, 0.75], dmg: [0, 20, 20, 21], speed: 520, maxSpeed: 900, accel: 1100, turn: 4 };
  const LINK_CFG = { form: 160, hold: 220, time: 1.0, bonus: 1.15, dps: 60, width: 6 };
  const OD_RATE = 1.5, OD_DMG = 1.25;

  function dps(type, level) {
    const i = U.clamp(level | 0, 1, 5) - 1;
    if (type === 'spread') return SPREAD.rays[i] * SPREAD.rate[i] * SPREAD.dmg[i];
    if (type === 'lance') return LANCE.dps[i];
    if (type === 'missile') { const m = U.clamp(level | 0, 0, 3); return m ? MISSILES.count[m] * MISSILES.dmg[m] / MISSILES.every[m] : 0; }
    return PULSE.bolts[i] * PULSE.rate[i] * PULSE.dmg[i];
  }

  // ------------------------------------------------------------------ shot skins
  // 0 = P1 cyan/white, 1 = P2 gold/white, 2 = overdrive white-gold
  const SKINS = [
    { halo: '#3fc8ff', body: '#a8ecff', spark: '#7fe3ff', deep: '#1d7fd0' },
    { halo: '#ffb53f', body: '#ffe0a0', spark: '#ffd27a', deep: '#d07a12' },
    { halo: '#ffcf5a', body: '#fff6dc', spark: '#ffe9a0', deep: '#ffad2a' },
  ];

  function overdriveOf(p) {
    const v = p && p.data && p.data.overdrive;
    return v ? v : null;
  }
  function skinOf(p) { return overdriveOf(p) ? 2 : (p && p.index ? 1 : 0); }

  // ------------------------------------------------------------------ sprite art: shots and effects
  /** Pulse laser bolt pointing +x: saturated halo, glassy body, white-hot core line and head. */
  function genBolt(sk) {
    return (ctx, w, h) => {
      const cy = h / 2, bt = h * 0.2, head = w * 0.88;
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(w * 0.6, cy);
      ctx.scale(w * 0.5, h * 0.5);
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, C.rgba(sk.halo, 0.72));
      g.addColorStop(0.5, C.rgba(sk.halo, 0.26));
      g.addColorStop(1, C.rgba(sk.halo, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
      g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, C.rgba(sk.halo, 0));
      g.addColorStop(0.28, C.rgba(sk.halo, 0.6));
      g.addColorStop(0.62, C.rgba(sk.body, 0.95));
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(w * 0.03, cy);
      ctx.bezierCurveTo(w * 0.3, cy - bt * 0.45, w * 0.58, cy - bt, head, cy - bt);
      ctx.arc(head, cy, bt, -Math.PI / 2, Math.PI / 2);
      ctx.bezierCurveTo(w * 0.58, cy + bt, w * 0.3, cy + bt * 0.45, w * 0.03, cy);
      ctx.fill();
      g = ctx.createLinearGradient(w * 0.3, 0, w * 0.95, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(w * 0.64, cy, w * 0.3, bt * 0.42, 0, 0, TAU);
      ctx.fill();
      const hr = bt * 2.3;
      g = ctx.createRadialGradient(head, cy, 0, head, cy, hr);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, C.rgba(sk.body, 0.6));
      g.addColorStop(1, C.rgba(sk.halo, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(head, cy, hr, 0, TAU);
      ctx.fill();
    };
  }

  /** Spread energy dart pointing +x: swallow-tailed plasma arrowhead with a short streak. */
  function genDart(sk) {
    return (ctx, w, h) => {
      const cy = h / 2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(w * 0.62, cy);
      ctx.scale(w * 0.42, h * 0.5);
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, C.rgba(sk.halo, 0.78));
      g.addColorStop(0.55, C.rgba(sk.halo, 0.24));
      g.addColorStop(1, C.rgba(sk.halo, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
      g = ctx.createLinearGradient(0, 0, w * 0.5, 0);
      g.addColorStop(0, C.rgba(sk.halo, 0));
      g.addColorStop(1, C.rgba(sk.halo, 0.75));
      ctx.fillStyle = g;
      ctx.fillRect(0, cy - h * 0.06, w * 0.5, h * 0.12);
      const tip = w * 0.97, mid = w * 0.6, tail = w * 0.3, hw = h * 0.28;
      g = ctx.createLinearGradient(tail, 0, tip, 0);
      g.addColorStop(0, C.rgba(sk.halo, 0.9));
      g.addColorStop(0.5, C.rgba(sk.body, 1));
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(tip, cy);
      ctx.quadraticCurveTo(mid + (tip - mid) * 0.35, cy - hw, mid, cy - hw);
      ctx.lineTo(tail, cy - hw * 0.42);
      ctx.lineTo(tail + w * 0.08, cy);
      ctx.lineTo(tail, cy + hw * 0.42);
      ctx.lineTo(mid, cy + hw);
      ctx.quadraticCurveTo(mid + (tip - mid) * 0.35, cy + hw, tip, cy);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(w * 0.73, cy, w * 0.17, hw * 0.4, 0, 0, TAU);
      ctx.fill();
    };
  }

  /** Four-point star flare (impacts, muzzle, glints). */
  function genStar(color, spikes) {
    return (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      ctx.globalCompositeOperation = 'lighter';
      let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.16, C.rgba(C.mix(color, '#ffffff', 0.5), 0.85));
      g.addColorStop(0.42, C.rgba(color, 0.28));
      g.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let k = 0; k < spikes; k++) {
        const a = (k / spikes) * Math.PI;
        const len = (k % 2 ? 0.34 : 0.5) * w;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        g = ctx.createLinearGradient(-len, 0, len, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, len, w * 0.035, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    };
  }

  /** Muzzle flash pointing up (-y): hot teardrop with side spikes. */
  function genMuzzle(sk) {
    return (ctx, w, h) => {
      const cx = w / 2, by = h * 0.78;
      ctx.globalCompositeOperation = 'lighter';
      let g = ctx.createRadialGradient(cx, by, 0, cx, by, w * 0.5);
      g.addColorStop(0, C.rgba(sk.body, 0.9));
      g.addColorStop(0.5, C.rgba(sk.halo, 0.3));
      g.addColorStop(1, C.rgba(sk.halo, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      g = ctx.createLinearGradient(0, by, 0, 0);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, C.rgba(sk.body, 0.75));
      g.addColorStop(1, C.rgba(sk.halo, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.quadraticCurveTo(cx + w * 0.2, by - h * 0.25, cx + w * 0.16, by);
      ctx.quadraticCurveTo(cx, by + h * 0.14, cx - w * 0.16, by);
      ctx.quadraticCurveTo(cx - w * 0.2, by - h * 0.25, cx, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(cx, by, w * 0.44, h * 0.03, 0, 0, TAU);
      ctx.fill();
    };
  }

  function genMissile(sk) {
    return (ctx, w, h) => {
      const cy = h / 2;
      const body = new Path2D();
      body.moveTo(2.5, cy - 2.1);
      body.lineTo(w - 7.5, cy - 2.1);
      body.quadraticCurveTo(w - 0.5, cy - 1.2, w, cy);
      body.quadraticCurveTo(w - 0.5, cy + 1.2, w - 7.5, cy + 2.1);
      body.lineTo(2.5, cy + 2.1);
      body.closePath();
      // fins
      for (const s of [-1, 1]) {
        const fin = A.poly([3, cy + s * 1.8, 8.5, cy + s * 1.8, 5.5, cy + s * 4.6, 1.2, cy + s * 4.8]);
        A.metal(ctx, fin, { base: '#4a5366', spec: 0.3, edge: 0.5, rimWidth: 0.6, rimLight: 0.8 });
        const fin2 = A.poly([w - 12, cy + s * 1.9, w - 9.5, cy + s * 1.9, w - 11, cy + s * 3.4]);
        A.metal(ctx, fin2, { base: '#4a5366', spec: 0.3, edge: 0.4, rimWidth: 0.5, rimLight: 0.6 });
      }
      A.metal(ctx, body, { base: '#cfd7e4', light: '#ffffff', dark: '#4c566a', spec: 0.7, specPos: 0.32, angle: -Math.PI / 2 - 0.4, edge: 0.6, rimWidth: 0.7, rimLight: 0.9, bounds: { x: 0, y: cy - 3, w, h: 6 } });
      ctx.fillStyle = sk.deep;
      ctx.fillRect(w - 13, cy - 2.05, 2.4, 4.1);
      ctx.fillStyle = C.rgba(sk.halo, 0.9);
      ctx.fillRect(w - 12.6, cy - 2.05, 0.9, 4.1);
      ctx.fillStyle = '#2a303c';
      ctx.fillRect(0.6, cy - 1.7, 2.2, 3.4);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(5, cy - 1.7, w - 13, 0.7);
    };
  }

  /** Missile exhaust streak pointing +x (brightest at the right end, where the nozzle is). */
  function genStreak(sk) {
    return (ctx, w, h) => {
      const cy = h / 2;
      ctx.globalCompositeOperation = 'lighter';
      let g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, C.rgba(sk.halo, 0));
      g.addColorStop(0.65, C.rgba(sk.halo, 0.32));
      g.addColorStop(1, C.rgba(sk.halo, 0.75));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.quadraticCurveTo(w * 0.6, cy - h * 0.42, w, cy - h * 0.46);
      ctx.lineTo(w, cy + h * 0.46);
      ctx.quadraticCurveTo(w * 0.6, cy + h * 0.42, 0, cy);
      ctx.fill();
      g = ctx.createLinearGradient(w * 0.25, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(w * 0.25, cy);
      ctx.lineTo(w, cy - h * 0.13);
      ctx.lineTo(w, cy + h * 0.13);
      ctx.closePath();
      ctx.fill();
    };
  }

  /** Horizontal profile strip (stretched along a beam): gaussian-like falloff across x. */
  function profileCanvas(stops) {
    const c = A.canvas(64, 4), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 64, 0);
    for (const [t, col, a] of stops) g.addColorStop(t, C.rgba(col, a));
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 4);
    return c;
  }

  /** Vertically tileable energy texture for the lance body (streaks flowing along the beam). */
  function lanceTexture(sk) {
    const tw = 64, th = 256;
    const c = A.canvas(tw, th), x = c.getContext('2d');
    const base = x.createLinearGradient(0, 0, tw, 0);
    base.addColorStop(0, C.rgba(sk.halo, 0));
    base.addColorStop(0.22, C.rgba(sk.halo, 0.32));
    base.addColorStop(0.5, C.rgba(sk.body, 0.8));
    base.addColorStop(0.78, C.rgba(sk.halo, 0.32));
    base.addColorStop(1, C.rgba(sk.halo, 0));
    x.fillStyle = base;
    x.fillRect(0, 0, tw, th);
    x.globalCompositeOperation = 'lighter';
    const rng = SL.makeRng(911);
    for (let i = 0; i < 46; i++) {
      const cx = tw / 2 + rng.gauss() * tw * 0.13;
      const y0 = rng.next() * th, len = 24 + rng.next() * 80, lw = 0.8 + rng.next() * 2.4;
      const col = rng.chance(0.4) ? '#ffffff' : sk.body;
      const a = 0.18 + rng.next() * 0.45;
      for (const off of [0, -th]) {
        const g = x.createLinearGradient(0, y0 + off, 0, y0 + off + len);
        g.addColorStop(0, C.rgba(col, 0));
        g.addColorStop(0.5, C.rgba(col, a));
        g.addColorStop(1, C.rgba(col, 0));
        x.fillStyle = g;
        x.fillRect(cx - lw / 2, y0 + off, lw, len);
      }
    }
    return c;
  }

  /** Twin Link tether strip: cyan (P1 end, left) to gold (P2 end, right), white core. */
  function tetherCanvas() {
    const tw = 256, th = 32;
    const c = A.canvas(tw, th), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, tw, 0);
    g.addColorStop(0, '#3fc8ff');
    g.addColorStop(0.3, '#7fe3ff');
    g.addColorStop(0.5, '#d9ecff');
    g.addColorStop(0.7, '#ffd27a');
    g.addColorStop(1, '#ffb53f');
    x.fillStyle = g;
    x.fillRect(0, 0, tw, th);
    x.globalCompositeOperation = 'destination-in';
    const m = x.createLinearGradient(0, 0, 0, th);
    m.addColorStop(0, 'rgba(255,255,255,0)');
    m.addColorStop(0.32, 'rgba(255,255,255,0.35)');
    m.addColorStop(0.5, 'rgba(255,255,255,1)');
    m.addColorStop(0.68, 'rgba(255,255,255,0.35)');
    m.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = m;
    x.fillRect(0, 0, tw, th);
    x.globalCompositeOperation = 'lighter';
    const core = x.createLinearGradient(0, th * 0.44, 0, th * 0.56);
    core.addColorStop(0, 'rgba(255,255,255,0)');
    core.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = core;
    x.fillRect(0, th * 0.44, tw, th * 0.12);
    return c;
  }

  // ------------------------------------------------------------------ jet model (GDD 19)
  const FRAMES = 9, JW = 88, JH = 104, JCX = 44, JCY = 52;
  const ROLL_VIS = 0.8, PK = 0.0035, DIH = 0.07;
  const L3 = norm3(-0.6, -0.8, 1.15);
  const H3 = norm3(L3[0], L3[1], L3[2] + 1);
  const D0 = L3[2];
  function norm3(x, y, z) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }
  function frameRoll(f) { return ((f / (FRAMES - 1)) * 2 - 1) * ROLL_VIS; }
  function frameOf(bank) { return U.clamp(Math.round(((U.clamp(bank || 0, -0.35, 0.35) / 0.35) + 1) * 0.5 * (FRAMES - 1)), 0, FRAMES - 1); }

  const JET = [
    { name: 'XF-9 STARLANCE', hull: '#bfc8d7', hullLight: '#eef3fa', hullDark: '#434f66', metal: '#566075', metalLight: '#b4bfd0', gloss: 0.7,
      pod: '#6f7a90', nozzle: '#2c3342', trim: '#3fc8ff', glow: '#7fe3ff', engine: '#9fe8ff', paint: '#2a93cc',
      canopy: ['#9bdcff', '#1c4a80', '#071127'], refl: '#7fe3ff', helmet: 'rgba(214,226,244,0.32)' },
    { name: 'XF-9B SUNLANCE', hull: '#3b4050', hullLight: '#aeb7cb', hullDark: '#0e1016', metal: '#2f333d', metalLight: '#8d93a3', gloss: 1,
      pod: '#434855', nozzle: '#1b1d23', trim: '#ffb53f', glow: '#ffd27a', engine: '#ffb070', paint: '#d48b26',
      canopy: ['#ffd99a', '#94520f', '#251203'], refl: '#ffc070', helmet: 'rgba(255,226,180,0.3)' },
  ];

  function fusW(y) {
    if (y <= 0) return 0;
    if (y < 44) return 9.0 * Math.pow(y / 44, 0.62);
    if (y < 80) return 9.0 + 2.5 * U.smoothstep(44, 74, y);
    if (y < 101) return 11.5 * (1 - Math.pow((y - 80) / 21, 2.2));
    return 0;
  }
  function fusH(y) {
    if (y <= 0) return 0;
    if (y < 50) return 6.3 * Math.pow(y / 50, 0.72);
    if (y < 84) return 6.3;
    if (y < 101) return 6.3 * (1 - 0.88 * Math.pow((y - 84) / 17, 2));
    return 0.7;
  }
  function canW(y) {
    if (y <= 16 || y >= 42) return 0;
    return y < 29 ? 4.4 * Math.sin(((y - 16) / 13) * Math.PI / 2) : 4.4 * Math.pow(Math.cos(((y - 29) / 13) * Math.PI / 2), 0.75);
  }
  function canB(y) { return y <= 16 || y >= 42 ? 0 : 3.3 * Math.sin(((y - 16) / 26) * Math.PI); }
  const wz = (u) => Math.max(0, u - 8.5) * DIH;

  /** Roll rig: projects model points (u lateral, y down the sprite, z toward the viewer) for roll th. */
  function rig(th) {
    const c = Math.cos(th), s = Math.sin(th);
    const R = {
      th, c, s,
      X(u, z) { const uu = u * c + z * s, zz = -u * s + z * c; return JCX + uu * (1 + zz * PK); },
      Z(u, z) { return -u * s + z * c; },
      pt(u, y, z) { return [R.X(u, z), y]; },
      fus(sx, y) { const w = fusW(y), h = fusH(y); return [R.X(sx * w, h * Math.sqrt(Math.max(0, 1 - sx * sx))), y]; },
      can(sx, y) {
        const cw = canW(y), u = sx * cw, w = Math.max(0.01, fusW(y)), h = fusH(y);
        const zs = h * Math.sqrt(Math.max(0, 1 - (u / w) * (u / w)));
        return [R.X(u, zs + canB(y) * Math.sqrt(Math.max(0, 1 - sx * sx))), y];
      },
      ext(y) {
        const w = fusW(y), h = fusH(y);
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * TAU, x = R.X(Math.cos(a) * w, Math.sin(a) * h);
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
        return [lo, hi];
      },
      nrm(nx, ny, nz) { return [nx * c + nz * s, ny, -nx * s + nz * c]; },
    };
    return R;
  }

  function lit(n) {
    if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
    const d = Math.max(0, n[0] * L3[0] + n[1] * L3[1] + n[2] * L3[2]);
    const h = Math.max(0, n[0] * H3[0] + n[1] * H3[1] + n[2] * H3[2]);
    return { d, s: Math.pow(h, 10) };
  }
  function shade(base, light, dark, d) {
    return d >= D0 ? C.mix(base, light, Math.min(1, (d - D0) * 2.4)) : C.mix(base, dark, Math.min(1, (D0 - d) * 1.6));
  }
  function bbox(pts, pad) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  }
  function lerp2(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

  const WING = [[8.5, 40], [19, 55], [40.5, 76.5], [43, 78.6], [43.4, 85.4], [41.2, 87.6], [33, 86.6], [24, 84.6], [15, 89.6], [9.5, 90.5]];
  const CANARD = [[6.6, 27.5], [17.6, 36.6], [18.2, 39.9], [8.2, 38.4]];
  const canZ = (u) => 3.0 + Math.max(0, u - 6.6) * 0.12;

  /** Surface path through fuselage points given as [sx, y] pairs (sx = -1..1 across the top). */
  function fusPath(R, pairs, open) { return A.poly(pairs.map(([sx, y]) => R.fus(sx, y)), open); }
  function across(y, m, n) { const out = []; for (let i = 0; i <= n; i++) out.push([-m + (2 * m * i) / n, y]); return out; }

  function finGeo(R, sd) {
    const cant = 0.38, du = Math.sin(cant) * sd, dz = Math.cos(cant), hgt = 13.5;
    const b1 = [sd * 0.55 * fusW(71), 71, 0.84 * fusH(71)];
    const b2 = [sd * 0.55 * fusW(94), 94, 0.84 * fusH(94)];
    const t1 = [b1[0] + du * hgt, 85, b1[2] + dz * hgt];
    const t2 = [b2[0] + du * hgt * 0.9, 97.5, b2[2] + dz * hgt * 0.9];
    const P = [b1, t1, t2, b2].map(([u, y, z]) => R.pt(u, y, z));
    const zAvg = (R.Z(t1[0], t1[2]) + R.Z(t2[0], t2[2])) / 2;
    return { sd, P, zAvg, n: R.nrm(-dz * sd, 0, Math.abs(du)), tip: R.pt(t1[0] + (t2[0] - t1[0]) * 0.3, 88.5, t1[2] + (t2[2] - t1[2]) * 0.3) };
  }

  function drawEmissives(ctx, R, J, glowLayer) {
    const col = glowLayer ? J.glow : J.trim, blur = glowLayer ? 9 : 5;
    for (const sd of [-1, 1]) {
      const le = A.poly([[9.8, 42.6], [19.8, 57], [40.3, 77.1]].map(([u, y]) => R.pt(sd * u, y, wz(u) + 0.3)), true);
      A.emissive(ctx, le, col, blur, { stroke: glowLayer ? 2.6 : 1.6 });
      const slit = fusPath(R, [[sd * 0.6, 57], [sd * 0.84, 57.6], [sd * 0.84, 69], [sd * 0.6, 69.6]]);
      A.emissive(ctx, slit, col, blur);
      const ct = R.pt(sd * 17.4, 38.4, canZ(17.4));
      const dot = new Path2D();
      dot.arc(ct[0], ct[1], 0.9, 0, TAU);
      A.emissive(ctx, dot, col, blur);
      const ex = R.X(sd * 8.6, -0.5);
      const noz = new Path2D();
      noz.ellipse(ex, 100.7, 3.5, 1.35, 0, 0, TAU);
      if (!glowLayer) { ctx.fillStyle = '#04060b'; ctx.fill(noz); }
      A.emissive(ctx, noz, J.engine, blur);
    }
    const sp = R.fus(0, 46.5);
    const sl = new Path2D();
    sl.arc(sp[0], sp[1], 1.15, 0, TAU);
    A.emissive(ctx, sl, col, blur);
  }

  function jetGen(i, f, glowLayer) {
    return (ctx) => {
      const J = JET[i], th = frameRoll(f), R = rig(th);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (glowLayer) { drawEmissives(ctx, R, J, true); return; }
      const far = th >= 0 ? [1, -1] : [-1, 1];

      // ---- main wings (far wing first)
      for (const sd of far) {
        const wp = WING.map(([u, y]) => R.pt(sd * u, y, wz(u)));
        const path = A.poly(wp);
        const L = lit(R.nrm(-sd * DIH, 0, 1));
        A.metal(ctx, path, {
          base: shade(J.hull, J.hullLight, J.hullDark, L.d), light: J.hullLight, dark: J.hullDark,
          spec: 0.26 + 0.55 * L.s, specPos: 0.3 - th * sd * 0.2, bounds: bbox(wp, 7), edge: 1.6, rimLight: 1.7, rimWidth: 1.1,
        });
        const wpt = (u, y) => R.pt(sd * u, y, wz(u));
        // painted band near the tip, with a thin light edge
        const band = A.poly([wpt(33.6, 70.4), wpt(36.9, 73.7), wpt(37.2, 86.9), wpt(33.9, 86.5)]);
        ctx.fillStyle = C.rgba(J.paint, 0.92);
        ctx.fill(band);
        A.panelLines(ctx, A.poly([wpt(33.6, 70.4), wpt(33.9, 86.5)], true), '#000', 0.3);
        // control surfaces and structure
        A.panelLines(ctx, A.poly([wpt(25, 81.3), wpt(40.6, 83.5)], true), '#000', 0.42);
        A.panelLines(ctx, A.poly([wpt(30.5, 82.2), wpt(30.8, 86.4)], true), '#000', 0.42);
        A.panelLines(ctx, A.poly([wpt(15, 61), wpt(29.5, 79.5)], true), '#000', 0.22);
        A.panelLines(ctx, A.poly([wpt(12.8, 50), wpt(13.6, 88.6)], true), '#000', 0.3);
        A.panelLines(ctx, A.poly([wpt(17, 84.9), wpt(23.6, 83.9)], true), '#000', 0.3);
        // wingtip pod with the nav lens
        const tipP = [wpt(41.4, 76.8), wpt(43.9, 78.6), wpt(44.2, 86.2), wpt(42.6, 87.6), wpt(41.3, 86)];
        A.metal(ctx, A.poly(tipP), { base: J.metal, light: J.metalLight, spec: 0.5, edge: 0.6, rimWidth: 0.7, rimLight: 0.8, bounds: bbox(tipP, 2) });
        const lens = new Path2D();
        const lp = wpt(42.8, 79.6);
        lens.ellipse(lp[0], lp[1], 1.1, 1.9, 0, 0, TAU);
        ctx.fillStyle = sd < 0 ? '#8c1c28' : '#1c7a3e';
        ctx.fill(lens);
        // missile pod (rails on top of the wing)
        const px = R.X(sd * 27, wz(27) + 1.6);
        const pod = new Path2D();
        pod.roundRect(px - 2.3, 61.5, 4.6, 16, [2.3, 2.3, 1, 1]);
        A.metal(ctx, pod, { base: J.pod, light: J.metalLight, spec: 0.55, specPos: 0.3, edge: 0.6, rimWidth: 0.7, rimLight: 0.9, bounds: { x: px - 4, y: 60, w: 8, h: 19 } });
        const nose = new Path2D();
        nose.ellipse(px, 63, 1.5, 1.9, 0, 0, TAU);
        ctx.fillStyle = C.mix(J.hullLight, J.trim, 0.25);
        ctx.fill(nose);
        A.panelLines(ctx, A.poly([[px - 2.2, 70.5], [px + 2.2, 70.5]], true), '#000', 0.45);
      }

      // ---- engines (nacelles show behind the tapering rear fuselage)
      for (const sd of far) {
        const ex = R.X(sd * 8.6, -0.5);
        const nac = new Path2D();
        nac.roundRect(ex - 4.7, 63, 9.4, 33, [4, 4, 1.5, 1.5]);
        A.metal(ctx, nac, { base: J.metal, light: J.metalLight, dark: '#10141b', spec: 0.5, specPos: 0.28, bounds: { x: ex - 6, y: 60, w: 12, h: 40 }, edge: 1, rimWidth: 1, rimLight: 1.4 });
        const noz = new Path2D();
        noz.roundRect(ex - 4.4, 93.6, 8.8, 7.4, [1, 1, 2.4, 2.4]);
        A.metal(ctx, noz, { base: J.nozzle, light: '#a3adc0', dark: '#05070b', spec: 0.65, specPos: 0.34, bounds: { x: ex - 5, y: 92, w: 10, h: 10 }, edge: 0.7, rimWidth: 0.8, rimLight: 1 });
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 0.7;
        for (const k of [-2.6, -0.9, 0.9, 2.6]) {
          ctx.beginPath();
          ctx.moveTo(ex + k, 95);
          ctx.lineTo(ex + k * 1.06, 100.3);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(ex - 4.6, 93.2, 9.2, 0.9);
      }

      // ---- fuselage
      const EX = [];
      for (let y = 0; y <= 101; y++) EX.push(R.ext(y));
      const fus = new Path2D();
      fus.moveTo(JCX, 0);
      for (let y = 1; y <= 101; y++) fus.lineTo(EX[y][1], y);
      for (let y = 101; y >= 1; y--) fus.lineTo(EX[y][0], y);
      fus.closePath();
      A.metal(ctx, fus, { base: J.hull, light: J.hullLight, dark: J.hullDark, spec: 0.55, specPos: 0.28, bounds: { x: JCX - 14, y: -2, w: 28, h: 104 }, edge: 1.8, rimLight: 2, rimWidth: 1.2 });
      const band = (a0, a1, y0, y1) => {
        const p = new Path2D();
        for (let y = y0; y <= y1; y++) {
          const m = (EX[y][0] + EX[y][1]) / 2, hw = (EX[y][1] - EX[y][0]) / 2;
          if (y === y0) p.moveTo(m + a0 * hw, y); else p.lineTo(m + a0 * hw, y);
        }
        for (let y = y1; y >= y0; y--) {
          const m = (EX[y][0] + EX[y][1]) / 2, hw = (EX[y][1] - EX[y][0]) / 2;
          p.lineTo(m + a1 * hw, y);
        }
        p.closePath();
        return p;
      };
      ctx.save();
      ctx.clip(fus);
      ctx.fillStyle = 'rgba(255,255,255,' + 0.16 * J.gloss + ')';
      ctx.fill(band(-0.66, -0.12, 3, 99));
      ctx.fillStyle = 'rgba(255,255,255,' + 0.32 * J.gloss + ')';
      ctx.fill(band(-0.5, -0.33, 5, 97));
      ctx.fillStyle = C.rgba(J.hullDark, 0.32);
      ctx.fill(band(0.4, 1.1, 2, 101));
      ctx.fillStyle = C.rgba(J.hullDark, 0.32);
      ctx.fill(band(0.74, 1.1, 2, 101));
      ctx.restore();

      // ---- intakes on the flanks under the wing roots
      for (const sd of far) {
        const ip = [
          R.pt(sd * (fusW(40) + 0.1), 40, 0), R.pt(sd * (fusW(43) + 2.1), 43, 0), R.pt(sd * (fusW(54) + 2.3), 54, 0),
          R.pt(sd * (fusW(57.5) + 0.2), 57.5, 0), R.pt(sd * (fusW(56) - 1.4), 56, 1.2), R.pt(sd * (fusW(42) - 1.2), 42, 1.2),
        ];
        A.metal(ctx, A.poly(ip), { base: J.metal, light: J.metalLight, spec: 0.35, edge: 0.6, rimWidth: 0.8, rimLight: 1, bounds: bbox(ip, 2) });
        const mouth = A.poly([R.pt(sd * (fusW(41) + 0.3), 41.4, 0.2), R.pt(sd * (fusW(43.4) + 1.8), 43.5, 0.2), R.pt(sd * (fusW(44.6) + 0.5), 45.6, 0.5), R.pt(sd * (fusW(42.2) - 0.6), 43.2, 0.8)]);
        ctx.fillStyle = '#04060b';
        ctx.fill(mouth);
        A.panelLines(ctx, A.poly([R.pt(sd * (fusW(46) + 1.9), 46, 0), R.pt(sd * (fusW(53) + 2.1), 53, 0)], true), '#000', 0.35);
      }

      // ---- fuselage details (they move with the roll)
      for (const y of [12, 58, 84]) A.panelLines(ctx, fusPath(R, across(y, 0.9, 10), true), '#000', 0.38);
      ctx.fillStyle = C.rgba(J.paint, 0.95);
      const nb = across(13.6, 0.93, 10).concat(across(15.8, 0.93, 10).reverse());
      ctx.fill(fusPath(R, nb));
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fill(fusPath(R, [[-0.2, 42], [0.2, 42], [0.22, 64], [-0.22, 64]]));
      for (const sd of [-1, 1]) {
        A.panelLines(ctx, fusPath(R, [[sd * 0.21, 42], [sd * 0.23, 64]], true), '#000', 0.3);
        A.panelLines(ctx, fusPath(R, [[sd * 0.46, 64], [sd * 0.46, 93]], true), '#000', 0.34);
        A.panelLines(ctx, fusPath(R, [[sd * 0.5, 18], [sd * 0.62, 40]], true), '#000', 0.2);
        ctx.strokeStyle = 'rgba(8,10,16,0.6)';
        ctx.lineWidth = 0.9;
        for (const y of [74, 76.6, 79.2]) {
          const a = R.fus(sd * 0.22, y), b = R.fus(sd * 0.34, y + 0.4);
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
      }

      // ---- canards
      for (const sd of far) {
        const cp = CANARD.map(([u, y]) => R.pt(sd * u, y, canZ(u)));
        const L = lit(R.nrm(-sd * 0.12, 0, 1));
        A.metal(ctx, A.poly(cp), { base: shade(J.hull, J.hullLight, J.hullDark, L.d), light: J.hullLight, dark: J.hullDark, spec: 0.3 + 0.5 * L.s, specPos: 0.32, edge: 0.9, rimWidth: 0.9, rimLight: 1.2, bounds: bbox(cp, 3) });
        A.panelLines(ctx, A.poly([lerp2(cp[0], cp[3], 0.5), lerp2(cp[1], cp[2], 0.5)], true), '#000', 0.3);
      }

      // ---- canopy (smoked glass, colored reflection, pilot helmet, frame)
      const CL = [], CH = [];
      for (let y = 16; y <= 42; y += 0.5) {
        let lo = Infinity, hi = -Infinity;
        for (let k = 0; k <= 12; k++) {
          const x = R.can(-1 + k / 6, y)[0];
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
        CL.push([lo, y]);
        CH.push([hi, y]);
      }
      const cpath = A.poly(CH.concat(CL.slice().reverse()));
      const cg = ctx.createLinearGradient(0, 16, 0, 42);
      cg.addColorStop(0, J.canopy[1]);
      cg.addColorStop(0.5, J.canopy[2]);
      cg.addColorStop(1, C.mix(J.canopy[2], J.canopy[1], 0.4));
      ctx.fillStyle = cg;
      ctx.fill(cpath);
      ctx.save();
      ctx.clip(cpath);
      const hp = R.can(0, 31);
      ctx.fillStyle = J.helmet;
      ctx.beginPath();
      ctx.ellipse(hp[0], hp[1], 1.9, 2.4, 0, 0, TAU);
      ctx.fill();
      const cband = (a0, a1, y0, y1) => {
        const p = new Path2D();
        let first = true;
        for (let k = 0; k < CL.length; k++) {
          const y = CL[k][1];
          if (y < y0 || y > y1) continue;
          const m = (CL[k][0] + CH[k][0]) / 2, hw = (CH[k][0] - CL[k][0]) / 2;
          if (first) { p.moveTo(m + a0 * hw, y); first = false; } else p.lineTo(m + a0 * hw, y);
        }
        for (let k = CL.length - 1; k >= 0; k--) {
          const y = CL[k][1];
          if (y < y0 || y > y1) continue;
          const m = (CL[k][0] + CH[k][0]) / 2, hw = (CH[k][0] - CL[k][0]) / 2;
          p.lineTo(m + a1 * hw, y);
        }
        p.closePath();
        return p;
      };
      ctx.fillStyle = C.rgba(J.refl, 0.5);
      ctx.fill(cband(-0.9, -0.38, 18, 39));
      ctx.fillStyle = C.rgba(J.refl, 0.28);
      ctx.fill(cband(0.45, 0.85, 30, 40));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill(cband(-0.66, -0.42, 19.5, 27));
      ctx.restore();
      ctx.strokeStyle = 'rgba(6,9,16,0.95)';
      ctx.lineWidth = 0.9;
      ctx.stroke(cpath);
      const bar = [];
      for (let k = 0; k <= 8; k++) bar.push(R.can(-1 + k / 4, 34.6));
      ctx.strokeStyle = 'rgba(10,14,22,0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke(A.poly(bar, true));
      ctx.strokeStyle = C.rgba(J.hullLight, 0.45);
      ctx.lineWidth = 0.5;
      ctx.stroke(A.poly(bar.map(([x, y]) => [x, y - 0.8]), true));

      // ---- twin canted fins (lower one first)
      const fins = [finGeo(R, -1), finGeo(R, 1)].sort((a, b) => a.zAvg - b.zAvg);
      for (const fg of fins) {
        const L = lit(fg.n);
        const path = A.poly(fg.P);
        A.metal(ctx, path, { base: shade(J.hull, J.hullLight, J.hullDark, L.d), light: J.hullLight, dark: J.hullDark, spec: 0.25 + 0.5 * L.s, specPos: 0.35, edge: 0.9, rimWidth: 1, rimLight: 1.2, bounds: bbox(fg.P, 3) });
        const [b1, t1, t2, b2] = fg.P;
        const tipBand = A.poly([lerp2(b1, t1, 0.68), t1, t2, lerp2(b2, t2, 0.68)]);
        ctx.fillStyle = C.rgba(J.paint, 0.95);
        ctx.fill(tipBand);
        A.panelLines(ctx, A.poly([lerp2(b1, t1, 0.4), lerp2(b2, t2, 0.4)], true), '#000', 0.3);
      }

      drawEmissives(ctx, R, J, false);
    };
  }

  /** Per-frame anchor points for the live overlays (relative to the jet center). */
  const META = [];
  function buildMeta() {
    for (let f = 0; f < FRAMES; f++) {
      const R = rig(frameRoll(f));
      const rel = (p) => [p[0] - JCX, p[1] - JCY];
      const fins = [finGeo(R, -1), finGeo(R, 1)];
      META.push({
        c: R.c,
        noz: [-1, 1].map((sd) => rel(R.pt(sd * 8.6, 101, -0.5))),
        tip: [-1, 1].map((sd) => rel(R.pt(sd * 42.8, 79.8, wz(42.8)))),
        pod: [-1, 1].map((sd) => rel(R.pt(sd * 27, 62, wz(27) + 1.6))),
        glint: [rel(R.can(-0.45, 19)), rel(R.can(-0.2, 37))],
        fin: fins.map((g) => rel(g.tip)),
        nose: rel(R.pt(0, 2, 0)),
        dmg: [[-20, 66, 1], [22, 70, 1], [-8.6, 88, 0], [8.6, 84, 0], [-32, 78, 2], [30, 80, 2], [4, 52, 6], [-5, 74, 6]]
          .map(([u, y, z]) => rel(R.pt(u, y, z))),
      });
    }
  }
  buildMeta();

  /** Long soft exhaust plume (vertical, hot end at the top): stacked additive glows with shock diamonds. */
  function genExhaust(J) {
    return (ctx, w, h) => {
      ctx.globalCompositeOperation = 'lighter';
      const cx = w / 2, N = 26;
      for (let k = 0; k < N; k++) {
        const u = k / (N - 1), yy = 3 + u * (h - 9), r = w * 0.5 * (1 - u * 0.72);
        const a = 0.34 * Math.pow(1 - u, 1.35);
        const g = ctx.createRadialGradient(cx, yy, 0, cx, yy, r);
        g.addColorStop(0, C.rgba(C.mix('#ffffff', J.engine, Math.min(1, u * 2.2)), a));
        g.addColorStop(0.5, C.rgba(J.engine, a * 0.55));
        g.addColorStop(1, C.rgba(J.trim, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, yy - r, r * 2, r * 2);
      }
      for (let k = 0; k < 4; k++) {
        const yy = h * (0.13 + k * 0.14), r = w * (0.3 - k * 0.045);
        const g = ctx.createRadialGradient(cx, yy, 0, cx, yy, r);
        g.addColorStop(0, 'rgba(255,255,255,' + (0.3 - k * 0.06) + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, yy - r, r * 2, r * 2);
      }
    };
  }
  const EXHAUST_KEYS = ['wpn:exhaust0', 'wpn:exhaust1'];
  A.define(EXHAUST_KEYS[0], 16, 84, genExhaust(JET[0]), { pad: 0, res: 2 });
  A.define(EXHAUST_KEYS[1], 16, 84, genExhaust(JET[1]), { pad: 0, res: 2 });

  const JET_KEYS = [[], []], GLOW_KEYS = [[], []];
  for (let i = 0; i < 2; i++) {
    for (let f = 0; f < FRAMES; f++) {
      JET_KEYS[i][f] = 'wpn:jet' + i + ':' + f;
      GLOW_KEYS[i][f] = 'wpn:jetglow' + i + ':' + f;
      A.define(JET_KEYS[i][f], JW, JH, jetGen(i, f, false), { pad: 8, res: 2 });
      A.define(GLOW_KEYS[i][f], JW, JH, jetGen(i, f, true), { pad: 12, res: 1 });
    }
  }

  // shot and effect sprites (lazy)
  const BOLT_KEYS = { pulse: [], spread: [] }, FLARE_KEYS = [], MUZZLE_KEYS = [], MIS_KEYS = [], STREAK_KEYS = [];
  SKINS.forEach((sk, s) => {
    BOLT_KEYS.pulse[s] = 'wpn:bolt:' + s;
    BOLT_KEYS.spread[s] = 'wpn:pellet:' + s;
    FLARE_KEYS[s] = 'wpn:flare:' + s;
    MUZZLE_KEYS[s] = 'wpn:muzzle:' + s;
    MIS_KEYS[s] = 'wpn:missile:' + s;
    A.define(BOLT_KEYS.pulse[s], 56, 15, genBolt(sk), { pad: 2, res: 2 });
    A.define(BOLT_KEYS.spread[s], 36, 16, genDart(sk), { pad: 2, res: 2 });
    A.define(FLARE_KEYS[s], 34, 34, genStar(sk.halo, 4), { pad: 0, res: 1 });
    A.define(MUZZLE_KEYS[s], 22, 30, genMuzzle(sk), { pad: 1, res: 2 });
    A.define(MIS_KEYS[s], 30, 11, genMissile(sk), { pad: 2, res: 3 });
    STREAK_KEYS[s] = 'wpn:streak:' + s;
    A.define(STREAK_KEYS[s], 64, 9, genStreak(sk), { pad: 0, res: 1 });
  });
  A.define('wpn:glint', 12, 18, (ctx, w, h) => {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(220,245,255,0.7)');
    g.addColorStop(1, 'rgba(180,230,255,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(w / h, 1);
    ctx.beginPath();
    ctx.arc(0, 0, h / 2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }, { pad: 0, res: 2 });
  A.define('wpn:sparkle', 24, 24, genStar('#ffffff', 4), { pad: 0, res: 1 });

  let PROFILES = null, TETHER = null;
  const LINK_COLS = [];
  function profiles() {
    if (PROFILES) return PROFILES;
    PROFILES = SKINS.map((sk) => ({
      halo: profileCanvas([[0, sk.halo, 0], [0.2, sk.halo, 0.06], [0.36, sk.halo, 0.3], [0.5, C.mix(sk.halo, '#ffffff', 0.25), 0.55], [0.64, sk.halo, 0.3], [0.8, sk.halo, 0.06], [1, sk.halo, 0]]),
      core: profileCanvas([[0, sk.body, 0], [0.22, sk.body, 0.55], [0.4, '#ffffff', 0.95], [0.5, '#ffffff', 1], [0.6, '#ffffff', 0.95], [0.78, sk.body, 0.55], [1, sk.body, 0]]),
      tex: lanceTexture(sk),
    }));
    TETHER = tetherCanvas();
    for (let k = 0; k <= 8; k++) LINK_COLS.push(C.mix('#3fc8ff', '#ffb53f', k / 8));
    return PROFILES;
  }
  const sprCache = new Map();
  function spr(key) {
    let s = sprCache.get(key);
    if (!s) { s = A.get(key); sprCache.set(key, s); }
    return s;
  }

  // ------------------------------------------------------------------ per-player weapon state
  function state(p) {
    let w = p.data.wpn;
    if (!w) {
      w = p.data.wpn = { flash: 0, flashLv: 0, flashType: 'pulse', flashRot: 0, misT: 0, mq: [], lance: null, thr: 1, sparkT: 0, jamT: 0, penalty: false, podFlash: [0, 0] };
    }
    return w;
  }

  const MODS = { rate: 1, dmg: 1, jam: false, od: false };
  function computeMods(p) {
    const st = p.stats || {};
    const od = overdriveOf(p);
    const jam = !!(p.data && p.data.ionJamT > 0);
    let odR = 1, odD = 1;
    if (od) {
      odR = typeof od === 'object' && od.fireRate > 0 ? od.fireRate : OD_RATE;
      odD = typeof od === 'object' && od.damage > 0 ? od.damage : OD_DMG;
    }
    MODS.rate = (st.fireRateMul > 0 ? st.fireRateMul : 1) * (jam ? 0.5 : 1) * odR;
    MODS.dmg = (st.damageMul > 0 ? st.damageMul : 1) * odD * (linked(p) ? LINK_CFG.bonus : 1);
    MODS.jam = jam;
    MODS.od = !!od;
    return MODS;
  }

  const FIRE_OPTS = { color: '#7fe3ff', data: null, r: 0 };

  function firePulse(p, lv, M, adv) {
    const L = PULSE.layout[lv], dmg = PULSE.dmg[lv] * M.dmg, sk = skinOf(p);
    FIRE_OPTS.color = SKINS[sk].spark;
    for (let i = 0; i < L.length; i++) {
      const row = L[i], a = UP + row[2];
      FIRE_OPTS.data = { skin: sk, sy: row[3] }; // each bolt owns its data: content may write into b.data
      FIRE_OPTS.r = row[3] > 1.3 ? 9 : 7;
      const x = p.x + row[0] + Math.cos(a) * adv, y = p.y + row[1] - 16 + Math.sin(a) * adv;
      SL.firePlayer(p, x, y, a, PULSE.speed, 'pulse', dmg, FIRE_OPTS);
    }
  }
  function fireSpread(p, lv, M, adv) {
    const n = SPREAD.rays[lv], arc = SPREAD.arc[lv], dmg = SPREAD.dmg[lv] * M.dmg, sk = skinOf(p);
    FIRE_OPTS.color = SKINS[sk].spark;
    FIRE_OPTS.r = 6;
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1) - 0.5, a = UP + k * arc;
      FIRE_OPTS.data = { skin: sk, sy: 1 };
      SL.firePlayer(p, p.x + k * 20 + Math.cos(a) * adv, p.y - 50 + Math.abs(k) * 10 + Math.sin(a) * adv, a, SPREAD.speed, 'spread', dmg, FIRE_OPTS);
    }
  }

  function updatePrimary(p, w, dt, M) {
    const type = p.weapon.type, lv = U.clamp(p.weapon.level | 0, 1, 5) - 1;
    if (type === 'lance') { updateLance(p, w, M, lv); p.fireT = 0; return; }
    if (w.lance) { killLance(w); }
    p.fireT = (p.fireT || 0) - dt;
    if (!p.firing) { if (p.fireT < 0) p.fireT = 0; return; }
    let guard = 4;
    while (p.fireT <= 0 && guard-- > 0) {
      const adv = Math.min(0.05, -p.fireT) * (type === 'spread' ? SPREAD.speed : PULSE.speed);
      if (type === 'spread') fireSpread(p, lv, M, adv); else firePulse(p, lv, M, adv);
      const rate = (type === 'spread' ? SPREAD.rate[lv] : PULSE.rate[lv]) * M.rate;
      p.fireT += 1 / rate;
      w.flash = 1;
      w.flashType = type;
      w.flashLv = lv;
      w.flashRot = Math.random() * 0.6 - 0.3;
      p.gun = 1;
      U.sfx(type === 'spread' ? 'shot_spread' : 'shot_pulse', { x: p.x, vol: 0.42, pitch: (p.index ? 1.1 : 1) * (0.96 + Math.random() * 0.08) });
    }
  }

  // ------------------------------------------------------------------ missiles
  const NEAR_OPTS = { maxDist: 900 };
  function targetFor(x, y, skip) {
    // the k-th nearest on-screen enemy (spreads a salvo over several targets)
    const list = SL.world.enemies;
    let best = null, bd = Infinity;
    for (let n = 0; n <= skip; n++) {
      best = null;
      bd = Infinity;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.dying || e.intangible || e.untargetable || e._wpnPick === TPICK) continue;
        if (e.y + e.r < 0 || e.y - e.r > H || e.x + e.r < 0 || e.x - e.r > W) continue;
        const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      if (n < skip) best._wpnPick = TPICK;
    }
    return best;
  }
  let TPICK = 0;

  function fireMissile(p, x, y, angle, dmg, opts) {
    const o = opts || {};
    const sk = o.skin != null ? o.skin : skinOf(p);
    return SL.firePlayer(p, x, y, angle, o.speed || MISSILES.speed, 'missile', dmg != null ? dmg : 20, {
      color: SKINS[sk].spark, scale: o.scale || 1, r: 6,
      data: { skin: sk, tgt: o.target || null, trail: 0, maxSpeed: o.maxSpeed || MISSILES.maxSpeed, turn: o.turn || MISSILES.turn, kick: o.kick != null ? o.kick : 0.07, ph: Math.random() * 10 },
    });
  }

  function updateMissiles(p, w, dt, M) {
    for (let i = w.mq.length - 1; i >= 0; i--) {
      const q = w.mq[i];
      q.t -= dt;
      if (q.t > 0) continue;
      w.mq.splice(i, 1);
      if (!p.alive) continue;
      const f = META[frameOf(p.bank)], pod = f.pod[q.side < 0 ? 0 : 1];
      const a = UP + q.side * (0.95 + q.k * 0.3);
      TPICK++;
      const tgt = targetFor(p.x, p.y, q.n);
      fireMissile(p, p.x + pod[0], p.y + pod[1] + 4, a, q.dmg, { target: tgt });
      w.podFlash[q.side < 0 ? 0 : 1] = 1;
      SL.fx.emit({ x: p.x + pod[0], y: p.y + pod[1] + 6, vx: q.side * 60, vy: 80, shape: 'smoke', size: 8, size2: 20, life: 0.45, color: '#8f98aa', alpha: 0.4, drag: 2 });
    }
    const lv = U.clamp(p.missiles | 0, 0, 3);
    if (!lv) { w.misT = 0; return; }
    w.misT -= dt * M.rate;
    if (!p.firing) { if (w.misT < 0) w.misT = 0; return; }
    if (w.misT > 0) return;
    if (!SL.world.nearestEnemy(p.x, p.y, NEAR_OPTS)) { w.misT = 0; return; }
    w.misT += MISSILES.every[lv];
    const n = MISSILES.count[lv], dmg = MISSILES.dmg[lv] * M.dmg;
    for (let i = 0; i < n; i++) w.mq.push({ t: i * 0.055, side: i % 2 ? 1 : -1, k: i >> 1, n: i, dmg });
    U.sfx('missile_launch', { x: p.x, vol: 0.55 });
  }

  function missileUpdate(b, dt) {
    const d = b.data;
    if (d.skin == null) { // fired by another module without our data block
      d.skin = skinOf(b.owner);
      d.trail = 0;
      d.maxSpeed = MISSILES.maxSpeed;
      d.turn = MISSILES.turn;
      d.kick = 0.05;
      d.ph = Math.random() * 10;
    }
    if (b.speed < d.maxSpeed) b.speed = Math.min(d.maxSpeed, b.speed + MISSILES.accel * dt);
    let t = d.tgt;
    if (!t || t.dead || t.dying || t.intangible) t = d.tgt = SL.world.nearestEnemy(b.x, b.y, NEAR_OPTS);
    if (t && b.age > d.kick) {
      const want = Math.atan2(t.y - b.y, t.x - b.x);
      const diff = U.angleDiff(b.angle, want), m = d.turn * dt;
      b.angle += diff > m ? m : diff < -m ? -m : diff;
    }
    b.vx = Math.cos(b.angle) * b.speed;
    b.vy = Math.sin(b.angle) * b.speed;
    d.trail += b.speed * dt;
    let guard = 4;
    while (d.trail > 7 && guard-- > 0) {
      d.trail -= 7;
      const c = Math.cos(b.angle), s = Math.sin(b.angle), back = 15 + d.trail;
      const j = (Math.random() - 0.5) * 4;
      SL.fx.emit({ x: b.x - c * back - s * j, y: b.y - s * back + c * j, vx: -c * 26 + (Math.random() - 0.5) * 20, vy: -s * 26 + 16, shape: 'smoke', size: 6 + Math.random() * 3, size2: 24 + Math.random() * 10, life: 0.34 + Math.random() * 0.22, color: '#aeb6c8', alpha: 0.42, ease: true, drag: 2.6, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 2.4 });
    }
  }

  function missileHit(b, e) {
    const pt = e ? entry(b, e) : [b.x, b.y];
    const x = pt[0], y = pt[1], sk = SKINS[(b.data && b.data.skin) | 0];
    SL.fx.emit({ x, y, shape: 'fire', size: 22, size2: 38, life: 0.26, color: '#ffe3a0', color2: '#ff6a2a', alpha: 0.95, rot: Math.random() * TAU, spin: 3 });
    SL.fx.emit({ x, y, shape: 'glow', size: 64, size2: 14, life: 0.14, color: sk.halo, alpha: 0.85 });
    SL.fx.sparks(x, y, { count: 7, color: '#ffd27a', speed: 380, life: 0.3, size: 4 });
    SL.fx.emit({ x, y, vy: -20, shape: 'smoke', size: 14, size2: 32, life: 0.6, color: '#555b6a', alpha: 0.4, drag: 1.5 });
  }

  function drawMissile(b, ctx) {
    const d = b.data, sk = (d && d.skin) | 0, S = SKINS[sk];
    const base = SL.render.base, bs = base.s, sc = b.scale || 1;
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    const ex = b.x - c * 12 * sc, ey = b.y - s * 12 * sc;
    const t = SL.time.real + ((d && d.ph) || 0);
    const k = U.clamp(b.speed / MISSILES.maxSpeed, 0.4, 1);
    ctx.globalAlpha = 1;
    // hot exhaust streak behind the nozzle (sprite brightest at its +x end)
    const st = spr(STREAK_KEYS[sk]), L = (30 + 30 * k) * sc;
    ctx.setTransform(c * bs, s * bs, -s * bs, c * bs, base.x + ex * bs, base.y + ey * bs);
    ctx.drawImage(st.canvas, -L, -st.ch * 0.5 * sc, L, st.ch * sc);
    // plume (A.flame points +y: rotate +y to the rear)
    ctx.setTransform(-s * bs, c * bs, -c * bs, -s * bs, base.x + ex * bs, base.y + ey * bs);
    A.flame(ctx, 0, 0, 7 * sc, (12 + 12 * k) * sc, '#ffffff', S.halo, t);
    A.drawGlow(ctx, 0, 0, 11 * sc, S.halo, 0.8);
    ctx.globalCompositeOperation = 'source-over';
    const sp = spr(MIS_KEYS[sk]);
    ctx.setTransform(c * bs * sc, s * bs * sc, -s * bs * sc, c * bs * sc, base.x + b.x * bs, base.y + b.y * bs);
    ctx.drawImage(sp.canvas, -sp.cw / 2, -sp.ch / 2, sp.cw, sp.ch);
    ctx.globalCompositeOperation = 'lighter';
  }

  // ------------------------------------------------------------------ bolts: draw + hit flare
  function drawBolt(b, ctx) {
    const d = b.data, keys = BOLT_KEYS[b.typeId] || BOLT_KEYS.pulse;
    const sp = spr(keys[(d && d.skin) | 0]);
    const base = SL.render.base, bs = base.s;
    const sy = ((d && d.sy) || 1) * b.scale, sx = b.scale;
    const c = Math.cos(b.angle) * bs, s = Math.sin(b.angle) * bs;
    ctx.globalAlpha = b.alpha;
    ctx.setTransform(c * sx, s * sx, -s * sy, c * sy, base.x + b.x * bs, base.y + b.y * bs);
    ctx.drawImage(sp.canvas, -sp.cw / 2, -sp.ch / 2, sp.cw, sp.ch);
  }

  /** Where a bolt entered the enemy this step (circle entry along its swept path). */
  function entry(b, e) {
    const ax = b.px != null ? b.px : b.x, ay = b.py != null ? b.py : b.y;
    let dx = b.x - ax, dy = b.y - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return [b.x, b.y];
    dx /= len;
    dy /= len;
    const ex = e.x - ax, ey = e.y - ay, proj = ex * dx + ey * dy;
    const perp2 = ex * ex + ey * ey - proj * proj, r = (e.r || 12) * 0.8 + b.r;
    const back = Math.sqrt(Math.max(0, r * r - perp2));
    const t = U.clamp(proj - back, 0, len);
    return [ax + dx * t, ay + dy * t];
  }
  function boltHit(b, e) {
    const pt = entry(b, e);
    SL.fx.emit({ x: pt[0], y: pt[1], shape: FLARE_KEYS[(b.data && b.data.skin) | 0], blend: 'add', size: b.typeId === 'spread' ? 22 : 26, size2: 8, life: 0.085, rot: Math.random() * TAU });
  }

  SL.pbulletTypes.define('pulse', { r: 7, damage: 7, color: '#7fe3ff', alpha: 0.92, sprite: 'wpn:bolt:0', orient: true, draw: drawBolt, onHit: boltHit });
  SL.pbulletTypes.define('spread', { r: 6, damage: 6.5, color: '#7fe3ff', alpha: 0.92, sprite: 'wpn:pellet:0', orient: true, draw: drawBolt, onHit: boltHit });
  SL.pbulletTypes.define('missile', { r: 6, damage: 20, color: '#ffd27a', alpha: 1, sprite: 'wpn:missile:0', orient: true, life: 3.2, noHitFx: true, update: missileUpdate, draw: drawMissile, onHit: missileHit });

  // ------------------------------------------------------------------ lance (piercing beam)
  function killLance(w) {
    if (!w.lance) return;
    stopLoop(w.lance.data);
    w.lance.dead = true;
    w.lance = null;
  }
  function stopLoop(d) {
    if (d && d.loop) {
      try { if (d.loop.stop) d.loop.stop(0.12); } catch (err) { /* audio errors never break weapons */ }
      d.loop = null;
    }
  }

  function updateLance(p, w, M, lv) {
    let bm = w.lance;
    if (!bm || bm.dead) {
      bm = w.lance = {
        owner: p, kind: 'lance', x: p.x, y: p.y - 46, angle: UP, width: LANCE.width[lv], length: LANCE.length, dps: 0,
        active: false, pierce: true, color: '#7fe3ff', update: lanceUpdate, draw: lanceDraw, dead: false,
        data: { lv, skin: 0, on: 0, t: Math.random() * 10, hits: new Float32Array(16), nh: 0, crackT: 0, crack: new Float32Array(64), loop: null, ringT: 0 },
      };
      SL.world.beams.push(bm);
    }
    const sk = skinOf(p);
    bm.data.lv = lv;
    bm.data.skin = sk;
    bm.width = LANCE.width[lv];
    bm.dps = LANCE.dps[lv] * M.dmg * M.rate;
    bm.color = SKINS[sk].spark;
  }

  function lanceUpdate(bm, dt) {
    const p = bm.owner, d = bm.data;
    if (!p || !p.alive || p.down || p.display || p.weapon.type !== 'lance' || SL.world.players.indexOf(p) < 0) {
      stopLoop(d);
      bm.dead = true;
      if (p && p.data && p.data.wpn && p.data.wpn.lance === bm) p.data.wpn.lance = null;
      return;
    }
    bm.active = !!p.firing;
    bm.x = p.x;
    bm.y = p.y - 47;
    d.t += dt;
    d.on = bm.active ? Math.min(1, d.on + dt / 0.09) : 0;
    if (bm.active && !d.loop) d.loop = U.audio('loop', 'lance_loop', { vol: 0.3 + 0.08 * d.lv, x: p.x }) || null;
    else if (!bm.active && d.loop) stopLoop(d);
    if (d.loop && d.loop.set) { try { d.loop.set({ vol: 0.3 + 0.08 * d.lv, pan: U.clamp((p.x / W) * 2 - 1, -1, 1) * 0.6 }); } catch (err) { d.loop = null; } }
    d.nh = 0;
    if (!bm.active) return;
    // entry points of every enemy crossing the beam (visual impact flares)
    const half = bm.width * 0.5, list = SL.world.enemies;
    for (let i = 0; i < list.length && d.nh < 8; i++) {
      const e = list[i];
      if (e.dead || e.dying || e.intangible || e.hidden) continue;
      let iy = -Infinity;
      if (e.circles && e.circles.length) {
        const sc = e.scale || 1;
        for (const c of e.circles) {
          const cx = e.x + c.x * sc, cy = e.y + c.y * sc, r = c.r * sc, dx = cx - bm.x;
          if (dx > r + half || dx < -r - half || cy - r > bm.y) continue;
          const yy = cy + Math.sqrt(Math.max(0, r * r - Math.min(r * r, dx * dx)));
          if (yy > iy) iy = yy;
        }
      } else {
        const r = e.r || 10, dx = e.x - bm.x;
        if (dx > r + half || dx < -r - half || e.y - r > bm.y) continue;
        iy = e.y + Math.sqrt(Math.max(0, r * r - Math.min(r * r, dx * dx))) * 0.85;
      }
      if (iy === -Infinity || iy < 0) continue;
      d.hits[d.nh * 2] = bm.x + (Math.random() - 0.5) * half * 0.6;
      d.hits[d.nh * 2 + 1] = Math.min(iy, bm.y - 4);
      d.nh++;
    }
    if (d.nh && Math.random() < dt * 16) {
      const k = (Math.random() * d.nh) | 0;
      SL.fx.sparks(d.hits[k * 2], d.hits[k * 2 + 1], { count: 3 + d.lv, color: SKINS[d.skin].spark, speed: 300 + d.lv * 40, angle: Math.PI / 2, spread: 2.6, life: 0.28, size: 4 });
    }
    d.crackT -= dt;
    if (d.lv >= 3 && d.crackT <= 0) {
      d.crackT = 0.045;
      for (let k = 0; k < 64; k++) d.crack[k] = Math.random() * 2 - 1;
    }
    d.ringT -= dt;
    if (d.ringT <= 0) {
      d.ringT = 0.16;
      SL.fx.emit({ x: bm.x, y: bm.y + 2, shape: 'ring', size: bm.width * 0.8, size2: bm.width * 3.2, life: 0.22, color: SKINS[d.skin].halo, alpha: 0.6 });
    }
  }

  function lanceDraw(bm, ctx) {
    const d = bm.data, P = profiles()[d.skin], sk = SKINS[d.skin], t = SL.time.real;
    const x = bm.x, y0 = bm.y, top = Math.max(-40, y0 - bm.length), len = y0 - top;
    if (len <= 1) return;
    const lv = d.lv; // 0-based level index
    const flick = 1 + 0.05 * Math.sin(t * 43) + 0.03 * Math.sin(t * 71);
    const wd = bm.width * (0.4 + 0.6 * d.on) * flick;
    // wider beams get less dense so targets and enemy bullets still read through them (ARCHITECTURE 7)
    const tone = 1 - lv * 0.075;
    ctx.globalCompositeOperation = 'lighter';
    // outer halo
    ctx.globalAlpha = (0.3 + 0.06 * Math.sin(t * 9)) * tone;
    ctx.drawImage(P.halo, x - wd * 1.45, top, wd * 2.9, len);
    // scrolling energy body
    const tex = P.tex, TH = 190, tw = wd * 1.25;
    let yb = y0, v = (t * 2.4) % 1;
    ctx.globalAlpha = 0.92 * tone;
    let guard = 20;
    while (yb > top && guard-- > 0) {
      const seg = Math.min((1 - v) * TH, yb - top);
      const sh = (seg / TH) * tex.height;
      const sy = (1 - v) * tex.height - sh;
      if (sh > 0.5) ctx.drawImage(tex, 0, Math.max(0, sy), tex.width, Math.min(sh, tex.height), x - tw / 2, yb - seg, tw, seg);
      yb -= seg;
      v = 0;
    }
    // white-hot core: narrower than the body at high levels
    const cw = Math.min(wd * 0.84, 4 + wd * 0.4);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(P.core, x - cw / 2, top, cw, len);
    // energy packets racing up the beam
    for (let k = 0; k < 3; k++) {
      const yy = y0 - ((t * 2300 + k * 431) % (len + 200));
      if (yy > top) A.drawGlow(ctx, x, yy, wd * 0.95 + 6, sk.halo, 0.42 * tone);
    }
    // crackling edges from L4: broken jagged arcs that hug the beam edge and re-roll every 45 ms
    if (lv >= 3) {
      const seg = 22, n = Math.min(64, Math.ceil(len / seg)), cr = d.crack;
      ctx.lineCap = 'round';
      for (let side = -1; side <= 1; side += 2) {
        const so = side > 0 ? 17 : 0;
        ctx.beginPath();
        let pen = false;
        for (let k = 0; k <= n; k++) {
          const r = cr[(k * 3 + so) & 63];
          if (r < -0.35) { pen = false; continue; }
          const yy = y0 - k * seg - r * 6;
          const xx = x + side * (wd * 0.5 + 1 + Math.abs(cr[(k * 5 + so + 7) & 63]) * wd * 0.24);
          if (!pen) { ctx.moveTo(xx, yy); pen = true; } else ctx.lineTo(xx, yy);
        }
        ctx.strokeStyle = C.rgba(sk.halo, 0.3);
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.62)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      if (lv >= 4) {
        // short forks leaping off the beam
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const r = cr[k * 7 + 3], yy = y0 - 60 - ((k * 0.19 + (r + 1) * 0.31) % 1) * Math.min(len - 60, 1000);
          const side = cr[k * 5 + 1] > 0 ? 1 : -1, x1 = x + side * wd * 0.62;
          ctx.moveTo(x1, yy);
          ctx.lineTo(x1 + side * (7 + Math.abs(r) * 12), yy - 9 - r * 7);
          ctx.lineTo(x1 + side * (12 + Math.abs(r) * 18), yy - 3 + r * 9);
        }
        ctx.strokeStyle = C.rgba(sk.body, 0.75);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // impact flares where enemies cross the beam
    for (let k = 0; k < d.nh; k++) {
      const hx = d.hits[k * 2], hy = d.hits[k * 2 + 1];
      const pul = 0.8 + 0.2 * Math.sin(t * 50 + k);
      A.drawGlow(ctx, hx, hy, (wd * 0.95 + 12) * pul, sk.halo, 0.6);
      A.drawSprite(ctx, spr(FLARE_KEYS[d.skin]), hx, hy, t * 3 + k, (wd * 0.03 + 0.8) * pul, 0.85);
    }
    // muzzle flare
    A.drawGlow(ctx, x, y0, wd * 1.15 + 10, sk.halo, 0.8);
    A.drawSprite(ctx, spr(FLARE_KEYS[d.skin]), x, y0, t * 2.2, wd * 0.035 + 0.8, 1);
    A.drawGlow(ctx, x, y0, wd * 0.5 + 4, '#ffffff', 0.8);
  }

  // ------------------------------------------------------------------ Twin Link (GDD 12)
  const LINK = { active: false, t: 0, charge: 0, k: 0, a: null, b: null, beam: null, loop: null };
  function alive(p) { return !!(p && p.alive && !p.down && !p.display); }
  function linked(p) { return LINK.active && (p === LINK.a || p === LINK.b); }

  function ensureLinkBeam() {
    if (LINK.beam && !LINK.beam.dead) return;
    let a = null, b = null;
    for (const q of SL.world.players) {
      if (q.display) continue;
      if (!a) a = q; else if (!b) { b = q; break; }
    }
    if (!a || !b) return;
    LINK.a = a;
    LINK.b = b;
    LINK.active = false;
    LINK.t = 0;
    LINK.beam = { owner: a, kind: 'twin_link', x: a.x, y: a.y, angle: 0, width: LINK_CFG.width, length: 1, dps: LINK_CFG.dps, active: false, pierce: true, color: '#d8f0ff', update: linkUpdate, draw: linkDraw, dead: false, data: { t: 0 } };
    SL.world.beams.push(LINK.beam);
  }
  function linkSet(on) {
    if (LINK.active === on) return;
    LINK.active = on;
    const a = LINK.a, b = LINK.b;
    if (on) {
      LINK.loop = U.audio('loop', 'twin_link', { vol: 0.4 }) || null;
      if (a && b) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        SL.fx.text(mx, my - 40, 'TWIN LINK', { color: '#e6f4ff', size: 24, life: 1.1, rise: 40, weight: 800 });
        SL.fx.sparks(a.x, a.y, { count: 10, color: '#7fe3ff', speed: 300, life: 0.35, size: 4 });
        SL.fx.sparks(b.x, b.y, { count: 10, color: '#ffd27a', speed: 300, life: 0.35, size: 4 });
        SL.fx.emit({ x: mx, y: my, shape: 'ring', size: 20, size2: 160, life: 0.4, color: '#e8f2ff', alpha: 0.7 });
      }
    } else {
      stopLoop(LINK);
      LINK.t = 0;
    }
    SL.bus.emit('twinLink', { active: on, a, b });
  }
  function linkUpdate(bm, dt) {
    const a = LINK.a, b = LINK.b, ps = SL.world.players;
    if (bm !== LINK.beam || !a || !b || ps.indexOf(a) < 0 || ps.indexOf(b) < 0) {
      if (bm === LINK.beam) { linkSet(false); LINK.beam = null; }
      bm.dead = true;
      return;
    }
    const ok = alive(a) && alive(b) && !a.outro && !b.outro;
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy);
    if (!LINK.active) {
      if (ok && dist < LINK_CFG.form) {
        LINK.t += dt;
        if (LINK.t >= LINK_CFG.time) linkSet(true);
      } else LINK.t = Math.max(0, LINK.t - dt * 2.5);
    } else if (!ok || dist > LINK_CFG.hold) linkSet(false);
    LINK.charge = LINK.active ? 1 : U.clamp(LINK.t / LINK_CFG.time, 0, 1);
    LINK.k = U.approach(LINK.k, LINK.active ? 1 : 0, dt * 6);
    bm.data.t += dt;
    bm.active = LINK.active;
    bm.x = a.x;
    bm.y = a.y;
    bm.angle = Math.atan2(dy, dx);
    bm.length = Math.max(1, dist);
    if (LINK.loop && LINK.loop.set) { try { LINK.loop.set({ vol: 0.35, pan: U.clamp(((a.x + b.x) / W) - 1, -1, 1) * 0.5 }); } catch (err) { LINK.loop = null; } }
  }
  function linkDraw(bm, ctx) {
    profiles();
    const a = LINK.a, b = LINK.b;
    if (!a || !b) return;
    const t = SL.time.real, k = 0.4 + 0.6 * LINK.k;
    const base = SL.render.base, bs = base.s;
    const c = Math.cos(bm.angle), s = Math.sin(bm.angle);
    const inset = 16, len = bm.length - inset * 2;
    if (len <= 2) return;
    const x0 = a.x + c * inset, y0 = a.y + s * inset;
    ctx.globalCompositeOperation = 'lighter';
    ctx.setTransform(c * bs, s * bs, -s * bs, c * bs, base.x + x0 * bs, base.y + y0 * bs);
    const wpx = 18 + 3 * Math.sin(t * 11);
    ctx.globalAlpha = 0.9 * k;
    ctx.drawImage(TETHER, 0, -wpx / 2, len, wpx);
    ctx.globalAlpha = 0.45 * k;
    ctx.drawImage(TETHER, 0, -wpx * 1.4, len, wpx * 2.8);
    // two interleaved filaments
    for (let f = 0; f < 2; f++) {
      ctx.beginPath();
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const u = i / n, env = Math.sin(u * Math.PI);
        const yy = Math.sin(u * TAU * 2.2 + t * (f ? -9 : 11) + f * 2) * 4.2 * env;
        if (i === 0) ctx.moveTo(u * len, yy); else ctx.lineTo(u * len, yy);
      }
      ctx.globalAlpha = (f ? 0.5 : 0.75) * k;
      ctx.strokeStyle = f ? '#fff1d0' : '#e6f8ff';
      ctx.lineWidth = f ? 1 : 1.3;
      ctx.stroke();
    }
    // beads travelling both ways
    ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i++) {
      const u = (t * 0.8 + i * 0.25) % 1, uu = i % 2 ? 1 - u : u;
      A.drawGlow(ctx, uu * len, 0, 9, LINK_COLS[Math.round(uu * 8)], 0.8 * k);
    }
    // end nodes
    A.drawGlow(ctx, 0, 0, 16 + 3 * Math.sin(t * 8), '#3fc8ff', 0.9 * k);
    A.drawGlow(ctx, len, 0, 16 + 3 * Math.sin(t * 8 + 1), '#ffb53f', 0.9 * k);
  }

  /** Charging tether while the jets hold formation (drawn from the ship pass; the beam itself is inactive). */
  function drawLinkCharge(ctx) {
    const a = LINK.a, b = LINK.b;
    if (LINK.active || LINK.charge <= 0.04 || !alive(a) || !alive(b)) return;
    const t = SL.time.real, k = LINK.charge;
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 36) return;
    const ux = dx / dist, uy = dy / dist, n = 14;
    const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < n; i++) {
      const u = i / n;
      if ((i + Math.floor(t * 18)) % 2) continue;
      const x = a.x + dx * u, y = a.y + dy * u;
      const col = u < 0.5 ? '#3fc8ff' : '#ffb53f';
      A.drawGlow(ctx, x - uy * Math.sin(t * 20 + i) * 2, y + ux * Math.sin(t * 20 + i) * 2, 5 + 4 * k, col, 0.25 + 0.55 * k);
    }
    ctx.globalAlpha = pa;
    ctx.globalCompositeOperation = po;
  }

  // ------------------------------------------------------------------ jet drawing
  const JS = { thr: 1, flash: 0, flashType: 'pulse', flashLv: 0, flashRot: 0, hit: 0, jam: false, od: false, low: 0, pod0: 0, pod1: 0, t: 0 };
  function addSprite(ctx, key, x, y, rot, scale, alpha) {
    const po = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    A.drawSprite(ctx, spr(key), x, y, rot, scale, alpha);
    ctx.globalCompositeOperation = po;
  }

  /** Draws jet i (0 Starlance, 1 Sunlance) centered at x, y in the ctx's current space (any canvas). */
  function drawJetAt(ctx, i, x, y, bank, st) {
    const f = frameOf(bank), M = META[f], J = JET[i];
    const t = st.t, thr = st.thr;
    const ga = ctx.globalAlpha;
    // engine plumes (behind the hull): long soft exhaust, outer flame, white-hot core, afterburner
    const ex = spr(EXHAUST_KEYS[i]).canvas;
    for (let k = 0; k < 2; k++) {
      const nx = x + M.noz[k][0], ny = y + M.noz[k][1] - 1.5;
      const fl = thr * (0.93 + 0.07 * Math.sin(t * 57 + k * 1.7));
      const exL = (22 + 34 * thr) * (0.9 + 0.06 * Math.sin(t * 31 + k * 2.3) + 0.04 * Math.sin(t * 73 + k)), exW = 14 + 3 * thr;
      const pc = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = ga * Math.min(1, 0.55 + 0.35 * thr);
      ctx.drawImage(ex, nx - exW / 2, ny - 1, exW, exL);
      ctx.globalCompositeOperation = pc;
      ctx.globalAlpha = ga * 0.55;
      A.flame(ctx, nx, ny + 1, 14, 24 * fl, J.engine, J.trim, t * 0.9 + k * 0.77);
      ctx.globalAlpha = ga;
      A.flame(ctx, nx, ny, 9.6, 33 * fl, '#ffffff', J.engine, t + k * 0.41);
      if (thr > 1.05) {
        const ab = Math.min(1, (thr - 1.05) * 2.2);
        ctx.globalAlpha = ga * ab * (0.85 + 0.15 * Math.sin(t * 89 + k));
        A.flame(ctx, nx, ny + 1, 13, 50 * fl, J.engine, J.trim, t * 1.3 + k);
        ctx.globalAlpha = ga;
        for (let m = 0; m < 3; m++) A.drawGlow(ctx, nx, ny + 8 + m * 9 * fl, 5.4 - m * 1.1, '#ffffff', ab * (0.6 - m * 0.14) * (0.7 + 0.3 * Math.sin(t * 70 + m * 2 + k)));
      }
      A.drawGlow(ctx, nx, ny + 1.5, 10, J.engine, 0.6);
    }
    if (st.od) A.drawGlow(ctx, x, y + 4, 74 + 6 * Math.sin(t * 6), '#ffcf5a', 0.22);
    // hull
    A.drawSprite(ctx, spr(JET_KEYS[i][f]), x, y, 0, 1, 1);
    // breathing trim glow (flickers under ion jam, hot in overdrive)
    let tg = 0.22 + 0.14 * Math.sin(t * 2.7);
    if (st.jam) tg = Math.random() < 0.45 ? 0.04 : 0.85;
    else if (st.od) tg = 0.8;
    addSprite(ctx, GLOW_KEYS[i][f], x, y, 0, 1, tg);
    // nav lights: red left, green right, 1 Hz
    const ph = (st.t2 + i * 0.5) % 1, on = ph < 0.14 ? 1 - ph / 0.14 : 0;
    A.drawGlow(ctx, x + M.tip[0][0], y + M.tip[0][1], 4.5 + 10 * on, '#ff3b4f', 0.4 + 0.6 * on);
    A.drawGlow(ctx, x + M.tip[1][0], y + M.tip[1][1], 4.5 + 10 * on, '#3dff8a', 0.4 + 0.6 * on);
    // tail strobes: double blink every 2 s
    const sp = (st.t2 * 0.5 + i * 0.3) % 1, strobe = sp < 0.04 || (sp > 0.09 && sp < 0.13) ? 1 : 0;
    if (strobe) for (const ft of M.fin) A.drawGlow(ctx, x + ft[0], y + ft[1], 7, '#ffffff', 0.8);
    // canopy glint sweeping front to back every ~3.4 s
    const gp = (st.t2 * 0.29 + i * 0.4) % 1;
    if (gp < 0.15) {
      const k = gp / 0.15, g0 = M.glint[0], g1 = M.glint[1];
      addSprite(ctx, 'wpn:glint', x + g0[0] + (g1[0] - g0[0]) * k, y + g0[1] + (g1[1] - g0[1]) * k, -0.2, 0.9, Math.sin(k * Math.PI));
      if (k > 0.25 && k < 0.6) addSprite(ctx, 'wpn:sparkle', x + g0[0] + (g1[0] - g0[0]) * k, y + g0[1] + (g1[1] - g0[1]) * k, t * 2, 0.55, Math.sin((k - 0.25) / 0.35 * Math.PI));
    }
    // muzzle flashes
    if (st.flash > 0) {
      const skin = st.skin, mk = spr(MUZZLE_KEYS[skin]);
      const a = st.flash, sc = 0.55 + 0.6 * a;
      if (st.flashType === 'spread') {
        addSprite(ctx, MUZZLE_KEYS[skin], x + M.nose[0], y + M.nose[1] - 6, st.flashRot * 0.3, sc * 1.25, a);
        A.drawGlow(ctx, x + M.nose[0], y + M.nose[1] - 2, 18 * a + 6, SKINS[skin].halo, a * 0.8);
      } else {
        const L = PULSE.layout[st.flashLv] || PULSE.layout[0];
        for (const row of L) {
          addSprite(ctx, MUZZLE_KEYS[skin], x + row[0] * M.c, y + row[1] - 6, row[2] + st.flashRot * 0.25, sc * (row[3] > 1.3 ? 1.3 : 1), a);
        }
      }
      void mk;
    }
    for (let k = 0; k < 2; k++) {
      const pf = k ? st.pod1 : st.pod0;
      if (pf > 0) A.drawGlow(ctx, x + M.pod[k][0], y + M.pod[k][1] + 4, 14 * pf + 4, '#ffd9a0', pf);
    }
    // damage: hot ember on the hull at low hull
    if (st.low > 0) {
      const e = M.dmg[0], e2 = M.dmg[3];
      const fl = 0.5 + 0.5 * Math.sin(t * 23) * Math.sin(t * 9.7);
      A.drawGlow(ctx, x + e[0], y + e[1], 6 + 5 * fl, '#ff8a3d', st.low * (0.5 + 0.4 * fl));
      if (st.low > 0.5) A.drawGlow(ctx, x + e2[0], y + e2[1], 5 + 4 * fl, '#ff6a2a', 0.7 * fl);
    }
    // hit flash
    if (st.hit > 0) A.drawFlash(ctx, spr(JET_KEYS[i][f]), x, y, 0, 1, st.hit);
    ctx.globalAlpha = ga;
  }

  function jetState(p) {
    const w = p.data && p.data.wpn;
    JS.t = SL.time.real + (p.index || 0) * 0.37;
    JS.t2 = SL.time.real;
    if (w) {
      JS.thr = w.thr;
      JS.flash = w.flash;
      JS.flashType = w.flashType;
      JS.flashLv = w.flashLv;
      JS.flashRot = w.flashRot;
      JS.pod0 = w.podFlash[0];
      JS.pod1 = w.podFlash[1];
    } else {
      JS.thr = U.clamp(1 - ((p.vy || 0) / 560) * 0.55, 0.6, 1.6);
      JS.flash = 0;
      JS.pod0 = JS.pod1 = 0;
    }
    JS.skin = skinOf(p);
    JS.hit = p.hitT > 0.27 ? Math.min(1, (p.hitT - 0.27) / 0.08) * 0.85 : 0;
    JS.jam = !!(p.data && p.data.ionJamT > 0);
    JS.od = !!overdriveOf(p);
    const frac = p.maxHull > 0 ? p.hull / p.maxHull : 1;
    JS.low = p.display || frac > 0.3 ? 0 : frac > 0.15 ? 0.6 : 1;
    return JS;
  }

  // ------------------------------------------------------------------ cosmetics in update
  function updateCosmetics(p, w, dt, M) {
    let target = U.clamp(1 - ((p.vy || 0) / 560) * 0.55, 0.62, 1.6);
    if (p.entering > 0 || p.outro) target = 1.75;
    w.thr += (target - w.thr) * Math.min(1, dt * 8);
    if (w.flash > 0) w.flash = Math.max(0, w.flash - dt / 0.065);
    for (let k = 0; k < 2; k++) if (w.podFlash[k] > 0) w.podFlash[k] = Math.max(0, w.podFlash[k] - dt / 0.12);
    if (p.gun > 0) p.gun = Math.max(0, p.gun - dt * 18);
    const frac = p.maxHull > 0 ? p.hull / p.maxHull : 1;
    if (frac <= 0.3) {
      w.sparkT -= dt;
      if (w.sparkT <= 0) {
        const sev = frac <= 0.15;
        w.sparkT = (sev ? 0.05 : 0.13) + Math.random() * 0.12;
        const F = META[frameOf(p.bank)], pt = F.dmg[(Math.random() * F.dmg.length) | 0];
        const x = p.x + pt[0], y = p.y + pt[1];
        SL.fx.sparks(x, y, { count: sev ? 4 : 2, color: '#ffcf7a', speed: 260, angle: Math.PI / 2, spread: 2.4, life: 0.32, size: 3.5 });
        SL.fx.emit({ x, y, vx: (Math.random() - 0.5) * 30, vy: 110 + Math.random() * 70, shape: 'smoke', size: 8, size2: 26, life: 0.75, color: '#6c7282', alpha: 0.5, ease: true, drag: 1.2, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 3 });
        if (sev && Math.random() < 0.5) SL.fx.emit({ x, y, vy: 120, shape: 'fire', size: 9, size2: 4, life: 0.25, color: '#ffb35a', color2: '#ff5a2a' });
      }
    }
    if (M.jam) {
      w.jamT -= dt;
      if (w.jamT <= 0) {
        w.jamT = 0.05 + Math.random() * 0.08;
        const F = META[frameOf(p.bank)], pt = F.dmg[(Math.random() * F.dmg.length) | 0];
        SL.fx.sparks(p.x + pt[0], p.y + pt[1], { count: 2, color: '#9fd4ff', speed: 170, life: 0.16, size: 3 });
        SL.fx.emit({ x: p.x + pt[0], y: p.y + pt[1], shape: 'glow', size: 14, size2: 4, life: 0.1, color: '#8fc8ff', alpha: 0.9 });
      }
    }
  }

  // ------------------------------------------------------------------ public API
  function emitChange(p, reason) {
    SL.bus.emit('weaponChange', { p, type: p.weapon.type, level: p.weapon.level, missiles: p.missiles | 0, reason });
  }
  function label(p) {
    if (!p || !p.weapon) return '';
    return String(p.weapon.type || 'pulse').toUpperCase() + ' L' + (p.weapon.level | 0);
  }

  const DRAW_OPTS_STATE = { thr: 1, flash: 0, flashType: 'pulse', flashLv: 0, flashRot: 0, hit: 0, jam: false, od: false, low: 0, pod0: 0, pod1: 0, t: 0, t2: 0, skin: 0 };

  SL.weapons = {
    TYPES, PULSE, SPREAD, LANCE, MISSILES, LINK: LINK_CFG, SKINS, JET, FRAMES,
    twinLink: LINK,
    dps,
    label,
    linked,

    update(p, dt) {
      if (!p || !p.weapon) return;
      const w = state(p);
      if (p.data.wpnSafe) p.firing = false;
      if (TYPES.indexOf(p.weapon.type) < 0) { U.warnOnce('wpn-type:' + p.weapon.type, 'unknown weapon type "' + p.weapon.type + '"; using pulse'); p.weapon.type = 'pulse'; }
      p.weapon.level = U.clamp(p.weapon.level | 0 || 1, 1, 5);
      if (p.data.ionJamT > 0) p.data.ionJamT = Math.max(0, p.data.ionJamT - dt);
      ensureLinkBeam();
      const M = computeMods(p);
      if (p.data.ionJamT > 0) M.jam = true;
      updatePrimary(p, w, dt, M);
      updateMissiles(p, w, dt, M);
      updateCosmetics(p, w, dt, M);
    },

    drawShip(p, ctx) {
      if (p.data && p.data.wpnHide) return;
      const st = jetState(p);
      drawJetAt(ctx, p.index ? 1 : 0, p.x, p.y, p.bank || 0, st);
      if (p === LINK.b) drawLinkCharge(ctx);
    },

    /** Draw a jet anywhere (UI, hangar, menus): {index, x, y, bank (-0.35..0.35), throttle, scale, t}. */
    drawJet(ctx, o) {
      o = o || {};
      const st = DRAW_OPTS_STATE;
      st.t = st.t2 = o.t != null ? o.t : SL.time.real;
      st.thr = o.throttle != null ? o.throttle : 1;
      st.skin = o.index ? 1 : 0;
      const sc = o.scale || 1;
      if (sc !== 1) {
        ctx.save();
        ctx.translate(o.x || 0, o.y || 0);
        ctx.scale(sc, sc);
        drawJetAt(ctx, o.index ? 1 : 0, 0, 0, o.bank || 0, st);
        ctx.restore();
      } else drawJetAt(ctx, o.index ? 1 : 0, o.x || 0, o.y || 0, o.bank || 0, st);
    },

    setType(p, type) {
      if (!p || !p.weapon) return false;
      if (TYPES.indexOf(type) < 0) { U.warnOnce('wpn-set:' + type, 'SL.weapons.setType: unknown type "' + type + '"'); return false; }
      if (p.weapon.type === type) return SL.weapons.levelUp(p);
      p.weapon.type = type;
      if (type !== 'lance' && p.data.wpn) killLance(p.data.wpn);
      emitChange(p, 'type');
      return true;
    },

    levelUp(p) {
      if (!p || !p.weapon) return false;
      if ((p.weapon.level | 0) >= 5) return false;
      p.weapon.level = U.clamp((p.weapon.level | 0) + 1, 1, 5);
      emitChange(p, 'level');
      if (p.weapon.level >= 5) SL.bus.emit('weaponMax', { p, type: p.weapon.type });
      return true;
    },

    levelDown(p) {
      if (!p || !p.weapon) return;
      const before = p.weapon.level | 0;
      p.weapon.level = Math.max(1, before - 1);
      if (p.weapon.level !== before) emitChange(p, 'down');
    },

    addMissile(p) {
      if (!p) return false;
      if ((p.missiles | 0) >= 3) return false;
      p.missiles = U.clamp((p.missiles | 0) + 1, 0, 3);
      emitChange(p, 'missile');
      return true;
    },

    fireMissile,

    onPlayerDown(p) {
      if (!p || !p.weapon) return;
      const w = state(p);
      killLance(w);
      w.mq.length = 0;
      w.flash = 0;
      const s = SL.game && SL.game.session;
      let partner = null;
      for (const q of SL.world.players) if (q !== p && q.alive && !q.down && !q.display) { partner = q; break; }
      // co-op: a revive costs nothing; the penalty lands only if the revive timer runs out (playerRespawn)
      if (s && s.coop && partner) w.penalty = true;
      else SL.weapons.levelDown(p);
    },

    /** Sandbox 'weapons': jump to config k (0-14 primaries L1-5, 15-17 missiles L1-3, 18-20 overdrive / ion jam). */
    sandboxConfig(k) { return SB.config ? SB.config(k) : 0; },

    /** Debug/sandbox: set a player's loadout directly. */
    debugSet(index, type, level, missiles) {
      const p = SL.world.players.find((q) => q.index === (index | 0) && !q.display);
      if (!p) return false;
      if (type && TYPES.indexOf(type) >= 0) p.weapon.type = type;
      if (level != null) p.weapon.level = U.clamp(level | 0, 1, 5);
      if (missiles != null) p.missiles = U.clamp(missiles | 0, 0, 3);
      if (p.weapon.type !== 'lance' && p.data.wpn) killLance(p.data.wpn);
      if (SB.active) { SB.hold = true; SB.reset(); }
      return label(p) + ' M' + (p.missiles | 0);
    },
  };

  SL.bus.on('playerRespawn', (e) => {
    const p = e && e.p, w = p && p.data && p.data.wpn;
    if (w && w.penalty) { w.penalty = false; SL.weapons.levelDown(p); }
  });
  SL.bus.on('playerRevive', (e) => {
    const w = e && e.p && e.p.data && e.p.data.wpn;
    if (w) w.penalty = false;
  });
  SL.bus.on('worldReset', () => {
    stopLoop(LINK);
    LINK.active = false;
    LINK.t = 0;
    LINK.charge = 0;
    LINK.k = 0;
    LINK.beam = null;
    LINK.a = LINK.b = null;
    for (const p of SL.world.players) if (p.data && p.data.wpn && p.data.wpn.lance) stopLoop(p.data.wpn.lance.data);
  });
  SL.bus.on('missionEnd', () => {
    stopLoop(LINK);
    for (const p of SL.world.players) if (p.data && p.data.wpn && p.data.wpn.lance) stopLoop(p.data.wpn.lance.data);
  });

  SL.onBoot(() => {
    profiles();
    const keys = ['wpn:bolt:0', 'wpn:pellet:0', 'wpn:flare:0', 'wpn:muzzle:0', 'wpn:missile:0', 'wpn:streak:0', 'wpn:glint', 'wpn:sparkle', 'wpn:exhaust0'];
    for (let f = 0; f < FRAMES; f++) keys.push(JET_KEYS[0][f], GLOW_KEYS[0][f]);
    A.prewarm(keys);
  });
  SL.bus.on('missionStart', (e) => {
    if (e && e.session && e.session.coop) {
      const keys = ['wpn:bolt:1', 'wpn:pellet:1', 'wpn:flare:1', 'wpn:muzzle:1', 'wpn:missile:1', 'wpn:streak:1', 'wpn:exhaust1'];
      for (let f = 0; f < FRAMES; f++) keys.push(JET_KEYS[1][f], GLOW_KEYS[1][f]);
      A.prewarm(keys);
    }
  });

  // ------------------------------------------------------------------ sandboxes
  const SB = { active: false, hold: false, reset() {} };

  A.define('wpn:target', 76, 76, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, E = SL.pal.enemy;
    const ring = new Path2D();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU - Math.PI / 2;
      const x = cx + Math.cos(a) * 34, y = cy + Math.sin(a) * 34;
      if (k === 0) ring.moveTo(x, y); else ring.lineTo(x, y);
    }
    ring.closePath();
    A.metal(ctx, ring, { base: E.hull2, light: '#8d94ad', dark: '#0b0c12', spec: 0.5, edge: 2, rimWidth: 1.4 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU - Math.PI / 2 + Math.PI / 6;
      A.panelLines(ctx, A.poly([[cx + Math.cos(a) * 14, cy + Math.sin(a) * 14], [cx + Math.cos(a) * 30, cy + Math.sin(a) * 30]], true), '#000', 0.55);
    }
    const hub = new Path2D();
    hub.arc(cx, cy, 17, 0, TAU);
    A.metal(ctx, hub, { base: E.hull, light: '#6d7390', dark: '#05060a', spec: 0.6, edge: 1.4 });
    const core = new Path2D();
    core.arc(cx, cy, 8, 0, TAU);
    A.emissive(ctx, core, E.glow, 10);
    const seam = new Path2D();
    seam.arc(cx, cy, 25, 0, TAU);
    A.emissive(ctx, seam, E.seam, 6, { stroke: 1.2 });
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 3, 2.4, 0, TAU);
    ctx.fill();
  }, { pad: 6, res: 2 });

  const TARGET = {
    id: 'wpn_target', name: 'Target drone', hp: 1e7, r: 32, score: 0, credits: null, noCount: true, noClear: true,
    offscreenKill: false, contactDamage: 0, manualMove: true, noRam: true, dropChance: 0,
    update(e) {
      const pr = e.params;
      e.x = pr.hx + Math.sin(e.age * pr.fx + pr.ph) * pr.sway;
      e.y = pr.hy + Math.cos(e.age * 0.9 + pr.ph) * 6;
      e.rot = Math.sin(e.age * 0.7 + pr.ph) * 0.2;
    },
    draw(e, ctx) {
      const t = SL.time.real + e.params.ph;
      A.drawGlow(ctx, e.x, e.y, 46, SL.pal.enemy.glow, 0.18 + 0.06 * Math.sin(t * 3));
      SL.world.drawDefault(e, ctx);
    },
    sprite: 'wpn:target',
  };

  function spawnTarget(x, y, sway, fx, ph) {
    return SL.spawnEnemy(TARGET, { x, y, noCount: true, offscreenKill: false, params: { hx: x, hy: y, sway: sway || 0, fx: fx || 1, ph: ph || 0 } });
  }

  function textProp(drawFn) {
    return SL.spawnProp({ r: 1, draw: (pr, ctx) => drawFn(ctx, pr), update() {} }, { x: W / 2, y: 40 });
  }
  function panelText(ctx, x, y, lines, color) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '700 22px Oxanium, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let wmax = 0;
    for (const l of lines) wmax = Math.max(wmax, ctx.measureText(l).width);
    const hgt = lines.length * 28 + 14;
    ctx.fillStyle = 'rgba(4,8,18,0.62)';
    ctx.strokeStyle = 'rgba(127,227,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - wmax / 2 - 18, y - 21, wmax + 36, hgt, 8);
    ctx.fill();
    ctx.stroke();
    lines.forEach((l, k) => {
      ctx.font = (k ? '600 18px ' : '700 22px ') + 'Oxanium, "Segoe UI", sans-serif';
      ctx.fillStyle = k ? '#9fb4cf' : color || '#d8ecff';
      ctx.fillText(l, x, y + k * 28);
    });
    ctx.restore();
  }

  if (SL.debug && SL.debug.sandbox) {
    // Cycles every primary at L1-5 and missiles L1-3 against target drones; measures single-target DPS.
    SL.debug.sandbox('weapons', (s) => {
      const ps = SL.world.players.filter((q) => !q.display);
      const p = ps[0];
      if (!p) return null;
      const CFG = [];
      for (const type of TYPES) for (let lv = 1; lv <= 5; lv++) CFG.push({ type, lv, mis: 0 });
      for (let m = 1; m <= 3; m++) CFG.push({ type: 'pulse', lv: 1, mis: m });
      CFG.push({ type: 'pulse', lv: 4, mis: 2, od: true }, { type: 'spread', lv: 4, mis: 2, jam: true }, { type: 'lance', lv: 3, mis: 0, od: true });
      const main = spawnTarget(360, 530, 0, 1, 0);
      spawnTarget(360, 395, 10, 0.8, 1.3);
      spawnTarget(360, 268, 14, 0.7, 2.1);
      spawnTarget(165, 405, 26, 0.9, 0.4);
      spawnTarget(555, 405, 26, 1.0, 2.7);
      let idx = 0, t = 0, acc = 0, accMis = 0, meas = 0, shown = 0, shownMis = 0;
      SB.active = true;
      SB.hold = false;
      SB.reset = () => { t = 0; acc = 0; accMis = 0; meas = 0; shown = 0; shownMis = 0; };
      const apply = () => {
        const c = CFG[idx];
        for (const q of ps) {
          q.weapon.type = c.type;
          q.weapon.level = c.lv;
          q.missiles = c.mis;
          q.data.overdrive = c.od ? true : null;
          if (c.type !== 'lance' && q.data.wpn) killLance(q.data.wpn);
        }
        SB.reset();
      };
      SB.config = (k) => { idx = U.clamp(k | 0, 0, CFG.length - 1); apply(); SB.hold = true; return CFG.length; };
      apply();
      SL.bus.onMission('enemyHit', (ev) => {
        if (!ev || ev.e !== main || ev.by !== p || t < 0.8) return;
        if (ev.type === 'missile') accMis += ev.amount || 0; else acc += ev.amount || 0;
      });
      SL.bus.onMission('missionEnd', () => { SB.active = false; });
      textProp((ctx) => {
        const c = CFG[idx];
        const head = (p.weapon.type.toUpperCase() + ' L' + p.weapon.level) + (p.missiles ? '  +  MISSILES L' + p.missiles : '');
        const gdd = dps(p.weapon.type, p.weapon.level) * ((p.stats && p.stats.damageMul) || 1);
        const M = computeMods(p), mul = (M.rate * M.dmg) / ((p.stats && p.stats.damageMul) || 1);
        const exp = mul !== 1 ? ' x' + mul.toFixed(2) + ' = ' + Math.round(gdd * mul) : '';
        const lines = [head, 'GDD ' + Math.round(gdd) + exp + '   measured ' + (shown ? Math.round(shown) : '...') + ' DPS'];
        if (p.missiles) lines.push('missiles GDD ' + Math.round(dps('missile', p.missiles)) + (mul !== 1 ? ' x' + mul.toFixed(2) : '') + '   measured ' + (shownMis ? Math.round(shownMis) : '...'));
        if (linked(p)) lines.push('TWIN LINK +15%');
        if (c.od) lines.push('OVERDRIVE  fire rate x1.5  damage x1.25');
        if (c.jam) lines.push('ION JAM  fire rate x0.5');
        panelText(ctx, W / 2, ps.length > 1 ? H - 96 - (lines.length - 2) * 28 : 104, lines, '#bfefff');
      });
      return (dt) => {
        for (let k = 0; k < ps.length; k++) {
          const q = ps[k];
          if (!q.alive) continue;
          if (CFG[idx].jam) q.data.ionJamT = 0.1;
          const hx = k ? W / 2 + 104 : W / 2; // P1 under the measured drone, P2 off its right side (still linked)
          q.x += (hx - q.x) * Math.min(1, dt * 6);
          q.y += (H - 210 - q.y) * Math.min(1, dt * 6);
        }
        t += dt;
        if (t > 0.8) {
          meas += dt;
          if (meas > 0.25) { shown = acc / (t - 0.8); shownMis = accMis / (t - 0.8); }
        }
        if (!SB.hold && t > 3.4) {
          idx = (idx + 1) % CFG.length;
          apply();
        }
      };
    }, { name: 'Weapons', god: true });

    // Twin Link: both jets fly formation, cut through drifting drones with the tether, separate and re-link.
    SL.debug.sandbox('twinlink', (s) => {
      if (!s.coop) {
        SL.after(0.05, () => SL.debug.runSandbox('twinlink', { coop: true }));
        return null;
      }
      const ps = SL.world.players.filter((q) => !q.display);
      ps.forEach((q, k) => { q.weapon.type = k ? 'spread' : 'pulse'; q.weapon.level = 3; q.missiles = 1; });
      spawnTarget(250, 300, 40, 0.8, 0);
      spawnTarget(470, 260, 40, 0.9, 1.7);
      let t = 0, dt0 = 0;
      SL.every(2.2, () => {
        const e = spawnTarget(-40, 0, 0, 1, 0);
        e.params.lane = true;
        e.data.vx = 150;
      });
      textProp((ctx) => {
        panelText(ctx, W / 2, 196, [LINK.active ? 'TWIN LINK ACTIVE' : LINK.charge > 0.04 ? 'LINKING ' + Math.round(LINK.charge * 100) + '%' : 'NO LINK',
          'form < 160 px for 1.0 s  ·  hold < 220 px  ·  +15% dmg  ·  tether 60 DPS'], LINK.active ? '#e6f4ff' : '#9fb4cf');
      });
      return (dt) => {
        t += dt;
        dt0 += dt;
        const cyc = t % 9, apart = cyc > 6.2 && cyc < 8;
        const cx = W / 2 + Math.sin(t * 0.7) * 120, cy = H - 300 + Math.sin(t * 1.1) * 40;
        const half = apart ? 150 : 62;
        ps.forEach((q, k) => {
          if (!q.alive) return;
          const tx = cx + (k ? half : -half), ty = cy + (k ? -18 : 18);
          SL.input.inject(q.index, { mx: U.clamp((tx - q.x) / 50, -1, 1), my: U.clamp((ty - q.y) / 50, -1, 1) });
        });
        for (const e of SL.world.enemies) {
          if (e.params && e.params.lane) { e.params.hx += 150 * dt; e.params.hy = cy - 10; if (e.params.hx > W + 60) SL.world.kill(e); }
        }
      };
    }, { name: 'Twin Link', god: true });

    // Jet close-ups: P1 and P2 at 2x, banking left, level (afterburner) and right.
    SL.debug.sandbox('jets', () => {
      for (const q of SL.world.players) { q.control = false; q.data.wpnHide = true; }
      const banks = [-0.35, 0, 0.35], lbl = ['BANK LEFT', 'LEVEL  ·  AFTERBURNER', 'BANK RIGHT'];
      const st = { thr: 1, flash: 0, flashType: 'pulse', flashLv: 0, flashRot: 0, hit: 0, jam: false, od: false, low: 0, pod0: 0, pod1: 0, t: 0, t2: 0, skin: 0 };
      textProp((ctx) => {
        const T = SL.time.real;
        for (let i = 0; i < 2; i++) {
          const rowY = i ? 760 : 330;
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.font = '800 26px Oxanium, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = i ? '#ffd27a' : '#bfefff';
          ctx.fillText(JET[i].name, W / 2, rowY - 170);
          ctx.restore();
          for (let k = 0; k < 3; k++) {
            const x = 130 + k * 230;
            st.t = T + i * 0.37 + k * 0.21;
            st.t2 = T + k * 0.33;
            st.thr = k === 1 ? 1.45 + 0.08 * Math.sin(T * 3) : 1;
            st.skin = i;
            ctx.save();
            ctx.translate(x, rowY);
            ctx.scale(2, 2);
            drawJetAt(ctx, i, 0, 0, banks[k], st);
            ctx.restore();
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.font = '600 15px Oxanium, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#8fa3bf';
            ctx.fillText(lbl[k], x, rowY + 172);
            ctx.restore();
          }
        }
      });
    }, { name: 'Jets', god: true, scroll: 50 });
  }
})(window.SL = window.SL || {});
