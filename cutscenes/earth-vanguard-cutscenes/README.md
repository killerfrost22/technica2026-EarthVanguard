# Earth Vanguard — Cutscenes

Animated, illustrated cutscenes (all art is generated SVG, no image files). No dependencies; it plays as a full-page overlay on top of the game.

```
cutscenes/
  cutscenes.js   player (don't need to touch)
  art.js         the 20 illustrated scenes + character designs
  scenes.js      THE SCRIPT: all text, which art, backgrounds, choices — edit this
demo.html        click-through preview of every cutscene
```

## Story order

Each cutscene plays once per save; Esc skips one. Choices write Puff's trust to the save (`save.flags.puff_trust`).

| When                                          | Cutscene id         | Ends with title card |
|-----------------------------------------------|---------------------|----------------------|
| Start on a new save                           | `intro`             | ECHO                 |
| Echo escaped, Continue                        | `echo_complete`     | EARTH VANGUARD       |
| Right after, before Mission 1                 | `puff_intro`        | PUFF                 |
| Mission 1 cleared, back at the menu           | `puff_complete`     | —                    |
| Before Level 2 (not played yet: no Mission 2) | `vanguard_intro`    | VANGUARD             |
| Level 2 cleared (not played yet)              | `vanguard_complete` | TO BE CONTINUED      |

Puff's past is not told in `puff_intro`: in Mission 1 a black hole pulls Puff in and the player relives his first
trial (`src/25_puffstory.js`), and `puff_complete` then reveals what happened to his planet.

Once the story reaches Mission 1, Start goes straight to Mission 1. 2 Players always skips the story.

## How it runs in the game

`tools/build.py` inlines `cutscenes.js`, `art.js` and `scenes.js` (in that order) into `dist/earthvanguard.html`,
and `src/26_cutscenes.js` decides when each one plays (`SL.cutscenes.play(id)`). Rebuild after any edit:

```sh
python3 tools/build.py
```

To preview one cutscene inside the game, add `?cutscene=<id>` to the game's URL, for example
`dist/earthvanguard.html?cutscene=puff_intro`. `demo.html` still works on its own for quick text edits.

## Art

Character language, so every scene reads the same:

- **Blue Arrow**: dark silhouette, blue scarf, blue rim light, blue streak in her bob
- **Best friend**: ponytail, amber scarf
- **Enforcers**: tall hats, glowing red visors
- **The Overseers**: the giant red eye
- **Puff**: orange pufferfish with flight goggles, in a water bubble when he's out of the ocean

Each scene is a function in `art.js` that returns an SVG (1600×900, cropped to fit the screen). Reuse the helpers (`person`, `guard`, `puff`, `vship`, `eye`, `planet`...) to add new ones. `Cutscene.play(...)` also still accepts `img:` shots if someone paints a proper illustration later.

## Editing the script

Open `scenes.js`. Every cutscene is a list of shots; every shot is a background + optional drawing + lines. Placeholder names (the enemy civilization, the subject number, etc.) are at the top in `N` — rename them there. Field reference is in the comment header.

Backgrounds available: `stars`, `void`, `sonar` (Echo rings), `facility`, `burn`, `ocean`, `polluted`, `collapse`, `black`.
