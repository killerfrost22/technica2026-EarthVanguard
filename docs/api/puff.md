# Puff's Ocean (`src/23_puff.js`, `src/23_puff.css`)

A voice-controlled minigame that lives inside Earth Vanguard. Puff the pufferfish is the pilot's best friend
aboard the *Halcyon*; in the minigame Puff swims home through Earth's polluted ocean. It unlocks when the
player clears `m1`.

## Mechanic

One control value, the **level** `0..1`, sets both Puff's size and buoyancy:

- Size: radius `26 + 46 * level^0.9` px (logical 720 x 1280 space).
- Vertical speed target: `330` px/s down at level 0 to `400` px/s up at level 1, reached at 7/s. Neutral
  (hover) is at level ~0.45; the HUD meter marks it.
- Voice: mic RMS in dB is mapped through the player's calibration (`floor + 4 dB` .. `peak - 3 dB`) times the
  sensitivity setting (0.5-2, saved), then smoothed with a fast attack (14/s) and slower release (5/s).
- Keys / touch / gamepad: holding glides the level up at 2.6/s, releasing glides it down at 2.4/s (5/s with
  Down/S). Holding Space in voice mode also puffs Puff up.

Three hearts; hits give 1.5 s of invulnerability. Score = distance / 40 + 10 per pearl (+50 for a starfish at
full hearts).

## Obstacles and pickups

| Pattern | What it asks |
|---|---|
| `net` ghost net gate | hover through a gap (340 → 270 px as the run goes on) |
| `patch` garbage patch | go quiet: sink to the sand and slip through a 125 → 98 px tunnel |
| `oil` spill | stay low: a slick hangs 250-440 px down from the surface |
| `bags` | swim the lane between two drifting plastic bags |
| `rings` | dodge bobbing six-pack rings |
| `barrel` | stay high while a leaking drum sinks past |
| `cans` | dodge a cluster of drifting cans |

Pickups: pearls (trails also show the safe line), starfish (+1 heart, at most one per 14 s), bubbles (a
shield that absorbs one hit).

**Fairness rules.** Each pattern declares the safe line Puff enters and leaves on (`tin` / `tout`). The
spawner leaves enough distance to swim from one pattern's exit line to the next one's entry line at 80% of
Puff's top vertical speed, plus 0.8 s. Once a wall's far edge is behind Puff's center it can no longer hit
(puffing up after a tunnel must not catch the wall just cleared).

## Public surface

- `SL.puff.unlocked()`: true once `save.flags.unlock_puff` is set or `m1` is done.
- `SL.puff.titleButton()`: the title-screen entry (locked teaser before the unlock, `NEW` badge until first
  opened). `20_ui.js` appends it to the title screen's buttons.
- `SL.puff.open()`: shows the `puff` screen.
- `SL.puff.state`: `off | intro | micwait | calib | ready | play | paused | over | error`; `mode`: `voice |
  keys`; `level`; `run` (the current run).
- `SL.puff.tick(dt)`: one frame without requestAnimationFrame (tests).
- `SL.puff.sim(seconds)`, `SL.puff.simRuns(count, seconds)`: headless fast-forward and the bot fairness check.
- Save: `save.data.puff = { best, plays, pearls, sens }`; flags `unlock_puff` and `puff_seen`.
- On `missionComplete` for `m1`, it sets the unlock flag and adds an "Unlocked: Puff's Ocean" note to the
  results screen.

The screen draws on its own canvas inside `#ui` with its own animation loop, started in `onShow` and stopped
in `onHide`, which also releases the microphone. It uses its own AudioContext (the mic needs one); effects are
short and quiet in voice mode so the mic doesn't hear them, and the surf ambience plays only in keys mode.

## Test hooks

- `?save=mid&screen=puff`: the intro with Mission 1 cleared.
- `&puff=play` / `&puff=bot`: start a run in keys mode / with the bot flying; `&t=<sec>` fast-forwards;
  `&seed=<n>`.
- `&puff=calib`, `&puff=pause`, `&puff=over`: open those panels.
- `&puffsim=<runs>&puffsec=<seconds>`: bot-plays that many runs; the report goes to `window.__PUFF__`, the
  console and a hidden `#puff-report` element. Current result: 40 of 40 runs of 150 s with no hits.
