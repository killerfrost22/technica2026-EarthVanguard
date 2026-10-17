/* 21_game.js (core)
   Provides: SL.game = { state, paused, pauseReason, session, diff, coop, boss, outro, director, perf, DIFFS,
   RANKS, newGame(), startMission(id, {coop, fromCheckpoint, difficulty, seed, def, sandbox}), retry(fromCheckpoint),
   quitMission(), toMenu(screenId, params), pause(reason), resume(reason), addScore(points, x, y),
   addCredits(n, x, y, p), bossDefeated(b), completeMission(), failMission(), setMenuScene({bg, player, scroll, x, y}),
   skipToBoss(), registerKill(e, by), onPlayerHit(p), checkFail(), rank(stats), step(dt) }, SL.update(realDt),
   the requestAnimationFrame main loop and the window.claude.hot handshake.
   Loop: rAF -> real dt clamped to 1/30 s -> SL.input.update() -> SL.debug.beforeUpdate (autopilot) ->
   SL.update(dt) -> SL.render.frame(). Game dt = real dt x slow-mo; nothing steps during hit-stop or pause.
   Director: timeline events sorted by `at` on a clock that holds while waiting (waitClear, until, boss, choice).
   Events: missionStart, missionOutro, missionComplete, missionFail, missionEnd, missionQuit, checkpoint, pause,
   resume, score, credits, bossDefeated, newGame, menu, tick. */
(function (SL) {
  'use strict';

  const U = SL.util;
  const W = SL.W;

  const DIFFS = {
    cadet: { bulletSpeed: 0.8, fireRate: 0.75, damage: 0.6, enemyHp: 0.85, lives: 5, credits: 1.0 },
    pilot: { bulletSpeed: 1.0, fireRate: 1.0, damage: 1.0, enemyHp: 1.0, lives: 3, credits: 1.0 },
    ace: { bulletSpeed: 1.15, fireRate: 1.25, damage: 1.4, enemyHp: 1.15, lives: 2, credits: 1.25 },
  };
  const RANKS = ['S', 'A', 'B', 'C', 'D'];
  const COOP_HP = 1.35;
  const CHAIN_TIME = 2.5, MULT_STEP = 0.1, MULT_MAX = 8;
  const OUTRO_TIME = 3;
  const FAIL_DELAY = 1.8;

  const reported = new Set();
  function report(key, err) {
    if (reported.has(key)) return;
    reported.add(key);
    console.error('[SL.game] ' + key + ' threw:', err);
  }
  function safe(key, fn) {
    try { return fn(); } catch (err) { report(key, err); return undefined; }
  }
  function defined(o) {
    const out = {};
    for (const k in o) if (o[k] !== undefined) out[k] = o[k];
    return out;
  }
  function has(mod, fn) {
    if (mod && typeof mod[fn] === 'function') return true;
    return false;
  }
  function isTouch() {
    if (SL.input && SL.input.lastDevice === 'touch') return true;
    try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  }

  // ------------------------------------------------------------------ director state
  const D = {
    events: [], index: 0, clock: 0, wait: null, waitT: 0, bossDone: false, done: true, idleT: 0,
  };

  const PERF_N = 600;
  const G = SL.game = {
    DIFFS,
    RANKS,
    state: 'boot',
    paused: false,
    pauseReason: null,
    session: null,
    diff: Object.assign({ name: 'pilot' }, DIFFS.pilot),
    coop: false,
    boss: null,
    outro: null,
    failT: 0,
    menuScene: null,
    director: D,
    /** Ring buffers of rAF timestamps and update/render ms (read by SL.debug.perf). */
    perf: { n: 0, i: 0, t: new Float64Array(PERF_N), upd: new Float32Array(PERF_N), ren: new Float32Array(PERF_N) },
  };

  function normalizeEvents(list) {
    const out = [];
    if (!Array.isArray(list)) {
      if (list != null) U.warnOnce('timeline-type', 'mission timeline must be an array (or a function returning one)');
      return out;
    }
    for (let i = 0; i < list.length; i++) {
      const ev = list[i];
      if (!ev || typeof ev !== 'object') continue;
      out.push(Object.assign({}, ev, { at: +ev.at || 0, _seq: i }));
    }
    out.sort((a, b) => a.at - b.at || a._seq - b._seq);
    return out;
  }

  function resetDirector(list) {
    D.events = normalizeEvents(list);
    D.index = 0;
    D.clock = 0;
    D.wait = null;
    D.waitT = 0;
    D.bossDone = false;
    D.done = false;
    D.idleT = 0;
  }

  /** repeat: {every, count} fires `count` times in total (forever without count). */
  function scheduleRepeat(ev) {
    const r = ev.repeat;
    if (!r || !(r.every > 0)) return;
    const left = (ev._left != null ? ev._left : r.count != null ? r.count : Infinity) - 1;
    if (left <= 0) return;
    const next = Object.assign({}, ev, { at: ev.at + r.every, _left: left, _rep: (ev._rep || 0) + 1 });
    let i = D.index;
    while (i < D.events.length && D.events[i].at <= next.at) i++;
    D.events.splice(i, 0, next);
  }

  function fieldBusy() {
    const list = SL.world.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.dead && !e.isBoss && !e.noClear) return true;
    }
    return false;
  }

  function setWait(w) {
    D.wait = w;
    D.waitT = 0;
  }

  function spawnFormation(ev) {
    const opts = defined(Object.assign({}, ev.opts, { enemy: ev.enemy, count: ev.count, x: ev.x, y: ev.y }));
    const f = SL.formations.get(ev.formation);
    if (typeof f === 'function') return safe('formation "' + ev.formation + '"', () => f(opts));
    if (f && typeof f.spawn === 'function') return safe('formation "' + ev.formation + '"', () => f.spawn(opts));
    // unknown formation (already warned by the registry): a plain line entering from the top
    const n = U.clamp(opts.count || 5, 1, 24), cx = opts.x != null ? opts.x : W / 2;
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(SL.spawnEnemy(opts.enemy, { x: cx + (i - (n - 1) / 2) * 70, y: (opts.y != null ? opts.y : -60) - i * 12, vy: 160 }));
    }
    return out;
  }

  const CP_STATS = ['kills', 'enemiesSpawned', 'rescued', 'podsSpawned', 'podsRescued', 'podsLost', 'hitsTaken', 'livesLost',
    'deaths', 'bombsUsed', 'time', 'bossesDefeated', 'bossTime', 'timeBonus', 'maxMult'];
  let lastCheckpoint = null;

  function jsonCopy(v, what) {
    try { return JSON.parse(JSON.stringify(v)); } catch (err) {
      U.warnOnce('cp-json:' + what, 'checkpoint: ' + what + ' is not JSON-safe (entity references?); it is not saved');
      return undefined;
    }
  }

  function takeCheckpoint(ev) {
    const s = G.session;
    const stats = {};
    for (const k of CP_STATS) if (s[k] !== undefined) stats[k] = s[k];
    const cp = {
      missionId: s.missionId, clock: D.clock, seq: ev._seq, rep: ev._rep || 0, at: ev.at, bossDone: D.bossDone,
      score: s.score, credits: s.credits, stats,
      players: SL.world.players.filter((p) => !p.display).map((p) => ({ weapon: { type: p.weapon.type, level: p.weapon.level }, bombs: p.bombs, missiles: p.missiles })),
      flags: Object.assign({}, s.flags),
      data: jsonCopy(s.data, 'session.data'),
    };
    s.checkpoint = cp;
    lastCheckpoint = cp;
    SL.bus.emit('checkpoint', { session: s, checkpoint: cp });
  }

  /** Applies the stateful events (scroll, bg phase, music) before index `upto`; returns the last music id. */
  function replayState(upto) {
    let music = null;
    for (let i = 0; i < upto && i < D.events.length; i++) {
      const ev = D.events[i];
      if (ev.scroll != null) SL.world.scroll.speed = SL.world.scroll.target = +ev.scroll || 0;
      if (ev.bg) SL.world.setPhase(ev.bg);
      if (ev.music) music = ev.music;
    }
    return music;
  }

  /** Resumes the fresh director at the checkpoint event itself, so it fires again on the next step with everything it
      carries (bg phase, scroll, music, banner, spawns), replays the stateful events before it, and re-schedules the
      pending repeats of earlier `repeat` events. Restores score, credits, stats, flags, session.data and weapons. */
  function restoreCheckpoint(cp) {
    const s = G.session;
    const at = +cp.at || 0, seq = cp.seq != null ? cp.seq : -1, rep = cp.rep || 0;
    let idx = D.events.length;
    for (let i = 0; i < D.events.length; i++) {
      const e = D.events[i];
      if (e.at > at || (e.at === at && !rep && e._seq >= seq)) { idx = i; break; }
    }
    const music = replayState(idx);
    // repeats of events before the checkpoint: put back the first occurrence that had not fired yet
    const eps = 1e-6;
    for (let i = 0; i < idx; i++) {
      const ev = D.events[i], r = ev.repeat;
      if (!r || !(r.every > 0)) continue;
      const count = r.count != null ? r.count : Infinity;
      const k = Math.max(1, Math.ceil((at - ev.at) / r.every - eps));
      if (k >= count) continue;
      const copy = Object.assign({}, ev, { at: ev.at + k * r.every, _left: count - k, _rep: k });
      let j = idx;
      while (j < D.events.length && D.events[j].at <= copy.at) j++;
      D.events.splice(j, 0, copy);
    }
    D.index = idx;
    D.clock = Math.max(0, +cp.clock || at);
    D.bossDone = !!cp.bossDone;
    s.score = cp.score || 0;
    s.credits = cp.credits || 0;
    Object.assign(s, cp.stats || {});
    s.flags = Object.assign({}, cp.flags || {});
    if (cp.data && typeof cp.data === 'object') s.data = jsonCopy(cp.data, 'checkpoint data') || {};
    SL.world.players.forEach((p, i) => {
      const c = cp.players && cp.players[i];
      if (!c) return;
      if (c.weapon) { p.weapon.type = c.weapon.type; p.weapon.level = c.weapon.level; }
      if (c.bombs != null) p.bombs = c.bombs;
      if (c.missiles != null) p.missiles = c.missiles;
    });
    s.checkpoint = cp;
    s.fromCheckpoint = true;
    return music;
  }

  function startChoice(ev) {
    const id = ev.choice, s = G.session;
    if (!has(SL.story, 'choice')) { U.warnOnce('nochoice', 'SL.story.choice is missing; skipping choice "' + id + '"'); return; }
    const w = { type: 'choice', id, done: false, timeout: ev.timeout || 0 };
    delete s.flags[id];
    setWait(w);
    let pr;
    try { pr = SL.story.choice(id); } catch (err) { report('story.choice', err); w.done = true; return; }
    Promise.resolve(pr).then((opt) => {
      if (G.session !== s) return;
      if (opt != null && s.flags[id] === undefined) s.flags[id] = opt;
      w.done = true;
    }, (err) => { report('story.choice promise', err); w.done = true; });
  }

  function startBoss(ev) {
    const b = SL.spawnBoss(ev.boss, defined(Object.assign({ x: ev.x, y: ev.y }, ev.opts)));
    setWait({ type: 'boss', b, timeout: ev.timeout || 0 });
  }

  function fire(ev) {
    const s = G.session;
    if (typeof ev.if === 'function') {
      let ok = false;
      try { ok = !!ev.if(s); } catch (err) { report('timeline if()', err); }
      if (!ok) { scheduleRepeat(ev); return; }
    }
    if (D.bossDone && !ev.afterBoss) return;
    scheduleRepeat(ev);
    if (ev.spawn) safe('spawn "' + ev.spawn + '"', () => SL.spawnEnemy(ev.spawn, defined(Object.assign({ x: ev.x, y: ev.y }, ev.opts))));
    if (ev.formation) spawnFormation(ev);
    if (ev.hazard) safe('hazard "' + ev.hazard + '"', () => SL.spawnHazard(ev.hazard, defined(Object.assign({ x: ev.x, y: ev.y }, ev.opts))));
    if (ev.radio != null) {
      if (has(SL.story, 'radio')) safe('story.radio', () => SL.story.radio(ev.radio, ev.opts));
      else U.warnOnce('noradio', 'SL.story.radio is missing');
    }
    if (ev.pod) {
      const o = ev.pod;
      if (has(SL.rescue, 'spawnPod')) safe('rescue.spawnPod', () => SL.rescue.spawnPod(o.x != null ? o.x : W / 2, o.y != null ? o.y : -40, o));
      else U.warnOnce('nopod', 'SL.rescue.spawnPod is missing');
    }
    if (ev.pickup) {
      if (has(SL.pickups, 'spawn')) safe('pickups.spawn', () => SL.pickups.spawn(ev.pickup, ev.x != null ? ev.x : W / 2, ev.y != null ? ev.y : -30, ev.opts));
      else SL.world.spawnPickup(ev.pickup, ev.x != null ? ev.x : W / 2, ev.y != null ? ev.y : -30, ev.opts);
    }
    if (ev.banner && has(SL.hud, 'banner')) safe('hud.banner', () => SL.hud.banner(ev.banner, defined({ sub: ev.sub, color: ev.color, duration: ev.duration })));
    if (ev.music && has(SL.audio, 'music')) safe('audio.music', () => SL.audio.music(ev.music, { fade: ev.fade != null ? ev.fade : 1 }));
    if (ev.scroll != null) SL.world.scroll.target = +ev.scroll || 0;
    if (ev.bg) SL.world.setPhase(ev.bg);
    if (ev.checkpoint) takeCheckpoint(ev);
    if (typeof ev.call === 'function') safe('timeline call()', () => ev.call(s));
    if (ev.waitClear) setWait({ type: 'clear', timeout: ev.timeout || 0 });
    if (typeof ev.until === 'function') setWait({ type: 'until', fn: ev.until, timeout: ev.timeout || 0 });
    if (ev.choice) startChoice(ev);
    if (ev.boss) startBoss(ev);
    if (ev.end) startOutro();
  }

  function checkWait(w, dt) {
    D.waitT += dt;
    if (w.timeout > 0 && D.waitT >= w.timeout) return true;
    switch (w.type) {
      case 'clear': return !fieldBusy();
      case 'until':
        try { return !!w.fn(G.session); } catch (err) { report('timeline until()', err); return true; }
      case 'boss':
        if (w.released) return true;
        if (w.b && w.b.dead && !w.b.defeated) {
          U.warnOnce('boss-removed:' + w.b.typeId, 'boss "' + w.b.typeId + '" was removed without SL.game.bossDefeated(b)');
          G.bossDefeated(w.b);
          return true;
        }
        return false;
      case 'choice': return w.done || G.session.flags[w.id] !== undefined;
      default: return true;
    }
  }

  function directorUpdate(dt) {
    if (D.done) return;
    if (D.wait) {
      if (!checkWait(D.wait, dt)) return;
      D.wait = null;
      D.waitT = 0;
      if (D.done) return;
    }
    D.clock += dt;
    let guard = 500;
    while (!D.done && !D.wait && D.index < D.events.length && D.events[D.index].at <= D.clock && guard-- > 0) {
      fire(D.events[D.index++]);
    }
    if (!D.done && !D.wait && D.index >= D.events.length && !G.session.sandbox) {
      // timeline exhausted without an explicit end: finish once the field is clear
      D.idleT += dt;
      if (!G.boss && (!fieldBusy() || D.idleT > 25)) startOutro();
    }
  }

  function startOutro() {
    const s = G.session;
    if (!s || G.outro || s.result || G.state !== 'mission' || s.sandbox) return;
    G.outro = { t: 0, dur: OUTRO_TIME };
    G.failT = 0;
    s.outro = true;
    D.done = true;
    D.wait = null;
    SL.world.clearEnemyBullets({ toCredits: true, beams: true });
    for (const p of SL.world.players) {
      if (p.display) continue;
      if (!p.alive && !p.out) {
        // down (pilot pod or respawn timer) when the mission is won: back in the jet for the fly-out, no life spent
        safe('outro respawn', () => SL.player.respawn(p));
        p.entering = 0;
        p.y = SL.H - 150;
      }
      if (!p.alive) continue;
      p.outro = true;
      p.invuln = Math.max(p.invuln, 99);
      p.firing = false;
    }
    if (has(SL.hud, 'banner')) safe('hud.banner', () => SL.hud.banner('MISSION COMPLETE', { sub: (s.mission && s.mission.name) || '', color: '#7fe3ff', duration: OUTRO_TIME - 0.2 }));
    if (has(SL.audio, 'sfx')) safe('audio.sfx', () => SL.audio.sfx('mission_complete'));
    SL.bus.emit('missionOutro', { session: s });
  }

  // ------------------------------------------------------------------ results
  function liveCount(list) {
    let n = 0;
    for (const x of list) if (!x.dead) n++;
    return n;
  }

  function evalObjectives(def, s) {
    const list = Array.isArray(def.objectives) ? def.objectives : [];
    return list.map((o, i) => {
      let done = false;
      if (o && typeof o.check === 'function') {
        try { done = !!o.check(s); } catch (err) { report('objective "' + (o.id || i) + '" check', err); }
      }
      return { id: (o && o.id) || 'objective' + i, text: (o && o.text) || '', done };
    });
  }

  function buildResult(success) {
    const s = G.session, def = s.mission || {};
    const prev = SL.save.mission(s.missionId);
    const killRate = s.enemiesSpawned > 0 ? U.clamp(s.kills / s.enemiesSpawned, 0, 1) : 1;
    const saved = s.podsRescued || Math.max(0, s.podsSpawned - s.podsLost - liveCount(SL.world.pods));
    const rescueRate = s.podsSpawned > 0 ? U.clamp(saved / s.podsSpawned, 0, 1) : 1;
    const stats = { success, killRate, rescueRate, hitsTaken: s.hitsTaken, livesLost: s.livesLost, coop: s.coop };
    return {
      missionId: s.missionId, name: def.name || s.missionId, kind: s.kind, success, coop: s.coop, sandbox: s.sandbox,
      difficulty: s.difficulty, score: s.score, credits: s.credits,
      creditsKept: success ? s.credits : Math.floor(s.credits * 0.5),
      rescued: s.rescued, podsSpawned: s.podsSpawned, podsRescued: saved, podsLost: s.podsLost,
      kills: s.kills, enemiesSpawned: s.enemiesSpawned, killRate, rescueRate,
      hitsTaken: s.hitsTaken, livesLost: s.livesLost, deaths: s.deaths, bombsUsed: s.bombsUsed,
      time: s.time, bossTime: s.bossTime, timeBonus: s.timeBonus, maxMult: s.maxMult,
      rank: success ? G.rank(stats) : '', flags: Object.assign({}, s.flags),
      fromCheckpoint: s.fromCheckpoint, firstClear: success && !prev.done, prevBest: prev.best || 0,
      newBest: success && s.score > (prev.best || 0), rewards: def.rewards || null,
      objectives: evalObjectives(def, s),
    };
  }

  function recordMission(r) {
    const save = SL.save.data;
    const rec = save.missions[r.missionId] || (save.missions[r.missionId] = { done: false, best: 0, rank: '', rescued: 0, plays: 0 });
    rec.plays = (rec.plays || 0) + 1;
    if (r.success) {
      rec.done = true;
      if (r.score > (rec.best || 0)) rec.best = r.score;
      if (!rec.rank || RANKS.indexOf(r.rank) < RANKS.indexOf(rec.rank)) rec.rank = r.rank;
      rec.rescued = Math.max(rec.rescued || 0, r.rescued);
    }
    const st = save.stats || (save.stats = {});
    st.kills = (st.kills || 0) + r.kills;
    st.deaths = (st.deaths || 0) + r.deaths;
    st.playSeconds = (st.playSeconds || 0) + Math.round(r.time);
    st.bombs = (st.bombs || 0) + r.bombsUsed;
  }

  function emitEnd(s, reason) {
    if (!s || s.endEmitted) return;
    s.endEmitted = true;
    SL.bus.emit('missionEnd', { session: s, reason });
  }

  function finish(success) {
    const s = G.session;
    const result = buildResult(success);
    s.result = result;
    if (success && lastCheckpoint && lastCheckpoint.missionId === s.missionId) lastCheckpoint = null;
    G.outro = null;
    G.failT = 0;
    // the director stops at once (a `call` event that completes the mission must not fire the events after it)
    D.done = true;
    D.wait = null;
    let summary = null;
    if (!s.sandbox) {
      recordMission(result);
      if (has(SL.progress, 'applyMissionResult')) {
        try { summary = SL.progress.applyMissionResult(result); } catch (err) { report('progress.applyMissionResult', err); }
      } else {
        SL.save.data.credits += result.creditsKept;
      }
    }
    if (!summary) summary = { credits: result.creditsKept, total: SL.save.data.credits, unlocked: [] };
    SL.save.commit();
    if (s.mission && typeof s.mission.onEnd === 'function') safe('mission onEnd', () => s.mission.onEnd(s, result));
    SL._clearTimers();
    G.state = 'results';
    G.paused = false;
    G.pauseReason = null;
    SL.time.paused = false;
    if (has(SL.hud, 'touchButtons')) safe('hud.touchButtons', () => SL.hud.touchButtons(false));
    SL.bus.emit(success ? 'missionComplete' : 'missionFail', { session: s, result, summary });
    emitEnd(s, success ? 'complete' : 'fail');
    const screen = success ? 'results' : 'failed';
    if (has(SL.ui, 'show') && SL.screens.has(screen)) safe('ui.show ' + screen, () => SL.ui.show(screen, { result, summary, checkpoint: !!s.checkpoint }));
    return result;
  }

  /** Tears down the current run (timers, effects, pause) without producing a result. */
  function endRun(reason) {
    const s = G.session;
    if (s && !s.result && s.mission && typeof s.mission.onEnd === 'function') safe('mission onEnd', () => s.mission.onEnd(s, null));
    emitEnd(s, reason);
    SL._clearTimers();
    SL.fx.clear();
    G.paused = false;
    G.pauseReason = null;
    SL.time.paused = false;
    G.outro = null;
    G.failT = 0;
    G.boss = null;
    D.wait = null;
    D.done = true;
  }

  function resolveSeed(v) {
    if (v == null) v = SL.debug && SL.debug.params ? SL.debug.params.seed : null;
    if (v == null || v === '') return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const n = Number(v);
    return isFinite(n) ? n >>> 0 : U.hash(v);
  }

  // ------------------------------------------------------------------ public API
  G.rank = function (r) {
    const pts = 35 * (r.killRate != null ? r.killRate : 1) + 25 * (r.rescueRate != null ? r.rescueRate : 1)
      + Math.max(0, 25 - 4 * (r.hitsTaken || 0)) + Math.max(0, 15 - 7.5 * (r.livesLost || 0));
    return pts >= 90 ? 'S' : pts >= 75 ? 'A' : pts >= 58 ? 'B' : pts >= 40 ? 'C' : 'D';
  };

  G.startMission = function (id, opts) {
    opts = opts || {};
    const def = opts.def || (typeof id === 'string' ? SL.missions.get(id) : null);
    if (!def) return null;
    const mid = typeof id === 'string' ? id : def.id || 'mission';
    const coop = opts.coop != null ? !!opts.coop : G.coop;
    // fromCheckpoint: a checkpoint object, or true for "the last checkpoint taken in this mission" (if any)
    let cp = opts.fromCheckpoint || null;
    if (cp === true) cp = lastCheckpoint;
    if (cp && (typeof cp !== 'object' || (cp.missionId != null && cp.missionId !== mid))) {
      if (opts.fromCheckpoint !== true) U.warnOnce('cp-mismatch', 'startMission: fromCheckpoint does not belong to "' + mid + '"; starting from the top');
      cp = null;
    }
    endRun('restart');
    G.coop = coop;
    SL.input.setCoop(coop);
    const seed = resolveSeed(opts.seed);
    SL.rng.seed(seed);
    const save = SL.save.data;
    const pd = SL.debug && SL.debug.params && SL.debug.params.difficulty;
    const dname = DIFFS[opts.difficulty] ? opts.difficulty : DIFFS[pd] ? pd : DIFFS[save.difficulty] ? save.difficulty : 'pilot';
    const diff = Object.assign({ name: dname }, DIFFS[dname]);
    if (coop) diff.enemyHp *= COOP_HP;
    G.diff = diff;

    SL.time.t = 0;
    SL.time.scale = 1;
    SL.world.reset();
    G.menuScene = null;
    const s = G.session = {
      missionId: mid, mission: def, kind: opts.sandbox ? 'sandbox' : def.kind || 'main', sandbox: !!opts.sandbox,
      coop, players: SL.world.players, lives: 0, livesMax: 0, score: 0, mult: 1, multT: 0, maxMult: 1, credits: 0,
      rescued: 0, podsSpawned: 0, podsRescued: 0, podsLost: 0, kills: 0, enemiesSpawned: 0, hitsTaken: 0,
      livesLost: 0, deaths: 0, bombsUsed: 0, time: 0, flags: {}, checkpoint: null, boss: null, bossSeen: false,
      bossTime: 0, timeBonus: 0, result: null, difficulty: dname, seed, fromCheckpoint: false, outro: false,
      endEmitted: false, data: {},
    };
    const n = coop ? 2 : 1;
    for (let i = 0; i < n; i++) SL.world.players.push(SL.player.create(i, SL.player.statsFor(i)));
    const st0 = SL.world.players[0].stats;
    s.lives = s.livesMax = Math.max(0, diff.lives + Math.round(+st0.bonusLives || 0));
    SL.world.setBackground(def.bg || 'default', def.bgOpts || {});
    const sc = def.scroll != null ? +def.scroll : 90;
    SL.world.scroll.speed = SL.world.scroll.target = sc;

    let tl = def.timeline;
    if (tl == null && !opts.sandbox) U.warnOnce('timeline-missing:' + mid, 'mission "' + mid + '" has no timeline; it completes as soon as the field is clear');
    if (cp) {
      // a timeline function that branches on earlier choices must see them when it is rebuilt for a retry
      s.flags = Object.assign({}, cp.flags || {});
      if (cp.data && typeof cp.data === 'object') s.data = jsonCopy(cp.data, 'checkpoint data') || {};
    }
    if (typeof tl === 'function') {
      try { tl = tl(diff, s); } catch (err) { report('mission "' + mid + '" timeline()', err); tl = []; }
    }
    resetDirector(tl);
    G.state = 'mission';
    let music = def.music || null;
    if (cp) music = restoreCheckpoint(cp) || music;
    if (music && has(SL.audio, 'music')) safe('audio.music', () => SL.audio.music(music, { fade: 1 }));
    if (typeof def.onStart === 'function') safe('mission "' + mid + '" onStart', () => def.onStart(s));
    if (has(SL.ui, 'hide')) safe('ui.hide', () => SL.ui.hide());
    if (has(SL.hud, 'touchButtons')) safe('hud.touchButtons', () => SL.hud.touchButtons(isTouch()));
    SL.bus.emit('missionStart', { session: s, mission: def, id: mid });
    return s;
  };

  G.retry = function (fromCheckpoint) {
    const s = G.session;
    if (!s) return null;
    if (s.sandboxId && SL.debug && SL.debug.runSandbox) return SL.debug.runSandbox(s.sandboxId, { coop: s.coop });
    const cp = fromCheckpoint ? s.checkpoint : null;
    // a registered mission is looked up again (picks up a redefinition); one started from a def object reuses it
    const def = SL.missions.has(s.missionId) && !s.sandbox ? undefined : s.mission;
    return G.startMission(s.missionId, { coop: s.coop, fromCheckpoint: cp, difficulty: s.difficulty, def, sandbox: s.sandbox });
  };

  /** Ends any run and returns to the menu: attract scene plus a screen (default starmap, else title). */
  G.toMenu = function (screenId, params) {
    endRun('quit');
    G.session = null;
    G.state = 'menu';
    G.setMenuScene(menuOpts);
    if (has(SL.hud, 'touchButtons')) safe('hud.touchButtons', () => SL.hud.touchButtons(false));
    const id = screenId || (SL.screens.has('starmap') ? 'starmap' : 'title');
    if (has(SL.ui, 'show') && SL.screens.has(id)) safe('ui.show ' + id, () => SL.ui.show(id, params));
    SL.bus.emit('menu', { screen: id });
  };

  G.quitMission = function () {
    const s = G.session;
    if (s && !s.result) SL.bus.emit('missionQuit', { session: s });
    G.toMenu();
  };

  G.newGame = function () {
    SL.save.reset();
    SL.bus.emit('newGame', { data: SL.save.data });
    return SL.save.data;
  };

  G.pause = function (reason) {
    reason = reason || 'pause';
    if (G.state !== 'mission' || !G.session) return false;
    if (G.paused) {
      if (reason === 'choice') G.pauseReason = 'choice';
      return true;
    }
    G.paused = true;
    G.pauseReason = reason;
    SL.time.paused = true;
    if (reason !== 'choice' && has(SL.ui, 'show') && SL.screens.has('pause')) safe('ui.show pause', () => SL.ui.show('pause', { reason }));
    SL.bus.emit('pause', { reason });
    return true;
  };

  /** Resumes; with a reason, only a pause of that reason is lifted (story uses resume('choice')). Any screen still up
      over the mission (the pause screen, or a settings screen opened from it) is hidden. */
  G.resume = function (reason) {
    if (!G.paused) return false;
    if (reason && reason !== G.pauseReason) return false;
    const was = G.pauseReason;
    G.paused = false;
    G.pauseReason = null;
    SL.time.paused = false;
    if (G.state === 'mission' && SL.ui && SL.ui.current && has(SL.ui, 'hide')) safe('ui.hide', () => SL.ui.hide());
    SL.bus.emit('resume', { reason: was });
    return true;
  };

  G.addScore = function (points, x, y) {
    const s = G.session;
    if (!s || !(points > 0)) return 0;
    const n = Math.round(points);
    s.score += n;
    if (x != null && y != null) SL.fx.text(x, y, '+' + U.fmtInt(n), { color: '#ffe9a0', size: n >= 5000 ? 34 : 24 });
    SL.bus.emit('score', { n, total: s.score, x, y });
    return n;
  };

  /** Adds credits x difficulty credit multiplier (x the collecting player's creditMul when given). */
  G.addCredits = function (n, x, y, p) {
    const s = G.session;
    if (!s || !(n > 0)) return 0;
    const mul = (G.diff.credits || 1) * ((p && p.stats && p.stats.creditMul) || 1);
    const v = Math.max(1, Math.round(n * mul));
    s.credits += v;
    if (x != null && y != null) SL.fx.text(x, y, '+' + U.fmtInt(v), { color: SL.pal.credit, size: 20, life: 0.7, rise: 40 });
    SL.bus.emit('credits', { n: v, total: s.credits, x, y, p: p || null });
    return v;
  };

  G.registerKill = function (e, by) {
    const s = G.session;
    if (!s || G.state !== 'mission' || !e) return;
    if (!e.noCount) s.kills++;
    if (by && by.kind === 'player') by.kills = (by.kills || 0) + 1;
    const pts = (e.score || 0) * s.mult;
    s.mult = Math.min(MULT_MAX, Math.round((s.mult + MULT_STEP) * 10) / 10);
    s.multT = CHAIN_TIME;
    if (s.mult > s.maxMult) s.maxMult = s.mult;
    if (pts > 0) G.addScore(pts, e.isBoss || e.score >= 300 ? e.x : null, e.y);
  };

  G.onPlayerHit = function () {
    const s = G.session;
    if (!s) return;
    s.hitsTaken++;
    s.mult = 1;
    s.multT = 0;
  };

  /** Called when a player is out of lives: the mission fails (after a beat) once every player is out. */
  G.checkFail = function () {
    const s = G.session;
    if (!s || G.state !== 'mission' || s.result || G.outro || s.sandbox) return;
    const anyLeft = SL.world.players.some((p) => !p.out);
    if (!anyLeft && !(G.failT > 0)) G.failT = FAIL_DELAY;
  };

  G.bossDefeated = function (b) {
    if (!b || b.defeated) return;
    b.defeated = true;
    b.dying = false;
    b.dead = true;
    if (G.boss === b) G.boss = null;
    const s = G.session;
    if (!s) return;
    if (s.boss === b) s.boss = null;
    const def = b.def || {};
    const par = def.parTime || 90;
    const fight = b.fightT || 0;
    const bonus = Math.round((Math.max(0, par - fight) * (def.timeBonusRate || 250)) / 10) * 10;
    s.bossTime = fight;
    s.timeBonus += bonus;
    s.bossesDefeated = (s.bossesDefeated || 0) + 1;
    if (bonus > 0) G.addScore(bonus, b.x, b.y + 60);
    SL.world.clearEnemyBullets({ toCredits: true, beams: true });
    SL.bus.emit('bossDefeated', { b, id: b.typeId, timeBonus: bonus, session: s });
    // A boss event releases its hold; after the last boss event only afterBoss events run, then the outro.
    const w = D.wait;
    if (w && w.type === 'boss' && (!w.b || w.b === b || w.b.dead)) {
      w.released = true;
      let laterBoss = false, more = false;
      for (let i = D.index; i < D.events.length; i++) {
        if (D.events[i].boss) laterBoss = true;
        if (D.events[i].afterBoss) more = true;
      }
      if (!laterBoss) {
        D.bossDone = true;
        if (!more) startOutro();
      }
    }
  };

  G.completeMission = function () {
    const s = G.session;
    if (!s || s.result || G.state !== 'mission') return null;
    return finish(true);
  };

  G.failMission = function () {
    const s = G.session;
    if (!s || s.result || G.state !== 'mission') return null;
    return finish(false);
  };

  /** Jumps the director to the first boss event (?boss=1). */
  G.skipToBoss = function () {
    if (G.state !== 'mission' || !G.session) return false;
    const i = D.events.findIndex((e) => e.boss);
    if (i < 0) return false;
    const music = replayState(i);
    if (music && has(SL.audio, 'music')) safe('audio.music', () => SL.audio.music(music, { fade: 0.5 }));
    D.index = i;
    D.clock = D.events[i].at;
    D.wait = null;
    return true;
  };

  /** Attract-mode backdrop behind menus: a background plus an idle display jet ({player:false} for none). The options
      are remembered and reused by toMenu(). During a mission the scene is only remembered (the live world is kept). */
  let menuOpts = {};
  G.setMenuScene = function (o) {
    o = o || {};
    menuOpts = o;
    if (G.state === 'mission') {
      U.warnOnce('menuscene-mission', 'setMenuScene during a mission: remembered for the next menu, world left alone');
      return G.menuScene;
    }
    SL.world.reset();
    SL.fx.clear();
    SL.world.setBackground(o.bg || 'default', o.bgOpts || {});
    const sc = o.scroll != null ? +o.scroll : 70;
    SL.world.scroll.speed = SL.world.scroll.target = sc;
    const m = G.menuScene = { t: 0, x: o.x != null ? o.x : W / 2, y: o.y != null ? o.y : menuY(), player: null };
    if (o.player !== false) {
      const po = o.player && typeof o.player === 'object' ? o.player : {};
      const p = SL.player.create(po.index === 1 ? 1 : 0, SL.player.defaultStats());
      p.display = true;
      p.x = m.x;
      p.y = m.y;
      if (po.weapon) Object.assign(p.weapon, po.weapon);
      SL.world.players.push(p);
      m.player = p;
    }
    return m;
  };

  // Landscape puts the idle jet on the left of the screen (logical y near the bottom), clear of the title column.
  function menuY() { return SL.render && SL.render.land ? SL.H * 0.76 : SL.H * 0.5; }

  function menuStep(dt) {
    const m = G.menuScene;
    if (!m || !m.player) return;
    m.t += dt;
    const p = m.player;
    const px = p.x, py = p.y;
    p.x = m.x + Math.sin(m.t * 0.55) * 22;
    p.y = m.y + Math.sin(m.t * 1.2) * 10;
    p.vx = (p.x - px) / dt;
    p.vy = (p.y - py) / dt;
    p.bank = U.clamp(Math.cos(m.t * 0.55) * 0.16, -0.35, 0.35);
  }

  const tickEvt = { dt: 0 };
  G.step = function (dt) {
    SL.time.t += dt;
    if (G.state === 'mission' && G.session) {
      const s = G.session;
      s.time += dt;
      directorUpdate(dt);
      SL._updateTimers(dt);
      if (s.mission && typeof s.mission.onUpdate === 'function') {
        try { s.mission.onUpdate(s, dt); } catch (err) { report('mission onUpdate', err); }
      }
      if (s.sandboxUpdate) {
        try { s.sandboxUpdate(dt, s); } catch (err) { report('sandbox update', err); s.sandboxUpdate = null; }
      }
      SL.world.update(dt);
      if (s.multT > 0) {
        s.multT -= dt;
        if (s.multT <= 0) { s.multT = 0; s.mult = 1; }
      }
      if (G.outro) {
        G.outro.t += dt;
        if (G.outro.t >= G.outro.dur) G.completeMission();
      } else if (G.failT > 0) {
        G.failT -= dt;
        if (G.failT <= 0) G.failMission();
      }
    } else {
      SL._updateTimers(dt);
      menuStep(dt);
      SL.world.update(dt);
    }
    SL.fx.update(dt);
    tickEvt.dt = dt;
    SL.bus.emit('tick', tickEvt);
  };

  // Escape / P / Start toggle the pause during missions; the edge is consumed so screens never see it too.
  function handlePause() {
    if (G.state !== 'mission' || !G.session) return;
    const I = SL.input, P = I.players;
    if (!(P[0].pause || P[1].pause || I.menu.pause)) return;
    if (!G.paused) {
      if (G.outro || G.session.result) return;
      G.pause('pause');
    } else if (SL.ui && SL.ui.current && SL.ui.current !== 'pause') {
      // a sub-screen opened from the pause menu (settings, controls) keeps Escape for its own back navigation
      return;
    } else if (G.pauseReason === 'pause' || G.pauseReason === 'blur') {
      G.resume();
    } else return;
    P[0].pause = P[1].pause = false;
    I.menu.pause = false;
    I.menu.back = false;
  }

  SL.update = function (realDt) {
    const T = SL.time;
    T.real += realDt;
    handlePause();
    if (SL.ui && typeof SL.ui.update === 'function') {
      try { SL.ui.update(realDt); } catch (err) { report('ui.update', err); }
    }
    const hold = SL.debug && SL.debug.hold && !SL.debug.simulating;
    if (G.paused || hold) { T.paused = G.paused; return; }
    T.paused = false;
    if (SL.story && typeof SL.story.update === 'function') {
      try { SL.story.update(realDt); } catch (err) { report('story.update', err); }
    }
    const stopped = SL.fx.hitstopLeft() > 0;
    SL.render.beginUpdate(stopped);
    try {
      SL.fx.realUpdate(realDt);
      T.scale = SL.fx.timeScale() * ((SL.debug && SL.debug.timeScale) || 1);
      if (!stopped) G.step(realDt * T.scale);
    } finally {
      SL.render.endUpdate();
    }
  };

  // ------------------------------------------------------------------ main loop
  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    let realDt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    if (!(realDt > 0)) realDt = 1 / 60;
    if (realDt > 1 / 30) realDt = 1 / 30;
    const t0 = performance.now();
    try { SL.input.update(); } catch (err) { report('input.update', err); }
    if (SL.debug && typeof SL.debug.beforeUpdate === 'function') {
      try { SL.debug.beforeUpdate(realDt); } catch (err) { report('debug.beforeUpdate', err); }
    }
    try { SL.update(realDt); } catch (err) { report('update', err); }
    const t1 = performance.now();
    try { SL.render.frame(); } catch (err) { report('render.frame', err); }
    const t2 = performance.now();
    const pf = G.perf;
    pf.t[pf.i] = now;
    pf.upd[pf.i] = t1 - t0;
    pf.ren[pf.i] = t2 - t1;
    pf.i = (pf.i + 1) % PERF_N;
    if (pf.n < PERF_N) pf.n++;
  }

  // window.claude.hot is optional (not part of the current artifact runtime contract): when a host provides
  // it, the save is handed over across hot reloads; 00_core.js already waits for hot.ready at boot.
  function registerHot() {
    let hot = null;
    try { hot = window.claude && window.claude.hot; } catch (e) { hot = null; }
    if (!hot || typeof hot !== 'object') return;
    const snap = () => ({ save: SL.save.data, settings: SL.save.settings });
    try {
      if (typeof hot.dispose === 'function') hot.dispose((data) => { if (data && typeof data === 'object') Object.assign(data, snap()); });
      else if (hot.snapshot == null) hot.snapshot = snap;
    } catch (e) { /* the host refused; nothing to hand over */ }
  }

  SL.onBoot(() => {
    registerHot();
    SL.bus.on('orient', () => { if (G.menuScene && menuOpts.y == null) G.menuScene.y = menuY(); });
    G.state = 'menu';
    G.setMenuScene({});
    if (has(SL.ui, 'show') && SL.screens.has('title')) safe('ui.show title', () => SL.ui.show('title'));
    requestAnimationFrame(loop);
  });
})(window.SL = window.SL || {});
