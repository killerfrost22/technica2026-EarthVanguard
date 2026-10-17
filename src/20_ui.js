/* STUB: replaced by ui
   20_ui.js provides: SL.ui = { show(id, params), hide(), current, toast(text), update(realDt) }, screens title
   (Start, 2 Players), pause, results and failed via SL.screens.define(id, {build(root, params), onShow, onHide,
   onInput(menu)}), and SL.hud = { draw(ctx), banner(text, {sub, color, duration}), touchButtons(show) }: hull and
   shield bars, lives, bombs, weapon, score, multiplier, credits, boss bar with phase marks, banners (also for
   bus 'bossWarning' and 'hazardWarning'), and DOM BOMB / SKILL touch buttons.
   21_game.js calls SL.ui.update(realDt) every frame; it dispatches onInput(menu) to the current screen and
   moves focus between buttons with the arrows / D-pad (a gamepad A press clicks the focused button). */
(function (SL) {
  'use strict';

  const U = SL.util, C = SL.color;
  const W = SL.W;
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ DOM helpers
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(text, cls, onClick) {
    const b = el('button', 'sl-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (SL.audio && SL.audio.sfx) SL.audio.sfx('ui_confirm');
      onClick();
    });
    return b;
  }
  function firstMission() {
    const ids = SL.missions.ids().filter((id) => !SL.missions.get(id).dev && SL.missions.get(id).kind !== 'side');
    ids.sort((a, b) => (SL.missions.get(a).order || 0) - (SL.missions.get(b).order || 0));
    return ids[0] || SL.missions.ids()[0];
  }

  let uiEl = null, cur = null, toastEl = null, toastTimer = 0;
  let touchEl = null, bombBtn = null;

  const UI = SL.ui = {
    current: null,

    show(id, params) {
      const def = SL.screens.get(id);
      if (!def || !uiEl) return null;
      UI.hide();
      const root = el('div', 'sl-screen sl-ui-screen sl-ui-' + id);
      root.dataset.screen = id;
      let made = null;
      try { made = def.build ? def.build(root, params || {}) : null; } catch (err) { console.error('[SL.ui] screen "' + id + '" build threw:', err); }
      if (made && made !== root && !root.contains(made)) root.appendChild(made);
      uiEl.appendChild(root);
      cur = { id, def, root, params: params || {} };
      UI.current = id;
      if (def.onShow) { try { def.onShow(root, params || {}); } catch (err) { console.error('[SL.ui] screen "' + id + '" onShow threw:', err); } }
      const first = root.querySelector('button:not([disabled])');
      if (first && SL.input.lastDevice !== 'touch') first.focus({ preventScroll: true });
      SL.bus.emit('screenShow', { id });
      return root;
    },

    hide() {
      if (!cur) return;
      const c = cur;
      cur = null;
      UI.current = null;
      if (c.def.onHide) { try { c.def.onHide(c.root); } catch (err) { console.error('[SL.ui] screen "' + c.id + '" onHide threw:', err); } }
      c.root.remove();
      SL.bus.emit('screenHide', { id: c.id });
    },

    toast(text) {
      if (!toastEl) return;
      toastEl.textContent = String(text);
      toastEl.classList.add('is-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2200);
    },

    update() {
      const m = SL.input.menu;
      if (SL.game.state === 'mission' && SL.input.lastDevice === 'touch' && touchEl && touchEl.hidden && !SL.game.outro) HUD.touchButtons(true);
      if (bombBtn) {
        const p = SL.world.players[0];
        const n = p && !p.display ? p.bombs : 0;
        if (bombBtn.dataset.n !== String(n)) { bombBtn.dataset.n = String(n); bombBtn.querySelector('span').textContent = n; }
      }
      if (!cur || !m.any) return;
      if (cur.def.onInput) {
        let handled = false;
        try { handled = !!cur.def.onInput(m, cur.root); } catch (err) { console.error('[SL.ui] screen "' + cur.id + '" onInput threw:', err); }
        if (handled) return;
      }
      const btns = Array.from(cur.root.querySelectorAll('button:not([disabled])'));
      if (!btns.length) return;
      const i = btns.indexOf(document.activeElement);
      const step = m.down || m.right ? 1 : m.up || m.left ? -1 : 0;
      if (step) {
        const next = btns[(i < 0 ? 0 : i + step + btns.length) % btns.length];
        next.focus({ preventScroll: true });
        if (SL.audio && SL.audio.sfx) SL.audio.sfx('ui_move');
      } else if (m.confirm && SL.input.lastDevice === 'gamepad') (btns[i] || btns[0]).click();
    },
  };

  // ------------------------------------------------------------------ screens
  SL.screens.define('title', {
    build(root) {
      root.classList.add('sl-ui-title');
      const head = el('div', 'sl-ui-title__head');
      head.append(el('div', 'sl-label', 'XF-9 Starlance · Deep Patrol'), el('h1', 'sl-title', 'Earth Vanguard'),
        el('p', 'sl-ui-title__tag', 'Laser dogfights, giant dreadnoughts, black holes and the crews you pull out of them.'));
      const btns = el('div', 'sl-stack sl-ui-title__btns');
      btns.append(
        button('Start', 'sl-btn--primary', () => SL.game.startMission(firstMission(), { coop: false })),
        button('2 Players', '', () => SL.game.startMission(firstMission(), { coop: true })));
      const hint = el('p', 'sl-ui-title__hint', 'Move: WASD or arrows · drag on touch · auto-fire · Bomb: X · Pause: Esc');
      root.append(head, btns, hint);
    },
  });

  SL.screens.define('pause', {
    build(root, params) {
      const panel = el('div', 'sl-panel sl-ui-panel');
      panel.append(el('div', 'sl-label', params.reason === 'blur' ? 'Paused while away' : 'Flight paused'), el('h2', 'sl-title sl-title--md', 'Paused'));
      const btns = el('div', 'sl-stack');
      btns.append(
        button('Resume', 'sl-btn--primary', () => SL.game.resume()),
        button('Restart', '', () => SL.game.retry(false)),
        button('Quit to menu', 'sl-btn--ghost', () => SL.game.quitMission()));
      panel.appendChild(btns);
      root.appendChild(panel);
    },
  });

  function statRows(r) {
    const dl = el('dl', 'sl-ui-stats');
    const add = (k, v) => { dl.append(el('dt', '', k), el('dd', 'sl-num', v)); };
    add('Score', U.fmtInt(r.score));
    add('Credits', U.fmtInt(r.creditsKept) + (r.success ? '' : ' (50%)'));
    add('Kills', r.kills + ' / ' + r.enemiesSpawned);
    add('Rescued', String(r.rescued));
    add('Hits taken', String(r.hitsTaken));
    add('Time', U.fmtTime(r.time));
    if (r.timeBonus) add('Boss time bonus', U.fmtInt(r.timeBonus));
    return dl;
  }

  SL.screens.define('results', {
    build(root, params) {
      const r = params.result || SL.debug.sampleResult(true);
      const panel = el('div', 'sl-panel sl-ui-panel');
      const top = el('div', 'sl-ui-results__top');
      const name = el('div', 'sl-ui-results__name');
      name.append(el('div', 'sl-label', 'Mission complete'), el('h2', 'sl-title sl-title--md', r.name || r.missionId));
      top.append(name, el('div', 'sl-ui-rank sl-ui-rank--' + (r.rank || 'D'), r.rank || '-'));
      panel.append(top, statRows(r));
      if (r.newBest) panel.appendChild(el('div', 'sl-ui-best', 'New best score'));
      const btns = el('div', 'sl-row');
      btns.append(button('Continue', 'sl-btn--primary', () => SL.game.toMenu()), button('Retry', '', () => SL.game.retry(false)));
      panel.appendChild(btns);
      root.appendChild(panel);
    },
  });

  SL.screens.define('failed', {
    build(root, params) {
      const r = params.result || SL.debug.sampleResult(false);
      const panel = el('div', 'sl-panel sl-panel--danger sl-ui-panel');
      panel.append(el('div', 'sl-label', r.name || r.missionId), el('h2', 'sl-title sl-title--md sl-title--danger', 'Mission failed'), statRows(r));
      const btns = el('div', 'sl-stack');
      if (params.checkpoint) btns.appendChild(button('Retry from checkpoint', 'sl-btn--primary', () => SL.game.retry(true)));
      btns.append(button('Restart mission', params.checkpoint ? '' : 'sl-btn--primary', () => SL.game.retry(false)), button('Back to menu', 'sl-btn--ghost', () => SL.game.toMenu()));
      panel.appendChild(btns);
      root.appendChild(panel);
    },
  });

  // ------------------------------------------------------------------ HUD (canvas, logical 720 x 1280)
  const banners = [];
  let banner = null;
  const gradCache = new Map();
  const boss = { shown: 0, hp: 1 };
  const textCache = { score: -1, scoreStr: '0', credits: -1, creditsStr: '0' };

  function grad(ctx, key, x0, y0, x1, y1, stops) {
    let g = gradCache.get(key);
    if (g) return g;
    g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [t, c] of stops) g.addColorStop(t, c);
    gradCache.set(key, g);
    return g;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, h / 2, Math.max(0, w) / 2));
    else ctx.rect(x, y, Math.max(0, w), h);
  }
  function bar(ctx, key, x, y, w, h, k, c1, c2) {
    ctx.fillStyle = 'rgba(4,8,18,0.78)';
    rrect(ctx, x - 3, y - 3, w + 6, h + 6, (h + 6) / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,210,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (k <= 0) return;
    ctx.fillStyle = grad(ctx, key, x, y, x + w, y, [[0, c1], [1, c2]]);
    rrect(ctx, x, y, w * k, h, h / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    rrect(ctx, x + 2, y + 1.5, Math.max(0, w * k - 4), h * 0.32, h * 0.16);
    ctx.fill();
  }
  function text(ctx, str, x, y, font, color, align) {
    ctx.font = font;
    ctx.textAlign = align || 'left';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(2,4,10,0.6)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawPlayerPanel(ctx, p, y) {
    const pal = p.palette;
    const k = p.maxHull > 0 ? U.clamp(p.hull / p.maxHull, 0, 1) : 0;
    const low = k <= 0.3 && p.alive;
    const pulse = low ? 0.5 + 0.5 * Math.sin(SL.time.real * 10) : 0;
    text(ctx, p.callsign || (p.index ? 'P2' : 'P1'), 26, y, '700 17px Oxanium, sans-serif', C.rgba(pal.glow, 0.95));
    if (!p.alive) text(ctx, p.state === 'pod' ? 'EJECTED' : p.out ? 'OUT' : 'RESPAWN', 250, y, '700 15px Oxanium, sans-serif', '#ff8aa8', 'right');
    const by = y + 10;
    if (low) bar(ctx, 'hull-low-' + p.index, 26, by, 224, 12, k, C.mix('#ff2f6d', '#ffffff', pulse * 0.4), '#ff8a5c');
    else bar(ctx, 'hull-' + p.index, 26, by, 224, 12, k, pal.trim, '#f2fbff');
    if (p.maxShield > 0 && p.shield > 0) {
      ctx.fillStyle = grad(ctx, 'shield', 26, 0, 250, 0, [[0, 'rgba(120,200,255,0.65)'], [1, 'rgba(220,245,255,0.95)']]);
      rrect(ctx, 26, by + 15, 224 * U.clamp(p.shield / p.maxShield, 0, 1), 4, 2);
      ctx.fill();
    }
  }

  function drawLivesBombs(ctx, s) {
    const p = SL.world.players[0];
    const y = 1236;
    for (let i = 0; i < Math.min(s.lives, 8); i++) {
      const x = 32 + i * 26;
      ctx.fillStyle = C.rgba(SL.pal.player.trim, 0.95);
      ctx.beginPath();
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x + 9, y + 8);
      ctx.lineTo(x, y + 3);
      ctx.lineTo(x - 9, y + 8);
      ctx.closePath();
      ctx.fill();
    }
    if (!p) return;
    const by = y - 34;
    for (let i = 0; i < p.bombs; i++) {
      const x = 32 + i * 26;
      SL.art.drawGlow(ctx, x, by, 13, '#ff7a3d', 0.85);
      ctx.fillStyle = '#ffe2c4';
      ctx.beginPath();
      ctx.arc(x, by, 4, 0, TAU);
      ctx.fill();
    }
    const w = p.weapon;
    text(ctx, String(w.type).toUpperCase() + '  L' + w.level, 26, by - 26, '700 16px Oxanium, sans-serif', '#c9f3ff');
  }

  function drawScore(ctx, s) {
    if (textCache.score !== s.score) { textCache.score = s.score; textCache.scoreStr = U.fmtInt(s.score); }
    if (textCache.credits !== s.credits) { textCache.credits = s.credits; textCache.creditsStr = U.fmtInt(s.credits); }
    text(ctx, 'SCORE', 694, 30, '600 13px Oxanium, sans-serif', 'rgba(160,190,220,0.85)', 'right');
    text(ctx, textCache.scoreStr, 694, 60, '700 30px Oxanium, sans-serif', '#eef6ff', 'right');
    if (s.mult > 1) {
      text(ctx, '×' + s.mult.toFixed(1), 694, 88, '800 20px Oxanium, sans-serif', '#ffd34d', 'right');
      ctx.fillStyle = 'rgba(255,211,77,0.75)';
      ctx.fillRect(694 - 60 * (s.multT / 2.5), 95, 60 * (s.multT / 2.5), 2.5);
    }
    ctx.fillStyle = SL.pal.credit;
    ctx.beginPath();
    ctx.moveTo(612, 108);
    ctx.lineTo(618, 116);
    ctx.lineTo(612, 124);
    ctx.lineTo(606, 116);
    ctx.closePath();
    ctx.fill();
    text(ctx, textCache.creditsStr, 694, 122, '700 17px Oxanium, sans-serif', '#ffe59a', 'right');
  }

  function drawBoss(ctx, dt) {
    const b = SL.game.boss;
    const want = b && !b.defeated ? 1 : 0;
    boss.shown = U.approach(boss.shown, want, dt * 3);
    if (boss.shown <= 0.01 || !b) return;
    const k = b.maxHp > 0 ? U.clamp(b.hp / b.maxHp, 0, 1) : 0;
    boss.hp = b.introDone ? U.approach(boss.hp, k, dt * 1.5) : U.approach(boss.hp, 1, dt * 0.7);
    ctx.globalAlpha = boss.shown;
    const x = 80, y = 158, w = 560;
    text(ctx, String(b.name || '').toUpperCase(), x, y - 12, '800 18px Oxanium, sans-serif', '#ffd0dc');
    if (b.title) text(ctx, b.title, x + w, y - 12, '500 14px "Barlow Semi Condensed", sans-serif', 'rgba(255,200,215,0.75)', 'right');
    bar(ctx, 'boss', x, y, w, 10, b.introDone ? boss.hp : boss.hp * 0.999, '#ff2f6d', '#ffb0c4');
    ctx.fillStyle = 'rgba(4,8,18,0.9)';
    for (const m of b.phaseMarks || []) ctx.fillRect(x + w * m - 1, y - 2, 2.5, 14);
    ctx.globalAlpha = 1;
  }

  function drawBanner(ctx, dt) {
    if (!banner && banners.length) banner = banners.shift();
    if (!banner) return;
    banner.t += dt;
    const t = banner.t, d = banner.dur;
    if (t >= d) { banner = null; return; }
    const a = Math.min(1, t / 0.18, (d - t) / 0.35);
    const sc = 1 + 0.08 * Math.max(0, 1 - t / 0.25);
    const y = 470;
    ctx.globalAlpha = a * 0.75;
    ctx.fillStyle = grad(ctx, 'band', 0, 0, W, 0, [[0, 'rgba(2,4,10,0)'], [0.2, 'rgba(2,4,10,0.7)'], [0.8, 'rgba(2,4,10,0.7)'], [1, 'rgba(2,4,10,0)']]);
    ctx.fillRect(0, y - 52, W, banner.sub ? 104 : 80);
    ctx.globalAlpha = a;
    ctx.fillStyle = banner.color;
    ctx.fillRect(W / 2 - 160 * a, y - 50, 320 * a, 2);
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(sc, sc);
    text(ctx, banner.text, 0, 12, '800 46px Oxanium, sans-serif', '#ffffff', 'center');
    ctx.restore();
    if (banner.sub) text(ctx, banner.sub, W / 2, y + 42, '600 18px "Barlow Semi Condensed", sans-serif', C.rgba(banner.color, 0.95), 'center');
    ctx.globalAlpha = 1;
  }

  let lastHud = 0;
  const HUD = SL.hud = {
    draw(ctx) {
      const now = SL.time.real;
      const dt = Math.min(0.6, Math.max(0, now - lastHud));
      lastHud = now;
      const g = SL.game, s = g.session;
      if (!s || (g.state !== 'mission' && g.state !== 'results')) { banners.length = 0; banner = null; return; }
      ctx.textBaseline = 'alphabetic';
      const players = SL.world.players;
      for (let i = 0; i < players.length; i++) if (!players[i].display) drawPlayerPanel(ctx, players[i], 34 + i * 48);
      drawScore(ctx, s);
      drawLivesBombs(ctx, s);
      drawBoss(ctx, dt);
      if (g.state === 'mission') drawBanner(ctx, g.paused ? 0 : dt);
    },

    banner(str, o) {
      o = o || {};
      const item = { text: String(str || ''), sub: o.sub || '', color: o.color || '#7fe3ff', dur: o.duration || 2.2, t: 0 };
      if (banner && banner.text === item.text) { banner.t = Math.min(banner.t, 0.2); return; }
      if (banners.length >= 3) banners.shift();
      banners.push(item);
    },

    touchButtons(show) {
      if (!touchEl) return;
      touchEl.hidden = !show;
    },
  };

  function buildTouch() {
    touchEl = el('div', 'sl-touch');
    touchEl.hidden = true;
    const mk = (label, act) => {
      const b = el('button', 'sl-touch-btn sl-touch-btn--' + act);
      b.type = 'button';
      b.tabIndex = -1;
      b.setAttribute('aria-label', label);
      b.append(el('b', '', label), el('span', '', ''));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); SL.input.press(0, act); b.classList.add('is-down'); });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      const up = () => b.classList.remove('is-down');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      return b;
    };
    bombBtn = mk('BOMB', 'bomb');
    touchEl.append(mk('SKILL', 'skill'), bombBtn);
    uiEl.appendChild(touchEl);
  }

  SL.onBoot(() => {
    uiEl = document.getElementById('ui');
    if (!uiEl) return;
    toastEl = el('div', 'sl-toast');
    toastEl.setAttribute('role', 'status');
    uiEl.appendChild(toastEl);
    buildTouch();
    SL.bus.on('bossWarning', (e) => HUD.banner('WARNING', { sub: (e && e.name ? e.name + ' approaching' : 'Massive contact'), color: '#ff5c8a', duration: 2.6 }));
    SL.bus.on('hazardWarning', (e) => HUD.banner((e && e.text) || 'HAZARD', { sub: 'Hazard ahead', color: '#ffb53f', duration: 2.2 }));
    SL.bus.on('missionStart', () => { banners.length = 0; banner = null; boss.shown = 0; boss.hp = 1; });
    SL.bus.on('missionEnd', () => { banners.length = 0; banner = null; });
    try { if (document.fonts && document.fonts.load) { document.fonts.load('700 20px Oxanium'); document.fonts.load('500 20px "Barlow Semi Condensed"'); } } catch (e) { /* fonts API missing */ }
  });
})(window.SL = window.SL || {});
