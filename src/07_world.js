/* 07_world.js (core)
   Provides: SL.world = { players, enemies (bosses too), pbullets, ebullets, beams, ebeams, pickups, pods, hazards,
   allies, props, bg, scroll {speed, target, y}, bounds, dt, reset(), update(dt), draw(ctx), setBackground(id, opts),
   setPhase(name), clearEnemyBullets({toCredits, beams}), nearestEnemy(x, y, {maxDist, onscreen}), nearestPlayer(x, y),
   enemiesInRadius(x, y, r), playersInRadius(x, y, r), onScreen(e, margin), applyGravity(x, y, strength, radius, opts),
   spawnEntity(list, def, opts), spawnPickup(id, x, y, opts), drawDefault(e, ctx), hitTest(e, x, y, r), counts() },
   SL.spawnEnemy, SL.spawnBoss, SL.spawnHazard, SL.spawnProp, SL.spawnAlly, SL.fireEnemy, SL.firePlayer,
   SL.fireEnemyBeam, SL.damageEnemy, SL.damagePlayer, and the default bullet types (ebullet orb, orbBig, needle,
   shard, mine, beam; pbullet pulse).
   Update order: bg -> hazards -> players -> allies -> enemies -> bullets -> beams -> pickups -> pods -> props ->
   collisions -> cleanup. Draw order: bg, hazards under, props/pods/pickups, enemies, bosses, allies/players,
   player shots (additive), particles, enemy shots, hazards over. A content hook that throws is reported once
   and the entity is removed (bosses keep running with the failing hook disabled). */
(function (SL) {
  'use strict';

  const U = SL.util, C = SL.color;
  const W = SL.W, H = SL.H, TAU = U.TAU;
  const CAPS = { enemies: 300, ebullets: 1500, pbullets: 500, pickups: 300, pods: 40, hazards: 12, props: 160, allies: 16, ebeams: 24 };
  const DAMAGE = { s: 8, m: 12, l: 18 };
  const reported = new Set();

  function report(key, err) {
    if (reported.has(key)) return;
    reported.add(key);
    console.error('[SL.world] ' + key + ' threw:', err);
  }
  function diff() {
    return (SL.game && SL.game.diff) || { bulletSpeed: 1, fireRate: 1, damage: 1, enemyHp: 1, lives: 3, credits: 1 };
  }
  function session() { return SL.game && SL.game.session; }

  const world = SL.world = {
    players: [], enemies: [], pbullets: [], ebullets: [], beams: [], ebeams: [],
    pickups: [], pods: [], hazards: [], allies: [], props: [],
    bg: null,
    scroll: { speed: 90, target: 90, y: 0 },
    bounds: { x: 0, y: 0, w: W, h: H },
    dt: 1 / 60,
    t: 0,
    CAPS,
  };

  // ------------------------------------------------------------------ entities
  function makeEntity(kind, def, o) {
    o = o || {};
    return {
      id: U.uid(), kind, def, x: o.x != null ? o.x : W / 2, y: o.y != null ? o.y : -60,
      vx: o.vx || 0, vy: o.vy || 0, r: o.r || (def && def.r) || 24, rot: o.rot || 0,
      scale: o.scale || (def && def.scale) || 1, alpha: 1, hp: 1, maxHp: 1, age: 0, dead: false, flash: 0,
      team: 'enemy', data: {}, entered: false,
    };
  }
  // Returned when a list is full or an id is unknown: a complete, already dead entity (never added to a list), so
  // content may read or write any usual field on it (data, params, typeId, def ...) without a type error.
  const deadDummy = (kind) => ({
    id: 0, kind, def: {}, typeId: '', x: -9999, y: -9999, vx: 0, vy: 0, r: 0, rot: 0, scale: 1, alpha: 0, hp: 0, maxHp: 1,
    age: 0, dead: true, flash: 0, team: kind, data: {}, params: {}, entered: false, circles: null,
  });

  world.spawnEntity = function (list, def, o) {
    const arr = world[list];
    if (!Array.isArray(arr)) { U.warnOnce('spawnEntity:' + list, 'SL.world.spawnEntity: unknown list "' + list + '"'); return deadDummy(list); }
    if (CAPS[list] && arr.length >= CAPS[list]) { U.warnOnce('cap:' + list, 'world list "' + list + '" is full (' + CAPS[list] + ')'); return deadDummy(list); }
    if (!def || typeof def !== 'object') def = {};
    o = o || {};
    const kind = { pods: 'pod', props: 'prop', allies: 'ally', pickups: 'pickup', hazards: 'hazard', enemies: 'enemy' }[list] || list;
    const e = makeEntity(kind, def, o);
    e.team = kind === 'ally' ? 'ally' : kind;
    if (def.hp || o.hp) e.hp = e.maxHp = o.hp || def.hp;
    arr.push(e);
    if (def.init) {
      try { def.init(e, o); } catch (err) { report(kind + ' init', err); e.dead = true; }
    }
    return e;
  };

  // ------------------------------------------------------------------ default art
  function defineCoreArt() {
    const A = SL.art;
    const orb = (color, R) => (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, w / 2);
      halo.addColorStop(0, C.rgba(color, 0.55));
      halo.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(cx - R * 0.15, cy - R * 0.2, 0, cx, cy, R);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.42, '#ffffff');
      g.addColorStop(0.6, C.mix(color, '#ffffff', 0.45));
      g.addColorStop(0.84, color);
      g.addColorStop(1, C.darken(color, 0.3));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.rgba(C.darken(color, 0.55), 0.85);
      ctx.lineWidth = Math.max(1, R * 0.14);
      ctx.stroke();
    };
    world.ebSprite = function (typeId, color) {
      const key = 'eb:' + typeId + ':' + color;
      if (A.has(key)) return A.get(key);
      if (typeId === 'orb') A.define(key, 30, 30, orb(color, 7.5), { pad: 1 });
      else if (typeId === 'orbBig') A.define(key, 54, 54, orb(color, 13.5), { pad: 1 });
      else if (typeId === 'needle') {
        A.define(key, 30, 12, (ctx, w, h) => {
          const cy = h / 2;
          const g = ctx.createLinearGradient(0, 0, w, 0);
          g.addColorStop(0, C.rgba(color, 0));
          g.addColorStop(0.35, C.rgba(color, 0.9));
          g.addColorStop(1, C.rgba(C.mix(color, '#ffffff', 0.3), 1));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(w * 0.55, cy, w * 0.45, h * 0.42, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(w * 0.62, cy, w * 0.3, h * 0.17, 0, 0, TAU);
          ctx.fill();
        }, { pad: 1 });
      } else if (typeId === 'shard') {
        A.define(key, 26, 16, (ctx, w, h) => {
          const cy = h / 2;
          const p = A.poly([0, cy, w * 0.42, 0, w, cy, w * 0.42, h]);
          ctx.shadowColor = color;
          ctx.shadowBlur = 4;
          ctx.fillStyle = color;
          ctx.fill(p);
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.fill(A.poly([w * 0.22, cy, w * 0.45, h * 0.25, w * 0.86, cy, w * 0.45, h * 0.75]));
          ctx.strokeStyle = C.rgba(C.darken(color, 0.5), 0.9);
          ctx.lineWidth = 1;
          ctx.stroke(p);
        }, { pad: 2 });
      } else if (typeId === 'mine') {
        A.define(key, 38, 38, (ctx, w, h) => {
          const cx = w / 2, cy = h / 2;
          ctx.fillStyle = C.rgba(color, 0.9);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a - 0.22) * 9, cy + Math.sin(a - 0.22) * 9);
            ctx.lineTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
            ctx.lineTo(cx + Math.cos(a + 0.22) * 9, cy + Math.sin(a + 0.22) * 9);
            ctx.fill();
          }
          orb(color, 10)(ctx, w, h);
        }, { pad: 1 });
      } else A.define(key, 30, 30, orb(color, 7.5), { pad: 1 });
      return A.get(key);
    };

    // fallback player bolt (pointing +x): soft halo, tapered cyan body, white-hot core
    A.define('core:pulse', 54, 18, (ctx, w, h) => {
      const cy = h / 2, color = '#3fc8ff';
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(w * 0.58, cy);
      ctx.scale(w * 0.46, h * 0.5);
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      halo.addColorStop(0, C.rgba(color, 0.5));
      halo.addColorStop(0.45, C.rgba(color, 0.2));
      halo.addColorStop(1, C.rgba(color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
      const body = ctx.createLinearGradient(0, 0, w, 0);
      body.addColorStop(0, C.rgba(color, 0));
      body.addColorStop(0.35, C.rgba(color, 0.75));
      body.addColorStop(1, C.rgba(C.mix(color, '#ffffff', 0.6), 1));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(w * 0.55, cy, w * 0.45, h * 0.26, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(w * 0.62, cy, w * 0.33, h * 0.085, 0, 0, TAU);
      ctx.fill();
    }, { pad: 1, res: 2 });

    A.define('core:placeholder_enemy', 48, 48, (ctx, w, h) => {
      const p = A.symPath(w / 2, [[0, 46], [12, 30], [22, 10], [10, 4], [0, 12]]);
      A.metal(ctx, p, { base: SL.pal.enemy.hull2, spec: 0.4 });
      A.emissive(ctx, A.poly([w / 2 - 3, 18, w / 2 + 3, 18, w / 2, 32]), SL.pal.enemy.seam, 6);
    }, { pad: 4 });

    A.define('core:placeholder_boss', 260, 160, (ctx, w, h) => {
      const p = A.symPath(w / 2, [[0, 156], [40, 140], [128, 70], [118, 22], [60, 4], [0, 20]]);
      A.metal(ctx, p, { base: SL.pal.enemy.hull2, spec: 0.45 });
      A.panelLines(ctx, A.poly([w / 2 - 60, 60, w / 2 + 60, 60, w / 2 + 40, 110, w / 2 - 40, 110]), '#000', 0.5);
      const core = new Path2D();
      core.arc(w / 2, 78, 20, 0, TAU);
      A.emissive(ctx, core, SL.pal.enemy.seam, 18);
    }, { pad: 8 });

    A.define('core:pod', 34, 46, (ctx, w, h) => {
      const p = new Path2D();
      p.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, TAU);
      A.metal(ctx, p, { base: '#dfe8ef', spec: 0.6 });
      const win = new Path2D();
      win.ellipse(w / 2, h * 0.38, w * 0.22, h * 0.14, 0, 0, TAU);
      A.emissive(ctx, win, SL.pal.rescue, 6);
    }, { pad: 4 });

    // enemy beam cross-section (white core -> color -> transparent), stretched along the beam
    world.beamSprite = function (color) {
      const key = 'beam:' + color;
      if (!A.has(key)) {
        A.define(key, 8, 64, (ctx, w, h) => {
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, C.rgba(color, 0));
          g.addColorStop(0.18, C.rgba(color, 0.35));
          g.addColorStop(0.36, C.rgba(color, 0.95));
          g.addColorStop(0.44, C.rgba(C.mix(color, '#ffffff', 0.7), 1));
          g.addColorStop(0.5, '#ffffff');
          g.addColorStop(0.56, C.rgba(C.mix(color, '#ffffff', 0.7), 1));
          g.addColorStop(0.64, C.rgba(color, 0.95));
          g.addColorStop(0.82, C.rgba(color, 0.35));
          g.addColorStop(1, C.rgba(color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }, { pad: 0 });
      }
      return A.get(key);
    };
  }

  // default bullet types (patterns and weapons may redefine any of them)
  function spriteType(r, damage, extra) {
    return Object.assign({ r, damage, spriteFor: (id, color) => world.ebSprite(id, color) }, extra || {});
  }
  SL.ebulletTypes.define('orb', spriteType(7, 's', { color: SL.pal.ebullet.pink }));
  SL.ebulletTypes.define('orbBig', spriteType(13, 'm', { color: SL.pal.ebullet.orange }));
  SL.ebulletTypes.define('needle', spriteType(4, 's', { color: SL.pal.ebullet.violet, orient: true }));
  SL.ebulletTypes.define('shard', spriteType(6, 'm', { color: SL.pal.ebullet.red, orient: true }));
  SL.ebulletTypes.define('mine', spriteType(11, 'l', { color: SL.pal.ebullet.orange, spin: 2.2 }));
  SL.ebulletTypes.define('beam', { color: SL.pal.ebullet.pink, draw: drawEnemyBeamDefault });
  SL.pbulletTypes.define('pulse', { r: 7, damage: 7, sprite: 'core:pulse', orient: true, color: '#7fe3ff' });

  const PLACEHOLDER_ENEMY = {
    id: '_placeholder', name: 'Unknown contact', hp: 30, r: 22, score: 50, credits: [1, 2], sprite: 'core:placeholder_enemy',
    explosion: 's', init(e) { if (!e.vy) e.vy = 160; },
  };
  const PLACEHOLDER_BOSS = {
    id: '_placeholder_boss', name: 'Unknown Dreadnought', title: 'Placeholder', hp: 4000, r: 110, score: 20000,
    sprite: 'core:placeholder_boss', explosion: 'xl',
  };

  // ------------------------------------------------------------------ spawning
  SL.spawnEnemy = function (id, opts) {
    const o = opts || {};
    let def = typeof id === 'object' && id ? id : SL.enemies.get(id);
    if (!def) def = PLACEHOLDER_ENEMY;
    if (world.enemies.length >= CAPS.enemies) { U.warnOnce('cap:enemies', 'enemy cap reached (' + CAPS.enemies + ')'); return deadDummy('enemy'); }
    const e = makeEntity('enemy', def, o);
    e.typeId = typeof id === 'string' ? id : def.id;
    const base = o.hp || def.hp || 30;
    e.hp = e.maxHp = Math.max(1, Math.round(base * (diff().enemyHp || 1) * (o.hpMul || 1)));
    e.armor = def.armor != null ? def.armor : 1;
    e.contactDamage = def.contactDamage != null ? def.contactDamage : 20;
    e.offscreenKill = o.offscreenKill != null ? o.offscreenKill : def.offscreenKill !== false;
    e.path = o.path || null;
    e.params = o.params || {};
    if (o.drop !== undefined) e.drop = o.drop;
    e.score = def.score || 0;
    e.noCount = !!(o.noCount || def.noCount);
    world.enemies.push(e);
    if (def.init) {
      try { def.init(e, o); } catch (err) { report('enemy "' + e.typeId + '" init', err); }
    }
    const s = session();
    if (s && !e.noCount) s.enemiesSpawned++;
    SL.bus.emit('enemySpawn', { e });
    return e;
  };

  SL.spawnBoss = function (id, opts) {
    const o = opts || {};
    const def = (id && typeof id === 'object' ? id : SL.bosses.get(id)) || PLACEHOLDER_BOSS;
    if (typeof id !== 'string') id = def.id || 'boss';
    const r = def.r || 120;
    const b = makeEntity('enemy', def, { x: o.x != null ? o.x : W / 2, y: o.y != null ? o.y : -r - 60, r });
    b.isBoss = true;
    b.typeId = id;
    b.noCount = !!(o.noCount || def.noCount);
    b.name = def.name || id;
    b.title = def.title || '';
    b.hp = b.maxHp = Math.max(1, Math.round((o.hp || def.hp || 9000) * (diff().enemyHp || 1) * (o.hpMul || 1)));
    b.armor = def.armor != null ? def.armor : 1;
    b.contactDamage = def.contactDamage != null ? def.contactDamage : 30;
    b.offscreenKill = false;
    b.phases = (def.phases && def.phases.length ? def.phases.slice() : [{ at: 1, name: 'main' }]).sort((a, c) => (c.at || 0) - (a.at || 0));
    b.phase = 0;
    b.phaseName = b.phases[0].name || 'phase 1';
    b.phaseMarks = b.phases.slice(1).map((p) => p.at);
    b.phaseBroken = [];
    // b.invuln reads true while core holds the boss invulnerable (intro, phase transition, death) OR content set it;
    // writing b.invuln only sets the content flag, so a shield set in a phase enter() survives the transition end.
    let invCore = true, invUser = false;
    Object.defineProperty(b, 'invuln', {
      get() { return invCore || invUser; },
      set(v) { invUser = !!v; },
      enumerable: true, configurable: true,
    });
    Object.defineProperty(b, '_coreInvuln', {
      get() { return invCore; },
      set(v) { invCore = !!v; },
      enumerable: false, configurable: true,
    });
    b.introDone = false;
    b.introY = o.introY != null ? o.introY : 300;
    b.transitionT = 0;
    b.fightT = 0;
    b.parts = def.parts || null;
    b.score = def.score || 20000;
    b.entered = true;
    world.enemies.push(b);
    if (SL.game) {
      SL.game.boss = b;
      const s = session();
      if (s) { s.boss = b; s.bossSeen = true; if (!b.noCount) s.enemiesSpawned++; }
    }
    SL.bus.emit('bossWarning', { id, def, b, name: b.name, title: b.title });
    if (def.init) {
      try { def.init(b, o); } catch (err) { report('boss "' + id + '" init', err); }
    }
    const s = session();
    const music = o.music || (s && s.mission && s.mission.bossMusic) || 'boss';
    U.audio('music', music, { fade: 1.5 });
    SL.bus.emit('bossSpawn', { b, id });
    return b;
  };

  SL.spawnHazard = function (id, opts) {
    const o = opts || {};
    const def = SL.hazards.get(id);
    if (!def) return deadDummy('hazard');
    if (world.hazards.length >= CAPS.hazards) { U.warnOnce('cap:hazards', 'hazard cap reached'); return deadDummy('hazard'); }
    const h = makeEntity('hazard', def, o);
    h.typeId = id;
    h.team = 'hazard';
    h.r = o.r || def.r || 60;
    world.hazards.push(h);
    if (def.init) {
      try { def.init(h, o); } catch (err) { report('hazard "' + id + '" init', err); h.dead = true; }
    }
    SL.bus.emit('hazardSpawn', { h, id });
    return h;
  };

  SL.spawnProp = function (def, opts) { return world.spawnEntity('props', def, opts); };
  SL.spawnAlly = function (def, opts) {
    const a = world.spawnEntity('allies', def, opts);
    a.team = 'ally';
    return a;
  };

  world.spawnPickup = function (id, x, y, opts) {
    const o = opts || {};
    let def = SL.pickupTypes.get(id);
    if (!def) def = { r: 14, magnet: true, apply() {}, draw: null, color: '#ffffff' };
    if (world.pickups.length >= CAPS.pickups) return deadDummy('pickup');
    const pk = makeEntity('pickup', def, { x, y, vx: o.vx, vy: o.vy != null ? o.vy : -120 });
    pk.typeId = id;
    pk.team = 'pickup';
    pk.r = def.r || 16;
    pk.value = o.value != null ? o.value : 1;
    pk.life = o.life != null ? o.life : def.life || 0;
    pk.bob = Math.random() * TAU;
    Object.assign(pk.data, o.data || {});
    world.pickups.push(pk);
    if (def.init) {
      try { def.init(pk, o); } catch (err) { report('pickup "' + id + '" init', err); }
    }
    return pk;
  };

  // ------------------------------------------------------------------ bullets
  // Bullets are pooled. Every core field is rewritten on reuse; an object that gained extra own fields (content
  // writing b.grazed = true instead of b.data.grazed) is not returned to the pool, so no stale state can leak into a
  // later bullet. When a list is full the fire functions return a fresh, fully initialised bullet that is already
  // dead and never added to the world, so code that tweaks the returned bullet still works.
  const ebPool = [], pbPool = [];
  let EB_KEYS = 0, PB_KEYS = 0;

  function resolveDamage(d) {
    if (typeof d === 'number') return d;
    return DAMAGE[d] || DAMAGE.s;
  }
  function finiteOr(v, def, what) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (v != null) U.warnOnce('nonfinite:' + what, what + ' is not a finite number (' + v + '); using ' + def);
    return def;
  }
  function keyCount(o) {
    let n = 0;
    for (const k in o) n++; // eslint-disable-line no-unused-vars
    return n;
  }

  function initEnemyBullet(b, x, y, angle, speed, type, o) {
    const typeId = type || 'orb';
    const t = SL.ebulletTypes.get(typeId) || SL.ebulletTypes.defs.orb;
    const bs = diff().bulletSpeed || 1;
    angle = finiteOr(angle, Math.PI / 2, 'SL.fireEnemy angle');
    x = finiteOr(x, W / 2, 'SL.fireEnemy x');
    y = finiteOr(y, -40, 'SL.fireEnemy y');
    b.kind = 'ebullet';
    b.x = b.bx = b.px = x;
    b.y = b.by = b.py = y;
    b.angle = angle;
    b.speed = finiteOr(speed, 200, 'SL.fireEnemy speed') * bs;
    b.vx = Math.cos(angle) * b.speed;
    b.vy = Math.sin(angle) * b.speed;
    b.type = t;
    b.typeId = typeId;
    b.scale = o.scale || 1;
    b.r = (t.r || 7) * b.scale;
    b.damage = resolveDamage(o.damage != null ? o.damage : t.damage);
    b.accel = (o.accel || 0) * bs;
    b.maxSpeed = o.maxSpeed != null ? o.maxSpeed * bs : Infinity;
    b.minSpeed = o.minSpeed != null ? o.minSpeed * bs : 0;
    b.turn = o.turn || 0;
    b.homing = o.homing || 0;
    b.homingTime = o.homingTime != null ? o.homingTime : (o.homing ? 1.6 : 0);
    b.waveAmp = o.wave ? o.wave.amp || 0 : 0;
    b.waveFreq = o.wave ? o.wave.freq || 1 : 0;
    b.delay = o.delay || 0;
    b.delay0 = b.delay;
    b.life = o.life || 0;
    b.split = o.split || null;
    b.color = o.color || t.color || SL.pal.ebullet.pink;
    b.rot = t.orient ? angle : 0;
    b.spin = t.spin || 0;
    b.age = 0;
    b.dead = false;
    b.update = o.update || null;
    b.owner = o.owner || null;
    b.data = o.data || {};
    b.spr = null;
    if (!t.draw) b.spr = ebSpriteFor(t, typeId, b.color);
    return b;
  }
  function ebSpriteFor(t, typeId, color) {
    let spr = null;
    try {
      if (t.spriteFor) spr = t.spriteFor(typeId, color);
      else if (t.sprite) spr = SL.art.get(typeof t.sprite === 'function' ? t.sprite(color) : t.sprite);
    } catch (err) { report('ebullet type "' + typeId + '" sprite', err); }
    return spr && spr.canvas ? spr : world.ebSprite('orb', color);
  }

  SL.fireEnemy = function (x, y, angle, speed, type, opts) {
    const o = opts || {};
    if (world.ebullets.length >= CAPS.ebullets) {
      U.warnOnce('cap:ebullets', 'enemy bullet cap reached (' + CAPS.ebullets + '); extra shots are dropped');
      const d = initEnemyBullet({}, x, y, angle, speed, type, o);
      d.dead = true;
      return d;
    }
    const b = initEnemyBullet(ebPool.pop() || {}, x, y, angle, speed, type, o);
    if (!EB_KEYS) EB_KEYS = keyCount(b);
    world.ebullets.push(b);
    return b;
  };

  function initPlayerBullet(b, owner, x, y, angle, speed, type, dmg, o) {
    const typeId = type || 'pulse';
    const t = SL.pbulletTypes.get(typeId) || SL.pbulletTypes.defs.pulse;
    angle = finiteOr(angle, -Math.PI / 2, 'SL.firePlayer angle');
    b.kind = 'pbullet';
    b.owner = owner || null;
    b.x = b.px = finiteOr(x, W / 2, 'SL.firePlayer x');
    b.y = b.py = finiteOr(y, H, 'SL.firePlayer y');
    b.angle = angle;
    b.speed = speed != null ? finiteOr(speed, 1400, 'SL.firePlayer speed') : 1400;
    b.vx = Math.cos(angle) * b.speed;
    b.vy = Math.sin(angle) * b.speed;
    b.type = t;
    b.typeId = typeId;
    b.scale = o.scale || 1;
    b.r = (o.r || t.r || 7) * b.scale;
    b.dmg = dmg != null ? dmg : t.damage != null ? t.damage : 7;
    b.pierce = o.pierce || t.pierce || 0;
    if (b.hitIds) b.hitIds.length = 0; else b.hitIds = [];
    b.homing = o.homing || t.homing || 0;
    b.life = o.life || t.life || 0;
    b.onHit = o.onHit || t.onHit || null;
    b.color = o.color || t.color || '#7fe3ff';
    b.alpha = o.alpha != null ? o.alpha : t.alpha != null ? t.alpha : 0.92;
    b.age = 0;
    b.dead = false;
    b.data = o.data || {};
    b.spr = t.draw ? null : pbSpriteFor(t);
    return b;
  }
  function pbSpriteFor(t) {
    const spr = t && t.sprite ? SL.art.get(t.sprite) : null;
    return spr && spr.canvas ? spr : SL.art.get('core:pulse');
  }

  SL.firePlayer = function (owner, x, y, angle, speed, type, dmg, opts) {
    const o = opts || {};
    if (world.pbullets.length >= CAPS.pbullets) {
      const d = initPlayerBullet({}, owner, x, y, angle, speed, type, dmg, o);
      d.dead = true;
      return d;
    }
    const b = initPlayerBullet(pbPool.pop() || {}, owner, x, y, angle, speed, type, dmg, o);
    if (!PB_KEYS) PB_KEYS = keyCount(b);
    world.pbullets.push(b);
    return b;
  };

  function splitBullet(b) {
    const s = b.split;
    const n = Math.max(1, s.count || 6);
    const spread = s.spread != null ? s.spread : TAU;
    let a0 = b.angle;
    if (s.aim) {
      const p = world.nearestPlayer(b.x, b.y);
      if (p) a0 = Math.atan2(p.y - b.y, p.x - b.x);
    }
    const bs = diff().bulletSpeed || 1;
    const sp = (s.speed || b.speed / bs);
    for (let i = 0; i < n; i++) {
      const a = spread >= TAU - 1e-3 ? a0 + (i / n) * TAU : a0 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
      SL.fireEnemy(b.x, b.y, a, sp, s.type || b.typeId, { color: s.color || b.color, scale: s.scale });
    }
  }

  function updateEnemyBullets(dt) {
    const list = world.ebullets;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.dead) continue;
      b.px = b.x;
      b.py = b.y;
      b.age += dt;
      if (b.delay > 0) { b.delay -= dt; continue; }
      let steer = false;
      if (b.accel) {
        b.speed += b.accel * dt;
        if (b.speed > b.maxSpeed) b.speed = b.maxSpeed;
        if (b.speed < b.minSpeed) b.speed = b.minSpeed;
        steer = true;
      }
      if (b.turn) { b.angle += b.turn * dt; steer = true; }
      if (b.homing && b.age < b.homingTime) {
        const p = world.nearestPlayer(b.x, b.y);
        if (p) {
          const want = Math.atan2(p.y - b.y, p.x - b.x);
          const d = U.angleDiff(b.angle, want), m = b.homing * dt;
          b.angle += d > m ? m : d < -m ? -m : d;
          steer = true;
        }
      }
      if (steer) {
        b.vx = Math.cos(b.angle) * b.speed;
        b.vy = Math.sin(b.angle) * b.speed;
        if (b.type.orient) b.rot = b.angle;
      }
      b.bx += b.vx * dt;
      b.by += b.vy * dt;
      if (b.waveAmp) {
        const off = Math.sin(b.age * b.waveFreq * TAU) * b.waveAmp;
        const s = Math.sin(b.angle), c = Math.cos(b.angle);
        b.x = b.bx - s * off;
        b.y = b.by + c * off;
      } else {
        b.x = b.bx;
        b.y = b.by;
      }
      if (b.spin) b.rot += b.spin * dt;
      if (b.update) {
        try { b.update(b, dt); } catch (err) { report('ebullet update', err); b.update = null; }
      }
      if (b.life && b.age >= b.life) { b.dead = true; continue; }
      if (b.split && b.age >= (b.split.at || 1)) { b.dead = true; splitBullet(b); continue; }
      if (outside(b.x, b.y, b.vx, b.vy, b.age)) b.dead = true;
    }
  }

  function outside(x, y, vx, vy, age) {
    const m = 60;
    if (x > -m && x < W + m && y > -m && y < H + m) return false;
    if (x < -400 || x > W + 400 || y < -400 || y > H + 400 || age > 4) return true;
    return (x <= -m && vx <= 0) || (x >= W + m && vx >= 0) || (y <= -m && vy <= 0) || (y >= H + m && vy >= 0);
  }

  function updatePlayerBullets(dt) {
    const list = world.pbullets;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.dead) continue;
      b.px = b.x;
      b.py = b.y;
      b.age += dt;
      if (b.homing) {
        const e = world.nearestEnemy(b.x, b.y, { maxDist: 520 });
        if (e) {
          const want = Math.atan2(e.y - b.y, e.x - b.x);
          const d = U.angleDiff(b.angle, want), m = b.homing * dt;
          b.angle += d > m ? m : d < -m ? -m : d;
          b.vx = Math.cos(b.angle) * b.speed;
          b.vy = Math.sin(b.angle) * b.speed;
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.type.update) {
        try { b.type.update(b, dt); } catch (err) { report('pbullet "' + b.typeId + '" update', err); b.dead = true; }
      }
      if (b.life && b.age >= b.life) b.dead = true;
      else if (outside(b.x, b.y, b.vx, b.vy, b.age)) b.dead = true;
    }
  }

  // ------------------------------------------------------------------ beams
  SL.fireEnemyBeam = function (src, opts) {
    const o = opts || {};
    const full = world.ebeams.length >= CAPS.ebeams;
    src = src || { x: W / 2, y: 0 };
    const ox = o.offset ? o.offset.x || 0 : o.ox || 0, oy = o.offset ? o.offset.y || 0 : o.oy || 0;
    let angle = o.angle;
    if (typeof angle !== 'number' || !isFinite(angle)) {
      if (angle != null && angle !== 'aim') U.warnOnce('beam-angle', 'SL.fireEnemyBeam angle "' + angle + '" is not a number; aiming at the nearest player');
      const p = world.nearestPlayer(src.x + ox, src.y + oy);
      angle = p ? Math.atan2(p.y - (src.y + oy), p.x - (src.x + ox)) : Math.PI / 2;
    }
    const bm = {
      kind: 'ebeam', src, ox, oy, x: src.x + ox, y: src.y + oy, angle, angle0: angle,
      width: o.width || 34, length: o.length || 1600, telegraph: o.telegraph != null ? o.telegraph : 0.8,
      duration: o.duration != null ? o.duration : 1.2, sweep: o.sweep || 0, color: o.color || SL.pal.ebullet.pink,
      follow: o.follow !== false, dps: o.dps || 45, t: 0, state: 'telegraph', fade: 0, dead: false, data: o.data || {},
      track: o.track || 0,
    };
    if (full) {
      // list full: a complete beam object that is already dead and not in the world
      U.warnOnce('cap:ebeams', 'enemy beam cap reached (' + CAPS.ebeams + ')');
      bm.dead = true;
      bm.state = 'fade';
      return bm;
    }
    world.ebeams.push(bm);
    U.sfx('beam_charge', { x: bm.x });
    return bm;
  };

  function updateEnemyBeams(dt) {
    for (const bm of world.ebeams) {
      if (bm.dead) continue;
      bm.t += dt;
      const src = bm.src;
      if (bm.follow && src) { bm.x = src.x + bm.ox; bm.y = src.y + bm.oy; }
      if (src && (src.dead || src.dying) && bm.state !== 'fade') { bm.state = 'fade'; bm.fade = 0; }
      if (bm.state === 'telegraph') {
        if (bm.track) {
          const p = world.nearestPlayer(bm.x, bm.y);
          if (p) {
            const want = Math.atan2(p.y - bm.y, p.x - bm.x);
            bm.angle += U.clamp(U.angleDiff(bm.angle, want), -bm.track * dt, bm.track * dt);
          }
        }
        if (bm.t >= bm.telegraph) {
          bm.state = 'active';
          bm.t = 0;
          bm.angle0 = bm.angle;
          U.sfx('beam_fire', { x: bm.x });
        }
      } else if (bm.state === 'active') {
        if (typeof bm.sweep === 'number') bm.angle += bm.sweep * dt;
        else if (bm.sweep && bm.sweep.to != null) bm.angle = U.lerpAngle(bm.angle0, bm.sweep.to, U.clamp(bm.t / Math.max(0.01, bm.duration), 0, 1));
        if (bm.t >= bm.duration) { bm.state = 'fade'; bm.fade = 0; }
      } else {
        bm.fade += dt;
        if (bm.fade >= 0.22) bm.dead = true;
      }
    }
  }

  function drawEnemyBeamDefault(bm, ctx) {
    const b = SL.render.base, bs = b.s;
    const c = Math.cos(bm.angle) * bs, s = Math.sin(bm.angle) * bs;
    const spr = world.beamSprite(bm.color);
    const t = SL.time.t;
    ctx.setTransform(c, s, -s, c, b.x + bm.x * bs, b.y + bm.y * bs);
    ctx.globalCompositeOperation = 'lighter';
    if (bm.state === 'telegraph') {
      const k = U.clamp(bm.t / Math.max(0.01, bm.telegraph), 0, 1);
      const w = 3 + 5 * k;
      ctx.globalAlpha = (0.35 + 0.4 * k) * (0.75 + 0.25 * Math.sin(t * 40));
      ctx.drawImage(spr.canvas, 0, -w / 2, bm.length, w);
      ctx.setTransform(bs, 0, 0, bs, b.x, b.y);
      SL.art.drawGlow(ctx, bm.x, bm.y, 14 + 26 * k, bm.color, 0.5 + 0.5 * k);
    } else {
      const k = bm.state === 'fade' ? 1 - bm.fade / 0.22 : Math.min(1, bm.t / 0.08);
      const w = bm.width * (0.75 + 0.25 * k) * (1 + 0.06 * Math.sin(t * 55));
      ctx.globalAlpha = 0.55 * k;
      ctx.drawImage(spr.canvas, 0, -w * 0.9, bm.length, w * 1.8);
      ctx.globalAlpha = k;
      ctx.drawImage(spr.canvas, 0, -w / 2, bm.length, w);
      ctx.setTransform(bs, 0, 0, bs, b.x, b.y);
      SL.art.drawGlow(ctx, bm.x, bm.y, w * 1.6, bm.color, k);
    }
    ctx.setTransform(bs, 0, 0, bs, b.x, b.y);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawPlayerBeamDefault(bm, ctx) {
    const b = SL.render.base, bs = b.s;
    const len = bm.hitLength != null ? bm.hitLength : bm.length;
    const c = Math.cos(bm.angle) * bs, s = Math.sin(bm.angle) * bs;
    const spr = world.beamSprite(bm.color || '#3fc8ff');
    const w = (bm.width || 20) * (1 + 0.08 * Math.sin(SL.time.t * 60));
    ctx.setTransform(c, s, -s, c, b.x + bm.x * bs, b.y + bm.y * bs);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(spr.canvas, 0, -w, len, w * 2);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(spr.canvas, 0, -w / 2, len, w);
    ctx.setTransform(bs, 0, 0, bs, b.x, b.y);
    ctx.globalAlpha = 1;
    if (bm.hitX != null) SL.art.drawGlow(ctx, bm.hitX, bm.hitY, w * 1.8, bm.color || '#7fe3ff', 0.9);
  }

  /** Squared distance from (px, py) to the segment (ax, ay)-(bx, by); also returns t along it in segT. */
  let segT = 0;
  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    segT = t;
    const cx = ax + dx * t - px, cy = ay + dy * t - py;
    return cx * cx + cy * cy;
  }

  // ------------------------------------------------------------------ damage
  function hitTest(e, x, y, r) {
    const cs = e.circles;
    if (cs && cs.length) {
      const sc = e.scale || 1;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i], rr = (c.r * sc + r);
        const dx = e.x + c.x * sc - x, dy = e.y + c.y * sc - y;
        if (dx * dx + dy * dy < rr * rr) return true;
      }
      return false;
    }
    const rr = e.r + r, dx = e.x - x, dy = e.y - y;
    return dx * dx + dy * dy < rr * rr;
  }
  world.hitTest = hitTest;

  /** First contact (0..1) of a point moving from (ax, ay) to (bx, by) with the circle (cx, cy, R); -1 if none. */
  function sweepCircle(ax, ay, bx, by, cx, cy, R) {
    const fx = ax - cx, fy = ay - cy;
    const c = fx * fx + fy * fy - R * R;
    if (c <= 0) return 0;
    const dx = bx - ax, dy = by - ay;
    const a = dx * dx + dy * dy;
    if (a < 1e-9) return -1;
    const hb = fx * dx + fy * dy;
    if (hb >= 0) return -1;
    const disc = hb * hb - a * c;
    if (disc < 0) return -1;
    const t = (-hb - Math.sqrt(disc)) / a;
    return t <= 1 ? t : -1;
  }
  let sweepX = 0, sweepY = 0;
  /** Swept test of a bullet (radius r) that moved from (ax, ay) to (bx, by) this step against an entity's hitbox
      (e.circles or e.r). The entity's own motion this step (e.lx, e.ly -> e.x, e.y) is taken out first, so a fast
      bolt cannot tunnel through a diving enemy. Returns the contact time 0..1 (or -1) and leaves the contact point,
      relative to the entity's current position, in sweepX / sweepY. Jumps (teleports) fall back to a point test. */
  function sweepTest(e, ax, ay, bx, by, r) {
    if (e.lx != null) {
      const ox = e.x - e.lx, oy = e.y - e.ly;
      if (ox * ox + oy * oy < 3600) { ax += ox; ay += oy; }
    }
    const mx = bx - ax, my = by - ay;
    if (mx * mx + my * my > 25600) { ax = bx; ay = by; }
    let t = -1;
    const cs = e.circles;
    if (cs && cs.length) {
      const sc = e.scale || 1;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        const ti = sweepCircle(ax, ay, bx, by, e.x + c.x * sc, e.y + c.y * sc, c.r * sc + r);
        if (ti >= 0 && (t < 0 || ti < t)) t = ti;
      }
    } else t = sweepCircle(ax, ay, bx, by, e.x, e.y, (e.r || 0) + r);
    if (t >= 0) { sweepX = ax + (bx - ax) * t; sweepY = ay + (by - ay) * t; }
    return t;
  }
  world.sweepTest = sweepTest;

  let beamHitR = 0;
  /** Beam (segment) vs an entity's hitbox: t along the beam (0..1) of the nearest touching circle, or -1. */
  function beamHit(e, ax, ay, bx, by, half) {
    const cs = e.circles;
    if (cs && cs.length) {
      const sc = e.scale || 1;
      let best = -1;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i], rr = c.r * sc + half;
        if (segDist2(e.x + c.x * sc, e.y + c.y * sc, ax, ay, bx, by) < rr * rr && (best < 0 || segT < best)) { best = segT; beamHitR = c.r * sc; }
      }
      return best;
    }
    const rr = (e.r || 0) + half;
    if (segDist2(e.x, e.y, ax, ay, bx, by) < rr * rr) { beamHitR = e.r || 0; return segT; }
    return -1;
  }

  const hitEvt = { e: null, amount: 0, by: null, type: '' };
  SL.damageEnemy = function (e, amount, o) {
    if (!e || e.dead || e.dying || !(amount > 0)) return 0;
    o = o || {};
    if (e.invuln) {
      if (o.x != null && Math.random() < 0.3) SL.fx.hit(o.x, o.y, '#9fb4d8', { dir: -Math.PI / 2 });
      return 0;
    }
    const armor = e.armor != null ? e.armor : 1;
    const dmg = amount * armor;
    if (dmg <= 0) return 0;
    e.hp -= dmg;
    // at most one 0.06 s flash per 0.11 s (0.14 s for bosses), so sustained fire flickers instead of
    // painting the sprite white
    if (!(world.t - (e.flashAt != null ? e.flashAt : -1) < (e.isBoss ? 0.14 : 0.11))) { e.flash = 0.06; e.flashAt = world.t; }
    if (e.def.onHit) {
      try { e.def.onHit(e, dmg, o); } catch (err) { report('enemy "' + e.typeId + '" onHit', err); }
    }
    hitEvt.e = e; hitEvt.amount = dmg; hitEvt.by = o.by || null; hitEvt.type = o.type || '';
    SL.bus.emit('enemyHit', hitEvt);
    if (e.isBoss) {
      bossCheckPhase(e);
      if (e.hp <= 0) startBossDeath(e, o.by);
    } else if (e.hp <= 0) killEnemy(e, o.by);
    return dmg;
  };

  function killEnemy(e, by) {
    if (e.dead) return;
    e.hp = 0;
    e.dead = true;
    e.killed = true;
    if (SL.game && SL.game.registerKill) SL.game.registerKill(e, by);
    if (e.def.onDeath) {
      try { e.def.onDeath(e); } catch (err) { report('enemy "' + e.typeId + '" onDeath', err); }
    } else defaultDeath(e);
    SL.bus.emit('enemyKilled', { e, by: by || null });
  }
  world.kill = killEnemy;

  function defaultDeath(e) {
    SL.fx.explode(e.x, e.y, { size: e.def.explosion || (e.r > 60 ? 'l' : e.r > 34 ? 'm' : 's'), palette: e.def.palette || 'enemy' });
    if (SL.pickups && SL.pickups.drop) {
      try { SL.pickups.drop(e); } catch (err) { report('SL.pickups.drop', err); }
    }
  }
  world.defaultDeath = defaultDeath;

  // ------------------------------------------------------------------ bosses
  /** Core's own invulnerability (intro, transitions, death); content's b.invuln is kept separately (spawnBoss). */
  function setCoreInvuln(b, v) {
    if ('_coreInvuln' in b) b._coreInvuln = v; else b.invuln = v;
  }

  function enterPhase(b, i) {
    b.phase = i;
    const ph = b.phases[i];
    b.phaseName = (ph && ph.name) || 'phase ' + (i + 1);
    if (ph && ph.enter) {
      try { ph.enter(b); } catch (err) { report('boss "' + b.typeId + '" phase enter', err); }
    }
    SL.bus.emit('bossPhase', { b, phase: i, name: b.phaseName });
  }

  function bossCheckPhase(b) {
    if (b.phase + 1 >= b.phases.length) return;
    const next = b.phases[b.phase + 1];
    if (b.hp / b.maxHp > (next.at || 0)) return;
    const after = b.phases[b.phase + 2];
    b.hp = Math.max(b.hp, after ? after.at * b.maxHp + 1 : 1);
    setCoreInvuln(b, true);
    b.transitionT = b.def.transitionTime != null ? b.def.transitionTime : 1.2;
    world.clearEnemyBullets({ toCredits: true });
    SL.fx.flash('#ffffff', 0.25, 0.2);
    SL.fx.shake(8, 0.35);
    enterPhase(b, b.phase + 1);
  }

  function startBossDeath(b, by) {
    if (b.dying || b.dead) return;
    b.hp = 0;
    b.dying = true;
    setCoreInvuln(b, true);
    b.deathT = 0;
    b.data.deathTick = 0;
    world.clearEnemyBullets({ toCredits: true, beams: true });
    if (SL.game && SL.game.registerKill) SL.game.registerKill(b, by);
    SL.fx.slowmo(0.35, 1.5);
    SL.fx.hitstop(0.1);
    SL.fx.flash('#ffffff', 0.45, 0.3);
    SL.bus.emit('bossDeath', { b });
    if (b.def.onDeath) {
      try { b.def.onDeath(b); } catch (err) { report('boss "' + b.typeId + '" onDeath', err); }
    }
  }

  function defaultIntro(b, dt) {
    const d = b.data;
    if (d.introT == null) { d.introT = 0; d.introY0 = b.y; }
    d.introT += dt;
    const k = U.clamp(d.introT / 2.4, 0, 1);
    b.y = U.lerp(d.introY0, b.introY, SL.ease.outCubic(k));
    return k >= 1;
  }

  function defaultDying(b, dt) {
    const d = b.data;
    d.deathTick -= dt;
    if (d.deathTick <= 0 && b.deathT < 2.5) {
      d.deathTick = 0.13;
      const a = Math.random() * TAU, r = Math.random() * b.r * 0.85;
      SL.fx.explode(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r * 0.7, { size: Math.random() < 0.3 ? 'l' : 'm', sound: Math.random() < 0.5 });
    }
    if (b.deathT >= 2.7 && !b.defeated) {
      SL.fx.explode(b.x, b.y, { size: 'boss' });
      if (SL.game && SL.game.bossDefeated) SL.game.bossDefeated(b); else b.dead = true;
    }
  }

  function updateBoss(b, dt) {
    const def = b.def;
    if (b.dying) {
      b.deathT += dt;
      if (def.dying && !b.data.dyingBroken) {
        try { def.dying(b, dt); } catch (err) { report('boss "' + b.typeId + '" dying', err); b.data.dyingBroken = true; }
      } else if (!def.onDeath || b.data.dyingBroken) defaultDying(b, dt);
      if (b.deathT > 8 && !b.defeated && !b.dead) {
        U.warnOnce('boss-defeat:' + b.typeId, 'boss "' + b.typeId + '" never called SL.game.bossDefeated; forcing it');
        if (SL.game && SL.game.bossDefeated) SL.game.bossDefeated(b); else b.dead = true;
      }
      return;
    }
    if (!b.introDone) {
      let done = true;
      if (def.intro && !b.data.introBroken) {
        try { done = !!def.intro(b, dt); } catch (err) { report('boss "' + b.typeId + '" intro', err); b.data.introBroken = true; done = true; }
      } else done = defaultIntro(b, dt);
      if (done) {
        b.introDone = true;
        setCoreInvuln(b, false);
        b.fightT = 0;
        enterPhase(b, 0);
        SL.bus.emit('bossIntroDone', { b });
      }
      return;
    }
    b.fightT += dt;
    if (b.transitionT > 0) {
      b.transitionT -= dt;
      if (b.transitionT <= 0) setCoreInvuln(b, false);
    }
    if (def.update && !b.data.updateBroken) {
      try { def.update(b, dt); } catch (err) { report('boss "' + b.typeId + '" update', err); b.data.updateBroken = true; }
    }
    const ph = b.phases[b.phase];
    const broken = b.phaseBroken || (b.phaseBroken = []);
    if (ph && ph.update && !(b.transitionT > 0) && !broken[b.phase]) {
      try { ph.update(b, dt); } catch (err) { report('boss "' + b.typeId + '" phase update', err); broken[b.phase] = true; }
    }
    // hp lowered directly by content (a destroyed part, a scripted hit) changes phase / starts the death here too
    if (!b.dying && !b.dead && !(b.transitionT > 0)) {
      bossCheckPhase(b);
      if (b.hp <= 0) startBossDeath(b, null);
    }
  }

  // ------------------------------------------------------------------ players
  const playerHitEvt = { p: null, amount: 0, source: '' };
  SL.damagePlayer = function (p, amount, o) {
    o = o || {};
    if (!p || !p.alive || p.down || !(amount > 0)) return 0;
    if (p.invuln > 0 && !o.ignoreInvuln) return 0;
    if (SL.debug && SL.debug.god) {
      if (!o.continuous) { p.invuln = Math.max(p.invuln, 0.25); SL.fx.hit(p.x, p.y, '#bff4ff'); }
      return 0;
    }
    let dmg = amount * (diff().damage || 1) * ((p.stats && p.stats.damageTaken) || 1);
    if (dmg <= 0) return 0;
    let absorbed = 0;
    if (p.shield > 0) {
      absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
      p.shieldHitT = 0.3;
      if (p.shield <= 0.001) { p.shield = 0; SL.bus.emit('shieldBreak', { p }); }
    }
    p.hull = Math.max(0, p.hull - dmg);
    const continuous = !!o.continuous;
    let counted = !continuous;
    if (continuous) {
      if ((p.contT || 0) <= 0) counted = true;
      p.contT = 0.5;
      SL.render.chromatic(0.35);
    }
    if (counted) {
      if (!continuous) p.invuln = Math.max(p.invuln, 0.5);
      p.hitT = 0.35;
      if (SL.game && SL.game.onPlayerHit) SL.game.onPlayerHit(p);
      SL.fx.chromatic(absorbed > 0 && dmg <= 0 ? 0.35 : 0.65, 0.32);
      SL.fx.shake(absorbed > 0 && dmg <= 0 ? 4 : 8, 0.25);
      SL.fx.flash(absorbed > 0 && dmg <= 0 ? '#7fe3ff' : '#ff2f6d', 0.14, 0.18);
      SL.fx.hit(p.x, p.y, absorbed > 0 ? '#9fe8ff' : '#ff8a5c', { dir: -Math.PI / 2 });
      U.sfx(absorbed > 0 && dmg <= 0 ? 'shield_hit' : 'player_hit', { x: p.x });
      playerHitEvt.p = p; playerHitEvt.amount = dmg + absorbed; playerHitEvt.source = o.source || '';
      SL.bus.emit('playerHit', playerHitEvt);
    }
    if (p.lowHullArmed && p.hull > 0 && p.hull <= p.maxHull * 0.3) {
      p.lowHullArmed = false;
      SL.bus.emit('lowHull', { p });
    }
    if (p.hull <= 0 && SL.player && SL.player.kill) SL.player.kill(p);
    return dmg + absorbed;
  };

  // ------------------------------------------------------------------ queries
  world.onScreen = function (e, margin) {
    const m = margin || 0, r = e.r || 0;
    return e.x + r > -m && e.x - r < W + m && e.y + r > -m && e.y - r < H + m;
  };
  world.nearestEnemy = function (x, y, o) {
    const maxD = o && o.maxDist != null ? o.maxDist : Infinity;
    const onscreen = !(o && o.onscreen === false);
    let best = null, bd = maxD * maxD;
    for (const e of world.enemies) {
      if (e.dead || e.dying || e.untargetable) continue;
      if (onscreen && !world.onScreen(e, -4)) continue;
      const d = U.dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };
  world.nearestPlayer = function (x, y) {
    let best = null, bd = Infinity;
    for (const p of world.players) {
      if (!p.alive || p.down || p.display) continue;
      const d = U.dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  world.enemiesInRadius = function (x, y, r) {
    const out = [];
    for (const e of world.enemies) {
      if (e.dead || e.dying) continue;
      const rr = r + (e.r || 0);
      if (U.dist2(x, y, e.x, e.y) <= rr * rr) out.push(e);
    }
    return out;
  };
  world.playersInRadius = function (x, y, r) {
    const out = [];
    for (const p of world.players) {
      if (!p.alive || p.down || p.display) continue;
      const rr = r + p.r;
      if (U.dist2(x, y, p.x, p.y) <= rr * rr) out.push(p);
    }
    return out;
  };

  /** Black-hole helper: pulls things toward (x, y) with acceleration strength * (1 - d/radius)^2
      (px/s^2), for the current step. opts: players (true), bullets (true, enemy bullets), pbullets (false),
      enemies (false), pickups (true), pods (true), consume (radius that swallows bullets and pickups, 0). */
  world.applyGravity = function (x, y, strength, radius, o) {
    o = o || {};
    const dt = world.dt;
    if (!(radius > 0) || !strength) return;
    const r2 = radius * radius;
    const consume = o.consume || 0, c2 = consume * consume;
    const pull = (ex, ey) => {
      const dx = x - ex, dy = y - ey;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2 || d2 < 1e-6) { pullX = 0; pullY = 0; return d2; }
      const d = Math.sqrt(d2);
      const f = 1 - d / radius;
      const a = strength * f * f;
      pullX = (dx / d) * a;
      pullY = (dy / d) * a;
      return d2;
    };
    let pullX = 0, pullY = 0;
    if (o.players !== false) {
      for (const p of world.players) {
        if (!p.alive || p.down || p.display) continue;
        pull(p.x, p.y);
        if (pullX || pullY) SL.player.push(p, pullX, pullY, dt);
      }
    }
    const bend = (list, isEnemy) => {
      for (const b of list) {
        if (b.dead) continue;
        const d2 = pull(b.x, b.y);
        if (consume && d2 < c2) { b.dead = true; continue; }
        if (!pullX && !pullY) continue;
        b.vx += pullX * dt;
        b.vy += pullY * dt;
        b.speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        b.angle = Math.atan2(b.vy, b.vx);
        if (isEnemy && b.type && b.type.orient) b.rot = b.angle;
      }
    };
    if (o.bullets !== false) bend(world.ebullets, true);
    if (o.pbullets) bend(world.pbullets, false);
    if (o.enemies) {
      for (const e of world.enemies) {
        if (e.dead || e.isBoss) continue;
        pull(e.x, e.y);
        e.vx += pullX * dt;
        e.vy += pullY * dt;
      }
    }
    const drift = (list, kill) => {
      for (const k of list) {
        if (k.dead) continue;
        const d2 = pull(k.x, k.y);
        if (kill && consume && d2 < c2) { k.dead = true; continue; }
        k.vx += pullX * dt;
        k.vy += pullY * dt;
      }
    };
    if (o.pickups !== false) drift(world.pickups, true);
    if (o.pods !== false) drift(world.pods, false);
  };

  world.clearEnemyBullets = function (o) {
    o = o || {};
    let n = 0, credits = 0;
    const gold = SL.pal.credit;
    for (const b of world.ebullets) {
      if (b.dead) continue;
      b.dead = true;
      n++;
      if (n <= 260) {
        SL.fx.emit({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60, life: 0.5, size: o.toCredits ? 16 : 12, size2: 2, color: o.toCredits ? gold : b.color, drag: 2 });
      }
      if (o.toCredits && n % 6 === 0 && credits < 30 && SL.pickups && SL.pickups.spawn) {
        credits++;
        try { SL.pickups.spawn('credit', b.x, b.y, { value: 1, small: true }); } catch (err) { report('SL.pickups.spawn', err); }
      }
    }
    if (o.beams) for (const bm of world.ebeams) if (!bm.dead && bm.state !== 'fade') { bm.state = 'fade'; bm.fade = 0; }
    return n;
  };

  // ------------------------------------------------------------------ background
  world.setBackground = function (id, opts) {
    let def = SL.backgrounds.get(id || 'default');
    if (!def) { id = 'default'; def = SL.backgrounds.defs.default; }
    const bg = { id, def, t: 0, phase: (opts && opts.phase) || 'default', data: {}, opts: opts || {} };
    world.bg = bg;
    if (def && def.init) {
      try { def.init(bg, opts || {}); } catch (err) { report('background "' + id + '" init', err); }
    }
    return bg;
  };
  world.setPhase = function (name) {
    const bg = world.bg;
    if (!bg) return;
    bg.phase = name;
    if (bg.def && bg.def.setPhase) {
      try { bg.def.setPhase(bg, name); } catch (err) { report('background "' + bg.id + '" setPhase', err); }
    }
  };

  // ------------------------------------------------------------------ reset / update
  world.reset = function () {
    // live hazards get their onEnd (stops SL.audio.loop hums and other cleanup) before the lists are dropped
    for (const h of world.hazards) {
      if (h.dead) continue;
      h.dead = true;
      if (h.def && h.def.onEnd) {
        try { h.def.onEnd(h); } catch (err) { report('hazard "' + h.typeId + '" onEnd', err); }
      }
    }
    SL.bus.emit('worldReset', {});
    for (const b of world.ebullets) { b.dead = true; recycle(b, ebPool, EB_KEYS); }
    for (const b of world.pbullets) { b.dead = true; recycle(b, pbPool, PB_KEYS); }
    // anything content still holds a reference to reads as dead from now on
    for (const k of ['enemies', 'beams', 'ebeams', 'pickups', 'pods', 'allies', 'props']) for (const e of world[k]) e.dead = true;
    ['players', 'enemies', 'pbullets', 'ebullets', 'beams', 'ebeams', 'pickups', 'pods', 'hazards', 'allies', 'props']
      .forEach((k) => { world[k].length = 0; });
    world.scroll.speed = world.scroll.target = 90;
    world.scroll.y = 0;
    world.t = 0;
    if (SL.game) SL.game.boss = null;
  };

  function updateEntityList(list, label, dt, cullBottom) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      e.age += dt;
      if (e.flash > 0) e.flash -= dt;
      const def = e.def;
      if (def.update) {
        try { def.update(e, dt); } catch (err) { report(label + ' "' + (e.typeId || def.id || '?') + '" update', err); e.dead = true; continue; }
      }
      if (!def.manualMove) { e.x += e.vx * dt; e.y += e.vy * dt; }
      if (e.x !== e.x || e.y !== e.y) { U.warnOnce(label + '-nan', label + ' position became NaN; removed'); e.dead = true; continue; }
      if (cullBottom && (e.y > H + (e.r || 0) + cullBottom || e.y < -1400 || e.x < -900 || e.x > W + 900)) {
        e.dead = true;
        e.exited = true;
        if (def.onExit) {
          try { def.onExit(e); } catch (err) { report(label + ' onExit', err); }
        }
      }
    }
  }

  function escape(e) {
    e.dead = true;
    e.escaped = true;
    if (e.def.onExit) {
      try { e.def.onExit(e); } catch (err) { report('enemy "' + e.typeId + '" onExit', err); }
    }
  }

  function updateEnemies(dt) {
    const list = world.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      // position at the start of the step: collisions sweep bullets in the enemy's frame of reference
      e.lx = e.x;
      e.ly = e.y;
      e.age += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.isBoss) updateBoss(e, dt);
      else if (e.def.update) {
        try { e.def.update(e, dt); } catch (err) { report('enemy "' + e.typeId + '" update', err); e.dead = true; continue; }
      }
      if (e.dead) continue;
      if (!e.def.manualMove) { e.x += e.vx * dt; e.y += e.vy * dt; }
      if (e.x !== e.x || e.y !== e.y) {
        // NaN position: it could never be hit, culled or cleared (waitClear would hang)
        U.warnOnce('enemy-nan:' + e.typeId, 'enemy "' + e.typeId + '" position became NaN; removed');
        if (e.isBoss) { e.x = W / 2; e.y = 300; } else { e.dead = true; continue; }
      }
      if (!e.entered && e.x > 0 && e.x < W && e.y > 0 && e.y < H) e.entered = true;
      if (e.isBoss) continue;
      const r = e.r || 0;
      if (e.entered && e.offscreenKill && (e.y > H + r + 60 || e.x < -r - 60 || e.x > W + r + 60 || e.y < -r - 420)) escape(e);
      else if ((!e.entered && e.age > 30) || e.y < -1500 || e.y > H + 1200 || e.x < -1200 || e.x > W + 1200) escape(e);
    }
  }

  function updatePickups(dt) {
    const list = world.pickups;
    for (let i = 0; i < list.length; i++) {
      const pk = list[i];
      if (pk.dead) continue;
      pk.age += dt;
      const def = pk.def;
      if (def.update) {
        try { def.update(pk, dt); } catch (err) { report('pickup "' + pk.typeId + '" update', err); pk.dead = true; continue; }
      } else {
        const f = 1 / (1 + 2.2 * dt);
        pk.vx *= f;
        pk.vy = U.approach(pk.vy, 70, 320 * dt);
      }
      if (def.magnet !== false) {
        const mul = typeof def.magnet === 'number' ? def.magnet : 1;
        for (const p of world.players) {
          if (!p.alive || p.down || p.display) continue;
          const mr = ((p.stats && p.stats.magnet) || 90) * mul;
          const dx = p.x - pk.x, dy = p.y - pk.y, d2 = dx * dx + dy * dy;
          if (d2 < mr * mr && d2 > 1) {
            const d = Math.sqrt(d2);
            const sp = 380 + 900 * (1 - d / mr);
            pk.vx = U.lerp(pk.vx, (dx / d) * sp, Math.min(1, 9 * dt));
            pk.vy = U.lerp(pk.vy, (dy / d) * sp, Math.min(1, 9 * dt));
            pk.magnetized = true;
            break;
          }
        }
      }
      if (!def.manualMove) { pk.x += pk.vx * dt; pk.y += pk.vy * dt; }
      if (!pk.magnetized) pk.x = U.clamp(pk.x, 18, W - 18);
      if (pk.life && pk.age >= pk.life) pk.dead = true;
      if (pk.y > H + 60 || pk.y < -400) pk.dead = true;
    }
  }

  function updateBeams(dt) {
    for (const bm of world.beams) {
      if (bm.dead) continue;
      bm.hitLength = null;
      bm.hitX = null;
      bm.hitY = null;
      if (bm.update) {
        try { bm.update(bm, dt); } catch (err) { report('player beam update', err); bm.dead = true; }
      }
    }
  }

  const hitBuf = [];
  function collide(dt) {
    const enemies = world.enemies, players = world.players;
    // player bullets vs enemies and shootable props: swept along this step's motion, nearest contact first
    for (const b of world.pbullets) {
      if (b.dead) continue;
      const ax = b.px != null ? b.px : b.x, ay = b.py != null ? b.py : b.y;
      let n = 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.dead || e.dying || e.y + e.r < 0 || e.intangible) continue;
        if (b.pierce && b.hitIds.indexOf(e.id) >= 0) continue;
        const t = sweepTest(e, ax, ay, b.x, b.y, b.r);
        if (t < 0) continue;
        let h = hitBuf[n];
        if (!h) h = hitBuf[n] = { e: null, t: 0, x: 0, y: 0 };
        h.e = e; h.t = t; h.x = sweepX; h.y = sweepY;
        n++;
      }
      if (n > 1) {
        for (let i = 1; i < n; i++) {
          const h = hitBuf[i];
          let j = i - 1;
          while (j >= 0 && hitBuf[j].t > h.t) { hitBuf[j + 1] = hitBuf[j]; j--; }
          hitBuf[j + 1] = h;
        }
      }
      for (let k = 0; k < n; k++) {
        const h = hitBuf[k], e = h.e;
        h.e = null;
        if (b.dead || e.dead || e.dying) continue;
        if (b.pierce) {
          b.hitIds.push(e.id);
          if (b.pierce !== true && typeof b.pierce === 'number') { b.pierce--; if (b.pierce <= 0) b.dead = true; }
        } else b.dead = true;
        const dealt = SL.damageEnemy(e, b.dmg, { by: b.owner, x: h.x, y: h.y, type: b.typeId });
        if (!b.type.noHitFx && (dealt > 0 || !e.invuln)) SL.fx.hit(h.x, h.y, b.color, { dir: b.angle + Math.PI });
        if (b.onHit) {
          try { b.onHit(b, e); } catch (err) { report('pbullet onHit', err); b.onHit = null; }
        }
      }
      if (b.dead) continue;
      for (const pr of world.props) {
        if (pr.dead || !pr.def.shootable) continue;
        if (sweepTest(pr, ax, ay, b.x, b.y, b.r) < 0) continue;
        b.dead = true;
        SL.fx.hit(sweepX, sweepY, b.color, { dir: b.angle + Math.PI });
        pr.hp -= b.dmg;
        pr.flash = 0.06;
        if (pr.def.onHit) { try { pr.def.onHit(pr, b.dmg, b); } catch (err) { report('prop onHit', err); } }
        if (pr.hp <= 0 && !pr.dead) {
          pr.dead = true;
          if (pr.def.onDeath) { try { pr.def.onDeath(pr); } catch (err) { report('prop onDeath', err); } } else SL.fx.explode(pr.x, pr.y, { size: pr.r > 50 ? 'm' : 's', palette: pr.def.palette || 'enemy' });
        }
        break;
      }
    }
    // enemy bullets vs players, pods, allies, blocking props
    for (const b of world.ebullets) {
      if (b.dead || b.delay > 0) continue;
      let ax = b.px != null ? b.px : b.x, ay = b.py != null ? b.py : b.y;
      const mx = b.x - ax, my = b.y - ay;
      if (mx * mx + my * my > 25600) { ax = b.x; ay = b.y; }
      for (const p of players) {
        if (!p.alive || p.down || p.display) continue;
        if (sweepCircle(ax, ay, b.x, b.y, p.x, p.y, (p.hitR || 7) + b.r) >= 0) {
          if (p.invuln > 0 && !p.grazeImmune) continue;
          b.dead = true;
          SL.damagePlayer(p, b.damage, { source: 'bullet', bullet: b });
          break;
        }
      }
      if (b.dead) continue;
      for (const pod of world.pods) {
        if (pod.dead || !pod.def.onBullet) continue;
        const rr = pod.r + b.r, dx = pod.x - b.x, dy = pod.y - b.y;
        if (dx * dx + dy * dy < rr * rr) {
          let consumed = true;
          try { consumed = pod.def.onBullet(pod, b) !== false; } catch (err) { report('pod onBullet', err); }
          if (consumed) { b.dead = true; break; }
        }
      }
      if (b.dead) continue;
      for (const a of world.allies) {
        if (a.dead || !a.def.hittable) continue;
        const rr = a.r + b.r, dx = a.x - b.x, dy = a.y - b.y;
        if (dx * dx + dy * dy < rr * rr) {
          b.dead = true;
          if (a.def.onHit) { try { a.def.onHit(a, b.damage, b); } catch (err) { report('ally onHit', err); } } else {
            a.hp -= b.damage;
            a.flash = 0.06;
            if (a.hp <= 0) { a.dead = true; SL.fx.explode(a.x, a.y, { size: 'm', palette: 'player' }); }
          }
          break;
        }
      }
      if (b.dead) continue;
      for (const pr of world.props) {
        if (pr.dead || !pr.def.blocksBullets) continue;
        if (hitTest(pr, b.x, b.y, b.r)) { b.dead = true; break; }
      }
    }
    // enemy bodies vs players
    for (const e of enemies) {
      if (e.dead || e.dying || e.intangible) continue;
      const cd = e.contactDamage;
      if (!cd) continue;
      for (const p of players) {
        if (!p.alive || p.down || p.display) continue;
        if (!hitTest(e, p.x, p.y, p.r)) continue;
        if (p.invuln > 0) continue;
        SL.damagePlayer(p, cd, { source: 'contact', enemy: e });
        if (!e.isBoss && !e.def.noRam) SL.damageEnemy(e, e.def.ramDamage != null ? e.def.ramDamage : 60, { by: p, type: 'ram', x: p.x, y: p.y - 10 });
        if (e.dead || e.dying) break;
      }
    }
    // enemy beams vs players
    for (const bm of world.ebeams) {
      if (bm.dead || bm.state !== 'active') continue;
      const ex = bm.x + Math.cos(bm.angle) * bm.length, ey = bm.y + Math.sin(bm.angle) * bm.length;
      for (const p of players) {
        if (!p.alive || p.down || p.display) continue;
        const rr = bm.width * 0.4 + (p.hitR || 7);
        if (segDist2(p.x, p.y, bm.x, bm.y, ex, ey) < rr * rr) SL.damagePlayer(p, bm.dps * dt, { source: 'beam', continuous: true });
      }
    }
    // player beams vs enemies
    for (const bm of world.beams) {
      if (bm.dead || !bm.active) continue;
      const len = bm.length || 1400;
      const ex = bm.x + Math.cos(bm.angle) * len, ey = bm.y + Math.sin(bm.angle) * len;
      const half = (bm.width || 20) * 0.5;
      if (bm.pierce) {
        for (const e of enemies) {
          if (e.dead || e.dying || e.y + e.r < 0 || e.intangible) continue;
          const t = beamHit(e, bm.x, bm.y, ex, ey, half);
          if (t >= 0) {
            SL.damageEnemy(e, (bm.dps || 300) * dt, { by: bm.owner, type: 'beam' });
            if (Math.random() < 0.25) {
              const d = t * len;
              SL.fx.hit(bm.x + Math.cos(bm.angle) * d + (Math.random() - 0.5) * beamHitR, bm.y + Math.sin(bm.angle) * d, bm.color || '#7fe3ff', { dir: bm.angle + Math.PI });
            }
          }
        }
      } else {
        let best = null, bt = 2, br = 0;
        for (const e of enemies) {
          if (e.dead || e.dying || e.y + e.r < 0 || e.intangible) continue;
          const t = beamHit(e, bm.x, bm.y, ex, ey, half);
          if (t >= 0 && t < bt) { bt = t; best = e; br = beamHitR; }
        }
        if (best) {
          bm.hitLength = Math.max(0, bt * len - br * 0.6);
          bm.hitX = bm.x + Math.cos(bm.angle) * bm.hitLength;
          bm.hitY = bm.y + Math.sin(bm.angle) * bm.hitLength;
          SL.damageEnemy(best, (bm.dps || 300) * dt, { by: bm.owner, type: 'beam' });
          if (Math.random() < 0.35) SL.fx.hit(bm.hitX, bm.hitY, bm.color || '#7fe3ff', { dir: bm.angle + Math.PI });
        }
      }
    }
    // players vs pickups, pods, touchable props
    for (const p of players) {
      if (!p.alive || p.down || p.display) continue;
      for (const pk of world.pickups) {
        if (pk.dead) continue;
        const rr = p.r + pk.r, dx = p.x - pk.x, dy = p.y - pk.y;
        if (dx * dx + dy * dy < rr * rr) collect(pk, p);
      }
      for (const pod of world.pods) {
        if (pod.dead || !pod.def.onTouch) continue;
        const rr = p.r + pod.r + 18, dx = p.x - pod.x, dy = p.y - pod.y;
        if (dx * dx + dy * dy < rr * rr) {
          try { pod.def.onTouch(pod, p); } catch (err) { report('pod onTouch', err); pod.dead = true; }
        }
      }
      for (const pr of world.props) {
        if (pr.dead || (!pr.def.onTouch && !pr.def.contactDamage)) continue;
        if (!hitTest(pr, p.x, p.y, p.r)) continue;
        if (pr.def.onTouch) { try { pr.def.onTouch(pr, p); } catch (err) { report('prop onTouch', err); } }
        if (pr.def.contactDamage && p.invuln <= 0) SL.damagePlayer(p, pr.def.contactDamage, { source: 'prop' });
      }
    }
  }

  function collect(pk, p) {
    const def = pk.def;
    if (def.apply) {
      let res;
      try { res = def.apply(p, pk); } catch (err) { report('pickup "' + pk.typeId + '" apply', err); }
      if (res === false) return;
    }
    pk.dead = true;
    pk.collectedBy = p;
    SL.bus.emit('pickup', { p, pk, id: pk.typeId });
  }

  function compact(list, pool, keys) {
    let j = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.dead) list[j++] = e;
      else if (pool) recycle(e, pool, keys);
    }
    list.length = j;
  }
  /** Returns a dead bullet to its pool unless content gave it extra own fields (then the GC takes it). */
  function recycle(b, pool, keys) {
    b.owner = null; b.data = null; b.update = null; b.onHit = null; b.split = null;
    if (keys && keyCount(b) === keys && pool.length < 2000) pool.push(b);
  }
  function compactHazards() {
    const list = world.hazards;
    let j = 0;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (!h.dead) { list[j++] = h; continue; }
      if (h.def.onEnd) {
        try { h.def.onEnd(h); } catch (err) { report('hazard "' + h.typeId + '" onEnd', err); }
      }
    }
    list.length = j;
  }

  world.update = function (dt) {
    world.dt = dt;
    world.t += dt;
    const sc = world.scroll;
    sc.speed = U.approach(sc.speed, sc.target, 240 * dt);
    sc.y += sc.speed * dt;
    const bg = world.bg;
    if (bg) {
      bg.t += dt;
      if (bg.def && bg.def.update && !bg.broken) {
        try { bg.def.update(bg, dt, sc); } catch (err) { report('background "' + bg.id + '" update', err); bg.broken = true; }
      }
    }
    for (const h of world.hazards) {
      if (h.dead) continue;
      h.age += dt;
      if (h.def.update) {
        try { h.def.update(h, dt); } catch (err) { report('hazard "' + h.typeId + '" update', err); h.dead = true; continue; }
      }
      if (!h.def.manualMove) { h.x += h.vx * dt; h.y += h.vy * dt; }
      if (h.y > H + 1400 || h.y < -2000 || h.x < -1400 || h.x > W + 1400 || h.x !== h.x || h.y !== h.y) h.dead = true;
    }
    for (const p of world.players) {
      try { SL.player.update(p, dt); } catch (err) { report('player update', err); }
    }
    updateEntityList(world.allies, 'ally', dt, 0);
    updateEnemies(dt);
    updateEnemyBullets(dt);
    updatePlayerBullets(dt);
    updateBeams(dt);
    updateEnemyBeams(dt);
    updatePickups(dt);
    updateEntityList(world.pods, 'pod', dt, 80);
    updateEntityList(world.props, 'prop', dt, 220);
    collide(dt);
    compact(world.enemies);
    compact(world.ebullets, ebPool, EB_KEYS);
    compact(world.pbullets, pbPool, PB_KEYS);
    compact(world.beams);
    compact(world.ebeams);
    compact(world.pickups);
    compact(world.pods);
    compact(world.props);
    compact(world.allies);
    compactHazards();
  };

  // ------------------------------------------------------------------ draw
  function resetCtx(ctx) {
    const b = SL.render.base;
    ctx.setTransform(b.s, 0, 0, b.s, b.x, b.y);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // state that would make every later draw of the frame slow (or wrong) if a hook leaked it
    if (ctx.shadowBlur) ctx.shadowBlur = 0;
    if (ctx.filter && ctx.filter !== 'none') ctx.filter = 'none';
    if (!ctx.imageSmoothingEnabled) ctx.imageSmoothingEnabled = true;
  }

  world.drawDefault = function (e, ctx) {
    const key = e.sprite || e.def.sprite;
    if (!key) {
      ctx.fillStyle = '#ff00ff';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r || 10, 0, TAU);
      ctx.fill();
      return;
    }
    const s = SL.art.get(key);
    SL.art.drawSprite(ctx, s, e.x, e.y, e.rot || 0, e.scale || 1, e.alpha == null ? 1 : e.alpha);
    if (e.flash > 0) SL.art.drawFlash(ctx, s, e.x, e.y, e.rot || 0, e.scale || 1, Math.min(1, e.flash / 0.06) * (e.isBoss ? 0.22 : 0.6));
  };

  function drawEntity(e, ctx, label) {
    if (e.dead || e.hidden) return;
    if (e.def.draw) {
      if (e._drawBroken) { world.drawDefault(e, ctx); return; }
      try { e.def.draw(e, ctx); } catch (err) { report(label + ' "' + (e.typeId || e.def.id || '?') + '" draw', err); e._drawBroken = true; }
      resetCtx(ctx);
    } else world.drawDefault(e, ctx);
  }

  function drawPickup(pk, ctx) {
    if (pk.dead) return;
    const blink = pk.life && pk.life - pk.age < 2 && Math.floor(pk.age * 10) % 2 === 0;
    if (blink) return;
    if (pk.def.draw) {
      try { pk.def.draw(pk, ctx); } catch (err) { report('pickup "' + pk.typeId + '" draw', err); pk.def = Object.assign({}, pk.def, { draw: null }); }
      resetCtx(ctx);
      return;
    }
    const key = pk.def.sprite;
    const y = pk.y + Math.sin(pk.age * 4 + pk.bob) * 3;
    if (key) SL.art.drawSprite(ctx, key, pk.x, y, 0, 1, 1);
    else SL.art.drawGlow(ctx, pk.x, y, pk.r * 1.4, pk.def.color || '#ffffff', 1);
  }

  function drawPlayerBullets(ctx) {
    const b0 = SL.render.base, bs = b0.s, bx = b0.x, by = b0.y;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of world.pbullets) {
      if (b.dead) continue;
      const t = b.type;
      if (t.draw && !t._drawBroken) {
        try { t.draw(b, ctx); } catch (err) { report('pbullet "' + b.typeId + '" draw', err); t._drawBroken = true; }
        ctx.setTransform(bs, 0, 0, bs, bx, by);
        ctx.globalCompositeOperation = 'lighter';
        if (ctx.shadowBlur) ctx.shadowBlur = 0;
        continue;
      }
      // bullets fired while their type had a draw hook (now broken) or a missing sprite get the default bolt
      const s = b.spr || (b.spr = pbSpriteFor(t));
      const w = s.cw * b.scale, h = s.ch * b.scale;
      ctx.globalAlpha = b.alpha;
      if (t.orient !== false) {
        const c = Math.cos(b.angle) * bs, sn = Math.sin(b.angle) * bs;
        ctx.setTransform(c, sn, -sn, c, bx + b.x * bs, by + b.y * bs);
        ctx.drawImage(s.canvas, -w / 2, -h / 2, w, h);
      } else {
        ctx.setTransform(bs, 0, 0, bs, bx, by);
        ctx.drawImage(s.canvas, b.x - w / 2, b.y - h / 2, w, h);
      }
    }
    ctx.setTransform(bs, 0, 0, bs, bx, by);
    ctx.globalAlpha = 1;
    for (const bm of world.beams) {
      if (bm.dead || !bm.active) continue;
      if (bm.draw) {
        try { bm.draw(bm, ctx); } catch (err) { report('player beam draw', err); bm.draw = null; }
      } else drawPlayerBeamDefault(bm, ctx);
      ctx.setTransform(bs, 0, 0, bs, bx, by);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawEnemyBullets(ctx) {
    const b0 = SL.render.base, bs = b0.s, bx = b0.x, by = b0.y;
    const beamType = SL.ebulletTypes.defs.beam;
    for (const bm of world.ebeams) {
      if (bm.dead) continue;
      const custom = beamType && beamType.draw && !beamType._drawBroken ? beamType.draw : null;
      if (custom) {
        try { custom(bm, ctx); } catch (err) { report('enemy beam draw', err); beamType._drawBroken = true; resetCtx(ctx); drawEnemyBeamDefault(bm, ctx); }
      } else drawEnemyBeamDefault(bm, ctx);
      resetCtx(ctx);
    }
    for (const b of world.ebullets) {
      if (b.dead) continue;
      const t = b.type;
      if (t.draw && !t._drawBroken) {
        try { t.draw(b, ctx); } catch (err) { report('ebullet "' + b.typeId + '" draw', err); t._drawBroken = true; }
        ctx.setTransform(bs, 0, 0, bs, bx, by);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if (ctx.shadowBlur) ctx.shadowBlur = 0;
        continue;
      }
      // never invisible: a bullet whose type's draw hook broke falls back to its sprite or an orb
      const s = b.spr || (b.spr = ebSpriteFor(t, b.typeId, b.color));
      let sc = b.scale;
      if (b.delay > 0 && b.delay0 > 0) {
        const k = 1 - b.delay / b.delay0;
        sc *= 0.35 + 0.65 * k;
        ctx.globalAlpha = 0.45 + 0.4 * k;
      } else ctx.globalAlpha = 1;
      const w = s.cw * sc, h = s.ch * sc;
      if (b.rot) {
        const c = Math.cos(b.rot) * bs, sn = Math.sin(b.rot) * bs;
        ctx.setTransform(c, sn, -sn, c, bx + b.x * bs, by + b.y * bs);
        ctx.drawImage(s.canvas, -w / 2, -h / 2, w, h);
        ctx.setTransform(bs, 0, 0, bs, bx, by);
      } else ctx.drawImage(s.canvas, b.x - w / 2, b.y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }

  world.draw = function (ctx) {
    resetCtx(ctx);
    const bg = world.bg;
    if (bg && bg.def && bg.def.draw && !bg.drawBroken) {
      try { bg.def.draw(bg, ctx); } catch (err) { report('background "' + bg.id + '" draw', err); bg.drawBroken = true; }
    } else {
      ctx.fillStyle = '#05060f';
      ctx.fillRect(0, 0, W, H);
    }
    resetCtx(ctx);
    for (const h of world.hazards) {
      if (h.dead || !h.def.drawUnder) continue;
      try { h.def.drawUnder(h, ctx); } catch (err) { report('hazard "' + h.typeId + '" drawUnder', err); h.def = Object.assign({}, h.def, { drawUnder: null }); }
      resetCtx(ctx);
    }
    for (const pr of world.props) drawEntity(pr, ctx, 'prop');
    for (const pod of world.pods) drawEntity(pod, ctx, 'pod');
    for (const pk of world.pickups) drawPickup(pk, ctx);
    resetCtx(ctx);
    for (const e of world.enemies) if (!e.isBoss) drawEntity(e, ctx, 'enemy');
    for (const e of world.enemies) if (e.isBoss) drawEntity(e, ctx, 'boss');
    for (const a of world.allies) drawEntity(a, ctx, 'ally');
    for (const p of world.players) {
      try { SL.player.draw(p, ctx); } catch (err) { report('player draw', err); }
      resetCtx(ctx);
    }
    drawPlayerBullets(ctx);
    resetCtx(ctx);
    SL.fx.draw(ctx);
    resetCtx(ctx);
    drawEnemyBullets(ctx);
    resetCtx(ctx);
    for (const h of world.hazards) {
      if (h.dead || !h.def.drawOver) continue;
      try { h.def.drawOver(h, ctx); } catch (err) { report('hazard "' + h.typeId + '" drawOver', err); h.def = Object.assign({}, h.def, { drawOver: null }); }
      resetCtx(ctx);
    }
  };

  world.counts = function () {
    return {
      enemies: world.enemies.length, ebullets: world.ebullets.length, pbullets: world.pbullets.length,
      beams: world.beams.length, ebeams: world.ebeams.length, pickups: world.pickups.length, pods: world.pods.length,
      hazards: world.hazards.length, props: world.props.length, allies: world.allies.length,
      particles: SL.fx ? SL.fx.count() : 0,
    };
  };

  // ------------------------------------------------------------------ core 'default' background
  // Deep-space parallax: base gradient, two scrolling nebula layers (periodic fbm noise, seamless when
  // tiled), a pre-rendered far star tile, twinkling mid and near stars, faint speed dust. Phases tint
  // the sky with a soft color wash: 'default', 'calm', 'danger', 'boss', 'warp'.
  const BG_TINTS = {
    default: { color: '#2a3c8f', a: 0.0 },
    calm: { color: '#1d6f7a', a: 0.22 },
    danger: { color: '#8f1f3a', a: 0.3 },
    boss: { color: '#6a2a9a', a: 0.32 },
    warp: { color: '#3fc8ff', a: 0.25 },
  };
  const STAR_COLORS = ['#ffffff', '#dbe8ff', '#cfe0ff', '#fff3dc', '#e8f2ff', '#bcd6ff'];

  function makeStarTile(seed) {
    const A = SL.art, rng = SL.makeRng(seed);
    const c = A.canvas(W, H), x = c.getContext('2d');
    for (let i = 0; i < 300; i++) {
      const sx = rng.next() * W, sy = rng.next() * H, r = rng.range(0.35, 1.05);
      x.globalAlpha = rng.range(0.25, 0.8);
      x.fillStyle = STAR_COLORS[rng.int(0, STAR_COLORS.length - 1)];
      x.beginPath();
      x.arc(sx, sy, r, 0, TAU);
      x.fill();
    }
    for (let i = 0; i < 28; i++) {
      const sx = rng.next() * W, sy = rng.next() * H;
      x.globalAlpha = rng.range(0.15, 0.35);
      x.drawImage(A.glow('#9fc0ff', 8), sx - 8, sy - 8, 16, 16);
    }
    x.globalAlpha = 1;
    return c;
  }

  function makeFlareSprite() {
    const A = SL.art;
    const c = A.canvas(48, 48), x = c.getContext('2d');
    x.globalCompositeOperation = 'lighter';
    x.drawImage(A.glow('#bcd4ff', 12), 12, 12, 24, 24);
    const ray = (w, h) => {
      const g = x.createLinearGradient(24 - w / 2, 0, 24 + w / 2, 0);
      g.addColorStop(0, 'rgba(190,215,255,0)');
      g.addColorStop(0.5, 'rgba(235,244,255,0.75)');
      g.addColorStop(1, 'rgba(190,215,255,0)');
      x.fillStyle = g;
      x.fillRect(24 - w / 2, 24 - h / 2, w, h);
    };
    ray(46, 1.4);
    x.save();
    x.translate(24, 24);
    x.rotate(Math.PI / 2);
    x.translate(-24, -24);
    ray(34, 1.2);
    x.restore();
    return c;
  }

  SL.backgrounds.define('default', {
    init(bg, opts) {
      const A = SL.art;
      const d = bg.data;
      const seed = (opts && opts.seed) || 11;
      d.nebA = A.noiseCanvas(180, 320, {
        scale: 90, octaves: 5, seed, warp: 0.32,
        palette: [[0, '#05070f', 0], [0.42, '#0a1230', 0], [0.62, '#16205a', 0.42], [0.8, '#2a2470', 0.62], [0.93, '#4a3290', 0.75], [1, '#6f56b8', 0.85]],
      });
      d.nebB = A.noiseCanvas(180, 320, {
        scale: 60, octaves: 4, seed: seed + 3, ridged: true, warp: 0.18,
        palette: [[0, '#000000', 0], [0.55, '#0c2a3a', 0], [0.78, '#0f4a5e', 0.35], [0.92, '#2a6f8f', 0.55], [1, '#7fb8e0', 0.7]],
      });
      d.stars = makeStarTile(seed + 5);
      d.flare = makeFlareSprite();
      const rng = SL.makeRng(seed + 9);
      d.mid = [];
      for (let i = 0; i < 70; i++) {
        d.mid.push({ x: rng.next() * W, y: rng.next() * H, s: rng.range(1.6, 3.2), a: rng.range(0.35, 0.8), tw: rng.range(1.2, 3.4), ph: rng.next() * TAU, c: STAR_COLORS[rng.int(0, 5)] });
      }
      d.near = [];
      for (let i = 0; i < 18; i++) {
        d.near.push({ x: rng.next() * W, y: rng.next() * H, s: rng.range(2.4, 4.2), a: rng.range(0.55, 0.95), tw: rng.range(0.7, 2.2), ph: rng.next() * TAU, flare: rng.chance(0.35), c: STAR_COLORS[rng.int(0, 5)] });
      }
      d.dust = [];
      for (let i = 0; i < 12; i++) d.dust.push({ x: rng.next() * W, y: rng.next() * H, len: rng.range(40, 120), a: rng.range(0.05, 0.13) });
      d.oA = 0; d.oB = 0; d.oS = 0; d.oM = 0; d.oN = 0; d.oD = 0;
      d.tint = { color: BG_TINTS.default.color, a: 0 };
      d.tintTarget = BG_TINTS[bg.phase] || BG_TINTS.default;
      d.wash = null;
      const ctx = SL.render.ctx;
      d.base = ctx.createLinearGradient(0, 0, 0, H);
      d.base.addColorStop(0, '#070a1c');
      d.base.addColorStop(0.55, '#04050d');
      d.base.addColorStop(1, '#080616');
      d.starGlow = A.glow('#cfe0ff', 32);
    },
    update(bg, dt, scroll) {
      const d = bg.data, v = scroll ? scroll.speed : 90;
      d.oA = (d.oA + v * 0.05 * dt) % H;
      d.oB = (d.oB + v * 0.11 * dt) % H;
      d.oS = (d.oS + v * 0.22 * dt) % H;
      d.oM = v * 0.45 * dt;
      d.oN = v * 0.85 * dt;
      d.oD = v * 2.4 * dt;
      for (const s of d.mid) { s.y += d.oM; if (s.y > H + 4) { s.y -= H + 8; s.x = Math.random() * W; } }
      for (const s of d.near) { s.y += d.oN; if (s.y > H + 8) { s.y -= H + 16; s.x = Math.random() * W; } }
      for (const s of d.dust) { s.y += d.oD; if (s.y > H + s.len) { s.y = -s.len; s.x = Math.random() * W; } }
      const tt = d.tintTarget;
      if (tt.color !== d.tint.color) {
        d.tint.a = U.approach(d.tint.a, 0, dt * 0.6);
        if (d.tint.a <= 0) { d.tint.color = tt.color; d.wash = null; }
      } else d.tint.a = U.approach(d.tint.a, tt.a, dt * 0.4);
    },
    draw(bg, ctx) {
      const d = bg.data, t = bg.t;
      ctx.fillStyle = d.base;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(d.nebA, 0, d.oA - H, W, H);
      ctx.drawImage(d.nebA, 0, d.oA, W, H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(d.nebB, 0, d.oB - H, W, H);
      ctx.drawImage(d.nebB, 0, d.oB, W, H);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(d.stars, 0, d.oS - H);
      ctx.drawImage(d.stars, 0, d.oS);
      if (d.tint.a > 0.004) {
        if (!d.wash) {
          const c = SL.art.canvas(90, 160), x = c.getContext('2d');
          const g = x.createRadialGradient(45, 20, 4, 45, 40, 150);
          g.addColorStop(0, C.rgba(d.tint.color, 0.9));
          g.addColorStop(0.5, C.rgba(d.tint.color, 0.35));
          g.addColorStop(1, C.rgba(d.tint.color, 0));
          x.fillStyle = g;
          x.fillRect(0, 0, 90, 160);
          d.wash = c;
        }
        ctx.globalAlpha = d.tint.a;
        ctx.drawImage(d.wash, 0, 0, W, H);
      }
      const glow = d.starGlow;
      for (const s of d.mid) {
        const a = s.a * (0.65 + 0.35 * Math.sin(t * s.tw + s.ph));
        ctx.globalAlpha = a;
        const r = s.s * 2.2;
        ctx.drawImage(glow, s.x - r, s.y - r, r * 2, r * 2);
      }
      for (const s of d.near) {
        const a = s.a * (0.6 + 0.4 * Math.sin(t * s.tw + s.ph));
        ctx.globalAlpha = a;
        const r = s.s * 2.6;
        ctx.drawImage(glow, s.x - r, s.y - r, r * 2, r * 2);
        if (s.flare) {
          ctx.globalAlpha = a * 0.7;
          ctx.drawImage(d.flare, s.x - 18, s.y - 18, 36, 36);
        }
      }
      ctx.fillStyle = '#9fb8ff';
      for (const s of d.dust) {
        ctx.globalAlpha = s.a;
        ctx.fillRect(s.x, s.y, 1, s.len);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
    setPhase(bg, name) {
      bg.data.tintTarget = BG_TINTS[name] || BG_TINTS.default;
    },
  });

  SL.onBoot(defineCoreArt);
})(window.SL = window.SL || {});
