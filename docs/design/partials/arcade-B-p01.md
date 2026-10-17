# STARLANCE: Game Design Document (arcade combat draft)

Draft lens: arcade combat feel. This document decides content and numbers. `docs/ARCHITECTURE.md` decides
structure and APIs and wins on any API question. All numbers are Pilot difficulty before `SL.game.diff`
multipliers unless a line says otherwise. Times in wave scripts are director-clock seconds.

Conventions used everywhere below:
- Damage classes: `s` = 8, `m` = 12, `l` = 18 (× `diff.damage`). Enemy beam 45/s. Body contact 20.
- Speeds are px/s on the 720 × 1280 logical playfield. Angles: 0 = right, 90° = straight down.
- "Aimed" means at the nearest living player at the moment of firing.
- Core bullet ids keep their ARCHITECTURE spelling (`orb`, `orbBig`, `needle`, `shard`, `mine`, `beam`).
  Every new id in this document is lowercase snake_case.
- Radio lines are at most 90 characters. `{callsign}` is P1's callsign. `{callsign2}` is P2's callsign
  (story extension: same replacement rule, empty-safe).

## 1. Pitch and tone

**Pitch.** You are {callsign}, test pilot of the XF-9 "Starlance", the fastest jet the human fleet ever
built and the last one still flying at the Vesta Line. The Nyx Armada has come out of the Tartarus Rift
towing captive black holes, and it drops them on human worlds like anchors. Over five missions you fly
from the burning Vesta shipyards to the Armada's throne between two black holes, tearing through jet
swarms, gunships and kilometer-long warships, each mission ending in a screen-filling boss that breaks
apart in stages. Between fights you pull stranded people out of escape pods, take side missions that
teach your jet new tricks, and spend your salvage in the hangar. A friend can grab the gold twin jet and
fly beside you at any time.

**Tone.** Bright, loud, heroic and a little cheeky. Saturday-morning space opera: the crew banters, the
villain is grand and cold, nobody gives speeches longer than a breath. Danger is real but never grim. The
story never stops the shooting: briefings are four lines, radio talks while you fly, choices take one tap.

**Why it feels like Lightning Fighter.**
- Relative drag control on touch, instant response, a jet that banks hard, auto-fire on by default.
- Weapon chips that visibly change your jet's firepower within seconds: twin lasers become a wall of light.
- Glossy metal enemy jets with hot engines, arriving in tight formations that pop in chains of sparks.
- Huge bosses that fill the top of the screen, lose armor plates and turrets, and change attacks at each
  health mark, with a dedicated health bar and a slow-motion death.
- Credits rain from every kill and feed a between-mission upgrade shop.
- Bombs as panic buttons that turn the bullet curtain into gold.

**Arcade pillars (this draft's priorities).**
1. *Readable danger.* Every attack telegraphs. Bullets are the brightest thing on screen. A death is
   always the player's fault and always looks spectacular.
2. *Rhythm.* Every mission alternates peaks (30-45 s of dense waves) and breathers (8-15 s with pods,
   pickups and radio). Bosses escalate in 3-4 phases with a short invulnerable "phase break" between.
3. *Power you can see.* Weapon levels, missiles, skills and co-op Twin Link all change the screen.
4. *Formation chains.* Kill a whole formation and its last member drops a power chip. Speed kills pay.

## 2. Characters

| id | Name | Callsign | Role |
|---|---|---|---|
| `anvil` | Commander Maren Kade | ANVIL | Commanding officer of the carrier UNS Halcyon. Mission control. |
| `sparrow` | Lieutenant Juno Park | SPARROW | Your wingmate. Flies an F-7 Kestrel escort (appears as an AI ally). |
| `socket` | Chief Ines Duarte | SOCKET | Hangar chief and mechanic. Runs the upgrade hangar. |
| `vael` | Hierarch Vael | (none) | Ruler of the Nyx Armada. Broadcasts taunts on open channels. |
| `vale` | Dockmaster Tamsin Vale | DOCKMASTER | Cold Harbor colony dockmaster. VIP in m1, guide in s1. |
| `osei` | Dr. Halima Osei | (none) | Gravity physicist of Lagrange Deep Station. VIP in m2, guide in s2. |
| `rook` | Captain Dario Vance | ROOK | Veteran ace, Armada prisoner. VIP in m3, ally pilot in s3. |
| `ixa` | Ixa | (none) | Nyx foundry engineer who defects. VIP in m4, guide in s4. |

Player characters: P1 is `{callsign}` (default `LANCE`), flying XF-9 Starlance (white/cyan). P2 is
`{callsign2}` (default `VEGA`), flying the XF-9B "Gold Twin" (graphite/gold). They have no portraits on
the radio; the radio box shows the jet icon in the player's color when a player-addressed line plays.

**Radio personalities.**
- `anvil`: clipped, calm, decisive. Short orders, rare dry jokes. Never panics; drops to a quieter voice
  when things are bad. Calls the player by callsign.
- `sparrow`: fast, cocky, warm. Trash talk at enemies, cheers for every rescue, worries out loud when you
  are hurt. Calls the player "Lance" or the callsign, and P2 "Twin".
- `socket`: gruff, practical, proud of the jet. Explains pickups and hazards in plain words. Talks to the
  Starlance like a stubborn pet ("she", "my girl").
- `vael`: slow, ceremonial, cold. Speaks of stars, night and endings. Never says the player's name; calls
  them "little light".
- `vale`: tired, brave civil servant. Numbers and people first.
- `osei`: brilliant and blunt, talks physics in one-liners, dark humor about gravity.
- `rook`: dry old ace, terse, competitive, a soft spot hidden under it.
- `ixa`: precise and formal, slightly odd word choice, shows fear only once.

**Procedural portraits.** Portrait canvas 96 × 120, drawn by `SL.story.characters[id].portrait(ctx, w, h,
t, talking)`. Every portrait: dark gradient backdrop tinted with the character color at 25%, 6 px scanlines
scrolling at 18 px/s (alpha 0.18), a 2 px rim in the character color, and a mouth or visor-light that pulses
while `talking` (amplitude 0.4-1.0 at 17 Hz). Heads are built from ellipses and rounded paths.

| id | Color | Portrait build |
|---|---|---|
| `anvil` | `#ffb53f` amber | Oval face (skin `#8d5a3b`), close-cropped silver hair cap (`#c9ced8`) as a flat arc, narrow eyes (2 short dark strokes), a pale scar line above the left brow. Navy uniform collar (`#1d2a44`) with two gold pips. A slim headset arm crosses the cheek to an amber mic light that glows while talking. |
| `sparrow` | `#3fc8ff` cyan | White flight helmet (gloss gradient `#e9eef7` to `#8994ab`) with a cyan center stripe, wide mirrored visor (gradient `#9fe8ff` to `#0b1a2e`) with a moving specular streak; a small bird decal (3 strokes) on the helmet side. Visor light bar pulses while talking. |
| `socket` | `#ff9d4a` orange | Round face (skin `#c68a5e`), orange headscarf (`#ff8a3d`) with a knot on top, welding goggles pushed up on the forehead (two dark circles with amber lenses `#ffcc66`), a grease smudge on one cheek, wide mouth. |
| `vael` | `#b26bff` violet | No face: an angular black mask (`#0c0d14`) shaped like an inverted shield with a single horizontal violet slit (`#b26bff`, glow) for eyes; a crown of 7 thin spikes; the whole portrait is shown through heavy static (random horizontal tears every 0.3 s) and a violet chroma offset. The slit brightens while talking. |
| `vale` | `#7fd6ff` ice blue | Long face (skin `#e0b896`), parka hood ring of white fur (jagged ellipse `#f3f6fa`), dark hair strands, tired eyes with lower shadows, a headset with an ice-blue light. |
| `osei` | `#5dffb0` green | Round face (skin `#5a3a28`), short natural hair (dark rounded cloud shape `#1a1310`), round glasses (two circles with white glints), lab collar (`#e8eef7`) with a green ID clip. |
| `rook` | `#d8dde8` steel | Square jaw (skin `#b07a56`), grey stubble dots, an old flight helmet without visor (`#4a5163` gloss) with a chipped rook-chess-piece decal, one cybernetic eye (small cyan ring). |
| `ixa` | `#ff6fae` rose | Nyx engineer: pale grey-violet skin (`#9a8fb3`), elongated head, two thin pink seam lines running from the eyes to the jaw (`#ff5c8a`, glow), a hood of segmented plates (`#2a2d3d`). Large dark eyes with pink pinpoint lights. |

**Radio chirp styles** (played by `sfx('radio_chirp', {pitch})` variants; ids in section 17):
- `anvil` → `chirp_anvil`: two square blips 440 Hz then 330 Hz, 60 ms each, band-passed at 1.8 kHz.
- `sparrow` → `chirp_sparrow`: three rising sine blips 880, 1100, 1320 Hz, 40 ms each.
- `socket` → `chirp_socket`: crunchy saw blip at 220 Hz, bit-crushed (8 steps), with a 30 ms noise burst.
- `vael` → `chirp_vael`: descending ring-modulated sweep 600 to 150 Hz over 400 ms with heavy static.
- `vale`, `osei`, `rook`, `ixa` → `chirp_guest`: a single 700 Hz triangle blip, 80 ms, pitched per
  character (vale 1.0, osei 1.12, rook 0.84, ixa 1.26 with a light ring mod).

## 3. Story

**Premise.** Year 2291. Out of the Tartarus Rift comes the Nyx Armada, a fleet that worships the end of
stars. Its warships tow captive black holes, "collapsars", and drop them on human stations and colonies.
The Armada's ruler, Hierarch Vael, wants one thing: to grow a black hole big enough to swallow the Sun and
seat his throne inside it. The carrier UNS Halcyon is the only warship left at the Vesta Line, carrying
two XF-9 Starlance prototypes. Commander Kade sends the Starlance out against the whole Armada, one strike
at a time: break the blockade at Vesta, cut a black hole's leash at Kerr Station, chase the fleet through
the Tantalus ion storm, burn the harvester draining the blue giant Tarsis, and finally fly through the rift
to the Armada's throne.

Side stories run alongside: people you pull out of escape pods ask for help, and each favor teaches the
Starlance a new skill.

### Briefings

Briefing screen layout is in section 18. Each briefing shows the title, location, 2-4 lines with portraits,
and the objectives. In co-op, the line marked "co-op" is added at the end.

**m1: FIRST LIGHT** · Vesta Shipyards, Asteroid Belt
- `anvil`: Nyx Armada jets are tearing up the Vesta yards. Halcyon launches in five.
- `socket`: Starlance is fueled and grumpy. Bring her back in one piece.
- `anvil`: Clear the lanes, pull out any crew you find, and kill whatever leads them.
- co-op `sparrow`: Gold Twin's warm too. {callsign2}, you're flying with us.
- Objectives: `m1_obj_boss` Destroy RAZORBACK · `m1_obj_rescue` Rescue 10 survivors · `m1_obj_vip` Recover the gold VIP pod

**m2: DEEP PULL** · Kerr Station, Jupiter Trojans
- `anvil`: They dragged a black hole to Kerr Station. It's eating the station alive.
- `sparrow`: Gravity bends everything near it. Your shots, their shots, you.
- `anvil`: A siege engine holds it on a leash. Cut the leash.
- Objectives: `m2_obj_boss` Destroy LODESTAR · `m2_obj_rescue` Rescue 12 survivors · `m2_obj_vip` Recover Dr. Osei's pod

**m3: STORMWALL** · Tantalus Nebula
- `anvil`: The Armada is running through the Tantalus ion storm. We follow it in.
- `socket`: Ion clouds jam your cannons. Stay out of them if you can.
- `sparrow`: There's a prison convoy in there. Our people. Let's get them.
- Objectives: `m3_obj_boss` Destroy TEMPEST · `m3_obj_rescue` Rescue 14 survivors · `m3_obj_vip` Free the convoy's VIP

**m4: SUNEATER** · Blue giant Tarsis
- `anvil`: The Nyx are draining a blue giant to feed their black hole forge.
- `socket`: Solar flares will cook you. Hide in the shadow of anything big.
- `anvil`: Burn the harvester, {callsign}. Then we knock on their door.
- Objectives: `m4_obj_boss` Destroy SUNEATER · `m4_obj_rescue` Rescue 14 survivors · `m4_obj_vip` Catch the Nyx defector's pod

**m5: NIGHTFALL** · Tartarus Rift
- `anvil`: This is it. Their flagship sits between two black holes past the rift.
- `vael`: Come then, little light. Every star ends in my hand.
- `sparrow`: Wings level, {callsign}. We fly home after this one.
- Objectives: `m5_obj_boss` Destroy OUROBOROS · `m5_obj_rescue` Rescue 16 survivors · `m5_obj_lives` Lose no lives

**s1: COLD HARBOR** · Callisto ice docks
- `vale`: Cold Harbor's last liner is launching. Nyx hunters are already on it.
- `anvil`: Escort the Long Night to orbit. Dockmaster Vale has the comms.
- `vale`: Twelve hundred people aboard. Please hurry.
- Objectives: `s1_obj_liner` Get the Long Night to orbit · `s1_obj_boss` Destroy HAILSTORM · `s1_obj_rescue` Rescue 8 survivors

**s2: LAGRANGE DEEP** · Lagrange Deep Station, edge of Kerr's Eye
- `osei`: My station is falling into Kerr's Eye. My crew and my core are still aboard.
- `anvil`: We go in, we take what we can, we get out.
- `osei`: Mind the horizon. Past that line, nothing comes back. Not even light.
- Objectives: `s2_obj_boss` Destroy TETHER · `s2_obj_rescue` Rescue 10 survivors · `s2_obj_choice` Decide the station's fate

**s3: ROOK'S GAMBIT** · The Boneyard, Tantalus Nebula
- `rook`: Mantis shot down my whole squadron. He hunts the Boneyard. I know his habits.
- `anvil`: One sortie, Captain. You fly {callsign}'s wing and you follow orders.
- `rook`: One's all I need.
- Objectives: `s3_obj_boss` Shoot down MANTIS · `s3_obj_rook` Keep Rook flying · `s3_obj_rescue` Rescue 6 survivors

**s4: SEED OF NIGHT** · Collapsar Foundry, Tartarus approach
- `ixa`: The foundry grows black holes from seeds. One seed is nearly ripe.
- `anvil`: Ixa's codes get you inside. What happens to the seed is your call.
- `ixa`: Fly fast. The foundry wakes when it smells you.
- Objectives: `s4_obj_boss` Destroy CRUCIBLE · `s4_obj_rescue` Free 8 captives · `s4_obj_choice` Decide the seed's fate

### Ending and epilogue

After OUROBOROS dies (m5 `afterBoss` radio, then the `ending` screen):
- `anvil`: Rift is closing. The Armada is broken. Bring it home, {callsign}.
- `sparrow`: Look at that. Real stars again.
- `socket`: Nothing on her I can't fix. Okay. A lot I can fix.

Ending screen text (typed line by line):
1. The Tartarus Rift closed at 06:12 ship time.
2. {rescued} people came home because you flew low and slow when it counted.
3. The Halcyon turned for Earth. The Starlance went back to the hangar, and Socket went back to work.
4. Variant, `save.choices.s4` last pick `steal_seed`: In Hold 3, a seed of night sleeps in a cage Dr. Osei built. Nobody talks about it.
   Variant `detonate_seed`: Where the foundry burned there is a new nebula. Ixa named it Mercy.
   Variant (s4 never played): Somewhere past the rift, the foundry still hums. For now.
5. Final card: THE END · Ace difficulty and Veteran Wing are now available.

`{rescued}` is `save.rescuedTotal`.
