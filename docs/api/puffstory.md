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
| Trust | m1's old beacon choice is replaced: once Puff has said his piece (`talkReady`, about 6 s after waking), the pilot chooses: **Ask what he saw** ("Not now. Please.") or **Give him space** ("...Thanks, {callsign}. I owe you one.", `save.flags.puff_trust` +1). Only asked if the memory happened. |

Music ([audio.md](audio.md)): while the black hole is near, Mission 1 plays `mus_m2`, a far-off choir singing the
song Puff knows; inside, the memory plays `mus_memory`, the same song underwater, built up by `progress` through the
trial, double-time at "FASTER." (`urgency`) and resolving to a major chord when he survives (`done`). It sinks under
the narration and the Directorate's voice. Waking up hands the mission's track back, and m1 returns to `mus_m1` after
the trust choice.

**Skip memory** is offered in the pause menu, on a failed trial, and in the intro once the memory has been seen
(`save.flags.puff_memory1`). Finishing or skipping sets `unlock_puff` (Puff's Ocean on the title screen).
Autopilot, `SL.debug.sim` fast-forward and the in-page tests skip the memory: Puff is pulled in and comes
straight back, so smoke runs never stall.

## Public surface

- `SL.puffStory.spawnBuddy()`, `.buddy` (the ally entity), `.state` (`off | aboard | pulled | inside`).
- `SL.puffStory.blackHole()`: the timeline hook above. `memoryDone`, `talkReady`, `trustReply(choiceId)` and the
  story choice `puff_trust1` drive the trust beat.
- `SL.puffStory.memoryScenario(onDone)`: the scenario object handed to `SL.puff.openScenario` (see
  `docs/api/puff.md`).
- Radio character `puff` (`SL.story.characters.puff`), portrait drawn with `SL.puff.drawBuddy`.
- Mission def flag `puffBuddy: true`; pause reason `'story'` in `21_game.js` (pauses without the pause menu).

## Mission 4: Puff knows the ship

In Sunbreak (`m4`, `src/18_missions.js`) the Directorate's harvester SUNEATER is draining the blue giant Tarsis. No
memory sequence this time: Puff tells it himself, as far as he trusts the pilot.

| Beat | What happens |
|---|---|
| Open | Puff: "That light is wrong. Stars don't flicker like that." |
| Eclipse (about 56 s) | The breather. In the dark Puff sees the harvester at the end of the plasma stream: "...I know that ship." / "One like it hung over our sun for a year. Then our sea went cold." The music drops to a heartbeat and Puff's theme (`mus_m4`'s `eclipse` mood). |
| Trust choice `puff_trust2` | Waits until he has finished speaking (`SL.story.idle()`), then: **We stop this one. Together.** (+1 trust, he brightens) or **Eyes forward. Grieve later.** (no change). Before the checkpoint, so a retry doesn't ask again. |
| Ixa | If her pod is caught, Puff: "She built them? ...Fine. She rides in the back. Way in the back." During the boss she explains its weak point (the mirrors). |
| Regroup | Trust 2 or more: "Our sun was small and gold. They drank it in a year. Burn that thing for me?" Otherwise: "Just burn it. Don't ask me why." |
| Boss intro | The Overseers: "SUNEATER drinks a star. You are a smaller meal. We remember you, little fish." Puff: "They remember me. Good. Then they'll remember this." |
| Win | Trust 2 or more: "Tarsis keeps its light. Mine didn't. ...Thank you, {callsign}." Otherwise: "One harvester down. However many to go." |

Trust can reach 3 by here: the warm answer in `puff_intro`, giving him space in Mission 1, and staying with him in
Mission 4. The helpers `SL.puffStory.trust()`, `addTrust(n)` and `react(mood, seconds)` are there for later
missions' beats.
