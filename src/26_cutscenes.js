/* 26_cutscenes.js (cutscenes)
   Provides: SL.cutscenes = { play(id) -> Promise<result>, seen(id), start(), afterEcho(), inStory(), stages,
   jump(stageId), resetStory() }.
   Wires the story cutscenes (player, art and script in cutscenes/earth-vanguard-cutscenes/cutscenes/, inlined by
   tools/build.py after the game modules as window.Cutscene and window.CUTSCENES) into the game.
   Story order on a new save, driven by the title screen's Start button:
     Start -> 'intro' -> Echo (Blue Arrow's escape)
     Echo escaped -> Continue -> 'echo_complete' -> 'puff_intro' -> Mission 1
     Mission 1 cleared -> back at the menu -> 'puff_complete'
   Once the story has reached Mission 1, Start goes straight to the next mission to clear (SL.progress.nextMission:
   Mission 1, then Mission 2 and on). 2 Players goes there too. Each cutscene plays once per save (save.flags.cs_<id>); Esc skips one.
   Choices in cutscenes read and write Puff's trust in save.flags.puff_trust, the same count Mission 1's
   puff_trust1 radio choice adds to.
   Developer tools (27_devtools.js) use stages + jump(stageId) to go to any story point and resetStory() to forget
   it; with SL.debug.skipMinigames on, the story passes through Echo without playing it.
   Sound: a shot's `music` cue (scenes.js) picks the track for its mood and its `sfx` cue a sound effect (CUE_MUSIC and
   CUE_SFX below); the music sinks under each narration line while it plays.
   URL test hook: ?cutscene=<id> plays that cutscene over the title screen. */
(function (SL) {
  'use strict';

  const U = SL.util;
  const STORY_MISSION = 'm1';

  function flags() {
    const d = SL.save.data;
    if (!U.isPlain(d.flags)) d.flags = {};
    return d.flags;
  }
  function available(id) { return !!(window.Cutscene && window.CUTSCENES && window.CUTSCENES[id]); }

  // Shared with every cutscene's when() / effect(): trust lives in the save.
  const state = {
    get trust() { return +flags().puff_trust || 0; },
    set trust(v) { flags().puff_trust = Math.max(0, Math.floor(+v || 0)); },
  };

  let playing = false;
  let current = null; // the playing cutscene's promise

  // scenes.js mood cues -> [03_audio.js track, mood values it reads]
  const CUE_MUSIC = {
    theme_dark: ['mus_overseers', { intensity: 0 }], // the Overseers, the regime
    theme_fire: ['mus_overseers', { intensity: 1 }], // the same, with war drums: the night her home burned
    theme_echo: ['mus_echo', { tension: 0 }],        // the cell, the dark, the power failing: carries on into Echo
    theme_free: ['mus_free'],                        // open air
    theme_hope: ['mus_hope'],                        // resolve: Earth Vanguard, going home
    theme_puff: ['mus_puff'],                        // Puff
    theme_grief: ['mus_grief'],                      // what happened to Puff's world
  };
  // scenes.js sound cues -> 03_audio.js sfx ids ('flash' comes from the player on every white flash)
  const CUE_SFX = {
    fire: 'cs_fire', alarm_low: 'cs_alarm', power_down: 'cs_power_down', engine: 'cs_engine',
    explosion: 'cs_explosion', distress: 'cs_distress', flash: 'cs_flash',
  };
  function onMusic(name) {
    const cue = CUE_MUSIC[name];
    if (!cue) { U.warnOnce('cs-music:' + name, 'cutscene music cue "' + name + '" has no track'); return; }
    if (SL.audio && SL.audio.music) SL.audio.music(cue[0], { fade: 2, mood: cue[1] });
  }
  function onSfx(name) {
    if (SL.audio && SL.audio.sfx) SL.audio.sfx(CUE_SFX[name] || name);
  }
  function onVoice(speaking) {
    if (SL.audio && SL.audio.hush) SL.audio.hush('cutscene_voice', speaking ? 0.45 : 0);
  }

  /** Plays one cutscene over the whole page and marks it seen. Resolves with the player's result (or null).
      The screen underneath is hidden while it plays and shown again after, unless opts.restore is false (the
      caller moves on to another screen or a mission). */
  function play(id, opts) {
    const restore = !opts || opts.restore !== false;
    if (!available(id)) return Promise.resolve(null);
    playing = true;
    const g0 = gen;
    const prevUi = SL.ui && SL.ui.current;
    if (SL.ui && SL.ui.hide) SL.ui.hide();
    if (SL.audio && SL.audio.unlock) SL.audio.unlock();
    current = window.Cutscene.play(id, { state, voice: !(SL.audio && SL.audio.muted), onMusic, onSfx, onVoice }).catch((err) => {
      console.error('[SL.cutscenes] cutscene "' + id + '" failed:', err);
      return null;
    }).then((result) => {
      playing = false;
      current = null;
      onVoice(false);
      if (gen !== g0) return result; // a developer jump stopped it: leave the story flags as the jump set them
      flags()['cs_' + id] = true;
      SL.save.commit();
      if (restore && prevUi && SL.ui && SL.ui.show && SL.screens.has(prevUi) && !SL.ui.current) SL.ui.show(prevUi);
      return result;
    });
    return current;
  }
  function seen(id) { return !!flags()['cs_' + id]; }

  /** True between the prologue and Mission 1: Echo's escape continues the story instead of ending at the title. */
  function inStory() { return seen('intro') && !seen('puff_intro') && available('echo_complete'); }

  // Each story chain (start, afterEcho, jump) remembers the generation it began in and stops if a developer jump
  // (27_devtools.js) started a new one meanwhile, so a skipped cutscene can't drag the game somewhere stale.
  let gen = 0;
  const still = (g) => g === gen;

  function toMission() {
    const next = seen('puff_intro') && SL.progress && SL.progress.nextMission ? SL.progress.nextMission() : STORY_MISSION;
    SL.game.startMission(next || STORY_MISSION, { coop: false });
  }
  function skipMinigames() { return !!(SL.debug && SL.debug.skipMinigames); }

  /** Opens Echo, or with the developer "skip minigames" switch on, counts it as escaped and carries on. */
  function toEcho() {
    if (skipMinigames() || !(SL.echo && SL.echo.open)) {
      flags().echo_escaped = true;
      SL.save.commit();
      afterEcho();
      return;
    }
    SL.echo.open();
  }

  /** Title screen Start: continues the story where this save left it. */
  function start() {
    if (playing) return;
    const g = gen;
    if (!available('intro')) { toMission(); return; }
    if (!seen('intro')) {
      play('intro', { restore: false }).then(() => { if (still(g)) toEcho(); });
      return;
    }
    if (!seen('puff_intro')) {
      if (!flags().echo_escaped) { toEcho(); return; }
      afterEcho();
      return;
    }
    toMission();
  }

  /** Echo's escape screen, Continue: the road from the surface to Earth Vanguard, then Mission 1. */
  function afterEcho() {
    if (playing) return;
    const g = gen;
    const first = seen('echo_complete') ? Promise.resolve() : play('echo_complete', { restore: false });
    first.then(() => (!still(g) || seen('puff_intro') ? null : play('puff_intro', { restore: false })))
      .then(() => { if (still(g)) toMission(); });
  }

  // ------------------------------------------------------------------ developer jumps (27_devtools.js)
  const STORY_FLAGS = ['echo_escaped', 'puff_memory1', 'puff_trust'];
  /** Story points to jump to, in order: each one sets the save as if everything before it had been played.
      cleared: missions marked done (later missions unlock only after the one before is cleared); mission: start it. */
  const AFTER_M1 = ['cs_intro', 'echo_escaped', 'cs_echo_complete', 'cs_puff_intro', 'puff_memory1', 'cs_puff_complete'];
  const STAGES = [
    { id: 'prologue', label: 'Prologue', done: [] },
    { id: 'echo', label: 'Echo', done: ['cs_intro'] },
    { id: 'after_echo', label: 'After Echo', done: ['cs_intro', 'echo_escaped'] },
    { id: 'mission1', label: 'Mission 1', done: ['cs_intro', 'echo_escaped', 'cs_echo_complete', 'cs_puff_intro'], mission: STORY_MISSION },
    { id: 'after_mission1', label: 'After Mission 1', done: ['cs_intro', 'echo_escaped', 'cs_echo_complete', 'cs_puff_intro', 'puff_memory1'], cleared: ['m1'] },
    { id: 'mission2', label: 'Mission 2', done: AFTER_M1, cleared: ['m1'], mission: 'm2' },
    { id: 'mission3', label: 'Mission 3', done: AFTER_M1, cleared: ['m1', 'm2'], mission: 'm3' },
    { id: 'mission4', label: 'Mission 4', done: AFTER_M1, cleared: ['m1', 'm2', 'm3'], mission: 'm4' },
  ];

  /** Marks missions cleared, keeping any best score or rank already saved. */
  function markCleared(ids) {
    const all = SL.save.data.missions;
    for (const id of ids || []) all[id] = Object.assign(SL.save.mission(id), all[id] || {}, { done: true });
  }

  /** Forgets the story: every cutscene unseen, Echo not escaped, Puff's memory and trust cleared. */
  function resetStory() {
    gen++;
    const f = flags();
    for (const k of Object.keys(f)) if (k.startsWith('cs_') || STORY_FLAGS.includes(k)) delete f[k];
    SL.save.commit();
  }

  /** Jumps to a story point (an id from STAGES): stops whatever is running, rewrites the story flags, goes there. */
  function jump(stageId) {
    const stage = STAGES.find((x) => x.id === stageId);
    if (!stage) return;
    resetStory();
    const g = gen;
    const f = flags();
    for (const k of stage.done) f[k] = true;
    markCleared(stage.cleared);
    SL.save.commit();
    const wait = current || Promise.resolve();
    if (playing && window.Cutscene) window.Cutscene.skip();
    wait.then(() => {
      if (!still(g)) return;
      pendingAfterMission = false;
      if (SL.game.state !== 'menu') SL.game.toMenu('title');
      if (stage.id === 'prologue') start();
      else if (stage.id === 'echo') toEcho();
      else if (stage.id === 'after_echo') afterEcho();
      else if (stage.mission) SL.game.startMission(stage.mission, { coop: false });
      else if (stage.id === 'after_mission1') play('puff_complete');
    });
  }

  // Mission 1 cleared: the reveal plays once the player is back at the menu (after the results screen).
  let pendingAfterMission = false;
  SL.onBoot(() => {
    SL.bus.on('missionComplete', (e) => {
      if (e && e.session && e.session.missionId === STORY_MISSION && !e.session.sandbox && !seen('puff_complete')) {
        pendingAfterMission = true;
      }
    });
    SL.bus.on('menu', () => {
      if (!pendingAfterMission || playing) return;
      pendingAfterMission = false;
      play('puff_complete');
    });
    const q = new URLSearchParams(location.search).get('cutscene');
    if (q) setTimeout(() => play(q), 300);
  });

  SL.cutscenes = { play, seen, start, afterEcho, inStory, state, isPlaying: () => playing, stages: STAGES, jump, resetStory };
})(window.SL);
