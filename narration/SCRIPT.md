# Narration recording script

Every line of story narration in Earth Vanguard, ready to record. Record each **clip** as its own audio file, name
the file with the clip's id (for example `echo_intro.wav`), and put it in [`audio/`](audio/).

Every clip matches text the game shows on screen, so **read the text exactly as written**: the subtitles show
the same words.

## Voices

| Voice | Who reads it | Direction |
|---|---|---|
| **Narrator** | Most clips, and the cutscenes | Calm, warm, a little hushed. A storyteller, not a movie trailer. Unhurried. |
| **Blue Arrow** | Her memories in Echo (section 3) and her cutscene lines | First person, quiet, young woman. Remembering, not performing. |
| **Puff** | His thoughts in the memory (section 5) and his cutscene lines | Small, tired, brave. Half to himself. |
| **The Directorate** | The voice over Puff's trial (section 5) | Cold, slow, polite, from everywhere at once. Never raises its voice. |
| **Commander Kade** | His lines in the cutscenes | British, male. Calm, clipped, decisive. Never shouts. |
| **Robot** | The red computer printouts in the cutscenes (`SUBJECT 7 // ...`) | Flat, mechanical, a facility system reading a status. |

One person can read every part; different voices for Blue Arrow, Puff and the Directorate just make it better.

## How to record

- **One clip per file**, named with the clip id: `echo_intro.wav`, `puff_intro.wav` and so on.
- **WAV** is best. A high-quality MP3 or a phone voice memo (M4A) also works; we will convert and compress them.
- A quiet room, the mic or phone about a hand's width from your mouth, and soft things around you (a closet full of
  clothes is a great booth). Turn off fans and notifications.
- Leave about half a second of silence before and after each clip.
- Record 2 or 3 takes of each clip and keep the best one. Mistakes are fine; just restart the line.
- Lengths are estimates at a relaxed reading pace. A few clips have a **hard limit** because they play over gameplay
  on a timer; those are marked.

---

## 1. Story cutscenes

The cutscenes' spoken lines are not listed here: they come straight from the cutscene script,
`cutscenes/earth-vanguard-cutscenes/cutscenes/scenes.js`, so the voice always matches the words on screen. To see
them with their clip ids and voices, run `node tools/cutscene_lines.js`. `tools/narrate.py` generates them along
with the clips below.

## 2. Echo: Blue Arrow's escape

The Echo minigame. These match the text already on screen. **Voice: Narrator.**

| Clip | Plays | Text | Length |
|---|---|---|---|
| `echo_intro` | Echo's start screen | Blue Arrow has never seen the sky. All she remembers is Cell 7, deep inside a facility run by the Directorate, an arm of a civilization far older than ours, and the experiments. They left her one gift: she can see with sound. Tonight the power failed. The doors are dead, the halls are dark, and this is her chance. | 22 s |
| `echo_free` | She reaches the surface | The hatch gives way to cold air and more sky than she has words for. Behind her the alarms fade into the hum of the facility. She doesn't look back. Her name is Blue Arrow, and she is free. | 14 s |
| `echo_caught_1` | She is caught (rotates) | Lights. Hands on her shoulders. A voice says "Back to Cell 7." Not tonight. Try again. | 6 s |
| `echo_caught_2` | She is caught (rotates) | The drone's light pins her to the wall. She hears the guards coming. Try again. | 5 s |
| `echo_caught_3` | She is caught (rotates) | The alarm screams through the floor. She is not going back. Try again. | 5 s |

## 3. Echo: memory shards

Blue Arrow finds these hidden in the facility, two per floor, and speaks each one as she picks it up (tools/build.py
inlines the clips as window.ECHO_VO; src/24_echo.js plays them). The text stays on screen for the clip's length plus a
second, so aim for under 10 seconds each. **Voice: Blue Arrow** (first person).

| Clip | Text | Length |
|---|---|---|
| `echo_memory_1` | Subject 7. That is what the clipboard said. Someone called me something else, once. | 5 s |
| `echo_memory_2` | The tests were always the same: a dark room, a tone, a wall I had to find without touching it. | 6 s |
| `echo_memory_3` | They never told me what I was for. Only that I was improving. | 4 s |
| `echo_memory_4` | A screen was left on in the lab once. Blue, with white shapes drifting across it. I think it was the sky. | 6 s |
| `echo_memory_5` | The reactor floors hum all night. I learned the shape of every hall from that hum. | 5 s |
| `echo_memory_6` | They gave me a number so I would forget my name. I never did. My name is Blue Arrow. | 6 s |

## 4. Puff's Ocean

The start screen of the Puff's Ocean minigame. **Voice: Narrator.**

The on-screen text matches this recording word for word.

| Clip | Text | Length |
|---|---|---|
| `puff_intro` | Puff flies beside the jet in a water bubble, but he is not from Earth. His home was an ocean world, coral and light, until the corporations bled it dark. Then the Directorate chose it for one of their games: survive the trials, and win the power to heal your world. These are the trials, the way Puff remembers them. | 20 s |

## 5. Mission 1: "The First Trial" (Puff's memory)

In Mission 1, a black hole pulls Puff in and he relives his first trial. The narration plays before and after it;
the Directorate and Puff speak **during** the 45-second swim, each line at a set second.

**Before the trial · Voice: Narrator**

| Clip | Text | Length |
|---|---|---|
| `memory1_intro_1` | Past the horizon the stars go quiet, and Puff is home again. | 4 s |
| `memory1_intro_2` | His ocean world was coral and light once, until the corporations bled it dark. Then the Directorate came, and they called it a game: survive our trials, and we will give you the power to heal your world. | 13 s |
| `memory1_intro_3` | He was the only one who could breathe that water long enough. Nobody asked him if he wanted to play. | 6 s |

**During the trial** · each line is on screen for 4.5 seconds, so **keep each under 4 seconds**.

| Clip | At | Voice | Text | Length |
|---|---|---|---|---|
| `memory1_voice_1` | 1 s | The Directorate | Subject accepted. The first trial begins. | 3 s |
| `memory1_puff_1` | 6 s | Puff | I never said yes. Nobody asked. | 2 s |
| `memory1_voice_2` | 11 s | The Directorate | Your world is watching, little fish. | 3 s |
| `memory1_voice_3` | 22 s | The Directorate | Survive our trials and your sea will be healed. That is our promise. | 4 s (hard limit) |
| `memory1_puff_2` | 28 s | Puff | Keep swimming. For the reef. For everyone. | 3 s |
| `memory1_voice_4` | 34 s | The Directorate | Faster. | 1 s |

**After the trial**

| Clip | Voice | Text | Length |
|---|---|---|---|
| `memory1_end_1` | The Directorate | Subject survives. Proceed to trial two. | 3 s |
| `memory1_end_2` | Narrator | There were more trials. There was always one more. | 4 s |

---|---|---|
| `ending_01` | Two survivors who once struggled to save themselves now fight to save others. | 5 s |

---

**Total:** 23 clips here (Echo, Puff's Ocean and Mission 1), plus the cutscene lines.
