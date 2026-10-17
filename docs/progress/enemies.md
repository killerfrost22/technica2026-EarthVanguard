# enemies builder progress

## Done
- 12_patterns.js (1838 lines): 11 ebullet types + beam restyle + warn/charge markers, 23 patterns, target(),
  'patterns' sandbox, SL.lab.patterns.gallery(). Shots: shots/enemies/gallery.png, pat_*.png.
- 11_enemies.js (3352 lines): framework + all 16 enemies, SL.paths presets, 11 formations + bonus,
  sandboxes 'enemies' (grid then live waves; ?e=<id>, ?grid=1, ?elite=1) and 'formations' (?f=<id>). Syntax OK.

## Decisions
- All defs manualMove; mover = legs [{path, speed} | {hold} | {escort} | {fn}]; paths are sampled polylines.
- Tier: m1..m5 -> 1..5, sN -> N+1, sandbox 5 (?tier=). Escort box: escorts dive when the leader dies.
- Assumed stays (opts.stay, 0 = forever): stormcaller 20 s, hive 30 s, tug 32 s (GDD gives none).

## Next (attempt 5)
- Build + test: grid screenshot, live waves of the 10 newer enemies, formations, patterns; mine shootability;
  docs/api/enemies.md; fps check.
