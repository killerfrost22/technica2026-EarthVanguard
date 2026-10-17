/* 26_cutscenes.js (cutscenes)
   Provides: SL.cutscenes = { play(id) -> Promise<result>, seen(id), start(), afterEcho(), inStory(), stages,
   jump(stageId), resetStory() }.
   Wires the story cutscenes (player, art and script in cutscenes/earth-vanguard-cutscenes/cutscenes/, inlined by
   tools/build.py after the game modules as window.Cutscene and window.CUTSCENES) into the game.
   Story order on a new save, driven by the title screen's Start button:
     Start -> 'intro' -> Echo (Blue Arrow's escape)
     Echo escaped -> Continue -> 'echo_complete' -> 'puff_intro' -> Mission 1
     Mission 1 cleared -> back at the menu -> 'puff_complete'
   Once the story has reached Mission 1, Start goes straight to Mission 1. 2 Players always goes straight to
   Mission 1. Each cutscene plays once per save (save.flags.cs_<id>); Esc skips one.
   Choices in cutscenes read and write Puff's trust in save.flags.puff_trust, the same count Mission 1's
   puff_trust1 radio choice adds to.
   Developer tools (27_devtools.js) use stages + jump(stageId) to go to any story point and resetStory() to forget
   it; with SL.debug.skipMinigames on, the story passes through Echo without playing it.
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
    current = window.Cutscene.play(id, { state, voice: !(SL.audio && SL.audio.muted) }).catch((err) => {
      console.error('[SL.cutscenes] cutscene "' + id + '" failed:', err);
      return null;
    }).then((result) => {
      playing = false;
      current = null;
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

  function toMission() { SL.game.startMission(STORY_MISSION, { coop: false }); }
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
  /** Story points to jump to, in order: each one sets the save as if everything before it had been played. */
  const STAGES = [
    { id: 'prologue', label: 'Prologue', done: [] },
    { id: 'echo', label: 'Echo', done: ['cs_intro'] },
    { id: 'after_echo', label: 'After Echo', done: ['cs_intro', 'echo_escaped'] },
    { id: 'mission1', label: 'Mission 1', done: ['cs_intro', 'echo_escaped', 'cs_echo_complete', 'cs_puff_intro'] },
    { id: 'after_mission1', label: 'After Mission 1', done: ['cs_intro', 'echo_escaped', 'cs_echo_complete', 'cs_puff_intro', 'puff_memory1'] },
  ];

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
      else if (stage.id === 'mission1') toMission();
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
