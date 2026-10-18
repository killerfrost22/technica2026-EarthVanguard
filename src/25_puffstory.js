/* 25_puffstory.js (puffstory)
   Provides: SL.puffStory = { buddy, spawnBuddy(), blackHole(), memoryScenario(onDone), state } and the radio
   character 'puff'.
   Puff is a pufferfish from an ocean world the corporations poisoned and the Directorate later chose for one of its
   games: survive the trials and win the power to heal your home. He won; his world was destroyed anyway. Now he flies
   with Earth Vanguard in a water bubble tethered to the jet, and he does not talk about it. His past comes out in
   memory sequences, one at a time.
   Mission m1, The Black Hole (timeline 'call' events from 18_missions.js): Puff's bubble trails the jet from the
   start. When the black hole arrives the tether snaps and Puff is pulled in; nothing the player does can stop it.
   Inside, the game pauses (SL.game.pause('story')) and Puff's Ocean runs the memory scenario 'The First Trial': a
   45 s trial in his home sea, with the Directorate speaking over it. Losing all hearts replays it ("That's not how it
   happened"); finishing it (or Skip memory) wakes him, the jet hauls the bubble back out, and the mission resumes.
   Autopilot, fast-forward and the in-page tests skip the memory (Puff is pulled in and comes straight back).
   After he is back and has said "Don't ask. Not yet." (PS.talkReady), m1 asks the pilot's first trust choice,
   puff_trust1: Ask what he saw (he shuts down) or Give him space (+1 trust). Later memories can build on it.
   Flags: save.flags.puff_memory1 (seen; Skip memory is offered on replays), unlock_puff (Puff's Ocean) and
   puff_trust (how much Puff trusts the pilot, a count).
   Music: the memory plays mus_memory (03_audio.js), the song the black hole was singing, built up by mood.progress
   through the trial, double-time at "FASTER." (mood.urgency) and resolved when he survives (mood.done); it sinks under
   the voices. Waking up hands the mission's track back. */
(function (SL) {
  'use strict';

  const U = SL.util;
  const TAU = Math.PI * 2;
  const TRIAL_LEN = 45;       // seconds of swimming in the memory trial
  const PULL_TIME = 2.6;      // seconds from the tether snapping to Puff vanishing over the horizon

  const PS = SL.puffStory = { buddy: null, state: 'off', memoryDone: false, talkReady: false };

  function flags() {
    const d = SL.save.data;
    if (!U.isPlain(d.flags)) d.flags = {};
    return d.flags;
  }
  function say(who, text, opts) {
    if (SL.story && SL.story.say) SL.story.say(who, text, Object.assign({ force: true }, opts || {}));
  }
  function skipMemory() {
    const D = SL.debug;
    return !!(D && (D.autopilotMode || D.simulating || D.skipMinigames || (D.params && D.params.test)));
  }
  function liveHole() {
    const list = SL.world.hazards;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      if (!h.dead && h.typeId === 'black_hole') return h;
    }
    return null;
  }

  // ------------------------------------------------------------------ radio character
  if (SL.story && SL.story.characters) {
    SL.story.characters.puff = {
      name: 'PUFF', role: 'Buddy', color: '#ffd35a',
      portrait(ctx, w, h, t, talking) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#1d6f93');
        g.addColorStop(1, '#06243a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(220,245,255,0.35)';
        for (let i = 0; i < 5; i++) {
          const y = ((h - ((t * 18 + i * 23) % (h + 10))) + h) % h;
          ctx.beginPath();
          ctx.arc(w * (0.15 + 0.17 * i), y, 2 + (i % 3), 0, TAU);
          ctx.fill();
        }
        if (SL.puff && SL.puff.drawBuddy) {
          const L = talking ? 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(t * 18)) : 0.22;
          SL.puff.drawBuddy(ctx, w * 0.46, h * 0.54, w * 0.26, t, '', 0, L);
        }
      },
    };
  }

  // ------------------------------------------------------------------ the buddy in his bubble
  const BUBBLE_R = 26;
  const BUDDY = {
    r: BUBBLE_R,
    manualMove: true,
    offscreenKill: false,
    hittable: false,
    init(e) {
      e.data.state = 'follow';
      e.data.t = 0;
      e.data.tether = 1;
      e.data.mood = '';
    },
    update(e, dt) {
      const d = e.data;
      d.t += dt;
      const p = SL.world.players[0];
      const fx = p ? p.x - 64 : e.x, fy = p ? p.y + 74 : e.y;
      if (d.state === 'follow') {
        const tx = fx + Math.sin(d.t * 1.3) * 8, ty = fy + Math.sin(d.t * 2.1) * 6;
        e.x += (tx - e.x) * Math.min(1, 5 * dt);
        e.y += (ty - e.y) * Math.min(1, 5 * dt);
        d.tether = Math.min(1, d.tether + dt * 2);
      } else if (d.state === 'pulled') {
        const h = d.hole && !d.hole.dead ? d.hole : null;
        if (h) { d.hx = h.x; d.hy = h.y; }
        d.u = Math.min(1, d.u + dt / PULL_TIME);
        const k = SL.ease.inQuad(d.u);
        const rad = d.r0 * (1 - k);
        const a = d.a0 + k * 4.2;
        e.x = d.hx + Math.cos(a) * rad;
        e.y = d.hy + Math.sin(a) * rad;
        e.scale = 1 - 0.85 * k;
        e.rot = a + Math.PI / 2;
        if (d.u >= 1) {
          d.state = 'gone';
          if (d.onGone) { const f = d.onGone; d.onGone = null; f(); }
        }
      } else if (d.state === 'return') {
        d.u = Math.min(1, d.u + dt / 1.5);
        const k = SL.ease.outCubic(d.u);
        e.x = U.lerp(d.hx, fx, k);
        e.y = U.lerp(d.hy, fy, k);
        e.scale = 0.3 + 0.7 * k;
        e.rot *= 0.9;
        d.tether = k;
        if (d.u >= 1) { d.state = 'follow'; e.scale = 1; e.rot = 0; }
      }
    },
    draw(e, ctx) {
      const d = e.data;
      if (d.state === 'gone') return;
      const p = SL.world.players[0];
      // tether to the jet
      if (p && p.alive && d.tether > 0.02 && d.state !== 'pulled') {
        ctx.save();
        ctx.globalAlpha = 0.55 * d.tether;
        ctx.strokeStyle = '#9fe8ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -d.t * 30;
        ctx.beginPath();
        ctx.moveTo(p.x - 8, p.y + 30);
        ctx.quadraticCurveTo((p.x + e.x) / 2 - 12, (p.y + e.y) / 2 + 20, U.lerp(p.x, e.x, d.tether), U.lerp(p.y + 30, e.y, d.tether));
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.rot || 0);
      ctx.scale(e.scale, d.state === 'pulled' ? e.scale * (1 + d.u * 1.6) : e.scale);
      // water bubble
      const g = ctx.createRadialGradient(-8, -8, 2, 0, 0, BUBBLE_R);
      g.addColorStop(0, 'rgba(200,245,255,0.55)');
      g.addColorStop(0.7, 'rgba(60,170,220,0.38)');
      g.addColorStop(1, 'rgba(140,225,255,0.75)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, BUBBLE_R, 0, TAU);
      ctx.fill();
      // Puff faces the way the jet flies (world up)
      if (SL.puff && SL.puff.drawBuddy) {
        ctx.save();
        ctx.rotate(-Math.PI / 2);
        SL.puff.drawBuddy(ctx, 0, 0, 13, d.t, d.mood, 0, d.state === 'pulled' ? 0.9 : 0.15 + 0.05 * Math.sin(d.t * 3));
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(230,250,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, BUBBLE_R, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(-9, -12, 6, 3, -0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    },
  };

  PS.spawnBuddy = function () {
    const p = SL.world.players[0];
    PS.buddy = SL.spawnAlly(BUDDY, { x: p ? p.x - 64 : SL.W / 2, y: p ? p.y + 140 : SL.H - 120 });
    PS.state = 'aboard';
    return PS.buddy;
  };

  // ------------------------------------------------------------------ the black hole
  /** Timeline hook (m1): Puff hears the black hole, then the tether snaps and he is pulled in. */
  PS.blackHole = function () {
    const b = PS.buddy;
    if (!b || b.dead || PS.state !== 'aboard') return;
    say('puff', 'That thing is singing. I know that song.');
    SL.after(2.2, snap);
  };

  function snap() {
    const b = PS.buddy, h = liveHole();
    if (!b || b.dead || !h) return;
    const d = b.data;
    PS.state = 'pulled';
    d.state = 'pulled';
    d.mood = 'ouch';
    d.hole = h;
    d.hx = h.x;
    d.hy = h.y;
    d.r0 = Math.max(60, U.dist(b.x, b.y, h.x, h.y));
    d.a0 = Math.atan2(b.y - h.y, b.x - h.x);
    d.u = 0;
    d.onGone = swallowed;
    if (SL.fx) {
      SL.fx.sparks(b.x, b.y, { count: 14, color: '#9fe8ff', speed: 260 });
      SL.fx.shake(6, 0.4);
    }
    say('puff', 'No. No, not again! {callsign}!', { priority: true });
    SL.after(1.2, () => say('anvil', 'Puff\'s tether is gone! Hold your course, {callsign}. You can\'t follow him in.', { priority: true }));
  }

  function swallowed() {
    PS.state = 'inside';
    if (SL.fx) {
      SL.fx.flash('#e8d8ff', 0.7, 0.5);
      SL.fx.slowmo(0.35, 0.8);
    }
    SL.after(0.6, startMemory);
  }

  function startMemory() {
    const G = SL.game;
    if (G.state !== 'mission' || !G.session) return;
    if (skipMemory() || !(SL.puff && SL.puff.openScenario)) { endMemory(); return; }
    G.pause('story');
    if (SL.hud && SL.hud.touchButtons) SL.hud.touchButtons(false);
    PS.musicBefore = (SL.audio && SL.audio.current) || null;
    SL.puff.openScenario(PS.memoryScenario(endMemory));
  }

  /** Developer skip (27_devtools.js): ends the memory now, as if the player had finished it. */
  PS.skipMemory = function () {
    if (PS.state !== 'inside' || PS.memoryDone) return false;
    endMemory();
    return true;
  };

  function endMemory() {
    stopVO();
    if (PS.musicBefore && SL.audio && SL.audio.music) SL.audio.music(PS.musicBefore, { fade: 2 });
    PS.musicBefore = null;
    // lines queued before the memory (the tether snapping) are stale now
    if (SL.story && SL.story.clear) SL.story.clear();
    const f = flags();
    f.puff_memory1 = true;
    f.unlock_puff = true;
    SL.save.commit();
    if (SL.ui && SL.ui.current === 'puff') SL.ui.hide();
    if (SL.game.pauseReason === 'story') SL.game.resume('story');
    PS.state = 'aboard';
    const b = PS.buddy;
    if (b && !b.dead) {
      const d = b.data, h = liveHole();
      d.hx = h ? h.x : SL.W / 2;
      d.hy = h ? h.y : 120;
      d.state = 'return';
      d.u = 0;
      d.mood = '';
    }
    PS.memoryDone = true;
    SL.after(0.8, () => say('anvil', 'Got him! Reel him in, {callsign}.', { priority: true }));
    SL.after(3.2, () => say('puff', '...I\'m okay. Don\'t ask. Not yet.'));
    SL.after(6.2, () => { PS.talkReady = true; });
  }

  // ------------------------------------------------------------------ trust
  if (SL.story && SL.story.choices) {
    SL.story.choices.puff_trust1 = {
      prompt: 'Puff is curled up tight in his bubble, spines out, staring back at the black hole.',
      options: [{ id: 'ask', text: 'Ask what he saw' }, { id: 'space', text: 'Give him space' }],
    };
  }
  /** Timeline hook after the puff_trust1 choice: Puff answers, and giving him space earns his trust. */
  PS.trustReply = function (choice) {
    const b = PS.buddy;
    if (choice === 'space') {
      const f = flags();
      f.puff_trust = (+f.puff_trust || 0) + 1;
      SL.save.commit();
      if (b && !b.dead) b.data.mood = 'happy';
      say('puff', '...Thanks, {callsign}. I owe you one.', { priority: true });
      SL.after(2, () => { if (b && !b.dead) b.data.mood = ''; });
    } else {
      if (b && !b.dead) b.data.mood = 'ouch';
      say('puff', 'Not now. Please.', { priority: true });
      SL.after(2, () => { if (b && !b.dead) b.data.mood = ''; });
    }
  };

  // ------------------------------------------------------------------ the memory: The First Trial
  // [second, on-screen text, voice clip id]
  const VOICE = [
    [1.2, 'SUBJECT ACCEPTED. THE FIRST TRIAL BEGINS.', 'memory1_voice_1'],
    [11, 'YOUR WORLD IS WATCHING, LITTLE FISH.', 'memory1_voice_2'],
    [22, 'SURVIVE OUR TRIALS AND YOUR SEA WILL BE HEALED. THAT IS OUR PROMISE.', 'memory1_voice_3'],
    [34, 'FASTER.', 'memory1_voice_4'],
  ];
  const THOUGHTS = [
    [6, 'I never said yes. Nobody asked.', 'memory1_puff_1'],
    [28, 'Keep swimming. For the reef. For everyone.', 'memory1_puff_2'],
  ];
  const INTRO = [
    ['Past the horizon the stars go quiet, and Puff is home again.', 'memory1_intro_1'],
    ['His ocean world was coral and light once, until the corporations bled it dark. Then the Directorate came, and they called it a game: survive our trials, and we will give you the power to heal your world.', 'memory1_intro_2'],
    ['He was the only one who could breathe that water long enough. Nobody asked him if he wanted to play.', 'memory1_intro_3'],
  ];
  const ENDING = [
    ['Subject survives. Proceed to trial two.', 'memory1_end_1'],
    ['There were more trials. There was always one more.', 'memory1_end_2'],
  ];

  // ------------------------------------------------------------------ the memory's voices
  // window.PUFF_VO (tools/build.py, from narration/audio/memory1_*.mp3) maps a clip id to [URL, seconds, text]. A clip
  // plays only if its text still matches the screen (ignoring case), so a reworded line is silent, never wrong.
  // Two players: the narration and the Directorate share one, Puff's thoughts have their own so lines can overlap.
  const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function clip(id, text) {
    const c = window.PUFF_VO && window.PUFF_VO[id];
    return c && norm(c[2]) === norm(text) ? c : null;
  }
  const players = {};
  function voiceHush() {
    let on = false;
    for (const k in players) if (!players[k].paused) on = true;
    if (SL.audio && SL.audio.hush) SL.audio.hush('memory_voice', on ? 0.45 : 0);
  }
  function player(ch) {
    if (!players[ch] && typeof Audio === 'function') {
      const a = players[ch] = new Audio();
      for (const ev of ['playing', 'pause', 'ended']) a.addEventListener(ev, voiceHush);
    }
    return players[ch] || null;
  }
  function mood(name, v) { if (SL.audio && SL.audio.mood) SL.audio.mood(name, v); }
  let seqToken = 0;
  function stopVO() {
    seqToken++;
    for (const k in players) { try { players[k].pause(); } catch (e) { /* no audio */ } players[k].onended = null; }
  }
  /** Plays [text, id] pairs one after another on one channel. Moves on when a clip ends, or after its length if
      the browser never says so; a newer sequence or stopVO() cancels this one. */
  function playSeq(list, ch) {
    const a = player(ch || 'main');
    if (!a || (SL.audio && SL.audio.muted)) return;
    const token = ++seqToken;
    let i = 0, step = 0;
    const next = (from) => {
      if (token !== seqToken || from !== step) return;
      step++;
      while (i < list.length) {
        const c = clip(list[i][1], list[i][0]);
        i++;
        if (!c) continue;
        const me = step;
        a.src = c[0];
        a.currentTime = 0;
        a.onended = () => next(me);
        setTimeout(() => { if (!a.heldByPause) next(me); }, (+c[1] + 0.4) * 1000);
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
        return;
      }
      a.onended = null;
    };
    try { a.pause(); } catch (e) { /* no audio */ }
    next(0);
  }
  /** How long a timed trial line stays on screen: 4.5 s, or until its voice ends. */
  function lineDur(entry) {
    const c = clip(entry[2], entry[1]);
    return Math.max(4.5, c ? +c[1] + 0.6 : 0);
  }

  PS.memoryScenario = function (onDone) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDone();
    };
    return {
      id: 'memory1',
      intro(api) {
        if (SL.audio && SL.audio.music) SL.audio.music('mus_memory', { fade: 2, mood: { progress: 0, urgency: 0, done: 0 } });
        const p0 = api.panel('sl-puff__overlay--intro sl-puff__overlay--memory');
        const [p, side] = api.cols(p0);
        p.append(api.el('div', 'sl-label', 'A memory'), api.el('h2', 'sl-title sl-title--md sl-puff__title', 'The First Trial'));
        [
          'Past the horizon the stars go quiet, and Puff is home again.',
          'His ocean world was coral and light once, until the corporations bled it dark. Then the Directorate came, and they called it a game: survive our trials, and we will give you the power to heal your world.',
          'He was the only one who could breathe that water long enough. Nobody asked him if he wanted to play.',
        ].forEach((t) => p.appendChild(api.el('p', 'sl-puff__story', t)));
        playSeq(INTRO);
        const b = api.el('div', 'sl-stack');
        b.append(
          api.btn('Remember with your voice', 'sl-btn--primary', () => { stopVO(); api.startVoice(); }),
          api.btn('Remember with keys or touch', '', () => { stopVO(); api.startKeys(); }));
        if (flags().puff_memory1) b.append(api.btn('Skip memory', 'sl-btn--ghost', () => { stopVO(); finish(); }));
        side.appendChild(b);
        side.appendChild(api.el('p', 'sl-puff__note', 'Voice: get loud to puff him up, go quiet to sink. Keys: hold Space to puff up, let go to sink. Survive ' + TRIAL_LEN + ' seconds.'));
        api.focusFirst();
      },
      step(R, dt, api) {
        // the Directorate and Puff speak at their second marks (once per run; a replay starts over)
        if (!R.voFired) R.voFired = {};
        for (const [list, ch] of [[VOICE, 'main'], [THOUGHTS, 'puff']]) {
          for (const e of list) {
            if (R.t >= e[0] && !R.voFired[e[2]] && !R.over) {
              R.voFired[e[2]] = true;
              if (R.t - e[0] < 1) playSeq([[e[1], e[2]]], ch);
            }
          }
        }
        if (R.over) stopVO();
        mood('progress', R.t / TRIAL_LEN);
        mood('urgency', R.t >= VOICE[3][0] ? 1 : 0);
        if (R.t < TRIAL_LEN || R.over) return true;
        api.stopRun();
        mood('done', 1);
        playSeq(ENDING);
        const [p, side] = api.cols(api.panel('sl-puff__overlay--memory'));
        p.append(api.el('div', 'sl-label', 'A memory'), api.el('h2', 'sl-title sl-title--md sl-puff__title', 'Trial one: survived'));
        p.appendChild(api.el('p', 'sl-puff__story', 'The water went still. A voice from everywhere at once: "Subject survives. Proceed to trial two."'));
        p.appendChild(api.el('p', 'sl-puff__story', 'There were more trials. There was always one more.'));
        const b = api.el('div', 'sl-stack');
        b.append(api.btn('Wake up', 'sl-btn--primary', () => { stopVO(); finish(); }));
        side.appendChild(b);
        api.focusFirst();
        return false;
      },
      onOver(R, api) {
        const [p, side] = api.cols(api.panel('sl-puff__overlay--memory'));
        p.append(api.el('div', 'sl-label', 'A memory'), api.el('h2', 'sl-title sl-title--md sl-puff__title', 'That\'s not how it happened.'));
        p.appendChild(api.el('p', 'sl-puff__story', 'He didn\'t fail. He couldn\'t. Again.'));
        const b = api.el('div', 'sl-stack');
        b.append(api.btn('Again', 'sl-btn--primary', () => api.restart()), api.btn('Skip memory', 'sl-btn--ghost', () => finish()));
        side.appendChild(b);
        if (api.mode() === 'voice') side.appendChild(api.el('p', 'sl-puff__note', 'Hands-free: hum for a second to try again.'));
        api.focusFirst();
      },
      skip() { finish(); },
      // the memory looks wrong: a violet cast, dark edges, and now and then a tear across the picture
      drawOver(ctx, R, api) {
        const W = api.W(), H = api.H;
        ctx.save();
        ctx.fillStyle = 'rgba(46,16,72,0.26)';
        ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.78);
        g.addColorStop(0, 'rgba(10,0,20,0)');
        g.addColorStop(1, 'rgba(10,0,20,0.6)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const tear = Math.sin(R.scroll * 0.7) > 0.93;
        if (tear) {
          const y = (R.scroll * 431) % H;
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(180,120,255,0.18)';
          ctx.fillRect(0, y, W, 6 + (R.scroll * 97) % 18);
        }
        ctx.restore();
      },
      drawHud(ctx, R, api) {
        const s = SL.puff.state;
        // the trial's voices hold while the minigame is paused
        for (const k in players) {
          const a = players[k];
          if (s === 'paused' && !a.paused) { a.pause(); a.heldByPause = true; }
          else if (s === 'play' && a.heldByPause) { a.heldByPause = false; const p = a.play(); if (p && p.catch) p.catch(() => {}); }
        }
        if (s !== 'play' && s !== 'paused') return;
        const W = api.W(), k = api.hudK();
        ctx.save();
        // below the minigame's own top-center banners (weather names)
        ctx.translate(W / 2, api.SURFACE + 120 * k);
        ctx.scale(k, k);
        // trial progress
        const w = 300;
        ctx.fillStyle = 'rgba(20,6,34,0.6)';
        ctx.fillRect(-w / 2 - 4, -4, w + 8, 16);
        ctx.fillStyle = '#c69bff';
        ctx.fillRect(-w / 2, 0, w * U.clamp(R.t / TRIAL_LEN, 0, 1), 8);
        api.label(ctx, 'TRIAL 1', 0, -12, '700 15px Oxanium, sans-serif', 'rgba(230,210,255,0.95)', 'center');
        // the Directorate speaks; Puff thinks
        const show = (list, y, font, color) => {
          for (const e of list) {
            const [at, text] = e, dur = lineDur(e);
            const a = R.t - at;
            if (a < 0 || a > dur) continue;
            ctx.globalAlpha = Math.min(1, a / 0.4, (dur - a) / 0.8);
            api.label(ctx, text, 0, y, font, color, 'center');
          }
          ctx.globalAlpha = 1;
        };
        show(VOICE, 52, '800 20px Oxanium, sans-serif', '#d9b8ff');
        show(THOUGHTS, 84, 'italic 600 18px "Barlow Semi Condensed", sans-serif', '#ffffff');
        ctx.restore();
      },
    };
  };

  // ------------------------------------------------------------------ mission wiring
  SL.onBoot(() => {
    SL.bus.on('missionStart', (e) => {
      PS.buddy = null;
      PS.state = 'off';
      PS.memoryDone = false;
      PS.talkReady = false;
      if (e && e.mission && e.mission.puffBuddy) PS.spawnBuddy();
    });
    SL.bus.on('missionEnd', () => { PS.buddy = null; PS.state = 'off'; });
  });
})(window.SL = window.SL || {});
