# STARLANCE — Game Design Document (draft: story, choices and progression lens)

Version 0.9 draft. Built on `docs/ARCHITECTURE.md` (engineering contract). All ids are lowercase
snake_case and are collected in section 20. Numbers are tuned for Pilot difficulty unless noted;
`SL.game.diff` multipliers apply on top. Text tokens `{callsign}` (P1) and `{p2callsign}` (P2) are
replaced by the story module; `{p2callsign}` is a small documented extension of `SL.story` (16_story.js).

Conventions used below:
- Times in wave scripts are director-clock seconds (the clock stops during `waitClear`, `boss`, `choice`).
- `x` is logical px across the 720-wide field; `y < 0` means above the screen.
- "Radio line" copy is final and at most 90 characters.
- Colors are hex. Sizes are logical px (720×1280 playfield).

## 1. Pitch and tone

**Pitch.** The Vanta Armada does not conquer worlds. It feeds them to black holes. Its engine, the
Maw, has already swallowed one star and is drifting toward the Lyra Reach, home to twelve million
people. Between them stands one battered carrier, the UNS Halcyon, and one jet that came off the
assembly line this morning: the XF-9 Starlance. You fly it. STARLANCE is a glossy vertical shooter
where you carve through swarms of enemy jets with glowing lasers, scoop drifting escape pods out of
the crossfire, and fight five huge multi-phase bosses while black holes bend the battlefield around
you. Between missions, a crew you will actually like patches the jet, spends your hard-won credits,
and pulls you into four side stories where one radio decision decides what kind of pilot you become.

**Tone.** Saturday-morning space opera with real stakes. Short, warm, funny radio banter over
gorgeous chaos. The Armada is eerie and quiet; the humans are loud, scrappy and kind. Nobody
monologues. Every story beat fits in a briefing card or a radio line, and the shooting never stops
for long. Victories feel earned; rescues feel personal.

**What makes it feel like Lightning Fighter.**
- Portrait 9:16 screen, the jet low on screen, relative drag control on touch, auto-fire on.
- A constant firehose of shiny jets that pop in bright, chunky explosions and shower gold crystals.
- Weapon pickups that visibly transform the jet's firepower within seconds (twin lasers to a wall of
  light), with five readable levels per weapon.
- Big, glossy metal bosses that fill the top half of the screen, with breakable parts, a health bar
  with phase marks, and a slow-motion death in a chain of explosions.
- Between missions: an upgrade hangar where credits buy armor, fire rate and new weapons, so every
  run makes the jet stronger.
- STARLANCE adds black holes that bend bullets, rescue pods worth fighting for, side stories with
  choices, a skill tree, and couch co-op.

## 2. Characters

The player pilots are silent. P1 is `{callsign}` (default `LANCE`), "Lance One", in the XF-9
Starlance. P2 is `{p2callsign}` (default `EMBER`), "Lance Two", in the gold-and-graphite XF-9B.
Every other speaker below has a procedural portrait drawn by `SL.story.characters[id].portrait(ctx,
w, h, t, talking)` at 96×96 logical px (radio box) and 240×240 (briefing card).

Portrait recipe (shared): rounded-square frame 6 px radius; background is a vertical gradient of the
character's two background colors plus 14 faint horizontal scanlines (alpha 0.06) scrolling down at
12 px/s; head and shoulders built from ellipses and rounded rects with `SL.art.metal` on helmets;
light from the upper left; a 1 px rim light on the right edge in the character color. While
`talking`, the mouth (a 10×3 px rounded rect) opens to 10×6 on a 7 Hz square wave with 30% jitter,
and the comm LED blinks. Idle: blink every 3-5 s (eyelids close over 80 ms), 1.5 px head bob at
0.3 Hz. Static burst on line start: 120 ms of horizontal tearing (3 random slices offset ±6 px).

| id | Name | Callsign | Role | Color |
|---|---|---|---|---|
| `anvil` | Commander Ines Okafor | ANVIL | Commanding officer, UNS Halcyon | `#ffd34d` |
| `sparrow` | Lt. Juno Reyes | SPARROW | Wingmate, flies flank in a Kestrel interceptor | `#ff9a3d` |
| `torque` | Chief Mags Ferro | TORQUE | Chief mechanic, Halcyon hangar | `#ff6a3d` |
| `oldiron` | Capt. Petra Halvorsen (ret.) | OLD IRON | Retired ace, the XF-9's first test pilot; VIP of m1, lead of s1 | `#9fb07a` |
| `anand` | Dr. Lio Anand | DOC | Astrophysicist, gravity researcher; VIP of m2, lead of s2 | `#b26bff` |
| `mercy` | Capt. Nadia Kessler | MERCY | Captain of the hospital ship Saint Brigid; VIP of m3, lead of s3 | `#5dffb0` |
| `cipher` | Sera Vell | CIPHER | Vanta Armada pilot who defects; VIP of m4, lead of s4 | `#ff5c8a` |
| `hound` | HOUND | HOUND | Old targeting AI aboard the wreck Valkyrie (s1, option `wake_hound`) | `#ff3b4f` |
| `sable` | Hierarch Sable | SABLE | Leader of the Vanta Armada; speaks at boss intros | `#b26bff` |
| `archon` | Wing Leader Rook Valen | ARCHON | Vanta ace, Cipher's old squadron leader; s4 mini-boss | `#ff3b4f` |

### `anvil` — Commander Ines Okafor, ANVIL
- **Radio personality:** calm, clipped, decisive. Short sentences, dry humor, never shouts. Gives the
  objective, then trusts you. Saves praise for when it counts, which makes it count.
- **Sample:** "Good. Now do it again, faster."
- **Portrait:** no helmet. Oval face, deep brown skin `#6b4430` with a highlight `#8a5a40` on the
  upper-left cheek; close-cropped silver hair `#d9dde4` as a rounded cap; strong straight eyebrows
  `#2a2a2a`; eyes two 6×3 px dark ellipses with a 1 px white glint. Headset: a `#9aa4b8` metal band
  over the hair, an ear cup on the left, and a boom mic curving to the mouth with an amber LED
  `#ffd34d` that blinks while talking. Navy collar `#1b2a44` with two gold pips `#ffd34d`. Background
  gradient `#0d1b2e` → `#06101c` with a faint cyan holo-table glow `#3fc8ff` (alpha 0.15) from below.
- **Radio chirp `chirp_anvil`:** two square-wave beeps, 990 Hz then 740 Hz, 45 ms each, 20 ms gap,
  through a 1.8 kHz bandpass (Q 2) for a radio sound.

### `sparrow` — Lt. Juno Reyes, SPARROW
- **Radio personality:** fast, bright, teasing, fearless. Gives nicknames, laughs at near misses,
  hums when she's nervous. Calls out targets and pods. Gets serious exactly once per mission.
- **Sample:** "Ha! That one nearly parted your hair. Do it again, I wasn't watching."
- **Portrait:** white flight helmet `#e8eef7` (metal shading) with an orange stripe `#ff9a3d` over the
  crown and a small sparrow decal (three-triangle bird, `#ff9a3d`) on the side. Visor up: an amber
  shell `#ffb53f` at 35% alpha above the brow. Face warm tan `#c68a5e`, six freckle dots `#9a6440`,
  a big grin (mouth 12 px wide). A dark ponytail `#2a1d1a` swings out below the helmet (rotates ±0.08
  rad at 0.6 Hz). Background `#2a1606` → `#120a04` with orange cockpit lights.
- **Radio chirp `chirp_sparrow`:** rising triangle-wave chirp 600 → 1400 Hz over 90 ms, plus one
  quiet echo 110 ms later at 40% volume.

### `torque` — Chief Mags Ferro, TORQUE
- **Radio personality:** gruff, proud, practical. Loves the jet, calls it "the bird" and "she".
  Explains pickups and hazards in one plain sentence. Scolds you for damage, cheers loudly for upgrades.
- **Sample:** "You scratched her. I felt that. Grab the green cross and I'll forgive you."
- **Portrait:** broad square face, pale `#e7b99a` with a grease smudge `#2b2f3a` on the right cheek;
  short cropped red hair `#c2452d`; welding goggles pushed up on the forehead (two 14 px circles,
  lenses `#ffb53f` with a white glint, strap `#3a3f55`); thick neck; grey work collar `#5a6070` with a
  hex-bolt patch. A big wrench silhouette `#2b2f3a` leans in the background. Background `#2a1a12` →
  `#120a06` with a warm hangar lamp glow `#ff6a3d` (alpha 0.18) at the upper left.
- **Radio chirp `chirp_torque`:** low sawtooth burble 220 Hz with 12 Hz amplitude wobble for 110 ms,
  then two 15 ms noise clicks (highpass 3 kHz).

### `oldiron` — Captain Petra Halvorsen (ret.), OLD IRON
- **Radio personality:** slow, wry, old-school. Calls you "kid". Tells one-sentence war stories at the
  worst moments. Under the grit, she's proud of you and protective of her old ship.
- **Sample:** "Kid, I flew this exact maneuver in '61. I also crashed. Don't copy the ending."
- **Portrait:** vintage flight helmet olive-grey `#5b6450` with scratched paint (8 short `#8a9178`
  strokes) and three white kill stripes on the side; visor up, smoky `#3a3f35`. Lined face, light
  `#e9c9b0`, three crow's-feet lines per eye, a thin scar `#c99a86` across the left cheek; a white
  braid `#e8e4dc` over the right shoulder. Leather collar `#5a3a24`. Background `#1e2418` → `#0c0f0a`.
- **Radio chirp `chirp_oldiron`:** old analog sound: sine 520 Hz with 6 Hz vibrato (±15 Hz) for
  130 ms, layered with a 90 ms vinyl-crackle noise burst (bandpass 2.5 kHz, random 30 ms gating).

### `anand` — Dr. Lio Anand, DOC
- **Radio personality:** excited, nerdy, kind, a little breathless. Explains gravity in kitchen
  words ("like water down a drain"). Apologizes often. Brave when it matters.
- **Sample:** "Sorry, sorry! Gravity is pulling your bullets. Aim a little past them!"
- **Portrait:** no helmet. Round face, brown skin `#8d5a3b`, curly black hair `#1d1a22` as six
  overlapping circles; round glasses (two 16 px rings `#cfe8ff`, lenses with a diagonal white glare at
  30%); a soft smile. Lab collar `#e8eef7` with a violet orbit sigil `#b26bff` (a circle with an
  ellipse through it). A tiny hologram of two orbiting dots rotates beside his head (0.5 rev/s).
  Background `#1a1030` → `#0a0614`.
- **Radio chirp `chirp_anand`:** three ascending sine blips 660, 880, 1100 Hz, 30 ms each, 10 ms gaps.

### `mercy` — Captain Nadia Kessler, MERCY
- **Radio personality:** steady, warm, unshakable. Talks about "my people" and counts them. Thanks
  every pilot by name. Never panics, which is why everyone listens to her.
- **Sample:** "Three hundred and eighty-one patients. All still breathing. Thank you, Lance One."
- **Portrait:** white EVA hood `#f2f5f8` (soft metal shading) with a green chevron sigil `#5dffb0` on
  the brow (no red cross); clear visor shown as a faint arc highlight. Dark skin `#4e3326`, short locs
  `#1f1410` framing the face, calm almond eyes, a small gold earring `#ffd34d`. Background `#0d2a22` →
  `#06120e` with soft green medical lights.
- **Radio chirp `chirp_mercy`:** two soft sine notes 523 Hz then 659 Hz, 70 ms each, into a long
  1.2 s reverb tail at 25%.

### `cipher` — Sera Vell, CIPHER
- **Radio personality:** clipped, guarded, precise. Corrects people. Never says thank you, then says
  it once and means it. Knows every Armada trick and tells you in one line.
- **Sample:** "Their aces jink left when you fire. Lead them right. You're welcome."
- **Portrait:** angular Vanta pilot helmet in `#1c1f2b` with crimson seam lines `#ff2f6d` along the
  crest and jaw; a mirrored violet visor `#b26bff` with a moving specular streak and one jagged crack
  line `#e8eef7`. After s4 option `fly_together` the visor slides up (on later lines): pale face
  `#d8c3c0`, white undercut hair `#f0eef2`, a thin dark line under one eye. Background `#1a0a14` →
  `#0a0408` with a red warning light pulsing at 0.5 Hz.
- **Radio chirp `chirp_cipher`:** bit-crushed digital stutter: three 20 ms square pulses at 1760 Hz,
  sample-and-hold to 4 kHz, with a 5 ms gap between pulses.

### `hound` — HOUND targeting AI
- **Radio personality:** monotone, literal, oddly loyal. Speaks in short status phrases. Calls the
  player "PILOT". Appears only in s1 after option `wake_hound` and in the epilogue.
- **Sample:** "TARGET PRIORITY ASSIGNED. PILOT, THE LARGE ONE IS ANGRY."
- **Portrait:** a dark steel panel `#1a1d26` with rivets; a single round red lens `#ff3b4f` (28 px)
  with three concentric rings that rotate in alternate directions; the lens pulses brighter with
  each syllable instead of a mouth. Background `#140808` → `#060303`.
- **Radio chirp `chirp_hound`:** three sine pings 1320 Hz, 25 ms each, 60 ms apart, with a
  descending 2400 → 800 Hz sweep beneath them.

### `sable` — Hierarch Sable, SABLE
- **Radio personality:** cold, calm, poetic. Speaks of "the quiet" and "the long dark". Never
  threatens directly; calls people "small lights". Speaks only at boss intros and in m5.
- **Sample:** "Every light goes out, small one. I only make it gentle."
- **Portrait:** no face. A tall crown-like helmet of black obsidian `#0b0b12` with gloss highlights
  `#3a3f55` and a thin violet halo ring `#b26bff` floating behind it (slow rotation, 0.1 rev/s); a
  single vertical visor slit of pink-white light `#ff5c8a` → `#ffffff` that brightens while talking.
  Background `#120018` → `#000000` with a faint accretion-ring arc.
- **Radio chirp `chirp_sable`:** 55 Hz sine swell over 300 ms plus a reversed noise whoosh
  (lowpass sweep 400 → 4000 Hz), no beeps.

### `archon` — Wing Leader Rook Valen, ARCHON
- **Radio personality:** arrogant, sporty, taunting. Treats the fight as a game he always wins.
  Hates Cipher for leaving. Speaks only in s4.
- **Sample:** "Cipher brought a friend! I'll make it quick. For old times' sake."
- **Portrait:** Vanta helmet `#3a3f55` with two swept horn fins, a red visor `#ff3b4f` with a sharp
  chevron shape, and a gold stripe `#ffd34d` down the center. Background `#200808` → `#0a0202`.
- **Radio chirp `chirp_archon`:** harsh sawtooth stab at 330 Hz, 70 ms, through soft-clip distortion,
  then a 30 ms falling blip to 220 Hz.

Co-op note: when two players fly, `sparrow` moves from the XF-9B to her Kestrel, so the crew still
talks to both pilots by name (section 12).

## 3. Story

### 3.1 Premise
The Vanta Armada came out of the dark between stars. Its ships are black glass and crimson light,
and it never sends demands. It sends singularity seeds: small machines that bloom into black holes.
At its heart drifts the Maw, a ring-shaped engine the size of a moon that feeds whole stars into a
captive black hole and grows stronger with every meal. It has eaten the Teshar system. Next is the
star Elysia, and after that the Lyra Reach.

The United Lyra Fleet has one carrier close enough to matter: the UNS Halcyon, still bolted into the
Vesper Yards for repairs, with one finished prototype in its hangar, the XF-9 Starlance. You are
`{callsign}`, the test pilot nobody has heard of yet. Five missions take you from the burning yards to
the Maw itself. Along the way you pull people out of the wreckage, and four of them pull you into
their own stories.

Story delivery is light by design: a 2-4 line briefing card before each mission, radio lines during
play (never pausing the action, except for the one choice dialog per side story), and a short ending.

### 3.2 Briefing card format
`SL.story.briefings[missionId] = { title, location, lines:[{who, text}], objectives:[{id, text}] }`.
The card shows the location art (the mission background's first phase, slowly panning), the title in
Oxanium, each line with its speaker's portrait (typewriter, 45 chars/s × `radioSpeed`), then the
objective list. Buttons: `LAUNCH` and `HANGAR`. Bonus objectives pay 150 credits each, every play.

### 3.3 Main mission briefings

**m1 — FIRST LIGHT.** Location: Vesper Yards, orbit of the gas giant Vesper.
- `anvil`: "Vanta jets are tearing up the Vesper Yards. The Halcyon can't launch until the docks are clear."
- `torque`: "The XF-9 is fueled and armed. She's not broken in yet, so be gentle with her."
- `anvil`: "Clear the yards and pull anyone floating out there to safety. Launch when ready."
- Objectives: `m1_obj_boss` "Destroy the assault cruiser RAVAGER" · `m1_obj_vip` "Bonus: rescue Captain
  Halvorsen's pod" · `m1_obj_pods` "Bonus: rescue 12 people"

**m2 — THE UNDERTOW.** Location: the Hadal Drift, a shipping lane full of wrecks.
- `anvil`: "The Armada seeded the Hadal Drift with black holes. Our refugee convoy is being pulled in."
- `sparrow`: "Gravity bends everything out there. Their shots, our shots, us."
- `torque`: "Stay out of the black circle in the middle. Nothing comes back out of that."
- Objectives: `m2_obj_boss` "Destroy the TIDECALLER" · `m2_obj_vip` "Bonus: rescue Dr. Anand" ·
  `m2_obj_pods` "Bonus: lose no more than 1 pod"

**m3 — CINDER'S EDGE.** Location: the mining colonies of Cinder, a dying red giant.
- `anvil`: "The Armada is stripping Cinder's colonies. They're making the star flare on purpose."
- `torque`: "When the flare alarm sounds, get behind a big rock. That light melts armor."
- `sparrow`: "The colonists are already in pods. Hundreds of them. Let's be quick."
- Objectives: `m3_obj_boss` "Destroy the SUNBREAKER" · `m3_obj_vip` "Bonus: rescue Captain Kessler" ·
  `m3_obj_pods` "Bonus: rescue 30 people"

**m4 — NEEDLE'S EYE.** Location: the Lattice, the Armada's wormhole relay.
- `anvil`: "This relay is how the Armada moves its fleet. Wormholes open here without warning."
- `torque`: "Whatever goes in one ring comes out the other. That includes your lasers. Use it."
- `anvil`: "Burn the relay and we cut the Maw off from its fleet."
- Objectives: `m4_obj_boss` "Destroy the WRAITH" · `m4_obj_vip` "Bonus: rescue the Vanta defector" ·
  `m4_obj_traps` "Bonus: rescue no trap pods"

**m5 — THE MAW.** Location: the Maw, eating the star Elysia.
- `anvil`: "The Maw is eating Elysia. When it's finished, it turns toward the Reach."
- `sparrow`: "Twelve million people behind us. No pressure, right?"
- `anvil`: "Get inside, find its heart, and put it out. Then bring my pilots home."
- Objectives: `m5_obj_boss` "Destroy THE MAW" · `m5_obj_pods` "Bonus: rescue 20 people" ·
  `m5_obj_lives` "Bonus: lose no lives in the final battle"

### 3.4 Side story briefings

**s1 — OLD IRON.** Location: the Ion Sea, wreck of the carrier Valkyrie.
- `oldiron`: "My old carrier, the Valkyrie, went down in the Ion Sea. Her weapons bay is still sealed."
- `oldiron`: "The Armada's prying it open. I'd rather you had what's inside, kid."
- `torque`: "Ion clouds short out shields. Stay out of the bright ones."
- Objectives: `s1_obj_reach` "Reach the Valkyrie" · `s1_obj_boss` "Destroy the ion gunboat STORMJAW" ·
  `s1_obj_nohit` "Bonus: take no lightning hits"

**s2 — EVENT HORIZON.** Location: Pallas Lab, between two black holes.
- `anand`: "My lab orbits two black holes. The Armada is stealing my gravity probe right now!"
- `anand`: "The probe can make a black hole, or calm one down. Please, help me get it back."
- `anvil`: "Two holes means two pulls. Watch your drift, Lance One."
- Objectives: `s2_obj_probe` "Recover the gravity probe" · `s2_obj_boss` "Destroy the salvage ship
  GRAPPLER" · `s2_obj_lab` "Bonus: keep the lab's 6 pods safe"

**s3 — MERCY RUN.** Location: the Caldera, a minefield past Cinder.
- `mercy`: "The Saint Brigid has four hundred patients aboard and a minefield in front of her."
- `mercy`: "Clear us a lane, Lance One. We can't turn and we can't stop."
- `torque`: "Shoot mines from range. They chain, so make that work for you."
- Objectives: `s3_obj_escort` "Get the Saint Brigid through the Caldera" · `s3_obj_boss` "Destroy the
  MINEMOTHER" · `s3_obj_hull` "Bonus: Saint Brigid hull above 50%"

**s4 — TURNCOAT.** Location: the Foundry, the Armada shipyard behind the Lattice.
- `cipher`: "I flew for the Armada. I know a back door into the Foundry, where they build the seeds."
- `anvil`: "If she's lying, you shoot her. If she isn't, you follow her."
- `cipher`: "My old wing leader will be waiting. ARCHON doesn't forgive."
- Objectives: `s4_obj_foundry` "Sabotage the seed foundry" · `s4_obj_boss` "Defeat ARCHON" ·
  `s4_obj_cipher` "Bonus: Cipher takes fewer than 3 hits"

### 3.5 Ending and epilogue
After m5's boss, the outro plays (jets fly up through the collapsing Maw), then `SL.ui.show('ending')`.

Ending card lines (in order):
1. `anvil`: "Halcyon to all wings. The Maw is dark, and Elysia is still shining."
2. `sparrow`: "We did it. We actually did it. Somebody tell me we did it."
3. `torque`: "Bring the bird home, {callsign}. I'm not fixing her out there."
4. `anvil`: "Twelve million people will sleep tonight and never know your name. I will."

Co-op adds after line 3: `sparrow`: "And {p2callsign}! Two of you. The Armada never stood a chance."

Epilogue cards: one per side story, chosen by `save.choices` (the most recent option chosen wins).

| Side story | Condition | Speaker | Copy |
|---|---|---|---|
| s1 | `rip_reactor` | `oldiron` | "The Valkyrie's reactor burns in your jet now. She'd like that. So do I." |
| s1 | `wake_hound` | `hound` | "HOUND NOW SERVES ABOARD HALCYON. PILOT REMAINS PRIORITY ONE." |
| s1 | not played | `oldiron` | "Halvorsen retired again. She says the next war belongs to you, kid." |
| s2 | `overcharge` | `anand` | "I'm writing a paper on the black hole you fired. It's mostly apologies." |
| s2 | `stabilize` | `anand` | "Pallas Lab is open again. We're teaching gravity to behave. Slowly." |
| s2 | not played | `anand` | "Dr. Anand is back at work. He still sends you very long messages." |
| s3 | `shield_ship` | `mercy` | "The Saint Brigid made port with every patient alive. We won't forget it." |
| s3 | `save_boats` | `mercy` | "Every lifeboat came home. The Brigid has new scars. She wears them well." |
| s3 | not played | `mercy` | "The Saint Brigid still flies mercy runs. There's a seat for you anytime." |
| s4 | `take_core` | `cipher` | "Sera Vell is a citizen of the Reach now. Still won't say thank you. Means it." |
| s4 | `fly_together` | `cipher` | "Cipher flies off your wing now. She painted her jet gold. Don't tell anyone." |
| s4 | not played | `anvil` | "Somewhere out there, an Armada pilot is still deciding who she is." |

Final card (white text on black, 3 s): "THE LONG DARK IS PATIENT." with `sable`'s chirp, then "THANK YOU
FOR FLYING, {callsign}." and the post-game unlock toast "POST-GAME: VETERAN CONTRACTS UNLOCKED".

## 4. Main missions

Shared rules for every main mission:
- Scroll speed is px/s of background travel (`{scroll}` events). Enemies with `anchor:'scroll'` (turrets
  on structures) move down at the scroll speed.
- Every pod event spawns at `y:-40` unless noted. Pods drift down at 50-70 px/s with a ±30 px sine bob.
- Each mission defines `bossMusic` and the boss event switches to it; the stage track resumes for the
  outro sting `mus_victory`.
- Co-op adds the pods marked "co-op" in each table (`if: s => s.coop`).
- First-clear rewards are paid once; replays pay the replay credits. Rank and bonus-objective
  credits are paid every play (section 13.2).

### 4.1 m1 — FIRST LIGHT
- **Location:** Vesper Yards, a ring of orbital shipyards over the gas giant Vesper.
- **Target duration:** 3:30 (waves 1:45, boss 70 s, intro/outro 15 s). **Boss:** `ravager`.
- **Music:** `mus_m1`, boss `mus_boss_1`.
- **Palette:** space `#060a14`, nebula teal `#0f3a4a`, nebula indigo `#1a1f4a`, Vesper bands `#c98a4a` /
  `#7a4a2a` / `#e0b070`, yard metal `#3a4252`, yard lights `#ff9a3d`, fires `#ff6a3d`, ring ice `#bfe6ff`.
- **Background `bg_vesper_yards`, layers (back to front):**
  1. `stars`: three star layers (300/180/90 stars, sizes 1/1.5/2.5 px, parallax 0.05/0.1/0.2 of
     scroll), 5% of stars twinkle at 0.5-2 Hz.
  2. `nebula`: 720×2048 fbm `noiseCanvas` (scale 0.004, 5 octaves) mapped `#060a14` → `#0f3a4a` →
     `#1a1f4a`, alpha curve capped at 0.55, parallax 0.08, tiled vertically.
  3. `planet`: Vesper, radius 900 px centered at (1000, 420): horizontal bands from a 1D fbm palette
     (`#7a4a2a`, `#c98a4a`, `#e0b070`), a dark terminator gradient across the lower right (to `#060a14`
     at 70%), a thin bright limb on the upper left `#ffe0a8`, and a ring ellipse (rx 1300, ry 120,
     tilt -0.25 rad, `#bfe6ff` at 0.25 alpha) crossing in front. Parallax 0.03. Darkened so the play
     area stays below 40% value.
  4. `yards`: procedural scaffolds: vertical girders (24 px wide, `#3a4252` with `#5a6478` rim) and
     lattice cross-braces, dock cranes (L-shaped arms with hanging hooks), hangar mouths with blinking
     `#ff9a3d` lights (1 Hz, staggered), parallax 0.6. Fires on burning cranes: small additive flame
     sprites `#ff6a3d` flickering.
  5. `near`: tumbling hull plates and sparks (10 plates, 40-120 px, rotation 0.2-0.8 rad/s), parallax
     1.3, alpha 0.6, not collidable.
- **Phases (`setPhase`):** `launch` (Halcyon flight deck: runway light strips `#ff9a3d` streaking down,
  deck plating texture fills the screen, 0-3 s), `yards` (scaffolds and burning cranes), `ring` (yards
  thin out; a blue-white haze band of ring ice crosses the screen; ice chunks in `near`), `deep` (open
  space, Vesper fills the right third, a sun glare `#fff2d8` flare in the upper left).
- **Set pieces:** at 34 s a burning crane topples across the left third (background layer 4, 3 s fall,
  sparks); at 64 s the UNS Halcyon (620 px long carrier silhouette: wedge hull `#4a5468`, bridge
  tower, 6 engine bells with `#7fe3ff` plumes) rises from the bottom of layer 4 and climbs past at
  0.5× scroll, its running lights blinking: "the Halcyon is free".
- **Hazards:** `asteroid_storm` (ring ice): light density from the left at 46 s for 16 s, medium from
  the right at 70 s for 14 s. Big rocks block enemy bullets, so they double as cover.
- **Enemy roster:** `dart`, `wasp`, `raptor`, `sentinel`, `mantis`.
- **Rescue pods:** 6 pods, 16 people, VIP `oldiron` (unlocks s1). Co-op adds 2 (5 people).

Wave script (director clock):

| t | Event |
|---|---|
| 0 | `bg:'launch'`, `scroll:900`, `banner:'FIRST LIGHT'` sub `'MISSION 1 · VESPER YARDS'`, `radio:'m1_r01'` |
| 3 | `scroll:240`, `bg:'yards'` |
| 4 | `formation:'vee'`, `enemy:'dart'`, count 5, x 360 |
| 7 | `radio:'m1_r02'` |
| 8 | `formation:'line_sweep'`, dart ×6, from left, y 200 |
| 11 | `formation:'line_sweep'`, dart ×6, from right, y 260 |
| 14 | `formation:'vee'`, dart ×5, x 200 |
| 15 | `formation:'vee'`, dart ×5, x 520 |
| 17 | `pickup:'weapon_pulse'`, x 360; `radio:'m1_r03'` |
| 20 | `spawn:'sentinel'` x 140, y -60, `opts:{anchor:'scroll'}`; `spawn:'sentinel'` x 580, y -60 |
| 22 | `formation:'swirl'`, wasp ×8, x 360 |
| 25 | `pod:{x:240, people:3, kind:'civilian'}`; `radio:'m1_r04'` |
| 28 | `formation:'pincer'`, raptor ×2 |
| 31 | `formation:'stagger_rain'`, dart ×10 |
| 34 | `call`: crane topple set piece |
| 36 | `spawn:'mantis'` x 360, y -80; `radio:'m1_r05'` |
| 41 | `pod:{x:520, people:2, kind:'civilian'}` |
| 44 | `waitClear:true`, timeout 15 |
| 45 | `checkpoint:true`; `bg:'ring'`; `banner:'VESPER RING'` |
| 46 | `hazard:'asteroid_storm'`, `opts:{from:'left', duration:16, density:0.5}`; `radio:'m1_r06'` |
| 50 | `formation:'column_dive'`, dart ×6, x 180 |
| 53 | `pod:{x:300, people:1, vip:'s1', kind:'vip'}`; `radio:'m1_r07'` |
| 56 | `formation:'side_stream'`, wasp ×10, from right |
| 58 | co-op: `pod:{x:620, people:2, kind:'civilian'}` |
| 60 | `formation:'vee'`, raptor ×3, x 360 |
| 63 | `pickup:'missile'`, x 420 |
| 64 | `call`: Halcyon launch set piece; `radio:'m1_r08'` |
| 66 | `pod:{x:180, people:6, kind:'lifeboat'}` |
| 70 | `hazard:'asteroid_storm'`, `opts:{from:'right', duration:14, density:0.8}` |
| 72 | `formation:'wall'`, dart ×8 |
| 77 | `spawn:'mantis'` x 200; `spawn:'mantis'` x 520 |
| 82 | `formation:'escort_box'`, `opts:{lead:'mantis', escort:'raptor', count:4}` |
| 86 | `pod:{x:460, people:4, kind:'civilian'}`; `radio:'m1_r09'` |
| 88 | co-op: `pod:{x:120, people:3, kind:'civilian'}` |
| 90 | `formation:'pincer'`, raptor ×4 |
| 94 | `formation:'stagger_rain'`, wasp ×14 |
| 99 | `pickup:'weapon_spread'`, x 360, `if: s => maxWeaponLevel(s) < 3` |
| 100 | `waitClear:true`, timeout 18 |
| 101 | `checkpoint:true`; `bg:'deep'`; `scroll:140` |
| 102 | `radio:'m1_r10'` |
| 104 | `boss:'ravager'` (intro line `m1_b01`) |
| 105 | `afterBoss:true`, `radio:'m1_r11'` |

Radio cues:

| id | who | Copy |
|---|---|---|
| `m1_r01` | anvil | Lance One, you're clear. Vanta jets are in my yard. Make them regret it. |
| `m1_r02` | torque | Easy on the stick, {callsign}. She's the only XF-9 we've got. |
| `m1_r03` | torque | Power cell in that wreck! Grab it and your lasers double up. |
| `m1_r04` | sparrow | Escape pod on your left! Fly right over it and we'll beam them aboard. |
| `m1_r05` | anvil | Gunship. Its turret turns slowly. Hit it from the side. |
| `m1_r06` | sparrow | Ring ice coming through! Big rocks block their shots too. Hide! |
| `m1_r07` | anvil | Priority beacon. That's Captain Halvorsen's pod. Bring her home. |
| `m1_r08` | anvil | Docks are clear. Halcyon is launching. Nice flying, Lance One. |
| `m1_r09` | sparrow | More pods! Somebody's having the worst day of their life. Go! |
| `m1_r10` | anvil | Big signal climbing out of Vesper's clouds. Cruiser class. Here it comes. |
| `m1_r11` | anvil | Cruiser down. Welcome to the war, {callsign}. |
| `m1_b01` | sable | Small lights. You burn so loudly. Hold still. |
| `m1_b02` | torque | Its wing guns are off! Now go for the glowing core! |
| `m1_b03` | sparrow | It's dumping everything! Find the gaps, they're there! |

- **Rewards:** first clear 500 credits + 2 SP; replay 250 credits.

### 4.2 m2 — THE UNDERTOW
- **Location:** the Hadal Drift, a shipping lane choked with wrecks, seeded with black holes.
- **Target duration:** 4:00 (waves 2:05, boss 85 s, intro/outro 15 s). **Boss:** `tidecaller`.
- **Music:** `mus_m2`, boss `mus_boss_1`.
- **Palette:** void `#05060f`, nebula violet `#2a1446`, indigo `#141a3a`, accretion `#ffb070`, hot white
  `#fff2d8`, wreck metal `#2c3040`, convoy lights `#5dffb0`, lens streaks `#8a7aff`.
- **Background `bg_hadal_drift`, layers:**
  1. `stars`: as m1, but 10% of stars are drawn as short arcs (lensed streaks, `#8a7aff` at 0.4).
  2. `nebula`: fbm violet/indigo (`#05060f` → `#2a1446` → `#141a3a`), with slow swirl (domain warp
     rotating 0.02 rad/s around the far black hole), alpha cap 0.5.
  3. `hadal`: the distant giant black hole Hadal, upper right (center 600, 180; shadow radius 120):
     dim accretion ring (ellipse rx 300 ry 70, `#ffb070` → `#2a1446`, alpha 0.35), thin photon ring
     `#fff2d8` at 0.3, rotating streak texture 0.05 rad/s. Kept dim and partly cropped by the edge.
  4. `wrecks`: 6-8 broken freighters (long boxy hulls `#2c3040` with torn ends, dead windows, a few
     `#ff6a3d` embers), slowly rotating and drifting toward Hadal (+8 px/s x), parallax 0.5.
  5. `near`: debris and frozen fuel crystals, parallax 1.25, alpha 0.5.
- **Phases:** `drift` (wrecks and haze), `pull` (wrecks stretch: draw each wreck with a 1.0 → 1.4
  horizontal stretch toward Hadal; stars streak more), `convoy` (three refugee freighters crawl up the
  left side in layer 4 with green running lights `#5dffb0`), `abyss` (nebula darkens to 30% alpha; the
  boss's tow ring light leaks in from the top).
- **Set pieces:** at 75 s a convoy freighter caught by a black hole breaks in half (layer 4 sprite
  splits, fire burst) and spills three real pods into the play area next to the gravity well.
- **Hazards:** `blackhole` small at 30 s (tutorial, far right), medium at 60 s (left, with the VIP pod
  drifting toward it), twin small at 95 s (a calm lane down the middle). The boss carries its own.
- **Enemy roster:** `dart`, `wasp`, `raptor`, `lancer`, `hornet`, `snatcher`, `warden`, `mantis`.
- **Rescue pods:** 7 pods, 27 people, VIP `anand` (unlocks s2). Co-op adds 2 (6 people).

| t | Event |
|---|---|
| 0 | `bg:'drift'`, `scroll:200`, `banner:'THE UNDERTOW'` sub `'MISSION 2 · HADAL DRIFT'`, `radio:'m2_r01'` |
| 3 | `formation:'vee'`, dart ×5, x 360 |
| 6 | `formation:'swirl'`, wasp ×8, x 260 |
| 9 | `formation:'pincer'`, raptor ×2 |
| 12 | `spawn:'lancer'` x 200; `spawn:'lancer'` x 520; `radio:'m2_r02'` |
| 16 | `formation:'line_sweep'`, dart ×6, from left, y 220 |
| 18 | `pod:{x:420, people:2, kind:'civilian'}` |
| 20 | `formation:'column_dive'`, dart ×6, x 540 |
| 24 | `spawn:'hornet'` x 360; `radio:'m2_r03'` |
| 28 | `formation:'side_stream'`, wasp ×12, from left |
| 30 | `hazard:'blackhole'`, x 520, y 380, `opts:{size:'small', life:16}`; `radio:'m2_r04'` |
| 34 | `formation:'vee'`, dart ×7, x 360 |
| 37 | `pod:{x:200, people:6, kind:'lifeboat'}` |
| 38 | `spawn:'snatcher'` x -40, y 300; `radio:'m2_r05'` |
| 42 | `formation:'pincer'`, raptor ×4 |
| 46 | `pickup:'weapon_lance'`, x 360; `radio:'m2_r06'` |
| 48 | `waitClear:true`, timeout 15 |
| 49 | `checkpoint:true`; `bg:'pull'` |
| 50 | `spawn:'warden'` x 360, y -160; `radio:'m2_r07'` |
| 58 | `formation:'escort_box'`, `opts:{lead:'hornet', escort:'raptor', count:4}` |
| 60 | `hazard:'blackhole'`, x 240, y 300, `opts:{size:'medium', life:22}` |
| 62 | `pod:{x:500, people:3, kind:'civilian'}` |
| 64 | `formation:'stagger_rain'`, dart ×12 |
| 66 | co-op: `pod:{x:640, people:3, kind:'civilian'}` |
| 68 | `pod:{x:600, people:1, vip:'s2', kind:'vip', vx:-40}` (drifts toward the well); `radio:'m2_r08'` |
| 70 | `spawn:'snatcher'` x 760, y 200; `spawn:'snatcher'` x -40, y 160 |
| 72 | `formation:'swirl'`, wasp ×10, x 460 |
| 75 | `bg:'convoy'`; `call`: freighter breakup; `pod:{x:300, y:180, people:4}`, `pod:{x:360, y:140, people:3}`, `pod:{x:420, y:200, people:8, kind:'lifeboat'}`; `radio:'m2_r09'` |
| 80 | `spawn:'lancer'` x 160, 360, 560 |
| 84 | `formation:'wall'`, dart ×8 |
| 88 | `spawn:'mantis'` x 220; `spawn:'mantis'` x 500 |
| 92 | `pickup:'missile'`, x 360 |
| 95 | `hazard:'blackhole'` x 150, y 440 and x 570, y 440, both `opts:{size:'small', life:14}`; `radio:'m2_r10'` |
| 98 | `formation:'column_dive'`, dart ×6, x 360 |
| 100 | co-op: `pod:{x:360, people:3, kind:'civilian'}` |
| 102 | `formation:'pincer'`, raptor ×4 |
| 106 | `spawn:'hornet'` x 220; `spawn:'hornet'` x 500 |
| 110 | `waitClear:true`, timeout 18 |
| 111 | `checkpoint:true`; `bg:'abyss'`; `scroll:120` |
| 112 | `radio:'m2_r11'` |
| 114 | `boss:'tidecaller'` (intro line `m2_b01`) |
| 115 | `afterBoss:true`, `radio:'m2_r12'` |

| id | who | Copy |
|---|---|---|
| `m2_r01` | anvil | The convoy's on the far side of the Drift. Clear them a lane, Lance One. |
| `m2_r02` | sparrow | Lancers! Their noses glow before they fire. When it glows, move. |
| `m2_r03` | torque | Seeker missiles! They chase you, but one shot pops them. |
| `m2_r04` | anvil | Gravity well forming. Don't fight the pull. Steer across it. |
| `m2_r05` | sparrow | That tug is stealing the pod! Shoot it before it gets away! |
| `m2_r06` | torque | Lance cell! A beam that cuts through everything in a line. Lovely. |
| `m2_r07` | anvil | Frigate. Knock out the side guns first, then the bow cannon. |
| `m2_r08` | anvil | Priority beacon! Dr. Anand's pod, drifting toward the hole. Hurry! |
| `m2_r09` | sparrow | The freighter's breaking up! Pods everywhere, grab what you can! |
| `m2_r10` | torque | Two wells! Fly the lane down the middle. The pulls cancel out there. |
| `m2_r11` | anvil | There's the ship feeding these holes. It's towing one. Take it down. |
| `m2_r12` | anvil | Tidecaller's gone and the holes are fading. The convoy's moving. Good. |
| `m2_b01` | sable | You fear the dark, small one. The dark has never once feared you. |
| `m2_b02` | anand | Its containment ring broke! The hole is loose! Stay wide of it! |
| `m2_b03` | anvil | It's dragging the hole with it. Keep moving and keep firing. |

`m2_b02` plays only if `anand` was rescued this play or earlier (`save.flags.unlock_s2`); otherwise
`torque` says the fallback `m2_b02t`: "Its cage just broke! That hole is loose! Stay wide!"

- **Rewards:** first clear 700 credits + 2 SP; replay 350 credits.

### 4.3 m3 — CINDER'S EDGE
- **Location:** the mining colonies of Cinder, a swollen red giant star.
- **Target duration:** 4:20 (waves 2:15, boss 95 s, intro/outro 15 s). **Boss:** `sunbreaker`.
- **Music:** `mus_m3`, boss `mus_boss_2`.
- **Palette:** sky `#1a0806`, deep crimson `#2a0a08`, ember `#ff6a3d`, star surface `#ff9a3d` /
  `#ffd27a`, dust `#5a2a1a`, rock `#3a2a24` (rim `#7a4a34`), colony lights `#7fe3ff`, mirror silver
  `#c8d2e0`.
- **Background `bg_cinder`, layers:**
  1. `stars`: sparse and reddened (120/80/40 stars tinted `#ffd2c0`).
  2. `star`: Cinder's limb along the left edge: a circle of radius 1600 centered at (-1350, 640) with
     animated granulation (fbm, 4 octaves, scale 0.01, drifting 6 px/s), color ramp `#2a0a08` →
     `#ff6a3d` → `#ffd27a` at the very limb, darkened to 35% value inside the play area. Solar
     prominences: 3 looping arcs (quadratic curves, `#ff9a3d` additive at 0.25) that rise and fall
     over 8 s.
  3. `dust`: two diagonal dust bands (fbm, `#5a2a1a` at 0.4), parallax 0.15.
  4. `rigs`: mining rigs on asteroids: irregular rock blobs (`#3a2a24`, rim `#7a4a34`) with boxy
     drill towers, conveyor arms, and blinking `#7fe3ff` lights; evacuation shuttles (small white
     wedges) lift off with blue plumes. Parallax 0.6.
  5. `near`: hot embers drifting up-right (additive `#ff6a3d`, 1-3 px), parallax 1.3.
- **Phases:** `colonies` (rigs and shuttles), `flare_belt` (star limb brighter +15%, prominences
  double, dust thicker), `mirrors` (in layer 4: huge hexagonal mirror panels `#c8d2e0` with bright
  specular streaks tilt toward the star; thin reflected light beams `#ffd27a` at 0.2 cross the sky),
  `corona` (the limb fills the left third; heat shimmer via `chromatic(0.15)` pulses every 4 s).
- **Set pieces:** shuttles lifting off from rigs (0-60 s); at 88 s a reflected beam slices a colony
  rig in half in layer 4 (white line, then the halves drift apart with fire); the Sunbreaker's mirror
  array is visible in the distance from 88 s on.
- **Hazards:** `solar_flare` at 36 s (from the left), 68 s (left) and 95 s (from the right, bounced by
  mirrors). Each flare spawns 3 large slow cover rocks 4 s before the wave (`cover:3`). Light
  `asteroid_storm` rocks drift through `flare_belt` (density 0.3) as extra cover.
- **Enemy roster:** `dart`, `wasp`, `raptor`, `lancer`, `sentinel`, `breacher`, `scarab`, `hive`,
  `hornet`, `snatcher`, `mantis`.
- **Rescue pods:** 9 pods, 32 people, VIP `mercy` (unlocks s3). Co-op adds 2 (6 people).

| t | Event |
|---|---|
| 0 | `bg:'colonies'`, `scroll:200`, `banner:'CINDER\'S EDGE'` sub `'MISSION 3 · CINDER COLONIES'`, `radio:'m3_r01'` |
| 3 | `formation:'vee'`, raptor ×3, x 360 |
| 6 | `formation:'line_sweep'`, dart ×8, from left, y 200 |
| 9 | `spawn:'sentinel'` x 120, y -60 and x 600, y -60, `opts:{anchor:'scroll'}` |
| 12 | `pod:{x:360, people:3, kind:'civilian'}` |
| 14 | `pod:{x:200, people:2, kind:'civilian'}` |
| 15 | `formation:'swirl'`, wasp ×10, x 360 |
| 18 | `spawn:'breacher'` x 240; `spawn:'breacher'` x 480; `radio:'m3_r02'` |
| 22 | `formation:'pincer'`, raptor ×4 |
| 25 | `pod:{x:520, people:8, kind:'lifeboat'}` |
| 27 | `spawn:'snatcher'` x 760, y 260 |
| 30 | `spawn:'scarab'` x -60, y 240, `opts:{dir:1}`; `radio:'m3_r03'` |
| 34 | `formation:'stagger_rain'`, dart ×12 |
| 36 | `hazard:'solar_flare'`, `opts:{from:'left', warn:3, cover:3}`; `radio:'m3_r04'` |
| 42 | `formation:'column_dive'`, dart ×6, x 540 |
| 44 | `pod:{x:300, people:4, kind:'civilian'}` |
| 46 | `spawn:'hive'` x 360, y -120; `radio:'m3_r05'` |
| 52 | `formation:'side_stream'`, wasp ×10, from right |
| 55 | `waitClear:true`, timeout 16 |
| 56 | `checkpoint:true`; `bg:'flare_belt'`; `hazard:'asteroid_storm'`, `opts:{from:'top', duration:50, density:0.3}` |
| 57 | `pod:{x:420, people:1, vip:'s3', kind:'vip'}`; `radio:'m3_r06'` |
| 60 | `spawn:'snatcher'` x -40, y 220; `spawn:'snatcher'` x 760, y 180 |
| 62 | `formation:'pincer'`, raptor ×4 |
| 64 | co-op: `pod:{x:140, people:3, kind:'civilian'}` |
| 66 | `spawn:'hornet'` x 220; `spawn:'hornet'` x 500 |
| 68 | `hazard:'solar_flare'`, `opts:{from:'left', warn:3, cover:3}` |
| 72 | `pod:{x:200, people:6, kind:'lifeboat'}`; `pod:{x:560, people:2, kind:'civilian'}` |
| 75 | `spawn:'scarab'` x -60, y 200, `opts:{dir:1}`; `spawn:'scarab'` x 780, y 320, `opts:{dir:-1}` |
| 80 | `formation:'wall'`, dart ×8 |
| 84 | `spawn:'breacher'` x 160, 360, 560 |
| 88 | `bg:'mirrors'`; `call`: rig-slice set piece; `radio:'m3_r07'` |
| 90 | `spawn:'lancer'` x 180, 360, 540 |
| 92 | `pickup:'weapon_spread'`, x 360 |
| 95 | `hazard:'solar_flare'`, `opts:{from:'right', warn:3, cover:3}`; `radio:'m3_r08'` |
| 100 | `spawn:'hive'` x 260, y -120; `formation:'vee'`, raptor ×5, x 480 |
| 104 | co-op: `pod:{x:600, people:3, kind:'civilian'}` |
| 106 | `pod:{x:400, people:3, kind:'civilian'}` |
| 108 | `pod:{x:240, people:3, kind:'civilian'}` |
| 110 | `formation:'swirl'`, wasp ×12, x 300 |
| 114 | `waitClear:true`, timeout 18 |
| 115 | `checkpoint:true`; `bg:'corona'`; `scroll:120` |
| 116 | `radio:'m3_r09'` |
| 118 | `boss:'sunbreaker'` (intro line `m3_b01`) |
| 119 | `afterBoss:true`, `radio:'m3_r10'` |

| id | who | Copy |
|---|---|---|
| `m3_r01` | anvil | Colonists are launching pods. Keep the Armada off them till the tugs arrive. |
| `m3_r02` | sparrow | Breachers! They line up, then ram. See the red line? Sidestep it. |
| `m3_r03` | torque | Minelayer! Those black balls burst after two seconds. Give them room. |
| `m3_r04` | torque | Flare incoming! Get behind a big rock. Now, {callsign}! |
| `m3_r05` | anvil | Carrier. It launches drones from its belly bays. Hit the bays. |
| `m3_r06` | anvil | Priority beacon. Captain Kessler of the Saint Brigid. Get her out of there. |
| `m3_r07` | sparrow | Those mirrors are aiming the sunlight! That's how they make the flares. |
| `m3_r08` | torque | Flare from the right! The mirrors bounced it. Find cover! |
| `m3_r09` | anvil | The mirror platform is the Sunbreaker. It's pointing a star at us. End it. |
| `m3_r10` | anvil | Sunbreaker's down. The colonies are clear. Let Cinder burn in peace. |
| `m3_b01` | sable | Your stars are so bright. We will help them shine all at once. |
| `m3_b02` | torque | Mirrors are cracking! Its beams get weaker with every one you break. |
| `m3_b03` | sparrow | It's spinning up the big one! Get behind its own wreckage! |

- **Rewards:** first clear 900 credits + 3 SP; replay 450 credits.

### 4.4 m4 — NEEDLE'S EYE
- **Location:** the Lattice, a vast hexagonal relay frame that holds the Armada's wormhole network.
- **Target duration:** 4:30 (waves 2:15, boss 100 s, intro/outro 15 s). **Boss:** `wraith`.
- **Music:** `mus_m4`, boss `mus_boss_2`.
- **Palette:** void `#04050c`, portal A cyan `#7fe3ff`, portal B amber `#ffb070`, lattice metal
  `#2a3046` (rim `#4a5470`), violet energy `#8a5cff`, relay lights `#ff2f6d`, filament blue `#1a2a5a`.
- **Background `bg_lattice`, layers:**
  1. `stars`: standard three layers, cooler tint `#cfe0ff`.
  2. `filaments`: blue-violet nebula filaments (ridged fbm: `1 - |2n - 1|`, `#1a2a5a` → `#8a5cff` at
     0.3), parallax 0.08.
  3. `frames`: the Lattice: hexagonal frames (stroke 10-18 px, metal gradient `#2a3046` → `#4a5470`)
     receding in depth: 5 depth slices drawn at scales 0.3/0.45/0.6/0.8/1.0 with matching parallax
     0.1-0.6, so frames grow as they approach. Relay lights `#ff2f6d` on each frame vertex pulse in a
     chase sequence toward the center (0.08 s step).
  4. `gate`: a giant background gate ring (radius 260, upper center) with a violet swirling surface
     (rotating fbm); Armada ships flash out of it (white flash, then a silhouette that shrinks away).
  5. `near`: crossing girders at parallax 1.4 (dark, alpha 0.7) and drifting sparks.
- **Phases:** `approach` (open frames, gate far), `lattice` (dense frames close in, more girders),
  `relay_core` (the gate fills the top; the core's violet light washes the frames), `collapse` (after
  the boss: frames break and fall away during the outro).
- **Set pieces:** fleet jumps through the gate (0-50 s, every 6 s); at 80 s Halcyon torpedoes (two
  white streaks with `#7fe3ff` glow) strike the far frames and a chain of explosions runs along the
  Lattice (layer 3) for 6 s.
- **Hazards:** `wormhole` pairs at 10 s (diagonal), 52 s (horizontal), 86 s (vertical: the exit opens
  behind the player); `mine_field` at 30 s and 76 s. Trap pods (`kind:'trap'`) debut here.
- **Enemy roster:** `dart`, `wasp`, `raptor`, `lancer`, `phantom`, `reaver`, `hornet`, `warden`,
  `snatcher`.
- **Rescue pods:** 7 real pods (24 people) plus 2 trap pods; VIP `cipher` (unlocks s4). Co-op adds 2
  (6 people).

| t | Event |
|---|---|
| 0 | `bg:'approach'`, `scroll:220`, `banner:'NEEDLE\'S EYE'` sub `'MISSION 4 · THE LATTICE'`, `radio:'m4_r01'` |
| 3 | `formation:'vee'`, dart ×7, x 360 |
| 6 | `formation:'pincer'`, raptor ×4 |
| 10 | `hazard:'wormhole'`, `opts:{a:[200,320], b:[520,880], life:18}`; `radio:'m4_r02'` |
| 12 | `formation:'portal_burst'`, dart ×8, `opts:{portal:'a'}` |
| 16 | `pod:{x:480, people:2, kind:'civilian'}` |
| 18 | `spawn:'phantom'` x 200; `spawn:'phantom'` x 520; `radio:'m4_r03'` |
| 22 | `formation:'side_stream'`, wasp ×12, from right |
| 24 | `pod:{x:300, kind:'trap'}` |
| 26 | `radio:'m4_r04'` |
| 28 | `formation:'column_dive'`, dart ×8, x 180 |
| 30 | `hazard:'mine_field'`, `opts:{rows:3, density:0.6, duration:18}`; `radio:'m4_r05'` |
| 36 | `spawn:'reaver'` x 360; `radio:'m4_r06'` |
| 40 | `pod:{x:200, people:6, kind:'lifeboat'}` |
| 44 | `formation:'escort_box'`, `opts:{lead:'warden', escort:'raptor', count:4}` |
| 50 | `waitClear:true`, timeout 18 |
| 51 | `checkpoint:true`; `bg:'lattice'` |
| 52 | `hazard:'wormhole'`, `opts:{a:[120,520], b:[600,520], life:20}` |
| 54 | `formation:'portal_burst'`, raptor ×4, `opts:{portal:'b'}` |
| 58 | `pod:{x:360, people:3, kind:'civilian'}`; `pod:{x:560, kind:'trap'}` |
| 62 | `spawn:'phantom'` x 160, 360, 560 |
| 64 | co-op: `pod:{x:140, people:3, kind:'civilian'}` |
| 66 | `pod:{x:360, people:1, vip:'s4', kind:'vip', look:'vanta'}`; `radio:'m4_r07'` |
| 67 | `spawn:'reaver'` x 160 and x 560, `opts:{target:'pod'}`; `radio:'m4_r08'` |
| 72 | `formation:'wall'`, dart ×8 |
| 76 | `hazard:'mine_field'`, `opts:{rows:2, density:0.5, duration:14}` |
| 80 | `call`: torpedo set piece; `radio:'m4_r09'` |
| 82 | `spawn:'hornet'` x 220; `spawn:'hornet'` x 500 |
| 86 | `hazard:'wormhole'`, `opts:{a:[360,240], b:[360,1040], life:16}`; `radio:'m4_r10'` |
| 88 | `formation:'portal_burst'`, wasp ×10, `opts:{portal:'b', warn:1.0}` |
| 94 | `pod:{x:200, people:4, kind:'civilian'}`; `pod:{x:520, people:8, kind:'lifeboat'}` |
| 98 | `spawn:'reaver'` x 200; `spawn:'reaver'` x 520 |
| 100 | co-op: `pod:{x:600, people:3, kind:'civilian'}` |
| 104 | `formation:'pincer'`, raptor ×6 |
| 108 | `pickup:'weapon_lance'`, x 360 |
| 110 | `waitClear:true`, timeout 20 |
| 111 | `checkpoint:true`; `bg:'relay_core'`; `scroll:100` |
| 112 | `radio:'m4_r11'` |
| 114 | `boss:'wraith'` (intro line `m4_b01`) |
| 115 | `afterBoss:true`, `bg:'collapse'`, `radio:'m4_r12'` |

| id | who | Copy |
|---|---|---|
| `m4_r01` | anvil | That's the Lattice. Every Armada jump runs through here. Let's close it. |
| `m4_r02` | torque | Wormhole! In one ring, out the other. Bullets too. Mind both ends. |
| `m4_r03` | sparrow | Something's on sensors but not on screen. Watch for the shimmer. |
| `m4_r04` | torque | That pod's beacon blinks wrong. Real pods let your shots pass. Test it. |
| `m4_r05` | sparrow | Minefield! Shoot a path and stay inside it. |
| `m4_r06` | anvil | Armada ace. It dodges your fire. Spread your shots or pin it to a wall. |
| `m4_r07` | anvil | A Vanta pod with a white-flag beacon. A defector? Bring it in. Carefully. |
| `m4_r08` | sparrow | Those aces are shooting at their own pod! Cover it, Lance One! |
| `m4_r09` | anvil | Torpedoes away. The Lattice is burning. Keep their fighters busy. |
| `m4_r10` | torque | That ring opened behind you. Their bullets can come out of it! |
| `m4_r11` | anvil | The relay core is exposed. Something big is guarding it. I can't see it. |
| `m4_r12` | anvil | Relay's dead. The Maw is on its own now. So are we. Come home. |
| `m4_b01` | sable | You cannot hit what was never there, small one. |
| `m4_b02` | sparrow | It's hopping through the rings! Watch which one lights up first! |
| `m4_b03` | anvil | Its cloak is failing. It can't hide anymore. Finish it. |

`m4_b02` alternative when `cipher` was rescued: `m4_b02c` (cipher): "The ring that flares first is
where it exits. Every time. Trust me."

- **Rewards:** first clear 1,100 credits + 3 SP; replay 550 credits.

### 4.5 m5 — THE MAW
- **Location:** the Maw, a moon-sized ring engine feeding the star Elysia into a captive black hole.
- **Target duration:** 5:00 (waves 2:30, boss 120 s, intro/outro 30 s). **Boss:** `the_maw`.
- **Music:** `mus_m5`, boss `mus_boss_final`.
- **Palette:** black `#000000`, Elysia white-gold `#fff2c8`, plasma stream `#ffb070`, violet `#b26bff`,
  crimson `#ff2f6d`, Maw obsidian `#0b0b12` / `#24263a`, rim light `#5a5f80`.
- **Background `bg_maw`, layers:**
  1. `stars`: stars stretched into short arcs that all bend around the screen's top center (the Maw);
     arc length grows each phase.
  2. `elysia`: the star Elysia in the lower right (radius 700, center 980, 1500): white-gold core,
     `#ffb070` corona, its plasma peeling off in a river (a wide bezier band of animated fbm, additive
     `#ffb070` at 0.25) that flows up and left toward the top center. Dimmed under the play area.
  3. `ring`: segments of the Maw's outer ring: colossal curved plates `#0b0b12` → `#24263a` with
     `#5a5f80` rims, crimson light strips `#ff2f6d` and vent glows, parallax 0.4.
  4. `debris`: broken chunks of eaten planets (rock with glowing `#ff6a3d` cracks), drifting upward
     toward the Maw at 20-40 px/s, parallax 0.7.
  5. `near`: plasma wisps (additive `#ffb070` at 0.15), parallax 1.3.
- **Phases:** `elysia` (star and plasma river), `ring` (ring plates fill both sides), `throat` (inside:
  near-black, the river pours into a lensed point at the top center; `vignette(0.55)`; a faint
  constant `addLens` at (360, -300) radius 0 strength 0.5 bends the top of the screen), `heart` (a
  vast chamber: concentric rings of crimson light around the boss).
- **Set pieces:** the plasma river (always on); at 60 s the Halcyon fires its main gun (a 40 px white
  beam with `#7fe3ff` glow from the bottom left to the top center, 2 s, screen `flash('#ffffff',
  0.25)`), and a ring segment explodes in layer 3; from 91 s the Maw's pull is felt.
- **Hazards:** `gravity_rift` at 22 s, 70 s and 112 s (the Maw's tidal tears); `blackhole` seeded by
  `voidcaller`s; from 91 s a giant offscreen `blackhole` at (360, -700) (`offscreen:true`, pull 80
  px/s² at the top edge, falloff over 1800 px) pulls everything gently upward for the rest of the
  mission.
- **Enemy roster:** `dart`, `wasp`, `raptor`, `lancer`, `mantis`, `hornet`, `phantom`, `reaver`,
  `voidcaller`, `warden`, `hive`, `breacher`, `snatcher`.
- **Rescue pods:** 7 pods, 26 people, no VIP (one ULF `pilot` pod). Co-op adds 2 (6 people).

| t | Event |
|---|---|
| 0 | `bg:'elysia'`, `scroll:200`, `banner:'THE MAW'` sub `'MISSION 5 · ELYSIA'`, `radio:'m5_r01'` |
| 2 | `radio:'m5_r12'`, `if: s => save.missions.s1?.done` |
| 3 | `formation:'vee'`, dart ×7, x 200 |
| 5 | `formation:'vee'`, dart ×7, x 520 |
| 8 | `formation:'pincer'`, raptor ×4 |
| 12 | `spawn:'voidcaller'` x 360; `radio:'m5_r02'` |
| 16 | `formation:'swirl'`, wasp ×12, x 360 |
| 20 | `pod:{x:480, people:3, kind:'civilian'}` |
| 22 | `hazard:'gravity_rift'`, `opts:{x1:80, y1:200, x2:300, y2:900, life:14}`; `radio:'m5_r03'` |
| 26 | `spawn:'reaver'` x 200; `spawn:'reaver'` x 520 |
| 30 | `formation:'wall'`, dart ×10 |
| 34 | `pod:{x:220, people:8, kind:'lifeboat'}` |
| 36 | `spawn:'snatcher'` x -40, y 260; `spawn:'snatcher'` x 760, y 220 |
| 40 | `formation:'escort_box'`, `opts:{lead:'warden', escort:'raptor', count:4}` |
| 44 | co-op: `pod:{x:600, people:3, kind:'civilian'}` |
| 48 | `pickup:'bomb'`, x 360 |
| 50 | `waitClear:true`, timeout 18 |
| 51 | `checkpoint:true`; `bg:'ring'` |
| 52 | `radio:'m5_r04'` |
| 54 | `spawn:'voidcaller'` x 180; `spawn:'voidcaller'` x 540 |
| 58 | `formation:'side_stream'`, wasp ×14, from left |
| 60 | `call`: Halcyon main gun set piece; `radio:'m5_r05'` |
| 62 | `pod:{x:400, people:4, kind:'civilian'}`; `pod:{x:220, people:1, kind:'pilot'}` |
| 64 | `radio:'m5_r13'`, `if: s => save.missions.s2?.done` |
| 66 | `formation:'pincer'`, reaver ×2 |
| 70 | `hazard:'gravity_rift'`, `opts:{x1:620, y1:150, x2:420, y2:950, life:16}` |
| 72 | `spawn:'hive'` x 360, y -120 |
| 76 | `spawn:'phantom'` x 160, 360, 560 |
| 80 | `pod:{x:360, people:6, kind:'lifeboat'}` |
| 84 | `spawn:'breacher'` x 120, 280, 440, 600 |
| 88 | `pickup:'shield'`, x 360 |
| 90 | `waitClear:true`, timeout 20 |
| 91 | `checkpoint:true`; `bg:'throat'`; `hazard:'blackhole'`, x 360, y -700, `opts:{size:'giant', offscreen:true, pull:80}`; `radio:'m5_r06'` |
| 94 | `formation:'stagger_rain'`, dart ×16 |
| 98 | `spawn:'voidcaller'` x 360; `spawn:'mantis'` x 180; `spawn:'mantis'` x 540 |
| 104 | `pod:{x:260, people:2, kind:'civilian'}`; `pod:{x:460, people:2, kind:'civilian'}` |
| 106 | co-op: `pod:{x:120, people:3, kind:'civilian'}` |
| 108 | `formation:'swirl'`, raptor ×6, x 360 |
| 112 | `spawn:'reaver'` x 220 and x 500; `hazard:'gravity_rift'`, `opts:{x1:360, y1:120, x2:360, y2:560, life:10}` |
| 118 | `waitClear:true`, timeout 20 |
| 119 | `checkpoint:true`; `bg:'heart'`; `scroll:80`; `radio:'m5_r07'` |
| 120 | `radio:'m5_r09'`, `if: s => hasChoice('ch_s4_core','fly_together')`; `radio:'m5_r10'`, `if: s => hasChoice('ch_s4_core','take_core')` |
| 120 | `radio:'m5_r11'`, `if: s => hasChoice('ch_s3_brigid','save_boats')`; `radio:'m5_r14'`, `if: s => hasChoice('ch_s3_brigid','shield_ship')` |
| 121 | `boss:'the_maw'` (intro lines `m5_b01`, `m5_b02`) |
| 122 | `afterBoss:true`, `radio:'m5_r08'` |

`hasChoice(choiceId, option)` reads the most recent entry of `save.choices[sideId]`.

Choice echoes in m5 (so earlier decisions matter in the finale):
- `fly_together`: Cipher's interceptor joins as an AI ally (`SL.spawnAlly`) for the boss's third
  form (20 s, twin needle lasers 180 DPS, not hittable).
- `take_core`: Cipher calls the Heart's weak window: every time the Heart inhales (form 3), a 2 s
  marker ring appears 0.5 s earlier than normal.
- `save_boats`: Saint Brigid tugs catch pods that leave the bottom of the screen (no `podLost` from
  drifting off; enemy fire still destroys pods).
- `shield_ship`: when the boss spawns, the Brigid projects +40 shield to every player (one time).
- s1 or s2 done: `oldiron` and `anand` add a line of support (no gameplay effect).

| id | who | Copy |
|---|---|---|
| `m5_r01` | anvil | This is it. Elysia is still burning. Let's keep it that way. |
| `m5_r02` | sparrow | That ship is making black holes! Hit it while its core is glowing! |
| `m5_r03` | torque | Space itself is tearing. Don't touch the crack, and mind the pull. |
| `m5_r04` | sable | You came all this way to be quiet with us. How kind. |
| `m5_r05` | anvil | Halcyon main gun firing. That's our last big shot. Make it count. |
| `m5_r06` | torque | Feel that? The Maw is pulling everything in. Keep your nose pointed home. |
| `m5_r07` | anvil | That's the heart. Everything we have, {callsign}. Everything. |
| `m5_r08` | anvil | It's collapsing! All wings, get out of there now! |
| `m5_r09` | cipher | Did you think I'd miss this? Cipher, joining on your wing. |
| `m5_r10` | cipher | The heart's armor opens when it inhales. Hit it then. Trust me. |
| `m5_r11` | mercy | The Brigid's tugs are right behind you. Any pod that falls, we catch. |
| `m5_r12` | oldiron | Kid, I've seen a lot of fights. Never one like this. Give 'em hell. |
| `m5_r13` | anand | The Maw's black hole is unstable! Hit the heart and it folds up! |
| `m5_r14` | mercy | The Brigid is holding position behind you. Her shield is yours. |
| `m5_b01` | sable | You found the heart. Then listen to it, small light. It is so quiet. |
| `m5_b02` | anvil | Don't listen to her. Listen to me. Fire. |
| `m5_b03` | sable | The Nocturne will carry me. The long dark is patient. |
| `m5_b04` | sparrow | The heart's breathing in! Something's opening up! Hit it! |
| `m5_b05` | torque | She's got nothing left. Neither do I. Bring her home, {callsign}. |

- **Rewards:** first clear 1,500 credits + 4 SP; replay 750 credits. First clear unlocks the ending,
  Veteran Contracts (section 15) and the `ending` screen in the star map.

## 5. Side stories

Side stories are the "sub stories": short (2-3 min), personal, and each built around one decision.

Shared rules:
- **Unlock:** `sideUnlocked(sN)` is true when (the VIP of `mN` was rescued, setting
  `save.flags.unlock_sN`, AND `mN` is done) OR the next main mission is done (fallback: the VIP was
  picked up by a rescue tug and calls you). s1 ← m1 VIP / m2 done; s2 ← m2 VIP / m3 done; s3 ← m3 VIP /
  m4 done; s4 ← m4 VIP / m5 done. A missed VIP pod reappears on every replay until rescued.
- **The choice:** one `choice` event per side story. `SL.story.choice(id)` pauses play, dims the field
  to 35%, and shows the dialog: speaker portrait, a 1-2 line prompt, two option cards (label, one-line
  consequence, skill preview with icon and branch color). Keys: left/right or A/D to move, confirm to
  pick; touch: tap a card, then tap `CONFIRM`. No timer (play is paused). The pick is stored in
  `session.flags[choiceId]` and appended to `save.choices[sideId]`.
- **Skill award:** on mission complete, the chosen option's skill is added to `save.skills.owned`
  (and auto-equipped for P1 if P1 has no active skill and the skill is active). Failing the mission
  awards nothing; the choice is asked again on retry.
- **Replay:** the dialog marks options already earned with an `EARNED` badge. Picking the other
  option on replay earns the other skill. Picking an earned option again is allowed (full credits,
  no new skill).
- **Rewards:** first clear 600 credits + 1 SP + skill; replay 300 credits (+ skill if new).
- Each side story ends with a mini-boss (section 8.6-8.9).

### 5.1 s1 — OLD IRON (Vanguard branch)
- **Unlock:** rescue `oldiron`'s VIP pod in m1 (m1 done), or complete m2.
- **Premise:** Petra Halvorsen flew the first XF-9 prototype before she retired. Her old carrier, the
  Valkyrie, sank into the Ion Sea, a permanent storm, ten years ago with its experimental weapons bay
  sealed. Armada salvage crews have found it. Petra wants you to get there first.
- **Location and assets:** new background `bg_ion_sea` (8.0 below) with phases `storm`, `valkyrie`,
  `eye`. Hazard `ion_storm`. Enemies `dart`, `wasp`, `raptor`, `mantis`, `sentinel`, `snatcher`
  (as salvage cutters). Mini-boss `stormjaw`. Music `mus_side_a`, boss `mus_miniboss`.
- **Background `bg_ion_sea`:** palette deep blue `#040a1a`, storm blue `#1a3a7a`, cloud grey `#2a3450`,
  ion glow `#bfe6ff`, lightning `#e8f4ff`, Valkyrie hull `#4a5040`. Layers: `stars` (sparse, mostly
  hidden); `clouds_far` (fbm cloud deck `#040a1a` → `#1a3a7a`, parallax 0.1, internal flashes: random
  cloud regions brighten to `#bfe6ff` at 0.25 for 120 ms every 1-3 s); `clouds_mid` (darker billows
  `#2a3450`, parallax 0.35); `wreck` (phase `valkyrie`: the carrier's broken hull, 900 px long,
  olive-grey `#4a5040` metal with rust `#6a4a30`, a cracked flight deck, a dead bridge tower, the
  weapons bay doors glowing `#ff9a3d` where cutters burn them, parallax 0.6); `near` (rain-like ion
  streaks, 2 px wide, `#bfe6ff` at 0.2, falling at 1.5× scroll). Phase `eye`: clouds part into a
  calm, clear circle with a pale blue sky glow at the center.
- **Structure and objectives:** (1) cross the storm (0-44 s); (2) reach the Valkyrie and destroy
  three salvage cutters burning into its bay (`s1_obj_reach`); (3) the CHOICE; (4) the branch (70-100
  s); (5) mini-boss `stormjaw` (`s1_obj_boss`). Bonus `s1_obj_nohit`: take no lightning hits.
- **Target duration:** 2:50. **Pods:** 4 (13 people), co-op +1 (3 people).

**The choice `ch_s1_valkyrie`.**
- Prompt (`oldiron`): "The bay's open, kid. The reactor's still hot, and old HOUND is still aboard.
  You can only haul one out."
- Option `rip_reactor` — label **RIP OUT THE REACTOR**. Copy: "Raw power for your jet. The storm will
  go wild." Skill preview: **Overdrive** (active): "6 s of white-hot fire."
- Option `wake_hound` — label **WAKE THE HOUND**. Copy: "An old AI that hunts with you. The Armada
  will hunt it too." Skill preview: **Hunter's Mark** (passive): "Marked targets take +35% damage."
- After `rip_reactor`: Reactor Surge for the rest of the mission: weapon level +1 (to max 5) and
  fire rate +25%. The storm goes wild: lightning interval 2.2 → 1.4 s, 2 more storm cells, and an extra
  `stagger_rain` dart wave at 76 s. Stormjaw starts with +15% charge speed.
- After `wake_hound`: HOUND joins on the radio. Lightning telegraph 0.7 → 1.4 s (HOUND calls strikes),
  and Hunter's Mark is active for this mission (a preview). The Hound's signal draws hunters: extra
  `pincer` raptor ×6 at 76 s and 94 s.
- **Reward skill:** `rip_reactor` → `vg_overdrive`; `wake_hound` → `vg_hunters_mark`.

| t | Event |
|---|---|
| 0 | `bg:'storm'`, `scroll:220`, `banner:'OLD IRON'` sub `'SIDE STORY · THE ION SEA'`, `radio:'s1_r01'` |
| 3 | `hazard:'ion_storm'`, `opts:{cells:3, duration:95, interval:2.2}`; `radio:'s1_r02'` |
| 5 | `formation:'vee'`, dart ×7, x 360 |
| 9 | `formation:'swirl'`, wasp ×10, x 300 |
| 13 | `formation:'pincer'`, raptor ×4 |
| 17 | `pod:{x:300, people:2, kind:'civilian'}` |
| 20 | `formation:'stagger_rain'`, dart ×12 |
| 24 | `spawn:'mantis'` x 360 |
| 28 | `radio:'s1_r03'` |
| 30 | `formation:'side_stream'`, wasp ×12, from left |
| 34 | `pod:{x:480, people:6, kind:'lifeboat'}` |
| 38 | `formation:'escort_box'`, `opts:{lead:'mantis', escort:'raptor', count:4}` |
| 40 | co-op: `pod:{x:160, people:3, kind:'civilian'}` |
| 44 | `waitClear:true`, timeout 15 |
| 45 | `checkpoint:true`; `bg:'valkyrie'`; `radio:'s1_r04'` |
| 47 | `spawn:'sentinel'` x 160 and x 560, y -60, `opts:{anchor:'scroll'}` |
| 50 | `spawn:'snatcher'` x 240, 360, 480, y -40, `opts:{role:'cutter', holdY:200}`; `radio:'s1_r05'` |
| 52 | `formation:'pincer'`, raptor ×4 |
| 58 | `formation:'wall'`, dart ×8 |
| 64 | `until: s => s.flags.cutters_down`, timeout 25 |
| 66 | `pod:{x:360, people:3, kind:'civilian'}` |
| 70 | `choice:'ch_s1_valkyrie'` |
| 71 | `radio:'s1_ra1'` if `rip_reactor`; `radio:'s1_rb1'` if `wake_hound` |
| 72 | `call`: apply branch effects (above) |
| 74 | `radio:'s1_ra2'` if `rip_reactor`; `radio:'s1_rb2'` if `wake_hound` |
| 76 | `formation:'vee'`, raptor ×5; plus `stagger_rain` dart ×16 (`rip_reactor`) or `pincer` raptor ×6 (`wake_hound`) |
| 82 | `formation:'side_stream'`, wasp ×14, from right |
| 86 | `pod:{x:200, people:2, kind:'civilian'}` |
| 88 | `spawn:'mantis'` x 220 and x 500 |
| 94 | `radio:'s1_ra3'` if `rip_reactor`; `formation:'pincer'`, raptor ×6 and `radio:'s1_rb3'` if `wake_hound` |
| 100 | `waitClear:true`, timeout 18 |
| 101 | `checkpoint:true`; `bg:'eye'`; `radio:'s1_r06'` |
| 103 | `boss:'stormjaw'` (intro `s1_b01`) |
| 104 | `afterBoss:true`, `radio:'s1_r07'`; then `radio:'s1_ra4'` or `radio:'s1_rb4'` |

| id | who | Copy |
|---|---|---|
| `s1_r01` | oldiron | Ten years since I flew into this storm. It hasn't missed me at all. |
| `s1_r02` | torque | Ion clouds! Inside one, your shield won't recharge. Skirt the edges. |
| `s1_r03` | oldiron | I flew this sea blind once. Lost a wing. Found it later. Long story. |
| `s1_r04` | oldiron | There she is. The Valkyrie. Still the prettiest wreck in the sky. |
| `s1_r05` | anvil | Three salvage cutters on the bay doors. Knock them off before they're in. |
| `s1_r06` | anvil | The storm's eye is clearing. Big contact inside it. Gunboat class. |
| `s1_r07` | oldiron | That's my kid. Okay, not my kid. You know what I mean. |
| `s1_ra1` | oldiron | Ha! That's my kind of pilot. Hang on, the storm's about to notice. |
| `s1_ra2` | torque | Reactor's hooked in. Your guns are drinking from it. Feel that? |
| `s1_ra3` | sparrow | The whole sky is lightning now! Was that the reactor? Totally worth it! |
| `s1_ra4` | torque | That reactor's going in the bird for good. Hit the skill button. Smile. |
| `s1_rb1` | hound | HOUND ONLINE. HELLO, PILOT. ASSIGNING TARGET PRIORITY. |
| `s1_rb2` | oldiron | Hello, old dog. Kid, it'll call the lightning before it hits. Listen. |
| `s1_rb3` | hound | HUNTERS INBOUND. THEY WANT ME. I WOULD PREFER THEY DID NOT HAVE ME. |
| `s1_rb4` | hound | HOUND INSTALLED IN XF-9. PILOT, THE RED MARKS ARE FOR SHOOTING. |
| `s1_b01` | oldiron | That gunboat eats lightning. It'll throw the storm at you. Stay sharp. |
| `s1_b02` | torque | Its coils are glowing! When they're full, it fires everything. Move! |

### 5.2 s2 — EVENT HORIZON (Singularity branch)
- **Unlock:** rescue `anand`'s VIP pod in m2 (m2 done), or complete m3.
- **Premise:** Dr. Anand's Pallas Lab studies the Twins, two black holes that orbit each other every
  18 seconds. His gravity probe can either collapse black holes or calm them, which makes it priceless
  to the Armada. Their salvage fleet is towing it away right now.
- **Location and assets:** reuses `bg_hadal_drift` with new phases `pallas` (the lab: a ring station
  with a central spindle, `#c8d2e0` metal and `#b26bff` windows, in layer 4) and `twins` (two dim
  accretion glows in layer 3 orbiting the screen center in sync with the hazards). Hazards: two
  `blackhole`s in a binary orbit. Enemies `dart`, `wasp`, `raptor`, `lancer`, `hornet`, `snatcher`
  (towing the probe), `warden` (option `overcharge` only, as bait for the merged hole). Mini-boss
  `grappler`. Music `mus_side_b`, boss `mus_miniboss`.
- **Mission entity `probe`:** a 40 px violet sphere (`#b26bff` core glow, white center, two orbiting
  ring sprites) on a tether chain to three snatchers; it cannot be damaged.
- **Structure and objectives:** (1) cross the Twins (0-38 s); (2) free the probe by destroying its
  three tow snatchers (`s2_obj_probe`); (3) the CHOICE; (4) the branch; (5) mini-boss `grappler`
  (`s2_obj_boss`). Bonus `s2_obj_lab`: rescue all 6 lab pods (only possible fully with `stabilize`:
  2 before the choice + 4 launched after it; with `overcharge`, 4 of 6 is the max).
- **Target duration:** 2:45. **Pods:** 2 lab pods before the choice; then 2 (overcharge) or 4
  (stabilize) more, 3 people each. Co-op +1 (3 people).

**The choice `ch_s2_probe`.**
- Prompt (`anand`): "The probe is going critical! I can overcharge it and merge the Twins into one
  giant hole, or stabilize it and calm them both down."
- Option `overcharge` — label **OVERCHARGE THE PROBE**. Copy: "One giant black hole swallows their
  fleet. It pulls on you too." Skill preview: **Singularity** (active): "Fire your own black hole."
- Option `stabilize` — label **STABILIZE THE PROBE**. Copy: "The Twins calm down and the lab can
  evacuate. The Armada comes back for it." Skill preview: **Stasis Halo** (passive): "Enemy bullets
  slow down near you."
- After `overcharge`: the Twins spiral together over 3 s into one `large` black hole at (360, 360)
  that lasts until the boss (pull ×1.4 vs normal). Enemy waves enter and are dragged in for free kills
  (crystals they drop orbit the hole and drift out to you). A `warden` is pulled in at 84 s and
  explodes in a huge burst (big credit shower). Only 2 more lab pods make it out. The Grappler fights
  around the merged hole.
- After `stabilize`: both holes' pull drops to 40% for the rest of the mission and their horizons
  shrink 30%, which turns them into slingshot lanes. Four lab pods launch (3 people each) across the
  next 30 s, but the Armada turns around to retake the probe: extra `snatcher` ×3 targeting pods and a
  `pincer` raptor ×6 wave. The Grappler fights between the calmed Twins.
- **Reward skill:** `overcharge` → `gv_singularity`; `stabilize` → `gv_stasis`.

| t | Event |
|---|---|
| 0 | `bg:'pallas'`, `scroll:180`, `banner:'EVENT HORIZON'` sub `'SIDE STORY · PALLAS LAB'`, `radio:'s2_r01'` |
| 3 | `hazard:'blackhole'` x 530, y 420, `opts:{size:'medium', orbit:{cx:360, cy:420, r:170, w:0.35, phase:0}, life:100}` |
| 3 | `hazard:'blackhole'` x 190, y 420, `opts:{size:'medium', orbit:{cx:360, cy:420, r:170, w:0.35, phase:3.1416}, life:100}` |
| 4 | `radio:'s2_r02'` |
| 6 | `formation:'vee'`, dart ×7, x 360 |
| 10 | `formation:'swirl'`, wasp ×10, x 360 |
| 14 | `spawn:'lancer'` x 200 and x 520 |
| 18 | `pod:{x:200, people:3, kind:'civilian', tag:'lab'}`; `spawn:'snatcher'` x 760, y 200 |
| 22 | `formation:'pincer'`, raptor ×4 |
| 26 | `formation:'side_stream'`, dart ×10, from right |
| 30 | `pod:{x:520, people:3, kind:'civilian', tag:'lab'}` |
| 33 | `spawn:'hornet'` x 360 |
| 36 | co-op: `pod:{x:360, people:3, kind:'civilian'}` |
| 38 | `waitClear:true`, timeout 15 |
| 39 | `checkpoint:true`; `bg:'twins'` |
| 40 | `call`: spawn the probe tow (3 `snatcher` with `opts:{role:'tow'}` + `probe`, crossing left to right at y 160, 70 px/s); `radio:'s2_r03'` |
| 44 | `formation:'pincer'`, raptor ×4 |
| 48 | `spawn:'lancer'` x 160, 360, 560 |
| 52 | `formation:'stagger_rain'`, wasp ×12 |
| 58 | `until: s => s.flags.probe_free`, timeout 25 (on timeout the tow stops at x 600 and waits) |
| 59 | `radio:'s2_r04'` |
| 62 | `choice:'ch_s2_probe'` |
| 63 | `overcharge`: `call` merge (3 s spiral); `radio:'s2_ra1'` · `stabilize`: `call` calm; `radio:'s2_rb1'` |
| 66 | `radio:'s2_ra2'` or `radio:'s2_rb2'` |
| 68 | `formation:'wall'`, dart ×10; `stabilize`: `pod` ×2 lab pods (x 240, x 480) |
| 72 | `formation:'swirl'`, raptor ×6; `stabilize`: `spawn:'snatcher'` ×3, `opts:{target:'pod'}` |
| 78 | `formation:'side_stream'`, wasp ×14; `overcharge`: `pod` ×2 lab pods (x 160, x 560) |
| 84 | `overcharge`: `spawn:'warden'` x 360, y -160 and `radio:'s2_ra3'` · `stabilize`: `formation:'pincer'`, raptor ×6 and `radio:'s2_rb3'` |
| 88 | `stabilize`: `pod` ×2 lab pods (x 300, x 420) |
| 92 | `spawn:'hornet'` x 220 and x 500 |
| 98 | `waitClear:true`, timeout 18 |
| 99 | `checkpoint:true`; `radio:'s2_r05'` |
| 101 | `boss:'grappler'` (intro `s2_b01`) |
| 102 | `afterBoss:true`, `radio:'s2_r06'`; then `radio:'s2_ra4'` or `radio:'s2_rb4'` |

| id | who | Copy |
|---|---|---|
| `s2_r01` | anand | Welcome to Pallas! Sorry about the black holes. And the Armada. Sorry! |
| `s2_r02` | anand | The Twins orbit every eighteen seconds. Cross behind them, not in front! |
| `s2_r03` | anand | That's my probe! Shoot the tugs, not the probe! The probe is fine! |
| `s2_r04` | anand | Got it! Oh. Oh no. It's going critical. I need a decision, Lance One! |
| `s2_r05` | anvil | Salvage ship inbound. It's huge, and it has claws. Don't get grabbed. |
| `s2_r06` | anand | You did it! The probe is safe. Mostly. I'll explain the smoke later. |
| `s2_ra1` | anand | Overcharging! Oh no. Oh yes. Oh no. Hold on to something! |
| `s2_ra2` | anvil | The Twins are merging. Everything is falling in. Everything but you. Fly! |
| `s2_ra3` | sparrow | A whole frigate just fell in! Do you see this? I'm seeing this! |
| `s2_ra4` | anand | I've copied the overcharge into your jet. Please aim it away from me. |
| `s2_rb1` | anand | Stabilizing! The pull is easing. My lab pods can launch now. Catch them! |
| `s2_rb2` | sparrow | The Armada's turning around. They want that probe back. Not today. |
| `s2_rb3` | anand | The holes are calm! Fly close to them. They'll fling you, gently! |
| `s2_rb4` | anand | The stabilizer is wired into your jet. Bullets near you will slow. Science! |
| `s2_b01` | anvil | It's using the holes. It throws wrecks around them. Watch the curve. |
| `s2_b02` | anand | Its claws are magnetic! If one grabs you, shoot the cable! |
