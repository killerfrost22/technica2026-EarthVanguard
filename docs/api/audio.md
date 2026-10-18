# Audio (`src/03_audio.js`)

Every sound is synthesized with WebAudio at runtime; there are no audio files (the narration clips are the only
recordings, and they play through `<audio>` elements in the story modules). This page covers the public surface, the
mix, and the music: which track plays where, and the mood values tracks react to.

## API

- `SL.audio.unlock()`: creates or resumes the AudioContext. Core calls it on the first pointer or key gesture; the
  track that was asked for before then starts as soon as the context runs.
- `SL.audio.sfx(id, {vol, pitch, pan, x})`: a one-shot effect; `x` (0..720) pans it. Unknown ids warn once.
- `SL.audio.loop(id, {vol, x, pan}) -> {set({vol, pitch, x, pan}), stop(fade)}`: a continuous sound (hazard hums,
  the lance beam).
- `SL.audio.music(trackId, {fade = 1, mood, restart, bar})`: crossfades to a track; the same track keeps playing
  unless `restart`. `mood` sets mood values with it; moving to a different track clears the old track's moods.
  Aliases: `m1` = `mus_m1`, `boss` = `mus_boss`, `blackhole` = `mus_m2`.
- `SL.audio.stopMusic(fade)`.
- `SL.audio.mood(name, value)`: a live value (0..1, `null` removes it) that the playing track reads as it schedules
  notes. See the table below for what each track listens to.
- `SL.audio.duck(amount, seconds)`: lowers the music for a while (radio lines use it).
- `SL.audio.hush(key, amount)`: holds the music down by `amount` (0..1; 1 = silent) until `hush(key, 0)`. Several
  hushes can be on at once; the deepest wins. Keys in use: `cutscene_voice`, `memory_voice`, `echo_voice` (narration
  is speaking), `echo_pause`, `puff_pause` (a minigame's pause menu) and `puff_mic` (Puff's Ocean's microphone is open:
  music off, so the mic never hears it as the player).
- `SL.audio.setVolumes({master, music, sfx})`; `ready`, `muted` (`?mute=1`), `current` (the track id), `ids()` (sfx
  and loops), `tracks()` (music).
- `SL.audio.render(trackId, seconds, mood) -> Promise<{id, peak, rms, windows}>` (debug): renders a track offline,
  never to the speakers, for level checks. `mood` is an object or a function of the time in seconds;
  `SL.audio.lastRender` keeps the AudioBuffer.

## Mix

master -> compressor (-18 dB, 4:1) -> speakers. The SFX bus has a short room reverb and the music bus a longer, darker
hall; both return into their own bus, so the SFX and music volume settings cover the tails too. The music bus then
goes through a duck stage (radio lines, the mission pause menu, hushes).

Each track gets its own buses: `drums`, `pumped` (ducked by every kick, so synths breathe with the drums), `lead` and
`pad` (with reverb sends: `def.leadVerb`, `def.padVerb`), an optional tempo-synced echo (`def.echo = {steps,
feedback, mix, lp}`), and its fader (`def.gain`). `def.steps` sets the bar length in 16ths (12 for the 3/4 waltz).

## Music by stage

| Track | Where it plays | Mood | Tempo, key | Reads |
|---|---|---|---|---|
| `mus_title` | Title screen | Heroic, hopeful: the Earth Vanguard theme | 96, D minor | |
| `mus_overseers` | Prologue (`theme_dark`, `theme_fire`) | Vast, cold, menacing: choir over a D pedal, a tolling bell | 66, D phrygian | `intensity`: war drums |
| `mus_echo` | Prologue's cell and power failure (`theme_echo`), Echo | Dark, stealthy: pad, sonar pings, her motif | 80, A minor | `tension`: heartbeat, clock, cluster |
| `mus_free` | Echo's escape screen, `echo_complete` (`theme_free`) | Open air, relief | 72, E major (Lydian) | |
| `mus_hope` | `echo_complete`'s ending, Vanguard cutscenes (`theme_hope`) | Resolve: the title theme in major | 84, D major | |
| `mus_puff` | `puff_intro` (`theme_puff`) | Gentle, wistful music-box waltz | 104 (3/4), F major | |
| `mus_m1` | Mission 1 | Bright, heroic | 140, E minor | |
| `mus_m2` (`blackhole`) | Mission 2; Mission 1 while the black hole is near | Eerie: the song the black hole sings | 128, C minor | |
| `mus_m3` | Mission 3 | Urgent, stormy: distorted bass, stabbing chords, rolling toms, thunder swells | 150, A minor | |
| `mus_memory` | Puff's memory, The First Trial | Underwater sorrow, the Directorate watching | 92, C minor | `progress`, `urgency`, `done` |
| `mus_boss`, `mus_miniboss`, `mus_boss_heavy` | Bosses (`mus_boss_heavy`: Mission 3's TEMPEST) | Menacing | 155 / 150 / 150 | |
| `mus_victory` | Results | Triumphant fanfare, then calm | 120, C major | |
| `mus_fail` | Failed screen, after the fail sting | Somber | 70, A minor | |
| `mus_grief` | `puff_complete` (`theme_grief`) | Grief: Puff's theme turned minor | 64, D minor | |
| `mus_ocean` | Puff's Ocean, keys and touch (silent while the mic is open) | Bubbly, buoyant | 108, F major | |

The black hole's song is the same tune in `mus_m2` (a far-off choir) and `mus_memory` (the trial), which is why Puff
says he knows it. Puff's theme from `mus_puff` comes back on vibes in `mus_ocean`, on a bell in `mus_grief`, and as
the reef remembers it in `mus_memory`.

Who starts what: this module plays the title theme whenever the title screen shows, victory on a mission win and the
fail sting into `mus_fail` on a loss; missions play `def.music`, `def.bossMusic` and timeline `music` events;
`src/26_cutscenes.js` maps the cutscene script's `music` cues (table above) and `sfx` cues (`fire`, `alarm_low`,
`power_down`, `engine`, `explosion`, `distress`, plus `flash`) onto tracks and `cs_*` effects; Echo, Puff's Ocean and
Puff's memory start their own tracks and set their moods.

## Adding a track

Add a `{bpm, play(m, step, t)}` entry to `TRACKS` (note data as midi lists next to the others). `play` runs once per
16th, slightly ahead of the audio clock: schedule notes at time `t` with the voices (`lead`, `horn`, `strings`, `warm`,
`celesta`, `epiano`, `marimba`, `vibes`, `glass`, `choir`, `bass`, `round`, `kick`, `snare`, `hat`, `timp`, `heart`,
and the storm kit `grit`, `stab`, `tom`, `thunder`, ...). Read moods from `m.mood`. Then check its level against `mus_m1` with `SL.audio.render(id, 40)` and set
`def.gain`: action tracks sit near `mus_m1`, cutscene themes about 5 dB under it so narration sits on top, and
`mus_echo` lowest so Echo's own pings stay the loudest thing. The developer panel's Music section plays any track
and drives the mood values with its slider.
