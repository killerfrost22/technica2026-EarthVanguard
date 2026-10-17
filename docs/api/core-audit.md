# Core audit log

Running log of the core engine audit (started 2026-10-16). A fresh attempt: read this file, then continue from
"Progress". Severity: **H** (breaks content agents or gameplay), **M** (wrong behavior in edge cases), **L** (minor).

## Progress

- [x] 1. Build + smoke + look at shots (baseline: build OK; smoke PASS 28/28 suite, test+m1 solo/coop complete A, 0 errors; shots look polished: title, HUD, boss, results, black hole lens, stress)
- [x] 2. API fidelity (6.1-6.9, 6.11, 6.12): every listed API present with the specified signature; gaps logged as A10, A22, A23
- [x] 3. Bug hunt by reading code (A1-A42)
- [x] 4. Fixes (all A* fixed; verified by exp scripts and 8 new `core:` in-page tests; smoke PASS 36/36)
- [x] 5. Re-run build, smoke, stress, screenshots (GL, nogl, phone) - see Test results
- [x] 6. docs/api/core.md updated (00_core, 01_save, 02_input, 04_render, 05_art, 07_world, 08_player, 21_game, 22_debug, Tools, Events, Recipes, Deviations 14-16)

Original sources backed up (session scratchpad only) before any edit. The A/B build of the original sources
(dist/dev-orig.html) has been deleted. Audit screenshots: shots/audit/.

STATUS: audit complete (2026-10-16). Final smoke PASS 36/36 + 4 runs, 0 errors.

## Findings

(format: ID. [severity] file:line - finding. Status: open/fixed (how). Line numbers refer to the ORIGINAL files.)

Read: all core files (00_core, 01_save, 02_input, 04_render, 05_art, 06_fx, 07_world, 08_player, 21_game, 22_debug),
tools/*, every content stub. Each finding was confirmed by reading and, where marked Verified, at runtime before and
after the fix (exp scripts in the session scratchpad; the key ones are now `core:` tests in the in-page suite).

- A1 [H] 21_game.js:171-198 restoreCheckpoint resumes AFTER the checkpoint event and replays only events before it:
  the checkpoint event's own bg/scroll/music (test mission: `{at:27, checkpoint, bg:'danger', scroll:120}`) are lost on
  retry, and pending repeats of earlier `repeat` events never fire again. Status: fixed (resume AT the checkpoint event so it re-fires with its bg/scroll/music/banner; pending repeats of earlier events re-scheduled; checkpoint also keeps bossDone, all session stats and a JSON-safe copy of session.data). Verified: phase danger / scroll 120 after retry.
- A2 [H] 07_world.js:829-832 (+820) core clears `b.invuln` when a phase transition (or the intro) ends, clobbering a
  content-set shield (`enter(b){ b.invuln = true }`). Status: fixed (b.invuln is an accessor on bosses: true while core holds it OR content set it; writes set only the content flag). Verified.
- A3 [M] 07_world.js:1040 world.reset() drops live hazards without `def.onEnd(h)`: SL.audio.loop hums (and any other
  cleanup) leak on quit / restart / retry / toMenu. Status: fixed (world.reset calls onEnd for live hazards, emits worldReset, marks old entities dead). Verified: 1 call.
- A4 [M] 07_world.js:1086-1094 enemy `def.onExit(e)` is documented (core.md) but never called. Status: fixed (escaped enemies call def.onExit). Verified.
- A5 [M] 07_world.js:1251-1280 player beams ignore `e.intangible` and multi-circle hitboxes (`e.circles`). Status: fixed (beams skip intangible, test every hitbox circle). Verified.
- A6 [M] 07_world.js:1158 pierce `hitIds` capped at 16: the 17th+ enemy hit by a piercing bullet is re-hit every frame.
  Status: fixed (no cap on hitIds). Verified: every enemy in a 20 column hit once.
- A7 [M] 07_world.js:379,429,1322 pooled bullets keep content-added fields (e.g. `b.grazed`) on reuse; cap dummies are
  shared objects missing `type`, `angle`, `speed`... Status: fixed (objects with extra own fields are not pooled; cap dummies are fresh, fully initialised, dead bullets). Verified.
- A8 [M] 07_world.js:1150-1196 no swept collision: fast player bolts (1500 px/s) tunnel through popcorn enemies at 30-60
  fps, fast needles can skip the 7 px hitbox. Status: fixed (player bolts swept against enemies in the enemy frame of reference, nearest contact first; enemy bullets swept against the 7 px hitbox; teleports fall back to point tests). Verified: 40/40 at 30 fps.
- A9 [M] 21_game.js:298 startOutro with a player down: the pod timer keeps running and spends a life after the win
  (livesLost -> rank), a respawn during the outro flies without `p.outro`. Status: fixed (startOutro respawns downed, not-out players into the fly-out, no life spent). Verified: lives stay 3, P2 flies out.
- A10 [M] 21_game.js:443-488 `startMission(id, {fromCheckpoint: true})` (boolean, as the 6.11 signature reads) makes
  restoreCheckpoint read `true.clock` -> D.clock = NaN: the timeline never fires. Status: fixed (fromCheckpoint: true = last checkpoint of that mission; foreign/invalid objects ignored with a warning). Verified.
- A11 [M] 22_debug.js:211-229 autopilot choice fallback forces flag 'auto' 0 frames after autoChoose() when the story
  closes its dialog asynchronously. Status: fixed (autoChoose at 0.8 s, forced release only if still paused 2.5 s later).
- A12 [L] 21_game.js:200-213 choice wait ignores `ev.timeout`. Status: fixed (choice wait takes ev.timeout).
- A13 [L] 04_render.js:626-646 auto quality: a few long frames (lazy sprite generation, GC) can push the 3 s average over
  20 ms and drop quality for good. Status: fixed (each frame counts at most 50 ms toward the 3 s average).
- A14 [L] 01_save.js:171 commit() debounce has no max wait: commits < 300 ms apart starve the write until hide. Status: fixed (2 s max wait).
- A15 [L] 07_world.js:54/254 cap dummies (enemy/hazard/pickup) lack `params`, `typeId`; content reading them throws. Status: fixed (dummies carry params, typeId, circles, entered).
- A16 [L] 07_world.js:838 `ph._broken` stored on the shared phase def (persists across spawns and retries). Status: fixed (b.phaseBroken[] per boss).
- A17 [L] 21_game.js:667 setMenuScene during a mission wipes the live world; toMenu() always resets to the default bg
  (forgets the UI's chosen menu scene). Status: fixed (ignored during missions with a warning; toMenu reuses the last options).
- A18 [L] 05_art.js:196 SL.art.get(spriteObject) returns the magenta placeholder (def.sprite given as a sprite object).
  Status: fixed (get() passes sprite objects through and wraps bare canvases once; flash cache keyed by sprite).
- A19 [L] 08_player.js:31-37 non-finite stats from progress (NaN speed/maxHull) break movement and the HUD. Status: fixed (non-finite numeric stats fall back to defaults with a warning; weaponStart validated).
- A20 [L] 07_world.js boss hp lowered directly by content (part destroyed) never triggers the phase/death check until the
  next damageEnemy call. Status: fixed (updateBoss re-checks phase and death every step). Verified.
- A21 [L] 02_input.js:337 touch: when the dragging finger lifts while another finger is down, movement stops until a
  new touch. Status: fixed (a remaining finger on the playfield takes over the drag).
- A22 [L] 22_debug.js:462 screen= sample params only for results/failed/pause/briefing; ui cannot supply its own.
  Status: fixed (screen def `sample: params | () => params` used by screen= and the in-page suite).
- A24 [L] 04_render.js:165-189 a DPR-only change (window moved to another monitor, same CSS size) is never noticed:
  backing stores stay at the old DPR (confirmed: 1280x720 @1.5 -> @2.5 keeps dpr 1.5). Status: fixed (frame() re-measures when min(devicePixelRatio, 2) changes).
- A25 [M] 07_world.js:1439/1483 a throwing pbullet type draw set `t.draw = null`, leaving in-flight bullets with
  `spr = null`: `s.cw` threw every frame and aborted the rest of world.draw (particles, enemy bullets, hazards drawOver);
  enemy bullets without a sprite were skipped (invisible but lethal). Status: fixed (type marked _drawBroken, bullets
  fall back to a sprite lazily; a throwing enemy-beam draw falls back to the default beam once). Verified.
- A26 [M] 07_world.js:402,453 `speed || 200` / `speed || 1400`: speed 0 became 200 px/s (stationary mines impossible);
  non-finite angle / x / y made NaN bullets that live 4 s invisibly. Status: fixed (finite check with warnOnce; 0 kept).
  Verified: a speed-0 mine stays put.
- A27 [M] 21_game.js:739-752 Escape on a screen opened from the pause menu (settings) resumed the game with that screen
  still up over live play; resume() only hid 'pause'. Status: fixed (sub-screens keep Escape for back; resume hides any
  screen during a mission).
- A28 [M] 21_game.js:481-485 on a checkpoint retry the timeline function `(diff, session) => [...]` ran with empty
  session.flags (restored only afterwards), so timelines that branch on an earlier choice rebuilt the wrong branch.
  Status: fixed (flags and session.data restored before the timeline function runs).
- A29 [M] 00_core.js:354-374 a timer callback that ends the run (SL.after(5, () => SL.game.completeMission()), retry,
  quitMission, startMission) cleared the timer list mid-loop: `timers[i]` undefined -> TypeError, rest of the step
  skipped. Status: fixed (generation counter: the loop stops when the list was cleared).
- A30 [L] 00_core.js:350 SL.every(s, fn, 0) fired once. Status: fixed (count <= 0 never fires).
- A31 [L] 21_game.js:381 finish() did not stop the director: a `call` event that completes/fails the mission let the
  events after it in the same step fire into the results backdrop. Status: fixed (D.done at finish).
- A32 [L] 22_debug.js:284-285 a sandbox's god/autopilot (options or set in run, e.g. stress) stayed on for every later
  mission in the page. Status: fixed (restored when that sandbox session ends).
- A33 [L] 07_world.js:277-306 spawnBoss(defObject) gave the placeholder boss (spawnEnemy accepts defs); opts.noCount did
  not mark the boss, so its kill still counted (kill rate > 1, clamped). Status: fixed.
- A34 [M] NaN robustness: a NaN lens/ripple position reached the composite shader (black screen); SL.player.push with
  a NaN (custom gravity dividing by 0) or a NaN drag lost the jet for good (clamp keeps NaN); an enemy, pod, prop or
  hazard with a NaN position could never be culled (waitClear hangs to its timeout); addBomb(p, NaN) made bombs NaN
  (infinite bombs). Status: fixed (finite guards; NaN player reset to spawn, NaN entities removed, warnOnce each).
  Verified.
- A35 [L] 00_core.js:200 SL.color.rgba cached per raw alpha value: animated alphas thrashed the 4096-entry cache.
  Status: fixed (key uses the alpha quantized to the 3-decimal output).
- A36 [M] 04_render.js:636-645 auto quality on a capped frame clock (this machine's headless rAF dropped to 30.9 Hz
  during the audit, even for a bare rAF page): every page stepped High -> Medium (and would go on to Low, no bloom)
  although its work took < 1 ms a frame. Status: fixed (each step is verified over the next window; no gain -> try the
  next level; nothing helps -> restore the starting quality and hold until frames < 18 ms). Verified both ways: capped
  clock ends back at High; a page with real work at High (45 ms) settles on Medium.
- A37 [M] 21_game.js:497-503 retry() of a mission started from a def object (startMission(id, {def})) looked the id up
  in SL.missions, got null and silently did nothing (the Retry button was dead); a sandbox retry ignored the session's
  co-op flag. Status: fixed.
- A38 [L] 22_debug.js runTests had no core regression coverage. Status: fixed (8 `core:` tests: boss shield across a
  transition, pierce once per enemy, no tunneling at 30 fps, pool hygiene + speed 0, onExit + NaN guards, timers cleared
  from a timer, hazards ended by world reset, checkpoint retry re-fires its event with repeats). Run against the
  ORIGINAL engine, 7 of the 8 fail and the 8th logs a TypeError, so smoke would have caught every one.
- A39 [L] 07_world.js:1387 resetCtx between draw hooks restored only transform/alpha/composite: a hook leaking
  `ctx.shadowBlur` or `ctx.filter` (forbidden per frame, but an easy content slip) slowed every later draw of the frame.
  Status: fixed (cleared after each hook and each custom bullet draw); draw error reports capped at 40 messages.
- A40 [M] 22_debug.js:101-113 autopilot always parked under an on-screen boss, even an invulnerable one: a boss gated by
  destructible parts (the core.md recipe) would never die in smoke (240 s fail). Status: fixed (invulnerable boss ->
  target parts / escorts first, boss as fallback).
- A41 [L] 07_world.js:559-579 fireEnemyBeam at the beam cap returned `{dead, data}` only (no state/angle/src); a
  non-numeric angle (NaN, a string) made an invisible, harmless beam. Status: fixed (complete dead beam at the cap;
  a non-number angle aims at the nearest player with a warning).
- A42 [L] 21_game.js startMission: a mission def without `timeline` completed on its first step, silently. Status: fixed
  (warnOnce).
- A23 [M] paths: SL.paths exists only in the 11_enemies stub as a plain object; ARCHITECTURE/core.md give no registry, so
  a replacement calling SL.paths.define() (as for formations) would crash at load. Status: fixed (SL.paths = SL.registry("paths") in 00_core; plain properties still work).

## Runtime confirmation (before fixes)

- A1 confirmed: retry(true) after the test checkpoint -> bg phase 'default' (want 'danger'), scroll target 90 (want 120).
- A10 confirmed: startMission('test', {fromCheckpoint: true}) -> director clock NaN, index 28/28 (whole timeline skipped).
- A2 confirmed: phase enter sets b.invuln = true -> false 2 s later.
- A3 confirmed: hazard onEnd calls on retry = 0.  A4 confirmed: enemy onExit calls = 0.
- A5 confirmed: intangible enemy took 150 beam damage in 0.5 s; a beam through a hitbox circle (r 10 body) did 0.
- A6 confirmed: pierce bolt through a 20-enemy column re-hit the last 4 enemies every frame (90 dmg vs 10).
- A7 confirmed: fireEnemy reused the dead bullet object with `grazed: true` still set.
- A8 confirmed: 1500 px/s bolts 20 px off-center vs a stationary r 18 enemy: 23/40 hit at 30 fps (40/40 at 60).
- A9 confirmed (variant): P2 downed as the boss died -> after the results appeared P2 spent a shared life (3 -> 2),
  respawned and kept flying and firing behind the results screen.
- WebGL context loss -> 2D output, restore -> GL again: OK, 0 errors. Resize to 390x844@3 and 1280x720@1.5: OK.

## Test results

- Environment note: during the audit this machine's headless frame clock dropped to 30.9 Hz (bare tools/raf_probe.html:
  30.9 fps, med 32.5 ms), so capped fps numbers read ~31; real headroom is measured with --uncapped.
- Stress (?sandbox=stress&debug=1, --gpu default): capped 30.8 fps = the frame clock, update 0.37 ms + render 4.4 ms of
  CPU per frame at 40 enemies / 595 enemy bullets / 149 shots / 1491 particles, quality back at high after the auto
  probe (shots/audit/stress_gl.png); uncapped 173.8 fps, p95 9.1 ms, quality high, 0 errors.
- Screenshots (all 0 console errors): shots/audit/gl_blackhole.png, gl_boss.png, gl_results.png (GL post: lensing,
  bloom); nogl_blackhole.png, nogl_boss.png (2D fallback: drawn horizon + disk, distortion false); phone_title.png,
  phone_mission.png, phone_results.png at 390x844 (no horizontal scroll: scrollWidth 390 = innerWidth, game box 358 px);
  ctxlost.png / ctxrestored.png (WebGL context loss -> 2D -> GL); resize_phone.png / resize_wide.png.
- Every sandbox (empty, stress, fx, lens, boss:test_boss, hazard:test_blackhole, enemies, pickups, weapons, rescue,
  portraits, enemy:dummy_drone, bg:default) in GL and ?nogl=1: 0 console errors.

- Smoke after all fixes (final, round 6): PASS, in-page suite 36/36 (8 new core tests), test/m1 solo complete B,
  co-op complete A, peak 16 enemies / 77 enemy bullets / 42 shots / 866 particles, 0 errors.

- After fixes round 1+2: build OK; smoke PASS (suite 28/28; test/m1 solo complete B, co-op complete A, 0 errors; the
  solo rank moved A -> B only because the seeded autopilot run diverges once kills land a frame earlier). Stress A/B
  (uncapped, real GPU): original 170.8 fps / update 0.12 ms, fixed 168.2 fps / update 0.14 ms (same).
- Controlled hit-rate scenario (12 weaving drones, 150 bolts at 60 fps): original 96 hits, fixed 97.


## API changes (all additive; documented in docs/api/core.md)

- New: `SL.paths` registry (00_core), `SL.bus.onMission(evt, fn)`, `SL.world.sweepTest(e, ax, ay, bx, by, r)`, event
  `worldReset`, screen def field `sample`, run.mjs step `{"viewport":[w,h,dpr,mobile]}`.
- Extended: `SL.spawnBoss(idOrDef)`; `startMission(id, {fromCheckpoint: true})`; `retry()` for def-started missions;
  `SL.art.get/drawSprite/getFlash` accept sprite objects and canvases; `fireEnemy/firePlayer` speed 0; checkpoint
  object gains `rep, bossDone, data` and more stats; bullets gain `px, py`, enemies `lx, ly`.
- Semantics: boss `b.invuln` accessor (core and content flags OR-ed); checkpoint retry re-fires the checkpoint event;
  `resume()` hides any screen over a mission; Escape is left to pause sub-screens; `setMenuScene` remembered by
  `toMenu` and ignored during missions; enemy `onExit` called; hazards' `onEnd` called by `world.reset`; outro revives
  downed players; auto quality verifies each step; commit writes at least every 2 s; sandbox god/autopilot restored.
- Tools: smoke waits up to 180 s for the in-page suite; in-page suite +8 `core:` regression tests.
