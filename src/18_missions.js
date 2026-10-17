/* STUB: replaced by missions
   18_missions.js provides: mission 'test' (about 60 s of waves using every director event type: formations,
   spawns, repeat, if, radio, pods, pickups, banners, music, scroll, bg phases, waitClear, a checkpoint, a
   story choice, the test_blackhole hazard, then test_boss and an afterBoss line) and 'm1' as a copy of it so
   ?mission=m1 works before real content lands. 'test' is flagged dev: true (menus may hide it). m1 adds Puff's
   bubble (puffBuddy) and swaps the stub hazard for a real black_hole that pulls Puff in (25_puffstory.js). */
(function (SL) {
  'use strict';

  function testTimeline() {
    return [
      { at: 0, banner: 'TEST RANGE', sub: 'Core systems check', music: 'm1', scroll: 90 },
      { at: 0.6, radio: 'test_hello' },
      { at: 2, formation: 'vee', enemy: 'dummy_drone', count: 5, x: 360 },
      { at: 5, formation: 'line', enemy: 'dummy_drone', count: 4, x: 200, opts: { gap: 70, stagger: 40 } },
      { at: 7, formation: 'line', enemy: 'dummy_drone', count: 4, x: 520, opts: { gap: 70, stagger: 40 } },
      { at: 9.5, spawn: 'dummy_gunship', x: 240 },
      { at: 11, pod: { x: 520, y: -40, people: 3 } },
      { at: 13, spawn: 'dummy_gunship', x: 480 },
      { at: 15, pickup: 'weapon_spread', x: 360, y: -30 },
      { at: 17, formation: 'vee', enemy: 'dummy_drone', count: 7, x: 360, repeat: { every: 3, count: 3 } },
      { at: 26, waitClear: true, timeout: 14 },
      { at: 27, checkpoint: true, banner: 'CHECKPOINT', sub: 'Gravity anomaly ahead', bg: 'danger', scroll: 120 },
      { at: 28, hazard: 'test_blackhole', x: 360, y: -150, opts: { vy: 62, life: 22 } },
      { at: 29, radio: 'test_blackhole' },
      { at: 30, formation: 'column', enemy: 'dummy_drone', count: 6, x: 140, opts: { weave: 40 }, repeat: { every: 4, count: 3 } },
      { at: 32, formation: 'column', enemy: 'dummy_drone', count: 6, x: 580, opts: { weave: 40 }, repeat: { every: 4, count: 3 } },
      { at: 34, spawn: 'dummy_gunship', x: 160 },
      { at: 36, spawn: 'dummy_gunship', x: 560 },
      { at: 38, choice: 'test_choice' },
      { at: 39, if: (s) => s.flags.test_choice === 'a', pod: { x: 260, y: -40, people: 4 }, radio: { who: 'sparrow', text: 'Covering the pod. Bring it in!' } },
      { at: 40, pod: { x: 460, y: -40, people: 2 } },
      { at: 42, pickup: 'shield', x: 300 },
      { at: 44, formation: 'vee', enemy: 'dummy_drone', count: 7, x: 360 },
      { at: 46, spawn: 'dummy_gunship', x: 360, opts: { hoverY: 260 } },
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
  // m1 flies the test range with Puff aboard and a real black hole: it pulls Puff in, and inside it he remembers
  // the first of the Directorate's trials (25_puffstory.js).
  function m1Timeline() {
    const story = (fn) => () => { if (SL.puffStory) SL.puffStory[fn](); };
    return testTimeline()
      .map((ev) => (ev.hazard === 'test_blackhole'
        ? { at: ev.at, hazard: 'black_hole', x: 360, y: -150, opts: { size: 'medium', vy: 62, life: 26 } }
        : ev))
      .concat([
        { at: 3, radio: { who: 'puff', text: 'Bubble sealed, tether locked. Try not to fly into anything this time, {callsign}.' } },
        { at: 31, call: story('blackHole') },
      ]);
  }

  SL.missions.define('m1', Object.assign({}, base, { name: 'First Light (stub)', order: 1, boss: 'test_boss', unlock: [], puffBuddy: true, timeline: m1Timeline }));
})(window.SL = window.SL || {});
