# Cutscenes

Story cutscenes that play before the player flies. Write one file per cutscene here; they will be wired into
the game later (the in-game story code lives in `src/16_story.js`).

## When each cutscene plays

| File | Plays |
|---|---|
| `00_opening.md` | Once, the first time a player presses Start on a new save, before Mission 1 |
| `m1_first_light.md` ... `m5_nightfall.md` | Before that mission's briefing |
| `s1_lantern_run.md` ... `s4_seed_of_night.md` | Before that side story's briefing |

Name files `<mission id>_<title in snake_case>.md`, using the mission ids from `docs/GDD.md` (section 3.2).

## Format

Copy `_template.md` to start a new one. Each cutscene is a list of **shots**. A shot has a background, an
optional caption, and the lines spoken during it.

- Speakers use the character ids from `docs/GDD.md` section 2: `anvil`, `sparrow`, `patch`, `vael`, `tamsin`,
  `osei`, `rook`, `ixa`, `p1`, `p2`, and `puff`. Use `narrator` for text with no speaker.
- Keep each line to 90 characters or less so it fits the radio box.
- `{callsign}` becomes the player's callsign (default LANCE); `{callsign2}` is player 2 (default EMBER).
- Mark a line `(co-op)` to show it only in two-player games.
- Players can always skip a cutscene, so nothing required to understand a mission should live only here.
