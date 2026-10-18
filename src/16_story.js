/* STUB: replaced by story
   16_story.js provides: SL.story = { characters, briefings, lines, choices, radio(idOrObj, opts), say(who, text,
   opts), choice(id) -> Promise<optionId>, autoChoose(), clear(), update(realDt) }.
   Radio lines queue (max 4, per-line cooldown 12 s, opts.priority jumps the queue, opts.force skips the
   cooldown) and play in a DOM box in #ui with a typewriter, an animated portrait canvas and music ducking.
   choice(id) pauses with SL.game.pause('choice'), shows two buttons, writes session.flags[id] and save.choices,
   resumes with SL.game.resume('choice') and resolves; autoChoose() picks the first option (autopilot).
   {callsign} in text becomes the player's callsign. 21_game.js calls update(realDt) every unpaused frame. */
(function (SL) {
  'use strict';

  const U = SL.util;
  const TAU = Math.PI * 2;

  function portrait(color, visor) {
    return function (ctx, w, h, t, talking) {
      const cx = w / 2;
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, SL.color.mix(color, '#05070f', 0.72));
      bg.addColorStop(1, '#04050b');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = SL.color.rgba(color, 0.18);
      ctx.lineWidth = 1;
      for (let y = (t * 18) % 6; y < h; y += 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      const helm = new Path2D();
      helm.ellipse(cx, h * 0.56, w * 0.3, h * 0.36, 0, 0, TAU);
      const g = ctx.createLinearGradient(cx - w * 0.3, h * 0.2, cx + w * 0.3, h * 0.9);
      g.addColorStop(0, '#e9eef7');
      g.addColorStop(0.45, '#8994ab');
      g.addColorStop(1, '#2a3040');
      ctx.fillStyle = g;
      ctx.fill(helm);
      const vis = new Path2D();
      vis.ellipse(cx, h * 0.55, w * 0.22, h * 0.14, 0, 0, TAU);
      const vg = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.7);
      vg.addColorStop(0, visor);
      vg.addColorStop(1, '#060a14');
      ctx.fillStyle = vg;
      ctx.fill(vis);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(cx - w * 0.09, h * 0.5, w * 0.07, h * 0.025, -0.3, 0, TAU);
      ctx.fill();
      const open = talking ? 0.4 + 0.6 * Math.abs(Math.sin(t * 17)) : 0.15;
      ctx.fillStyle = SL.color.rgba(color, 0.9);
      ctx.fillRect(cx - w * 0.1, h * 0.79, w * 0.2, Math.max(1, h * 0.03 * open * 2));
    };
  }

  const S = SL.story = {
    characters: {
      anvil: { name: 'ANVIL', role: 'Command', color: '#ffb53f', portrait: portrait('#ffb53f', '#ffd27a') },
      sparrow: { name: 'SPARROW', role: 'Wing', color: '#3fc8ff', portrait: portrait('#3fc8ff', '#9fe8ff') },
    },
    briefings: {
      test: { title: 'Test Range', text: 'Core systems check: waves, a gravity well, rescues and the Calibrator.' },
    },
    lines: {
      test_hello: { who: 'anvil', text: 'Starlance, {callsign}: weapons free. Clear the range.' },
      test_blackhole: { who: 'sparrow', text: 'Gravity well ahead! Keep your thrust up and stay off the rim.' },
      test_boss: { who: 'anvil', text: 'Big contact inbound. Hit the core between its volleys.' },
      test_victory: { who: 'anvil', text: 'Target down. Good flying, {callsign}. Bring it home.' },
      rescue_thanks: { who: 'sparrow', text: 'Pod secured. They say thanks, {callsign}!' },
      // m2, Deep Pull (GDD 16.2; Patch's and Osei's lines go to Anvil and Sparrow until those characters exist)
      m2_open: { who: 'anvil', text: 'Kerr Station is breaking up. Clear a path for the lifeboats.' },
      m2_puff_open: { who: 'puff', text: 'Another black hole. Keep the tether short, {callsign}.' },
      m2_spears: { who: 'sparrow', text: 'Spears lock on, then ram. When the nose glows red, sidestep!' },
      m2_needlers: { who: 'sparrow', text: 'Snipers. See the red line? That\'s where the shot goes. Don\'t be there.' },
      m2_weaver: { who: 'sparrow', text: 'Weaver! Spiral guns. Circle with the spiral, not against it.' },
      m2_eye: { who: 'anvil', text: 'That\'s Kerr\'s Eye ahead. A black hole on a leash. Stay sharp.' },
      m2_puff_eye: { who: 'puff', text: 'It isn\'t singing. Good. Keep it that way.' },
      m2_lance: { who: 'anvil', text: 'Lance cell! A beam that cuts through everything in a line. Try it.' },
      m2_bh_warn: { who: 'anvil', text: 'Gravity well! It pulls you in. Don\'t use focus near it, you\'ll lose speed.' },
      m2_bh_eat: { who: 'sparrow', text: 'Ha! It ate their drones. Your shots bend around it too. Use that.' },
      m2_tug: { who: 'anvil', text: 'Tug ship towing a black hole. Kill it and the hole drifts loose.' },
      m2_puff_tug: { who: 'puff', text: 'They tow them around like cargo. Like it\'s nothing.' },
      m2_vip: { who: 'anvil', text: 'VIP pod falling toward that hole. Grab it before the horizon does!' },
      m2_vip_saved: { who: 'sparrow', text: 'Got her! Dr. Osei, Lagrange Deep. She says you\'re crazy, {callsign}. In a good way.' },
      m2_station: { who: 'sparrow', text: 'Lifeboats are clear of the station. Nice flying, {callsign}!' },
      m2_boss_warn: { who: 'anvil', text: 'Big signature on the end of the leash. The siege engine. Cut it loose.' },
      m2_boss_p2: { who: 'anvil', text: 'Its pull is climbing! Stay fast. It can\'t hold a ship at full speed.' },
      m2_boss_p3: { who: 'sparrow', text: 'Containment\'s failing and the hole is growing. Finish it fast!' },
      m2_win: { who: 'anvil', text: 'The leash is cut and the Eye is fading. Outstanding work, {callsign}.' },
      m2_puff_win: { who: 'puff', text: '...Still here. Thanks for keeping the tether short.' },
    },
    choices: {
      test_choice: {
        prompt: 'A distress beacon is pinging off the flight path. Divert to cover the pod?',
        options: [{ id: 'a', text: 'Divert and cover' }, { id: 'b', text: 'Hold formation' }],
      },
    },
  };

  // ------------------------------------------------------------------ radio box
  const queue = [];
  const lastPlayed = Object.create(null);
  let cur = null, gap = 0;
  let box = null, face = null, faceCtx = null, whoEl = null, textEl = null;

  function format(text) {
    const save = SL.save && SL.save.data;
    return String(text || '').replace(/\{callsign\}/g, (save && save.callsign) || 'Blue Arrow');
  }

  function ensureBox() {
    if (box) return true;
    const ui = document.getElementById('ui');
    if (!ui) return false;
    box = document.createElement('div');
    box.className = 'sl-radio';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    face = document.createElement('canvas');
    face.className = 'sl-radio__face';
    face.width = 96;
    face.height = 96;
    faceCtx = face.getContext('2d');
    const body = document.createElement('div');
    body.className = 'sl-radio__body';
    whoEl = document.createElement('div');
    whoEl.className = 'sl-radio__who';
    textEl = document.createElement('div');
    textEl.className = 'sl-radio__text';
    body.append(whoEl, textEl);
    box.append(face, body);
    ui.appendChild(box);
    return true;
  }

  // Voiced radio lines: window.RADIO_VO (built from narration/audio/radio_*.mp3 by tools/build.py) maps a line's
  // on-screen text to [audio URL, seconds]. A voiced line stays up until its clip ends; other lines stay silent.
  const voice = typeof Audio === 'function' ? new Audio() : null;
  function stopVoice() { if (voice) { try { voice.pause(); } catch (e) { /* no audio */ } } }
  function playVoice(text) {
    const vo = window.RADIO_VO && window.RADIO_VO[text];
    if (!vo || !voice || (SL.audio && SL.audio.muted)) return 0;
    voice.src = vo[0];
    voice.currentTime = 0;
    const p = voice.play();
    if (p && p.catch) p.catch(() => { /* autoplay blocked: stay silent */ });
    return +vo[1] || 0;
  }
  SL.onBoot(() => {
    SL.bus.on('pause', stopVoice);
    SL.bus.on('menu', stopVoice);
  });

  function startLine(item) {
    if (!ensureBox()) return;
    const ch = S.characters[item.who] || { name: String(item.who || 'RADIO').toUpperCase(), role: '', color: '#93a0ba', portrait: null };
    cur = { item, ch, t: 0, shown: -1, typeDur: item.text.length / 42, hold: 1.6 + item.text.length * 0.03, faceT: 0 };
    whoEl.textContent = ch.name + (ch.role ? ' · ' + ch.role : '');
    whoEl.style.color = ch.color;
    box.style.setProperty('--radio-color', ch.color);
    textEl.textContent = '';
    box.classList.add('is-on');
    stopVoice();
    const secs = playVoice(item.text);
    if (secs) cur.hold = Math.max(cur.hold, secs + 0.5 - cur.typeDur);
    if (SL.audio) {
      if (SL.audio.duck) SL.audio.duck(0.4, cur.typeDur + cur.hold);
      if (SL.audio.sfx) SL.audio.sfx('radio_in');
    }
  }

  function endLine() {
    cur = null;
    gap = 0.35;
    if (box) box.classList.remove('is-on');
  }

  S.radio = function (idOrObj, opts) {
    opts = opts || {};
    let line = null, id = null;
    if (typeof idOrObj === 'string') {
      id = idOrObj;
      line = S.lines[id];
      if (!line) { U.warnOnce('radio:' + id, 'unknown radio line "' + id + '"'); return false; }
    } else if (idOrObj && typeof idOrObj === 'object') {
      line = idOrObj;
      id = line.id || null;
    } else return false;
    const now = SL.time.real;
    if (id && !opts.force && lastPlayed[id] != null && now - lastPlayed[id] < (opts.cooldown || 12)) return false;
    if (queue.length >= 4 && !opts.priority) return false;
    const item = { id, who: line.who, text: format(line.text) };
    if (opts.priority) queue.unshift(item); else queue.push(item);
    if (id) lastPlayed[id] = now;
    return true;
  };

  S.say = function (who, text, opts) { return S.radio({ who, text }, opts); };

  S.clear = function () {
    stopVoice();
    queue.length = 0;
    endLine();
    gap = 0;
  };

  S.update = function (dt) {
    if (!cur) {
      if (gap > 0) { gap -= dt; return; }
      if (queue.length) startLine(queue.shift());
      return;
    }
    const speed = (SL.save && SL.save.settings && SL.save.settings.radioSpeed) || 1;
    cur.t += dt * speed;
    const text = cur.item.text;
    const n = Math.min(text.length, Math.floor((cur.t / Math.max(0.01, cur.typeDur)) * text.length));
    if (n !== cur.shown) { cur.shown = n; textEl.textContent = text.slice(0, n); }
    cur.faceT -= dt;
    if (cur.faceT <= 0 && cur.ch.portrait) {
      cur.faceT = 0.05;
      try { cur.ch.portrait(faceCtx, 96, 96, SL.time.real, n < text.length); } catch (err) { cur.ch.portrait = null; console.error('[SL.story] portrait threw:', err); }
    }
    if (cur.t > cur.typeDur + cur.hold) endLine();
  };

  // ------------------------------------------------------------------ choices
  let pending = null;

  S.choice = function (id) {
    const def = S.choices[id] || { prompt: id, options: [{ id: 'a', text: 'Option A' }, { id: 'b', text: 'Option B' }] };
    if (!S.choices[id]) U.warnOnce('choice:' + id, 'unknown choice "' + id + '"; showing placeholder options');
    if (pending) pending.finish(pending.def.options[0].id);
    return new Promise((resolve) => {
      const ui = document.getElementById('ui');
      const wrap = document.createElement('div');
      wrap.className = 'sl-choice';
      const panel = document.createElement('div');
      panel.className = 'sl-panel sl-choice__panel';
      const label = document.createElement('div');
      label.className = 'sl-label';
      label.textContent = 'Decision';
      const q = document.createElement('p');
      q.className = 'sl-choice__prompt';
      q.textContent = format(def.prompt);
      const row = document.createElement('div');
      row.className = 'sl-stack';
      panel.append(label, q, row);
      wrap.appendChild(panel);
      const p = { id, def, wrap, finish: null };
      p.finish = (opt) => {
        if (pending !== p) return;
        pending = null;
        stopVoice();
        wrap.remove();
        if (SL.audio && SL.audio.sfx) SL.audio.sfx('choice_pick');
        const s = SL.game.session;
        if (s) s.flags[id] = opt;
        const save = SL.save.data;
        const key = s ? s.missionId : id;
        const list = save.choices[key] || (save.choices[key] = []);
        if (list.indexOf(opt) < 0) list.push(opt);
        SL.save.commit();
        SL.bus.emit('choiceMade', { id, option: opt });
        SL.game.resume('choice');
        resolve(opt);
      };
      def.options.forEach((o, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sl-btn' + (i === 0 ? ' sl-btn--primary' : '');
        btn.textContent = format(o.text);
        btn.addEventListener('click', () => p.finish(o.id));
        row.appendChild(btn);
      });
      pending = p;
      SL.game.pause('choice');
      if (ui) ui.appendChild(wrap);
      if (SL.audio && SL.audio.sfx) SL.audio.sfx('choice_open');
      playVoice(q.textContent); // after the pause, which stops any radio voice
      const first = row.querySelector('button');
      if (first) first.focus({ preventScroll: true });
    });
  };

  S.autoChoose = function () {
    if (pending) pending.finish(pending.def.options[0].id);
  };

  SL.onBoot(() => {
    SL.bus.on('missionStart', S.clear);
    SL.bus.on('missionEnd', () => {
      S.clear();
      if (pending) { const p = pending; pending = null; p.wrap.remove(); }
    });
    // Mission cues played on game events when the mission has them (GDD 16.1): <mission>_vip, _vip_saved, _boss_intro,
    // _boss_p<N>. A mission with its own _boss_warn schedules it, so the generic boss line stays out of the way.
    const cue = (suffix) => {
      const s = SL.game.session;
      const id = s && s.missionId + '_' + suffix;
      if (id && S.lines[id]) S.radio(id, { priority: true, force: true });
      return !!(id && S.lines[id]);
    };
    const own = (suffix) => { const s = SL.game.session; return !!(s && S.lines[s.missionId + '_' + suffix]); };
    SL.bus.on('bossWarning', () => { if (S.lines.test_boss && !own('boss_warn')) S.radio('test_boss'); });
    SL.bus.on('bossIntroDone', () => cue('boss_intro'));
    SL.bus.on('bossPhase', (e) => { if (e && e.phase > 0) cue('boss_p' + (e.phase + 1)); });
    SL.bus.on('podSpawn', (e) => { if (e && e.pod && e.pod.data.vip) cue('vip'); });
    SL.bus.on('podRescued', (e) => { if (e && e.vip) cue('vip_saved'); });
  });

  SL.debug.sandbox('portraits', () => {
    const ids = Object.keys(S.characters);
    let i = 0, t = 0;
    return (dt) => {
      t -= dt;
      if (t > 0) return;
      t = 3.5;
      const id = ids[i++ % ids.length];
      S.say(id, 'Comms check from ' + S.characters[id].name + '. Reading you loud and clear.', { force: true });
    };
  }, { name: 'Portraits' });
})(window.SL = window.SL || {});
