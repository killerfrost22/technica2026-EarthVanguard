/* 18_missions.js (missions, interim until the full GDD section 4 campaign lands)
   Provides: mission 'test' (dev: the core systems check, about 60 s of waves using every director event type:
   formations, spawns, repeat, if, radio, pods, pickups, banners, music, scroll, bg phases, waitClear, a checkpoint, a
   story choice, the test_blackhole hazard, then test_boss and an afterBoss line) and 'm1', First Light, which flies the
   same timeline with the real Mission 1 roster (gnat, dart, wasp, manta; GDD 6) and the GDD's m1 tune. 'test' is
   flagged dev: true (menus may hide it).
   m1 flies over the Vesta Shipyards (bg_vesta: the catapult launch off the Halcyon's deck, the belt, the shipyard, the
   storm around the black hole, RAZORBACK's shadow and the sunrise after it), adds Puff's bubble (puffBuddy), swaps the
   stub hazard for a real black_hole that pulls Puff in, and replaces the beacon choice with Puff's first trust choice
   (25_puffstory.js). While the black hole is near, the music turns to the song it sings ('blackhole', mus_m2), and it
   returns to mus_m1 once Puff has answered. */
(function (SL) {
  'use strict';

  function testTimeline() {
    return [
      { at: 0, banner: 'TEST RANGE', sub: 'Core systems check', music: 'm1', scroll: 90 },
      { at: 0.6, radio: 'test_hello' },
      { at: 2, formation: 'vee', enemy: 'gnat', count: 5, x: 360 },
      { at: 5, formation: 'line', enemy: 'dart', count: 4, x: 200, opts: { gap: 70, stagger: 40 } },
      { at: 7, formation: 'line', enemy: 'dart', count: 4, x: 520, opts: { gap: 70, stagger: 40 } },
      { at: 9.5, spawn: 'wasp', x: 240 },
      { at: 11, pod: { x: 520, y: -40, people: 3 } },
      { at: 12, formation: 'arc_sweep', enemy: 'gnat', count: 8, opts: { side: 'left' } },
      { at: 13, spawn: 'wasp', x: 480 },
      { at: 15, pickup: 'weapon_spread', x: 360, y: -30 },
      { at: 17, formation: 'vee', enemy: 'gnat', count: 7, x: 360, repeat: { every: 3, count: 3 } },
      { at: 20, spawn: 'manta', x: 360 },
      { at: 26, waitClear: true, timeout: 14 },
      { at: 27, checkpoint: true, banner: 'CHECKPOINT', sub: 'Gravity anomaly ahead', bg: 'danger', scroll: 120 },
      { at: 28, hazard: 'test_blackhole', x: 360, y: -150, opts: { vy: 62, life: 22 } },
      { at: 29, radio: 'test_blackhole' },
      { at: 30, formation: 'column', enemy: 'gnat', count: 6, x: 140, opts: { weave: 40 }, repeat: { every: 4, count: 3 } },
      { at: 32, formation: 'column', enemy: 'gnat', count: 6, x: 580, opts: { weave: 40 }, repeat: { every: 4, count: 3 } },
      { at: 34, spawn: 'wasp', x: 160 },
      { at: 36, spawn: 'wasp', x: 560 },
      { at: 38, choice: 'test_choice' },
      { at: 39, if: (s) => s.flags.test_choice === 'a', pod: { x: 260, y: -40, people: 4 }, radio: { who: 'sparrow', text: 'Covering the pod. Bring it in!' } },
      { at: 40, pod: { x: 460, y: -40, people: 2 } },
      { at: 42, pickup: 'shield', x: 300 },
      { at: 44, formation: 'pincer', enemy: 'dart', count: 10 },
      { at: 46, spawn: 'manta', x: 360 },
      { at: 48, pickup: 'repair', x: 360 },
      { at: 50, waitClear: true, timeout: 14 },
      { at: 51, bg: 'boss', scroll: 60, banner: 'WARNING', sub: 'Dreadnought class contact', color: '#ff5c8a' },
      { at: 53.5, boss: 'test_boss' },
      { at: 54, afterBoss: true, radio: 'test_victory' },
    ];
  }

  const base = {
    kind: 'main', location: 'Calibration range', bg: 'default', music: 'm1', bossMusic: 'boss',
    objectives: [
      { id: 'boss', text: 'Destroy the Calibrator', check: (s) => (s.bossesDefeated || 0) > 0 },
      { id: 'rescue', text: 'Rescue 5 survivors', check: (s) => s.rescued >= 5 },
    ],
    rewards: { credits: 500, sp: 1 },
  };

  SL.missions.define('test', Object.assign({}, base, { name: 'Test Range', order: 0, dev: true, boss: 'test_boss', timeline: testTimeline }));
  // m1 flies the test range's beats over Vesta with Puff aboard and a real black hole: it pulls Puff in, and inside it
  // he remembers the first of the Directorate's trials (25_puffstory.js).
  function m1Timeline() {
    const PS = () => SL.puffStory || {};
    const back = () => !!PS().memoryDone;
    return testTimeline()
      // the test range's beacon choice gives way to Puff's trust choice below
      .filter((ev) => ev.choice !== 'test_choice' && !(ev.if && String(ev.if).indexOf('test_choice') >= 0))
      .map((ev) => {
        if (ev.at === 0 && ev.banner) return Object.assign({}, ev, { banner: 'FIRST LIGHT', sub: 'Vesta Shipyards', bg: 'launch', scroll: 900 });
        if (ev.hazard === 'test_blackhole') return { at: ev.at, hazard: 'black_hole', x: 360, y: -150, opts: { size: 'medium', vy: 62, life: 26 } };
        if (ev.banner === 'WARNING') return Object.assign({}, ev, { sub: 'Assault carrier RAZORBACK' });
        if (ev.boss) return Object.assign({}, ev, { boss: 'boss_razorback' });
        if (ev.afterBoss) return Object.assign({}, ev, { bg: 'sunrise', scroll: 70 });
        return ev;
      })
      .concat([
        // the catapult throws the jet off the Halcyon's deck (bg_vesta 'launch' fires it at 1 s), then the belt
        { at: 0.55, call: () => SL.audio && SL.audio.sfx && SL.audio.sfx('catapult') },
        { at: 3, bg: 'belt', scroll: 90 },
        { at: 3, radio: { who: 'puff', text: 'Bubble sealed, tether locked. Try not to fly into anything this time, {callsign}.' } },
        { at: 16, bg: 'shipyard', scroll: 100 },
        // the black hole sings, and Puff knows the song
        { at: 27.5, music: 'blackhole', fade: 3 },
        { at: 31, call: () => PS().blackHole && PS().blackHole() },
        // once Puff is back and has said his piece, the pilot chooses how to answer him
        { at: 37.5, if: back, until: () => !!PS().talkReady, timeout: 15 },
        { at: 37.6, if: back, choice: 'puff_trust1' },
        { at: 37.7, if: back, call: (s) => PS().trustReply && PS().trustReply(s.flags.puff_trust1) },
        { at: 39, music: 'm1', fade: 2.5, bg: 'shipyard', scroll: 100 },
      ]);
  }

  SL.missions.define('m1', Object.assign({}, base, {
    name: 'First Light', order: 1, location: 'Vesta Shipyards', bg: 'bg_vesta', boss: 'boss_razorback', unlock: [],
    tune: { bulletSpeed: 0.85, fireRate: 0.8 }, puffBuddy: true, timeline: m1Timeline,
    objectives: [
      { id: 'boss', text: 'Destroy RAZORBACK', check: (s) => (s.bossesDefeated || 0) > 0 },
      { id: 'rescue', text: 'Rescue 5 survivors', check: (s) => s.rescued >= 5 },
    ],
  }));
})(window.SL = window.SL || {});
