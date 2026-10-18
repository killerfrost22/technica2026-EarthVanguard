# Earth Vanguard

A vertical-scrolling space shooter that runs in the browser, built for **Technica 2026**.

The Nyx Armada has come out of the Tartarus Rift towing captive black holes and is dropping them on human
worlds. You are the test pilot of the XF-9 *Starlance*, flying from the carrier UNS *Halcyon*, the last
warship at the Vesta Line. Across five missions you fight through swarms of enemy jets, pull survivors out
of drifting escape pods, and take on screen-filling bosses that break apart in stages. A friend can jump in
at any time and fly the gold twin jet, the XF-9B *Sunlance*.

Riding along in a water bubble tethered to your jet is **Puff**, a pufferfish who isn't from Earth. His ocean
world was poisoned by corporations, then chosen by the Directorate for one of its cruel games: survive the
trials and win the power to heal your home. He won, and lost his world anyway. He won't talk about it. In
Mission 1 a black hole tears him away, and inside it he relives the first trial, playable with your voice.
After that, **Puff's Ocean** lets you replay his trials any time from the title screen.

<p align="center">
  <img src="docs/screenshots/coop-blackhole.png" width="24%" alt="Two jets in co-op flying toward a black hole">
  <img src="docs/screenshots/boss.png" width="24%" alt="Boss fight warning with radio message">
  <img src="docs/screenshots/puff.png" width="24%" alt="Puff the pufferfish shrinking to slip under a floating garbage patch">
  <img src="docs/screenshots/puff-nets.png" width="24%" alt="Puff swimming between two ghost fishing nets">
</p>

## Play it

No install, no server, no build step needed:

1. Download or clone this repo.
2. Open **`dist/earthvanguard.html`** in a modern browser (Chrome, Edge, Firefox or Safari). Double-clicking
   it works.

The whole game, including art, music, sound effects, voice lines and fonts, lives in that one HTML file. All
graphics are drawn in code and all music and sound effects are synthesized at runtime, so there are no image assets
and the only recordings are the narration clips built into the page.

For Puff's voice controls, Chrome or Edge works best. If the mic is blocked when opening the file directly,
serve the folder instead. From the repo root, run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/dist/earthvanguard.html> in your browser (the URL goes in the browser, not
on the command line). Press `Ctrl+C` in the terminal to stop the server.

## Controls

Firing is automatic. Hold Fire to keep shooting when auto-fire is off.

| Action | Solo (keyboard) | Co-op Player 1 | Co-op Player 2 | Gamepad |
|---|---|---|---|---|
| Move | WASD or arrow keys | WASD | Arrow keys | Left stick / D-pad |
| Fire | Space, Z or J | Space | `/` or Numpad Enter | (auto) |
| Bomb | X, Q or K | Q | Enter or Numpad 0 | A |
| Skill | C, E or L | E | Right Shift or Numpad 1 | X or B |
| Focus (slow, precise movement) | Shift | Left Shift | Right Ctrl or Numpad 2 | LB / RB |
| Pause | Esc or P | Esc or P | Esc or P | Start |

On touch screens, drag anywhere to move. The jet follows your finger's motion, so your thumb never covers it.

**Landscape or portrait.** On a wide screen (a laptop, or a phone turned sideways) the game plays as a side-scroller:
your jet flies right and enemies come from the right, and the arrow keys and stick follow the screen. On a tall
screen it plays as a vertical shooter. It switches automatically when the window or phone turns. **Text size**
(Normal, Large, Extra large) is on the title screen.

### Echo

| Action | Keys | Touch / gamepad |
|---|---|---|
| Move | WASD or arrow keys | Drag / left stick |
| Echo (light up the walls) | Space, Z or J | Tap / A, X, B or RT |
| Sneak (half speed) | Shift | LB / RB |
| Pause | Esc or P | Start |

### Puff's Ocean

| Action | Voice | Keys / touch / gamepad |
|---|---|---|
| Puff up and float | Get loud: "ahh", a hum, a whistle | Hold Space, Up or W, hold the screen, or hold the right trigger |
| Shrink and sink | Go quiet | Let go (Down or S sinks faster) |
| Pause | Esc or P | Esc or P |

Before a voice run, Puff tunes itself to *your* voice: 2 seconds of quiet, then your loudest comfortable
sound. A soft hum plays as well as a scream. In voice mode the game is hands-free: make a sound to start, and
hum for a second on the game-over screen to swim again. The mic only measures loudness inside the page;
nothing is recorded or sent.

## What's in the build

**Playable now**

- **Mission 1, First Light:** a short first mission over the Vesta Shipyards: a catapult launch off the
  *Halcyon*'s deck, gnat, dart, wasp and manta formations, escape-pod rescues, a black hole, a checkpoint, Puff's
  trust choice and the assault carrier RAZORBACK.
- **Mission 2, Deep Pull:** Kerr Station breaking up beside Kerr's Eye, a captive black hole. Spears, snipers and
  spiral-gun weavers, a first black hole that bends bullets and eats drones, tug ships towing black holes, Dr. Osei's
  pod falling toward one of them, and the gravity siege engine LODESTAR.
- **Mission 3, Stormwall:** into the Tantalus Nebula's ion storm after the Nyx fleet. Ion cells that jam your guns,
  mine-laying skimmers, missile boats and lightning-chaining stormcallers, a calm in the storm's eye, two prison barges
  to crack open (the second carries Captain Holt, "Rook"), and the storm dreadnought TEMPEST, all to its own storm
  track.
- **Mission 4, Sunbreak:** the Directorate's harvester array draining the blue giant Tarsis. Solar flares you survive
  by hiding in rock shadows, an eclipse, a mine field, a defector named Ixa whose pod is hunted by cloaked phantoms,
  and the star-drinking boss SUNEATER, introduced by the Overseers themselves. Puff recognizes the harvester: one
  like it drained his sun. How you answer him, and how much he trusts you by then, changes what he tells you.
- **Missions unlock in order.** Start takes you to the next mission you haven't cleared, and the **Missions** button on
  the title screen replays any mission you've opened.
- **Voiced radio:** Anvil, Sparrow, Puff, Patch the hangar chief, Rook, Ixa the defector, and the villains who hijack
  the channel when a boss arrives: Hierarch Vael (Missions 2 and 3) and the Overseers (Mission 4).
- **Weapons that change what you see:** twin pulse lasers, a widening spread fan, a piercing lance beam
  (each with five levels), plus homing missiles and screen-clearing bombs.
- **Space hazards:** black holes that bend your lasers and the screen around them, asteroid storms, ion
  storms, solar flares, mine fields and wormholes.
- **Rescue:** pull survivors out of escape pods drifting through the crossfire.
- **Local co-op** for two players on one keyboard, two gamepads, or a mix.
- **Music for every stage,** all synthesized, each written for its mood: the title theme, a theme for each part of
  the story (the Overseers, the cell, the escape, Puff, his grief), Echo's stealth track (her heartbeat comes in as the
  alarm rises), Puff's Ocean, Puff's memory, the black hole (it sings the song Puff knows, and Mission 2 flies to it),
  Mission 3's storm, Mission 4's star (it goes quiet in the eclipse and Puff's theme drifts in), the bosses, victory
  and defeat. Details in [`docs/api/audio.md`](docs/api/audio.md).
- **Echo:** a stealth minigame about the escape of Blue Arrow, the main character. She grew up as a test subject
  inside a sealed facility, and the experiments left her able to see with sound. With the power out, every echo she sends lights
  up the walls for a moment, but security drones hear it too. Three floors to the surface, each behind a keycard
  door. Open from the title screen for now (no story trigger yet).
- **The black hole (Mission 1):** Puff's tether snaps and he's pulled in. Inside, his memory of the first
  trial plays as a 45-second Puff's Ocean run with the Directorate watching; then the jet hauls him back out.
- **Puff's Ocean** (unlocked by the memory or by clearing Mission 1): dodge ghost nets, oil spills, plastic bags, six-pack
  rings and leaking drums; squeeze under floating garbage patches; collect pearls, starfish (extra hearts)
  and bubble shields. Every game over shows a real ocean-pollution fact. The sky changes as you swim: storms with
  lightning, rain, snow, fog, sunsets, moonlit nights and the northern lights. Watch the bot swim
  from the menu, and chase the top 10 on the leaderboard (saved on your device).

**Designed, not wired into missions yet:** Mission 5, four side stories, the hangar and skill tree and the rest of
the radio cast are written up in [`docs/GDD.md`](docs/GDD.md). Two side-story bosses (Mantis and Crucible) are built
and can be fought in their test sandboxes, for example `?sandbox=boss:mb_mantis`.

## How it's built

Plain JavaScript, HTML canvas and the Web Audio API, with no frameworks or libraries. Black-hole lensing
uses WebGL when it's available and falls back to a 2D canvas when it isn't.

```
src/      game source: numbered JS/CSS modules plus shell.html (the page skeleton)
tools/    build script and headless test tools
dist/     built game (earthvanguard.html)
docs/     game design doc, architecture contract, API notes, screenshots
shots/    screenshots captured by the automated tests
```

To rebuild after editing anything in `src/`:

```sh
python3 tools/build.py
```

This inlines every `src/*.css` and `src/*.js` file, in name order, into `dist/earthvanguard.html` (and into
`dist/publish/index.html` for web hosting).

**Developer panel:** press the `` ` `` (backquote) key in the game, or add `?dev=1` to the URL (that also adds a DEV
button for touch screens). It jumps to any point in the story (Prologue, Echo, After Echo, Mission 1, After
Mission 1), skips whatever is running (a cutscene, Echo, Puff's memory, to the boss, or wins the mission), and has
a **Skip minigames** switch (remembered in your browser) so the story passes through Echo and Puff's memory without
playing them. **Reset story** starts the story over, and the **Music** section plays any track (its Mood slider drives
the layers some tracks add, like Echo's heartbeat).

Handy URL parameters for testing (add them to the end of the file URL):

- `?mission=m1`: jump straight into a mission
- `?sandbox=<id>`: open a test sandbox (for example `boss:boss_suneater`, `hazard:black_hole`, `weapons`)
- `?save=mid&screen=puff`: open Puff's Ocean with a save that has Mission 1 cleared
- `?cutscene=intro`: play a story cutscene over the title screen (ids in `cutscenes/earth-vanguard-cutscenes/README.md`)
- `?save=mid&screen=puff&puff=bot`: watch a bot play Puff's Ocean
- `?mission=m1`: the black hole and Puff's memory arrive about 35 s in (autopilot and `t=` fast-forward skip the
  memory)
- `?mission=m4`: Sunbreak (the eclipse and Puff's trust choice come about a minute in; `&boss=1` skips to SUNEATER)
- `?screen=echo`: open Echo (`&echo=play&sector=1` starts on a floor, `&echo=reveal` keeps every wall lit)
- `&coop=1`: start in two-player mode
- `&boss=1`: skip ahead to the boss
- `&god=1`: invincibility
- `&autopilot=1`: let the game fly itself
- `&debug=1`: performance overlay

For the full design and engineering details, see [`docs/GDD.md`](docs/GDD.md) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Team

Built at Technica 2026 by:

- Yizhan Ao
- Ruijie Chen
- Jazmine Yambo
- Megan Tiller

A project website with the story, campaign, cast and team lives in [`website/index.html`](website/index.html).
