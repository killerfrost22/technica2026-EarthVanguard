/* 03_audio.js (audio)
   Provides: SL.audio = { unlock(), sfx(id, {vol, pitch, pan, x}), loop(id, opts) -> {set, stop},
   music(trackId, {fade, bar, mood, restart}), stopMusic(fade), duck(amount, seconds), hush(key, amount),
   mood(name, value), setVolumes({master, music, sfx}), render(trackId, seconds, mood), ready, muted, current, ids(),
   tracks() }.
   Everything is WebAudio synthesis (GDD section 17), no audio files. Mix: master -> compressor -> speakers; an SFX
   bus with a short room reverb; a music bus with its own hall reverb and a duck stage (radio lines, pause, hushes).
   Both reverbs return into their bus, so the music and SFX volumes cover the tails too. Repeating sounds are
   rate-limited per id and use x (0..SL.W) for stereo pan. Unknown ids warn once and play nothing.
   Music is a step sequencer scheduled a little ahead of the audio clock. mus_m1 (140 BPM, E minor) pumps: every
   kick ducks the bass, pad and arp bus, so the synths breathe with the drums. 'm1' and 'boss' alias mus_m1 and
   mus_boss; mus_miniboss and mus_boss_heavy are the boss track at their own tempo and key.
   Every stage has a track for its mood (docs/api/audio.md has the list): the title theme, the cutscene themes
   (src/26_cutscenes.js maps scenes.js cues onto them), Echo, Puff's Ocean, Puff's memory, the black hole in Mission 1
   (and Mission 2), the storm of Mission 3 (mus_m3: distorted bass, stabs, toms, thunder), Mission 4's blue giant
   (mus_m4), victory and failure. Tracks can read live mood values (A.mood): Echo's alarm sets 'tension', Puff's
   memory sets 'progress' and 'urgency', the prologue's fire sets 'intensity', Mission 4's eclipse sets 'eclipse'.
   A.hush(key, amount) holds the music down while something else needs the room: a voice line, a minigame pause, or
   Puff's Ocean's microphone (music off).
   Also reacts to bus events: the title screen (title theme), boss warning, checkpoint, low hull, shield break, player
   down, pause (music ducks), boss defeated (music fades out), mission end (victory track, or a fail sting into the
   fail track) and menu (music stops unless the title is up). Echo and Puff's Ocean keep their own sound effects.
   Core calls unlock() on the first gesture; ?mute=1 sets muted. */
(function (SL) {
  'use strict';

  let ac = null;
  let master = null, sfxBus = null, musicBus = null, duckGain = null, verbSend = null, musicVerb = null, noiseB = null;
  const vol = { master: 0.9, music: 0.7, sfx: 0.85 };
  let muted = false;
  let duckLevel = 1, pauseLevel = 1, duckUntil = 0;
  const hushes = Object.create(null); // key -> how far that thing holds the music down (0..1)
  const moods = Object.create(null);  // live values the playing track reads (A.mood)
  const warned = new Set();
  const lastAt = Object.create(null);
  const GAP = { hit_enemy: 0.07, enemy_fire: 0.07, credit: 0.03, shot_pulse: 0.05, shot_spread: 0.05 };

  function warnOnce(k, msg) {
    if (warned.has(k)) return;
    warned.add(k);
    console.warn('[SL] audio: ' + msg);
  }
  function live() { return ac && ac.state === 'running'; }
  function applyVolume() {
    if (!ac) return;
    const t = ac.currentTime;
    master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.02);
    sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.02);
    musicBus.gain.setTargetAtTime(vol.music * 0.9, t, 0.05);
  }
  function hushLevel() {
    let h = 0;
    for (const k in hushes) h = Math.max(h, hushes[k]);
    return 1 - h;
  }
  function applyDuck(tc) {
    if (ac) duckGain.gain.setTargetAtTime(Math.max(0.0001, Math.min(duckLevel, pauseLevel, hushLevel())), ac.currentTime, tc || 0.12);
  }

  /** Decaying stereo noise as a reverb impulse. `dark` makes the tail lose its highs as it fades, like a real hall. */
  function impulse(seconds, power, dark) {
    const len = Math.floor(ac.sampleRate * seconds);
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len, w = Math.random() * 2 - 1;
        lp += (w - lp) * (dark ? 0.92 - 0.8 * k : 1);
        d[i] = lp * Math.pow(1 - k, power);
      }
    }
    return ir;
  }
  function noiseBuffer() {
    const n = ac.sampleRate * 2;
    const b = ac.createBuffer(1, n, ac.sampleRate);
    const nd = b.getChannelData(0);
    for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
    return b;
  }
  /** The music hall: a long, dark reverb that every track sends to (music() and render() each build one). */
  function makeMusicVerb(into) {
    const v = ac.createConvolver();
    v.buffer = impulse(2.6, 2.2, true);
    const send = ac.createGain();
    send.gain.value = 0.3;
    send.connect(v);
    v.connect(into);
    return send;
  }

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ac.destination);
    sfxBus = ac.createGain();
    sfxBus.connect(master);
    musicBus = ac.createGain();
    duckGain = ac.createGain();
    musicBus.connect(duckGain);
    duckGain.connect(master);
    // short SFX room: decaying noise as the impulse, returned into the SFX bus so the SFX volume covers the tail
    const verb = ac.createConvolver();
    verb.buffer = impulse(1.4, 3, false);
    verbSend = ac.createGain();
    verbSend.gain.value = 0.26;
    verbSend.connect(verb);
    verb.connect(sfxBus);
    musicVerb = makeMusicVerb(musicBus);
    noiseB = noiseBuffer();
    // a context that starts (or comes back) suspended plays the waiting track once it runs
    // ready tracks the real state, so input keeps calling unlock() on each gesture until the context runs
    ac.onstatechange = () => { A.ready = live(); startPending(); };
    applyVolume();
    applyDuck(0.01);
    return true;
  }
  function startPending() {
    if (A.current && !mus.cur && live()) A.music(A.current, { fade: 1 });
  }

  // ------------------------------------------------------------------ voices
  // c = { t: start time, out: destination node, v: volume, p: pitch multiplier }
  function env(g, t, peak, a, dur, lin) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (lin) g.gain.linearRampToValueAtTime(0.0001, t + dur);
    else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(c, type, f0, f1, dur, gain, o) {
    o = o || {};
    const t = c.t + (o.at || 0);
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0 * c.p, t);
    if (f1 && f1 !== f0) {
      if (o.lin) osc.frequency.linearRampToValueAtTime(f1 * c.p, t + (o.glide || dur));
      else osc.frequency.exponentialRampToValueAtTime(f1 * c.p, t + (o.glide || dur));
    }
    if (o.detune) osc.detune.value = o.detune;
    const g = ac.createGain();
    env(g, t, gain * c.v, o.a || 0.005, dur, o.linEnv);
    let node = osc;
    if (o.lp) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, t + dur);
      f.Q.value = o.q || 1;
      osc.connect(f);
      node = f;
    }
    if (o.trem) {
      const l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = o.trem;
      lg.gain.value = gain * c.v * 0.5;
      l.connect(lg);
      lg.connect(g.gain);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    node.connect(g);
    g.connect(o.out || c.out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }
  function noise(c, dur, gain, o) {
    o = o || {};
    const t = c.t + (o.at || 0);
    const s = ac.createBufferSource();
    s.buffer = noiseB;
    s.loop = true;
    if (o.rate) s.playbackRate.value = o.rate;
    const f = ac.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.f0 || 2000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide || dur));
    f.Q.value = o.q || 0.8;
    const g = ac.createGain();
    if (o.swell) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * c.v, t + dur * o.swell);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } else env(g, t, gain * c.v, o.a || 0.003, dur);
    s.connect(f);
    f.connect(g);
    g.connect(o.out || c.out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }
  // FM bell / glassy ping
  function bell(c, f, dur, gain, o) {
    o = o || {};
    const t = c.t + (o.at || 0);
    const car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
    car.frequency.value = f * c.p;
    mod.frequency.value = f * c.p * (o.ratio || 3.5);
    mg.gain.setValueAtTime(f * c.p * (o.index || 2), t);
    mg.gain.exponentialRampToValueAtTime(1, t + dur);
    mod.connect(mg);
    mg.connect(car.frequency);
    env(g, t, gain * c.v, 0.004, dur);
    car.connect(g);
    g.connect(o.out || c.out);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }
  function thump(c, f0, f1, dur, gain, at) { tone(c, 'sine', f0, f1, dur, gain, { at, a: 0.002 }); }
  function arp(c, type, freqs, step, dur, gain, o) {
    freqs.forEach((f, i) => tone(c, type, f, f, dur, gain, Object.assign({}, o, { at: ((o && o.at) || 0) + i * step })));
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ------------------------------------------------------------------ sfx recipes
  function explosion(c, dur, lp0, lp1, sub, gain) {
    noise(c, dur, 0.9 * gain, { f0: lp0, f1: lp1 });
    thump(c, sub * 1.6, sub * 0.6, Math.min(0.5, dur), 0.9 * gain);
  }
  const SFX = {
    // UI
    ui_move: (c) => tone(c, 'triangle', 660, 660, 0.035, 0.18),
    ui_confirm: (c) => tone(c, 'triangle', 880, 1320, 0.08, 0.22),
    ui_back: (c) => tone(c, 'triangle', 520, 330, 0.08, 0.2),
    ui_error: (c) => { tone(c, 'square', 150, 150, 0.06, 0.12); tone(c, 'square', 150, 150, 0.06, 0.12, { at: 0.09 }); },
    radio_in: (c) => { noise(c, 0.12, 0.25, { type: 'bandpass', f0: 2400, q: 1.5 }); tone(c, 'square', 1800, 1800, 0.03, 0.05); },
    radio_out: (c) => noise(c, 0.06, 0.2, { type: 'bandpass', f0: 3000, q: 2 }),
    checkpoint: (c) => { tone(c, 'sine', 660, 660, 0.18, 0.3); tone(c, 'sine', 990, 990, 0.3, 0.3, { at: 0.13 }); },
    mission_start: (c) => { noise(c, 1.2, 0.35, { type: 'bandpass', f0: 300, f1: 3000, q: 1.2, swell: 0.8 }); tone(c, 'sawtooth', 80, 220, 1.2, 0.12, { lp: 600, lp1: 2400 }); },
    mission_complete: (c) => {
      [67, 72, 76, 79].forEach((m, i) => {
        const len = i === 3 ? 1.2 : 0.22;
        tone(c, 'sawtooth', mtof(m), mtof(m), len, 0.14, { at: i * 0.16, lp: 2600, a: 0.02 });
        tone(c, 'sawtooth', mtof(m), mtof(m), len, 0.1, { at: i * 0.16, lp: 2600, a: 0.02, detune: 12 });
      });
      noise(c, 1.6, 0.12, { type: 'highpass', f0: 6000, at: 0.4, swell: 0.4 });
    },
    mission_fail: (c) => [57, 60, 64].forEach((m) => {
      tone(c, 'sawtooth', mtof(m), mtof(m - 5), 1.6, 0.09, { lp: 1400, lp1: 300, a: 0.05 });
      tone(c, 'sawtooth', mtof(m), mtof(m - 5), 1.6, 0.07, { lp: 1400, lp1: 300, a: 0.05, detune: -14 });
    }),

    // explosions
    explode_s: (c) => explosion(c, 0.14, 4000, 600, 90, 0.5),
    explode_m: (c) => { explosion(c, 0.38, 3000, 300, 60, 0.7); noise(c, 0.3, 0.12, { type: 'highpass', f0: 3000, at: 0.08 }); },
    explode_l: (c) => { explosion(c, 0.75, 2500, 200, 45, 0.9); noise(c, 1.2, 0.3, { f0: 300, f1: 80, at: 0.1 }); },
    explode_xl: (c) => {
      SFX.explode_l(c);
      SFX.explode_l(Object.assign({}, c, { t: c.t + 0.18 }));
      thump(c, 50, 30, 1.0, 1);
      noise(c, 0.9, 0.15, { type: 'highpass', f0: 2500, at: 0.25 });
    },
    explode_boss: (c) => {
      tone(c, 'sawtooth', 400, 1800, 0.6, 0.12, { lp: 3000 });
      const b = Object.assign({}, c, { t: c.t + 0.6 });
      noise(b, 0.4, 0.8, { type: 'highpass', f0: 1500 });
      thump(b, 60, 28, 1.6, 1.2);
      noise(b, 3, 0.5, { f0: 500, f1: 60 });
    },
    bomb: (c) => {
      noise(c, 0.6, 0.5, { f0: 200, f1: 1500, swell: 0.95 });
      const b = Object.assign({}, c, { t: c.t + 0.6 });
      thump(b, 80, 38, 1.2, 1.2);
      noise(b, 1.4, 0.6, { f0: 1800, f1: 120 });
      noise(b, 1.2, 0.15, { type: 'highpass', f0: 7000 });
    },
    rock_break: (c) => { noise(c, 0.25, 0.6, { type: 'bandpass', f0: 900, f1: 300, q: 0.8 }); thump(c, 110, 50, 0.2, 0.6); },
    mine_blast: (c) => { explosion(c, 0.35, 6000, 500, 70, 0.8); noise(c, 0.2, 0.25, { type: 'highpass', f0: 4000 }); },
    boss_part_break: (c) => { SFX.explode_l(c); bell(c, 2200, 0.25, 0.25, { ratio: 1.41, index: 5 }); },

    // player and weapons
    shot_pulse: (c) => tone(c, 'square', 1100, 900, 0.03, 0.09, { lp: 3500 }),
    shot_spread: (c) => { noise(c, 0.04, 0.12, { type: 'bandpass', f0: 2500, q: 2 }); tone(c, 'square', 1400, 700, 0.04, 0.06, { lp: 3000 }); },
    missile_launch: (c) => noise(c, 0.14, 0.3, { type: 'highpass', f0: 600, f1: 4000 }),
    player_hit: (c) => { tone(c, 'square', 220, 140, 0.09, 0.3, { lp: 1800 }); noise(c, 0.1, 0.45, { f0: 3000, f1: 500 }); },
    shield_hit: (c) => bell(c, 1600, 0.25, 0.35, { ratio: 2.7, index: 3 }),
    shield_break: (c) => {
      noise(c, 0.35, 0.45, { type: 'highpass', f0: 3000 });
      [2600, 2100, 1700, 1300].forEach((f, i) => bell(c, f, 0.3, 0.18, { at: i * 0.05, ratio: 1.7, index: 4 }));
    },
    low_hull: (c) => [0, 1, 2].forEach((i) => {
      tone(c, 'square', 880, 880, 0.1, 0.1, { at: i * 0.28 });
      tone(c, 'square', 660, 660, 0.1, 0.1, { at: i * 0.28 + 0.12 });
    }),
    player_down: (c) => { tone(c, 'sawtooth', 600, 80, 0.7, 0.2, { lp: 2000 }); SFX.explode_m(Object.assign({}, c, { t: c.t + 0.5 })); },
    respawn: (c) => { noise(c, 0.5, 0.3, { type: 'bandpass', f0: 400, f1: 3000, q: 1 }); tone(c, 'sine', 300, 900, 0.5, 0.25); },
    revive: (c) => arp(c, 'triangle', [72, 76, 79, 84].map(mtof), 0.09, 0.2, 0.25),
    beam_charge: (c) => tone(c, 'sawtooth', 200, 900, 0.8, 0.14, { lp: 2500, trem: 14 }),
    beam_fire: (c) => {
      noise(c, 1.2, 0.45, { type: 'bandpass', f0: 1200, q: 0.7, swell: 0.08 });
      tone(c, 'sawtooth', 110, 105, 1.2, 0.18, { lp: 900, a: 0.03 });
    },

    // pickups and score
    powerup: (c) => arp(c, 'square', [64, 67, 71, 76].map(mtof), 0.06, 0.1, 0.12, { lp: 4000 }),
    weapon_max: (c) => {
      SFX.powerup(c);
      tone(c, 'triangle', mtof(76), mtof(76), 0.8, 0.12, { at: 0.24, trem: 6 });
      tone(c, 'triangle', mtof(83), mtof(83), 0.8, 0.1, { at: 0.24, trem: 6 });
    },
    shield_up: (c) => { bell(c, 600, 0.5, 0.25, { ratio: 2, index: 6 }); tone(c, 'sine', 500, 1500, 0.35, 0.15); },
    repair: (c) => { noise(c, 0.03, 0.3, { type: 'highpass', f0: 3000 }); noise(c, 0.03, 0.3, { type: 'highpass', f0: 3000, at: 0.09 }); bell(c, 880, 0.5, 0.2, { at: 0.18, ratio: 2, index: 1.5 }); },
    bomb_pickup: (c) => { thump(c, 140, 70, 0.15, 0.6); bell(c, 2400, 0.3, 0.15, { at: 0.08, ratio: 3, index: 2 }); },
    credit: (c) => tone(c, 'sine', 2400, 2400, 0.05, 0.12),
    credit_big: (c) => { tone(c, 'sine', 1800, 1800, 0.06, 0.15); tone(c, 'sine', 2700, 2700, 0.09, 0.15, { at: 0.06 }); },
    formation_bonus: (c) => [72, 79, 84].forEach((m, i) => bell(c, mtof(m), 0.5, 0.2, { at: i * 0.09, ratio: 3.5, index: 1.5 })),
    rescue: (c) => [84, 88, 91].forEach((m, i) => bell(c, mtof(m), 0.6, 0.2, { at: i * 0.11, ratio: 2, index: 1.2 })),
    pod_lost: (c) => [76, 72, 69].forEach((m, i) => tone(c, 'sine', mtof(m), mtof(m), 0.3, 0.2, { at: i * 0.16 })),

    // enemies
    hit_enemy: (c) => noise(c, 0.025, 0.18, { type: 'bandpass', f0: 2200, q: 1.5 }),
    hit_armor: (c) => bell(c, 3000, 0.12, 0.15, { ratio: 1.4, index: 3 }),
    enemy_fire: (c) => tone(c, 'sine', 520, 300, 0.05, 0.07),
    enemy_charge: (c) => tone(c, 'sine', 300, 1200, 0.4, 0.13),
    sniper_lock: (c) => tone(c, 'square', 2000, 2000, 0.25, 0.07),
    spear_lock: (c) => tone(c, 'square', 300, 600, 0.3, 0.09, { lp: 2500 }),
    missile_enemy: (c) => noise(c, 0.3, 0.25, { type: 'bandpass', f0: 300, f1: 900, q: 1 }),
    phantom_decloak: (c) => { noise(c, 0.4, 0.2, { type: 'highpass', f0: 2000, f1: 8000, swell: 0.9 }); tone(c, 'sine', 400, 1600, 0.4, 0.08, { trem: 20 }); },
    warper_blink: (c) => tone(c, 'sawtooth', 1200, 300, 0.12, 0.14, { lp: 3000 }),
    hive_launch: (c) => { noise(c, 0.05, 0.4, { type: 'bandpass', f0: 800, q: 3 }); noise(c, 0.3, 0.2, { type: 'highpass', f0: 2500, at: 0.05 }); },
    // hazards
    hazard_warning: (c) => [0, 1, 2].forEach((i) => {
      tone(c, 'sawtooth', 520, 520, 0.2, 0.12, { at: i * 0.42, lp: 2000 });
      tone(c, 'sawtooth', 390, 390, 0.2, 0.12, { at: i * 0.42 + 0.21, lp: 2000 });
    }),
    bh_swallow: (c) => noise(c, 0.7, 0.4, { f0: 3000, f1: 60 }),
    bh_collapse: (c) => { noise(c, 0.5, 0.5, { f0: 150, f1: 2500, swell: 0.95 }); thump(c, 70, 30, 1.0, 1, 0.5); bell(c, 220, 1.6, 0.15, { at: 0.5, ratio: 1.5, index: 3 }); },
    storm_strike_warn: (c) => noise(c, 0.9, 0.25, { type: 'bandpass', f0: 1500, f1: 5000, q: 3, swell: 0.9, rate: 0.5 }),
    storm_strike: (c) => { noise(c, 0.25, 0.9, { type: 'highpass', f0: 1000 }); noise(c, 1.5, 0.6, { f0: 400, f1: 60, at: 0.05 }); thump(c, 70, 40, 0.8, 0.8); },
    flare_warn: (c) => noise(c, 2.5, 0.35, { type: 'bandpass', f0: 200, f1: 2500, q: 0.8, swell: 0.92 }),
    flare_burn: (c) => { noise(c, 1.4, 0.55, { f0: 3000, f1: 800 }); noise(c, 1.2, 0.15, { type: 'highpass', f0: 7000 }); },
    mine_arm: (c) => [0, 0.12, 0.21, 0.27, 0.31].forEach((d) => tone(c, 'square', 3000, 3000, 0.03, 0.06, { at: d })),

    // bosses
    boss_warning: (c) => [0, 1].forEach((i) => tone(c, 'sawtooth', 400, 800, 0.55, 0.15, { at: i * 0.6, lp: 2400, lin: true })),
    boss_roar: (c) => { tone(c, 'sine', 30, 38, 1.4, 0.9, { a: 0.5 }); noise(c, 1.4, 0.4, { type: 'bandpass', f0: 180, f1: 700, q: 2, swell: 0.5, rate: 0.4 }); },
    boss_phase: (c) => {
      [40, 47, 52].forEach((m) => tone(c, 'sawtooth', mtof(m), mtof(m), 1.0, 0.12, { lp: 1200, a: 0.04 }));
      noise(c, 1.2, 0.15, { type: 'highpass', f0: 5000, swell: 0.6 });
    },
    wormhole_open: (c) => {
      noise(c, 1.6, 0.3, { type: 'bandpass', f0: 300, f1: 2400, q: 4, swell: 0.6, glide: 1.0 });
      tone(c, 'sawtooth', 110, 220, 1.6, 0.08, { lp: 900, lp1: 2400, trem: 9 });
      tone(c, 'sine', 330, 660, 1.4, 0.06, { trem: 6, at: 0.2 });
    },
    wormhole_warp: (c) => {
      noise(c, 0.5, 0.35, { type: 'bandpass', f0: 500, f1: 5000, q: 1.5, swell: 0.7 });
      tone(c, 'sine', 300, 1400, 0.25, 0.12, { lin: true });
      tone(c, 'sine', 1400, 200, 0.35, 0.1, { at: 0.25 });
    },

    // missions
    catapult: (c) => {
      noise(c, 0.5, 0.35, { type: 'highpass', f0: 2500, f1: 6000, swell: 0.3 });
      thump(c, 120, 40, 0.5, 1.0, 0.45);
      noise(c, 0.25, 0.5, { f0: 3000, f1: 400, at: 0.45 });
      tone(c, 'sawtooth', 70, 190, 1.4, 0.12, { at: 0.5, lp: 600, lp1: 2400, a: 0.05 });
      noise(c, 1.6, 0.3, { type: 'bandpass', f0: 300, f1: 1800, q: 0.8, at: 0.5, swell: 0.3 });
    },

    // story: the decision dialog and the cutscenes' sound cues (scenes.js sfx names, mapped in 26_cutscenes.js)
    choice_open: (c) => {
      bell(c, 98, 2.4, 0.28, { ratio: 1.41, index: 4 });
      tone(c, 'sawtooth', 196, 196, 1.8, 0.035, { lp: 900, a: 0.4, linEnv: true });
      tone(c, 'sawtooth', 294, 294, 1.8, 0.03, { lp: 900, a: 0.4, linEnv: true, detune: 6 });
    },
    choice_pick: (c) => [72, 76, 79].forEach((m, i) => tone(c, 'triangle', mtof(m), mtof(m), 0.4, 0.12, { at: i * 0.03 })),
    cs_fire: (c) => {
      noise(c, 4.5, 0.35, { f0: 500, f1: 260, swell: 0.25 });
      for (let i = 0; i < 26; i++) noise(c, 0.03, 0.18 + Math.random() * 0.2, { type: 'bandpass', f0: 1500 + Math.random() * 3500, q: 2, at: Math.random() * 4.2 });
      thump(c, 80, 40, 0.8, 0.5);
    },
    cs_alarm: (c) => [0, 1, 2].forEach((i) => {
      tone(c, 'sawtooth', 180, 300, 0.7, 0.1, { at: i * 0.9, lp: 1100, lin: true, linEnv: true, a: 0.08 });
      tone(c, 'square', 90, 150, 0.7, 0.05, { at: i * 0.9, lp: 600, lin: true, linEnv: true, a: 0.08 });
    }),
    cs_power_down: (c) => {
      tone(c, 'sawtooth', 420, 40, 1.8, 0.14, { lp: 1600, lp1: 200 });
      tone(c, 'sine', 120, 30, 1.8, 0.2);
      noise(c, 0.25, 0.4, { f0: 1800, f1: 200, at: 1.7 });
      thump(c, 90, 40, 0.5, 0.8, 1.75);
    },
    cs_engine: (c) => {
      tone(c, 'sawtooth', 55, 160, 2.2, 0.12, { lp: 500, lp1: 1800, a: 0.6, linEnv: true });
      noise(c, 2.4, 0.35, { type: 'bandpass', f0: 200, f1: 2600, q: 1, swell: 0.8 });
      noise(c, 1.6, 0.3, { f0: 3000, f1: 300, at: 2.0 });
    },
    cs_explosion: (c) => {
      thump(c, 70, 25, 2.2, 1.1);
      noise(c, 0.6, 0.9, { f0: 5000, f1: 400 });
      noise(c, 4.5, 0.55, { f0: 600, f1: 50, at: 0.1 });
      noise(c, 2.0, 0.15, { type: 'highpass', f0: 3000, at: 0.3 });
    },
    cs_distress: (c) => {
      noise(c, 3.2, 0.06, { type: 'bandpass', f0: 2200, q: 0.8, swell: 0.1 });
      // S O S
      [[0, 0.08], [0.16, 0.08], [0.32, 0.08], [0.62, 0.22], [0.92, 0.22], [1.22, 0.22], [1.6, 0.08], [1.76, 0.08], [1.92, 0.08]]
        .forEach(([at, len]) => tone(c, 'square', 1250, 1250, len, 0.06, { at, lp: 3000, linEnv: true }));
    },
    cs_flash: (c) => {
      noise(c, 0.7, 0.4, { type: 'highpass', f0: 6000, f1: 800 });
      tone(c, 'sine', 900, 120, 0.5, 0.12);
      thump(c, 110, 45, 0.6, 0.6);
    },
  };

  // ------------------------------------------------------------------ loops
  const LOOPS = {
    snatch_tractor: { type: 'sine', f: 180, lfo: 5, depth: 25, gain: 0.12 },
    bh_loop: { type: 'sine', f: 48, lfo: 0.3, depth: 10, gain: 0.3, rumble: 120 },
    ion_jam: { type: 'sawtooth', f: 120, lfo: 13, depth: 30, gain: 0.06, rumble: 2000 },
    lance_loop: { type: 'sawtooth', f: 220, lfo: 3, depth: 8, gain: 0.05 },
    twin_link: { type: 'sine', f: 660, lfo: 4, depth: 6, gain: 0.04 },
    sk_event_horizon: { type: 'sine', f: 55, lfo: 0.5, depth: 4, gain: 0.08 },
  };
  const NO_LOOP = { set() {}, stop() {} };

  // ------------------------------------------------------------------ music
  // A track: { bpm, play(step, t, ctx) } where step counts 16ths from the start and ctx holds the outputs.
  function kick(m, t, g) {
    const c = { t, out: m.drums, v: g || 1, p: 1 };
    tone(c, 'sine', 160, 42, 0.32, 0.95, { a: 0.002 });
    noise(c, 0.012, 0.25, { type: 'highpass', f0: 3000 });
    // sidechain pump on the synth bus
    const pg = m.pump.gain;
    pg.cancelScheduledValues(t);
    pg.setValueAtTime(0.18, t);
    pg.linearRampToValueAtTime(1, t + m.beat * 0.85);
  }
  function snare(m, t, g) {
    const c = { t, out: m.drums, v: g || 1, p: 1 };
    noise(c, 0.18, 0.5, { type: 'bandpass', f0: 1900, q: 0.7 });
    tone(c, 'triangle', 200, 160, 0.08, 0.35);
  }
  function hat(m, t, open, g) {
    noise({ t, out: m.drums, v: g || 1, p: 1 }, open ? 0.14 : 0.03, open ? 0.16 : 0.12, { type: 'highpass', f0: 8000 });
  }
  function crash(m, t) { noise({ t, out: m.drums, v: 1, p: 1 }, 1.6, 0.22, { type: 'highpass', f0: 5000 }); }
  function bass(m, t, midi, len, g, cut) {
    const c = { t, out: m.pumped, v: g || 1, p: 1 };
    const f = mtof(midi);
    tone(c, 'sawtooth', f, f, len, 0.32, { lp: cut || 1400, lp1: 200, q: 4 });
    tone(c, 'square', f / 2, f / 2, len, 0.22, { lp: 500 });
  }
  function pad(m, t, notes, len, g) {
    const c = { t, out: m.pumped, v: g || 1, p: 1 };
    notes.forEach((n) => {
      const f = mtof(n);
      tone(c, 'sawtooth', f, f, len, 0.05, { lp: 1800, a: 0.05, detune: -9, linEnv: true });
      tone(c, 'sawtooth', f, f, len, 0.05, { lp: 1800, a: 0.05, detune: 9, linEnv: true });
    });
  }
  function pluck(m, t, midi, g) {
    tone({ t, out: m.pumped, v: g || 1, p: 1 }, 'square', mtof(midi), mtof(midi), 0.14, 0.07, { lp: 3200, lp1: 600 });
  }
  function lead(m, t, midi, len, g, slideFrom) {
    const c = { t, out: m.lead, v: g || 1, p: 1 };
    const f = mtof(midi), f0 = slideFrom != null ? mtof(slideFrom) : f;
    const o = { a: 0.01, lp: 3800, glide: 0.06, lin: true };
    const a = tone(c, 'square', f0, f, len, 0.075, o);
    const b = tone(c, 'sawtooth', f0, f, len, 0.06, Object.assign({ detune: 7 }, o));
    // a little vibrato on long notes
    if (len > 0.3) [a, b].forEach((osc) => {
      const l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = 5.5;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * 0.012, t + len * 0.6);
      l.connect(lg);
      lg.connect(osc.frequency);
      l.start(t);
      l.stop(t + len + 0.05);
    });
  }
  function riser(m, t, len) {
    noise({ t, out: m.drums, v: 1, p: 1 }, len, 0.25, { type: 'bandpass', f0: 400, f1: 6000, q: 2, swell: 0.95 });
  }
  // notes: [step, midi, lengthInSteps]; one entry per bar (16 steps)
  function playPhrase(m, step, t, bars, g) {
    const bar = bars[Math.floor(step / 16) % bars.length];
    const s = step % 16;
    for (const n of bar) if (n[0] === s) lead(m, t, n[1], n[2] * m.sixteenth * 0.95, g, n[3]);
  }
  /** Runs bar `bar` of a [step, midi, lengthInSteps, slideFrom] list through any voice: fn(midi, seconds, slideFrom). */
  function playBars(m, bars, bar, s, fn) {
    const notes = bars[((bar % bars.length) + bars.length) % bars.length];
    for (const n of notes) if (n[0] === s) fn(n[1], n[2] * m.sixteenth, n[3]);
  }

  // ------------------------------------------------------------------ voices of the story, menu and minigame tracks
  // synth() is one oscillator note on a track bus. n: { type, a (attack s), r (release s), exp (percussive: decays over
  // the whole note), lp, lp1 + sweep (lowpass glide), q, detune (cents), bend (cents it starts off by, gliding in over
  // bendT s), slide (midi it glides up or down from), vib (vibrato depth as a fraction of f), vibDelay, pan, echo (send
  // to the track's tempo delay) }.
  function shape(p, t, g, len, n) {
    const a = Math.min(n.a != null ? n.a : 0.01, len * 0.9);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(g, t + a);
    if (n.exp) p.exponentialRampToValueAtTime(0.0001, t + len);
    else {
      const r = Math.min(n.r != null ? n.r : len * 0.3, len - a);
      p.setValueAtTime(g, t + len - r);
      p.linearRampToValueAtTime(0.0001, t + len);
    }
  }
  function vibrato(param, depth, rate, from, end) {
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = rate;
    lg.gain.setValueAtTime(0, from);
    lg.gain.linearRampToValueAtTime(depth, from + 0.5);
    l.connect(lg);
    lg.connect(param);
    l.start(from);
    l.stop(end);
  }
  function route(m, node, bus, n) {
    let out = node;
    if (n.pan) {
      const p = ac.createStereoPanner();
      p.pan.value = n.pan;
      node.connect(p);
      out = p;
    }
    out.connect(bus);
    if (n.echo && m.echo) {
      const s = ac.createGain();
      s.gain.value = n.echo;
      out.connect(s);
      s.connect(m.echo);
    }
  }
  function synth(m, bus, t, midi, len, g, n) {
    n = n || {};
    const f = mtof(midi), end = t + len + 0.05;
    const osc = ac.createOscillator();
    osc.type = n.type || 'triangle';
    if (n.slide != null) {
      osc.frequency.setValueAtTime(mtof(n.slide), t);
      osc.frequency.linearRampToValueAtTime(f, t + (n.slideT || 0.08));
    } else osc.frequency.setValueAtTime(f, t);
    const det = n.detune || 0;
    if (n.bend) {
      osc.detune.setValueAtTime(det + n.bend, t);
      osc.detune.linearRampToValueAtTime(det, t + (n.bendT || 0.6));
    } else if (det) osc.detune.setValueAtTime(det, t);
    const env = ac.createGain();
    shape(env.gain, t, g, len, n);
    let node = osc;
    if (n.lp) {
      const fl = ac.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(n.lp, t);
      if (n.lp1) fl.frequency.exponentialRampToValueAtTime(n.lp1, t + (n.sweep || len));
      fl.Q.value = n.q || 0.7;
      node.connect(fl);
      node = fl;
    }
    node.connect(env);
    if (n.vib) vibrato(osc.frequency, f * n.vib, n.vibRate || 5, t + (n.vibDelay || 0), end);
    route(m, env, bus, n);
    osc.start(t);
    osc.stop(end);
  }
  /** FM voice for bells, e-piano, marimba and vibes: the modulator sits at n.ratio x f, its depth falls from n.index to
      n.index1 (multiples of f) over n.idur; percussive unless n.exp is false; n.trem adds a vibraphone tremolo. */
  function fmv(m, bus, t, midi, len, g, n) {
    n = n || {};
    const f = mtof(midi), end = t + len + 0.05;
    const car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), env = ac.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * (n.ratio || 1);
    mg.gain.setValueAtTime(f * (n.index != null ? n.index : 2), t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.5, f * (n.index1 != null ? n.index1 : 0.05)), t + Math.min(len, n.idur || len));
    mod.connect(mg);
    mg.connect(car.frequency);
    shape(env.gain, t, g, len, { a: n.a != null ? n.a : 0.003, exp: n.exp !== false, r: n.r });
    car.connect(env);
    let out = env;
    if (n.trem) {
      const tg = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
      tg.gain.value = 0.8;
      l.frequency.value = n.trem;
      lg.gain.value = 0.2;
      l.connect(lg);
      lg.connect(tg.gain);
      env.connect(tg);
      out = tg;
      l.start(t);
      l.stop(end);
    }
    route(m, out, bus, n);
    car.start(t);
    mod.start(t);
    car.stop(end);
    mod.stop(end);
  }
  // A choir voice: two detuned saws through three vowel formants, with a slow swell and a gentle vibrato.
  const VOWEL = { ah: [[750, 90, 1], [1150, 110, 0.55], [2600, 160, 0.2]], oh: [[460, 80, 1], [820, 100, 0.45], [2700, 160, 0.1]] };
  function choir(m, bus, t, midi, len, g, n) {
    n = n || {};
    const f = mtof(midi), end = t + len + 0.05;
    const env = ac.createGain();
    shape(env.gain, t, g, len, { a: n.a != null ? n.a : 0.5, r: n.r != null ? n.r : 0.8 });
    const forms = (VOWEL[n.vowel] || VOWEL.ah).map(([ff, bw, k]) => {
      const bp = ac.createBiquadFilter(), fg = ac.createGain();
      bp.type = 'bandpass';
      bp.frequency.value = ff;
      bp.Q.value = ff / bw;
      fg.gain.value = k * 4;
      bp.connect(fg);
      fg.connect(env);
      return bp;
    });
    for (const d of [-9, 9]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      if (n.slide != null) {
        o.frequency.setValueAtTime(mtof(n.slide), t);
        o.frequency.linearRampToValueAtTime(f, t + 0.25);
      } else o.frequency.setValueAtTime(f, t);
      o.detune.value = d;
      vibrato(o.frequency, f * (n.vib || 0.006), 4.6 + d * 0.02, t + Math.min(0.6, len * 0.4), end);
      for (const bp of forms) o.connect(bp);
      o.start(t);
      o.stop(end);
    }
    route(m, env, bus, n);
  }

  // instruments built from those
  function warm(m, t, notes, len, g, n) {
    const o = Object.assign({ type: 'triangle', a: Math.min(1.2, len * 0.3), r: Math.min(1.5, len * 0.4), lp: 1600 }, n);
    notes.forEach((x) => {
      for (const s of [-1, 1]) synth(m, m.pad, t, x, len, 0.05 * g, Object.assign({}, o, { detune: (o.detune || 0) + s * (o.spread || 7), pan: s * 0.35 }));
    });
  }
  function strings(m, t, notes, len, g, n) {
    warm(m, t, notes, len, g * 0.7, Object.assign({ type: 'sawtooth', lp: 1700, vib: 0.0035, vibDelay: 0.4 }, n));
  }
  function horn(m, t, midi, len, g, from) {
    for (const s of [-1, 1]) {
      synth(m, m.lead, t, midi, len, 0.045 * (g || 1), {
        type: 'sawtooth', a: 0.07, r: Math.min(0.25, len * 0.4), lp: 900, lp1: 1700, sweep: 0.25, detune: s * 6, pan: s * 0.15,
        vib: len > 0.45 ? 0.005 : 0, vibDelay: 0.25, slide: from,
      });
    }
  }
  function celesta(m, t, midi, len, g, echo) {
    fmv(m, m.lead, t, midi, Math.max(len, 0.8) + 0.8, 0.1 * (g || 1), { ratio: 4, index: 1.3, index1: 0.04, idur: 0.35, echo: echo != null ? echo : 0.45 });
  }
  function epiano(m, t, midi, len, g, pan) {
    fmv(m, m.pad, t, midi, Math.max(1.1, len), 0.075 * (g || 1), { ratio: 1, index: 1.6, index1: 0.12, idur: 0.8, pan });
  }
  function marimba(m, t, midi, g, echo) {
    fmv(m, m.lead, t, midi, 0.45, 0.1 * (g || 1), { ratio: 4, index: 2.2, index1: 0.02, idur: 0.06, echo });
  }
  function vibes(m, t, midi, len, g) {
    fmv(m, m.lead, t, midi, Math.max(len, 0.6) + 0.9, 0.09 * (g || 1), { ratio: 4, index: 0.9, index1: 0.05, idur: 0.4, trem: 5.5, echo: 0.3 });
  }
  // sonar ping / glass: a high FM chime that rings into the echo
  function glass(m, t, midi, g, pan) {
    fmv(m, m.lead, t, midi, 2.6, 0.07 * (g || 1), { ratio: 2.76, index: 1.1, index1: 0.03, idur: 0.3, echo: 0.7, pan });
  }
  function toll(m, t, midi, g) {
    fmv(m, m.pad, t, midi, 7, 0.12 * (g || 1), { ratio: 1.4, index: 3, index1: 0.1, idur: 5 });
    fmv(m, m.pad, t, midi - 12, 7, 0.08 * (g || 1), { ratio: 1.4, index: 2, index1: 0.1, idur: 5 });
  }
  function arpNote(m, t, midi, g) {
    synth(m, m.pumped, t, midi, m.sixteenth * 1.8, 0.045 * (g || 1), { type: 'square', exp: true, lp: 2600, lp1: 500, echo: 0.55 });
  }
  // round bass: a triangle with a sine an octave down
  function round(m, t, midi, len, g) {
    const r = Math.min(0.12, len * 0.3);
    synth(m, m.pumped, t, midi, len, 0.24 * (g || 1), { type: 'triangle', a: 0.008, r, lp: 1000 });
    synth(m, m.pumped, t, midi - 12, len, 0.12 * (g || 1), { type: 'sine', a: 0.008, r });
  }
  // percussion that is not a drum kit
  function heart(m, t, g) {
    const c = { t, out: m.drums, v: g || 1, p: 1 };
    tone(c, 'sine', 90, 45, 0.2, 0.9, { a: 0.004 });
    noise(c, 0.07, 0.35, { f0: 420, f1: 90 });
    const d = { t: t + 0.17, out: m.drums, v: (g || 1) * 0.65, p: 1 };
    tone(d, 'sine', 80, 42, 0.18, 0.9, { a: 0.004 });
    noise(d, 0.06, 0.3, { f0: 380, f1: 90 });
  }
  function tick(m, t, g) {
    const c = { t, out: m.drums, v: g || 1, p: 1 };
    noise(c, 0.014, 0.3, { type: 'highpass', f0: 6500 });
    tone(c, 'square', 2600, 2600, 0.008, 0.04);
  }
  function rim(m, t, g) {
    const c = { t, out: m.drums, v: g || 1, p: 1 };
    tone(c, 'triangle', 1800, 1500, 0.03, 0.3);
    noise(c, 0.025, 0.25, { type: 'bandpass', f0: 3200, q: 2 });
  }
  function shaker(m, t, g) { noise({ t, out: m.drums, v: g || 1, p: 1 }, 0.07, 0.14, { type: 'bandpass', f0: 7800, q: 1.4, a: 0.02 }); }
  function boom(m, t, g) {
    const c = { t, out: m.drums, v: g || 1, p: 1 };
    tone(c, 'sine', 110, 48, 0.8, 0.9, { a: 0.002 });
    tone(c, 'triangle', 220, 90, 0.18, 0.25, { a: 0.002 });
    noise(c, 0.16, 0.4, { f0: 700, f1: 150 });
  }
  function timp(m, t, midi, g) {
    const f = mtof(midi), c = { t, out: m.drums, v: g || 1, p: 1 };
    tone(c, 'sine', f * 1.04, f, 1.5, 0.6, { a: 0.003, glide: 0.1 });
    tone(c, 'sine', f * 1.5, f * 1.49, 0.8, 0.2, { a: 0.003 });
    tone(c, 'triangle', f * 2, f * 2, 0.3, 0.12, { a: 0.003 });
    noise(c, 0.09, 0.3, { f0: 1200, f1: 250 });
  }
  function drop(m, t, midi, g) {
    tone({ t, out: m.lead, v: g || 1, p: 1 }, 'sine', mtof(midi), mtof(midi) * 2.2, 0.12, 0.09, { a: 0.002, glide: 0.07 });
  }
  function air(m, t, len, g) {
    noise({ t, out: m.pad, v: g || 1, p: 1 }, len, 0.05, { type: 'bandpass', f0: 600, f1: 2600, q: 0.8, swell: 0.5, glide: len });
  }
  // the storm kit (mus_m3)
  const GRIT = (() => {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 3.5);
    return c;
  })();
  /** Distorted bass: two detuned saws through a tanh shaper and a closing lowpass, over a clean sine sub. */
  function grit(m, t, midi, len, g, cut) {
    const f = mtof(midi), end = t + len + 0.05, c0 = cut || 1600;
    const env = ac.createGain(), pre = ac.createGain(), sh = ac.createWaveShaper(), lp = ac.createBiquadFilter();
    shape(env.gain, t, 0.13 * (g || 1), len, { a: 0.004, r: Math.min(0.05, len * 0.4) });
    pre.gain.value = 0.9;
    sh.curve = GRIT;
    sh.oversample = '2x';
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(c0, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(180, c0 * 0.35), t + len);
    lp.Q.value = 3;
    pre.connect(sh);
    sh.connect(lp);
    lp.connect(env);
    const oscs = [];
    for (const d of [-7, 7]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(pre);
      oscs.push(o);
    }
    const sub = ac.createOscillator(), sg = ac.createGain();
    sub.frequency.value = f / 2;
    sg.gain.value = 0.9;
    sub.connect(sg);
    sg.connect(env);
    oscs.push(sub);
    env.connect(m.pumped);
    for (const o of oscs) { o.start(t); o.stop(end); }
  }
  /** A short chord stab: detuned saws with a snapping filter. */
  function stab(m, t, notes, g) {
    for (const n of notes) {
      for (const s of [-1, 1]) synth(m, m.pumped, t, n, m.sixteenth * 1.5, 0.045 * (g || 1), { type: 'sawtooth', exp: true, lp: 4200, lp1: 700, detune: s * 10, pan: s * 0.3 });
    }
  }
  function tom(m, t, midi, g) {
    const f = mtof(midi), c = { t, out: m.drums, v: g || 1, p: 1 };
    tone(c, 'sine', f * 1.6, f, 0.32, 0.7, { a: 0.002, glide: 0.12 });
    tone(c, 'triangle', f * 2.2, f * 1.3, 0.08, 0.2, { a: 0.002 });
    noise(c, 0.05, 0.18, { f0: 2400, f1: 400 });
  }
  /** A thunder swell: a low rumble that opens up, then a crackle as it breaks. */
  function thunder(m, t, len, g) {
    const c = { t, out: m.drums, v: g || 1, p: 1 };
    noise(c, len, 0.32, { type: 'lowpass', f0: 160, f1: 900, q: 0.5, swell: 0.4, glide: len * 0.45 });
    noise(c, len * 0.5, 0.12, { at: len * 0.35, type: 'bandpass', f0: 1400, f1: 220, q: 0.6, swell: 0.15 });
    tone(c, 'sine', 70, 38, len * 0.6, 0.25, { at: len * 0.35, a: 0.05 });
  }

  // mus_m1: 140 BPM, E minor, Em C G D. intro4 | A8 B8 chorus16 bridge8 (loops from A)
  const M1 = {
    chords: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]],
    roots: [40, 36, 43, 38],
    hook: [
      [[0, 76, 4], [4, 74, 2], [6, 71, 2], [8, 67, 4], [12, 71, 4]],
      [[0, 72, 4], [4, 76, 4], [8, 79, 6], [14, 76, 2]],
      [[0, 74, 4], [4, 71, 2], [6, 74, 2], [8, 79, 4], [12, 78, 4]],
      [[0, 78, 6], [6, 76, 2], [8, 74, 4], [12, 69, 4]],
      [[0, 76, 4], [4, 74, 2], [6, 71, 2], [8, 67, 4], [12, 71, 4]],
      [[0, 72, 4], [4, 76, 4], [8, 79, 6], [14, 81, 2]],
      [[0, 83, 6], [6, 81, 2], [8, 79, 4], [12, 78, 4]],
      [[0, 76, 12, 74]],
    ],
    verse: [
      [[0, 71, 6], [8, 67, 4], [12, 69, 4]],
      [[0, 67, 8], [8, 64, 8]],
      [[0, 74, 6], [8, 71, 8]],
      [[0, 69, 12], [12, 66, 4]],
    ],
  };
  function m1Section(bar) {
    if (bar < 4) return { name: 'intro', i: bar };
    const b = (bar - 4) % 40;
    if (b < 8) return { name: 'A', i: b };
    if (b < 16) return { name: 'B', i: b - 8 };
    if (b < 32) return { name: 'chorus', i: b - 16 };
    return { name: 'bridge', i: b - 32 };
  }

  // Note data of the story, menu and minigame tracks: chord voicings as midi lists, tunes as [step, midi, steps,
  // slideFrom] per bar (see the tracks below for how each one is played).
  // mus_title: the Earth Vanguard theme in D minor.
  const TITLE = {
    ch: { Dm: [57, 62, 65], Bb: [58, 62, 65], F: [57, 60, 65], C: [55, 60, 64], Gm: [55, 58, 62], A: [57, 61, 64] },
    root: { Dm: 38, Bb: 34, F: 41, C: 36, Gm: 43, A: 45 },
    intro: ['Dm', 'Bb', 'F', 'C'],
    A: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'],
    B: ['Bb', 'F', 'C', 'Dm', 'Bb', 'F', 'Gm', 'A'],
    tuneA: [
      [[0, 74, 6], [6, 76, 2], [8, 77, 6], [14, 76, 2]],
      [[0, 74, 8], [8, 69, 8]],
      [[0, 72, 6], [6, 74, 2], [8, 77, 4], [12, 81, 4]],
      [[0, 79, 12], [12, 76, 4]],
      [[0, 77, 6], [6, 76, 2], [8, 74, 6], [14, 72, 2]],
      [[0, 74, 4], [4, 77, 4], [8, 82, 8]],
      [[0, 81, 6], [6, 79, 2], [8, 77, 4], [12, 74, 4]],
      [[0, 76, 8], [8, 73, 8]],
    ],
    tuneB: [
      [[0, 77, 4], [4, 82, 4], [8, 81, 6], [14, 79, 2]],
      [[0, 81, 6], [6, 79, 2], [8, 77, 4], [12, 72, 4]],
      [[0, 79, 6], [6, 81, 2], [8, 79, 4], [12, 76, 4]],
      [[0, 77, 10], [10, 76, 2], [12, 74, 4]],
      [[0, 74, 4], [4, 77, 4], [8, 82, 6], [14, 81, 2]],
      [[0, 84, 8], [8, 81, 8]],
      [[0, 82, 6], [6, 81, 2], [8, 79, 4], [12, 81, 4]],
      [[0, 81, 8, 79], [8, 76, 4], [12, 73, 4]],
    ],
  };
  // mus_hope: the title theme's opening in D major over a falling bass (the first note of each voicing).
  const HOPE = {
    ch: [[50, 57, 62, 66], [49, 57, 61, 64], [47, 54, 59, 62], [43, 55, 59, 62], [42, 54, 57, 62], [43, 55, 59, 62], [40, 55, 59, 62], [45, 57, 61, 64]],
    tuneA: [
      [[0, 74, 6], [6, 76, 2], [8, 78, 6], [14, 76, 2]],
      [[0, 76, 8], [8, 73, 8]],
      [[0, 74, 6], [6, 76, 2], [8, 78, 4], [12, 83, 4]],
      [[0, 81, 12], [12, 79, 4]],
      [[0, 78, 6], [6, 76, 2], [8, 74, 6], [14, 73, 2]],
      [[0, 74, 4], [4, 79, 4], [8, 83, 8]],
      [[0, 81, 6], [6, 79, 2], [8, 78, 4], [12, 74, 4]],
      [[0, 76, 6], [6, 74, 2], [8, 73, 8]],
    ],
    tuneB: [
      [[0, 78, 4], [4, 81, 4], [8, 86, 8]],
      [[0, 85, 8], [8, 81, 8]],
      [[0, 83, 6], [6, 81, 2], [8, 78, 4], [12, 83, 4]],
      [[0, 81, 8], [8, 79, 4], [12, 78, 4]],
      [[0, 78, 6], [6, 79, 2], [8, 81, 8]],
      [[0, 83, 6], [6, 81, 2], [8, 79, 8]],
      [[0, 79, 4], [4, 78, 4], [8, 76, 4], [12, 79, 4]],
      [[0, 78, 8, 76], [8, 76, 4], [12, 73, 4]],
    ],
  };
  // mus_overseers: Dm, Eb over D, C# dim: the D pedal never moves.
  const OVER = [[50, 53, 57], [50, 53, 57], [51, 55, 58], [50, 53, 57], [50, 53, 58], [51, 55, 58], [49, 52, 55], [50, 53, 57]];
  // mus_echo: Am9, Fmaj7, Dm9 and B-flat, all over A; her motif A C B E.
  const ECHO = {
    pads: [[45, 52, 59, 60], [45, 53, 60, 64], [45, 50, 53, 64], [45, 58, 62, 65]],
    motif: [[[0, 69, 4], [4, 72, 4], [8, 71, 6], [14, 64, 2]]],
  };
  // mus_free: Emaj9 C#m7 Aadd9 E/G# Aadd9 F#m7 Bsus4-B; the tune touches the Lydian A# in bar 2.
  const FREE = {
    pads: [[52, 59, 63, 66, 68], [52, 59, 63, 66, 68], [49, 56, 59, 64], [45, 52, 59, 61], [44, 52, 59, 64], [45, 52, 59, 61], [42, 49, 57, 64], [47, 54, 59, 64]],
    res: [47, 54, 59, 63],
    tune: [
      [[0, 71, 4], [4, 76, 4], [8, 78, 4], [12, 80, 4]],
      [[0, 82, 6], [6, 80, 2], [8, 83, 8]],
      [[0, 80, 6], [6, 78, 2], [8, 76, 8]],
      [[0, 73, 4], [4, 76, 4], [8, 83, 8]],
      [[0, 80, 8], [8, 76, 4], [12, 78, 4]],
      [[0, 81, 6], [6, 80, 2], [8, 76, 8]],
      [[0, 78, 4], [4, 81, 4], [8, 85, 8]],
      [[0, 83, 8], [8, 78, 4], [12, 75, 4]],
    ],
  };
  // mus_puff (3/4, 12 steps a bar): F Am/E Dm Bb F/C Gm7 Bbm6 C7.
  const PUFF = {
    bass: [41, 40, 38, 34, 36, 43, 34, 36],
    ch: [[57, 60, 65], [57, 60, 64], [57, 62, 65], [58, 62, 65], [57, 60, 65], [58, 62, 65], [58, 61, 65], [58, 60, 64]],
    tuneA: [
      [[0, 72, 4], [4, 77, 4], [8, 81, 4]],
      [[0, 79, 8], [8, 76, 4]],
      [[0, 77, 4], [4, 74, 4], [8, 69, 4]],
      [[0, 74, 12]],
      [[0, 72, 4], [4, 77, 4], [8, 81, 4]],
      [[0, 82, 6], [6, 81, 2], [8, 79, 4]],
      [[0, 77, 4], [4, 73, 4], [8, 77, 4]],
      [[0, 76, 12]],
    ],
    tuneB: [
      [[0, 81, 4], [4, 84, 4], [8, 81, 4]],
      [[0, 79, 4], [4, 76, 4], [8, 72, 4]],
      [[0, 74, 4], [4, 77, 4], [8, 81, 4]],
      [[0, 82, 8], [8, 81, 4]],
      [[0, 79, 4], [4, 77, 4], [8, 76, 4]],
      [[0, 74, 6], [6, 76, 2], [8, 77, 4]],
      [[0, 80, 4], [4, 77, 4], [8, 73, 4]],
      [[0, 79, 8], [8, 76, 4]],
    ],
  };
  // mus_ocean: A is F C/E Dm Bb F C Bb C; B turns to D minor and borrows B-flat minor like Puff's theme does.
  const OCEAN = {
    A: { ch: [[57, 60, 65], [55, 60, 64], [57, 62, 65], [58, 62, 65], [57, 60, 65], [55, 60, 64], [58, 62, 65], [55, 60, 64]], root: [41, 40, 38, 34, 41, 36, 34, 36] },
    B: { ch: [[57, 62, 65], [57, 60, 64], [58, 62, 65], [57, 60, 65], [55, 58, 62], [57, 62, 65], [58, 61, 65], [55, 60, 64]], root: [38, 45, 34, 41, 43, 38, 34, 36] },
    // [step, interval above the root, steps]: root, octave pop, fifth, root, octave, fifth
    bass: [[0, 0, 3], [3, 12, 1], [6, 7, 2], [8, 0, 2], [11, 12, 1], [14, 7, 2]],
    tuneA: [
      [[0, 72, 3], [3, 77, 3], [6, 81, 6], [12, 79, 2], [14, 77, 2]],
      [[0, 79, 6], [6, 76, 2], [8, 72, 8]],
      [[0, 74, 3], [3, 77, 3], [6, 81, 4], [10, 79, 2], [12, 77, 4]],
      [[0, 74, 12], [12, 72, 4]],
      [[0, 72, 3], [3, 77, 3], [6, 81, 6], [12, 84, 4]],
      [[0, 84, 6], [6, 82, 2], [8, 79, 8]],
      [[0, 77, 3], [3, 79, 3], [6, 82, 4], [10, 81, 2], [12, 79, 4]],
      [[0, 76, 8], [8, 79, 4], [12, 76, 4]],
    ],
    tuneB: [
      [[0, 81, 6], [6, 77, 2], [8, 74, 8]],
      [[0, 76, 6], [6, 72, 2], [8, 69, 8]],
      [[0, 70, 4], [4, 74, 4], [8, 77, 4], [12, 82, 4]],
      [[0, 81, 12], [12, 77, 4]],
      [[0, 79, 4], [4, 82, 4], [8, 86, 8]],
      [[0, 81, 6], [6, 77, 2], [8, 74, 8]],
      [[0, 73, 6], [6, 77, 2], [8, 80, 8]],
      [[0, 79, 8], [8, 76, 4], [12, 72, 4]],
    ],
  };
  // mus_memory: Cm Ab Fm G, then Cm Ab Db G. The song (C harmonic minor, sung by the black hole in mus_m2 too) and Puff's
  // theme as the reef remembers it (his opening, moved to A-flat).
  const MEM = {
    ch: [[48, 55, 60, 63], [44, 51, 56, 60], [41, 48, 53, 56], [43, 50, 55, 59]],
    ch2: [[48, 55, 60, 63], [44, 51, 56, 60], [49, 53, 56, 61], [43, 50, 55, 59]],
    root: [36, 44, 41, 43],
    root2: [36, 44, 37, 43],
    song: [
      [[0, 67, 4], [4, 72, 8], [12, 71, 4]],
      [[0, 68, 8], [8, 67, 8]],
      [[0, 75, 6], [6, 74, 2], [8, 71, 4], [12, 72, 4]],
      [[0, 67, 16]],
    ],
    home: [
      [],
      [[0, 75, 4], [4, 80, 4], [8, 84, 8]],
      [[0, 82, 8], [8, 80, 8]],
      [[0, 79, 16]],
    ],
    survived: [48, 55, 60, 64],
  };
  // mus_m2: two bars a chord, Cm Ab Fm G (then Db for Fm the second time), like the song it carries.
  const M2 = {
    ch: [[60, 63, 67], [60, 63, 68], [60, 65, 68], [59, 62, 67]],
    ch2: [[60, 63, 67], [60, 63, 68], [61, 65, 68], [59, 62, 67]],
    root: [36, 44, 41, 43],
    root2: [36, 44, 37, 43],
  };
  // mus_m3: A minor in the storm. A is Am Am F G Am Am F E, B is Dm Dm Am Am F G E E over rolling toms, and C plays
  // the hook twice over Am F G E.
  const M3 = {
    ch: { Am: [57, 60, 64], F: [57, 60, 65], G: [55, 59, 62], E: [56, 59, 64], Dm: [57, 62, 65] },
    root: { Am: 45, F: 41, G: 43, E: 40, Dm: 38 },
    A: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E'],
    B: ['Dm', 'Dm', 'Am', 'Am', 'F', 'G', 'E', 'E'],
    C: ['Am', 'F', 'G', 'E'],
    hook: [
      [[0, 76, 3], [3, 74, 3], [6, 72, 2], [8, 69, 4], [12, 72, 4]],
      [[0, 77, 6], [6, 76, 2], [8, 72, 4], [12, 69, 4]],
      [[0, 74, 3], [3, 76, 3], [6, 79, 6], [12, 77, 2], [14, 76, 2]],
      [[0, 76, 8], [8, 80, 4], [12, 83, 4]],
      [[0, 81, 3], [3, 79, 3], [6, 76, 2], [8, 72, 4], [12, 76, 4]],
      [[0, 77, 6], [6, 79, 2], [8, 81, 4], [12, 84, 4]],
      [[0, 83, 6], [6, 81, 2], [8, 79, 4], [12, 74, 4]],
      [[0, 80, 12, 83], [12, 76, 4]],
    ],
    // brass swells over B, one or two to a chord
    horn: [
      [[0, 69, 16]], [[0, 72, 8], [8, 74, 8]], [[0, 76, 16]], [[0, 72, 16]],
      [[0, 72, 8], [8, 69, 8]], [[0, 71, 8], [8, 74, 8]], [[0, 71, 16]], [[0, 68, 12, 71], [12, 64, 4]],
    ],
    stabA: [3, 6, 11, 14],
    stabC: [0, 3, 6, 10, 12, 14],
    // C's bass gallops: the 16ths it plays, the octave on 14
    gallop: [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15],
  };
  function m3Section(bar) {
    if (bar < 2) return { name: 'intro', i: bar };
    const b = (bar - 2) % 32;
    if (b < 8) return { name: 'A', i: b };
    if (b < 16) return { name: 'B', i: b - 8 };
    return { name: 'C', i: b - 16 };
  }
  // mus_m4: Bm G D A in the verses, lifting to G A Bm D in the chorus. The horn climbs like a sunrise; the chorus tune
  // is sung by the choir an octave under the lead.
  const M4 = {
    ch: [[59, 62, 66], [55, 59, 62], [57, 62, 66], [57, 61, 64]],
    root: [47, 43, 38, 45],
    lift: [[55, 59, 62], [57, 61, 64], [59, 62, 66], [57, 62, 66]],
    liftRoot: [43, 45, 47, 38],
    horn: [
      [[0, 78, 6], [6, 76, 2], [8, 74, 4], [12, 71, 4]],
      [[0, 74, 4], [4, 76, 4], [8, 79, 8]],
      [[0, 78, 6], [6, 79, 2], [8, 81, 4], [12, 78, 4]],
      [[0, 76, 12], [12, 73, 4]],
      [[0, 78, 4], [4, 83, 4], [8, 81, 6], [14, 79, 2]],
      [[0, 79, 6], [6, 78, 2], [8, 76, 8]],
      [[0, 74, 4], [4, 78, 4], [8, 81, 4], [12, 86, 4]],
      [[0, 85, 8], [8, 81, 8]],
    ],
    chorus: [
      [[0, 83, 6], [6, 81, 2], [8, 79, 8]],
      [[0, 81, 6], [6, 79, 2], [8, 76, 8]],
      [[0, 78, 4], [4, 81, 4], [8, 83, 8]],
      [[0, 86, 12], [12, 85, 4]],
      [[0, 83, 6], [6, 81, 2], [8, 79, 4], [12, 83, 4]],
      [[0, 85, 6], [6, 83, 2], [8, 81, 8]],
      [[0, 78, 4], [4, 83, 4], [8, 86, 8]],
      [[0, 85, 8, 83], [8, 81, 8]],
    ],
  };
  // The eclipse in mus_m4: the light goes out, a slow heartbeat under a dark pad, and Puff's theme (mus_ocean's tune,
  // moved down to D major) on the celesta, very quietly, while he recognizes the harvester.
  function m4Eclipse(m, bar, s, t) {
    const k = bar % 4, ch = M4.ch[k], root = M4.root[k];
    if (s === 0) {
      warm(m, t, ch, m.bar * 1.05, 0.9, { type: 'sawtooth', lp: 650, a: 0.8, r: 0.9 });
      heart(m, t, 0.28);
      round(m, t, root, m.bar * 0.9, 0.35);
    }
    playBars(m, OCEAN.tuneA, bar, s, (n, len) => celesta(m, t, n - 3, len, 0.45, 0.4));
  }
  // mus_fail: Am F Dm E, two bars each.
  const FAIL = {
    ch: [[57, 60, 64], [57, 60, 65], [57, 62, 65], [56, 59, 64]],
    root: [45, 41, 38, 40],
    tune: [
      [[0, 76, 8], [8, 74, 4], [12, 72, 4]],
      [[0, 71, 12], [12, 72, 4]],
      [[0, 69, 16]],
      [[0, 72, 8], [8, 69, 8]],
      [[0, 74, 8], [8, 72, 4], [12, 71, 4]],
      [[0, 69, 16]],
      [[0, 68, 8], [8, 71, 8]],
      [[0, 64, 16]],
    ],
  };
  // mus_grief: Dm Bb Gm A Dm F/C Bb A; Puff's theme turned minor.
  const GRIEF = {
    ch: [[50, 57, 62, 65], [46, 58, 62, 65], [43, 55, 58, 62], [45, 57, 61, 64], [50, 57, 62, 65], [48, 57, 60, 65], [46, 58, 62, 65], [45, 57, 61, 64]],
    tune: [
      [[0, 69, 4], [4, 74, 4], [8, 77, 8]],
      [[0, 77, 6], [6, 74, 2], [8, 70, 8]],
      [[0, 70, 4], [4, 74, 4], [8, 79, 8]],
      [[0, 76, 8], [8, 73, 8]],
      [[0, 69, 4], [4, 74, 4], [8, 77, 8]],
      [[0, 81, 6], [6, 79, 2], [8, 77, 8]],
      [[0, 74, 6], [6, 77, 2], [8, 82, 8]],
      [[0, 81, 8], [8, 76, 4], [12, 73, 4]],
    ],
  };
  const TRACKS = {
    mus_m1: {
      bpm: 140,
      play(m, step, t) {
        const bar = Math.floor(step / 16), s = step % 16, sec = m1Section(bar);
        const ci = bar % 4, root = M1.roots[ci], chord = M1.chords[ci];
        const beat = s % 4 === 0, off = s % 4 === 2;
        const n = sec.name;
        if (s === 0 && sec.i === 0 && n !== 'intro') crash(m, t);
        // drums
        if (n === 'bridge') {
          if (s === 0 || s === 8) kick(m, t, 0.8);
          if (sec.i >= 6) { if (sec.i === 7 || s % 4 === 0) snare(m, t, 0.3 + 0.08 * (s / 2)); }
          if (sec.i === 6 && s === 0) riser(m, t, m.bar * 2);
        } else {
          if (beat && !(n === 'intro' && sec.i < 2 && s !== 0)) kick(m, t);
          if (n !== 'intro' && (s === 4 || s === 12)) snare(m, t, n === 'A' ? 0.6 : 1);
          if (n === 'intro' && sec.i === 3 && s >= 8 && s % 2 === 0) snare(m, t, 0.25 + s * 0.04);
          if (off) hat(m, t, n === 'chorus', 0.9);
          else if (n === 'chorus' || n === 'B') hat(m, t, false, 0.5);
        }
        // bass: driving 8ths, octave jumps in the chorus
        if (s % 2 === 0 && n !== 'bridge') {
          const up = n === 'chorus' && (s === 6 || s === 14);
          bass(m, t, root + (up ? 12 : 0), m.sixteenth * 1.8, n === 'intro' ? 0.7 : 1, n === 'chorus' ? 2200 : 1400);
        }
        if (n === 'bridge' && s === 0) bass(m, t, root, m.bar * 0.95, 0.6, 600);
        // pad: one chord per bar, pumped by the kick
        if (s === 0 && n !== 'intro') pad(m, t, n === 'chorus' ? chord.concat(chord[0] + 12) : chord, m.bar, n === 'bridge' ? 1.3 : 1);
        // arp: 16ths over the chord
        if (n === 'A' || n === 'chorus' || n === 'bridge') {
          const notes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24];
          pluck(m, t, notes[[0, 1, 2, 3, 2, 1, 2, 3][s % 8]], n === 'chorus' ? 0.7 : 1);
        }
        // lead
        if (n === 'B') playPhrase(m, step, t, M1.verse, 0.9);
        if (n === 'chorus') playPhrase(m, step, t, M1.hook, 1);
      },
    },
    // mus_boss: 155 BPM, E minor, i i VI V. A8 B8. Aggressive 16th bass, double-time kick in B, siren lead.
    mus_boss: { bpm: 155, key: 0, play: bossPlay },
    mus_miniboss: { bpm: 150, key: -4, play: bossPlay },
    mus_boss_heavy: { bpm: 150, key: 2, heavy: true, play: bossPlay },
    // mus_victory: fanfare sting, then a calm C F G C loop
    mus_victory: {
      bpm: 120, gain: 1.6,
      play(m, step, t) {
        const bar = Math.floor(step / 16), s = step % 16;
        if (bar < 2) {
          const hits = { 0: 67, 3: 72, 6: 76, 8: 79 };
          if (bar === 0 && hits[s] != null) {
            const len = s === 8 ? m.bar * 1.4 : m.sixteenth * 3;
            [0, 4, 7].forEach((iv) => lead(m, t, hits[s] + iv - 12, len, 0.8));
            kick(m, t, 0.8);
            if (s === 8) crash(m, t);
          }
          return;
        }
        const ch = [[60, 64, 67], [53, 57, 60], [55, 59, 62], [60, 64, 67]][(bar - 2) % 4];
        if (s === 0) { pad(m, t, ch, m.bar, 1.2); bass(m, t, ch[0] - 24, m.bar * 0.9, 0.5, 500); }
        if (s % 4 === 0) kick(m, t, 0.35);
        if (s % 4 === 2) hat(m, t, false, 0.5);
        if (s % 2 === 0) pluck(m, t, ch[(s / 2) % 3] + 12, 0.6);
      },
    },

    // mus_title: 96 BPM, D minor, the Earth Vanguard theme (title screen). intro4 | A8 B8 A8 B8, looping from the first
    // A. A horn climbs D-E-F over Dm Bb F C and lifts to a high C in B; the second time through brings the bright lead
    // (doubled by the horn an octave down) and fuller drums. A square arpeggio rings through a dotted-8th echo.
    mus_title: {
      bpm: 96, gain: 1.3, padVerb: 0.45, leadVerb: 0.45, echo: { steps: 3, feedback: 0.42, mix: 0.5, lp: 2600 },
      play(m, step, t) {
        const T = TITLE, bar = Math.floor(step / 16), s = step % 16;
        const intro = bar < 4, b = intro ? bar : (bar - 4) % 32, i = intro ? bar : b % 8;
        const sec = intro ? 'intro' : b % 16 < 8 ? 'A' : 'B', B = sec === 'B', two = !intro && b >= 16;
        const name = T[sec][i], ch = T.ch[name], root = T.root[name];
        if (s === 0 && i === 0 && (B || two)) crash(m, t);
        if (s === 0) strings(m, t, B ? [ch[0] - 12].concat(ch) : ch, m.bar * 1.04, intro ? 0.75 : 1);
        if (intro || (sec === 'A' && !two)) { if (s === 0) bass(m, t, root, m.bar * 0.95, intro ? 0.45 : 0.6, 600); }
        else if (s % 4 === 0) bass(m, t, root + (two && s === 12 ? 12 : 0), m.beat * 0.85, 0.7, B ? 1100 : 800);
        if (s % 2 === 0 && (bar > 0 || s >= 8)) {
          const arp = [ch[0], ch[1], ch[2], ch[0] + 12];
          arpNote(m, t, arp[[0, 1, 2, 3, 2, 1, 2, 3][s / 2]] + (B ? 12 : 0), intro ? 0.7 : 1);
        }
        if (intro) {
          if (s === 0) kick(m, t, 0.4);
          if (bar >= 2 && s % 4 === 2) hat(m, t, false, 0.3);
          if (bar === 3 && s === 0) riser(m, t, m.bar);
          if (bar === 3 && s >= 8 && s % 2 === 0) snare(m, t, 0.12 + 0.04 * (s - 8));
        } else {
          if (s === 0 || s === 8 || (B && s === 14) || (two && B && s === 6)) kick(m, t, two ? 0.8 : B ? 0.7 : 0.5);
          if ((B || two) && s === 8) snare(m, t, two ? 0.85 : 0.6);
          if (B && i === 7 && s > 8) snare(m, t, 0.15 + 0.05 * (s - 8));
          if (two) hat(m, t, B && s === 14, s % 2 ? 0.22 : 0.38);
          else if (s % 4 === 2) hat(m, t, B && s === 14, 0.35);
        }
        if (!intro) {
          playBars(m, B ? T.tuneB : T.tuneA, i, s, (n, len, from) => {
            if (!B && !two) horn(m, t, n, len, 1, from);
            else {
              lead(m, t, n, len * 0.95, 0.85, from);
              if (two) horn(m, t, n - 12, len, 0.7, from != null ? from - 12 : null);
            }
          });
        }
      },
    },
    // mus_overseers (cutscene theme_dark): 66 BPM, D phrygian, the Overseers. A low "oh" choir over a D pedal sliding to
    // E-flat and back, a bell that tolls every four bars and a cold watcher motif (A, B-flat) high above. mood.intensity
    // (cutscene theme_fire) adds war drums and a string tremolo. 8-bar loop.
    mus_overseers: {
      bpm: 66, gain: 0.87, padVerb: 0.7, leadVerb: 0.7, echo: { steps: 6, feedback: 0.45, mix: 0.5, lp: 1800 },
      play(m, step, t) {
        const bar = Math.floor(step / 16), s = step % 16, b = bar % 8, hot = (m.mood.intensity || 0) > 0.5;
        if (s === 0) OVER[b].forEach((n, k) => choir(m, m.pad, t, n, m.bar * 1.1, 0.06, { vowel: 'oh', a: 1.2, r: 1.2, pan: (k - 1) * 0.35 }));
        if (s === 0 && b % 2 === 0) {
          synth(m, m.pad, t, 38, m.bar * 2.1, 0.06, { type: 'sawtooth', lp: 300, a: 1.5, r: 1.5 });
          synth(m, m.pad, t, 38, m.bar * 2.1, 0.06, { type: 'sine', a: 1.5, r: 1.5 });
        }
        if (s === 0 && b % 4 === 0) toll(m, t, 50, 1);
        if ((b === 2 || b === 6) && (s === 4 || s === 12)) glass(m, t, s === 4 ? 81 : 82, 1, s === 4 ? -0.3 : 0.3);
        if ((b === 3 || b === 7) && s === 0) glass(m, t, 81, 0.8, 0);
        if (b === 0 && s === 0) timp(m, t, 38, 0.6);
        if (b === 7 && s >= 8 && s % 2 === 0) timp(m, t, 38, 0.2 + 0.05 * (s - 8));
        if (hot) {
          if (s === 0 || s === 6 || s === 10) boom(m, t, s === 0 ? 0.6 : 0.4);
          if (s >= 13) boom(m, t, 0.2 + 0.07 * (s - 13));
          [50, 57].forEach((n, k) => synth(m, m.pad, t, n, m.sixteenth * 0.9, 0.03, { type: 'sawtooth', lp: 1500, a: 0.01, r: 0.06, pan: k ? 0.3 : -0.3 }));
        }
      },
    },
    // mus_echo: 80 BPM, A minor, quiet enough that the game's own echoes stay the loudest thing. A dark pad over an A
    // pedal, a sonar ping every two bars and her four-note motif while all is calm. mood.tension (Echo's alarm and
    // hunting drones, 0..1) brings in her heartbeat, then a ticking clock and a pulsing low A, then a high cluster and
    // double-time ticks.
    mus_echo: {
      bpm: 80, gain: 0.7, padVerb: 0.6, leadVerb: 0.6, echo: { steps: 6, feedback: 0.5, mix: 0.6, lp: 2200 },
      play(m, step, t) {
        const bar = Math.floor(step / 16), s = step % 16, ten = m.mood.tension || 0;
        if (s === 0 && bar % 4 === 0) warm(m, t, ECHO.pads[Math.floor(bar / 4) % 4], m.bar * 4.1, 1, { a: 2.5, r: 2.5, lp: 900 });
        if (s === 0 && bar % 2 === 0) glass(m, t, 76, 1, -0.25);
        if (s === 8 && bar % 4 === 3) glass(m, t, 71, 0.5, 0.3);
        if (ten < 0.3 && bar % 8 === 4) {
          playBars(m, ECHO.motif, 0, s, (n, len) => synth(m, m.lead, t, n, len * 1.3, 0.05, { type: 'triangle', a: 0.04, r: 0.4, lp: 2000, echo: 0.5 }));
        }
        if (ten >= 0.2 && s % 4 === 0 && (ten >= 0.45 || s % 8 === 0)) heart(m, t, 0.3 + 0.5 * ten);
        if (ten >= 0.45 && s % 2 === 0) tick(m, t, 0.1 + 0.15 * ten);
        if (ten >= 0.45 && s % 4 === 2) synth(m, m.pad, t, 45, m.sixteenth * 1.5, 0.12, { type: 'sawtooth', lp: 320, exp: true });
        if (ten >= 0.7) {
          if (s % 2 === 1) tick(m, t, 0.08);
          if (s === 0 && bar % 2 === 0) warm(m, t, [81, 82], m.bar * 2, 0.6, { type: 'sawtooth', lp: 2400, a: 0.8, r: 0.8 });
        }
      },
    },
    // mus_free: 72 BPM, E major with a Lydian lift (Echo's escape, cutscene theme_free). Open strings, a wind swell and a
    // celesta tune that climbs into the sky; the second pass adds a plucked arpeggio, a soft bass and a heartbeat kick.
    mus_free: {
      bpm: 72, gain: 0.92, padVerb: 0.6, leadVerb: 0.55, echo: { steps: 3, feedback: 0.45, mix: 0.55, lp: 3200 },
      play(m, step, t) {
        const bar = Math.floor(step / 16), s = step % 16, b = bar % 16, i = b % 8, two = b >= 8, ch = FREE.pads[i];
        const now = i === 7 && s >= 8 ? FREE.res : ch;
        if (s === 0) strings(m, t, ch, i === 7 ? m.bar * 0.55 : m.bar * 1.05, 0.9, { lp: 1500, a: i === 7 ? 0.5 : 1.2 });
        if (i === 7 && s === 8) strings(m, t, FREE.res, m.bar * 0.6, 0.9, { lp: 1500, a: 0.4 });
        if (s === 0 && i % 4 === 0) air(m, t, m.bar * 2, 1);
        playBars(m, FREE.tune, i, s, (n, len) => celesta(m, t, n, len, two ? 1 : 0.85));
        if (two) {
          if (s % 2 === 0) {
            const k = (s / 2) % (now.length - 1);
            synth(m, m.lead, t, now[1 + k] + 12, m.sixteenth * 3, 0.035, { type: 'triangle', exp: true, lp: 3000, echo: 0.3, pan: k % 2 ? 0.3 : -0.3 });
          }
          if (s === 0) round(m, t, ch[0], m.bar * 0.9, 0.55);
          if (s === 0) kick(m, t, 0.3);
        }
      },
    },
    // mus_hope (cutscene theme_hope): 84 BPM, D major. The title theme's opening, now in major, over a falling bass;
    // e-piano, strings and a horn first, then the bright lead and a soft backbeat. A8 B8, twice.
    mus_hope: {
      bpm: 84, gain: 1.3, padVerb: 0.5, leadVerb: 0.5, echo: { steps: 3, feedback: 0.35, mix: 0.4, lp: 2400 },
      play(m, step, t) {
        const H = HOPE, bar = Math.floor(step / 16), s = step % 16, b = bar % 32, i = b % 8;
        const B = b % 16 >= 8, two = b >= 16, ch = H.ch[i], up = ch.slice(1);
        if (s === 0 && i === 0 && (B || two)) crash(m, t);
        if (s === 0) strings(m, t, up, m.bar * 1.04, B ? 1.1 : 0.9);
        if (s === 0 || (B && s === 8)) bass(m, t, ch[0], (B ? m.bar / 2 : m.bar) * 0.95, 0.6, 700);
        // e-piano rolling up the chord: quarters, then 8ths the second time through
        if (two ? s % 2 === 0 : s % 4 === 0) epiano(m, t, up.concat(up[1] + 12)[(s / (two ? 2 : 4)) % 4], m.beat, 0.8, ((s % 8) - 3.5) * 0.08);
        if (s === 0 && i % 4 === 0) timp(m, t, 38, B ? 0.55 : 0.4);
        if (B || two) {
          if (s === 0 || s === 8) kick(m, t, 0.45);
          if (s === 4 || s === 12) snare(m, t, 0.3);
          if (two && s % 4 === 2) hat(m, t, false, 0.3);
        }
        playBars(m, B ? H.tuneB : H.tuneA, i, s, (n, len, from) => {
          if (!two) horn(m, t, n, len, 1, from);
          else {
            lead(m, t, n, len * 0.95, 0.8, from);
            horn(m, t, n - 12, len, 0.6, from != null ? from - 12 : null);
          }
        });
      },
    },
    // mus_puff: Puff's theme (cutscene theme_puff), a music-box waltz in 3/4 at 104 BPM, F major. Oom-pah-pah e-piano under
    // a celesta tune that keeps reaching for home; the borrowed B-flat minor in bar 7 is the part he doesn't talk about.
    // A8 B8; strings join in B.
    mus_puff: {
      bpm: 104, steps: 12, gain: 1.1, padVerb: 0.45, leadVerb: 0.45, echo: { steps: 3, feedback: 0.35, mix: 0.45, lp: 3000 },
      play(m, step, t) {
        const P = PUFF, bar = Math.floor(step / 12), s = step % 12, b = bar % 16, i = b % 8, B = b >= 8;
        if (s === 0) round(m, t, P.bass[i], m.beat * 0.9, 0.55);
        if (s === 4 || s === 8) P.ch[i].forEach((n, k) => epiano(m, t, n, m.beat * 0.9, 0.45, (k - 1) * 0.25));
        if (B && s === 0) strings(m, t, P.ch[i], m.bar * 1.05, 0.6, { lp: 1400 });
        playBars(m, B ? P.tuneB : P.tuneA, i, s, (n, len) => celesta(m, t, n, len, 1, 0.35));
        if (s === 10 && i % 4 === 3) drop(m, t, 89, 0.6);
      },
    },
    // mus_ocean: Puff's Ocean (keys and touch play; silent while the mic listens). 108 BPM, F major: a bouncy round bass,
    // marimba off-beats, shaker and rim, water drops, and Puff's theme straightened into 4/4 on vibes. intro2 | A8 B8 A8
    // B8; B turns wistful (D minor, then B-flat minor) and the second pass adds strings and the tune an octave up.
    mus_ocean: {
      bpm: 108, gain: 1.05, padVerb: 0.4, leadVerb: 0.4, echo: { steps: 3, feedback: 0.3, mix: 0.35, lp: 3200 },
      play(m, step, t) {
        const bar = Math.floor(step / 16), s = step % 16, intro = bar < 2, b = intro ? 0 : (bar - 2) % 32;
        const B = b % 16 >= 8, two = b >= 16, i = intro ? (bar === 0 ? 0 : 7) : b % 8, sec = B ? OCEAN.B : OCEAN.A;
        const ch = sec.ch[i], root = sec.root[i];
        if (!intro || bar === 1) for (const [at, iv, len] of OCEAN.bass) if (at === s) round(m, t, root + iv, m.sixteenth * len * 0.9, 0.75);
        if (s % 4 === 2) marimba(m, t, ch[Math.floor(s / 4) % 3] + 12, 0.8, 0.2);
        shaker(m, t, s % 2 ? 0.5 : 0.9);
        if (!intro) {
          if (s === 0 || s === 8) kick(m, t, 0.45);
          if (s === 4 || s === 12) rim(m, t, 0.3);
          if (two && s === 0) strings(m, t, ch, m.bar * 1.02, 0.55, { lp: 1600 });
          playBars(m, B ? OCEAN.tuneB : OCEAN.tuneA, i, s, (n, len) => {
            vibes(m, t, n, len, 1);
            if (two) celesta(m, t, n + 12, len, 0.35, 0.2);
          });
        }
        if (s === 7 && bar % 2 === 1) drop(m, t, [89, 93, 96][bar % 3], 0.5);
      },
    },
    // mus_memory: Puff's memory, The First Trial (C minor, 92 BPM). An underwater pad and the song the black hole sings
    // (mus_m2 carries it too), a metallic tick for the watching Directorate and, after a while, Puff's own theme as the
    // reef remembers it. The scenario sets mood.progress (0..1 through the trial) to build it up, mood.urgency at
    // "FASTER." (double-time drums, the song an octave up) and mood.done once he survives (the song stops; C major).
    mus_memory: {
      bpm: 92, gain: 0.92, padVerb: 0.7, leadVerb: 0.7, echo: { steps: 6, feedback: 0.5, mix: 0.55, lp: 1800 },
      play(m, step, t) {
        const M = MEM, mood = m.mood, bar = Math.floor(step / 16), s = step % 16, i = bar % 4, alt = bar % 8 >= 4;
        const p = mood.progress || 0, fast = (mood.urgency || 0) > 0.5, done = (mood.done || 0) > 0.5;
        const ch = done ? M.survived : (alt ? M.ch2 : M.ch)[i], root = done ? 36 : (alt ? M.root2 : M.root)[i];
        if (s === 0) warm(m, t, ch, m.bar * 1.05, 1, { type: 'sawtooth', lp: 700, a: 0.9, r: 0.9 });
        if (s === 0) {
          const c = { t, out: m.drums, v: 0.55, p: 1 };
          tone(c, 'sine', mtof(root) * 1.5, mtof(root), 0.6, 0.8, { a: 0.004, glide: 0.12 });
          noise(c, 0.1, 0.25, { f0: 380, f1: 80 });
        }
        if (done) {
          if (s === 0 && bar % 2 === 0) celesta(m, t, 84, m.bar, 0.7);
          return;
        }
        if (p > 0 && (fast ? s % 2 === 0 : s % 4 === 0)) fmv(m, m.drums, t, 96, 0.08, 0.05, { ratio: 2.76, index: 3, index1: 0.5 });
        if (!alt || p < 0.25) {
          playBars(m, M.song, i, s, (n, len) => choir(m, m.lead, t, n + (fast ? 12 : 0), len * 1.05, 0.045, { a: 0.35, r: 0.6, echo: 0.4 }));
        } else {
          playBars(m, M.home, i, s, (n, len) => fmv(m, m.lead, t, n, len + 0.6, 0.07, { ratio: 4, index: 0.8, index1: 0.05, idur: 0.4, echo: 0.5 }));
        }
        if (p >= 0.3 && s % 2 === 0) synth(m, m.pumped, t, root, m.sixteenth * 1.6, 0.16, { type: 'sawtooth', lp: 420, exp: true });
        if (p >= 0.5) {
          if (s === 0 || s === 8 || (fast && s % 4 === 0)) kick(m, t, 0.55);
          if (s === 4 || s === 12) rim(m, t, 0.35);
          if (fast) {
            hat(m, t, false, s % 2 ? 0.2 : 0.32);
            if (i === 3 && s >= 8) snare(m, t, 0.12 + 0.06 * (s - 8));
          }
        }
      },
    },
    // mus_m2 (also 'blackhole', Mission 1's black hole): 128 BPM, C minor, eerie and tense. Ticking hats, a sub that
    // swoops down into every bar like falling in, strings that slide into tune, a far bell with a long delay, and from
    // bar 4 a choir singing the song Puff knows (mus_memory's tune at half speed). A16 B16: B drives harder.
    mus_m2: {
      bpm: 128, gain: 1.2, padVerb: 0.6, leadVerb: 0.6, echo: { steps: 3, feedback: 0.55, mix: 0.6, lp: 2000 },
      play(m, step, t) {
        const bar = Math.floor(step / 16), s = step % 16, b = bar % 32, B = b >= 16, k = Math.floor(b / 2) % 4;
        const alt = Math.floor(b / 8) % 2 === 1, ch = (alt ? M2.ch2 : M2.ch)[k], root = (alt ? M2.root2 : M2.root)[k];
        if (s === 0 && b % 16 === 0 && bar > 0) crash(m, t);
        if (s === 0 && b % 2 === 0) strings(m, t, ch, m.bar * 2.05, 0.9, { bend: -45, bendT: 0.9, lp: 1300 });
        if (s === 0) tone({ t, out: m.pumped, v: 1, p: 1 }, 'sine', mtof(root) * 1.12, mtof(root), m.bar * 0.95, 0.4, { a: 0.01, glide: 0.35 });
        hat(m, t, false, [0.5, 0.15, 0.3, 0.15, 0.4, 0.15, 0.3, 0.2][s % 8] * (B ? 1.1 : 0.8));
        if (B ? s % 4 === 0 : s === 0 || s === 10) kick(m, t, B ? 0.85 : 0.6);
        if (B && (s === 4 || s === 12)) snare(m, t, 0.55);
        if (!B && s === 0) bass(m, t, root, m.bar * 0.9, 0.5, 450);
        if (B && s % 2 === 0) bass(m, t, root + (s % 4 === 2 ? 12 : 0), m.sixteenth * 1.6, 0.7, 900);
        if (bar >= 4) {
          const ss = (b % 2) * 16 + s;
          for (const n of MEM.song[k]) {
            if (n[0] * 2 === ss) choir(m, m.lead, t, n[1] + (B ? 12 : 0), n[2] * 2 * m.sixteenth, 0.04, { a: 0.4, r: 0.8, echo: 0.35, pan: -0.15 });
          }
        }
        if (!B && s === 0 && b % 4 === 1) glass(m, t, [67, 72, 68, 67][Math.floor(b / 4) % 4], 0.8, 0.3);
        if (B) pluck(m, t, [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12][s % 4], 0.45);
      },
    },
    // mus_m3: 150 BPM, A minor, the storm (Mission 3). intro2 | A8 B8 C16 (loops from A). A drives a distorted 8th bass
    // under syncopated stabs; B drops to half time with rolling toms and brass swells; C gallops under the hook, doubled
    // by brass the second time. Thunder swells at the section starts.
    mus_m3: {
      bpm: 150, gain: 0.8, leadVerb: 0.45,
      play(m, step, t) {
        const bar = Math.floor(step / 16), s = step % 16, sec = m3Section(bar), n = sec.name, i = sec.i;
        const name = n === 'intro' ? 'Am' : n === 'C' ? M3.C[i % 4] : M3[n][i];
        const chord = M3.ch[name], root = M3.root[name];
        if (n === 'intro') {
          if (i === 0 && s === 0) { thunder(m, t, m.bar * 2, 1); boom(m, t, 0.8); }
          if (i === 1) {
            tom(m, t, 55 - Math.floor(s / 4) * 3, 0.35 + s * 0.035);
            if (s >= 12) snare(m, t, 0.3 + (s - 12) * 0.12);
          }
          if (s === 0 || s === 8) grit(m, t, root, m.beat * 1.6, 0.7, 900);
          return;
        }
        if (s === 0 && i === 0) crash(m, t);
        if (s === 0 && i % 4 === 0) thunder(m, t, m.bar * 2, n === 'C' ? 0.6 : 0.85);
        // drums
        if (n === 'B') {
          if (s === 0 || s === 10) kick(m, t, 0.9);
          if (s === 8) snare(m, t, 0.9);
          if (s % 2 === 0) hat(m, t, s % 8 === 4, 0.55);
          // rolling toms: a run down the kit in the second half of odd bars, all of the last bar
          if ((i % 2 === 1 && s >= 8) || i === 7) tom(m, t, 57 - (s % 8) * 2, 0.45 + (i === 7 ? s * 0.025 : 0.1));
        } else {
          if (s % 4 === 0) kick(m, t);
          if (n === 'C' && s === 14) kick(m, t, 0.6);
          if (s === 4 || s === 12) snare(m, t, n === 'A' ? 0.8 : 1);
          if (n === 'C') hat(m, t, s % 4 === 2, s % 2 ? 0.35 : 0.6);
          else if (s % 4 === 2) hat(m, t, false, 0.8);
          else if (i >= 4 && s % 2) hat(m, t, false, 0.35);
          if (n === 'A' && i % 2 === 1 && (s === 7 || s === 15)) tom(m, t, s === 7 ? 50 : 45, 0.5);
          if (n === 'C' && i === 15 && s >= 8) tom(m, t, 57 - (s - 8) * 2, 0.5 + (s - 8) * 0.05);
          if (n === 'C' && i === 14 && s === 0) riser(m, t, m.bar * 2);
        }
        // bass
        if (n === 'A' && (s % 2 === 0 || s === 7 || s === 15)) grit(m, t, root + (s === 7 || s === 15 ? 12 : 0), m.sixteenth * 1.6, 1, 1400);
        if (n === 'B' && (s === 0 || s === 10)) grit(m, t, root, m.sixteenth * (s ? 5.5 : 9.5), 0.9, 1000);
        if (n === 'B' && s === 14) grit(m, t, root + 12, m.sixteenth * 1.6, 0.7, 1400);
        if (n === 'C' && M3.gallop.includes(s)) grit(m, t, root + (s === 14 ? 12 : 0), m.sixteenth * 1.4, 1, 2000);
        // chords
        if (n === 'A' && M3.stabA.includes(s)) stab(m, t, chord, 1);
        if (n === 'A' && i >= 4) pluck(m, t, [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12][s % 4], 0.6);
        if (n === 'B' && s === 0) strings(m, t, chord, m.bar * 0.98, 1.2);
        if (n === 'C') {
          if (s === 0) pad(m, t, chord, m.bar, 0.7);
          if (M3.stabC.includes(s)) stab(m, t, chord.map((x) => x + 12), 0.6);
        }
        // tunes
        if (n === 'B') playBars(m, M3.horn, i, s, (x, len, from) => horn(m, t, x, len * 0.97, 1, from));
        if (n === 'C') {
          playBars(m, M3.hook, i % 8, s, (x, len, from) => lead(m, t, x, len * 0.95, 1, from));
          if (i >= 8) playBars(m, M3.hook, i % 8, s, (x, len) => horn(m, t, x - 12, len * 0.95, 0.8));
        }
      },
    },
    // mus_m4: Sunbreak, the blue giant Tarsis (Mission 4). 132 BPM, B minor. A 16th square arpeggio for the light, a horn
    // that climbs in B, a lifted chorus (strings, lead and choir) in C, glass glints for the mirror array, and a
    // breakdown with timpani and a riser. intro4 | A8 B8 C8 D4 (loops from A). mood.eclipse (set by the m4 timeline
    // while the moon crosses the star) turns it into m4Eclipse until the light comes back.
    mus_m4: {
      bpm: 132, gain: 1.15, padVerb: 0.5, leadVerb: 0.5, echo: { steps: 3, feedback: 0.4, mix: 0.45, lp: 3000 },
      play(m, step, t) {
        const bar = Math.floor(step / 16), s = step % 16;
        if ((m.mood.eclipse || 0) > 0.5) { m4Eclipse(m, bar, s, t); return; }
        const intro = bar < 4, b = intro ? 0 : (bar - 4) % 28;
        const sec = intro ? 'intro' : b < 8 ? 'A' : b < 16 ? 'B' : b < 24 ? 'C' : 'D';
        const i = intro ? bar : b < 24 ? b % 8 : b - 24, k = i % 4, lift = sec === 'C';
        const ch = (lift ? M4.lift : M4.ch)[k], root = (lift ? M4.liftRoot : M4.root)[k];
        if (s === 0 && !intro && (b === 0 || b === 16)) crash(m, t);
        // drums
        if (sec === 'D') {
          if (s === 0 || s === 10) timp(m, t, root, s === 0 ? 0.7 : 0.45);
          if (i === 3 && s === 0) riser(m, t, m.bar);
          if (i === 3 && s >= 8 && s % 2 === 0) snare(m, t, 0.2 + 0.07 * (s - 8));
        } else if (intro) {
          if (bar >= 2 && s % 4 === 0) kick(m, t, 0.6);
          if (bar === 3 && s >= 8 && s % 2 === 0) snare(m, t, 0.2 + s * 0.03);
        } else {
          if (s % 4 === 0) kick(m, t, 0.9);
          if (s === 4 || s === 12) snare(m, t, sec === 'A' ? 0.6 : 0.9);
          if (s % 4 === 2) hat(m, t, lift, 0.8);
          else if (sec !== 'A') hat(m, t, false, 0.4);
        }
        // bass: driving 8ths; the chorus jumps an octave on the off-beats
        if (!intro && sec !== 'D' && s % 2 === 0) bass(m, t, root + (lift && s % 4 === 2 ? 12 : 0), m.sixteenth * 1.8, 0.95, lift ? 2200 : 1300);
        if (sec === 'D' && s === 0) bass(m, t, root, m.bar * 0.95, 0.6, 600);
        // pad, or strings in the chorus
        if (s === 0) {
          if (lift) strings(m, t, ch.concat(ch[0] + 12), m.bar * 1.02, 0.9, { lp: 2200 });
          else pad(m, t, ch, m.bar, intro ? 0.7 : 1);
        }
        // the light: a 16th arpeggio over the chord
        if (sec !== 'D' && (!intro || bar >= 1)) {
          pluck(m, t, [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24][[0, 1, 2, 3, 2, 1, 2, 3][s % 8]], lift ? 0.6 : intro ? 0.5 : 0.85);
        }
        // the mirror array glints
        if (s === 6 && bar % 2 === 1 && !lift) glass(m, t, ch[2] + 24, 0.5, bar % 4 === 1 ? -0.4 : 0.4);
        if (sec === 'B') playBars(m, M4.horn, i, s, (n, len) => horn(m, t, n - 12, len * 0.97, 1.1));
        if (lift) {
          playBars(m, M4.chorus, i, s, (n, len, from) => {
            lead(m, t, n, len * 0.95, 0.75, from);
            choir(m, m.lead, t, n - 12, len * 1.02, 0.03, { a: 0.15, r: 0.4, echo: 0.3 });
          });
        }
      },
    },
    // mus_fail: 70 BPM, A minor (the failed screen). After the fail sting, strings drift down Am F Dm E under a lonely
    // bell and a slow heartbeat. A one-bar intro, then an 8-bar loop.
    mus_fail: {
      bpm: 70, padVerb: 0.6, leadVerb: 0.6, echo: { steps: 6, feedback: 0.35, mix: 0.4, lp: 2000 },
      play(m, step, t) {
        const bar = Math.floor(step / 16), s = step % 16, b = bar === 0 ? 0 : (bar - 1) % 8, k = Math.floor(b / 2), ch = FAIL.ch[k];
        if (s === 0 && (bar === 0 || b % 2 === 0)) strings(m, t, ch, m.bar * (bar === 0 ? 1.05 : 2.05), 0.9, { lp: 1200, a: 1.5, r: 1.5 });
        if (s === 0 && (bar === 0 || b % 2 === 0)) round(m, t, FAIL.root[k], m.bar * (bar === 0 ? 0.95 : 1.9), 0.45);
        if (s === 0) heart(m, t, 0.22);
        if (bar > 0) playBars(m, FAIL.tune, b, s, (n, len) => celesta(m, t, n, len, 0.8, 0.3));
      },
    },
    // mus_grief: Puff's grief (cutscene theme_grief), 64 BPM, D minor. E-piano chords rolled upward, strings, and Puff's
    // theme alone on a bell, slowed and turned minor. No drums. A one-bar intro, then 8 bars twice (strings higher the
    // second time).
    mus_grief: {
      bpm: 64, gain: 1.08, padVerb: 0.65, leadVerb: 0.6, echo: { steps: 6, feedback: 0.35, mix: 0.4, lp: 2200 },
      play(m, step, t) {
        const bar = Math.floor(step / 16), s = step % 16, b = bar === 0 ? 0 : (bar - 1) % 16, i = b % 8, two = b >= 8;
        const ch = GRIEF.ch[i];
        if (s % 4 === 0) epiano(m, t, ch[s / 4], m.bar - (s / 4) * m.beat, 0.7, (s / 4 - 1.5) * 0.2);
        if (s === 0) strings(m, t, two ? ch.slice(1).map((n) => n + 12) : ch.slice(1), m.bar * 1.05, two ? 0.7 : 0.8, { lp: 1300, a: 1.4, r: 1.4 });
        if (s === 0) round(m, t, ch[0] - 12, m.bar * 0.95, 0.4);
        if (bar > 0) playBars(m, GRIEF.tune, i, s, (n, len) => celesta(m, t, n, len, 0.9, 0.35));
      },
    },
  };
  const ALIAS = { m1: 'mus_m1', boss: 'mus_boss', blackhole: 'mus_m2' };
  function bossPlay(m, step, t) {
    const k = this.key || 0;
    const bar = Math.floor(step / 16), s = step % 16, b = bar % 16, B = b >= 8;
    const roots = [40, 40, 36, 35];
    const ci = Math.floor(b / 2) % 4, root = roots[ci] + k;
    const chords = [[52, 55, 59], [52, 55, 59], [48, 52, 55], [47, 51, 54]];
    const chord = chords[ci].map((n) => n + k);
    if (s === 0 && (b === 0 || b === 8)) crash(m, t);
    if (this.heavy && !B) { if (s === 0 || s === 10) kick(m, t); if (s === 8) snare(m, t); }
    else if (B ? s % 2 === 0 : s % 4 === 0) kick(m, t, B && s % 4 ? 0.7 : 1);
    if (!(this.heavy && !B) && (s === 4 || s === 12)) snare(m, t);
    hat(m, t, s % 4 === 2, s % 2 ? 0.4 : 0.7);
    bass(m, t, root + (s % 4 === 3 ? 12 : 0), m.sixteenth * 0.9, 0.9, this.heavy ? 900 : 1800);
    if (s === 0 && b % 2 === 0) pad(m, t, chord, m.bar * 2, 0.8);
    const arpN = [chord[0] + 12, chord[2] + 12, chord[1] + 12, chord[0] + 24];
    if (!B) pluck(m, t, arpN[s % 4], 0.8);
    // siren lead in B: long notes that slide into each other
    if (B && s === 0) {
      const line = [76, 75, 72, 71, 76, 79, 78, 75];
      const i = b - 8;
      lead(m, t, line[i] + k, m.bar * 0.98, 0.85, i ? line[i - 1] + k : null);
    }
  }

  const mus = { cur: null, id: null, timer: null };
  /** A playing track's buses: drums, pumped (ducked by every kick), lead and pad (with reverb sends), echo (a tempo-synced
      delay, when def.echo asks for one: {steps, feedback, mix, lp}), all into out, the track's fader (def.gain). */
  function startTrack(id, fade) {
    const def = TRACKS[id];
    const t0 = ac.currentTime, lvl = def.gain != null ? def.gain : 1, f = Math.max(0.05, fade);
    const out = ac.createGain(), wet = ac.createGain();
    for (const g of [out, wet]) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(lvl, t0 + f);
    }
    out.connect(musicBus);
    wet.connect(musicVerb);
    const drums = ac.createGain(), pumped = ac.createGain(), pump = ac.createGain(), leadG = ac.createGain(), padG = ac.createGain();
    drums.gain.value = 0.9;
    pumped.connect(pump);
    pump.connect(out);
    drums.connect(out);
    leadG.connect(out);
    padG.connect(out);
    const nodes = [out, wet, drums, pumped, pump, leadG, padG];
    const send = (from, amount) => {
      if (!amount) return;
      const g = ac.createGain();
      g.gain.value = amount;
      from.connect(g);
      g.connect(wet);
      nodes.push(g);
    };
    send(leadG, def.leadVerb != null ? def.leadVerb : 0.5);
    send(padG, def.padVerb != null ? def.padVerb : 0.35);
    let echo = null;
    if (def.echo) {
      echo = ac.createGain();
      const d = ac.createDelay(2), fb = ac.createGain(), lp = ac.createBiquadFilter(), ret = ac.createGain();
      d.delayTime.value = (60 / def.bpm / 4) * (def.echo.steps || 3);
      fb.gain.value = def.echo.feedback || 0.35;
      lp.type = 'lowpass';
      lp.frequency.value = def.echo.lp || 2600;
      ret.gain.value = def.echo.mix || 0.5;
      echo.connect(d);
      d.connect(lp);
      lp.connect(fb);
      fb.connect(d);
      lp.connect(ret);
      ret.connect(out);
      nodes.push(echo, d, fb, lp, ret);
      send(ret, 0.5);
    }
    const sixteenth = 60 / def.bpm / 4;
    return {
      id, def, out, wet, nodes, drums, pumped: pumped, pump, lead: leadG, pad: padG, echo, mood: moods,
      sixteenth, beat: sixteenth * 4, bar: sixteenth * (def.steps || 16), step: 0, next: ac.currentTime + 0.08,
    };
  }
  function schedule() {
    const m = mus.cur;
    if (!m || !live()) return;
    const now = ac.currentTime;
    if (m.next < now - 0.25) m.next = now + 0.02; // the tab slept: skip ahead instead of bursting
    while (m.next < now + 0.14) {
      try { m.def.play.call(m.def, m, m.step, m.next); } catch (err) { warnOnce('track:' + m.id, 'track ' + m.id + ' threw: ' + err); }
      m.step++;
      m.next += m.sixteenth;
    }
  }
  function fadeOut(m, fade) {
    if (!m) return;
    const t = ac.currentTime;
    for (const g of [m.out.gain, m.wet.gain]) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
    }
    // dropping every bus also breaks the echo's feedback loop
    setTimeout(() => { for (const n of m.nodes) { try { n.disconnect(); } catch (e) { /* gone */ } } }, (fade + 0.6) * 1000);
  }

  // ------------------------------------------------------------------ public
  const A = SL.audio = {
    ready: false,
    current: null,
    get muted() { return muted; },
    set muted(v) { muted = !!v; applyVolume(); },
    /** Volume for narration <audio> clips, which bypass the Web Audio graph: master, or 0 when muted. */
    voiceVolume() { return muted ? 0 : Math.max(0, Math.min(1, vol.master)); },
    unlock() {
      try {
        if (!ac && !build()) return;
        // resume() settles later on some browsers: the waiting track starts then (and on onstatechange)
        if (ac.state !== 'running') ac.resume().then(startPending, () => {});
        A.ready = live();
        startPending();
      } catch (e) {
        A.ready = false;
      }
    },
    sfx(id, o) {
      if (!live() || muted) return;
      const fn = SFX[id];
      if (!fn) { warnOnce('sfx:' + id, 'no sound for sfx "' + id + '"'); return; }
      const now = ac.currentTime;
      if (now - (lastAt[id] || -1) < (GAP[id] || 0.04)) return;
      lastAt[id] = now;
      o = o || {};
      const pan = ac.createStereoPanner();
      pan.pan.value = o.pan != null ? o.pan : o.x != null ? Math.max(-1, Math.min(1, (o.x / (SL.W || 720)) * 2 - 1)) * 0.7 : 0;
      pan.connect(sfxBus);
      const send = ac.createGain();
      send.gain.value = 0.35;
      pan.connect(send);
      send.connect(verbSend);
      try { fn({ t: now + 0.005, out: pan, v: o.vol != null ? o.vol : 1, p: o.pitch || 1 }); } catch (err) {
        warnOnce('sfxerr:' + id, 'sfx "' + id + '" threw: ' + err);
      }
      setTimeout(() => { try { pan.disconnect(); send.disconnect(); } catch (e) { /* gone */ } }, 5000);
    },
    loop(id, o) {
      const L = LOOPS[id];
      if (!L) { warnOnce('loop:' + id, 'no sound for loop "' + id + '"'); return NO_LOOP; }
      if (!live()) return NO_LOOP;
      o = o || {};
      const t = ac.currentTime;
      const osc = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
      const pan = ac.createStereoPanner();
      osc.type = L.type;
      osc.frequency.value = L.f;
      lfo.frequency.value = L.lfo;
      lg.gain.value = L.depth;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(L.gain * (o.vol != null ? o.vol : 1), t + 0.3);
      osc.connect(g);
      const srcs = [osc, lfo];
      if (L.rumble) {
        const n = ac.createBufferSource(), f = ac.createBiquadFilter();
        n.buffer = noiseB;
        n.loop = true;
        f.type = 'lowpass';
        f.frequency.value = L.rumble;
        n.connect(f);
        f.connect(g);
        srcs.push(n);
      }
      g.connect(pan);
      pan.connect(sfxBus);
      const setPan = (x, p) => { pan.pan.value = p != null ? p : x != null ? Math.max(-1, Math.min(1, (x / (SL.W || 720)) * 2 - 1)) * 0.7 : 0; };
      setPan(o.x, o.pan);
      srcs.forEach((s) => s.start(t));
      let stopped = false;
      return {
        set(v) {
          if (stopped || !v) return;
          const now = ac.currentTime;
          if (v.vol != null) g.gain.setTargetAtTime(L.gain * v.vol, now, 0.05);
          if (v.pitch != null) osc.frequency.setTargetAtTime(L.f * v.pitch, now, 0.05);
          if (v.x != null || v.pan != null) setPan(v.x, v.pan);
        },
        stop(fade) {
          if (stopped) return;
          stopped = true;
          const now = ac.currentTime, f = fade != null ? fade : 0.2;
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(g.gain.value, now);
          g.gain.linearRampToValueAtTime(0.0001, now + f);
          srcs.forEach((s) => { try { s.stop(now + f + 0.05); } catch (e) { /* already stopped */ } });
        },
      };
    },
    /** Crossfades to a track (the same one keeps playing unless o.restart). o.mood sets mood values with it; moving to a
        different track clears the old track's moods first. */
    music(trackId, o) {
      o = o || {};
      const id = ALIAS[trackId] || trackId;
      if (!TRACKS[id]) { warnOnce('music:' + trackId, 'no music track "' + trackId + '"'); return; }
      const fade = o.fade != null ? o.fade : 1;
      if (A.current !== id) for (const k in moods) delete moods[k];
      if (o.mood) for (const k in o.mood) A.mood(k, o.mood[k]);
      if (A.current === id && mus.cur && !o.restart) return;
      A.current = id;
      // not running: drop the old track so the new one starts when the context resumes (startPending)
      if (!live()) { if (mus.cur) { fadeOut(mus.cur, 0.05); mus.cur = null; } return; }
      fadeOut(mus.cur, fade);
      mus.cur = startTrack(id, fade);
      if (o.bar) mus.cur.step = (o.bar | 0) * (TRACKS[id].steps || 16); // start partway in (testing a section)
      if (!mus.timer) mus.timer = setInterval(schedule, 25);
      schedule();
    },
    /** Sets a live mood value (0..1) that tracks read as they play (null removes it). */
    mood(name, value) {
      if (value == null) delete moods[name];
      else moods[name] = Math.max(0, Math.min(1, +value || 0));
    },
    /** Holds the music down by `amount` (0..1, 1 = silent) until hush(key, 0); the deepest hush wins. */
    hush(key, amount) {
      const a = Math.max(0, Math.min(1, +amount || 0));
      if (a > 0) hushes[key] = a;
      else delete hushes[key];
      applyDuck(a > 0 ? 0.12 : 0.45);
    },
    stopMusic(fade) {
      A.current = null;
      if (!ac) return;
      fadeOut(mus.cur, fade != null ? fade : 1);
      mus.cur = null;
    },
    duck(amount, seconds) {
      if (!ac) return;
      duckLevel = Math.max(0, Math.min(1, 1 - (amount != null ? amount : 0.4)));
      applyDuck(0.08);
      const until = ac.currentTime + (seconds || 2);
      duckUntil = Math.max(duckUntil, until);
      setTimeout(() => { if (ac.currentTime >= duckUntil - 0.05) { duckLevel = 1; applyDuck(0.3); } }, (seconds || 2) * 1000 + 60);
    },
    setVolumes(v) {
      if (!v) return;
      ['master', 'music', 'sfx'].forEach((k) => { if (typeof v[k] === 'number') vol[k] = v[k]; });
      applyVolume();
    },
    ids() { return Object.keys(SFX).concat(Object.keys(LOOPS)); },
    tracks() { return Object.keys(TRACKS); },
    /** Level check (debug): renders `seconds` of a track offline, never to the speakers, and resolves { id, peak, rms,
        windows } (windows: RMS of each half second). mood is an object, or a function of the time in seconds. The
        rendered buffer stays in A.lastRender. */
    render(trackId, seconds, mood) {
      const id = ALIAS[trackId] || trackId, def = TRACKS[id];
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!def || !OAC) return Promise.resolve(null);
      const sr = 44100, len = Math.ceil(sr * (seconds || 20));
      const off = new OAC(2, len, sr);
      const keep = [ac, musicBus, musicVerb, noiseB], kept = Object.assign({}, moods);
      const setMoods = (o) => {
        for (const k in moods) delete moods[k];
        Object.assign(moods, o);
      };
      try {
        ac = off;
        noiseB = noiseBuffer();
        musicBus = off.createGain();
        musicBus.connect(off.destination);
        musicVerb = makeMusicVerb(musicBus);
        const m = startTrack(id, 0.01);
        while (m.next < len / sr) {
          if (mood) setMoods(typeof mood === 'function' ? mood(m.next) : mood);
          def.play.call(def, m, m.step, m.next);
          m.step++;
          m.next += m.sixteenth;
        }
      } finally {
        [ac, musicBus, musicVerb, noiseB] = keep;
        setMoods(kept);
      }
      return off.startRendering().then((buf) => {
        const L = buf.getChannelData(0), R = buf.getChannelData(1), win = sr / 2, windows = [];
        let peak = 0, sum = 0, ws = 0;
        for (let i = 0; i < L.length; i++) {
          peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
          const e = (L[i] * L[i] + R[i] * R[i]) / 2;
          sum += e;
          ws += e;
          if ((i + 1) % win === 0) { windows.push(Math.sqrt(ws / win)); ws = 0; }
        }
        A.lastRender = buf;
        return { id, peak, rms: Math.sqrt(sum / L.length), windows };
      });
    },
  };

  SL.onBoot(() => {
    const s = SL.save && SL.save.settings;
    if (s) A.setVolumes(s);
    const on = (ev, fn) => SL.bus.on(ev, fn);
    on('settingsChanged', (e) => { if (e && /^(master|music|sfx)$/.test(e.key)) A.setVolumes(e.settings); });
    on('enemyHit', (e) => { if (e && e.e && !e.e.isBoss) A.sfx('hit_enemy', { x: e.e.x }); });
    on('bossWarning', () => A.sfx('boss_warning'));
    on('checkpoint', () => A.sfx('checkpoint'));
    on('lowHull', () => A.sfx('low_hull'));
    on('shieldBreak', (e) => A.sfx('shield_break', { x: e && e.p && e.p.x }));
    on('playerDown', (e) => A.sfx('player_down', { x: e && e.p && e.p.x }));
    on('playerRespawn', (e) => A.sfx('respawn', { x: e && e.p && e.p.x }));
    on('hazardWarning', () => A.sfx('hazard_warning'));
    on('missionStart', () => A.sfx('mission_start'));
    on('bossDefeated', () => A.stopMusic(2.5));
    on('missionEnd', (e) => {
      const r = e && e.reason;
      if (r === 'complete') A.music('mus_victory', { fade: 0.3 });
      else if (r === 'fail') {
        A.stopMusic(1.2);
        A.sfx('mission_fail');
        A.music('mus_fail', { fade: 3 });
      } else A.stopMusic(0.4);
    });
    // the title theme plays whenever the title screen is up (toMenu shows it before it emits 'menu')
    on('screenShow', (e) => { if (e && e.id === 'title') A.music('mus_title', { fade: 1.5 }); });
    on('menu', (e) => { if (!(e && e.screen === 'title')) A.stopMusic(0.8); });
    on('pause', (e) => { if (!e || e.reason !== 'story') { pauseLevel = 0.35; applyDuck(0.15); } });
    on('resume', () => { pauseLevel = 1; applyDuck(0.3); });
  });
})(window.SL = window.SL || {});
