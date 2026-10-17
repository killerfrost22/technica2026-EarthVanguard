/* 02_input.js (core)
   Provides: SL.input = { players[0|1] {mx, my, dragX, dragY, fire, focus, bomb, skill, pause, any},
   menu {up, down, left, right, confirm, back, pause, any}, update(), inject(i, partial), press(i, action),
   setCoop(bool), reset(), isHeld(code), coop, lastDevice, padFor, autoPads, forceAutoFire, gamepads }.
   Keyboard (KeyboardEvent.code), standard-mapping gamepads, touch drag and mouse drag on #game feed
   per-player state once per frame. mx/my and dragX/dragY are in world (logical) directions: in landscape
   (SL.render.land) the screen is the world turned a quarter turn, so screen right = world up (-y) and screen down =
   world +x. sx/sy keep the raw screen-direction axes for screens that draw in screen space (Puff's Ocean). Calls SL.audio.unlock() on the first gestures and pauses missions on
   window blur or a hidden tab. */
(function (SL) {
  'use strict';

  const U = SL.util;

  const SOLO = {
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
    bomb: ['KeyX', 'KeyQ', 'KeyK'], skill: ['KeyC', 'KeyE', 'KeyL'], focus: ['ShiftLeft', 'ShiftRight'],
    fire: ['Space', 'KeyZ', 'KeyJ'], pause: ['Escape', 'KeyP'],
  };
  const COOP1 = {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    bomb: ['KeyQ'], skill: ['KeyE'], focus: ['ShiftLeft'], fire: ['Space'], pause: ['Escape', 'KeyP'],
  };
  const COOP2 = {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    bomb: ['Enter', 'Numpad0'], skill: ['ShiftRight', 'Numpad1'], focus: ['ControlRight', 'Numpad2'],
    fire: ['Slash', 'NumpadEnter'], pause: ['Escape', 'KeyP'],
  };
  const MENU_KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right', Enter: 'confirm', NumpadEnter: 'confirm', Space: 'confirm',
    Escape: 'back', Backspace: 'back',
  };
  // Keys whose browser default (scrolling, quick find, history) must never fire while playing.
  const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash', 'Quote', 'Backspace']);
  const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const DEADZONE = 0.2;

  function blankPlayer() {
    return { mx: 0, my: 0, sx: 0, sy: 0, dragX: 0, dragY: 0, fire: false, focus: false, bomb: false, skill: false, pause: false, any: false };
  }
  function clearPlayer(p) {
    p.mx = 0; p.my = 0; p.sx = 0; p.sy = 0; p.dragX = 0; p.dragY = 0;
    p.fire = false; p.focus = false; p.bomb = false; p.skill = false; p.pause = false; p.any = false;
  }

  const held = new Set();
  const downs = [];
  const menuDowns = [];
  const queued = [[], []];
  const padPrev = {};
  const padRepeat = {};
  let dragX = 0, dragY = 0;
  let padsEnabled = true;
  let lastUpdate = 0;
  const drag = { active: false, src: '', kind: '', id: null, x: 0, y: 0 };

  const I = SL.input = {
    players: [blankPlayer(), blankPlayer()],
    menu: { up: false, down: false, left: false, right: false, confirm: false, back: false, pause: false, any: false },
    coop: false,
    lastDevice: 'keyboard',
    /** [pad index for P1, pad index for P2]; -1 = none. In solo every pad drives P1. */
    padFor: [-1, -1],
    /** When true (default) padFor is recomputed every frame from the connected pads. */
    autoPads: true,
    /** True while the last device is touch: auto-fire is forced on. */
    forceAutoFire: false,
    gamepads: 0,
    dragging: false,
    maps: { SOLO, COOP1, COOP2 },

    update() {
      const now = performance.now();
      const realDt = lastUpdate ? Math.min(0.1, (now - lastUpdate) / 1000) : 1 / 60;
      lastUpdate = now;
      const P = I.players, m = I.menu;
      clearPlayer(P[0]);
      clearPlayer(P[1]);
      m.up = m.down = m.left = m.right = m.confirm = m.back = m.pause = m.any = false;

      const maps = I.coop ? [COOP1, COOP2] : [SOLO, null];
      for (let i = 0; i < 2; i++) {
        const map = maps[i];
        if (!map) continue;
        const p = P[i];
        let x = (anyHeld(map.right) ? 1 : 0) - (anyHeld(map.left) ? 1 : 0);
        let y = (anyHeld(map.down) ? 1 : 0) - (anyHeld(map.up) ? 1 : 0);
        if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
        p.mx = x;
        p.my = y;
        p.fire = anyHeld(map.fire);
        p.focus = anyHeld(map.focus);
        p.bomb = anyDown(map.bomb);
        p.skill = anyDown(map.skill);
        p.pause = anyDown(map.pause);
      }
      for (let i = 0; i < menuDowns.length; i++) {
        const code = menuDowns[i];
        const k = MENU_KEYS[code];
        if (k) m[k] = true;
        if (code === 'Escape' || code === 'KeyP') m.pause = true;
        m.any = true;
      }

      pollPads(realDt);

      const land = !!(SL.render && SL.render.land);
      for (let i = 0; i < 2; i++) {
        const p = P[i];
        p.sx = p.mx;
        p.sy = p.my;
        if (land) { p.mx = p.sy; p.my = -p.sx; }
      }
      if (dragX || dragY) {
        // the world's 720 px width spans the box width in portrait and the box height in landscape
        const w = (SL.render && (land ? SL.render.cssH : SL.render.cssW)) || cssWidth();
        const sens = (SL.save && SL.save.settings && SL.save.settings.touchSensitivity) || 1;
        const k = (SL.W / Math.max(1, w)) * sens;
        P[0].dragX = (land ? dragY : dragX) * k;
        P[0].dragY = (land ? -dragX : dragY) * k;
      }
      dragX = 0;
      dragY = 0;

      for (let i = 0; i < 2; i++) {
        const q = queued[i];
        for (let j = 0; j < q.length; j++) P[i][q[j]] = true;
        q.length = 0;
      }
      for (let i = 0; i < 2; i++) {
        const p = P[i];
        p.any = !!(p.mx || p.my || p.dragX || p.dragY || p.fire || p.focus || p.bomb || p.skill || p.pause);
      }
      I.forceAutoFire = I.lastDevice === 'touch';
      I.dragging = drag.active;
      downs.length = 0;
      menuDowns.length = 0;
    },

    /** Overrides fields of a player's state for the current frame (autopilot, tests). */
    inject(i, partial) {
      const p = I.players[i];
      if (!p || !partial) return;
      for (const k in partial) if (k in p) p[k] = partial[k];
      p.any = !!(p.mx || p.my || p.dragX || p.dragY || p.fire || p.focus || p.bomb || p.skill || p.pause);
    },

    /** Queues a pressed-this-frame edge ('bomb' | 'skill' | 'pause') for the next update. */
    press(i, action) {
      if ((i !== 0 && i !== 1) || (action !== 'bomb' && action !== 'skill' && action !== 'pause')) return;
      queued[i].push(action);
    },

    setCoop(on) { I.coop = !!on; },

    reset() {
      held.clear();
      downs.length = 0;
      menuDowns.length = 0;
      queued[0].length = 0;
      queued[1].length = 0;
      dragX = dragY = 0;
      drag.active = false;
      clearPlayer(I.players[0]);
      clearPlayer(I.players[1]);
    },

    isHeld(code) { return held.has(code); },
  };

  function anyHeld(codes) {
    for (let i = 0; i < codes.length; i++) if (held.has(codes[i])) return true;
    return false;
  }
  function anyDown(codes) {
    for (let i = 0; i < codes.length; i++) if (downs.indexOf(codes[i]) >= 0) return true;
    return false;
  }
  function cssWidth() {
    const g = document.getElementById('game');
    return g ? g.clientWidth : SL.W;
  }

  // ---------------------------------------------------------------- gamepads
  function stick(x, y) {
    const len = Math.sqrt(x * x + y * y);
    if (len < DEADZONE) return [0, 0];
    const k = Math.min(1, (len - DEADZONE) / (1 - DEADZONE)) / len;
    return [x * k, y * k];
  }
  function btn(pad, i) {
    const b = pad.buttons[i];
    return !!b && (b.pressed || b.value > 0.5);
  }

  function pollPads(realDt) {
    if (!padsEnabled || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let pads;
    try { pads = navigator.getGamepads(); } catch (e) { padsEnabled = false; return; }
    const list = [];
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) list.push(pads[i]);
    I.gamepads = list.length;
    if (I.autoPads) {
      if (!I.coop) { I.padFor[0] = list.length ? list[0].index : -1; I.padFor[1] = -1; }
      else if (list.length >= 2) { I.padFor[0] = list[0].index; I.padFor[1] = list[1].index; }
      else if (list.length === 1) { I.padFor[0] = -1; I.padFor[1] = list[0].index; }
      else { I.padFor[0] = -1; I.padFor[1] = -1; }
    }
    const P = I.players, m = I.menu;
    for (let n = 0; n < list.length; n++) {
      const pad = list[n];
      const prev = padPrev[pad.index] || (padPrev[pad.index] = []);
      const nb = pad.buttons.length;
      const now = [];
      for (let b = 0; b < nb; b++) now[b] = btn(pad, b);
      const edge = (b) => now[b] && !prev[b];
      const ax = stick(pad.axes[0] || 0, pad.axes[1] || 0);
      let x = ax[0] + (now[PAD.RIGHT] ? 1 : 0) - (now[PAD.LEFT] ? 1 : 0);
      let y = ax[1] + (now[PAD.DOWN] ? 1 : 0) - (now[PAD.UP] ? 1 : 0);
      const len = Math.sqrt(x * x + y * y);
      if (len > 1) { x /= len; y /= len; }

      let active = len > 0;
      for (let b = 0; b < nb; b++) if (now[b]) { active = true; break; }
      if (active) I.lastDevice = 'gamepad';

      const target = !I.coop ? 0 : pad.index === I.padFor[0] ? 0 : pad.index === I.padFor[1] ? 1 : -1;
      if (target >= 0) {
        const p = P[target];
        p.mx = U.clamp(p.mx + x, -1, 1);
        p.my = U.clamp(p.my + y, -1, 1);
        p.fire = p.fire || now[PAD.RT];
        p.focus = p.focus || now[PAD.LB] || now[PAD.RB];
        p.bomb = p.bomb || edge(PAD.A);
        p.skill = p.skill || edge(PAD.X) || edge(PAD.B);
        p.pause = p.pause || edge(PAD.START);
      }

      // menu edges with auto-repeat on directions
      const rep = padRepeat[pad.index] || (padRepeat[pad.index] = { up: 0, down: 0, left: 0, right: 0 });
      const dirs = { up: y < -0.5, down: y > 0.5, left: x < -0.5, right: x > 0.5 };
      for (const d in dirs) {
        if (dirs[d]) {
          if (rep[d] === 0) { m[d] = true; rep[d] = 0.38; } else {
            rep[d] -= realDt;
            if (rep[d] <= 0) { m[d] = true; rep[d] = 0.11; }
          }
        } else rep[d] = 0;
      }
      if (edge(PAD.A)) m.confirm = true;
      if (edge(PAD.B)) m.back = true;
      if (edge(PAD.START)) m.pause = true;
      for (let b = 0; b < nb; b++) if (edge(b)) m.any = true;
      for (let b = 0; b < nb; b++) prev[b] = now[b];
    }
  }

  // ---------------------------------------------------------------- DOM listeners
  function isEditable(t) {
    if (!t || t.nodeType !== 1) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
      const type = (t.type || 'text').toLowerCase();
      return ['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color'].indexOf(type) < 0;
    }
    return false;
  }
  function isControl(t) {
    return !!(t && t.closest && t.closest('button, a, input, select, textarea, label, [tabindex], .sl-interactive'));
  }
  function unlockAudio() {
    if (SL.audio && !SL.audio.ready && typeof SL.audio.unlock === 'function') {
      try { SL.audio.unlock(); } catch (e) { /* audio may refuse; the next gesture retries */ }
    }
  }
  function blurPause() {
    held.clear();
    drag.active = false;
    const g = SL.game;
    if (!g || g.state !== 'mission' || g.paused) return;
    if (SL.debug && SL.debug.noBlurPause) return;
    if (typeof g.pause === 'function') g.pause('blur');
  }

  window.addEventListener('keydown', (e) => {
    if (isEditable(e.target)) return;
    const code = e.code || e.key;
    if (!code) return;
    if (PREVENT.has(code) && !isControl(e.target)) e.preventDefault();
    I.lastDevice = 'keyboard';
    if (!e.repeat) {
      if (!held.has(code)) downs.push(code);
      held.add(code);
    }
    menuDowns.push(code);
    unlockAudio();
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    const code = e.code || e.key;
    held.delete(code);
    // Releasing Shift can swallow the other side's keyup on some platforms.
    if (code === 'ShiftLeft' || code === 'ShiftRight') { if (!e.shiftKey) { held.delete('ShiftLeft'); held.delete('ShiftRight'); } }
  });

  window.addEventListener('blur', blurPause);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') blurPause(); });

  function attachPointer() {
    const game = document.getElementById('game');
    if (!game) return;
    const hasPointer = typeof window.PointerEvent === 'function';
    // Touch events and pointer events both report fingers. Once a real TouchEvent arrives, touch is
    // tracked through touch events only and pointer events of type 'touch' are ignored.
    let touchSeen = false;

    game.addEventListener('contextmenu', (e) => e.preventDefault());

    game.addEventListener('touchstart', (e) => {
      touchSeen = true;
      I.lastDevice = 'touch';
      unlockAudio();
      if (isControl(e.target)) return;
      if (e.cancelable) e.preventDefault();
      if (drag.active && drag.src === 'touch') return;
      const t = e.changedTouches[0];
      if (!t) return;
      drag.active = true; drag.src = 'touch'; drag.kind = 'touch'; drag.id = t.identifier;
      drag.x = t.clientX; drag.y = t.clientY;
    }, { passive: false });

    const touchMove = (e) => {
      if (!drag.active || drag.src !== 'touch') return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== drag.id) continue;
        dragX += t.clientX - drag.x;
        dragY += t.clientY - drag.y;
        drag.x = t.clientX;
        drag.y = t.clientY;
        if (e.cancelable) e.preventDefault();
      }
    };
    const touchEnd = (e) => {
      unlockAudio();
      if (!drag.active || drag.src !== 'touch') return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier !== drag.id) continue;
        touchMove(e);
        drag.active = false;
        drag.id = null;
        // another finger still down on the playfield (thumb swap) takes over the drag
        const rest = e.touches || [];
        for (let j = 0; j < rest.length; j++) {
          const t = rest[j];
          if (isControl(t.target)) continue;
          drag.active = true; drag.id = t.identifier; drag.x = t.clientX; drag.y = t.clientY;
          break;
        }
        break;
      }
    };
    game.addEventListener('touchmove', touchMove, { passive: false });
    game.addEventListener('touchend', touchEnd);
    game.addEventListener('touchcancel', touchEnd);

    const down = (e) => {
      const type = e.pointerType || 'mouse';
      if (type === 'touch' && touchSeen) return;
      unlockAudio();
      if (isControl(e.target)) return;
      I.lastDevice = type === 'touch' ? 'touch' : 'mouse';
      if (e.button === 2) { I.press(0, 'bomb'); e.preventDefault(); return; }
      if (e.button !== 0 || drag.active) return;
      drag.active = true; drag.src = 'pointer'; drag.kind = type; drag.id = hasPointer ? e.pointerId : 'mouse';
      drag.x = e.clientX; drag.y = e.clientY;
      if (hasPointer) { try { game.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } }
    };
    const move = (e) => {
      if (!drag.active || drag.src !== 'pointer') return;
      if (hasPointer && e.pointerId !== drag.id) return;
      dragX += e.clientX - drag.x;
      dragY += e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = (e) => {
      if (!drag.active || drag.src !== 'pointer') return;
      if (hasPointer && e.pointerId !== drag.id) return;
      move(e);
      drag.active = false;
      drag.id = null;
    };
    if (hasPointer) {
      game.addEventListener('pointerdown', down);
      game.addEventListener('pointermove', move);
      game.addEventListener('pointerup', up);
      game.addEventListener('pointercancel', up);
      game.addEventListener('lostpointercapture', (e) => {
        if (drag.active && drag.src === 'pointer' && e.pointerId === drag.id) { drag.active = false; drag.id = null; }
      });
    } else {
      game.addEventListener('mousedown', down);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
  }

  SL.onBoot(attachPointer);
})(window.SL = window.SL || {});
