# backgrounds progress

Owner file: src/15_backgrounds.js (single IIFE). Docs: docs/api/backgrounds.md. Shots: shots/backgrounds/.

## Done
- Read GDD/ARCHITECTURE/core API.
- Common engine (memo/evict store, camera xf, knobs + phases with easing/snap, sky, star tiles, twinkles, dust,
  paintNoise, per-pixel sphere shader, relief shader, layers of drifting items, lights, truss/rock art).
- bg_vesta all phases (launch deck script, belt, shipyard dock, storm haze, boss shadow, sunrise rays, menu).
  Screenshots shots/backgrounds/vesta_*.png (attempt 1).
- SL.scenery.stats() readability probe; sandboxes bg:<id> (?phase=, cycle=, bullets=1) registered for every def.

- Attempt 2: vesta dry-dock metal darkened (was > 40% value). Shared helpers: bgMetal, gasGiant, paintedHole/drawHole,
  lensField (lensed star arcs), spiral debris streams + dust lanes, debrisSprites, jagPoly.
- bg_kerr done: Jupiter lit by the Eye, painted Eye (Gargantua look, lensed stars), debris streams, Kerr Station ring
  (3D painter-sorted faces, spokes, hub, break, chunks drifting to the Eye), boss tilt-away, calm fade, lagrange wreckage
  tilting to (360,-60). Shots kerr_*.png. Init 217 ms.

- Attempt 2 (cont.): bg_tantalus done (canyon cloud walls with lit rims + sheet flashes and faint bolts, storm eye
  annulus with TEMPEST crossing, boss front wall, clear, boneyard hulks). Shots tant_*.png (all 6 phases), all < 40%.

- Attempt 3: bg_tarsis done (star limb + inner corona + GDD corona gradient, polar streamers rotating 1 deg/s,
  prominences, dashed field-line filaments, plasma ribbon to the SUNEATER dish (feeds SL.game.boss in `boss`),
  eclipse moon with backlit rim, hex mirror clusters with a clipped glint wave, flare shafts + wash). `flare` is an
  overlay phase: keeps the interrupted phase's knobs and reverts after 1.7 s. Shots tars_*.png.
- Sandbox debug zoom: &zoom=<z>&zx=&zy= (background only).

- Attempt 3 (cont.): bg_tartarus done in code (rift punch-through, binary, OUROBOROS hull, boss, finale collapse,
  foundry s4 + bossF). Shots tart_*.png.

## Next (attempt 4)
- bg_callisto (insert at @@BACKGROUNDS@@); review tart shots.
- docs/api/backgrounds.md; perf + stats per bg; polish tantalus boss front wall; final report.
