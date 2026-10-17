# Puff's story (`src/25_puffstory.js`)

Puff is a pufferfish from an ocean world. Corporations poisoned it; then the Directorate (the same power that
holds Subject 7 in Echo) chose it for one of its games: survive the trials and win the power to heal your home.
Puff won. His world was destroyed anyway. Now he flies with Earth Vanguard in a water bubble tethered to the
jet. Unlike the pilot, he remembers everything and won't talk about it; his past comes out one memory at a time.

## Memory 1: The First Trial (Mission 1)

| Beat | What happens |
|---|---|
| Launch | Missions with `puffBuddy: true` (m1) spawn Puff's bubble trailing the jet on a dashed tether. Puff checks in on the radio. |
| Black hole | m1's timeline spawns a real `black_hole` (medium) where the stub had `test_blackhole`, then at director time 31 calls `SL.puffStory.blackHole()`: Puff says he knows the black hole's song. |
| Snap | 2.2 s later the tether snaps (sparks, shake). Puff spirals into the horizon over 2.6 s, stretching as he falls. Nothing the player does can stop it. |
| Inside | A flash and slow-mo, then `SL.game.pause('story')` (no pause menu) and Puff's Ocean opens in scenario mode: a narrated intro, then a 45 s trial in his home sea with a violet cast, the Directorate's voice ("Your world is watching, little fish") and Puff's thoughts. |
| Fail | Losing all hearts: "That's not how it happened. He didn't fail. He couldn't. Again." (hands-free: hum to retry). |
| Wake | Surviving 45 s: "Subject survives. Proceed to trial two. There were more trials. There was always one more." **Wake up** resumes the mission, clears stale radio lines, and the jet hauls the bubble back into formation. Anvil: "Got him!" Puff: "...I'm okay. Don't ask. Not yet." |

**Skip memory** is offered in the pause menu, on a failed trial, and in the intro once the memory has been seen
(`save.flags.puff_memory1`). Finishing or skipping sets `unlock_puff` (Puff's Ocean on the title screen).
Autopilot, `SL.debug.sim` fast-forward and the in-page tests skip the memory: Puff is pulled in and comes
straight back, so smoke runs never stall.

## Public surface

- `SL.puffStory.spawnBuddy()`, `.buddy` (the ally entity), `.state` (`off | aboard | pulled | inside`).
- `SL.puffStory.blackHole()`: the timeline hook above.
- `SL.puffStory.memoryScenario(onDone)`: the scenario object handed to `SL.puff.openScenario` (see
  `docs/api/puff.md`).
- Radio character `puff` (`SL.story.characters.puff`), portrait drawn with `SL.puff.drawBuddy`.
- Mission def flag `puffBuddy: true`; pause reason `'story'` in `21_game.js` (pauses without the pause menu).
