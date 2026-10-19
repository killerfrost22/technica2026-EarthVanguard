/* 17_rescue.js (story)
   17_rescue.js provides: SL.rescue = { spawnPod(x, y, {people, vip, kind, vx, vy, drift, maxHits}), spawnPilotPod(p) }.
   Escape pods drift and bob with a blinking beacon and an SOS ring. Touch rescues them (25 credits x people,
   500 x multiplier score, session.rescued / podsRescued, save.rescuedTotal, bus 'podRescued', sometimes a
   radio thank-you); VIP pods set save.flags['unlock_' + vip]. Three enemy-bullet hits (maxHits) destroy a pod and leaving
   the bottom loses it (bus 'podLost'). Pilot pods (co-op) revive their owner when the partner flies over them,
   ignore bullets, and show the revive timer as a ring. Sandbox: 'rescue'. */
(function (SL) {
  'use strict';

  const U = SL.util, C = SL.color, A = SL.art;
  const TAU = Math.PI * 2;

  function defineArt() {
    const pod = (trim) => (ctx, w, h) => {
      const cx = w / 2;
      for (const s of [-1, 1]) {
        const fin = A.poly([cx + s * 8, h * 0.62, cx + s * 15, h * 0.86, cx + s * 13, h * 0.95, cx + s * 6, h * 0.84]);
        A.metal(ctx, fin, { base: '#aeb8c8', spec: 0.5, edge: 1, bounds: { x: 0, y: 0, w, h } });
      }
      const body = new Path2D();
      body.ellipse(cx, h * 0.48, w * 0.36, h * 0.44, 0, 0, TAU);
      A.metal(ctx, body, { base: '#e4ebf3', spec: 0.7 });
      const band = new Path2D();
      band.rect(cx - w * 0.34, h * 0.56, w * 0.68, h * 0.07);
      ctx.save();
      ctx.clip(body);
      A.emissive(ctx, band, trim, 4);
      ctx.restore();
      const win = new Path2D();
      win.ellipse(cx, h * 0.34, w * 0.18, h * 0.12, 0, 0, TAU);
      ctx.fillStyle = '#0b2a26';
      ctx.fill(win);
      A.emissive(ctx, win, C.mix(trim, '#ffffff', 0.25), 5);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(cx - w * 0.06, h * 0.3, w * 0.06, h * 0.03, -0.4, 0, TAU);
      ctx.fill();
    };
    A.define('rs:pod', 34, 44, pod(SL.pal.rescue), { pad: 4, res: 2 });
    A.define('rs:pilot0', 34, 44, pod(SL.pal.player.trim), { pad: 4, res: 2 });
    A.define('rs:pilot1', 34, 44, pod(SL.pal.player2.trim), { pad: 4, res: 2 });
  }

  function drawPod(pod, ctx, key, color) {
    const d = pod.data;
    const y = pod.y + Math.sin(d.bob * 2.2) * 3;
    const ringK = (d.bob % 1.4) / 1.4;
    const ring = A.ring(color, 64, 5);
    const po = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 * (1 - ringK);
    const rr = 20 + 46 * ringK;
    ctx.drawImage(ring, pod.x - rr, y - rr, rr * 2, rr * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = po;
    A.drawSprite(ctx, key, pod.x, y, pod.rot, 1, 1);
    if (pod.flash > 0) A.drawFlash(ctx, key, pod.x, y, pod.rot, 1, pod.flash / 0.1);
    const on = Math.floor(d.bob * 2.5) % 2 === 0;
    A.drawGlow(ctx, pod.x, y - 24, on ? 16 : 7, on ? '#ffffff' : color, on ? 1 : 0.5);
  }

  function session() { return SL.game && SL.game.session; }
  function sfx(id, x) { if (SL.audio && SL.audio.sfx) SL.audio.sfx(id, { x }); }

  function lose(pod, reason) {
    // the world marks an escaping pod dead before it calls onExit, so the guard uses the pod's own outcome flags
    if (pod.lost || pod.rescued) return;
    pod.lost = true;
    pod.dead = true;
    const s = session();
    if (s) s.podsLost++;
    if (reason === 'destroyed') SL.fx.explode(pod.x, pod.y, { size: 's', palette: 'green', debris: false, sound: false });
    sfx('pod_lost', pod.x);
    SL.bus.emit('podLost', { pod, reason });
  }

  function rescue(pod, p) {
    if (pod.lost || pod.rescued) return;
    pod.dead = true;
    pod.rescued = true;
    const s = session(), people = pod.data.people;
    if (s) { s.rescued += people; s.podsRescued++; }
    const save = SL.save.data;
    save.rescuedTotal = (save.rescuedTotal || 0) + people;
    SL.game.addCredits(25 * people, pod.x, pod.y - 26, p);
    SL.game.addScore(500 * (s ? s.mult : 1), pod.x, pod.y + 6);
    if (pod.data.vip) {
      save.flags['unlock_' + pod.data.vip] = true;
      if (SL.story && SL.story.radio) SL.story.radio({ who: 'anvil', text: 'VIP aboard! That changes things, {callsign}.' }, { priority: true });
    } else if (SL.rng.chance(0.4) && SL.story && SL.story.radio) SL.story.radio('rescue_thanks');
    SL.fx.sparks(pod.x, pod.y, { count: 18, color: SL.pal.rescue, speed: 380 });
    SL.fx.shockwave(pod.x, pod.y, { radius: 120, duration: 0.4, strength: 0.4, color: SL.pal.rescue });
    sfx('rescue', pod.x);
    SL.bus.emit('podRescued', { pod, p, people, vip: pod.data.vip || null });
  }

  const POD = {
    r: 18,
    update(pod, dt) {
      const d = pod.data;
      d.bob += dt;
      pod.vy = U.approach(pod.vy, d.drift, 120 * dt);
      pod.vx *= 1 / (1 + 1.5 * dt);
      pod.x = U.clamp(pod.x, 24, SL.W - 24);
      pod.rot = Math.sin(d.bob * 1.3) * 0.25;
    },
    draw(pod, ctx) { drawPod(pod, ctx, 'rs:pod', SL.pal.rescue); },
    onTouch(pod, p) { rescue(pod, p); },
    onBullet(pod) {
      pod.data.hits++;
      pod.flash = 0.1;
      SL.fx.hit(pod.x, pod.y, '#ffffff');
      if (pod.data.hits >= pod.data.maxHits) lose(pod, 'destroyed');
      return true;
    },
    onExit(pod) { lose(pod, 'escaped'); },
  };

  const PILOT = {
    r: 18,
    update(pod, dt) {
      const d = pod.data;
      d.bob += dt;
      pod.vy = U.approach(pod.vy, 30, 140 * dt);
      pod.vx *= 1 / (1 + 2 * dt);
      pod.x = U.clamp(pod.x, 24, SL.W - 24);
      pod.rot = Math.sin(d.bob * 1.6) * 0.3;
    },
    draw(pod, ctx) {
      const owner = pod.data.owner;
      const color = owner ? owner.palette.trim : SL.pal.player.trim;
      drawPod(pod, ctx, 'rs:pilot' + (owner && owner.index ? 1 : 0), color);
      if (owner && owner.reviveT > 0) {
        const k = U.clamp(owner.reviveT / ((owner.stats && owner.stats.reviveTime) || 8), 0, 1);
        ctx.strokeStyle = C.rgba(color, 0.9);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pod.x, pod.y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        ctx.stroke();
      }
    },
    onTouch(pod, q) {
      const owner = pod.data.owner;
      if (!owner || q === owner || pod.dead || owner.alive) return;
      pod.revived = true;
      pod.dead = true;
      SL.player.revive(owner, pod.x, pod.y, q);
    },
  };

  SL.rescue = {
    spawnPod(x, y, o) {
      o = o || {};
      const pod = SL.world.spawnEntity('pods', POD, { x, y, vx: o.vx || 0, vy: o.vy != null ? o.vy : 50 });
      if (pod.dead) return pod;
      pod.data.people = Math.max(1, o.people || 3);
      pod.data.vip = o.vip || null;
      pod.data.kind = o.kind || 'civilian';
      pod.data.hits = 0;
      pod.data.maxHits = Math.max(1, o.maxHits || 3); // a hunted VIP pod can be made tougher
      pod.data.drift = o.drift || 55;
      pod.data.bob = SL.rng.next() * TAU;
      const s = session();
      if (s) s.podsSpawned++;
      SL.bus.emit('podSpawn', { pod });
      return pod;
    },
    spawnPilotPod(p) {
      const pod = SL.world.spawnEntity('pods', PILOT, { x: p.x, y: p.y, vx: (SL.rng.next() - 0.5) * 80, vy: -70 });
      if (pod.dead) return pod;
      pod.data.owner = p;
      pod.data.pilot = true;
      pod.data.bob = 0;
      return pod;
    },
  };

  SL.onBoot(defineArt);

  SL.debug.sandbox('rescue', () => {
    let t = 0.3, i = 0;
    return (dt) => {
      t -= dt;
      if (t > 0) return;
      t = 2.5;
      SL.rescue.spawnPod(140 + (i++ % 4) * 150, -30, { people: 2 + (i % 3) });
    };
  }, { name: 'Rescue pods' });
})(window.SL = window.SL || {});
