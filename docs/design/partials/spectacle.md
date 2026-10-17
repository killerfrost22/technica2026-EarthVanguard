# STARLANCE: Game Design Document (spectacle draft)

Design lens: spectacle and presentation. Every number here is tuned for Pilot difficulty unless a line says
otherwise; the ARCHITECTURE difficulty table scales it. All art is Canvas 2D plus WebGL post; all audio is
WebAudio synthesis. Ids are lowercase snake_case and are collected in section 20.

## 1. Pitch and tone

**Pitch.** STARLANCE is a vertical-scrolling space shooter for the browser. You fly the XF-9 Starlance, the
last prototype fighter aboard the carrier CSV Halcyon, against the Umbra Armada: a black-hulled fleet that
has learned to make black holes. Five missions carry you from the ice rings of Thessaly, through a living ion
storm, past a man-made black hole and a red giant shipyard, into the Maw, the supermassive black hole where
the fortress Nullcrown waits to swallow the colony world Meridian. You shoot lasers that stack from two lines
to five, pull stranded people out of the void, hear your crew in your ear, and finish every level against a
boss that fills the screen and breaks apart in stages. Between missions you spend credits in the hangar and
fly side stories where one radio choice decides which skill your jet learns.

**Tone.** Bright Saturday-morning space opera with real stakes. Heroic, fast, a little cocky. The crew jokes;
the enemy never does. Story stays light: a 2 to 4 line briefing, then radio lines short enough to read
while dodging. Every mission has one image the player will remember.

**Why it feels like Lightning Fighter.**
- Portrait 9:16 playfield, auto-fire on, relative drag control on touch: the jet moves by your finger's
  delta, never jumps under it.
- Rendered-looking jets: glossy white and steel hulls with a specular band, cyan emissive trim, blazing
  engine plumes, banking up to 0.35 rad.
- Visible power growth: the laser stream fattens from 2 lines (L1) to 5 lines (L5); spread fans to 9 rays;
  the lance beam widens from 10 px to 30 px and crackles.
- Painted space: huge planets and stars filling a third of the screen, layered parallax, nebula clouds.
- Gold credit crystals that rain toward the jet after big kills, and a hangar between missions.
- Huge bosses with breakable parts, phase changes you can see, and 3 second slow-motion deaths.

**Our twists.** Black holes that bend your jet, your lasers and enemy fire; escape pods to rescue mid-battle;
a crew that talks to you; side-story choices that pick your skills; same-screen 2-player co-op.

**Signature moments (one per mission, each the screenshot for its star-map card).**
- m1: the catapult launch off Halcyon's deck, then the sun cresting Thessaly's limb as the boss dies.
- m2: lightning lighting a cloud canyon from the inside; the storm's eye opening to stars for the boss.
- m3: your lasers curving around a black hole to hit the fighter hiding behind it.
- m4: sunshade panels sliding open and blades of starlight sweeping the screen while you hide in shadow.
- m5: a wormhole jump into the Maw, then the final boss collapsing into a black hole you must break.

## 2. Characters

The player is silent; the radio speaks to `{callsign}` (default `LANCE`) and, in co-op, `{callsign2}`
(default `NOVA`, see section 12). Portraits are drawn into a 96x96 logical canvas by
`portrait(ctx, w, h, t, talking)`: a rounded plate (radius 10) with a soft vertical gradient, a 1 px top
highlight, faint scanlines (every 3 px, alpha 0.06) and the character's accent stripe on the left edge
(4 px). Faces are built from ellipses and bezier paths, lit from the upper left (`SL.art.lightDir`), with a
rim light in the accent color on the right edge. When `talking` is true the mouth (or visor light) animates
with `0.5 + 0.5*sin(t*22)` gated by a 7 Hz random hold, and a headset LED blinks.

| id | name | callsign / radio tag | role | accent |
|---|---|---|---|---|
| `vance` | Commander Iris Vance | HALCYON ACTUAL (tag ACTUAL) | Commander of CSV Halcyon; mission control | `#3fc8ff` |
| `juno` | Lt. Juno Reyes | KESTREL | Wingmate; flies the XF-7 Kestrel escort jet | `#ff9f43` |
| `okoro` | Chief Dez Okoro | WRENCH | Hangar chief and mechanic | `#ffcf3f` |
| `vey` | Archon Sable Vey | tag UMBRA | Supreme commander of the Umbra Armada | `#ff2f6d` |
| `hale` | Foreman Bram Hale | tag RING NINE | Miners' foreman, Thessaly Rings (VIP, m1) | `#f2c230` |
| `mercer` | Ash Mercer | GHOST | Ex-Black Halo ace, Umbra defector (VIP, m2) | `#d0d6e0` |
| `imani` | Dr. Lena Imani | tag TANTALUS | Gravity physicist who built the Collapsar (VIP, m3) | `#a58bff` |
| `mako` | Lt. Rin Mako | MAKO | Concord recon pilot who found the Lens Gate (VIP, m4) | `#5dffb0` |

**`vance`: Commander Iris Vance.** Radio personality: calm, clipped, dry; never shouts, even when the ship
is burning. Says "Copy" and "Good" and means a lot by both. Portrait: plate `#0e1a2e` to `#08101e`; oval head
54x66 px, skin `#8a5a3c` with a lighter cheek plane `#a46e4c`; short swept silver hair `#c9d1db` covering the
top third with a side part and two specular strands; thin almond eyes with a steady brow line; firm jaw;
headset arc `#2b3446` with a boom mic to the mouth whose LED `#3fc8ff` blinks while talking; navy collar
`#1a2a48` with 3 gold rank pips `#e6c35c`. Chirp: two sine tones 1320 Hz then 990 Hz, 60 ms each, bandpass
1.8 kHz Q 2, -14 dB.

**`juno`: Lt. Juno Reyes, KESTREL.** Radio personality: cocky, warm, quick jokes, keeps a kill count against
you, drops the act the moment someone is in danger. Portrait: plate `#2a1a12` to `#150c08`; white flight
helmet dome (circle 72 px, `#eef2f7` with a specular arc) with an orange racing stripe `#ff9f43` down the
center; visor raised above the brow as an amber band `#ffb347` at 45% alpha with a moving glint; face tan
`#c68a5e`, 6 freckle dots `#8a5534`, a curved grin showing a 2 px tooth line; dark curls `#2a1a12` peeking at
the temples. Talking widens the grin and sweeps the visor glint. Chirp: square wave double blip 660 Hz then
990 Hz, 40 ms each, lowpass 3 kHz.

**`okoro`: Chief Dez Okoro, WRENCH.** Radio personality: gruff, fatherly, talks about the jet like a living
animal ("my bird"), uses engine metaphors and terrible puns. Portrait: plate `#1e1e1e` with a yellow-black
hazard stripe triangle in the lower right corner; bald head `#5a3a28` with a big specular dome highlight;
thick grey beard `#9a9a9a` (a bezier blob with 12 short hair strokes); welding goggles pushed up on the
forehead (two circles, lenses `#3fc8ff` at 60% with a white glint); orange coverall collar `#e0702a`; headset.
Talking drops the jaw 2 px and moves the beard. Chirp: lowpassed sawtooth at 180 Hz, three 25 ms clicks
25 ms apart.

**`vey`: Archon Sable Vey.** Radio personality: cold, theatrical, patient; short pronouncements; calls the
player "little light". Speaks only on hijacked channels, so every Vey line arrives with a burst of crimson
static. Portrait: plate `#0a0006` with a crimson fbm haze `#3a0010`; a tall black mirrored helm (pointed
oval 60x84 px, `#0c0c12` to `#2a2a36`, a sharp specular stripe) crowned with 5 swept fins; a vertical slit
visor 6x40 px glowing `#ff2f6d` with a pre-rendered glow; no face. Talking widens the slit to 10 px and pulses
the glow; 3 horizontal tear lines slide down the portrait. Chirp: reversed swell (pink noise plus 55 Hz sine,
300 ms, attack 280 ms, instant cut), bitcrushed to 6 bits.

**`hale`: Foreman Bram Hale.** Blunt, tough, grateful, calls everyone "kid". Portrait: plate `#2a2410`; yellow
hard-shell helmet `#f2c230` with a headlamp (white circle with glow); broad face `#d9a07a`; thick moustache
`#6b4a2a`; hi-vis collar with two silver reflective stripes. Chirp: two triangle beeps at 800 Hz, 70 ms.

**`mercer`: Ash Mercer, GHOST.** Terse, sardonic, haunted; respects skill, distrusts kindness. Portrait:
plate `#120c14`; black Umbra pilot helmet whose crimson halo ring has been scratched out (the ring arc
`#ff2f6d` broken by a 30-degree gap of grey scratches); visor up; pale face `#e6d2c8`; scar across the left
brow; short white hair. Chirp: 220 Hz sine through a 30 Hz ring modulator, 80 ms.

**`imani`: Dr. Lena Imani.** Fast-talking, brilliant, guilty, wry under pressure. Portrait: plate `#140f24`;
pale lab hood `#d9d6e8`; round glasses (two 16 px circles, violet reflection `#a58bff` with a diagonal
glint); dark brown skin `#6b4230`; four braids framing the face; a badge with a violet lens icon. Chirp:
rising triangle arpeggio C6, E6, G6, 30 ms per note.

**`mako`: Lt. Rin Mako, MAKO.** Excitable, nerdy, talks too fast, nervous laugh. Portrait: plate `#0c1e16`;
green-grey recon helmet `#4a5e52` with a tall whip antenna (blinking tip `#5dffb0`); green visor down at 55%
alpha with eyes visible through it; face `#e8c4a0`. Chirp: four rapid FM blips at 1.5 kHz, 20 ms each.

## 3. Story

**Premise.** Year 2291. The Halcyon Reach colonies live around a young yellow star. Out of the dark beyond the
Rim comes the Umbra Armada under Archon Sable Vey, carrying a weapon nobody believed possible: Collapsar
engines that make black holes. Vey's goal is the Nullcrown, a fortress built around a captive black hole,
which will fall on Meridian, home to nine million people, and "end the light". The Concord Fleet is scattered.
The carrier CSV Halcyon has one prototype left, the XF-9 Starlance. You fly it.

**Arc.** m1 is a rescue that turns into a revelation: the raiders' frigate fires tiny black holes. m2 follows
their signal into a storm. m3 finds the Collapsar Forge and the scientist forced to build it. m4 burns the
shipyard where Nullcrown's escorts are born. m5 is the last stand at the Maw. The side stories put faces on
the war: the miners, the defector, the scientist, the scout.

### 3.1 Main mission briefings

Briefing lines appear one at a time on the briefing screen with the speaker's portrait.

**m1: FIRST LIGHT** · Thessaly Rings
- `vance`: Umbra raiders hit the Thessaly ring mines an hour ago.
- `vance`: Miners are ejecting into open space. Clear the raiders. Pick up every pod you can.
- `okoro`: She's fresh off the rack, {callsign}. Bring my bird back in one piece.
- Objectives: Destroy the frigate HARROW. Bonus: rescue 20 miners.

**m2: ION TIDE** · Vesper Nebula
- `vance`: The raiders fled into the Vesper Nebula. Something in there is calling them.
- `juno`: Vesper is a lightning storm the size of a solar system. I love it already.
- `vance`: Find the Umbra relay and silence it. Stay out of the strike zones.
- Objectives: Destroy the storm carrier TEMPEST. Bonus: rescue 20 survivors.

**m3: GRAVITY WELL** · Charon Deep
- `vance`: The relay pointed here. Umbra built a black hole. On purpose.
- `okoro`: Gravity drags you, your shots and your pickups. Fly against it, never with it.
- `vance`: Destroy the Collapsar Forge before it makes another one.
- Objectives: Destroy the COLLAPSAR forge. Bonus: rescue 20 prisoners.

**m4: SUNBREAK** · Pyre Forge
- `vance`: Umbra's shipyard rings the red giant Pyre. They're finishing something huge.
- `juno`: When the sunshades open, the flares cook anything in the light. Hug the shadows.
- `vance`: Burn the Forge. That dreadnought does not leave dock.
- Objectives: Destroy the dreadnought SOLARCH. Bonus: rescue 20 workers.

**m5: EVENT HORIZON** · The Maw
- `vance`: Nullcrown is real. A fortress with a black hole for a heart, falling toward Meridian.
- `vey`: Turn back, little light. Everything ends in the Maw.
- `vance`: The whole fleet flies with you, {callsign}. Break the crown.
- Objectives: Destroy NULLCROWN. Bonus: rescue 20 survivors.

### 3.2 Side story briefings

**s1: RING NINE** · Thessaly outer ring
- `hale`: Ring Nine habitat is adrift with sixty of my people inside. Umbra tugs are hauling us off.
- `okoro`: That habitat carries two half-built prototypes: a shield emitter and a phase drive.
- `vance`: Get them home, {callsign}. How is your call.
- Objectives: Free the habitat from the tow cables. Defeat the tow-ship GRAPPLER.

**s2: GHOST WING** · The Hollow, Vesper Nebula
- `mercer`: I flew with the Black Halos. Now they want me dead. Fair enough.
- `mercer`: Their depot is inside a hollow rock in the storm. I know the way in.
- `vance`: He's Umbra, {callsign}. Watch your six. And his.
- Objectives: Reach the Hollow depot. Defeat HALO ONE.

**s3: SMALL GODS** · Tantalus Lab, Charon Deep
- `imani`: I built the Collapsar. They made me. Now my lab is falling into Charon.
- `imani`: The singularity seed is still aboard. So are twelve of my people.
- `okoro`: Get in, get out, and do not get stretched into spaghetti.
- Objectives: Reach Tantalus Lab. Defeat the SEEDKEEPER.

**s4: THROUGH THE LENS** · The Lens Gate
- `mako`: I found a wormhole Umbra uses as a back door. It opens right next to the Maw.
- `mako`: Plant a beacon inside and the whole fleet can jump in behind you.
- `juno`: A tunnel through space-time. What could possibly go wrong?
- Objectives: Plant the jump beacon. Defeat the LENS WRAITH.

### 3.3 Ending and epilogue

Shown on the `ending` screen after m5, one line every 2.4 s over `bg_meridian` phase `ending` (Meridian's
dawn), music `ending_theme`.

- `vance`: All wings, this is Halcyon Actual. The Maw is quiet. Nullcrown is gone.
- `juno`: Did we just punch a black hole? Tell me we just punched a black hole.
- `okoro`: Bring her in slow, {callsign}. You've earned the good coffee.
- `vance`: Meridian is watching the sunrise tonight. Because of you.
- Card: THE LIGHT HOLDS.

Epilogue cards follow, one per side story, chosen by `save.choices` (the most recent option for each side;
"not flown" cards are skipped):
- s1 `hold`: Ring Nine still flies, wrapped in the shield you held for them. Hale's crew mines again.
- s1 `jump`: Ring Nine phased home in one piece. Hale named the new mine shaft after your jet.
- s2 `trust`: Ash Mercer flies Concord colors now. Callsign GHOST, still terrible at small talk.
- s2 `alone`: Mercer vanished after the Hollow. Sometimes a black jet shadows the Halcyon, then leaves.
- s3 `contain`: Dr. Imani keeps a tamed singularity in a bottle. She says it's a lamp. It isn't.
- s3 `evacuate`: All twelve Tantalus scientists came home. Imani now builds gates, not weapons.
- s4 `slingshot`: Mako's slingshot route is in the flight manuals. It's called the Lance Turn.
- s4 `shadow`: Mako mapped the dark side of the Lens. Umbra will never find that back door again.

## 4. Main missions

### 4.0 Conventions

- Playfield 720x1280. Background layers list a parallax factor (multiplier of `SL.world.scroll.speed`).
  Background art keeps value under 40% and saturation under 45% anywhere inside the central 560 px column;
  bright features (planet limbs, suns, disks) live at the edges and corners or behind a vignette of 0.45.
- Timelines use this shorthand, one row per director event (`at` in director seconds):

| shorthand | director event |
|---|---|
| `F vee wisp*5 x360 {…}` | `{at, formation:'vee', enemy:'wisp', count:5, x:360, opts:{…}}` |
| `S razor x200 [y-40]` | `{at, spawn:'razor', x:200, y:-40}` (y defaults to -40) |
| `H ion_storm {…}` | `{at, hazard:'ion_storm', x, y, opts:{…}}` |
| `P 3 x200 miner [vip:s1]` | `{at, pod:{x:200, y:-30, people:3, kind:'miner', vip:'s1'}}` |
| `U weapon_spread x480` | `{at, pickup:'weapon_spread', x:480, y:-30}` |
| `R m1_launch` | `{at, radio:'m1_launch'}` |
| `B "TITLE" / "sub"` | `{at, banner:'TITLE', sub:'sub'}` |
| `M track` · `SC 90` · `BG phase` | `{at, music}` · `{at, scroll:90}` · `{at, bg:'phase'}` |
| `WC 12` · `CP` | `{at, waitClear:true, timeout:12}` · `{at, checkpoint:true}` |
| `BOSS id` · `C id` · `END` | `{at, boss}` · `{at, choice}` · `{at, end:true}` |
| `AB …` | the event carries `afterBoss:true` |

- Pods drift down at scroll speed plus 40 px/s with a 12 px sine bob. Formation opts are defined in 6.2.
- Boss phase radio lines (`*_boss_p2`, `*_boss_p3`) are fired by the boss's phase `enter(b)`.
- Rewards are paid by `SL.progress.applyMissionResult`: clear bonus credits plus rank bonus
  (S +50%, A +30%, B +15% of the clear bonus); SP only on first clear; +1 SP the first time a main mission
  is cleared with rank S.

### 4.1 m1: FIRST LIGHT

- **Location:** Thessaly Rings, a blue-teal gas giant with a wide ice ring system, home to the Ring Nine mines.
- **Look at a glance:** cold blue and cream, a planet limb filling the right third, rings cutting the screen
  diagonally; ends in a golden sunrise.
- **Palette:** space `#060a18`, `#0c1630`; planet bands `#123a4f`, `#1f5f78`, `#3f8ca3`, cream band `#9cc3c9`;
  atmosphere rim `#7fd0ff`; ring ice `#7f97b8`, ring dust `#3a4a66`; sunlight `#ffd9a0`, sun core `#fff4dc`;
  station fire `#d9773a` (soft, never bullet-sized); Concord deck lights `#3fc8ff`.
- **Background `bg_thessaly` layers:**
  1. `stars` (0.05/0.1/0.2): three pre-rendered 720x1280 star tiles (220, 140, 60 stars), the nearest layer
     twinkling 2 stars per second.
  2. `planet` (0.02): Thessaly, a 1500 px disc centered at (1020, 900) so its limb arcs through the right
     third. Texture: 512x512 `noiseCanvas` with latitude bands (`sin(y*0.045)` plus fbm warp, scale 3,
     4 octaves) mapped to the band colors; a cream storm vortex oval (90x40) in band 3; terminator shading
     darkens the lower right; a 12 px atmosphere rim `#7fd0ff` at 30%. Bands slide 4 px/s.
  3. `rings` (0.06): a 2600x360 ellipse band tilted -0.28 rad from lower left to upper right, drawn as 40
     concentric strokes whose alpha follows a radial fbm profile with two dark gaps; the planet's shadow
     cuts the far side.
  4. `debris` (0.5): 14 dark ring rocks (20 to 80 px, `#1a2233`, rim `#9fb7d9`, slow spin).
  5. `ice` (1.6): sparse 2x3 px additive ice streaks at alpha 0.25.
- **Set pieces and phases (`setPhase`):**
  - `launch` (0 s): Halcyon's flight deck fills the screen: grey plates `#2a3140`/`#39424f` with hazard
    stripes, two rows of `#3fc8ff` guide lights chasing toward the top, scroll 900 px/s with motion
    streaks; the carrier's island tower slides by on the left as a lit silhouette. At 1.0 s the catapult
    fires: plume flare, `chromatic(0.3)`, scene scale punch 1.04 to 1.0 over 0.4 s, deck slides off the bottom.
  - `rings` (3 s): the calm ring field.
  - `station` (38 s): Ring Nine mining station in the upper-left background: a 280 px wheel with 6 spokes
    and a central spindle, three soft fire glows (`#d9773a`, flicker 6 Hz) with fbm smoke plumes, tiny
    decorative evacuation beacons blinking green; scrolls past at 0.15 over 40 s.
  - `ring_cross` (78 s): the jet crosses the ring plane: `rings` scales 4x into a dense diagonal band of
    ice particles (300 motes, streaked by scroll), and dark ring shadows sweep across the screen at 0.3 Hz.
  - `shadow` (114 s): Thessaly's night side: the planet becomes a black disc with a thin blue rim, rings
    glow backlit `#bcd8ff` at 20%, background value drops 30%, stars brighten.
  - `sunrise` (boss): the sun crests the limb at the top-right corner: a 600 px radial glow, 12 slowly
    rotating god rays (thin additive triangles, alpha 0.08) and 4 hexagonal lens ghosts along the
    sun-to-center line (alpha 0.05). On boss death the rays brighten to 0.2 for 4 s: first light.
- **Music:** `m1_first_light` (stage), `m1_boss` (boss).
- **Hazards:** `asteroid_storm` light at 40 s (from the right, 16 s) and heavy at 78 s (from the left, 22 s);
  `black_hole` motes appear only in HARROW's phase 3, the first black holes of the game.
- **Enemy roster:** `wisp`, `dart`, `razor`, `mantis`, `snatcher`.
- **Wave script:**

```
0    M m1_first_light · BG launch · SC 900 · B "MISSION 1 · FIRST LIGHT" / "THESSALY RINGS"
0.5  R m1_launch
3    BG rings · SC 80
5    R m1_controls
6    F vee wisp*5 x360
9    F vee wisp*5 x200
10.5 F vee wisp*5 x520
14   F side_stream dart*6 {side:'left'}
17   U weapon_pulse x360
18   R m1_pickup
20   F pincer dart*8
24   P 2 x220 miner · R m1_pods
27   F stagger razor*3
30   P 3 x520 miner
32   F swarm wisp*10 x360
36   WC 12
37   CP
38   BG station · R m1_station
40   H asteroid_storm {density:'light', from:'right', duration:16}
42   R m1_rocks
44   F column wisp*6 x150
46   F column wisp*6 x570
48   S mantis x360
50   P 4 x420 miner
54   F crossfire dart*8
58   S snatcher x-40 y260 · P 3 x300 miner · R m1_snatcher
62   U weapon_spread x480
64   F vee razor*3 x360
68   P 1 x360 vip vip:s1 · R m1_vip
70   F escort mantis*1 x360 {guard:'wisp', guardCount:4}
75   WC 15
76   CP
78   BG ring_cross · SC 140 · H asteroid_storm {density:'heavy', from:'left', duration:22}
80   R m1_ringcross
82   F side_stream wisp*12 {side:'right'}
88   P 2 x160 miner · P 2 x560 miner
90   S mantis x200 · S mantis x520
96   F pincer dart*10
100  U missile x360
102  F arc_sweep razor*4
108  S snatcher x-40 y240 · S snatcher x760 y240 · P 5 x360 family
112  WC 15
114  BG shadow · SC 70 · R m1_shadow
116  F circle_in wisp*8 x360
120  F stagger razor*5
126  P 3 x250 miner
128  U bomb x360
130  F vee dart*7 x240
133  F vee dart*7 x480
138  WC 12
140  CP · R m1_boss_in
142  M m1_boss · BG sunrise
143  BOSS harrow
AB   R m1_win
```

- **Rescue pods:** 9 pods, 25 people; VIP pod at 68 s (`vip:'s1'`, Foreman Hale) unlocks s1.
- **Radio cues:**

| id | trigger | who | line |
|---|---|---|---|
| `m1_launch` | 0.5 s | vance | Halcyon to {callsign}. Catapult is hot. Go get them. |
| `m1_controls` | 5 s | okoro | Controls are live. She turns on a coin, so don't overthink it. |
| `m1_pickup` | 18 s | okoro | Weapon pod! Grab it. Same color stacks your lasers. |
| `m1_pods` | 24 s | vance | Escape pods ahead. Fly over them to pull the miners aboard. |
| `m1_station` | 38 s | hale | This is Ring Nine! We're breaking up! Anyone out there? |
| `m1_rocks` | 42 s | juno | Rocks from the right! Shoot the small ones, dodge the big ones. |
| `m1_snatcher` | 58 s | juno | That drone is towing a pod! Shoot it before it drags them off! |
| `m1_vip` | 68 s | vance | Priority pod. That's the Ring Nine foreman. Bring him in. |
| `m1_vip_saved` | VIP rescued | hale | You got me, kid. My crew's still out there. Find Ring Nine. |
| `m1_ringcross` | 80 s | juno | Crossing the ring plane. Hold onto something. |
| `m1_shadow` | 114 s | vance | Entering Thessaly's shadow. One big contact ahead. |
| `m1_boss_in` | 140 s | okoro | That's an ore-breaker frigate. They gutted the mine with it. |
| `m1_boss_p2` | boss phase 2 | juno | It's throwing asteroids now. Rude. |
| `m1_boss_p3` | boss phase 3 | vance | Energy spike. That's a black hole. They can make black holes. |
| `m1_win` | after boss | vance | Harrow is down. Good flying, {callsign}. Come home. |

- **Boss:** `harrow`. **Target duration:** 3:45 (143 s of waves, about 75 s of boss, 8 s intro and outro).
- **Rewards:** clear bonus 600 credits; 2 SP.

### 4.2 m2: ION TIDE

- **Location:** Vesper Nebula, a storm nebula where ionized gas throws lightning between cloud walls.
- **Look at a glance:** indigo and teal cloud canyons, lightning lighting clouds from the inside, then a
  calm round eye full of stars.
- **Palette:** base `#07061a`; nebula indigo `#1b1840`, storm teal `#123848`, plum shadow `#2a1438`, cloud
  rim `#4a5f8a`; lightning core `#dfeaff` with halo `#8fb4ff` (background only, large, at most 35% alpha);
  Umbra relay beacon `#ff2f6d` (tiny, far, slow blink).
- **Background `bg_vesper` layers:**
  1. `stars` (0.05): a dim star tile, 40% density, mostly hidden.
  2. `far_clouds` (0.15 and 0.22): two 720x1536 domain-warped fbm sheets (scale 2.2, 5 octaves, palette
     indigo to teal to plum, alpha curve 0.2 to 0.8). Lightning flashes inside them: a cached 400 px
     radial "cloud flash" sprite blitted additively at the strike point (alpha 0.5 decaying over 0.3 s)
     plus a branching bolt polyline (6 to 9 segments, 2 forks) at 35% alpha.
  3. `canyon` (0.6): cloud walls on both edges, 120 to 200 px wide, edge profile from 1D noise, body
     `#0d0b22` with lit rims `#4a5f8a`; the visible gap breathes between 720 and 520 px.
  4. `wisps` (1.4): thin foreground cloud streaks at alpha 0.12 to 0.2.
  - Props: `wreck_freighter` (a broken Concord freighter, 360x140, white hull plates with blue stripes,
    snapped in the middle, sparks and venting gas; pods launch from it at 25 to 54 s) and `ion_relay`
    (a 40x500 needle spire with three rotating rings and the red beacon, far background, 120 to 160 s).
- **Set pieces and phases:**
  - `calm` (0 s): soft clouds, distant thunder glows every 6 to 9 s.
  - `storm` (40 s): cloud flashes every 1.5 to 4 s, the canyon closes to 520 px, falling ion sparks
    (pale diagonal 1x6 streaks, background only).
  - `tide` (98 s): the Ion Tide: a 300 px tall curved wave of glowing blue-white gas (bright leading edge,
    churning fbm body) rolls from the top of the background to the bottom over 12 s; the scene tints blue
    (`desaturate(0.15)` plus a blue screen flash at 0.12); afterwards light veins crawl over the clouds
    (animated noise threshold lines) until 130 s.
  - `eye` (boss): clouds part into a 1100 px ring revealing stars; the eye wall spirals at 0.03 rad/s and
    lightning crawls along it every 2 s. TEMPEST enters through the wall.
- **Music:** `m2_ion_tide`, `m2_boss`.
- **Hazards:** `ion_storm` in `zones` mode from 40 s to 90 s (strike every 3.2 s), in `tide` mode from 98 s
  for 14 s (no shield recharge, strikes every 1.6 s), then zones again until the boss. TEMPEST drives its own
  strikes in phase 2 and 3.
- **Enemy roster:** `wisp`, `dart`, `razor`, `hornet`, `lancer`, `warden`, `stormcaller`, `mantis`,
  `bastion`, `snatcher`.
- **Wave script:**

```
0    M m2_ion_tide · BG calm · SC 70 · B "MISSION 2 · ION TIDE" / "VESPER NEBULA"
1    R m2_enter
4    F vee dart*5 x360
7    F side_stream wisp*10 {side:'left'}
10   F side_stream wisp*10 {side:'right'}
13   S hornet x120 · S hornet x600 · R m2_hornet
16   U weapon_pulse x360
18   F pincer dart*8
22   F stagger razor*4
25   P 3 x200 civilian · R m2_freighter
27   S lancer x360 · R m2_lancer
30   F vee wisp*7 x360
32   P 2 x520 civilian
34   F escort mantis*1 x360 {guard:'warden', guardCount:2} · R m2_warden
40   BG storm · H ion_storm {mode:'zones', duration:50, strikeEvery:3.2}
42   R m2_storm
44   F column dart*6 x140
46   F column dart*6 x580
50   S stormcaller x360 · R m2_stormcaller
54   P 4 x360 civilian
58   F swarm wisp*12 x360
60   S lancer x160 · S lancer x560
64   U weapon_lance x360 · R m2_lance
66   F crossfire razor*6
70   P 1 x300 vip vip:s2 · S snatcher x760 y220 · R m2_vip
74   F arc_sweep dart*8
78   S hornet x100 · S hornet x620 · S warden x360
82   WC 15
84   CP
86   S bastion x360 · R m2_bastion
92   F side_stream wisp*10 {side:'left'}
95   P 3 x560 civilian
98   BG tide · H ion_storm {mode:'tide', duration:14} · R m2_tide
100  F vee razor*5 x360
106  S stormcaller x200 · S stormcaller x520
110  P 2 x180 pilot · P 2 x540 civilian
112  U missile x360
114  F pincer dart*10
118  WC 15
120  CP · R m2_relay · H ion_storm {mode:'zones', duration:34, strikeEvery:3.6}
122  S lancer x120 · S lancer x360 (at 122.6) · S lancer x600 (at 123.2)
126  F circle_in wisp*10 x360
130  F escort bastion*1 x360 {guard:'warden', guardCount:2}
136  P 5 x360 family
138  F stagger razor*5
142  U bomb x260 · U shield x460
146  F vee dart*7 x240
148  F vee dart*7 x480
152  WC 14
154  CP · R m2_boss_in
156  M m2_boss · BG eye
157  BOSS tempest
AB   R m2_win
```

- **Rescue pods:** 9 pods, 22 people; VIP pod at 70 s (`vip:'s2'`, Ash Mercer) unlocks s2. A snatcher
  spawns with the VIP pod.
- **Radio cues:**

| id | trigger | who | line |
|---|---|---|---|
| `m2_enter` | 1 s | vance | Entering Vesper. Sensors are half blind in here. Trust your eyes. |
| `m2_hornet` | 13 s | juno | Missile boats! Their rockets turn. Shoot them down or out-turn them. |
| `m2_freighter` | 25 s | vance | A Concord freighter is breaking up. Survivors are in those pods. |
| `m2_lancer` | 27 s | okoro | Lancer charging a beam. When the line goes red, get out of it. |
| `m2_warden` | 34 s | juno | Shield drone on that gunship. Pop the drone first. |
| `m2_storm` | 42 s | okoro | Ion storm! A ring on the clouds means a strike. Don't be in the ring. |
| `m2_stormcaller` | 50 s | juno | That gunship pulls lightning toward itself. Kill it fast. |
| `m2_lance` | 64 s | okoro | Lance pod. One beam, cuts through everything in a line. |
| `m2_vip` | 70 s | mercer | Concord fighter, hold fire. I'm Umbra, and I'm done with them. |
| `m2_vip_saved` | VIP rescued | mercer | Name's Mercer. Get me to your commander. I have something she wants. |
| `m2_bastion` | 86 s | vance | Bastion heavy gunship. The front is armored. Hit it from the sides. |
| `m2_tide` | 98 s | juno | Ion tide incoming! Shields won't recharge in this. Fly clean! |
| `m2_relay` | 120 s | vance | The relay signal is coming from below the storm. Push through. |
| `m2_boss_in` | 154 s | juno | Something huge is in the clouds. I saw it in the lightning. |
| `m2_boss_p2` | boss phase 2 | okoro | It's charging those spires. Kill the spires, you get fewer strikes. |
| `m2_boss_p3` | boss phase 3 | vance | The core is open. Everything you have, {callsign}. Now. |
| `m2_win` | after boss | vance | Tempest is down and the relay is dark. We have its last coordinates. |

- **Boss:** `tempest`. **Target duration:** 4:10 (157 s of waves, about 85 s of boss, 8 s intro and outro).
- **Rewards:** clear bonus 750 credits; 2 SP.

### 4.3 m3: GRAVITY WELL

- **Location:** Charon Deep, the Umbra Collapsar test site, in orbit of Charon, a black hole made on purpose.
- **Look at a glance:** black with a burning orange halo arching over the top of the screen; stars bent into
  arcs; everything drifts upward, toward the hole.
- **Palette:** void `#030208`; dust lanes `#1a0f22`, `#2a1838`; accretion disk `#ffb46b`, `#ff7a3d`, `#c2412a`;
  Doppler-bright side `#9fc8ff`; photon ring `#fff1d6`; Forge metal obsidian `#14141c`, brass trim `#8a6a3a`,
  Umbra seams `#ff2f6d`.
- **Background `bg_charon` layers:**
  1. `stars` (0.04): a lensed star tile, pre-rendered once: each star is drawn as a short tangential arc
     around Charon's center (360, -260) whose length grows as its distance to that center shrinks.
  2. `charon` (0.01): the background black hole. Shadow radius 300 at (360, -260), above the screen, so the
     player sees the bottom of the lensed disk curving over the top 22% of the screen like a burning halo,
     plus the near side of the disk as a band at y 80 to 200. Disk texture: a 1024x256 sprite of angular
     fbm (noise sampled with stretched angle, scale 6 by 1) graded white-gold inside to deep red outside,
     alpha capped at 0.55; Doppler beaming: left half x1.6 brightness tinted `#9fc8ff`, right half x0.5
     tinted red; the texture scrolls 0.05 rad/s; a 3 px photon ring `#fff1d6` hugs the shadow.
  3. `streams` (0.12): five infalling gas filaments, bezier ribbons from the lower corners toward Charon,
     additive `#c2412a` at alpha 0.1 to 0.2 with a dash texture flowing toward the hole.
  4. `wreckage` (0.45): broken Collapsar ring segments (obsidian arcs 100 to 300 px with brass trim and
     dead crimson lights blinking at 0.5 Hz), tumbling at 0.1 to 0.3 rad/s.
  5. `dust` (1.5): foreground motes drifting up against the scroll at 30 px/s: everything falls up here.
- **Set pieces and phases:**
  - `approach` (0 s): the disk is a thin far halo.
  - `deep` (60 s): the disk arc descends 60 px over 4 s and brightens 20%; time dilation: stars tint toward
    `#9fc8ff` and star parallax halves; the bus emits `gravityDeep` so audio lowpasses the music by 30%.
  - `tidal` (100 s): an Umbra cruiser silhouette (500x120, rim-lit orange) in the background is torn apart
    over 6 s: its sprite scales to y 6.0 and x 0.2 while brightening into a glowing streak that vanishes
    into the disk with a soft flash.
  - `forge` (boss): two girder towers on the edges with crimson lights and a faint violet containment hex
    grid in the background (line alpha 0.08).
  - `tantalus` and `collapse` belong to s3 (section 5).
- **Music:** `m3_gravity_well`, `m3_boss`.
- **Hazards:** `black_hole` `well` at 32 s (drifting left 15 px/s, 26 s) and at 104 s (stationary, 36 s);
  `black_hole` `mote` from every `sinker`; `mine_field` in orbit around the second well at 105 s.
- **Enemy roster:** `wisp`, `dart`, `razor`, `hornet`, `lancer`, `warden`, `mantis`, `sower`, `sinker`,
  `bastion`, `snatcher`. Formation paths inside a pull radius bend with the gravity (enemies use
  `applyGravity` at 50% strength), so even familiar waves fly new curves.
- **Wave script:**

```
0    M m3_gravity_well · BG approach · SC 60 · B "MISSION 3 · GRAVITY WELL" / "CHARON DEEP"
1    R m3_enter
4    F vee razor*3 x360
7    F side_stream wisp*10 {side:'right'}
10   F side_stream wisp*10 {side:'left'}
14   U weapon_pulse x360
16   F pincer dart*10
20   S sower x-60 y260 {dir:1} · R m3_sower
24   P 3 x500 civilian
27   F stagger razor*4
30   R m3_bh_warn
32   H black_hole x520 y420 {size:'well', life:26, drift:{x:-15, y:0}}
34   R m3_bh_tip
36   F arc_sweep dart*8
40   P 3 x200 civilian
44   F crossfire razor*6
48   S hornet x120 · S hornet x600
52   U weapon_lance x360
54   F circle_in wisp*10 x360
58   WC 14
60   CP · BG deep · R m3_deep
62   S sinker x360 · R m3_sinker
68   F side_stream dart*8 {side:'left'}
72   P 4 x360 civilian
74   F escort mantis*1 x360 {guard:'warden', guardCount:2}
80   S lancer x150 · S lancer x570
84   P 1 x420 vip vip:s3 · S snatcher x-40 y240 · R m3_vip
88   F swarm wisp*12 x360
92   U missile x360
96   WC 15
98   CP
100  BG tidal · R m3_tidal
104  H black_hole x360 y380 {size:'well', life:36}
105  H mine_field x360 y380 {count:12, orbit:{radius:210, speed:0.6}}
106  R m3_orbit
108  F circle_in dart*8 x360
114  S sower x780 y200 {dir:-1}
118  P 3 x180 civilian · P 3 x540 civilian
122  F vee razor*5 x360
126  S bastion x360
132  S sinker x520
136  U bomb x200 · U weapon_spread x520
140  F pincer dart*10
144  P 5 x360 family
146  WC 16
148  CP
150  F stagger razor*5
154  F column wisp*8 x160 · F column wisp*8 x560 · P 2 x360 pilot
158  U shield x360
160  WC 12
162  CP · R m3_boss_in
164  M m3_boss · BG forge
165  BOSS collapsar
AB   R m3_win
```

- **Rescue pods:** 8 pods, 24 people (prisoners of the test site); VIP pod at 84 s (`vip:'s3'`,
  Dr. Imani) unlocks s3. Pods inside a pull radius drift toward the hole and are lost at the horizon, so
  rescues here are races.
- **Radio cues:**

| id | trigger | who | line |
|---|---|---|---|
| `m3_enter` | 1 s | vance | Charon Deep. That glow up top is a black hole eating a star. |
| `m3_sower` | 20 s | juno | Minelayer crossing! Don't park next to the red blinkers. |
| `m3_bh_warn` | 30 s | okoro | Gravity spike forming ahead. Here comes one of their black holes. |
| `m3_bh_tip` | 34 s | okoro | Fight the pull. Your lasers bend around it too, so use that. |
| `m3_deep` | 60 s | vance | We're deep in the well. Time runs slow down here. Stay sharp. |
| `m3_sinker` | 62 s | juno | That heavy drops little black holes. I hate it so much. |
| `m3_vip` | 84 s | imani | This is Dr. Imani! I built their engine. Please, get me out! |
| `m3_vip_saved` | VIP rescued | imani | Thank you. My lab, Tantalus, is still out there. I can explain. |
| `m3_tidal` | 100 s | juno | That cruiser just got stretched into a noodle. Note to self. |
| `m3_orbit` | 106 s | vance | Mines are orbiting the well. Shoot one and they chain. |
| `m3_boss_in` | 162 s | vance | There's the Forge. It keeps a black hole on a leash. |
| `m3_boss_p2` | boss phase 2 | okoro | It let the black hole loose! Keep moving, don't get pinned! |
| `m3_boss_p3` | boss phase 3 | juno | The ring is breaking up. Hit the pieces before the hole eats us! |
| `m3_win` | after boss | vance | The Forge is gone. Its data points to a shipyard at Pyre. We go. |

- **Boss:** `collapsar`. **Target duration:** 4:30 (165 s of waves, about 95 s of boss, 8 s intro and outro).
- **Rewards:** clear bonus 900 credits; 3 SP.

### 4.4 m4: SUNBREAK

- **Location:** Pyre Forge, the Umbra shipyard built in an arc around the red giant Pyre, shaded from it by
  colossal louvered sunshades.
- **Look at a glance:** crimson and black; the star's boiling limb along the left edge; girders slicing past;
  sudden blades of light with crisp black shadows when the shades open.
- **Palette:** shade `#0c0606`, char `#160a08`, deep crimson `#3a0d0a`; star surface `#c2381e`, `#ff7a2a`,
  limb highlight `#ffb44a`, granulation dark `#5a1408`; girder steel `#1e1a1c` with rim light `#ff9a4a`;
  sunshade panels `#2a2224` with gold foil `#8a6a2a`; welding sparks `#fff1c4` (tiny, background only).
- **Background `bg_pyre` layers:**
  1. `stars` (0.03): a sparse, glare-washed star tile.
  2. `pyre` (0.01): the star, a 4000 px disc centered at (-1800, 640) so 120 to 200 px of surface curves
     along the left edge. Texture: two 512x512 granulation noise sheets (cellular-looking fbm, scale 8,
     warped) crossfading over 6 s to boil; limb darkening toward the edge; a bright chromosphere rim.
     Three prominences: thick additive bezier loops rising 150 to 300 px off the limb, width modulated by
     noise, each on an 8 s rise-and-fall cycle.
  3. `forge` (0.3): the shipyard: a vertical Dyson-arc girder spine on the right edge, half-built Umbra
     hulls (300 to 500 px silhouettes) in cradles rim-lit `#ff9a4a` from the left, gantry cranes,
     welding spark emitters, crimson nav lights blinking at 1 Hz.
  4. `girders` (1.3): a dark lattice beam (40 px thick, punched holes) crosses horizontally every 6 to 10 s.
  5. `sunshades` (0.2): louvered panels along the left; during a flare telegraph the slats in the flare
     band rotate open (parallelogram slats narrowing from 60 px to 8 px over 1.6 s) and light pours through.
- **Set pieces and phases:**
  - `shade` (0 s): dark yard; only rim lights and sparks.
  - `sunbreak` (each flare): the shades open over the flare band, the light blade sweeps, the shades close
    0.6 s after the burn. The hazard calls this phase and then `shade` again.
  - `drydock` (boss intro): a drydock cradle frames the top 400 px; its gantries tear away and tumble
    as SOLARCH rises out of it.
  - `corona` (boss phase 3): the star's limb swells to 1.3x and creeps 140 px inward; the scene tints red
    (`flash('#ff5a2a', 0.08)` held), with heat shimmer ripples (amplitude 2 px) at random points.
  - `cme` (boss death): a bright orange coronal mass ejection band rolls across the background from left
    to right over 2.5 s, harmless and huge.
- **Music:** `m4_sunbreak`, `m4_boss`.
- **Hazards:** `solar_flare` at 28, 50, 90, 110, 130 and 146 s (the last one is the giant flare);
  `mine_field` in the cradles at 74 s. Flares fire 2.0 s after their event time.
- **Enemy roster:** `wisp`, `dart`, `razor`, `hornet`, `lancer`, `warden`, `skiff`, `sower`, `bastion`,
  `brood`, `reaver`, `snatcher`. Big enemies (`bastion`, `brood`, `reaver`) cast flare shadows too: hiding
  behind a live enemy is a legal and fun trick.
- **Wave script:**

```
0    M m4_sunbreak · BG shade · SC 90 · B "MISSION 4 · SUNBREAK" / "PYRE FORGE"
1    R m4_enter
4    F vee razor*3 x360
6    F side_stream skiff*5 {side:'left'} · R m4_skiff
10   F side_stream skiff*5 {side:'right'}
14   U weapon_pulse x360
16   F pincer dart*10
20   S hornet x120 · S hornet x600
24   P 3 x200 civilian
26   R m4_flare_warn
28   H solar_flare {band:[420,900], struts:[{x:180,y:520,h:160},{x:420,y:700,h:160}]}
31   R m4_flare_tip
34   F crossfire razor*6
38   S brood x360 · R m4_brood
44   P 4 x520 civilian
46   F swarm wisp*12 x360
50   H solar_flare {band:[300,760], struts:3}
52   U weapon_spread x360
56   F stagger skiff*6
60   S reaver x-150 y300 {dir:1} · R m4_reaver
64   P 2 x360 pilot
66   F arc_sweep dart*8
70   WC 15
72   CP
74   H mine_field x360 y300 {count:14, area:[80,120,640,420], drift:40} · R m4_mines
78   F column wisp*8 x160
80   F column wisp*8 x560
82   S sower x780 y240 {dir:-1}
86   P 1 x300 vip vip:s4 · S snatcher x760 y260 · R m4_vip
90   H solar_flare {band:[560,1120], struts:3}
92   F vee razor*5 x360
96   S lancer x140 · S lancer x580
100  U missile x360
102  S bastion x360
106  P 3 x180 civilian · P 3 x540 civilian
110  H solar_flare {band:[200,720], struts:2}
112  F pincer skiff*8
116  WC 15
118  CP · R m4_core
120  S reaver x870 y260 {dir:-1}
124  F escort brood*1 x360 {guard:'warden', guardCount:2}
130  H solar_flare {band:[380,1000], struts:3}
132  F side_stream dart*10 {side:'left'}
136  P 5 x360 family
140  F stagger razor*5
144  U bomb x200 · U weapon_lance x520
146  H solar_flare {band:[250,1150], struts:4, burn:1.6} · R m4_bigflare
150  F circle_in wisp*10 x360
154  S hornet x100 · S hornet x620 · S warden x360
158  P 2 x360 pilot
160  F vee dart*7 x240
162  F vee dart*7 x480
166  WC 14
168  CP · R m4_boss_in
170  M m4_boss · BG drydock
171  BOSS solarch
AB   R m4_win
```

- **Rescue pods:** 8 pods, 23 people (captured yard workers and downed pilots); VIP pod at 86 s (`vip:'s4'`,
  Lt. Mako) unlocks s4. A flare costs a pod one of its three hit points unless it sits in shadow.
- **Radio cues:**

| id | trigger | who | line |
|---|---|---|---|
| `m4_enter` | 1 s | vance | Pyre Forge. The sun is behind those shades. Keep it that way. |
| `m4_skiff` | 6 s | juno | Sail skiffs! Their sun balls burst into embers. Give them room. |
| `m4_flare_warn` | 26 s | okoro | Shades opening on the left! Flare in two seconds! |
| `m4_flare_tip` | 31 s | okoro | Hide in the shadow behind a girder. Light means burn. |
| `m4_brood` | 38 s | vance | Brood carrier. It keeps launching drones until you kill it. |
| `m4_reaver` | 60 s | juno | Corvette crossing! Big guns, slow turrets. Get under it! |
| `m4_mines` | 74 s | vance | Mines in the cradles. Shoot one and the whole row goes up. |
| `m4_vip` | 86 s | mako | Recon pilot down! I've got data the fleet needs. Please hurry! |
| `m4_vip_saved` | VIP rescued | mako | Thanks! I found something big. A wormhole. Tell you at home. |
| `m4_core` | 118 s | vance | The dreadnought's core is online. It's about to launch. |
| `m4_bigflare` | 146 s | juno | Biggest flare yet! Find a shadow, any shadow! |
| `m4_boss_in` | 168 s | okoro | That's Solarch. Those wings are mirrors. It eats sunlight. |
| `m4_boss_p2` | boss phase 2 | juno | Mirror wings open! Watch the light lines, they turn into beams! |
| `m4_boss_p3` | boss phase 3 | vance | It's diving into the star to overcharge. Finish it first! |
| `m4_win` | after boss | vance | Solarch is falling into Pyre. Only Nullcrown is left. |

- **Boss:** `solarch`. **Target duration:** 4:40 (171 s of waves, about 100 s of boss, 8 s intro and outro).
- **Rewards:** clear bonus 1,050 credits; 3 SP.

### 4.5 m5: EVENT HORIZON

- **Location:** The Maw, a supermassive black hole at the edge of the Reach, where Nullcrown waits behind
  a ring of Umbra wormhole gates. The Concord Fleet fights its last battle in the background.
- **Look at a glance:** void black and cold violet-white; a giant black sun hanging over the top of the
  screen with a burning violet crescent beneath it; capital ships trading beams; then a wormhole jump into
  an even darker inner sanctum.
- **Palette:** void `#020107`, deep violet `#0d0820`; disk `#b9a8ff`, `#6f7bff`, hot inner `#f4eeff`; photon
  ring `#fff3d6`; Umbra citadel obsidian `#0e0c14` with crimson seams `#ff2f6d`; Concord fleet engines
  `#7fe3ff`; wormhole rims `#9fe8ff` with interiors `#2a3a6a`. (m3 burns orange; m5 is cold violet, so the
  two black-hole missions never look alike.)
- **Background `bg_maw` layers:**
  1. `stars` (0.03): an Einstein-ring star tile: stars near an invisible circle (radius 520 around the
     Maw center) are stretched tangentially and doubled into mirror images.
  2. `maw` (0.008): shadow radius 420 at (360, -120), so the bottom half of a black disc hangs over the top
     of the screen; under it the lensed lower arc of the disk (a 40 px crescent with a gaussian profile,
     violet-white, alpha 0.5, brighter on the left by Doppler beaming x1.5); a 2 px photon ring
     `#fff3d6`. The disk texture is the m3 angular-noise sprite recolored violet and spun faster (0.12 rad/s).
  3. `fleet` (0.06): background battle. Concord capital ships (white hull silhouettes 200 to 400 px,
     blue engine glows) and Umbra capital ships (black, crimson seams) trade soft beams (2 px lines at
     alpha 0.25, Concord `#7fe3ff`, Umbra `#ff5c8a`); beams passing near the Maw are drawn as curved
     beziers (lensed); tiny flash explosions every 0.5 to 1.5 s. Nothing here reads as a bullet: beams are
     long, thin, faint and behind a 0.45 vignette.
  4. `gates` (0.25): Umbra gate rings (300 px, obsidian with 12 crimson lights); active ones swirl inside
     (a rotating spiral of noise in `#2a3a6a`).
  5. `debris` (1.2): burning hull fragments with ember trails, and ice.
- **Set pieces and phases:**
  - `fleet` (0 s): the battle, with the Halcyon itself (a 600 px white carrier silhouette with a cyan
    flight-deck stripe) sliding past on the right at 10 to 30 s, its point-defense guns firing upward.
  - `gate` (60 s): the main gate grows to fill the background over 25 s, its interior spiral speeding up.
  - `jump` (88 s): the jump: `addRipple(360, 640, 900, 24, 120)`, `chromatic(1.0)`, a 0.5 s white flash;
    under the flash the background swaps to `inner`; for 1.5 s the stars become radial speed streaks;
    scroll spikes to 400 then settles at 70.
  - `inner` (90 s): inside the gate network, close to the Maw: shadow radius 560 at (360, -40), the crescent
    twice as bright, a second lensed arc above the shadow (the far side of the disk), stars sparse and
    doubled. Gravity rifts tear here.
  - `crown` (boss): NULLCROWN in front of the Maw; background value drops 20%.
  - `void` (boss phase 3): stars dim to 20%, the disk crescent fades to 0.2; only the photon ring and the
    boss's own black hole remain. The boss calls this phase.
  - `dawn` (after the boss): the void lifts over 4 s; stars return; the fleet's engine lights converge on
    the player in a slow V; a soft blue-white aurora ribbon sweeps across the top.
- **Music:** `m5_event_horizon`, `m5_boss`; NULLCROWN switches to `m5_final` in phase 3.
- **Hazards:** `wormhole` pairs at 20, 62, 63 and 138 s; `gravity_rift` at 96 and 124 s; `black_hole`
  motes from `sinker`; NULLCROWN spawns its own `black_hole` (`maw` size) in phase 3.
- **Enemy roster:** greatest hits plus the elites: `wisp`, `dart`, `razor`, `halo`, `hornet`, `lancer`,
  `warden`, `mantis`, `stormcaller`, `sinker`, `bastion`, `brood`, `reaver`. Formations with
  `{via:'wormhole'}` enter through the newest wormhole's A ring and exit from its B ring.
- **Wave script:**

```
0    M m5_event_horizon · BG fleet · SC 80 · B "MISSION 5 · EVENT HORIZON" / "THE MAW"
1    R m5_enter
4    F vee razor*5 x360
8    F side_stream dart*10 {side:'left'}
11   F side_stream dart*10 {side:'right'}
14   U weapon_pulse x360
16   S halo x200 · S halo x520 · R m5_halo
20   H wormhole {a:{x:160,y:300}, b:{x:560,y:820}, life:16} · R m5_wormhole
22   F swarm wisp*12 x160 {via:'wormhole'}
26   P 3 x520 pilot
28   F crossfire razor*6
32   S mantis x200 · S mantis x520
36   P 2 x200 pilot
38   S hornet x120 · S hornet x600
42   U weapon_spread x360
44   F arc_sweep dart*10
48   S sinker x360
52   F escort bastion*1 x360 {guard:'warden', guardCount:2}
56   P 4 x360 civilian
58   WC 15
60   CP · BG gate · R m5_gate
62   H wormhole {a:{x:360,y:220}, b:{x:120,y:900}, life:12}
63   H wormhole {a:{x:600,y:500}, b:{x:360,y:1000}, life:12}
64   F circle_in wisp*10 x360
68   S stormcaller x200 · S stormcaller x520
72   P 3 x360 civilian
76   S reaver x-150 y280 {dir:1}
80   F vee halo*3 x360
84   U missile x360
86   R m5_jump_warn
88   BG jump · SC 400 · B "GATE JUMP" / "ENTERING THE MAW"
90   BG inner · SC 70 · R m5_inner
94   F side_stream wisp*12 {side:'left'}
96   H gravity_rift {x1:60, y1:300, x2:660, y2:620, life:18} · R m5_rift
100  F stagger razor*6
104  S lancer x150 · S lancer x570
108  P 3 x200 pilot · P 3 x520 pilot
112  S brood x360
116  U bomb x200 · U weapon_lance x520
118  WC 15
120  CP · R m5_vey
124  H gravity_rift {x1:660, y1:240, x2:120, y2:700, life:16}
126  F pincer halo*4
130  S sinker x200 · S sinker x520
134  P 5 x360 family
138  H wormhole {a:{x:120,y:260}, b:{x:600,y:760}, life:14}
140  F swarm wisp*14 x360 {via:'wormhole'}
144  S bastion x360
148  F crossfire razor*6
152  P 2 x360 pilot
154  U shield x260 · U repair x460
156  WC 14
158  CP · R m5_boss_in
160  M m5_boss · BG crown
161  BOSS nullcrown
AB   BG dawn · R m5_win
```

- **Rescue pods:** 8 pods, 25 people (downed fleet pilots and liner survivors). No VIP pod: the people of
  the whole fleet are the stakes here. Pods in the `inner` phase drift toward rifts and wormholes.
- **Radio cues:**

| id | trigger | who | line |
|---|---|---|---|
| `m5_enter` | 1 s | vance | All wings, this is it. Halcyon is in the line with the fleet. |
| `m5_halo` | 16 s | juno | Black Halo aces. They dodge. Lead your shots, {callsign}. |
| `m5_wormhole` | 20 s | okoro | Wormhole pair! What goes in one ring comes out the other. Shots too. |
| `m5_gate` | 60 s | vance | The main gate leads inside the Maw. We go through. |
| `m5_jump_warn` | 86 s | okoro | Hold her steady. Gate jump in three, two... |
| `m5_inner` | 90 s | juno | We're inside. I can see the back of my own jet. Is that normal? |
| `m5_rift` | 96 s | vance | Gravity rift! It pulls toward the tear. Don't touch the light. |
| `m5_vey` | 120 s | vey | You fly well, little light. It changes nothing. |
| `m5_boss_in` | 158 s | vance | Nullcrown, dead ahead. This ends now, {callsign}. |
| `m5_boss_p2` | boss phase 2 | vey | You broke my crown. Now face the throne. |
| `m5_boss_p3` | boss phase 3 | vey | Then let the dark have us both. |
| `m5_boss_p3b` | phase 3 + 3 s | okoro | It's a black hole now! Hit the red crystal! Hit it now! |
| `m5_win` | after boss | vance | Nullcrown is gone. All wings, form on {callsign}. We're going home. |

- **Boss:** `nullcrown`. **Target duration:** 4:45 (161 s of waves, about 115 s of boss, 8 s intro and outro).
- **Rewards:** clear bonus 1,300 credits; 4 SP. First clear shows the `ending` screen.

## 5. Side stories

Shared rules:
- Side stories are `kind:'side'` missions, 2:20 to 2:40 long: about 100 s of waves, a radio choice near
  the middle, then a mini-boss of about 45 s. Music `side_theme` (s1 to s3) or `s4_lens` (s4); boss music
  `miniboss_theme`.
- Unlock: the VIP pod of the named main mission (`save.flags.unlock_sN`), or the fallback story progress
  rule. The fallback shows the star-map toast "Patrol recovered {VIP}. {TITLE} unlocked."
- The choice event pauses play (`SL.story.choice`). The dialog shows the prompt with the speaker's
  portrait, two option cards (the option copy, then the skill it awards in the branch color with a
  one-line effect), and the footer "Replay this story to choose the other path." Either player may
  choose in co-op.
- Branch rows below are tagged `[optionId]`, meaning `if:(s)=>s.flags.<choiceId>==='<optionId>'`.
- Completion grants the chosen signature skill (`save.skills.owned`), records the option in
  `save.choices`, pays the credits, and gives 1 SP on first clear. Replaying and picking the other option
  grants the other skill. Failing a side story grants nothing but 50% of its credits.
- Mission entities (owned by `18_missions.js`) are listed in each story and in section 20.

### 5.1 s1: RING NINE (Aegis branch)

- **Unlock:** rescue the VIP pod in m1 (Foreman Hale), or complete m2.
- **Premise:** The Ring Nine habitat drifts with sixty miners aboard. Three Umbra tugs have it on cables and
  are hauling it toward a prison barge. The habitat carries two half-built prototypes.
- **Background:** `bg_thessaly` phase `outer`: the outer ring band seen edge-on as a dim fog of ice
  (`#3a4a66` at 40%), Thessaly small and far at the top right, and the habitat in the playfield. Phase
  `phase_corridor` (jump option): the screen becomes a tunnel of shimmering cyan-white rings (ellipses
  720x160 at alpha 0.15, rushing down at 2x scroll) over a starfield streaked vertically.
- **Mission entities:** `habitat` (ally, hittable, HP 600, a 360x180 cylinder: white hull `#e6e9ee` with
  yellow industrial stripes `#f2c230`, two solar wings `#22324a` with cell grid lines, 18 warm window
  lights `#ffd9a0`, a slow 0.05 rad/s roll shown by sliding stripe offsets); `tow_anchor` (enemy, HP 300,
  armor 1.0, a clamp with a glowing crimson ring where the cable bites, three of them at the habitat's
  top); the tugs themselves are props at the top edge, connected by catenary cables (3 px dark lines with
  a crimson pulse traveling up them); `phase_gate` (jump option: a 120 px wide ring of cyan-white light;
  flying through gives 100 x multiplier score and 5 credits; missing one costs the habitat 8% hull).
- **Objectives:** Cut the 3 tow cables (anchors). Keep the habitat alive. Defeat GRAPPLER. If the anchors
  survive 50 s after the first one appears, or the habitat reaches 0, the mission fails ("RING NINE IS LOST").
- **Hazards:** `mine_field` (Umbra mined the ring), `asteroid_storm`.
- **Enemies:** `wisp`, `dart`, `razor`, `snatcher`, `mantis`, `sower`. **Mini-boss:** `grappler`.
- **The choice `c_s1_habitat`** (at 58 s, speaker `okoro`):
  - Prompt: "Habitat shields are failing and more tugs are coming. What's the call, {callsign}?"
  - `hold`: "Light the shield emitter. I'll hold them here." Awards `ae_bulwark` (BULWARK).
    After: the habitat stays at (360, 420) and raises a 220 px shield dome (a hex-tiled bubble, cyan
    `#7fe3ff` at 18% with bright edges where bullets hit); enemy bullets from outside stop at the dome; jets
    can fly inside to rest but the dome has 400 HP of its own and flickers below 30%. Waves attack from
    all sides, including from below. GRAPPLER fights to re-hook the habitat.
  - `jump`: "Fire the phase drive. I'll follow you through." Awards `ae_phase` (PHASE SHIFT).
    After: the habitat blinks ahead in a white flash; background `phase_corridor`, scroll 260; a phase
    gate appears every 4 s for 36 s at alternating x (160 to 560). The habitat is off-screen ahead, its hull
    shown as an objective bar. GRAPPLER pursues and the fight happens in the fast corridor.
- **Wave script:**

```
0    M side_theme · BG outer · SC 70 · B "SIDE STORY · RING NINE" / "THESSALY OUTER RING"
0    call: spawn habitat at (360,300) easing to (360,420); spawn 3 tow_anchor; tugs pull the habitat up 10 px/s
1    R s1_open
4    R s1_cables
6    F vee dart*5 x360
10   F side_stream wisp*10 {side:'left'}
14   S snatcher x-40 y500
16   P 2 x200 miner
18   F pincer dart*8
22   H mine_field x360 y200 {count:8, area:[60,80,660,360], drift:30}
26   F stagger razor*4
30   P 3 x520 miner
34   F crossfire dart*8
38   S mantis x360
44   F swarm wisp*10 x360
50   until: all tow_anchor destroyed, timeout 30 · then R s1_free
56   R s1_choice_lead
58   C c_s1_habitat
60   [hold] call: habitat raises its dome · R s1_hold_1
62   [hold] F circle_in wisp*10 x360
66   [hold] F side_stream dart*8 {side:'left'} · F side_stream dart*8 {side:'right'}
70   [hold] R s1_hold_2 · S sower x-60 y600 {dir:1}
74   [hold] F crossfire razor*6 {fromBottom:true}
80   [hold] S mantis x160 · S mantis x560
84   [hold] P 4 x360 family
88   [hold] H asteroid_storm {density:'light', from:'right', duration:14}
90   [hold] F pincer dart*10
96   [hold] U bomb x360
60   [jump] BG phase_corridor · SC 260 · call: habitat blinks ahead · R s1_jump_1
62   [jump] call: spawn phase_gate every 4 s, 9 gates
64   [jump] R s1_jump_2
66   [jump] F side_stream dart*8 {side:'left'}
70   [jump] F vee razor*4 x360
76   [jump] F swarm wisp*12 x360
82   [jump] S snatcher x-40 y300 · P 3 x300 miner
86   [jump] H asteroid_storm {density:'heavy', from:'left', duration:12}
90   [jump] F crossfire dart*8
96   [jump] U bomb x360
98   WC 12
100  CP · R s1_boss_in
102  M miniboss_theme
103  BOSS grappler
AB   [hold] R s1_win_hold
AB   [jump] R s1_win_jump
```

- **Radio:**

| id | trigger | who | line |
|---|---|---|---|
| `s1_open` | 1 s | hale | Kid! The tugs have us on three cables. Cut us loose! |
| `s1_cables` | 4 s | okoro | The anchors glow where they clamp on. Shoot the glow. |
| `s1_hab_hit` | habitat below 50% | hale | We're taking hits in here! Keep them off the hull! |
| `s1_free` | anchors destroyed | hale | Cables are off! We're free, but the shields are failing. |
| `s1_choice_lead` | 56 s | okoro | That shield emitter or the phase drive. One of them, right now. |
| `s1_hold_1` | hold, 60 s | hale | Shield's up! Duck inside the bubble if it gets too hot, kid. |
| `s1_hold_2` | hold, 70 s | vance | Raiders closing from every side. Hold the line. |
| `s1_jump_1` | jump, 60 s | okoro | Phase drive's firing! Stay in their wake or you'll lose them! |
| `s1_jump_2` | jump, 64 s | hale | Fly through the gates, kid! Every gate keeps us locked on! |
| `s1_boss_in` | 100 s | juno | Big tug inbound. It wants its prize back. |
| `s1_boss_p2` | boss phase 2 | hale | It's throwing claws! Don't let it hook you! |
| `s1_win_hold` | after boss, hold | hale | We're holding. Sixty souls, kid. I owe you sixty times. |
| `s1_win_jump` | after boss, jump | hale | We phased home in one piece. Never doing that again. Thank you. |

- **Rewards:** 450 credits; 1 SP (first clear); `ae_bulwark` (hold) or `ae_phase` (jump).

### 5.2 s2: GHOST WING (Vanguard branch)

- **Unlock:** rescue the VIP pod in m2 (Ash Mercer), or complete m3.
- **Premise:** Mercer leads the Starlance through the storm to the Black Halos' depot inside a hollow
  asteroid. Halfway in, Vey offers him a way home.
- **Background:** `bg_vesper` phase `storm`, then phase `hollow`: a cavern inside a hollowed asteroid.
  Rock walls on both edges (`#1c1420` to `#2e2230`, fbm-craggy edges 100 to 220 px wide) with glowing teal
  crystal veins `#2fa79a` at 50% that pulse slowly; stalactite spires hang from the walls; the storm's
  lightning flickers through cracks; Umbra depot lights (crimson strips) line the walls.
- **Mission entities:** `mercer_ally` (an ally jet: XR-0 Ghost, a black swept-wing fighter 60x70 with a
  scratched crimson ring on the canopy and white-violet engines; fires twin needles of light-blue player
  shots at 120 DPS; hittable, downed for 10 s at 0 HP, then returns); `fuel_tank` (6 depot tanks on the
  cavern walls, HP 250, a glossy grey cylinder with orange hazard bands; destroyed tanks explode in a
  140 px fireball dealing 400 damage to enemies).
- **Objectives:** Reach the Hollow. Destroy the depot fuel tanks (bonus). Defeat HALO ONE.
- **Hazards:** `ion_storm` (approach), `mine_field` (inside the Hollow).
- **Enemies:** `dart`, `wisp`, `razor`, `hornet`, `lancer`, `halo`, `warden`, `sower`.
  **Mini-boss:** `halo_one`.
- **The choice `c_s2_mercer`** (at 56 s, speaker `vance`):
  - Prompt: "Vey is offering Mercer a way home. Do you keep him on your wing?"
  - `trust`: "Stay on my wing, Ghost. We do this together." Awards `vg_starfall` (STARFALL).
    After: Mercer stays for the rest of the mission and the boss, draws a third of enemy aimed fire, and
    calls targets; HALO ONE fights alone because Mercer ties up its wingmen.
  - `alone`: "Go home, Ghost. I'll take the Hollow alone." Awards `vg_overdrive` (OVERDRIVE).
    After: Mercer peels away; Okoro removes the reactor limiter (both players get fireRateMul x1.25 and a
    faint white-gold shimmer on their shots for the rest of the mission); enemy density rises 30% (extra
    rows below) and HALO ONE brings two `halo` wingmen in its phase 2.
- **Wave script:**

```
0    M side_theme · BG storm · SC 80 · B "SIDE STORY · GHOST WING" / "THE HOLLOW, VESPER NEBULA"
0    call: spawn mercer_ally on P1's left wing
1    R s2_open
4    F vee dart*5 x360
8    H ion_storm {mode:'zones', duration:40, strikeEvery:2.8} · R s2_storm
10   F side_stream wisp*10 {side:'right'}
14   F stagger razor*4
18   S hornet x120 · S hornet x600
22   P 2 x360 pilot
26   F pincer dart*8
30   F side_stream wisp*10 {side:'left'}
34   S lancer x360
46   F pincer halo*3 {fromBottom:true} · R s2_ambush
50   R s2_vey_offer
54   R s2_choice_lead
56   C c_s2_mercer
58   [trust] R s2_trust_1
58   [alone] call: mercer_ally leaves; players fireRateMul x1.25 · R s2_alone_1
62   BG hollow · SC 60
62   [alone] R s2_alone_2
64   R s2_depot · call: spawn 6 fuel_tank on the walls
66   [trust] R s2_trust_2
68   F side_stream dart*8 {side:'left'}
72   H mine_field x360 y260 {count:10, area:[100,100,620,400], drift:20}
74   F crossfire razor*6
75   [alone] F crossfire razor*4
80   S sower x-60 y300 {dir:1} · S warden x360
84   P 3 x200 pilot · P 2 x520 civilian
88   F vee halo*3 x360
90   [alone] F vee halo*2 x200
94   U weapon_spread x360
96   WC 14
100  CP · [trust] R s2_boss_in_trust · [alone] R s2_boss_in_alone
102  M miniboss_theme
103  BOSS halo_one
AB   [trust] R s2_win_trust
AB   [alone] R s2_win_alone
```

- **Radio:**

| id | trigger | who | line |
|---|---|---|---|
| `s2_open` | 1 s | mercer | Stay low and stay close. The storm hides us. Mostly. |
| `s2_storm` | 8 s | mercer | Strikes ahead. Umbra pilots call this stretch the Gauntlet. |
| `s2_ambush` | 46 s | juno | Black Halos, behind us! They knew we were coming! |
| `s2_vey_offer` | 50 s | vey | Ash. Come home and all is forgiven. Bring me that jet. |
| `s2_choice_lead` | 54 s | vance | Mercer could take that deal, {callsign}. You're the one out there. |
| `s2_trust_1` | trust, 58 s | mercer | Nobody ever asked me to stay before. Let's hurt them. |
| `s2_trust_2` | trust, 66 s | mercer | Fuel tanks on the walls. Hit them, I'll draw the fire. |
| `s2_alone_1` | alone, 58 s | mercer | Your call. Good luck in there, Concord. You'll need it. |
| `s2_alone_2` | alone, 62 s | okoro | Limiter's off, {callsign}. She'll run hot. Make it count. |
| `s2_depot` | 64 s | vance | You're inside the Hollow. Burn the depot. |
| `s2_boss_in_trust` | trust, 100 s | mercer | Halo One. My old leader. He never misses. Neither do I. |
| `s2_boss_in_alone` | alone, 100 s | juno | That's Halo One. He's fast. You're faster. Probably. |
| `s2_boss_p2` | boss phase 2 | okoro | He's pulling every trick he has! Keep moving! |
| `s2_win_trust` | after boss, trust | mercer | Halo One is done. Take my Hornet racks. You earned them. |
| `s2_win_alone` | after boss, alone | vance | Depot destroyed. Okoro says your reactor wants to stay unlocked. |

- **Rewards:** 500 credits; 1 SP (first clear); `vg_starfall` (trust) or `vg_overdrive` (alone).

### 5.3 s3: SMALL GODS (Flux branch, actives)

- **Unlock:** rescue the VIP pod in m3 (Dr. Imani), or complete m4.
- **Premise:** Imani's lab, Tantalus, is sliding toward Charon. Its singularity seed is going critical and
  leaking tiny black holes. Twelve scientists are still aboard.
- **Background:** `bg_charon` phase `tantalus`: the lab station (a 500 px modular cross of white modules
  `#d9dde6` with violet light strips `#a58bff` and a central glass sphere holding the seed) sits in the
  upper background, tilting 0.02 rad/s toward Charon's halo. Phase `collapse` (evacuate option): modules
  break off one by one (each sprite rotates away, stretches and streaks into the disk), the glass sphere
  cracks with a violet flash, and the scroll speeds up.
- **Objectives:** Reach Tantalus. Protect the scientists. Defeat the SEEDKEEPER.
- **Hazards:** `black_hole` motes leaking from the seed; in `contain`, a permanent stable `black_hole`
  well; in `evacuate`, `wormhole` blink-gates that carry pods (`carryPods:true`) and an `asteroid_storm`
  with the `debris` skin (station panels instead of rocks).
- **Enemies:** `wisp`, `dart`, `razor`, `sinker`, `warden`, `lancer`, `snatcher`. **Mini-boss:** `seedkeeper`.
- **The choice `c_s3_seed`** (at 56 s, speaker `imani`):
  - Prompt: "I can tame the seed into a stable black hole, or open the blink-gate and run."
  - `contain`: "Tame it. I'll keep them off you." Awards `fx_singularity` (SINGULARITY).
    After: the seed becomes a stable `well` black hole fixed at (360, 360) until the end; waves orbit it,
    pods spawn near it (races), and the SEEDKEEPER fights in its pull, using it to curve its shots.
  - `evacuate`: "Open the gate. Get your people out." Awards `fx_blink` (BLINK).
    After: background `collapse`, scroll 200; three blink-gates open in sequence; pods are launched into
    gate A and pop out of gate B lower on the screen, where you must catch them; debris storms fall; the
    SEEDKEEPER pursues through the collapsing station.
- **Wave script:**

```
0    M side_theme · BG tantalus · SC 60 · B "SIDE STORY · SMALL GODS" / "TANTALUS LAB, CHARON DEEP"
1    R s3_open
4    F vee razor*3 x360
8    H black_hole x200 y300 {size:'mote', life:8} · R s3_motes
10   F side_stream wisp*10 {side:'right'}
14   H black_hole x540 y360 {size:'mote', life:8}
16   F pincer dart*8
20   S sinker x360
24   P 2 x480 civilian
28   F crossfire razor*6
32   H black_hole x360 y260 {size:'mote', life:8}
34   F swarm wisp*12 x360
40   S lancer x150 · S lancer x570
44   P 3 x240 civilian
48   WC 12
50   R s3_dock
54   R s3_choice_lead
56   C c_s3_seed
58   [contain] H black_hole x360 y360 {size:'well', life:0, stable:true} · R s3_contain_1
60   [contain] R s3_contain_2
62   [contain] F circle_in dart*10 x360
68   [contain] F side_stream wisp*12 {side:'left'}
72   [contain] S sinker x200 · S warden x520
78   [contain] F vee razor*5 x360
82   [contain] P 4 x360 civilian
86   [contain] F crossfire razor*6
92   [contain] U bomb x360
58   [evacuate] BG collapse · SC 200 · R s3_evac_1
60   [evacuate] H wormhole {a:{x:180,y:200}, b:{x:540,y:900}, life:14, carryPods:true} · P 3 x180 civilian
62   [evacuate] R s3_evac_2
64   [evacuate] F side_stream dart*8 {side:'right'}
70   [evacuate] H wormhole {a:{x:540,y:220}, b:{x:180,y:880}, life:14, carryPods:true} · P 3 x540 civilian
74   [evacuate] F swarm wisp*12 x360
78   [evacuate] H asteroid_storm {density:'light', from:'top', duration:14, skin:'debris'}
82   [evacuate] H wormhole {a:{x:360,y:200}, b:{x:360,y:960}, life:12, carryPods:true} · P 4 x360 civilian
86   [evacuate] F crossfire razor*6
92   [evacuate] U bomb x360
96   WC 12
100  CP · R s3_boss_in
102  M miniboss_theme
103  BOSS seedkeeper
AB   [contain] R s3_win_contain
AB   [evacuate] R s3_win_evac
```

`life:0` means the hazard lasts until the mission ends.

- **Radio:**

| id | trigger | who | line |
|---|---|---|---|
| `s3_open` | 1 s | imani | Tantalus is two minutes from the event horizon. Please hurry. |
| `s3_motes` | 8 s | okoro | The seed is leaking tiny black holes. Don't fly through one. |
| `s3_dock` | 50 s | imani | There! The lab ring. My people are in the core module. |
| `s3_choice_lead` | 54 s | imani | The seed is going critical. I need an answer now. |
| `s3_contain_1` | contain, 58 s | imani | Stabilizing! It holds the station still. It will pull at you too. |
| `s3_contain_2` | contain, 60 s | okoro | A tame black hole. Sure. Fight around it, not into it. |
| `s3_evac_1` | evacuate, 58 s | imani | Gates opening! Pods go in one ring and out the other. Catch them! |
| `s3_evac_2` | evacuate, 62 s | vance | The station is breaking up behind you. Keep moving, {callsign}. |
| `s3_boss_in` | 100 s | imani | The Seedkeeper! A containment drone. It wants the seed back. |
| `s3_boss_p2` | boss phase 2 | juno | It's throwing gravity shots! Same trick, bigger scale! |
| `s3_win_contain` | after boss, contain | imani | The seed is stable. I can teach your jet to make one. A small one. |
| `s3_win_evac` | after boss, evacuate | imani | All twelve of my people are safe. I'll build you a blink drive. |

- **Rewards:** 550 credits; 1 SP (first clear); `fx_singularity` (contain) or `fx_blink` (evacuate).

### 5.4 s4: THROUGH THE LENS (Flux branch, passives)

- **Unlock:** rescue the VIP pod in m4 (Lt. Mako), or complete m5. When flown after m5, briefing line 2
  becomes `mako`: "Umbra still holds the Lens. Plant a beacon and the fleet can seal it for good."
- **Premise:** Mako found the Lens Gate, a natural wormhole Umbra uses as a back door to the Maw. A jump
  beacon at its far mouth would let the whole fleet follow. Something cloaked guards it.
- **Background `bg_lens` (new):** a river of bent space-time seen from above.
  - Palette: base `#05040c`, deep `#2a2450`, left wall fringe `#7fe3ff`, right wall fringe `#ffb070`, lens
    rings `#d9d2ff`.
  - Layers: `streaks` (0.3): starlight stretched into vertical streaks (2x40 to 2x120 px) racing down;
    `walls` (0.8): wavy distortion walls on both edges (100 to 180 px, animated noise edge) with chromatic
    fringes, cyan inside on the left and amber inside on the right, at alpha 0.25 over a body of `#05040c`;
    `lens_rings` (1.0): every 3 s a 720x140 ellipse ring pulses down the tunnel at alpha 0.18; `motes` (1.6).
  - Phases: `entry` (0 s: a bright iris opens from the center and the jet dives through; a ripple),
    `tunnel` (4 s), `fork` (48 s: the river splits around a black teardrop island of folded space 300 px
    wide with a lensed rim), `dark` (shadow option: walls dim to 0.06, vignette 0.75, darkness overlay
    with 420 px light pools around each jet drawn in the background pass so bullets stay bright),
    `maw_glimpse` (92 s: the tunnel mouth opens ahead; the Maw's violet crescent appears small at the top).
- **Mission entities:** `wraith_shadow` (a background-layer lens shimmer in the Wraith's shape that passes
  at 20 s and 40 s), `sling_ring` (slingshot option: 6 rings on an orbit path around the well; flying
  through one gives 200 x multiplier score, 5 credits and a 1.5 s burst of +40% scroll speed),
  `jump_beacon` (a 90 px zone at (360, 760) drawn as a cyan ring that fills clockwise; it plants after
  4 s total of any jet inside).
- **Objectives:** Plant the jump beacon. Defeat the LENS WRAITH.
- **Hazards:** `wormhole`, `gravity_rift`; `black_hole` well (slingshot); cloaked `mine_field` (shadow).
- **Enemies:** `wisp`, `dart`, `razor`, `halo`, `lancer`, `sinker`, `warden`. **Mini-boss:** `lens_wraith`.
- **The choice `c_s4_route`** (at 52 s, speaker `mako`):
  - Prompt: "The tunnel forks. Left skims a black hole. Right runs through the dark side."
  - `slingshot`: "Left. We slingshot around the black hole." Awards `fx_slingshot` (SLINGSHOT).
    After: a `well` black hole sits at the inner bend (220, 420), scroll 200; sling rings trace an orbit
    path around it; a gravity rift cuts the exit. Fast, bright, dangerous.
  - `shadow`: "Right. We go dark and slip past them." Awards `fx_veil` (LENSING VEIL).
    After: background `dark`; enemies farther than 320 px from both jets draw at alpha 0.12 with a faint
    violet lens outline (the missions module sets `e.alpha` each frame); enemy bullets always draw at full
    brightness; mines are cloaked until within 160 px. Slow, tense, ambush-heavy.
- **Wave script:**

```
0    M s4_lens · BG entry · SC 120 · B "SIDE STORY · THROUGH THE LENS" / "THE LENS GATE"
1    R s4_open
4    BG tunnel
6    F vee razor*4 x360
10   H wormhole {a:{x:160,y:520}, b:{x:560,y:300}, life:14} · R s4_portals
12   F swarm wisp*12 x160 {via:'wormhole'}
16   F crossfire dart*8
20   call: wraith_shadow passes · R s4_wraith
22   F pincer halo*2
26   P 2 x360 pilot
30   H gravity_rift {x1:80, y1:420, x2:640, y2:600, life:14}
32   F stagger razor*5
38   S sinker x360
40   call: wraith_shadow passes
42   P 3 x200 civilian
46   WC 12
48   BG fork · R s4_fork_lead
52   C c_s4_route
54   [slingshot] H black_hole x220 y420 {size:'well', life:40} · SC 200 · R s4_sling_1
56   [slingshot] call: spawn 6 sling_ring · R s4_sling_2
60   [slingshot] F arc_sweep dart*10
66   [slingshot] F vee halo*3 x480
72   [slingshot] H gravity_rift {x1:400, y1:200, x2:700, y2:700, life:12}
74   [slingshot] F side_stream wisp*12 {side:'right'}
80   [slingshot] P 3 x520 pilot
84   [slingshot] F crossfire razor*6
54   [shadow] BG dark · call: session.flags.dark = true · R s4_shadow_1
56   [shadow] H mine_field x360 y300 {count:14, area:[60,100,660,500], drift:30, cloaked:true}
58   [shadow] R s4_shadow_2
60   [shadow] F stagger razor*6
66   [shadow] F pincer halo*4
72   [shadow] S lancer x200 · S lancer x520
76   [shadow] P 3 x360 pilot
80   [shadow] F swarm wisp*12 x360
84   [shadow] S sinker x360
90   WC 12
92   BG maw_glimpse · R s4_beacon · call: spawn jump_beacon
94   F circle_in wisp*10 x360
98   F vee razor*5 x360
100  until: jump_beacon planted, timeout 20
104  CP · R s4_boss_in
106  M miniboss_theme
107  BOSS lens_wraith
AB   [slingshot] R s4_win_sling
AB   [shadow] R s4_win_shadow
```

- **Radio:**

| id | trigger | who | line |
|---|---|---|---|
| `s4_open` | 1 s | mako | Welcome to the Lens! Don't stare at the walls. Seriously. |
| `s4_portals` | 10 s | okoro | Wormholes everywhere in here. Use them, they're shortcuts. |
| `s4_wraith` | 20 s | juno | Something big is shadowing us. I only see it when it bends light. |
| `s4_fork_lead` | 48 s | mako | Fork ahead! I need a heading! |
| `s4_sling_1` | slingshot, 54 s | mako | Left it is! Dive close to the hole and let the pull throw us! |
| `s4_sling_2` | slingshot, 56 s | okoro | Gravity is a free engine if you're brave. Be brave. |
| `s4_shadow_1` | shadow, 54 s | mako | Going dark. They can't see us. We can barely see them. |
| `s4_shadow_2` | shadow, 58 s | juno | Shapes in the dark. Shoot first, ask never. |
| `s4_beacon` | 92 s | mako | That's the mouth! Hold inside the ring while the beacon locks! |
| `s4_boss_in` | 104 s | juno | The shadow just turned around. Here it comes! |
| `s4_boss_p2` | boss phase 2 | mako | It's jumping through the portals! Watch where they open! |
| `s4_win_sling` | after boss, slingshot | mako | Beacon's live! I'm naming that turn after you, {callsign}. |
| `s4_win_shadow` | after boss, shadow | mako | Beacon's live and they never saw us. Best. Recon. Ever. |

- **Rewards:** 600 credits; 1 SP (first clear); `fx_slingshot` (slingshot) or `fx_veil` (shadow).

## 6. Enemy roster

Faction: **the Umbra Armada**. Every Umbra craft shares one recipe: hull `SL.pal.enemy.hull` `#1c1f2b`
with `hull2` `#3a3f55` plates through `SL.art.metal` (light from the upper left, specular band at 30%),
panel lines at 25%, crimson emissive seams `#ff2f6d` that pulse at 0.8 Hz, a glow `#ff5c8a` on eyes and
emitters, and orange-red engine plumes `#ff7a3d` via `SL.art.flame` pointing up (enemies face down).
Elites (`halo`) swap the plates for gloss black `#0b0b10` with a white specular stripe. Sizes are sprite
sizes in logical px; `r` is the body radius. All enemies get the 0.06 s white hit flash, bank up to
0.3 rad into turns and keep a 1 to 2 px idle bob. Speeds are px/s. Bullet speeds are before difficulty.

### 6.1 Types

**`wisp`: Wisp drone** (popcorn). 36x36, r 15. HP 24. Speed 260 along its formation path.
Look: a trefoil drone: a triangular body with three short curved prongs and a central lens eye (circle
r 7, `#ff5c8a`, white pupil highlight); one tiny engine dot at the back; spins at 1.5 rad/s.
Attack: 40% of wisps fire one `orb` aimed at 220 px/s, 0.8 to 2.4 s after entering. Score 100, credits
[1,2], drop 2%. First m1.

**`dart`: Dart interceptor** (popcorn). 44x52, r 18. HP 32. Speed 340.
Look: an arrowhead jet: long nose pointing down, forward-swept wings, a crimson canopy slit, twin engines
with 18 px plumes. Move: dives toward the nearest player's x, then at y 700 peels away in a banking curve
and exits the side. Attack: one 3-way `needle` fan (spread 0.25 rad) at 300 px/s when it passes y 420.
Score 150, credits [2,3], drop 3%. First m1.

**`razor`: Razor fighter** (fighter). 72x60, r 26. HP 80. Speed 220 entering.
Look: crescent wings swept back into blade tips with crimson edge lights, an armored central fuselage,
three engines. Move: enters to a hold height of y 200 to 360, strafes (amplitude 140 px, 0.25 Hz), leaves
upward after 9 s. Attack: `aimed` burst of 3 `orb` (spread 0.12 rad) at 260 px/s every 1.8 s, first
after 0.9 s. Score 300, credits [4,6], drop 6%. First m1.

**`hornet`: Hornet missile boat** (fighter). 64x72, r 26. HP 90. Speed 180.
Look: a stubby box hull with two side pods showing three missile tips each, a round cockpit dome, four
small engines. Move: slides in from a side to a hold point (y 160 to 300) and stays 8 s. Attack:
`homing_volley` of 2 `missile` every 3.2 s (200 px/s accelerating to 300, homing 1.6 rad/s for 1.5 s).
Score 350, credits [4,7], drop 7%. First m2.

**`lancer`: Lancer beam fighter** (fighter). 60x88, r 24. HP 100. Speed 200.
Look: a long thin jet with a forked nose whose two prongs hold a crimson crystal emitter. Move: flies to
y 220 to 300 and stops. Attack: `beam` straight down, width 26, telegraph 0.8 s (prongs glow, thin
warning line), active 1.0 s; leaves 1.2 s later; fires once more if still alive after 4 s.
Score 400, credits [5,8], drop 8%. First m2.

**`snatcher`: Snatcher tow drone** (special). 56x56, r 22. HP 70. Speed 240.
Look: a spider drone: round body, crimson eye, four jointed claw legs folded under, a tractor emitter.
Move: flies to the nearest pod; within 30 px it latches (claws close) and tows the pod up at 90 px/s inside
a pale red tractor cone; leaving the top with the pod loses it. Killing it frees the pod and shows
"+300 SAVED". Attack: when hit, 2 `rice` aimed at 200 px/s (0.6 s cooldown); with no pods around, a `ring`
of 6 `rice` every 3 s. Score 500 (+300 for a freed pod), credits [5,8], drop 10%. First m1.

**`warden`: Warden shield drone** (support). 48x48, r 20. HP 60. Speed 160.
Look: a hexagonal drone with six beveled facets and a violet-crimson core. It tethers (a 2 px crimson
line) to the nearest gunship or heavy within 300 px and wraps it in a hex bubble that sets its armor to 0.4
(60% less damage); it keeps 140 px from its ward. Attack: `ring` of 8 `orb` at 150 px/s every 4 s. On
death the bubble shatters into hex shards. Score 300, credits [3,5], drop 5%. First m2.

**`mantis`: Mantis gunship** (gunship). 120x110, r 46. HP 320. Speed 120.
Look: a wide hammer body with two spinning ring-gun turrets on the forward arms, a central crimson
reactor, armored plates, four engines. Move: enters to y 260, hovers 10 s while drifting sideways
40 px/s. Attack loop: `spiral` 2 arms of `rice` (6 shots/s per arm, spin 1.6 rad/s, 170 px/s) for 3 s,
pause 1.5 s, `fan` of 7 `orb` (arc 0.9 rad) aimed at 220 px/s. Score 1,200, credits [10,16], drop 20%.
First m1.

**`sower`: Sower minelayer** (gunship). 110x120, r 44. HP 280. Speed 90 horizontal.
Look: a bulbous hull with an open rear mine bay (stacked mines visible), side fins, belly lights.
Move: crosses the screen horizontally at y 200 to 320 (`dir` 1 or -1). Attack: drops a `mine` every 0.7 s
(details in 7.1). Score 1,000, credits [9,14], drop 18%. First m3.

**`stormcaller`: Stormcaller ion gunship** (gunship). 130x100, r 46. HP 360. Speed 110.
Look: a ring hull around a crackling ion orb (pale violet-white), three spikes with constant arcs
between them. Move: enters to y 240 and holds 12 s. Attack: `chain_arc` aimed (7 `arc`, spacing 22 px,
jitter 10 px) at 260 px/s every 2.6 s. While it lives, `ion_storm` strikes prefer points within 200 px
of it. Score 1,300, credits [10,16], drop 20%. First m2.

**`skiff`: Sun skiff** (fighter). 90x50, r 22. HP 70. Speed 250.
Look: a small cockpit pod under a wide curved solar sail (dark bronze `#4a2a14` membrane with glowing
amber veins `#ff9a4a`) that ripples. Move: glides in sine arcs (amplitude 120 px). Attack: one `flare`
aimed at 180 px/s every 2.2 s, splitting into 5 `ember` after 0.9 s. Score 350, credits [4,7], drop 7%.
First m4.

**`sinker`: Sinker gravity heavy** (heavy). 160x150, r 60. HP 900. Speed 70.
Look: four heavy claw arms around a spherical core bay holding a collapsar seed (a black sphere with a
violet ring and its own tiny lens). Move: enters to y 220 and holds 14 s. Attack: every 5 s it fires a
seed that travels 1 s and collapses into a `black_hole` mote (max 2 alive per sinker); `aimed` single
`grav_pearl` at 90 px/s every 3 s. Score 2,500, credits [18,28], drop 35%. First m3.

**`bastion`: Bastion armored gunship** (heavy). 180x170, r 70. HP 1,200 plus 3 front plates (300 each).
Speed 60. Look: a thick slab hull with three overlapping front armor plates, two side turrets, a central
furnace grille glowing orange. While a plate lives, shots hitting the front 120-degree arc deal x0.25.
Move: descends to y 260, strafes slowly. Attack: `wall_gap` of 14 `orb` with a 110 px gap (placed within
120 px of the nearest player) at 170 px/s every 3.0 s; side turrets alternate `fan` of 5 `orb_big` at
200 px/s every 2.4 s. Score 3,000, credits [20,32], drop 40%. First m2.

**`brood`: Brood carrier** (heavy). 220x200, r 84. HP 1,400. Speed 50.
Look: a fat ribbed carrier with a central glowing launch hatch and two side gun blisters. Move: enters to
y 200, holds until killed or 24 s. Attack: launches 2 `wisp` every 3 s (max 6 alive); blisters fire
`aimed` `needle` pairs at 320 px/s every 1.4 s. Score 3,500, credits [24,36], drop 45%. First m4.

**`reaver`: Reaver corvette** (heavy warship). 300x120, r 56 (plus 3 hit circles along the hull).
HP 1,500. Speed 50 horizontal. Look: a long armored hull lying sideways with three dorsal turrets, a
bridge tower, running lights and a long engine row on its trailing end. Move: crosses at y 200 to 320
(`dir`). Attack: each turret `stream`s `needle` (5/s for 1.2 s, aimed), staggered 0.5 s; every 4 s a
broadside `fan` of 9 `orb` (arc 1.2 rad) downward at 200 px/s. Score 4,000, credits [28,40], drop 50%.
First m4.

**`halo`: Black Halo ace** (elite fighter). 70x80, r 26. HP 160. Speed 380.
Look: a gloss-black forward-swept jet with a thin crimson halo ring floating above the cockpit (rotating
0.8 rad/s) and white-violet engine plumes. Move: enters (or rises from the bottom with `fromBottom`);
when a player shot line passes within 40 px of it, it dashes 90 px sideways (cooldown 1.2 s); after two
bursts it loops off-screen. Attack: `burst` of 5 `needle` (aimed, spread 0.3 rad) at 340 px/s every
1.6 s. Score 800, credits [8,12], drop 12%. First s2 (main story: m5).

### 6.2 Formations

| id | description |
|---|---|
| `vee` | A V of `count` (default 5) with 50 px spacing, leader at `x`, descending at 200 px/s with a slight weave. |
| `line` | A horizontal line of `count` at 70 px spacing that drops in together and sweeps down. |
| `column` | Single file at `x`, 60 px apart, snaking down (sine amplitude 60 px, 0.5 Hz). |
| `pincer` | Two halves enter from the top corners, curve toward the center and cross. |
| `arc_sweep` | One arc path from a top corner sweeping down and across, exiting the far side; spawn interval 0.3 s. |
| `circle_in` | Enemies spiral in to a 160 px ring around (`x`, 360), orbit 2 s, then dive at players one at a time. |
| `swarm` | A loose cloud of `count` with seeded jitter, descending and splitting around the nearest player. |
| `stagger` | Drop in one by one at evenly spaced x (0.4 s apart) and stop at different heights. |
| `side_stream` | A stream from `side` at y 200 to 400 moving across with a sine dip; spawn interval 0.25 s. |
| `escort` | A central `enemy` with `guardCount` guards of type `guard` holding a 90 px ring around it. |
| `crossfire` | Two diagonal lines entering from both sides and crossing the screen in an X. |

Shared formation opts: `side:'left'|'right'`, `fromBottom:true` (enter from y 1320 heading up, with a
0.8 s red chevron warning on the bottom edge), `guard`, `guardCount`, `via:'wormhole'`.
