# Earth Vanguard

A vertical-scrolling space shooter that runs in the browser, built for **Technica 2026**.

The Nyx Armada has come out of the Tartarus Rift towing captive black holes and is dropping them on human
worlds. You are the test pilot of the XF-9 *Starlance*, flying from the carrier UNS *Halcyon*, the last
warship at the Vesta Line. Across five missions you fight through swarms of enemy jets, pull survivors out
of drifting escape pods, and take on screen-filling bosses that break apart in stages. A friend can jump in
at any time and fly the gold twin jet, the XF-9B *Sunlance*.

<p align="center">
  <img src="docs/screenshots/coop-blackhole.png" width="30%" alt="Two jets in co-op flying toward a black hole">
  <img src="docs/screenshots/boss.png" width="30%" alt="Boss fight warning with radio message">
</p>

## Play it

No install, no server, no build step needed:

1. Download or clone this repo.
2. Open **`dist/earthvanguard.html`** in a modern browser (Chrome, Edge, Firefox or Safari). Double-clicking
   it works.

The whole game, including art, music, sound effects and fonts, lives in that one HTML file. All graphics are
drawn in code and all audio is synthesized at runtime, so there are no image or sound assets.

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

## Features

- **Five story missions** (First Light, Deep Pull, Stormwall, Sunbreak, Nightfall), each ending with a
  multi-phase boss, plus **four side stories** where a radio choice decides which skill your jet learns.
- **Signature hazards:** black holes that bend your lasers and the screen around them, asteroid storms,
  ion storms, solar flares, mine fields and wormholes.
- **Weapons that change what you see:** twin pulse lasers, a widening spread fan, a piercing lance beam
  (each with five levels), plus homing missiles and screen-clearing bombs.
- **Rescue:** pull survivors out of escape pods drifting through the crossfire.
- **Local co-op** for two players on one keyboard, two gamepads, or a mix.
- **Hangar upgrades and a skill tree** paid for with the crystals that drop from every kill. Progress is
  saved in your browser.
- **Radio crew and story:** a radio cast (commander, wingmate, mechanic and villain) with short
  briefings and lines you can read mid-fight.

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

Handy URL parameters for testing (add them to the end of the file URL):

- `?mission=m1`: jump straight into a mission (`m1`-`m5`, side stories `s1`-`s4`)
- `&coop=1`: start in two-player mode
- `&boss=1`: skip ahead to the boss
- `&god=1`: invincibility
- `&autopilot=1`: let the game fly itself
- `&debug=1`: performance overlay

For the full design and engineering details, see [`docs/GDD.md`](docs/GDD.md) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Team

Built at Technica 2026 by:

- _TODO: add team member names_
