/* 26_cutscenes.js (cutscenes)
   Provides: SL.cutscenes = { play(id) -> Promise<result>, seen(id), start(), afterEcho(), inStory() }.
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

  /** Plays one cutscene over the whole page and marks it seen. Resolves with the player's result (or null).
      The screen underneath is hidden while it plays and shown again after, unless opts.restore is false (the
      caller moves on to another screen or a mission). */
  function play(id, opts) {
    const restore = !opts || opts.restore !== false;
    if (!available(id)) return Promise.resolve(null);
    playing = true;
    const prevUi = SL.ui && SL.ui.current;
    if (SL.ui && SL.ui.hide) SL.ui.hide();
    if (SL.audio && SL.audio.unlock) SL.audio.unlock();
    return window.Cutscene.play(id, { state, voice: !(SL.audio && SL.audio.muted) }).catch((err) => {
      console.error('[SL.cutscenes] cutscene "' + id + '" failed:', err);
      return null;
    }).then((result) => {
      playing = false;
      flags()['cs_' + id] = true;
      SL.save.commit();
      if (restore && prevUi && SL.ui && SL.ui.show && SL.screens.has(prevUi) && !SL.ui.current) SL.ui.show(prevUi);
      return result;
    });
  }
  function seen(id) { return !!flags()['cs_' + id]; }

  /** True between the prologue and Mission 1: Echo's escape continues the story instead of ending at the title. */
  function inStory() { return seen('intro') && !seen('puff_intro') && available('echo_complete'); }

  function toMission() { SL.game.startMission(STORY_MISSION, { coop: false }); }

  /** Title screen Start: continues the story where this save left it. */
  function start() {
    if (playing) return;
    if (!available('intro')) { toMission(); return; }
    if (!seen('intro')) {
      play('intro', { restore: false }).then(() => { if (SL.echo && SL.echo.open) SL.echo.open(); else toMission(); });
      return;
    }
    if (!seen('puff_intro')) {
      if (SL.echo && SL.echo.open && !flags().echo_escaped) { SL.echo.open(); return; }
      afterEcho();
      return;
    }
    toMission();
  }

  /** Echo's escape screen, Continue: the road from the surface to Earth Vanguard, then Mission 1. */
  function afterEcho() {
    if (playing) return;
    const first = seen('echo_complete') ? Promise.resolve() : play('echo_complete', { restore: false });
    first.then(() => (seen('puff_intro') ? null : play('puff_intro', { restore: false }))).then(toMission);
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

  SL.cutscenes = { play, seen, start, afterEcho, inStory, state, isPlaying: () => playing };
})(window.SL);
