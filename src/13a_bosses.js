/* 13a_bosses.js (bossesA)
   Provides the bosses boss_razorback (m1), boss_lodestar (m2), boss_tempest (m3) and the mini-bosses mb_hailstorm (s1)
   and mb_tether (s2) of GDD 8.1-8.3, 8.6 and 8.7, plus the alias test_boss (= RAZORBACK) for the stub missions.
   Each boss: pre-rendered multi-layer art with moving parts, intro, every phase with telegraphs, destructible parts
   (core recipe "destructible boss part"), damage states, and a scripted death sequence ending in
   SL.game.bossDefeated(b) plus a credit shower that flies to the nearest jet.
   Public: SL.bossesA = { ids, part(b, id), alive(b, id), jump(b, phaseIndex), last }.
   Sandboxes: boss:<id> for every boss (god mode + autopilot, mid-game loadout; URL &phase=N jumps to phase N (0-based),
   &wl=1..5 weapon level, &ms=0..3 missiles, &hitbox=1 draws hitboxes). See docs/api/bossesA.md. */
(function (SL) {
  'use strict';

  const U = SL.util, A = SL.art, C = SL.color;
  const W = SL.W, H = SL.H, PI = Math.PI, TAU = PI * 2;
  const PAL = SL.pal.enemy, EB = SL.pal.ebullet;
  const IDS = ['boss_razorback', 'boss_lodestar', 'boss_tempest', 'mb_hailstorm', 'mb_tether'];
  const HOT = '#fff3b0';
  const ART = Object.create(null); // boss id -> sprite keys (prewarmed when its mission starts)
  const clamp = U.clamp, lerp = U.lerp;

  // ================================================================== small helpers
  const grnd = (a, b) => SL.rng.range(a, b); // gameplay randomness (seeded per mission)
  const crnd = (a, b) => a + Math.random() * (b - a); // cosmetic only
  function diff() { return (SL.game && SL.game.diff) || {}; }
  function fr() { return diff().fireRate || 1; }
  /** Boss counts scale with the difficulty fire rate (never below 60% of the GDD number); mission tune is ignored. */
  function cnt(n) { return Math.max(1, Math.round(n * Math.max(0.6, fr()))); }
  function bspd() { return diff().bulletSpeed || 1; }
  function sfx(id, o) { U.sfx(id, o); }
  function sm01(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function approach(cur, to, rate, dt) { return cur + (to - cur) * Math.min(1, rate * dt); }
  function debugParams() { return (SL.debug && SL.debug.params) || {}; }

  function lantern() {
    const al = SL.world.allies;
    for (let i = 0; i < al.length; i++) {
      const a = al[i];
      if (a.dead) continue;
      const tid = a.targetId || (a.def && a.def.targetId) || a.typeId;
      if ((tid === 'lantern' || tid === 'ally_lantern') && SL.world.onScreen(a, -20)) return a;
    }
    return null;
  }

  /** Aim point: SL.patterns.target (GDD 7.4) when present, else the nearest live jet. HAILSTORM sends 30% of its
      aimed volleys at the Lantern while it is on screen (b.data.lanternBias). */
  function target(src, b) {
    if (b && b.data && b.data.lanternBias) {
      const ln = lantern();
      if (ln && SL.rng.chance(b.data.lanternBias)) return { x: ln.x, y: ln.y, ref: ln };
    }
    const P = SL.patterns;
    if (P && typeof P.target === 'function') {
      try {
        const t = P.target(src);
        if (t && isFinite(t.x) && isFinite(t.y)) return t;
      } catch (err) { U.warnOnce('bossesA:target', '[bossesA] SL.patterns.target threw; aiming at the nearest jet', err); }
    }
    const p = SL.world.nearestPlayer(src.x, src.y);
    return p ? { x: p.x, y: p.y, ref: p } : { x: W / 2, y: H - 200, ref: null };
  }
  function aimFrom(x, y, b) {
    const t = target({ x, y }, b);
    return Math.atan2(t.y - y, t.x - x);
  }

  // ---------------------------------------------------------------- bullets (GDD 7.2 types with core fallbacks)
  const FALLBACK = {
    orb_huge: { type: 'orbBig', o: { scale: 1.6, color: EB.red, damage: 'l' } },
    spark: { type: 'needle', o: { color: '#c79bff' } },
    petal: { type: 'needle', o: { color: EB.pink } },
    void_orb: { type: 'orb', o: { color: EB.violet, damage: 'm', scale: 1.2 } },
    flare: { type: 'orbBig', o: { color: EB.orange, scale: 1.4, damage: 'l' } },
    missile: { type: 'needle', o: { color: EB.orange, damage: 'm' } },
  };
  const EMPTY = Object.freeze([]);
  function nearJet(x, y, r) {
    const ps = SL.world.players, r2 = r * r;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.alive || p.down || p.display) continue;
      const dx = p.x - x, dy = p.y - y;
      if (dx * dx + dy * dy < r2) return true;
    }
    return false;
  }
  /** One bullet. GDD 7.1: never spawns within 120 px of a living jet. Unknown GDD types fall back to core ones. */
  function fire(x, y, a, speed, type, o) {
    let t = type || 'orb';
    if (!SL.ebulletTypes.has(t)) {
      const f = FALLBACK[t];
      if (f) { o = o ? Object.assign({}, f.o, o) : f.o; t = f.type; } else t = 'orb';
    }
    if (nearJet(x, y, 120)) return null;
    const b = SL.fireEnemy(x, y, a, speed, t, o);
    return b && !b.dead ? b : null;
  }

  // ---------------------------------------------------------------- pattern bridge
  // Every boss attack goes through these. They call SL.patterns.<id> (GDD 7.3, enemies module) when present and fall
  // back to local versions built on fire() otherwise (or when the pattern throws). src is the emitting entity (boss or
  // part; bosses are never mission-tuned), o carries ox/oy offsets plus the pattern options.
  function viaPat(name, args) {
    const P = SL.patterns, fn = P && P[name];
    if (typeof fn !== 'function') return null;
    try { return fn.apply(P, args) || EMPTY; } catch (err) {
      U.warnOnce('bossesA:pat:' + name, '[bossesA] SL.patterns.' + name + ' threw; using the local version', err);
      return null;
    }
  }
  const ox_ = (src, o) => src.x + (o.ox || 0), oy_ = (src, o) => src.y + (o.oy || 0);
  function frOf(o) { return o && o.fr != null ? o.fr : Math.max(0.6, fr()); }
  function scaled(n, o) { return Math.max(1, Math.round(n * frOf(o))); }
  function pAngle(src, o, b) {
    if (typeof o.angle === 'number') return o.angle;
    return aimFrom(ox_(src, o), oy_(src, o), b || src);
  }
  function pAimed(src, o) {
    if (typeof o.angle !== 'number' && o.bias) o = Object.assign({}, o, { angle: pAngle(src, o, o.bias) });
    const r = viaPat('aimed', [src, null, o]);
    if (r) return r;
    const x = ox_(src, o), y = oy_(src, o), n = Math.max(1, o.count || 1), sp = o.spread != null ? o.spread : 0.18 * (n - 1);
    const a0 = pAngle(src, o);
    for (let i = 0; i < n; i++) fire(x, y, n === 1 ? a0 : a0 + (i / (n - 1) - 0.5) * sp, o.speed || 240, o.type || 'orb', o);
    return EMPTY;
  }
  function pFan(src, angle, o) {
    if (angle === 'aim' && o.bias) angle = pAngle(src, o, o.bias);
    const r = viaPat('fan', [src, angle, o]);
    if (r) return r;
    const x = ox_(src, o), y = oy_(src, o), n = Math.max(1, o.count || 5), sp = o.spread != null ? o.spread : 0.9;
    const a0 = angle === 'aim' ? aimFrom(x, y, src) : angle;
    for (let i = 0; i < n; i++) fire(x, y, n === 1 ? a0 : a0 + (i / (n - 1) - 0.5) * sp, o.speed || 220, o.type || 'orb', o);
    return EMPTY;
  }
  function pRing(src, o) {
    const r = viaPat('ring', [src, o]);
    if (r) return r;
    const x = ox_(src, o), y = oy_(src, o), n = Math.max(3, scaled(o.count || 12, o));
    for (let i = 0; i < n; i++) fire(x, y, (o.offset || 0) + (i / n) * TAU, o.speed || 180, o.type || 'orb', o);
    return EMPTY;
  }
  /** GDD burst: aimed volleys repeated `shots` times (re-aimed unless lock). b owns the timed follow-ups. */
  function pBurst(b, src, o) {
    if (typeof o.angle !== 'number' && o.bias) { const t = target({ x: ox_(src, o), y: oy_(src, o) }, o.bias); o = Object.assign({}, o, { target: t.ref || t }); }
    const r = viaPat('burst', [src, o.target || null, o]);
    if (r) return r;
    const n = Math.max(1, o.shots || 3), gap = o.gap != null ? o.gap : 0.12;
    const lockA = o.lock ? pAngle(src, o, o.bias) : null;
    const one = () => { if (!src.dead && !src.dying) pAimed(src, lockA == null ? o : Object.assign({}, o, { angle: lockA })); };
    one();
    for (let i = 1; i < n; i++) later(b, i * gap, one);
    return EMPTY;
  }
  /** GDD ring_stagger, one volley per call: st keeps the alternating half-gap offset. */
  function pRingStagger(st, src, o) {
    const r = viaPat('ring_stagger', [src, Object.assign({}, o, { state: st })]);
    if (r) return r;
    const n = Math.max(3, scaled(o.count || 12, o));
    st.rsPar = !st.rsPar;
    return pRing(src, Object.assign({}, o, { count: n, fr: 1, offset: (o.offset || 0) + (st.rsPar ? PI / n : 0), speed: o.speed || 150 }));
  }
  function pFlower(src, o) {
    const r = viaPat('flower', [src, o]);
    if (r) return r;
    const x = ox_(src, o), y = oy_(src, o), n = Math.max(4, scaled(o.count || 16, o)), turn = o.turn || 0.9;
    for (let i = 0; i < n; i++) {
      const b = fire(x, y, (o.offset || 0) + (i / n) * TAU, o.speed || 150, o.type || 'petal', { turn: (i % 2 ? -1 : 1) * turn, update: petalStop });
      if (b) b.data.turnT = 1.2;
    }
    return EMPTY;
  }
  function petalStop(b) { if (b.turn && b.age >= (b.data.turnT || 1.2)) b.turn = 0; }
  function pWallGap(src, o) {
    const r = viaPat('wall_gap', [src, o]);
    if (r) return r;
    const n = Math.max(2, o.count || 14), spacing = o.spacing || 52, gap = o.gap || 104, y = oy_(src, o);
    const gx = o.gapX != null ? o.gapX : target(src).x;
    const span = (n - 1) * spacing, cx = span >= W - 40 ? W / 2 : clamp(ox_(src, o), span / 2 + 10, W - span / 2 - 10);
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * spacing;
      if (Math.abs(x - gx) >= gap / 2) fire(x, y, PI / 2, o.speed || 140, o.type || 'orb', o);
    }
    return EMPTY;
  }
  function pSplit(src, o) {
    if (typeof o.angle !== 'number') o = Object.assign({}, o, { angle: pAngle(src, o, o.bias) });
    const r = viaPat('split_shot', [src, o]);
    if (r) return r;
    const s = o.split || {};
    return pFan(src, o.angle, Object.assign({}, o, { type: o.type || 'flare', count: o.count || 5, spread: o.spread != null ? o.spread : 0.9,
      speed: o.speed || 120, split: { at: o.at || 1.2, count: s.count || 6, type: s.type || 'shard', speed: s.speed || 180 } }));
  }
  function pSling(src, o) {
    const r = viaPat('gravity_sling', [src, o]);
    if (r) return r;
    const g = o.center || src.gravity || { x: src.x, y: src.y };
    const n = Math.max(1, o.count || 8), dir = o.dir || 1, R = o.radius || 120;
    const off = o.offset != null ? o.offset : Math.atan2(src.y - g.y, src.x - g.x);
    for (let i = 0; i < n; i++) {
      const th = off + (i / n) * TAU;
      fire(g.x + Math.cos(th) * R, g.y + Math.sin(th) * R, th + dir * PI / 2, o.speed || 200, o.type || 'void_orb', o);
    }
    return EMPTY;
  }
  function orbitLocal(b) {
    const d = b.data, v = d.vol;
    if (d.rel) return;
    const s = v.src;
    if (s && !s.dead && !s.dying) { v.cx = s.x + v.ox; v.cy = s.y + v.oy; }
    const k = Math.min(1, b.age / 0.3), a = d.a + v.w * b.age, r = v.R * (k * (2 - k));
    b.x = b.bx = v.cx + Math.cos(a) * r;
    b.y = b.by = v.cy + Math.sin(a) * r;
    if (b.age >= v.T || !s || s.dead || s.dying) {
      d.rel = true;
      if (!v.aimed) { v.aimed = true; const t = target({ x: v.cx, y: v.cy }); v.tx = t.x; v.ty = t.y; }
      const ang = Math.atan2(v.ty - b.y, v.tx - b.x);
      b.angle = ang; b.speed = v.sp; b.vx = Math.cos(ang) * v.sp; b.vy = Math.sin(ang) * v.sp;
    }
  }
  function pOrbit(src, o) {
    const r = viaPat('orbit_release', [src, o]);
    if (r) return r;
    const n = Math.max(1, o.count || 16);
    const vol = { src, ox: o.ox || 0, oy: o.oy || 0, cx: ox_(src, o), cy: oy_(src, o), R: o.radius || 120, T: o.orbit || 1.2,
      w: (o.spin || 2) * (o.dir || 1), sp: (o.speed || 200) * bspd(), aimed: false, tx: 0, ty: 0 };
    for (let i = 0; i < n; i++) {
      const a = (o.offset || 0) + (i / n) * TAU;
      const b = fire(vol.cx, vol.cy, a, 0, o.type || 'orb', { update: orbitLocal, color: o.color });
      if (b) { b.data.vol = vol; b.data.a = a; b.data.rel = false; }
    }
    return EMPTY;
  }
  /** Continuous emission from rotating arms with a duty cycle (GDD 7.3 spiral); st is the caller's state object. */
  function pSpiral(st, src, dt, o) {
    const r = viaPat('spiral', [st, src, dt, o]);
    return r || spiralLocal(st, src, dt, o);
  }
  function spiralLocal(st, src, dt, o) {
    if (st.ang == null) { st.ang = o.offset || 0; st.acc = 0; st.ph = (o.on || 2) + (o.off || 1.2) - 0.45; }
    st.ang += (o.spin || 1.4) * (o.dir || 1) * dt;
    const on = o.on || 2, period = on + (o.off || 1.2);
    st.ph = (st.ph + dt) % period;
    if (st.ph >= on) return EMPTY;
    st.acc += (o.rate || 9) * frOf(o) * dt;
    const arms = o.arms || 3, x = ox_(src, o), y = oy_(src, o), r0 = o.radius || 0;
    while (st.acc >= 1) {
      st.acc -= 1;
      for (let k = 0; k < arms; k++) {
        const a = st.ang + (k / arms) * TAU;
        fire(x + Math.cos(a) * r0, y + Math.sin(a) * r0, a, o.speed || 170, o.type || 'orb', o);
      }
    }
    return EMPTY;
  }
  function pDoubleSpiral(st, src, dt, o) {
    const r = viaPat('double_spiral', [st, src, dt, o]);
    if (r) return r;
    st.a = st.a || {}; st.b = st.b || {};
    const base = { arms: o.arms || 2, rate: o.rate || 8, speed: o.speed || 160, type: o.type, ox: o.ox, oy: o.oy, radius: o.radius, on: 1e9, off: 0.01 };
    spiralLocal(st.a, src, dt, Object.assign({}, base, { spin: o.spin || 1.2, dir: 1, offset: 0 }));
    spiralLocal(st.b, src, dt, Object.assign({}, base, { spin: o.spin || 1.2, dir: -1, offset: PI / base.arms, color: o.color2 || o.color }));
    return EMPTY;
  }
  /** GDD beam_sweep: sweeps from -> to while active; telegraph = start line plus a curved arrow. */
  function pBeamSweep(b, src, o) {
    let bm = viaPat('beam_sweep', [src, o]);
    if (!bm || bm === EMPTY) {
      bm = SL.fireEnemyBeam(src, { angle: o.from, sweep: { to: o.to }, width: o.width || 30, telegraph: o.telegraph != null ? o.telegraph : 0.9,
        duration: o.duration != null ? o.duration : 1.6, follow: o.follow !== false, ox: o.ox || 0, oy: o.oy || 0, color: o.color, dps: o.dps });
    }
    bm.data = bm.data || {};
    bm.data.sweepFrom = o.from; bm.data.sweepTo = o.to; bm.data.arrow = true; bm.data.arrowR = o.arrowR || 150;
    b.data.beams.push(bm);
    return bm;
  }
  /** Straight enemy beam (core fireEnemyBeam, restyled by the enemies module when present). */
  function pBeam(b, src, o) {
    let bm = viaPat('beam', [src, o]);
    if (!bm || bm === EMPTY) {
      bm = SL.fireEnemyBeam(src, { angle: o.angle, width: o.width || 26, telegraph: o.telegraph != null ? o.telegraph : 0.8,
        duration: o.duration != null ? o.duration : 1.2, follow: o.follow === true, ox: o.ox || 0, oy: o.oy || 0, color: o.color,
        length: o.length, dps: o.dps, track: o.track });
    }
    bm.data = bm.data || {};
    if (o.noBusy) bm.data.noBusy = true;
    b.data.beams.push(bm);
    return bm;
  }
  function fadeBeams(b) {
    const L = b.data.beams;
    for (let i = 0; i < L.length; i++) if (!L[i].dead && L[i].state !== 'fade') { L[i].state = 'fade'; L[i].fade = 0; }
    L.length = 0;
  }
  function beamBusy(b) {
    const L = b.data.beams;
    for (let i = 0; i < L.length; i++) if (!L[i].dead && L[i].state !== 'fade' && !L[i].data.noBusy) return true;
    return false;
  }
  /** Non-damaging warning marker (SL.patterns.warn: fx 'line' | 'ring' | 'charge' ...); null when unavailable. */
  function warnMark(src, o) {
    const P = SL.patterns;
    if (!P || typeof P.warn !== 'function') return null;
    try { return P.warn(src, o); } catch (err) { U.warnOnce('bossesA:warn', '[bossesA] SL.patterns.warn threw', err); return null; }
  }
  function chargeMark(src, o) {
    const P = SL.patterns;
    if (P && typeof P.charge === 'function') { try { return P.charge(src, o); } catch (err) { U.warnOnce('bossesA:charge', '[bossesA] SL.patterns.charge threw', err); } }
    sfx('enemy_charge', { x: src.x });
    return null;
  }
  // ---------------------------------------------------------------- per-boss timed actions (cancelled on phase change)
  function later(b, t, fn) { b.data.q.push({ t, fn }); }
  function runQueue(b, dt) {
    const q = b.data.q;
    for (let i = 0; i < q.length; i++) {
      const it = q[i];
      if ((it.t -= dt) > 0) continue;
      q.splice(i--, 1);
      try { it.fn(b); } catch (err) { U.warnOnce('bossesA:q:' + b.typeId, '[bossesA] ' + b.typeId + ' timed action threw', err); }
    }
  }

  // ---------------------------------------------------------------- parts (core recipe "destructible boss part")
  // A hit on a part damages the part and the boss bar by the same amount (x the part's multiplier for weak points).
  // Piercing beams that cross a part and the hull in the same step only take the bar down once (the larger hit).
  function beamLog(b, by) {
    const L = b.data.beamLog;
    const t = SL.world.t;
    for (let i = 0; i < L.length; i++) {
      const r = L[i];
      if (r.by === by) { if (r.t !== t) { r.t = t; r.v = 0; } return r; }
    }
    const r = { by, t, v: 0 };
    if (L.length > 6) L.shift();
    L.push(r);
    return r;
  }
  const partDefs = Object.create(null);
  function partDef(id) {
    return partDefs[id] || (partDefs[id] = {
      id, name: id, hp: 1000, r: 30, score: 0, credits: null, manualMove: true, noClear: true, noCount: true,
      offscreenKill: false, contactDamage: 0, noRam: true, bossPart: true, update: partUpdate, onHit: partHit, onDeath: partBreak,
    });
  }
  function addPart(b, id, o) {
    const e = SL.spawnEnemy(partDef(id), { x: b.x + (o.ox || 0), y: b.y + (o.oy || 0), hp: o.weak ? 1e7 : o.hp, noCount: true, offscreenKill: false });
    e.hidden = true;
    e.r = o.r || 30;
    if (o.circles) e.circles = o.circles.map((c) => ({ x: c.x, y: c.y, r: c.r }));
    const d = e.data;
    d.boss = b; d.id = id; d.ox = o.ox || 0; d.oy = o.oy || 0; d.spec = o; d.weak = !!o.weak;
    d.bonus = (o.bonus || 0) * (b.maxHp / (b.def.hp || b.maxHp));
    d.mark = 0; d.hx = e.x; d.hy = e.y; d.broken = false; d.glow = 0; d.flash = 0;
    b.data.parts[id] = e;
    b.data.partList.push(e);
    b.parts = b.data.partList;
    partSync(e);
    return e;
  }
  function partSync(e) {
    const d = e.data, b = d.boss, o = d.spec;
    e.x = b.x + d.ox;
    e.y = b.y + d.oy;
    e.invuln = !!(b.invuln || !b.introDone || b.dying || (o.active && !o.active(b, e)));
    e.intangible = !!(b.dying || (o.tangible && !o.tangible(b, e)));
    e.untargetable = d.weak;
    if (d.weak) e.hp = e.maxHp;
  }
  function partUpdate(e, dt) {
    const d = e.data, b = d.boss;
    if (!b || b.dead || b.defeated) { e.dead = true; return; }
    partSync(e);
    if (d.mark > 0) d.mark -= dt;
    if (d.flash > 0) d.flash -= dt;
  }
  function partHit(e, dmg, o) {
    const d = e.data, b = d.boss;
    if (!b || b.dying || b.dead) return;
    const mult = typeof d.spec.mult === 'function' ? d.spec.mult(b, e) : (d.spec.mult || 1);
    let fwd = dmg * mult;
    if (o && o.type === 'beam') {
      const r = beamLog(b, o.by);
      const add = Math.max(0, fwd - r.v);
      r.v += add;
      fwd = add;
    }
    if (fwd > 0) b.hp -= fwd;
    if (d.weak) e.hp = e.maxHp;
    if (mult > 1) {
      d.mark = 0.14;
      d.hx = o && o.x != null ? o.x : e.x + crnd(-10, 10);
      d.hy = o && o.y != null ? o.y : e.y + crnd(-10, 10);
    }
    if (d.spec.onHit) d.spec.onHit(b, e, dmg, o);
  }
  function partBreak(e) {
    const d = e.data, b = d.boss;
    d.broken = true;
    if (!b || b.dead || b.dying) return;
    SL.fx.explode(e.x, e.y, { size: 'l', palette: d.spec.palette || b.def.palette || 'enemy', sound: false });
    debrisBurst(e.x, e.y, b.def.debrisKeys, 9, 320, 16, 16);
    SL.fx.sparks(e.x, e.y, { count: 26, color: '#ffd27a', speed: 560, life: 0.5 });
    if (d.bonus > 0) b.hp -= d.bonus;
    SL.fx.text(e.x, e.y - 26, 'BREAK', { color: HOT, size: 26, life: 0.9, rise: 50, weight: 800 });
    sfx('boss_part_break', { x: e.x });
    if (d.spec.onBreak) d.spec.onBreak(b, e);
    SL.bus.emit('bossPartBreak', { b, part: e, id: d.id });
  }
  function part(b, id) { return b && b.data && b.data.parts ? b.data.parts[id] || null : null; }
  function alive(b, id) { const e = part(b, id); return !!(e && !e.dead && !e.data.broken); }

  // ---------------------------------------------------------------- shared fx
  function debrisBurst(x, y, keys, n, speed, sx, sy) {
    if (!keys || !keys.length) keys = DEBRIS_GRAPHITE;
    for (let i = 0; i < n; i++) {
      const a = -PI / 2 + crnd(-1.7, 1.7), sp = speed * crnd(0.35, 1);
      const s = crnd(18, 34);
      SL.fx.emit({
        x: x + crnd(-sx, sx), y: y + crnd(-sy, sy), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: crnd(1.3, 2.3),
        size: s, size2: s * 0.85, shape: keys[(Math.random() * keys.length) | 0], blend: 'normal', gravity: 560,
        rot: crnd(0, TAU), spin: crnd(-8, 8), alpha: 1, alpha2: 0, ease: true, drag: 0.3,
      });
    }
  }
  function phaseBreak(b) {
    const s = SL.game && SL.game.session;
    const m = (s && s.mult) || 1;
    if (SL.game && SL.game.addScore) SL.game.addScore(2000 * m, b.x, b.y + 46);
    SL.fx.text(W / 2, clamp(b.y + (b.def.size ? b.def.size[1] * 0.5 : 150) + 70, 360, 640), 'PHASE BREAK', { color: '#ffb0cf', size: 42, life: 1.5, rise: 46, weight: 800 });
    sfx('boss_phase', { x: b.x });
    const sz = b.def.size || [300, 200];
    debrisBurst(b.x, b.y, b.def.debrisKeys, 16, 420, sz[0] * 0.38, sz[1] * 0.3);
    SL.fx.sparks(b.x, b.y, { count: 40, color: '#ffe0a0', speed: 640, life: 0.55 });
    SL.fx.shake(10, 0.5);
  }
  /** Sparks, smoke and small fires from the hull's damage points as HP drops (cosmetic). */
  function damageFx(b, dt, pts) {
    const f = b.hp / b.maxHp;
    if (f > 0.72 && !b.dying) return;
    const k = b.dying ? 1 : clamp((0.72 - f) / 0.62, 0, 1);
    b.data.dfx = (b.data.dfx || 0) + dt * (1.2 + 9 * k);
    while (b.data.dfx >= 1) {
      b.data.dfx -= 1;
      const p = typeof pts === 'function' ? pts(b) : pts[(Math.random() * pts.length) | 0];
      const x = b.x + p[0], y = b.y + p[1];
      SL.fx.sparks(x, y, { count: 3 + ((k * 5) | 0), color: '#ffd38a', speed: 300, life: 0.32, angle: -PI / 2, spread: 2.6, size: 4 });
      if (k > 0.3 && Math.random() < 0.65) {
        SL.fx.emit({ x, y, vx: crnd(-12, 12), vy: crnd(-50, -20), life: crnd(0.9, 1.5), size: 14, size2: crnd(40, 60), color: '#2a2532', shape: 'smoke', alpha: 0.5, alpha2: 0 });
      }
      if (k > 0.65 && Math.random() < 0.35) {
        SL.fx.emit({ x, y, vx: crnd(-10, 10), vy: -50, life: 0.45, size: 14, size2: 30, color: '#ff8a3d', shape: 'fire' });
      }
    }
  }
  function creditShower(b, n, big) {
    const list = [];
    const spawn = (id, value) => {
      const a = crnd(0, TAU), sp = crnd(150, 460);
      const x = b.x + crnd(-80, 80), y = b.y + crnd(-50, 50);
      const o = { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, value };
      let pk = null;
      try { pk = SL.pickups && SL.pickups.spawn ? SL.pickups.spawn(id, x, y, o) : SL.world.spawnPickup(id, x, y, o); } catch (err) {
        U.warnOnce('bossesA:credits', '[bossesA] credit spawn failed', err);
      }
      if (pk && !pk.dead) list.push(pk);
    };
    for (let i = 0; i < n; i++) spawn('credit', 1);
    for (let i = 0; i < big; i++) spawn('credit_big', 10);
    if (!list.length || !SL.bus.onMission) return;
    let t = 0;
    const off = SL.bus.onMission('tick', (e) => {
      const dt = (e && e.dt) || 1 / 60;
      t += dt;
      if (t < 0.5) return;
      let any = false;
      for (let i = 0; i < list.length; i++) {
        const pk = list[i];
        if (pk.dead) continue;
        any = true;
        const p = SL.world.nearestPlayer(pk.x, pk.y);
        if (!p) continue;
        const dx = p.x - pk.x, dy = p.y - pk.y, dd = Math.sqrt(dx * dx + dy * dy) || 1;
        const sp = Math.min(1600, 320 + (t - 0.5) * 1000), k = Math.min(1, 7 * dt);
        pk.vx = lerp(pk.vx, (dx / dd) * sp, k);
        pk.vy = lerp(pk.vy, (dy / dd) * sp, k);
        pk.magnetized = true;
      }
      if (!any || t > 6) off();
    });
  }

  // ---------------------------------------------------------------- per-frame draw helpers (cached sprites only)
  function plume(ctx, x, y, ang, w, len, inner, outer, t) {
    SL.render.setTransform(ctx, x, y, ang - PI / 2);
    A.flame(ctx, 0, 0, w, len, inner, outer, t);
    SL.render.resetTransform(ctx);
  }
  function lineGlow(ctx, x, y, ang, len, width, color, alpha) {
    const spr = SL.world.beamSprite(color);
    SL.render.setTransform(ctx, x, y, ang);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr.canvas, 0, -width / 2, len, width);
    SL.render.resetTransform(ctx);
  }
  /** Telegraph arrow for a sweeping beam: arc from a0 toward a1 (grows with k), arrowhead, faint end line. */
  function sweepArrow(ctx, x, y, a0, a1, r, color, k) {
    const span = U.angleDiff(a0, a1);
    const dir = span >= 0 ? 1 : -1;
    const g = Math.min(1, k * 1.5);
    const ae = a0 + span * g;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.rgba(color, 0.25 + 0.5 * k);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(x, y, r, a0, ae, dir < 0);
    ctx.stroke();
    ctx.strokeStyle = C.rgba('#ffffff', 0.35 + 0.5 * k);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    const hx = x + Math.cos(ae) * r, hy = y + Math.sin(ae) * r;
    const tx = -Math.sin(ae) * dir, ty = Math.cos(ae) * dir, nx = Math.cos(ae), ny = Math.sin(ae);
    ctx.fillStyle = C.rgba('#ffffff', 0.5 + 0.5 * k);
    ctx.beginPath();
    ctx.moveTo(hx + tx * 18, hy + ty * 18);
    ctx.lineTo(hx - tx * 4 + nx * 11, hy - ty * 4 + ny * 11);
    ctx.lineTo(hx - tx * 4 - nx * 11, hy - ty * 4 - ny * 11);
    ctx.closePath();
    ctx.fill();
    A.drawGlow(ctx, hx, hy, 26, color, 0.7 * k);
    lineGlow(ctx, x, y, a1, 1500, 3, color, 0.18 + 0.2 * k);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  function drawBeamTelegraphs(b, ctx, color) {
    if (SL.patterns && SL.patterns.beam_sweep) return; // the enemies module's beam restyle draws the sweep arrow
    const L = b.data.beams;
    for (let i = 0; i < L.length; i++) {
      const bm = L[i];
      if (bm.dead || bm.state !== 'telegraph' || !bm.data.arrow) continue;
      const k = clamp(bm.t / Math.max(0.01, bm.telegraph), 0, 1);
      sweepArrow(ctx, bm.x, bm.y, bm.data.sweepFrom, bm.data.sweepTo, bm.data.arrowR || 150, color || bm.color, k);
    }
  }
  /** Yellow-white hit markers on weak points. */
  function drawMarks(b, ctx) {
    const L = b.data.partList;
    for (let i = 0; i < L.length; i++) {
      const d = L[i].data;
      if (!(d.mark > 0)) continue;
      const k = d.mark / 0.14;
      A.drawGlow(ctx, d.hx, d.hy, 30 + 18 * (1 - k), HOT, 0.9 * k);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = C.rgba(HOT, 0.9 * k);
      ctx.lineWidth = 2.2;
      const r0 = 7 + 10 * (1 - k), r1 = r0 + 9;
      ctx.beginPath();
      for (let j = 0; j < 4; j++) {
        const a = PI / 4 + j * PI / 2;
        ctx.moveTo(d.hx + Math.cos(a) * r0, d.hy + Math.sin(a) * r0);
        ctx.lineTo(d.hx + Math.cos(a) * r1, d.hy + Math.sin(a) * r1);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  function drawHitboxes(b, ctx) {
    const one = (e, col) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      const cs = e.circles || [{ x: 0, y: 0, r: e.r }];
      for (const c of cs) { ctx.beginPath(); ctx.arc(e.x + c.x, e.y + c.y, c.r, 0, TAU); ctx.stroke(); }
    };
    one(b, 'rgba(0,255,140,0.8)');
    for (const e of b.data.partList) if (!e.dead) one(e, e.intangible ? 'rgba(120,120,120,0.6)' : e.invuln ? 'rgba(80,160,255,0.8)' : 'rgba(255,220,0,0.9)');
  }
  function bossFlash(b, ctx, key, x, y) {
    if (b.flash > 0) A.drawFlash(ctx, key, x, y, 0, 1, Math.min(1, b.flash / 0.06) * 0.2);
  }

  // ================================================================== sprite-generator helpers (one-time)
  function devScale(ctx) { const m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; }
  /** Soft drop shadow of a path (offset down-right, away from the upper-left light), without drawing the path. */
  function shadowUnder(ctx, path, dx, dy, blur, alpha) {
    const k = devScale(ctx);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,' + alpha + ')';
    ctx.shadowBlur = blur * k;
    ctx.shadowOffsetX = (dx + 6000) * k;
    ctx.shadowOffsetY = dy * k;
    ctx.translate(-6000, 0);
    ctx.fillStyle = '#000';
    ctx.fill(path);
    ctx.restore();
  }
  function poly(pts, s, ox, oy) {
    s = s || 1; ox = ox || 0; oy = oy || 0;
    const p = new Path2D();
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i][0] * s + ox, y = pts[i][1] + oy;
      if (i) p.lineTo(x, y); else p.moveTo(x, y);
    }
    p.closePath();
    return p;
  }
  function pline(pts, s) {
    s = s || 1;
    const p = new Path2D();
    for (let i = 0; i < pts.length; i++) { if (i) p.lineTo(pts[i][0] * s, pts[i][1]); else p.moveTo(pts[i][0] * s, pts[i][1]); }
    return p;
  }
  function circle(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; }
  function ringPath(x, y, r0, r1) { const p = new Path2D(); p.arc(x, y, r1, 0, TAU); p.arc(x, y, r0, 0, TAU, true); return p; }
  function rrect(x, y, w, h, r) { const p = new Path2D(); p.roundRect(x, y, w, h, r); return p; }
  function bb(x, y, w, h) { return { x, y, w, h }; }
  /** Mottled grime and wear over everything drawn so far (source-atop keeps it on the hull). */
  const grimeCache = new Map();
  function grime(ctx, B, seed, alpha, scale) {
    const key = seed + '|' + (scale || 22);
    let n = grimeCache.get(key);
    if (!n) {
      n = A.noiseCanvas(160, 120, {
        scale: scale || 22, octaves: 5, seed, gain: 0.55,
        palette: [[0, '#000000', 0.85], [0.38, '#000000', 0.25], [0.55, '#000000', 0], [0.78, '#ffffff', 0], [1, '#ffffff', 0.32]],
      });
      grimeCache.set(key, n);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = alpha;
    ctx.drawImage(n, B.x, B.y, B.w, B.h);
    ctx.restore();
  }
  function tint(ctx, path, color, alpha) {
    ctx.save();
    ctx.fillStyle = C.rgba(color, alpha);
    ctx.fill(path);
    ctx.restore();
  }
  /** Horizontal-gradient cylinder (engine nacelles, barrels) lit from the left. */
  function cylinder(ctx, path, x0, x1, base) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, C.darken(base, 0.7));
    g.addColorStop(0.2, C.lighten(base, 0.55));
    g.addColorStop(0.32, C.lighten(base, 0.2));
    g.addColorStop(0.62, base);
    g.addColorStop(0.88, C.darken(base, 0.55));
    g.addColorStop(1, C.darken(base, 0.75));
    ctx.save();
    ctx.fillStyle = g;
    ctx.fill(path);
    ctx.clip(path);
    const s = ctx.createLinearGradient(x0, 0, x1, 0);
    s.addColorStop(0.14, 'rgba(255,255,255,0)');
    s.addColorStop(0.22, 'rgba(255,255,255,0.5)');
    s.addColorStop(0.3, 'rgba(255,255,255,0)');
    ctx.fillStyle = s;
    ctx.fill(path);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(5,6,10,0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke(path);
    ctx.restore();
  }
  /** Cylinder roundness over a metal fill: darkened flanks, a soft bright crest left of center (source-atop). */
  function roundness(ctx, x0, x1, y0, y1) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(0.12, 'rgba(0,0,0,0)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.1)');
    g.addColorStop(0.32, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.05)');
    g.addColorStop(0.93, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(120,160,200,0.25)');
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }
  /** Sphere-ish dome lit from the upper left. */
  function dome(ctx, x, y, r, base) {
    const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r);
    g.addColorStop(0, C.lighten(base, 0.7));
    g.addColorStop(0.3, C.lighten(base, 0.25));
    g.addColorStop(0.7, base);
    g.addColorStop(1, C.darken(base, 0.7));
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(4,5,9,0.9)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }
  function vents(ctx, x, y, n, w, h, gap, ang) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang || 0);
    for (let i = 0; i < n; i++) {
      const xx = -((n - 1) * gap) / 2 + i * gap;
      ctx.fillStyle = 'rgba(4,5,8,0.92)';
      ctx.beginPath();
      ctx.roundRect(xx - w / 2, -h / 2, w, h, Math.min(w, h) / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(xx - w / 2 + 0.5, h / 2 - 0.4, w - 1, 0.9);
    }
    ctx.restore();
  }
  function rivets(ctx, pts, r) {
    r = r || 1.3;
    ctx.save();
    for (const [x, y] of pts) {
      ctx.fillStyle = 'rgba(3,4,8,0.8)';
      ctx.beginPath(); ctx.arc(x + 0.4, y + 0.4, r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.beginPath(); ctx.arc(x - 0.3, y - 0.3, r * 0.55, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function along(ax, ay, bx, by, n, inset) {
    const out = [];
    inset = inset || 0;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : inset + (i / (n - 1)) * (1 - 2 * inset);
      out.push([lerp(ax, bx, t), lerp(ay, by, t)]);
    }
    return out;
  }
  function lights(ctx, pts, color, r) {
    for (const [x, y] of pts) {
      A.emissive(ctx, circle(x, y, r || 2.2), color, 7);
    }
  }
  /** Burn scorch: dark radial soot with a rusty edge and streaks. */
  function scorch(ctx, x, y, r, rng) {
    ctx.save();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(6,4,4,0.9)');
    g.addColorStop(0.45, 'rgba(20,12,10,0.7)');
    g.addColorStop(0.8, 'rgba(60,28,16,0.25)');
    g.addColorStop(1, 'rgba(60,28,16,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(8,6,6,0.5)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = rng.next() * TAU, l = r * (0.8 + rng.next() * 0.9);
      ctx.lineWidth = 1 + rng.next() * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    ctx.restore();
  }
  function crack(ctx, x, y, len, ang, rng, hot, hotColor) {
    const pts = [[x, y]];
    let cx = x, cy = y, a = ang;
    const n = 5 + ((rng.next() * 4) | 0);
    for (let i = 0; i < n; i++) {
      a += (rng.next() - 0.5) * 1.1;
      cx += Math.cos(a) * (len / n);
      cy += Math.sin(a) * (len / n);
      pts.push([cx, cy]);
    }
    const p = new Path2D();
    pts.forEach(([px, py], i) => (i ? p.lineTo(px, py) : p.moveTo(px, py)));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(2,2,4,0.95)';
    ctx.lineWidth = 2.6;
    ctx.stroke(p);
    if (hot) {
      ctx.shadowColor = hotColor || '#ff7a2f';
      ctx.shadowBlur = 6 * devScale(ctx);
      ctx.strokeStyle = hotColor ? C.rgba(C.lighten(hotColor, 0.35), 0.9) : 'rgba(255,150,70,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke(p);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 0.8;
    ctx.translate(0.9, 0.9);
    ctx.stroke(p);
    ctx.restore();
  }
  /** Torn plate: jagged hole with bent edges and glowing internals. */
  function tornHole(ctx, x, y, r, rng, glowColor) {
    const pts = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.next() * 0.4, rr = r * (0.55 + rng.next() * 0.55);
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8]);
    }
    const p = poly(pts);
    ctx.save();
    ctx.fillStyle = '#050508';
    ctx.fill(p);
    ctx.clip(p);
    const g = ctx.createRadialGradient(x + r * 0.15, y + r * 0.2, 0, x, y, r);
    g.addColorStop(0, C.rgba(glowColor || '#ff8a3d', 0.9));
    g.addColorStop(0.35, C.rgba(glowColor || '#ff8a3d', 0.35));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
    ctx.strokeStyle = 'rgba(40,42,56,0.95)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const yy = y - r * 0.4 + i * r * 0.4;
      ctx.beginPath(); ctx.moveTo(x - r, yy); ctx.lineTo(x + r, yy + (rng.next() - 0.5) * 6); ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(150,158,182,0.75)';
    ctx.lineWidth = 1.4;
    ctx.stroke(p);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.translate(1.5, 1.5);
    ctx.stroke(p);
    ctx.restore();
  }
  /** Damage overlay sprite: scorches, cracks and torn plates at the given points, masked to the hull path. */
  function damageOverlay(ctx, hull, pts, level, seed, glowColor) {
    const rng = SL.makeRng(seed);
    pts.forEach(([x, y], i) => {
      if (level === 1 && i % 2) return;
      scorch(ctx, x, y, (level === 1 ? 16 : 24) + rng.next() * 14, rng);
    });
    pts.forEach(([x, y], i) => {
      if (level === 1 && i % 3) return;
      crack(ctx, x + (rng.next() - 0.5) * 10, y + (rng.next() - 0.5) * 10, 20 + rng.next() * (level === 1 ? 18 : 34), rng.next() * TAU, rng, level > 1);
    });
    if (level > 1) pts.forEach(([x, y], i) => { if (i % 2 === 0) tornHole(ctx, x, y, 9 + rng.next() * 8, rng, glowColor); });
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fill(hull);
    ctx.restore();
  }
  /** Generic shard debris sprites (square boxes so particles draw them undistorted). */
  function defineDebris(prefix, base, n, seed, accent) {
    const keys = [];
    for (let i = 0; i < n; i++) {
      const key = prefix + i;
      keys.push(key);
      A.define(key, 40, 40, (ctx, w, h) => {
        const rng = SL.makeRng(seed + i * 17);
        const pts = [];
        const m = 5 + ((rng.next() * 3) | 0);
        for (let j = 0; j < m; j++) {
          const a = (j / m) * TAU + rng.next() * 0.5, r = 9 + rng.next() * 9;
          pts.push([w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r * (0.6 + rng.next() * 0.5)]);
        }
        const p = poly(pts);
        A.metal(ctx, p, { base, spec: 0.6, bounds: bb(0, 0, w, h), edge: 1.2, rimLight: 1.4 });
        A.panelLines(ctx, pline([[pts[0][0], pts[0][1]], [pts[(m / 2) | 0][0], pts[(m / 2) | 0][1]]]), '#000', 0.6);
        if (accent && i % 2 === 0) A.emissive(ctx, pline([[pts[1][0], pts[1][1]], [pts[2][0], pts[2][1]]]), accent, 4, { stroke: 1 });
      }, { pad: 2, res: 1 });
    }
    return keys;
  }
  const DEBRIS_GRAPHITE = defineDebris('boss:deb:g', '#3d4358', 5, 101, PAL.seam);
  const DEBRIS_ICE = defineDebris('boss:deb:ice', '#9fb9cc', 4, 211, null);
  const DEBRIS_VIOLET = defineDebris('boss:deb:v', '#3b3550', 4, 307, '#b26bff');

  // ================================================================== boss factory
  function baseInit(b) {
    const d = b.data;
    d.q = []; d.beams = []; d.beamLog = []; d.parts = {}; d.partList = []; d.S = {}; d.pt = 0; d.at = 0;
    b.parts = d.partList;
  }
  function defineBoss(id, spec) {
    const def = {
      name: spec.name, title: spec.title, hp: spec.hp, r: spec.r, score: spec.score, parTime: spec.parTime,
      timeBonusRate: 250, transitionTime: 1.5, contactDamage: 20, manualMove: true, palette: spec.palette || 'enemy',
      explosion: 'xl', debrisKeys: spec.debris || DEBRIS_GRAPHITE, size: spec.size, spec,
      init(b, o) { baseInit(b); spec.init(b, o); },
      intro(b, dt) { b.data.at += dt; return spec.intro(b, dt); },
      update(b, dt) {
        const d = b.data;
        d.pt += dt; d.at += dt;
        runQueue(b, dt);
        const L = d.beams;
        for (let i = L.length - 1; i >= 0; i--) if (L[i].dead) L.splice(i, 1);
        spec.update(b, dt);
      },
      phases: spec.phases.map((ph, i) => ({
        at: ph.at, name: ph.name,
        enter(b) {
          const d = b.data;
          d.q.length = 0;
          fadeBeams(b);
          d.pt = 0;
          d.S = {};
          if (i > 0) phaseBreak(b);
          if (ph.enter) ph.enter(b, d.S);
        },
        update(b, dt) { if (ph.update) ph.update(b, dt, b.data.S); },
      })),
      draw(b, ctx) {
        spec.draw(b, ctx);
        if (debugParams().hitbox) drawHitboxes(b, ctx);
      },
      onHit(b, dmg, o) {
        if (o && o.type === 'beam') { const r = beamLog(b, o.by); r.v = Math.max(r.v, dmg); }
        if (spec.onHit) spec.onHit(b, dmg, o);
      },
      onDeath(b) {
        const d = b.data;
        d.q.length = 0;
        d.death = { i: 0 };
        for (const e of d.partList) e.intangible = true;
        if (spec.death.start) spec.death.start(b);
      },
      dying(b, dt) {
        const D = b.data.death;
        if (!D) return;
        b.data.at += dt;
        const steps = spec.death.steps;
        while (D.i < steps.length && b.deathT >= steps[D.i][0] && !b.defeated) {
          const fn = steps[D.i++][1];
          try { fn(b); } catch (err) { U.warnOnce('bossesA:death:' + id, '[bossesA] ' + id + ' death step threw', err); }
        }
        if (spec.death.tick && !b.defeated) spec.death.tick(b, dt, b.deathT);
      },
    };
    SL.bosses.define(id, def);
    ART[id] = spec.art || [];
    return def;
  }
  /** Final blast of a death sequence: boss explosion, ripple, credit shower, SL.game.bossDefeated. */
  function finish(b, o) {
    if (b.defeated || b.dead) return;
    SL.fx.explode(b.x, b.y, { size: o.size || 'boss', palette: o.palette || 'enemy' });
    if (o.ripple) SL.fx.shockwave(b.x, b.y, { radius: o.ripple, duration: 1.3, strength: 2.2, color: o.ring || '#ffd9c0' });
    creditShower(b, o.credits[0], o.credits[1]);
    for (const e of b.data.partList) if (!e.dead) e.dead = true;
    if (SL.game && SL.game.bossDefeated) SL.game.bossDefeated(b); else b.dead = true;
  }
  function chainBlast(b, x, y, size, palette, sound) {
    SL.fx.explode(x, y, { size, palette: palette || 'enemy', sound: sound !== false, shake: true });
  }

  // ================================================================== RAZORBACK (GDD 8.1)
  const RZ = {
    OUT: [[0, -150], [30, -156], [70, -168], [128, -164], [180, -150], [228, -128], [262, -100], [281, -74], [278, -52],
      [258, -32], [214, 10], [168, 62], [128, 108], [96, 146], [76, 172], [66, 194], [56, 198], [50, 186], [0, 184]],
    DECK: [[0, -136], [70, -146], [150, -140], [165, -130], [66, 150], [44, 166], [0, 166]],
    LE_O: [[281, -74], [278, -52], [258, -32], [214, 10], [168, 62], [128, 108], [96, 146], [76, 172], [66, 194]],
    LE_I: [[266, -70], [262, -56], [242, -40], [200, 0], [155, 51], [116, 96], [86, 132], [68, 156], [58, 178]],
    WING: [[165, -130], [184, -148], [228, -128], [258, -100], [266, -72], [256, -58], [238, -42], [198, -2], [154, 49],
      [116, 93], [88, 128], [70, 150]],
    FINS: [[-145, -74], [-115, 10], [-86, 94], [86, 94], [115, 10], [145, -74]],
    FIN_LEAN: 0.34,
    ENG: [[-142, -186, 40], [-52, -192, 46], [52, -192, 46], [142, -186, 40]],
    TX: 190, TY: -20,
    CORE: 22, BAY: 166,
    DMG: [[-214, -96], [-170, -40], [-128, 40], [-232, -62], [-96, 112], [-60, -110], [-150, -118], [-110, -20],
      [204, -100], [168, -36], [126, 44], [226, -66], [94, 118], [62, -112], [146, -118], [108, -24], [-30, 140], [34, 136]],
    CIRCLES: [
      { x: 0, y: -112, r: 74 }, { x: -96, y: -122, r: 54 }, { x: 96, y: -122, r: 54 }, { x: -180, y: -106, r: 44 },
      { x: 180, y: -106, r: 44 }, { x: -246, y: -80, r: 32 }, { x: 246, y: -80, r: 32 }, { x: 0, y: -22, r: 70 },
      { x: -84, y: -36, r: 50 }, { x: 84, y: -36, r: 50 }, { x: -104, y: 48, r: 40 }, { x: 104, y: 48, r: 40 },
      { x: 0, y: 84, r: 56 }, { x: -62, y: 122, r: 30 }, { x: 62, y: 122, r: 30 },
    ],
  };
  RZ.LIGHTS = [];
  for (let i = 0; i < 7; i++) {
    const t = 0.06 + i * 0.145;
    const o = RZ.LE_O, n = o.length - 1, f = t * n, k = Math.min(n - 1, Math.floor(f)), u = f - k;
    const x = lerp(o[k][0], o[k + 1][0], u) - 9, y = lerp(o[k][1], o[k + 1][1], u) - 4;
    RZ.LIGHTS.push([x, y]);
  }

  function defineRazorbackArt() {
    const K = 'boss:rzb:';
    A.define(K + 'hull', 560, 400, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const B = bb(-290, -205, 580, 410);
      const hull = A.symPath(0, RZ.OUT);
      shadowUnder(ctx, hull, 9, 13, 20, 0.7);
      A.metal(ctx, hull, { base: '#252a3b', spec: 0.32, specPos: 0.26, bounds: B, edge: 3, rimLight: 2.8 });
      grime(ctx, B, 7, 0.55);
      for (const s of [-1, 1]) {
        const wing = poly(RZ.WING, s);
        shadowUnder(ctx, wing, 3, 5, 7, 0.55);
        A.metal(ctx, wing, { base: '#30364b', spec: 0.42, specPos: 0.3, bounds: B, edge: 2 });
        // chordwise ribs and alternating plate tones
        ctx.save();
        ctx.clip(wing);
        for (let i = 0; i < 6; i++) {
          const t = 0.08 + i * 0.16;
          const ax = (165 - 99 * t) * s, ay = -130 + 280 * t;
          const dx = 0.78 * s, dy = 0.63;
          const p = pline([[ax - dx * 20, ay - dy * 20], [ax + dx * 160, ay + dy * 160]]);
          A.panelLines(ctx, p, '#000', 0.6);
          if (i % 2 === 0) {
            const t2 = t + 0.16, bx = (165 - 99 * t2) * s, by2 = -130 + 280 * t2;
            tint(ctx, poly([[ax, ay], [ax + dx * 160, ay + dy * 160], [bx + dx * 160, by2 + dy * 160], [bx, by2]]), '#000000', 0.12);
          }
        }
        A.panelLines(ctx, pline([[175 * s, -138], [214 * s, -96], [236 * s, -70]]), '#000', 0.5);
        vents(ctx, 214 * s, -112, 5, 4, 15, 8, 0.66 * s);
        vents(ctx, 150 * s, 60, 4, 3.5, 12, 7, -0.67 * s);
        ctx.restore();
        // leading-edge armor strip with a pink seam and light housings
        const strip = poly(RZ.LE_O.concat(RZ.LE_I.slice().reverse()), s);
        A.metal(ctx, strip, { base: '#1b1e2b', spec: 0.7, specPos: 0.22, bounds: B, edge: 1.4, rimLight: 2.2 });
        A.emissive(ctx, pline(RZ.LE_I, s), PAL.seam, 6, { stroke: 1.2 });
        for (const [lx, ly] of RZ.LIGHTS) {
          ctx.fillStyle = '#0a0b10';
          ctx.beginPath(); ctx.ellipse(lx * s, ly, 4.4, 3.2, 0, 0, TAU); ctx.fill();
          A.emissive(ctx, circle(lx * s, ly, 1.5), '#ff7aa2', 4);
        }
        // wingtip antenna and blade
        A.metal(ctx, poly([[262, -100], [281, -74], [276, -66], [258, -92]], s), { base: '#4a5170', spec: 0.6, bounds: B, edge: 1 });
        ctx.save();
        ctx.strokeStyle = 'rgba(20,22,30,0.9)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(268 * s, -96); ctx.lineTo(286 * s, -118); ctx.stroke();
        ctx.restore();
        A.emissive(ctx, circle(286 * s, -118, 1.8), '#ff4f7f', 5);
        // Nyx sigil on the wing
        ctx.save();
        ctx.globalAlpha = 0.7;
        A.emissive(ctx, poly([[208, -78], [218, -90], [228, -78], [218, -66]], s), '#ff3f78', 5, { stroke: 1.1 });
        A.emissive(ctx, pline([[212, -72], [224, -84]], s), '#ff3f78', 4, { stroke: 1 });
        ctx.restore();
      }
      // raised central deck
      const deck = A.symPath(0, RZ.DECK);
      shadowUnder(ctx, deck, 4, 8, 11, 0.7);
      A.metal(ctx, deck, { base: '#3b415b', spec: 0.55, specPos: 0.3, bounds: bb(-170, -150, 340, 320), edge: 2.2 });
      grime(ctx, B, 13, 0.32);
      ctx.save();
      ctx.clip(deck);
      const seams = [-98, -44, 18, 82, 132];
      seams.forEach((yy, i) => {
        A.panelLines(ctx, pline([[-170, yy + 6], [-50, yy], [50, yy], [170, yy + 6]]), '#000', 0.55);
        if (i % 2 === 0) tint(ctx, poly([[-170, yy + 6], [170, yy + 6], [170, (seams[i + 1] || 170) + 6], [-170, (seams[i + 1] || 170) + 6]]), '#ffffff', 0.035);
      });
      for (const s of [-1, 1]) {
        A.panelLines(ctx, pline([[62 * s, -140], [70 * s, 40], [52 * s, 156]]), '#000', 0.5);
        vents(ctx, 100 * s, -112, 4, 4, 12, 8, 0);
        vents(ctx, 70 * s, 116, 3, 3.5, 10, 7, 0.35 * s);
        rivets(ctx, along(156 * s, -128, 72 * s, 140, 15, 0.02));
      }
      ctx.restore();
      // deck edge ridge: pink seam under the fin crest
      for (const s of [-1, 1]) {
        A.emissive(ctx, pline([[163 * s, -126], [68 * s, 146]]), PAL.seam, 7, { stroke: 1.5 });
        for (const [fx, fy] of RZ.FINS) {
          if (Math.sign(fx) !== s) continue;
          ctx.save();
          ctx.translate(fx, fy);
          ctx.rotate(RZ.FIN_LEAN * s);
          ctx.fillStyle = '#07080c';
          ctx.beginPath(); ctx.roundRect(-9, -30, 18, 62, 7); ctx.fill();
          ctx.restore();
        }
      }
      // sponsons
      for (const s of [-1, 1]) {
        const sx = RZ.TX * s, sy = RZ.TY;
        shadowUnder(ctx, circle(sx, sy, 47), 4, 7, 9, 0.65);
        A.metal(ctx, ringPath(sx, sy, 35, 47), { base: '#434a63', spec: 0.6, bounds: bb(sx - 47, sy - 47, 94, 94), edge: 1.5 });
        const g = ctx.createRadialGradient(sx - 6, sy - 6, 2, sx, sy, 35);
        g.addColorStop(0, '#1d2030');
        g.addColorStop(1, '#07080c');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, 35, 0, TAU); ctx.fill();
        const bolts = [];
        for (let i = 0; i < 16; i++) bolts.push([sx + Math.cos((i / 16) * TAU) * 41, sy + Math.sin((i / 16) * TAU) * 41]);
        rivets(ctx, bolts, 1.2);
        for (let i = 0; i < 4; i++) {
          const a = PI / 4 + (i * PI) / 2;
          A.emissive(ctx, circle(sx + Math.cos(a) * 41, sy + Math.sin(a) * 41, 1.8), PAL.glow, 5);
        }
      }
      // engine block
      for (const [ex, ny, ew] of RZ.ENG) {
        const nac = rrect(ex - ew / 2, ny + 8, ew, 70, 11);
        shadowUnder(ctx, nac, 4, 6, 9, 0.7);
        cylinder(ctx, nac, ex - ew / 2, ex + ew / 2, '#3b4157');
        for (const yy of [ny + 30, ny + 52]) A.panelLines(ctx, pline([[ex - ew / 2 + 2, yy], [ex + ew / 2 - 2, yy]]), '#000', 0.7);
        const bell = poly([[ex - ew * 0.42, ny + 12], [ex + ew * 0.42, ny + 12], [ex + ew * 0.5, ny - 4], [ex - ew * 0.5, ny - 4]]);
        cylinder(ctx, bell, ex - ew / 2, ex + ew / 2, '#2a2e3d');
        ctx.save();
        const ng = ctx.createRadialGradient(ex, ny - 4, 1, ex, ny - 4, ew * 0.5);
        ng.addColorStop(0, '#ffe2b0');
        ng.addColorStop(0.4, '#ff7a3d');
        ng.addColorStop(1, '#3a1208');
        ctx.fillStyle = ng;
        ctx.beginPath(); ctx.ellipse(ex, ny - 4, ew * 0.46, 5, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      // stern grille between the inner engines
      ctx.save();
      ctx.fillStyle = '#0b0c12';
      ctx.beginPath(); ctx.roundRect(-24, -158, 48, 30, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,80,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-20, -154 + i * 4.6); ctx.lineTo(20, -154 + i * 4.6); ctx.stroke(); }
      ctx.restore();
      // core socket (hidden under the spine plates until phase 3)
      const cy = RZ.CORE;
      shadowUnder(ctx, circle(0, cy, 56), 3, 5, 8, 0.6);
      A.metal(ctx, ringPath(0, cy, 44, 56), { base: '#30354a', spec: 0.6, bounds: bb(-56, cy - 56, 112, 112), edge: 1.6 });
      const pg = ctx.createRadialGradient(0, cy, 6, 0, cy, 44);
      pg.addColorStop(0, '#24182a');
      pg.addColorStop(0.5, '#0d0b12');
      pg.addColorStop(1, '#040407');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(0, cy, 44, 0, TAU); ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + PI / 8;
        ctx.save();
        ctx.translate(Math.cos(a) * 34, cy + Math.sin(a) * 34);
        ctx.rotate(a);
        A.metal(ctx, rrect(-11, -4, 22, 8, 2), { base: '#4a5068', spec: 0.5, bounds: bb(-11, -4, 22, 8), edge: 0.8, rimWidth: 0.8 });
        ctx.restore();
      }
      A.emissive(ctx, ringPath(0, cy, 25, 27), '#ff3f78', 8);
      // bay mouth: hot hangar interior between the two prow mandibles
      const mouth = poly([[-50, 186], [-54, 150], [-38, 138], [38, 138], [54, 150], [50, 186]]);
      ctx.fillStyle = '#06070b';
      ctx.fill(mouth);
      ctx.save();
      ctx.clip(mouth);
      const mg = ctx.createLinearGradient(0, 138, 0, 188);
      mg.addColorStop(0, '#fff0c4');
      mg.addColorStop(0.25, '#ffad55');
      mg.addColorStop(0.6, '#e2501f');
      mg.addColorStop(1, '#4a1006');
      ctx.fillStyle = mg;
      ctx.fillRect(-56, 140, 112, 48);
      ctx.strokeStyle = 'rgba(40,10,4,0.85)';
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 14, 140); ctx.lineTo(i * 20, 188); ctx.stroke(); }
      ctx.lineWidth = 2;
      for (const yy of [152, 168]) { ctx.beginPath(); ctx.moveTo(-56, yy); ctx.lineTo(56, yy); ctx.stroke(); }
      ctx.restore();
      A.emissive(ctx, pline([[-50, 186], [-54, 150], [-38, 138], [38, 138], [54, 150], [50, 186]]), '#ff8a3d', 6, { stroke: 1.4 });
      for (const s of [-1, 1]) {
        const prong = poly([[50, 186], [56, 198], [66, 194], [76, 172], [68, 150], [54, 146]], s);
        A.metal(ctx, prong, { base: '#4a5270', spec: 0.65, bounds: bb(-80, 140, 160, 60), edge: 1.4 });
        A.emissive(ctx, circle(60 * s, 190, 2.2), '#ff5c8a', 6);
      }
    }, { pad: 24, res: 1 });

    // spine armor plates over the core (blown off in phase 3)
    const PLATES = [
      [-134, -88, 28, 36], [-96, -42, 40, 44], [-50, 58, 58, 58], [50, 102, 42, 40], [94, 136, 30, 24],
    ];
    const platePath = (y0, y1, hw0, hw1) => A.symPath(0, [[0, y0], [hw0 * 0.75, y0], [hw0, y0 + 7], [hw1, y1 - 9], [hw1 * 0.6, y1], [0, y1]]);
    A.define(K + 'spine', 130, 290, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      for (let i = PLATES.length - 1; i >= 0; i--) {
        const [y0, y1, a, c] = PLATES[i];
        const p = platePath(y0, y1, a, c);
        shadowUnder(ctx, p, 3, 6, 7, 0.7);
        A.metal(ctx, p, { base: i === 2 ? '#454c68' : '#3e4560', spec: 0.62, specPos: 0.28, bounds: bb(-c, y0, c * 2, y1 - y0), edge: 1.8 });
        A.panelLines(ctx, pline([[0, y0 + 3], [0, y1 - 3]]), '#000', 0.45);
        if (i === 2) {
          A.panelLines(ctx, pline([[-40, -36], [40, 46]]), '#000', 0.4);
          A.panelLines(ctx, pline([[40, -36], [-40, 46]]), '#000', 0.4);
          vents(ctx, -30, 6, 3, 3.5, 14, 7, 0);
          vents(ctx, 30, 6, 3, 3.5, 14, 7, 0);
          A.emissive(ctx, circle(0, 4, 5), '#ff3f78', 9);
          A.metal(ctx, ringPath(0, 4, 5, 10), { base: '#5a6282', spec: 0.6, bounds: bb(-10, -6, 20, 20), edge: 0.8 });
        }
        A.emissive(ctx, pline([[-a * 0.7, y0 + 2], [a * 0.7, y0 + 2]]), PAL.seam, 5, { stroke: 1 });
        rivets(ctx, [[-a + 6, y0 + 9], [a - 6, y0 + 9], [-c + 6, y1 - 10], [c - 6, y1 - 10]], 1.2);
      }
      // dorsal ridge
      const ridge = A.symPath(0, [[0, -136], [5, -130], [6, 128], [0, 134]]);
      A.metal(ctx, ridge, { base: '#5b6382', spec: 0.75, bounds: bb(-6, -136, 12, 270), edge: 0.8, rimWidth: 0.8 });
    }, { pad: 12, res: 1 });
    A.define(K + 'plate', 64, 64, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const p = platePath(-26, 26, 22, 26);
      A.metal(ctx, p, { base: '#424a64', spec: 0.6, bounds: bb(-26, -26, 52, 52), edge: 1.4 });
      A.panelLines(ctx, pline([[0, -22], [0, 22]]), '#000', 0.5);
      A.emissive(ctx, pline([[-16, -24], [16, -24]]), PAL.seam, 4, { stroke: 1 });
    }, { pad: 2, res: 1 });

    // fins: swept serrated blades, lit faces baked per side
    const FIN = [[-14, 38], [-16, 10], [-10, -18], [-3, -42], [2, -40], [10, -30], [5, -26], [14, -13], [9, -9], [17, 5], [12, 9], [19, 24], [13, 28], [18, 38]];
    const finGeom = (s) => {
      const lean = RZ.FIN_LEAN * s, c = Math.cos(lean), sn = Math.sin(lean);
      return FIN.map(([x, y]) => { const xx = x * s; return [xx * c - y * sn, xx * sn + y * c]; });
    };
    for (const s of [-1, 1]) {
      const name = s > 0 ? 'finR' : 'finL';
      A.define(K + name, 76, 100, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        const pts = finGeom(s);
        const all = poly(pts);
        shadowUnder(ctx, all, 7, 9, 6, 0.75);
        // facets: inner face (to the ridge) and serrated outer face
        const ridgeTop = pts[3], ridgeBot = [(pts[0][0] + pts[13][0]) / 2, 38 * Math.cos(RZ.FIN_LEAN)];
        const inner = poly([pts[0], pts[1], pts[2], pts[3], ridgeBot]);
        const outer = poly(pts.slice(3).concat([ridgeBot]));
        const lit = s > 0 ? inner : outer, shade = s > 0 ? outer : inner;
        A.metal(ctx, lit, { base: '#59617f', spec: 0.75, specPos: 0.3, bounds: bb(-24, -44, 48, 88), edge: 1, rimLight: 2 });
        A.metal(ctx, shade, { base: '#2c3145', spec: 0.35, specPos: 0.4, bounds: bb(-24, -44, 48, 88), edge: 1, rimLight: 1.2 });
        A.panelLines(ctx, pline([ridgeTop, ridgeBot]), '#ffffff', 0.35);
        A.emissive(ctx, pline(pts.slice(4, 13)), '#ff3f78', 3, { stroke: 0.9 });
      }, { pad: 8, res: 2 });
      A.define(K + name + '_glow', 76, 100, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        const pts = finGeom(s);
        ctx.globalCompositeOperation = 'lighter';
        A.emissive(ctx, pline(pts.slice(3, 14)), '#ff5c8a', 12, { stroke: 3 });
        A.emissive(ctx, pline(pts.slice(3, 14)), '#ffd0e0', 6, { stroke: 1.2 });
      }, { pad: 12, res: 1 });
    }

    // turret: rotating twin guns (barrels along +x), static dome, wreck
    A.define(K + 'tgun', 150, 64, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const mant = rrect(-20, -21, 52, 42, 8);
      shadowUnder(ctx, mant, 3, 4, 5, 0.6);
      A.metal(ctx, mant, { base: '#3f4660', spec: 0.5, bounds: bb(-20, -21, 52, 42), edge: 1.4, angle: -PI / 2 });
      for (const s of [-1, 1]) {
        const y = s * 10;
        const brl = rrect(24, y - 4.5, 44, 9, 3);
        shadowUnder(ctx, brl, 2, 3, 3, 0.6);
        const g = ctx.createLinearGradient(0, y - 4.5, 0, y + 4.5);
        g.addColorStop(0, '#15171f'); g.addColorStop(0.3, '#8a92ad'); g.addColorStop(0.55, '#4b5269'); g.addColorStop(1, '#101219');
        ctx.fillStyle = g;
        ctx.fill(brl);
        const brake = rrect(60, y - 6.5, 12, 13, 2.5);
        const g2 = ctx.createLinearGradient(0, y - 6.5, 0, y + 6.5);
        g2.addColorStop(0, '#111319'); g2.addColorStop(0.35, '#7a829c'); g2.addColorStop(1, '#0c0d12');
        ctx.fillStyle = g2;
        ctx.fill(brake);
        ctx.fillStyle = '#050608';
        ctx.fillRect(70, y - 2.5, 3, 5);
        A.panelLines(ctx, pline([[40, y - 4], [40, y + 4]]), '#000', 0.6);
      }
    }, { pad: 4, res: 2 });
    A.define(K + 'tdome', 64, 64, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      shadowUnder(ctx, circle(0, 0, 28), 3, 4, 6, 0.6);
      dome(ctx, 0, 0, 28, '#444b66');
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, 28, 0, TAU); ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke();
      ctx.restore();
      dome(ctx, -4, -3, 8, '#59617f');
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(-11, -13, 7, 3.5, -0.7, 0, TAU); ctx.fill();
    }, { pad: 6, res: 2 });
    A.define(K + 'twreck', 100, 100, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const rng = SL.makeRng(77);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
      g.addColorStop(0, '#ff9a4a'); g.addColorStop(0.25, '#7a2410'); g.addColorStop(0.6, '#120806'); g.addColorStop(1, '#040304');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + rng.next() * 0.5, r0 = 18 + rng.next() * 8, r1 = 30 + rng.next() * 12;
        const p = poly([[Math.cos(a - 0.2) * r0, Math.sin(a - 0.2) * r0], [Math.cos(a) * r1, Math.sin(a) * r1], [Math.cos(a + 0.24) * r0, Math.sin(a + 0.24) * r0]]);
        A.metal(ctx, p, { base: '#3a3f55', spec: 0.5, bounds: bb(-40, -40, 80, 80), edge: 0.8 });
      }
      scorch(ctx, 0, 0, 40, rng);
      A.emissive(ctx, circle(6, 4, 4), '#ff8a3d', 8);
      A.emissive(ctx, circle(-8, -6, 2.5), '#ffb060', 6);
    }, { pad: 4, res: 1 });
    A.define(K + 'tdebris', 96, 96, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-0.4);
      ctx.drawImage(A.get(K + 'tgun').canvas, -40, -18, 80, 36);
      ctx.drawImage(A.get(K + 'tdome').canvas, -19, -19, 38, 38);
    }, { pad: 0, res: 1 });

    // bay doors (shutters that retract sideways)
    for (const s of [-1, 1]) {
      A.define(K + (s < 0 ? 'doorL' : 'doorR'), 52, 48, (ctx, w, h) => {
        const p = poly(s < 0 ? [[2, 2], [50, 2], [50, 46], [4, 46]] : [[2, 2], [50, 2], [48, 46], [2, 46]]);
        A.metal(ctx, p, { base: '#3a4058', spec: 0.6, bounds: bb(0, 0, w, h), edge: 1.4 });
        for (const yy of [14, 28, 40]) A.panelLines(ctx, pline([[6, yy], [46, yy]]), '#000', 0.6);
        A.emissive(ctx, pline(s < 0 ? [[49, 4], [49, 44]] : [[3, 4], [3, 44]]), '#ff5c8a', 5, { stroke: 1.4 });
        ctx.save();
        ctx.fillStyle = 'rgba(255,200,60,0.28)';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          const x0 = 8 + i * 11;
          ctx.moveTo(x0, 4); ctx.lineTo(x0 + 6, 4); ctx.lineTo(x0 + 1, 12); ctx.lineTo(x0 - 5, 12); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }, { pad: 2, res: 1 });
    }
    // exposed reactor core
    A.define(K + 'core', 80, 80, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const g = ctx.createRadialGradient(-5, -6, 1, 0, 0, 26);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#ffd0e2'); g.addColorStop(0.65, '#ff4f8a'); g.addColorStop(1, '#5a0f2c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(30,8,20,0.75)';
      ctx.lineWidth = 3;
      for (const a of [0.5, 1.6, 2.7]) { ctx.beginPath(); ctx.ellipse(0, 0, 26, 9, a, 0, TAU); ctx.stroke(); }
      A.metal(ctx, ringPath(0, 0, 26, 32), { base: '#3c4258', spec: 0.6, bounds: bb(-32, -32, 64, 64), edge: 1 });
    }, { pad: 4, res: 2 });
    A.define(K + 'shadow', 560, 400, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      shadowUnder(ctx, A.symPath(0, RZ.OUT), 0, 0, 26, 0.95);
    }, { pad: 40, res: 0.5 });
    for (const lv of [1, 2]) {
      A.define(K + 'dmg' + lv, 560, 400, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        damageOverlay(ctx, A.symPath(0, RZ.OUT), RZ.DMG, lv, 900 + lv, '#ff8a3d');
      }, { pad: 24, res: 1 });
    }
    ART.boss_razorback = ['hull', 'spine', 'plate', 'finL', 'finR', 'finL_glow', 'finR_glow', 'tgun', 'tdome', 'twreck', 'tdebris',
      'doorL', 'doorR', 'core', 'shadow', 'dmg1', 'dmg2'].map((k) => K + k);
  }

  function rzAnimate(b, dt) {
    const d = b.data;
    // turrets track the aim point
    for (const id of ['turret_l', 'turret_r']) {
      const e = d.parts[id];
      if (!e || e.dead) continue;
      const pd = e.data;
      if (pd.ang == null) pd.ang = -PI / 2;
      const t = target(e, b);
      const want = d.stowed ? -PI / 2 : Math.atan2(t.y - e.y, t.x - e.x);
      pd.ang += clamp(U.angleDiff(pd.ang, want), -2.6 * dt, 2.6 * dt);
      if (pd.glow > 0) pd.glow -= dt;
      if (pd.recoil > 0) pd.recoil = Math.max(0, pd.recoil - dt * 8);
    }
    // bay doors
    const B = d.bay;
    if (B.broken) B.open = Math.min(1, B.open + dt * 4);
    else {
      if (B.holdT > 0) { B.holdT -= dt; B.want = Math.max(B.want, B.level); } else B.want = 0;
      B.open = approach(B.open, B.want, B.want > B.open ? 1 / 0.6 * 1.6 : 3, dt);
    }
    // fins
    for (const f of d.fins) {
      f.charge = approach(f.charge, f.lit ? 1 : 0, f.lit ? 14 : 5, dt);
      if (f.flash > 0) f.flash -= dt;
    }
    if (d.prowGlow > 0) d.prowGlow -= dt;
    if (d.coreFlash > 0) d.coreFlash -= dt;
  }
  function rzOpenBay(b, hold, level) { const B = b.data.bay; B.holdT = hold; B.level = level == null ? 1 : level; }
  function rzTurretBurst(b, id) {
    const e = part(b, id);
    if (!e || e.dead || e.data.broken) return;
    e.data.glow = 0.3;
    for (let i = 0; i < 3; i++) {
      later(b, 0.3 + i * 0.12, () => {
        if (e.dead || e.data.broken) return;
        const pd = e.data;
        pd.barrel = (pd.barrel || 0) ^ 1;
        const a = pd.ang, off = pd.barrel ? 10 : -10;
        const mx = e.x + Math.cos(a) * 70 - Math.sin(a) * off, my = e.y + Math.sin(a) * 70 + Math.cos(a) * off;
        fire(mx, my, aimFrom(mx, my, b), 250, 'orb', { owner: e });
        pd.flash = 0.09;
        pd.recoil = 1;
      });
    }
  }
  function rzTurrets(b, S, every) {
    S.turT -= b.data.dt;
    if (S.turT > 0) return;
    S.turT = every;
    const ids = ['turret_l', 'turret_r'].filter((id) => alive(b, id));
    if (!ids.length) return;
    S.turSide = ((S.turSide || 0) + 1) % 2;
    rzTurretBurst(b, ids[S.turSide % ids.length]);
  }
  function rzGnats(b) {
    const x = b.x, y = b.y + RZ.BAY + 6;
    const F = SL.formations, haveGnat = SL.enemies.has('gnat');
    let spawned = null;
    if (haveGnat && F && F.has && F.has('vee')) {
      try {
        const f = F.get('vee');
        const o = { enemy: 'gnat', count: 4, x, y, fromBoss: true };
        spawned = typeof f === 'function' ? f(o) : f && f.spawn ? f.spawn(o) : null;
      } catch (err) { U.warnOnce('bossesA:vee', '[bossesA] vee formation threw; launching gnats directly', err); spawned = null; }
    }
    if (!spawned || !spawned.length) {
      for (let i = 0; i < 4; i++) {
        const k = i - 1.5;
        const e = SL.spawnEnemy(haveGnat ? 'gnat' : RZ_DRONE, { x: x + k * 38, y: y - Math.abs(k) * 18, vx: k * 40, vy: 210 });
        if (e && !e.dead) { e.vx = k * 40; e.vy = 210; }
      }
    }
    SL.fx.sparks(x, y, { count: 14, color: '#ffb060', speed: 320, angle: PI / 2, spread: 1.4 });
  }
  // fallback bay drone when the gnat enemy is not defined (never warns)
  const RZ_DRONE = {
    id: 'rzb_drone', name: 'Bay drone', hp: 22, r: 16, score: 50, credits: [1, 1], explosion: 's',
    update(e, dt) { e.vx *= 1 - Math.min(1, dt * 0.6); },
    draw(e, ctx) {
      A.flame(ctx, e.x, e.y - 12, 7, 16, '#ffffff', PAL.engine, SL.time.t + e.id);
      SL.render.setTransform(ctx, e.x, e.y, 0);
      ctx.fillStyle = '#3a3f55';
      ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(14, -10); ctx.lineTo(0, -4); ctx.lineTo(-14, -10); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = PAL.seam; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 12); ctx.stroke();
      SL.render.resetTransform(ctx);
    },
  };

  defineBoss('boss_razorback', {
    name: 'RAZORBACK', title: 'Nyx Assault Carrier', hp: 9000, r: 200, score: 50000, parTime: 75, size: [560, 380],
    credits: [30, 4], palette: 'enemy', debris: DEBRIS_GRAPHITE,
    init(b) {
      const d = b.data;
      b.x = W / 2; b.y = -300;
      b.circles = RZ.CIRCLES.map((c) => ({ x: c.x, y: c.y, r: c.r }));
      d.bay = { open: 0, want: 0, holdT: 0, level: 1, broken: false };
      d.fins = RZ.FINS.map(() => ({ charge: 0, lit: false, flash: 0 }));
      d.stowed = true;
      d.prowGlow = 0; d.coreFlash = 0; d.dt = 1 / 60;
      for (const s of [-1, 1]) {
        addPart(b, s < 0 ? 'turret_l' : 'turret_r', { ox: RZ.TX * s, oy: RZ.TY, r: 34, hp: 1200, bonus: 400 });
      }
      addPart(b, 'core', {
        ox: 0, oy: 0, r: 200, weak: true, circles: [{ x: 0, y: RZ.BAY, r: 40 }],
        mult: (bb2) => (bb2.phase >= 2 ? 2.0 : bb2.data.bay.open > 0.7 ? 1.5 : 1.0),
      });
      sfx('boss_roar', { x: b.x });
    },
    intro(b, dt) {
      const d = b.data, t = d.at;
      d.dt = dt;
      b.x = W / 2;
      b.y = t < 1 ? -300 : lerp(-300, 230, SL.ease.outCubic(clamp((t - 1) / 3, 0, 1)));
      if (t > 2.9) d.stowed = false;
      rzAnimate(b, dt);
      return t >= 4;
    },
    update(b, dt) {
      const d = b.data;
      d.dt = dt;
      const t = b.fightT;
      let tx = W / 2, ty = 230 + Math.sin(t * 1.3) * 7;
      if (b.phase === 0) tx = W / 2 + 80 * Math.sin(TAU * 0.15 * t);
      else if (b.phase === 1) tx = W / 2 + 200 * Math.sin(TAU * d.pt / 12);
      else tx = W / 2 + 40 * Math.sin(d.pt * 0.5);
      b.x = approach(b.x, tx, 3, dt);
      b.y = approach(b.y, ty, 3, dt);
      rzAnimate(b, dt);
      damageFx(b, dt, RZ.DMG);
    },
    phases: [
      {
        at: 1.0, name: 'Broadside',
        enter(b, S) { S.turT = 1.2; S.bayT = 2.5; S.fanT = 1.6; },
        update(b, dt, S) {
          rzTurrets(b, S, 1.2);
          if ((S.bayT -= dt) <= 0) {
            S.bayT = 7;
            rzOpenBay(b, 2.6, 1);
            later(b, 0.6, rzGnats);
          }
          if ((S.fanT -= dt) <= 0) {
            S.fanT = 3.5;
            b.data.prowGlow = 0.35;
            later(b, 0.35, () => pFan(b, PI / 2, { oy: 192, count: 7, spread: 1.0, speed: 180, type: 'orbBig' }));
          }
        },
      },
      {
        at: 0.65, name: 'Spine Lance',
        enter(b, S) { S.finT = 1.0; S.dir = 1; S.ringT = 2.2; S.turT = 1.6; S.rk = 0; },
        update(b, dt, S) {
          const d = b.data;
          if ((S.finT -= dt) <= 0) {
            S.finT = 4;
            const order = S.dir > 0 ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
            S.dir = -S.dir;
            sfx('enemy_charge', { x: b.x });
            order.forEach((fi, k) => {
              later(b, 0.15 * k, () => { d.fins[fi].lit = true; });
              later(b, 0.9 + 0.15 * k, () => {
                const f = d.fins[fi];
                f.lit = false; f.flash = 0.14;
                const [fx, fy] = RZ.FINS[fi];
                pFan(b, PI / 2, { ox: fx, oy: fy + 22, count: 3, spread: 0.3, speed: 380, type: 'needle' });
              });
            });
          }
          if ((S.ringT -= dt) <= 0) {
            S.ringT = 3.5;
            rzOpenBay(b, 1.0, 0.45);
            const n = cnt(14);
            S.rk ^= 1;
            const off0 = S.rk ? PI / n : 0;
            later(b, 0.3, () => pRing(b, { oy: RZ.BAY, count: n, fr: 1, speed: 170, type: 'orb', offset: off0 }));
            later(b, 0.8, () => pRing(b, { oy: RZ.BAY, count: n, fr: 1, speed: 170, type: 'orb', offset: off0 + PI / n }));
          }
          rzTurrets(b, S, 1.6);
        },
      },
      {
        at: 0.30, name: 'Open Bay',
        enter(b, S) {
          const d = b.data;
          d.spineOff = true;
          d.bay.broken = true;
          d.coreFlash = 0.6;
          for (const L of d.fins) L.lit = false;
          const core = part(b, 'core');
          if (core) core.circles = [{ x: 0, y: RZ.BAY, r: 40 }, { x: 0, y: 98, r: 34 }, { x: 0, y: RZ.CORE, r: 48 }];
          // spine plates blow off
          for (let i = 0; i < 7; i++) {
            const a = -PI / 2 + crnd(-1.3, 1.3), sp = crnd(260, 520);
            SL.fx.emit({ x: b.x + crnd(-30, 30), y: b.y + crnd(-110, 110), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: crnd(1.6, 2.4), size: crnd(44, 60), size2: 40, shape: 'boss:rzb:plate', blend: 'normal', gravity: 600, rot: crnd(0, TAU), spin: crnd(-6, 6), alpha: 1, alpha2: 0, ease: true });
          }
          chainBlast(b, b.x, b.y + RZ.CORE, 'l', 'enemy', true);
          SL.fx.shockwave(b.x, b.y + RZ.CORE, { radius: 300, duration: 0.6, strength: 1.2, color: '#ff9ac0' });
          S.beamT = 1.0; S.dir = 1; S.sp = {}; S.aimT = 1.0;
        },
        update(b, dt, S) {
          const low = b.hp / b.maxHp < 0.10;
          if ((S.beamT -= dt) <= 0) {
            S.beamT = 6;
            const a0 = PI / 2 + S.dir * 0.61, a1 = PI / 2 - S.dir * 0.61;
            S.dir = -S.dir;
            pBeamSweep(b, b, { from: a0, to: a1, width: 34, telegraph: 0.9, duration: 1.6, oy: RZ.CORE, arrowR: 170 });
            b.data.coreFlash = 0.9;
          }
          if (!beamBusy(b)) pSpiral(S.sp, b, dt, { oy: RZ.CORE, arms: 2, rate: 10, spin: low ? 2.2 : 1.6, speed: 180, on: 2.5, off: 1.5, type: 'orb' });
          if (low && (S.aimT -= dt) <= 0) {
            S.aimT = 1.0;
            pAimed(b, { oy: RZ.CORE, speed: 200, type: 'orbBig' });
          }
        },
      },
    ],
    draw(b, ctx) {
      const d = b.data, t = SL.time.t, K = 'boss:rzb:';
      const dy = b.dying;
      const jx = dy ? crnd(-5, 5) : 0, jy = dy ? crnd(-4, 4) : 0;
      const x = b.x + jx, y = b.y + jy;
      // intro: the carrier's shadow sweeps across the field first
      if (!b.introDone && d.at < 1.8) {
        const k = d.at / 1.8;
        A.drawSprite(ctx, K + 'shadow', W / 2 + 40 - k * 80, lerp(-500, H + 500, k), 0, 1.7, 0.55 * Math.sin(k * PI));
      }
      if (y < -260) return;
      const hpF = b.hp / b.maxHp;
      // engine plumes (up)
      const thrust = b.introDone ? 1 : 1.35;
      for (let i = 0; i < 4; i++) {
        const [ex, ny, ew] = RZ.ENG[i];
        const flick = dy ? (Math.random() < 0.3 ? 0.3 : 1) : 1;
        plume(ctx, x + ex, y + ny - 2, -PI / 2, ew * 0.78, (70 + 14 * Math.sin(t * 7 + i)) * thrust * flick, '#ffffff', PAL.engine, t + i * 0.37);
        A.drawGlow(ctx, x + ex, y + ny - 3, ew * 0.85, PAL.engine, 0.75 * flick);
      }
      A.drawSprite(ctx, K + 'hull', x, y);
      if (hpF < 0.85) A.drawSprite(ctx, K + 'dmg1', x, y, 0, 1, sm01((0.85 - hpF) / 0.3));
      if (hpF < 0.5) A.drawSprite(ctx, K + 'dmg2', x, y, 0, 1, sm01((0.5 - hpF) / 0.3));
      bossFlash(b, ctx, K + 'hull', x, y);
      // hot glints in the torn plates
      if (hpF < 0.5) {
        for (let i = 0; i < RZ.DMG.length; i += 2) {
          const p = RZ.DMG[i];
          A.drawGlow(ctx, x + p[0], y + p[1], 16, '#ff7a2f', (0.35 + 0.25 * Math.sin(t * 9 + i * 1.7)) * sm01((0.5 - hpF) / 0.3));
        }
      }
      // bay: interior glow, doors
      const B = d.bay, by = y + RZ.BAY;
      if (B.open > 0.02) {
        A.drawGlow(ctx, x, by - 2, 50 + 26 * B.open, '#ff8a3d', 0.55 * B.open);
        A.drawGlow(ctx, x, by - 14, 26 + 10 * B.open, '#fff0c4', 0.65 * B.open);
      }
      if (!B.broken) {
        const o = B.open;
        const dw = 50 * (1 - o * 0.86);
        if (dw > 1) {
          ctx.drawImage(A.get(K + 'doorL').canvas, x - 50 - 2, by - 26, dw + 4, 52);
          ctx.drawImage(A.get(K + 'doorR').canvas, x + 50 - dw - 2, by - 26, dw + 4, 52);
        }
      }
      if (d.prowGlow > 0) A.drawGlow(ctx, x, y + 190, 46, '#ffb060', d.prowGlow / 0.35);
      // spine plates or the exposed core
      if (!d.spineOff) A.drawSprite(ctx, K + 'spine', x, y);
      else {
        const cy = y + RZ.CORE;
        const pulse = 0.5 + 0.5 * Math.sin(t * 7);
        const ck = dy ? clamp(1 - (b.deathT - 1.5) / 0.25, 0, 1) : 1;
        A.drawGlow(ctx, x, cy, (70 + 16 * pulse) * (dy && b.deathT > 1.2 ? 1 + (b.deathT - 1.2) * 2 : 1), PAL.glow, 0.6 * ck);
        A.drawSprite(ctx, K + 'core', x, cy, t * 0.6, 1, ck);
        A.drawGlow(ctx, x, cy, 30 + 8 * pulse + (d.coreFlash > 0 ? 30 * d.coreFlash : 0), '#ffe0ec', 0.85 * ck);
        // conduit channel from the bay to the core
        lineGlow(ctx, x, cy + 30, PI / 2, RZ.BAY - RZ.CORE - 40, 8, '#ff8a3d', 0.35 + 0.15 * pulse);
      }
      // fins with charge glow
      for (let i = 0; i < 6; i++) {
        const [fx, fy] = RZ.FINS[i], f = d.fins[i], side = fx < 0 ? 'finL' : 'finR';
        if (d.spineOff && dy && b.deathT > 0.3 + i * 0.1) continue;
        const wob = f.charge > 0.05 ? crnd(-0.6, 0.6) * f.charge : 0;
        A.drawSprite(ctx, K + side, x + fx + wob, y + fy);
        const g = Math.max(f.charge, f.flash > 0 ? f.flash / 0.14 : 0, B.open > 0.3 && d.spineOff ? 0.15 : 0);
        if (g > 0.02) {
          ctx.globalCompositeOperation = 'lighter';
          A.drawSprite(ctx, K + side + '_glow', x + fx, y + fy, 0, 1, Math.min(1, g * (0.85 + 0.15 * Math.sin(t * 40))));
          ctx.globalCompositeOperation = 'source-over';
          if (f.flash > 0) A.drawGlow(ctx, x + fx, y + fy + 24, 30, '#ff9ac0', f.flash / 0.14);
        }
      }
      // turrets
      for (const id of ['turret_l', 'turret_r']) {
        const e = d.parts[id];
        if (!e) continue;
        const pd = e.data, tx = x + (id === 'turret_l' ? -RZ.TX : RZ.TX), ty = y + RZ.TY;
        if (pd.broken || pd.torn) {
          if (!pd.torn) A.drawSprite(ctx, K + 'twreck', tx, ty);
          else A.drawSprite(ctx, K + 'twreck', tx, ty, 0, 1, 0.9);
          A.drawGlow(ctx, tx + 4, ty + 3, 22, '#ff7a2f', 0.4 + 0.2 * Math.sin(t * 11 + tx));
          continue;
        }
        const a = pd.ang == null ? -PI / 2 : pd.ang, rc = (pd.recoil || 0) * 5;
        A.drawSprite(ctx, K + 'tgun', tx - Math.cos(a) * rc, ty - Math.sin(a) * rc, a);
        if (pd.glow > 0 || pd.flash > 0) {
          const gk = pd.glow > 0 ? 1 - pd.glow / 0.3 : 0;
          for (const s of [-1, 1]) {
            const mx = tx + Math.cos(a) * 70 - Math.sin(a) * 10 * s, my = ty + Math.sin(a) * 70 + Math.cos(a) * 10 * s;
            if (pd.glow > 0) A.drawGlow(ctx, mx, my, 10 + 14 * gk, PAL.glow, 0.4 + 0.6 * gk);
          }
          if (pd.flash > 0) {
            const s = pd.barrel ? 1 : -1;
            const mx = tx + Math.cos(a) * 74 - Math.sin(a) * 10 * s, my = ty + Math.sin(a) * 74 + Math.cos(a) * 10 * s;
            A.drawGlow(ctx, mx, my, 30, '#ffd0e0', pd.flash / 0.09);
          }
        }
        A.drawSprite(ctx, K + 'tdome', tx, ty);
        if (e.flash > 0) A.drawFlash(ctx, K + 'tdome', tx, ty, 0, 1, 0.5);
        A.drawGlow(ctx, tx + Math.cos(a) * 17, ty + Math.sin(a) * 17, 9, '#ff4f7f', 0.8 + 0.2 * Math.sin(t * 13));
      }
      // running lights chase along the wing edges; flicker as damage mounts
      const ph = (t * 7) % 9;
      for (let i = 0; i < RZ.LIGHTS.length; i++) {
        const [lx, ly] = RZ.LIGHTS[i];
        let a = 0.25 + (Math.abs(ph - i) < 1 ? 0.75 : 0);
        if (hpF < 0.4 && Math.random() < 0.25) a *= 0.2;
        A.drawGlow(ctx, x + lx, y + ly, 12, '#ff4f7f', a);
        A.drawGlow(ctx, x - lx, y + ly, 12, '#ff4f7f', a);
      }
      drawMarks(b, ctx);
      drawBeamTelegraphs(b, ctx, PAL.glow);
    },
    death: {
      start(b) { b.data.dieY = b.y; },
      steps: [
        [0.0, (b) => { SL.fx.shake(14, 2.4); }],
        ...[0, 1, 2, 3, 4, 5].map((i) => [0.12 + i * 0.2, (b) => chainBlast(b, b.x + crnd(-16, 16), b.y - 120 + i * 50, 'm', 'enemy', i % 2 === 0)]),
        [0.5, (b) => rzTear(b, 'turret_l', -1)],
        [0.85, (b) => rzTear(b, 'turret_r', 1)],
        [1.5, (b) => {
          SL.fx.flash('#ffffff', 0.7, 0.45);
          SL.fx.shockwave(b.x, b.y + RZ.CORE, { radius: 400, duration: 0.7, strength: 1.8, color: '#ffe0ec' });
          SL.fx.chromatic(0.6, 0.5);
        }],
        [1.95, (b) => finish(b, { palette: 'enemy', ripple: 720, credits: [30, 4], ring: '#ffd0b0' })],
      ],
      tick(b, dt, t) {
        b.y = b.data.dieY + t * 18;
        damageFx(b, dt, RZ.DMG);
        if (Math.random() < dt * 6) {
          const p = RZ.DMG[(Math.random() * RZ.DMG.length) | 0];
          SL.fx.explode(b.x + p[0], b.y + p[1], { size: 's', sound: false, shake: false });
        }
      },
    },
    art: [],
  });
  function rzTear(b, id, s) {
    const e = part(b, id);
    const x = b.x + RZ.TX * s, y = b.y + RZ.TY;
    chainBlast(b, x, y, 'l', 'enemy', true);
    if (e && !e.data.broken) {
      e.data.torn = true;
      SL.fx.emit({ x, y, vx: s * crnd(160, 260), vy: crnd(-420, -320), life: 2.2, size: 96, size2: 80, shape: 'boss:rzb:tdebris', blend: 'normal', gravity: 640, rot: 0, spin: s * crnd(4, 7), alpha: 1, alpha2: 0, ease: true });
    }
    debrisBurst(x, y, DEBRIS_GRAPHITE, 8, 360, 10, 10);
  }

  // ================================================================== LODESTAR (GDD 8.2)
  const LS = {
    RO: 210, RI: 140, N: 12, GAP: 0.05, HOR: 34, HOR3: 52, RANGE: 560,
    // anchor pylons (static), listed in clockwise order (screen y is down): NE, SE, SW, NW
    PY: [['pylon_ne', -PI / 4], ['pylon_se', PI / 4], ['pylon_sw', 3 * PI / 4], ['pylon_nw', -3 * PI / 4]],
    PR: 232, TIP: 282, EM: 8,
    LIGHT: Math.atan2(-0.8, -0.6),
    VIO: '#b26bff', VIO2: '#d9b8ff',
  };
  LS.HALF = PI / LS.N;
  LS.RC = (LS.RI * Math.cos(LS.HALF) + LS.RO) / 2; // segment sprite box center, measured from the ring center
  LS.SW = Math.ceil(2 * LS.RO * Math.sin(LS.HALF)) + 6;
  LS.SH = Math.ceil(LS.RO - LS.RI * Math.cos(LS.HALF)) + 6;
  const LSK = 'boss:lds:';

  /** Annular sector of one ring segment in sprite space (box center at the origin, ring center at (0, RC)). */
  function lsSegPath(inset, gapK) {
    const p = new Path2D(), cy = LS.RC, ro = LS.RO - inset, ri = LS.RI + inset;
    const da = LS.HALF - LS.GAP * (gapK || 1) / 2 - inset / ((ro + ri) / 2);
    p.arc(0, cy, ro, -PI / 2 - da, -PI / 2 + da);
    p.arc(0, cy, ri, -PI / 2 + da, -PI / 2 - da, true);
    p.closePath();
    return p;
  }
  /** Polar swirl (accretion) sprite: noise sampled along spiralling streamlines, colored by radius. */
  function swirlCanvas(r0, r1, o) {
    const S = Math.ceil(r1 * 2 + 4), c = A.canvas(S, S), x = c.getContext('2d');
    const NW = 256, NH = 48;
    const nz = A.noise(NW, NH, { scale: o.scale || 24, octaves: 4, seed: o.seed || 1, ridged: !!o.ridged });
    const img = x.createImageData(S, S), px = img.data, h = S / 2;
    const ramp = o.ramp.map((s) => [s[0], C.parse(s[1])]);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const dx = i + 0.5 - h, dy = j + 0.5 - h, r = Math.sqrt(dx * dx + dy * dy);
        if (r < r0 || r > r1) continue;
        const t = (r - r0) / (r1 - r0);
        let u = (Math.atan2(dy, dx) / TAU + 1 + t * o.twist) % 1;
        u *= NW;
        const v = t * (NH - 1), iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
        const a = nz[iv * NW + (iu % NW)], bq = nz[iv * NW + ((iu + 1) % NW)];
        const cq = nz[Math.min(NH - 1, iv + 1) * NW + (iu % NW)], dq = nz[Math.min(NH - 1, iv + 1) * NW + ((iu + 1) % NW)];
        const n = lerp(lerp(a, bq, fu), lerp(cq, dq, fu), fv);
        let k = 0;
        while (k < ramp.length - 2 && t > ramp[k + 1][0]) k++;
        const s0 = ramp[k], s1 = ramp[k + 1], f = clamp((t - s0[0]) / Math.max(1e-4, s1[0] - s0[0]), 0, 1);
        const edge = Math.min(1, t / 0.08) * Math.pow(1 - t, o.fade || 1.6);
        const al = edge * clamp((n - (o.cut || 0.3)) / (1 - (o.cut || 0.3)), 0, 1) ** (o.pow || 1.2) * (o.alpha || 1);
        const q = (j * S + i) * 4;
        px[q] = lerp(s0[1][0], s1[1][0], f); px[q + 1] = lerp(s0[1][1], s1[1][1], f); px[q + 2] = lerp(s0[1][2], s1[1][2], f);
        px[q + 3] = clamp(al, 0, 1) * 255;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function drawPylon(ctx, rot, broken) {
    // local frame: -y points outward along the diagonal; the pylon spans y -58 (coil tip) .. +58 (clamp on the ring)
    const la = LS.LIGHT - rot;
    ctx.rotate(rot);
    const bnd = bb(-32, -60, 64, 120);
    const clampP = poly([[-34, 58], [34, 58], [30, 30], [20, 22], [-20, 22], [-30, 30]]);
    shadowUnder(ctx, clampP, 5, 8, 8, 0.7);
    A.metal(ctx, clampP, { base: '#2f3448', spec: 0.5, angle: la, bounds: bnd, edge: 1.6 });
    vents(ctx, 0, 44, 4, 4, 10, 9, 0);
    rivets(ctx, [[-26, 52], [26, 52], [-22, 32], [22, 32]], 1.3);
    A.emissive(ctx, pline([[-28, 56], [28, 56]]), PAL.seam, 5, { stroke: 1.2 });
    if (broken) {
      const stump = poly([[-17, 24], [17, 24], [15, 6], [9, 0], [4, 8], [-3, -2], [-9, 7], [-15, 2]]);
      A.metal(ctx, stump, { base: '#2a2e3f', spec: 0.35, angle: la, bounds: bnd, edge: 1.2 });
      const rng = SL.makeRng(51);
      scorch(ctx, 0, 14, 26, rng);
      crack(ctx, -6, 18, 16, -1.2, rng, true);
      tornHole(ctx, 2, 8, 8, rng, '#c070ff');
      ctx.rotate(-rot);
      return;
    }
    const strut = poly([[-19, 24], [19, 24], [14, -28], [-14, -28]]);
    shadowUnder(ctx, strut, 4, 6, 6, 0.65);
    A.metal(ctx, strut, { base: '#3d4460', spec: 0.6, angle: la, bounds: bnd, edge: 1.4 });
    A.panelLines(ctx, pline([[-15, 4], [15, 4]]), '#000', 0.6);
    A.panelLines(ctx, pline([[-13, -14], [13, -14]]), '#000', 0.6);
    // violet conduit down the strut
    ctx.fillStyle = '#0b0912';
    ctx.fillRect(-4, -26, 8, 48);
    A.emissive(ctx, pline([[0, -24], [0, 20]]), LS.VIO, 6, { stroke: 2.2 });
    // coil stack: three windings with violet gaps
    for (let i = 0; i < 3; i++) {
      const y = -32 - i * 9, w = 19 - i * 2;
      const coil = rrect(-w, y - 3.5, w * 2, 7, 3);
      cylinder(ctx, coil, -w, w, i === 1 ? '#7a5a3a' : '#6a4f36');
      for (let k = -w + 3; k < w - 2; k += 3) A.panelLines(ctx, pline([[k, y - 3], [k + 1.5, y + 3]]), '#2a1608', 0.55);
      if (i < 2) A.emissive(ctx, pline([[-w + 3, y - 5], [w - 3, y - 5]]), LS.VIO, 5, { stroke: 1.1 });
    }
    // tip cap and lens
    const cap = circle(0, -56, 11);
    A.metal(ctx, cap, { base: '#454c68', spec: 0.6, angle: la, bounds: bb(-11, -67, 22, 22), edge: 1 });
    A.emissive(ctx, circle(0, -56, 6), LS.VIO2, 10);
    ctx.rotate(-rot);
  }

  function defineLodestarArt() {
    const K = LSK;
    A.define(K + 'seg', LS.SW, LS.SH, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const cy = LS.RC;
      const seg = lsSegPath(0);
      shadowUnder(ctx, seg, 0, 0, 5, 0.6);
      const g = ctx.createRadialGradient(0, cy, LS.RI, 0, cy, LS.RO);
      g.addColorStop(0, '#0b0d14'); g.addColorStop(0.06, '#3b4260'); g.addColorStop(0.13, '#1b1f2d');
      g.addColorStop(0.62, '#20243a'); g.addColorStop(0.85, '#2c3147'); g.addColorStop(0.93, '#737ca0'); g.addColorStop(1, '#0d0f16');
      ctx.fillStyle = g;
      ctx.fill(seg);
      // raised armor plate with a bright radial bevel near the outer rim (orientation-independent shading)
      const plate = lsSegPath(9, 1.6);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 5 * devScale(ctx);
      ctx.shadowOffsetY = 1.5 * devScale(ctx);
      const g2 = ctx.createRadialGradient(0, cy, LS.RI + 9, 0, cy, LS.RO - 9);
      g2.addColorStop(0, '#1c2030'); g2.addColorStop(0.4, '#262b3e'); g2.addColorStop(0.74, '#323850');
      g2.addColorStop(0.86, '#69729a'); g2.addColorStop(0.92, '#3a4160'); g2.addColorStop(1, '#1c2030');
      ctx.fillStyle = g2;
      ctx.fill(plate);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(6,7,12,0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke(plate);
      ctx.restore();
      grime(ctx, bb(-w / 2, -h / 2, w, h), 41, 0.4, 14);
      ctx.save();
      ctx.clip(plate);
      // panel lines: two radial seams and a mid-radius arc
      for (const f of [-0.36, 0.36]) {
        const a = -PI / 2 + f * LS.HALF;
        A.panelLines(ctx, pline([[Math.cos(a) * (LS.RI + 8), cy + Math.sin(a) * (LS.RI + 8)], [Math.cos(a) * (LS.RO - 8), cy + Math.sin(a) * (LS.RO - 8)]]), '#000', 0.65);
      }
      const arc = new Path2D();
      arc.arc(0, cy, LS.RI + 30, -PI / 2 - LS.HALF, -PI / 2 + LS.HALF);
      A.panelLines(ctx, arc, '#000', 0.55);
      ctx.restore();
      // vents near the inner rim, rivets along both rims
      for (const f of [-0.6, 0, 0.6]) {
        const a = -PI / 2 + f * LS.HALF * 0.55, r = LS.RI + 19;
        vents(ctx, Math.cos(a) * r, cy + Math.sin(a) * r, 3, 3, 8, 6, a + PI / 2);
      }
      const rv = [];
      for (let i = 0; i < 6; i++) {
        const a = -PI / 2 + (i / 5 - 0.5) * LS.HALF * 1.55;
        rv.push([Math.cos(a) * (LS.RO - 14), cy + Math.sin(a) * (LS.RO - 14)]);
        if (i % 2 === 0) rv.push([Math.cos(a) * (LS.RI + 12), cy + Math.sin(a) * (LS.RI + 12)]);
      }
      rivets(ctx, rv, 1.2);
      // pink seams along both radial ends, a running light on the outer rim
      for (const s of [-1, 1]) {
        const a = -PI / 2 + s * (LS.HALF - LS.GAP / 2 - 0.006);
        A.emissive(ctx, pline([[Math.cos(a) * (LS.RI + 3), cy + Math.sin(a) * (LS.RI + 3)], [Math.cos(a) * (LS.RO - 3), cy + Math.sin(a) * (LS.RO - 3)]]), PAL.seam, 5, { stroke: 1.3 });
      }
      ctx.fillStyle = '#07080c';
      ctx.beginPath(); ctx.ellipse(0, cy - LS.RO + 5, 6, 3, 0, 0, TAU); ctx.fill();
      A.emissive(ctx, circle(0, cy - LS.RO + 5, 1.8), '#ff7aa2', 5);
      // violet containment conduit along the inner rim, with a hazard-striped clamp at the plate's foot
      const inner = new Path2D();
      inner.arc(0, cy, LS.RI + 4, -PI / 2 - LS.HALF * 0.82, -PI / 2 + LS.HALF * 0.82);
      ctx.save();
      ctx.strokeStyle = '#08070d';
      ctx.lineWidth = 5;
      ctx.stroke(inner);
      ctx.restore();
      A.emissive(ctx, inner, LS.VIO, 6, { stroke: 1.6 });
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, cy, LS.RO - 22, -PI / 2 - 0.07, -PI / 2 + 0.07);
      ctx.arc(0, cy, LS.RO - 30, -PI / 2 + 0.07, -PI / 2 - 0.07, true);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = '#c9a23a';
      ctx.fillRect(-20, cy - LS.RO + 18, 40, 16);
      ctx.fillStyle = '#15131a';
      for (let i = -6; i < 6; i++) { ctx.beginPath(); ctx.moveTo(i * 6, cy - LS.RO + 34); ctx.lineTo(i * 6 + 3, cy - LS.RO + 34); ctx.lineTo(i * 6 + 9, cy - LS.RO + 18); ctx.lineTo(i * 6 + 6, cy - LS.RO + 18); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }, { pad: 6, res: 1.5 });
    // world-fixed light overlays (the ring rotates under a fixed upper-left key light)
    A.define(K + 'segHi', LS.SW, LS.SH, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const g = ctx.createRadialGradient(0, LS.RC, LS.RI, 0, LS.RC, LS.RO);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.86, 'rgba(255,255,255,0.75)'); g.addColorStop(0.93, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fill(lsSegPath(1));
    }, { pad: 2, res: 1 });
    A.define(K + 'segLo', LS.SW, LS.SH, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.fillStyle = '#000';
      ctx.fill(lsSegPath(0));
    }, { pad: 2, res: 1 });
    for (const lv of [1, 2]) {
      A.define(K + 'segD' + lv, LS.SW, LS.SH, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        const pts = lv === 1 ? [[-20, -6], [18, 10]] : [[-26, -10], [6, 8], [28, -6], [-8, 18]];
        damageOverlay(ctx, lsSegPath(0), pts, lv, 600 + lv * 7, '#c070ff');
      }, { pad: 2, res: 1.5 });
    }
    // containment emitter (points inward along -y)
    A.define(K + 'emit', 30, 34, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const hous = poly([[-12, 14], [12, 14], [8, -6], [4, -13], [-4, -13], [-8, -6]]);
      shadowUnder(ctx, hous, 2, 3, 4, 0.7);
      const g = ctx.createLinearGradient(-12, 0, 12, 0);
      g.addColorStop(0, '#20232f'); g.addColorStop(0.3, '#59607c'); g.addColorStop(0.55, '#3a3f55'); g.addColorStop(1, '#16181f');
      ctx.fillStyle = g;
      ctx.fill(hous);
      ctx.strokeStyle = 'rgba(5,6,10,0.9)'; ctx.lineWidth = 1; ctx.stroke(hous);
      A.panelLines(ctx, pline([[-9, 4], [9, 4]]), '#000', 0.6);
      ctx.fillStyle = '#0b0912';
      ctx.beginPath(); ctx.ellipse(0, -7, 5, 4, 0, 0, TAU); ctx.fill();
      A.emissive(ctx, circle(0, -7, 3), LS.VIO2, 7);
    }, { pad: 4, res: 2 });
    // pylons pre-lit per diagonal, plus their wrecks
    LS.PY.forEach(([id, a], i) => {
      for (const br of [false, true]) {
        A.define(K + 'py' + i + (br ? 'x' : ''), 150, 150, (ctx, w, h) => {
          ctx.translate(w / 2, h / 2);
          drawPylon(ctx, a + PI / 2, br);
        }, { pad: 6, res: 1.5 });
      }
    });
    // the captive black hole: two counter-rotating accretion swirls, falloff, photon ring
    A.define(K + 'swA', 220, 220, (ctx, w, h) => {
      ctx.drawImage(swirlCanvas(30, 108, { seed: 11, twist: 1.6, scale: 20, ridged: true, cut: 0.28, pow: 1.1, fade: 1.3,
        ramp: [[0, '#ffffff'], [0.12, '#fff1d0'], [0.35, '#ffc070'], [0.7, '#ff7a2e'], [1, '#6a1a08']] }), 0, 0, w, h);
    }, { pad: 0, res: 1 });
    A.define(K + 'swB', 300, 300, (ctx, w, h) => {
      ctx.drawImage(swirlCanvas(44, 148, { seed: 23, twist: -1.2, scale: 28, cut: 0.38, pow: 1.4, fade: 1.8, alpha: 0.8,
        ramp: [[0, '#ffe3b0'], [0.3, '#ff9a48'], [0.7, '#c24a1c'], [1, '#3a0e06']] }), 0, 0, w, h);
    }, { pad: 0, res: 1 });
    A.define(K + 'fall', 420, 420, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.18, 'rgba(1,0,3,0.85)'); g.addColorStop(0.45, 'rgba(4,2,10,0.45)');
      g.addColorStop(0.75, 'rgba(6,3,14,0.14)'); g.addColorStop(1, 'rgba(6,3,14,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { pad: 0, res: 0.5 });
    A.define(K + 'ringShadow', 470, 470, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.lineWidth = 74;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.arc(0, 0, 175, 0, TAU); ctx.stroke();
    }, { pad: 30, res: 0.5 });
    ART.boss_lodestar = ['seg', 'segHi', 'segLo', 'segD1', 'segD2', 'emit', 'py0', 'py1', 'py2', 'py3', 'py0x', 'py1x', 'py2x', 'py3x',
      'swA', 'swB', 'fall', 'ringShadow'].map((k) => K + k);
  }

  function lsPull(b) {
    const d = b.data;
    let p = [700, 1000, 1400][Math.max(0, Math.min(2, b.phase))];
    if (d.pulse && d.pulse.t >= 1.0 && d.pulse.t < 2.2) p = 2000;
    let broken = 0;
    for (const [id] of LS.PY) if (!alive(b, id)) broken++;
    return p * (1 - 0.1 * broken);
  }
  /** Gravity on players and every bullet; the boss's own volleys feel a shorter, softer field so they escape the
      well (GDD coupling would swallow its own orbit_release and gravity_sling volleys). */
  function lsGravity(b, dt, pull) {
    const d = b.data, hx = b.x, hy = b.y, hr = d.hr;
    const g = b.gravity;
    g.x = hx; g.y = hy; g.pull = pull; g.range = LS.RANGE; g.r = hr;
    if (pull <= 0) return;
    const wd = SL.world;
    wd.applyGravity(hx, hy, pull, LS.RANGE, { bullets: false, pickups: false, pods: false });
    wd.applyGravity(hx, hy, pull * 0.35, LS.RANGE, { players: false, bullets: false, pbullets: true, pickups: false, pods: false, consume: hr });
    const L = wd.ebullets, Rf = LS.RANGE, R2f = Rf * Rf, Ro = 330, R2o = Ro * Ro, hr2 = hr * hr;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.dead || e.delay > 0) continue;
      const dx = hx - e.x, dy = hy - e.y, d2 = dx * dx + dy * dy;
      if (d2 >= R2f) continue;
      if (d2 < hr2) {
        e.dead = true;
        if (Math.random() < 0.4) SL.fx.emit({ x: e.x, y: e.y, vx: dy * 2, vy: -dx * 2, life: 0.35, size: 10, size2: 2, color: '#ffd9a0' });
        continue;
      }
      const dd = Math.sqrt(d2);
      const own = e.owner === b || (e.owner && e.owner.data && e.owner.data.boss === b);
      let k;
      if (own) {
        if (e.data && e.data.rel === false) continue; // still orbiting (scripted)
        k = 0;
        if (e.typeId === 'void_orb') { const f = 1 - dd / Rf; k -= 1.5 * f * f; } // cancels the type's own extra pull
        if (d2 < R2o) { const f = 1 - dd / Ro; k += (e.typeId === 'void_orb' ? 0.55 : 0.45) * f * f; }
        if (e.age > 8) { e.dead = true; continue; } // nothing of its own may orbit forever
      } else { const f = 1 - dd / Rf; k = 0.6 * f * f; }
      if (!k) continue;
      const a = pull * k * dt;
      e.vx += (dx / dd) * a;
      e.vy += (dy / dd) * a;
      let sp = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
      if (own && e.data) {
        if (e.data.v0 == null) e.data.v0 = e.speed;
        const lo = e.data.v0 * 0.8, hi = e.data.v0 * 2;
        const s2 = clamp(sp, lo, hi);
        if (s2 !== sp && sp > 0) { e.vx *= s2 / sp; e.vy *= s2 / sp; sp = s2; }
      }
      e.speed = sp;
      e.angle = Math.atan2(e.vy, e.vx);
      if (e.type && e.type.orient) e.rot = e.angle;
    }
    // horizon contact: 18 every 0.5 s
    const ps = wd.players;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      d.hd[i] = Math.max(0, (d.hd[i] || 0) - dt);
      if (!p.alive || p.down || p.display) continue;
      const qx = p.x - hx, qy = p.y - hy;
      if (qx * qx + qy * qy < (hr + 7) * (hr + 7) && d.hd[i] <= 0) {
        d.hd[i] = 0.5;
        SL.damagePlayer(p, 18, { source: 'hazard' });
      }
    }
  }
  function lsTip(id) {
    for (const [pid, a] of LS.PY) if (pid === id) return [Math.cos(a), Math.sin(a), a];
    return [0, 1, PI / 2];
  }
  /** Pylon coil flare (telegraph) then a ring of 8 orb from its tip. */
  function lsPylonRing(b, id) {
    const e = part(b, id);
    if (!e || e.dead || e.data.broken) return;
    const [cx, cy] = lsTip(id), r = LS.TIP - LS.PR;
    b.data.py[id].flare = 0.4;
    chargeMark(e, { ox: cx * r, oy: cy * r, time: 0.4, color: LS.VIO, r: 22 });
    later(b, 0.4, () => {
      if (e.dead || e.data.broken) return;
      pRing(e, { ox: cx * r, oy: cy * r, count: 8, speed: 170, type: 'orb', offset: grnd(0, TAU), owner: b });
      b.data.py[id].fired = 0.2;
    });
  }
  /** Rain curtain from the ring's lower edge with two drifting safe lanes (angles on the lower arc). */
  function lsRain(b, R, dt) {
    R.t += dt;
    for (let i = 0; i < R.lanes.length; i++) R.lanes[i] = approach(R.lanes[i], R.goal[i], 1.2, dt);
    if ((R.shift -= dt) <= 0) {
      R.shift = 1.2;
      for (let i = 0; i < R.goal.length; i++) R.goal[i] = clamp(R.lanes[i] + grnd(-0.35, 0.35), 0.22 * PI, 0.78 * PI);
    }
    R.acc += 12 * Math.max(0.6, fr()) * dt;
    let guard = 0;
    while (R.acc >= 1 && guard++ < 30) {
      const th = grnd(0.08 * PI, 0.92 * PI);
      let ok = true;
      for (let i = 0; i < R.lanes.length; i++) if (Math.abs(th - R.lanes[i]) < 0.13) { ok = false; break; }
      if (!ok) continue;
      R.acc -= 1;
      const x = b.x + Math.cos(th) * (LS.RO - 6), y = b.y + Math.sin(th) * (LS.RO - 6);
      fire(x, y, PI / 2 + (th - PI / 2) * 0.3, grnd(190, 250), 'shard', { owner: b });
    }
  }
  function lsSegAngle(d, k) { return d.rot + (k + 0.5) * (TAU / LS.N); }
  /** Detach ring segment k as a falling debris prop that blocks bullets (phase 3 below 15%). */
  const LS_SEGPROP = {
    name: 'Ring segment', r: 40, hp: 260, shootable: true, blocksBullets: true, contactDamage: 20, palette: 'violet',
    update(pr, dt) {
      pr.rot += pr.data.spin * dt;
      pr.vy = Math.min(pr.vy + 70 * dt, 190);
      pr.vx *= 1 - Math.min(1, dt * 0.3);
      if (pr.flash > 0) pr.flash -= dt;
    },
    draw(pr, ctx) {
      A.drawSprite(ctx, LSK + 'seg', pr.x, pr.y, pr.rot);
      A.drawSprite(ctx, LSK + 'segD2', pr.x, pr.y, pr.rot, 1, 0.9);
      if (pr.flash > 0) A.drawFlash(ctx, LSK + 'seg', pr.x, pr.y, pr.rot, 1, 0.4);
      A.drawGlow(ctx, pr.x + crnd(-20, 20), pr.y + crnd(-10, 10), 16, '#ff7a2f', 0.35);
    },
    onDeath(pr) {
      SL.fx.explode(pr.x, pr.y, { size: 'm', palette: 'violet' });
      debrisBurst(pr.x, pr.y, DEBRIS_VIOLET, 6, 300, 20, 14);
    },
  };
  function lsDetach(b, k) {
    const d = b.data, s = d.segs[k];
    if (!s.on) return;
    s.on = false;
    const a = lsSegAngle(d, k);
    const x = b.x + Math.cos(a) * LS.RC, y = b.y + Math.sin(a) * LS.RC;
    const pr = SL.spawnProp(LS_SEGPROP, { x, y, vx: Math.cos(a) * 60, vy: Math.max(30, Math.sin(a) * 60 + 40) });
    if (pr && !pr.dead) { pr.rot = a + PI / 2; pr.data.spin = grnd(-0.9, 0.9); }
    SL.fx.sparks(x, y, { count: 18, color: '#ffd38a', speed: 420, life: 0.4 });
    SL.fx.explode(x, y, { size: 's', palette: 'violet', sound: true, shake: false });
  }

  defineBoss('boss_lodestar', {
    name: 'LODESTAR', title: 'Gravity Siege Engine', hp: 16000, r: 215, score: 70000, parTime: 85, size: [440, 440],
    credits: [40, 5], palette: 'violet', debris: DEBRIS_VIOLET,
    init(b) {
      const d = b.data;
      b.x = W / 2; b.y = -280;
      b.circles = [];
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU + 0.26; b.circles.push({ x: Math.cos(a) * 176, y: Math.sin(a) * 176, r: 40 }); }
      d.rot = 0; d.spin = 0; d.hr = LS.HOR; d.lensK = 0; d.flare = 0; d.hd = [0, 0]; d.pulse = null; d.swA = 0; d.swB = 0;
      d.segs = [];
      for (let k = 0; k < LS.N; k++) d.segs.push({ on: true, dmg: 0.2 + ((k * 7) % 12) / 12 * 0.65, fall: null });
      d.em = [];
      for (let k = 0; k < LS.EM; k++) d.em.push({ on: true, dieT: 0 });
      d.py = {};
      b.gravity = { x: b.x, y: b.y, pull: 0, range: LS.RANGE, r: LS.HOR };
      LS.PY.forEach(([id, a]) => {
        const c = Math.cos(a), s = Math.sin(a);
        d.py[id] = { flare: 0, fired: 0 };
        addPart(b, id, {
          ox: c * LS.PR, oy: s * LS.PR, r: 36, hp: 1500, bonus: 400, palette: 'violet',
          circles: [{ x: -c * 26, y: -s * 26, r: 28 }, { x: c * 22, y: s * 22, r: 30 }],
        });
      });
      sfx('boss_roar', { x: b.x });
    },
    intro(b, dt) {
      const d = b.data, t = d.at;
      b.x = W / 2;
      b.y = lerp(-280, 300, SL.ease.outCubic(clamp((t - 0.3) / 3, 0, 1)));
      d.spin = t < 2.6 ? lerp(0, 1.6, clamp(t / 2.2, 0, 1)) : lerp(1.6, 0.3, clamp((t - 2.6) / 1.4, 0, 1));
      d.rot += d.spin * dt;
      if (t >= 2.4 && !d.flared) { d.flared = true; d.flare = 1; sfx('bh_collapse', { x: b.x }); SL.fx.flash('#ffe0b0', 0.25, 0.4); }
      if (d.flare > 0) d.flare = Math.max(0, d.flare - dt * 0.8);
      d.lensK = clamp((t - 2) / 2, 0, 1);
      lsAnimate(b, dt);
      if (d.lensK > 0) {
        SL.render.addLens(b.x, b.y, d.hr * d.lensK, 1.0);
        lsGravity(b, dt, 700 * d.lensK);
      }
      return t >= 4;
    },
    update(b, dt) {
      const d = b.data, t = b.fightT;
      d.dt = dt;
      const tx = W / 2 + 46 * Math.sin(t * 0.42), ty = 300 + 12 * Math.sin(t * 0.9);
      b.x = approach(b.x, tx, 2, dt);
      b.y = approach(b.y, ty, 2, dt);
      d.spin = approach(d.spin, b.phase === 2 ? 0.55 : 0.3, 1, dt);
      d.rot += d.spin * dt;
      d.hr = approach(d.hr, d.hrT || LS.HOR, 1.4, dt);
      if (d.flare > 0) d.flare = Math.max(0, d.flare - dt * 0.8);
      if (d.pulse) {
        d.pulse.t += dt;
        if (d.pulse.t >= 1.0 && !d.pulse.hit) { d.pulse.hit = true; SL.fx.shake(9, 1.2); SL.fx.chromatic(0.35, 0.6); d.flare = 0.8; }
        if (d.pulse.t >= 2.2) d.pulse = null;
      }
      d.lensK = 1;
      SL.render.addLens(b.x, b.y, d.hr, 1.0);
      lsGravity(b, dt, lsPull(b));
      lsAnimate(b, dt);
      damageFx(b, dt, lsDamagePt);
    },
    phases: [
      {
        at: 1.0, name: 'Orbit',
        enter(b, S) { S.cyc = 1.2; S.orb = 3.4; },
        update(b, dt, S) {
          if ((S.cyc -= dt) <= 0) {
            S.cyc = 4;
            LS.PY.forEach(([id], i) => later(b, 0.6 * i, () => lsPylonRing(b, id)));
          }
          if ((S.orb -= dt) <= 0) {
            S.orb = 6;
            pOrbit(b, { count: 16, radius: 110, orbit: 1.2, spin: 2, speed: 200, type: 'void_orb', owner: b, dir: SL.rng.chance(0.5) ? 1 : -1 });
            b.data.flare = Math.max(b.data.flare, 0.5);
          }
        },
      },
      {
        at: 0.70, name: 'Undertow',
        enter(b, S) { S.beam = 1.2; S.rainT = 4.6; S.sling = 2.6; S.dir = 1; },
        update(b, dt, S) {
          if ((S.beam -= dt) <= 0) {
            S.beam = 7;
            const sweeps = { pylon_ne: [PI / 2, PI * 5 / 6], pylon_sw: [PI / 6, PI / 2] };
            for (const id of ['pylon_ne', 'pylon_sw']) {
              const e = part(b, id);
              if (!e || e.dead || e.data.broken) continue;
              const [c, s] = lsTip(id), r = LS.TIP - LS.PR + 4;
              b.data.py[id].flare = 1.0;
              pBeamSweep(b, e, { from: sweeps[id][0], to: sweeps[id][1], width: 28, telegraph: 1.0, duration: 2.0, ox: c * r, oy: s * r, arrowR: 120, color: LS.VIO });
            }
          }
          if ((S.rainT -= dt) <= 0) {
            S.rainT = 7;
            const t = target(b, b), a0 = clamp(Math.atan2(t.y - b.y, t.x - b.x), 0.25 * PI, 0.75 * PI);
            S.rain = { t: 0, acc: 0, shift: 1.2, lanes: [a0, clamp(a0 + (a0 < PI / 2 ? 0.55 : -0.55), 0.22 * PI, 0.78 * PI)] };
            S.rain.goal = S.rain.lanes.slice();
            chargeMark(b, { oy: LS.RO - 10, time: 0.5, color: EB.orange, r: 40 });
          }
          if (S.rain) { lsRain(b, S.rain, dt); if (S.rain.t >= 2.5) S.rain = null; }
          if ((S.sling -= dt) <= 0) {
            S.sling = 5;
            S.dir = -S.dir;
            pSling(b, { count: 8, speed: 220, dir: S.dir, radius: 120, type: 'void_orb', owner: b, center: b.gravity });
            b.data.flare = Math.max(b.data.flare, 0.6);
          }
        },
      },
      {
        at: 0.40, name: 'Collapse',
        enter(b, S) {
          const d = b.data;
          d.hrT = LS.HOR3;
          d.flare = 1;
          S.pulseT = 2.4; S.ds = {}; S.segT = 0;
          d.em.forEach((m, i) => { m.dieT = 0.2 + i * 0.22 + grnd(0, 0.1); });
          SL.fx.shockwave(b.x, b.y, { radius: 340, duration: 0.8, strength: 1.4, color: '#c58bff' });
          SL.fx.flash('#d9b8ff', 0.35, 0.5);
        },
        update(b, dt, S) {
          const d = b.data;
          if ((S.pulseT -= dt) <= 0) {
            S.pulseT = 6;
            d.pulse = { t: 0, hit: false };
            sfx('bh_collapse', { x: b.x });
            sfx('boss_roar', { x: b.x });
          }
          if (!d.pulse || d.pulse.t < 0.85 || d.pulse.t > 2.2) pDoubleSpiral(S.ds, b, dt, { arms: 2, rate: 8, spin: 1.2, speed: 160, radius: 150, type: 'orb', owner: b });
          if (b.hp / b.maxHp < 0.15) {
            if ((S.segT -= dt) <= 0) {
              S.segT = 1.3;
              const live = [];
              d.segs.forEach((s, k) => { if (s.on) live.push(k); });
              if (live.length > 5) lsDetach(b, live[(SL.rng.next() * live.length) | 0]);
            }
          }
        },
      },
    ],
    draw(b, ctx) { lsDraw(b, ctx); },
    death: {
      start(b) {
        const d = b.data;
        d.dieY = b.y;
        const order = [];
        d.segs.forEach((s, k) => { if (s.on) order.push(k); });
        for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
        order.forEach((k, i) => { d.segs[k].fall = { t0: 0.1 + (i / Math.max(1, order.length)) * 1.9, t: 0, a: lsSegAngle(d, k), done: false }; });
        d.hrT = d.hr;
        d.pulse = null;
      },
      steps: [
        [0.0, (b) => { SL.fx.shake(12, 2.6); sfx('bh_collapse', { x: b.x }); }],
        ...LS.PY.map(([id], i) => [0.35 + i * 0.45, (b) => {
          const e = part(b, id), [c, s] = lsTip(id);
          const x = b.x + c * LS.PR, y = b.y + s * LS.PR;
          chainBlast(b, x, y, 'l', 'violet', true);
          if (e) e.data.torn = true;
          debrisBurst(x, y, DEBRIS_VIOLET, 6, 300, 12, 12);
        }]),
        [2.0, (b) => { b.data.swell = 0; SL.fx.chromatic(0.5, 0.8); }],
        [2.65, (b) => {
          SL.fx.flash('#ffffff', 0.9, 0.6);
          SL.fx.shockwave(b.x, b.y, { radius: 700, duration: 1.2, strength: 2.4, color: '#e9d8ff' });
          b.data.popped = true;
          finish(b, { palette: 'violet', ripple: 0, credits: [40, 5] });
        }],
      ],
      tick(b, dt, t) {
        const d = b.data;
        d.rot += (0.6 + t * 1.2) * dt;
        if (d.swell != null) d.swell += dt;
        const hr = d.hr * (d.swell != null ? 1 + 1.6 * SL.ease.inCubic(clamp(d.swell / 0.65, 0, 1)) : 1);
        if (!d.popped) {
          SL.render.addLens(b.x, b.y, hr, 1.0 + (d.swell || 0));
          b.gravity.r = hr;
          for (const s of d.segs) {
            const f = s.fall;
            if (!f || f.done || t < f.t0) continue;
            f.t += dt;
            if (f.t >= 0.75) {
              f.done = true;
              const a = f.a + 3.2;
              SL.fx.sparks(b.x + Math.cos(a) * hr, b.y + Math.sin(a) * hr, { count: 10, color: '#ffd9a0', speed: 260, life: 0.3 });
              SL.fx.emit({ x: b.x, y: b.y, life: 0.25, size: hr * 2.4, size2: hr * 3.2, color: '#ffe9c8', alpha: 0.5, alpha2: 0 });
            }
          }
        }
        if (Math.random() < dt * 5) {
          const a = crnd(0, TAU), r = crnd(120, 220);
          SL.fx.explode(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, { size: 's', palette: 'violet', sound: false, shake: false });
        }
      },
    },
  });
  function lsDamagePt(b) {
    const a = crnd(0, TAU), r = crnd(150, 205);
    return [Math.cos(a) * r, Math.sin(a) * r];
  }
  function lsAnimate(b, dt) {
    const d = b.data;
    d.swA += dt * (b.phase === 2 ? 1.5 : 0.9);
    d.swB -= dt * (b.phase === 2 ? 0.75 : 0.45);
    for (const id in d.py) {
      const P = d.py[id];
      if (P.flare > 0) P.flare = Math.max(0, P.flare - dt);
      if (P.fired > 0) P.fired = Math.max(0, P.fired - dt);
    }
    if (b.phase === 2 && !b.dying) {
      for (const m of d.em) {
        if (!m.on) continue;
        m.dieT -= dt;
        if (m.dieT <= 0) {
          m.on = false;
          const k = d.em.indexOf(m), a = d.rot + (k / LS.EM) * TAU;
          SL.fx.sparks(b.x + Math.cos(a) * 136, b.y + Math.sin(a) * 136, { count: 14, color: LS.VIO2, speed: 300, life: 0.35 });
        }
      }
    }
  }
  function lsDraw(b, ctx) {
    const d = b.data, t = SL.time.t, K = LSK;
    const dy = b.dying, jx = dy ? crnd(-3, 3) : 0, jy = dy ? crnd(-3, 3) : 0;
    const x = b.x + jx, y = b.y + jy;
    if (y < -300) return;
    const hpF = b.hp / b.maxHp;
    const swell = d.swell != null ? 1 + 1.6 * SL.ease.inCubic(clamp(d.swell / 0.65, 0, 1)) : 1;
    const hr = d.hr * swell * (b.introDone ? 1 : Math.max(0.35, d.lensK));
    const lens = SL.render.distortion;
    // shadow of the ring on the dust below, dark falloff around the hole
    A.drawSprite(ctx, K + 'ringShadow', x + 14, y + 22, 0, 1, 0.55);
    A.drawSprite(ctx, K + 'fall', x, y, 0, (hr / LS.HOR) * (lens ? 0.8 : 1), lens ? 0.7 : 0.95);
    // accretion swirls (counter-rotating), hot inner glow, horizon, photon ring
    const heat = 1 + (b.phase === 2 ? 0.25 : 0) + d.flare * 0.6;
    const sk = hr / LS.HOR;
    ctx.globalCompositeOperation = 'lighter';
    A.drawSprite(ctx, K + 'swB', x, y, d.swB, 0.92 * Math.min(1.35, sk), 0.8 * Math.min(1.3, heat));
    A.drawSprite(ctx, K + 'swA', x, y, d.swA, 0.9 * Math.min(1.4, sk), Math.min(1, heat));
    A.drawSprite(ctx, K + 'swA', x, y, -d.swA * 0.6 + 1.7, 0.62 * Math.min(1.4, sk), 0.6 * Math.min(1.2, heat));
    ctx.globalCompositeOperation = 'source-over';
    A.drawGlow(ctx, x, y, hr * 3.2, '#ff9a48', 0.35 * heat);
    if (d.flare > 0) A.drawGlow(ctx, x, y, hr * (4 + 3 * d.flare), '#ffe6c0', 0.6 * d.flare);
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.arc(x, y, hr, 0, TAU); ctx.fill();
    const pr = A.ring('#ffd9a8', 40, 3);
    ctx.globalCompositeOperation = 'lighter';
    const prr = hr * 1.14;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(pr, x - prr, y - prr, prr * 2, prr * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // containment field: violet filaments from the emitters to the horizon (fail in phase 3)
    if (!dy) {
      for (let k = 0; k < LS.EM; k++) {
        const m = d.em[k], a = d.rot + (k / LS.EM) * TAU;
        if (!m.on && !(m.dieT > -0.4 && Math.random() < 0.5)) continue;
        const fl = 0.35 + 0.25 * Math.sin(t * 13 + k * 2.1) + (Math.random() < 0.08 ? 0.4 : 0);
        lineGlow(ctx, x + Math.cos(a) * 130, y + Math.sin(a) * 130, a + PI, 130 - hr * 1.05, 6, LS.VIO, fl * (m.on ? 0.55 : 0.3));
      }
    }
    // ring segments under a world-fixed key light
    for (let k = 0; k < LS.N; k++) {
      const s = d.segs[k];
      let a = lsSegAngle(d, k), r = LS.RC, sc = 1, al = 1;
      if (!s.on) continue; // detached earlier (now a falling prop)
      const f = s.fall;
      if (f) {
        if (f.done) continue;
        if (b.deathT >= f.t0) {
          const u = clamp(f.t / 0.75, 0, 1), e = SL.ease.inCubic(u);
          a = f.a + 3.2 * e;
          r = lerp(LS.RC, hr * 0.6, e);
          sc = lerp(1, 0.18, e);
          al = 1 - u * u;
        } else f.a = a;
      }
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, rot = a + PI / 2;
      A.drawSprite(ctx, K + 'seg', px, py, rot, sc, al);
      if (hpF < s.dmg + 0.1) A.drawSprite(ctx, K + 'segD1', px, py, rot, sc, al * sm01((s.dmg + 0.1 - hpF) / 0.15));
      if (hpF < s.dmg - 0.15) A.drawSprite(ctx, K + 'segD2', px, py, rot, sc, al * sm01((s.dmg - 0.15 - hpF) / 0.15));
      const lf = Math.cos(a - LS.LIGHT);
      if (lf > 0) {
        ctx.globalCompositeOperation = 'lighter';
        A.drawSprite(ctx, K + 'segHi', px, py, rot, sc, al * 0.22 * lf * lf);
        ctx.globalCompositeOperation = 'source-over';
      } else A.drawSprite(ctx, K + 'segLo', px, py, rot, sc, al * 0.42 * -lf);
      if (b.flash > 0 && s.on) A.drawFlash(ctx, K + 'seg', px, py, rot, 1, Math.min(1, b.flash / 0.06) * 0.22);
      // seam glow at the leading joint and the blinking rim light
      if (!f || b.deathT < f.t0) {
        const ja = a + LS.HALF;
        A.drawGlow(ctx, x + Math.cos(ja) * 176, y + Math.sin(ja) * 176, 16, PAL.glow, 0.28 + 0.14 * Math.sin(t * 3 + k));
        const blink = ((t * 1.6 + k / LS.N) % 1) < 0.18 ? 1 : 0.25;
        A.drawGlow(ctx, x + Math.cos(a) * (LS.RO - 5), y + Math.sin(a) * (LS.RO - 5), 10, '#ff4f7f', blink * (hpF < 0.3 && Math.random() < 0.3 ? 0.2 : 1));
      }
    }
    // containment emitters on the inner rim
    for (let k = 0; k < LS.EM; k++) {
      const m = d.em[k], a = d.rot + (k / LS.EM) * TAU;
      const ex = x + Math.cos(a) * 140, ey = y + Math.sin(a) * 140;
      if (dy && b.deathT > 0.3 + k * 0.2) continue;
      A.drawSprite(ctx, K + 'emit', ex, ey, a - PI / 2);
      const on = m.on || (m.dieT > -0.5 && Math.random() < 0.4);
      if (on) A.drawGlow(ctx, ex - Math.cos(a) * 7, ey - Math.sin(a) * 7, 18, LS.VIO, 0.55 + 0.3 * Math.sin(t * 9 + k));
    }
    // anchor pylons
    LS.PY.forEach(([id, ang], i) => {
      const e = d.parts[id];
      const c = Math.cos(ang), s = Math.sin(ang), px = x + c * LS.PR, py = y + s * LS.PR;
      const P = d.py[id];
      if (!e || e.data.broken || e.data.torn) {
        A.drawSprite(ctx, K + 'py' + i + 'x', px, py);
        A.drawGlow(ctx, px - c * 14, py - s * 14, 20, '#c070ff', 0.3 + 0.2 * Math.sin(t * 11 + i));
        if (Math.random() < 0.06) SL.fx.sparks(px - c * 10, py - s * 10, { count: 3, color: LS.VIO2, speed: 200, life: 0.25 });
        return;
      }
      A.drawSprite(ctx, K + 'py' + i, px, py);
      if (e.flash > 0) A.drawFlash(ctx, K + 'py' + i, px, py, 0, 1, 0.22);
      const tx = x + c * (LS.TIP - 6), ty = y + s * (LS.TIP - 6);
      const pulse = 0.55 + 0.25 * Math.sin(t * 5 + i * 1.7);
      A.drawGlow(ctx, tx, ty, 18 + 22 * (P.flare > 0 ? 1 : 0) + 18 * P.fired / 0.2, LS.VIO, pulse + (P.flare > 0 ? 0.4 : 0));
      A.drawGlow(ctx, tx, ty, 8, '#ffffff', 0.7 + (P.flare > 0 ? 0.3 : 0));
      // coil arcs crackle while charging
      if (P.flare > 0 && Math.random() < 0.6) {
        const la = ang + crnd(-1.2, 1.2);
        lineGlow(ctx, tx, ty, la, crnd(14, 30), 3, LS.VIO2, 0.8);
      }
    });
    // gravity pulse: a violet ring contracting from r 600 into the hole
    if (d.pulse && d.pulse.t < 1.0) {
      const u = d.pulse.t / 1.0, rr = lerp(600, hr, SL.ease.inCubic(u));
      const rs = A.ring(LS.VIO, 96, 7);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.6 * u;
      ctx.drawImage(rs, x - rr, y - rr, rr * 2, rr * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else if (d.pulse && d.pulse.t < 2.2) {
      A.drawGlow(ctx, x, y, hr * 5, LS.VIO, 0.45 + 0.2 * Math.sin(t * 30));
    }
    drawMarks(b, ctx);
    drawBeamTelegraphs(b, ctx, LS.VIO);
  }

  // ================================================================== TEMPEST (GDD 8.3)
  const TP = {
    OUT: [[0, -118], [30, -128], [96, -126], [124, -104], [164, -88], [208, -94], [250, -86], [290, -68], [316, -40], [324, -12],
      [316, 14], [296, 32], [252, 44], [210, 50], [170, 56], [134, 66], [106, 80], [92, 96], [70, 108], [36, 116], [0, 118]],
    DECK: [[0, -112], [62, -116], [102, -98], [116, -56], [112, -10], [100, 22], [0, 22]],
    SX: 220, SY: -20, EY: 34, TERM: -62,
    ENG: [[-112, -100, 32], [-46, -122, 40], [46, -122, 40], [112, -100, 32]],
    FINS: [[134, -50], [152, -53], [170, -56], [268, -38], [284, -33], [300, -27]],
    LIGHTS: [[146, 56], [190, 50], [232, 44], [272, 36], [302, 22]],
    ANT: [[-56, -136], [56, -136]],
    RINGS: [[28, 27], [13, 25.5], [-2, 24], [-17, 22.5], [-32, 21], [-46, 19.5]],
    FLASH: [0.12, 0.62, 1.12],
    STORM: '#141a33', RIM: '#4a5f8a', BOLT: '#9fb8ff', VIO: '#b26bff', VIO2: '#e6dcff', FENCE: '#b98cff',
    CIRCLES: [
      { x: 0, y: -72, r: 62 }, { x: -96, y: -36, r: 56 }, { x: 96, y: -36, r: 56 }, { x: -158, y: -24, r: 46 }, { x: 158, y: -24, r: 46 },
      { x: -212, y: -26, r: 42 }, { x: 212, y: -26, r: 42 }, { x: -262, y: -20, r: 42 }, { x: 262, y: -20, r: 42 },
      { x: -304, y: -14, r: 24 }, { x: 304, y: -14, r: 24 }, { x: -110, y: 30, r: 40 }, { x: 110, y: 30, r: 40 },
    ],
    DMG: [[-286, -24], [-250, -58], [-196, 14], [-150, -64], [-128, 30], [-92, -92], [-64, -36], [-28, -100], [-170, 40], [-300, 4],
      [276, -36], [238, -66], [186, 22], [144, -70], [122, 34], [86, -98], [56, -44], [24, -104], [168, 44], [298, 6]],
  };
  const TPK = 'boss:tmp:';
  const SIDES = [-1, 1];
  const NO_DASH = [];
  const BOLT_PASSES = [[15, '#6f8cff', 0.22], [6, '#c9d8ff', 0.6], [2.2, '#ffffff', 1]];

  function ell(x, y, rx, ry) { const p = new Path2D(); p.ellipse(x, y, rx, ry, 0, 0, TAU); return p; }
  function ellArc(x, y, rx, ry, a0, a1) { const p = new Path2D(); p.ellipse(x, y, rx, ry, 0, a0, a1); return p; }
  function rr(rng, a, b) { return a + (b - a) * rng.next(); }
  /** Jagged lightning channel from (x0, y0) to (x1, y1) as flat point arrays, with forked branches. */
  function makeBolt(x0, y0, x1, y1, n, amp, branches) {
    const main = [x0, y0];
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    for (let i = 1; i < n; i++) {
      const u = i / n, j = (Math.random() * 2 - 1) * amp * Math.pow(Math.sin(u * PI), 0.7);
      main.push(x0 + dx * u + nx * j, y0 + dy * u + ny * j);
    }
    main.push(x1, y1);
    const br = [];
    for (let k = 0; k < (branches || 0); k++) {
      const i = 2 + ((Math.random() * Math.max(1, n - 4)) | 0);
      let bx = main[i * 2], by = main[i * 2 + 1];
      const a = Math.atan2(dy, dx) + (Math.random() < 0.5 ? -1 : 1) * crnd(0.45, 1.0);
      const seg = [bx, by], m = 4 + ((Math.random() * 3) | 0), step = (L / n) * 0.8;
      for (let q = 0; q < m; q++) {
        bx += Math.cos(a) * step + crnd(-0.5, 0.5) * step;
        by += Math.sin(a) * step + crnd(-0.5, 0.5) * step;
        seg.push(bx, by);
      }
      br.push(seg);
    }
    return { main, br, w: 1, t: 0, life: 0.3, x: x1, y: y1 };
  }
  function strokePts(ctx, p) {
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  }
  function drawBolt(ctx, bl, a) {
    if (a <= 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let k = 0; k < BOLT_PASSES.length; k++) {
      const ps = BOLT_PASSES[k];
      ctx.strokeStyle = ps[1];
      ctx.globalAlpha = ps[2] * a;
      ctx.lineWidth = ps[0] * bl.w;
      ctx.beginPath();
      strokePts(ctx, bl.main);
      ctx.stroke();
      if (bl.br.length) {
        ctx.lineWidth = ps[0] * bl.w * 0.5;
        ctx.beginPath();
        for (let i = 0; i < bl.br.length; i++) strokePts(ctx, bl.br[i]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  /** Small crackling arc, re-jittered every frame (cosmetic). */
  function zap(ctx, x0, y0, x1, y1, n, amp, color, a, w) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    w = w || 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i++) {
      const u = i / n, j = (Math.random() * 2 - 1) * amp;
      ctx.lineTo(x0 + dx * u + nx * j, y0 + dy * u + ny * j);
    }
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color; ctx.globalAlpha = 0.4 * a; ctx.lineWidth = 5 * w; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.9 * a; ctx.lineWidth = 1.3 * w; ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- TEMPEST art
  function coilArc(ctx, y, rx, ry, front, lw) {
    const p = ellArc(0, y, rx, ry, front ? 0 : PI, front ? PI : TAU);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0c0a14'; ctx.lineWidth = lw + 2.4; ctx.stroke(p);
    if (front) {
      const g = ctx.createLinearGradient(-rx, 0, rx, 0);
      g.addColorStop(0, '#8a7fb4'); g.addColorStop(0.17, '#f4efff'); g.addColorStop(0.32, '#c3b8e6');
      g.addColorStop(0.68, '#6c6194'); g.addColorStop(1, '#2a233e');
      ctx.strokeStyle = g; ctx.lineWidth = lw; ctx.stroke(p);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, lw * 0.24);
      ctx.stroke(ellArc(-0.8, y - lw * 0.3, rx - 1.2, ry - 0.4, 0.5 * PI, 0.93 * PI));
    } else {
      ctx.strokeStyle = '#5a5180'; ctx.lineWidth = lw * 0.92; ctx.stroke(p);
    }
    ctx.restore();
  }
  function drawSpire(ctx, broken) {
    // socket housing: short cylinder with an elliptical cap, violet band
    shadowUnder(ctx, ell(4, 56, 31, 12), 3, 5, 8, 0.75);
    const body = new Path2D();
    body.rect(-27, 40, 54, 16);
    body.moveTo(27, 56);
    body.ellipse(0, 56, 27, 9, 0, 0, PI);
    cylinder(ctx, body, -27, 27, '#30364b');
    A.panelLines(ctx, ellArc(0, 48, 27, 8.5, 0.1, PI - 0.1), '#000', 0.7);
    A.emissive(ctx, ellArc(0, 52, 26.6, 9, 0.25, PI - 0.25), TP.VIO, 6, { stroke: 1.3 });
    A.metal(ctx, ell(0, 40, 27, 8.5), { base: '#4b5272', spec: 0.6, bounds: bb(-27, 31, 54, 18), edge: 1.2, rimWidth: 0.9 });
    ctx.fillStyle = '#0a0812';
    ctx.fill(ell(0, 40, 12, 4));
    if (broken) {
      const rng = SL.makeRng(83);
      const stump = poly([[-6.5, 41], [6.5, 41], [6.5, 9], [3.5, 2], [1, 9], [-2.5, -1], [-6.5, 6]]);
      cylinder(ctx, stump, -6.5, 6.5, '#2c2540');
      coilArc(ctx, 28, 27, 9.2, false, 4.6);
      coilArc(ctx, 28, 27, 9.2, true, 5);
      ctx.save();
      ctx.translate(4, 14);
      ctx.rotate(0.24);
      coilArc(ctx, 0, 25, 8.6, false, 4.6);
      coilArc(ctx, 0, 25, 8.6, true, 5);
      ctx.restore();
      scorch(ctx, -2, 44, 22, rng);
      crack(ctx, -16, 47, 14, 0.3, rng, true);
      tornHole(ctx, 13, 49, 7, rng, '#9f7bff');
      A.emissive(ctx, circle(1, 5, 3.2), '#ffb46b', 8);
      return;
    }
    const RG = TP.RINGS;
    for (let i = RG.length - 1; i >= 0; i--) coilArc(ctx, RG[i][0], RG[i][1], RG[i][1] * 0.34, false, 4.6);
    // insulator column with ribs; violet light leaking between the windings
    const col = rrect(-6.5, -60, 13, 102, 4);
    cylinder(ctx, col, -6.5, 6.5, '#3a3150');
    for (let yy = -54; yy < 40; yy += 5) A.panelLines(ctx, pline([[-6, yy], [6, yy]]), '#000', 0.45);
    for (let i = 0; i < RG.length - 1; i++) A.emissive(ctx, ell(0, (RG[i][0] + RG[i + 1][0]) / 2, 9, 2.4), TP.VIO, 6);
    for (let i = RG.length - 1; i >= 0; i--) coilArc(ctx, RG[i][0], RG[i][1], RG[i][1] * 0.34, true, 5);
    // crown: heavy toroid, rod and discharge sphere
    const ty = TP.TERM;
    coilArc(ctx, ty, 25, 8.5, false, 9.5);
    cylinder(ctx, rrect(-3, ty - 20, 6, 20, 2), -3, 3, '#5a5078');
    dome(ctx, 0, ty - 20, 8.5, '#b9aee0');
    A.emissive(ctx, circle(0, ty - 20, 3.4), '#ffffff', 8);
    coilArc(ctx, ty, 25, 8.5, true, 9.5);
    rivets(ctx, [[-15, ty + 6], [0, ty + 8.6], [15, ty + 6]], 1.1);
  }
  /** Storm cloud rendered per pixel (generator only): warped fbm density inside a shape mask, dark thick cores and
      silver-blue rims wherever the density rises away from the upper-left key light. */
  function stormCloud(w, h, o) {
    const c = A.canvas(w, h), x = c.getContext('2d');
    const sc = o.scale || 60;
    const n1 = A.noise(w, h, { scale: sc, octaves: 4, seed: o.seed, gain: 0.5, warp: o.warp != null ? o.warp : 0.5 });
    const n2 = A.noise(w, h, { scale: sc * 0.55, octaves: 4, seed: o.seed + 11, ridged: true, gain: 0.5 });
    const rho = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const m = o.mask((i + 0.5) / w, (j + 0.5) / h);
        if (m <= 0) continue;
        const k = j * w + i;
        rho[k] = clamp(((n1[k] * 0.84 + n2[k] * 0.16) * m - o.cut) / o.soft, 0, 1);
      }
    }
    const img = x.createImageData(w, h), d = img.data;
    const base = C.parse(o.base), rim = C.parse(o.rim), deep = C.parse(o.deep);
    const lx = o.lx || -4, ly = o.ly || -5, gain = o.litGain || 2.6, al = o.alpha || 1;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i, r = rho[k];
        if (r <= 0) continue;
        const ii = Math.min(w - 1, Math.max(0, i + lx)), jj = Math.min(h - 1, Math.max(0, j + ly));
        const lit = clamp((r - rho[jj * w + ii]) * gain, 0, 1);
        const dk = Math.min(1, r * r * 0.7);
        const q = k * 4;
        d[q] = lerp(lerp(base[0], deep[0], dk), rim[0], lit);
        d[q + 1] = lerp(lerp(base[1], deep[1], dk), rim[1], lit);
        d[q + 2] = lerp(lerp(base[2], deep[2], dk), rim[2], lit);
        d[q + 3] = 255 * Math.min(1, r * 1.7) * al;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  const smooth = (e0, e1, v) => sm01((v - e0) / (e1 - e0));
  /** Storm skirt layers (1100 x 560 logical): 'back' wraps the whole hull, 'front' only the lower flanks. */
  function tpCloudSprite(key, seed, front) {
    A.define(key, 1100, 560, (ctx, w, h) => {
      const cw = Math.round(w * 0.5), ch = Math.round(h * 0.5);
      const mask = (u, v) => {
        const X = (u - 0.5) * 1100, Y = (v - 0.5) * 560 + 10;
        const ex = X / 372, ey = (Y - 14) / 166, q = Math.sqrt(ex * ex + ey * ey);
        if (!front) return 1 - smooth(0.78, 1.28, q);
        return smooth(0.72, 0.95, q) * (1 - smooth(1.02, 1.3, q)) * smooth(0.15, 0.45, ey) * smooth(0.3, 0.5, Math.abs(ex));
      };
      const cv = stormCloud(cw, ch, { seed, scale: front ? 60 : 84, warp: 0.45, mask, cut: front ? 0.3 : 0.27, soft: 0.42,
        base: TP.STORM, deep: '#090c1a', rim: '#5a74a6', litGain: 2.6, alpha: front ? 0.9 : 1 });
      ctx.drawImage(cv, 0, 0, w, h);
    }, { pad: 0, res: 0.5 });
  }
  function defineTempestArt() {
    const K = TPK;
    A.define(K + 'hull', 680, 300, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const B = bb(-330, -140, 660, 270);
      const hull = A.symPath(0, TP.OUT);
      shadowUnder(ctx, hull, 10, 14, 22, 0.72);
      A.metal(ctx, hull, { base: '#283043', spec: 0.38, specPos: 0.24, bounds: B, edge: 3, rimLight: 2.6 });
      grime(ctx, B, 31, 0.5);
      ctx.save();
      ctx.clip(hull);
      for (const s of SIDES) {
        for (const xx of [146, 198, 246, 296]) A.panelLines(ctx, pline([[xx * s, -120], [(xx - 10) * s, 80]]), '#000', 0.55);
        A.panelLines(ctx, pline([[118 * s, -12], [200 * s, -8], [322 * s, -4]]), '#000', 0.45);
        vents(ctx, 178 * s, 22, 4, 3.5, 11, 7, 0);
        vents(ctx, 258 * s, 10, 3, 3.5, 10, 7, 0);
        tint(ctx, poly([[146, -120], [198, -120], [188, 80], [136, 80]], s), '#000000', 0.12);
        tint(ctx, poly([[246, -120], [296, -120], [286, 80], [236, 80]], s), '#ffffff', 0.03);
      }
      ctx.restore();
      for (const s of SIDES) {
        // trailing-edge armor ridge with a pink seam
        const ridge = poly([[118, -102], [164, -86], [208, -92], [250, -84], [290, -66], [316, -38], [304, -30], [282, -52], [246, -66], [208, -72], [164, -66], [122, -82]], s);
        shadowUnder(ctx, ridge, 3, 5, 6, 0.6);
        A.metal(ctx, ridge, { base: '#394058', spec: 0.6, specPos: 0.3, bounds: B, edge: 1.6 });
        A.emissive(ctx, pline([[124, -82], [164, -66], [208, -72], [246, -66], [282, -52], [304, -30]], s), PAL.seam, 6, { stroke: 1.2 });
        // leading-edge skirt plates
        const PLT = [[[134, 64], [176, 54], [180, 34], [140, 42]], [[178, 54], [216, 48], [220, 28], [184, 32]],
          [[218, 48], [254, 42], [260, 22], [224, 26]], [[256, 42], [292, 32], [298, 12], [262, 20]]];
        for (const pp of PLT) {
          const p = poly(pp, s);
          shadowUnder(ctx, p, 2, 4, 4, 0.55);
          A.metal(ctx, p, { base: '#2f3549', spec: 0.5, bounds: B, edge: 1.1, rimWidth: 1 });
        }
        // spire socket
        const sx = TP.SX * s;
        shadowUnder(ctx, ell(sx, 38, 40, 17), 3, 5, 7, 0.65);
        A.metal(ctx, ell(sx, 38, 40, 17), { base: '#3c4360', spec: 0.6, bounds: bb(sx - 40, 21, 80, 34), edge: 1.4 });
        const sg = ctx.createRadialGradient(sx, 40, 2, sx, 40, 32);
        sg.addColorStop(0, '#1e1830'); sg.addColorStop(1, '#06050a');
        ctx.fillStyle = sg;
        ctx.fill(ell(sx, 39, 32, 12));
        A.emissive(ctx, ell(sx, 39, 33, 13), TP.VIO, 6, { stroke: 1.2 });
        // capacitor fins
        for (const [fx, fy] of TP.FINS) {
          ctx.save();
          ctx.translate(fx * s, fy);
          ctx.rotate(0.1 * s);
          const fin = rrect(-4.5, -22, 9, 44, 3);
          shadowUnder(ctx, fin, 3, 4, 4, 0.7);
          A.metal(ctx, fin, { base: '#4a5170', spec: 0.7, bounds: bb(-4.5, -22, 9, 44), edge: 0.9, rimWidth: 0.8 });
          A.emissive(ctx, pline([[0, -17], [0, 16]]), TP.VIO, 5, { stroke: 1 });
          A.emissive(ctx, circle(0, -20.5, 2.2), TP.VIO2, 6);
          ctx.restore();
        }
        for (const [lx, ly] of TP.LIGHTS) {
          ctx.fillStyle = '#0a0b10';
          ctx.beginPath(); ctx.ellipse(lx * s, ly, 4.2, 3, 0, 0, TAU); ctx.fill();
          A.emissive(ctx, circle(lx * s, ly, 1.5), '#ff7aa2', 4);
        }
        // wingtip blade
        A.metal(ctx, poly([[316, -40], [324, -12], [334, -18], [328, -44]], s), { base: '#4a5170', spec: 0.6, bounds: B, edge: 1 });
        A.emissive(ctx, circle(331 * s, -30, 2), '#ff4f7f', 6);
      }
      // raised citadel
      const deck = A.symPath(0, TP.DECK);
      const DB = bb(-118, -118, 236, 142);
      shadowUnder(ctx, deck, 4, 8, 11, 0.7);
      A.metal(ctx, deck, { base: '#353b54', spec: 0.55, specPos: 0.3, bounds: DB, edge: 2.2 });
      grime(ctx, DB, 37, 0.3);
      ctx.save();
      ctx.clip(deck);
      [-86, -52, -18].forEach((yy, i) => {
        A.panelLines(ctx, pline([[-120, yy + 4], [-40, yy], [40, yy], [120, yy + 4]]), '#000', 0.55);
        if (i % 2 === 0) tint(ctx, poly([[-120, yy + 4], [120, yy + 4], [120, yy + 38], [-120, yy + 38]]), '#ffffff', 0.04);
      });
      for (const s of SIDES) {
        A.panelLines(ctx, pline([[44 * s, -116], [50 * s, 22]]), '#000', 0.5);
        vents(ctx, 80 * s, -68, 3, 4, 12, 8, 0);
        rivets(ctx, along(98 * s, -100, 108 * s, 0, 8, 0.05));
      }
      ctx.restore();
      for (const s of SIDES) A.emissive(ctx, pline([[104 * s, -94], [114 * s, -56], [110 * s, -10]]), PAL.seam, 6, { stroke: 1.3 });
      // bridge with a window strip and antenna masts
      const bridge = rrect(-36, -118, 72, 30, 7);
      shadowUnder(ctx, bridge, 3, 5, 6, 0.7);
      A.metal(ctx, bridge, { base: '#454c6a', spec: 0.65, bounds: bb(-36, -118, 72, 30), edge: 1.4 });
      ctx.fillStyle = '#07080d';
      ctx.beginPath(); ctx.roundRect(-28, -106, 56, 7, 3); ctx.fill();
      for (let i = 0; i < 7; i++) A.emissive(ctx, rrect(-25 + i * 7.4, -104.5, 4.4, 3.6, 1), i % 3 === 1 ? '#ffd27a' : '#ff7aa2', 4);
      for (const s of SIDES) {
        ctx.save();
        ctx.strokeStyle = 'rgba(20,22,30,0.95)';
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(48 * s, -110); ctx.lineTo(56 * s, -136); ctx.stroke();
        ctx.strokeStyle = 'rgba(150,160,190,0.5)';
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(47.4 * s, -110); ctx.lineTo(55.4 * s, -136); ctx.stroke();
        ctx.restore();
      }
      // engine block
      for (const [ex, ny, ew] of TP.ENG) {
        const nac = rrect(ex - ew / 2, ny + 4, ew, 44, 9);
        shadowUnder(ctx, nac, 4, 6, 9, 0.7);
        cylinder(ctx, nac, ex - ew / 2, ex + ew / 2, '#3a4056');
        for (const yy of [ny + 20, ny + 36]) A.panelLines(ctx, pline([[ex - ew / 2 + 2, yy], [ex + ew / 2 - 2, yy]]), '#000', 0.7);
        const bell = poly([[ex - ew * 0.42, ny + 8], [ex + ew * 0.42, ny + 8], [ex + ew * 0.5, ny - 6], [ex - ew * 0.5, ny - 6]]);
        cylinder(ctx, bell, ex - ew / 2, ex + ew / 2, '#2a2e3d');
        const ng = ctx.createRadialGradient(ex, ny - 6, 1, ex, ny - 6, ew * 0.5);
        ng.addColorStop(0, '#ffe2b0'); ng.addColorStop(0.4, '#ff7a3d'); ng.addColorStop(1, '#3a1208');
        ctx.fillStyle = ng;
        ctx.beginPath(); ctx.ellipse(ex, ny - 6, ew * 0.46, 5, 0, 0, TAU); ctx.fill();
      }
      // eye socket: armored collar around the iris, mandible plates
      const ey = TP.EY;
      shadowUnder(ctx, circle(0, ey, 86), 4, 7, 10, 0.7);
      A.metal(ctx, ringPath(0, ey, 76, 86), { base: '#2c3247', spec: 0.5, bounds: bb(-86, ey - 86, 172, 172), edge: 1.6 });
      ctx.fillStyle = '#05070c';
      ctx.fill(circle(0, ey, 77));
      for (let i = 0; i < 6; i++) {
        const a = PI / 6 + (i * PI) / 3;
        A.emissive(ctx, circle(Math.cos(a) * 81, ey + Math.sin(a) * 81, 1.8), PAL.glow, 5);
      }
      for (const s of SIDES) {
        const md = poly([[72, 62], [102, 72], [98, 96], [74, 110], [60, 102], [76, 84]], s);
        shadowUnder(ctx, md, 2, 4, 5, 0.6);
        A.metal(ctx, md, { base: '#3d4460', spec: 0.6, bounds: B, edge: 1.2 });
        A.emissive(ctx, pline([[76, 88], [96, 78]], s), PAL.seam, 5, { stroke: 1.2 });
      }
    }, { pad: 24, res: 1 });
    for (const lv of [1, 2]) {
      A.define(K + 'dmg' + lv, 680, 300, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        damageOverlay(ctx, A.symPath(0, TP.OUT), TP.DMG, lv, 900 + lv * 13, '#8fb4ff');
      }, { pad: 24, res: 1 });
    }
    // tesla spires (60 x 150), their glow overlay and the wreck
    A.define(K + 'spire', 70, 170, (ctx, w, h) => { ctx.translate(w / 2, h / 2); drawSpire(ctx, false); }, { pad: 8, res: 1.5 });
    A.define(K + 'spireX', 70, 170, (ctx, w, h) => { ctx.translate(w / 2, h / 2); drawSpire(ctx, true); }, { pad: 8, res: 1.5 });
    A.define(K + 'spireGlow', 70, 170, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.shadowColor = TP.VIO;
      ctx.shadowBlur = 10 * devScale(ctx);
      for (const [y, rx] of TP.RINGS) {
        ctx.strokeStyle = 'rgba(178,107,255,0.55)'; ctx.lineWidth = 6; ctx.stroke(ell(0, y, rx, rx * 0.34));
        ctx.strokeStyle = 'rgba(240,232,255,0.9)'; ctx.lineWidth = 1.6; ctx.stroke(ellArc(0, y, rx, rx * 0.34, 0.1, PI - 0.1));
      }
      ctx.strokeStyle = 'rgba(178,107,255,0.6)'; ctx.lineWidth = 10; ctx.stroke(ell(0, TP.TERM, 25, 8.5));
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke(ellArc(0, TP.TERM, 25, 8.5, 0.1, PI - 0.1));
      ctx.fillStyle = 'rgba(232,222,255,0.9)';
      ctx.beginPath(); ctx.arc(0, TP.TERM - 20, 8, 0, TAU); ctx.fill();
    }, { pad: 14, res: 1 });
    // iris blades, each pre-lit at its own angle so the closed iris reads as one lit dome
    for (let i = 0; i < 8; i++) {
      A.define(K + 'pet' + i, 124, 124, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        const th = -PI / 2 + (i * TAU) / 8;
        const P = (r, a) => [Math.cos(th + a) * r, Math.sin(th + a) * r];
        const blade = poly([P(3, 0.2), P(18, 0.3), P(36, 0.42), P(58, 0.56), P(58, 0.3), P(58, 0), P(58, -0.3), P(58, -0.46), P(40, -0.36), P(22, -0.22), P(8, -0.05)]);
        shadowUnder(ctx, blade, 1.5, 2.5, 4, 0.6);
        A.metal(ctx, blade, { base: '#3a4160', spec: 0.55, bounds: bb(-60, -60, 120, 120), edge: 1.6, rimWidth: 1 });
        ctx.save();
        ctx.clip(blade);
        A.panelLines(ctx, pline([P(12, 0.06), P(56, 0.08)]), '#000', 0.5);
        A.panelLines(ctx, ellArc(0, 0, 44, 44, th - 0.4, th + 0.48), '#000', 0.4);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = 'rgba(210,220,255,0.38)';
        ctx.lineWidth = 1.2;
        ctx.stroke(pline([P(4, 0.22), P(18, 0.31), P(36, 0.43), P(57, 0.56)]));
        ctx.restore();
        rivets(ctx, [P(50, -0.22), P(50, 0.24)], 1.2);
        A.emissive(ctx, circle(...P(30, 0.02), 1.4), '#7fa8ff', 4);
      }, { pad: 4, res: 1.5 });
    }
    // the eye of the storm: a spinning vortex in deep eye-blue
    A.define(K + 'eyeCore', 124, 124, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 60);
      g.addColorStop(0, '#dff0ff'); g.addColorStop(0.15, '#7fb2f0'); g.addColorStop(0.45, '#1f3f66'); g.addColorStop(0.85, '#0a1426'); g.addColorStop(1, '#04070e');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 60, 0, TAU); ctx.fill();
      ctx.drawImage(swirlCanvas(5, 58, { seed: 41, twist: 2.2, scale: 16, ridged: true, cut: 0.25, pow: 1.1, fade: 0.9,
        ramp: [[0, '#ffffff'], [0.15, '#d6ecff'], [0.42, '#78a8ec'], [0.75, '#2a5590'], [1, '#0d2040']] }), w / 2 - 60, h / 2 - 60, 120, 120);
    }, { pad: 2, res: 1 });
    // rotating vent ring between the iris and the rim (three spiral vents)
    A.define(K + 'vring', 136, 136, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const sh = ctx.createRadialGradient(0, 0, 44, 0, 0, 56);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = sh;
      ctx.fill(ringPath(0, 0, 44, 56));
      const g = ctx.createRadialGradient(0, 0, 55, 0, 0, 64);
      g.addColorStop(0, '#0c0e16'); g.addColorStop(0.45, '#30354c'); g.addColorStop(1, '#141722');
      ctx.fillStyle = g;
      ctx.fill(ringPath(0, 0, 55, 64));
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU + 0.13;
        A.panelLines(ctx, pline([[Math.cos(a) * 56, Math.sin(a) * 56], [Math.cos(a) * 63, Math.sin(a) * 63]]), '#000', 0.5);
      }
      for (let k = 0; k < 3; k++) {
        ctx.save();
        ctx.rotate((k * TAU) / 3);
        ctx.fillStyle = '#05060a';
        ctx.beginPath(); ctx.roundRect(55, -7.5, 9, 15, 3); ctx.fill();
        A.emissive(ctx, rrect(56.5, -5, 6, 10, 2), '#6f9cff', 5, { stroke: 1 });
        ctx.restore();
      }
    }, { pad: 3, res: 1 });
    A.define(K + 'eyeRim', 172, 172, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      shadowUnder(ctx, ringPath(0, 0, 63, 80), 3, 5, 7, 0.7);
      A.metal(ctx, ringPath(0, 0, 63, 80), { base: '#3b4260', spec: 0.6, bounds: bb(-80, -80, 160, 160), edge: 1.8 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        A.panelLines(ctx, pline([[Math.cos(a) * 64, Math.sin(a) * 64], [Math.cos(a) * 79, Math.sin(a) * 79]]), '#000', 0.6);
      }
      const bolts = [];
      for (let i = 0; i < 24; i++) bolts.push([Math.cos((i / 24) * TAU + 0.13) * 72, Math.sin((i / 24) * TAU + 0.13) * 72]);
      rivets(ctx, bolts, 1.2);
      for (let i = 0; i < 4; i++) {
        const a = PI / 4 + (i * PI) / 2;
        ctx.fillStyle = '#07080c';
        ctx.beginPath(); ctx.arc(Math.cos(a) * 71.5, Math.sin(a) * 71.5, 3.4, 0, TAU); ctx.fill();
        A.emissive(ctx, circle(Math.cos(a) * 71.5, Math.sin(a) * 71.5, 1.8), '#ff5c8a', 6);
      }
    }, { pad: 8, res: 1.5 });
    // storm skirt: two back layers (cross-faded), a front layer and loose billows that churn around the hull
    tpCloudSprite(K + 'cloudBack', 77, false);
    tpCloudSprite(K + 'cloudBack2', 191, false);
    tpCloudSprite(K + 'cloudFront', 263, true);
    for (let k = 0; k < 3; k++) {
      A.define(K + 'puff' + k, 240, 160, (ctx, w, h) => {
        const cw = Math.round(w * 0.6), ch = Math.round(h * 0.6);
        const mask = (u, v) => { const ex = (u - 0.5) / 0.5, ey = (v - 0.5) / 0.5; return 1 - smooth(0.35, 1, Math.sqrt(ex * ex + ey * ey)); };
        ctx.drawImage(stormCloud(cw, ch, { seed: 500 + k * 31, scale: 40, warp: 0.4, mask, cut: 0.22, soft: 0.38,
          base: TP.STORM, deep: '#090c1a', rim: '#5a74a6', litGain: 2.6 }), 0, 0, w, h);
      }, { pad: 0, res: 0.6 });
    }
    // intro silhouette: backlit by lightning inside the cloud wall
    A.define(K + 'sil', 700, 340, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const shape = new Path2D();
      shape.addPath(A.symPath(0, TP.OUT));
      for (const s of SIDES) {
        shape.addPath(rrect(TP.SX * s - 7, TP.SY - 80, 14, 130, 4));
        for (const [yy, rx] of TP.RINGS) shape.addPath(ell(TP.SX * s, TP.SY + yy, rx + 2, rx * 0.34 + 3));
        shape.addPath(ell(TP.SX * s, TP.SY + TP.TERM, 28, 12));
        shape.addPath(circle(TP.SX * s, TP.SY + TP.TERM - 20, 10));
        shape.addPath(ell(TP.SX * s, TP.SY + 50, 29, 12));
      }
      for (const [ex, ny, ew] of TP.ENG) shape.addPath(rrect(ex - ew / 2, ny - 6, ew, 50, 8));
      shape.addPath(circle(0, TP.EY, 86));
      ctx.fillStyle = '#9fb4ff';
      ctx.fill(shape);
      ctx.translate(3, 5);
      ctx.fillStyle = '#04050b';
      ctx.fill(shape);
    }, { pad: 10, res: 0.5 });
    ART.boss_tempest = ['hull', 'dmg1', 'dmg2', 'spire', 'spireX', 'spireGlow', 'pet0', 'pet1', 'pet2', 'pet3', 'pet4', 'pet5', 'pet6', 'pet7',
      'eyeCore', 'vring', 'eyeRim', 'cloudBack', 'cloudBack2', 'cloudFront', 'puff0', 'puff1', 'puff2', 'sil'].map((k) => K + k);
  }

  // ---------------------------------------------------------------- TEMPEST behavior
  function tpBroken(b) { return (alive(b, 'spire_l') ? 0 : 1) + (alive(b, 'spire_r') ? 0 : 1); }
  function spAng(st, def) {
    if (st.em && st.em.d && st.em.d.ang != null) return st.em.d.ang;
    return st.ang != null ? st.ang : def;
  }
  function spOn(st, on) {
    if (st.em) return st.em.phase === 'on';
    return st.ph != null && st.ph < on;
  }
  /** Spire volley: 0.4 s coil glow, then a fan of 5 sparks from the crown. */
  function tpVolley(b, id) {
    const e = part(b, id);
    if (!e || e.dead || e.data.broken) return;
    e.data.chargeT = 0.4;
    sfx('enemy_charge', { x: e.x });
    later(b, 0.4, () => {
      if (e.dead || e.data.broken) return;
      const s = id === 'spire_l' ? -1 : 1;
      pFan(b, 'aim', { ox: TP.SX * s, oy: TP.SY + TP.TERM - 20, count: 5, spread: 0.7, speed: 210, type: 'spark', bias: b });
      e.data.fl = 0.16;
    });
  }
  /** Lightning strike rings: one on the target, the rest random, all striking 1.2 s later. */
  function tpStrikes(b, n) {
    const d = b.data;
    const t = target(b, b);
    const fresh = [{ x: clamp(t.x, 50, W - 50), y: clamp(t.y, 90, H - 50), t: 0, T: 1.2, r: 70, lead: true }];
    for (let i = 1; i < n; i++) {
      let x = 0, y = 0;
      for (let k = 0; k < 8; k++) {
        x = grnd(70, W - 70); y = grnd(470, H - 110);
        let ok = true;
        for (const s of fresh) if (Math.hypot(s.x - x, s.y - y) < 150) { ok = false; break; }
        if (ok) break;
      }
      fresh.push({ x, y, t: 0, T: 1.2, r: 70, lead: false });
    }
    for (const s of fresh) d.strikes.push(s);
    sfx('storm_strike_warn', { x: fresh[0].x });
  }
  function tpBolt(b, x, y, loud) {
    const d = b.data;
    const bl = makeBolt(x + crnd(-90, 90), -40, x, y, 16, 34, 2);
    bl.life = 0.34;
    d.bolts.push(bl);
    if (d.bolts.length > 12) d.bolts.shift();
    SL.fx.sparks(x, y, { count: 18, color: '#cfe0ff', speed: 520, life: 0.4 });
    SL.fx.emit({ x, y, life: 0.35, size: 50, size2: 160, color: '#9fb8ff', alpha: 0.8, alpha2: 0, shape: 'ring' });
    SL.fx.shockwave(x, y, { radius: 130, duration: 0.35, strength: 0.6, ring: false });
    if (loud) { SL.fx.flash('#bcd0ff', 0.14, 0.12); SL.fx.shake(5, 0.2); }
    sfx('storm_strike', { x, vol: loud ? 1 : 0.45 });
  }
  function tpStrikeUpdate(b, dt) {
    const d = b.data, L = d.strikes;
    let first = true;
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i];
      s.t += dt;
      if (s.t < s.T) continue;
      L.splice(i, 1);
      tpBolt(b, s.x, s.y, first);
      first = false;
      const r2 = (s.r + 4) * (s.r + 4);
      const ps = SL.world.players;
      for (let j = 0; j < ps.length; j++) {
        const p = ps[j];
        if (!p.alive || p.down || p.display) continue;
        if ((p.x - s.x) * (p.x - s.x) + (p.y - s.y) * (p.y - s.y) <= r2) SL.damagePlayer(p, 18, { source: 'lightning' });
      }
      const en = SL.world.enemies;
      for (let j = 0; j < en.length; j++) {
        const e = en[j];
        if (e.dead || e.dying || e.isBoss || e.intangible || (e.def && e.def.bossPart)) continue;
        const q = s.r + (e.r || 0);
        if ((e.x - s.x) * (e.x - s.x) + (e.y - s.y) * (e.y - s.y) <= q * q) SL.damageEnemy(e, 60, { type: 'lightning', x: e.x, y: e.y });
      }
    }
  }
  /** Lightning fence: two edge beams with a 120 px gap at the target's x, swept from y 200 to 1100 at 260 px/s. */
  function tpFence(b) {
    const d = b.data;
    const t = target(b, b);
    const gx = clamp(t.x, 70, W - 70);
    const src = { x: 0, y: 200, dead: false, dying: false };
    const f = { src, gx, beams: [], t: 0, state: 'tele' };
    const dur = (1100 - 200) / 260, lenL = gx - 60, lenR = W - (gx + 60);
    if (lenL > 2) f.beams.push(pBeam(b, src, { angle: 0, ox: 0, width: 16, telegraph: 1.0, duration: dur, follow: true, length: lenL, color: TP.FENCE }));
    if (lenR > 2) f.beams.push(pBeam(b, src, { angle: PI, ox: W, width: 16, telegraph: 1.0, duration: dur, follow: true, length: lenR, color: TP.FENCE }));
    d.fences.push(f);
    for (const id of ['spire_l', 'spire_r']) { const e = part(b, id); if (e && !e.data.broken) e.data.chargeT = 1.0; }
  }
  function tpFenceUpdate(b, dt) {
    const L = b.data.fences;
    for (let i = L.length - 1; i >= 0; i--) {
      const f = L[i];
      f.t += dt;
      let live = false, active = false;
      for (const bm of f.beams) { if (!bm.dead && bm.state !== 'fade') live = true; if (bm.state === 'active') active = true; }
      if (active) f.src.y = Math.min(1100, f.src.y + 260 * dt);
      f.state = active ? 'active' : live ? 'tele' : 'fade';
      if (!live || f.t > 6) { f.src.dead = true; L.splice(i, 1); }
    }
  }
  function tpSpiralOk(b) {
    const L = b.data.fences;
    for (let i = 0; i < L.length; i++) {
      const f = L[i];
      if (f.state === 'tele') return false;
      if (f.state === 'active' && f.src.y < b.y + TP.EY + 80) return false;
    }
    return true;
  }
  function tpClearAttacks(b) {
    const d = b.data;
    d.strikes.length = 0;
    for (const f of d.fences) f.src.dead = true;
    d.fences.length = 0;
    for (const id of ['spire_l', 'spire_r']) { const e = part(b, id); if (e) e.data.chargeT = 0; }
    d.ventOn = false;
  }
  function tpAnimate(b, dt) {
    const d = b.data;
    d.open = approach(d.open, d.wantOpen, d.wantOpen > d.open ? 2.4 : 4, dt);
    if (d.tear) d.cloud = Math.max(0, d.cloud - dt / 1.6);
    for (let i = 0; i < d.puffs.length; i++) { const p = d.puffs[i]; p.a += p.v * dt; p.rot += p.spin * dt; }
    for (const id of ['spire_l', 'spire_r']) {
      const e = d.parts[id];
      if (!e) continue;
      const pd = e.data;
      if (pd.chargeT > 0) { pd.chargeT -= dt; pd.charge = Math.min(1, pd.charge + dt / 0.4); } else pd.charge = Math.max(0, pd.charge - dt * 4);
      if (pd.fl > 0) pd.fl -= dt;
      if (!pd.broken && !pd.torn && e.hp < e.maxHp * 0.5 && Math.random() < dt * 5) {
        SL.fx.sparks(e.x + crnd(-20, 20), e.y + crnd(-50, 40), { count: 4, color: '#d9c8ff', speed: 260, life: 0.3, size: 4 });
      }
    }
    if (d.eyeCharge > 0) d.eyeCharge -= dt;
    if (d.cloud > 0.05 && !b.dying) {
      if ((d.cflT -= dt) <= 0) {
        d.cflT = b.introDone ? crnd(0.6, 1.8) : crnd(0.25, 0.7);
        const a = crnd(0, TAU), k = crnd(0.75, 1.05);
        const fx = Math.cos(a) * 330 * k, fy = 14 + Math.sin(a) * 140 * k;
        const bl = makeBolt(fx + crnd(-40, 40), fy - crnd(30, 60), fx + crnd(-50, 50), fy + crnd(10, 40), 6, 10, 1);
        bl.w = 0.6;
        d.cfl = { x: fx, y: fy, t: 0, life: crnd(0.2, 0.32), bolt: bl };
      }
    }
    if (d.cfl && (d.cfl.t += dt) > d.cfl.life) d.cfl = null;
    for (let i = d.bolts.length - 1; i >= 0; i--) { const bl = d.bolts[i]; bl.t += dt; if (bl.t >= bl.life) d.bolts.splice(i, 1); }
    if (!b.dying) { tpStrikeUpdate(b, dt); tpFenceUpdate(b, dt); }
  }
  function tpFlashK(f) {
    const u = f.t / f.life;
    return (u < 0.15 ? u / 0.15 : Math.pow(1 - u, 1.2)) * (u > 0.4 && u < 0.52 ? 0.35 : 1);
  }
  function tpTearFx(b) {
    for (let i = 0; i < 26; i++) {
      const a = crnd(0, TAU);
      const x = b.x + Math.cos(a) * 340 * crnd(0.7, 1.1), y = b.y + 14 + Math.sin(a) * 150 * crnd(0.7, 1.1);
      const sp = crnd(120, 260);
      SL.fx.emit({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, life: crnd(1.2, 2.0), size: crnd(60, 90), size2: crnd(130, 190), color: '#1c2342', shape: 'smoke', alpha: 0.75, alpha2: 0, drag: 0.6 });
    }
    SL.fx.flash('#cfe0ff', 0.35, 0.3);
    SL.fx.sparks(b.x, b.y + TP.EY, { count: 30, color: '#bcd8ff', speed: 420, life: 0.5 });
    sfx('storm_strike', { x: b.x });
    sfx('boss_roar', { x: b.x });
  }
  function tpSpireBlast(b, id, s) {
    const e = part(b, id);
    const x = b.x + TP.SX * s, y = b.y + TP.SY - 10;
    chainBlast(b, x, y, 'l', 'blue', true);
    SL.fx.sparks(x, y - 40, { count: 30, color: '#e0d0ff', speed: 520, life: 0.5 });
    debrisBurst(x, y, DEBRIS_VIOLET, 8, 380, 12, 30);
    if (e) e.data.torn = true;
  }
  function tpDeathBolt(b, i) {
    let x, y;
    if (i % 2 === 0) {
      const p = TP.DMG[(Math.random() * TP.DMG.length) | 0];
      x = b.x + p[0]; y = b.y + p[1];
      SL.fx.explode(x, y, { size: 'm', palette: 'blue', sound: false, shake: false });
    } else { x = crnd(60, W - 60); y = crnd(420, H - 160); }
    tpBolt(b, x, y, i % 3 === 0);
  }

  function tpDrawStrikes(b, ctx, t) {
    const L = b.data.strikes;
    for (let i = 0; i < L.length; i++) {
      const s = L[i];
      const k = clamp(s.t / s.T, 0, 1), late = k > 0.8 ? (k - 0.8) / 0.2 : 0;
      A.drawGlow(ctx, s.x, s.y, s.r * 1.2, TP.BOLT, 0.2 + 0.25 * k + 0.35 * late);
      A.drawGlow(ctx, s.x, s.y, 10 + 8 * k, '#ffffff', 0.35 + 0.5 * k);
      ctx.globalCompositeOperation = 'lighter';
      ctx.setLineDash(STRIKE_DASH);
      ctx.lineDashOffset = -t * 60;
      ctx.strokeStyle = C.rgba(s.lead ? '#dfe6ff' : '#bccaff', 0.7 + 0.3 * k);
      ctx.lineWidth = 3.4 + 1.8 * late;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.stroke();
      ctx.setLineDash(NO_DASH);
      ctx.strokeStyle = C.rgba('#ffffff', 0.25 + 0.6 * k);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1 - k) + 4, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      if (late > 0 && Math.random() < 0.7) {
        const a = Math.random() * TAU;
        zap(ctx, s.x + Math.cos(a) * s.r, s.y + Math.sin(a) * s.r, s.x + Math.cos(a + 0.7) * s.r, s.y + Math.sin(a + 0.7) * s.r, 4, 6, TP.BOLT, 0.9, 0.8);
      }
    }
    const BL = b.data.bolts;
    for (let i = 0; i < BL.length; i++) {
      const bl = BL[i], u = bl.t / bl.life;
      const a = (u < 0.12 ? 1 : Math.pow(1 - u, 1.3)) * (u > 0.3 && u < 0.38 ? 0.45 : 1);
      drawBolt(ctx, bl, a);
      A.drawGlow(ctx, bl.x, bl.y, 84, TP.BOLT, 0.8 * a);
      A.drawGlow(ctx, bl.x, bl.y, 30, '#ffffff', a);
    }
  }
  const STRIKE_DASH = [12, 9];
  function tpDrawFences(b, ctx, x, y, t) {
    const L = b.data.fences;
    for (let i = 0; i < L.length; i++) {
      const f = L[i];
      if (f.state === 'fade') continue;
      const fy = f.src.y, tele = f.state === 'tele', k = tele ? clamp(f.t / 1.0, 0, 1) : 1;
      for (const s of SIDES) {
        const px = f.gx + 60 * s;
        A.drawGlow(ctx, px, fy, 28 + 6 * Math.sin(t * 30 + s), TP.FENCE, 0.45 + 0.45 * k);
        A.drawGlow(ctx, px, fy, 11, '#ffffff', 0.6 + 0.4 * k);
        const sp = alive(b, s < 0 ? 'spire_l' : 'spire_r');
        const sx = sp ? x + TP.SX * s : x + 40 * s, sy = sp ? y + TP.SY + TP.TERM - 20 : y + TP.EY;
        const al = tele ? 0.5 + 0.4 * k : clamp(1 - (fy - sy - 120) / 520, 0, 1) * 0.85;
        if (al > 0.05 && Math.random() < 0.85) zap(ctx, sx, sy, px, fy, 10, 18, TP.FENCE, al, 1.1);
      }
    }
  }
  function tpPuffs(b, ctx, x, y, front, cl, tear) {
    const P = b.data.puffs, spread = 1 + tear * 0.7;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], s = Math.sin(p.a), c = Math.cos(p.a);
      const isFront = s >= 0 && Math.abs(c) > 0.32;
      if (isFront !== front) continue;
      const px = x + c * 352 * p.rk * spread, py = y + 14 + s * (s > 0 ? 168 : 150) * p.rk * spread;
      A.drawSprite(ctx, TPK + 'puff' + p.k, px, py, p.rot, p.s * (1 + tear * 0.3), cl * (front ? 0.85 : 0.95));
    }
  }
  function tpDrawEye(b, ctx, x, y, t) {
    const d = b.data, K = TPK;
    const ex = x, ey = y + TP.EY, open = d.open, col = d.collapse;
    if (open > 0.02) {
      const sc = 1 - col * 0.92;
      A.drawSprite(ctx, K + 'eyeCore', ex, ey, -t * 1.4, sc, 1);
      const pulse = 0.5 + 0.5 * Math.sin(t * 6), ch = d.eyeCharge > 0 ? Math.min(1, d.eyeCharge) : 0;
      A.drawGlow(ctx, ex, ey, (34 + 12 * pulse + 34 * ch) * sc, '#8fc0ff', (0.5 + 0.35 * ch) * open);
      A.drawGlow(ctx, ex, ey, (14 + 5 * pulse + 14 * ch) * sc, '#ffffff', 0.9 * open);
    }
    if (open < 0.985) {
      ctx.save();
      ctx.beginPath(); ctx.arc(ex, ey, 57, 0, TAU); ctx.clip();
      const tw = open * 0.4, off = open * 54;
      for (let i = 0; i < 8; i++) {
        const th = -PI / 2 + (i * TAU) / 8 + tw;
        A.drawSprite(ctx, K + 'pet' + i, ex + Math.cos(th) * off, ey + Math.sin(th) * off, tw);
      }
      ctx.restore();
      if (open < 0.3) A.drawGlow(ctx, ex, ey, 22, '#6f9cff', 0.3 + 0.1 * Math.sin(t * 5));
    }
    A.drawSprite(ctx, K + 'vring', ex, ey, d.ventA);
    if (d.ventOn) {
      for (let k = 0; k < 3; k++) {
        const a = d.ventA + (k * TAU) / 3, vx = ex + Math.cos(a) * 59.5, vy = ey + Math.sin(a) * 59.5;
        A.drawGlow(ctx, vx, vy, 18, '#8fb4ff', 0.85);
        A.drawGlow(ctx, vx, vy, 7, '#ffffff', 0.9);
      }
    }
    A.drawSprite(ctx, K + 'eyeRim', ex, ey);
    const em = d.parts.eye;
    if (em && em.flash > 0 && open > 0.5) A.drawGlow(ctx, ex, ey, 40, HOT, 0.4);
    if (col > 0) {
      A.drawGlow(ctx, ex, ey, 60 + 260 * col, '#bcd8ff', 0.9 * (1 - col));
      A.drawGlow(ctx, ex, ey, 30 + 90 * col, '#ffffff', 1 - col * 0.7);
    }
  }
  function tpDrawSpires(b, ctx, x, y, t) {
    const d = b.data, K = TPK;
    for (const s of SIDES) {
      const id = s < 0 ? 'spire_l' : 'spire_r', e = d.parts[id];
      if (!e) continue;
      const pd = e.data, sx = x + TP.SX * s, sy = y + TP.SY;
      if (pd.broken || pd.torn) {
        A.drawSprite(ctx, K + 'spireX', sx, sy);
        A.drawGlow(ctx, sx + 1, sy + 4, 22, '#ff9a5a', 0.4 + 0.2 * Math.sin(t * 12 + s));
        if (Math.random() < 0.3) zap(ctx, sx + crnd(-5, 5), sy + 6, sx + crnd(-28, 28), sy + crnd(20, 44), 4, 5, TP.VIO, 0.75, 0.8);
        continue;
      }
      A.drawSprite(ctx, K + 'spire', sx, sy);
      if (e.flash > 0) A.drawFlash(ctx, K + 'spire', sx, sy, 0, 1, 0.45);
      const ch = pd.charge || 0, idle = 0.2 + 0.1 * Math.sin(t * 8 + s * 2);
      const flick = e.hp < e.maxHp * 0.5 && Math.random() < 0.25 ? 0.3 : 1;
      ctx.globalCompositeOperation = 'lighter';
      A.drawSprite(ctx, K + 'spireGlow', sx, sy, 0, 1, Math.min(1, Math.max(idle, ch) * flick));
      ctx.globalCompositeOperation = 'source-over';
      const tx = sx, ty = sy + TP.TERM - 20;
      A.drawGlow(ctx, tx, ty, 18 + 30 * ch + (pd.fl > 0 ? 30 : 0), TP.VIO, 0.55 + 0.45 * ch);
      A.drawGlow(ctx, tx, ty, 8 + 12 * ch, '#ffffff', 0.75 + 0.25 * ch);
      if (Math.random() < 0.3 + ch * 0.6) {
        const k = (Math.random() * 5) | 0, sd = Math.random() < 0.5 ? -1 : 1;
        zap(ctx, sx + TP.RINGS[k][1] * sd, sy + TP.RINGS[k][0], sx + TP.RINGS[k + 1][1] * sd, sy + TP.RINGS[k + 1][0], 4, 4, TP.VIO, 0.8, 0.7);
      }
      if (ch > 0.2) {
        const k = (Math.random() * 6) | 0, sd = Math.random() < 0.5 ? -1 : 1;
        zap(ctx, tx, ty, sx + TP.RINGS[k][1] * sd, sy + TP.RINGS[k][0], 6, 8, TP.VIO, ch, 1);
        if (Math.random() < 0.5) zap(ctx, tx, ty, tx + crnd(-55, 55), ty + crnd(-50, 10), 5, 8, TP.VIO, ch * 0.8, 0.8);
      }
      if (pd.fl > 0) A.drawGlow(ctx, tx, ty, 52, '#e6dcff', pd.fl / 0.16);
    }
  }
  function tpIntroFlash(b, ctx) {
    const t = b.data.at;
    let env = 0;
    for (let i = 0; i < TP.FLASH.length; i++) {
      const u = (t - TP.FLASH[i]) / 0.34;
      if (u > 0 && u < 1) env = Math.max(env, (u < 0.08 ? u / 0.08 : Math.pow(1 - u, 1.5)) * (0.7 + 0.15 * i));
    }
    if (env <= 0.01) return;
    const sx = W / 2, sy = 320;
    A.drawGlow(ctx, sx - 70, sy - 90, 560, '#4f66c8', 0.6 * env);
    A.drawGlow(ctx, sx + 90, sy - 40, 320, '#bcd0ff', 0.4 * env);
    A.drawSprite(ctx, TPK + 'sil', sx, sy, 0, 1.28, 0.92 * env);
  }
  function tpDraw(b, ctx) {
    const d = b.data, t = SL.time.t, K = TPK;
    const dy = b.dying;
    const x = b.x + (dy ? crnd(-4, 4) : 0), y = b.y + (dy ? crnd(-3, 3) : 0);
    if (!b.introDone) tpIntroFlash(b, ctx);
    if (y < -360) { tpDrawStrikes(b, ctx, t); return; }
    const hpF = b.hp / b.maxHp, cl = d.cloud, tear = 1 - cl;
    const fk = d.cfl ? tpFlashK(d.cfl) : 0;
    // storm skirt behind the hull, with lightning flickering inside it
    if (cl > 0.01) {
      A.drawSprite(ctx, K + 'cloudBack', x + Math.sin(t * 0.31) * 9, y + 6 + Math.sin(t * 0.43) * 4, Math.sin(t * 0.17) * 0.02, 1 + tear * 0.4, cl);
      A.drawSprite(ctx, K + 'cloudBack2', x - Math.sin(t * 0.27) * 11, y + 2, -Math.sin(t * 0.21) * 0.025, 1.02 + tear * 0.5, cl * (0.45 + 0.35 * Math.sin(t * 0.5)));
      tpPuffs(b, ctx, x, y, false, cl, tear);
      if (fk > 0) {
        const f = d.cfl;
        A.drawGlow(ctx, x + f.x, y + f.y, 150, '#5f7be0', 0.5 * fk * cl);
        A.drawGlow(ctx, x + f.x, y + f.y, 60, '#dfe8ff', 0.45 * fk * cl);
        SL.render.setTransform(ctx, x, y, 0);
        drawBolt(ctx, f.bolt, fk * cl);
        SL.render.resetTransform(ctx);
      }
    }
    // engines
    const thrust = b.introDone ? 1 : 1.3;
    for (let i = 0; i < 4; i++) {
      const e = TP.ENG[i];
      const flick = dy ? (Math.random() < 0.3 ? 0.3 : 1) : 1;
      plume(ctx, x + e[0], y + e[1] - 4, -PI / 2, e[2] * 0.75, (60 + 12 * Math.sin(t * 7 + i)) * thrust * flick, '#ffffff', PAL.engine, t + i * 0.41);
      A.drawGlow(ctx, x + e[0], y + e[1] - 5, e[2] * 0.85, PAL.engine, 0.7 * flick);
    }
    A.drawSprite(ctx, K + 'hull', x, y);
    if (hpF < 0.85) A.drawSprite(ctx, K + 'dmg1', x, y, 0, 1, sm01((0.85 - hpF) / 0.3));
    if (hpF < 0.5) A.drawSprite(ctx, K + 'dmg2', x, y, 0, 1, sm01((0.5 - hpF) / 0.3));
    bossFlash(b, ctx, K + 'hull', x, y);
    if (fk > 0 && cl > 0.01) A.drawFlash(ctx, K + 'hull', x, y, 0, 1, 0.12 * fk * cl);
    if (hpF < 0.5) {
      for (let i = 0; i < TP.DMG.length; i += 2) {
        const p = TP.DMG[i];
        A.drawGlow(ctx, x + p[0], y + p[1], 15, '#8fb4ff', (0.35 + 0.3 * Math.sin(t * 13 + i * 1.7)) * sm01((0.5 - hpF) / 0.3));
      }
    }
    // capacitor fins: flickering tips and arcs between neighbours (more while the fences are up)
    const finK = b.phase === 1 ? 1 : 0.45;
    for (const s of SIDES) {
      for (let i = 0; i < TP.FINS.length; i++) {
        const f = TP.FINS[i];
        A.drawGlow(ctx, x + (f[0] + 2.1) * s, y + f[1] - 21, 9, TP.VIO, (0.35 + 0.3 * Math.sin(t * 11 + i * 1.9 + s)) * (hpF < 0.3 && Math.random() < 0.3 ? 0.3 : 1));
      }
    }
    if (!dy && Math.random() < 0.32 * finK + 0.08) {
      const s = Math.random() < 0.5 ? -1 : 1, j = (Math.random() < 0.5 ? 0 : 3) + ((Math.random() * 2) | 0);
      const f0 = TP.FINS[j], f1 = TP.FINS[j + 1];
      zap(ctx, x + (f0[0] + 2.1) * s, y + f0[1] - 20, x + (f1[0] + 2.1) * s, y + f1[1] - 20, 5, 5, TP.VIO, 0.9, 0.8);
    }
    // antenna beacons and running lights
    for (let i = 0; i < 2; i++) {
      const a = TP.ANT[i];
      A.drawGlow(ctx, x + a[0], y + a[1], 9, '#ff4f7f', (t * 1.3 + i * 0.5) % 1 < 0.18 ? 1 : 0.25);
    }
    const ph = (t * 6) % 7;
    for (let i = 0; i < TP.LIGHTS.length; i++) {
      const [lx, ly] = TP.LIGHTS[i];
      let a = 0.25 + (Math.abs(ph - i) < 1 ? 0.75 : 0);
      if (hpF < 0.4 && Math.random() < 0.25) a *= 0.2;
      A.drawGlow(ctx, x + lx, y + ly, 11, '#ff4f7f', a);
      A.drawGlow(ctx, x - lx, y + ly, 11, '#ff4f7f', a);
    }
    tpDrawSpires(b, ctx, x, y, t);
    tpDrawEye(b, ctx, x, y, t);
    if (cl > 0.01) {
      A.drawSprite(ctx, K + 'cloudFront', x - Math.sin(t * 0.37) * 7, y + 4 + Math.sin(t * 0.29) * 3, 0, 1 + tear * 0.45, 0.95 * cl);
      tpPuffs(b, ctx, x, y, true, cl, tear);
    }
    tpDrawFences(b, ctx, x, y, t);
    tpDrawStrikes(b, ctx, t);
    drawMarks(b, ctx);
    drawBeamTelegraphs(b, ctx, TP.VIO);
  }

  defineBoss('boss_tempest', {
    name: 'TEMPEST', title: 'Storm Dreadnought', hp: 24000, r: 170, score: 90000, parTime: 95, size: [640, 300],
    credits: [50, 6], palette: 'blue', debris: DEBRIS_GRAPHITE,
    init(b) {
      const d = b.data;
      b.x = W / 2; b.y = -320;
      b.circles = TP.CIRCLES.map((c) => ({ x: c.x, y: c.y, r: c.r }));
      d.open = 0; d.wantOpen = 0; d.cloud = 1; d.tear = false; d.collapse = 0;
      d.strikes = []; d.bolts = []; d.fences = [];
      d.cfl = null; d.cflT = 0.2; d.ventA = 0; d.ventOn = false; d.eyeCharge = 0; d.dt = 1 / 60; d.introFl = 0;
      d.puffs = [];
      for (let i = 0; i < 20; i++) {
        d.puffs.push({ a: (i / 20) * TAU + crnd(-0.1, 0.1), rk: crnd(0.9, 1.12), s: crnd(0.75, 1.2), v: crnd(0.05, 0.11), k: i % 3, rot: crnd(-0.3, 0.3), spin: crnd(-0.06, 0.06) });
      }
      for (const s of SIDES) {
        addPart(b, s < 0 ? 'spire_l' : 'spire_r', {
          ox: TP.SX * s, oy: TP.SY, r: 30, hp: 2000, bonus: 500, palette: 'blue',
          circles: [{ x: 0, y: -50, r: 24 }, { x: 0, y: -10, r: 26 }, { x: 0, y: 32, r: 28 }],
          onBreak: (bb2, e) => { SL.fx.sparks(e.x, e.y - 50, { count: 36, color: '#e0d0ff', speed: 600, life: 0.55 }); debrisBurst(e.x, e.y, DEBRIS_VIOLET, 7, 380, 10, 40); },
        });
      }
      addPart(b, 'eye', { ox: 0, oy: TP.EY, r: 62, weak: true, circles: [{ x: 0, y: 0, r: 62 }],
        mult: (bb2) => (bb2.phase >= 2 && bb2.data.open > 0.6 ? 2.0 : 1.0) });
      for (const e of d.partList) { e.data.charge = 0; e.data.chargeT = 0; e.data.fl = 0; }
    },
    intro(b, dt) {
      const d = b.data, t = d.at;
      d.dt = dt;
      b.x = W / 2;
      b.y = t < 0.5 ? -320 : lerp(-320, 250, SL.ease.outCubic(clamp((t - 0.5) / 3.5, 0, 1)));
      while (d.introFl < TP.FLASH.length && t >= TP.FLASH[d.introFl]) {
        sfx('storm_strike', { x: W / 2, vol: 0.5 + 0.25 * d.introFl });
        d.introFl++;
        if (d.introFl === 3) sfx('boss_roar', { x: W / 2 });
      }
      tpAnimate(b, dt);
      return t >= 4;
    },
    update(b, dt) {
      const d = b.data;
      d.dt = dt;
      const t = b.fightT;
      const amp = b.phase === 0 ? 120 : b.phase === 1 ? 90 : 70, per = b.phase === 0 ? 14 : b.phase === 1 ? 17 : 12;
      b.x = approach(b.x, W / 2 + amp * Math.sin((TAU * t) / per), 2.5, dt);
      b.y = approach(b.y, 250 + Math.sin(t * 1.1) * 6, 2.5, dt);
      tpAnimate(b, dt);
      damageFx(b, dt, TP.DMG);
    },
    phases: [
      {
        at: 1.0, name: 'Thunderhead',
        enter(b, S) { tpClearAttacks(b); S.volT = 1.0; S.side = 1; S.strikeT = 1.5; S.wallT = 2.8; },
        update(b, dt, S) {
          if ((S.volT -= dt) <= 0) { S.volT = 1.4; S.side ^= 1; tpVolley(b, S.side ? 'spire_r' : 'spire_l'); }
          if ((S.strikeT -= dt) <= 0) { S.strikeT = 4; tpStrikes(b, Math.max(1, 3 - tpBroken(b))); }
          if ((S.wallT -= dt) <= 0) {
            S.wallT = 5;
            pWallGap(b, { oy: 122, count: 16, gap: 110, speed: 140, type: 'orb', gapX: target(b, b).x });
          }
        },
      },
      {
        at: 0.70, name: 'Fence',
        enter(b, S) { tpClearAttacks(b); S.fenceT = 1.0; S.sp = {}; },
        update(b, dt, S) {
          const d = b.data;
          if ((S.fenceT -= dt) <= 0) {
            S.fenceT = 7;
            tpFence(b);
            if (b.hp / b.maxHp < 0.55) later(b, 1.6, tpFence);
          }
          if (d.pt >= 1.0 && tpSpiralOk(b)) {
            pSpiral(S.sp, b, dt, { oy: TP.EY, radius: 58, arms: 3, rate: 8, speed: 170, spin: 1.2, on: 2.0, off: 1.4, type: 'orb', color: EB.violet });
            d.ventOn = spOn(S.sp, 2.0);
          } else d.ventOn = false;
          d.ventA = spAng(S.sp, d.ventA);
        },
      },
      {
        at: 0.40, name: 'Eye of the Storm',
        enter(b, S) {
          const d = b.data;
          tpClearAttacks(b);
          d.tear = true; d.wantOpen = 1;
          tpTearFx(b);
          S.strikeT = 1.0; S.sweepT = 2.2; S.flowerT = 1.6; S.hugeT = 1.0; S.dir = 1;
        },
        update(b, dt, S) {
          const low = b.hp / b.maxHp < 0.15;
          if ((S.strikeT -= dt) <= 0) { S.strikeT = low ? 2.2 : 3; tpStrikes(b, Math.max(1, 5 - tpBroken(b))); }
          if ((S.sweepT -= dt) <= 0) {
            S.sweepT = 6.5;
            const a0 = PI / 2 + S.dir * 0.698, a1 = PI / 2 - S.dir * 0.698;
            S.dir = -S.dir;
            pBeamSweep(b, b, { from: a0, to: a1, width: 36, telegraph: 1.0, duration: 1.8, oy: TP.EY, arrowR: 130 });
            b.data.eyeCharge = 1.0;
          }
          if ((S.flowerT -= dt) <= 0) { S.flowerT = 3.5; pFlower(b, { oy: TP.EY, count: 16, speed: 150, type: 'petal', offset: grnd(0, TAU) }); }
          if (low && (S.hugeT -= dt) <= 0) { S.hugeT = 1.5; pAimed(b, { oy: TP.EY, speed: 130, type: 'orb_huge' }); }
        },
      },
    ],
    draw: tpDraw,
    death: {
      start(b) {
        const d = b.data;
        tpClearAttacks(b);
        d.dieY = b.y; d.wantOpen = 1; d.tear = true; d.collapse = 0;
      },
      steps: [
        [0.0, (b) => { SL.fx.shake(12, 2.6); }],
        ...[0.05, 0.28, 0.5, 0.72, 0.95, 1.15, 1.38, 1.6].map((tt, i) => [tt, (b) => tpDeathBolt(b, i)]),
        [0.9, (b) => tpSpireBlast(b, 'spire_l', -1)],
        [1.25, (b) => tpSpireBlast(b, 'spire_r', 1)],
        [1.85, (b) => {
          SL.fx.flash('#dfeaff', 0.85, 0.5);
          SL.fx.chromatic(0.7, 0.5);
          SL.fx.shockwave(b.x, b.y + TP.EY, { radius: 380, duration: 0.6, strength: 1.6, color: '#bcd0ff' });
          SL.fx.explode(b.x, b.y + TP.EY, { size: 'xl', palette: 'blue', sound: true });
        }],
        [2.3, (b) => finish(b, { palette: 'blue', ripple: 600, credits: [50, 6], ring: '#bcd0ff' })],
      ],
      tick(b, dt, t) {
        const d = b.data;
        b.y = d.dieY + t * 14;
        tpAnimate(b, dt);
        damageFx(b, dt, TP.DMG);
        if (t > 1.85) d.collapse = Math.min(1, (t - 1.85) / 0.45);
        if (Math.random() < dt * 5) {
          const p = TP.DMG[(Math.random() * TP.DMG.length) | 0];
          SL.fx.explode(b.x + p[0], b.y + p[1], { size: 's', palette: 'blue', sound: false, shake: false });
        }
      },
    },
    art: [],
  });

  // ================================================================== HAILSTORM (GDD 8.6)
  const HS = {
    OUT: [[0, -138], [46, -138], [66, -133], [78, -123], [81, -112], [92, -108], [95, -92], [87, -85], [87, -60], [95, -55],
      [97, -37], [89, -31], [89, -6], [97, -1], [99, 17], [91, 23], [88, 40], [78, 50], [0, 50]],
    BANDS: [[-108, -86], [-55, -31], [-1, 23]],
    STRUT: [[84, -72], [124, -60], [150, -52], [152, -10], [124, -2], [84, 10]],
    CX: 140, CY: -30, MZ: 78,
    ENG: [[-44, -136, 28], [0, -140, 34], [44, -136, 28]],
    DR: { y0: 52, y1: 166, r0: 80, cy: 104 },
    NF: 8, FLUTES: 3, TURNS: 2.1, BASE_Y: 250,
    CIRCLES: [{ x: 0, y: -100, r: 62 }, { x: 0, y: -40, r: 78 }, { x: 0, y: 20, r: 72 }, { x: 0, y: 82, r: 54 }, { x: 0, y: 128, r: 30 },
      { x: -136, y: -30, r: 30 }, { x: 136, y: -30, r: 30 }],
    DMG: [[-60, -114], [-30, -72], [-70, -44], [-40, -2], [-64, 30], [56, -116], [30, -66], [68, -40], [36, 4], [62, 32],
      [-118, -40], [118, -24], [0, -104], [10, -24], [-14, 36], [44, -92]],
    VENTS: [[-88, -72], [88, -72], [-90, -18], [90, -18], [-62, 48], [62, 48], [-30, -134], [30, -134], [-150, -30], [150, -30]],
    ICE: [[-70, -122, 20, 8], [-84, -98, 12, 9], [-54, -46, 16, 7], [-86, -44, 11, 10], [-48, 8, 14, 6], [-90, 12, 10, 10],
      [-18, -112, 10, 6], [-118, -58, 16, 6], [-132, -48, 12, 8], [-62, 40, 15, 6], [70, -124, 12, 5], [84, -46, 8, 7],
      [56, -12, 10, 5], [126, -54, 12, 5], [146, -46, 8, 5], [20, -42, 8, 5], [-34, -128, 9, 4]],
  };
  const HSK = 'boss:hst:';
  let hsRowCanvas = null;
  function hsRow() {
    if (hsRowCanvas) return hsRowCanvas;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 1;
    const g2 = c.getContext('2d');
    const g = g2.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, '#262b37'); g.addColorStop(0.1, '#7e889e'); g.addColorStop(0.2, '#e9eff8'); g.addColorStop(0.28, '#b4bdd0');
    g.addColorStop(0.55, '#6e778c'); g.addColorStop(0.84, '#2e3341'); g.addColorStop(1, '#14171f');
    g2.fillStyle = g;
    g2.fillRect(0, 0, 256, 1);
    hsRowCanvas = c;
    return c;
  }
  let iceNoiseCanvas = null;
  function iceNoise() {
    return iceNoiseCanvas || (iceNoiseCanvas = A.noiseCanvas(96, 96, {
      scale: 16, octaves: 4, seed: 77, gain: 0.55,
      palette: [[0, '#5d84a3', 0.55], [0.36, '#7fa3bf', 0], [0.62, '#ffffff', 0], [1, '#ffffff', 0.75]],
    }));
  }
  /** Ice crust patch: translucent bluish ice with mottled frost, facets, a lit upper-left rim and one glint. */
  function icePatch(ctx, x, y, rx, ry, rng) {
    const n = 12, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.next() * 0.3, k = 0.62 + rng.next() * 0.5;
      pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
    }
    const p = poly(pts);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(8,16,28,0.4)';
    ctx.lineWidth = 1.6;
    ctx.translate(0.8, 1.2);
    ctx.stroke(p);
    ctx.restore();
    ctx.save();
    const g = ctx.createLinearGradient(x - rx, y - ry, x + rx * 0.8, y + ry);
    g.addColorStop(0, 'rgba(218,238,252,0.7)');
    g.addColorStop(0.5, 'rgba(150,192,222,0.52)');
    g.addColorStop(1, 'rgba(84,124,162,0.46)');
    ctx.fillStyle = g;
    ctx.fill(p);
    ctx.clip(p);
    ctx.globalAlpha = 0.45;
    ctx.drawImage(iceNoise(), x - rx, y - ry, rx * 2, ry * 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(235,246,255,0.32)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 3; i++) {
      const a = rng.next() * TAU;
      ctx.beginPath();
      ctx.moveTo(x + (rng.next() - 0.5) * rx * 0.5, y + (rng.next() - 0.5) * ry * 0.5);
      ctx.lineTo(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    const rim = ctx.createLinearGradient(x - rx, y - ry, x + rx * 0.4, y + ry * 0.4);
    rim.addColorStop(0, 'rgba(255,255,255,0.85)');
    rim.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1;
    ctx.stroke(p);
    if (rx > 9) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const gx = x - rx * 0.3 + rng.next() * rx * 0.2, gy = y - ry * 0.35 + rng.next() * ry * 0.2;
      ctx.fillRect(gx - 2, gy - 0.35, 4, 0.7);
      ctx.fillRect(gx - 0.35, gy - 2, 0.7, 4);
    }
    ctx.restore();
  }
  /** Frost coat: patchy rime over everything drawn so far, heaviest on the lit (left) side and the rear. */
  function frostCoat(ctx, B, seed) {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 190;
    const g2 = c.getContext('2d');
    g2.drawImage(A.noiseCanvas(200, 190, {
      scale: 26, octaves: 5, seed, gain: 0.58,
      palette: [[0, '#cfe6f5', 0], [0.52, '#cfe6f5', 0], [0.68, '#dcefff', 0.5], [0.85, '#eef8ff', 0.8], [1, '#ffffff', 0.92]],
    }), 0, 0);
    g2.globalCompositeOperation = 'destination-in';
    const m = g2.createLinearGradient(0, 0, 200, 0);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.3, 'rgba(0,0,0,0.55)'); m.addColorStop(0.6, 'rgba(0,0,0,0.18)'); m.addColorStop(1, 'rgba(0,0,0,0.3)');
    g2.fillStyle = m;
    g2.fillRect(0, 0, 200, 190);
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(c, B.x, B.y, B.w, B.h);
    ctx.restore();
  }
  function icicles(ctx, x0, x1, y, rng, len) {
    ctx.save();
    for (let x = x0 + rng.next() * 4; x < x1; x += 6 + rng.next() * 9) {
      const l = len * (0.35 + rng.next() * 0.9), w = 1.2 + rng.next() * 1.6;
      const p = poly([[x - w, y], [x + w, y], [x + (rng.next() - 0.5) * 1.5, y + l]]);
      ctx.fillStyle = 'rgba(176,212,238,0.55)';
      ctx.fill(p);
      ctx.strokeStyle = 'rgba(240,250,255,0.5)';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x + (rng.next() - 0.5), y + l); ctx.stroke();
    }
    ctx.restore();
  }
  /** One frame of the spinning drill cone: per-row cylinder shading, three helical flutes, toothed collar. */
  function hsDrawDrill(ctx, ph) {
    const D = HS.DR, L = D.y1 - D.y0;
    const cone = poly([[-D.r0, D.y0], [D.r0, D.y0], [0, D.y1]]);
    shadowUnder(ctx, cone, 5, 8, 9, 0.6);
    ctx.save();
    ctx.clip(cone);
    const row = hsRow();
    for (let y = D.y0; y < D.y1; y += 1) {
      const r = D.r0 * (1 - (y - D.y0) / L) + 1;
      ctx.drawImage(row, -r, y, 2 * r, 1.3);
    }
    const sh = ctx.createLinearGradient(0, D.y0, 0, D.y0 + 18);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(-D.r0, D.y0, D.r0 * 2, 18);
    ctx.lineCap = 'round';
    for (let k = 0; k < HS.FLUTES; k++) {
      let prev = null;
      for (let i = 0; i <= 140; i++) {
        const u = i / 140;
        const th = TAU * (HS.TURNS * u + (k + ph) / HS.FLUTES);
        const r = D.r0 * (1 - u), z = Math.sin(th);
        const pt = { x: r * Math.cos(th), y: D.y0 + u * L, z, r };
        if (prev && prev.z > -0.15 && z > -0.15) {
          const zz = Math.max(0, (prev.z + z) / 2);
          const wd = 1 + 6 * (1 - u) * (0.3 + 0.7 * zz);
          ctx.strokeStyle = 'rgba(8,10,16,' + (0.5 + 0.42 * zz).toFixed(3) + ')';
          ctx.lineWidth = wd;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
          const lit = clamp(0.5 - (pt.x / Math.max(1, r)) * 0.5, 0, 1);
          ctx.strokeStyle = 'rgba(242,247,255,' + (0.18 + 0.62 * zz * (0.35 + 0.65 * lit)).toFixed(3) + ')';
          ctx.lineWidth = Math.max(0.6, wd * 0.3);
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y - wd * 0.55); ctx.lineTo(pt.x, pt.y - wd * 0.55); ctx.stroke();
          if (i % 9 === 4 && zz > 0.35 && u < 0.85) {
            ctx.fillStyle = 'rgba(214,236,250,0.75)';
            ctx.beginPath(); ctx.arc(pt.x + 2, pt.y + wd * 0.2, 1.2 + 1.6 * (1 - u), 0, TAU); ctx.fill();
          }
        }
        prev = pt;
      }
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(4,5,9,0.9)';
    ctx.lineWidth = 1.4;
    ctx.stroke(cone);
    ctx.strokeStyle = 'rgba(220,232,250,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-D.r0 + 2, D.y0 + 2); ctx.lineTo(-1, D.y1 - 4); ctx.stroke();
    ctx.restore();
    // hardened tip
    const tip = poly([[-7, D.y1 - 20], [7, D.y1 - 20], [0, D.y1 + 2]]);
    A.metal(ctx, tip, { base: '#59627a', spec: 0.8, bounds: bb(-7, D.y1 - 20, 14, 22), edge: 0.8 });
    // toothed collar
    const col = rrect(-88, 38, 176, 18, 6);
    cylinder(ctx, col, -88, 88, '#4b5269');
    ctx.save();
    ctx.clip(col);
    for (let j = 0; j < 12; j++) {
      const th = TAU * (j / 12 + ph / (HS.FLUTES * 4)), z = Math.sin(th);
      if (z < 0.05) continue;
      rivets(ctx, [[Math.cos(th) * 82, 47]], 1 + z * 0.6);
    }
    ctx.restore();
    for (let j = 0; j < 18; j++) {
      const th = TAU * (j / 18 + ph / HS.FLUTES), z = Math.sin(th);
      if (z < 0.08) continue;
      const tx = Math.cos(th) * 84, tw = 4.5 * z + 1;
      const p = poly([[tx - tw, 55], [tx + tw, 55], [tx + tw * 0.4, 63], [tx - tw * 0.4, 63]]);
      ctx.fillStyle = C.mix('#5c657c', '#dfe7f4', z * 0.8);
      ctx.fill(p);
      ctx.strokeStyle = 'rgba(5,6,10,0.85)';
      ctx.lineWidth = 0.8;
      ctx.stroke(p);
    }
  }
  function defineHailstormArt() {
    const K = HSK;
    const B = bb(-160, -150, 320, 300);
    A.define(K + 'hull', 320, 300, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const rng = SL.makeRng(8611);
      // side struts and cannon mounts
      for (const s of SIDES) {
        const st = poly(HS.STRUT, s);
        shadowUnder(ctx, st, 4, 7, 8, 0.6);
        A.metal(ctx, st, { base: '#2b3042', spec: 0.45, specPos: 0.3, bounds: B, edge: 2 });
        ctx.save();
        ctx.clip(st);
        A.panelLines(ctx, pline([[100 * s, -70], [100 * s, 10]]), '#000', 0.6);
        A.panelLines(ctx, pline([[126 * s, -62], [126 * s, -2]]), '#000', 0.5);
        vents(ctx, 112 * s, -30, 3, 3.5, 20, 7, 0);
        grime(ctx, B, 31, 0.4);
        ctx.restore();
        A.emissive(ctx, pline([[88 * s, -68], [148 * s, -51]]), PAL.seam, 5, { stroke: 1.1 });
        A.emissive(ctx, pline([[88 * s, 6], [148 * s, -11]]), PAL.seam, 5, { stroke: 1.1 });
        const mx = HS.CX * s, my = HS.CY;
        shadowUnder(ctx, circle(mx, my, 31), 3, 5, 7, 0.6);
        A.metal(ctx, ringPath(mx, my, 21, 31), { base: '#454c63', spec: 0.6, bounds: bb(mx - 31, my - 31, 62, 62), edge: 1.3 });
        const g = ctx.createRadialGradient(mx - 5, my - 5, 2, mx, my, 21);
        g.addColorStop(0, '#1d2030'); g.addColorStop(1, '#06070b');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(mx, my, 21, 0, TAU); ctx.fill();
        const bolts = [];
        for (let i = 0; i < 12; i++) bolts.push([mx + Math.cos((i / 12) * TAU) * 26, my + Math.sin((i / 12) * TAU) * 26]);
        rivets(ctx, bolts, 1.1);
      }
      // the drum: a nose-down cylinder seen from above
      const drum = A.symPath(0, HS.OUT);
      shadowUnder(ctx, drum, 8, 12, 16, 0.72);
      A.metal(ctx, drum, { base: '#262b3c', spec: 0.34, specPos: 0.24, bounds: bb(-99, -138, 198, 188), edge: 2.4, rimLight: 2.4 });
      ctx.save();
      ctx.clip(drum);
      roundness(ctx, -99, 99, -140, 52);
      grime(ctx, B, 17, 0.5);
      // alternating plate tones
      for (const s of SIDES) tint(ctx, rrect(s < 0 ? -64 : 32, -132, 32, 178, 2), '#000000', 0.12);
      for (const yy of [-124, -70, -16, 36]) A.panelLines(ctx, pline([[-99, yy], [99, yy]]), '#000', 0.55);
      for (const s of SIDES) {
        A.panelLines(ctx, pline([[32 * s, -138], [32 * s, 50]]), '#000', 0.5);
        A.panelLines(ctx, pline([[64 * s, -132], [64 * s, 46]]), '#000', 0.4);
        vents(ctx, 48 * s, -78, 3, 3, 10, 6, 0);
        vents(ctx, 48 * s, -22, 3, 3, 10, 6, 0);
      }
      ctx.restore();
      // armour bands
      HS.BANDS.forEach(([y0, y1], bi) => {
        const band = rrect(-98, y0, 196, y1 - y0, 6);
        shadowUnder(ctx, band, 2, 4, 5, 0.55);
        A.metal(ctx, band, { base: '#363c52', spec: 0.5, specPos: 0.22, bounds: bb(-98, y0, 196, y1 - y0), edge: 1.6, rimLight: 2 });
        ctx.save();
        ctx.clip(band);
        roundness(ctx, -98, 98, y0, y1);
        grime(ctx, B, 41 + bi, 0.3);
        A.panelLines(ctx, pline([[-98, y0 + 6], [98, y0 + 6]]), '#000', 0.35);
        for (let i = -3; i <= 3; i++) A.panelLines(ctx, pline([[i * 28, y0], [i * 28, y1]]), '#000', 0.45);
        ctx.restore();
        rivets(ctx, along(-90, (y0 + y1) / 2 + 2, 90, (y0 + y1) / 2 + 2, 13, 0.02), 1.15);
        A.emissive(ctx, pline([[-92, y1 - 1.5], [92, y1 - 1.5]]), PAL.seam, 5, { stroke: 1.1 });
      });
      // raised spine with the cryo window
      const spine = rrect(-24, -134, 48, 164, 10);
      shadowUnder(ctx, spine, 3, 5, 7, 0.6);
      A.metal(ctx, spine, { base: '#3c4258', spec: 0.6, specPos: 0.28, bounds: bb(-24, -134, 48, 164), edge: 1.6 });
      ctx.save();
      ctx.clip(spine);
      for (const yy of [-102, -46, 8]) A.panelLines(ctx, pline([[-24, yy], [24, yy]]), '#000', 0.6);
      vents(ctx, 0, -118, 4, 3.4, 9, 8, 0);
      vents(ctx, 0, 18, 4, 3.4, 9, 8, 0);
      ctx.restore();
      const win = rrect(-14, -88, 28, 34, 7);
      ctx.fillStyle = '#04060a';
      ctx.fill(win);
      const wg = ctx.createLinearGradient(0, -88, 0, -54);
      wg.addColorStop(0, 'rgba(150,210,250,0.18)'); wg.addColorStop(0.5, 'rgba(186,232,255,0.6)'); wg.addColorStop(1, 'rgba(110,180,236,0.22)');
      ctx.fillStyle = wg;
      ctx.fill(win);
      ctx.save();
      ctx.clip(win);
      ctx.strokeStyle = 'rgba(10,20,34,0.8)';
      ctx.lineWidth = 2;
      for (const yy of [-78, -71, -64]) { ctx.beginPath(); ctx.moveTo(-14, yy); ctx.lineTo(14, yy); ctx.stroke(); }
      ctx.restore();
      A.metal(ctx, (() => { const p = rrect(-17, -91, 34, 40, 9); p.addPath(rrect(-14, -88, 28, 34, 7)); return p; })(), { base: '#555d76', spec: 0.6, bounds: bb(-17, -91, 34, 40), edge: 1 });
      // engine housings on the rear cap
      for (const [ex, ey, ew] of HS.ENG) {
        const nac = rrect(ex - ew / 2, ey, ew, 30, 8);
        shadowUnder(ctx, nac, 3, 5, 7, 0.6);
        cylinder(ctx, nac, ex - ew / 2, ex + ew / 2, '#3b4157');
        A.panelLines(ctx, pline([[ex - ew / 2 + 2, ey + 16], [ex + ew / 2 - 2, ey + 16]]), '#000', 0.7);
        const ng = ctx.createRadialGradient(ex, ey + 2, 1, ex, ey + 2, ew * 0.45);
        ng.addColorStop(0, '#ffe2b0'); ng.addColorStop(0.45, '#ff7a3d'); ng.addColorStop(1, '#3a1208');
        ctx.fillStyle = ng;
        ctx.beginPath(); ctx.ellipse(ex, ey + 2, ew * 0.42, 5, 0, 0, TAU); ctx.fill();
      }
      lights(ctx, [[-92, -97], [92, -97], [-94, -43], [94, -43], [-96, 11], [96, 11]], '#ff5c8a', 1.8);
      // rime along the lit edge, ice crust, icicles
      ctx.save();
      ctx.strokeStyle = 'rgba(220,240,252,0.55)';
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.stroke(pline(HS.OUT.slice(4, 16).map(([px, py]) => [-px + 1.5, py])));
      ctx.restore();
      frostCoat(ctx, B, 4401);
      for (const [ix, iy, rx, ry] of HS.ICE) icePatch(ctx, ix, iy, rx * 0.85, ry * 0.85, rng);
      for (const [, y1] of HS.BANDS) { icicles(ctx, -95, -52, y1, rng, 9); icicles(ctx, 66, 90, y1, rng, 5); }
      icicles(ctx, -150, -128, -10, rng, 8);
    }, { pad: 12, res: 1.25 });
    for (let f = 0; f < HS.NF; f++) {
      A.define(K + 'drill' + f, 180, 136, (ctx, w, h) => { ctx.translate(w / 2, h / 2 - HS.DR.cy); hsDrawDrill(ctx, f / HS.NF); }, { pad: 6, res: 1.25 });
    }
    A.define(K + 'drillCrack', 180, 136, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2 - HS.DR.cy);
      const rng = SL.makeRng(919);
      for (let i = 0; i < 10; i++) {
        const u = 0.1 + rng.next() * 0.7, y = HS.DR.y0 + u * (HS.DR.y1 - HS.DR.y0), r = HS.DR.r0 * (1 - u);
        crack(ctx, (rng.next() - 0.5) * r * 1.4, y, 18 + rng.next() * 26, rng.next() * TAU, rng, true, '#9fdcff');
      }
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fill(poly([[-HS.DR.r0, HS.DR.y0], [HS.DR.r0, HS.DR.y0], [0, HS.DR.y1]]));
    }, { pad: 6, res: 1 });
    A.define(K + 'cgun', 160, 60, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      // drawn pointing +x; lit for its usual downward aim (light from local -x / +y)
      const br = rrect(-12, -15, 36, 30, 6);
      A.metal(ctx, br, { base: '#3c4258', spec: 0.55, bounds: bb(-12, -15, 36, 30), edge: 1.4 });
      const bar = rrect(18, -8, 50, 16, 4);
      const g = ctx.createLinearGradient(0, 8, 0, -8);
      g.addColorStop(0, '#9aa5bb'); g.addColorStop(0.3, '#e1e8f3'); g.addColorStop(0.55, '#5d667a'); g.addColorStop(1, '#1d212c');
      ctx.fillStyle = g;
      ctx.fill(bar);
      ctx.strokeStyle = 'rgba(4,5,9,0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke(bar);
      for (const cx of [30, 42, 54]) {
        ctx.fillStyle = '#1c2434';
        ctx.fill(rrect(cx - 3, -10, 6, 20, 2));
        A.emissive(ctx, rrect(cx - 1.4, -9, 2.8, 18, 1.4), '#cfe9ff', 4);
      }
      const mz = poly([[64, -11], [76, -13], [79, 13], [64, 11]]);
      A.metal(ctx, mz, { base: '#4a5168', spec: 0.6, bounds: bb(64, -13, 15, 26), edge: 1 });
      ctx.fillStyle = '#05060a';
      ctx.beginPath(); ctx.ellipse(78, 0, 2.6, 7.5, 0, 0, TAU); ctx.fill();
      icePatch(ctx, 4, 8, 10, 5, SL.makeRng(55));
      icePatch(ctx, 70, 9, 5, 3, SL.makeRng(56));
    }, { pad: 4, res: 1.5 });
    A.define(K + 'cdome', 50, 50, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      dome(ctx, 0, 0, 17, '#4a5168');
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.stroke();
      ctx.restore();
      icePatch(ctx, -6, -7, 9, 6, SL.makeRng(57));
      A.emissive(ctx, circle(5, 5, 2.4), '#ff4f7f', 6);
    }, { pad: 4, res: 1.5 });
    for (const lv of [1, 2]) {
      A.define(K + 'dmg' + lv, 320, 300, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        damageOverlay(ctx, A.symPath(0, HS.OUT), HS.DMG, lv, 1300 + lv, '#9fdcff');
      }, { pad: 12, res: 1 });
    }
    const keys = ['hull', 'drillCrack', 'cgun', 'cdome', 'dmg1', 'dmg2'];
    for (let f = 0; f < HS.NF; f++) keys.push('drill' + f);
    ART.mb_hailstorm = keys.map((k) => K + k);
  }

  // ---------------------------------------------------------------- HAILSTORM behavior
  function hsCan(b, s) { return b.data.can[s < 0 ? 0 : 1]; }
  function hsClampAim(a) { return PI / 2 + clamp(U.angleDiff(PI / 2, a), -0.95, 0.95); }
  function hsAnimate(b, dt) {
    const d = b.data;
    d.spinRate = approach(d.spinRate, d.spinWant, 2.5, dt);
    d.drillPh = (d.drillPh + Math.min(d.spinRate, 7.2) * dt) % 1;
    if (!d.tele && d.tipGlow > 0) d.tipGlow = Math.max(0, d.tipGlow - dt * 2.5);
    if (d.crackWant) d.crack = Math.min(1, d.crack + dt * 5);
    for (const s of SIDES) {
      const c = hsCan(b, s);
      if (c.gone) continue;
      const cx = b.x + HS.CX * s, cy = b.y + HS.CY;
      const t = c.tgt && !c.tgt.dead ? c.tgt : target({ x: cx, y: cy });
      const want = b.dying ? PI / 2 + 0.6 * s : hsClampAim(Math.atan2(t.y - cy, t.x - cx));
      c.ang += clamp(U.angleDiff(c.ang, want), -2.4 * dt, 2.4 * dt);
      if (c.charge > 0) c.charge -= dt;
      if (c.flash > 0) c.flash -= dt;
      if (c.recoil > 0) c.recoil = Math.max(0, c.recoil - dt * 7);
    }
    // frost venting from the seams (cosmetic)
    if ((d.ventT -= dt) <= 0) {
      d.ventT = (b.phase >= 1 ? 0.06 : 0.12) * crnd(0.7, 1.3);
      const v = HS.VENTS[(Math.random() * HS.VENTS.length) | 0];
      const s = v[0] < 0 ? -1 : 1;
      if (!(v[0] < 0 ? hsCan(b, -1).gone && Math.abs(v[0]) > 140 : hsCan(b, 1).gone && v[0] > 140)) {
        SL.fx.emit({ x: b.x + v[0], y: b.y + v[1], vx: s * crnd(30, 80), vy: crnd(-30, 25), life: crnd(0.7, 1.15), size: crnd(8, 12),
          size2: crnd(28, 44), color: '#dcefff', shape: 'smoke', alpha: 0.3, alpha2: 0, drag: 1.4 });
      }
    }
    const D = d.dash;
    if (D && D.st === 'dive') {
      SL.fx.sparks(b.x + crnd(-8, 8), b.y + HS.DR.y1 - 4, { count: 2, color: '#e6f6ff', speed: 340, angle: -PI / 2, spread: 2.4, life: 0.3, size: 4 });
      if (Math.random() < dt * 30) SL.fx.emit({ x: b.x + crnd(-30, 30), y: b.y + 60, vx: crnd(-60, 60), vy: -120, life: 0.8, size: 14, size2: 46, color: '#dcefff', shape: 'smoke', alpha: 0.35, alpha2: 0, drag: 1 });
    }
  }
  /** Ice cannon volley: 0.3 s muzzle charge, then an aimed fan of 5 shards (30% at the Lantern when it is on screen). */
  function hsCannon(b, s) {
    const c = hsCan(b, s);
    if (c.gone) return;
    const t = target({ x: b.x + HS.CX * s, y: b.y + HS.CY }, b);
    c.tgt = t.ref && !t.ref.dead ? t.ref : { x: t.x, y: t.y };
    c.charge = 0.3;
    sfx('enemy_charge', { x: b.x + HS.CX * s });
    later(b, 0.3, () => {
      if (c.gone) return;
      const cx = b.x + HS.CX * s, cy = b.y + HS.CY;
      const tg = c.tgt && !c.tgt.dead ? c.tgt : target({ x: cx, y: cy });
      const a = hsClampAim(Math.atan2(tg.y - cy, tg.x - cx));
      c.ang = a;
      const ox = HS.CX * s + Math.cos(a) * HS.MZ, oy = HS.CY + Math.sin(a) * HS.MZ;
      pFan(b, a, { ox, oy, count: 5, spread: 0.6, speed: 230, type: 'shard' });
      c.flash = 0.1; c.recoil = 1; c.tgt = null;
      SL.fx.sparks(b.x + ox, b.y + oy, { count: 8, color: '#dff3ff', speed: 260, angle: a, spread: 0.9, life: 0.25, size: 4 });
    });
  }
  /** Drill dash: 1.0 s red lane line and rising whine, a 600 px dive at 520 px/s, then the climb back. */
  function hsDashStart(b) {
    const d = b.data;
    const t = target(b);
    d.dash = { st: 'tele', t: 0, x: clamp(t.x, 120, W - 120), y0: HS.BASE_Y };
    d.tele = true;
    d.spinWant = 7.5;
    sfx('beam_charge', { x: b.x });
    d.dashWarn = warnMark(b, { fx: 'line', ox: 0, oy: HS.DR.y1, angle: PI / 2, length: 640, life: 1.0, color: '#ff3b4f', width: 2 });
  }
  function hsDashUpdate(b, dt) {
    const d = b.data, D = d.dash;
    if (!D) return false;
    D.t += dt;
    if (D.st === 'tele') {
      b.x = approach(b.x, D.x, 5, dt);
      b.y = approach(b.y, D.y0 - 14 * sm01(D.t), 4, dt);
      d.tipGlow = Math.min(1, D.t);
      if (D.t >= 1.0) {
        D.st = 'dive'; D.t = 0; d.tele = false;
        sfx('beam_fire', { x: b.x, vol: 0.7 });
        SL.fx.shake(5, 0.35);
      }
    } else if (D.st === 'dive') {
      b.y += 520 * dt;
      d.tipGlow = 1;
      if (b.y >= D.y0 + 600) { b.y = D.y0 + 600; D.st = 'climb'; D.t = 0; SL.fx.shake(4, 0.25); }
    } else {
      b.y -= (160 + 240 * sm01(D.t / 0.5)) * dt;
      if (b.y <= D.y0) { b.y = D.y0; d.dash = null; d.spinWant = d.spinBase; return false; }
    }
    return true;
  }
  function hsStorm(b) {
    const d = b.data;
    if (d.storm && !d.storm.dead) return;
    if (!SL.hazards || !SL.hazards.has || !SL.hazards.has('asteroid_storm')) return;
    try { d.storm = SL.spawnHazard('asteroid_storm', { variant: 'ice', density: 0.6, duration: 0 }); } catch (err) {
      U.warnOnce('bossesA:storm', '[bossesA] asteroid_storm spawn threw', err);
    }
  }
  function hsStormEnd(b) {
    const h = b.data.storm;
    b.data.storm = null;
    if (!h || h.dead) return;
    if (SL.hazards && typeof SL.hazards.end === 'function') SL.hazards.end(h); else h.dead = true;
  }
  function hsCannonBlast(b, s) {
    const c = hsCan(b, s);
    const x = b.x + HS.CX * s, y = b.y + HS.CY;
    chainBlast(b, x, y, 'l', 'enemy', true);
    debrisBurst(x, y, DEBRIS_ICE, 6, 360, 14, 14);
    debrisBurst(x, y, DEBRIS_GRAPHITE, 5, 300, 14, 14);
    c.gone = true;
  }
  function hsShatter(b) {
    const d = b.data, x = b.x, y = b.y + HS.DR.cy;
    d.drillGone = true;
    SL.fx.explode(x, y, { size: 'l', palette: 'blue', sound: true });
    for (let i = 0; i < 30; i++) {
      const a = crnd(0, TAU), sp = crnd(200, 620), s = crnd(14, 30);
      SL.fx.emit({ x: x + crnd(-40, 40), y: y + crnd(-30, 50), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: crnd(0.9, 1.7), size: s, size2: s * 0.7,
        shape: DEBRIS_ICE[i % DEBRIS_ICE.length], blend: 'normal', gravity: 260, rot: crnd(0, TAU), spin: crnd(-10, 10), alpha: 1, alpha2: 0, ease: true, drag: 0.4 });
    }
    SL.fx.sparks(x, y, { count: 50, color: '#e6f6ff', speed: 700, life: 0.6 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      SL.fx.emit({ x, y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 1.2, size: 30, size2: 90, color: '#dcefff', shape: 'smoke', alpha: 0.45, alpha2: 0, drag: 1.2 });
    }
    sfx('rock_break', { x });
  }
  function hsFrostRing(b) {
    const x = b.x, y = b.y;
    SL.fx.emit({ x, y, life: 0.9, size: 60, size2: 560, color: '#dff3ff', alpha: 0.9, alpha2: 0, shape: 'ring' });
    SL.fx.emit({ x, y, life: 1.2, size: 40, size2: 380, color: '#9fdcff', alpha: 0.7, alpha2: 0, shape: 'ring', delay: 0.12 });
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU, sp = crnd(260, 380);
      SL.fx.emit({ x: x + Math.cos(a) * 40, y: y + Math.sin(a) * 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: crnd(1.0, 1.5), size: 26, size2: 80,
        color: '#dcefff', shape: 'smoke', alpha: 0.4, alpha2: 0, drag: 1.6 });
    }
    SL.fx.flash('#e6f4ff', 0.5, 0.35);
  }
  function hsDraw(b, ctx) {
    const d = b.data, t = SL.time.t, K = HSK;
    const dy = b.dying;
    const x = b.x + (dy ? crnd(-4, 4) : 0), y = b.y + (dy ? crnd(-3, 3) : 0);
    if (y < -220) return;
    const hpF = b.hp / b.maxHp;
    const D = d.dash;
    const thrust = D && D.st === 'climb' ? 1.5 : D && D.st === 'dive' ? 0.55 : !b.introDone ? 1.25 : 1;
    for (let i = 0; i < 3; i++) {
      const [ex, ey, ew] = HS.ENG[i];
      const flick = dy && Math.random() < 0.3 ? 0.35 : 1;
      plume(ctx, x + ex, y + ey + 1, -PI / 2, ew * 0.8, (54 + 12 * Math.sin(t * 8 + i * 1.3)) * thrust * flick, '#ffffff', PAL.engine, t + i * 0.41);
      A.drawGlow(ctx, x + ex, y + ey, ew * 0.9, PAL.engine, 0.7 * flick);
    }
    // drill lane line (fallback when the patterns module's warning markers are missing)
    if (D && D.st === 'tele' && !d.dashWarn) {
      lineGlow(ctx, x, y + HS.DR.y1, PI / 2, 640, 3, '#ff3b4f', 0.45 * (0.6 + 0.4 * Math.sin(t * TAU * 6)));
    }
    A.drawSprite(ctx, K + 'hull', x, y);
    if (hpF < 0.8) A.drawSprite(ctx, K + 'dmg1', x, y, 0, 1, sm01((0.8 - hpF) / 0.3));
    if (hpF < 0.45) A.drawSprite(ctx, K + 'dmg2', x, y, 0, 1, sm01((0.45 - hpF) / 0.3));
    bossFlash(b, ctx, K + 'hull', x, y);
    if (hpF < 0.45) {
      for (let i = 0; i < HS.DMG.length; i += 2) {
        const p = HS.DMG[i];
        A.drawGlow(ctx, x + p[0], y + p[1], 14, '#9fdcff', (0.3 + 0.2 * Math.sin(t * 9 + i * 1.7)) * sm01((0.45 - hpF) / 0.3));
      }
    }
    // cryo window shimmer and blinking band lights
    A.drawGlow(ctx, x, y - 71, 20 + 3 * Math.sin(t * 3), '#9fdcff', 0.28 + 0.1 * Math.sin(t * 5.3));
    const blink = (t * 1.6) % 1 < 0.5 ? 1 : 0.25;
    for (const [, y1] of HS.BANDS) { A.drawGlow(ctx, x - 92, y + y1 - 12, 10, '#ff4f7f', 0.7 * blink); A.drawGlow(ctx, x + 92, y + y1 - 12, 10, '#ff4f7f', 0.7 * (1.25 - blink)); }
    // the drill
    if (!d.drillGone) {
      const f = Math.min(HS.NF - 1, (d.drillPh * HS.NF) | 0);
      const dk = K + 'drill' + f;
      const jit = d.spinRate > 5 ? crnd(-0.8, 0.8) : 0;
      A.drawSprite(ctx, dk, x + jit, y + HS.DR.cy);
      if (b.flash > 0) A.drawFlash(ctx, dk, x, y + HS.DR.cy, 0, 1, Math.min(1, b.flash / 0.06) * 0.2);
      if (d.crack > 0) A.drawSprite(ctx, K + 'drillCrack', x, y + HS.DR.cy, 0, 1, d.crack);
      if (d.spinRate > 4.5) {
        const k = clamp((d.spinRate - 4.5) / 3, 0, 1);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const u = 0.15 + i * 0.25 + 0.06 * Math.sin(t * 40 + i), r = HS.DR.r0 * (1 - u);
          lineGlow(ctx, x - r * 0.55, y + HS.DR.y0 + u * (HS.DR.y1 - HS.DR.y0), 0, r * 0.9, 3, '#dfeaff', 0.22 * k);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      if (d.tipGlow > 0) {
        const k = d.tipGlow, fl = 0.8 + 0.2 * Math.sin(t * 50);
        A.drawGlow(ctx, x, y + HS.DR.y1 - 4, 22 + 22 * k, '#ff6a7a', 0.55 * k * fl);
        A.drawGlow(ctx, x, y + HS.DR.y1 - 4, 10 + 8 * k, '#fff0f0', 0.8 * k * fl);
      }
    }
    // ice cannons
    for (const s of SIDES) {
      const c = hsCan(b, s);
      const px = x + HS.CX * s, py = y + HS.CY;
      if (c.gone) { A.drawGlow(ctx, px + 3, py + 3, 24, '#ff7a2f', 0.42 + 0.2 * Math.sin(t * 11 + s)); continue; }
      const a = c.ang, rc = c.recoil * 6;
      A.drawSprite(ctx, K + 'cgun', px - Math.cos(a) * rc, py - Math.sin(a) * rc, a);
      const mx = px + Math.cos(a) * HS.MZ, my = py + Math.sin(a) * HS.MZ;
      A.drawGlow(ctx, px + Math.cos(a) * 42, py + Math.sin(a) * 42, 26, '#9fdcff', 0.16 + 0.08 * Math.sin(t * 6 + s));
      if (c.charge > 0) {
        const k = 1 - c.charge / 0.3;
        A.drawGlow(ctx, mx, my, 12 + 16 * k, '#ff9a5c', 0.4 + 0.6 * k);
        A.drawGlow(ctx, mx, my, 5 + 6 * k, '#fff3e0', 0.85 * k);
      }
      if (c.flash > 0) A.drawGlow(ctx, mx, my, 34, '#ffd2b0', c.flash / 0.1);
      A.drawSprite(ctx, K + 'cdome', px, py);
      if (b.flash > 0) A.drawFlash(ctx, K + 'cdome', px, py, 0, 1, Math.min(1, b.flash / 0.06) * 0.2);
    }
  }

  defineBoss('mb_hailstorm', {
    name: 'HAILSTORM', title: 'Ice Drill Ship', hp: 4000, r: 150, score: 25000, parTime: 60, size: [360, 300],
    credits: [25, 3], palette: 'blue', debris: DEBRIS_ICE,
    init(b) {
      const d = b.data;
      b.x = W / 2; b.y = -220;
      b.circles = HS.CIRCLES.map((c) => ({ x: c.x, y: c.y, r: c.r }));
      d.lanternBias = 0.3;
      d.can = SIDES.map(() => ({ ang: PI / 2, charge: 0, flash: 0, recoil: 0, tgt: null, gone: false }));
      d.spinRate = 0; d.spinWant = 2; d.spinBase = 2; d.drillPh = 0; d.tipGlow = 0; d.tele = false;
      d.dash = null; d.dashWarn = null; d.storm = null; d.ventT = 0; d.crack = 0; d.crackWant = 0; d.drillGone = false; d.dt = 1 / 60;
      d.swayT = 0;
    },
    intro(b, dt) {
      const d = b.data, t = d.at;
      d.dt = dt;
      b.x = W / 2;
      b.y = lerp(-220, HS.BASE_Y, SL.ease.outCubic(clamp((t - 0.2) / 2.8, 0, 1)));
      d.spinWant = t < 2.6 ? 2 + t * 2.2 : 2;
      if (!d.introFx && t >= 2.9) {
        d.introFx = true;
        sfx('boss_roar', { x: b.x });
        SL.fx.shake(6, 0.5);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          SL.fx.emit({ x: b.x + Math.cos(a) * 60, y: b.y + Math.sin(a) * 50, vx: Math.cos(a) * 220, vy: Math.sin(a) * 160, life: 1.1, size: 24, size2: 70,
            color: '#dcefff', shape: 'smoke', alpha: 0.4, alpha2: 0, drag: 1.5 });
        }
        SL.fx.emit({ x: b.x, y: b.y, life: 0.7, size: 60, size2: 360, color: '#dff3ff', alpha: 0.7, alpha2: 0, shape: 'ring' });
      }
      hsAnimate(b, dt);
      return t >= 3.6;
    },
    update(b, dt) {
      const d = b.data;
      d.dt = dt;
      if (!hsDashUpdate(b, dt)) {
        const amp = b.phase === 0 ? 100 : 140, per = b.phase === 0 ? 9 : 12;
        d.swayT += dt;
        b.x = approach(b.x, W / 2 + amp * Math.sin((TAU * d.swayT) / per), 2.2, dt);
        b.y = approach(b.y, HS.BASE_Y + Math.sin(b.fightT * 1.4) * 6, 2.5, dt);
      }
      if (d.dashWarn && (d.dashWarn.dead || !d.dash || d.dash.st !== 'tele')) { if (!d.dashWarn.dead) d.dashWarn.dead = true; d.dashWarn = null; }
      hsAnimate(b, dt);
      damageFx(b, dt, HS.DMG);
    },
    phases: [
      {
        at: 1.0, name: 'Drill',
        enter(b, S) { S.canT = 1.0; S.side = 0; S.ringT = 2.0; S.dashT = 3.4; },
        update(b, dt, S) {
          const d = b.data, busy = !!d.dash && d.dash.st !== 'tele';
          if (busy) { S.canT = Math.max(S.canT, 0.5); S.ringT = Math.max(S.ringT, 1.0); }
          if ((S.canT -= dt) <= 0) { S.canT = 1.5; S.side ^= 1; hsCannon(b, S.side ? 1 : -1); }
          if ((S.ringT -= dt) <= 0) { S.ringT = 3; pRing(b, { oy: 10, count: 14, speed: 160, type: 'orb', offset: grnd(0, TAU) }); }
          if (!d.dash && (S.dashT -= dt) <= 0) { S.dashT = 7.5; hsDashStart(b); }
        },
      },
      {
        at: 0.5, name: 'Blizzard',
        enter(b, S) {
          const d = b.data;
          if (d.dash) { d.dash.st = 'climb'; d.dash.t = 0; }
          d.tele = false;
          d.spinBase = 3.4; d.spinWant = 3.4;
          S.stormT = 1.0; S.sp = {}; S.splitT = 1.6;
        },
        update(b, dt, S) {
          const d = b.data;
          if (S.stormT > 0 && (S.stormT -= dt) <= 0) hsStorm(b);
          if (d.dash) return;
          if (d.pt >= 1.0) pSpiral(S.sp, b, dt, { oy: 60, radius: 50, arms: 2, rate: 9, speed: 170, spin: 1.4, on: 2.0, off: 1.2, type: 'orb' });
          if ((S.splitT -= dt) <= 0) {
            S.splitT = 4;
            d.tipGlow = 1;
            pSplit(b, { oy: HS.DR.y1 - 6, type: 'orb_huge', count: 3, spread: 0.9, speed: 120, at: 1.0, split: { count: 8, type: 'shard', speed: 180 }, bias: b });
          }
        },
      },
    ],
    draw: hsDraw,
    death: {
      start(b) {
        const d = b.data;
        hsStormEnd(b);
        d.dieY = b.y; d.dash = null; d.tele = false; d.spinWant = 0.5;
        if (d.dashWarn && !d.dashWarn.dead) d.dashWarn.dead = true;
        d.dashWarn = null;
      },
      steps: [
        [0.0, () => { SL.fx.shake(10, 2.2); }],
        ...[0, 1, 2, 3, 4].map((i) => [0.08 + i * 0.22, (b) => { const p = HS.DMG[(i * 3) % HS.DMG.length]; chainBlast(b, b.x + p[0], b.y + p[1], 'm', 'enemy', i % 2 === 0); }]),
        [0.55, (b) => hsCannonBlast(b, -1)],
        [0.85, (b) => hsCannonBlast(b, 1)],
        [1.15, (b) => {
          b.data.crackWant = 1;
          sfx('rock_break', { x: b.x });
          SL.fx.sparks(b.x, b.y + HS.DR.cy, { count: 24, color: '#dff3ff', speed: 420, life: 0.4 });
        }],
        [1.55, (b) => hsShatter(b)],
        [1.9, (b) => { hsFrostRing(b); finish(b, { size: 'xl', palette: 'blue', ripple: 480, credits: [25, 3], ring: '#dff3ff' }); }],
      ],
      tick(b, dt, t) {
        const d = b.data;
        b.y = d.dieY + t * 12;
        hsAnimate(b, dt);
        damageFx(b, dt, HS.DMG);
        if (Math.random() < dt * 5) {
          const p = HS.DMG[(Math.random() * HS.DMG.length) | 0];
          SL.fx.explode(b.x + p[0], b.y + p[1], { size: 's', sound: false, shake: false });
        }
      },
    },
    art: [],
  });

  // ================================================================== TETHER (GDD 8.7)
  const TT = {
    OUT: [[0, -114], [56, -116], [98, -104], [126, -82], [140, -50], [143, -10], [135, 24], [117, 48], [88, 64], [52, 72], [0, 74]],
    DECK: [[0, -102], [46, -102], [80, -90], [98, -62], [102, -24], [92, 10], [66, 34], [0, 44]],
    ENG: [[-92, -112, 48], [92, -112, 48]],
    CORE: { x: 0, y: -28, r: 30 },
    SH: [102, 46], EL: [150, 100], WR: [116, 146],
    LAUNCH: [[-140, -58], [140, -58], [-126, 22], [126, 22]],
    LZ: 36, BASE_Y: 330, REEL_Y: 300,
    CIRCLES: [{ x: 0, y: -76, r: 48 }, { x: -80, y: -64, r: 44 }, { x: 80, y: -64, r: 44 }, { x: 0, y: -14, r: 62 }, { x: -104, y: -4, r: 42 },
      { x: 104, y: -4, r: 42 }, { x: 0, y: 50, r: 38 }, { x: -138, y: 96, r: 24 }, { x: 138, y: 96, r: 24 }, { x: -96, y: 156, r: 22 }, { x: 96, y: 156, r: 22 }],
    DMG: [[-110, -70], [-76, -94], [-40, -60], [-120, -6], [-90, 30], [-46, 20], [-24, 56], [110, -74], [70, -96], [44, -56], [118, -14],
      [92, 32], [40, 14], [26, 58], [0, -96], [-62, -24], [62, -26]],
    EYE: { x: 360, y: -60 },
    CHUNK_K: 2.5,
  };
  const TTK = 'boss:tth:';
  const TT_PTS = new Float32Array(32);
  function ttArmPoly(s) {
    const [sx, sy] = TT.SH, [ex, ey] = TT.EL, [wx, wy] = TT.WR;
    const seg = (ax, ay, bx, by, w0, w1) => {
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
      return [[ax + nx * w0, ay + ny * w0], [bx + nx * w1, by + ny * w1], [bx - nx * w1, by - ny * w1], [ax - nx * w0, ay - ny * w0]];
    };
    return { upper: poly(seg(sx, sy, ex, ey, 16, 13), s), fore: poly(seg(ex, ey, wx, wy, 13, 11), s), foreSeg: [ex, ey, wx, wy] };
  }
  /** Claw finger in wrist-local coordinates (pivot at the wrist), right side; mirrored with s. */
  const TT_FINGER = [[8, -10], [2, 4], [-14, 18], [-34, 30], [-56, 38], [-70, 40], [-60, 30], [-44, 18], [-30, 4], [-16, -8], [-4, -16]];
  function defineTetherArt() {
    const K = TTK;
    const B = bb(-190, -160, 380, 320);
    A.define(K + 'hull', 300, 210, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2 + 20);
      const rng = SL.makeRng(5150);
      const hull = A.symPath(0, TT.OUT);
      // engine pods (under the hull's rear corners)
      for (const [ex, ey, ew] of TT.ENG) {
        const pod = rrect(ex - ew / 2, ey - 14, ew, 66, 14);
        shadowUnder(ctx, pod, 4, 7, 9, 0.65);
        cylinder(ctx, pod, ex - ew / 2, ex + ew / 2, '#3a4056');
        for (const yy of [ey + 8, ey + 26]) A.panelLines(ctx, pline([[ex - ew / 2 + 2, yy], [ex + ew / 2 - 2, yy]]), '#000', 0.7);
        const ng = ctx.createRadialGradient(ex, ey - 12, 1, ex, ey - 12, ew * 0.46);
        ng.addColorStop(0, '#ffe2b0'); ng.addColorStop(0.45, '#ff7a3d'); ng.addColorStop(1, '#3a1208');
        ctx.fillStyle = ng;
        ctx.beginPath(); ctx.ellipse(ex, ey - 12, ew * 0.42, 6, 0, 0, TAU); ctx.fill();
        vents(ctx, ex, ey + 40, 4, 3.5, 10, 8, 0);
      }
      shadowUnder(ctx, hull, 8, 12, 16, 0.72);
      A.metal(ctx, hull, { base: '#232838', spec: 0.32, specPos: 0.26, bounds: bb(-143, -116, 286, 190), edge: 3, rimLight: 2.6 });
      grime(ctx, B, 23, 0.55);
      ctx.save();
      ctx.clip(hull);
      for (const s of SIDES) {
        A.panelLines(ctx, pline([[110 * s, -96], [126 * s, -40], [124 * s, 20], [100 * s, 54]]), '#000', 0.55);
        vents(ctx, 128 * s, -12, 3, 3, 14, 7, 0);
        // rubber side bumpers
        const bump = rrect(s < 0 ? -146 : 136, -44, 10, 52, 4);
        ctx.fillStyle = '#121319';
        ctx.fill(bump);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.stroke(bump);
      }
      ctx.restore();
      // raised deck
      const deck = A.symPath(0, TT.DECK);
      shadowUnder(ctx, deck, 4, 7, 10, 0.68);
      A.metal(ctx, deck, { base: '#353b51', spec: 0.5, specPos: 0.3, bounds: bb(-102, -104, 204, 150), edge: 2.2 });
      grime(ctx, B, 29, 0.35);
      ctx.save();
      ctx.clip(deck);
      for (const yy of [-78, 4, 30]) A.panelLines(ctx, pline([[-102, yy], [102, yy]]), '#000', 0.5);
      for (const s of SIDES) {
        A.panelLines(ctx, pline([[48 * s, -102], [56 * s, -60], [56 * s, 10], [40 * s, 40]]), '#000', 0.5);
        tint(ctx, poly([[56, -60], [98, -62], [102, -24], [92, 10], [56, 10]], s), '#000000', 0.14);
        rivets(ctx, along(70 * s, -86, 96 * s, -30, 6, 0.05), 1.1);
        vents(ctx, 78 * s, -12, 4, 3, 10, 7, 0);
      }
      ctx.restore();
      // bridge with a smoked canopy slit
      const bridge = rrect(-30, -104, 60, 26, 9);
      shadowUnder(ctx, bridge, 2, 4, 5, 0.6);
      A.metal(ctx, bridge, { base: '#41475f', spec: 0.6, bounds: bb(-30, -104, 60, 26), edge: 1.4 });
      const can = rrect(-20, -98, 40, 9, 4.5);
      const cg = ctx.createLinearGradient(-20, -98, 20, -89);
      cg.addColorStop(0, '#2a1830'); cg.addColorStop(0.35, '#5a2a52'); cg.addColorStop(0.5, '#ff7ab0'); cg.addColorStop(0.58, '#4a2244'); cg.addColorStop(1, '#14080f');
      ctx.fillStyle = cg;
      ctx.fill(can);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke(can);
      // gravity core recess (the vortex and grille are drawn live)
      const cr = TT.CORE;
      shadowUnder(ctx, circle(cr.x, cr.y, cr.r + 8), 3, 5, 7, 0.6);
      A.metal(ctx, ringPath(cr.x, cr.y, cr.r, cr.r + 9), { base: '#4a5068', spec: 0.6, bounds: bb(cr.x - cr.r - 9, cr.y - cr.r - 9, 2 * cr.r + 18, 2 * cr.r + 18), edge: 1.4 });
      ctx.fillStyle = '#05040a';
      ctx.beginPath(); ctx.arc(cr.x, cr.y, cr.r, 0, TAU); ctx.fill();
      const bolts = [];
      for (let i = 0; i < 16; i++) bolts.push([cr.x + Math.cos((i / 16) * TAU) * (cr.r + 4.5), cr.y + Math.sin((i / 16) * TAU) * (cr.r + 4.5)]);
      rivets(ctx, bolts, 1.1);
      for (let i = 0; i < 4; i++) {
        const a = PI / 4 + (i * PI) / 2;
        A.emissive(ctx, circle(cr.x + Math.cos(a) * (cr.r + 4.5), cr.y + Math.sin(a) * (cr.r + 4.5), 1.7), '#b26bff', 5);
      }
      // front push plate with ribs and muted hazard chevrons
      const plate = rrect(-68, 54, 136, 26, 8);
      shadowUnder(ctx, plate, 3, 5, 7, 0.65);
      A.metal(ctx, plate, { base: '#2b3043', spec: 0.55, bounds: bb(-68, 54, 136, 26), edge: 1.6 });
      ctx.save();
      ctx.clip(plate);
      for (let i = -6; i <= 6; i++) {
        const xx = i * 10;
        ctx.fillStyle = i % 2 ? 'rgba(160,112,40,0.55)' : 'rgba(10,10,14,0.55)';
        ctx.beginPath(); ctx.moveTo(xx - 6, 80); ctx.lineTo(xx + 4, 54); ctx.lineTo(xx + 10, 54); ctx.lineTo(xx, 80); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1.2;
      ctx.stroke(plate);
      ctx.restore();
      // shoulder sockets and launcher mounts
      for (const s of SIDES) {
        const [sx, sy] = TT.SH;
        shadowUnder(ctx, circle(sx * s, sy, 22), 3, 5, 7, 0.6);
        A.metal(ctx, ringPath(sx * s, sy, 13, 22), { base: '#3f465d', spec: 0.6, bounds: bb(sx * s - 22, sy - 22, 44, 44), edge: 1.3 });
        ctx.fillStyle = '#07070b';
        ctx.beginPath(); ctx.arc(sx * s, sy, 13, 0, TAU); ctx.fill();
      }
      for (const [lx, ly] of TT.LAUNCH) {
        shadowUnder(ctx, circle(lx, ly, 19), 3, 5, 6, 0.6);
        A.metal(ctx, ringPath(lx, ly, 11, 19), { base: '#454c63', spec: 0.6, bounds: bb(lx - 19, ly - 19, 38, 38), edge: 1.2 });
        ctx.fillStyle = '#07070b';
        ctx.beginPath(); ctx.arc(lx, ly, 11, 0, TAU); ctx.fill();
      }
      // violet gravity-tech trim and pink running lights
      for (const s of SIDES) {
        A.emissive(ctx, pline([[48 * s, -100], [80 * s, -88], [97 * s, -62]]), '#b26bff', 6, { stroke: 1.3 });
        A.emissive(ctx, pline([[100 * s, -14], [90 * s, 12], [66 * s, 32]]), '#b26bff', 6, { stroke: 1.3 });
        A.emissive(ctx, pline([[118 * s, 46], [88 * s, 62], [52 * s, 70]]), PAL.seam, 5, { stroke: 1.1 });
      }
      lights(ctx, [[-134, -70], [134, -70], [-60, 66], [60, 66], [-110, 44], [110, 44]], '#ff5c8a', 1.8);
      ctx.save();
      ctx.globalAlpha = 0.6;
      grime(ctx, B, 37, 0.4, 14);
      ctx.restore();
      void rng;
    }, { pad: 12, res: 1.25 });
    for (const s of SIDES) {
      const side = s < 0 ? 'L' : 'R';
      A.define(K + 'arm' + side, 110, 150, (ctx, w, h) => {
        // arm box centred at (s*120, 96) in boss space
        ctx.translate(w / 2 - 120 * s, h / 2 - 96);
        const P = ttArmPoly(s);
        const AB = bb(s > 0 ? 80 : -170, 20, 90, 150);
        for (const p of [P.upper, P.fore]) shadowUnder(ctx, p, 4, 6, 8, 0.6);
        A.metal(ctx, P.upper, { base: '#353b51', spec: 0.55, specPos: 0.3, bounds: AB, edge: 2 });
        A.metal(ctx, P.fore, { base: '#2c3245', spec: 0.5, specPos: 0.3, bounds: AB, edge: 1.8 });
        const [ex, ey, wx, wy] = P.foreSeg;
        // hydraulic ram along the upper arm
        ctx.save();
        ctx.strokeStyle = '#9aa3b8';
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo((TT.SH[0] + 10) * s, TT.SH[1] + 4); ctx.lineTo((TT.EL[0] - 6) * s, TT.EL[1] - 12); ctx.stroke();
        ctx.strokeStyle = 'rgba(10,10,16,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        A.panelLines(ctx, pline([[(TT.SH[0] - 6) * s, TT.SH[1] + 14], [(TT.EL[0] - 14) * s, TT.EL[1] + 4]]), '#000', 0.55);
        // magnetic coils across the forearm
        for (let i = 0; i < 3; i++) {
          const u = 0.28 + i * 0.2;
          const cx = lerp(ex, wx, u) * s, cy = lerp(ey, wy, u);
          const ang = Math.atan2(wy - ey, (wx - ex) * s) + PI / 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(ang);
          const coil = rrect(-15, -3, 30, 6, 3);
          ctx.fillStyle = '#1a1424';
          ctx.fill(coil);
          ctx.strokeStyle = 'rgba(178,107,255,0.55)';
          ctx.lineWidth = 1.2;
          ctx.stroke(coil);
          ctx.restore();
        }
        // joints
        dome(ctx, TT.EL[0] * s, TT.EL[1], 12, '#4a5068');
        dome(ctx, TT.WR[0] * s, TT.WR[1], 10, '#4a5068');
        dome(ctx, TT.SH[0] * s, TT.SH[1], 12, '#454b62');
        A.emissive(ctx, circle(TT.EL[0] * s, TT.EL[1], 2.2), '#ff4f7f', 5);
      }, { pad: 8, res: 1.5 });
      A.define(K + 'arm' + side + '_glow', 110, 150, (ctx, w, h) => {
        ctx.translate(w / 2 - 120 * s, h / 2 - 96);
        const [ex, ey, wx, wy] = ttArmPoly(s).foreSeg;
        for (let i = 0; i < 3; i++) {
          const u = 0.28 + i * 0.2;
          const cx = lerp(ex, wx, u) * s, cy = lerp(ey, wy, u);
          const ang = Math.atan2(wy - ey, (wx - ex) * s) + PI / 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(ang);
          ctx.shadowColor = '#b26bff';
          ctx.shadowBlur = 10 * devScale(ctx);
          ctx.fillStyle = '#d9b8ff';
          ctx.fill(rrect(-13, -1.6, 26, 3.2, 1.6));
          ctx.restore();
        }
      }, { pad: 14, res: 1 });
      A.define(K + 'fin' + side, 100, 80, (ctx, w, h) => {
        ctx.translate(w / 2 + 31 * s, h / 2 - 12);
        const p = poly(TT_FINGER, s);
        shadowUnder(ctx, p, 3, 5, 6, 0.6);
        A.metal(ctx, p, { base: '#3a4057', spec: 0.65, specPos: 0.3, bounds: bb(s > 0 ? -72 : -8, -16, 80, 58), edge: 1.6 });
        A.panelLines(ctx, pline([[0, -6], [-26, 10], [-50, 28]], s), '#000', 0.55);
        A.emissive(ctx, pline([[-6, -12], [-24, 1], [-42, 14], [-58, 28]], s), '#b26bff', 6, { stroke: 1.6 });
        rivets(ctx, [[2 * s, -4], [-10 * s, 4]], 1.1);
      }, { pad: 8, res: 1.5 });
    }
    A.define(K + 'lnch', 90, 40, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      // pointing +x; lit for a downward aim (light from local -x / +y)
      const br = rrect(-16, -11, 24, 22, 5);
      A.metal(ctx, br, { base: '#3c4258', spec: 0.55, bounds: bb(-16, -11, 24, 22), edge: 1.2 });
      const tube = rrect(4, -7, 32, 14, 3);
      const g = ctx.createLinearGradient(0, 7, 0, -7);
      g.addColorStop(0, '#8e98ae'); g.addColorStop(0.3, '#d6deea'); g.addColorStop(0.55, '#535c70'); g.addColorStop(1, '#191c26');
      ctx.fillStyle = g;
      ctx.fill(tube);
      ctx.strokeStyle = 'rgba(4,5,9,0.9)';
      ctx.lineWidth = 1.1;
      ctx.stroke(tube);
      ctx.fillStyle = '#07070b';
      ctx.fillRect(10, -2.2, 26, 4.4);
      for (const xx of [14, 26]) A.panelLines(ctx, pline([[xx, -7], [xx, 7]]), '#000', 0.6);
      A.emissive(ctx, pline([[6, 5.5], [34, 5.5]]), '#b26bff', 4, { stroke: 1 });
    }, { pad: 4, res: 1.5 });
    A.define(K + 'ldome', 36, 36, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      dome(ctx, 0, 0, 11, '#4a5168');
      A.emissive(ctx, circle(3.5, 3.5, 1.8), '#b26bff', 5);
    }, { pad: 4, res: 1.5 });
    A.define(K + 'head', 30, 18, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const p = poly([[-12, -2], [2, -2], [2, -6], [14, 0], [2, 6], [2, 2], [-12, 2]]);
      A.metal(ctx, p, { base: '#7a8296', spec: 0.8, bounds: bb(-12, -6, 26, 12), edge: 0.8 });
      A.emissive(ctx, pline([[3, -4], [13, 0], [3, 4]]), '#d9b8ff', 4, { stroke: 0.9 });
    }, { pad: 4, res: 2 });
    A.define(K + 'vortex', 64, 64, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const R = 30;
      const bg = ctx.createRadialGradient(0, 0, 2, 0, 0, R);
      bg.addColorStop(0, '#0a0410'); bg.addColorStop(0.6, '#1c0c2c'); bg.addColorStop(1, '#2d1446');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const u = i / 40, r = R * (0.12 + 0.88 * u), a = k * (TAU / 4) + u * 3.2;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.strokeStyle = 'rgba(178,107,255,0.55)';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(232,214,255,0.6)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      const c = ctx.createRadialGradient(0, 0, 0, 0, 0, 9);
      c.addColorStop(0, 'rgba(255,255,255,0.95)'); c.addColorStop(0.4, 'rgba(214,180,255,0.7)'); c.addColorStop(1, 'rgba(178,107,255,0)');
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
    }, { pad: 2, res: 1.5 });
    A.define(K + 'grille', 70, 70, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.clip();
      for (let i = -3; i <= 3; i++) {
        const bar = rrect(i * 8.5 - 2, -32, 4, 64, 2);
        A.metal(ctx, bar, { base: '#3a4056', spec: 0.6, bounds: bb(i * 8.5 - 2, -32, 4, 64), edge: 0.6 });
      }
      ctx.restore();
    }, { pad: 2, res: 1.5 });
    for (let i = 0; i < 3; i++) {
      A.define(K + 'chunk' + i, 60, 60, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        const rng = SL.makeRng(700 + i * 31);
        const pts = [];
        const n = 7 + i;
        for (let j = 0; j < n; j++) {
          const a = (j / n) * TAU + rng.next() * 0.4, r = 18 + rng.next() * 10;
          pts.push([Math.cos(a) * r, Math.sin(a) * r * (0.7 + rng.next() * 0.35)]);
        }
        const p = poly(pts);
        shadowUnder(ctx, p, 2, 3, 4, 0.6);
        A.metal(ctx, p, { base: '#6d7486', spec: 0.6, bounds: bb(-28, -28, 56, 56), edge: 1.2 });
        ctx.save();
        ctx.clip(p);
        for (let k = 0; k < 3; k++) A.panelLines(ctx, pline([[-30, -14 + k * 14 + rng.next() * 4], [30, -18 + k * 14]]), '#000', 0.6);
        A.emissive(ctx, pline([[-16, 6], [10, 3]]), '#7fe3ff', 4, { stroke: 1.4 });
        scorch(ctx, (rng.next() - 0.5) * 20, (rng.next() - 0.5) * 20, 14, rng);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = '#2a2d38';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[1][0] * 1.35, pts[1][1] * 1.35); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pts[4][0], pts[4][1]); ctx.lineTo(pts[4][0] * 1.3, pts[4][1] * 1.4); ctx.stroke();
        ctx.restore();
      }, { pad: 6, res: 1.25 });
    }
    for (const lv of [1, 2]) {
      A.define(K + 'dmg' + lv, 300, 210, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2 + 20);
        damageOverlay(ctx, A.symPath(0, TT.OUT), TT.DMG, lv, 1700 + lv, '#c08cff');
      }, { pad: 12, res: 1 });
    }
    ART.mb_tether = ['hull', 'armL', 'armR', 'armL_glow', 'armR_glow', 'finL', 'finR', 'lnch', 'ldome', 'head', 'vortex', 'grille',
      'chunk0', 'chunk1', 'chunk2', 'dmg1', 'dmg2'].map((k) => K + k);
  }

  // ---------------------------------------------------------------- TETHER behavior
  function ttEye(b) {
    const d = b.data;
    if (d.eye && !d.eye.dead) return d.eye;
    let best = null, bd = Infinity;
    for (const h of SL.world.hazards) {
      if (h.dead || h.typeId !== 'black_hole') continue;
      const dd = U.dist2(h.x, h.y, TT.EYE.x, TT.EYE.y);
      if (dd < bd) { bd = dd; best = h; }
    }
    d.eye = best;
    return best;
  }
  function ttEyePos(b) {
    const e = ttEye(b);
    return e ? { x: e.x, y: e.y } : TT.EYE;
  }
  function ttPullSet(b, v) {
    const e = ttEye(b);
    if (e && e.data && typeof e.data.pullMul === 'number') e.data.pullMul = v;
  }
  function ttLauncher(b, i) {
    const [lx, ly] = TT.LAUNCH[i];
    return { x: b.x + lx, y: b.y + ly };
  }
  function ttAnimate(b, dt) {
    const d = b.data;
    for (let i = 0; i < 4; i++) {
      const L = d.L[i];
      const p = ttLauncher(b, i);
      if (!L.lock) {
        const t = target(p);
        const want = PI / 2 + clamp(U.angleDiff(PI / 2, Math.atan2(t.y - p.y, t.x - p.x)), -1.25, 1.25);
        L.ang += clamp(U.angleDiff(L.ang, want), -2.2 * dt, 2.2 * dt);
      }
      if (L.reload > 0 && (L.reload -= dt) <= 0) { L.loaded = true; L.flash = 0.15; }
      if (L.flash > 0) L.flash -= dt;
      if (L.charge > 0) L.charge -= dt;
      if (L.lock && L.bm && (L.bm.dead || L.bm.state === 'fade')) { L.lock = false; L.bm = null; }
    }
    d.claw = approach(d.claw, d.clawWant, 6, dt);
    d.hold = approach(d.hold, d.holdWant, 7, dt);
    d.coreK = approach(d.coreK, d.coreWant, 2, dt);
    if (d.pulse > 0) d.pulse -= dt;
    if (d.pullT != null) {
      d.pullT += dt;
      ttPullSet(b, lerp(d.pullFrom, d.pullTo, sm01(d.pullT / 2)));
      if (d.pullT >= 2) d.pullT = null;
    }
    // prune thrown chunks (pooled bullets: drop them once dead or recycled)
    const C2 = d.chunks;
    for (let i = C2.length - 1; i >= 0; i--) {
      const c = C2[i];
      if (c.bl.dead || !c.bl.data || c.bl.data.ttChunk !== c.tok) C2.splice(i, 1);
    }
    // sparks along the cables while the Eye pulls harder
    if (b.phase >= 1 && !b.dying && Math.random() < dt * 6) {
      const i = (Math.random() * 4) | 0, p = ttLauncher(b, i), e = ttEyePos(b), u = crnd(0.05, 0.4);
      SL.fx.sparks(lerp(p.x, e.x, u), lerp(p.y, e.y, u), { count: 3, color: '#d9b8ff', speed: 200, life: 0.3, size: 3 });
    }
  }
  /** Harpoon line: the launcher locks on, 0.8 s telegraph, then a 0.6 s width-12 enemy beam. */
  function ttHarpoon(b, i) {
    const d = b.data, L = d.L[i];
    const p = ttLauncher(b, i);
    const t = target(p, b);
    const a = PI / 2 + clamp(U.angleDiff(PI / 2, Math.atan2(t.y - p.y, t.x - p.x)), -1.25, 1.25);
    L.ang = a; L.lock = true; L.charge = 0.8;
    const [lx, ly] = TT.LAUNCH[i];
    L.bm = pBeam(b, b, { angle: a, ox: lx + Math.cos(a) * TT.LZ, oy: ly + Math.sin(a) * TT.LZ, width: 12, telegraph: 0.8, duration: 0.6, follow: true, color: EB.violet });
    later(b, 0.8, () => { L.loaded = false; L.reload = 1.1; L.flash = 0.12; SL.fx.sparks(p.x, p.y, { count: 8, color: '#e6d4ff', speed: 300, angle: a, spread: 0.6, life: 0.25 }); });
  }
  function ttChunkUpdate(bl, dt) {
    const v = bl.data;
    v.rot += v.spin * dt;
    const e = v.eye;
    const g = e && !e.dead ? e.gravity : null;
    if (!g || !(g.pull > 0) || !(g.range > 0)) return;
    const dx = g.x - bl.x, dy = g.y - bl.y, dd = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dd >= g.range) return;
    const k = 1 - dd / g.range, a = g.pull * k * k * TT.CHUNK_K * dt;
    bl.vx += (dx / dd) * a;
    bl.vy += (dy / dd) * a;
    bl.speed = Math.sqrt(bl.vx * bl.vx + bl.vy * bl.vy);
    bl.angle = Math.atan2(bl.vy, bl.vx);
  }
  /** Reel In: the claws close on a wreck chunk (0.6 s), then hurl three orb_huge chunks that bend toward the Eye. */
  function ttChunks(b) {
    const d = b.data;
    d.clawWant = -1; d.holdWant = 1;
    sfx('enemy_charge', { x: b.x });
    later(b, 0.6, () => {
      d.clawWant = 1; d.holdWant = 0;
      later(b, 0.35, () => { d.clawWant = 0; });
      const ox = 0, oy = 176;
      const t = target({ x: b.x + ox, y: b.y + oy }, b);
      const a0 = Math.atan2(t.y - (b.y + oy), t.x - (b.x + ox));
      const eye = ttEye(b);
      for (let k = -1; k <= 1; k++) {
        const bl = fire(b.x + ox, b.y + oy, a0 + k * 0.42, 110, 'orb_huge', { update: ttChunkUpdate });
        if (!bl) continue;
        const tok = ++d.tok;
        bl.data.ttChunk = tok; bl.data.eye = eye; bl.data.rot = crnd(0, TAU); bl.data.spin = crnd(-2.5, 2.5); bl.data.kind = (Math.random() * 3) | 0;
        d.chunks.push({ bl, tok });
      }
      SL.fx.sparks(b.x + ox, b.y + oy, { count: 16, color: '#e6d4ff', speed: 340, angle: a0, spread: 1.4, life: 0.35 });
      debrisBurst(b.x + ox, b.y + oy, DEBRIS_GRAPHITE, 4, 220, 10, 6);
    });
  }
  function ttCablePts(x0, y0, x1, y1, sag) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1;
    const cx = mx - (dy / L) * sag, cy = my + (dx / L) * sag;
    for (let j = 0; j <= 15; j++) {
      const u = j / 15, a = (1 - u) * (1 - u), b2 = 2 * u * (1 - u), c = u * u;
      TT_PTS[j * 2] = a * x0 + b2 * cx + c * x1;
      TT_PTS[j * 2 + 1] = a * y0 + b2 * cy + c * y1;
    }
    return TT_PTS;
  }
  function ttStroke(ctx, P) {
    ctx.beginPath();
    ctx.moveTo(P[0], P[1]);
    for (let j = 1; j <= 15; j++) ctx.lineTo(P[j * 2], P[j * 2 + 1]);
    ctx.stroke();
  }
  function ttDrawCables(b, ctx, x, y, t) {
    const d = b.data, e = ttEyePos(b);
    const taut = b.phase >= 1 ? 0.35 : 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 4; i++) {
      const [lx, ly] = TT.LAUNCH[i];
      let x0 = x + lx, y0 = y + ly;
      let sag = (lx < 0 ? -1 : 1) * (14 + 10 * Math.sin(t * 1.1 + i * 1.7)) * taut;
      let k = 1;
      if (d.snap != null) {
        const u = sm01(d.snap / 0.9);
        const whip = Math.sin(d.snap * 18 + i) * 70 * (1 - u);
        x0 = lerp(x0, e.x, u) + whip; y0 = lerp(y0, e.y, u);
        sag += whip * 0.8;
        k = 1 - u;
        if (k <= 0.01) continue;
      }
      const P = ttCablePts(x0, y0, e.x, e.y, sag);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#181a24';
      ctx.lineWidth = 4.2;
      ttStroke(ctx, P);
      ctx.strokeStyle = 'rgba(120,128,156,0.55)';
      ctx.lineWidth = 1.2;
      ttStroke(ctx, P);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = C.rgba('#b26bff', 0.1 + 0.08 * d.coreK);
      ctx.lineWidth = 10;
      ttStroke(ctx, P);
      ctx.strokeStyle = C.rgba('#c9a2ff', 0.32 + 0.25 * d.coreK);
      ctx.lineWidth = 1.6;
      ttStroke(ctx, P);
      ctx.globalAlpha = 1;
      // energy pulses travelling up into the Eye
      const sp = d.pulse > 0 ? 1.6 : 0.45 + 0.4 * d.coreK;
      for (let q = 0; q < 2; q++) {
        const u = (t * sp + i * 0.27 + q * 0.5) % 1;
        const j = Math.min(14, (u * 15) | 0), f = u * 15 - j;
        const px = lerp(P[j * 2], P[j * 2 + 2], f), py = lerp(P[j * 2 + 1], P[j * 2 + 3], f);
        A.drawGlow(ctx, px, py, d.pulse > 0 ? 16 : 10, '#b26bff', (d.pulse > 0 ? 0.9 : 0.55) * k);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  function ttDraw(b, ctx) {
    const d = b.data, t = SL.time.t, K = TTK;
    const dy = b.dying;
    const x = b.x + (dy ? crnd(-4, 4) : 0), y = b.y + (dy ? crnd(-3, 3) : 0);
    if (y < -260) return;
    const hpF = b.hp / b.maxHp;
    // engine plumes (up); they burn harder against the Eye's pull in phase 2
    const thrust = !b.introDone ? 1.2 : b.phase >= 1 ? 1.45 : 1;
    for (let i = 0; i < 2; i++) {
      const [ex, ey, ew] = TT.ENG[i];
      const flick = dy && Math.random() < 0.3 ? 0.35 : 1;
      plume(ctx, x + ex, y + ey - 12, -PI / 2, ew * 0.8, (66 + 14 * Math.sin(t * 7.5 + i * 2)) * thrust * flick, '#ffffff', PAL.engine, t + i * 0.5);
      A.drawGlow(ctx, x + ex, y + ey - 13, ew * 0.95, PAL.engine, 0.75 * flick);
    }
    // arms and claw fingers
    for (const s of SIDES) {
      const side = s < 0 ? 'L' : 'R';
      if (d.armGone && d.armGone[side]) continue;
      const sway = Math.sin(t * 1.3 + s) * 0.02;
      A.drawSprite(ctx, K + 'arm' + side, x + 120 * s, y + 96, sway);
      const gk = 0.35 + 0.25 * Math.sin(t * 4 + s) + 0.4 * Math.max(d.hold, d.coreK * 0.6);
      ctx.globalCompositeOperation = 'lighter';
      A.drawSprite(ctx, K + 'arm' + side + '_glow', x + 120 * s, y + 96, sway, 1, clamp(gk, 0, 1));
      ctx.globalCompositeOperation = 'source-over';
      const rot = -s * 0.32 * d.claw + s * 0.04 * Math.sin(t * 2.1);
      SL.render.setTransform(ctx, x + TT.WR[0] * s, y + TT.WR[1], rot);
      const fs = A.get(K + 'fin' + side);
      ctx.drawImage(fs.canvas, -fs.cw / 2 - 31 * s, -fs.ch / 2 + 12, fs.cw, fs.ch);
      SL.render.resetTransform(ctx);
    }
    // held wreck chunk between the claws
    if (d.hold > 0.02) {
      A.drawGlow(ctx, x, y + 176, 46 * d.hold, '#b26bff', 0.55 * d.hold);
      A.drawSprite(ctx, K + 'chunk' + (d.tok % 3), x, y + 176, t * 1.5, 0.4 + 0.6 * d.hold, d.hold);
    }
    A.drawSprite(ctx, K + 'hull', x, y - 20);
    if (hpF < 0.8) A.drawSprite(ctx, K + 'dmg1', x, y - 20, 0, 1, sm01((0.8 - hpF) / 0.3));
    if (hpF < 0.45) A.drawSprite(ctx, K + 'dmg2', x, y - 20, 0, 1, sm01((0.45 - hpF) / 0.3));
    bossFlash(b, ctx, K + 'hull', x, y - 20);
    if (hpF < 0.45) {
      for (let i = 0; i < TT.DMG.length; i += 2) {
        const p = TT.DMG[i];
        A.drawGlow(ctx, x + p[0], y + p[1], 14, '#c08cff', (0.3 + 0.2 * Math.sin(t * 9 + i * 1.7)) * sm01((0.45 - hpF) / 0.3));
      }
    }
    // gravity core: rotating vortex under a grille
    const cr = TT.CORE, ck = d.coreK, pul = 0.5 + 0.5 * Math.sin(t * (4 + 4 * ck));
    const collapse = dy ? clamp(1 - (b.deathT - 1.45) / 0.3, 0, 1) : 1;
    A.drawSprite(ctx, K + 'vortex', x + cr.x, y + cr.y, -t * (1.6 + 2.4 * ck), 1, collapse);
    A.drawGlow(ctx, x + cr.x, y + cr.y, (34 + 10 * pul + 16 * ck) * (dy ? 1 + b.deathT * 0.6 : 1), '#b26bff', (0.35 + 0.25 * ck + (d.pulse > 0 ? 0.4 : 0)) * collapse);
    A.drawSprite(ctx, K + 'grille', x + cr.x, y + cr.y);
    // cables up into the Eye
    ttDrawCables(b, ctx, x, y, t);
    // harpoon launchers
    for (let i = 0; i < 4; i++) {
      const [lx, ly] = TT.LAUNCH[i], L = d.L[i];
      const px = x + lx, py = y + ly, a = L.ang;
      A.drawSprite(ctx, K + 'lnch', px, py, a);
      const hx = px + Math.cos(a) * (TT.LZ - 6), hy = py + Math.sin(a) * (TT.LZ - 6);
      if (L.loaded && !dy) A.drawSprite(ctx, K + 'head', hx, hy, a);
      if (L.charge > 0) {
        const k = 1 - L.charge / 0.8;
        A.drawGlow(ctx, hx, hy, 10 + 14 * k, '#b26bff', 0.35 + 0.6 * k);
        A.drawGlow(ctx, hx, hy, 4 + 5 * k, '#f3e8ff', 0.8 * k);
      }
      if (L.flash > 0) A.drawGlow(ctx, hx, hy, 26, '#e6d4ff', L.flash / 0.15);
      A.drawSprite(ctx, K + 'ldome', px, py);
    }
    // the front gun's charge glow before a burst
    if (d.gunGlow > 0) A.drawGlow(ctx, x, y + 70, 16 + 10 * (1 - d.gunGlow / 0.25), '#ffb070', 0.8 * (1 - d.gunGlow / 0.25));
    // thrown wreck chunks (drawn under the orb_huge glow, which renders later with the bullets)
    for (const c of d.chunks) {
      const bl = c.bl;
      if (bl.dead || !bl.data || bl.data.ttChunk !== c.tok) continue;
      A.drawSprite(ctx, K + 'chunk' + bl.data.kind, bl.x, bl.y, bl.data.rot, 1.05);
    }
  }

  defineBoss('mb_tether', {
    name: 'TETHER', title: 'Collapsar Tug', hp: 4500, r: 160, score: 28000, parTime: 60, size: [380, 320],
    credits: [25, 3], palette: 'violet', debris: DEBRIS_VIOLET,
    init(b) {
      const d = b.data;
      b.x = W / 2; b.y = -240;
      b.circles = TT.CIRCLES.map((c) => ({ x: c.x, y: c.y, r: c.r }));
      d.L = TT.LAUNCH.map(() => ({ ang: PI / 2, lock: false, bm: null, loaded: true, reload: 0, flash: 0, charge: 0 }));
      d.claw = 0; d.clawWant = 0; d.hold = 0; d.holdWant = 0; d.coreK = 0; d.coreWant = 0; d.pulse = 0; d.gunGlow = 0;
      d.chunks = []; d.tok = 0; d.snap = null; d.pullT = null; d.armGone = { L: false, R: false }; d.dt = 1 / 60;
      d.eye = null; d.eyeOwn = false;
      if (!ttEye(b) && SL.hazards && SL.hazards.has && SL.hazards.has('black_hole')) {
        try {
          d.eye = SL.spawnHazard('black_hole', { size: 'large', x: TT.EYE.x, y: TT.EYE.y, fixed: true, pullMul: 0.7, life: 0 });
          d.eyeOwn = !!(d.eye && !d.eye.dead);
        } catch (err) { U.warnOnce('bossesA:eye', '[bossesA] TETHER could not open its own Eye', err); }
      }
      const e = ttEye(b);
      d.pull0 = e && e.data && typeof e.data.pullMul === 'number' ? e.data.pullMul : 0.7;
    },
    intro(b, dt) {
      const d = b.data, t = d.at;
      d.dt = dt;
      b.x = W / 2;
      b.y = lerp(-240, TT.BASE_Y, SL.ease.outCubic(clamp((t - 0.2) / 3.0, 0, 1)));
      if (!d.introFx && t >= 0.6) { d.introFx = true; sfx('boss_roar', { x: b.x }); }
      if (!d.introPulse && t >= 2.8) { d.introPulse = true; d.pulse = 0.9; d.clawWant = 1; later(b, 0.5, () => { d.clawWant = 0; }); SL.fx.shake(5, 0.4); }
      ttAnimate(b, dt);
      return t >= 3.6;
    },
    update(b, dt) {
      const d = b.data;
      d.dt = dt;
      const amp = b.phase === 0 ? 110 : 70, per = b.phase === 0 ? 10 : 13;
      const ty = (b.phase >= 1 ? TT.REEL_Y : TT.BASE_Y) + Math.sin(b.fightT * 1.2) * 6;
      b.x = approach(b.x, W / 2 + amp * Math.sin((TAU * b.fightT) / per), 2, dt);
      b.y = approach(b.y, ty, 1.5, dt);
      if (d.gunGlow > 0) d.gunGlow -= dt;
      ttAnimate(b, dt);
      damageFx(b, dt, TT.DMG);
    },
    phases: [
      {
        at: 1.0, name: 'Harpoons',
        enter(b, S) { S.hT = 1.0; S.hi = 0; S.slingT = 2.2; S.dir = 1; S.burstT = 1.4; },
        update(b, dt, S) {
          const d = b.data;
          if ((S.hT -= dt) <= 0) { S.hT = 1.8; ttHarpoon(b, [0, 1, 2, 3][S.hi++ % 4]); }
          if ((S.slingT -= dt) <= 0) {
            S.slingT = 5;
            d.pulse = 0.6;
            sfx('enemy_charge', { x: b.x });
            later(b, 0.45, () => {
              const e = ttEyePos(b);
              pSling(b, { center: { x: e.x, y: e.y }, radius: 300, count: 6, speed: 200, type: 'void_orb', dir: S.dir });
              S.dir = -S.dir;
            });
          }
          if ((S.burstT -= dt) <= 0) {
            S.burstT = 2.5;
            d.gunGlow = 0.25;
            later(b, 0.25, () => pBurst(b, b, { oy: 72, shots: 3, gap: 0.12, speed: 200, type: 'orbBig', bias: b }));
          }
        },
      },
      {
        at: 0.5, name: 'Reel In',
        enter(b, S) {
          const d = b.data;
          for (const L of d.L) { L.lock = false; L.bm = null; L.charge = 0; }
          const e = ttEye(b);
          d.pullFrom = e && e.data && typeof e.data.pullMul === 'number' ? e.data.pullMul : d.pull0;
          d.pullTo = 0.9; d.pullT = 0; d.coreWant = 1; d.pulse = 1.0;
          S.chunkT = 1.4; S.ringT = 1.0; S.rs = {};
        },
        update(b, dt, S) {
          if ((S.chunkT -= dt) <= 0) { S.chunkT = 3; ttChunks(b); }
          if ((S.ringT -= dt) <= 0) { S.ringT = 2.4; pRingStagger(S.rs, b, { oy: 40, count: 16, speed: 150, type: 'orb' }); }
        },
      },
    ],
    draw: ttDraw,
    death: {
      start(b) {
        const d = b.data;
        d.snap = 0; d.hold = 0; d.holdWant = 0; d.clawWant = 0.6; d.coreWant = 1;
        d.dieY = b.y;
        d.pullFrom = d.eye && d.eye.data && typeof d.eye.data.pullMul === 'number' ? d.eye.data.pullMul : d.pull0;
        d.pullTo = d.pull0; d.pullT = 0;
        for (let i = 0; i < 4; i++) {
          const p = ttLauncher(b, i);
          SL.fx.sparks(p.x, p.y, { count: 18, color: '#e6d4ff', speed: 420, angle: -PI / 2, spread: 1.6, life: 0.4 });
        }
        sfx('boss_part_break', { x: b.x });
      },
      steps: [
        [0.0, () => { SL.fx.shake(10, 2.2); }],
        ...[0, 1, 2, 3, 4, 5].map((i) => [0.1 + i * 0.2, (b) => { const p = TT.DMG[(i * 5) % TT.DMG.length]; chainBlast(b, b.x + p[0], b.y + p[1], 'm', 'violet', i % 2 === 0); }]),
        [0.7, (b) => ttArmBlast(b, -1)],
        [1.0, (b) => ttArmBlast(b, 1)],
        [1.45, (b) => {
          SL.fx.flash('#e6d4ff', 0.6, 0.4);
          SL.fx.chromatic(0.6, 0.45);
          SL.fx.shockwave(b.x, b.y + TT.CORE.y, { radius: 360, duration: 0.6, strength: 1.6, color: '#d9b8ff' });
        }],
        [1.9, (b) => {
          const d = b.data;
          finish(b, { size: 'xl', palette: 'violet', ripple: 520, credits: [25, 3], ring: '#d9b8ff' });
          if (d.eyeOwn && d.eye && !d.eye.dead) { if (SL.hazards.end) SL.hazards.end(d.eye); else d.eye.dead = true; }
        }],
      ],
      tick(b, dt, t) {
        const d = b.data;
        if (d.snap != null) d.snap += dt;
        b.y = d.dieY - t * 10;
        ttAnimate(b, dt);
        damageFx(b, dt, TT.DMG);
        if (Math.random() < dt * 5) {
          const p = TT.DMG[(Math.random() * TT.DMG.length) | 0];
          SL.fx.explode(b.x + p[0], b.y + p[1], { size: 's', palette: 'violet', sound: false, shake: false });
        }
      },
    },
    art: [],
  });
  function ttArmBlast(b, s) {
    const side = s < 0 ? 'L' : 'R';
    const x = b.x + 120 * s, y = b.y + 110;
    chainBlast(b, x, y, 'l', 'violet', true);
    debrisBurst(x, y, DEBRIS_VIOLET, 7, 380, 20, 30);
    debrisBurst(x, y, DEBRIS_GRAPHITE, 4, 300, 20, 30);
    b.data.armGone[side] = true;
  }

  // ================================================================== BOSSES END (more bosses are inserted above)

  // ================================================================== public surface, prewarm, sandboxes
  SL.bossesA = {
    ids: IDS.slice(),
    part,
    alive,
    /** Debug: lower HP into phase index i (one phase per call; call again after the transition for later phases). */
    jump(b, i) {
      b = b || (SL.game && SL.game.boss);
      if (!b || !b.phases || !b.phases[i] || b.dying) return false;
      b.hp = Math.min(b.hp, b.phases[i].at * b.maxHp - 1);
      return true;
    },
    last: null,
  };

  // prewarm the boss art when its mission starts (one sprite per frame, so no single long frame)
  SL.bus.on('missionStart', (e) => {
    const m = e && e.mission;
    const keys = (m && ART[m.boss]) || [];
    if (!keys.length || !SL.bus.onMission) return;
    let i = 0;
    const off = SL.bus.onMission('tick', () => {
      if (i >= keys.length) { off(); return; }
      A.get(keys[i++]);
    });
  });

  defineRazorbackArt();
  defineLodestarArt();
  defineTempestArt();
  defineHailstormArt();
  defineTetherArt();

  // test_boss: the stub missions still reference it; it is RAZORBACK until the missions module lands
  SL.bosses.define('test_boss', Object.assign({}, SL.bosses.get('boss_razorback')));
  ART.test_boss = ART.boss_razorback;

  function bossSandbox(id, o) {
    SL.debug.sandbox('boss:' + id, () => {
      const P = debugParams();
      const phase = +P.phase || 0;
      const wl = P.wl != null ? +P.wl : 3, ms = P.ms != null ? +P.ms : 1;
      if (o.bg && SL.backgrounds.has(o.bg)) {
        SL.world.setBackground(o.bg);
        if (o.bgPhase) SL.world.setPhase(o.bgPhase);
      } else if (SL.world.setPhase) SL.world.setPhase('boss');
      for (const p of SL.world.players) {
        if (p.weapon) p.weapon.level = clamp(wl | 0, 1, 5);
        p.missiles = clamp(ms | 0, 0, 3);
      }
      if (o.setup) o.setup();
      SL.bus.onMission('bossDefeated', (e) => {
        const b = e.b;
        SL.bossesA.last = { id: e.id, fightT: +b.fightT.toFixed(2), parTime: b.def.parTime, timeBonus: e.timeBonus };
        console.log('[bossesA] ' + e.id + ' defeated: fight ' + b.fightT.toFixed(1) + ' s (par ' + b.def.parTime + ')');
        if (o.after && SL.world.setPhase && SL.world.bg && SL.world.bg.id === o.bg) SL.world.setPhase(o.after);
      });
      let wait = 0.5, b = null, jumped = 0;
      return (dt) => {
        if (b && !b.dead) {
          if (jumped < phase && b.introDone && !(b.transitionT > 0) && b.phase === jumped && !b.dying) {
            SL.bossesA.jump(b, jumped + 1);
            jumped++;
          }
          return;
        }
        if (SL.game.boss) return;
        if ((wait -= dt) <= 0) { b = SL.spawnBoss(id, o.music ? { music: o.music } : {}); jumped = 0; wait = 3; }
      };
    }, { name: 'Boss ' + id, god: true, autopilot: true });
  }
  bossSandbox('boss_razorback', { bg: 'bg_vesta', bgPhase: 'boss' });
  bossSandbox('boss_lodestar', { bg: 'bg_kerr', bgPhase: 'boss' });
  bossSandbox('boss_tempest', { bg: 'bg_tantalus', bgPhase: 'boss', music: 'mus_boss_heavy', after: 'clear' });
  bossSandbox('mb_hailstorm', { bg: 'bg_callisto', bgPhase: 'boss', music: 'mus_miniboss', after: 'orbit' });
  bossSandbox('mb_tether', {
    bg: 'bg_kerr', bgPhase: 'boss', music: 'mus_miniboss', after: 'calm',
    setup() {
      // s2 fights TETHER under Kerr's Eye: a large fixed hole at the top center (GDD 5.2)
      if (SL.hazards.has('black_hole')) SL.spawnHazard('black_hole', { size: 'large', x: 360, y: -60, fixed: true, pullMul: 0.7, life: 0 });
    },
  });
})(window.SL = window.SL || {});
