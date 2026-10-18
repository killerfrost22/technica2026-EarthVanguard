/* 08_player.js (core)
   Provides: SL.player = { create(index, stats), update(p, dt), draw(p, ctx), push(p, ax, ay, dt), heal(p, n),
   addShield(p, n), addBomb(p, n), bomb(p), respawn(p), revive(p, x, y), kill(p), defaultStats(), statsFor(index),
   drawPlaceholder(p, ctx) }.
   Movement is instant (560 px/s, focus 260) from SL.input.players[i] axes plus pointer drag, clamped 16 px
   inside the playfield, with an external push velocity that decays at 3/s. Banking is visual only.
   Firing goes through SL.weapons.update(p, dt) (p.firing says whether to shoot this frame); bombs are a
   2 s nova; skills go through SL.skills. Down logic: solo spends a life and respawns after 1.2 s; co-op with a
   partner alive ejects a pilot pod the partner can fly over within stats.reviveTime to revive. */
(function (SL) {
  'use strict';

  const U = SL.util, C = SL.color;
  const W = SL.W, H = SL.H, TAU = U.TAU;
  const MARGIN = 16;

  const DEFAULT_STATS = {
    maxHull: 100, shield: 0, maxShield: 60, bombs: 2, maxBombs: 5, speed: 560, focusSpeed: 260, fireRateMul: 1,
    damageMul: 1, magnet: 90, missileStart: 0, weaponStart: { type: 'pulse', level: 1 }, gravityResist: 0,
    damageTaken: 1, bonusLives: 0, creditMul: 1, regen: 0, reviveTime: 8,
  };

  function settings() { return (SL.save && SL.save.settings) || {}; }
  function session() { return SL.game && SL.game.session; }

  /** Merged stats with every numeric default kept finite (a NaN from a progress formula would freeze or hide the
      jet), weaponStart kept valid, and the bomb / shield caps consistent. */
  function sanitize(st) {
    for (const k in DEFAULT_STATS) {
      const d = DEFAULT_STATS[k];
      if (typeof d === 'number' && !(typeof st[k] === 'number' && isFinite(st[k]))) {
        U.warnOnce('stat:' + k, 'player stat "' + k + '" is not a finite number (' + st[k] + '); using ' + d);
        st[k] = d;
      }
    }
    if (!(st.maxHull > 0)) st.maxHull = DEFAULT_STATS.maxHull;
    if (!(st.speed > 0)) st.speed = DEFAULT_STATS.speed;
    if (!(st.focusSpeed > 0)) st.focusSpeed = DEFAULT_STATS.focusSpeed;
    if (st.maxShield < 0) st.maxShield = 0;
    if (st.maxBombs < 0) st.maxBombs = 0;
    const ws = st.weaponStart;
    if (!ws || typeof ws !== 'object') st.weaponStart = { type: 'pulse', level: 1 };
    else {
      if (typeof ws.type !== 'string' || !ws.type) ws.type = 'pulse';
      if (!(ws.level >= 1)) ws.level = 1;
    }
    return st;
  }
  function spawnX(index, coop) { return coop ? (index === 0 ? W / 2 - 110 : W / 2 + 110) : W / 2; }

  const P = SL.player = {
    defaultStats() { return U.deepMerge(DEFAULT_STATS, null); },

    /** Stats for a player index from SL.progress.playerStats when available, merged over defaults. */
    statsFor(index) {
      let st = null;
      if (SL.progress && typeof SL.progress.playerStats === 'function') {
        try { st = SL.progress.playerStats(SL.save.data, index); } catch (err) { console.error('[SL.player] progress.playerStats threw:', err); }
      }
      return sanitize(U.deepMerge(DEFAULT_STATS, st || {}));
    },

    create(index, stats) {
      const st = sanitize(U.deepMerge(DEFAULT_STATS, stats || {}));
      const s = session();
      const coop = !!(s && s.coop);
      const ws = st.weaponStart || DEFAULT_STATS.weaponStart;
      const save = (SL.save && SL.save.data) || {};
      const p = {
        kind: 'player', id: U.uid(), index, def: null, team: 'player',
        x: spawnX(index, coop), y: H - 190, vx: 0, vy: 0, r: 22, hitR: 7, rot: 0, scale: 1, alpha: 1,
        hull: st.maxHull, maxHull: st.maxHull, shield: Math.min(st.shield || 0, st.maxShield), maxShield: st.maxShield,
        bombs: Math.min(st.bombs, st.maxBombs), maxBombs: st.maxBombs,
        weapon: { type: ws.type || 'pulse', level: U.clamp(ws.level || 1, 1, 5) },
        missiles: U.clamp(st.missileStart || 0, 0, 3),
        invuln: 0, alive: true, down: false, out: false, focus: false, firing: false, bank: 0,
        push: { x: 0, y: 0 }, stats: st,
        skill: { id: (save.skills && save.skills.equipped && save.skills.equipped[index]) || null, cooldown: 0, active: false, t: 0 },
        age: 0, flash: 0, hitT: 0, shieldHitT: 0, contT: 0, lowHullArmed: true, respawnT: 0, reviveT: 0, pod: null,
        novaT: 0, state: 'fly', control: true, entering: 0, data: {},
        callsign: index === 0 ? save.callsign || 'Blue Arrow' : save.p2callsign || 'P2',
        palette: index === 0 ? SL.pal.player : SL.pal.player2,
        fireT: 0, gun: 0,
      };
      return p;
    },

    update(p, dt) {
      p.age += dt;
      if (p.display) return;
      if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
      if (p.hitT > 0) p.hitT -= dt;
      if (p.shieldHitT > 0) p.shieldHitT -= dt;
      if (p.contT > 0) p.contT -= dt;
      if (p.flash > 0) p.flash -= dt;

      if (!p.alive) { updateDown(p, dt); return; }

      const inp = (SL.input && SL.input.players[p.index]) || {};
      const st = p.stats;
      let vx = 0, vy = 0;
      if (p.control && !p.outro) {
        const spd = inp.focus ? st.focusSpeed : st.speed;
        let mx = inp.mx || 0, my = inp.my || 0;
        const ml = Math.sqrt(mx * mx + my * my);
        if (ml > 1) { mx /= ml; my /= ml; }
        vx = mx * spd;
        vy = my * spd;
        p.x += vx * dt + (inp.dragX || 0);
        p.y += vy * dt + (inp.dragY || 0);
        if (dt > 0 && (inp.dragX || inp.dragY)) { vx += (inp.dragX || 0) / dt; vy += (inp.dragY || 0) / dt; }
        p.focus = !!inp.focus;
      } else p.focus = false;

      if (p.entering > 0) {
        p.entering = Math.max(0, p.entering - dt);
        p.y = U.lerp(p.y, H - 190, Math.min(1, dt * 7));
      }
      if (p.outro) {
        p.data.outroV = (p.data.outroV || 0) + 1500 * dt;
        p.y -= p.data.outroV * dt;
        vy = -p.data.outroV;
        if (p.y < -260) { p.y = -260; p.data.outroV = 0; vy = 0; }
      }

      p.x += p.push.x * dt;
      p.y += p.push.y * dt;
      const decay = Math.exp(-3 * dt);
      p.push.x *= decay;
      p.push.y *= decay;
      p.vx = vx;
      p.vy = vy;
      if (!(isFinite(p.x) && isFinite(p.y))) {
        // a NaN from content (push, drag, scripted move) would lose the jet for good: put it back
        U.warnOnce('player-nan', 'player ' + p.index + ' position became ' + p.x + ',' + p.y + '; reset to the spawn point');
        p.x = spawnX(p.index, !!(session() && session().coop));
        p.y = H - 190;
        p.push.x = p.push.y = 0;
        vx = vy = 0;
        p.vx = p.vy = 0;
      }
      if (!p.outro) {
        p.x = U.clamp(p.x, MARGIN, W - MARGIN);
        p.y = U.clamp(p.y, MARGIN, H - MARGIN);
      }
      const targetBank = U.clamp((vx / Math.max(1, st.speed)) * 0.35, -0.35, 0.35);
      p.bank = U.lerp(p.bank, targetBank, Math.min(1, dt * 10));

      const canFire = p.control && !p.outro && p.entering <= 0.2;
      p.firing = canFire && (settings().autoFire !== false || (SL.input && SL.input.forceAutoFire) || !!inp.fire);
      if (SL.weapons && typeof SL.weapons.update === 'function') {
        try { SL.weapons.update(p, dt); } catch (err) { reportOnce('weapons.update', err); defaultFire(p, dt); }
      } else defaultFire(p, dt);

      if (inp.bomb && p.control && !p.outro) P.bomb(p);
      if (SL.skills) {
        try {
          if (inp.skill && p.control && !p.outro && typeof SL.skills.activate === 'function') SL.skills.activate(p);
          if (typeof SL.skills.update === 'function') SL.skills.update(p, dt);
        } catch (err) { reportOnce('skills', err); }
      }
      if (st.regen > 0 && p.hull < p.maxHull) P.heal(p, st.regen * dt, true);
      if (p.novaT > 0) {
        p.novaT -= dt;
        SL.world.clearEnemyBullets({});
      }
      if (!p.lowHullArmed && p.hull > p.maxHull * 0.4) p.lowHullArmed = true;
    },

    draw(p, ctx) {
      if (!p.alive && !p.display) return;
      const t = SL.time.real;
      const blink = p.invuln > 0 && !p.display && !p.outro && Math.floor(t * 15) % 2 === 0;
      const pa = ctx.globalAlpha;
      if (blink) ctx.globalAlpha = pa * 0.32;
      if (SL.weapons && typeof SL.weapons.drawShip === 'function') {
        try { SL.weapons.drawShip(p, ctx); } catch (err) { reportOnce('weapons.drawShip', err); P.drawPlaceholder(p, ctx); }
      } else P.drawPlaceholder(p, ctx);
      ctx.globalAlpha = pa;
      ctx.globalCompositeOperation = 'source-over';
      const b = SL.render.base;
      ctx.setTransform(b.s, 0, 0, b.s, b.x, b.y);
      if (p.shield > 0 || p.shieldHitT > 0) drawShield(p, ctx, t);
      if (p.novaT > 1.6) {
        const k = (2 - p.novaT) / 0.4;
        SL.art.drawGlow(ctx, p.x, p.y, 60 + 200 * k, '#bfefff', 1 - k);
      }
      const showHit = p.focus || settings().showHitbox === 'always';
      if (showHit && !p.display) {
        // dark backing disc so the dot reads on a white hull, then the white core and a trim ring
        SL.art.drawGlow(ctx, p.x, p.y, 18, p.palette.trim, 0.75);
        ctx.fillStyle = 'rgba(2,8,18,0.85)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.hitR + 2.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.2, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = C.rgba(C.mix(p.palette.trim, '#ffffff', 0.35), 1);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.hitR + 0.6, 0, TAU);
        ctx.stroke();
      }
    },

    drawPlaceholder(p, ctx) {
      const key = 'core:jet' + p.index;
      if (!SL.art.has(key)) {
        const pal = p.palette;
        SL.art.define(key, 60, 72, (c, w, h) => {
          const hull = SL.art.symPath(w / 2, [[0, 2], [7, 22], [9, 40], [28, 58], [28, 64], [9, 62], [6, 70], [0, 66]]);
          SL.art.metal(c, hull, { base: pal.hull, spec: 0.6 });
          SL.art.emissive(c, SL.art.poly([w / 2 - 3, 20, w / 2 + 3, 20, w / 2, 34]), pal.trim, 6);
        }, { pad: 4 });
      }
      SL.art.drawSprite(ctx, key, p.x, p.y, 0, 1, 1);
      SL.art.flame(ctx, p.x, p.y + 34, 10, 30, '#ffffff', p.palette.engine, SL.time.real);
    },

    push(p, ax, ay, dt) {
      if (!p || !p.alive || !isFinite(ax) || !isFinite(ay) || !isFinite(dt)) return;
      const k = 1 - U.clamp((p.stats && p.stats.gravityResist) || 0, 0, 1);
      p.push.x += ax * dt * k;
      p.push.y += ay * dt * k;
    },

    heal(p, n, silent) {
      if (!p || !p.alive) return 0;
      const before = p.hull;
      p.hull = Math.min(p.maxHull, p.hull + (n || 0));
      if (!p.lowHullArmed && p.hull > p.maxHull * 0.4) p.lowHullArmed = true;
      if (!silent && p.hull > before) SL.bus.emit('playerHeal', { p, amount: p.hull - before });
      return p.hull - before;
    },

    addShield(p, n) {
      if (!p) return 0;
      const before = p.shield;
      p.shield = Math.min(p.maxShield, p.shield + (n || 0));
      return p.shield - before;
    },

    addBomb(p, n) {
      if (!p) return false;
      n = n == null || !isFinite(n) ? 1 : Math.round(n);
      if (p.bombs >= p.maxBombs) return false;
      p.bombs = Math.min(p.maxBombs, p.bombs + n);
      return true;
    },

    /** Uses a bomb: 2 s nova that clears enemy bullets (to credits), 400 damage to non-boss enemies on
        screen, 2% of max HP (cap 600) to bosses, 1.5 s invulnerability, shockwave and flash. */
    bomb(p) {
      if (!p || !p.alive || p.bombs <= 0 || p.novaT > 0.6) return false;
      p.bombs--;
      p.novaT = 2.0;
      p.invuln = Math.max(p.invuln, 1.5);
      const s = session();
      if (s) s.bombsUsed++;
      SL.world.clearEnemyBullets({ toCredits: true, beams: true });
      const list = SL.world.enemies.slice();
      for (const e of list) {
        if (e.dead || e.dying || !SL.world.onScreen(e, 0)) continue;
        if (e.isBoss) SL.damageEnemy(e, Math.min(600, e.maxHp * 0.02), { by: p, type: 'bomb' });
        else SL.damageEnemy(e, 400, { by: p, type: 'bomb' });
      }
      SL.fx.shockwave(p.x, p.y, { radius: 980, duration: 1.1, strength: 1.8, color: '#bfefff' });
      SL.fx.shockwave(p.x, p.y, { radius: 520, duration: 0.7, strength: 1.2, ring: false });
      SL.fx.flash('#d8f6ff', 0.62, 0.4);
      SL.fx.shake(12, 0.6);
      SL.fx.hitstop(0.05);
      SL.fx.chromatic(0.5, 0.45);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TAU;
        SL.fx.emit({ x: p.x, y: p.y, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.7, size: 26, size2: 6, color: '#bfefff', color2: '#3fc8ff', drag: 1.5 });
      }
      U.sfx('bomb', { x: p.x });
      SL.bus.emit('bomb', { p });
      return true;
    },

    respawn(p) {
      const s = session();
      p.alive = true;
      p.down = false;
      p.state = 'fly';
      p.hull = p.maxHull;
      p.shield = 0;
      p.x = spawnX(p.index, !!(s && s.coop));
      p.y = H + 60;
      p.entering = 0.9;
      p.invuln = 2.5;
      p.push.x = p.push.y = 0;
      p.lowHullArmed = true;
      if (p.pod) { p.pod.dead = true; p.pod = null; }
      SL.bus.emit('playerRespawn', { p });
    },

    revive(p, x, y, by) {
      if (!p || p.alive || p.out) return;
      p.alive = true;
      p.down = false;
      p.state = 'fly';
      p.hull = Math.max(1, Math.round(p.maxHull * 0.5));
      p.x = U.clamp(x != null ? x : p.x, MARGIN, W - MARGIN);
      p.y = U.clamp(y != null ? y : p.y, MARGIN, H - MARGIN);
      p.invuln = 2.0;
      p.push.x = p.push.y = 0;
      if (p.pod) { p.pod.dead = true; p.pod = null; }
      SL.fx.explode(p.x, p.y, { size: 's', palette: 'green', debris: false, shake: false, sound: false });
      U.sfx('revive', { x: p.x });
      SL.bus.emit('playerRevive', { p, by: by || null });
    },

    /** Hull reached 0 (or forced): explode, then pod (co-op) or life/respawn/out. */
    kill(p) {
      if (!p || !p.alive) return;
      p.alive = false;
      p.down = true;
      p.hull = 0;
      p.shield = 0;
      p.novaT = 0;
      p.firing = false;
      const s = session();
      if (s) s.deaths = (s.deaths || 0) + 1;
      SL.fx.explode(p.x, p.y, { size: 'l', palette: 'player' });
      SL.fx.shake(14, 0.5);
      SL.fx.flash('#ffffff', 0.35, 0.25);
      SL.fx.chromatic(1, 0.6);
      SL.bus.emit('playerDown', { p });
      if (SL.weapons && typeof SL.weapons.onPlayerDown === 'function') {
        try { SL.weapons.onPlayerDown(p); } catch (err) { reportOnce('weapons.onPlayerDown', err); }
      } else p.weapon.level = Math.max(1, p.weapon.level - 1);
      const partner = SL.world.players.find((q) => q !== p && q.alive && !q.down && !q.display);
      if (s && s.coop && partner) {
        p.state = 'pod';
        p.reviveT = p.stats.reviveTime || 8;
        let pod = null;
        if (SL.rescue && typeof SL.rescue.spawnPilotPod === 'function') {
          try { pod = SL.rescue.spawnPilotPod(p); } catch (err) { reportOnce('rescue.spawnPilotPod', err); }
        }
        p.pod = pod && !pod.dead ? pod : spawnCorePilotPod(p);
      } else resolveLife(p, s && s.coop ? 1.0 : 1.2);
    },
  };

  function resolveLife(p, delay) {
    const s = session();
    if (p.pod) { p.pod.dead = true; p.pod = null; }
    if (s && s.lives > 0) {
      s.lives--;
      s.livesLost++;
      p.state = 'respawn';
      p.respawnT = delay;
    } else {
      p.state = 'out';
      p.out = true;
      SL.bus.emit('playerOut', { p });
      if (SL.game && SL.game.checkFail) SL.game.checkFail();
    }
  }

  function updateDown(p, dt) {
    if (p.state === 'respawn') {
      p.respawnT -= dt;
      if (p.respawnT <= 0) P.respawn(p);
    } else if (p.state === 'pod') {
      p.reviveT -= dt;
      if (p.pod && p.pod.dead && !p.alive && p.state === 'pod' && p.reviveT > 0 && !p.pod.revived) {
        // pod destroyed or lost before rescue: treat as timeout
        p.reviveT = 0;
      }
      if (p.reviveT <= 0 && !p.alive) {
        if (p.pod && !p.pod.dead) SL.fx.explode(p.pod.x, p.pod.y, { size: 's', palette: 'player', debris: false });
        resolveLife(p, 1.0);
      }
    }
  }

  // Minimal pilot pod used when 17_rescue.js does not provide spawnPilotPod.
  function spawnCorePilotPod(p) {
    const def = {
      r: 18, sprite: 'core:pod',
      update(pod, dt) { pod.vy = U.approach(pod.vy, 40, 200 * dt); pod.vx *= 1 / (1 + 2 * dt); },
      onTouch(pod, q) {
        if (q === pod.data.owner || pod.dead) return;
        pod.revived = true;
        pod.dead = true;
        P.revive(pod.data.owner, pod.x, pod.y, q);
      },
    };
    const pod = SL.world.spawnEntity('pods', def, { x: p.x, y: p.y, vx: (SL.rng.next() - 0.5) * 80, vy: -60 });
    pod.data.owner = p;
    pod.data.pilot = true;
    return pod;
  }

  const shieldCache = {};
  function shieldSprite(color) {
    if (shieldCache[color]) return shieldCache[color];
    const r = 46;
    const c = SL.art.canvas(r * 2 + 8, r * 2 + 8), x = c.getContext('2d');
    const cx = r + 4, cy = r + 4;
    const g = x.createRadialGradient(cx - 10, cy - 14, r * 0.2, cx, cy, r);
    g.addColorStop(0, C.rgba(color, 0.0));
    g.addColorStop(0.72, C.rgba(color, 0.10));
    g.addColorStop(0.93, C.rgba(color, 0.55));
    g.addColorStop(1, C.rgba('#ffffff', 0.9));
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r, 0, TAU);
    x.fill();
    x.strokeStyle = C.rgba('#ffffff', 0.35);
    x.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      x.beginPath();
      x.moveTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55);
      x.lineTo(cx + Math.cos(a) * r * 0.97, cy + Math.sin(a) * r * 0.97);
      x.stroke();
    }
    x.beginPath();
    x.arc(cx, cy, r * 0.55, 0, TAU);
    x.stroke();
    x.fillStyle = C.rgba('#ffffff', 0.5);
    x.beginPath();
    x.ellipse(cx - r * 0.38, cy - r * 0.45, r * 0.22, r * 0.09, -0.7, 0, TAU);
    x.fill();
    shieldCache[color] = c;
    return c;
  }

  function drawShield(p, ctx, t) {
    const color = p.palette.glow;
    const spr = shieldSprite(color);
    const k = p.maxShield > 0 ? U.clamp(p.shield / p.maxShield, 0, 1) : 0;
    const hit = p.shieldHitT > 0 ? p.shieldHitT / 0.3 : 0;
    const a = Math.min(1, 0.35 + 0.45 * k + 0.25 * Math.sin(t * 6) * 0.3 + hit * 0.8);
    const r = 46 + 2 * Math.sin(t * 5) + hit * 6;
    const po = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.drawImage(spr, p.x - r - 4, p.y - r - 4, (r + 4) * 2, (r + 4) * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = po;
  }

  // Twin pulse used only when no weapons module is loaded.
  function defaultFire(p, dt) {
    p.fireT -= dt;
    if (!p.firing || p.fireT > 0) return;
    p.fireT += 0.1 / (p.stats.fireRateMul || 1);
    if (p.fireT < 0) p.fireT = 0;
    const dmg = 7 * (p.stats.damageMul || 1);
    SL.firePlayer(p, p.x - 9, p.y - 26, -Math.PI / 2, 1500, 'pulse', dmg);
    SL.firePlayer(p, p.x + 9, p.y - 26, -Math.PI / 2, 1500, 'pulse', dmg);
  }

  const reported = new Set();
  function reportOnce(what, err) {
    if (reported.has(what)) return;
    reported.add(what);
    console.error('[SL.player] ' + what + ' threw:', err);
  }
})(window.SL = window.SL || {});
