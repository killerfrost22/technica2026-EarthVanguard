# weapons progress

Owner files: src/09_weapons.js, src/10_pickups.js (+ docs/api/weapons.md, shots/weapons/).

## Done
- Read GDD 10, 12, 19, 20, 21, ARCHITECTURE 1/4/5/6.10/6.13/7/8, docs/api/core.md, stubs, core helpers.
- 09_weapons.js drafted (1742 lines, attempt 1): 9-frame rolled 3D jet art P1/P2 + glow layer, live overlays,
  pulse/spread/lance L1-5, missiles 0-3, Twin Link beam, ion jam, overdrive, hit flares, sandboxes
  weapons / twinlink / jets.
- Attempt 2: built + tested all three sandboxes (0 console errors, 60 fps). Fixes: P1 hull toned to mid-value
  (bloom haze), roll 0.8 for visible banking, new pulse bolt + spread dart sprites, missile exhaust streak and
  continuous eased smoke trail, lance halo/impact flares toned down, tether recolored, sandboxConfig(k),
  overdrive/ion-jam configs in 'weapons', jets sandbox hides the live jet (p.data.wpnHide).

## Next
1. (done) sandboxes run.
2. (done) 10_pickups.js written + tested: glass power-cell capsules (7), white-gold flipping chip, 8-frame
   spinning gem credits, drift/bounce, magnet, roll/tables (distribution verified), mercy (verified), vacuum
   (verified), labels stacked, 'pickups' sandbox (labeled grid + cargo-drone spills).
3. Attempt 3 (resumed): re-verified jets / weapons / pickups sandboxes (0 errors). Found: lance L4-5 whites out
   targets (too bright, crackle reads as a wide outline); sandbox targets overlap the info panel.
4. (done) lance L4-5 toned (narrower core, density falls with width, broken edge crackle), sandbox targets moved
   below the panel, coop panel moved down, expected DPS with multipliers, long soft exhaust plumes (wpn:exhaust<i>),
   drop(e) accepts opts.drop table ids / true, integration m1 solo (0 errors), perf coop pulse L5 + missiles L3 +
   overdrive 396 fps uncapped (2.5 ms), coop lance L5 452 fps; in-page suite: all pbullet/pickup tests pass;
   docs/api/weapons.md written.
5. Next: final report (optional polish: capsule symbol contrast).

## Decisions
- Pulse L5 (6 bolts): tight center pair (reads as the thick core) + twin pair + two angled outer bolts (+-0.08).
- Overdrive: weapons applies fire rate x1.5, damage x1.25 and the white-gold tint while p.data.overdrive is truthy
  (an object {fireRate, damage} overrides the multipliers); progress must not also change stats for it.
