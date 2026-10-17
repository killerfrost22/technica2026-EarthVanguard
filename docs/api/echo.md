# Echo (`src/24_echo.js`, `src/24_echo.css`)

A stealth minigame inside Earth Vanguard about the escape of Blue Arrow, the main character (see `storyline/`).
She was a test subject, known only as Subject 7, in a sealed experimental facility run by the Directorate, a
subordinate arm of an advanced civilization, and spent most of her life there, cut off from the outside world. The experiments left her able to see with sound. The power has
failed, and Echo is her escape: three floors up to the surface.

There is **no unlock trigger yet**. `PLAYTEST_UNLOCK` (top of `24_echo.js`) keeps it open on the title screen; once a
story beat should unlock it, call `SL.echo.unlock()` from there and set `PLAYTEST_UNLOCK` to false.

## Mechanic

- The facility is dark. **Echo** (Space / Z / J / E / X, a tap, or a gamepad A / X / B / RT) sends out a ring
  (`760` px/s, reach `560` px, cooldown `1.1` s). Each tile lights up as the ring passes it, if the echo can reach it
  (walls block it; the wall face it hits lights up). Lit tiles fade in about 3 s. She always feels walls within
  about `92` px.
- Move with WASD / arrows / left stick, or drag on touch. Shift (focus) sneaks at half speed (`105` vs `215` px/s).
- **Drones** patrol fixed routes with a red light cone (range `250`, half-angle `0.52`). They **hear any echo
  within `360` px** and fly to where it started (orange, `?`), look around, then go back to their route. If one sees
  her it stops and tracks her (`!`); when she breaks line of sight it searches her last known spot.
- **Cameras** sweep back and forth; one that sees her locks on and calls the nearest drone over.
- **Lasers** switch on and off (they flicker just before switching on). Crossing a live beam adds `0.45` alarm.
- **Alarm** fills while anything sees her (`0.55`/s, up to `1.8`/s up close) and drains (`0.32`/s) after `1.1` s
  unseen. Full alarm = caught: retry that floor (memory shards found on that attempt are undone in the run, but
  stay found in the save).
- Each floor: find the keycard, walk into the amber door to open it, step on the green hatch.

Floors: B3 Cell Block (one camera, tutorial), B2 Research Wing (three drones, one laser), B1 Containment Gate
(three drones, two cameras, two lasers). Two memory shards per floor, six short lines of her past.

## Public surface

- `SL.echo.unlocked()`: true when `PLAYTEST_UNLOCK` is on or `save.flags.unlock_echo` is set.
- `SL.echo.unlock()`: sets `flags.unlock_echo` (for the future story trigger); returns false if already set.
- `SL.echo.titleButton()`: title-screen entry (locked state, `NEW` badge until first opened). `20_ui.js` appends it.
- `SL.echo.open()`: shows the `echo` screen.
- `SL.echo.state`: `off | intro | play | paused | caught | escaped`; `SL.echo.run`: the current run.
- `SL.echo.tick(dt)`: one frame without requestAnimationFrame; `SL.echo.sim(seconds)`: headless fast-forward.
- Save: `save.data.echo = { best (seconds), wins, plays, reached (floor index to continue from), mem (shard ids) }`;
  flags `unlock_echo`, `echo_seen`, `echo_escaped`.

Like Puff's Ocean, the screen draws on its own canvas inside `#ui` with its own animation loop and its own small
AudioContext (echo pings with returns, reactor hum, alarm beeps). It draws in screen space with a 720x1280 view in
portrait and 1280x720 in landscape; the camera follows her.

## Editing the floors

`SECTORS` in `24_echo.js` holds each floor as an ASCII map (`#` wall, `.` floor, `S` start, `X` hatch, `D` keycard
door, `k` keycard, `m` memory shard) plus guards in tile units: drone `path` points are walked as a loop in
straight lines (keep each leg on open floor; two points = back and forth), cameras sit at `(x, y)` facing `a`,
lasers cross tile `(c, r)`. Keep the hatch reachable only through the door.

## Test hooks

- `?save=mid&screen=echo`: the intro.
- `&echo=play` (start), `&sector=0..2`, `&t=<sec>` (fast-forward), `&echo=reveal` (every wall stays lit),
  `&echo=caught`, `&echo=escaped`.
