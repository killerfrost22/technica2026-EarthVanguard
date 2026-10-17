# EARTH VANGUARD: Game Design Document (final)

This document decides content and numbers. `docs/ARCHITECTURE.md` decides structure and APIs and wins on any
API question; `docs/api/core.md` describes the engine as built. Every id, name and line of player-facing copy
below is final. Builders read their own sections plus the ID catalog (section 20) and their work package
(section 21).

Conventions used everywhere:
- Numbers are **Pilot** difficulty, solo, before `SL.game.diff` multipliers, unless a line says otherwise.
- Playfield 720 x 1280 logical px, y down. Speeds in px/s, angles in radians (0 = right, PI/2 = straight down).
  "Aimed" means at the target returned by `SL.patterns.target(src)` (section 7.4), normally the nearest player.
- Damage classes to players: `s` 8, `m` 12, `l` 18; enemy beam 45/s; body contact 20 (all x `diff.damage`).
- Times in wave outlines are director-clock seconds (the clock holds during `waitClear`, `until`, `choice`, `boss`).
- Text tokens replaced by the story module: `{callsign}` (P1), `{callsign2}` (P2; default `EMBER`),
  `{pilot}` (callsign of the player an event is about). Radio lines are at most 90 characters as written.
- Ids are lowercase snake_case. Core bullet ids keep their engine spelling (`orbBig`).

## 1. Pitch and tone

**Pitch.** You are {callsign}, test pilot of the XF-9 *Starlance*, the fastest jet humanity ever built. The
Nyx Armada has poured out of the Tartarus Rift towing captive black holes, and it drops them on human worlds
like anchors. The carrier UNS *Halcyon* is the last warship at the Vesta Line, and its hangar holds two XF-9
prototypes. Across five missions you fly from the burning Vesta shipyards to the Hierarch's throne ship
parked between two black holes. You carve through jet swarms with glowing lasers, scoop people out of drifting
escape pods, and finish every level against a screen-filling boss that breaks apart in stages. Between
sorties you spend salvage in Patch's hangar and fly four short side stories where one radio decision picks
the skill your jet learns. A friend can grab the gold twin jet, the XF-9B *Sunlance*, at any time.

**Tone.** Bright, loud, heroic, a little cheeky: Saturday-morning space opera with real stakes. The crew jokes
under fire, the villain is grand and cold, nobody gives a speech longer than a breath. Story arrives in a
2-4 line briefing and radio lines short enough to read while dodging. The shooting never stops for long.

**Why it feels like Lightning Fighter.**
- Portrait 9:16 playfield, jet low on screen, auto-fire on, relative drag on touch (the jet follows the
  finger's motion, so the thumb never hides it), instant response, hard banking.
- Weapon capsules that visibly transform firepower in seconds: twin lasers become a wall of light, the fan
  widens to nine rays, the lance swells from a needle to a pillar.
- Glossy metal jets with specular bands and hot engines, arriving in tight formations that pop in chains.
- Huge bosses that fill the top of the screen, lose turrets and plates, change attacks at each health mark,
  have their own health bar, and die in slow motion.
- Gold credit crystals rain from every kill and feed a between-mission upgrade hangar.
- Bombs as panic buttons that turn the bullet curtain into gold.

**Pillars.**
1. *Readable danger.* Every attack telegraphs. Enemy bullets are the brightest thing on screen.
2. *Rhythm.* Missions alternate peaks (30-45 s of dense waves) and breathers (8-15 s of pods, pickups, radio).
   Bosses escalate in 3-4 phases with a short invulnerable phase break between them.
3. *Power you can see.* Weapon levels, missiles, skills and Twin Link all change the screen.
4. *People worth flying low for.* Pods drift through the crossfire; saving them pays and starts stories.

**Signature moments** (one per mission; each is that mission's star-map card image).
- m1: the catapult launch off the *Halcyon*'s deck, and the sun cresting Vesta as RAZORBACK dies.
- m2: your lasers curving around a black hole to hit the jet hiding behind it.
- m3: lightning lighting the cloud canyon from the inside, then the storm's eye opening to stars.
- m4: an eclipse sliding over a blue giant; blades of starlight sweeping the screen while you hide in shadow.
- m5: punching through the rift, the *Halcyon*'s spinal cannon firing past you, and the throne ship's final
  form collapsing into a black hole you must break.

## 2. Characters

Pilots are silent in combat; they speak only through choice replies. Portraits are procedural busts drawn by
`SL.story.characters[id].portrait(ctx, w, h, t, talking)` at any size (radio box 96 x 96, briefing 160 x 160),
built relative to `w, h`. Shared recipe: rounded-square plate (radius 8% of w) with a vertical gradient of the
character's two plate colors, light from the upper left, a 1 px rim light in the character color on the right
edge, scanlines every 3 px (alpha 0.08) scrolling down at 18 px/s, a blink every 3-5 s (80 ms), a 1 px head bob
at 0.3 Hz. While `talking`, the mouth or visor light pulses (`0.5 + 0.5 sin(t * 22)`, gated by a 7 Hz random
hold) and the headset LED blinks. Every line starts with 120 ms of horizontal tearing (3 slices offset +-6 px).

| id | Name | Callsign | Role | Color |
|---|---|---|---|---|
| `anvil` | Commander Maren Kade | ANVIL | Captain of the UNS *Halcyon*; mission control | `#ffb53f` |
| `sparrow` | Lt. Juno Park | SPARROW | Wingmate; flies the XF-7 *Kestrel* escort (scripted ally) | `#3fc8ff` |
| `patch` | Chief Nell Okafor | PATCH | Hangar chief and mechanic; runs the hangar | `#ff9d4a` |
| `vael` | Hierarch Vael | (none) | Ruler of the Nyx Armada; speaks at boss intros | `#b26bff` |
| `tamsin` | Captain Bo Tamsin | LANTERN | Master of the refugee liner *Lantern*; m1 VIP, lead of s1 | `#ffd27a` |
| `osei` | Dr. Halima Osei | DOC | Gravity physicist of Lagrange Deep station; m2 VIP, lead of s2 | `#5dffb0` |
| `rook` | Captain Petra Holt | ROOK | Veteran ace, first XF-9 test pilot, Nyx prisoner; m3 VIP, lead of s3 | `#d8dde8` |
| `ixa` | Ixa | IXA | Nyx foundry engineer who defects; m4 VIP, lead of s4 | `#ff6fae` |
| `p1` | {callsign} | LANCE (default) | Pilot of the XF-9 *Starlance* | `#7fe3ff` |
| `p2` | {callsign2} | EMBER (default) | Pilot of the XF-9B *Sunlance* (co-op) | `#ffd27a` |

**`anvil`, Commander Maren Kade.** Calm, clipped, decisive. Short orders, rare dry jokes, never shouts; goes
quieter when things are bad. Spends one warm word per mission and makes it count. Portrait: no helmet; oval
face, skin `#8d5a3b` with highlight `#a46e4c`; close-cropped silver hair `#c9ced8` as a flat cap with two
specular strands; narrow steady eyes; a pale scar above the left brow. Graphite headset band `#2b2f3a` with a
boom mic whose amber LED `#ffb53f` glows while talking. Navy collar `#1d2a44` with two gold pips `#ffd34d`.
Plate `#0d1b2e` to `#06101c` with a faint cyan holo-table glow from below. Chirp `chirp_anvil`.

**`sparrow`, Lt. Juno Park.** Fast, cocky, warm. Keeps a running kill bet, trash-talks enemies, cheers every
rescue, worries out loud when you are hurt, drops the act the moment someone is in danger. Portrait: white
flight helmet (`SL.art.metal`, `#e9eef7` to `#8994ab`) with a cyan center stripe and a three-stroke bird decal;
wide mirrored visor (`#9fe8ff` to `#0b1a2e`) with a specular streak sliding across every 4 s; a visor light bar
that pulses while talking. Plate `#0b2233` to `#06121c`. Chirp `chirp_sparrow`.

**`patch`, Chief Nell Okafor.** Gruff, motherly, proud of the jet; talks to the Starlance like a stubborn pet
("easy, girl"). Explains pickups and hazards in one plain sentence. Her kid brother Milo rides the *Lantern*.
Portrait: round face, skin `#4e3426`, black curls `#16161d` under a red bandana `#d8434a` with white dots;
welding goggles pushed up on the forehead (graphite frames, amber lenses `#ffb53f` with hot glints); a grease
smudge `#1c1f2b` on one cheek; orange coverall collar `#c4622d`. Plate `#2a1a12` to `#120a06` with warm lamp
bokeh. Chirp `chirp_patch`.

**`vael`, Hierarch Vael.** Slow, ceremonial, cold. Speaks of stars, night and endings. Never says a name;
calls pilots "little light". Every Vael line hijacks the channel: the radio box border turns violet and
glitches. Portrait: no face; an angular black mask `#0c0d14` shaped like an inverted shield with a single
horizontal violet slit `#b26bff` that brightens while talking, a crown of 7 thin spikes, heavy static (random
horizontal tears every 0.3 s) and a 1 px violet chroma offset. Plate `#120018` to `#000000` with a faint
accretion arc. Chirp `chirp_vael`.

**`tamsin`, Captain Bo Tamsin.** Old, gentle, formal ("pilot", "if you please"), sailor's metaphors. Has
carried refugees for thirty years and is tired of it; quietly fierce when his ship is hit. Portrait: long
weathered face `#d9b99b`, full grey beard `#a7a9b0` (noise texture), captain's cap `#20324f` with a gold lantern
badge `#ffd27a`, scarf `#6a2f2f`. Plate: liner bridge glow `#3a2a14` to `#140c06` with porthole circles.
Chirp `chirp_tamsin`.

**`osei`, Dr. Halima Osei.** Brilliant, fast-talking, excitable; calls terrifying things "beautiful" and then
apologizes. Explains gravity in kitchen words. Portrait: round face `#5a3a28`, short natural hair (dark cloud
shape `#1a1310`), round glasses with white glints and a green reflection band sweeping every 3 s, lab collar
`#e8eef7` with a green ID clip `#5dffb0`; a tiny hologram of two orbiting dots beside her head. Plate
`#0d2a22` to `#06120e`. Chirp `chirp_osei`.

**`rook`, Captain Petra Holt.** Dry, terse old ace; calls the player "kid"; tells one-sentence war stories at
the worst moments; competitive, with a soft spot she hides badly. She flew the first XF-9 and taught Sparrow.
Portrait: square jaw `#b07a56`, grey stubble dots, scarred old flight helmet `#4a5163` with a chipped chess-rook
decal and three white kill stripes, one cybernetic eye (cyan ring). Plate `#1e2418` to `#0c0f0a`.
Chirp `chirp_rook`.

**`ixa`, Ixa.** Precise and formal with slightly odd word choice ("I am grateful in advance"). Knows every
Armada trick and says it in one line. Shows fear exactly once. Portrait: Nyx engineer, pale grey-violet skin
`#9a8fb3`, elongated head, two thin pink seam lines from the eyes to the jaw (`#ff5c8a`, glowing), a hood of
segmented plates `#2a2d3d`, large dark eyes with pink pinpoint lights. Plate `#1a0a14` to `#0a0408`.
Chirp `chirp_ixa`.

**`p1` / `p2`, the pilots.** Shown only beside choice replies (the picked option's line appears in the radio
box as the pilot's reply). `p1`: white helmet `#e8eef7` with cyan trim `#3fc8ff`, smoked visor `#0e2233` with
a cyan HUD reflection `#7fe3ff`. `p2`: graphite helmet `#2b2f3a` with gold trim `#ffb53f`, amber visor `#5a3a10`
with a gold reflection `#ffd27a` and a sun-ray decal. Chirp `chirp_pilot` (P2 at pitch 0.8).

**Chirp recipes** (40-400 ms; played after `radio_in` static; section 17 has the ids):
`chirp_anvil` two square blips 440 then 330 Hz, 60 ms each, bandpass 1.8 kHz Q 2 ·
`chirp_sparrow` three rising sine blips 880/1100/1320 Hz, 40 ms each ·
`chirp_patch` crunchy saw blip 220 Hz, bit-crushed to 8 steps, plus a 30 ms noise burst ·
`chirp_vael` descending ring-modulated sweep 600 to 150 Hz over 400 ms under heavy static ·
`chirp_tamsin` soft bell: sine 520 Hz plus a 1435 Hz partial at 30%, 180 ms decay ·
`chirp_osei` three ascending sine blips 660/880/1100 Hz, 30 ms each ·
`chirp_rook` old analog: sine 520 Hz with 6 Hz vibrato for 130 ms plus a vinyl-crackle burst ·
`chirp_ixa` bit-crushed stutter: three 20 ms square pulses at 1760 Hz, sample-and-hold 4 kHz ·
`chirp_pilot` one 30 ms sine at 1000 Hz.

## 3. Story

### 3.1 Premise

Year 2291. Out of the Tartarus Rift comes the Nyx Armada, an alien fleet that worships the end of stars. Its
warships tow captive black holes ("collapsars") and drop them on human stations and colonies. Its ruler,
Hierarch Vael, wants one thing: a black hole big enough to swallow the Sun. The UNS *Halcyon* is the last
warship at the Vesta Line, carrying two XF-9 prototypes. Commander Kade sends the *Starlance* against the whole
Armada one strike at a time: break the blockade at Vesta, cut a black hole's leash at Kerr Station, chase the
fleet through the Tantalus ion storm, burn the harvester draining the blue giant Tarsis, and fly through the
rift to the Hierarch's throne ship, the OUROBOROS. People you pull out of escape pods ask for help along the
way, and each favor teaches the *Starlance* a new skill.

**Prologue card** (shown once, on the first m1 briefing of a new save, 3 lines, 2.5 s each, tap to skip):
1. "The Nyx Armada tows black holes. It drops them on our worlds."
2. "One carrier is left at the Vesta Line. Two prototype jets are in its hangar."
3. "You fly the first one."

### 3.2 Briefings

`SL.story.briefings[id] = { title, location, lines:[{who, text, coop}], objectives:[{id, text, bonus}] }`.
Lines type out with portraits; a line with `coop: true` is shown only in co-op, appended last. Objectives with
`bonus: true` do not block completion and pay 150 credits each, every play.

**m1: FIRST LIGHT** · Vesta Shipyards, Asteroid Belt
- `anvil`: Nyx jets are tearing up the Vesta yards. Halcyon launches in five.
- `patch`: The Starlance is fueled and grumpy. Bring her back in one piece.
- `anvil`: Clear the lanes, pull out anyone you find, and kill whatever leads them.
- `sparrow` (co-op): The Sunlance is warm too. {callsign2}, you're flying with us.
- Objectives: `m1_obj_boss` Destroy RAZORBACK · `m1_obj_rescue` (bonus) Rescue 12 people ·
  `m1_obj_vip` (bonus) Find Captain Tamsin's pod

**m2: DEEP PULL** · Kerr Station, Jupiter Trojans
- `anvil`: They dragged a black hole to Kerr Station. It's eating the station alive.
- `sparrow`: Gravity bends everything near it. Your shots, their shots, you.
- `anvil`: A siege engine holds it on a leash. Cut the leash, {callsign}.
- `patch` (co-op): Two jets near a black hole. Stay close, but not that close.
- Objectives: `m2_obj_boss` Destroy LODESTAR · `m2_obj_rescue` (bonus) Rescue 14 people ·
  `m2_obj_vip` (bonus) Find Dr. Osei's pod

**m3: STORMWALL** · Tantalus Nebula
- `anvil`: The Armada is hiding inside the Tantalus ion storm. We follow it in.
- `patch`: Ion clouds jam your guns. Stay out of them if you can.
- `sparrow`: There's a prison convoy in there. Our people. Let's go get them.
- `anvil` (co-op): {callsign2}, take the left lane. {callsign}, the right.
- Objectives: `m3_obj_boss` Destroy TEMPEST · `m3_obj_rescue` (bonus) Rescue 16 people ·
  `m3_obj_vip` (bonus) Free Captain Holt

**m4: SUNBREAK** · Blue giant Tarsis
- `anvil`: The Nyx are draining the blue giant Tarsis to feed their black hole forge.
- `patch`: Solar flares will cook you. Hide in the shadow of anything big.
- `anvil`: Burn the harvester, {callsign}. Then we knock on their door.
- `sparrow` (co-op): Two shadows are better than one. Share the rocks, you two.
- Objectives: `m4_obj_boss` Destroy SUNEATER · `m4_obj_rescue` (bonus) Rescue 16 people ·
  `m4_obj_vip` (bonus) Catch the Nyx defector's pod

**m5: NIGHTFALL** · Tartarus Rift
- `anvil`: This is it. Their throne ship waits between two black holes past the rift.
- `vael`: Come then, little light. Every star ends in my hand.
- `sparrow`: Wings level, {callsign}. We fly home after this one.
- `patch` (co-op): Both birds are carrying everything I own. Bring them back.
- Objectives: `m5_obj_boss` Destroy OUROBOROS · `m5_obj_rescue` (bonus) Rescue 18 people ·
  `m5_obj_lives` (bonus) Lose no lives

**s1: LANTERN RUN** · Cold Harbor, Callisto
- `tamsin`: The Lantern carries twelve hundred souls and one bad engine. The Nyx know it.
- `patch`: My kid brother Milo is on that ship. Please, {callsign}.
- `anvil`: Escort the Lantern to orbit. It doesn't stop, so neither do you.
- Objectives: `s1_obj_liner` Get the Lantern to orbit · `s1_obj_boss` Destroy HAILSTORM ·
  `s1_obj_rescue` (bonus) Rescue 8 people

**s2: LAGRANGE DEEP** · Edge of Kerr's Eye
- `osei`: My station is falling into Kerr's Eye. My crew and my gravity core are aboard.
- `anvil`: We go in, we take what we can, we get out.
- `osei`: Mind the horizon. Past that line, nothing comes back. Not even light.
- Objectives: `s2_obj_boss` Destroy TETHER · `s2_obj_rescue` (bonus) Rescue 6 people ·
  `s2_obj_horizon` (bonus) Lose no pods to the horizon

**s3: ROOK'S GAMBIT** · The Boneyard, Tantalus Nebula
- `rook`: The ace they call Mantis shot down my whole squadron. I know his habits, kid.
- `anvil`: One sortie, Captain. You fly {callsign}'s wing and you follow orders.
- `rook`: One's all I need.
- Objectives: `s3_obj_boss` Shoot down MANTIS · `s3_obj_rook` (bonus) Keep Rook flying ·
  `s3_obj_rescue` (bonus) Rescue 6 people

**s4: SEED OF NIGHT** · Collapsar Foundry, Tartarus approach
- `ixa`: The foundry grows black holes from seeds. One seed is nearly ripe.
- `anvil`: Ixa's codes get you inside. What happens to that seed is your call.
- `ixa`: Fly fast. The foundry wakes when it smells you.
- Objectives: `s4_obj_boss` Destroy CRUCIBLE · `s4_obj_rescue` (bonus) Free 8 captives ·
  `s4_obj_hits` (bonus) Take fewer than 5 hits

When s4 is flown after m5 (post-game fallback unlock), its second line becomes
`anvil`: "The war is over, but the foundry still hums. Ixa wants it shut. Your call."

### 3.3 Ending

After OUROBOROS dies, m5 plays its `afterBoss` radio (`m5_win`, `m5_win2`, `m5_win3`, section 16), the results
screen, then the `ending` screen (section 18), which types these lines one at a time (2.4 s each):
1. The Tartarus Rift closed at 06:12 ship time.
2. {rescued} people came home because you flew low and slow when it counted.
3. The Halcyon turned for Earth. The Starlance went back to the hangar, and Patch went back to work.

Then one epilogue card per side story, chosen from the most recent entry of `save.choices[sideId]`:

| Side | Condition | Card |
|---|---|---|
| s1 | `guard_liner` | The Lantern made orbit with every soul aboard. Milo wants to be a mechanic now. |
| s1 | `draw_fire` | The Lantern never took a hit. Tamsin had your callsign painted on her bow. |
| s1 | not flown | The Lantern limped home on her own. Tamsin still asks about you. |
| s2 | `save_core` | Dr. Osei keeps a tame black hole in Hold 3. She says it's a lamp. It isn't. |
| s2 | `save_crew` | Lagrange Deep's crew all came home. Osei now builds gravity engines, not cages. |
| s2 | not flown | Lagrange Deep fell into the dark. Its last message was a thank-you. |
| s3 | `chase_mantis` | Rook flies the Halcyon's training flights now. Nobody beats her to the line. |
| s3 | `rig_field` | Rook's minefield trick is in the flight manuals. She charges for lessons. |
| s3 | not flown | Somewhere in the Boneyard, Mantis still waits for a rematch. |
| s4 | `detonate_seed` | Where the foundry burned there is a new nebula. Ixa named it Mercy. |
| s4 | `steal_seed` | A seed of night sleeps in a cage Dr. Osei built. Nobody talks about it. |
| s4 | not flown | Past the rift, the foundry still hums. For now. |

Final card: `THE END` over the stars, then "Thank you for flying, {callsign}." and the toast
"ACE DIFFICULTY UNLOCKED". `{rescued}` is `save.rescuedTotal`. In co-op line 2 reads "...because you two flew
low and slow when it counted."

## 4. Main missions

### 4.0 Shared rules and notation

- Every mission alternates PEAK segments (dense waves, a heavy or a hazard) and BREATHER segments (pods,
  pickups, radio, a checkpoint). Every new enemy gets a solo entrance before it appears in a mix; every hazard
  first appears alone, then mixed with enemies.
- Wave outlines are key beats, not final timelines; the missions builder writes the exact events. Shorthand:
  `vee gnat x5 @360` = `{formation:'vee', enemy:'gnat', count:5, x:360}`; `spawn wasp @240` =
  `{spawn:'wasp', x:240}`; `pod civilian 3 @300` = `{pod:{x:300, y:-40, people:3, kind:'civilian'}}`;
  `vip tamsin @360` = `{pod:{x:360, y:-40, people:1, kind:'vip', vip:'s1'}}`; `hazard`, `pickup`, `radio`,
  `banner`, `music`, `scroll`, `bg`, `waitClear N`, `checkpoint`, `boss`, `call`, `repeat`, `if coop`,
  `afterBoss` map 1:1 to ARCHITECTURE 6.11. Pods drift down at 55 px/s with a 12 px bob unless noted.
- Scripted pickups are dropped at y -30. Every main mission scripts 4-6 pickups before its boss (2-3 weapon
  chips or capsules plus missiles, a shield and a bomb) and a `repair` just before the boss.
- Radio cue ids are listed per mission; their copy and speakers are in section 16. The story module plays
  `<missionId>_vip` when a VIP pod spawns, `<missionId>_vip_saved` when it is rescued,
  `<missionId>_boss_intro` on `bossIntroDone` and `<missionId>_boss_p<N>` on `bossPhase` (N = phase index + 1),
  so timelines never schedule those.
- Mission tune: each mission def carries `tune: {bulletSpeed, fireRate}`; enemies and patterns multiply it on
  top of `SL.game.diff` (bosses ignore it). Objective `bonus: true` marks optional objectives.
- Co-op adds the pods marked `if coop`. Failing a mission keeps 50% of collected credits (core).

| | m1 | m2 | m3 | m4 | m5 |
|---|---|---|---|---|---|
| Waves + boss (target) | 147 + 65 s | 159 + 75 s | 168 + 90 s | 172 + 105 s | 177 + 120 s |
| Peak enemies / enemy bullets on screen | 18 / 120 | 22 / 180 | 26 / 260 | 28 / 340 | 32 / 450 |
| `tune` bulletSpeed / fireRate | 0.85 / 0.80 | 0.92 / 0.90 | 1.00 / 1.00 | 1.05 / 1.10 | 1.10 / 1.20 |
| New enemies | gnat, dart, wasp, manta, hive, snatcher | spear, needler, weaver, tug | skimmer, hornet, stormcaller, bastion | phantom, elites | warper |
| Signature hazard | asteroid_storm | black_hole | ion_storm | solar_flare, mine_field | wormhole, binary black_hole |
| Boss (HP) | boss_razorback (9,000) | boss_lodestar (16,000) | boss_tempest (24,000) | boss_suneater (33,000) | boss_ouroboros (45,000) |
| Expected weapon level at boss | 3 | 4 | 4-5 | 5 | 5 + missiles 3 |
| People (pods) | 15 (6) | 17 (7) | 20 (9) | 20 (7) | 23 (8) |

### 4.1 m1: FIRST LIGHT

- **Location:** Vesta Shipyards, Asteroid Belt. **Target duration:** 3:30. **Boss:** `boss_razorback`.
- **Palette:** space `#060912`, belt dust `#1f1a26`, Vesta rock `#6e6052` / `#8c7a66`, teal nebula `#123a48`,
  shipyard sodium lights `#ffb15c` (alpha <= 0.5), dry-dock fire `#a8452a`, sunrise `#ffd9a0`.
- **Background `bg_vesta`:** L0 gradient `#060912` to `#0b1020`; L1 three star depths (parallax 0.04 / 0.09 /
  0.18, 220 / 140 / 60 stars, twinkle); L2 teal-violet nebula (`noiseCanvas` 512, `#060912` to `#123a48` to
  `#2b1d3f`, alpha 0.4, parallax 0.07); L3 Vesta (cratered planetoid r 560 centered off-screen at (900, 300),
  fbm craters, terminator lit from the upper left, parallax 0.03); L4 belt rock silhouettes `#151320`
  (parallax 0.3); L5 shipyard gantries (girder trusses 60-90 px wide `#1b2030`, sodium light dots blinking at
  0.8-1.6 Hz, parallax 0.6); L6 dust streaks (alpha 0.1, parallax 1.2).
- **Phases:** `launch` (0-3 s: the *Halcyon*'s flight deck, grey plates `#2a3140` with hazard stripes and two
  rows of cyan guide lights chasing up, scroll 900; at 1.0 s the catapult fires: `chromatic(0.3)`, a 1.04 to 1.0
  scale punch, the deck slides off the bottom); `belt` (open belt); `shipyard` (burning dry dock with an
  unfinished carrier hull, orange pulses at 12% alpha every 3-5 s, welding sparks); `storm` (brown dust haze
  `#2a2018` at 30%, rock silhouettes double in size); `boss` (vignette 0.5, scene 20% darker, RAZORBACK's
  shadow slides over the dust 3 s before it arrives); `sunrise` (after the boss: the sun crests Vesta's limb
  at the top right, a 600 px glow and 12 slow god rays at alpha 0.08, rising to 0.2 for 4 s); `menu` (title
  and star-map backdrop: belt, Vesta and nebula only, slow drift).
- **Set pieces:** catapult launch; Sparrow's *Kestrel* strafes left to right at 52 s (`call kestrel_strafe`).
- **Music:** `mus_m1`; boss `mus_boss`.
- **Hazards:** `asteroid_storm` once (67-97 s, density 0.9, sizes s/m/l). Rocks block shots both ways: cover
  as well as obstacles.
- **Enemy roster:** gnat, dart, wasp, manta, hive, snatcher. Formations: vee, line, arc_sweep, snake,
  staircase, pincer, side_stream, rain, column, escort_box.
- **Rescue pods:** 6 pods, 15 people: civilian 3 (31 s), civilian 4 + civilian 2 (60 s), crew 2 (88 s,
  targeted by a snatcher), VIP Captain Tamsin (120 s, `vip:'s1'`, guarded by two wasps), civilian 3 (138 s).
  Co-op: + civilian 3 (124 s).
- **Radio cues:** `m1_open, m1_chips, m1_wasps, m1_pods, m1_shipyard, m1_manta, m1_sparrow_run, m1_rocks,
  m1_snatcher, m1_missiles, m1_hive, m1_vip, m1_vip_saved, m1_boss_warn, m1_boss_intro, m1_boss_p2, m1_boss_p3,
  m1_win`.
- **Rewards:** completion 400 credits, 1 SP (first clear). Unlocks m2; s1 when Tamsin was rescued.

| t | Beats |
|---|---|
| 0 | `banner FIRST LIGHT / Vesta Shipyards` · `music mus_m1` · `bg launch` · `scroll 900`; 3 s `bg belt` · `scroll 80`; 1.5 `radio m1_open` |
| 3-19 | `vee gnat x5` @360, @220, @500 (3, 6, 8); `radio m1_chips` (9.5); `line dart x6` (11); `arc_sweep gnat x8` left, right (14, 16.5); `pickup weapon_up @360` (19) |
| 21-37 | `spawn wasp` @240 + @480, `radio m1_wasps` (21); `snake dart x7` @140, @580 (25, 28); `pod civilian 3 @300`, `radio m1_pods` (31); `staircase gnat x6` (33); `spawn wasp @360 {hoverY:300}` (35); `waitClear 10` (37) |
| 40-58 | PEAK: `bg shipyard` · `scroll 100` · `radio m1_shipyard` (40); `pincer dart x10` (42); `spawn manta @360`, `radio m1_manta` (45); `side_stream gnat x8` left, right (48, 50); `call kestrel_strafe` + `radio m1_sparrow_run` (52); wasps @160 + @560 (54); `pickup weapon_spread @520` (56); `waitClear 12` (58) |
| 60-66 | BREATHER: `pod civilian 4 @200` + `pod civilian 2 @520` (60); `pickup shield @360` (63); `checkpoint` + `banner CHECKPOINT / Rocks ahead` (66) |
| 67-98 | `bg storm` + `hazard asteroid_storm {duration:30, density:0.9}`, `radio m1_rocks` (67); `rain gnat x10` (72); `vee dart x7` (76); wasps x2 (80); `arc_sweep dart x8` left (84); `pod crew 2 @420` + `spawn snatcher {side:'right', y:300}`, `radio m1_snatcher` (88); `arc_sweep dart x8` right (90); manta @220 + @500 (94); `waitClear 14` (98) |
| 100-127 | `pickup missile @360`, `radio m1_missiles` (100); `escort_box {leader:'hive', escort:'dart', count:4} @360`, `radio m1_hive` (104); `column gnat x6` @120 and @600 `repeat {every:4, count:3}` (110, 112); `vip tamsin @360` + wasps @250 + @470 (120); `if coop` `pod civilian 3 @560` (124); `waitClear 14` (126) |
| 128-141 | FINAL RUSH: `pincer dart x12` (128); `vee gnat x7` (131); `staircase wasp x4 {side:'right'}` (134); `pod civilian 3 @260` (138); `waitClear 12` (140) |
| 142-147 | `pickup repair @360` · `bg boss` · `scroll 50` (142); `radio m1_boss_warn` (143); `banner WARNING / Assault carrier RAZORBACK` (145); `boss boss_razorback` (147); `afterBoss`: `bg sunrise` + `radio m1_win` |

### 4.2 m2: DEEP PULL

- **Location:** Kerr Station, Jupiter Trojans, beside the captive black hole Kerr's Eye. **Target:** 3:55.
  **Boss:** `boss_lodestar`.
- **Palette:** space `#05060d`, Jupiter bands `#4a3426` / `#6b4a32` (dim), accretion `#ffcf8a` (far, small),
  lens rim `#c9b8ff`, station hull `#2a3044`, station lights `#7fe3ff` (alpha <= 0.4).
- **Background `bg_kerr`:** L0 gradient `#05060d` to `#0a0b18`; L1 stars (3 depths); L2 Jupiter (r 900 centered
  at (-200, -250), banded fbm, lit edge, alpha 0.55, parallax 0.02); L3 Kerr's Eye backdrop (painted accretion
  ellipse 340 x 90 of `#ffcf8a` to `#ff8a5c` to transparent around a black disc r 40 with a thin photon ring,
  parallax 0.05; art only, never calls `addLens`); L4 debris streams spiraling toward the Eye (parallax 0.25);
  L5 Kerr Station (a broken ring 1,400 px across seen at an angle, spokes, hab lights, parallax 0.5).
- **Phases:** `approach` (Jupiter fills the top-left corner); `lensing` (the Eye's disk drifts on-screen at the
  top; background stars near it are drawn stretched into arcs by the background itself); `station` (the ring
  station scrolls by, chunks breaking off toward the Eye); `boss` (the ring tilts away, scroll 40); `calm`
  (after the boss: the Eye fades); `lagrange` (s2, section 5.2).
- **Set piece:** signature lesson at 66 s: a ring of gnats spirals into the first black hole while bullets
  bend around it and your shots curve into a needler parked behind it.
- **Music:** `mus_m2`; boss `mus_boss`.
- **Hazards:** `black_hole`. 62 s: a small free hole drifting down (`{size:'small', x:360, y:-120, vy:55,
  life:26}`), alone with weak popcorn so the player sees the pull eat drones and bend bullets. 96 s and 110 s:
  two tugs each carry a medium hole (`tug` spawns it); killing a tug releases its hole, which drifts down at
  40 px/s and collapses after 6 s.
- **Enemy roster:** gnat, dart, wasp, spear, needler, weaver, manta, tug, snatcher.
- **Rescue pods:** 7 pods, 17 people: civilian 3 (36), civilian 2 + crew 2 (55), civilian 3 (88, drifting
  into the small hole's pull), VIP Dr. Osei (120, `vip:'s2'`, `vy:70`, falling toward the second tug's hole; if
  it crosses the horizon it is lost), civilian 4 + civilian 2 (132, a snatcher goes for them at 133). Co-op:
  + civilian 3 (148).
- **Radio cues:** `m2_open, m2_spears, m2_needlers, m2_weaver, m2_eye, m2_lance, m2_bh_warn, m2_bh_eat, m2_tug,
  m2_vip, m2_vip_saved, m2_station, m2_boss_warn, m2_boss_intro, m2_boss_p2, m2_boss_p3, m2_win`.
- **Rewards:** completion 550 credits, 1 SP. Unlocks m3; s2 when Osei was rescued; s1 (fallback).

| t | Beats |
|---|---|
| 0 | `banner DEEP PULL / Kerr Station` · `music mus_m2` · `scroll 90` · `bg approach`; `radio m2_open` (1.5) |
| 3-22 | `vee dart x7` (3); `pincer gnat x10` (6); `snake dart x7` @160, @560 (9, 11); spears @200 + @520, `radio m2_spears` (13); wasp hover (17); `staircase gnat x6` (19); `waitClear 10` (22) |
| 24-51 | `pickup weapon_up` (24); needlers @140 + @580 `{hoverY:220}`, `radio m2_needlers` (26); `arc_sweep dart x8` left, right (30, 33); `pod civilian 3 @360` (36); spears x3 (38); `spawn weaver @360`, `radio m2_weaver` (41); `side_stream gnat x8` both sides (46, 48); `waitClear 12` (51) |
| 53-61 | BREATHER: `bg lensing` · `scroll 70` · `radio m2_eye` (53); pods civilian 2 + crew 2 (55); `pickup weapon_lance @360`, `radio m2_lance` (57); `checkpoint` + `banner CHECKPOINT / Gravity anomaly ahead` (61) |
| 62-93 | `hazard black_hole {size:'small', x:360, y:-120, vy:55, life:26}`, `radio m2_bh_warn` (62); `ring_in gnat x10 @360` then `radio m2_bh_eat` (66, 67.5); `snake dart x7` @140, @580 (70, 72); needler @360 behind the hole (75); `rain gnat x12` (78); weavers @200 + @520 (82); `pod civilian 3 @300` (88); `waitClear 12` (92) |
| 95-131 | PEAK: `bg station` · `scroll 100` (95); `spawn tug @240`, `radio m2_tug` (96); `pincer dart x10` (100); manta @520 (104); `vee spear x5` (107); `spawn tug @480` (110); `side_stream gnat x10` both sides (113, 115); `pickup bomb @240` (118); `vip osei @420 {vy:70}` (120); wasps x2 (124); `staircase dart x8` (126); `waitClear 16` (130) |
| 132-153 | `pickup weapon_up` + `pod civilian 4 @260` + `pod civilian 2 @460` (132); `spawn snatcher {side:'left', y:260}` (133); `radio m2_station` (134); `escort_box {leader:'manta', escort:'wasp', count:4}` (137); `column dart x6` @160 + @560 (143); needlers x2 (147); `if coop` `pod civilian 3 @360` (148); `waitClear 12` (152) |
| 154-159 | `pickup repair` · `bg boss` · `scroll 40` (154); `radio m2_boss_warn` (155); `banner WARNING / Gravity siege engine LODESTAR` (157); `boss boss_lodestar` (159); `afterBoss`: `bg calm` + `radio m2_win` |

### 4.3 m3: STORMWALL

- **Location:** Tantalus Nebula, inside a permanent ion storm. **Target:** 4:15. **Boss:** `boss_tempest`.
- **Palette:** base `#070814`, nebula indigo `#1d2450`, nebula plum `#3a1f4d`, storm cloud `#141a33`, cloud rim
  `#4a5f8a`, sheet lightning `#9fb8ff` (background only, alpha <= 0.12), eye blue `#1f3f66`, Nyx barge hull
  `#22202e`.
- **Background `bg_tantalus`:** L0 gradient `#070814` to `#0d0f22`; L1 dim stars (2 depths, 30% alpha); L2
  painted nebula (two `noiseCanvas` sheets, indigo and plum, alpha 0.5, counter-drifting at 4 px/s); L3 cloud
  canyon walls on both edges (120-200 px, noise-edged, body `#0d0b22`, lit rims `#4a5f8a`, parallax 0.6) with
  internal sheet flashes (a cached 400 px cloud-flash sprite blitted additively at alpha <= 0.12 plus a faint
  branching bolt polyline); L4 near wisps (parallax 1.0, alpha 0.15). The background never draws a bright bolt
  under the play area; real lightning is the hazard.
- **Phases:** `nebula` (calm); `storm` (clouds 15% darker, flashes every 1.5-3 s, the canyon narrows to 520 px);
  `eye` (clouds part into a calm circle of stars, scroll 70; far ahead TEMPEST's dark silhouette with pink
  running lights crosses once); `boss` (a towering cloud wall lit from inside); `clear` (after the boss: the
  storm breaks into stars); `boneyard` (s3, section 5.3).
- **Set pieces:** two prison barges (`bastion` with cargo) at 64 s and 110 s; destroying them releases pods.
- **Music:** `mus_m3`; boss `mus_boss_heavy`.
- **Hazards:** `ion_storm` three times: 27 s (`{cells:2, duration:26, strikeEvery:2.4}`), 82 s (`{cells:3,
  duration:24, strikeEvery:2.2}`, mixed with a gunship peak), 152 s (`{cells:2, duration:14, strikeEvery:2.6}`).
  Stormcallers chain lightning between each other (enemy-side hazard flavor).
- **Enemy roster:** gnat, dart, wasp, spear, skimmer, hornet, needler, weaver, manta, stormcaller, bastion,
  snatcher.
- **Rescue pods:** 9 pods, 20 people: civilian 3 (42), crew 2 + civilian 2 (57), barge 1 cargo captive 3 +
  captive 2, civilian 2 (126), barge 2 cargo VIP Captain Holt (`vip:'s3'`) + crew 2, civilian 3 (144). Co-op:
  + civilian 3 (145).
- **Radio cues:** `m3_open, m3_skimmer, m3_hornet, m3_ion, m3_stormcaller, m3_eye, m3_bastion, m3_convoy,
  m3_vip, m3_vip_saved, m3_regroup, m3_boss_warn, m3_boss_intro, m3_boss_p2, m3_boss_p3, m3_win`.
- **Rewards:** completion 700 credits, 2 SP. Unlocks m4; s3 when Holt was rescued; s2 (fallback).

| t | Beats |
|---|---|
| 0 | `banner STORMWALL / Tantalus Nebula` · `music mus_m3` · `scroll 100` · `bg nebula`; `radio m3_open` (1.5) |
| 3-24 | `pincer dart x10` (3); `vee wasp x5` (6); skimmer `{side:'left', y:300}`, `radio m3_skimmer` (9); skimmer right (12); `arc_sweep dart x8` both sides (14, 16); hornet @360, `radio m3_hornet` (18); `rain gnat x12` (21); `waitClear 10` (24) |
| 26-53 | `pickup weapon_up` (26); `bg storm` + `hazard ion_storm {cells:2, duration:26, strikeEvery:2.4}`, `radio m3_ion` (27); `snake dart x8` @160, @560 (31, 34); stormcallers @260 + @460, `radio m3_stormcaller` (37); `pod civilian 3 @360` (42); `side_stream gnat x10` (44); hornets x2 (46); `staircase wasp x5` (49); `waitClear 14` (53) |
| 55-62 | BREATHER: `bg eye` · `scroll 70` · `radio m3_eye` (55); `pod crew 2 @240` + `pod civilian 2 @480` (57); `pickup shield` (59); `checkpoint` + `banner CHECKPOINT / Prison convoy ahead` (62) |
| 63-108 | PEAK: `bg storm` · `scroll 100` (63); `spawn bastion @360 {cargo:[['captive',3],['captive',2]]}`, `radio m3_bastion` (64); `pincer dart x12` (70); skimmers both sides (74); needlers x2 (78); `hazard ion_storm {cells:3, duration:24, strikeEvery:2.2}` (82); `vee wasp x5` (84); weaver (88); `column gnat x6` both edges `repeat {every:4, count:3}` (92, 94); `pickup weapon_up` (100); mantas x2 (104); `waitClear 16` (108) |
| 110-143 | `spawn bastion @360 {cargo:[['vip',1,'s3'],['crew',2]], hpMul:1.2}`, `radio m3_convoy` (110); stormcallers @160 + @560 (112); `side_stream dart x10` both sides (116, 118); hornet (122); `rain gnat x14` + `pod civilian 2 @200` (126); `pickup bomb` (132); `pincer dart x12` (134); spears x3 (138); `waitClear 14` (142) |
| 144-162 | `pickup missile` + `pod civilian 3 @260` (144); `if coop` `pod civilian 3 @460` (145); `radio m3_regroup` (146); `escort_box {leader:'weaver', escort:'wasp', count:4}` (148); `hazard ion_storm {cells:2, duration:14, strikeEvery:2.6}` (152); `vee dart x9` (154); needlers x2 (158); `waitClear 12` (161) |
| 163-168 | `pickup repair` · `bg boss` · `scroll 50` (163); `radio m3_boss_warn` (164); `banner WARNING / Storm dreadnought TEMPEST` (166); `boss boss_tempest` (168); `afterBoss`: `bg clear` + `radio m3_win` |

### 4.4 m4: SUNBREAK

- **Location:** orbit of the blue giant Tarsis, inside the Nyx harvester array. **Target:** 4:30.
  **Boss:** `boss_suneater`.
- **Palette:** base `#04070f`, corona `#4f8dff` (alpha <= 0.35 under the play area), plasma filaments `#7fb6ff`,
  mirror glass `#1a2438` with sheen `#8fb3ff`, eclipse moon `#0a0d16`, shade-rock basalt `#2b2b33`, flare white
  `#f4f8ff` (flare events only).
- **Background `bg_tarsis`:** L0 gradient `#04070f` to `#081226`; L1 sparse glare-washed stars (40%); L2 corona
  glow (radial gradient centered at (-100, -220), r 900, `#4f8dff` at 0.35 to 0) plus slow streamers (noise
  strips rotating 1 deg/s, alpha 0.2); L3 plasma filaments (thin animated arcs, alpha 0.15); L4 harvester mirror
  array (hexagonal panels 120-200 px in `#1a2438` with a moving blue sheen, parallax 0.45) and a far plasma
  stream (a ribbon from the star to a dark dot, the SUNEATER, alpha 0.25).
- **Phases:** `corona`; `eclipse` (a dark moon slides across the star and every corona layer dims 60% over 3 s;
  no flares during it: a breather the player can feel); `mirrors`; `flare` (set by `solar_flare` during each
  burn: the background brightens 15% and light shafts with crisp shadows sweep across); `boss` (the plasma
  stream thickens and feeds the boss); `calm` (after the boss: corona settles).
- **Music:** `mus_m4`; boss `mus_boss_heavy`.
- **Hazards:** `solar_flare` 26 s (`{from:'left', count:3, every:9, first:4, cover:2}`) and 109 s
  (`{from:'right', count:4, every:7, first:3, cover:3}`), shade rocks spawned by the hazard for cover;
  `mine_field` 65 s (`{count:18, duration:30, drift:50}`), with skimmers adding bullet mines during it.
- **Enemy roster:** gnat, dart, wasp, spear, skimmer, hornet, needler, weaver, manta, stormcaller, phantom,
  bastion, tug, snatcher. Elites (`opts.elite`) debut here.
- **Rescue pods:** 7 pods, 20 people: civilian 3 (44), medical 6 + crew 2 (58), civilian 3 + civilian 2 (96),
  VIP Ixa (120, `vip:'s4'`, a black Nyx pod with a white beacon, hunted by two phantoms that fire at the pod),
  civilian 3 (144). Co-op: + civilian 3 (162).
- **Radio cues:** `m4_open, m4_phantom, m4_flare, m4_eclipse, m4_mines, m4_defector, m4_vip, m4_vip_saved,
  m4_regroup, m4_boss_warn, m4_boss_intro, m4_boss_p2, m4_boss_p3, m4_win`.
- **Rewards:** completion 850 credits, 2 SP. Unlocks m5; s4 when Ixa was rescued; s3 (fallback).

| t | Beats |
|---|---|
| 0 | `banner SUNBREAK / Blue giant Tarsis` · `music mus_m4` · `scroll 110` · `bg corona`; `radio m4_open` (1.5) |
| 3-22 | `pincer dart x12` (3); `vee wasp x5` (6); phantoms @200 + @520, `radio m4_phantom` (9); `arc_sweep dart x10` both sides (13, 15); hornet (18); `staircase gnat x8` (20); `waitClear 10` (22) |
| 24-55 | `pickup weapon_up` (24); `hazard solar_flare {from:'left', count:3, every:9, first:4, cover:2}`, `radio m4_flare` (26); `snake dart x8` @160, @560 (33, 36); manta `{elite:true}` (41); `pod civilian 3 @300` (44); `side_stream gnat x10` (46); needlers x2 (50); `waitClear 12` (54) |
| 56-63 | BREATHER: `bg eclipse` · `scroll 80` · `radio m4_eclipse` (56); `pod medical 6 @360` + `pod crew 2 @560` (58); `pickup shield` (60); `checkpoint` + `banner CHECKPOINT / Mine field ahead` (63) |
| 64-107 | PEAK: `bg mirrors` · `scroll 100` (64); `hazard mine_field {count:18, duration:30, drift:50}`, `radio m4_mines` (65); `pincer dart x12` (70); bastion `{elite:true}` (74); skimmers both sides (78); phantoms x3 (82); weavers x2 (86); `pickup weapon_up` (90); `rain gnat x16` (92); `pod civilian 3 @260` + `pod civilian 2 @460` (96); hornets x2 (100); `waitClear 16` (106) |
| 108-149 | `hazard solar_flare {from:'right', count:4, every:7, first:3, cover:3}`, `radio m4_defector` (109); `arc_sweep wasp x6 {elite:true}` both sides (112, 116); `vip ixa @300` + phantoms @160 + @560 `{target:'vip'}` (120); stormcallers x2 (126); `column dart x6` both edges `repeat {every:4, count:3}` (130, 132); `pickup bomb` (136); `spawn tug @360 {hole:'small'}` (140); `pod civilian 3 @520` (144); `waitClear 16` (148) |
| 150-167 | `pickup missile`, `radio m4_regroup` (150); `escort_box {leader:'bastion', escort:'phantom', count:4}` (152); `pincer dart x14` (158); `if coop` `pod civilian 3 @360` (162); `waitClear 12` (166) |
| 168-172 | `pickup repair` · `bg boss` · `scroll 40` (168); `radio m4_boss_warn` (169); `banner WARNING / Stellar harvester SUNEATER` (170.5); `boss boss_suneater` (172); `afterBoss`: `bg calm` + `radio m4_win` |

### 4.5 m5: NIGHTFALL

- **Location:** through the Tartarus Rift to the OUROBOROS, parked between two orbiting black holes.
  **Target:** 4:50. **Boss:** `boss_ouroboros`.
- **Palette:** void `#030308`, rift interior `#2a0f3f`, rift rim `#ff5c8a` (alpha <= 0.25 in the background),
  red-shifted stars `#ffe9d6`, binary accretion disks `#ffcf8a` / `#ff8a5c` (far, small), Nyx megastructure
  `#15161f` with seams `#ff2f6d` (alpha <= 0.3), Halcyon beam `#7fe3ff`, finale white-violet `#f4eeff`.
- **Background `bg_tartarus`:** L0 gradient `#030308` to `#090613`; L1 sparse red-shifted stars; L2 the rift (a
  jagged vertical tear 260 px wide, noise-edged, starless interior `#2a0f3f`, rim glow, parallax 0.04); L3 binary
  backdrop (two painted accretion disks circling each other once per 40 s; art only); L4 Nyx megastructures
  (spires and pylons `#15161f`, parallax 0.5); L5 OUROBOROS hull (serpent-scale armor plates beneath the action,
  parallax 0.7, dim pink seams).
- **Phases:** `rift` (the jet punches through the tear with a 0.6 s chromatic flash); `binary`; `throne`; `boss`;
  `finale` (after the boss: the rift collapses into a white-violet glow over 4 s); `foundry` (s4, section 5.4).
- **Set pieces:** the *Halcyon* broadside at 63 s (`call halcyon_broadside {x:120, duration:1.5}`: the carrier's
  spinal cannon fires a 160 px cyan beam up the left third for 1.5 s, destroying every non-heavy enemy it
  touches, 10 px shake; it never hurts players); Sparrow's escort run at 161 s (`call kestrel_escort {life:12}`:
  the *Kestrel* flies beside P1 firing needles at 80 DPS); with s3 done Rook joins it (`ally_rook`, 12 s).
- **Music:** `mus_m5`; boss `mus_boss_final`.
- **Hazards:** `wormhole` at 29 s (`{a:[180,380], b:[540,900], life:20}`), 49 s (`{a:[520,340], b:[200,860],
  life:18}`), 124 s (`{a:[360,300], b:[360,980], life:16}`); binary `black_hole` at 70 s (`{size:'medium',
  binary:{cx:360, cy:-80, r:170, w:0.35, vy:26}, life:44}`: two holes orbiting a center that drifts down).
- **Enemy roster:** all 16 types; elites common. New: warper.
- **Rescue pods:** 8 pods, 23 people: civilian 3 (44), medical 6 + crew 2 (64), civilian 3 + civilian 2 (102),
  crew 2 (112), civilian 3 (142), civilian 2 (166). No VIP. Co-op: + civilian 3 (150).
- **Story echoes:** with s1 done `m5_echo_s1` plays at 2 s; s2 done `m5_echo_s2` at 62 s; s3 done
  `m5_echo_s3` at 161 s and Rook flies the escort run; s4 done `m5_echo_s4` at 173 s and OUROBOROS's engine
  parts start with 20% less part HP.
- **Radio cues:** `m5_open, m5_warper, m5_wormhole, m5_halcyon, m5_binary, m5_throne, m5_last, m5_sparrow,
  m5_boss_warn, m5_boss_intro, m5_boss_p2, m5_boss_p3, m5_boss_p4, m5_boss_horizon, m5_win, m5_win2, m5_win3,
  m5_echo_s1, m5_echo_s2, m5_echo_s3, m5_echo_s4`.
- **Rewards:** completion 1,000 credits, 2 SP. First clear: ending screen, ACE difficulty, s4 (fallback).

| t | Beats |
|---|---|
| 0 | `banner NIGHTFALL / Tartarus Rift` · `music mus_m5` · `scroll 110` · `bg rift`; `radio m5_open` (1.5) |
| 3-26 | `pincer dart x14` (3); `vee wasp x7 {elite:true}` (6); warpers @200 + @520, `radio m5_warper` (9); `arc_sweep dart x10` both sides (14, 15.5); hornets x2 (18); `rain gnat x16` (21); manta `{elite:true}` (24); `waitClear 12` (26) |
| 28-59 | `pickup weapon_up` (28); `hazard wormhole` #1, `radio m5_wormhole` (29); `snake dart x8` (33); needler (36); warpers x3 (40); `pod civilian 3 @300` (44); `side_stream gnat x10` (46); `hazard wormhole` #2 (49); weaver `{elite:true}` (52); `staircase wasp x6 {elite:true}` (56); `waitClear 14` (59) |
| 61-69 | BREATHER: `bg binary` · `scroll 80` · `radio m5_halcyon` (61); `call halcyon_broadside` (63); `pod medical 6 @360` + `pod crew 2 @180` (64); `pickup shield @540` (66); `checkpoint` + `banner CHECKPOINT / Twin black holes ahead` (69) |
| 70-116 | PEAK: `hazard black_hole {size:'medium', binary:{...}, life:44}`, `radio m5_binary` (70); `ring_in gnat x12` (74); `pincer dart x12` (78); bastion `{elite:true}` (82); warpers x2 (86); `pickup weapon_up` (90); `side_stream dart x10` both sides (92, 94); stormcallers x2 (98); pods civilian 3 + civilian 2 (102); `rain gnat x18` (106); hornets x2 (110); `pod crew 2 @360` (112); `waitClear 16` (116) |
| 118-157 | `bg throne` · `scroll 120` · `radio m5_throne` (118); `escort_box {leader:'hive', escort:'warper', count:4}` (120); `hazard wormhole` #3 (124); `arc_sweep wasp x6 {elite:true}` both sides (126, 128); `pickup bomb` (132); phantoms x3 (134); bastions x2 `{elite:true}` (138); `pod civilian 3 @360` (142); `pincer dart x16` (146); `if coop` `pod civilian 3 @300` (150); needlers x2 (152); `waitClear 18` (156) |
| 158-171 | LAST BREATH: `pickup weapon_up`, `radio m5_last` (158); `call kestrel_escort {life:12}`, `radio m5_sparrow` (161); `vee dart x9` (162); `column gnat x8` both edges + `pod civilian 2 @360` (166); `waitClear 10` (170) |
| 172-187 | `pickup repair @360` + `pickup missile @240` · `bg boss` · `scroll 30` (172); `radio m5_boss_warn` (173); `banner WARNING / OUROBOROS, throne of the Hierarch` (175); `boss boss_ouroboros` (177); `afterBoss`: `bg finale` + `radio m5_win` (177.1), `radio m5_win2` (181), `radio m5_win3` (184), `end` (187) |

## 5. Side stories

Shared rules:
- `kind:'side'`, music `mus_side`, boss music `mus_miniboss`, 2:30-2:50 each, ending in a mini-boss (section 8).
  Mission `tune`: s1 0.92 / 0.90, s2 1.00 / 1.00, s3 1.05 / 1.10, s4 1.10 / 1.20.
- **Unlock** (`SL.progress.sideUnlocked(sN)`): (`save.flags.unlock_sN` AND mN done) OR m(N+1) done; s4's
  fallback is m5 done. The fallback shows the star-map toast "Halcyon patrols found {name}. {TITLE} unlocked."
- **The choice:** one `choice` event per story. `SL.story.choices[id] = {who, title, prompt, options:[{id,
  label, line, skill}]}`. The dialog dims the field to 35%, shows the speaker's portrait, the title, the prompt
  and two option cards: label, the pilot's line, then the skill name in its branch color with an `ACTIVE` or
  `ALWAYS ON` tag and its one-line effect (section 14). Either pilot may choose. After the pick the chosen line
  plays in the radio box from `p1`/`p2`, play resumes with `SL.fx.slowmo(0.4, 1.0)` so players can re-orient,
  and timeline events tagged `[optionId]` (`if: s => s.flags.sN_choice === 'optionId'`) take over.
- **Rewards:** first clear pays the completion bonus, 1 SP and the chosen option's skill. Replays pay 50% of
  the completion bonus and the skill of the picked option if it is not owned yet. On replay the option whose
  skill is not owned shows a gold `NEW SKILL` tag; owned ones show `EARNED`. Failing awards no skill.

### 5.1 s1: LANTERN RUN

- **Location:** Cold Harbor, Callisto. **Target:** 2:40. **Mini-boss:** `mb_hailstorm`. **Rewards:** 500, 1 SP.
- **Premise:** Cold Harbor is evacuating on its last liner, the *Lantern*: 1,200 people, including Patch's
  brother Milo. Nyx hunters swarm the launch, and the ice-drill ship HAILSTORM is coming to spear it.
- **Structure:** escort `ally_lantern` (HP 2,000, x1.5 on Cadet; hit by enemy bullets at their class damage;
  climbs from y 1150 to 940 over 10 s and holds; the HUD shows a green `LANTERN` hull bar). At 0 HP the mission
  fails with `session.flags.failReason = 'The Lantern is lost.'`. Hunters 0-46 s, the CHOICE at 48 s, the branch
  50-98 s with a blizzard at 70 s, HAILSTORM at 104 s.
- **Background `bg_callisto`:** palette deep `#05080f`, ice `#cfe6f5` (edges only), dock metal `#3a4658`, dock
  lights `#7fd6ff`, Lantern lights `#ffd27a`, Jupiter `#4a3426`. Layers: L0 gradient `#05080f` to `#0b1424`;
  L1 stars; L2 a huge dim Jupiter on the lower-left horizon (r 1200, banded, alpha 0.45, parallax 0.02); L3
  Callisto's cratered ice falling away below with Cold Harbor's domes and launch rails (parallax 0.4); L4 ice
  floes and spires (parallax 0.8); L5 snow streaks (parallax 1.4). Phases `colony`, `blizzard` (ice fog, white
  streaks, 20% darker), `boss`, `orbit` (after the boss: the Lantern climbs into open stars).
- **Hazard:** `asteroid_storm {variant:'ice', duration:24, density:1.0}` at 70 s.
- **Enemies:** gnat, dart, wasp, spear, hornet, manta, snatcher. Hornets spawned with `{target:'lantern'}`
  aim at the liner.
- **CHOICE `s1_choice`** (48 s, speaker `tamsin`, title `SHIELDS FAILING`).
  Prompt: "The Lantern's shield is failing, pilot. Stay on us, or pull the hunters away?"
  - `guard_liner` · **STAY ON THE LINER** · "Nothing touches the Lantern." · awards `sk_bulwark`.
    After: a cyan shield-relay ring (r 220) surrounds the Lantern; while a player is inside it the Lantern takes
    30% damage. The Lantern stays on screen until the boss and is aimed at half the time (`aimBait 0.5`). Waves
    come straight down the middle; two pods fall from its damaged hab deck at 60 s.
  - `draw_fire` · **DRAW THEIR FIRE** · "Light me up. I'll pull them away." · awards `sk_decoy`.
    After: the choosing player carries a pink target beacon for 50 s and every aimed shot targets that player;
    hunter waves get 20% more members. The Lantern climbs off the top at 52 s and is safe. Three pods of
    colonists who missed the liner appear among the hunters at 60 s.
- **Pods:** civilian 3 (19), crew 2 (40); `[guard_liner]` civilian 3 + civilian 2 (60); `[draw_fire]` civilian 2
  x3 (60); civilian 3 (84). Co-op: + civilian 3 (30).
- **Radio cues:** `s1_open, s1_liner, s1_hunters, s1_guard, s1_draw, s1_blizzard, s1_boss_warn, s1_boss_intro,
  s1_boss_p2, s1_win_guard, s1_win_draw, s1_lantern_hit, s1_lantern_low`.

| t | Beats |
|---|---|
| 0-19 | `banner LANTERN RUN / Cold Harbor, Callisto` · `music mus_side` · `scroll 70` · `bg colony`; `call lantern_launch` (0.5); `radio s1_open` (1.5); `vee dart x7` (4); `arc_sweep gnat x8` both sides (7, 9); hornet `{target:'lantern'}`, `radio s1_liner` (11); `pincer dart x10` (15); `pod civilian 3 @200` (19) |
| 21-46 | wasps x2 (21); `staircase gnat x8` (25); manta (28); `pickup weapon_up` (31); `side_stream dart x8` (34); hornet `{target:'lantern'}` (37); `pod crew 2 @520` (40); `waitClear 10` (44); `radio s1_hunters` (46) |
| 48 | `choice s1_choice`; `[guard_liner]` `radio s1_guard` + `call lantern_relay`; `[draw_fire]` `radio s1_draw` + `call target_beacon {seconds:50}` + `call lantern_depart` |
| 50-68 | `pincer dart x12` (50); `[guard_liner]` hornets x2 `{target:'lantern'}`, `[draw_fire]` `snake spear x5` (54); `vee wasp x5` (58); branch pods (60); mantas x2 (64); `waitClear 12` (68) |
| 70-98 | `bg blizzard` + `hazard asteroid_storm {variant:'ice', duration:24, density:1.0}`, `radio s1_blizzard` (70); `rain gnat x12` (74); `side_stream dart x10` (80); `pod civilian 3 @360` (84); wasps x3 (88); `pickup weapon_up` (94); `waitClear 12` (98) |
| 100-104 | `pickup repair` · `bg boss` · `scroll 40` (100); `radio s1_boss_warn` (101); `boss mb_hailstorm` (104); `afterBoss`: `bg orbit` + `[guard_liner]` `radio s1_win_guard` / `[draw_fire]` `radio s1_win_draw` |

### 5.2 s2: LAGRANGE DEEP

- **Location:** Lagrange Deep station, edge of Kerr's Eye. **Target:** 2:30. **Mini-boss:** `mb_tether`.
  **Rewards:** 550, 1 SP.
- **Premise:** With its leash cut in m2, Kerr's Eye drifted into Osei's research station. The Nyx tug TETHER
  is hauling the wreck into the hole to bury her research. Her crew and her gravity core are still aboard.
- **Hazard layout:** the whole mission sits under the Eye: `black_hole {size:'large', x:360, y:-60, fixed:true,
  pullMul:0.7, life:0}` (lens at the top center, pull covering the top half). Pods enter from the sides at
  y 700-800 and drift up toward the hole at 30 px/s, so players must fly up into the pull to save them.
- **Background:** `bg_kerr` phase `lagrange` (the station's spine and broken modules scroll by, all tilting
  toward the hole), then `boss`, then `calm`.
- **Enemies:** gnat, dart, spear, needler, weaver, manta.
- **CHOICE `s2_choice`** (46 s, speaker `osei`, title `THE STATION SPLITS`).
  Prompt: "The station's splitting! I can save the gravity core or open the hab ring. Not both."
  - `save_core` · **SAVE THE CORE** · "Grab the core. It's how we win this war." · awards `sk_singularity`.
    After: `prop_core` (a glowing violet sphere r 26) tethers 70 px behind the choosing player for the rest of
    the mission. It bends enemy bullets within 110 px toward itself (300 px/s^2) and swallows them, but slows its
    carrier by 15%, and spears and darts dive at it (each hit knocks the carrier 40 px; the core cannot break).
    The crew escapes in its own lifeboats: no extra pods.
  - `save_crew` · **SAVE THE CREW** · "Open the hab ring. People first." · awards `sk_repulsor`.
    After: 6 pods of 3 people burst from the station over 20 s and drift up toward the horizon at 45 px/s; a pod
    that crosses the horizon is lost. At 68 s the abandoned core falls in and releases a gravity wave: a ring
    expanding from the hole at 600 px/s that pushes players 220 px down and erases every enemy bullet it passes.
- **Pods:** civilian 2 `{x:40, y:760, vx:40}` (10), crew 2 `{x:680, y:800, vx:-40}` (24); `[save_crew]` hab pods
  6 x 3 (46-66); civilian 2 `{x:40, y:720, vx:40}` (64). Co-op: + civilian 3 (30).
- **Radio cues:** `s2_open, s2_pull, s2_station, s2_core, s2_crew, s2_wave, s2_boss_warn, s2_boss_intro,
  s2_boss_p2, s2_win_core, s2_win_crew`.

| t | Beats |
|---|---|
| 0-24 | `banner LAGRANGE DEEP / Edge of Kerr's Eye` · `music mus_side` · `scroll 60` · `bg lagrange`; `hazard black_hole {size:'large', x:360, y:-60, fixed:true, pullMul:0.7, life:0}` (0.5); `radio s2_open` (1.5), `radio s2_pull` (4); `side_stream dart x8` both sides (5, 7); pod (10); weaver `{hoverY:420}` (12); `pincer gnat x12` (16); needlers x2 `{hoverY:380}` (20); pod (24) |
| 26-44 | `snake dart x8` (26); `pickup weapon_up` (30); mantas x2 `{hoverY:420}` (32); `rain gnat x12` (38); `waitClear 10` (42); `radio s2_station` (44) |
| 46 | `choice s2_choice`; `[save_core]` `radio s2_core` + `call attach_core`; `[save_crew]` `radio s2_crew` + `call hab_pods {count:6, people:3, over:20}` |
| 50-82 | `side_stream dart x10` both sides (50, 54); `[save_core]` `vee spear x5 {target:'core'}` (52), `snake spear x6 {target:'core'}` (62); weavers x2 (58); pod (64); `[save_crew]` `call core_collapse` + `radio s2_wave` (68); `pincer dart x12` (70); `pickup weapon_up` + needler (76); `waitClear 12` (82) |
| 84-88 | `pickup repair` · `bg boss` · `scroll 30` (84); `radio s2_boss_warn` (85); `boss mb_tether` (88); `afterBoss`: `bg calm` + `radio s2_win_core` / `radio s2_win_crew` |

### 5.3 s3: ROOK'S GAMBIT

- **Location:** the Boneyard, Tantalus Nebula. **Target:** 2:30. **Mini-boss:** `mb_mantis`. **Rewards:** 600, 1 SP.
- **Premise:** The Nyx ace Mantis hunts the Boneyard, a field of dead warships in a calm pocket of the storm.
  Rook flies a borrowed *Kestrel* on your wing, looking for payback.
- **Structure:** `ally_rook` (HP 600, hittable, flies off P1's left wing firing needles at 70 DPS; HUD bar
  `ROOK`). At 0 HP she ejects a crew pod (1 person) and `s3_obj_rook` fails; the mission goes on.
- **Background:** `bg_tantalus` phase `boneyard` (derelict hulks 300-800 px long, broken and dark, slowly
  rotating; calm nebula; no lightning), then `boss`.
- **Hazard:** `mine_field {count:14, duration:40, drift:45}` at 7 s.
- **Enemies:** dart, wasp, spear, skimmer, hornet, needler, phantom.
- **CHOICE `s3_choice`** (47 s, speaker `rook`, title `MANTIS RUNS`).
  Prompt: "Mantis is running for the mines. Chase him in, or let me rig the field for him?"
  - `chase_mantis` · **CHASE HIM DOWN** · "Throttle up. He doesn't get away." · awards `sk_overdrive`.
    After: scroll 220 with speed lines; field mines drift at 160 px/s (`mine_field.setDrift`); two spear packs
    come from behind (`column spear x5 {fromBottom:true}`, with a `BEHIND YOU` chevron on the bottom edge 1.0 s
    before each); Mantis makes two invulnerable strafing passes ahead firing needle streams.
  - `rig_field` · **RIG THE FIELD** · "Set the trap. Make him come to us." · awards `sk_salvo`.
    After: scroll 30 (holding position). Rook tags the field (`mine_field.rig`): every mine turns gold, never
    hurts players, and explodes on enemy contact or when shot (blast r 140, 600 damage to enemies, MANTIS
    included), chaining. Waves pour in from the top and sides. Rook fires a 12-missile swarm every 10 s
    (30 damage each): the trick she later teaches you.
- **Pods:** crew 2 (19), civilian 3 (58), civilian 2 + crew 1 (72). Co-op: + civilian 3 (26).
- **Radio cues:** `s3_open, s3_mines, s3_mantis, s3_rook_mad, s3_chase, s3_rig, s3_behind, s3_boss_warn,
  s3_boss_intro, s3_boss_p2, s3_boss_p3, s3_win_chase, s3_win_rig, s3_rook_down`.

| t | Beats |
|---|---|
| 0-19 | `banner ROOK'S GAMBIT / The Boneyard` · `music mus_side` · `scroll 80` · `bg boneyard`; `call spawn_rook` (0.5); `radio s3_open` (1.5); `vee dart x7` (4); `hazard mine_field {count:14, duration:40, drift:45}`, `radio s3_mines` (7); skimmer left (10); `arc_sweep dart x8` (13); hornet (16); `pod crew 2 @520` (19) |
| 22-44 | `pincer dart x10` (22); skimmer right + wasps x2 (26); `pickup weapon_up` (30); `staircase wasp x5` (34); `waitClear 10` (38); `call mantis_flyby {path:'diag_lr'}`, `radio s3_mantis` (40); `radio s3_rook_mad` (44) |
| 47 | `choice s3_choice`; `[chase_mantis]` `radio s3_chase` + `scroll 220` + `call mines_drift {px:160}`; `[rig_field]` `radio s3_rig` + `scroll 30` + `call rig_mines` + `call rook_swarm {every:10}` |
| 50-84 | `pincer dart x12` (50); `[chase_mantis]` `call behind_warning` + `column spear x5 {fromBottom:true}` (54, 66), `radio s3_behind` (54), `call mantis_flyby {path:'diag_rl', fire:true}` (60); `[rig_field]` `side_stream wasp x6` both sides (54), `rain dart x14` (66); pod (58); phantoms x2 (62); needlers x2 (70); pods (72); `pickup weapon_up` (76); `arc_sweep dart x10` (80); `waitClear 12` (84) |
| 86-90 | `pickup repair` · `bg boss` · `scroll 70` (86); `radio s3_boss_warn` (87); `boss mb_mantis` (90); `afterBoss`: `radio s3_win_chase` / `radio s3_win_rig` |

### 5.4 s4: SEED OF NIGHT

- **Location:** Collapsar Foundry, Tartarus approach. **Target:** 2:50. **Mini-boss:** `mb_crucible`.
  **Rewards:** 650, 1 SP.
- **Premise:** Ixa's codes open the Collapsar Foundry, where the Armada grows black holes from seeds held in
  magnetic cages. The ripest seed is meant for the OUROBOROS. Human captives work the foundry floor.
- **Background:** `bg_tartarus` phase `foundry` (orange-violet forge glow `#3a1a2a` / `#ff8a5c` at alpha
  <= 0.3, scaffolds, seed cages as dim rings), then `boss`.
- **Hazards:** two caged seeds `black_hole {size:'small', fixed:true, life:40}` at (160, 420) and (560, 640)
  from 12 s; `wormhole {a:[200,300], b:[520,940], life:18}` at 28 s.
- **Enemies:** gnat, dart, wasp, warper, phantom, weaver, bastion, hive.
- **CHOICE `s4_choice`** (58 s, speaker `ixa`, title `THE SEED WAKES`).
  Prompt: "The seed is waking. Detonate it here, or carry it out on your tractor beam?"
  - `detonate_seed` · **DETONATE IT** · "Nobody gets a weapon like that." · awards `sk_time_dilation`.
    After: the seed bursts into a time-distortion field. Every 12 s a blue time wave sweeps down the screen and
    calls `SL.skills.dilate(3, 0.4)` (section 14): the world runs at 40% while the jets stay at full speed.
    The foundry collapses: `asteroid_storm {variant:'debris', density:0.6, duration:44}` until the boss.
  - `steal_seed` · **STEAL IT** · "Bag it. We'll turn it on them." · awards `sk_event_horizon`.
    After: `prop_seed` (a tiny black hole, horizon r 10, lens strength 0.4) orbits the choosing player at 60 px,
    2 rad/s. It swallows enemy bullets that touch it (r 18) and pulls enemy bullets within 100 px (260 px/s^2),
    but it also tugs pickups away from the player, and hunter waves get 30% more members.
- **Pods (captives, violet-barred civilian pods):** captive 2 (20), captive 2 + captive 2 (38), captive 3 (70),
  captive 2 (88). Co-op: + captive 3 (44).
- **Radio cues:** `s4_open, s4_cages, s4_wormhole, s4_seed, s4_detonate, s4_steal, s4_boss_warn, s4_boss_intro,
  s4_boss_p2, s4_boss_p3, s4_win_detonate, s4_win_steal`.

| t | Beats |
|---|---|
| 0-28 | `banner SEED OF NIGHT / Collapsar Foundry` · `music mus_side` · `scroll 70` · `bg foundry`; `radio s4_open` (1.5); `pincer dart x12` (3); warpers x2 (6); `vee wasp x5 {elite:true}` (9); caged seeds x2, `radio s4_cages` (12); `ring_in gnat x12` (16); pod (20); weaver `{elite:true}` (22); `side_stream dart x10` (26); `hazard wormhole`, then `pickup weapon_up` + `radio s4_wormhole` (28, 30) |
| 34-56 | phantoms x2 (34); pods x2 (38); bastion `{elite:true}` (42); `rain dart x14` (48); `waitClear 12` (54); `radio s4_seed` (56) |
| 58 | `choice s4_choice`; `[detonate_seed]` `radio s4_detonate` + `call time_waves {every:12, seconds:3, scale:0.4}` + debris storm; `[steal_seed]` `radio s4_steal` + `call attach_seed` |
| 62-96 | `pincer dart x14` (62); warpers x3 (66); pod (70); `escort_box {leader:'hive', escort:'wasp', count:4}` (72); `[steal_seed]` `arc_sweep phantom x4` both sides (78); `pickup weapon_up` (80); `side_stream wasp x6 {elite:true}` (84); pod (88); weavers x2 (90); `waitClear 14` (96) |
| 98-102 | `pickup repair` · `bg boss` · `scroll 30` (98); `radio s4_boss_warn` (99); `boss mb_crucible` (102); `afterBoss`: `radio s4_win_detonate` / `radio s4_win_steal` |

## 6. Enemy roster

Nyx Armada style (all enemies): graphite hulls (`#1c1f2b` base, `#3a3f55` light plates) drawn with
`SL.art.metal`, pink-magenta seams `#ff2f6d` pulsing at 0.8 Hz, glowing pink eye/canopy lights `#ff5c8a`,
orange engines `#ff7a3d` with live `SL.art.flame` plumes pointing up (enemies face down), sharp insect-like
silhouettes. All bank up to 0.3 rad into turns and keep a 1-2 px idle bob. **Elites** (`opts.elite`): HP x1.6,
fire rate x1.25, +1 bullet per volley, seams `#ffb0c8` with a 1 px gold rim, score and credits x1.5, drop chance
+10 points. A new enemy never fires aimed shots in its first 0.6 s on screen. Explosion sizes: popcorn `s`,
fighters `m`, gunships `l`, heavies `xl`; palette `enemy` unless noted.

| id | Name | Class | Sprite (px) | r | HP | Speed | Score | Credits | Drop | Table | First |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `gnat` | Gnat drone | popcorn | 34 x 30 | 14 | 22 | 240 | 50 | [1,1] | 1% | `drop_small` | m1 |
| `dart` | Dart interceptor | popcorn | 44 x 48 | 18 | 32 | 300 | 80 | [1,2] | 2% | `drop_small` | m1 |
| `wasp` | Wasp fighter | fighter | 64 x 60 | 26 | 75 | 220 | 200 | [2,4] | 6% | `drop_fighter` | m1 |
| `snatcher` | Snatcher tow drone | fighter | 56 x 56 | 22 | 70 | 240 | 400 | [4,6] | 10% | `drop_fighter` | m1 |
| `spear` | Spear rammer | fighter | 40 x 70 | 20 | 60 | 200 (dash 720) | 150 | [2,3] | 5% | `drop_fighter` | m2 |
| `needler` | Needler sniper | fighter | 70 x 70 | 24 | 90 | 200 | 240 | [3,5] | 8% | `drop_fighter` | m2 |
| `skimmer` | Skimmer minelayer | fighter | 90 x 46 | 28 | 85 | 180 | 220 | [3,4] | 8% | `drop_fighter` | m3 |
| `hornet` | Hornet missile boat | fighter | 80 x 74 | 30 | 100 | 160 | 260 | [3,5] | 10% | `drop_fighter` | m3 |
| `phantom` | Phantom cloak jet | fighter | 72 x 64 | 26 | 100 | 260 | 350 | [4,6] | 10% | `drop_fighter` | m4 |
| `warper` | Warper blink jet | fighter | 76 x 76 | 26 | 95 | blink | 380 | [4,6] | 10% | `drop_fighter` | m5 |
| `manta` | Manta gunship | gunship | 140 x 100 | 48 | 320 | 120 | 900 | [10,14] | 30% | `drop_gunship` | m1 |
| `weaver` | Weaver spiral gunship | gunship | 110 x 110 | 46 | 380 | 140 | 1,000 | [12,16] | 30% | `drop_gunship` | m2 |
| `stormcaller` | Stormcaller | gunship | 120 x 90 | 44 | 420 | 120 | 1,100 | [12,18] | 30% | `drop_gunship` | m3 |
| `hive` | Hive carrier | heavy | 220 x 200 | 86 | 1,000 | 80 | 3,500 | [35,50] | 100% | `drop_heavy` | m1 |
| `bastion` | Bastion armored barge | heavy | 240 x 180 | 90 | 1,200 | 70 | 4,000 | [40,55] | 100% | `drop_heavy` | m3 |
| `tug` | Collapsar tug | heavy | 200 x 160 | 80 | 1,400 | 60 | 4,500 | [45,60] | 100% | `drop_heavy` | m2 |

Enemy defs set `dropChance` and `dropTable` (section 10.3); `SL.pickups.drop(e)` rolls them.

- **`gnat`.** Triangular arrowhead, two tiny swept fins, one pink center seam, one engine dot with a 10 px plume.
  Follows its formation path and never stops. No attack in m1-m2; from m3 each gnat has a 15% chance to fire one
  aimed `orb` (200) as it passes y 300. Pops in a white flash and 6 sparks.
- **`dart`.** Needle nose, forward-swept W wings, twin small engines, pink cockpit slit. Follows the path, then
  peels off in an arc toward the nearest player's x and exits. One aimed `needle` (340) when it first crosses
  y 220 (in m1 only every other dart fires).
- **`wasp`.** Twin-boom fighter: central pod with a glowing canopy, booms ending in nacelles, a tail wing, two
  wing guns with orange muzzle lights. Enters to `hoverY` (default 280), strafes +-140 px (0.5 Hz) for 6 s, exits
  down and sideways. `burst` of 3 `orb` (230, 0.12 s apart) every 1.6 s; wing guns glow 0.3 s first. A small
  sidestep beats the burst.
- **`snatcher`.** Spider drone: round body, pink eye, four jointed claw legs, a tractor emitter. Flies to the
  nearest free pod (or the VIP pod first); within 30 px it latches (`pod.towedBy = e`) and climbs at 90 px/s in a
  pale red tractor cone; leaving the top with the pod loses it. Killing it frees the pod (`+300 SAVED` text and
  300 x multiplier score). With no pod on screen it hovers and fires a `ring` of 6 `orb` (150) every 3 s.
- **`spear`.** Long lance nose, tiny rear delta wings, one big engine; the nose glows red when locking. Enters
  to y 160-300, turns toward its target for 0.8 s while a thin red line shows the dash path, then dashes
  straight at 720 px/s off screen (the ram is the attack). From m4 it sheds 4 `shard` (2 per side,
  perpendicular, 120) as the dash starts. Step off the red line during the lock.
- **`needler`.** Central sphere with four stubby vanes, a long barrel and a red scope light. Parks at `hoverY`,
  bobs 4 px, leaves after 12 s. `sniper_line`: a thin red sight tracks the target for 1.0 s (max 1.2 rad/s),
  locks 0.25 s (flares white), fires 1 `needle` at 620 (3 needles 0.08 s apart from m4); every 3.0 s.
- **`skimmer`.** Flat catamaran jet flying sideways, violet-lit mine racks, engines on the trailing side. Enters
  from `side` at a fixed y (260-420), crosses, exits the far edge. `mine_lay` (a `mine` every 0.7 s) plus 2
  aimed `orb` (200) every 2 s. Shoot the mines as they drop or cross behind once they are cleared.
- **`hornet`.** Fat bomber with four orange-capped missile tubes, short thick wings, armored nose. Hovers at
  `hoverY` 8 s drifting 40 px/s, exits up. `homing_salvo` of 2 `missile` every 2.4 s (caps flash 0.4 s first).
  Missiles are shootable (10 HP, +20 score each).
- **`phantom`.** Faceted black-glass stealth delta with a faint violet edge. Cloaked: alpha 0.12 plus a moving
  shimmer outline, invulnerable and `untargetable`. Moves cloaked to near the target's x at y 200-400, decloaks
  over 0.4 s (sparkle telegraph), fires a `fan` of 5 `needle` (300, spread 0.5), stays visible 1.4 s, cloaks
  again; three cycles, then leaves. Explodes in palette `violet`.
- **`warper`.** Torus ring-wing around a central pod with a violet core; collapses to a point of light when it
  blinks. Shows a violet ring (r 30) where it will reappear, vanishes 0.5 s later and reappears there; 4 blinks
  1.6 s apart, then exits; uses a wormhole when one is within 200 px. Each reappearance fires a `ring` of 10 `orb`
  (140). Palette `violet`.
- **`manta`.** Manta ray: wide back-swept wings, a raised spine with a pink seam, two horns, three plumes; the
  wings ripple (x scale 0.98-1.02, 0.7 Hz). Enters to y 260, glides +-160 px for 10 s, exits after 14 s.
  `ring_stagger` of 12 `orb` (150) every 2.2 s; from m2 also an aimed `fan` of 5 `orb` (200, spread 0.6) every
  3.3 s from the horns. Rings have 30-degree gaps to thread.
- **`weaver`.** Disc with three rotating spokes (1 turn per 3 s) ending in emitter pods, central pink eye dome.
  Hovers at `hoverY` 12 s. `spiral` 3 arms (an `orb` every 0.11 s per arm, 170, spin 1.4 rad/s), 2.0 s on, 1.2 s
  off; elites add a counter-rotating `petal` spiral. Circle with the spiral; dart through on the off beat.
- **`stormcaller`.** Gunship with two tall tesla-coil antennae (stacked rings) crawling with violet-white
  sparks. Hovers at `hoverY`. A `fan` of 5 `spark` (210, spread 0.8) every 2.4 s. Pair arc: two stormcallers
  within 520 px link every 4 s (a thin violet line between the coils for 0.8 s, then an enemy beam of width 14
  along it for 0.6 s); killing either breaks the arc. Ion storm strikes do not hurt it. Palette `blue`.
- **`hive`.** Bulbous carrier with a honeycomb hangar face (hex bay doors glowing orange), four docking claws,
  two big engines. Descends to y 220 at 80 px/s, drifts +-50 px. Launches 2 gnats every 2.5 s (max 10 alive);
  from m3 also a `ring` of 8 `orbBig` (120) every 4 s. Its bay takes x1.5 damage for 0.6 s after each launch.
- **`bastion`.** Brick-shaped heavy cruiser: thick riveted front plates `#4a5068`, stepped superstructure, two
  twin-barrel side turrets, four rear engines; the prison variant (`cargo`) shows rows of white-green pod cells.
  Descends to y 280, drifts +-60 px, leaves after 22 s (never while carrying `cargo`). Hits inside its front
  120-degree cone deal x0.5 (white sparks, `hit_armor`). Each turret fires an aimed pair of `orbBig` (190) every
  1.8 s, alternating; the prow fires `wall_gap` every 5 s. On death it releases its `cargo` (a list of `[kind,
  people, vip]`) as pods via `SL.rescue.spawnPod`.
- **`tug`.** Squat armored body with two long claw arms cradling a black hole 120 px below its center; violet
  magnetic coils glow on the claws. Descends to y 240, sways +-80 px. 3 aimed `void_orb` (160) every 2.0 s. On
  spawn it calls `SL.spawnHazard('black_hole', {size: opts.hole || 'medium', attachTo: e, offsetY: 120})`; on
  death the hole is released (section 9.1).

**Targets.** Spawn option `target`: `'lantern'`, `'core'`, `'vip'` or `'pod'` makes the enemy aim or dive at that
mission entity while it exists (resolved by `SL.patterns.target`).

### 6.1 Formations

`SL.formations.define(id, (opts) => enemies[])`; members are spawned with `opts.enemy` unless noted. Shared opts:
`side:'left'|'right'`, `fromBottom:true` (enter from y 1340 heading up, with a 1.0 s red chevron warning on the
bottom edge), `elite`, `target`.

| id | Description |
|---|---|
| `vee` | V of `count` (5-9) at 70 px spacing descending at 180 px/s, leader at `x`; holds 1 s at y 260, then the wings peel outward and dive. |
| `line` | Horizontal line (`gap` 80 px, `stagger` ms between members) descending straight. |
| `column` | Single file down `x` at 60 px spacing; optional `weave` (sine amplitude px). |
| `arc_sweep` | Enters at a top corner (`side`) and sweeps a quarter circle (r 420) across the screen to the far side; 0.18 s between members. |
| `pincer` | Two halves enter from both top corners, cross in an X at y 400, exit the opposite bottom corners. |
| `snake` | Follow-the-leader sine down the screen from `x` (amplitude 140, wavelength 360 px). |
| `staircase` | Diagonal stagger from `side`: members appear at x steps of 90 and y steps of 60, descend 200 px, then turn toward the far side. |
| `ring_in` | Members appear on a circle (r 300) around (`x`, 360), spiral inward for 2 s, then fall out the bottom. Black-hole food. |
| `side_stream` | A stream entering from `side` at y 200-500, crossing horizontally on a gentle arc; 0.25 s between members. |
| `rain` | Members dropped at seeded random x over 3 s, straight down, speed +-20%. |
| `escort_box` | A `leader` with `count` `escort`s at box corners (+-90 px) mirroring its moves; escorts break and dive when the leader dies. |

**Formation bonus.** When every member of a formation is destroyed by players (none escaped), the last one
drops `SL.pickups.roll('drop_formation')` and the HUD floats `FORMATION +{bonus}` with bonus = 100 x members x
multiplier (`escort_box` counts escorts only); sfx `formation_bonus`. This is the main power-up pacing tool.

## 7. Bullets and patterns

### 7.1 Readability and fairness

- Enemy bullets are white-hot at the core with a saturated halo (pink `#ff4fd8`, orange `#ff8a3d`, violet
  `#b26bff`, red `#ff3b4f`) and draw above everything except hazard overlays. Halos are cached sprites per type
  and color. Size tells damage: `s` bullets r <= 6, `m` r 8-12, `l` r >= 16.
- No enemy bullet spawns within 120 px of a living player. Bullets slower than 100 px/s must be large
  (`orb_huge`, `flare`, `mine`). Every burst of 5 or more bullets is preceded by a 0.3-0.6 s charge glow on its
  emitter (sfx `enemy_charge`).
- Warning lines (beams, dashes, snipers, harpoons) are 2 px `#ff3b4f` at alpha 0.45, pulsing at 6 Hz, flashing
  white for the final 0.15 s. Area strikes use a dashed ring. Off-screen threats show a red edge glow on their
  side.
- Soft cap: above 520 enemy bullets, `spiral`, `stream` and `rain_curtain` halve their emission rate.

### 7.2 Enemy bullet types (`SL.ebulletTypes`)

| id | Look | r | Damage | Behavior |
|---|---|---|---|---|
| `orb` | Round, white core r 3, pink halo (color option) | 6 | s | Straight. The workhorse. |
| `orbBig` | White core r 5, orange halo, faint outer ring | 11 | m | Straight, usually 120-200. |
| `orb_huge` | White core r 9, red halo, outer ring pulsing at 3 Hz | 20 | l | Slow (80-140); landmarks and split carriers. |
| `needle` | Capsule 4 x 22 along velocity, white core, violet edge (`orient`) | 4 | s | Fast (300-620). |
| `shard` | Spinning diamond 8 x 14, white core, orange halo | 6 | s | Straight; split product. |
| `mine` | Dark sphere r 10, blinking pink light ring | 10 | m | Decelerates to 0 over 0.4 s, arms after 0.5 s; a player within 90 px makes it pop into a `ring` of 8 `orb` (160) after 0.3 s. A hit on a player destroys it without the ring. Fizzles after 6 s. |
| `missile` | Body 8 x 20, steel nose, orange exhaust trail (`orient`) | 8 | m | 150 to 260 (accel 140), homing 1.6 rad/s for 2.5 s, then straight. Shootable: 10 HP, +20 score. |
| `spark` | 3-segment jagged bolt, white core, violet halo | 5 | s | Straight with +-18 px lateral jitter at 12 Hz (`wave`). |
| `petal` | Teardrop, white core, pink-to-violet gradient (`orient`) | 6 | s | Constant `turn` (+-0.9 rad/s) for 1.2 s, then straight. |
| `flare` | Flickering fireball, white-yellow core, orange-red corona | 16 | l | Slow (110-130); usually `split` into `shard`. |
| `void_orb` | Dark core, violet rim, white pinpoint, faint shimmer | 8 | m | Gravity coupling 2.5: its own `update` adds 1.5x the local `h.gravity` pull on top of core bending. |
| `beam` | Core enemy beam restyled: white core, pink edges, crackling edge sparks | width | 45/s | Telegraph line first (core `fireEnemyBeam`). |

Gravity coupling: black holes bend normal enemy bullets at 0.6x their player pull and player bullets at 0.35x
(section 9.1); `void_orb` at 2.5x.

### 7.3 Pattern library (`SL.patterns`)

All take `(src, ..., opts)` and return the bullets fired. Counts marked x`fr` scale with `SL.game.diff.fireRate x
mission.tune.fireRate` (rounded, never below 60% of base); bosses pass their own numbers.

| id | Description | Defaults |
|---|---|---|
| `aimed` | N bullets centered on the target | count 1, spread 0.18 x (n-1), speed 240, type `orb` |
| `burst` | `aimed` repeated `shots` times, re-aiming unless `lock` | count 1, shots 3, gap 0.12, speed 230 |
| `fan` | N bullets across `spread` around `angle` | count 5, spread 0.9, speed 220, angle PI/2 |
| `ring` | N bullets evenly around 360 deg | count 12 x`fr`, speed 180, offset 0 |
| `ring_stagger` | Rings alternating a half-gap offset each volley | count 12 x`fr`, speed 150, every 2.2 |
| `spiral` | Continuous emission from rotating arms with a duty cycle | arms 3, rate 9/s/arm x`fr`, spin 1.4, speed 170, on 2.0, off 1.2 |
| `double_spiral` | Two spirals spinning opposite ways (lattice of crossings) | arms 2+2, rate 8/s, spin +-1.2, speed 160 |
| `stream` | Fast line of bullets with slow tracking | rate 12/s, duration 1.0, speed 320, track 0.6, type `needle` |
| `wave` | Fan whose bullets weave sideways | count 7, spread 1.0, speed 180, amp 40, freq 1.2 |
| `flower` | Petals curving alternately left and right | count 16 x`fr`, speed 150, turn +-0.9, type `petal` |
| `wall_gap` | Horizontal wall with a gap at the target's x | count 14, spacing 52, gap 104, speed 140 |
| `rain_curtain` | Bullets falling from the top edge in columns with moving safe lanes | rate 14/s, duration 3, speed 220 +-40, type `shard`, safeLanes 2 (90 px), laneShift 1.5 s |
| `lattice` | Two sets of diagonal lines crossing into diamond safe cells | lines 6 per side, angle +-0.5 from down, spacing 120, speed 160 |
| `pinwheel` | Straight streams from a rotating emitter | arms 4, spin 0.9, rate 10/s/arm, speed 200 |
| `orbit_release` | Bullets orbit the source, then release aimed | count 16, radius 120, orbit 1.2 s, spin 2, speed 200 |
| `homing_salvo` | Missiles kicked outward, then homing | count 2, kick 120, type `missile` |
| `split_shot` | Big bullets that split after a delay | type `flare`, count 5, spread 0.9, speed 120, at 1.2, split {count 6, type `shard`, speed 180} |
| `sniper_line` | Tracking sight, lock, then fast needles | track 1.0, lock 0.25, shots 1, gap 0.08, speed 620 |
| `beam` | Core enemy beam with telegraph | width 26, telegraph 0.8, duration 1.2, follow false |
| `beam_sweep` | Beam sweeping an arc while active; telegraph shows the start line plus a curved arrow | from, to, width 30, telegraph 0.9, duration 1.6 |
| `cross_beams` | Four beams in a rotating cross | arms 4, spin 0.5, width 22, telegraph 1.0, duration 6 |
| `mine_lay` | Drops mines behind the source | every 0.7, type `mine` |
| `gravity_sling` | `void_orb`s thrown tangentially around a gravity source, slinging out toward players | count 8, speed 200, dir +-1 |

### 7.4 Targeting helper

`SL.patterns.target(src) -> {x, y, ref}`: every aimed pattern, every enemy that aims or dives, and every boss
uses it. Rules, in order: (1) if the spawn had `opts.target` and that mission entity exists (`'lantern'`,
`'core'`, `'vip'`, `'pod'`), return it; (2) collect live entities in `SL.world.allies` and `SL.world.players`
with `aimBait > 0` (the decoy skill 1.0; the Lantern with the relay ring 0.5; `ally_rook` 0.25; the s1 target
beacon sets its player's `p.data.aimBait = 1`) and pick one with probability equal to its `aimBait`; (3) else the
nearest living player (`SL.world.nearestPlayer`). Core homing bullets keep using `nearestPlayer`. Mission
entities name themselves with `targetId` (`'lantern'` on `ally_lantern`, `'core'` on `prop_core`); `'vip'` is the
newest live VIP pod and `'pod'` the nearest pod.

## 8. Bosses

Common rules (every boss and mini-boss):
- HP is Pilot solo; core scales it by `diff.enemyHp` (and x1.35 in co-op). One bar. **Parts** are separate
  enemies (`noCount`, `noClear`, `manualMove`, core recipe "destructible boss part"): a hit on a part damages the
  part and the boss bar by the same amount; when part HP reaches 0 the part breaks (its attacks stop, debris
  falls, `explode` size `l`), the bar takes the listed break bonus, sfx `boss_part_break`.
- **Phase break:** `transitionTime: 1.5`; core makes the boss invulnerable, turns bullets into credits and
  flashes; the phase `enter(b)` adds 2,000 x multiplier score (`PHASE BREAK` text) and sheds armor debris.
- Intro 3-4 s (invulnerable). Weak points flash a yellow-white hit marker. Attacks never start during the
  first 1.0 s of a phase. Bosses aim with `SL.patterns.target` and ignore mission `tune`.
- **Time bonus:** core `parTime` (listed) and `timeBonusRate` 250 points per second under par.
- **Death:** core slow-mo plus the boss's own ~3 s sequence (m5: 4.5 s) of chained explosions ending in
  `SL.game.bossDefeated(b)`; then a credit shower (listed) that flies to the nearest player.
- **Module:** bossesA (`13a_bosses.js`) builds `boss_razorback`, `boss_lodestar`, `boss_tempest`,
  `mb_hailstorm`, `mb_tether`; bossesB (`13b_bosses.js`) builds `boss_suneater`, `boss_ouroboros`, `mb_mantis`,
  `mb_crucible`.

### 8.1 `boss_razorback`: RAZORBACK, "Nyx Assault Carrier" (m1, bossesA)

- **Look (560 x 380):** wedge carrier pointing down; graphite hull with heavy specular bands, panel lines, pink
  running lights blinking along the wing edges. A dorsal spine of 6 serrated fins (40 x 70) whose edges glow pink
  when charging; two wing-root sponsons at (+-190, -20) with rotating twin-barrel turrets (r 34); a launch-bay
  mouth (120 px) at the prow with a hot orange interior; four big engines at the top with upward plumes.
- **HP 9,000;** phases at 1.0 / 0.65 / 0.30; score 50,000; parTime 75; credits 30 + 4 big. Music `mus_boss`.
- **Parts:** `turret_l`, `turret_r` (part HP 1,200, break bonus 400); bay mouth takes x1.5 while open; `core`
  exposed in phase 3 takes x2.0.
- **Intro (4 s):** its shadow crosses the dust, then it descends from y -300 to 230 in 3 s; turrets swivel on.
- **Phase 1 "Broadside":** sway +-80 px at 0.15 Hz. Turret bursts: `burst` 3 `orb` (250, gap 0.12), turrets
  alternating every 1.2 s, barrel glow 0.3 s (one sidestep per burst). Bay launch: the bay opens (0.6 s glow)
  and drops a `vee` of 4 gnats every 7 s; park under it and burst the open bay. Prow fan: `fan` 7 `orbBig`
  (180, spread 1.0) every 3.5 s.
- **Phase 2 "Spine Lance":** strafes +-200 px over 6 s. Fin sweep: the 6 fins light in order (0.15 s each),
  then fire in the same order, each a `fan` of 3 `needle` (380, spread 0.3): a curtain sweeping one way,
  alternating, every 4 s (go to the side that fired first, once it has fired). `ring_stagger` 2 rings of 14
  `orb` (170, 0.5 s apart) from the bay every 3.5 s. Surviving turrets burst every 1.6 s.
- **Phase 3 "Open Bay":** spine plates blow off and expose the core. `beam_sweep` from the core: telegraph 0.9 s
  (line plus arrow), 70 deg in 1.6 s, width 34, alternating, every 6 s (stand where it ends, slip behind the
  start line). Between beams: `spiral` 2 arms, 10/s/arm, 180, spin 1.6, 2.5 s on / 1.5 s off. Below 10%: spin
  2.2 and an aimed `orbBig` every 1.0 s.
- **Death:** six `m` explosions run down the spine, turrets tear off and tumble, the core implodes (white
  flash, `shockwave` r 400), then the `boss` explosion; `bg sunrise` follows from the timeline.

### 8.2 `boss_lodestar`: LODESTAR, "Gravity Siege Engine" (m2, bossesA)

- **Look (440 x 440):** a ring of 12 graphite armor segments (outer diameter 420, 70 px thick) with pink seams
  and 8 violet containment emitters on the inner rim; four anchor pylons (60 x 110, violet coil tips) at the
  diagonals; a captive black hole in the center (horizon r 34, an orange-white accretion swirl of two
  counter-rotating noise rings, thin photon ring). It calls `SL.render.addLens(cx, cy, horizon, 1.0)` every
  update; without distortion it draws a black disc, the photon ring and a dark radial falloff.
- **HP 16,000;** phases 1.0 / 0.70 / 0.40; score 70,000; parTime 85; credits 40 + 5 big. Music `mus_boss`.
- **Gravity:** its hole pulls players at 700 px/s^2 (range 560), 1,000 in phase 2, 1,400 in phase 3; bullets bend
  by coupling; player shots that cross the horizon are swallowed (aim at the ring). Horizon contact: 18 damage
  every 0.5 s. It publishes `b.gravity` like a black-hole hazard.
- **Parts:** `pylon_ne`, `pylon_nw`, `pylon_se`, `pylon_sw` (part HP 1,500, break bonus 400); each broken pylon
  silences its attacks and lowers the pull 10%. The hole cannot be hit.
- **Intro (4 s):** the ring descends to y 300 spinning up; the hole flares; the lens grows from 0 over 2 s.
- **Phase 1 "Orbit":** ring rotates 0.3 rad/s. Pylon rings: each pylon in clockwise order (0.6 s apart) fires a
  `ring` of 8 `orb` (170) after a 0.4 s tip flare; cycle every 4 s. `orbit_release`: 16 `void_orb` appear around
  the hole at r 110, orbit 1.2 s (their own telegraph), release aimed at 200, every 6 s.
- **Phase 2 "Undertow":** the NE and SW pylons fire `beam_sweep` (width 28) inward-down, 60 deg in 2.0 s after a
  1.0 s telegraph, every 7 s. `rain_curtain` of `shard` from the ring's lower edge (12/s for 2.5 s, 2 safe lanes)
  that bend toward the hole (follow the curve, not a straight line). `gravity_sling` 8 `void_orb` at 220 every 5 s.
- **Phase 3 "Collapse":** containment fails; the horizon grows 34 to 52 over 2 s. Gravity pulse every 6 s: a
  violet ring contracts from r 600 into the hole over 1.0 s with a rumble, then the pull spikes to 2,000 for
  1.2 s (full speed away, never focus). `double_spiral` 4 arms at 160; bullets falling into the horizon vanish.
  Below 15% ring segments break off and fall as debris props that block bullets.
- **Death:** segments spiral into the hole one by one (2 s); the hole swells and pops in a white flash with a
  ripple r 700; the lens vanishes.

### 8.3 `boss_tempest`: TEMPEST, "Storm Dreadnought" (m3, bossesA)

- **Look (640 x 300):** a long dreadnought wrapped in a skirt of churning storm cloud (noise sprite, `#141a33`
  with lit rims); two tesla spires (stacked violet-white coil rings, 60 x 150) at (+-220, -20); a central
  armored eye dome that opens like an iris; capacitor fins along the hull crackling with sparks.
- **HP 24,000;** phases 1.0 / 0.70 / 0.40; score 90,000; parTime 95; credits 50 + 6 big. Music `mus_boss_heavy`.
- **Parts:** `spire_l`, `spire_r` (part HP 2,000, break bonus 500; each broken spire removes one strike ring per
  volley and its spark fans); `eye` takes x2.0 when open (phase 3).
- **Intro (4 s):** lightning lights its silhouette inside the cloud wall three times, then it rises from y -320 to
  250 in 3.5 s with a thunder roll.
- **Phase 1 "Thunderhead":** drifts +-120 px. Spire volleys: alternating `fan` 5 `spark` (210, spread 0.7) every
  1.4 s after a 0.4 s coil glow. Lightning strikes: 3 dashed strike rings (r 70: one on the target, two random)
  strike 1.2 s later (a bolt from the top of the screen; 18 damage inside the ring, 60 to enemies) every 4 s;
  leave the ring. `wall_gap` 16 `orb` (140, gap 110 at the target's x) every 5 s.
- **Phase 2 "Fence":** lightning fences: the spires project a horizontal electric fence (two enemy beams, width
  16, from the screen edges toward a 120 px gap placed at the target's x at telegraph start); telegraph 1.0 s,
  then the fence sweeps from y 200 to 1100 at 260 px/s; every 7 s, below 55% two fences 1.6 s apart. Fly through
  the gap. Between fences `spiral` 3 arms from eye vents (8/s/arm, 170, spin 1.2, 2.0 s on / 1.4 s off).
- **Phase 3 "Eye of the Storm":** the cloud skirt tears away and the eye opens. Strike rings x5 every 3 s.
  `beam_sweep` from the eye: telegraph 1.0 s, 80 deg in 1.8 s, width 36, alternating, every 6.5 s. `flower` 16
  `petal` (150) every 3.5 s. Below 15%: strikes every 2.2 s and an aimed `orb_huge` (130) every 1.5 s.
- **Death:** 8 random bolts lash the screen, the spires explode (`l`), the eye collapses in a blue-white flash
  (palette `blue`), `boss` explosion, ripple r 600; the timeline sets `bg clear`.

### 8.4 `boss_suneater`: SUNEATER, "Stellar Harvester" (m4, bossesB)

- **Look (600 x 420):** a huge crescent hull cupping a glowing intake maw (a white-blue plasma core, iris
  petals around it) fed by a thick plasma stream from the top edge; four hexagonal mirror panels (110 px, glass
  `#1a2438` with a moving sheen `#8fb3ff`) on articulated arms, two per side.
- **HP 33,000;** phases 1.0 / 0.70 / 0.40; score 110,000; parTime 110; credits 60 + 7 big. Music
  `mus_boss_heavy`.
- **Parts:** `mirror_1`..`mirror_4` (part HP 1,800, break bonus 500; a broken mirror stops reflecting); `core`
  takes x1.5 while its iris is open (phase 2 windows) and x2.0 in phase 3.
- **Intro (4 s):** the plasma stream swells, then the harvester slides down from y -280 to 240 while its mirrors
  unfold one by one with glints.
- **Phase 1 "Collector":** mirror beams: the core fires a beam (telegraph 0.9 s; the warning line shows the full
  bent path core to mirror to target area) at a mirror, which reflects it down toward the target; width 26,
  active 1.0 s, every 3.2 s, alternating mirrors (read the bent line to its end). Plasma drip: `split_shot` 5
  `flare` (120, spread 0.9) splitting into 6 `shard` at 1.2 s, every 4 s. Lip guns: `burst` 3 `orbBig` (220) every
  2.0 s.
- **Phase 2 "Prism":** two mirrors reflect at once into a crossing V of beams (telegraph 1.1 s) every 5 s; the
  iris opens for 2 s after each V (x1.5 window). `rain_curtain` of `shard` (12/s for 3 s, 2 safe lanes) from the
  mirror edges every 8 s. Starburst: every 12 s the boss triggers one `solar_flare` burn (`SL.spawnHazard(
  'solar_flare', {from:'top', count:1, first:2.5, cover:2})`).
- **Phase 3 "Nova":** every surviving mirror breaks loose and drifts down as a shade prop
  (`SL.hazards.shadeRock(x, y, {skin:'mirror', life:8})`). Nova pulse every 8 s: the core charges 2.0 s (screen edges white, rumble, sfx
  `flare_warn`), then releases a `ring` of 36 `orb` (170) plus a burn: a jet takes 30 damage unless the segment
  from the core to the jet crosses a shade prop (hide behind falling mirrors). Between novas `double_spiral`
  4 arms (150); below 15% an aimed `orb_huge` every 2 s.
- **Death:** the plasma stream is cut, the core implodes then blooms white, the mirrors shatter into glints,
  `boss` explosion (palette `blue`); the timeline sets `bg calm`.

### 8.5 `boss_ouroboros`: OUROBOROS, "Throne of the Hierarch" (m5, bossesB)

- **Look (680 x 520):** a serpent-shaped throne ship coiled into a ring of scale-armor plates `#15161f` with pink
  seams; the serpent's head at the top center carries the throne pod, VAEL'S CROWN (140 x 120: an obsidian
  crown of 7 spikes around a violet slit eye); two collapsar engine pods at the left and right of the ring
  (90 px armored shells around dormant black holes); 8 scale turrets around the coil.
- **HP 45,000;** phases 1.0 / 0.75 / 0.50 / 0.25; score 150,000; parTime 125; credits 80 + 10 big. Music
  `mus_boss_final`.
- **Parts:** `engine_l`, `engine_r` (part HP 2,500, x0.8 when s4 is done; break bonus 1,000; breaking one
  collapses its hole); `spine` (rear weak point, only reachable in phase 3, takes x2.5); `crown` (phase 4 form).
- **Intro (4 s):** the coil rises from below the top edge, uncoiling, and the crown's eye opens; Vael speaks.
- **Phase 1 "Serpent":** the ring rotates 0.2 rad/s. Scale turrets fire `burst` 2 `orb` (240) in sequence around
  the ring (a rotating wave), each turret every 3.2 s. `pinwheel` 4 arms from the ring center (10/s/arm, 200,
  spin 0.9), 3 s on / 2 s off. Head: aimed `fan` 7 `orbBig` (190, spread 0.9) every 3 s.
- **Phase 2 "Collapsar Engines":** both engines ignite into black holes (lens strength 0.9 each; pull 700,
  range 480, published as `b.gravityList`); the pulls cancel on the midline ("stay between them").
  `gravity_sling` 8 `void_orb` from each engine every 5 s; `ring_stagger` 18 `orb` (150) from the head every
  2.5 s, bending around the holes.
- **Phase 3 "Wormhole Throne":** the head and coil raise a shield (they take x0.25) and the spine opens at the
  back. The boss opens two wormholes (`SL.spawnHazard('wormhole', {a:[160,900], b:[260,120], life:0})` and
  mirrored `{a:[560,900], b:[460,120]}`): shots fired into the low portals exit above the boss toward the spine.
  `cross_beams` (spin 0.5, width 22, telegraph 1.0 s, 6 s) every 10 s; `orbit_release` 16 `void_orb` every 6 s.
  The shield and portals end when the phase ends.
- **Phase 4 "The Crown":** the crown breaks free (the bar continues) and the coil collapses into one large black
  hole at (360, 160) (pull 900, range 560). The crown flies figure-eights (speed 260): crown dash (0.8 s
  telegraph line, a dash across the screen at 900 px/s leaving a trail of `petal`s) every 5 s; `flower` 20
  `petal` every 3 s; `sniper_line` 3 needles every 4 s. At 5% HP it calls `SL.story.radio('m5_boss_horizon', {priority:true})`
  and the hole's pull ramps to 1,300 over 6 s: finish it before you fall in.
- **Death (4.5 s):** the crown cracks with violet-white light, the hole shrinks to a point (lens strength to 0
  over 1.5 s), a ripple r 900, a white flash; the timeline sets `bg finale`.

### 8.6 `mb_hailstorm`: HAILSTORM, "Ice Drill Ship" (s1, bossesA)

- **Look (360 x 300):** a cylindrical drill ship nose-down, a giant spinning drill cone (animated spiral
  grooves), ice-crusted armor plates `#cfe6f5` over graphite, two side ice cannons, frost venting from seams.
- **HP 4,000;** phases 1.0 / 0.50; score 25,000; parTime 60; credits 25 + 3 big. Music `mus_miniboss`.
- **Phase 1 "Drill":** ice cannons `fan` 5 `shard` (230, spread 0.6) alternating every 1.5 s; drill dash: a red
  line plus a rising drill whine for 1.0 s, then it dives 600 px at 520 px/s and climbs back (contact 20; dodge
  sideways); `ring` 14 `orb` (160) every 3 s. 30% of its aimed shots target the Lantern while it is on screen.
- **Phase 2 "Blizzard":** it calls `asteroid_storm {variant:'ice', density:0.6, duration:0}` (ended on its death); `spiral` 2 arms (9/s/arm, 170); `split_shot` 3 `orb_huge` (120) splitting into 8 `shard` at 1.0 s every 4 s.
- **Death:** the drill shatters into ice shards, `xl` explosion, frost ring.

### 8.7 `mb_tether`: TETHER, "Collapsar Tug" (s2, bossesA)

- **Look (380 x 320):** a heavy tug like the `tug` enemy scaled up, with two claw arms and four harpoon
  launchers trailing glowing cables up into Kerr's Eye.
- **HP 4,500;** phases 1.0 / 0.50; score 28,000; parTime 60; credits 25 + 3 big. Music `mus_miniboss`.
- **Phase 1 "Harpoons":** harpoon lines: an aimed enemy beam (width 12, telegraph 0.8 s, active 0.6 s) from each
  launcher in turn every 1.8 s; `gravity_sling` 6 `void_orb` around the Eye every 5 s; `burst` 3 `orbBig` (200)
  every 2.5 s.
- **Phase 2 "Reel In":** the Eye's `pullMul` rises 0.7 to 0.9; it hurls station wreck chunks (`orb_huge`, 110,
  bending hard toward the hole) 3 at a time every 3 s; `ring_stagger` 16 `orb` (150) every 2.4 s.
- **Death:** the cables snap and whip up into the Eye, the tug explodes (`xl`, palette `violet`).

### 8.8 `mb_mantis`: MANTIS, "Nyx Ace" (s3, bossesB)

- **Look (180 x 160):** a fast ace jet: green-black forward-swept wings `#16241c` with pink seams, a scythe-shaped
  nose blade, twin violet engines, a kill tally of 40 white marks on one wing.
- **HP 5,000;** phases 1.0 / 0.60 / 0.30; score 32,000; parTime 60; credits 25 + 3 big. Music `mus_miniboss`.
- **Rigged mines:** in `rig_field`, contact with a gold mine deals 600 to MANTIS (lure it through them).
- **Phase 1 "Dogfight":** strafes the top half at 320 px/s; dodge-dash 120 px sideways when a player shot line
  passes within 40 px (cooldown 1.5 s); `stream` of `needle` (12/s for 1.0 s, track 0.6) every 3 s; `fan` 5
  `needle` (320) every 2 s.
- **Phase 2 "Scythe":** dive attack every 6 s: a 0.7 s telegraph line, then it slashes through the player's lane
  at 800 px/s leaving `petal` trails; calls 2 darts as escorts every 12 s.
- **Phase 3 "Last Stand":** `sniper_line` 3 needles every 3 s and `flower` 12 `petal` every 4 s; it stops dodging.
- **Death:** it spirals down trailing fire and explodes (`xl`), with a Rook line from the timeline.
- **Flyby enemy `mantis_pass`** (also bossesB): MANTIS art on an invulnerable, `noCount`, `noClear` enemy that
  crosses on `path` (`diag_lr` or `diag_rl`) at 520 px/s and, with `fire:true`, fires `stream` needles at the
  target; missions spawn it from `call mantis_flyby`.

### 8.9 `mb_crucible`: CRUCIBLE, "Foundry Core" (s4, bossesB)

- **Look (460 x 400):** a ring of six magnetic cage arms around a molten forge core (orange `#ff8a5c` to violet
  `#b26bff` swirl), with two seed cages on the lower arms holding small black holes (horizon r 16).
- **HP 6,000;** phases 1.0 / 0.60 / 0.30; score 35,000; parTime 65; credits 30 + 4 big. Music `mus_miniboss`.
- **Parts:** `cage_l`, `cage_r` (part HP 900, break bonus 300; each holds a small hole, pull 500 range 300,
  published in `b.gravityList`; breaking it frees the hole, which collapses in 2 s).
- **Phase 1 "Forge":** `orbit_release` 12 `void_orb` around each cage every 6 s; `ring` 16 `orb` (170) every 2.6 s.
- **Phase 2 "Cages Open":** two `beam_sweep`s from the arms (telegraph 1.0 s, 60 deg in 1.6 s, width 30) every
  6 s; `split_shot` 4 `flare` splitting into 6 `shard`.
- **Phase 3 "Meltdown":** `double_spiral` 4 arms (160) and `gravity_sling` 8 `void_orb` every 4 s; the core
  pulses a heat ring every 6 s (telegraph 0.8 s, a `ring` of 24 `orb` at 140).
- **Death:** the cage arms fly apart, the core blooms orange then violet, `xl` + ring.

## 9. Hazards

Shared rules: every hazard announces itself with `SL.bus.emit('hazardWarning', {id, text})` 1.5-2.5 s before it
can hurt anyone (the HUD shows `text` as a banner; sfx `hazard_warning`), grows in, and cannot damage a player
during its first 1.5 s. Gravity sources publish `h.gravity = {x, y, pull, range, r}` every update (bosses with
holes publish `b.gravity` or `b.gravityList` the same way) so `void_orb`, skills and missions can read them.
`duration` or `life` 0 means until the mission ends. Skill interactions: Bulwark blocks every hazard hit while
up; Time Dilation slows hazards with the world; Repulsor waves and bombs never remove hazards; Gravity Surfer only
affects pulls; Singularity and Event Horizon swallow bullets but not rocks or mines.

### 9.1 `black_hole` (signature hazard)

| size | horizon r | range | pull at center (px/s^2) | lens strength |
|---|---|---|---|---|
| `small` | 26 | 360 | 700 | 0.8 |
| `medium` | 40 | 480 | 950 | 1.0 |
| `large` | 56 | 620 | 1,200 | 1.2 |

- **Options:** `size, x, y, vx, vy, life, fixed, pullMul (1), grow (1.5 s), attachTo + offsetX/offsetY` (carried by
  a tug), `binary {cx, cy, r, w, vy}` (spawns two holes orbiting `cx, cy` at radius `r`, `w` rad/s, the center
  drifting `vy`), `horizonDamage (18 per 0.5 s)`.
- **Every update:** `applyGravity(x, y, pull x pullMul, range, {bullets:false, pods:false, consume:r})` for
  players and pickups; enemy bullets at 0.6x pull and player bullets at 0.35x (separate calls, `consume:r`);
  pods at 0.5x with a horizon check that calls `SL.rescue.lose(pod, 'horizon')`; non-heavy, non-boss enemies at
  0.5x, and an enemy touching the horizon dies (`SL.damageEnemy(e, 9999, {type:'hazard'})`, sfx `bh_swallow`).
  `SL.render.addLens(x, y, r, strength)`; without distortion draw a black disc, photon ring and dark falloff.
- **Look:** a rotating accretion disk sprite (white-gold inner edge to orange to deep red, alpha <= 0.8),
  thin photon ring `#fff1d6`, infalling sparks; `bh_loop` hum whose volume follows the nearest player's distance.
- **Telegraph:** text `BLACK HOLE: NEVER FOCUS NEAR IT`; grows from 0 over 1.5 s. Horizon contact deals 18 every
  0.5 s. Core push velocity decays at 3/s, so drift is about pull / 3: full speed (560) escapes everywhere, focus
  speed (260) loses within ~60 px of a medium horizon.
- **Release:** when `attachTo` dies, the hole drifts down at 40 px/s and collapses after 6 s in a shockwave that
  clears enemy bullets within r 200 (sfx `bh_collapse`).
- **Used in:** m2 (free small, tug-carried medium), m4 (tug small), m5 (binary medium), s2 (large fixed), s4
  (caged small); bosses LODESTAR, OUROBOROS and CRUCIBLE use the same numbers in their own code.
- **Skills:** Gravity Surfer cuts the player pull 40%; Singularity and Event Horizon are the player's own holes;
  Bulwark blocks horizon damage.

### 9.2 `asteroid_storm`

| rock | r | HP | speed | contact | splits into | score | credits |
|---|---|---|---|---|---|---|---|
| `s` | 16 | 30 | 260-320 | 12 | none | 30 | [0,1] |
| `m` | 32 | 120 | 200-260 | 20 | 2 x `s` | 80 | [1,2] |
| `l` | 54 | 400 | 150-190 | 30 | 2 x `m` | 200 | [2,4] |

Options `duration, density (1.0 = 1.4 rocks/s, mix 60/30/10), dir ('down'|'ul'|'ur'), sizes, variant
('rock'|'ice'|'debris')`. Rocks are hazard-owned props (`shootable`, `blocksBullets` both ways, spin 0.2-1.2
rad/s). Skins: rock basalt `#3a3440` with rim `#8c7a66`; ice translucent `#cfe6f5` with a cyan rim; debris
foundry panels with glowing edges `#ff8a5c`. Telegraph: text `ROCKS INBOUND` and dust streaks in the storm
direction 2 s before the first rock (sfx `rock_break` on breaks). Counterplay: shoot big rocks early; hide behind
them from bullets. Used in m1, s1 (ice), s4 (debris), HAILSTORM phase 2.

### 9.3 `ion_storm`

Options `cells, duration, strikeEvery`. Cells are soft glowing clouds (r 150-190, `#9fb8ff` haze at 25% with
crawling sparks) drifting down at 30 px/s and +-20 sideways; `cells` stay alive at once (respawning at the top).
**Ion jam:** while a jet is inside a cell the hazard sets `p.data.ionJamT = 0.1` each update and weapons halve
its fire rate (lance DPS too); the HUD shows `ION JAM` (sfx `ion_jam` loop). **Strikes:** every `strikeEvery` s a
dashed ring (r 70) appears, 40% on a jet that is inside a cell, else at a random point in a cell; 1.2 s later a
bolt from the top hits it: 18 damage to players inside, 60 to enemies (stormcallers immune), and it erases enemy
bullets inside (sfx `storm_strike_warn`, `storm_strike`). Text `ION STORM: STAY OUT OF THE GLOW`. Used in m3 and
TEMPEST (which draws its own rings with the same numbers).

### 9.4 `solar_flare`

Options `from ('left'|'right'|'top'), count, every, first, warn (2.5), burn (1.2), cover`. Each flare: the source
edge glows white for `warn` s with a pulsing chevron row (sfx `flare_warn`, text `SOLAR FLARE: GET IN THE
SHADOW`), then a white-blue light floods the screen for `burn` s (`SL.fx.flash('#f4f8ff', 0.35, burn)`, bg phase
`flare`) with crisp dark shadow wedges behind shade sources (sfx `flare_burn`). A jet exposed during the burn
takes one 30-damage hit (`source:'flare'`), exposed enemies take 200, exposed pods lose 1 of 3 HP. **Shade test:**
a point is shaded when a shade source (any `prop_shade_rock`, heavy enemy or boss circle) lies between it and the
flare edge along the flare direction within 700 px. **Cover:** `cover` shade rocks (`prop_shade_rock`, r 60-90,
basalt `#2b2b33`, skins `rock` and `mirror`) enter 4 s before each burn and drift down at 35-40 px/s; they block
bullets, cannot be destroyed and gently push jets aside. Others spawn them with
`SL.hazards.shadeRock(x, y, {r, vy, skin, life})`. Used in m4 and SUNEATER.

### 9.5 `mine_field`

Options `count, duration, drift (px/s), rigged`. Field mines (hazard props, r 18, HP 20: dark spiked spheres
with a blinking pink light, slow wobble) enter in the top band spread over `duration`. A jet within 110 px arms
one: it blinks fast for 0.6 s (sfx `mine_arm`) and explodes (blast r 90: 18 to players, 150 to enemies, sfx
`mine_blast`). Shot mines explode at once; blasts chain to mines within 120 px after 0.12 s. Score 60, credits
[0,1]. **Rigged** mines (s3) glow gold `#ffd34d`, never hurt players, explode on enemy contact or when shot (blast
r 140, 600 to enemies and bosses). Def methods: `rig(h)` and `setDrift(h, px)`. Text `MINE FIELD: SHOOT THEM
EARLY`. Used in m4 and s3.

### 9.6 `wormhole`

Options `a [x,y], b [x,y], life, bullets ('both'|'enemy'|'none', default 'both'), players (true)`. Two portals:
A with a cyan rim `#9fe8ff`, B with an amber rim `#ffb070`, r 46, swirling interiors `#2a3a6a`, a small lens
(strength 0.35) and a ripple ring every 1.2 s. They open over 1.0 s (no transport) and close over 0.8 s. Anything
whose center comes within 30 px of one portal exits 36 px beyond the other along its velocity, keeping that
velocity, with a 0.4 s re-entry cooldown: jets (0.6 s cooldown, 0.3 s of i-frames), enemy and player bullets (set `x, y` and `bx, by`), pods, pickups and warpers
(sfx `wormhole_warp`; `wormhole_open` on spawn). Text `WORMHOLE: WHAT GOES IN COMES OUT`. Used in m5, s4 and
OUROBOROS phase 3.

## 10. Weapons and power-ups

### 10.1 Primary weapons (levels 1-5; Pilot, no upgrades)

| Type | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| `pulse` (twin lasers) bolts / rate / dmg | 2 / 10 / 7 | 3 / 10.5 / 6 | 4 / 11 / 5.5 | 5 / 11.5 / 5 | 6 / 12 / 4.6 |
| pulse DPS | 140 | 189 | 242 | 288 | 331 |
| `spread` rays / arc (rad) / rate / dmg | 3 / 0.30 / 7 / 6.5 | 5 / 0.45 / 7.5 / 5.2 | 5 / 0.55 / 8 / 5.8 | 7 / 0.70 / 8.5 / 4.8 | 9 / 0.85 / 9 / 4.2 |
| spread DPS (all rays; ~60% on one target at mid range) | 137 | 195 | 232 | 286 | 340 |
| `lance` (piercing beam) width / DPS | 10 / 120 | 14 / 160 | 18 / 200 | 24 / 240 | 30 / 280 |

- Pulse: parallel bolts (L1 twin, L2 adds a center bolt, L3 two twin pairs, L4 a thick center bolt, L5 two
  angled outer bolts at +-0.08 rad), speed 1,400. Spread: an even fan, speed 1,250. Lance: one beam object per
  player in `SL.world.beams` (`pierce: true`, length 1,400, white core, cyan halo, crackling edges from L4).
  All shots are cyan/white at alpha 0.92 (P2: gold/white).
- **Missiles** (secondary, level 0-3; pbullet type `missile`, 520 accelerating to 900 px/s, homing 4 rad/s,
  launched from the wing pods with a sideways kick): L1 2 every 1.0 s x 20 = 40 DPS; L2 3 every 0.8 s x 20 = 75;
  L3 4 every 0.75 s x 21 = 112.
- `stats.fireRateMul` and `stats.damageMul` apply to primaries and missiles. Ion jam halves fire rate. While
  `p.data.overdrive` is set, shots are tinted white-gold.
- **Losing a life** (solo, or co-op respawn after the revive timer): primary level -1 (min 1), type and missiles
  kept. A co-op revive costs nothing.
- **DPS check** (expected loadout, ~60% uptime): m1 pulse L3 + fire L1 + missiles L1 ~ 300 DPS, RAZORBACK 9,000
  in ~60 s; m3 L4-5 + fire L3 + missiles L2 ~ 440, TEMPEST 24,000 in ~90 s; m5 L5 + fire L5 + Hot Barrels +
  missiles L3 ~ 620 (about 700 with skills), OUROBOROS 45,000 in ~115-120 s.

### 10.2 Pickups (`SL.pickupTypes`)

Capsules are glossy 44 px pills with a symbol, drifting down at 70 px/s, bouncing off the side edges, `life` 14 s
(blinking the last 2 s), magnet 0.6x. Credits use the full magnet and live 10 s. Same weapon type: +1 level;
different type: switch and keep the level.

| id | Look | Effect | At max |
|---|---|---|---|
| `weapon_up` | white-gold diamond chip with `P` | +1 level of the current type (`POWER UP`) | +2,000 x mult and 20 credits (`MAX POWER`) |
| `weapon_pulse` | cyan `#3fc8ff` capsule, twin-bar symbol | pulse (`PULSE L3`) | as above |
| `weapon_spread` | green `#46f0a8` capsule, fan symbol | spread (`SPREAD L3`) | as above |
| `weapon_lance` | violet `#b98bff` capsule, beam symbol | lance (`LANCE L3`) | as above |
| `missile` | orange `#ff9d4a` capsule, rocket symbol | missiles +1 (`MISSILES L2`) | +1,000 |
| `shield` | blue `#4fb4ff` capsule, hex symbol | +40 shield (`SHIELD +40`) | +500 |
| `bomb` | red `#ff5a4a` capsule, `B` | +1 bomb (`BOMB +1`) | +2,000 |
| `repair` | green `#5dffb0` capsule, wrench symbol | +35 hull (`REPAIR +35`) | +500 |
| `credit` | small gold crystal `#ffd34d` (value 1) | credits | |
| `credit_big` | large gold crystal (value 10) | credits | |

### 10.3 Drop tables (`SL.pickups.tables`, `SL.pickups.roll(id) -> pickupId`)

| table | weapon_up | weapon_pulse | weapon_spread | weapon_lance | missile | shield | bomb | repair |
|---|---|---|---|---|---|---|---|---|
| `drop_small` | 40 | | | | 20 | 20 | 10 | 10 |
| `drop_fighter` | 30 | 10 | 10 | 10 | 15 | 15 | 5 | 5 |
| `drop_gunship` | 35 | | | | 20 | 20 | 10 | 15 |
| `drop_heavy` | 40 | | | | 20 | 15 | 15 | 10 |
| `drop_formation` | 45 | 10 | 10 | 10 | 10 | 10 | 5 | |

`drop(e)` spills `credits` crystals (10-value crystals first), then rolls `def.dropChance` (x1.25 in co-op) and,
on success, one item from `def.dropTable`. Mercy rule: while any jet is at hull <= 30%, `bomb` results become
`repair`. At `bossDeath` and `missionOutro` every pickup on screen flies to the nearest jet.

### 10.4 Pacing

Each main mission scripts 4-6 pickups (2-3 of them weapon chips or capsules) and a pre-boss `repair`; formation
bonuses add about 6-10 drops and random drops about 4-8 more, so a player who takes them reaches the expected levels in section 4.0.

## 11. Rescue

| kind | Look | People | Drift | Extra on rescue |
|---|---|---|---|---|
| `civilian` | white pod, green band `#5dffb0`, green beacon | 1-4 | 55 px/s | none |
| `crew` | white pod, cyan band, cyan beacon | 1-2 | 55 | +1 bomb to the rescuer (+500 at max) |
| `medical` | large white pod (1.4x) with green chevrons | 6 | 40 | +20 hull to the rescuer |
| `captive` | grey pod with violet bars | 1-3 | 50 | none |
| `vip` | white-gold pod, gold beacon `#ffd34d`, gold SOS ring | 1 | 45 | +300 credits, `save.flags.unlock_<vip>`, radio |
| `pilot` | co-op ejection pod in the owner's colors with a countdown ring | - | core | revives the owner (not a rescue) |

- **Rescue** (touch within body radius + 18): 25 credits x people (core), 500 x multiplier score, green text
  `+N RESCUED`, `podRescued`, sfx `rescue` (`rescue_vip` for VIPs), and sometimes a `rx_pod_rescued` line.
- **Threats:** 3 enemy bullet hits destroy a pod (it flashes red per hit, sfx `pod_hit`); a black hole horizon
  (`SL.rescue.lose(pod, 'horizon')`, which also counts `session.data.lostToHorizon` for `s2_obj_horizon`);
  snatcher tow (while `pod.towedBy` is a live enemy the pod follows it 34 px
  below and ignores drift; when the tower dies the pod is freed); leaving the bottom; exposed during a flare (1 HP).
  Bombs never hurt pods; player shots pass through them. A green chevron blinks on the top edge 1.0 s before a
  pod enters.
- **VIP pods:** m1 Captain Tamsin (`vip:'s1'`), m2 Dr. Osei (`'s2'`), m3 Captain Holt (`'s3'`, released from
  the second barge), m4 Ixa (`'s4'`, a black Nyx pod with a white beacon, hunted by phantoms). Rescue sets
  `save.flags.unlock_sN`; the story plays `<mission>_vip_saved`. A lost VIP plays `rx_vip_lost`; the side story
  then unlocks through the fallback rule, and the VIP pod returns on every replay until rescued.
- **Co-op pilot pods:** core rules (8 s, `stats.reviveTime`); the partner flies over to revive.

## 12. Co-op

- **In the story:** P2 is the second test pilot, callsign `{callsign2}` (default `EMBER`, up to 10 characters
  A-Z 0-9), flying the XF-9B *Sunlance*: the same airframe in graphite `#2b2f3a` with gold trim `#ffb53f`, gold
  glow `#ffd27a` and amber engines `#ffb070`. Briefings add their co-op line, the crew names both pilots, and
  reactive lines use `{pilot}` for whoever the event is about. Sparrow still flies her *Kestrel* in scripted
  runs.
- **Start:** title `2 PLAYERS` opens the `coop` screen, then the star map with co-op on (`SL.game.coop = true`,
  `SL.input.setCoop(true)`).
- **Shared:** one lives pool (difficulty lives + `bonusLives`), score, multiplier, credits and rescues. Revive by
  flying over the partner's pilot pod within 8 s (core); timeout spends a shared life. The mission fails when
  both players are out.
- **Per player:** weapon type and level, missiles, bombs (each starts with `stats.bombs`), hull and shield, and
  one equipped active skill (`save.skills.equipped[1]` for P2, chosen from the shared owned list).
- **Scaling:** enemy HP x1.35 (core); one extra pod per mission (`if coop`); drop chance x1.25.
- **Twin Link** (weapons module): when both jets are alive within 160 px for 1.0 s, a light tether links them
  (a cyan-to-gold beam, width 6) and holds while they stay within 220 px. While linked both jets deal +15% damage
  and the tether is a piercing player beam (60 DPS) that hurts enemies crossing it; the HUD shows `TWIN LINK`
  (sfx `twin_link` loop).
- **Controls:** P1 WASD, Space fire (manual mode), Q bomb, E skill, Left Shift focus. P2 arrows, Slash or
  Numpad Enter fire, Enter or Numpad 0 bomb, Right Shift or Numpad 1 skill, Right Ctrl or Numpad 2 focus.
  Escape or P pauses. Gamepads: two pads give pad 0 to P1 and pad 1 to P2; one pad goes to P2 while P1 keeps
  WASD (A bomb, X or B skill, LB/RB focus, RT fire, Start pause). Touch drives P1 only.

## 13. Hangar upgrades

`SL.upgrades` (progress); the hangar screen shows name, level pips, the description, the next level's effect and
cost. Effects feed `SL.progress.playerStats(save, index)` for both jets.

| id | Name | Description (UI copy) | Per-level effect | Max | Cost per level |
|---|---|---|---|---|---|
| `armor` | ARMOR PLATING | Thicker hull plates for both jets. | +15 max hull (100 to 175) | 5 | 250 / 450 / 700 / 1,000 / 1,400 |
| `shield` | SHIELD CAPACITOR | Every life starts with a shield charge. | +15 starting shield, +10 max shield (60 to 100) | 4 | 300 / 600 / 950 / 1,400 |
| `firerate` | FIRE CONTROL | Faster trigger cycling on every gun. | +6% fire rate (to +30%) | 5 | 300 / 550 / 850 / 1,200 / 1,600 |
| `arsenal` | ARSENAL | New guns for the launch rack. | L1 Spread selectable as starting primary; L2 Lance selectable; L3 start at weapon level 2 | 3 | 400 / 800 / 1,400 |
| `missiles` | MISSILE RACK | Homing missiles from the first second. | start with missiles at level 1 / 2 / 3 | 3 | 450 / 900 / 1,500 |
| `bombs` | BOMB BAY | Room for one more panic button. | +1 starting bomb (2 to 4) | 2 | 400 / 900 |
| `magnet` | SALVAGE MAGNET | Pull in crystals from farther away. | +30 px magnet radius (90 to 180), +5% credits | 3 | 200 / 450 / 800 |
| `reserve` | RESERVE JET | A spare Starlance on the catapult. | +1 life per mission | 2 | 800 / 1,800 |

All upgrades total 22,350 credits. The starting primary (`save.loadout.primary`, default `pulse`) is chosen on
the briefing screen among unlocked types.

**Income per mission** (Pilot; credits x1.25 on Ace):

| Mission | Completion (first / replay) | SP (first clear) | Bonus objectives | Typical collected (kills + rescues + boss) |
|---|---|---|---|---|
| m1 | 400 / 200 | 1 | 2 x 150 | ~700 |
| m2 | 550 / 275 | 1 | 2 x 150 | ~850 |
| m3 | 700 / 350 | 2 | 2 x 150 | ~1,000 |
| m4 | 850 / 425 | 2 | 2 x 150 | ~1,100 |
| m5 | 1,000 / 500 | 2 | 2 x 150 | ~1,250 |
| s1-s4 | 500 / 550 / 600 / 650 (replay 50%) | 1 each | 1-2 x 150 | ~600-700 |

Rank bonus every play: S +50%, A +30%, B +15% of the first-clear completion bonus. A full first campaign with all
side stories earns about 17,000 credits (about 75% of the hangar); the rest comes from replays.

## 14. Skill tree

Three branches; 8 nodes come from side-story choices, 4 are bought with SP. `SL.skillTree.branches`:
`aegis` AEGIS `#4fb4ff` (defense), `vanguard` VANGUARD `#ff8a3d` (offense), `gravity` GRAVITY `#b26bff`
(black-hole tricks). Each jet equips one owned active (`save.skills.equipped[i]`); passives apply to both jets
once owned. A newly earned active auto-equips for P1 if P1's slot is empty. Actives start each mission ready; the
skill button with nothing equipped or on cooldown plays `skill_fail`. Durations are game seconds unless noted.

| id | Name | Branch | Type | Effect | Cooldown | Source | Requires |
|---|---|---|---|---|---|---|---|
| `sk_bulwark` | BULWARK | aegis | active | 3.0 s dome (r 110) around the jet; enemy bullets that touch it become credit sparks; the jet takes no damage | 22 s | s1 `guard_liner` | none |
| `sk_decoy` | DECOY | aegis | active | drops a holo-jet ally for 6 s (`aimBait` 1.0, 200 HP, hit by bullets); at the end or at 0 HP it bursts for 300 damage within r 160 | 20 s | s1 `draw_fire` | none |
| `sk_repulsor` | REPULSOR | aegis | passive | when the jet's shield breaks or it takes a hull hit: a gravity wave (r 260) erases enemy bullets (credit sparks), shoves non-boss enemies 120 px out, +0.6 s invulnerability | 12 s internal | s2 `save_crew` | none |
| `sk_second_wind` | SECOND WIND | aegis | passive | once per mission per jet, on `lowHull`: repair 40 hull and 2 s invulnerability | once | 3 SP | none |
| `sk_overdrive` | OVERDRIVE | vanguard | active | 6 s: fire rate x1.5, damage x1.25, white-gold shots (`p.data.overdrive`) | 24 s | s3 `chase_mantis` | none |
| `sk_salvo` | SALVO | vanguard | passive | every 10 s launches 8 homing micro-missiles (pbullet `missile`, 30 damage each) at the nearest enemies | 10 s | s3 `rig_field` | none |
| `sk_hot_barrels` | HOT BARRELS | vanguard | passive | damage x1.10 on every weapon | - | 2 SP | none |
| `sk_chain_reaction` | CHAIN REACTION | vanguard | passive | a non-boss enemy the jet destroys bursts for 25 damage within r 80; bursts can chain one more step | - | 3 SP | `sk_hot_barrels` |
| `sk_singularity` | SINGULARITY | gravity | active | throws a micro black hole 260 px ahead; for 4 s it pulls non-boss enemies (pull 900, range 260), swallows enemy bullets within r 140 and deals 120 DPS within r 60 (lens 0.7) | 24 s | s2 `save_core` | none |
| `sk_time_dilation` | TIME DILATION | gravity | active | `SL.skills.dilate(4, 0.4)`: the world runs at 40% for 4 real seconds while both jets move and fire at full speed | 30 s | s4 `detonate_seed` | none |
| `sk_event_horizon` | EVENT HORIZON | gravity | passive | a tiny black hole orbits the jet (radius 70, 2.2 rad/s, lens 0.3); it swallows enemy bullets that touch it (r 16) and bends bullets within 90 px | - | s4 `steal_seed` | none |
| `sk_gravity_surfer` | GRAVITY SURFER | gravity | passive | `gravityResist` +0.4 (black holes pull the jet 40% less) | - | 2 SP | none |

**One-line effects** (choice cards and the skills screen, final copy):
`sk_bulwark` "3 s energy dome. Bullets that touch it turn to gold." · `sk_decoy` "A holo-jet draws every aimed
shot, then explodes." · `sk_repulsor` "Take a hit and a gravity wave clears the air around you." ·
`sk_second_wind` "Once per mission, low hull triggers an emergency repair." · `sk_overdrive` "6 s of white-hot
fire: faster and harder." · `sk_salvo` "Every 10 s, a free swarm of 8 homing missiles." · `sk_hot_barrels`
"+10% damage on every gun." · `sk_chain_reaction` "Kills explode and hurt their neighbors." ·
`sk_singularity` "Throw a tiny black hole that eats bullets and crushes jets." · `sk_time_dilation` "4 s of slow
time. The world crawls, you don't." · `sk_event_horizon` "A pet black hole orbits your jet and eats bullets." ·
`sk_gravity_surfer` "Black holes pull you 40% less."

**`SL.skills.dilate(seconds, scale)`** (progress API, also used by the s4 time waves): `SL.fx.slowmo(scale,
seconds)`, and for the same real-time span both jets' `speed`, `focusSpeed` and `fireRateMul` are divided by
`scale` (restored after); `desaturate(0.3)` with a blue flash at 0.12, a ripple at the activating jet, sfx
`sk_time_dilation`, music duck 0.5.

**SP sources:** first clear m1 1, m2 1, m3 2, m4 2, m5 2; first clear of each side story 1; the first S rank on
each main mission +1. Maximum 17; the SP nodes cost 10 in total.

## 15. Progression and unlocks

- **Flow:** title, then (new save) callsign, then star map; star map, briefing, mission, results, star map;
  first m5 clear goes results, ending, star map. Quitting a mission returns to the star map.
- **Unlocks:** m1 at start; m(N+1) when mN is done; side stories per section 5 (VIP rescue + mission done, or the
  next main mission done; s4 also after m5). `SL.progress.missionUnlocked(id)` and `sideUnlocked(id)` decide;
  the star map toasts every new unlock: `NEW MISSION: DEEP PULL`, `SIDE STORY UNLOCKED: LANTERN RUN`.
- **Replay:** any unlocked mission any time; best score, best rank and best rescues are kept; replays pay 50% of
  the completion bonus and no SP (except first S rank); side-story replays can earn the other skill.
- **Difficulty** (star-map header): CADET and PILOT from the start; ACE unlocks after m5 is cleared on any
  difficulty (locked tooltip `ACE unlocks after NIGHTFALL`). It applies from the next mission start.
- **Post-game:** after the ending every side story unlocks through the fallback rule, ACE opens, the star map
  gets a `WATCH ENDING` button, and an `ACE OF THE HALCYON` badge appears on the title once every main mission
  has an S rank.
- **Rank formula** (progress assigns `SL.game.rank`): `35 x killRate + 25 x rescueRate + max(0, 25 - 2.5 x
  hits) + max(0, 15 - 7.5 x livesLost)`; S >= 90, A >= 75, B >= 58, C >= 40, else D.
- **Save samples** (progress sets `SL.save.samples`): `fresh` = defaults; `mid` = m1-m2 done (A, B), s1 unlocked,
  1,400 credits, 2 SP, armor 1, firerate 1; `late` = m1-m4 done, s1 and s2 done (`guard_liner`, `save_core`), s3
  unlocked, 5,000 credits, 6 SP, several upgrades, `sk_bulwark` + `sk_singularity` owned and P1 has `sk_bulwark`
  equipped; `full` = everything done with both options of every side story, all skills and upgrades, 50,000
  credits, 20 SP.

## 16. Radio system

### 16.1 Rules

- `SL.story.lines[id] = {who, text}`; missions schedule scripted cues with `{radio:'id'}`. The story module plays
  `<mission>_vip` on a VIP `podSpawn`, `<mission>_vip_saved` on its `podRescued`, `<mission>_boss_intro` on
  `bossIntroDone`, and `<mission>_boss_p<N>` on `bossPhase` when those ids exist.
- **Queue:** scripted lines are never dropped and play in order (max 4 queued; extras wait); boss lines,
  VIP lines and `force` pools jump the queue. Reactive lines play only when nothing is playing or queued, at
  most one every 6 s overall, each pool with its own cooldown; a pool picks a variant it did not use last.
- **Display:** the radio box (top of the playfield, under the HUD strip) shows the portrait, `NAME · CALLSIGN`
  in the character color and typewriter text at 45 characters/s x `settings.radioSpeed`; it holds 1.6 s plus
  0.04 s per character after typing (min 2.5 s). Each line starts with `radio_in` static and the speaker's
  chirp; music ducks to 60% while it plays. Vael lines turn the box border violet with glitch slices.
- Choice replies: the picked option's `line` plays from `p1` or `p2` (whoever chose).

### 16.2 Scripted cues

**m1:** `m1_open` anvil (1.5 s): Starlance, you're clear of the deck. Weapons free, {callsign}.
· `m1_chips` patch (9.5): Kill a whole formation and the last one drops a power chip. Greedy is good.
· `m1_wasps` sparrow (21): Wasps! They shoot back in threes. Slide, don't run.
· `m1_pods` anvil (31): Escape pod! Fly over it to bring them aboard. Every one counts.
· `m1_shipyard` anvil (40): Dry dock four is burning. Keep them off the crews.
· `m1_manta` patch (45): Gunship. Its rings have gaps. Thread them, then hit it in the face.
· `m1_sparrow_run` sparrow (52): Sparrow on your wing! Strafing left to right, keep your head down!
· `m1_rocks` sparrow (67): Rocks inbound! Big ones split. Shoot early or hide behind them.
· `m1_snatcher` anvil (88): That drone is towing a pod! Shoot it before it drags them off.
· `m1_missiles` patch (100): Missile pod! Homing missiles find targets on their own. Spoil her.
· `m1_hive` anvil (104): Carrier. It launches drones until it dies. Kill it fast.
· `m1_vip` anvil (auto): Gold beacon. That's a VIP pod. Bring them home, {callsign}.
· `m1_vip_saved` tamsin (auto): Captain Tamsin, liner Lantern. My thanks, pilot. My ship still needs you.
· `m1_boss_warn` anvil (143): Huge contact in the dust. Assault carrier. Here it comes.
· `m1_boss_intro` vael: Little light. You burn so briefly. RAZORBACK, end it.
· `m1_boss_p2` patch: Its spine is charging. Watch the fins light up, then move.
· `m1_boss_p3` sparrow: Hull's open! Hit the core, hit it now!
· `m1_win` anvil (afterBoss): RAZORBACK is down and the sun is up. Come home, {callsign}.

**m2:** `m2_open` anvil (1.5): Kerr Station is breaking up. Clear a path for the lifeboats.
· `m2_spears` sparrow (13): Spears lock on, then ram. When the nose glows red, sidestep!
· `m2_needlers` patch (26): Snipers. See the red line? That's where the shot goes. Don't be there.
· `m2_weaver` sparrow (41): Weaver! Spiral guns. Circle with the spiral, not against it.
· `m2_eye` anvil (53): That's Kerr's Eye ahead. A black hole on a leash. Stay sharp.
· `m2_lance` patch (57): Lance cell! A beam that cuts through everything in a line. Try it.
· `m2_bh_warn` patch (62): Gravity well! It pulls you in. Never focus near it, you'll lose speed.
· `m2_bh_eat` sparrow (67.5): Ha! It ate their drones. Your shots bend around it too. Use that.
· `m2_tug` anvil (96): Tug ship towing a black hole. Kill it and the hole drifts loose.
· `m2_vip` anvil (auto): VIP pod falling toward that hole. Grab it before the horizon does!
· `m2_vip_saved` osei (auto): Dr. Osei, Lagrange Deep. You flew into a gravity well for me. Beautiful.
· `m2_station` sparrow (134): Lifeboats are clear of the station. Nice flying, {callsign}!
· `m2_boss_warn` anvil (155): Big signature on the leash end. The siege engine. Cut it loose.
· `m2_boss_intro` vael: LODESTAR holds a dying star. Let it hold you too.
· `m2_boss_p2` patch: Its pull is climbing! Stay fast. It can't hold a ship at full speed.
· `m2_boss_p3` sparrow: Containment's failing and the hole is growing. Finish it fast!
· `m2_win` anvil (afterBoss): The leash is cut and the Eye is fading. Outstanding work, {callsign}.

**m3:** `m3_open` anvil (1.5): Their fleet is hiding in the storm. We go in after them.
· `m3_skimmer` sparrow (9): Skimmers crossing low! They drop mines behind them. Don't follow the trail.
· `m3_hornet` patch (18): Missile boat. Its missiles can be shot down. Clip them before they bite.
· `m3_ion` patch (27): Ion cell! Inside it your guns fire at half rate. Watch for strike rings.
· `m3_stormcaller` sparrow (37): Stormcallers! Lightning jumps between them. Don't fly between the pair!
· `m3_eye` anvil (55): We're in the eye. Quiet for a moment. Grab those pods.
· `m3_bastion` anvil (64): Prison barge. Armored nose. Hit it from the sides and the cells pop open.
· `m3_convoy` sparrow (110): Second barge! That one's carrying our pilots. Crack it open!
· `m3_vip` rook (auto): Captain Holt here. If anyone's out there, I'd love a lift.
· `m3_vip_saved` rook (auto): Thanks, kid. I taught Sparrow to fly, you know. She still flies like a goose.
· `m3_regroup` anvil (146): Convoy's clear. Storm wall ahead. Something big is waiting in it.
· `m3_boss_warn` anvil (164): Dreadnought in the storm wall. Big as a city. Light it up.
· `m3_boss_intro` vael: TEMPEST was born in this storm. You will end in it.
· `m3_boss_p2` patch: Lightning fences! Find the gap in the wall and slide through!
· `m3_boss_p3` sparrow: The eye's open! That's the core. Everything you've got!
· `m3_win` anvil (afterBoss): TEMPEST is falling and the storm is breaking. Good hunting, {callsign}.

**m4:** `m4_open` anvil (1.5): Tarsis is bleeding light and they're bottling it. Stop them.
· `m4_phantom` sparrow (9): Phantoms! They cloak. Shoot when you see the shimmer, not before.
· `m4_flare` patch (26): Flare coming! When the edge goes white, get in a rock's shadow. Now!
· `m4_eclipse` anvil (56): A moon is crossing the star. No flares for a moment. Breathe.
· `m4_mines` patch (65): Mine field. Shoot one and it blows its neighbors. Chain them into jets.
· `m4_defector` anvil (109): Nyx pod on our band, sending surrender codes. Their own jets want it dead.
· `m4_vip` ixa (auto): Human pilot. I am Ixa. I carry the foundry codes. Please. Catch me.
· `m4_vip_saved` ixa (auto): You caught me. I am grateful in advance for not shooting me later.
· `m4_regroup` sparrow (150): Harvester dead ahead. That thing is drinking the sun.
· `m4_boss_warn` anvil (169): Stellar harvester, dead ahead. Its mirrors bounce beams. Read the lines.
· `m4_boss_intro` vael: SUNEATER drinks a star. You are a much smaller meal.
· `m4_boss_p2` patch: Beams bounce off those mirrors. Follow the warning line to the end!
· `m4_boss_p3` anvil: It's going nova! Get behind the falling mirrors when the white comes!
· `m4_win` anvil (afterBoss): SUNEATER is dark and Tarsis is safe. Next stop, their front door.

**m5:** `m5_open` anvil (1.5): We're through the rift. No retreat from here. Make it count.
· `m5_warper` sparrow (9): Warpers! They blink around. Watch for the ring where they'll pop out.
· `m5_wormhole` patch (29): Wormhole pair! What goes in one comes out the other. Bullets too!
· `m5_halcyon` anvil (61): Halcyon on station. Spinal cannon firing on the left. Stay clear!
· `m5_binary` sparrow (70): Two black holes dancing! Fly the line between them, it's calmer there.
· `m5_throne` anvil (118): You're over the throne ship's hull. Everything they have is here.
· `m5_last` patch (158): She's hot and she's ready. Give him everything, {callsign}.
· `m5_sparrow` sparrow (161): Sparrow on your wing, one last time. Let's go wake him up.
· `m5_boss_warn` anvil (173): The throne ship is moving. This ends now, one way or another.
· `m5_boss_intro` vael: I am the night that ends every star. Kneel, little light.
· `m5_boss_p2` patch: The engines are black holes! Stay between them, the pulls cancel there.
· `m5_boss_p3` anvil: Throne is shielded. Shoot into the wormholes. The exits are behind it!
· `m5_boss_p4` sparrow: The crown broke loose! That's Vael himself. Take him down!
· `m5_boss_horizon` vael (boss at 5%): Then we all fall together. Into the dark!
· `m5_win` anvil (afterBoss): The rift is closing. The Armada is broken. Bring it home, {callsign}.
· `m5_win2` sparrow (afterBoss +4 s): Look at that. Real stars again.
· `m5_win3` patch (afterBoss +7 s): Nothing on her I can't fix. Okay. A lot I can fix.
· `m5_echo_s1` tamsin (2, if s1 done): The Lantern's people are listening, {callsign}. All twelve hundred.
· `m5_echo_s2` osei (62, if s2 done): Their holes are unstable. Hit them hard and they fold. Beautiful.
· `m5_echo_s3` rook (161, if s3 done): Room on that wing, kid? Holt and Park, together again.
· `m5_echo_s4` ixa (173, if s4 done): The throne's engine shells are thin. I built them that way. Hit them.

**s1:** `s1_open` tamsin (1.5): Lantern is lifting. Twelve hundred souls aboard. Keep us flying, pilot!
· `s1_liner` anvil (11): Missile boats are aiming at the liner. Kill them first.
· `s1_hunters` tamsin (46): More hunters on scope. A lot more. Our shield is flickering.
· `s1_guard` tamsin (after `guard_liner`): Stay inside the blue ring and our shield holds. Don't leave us!
· `s1_draw` sparrow (after `draw_fire`): Beacon's lit. Every gun out there wants you now. Fly like crazy!
· `s1_blizzard` tamsin (70): Ice storm off the rings! Those chunks will crack a hull. Careful!
· `s1_boss_warn` anvil (101): Drill ship rising out of the ice. It wants the Lantern. Stop it.
· `s1_boss_intro` vael: HAILSTORM, open that little lamp. Let its light out.
· `s1_boss_p2` patch: It's calling the ice down on us! Shoot the big chunks first!
· `s1_win_guard` tamsin (afterBoss): Lantern has reached orbit. Everyone's alive. Milo says hi, Patch.
· `s1_win_draw` tamsin (afterBoss): They never touched the Lantern. You took it all. Thank you, {callsign}.
· `s1_lantern_hit` tamsin (Lantern below 50%, once): We're taking hits in here! Keep them off the hull!
· `s1_lantern_low` patch (Lantern below 20%, once): The Lantern's hull is failing! Milo's on that ship!

**s2:** `s2_open` osei (1.5): Welcome to Lagrange Deep. Mind the hole, it's very hungry today.
· `s2_pull` osei (4): The Eye pulls everything up. Pods too. Catch them before the horizon does.
· `s2_station` osei (44): That's my station. It's splitting in half. Oh no. No, no, no.
· `s2_core` osei (after `save_core`): Core's on your tether! It eats bullets, but it's heavy. They'll come for it.
· `s2_crew` osei (after `save_crew`): Hab ring's open! Eighteen people, falling up. Catch them, {callsign}!
· `s2_wave` osei (68): The core hit the horizon. Gravity wave! Oh, that's beautiful. Brace!
· `s2_boss_warn` anvil (85): The tug is under the hole, hauling the wreck in. Cut its lines.
· `s2_boss_intro` vael: TETHER buries what you love in the dark. It is very good at it.
· `s2_boss_p2` osei: It's reeling the wreck in! The pull is climbing. Keep your speed up!
· `s2_win_core` osei (afterBoss): Core's safe. Give me a week and your jet will carry a black hole.
· `s2_win_crew` osei (afterBoss): Everyone's out. And I watched a core die. I know how to push gravity now.

**s3:** `s3_open` rook (1.5): Welcome to the Boneyard, kid. Every wreck out here was a friend of mine.
· `s3_mines` rook (7): Mines between the hulks. Shoot them early. They chain.
· `s3_mantis` rook (40): There. Green-black wings, scythe nose. That's Mantis. Still flying pretty.
· `s3_rook_mad` anvil (44): Rook, hold formation. That is an order.
· `s3_chase` rook (after `chase_mantis`): Ha! Full throttle! Watch your tail, his boys come up from behind.
· `s3_rig` rook (after `rig_field`): Mines are mine now. Gold ones are friendly. Herd them into the gold.
· `s3_behind` sparrow (54): Six o'clock! Spears coming up from behind!
· `s3_boss_warn` rook (87): He's turning to fight. Good. Stay on my wing and don't blink.
· `s3_boss_intro` vael: MANTIS has taken forty human pilots. Two more is nothing.
· `s3_boss_p2` rook: He's diving! Watch the line, then slide. He never changes course.
· `s3_boss_p3` rook: He's out of tricks. Now we finish this, kid.
· `s3_win_chase` rook (afterBoss): You outflew him at full burn. My secret: never let go of the throttle.
· `s3_win_rig` rook (afterBoss): Squadron's paid back. Now let me teach you a real missile swarm.
· `s3_rook_down` rook (`ally_rook` ejects): I'm hit! Punching out! Pick me up, kid, I'm not swimming home!

**s4:** `s4_open` ixa (1.5): We are inside. The guards know my codes are false now. Hurry.
· `s4_cages` ixa (12): Seed cages. Small holes, held in place. Do not fly close. They are hungry.
· `s4_wormhole` ixa (30): Foundry gates fold space. Your shots can pass through them. So can theirs.
· `s4_seed` ixa (56): There. The ripe seed. In one day it would swallow a moon.
· `s4_detonate` ixa (after `detonate_seed`): Detonation! Time is folding. When the blue wave comes, they slow.
· `s4_steal` patch (after `steal_seed`): You're towing a black hole. Of course you are. It eats bullets. Careful.
· `s4_boss_warn` ixa (99): CRUCIBLE wakes. It is the forge itself. It will not let us leave.
· `s4_boss_intro` vael: Ixa. My little traitor. CRUCIBLE, make her a star again.
· `s4_boss_p2` ixa: The cage arms are open. Beams next. Watch the arms, not the core.
· `s4_boss_p3` patch: It's melting down! Finish it before it takes the whole foundry with it!
· `s4_win_detonate` ixa (afterBoss): The seed is gone. Time still ripples around your jet. Keep that gift.
· `s4_win_steal` osei (afterBoss): A live seed in a cage I built. I can wire it to your jet. Don't tell Kade.

### 16.3 Reactive pools

Pool ids are line-id prefixes: variants are `<pool>_1` .. `<pool>_n` in `SL.story.lines`.

| Pool | Event (chance, pool cooldown) | Variants |
|---|---|---|
| `rx_pod_rescued` | `podRescued`, non-VIP (35%, 14 s) | sparrow: Got them! That's {pilot} with the save! · anvil: Pod secured. Good work, {pilot}. · patch: Survivors aboard. They're asking who flew that jet. · sparrow: Rescue confirmed! Somebody's going home tonight. |
| `rx_pod_lost` | `podLost`, non-VIP (100%, 10 s) | anvil: We lost a pod. Stay with the others. · sparrow: No! That pod's gone. Keep them covered! · patch: Pod's down. Shake it off, there are more out there. |
| `rx_vip_lost` | VIP `podLost` (100%, force) | anvil: We lost the priority pod. Halcyon sweepers will search later. · sparrow: The VIP pod is gone! Keep flying, we'll find them later. · anvil: Priority pod lost. Patrols will look for survivors. Eyes forward. |
| `rx_snatch` | a snatcher latches a pod (100%, 16 s) | sparrow: A drone grabbed a pod! Shoot it before it climbs away! · anvil: Snatcher on a pod. Kill the drone, not the pod. · patch: They're stealing our people! Pop that tow drone! |
| `rx_snatch_saved` | a towing snatcher dies (50%, 12 s) | sparrow: Pod's free! Nice shot! · anvil: Drone down, pod free. Go get them. · patch: Ha! Give them back. Thank you. |
| `rx_low_hull` | `lowHull` (100%, 25 s) | patch: Hull's under thirty percent! Grab a repair or play it safe! · sparrow: {pilot}, you're smoking! Ease off a little! · patch: She's hurting, {pilot}. Bring her home in one piece, please. · anvil: {pilot}, your hull is critical. Fly smart. |
| `rx_shield_break` | `shieldBreak` (40%, 20 s) | patch: Shield's gone. Next hits go straight to the hull. · sparrow: Your shield popped! Watch it! · patch: Shield down! Find a blue capsule. |
| `rx_player_down` | `playerDown`, solo or partner out (100%, 8 s) | anvil: {pilot} is down! Launching the spare. · sparrow: No, no! {pilot}, talk to me! · patch: There goes my paint job. Spare jet's ready. |
| `rx_coop_down` | `playerDown` with the partner flying (100%, force) | sparrow: {pilot} ejected! Fly over the pod to pull them back in! · anvil: Pilot pod in the open. Pick them up, fast. · patch: Get to that pod! Eight seconds before I can't reach it! |
| `rx_revive` | `playerRevive` (100%, 8 s) | sparrow: Back in the fight! Nice catch! · anvil: {pilot} is back up. Good teamwork. · patch: Back in your seat, {pilot}. And don't do that again. |
| `rx_bomb` | `bomb` (30%, 30 s) | sparrow: Boom! There goes the neighborhood. · patch: Bomb out! Every bullet just turned to gold. · sparrow: That's one way to clean up. |
| `rx_weapon_max` | a jet reaches level 5, first time per mission (100%, 30 s) | patch: That's max power! She's singing now. · sparrow: Look at those guns! Save some for me! · patch: Full power. Don't get shot and lose it. |
| `rx_chain` | multiplier reaches x4.0 and x8.0, once each per mission (100%, 20 s) | sparrow: That chain is huge! Keep it going! · anvil: Your chain is impressive, {pilot}. Don't break it. · sparrow: Look at that multiplier climb! |
| `rx_formation` | formation bonus (20%, 25 s) | patch: Whole formation! Grab the chip! · sparrow: Clean sweep! Power chip incoming! · patch: That's how you do it. Chip's yours. |
| `rx_black_hole` | a jet enters the inner half of a black hole's range, once per hole (100%, 20 s) | patch: You're in its pull! Full throttle, no focus! · sparrow: Don't get comfy near that thing! · anvil: Gravity's got you. Fly out of it. |
| `rx_boss_low` | boss HP <= 15%, once per fight (100%, force) | sparrow: It's almost done! Don't let up! · anvil: Target is failing. Finish it, {callsign}. · patch: One more push and it's scrap! |
| `rx_skill` | skill activation (25%, 30 s) | patch: Skill's live. Make it count. · sparrow: Oh, that's a nice trick! · patch: There she goes. That's my girl. |

## 17. Audio

All sound is WebAudio synthesis (03_audio.js). Mix: SFX bus with a compressor (threshold -18 dB, ratio 4) and a
short shared reverb send; music bus ducked to 60% while a radio line plays. Repeating sounds are rate-limited
(at most 1 per 40 ms per id; `hit_enemy` and `enemy_fire` at most 1 per 70 ms) and use `x` for stereo pan.
Unknown ids warn once and play nothing; `'boss'` (core's default boss track) aliases `mus_boss`.

### 17.1 SFX (id: one-line recipe)

Who plays what: core the ids it already calls; weapons the weapon and pickup sounds; enemies the enemy sounds and
`formation_bonus`; bosses `boss_roar boss_phase boss_part_break`; hazards the hazard sounds; story the radio,
chirp, choice and rescue sounds; progress the skill sounds; missions `catapult kestrel_pass halcyon_cannon`; ui
the UI sounds plus `boss_warning hazard_warning checkpoint low_hull shield_break player_down respawn mult_up
mission_start mission_fail rank_reveal results_tick` (from bus events and screens).

**Called by core:** `explode_s`: 120 ms noise burst, lowpass sweep 4k to 600 Hz, plus a 90 Hz sine thump ·
`explode_m`: 350 ms noise through a lowpass 3k to 300 Hz, 60 Hz thump, small crackle tail · `explode_l`: 700 ms
layered noise with a 45 Hz sine drop and a 1.2 s rumble tail · `explode_xl`: 1.2 s, two staggered `explode_l`
layers, sub drop 50 to 30 Hz, debris crackle · `explode_boss`: 3 s, rising whine 400 to 1,800 Hz, white flash
burst, 30 Hz sub boom, long rumble and reverb · `beam_charge`: rising saw 200 to 900 Hz over 0.8 s with tremolo ·
`beam_fire`: band-passed noise roar with 110 Hz saw buzz, 1.2 s sustain · `player_hit`: 80 ms square crunch
220 Hz plus noise, bit-crushed · `shield_hit`: glassy FM ping 1.6 kHz with a fast decay · `bomb`: 2 s: deep
reversed swell into a 40 Hz boom, bright noise shimmer, wide reverb · `revive`: rising major arpeggio
C5-E5-G5-C6 on triangles · `mission_complete`: 4-note brass-like saw fanfare G4-C5-E5-G5 with a cymbal swell.

**Weapons and jet:** `shot_pulse`: 30 ms soft square blip 1.1 kHz, low volume, slight random pitch ·
`shot_spread`: 40 ms noise-filtered blip with a short downward chirp · `lance_loop` (loop): sustained saw
chord 220/330 Hz through a moving bandpass, crackle noise, volume by level · `missile_launch`: 120 ms whoosh
(noise highpass sweep up) · `twin_link` (loop): soft shimmering sine pair 660/990 Hz with 4 Hz tremolo ·
`shield_break`: glass shatter (noise burst plus falling FM pings) · `low_hull`: two-tone alarm 880/660 Hz,
3 beeps · `player_down`: falling saw 600 to 80 Hz into `explode_m` · `respawn`: catapult whoosh plus a rising
sine 300 to 900 Hz · `catapult`: m1 launch: steam hiss then a heavy thunk and engine roar.

**Skills:** `skill_ready`: soft bell 1.3 kHz · `skill_fail`: dull 60 ms square at 150 Hz · `sk_bulwark`: rising
glassy chord with a hum bed · `sk_decoy`: double digital blip and a hologram shimmer · `sk_overdrive`: engine
rev saw 100 to 300 Hz plus distortion · `sk_salvo`: 8 rapid `missile_launch` ticks panned left to right ·
`sk_singularity`: reversed whoosh into a deep 50 Hz throb · `sk_repulsor`: thump plus an expanding noise sweep ·
`sk_time_dilation`: tape-stop pitch drop 1.0 to 0.4 over 0.4 s with a ticking clock · `sk_event_horizon` (loop):
very quiet low throb 55 Hz with slow phasing · `sk_second_wind`: heartbeat thump twice then a bright chime ·
`sk_chain`: small pop with a crackle.

**Pickups and score:** `powerup`: ascending square arpeggio 4 notes, bright · `weapon_max`: `powerup` plus a
held shimmering fifth · `shield_up`: rising FM sweep · `repair`: two ratchet clicks and a warm chime ·
`bomb_pickup`: low thunk and a sparkle · `credit`: tiny sine tick 2.4 kHz, pitch rising with a fast combo ·
`credit_big`: two sine ticks 1.8/2.7 kHz · `formation_bonus`: 3-note ascending bell · `mult_up` (x2, x4, x8):
short chord stab, higher per threshold.

**Enemies:** `hit_enemy`: 25 ms filtered tick · `hit_armor`: metallic tink, FM 3 kHz · `enemy_fire`: very quiet
soft pop · `enemy_charge`: 0.4 s rising sine whine · `sniper_lock`: steady 2 kHz tone, 0.25 s beep at lock ·
`spear_lock`: rising square 300 to 600 Hz · `missile_enemy`: low whoosh · `phantom_decloak`: reversed shimmer ·
`warper_blink`: pitch-bent zap 1.2 kHz to 300 Hz · `snatch_tractor` (loop): wobbling 180 Hz hum · `hive_launch`:
mechanical clunk plus a hiss.

**Hazards:** `hazard_warning`: two-tone klaxon 520/390 Hz, 3 cycles · `bh_loop` (loop): 40-60 Hz drone with slow
LFO and filtered rumble, volume by distance · `bh_swallow`: descending noise sweep into silence · `bh_collapse`:
implosion: reversed boom then a ring-out · `rock_break`: crunchy noise burst, low thud · `ion_jam` (loop):
crackling buzz 120 Hz with random dropouts · `storm_strike_warn`: rising electrical crackle 0.9 s ·
`storm_strike`: loud white-noise crack plus a 70 Hz thunder roll · `flare_warn`: rising filtered noise roar over
2.5 s · `flare_burn`: bright saturated roar with a high sizzle · `mine_arm`: fast 3 kHz beeps accelerating ·
`mine_blast`: sharp `explode_m` variant with more highs · `wormhole_open`: swirling phaser sweep ·
`wormhole_warp`: whoosh with a pitch flip.

**Bosses:** `boss_warning`: siren sweep 400 to 800 Hz, 2 cycles, with the WARNING banner · `boss_roar`: intro
rumble: 30 Hz sub swell plus a grinding metal noise · `boss_phase`: stinger: low brass chord and cymbal swell ·
`boss_part_break`: `explode_l` plus a metal snap.

**Rescue and story:** `rescue`: warm 3-note chime C6-E6-G6 · `rescue_vip`: `rescue` plus a gold shimmer and a low
chord · `pod_hit`: hollow clank · `pod_lost`: descending minor 3-note sine · `radio_in`: 120 ms static burst
(bandpassed noise) · `radio_out`: 60 ms click · `chirp_anvil`, `chirp_sparrow`, `chirp_patch`, `chirp_vael`,
`chirp_tamsin`, `chirp_osei`, `chirp_rook`, `chirp_ixa`, `chirp_pilot`: section 2 recipes · `choice_open`: deep
gong-like FM tone with a held pad · `choice_pick`: bright confirm chord · `kestrel_pass`: jet flyby (noise with a
Doppler pitch drop) · `halcyon_cannon`: 1.5 s massive charge-and-fire: rising whine, then a roaring beam.

**UI and flow:** `ui_move`: 35 ms triangle 660 Hz · `ui_confirm`: triangle 880 to 1,320 Hz, 80 ms · `ui_back`:
triangle 520 to 330 Hz · `ui_error`: two short low square buzzes · `ui_buy`: cash-register style: two bright
pings and a coin jingle · `ui_equip`: mechanical clack plus a chime · `ui_unlock`: 4-note rising fanfare with
sparkle · `ui_type`: 10 ms soft tick (typewriter, every 2nd character) · `ui_toast`: soft two-note chime ·
`mission_start`: engine spool-up whoosh · `checkpoint`: two-note rising sine 660/990 · `mission_fail`: falling
minor chord on detuned saws · `rank_reveal`: impact boom plus a bright stinger (higher for S) · `results_tick`:
fast counter ticks while numbers count up.

### 17.2 Music

All tracks are sequenced loops built from synth voices (detuned saws, squares, FM bells, noise drums) with
section changes; `music()` crossfades 1 s.

| id | Use | Tempo | Key | Instrumentation | Structure | Mood |
|---|---|---|---|---|---|---|
| `mus_title` | title, callsign, coop | 96 | D minor | warm detuned-saw pad, slow square arpeggio with delay, sub pulse, soft noise hats | 4-bar intro, 16-bar loop | heroic, hopeful |
| `mus_menu` | star map, hangar, skills, briefing | 90 | F major | FM electric piano, plucks, brushed noise, round bass | 16-bar loop | calm, confident |
| `mus_m1` | m1 | 140 | E minor | driving 8th-note saw bass, square lead, gated pad, punchy kit, arps | A8 B8 chorus16 bridge8 | bright, heroic |
| `mus_m2` | m2 | 128 | C minor | slow pads with gliding pitch bends, deep sub, ticking hats, sparse bell lead with long delay | A16 B16 | eerie, tense |
| `mus_m3` | m3 | 150 | A minor | distorted bass, stabbing chords, rolling toms, noise thunder swells | A8 B8 C16 | urgent, stormy |
| `mus_m4` | m4 | 136 | B minor | bright supersaw pads, shimmering arps, FM bass, big snare | A16 B16 | epic, scorching |
| `mus_m5` | m5 | 145 | D minor | choir-like formant pads, bass ostinato, soaring lead, big drums | A8 B8 C16 D8 | final, driven |
| `mus_side` | side stories | 132 | G minor | pluck lead, funky bass, claps, light pads | A16 B8 | adventurous |
| `mus_boss` | m1-m2 bosses | 155 | E minor | aggressive arps, double-time kick, siren lead | A8 B8 | menacing |
| `mus_boss_heavy` | m3-m4 bosses | 150 | F# minor | distorted bass, half-time drum breaks, brass-like stabs | A8 B8 C8 | heavy, threatening |
| `mus_boss_final` | m5 boss | 160 | D minor | organ-like pads, choir, lead, toms; lifts to E minor after 32 bars | A16 B16 C16 | epic finale |
| `mus_miniboss` | side-story mini-bosses | 150 | C minor | tight arps, punchy kit, short lead | 16-bar loop | intense |
| `mus_victory` | results | 120 | C major | brass-like saw fanfare, timpani-style toms, then a calm loop | 4-bar sting, 8-bar loop | triumphant |
| `mus_fail` | failed | 70 | A minor | descending pad sting, then a soft pulse | sting, 8-bar loop | somber |
| `mus_ending` | ending | 84 | D major | slow pads, bell melody, warm bass, final held chord | 32 bars, no loop | warm, relieved |

## 18. UI and screens

### 18.1 Flow

`title` (new save: `callsign` first) to `starmap`. `starmap` opens `hangar`, `skills`, `settings`, `controls`
and `briefing`; `briefing` launches the mission (HUD; `pause` on Escape/P/Start). Success: `results`, then
`starmap` (first m5 clear: `ending`, then `starmap`). Failure: `failed` (retry from checkpoint, restart, star
map). `2 PLAYERS` on the title opens `coop`, then `starmap` with co-op on. Every screen works with mouse, touch,
keyboard and gamepad (`SL.input.menu`; Back/Escape returns). Menus use the attract scene
`SL.game.setMenuScene({bg:'bg_vesta', bgOpts:{phase:'menu'}, player:{index:0}})`. Music: `mus_title` on title,
callsign and coop; `mus_menu` elsewhere; `mus_victory` on results; `mus_fail` on failed; `mus_ending` on ending.

### 18.2 Screens (final copy)

- **`title`:** logo `EARTH VANGUARD` (Oxanium 800, white-to-cyan gradient, slow glint), tagline "Fly low. Shoot
  straight. Bring them home." Buttons: `CONTINUE` (save has progress) or `START`, `2 PLAYERS`, `SETTINGS`,
  `CONTROLS`, and a small `NEW GAME` link when a save exists (in-page confirm: "Erase your progress and start
  over?" `YES, ERASE` / `CANCEL`). Footer: "Press Enter or tap START". The `ACE OF THE HALCYON` badge shows when
  earned.
- **`callsign`:** title `PILOT CALLSIGN`, text "Your crew will call you this on the radio." Input (A-Z and 0-9,
  1-10 characters, uppercased, default `LANCE`); suggestion chips `LANCE NOVA COMET VIPER ORBIT BLAZE`; error
  "Use 1 to 10 letters or numbers." Buttons `CONFIRM`, `BACK`.
- **`coop`:** title `2 PLAYERS`. Panel `PLAYER 1` (cyan): "WASD move · SPACE fire · Q bomb · E skill · LEFT
  SHIFT focus". Panel `PLAYER 2` (amber): "ARROWS move · / fire · ENTER bomb · RIGHT SHIFT skill · RIGHT CTRL
  focus", a `P2 CALLSIGN` input (default `EMBER`). Gamepad line: "Gamepads connected: {n}" and "One gamepad
  plays PLAYER 2. Two gamepads play both." Note: "Lives are shared. Fly over your partner's pod to revive them."
  Buttons `LAUNCH CO-OP`, `BACK`.
- **`starmap`:** header: callsign, credits (gold), SP (violet), difficulty selector `CADET / PILOT / ACE` (ACE
  locked: "ACE unlocks after NIGHTFALL"), `CO-OP ON` chip in co-op. Map: m1 (bottom) to m5 (top) along a glowing
  route; each side story branches off its mission (s1 off m1, s2 off m2, s3 off m3, s4 off m4). Selected card:
  `MISSION 1` / `SIDE STORY`, name, location, the signature-moment image, `BEST 184,200`, rank medal, `RESCUED
  13/15`, status `NEW`, `CLEARED` or locked text ("Clear FIRST LIGHT to unlock." / "Rescue Captain Tamsin in
  FIRST LIGHT, or clear DEEP PULL."). Buttons `LAUNCH`, `HANGAR`, `SKILLS`, `SETTINGS`, `TITLE`; post-game
  `WATCH ENDING`. Unlock toasts per section 15.
- **`hangar`:** title `HANGAR`, credits. A rotating Patch tip: "Patch: Armor first. Then guns. Then more guns." /
  "Patch: Missiles never miss. Well. Rarely." / "Patch: Spare jets are cheaper than funerals." Eight cards (two
  columns, one on narrow screens): name, level pips, description, `NEXT: +15 HULL`, button `UPGRADE · 450`,
  `NEED 450` (disabled) or `MAXED`. Purchase toast "ARMOR PLATING LV 2", sfx `ui_buy`. Button `BACK`.
- **`skills`:** title `SKILL TREE`, SP. Columns `AEGIS`, `VANGUARD`, `GRAVITY` with node icons (owned glow in
  the branch color, locked dim). Detail panel: name, tag `ACTIVE · 22 S COOLDOWN` or `ALWAYS ON`, the one-line
  effect, then either "Earn it in LANTERN RUN: choose STAY ON THE LINER." or `UNLOCK · 2 SP` / "Requires HOT
  BARRELS". Owned actives: `EQUIP P1`, `EQUIP P2` (co-op), `EQUIPPED`. Button `BACK`.
- **`briefing`:** tag `MISSION 1` or `SIDE STORY`, title, location, the briefing lines typing beside portraits
  (tap or confirm skips a line), objectives (bonus rows tagged `BONUS · +150`), `PRIMARY: PULSE / SPREAD /
  LANCE` (only unlocked types; hidden until ARSENAL 1), difficulty shown. Buttons `LAUNCH`, `HANGAR`, `BACK`.
  The prologue card (section 3.1) shows first on a new save's first m1 briefing.
- **`pause`:** title `PAUSED`, mission name. Buttons `RESUME`, `RESTART FROM CHECKPOINT` (when one exists),
  `RESTART MISSION`, `SETTINGS`, `CONTROLS`, `QUIT TO STAR MAP` (confirm "Quit the mission? You keep nothing from
  this run." `YES, QUIT` / `CANCEL`).
- **`settings`:** `AUDIO`: MASTER, MUSIC, SFX sliders (0-100%). `GAMEPLAY`: AUTO-FIRE (ON/OFF), SHOW HITBOX
  (WHILE FOCUSING / ALWAYS), TOUCH SENSITIVITY (50-200%), RADIO SPEED (50-200%). `VIDEO`: QUALITY (AUTO / HIGH /
  MEDIUM / LOW), SCREEN SHAKE (0-100%), FLASHES (ON/OFF). `SAVE`: `EXPORT SAVE CODE` (shows the code with `COPY`),
  `IMPORT SAVE CODE` (field + `LOAD`; "Save code loaded." / "That code didn't work."), `RESET PROGRESS` (confirm
  "Erase all progress? This can't be undone." `ERASE` / `CANCEL`). Button `BACK`.
- **`results`:** title `MISSION COMPLETE`; the rank letter slams in (`rank_reveal`); rows `SCORE` (with `NEW
  BEST!`), `MAX CHAIN x5.3`, `KILLS 87%`, `RESCUED 13 / 15`, `HITS TAKEN 4`, `LIVES LOST 0`, `TIME 3:41`, `BOSS
  TIME 1:02 · TIME BONUS +3,250`; objectives with check marks; credits `COLLECTED 612 · COMPLETION +400 · RANK A
  +120 · OBJECTIVES +300 · TOTAL +1,432`; `SP +1`; a skill card `NEW SKILL: BULWARK` (side stories); unlock lines.
  Buttons `CONTINUE`, `REPLAY`, `HANGAR`.
- **`failed`:** title `MISSION FAILED`, the reason (`result.flags.failReason` or "All jets are down."),
  `CREDITS KEPT: 306 (50%)`, Patch: "I can fix her. Can you fix that approach?" Buttons `RETRY FROM CHECKPOINT`
  (when one exists), `RESTART`, `STAR MAP`.
- **`ending`:** section 3.3 lines over `bg_tartarus` phase `finale`, then epilogue cards, then `THE END`; buttons
  `SKIP` while typing, `CONTINUE` at the end.
- **`controls`:** tabs `KEYBOARD`, `CO-OP`, `GAMEPAD`, `TOUCH & MOUSE`. Keyboard: "Move: WASD or arrows · Fire
  (manual mode): Space, Z or J · Bomb: X, Q or K · Skill: C, E or L · Focus: Shift · Pause: Escape or P".
  Co-op: section 12. Gamepad: "Move: left stick or D-pad · Bomb: A · Skill: X or B · Focus: LB or RB · Fire
  (manual mode): RT · Pause: Start". Touch & mouse: "Drag anywhere to fly. The jet follows your finger's motion.
  Tap BOMB and SKILL. Mouse: hold the left button and drag; right-click bombs."

### 18.3 HUD (`SL.hud`, logical px on `#hud`)

- **Top strip (y 0-64):** P1 block at the left: callsign (14 px), shield bar (200 x 5, blue) over the hull bar
  (200 x 10; green, amber below 50%, red and pulsing at <= 30%), then life icons and bomb icons. Center: score
  (Oxanium 28 px) and the multiplier `x3.4` with a draining chain underline. Right: credits (gold crystal and
  number) in solo; in co-op the P2 block mirrors P1 in amber at the right and credits move under the score.
- **Boss bar** (while a boss lives, y 70-104): 600 px centered, name (Oxanium 18 px) and title (12 px, dim),
  phase notches at each `at`, a magenta fill with a white damage-lag trail. Ally bars (`LANTERN`, `ROOK`) sit
  under it: green, 300 px.
- **Radio box:** DOM, under the top strip (about y 110-220 logical, 92% width, two lines).
- **Bottom (y 1196-1270):** weapon icon, type name and 5 level pips at the left with 3 missile pips; the skill
  ring (48 px, cooldown sweep in the branch color, key hint) at the right (on touch the SKILL button shows it).
- **Banners:** centered at y 420, title plus sub line: `WARNING` magenta with hazard stripes, `CHECKPOINT` cyan,
  hazard warnings amber; status tags `ION JAM` and `TWIN LINK` near the jet. Edge chevrons: red for enemies from
  below, green for incoming pods.

### 18.4 Touch layout

`BOMB` (round, 15 cqw, bottom-right with 4 cqw margins, shows the bomb count), `SKILL` (13 cqw, above BOMB,
cooldown ring; hidden with no active equipped), `PAUSE` (8 cqw, top-right corner; the HUD keeps 9 cqw clear
there). Glass buttons with an icon and label, pressed state, never over the jet's bottom-center start. Dragging
anywhere else moves the jet.

## 19. Art direction

- **Factions.** Humans: glossy white `#e8eef7` hulls, cyan trim `#3fc8ff`, glow `#7fe3ff`, engines `#9fe8ff`
  (`SL.pal.player`); P2 graphite `#2b2f3a`, gold `#ffb53f`, glow `#ffd27a`, engines `#ffb070` (`SL.pal.player2`);
  the *Halcyon* grey `#4a5468` with cyan deck lights. Nyx Armada: graphite `#1c1f2b` / `#3a3f55`, seams
  `#ff2f6d`, glow `#ff5c8a`, engines `#ff7a3d` (`SL.pal.enemy`), violet `#b26bff` for gravity tech and Vael.
  Enemy bullets `#ff4fd8` / `#ff8a3d` / `#b26bff` / `#ff3b4f` (`SL.pal.ebullet`). Credits `#ffd34d`, rescue
  `#5dffb0`. Branches: AEGIS `#4fb4ff`, VANGUARD `#ff8a3d`, GRAVITY `#b26bff`.
- **Mission palettes** (full lists in sections 4-5): `bg_vesta` teal `#123a48` and sodium `#ffb15c`;
  `bg_kerr` violet-black `#05060d` with accretion `#ffcf8a`; `bg_tantalus` indigo `#1d2450` and plum
  `#3a1f4d`; `bg_tarsis` corona blue `#4f8dff`; `bg_tartarus` void `#030308`, rift `#2a0f3f`, rim `#ff5c8a`;
  `bg_callisto` ice `#cfe6f5` over `#05080f`. The two black-hole worlds never match: m2 burns warm gold, m5 is
  cold violet.
- **Lighting and materials.** Key light from the upper left (`SL.art.lightDir`). Hulls: `SL.art.metal` base
  gradient + rim + specular band + `panelLines` + `emissive` seams and lights. Canopies are smoked glass with a
  colored reflection streak. Engines are live `SL.art.flame` plumes with additive glow, longer when thrusting.
  Everything has secondary motion: banking, bobbing, spinning parts, blinking lights, flickering engines.
- **Glow rules.** Only lasers, bullets, beams, engine cores, explosions, pickups, beacons and hazard rims may be
  near-white or fully saturated (they bloom). Hulls stay mid-value. Backgrounds stay below 40% value and 45%
  saturation inside the central 560 px column; bright planet limbs, suns and disks live at edges and corners;
  nothing in a background may look like a bullet.
- **Jets.** XF-9 *Starlance* (88 x 104 sprite, facing up): arrowhead fuselage, small forward canards, swept main
  wings with cyan emissive leading-edge strips, twin engines, smoked canopy with a cyan reflection, wingtip nav
  lights (red left, green right, 1 Hz); 9 bank frames for +-0.35 rad (wings foreshorten). XF-9B *Sunlance*: the
  same airframe in graphite and gold with an amber canopy. *Kestrel* (`ally_kestrel`, 64 x 72): single engine,
  white with a cyan stripe; Rook's Kestrel (`ally_rook`) gunmetal `#6a7088` with a chess-rook decal.
- **Explosions** (`SL.fx.explode` palettes): `enemy` default; `violet` for phantom, warper, tug, LODESTAR,
  CRUCIBLE and OUROBOROS; `blue` for stormcaller, TEMPEST and SUNEATER; `player` for player and ally jets;
  `green` for destroyed pods (small); `gold` for credit-rich moments (formation bonus pop, boss credit shower).
  Sizes follow section 6; bosses use `boss` plus their own chains.
- **UI look.** Deep glass panels (`--sl-glass`, 1 px edges), cyan for P1 and primary actions, amber for P2 and
  caution, magenta for danger and enemies, gold for credits, violet for SP. Fonts: **Oxanium** for display,
  headings, buttons and HUD numerals; **Barlow Semi Condensed** for body, radio and descriptions. Uppercase
  labels with 0.08em tracking; motion 120-240 ms ease-out; everything sized in `cqw`.

## 20. ID catalog

- **Missions:** `m1 m2 m3 m4 m5 s1 s2 s3 s4`.
- **Characters:** `anvil sparrow patch vael tamsin osei rook ixa p1 p2`.
- **Backgrounds and phases:** `bg_vesta` (`launch belt shipyard storm boss sunrise menu`), `bg_kerr`
  (`approach lensing station boss calm lagrange`), `bg_tantalus` (`nebula storm eye boss clear boneyard`),
  `bg_tarsis` (`corona eclipse mirrors flare boss calm`), `bg_tartarus` (`rift binary throne boss finale
  foundry`), `bg_callisto` (`colony blizzard boss orbit`).
- **Enemies:** `gnat dart wasp snatcher spear needler skimmer hornet phantom warper manta weaver stormcaller hive
  bastion tug`. **Formations:** `vee line column arc_sweep pincer snake staircase ring_in side_stream rain
  escort_box`.
- **Bosses:** `boss_razorback boss_lodestar boss_tempest boss_suneater boss_ouroboros mb_hailstorm mb_tether
  mb_mantis mb_crucible`; bossesB also defines the flyby enemy `mantis_pass`. Parts: `turret_l turret_r core`
  (razorback), `pylon_ne pylon_nw pylon_se pylon_sw`
  (lodestar), `spire_l spire_r eye` (tempest), `mirror_1 mirror_2 mirror_3 mirror_4 core` (suneater),
  `engine_l engine_r spine crown` (ouroboros), `cage_l cage_r` (crucible).
- **Hazards:** `black_hole asteroid_storm ion_storm solar_flare mine_field wormhole`; hazard prop
  `prop_shade_rock` (skins `rock mirror`, spawned by `SL.hazards.shadeRock`); variants `rock ice debris`; black-hole sizes `small medium large`.
- **Enemy bullet types:** `orb orbBig orb_huge needle shard mine missile spark petal flare void_orb beam`.
  **Player bullet types:** `pulse spread missile`; player beams `lance` and `twin_link`.
- **Patterns:** `aimed burst fan ring ring_stagger spiral double_spiral stream wave flower wall_gap rain_curtain
  lattice pinwheel orbit_release homing_salvo split_shot sniper_line beam beam_sweep cross_beams mine_lay
  gravity_sling`; helper `SL.patterns.target`.
- **Pickups:** `credit credit_big weapon_up weapon_pulse weapon_spread weapon_lance missile shield bomb repair`.
  **Drop tables:** `drop_small drop_fighter drop_gunship drop_heavy drop_formation`.
- **Pod kinds:** `civilian crew medical captive vip pilot`.
- **Upgrades:** `armor shield firerate arsenal missiles bombs magnet reserve`.
- **Skill branches:** `aegis vanguard gravity`. **Skills:** `sk_bulwark sk_decoy sk_repulsor sk_second_wind
  sk_overdrive sk_salvo sk_hot_barrels sk_chain_reaction sk_singularity sk_time_dilation sk_event_horizon
  sk_gravity_surfer`.
- **Choices and options:** `s1_choice` (`guard_liner draw_fire`), `s2_choice` (`save_core save_crew`),
  `s3_choice` (`chase_mantis rig_field`), `s4_choice` (`detonate_seed steal_seed`).
- **Objectives:** `m1_obj_boss m1_obj_rescue m1_obj_vip m2_obj_boss m2_obj_rescue m2_obj_vip m3_obj_boss
  m3_obj_rescue m3_obj_vip m4_obj_boss m4_obj_rescue m4_obj_vip m5_obj_boss m5_obj_rescue m5_obj_lives
  s1_obj_liner s1_obj_boss s1_obj_rescue s2_obj_boss s2_obj_rescue s2_obj_horizon s3_obj_boss s3_obj_rook
  s3_obj_rescue s4_obj_boss s4_obj_rescue s4_obj_hits`.
- **Radio lines:** every id in section 16.2 (prefixes `m1_`..`m5_`, `s1_`..`s4_`); reactive pools `rx_pod_rescued
  rx_pod_lost rx_vip_lost rx_snatch rx_snatch_saved rx_low_hull rx_shield_break rx_player_down rx_coop_down
  rx_revive rx_bomb rx_weapon_max rx_chain rx_formation rx_black_hole rx_boss_low rx_skill` (variants `_1`..`_n`).
- **Mission entities and calls (missions):** allies `ally_lantern ally_rook ally_kestrel`; props `prop_core
  prop_seed`; calls `lantern_launch lantern_relay target_beacon lantern_depart kestrel_strafe kestrel_escort
  halcyon_broadside attach_core hab_pods core_collapse spawn_rook mantis_flyby mines_drift rig_mines rook_swarm
  behind_warning time_waves attach_seed`. Skill ally (progress): `ally_decoy`.
- **Music:** `mus_title mus_menu mus_m1 mus_m2 mus_m3 mus_m4 mus_m5 mus_side mus_boss mus_boss_heavy
  mus_boss_final mus_miniboss mus_victory mus_fail mus_ending`.
- **SFX:** `explode_s explode_m explode_l explode_xl explode_boss beam_charge beam_fire player_hit shield_hit bomb
  revive mission_complete shot_pulse shot_spread lance_loop missile_launch twin_link shield_break low_hull
  player_down respawn catapult skill_ready skill_fail sk_bulwark sk_decoy sk_overdrive sk_salvo sk_singularity
  sk_repulsor sk_time_dilation sk_event_horizon sk_second_wind sk_chain powerup weapon_max shield_up repair
  bomb_pickup credit credit_big formation_bonus mult_up hit_enemy hit_armor enemy_fire enemy_charge sniper_lock
  spear_lock missile_enemy phantom_decloak warper_blink snatch_tractor hive_launch hazard_warning bh_loop
  bh_swallow bh_collapse rock_break ion_jam storm_strike_warn storm_strike flare_warn flare_burn mine_arm
  mine_blast wormhole_open wormhole_warp boss_warning boss_roar boss_phase boss_part_break rescue rescue_vip
  pod_hit pod_lost radio_in radio_out chirp_anvil chirp_sparrow chirp_patch chirp_vael chirp_tamsin chirp_osei
  chirp_rook chirp_ixa chirp_pilot choice_open choice_pick kestrel_pass halcyon_cannon ui_move ui_confirm ui_back
  ui_error ui_buy ui_equip ui_unlock ui_type ui_toast mission_start checkpoint mission_fail rank_reveal
  results_tick`.
- **Screens:** `title callsign coop starmap hangar skills briefing pause settings results failed ending controls`.
- **Save and session fields:** `save.flags.unlock_s1..unlock_s4`, `save.flags.seen_prologue`,
  `save.flags.ace_badge`, `save.loadout.primary`, `session.flags.<choiceId>`, `session.flags.failReason`.
- **Cross-module fields:** `p.data.ionJamT` (hazards to weapons), `p.data.overdrive` (progress to weapons),
  `p.data.aimBait` and ally `def.aimBait` / `e.aimBait` (missions, progress to patterns), `pod.towedBy` (enemies
  to rescue), `h.gravity`, `b.gravity`, `b.gravityList` (hazards, bosses to patterns, progress, missions),
  `mission.tune` (missions to enemies, patterns), `objective.bonus` (missions to progress, ui), `def.dropTable`
  and `def.dropChance` (enemies to pickups), ally `def.hudBar` (missions to ui), `targetId` on mission entities
  (missions to patterns).

## 21. Work packages

Every builder also reads the conventions block at the top, section 20 and section 22.

| Module | Files | Owns (sections and ids) | Cross-module ids to reference |
|---|---|---|---|
| weapons | `09_weapons.js`, `10_pickups.js` | 10, 12 (Twin Link), 19 (jets); pbullet `pulse spread missile`, beams `lance twin_link`, jet art P1/P2, all 10 pickups, 5 drop tables, `SL.pickups.roll/tables`, mercy rule, boss/outro credit vacuum | stats from progress; `p.data.ionJamT`, `p.data.overdrive`; `SL.game.coop`; sfx `shot_pulse shot_spread lance_loop missile_launch twin_link powerup weapon_max shield_up repair bomb_pickup credit credit_big` |
| enemies | `11_enemies.js`, `12_patterns.js` | 6, 7; 16 enemies, 11 formations, formation bonus, 12 ebullet types and the beam restyle, 23 patterns, `SL.patterns.target` | `mission.tune`; `SL.pickups.roll('drop_formation')`; `SL.spawnHazard('black_hole', {attachTo})`; `SL.rescue.spawnPod` (bastion cargo); `pod.towedBy`; `h.gravity`; `aimBait` and `targetId`; sfx in 17.1 Enemies + `formation_bonus` |
| bossesA | `13a_bosses.js` | 8.1, 8.2, 8.3, 8.6, 8.7: `boss_razorback boss_lodestar boss_tempest mb_hailstorm mb_tether` | patterns and bullet types; `asteroid_storm` (HAILSTORM); `ally_lantern` targeting; `b.gravity`; sfx `boss_roar boss_phase boss_part_break` |
| bossesB | `13b_bosses.js` | 8.4, 8.5, 8.8, 8.9: `boss_suneater boss_ouroboros mb_mantis mb_crucible` and the flyby enemy `mantis_pass` | `solar_flare`, `wormhole`, `SL.hazards.shadeRock` (hazards); rigged mines damage MANTIS; `SL.story.radio('m5_boss_horizon')`; `save.missions.s4.done`; `b.gravityList`; sfx as bossesA |
| hazards | `14_hazards.js` | 9; 6 hazards, `prop_shade_rock` and `SL.hazards.shadeRock`, `h.gravity`, ion jam, shade test, `mine_field` `rig/setDrift`, warning texts | `SL.rescue.lose`; `SL.world.applyGravity`; `SL.render.addLens/addRipple`; sfx in 17.1 Hazards |
| backgrounds | `15_backgrounds.js` | backgrounds and phases of sections 4, 5 and 19: `bg_vesta bg_kerr bg_tantalus bg_tarsis bg_tartarus bg_callisto`, the menu phase, painted lensing, launch deck, sunrise, eclipse, rift, finale | phase names used by missions; glow rules (19) |
| story | `16_story.js`, `16_story.css`, `17_rescue.js` | 2, 3, 5 (choice data and dialog), 11, 16, radio box; characters and portraits, briefings, prologue, all lines and pools, tokens, automatic cues, `SL.story.choices`, `autoChoose`; pods, `SL.rescue.spawnPod/spawnPilotPod/lose`, towing, VIP unlock flags | skill names and effects (14) on choice cards; mission ids; sfx `radio_in radio_out chirp_* choice_open choice_pick rescue rescue_vip pod_hit pod_lost` |
| missions | `18_missions.js` | 4, 5; mission defs (name, order, location, bg, music, bossMusic, boss, tune, objectives with `bonus`, rewards, unlock/requires), timelines, mission entities and calls, `failReason`, story echoes | every enemy, formation, hazard, pickup, pod kind, radio id, music id, bg phase, boss id; `mantis_pass` (bossesB); `targetId`; `SL.skills.dilate`; `mine_field.rig/setDrift`; sfx `catapult kestrel_pass halcyon_cannon` |
| progress | `19_progress.js` | 13, 14, 15; `SL.upgrades`, `SL.skillTree`, `SL.skills` (12 skills, `dilate`, `ally_decoy`), `playerStats`, `applyMissionResult` (completion, replay, rank and objective bonuses, SP, skills, unlocks), unlock rules, rank formula, save samples, `save.loadout` | choice ids/options, mission ids, objective ids; pbullet `missile`; sfx `skill_ready skill_fail sk_*` |
| ui | `20_ui.js`, `20_ui.css` | 18; all 13 screens, HUD, touch buttons, banners, ally bars, chevrons, status tags, unlock toasts, prologue card | `SL.story.briefings`, `SL.upgrades`, `SL.skillTree`, `SL.progress`; `hazardWarning`/`bossWarning`; sfx `ui_*` and the ui list in 17.1 |
| audio | `03_audio.js` | 17; every sfx and music id, mix, ducking, rate limits, `boss` alias | ids called by core and every module (section 20) |

## 22. Proposed contract changes

No existing API changes. The GDD relies on these additive, module-owned extensions; please note them in
ARCHITECTURE 6.10 so every module codes against the same names:

1. `SL.patterns.target(src) -> {x, y, ref}` (enemies) with `aimBait` on allies and players (section 7.4).
2. `SL.pickups.roll(tableId)` and `SL.pickups.tables`; enemy defs carry `dropTable` and `dropChance` (weapons).
3. `SL.rescue.lose(pod, reason)` and `pod.towedBy` (story/rescue), used by hazards and enemies.
4. `h.gravity = {x, y, pull, range, r}` on gravity hazards and `b.gravity` / `b.gravityList` on bosses.
5. `p.data.ionJamT` (hazards write, weapons read) and `p.data.overdrive` (progress write, weapons read).
6. Mission def fields `tune {bulletSpeed, fireRate}`, `objectives[i].bonus`, ally `def.hudBar`, and
   `session.flags.failReason` read by the failed screen.
7. `SL.skills.dilate(seconds, scale)` (progress), `SL.story.choices` and the tokens `{callsign2}` and `{pilot}`
   (story), `mine_field` def methods `rig(h)` and `setDrift(h, px)` and `SL.hazards.shadeRock(x, y, opts)`
   (hazards), and `targetId` on mission entities (missions).
8. Progress replaces `SL.game.rank` with the section 15 formula (core already allows this).
