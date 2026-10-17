# bossesB progress

Owner file: src/13b_bosses.js (+ docs/api/bossesB.md, shots/bossesB/).

## Done
- Read GDD 8 intro, 8.4, 8.5, 8.8, 8.9, 7.2-7.4, 9.4, 9.6, 19, catalog, work package; ARCHITECTURE 1,3-8; core.md.
- Shared helpers (fire with bullet fallbacks, ring/fan/flower, jobs, spiral, stream, sniper, orbit_release,
  gravity_sling, rain_curtain, wells/applyWells/drawHole, PART recipe addPart/dropPart/drawMark, phaseBreak,
  damageFx, creditShower, chain, banner, radio, drawing helpers, SL.bossesB.jump(i)).
- mb_mantis (3 phases, rigged mines, dodge, dive, death spiral) + mantis_pass flyby + sandboxes boss:mb_mantis,
  enemy:mantis_pass. Shots shots/bossesB/mantis_*.png.
- mb_crucible (3 phases, cages + holes in b.gravityList, sweeps, heat pulse, death) + sandbox boss:mb_crucible.
  Shots crucible_intro/p1.png (session 2 resumed here).

- Session 2: fire() only adds local petal/void behaviors when the real types are missing (12_patterns wraps
  fireEnemy with type init/update). grime() now covers the whole sprite canvas.
- boss_suneater written: arch hull + emis + dmg overlays, iris petals under a collar, plasma stream tiles, 4 hex
  mirrors on IK arms (parts), lip-gun turrets, bent mirror beams with own telegraph overlay (warnLine/chevrons),
  V beams + iris windows, rain curtain, solar_flare (hazard or local fallback), nova with shade test (shade props:
  SL.hazards.shadeRock or local SHADE_PROP), hull plates as extra cover, death. Sandbox boss:boss_suneater.
  Shots sun_*.png. All phases + death verified, 0 errors.

## Next
- Session 3 (in progress): OUROBOROS design fixed: coil = rotating circle-space texture squashed by 0.79 + static
  ellipse light overlays; spine hit by warped pbullets (b.data.whT) in zones under the B portals (custom scan, spine
  part intangible), lance warp via portal A segment test; portals spawned with players:false; phase 4 b.intangible,
  crown part takes hits, b.x/y follow the crown.
- Write boss_ouroboros (marker /* @@BOSSES@@ */), sandbox with portal steering; then polish MANTIS (wing colour,
  ghost), CRUCIBLE core exposure; perf; docs/api/bossesB.md.
