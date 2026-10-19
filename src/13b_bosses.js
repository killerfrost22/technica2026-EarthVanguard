/* 13b_bosses.js (bossesB): GDD sections 8.4, 8.5, 8.8 and 8.9.
   Provides the boss boss_suneater (SUNEATER, m4), the mini-bosses mb_mantis
   (MANTIS, s3) and mb_crucible (CRUCIBLE, s4), and the flyby enemy mantis_pass (MANTIS art crossing on a diagonal).
   Every boss is drawn from pre-rendered SL.art layers (hulls, emissive overlays, damage overlays, moving parts) plus
   live glows and plumes; destructible parts are hidden enemies (core recipe) that the boss draws itself.
   Public helpers: SL.bossesB (fire, target, parts, jump(phase)); see docs/api/bossesB.md.
   OUROBOROS (m5) has its art defined below, but the boss itself is not built yet.
   Sandboxes: 'boss:boss_suneater', 'boss:mb_mantis', 'boss:mb_crucible', 'enemy:mantis_pass'. */
(function (SL) {
  'use strict';

  const U = SL.util, A = SL.art, C = SL.color;
  const TAU = Math.PI * 2, PI = Math.PI, HALF = Math.PI / 2;
  const W = SL.W, H = SL.H;
  const PE = SL.pal.enemy, EBC = SL.pal.ebullet;
  const VIOLET = '#b26bff';
  const sfx = (id, o) => U.sfx(id, o);
  const diffOf = () => (SL.game && SL.game.diff) || {};
  const fr = () => diffOf().fireRate || 1;
  const bspd = () => diffOf().bulletSpeed || 1;
  const rnd = (a, b) => (SL.rng ? SL.rng.range(a, b) : a + Math.random() * (b - a));
  const B13 = SL.bossesB = { ids: ['boss_suneater', 'mb_mantis', 'mb_crucible'], enemies: ['mantis_pass'] };

  // ------------------------------------------------------------------ targeting and bullets
  const FALLBACK_TARGET = { x: W / 2, y: H - 180, ref: null };
  /** GDD 7.4 aim point: SL.patterns.target when the enemies module provides it, else the nearest player. */
  function target(src) {
    const P = SL.patterns;
    if (P && typeof P.target === 'function') {
      try {
        const t = P.target(src);
        if (t && isFinite(t.x) && isFinite(t.y)) return t;
      } catch (err) { U.warnOnce('b13:target', 'bossesB: SL.patterns.target threw', err); }
    }
    const p = SL.world.nearestPlayer(src.x, src.y);
    return p || FALLBACK_TARGET;
  }
  /** Angle from (x, y) to the boss's aim point. */
  function aim(b, x, y) {
    const t = target(b || { x, y });
    return Math.atan2(t.y - y, t.x - x);
  }

  // GDD 7.2 types come from the enemies module; until then a look-alike core type stands in
  const FALLBACK_TYPE = {
    orb_huge: ['orbBig', 1.75, EBC.red],
    petal: ['needle', 1, '#ff6fd0'],
    flare: ['orbBig', 1.35, EBC.orange],
    void_orb: ['orb', 1.25, VIOLET],
    spark: ['needle', 1, VIOLET],
    missile: ['needle', 1.2, EBC.orange],
  };
  function petalUpdate(b) { if (b.turn && b.age >= 1.2) b.turn = 0; }
  /** void_orb gravity coupling (GDD 7.2): core bending gives 0.6x, this adds the rest up to 2.5x. */
  function voidUpdate(b, dt) {
    let ax = 0, ay = 0;
    const boss = SL.game && SL.game.boss;
    const L = boss && boss.gravityList;
    if (L) {
      for (let i = 0; i < L.length; i++) {
        const g = L[i];
        if (!(g.pull > 0)) continue;
        const dx = g.x - b.x, dy = g.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 >= g.range * g.range || d2 < 1) continue;
        const d = Math.sqrt(d2), f = 1 - d / g.range, a = g.pull * f * f * 1.9;
        ax += (dx / d) * a;
        ay += (dy / d) * a;
      }
    }
    const HZ = SL.world.hazards;
    for (let i = 0; i < HZ.length; i++) {
      const g = HZ[i].gravity;
      if (HZ[i].dead || !g || !(g.pull > 0) || !(g.range > 0)) continue;
      const dx = g.x - b.x, dy = g.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 >= g.range * g.range || d2 < 1) continue;
      const d = Math.sqrt(d2), f = 1 - d / g.range, a = g.pull * f * f * 1.5;
      ax += (dx / d) * a;
      ay += (dy / d) * a;
    }
    if (!ax && !ay) return;
    b.vx += ax * dt;
    b.vy += ay * dt;
    b.speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    b.angle = Math.atan2(b.vy, b.vx);
  }
  /** SL.fireEnemy with GDD bullet ids: missing types fall back to a core look-alike; petal and void_orb behaviors. */
  function fire(x, y, a, sp, type, o) {
    const q = o ? Object.assign({}, o) : {};
    let t = type || 'orb';
    if (!SL.ebulletTypes.has(t)) {
      const f = FALLBACK_TYPE[t];
      U.warnOnce('b13:eb:' + t, 'bossesB: bullet type "' + t + '" is not defined yet; using ' + (f ? f[0] : 'orb'));
      if (f) {
        q.scale = (q.scale || 1) * f[1];
        if (!q.color) q.color = f[2];
        t = f[0];
      } else t = 'orb';
      // the real types carry these behaviors themselves (12_patterns wraps SL.fireEnemy)
      if (!q.update) {
        if (type === 'petal' && q.turn) q.update = petalUpdate;
        else if (type === 'void_orb') q.update = voidUpdate;
      }
    }
    return SL.fireEnemy(x, y, a, sp, t, q);
  }
  function ring(x, y, n, sp, type, o, off) {
    for (let i = 0; i < n; i++) fire(x, y, (off || 0) + (i / n) * TAU, sp, type, o);
  }
  function fan(x, y, ang, n, spread, sp, type, o) {
    for (let i = 0; i < n; i++) fire(x, y, n === 1 ? ang : ang + (i / (n - 1) - 0.5) * spread, sp, type, o);
  }
  /** GDD flower: n petals around 360 deg curving alternately left and right (turn +-0.9 for 1.2 s). */
  function flower(x, y, n, sp, off) {
    for (let i = 0; i < n; i++) fire(x, y, (off || 0) + (i / n) * TAU, sp, 'petal', { turn: i % 2 ? 0.9 : -0.9, color: '#ff4fd8' });
  }

  // ------------------------------------------------------------------ per-boss jobs (bursts, delayed volleys)
  function later(b, t, fn) { (b.data.jobs || (b.data.jobs = [])).push({ t, fn }); }
  function runJobs(b, dt) {
    const J = b.data.jobs;
    if (!J || !J.length) return;
    for (let i = J.length - 1; i >= 0; i--) {
      const j = J[i];
      j.t -= dt;
      if (j.t <= 0) {
        J.splice(i, 1);
        if (!b.dying && !b.dead) j.fn();
      }
    }
  }
  /** GDD burst: `shots` aimed volleys `gap` s apart, re-aimed each time; emit(i) -> {x, y} gives the muzzle. */
  function burst(b, shots, gap, emit, shoot) {
    for (let i = 0; i < shots; i++) later(b, i * gap, () => { const m = emit(i); shoot(m.x, m.y, aim(b, m.x, m.y), i); });
  }

  // ------------------------------------------------------------------ continuous emitters
  /** Rotating-arm emitter (spiral, double_spiral half, pinwheel) with an optional duty cycle. */
  function spiral(st, x, y, dt, o) {
    st.t = (st.t || 0) + dt;
    st.a = (st.a == null ? o.a0 || 0 : st.a) + o.spin * dt;
    if (o.on) {
      const cyc = o.on + (o.off || 0);
      if (st.t % cyc > o.on) { st.acc = 0; return; }
    }
    st.acc = (st.acc || 0) + dt * o.rate * fr();
    while (st.acc >= 1) {
      st.acc -= 1;
      for (let k = 0; k < o.arms; k++) fire(x, y, st.a + (k / o.arms) * TAU, o.speed, o.type || 'orb', o.opts);
    }
  }
  /** GDD stream: fast line of bullets (rate/s for dur s) whose aim tracks the target at `track` rad/s. */
  function streamStart(b, st, x, y, dur) { st.left = dur; st.acc = 1; st.ang = aim(b, x, y); }
  function streamStep(b, st, x, y, dt, o) {
    if (!(st.left > 0)) return false;
    st.left -= dt;
    st.ang += U.clamp(U.angleDiff(st.ang, aim(b, x, y)), -o.track * dt, o.track * dt);
    st.acc += dt * o.rate;
    while (st.acc >= 1) {
      st.acc -= 1;
      fire(x, y, st.ang, o.speed, o.type || 'needle', o.opts);
    }
    return true;
  }
  /** GDD sniper_line: the sight tracks for `track` s, locks for `lock` s, then fires `shots` needles. */
  function sniperStart(b, st, x, y) { st.on = true; st.t = 0; st.ang = aim(b, x, y); st.fired = 0; st.locked = false; }
  function sniperStep(b, st, x, y, dt, o) {
    if (!st.on) return;
    st.t += dt;
    st.x = x;
    st.y = y;
    if (st.t < o.track) st.ang += U.angleDiff(st.ang, aim(b, x, y)) * Math.min(1, dt * 9);
    else if (!st.locked) { st.locked = true; sfx('sniper_lock', { x }); }
    const ft = st.t - o.track - o.lock;
    while (ft >= 0 && st.fired < o.shots && ft >= st.fired * o.gap) {
      fire(x, y, st.ang, o.speed || 620, 'needle', { color: '#ff4fd8' });
      st.fired++;
    }
    if (st.fired >= o.shots) st.on = false;
  }
  function drawSniper(ctx, st, o) {
    if (!st.on) return;
    const k = U.clamp(st.t / o.track, 0, 1);
    const spr = SL.world.beamSprite('#ff4fd8');
    const b0 = SL.render.base, bs = b0.s;
    const c = Math.cos(st.ang) * bs, s = Math.sin(st.ang) * bs;
    ctx.setTransform(c, s, -s, c, b0.x + st.x * bs, b0.y + st.y * bs);
    ctx.globalCompositeOperation = 'lighter';
    const w = st.locked ? 5 : 1.6 + 1.6 * k;
    ctx.globalAlpha = st.locked ? 0.95 : 0.35 + 0.35 * k * (0.7 + 0.3 * Math.sin(SL.time.t * 30));
    ctx.drawImage(spr.canvas, 0, -w / 2, 1500, w);
    ctx.setTransform(bs, 0, 0, bs, b0.x, b0.y);
    A.drawGlow(ctx, st.x, st.y, st.locked ? 26 : 14, '#ff4fd8', 0.9);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  /** GDD orbit_release: bullets orbit a moving centre, then release aimed. */
  function orbitUpdate(bl, dt) {
    const d = bl.data;
    if (!d.rel) {
      const c = d.src;
      d.a += d.spin * dt;
      const r = d.R * Math.min(1, 0.25 + bl.age * 3);
      bl.x = bl.bx = c.x + (d.ox || 0) + Math.cos(d.a) * r;
      bl.y = bl.by = c.y + (d.oy || 0) + Math.sin(d.a) * r;
      if (bl.age >= d.T || c.dead || (c.data && c.data.broken)) {
        d.rel = true;
        bl.angle = aim(d.boss, bl.x, bl.y);
        bl.speed = d.sp * bspd();
        bl.vx = Math.cos(bl.angle) * bl.speed;
        bl.vy = Math.sin(bl.angle) * bl.speed;
      }
    } else if (d.void && !SL.ebulletTypes.has('void_orb')) voidUpdate(bl, dt);
  }
  function orbitRelease(b, src, n, o) {
    o = o || {};
    const R0 = o.radius || 120, ox = o.ox || 0, oy = o.oy || 0, off = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      fire(src.x + ox + Math.cos(a) * R0 * 0.25, src.y + oy + Math.sin(a) * R0 * 0.25, a, 0, o.type || 'void_orb', {
        update: orbitUpdate, color: o.color,
        data: { src, ox, oy, a, R: R0, T: o.orbit || 1.2, spin: o.spin || 2, sp: o.speed || 200, boss: b, void: (o.type || 'void_orb') === 'void_orb' },
      });
    }
  }
  /** GDD gravity_sling: void_orbs swing round a gravity source and are flung off when their tangent faces the target. */
  function slingUpdate(bl, dt) {
    const d = bl.data;
    if (!d.rel) {
      const c = d.src;
      d.a += d.dir * 4.4 * dt;
      const r = U.lerp(d.R0, d.R0 + 60, Math.min(1, bl.age / 1.1));
      bl.x = bl.bx = c.x + Math.cos(d.a) * r;
      bl.y = bl.by = c.y + Math.sin(d.a) * r;
      const tang = d.a + d.dir * HALF;
      const want = aim(d.boss, bl.x, bl.y);
      if ((bl.age > 0.35 && Math.abs(U.angleDiff(tang, want)) < 0.32) || bl.age > 1.25 || c.dead) {
        d.rel = true;
        bl.angle = U.lerpAngle(tang, want, 0.5);
        bl.speed = d.sp * bspd();
        bl.vx = Math.cos(bl.angle) * bl.speed;
        bl.vy = Math.sin(bl.angle) * bl.speed;
      }
    } else if (!SL.ebulletTypes.has('void_orb')) voidUpdate(bl, dt);
  }
  function sling(b, src, n, sp, dir) {
    const off = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      fire(src.x + Math.cos(a) * 40, src.y + Math.sin(a) * 40, a + dir * HALF, 0, 'void_orb', {
        update: slingUpdate, data: { src, a, dir, R0: (src.r || 16) + 30, sp, boss: b },
      });
    }
  }
  /** GDD rain_curtain: columns of falling bullets with two moving 90 px safe lanes. */
  function rainStart(st, o) {
    st.t = 0; st.acc = 0; st.dur = o.dur || 3; st.shift = 0;
    st.lanes = [rnd(110, 330), rnd(390, 610)];
    st.want = st.lanes.slice();
  }
  function rainStep(st, dt, o) {
    if (!(st.dur > 0) || st.t >= st.dur) return false;
    st.t += dt;
    st.shift -= dt;
    if (st.shift <= 0) { st.shift = 1.5; st.want = [rnd(90, 330), rnd(390, 630)]; }
    for (let i = 0; i < 2; i++) st.lanes[i] = U.approach(st.lanes[i], st.want[i], 110 * dt);
    st.acc += dt * o.rate * fr();
    let guard = 0;
    while (st.acc >= 1 && guard++ < 40) {
      const x = 24 + Math.floor(rnd(0, 15)) * 48 + rnd(-6, 6);
      if (Math.abs(x - st.lanes[0]) < 52 || Math.abs(x - st.lanes[1]) < 52) continue;
      st.acc -= 1;
      fire(x, o.y != null ? o.y : -20, HALF + rnd(-0.04, 0.04), rnd(180, 260), o.type || 'shard', o.opts);
    }
    return true;
  }

  // ------------------------------------------------------------------ gravity wells (b.gravityList)
  /** Pulls players 1x, enemy bullets 0.6x and player bullets 0.35x (GDD 7.2, 9.1); lens per well. */
  function applyWells(b) {
    const L = b.gravityList;
    if (!L) return;
    const Wd = SL.world;
    for (let i = 0; i < L.length; i++) {
      const g = L[i];
      if (g.lens > 0) SL.render.addLens(g.x, g.y, g.r, g.lens);
      if (!(g.pull > 0)) continue;
      Wd.applyGravity(g.x, g.y, g.pull, g.range, { bullets: false, pickups: true, pods: true });
      Wd.applyGravity(g.x, g.y, g.pull * 0.6, g.range, { players: false, bullets: true, pickups: false, pods: false, consume: g.r });
      Wd.applyGravity(g.x, g.y, g.pull * 0.35, g.range, { players: false, bullets: false, pbullets: true, pickups: false, pods: false, consume: g.r });
    }
  }
  /** Horizon contact: heavy continuous damage inside the hole (it is not survivable for long). */
  function horizonHurt(g, dps, dt) {
    for (const p of SL.world.players) {
      if (!p.alive || p.down || p.display) continue;
      if (U.dist2(p.x, p.y, g.x, g.y) < (g.r + 4) * (g.r + 4)) SL.damagePlayer(p, dps * dt, { source: 'blackhole', continuous: true });
    }
  }
  /** 2D horizon and accretion ring for a boss-held hole (the GL lens paints the black disk itself). */
  function drawHole(ctx, x, y, r, color, k, t) {
    if (!(k > 0)) return;
    A.drawGlow(ctx, x, y, r * 4.2, color, 0.35 * k);
    const ringC = A.ring(color, 64, 6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85 * k;
    const rr = r * 1.55 * (1 + 0.05 * Math.sin(t * 7));
    ctx.drawImage(ringC, x - rr, y - rr, rr * 2, rr * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (!SL.render.distortion) {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x, y, r * k, 0, TAU);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------------ destructible parts (core recipe)
  /** Damage straight to the bar (parts apply their own multipliers; the boss's armor does not apply twice). */
  function hurtBoss(b, n) {
    if (!b || b.dead || b.dying || b.invuln || !(n > 0)) return 0;
    b.hp -= n;
    return n;
  }
  const PART = {
    id: 'b13_part', name: 'Boss part', hp: 1000, r: 30, score: 0, credits: 0, manualMove: true, noClear: true,
    noCount: true, offscreenKill: false, contactDamage: 20, noRam: true, explosion: 'l',
    init(e, o) {
      const c = e.data.cfg = o.cfg;
      e.hidden = true;
      e.r = c.r || 30;
      if (c.circles) e.circles = c.circles;
      e.armor = c.mult || 1;
      e.data.mark = 0;
      e.data.broken = false;
      e.untargetable = !!c.untargetable;
      c.ent = e;
      if (c.place) c.place(e, c.boss, 0);
    },
    update(e, dt) {
      const c = e.data.cfg, b = c.boss;
      if (!b || b.dead || b.defeated) { e.dead = true; return; }
      e.vx = 0;
      e.vy = 0;
      if (c.place) c.place(e, b, dt);
      e.invuln = !!(b.invuln || c.shut);
      // a dying boss is a harmless wreck: its parts stop dealing contact damage
      e.intangible = !!(c.intangible || b.dying);
      e.armor = c.mult || 1;
      if (e.data.mark > 0) e.data.mark -= dt;
      if (c.infinite) e.hp = e.maxHp;
    },
    onHit(e, dmg, o) {
      const c = e.data.cfg;
      if (c.infinite) e.hp = e.maxHp;
      if (o && o.type === 'bomb') return;
      hurtBoss(c.boss, dmg);
      if (c.weak) { e.data.mark = 0.1; e.data.mx = o && o.x != null ? o.x : e.x; e.data.my = o && o.y != null ? o.y : e.y; }
      if (c.onHit) c.onHit(e, dmg, o);
    },
    onDeath(e) {
      const c = e.data.cfg, b = c.boss;
      e.data.broken = true;
      c.broken = true;
      SL.fx.explode(e.x, e.y, { size: 'l', palette: c.palette || 'enemy' });
      sfx('boss_part_break', { x: e.x });
      shed(e.x, e.y, 14, e.r * 1.4, c.debris || '#3a3f55');
      if (b && !b.dying && !b.dead) hurtBoss(b, c.bonus || 0);
      if (c.onBreak) c.onBreak(e, b);
    },
  };
  /** Spawns a hidden part enemy: cfg {key, hp, r, circles, mult, bonus, place(e, b, dt), onBreak, weak, infinite}. */
  function addPart(b, cfg) {
    cfg.boss = b;
    const hp = cfg.infinite ? 1e9 : cfg.hp;
    const e = SL.spawnEnemy(PART, { x: b.x, y: b.y, hp, noCount: true, offscreenKill: false, cfg });
    e.typeId = 'b13_part:' + cfg.key;
    // hp is scaled by diff.enemyHp like the boss (co-op x1.35 comes with it)
    (b.data.parts || (b.data.parts = {}))[cfg.key] = cfg;
    return cfg;
  }
  function partAlive(c) { return !!(c && c.ent && !c.ent.dead && !c.broken); }
  /** Removes surviving parts without break bonuses (phase changes, death). */
  function dropPart(c, boom, palette) {
    if (!c || !c.ent || c.ent.dead) return;
    if (boom) SL.fx.explode(c.ent.x, c.ent.y, { size: boom, palette: palette || 'enemy', sound: false });
    c.ent.dead = true;
    c.gone = true;
  }
  function dropAllParts(b) {
    const P = b.data.parts;
    if (P) for (const k in P) dropPart(P[k]);
  }
  /** Yellow-white weak-point hit marker (GDD 8 common rules). */
  function drawMark(ctx, c) {
    const e = c && c.ent;
    if (!e || !(e.data.mark > 0)) return;
    const k = e.data.mark / 0.1;
    A.drawGlow(ctx, e.data.mx, e.data.my, 16 + 14 * k, '#fff3b0', 0.9 * k);
    const rg = A.ring('#fff3b0', 32, 3);
    const r = 12 + 16 * (1 - k);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k;
    ctx.drawImage(rg, e.data.mx - r, e.data.my - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ common boss beats
  function shed(x, y, n, spread, color) {
    for (let i = 0; i < n; i++) {
      const a = -HALF + (Math.random() - 0.5) * 2.8;
      const sp = 120 + Math.random() * 280;
      SL.fx.emit({
        x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread * 0.6,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, gravity: 560, drag: 0.4, life: 1 + Math.random() * 0.7,
        size: 5 + Math.random() * 10, color: color || '#4a5068', shape: 'debris', spin: (Math.random() - 0.5) * 16,
        rot: Math.random() * TAU, blend: 'normal', alpha: 1, alpha2: 0.85,
      });
    }
  }
  function glints(x, y, n, spread, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = 160 + Math.random() * 420;
      SL.fx.emit({
        x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp, drag: 1.6, life: 0.5 + Math.random() * 0.6, size: 3 + Math.random() * 4, size2: 1,
        color: '#ffffff', color2: color || '#8fb3ff', shape: 'spark', stretch: 3,
      });
    }
  }
  /** Phase break (GDD 8): 2,000 x multiplier, PHASE BREAK text, armor debris, stinger. */
  function phaseBreak(b, pts, color) {
    const s = SL.game.session, m = (s && s.mult) || 1;
    SL.game.addScore(2000 * m, b.x, b.y + 40);
    SL.fx.text(b.x, b.y - 20, 'PHASE BREAK', { color: '#ffe9a0', size: 34, life: 1.4, rise: 46, weight: 800 });
    sfx('boss_phase');
    if (pts) for (const p of pts) shed(b.x + p[0], b.y + p[1], 8, 50, color);
  }
  /** Smoke and sparks from damage points as HP drops (update side). */
  function damageFx(b, dt, pts, palette) {
    const f = b.hp / b.maxHp;
    const lvl = f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
    if (!lvl || !pts || !pts.length) return;
    const rate = lvl === 2 ? 9 : 3.5;
    if (Math.random() < rate * dt) {
      const p = pts[(Math.random() * pts.length) | 0];
      const x = b.x + p[0], y = b.y + p[1];
      SL.fx.emit({ x, y, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 40, life: 1.1, size: 14, size2: 40, color: '#2a2633', alpha: 0.55, alpha2: 0, shape: 'smoke', blend: 'normal', drag: 0.6 });
      if (Math.random() < 0.5) SL.fx.sparks(x, y, { count: lvl * 3, color: palette || '#ffb070', speed: 260, life: 0.35 });
    }
  }
  function creditShower(x, y, n, big) {
    const P = SL.pickups;
    for (let i = 0; i < n + big; i++) {
      const a = Math.random() * TAU, sp = 90 + Math.random() * 320;
      const id = i < big ? 'credit_big' : 'credit';
      const o = { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 150 };
      const px = x + Math.cos(a) * 26, py = y + Math.sin(a) * 18;
      try {
        if (P && typeof P.spawn === 'function') P.spawn(id, px, py, o);
        else if (SL.world.spawnPickup) SL.world.spawnPickup(id, px, py, o);
      } catch (err) { U.warnOnce('b13:credits', 'bossesB: credit shower failed', err); return; }
    }
  }
  /** Ends a death sequence: big blast, credit shower, then the core hand-off. */
  function finish(b, palette, shower) {
    if (b.defeated || b.data.finished) return;
    b.data.finished = true;
    SL.fx.explode(b.x, b.y, { size: 'boss', palette });
    SL.fx.shockwave(b.x, b.y, { radius: 820, duration: 1.3, strength: 2.1 });
    creditShower(b.x, b.y, shower[0], shower[1]);
    SL.game.bossDefeated(b);
  }
  /** Chained explosions over a boss's hit circles. */
  function chain(b, dt, rate, palette, scale) {
    b.data.chainT = (b.data.chainT || 0) - dt;
    if (b.data.chainT > 0) return;
    b.data.chainT = rate * (0.6 + Math.random() * 0.8);
    const cs = b.circles && b.circles.length ? b.circles : [{ x: 0, y: 0, r: b.r }];
    const c = cs[(Math.random() * cs.length) | 0];
    const a = Math.random() * TAU, r = Math.random() * c.r;
    const big = Math.random() < 0.28;
    SL.fx.explode(b.x + c.x + Math.cos(a) * r, b.y + c.y + Math.sin(a) * r, { size: big ? 'l' : 'm', palette, sound: Math.random() < 0.55, scale: scale || 1, shake: big });
  }
  function banner(text, sub, color) {
    if (SL.hud && typeof SL.hud.banner === 'function') {
      try { SL.hud.banner(text, { sub, color: color || '#ff5c8a', duration: 1.8 }); } catch (err) { U.warnOnce('b13:banner', err); }
    }
  }
  function radio(id, opts) {
    if (SL.story && typeof SL.story.radio === 'function') {
      try { SL.story.radio(id, opts); } catch (err) { U.warnOnce('b13:radio:' + id, 'bossesB: radio failed', err); }
    }
  }
  function hazardsHas(id) { return !!(SL.hazards && SL.hazards.has && SL.hazards.has(id)); }
  function hasEnemy(id) { return !!(SL.enemies && SL.enemies.has && SL.enemies.has(id)); }

  // ------------------------------------------------------------------ drawing helpers
  function xf(ctx, x, y, rot, sx, sy) {
    if (sx == null) sx = 1;
    SL.render.setTransform(ctx, x, y, rot || 0, sx, sy == null ? sx : sy);
  }
  function unxf(ctx) {
    const b = SL.render.base;
    ctx.setTransform(b.s, 0, 0, b.s, b.x, b.y);
  }
  /** Engine plume in any direction (A.flame points +y). */
  function plume(ctx, x, y, w, len, ang, inner, outer, t) {
    xf(ctx, x, y, ang - HALF);
    A.flame(ctx, 0, 0, w, len, inner, outer, t);
    unxf(ctx);
  }
  function hexPath(cx, cy, r, rot, sy) {
    const p = new Path2D();
    for (let i = 0; i < 6; i++) {
      const a = (rot || 0) + (i / 6) * TAU;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * (sy || 1);
      if (i) p.lineTo(x, y); else p.moveTo(x, y);
    }
    p.closePath();
    return p;
  }
  function circ(cx, cy, r) { const p = new Path2D(); p.arc(cx, cy, r, 0, TAU); return p; }
  function box(x, y, w, h) { return { x, y, w, h }; }
  function rbox(cx, cy, r) { return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }; }
  /** Material grime: dark noise mottling plus fine light speckle, only on existing pixels (generators only). */
  function grime(ctx, w, h, seed, amt) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const n1 = A.noiseCanvas(Math.ceil(cw / 2), Math.ceil(ch / 2), { scale: 26, octaves: 4, seed, palette: [[0, '#000000', 0], [0.55, '#000000', 0], [1, '#05060a', 0.75]] });
    const n2 = A.noiseCanvas(Math.ceil(cw / 2), Math.ceil(ch / 2), { scale: 7, octaves: 2, seed: seed + 7, palette: [[0, '#ffffff', 0], [0.8, '#ffffff', 0], [1, '#dfe8ff', 0.5]] });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.55 * (amt || 1);
    ctx.drawImage(n1, 0, 0, cw, ch);
    ctx.globalAlpha = 0.18 * (amt || 1);
    ctx.drawImage(n2, 0, 0, cw, ch);
    ctx.restore();
  }
  /** Line of rivets / lights. */
  function dots(ctx, pts, r, color, glow) {
    ctx.save();
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.fillStyle = color;
    for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function lineP(pts) { return A.poly(pts, true); }
  /** Scorch blotches and glowing fissures for damage overlays (generators only). */
  function scorch(ctx, x, y, r, seed) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(8,6,10,0.92)');
    g.addColorStop(0.45, 'rgba(18,12,16,0.6)');
    g.addColorStop(1, 'rgba(20,14,18,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    // fissures
    let s = seed * 9301 + 49297;
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      let a = rand() * TAU, px = x, py = y;
      const path = new Path2D();
      path.moveTo(px, py);
      const n = 3 + ((rand() * 3) | 0);
      for (let i = 0; i < n; i++) {
        a += (rand() - 0.5) * 1.3;
        const l = r * (0.18 + rand() * 0.25);
        px += Math.cos(a) * l;
        py += Math.sin(a) * l;
        path.lineTo(px, py);
      }
      ctx.shadowColor = '#ff7a3d';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(255,140,70,0.95)';
      ctx.lineWidth = 2.2;
      ctx.stroke(path);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,236,200,0.9)';
      ctx.lineWidth = 0.8;
      ctx.stroke(path);
    }
    ctx.restore();
  }
  /** Clip helper for sprites: draws fn inside the given path. */
  function clipped(ctx, path, fn) { ctx.save(); ctx.clip(path); fn(); ctx.restore(); }

  // phase jump for tests: SL.bossesB.jump(2) drops the current boss just under phase 2's threshold
  B13.jump = function (i) {
    const b = SL.game.boss;
    if (!b || !b.phases || !b.phases[i]) return false;
    b.hp = Math.min(b.hp, b.phases[i].at * b.maxHp - 1);
    return true;
  };
  Object.assign(B13, { target, aim, fire, ring, fan, flower, addPart, hurtBoss });

  // ================================================================== MANTIS (mb_mantis, s3) + mantis_pass
  const MANTIS_ROLLS = [-0.46, -0.23, 0, 0.23, 0.46];
  function drawMantisArt(ctx, w, h, roll) {
    ctx.translate(w / 2, h / 2);
    const sh = Math.sin(roll);
    const kR = Math.cos(roll) - 0.14 * sh, kL = Math.cos(roll) + 0.14 * sh;
    const bx = -roll * 5;
    const BODY = { x: -24, y: -84, w: 48, h: 160 };
    // ---- wings (forward swept: tips ahead of the roots, toward the nose at +y)
    const wing = (side, k) => {
      ctx.save();
      ctx.translate(bx + side * 14, 0);
      ctx.scale(side * k, 1);
      const P = A.poly([[2, -56], [70, 6], [77, 17], [75, 36], [68, 37], [1, -8]]);
      const lit = side < 0 ? 0.08 : -0.04;
      const base = C.lighten('#1b3326', U.clamp(0.1 + lit - side * sh * 0.12, 0, 0.32));
      A.metal(ctx, P, { base, light: '#8fd0a8', dark: '#050a07', spec: 0.62, specPos: 0.3, bounds: box(0, -56, 78, 94), edge: 1.4, rimLight: 2 });
      clipped(ctx, P, () => {
        // darker trailing flap band and a lighter leading-edge strip
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fill(A.poly([[2, -56], [70, 6], [62, 9], [2, -42]]));
        ctx.fillStyle = 'rgba(190,255,220,0.07)';
        ctx.fill(A.poly([[1, -8], [75, 36], [72, 30], [1, -16]]));
      });
      A.panelLines(ctx, lineP([[6, -38], [64, 14]]), '#000', 0.6);
      A.panelLines(ctx, lineP([[20, -20], [22, -36]]), '#000', 0.5);
      A.panelLines(ctx, lineP([[44, 4], [46, -14]]), '#000', 0.5);
      A.emissive(ctx, lineP([[2, -10], [72, 33]]), PE.seam, 6, { stroke: 1.3 });
      A.emissive(ctx, lineP([[62, 8], [70, 22]]), PE.seam, 5, { stroke: 1 });
      // wingtip light
      dots(ctx, [[73, 26]], 1.8, side < 0 ? '#ff4f6a' : '#7dffb0', 6);
      if (side > 0) {
        // kill tally: 40 white marks in groups of five on the right wing
        ctx.strokeStyle = 'rgba(240,246,255,0.92)';
        ctx.lineWidth = 0.9;
        for (let row = 0; row < 2; row++) {
          for (let g = 0; g < 4; g++) {
            const ox = 16 + g * 11 + row * 4, oy = -27 + g * 9.4 + row * 8;
            for (let i = 0; i < 4; i++) {
              ctx.beginPath();
              ctx.moveTo(ox + i * 1.9, oy - 2.4);
              ctx.lineTo(ox + i * 1.9, oy + 2.4);
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(ox - 1, oy + 2);
            ctx.lineTo(ox + 6.6, oy - 2);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    };
    wing(-1, kL);
    wing(1, kR);
    // tailplanes
    for (const s of [-1, 1]) {
      const k = s < 0 ? kL : kR;
      ctx.save();
      ctx.translate(bx + s * 12, 0);
      ctx.scale(s * k, 1);
      const T = A.poly([[2, -66], [30, -84], [35, -80], [4, -54]]);
      A.metal(ctx, T, { base: '#22392c', light: '#8fd0a8', spec: 0.5, bounds: box(0, -84, 36, 32), edge: 1.2, rimLight: 1.4 });
      A.emissive(ctx, lineP([[6, -64], [30, -80]]), PE.seam, 4, { stroke: 0.9 });
      ctx.restore();
    }
    ctx.save();
    ctx.translate(bx, 0);
    // ---- engine nacelles (twin violet)
    for (const s of [-1, 1]) {
      const N = new Path2D();
      N.roundRect(s * 13 - 7, -84, 14, 46, 5);
      A.metal(ctx, N, { base: '#262b33', spec: 0.6, bounds: box(s * 13 - 7, -84, 14, 46), edge: 1.2, rimLight: 1.2 });
      const nz = circ(s * 13, -82, 5.2);
      ctx.fillStyle = '#0b0912';
      ctx.fill(nz);
      A.emissive(ctx, circ(s * 13, -82, 3.2), VIOLET, 8);
      A.panelLines(ctx, lineP([[s * 13 - 6, -66], [s * 13 + 6, -66]]), '#000', 0.6);
    }
    // ---- fuselage
    const F = A.symPath(0, [[0, -80], [8, -78], [15, -66], [17, -44], [13, -18], [15, 4], [12, 26], [8, 44], [4, 58], [0, 66]]);
    A.metal(ctx, F, { base: '#2a4434', light: '#a8e6c0', dark: '#060c08', spec: 0.7, specPos: 0.3, bounds: BODY });
    clipped(ctx, F, () => {
      const g = ctx.createLinearGradient(-16, 0, 16, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.45, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.fill(F);
    });
    A.panelLines(ctx, lineP([[0, -76], [0, -26]]), '#000', 0.55);
    A.panelLines(ctx, lineP([[-12, -30], [12, -30]]), '#000', 0.5);
    A.panelLines(ctx, lineP([[-11, 44], [11, 44]]), '#000', 0.45);
    A.emissive(ctx, lineP([[-14, -46], [-9, -14], [-11, 6]]), PE.seam, 5, { stroke: 1 });
    A.emissive(ctx, lineP([[14, -46], [9, -14], [11, 6]]), PE.seam, 5, { stroke: 1 });
    // spine intakes
    for (const s of [-1, 1]) {
      const I = A.poly([[s * 6, -48], [s * 15, -40], [s * 15, -26], [s * 6, -30]]);
      ctx.fillStyle = '#07090c';
      ctx.fill(I);
      A.panelLines(ctx, I, '#6f8a7a', 0.35);
    }
    // ---- canopy: smoked glass with a violet streak (toward the nose)
    const CP = A.symPath(0, [[0, 2], [6, 8], [7.5, 22], [5, 34], [0, 40]]);
    const cg = ctx.createLinearGradient(-8, 4, 8, 40);
    cg.addColorStop(0, '#3a2a55');
    cg.addColorStop(0.5, '#120c1e');
    cg.addColorStop(1, '#05040a');
    ctx.fillStyle = cg;
    ctx.fill(CP);
    ctx.save();
    ctx.clip(CP);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(214,160,255,0.75)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-5, 8);
    ctx.quadraticCurveTo(-2, 20, -4, 34);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,120,200,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3, 10);
    ctx.lineTo(4, 26);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(10,12,16,0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke(CP);
    // ---- scythe nose blade (asymmetric hook to the left)
    const S = new Path2D();
    S.moveTo(3, 54);
    S.quadraticCurveTo(6, 76, -10, 84);
    S.quadraticCurveTo(-32, 92, -54, 72);
    S.quadraticCurveTo(-30, 82, -14, 74);
    S.quadraticCurveTo(-3, 68, -4, 56);
    S.closePath();
    A.metal(ctx, S, { base: '#3c4150', light: '#dfe6f5', spec: 0.85, specPos: 0.4, bounds: box(-54, 54, 60, 38), edge: 1, rimLight: 1.5 });
    const edge = new Path2D();
    edge.moveTo(5, 60);
    edge.quadraticCurveTo(6, 78, -10, 85);
    edge.quadraticCurveTo(-32, 93, -54, 72);
    A.emissive(ctx, edge, '#ff4f8f', 7, { stroke: 1.4 });
    ctx.restore();
  }
  function defineMantisArt() {
    MANTIS_ROLLS.forEach((roll, i) => A.define('b13:mantis:' + i, 180, 160, (ctx, w, h) => {
      drawMantisArt(ctx, w, h, roll);
      grime(ctx, w + 8, h + 8, 31 + i, 0.6);
    }, { pad: 4, res: 2 }));
    // afterimage for dodge dashes and dives
    A.define('b13:mantis:ghost', 180, 160, (ctx, w, h) => {
      const c = A.canvas(w + 24, h + 24);
      const x = c.getContext('2d');
      x.translate(12, 12);
      drawMantisArt(x, w, h, 0);
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#c070ff';
      x.fillRect(0, 0, c.width, c.height);
      ctx.save();
      ctx.shadowColor = '#b26bff';
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(c, -12, -12);
      ctx.restore();
    }, { pad: 10 });
  }
  defineMantisArt();

  function mantisFrame(roll) {
    let best = 2, bd = 9;
    for (let i = 0; i < MANTIS_ROLLS.length; i++) {
      const d = Math.abs(MANTIS_ROLLS[i] - roll);
      if (d < bd) { bd = d; best = i; }
    }
    return 'b13:mantis:' + best;
  }
  /** Draws MANTIS facing `ang` (PI/2 = down) with plumes; shared by the boss and the flyby. */
  function drawMantis(ctx, x, y, ang, roll, t, o) {
    o = o || {};
    const rot = ang - HALF;
    const c = Math.cos(rot), s = Math.sin(rot);
    const thrust = o.thrust || 1;
    for (const sx of [-13, 13]) {
      const ex = x + c * (sx - roll * 5) - s * -84, ey = y + s * (sx - roll * 5) + c * -84;
      plume(ctx, ex, ey, 11, 30 + 26 * thrust, ang + PI, '#ffffff', VIOLET, t + sx);
    }
    A.drawSprite(ctx, mantisFrame(roll), x, y, rot, 1, o.alpha == null ? 1 : o.alpha);
    if (o.flash > 0) A.drawFlash(ctx, mantisFrame(roll), x, y, rot, 1, Math.min(1, o.flash / 0.06) * 0.35);
    // engine cores and blade glint
    for (const sx of [-13, 13]) {
      const ex = x + c * sx - s * -82, ey = y + s * sx + c * -82;
      A.drawGlow(ctx, ex, ey, 10 + 3 * Math.sin(t * 31 + sx), VIOLET, 0.9);
    }
    const nx = x - s * 78 + c * -22, ny = y + c * 78 + s * -22;
    A.drawGlow(ctx, nx, ny, 9 + 6 * (0.5 + 0.5 * Math.sin(t * 3.1)), '#ff4f8f', 0.55);
  }

  const MANTIS_CIRCLES = [[0, -14, 24], [0, 30, 20], [-44, -10, 19], [44, -10, 19], [-70, 18, 13], [70, 18, 13]];
  function placeCircles(b, base, rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < base.length; i++) {
      const q = base[i], o = b.circles[i];
      o.x = q[0] * c - q[1] * s;
      o.y = q[0] * s + q[1] * c;
    }
  }
  /** Rigged gold mines (s3 rig_field): any mine_field hazard exposing mines with rigged/gold flags. */
  function riggedMines(out) {
    out.length = 0;
    for (const h of SL.world.hazards) {
      if (h.dead) continue;
      const id = h.typeId || (h.def && h.def.id);
      if (id !== 'mine_field') continue;
      const list = h.mines || (h.data && h.data.mines);
      if (!list) continue;
      for (const m of list) if (m && !m.dead && (m.rigged || m.gold) && m.x != null) out.push({ m, h });
    }
    for (const pr of SL.world.props) {
      if (pr.dead) continue;
      if (pr.rigged || pr.gold || (pr.data && (pr.data.rigged || pr.data.gold))) out.push({ m: pr, h: null });
    }
    return out;
  }
  const MINES = [];
  function mantisMines(b) {
    riggedMines(MINES);
    for (const it of MINES) {
      const m = it.m, r = (m.r || 12) + 34;
      if (U.dist2(m.x, m.y, b.x, b.y) > r * r) continue;
      const h = it.h;
      let done = false;
      if (h && h.def && typeof h.def.detonate === 'function') {
        try { h.def.detonate(h, m, b); done = true; } catch (err) { U.warnOnce('b13:detonate', err); }
      }
      if (!done) { m.dead = true; SL.fx.explode(m.x, m.y, { size: 'm', palette: 'gold' }); }
      SL.damageEnemy(b, 600, { type: 'mine', x: m.x, y: m.y });
      SL.fx.text(b.x, b.y - 60, 'RIGGED MINE  -600', { color: '#ffd34d', size: 24, life: 1.1 });
    }
  }
  /** MANTIS reads the player's fire: a shot line within 40 px triggers a 120 px dodge-dash. */
  function shotLineNear(b) {
    for (const pb of SL.world.pbullets) {
      if (pb.dead || pb.vy > -150 || pb.y < b.y || pb.y > b.y + 760) continue;
      if (Math.abs(pb.x - b.x) < 40) return pb.x;
    }
    for (const bm of SL.world.beams) {
      if (bm.dead || !bm.active) continue;
      const dx = Math.cos(bm.angle), dy = Math.sin(bm.angle);
      const px = b.x - bm.x, py = b.y - bm.y;
      if (px * dx + py * dy < 0) continue;
      if (Math.abs(px * -dy + py * dx) < 40 + (bm.width || 20) * 0.5) return bm.x;
    }
    return null;
  }

  function mantisStrafe(b, dt, speed) {
    const d = b.data;
    if (!d.wp || U.dist2(b.x, b.y, d.wp.x, d.wp.y) < 34 * 34) {
      let x = rnd(90, 630);
      if (Math.abs(x - b.x) < 200) x = b.x < 360 ? rnd(420, 640) : rnd(80, 300);
      d.wp = { x, y: rnd(200, 500) };
    }
    const a = Math.atan2(d.wp.y - b.y, d.wp.x - b.x);
    const k = Math.min(1, dt * 3.2);
    b.vx = U.lerp(b.vx, Math.cos(a) * speed, k);
    b.vy = U.lerp(b.vy, Math.sin(a) * speed, k);
  }
  function mantisNose(b) {
    const a = b.data.face;
    return { x: b.x + Math.cos(a) * 70, y: b.y + Math.sin(a) * 70 };
  }
  function petalTrail(b) {
    const d = b.data;
    const a = d.dive.ang;
    for (const s of [-1, 1]) {
      const pa = a + s * HALF;
      fire(b.x + Math.cos(pa) * 26, b.y + Math.sin(pa) * 26, pa + s * 0.5, 70, 'petal', { turn: -s * 0.9, color: '#ff4fd8' });
    }
  }

  SL.bosses.define('mb_mantis', {
    name: 'MANTIS', title: 'Nyx Ace', hp: 5000, r: 74, score: 32000, parTime: 60, timeBonusRate: 250, transitionTime: 1.5,
    contactDamage: 20, explosion: 'xl', music: 'mus_miniboss', shower: [25, 3], manualMove: true,
    init(b) {
      b.circles = MANTIS_CIRCLES.map((q) => ({ x: q[0], y: q[1], r: q[2] }));
      const d = b.data;
      d.face = HALF;
      d.roll = 0;
      d.dodgeCd = 0;
      d.ghosts = [];
      d.ghostT = 0;
      d.stream = {};
      d.snipe = {};
      d.trailT = 0;
      b.x = 560;
      b.y = -160;
    },
    intro(b, dt) {
      // streaks in from the top, sweeps low across the field and climbs into a guard position
      const d = b.data;
      d.it = (d.it || 0) + dt;
      const k = U.clamp(d.it / 3.3, 0, 1), e = SL.ease.inOutSine(k);
      const P0 = [560, -160], P1 = [480, 980], P2 = [-60, 520], P3 = [360, 250];
      const u = 1 - e;
      const px = u * u * u * P0[0] + 3 * u * u * e * P1[0] + 3 * u * e * e * P2[0] + e * e * e * P3[0];
      const py = u * u * u * P0[1] + 3 * u * u * e * P1[1] + 3 * u * e * e * P2[1] + e * e * e * P3[1];
      const vx = (px - b.x) / Math.max(dt, 1e-4), vy = (py - b.y) / Math.max(dt, 1e-4);
      b.x = px;
      b.y = py;
      if (k < 0.97 && (Math.abs(vx) + Math.abs(vy) > 40)) d.face = U.lerpAngle(d.face, Math.atan2(vy, vx), Math.min(1, dt * 8));
      else d.face = U.lerpAngle(d.face, HALF, Math.min(1, dt * 6));
      d.roll = U.lerp(d.roll, U.clamp(-U.angleDiff(d.face, Math.atan2(vy, vx)) * 2, -0.46, 0.46), Math.min(1, dt * 6));
      d.thrust = 1.6;
      if (!d.roared && k > 0.6) { d.roared = true; sfx('boss_roar'); }
      placeCircles(b, MANTIS_CIRCLES, d.face - HALF);
      return k >= 1;
    },
    update(b, dt) {
      const d = b.data;
      runJobs(b, dt);
      mantisMines(b);
      if (d.dodgeCd > 0) d.dodgeCd -= dt;
      // dodge-dash (phases 1-2)
      if (d.dash) {
        d.dash.t += dt;
        const k = U.clamp(d.dash.t / d.dash.dur, 0, 1);
        b.x = U.lerp(d.dash.x0, d.dash.x1, SL.ease.outCubic(k));
        d.roll = d.dash.dir * 0.46;
        if (k >= 1) d.dash = null;
      } else if (b.phase < 2 && !d.dive && d.dodgeCd <= 0 && !(b.transitionT > 0)) {
        const lx = shotLineNear(b);
        if (lx != null) {
          let dir = b.x >= lx ? 1 : -1;
          if (b.x + dir * 120 > 650 || b.x + dir * 120 < 70) dir = -dir;
          d.dash = { t: 0, dur: 0.2, x0: b.x, x1: U.clamp(b.x + dir * 120, 70, 650), dir };
          d.dodgeCd = 1.5;
          b.vx = 0;
        }
      }
      if (!d.dive && !d.dash) {
        mantisStrafe(b, dt, d.slow ? 170 : 320);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        d.face = U.lerpAngle(d.face, aim(b, b.x, b.y) * 0.25 + HALF * 0.75, Math.min(1, dt * 4));
        d.roll = U.lerp(d.roll, U.clamp(b.vx / 320 * 0.46, -0.46, 0.46), Math.min(1, dt * 5));
        d.thrust = 0.8 + Math.min(1, Math.hypot(b.vx, b.vy) / 320) * 0.6;
      }
      b.x = U.clamp(b.x, -200, W + 200);
      // afterimages while dashing or diving
      d.ghostT -= dt;
      if ((d.dash || (d.dive && d.dive.st === 'dash')) && d.ghostT <= 0) {
        d.ghostT = 0.035;
        d.ghosts.push({ x: b.x, y: b.y, a: d.face, r: d.roll, t: 0.22 });
        if (d.ghosts.length > 10) d.ghosts.shift();
      }
      for (let i = d.ghosts.length - 1; i >= 0; i--) { d.ghosts[i].t -= dt; if (d.ghosts[i].t <= 0) d.ghosts.splice(i, 1); }
      placeCircles(b, MANTIS_CIRCLES, d.face - HALF);
      damageFx(b, dt, [[-30, -12], [34, -6], [0, -40], [10, 20]], '#ff9a5c');
    },
    phases: [
      {
        at: 1, name: 'Dogfight',
        enter(b) {
          const d = b.data;
          d.jobs = [];
          d.streamT = 1.6;
          d.fanT = 1.0;
        },
        update(b, dt) {
          const d = b.data;
          d.streamT -= dt;
          if (d.streamT <= 0) { d.streamT = 3 / fr(); const n = mantisNose(b); streamStart(b, d.stream, n.x, n.y, 1.0); sfx('enemy_fire', { x: b.x }); }
          const n = mantisNose(b);
          streamStep(b, d.stream, n.x, n.y, dt, { rate: 12, speed: 320, track: 0.6, opts: { color: '#ff4fd8' } });
          d.fanT -= dt;
          if (d.fanT <= 0) { d.fanT = 2 / fr(); fan(n.x, n.y, aim(b, n.x, n.y), 5, 0.9, 320, 'needle', { color: VIOLET }); }
        },
      },
      {
        at: 0.6, name: 'Scythe',
        enter(b) {
          const d = b.data;
          d.jobs = [];
          d.stream.left = 0;
          d.diveT = 1.4;
          d.escortT = 2.2;
          d.fanT = 2.4;
          phaseBreak(b, [[-40, -10], [40, -10]], '#1d2e25');
        },
        update(b, dt) {
          const d = b.data;
          d.escortT -= dt;
          if (d.escortT <= 0) {
            d.escortT = 12;
            if (hasEnemy('dart')) for (const s of [-1, 1]) SL.spawnEnemy('dart', { x: U.clamp(b.x + s * 90, 60, 660), y: -50 });
          }
          if (!d.dive) {
            d.diveT -= dt;
            d.fanT -= dt;
            if (d.fanT <= 0) { d.fanT = 2 / fr(); const n = mantisNose(b); fan(n.x, n.y, aim(b, n.x, n.y), 5, 0.9, 320, 'needle', { color: VIOLET }); }
            if (d.diveT <= 0 && !d.dash) {
              const t = target(b);
              d.dive = { st: 'aim', t: 0, tx: t.x, ty: t.y, ang: Math.atan2(t.y - b.y, t.x - b.x) };
              sfx('enemy_charge', { x: b.x });
            }
            return;
          }
          const v = d.dive;
          v.t += dt;
          if (v.st === 'aim') {
            const t = target(b);
            // the line locks onto the lane; MANTIS shivers in place, nose down the line
            if (v.t < 0.45) { v.tx = t.x; v.ty = t.y; }
            v.ang = Math.atan2(v.ty - b.y, v.tx - b.x);
            b.vx *= Math.max(0, 1 - dt * 8);
            b.vy *= Math.max(0, 1 - dt * 8);
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            d.face = U.lerpAngle(d.face, v.ang, Math.min(1, dt * 12));
            d.roll = U.lerp(d.roll, 0, Math.min(1, dt * 6));
            if (v.t >= 0.7) { v.st = 'dash'; v.t = 0; v.trail = 0; d.thrust = 2.2; SL.fx.shake(4, 0.2); }
          } else if (v.st === 'dash') {
            const sp = 800;
            b.x += Math.cos(v.ang) * sp * dt;
            b.y += Math.sin(v.ang) * sp * dt;
            d.face = v.ang;
            v.trail += sp * dt;
            while (v.trail >= 46) { v.trail -= 46; if (b.y > 0 && b.y < H) petalTrail(b); }
            if (b.y > H + 140 || b.x < -160 || b.x > W + 160 || b.y < -220) {
              v.st = 'back';
              v.t = 0;
              b.x = rnd(140, 580);
              b.y = -150;
              d.face = HALF;
              b.vx = 0;
              b.vy = 520;
            }
          } else {
            // re-enters from the top and climbs back into the dogfight
            b.vy = U.approach(b.vy, 0, 700 * dt);
            b.y += b.vy * dt;
            d.face = U.lerpAngle(d.face, HALF, Math.min(1, dt * 6));
            if (b.vy <= 40 || b.y > 380) { d.dive = null; d.diveT = 6 / fr(); d.wp = null; }
          }
        },
      },
      {
        at: 0.3, name: 'Last Stand',
        enter(b) {
          const d = b.data;
          d.jobs = [];
          if (d.dive) { d.dive = null; if (b.y > 600 || b.y < 0) { b.y = Math.min(b.y, 380); } }
          d.dash = null;
          d.slow = false;
          d.snipeT = 1.2;
          d.flowerT = 2.2;
          phaseBreak(b, [[-50, 0], [50, 0], [0, 30]], '#1d2e25');
        },
        update(b, dt) {
          const d = b.data;
          d.snipeT -= dt;
          d.slow = d.snipe.on;
          if (d.snipeT <= 0) { d.snipeT = 3 / fr(); const n = mantisNose(b); sniperStart(b, d.snipe, n.x, n.y); }
          const n = mantisNose(b);
          sniperStep(b, d.snipe, n.x, n.y, dt, { track: 1.0, lock: 0.25, shots: 3, gap: 0.08, speed: 620 });
          d.flowerT -= dt;
          if (d.flowerT <= 0) { d.flowerT = 4 / fr(); flower(b.x, b.y, 12, 150, Math.random() * TAU); }
        },
      },
    ],
    draw(b, ctx) {
      const d = b.data, t = SL.time.t;
      // dive telegraph: the line through the lane
      if (d.dive && d.dive.st === 'aim') {
        const k = U.clamp(d.dive.t / 0.7, 0, 1);
        const spr = SL.world.beamSprite('#ff4fd8');
        xf(ctx, b.x, b.y, d.dive.ang);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (0.3 + 0.5 * k) * (0.7 + 0.3 * Math.sin(t * 38));
        const w = 4 + 10 * k;
        ctx.drawImage(spr.canvas, 0, -w / 2, 1700, w);
        ctx.globalAlpha = 1;
        unxf(ctx);
        A.drawGlow(ctx, b.x + Math.cos(d.dive.ang) * 70, b.y + Math.sin(d.dive.ang) * 70, 20 + 20 * k, '#ff4fd8', 0.8);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const g of d.ghosts) A.drawSprite(ctx, 'b13:mantis:ghost', g.x, g.y, g.a - HALF, 1, (g.t / 0.22) * 0.3);
      ctx.globalCompositeOperation = 'source-over';
      let x = b.x, y = b.y, ang = d.face, roll = d.roll;
      if (b.dying) { ang += d.spin || 0; roll = Math.sin(t * 9) * 0.46; }
      drawMantis(ctx, x, y, ang, roll, t, { thrust: d.thrust || 1, flash: b.flash });
      if (d.snipe && d.snipe.on) drawSniper(ctx, d.snipe, { track: 1.0 });
      if (b.phase >= 2 && !b.dying) A.drawGlow(ctx, b.x, b.y, 70 + 8 * Math.sin(t * 7), '#ff2f6d', 0.18);
    },
    onDeath(b) {
      const d = b.data;
      d.spin = 0;
      d.cx = b.x;
      d.cy = b.y;
      d.sr = 60;
      d.ghosts.length = 0;
      d.snipe.on = false;
    },
    dying(b, dt) {
      // spirals down trailing fire
      const d = b.data, T = b.deathT;
      d.spin += dt * (3 + T * 4);
      d.cy += dt * (90 + T * 60);
      d.sr = Math.max(10, d.sr - dt * 14);
      b.x = d.cx + Math.cos(d.spin) * d.sr;
      b.y = d.cy + Math.sin(d.spin) * d.sr * 0.5;
      d.face = HALF + Math.sin(d.spin) * 0.6;
      for (let i = 0; i < 2; i++) SL.fx.emit({ x: b.x + rnd(-16, 16), y: b.y + rnd(-14, 14), vx: rnd(-40, 40), vy: rnd(-90, -40), life: 0.7, size: 30, size2: 8, color: '#fff0c0', color2: '#ff3b1f', shape: 'fire' });
      SL.fx.emit({ x: b.x, y: b.y, vx: rnd(-20, 20), vy: -30, life: 1.3, size: 16, size2: 44, color: '#25202a', alpha: 0.5, shape: 'smoke', blend: 'normal' });
      d.popT = (d.popT || 0) - dt;
      if (d.popT <= 0) { d.popT = 0.22; SL.fx.explode(b.x + rnd(-40, 40), b.y + rnd(-30, 30), { size: 'm', sound: Math.random() < 0.6 }); }
      if (T >= 2.7 && !d.finished) {
        d.finished = true;
        SL.fx.explode(b.x, b.y, { size: 'xl' });
        SL.fx.shockwave(b.x, b.y, { radius: 520, duration: 0.9, strength: 1.5, color: '#ff9ab8' });
        creditShower(b.x, b.y, 25, 3);
        SL.game.bossDefeated(b);
      }
    },
  });

  // ---- flyby: MANTIS art on an invulnerable crossing enemy (missions: call mantis_flyby)
  const PASS_PATHS = {
    diag_lr: { from: [-150, 150], to: [870, 760] },
    diag_rl: { from: [870, 150], to: [-150, 760] },
  };
  SL.enemies.define('mantis_pass', {
    name: 'MANTIS', hp: 100000, r: 58, score: 0, credits: 0, noCount: true, noClear: true, manualMove: true,
    offscreenKill: true, contactDamage: 20, noRam: true, explosion: 'l',
    init(e, o) {
      e.invuln = true;
      e.noClear = true;
      e.noCount = true;
      e.untargetable = true;
      const id = typeof o.path === 'string' && PASS_PATHS[o.path] ? o.path : (o.x != null && o.x > W / 2 ? 'diag_rl' : 'diag_lr');
      const P = PASS_PATHS[id];
      const dy = o.dy || 0;
      e.x = P.from[0];
      e.y = P.from[1] + dy;
      const a = Math.atan2(P.to[1] - P.from[1], P.to[0] - P.from[0]);
      const sp = o.speed || 520;
      e.vx = Math.cos(a) * sp;
      e.vy = Math.sin(a) * sp;
      e.data.ang = a;
      e.data.fire = !!o.fire;
      e.data.st = {};
      e.data.fired = false;
      e.data.roll = (P.to[0] > P.from[0] ? 1 : -1) * 0.23;
    },
    update(e, dt) {
      const d = e.data;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      d.roll = U.lerp(d.roll, 0.46 * Math.sign(e.vx) * Math.sin(e.age * 2.2), Math.min(1, dt * 3));
      if (d.fire && !d.fired && e.x > 120 && e.x < 600) {
        d.fired = true;
        const nx = e.x + Math.cos(d.ang) * 70, ny = e.y + Math.sin(d.ang) * 70;
        streamStart(e, d.st, nx, ny, 1.0);
      }
      if (d.st.left > 0) {
        const nx = e.x + Math.cos(d.ang) * 70, ny = e.y + Math.sin(d.ang) * 70;
        streamStep(e, d.st, nx, ny, dt, { rate: 12, speed: 320, track: 0.6, opts: { color: '#ff4fd8' } });
      }
      e.circles = null;
    },
    draw(e, ctx) {
      drawMantis(ctx, e.x, e.y, e.data.ang, e.data.roll, SL.time.t, { thrust: 1.6 });
    },
  });
  B13.drawMantis = drawMantis;

  // ================================================================== CRUCIBLE (mb_crucible, s4)
  const CRU_ARMS = [0, 60, 120, 180, 240, 300].map((d) => (d * PI) / 180);
  const CRU_CAGE_ARM = { cage_l: 2, cage_r: 1 }; // arm indices (120 deg = lower left, 60 deg = lower right)
  function defineCrucibleArt() {
    A.define('b13:cru:housing', 236, 236, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const ringP = new Path2D();
      ringP.arc(0, 0, 106, 0, TAU);
      ringP.arc(0, 0, 66, 0, TAU, true);
      A.metal(ctx, ringP, { base: '#3d4359', light: '#c9d2ea', spec: 0.6, specPos: 0.28, bounds: rbox(0, 0, 106) });
      // concentric bevels and radial plates
      ctx.save();
      ctx.clip(ringP);
      const bev = ctx.createRadialGradient(0, 0, 66, 0, 0, 106);
      bev.addColorStop(0, 'rgba(0,0,0,0.55)');
      bev.addColorStop(0.18, 'rgba(0,0,0,0)');
      bev.addColorStop(0.8, 'rgba(0,0,0,0)');
      bev.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = bev;
      ctx.fillRect(-110, -110, 220, 220);
      ctx.restore();
      for (let k = 0; k < 12; k++) {
        const a = (k + 0.5) * (TAU / 12);
        A.panelLines(ctx, lineP([[Math.cos(a) * 70, Math.sin(a) * 70], [Math.cos(a) * 104, Math.sin(a) * 104]]), '#000', 0.55);
      }
      A.panelLines(ctx, circ(0, 0, 88), '#000', 0.5);
      // heat vents between clamps
      for (let k = 0; k < 6; k++) {
        const a = (k + 0.5) * (TAU / 6);
        for (let j = -1; j <= 1; j++) {
          const aa = a + j * 0.09;
          const v = lineP([[Math.cos(aa) * 92, Math.sin(aa) * 92], [Math.cos(aa) * 101, Math.sin(aa) * 101]]);
          ctx.strokeStyle = '#0a0608';
          ctx.lineWidth = 3.2;
          ctx.stroke(v);
          A.emissive(ctx, v, '#ff8a5c', 5, { stroke: 1.2 });
        }
      }
      // six clamp blocks at the arm roots
      CRU_ARMS.forEach((a) => {
        ctx.save();
        ctx.rotate(a);
        const cl = A.poly([[80, -24], [118, -18], [118, 18], [80, 24]]);
        A.metal(ctx, cl, { base: '#545b75', light: '#e3e9f8', spec: 0.7, bounds: box(80, -24, 38, 48), edge: 1.6 });
        A.panelLines(ctx, lineP([[96, -20], [96, 20]]), '#000', 0.55);
        A.emissive(ctx, lineP([[84, -21], [116, -16]]), PE.seam, 5, { stroke: 1.1 });
        A.emissive(ctx, lineP([[84, 21], [116, 16]]), PE.seam, 5, { stroke: 1.1 });
        dots(ctx, [[88, -12], [88, 12], [110, -10], [110, 10]], 1.6, '#9aa3bd');
        ctx.restore();
      });
      // bright inner lip that frames the molten core
      const lip = new Path2D();
      lip.arc(0, 0, 70, 0, TAU);
      lip.arc(0, 0, 64, 0, TAU, true);
      A.metal(ctx, lip, { base: '#6a5a62', light: '#ffe2c8', spec: 0.5, bounds: rbox(0, 0, 70), edge: 0.6, rimLight: 1 });
      A.emissive(ctx, circ(0, 0, 66.5), '#ff9a5c', 9, { stroke: 1.6 });
      grime(ctx, w + 8, h + 8, 41, 0.7);
    }, { pad: 4 });
    A.define('b13:cru:housing_emis', 236, 236, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      A.emissive(ctx, circ(0, 0, 66.5), '#ffb070', 12, { stroke: 2.4 });
      for (let k = 0; k < 6; k++) {
        const a = (k + 0.5) * (TAU / 6);
        for (let j = -1; j <= 1; j++) {
          const aa = a + j * 0.09;
          A.emissive(ctx, lineP([[Math.cos(aa) * 92, Math.sin(aa) * 92], [Math.cos(aa) * 101, Math.sin(aa) * 101]]), '#ff8a5c', 8, { stroke: 1.6 });
        }
      }
    }, { pad: 10 });
    A.define('b13:cru:magma', 136, 136, (ctx, w, h) => {
      const n = A.noiseCanvas(136, 136, { scale: 38, octaves: 5, seed: 77, warp: 1.6, palette: [[0, '#3a0c4a'], [0.3, '#8a35d8'], [0.5, '#c25ad8'], [0.62, '#ff6a3d'], [0.8, '#ffb070'], [1, '#fff4d8']] });
      ctx.save();
      ctx.beginPath();
      ctx.arc(68, 68, 68, 0, TAU);
      ctx.clip();
      ctx.drawImage(n, 0, 0);
      const g = ctx.createRadialGradient(68, 68, 10, 68, 68, 68);
      g.addColorStop(0, 'rgba(255,240,210,0.35)');
      g.addColorStop(0.6, 'rgba(255,140,80,0)');
      g.addColorStop(1, 'rgba(40,0,60,0.7)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 136, 136);
      ctx.restore();
    }, { pad: 1 });
    A.define('b13:cru:swirl', 136, 136, (ctx) => {
      const n = A.noiseCanvas(136, 136, { scale: 30, octaves: 4, seed: 91, warp: 2.2, ridged: true, palette: [[0, '#000000', 0], [0.55, '#ff8a5c', 0], [0.8, '#ff9a5c', 0.55], [1, '#fff0d0', 0.9]] });
      ctx.save();
      ctx.beginPath();
      ctx.arc(68, 68, 64, 0, TAU);
      ctx.clip();
      ctx.drawImage(n, 0, 0);
      ctx.restore();
    }, { pad: 1 });
    A.define('b13:cru:arm', 186, 56, (ctx, w, h) => {
      ctx.translate(0, h / 2);
      const beam = A.poly([[0, -19], [128, -12], [150, -9], [150, 9], [128, 12], [0, 19]]);
      A.metal(ctx, beam, { base: '#454b63', light: '#d8deef', spec: 0.62, specPos: 0.3, bounds: box(0, -19, 150, 38) });
      clipped(ctx, beam, () => {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, 4, 150, 16);
      });
      A.panelLines(ctx, lineP([[6, 0], [146, 0]]), '#000', 0.45);
      A.panelLines(ctx, lineP([[30, -17], [30, 17]]), '#000', 0.5);
      // violet magnetic coils
      for (const cx of [52, 84, 114]) {
        const coil = new Path2D();
        coil.ellipse(cx, 0, 6, 17 - cx * 0.03, 0, 0, TAU);
        ctx.fillStyle = '#1a1424';
        ctx.fill(coil);
        A.emissive(ctx, coil, VIOLET, 8, { stroke: 1.8 });
        A.metal(ctx, A.poly([[cx - 2, -18], [cx + 2, -18], [cx + 2, 18], [cx - 2, 18]]), { base: '#6a7090', spec: 0.6, edge: 0.6, rimLight: 0.8, bounds: box(cx - 2, -18, 4, 36) });
      }
      // claw tip: two curved prongs
      for (const s of [-1, 1]) {
        const pr = new Path2D();
        pr.moveTo(146, s * 6);
        pr.quadraticCurveTo(166, s * 8, 184, s * 22);
        pr.quadraticCurveTo(168, s * 16, 150, s * 13);
        pr.closePath();
        A.metal(ctx, pr, { base: '#373c50', light: '#c8cfe4', spec: 0.7, bounds: box(146, -24, 40, 48), edge: 1, rimLight: 1.2 });
        A.emissive(ctx, lineP([[170, s * 14], [183, s * 21]]), '#ff5c8a', 5, { stroke: 1.2 });
      }
      grime(ctx, w + 8, h + 8, 53, 0.6);
    }, { pad: 4 });
    A.define('b13:cru:cage', 100, 100, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const R = 42;
      ctx.lineCap = 'round';
      const bar = (path, lw, lit) => {
        ctx.strokeStyle = '#0c0d14';
        ctx.lineWidth = lw + 2;
        ctx.stroke(path);
        const g = ctx.createLinearGradient(-R, -R, R, R);
        g.addColorStop(0, lit ? '#eef2ff' : '#9aa3c0');
        g.addColorStop(0.45, '#6a7192');
        g.addColorStop(1, '#22263a');
        ctx.strokeStyle = g;
        ctx.lineWidth = lw;
        ctx.stroke(path);
      };
      for (let k = 0; k < 6; k++) {
        const e = new Path2D();
        e.ellipse(0, 0, Math.max(1, R * Math.abs(Math.cos((k * PI) / 6))), R, 0, 0, TAU);
        bar(e, 3, k === 0);
      }
      for (const yy of [-24, 0, 24]) {
        const rr = Math.sqrt(R * R - yy * yy);
        const e = new Path2D();
        e.ellipse(0, yy, rr, rr * 0.22, 0, 0, TAU);
        bar(e, 2.6, yy < 0);
      }
      for (const yy of [-R, R]) {
        const hub = circ(0, yy, 7);
        A.metal(ctx, hub, { base: '#585f7c', spec: 0.7, bounds: rbox(0, yy, 7), edge: 0.8 });
        A.emissive(ctx, circ(0, yy, 2.6), VIOLET, 6);
      }
      for (const p of [[-R * 0.87, -12], [R * 0.87, -12], [-R * 0.87, 12], [R * 0.87, 12]]) A.emissive(ctx, circ(p[0], p[1], 1.8), VIOLET, 5);
    }, { pad: 6 });
    A.define('b13:cru:dmg', 236, 236, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const ringP = new Path2D();
      ringP.arc(0, 0, 104, 0, TAU);
      ringP.arc(0, 0, 70, 0, TAU, true);
      ctx.save();
      ctx.clip(ringP);
      scorch(ctx, -62, -58, 34, 3);
      scorch(ctx, 74, 30, 30, 5);
      scorch(ctx, -20, 90, 28, 7);
      scorch(ctx, 50, -80, 24, 9);
      ctx.restore();
    }, { pad: 2 });
  }
  defineCrucibleArt();

  function cruArmGeom(b, i) {
    const d = b.data;
    const open = d.open || 0, fold = d.fold == null ? 1 : d.fold;
    const base = CRU_ARMS[i];
    const sway = Math.sin(SL.time.t * 0.9 + i * 1.7) * 0.035;
    const spread = (i === 1 ? -1 : i === 2 ? 1 : i === 4 ? -1 : i === 5 ? 1 : 0) * open * 0.1;
    const a = base + sway + spread + (1 - fold) * 0.9 * (i % 2 ? 1 : -1);
    const len = (0.5 + 0.5 * fold) * (1 + open * 0.08);
    return { a, len };
  }
  function cruCagePos(b, key) {
    const g = cruArmGeom(b, CRU_CAGE_ARM[key]);
    const r = 92 + 158 * g.len;
    return { x: b.x + Math.cos(g.a) * r, y: b.y + Math.sin(g.a) * r, a: g.a };
  }
  function cruHole(b, key) {
    const c = b.data.parts[key];
    return c && c.hole;
  }
  function cruWells(b) {
    const d = b.data, L = (b.gravityList = b.gravityList || []);
    L.length = 0;
    for (const key of ['cage_l', 'cage_r']) {
      const c = d.parts && d.parts[key];
      if (!c || !c.hole || !(c.hole.k > 0)) continue;
      L.push(c.hole);
    }
    for (const fh of d.free) L.push(fh);
  }

  SL.bosses.define('mb_crucible', {
    name: 'CRUCIBLE', title: 'Foundry Core', hp: 6000, r: 120, score: 35000, parTime: 65, timeBonusRate: 250,
    transitionTime: 1.5, contactDamage: 20, music: 'mus_miniboss', palette: 'violet', shower: [30, 4], manualMove: true,
    init(b) {
      const d = b.data;
      b.x = 360;
      b.y = -260;
      d.fold = 0;
      d.open = 0;
      d.free = [];
      d.spinA = {};
      d.spinB = {};
      d.heat = 0;
      d.sweeps = [];
      b.circles = [{ x: 0, y: 0, r: 104 }];
      for (let i = 0; i < 6; i++) b.circles.push({ x: 0, y: 0, r: i === 1 || i === 2 ? 20 : 24 });
      for (const key of ['cage_l', 'cage_r']) {
        const c = addPart(b, {
          key, hp: 900, r: 40, bonus: 300, palette: 'violet', debris: '#4a4f68',
          place(e, bb) { const p = cruCagePos(bb, key); e.x = p.x; e.y = p.y; },
          onBreak(e, bb) {
            // the freed hole drifts and collapses in 2 s
            const hc = c.hole;
            if (hc) { bb.data.free.push({ x: hc.x, y: hc.y, r: hc.r, pull: hc.pull, range: hc.range, lens: hc.lens, k: 1, t: 0, vx: (key === 'cage_l' ? -1 : 1) * 30, vy: 40 }); hc.k = 0; }
            glints(e.x, e.y, 16, 30, '#c99bff');
          },
        });
        c.hole = { x: 0, y: 0, r: 16, pull: 0, range: 300, lens: 0, k: 0 };
      }
    },
    intro(b, dt) {
      const d = b.data;
      d.it = (d.it || 0) + dt;
      const t = d.it;
      b.y = U.lerp(-260, 300, SL.ease.outCubic(U.clamp(t / 2.2, 0, 1)));
      d.fold = SL.ease.outBack(U.clamp((t - 1.6) / 1.2, 0, 1));
      for (const key of ['cage_l', 'cage_r']) {
        const h = cruHole(b, key);
        if (h) h.k = U.clamp((t - 2.6) / 0.6, 0, 1);
      }
      if (!d.roared && t > 1.4) { d.roared = true; sfx('boss_roar'); SL.fx.shake(6, 0.6); }
      this.update(b, dt, true);
      return t >= 3.4;
    },
    update(b, dt, intro) {
      const d = b.data;
      runJobs(b, dt);
      if (!intro && b.introDone) {
        b.x = 360 + Math.sin(b.fightT * 0.34) * 86;
        b.y = 300 + Math.sin(b.fightT * 0.62) * 18;
      }
      for (let i = 0; i < 6; i++) {
        const g = cruArmGeom(b, i), c = b.circles[i + 1];
        const r = 92 + (i === 1 || i === 2 ? 40 : 58) * g.len;
        c.x = Math.cos(g.a) * r;
        c.y = Math.sin(g.a) * r;
      }
      for (const key of ['cage_l', 'cage_r']) {
        const c = d.parts[key], h = c.hole;
        const p = cruCagePos(b, key);
        h.x = p.x;
        h.y = p.y;
        if (partAlive(c)) {
          h.pull = 500 * h.k;
          h.lens = 0.6 * h.k;
        } else { h.pull = 0; h.lens = 0; }
      }
      for (let i = d.free.length - 1; i >= 0; i--) {
        const f = d.free[i];
        f.t += dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.k = Math.max(0, 1 - f.t / 2);
        f.pull = 500 * f.k;
        f.lens = 0.6 * f.k;
        f.r = 16 * (0.25 + 0.75 * f.k);
        if (f.t >= 2) {
          d.free.splice(i, 1);
          SL.fx.flash('#d9b0ff', 0.22, 0.25);
          SL.fx.shockwave(f.x, f.y, { radius: 260, duration: 0.6, strength: 1.2, color: '#c99bff' });
          glints(f.x, f.y, 18, 10, '#c99bff');
          sfx('bh_collapse', { x: f.x });
        }
      }
      cruWells(b);
      applyWells(b);
      for (const g of b.gravityList) horizonHurt(g, 60, dt);
      d.heat = Math.max(0, d.heat - dt * 1.5);
      // beam sources follow the arm tips
      for (const s of d.sweeps) {
        if (s.bm.dead) continue;
        const g = cruArmGeom(b, s.arm), r = 92 + 172 * g.len;
        s.bm.ox = Math.cos(g.a) * r;
        s.bm.oy = Math.sin(g.a) * r;
      }
      damageFx(b, dt, [[-60, -50], [70, 30], [-20, 80], [40, -80]], '#ffb070');
    },
    phases: [
      {
        at: 1, name: 'Forge',
        enter(b) { const d = b.data; d.jobs = []; d.orbitT = 1.2; d.ringT = 1.6; },
        update(b, dt) {
          const d = b.data;
          d.ringT -= dt;
          if (d.ringT <= 0) { d.ringT = 2.6 / fr(); ring(b.x, b.y, 16, 170, 'orb', { color: EBC.orange }, Math.random() * TAU); d.heat = 0.5; }
          d.orbitT -= dt;
          if (d.orbitT <= 0) {
            d.orbitT = 6 / fr();
            for (const key of ['cage_l', 'cage_r']) {
              const c = d.parts[key];
              if (partAlive(c)) orbitRelease(b, c.ent, 12, { radius: 96, orbit: 1.2, spin: key === 'cage_l' ? -2 : 2, speed: 200 });
            }
          }
        },
      },
      {
        at: 0.6, name: 'Cages Open',
        enter(b) {
          const d = b.data;
          d.jobs = [];
          d.sweepT = 1.2;
          d.splitT = 3.4;
          phaseBreak(b, [[-80, -40], [80, -40], [0, 90]], '#4a4f68');
        },
        update(b, dt) {
          const d = b.data;
          d.open = Math.min(1, d.open + dt * 1.2);
          d.sweepT -= dt;
          if (d.sweepT <= 0) {
            d.sweepT = 6 / fr();
            d.sweeps.length = 0;
            for (const arm of [0, 3]) {
              const s = arm === 0 ? 1 : -1;
              const a0 = HALF - s * (PI / 6), a1 = HALF + s * (PI / 6);
              const bm = SL.fireEnemyBeam(b, { angle: a0, sweep: { to: a1 }, width: 30, telegraph: 1.0, duration: 1.6, ox: s * 264, oy: 0, color: '#ff4fd8' });
              d.sweeps.push({ bm, arm, a0, a1 });
            }
          }
          d.splitT -= dt;
          if (d.splitT <= 0) {
            d.splitT = 4 / fr();
            fan(b.x, b.y + 60, aim(b, b.x, b.y + 60), 4, 0.9, 120, 'flare', { split: { at: 1.2, count: 6, type: 'shard', speed: 180 } });
            d.heat = 0.8;
          }
        },
      },
      {
        at: 0.3, name: 'Meltdown',
        enter(b) {
          const d = b.data;
          d.jobs = [];
          d.slingT = 1.4;
          d.heatT = 2.2;
          d.pulse = null;
          d.spinA = { a: 0 };
          d.spinB = { a: PI / 4 };
          phaseBreak(b, [[-80, 40], [80, 40], [0, -90]], '#4a4f68');
          SL.fx.flash('#ff8a5c', 0.2, 0.3);
        },
        update(b, dt) {
          const d = b.data;
          d.open = Math.min(1.4, d.open + dt);
          if (!d.pulse) {
            spiral(d.spinA, b.x, b.y, dt, { arms: 2, rate: 8, spin: 1.2, speed: 160, type: 'orb', opts: { color: EBC.orange } });
            spiral(d.spinB, b.x, b.y, dt, { arms: 2, rate: 8, spin: -1.2, speed: 160, type: 'orb', opts: { color: EBC.pink } });
          }
          d.slingT -= dt;
          if (d.slingT <= 0) {
            d.slingT = 4 / fr();
            let any = false;
            for (const key of ['cage_l', 'cage_r']) {
              const c = d.parts[key];
              if (partAlive(c)) { sling(b, c.hole, 8, 200, key === 'cage_l' ? -1 : 1); any = true; }
            }
            if (!any) sling(b, { x: b.x, y: b.y, r: 70 }, 8, 200, Math.random() < 0.5 ? -1 : 1);
          }
          d.heatT -= dt;
          if (d.heatT <= 0 && !d.pulse) { d.heatT = 6 / fr(); d.pulse = { t: 0 }; sfx('enemy_charge', { x: b.x }); }
          if (d.pulse) {
            d.pulse.t += dt;
            d.heat = Math.min(1.6, d.pulse.t / 0.8 * 1.6);
            if (d.pulse.t >= 0.8) {
              ring(b.x, b.y, 24, 140, 'orb', { color: EBC.orange }, Math.random() * TAU);
              SL.fx.shockwave(b.x, b.y, { radius: 300, duration: 0.5, strength: 1, color: '#ffb070' });
              d.pulse = null;
            }
          }
        },
      },
    ],
    draw(b, ctx) {
      const d = b.data, t = SL.time.t, x = b.x, y = b.y;
      const dying = b.dying, DT = b.deathT || 0;
      // cage holes (behind the cages)
      for (const key of ['cage_l', 'cage_r']) {
        const c = d.parts[key];
        if (c.hole.k > 0 && partAlive(c)) A.drawGlow(ctx, c.hole.x, c.hole.y, 70, VIOLET, 0.55 * c.hole.k);
      }
      // arms
      for (let i = 0; i < 6; i++) {
        let g = cruArmGeom(b, i), ax = x, ay = y, rot = g.a;
        if (dying && d.flying && d.flying[i]) { const f = d.flying[i]; ax = f.x; ay = f.y; rot = f.rot; if (f.gone) continue; }
        const r0 = 80 + (1 - g.len) * 40;
        xf(ctx, ax + Math.cos(rot) * r0, ay + Math.sin(rot) * r0, rot, g.len * 0.6 + 0.4, 1);
        A.drawSprite(ctx, 'b13:cru:arm', 93, 0);
        if (b.flash > 0) A.drawFlash(ctx, 'b13:cru:arm', 93, 0, 0, 1, (b.flash / 0.06) * 0.22);
        unxf(ctx);
        const pulse = 0.5 + 0.5 * Math.sin(t * 5 + i);
        for (const k of [0.36, 0.56, 0.74]) {
          const rr = r0 + 186 * k * (g.len * 0.6 + 0.4);
          A.drawGlow(ctx, ax + Math.cos(rot) * rr, ay + Math.sin(rot) * rr, 13 + 5 * pulse, VIOLET, 0.35 + 0.25 * pulse);
        }
      }
      // molten core: two counter-rotating layers
      const bloom = dying ? U.clamp((DT - 1.4) / 1.4, 0, 1) : 0;
      const hk = d.heat || 0;
      A.drawGlow(ctx, x, y, 120 + 40 * hk + 200 * bloom, bloom > 0.5 ? VIOLET : '#ff8a5c', 0.45 + 0.25 * hk + 0.5 * bloom);
      A.drawSprite(ctx, 'b13:cru:magma', x, y, t * 0.35, 1, 1);
      ctx.globalCompositeOperation = 'lighter';
      A.drawSprite(ctx, 'b13:cru:swirl', x, y, -t * 0.8, 1, 0.65 + 0.3 * Math.sin(t * 2.3));
      ctx.globalCompositeOperation = 'source-over';
      A.drawGlow(ctx, x, y, 46 + 10 * Math.sin(t * 6) + 30 * hk, '#ffd9a8', 0.5 + 0.3 * hk);
      if (!(dying && DT > 2.6)) {
        A.drawSprite(ctx, 'b13:cru:housing', x, y, Math.sin(t * 0.4) * 0.04);
        ctx.globalCompositeOperation = 'lighter';
        A.drawSprite(ctx, 'b13:cru:housing_emis', x, y, Math.sin(t * 0.4) * 0.04, 1, 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3)) + 0.4 * hk);
        ctx.globalCompositeOperation = 'source-over';
        const f = b.hp / b.maxHp;
        if (f < 0.66) A.drawSprite(ctx, 'b13:cru:dmg', x, y, Math.sin(t * 0.4) * 0.04, 1, f < 0.33 ? 1 : 0.6);
        if (b.flash > 0) A.drawFlash(ctx, 'b13:cru:housing', x, y, Math.sin(t * 0.4) * 0.04, 1, (b.flash / 0.06) * 0.22);
      }
      // seed cages + holes
      for (const key of ['cage_l', 'cage_r']) {
        const c = d.parts[key], h = c.hole;
        if (!partAlive(c) || c.gone) continue;
        drawHole(ctx, h.x, h.y, 16, VIOLET, Math.max(0.15, h.k), t);
        const e = c.ent, sp = d.open * 6;
        A.drawSprite(ctx, 'b13:cru:cage', h.x - sp, h.y, t * 0.6);
        if (sp > 0.5) A.drawSprite(ctx, 'b13:cru:cage', h.x + sp, h.y, -t * 0.6, 1, 0.75);
        if (e.flash > 0) A.drawFlash(ctx, 'b13:cru:cage', h.x, h.y, t * 0.6, 1, (e.flash / 0.06) * 0.6);
        const hpf = e.hp / e.maxHp;
        if (hpf < 0.5) A.drawGlow(ctx, h.x, h.y, 30, '#ff5c8a', (0.5 - hpf) * (0.6 + 0.4 * Math.sin(t * 20)));
      }
      for (const f of d.free) drawHole(ctx, f.x, f.y, f.r, VIOLET, f.k, t);
      // telegraphs: sweep arrows and the heat pulse
      for (const s of d.sweeps) {
        if (s.bm.dead || s.bm.state !== 'telegraph') continue;
        const k = U.clamp(s.bm.t / s.bm.telegraph, 0, 1);
        sweepArrow(ctx, s.bm.x, s.bm.y, s.a0, s.a1, 150, '#ff4fd8', 0.4 + 0.6 * k);
      }
      if (d.pulse) {
        const k = d.pulse.t / 0.8;
        const rg = A.ring('#ffb070', 64, 4);
        const rr = 80 + 120 * k;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.4 + 0.6 * k;
        ctx.drawImage(rg, x - rr, y - rr, rr * 2, rr * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (dying && bloom > 0) A.drawGlow(ctx, x, y, 140 + 260 * bloom, bloom < 0.55 ? '#ff8a5c' : VIOLET, 0.6 + 0.4 * bloom);
    },
    onDeath(b) {
      const d = b.data;
      d.flying = [];
      d.sweeps.length = 0;
      for (const key of ['cage_l', 'cage_r']) {
        const c = d.parts[key];
        if (partAlive(c)) { glints(c.hole.x, c.hole.y, 14, 20, '#c99bff'); dropPart(c, 'm', 'violet'); }
        if (c.hole) c.hole.k = 0;
      }
    },
    dying(b, dt) {
      const d = b.data, T = b.deathT;
      // arms tear off one by one and fly apart
      for (let i = 0; i < 6; i++) {
        if (!d.flying[i] && T > 0.25 + i * 0.16) {
          const g = cruArmGeom(b, i);
          d.flying[i] = { x: b.x, y: b.y, rot: g.a, vx: Math.cos(g.a) * 260, vy: Math.sin(g.a) * 260 - 60, spin: (i % 2 ? 1 : -1) * 3 };
          SL.fx.explode(b.x + Math.cos(g.a) * 100, b.y + Math.sin(g.a) * 100, { size: 'm', palette: 'violet', sound: i % 2 === 0 });
        }
        const f = d.flying[i];
        if (f && !f.gone) {
          f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 160 * dt; f.rot += f.spin * dt;
          if (f.x < -300 || f.x > W + 300 || f.y > H + 300) f.gone = true;
        }
      }
      if (T < 2.4) chain(b, dt, 0.14, 'violet');
      if (T > 1.4 && !d.bloomA) { d.bloomA = true; SL.fx.flash('#ff8a5c', 0.3, 0.4); sfx('explode_l', { x: b.x }); }
      if (T > 2.2 && !d.bloomB) { d.bloomB = true; SL.fx.flash('#b26bff', 0.35, 0.4); }
      if (T >= 2.9 && !d.finished) {
        d.finished = true;
        SL.fx.explode(b.x, b.y, { size: 'xl', palette: 'violet' });
        SL.fx.shockwave(b.x, b.y, { radius: 640, duration: 1.0, strength: 1.7, color: '#c99bff' });
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * TAU;
          SL.fx.emit({ x: b.x + Math.cos(a) * 40, y: b.y + Math.sin(a) * 40, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, drag: 2, life: 0.8, size: 22, size2: 4, color: '#fff0ff', color2: VIOLET, shape: 'glow' });
        }
        creditShower(b.x, b.y, 30, 4);
        SL.game.bossDefeated(b);
      }
    },
  });

  /** Curved telegraph arrow for beam sweeps (GDD 7.3 beam_sweep). */
  function sweepArrow(ctx, x, y, a0, a1, r, color, alpha) {
    const n = 14, spr = A.glow(color, 64);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    for (let i = 0; i <= n; i++) {
      const a = U.lerpAngle(a0, a1, i / n);
      const s = 5 + (i / n) * 4;
      ctx.drawImage(spr, x + Math.cos(a) * r - s, y + Math.sin(a) * r - s, s * 2, s * 2);
    }
    // arrow head
    const ae = a1, dir = U.angleDiff(a0, a1) > 0 ? 1 : -1;
    const hx = x + Math.cos(ae) * r, hy = y + Math.sin(ae) * r;
    const tx = -Math.sin(ae) * dir, ty = Math.cos(ae) * dir;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - tx * 16 + Math.cos(ae) * 9, hy - ty * 16 + Math.sin(ae) * 9);
    ctx.lineTo(hx + tx * 4, hy + ty * 4);
    ctx.lineTo(hx - tx * 16 - Math.cos(ae) * 9, hy - ty * 16 - Math.sin(ae) * 9);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ================================================================== shared: glints, stretch blits, shade props
  A.define('b13:glint', 64, 64, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    ctx.globalCompositeOperation = 'lighter';
    for (const [len, wd, a] of [[31, 2.4, 0], [31, 2.4, HALF], [16, 1.6, PI / 4], [16, 1.6, -PI / 4]]) {
      ctx.save();
      ctx.rotate(a);
      const g = ctx.createLinearGradient(-len, 0, len, 0);
      g.addColorStop(0, 'rgba(160,200,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(160,200,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, len, wd, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    const c = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    c.addColorStop(0, 'rgba(255,255,255,1)');
    c.addColorStop(0.4, 'rgba(200,225,255,0.6)');
    c.addColorStop(1, 'rgba(120,170,255,0)');
    ctx.fillStyle = c;
    ctx.fillRect(-12, -12, 24, 24);
  }, { pad: 0 });
  function drawGlint(ctx, x, y, s, a, rot) {
    if (!(a > 0)) return;
    ctx.globalCompositeOperation = 'lighter';
    A.drawSprite(ctx, 'b13:glint', x, y, rot || 0, s, Math.min(1, a));
    ctx.globalCompositeOperation = 'source-over';
  }
  A.define('b13:chev', 18, 18, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#ff4fd8';
    ctx.shadowBlur = 5;
    ctx.strokeStyle = '#ffd6f6';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-4, -6);
    ctx.lineTo(3, 0);
    ctx.lineTo(-4, 6);
    ctx.stroke();
  }, { pad: 5 });
  /** Pulsing warning line (additive beam sprite) from (x0, y0) to (x1, y1). */
  function warnLine(ctx, x0, y0, x1, y1, w, alpha, color) {
    const spr = SL.world.beamSprite(color || '#ff4fd8');
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1 || !(alpha > 0)) return;
    xf(ctx, x0, y0, Math.atan2(y1 - y0, x1 - x0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(spr.canvas, 0, -w / 2, len, w);
    unxf(ctx);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  /** Chevrons marching along a line (direction of travel of an attack). */
  function chevrons(ctx, x0, y0, ang, len, t, alpha, gap) {
    gap = gap || 64;
    const c = Math.cos(ang), s = Math.sin(ang), off = (t * 300) % gap;
    ctx.globalCompositeOperation = 'lighter';
    for (let d = off + 30; d < len; d += gap) A.drawSprite(ctx, 'b13:chev', x0 + c * d, y0 + s * d, ang, 1, alpha);
    ctx.globalCompositeOperation = 'source-over';
  }
  /** Draws a sprite stretched along the segment (x0, y0) -> (x1, y1); sprite length runs along +x. */
  function drawStretch(ctx, key, x0, y0, x1, y1, thick) {
    const s = A.get(key);
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) return;
    xf(ctx, (x0 + x1) / 2, (y0 + y1) / 2, Math.atan2(y1 - y0, x1 - x0), len / s.w, (thick || s.h) / s.h);
    ctx.drawImage(s.canvas, -s.cw / 2, -s.ch / 2, s.cw, s.ch);
    unxf(ctx);
  }
  /** Two-bone arm: elbow position for root -> target with bone lengths L1, L2 and bend side +-1. */
  function ik(rx, ry, tx, ty, L1, L2, bend, out) {
    const dx = tx - rx, dy = ty - ry;
    const d = U.clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1, (L1 + L2) * 0.999);
    const a = Math.atan2(dy, dx);
    const c = U.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const a1 = a + bend * Math.acos(c);
    out.ex = rx + Math.cos(a1) * L1;
    out.ey = ry + Math.sin(a1) * L1;
    return out;
  }
  function segCircle(ax, ay, bx, by, cx, cy, r) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? U.clamp(((cx - ax) * dx + (cy - ay) * dy) / L2, 0, 1) : 0;
    const qx = ax + dx * t - cx, qy = ay + dy * t - cy;
    return qx * qx + qy * qy < r * r;
  }
  function isShade(pr) {
    if (!pr || pr.dead) return false;
    const id = pr.typeId || (pr.def && pr.def.id);
    return id === 'prop_shade_rock' || !!(pr.def && pr.def.b13Shade);
  }
  function shadeCount() {
    let n = 0;
    for (const pr of SL.world.props) if (isShade(pr) && pr.y < H - 120) n++;
    return n;
  }
  /** Nova shade test (GDD 8.4): the segment from the core to the jet crosses a shade prop. */
  function shadedFrom(cx, cy, px, py) {
    for (const pr of SL.world.props) {
      if (!isShade(pr)) continue;
      if (segCircle(cx, cy, px, py, pr.x, pr.y, (pr.r || 50) * 0.94)) return true;
    }
    return false;
  }

  // ---- local shade prop: a falling SUNEATER mirror or hull plate (fallback for SL.hazards.shadeRock + nova cover)
  const SHADE_PROP = {
    id: 'b13_shade', b13Shade: true, r: 56, blocksBullets: true, shootable: true, hp: 1e9, contactDamage: 0, manualMove: true,
    init(pr, o) {
      pr.r = o.r || 56;
      pr.vy = o.vy || 38;
      pr.vx = o.vx || 0;
      pr.rot = o.rot || 0;
      pr.data.spin = o.spin != null ? o.spin : (Math.random() - 0.5) * 0.5;
      pr.data.skin = o.skin || 'mirror';
      pr.data.life = o.life || 8;
      pr.data.sx = 1;
      pr.data.crack = !!o.crack;
    },
    update(pr, dt) {
      const d = pr.data;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.vx *= Math.max(0, 1 - dt * 0.6);
      pr.rot += d.spin * dt;
      d.sx = 0.72 + 0.28 * Math.cos(pr.age * 0.9 + pr.x * 0.01);
      if (pr.age > d.life) pr.dead = true;
      pr.alpha = U.clamp((d.life - pr.age) / 0.6, 0, 1) * U.clamp(pr.age / 0.25, 0, 1);
      // gently push jets aside
      for (const p of SL.world.players) {
        if (!p.alive || p.down || p.display) continue;
        const dx = p.x - pr.x, dy = p.y - pr.y, rr = pr.r + (p.r || 22);
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 1) {
          const dd = Math.sqrt(d2), k = (rr - dd) / rr;
          SL.player.push(p, (dx / dd) * 2600 * k, (dy / dd) * 2600 * k, dt);
        }
      }
    },
    onHit() {},
    draw(pr, ctx) {
      const d = pr.data, t = SL.time.t;
      ctx.globalAlpha = pr.alpha == null ? 1 : pr.alpha;
      if (d.skin === 'mirror') {
        xf(ctx, pr.x, pr.y, pr.rot, d.sx * (pr.r / 56), pr.r / 56);
        A.drawSprite(ctx, 'b13:sun:mirror', 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        A.drawSprite(ctx, SUN_SHEEN[((t * 7 + pr.x * 0.05) | 0) % 12], 0, 0, 0, 1, 0.5);
        ctx.globalCompositeOperation = 'source-over';
        if (d.crack) A.drawSprite(ctx, 'b13:sun:crack', 0, 0, 0, 1, 0.9);
        unxf(ctx);
      } else {
        A.drawSprite(ctx, 'b13:sun:plate', pr.x, pr.y, pr.rot, pr.r / 56);
        A.drawGlow(ctx, pr.x - 30, pr.y + 18, 16 + 4 * Math.sin(t * 9 + pr.x), '#ff7a3d', 0.35);
      }
    },
  };
  /** Shade prop through the hazards module when it exists (GDD 9.4), else the local one. */
  function shadeProp(x, y, o) {
    o = o || {};
    if (o.skin !== 'plate' && SL.hazards && typeof SL.hazards.shadeRock === 'function') {
      try {
        const pr = SL.hazards.shadeRock(x, y, { r: o.r || 56, vy: o.vy || 38, skin: o.skin || 'mirror', life: o.life || 8 });
        if (pr && !pr.dead) return pr;
      } catch (err) { U.warnOnce('b13:shadeRock', 'bossesB: SL.hazards.shadeRock threw', err); }
    }
    return SL.spawnProp(SHADE_PROP, Object.assign({ x, y }, o));
  }
  /** Screen-edge white glow (nova and flare charge). */
  A.define('b13:edge', 64, 16, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(220,235,255,0.45)');
    g.addColorStop(1, 'rgba(160,200,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { pad: 0 });
  function drawEdges(ctx, k, top, depth) {
    if (!(k > 0)) return;
    const s = A.get('b13:edge'), D = depth || 120;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, k);
    ctx.drawImage(s.canvas, 0, 0, W, D * (top ? 1.6 : 1));
    if (!top) {
      xf(ctx, W, H, PI);
      ctx.drawImage(s.canvas, 0, 0, W, D);
      xf(ctx, 0, H, -HALF);
      ctx.drawImage(s.canvas, 0, 0, H, D * 0.8);
      xf(ctx, W, 0, HALF);
      ctx.drawImage(s.canvas, 0, 0, H, D * 0.8);
      unxf(ctx);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  /** Dark shadow wedge behind a shade prop, away from a light at (lx, ly) (or straight down when lx is null). */
  function drawShadow(ctx, lx, ly, pr, k) {
    const r = (pr.r || 50) * 0.9;
    let ax, ay;
    if (lx == null) { ax = 0; ay = 1; } else { const d = Math.hypot(pr.x - lx, pr.y - ly) || 1; ax = (pr.x - lx) / d; ay = (pr.y - ly) / d; }
    const nx = -ay, ny = ax, L = 1500;
    const spread = lx == null ? 0 : 0.35;
    ctx.fillStyle = 'rgba(3,5,14,' + (0.62 * k).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(pr.x + nx * r, pr.y + ny * r);
    ctx.lineTo(pr.x + (nx * r) * (1 + spread * 6) + ax * L, pr.y + (ny * r) * (1 + spread * 6) + ay * L);
    ctx.lineTo(pr.x - (nx * r) * (1 + spread * 6) + ax * L, pr.y - (ny * r) * (1 + spread * 6) + ay * L);
    ctx.lineTo(pr.x - nx * r, pr.y - ny * r);
    ctx.closePath();
    ctx.fill();
  }

  // ================================================================== SUNEATER (boss_suneater, m4)
  const SUN_CORE = { x: 0, y: 12 };
  const SUN_SHEEN = [];
  for (let k = 0; k < 12; k++) SUN_SHEEN.push('b13:sun:sheen:' + k);
  const SUN_BLUE = '#8fb3ff';
  const SUN_MIR = [
    { key: 'mirror_1', side: -1, root: [-306, 36], rest: [-300, 236], bend: 1, order: 0 },
    { key: 'mirror_2', side: -1, root: [-280, 128], rest: [-152, 276], bend: 1, order: 2 },
    { key: 'mirror_3', side: 1, root: [280, 128], rest: [152, 276], bend: -1, order: 3 },
    { key: 'mirror_4', side: 1, root: [306, 36], rest: [300, 236], bend: -1, order: 1 },
  ];
  SUN_MIR.forEach((m) => { m.L = Math.hypot(m.rest[0] - m.root[0], m.rest[1] - m.root[1]) * 0.58; });
  const SUN_GUNS = [[-282, 120], [282, 120]];
  const SUN_CIRCLES = [[0, -170, 56], [-118, -162, 54], [118, -162, 54], [-215, -110, 52], [215, -110, 52], [-280, -22, 46], [280, -22, 46], [-296, 72, 34], [296, 72, 34], [-290, 128, 24], [290, 128, 24]];
  const SUN_DMG_PTS = [[-200, -130], [180, -140], [-60, -180], [90, -175], [-290, 30], [292, 10]];
  // arch silhouette (local coordinates, boss centre = mouth centre)
  function sunArch() {
    const p = new Path2D();
    p.moveTo(-294, 150);
    p.bezierCurveTo(-334, 64, -338, -58, -284, -132);
    p.bezierCurveTo(-232, -202, -118, -224, 0, -224);
    p.bezierCurveTo(118, -224, 232, -202, 284, -132);
    p.bezierCurveTo(338, -58, 334, 64, 294, 150);
    p.bezierCurveTo(274, 74, 250, -16, 196, -66);
    p.bezierCurveTo(136, -112, 66, -120, 0, -120);
    p.bezierCurveTo(-66, -120, -136, -112, -196, -66);
    p.bezierCurveTo(-250, -16, -274, 74, -294, 150);
    p.closePath();
    return p;
  }
  function sunOuter() {
    const p = new Path2D();
    p.moveTo(-294, 150);
    p.bezierCurveTo(-334, 64, -338, -58, -284, -132);
    p.bezierCurveTo(-232, -202, -118, -224, 0, -224);
    p.bezierCurveTo(118, -224, 232, -202, 284, -132);
    p.bezierCurveTo(338, -58, 334, 64, 294, 150);
    return p;
  }
  function sunInner() {
    const p = new Path2D();
    p.moveTo(294, 150);
    p.bezierCurveTo(274, 74, 250, -16, 196, -66);
    p.bezierCurveTo(136, -112, 66, -120, 0, -120);
    p.bezierCurveTo(-66, -120, -136, -112, -196, -66);
    p.bezierCurveTo(-250, -16, -274, 74, -294, 150);
    return p;
  }
  // arch parameterisation: theta from the left tip (-PI - 0.43) over the top to the right tip (0.43)
  const SUN_T0 = -PI - 0.43, SUN_T1 = 0.43;
  function sunP(th, f) {
    // f 0 = inner edge, 1 = outer edge (approximate ellipses fitted to the beziers)
    const rx = U.lerp(262, 328, f), ry = U.lerp(160, 264, f);
    return [Math.cos(th) * rx, 40 + Math.sin(th) * ry];
  }
  function sunQuad(th0, th1, f0, f1) {
    const pts = [];
    const n = 6;
    for (let i = 0; i <= n; i++) pts.push(sunP(U.lerp(th0, th1, i / n), f1));
    for (let i = n; i >= 0; i--) pts.push(sunP(U.lerp(th0, th1, i / n), f0));
    return A.poly(pts);
  }
  function sunArcLine(th0, th1, f) {
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push(sunP(U.lerp(th0, th1, i / 12), f));
    return A.poly(pts, true);
  }

  function defineSunArt() {
    const BOX = box(-340, -232, 680, 400);
    A.define('b13:sun:hull', 680, 470, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const arch = sunArch();
      A.metal(ctx, arch, { base: '#2b3247', light: '#c3cfee', dark: '#06080e', spec: 0.5, specPos: 0.26, bounds: BOX, edge: 2.2, rimLight: 2.6 });
      ctx.save();
      ctx.clip(arch);
      // core-lit inner face: cold blue bounce light near the mouth, deep occlusion behind it
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      ctx.lineWidth = 64;
      ctx.stroke(sunInner());
      ctx.strokeStyle = 'rgba(90,130,220,0.20)';
      ctx.lineWidth = 26;
      ctx.stroke(sunInner());
      ctx.strokeStyle = 'rgba(170,200,255,0.30)';
      ctx.lineWidth = 7;
      ctx.stroke(sunInner());
      // raised outer armour lip
      ctx.strokeStyle = '#05070c';
      ctx.lineWidth = 50;
      ctx.stroke(sunOuter());
      const lipG = ctx.createLinearGradient(-300, -230, 300, 150);
      lipG.addColorStop(0, '#8d9abb');
      lipG.addColorStop(0.3, '#454e68');
      lipG.addColorStop(0.65, '#262c3d');
      lipG.addColorStop(1, '#10131c');
      ctx.strokeStyle = lipG;
      ctx.lineWidth = 46;
      ctx.stroke(sunOuter());
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 34;
      ctx.stroke(sunOuter());
      ctx.restore();
      A.panelLines(ctx, sunArcLine(SUN_T0 + 0.05, SUN_T1 - 0.05, 0.78), '#000', 0.7);
      A.panelLines(ctx, sunArcLine(SUN_T0 + 0.12, SUN_T1 - 0.12, 0.34), '#000', 0.5);
      // voussoir plates
      const plates = [[-2.62, -2.2], [-2.16, -1.78], [-1.36, -0.98], [-0.94, -0.52]];
      for (const [a0, a1] of plates) {
        const P = sunQuad(a0 + 0.015, a1 - 0.015, 0.38, 0.76);
        A.metal(ctx, P, { base: '#3a4360', light: '#dce5ff', dark: '#0a0d16', spec: 0.62, specPos: 0.3, bounds: BOX, edge: 1.4, rimLight: 1.8 });
        A.panelLines(ctx, sunArcLine(a0 + 0.06, a1 - 0.06, 0.57), '#000', 0.5);
        const m = (a0 + a1) / 2;
        dots(ctx, [sunP(a0 + 0.05, 0.44), sunP(a1 - 0.05, 0.44), sunP(a0 + 0.05, 0.7), sunP(a1 - 0.05, 0.7)], 1.7, '#a7b3d4');
        // vent slats
        for (let k = -2; k <= 2; k++) {
          const v = A.poly([sunP(m + k * 0.045 - 0.012, 0.47), sunP(m + k * 0.045 + 0.012, 0.47), sunP(m + k * 0.045 + 0.012, 0.66), sunP(m + k * 0.045 - 0.012, 0.66)]);
          ctx.fillStyle = '#05060a';
          ctx.fill(v);
        }
      }
      // radial seams between the big plates
      for (const a of [-2.96, -2.68, -2.18, -1.82, -1.32, -0.96, -0.46, -0.18]) {
        A.panelLines(ctx, A.poly([sunP(a, 0.04), sunP(a, 0.96)], true), '#000', 0.65);
      }
      // crest: twin collector fins framing the plasma throat
      for (const s of [-1, 1]) {
        const F = A.poly([[s * 30, -122], [s * 34, -232], [s * 58, -242], [s * 70, -226], [s * 66, -122]]);
        A.metal(ctx, F, { base: '#4a5574', light: '#eef3ff', dark: '#0b0e18', spec: 0.75, specPos: 0.32, bounds: box(-70, -242, 140, 122), edge: 1.2, rimLight: 2 });
        A.panelLines(ctx, lineP([[s * 40, -136], [s * 46, -224]]), '#000', 0.55);
        dots(ctx, [[s * 54, -140], [s * 56, -170], [s * 58, -200]], 1.6, '#b7c2e0');
      }
      // throat window: cut through, then smoked glass so the plasma stream behind shows through
      const TH = A.poly([[-28, -122], [-30, -236], [30, -236], [28, -122]]);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill(TH);
      ctx.restore();
      ctx.fillStyle = 'rgba(14,24,52,0.42)';
      ctx.fill(TH);
      ctx.save();
      ctx.clip(TH);
      for (let y = -228; y < -120; y += 18) {
        ctx.fillStyle = '#0c1020';
        ctx.fillRect(-32, y, 64, 5);
        ctx.fillStyle = 'rgba(190,210,255,0.35)';
        ctx.fillRect(-32, y, 64, 1.2);
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(10,12,20,0.95)';
      ctx.lineWidth = 2;
      ctx.stroke(TH);
      // lip-gun sockets and arm mounts on the legs
      for (const s of [-1, 1]) {
        for (const [x, y, r] of [[s * 282, 120, 25], [s * 306, 36, 16], [s * 280, 128, 14]]) {
          const so = circ(x, y, r);
          A.metal(ctx, so, { base: '#2a3043', light: '#c6d0ee', dark: '#05060a', spec: 0.5, bounds: rbox(x, y, r), edge: 1.2, rimLight: 1.3 });
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fill(circ(x, y, r * 0.62));
        }
        // leg ribs (hydraulics)
        for (let k = 0; k < 4; k++) {
          const y = -70 + k * 32;
          const x0 = s * (300 - k * 2), x1 = s * (322 - k * 6);
          A.panelLines(ctx, lineP([[x0, y], [x1, y + 8]]), '#000', 0.6);
        }
      }
      grime(ctx, w + 16, h + 16, 63, 0.75);
    }, { pad: 8 });

    A.define('b13:sun:emis', 680, 470, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      // core-lit inner rim
      A.emissive(ctx, sunInner(), '#9fc2ff', 14, { stroke: 2.4 });
      // nyx seams along the plate rows and crest fins
      A.emissive(ctx, sunArcLine(-2.6, -2.22, 0.8), PE.seam, 7, { stroke: 1.4 });
      A.emissive(ctx, sunArcLine(-0.92, -0.54, 0.8), PE.seam, 7, { stroke: 1.4 });
      A.emissive(ctx, sunArcLine(-2.14, -1.8, 0.8), PE.seam, 7, { stroke: 1.4 });
      A.emissive(ctx, sunArcLine(-1.34, -1.0, 0.8), PE.seam, 7, { stroke: 1.4 });
      for (const s of [-1, 1]) A.emissive(ctx, lineP([[s * 64, -128], [s * 68, -222]]), PE.seam, 6, { stroke: 1.2 });
      // vent glow
      for (const [a0, a1] of [[-2.62, -2.2], [-2.16, -1.78], [-1.36, -0.98], [-0.94, -0.52]]) {
        const m = (a0 + a1) / 2;
        for (let k = -2; k <= 2; k++) {
          A.emissive(ctx, A.poly([sunP(m + k * 0.045, 0.5), sunP(m + k * 0.045, 0.63)], true), '#ff8a5c', 6, { stroke: 1.4 });
        }
      }
      // running lights along the outer lip
      for (let i = 0; i <= 16; i++) {
        const p = sunP(U.lerp(SUN_T0 + 0.1, SUN_T1 - 0.1, i / 16), 0.9);
        A.emissive(ctx, circ(p[0], p[1], 1.8), i % 4 === 0 ? '#ff5c8a' : '#9fc2ff', 6);
      }
      // throat frame
      A.emissive(ctx, A.poly([[-28, -122], [-30, -236]], true), '#9fc2ff', 8, { stroke: 1.5 });
      A.emissive(ctx, A.poly([[28, -122], [30, -236]], true), '#9fc2ff', 8, { stroke: 1.5 });
    }, { pad: 12 });

    const dmg = (seeds, pts) => (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.save();
      ctx.clip(sunArch());
      pts.forEach((p, i) => scorch(ctx, p[0], p[1], p[2], seeds + i));
      ctx.restore();
    };
    A.define('b13:sun:dmg1', 680, 470, dmg(11, [[-205, -128, 38], [170, -150, 34], [-292, 40, 26], [40, -186, 26]]), { pad: 8 });
    A.define('b13:sun:dmg2', 680, 470, dmg(23, [[-90, -176, 34], [236, -96, 40], [-250, -60, 30], [300, 60, 24], [116, -170, 28], [-300, 104, 20]]), { pad: 8 });

    // iris petal: aperture blade, base (pivot) at +y, tip at -y
    A.define('b13:sun:petal', 60, 84, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const P = new Path2D();
      P.moveTo(-20, 34);
      P.quadraticCurveTo(-26, -6, 1, -37);
      P.quadraticCurveTo(12, -6, 24, 30);
      P.quadraticCurveTo(3, 40, -20, 34);
      P.closePath();
      A.metal(ctx, P, { base: '#2e3650', light: '#e6eeff', dark: '#05070d', spec: 0.85, specPos: 0.36, bounds: box(-26, -37, 50, 77), edge: 0.9, rimLight: 1.8 });
      clipped(ctx, P, () => {
        // trailing half sits lower: darker, with a raised spine ridge between the halves
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fill(A.poly([[1, -37], [24, 30], [3, 40], [-2, 0]]));
        ctx.strokeStyle = 'rgba(220,232,255,0.55)';
        ctx.lineWidth = 1.2;
        ctx.stroke(lineP([[-3, 32], [-2, 0], [1, -32]]));
      });
      const E = new Path2D();
      E.moveTo(1, -36);
      E.quadraticCurveTo(-24, -6, -19, 32);
      A.emissive(ctx, E, '#9fc2ff', 7, { stroke: 1.3 });
    }, { pad: 4 });
    // iris collar: heavy ring the petals retract under
    A.define('b13:sun:collar', 276, 276, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const R = new Path2D();
      R.arc(0, 0, 134, 0, TAU);
      R.arc(0, 0, 90, 0, TAU, true);
      A.metal(ctx, R, { base: '#30384f', light: '#d4ddf6', dark: '#05070c', spec: 0.6, specPos: 0.27, bounds: rbox(0, 0, 134), edge: 1.6, rimLight: 2.2 });
      clipped(ctx, R, () => {
        const g = ctx.createRadialGradient(0, 0, 90, 0, 0, 134);
        g.addColorStop(0, 'rgba(0,0,0,0.6)');
        g.addColorStop(0.2, 'rgba(0,0,0,0)');
        g.addColorStop(0.85, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = g;
        ctx.fillRect(-140, -140, 280, 280);
      });
      A.panelLines(ctx, circ(0, 0, 112), '#000', 0.6);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        A.panelLines(ctx, lineP([[Math.cos(a) * 113, Math.sin(a) * 113], [Math.cos(a) * 133, Math.sin(a) * 133]]), '#000', 0.55);
      }
      for (let i = 0; i < 8; i++) {
        const a = ((i + 0.5) / 8) * TAU;
        const px = Math.cos(a) * 101, py = Math.sin(a) * 101;
        A.metal(ctx, circ(px, py, 6), { base: '#59627f', light: '#ffffff', spec: 0.9, bounds: rbox(px, py, 6), edge: 0.6, rimLight: 0.8 });
        dots(ctx, [[Math.cos(a + 0.2) * 123, Math.sin(a + 0.2) * 123], [Math.cos(a - 0.2) * 123, Math.sin(a - 0.2) * 123]], 1.5, '#a3aecd');
      }
      grime(ctx, w, h, 71, 0.6);
    }, { pad: 4 });
    A.define('b13:sun:collar_emis', 276, 276, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      A.emissive(ctx, circ(0, 0, 91), '#9fc2ff', 12, { stroke: 2.2 });
      for (let i = 0; i < 8; i++) {
        const a = ((i + 0.5) / 8) * TAU;
        A.emissive(ctx, circ(Math.cos(a) * 101, Math.sin(a) * 101, 2), i % 2 ? '#9fc2ff' : PE.glow, 6);
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + 0.1;
        A.emissive(ctx, circ(Math.cos(a) * 126, Math.sin(a) * 126, 1.4), '#9fc2ff', 5);
      }
    }, { pad: 10 });

    A.define('b13:sun:core', 132, 132, (ctx) => {
      const n = A.noiseCanvas(132, 132, { scale: 34, octaves: 5, seed: 17, warp: 1.8, palette: [[0, '#0c1c66'], [0.3, '#2450ff'], [0.52, '#6c9cff'], [0.72, '#cfe0ff'], [1, '#ffffff']] });
      ctx.save();
      ctx.beginPath();
      ctx.arc(66, 66, 64, 0, TAU);
      ctx.clip();
      ctx.drawImage(n, 0, 0);
      const g = ctx.createRadialGradient(60, 58, 4, 66, 66, 66);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.35, 'rgba(220,235,255,0.35)');
      g.addColorStop(0.8, 'rgba(60,100,255,0)');
      g.addColorStop(1, 'rgba(10,20,80,0.6)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 132, 132);
      ctx.restore();
    }, { pad: 1 });
    A.define('b13:sun:swirl', 132, 132, (ctx) => {
      const n = A.noiseCanvas(132, 132, { scale: 26, octaves: 4, seed: 29, warp: 2.4, ridged: true, palette: [[0, '#000000', 0], [0.58, '#6c9cff', 0], [0.82, '#a9c6ff', 0.6], [1, '#ffffff', 0.95]] });
      ctx.save();
      ctx.beginPath();
      ctx.arc(66, 66, 62, 0, TAU);
      ctx.clip();
      ctx.drawImage(n, 0, 0);
      ctx.restore();
    }, { pad: 1 });

    // plasma stream tile (tileable vertically) and its soft outer glow
    A.define('b13:sun:stream', 64, 256, (ctx, w, h) => {
      const n = A.noiseCanvas(w, h, { scale: 22, octaves: 4, seed: 5, warp: 1.4, palette: [[0, '#1838c8', 0.25], [0.45, '#5f8cff', 0.6], [0.7, '#bcd3ff', 0.9], [1, '#ffffff', 1]] });
      ctx.drawImage(n, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.22, 'rgba(0,0,0,0.45)');
      g.addColorStop(0.5, 'rgba(0,0,0,1)');
      g.addColorStop(0.78, 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { pad: 0 });
    A.define('b13:sun:streamglow', 64, 8, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(60,110,255,0)');
      g.addColorStop(0.35, 'rgba(90,140,255,0.35)');
      g.addColorStop(0.5, 'rgba(200,220,255,0.9)');
      g.addColorStop(0.65, 'rgba(90,140,255,0.35)');
      g.addColorStop(1, 'rgba(60,110,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { pad: 0 });

    // hexagonal mirror panel: steel frame, smoked blue glass
    A.define('b13:sun:mirror', 124, 124, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const O = hexPath(0, 0, 58, 0), I = hexPath(0, 0, 48, 0);
      A.metal(ctx, O, { base: '#3a4258', light: '#e6edff', dark: '#070a12', spec: 0.7, specPos: 0.3, bounds: rbox(0, 0, 58), edge: 1.4, rimLight: 2 });
      const g = ctx.createLinearGradient(-40, -44, 40, 44);
      g.addColorStop(0, '#3a5488');
      g.addColorStop(0.32, '#1a2438');
      g.addColorStop(0.7, '#0f1626');
      g.addColorStop(1, '#1d2a48');
      ctx.fillStyle = g;
      ctx.fill(I);
      ctx.save();
      ctx.clip(I);
      // reflected starfield and a soft horizon band
      let s = 7;
      const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = 'rgba(200,220,255,' + (0.15 + rand() * 0.4).toFixed(2) + ')';
        ctx.fillRect(-48 + rand() * 96, -44 + rand() * 88, 1.2, 1.2);
      }
      const hb = ctx.createLinearGradient(-48, 10, 48, -6);
      hb.addColorStop(0, 'rgba(143,179,255,0)');
      hb.addColorStop(0.5, 'rgba(143,179,255,0.16)');
      hb.addColorStop(1, 'rgba(143,179,255,0)');
      ctx.fillStyle = hb;
      ctx.fillRect(-50, -10, 100, 30);
      // inner bevel shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 6;
      ctx.stroke(I);
      ctx.restore();
      ctx.strokeStyle = 'rgba(190,210,255,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke(hexPath(0, 0, 47, 0));
      // frame bolts and status lights
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        dots(ctx, [[Math.cos(a) * 53, Math.sin(a) * 53]], 2, '#b8c4e4');
      }
      A.emissive(ctx, circ(0, -52, 2), SUN_BLUE, 6);
      A.emissive(ctx, circ(0, 52, 2), PE.seam, 6);
    }, { pad: 6 });
    for (let k = 0; k < 12; k++) {
      A.define('b13:sun:sheen:' + k, 124, 124, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        ctx.save();
        ctx.clip(hexPath(0, 0, 48, 0));
        const off = U.lerp(-80, 80, k / 11);
        ctx.rotate(-0.9);
        const g = ctx.createLinearGradient(off - 16, 0, off + 16, 0);
        g.addColorStop(0, 'rgba(143,179,255,0)');
        g.addColorStop(0.5, 'rgba(210,228,255,0.85)');
        g.addColorStop(1, 'rgba(143,179,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(off - 16, -90, 32, 180);
        const g2 = ctx.createLinearGradient(off + 18, 0, off + 26, 0);
        g2.addColorStop(0, 'rgba(143,179,255,0)');
        g2.addColorStop(0.5, 'rgba(143,179,255,0.45)');
        g2.addColorStop(1, 'rgba(143,179,255,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(off + 18, -90, 8, 180);
        ctx.restore();
      }, { pad: 6 });
    }
    A.define('b13:sun:crack', 124, 124, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.save();
      ctx.clip(hexPath(0, 0, 48, 0));
      let s = 99;
      const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      ctx.lineCap = 'round';
      const cx = 10, cy = -6;
      for (let k = 0; k < 9; k++) {
        let a = (k / 9) * TAU + rand() * 0.4, x = cx, y = cy;
        const P = new Path2D();
        P.moveTo(x, y);
        for (let i = 0; i < 4; i++) { a += (rand() - 0.5) * 0.7; const l = 8 + rand() * 12; x += Math.cos(a) * l; y += Math.sin(a) * l; P.lineTo(x, y); }
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2.4;
        ctx.stroke(P);
        ctx.strokeStyle = 'rgba(220,235,255,0.85)';
        ctx.lineWidth = 0.9;
        ctx.stroke(P);
      }
      ctx.strokeStyle = 'rgba(220,235,255,0.6)';
      ctx.lineWidth = 0.8;
      for (const r of [9, 17]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }, { pad: 6 });

    // articulated arm parts
    A.define('b13:sun:strut', 120, 24, (ctx, w, h) => {
      ctx.translate(0, h / 2);
      const S = A.poly([[4, -8], [116, -6], [116, 6], [4, 8]]);
      A.metal(ctx, S, { base: '#353c52', light: '#d2dbf5', dark: '#06080e', spec: 0.6, specPos: 0.3, angle: -HALF, bounds: box(0, -9, 120, 18), edge: 1, rimLight: 1.2 });
      const R = A.poly([[20, -2.4], [100, -2.4], [100, 2.4], [20, 2.4]]);
      A.metal(ctx, R, { base: '#8d97b2', light: '#ffffff', spec: 0.9, angle: -HALF, bounds: box(20, -3, 80, 6), edge: 0.4, rimLight: 0.6 });
      A.panelLines(ctx, lineP([[60, -7], [60, 7]]), '#000', 0.6);
      A.emissive(ctx, lineP([[10, 5.5], [50, 5]]), PE.seam, 4, { stroke: 0.8 });
    }, { pad: 2 });
    A.define('b13:sun:hub', 30, 30, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      A.metal(ctx, circ(0, 0, 13), { base: '#40486a', light: '#e8eeff', dark: '#06080e', spec: 0.7, bounds: rbox(0, 0, 13), edge: 1, rimLight: 1.4 });
      ctx.fillStyle = '#0a0c14';
      ctx.fill(circ(0, 0, 5.5));
      A.emissive(ctx, circ(0, 0, 3), PE.glow, 6);
    }, { pad: 4 });
    A.define('b13:sun:gunbase', 64, 64, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      A.metal(ctx, circ(0, 0, 27), { base: '#363e57', light: '#e2e9ff', dark: '#05070c', spec: 0.75, specPos: 0.3, bounds: rbox(0, 0, 27), edge: 1.4, rimLight: 2 });
      A.panelLines(ctx, circ(0, 0, 19), '#000', 0.6);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; dots(ctx, [[Math.cos(a) * 23, Math.sin(a) * 23]], 1.4, '#9aa6c8'); }
      A.metal(ctx, circ(0, 0, 13), { base: '#4c5677', light: '#ffffff', spec: 0.9, bounds: rbox(0, 0, 13), edge: 0.8, rimLight: 1 });
      A.emissive(ctx, circ(-4, -4, 2.2), PE.glow, 5);
    }, { pad: 4 });
    A.define('b13:sun:barrel', 150, 30, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      for (const s of [-1, 1]) {
        const B = A.poly([[-6, s * 8 - 4.5], [62, s * 7 - 3.5], [62, s * 7 + 3.5], [-6, s * 8 + 4.5]]);
        A.metal(ctx, B, { base: '#4a5372', light: '#f0f4ff', dark: '#070910', spec: 0.85, angle: -HALF, bounds: box(-6, s * 8 - 5, 68, 10), edge: 0.8, rimLight: 1 });
        ctx.fillStyle = '#05060a';
        ctx.fillRect(58, s * 7 - 2.2, 5, 4.4);
        A.emissive(ctx, lineP([[44, s * 7], [56, s * 7]]), '#ffb070', 4, { stroke: 1 });
      }
      const Bk = A.poly([[-14, -13], [12, -12], [12, 12], [-14, 13]]);
      A.metal(ctx, Bk, { base: '#2c3247', light: '#c8d2f0', spec: 0.6, bounds: box(-14, -13, 26, 26), edge: 1, rimLight: 1.2 });
    }, { pad: 3 });
    A.define('b13:sun:plate', 112, 72, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const P = A.poly([[-52, -18], [-20, -32], [36, -28], [54, -4], [40, 26], [-6, 32], [-48, 18]]);
      A.metal(ctx, P, { base: '#323a52', light: '#cbd5f2', dark: '#05060b', spec: 0.6, specPos: 0.3, bounds: box(-54, -32, 108, 64), edge: 1.6, rimLight: 2 });
      A.panelLines(ctx, lineP([[-40, 0], [44, -6]]), '#000', 0.6);
      A.panelLines(ctx, lineP([[-4, -28], [2, 30]]), '#000', 0.5);
      for (const p of [[-34, -10], [24, -18], [28, 12], [-24, 14]]) dots(ctx, [p], 1.6, '#aab4d4');
      ctx.save();
      ctx.clip(P);
      scorch(ctx, -36, 14, 22, 4);
      ctx.restore();
      A.emissive(ctx, lineP([[-48, 18], [-30, 23], [-6, 32]]), '#ff7a3d', 6, { stroke: 1.4 });
    }, { pad: 6 });
  }
  defineSunArt();

  // ---- SUNEATER state helpers
  function sunMirror(b, i) { return b.data.mir[i]; }
  function sunMirrorAlive(m) { return !!(m && !m.loose && partAlive(m.c)); }
  function sunCore(b) { return { x: b.x + SUN_CORE.x, y: b.y + SUN_CORE.y }; }
  function sunUpdateMirrors(b, dt) {
    const d = b.data, t = SL.time.t;
    for (let i = 0; i < 4; i++) {
      const m = d.mir[i], D = m.def;
      m.k = U.approach(m.k, m.kWant, dt * 1.9);
      const e = SL.ease.outBack(U.clamp(m.k, 0, 1));
      let tx, ty;
      if (m.loose || !partAlive(m.c)) {
        // empty arm: droops and swings
        m.dangle = (m.dangle || 0) + dt;
        tx = D.root[0] + D.side * (34 + Math.sin(t * 1.4 + i) * 10);
        ty = D.root[1] + 120 + Math.cos(t * 1.1 + i) * 8;
      } else {
        const fx = D.root[0] - D.side * 6, fy = D.root[1] + 30;
        const hold = m.beam ? 0 : 1;
        tx = U.lerp(fx, D.rest[0], e) + hold * Math.sin(t * 1.3 + i * 1.7) * 7;
        ty = U.lerp(fy, D.rest[1], e) + hold * Math.cos(t * 0.9 + i * 2.1) * 6;
      }
      if (m.beam) { tx = m.pos.x; ty = m.pos.y; }
      m.pos.x = U.lerp(m.pos.x, tx, Math.min(1, dt * 8));
      m.pos.y = U.lerp(m.pos.y, ty, Math.min(1, dt * 8));
      ik(D.root[0], D.root[1], m.pos.x, m.pos.y, D.L, D.L, D.bend, m.elbow);
      // the panel turns toward the reflection it is making; idle it slowly rocks
      const want = m.beam ? 1 : 0.86 + 0.14 * Math.sin(t * 0.8 + i * 1.3);
      m.sx = U.lerp(m.sx, want, Math.min(1, dt * 5));
      if (m.glint > 0) m.glint -= dt;
    }
  }
  function sunPickNext(b) {
    const d = b.data;
    for (let n = 0; n < 4; n++) {
      d.mirCycle = (d.mirCycle + 1) % 4;
      const idx = SUN_MIR.findIndex((q) => q.order === d.mirCycle);
      const m = d.mir[idx];
      if (sunMirrorAlive(m) && !m.beam) return m;
    }
    return null;
  }
  /** Core -> mirror -> target bent beam (two core beams sharing one telegraph clock). */
  function sunReflect(b, m, tx, ty, tele) {
    const c = sunCore(b);
    const mx = b.x + m.pos.x, my = b.y + m.pos.y;
    const bm1 = SL.fireEnemyBeam(b, { angle: Math.atan2(my - c.y, mx - c.x), length: Math.hypot(mx - c.x, my - c.y), ox: SUN_CORE.x, oy: SUN_CORE.y, follow: true, width: 26, telegraph: tele, duration: 1.0 });
    const bm2 = SL.fireEnemyBeam(b, { angle: Math.atan2(ty - my, tx - mx), length: 1700, ox: m.pos.x, oy: m.pos.y, follow: true, width: 26, telegraph: tele, duration: 1.0 });
    m.beam = { bm1, bm2, tx, ty, tele };
    m.glint = 0.5;
    sfx('enemy_charge', { x: mx });
  }
  function sunUpdateBeams(b) {
    const d = b.data, c = sunCore(b);
    for (const m of d.mir) {
      const B = m.beam;
      if (!B) continue;
      if ((B.bm1.dead || B.bm1.state === 'fade') && (B.bm2.dead || B.bm2.state === 'fade')) { m.beam = null; continue; }
      if (!sunMirrorAlive(m)) {
        for (const bm of [B.bm1, B.bm2]) if (!bm.dead && bm.state !== 'fade') { bm.state = 'fade'; bm.fade = 0; }
        m.beam = null;
        continue;
      }
      const mx = b.x + m.pos.x, my = b.y + m.pos.y;
      B.bm1.angle = Math.atan2(my - c.y, mx - c.x);
      B.bm1.length = Math.hypot(mx - c.x, my - c.y);
      B.bm2.ox = m.pos.x;
      B.bm2.oy = m.pos.y;
      B.bm2.angle = Math.atan2(B.ty - my, B.tx - mx);
      if (B.bm2.state === 'active') m.glint = Math.max(m.glint, 0.12);
    }
  }
  function sunGunPos(b, i) { return { x: b.x + SUN_GUNS[i][0], y: b.y + SUN_GUNS[i][1] }; }
  function sunUpdateGuns(b, dt) {
    const d = b.data;
    for (let i = 0; i < 2; i++) {
      const g = sunGunPos(b, i);
      const want = aim(b, g.x, g.y);
      d.gunA[i] = U.lerpAngle(d.gunA[i], b.introDone ? want : HALF, Math.min(1, dt * 4));
      d.gunR[i] = Math.max(0, d.gunR[i] - dt * 5);
    }
  }
  function sunMuzzle(b, i) {
    const g = sunGunPos(b, i), a = b.data.gunA[i];
    return { x: g.x + Math.cos(a) * 52, y: g.y + Math.sin(a) * 52 };
  }
  function sunLipBurst(b) {
    for (let i = 0; i < 2; i++) {
      burst(b, 3, 0.12, () => sunMuzzle(b, i), (x, y, a) => {
        fire(x, y, a, 220, 'orbBig');
        b.data.gunR[i] = 1;
        SL.fx.emit({ x, y, life: 0.1, size: 26, size2: 6, color: '#fff2d0' });
      });
    }
    sfx('enemy_fire', { x: b.x });
  }
  /** Local stand-in for the solar_flare hazard (GDD 9.4) while the hazards module lacks it. */
  function sunFlareLocal(b) {
    const d = b.data;
    d.flare = { t: 0, warn: 2.5, burn: 1.2, burned: false };
    SL.bus.emit('hazardWarning', { id: 'solar_flare', text: 'SOLAR FLARE: GET IN THE SHADOW' });
    sfx('flare_warn');
    for (const x of [170, 550]) shadeProp(x + rnd(-40, 40), b.y + 330 + rnd(-30, 30), { skin: 'plate', life: 7, vy: 36, r: 58 });
  }
  function flareShaded(b, p) {
    for (const pr of SL.world.props) if (isShade(pr) && segCircle(p.x, p.y, p.x, p.y - 700, pr.x, pr.y, pr.r || 50)) return true;
    if (b.circles) for (const c of b.circles) if (segCircle(p.x, p.y, p.x, p.y - 700, b.x + c.x, b.y + c.y, c.r)) return true;
    return false;
  }
  function sunUpdateFlare(b, dt) {
    const f = b.data.flare;
    if (!f) return;
    f.t += dt;
    if (!f.burned && f.t >= f.warn) {
      f.burned = true;
      SL.fx.flash('#f4f8ff', 0.35, f.burn);
      sfx('flare_burn');
      for (const p of SL.world.players) {
        if (p.alive && !p.down && !p.display && !flareShaded(b, p)) SL.damagePlayer(p, 30, { source: 'flare' });
      }
    }
    if (f.t >= f.warn + f.burn) b.data.flare = null;
  }
  function sunNovaRelease(b) {
    const d = b.data, c = sunCore(b);
    ring(c.x, c.y, 36, 170, 'orb', { color: EBC.orange }, rnd(0, TAU));
    SL.fx.flash('#f4f8ff', 0.55, 0.55);
    SL.fx.shockwave(c.x, c.y, { radius: 900, duration: 0.9, strength: 1.6, color: '#cfe0ff' });
    sfx('flare_burn');
    for (const p of SL.world.players) {
      if (!p.alive || p.down || p.display) continue;
      if (!shadedFrom(c.x, c.y, p.x, p.y)) SL.damagePlayer(p, 30, { source: 'nova' });
    }
    d.burnT = 0.7;
  }

  const SUN_RAIN = { rate: 12, type: 'shard', y: 0, opts: { color: EBC.orange } };
  const SUN_SPA = { arms: 2, rate: 8, spin: 1.2, speed: 150, type: 'orb', opts: { color: EBC.pink } };
  const SUN_SPB = { arms: 2, rate: 8, spin: -1.2, speed: 150, type: 'orb', opts: { color: EBC.violet } };
  SL.bosses.define('boss_suneater', {
    name: 'SUNEATER', title: 'Stellar Harvester', hp: 33000, r: 230, score: 110000, parTime: 110, timeBonusRate: 250,
    transitionTime: 1.5, contactDamage: 20, music: 'mus_boss_heavy', palette: 'blue', shower: [60, 7], manualMove: true,
    init(b) {
      const d = b.data;
      b.x = 360;
      b.y = -280;
      d.stream = 0;
      d.iris = 0;
      d.irisWant = 0;
      d.irisOpenT = 0;
      d.gunA = [HALF, HALF];
      d.gunR = [0, 0];
      d.mirCycle = -1;
      d.rain = {};
      d.spinA = {};
      d.spinB = {};
      d.burnT = 0;
      d.pulse = 0;
      b.circles = SUN_CIRCLES.map((q) => ({ x: q[0], y: q[1], r: q[2] }));
      d.mir = SUN_MIR.map((D, i) => {
        const m = { def: D, i, k: 0, kWant: 0, pos: { x: D.root[0], y: D.root[1] + 30 }, elbow: { ex: 0, ey: 0 }, sx: 0.6, glint: 0, beam: null, loose: false };
        m.c = addPart(b, {
          key: D.key, hp: 1800, r: 50, bonus: 500, palette: 'blue', debris: '#2b3247',
          place(e, bb) { e.x = bb.x + m.pos.x; e.y = bb.y + m.pos.y; },
          onBreak(e) {
            glints(e.x, e.y, 26, 60, SUN_BLUE);
            for (let k = 0; k < 10; k++) {
              const a = Math.random() * TAU, sp = 120 + Math.random() * 260;
              SL.fx.emit({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, gravity: 500, life: 0.9 + Math.random() * 0.5, size: 6 + Math.random() * 8, color: '#2a3a5c', shape: 'debris', blend: 'normal', spin: (Math.random() - 0.5) * 14 });
            }
          },
        });
        return m;
      });
      d.core = addPart(b, {
        key: 'core', infinite: true, r: 86, mult: 1, palette: 'blue',
        place(e, bb) { e.x = bb.x + SUN_CORE.x; e.y = bb.y + SUN_CORE.y; e.r = bb.data.iris > 0.8 ? 60 : 86; },
      });
      try { A.prewarm(['b13:sun:hull', 'b13:sun:emis', 'b13:sun:mirror', 'b13:sun:petal', 'b13:sun:core', 'b13:sun:swirl', 'b13:sun:stream', 'b13:sun:collar', 'b13:sun:collar_emis']); } catch (err) { U.warnOnce('b13:prewarm', err); }
    },
    intro(b, dt) {
      const d = b.data;
      d.it = (d.it || 0) + dt;
      const t = d.it;
      d.stream = U.clamp(t / 1.2, 0, 1);
      b.y = U.lerp(-280, 240, SL.ease.outCubic(U.clamp((t - 0.9) / 2.1, 0, 1)));
      d.iris = U.clamp((t - 2.2) / 1.2, 0, 1) * 0.5;
      for (const m of d.mir) {
        const t0 = 2.1 + m.def.order * 0.38;
        if (t >= t0 && !m.kWant) { m.kWant = 1; m.glint = 0.6; sfx('sniper_lock', { x: b.x + m.def.rest[0] }); }
        if (m.kWant && m.k > 0.95 && !m.locked) { m.locked = true; glints(b.x + m.pos.x, b.y + m.pos.y, 10, 30, SUN_BLUE); }
      }
      if (!d.roared && t > 1.5) { d.roared = true; sfx('boss_roar'); SL.fx.shake(7, 1.0); }
      this.update(b, dt, true);
      return t >= 4.0;
    },
    update(b, dt, intro) {
      const d = b.data, t = SL.time.t;
      runJobs(b, dt);
      if (!intro && b.introDone) {
        b.x = 360 + Math.sin(b.fightT * 0.23) * 30;
        b.y = 240 + Math.sin(b.fightT * 0.41) * 8;
      }
      sunUpdateMirrors(b, dt);
      sunUpdateBeams(b);
      sunUpdateGuns(b, dt);
      sunUpdateFlare(b, dt);
      // iris: phase 1 breathes half open; phase 2 shut except the 2 s windows after a V; phase 3 wide
      if (d.irisOpenT > 0) d.irisOpenT -= dt;
      if (!intro) {
        if (b.phase === 0) d.irisWant = 0.5 + 0.12 * Math.sin(t * 1.7);
        else if (b.phase === 1) d.irisWant = d.irisOpenT > 0 ? 1 : 0.1;
        else d.irisWant = d.nova ? 1.25 : 1.1;
        d.iris = U.approach(d.iris, d.irisWant, dt * 2.6);
      }
      const open = d.iris > 0.8;
      d.core.mult = open ? (b.phase >= 2 ? 2.0 : b.phase === 1 ? 1.5 : 1) : 1;
      d.core.weak = d.core.mult > 1;
      d.pulse = Math.max(0, d.pulse - dt * 1.8);
      if (d.burnT > 0) d.burnT -= dt;
      damageFx(b, dt, SUN_DMG_PTS, '#9fc2ff');
    },
    phases: [
      {
        at: 1, name: 'Collector',
        enter(b) { const d = b.data; d.jobs = []; d.beamT = 1.4; d.dripT = 2.4; d.lipT = 1.8; },
        update(b, dt) {
          const d = b.data;
          d.beamT -= dt;
          if (d.beamT <= 0) {
            d.beamT = 3.2 / fr();
            const m = sunPickNext(b);
            if (m) { const tg = target(b); sunReflect(b, m, tg.x, tg.y, 0.9); }
          }
          d.dripT -= dt;
          if (d.dripT <= 0) {
            d.dripT = 4 / fr();
            const c = sunCore(b);
            fan(c.x, c.y + 70, aim(b, c.x, c.y + 70), 5, 0.9, 120, 'flare', { split: { at: 1.2, count: 6, type: 'shard', speed: 180 } });
            d.pulse = 1;
            sfx('enemy_fire', { x: c.x });
          }
          d.lipT -= dt;
          if (d.lipT <= 0) { d.lipT = 2 / fr(); sunLipBurst(b); }
        },
      },
      {
        at: 0.7, name: 'Prism',
        enter(b) {
          const d = b.data;
          d.jobs = [];
          d.vT = 1.5;
          d.rainT = 3.4;
          d.flareT = 6;
          d.vPair = 0;
          phaseBreak(b, [[-210, -120], [210, -120], [0, -180]], '#2b3247');
        },
        update(b, dt) {
          const d = b.data;
          d.vT -= dt;
          if (d.vT <= 0) {
            d.vT = 5 / fr();
            const tg = target(b);
            const pairs = d.vPair++ % 2 ? [[0, 3], [1, 2]] : [[1, 2], [0, 3]];
            let shot = 0;
            for (const pr of pairs) {
              const L = d.mir[pr[0]], R = d.mir[pr[1]];
              const ms = [L, R].filter((m) => sunMirrorAlive(m) && !m.beam);
              if (ms.length === 2) { for (const m of ms) sunReflect(b, m, tg.x, tg.y, 1.1); shot = 2; break; }
            }
            if (!shot) {
              const ms = d.mir.filter((m) => sunMirrorAlive(m) && !m.beam).slice(0, 2);
              for (const m of ms) sunReflect(b, m, tg.x, tg.y, 1.1);
              shot = ms.length;
            }
            // the iris opens for 2 s once the V has burned out (x1.5 window)
            later(b, shot ? 2.1 : 0.4, () => { d.irisOpenT = 2; sfx('beam_charge', { x: b.x, vol: 0.5 }); });
          }
          d.rainT -= dt;
          if (d.rainT <= 0) { d.rainT = 8 / fr(); rainStart(d.rain, { dur: 3 }); d.rainWarn = 0.6; }
          if (d.rainWarn > 0) d.rainWarn -= dt;
          else if (d.rain.dur) { SUN_RAIN.y = b.y + 236; rainStep(d.rain, dt, SUN_RAIN); }
          d.flareT -= dt;
          if (d.flareT <= 0) {
            d.flareT = 12;
            d.pulse = 1.4;
            d.starburst = 1;
            if (hazardsHas('solar_flare')) SL.spawnHazard('solar_flare', { from: 'top', count: 1, first: 2.5, cover: 2 });
            else sunFlareLocal(b);
          }
          if (d.starburst > 0) d.starburst = Math.max(0, d.starburst - dt * 0.4);
        },
      },
      {
        at: 0.4, name: 'Nova',
        enter(b) {
          const d = b.data;
          d.jobs = [];
          d.rain.dur = 0;
          d.novaT = 1.2;
          d.nova = null;
          d.hugeT = 2;
          d.spinA = { a: 0 };
          d.spinB = { a: PI / 4 };
          d.novaCount = 0;
          phaseBreak(b, [[-280, 0], [280, 0], [-120, -170], [120, -170]], '#2b3247');
          // every surviving mirror breaks loose and drifts down as shade cover
          for (const m of d.mir) {
            if (!sunMirrorAlive(m)) continue;
            const x = b.x + m.pos.x, y = b.y + m.pos.y;
            shadeProp(x, y, { skin: 'mirror', life: 8, vy: 36 + Math.random() * 4, vx: m.def.side * 20, r: 56, crack: true });
            glints(x, y, 14, 40, SUN_BLUE);
            SL.fx.sparks(x, y - 40, { count: 14, color: '#cfe0ff', speed: 300 });
            m.loose = true;
            dropPart(m.c);
          }
        },
        update(b, dt) {
          const d = b.data, c = sunCore(b);
          if (!d.nova) {
            d.novaT -= dt;
            if (d.novaT <= 0) {
              d.nova = { t: 0 };
              d.novaCount++;
              sfx('flare_warn');
              SL.fx.shake(3, 2.0);
              // hull plates tear loose so there is always cover (the falling mirrors only last 8 s)
              if (shadeCount() < 2) {
                for (const s of [-1, 1]) {
                  const x = U.clamp(c.x + s * rnd(140, 230), 90, 630);
                  shadeProp(x, b.y + 170 + rnd(0, 60), { skin: 'plate', life: 9, vy: 46, vx: s * 30, r: 58 });
                  SL.fx.explode(b.x + s * 270, b.y + 40, { size: 'm', palette: 'blue', sound: s > 0 });
                  shed(b.x + s * 270, b.y + 40, 10, 40, '#2b3247');
                }
              }
            }
            spiral(d.spinA, c.x, c.y, dt, SUN_SPA);
            spiral(d.spinB, c.x, c.y, dt, SUN_SPB);
          } else {
            d.nova.t += dt;
            if (d.nova.t >= 2.0) { sunNovaRelease(b); d.nova = null; d.novaT = 6 / fr(); }
          }
          if (b.hp / b.maxHp < 0.15) {
            d.hugeT -= dt;
            if (d.hugeT <= 0) { d.hugeT = 2 / fr(); fire(c.x, c.y + 60, aim(b, c.x, c.y + 60), 120, 'orb_huge'); }
          }
        },
      },
    ],
    draw(b, ctx) {
      const d = b.data, t = SL.time.t, x = b.x, y = b.y;
      const dying = b.dying, DT = b.deathT || 0;
      const c = { x: x + SUN_CORE.x, y: y + SUN_CORE.y };
      const novaK = d.nova ? U.clamp(d.nova.t / 2, 0, 1) : 0;
      // shadow wedges while a nova or the local flare burns
      if (d.burnT > 0 || (d.flare && d.flare.burned)) {
        const k = d.burnT > 0 ? U.clamp(d.burnT / 0.7, 0, 1) : 1;
        for (const pr of SL.world.props) if (isShade(pr)) drawShadow(ctx, d.burnT > 0 ? c.x : null, c.y, pr, k);
      }
      // plasma stream from the top edge into the throat and the core
      const cut = dying ? U.clamp(DT / 0.7, 0, 1) : 0;
      const sk = d.stream * (1 - cut) * (1 + 0.35 * (d.starburst || 0));
      if (sk > 0.01) {
        const bottom = b.introDone || b.y > c.y - 200 ? c.y : 254;
        const y1 = U.lerp(bottom, -40, SL.ease.inCubic(cut));
        const sw = (54 + 8 * Math.sin(t * 5.3)) * Math.min(1, sk) * (1 + 0.3 * (d.starburst || 0));
        ctx.globalCompositeOperation = 'lighter';
        const g = A.get('b13:sun:streamglow');
        ctx.globalAlpha = 0.55 * Math.min(1, sk);
        ctx.drawImage(g.canvas, c.x - sw * 1.9, -20, sw * 3.8, y1 + 20);
        ctx.globalAlpha = Math.min(1, sk);
        ctx.save();
        ctx.beginPath();
        ctx.rect(c.x - sw, -20, sw * 2, y1 + 20);
        ctx.clip();
        const tile = A.get('b13:sun:stream'), th = 256;
        const off = (t * 520) % th;
        for (let yy = -th + off - 20; yy < y1; yy += th) ctx.drawImage(tile.canvas, c.x - sw / 2 + Math.sin(t * 2 + yy * 0.01) * 3, yy, sw, th);
        const off2 = (t * 330) % th;
        ctx.globalAlpha = 0.5 * Math.min(1, sk);
        for (let yy = -th + off2 - 20; yy < y1; yy += th) ctx.drawImage(tile.canvas, c.x - sw * 0.35, yy, sw * 0.7, th);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (y < -260) return;
      const showHull = !(dying && DT > 2.75);
      // arms behind everything else
      for (const m of d.mir) {
        const D = m.def, rx = x + D.root[0], ry = y + D.root[1];
        const ex = x + m.elbow.ex, ey = y + m.elbow.ey, mx = x + m.pos.x, my = y + m.pos.y;
        if (dying && m.shattered && DT > 2.75) continue;
        drawStretch(ctx, 'b13:sun:strut', rx, ry, ex, ey, 28);
        drawStretch(ctx, 'b13:sun:strut', ex, ey, mx, my, 23);
        A.drawSprite(ctx, 'b13:sun:hub', ex, ey);
        A.drawSprite(ctx, 'b13:sun:hub', rx, ry, 0, 1.15);
        if (m.loose || !partAlive(m.c)) {
          A.drawSprite(ctx, 'b13:sun:hub', mx, my, 0, 0.9);
          if (Math.random() < 0.3) A.drawGlow(ctx, mx, my, 10 + Math.random() * 8, '#9fc2ff', 0.7);
        }
      }
      // hull
      if (showHull) {
        A.drawSprite(ctx, 'b13:sun:hull', x, y);
        const f = b.hp / b.maxHp;
        if (f < 0.7) A.drawSprite(ctx, 'b13:sun:dmg1', x, y);
        if (f < 0.4) A.drawSprite(ctx, 'b13:sun:dmg2', x, y);
        if (b.flash > 0) A.drawFlash(ctx, 'b13:sun:hull', x, y, 0, 1, (b.flash / 0.06) * 0.22);
        ctx.globalCompositeOperation = 'lighter';
        const em = 0.55 + 0.3 * Math.sin(t * 2.4) + 0.4 * d.pulse + 0.5 * novaK;
        A.drawSprite(ctx, 'b13:sun:emis', x, y, 0, 1, Math.min(1, em) * (dying ? Math.max(0, 1 - DT / 2.4) : 1));
        ctx.globalCompositeOperation = 'source-over';
      }
      // maw: core glow, plasma ball, swirl, then the iris petals
      let coreS = 1;
      if (dying) {
        if (DT > 1.2) coreS = Math.max(0.12, 1 - (DT - 1.2) / 0.8);
        if (DT > 2.0) coreS = 0.12 + (DT - 2.0) * 2.6;
      }
      const glowK = 0.75 + 0.25 * Math.sin(t * 3.1) + 0.6 * d.pulse + 1.2 * novaK + (d.irisOpenT > 0 ? 0.4 : 0);
      A.drawGlow(ctx, c.x, c.y, (150 + 90 * novaK) * Math.min(coreS, 1.6), '#2f5cff', Math.min(1, 0.3 * glowK));
      if (!(dying && DT > 2.0)) {
        A.drawSprite(ctx, 'b13:sun:core', c.x, c.y, t * 0.5, 0.95 * coreS * (1 + 0.06 * Math.sin(t * 6)));
        ctx.globalCompositeOperation = 'lighter';
        A.drawSprite(ctx, 'b13:sun:swirl', c.x, c.y, -t * 1.1, 0.95 * coreS, 0.7 + 0.3 * Math.sin(t * 2.2));
        ctx.globalCompositeOperation = 'source-over';
      }
      A.drawGlow(ctx, c.x, c.y, (22 + 6 * Math.sin(t * 7) + 46 * novaK) * coreS, '#dfe9ff', Math.min(1, 0.32 + 0.18 * glowK));
      if (showHull) {
        const io = U.clamp(d.iris, 0, 1.3);
        const rp = U.lerp(30, 92, Math.min(io, 1)) + Math.max(0, io - 1) * 14;
        const tw = U.lerp(0.7, 0.18, Math.min(io, 1));
        const spin = t * 0.22 + io * 0.6;
        for (let i = 0; i < 8; i++) {
          const th = spin + (i / 8) * TAU;
          const px = c.x + Math.cos(th) * rp, py = c.y + Math.sin(th) * rp;
          A.drawSprite(ctx, 'b13:sun:petal', px, py, th - HALF + tw, 1.12);
        }
        A.drawSprite(ctx, 'b13:sun:collar', c.x, c.y);
        if (b.flash > 0) A.drawFlash(ctx, 'b13:sun:collar', c.x, c.y, 0, 1, (b.flash / 0.06) * 0.2);
        ctx.globalCompositeOperation = 'lighter';
        A.drawSprite(ctx, 'b13:sun:collar_emis', c.x, c.y, 0, 1, Math.min(1, 0.55 + 0.25 * Math.sin(t * 3.3) + 0.5 * novaK + 0.3 * d.pulse));
        ctx.globalCompositeOperation = 'source-over';
        if (b.flash > 0 && d.core.ent && d.core.ent.flash > 0) A.drawGlow(ctx, c.x, c.y, 60, '#cfe0ff', 0.35);
        drawMark(ctx, d.core);
      }
      // lip guns (tracking turrets)
      if (showHull) {
        for (let i = 0; i < 2; i++) {
          const g = sunGunPos(b, i), a = d.gunA[i], rc = d.gunR[i] * 6;
          A.drawSprite(ctx, 'b13:sun:gunbase', g.x, g.y);
          A.drawSprite(ctx, 'b13:sun:barrel', g.x - Math.cos(a) * rc, g.y - Math.sin(a) * rc, a);
          A.drawGlow(ctx, g.x, g.y, 9, PE.glow, 0.6 + 0.4 * Math.sin(t * 4 + i * 2));
        }
      }
      // mirrors
      for (const m of d.mir) {
        if (m.loose || !partAlive(m.c) || m.shattered) continue;
        const mx = x + m.pos.x, my = y + m.pos.y, e = m.c.ent;
        const k = U.clamp(m.k, 0.05, 1.2);
        const rot = Math.sin(t * 0.7 + m.i) * 0.08 + m.def.side * 0.1;
        xf(ctx, mx, my, rot, m.sx * k, k);
        A.drawSprite(ctx, 'b13:sun:mirror', 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        A.drawSprite(ctx, SUN_SHEEN[((t * 6 + m.i * 3) | 0) % 12], 0, 0, 0, 1, 0.75);
        ctx.globalCompositeOperation = 'source-over';
        if (e.hp < e.maxHp * 0.5) A.drawSprite(ctx, 'b13:sun:crack', 0, 0);
        if (e.flash > 0) A.drawFlash(ctx, 'b13:sun:mirror', 0, 0, 0, 1, (e.flash / 0.06) * 0.5);
        unxf(ctx);
        if (m.beam) {
          const B = m.beam, act = B.bm2.state === 'active';
          const kk = act ? 1 : U.clamp(B.bm2.t / B.tele, 0, 1);
          if (B.bm2.state === 'telegraph') {
            // the full bent path, core -> mirror -> target area, brightening toward the shot
            const pulse = (0.35 + 0.6 * kk) * (0.7 + 0.3 * Math.sin(t * 34));
            const wl = 2 + 3.5 * kk, a2 = B.bm2.angle;
            warnLine(ctx, c.x, c.y, mx, my, wl, pulse);
            warnLine(ctx, mx, my, mx + Math.cos(a2) * 1700, my + Math.sin(a2) * 1700, wl, pulse);
            chevrons(ctx, c.x, c.y, Math.atan2(my - c.y, mx - c.x), Math.hypot(mx - c.x, my - c.y), t, 0.5 + 0.5 * kk);
            chevrons(ctx, mx, my, a2, Math.min(1500, Math.hypot(B.tx - mx, B.ty - my) + 200), t, 0.5 + 0.5 * kk);
          }
          A.drawGlow(ctx, mx, my, 40 + 40 * kk, act ? '#ffd0f0' : SUN_BLUE, 0.4 + 0.5 * kk);
          if (!act && B.bm2.state === 'telegraph') {
            // target-area reticle at the end of the bent line
            const rg = A.ring('#ff4fd8', 64, 3), rr = 46 - 22 * kk;
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.35 + 0.5 * kk;
            ctx.drawImage(rg, B.tx - rr, B.ty - rr, rr * 2, rr * 2);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
        }
        if (m.glint > 0) drawGlint(ctx, mx - 18, my - 22, 0.9 + m.glint, m.glint * 2, t);
      }
      // rain: shimmering prism sheet along the mirror line
      if (d.rain && d.rain.dur && (d.rainWarn > 0 || d.rain.t < d.rain.dur)) {
        const ry = y + 236, k = d.rainWarn > 0 ? 1 - d.rainWarn / 0.6 : 1;
        const g = A.get('b13:sun:streamglow');
        xf(ctx, W / 2, ry, HALF);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (0.35 + 0.25 * Math.sin(t * 30)) * k;
        ctx.drawImage(g.canvas, -8, -W / 2, 16, W);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        unxf(ctx);
        for (const ln of d.rain.lanes || []) A.drawGlow(ctx, ln, ry, 18, '#9fc2ff', 0.5 * k);
      }
      // nova charge: screen edges white, the core swells
      if (novaK > 0) {
        drawEdges(ctx, novaK * (0.6 + 0.4 * Math.sin(t * 24)), false, 90 + 90 * novaK);
        const rg = A.ring('#eaf2ff', 64, 4), rr = 260 - 190 * novaK;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = novaK;
        ctx.drawImage(rg, c.x - rr, c.y - rr, rr * 2, rr * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (d.flare && !d.flare.burned) drawEdges(ctx, (d.flare.t / d.flare.warn) * (0.6 + 0.4 * Math.sin(t * 20)), true, 140);
      if (dying && DT > 2.0) A.drawGlow(ctx, c.x, c.y, 120 + 520 * U.clamp((DT - 2.0) / 0.8, 0, 1), '#ffffff', Math.min(1, (DT - 2.0) * 2));
    },
    onDeath(b) {
      const d = b.data;
      d.irisWant = 1.3;
      for (const m of d.mir) m.beam = null;
      d.rain.dur = 0;
      d.nova = null;
      d.flare = null;
    },
    dying(b, dt) {
      const d = b.data, T = b.deathT, c = sunCore(b);
      sunUpdateMirrors(b, dt);
      d.iris = U.approach(d.iris, 1.3, dt * 2);
      if (!d.cutFx) { d.cutFx = true; SL.fx.flash('#cfe0ff', 0.4, 0.3); glints(b.x, b.y - 180, 20, 40, SUN_BLUE); sfx('beam_fire', { x: b.x }); }
      // mirrors shatter into glints one by one
      d.mir.forEach((m, i) => {
        if (!m.shattered && T > 0.3 + i * 0.28) {
          m.shattered = true;
          if (sunMirrorAlive(m)) {
            const x = b.x + m.pos.x, y = b.y + m.pos.y;
            glints(x, y, 30, 70, SUN_BLUE);
            SL.fx.explode(x, y, { size: 'm', palette: 'blue', sound: i % 2 === 0 });
            dropPart(m.c);
          }
        }
      });
      if (T < 2.1) chain(b, dt, 0.12, 'blue');
      // implosion: sparks streak into the core, then it blooms white
      if (T > 1.2 && T < 2.0) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * TAU, r = 160 + Math.random() * 140;
          SL.fx.emit({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.2, vy: -Math.sin(a) * r * 2.2, life: 0.42, size: 4, size2: 1, color: '#ffffff', color2: SUN_BLUE, shape: 'spark', stretch: 4 });
        }
        SL.render.addRipple(c.x, c.y, 220 * (2.0 - T), 10, 60);
      }
      if (T > 2.0 && !d.bloom) { d.bloom = true; SL.fx.flash('#ffffff', 0.6, 0.5); sfx('explode_xl', { x: c.x }); SL.fx.shake(14, 0.8); }
      if (T >= 2.85 && !d.finished) finish(b, 'blue', [60, 7]);
    },
  });

  // ================================================================== OUROBOROS (boss_ouroboros, m5)
  // The coil is a circle-space texture (band OU_RI..OU_RO) that rotates and is squashed by OU_KY into the on-screen
  // ellipse, so the scale plates slide round the ring while static ellipse-space light overlays keep the key light in
  // the upper left. Parts: engine_l / engine_r (collapsar pods), spine (phase 3: warped shots only), crown (phase 4).
  const OU_RI = 183, OU_RO = 288, OU_BW = OU_RO - OU_RI, OU_RM = (OU_RI + OU_RO) / 2, OU_HB = OU_BW / 2, OU_KY = 0.79;
  const OU_NPL = 32, OU_DPL = TAU / OU_NPL, OU_LEAD = 0.05;
  const OU_TUR = [];
  for (let i = 0; i < 8; i++) OU_TUR.push((2.5 + 4 * i) * OU_DPL + OU_LEAD * 0.8);
  const OU_HEAD = { x: 0, y: -180 };
  const OU_CROWN = { x: 0, y: -232 };
  const OU_MOUTH = { x: 0, y: -66 };
  const OU_ENG = [{ key: 'engine_l', s: -1, x: -300, y: 4 }, { key: 'engine_r', s: 1, x: 300, y: 4 }];
  const OU_SPINE = [{ x: -100, y: -170, s: -1 }, { x: 100, y: -170, s: 1 }];
  const OU_PORTALS = [{ a: [160, 900], b: [260, 120] }, { a: [560, 900], b: [460, 120] }];
  const OU_HOLE = { x: 360, y: 160 };
  const OU_VIO = '#b26bff', OU_PINK = '#ff2f6d', OU_LIL = '#dcc2ff';
  const OU_CR_Y = 8; // the crown sprite's eye sits 8 px below its box centre
  function ouPolar(a, u) { const r = OU_RI + u * OU_BW; return [Math.cos(a) * r, Math.sin(a) * r]; }
  function ouAnn(r0, r1) { const p = new Path2D(); p.arc(0, 0, r1, 0, TAU); p.moveTo(r0, 0); p.arc(0, 0, r0, 0, TAU, true); return p; }
  function ringPath(x, y, r1, r0) { const p = new Path2D(); p.arc(x, y, r1, 0, TAU); p.moveTo(x + r0, y); p.arc(x, y, r0, 0, TAU, true); return p; }
  const ouTri = (u) => 1 - Math.abs((2 * (u - 0.235)) / 0.53 - 1);
  /** Point on a dorsal plate at angle a (plate rear edge) and band position u, following the chevron lead. */
  function ouOn(a, u) { return ouPolar(a + OU_LEAD * U.clamp(ouTri(u), 0, 1), u); }
  /** Chevron plate between angles a0..a1 (travel +angle) across u0..u1; its centre leads by `lead` rad. */
  function ouChevron(a0, a1, u0, u1, lead) {
    const pts = [], n = 6;
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(ouPolar(a1 + lead * (1 - Math.abs(2 * t - 1)), U.lerp(u0, u1, t))); }
    for (let i = n; i >= 0; i--) { const t = i / n; pts.push(ouPolar(a0 + lead * (1 - Math.abs(2 * t - 1)), U.lerp(u0, u1, t))); }
    return A.poly(pts);
  }
  function ouVLine(a, u0, u1, lead) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(ouPolar(a + lead * (1 - Math.abs(2 * t - 1)), U.lerp(u0, u1, t))); }
    return A.poly(pts, true);
  }
  /** Per-pixel canvas (sprite generators only): fn(x, y, out) with x, y from the canvas centre fills out[0..3]. */
  function pixelCanvas(w, h, fn) {
    const cv = A.canvas(w, h), x = cv.getContext('2d');
    const img = x.createImageData(w, h), p = img.data, out = [0, 0, 0, 0];
    for (let j = 0; j < h; j++) {
      const py = j + 0.5 - h / 2;
      for (let i = 0; i < w; i++) {
        out[3] = 0;
        fn(i + 0.5 - w / 2, py, out);
        if (!(out[3] > 0)) continue;
        const k = (j * w + i) * 4;
        p[k] = out[0]; p[k + 1] = out[1]; p[k + 2] = out[2]; p[k + 3] = out[3];
      }
    }
    x.putImageData(img, 0, 0);
    return cv;
  }
  function nsamp(n, w, h, x, y) {
    x = ((x % w) + w) % w; y = ((y % h) + h) % h;
    const x0 = x | 0, y0 = y | 0, x1 = (x0 + 1) % w, y1 = (y0 + 1) % h, fx = x - x0, fy = y - y0;
    const a = n[y0 * w + x0], b = n[y0 * w + x1], c = n[y1 * w + x0], d = n[y1 * w + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function ramp(stops, t, out) {
    t = U.clamp(t, 0, 1);
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const a = stops[i], b = stops[i + 1], f = U.clamp((t - a[0]) / (b[0] - a[0] || 1), 0, 1);
    out[0] = a[1] + (b[1] - a[1]) * f; out[1] = a[2] + (b[2] - a[2]) * f; out[2] = a[3] + (b[3] - a[3]) * f;
    return out;
  }
  function norm3(x, y, z) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }
  /** Draws a sprite so that box point (ox, oy) (from the box centre) lands on (x, y), rotated about it. */
  function drawAt(ctx, key, x, y, rot, ox, oy, sc, alpha) {
    const s = A.get(key);
    xf(ctx, x, y, rot || 0, sc == null ? 1 : sc);
    const pa = ctx.globalAlpha;
    if (alpha != null) ctx.globalAlpha = pa * alpha;
    ctx.drawImage(s.canvas, -s.cw / 2 - ox, -s.ch / 2 - oy, s.cw, s.ch);
    ctx.globalAlpha = pa;
    unxf(ctx);
  }
  /** Circle-space coil sprite: rotate by rot, squash by OU_KY, scale sc, centre (cx, cy). */
  function drawCoilLayer(ctx, key, cx, cy, rot, sc, alpha) {
    if (!(alpha > 0)) return;
    const s = A.get(key), b0 = SL.render.base, bs = b0.s;
    const c = Math.cos(rot) * sc * bs, si = Math.sin(rot) * sc * bs;
    ctx.setTransform(c, si * OU_KY, -si, c * OU_KY, b0.x + cx * bs, b0.y + cy * bs);
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * Math.min(1, alpha);
    ctx.drawImage(s.canvas, -s.cw / 2, -s.ch / 2, s.cw, s.ch);
    ctx.globalAlpha = pa;
    unxf(ctx);
  }
  const OU_CR_SPK = [];
  for (let k = 0; k < 7; k++) OU_CR_SPK.push({ a: -HALF + (k - 3) * 0.43, L: 58 - Math.abs(k - 3) * 6.5, w: 10.5 - Math.abs(k - 3) * 0.9 });
  const OU_HOOD_E = [[178, 34], [188, -18], [168, -70], [128, -106], [78, -126], [28, -134]];

  function defineOuroArt() {
    const uR = (u) => OU_RI + u * OU_BW;
    const LIT = { x: -0.6, y: -0.8 };
    // ---------------------------------------------------------------- coil (circle space, rotates)
    A.define('b13:ou:coil', 576, 576, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const g = ctx.createRadialGradient(0, 0, OU_RI, 0, 0, OU_RO);
      g.addColorStop(0, '#06060b'); g.addColorStop(0.1, '#11121a'); g.addColorStop(0.5, '#1a1c28'); g.addColorStop(0.9, '#11121a'); g.addColorStop(1, '#06060b');
      ctx.fillStyle = g;
      ctx.fill(ouAnn(OU_RI, OU_RO));
      // flank scales: one shingled row on each edge, free edges toward the tail (-angle)
      const scaleRow = (u0, u1, n, seed) => {
        ctx.save();
        ctx.clip(ouAnn(uR(u0), uR(u1)));
        const r = uR((u0 + u1) / 2), wR = (u1 - u0) * OU_BW * 1.06, l = (TAU * r) / n;
        let s = seed;
        const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        for (let k = 0; k <= n; k++) {
          ctx.save();
          ctx.rotate((k / n) * TAU);
          ctx.translate(r, 0);
          const p = new Path2D();
          p.moveTo(-wR / 2, l * 0.56); p.lineTo(wR / 2, l * 0.56); p.lineTo(wR / 2, -l * 0.08);
          p.quadraticCurveTo(wR / 2, -l * 0.62, 0, -l * 0.66);
          p.quadraticCurveTo(-wR / 2, -l * 0.62, -wR / 2, -l * 0.08);
          p.closePath();
          const v = rand() * 0.07;
          const sg = ctx.createLinearGradient(0, l * 0.56, 0, -l * 0.66);
          sg.addColorStop(0, '#0a0a11');
          sg.addColorStop(0.55, C.lighten('#191a27', v));
          sg.addColorStop(1, C.lighten('#2c2d3e', v));
          ctx.fillStyle = sg;
          ctx.fill(p);
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.lineWidth = 1;
          ctx.stroke(p);
          ctx.strokeStyle = 'rgba(214,200,255,0.24)';
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(wR * 0.4, -l * 0.14);
          ctx.quadraticCurveTo(wR * 0.4, -l * 0.56, 0, -l * 0.6);
          ctx.quadraticCurveTo(-wR * 0.4, -l * 0.56, -wR * 0.4, -l * 0.14);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      };
      scaleRow(0, 0.17, 64, 11);
      scaleRow(0.83, 1, 72, 23);
      // lateral grooves (the emissive layer lights them pink)
      for (const [u0, u1] of [[0.17, 0.225], [0.775, 0.83]]) {
        ctx.fillStyle = '#040408';
        ctx.fill(ouAnn(uR(u0), uR(u1)));
        ctx.strokeStyle = 'rgba(190,175,240,0.16)';
        ctx.lineWidth = 1;
        ctx.stroke(circ(0, 0, uR(u0)));
        ctx.stroke(circ(0, 0, uR(u1)));
      }
      // dorsal plates: 32 chevrons with a raised keel
      for (let k = 0; k < OU_NPL; k++) {
        const a0 = k * OU_DPL + 0.009, a1 = (k + 1) * OU_DPL - 0.009;
        const P = ouChevron(a0, a1, 0.235, 0.765, OU_LEAD);
        const cm = ouPolar((a0 + a1) / 2 + OU_LEAD * 0.6, 0.5);
        const pg = ctx.createRadialGradient(cm[0], cm[1], 2, cm[0], cm[1], 46);
        const tint = (k * 7) % 5 === 0 ? 0.05 : 0;
        pg.addColorStop(0, C.lighten('#2b2d3e', tint)); pg.addColorStop(0.6, '#1b1c29'); pg.addColorStop(1, '#0e0f17');
        ctx.fillStyle = pg;
        ctx.fill(P);
        clipped(ctx, P, () => {
          ctx.strokeStyle = 'rgba(0,0,0,0.62)';
          ctx.lineWidth = 5;
          ctx.stroke(P);
          const k0 = ouPolar(a0 + OU_LEAD, 0.5), k1 = ouPolar(a1 + OU_LEAD, 0.5);
          const j0 = ouPolar(a0 + OU_LEAD * 0.9, 0.53), j1 = ouPolar(a1 + OU_LEAD * 0.9, 0.53);
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#3b3d54';
          ctx.lineWidth = 3.4;
          ctx.beginPath(); ctx.moveTo(k0[0], k0[1]); ctx.lineTo(k1[0], k1[1]); ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.65)';
          ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.moveTo(j0[0], j0[1]); ctx.lineTo(j1[0], j1[1]); ctx.stroke();
          if (k % 8 === 5) {
            for (let v = 0; v < 4; v++) {
              const u = 0.31 + v * 0.05;
              const q0 = ouOn(a0 + 0.05, u), q1 = ouOn(a1 - 0.06, u);
              ctx.strokeStyle = '#050509';
              ctx.lineWidth = 2.6;
              ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
            }
          }
        });
        ctx.strokeStyle = 'rgba(205,195,245,0.14)';
        ctx.lineWidth = 1;
        ctx.stroke(P);
        A.panelLines(ctx, ouVLine((a0 + a1) / 2, 0.27, 0.73, OU_LEAD), '#000', 0.42);
        dots(ctx, [ouOn(a0 + 0.02, 0.29), ouOn(a0 + 0.02, 0.71), ouOn(a1 - 0.022, 0.29), ouOn(a1 - 0.022, 0.71)], 1.5, '#5d5f78');
      }
      // turret sockets (the turrets ride the plates)
      for (const phi of OU_TUR) {
        const p = ouPolar(phi, 0.5);
        A.metal(ctx, ringPath(p[0], p[1], 19, 12.5), { base: '#2a2c40', light: '#e0d8ff', dark: '#050409', spec: 0.7, bounds: rbox(p[0], p[1], 19), edge: 0.8, rimLight: 1.2 });
        ctx.fillStyle = '#030306';
        ctx.fill(circ(p[0], p[1], 12.5));
      }
      grime(ctx, w, h, 101, 0.85);
    }, { pad: 4 });
    A.define('b13:ou:coil_emis', 576, 576, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      for (const u of [0.1975, 0.8025]) A.emissive(ctx, circ(0, 0, uR(u)), OU_PINK, 8, { stroke: 1.4 });
      for (let k = 0; k < OU_NPL; k++) {
        const a = k * OU_DPL;
        A.emissive(ctx, ouVLine(a, 0.245, 0.755, OU_LEAD), '#ff3b7a', 6, { stroke: 1.1 });
        for (const u of [0.29, 0.71]) { const p = ouOn(a + 0.034, u); A.emissive(ctx, circ(p[0], p[1], 1.5), OU_VIO, 6); }
      }
      for (const phi of OU_TUR) { const p = ouPolar(phi, 0.5); A.emissive(ctx, circ(p[0], p[1], 16), '#ff5c8a', 7, { stroke: 1.2 }); }
    }, { pad: 10 });
    const coilDmg = (seed, spots) => (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.save();
      ctx.clip(ouAnn(OU_RI + 3, OU_RO - 3));
      spots.forEach((s, i) => { const p = ouPolar(s[0], s[1]); scorch(ctx, p[0], p[1], s[2], seed + i); });
      ctx.restore();
    };
    A.define('b13:ou:coil_dmg1', 576, 576, coilDmg(41, [[0.4, 0.5, 34], [1.9, 0.42, 30], [3.3, 0.6, 36], [4.6, 0.45, 28], [5.6, 0.55, 30]]), { pad: 4 });
    A.define('b13:ou:coil_dmg2', 576, 576, coilDmg(57, [[0.95, 0.62, 30], [1.45, 0.35, 26], [2.6, 0.5, 38], [3.9, 0.4, 30], [5.1, 0.6, 34], [6.0, 0.4, 26], [0.1, 0.45, 24]]), { pad: 4 });
    // static torus lighting in ellipse space: shading (normal blend) and specular + violet rim (additive)
    const LW = 584, LH = Math.ceil(OU_RO * OU_KY * 2) + 8;
    const coilLight = (kind) => {
      const L = norm3(-0.5, -0.66, 0.56), Hh = norm3(L[0], L[1], L[2] + 1);
      return pixelCanvas(LW, LH, (x, y, out) => {
        const cy = y / OU_KY, rho = Math.sqrt(x * x + cy * cy);
        if (rho < OU_RI - 1 || rho > OU_RO + 1) return;
        const cov = U.clamp(Math.min(rho - OU_RI + 0.5, OU_RO + 0.5 - rho), 0, 1);
        const u = U.clamp((rho - OU_RM) / OU_HB, -1, 1);
        let gx = x / rho, gy = cy / (OU_KY * rho);
        const gl = Math.sqrt(gx * gx + gy * gy) || 1;
        gx /= gl; gy /= gl;
        const nz = Math.sqrt(Math.max(0, 1 - u * u)), nx = gx * u, ny = gy * u;
        if (kind === 'shade') {
          const lit = 0.24 + 0.92 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          out[0] = 3; out[1] = 2; out[2] = 9; out[3] = U.clamp(1 - lit, 0, 0.93) * cov * 255;
        } else {
          const ndh = Math.max(0, nx * Hh[0] + ny * Hh[1] + nz * Hh[2]);
          const s = Math.pow(ndh, 38) * 0.86 + Math.pow(ndh, 8) * 0.1;
          const rim = Math.pow(1 - nz, 2.4) * Math.max(0, nx * 0.6 + ny * 0.8) * 0.62;
          const a = Math.min(1, s + rim);
          if (a < 0.004) return;
          out[0] = Math.min(255, (228 * s + 186 * rim) / a); out[1] = Math.min(255, (232 * s + 92 * rim) / a); out[2] = 255; out[3] = a * cov * 255;
        }
      });
    };
    A.define('b13:ou:coil_shade', LW, LH, (ctx, w, h) => { ctx.drawImage(coilLight('shade'), 0, 0, w, h); }, { pad: 0 });
    A.define('b13:ou:coil_spec', LW, LH, (ctx, w, h) => { ctx.drawImage(coilLight('spec'), 0, 0, w, h); }, { pad: 0 });

    // ---------------------------------------------------------------- hood (cobra fan behind the skull; pivot = skull)
    const hoodPath = () => {
      const E = OU_HOOD_E, M = new Path2D();
      M.moveTo(0, 46);
      M.quadraticCurveTo(48, 58, 96, 54);
      M.quadraticCurveTo(150, 52, E[0][0], E[0][1]);
      for (let i = 1; i < E.length; i++) {
        const p0 = E[i - 1], p1 = E[i];
        M.quadraticCurveTo(((p0[0] + p1[0]) / 2) * 0.86, ((p0[1] + p1[1]) / 2) * 0.86, p1[0], p1[1]);
      }
      M.quadraticCurveTo(10, -114, 0, -118);
      M.quadraticCurveTo(-10, -114, -E[5][0], E[5][1]);
      for (let i = E.length - 2; i >= 0; i--) {
        const p0 = E[i + 1], p1 = E[i];
        M.quadraticCurveTo(-((p0[0] + p1[0]) / 2) * 0.86, ((p0[1] + p1[1]) / 2) * 0.86, -p1[0], p1[1]);
      }
      M.quadraticCurveTo(-150, 52, -96, 54);
      M.quadraticCurveTo(-48, 58, 0, 46);
      M.closePath();
      return M;
    };
    const ribs = (fn) => { for (const s of [-1, 1]) for (const e of OU_HOOD_E) fn(s * e[0], e[1], s); };
    A.define('b13:ou:hood', 410, 240, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2 + 34);
      const M = hoodPath();
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 196);
      g.addColorStop(0, '#2d1b40'); g.addColorStop(0.5, '#170e24'); g.addColorStop(1, '#0a0611');
      ctx.fillStyle = g;
      ctx.fill(M);
      clipped(ctx, M, () => {
        const n = A.noiseCanvas(205, 120, { scale: 9, octaves: 3, seed: 91, palette: [[0, '#000000', 0], [0.5, '#000000', 0.25], [1, '#3a2456', 0.5]] });
        ctx.globalAlpha = 0.8;
        ctx.drawImage(n, -205, -150, 410, 240);
        ctx.globalAlpha = 1;
        // membrane folds between the ribs and an upper-left sheen
        ribs((x, y) => {
          const a = Math.atan2(y, x), L = Math.hypot(x, y);
          for (const da of [-0.12, 0.12]) {
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(Math.cos(a + da) * 40, Math.sin(a + da) * 40); ctx.lineTo(Math.cos(a + da * 0.6) * L * 0.92, Math.sin(a + da * 0.6) * L * 0.92); ctx.stroke();
          }
        });
        const sh = ctx.createLinearGradient(-190, -130, 120, 60);
        sh.addColorStop(0, 'rgba(210,190,255,0.16)'); sh.addColorStop(0.45, 'rgba(210,190,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = sh;
        ctx.fillRect(-205, -150, 410, 240);
        // cobra hood markings: dark ocelli rings
        for (const s of [-1, 1]) {
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 7;
          ctx.stroke(circ(s * 104, -44, 22));
        }
      });
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke(M);
      // ribs: tapered spars that end in spikes past the membrane
      ribs((x, y) => {
        const a = Math.atan2(y, x), L = Math.hypot(x, y) + 18, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
        const r0 = 34;
        const P = A.poly([[ca * r0 + nx * 6.5, sa * r0 + ny * 6.5], [ca * (L - 30) + nx * 3, sa * (L - 30) + ny * 3], [ca * L, sa * L], [ca * (L - 30) - nx * 3, sa * (L - 30) - ny * 3], [ca * r0 - nx * 6.5, sa * r0 - ny * 6.5]]);
        const bx = Math.min(ca * r0, ca * L) - 8, by = Math.min(sa * r0, sa * L) - 8;
        A.metal(ctx, P, { base: '#2a2c3f', light: '#e6e0ff', dark: '#050409', spec: 0.75, specPos: 0.3, bounds: box(bx, by, Math.abs(ca * (L - r0)) + 16, Math.abs(sa * (L - r0)) + 16), edge: 0.8, rimLight: 1.2 });
      });
      grime(ctx, w, h, 93, 0.6);
    }, { pad: 8 });
    A.define('b13:ou:hood_emis', 410, 240, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2 + 34);
      ribs((x, y) => {
        const a = Math.atan2(y, x), L = Math.hypot(x, y);
        for (const da of [-0.07, 0.07]) A.emissive(ctx, lineP([[Math.cos(a + da) * 52, Math.sin(a + da) * 52], [Math.cos(a + da * 0.5) * L * 0.84, Math.sin(a + da * 0.5) * L * 0.84]]), '#ff3b7a', 5, { stroke: 0.9 });
        A.emissive(ctx, circ(Math.cos(a) * (L + 14), Math.sin(a) * (L + 14), 1.6), OU_LIL, 6);
      });
      for (const s of [-1, 1]) {
        A.emissive(ctx, circ(s * 104, -44, 22), OU_VIO, 10, { stroke: 2 });
        A.emissive(ctx, circ(s * 104, -44, 12), '#ff5c8a', 8, { stroke: 1.2 });
        A.emissive(ctx, circ(s * 104, -44, 3), '#ffd6f6', 6);
      }
    }, { pad: 12 });

    // ---------------------------------------------------------------- skull (faces down), mandibles, emissive
    const eyeP = (s) => {
      const p = new Path2D();
      const c = Math.cos(s * -0.42), sn = Math.sin(s * -0.42), ex = s * 64, ey = 4;
      const pt = (x, y) => [ex + x * c - y * sn, ey + x * sn + y * c];
      const a = pt(-17, 0), b = pt(17, 0), u1 = pt(0, -9), d1 = pt(0, 8);
      p.moveTo(a[0], a[1]); p.quadraticCurveTo(u1[0], u1[1], b[0], b[1]); p.quadraticCurveTo(d1[0], d1[1], a[0], a[1]); p.closePath();
      return p;
    };
    const SKULL = [[0, -100], [36, -97], [64, -84], [84, -60], [94, -28], [90, 2], [78, 32], [60, 60], [42, 86], [28, 106], [14, 116], [0, 118]];
    A.define('b13:ou:head', 240, 256, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      for (const s of [-1, 1]) {
        const Hn = new Path2D();
        Hn.moveTo(s * 54, -76); Hn.quadraticCurveTo(s * 98, -98, s * 114, -126); Hn.quadraticCurveTo(s * 102, -92, s * 76, -58); Hn.closePath();
        A.metal(ctx, Hn, { base: '#202233', light: '#f0ebff', dark: '#030207', spec: 0.9, specPos: 0.35, bounds: box(s < 0 ? -114 : 54, -126, 60, 68), edge: 0.8, rimLight: 1.6 });
      }
      const S = A.symPath(0, SKULL);
      A.metal(ctx, S, { base: '#1d1f2e', light: '#d4caff', dark: '#040309', spec: 0.58, specPos: 0.26, bounds: box(-94, -100, 188, 218), edge: 1.8, rimLight: 2.6 });
      clipped(ctx, S, () => {
        const g1 = ctx.createLinearGradient(-94, 0, 94, 0);
        g1.addColorStop(0, 'rgba(220,210,255,0.08)'); g1.addColorStop(0.5, 'rgba(0,0,0,0)'); g1.addColorStop(1, 'rgba(0,0,0,0.42)');
        ctx.fillStyle = g1;
        ctx.fillRect(-100, -110, 200, 230);
        const g2 = ctx.createLinearGradient(0, 40, 0, 120);
        g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = g2;
        ctx.fillRect(-100, 40, 200, 80);
        // cheek plates
        for (const s of [-1, 1]) {
          A.panelLines(ctx, lineP([[s * 40, -86], [s * 50, -40], [s * 86, -24]]), '#000', 0.6);
          A.panelLines(ctx, lineP([[s * 24, 22], [s * 70, 34], [s * 52, 70], [s * 30, 96]]), '#000', 0.55);
          for (let i = 0; i < 3; i++) A.panelLines(ctx, lineP([[s * (58 + i * 7), 40 + i * 6], [s * (48 + i * 6), 56 + i * 7]]), '#000', 0.7);
        }
        ctx.fillStyle = '#05030a';
        for (const s of [-1, 1]) ctx.fill(eyeP(s));
      });
      // crest keel
      const K = A.symPath(0, [[0, -98], [12, -94], [18, -50], [15, 20], [10, 92], [0, 108]]);
      A.metal(ctx, K, { base: '#2c2e43', light: '#f2eeff', dark: '#06050c', spec: 0.88, specPos: 0.3, bounds: box(-18, -98, 36, 206), edge: 1, rimLight: 1.6 });
      A.panelLines(ctx, lineP([[0, -90], [0, 100]]), '#000', 0.5);
      // brow ridges over the eyes
      for (const s of [-1, 1]) {
        const Bp = A.poly([[s * 22, -48], [s * 72, -30], [s * 94, -8], [s * 88, 0], [s * 62, -14], [s * 22, -32]]);
        A.metal(ctx, Bp, { base: '#2a2c40', light: '#f4f0ff', dark: '#050409', spec: 0.92, specPos: 0.32, bounds: box(s < 0 ? -94 : 22, -48, 72, 48), edge: 0.9, rimLight: 1.4 });
        // nostril slits
        ctx.fillStyle = '#030206';
        ctx.fill(A.poly([[s * 8, 88], [s * 18, 92], [s * 16, 98], [s * 7, 95]]));
      }
      // crown seat (the crown covers it until phase 4)
      A.metal(ctx, ringPath(0, -52, 40, 30), { base: '#26283c', light: '#e6e0ff', dark: '#050409', spec: 0.7, bounds: rbox(0, -52, 40), edge: 1, rimLight: 1.4 });
      ctx.fillStyle = '#040208';
      ctx.fill(circ(0, -52, 30));
      dots(ctx, [[-14, -78], [14, -78], [-30, 6], [30, 6], [-20, 60], [20, 60]], 1.6, '#6d6a8c');
      grime(ctx, w, h, 77, 0.6);
    }, { pad: 6 });
    A.define('b13:ou:head_emis', 240, 256, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      for (const s of [-1, 1]) {
        A.emissive(ctx, eyeP(s), '#b26bff', 12);
        const c = Math.cos(s * -0.42), sn = Math.sin(s * -0.42);
        A.emissive(ctx, lineP([[s * 64 - c * 11, 4 - sn * 11], [s * 64 + c * 11, 4 + sn * 11]]), '#f4e6ff', 6, { stroke: 1.6 });
        A.emissive(ctx, lineP([[s * 24, -30], [s * 62, -16], [s * 88, 2]]), OU_PINK, 6, { stroke: 1.3 });
        for (let i = 0; i < 3; i++) A.emissive(ctx, lineP([[s * (58 + i * 7), 41 + i * 6], [s * (49 + i * 6), 55 + i * 7]]), '#ff7a9a', 4, { stroke: 0.9 });
        A.emissive(ctx, circ(s * 12, 93, 2), '#ff5c8a', 6);
      }
      for (const y of [-70, -22, 30, 80]) A.emissive(ctx, circ(0, y, 1.7), OU_LIL, 6);
      A.emissive(ctx, circ(0, -52, 31), OU_VIO, 8, { stroke: 1.4 });
    }, { pad: 12 });
    for (const s of [-1, 1]) {
      A.define('b13:ou:mand:' + s, 50, 90, (ctx, w, h) => {
        ctx.translate(w / 2, 12);
        const M = new Path2D();
        M.moveTo(-s * 9, -7); M.lineTo(s * 13, -2);
        M.quadraticCurveTo(s * 19, 30, s * 7, 52);
        M.quadraticCurveTo(-s * 2, 66, -s * 13, 72);
        M.quadraticCurveTo(-s * 7, 48, -s * 6, 26);
        M.quadraticCurveTo(-s * 6, 8, -s * 9, -7);
        M.closePath();
        A.metal(ctx, M, { base: '#25273a', light: '#f2eeff', dark: '#040308', spec: 0.85, specPos: 0.3, bounds: box(-14, -7, 33, 80), edge: 0.9, rimLight: 1.5 });
        ctx.fillStyle = '#e8e2ff';
        for (let i = 0; i < 4; i++) {
          const y = 14 + i * 12, x = -s * (6.2 + i * 0.6);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s * 5, y + 3); ctx.lineTo(x, y + 6); ctx.closePath(); ctx.fill();
        }
        const E = new Path2D();
        E.moveTo(s * 13, 0); E.quadraticCurveTo(s * 19, 30, s * 7, 52); E.quadraticCurveTo(-s * 2, 66, -s * 13, 72);
        A.emissive(ctx, E, '#ff3b7a', 6, { stroke: 1.2 });
      }, { pad: 8 });
    }

    // ---------------------------------------------------------------- VAEL'S CROWN (eye at the box centre + OU_CR_Y)
    const crownBand = () => { const p = new Path2D(); p.ellipse(0, 0, 46, 40, 0, 0, TAU); p.ellipse(0, 0, 29, 20, 0, 0, TAU, true); return p; };
    const crownSpikes = (ctx, scale) => {
      for (const S of OU_CR_SPK) {
        const ca = Math.cos(S.a), sa = Math.sin(S.a), nx = -sa, ny = ca;
        const r0 = 33, r1 = 34 + S.L * scale;
        const b1 = [ca * r0 + nx * S.w, sa * r0 + ny * S.w], b2 = [ca * r0 - nx * S.w, sa * r0 - ny * S.w];
        const tip = [ca * r1, sa * r1], mid = [ca * (r0 + 9), sa * (r0 + 9)];
        const litPlus = nx * LIT.x + ny * LIT.y > 0;
        const F1 = A.poly([mid, b1, tip]), F2 = A.poly([mid, tip, b2]);
        const facet = (F, lit, e0) => {
          const g = ctx.createLinearGradient(e0[0], e0[1], tip[0], tip[1]);
          if (lit) { g.addColorStop(0, '#2a2340'); g.addColorStop(0.7, '#5f5288'); g.addColorStop(1, '#a596d8'); }
          else { g.addColorStop(0, '#050409'); g.addColorStop(1, '#16101f'); }
          ctx.fillStyle = g;
          ctx.fill(F);
        };
        facet(F1, litPlus, b1);
        facet(F2, !litPlus, b2);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.1;
        const le = litPlus ? b1 : b2, de = litPlus ? b2 : b1;
        ctx.beginPath(); ctx.moveTo(le[0], le[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
        ctx.strokeStyle = 'rgba(178,107,255,0.7)';
        ctx.beginPath(); ctx.moveTo(de[0], de[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
        ctx.strokeStyle = 'rgba(220,210,255,0.4)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(mid[0], mid[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      }
    };
    A.define('b13:ou:crown', 150, 150, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2 + OU_CR_Y);
      crownSpikes(ctx, 1);
      // chin jewel
      const Ch = A.poly([[-10, 36], [10, 36], [0, 60]]);
      ctx.fillStyle = '#0a0812';
      ctx.fill(Ch);
      ctx.fillStyle = '#3a3156';
      ctx.fill(A.poly([[-10, 36], [0, 36], [0, 60]]));
      // faceted obsidian band
      const band = crownBand();
      ctx.fillStyle = '#0b0912';
      ctx.fill(band, 'evenodd');
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
        const q = A.poly([[Math.cos(a0) * 46, Math.sin(a0) * 40], [Math.cos(a1) * 46, Math.sin(a1) * 40], [Math.cos(a1) * 29, Math.sin(a1) * 20], [Math.cos(a0) * 29, Math.sin(a0) * 20]]);
        const t = (Math.cos(am) * -LIT.x + Math.sin(am) * -LIT.y + 1) / 2;
        ctx.fillStyle = C.mix('#07060c', '#544a7c', Math.pow(t, 1.6));
        ctx.fill(q);
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 0.8;
        ctx.stroke(q);
        if (t > 0.78) {
          ctx.strokeStyle = 'rgba(255,255,255,' + ((t - 0.78) * 3.5).toFixed(2) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(Math.cos(a0 + 0.06) * 44, Math.sin(a0 + 0.06) * 38); ctx.lineTo(Math.cos(a0 + 0.06) * 32, Math.sin(a0 + 0.06) * 23); ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(0, 0, 45.5, 39.5, 0, PI * 1.05, PI * 1.62); ctx.stroke();
      ctx.strokeStyle = 'rgba(178,107,255,0.6)';
      ctx.beginPath(); ctx.ellipse(0, 0, 45.5, 39.5, 0, 0.1, 1.2); ctx.stroke();
      // closed eyelids fill the socket (the open eye is clipped in at run time)
      const So = new Path2D(); So.ellipse(0, 0, 29, 20, 0, 0, TAU);
      clipped(ctx, So, () => {
        const ul = ctx.createLinearGradient(0, -20, 0, 0);
        ul.addColorStop(0, '#2c2540'); ul.addColorStop(1, '#0c0915');
        ctx.fillStyle = ul;
        ctx.fillRect(-30, -21, 60, 21);
        const ll = ctx.createLinearGradient(0, 0, 0, 20);
        ll.addColorStop(0, '#09070f'); ll.addColorStop(1, '#1b1528');
        ctx.fillStyle = ll;
        ctx.fillRect(-30, 0, 60, 21);
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-29, 0); ctx.quadraticCurveTo(0, 3, 29, 0); ctx.stroke();
      });
      // gems at the spike roots
      for (const S of OU_CR_SPK) {
        const x = Math.cos(S.a) * 40, y = Math.sin(S.a) * 35;
        ctx.fillStyle = '#1a0d2a';
        ctx.fill(circ(x, y, 3.2));
      }
    }, { pad: 6 });
    A.define('b13:ou:crown_emis', 150, 150, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2 + OU_CR_Y);
      const So = new Path2D(); So.ellipse(0, 0, 30, 21, 0, 0, TAU);
      A.emissive(ctx, So, OU_VIO, 12, { stroke: 1.8 });
      OU_CR_SPK.forEach((S, i) => {
        const tip = 34 + S.L;
        A.emissive(ctx, circ(Math.cos(S.a) * (tip - 2), Math.sin(S.a) * (tip - 2), 1.8), '#f0dcff', 8);
        A.emissive(ctx, circ(Math.cos(S.a) * 40, Math.sin(S.a) * 35, 2.4), i % 2 ? OU_VIO : '#ff5c8a', 8);
      });
      const F = new Path2D(); F.ellipse(0, 0, 38, 30, 0, PI * 0.15, PI * 0.85);
      A.emissive(ctx, F, '#ff3b7a', 5, { stroke: 0.9 });
      A.emissive(ctx, circ(0, 46, 2), '#ff5c8a', 6);
    }, { pad: 12 });
    A.define('b13:ou:crown_crack', 150, 150, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2 + OU_CR_Y);
      let s = 4242;
      const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let k = 0; k < 12; k++) {
        let a = (k / 12) * TAU + rand() * 0.3, x = Math.cos(a) * 30, y = Math.sin(a) * 21;
        const P = new Path2D();
        P.moveTo(x, y);
        const n = 4 + ((rand() * 3) | 0);
        for (let i = 0; i < n; i++) { a += (rand() - 0.5) * 0.9; const l = 5 + rand() * 9; x += Math.cos(a) * l; y += Math.sin(a) * l * 0.9; P.lineTo(x, y); }
        ctx.shadowColor = OU_VIO;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = 'rgba(190,130,255,0.95)';
        ctx.lineWidth = 2.4;
        ctx.stroke(P);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,248,255,1)';
        ctx.lineWidth = 0.9;
        ctx.stroke(P);
      }
    }, { pad: 8 });
    A.define('b13:ou:iris', 48, 48, (ctx, w, h) => {
      const n = A.noise(64, 16, { scale: 8, octaves: 3, seed: 61 });
      const col = [0, 0, 0];
      const RAMP = [[0, 255, 240, 255], [0.28, 226, 160, 255], [0.62, 150, 66, 238], [0.88, 62, 18, 128], [1, 20, 6, 40]];
      ctx.drawImage(pixelCanvas(48, 48, (x, y, out) => {
        const r = Math.hypot(x, y) / 22;
        if (r > 1.04) return;
        let u = Math.atan2(y, x) / TAU;
        if (u < 0) u += 1;
        const f = 0.62 + 0.6 * nsamp(n, 64, 16, u * 64, r * 5);
        ramp(RAMP, r, col);
        out[0] = Math.min(255, col[0] * f); out[1] = Math.min(255, col[1] * f); out[2] = Math.min(255, col[2] * f);
        out[3] = U.clamp((1.04 - r) * 25, 0, 1) * 255;
      }), 0, 0, w, h);
    }, { pad: 0 });
    A.define('b13:ou:ray', 220, 40, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(220,180,255,0.75)'); g.addColorStop(0.7, 'rgba(178,107,255,0.25)'); g.addColorStop(1, 'rgba(178,107,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, h / 2 - 3); ctx.lineTo(w, h / 2 - 18); ctx.lineTo(w, h / 2 + 18); ctx.lineTo(0, h / 2 + 3); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'destination-in';
      const v = ctx.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    }, { pad: 0 });

    // ---------------------------------------------------------------- collapsar engine pods (origin = pod centre)
    for (const s of [-1, 1]) {
      // clamp sleeve round the body at the ring's side (the coil slides through it) + struts to the pod
      A.define('b13:ou:mount:' + s, 160, 132, (ctx, w, h) => {
        ctx.translate(w / 2 + s * 58, h / 2);
        const x0 = s < 0 ? 4 : -128, x1 = s < 0 ? 128 : -4;
        for (const y of [-30, 30]) {
          const St = A.poly([[s < 0 ? 0 : 0, y - 6], [-s * 26, y - 7], [-s * 26, y + 7], [0, y + 6]]);
          A.metal(ctx, St, { base: '#2a2c40', light: '#e6e0ff', dark: '#050409', spec: 0.7, bounds: box(Math.min(0, -s * 26), y - 7, 26, 14), edge: 0.8, rimLight: 1 });
        }
        const Sl = new Path2D();
        Sl.roundRect(Math.min(x0, x1), -50, 124, 100, 12);
        A.metal(ctx, Sl, { base: '#24263a', light: '#e2dbff', dark: '#040308', spec: 0.6, specPos: 0.3, bounds: box(Math.min(x0, x1), -50, 124, 100), edge: 1.6, rimLight: 2.2 });
        clipped(ctx, Sl, () => {
          const cg = ctx.createLinearGradient(Math.min(x0, x1), 0, Math.max(x0, x1), 0);
          cg.addColorStop(0, 'rgba(220,210,255,0.12)'); cg.addColorStop(0.4, 'rgba(0,0,0,0)'); cg.addColorStop(1, 'rgba(0,0,0,0.45)');
          ctx.fillStyle = cg;
          ctx.fillRect(Math.min(x0, x1), -52, 124, 104);
          for (let y = -36; y <= 36; y += 12) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(Math.min(x0, x1), y - 1.5, 124, 3);
            ctx.fillStyle = 'rgba(220,210,255,0.12)';
            ctx.fillRect(Math.min(x0, x1), y + 1.5, 124, 1);
          }
        });
        // clamp jaws
        for (const y of [-50, 50]) {
          const J = new Path2D();
          J.roundRect(Math.min(x0, x1) + 10, y - 9, 104, 18, 6);
          A.metal(ctx, J, { base: '#33364c', light: '#f4f0ff', dark: '#060509', spec: 0.85, specPos: 0.35, bounds: box(Math.min(x0, x1) + 10, y - 9, 104, 18), edge: 0.8, rimLight: 1.2 });
          dots(ctx, [[Math.min(x0, x1) + 20, y], [Math.min(x0, x1) + 62, y], [Math.min(x0, x1) + 104, y]], 1.8, '#8d89aa');
        }
        grime(ctx, w, h, 120 + s, 0.6);
      }, { pad: 6 });
      A.define('b13:ou:mount_emis:' + s, 160, 132, (ctx, w, h) => {
        ctx.translate(w / 2 + s * 58, h / 2);
        const x0 = s < 0 ? 4 : -128;
        A.emissive(ctx, lineP([[x0 + 8, 0], [x0 + 116, 0]]), OU_PINK, 6, { stroke: 1.2 });
        for (const y of [-30, 30]) A.emissive(ctx, lineP([[0, y], [-s * 22, y]]), OU_VIO, 6, { stroke: 1.4 });
      }, { pad: 10 });
    }
    const petalArc = (q) => [q * HALF - PI / 4 + 0.05, q * HALF + PI / 4 - 0.05];
    for (let q = 0; q < 4; q++) {
      A.define('b13:ou:petal:' + q, 100, 100, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        const [a0, a1] = petalArc(q);
        const P = new Path2D();
        P.arc(0, 0, 46, a0, a1);
        P.arc(0, 0, 14, a1, a0, true);
        P.closePath();
        A.metal(ctx, P, { base: '#22243a', light: '#ddd4ff', dark: '#040309', spec: 0.5, specPos: 0.3, bounds: rbox(0, 0, 46), edge: 1.4, rimLight: 2.2 });
        clipped(ctx, P, () => {
          const g = ctx.createRadialGradient(-16, -18, 2, -6, -8, 60);
          g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.16, 'rgba(205,195,255,0.14)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)');
          ctx.fillStyle = g;
          ctx.fillRect(-50, -50, 100, 100);
          const ar = new Path2D(); ar.arc(0, 0, 31, a0 + 0.05, a1 - 0.05);
          A.panelLines(ctx, ar, '#000', 0.55);
          const am = (a0 + a1) / 2;
          dots(ctx, [[Math.cos(am - 0.4) * 38, Math.sin(am - 0.4) * 38], [Math.cos(am + 0.4) * 38, Math.sin(am + 0.4) * 38], [Math.cos(am) * 22, Math.sin(am) * 22]], 1.6, '#8a86a8');
        });
      }, { pad: 4 });
      A.define('b13:ou:petal_e:' + q, 100, 100, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        const [a0, a1] = petalArc(q);
        const ar = new Path2D(); ar.arc(0, 0, 42, a0 + 0.1, a1 - 0.1);
        A.emissive(ctx, ar, OU_PINK, 7, { stroke: 1.3 });
        for (const a of [a0 + 0.02, a1 - 0.02]) A.emissive(ctx, lineP([[Math.cos(a) * 16, Math.sin(a) * 16], [Math.cos(a) * 44, Math.sin(a) * 44]]), '#ff5c8a', 5, { stroke: 0.9 });
      }, { pad: 10 });
    }
    A.define('b13:ou:eng_core', 96, 96, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const g = ctx.createRadialGradient(-8, -8, 4, 0, 0, 46);
      g.addColorStop(0, '#05030a'); g.addColorStop(0.55, '#140a24'); g.addColorStop(0.9, '#24123c'); g.addColorStop(1, '#0a0612');
      ctx.fillStyle = g;
      ctx.fill(circ(0, 0, 46));
      for (const r of [22, 32, 41]) { ctx.strokeStyle = 'rgba(178,107,255,0.4)'; ctx.lineWidth = 1.2; ctx.stroke(circ(0, 0, r)); }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.lineTo(Math.cos(a) * 45, Math.sin(a) * 45); ctx.stroke();
      }
    }, { pad: 2 });
    A.define('b13:ou:eng_wreck', 110, 110, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.fillStyle = '#07050b';
      ctx.fill(circ(0, 0, 30));
      let s = 77;
      const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let q = 0; q < 4; q++) {
        const [a0, a1] = petalArc(q);
        const pts = [];
        const n = 7;
        for (let i = 0; i <= n; i++) { const a = U.lerp(a0, a1, i / n); pts.push([Math.cos(a) * 47, Math.sin(a) * 47]); }
        for (let i = n; i >= 0; i--) { const a = U.lerp(a0, a1, i / n); const r = 26 + rand() * 14; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
        const P = A.poly(pts);
        A.metal(ctx, P, { base: '#1c1d2a', light: '#a9a2cc', dark: '#030206', spec: 0.35, bounds: rbox(0, 0, 47), edge: 1.2, rimLight: 1.4 });
        clipped(ctx, P, () => scorch(ctx, Math.cos((a0 + a1) / 2) * 32, Math.sin((a0 + a1) / 2) * 32, 22, 30 + q));
      }
    }, { pad: 4 });

    // ---------------------------------------------------------------- scale turrets, heart emitter, vanes
    A.define('b13:ou:tur_base', 40, 40, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const Hx = hexPath(0, 0, 16, PI / 6);
      A.metal(ctx, Hx, { base: '#24263a', light: '#e2dcff', dark: '#050409', spec: 0.6, bounds: rbox(0, 0, 16), edge: 1, rimLight: 1.6 });
      A.metal(ctx, circ(0, 0, 10), { base: '#34374e', light: '#ffffff', dark: '#07060c', spec: 0.9, specPos: 0.3, bounds: rbox(0, 0, 10), edge: 0.8, rimLight: 1.2 });
      const pts = [];
      for (let i = 0; i < 6; i++) { const a = PI / 6 + (i / 6) * TAU; pts.push([Math.cos(a) * 13, Math.sin(a) * 13]); }
      dots(ctx, pts, 1.2, '#8a86a8');
    }, { pad: 4 });
    A.define('b13:ou:tur_gun', 48, 20, (ctx, w, h) => {
      ctx.translate(w / 2 - 12, h / 2);
      for (const s of [-1, 1]) {
        const B = A.poly([[0, s * 4 - 2.4], [34, s * 4 - 2], [34, s * 4 + 2], [0, s * 4 + 2.4]]);
        A.metal(ctx, B, { base: '#3e4158', light: '#f6f2ff', dark: '#06050a', spec: 0.9, angle: -HALF, bounds: box(0, s * 4 - 3, 34, 6), edge: 0.5, rimLight: 0.8 });
        ctx.fillStyle = '#05040a';
        ctx.fillRect(32, s * 4 - 1.4, 3, 2.8);
      }
      const Bk = new Path2D(); Bk.roundRect(-8, -8, 16, 16, 4);
      A.metal(ctx, Bk, { base: '#2c2e44', light: '#e4ddff', spec: 0.7, bounds: box(-8, -8, 16, 16), edge: 0.8, rimLight: 1 });
      A.emissive(ctx, circ(0, 0, 2.2), '#ff5c8a', 5);
    }, { pad: 3 });
    A.define('b13:ou:heart', 80, 112, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const T = [0, -52], Bt = [0, 52], Lf = [-30, 0], Rt = [30, 0], Cn = [-5, -7];
      const fac = (pts, c0, c1) => {
        const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
        g.addColorStop(0, c0); g.addColorStop(1, c1);
        ctx.fillStyle = g;
        ctx.fill(A.poly(pts));
      };
      fac([T, Lf, Cn], '#6a5aa0', '#2a2046');
      fac([T, Rt, Cn], '#2c2346', '#120d1f');
      fac([Lf, Bt, Cn], '#1e1733', '#0b0814');
      fac([Rt, Bt, Cn], '#0d0a17', '#050309');
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 28);
      g.addColorStop(0, 'rgba(235,205,255,0.85)'); g.addColorStop(0.35, 'rgba(178,107,255,0.45)'); g.addColorStop(1, 'rgba(120,60,220,0)');
      ctx.fillStyle = g;
      ctx.fill(A.poly([T, Rt, Bt, Lf]));
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.1;
      ctx.stroke(lineP([Lf, T, Cn]));
      ctx.strokeStyle = 'rgba(178,107,255,0.75)';
      ctx.stroke(lineP([Rt, Bt, Lf]));
      ctx.strokeStyle = 'rgba(220,210,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke(lineP([Rt, Cn, Bt]));
    }, { pad: 6 });
    A.define('b13:ou:vane', 54, 22, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const V = new Path2D();
      V.moveTo(-26, -7); V.quadraticCurveTo(4, -9, 25, -1.5); V.lineTo(25, 1.5); V.quadraticCurveTo(4, 6, -26, 7); V.closePath();
      A.metal(ctx, V, { base: '#2a2c42', light: '#f0ebff', dark: '#050409', spec: 0.85, angle: -HALF, bounds: box(-26, -9, 52, 18), edge: 0.8, rimLight: 1.2 });
      A.emissive(ctx, lineP([[-20, 0], [18, 0]]), '#ff3b7a', 5, { stroke: 1.2 });
      A.emissive(ctx, circ(23, 0, 2.2), OU_LIL, 6);
    }, { pad: 6 });

    // ---------------------------------------------------------------- phase 3: shield lattice, spine, armour flaps
    A.define('b13:ou:shield', 650, 620, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2 + 40);
      const M = new Path2D();
      M.ellipse(0, 0, OU_RO + 18, (OU_RO + 18) * OU_KY, 0, 0, TAU);
      M.ellipse(0, 0, OU_RI - 14, (OU_RI - 14) * OU_KY, 0, 0, TAU, true);
      M.ellipse(0, -196, 176, 116, 0, 0, TAU);
      ctx.save();
      ctx.clip(M);
      ctx.fillStyle = 'rgba(150,90,255,0.10)';
      ctx.fillRect(-w / 2, -h / 2 - 40, w, h);
      ctx.strokeStyle = 'rgba(200,150,255,0.62)';
      ctx.lineWidth = 1.2;
      const R = 17, dx = R * 1.5, dy = R * Math.sqrt(3);
      for (let i = -16; i <= 16; i++) {
        for (let j = -13; j <= 13; j++) {
          const x = i * dx, y = j * dy + (i % 2 ? dy / 2 : 0) - 40;
          ctx.stroke(hexPath(x, y, R - 1.5, 0));
        }
      }
      ctx.restore();
      ctx.save();
      ctx.shadowColor = OU_VIO;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = 'rgba(214,176,255,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke(M);
      ctx.restore();
    }, { pad: 16 });
    A.define('b13:ou:hex', 40, 40, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.shadowColor = '#e0c4ff';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(245,232,255,0.95)';
      ctx.lineWidth = 2;
      ctx.stroke(hexPath(0, 0, 15, 0));
      ctx.fillStyle = 'rgba(190,140,255,0.35)';
      ctx.fill(hexPath(0, 0, 14, 0));
    }, { pad: 8 });
    A.define('b13:ou:spine', 124, 64, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const Tr = new Path2D(); Tr.roundRect(-58, -27, 116, 54, 18);
      ctx.fillStyle = '#07040c';
      ctx.fill(Tr);
      const g = ctx.createLinearGradient(0, -22, 0, 22);
      g.addColorStop(0, 'rgba(255,47,109,0)'); g.addColorStop(0.3, 'rgba(255,80,150,0.9)'); g.addColorStop(0.5, 'rgba(255,244,250,1)'); g.addColorStop(0.7, 'rgba(255,80,150,0.9)'); g.addColorStop(1, 'rgba(255,47,109,0)');
      clipped(ctx, Tr, () => { ctx.fillStyle = g; ctx.fillRect(-56, -22, 112, 44); });
      for (let i = -2; i <= 2; i++) {
        const Rb = new Path2D(); Rb.roundRect(i * 22 - 5, -29, 10, 58, 4);
        A.metal(ctx, Rb, { base: '#2a2c40', light: '#f2eeff', dark: '#050409', spec: 0.9, bounds: box(i * 22 - 5, -29, 10, 58), edge: 0.7, rimLight: 1.2 });
        ctx.fillStyle = 'rgba(255,200,230,0.9)';
        ctx.fill(circ(i * 22, 0, 2.4));
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke(Tr);
    }, { pad: 8 });
    A.define('b13:ou:sp_plate', 124, 30, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      const P = new Path2D(); P.roundRect(-60, -13, 120, 26, 8);
      A.metal(ctx, P, { base: '#25273a', light: '#e8e2ff', dark: '#040308', spec: 0.75, specPos: 0.3, bounds: box(-60, -13, 120, 26), edge: 1.1, rimLight: 1.6 });
      A.panelLines(ctx, lineP([[-50, 0], [50, 0]]), '#000', 0.5);
      dots(ctx, [[-50, -6], [50, -6], [-50, 6], [50, 6]], 1.4, '#8a86a8');
    }, { pad: 4 });

    // ---------------------------------------------------------------- cold violet accretion disk and photon ring
    A.define('b13:ou:disk', 256, 256, (ctx, w, h) => {
      const n = A.noise(128, 32, { scale: 16, octaves: 4, seed: 133, gain: 0.55 });
      const col = [0, 0, 0];
      const RAMP = [[0, 50, 26, 130], [0.35, 130, 80, 240], [0.7, 205, 165, 255], [1, 255, 246, 255]];
      ctx.drawImage(pixelCanvas(256, 256, (x, y, out) => {
        const rho = Math.hypot(x, y) / 128;
        if (rho > 1 || rho < 0.2) return;
        let u = Math.atan2(y, x) / TAU;
        if (u < 0) u += 1;
        const f = nsamp(n, 128, 32, (u + Math.log(rho) * 0.32) * 128, rho * 22);
        const prof = U.smoothstep(0.2, 0.33, rho) * (1 - U.smoothstep(0.7, 1, rho));
        const heat = U.clamp(1 - (rho - 0.22) / 0.7, 0, 1);
        const v = prof * (0.3 + 0.95 * f * f) * (0.45 + 0.55 * heat);
        if (v < 0.01) return;
        ramp(RAMP, heat, col);
        out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; out[3] = U.clamp(v, 0, 1) * 255;
      }), 0, 0, w, h);
    }, { pad: 0 });
    A.define('b13:ou:photon', 128, 128, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.shadowColor = '#c9a0ff';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(240,226,255,0.95)';
      ctx.lineWidth = 2.2;
      ctx.stroke(circ(0, 0, 56));
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.lineWidth = 0.8;
      ctx.stroke(circ(0, 0, 56));
    }, { pad: 8 });
  }
  defineOuroArt();

  /* @@BOSSES@@ */

  // ================================================================== sandboxes
  function gear(level, missiles) {
    for (const p of SL.world.players) {
      if (p.weapon) { p.weapon.type = p.weapon.type || 'pulse'; p.weapon.level = Math.max(p.weapon.level || 1, level); }
      p.missiles = Math.max(p.missiles || 0, missiles);
    }
  }
  function bossSandbox(id, o) {
    SL.debug.sandbox('boss:' + id, () => {
      if (o.bg && SL.backgrounds && SL.backgrounds.has(o.bg)) {
        SL.world.setBackground(o.bg);
        if (o.phase) SL.world.setPhase(o.phase);
      }
      gear(o.level || 4, o.missiles == null ? 2 : o.missiles);
      let wait = 0.6;
      return (dt) => {
        const b = SL.game.boss;
        if (b && !b.dead) { if (o.steer) o.steer(b, dt); return; }
        wait -= dt;
        if (wait <= 0) { SL.spawnBoss(id, { music: o.music }); wait = 5; }
      };
    }, { name: 'Boss ' + id, god: true, autopilot: true, scroll: o.scroll || 40 });
  }
  bossSandbox('mb_mantis', { bg: 'bg_tantalus', phase: 'boneyard', music: 'mus_miniboss', level: 4, scroll: 70 });
  SL.debug.sandbox('enemy:mantis_pass', () => {
    let t = 0.4, n = 0;
    return (dt) => {
      t -= dt;
      if (t > 0) return;
      t = 2.6;
      SL.spawnEnemy('mantis_pass', { path: n++ % 2 ? 'diag_rl' : 'diag_lr', fire: true });
    };
  }, { name: 'Flyby mantis_pass', god: true, autopilot: true });
  bossSandbox('mb_crucible', { bg: 'bg_tartarus', phase: 'foundry', music: 'mus_miniboss', level: 4, scroll: 30 });
  bossSandbox('boss_suneater', { bg: 'bg_tarsis', phase: 'boss', music: 'mus_boss_heavy', level: 5, missiles: 3, scroll: 40 });
})(window.SL = window.SL || {});
