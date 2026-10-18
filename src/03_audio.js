/* 03_audio.js (audio)
   Provides: SL.audio = { unlock(), sfx(id, {vol, pitch, pan, x}), loop(id, opts) -> {set, stop},
   music(trackId, {fade, bar}), stopMusic(fade), duck(amount, seconds), setVolumes({master, music, sfx}),
   ready, muted, current, ids(), tracks() }.
   Everything is WebAudio synthesis (GDD section 17), no audio files. Mix: master -> compressor -> speakers; an SFX
   bus with a short shared reverb send; a music bus with a duck stage (radio lines, pause). Repeating sounds are
   rate-limited per id and use x (0..SL.W) for stereo pan. Unknown ids warn once and play nothing.
   Music is a step sequencer scheduled a little ahead of the audio clock. mus_m1 (140 BPM, E minor) pumps: every
   kick ducks the bass, pad and arp bus, so the synths breathe with the drums. 'm1' and 'boss' alias mus_m1 and
   mus_boss; mus_miniboss and mus_boss_heavy are the boss track at their own tempo and key.
   Also reacts to bus events: boss warning, checkpoint, low hull, shield break, player down, pause (music ducks),
   boss defeated (music fades out), mission end (victory track or a fail sting) and menu (music stops).
   Echo, Puff's Ocean and the cutscenes keep their own sound. Core calls unlock() on the first gesture; ?mute=1
   sets muted. */
(function (SL) {
  'use strict';

  let ac = null;
  let master = null, sfxBus = null, musicBus = null, duckGain = null, verbSend = null, noiseB = null;
  const vol = { master: 0.9, music: 0.7, sfx: 0.85 };
  let muted = false;
  let duckLevel = 1, pauseLevel = 1, duckUntil = 0;
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
  function applyDuck(tc) {
    if (ac) duckGain.gain.setTargetAtTime(Math.min(duckLevel, pauseLevel), ac.currentTime, tc || 0.12);
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
    // short shared reverb: decaying noise as the impulse
    const len = Math.floor(ac.sampleRate * 1.4);
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const verb = ac.createConvolver();
    verb.buffer = ir;
    verbSend = ac.createGain();
    verbSend.gain.value = 0.22;
    verbSend.connect(verb);
    verb.connect(master);
    const n = ac.sampleRate * 2;
    noiseB = ac.createBuffer(1, n, ac.sampleRate);
    const nd = noiseB.getChannelData(0);
    for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
    applyVolume();
    return true;
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
      bpm: 120,
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
  };
  const ALIAS = { m1: 'mus_m1', boss: 'mus_boss' };
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
  function startTrack(id, fade) {
    const def = TRACKS[id];
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, ac.currentTime);
    out.gain.linearRampToValueAtTime(1, ac.currentTime + Math.max(0.05, fade));
    out.connect(musicBus);
    const drums = ac.createGain(), pumped = ac.createGain(), pump = ac.createGain(), leadG = ac.createGain();
    drums.gain.value = 0.9;
    pumped.connect(pump);
    pump.connect(out);
    drums.connect(out);
    leadG.connect(out);
    const send = ac.createGain();
    send.gain.value = 0.5;
    leadG.connect(send);
    send.connect(verbSend);
    const sixteenth = 60 / def.bpm / 4;
    return {
      id, def, out, drums, pumped: pumped, pump, lead: leadG, sixteenth, beat: sixteenth * 4, bar: sixteenth * 16,
      step: 0, next: ac.currentTime + 0.08,
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
    m.out.gain.cancelScheduledValues(t);
    m.out.gain.setValueAtTime(m.out.gain.value, t);
    m.out.gain.linearRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
    setTimeout(() => { try { m.out.disconnect(); } catch (e) { /* gone */ } }, (fade + 0.6) * 1000);
  }

  // ------------------------------------------------------------------ public
  const A = SL.audio = {
    ready: false,
    current: null,
    get muted() { return muted; },
    set muted(v) { muted = !!v; applyVolume(); },
    unlock() {
      try {
        if (!ac && !build()) return;
        if (ac.state === 'suspended') ac.resume().catch(() => {});
        A.ready = true;
        if (A.current && !mus.cur) A.music(A.current, { fade: 1 });
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
    music(trackId, o) {
      const id = ALIAS[trackId] || trackId;
      if (!TRACKS[id]) { warnOnce('music:' + trackId, 'no music track "' + trackId + '"'); return; }
      const fade = o && o.fade != null ? o.fade : 1;
      if (A.current === id && mus.cur) return;
      A.current = id;
      if (!live()) return; // starts on unlock()
      fadeOut(mus.cur, fade);
      mus.cur = startTrack(id, fade);
      if (o && o.bar) mus.cur.step = (o.bar | 0) * 16; // start partway in (testing a section)
      if (!mus.timer) mus.timer = setInterval(schedule, 25);
      schedule();
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
      else if (r === 'fail') { A.stopMusic(1.2); A.sfx('mission_fail'); }
      else A.stopMusic(0.4);
    });
    on('menu', () => A.stopMusic(0.8));
    on('pause', (e) => { if (!e || e.reason !== 'story') { pauseLevel = 0.35; applyDuck(0.15); } });
    on('resume', () => { pauseLevel = 1; applyDuck(0.3); });
  });
})(window.SL = window.SL || {});
