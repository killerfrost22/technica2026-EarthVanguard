/* 22_debug.js (core)
   Provides: SL.debug = { params, god, autopilotMode, overlay, hold, simulating, timeScale, noBlurPause,
   state(), sim(seconds), autopilot(p, dt) -> input partial, beforeUpdate(realDt), sandbox(id, fn, opts),
   runSandbox(id, {coop}), sandboxIds(), perf(seconds), drawOverlay(ctx), sampleResult(success),
   screenParams(id), runTests() -> Promise<report> }.
   URL params handled here at boot: mission, save, coop, autopilot (1 = P1, 2 = both), god, t, boss, screen,
   sandbox, debug, mute, difficulty, test=smoke, noblur, hold (start frozen: only sim() advances, deterministic). (quality and nogl are read by 04_render, seed and
   difficulty by 21_game.) The in-page suite writes window.__TEST__ and a console summary.
   Core sandboxes: 'empty', 'stress' (600 enemy bullets, 40 enemies, 1500 particles, 150 player shots,
   autopilot), 'fx' (explosion showcase), 'lens' (lens and ripples straight through the post pipeline).
   Generic fallbacks when content registered none: 'boss:<id>', 'hazard:<id>', 'bg:<id>', 'enemy:<id>'. */
(function (SL) {
  'use strict';

  const U = SL.util;
  const W = SL.W, H = SL.H, TAU = U.TAU;
  const DBG = SL.debug;
  const P = DBG.params || (DBG.params = {});
  const on = (v) => v === '1' || v === 'true' || v === 'yes';

  DBG.god = on(P.god);
  DBG.autopilotMode = P.autopilot === '2' ? 2 : on(P.autopilot) ? 1 : 0;
  DBG.overlay = on(P.debug);
  DBG.hold = false;
  DBG.simulating = false;
  DBG.timeScale = 1;
  DBG.noBlurPause = DBG.autopilotMode > 0 || !!P.test || on(P.noblur);
  /** During sim(), render one frame every N steps so draw code is exercised too (0 = never). */
  DBG.simRenderEvery = 30;

  if (on(P.mute) && SL.audio) SL.audio.muted = true;

  const reported = new Set();
  function report(key, err) {
    if (reported.has(key)) return;
    reported.add(key);
    console.error('[SL.debug] ' + key + ' threw:', err);
  }
  function live(list) {
    let n = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].dead) n++;
    return n;
  }

  // ------------------------------------------------------------------ state + sim
  DBG.state = function () {
    const g = SL.game, s = g.session, w = SL.world, b = g.boss, d = g.director;
    return {
      state: g.state, screen: (SL.ui && SL.ui.current) || null, missionId: s ? s.missionId : null,
      clock: Math.round(d.clock * 100) / 100, t: Math.round(SL.time.t * 100) / 100,
      fps: Math.round(SL.render.fps * 10) / 10, frameMs: Math.round(SL.render.frameMs * 100) / 100,
      players: w.players.filter((p) => !p.display).map((p) => ({
        x: Math.round(p.x), y: Math.round(p.y), hull: Math.round(p.hull), shield: Math.round(p.shield),
        lives: s ? s.lives : 0, weapon: p.weapon.type, level: p.weapon.level, alive: p.alive, bombs: p.bombs,
      })),
      enemies: live(w.enemies), ebullets: live(w.ebullets), pbullets: live(w.pbullets), particles: SL.fx.count(),
      pods: live(w.pods), hazards: live(w.hazards), pickups: live(w.pickups),
      boss: b && !b.defeated ? { id: b.typeId, hp: Math.round(b.hp), maxHp: b.maxHp, phase: b.phase, phaseName: b.phaseName, dying: !!b.dying } : null,
      score: s ? s.score : 0, credits: s ? s.credits : 0, rescued: s ? s.rescued : 0, kills: s ? s.kills : 0,
      paused: g.paused, pauseReason: g.pauseReason, bossSeen: !!(s && s.bossSeen),
      event: d.index + '/' + d.events.length, wait: d.wait ? d.wait.type : null, outro: !!g.outro,
      result: s && s.result ? { success: s.result.success, rank: s.result.rank, score: s.result.score, credits: s.result.creditsKept } : null,
      quality: SL.render.quality, gl: SL.render.hasGL, distortion: SL.render.distortion,
    };
  };

  DBG.sim = function (seconds) {
    const steps = Math.max(0, Math.round((+seconds || 0) * 60));
    const dt = 1 / 60;
    DBG.simulating = true;
    try {
      for (let i = 0; i < steps; i++) {
        try {
          SL.input.update();
          DBG.beforeUpdate(dt);
          SL.update(dt);
          if (DBG.simRenderEvery && i % DBG.simRenderEvery === DBG.simRenderEvery - 1) SL.render.frame();
        } catch (err) { report('sim step', err); }
      }
    } finally {
      DBG.simulating = false;
    }
    return DBG.state();
  };

  // ------------------------------------------------------------------ autopilot
  const apState = [{ bombT: 0, skillT: 0 }, { bombT: 0, skillT: 0 }];
  const apOut = { mx: 0, my: 0, fire: true, focus: false, bomb: false, skill: false };

  /** Returns an input partial for player p: dodge, seek, grab, bomb and skill. */
  DBG.autopilot = function (p, dt) {
    const out = apOut;
    out.mx = 0; out.my = 0; out.fire = true; out.focus = false; out.bomb = false; out.skill = false;
    if (!p || !p.alive || p.display || p.outro) return out;
    const st = apState[p.index] || apState[0];
    st.bombT -= dt;
    st.skillT -= dt;
    const world = SL.world, coop = world.players.length > 1;
    const side = coop ? (p.index ? 1 : -1) : 0;

    // where to be: under the boss, else under the most useful enemy ahead; while the boss is invulnerable (intro,
    // transition, a shield phase) its destructible parts and escorts come first
    let tx = W / 2 + side * 90, ty = H * 0.8;
    const boss = SL.game.boss;
    const bossUp = boss && !boss.dead && !boss.dying && world.onScreen(boss, -10);
    let target = null;
    if (bossUp && !boss.invuln) target = boss;
    else {
      let best = Infinity;
      for (const e of world.enemies) {
        if (e.dead || e.dying || e.untargetable || e.invuln || e.isBoss || e.y > p.y - 80 || !world.onScreen(e, -10)) continue;
        const sc = Math.abs(e.x - p.x) + (p.y - e.y) * 0.25;
        if (sc < best) { best = sc; target = e; }
      }
      if (!target && bossUp) target = boss;
    }
    if (target) tx = target.x + side * 36;

    // pickups and pods (a downed partner's pilot pod first)
    let grab = null, gd = 320 * 320;
    for (const pod of world.pods) {
      if (pod.dead || (pod.data && pod.data.owner === p)) continue;
      const d2 = U.dist2(p.x, p.y, pod.x, pod.y) * (pod.data && pod.data.pilot ? 0.15 : 1);
      if (d2 < gd && pod.y > H * 0.2) { gd = d2; grab = pod; }
    }
    for (const pk of world.pickups) {
      if (pk.dead) continue;
      const d2 = U.dist2(p.x, p.y, pk.x, pk.y);
      if (d2 < gd && pk.y > H * 0.4) { gd = d2; grab = pk; }
    }
    if (grab) { tx = grab.x; ty = U.clamp(grab.y + 10, H * 0.6, H - 50); }

    // dodge bullets within ~140 px, weighted by how they approach
    let ax = 0, ay = 0, threat = 0, close = 0;
    const hr = p.hitR || 7;
    const eb = world.ebullets;
    for (let i = 0; i < eb.length; i++) {
      const b = eb[i];
      if (b.dead || b.delay > 0) continue;
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx > 150 || dx < -150 || dy > 150 || dy < -150) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 > 140 * 140) continue;
      const vx = b.vx || 0, vy = b.vy || 0, v2 = vx * vx + vy * vy;
      let tc = v2 > 1 ? -(dx * vx + dy * vy) / v2 : 0;
      const approaching = tc > 0;
      tc = U.clamp(tc, 0, 0.45);
      const cx = dx + vx * tc, cy = dy + vy * tc;
      const cd = Math.sqrt(cx * cx + cy * cy);
      const safeR = (b.r || 6) + hr + 18;
      if (cd > safeR * 2.4) continue;
      const w = (approaching ? 1 : 0.3) * (1 - tc / 0.6) * ((safeR * 2.4 - cd) / (safeR * 2.4));
      if (cd < 2) {
        const v = Math.sqrt(v2) + 1;
        ax += (-vy / v) * w; ay += (vx / v) * w;
      } else {
        ax -= (cx / cd) * w; ay -= (cy / cd) * w;
      }
      threat += w;
      if (d2 < 100 * 100) close++;
    }
    for (const bm of world.ebeams) {
      if (bm.dead || bm.state === 'fade') continue;
      const ex = Math.cos(bm.angle), ey = Math.sin(bm.angle);
      const px = p.x - bm.x, py = p.y - bm.y;
      if (px * ex + py * ey < 0) continue;
      const perp = px * -ey + py * ex;
      const half = (bm.width || 30) * 0.5 + hr + 34;
      if (Math.abs(perp) < half * 2) {
        const sgn = perp >= 0 ? 1 : -1;
        ax += -ey * sgn * 1.5; ay += ex * sgn * 1.5;
        threat += 1;
      }
    }
    for (const h of world.hazards) {
      if (h.dead || (h.def && h.def.avoid === false)) continue;
      const rr = (h.r || 40) * 3 + 60;
      const dx = p.x - h.x, dy = p.y - h.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < rr && d > 1) { const k = (rr - d) / rr; ax += (dx / d) * k * 1.4; ay += (dy / d) * k * 1.4; threat += k; }
    }

    let mx = U.clamp((tx - p.x) / 90, -1, 1) * 0.85;
    let my = U.clamp((ty - p.y) / 140, -1, 1) * 0.7;
    if (threat > 0) {
      const k = Math.min(1, threat);
      mx = mx * (1 - k * 0.7) + ax * 2.6;
      my = my * (1 - k * 0.7) + ay * 2.6;
    }
    if (p.y < H * 0.6) my += 0.8;
    if (p.x < 40) mx += 0.6; else if (p.x > W - 40) mx -= 0.6;
    if (p.y > H - 36) my -= 0.6;
    const len = Math.sqrt(mx * mx + my * my);
    if (len > 1) { mx /= len; my /= len; }
    out.mx = mx;
    out.my = my;
    out.focus = threat > 1.2 && close > 2;
    if (p.bombs > 0 && st.bombT <= 0 && p.hull < p.maxHull * 0.25 && close >= 2) { out.bomb = true; st.bombT = 3; }
    const sk = p.skill;
    if (sk && sk.id && !sk.active && !(sk.cooldown > 0) && st.skillT <= 0 && (target || threat > 1)) { out.skill = true; st.skillT = 2; }
    return out;
  };

  let choiceT = 0, choiceAsked = false;
  DBG.beforeUpdate = function (dt) {
    const g = SL.game;
    if (!DBG.autopilotMode) return;
    if (g.state === 'mission' && !g.paused) {
      for (const p of SL.world.players) {
        if (p.display) continue;
        if (p.index === 0 || DBG.autopilotMode === 2) SL.input.inject(p.index, DBG.autopilot(p, dt));
      }
    }
    // autopilot also answers story choices so unattended runs keep going: SL.story.autoChoose() after 0.8 s; only if
    // the game is still paused 2.5 s later (no autoChoose, or it never closed the dialog) is the director's choice
    // wait released with the placeholder answer 'auto'
    if (g.paused && g.pauseReason === 'choice') {
      choiceT += dt;
      const hasAuto = SL.story && typeof SL.story.autoChoose === 'function';
      if (!choiceAsked && choiceT > 0.8 && hasAuto) {
        choiceAsked = true;
        try { SL.story.autoChoose(); } catch (err) { report('story.autoChoose', err); }
      }
      if (choiceT > (hasAuto ? 3.3 : 0.8) && g.paused && g.pauseReason === 'choice') {
        choiceT = 0;
        choiceAsked = false;
        const w = g.director.wait, s = g.session;
        if (w && w.type === 'choice') {
          if (s && s.flags[w.id] === undefined) s.flags[w.id] = 'auto';
          w.done = true;
        }
        U.warnOnce('autochoose', 'autopilot: the story choice did not resolve; released it with the answer "auto"');
        g.resume('choice');
      }
    } else { choiceT = 0; choiceAsked = false; }
  };

  // ------------------------------------------------------------------ sandboxes
  function genericSandbox(id) {
    const m = /^(boss|hazard|bg|enemy):(.+)$/.exec(id);
    if (!m) return null;
    const kind = m[1], ref = m[2];
    if (kind === 'boss' && SL.bosses.has(ref)) {
      return {
        name: 'Boss ' + ref,
        run() {
          let wait = 0.5;
          return (dt) => {
            if (SL.game.boss) return;
            wait -= dt;
            if (wait <= 0) { SL.spawnBoss(ref); wait = 3; }
          };
        },
      };
    }
    if (kind === 'hazard' && SL.hazards.has(ref)) {
      return {
        name: 'Hazard ' + ref,
        run() {
          let wait = 0.3;
          return (dt) => {
            if (SL.world.hazards.some((h) => !h.dead)) return;
            wait -= dt;
            if (wait <= 0) { SL.spawnHazard(ref, { x: W / 2, y: H * 0.36 }); wait = 2; }
          };
        },
      };
    }
    if (kind === 'bg' && SL.backgrounds.has(ref)) return { name: 'Background ' + ref, bg: ref, run() {} };
    if (kind === 'enemy' && SL.enemies.has(ref)) {
      return { name: 'Enemy ' + ref, run() { SL.every(1.6, () => SL.spawnEnemy(ref, { x: 120 + SL.rng.next() * 480, y: -60 })); } };
    }
    return null;
  }

  DBG.sandboxIds = function () { return SL.sandboxes.ids(); };

  DBG.runSandbox = function (id, opts) {
    const sb = SL.sandboxes.has(id) ? SL.sandboxes.get(id) : genericSandbox(id);
    if (!sb) { U.warnOnce('sandbox:' + id, 'unknown sandbox "' + id + '"'); return null; }
    const run = typeof sb === 'function' ? sb : sb.run;
    const def = {
      id: 'sandbox:' + id, name: sb.name || 'Sandbox ' + id, kind: 'sandbox', bg: sb.bg || 'default',
      scroll: sb.scroll, music: sb.music || null, timeline: [],
    };
    const coop = opts && opts.coop != null ? !!opts.coop : on(P.coop);
    const s = SL.game.startMission(def.id, { def, coop, sandbox: true });
    if (!s) return null;
    s.sandboxId = id;
    // god / autopilot switched on by a sandbox (its options or its run function) end with the sandbox session
    const keep = { god: DBG.god, auto: DBG.autopilotMode };
    const off = SL.bus.on('missionEnd', (e) => {
      if (!e || e.session !== s) return;
      off();
      DBG.god = keep.god;
      DBG.autopilotMode = keep.auto;
    });
    if (sb.god) DBG.god = true;
    if (sb.autopilot && !DBG.autopilotMode) DBG.autopilotMode = 1;
    if (typeof run === 'function') {
      try {
        const upd = run(s, SL.world);
        if (typeof upd === 'function') s.sandboxUpdate = upd;
      } catch (err) { report('sandbox "' + id + '"', err); }
    }
    SL.bus.emit('sandboxStart', { id, session: s });
    return s;
  };

  DBG.sandbox('empty', () => {}, { name: 'Empty field' });

  // Stress: the performance budget from ARCHITECTURE 1.5, held steady.
  const STRESS_ENEMY = {
    id: 'stress_drone', name: 'Stress drone', hp: 1e9, r: 24, score: 0, credits: null, noCount: true, noClear: true,
    offscreenKill: false, contactDamage: 0, sprite: 'core:placeholder_enemy',
    update(e, dt) {
      const pr = e.params;
      e.vx = 0;
      e.vy = 0;
      const k = Math.min(1, dt * 2.2);
      e.x = U.lerp(e.x, pr.hx + Math.sin(e.age * 0.9 + pr.ph) * 22, k);
      e.y = U.lerp(e.y, pr.hy + Math.cos(e.age * 0.7 + pr.ph) * 12, k);
    },
    draw(e, ctx) {
      SL.art.flame(ctx, e.x - 7, e.y - 20, 8, 22, '#ffffff', SL.pal.enemy.engine, SL.time.t + e.params.ph);
      SL.art.flame(ctx, e.x + 7, e.y - 20, 8, 22, '#ffffff', SL.pal.enemy.engine, SL.time.t + e.params.ph + 0.4);
      SL.world.drawDefault(e, ctx);
    },
  };

  DBG.sandbox('stress', (s) => {
    DBG.god = true;
    if (!DBG.autopilotMode) DBG.autopilotMode = 1;
    for (const p of SL.world.players) { p.weapon.type = 'pulse'; p.weapon.level = 5; }
    const foes = [];
    for (let i = 0; i < 40; i++) {
      const col = i % 8, row = Math.floor(i / 8);
      foes.push(SL.spawnEnemy(STRESS_ENEMY, { x: 60 + col * 86, y: -60 - row * 40, params: { hx: 60 + col * 86, hy: 80 + row * 72, ph: i * 0.77 } }));
    }
    const colors = ['#ff4fd8', '#ff8a3d', '#b26bff', '#ff3b4f'];
    const types = ['orb', 'orb', 'needle', 'orbBig', 'shard'];
    let boomT = 0.5, n = 0;
    return (dt) => {
      const w = SL.world;
      let need = Math.min(80, 600 - w.ebullets.length);
      while (need-- > 0) {
        const e = foes[(n++ * 7) % foes.length];
        const a = Math.PI * (0.12 + 0.76 * SL.rng.next());
        const ty = types[n % types.length];
        SL.fireEnemy(e.x, e.y + 16, a, 95 + 90 * SL.rng.next(), ty, { color: colors[n % colors.length] });
      }
      const p = w.players[0];
      if (p && p.alive) {
        let extra = Math.min(12, 150 - w.pbullets.length);
        while (extra-- > 0) SL.firePlayer(p, p.x + (SL.rng.next() - 0.5) * 60, p.y - 30, -Math.PI / 2 + (SL.rng.next() - 0.5) * 0.5, 1300, 'pulse', 1);
      }
      let parts = Math.min(60, 1500 - SL.fx.count());
      while (parts-- > 0) {
        const e = foes[(n++ * 3) % foes.length];
        const spark = parts % 3 === 0;
        SL.fx.emit({
          x: e.x + (SL.rng.next() - 0.5) * 30, y: e.y - 18, vx: (SL.rng.next() - 0.5) * 80, vy: -40 - SL.rng.next() * 90,
          life: 0.9 + SL.rng.next() * 0.6, size: spark ? 6 : 14, size2: 2, color: spark ? '#ffd27a' : '#ff7a3d',
          color2: '#5a1f3a', shape: spark ? 'spark' : 'glow', stretch: spark ? 0.05 : 0, drag: 0.6,
        });
      }
      boomT -= dt;
      if (boomT <= 0) {
        boomT = 0.6;
        const sizes = ['s', 'm', 'm', 'l'];
        SL.fx.explode(80 + SL.rng.next() * 560, 120 + SL.rng.next() * 420, { size: sizes[n % 4], sound: false });
      }
    };
  }, { name: 'Stress test', god: true, autopilot: true });

  DBG.sandbox('fx', () => {
    const sizes = ['s', 'm', 'l', 'xl', 'boss'];
    const pals = ['enemy', 'violet', 'blue', 'green', 'gold', 'player'];
    let t = 0.2, i = 0;
    return (dt) => {
      t -= dt;
      if (t > 0) return;
      const sz = sizes[i % sizes.length];
      t = sz === 'boss' ? 2.4 : 1.1;
      SL.fx.explode(140 + SL.rng.next() * 440, 260 + SL.rng.next() * 380, { size: sz, palette: pals[i % pals.length] });
      i++;
    };
  }, { name: 'Explosion showcase', god: true });

  // A lens and ripples driven straight through SL.render (independent of hazard content).
  DBG.sandbox('lens', () => {
    let rt = 0;
    return (dt) => {
      SL.render.addLens(W * 0.5, H * 0.36, 58, 1);
      rt -= dt;
      if (rt <= 0) { rt = 1.4; SL.fx.shockwave(W * 0.5, H * 0.62, { radius: 300, duration: 0.9, strength: 1.2 }); }
    };
  }, { name: 'Lens and ripple', god: true });

  // ------------------------------------------------------------------ perf + overlay
  DBG.perf = function (seconds) {
    const pf = SL.game.perf, N = pf.t.length;
    if (pf.n < 3) return null;
    const lastI = (pf.i - 1 + N) % N;
    const tEnd = pf.t[lastI], tStart = tEnd - (seconds || 2) * 1000;
    const deltas = [];
    let frames = 0, first = tEnd, prev = -1, upd = 0, ren = 0, updMax = 0, renMax = 0;
    for (let k = 0; k < pf.n; k++) {
      const i = (lastI - k + N) % N, t = pf.t[i];
      if (t < tStart) break;
      if (prev >= 0) deltas.push(prev - t);
      prev = t;
      first = t;
      frames++;
      upd += pf.upd[i];
      ren += pf.ren[i];
      if (pf.upd[i] > updMax) updMax = pf.upd[i];
      if (pf.ren[i] > renMax) renMax = pf.ren[i];
    }
    const span = tEnd - first;
    deltas.sort((a, b) => a - b);
    const pct = (q) => (deltas.length ? deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * q))] : 0);
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      fps: r2(span > 0 ? ((frames - 1) * 1000) / span : 0), frameMs: r2(span / Math.max(1, frames - 1)),
      p95Ms: r2(pct(0.95)), worstMs: r2(deltas.length ? deltas[deltas.length - 1] : 0),
      updateMs: r2(upd / frames), renderMs: r2(ren / frames), updateMaxMs: r2(updMax), renderMaxMs: r2(renMax),
      frames, seconds: r2(span / 1000), quality: SL.render.quality, gl: SL.render.hasGL, glInfo: SL.render.glInfo,
      counts: SL.world.counts(),
    };
  };

  const ov = { t: 0, lines: [] };
  DBG.drawOverlay = function (ctx) {
    if (!DBG.overlay) return;
    const now = performance.now();
    if (now - ov.t > 250) {
      ov.t = now;
      const pf = DBG.perf(1) || { fps: 0, frameMs: 0, updateMs: 0, renderMs: 0, p95Ms: 0 };
      const c = SL.world.counts(), d = SL.game.director;
      ov.lines = [
        'FPS ' + pf.fps.toFixed(1) + '   frame ' + pf.frameMs.toFixed(1) + ' ms   p95 ' + pf.p95Ms.toFixed(1),
        'update ' + pf.updateMs.toFixed(2) + ' ms   render ' + pf.renderMs.toFixed(2) + ' ms',
        'quality ' + SL.render.quality + (SL.render.auto ? ' (auto)' : '') + '   ' + (SL.render.distortion ? 'GL post' : '2D output'),
        'enemies ' + c.enemies + '  ebullets ' + c.ebullets + '  pbullets ' + c.pbullets,
        'particles ' + c.particles + '  pickups ' + c.pickups + '  pods ' + c.pods + '  hazards ' + c.hazards,
        SL.game.session ? 'clock ' + d.clock.toFixed(1) + '  event ' + d.index + '/' + d.events.length + (d.wait ? '  wait ' + d.wait.type : '') : 'state ' + SL.game.state,
      ];
    }
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(2,4,10,0.72)';
    ctx.fillRect(12, 196, 452, 22 * ov.lines.length + 14);
    ctx.font = '600 17px ui-monospace, Consolas, "Courier New", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (let i = 0; i < ov.lines.length; i++) {
      ctx.fillStyle = i === 0 ? '#9fe8ff' : '#c9d4e8';
      ctx.fillText(ov.lines[i], 22, 204 + i * 22);
    }
    ctx.restore();
  };

  // ------------------------------------------------------------------ sample data for screens
  DBG.sampleResult = function (success) {
    const ok = success !== false;
    return {
      missionId: 'm1', name: 'First Light', kind: 'main', success: ok, coop: false, sandbox: false, difficulty: 'pilot',
      score: ok ? 184250 : 61200, credits: 940, creditsKept: ok ? 940 : 470, rescued: 9, podsSpawned: 4, podsRescued: 3,
      podsLost: 1, kills: 212, enemiesSpawned: 236, killRate: 0.9, rescueRate: 0.75, hitsTaken: 3, livesLost: ok ? 0 : 4,
      deaths: ok ? 0 : 4, bombsUsed: 2, time: 412.5, bossTime: ok ? 71.2 : 0, timeBonus: ok ? 4700 : 0, maxMult: 5.6,
      rank: ok ? 'A' : '', flags: {}, fromCheckpoint: false, firstClear: ok, prevBest: 0, newBest: ok, rewards: null,
    };
  };

  DBG.screenParams = function (id) {
    // a screen may provide its own sample data: SL.screens.define(id, {..., sample: params | () => params})
    const def = SL.screens.has(id) ? SL.screens.get(id) : null;
    if (def && def.sample != null) {
      try {
        const v = typeof def.sample === 'function' ? def.sample() : def.sample;
        if (v && typeof v === 'object') return v;
      } catch (err) { report('screen "' + id + '" sample', err); }
    }
    if (id === 'results') return { result: DBG.sampleResult(true), summary: { credits: 940, bonus: 500, total: 3340, sp: 1, unlocked: ['m2'] } };
    if (id === 'failed') return { result: DBG.sampleResult(false), summary: { credits: 470, total: 2870, unlocked: [] }, checkpoint: true };
    if (id === 'pause') return { reason: 'pause' };
    if (id === 'briefing') return { missionId: P.mission || 'm1' };
    return {};
  };

  // ------------------------------------------------------------------ in-page test suite (?test=smoke)
  DBG.runTests = function () {
    const results = [];
    const t0 = performance.now();
    const keepGod = DBG.god, keepAuto = DBG.autopilotMode;
    SL.save.memoryOnly = true;
    DBG.god = true;
    DBG.autopilotMode = 1;
    const frame = () => SL.render.frame();
    function test(name, fn) {
      const s0 = performance.now();
      let ok = true, note = '';
      try {
        const r = fn();
        if (r === false) ok = false;
        else if (typeof r === 'string') note = r;
      } catch (err) {
        ok = false;
        note = String((err && err.message) || err);
        console.error('[TEST] ' + name + ' threw:', err);
      }
      if (!ok && !note) note = 'returned false';
      if (!ok) console.error('[TEST] FAIL ' + name + (note ? ': ' + note : ''));
      results.push({ name, ok, ms: Math.round(performance.now() - s0), note });
    }
    const clearField = () => {
      for (const e of SL.world.enemies) if (!e.isBoss) e.dead = true;
      SL.world.clearEnemyBullets({});
      DBG.sim(0.05);
    };

    test('util', () => {
      const u = SL.util;
      return u.fmtInt(1234567) === '1,234,567' && u.fmtTime(65) === '1:05' && Math.abs(u.angleDiff(3, -3) - (TAU - 6)) < 1e-9 &&
        u.clamp(5, 0, 2) === 2 && u.deepMerge({ a: { b: 1 } }, { a: { c: 2 } }).a.b === 1;
    });
    test('rng determinism', () => {
      const a = SL.makeRng(7), b = SL.makeRng(7);
      for (let i = 0; i < 50; i++) if (a.next() !== b.next()) return false;
      return true;
    });
    test('save export/import', () => {
      const code = SL.save.exportCode();
      return SL.save.importCode(code) === true && SL.save.importCode('nonsense') === false;
    });
    test('render post', () => {
      SL.render.addLens(360, 400, 50, 1);
      SL.render.addRipple(360, 700, 200, 10, 40);
      SL.render.chromatic(0.5);
      SL.render.flash('#ffffff', 0.2);
      frame();
    });

    DBG.runSandbox('empty', { coop: false });

    // ---- core regressions (audit 2026-10): each test leaves the field clear
    const still = (e) => { e.vx = 0; e.vy = 0; };
    const step = (dt, n) => {
      DBG.simulating = true;
      try { for (let i = 0; i < n; i++) { SL.input.update(); SL.update(dt); } } finally { DBG.simulating = false; }
    };
    // the player parked in a corner, not firing, with no shots of its own left in flight
    const quiet = (fn) => {
      const p = SL.world.players[0], c = p.control, x = p.x, y = p.y;
      p.control = false; p.x = 40; p.y = 1240;
      for (const b of SL.world.pbullets) b.dead = true;
      DBG.sim(1 / 60);
      try { return fn(p); } finally { p.control = c; p.x = x; p.y = y; }
    };
    const fail = (msg) => { throw new Error(msg); };
    test('core: boss shield survives a phase transition', () => {
      const b = SL.spawnBoss({ id: 'core_test_shield', name: 'T', hp: 1000, r: 50, intro: () => true,
        phases: [{ at: 1, name: 'a' }, { at: 0.5, name: 'b', enter(bb) { bb.invuln = true; } }] }, { x: 360, y: 300, noCount: true });
      DBG.sim(0.1);
      SL.damageEnemy(b, b.maxHp * 0.6, {});
      DBG.sim(1.6);
      const kept = b.invuln === true && b.phase === 1;
      b.invuln = false;
      const lifted = b.invuln === false;
      b.dead = true; SL.game.boss = null;
      DBG.sim(0.05);
      return kept && lifted ? true : fail('shield kept ' + kept + ', lifted ' + lifted);
    });
    test('core: pierce hits every enemy once', () => quiet((p) => {
      const col = [];
      for (let i = 0; i < 20; i++) col.push(SL.spawnEnemy({ id: 'core_test_col', hp: 1e6, r: 14, noCount: true, update: still }, { x: 360, y: 100 + i * 20 }));
      SL.firePlayer(p, 360, 560, -Math.PI / 2, 300, 'pulse', 10, { pierce: true });
      DBG.sim(2);
      const bad = col.filter((e) => Math.round(e.maxHp - e.hp) !== 10).length;
      clearField();
      return bad === 0 ? true : fail(bad + ' enemies not hit exactly once');
    }));
    test('core: swept bolts do not tunnel at 30 fps', () => quiet((p) => {
      const e = SL.spawnEnemy({ id: 'core_test_tun', hp: 1e6, r: 18, noCount: true, update: still }, { x: 380, y: 300 });
      for (let k = 0; k < 20; k++) SL.firePlayer(p, 360, 1000 + k * 7.3, -Math.PI / 2, 1500, 'pulse', 1, {});
      step(1 / 30, 36);
      const hits = Math.round(e.maxHp - e.hp);
      clearField();
      return hits === 20 ? true : fail(hits + '/20 hits');
    }));
    test('core: pooled bullets drop content fields', () => {
      const a = SL.fireEnemy(100, 100, Math.PI / 2, 50, 'orb', {});
      a.grazed = true;
      a.dead = true;
      DBG.sim(0.05);
      const b = SL.fireEnemy(100, 100, Math.PI / 2, 0, 'orb', {});
      const ok = b.grazed === undefined && b.speed === 0;
      b.dead = true;
      DBG.sim(0.05);
      return ok;
    });
    test('core: enemy onExit and NaN guards', () => quiet((p) => {
      let exits = 0;
      SL.spawnEnemy({ id: 'core_test_exit', hp: 10, r: 16, noCount: true, init(e) { e.vy = 900; }, onExit() { exits++; } }, { x: 600, y: 100 });
      DBG.sim(2);
      const n = SL.spawnEnemy({ id: 'core_test_nan', hp: 10, r: 16, noCount: true, update(e) { e.x = NaN; } }, { x: 360, y: 200 });
      SL.player.push(p, NaN, 1, 1 / 60);
      DBG.sim(0.1);
      clearField();
      return exits === 1 && n.dead && isFinite(p.x) ? true : fail('exits ' + exits + ', nan removed ' + n.dead);
    }));
    test('core: a timer may clear the timers', () => {
      SL.after(0.01, () => SL._clearTimers());
      SL.after(0.02, () => {});
      SL.after(0.03, () => {});
      DBG.sim(0.1);
      return SL._timerCount() === 0;
    });
    test('core: world reset ends hazards', () => {
      let ended = 0;
      SL.hazards.define('core_test_hz', { r: 30, update() {}, onEnd() { ended++; } });
      SL.spawnHazard('core_test_hz', { x: 360, y: 300 });
      DBG.sim(0.05);
      DBG.runSandbox('empty', { coop: false });
      delete SL.hazards.defs.core_test_hz;
      return ended === 1;
    });

    const enemyIds = SL.enemies.ids();
    for (const id of enemyIds) {
      test('enemy ' + id, () => {
        const e = SL.spawnEnemy(id, { x: 360, y: 320 });
        DBG.sim(0.6);
        frame();
        if (!e.dead) { e.invuln = false; SL.damageEnemy(e, e.hp * 10 + 1e5, {}); }
        DBG.sim(0.3);
        frame();
        if (!e.dead) { SL.world.kill(e); return 'did not die from damage (armor 0?)'; }
        clearField();
        return true;
      });
    }
    for (const id of SL.formations.ids()) {
      test('formation ' + id, () => {
        const f = SL.formations.get(id);
        const list = typeof f === 'function' ? f({ enemy: enemyIds[0], count: 5, x: 360 }) : f.spawn({ enemy: enemyIds[0], count: 5, x: 360 });
        DBG.sim(1);
        frame();
        clearField();
        return Array.isArray(list) ? true : 'formation did not return an array';
      });
    }
    for (const id of SL.ebulletTypes.ids()) {
      test('ebullet ' + id, () => {
        if (id === 'beam') SL.fireEnemyBeam({ x: 200, y: 100 }, { angle: Math.PI / 2, telegraph: 0.2, duration: 0.4 });
        else SL.fireEnemy(360, 200, Math.PI / 2, 220, id, {});
        DBG.sim(0.4);
        frame();
        clearField();
      });
    }
    for (const id of SL.pbulletTypes.ids()) {
      test('pbullet ' + id, () => {
        const p = SL.world.players[0];
        SL.firePlayer(p, 360, 900, -Math.PI / 2, 900, id, 5, {});
        DBG.sim(0.2);
        frame();
      });
    }
    for (const id of SL.pickupTypes.ids()) {
      test('pickup ' + id, () => {
        const p = SL.world.players[0];
        if (SL.pickups && SL.pickups.spawn) SL.pickups.spawn(id, p.x, p.y - 40, {});
        else SL.world.spawnPickup(id, p.x, p.y - 40, {});
        frame();
        DBG.sim(0.6);
        frame();
      });
    }
    for (const id of SL.hazards.ids()) {
      test('hazard ' + id, () => {
        const h = SL.spawnHazard(id, { x: 360, y: 420 });
        DBG.sim(2.5);
        frame();
        h.dead = true;
        DBG.sim(0.1);
        clearField();
      });
    }
    for (const id of SL.backgrounds.ids()) {
      test('background ' + id, () => {
        SL.world.setBackground(id);
        DBG.sim(1);
        frame();
        SL.world.setPhase('boss');
        DBG.sim(0.5);
        frame();
      });
    }
    SL.world.setBackground('default');
    for (const id of SL.bosses.ids()) {
      test('boss ' + id, () => {
        const b = SL.spawnBoss(id);
        DBG.sim(8);
        frame();
        if (!b.introDone) return 'intro did not finish within 8 s';
        let guard = 0;
        while (!b.dying && !b.defeated && guard++ < 40) {
          if (!b.invuln) SL.damageEnemy(b, b.maxHp * 0.12, {});
          DBG.sim(0.8);
          frame();
        }
        DBG.sim(9);
        frame();
        clearField();
        return b.defeated ? true : 'never reached SL.game.bossDefeated';
      });
    }
    test('missions', () => {
      for (const id of SL.missions.ids()) {
        const m = SL.missions.get(id);
        const tl = typeof m.timeline === 'function' ? m.timeline(SL.game.diff, SL.game.session) : m.timeline;
        if (!Array.isArray(tl)) throw new Error('mission ' + id + ' timeline is not an array');
      }
    });
    test('story radio', () => {
      if (!SL.story || !SL.story.radio) return 'no SL.story';
      const ids = Object.keys(SL.story.lines || {});
      SL.story.radio(ids.length ? ids[0] : { who: 'anvil', text: 'Radio check.' });
      DBG.sim(1);
      frame();
    });
    test('core: checkpoint retry re-fires the checkpoint event', () => {
      const def = {
        id: 'core_test_cp', name: 'CP', kind: 'main',
        timeline: [
          { at: 0.1, repeat: { every: 0.4, count: 6 }, call: (s) => { s.data.reps = (s.data.reps || 0) + 1; } },
          { at: 0.5, checkpoint: true, bg: 'danger', scroll: 33 },
          { at: 60, end: true },
        ],
      };
      SL.game.startMission('core_test_cp', { def, coop: false });
      DBG.sim(1.0);
      SL.game.retry(true);
      DBG.sim(2.5);
      const s = SL.game.session, w = SL.world;
      const ok = w.bg.phase === 'danger' && w.scroll.target === 33 && s.data.reps === 6 && s.fromCheckpoint;
      const note = 'phase ' + w.bg.phase + ', scroll ' + w.scroll.target + ', repeats ' + s.data.reps;
      DBG.runSandbox('empty', { coop: false });
      return ok ? true : fail(note);
    });
    test('screens', () => {
      for (const id of SL.screens.ids()) {
        SL.ui.show(id, DBG.screenParams(id));
        frame();
      }
      SL.ui.hide();
    });
    SL.game.toMenu('title');
    DBG.god = keepGod;
    DBG.autopilotMode = keepAuto;
    const passed = results.filter((r) => r.ok).length;
    const rep = { done: true, passed, failed: results.length - passed, total: results.length, ms: Math.round(performance.now() - t0), results };
    window.__TEST__ = rep;
    console.log('[TEST] smoke: ' + passed + '/' + results.length + ' passed in ' + rep.ms + ' ms');
    return Promise.resolve(rep);
  };

  // ------------------------------------------------------------------ boot: apply URL params
  SL.onBoot(() => {
    if (on(P.hold)) DBG.hold = true;
    if (P.save && SL.save.useSample) SL.save.useSample(P.save);
    if (on(P.coop)) SL.game.coop = true;
    if (P.test === 'smoke') {
      setTimeout(() => { DBG.runTests().catch((err) => report('runTests', err)); }, 150);
      return;
    }
    if (P.sandbox) DBG.runSandbox(P.sandbox);
    else if (P.mission) {
      const s = SL.game.startMission(P.mission, { coop: on(P.coop) });
      if (s && on(P.boss)) SL.game.skipToBoss();
      if (s && +P.t > 0) DBG.sim(+P.t);
    }
    if (P.screen && SL.ui && SL.ui.show) SL.ui.show(P.screen, DBG.screenParams(P.screen));
  });
})(window.SL = window.SL || {});
