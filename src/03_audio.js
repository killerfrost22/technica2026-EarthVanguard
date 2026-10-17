/* STUB: replaced by audio
   03_audio.js provides: SL.audio = { unlock(), sfx(id, {vol, pitch, pan, x}), loop(id, opts) -> {set, stop},
   music(trackId, {fade}), stopMusic(fade), duck(amount, seconds), setVolumes({master, music, sfx}),
   ready, muted, current }.
   This stub keeps the full API as no-ops, plus tiny UI beeps so the unlock path can be heard and tested.
   Core calls unlock() on the first pointerdown/touch/keydown; ?mute=1 sets muted = true. */
(function (SL) {
  'use strict';

  let ac = null;
  let out = null;
  const vol = { master: 0.9, music: 0.7, sfx: 0.85 };
  const BEEPS = {
    ui_move: { f: 660, d: 0.035, g: 0.05 },
    ui_confirm: { f: 880, f2: 1320, d: 0.08, g: 0.06 },
    ui_back: { f: 520, f2: 330, d: 0.08, g: 0.05 },
  };

  function applyVolume() {
    if (out) out.gain.value = A.muted ? 0 : vol.master * vol.sfx;
  }

  const A = SL.audio = {
    ready: false,
    muted: false,
    current: null,
    unlock() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!ac) {
          ac = new AC();
          out = ac.createGain();
          out.connect(ac.destination);
          applyVolume();
        }
        if (ac.state === 'suspended') ac.resume().catch(() => {});
        A.ready = true;
      } catch (e) {
        A.ready = false;
      }
    },
    sfx(id) {
      const b = BEEPS[id];
      if (!b || !ac || A.muted || ac.state !== 'running') return;
      const t = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(b.f, t);
      if (b.f2) o.frequency.exponentialRampToValueAtTime(b.f2, t + b.d);
      g.gain.setValueAtTime(b.g, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + b.d);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + b.d + 0.02);
    },
    loop() { return { set() {}, stop() {} }; },
    music(trackId) { A.current = trackId || null; },
    stopMusic() { A.current = null; },
    duck() {},
    setVolumes(v) {
      if (!v) return;
      ['master', 'music', 'sfx'].forEach((k) => { if (typeof v[k] === 'number') vol[k] = v[k]; });
      applyVolume();
    },
  };

  SL.onBoot(() => {
    const s = SL.save && SL.save.settings;
    if (s) A.setVolumes(s);
    SL.bus.on('settingsChanged', (e) => { if (e && /^(master|music|sfx)$/.test(e.key)) A.setVolumes(e.settings); });
  });
})(window.SL = window.SL || {});
