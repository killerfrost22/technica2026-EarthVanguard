# Core API (as implemented)

Public surface of the core files (`00_core`, `01_save`, `02_input`, `04_render`, `05_art`, `06_fx`, `07_world`,
`08_player`, `21_game`, `22_debug`) and the tools. ARCHITECTURE.md section 6 is the contract; this file lists
the exact signatures, defaults and behavior you can rely on, marks additions with **(ext)**, and ends with
**Deviations**. Everything lives under `window.SL`.

Conventions: logical space 720x1280, y down, angles in radians (0 = +x, PI/2 = down). `dt` is game seconds.
Unknown ids warn once and fall back (placeholder art, orb bullet, placeholder enemy/boss, no-op).
A content hook that throws is reported once with `console.error` and disabled or its entity removed; bosses keep
running with only the failing hook disabled.

## Load order and boot

- Files load in name order. At load time you may call `SL.*.define`, `SL.art.define`, `SL.debug.sandbox`, and
  read `SL.debug.params`. Anything that needs the DOM, `SL.render.ctx` or `SL.save.data` goes in `SL.onBoot(fn)`.
- Boot order: every `onBoot` hook in registration order (save loads in 01, render builds canvases in 04, world art
  in 07, ...), then the bus emits `boot`. 21_game's hook shows the `title` screen over the attract scene and
  starts the loop; 22_debug's hook (last) applies URL params.

## shell.html and 01_base.css (DOM and UI primitives)

- DOM: `#app` > `#ambient` (canvas) + `#game` > `#screen` (canvas), `#hud` (canvas), `#ui` (div). Put screens,
  dialogs, the radio box and touch buttons inside `#ui`. `#ui` has `pointer-events: none`; `button, a, input, select,
  textarea, label, [tabindex], .sl-interactive` inside it get `pointer-events: auto` (a full-screen overlay that must
  catch clicks sets `pointer-events: auto` itself). Size everything in `cqw` (1cqw = 1% of the game box width;
  `#ui` font-size is 3.6cqw). The page never scrolls; `[hidden]` is `display: none !important`.
- Tokens on `:root` (`color-scheme: dark`): grounds `--sl-bg, --sl-bg-deep, --sl-bg-raised`; glass `--sl-glass,
  --sl-glass-strong, --sl-glass-edge, --sl-glass-sheen, --sl-shade`; accents `--sl-cyan (P1), --sl-cyan-hi,
  --sl-cyan-glow, --sl-amber (P2, caution), --sl-amber-hi, --sl-amber-glow, --sl-magenta (enemy, danger),
  --sl-magenta-hi, --sl-magenta-glow, --sl-green, --sl-gold`; text `--sl-text, --sl-text-dim, --sl-text-faint, --sl-ink`
  (dark text on bright buttons); lines `--sl-line, --sl-line-strong`; type `--sl-display` (Oxanium 500-800),
  `--sl-body` (Barlow Semi Condensed 400/500/600/700, 500 italic); motion `--sl-ease, --sl-fast, --sl-med`.
- Classes: `.sl-screen` (full-box centered column), `.sl-panel` (+ `--danger`, `--amber`), `.sl-btn` (+ `--primary`,
  `--amber`, `--danger`, `--ghost`, `--small`; hover, active and an amber `:focus-visible` ring; `:disabled`),
  `.sl-title` (+ `--md`, `--sm`, `--danger`, `--amber`), `.sl-label`, `.sl-dim`, `.sl-num` (tabular digits), `.sl-kbd`
  (key cap), `.sl-row`, `.sl-stack`. `prefers-reduced-motion` shortens every animation and transition inside `#ui`.

## 00_core.js

- `SL.W = 720`, `SL.H = 1280`, `SL.VERSION`.
- `SL.util`: `clamp, lerp, invLerp, remap (unclamped), smoothstep(e0, e1, x), approach(cur, target, maxDelta),
  dist, dist2, angleTo(ax, ay, bx, by), angleDiff(a, b)` (signed shortest turn a -> b, in [-PI, PI)),
  `wrapAngle, rotate(x, y, a) -> {x, y}, fmtInt(n) -> "12,345", fmtTime(sec) -> "1:05" ("1:02:03" past an hour),
  warnOnce(key, ...msg), deepMerge(a, b)` (new object; plain objects merge, arrays and others replace).
  **(ext)** `TAU, lerpAngle(a, b, t), sign, clone(v), isPlain(o), hash(str) -> uint32, uid(), noop`,
  `audio(method, ...args)` and `sfx(id, opts)`: call `SL.audio` if present; a throwing audio module is logged once
  (console.error) and never breaks the caller. Core routes its own sound calls through these.
- `SL.ease`: `linear, inQuad, outQuad, inOutQuad, outCubic, inOutCubic, outBack, outElastic, outExpo`;
  **(ext)** `inCubic, inExpo, outSine, inOutSine`.
- `SL.color`: `rgba(hex, a=1)` (cached string), `mix(a, b, t) -> hex`, `hsl(h deg, s %, l %, a=1)`,
  `lighten(hex, amt)`, `darken(hex, amt)`. Inputs may be any CSS color (`#rgb`, `#rrggbbaa`, `rgb()`, `hsl()`,
  names); results of `mix/lighten/darken` are `#rrggbb`. Unparseable input warns once and becomes magenta.
  **(ext)** `parse(c) -> [r, g, b, a]`, `toHex(r, g, b)`, `luma(hex) -> 0..1`.
- `SL.makeRng(seed) -> { next, range(a, b), int(a, b) inclusive, pick(arr), chance(p), sign(), gauss(), seed(n|string), initial }`
  (mulberry32). `SL.rng` is the gameplay instance, reseeded at every mission start (`?seed=` or a time seed).
- `SL.bus`: `on(evt, fn) -> off()`, `once(evt, fn) -> off()`, `off(evt, fn)`, `emit(evt, data)`; `on('*', fn)`
  receives every event as `fn(data, evt)`. Listener errors are caught and logged with the event name.
  **(ext)** `count(evt)`, `onMission(evt, fn) -> off()` (same as `on`, but removed automatically at the next
  `missionEnd`: complete, fail, quit or restart; use it for listeners added in `onStart`, `init` or a sandbox so they
  cannot pile up across runs). Some payloads are reused objects (`enemyHit`, `playerHit`, `tick`): read them, don't keep them.
- `SL.registry(kind) -> { kind, defs, define(id, def) -> def (sets def.id), get(id) (warns once, null), has, ids(), all() }`.
  Registries: `SL.enemies, SL.bosses, SL.hazards, SL.backgrounds, SL.missions, SL.formations, SL.pickupTypes,
  SL.ebulletTypes, SL.pbulletTypes, SL.screens, SL.sandboxes` and **(ext)** `SL.paths` (path helpers, owned by
  11_enemies.js: `SL.paths.define(id, fn)` / `get(id)` work from load time; plain properties such as
  `SL.paths.swoop = fn` work too, as long as no path is named `define`, `get`, `has`, `ids`, `all`, `kind` or `defs`).
  Redefining an id replaces it (later files win).
- `SL.time = { t, real, scale, paused }`: `t` game seconds since mission start; `real` advances with real time
  (not while the tab is hidden); `scale` = slow-mo x debug time scale.
- `SL.onBoot(fn)` (runs immediately when called after boot). **(ext)** `SL.booted`, `SL.hotData` (data handed over by
  `window.claude.hot`, `{save, settings}`).
- `SL.after(seconds, fn) -> {cancel()}`, `SL.every(seconds, fn(i), count = Infinity) -> {cancel()}`: game-time
  timers (stop during pause and hit-stop, scale with slow-mo). Cleared at every mission start and end. A callback may
  end the run (`SL.after(4, () => SL.game.completeMission())`, `retry`, `quitMission`): the timer loop stops cleanly.
  `count <= 0` never fires.

## 01_save.js

- `SL.save.data` (schema v1 of ARCHITECTURE 6.2, normalized on load), `SL.save.settings` (6.2 defaults).
- `load()`, `commit()` (debounced 300 ms, but a steady stream of commits still writes at least every 2 s; flushed at
  once on `visibilitychange` hidden and `pagehide`), `reset({settings})`,
  `defaults()`, `exportCode() -> "SL1.<base64url>.<check>"` (`''` if the save is not JSON-serializable), `importCode(str) -> bool`,
  `sample('fresh'|'mid'|'late'|'full') -> save object` (does not apply it; `SL.save.samples[name]` = object or
  function overrides the core sample). **(ext)** `flush()`, `defaultSettings()`,
  `useSample(name)` (applies a sample in memory only; storage untouched for the session; `?save=` uses it),
  `setSetting(key, value)` (normalizes, commits, emits `settingsChanged {key, value, settings}`),
  `mission(id) -> {done, best, rank, rescued, plays}` (with defaults), `memoryOnly`, `storageAvailable`.
- Every storage access is try/catch with an in-memory fallback. Read fields with defaults (`data.upgrades.hull || 0`).
- Events: `saveLoaded {data, settings, sample?}`, `saveImported {data}`, `saveReset {data}`, `settingsChanged`.

## 02_input.js

- `SL.input.players[0|1]`: `{ mx, my (-1..1, normalized), dragX, dragY (logical px this frame, P1 only, already x
  touchSensitivity), fire, focus (held), bomb, skill, pause (pressed this frame), any }`. P2 is all zeros in solo.
- `SL.input.menu`: `{ up, down, left, right, confirm, back, pause, any }` edges (keyboard with key repeat, gamepad
  with 0.38 s / 0.11 s auto-repeat). Keys: WASD/arrows, Enter/NumpadEnter/Space confirm, Escape/Backspace back,
  Escape/P pause.
- `update()` once per frame (the loop and `sim` call it), `inject(i, partial)` (overrides fields this frame),
  `press(i, 'bomb'|'skill'|'pause')` (edge on the next update; touch buttons), `setCoop(bool)`, `lastDevice`
  (`'keyboard'|'mouse'|'touch'|'gamepad'`), `padFor = [p1PadIndex, p2PadIndex]` (-1 = none).
  **(ext)** `coop`, `autoPads` (true: padFor is recomputed per frame by the 6.3 rules), `forceAutoFire` (true while
  the last device is touch), `gamepads` (connected count), `dragging`, `isHeld(code)`, `reset()`, `maps`.
- Bindings exactly as ARCHITECTURE 6.3. Touch: drag anywhere on `#game` except controls (`button, a, input, select,
  textarea, label, [tabindex], .sl-interactive`); once a TouchEvent is seen, pointer events of type touch are ignored.
  When the dragging finger lifts while another finger is still down on the playfield, that finger takes over the drag.
  Mouse: left-drag moves, right-click = bomb, context menu suppressed on `#game`. First keydown/pointerdown/touch
  calls `SL.audio.unlock()`. Window blur / hidden tab pause a running mission (`SL.game.pause('blur')`).

## 04_render.js

- DOM per 6.5. `#game` is sized by CSS (`min()` with container units; JS fallback sizes it when container queries
  are missing). Backing stores of `#screen` and `#hud` = CSS size x min(dpr, 2). Scene canvas 720x1280 x q
  (q 1 High/Medium, 0.75 Low).
- `SL.render.ctx` (scene) is pre-transformed by `SL.render.base` = `{s: q, x, y}` (shake offset included). Never
  `setTransform(1,0,0,1,0,0)` on it: use `save/restore` or the helpers below. `SL.render.hud` is in logical space,
  unshaken, not post-processed.
- `hasGL` (a working WebGL context exists), `distortion` (lens and ripple render this frame: GL output active),
  `quality` `'high'|'medium'|'low'`, `setQuality(q)` (emits `qualityChange {quality}`), **(ext)** `qualitySetting`,
  `auto` (auto mode active), `q`.
- Per-frame post effects (call during update or draw): `addLens(x, y, radius, strength=1)` (max 6; inside `radius`
  is black; Einstein radius = radius x (1 + 1.2 x strength); deflection fades out by 5 Einstein radii),
  `addRipple(x, y, radius, amplitude, width)` (max 8; amplitude ~ px of displacement), `chromatic(0..1)` (max wins),
  `flash(color, alpha)` (max alpha wins, screen blend), `desaturate(0..1)`, `vignette(0..1)` (default 0.35).
  For effects that should last, use `SL.fx.flash` / `SL.fx.chromatic` (timed, decaying).
- **(ext)** `SL.render.setTransform(ctx, x, y, rot=0, sx=1, sy=sx)` (translate x rotate x scale composed with the scene
  base; cheap alternative to save/restore in hot draw code), `SL.render.resetTransform(ctx)` (base transform,
  alpha 1, source-over). Scene ctx only.
- **(ext)** `SL.render.bloom = { threshold: 0.74, knee: 0.22, strength: 2.8, weights: [1, 0.95, 0.85], knee2: 0.55 }`,
  read every frame (a mission may tweak it in `onStart` and restore in `onEnd`). Only near-white or fully saturated
  pixels bloom (lasers, cores, flames, bullets, explosions); mid-grey hulls and backgrounds do not.
- **(ext)** `toLogical(clientX, clientY) -> {x, y}`, `toScreen(x, y)`, `cssW, cssH, left, top, dpr, scale` (CSS px
  per logical px), `fps, frameMs` (smoothed, real frames only), `glInfo`, `scene`, `frame()`, `resize()`,
  `beginUpdate(keep)/endUpdate()` (used by 21_game), `loseContextForTest(restoreMs?)`.
- URL: `?nogl=1` (2D output), `?quality=high|medium|low` (fixed, no auto). Auto (setting `'auto'`): starts High,
  steps down one level when the average real frame time exceeds 20 ms over 3 s (logs a warning). Each frame counts at
  most 50 ms toward that average, so one-off hitches (lazy sprite generation, GC) cannot drop the quality by themselves.
  Each step is checked over the next 3 s: if it bought no speed (frame time still >= 85% of what it was), the next level
  is tried, and if even Low gains nothing the frame clock is capped by the browser or display (30 Hz power saving), so
  the starting quality is restored and auto holds until frames run under 18 ms again.
- Sizing follows window resizes, `ResizeObserver` and DPR-only changes (window moved to another monitor): the backing
  stores are re-measured whenever `min(devicePixelRatio, 2)` changes.
- `webglcontextlost` -> 2D output until `webglcontextrestored` rebuilds the pipeline; a GL exception at runtime
  also switches to 2D. Ambient backdrop: `#ambient` is a 36x64 copy of the scene refreshed every 4th frame,
  blurred and darkened by CSS.

## 05_art.js

- `SL.art.define(key, w, h, draw(ctx, w, h), {pad=2, res=1})`: lazy generator; runs on first `get` or `prewarm`.
  Draw centered in the w x h box; `pad` adds margin for glows; `res` renders at higher resolution (sprite still
  draws at w x h logical). shadowBlur, filters and gradients are fine inside generators.
- `get(key) -> { key, canvas, w, h, pad, res, cw, ch }` (`cw/ch` = drawn size incl. pad; unknown key: magenta
  checker + warn once). `get` also accepts a sprite object (returned as is; a hand-made `{canvas}` is completed) or a
  bare canvas (wrapped once, cached), so `def.sprite` may be a key, a sprite or a canvas.
  `drawSprite(ctx, keyOrSprite, x, y, rot=0, scale=1, alpha=1)` (centered).
- `glow(color, radius, {core='#fff'}) -> canvas` (cached), `drawGlow(ctx, x, y, radius, color, alpha=1)` (additive).
- `metal(ctx, path, {base, light, dark, angle, rim, spec=0.55, specPos=0.3, edge=2.6, rimLight=2.4, rimWidth=1.3, bounds})`:
  pass `bounds {x, y, w, h}` for the gradient extent (defaults to the whole canvas); `rim: false | color`.
  `panelLines(ctx, path, color, alpha=0.45)`, `emissive(ctx, path, color, glow=8, {stroke: width})` (fill or stroke).
- `flame(ctx, x, y, width, length, inner, outer, t)`: additive plume pointing +y from (x, y); rotate the ctx for
  other directions. `noise(w, h, {scale=64, octaves=4, seed=1, gain, lacunarity, ridged, warp}) -> Float32Array 0..1`
  (tileable), `noiseCanvas(w, h, {palette: [[t, color, alpha?], ...], alphaCurve: fn(t) | exponent, ...noise})`.
- `lightDir = {x: -0.6, y: -0.8}`. `SL.pal` per 6.6 plus **(ext)** `space {deep, navy, violet, teal}`, `ui {...}`.
- **(ext)** `has(key)`, `prewarm(keys?)`, `getFlash(key)`, `drawFlash(ctx, key, x, y, rot, scale, alpha)` (white
  silhouette), `ring(color, radius, width) -> canvas`, `poly(points, open)` (flat or pair list -> Path2D),
  `symPath(cx, halfPoints)` (mirrored hull from right-side `[dx, y]` points), `canvas(w, h)`, `localBounds(ctx)`.
- Core sprite keys: `core:*`, `eb:<type>:<color>`, `beam:<color>`. Use your own prefix (`en:`, `boss:`, `wpn:` ...).
  Orientation: player art faces up (-y); bullet sprites point +x and rotate with the bullet when `orient`.

## 06_fx.js

- `SL.fx.emit({x, y, vx, vy, life=0.6, size=12, size2=size, color, color2, alpha=1, alpha2=0, blend:'add'|'normal',
  drag (1/s), gravity, rot, spin, shape, stretch, ease, delay}) -> particle`. Shapes: `glow, spark` (stretched along
  velocity by `stretch`), `square, ring, smoke, debris, fire` **(ext)**, or any `SL.art` key. Default blend is additive
  except smoke, debris and sprites. `color2` gives a 6-step color ramp over life. `ease: true` uses ease-out size and
  ease-in alpha. Pool cap 2500 / 1600 / 900 (High/Medium/Low); the oldest particle is recycled.
- `explode(x, y, {size: 's'|'m'|'l'|'xl'|'boss', palette: 'enemy'|'player'|'blue'|'green'|'violet'|'gold', debris=true,
  shake=true, sound=true, scale=1})`: smoke, billowing fireball (white -> palette mid -> deep), flash, heat glow,
  sparks, embers, debris with burning streaks and smoke trails (m and up), ring, shockwave ripple (m and up),
  screen flash (l and up), shake, `sfx('explode_' + size)`. `'boss'` adds a ring of fireballs, a big flash,
  chromatic and a short hit-stop.
- `hit(x, y, color, {dir})`, `sparks(x, y, {count=8 (max 80), color, speed=420, angle, spread=TAU, life=0.35, size})`,
  `shockwave(x, y, {radius=260, duration=0.6, strength=1, ring=true, color})` (adds a ripple every update),
  `shake(px, seconds)` (x settings.shake; 0.4x with reduced motion), `flash(color, alpha, seconds)` (30% strength when
  settings.flashes is false or reduced motion), `hitstop(seconds <= 0.12)`, `slowmo(scale, seconds)` (eases back over
  the last quarter), `text(x, y, str, {color, size=26, life=0.9, rise=60, weight=700, font})`.
- **(ext)** `chromatic(amount, seconds)` (decaying pulse), `PALETTES`, `count()`, `clear()`, `setCap(n)`, `cap`,
  `update(dt)`, `realUpdate(realDt)`, `draw(ctx)`, `shakeOffset()`, `timeScale()`, `hitstopLeft()`.
  Shake, flash, chromatic, hit-stop and slow-mo run on real time and freeze while paused.

## 07_world.js

- `SL.world`: `players, enemies (bosses too), pbullets, ebullets, beams, ebeams, pickups, pods, hazards, allies,
  props, bg, scroll {speed, target, y}, bounds`; **(ext)** `dt` (current step), `t` (world seconds), `CAPS`
  (`enemies 300, ebullets 1500, pbullets 500, pickups 300, pods 40, hazards 12, props 160, allies 16, ebeams 24`).
- `reset()`, `update(dt)` (6.8 order), `draw(ctx)` (6.5 order). `reset()` (every mission start, retry and return to the
  menu) first calls `def.onEnd(h)` for each live hazard (stop your `SL.audio.loop` hums there), emits `worldReset`, and
  marks every old entity and bullet `dead`, so references content still holds read as dead.
  **(ext)** `setBackground(id, opts)` (calls `def.init(bg, opts)`; `bg = {id, def, t, phase, data, opts}`), `setPhase(name)`, `counts()`.
- Drawing: every `draw(e, ctx)` hook (entities, bullets, beams, hazards, background) gets the scene ctx with the base
  transform and draws at logical coordinates; core restores transform, alpha and composite after each call (and clears
  a leaked `shadowBlur`, `filter` or disabled image smoothing, which would slow or spoil the rest of the frame), so a
  throwing or sloppy hook cannot leak state. Other state (fillStyle, font, textAlign, lineWidth) is not reset: set what
  you use. Draw code must not change game state (sim renders only every 30 steps).
- Entities: `{ id, kind, def, typeId, x, y, vx, vy, r, rot, scale, alpha, hp, maxHp, age, dead, flash, team, data,
  entered }` (enemies also `lx, ly`: position at the start of the step, used by swept collisions). Core moves every
  entity by `vx, vy` after `def.update` unless `def.manualMove`. A spawn that hits a list cap (or an unknown hazard id)
  returns a complete, already dead entity that is not in any list (`data`, `params`, `def`, `typeId` exist). Optional fields read by
  core: `circles: [{x, y, r}]` (multi-circle hitbox, offsets x scale, not rotated), `invuln` (ignores damage, small
  deflect sparks), `intangible` (no collisions), `untargetable` (skipped by `nearestEnemy` / autopilot), `hidden` (not
  drawn), `noCount` (not in kill stats), `noClear` (does not hold `waitClear`), `sprite` (overrides `def.sprite`).
- `SL.spawnEnemy(idOrDef, opts) -> e`: opts `x, y (default -60), vx, vy, path, params, drop, hpMul, hp,
  offscreenKill, noCount` (+ anything for `def.init(e, opts)`). HP = (opts.hp || def.hp || 30) x diff.enemyHp x hpMul.
  Def fields per 6.8 plus **(ext)** `manualMove, onExit(e), noRam, ramDamage (60), palette (explosion), noCount`.
  Enemy dies at hp <= 0: `def.onDeath(e)` or the default (explosion by `def.explosion` or radius, `SL.pickups.drop(e)`),
  then `enemyKilled {e, by}`; score is added by `SL.game.registerKill`. Culling: once entered, `offscreenKill`
  enemies die 60 px + r past the bottom or sides or 420 px above the top (`e.escaped`); enemies that never entered are
  removed after 30 s. An escaped enemy calls `def.onExit(e)` (no score, no `enemyKilled`).
- `SL.spawnBoss(idOrDef, opts) -> b`: opts `x, y (default 360, -r-60), introY (300, default intro target), hp, hpMul, music,
  noCount`. Emits `bossWarning {id, def, b, name, title}`, runs `def.init(b, opts)`, starts music
  (`opts.music || mission.bossMusic || 'boss'`), emits `bossSpawn {b, id}`. Boss fields: `isBoss, name, title,
  phases (sorted by at, descending), phase, phaseName, phaseMarks, invuln, introDone, transitionT, fightT, dying,
  deathT, defeated, parts, score, armor`. Lifecycle:
  - intro: `def.intro(b, dt)` until it returns true (default: ease from spawn y to `introY` in 2.4 s); invulnerable;
    then phase 0 `enter(b)`, `bossIntroDone {b}`.
  - fight: `def.update(b, dt)` every step, plus the current phase's `update(b, dt)` (not during transitions).
  - phase change when hp/maxHp <= next `at`: HP is clamped so one hit cannot skip a phase, `invuln` for
    `def.transitionTime` (1.2 s), enemy bullets turn into credits, flash + shake, `enter(b)`, `bossPhase {b, phase, name}`.
    The check also runs every step, so lowering `b.hp` directly (a destroyed part) changes phase or starts the death.
  - `b.invuln` on a boss is an accessor: it reads true while core holds the boss invulnerable (intro, transition,
    death) OR while content set it; assigning it only sets the content flag. So `enter(b) { b.invuln = true }` (a
    shield until the turrets die) survives the end of the transition, and `b.invuln = false` lifts only your shield.
  - death at hp <= 0: `dying`, bullets and beams cleared, score via registerKill, slow-mo 0.35 for 1.5 s, flash,
    `bossDeath {b}`, then `def.onDeath(b)` runs your death sequence (`def.dying(b, dt)` is also called every step if
    defined). Your sequence must end with `SL.game.bossDefeated(b)`. With neither `onDeath` nor `dying` core plays a 2.7 s chain
    of explosions and calls it; if nothing calls it within 8 s core forces it (warning).
  - `def.parTime` (90 s) and `def.timeBonusRate` (250 points per second under par) set the time bonus.
- `SL.spawnHazard(id, opts) -> h` (`h.r = opts.r || def.r || 60`; `hazardSpawn {h, id}`); removed when `h.dead`
  (then `def.onEnd(h)`) or 1400 px off screen. Hazards announce themselves with `SL.bus.emit('hazardWarning', {id, text})`.
- `SL.spawnProp(def, opts)`, `SL.spawnAlly(def, opts)` (team `'ally'`). **(ext)** `SL.world.spawnEntity(list, def, opts)`
  (generic, for `'pods' | 'props' | 'allies' | ...`), `SL.world.spawnPickup(id, x, y, {vx, vy=-120, value=1, life, data})`.
  Def hooks used by collisions: pods `onTouch(pod, p)`, `onBullet(pod, b)` (return false to let the bullet pass);
  props `shootable, hp, onHit(pr, dmg, b), onDeath(pr), blocksBullets, onTouch(pr, p), contactDamage`;
  allies `hittable, onHit(a, dmg, b)`. Pods and props are culled 80 / 220 px below the screen (`def.onExit`).
- Pickups: core drifts them down to 70 px/s (unless `def.update`), applies the magnet (`def.magnet`: false = off,
  number = radius multiplier; radius = player `stats.magnet`), blinks the last 2 s of `pk.life`, and on touch calls
  `def.apply(p, pk)` (return false to keep it), then emits `pickup {p, pk, id}`.
- `SL.fireEnemy(x, y, angle, speed, type='orb', opts) -> b`: opts per 6.8 (`accel, maxSpeed, minSpeed, turn,
  homing, homingTime (1.6 s when homing), wave {amp, freq}, delay (spawn telegraph: grows in, harmless),
  life, split {at, count, type, speed, spread=TAU, aim, color, scale}, color, scale, damage`) plus **(ext)**
  `update(b, dt), owner, data`. Speeds and accel x diff.bulletSpeed; `speed` 0 is a standing bullet (mines), `undefined`
  means 200. A non-finite angle, speed or position warns once and uses a default (down, 200, top center). Bullets are
  pooled: never keep a reference after `b.dead`, and keep custom state in `b.data` (a bullet given extra own fields such
  as `b.grazed` is not recycled, so nothing stale can leak into a later bullet). When the list is full the call returns
  a fully initialised bullet that is already dead and not in the world. Fields: `x, y, vx, vy, angle, speed, r, damage,
  color, scale, age, delay, rot, type, typeId, data` plus `px, py` (position at the start of the step).
- Enemy bullet types (`SL.ebulletTypes`): `{ r, damage: 's'|'m'|'l'|number (8/12/18), color, orient, spin,
  draw(b, ctx) | sprite: key | fn(color) -> key | spriteFor(typeId, color) -> sprite object }`. Core defines `orb (7, s,
  pink), orbBig (13, m, orange), needle (4, s, violet, orient), shard (6, m, red, orient), mine (11, l, orange, spin)`
  and `beam` (`draw(bm, ctx)` used for every enemy beam). Redefining an id replaces it completely.
- `SL.firePlayer(owner, x, y, angle, speed=1400, type='pulse', dmg, opts) -> b`: opts `pierce (true | hit count; each
  enemy is hit once per bullet, any number of enemies), homing (rad/s toward the nearest enemy within 520 px), life,
  scale, onHit(b, e)` plus **(ext)** `r, color, alpha (0.92), data`. Same pooling, cap and finite-argument rules as
  `fireEnemy` (`speed` 0 allowed). Player bullet types (`SL.pbulletTypes`): `{ r, damage, sprite, draw(b, ctx), orient
  (default true), color, alpha, pierce, homing, life, onHit, update(b, dt), noHitFx }`. Drawn additively. A `draw` hook
  that throws is reported once and that type falls back to its sprite (or the core bolt); same for enemy bullet types
  (orb fallback, never invisible) and the `beam` type (default beam).
- Collisions are swept: a bullet is tested along its motion this step (`px, py` -> `x, y`), and player bolts are tested
  in each enemy's frame of reference (its `lx, ly` -> `x, y` motion taken out), so fast bolts cannot tunnel through
  popcorn at 30-60 fps and needles cannot skip the 7 px hitbox. A non-pierce bolt hits the nearest enemy along its path;
  the hit point passed to `damageEnemy` and the hit sparks is the contact point. A jump of more than 160 px in a step
  (teleport) falls back to a point test. The player's own movement (touch drags) stays a point test.
- `SL.world.clearEnemyBullets({toCredits, beams}) -> count` (credits: one small crystal per 6 bullets, max 30).
- Player beams: push objects into `SL.world.beams`: `{owner, x, y, angle, width, length, dps, active, pierce, color,
  update(bm, dt), draw(bm, ctx), dead}`. Core: segment-vs-circle damage per second against every hitbox circle
  (`e.circles`, else `e.r`), skipping `intangible` enemies; non-pierce beams stop at the first enemy and get
  `hitLength, hitX, hitY` each frame (reset before collisions). Remove with `bm.dead = true`.
- `SL.fireEnemyBeam(src, {angle (number | 'aim' | null = aim), width=34, length=1600, telegraph=0.8, duration=1.2,
  sweep (rad/s | {to: angle}), color, follow=true, offset {x, y} | ox, oy, track (rad/s while telegraphing), dps=45,
  data}) -> bm` with `state 'telegraph'|'active'|'fade'`. Fades when `src.dead || src.dying`. sfx `beam_charge`, `beam_fire`.
- `SL.damageEnemy(e, amount, {by, x, y, type}) -> dealt`: x armor; `invuln` blocks; hit flash; `def.onHit(e, dmg, o)`;
  `enemyHit {e, amount, by, type}`; boss phase/death logic.
- `SL.damagePlayer(p, amount, {source, continuous, ignoreInvuln}) -> dealt`: x diff.damage x stats.damageTaken;
  i-frames block; god mode blocks; shield first, then hull; a counted hit gives 0.5 s i-frames, `hitsTaken++`,
  multiplier reset, chromatic + shake + flash + sfx `player_hit` / `shield_hit`, `playerHit {p, amount, source}`;
  `shieldBreak {p}`; `lowHull {p}` at <= 30% (re-armed above 40%); hull 0 -> `SL.player.kill(p)`.
- Queries: `nearestEnemy(x, y, {maxDist, onscreen=true})`, `nearestPlayer(x, y)` (alive, not down),
  `enemiesInRadius(x, y, r)`, `onScreen(e, margin=0)`, **(ext)** `playersInRadius(x, y, r)`, `hitTest(e, x, y, r)`.
- `SL.world.applyGravity(x, y, strength, radius, {players=true, bullets=true (enemy), pbullets=false, enemies=false,
  pickups=true, pods=true, consume=0})`: acceleration `strength x (1 - d/radius)^2` px/s^2 toward (x, y) for the
  current step (call it every update); players through `SL.player.push`; bullets bend (their angle follows);
  `consume` = radius inside which bullets and pickups are destroyed.
- **(ext)** `SL.world.drawDefault(e, ctx)` (sprite + hit flash), `kill(e)`, `defaultDeath(e)`, `ebSprite(typeId, color)`,
  `beamSprite(color)`, `sweepTest(e, ax, ay, bx, by, r) -> t` (first contact 0..1 of a circle of radius `r` moving from
  a to b this step with `e`'s hitbox, or -1; for content collisions such as missiles or ramming props).
- Core `'default'` background: gradient sky, two seamless nebula layers, a far star tile and twinkling mid and near
  stars at different parallax speeds, speed dust. Phases `default, calm, danger, boss, warp` tint the sky.

## 08_player.js

- `SL.player.create(index, stats) -> p`: fields per 6.9 plus **(ext)** `r (22 body), hitR (7), palette (SL.pal.player /
  player2), callsign, firing (fire this frame), fireT, gun, state ('fly'|'respawn'|'pod'|'out'), out, pod, reviveT,
  respawnT, novaT, hitT, shieldHitT, lowHullArmed, control (false freezes input), entering, outro, display (menu jet),
  kills, data`.
- `update(p, dt)`: movement (`mx/my` x speed or focusSpeed, plus drag deltas), clamp 16 px inside, push velocity
  (decays e^-3t), banking (bank = clamp(vx / speed x 0.35)), `p.firing = autoFire || touch || fire`,
  `SL.weapons.update(p, dt)` (fallback twin pulse), bombs, `SL.skills.activate(p)` on the skill edge and
  `SL.skills.update(p, dt)`, regen (`stats.regen` hull/s), low-hull re-arm.
- `draw(p, ctx)`: `SL.weapons.drawShip(p, ctx)` or a placeholder, i-frame flicker (toggles 15 times a second, 32% alpha), shield bubble
  (while `shield > 0` or just hit), bomb nova glow, hitbox dot while focusing (or always, per setting).
- `push(p, ax, ay, dt)` (x (1 - gravityResist)), `heal(p, n)` (`playerHeal {p, amount}`), `addShield(p, n)`, `addBomb(p, n=1)
  -> bool` (false at max), `bomb(p) -> bool` (ARCHITECTURE section 5 rules; `bomb {p}`, sfx `bomb`), `respawn(p)` (`playerRespawn`),
  `revive(p, x, y, by)` (`playerRevive {p, by}`, 50% hull, 2 s i-frames), `kill(p)` (`playerDown {p}`; then co-op pod,
  or a life and respawn after 1.2 s solo / 1 s co-op, or `playerOut {p}`). **(ext)** `defaultStats()`, `statsFor(index)`
  (progress stats merged over defaults), `drawPlaceholder(p, ctx)`. `create` and `statsFor` sanitize the merged stats:
  a numeric stat that is not a finite number (a NaN from an upgrade formula) falls back to its default with a warning,
  `maxHull`, `speed`, `focusSpeed` must be > 0, and `weaponStart` always has a type and a level >= 1.
- Co-op pod: `SL.rescue.spawnPilotPod(p)` (core fallback pod when missing); the partner touching it calls
  `SL.player.revive`. Timeout `stats.reviveTime` (8 s) spends a shared life. `SL.weapons.onPlayerDown(p)` handles the
  weapon level penalty (fallback: level - 1).

## 21_game.js

- `SL.game`: `state ('boot'|'menu'|'mission'|'results'), paused, pauseReason, session, diff ({name, bulletSpeed,
  fireRate, damage, enemyHp, lives, credits}), coop, boss, outro`. **(ext)** `director, perf, DIFFS, RANKS`.
- `newGame()` (resets the save, `newGame`), `startMission(id, {coop, fromCheckpoint, difficulty, seed, def, sandbox})
  -> session` (`missionStart {session, mission, id}`; `fromCheckpoint` is a checkpoint object or `true` for the last
  checkpoint taken in that mission; a checkpoint of another mission is ignored), `retry(fromCheckpoint)` (also for a
  mission started from a `def` object, and a sandbox keeps its co-op flag), `quitMission()`
  (`missionQuit`, then menu), `pause(reason='pause')` (shows the `pause` screen unless reason is `'choice'`; `pause {reason}`),
  `resume(reason?)` (with a reason, only lifts a pause of that reason; hides whatever screen is up over the mission:
  the pause screen or a sub-screen opened from it; `resume {reason}`),
  `addScore(points, x, y) -> n` (floating text when x, y given; `score {n, total, x, y}`), `addCredits(n, x, y, p) -> v`
  (x diff.credits x p.stats.creditMul; `credits {n, total, x, y, p}`), `bossDefeated(b)`, `completeMission()`,
  `failMission()`, `setMenuScene({bg, bgOpts, player: false | {index, weapon}, scroll=70, x, y})` (the options are
  remembered and reused by every later `toMenu()`; called during a mission it only remembers them and leaves the live
  world alone).
  **(ext)** `toMenu(screenId?, params)` (default screen `starmap` if defined, else `title`; `menu {screen}`),
  `skipToBoss()`, `registerKill(e, by)`, `onPlayerHit(p)`, `checkFail()`, `rank(stats)` (assignable), `step(dt)`.
- Session: `{ missionId, mission, kind, coop, players, lives, livesMax, score, mult, multT, maxMult, credits, rescued,
  podsSpawned, podsRescued, podsLost, kills, enemiesSpawned, hitsTaken, livesLost, deaths, bombsUsed, bossesDefeated,
  time, flags, checkpoint, boss, bossSeen, bossTime, timeBonus, result, difficulty, seed, fromCheckpoint, outro, sandbox,
  data }`. Content may add fields to `session.data`.
- Scoring per ARCHITECTURE 5 (x0.1 per kill within 2.5 s, max x8, reset on a counted hit). Rank:
  `35 x killRate + 25 x rescueRate + max(0, 25 - 4 x hits) + max(0, 15 - 7.5 x livesLost)`: S >= 90, A >= 75, B >= 58,
  C >= 40, else D (replace `SL.game.rank` to retune).
- Flow: last boss defeated (or `end`, or timeline exhausted and field clear) -> 3 s outro (bullets to credits,
  jets fly up, invulnerable, `MISSION COMPLETE` banner, sfx `mission_complete`, `missionOutro`; a player who is down but
  not out, in a pilot pod or waiting to respawn, is put back in the jet for the fly-out at no cost) -> result ->
  core writes `save.missions[id]` (done, best, rank, rescued, plays) and lifetime `save.stats` ->
  `SL.progress.applyMissionResult(result) -> summary` (progress banks `result.creditsKept`, rewards and unlocks;
  core banks the credits itself only when progress is missing) -> commit -> `mission.onEnd(session, result)` ->
  `missionComplete | missionFail {session, result, summary}` -> `missionEnd {session, reason}` ->
  `SL.ui.show('results' | 'failed', {result, summary, checkpoint})`. Failing: every player out -> 1.8 s -> fail.
  `completeMission()` / `failMission()` stop the director at once (safe to call from a `call` event or a timer).
- Result: `{ missionId, name, kind, success, coop, sandbox, difficulty, score, credits, creditsKept (50% on fail),
  rescued, podsSpawned, podsRescued, podsLost, kills, enemiesSpawned, killRate, rescueRate, hitsTaken, livesLost,
  deaths, bombsUsed, time, bossTime, timeBonus, maxMult, rank ('' on fail), flags, fromCheckpoint, firstClear,
  prevBest, newBest, rewards, objectives: [{id, text, done}] }` (core runs each `mission.objectives[i].check(session)`
  once at the end).
- Director: all 6.11 events. Notes: one event object may combine keys (they fire together in this order: spawn,
  formation, hazard, radio, pod, pickup, banner, music, scroll, bg, checkpoint, call, waitClear, until, choice, boss,
  end). `opts` is passed through (`spawn` and `boss` get `{x, y, ...opts}`, `formation` gets `{enemy, count, x, y,
  ...opts}`, `radio` gets `opts` as radio options, `pickup` gets them as spawn options). `banner` takes `sub, color,
  duration`; `music` takes `fade`; `boss`, `choice` and the wait events take `timeout` (seconds of unpaused game time,
  0 = none; a choice pauses the game, so its timeout only matters if the story resumes without answering). `repeat {every, count}`
  fires `count` times in total. Formations are `fn(opts) -> enemies[]` (or `{spawn(opts)}`); unknown ones spawn a line.
  After the last `boss` event is defeated, only events with `afterBoss: true` still fire; the outro follows when the
  field is clear. A timeline may be a function `(diff, session) -> events`. A mission without a timeline warns once and
  completes as soon as the field is clear.
- Checkpoint `{missionId, clock, seq, rep, at, bossDone, score, credits, stats, players: [{weapon, bombs, missiles}],
  flags, data}` (`stats`: kills, enemiesSpawned, rescued, pods*, hitsTaken, livesLost, deaths, bombsUsed, time,
  bossesDefeated, bossTime, timeBonus, maxMult; `data`: a JSON copy of `session.data`, omitted with a warning when it is
  not JSON-safe, so keep entity references out of it). `checkpoint {session, checkpoint}` fires when one is taken.
  `retry(true)` starts a fresh run with full lives, restores `flags` and `data` before the timeline function runs (so a
  timeline that branches on an earlier choice rebuilds the same branch), replays the scroll / bg / music events before
  the checkpoint, re-schedules the pending occurrences of earlier `repeat` events, and resumes the director AT the
  checkpoint event: it fires again with everything it carries (bg, scroll, music, banner, spawns) and takes the
  checkpoint again. `mission.onStart(session)` runs after the restore (`session.fromCheckpoint` is true).
- Calls into content each frame: `SL.ui.update(realDt)` (always), `SL.story.update(realDt)` (when not paused),
  `SL.hud.draw(ctx)` (from render), `mission.onUpdate(session, dt)`. Hidden tab or blur pauses (`'blur'`).
  Escape / P / Start toggle pause in missions; the edge is consumed before screens see it, except while a screen other
  than `pause` is up during the pause (a settings or controls screen opened from it keeps Escape for its own back).
- `window.claude.hot` (optional): boot waits up to 2.5 s for `hot.ready`, restores `{save, settings}`, and hands them
  back through `hot.dispose`.

## 22_debug.js

- URL params: `mission, save, coop, autopilot (1 = P1, 2 = both), god, seed, t, boss, screen, sandbox, debug, quality,
  nogl, mute, difficulty, test=smoke` and **(ext)** `noblur=1` (no pause on blur; implied by autopilot and test),
  `hold=1` (start frozen: only `SL.debug.sim` advances the game, so seeded runs are deterministic; the smoke suite uses it).
- `SL.debug.state()` -> the 6.12 fields plus `kills, pickups, pauseReason, bossSeen, event ("index/total"), wait,
  outro, result {success, rank, score, credits}, quality, gl, distortion`; players also have `bombs`; boss has
  `phaseName, dying`.
- `SL.debug.sim(seconds) -> state()`: fixed 1/60 steps with input, autopilot and update; renders one frame every
  `simRenderEvery` (30) steps so draw code runs too. Sim frames do not count toward fps or auto quality.
- `SL.debug.sandbox(id, run(session, world) -> update(dt, session)?, {name, god, autopilot, bg, scroll, music})`
  (defined in 00_core so any file can register while loading). `?sandbox=<id>` runs it inside an empty endless
  mission (no outro, no fail). Generic fallbacks when nothing is registered: `boss:<id>`, `hazard:<id>`, `bg:<id>`,
  `enemy:<id>`. Core sandboxes: `empty`, `stress`, `fx`, `lens`. God mode and autopilot switched on by a sandbox (its
  options or its run function) are restored when that sandbox session ends.
- `?screen=<id>` and the in-page suite open a screen with `SL.debug.screenParams(id)`: the screen's own sample data when
  its definition has `sample: params | () => params`, else core samples for `results`, `failed`, `pause`, `briefing`.
- `SL.debug.autopilot(p, dt) -> input partial` (6.12 behavior; also flies over a downed partner's pod; while the boss
  is invulnerable, during its intro, a transition or a content shield, it targets destructible parts and escorts first,
  so smoke runs of part-gated bosses still finish; set `untargetable` on decoys it should ignore). Autopilot
  answers story choices after 0.8 s with `SL.story.autoChoose()` (story should provide it: pick the first option and
  resolve normally; closing the dialog asynchronously is fine). Only if the game is still paused for the choice 2.5 s
  later (or at once without `autoChoose`) is the director's choice wait released with the flag value `'auto'` (warning).
- **(ext)** `god, autopilotMode, overlay, hold` (true freezes the real-time loop; `sim` still steps), `simulating`,
  `timeScale`, `noBlurPause`, `runSandbox(id, {coop})`, `sandboxIds()`, `perf(seconds) -> {fps, frameMs, p95Ms,
  worstMs, updateMs, renderMs, updateMaxMs, renderMaxMs, frames, quality, gl, glInfo, counts}`, `drawOverlay(ctx)`,
  `sampleResult(success)`, `screenParams(id)` (sample params for `?screen=`), `runTests() -> Promise<report>` (core
  regression tests named `core: ...`, then every registered enemy, formation, bullet type, pickup, hazard, background,
  boss, mission timeline, radio and screen; a test fails on a thrown error or `false`, a returned string is a note).

## Tools

- `python3 tools/build.py [--out dist/dev-me.html --no-publish] [--exclude a.js,b.js]`. The output is pure ASCII
  (non-ASCII becomes `\uXXXX` in JS, `\XXXXXX` in CSS, `&#x..;` in HTML), so text renders correctly even when the
  artifact host serves the page without a charset. Write source files in UTF-8 as usual.
- `node tools/run.mjs --page "dist/earthvanguard.html?..." --steps '[...]' [--size WxH] [--gpu default|swiftshader]
  [--allow-errors]`. Steps: `wait, eval, shot (+ "clip": [x, y, w, h, scale] for zoomed crops), key, down, up, click,
  touch ["touchStart"|"touchMove"|"touchEnd", x, y], mouse ["down"|"move"|"up"|"right", x, y], viewport [w, h, dpr=1,
  mobile=false]` (coordinates in CSS px of the page; `viewport` resizes the page mid-run for resize / DPR / orientation
  checks). Shot paths are resolved relative to the working directory; `shots/` is git-ignored. Under WSL,
  `bash tools/run.sh` calls Windows node with the same arguments. Chrome comes from `CHROME` (default: the Windows
  install path); extra Chrome switches from `CHROME_ARGS="..."`. `--uncapped` turns off display frame
  pacing for perf checks. Reading fps here: the default headless clock ticks every 17.5 ms (about 57 fps) even for an
  empty page, so 57 means "never missed a frame"; use `?debug=1` plus `--uncapped` (or `updateMs + renderMs` from
  `SL.debug.perf()`) to see real headroom. The stress sandbox runs at 170 to 250 fps uncapped on this machine.
- `node tools/smoke.mjs [--only m1,s2] [--modes solo,coop] [--page dist/dev-me.html] [--no-suite]
  [--no-shots] [--chunk 2] [--max 900] [--boss-time 240] [--limits enemies=150,ebullets=1000]`: in-page suite (up to
  180 s), then every mission solo and co-op; table + `shots/smoke/<id>_<mode>_{10s,60s,boss,results}.png`; exit 1 on
  failure. Build first (`python3 tools/build.py --no-publish`); under WSL `bash tools/smoke.sh [--no-build]` does both.
  Entity limits: enemies 150, ebullets 1000, pbullets 500, particles 2500, pickups 250, pods 30, hazards 8.
- `python3 tools/fetch_fonts.py` regenerates `src/00_fonts.css`.

## Events emitted by core

`boot`; `saveLoaded, saveImported, saveReset, settingsChanged`; `qualityChange {quality}, resize {w, h, dpr}`; `worldReset`;
`enemySpawn {e}, enemyHit, enemyKilled {e, by}, bossWarning, bossSpawn, bossIntroDone {b}, bossPhase, bossDeath {b},
bossDefeated {b, id, timeBonus, session}, hazardSpawn {h, id}, pickup {p, pk, id}`; `playerHit, shieldBreak {p},
lowHull {p}, playerDown, playerOut, playerRespawn, playerRevive, playerHeal, bomb {p}`; `missionStart, missionOutro,
missionComplete, missionFail, missionEnd, missionQuit, checkpoint, pause, resume, score, credits, newGame, menu`;
`tick {dt}` (every game step); `sandboxStart {id, session}`. Stub-only events (content keeps or replaces them):
`hazardWarning, podSpawn, podRescued, podLost, choiceMade, screenShow, screenHide`.

SFX ids core triggers: `explode_s|m|l|xl|boss, beam_charge, beam_fire, player_hit, shield_hit, bomb, revive,
mission_complete`; music: `mission.music` at start, boss music on `spawnBoss`, timeline `music` events.

## Recipes

- **Destructible boss part**: in the boss `init`, spawn parts with
  `SL.spawnEnemy(partDef, {noCount: true, offscreenKill: false})` where `partDef` has `manualMove: true`, `noClear: true`
  and an `update` that sets `e.x, e.y` from `e.params.boss` plus an offset; in the part's `onDeath`, explode and damage
  the boss (`SL.damageEnemy(b, n)`, or lower `b.hp` directly: the phase check runs every step); in the boss `onDeath`,
  `SL.world.kill(part)` the survivors. Use `b.circles` for the hull itself.
- **Boss shield phase**: `enter(b) { b.invuln = true; }` and `b.invuln = false` once its generators are destroyed; the
  shield stays up after the 1.2 s transition ends (core's own invulnerability is a separate flag).
- **Player lance beam**: keep one object in `SL.world.beams` per player
  (`{owner: p, x, y, angle: -PI/2, width, length: 1400, dps, active, pierce: true, color, update, draw}`), move it to
  the nose in `update`, toggle `active` with `p.firing`, and set `dead = true` in `onPlayerDown`. Non-pierce beams get
  `hitX, hitY, hitLength` for an impact glow.
- **Black hole**: every `update(h, dt)`: `SL.world.applyGravity(h.x, h.y, pull, range, {consume: h.r})` and
  `SL.render.addLens(h.x, h.y, h.r, strength)`; in `drawOver`, draw a 2D horizon only when `!SL.render.distortion`;
  stop its `SL.audio.loop` in `onEnd(h)` (also called when the run ends, retries or quits).
  See the `test_blackhole` stub (14_hazards.js) and the `lens` sandbox.
- **Custom enemy bullet art**: `SL.art.define('eb:plasma', 40, 40, drawFn)` then
  `SL.ebulletTypes.define('plasma', {r: 9, damage: 'm', sprite: 'eb:plasma', spin: 3})`; per-color art:
  `sprite: (color) => key` (define each key lazily). Keep white-hot cores: enemy bullets must be the brightest things.
- **Timed screen effects**: `SL.fx.flash(color, a, s)`, `SL.fx.chromatic(a, s)`, `SL.fx.shake(px, s)`; per-frame
  ones (`SL.render.desaturate`, `vignette`, `addRipple`) must be re-added every update.

## Deviations

1. **Post-effect lifetime.** Effects added during `SL.update` stay until the next update step (so pause and hit-stop
   frames keep their lenses and ripples); effects added while drawing are cleared after the frame. Same API.
2. **Bloom levels.** The bright pass downsamples to 1/4 and the blur runs at 1/4, 1/8 and 1/16 (High) or 1/8 and
   1/16 (Medium), summed with weights; the bloom term is soft-limited (`b / (1 + knee2 b)`), and parameters are exposed
   as `SL.render.bloom`. ARCHITECTURE describes a single 1/4 (1/8 on Medium) level.
3. **2D output canvas.** A canvas with a WebGL context cannot also give a 2D context, so the fallback creates a second
   canvas that takes the `#screen` id (the GL canvas becomes `#screen-gl`, hidden). Low quality always uses this 2D
   path (`distortion = false`) even when WebGL works.
4. **Hit flash.** White flash for 0.06 s after damage, but at most once per 0.11 s (0.14 s for bosses) and at 60%
   (bosses 22%) opacity, so sustained fire flickers instead of turning the sprite into a white blob.
5. **Continuous damage.** Sources with `continuous: true` (enemy beams at 45/s) do not grant i-frames (they would cap
   beams at one tick per 0.5 s); they count as a hit at most once per 0.5 s.
6. **Bosses count as spawned enemies** (`session.enemiesSpawned`), so the kill rate stays at most 1.
7. **Culling.** Bullets are culled 60 px outside the screen only while moving away from it (or beyond 400 px, or older
   than 4 s), so bullets fired from off-screen can enter. Enemies that never enter are removed after 30 s.
8. **Boss phases** clamp HP so a single big hit cannot skip a phase.
9. **`SL.debug.params` and `SL.debug.sandbox`** are defined in 00_core.js (so content can register sandboxes while
   loading); 22_debug.js fills in the rest of `SL.debug`.
10. **`SL.game.resume(reason?)`** takes an optional reason; `pause('choice')` does not open the pause screen.
11. **Timers** (`SL.after`, `SL.every`) also run in menus; they are cleared at every mission start and end.
12. **Smoke "boss within 240 s"** is checked per boss fight (missions may hold several boss events); a run may take at
    most `--max` (900) s of sim to reach its first boss.
13. **Frame-rate measurement (test condition).** On this machine Chrome's headless frame clock with `--gpu default`
    ticks every 17.5 ms (57.1 fps) even for an empty page (the display runs at 59 Hz). No page can report 58 fps that way;
    the stress sandbox matches the empty-page clock exactly (57.3 fps, p95 18 ms, worst 18.1 ms, 4.2 ms of CPU per
    frame) and runs at 168 to 247 fps with `bash tools/run.sh --uncapped`. SwiftShader ticks at a true 16.7 ms but
    renders the post pipeline in software.
14. **Boss `b.invuln`** is an accessor (see 07_world): core's invulnerability (intro, transitions, death) and content's
    are separate flags, OR-ed when read. ARCHITECTURE only says the boss is invulnerable during intro and transitions.
15. **Checkpoints** hold more than ARCHITECTURE's `{clock, event index, weapons, score, credits}` (all session stats,
    flags, a JSON copy of `session.data`, the boss-done state) and a retry re-fires the checkpoint event itself.
16. **`SL.paths`** is created by 00_core as a registry (ARCHITECTURE lists it only as "path helpers" of 11_enemies.js),
    so `define/get` exist from load time whichever way 11_enemies.js fills it.
