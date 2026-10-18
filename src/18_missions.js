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
   returns to mus_m1 once Puff has answered.
   'm2', Deep Pull, follows GDD 4.2 over Kerr Station (bg_kerr) with the LODESTAR boss; it unlocks when m1 is cleared
   (unlock lists the missions that must be done first; 19_progress.js). */
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

  // m2, Deep Pull (GDD 4.2): Kerr Station breaking up beside Kerr's Eye, the captive black hole. The first free black
  // hole arrives alone at 62 s so the player sees its pull; two tugs tow medium holes through the station peak, and
  // Dr. Osei's pod falls toward the second one. Puff rides along and does not like black holes any more.
  function m2Timeline() {
    const coop = (s) => !!s.coop;
    return [
      { at: 0, banner: 'DEEP PULL', sub: 'Kerr Station', music: 'mus_m2', scroll: 90, bg: 'approach' },
      { at: 1.5, radio: 'm2_open' },
      { at: 4.5, radio: 'm2_puff_open' },
      { at: 3, formation: 'vee', enemy: 'dart', count: 7, x: 360 },
      { at: 6, formation: 'pincer', enemy: 'gnat', count: 10 },
      { at: 9, formation: 'snake', enemy: 'dart', count: 7, x: 160 },
      { at: 11, formation: 'snake', enemy: 'dart', count: 7, x: 560 },
      { at: 13, spawn: 'spear', x: 200 },
      { at: 13, spawn: 'spear', x: 520, radio: 'm2_spears' },
      { at: 17, spawn: 'wasp', x: 360 },
      { at: 19, formation: 'staircase', enemy: 'gnat', count: 6, opts: { side: 'left' } },
      { at: 22, waitClear: true, timeout: 10 },

      { at: 24, pickup: 'weapon_up', x: 360 },
      { at: 26, spawn: 'needler', x: 140, opts: { hoverY: 220 } },
      { at: 26, spawn: 'needler', x: 580, opts: { hoverY: 220 }, radio: 'm2_needlers' },
      { at: 30, formation: 'arc_sweep', enemy: 'dart', count: 8, opts: { side: 'left' } },
      { at: 33, formation: 'arc_sweep', enemy: 'dart', count: 8, opts: { side: 'right' } },
      { at: 36, pod: { x: 360, y: -40, people: 3, kind: 'civilian' } },
      { at: 38, spawn: 'spear', x: 180 },
      { at: 38, spawn: 'spear', x: 360 },
      { at: 38, spawn: 'spear', x: 540 },
      { at: 41, spawn: 'weaver', x: 360, radio: 'm2_weaver' },
      { at: 46, formation: 'side_stream', enemy: 'gnat', count: 8, opts: { side: 'left' } },
      { at: 48, formation: 'side_stream', enemy: 'gnat', count: 8, opts: { side: 'right' } },
      { at: 51, waitClear: true, timeout: 12 },

      // BREATHER: Kerr's Eye comes into view
      { at: 53, bg: 'lensing', scroll: 70, radio: 'm2_eye' },
      { at: 55, pod: { x: 220, y: -40, people: 2, kind: 'civilian' } },
      { at: 55, pod: { x: 500, y: -40, people: 2, kind: 'crew' } },
      { at: 56, radio: 'm2_puff_eye' },
      { at: 57, pickup: 'weapon_lance', x: 360, radio: 'm2_lance' },
      { at: 61, checkpoint: true, banner: 'CHECKPOINT', sub: 'Gravity anomaly ahead' },

      // the first black hole, alone with weak popcorn so the pull reads
      { at: 62, hazard: 'black_hole', x: 360, y: -120, opts: { size: 'small', vy: 55, life: 26 }, radio: 'm2_bh_warn' },
      { at: 66, formation: 'ring_in', enemy: 'gnat', count: 10, x: 360 },
      { at: 67.5, radio: 'm2_bh_eat' },
      { at: 70, formation: 'snake', enemy: 'dart', count: 7, x: 140 },
      { at: 72, formation: 'snake', enemy: 'dart', count: 7, x: 580 },
      { at: 75, spawn: 'needler', x: 360, opts: { hoverY: 160 } },
      { at: 78, formation: 'rain', enemy: 'gnat', count: 12 },
      { at: 82, spawn: 'weaver', x: 200 },
      { at: 82, spawn: 'weaver', x: 520 },
      { at: 88, pod: { x: 300, y: -40, people: 3, kind: 'civilian' } },
      { at: 92, waitClear: true, timeout: 12 },

      // PEAK: the station, and tugs towing holes through it
      { at: 95, bg: 'station', scroll: 100 },
      { at: 96, spawn: 'tug', x: 240, opts: { hole: 'medium' }, radio: 'm2_tug' },
      { at: 98, radio: 'm2_puff_tug' },
      { at: 100, formation: 'pincer', enemy: 'dart', count: 10 },
      { at: 104, spawn: 'manta', x: 520 },
      { at: 107, formation: 'vee', enemy: 'spear', count: 5, x: 360 },
      { at: 110, spawn: 'tug', x: 480, opts: { hole: 'medium' } },
      { at: 113, formation: 'side_stream', enemy: 'gnat', count: 10, opts: { side: 'left' } },
      { at: 115, formation: 'side_stream', enemy: 'gnat', count: 10, opts: { side: 'right' } },
      { at: 118, pickup: 'bomb', x: 240 },
      { at: 120, pod: { x: 420, y: -40, people: 1, kind: 'vip', vip: 's2', vy: 70 } },
      { at: 124, spawn: 'wasp', x: 200 },
      { at: 124, spawn: 'wasp', x: 520 },
      { at: 126, formation: 'staircase', enemy: 'dart', count: 7, opts: { side: 'right' } },
      { at: 130, waitClear: true, timeout: 16 },

      { at: 132, pickup: 'weapon_up', x: 360 },
      { at: 132, pod: { x: 260, y: -40, people: 4, kind: 'civilian' } },
      { at: 132, pod: { x: 460, y: -40, people: 2, kind: 'civilian' } },
      { at: 133, spawn: 'snatcher', opts: { side: 'left', y: 260 } },
      { at: 134, radio: 'm2_station' },
      { at: 137, formation: 'escort_box', x: 360, opts: { leader: 'manta', escort: 'wasp', count: 4 } },
      { at: 143, formation: 'column', enemy: 'dart', count: 6, x: 160 },
      { at: 143, formation: 'column', enemy: 'dart', count: 6, x: 560 },
      { at: 147, spawn: 'needler', x: 200, opts: { hoverY: 220 } },
      { at: 147, spawn: 'needler', x: 520, opts: { hoverY: 220 } },
      { at: 148, if: coop, pod: { x: 360, y: -40, people: 3, kind: 'civilian' } },
      { at: 152, waitClear: true, timeout: 12 },

      { at: 154, pickup: 'repair', x: 360, bg: 'boss', scroll: 40 },
      { at: 155, radio: 'm2_boss_warn' },
      { at: 157, banner: 'WARNING', sub: 'Gravity siege engine LODESTAR', color: '#ff5c8a' },
      { at: 159, boss: 'boss_lodestar' },
      { at: 160, afterBoss: true, bg: 'calm', scroll: 60, radio: 'm2_win' },
      { at: 160.1, afterBoss: true, radio: 'm2_puff_win' },
      // nothing to fire: holds the 3 s outro back until both voiced lines (about 8 s together) have finished
      { at: 166, afterBoss: true },
    ];
  }

  SL.missions.define('m2', Object.assign({}, base, {
    name: 'Deep Pull', order: 2, location: 'Kerr Station', bg: 'bg_kerr', music: 'mus_m2', boss: 'boss_lodestar', unlock: ['m1'],
    tune: { bulletSpeed: 0.92, fireRate: 0.9 }, puffBuddy: true, timeline: m2Timeline,
    rewards: { credits: 550, sp: 1 },
    // Dr. Osei's pod is a VIP: remember it in the session flags (they survive checkpoints)
    onStart(s) {
      SL.bus.onMission('podRescued', (e) => { if (e && e.vip === 's2') s.flags.vip_s2 = true; });
    },
    objectives: [
      { id: 'boss', text: 'Destroy LODESTAR', check: (s) => (s.bossesDefeated || 0) > 0 },
      { id: 'rescue', text: 'Rescue 14 people', bonus: true, check: (s) => s.rescued >= 14 },
      { id: 'vip', text: "Find Dr. Osei's pod", bonus: true, check: (s) => !!s.flags.vip_s2 },
    ],
  }));
})(window.SL = window.SL || {});
