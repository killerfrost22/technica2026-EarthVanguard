
### 5.3 s3: ROOK'S GAMBIT (Vanguard branch)

- **Unlock:** rescue Captain Vance's VIP pod in m3 (`save.flags.unlock_s3`). Story fallback: completing m4.
- **Premise:** The Nyx ace Mantis hunts the Boneyard, a field of dead warships in a calm pocket of the
  Tantalus Nebula. Rook flies a borrowed Kestrel (`ally_rook`) on your wing, looking for payback.
- **Objective:** shoot down MANTIS. Optional: keep Rook flying (`ally_rook` HP 600, hittable; at 0 HP he
  ejects a pilot pod you can collect for 100 credits, and `s3_obj_rook` fails).
- **Background:** `bg_tantalus` phase `boneyard` (derelict hulks 300-800 px long, broken and dark, slowly
  rotating; calm nebula; no lightning), then `boss`. **Hazard:** `mine_field`. **Enemies:** dart, wasp,
  spear, skimmer, hornet, needler, phantom. **Boss:** `mb_mantis`.
- **Target duration:** 2:30. **Rewards:** credit bonus 600; skill by option.

**The choice `s3_choice`** (at 47 s, speaker `rook`):
- Prompt: "Mantis is running for the mines. Chase him in, or let me rig the field for him?"
- Option `chase_mantis`: **CHASE HIM DOWN** · "Throttle up. He doesn't get away." Awards `skill_overdrive`.
  After it: scroll jumps to 220 (speed lines, background races), mines drift at 160 px/s instead of 45, and
  two spear packs come from behind (they spawn at y 1340 and dash upward; a "BEHIND YOU" arrow flashes on
  the bottom edge 1.0 s before each pack). Mantis makes two strafing passes ahead (invulnerable) firing
  needle streams.
- Option `rig_field`: **RIG THE FIELD** · "Set the trap. Make him come to us." Awards `skill_salvo`.
  After it: scroll drops to 30 (holding position). Rook tags the mines: every mine turns gold (`rigged`):
  rigged mines never hurt players, explode on enemy contact or when shot (blast r 140, 600 damage to
  enemies), and chain. Nyx waves pour into the field from the top and sides. Rook fires a 12-missile swarm
  every 10 s (ally missiles, 30 damage each), the trick Rook later teaches you.

```
  0.0  banner ROOK'S GAMBIT / The Boneyard + music side_theme + scroll 80 + bg boneyard
  0.5  call spawnAlly ally_rook {x 200, y 1050, hp 600}
  1.5  radio s3_open
  4.0  formation vee dart ×7 x 360
  7.0  hazard mine_field {count 14, duration 40, drift 45}
  8.0  radio s3_mines
 10.0  spawn skimmer {side left, y 320}
 13.0  formation arc_sweep dart ×8 {side right}
 16.0  spawn hornet x 360 {hoverY 230}
 19.0  pod crew people 2 x 520
 22.0  formation pincer dart ×10
 26.0  spawn skimmer {side right, y 420} + spawn wasp x 200 + spawn wasp x 520
 30.0  pickup weapon_up x 360
 34.0  formation staircase wasp ×5 {side left}
 38.0  waitClear timeout 10
 40.0  call mantis_flyby {path diag_lr} + radio s3_mantis
 44.0  radio s3_rook_mad
 47.0  choice s3_choice
 47.1  if chase_mantis: radio s3_chase + scroll 220 + call mines_speed 160
 47.1  if rig_field: radio s3_rig + scroll 30 + call rig_mines
 50.0  formation pincer dart ×12
 54.0  if chase_mantis: call behind_warning + formation column spear ×5 x 240 {from bottom}
 54.0  if rig_field: formation side_stream wasp ×6 {side left} + formation side_stream wasp ×6 {side right}
 58.0  pod civilian people 3 x 360
 60.0  if chase_mantis: call mantis_flyby {path diag_rl, fire needle_stream}
 62.0  spawn phantom x 200 + spawn phantom x 520
 66.0  if chase_mantis: call behind_warning + formation column spear ×5 x 480 {from bottom}
 66.0  if rig_field: formation rain dart ×14
 70.0  spawn needler x 160 {hoverY 220} + spawn needler x 560 {hoverY 220}
 72.0  pod civilian people 2 x 200 + pod crew people 1 x 520
 76.0  pickup weapon_up x 360
 80.0  formation arc_sweep dart ×10 {side left}
 84.0  waitClear timeout 12
 86.0  pickup repair x 360 + bg boss + scroll 70
 87.0  radio s3_boss_warn
 90.0  boss mb_mantis
 90.1  afterBoss if chase_mantis: radio s3_win_chase
 90.1  afterBoss if rig_field: radio s3_win_rig
```

| id | Trigger | Copy |
|---|---|---|
| `s3_open` | 1.5 s | [rook] Welcome to the Boneyard, kid. Every wreck out here was a friend of mine. |
| `s3_mines` | 8 s | [rook] Mines between the hulks. Shoot them early. They pop in rings. |
| `s3_mantis` | 40 s | [rook] There. Green-black wings, scythe nose. That's Mantis. Still flying pretty. |
| `s3_rook_mad` | 44 s | [anvil] Rook, hold formation. That is an order. |
| `s3_choice` | choice prompt | [rook] Mantis is running for the mines. Chase him in, or let me rig the field for him? |
| `s3_chase` | after `chase_mantis` | [rook] Ha! Full throttle! Watch your tail, his boys come up from behind. |
| `s3_rig` | after `rig_field` | [rook] Mines are mine now. Gold ones are friendly. Herd them into the gold. |
| `s3_boss_warn` | 87 s | [rook] He's turning to fight. Good. Stay on my wing and don't blink. |
| `s3_boss_intro` | `bossIntroDone` | [vael] MANTIS has eaten forty human pilots. Two more is nothing. |
| `s3_win_chase` | afterBoss, `chase_mantis` | [rook] You outflew him at full burn. Here's my secret: never let go of the throttle. |
| `s3_win_rig` | afterBoss, `rig_field` | [rook] Squadron's paid back. Let me show you how to fire a real missile swarm. |

### 5.4 s4: SEED OF NIGHT (Gravity branch, capstone)

- **Unlock:** rescue Ixa's VIP pod in m4 (`save.flags.unlock_s4`). Story fallback: completing m5 (it then
  plays as a post-game story).
- **Premise:** Ixa knows the way into the Collapsar Foundry, where the Armada grows black holes from seeds
  held in magnetic cages. The ripest seed is meant for the Ouroboros. Human captives work the foundry.
- **Objective:** breach the foundry, destroy CRUCIBLE, free 8 captives, decide the seed's fate.
- **Background:** `bg_tartarus` phase `foundry` (orange-violet forge glow `#3a1a2a` / `#ff8a5c` at alpha
  ≤ 0.3, scaffolds, seed cages as dim rings), then `boss`. **Hazards:** `black_hole` (two caged seeds,
  small, fixed at (160, 420) and (560, 640) for 40 s) and `wormhole`. **Enemies:** dart, wasp, warper,
  phantom, weaver, bastion, hive. **Boss:** `mb_crucible`.
- **Target duration:** 2:50. **Rewards:** credit bonus 650; skill by option.

**The choice `s4_choice`** (at 58 s, speaker `ixa`):
- Prompt: "The seed is waking. Detonate it here, or carry it out on your tractor beam?"
- Option `detonate_seed`: **DETONATE IT** · "Nobody gets a weapon like that." Awards `skill_time_dilation`.
  After it: the seed bursts into a time-distortion field. For the rest of the mission a "time wave" sweeps
  the screen every 12 s: the screen tints blue (`desaturate 0.3`), and enemies, enemy bullets and hazards
  run at 40% speed for 3 s while players move at full speed. The foundry starts collapsing: debris falls as
  `asteroid_storm {variant debris, density 0.6}` until the boss.
- Option `steal_seed`: **STEAL IT** · "Bag it. We'll turn it on them." Awards `skill_event_horizon`.
  After it: the seed (a tiny black hole, horizon r 10, lens strength 0.4) orbits the choosing player at
  60 px, 2 rad/s. It swallows enemy bullets that touch it (r 18) and pulls enemy bullets within 100 px
  toward itself (accel 260 px/s²), but it also tugs pickups and credits away from the player, and
  every hunter wave gets 30% more members as the foundry tries to take it back.

```
  0.0  banner SEED OF NIGHT / Collapsar Foundry + music side_theme + scroll 70 + bg foundry
  1.5  radio s4_open
  3.0  formation pincer dart ×12
  6.0  spawn warper x 200 + spawn warper x 520
  9.0  formation vee wasp ×5 x 360 {elite}
 12.0  hazard black_hole {size small, x 160, y 420, fixed, life 40} + hazard black_hole {size small, x 560, y 640, fixed, life 40}
 13.0  radio s4_cages
 16.0  formation ring_in gnat ×12 x 360
 20.0  pod captive people 2 x 360
 22.0  spawn weaver x 360 {hoverY 260, elite}
 26.0  formation side_stream dart ×10 {side left}
 28.0  hazard wormhole {a [200, 300], b [520, 940], life 18}
 30.0  pickup weapon_up x 360 + radio s4_wormhole
 34.0  spawn phantom x 200 + spawn phantom x 520
 38.0  pod captive people 2 x 200 + pod captive people 2 x 520
 42.0  spawn bastion x 360 {elite}
 48.0  formation rain dart ×14
 54.0  waitClear timeout 12
 56.0  radio s4_seed
 58.0  choice s4_choice
 58.1  if detonate_seed: radio s4_detonate + call time_waves {every 12, slow 0.4, length 3} + hazard asteroid_storm {variant debris, density 0.6, duration 44}
 58.1  if steal_seed: radio s4_steal + call attach_seed chooser
 62.0  formation pincer dart ×14
 66.0  spawn warper x 160 + spawn warper x 360 + spawn warper x 560
 70.0  pod captive people 3 x 360
 72.0  formation escort_box {leader hive, escort wasp, count 4} x 360
 78.0  if steal_seed: formation arc_sweep phantom ×4 {side left} + formation arc_sweep phantom ×4 {side right}
 80.0  pickup weapon_up x 360
 84.0  formation side_stream wasp ×6 {side right, elite}
 88.0  pod captive people 2 x 260
 90.0  spawn weaver x 200 + spawn weaver x 520
 96.0  waitClear timeout 14
 98.0  pickup repair x 360 + bg boss + scroll 30
 99.0  radio s4_boss_warn
102.0  boss mb_crucible
102.1  afterBoss if detonate_seed: radio s4_win_detonate
102.1  afterBoss if steal_seed: radio s4_win_steal
```

| id | Trigger | Copy |
|---|---|---|
| `s4_open` | 1.5 s | [ixa] We are inside. The foundry's guards know my codes are false now. Hurry. |
| `s4_cages` | 13 s | [ixa] Seed cages. Small holes, held in place. Do not fly close. They are always hungry. |
| `s4_wormhole` | 30 s | [ixa] Foundry gates fold space. Your shots can pass through them. So can theirs. |
| `s4_seed` | 56 s | [ixa] There. The ripe seed. In one day it would swallow a moon. |
| `s4_choice` | choice prompt | [ixa] The seed is waking. Detonate it here, or carry it out on your tractor beam? |
| `s4_detonate` | after `detonate_seed` | [ixa] Detonation! Time is folding. When the blue wave comes, they slow. You do not. |
| `s4_steal` | after `steal_seed` | [socket] You're towing a black hole. Of course you are. It eats bullets. Careful. |
| `s4_boss_warn` | 99 s | [ixa] CRUCIBLE wakes. It is the forge itself. It will not let us leave. |
| `s4_boss_intro` | `bossIntroDone` | [vael] Ixa. My little traitor. CRUCIBLE, make her a star again. |
| `s4_win_detonate` | afterBoss, `detonate_seed` | [ixa] The seed is gone. Time still ripples around your jet. Keep that gift. |
| `s4_win_steal` | afterBoss, `steal_seed` | [osei] A live seed in a cage I built. I can wire it to your jet. Don't tell Kade. |

## 6. Enemy roster

Nyx Armada style (all enemies): graphite hulls (`#1c1f2b` base, `#3a3f55` light) drawn with
`SL.art.metal`, pink-magenta seams (`#ff2f6d`) and glowing pink eye/canopy lights (`#ff5c8a`), orange
engines (`#ff7a3d`) with animated plumes, sharp insect-like silhouettes. They point down the screen.
Elites (`opts.elite`): HP ×1.6, enemy fire rate ×1.25, one extra bullet per volley, seams `#ffb0c8` with a
1 px gold rim, score ×1.5, credits ×1.5, drop chance +10 points. All damage numbers are Pilot.

| id | Name | Class | Size (px) | r | HP | Speed | Score | Credits | Drop | First |
|---|---|---|---|---|---|---|---|---|---|---|
| `gnat` | Gnat drone | popcorn | 34 × 30 | 14 | 22 | 240 | 50 | [1,1] | 1% | m1 |
| `dart` | Dart interceptor | popcorn | 44 × 48 | 18 | 32 | 300 | 80 | [1,2] | 2% | m1 |
| `wasp` | Wasp fighter | fighter | 64 × 60 | 26 | 75 | 220 / 120 | 200 | [2,4] | 6% | m1 |
| `spear` | Spear rammer | fighter | 40 × 70 | 20 | 60 | 200 / 720 dash | 150 | [2,3] | 5% | m2 |
| `needler` | Needler sniper | fighter | 70 × 70 | 24 | 90 | 200 | 240 | [3,5] | 8% | m2 |
| `skimmer` | Skimmer minelayer | fighter | 90 × 46 | 28 | 85 | 180 | 220 | [3,4] | 8% | m3 |
| `hornet` | Hornet missile boat | fighter | 80 × 74 | 30 | 100 | 160 | 260 | [3,5] | 10% | m3 |
| `phantom` | Phantom cloak jet | fighter | 72 × 64 | 26 | 100 | 260 | 350 | [4,6] | 10% | m4 |
| `warper` | Warper blink jet | fighter | 76 × 76 | 26 | 95 | blink | 380 | [4,6] | 10% | m5 |
| `manta` | Manta gunship | gunship | 140 × 100 | 48 | 320 | 120 | 900 | [10,14] | 30% | m1 |
| `weaver` | Weaver spiral gunship | gunship | 110 × 110 | 46 | 380 | 140 | 1,000 | [12,16] | 30% | m2 |
| `stormcaller` | Stormcaller | gunship | 120 × 90 | 44 | 420 | 120 | 1,100 | [12,18] | 30% | m3 |
| `hive` | Hive carrier | heavy | 220 × 200 | 86 | 1,000 | 80 | 3,500 | [35,50] | 100% | m1 |
| `bastion` | Bastion armored barge | heavy | 240 × 180 | 90 | 1,200 | 70 | 4,000 | [40,55] | 100% | m3 |
| `tug` | Collapsar tug | heavy | 200 × 160 | 80 | 1,400 | 60 | 4,500 | [45,60] | 100% | m2 |

Drop column = chance to roll the enemy's drop table (section 10.6). Heavies always roll `drop_heavy`.

**gnat: Gnat drone.** Look: a triangular arrowhead pointing down, two tiny swept fins, one pink seam down
the center, one orange engine dot with a 10 px plume. It banks ±0.3 rad into turns. Movement: follows its
formation path and never stops. Attack: none in m1-m2; from m3 each gnat has a 15% chance to fire one
aimed `orb` (200 px/s) as it passes y 300. Pops in a quick white flash and 6 sparks.

**dart: Dart interceptor.** Look: narrow fuselage with a needle nose, forward-swept wings (a "W" outline),
twin small engines, pink cockpit slit. Movement: follows the formation path, then peels off in an arc
toward the nearest player's x and exits. Attack: one aimed `needle` (340 px/s) when it first crosses
y 220 (in m1 only every other dart fires).

**wasp: Wasp fighter.** Look: twin-boom fighter: central pod with a glowing pink canopy, two booms ending
in engine nacelles, a tail wing bridging the booms, two wing guns with orange muzzle lights. Movement:
enters to `hoverY` (default 280), strafes ±140 px (sine, 0.5 Hz) for 6 s, exits down and sideways.
Attack: `aimed_burst` of 3 `orb` (230 px/s, 0.12 s apart) every 1.6 s; the wing guns glow 0.3 s before.
Counterplay: a small sidestep beats the whole burst.

**spear: Spear rammer.** Look: a long lance nose, tiny delta wings at the rear, one big engine; the nose
glows red-pink when locking. Movement: enters at 200 px/s to y 160-300, stops and turns toward the nearest
player for 0.8 s (thin red line along the dash path), then dashes in a straight line at 720 px/s and
leaves the screen. Attack: the ram itself (contact 20). From m4 it sheds 4 `shard` (2 per side,
perpendicular, 120 px/s) as the dash starts. Counterplay: move off the red line during the lock.

**needler: Needler sniper.** Look: a central sphere with four stubby vanes, a long barrel underneath and a
red scope light. Movement: enters, parks at `hoverY`, bobs 4 px, leaves after 12 s. Attack: `sniper_line`:
a thin red sight tracks the nearest player for 1.0 s (max turn 1.2 rad/s), locks for 0.25 s (sight flares
white), then fires 1 `needle` at 620 px/s; 3 needles 0.08 s apart from m4. Every 3.0 s.

**skimmer: Skimmer minelayer.** Look: a flat catamaran jet flying sideways: two hulls joined by one wing,
violet-lit mine racks underneath, engines on the trailing side. Movement: enters from the left or right
edge at a fixed y (260-420), crosses horizontally, exits the far side. Attack: `mine_lay`: drops a `mine`
every 0.7 s, plus 2 aimed `orb` (200 px/s) every 2 s. Counterplay: shoot mines as they drop, or cross
behind the skimmer only after its mines are cleared.

**hornet: Hornet missile boat.** Look: fat bomber fuselage, four missile tubes on its back with orange
caps, short thick wings, armored nose. Movement: hovers at `hoverY` for 8 s drifting 40 px/s, then exits
up. Attack: `homing_salvo` of 2 `missile` every 2.4 s (tube caps flash 0.4 s first). Missiles are
shootable (10 HP, +20 score each). Counterplay: kill missiles with spread or missiles, or make them turn
tight and overshoot.

**phantom: Phantom cloak jet.** Look: faceted black-glass stealth delta with a faint violet edge.
Cloaked: alpha 0.12 plus a moving shimmer outline, and invulnerable. Movement: cloaked, it moves to a spot
near the player's x at y 200-400, decloaks over 0.4 s (sparkle telegraph), fires, stays visible 1.4 s,
cloaks again; three cycles, then it leaves. Attack: `fan` of 5 `needle` (300 px/s, spread 0.5 rad) on
decloak. Counterplay: watch for the sparkle and pre-aim; lance pierces it the instant it decloaks.

**warper: Warper blink jet.** Look: a torus ring-wing around a central pod with a violet core; it
collapses to a point of light when blinking. Movement: shows a violet ring (r 30) where it will reappear,
vanishes 0.5 s later and reappears there; 4 blinks 1.6 s apart, then exits. Uses wormholes when one is
within 200 px. Attack: on each reappearance a `ring` of 10 `orb` at 140 px/s. Counterplay: the ring
telegraph shows where it will appear and fire.

**manta: Manta gunship.** Look: a manta ray: wide flat wings sweeping back, a raised spine with a pink
seam, two horns at the front, three engine plumes; the wings ripple (x scale 0.98-1.02, 0.7 Hz).
Movement: enters at 120 px/s to y 260, glides ±160 px over 10 s, exits after 14 s. Attack: `ring_stagger`
of 12 `orb` at 150 px/s every 2.2 s (each ring offset by half a gap) and, from m2, an aimed `fan` of 5 `orb`
(200 px/s, spread 0.6 rad) every 3.3 s from the horns. Counterplay: rings have 30° gaps; thread them.

**weaver: Weaver spiral gunship.** Look: a disc with three rotating spokes (1 turn per 3 s) ending in
emitter pods, and a central pink eye dome. Movement: hovers at `hoverY` for 12 s. Attack: `spiral`, 3
arms, each firing an `orb` every 0.11 s at 170 px/s while rotating 1.4 rad/s; 2.0 s on, 1.2 s off. Elites
add a counter-rotating `petal` spiral. Counterplay: circle with the spiral and dart through during the off
beat.

**stormcaller: Stormcaller.** Look: a gunship with two tall tesla-coil antennae (stacked rings) on its
wings; violet-white sparks crawl up the coils. Movement: hovers at `hoverY`. Attack: 5 `spark` in a fan
(spread 0.8 rad, 210 px/s) every 2.4 s. Pair arc: when two stormcallers are within 520 px, every 4 s a thin
violet line joins their coils for 0.8 s, then an enemy beam (width 14) burns along it for 0.6 s. Killing
either one breaks the arc. Ion storm strikes do not hurt it.

**hive: Hive carrier.** Look: a bulbous carrier with a honeycomb hangar face (hexagonal bay doors glowing
orange), four docking claws and two big engines. Movement: descends at 80 px/s to y 220, drifts ±50 px.
Attack: launches 2 gnats every 2.5 s (max 10 of its gnats alive); from m3 it adds a `ring` of 8 `orbBig`
at 120 px/s every 4 s. Its open bay doors take ×1.5 damage for 0.6 s after each launch.

**bastion: Bastion armored barge.** Look: a brick-shaped heavy cruiser, thick riveted front plates
(`#4a5068`), stepped superstructure, two side turrets with twin barrels, four rear engines. The prison
variant (`cargo`) shows rows of white-green pod cells on its flanks. Movement: descends at 70 px/s to
y 280, drifts ±60 px, leaves after 22 s. Armor: hits arriving inside its front 120° cone deal ×0.5 (white
sparks and a "tink"). Attack: each turret fires an aimed pair of `orbBig` (190 px/s) every 1.8 s,
alternating; the prow fires `wall_gap` every 5 s. On death it releases its `cargo` pods.

**tug: Collapsar tug.** Look: a squat armored body with two long claw arms reaching down that cradle a
black hole 120 px below its center; violet magnetic coils glow on the claws. Movement: descends at 60 px/s
to y 240, sways ±80 px. Attack: 3 aimed `void_orb` (160 px/s) every 2.0 s; they curve hard around its own
hole. Its carried `black_hole {size medium, attached}` follows the claws. On death the hole is released:
it drifts down at 40 px/s and collapses after 6 s in a shockwave that clears enemy bullets within r 200.

### 6.1 Formations

| id | Description |
|---|---|
| `vee` | V of 5-9 at 70 px spacing descending at 180 px/s, leader at the tip; holds 1 s at y 260, then the wings peel outward and dive. |
| `line` | Horizontal line (`gap`, default 80 px; `stagger`, ms between members) descending straight. |
| `column` | Single file down a fixed x at 60 px spacing; optional `weave` (sine amplitude in px). `from bottom` spawns at y 1340 and climbs. |
| `arc_sweep` | Enters at a top corner (`side`) and sweeps a quarter circle (r 420) across the screen, exits the far side; 0.18 s between members. |
| `pincer` | Two halves enter from both top corners, cross in an X at y 400, exit the opposite bottom corners. |
| `snake` | Follow-the-leader sine down the screen from x (amplitude 140, wavelength 360 px). |
| `staircase` | Diagonal stagger from one `side`: members appear at x steps of 90 and y steps of 60, descend 200 px, then turn toward the far side. |
| `ring_in` | Members appear on a circle (r 300) around (x, 360), spiral inward for 2 s, then fall out the bottom. Great black-hole food. |
| `side_stream` | A stream entering from a `side` edge at y 200-500, crossing horizontally on a gentle arc. |
| `rain` | Members dropped from seeded random x over 3 s, straight down, speed ±20%. |
| `escort_box` | A `leader` with `count` escorts at box corners (±90 px) mirroring its moves; escorts break and dive when the leader dies. |

**Formation bonus.** When every member of a formation is destroyed by players (none escaped), the last one
drops a roll on `drop_formation`, and the HUD floats "FORMATION +{bonus}" with bonus = 100 × members ×
multiplier. `escort_box` counts the escorts only. This is the main power-up pacing tool.
