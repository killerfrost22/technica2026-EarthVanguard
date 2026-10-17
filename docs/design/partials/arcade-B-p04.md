
### 4.5 m5: NIGHTFALL

- **Location:** Through the Tartarus Rift to the Ouroboros, the Armada flagship parked between two
  orbiting black holes.
- **Palette:** void `#030308`, rift interior `#2a0f3f`, rift rim `#ff5c8a` (alpha ≤ 0.25 in the
  background), red-shifted stars `#ffe9d6`, binary accretion disks `#ffcf8a` / `#ff8a5c` (far, small),
  Nyx megastructure `#15161f` with seams `#ff2f6d` at alpha ≤ 0.3, Halcyon beam `#7fe3ff`.
- **Background:** `bg_tartarus`. L0 gradient `#030308` → `#090613`; L1 sparse red-shifted stars;
  L2 the rift (a jagged vertical tear 260 px wide, noise-edged, interior `#2a0f3f` with no stars, rim glow,
  parallax 0.04); L3 binary backdrop (phase `binary`: two painted accretion disks circling each other once
  per 40 s; art only); L4 Nyx megastructures (spires and pylons, parallax 0.5); L5 the Ouroboros hull
  (phase `throne`: serpent-scale armor plates scroll beneath the action at parallax 0.7, dark with dim pink
  seams).
- **Set pieces and phases:** `rift` (0 s: the jet punches through the tear, a 0.6 s chromatic flash);
  `binary` (61 s); the Halcyon broadside (63 s: the carrier's spinal cannon fires a 160 px wide cyan beam
  up the left third for 1.5 s, destroying every non-heavy enemy it touches; screen shake 10 px);
  `throne` (118 s); `boss` (172 s); `finale` (after the boss: the rift collapses into a white-violet glow).
- **Music:** `m5_theme`; boss `final_boss_theme`.
- **Hazards:** `wormhole` (29 s, 49 s, 124 s) and a binary `black_hole` pair (70 s: two medium holes
  orbiting a common center that drifts down the screen).
- **Enemy roster:** every enemy type; elites common. New: warper.
- **Rescue pods:** 10 pods, 23 people (one medical pod of 6). No VIP.
- **Boss:** `boss_ouroboros`. **Target duration:** 4:50. **Rewards:** credit bonus 1,000, SP 2, ending.

```
# OPENING 0-26: through the rift
  0.0  banner NIGHTFALL / Tartarus Rift + music m5_theme + scroll 110 + bg rift
  1.5  radio m5_open
  3.0  formation pincer dart ×14
  6.0  formation vee wasp ×7 x 360 {elite}
  9.0  spawn warper x 200 + spawn warper x 520
 10.0  radio m5_warper
 14.0  formation arc_sweep dart ×10 {side left}
 15.5  formation arc_sweep dart ×10 {side right}
 18.0  spawn hornet x 240 {hoverY 240} + spawn hornet x 480 {hoverY 240}
 21.0  formation rain gnat ×16
 24.0  spawn manta x 360 {elite}
 26.0  waitClear timeout 12
# HAZARD 28-59: wormholes
 28.0  pickup weapon_up x 360
 29.0  hazard wormhole {a [180, 380], b [540, 900], life 20}
 30.0  radio m5_wormhole
 33.0  formation snake dart ×8 x 180
 36.0  spawn needler x 540 {hoverY 260}
 40.0  spawn warper x 160 + spawn warper x 360 + spawn warper x 560
 44.0  pod civilian people 3 x 300
 46.0  formation side_stream gnat ×10 {side left}
 49.0  hazard wormhole {a [520, 340], b [200, 860], life 18}
 52.0  spawn weaver x 360 {elite}
 56.0  formation staircase wasp ×6 {side right, elite}
 59.0  waitClear timeout 14
# BREATHER 61-69: the Halcyon arrives
 61.0  bg binary + scroll 80 + radio m5_halcyon
 63.0  call halcyon_broadside {x 120, duration 1.5}
 64.0  pod medical people 6 x 360 + pod crew people 2 x 180
 66.0  pickup shield x 540
 69.0  checkpoint + banner CHECKPOINT / Twin black holes ahead
# PEAK 2 70-116: binary black holes
 70.0  hazard black_hole {size medium, binary {cx 360, cy -80, r 170, w 0.35, vy 26}, life 44}
 71.0  radio m5_binary
 74.0  formation ring_in gnat ×12 x 360
 78.0  formation pincer dart ×12
 82.0  spawn bastion x 360 {elite}
 86.0  spawn warper x 200 + spawn warper x 520
 90.0  pickup weapon_up x 360
 92.0  formation side_stream dart ×10 {side left}
 94.0  formation side_stream dart ×10 {side right}
 98.0  spawn stormcaller x 260 + spawn stormcaller x 460
102.0  pod civilian people 3 x 260 + pod civilian people 2 x 460
106.0  formation rain gnat ×18
110.0  spawn hornet x 200 {hoverY 230} + spawn hornet x 520 {hoverY 230}
112.0  pod crew people 2 x 360
116.0  waitClear timeout 16
# PEAK 3 118-157: the throne's hull
118.0  bg throne + scroll 120 + radio m5_throne
120.0  formation escort_box {leader hive, escort warper, count 4} x 360
124.0  hazard wormhole {a [360, 300], b [360, 980], life 16}
126.0  formation arc_sweep wasp ×6 {side left, elite}
128.0  formation arc_sweep wasp ×6 {side right, elite}
132.0  pickup bomb x 360
134.0  spawn phantom x 200 + spawn phantom x 360 + spawn phantom x 520
138.0  spawn bastion x 200 {elite} + spawn bastion x 520 {elite}
142.0  pod civilian people 3 x 360
146.0  formation pincer dart ×16
150.0  if coop: pod civilian people 3 x 300
152.0  spawn needler x 140 {hoverY 220} + spawn needler x 580 {hoverY 220}
156.0  waitClear timeout 18
# LAST BREATH 158-171
158.0  pickup weapon_up x 360 + radio m5_last
161.0  call spawnAlly ally_kestrel {run escort, life 12} + radio m5_sparrow
162.0  formation vee dart ×9 x 360
166.0  formation column gnat ×8 x 140 + formation column gnat ×8 x 580 + pod civilian people 2 x 360
170.0  waitClear timeout 10
# BOSS
172.0  pickup repair x 360 + pickup missile x 240 + bg boss + scroll 30
173.0  radio m5_boss_warn
175.0  banner WARNING / OUROBOROS, throne of the Hierarch
177.0  boss boss_ouroboros
177.1  afterBoss radio m5_win + bg finale
181.0  afterBoss radio m5_win2
184.0  afterBoss radio m5_win3
187.0  afterBoss end
```

After the results screen, m5 always continues to the `ending` screen.

| id | Trigger | Copy |
|---|---|---|
| `m5_open` | 1.5 s | [anvil] We're through the rift. No retreat from here. Make it count. |
| `m5_warper` | 10 s | [sparrow] Warpers! They blink around. Watch for the ring where they'll pop out. |
| `m5_wormhole` | 30 s | [osei] Wormhole pair! What goes in one comes out the other. Bullets too! |
| `m5_halcyon` | 61 s | [anvil] Halcyon on station. Spinal cannon firing on the left. Stay clear! |
| `m5_binary` | 71 s | [sparrow] Two black holes dancing! Fly the line between them, it's calmer there. |
| `m5_throne` | 118 s | [anvil] You're over the flagship's hull. Everything they have is here. |
| `m5_last` | 158 s | [socket] She's hot and she's ready. Give him everything, {callsign}. |
| `m5_sparrow` | 161 s | [sparrow] Sparrow on your wing, one last time. Let's go wake him up. |
| `m5_boss_warn` | 173 s | [anvil] The throne ship is moving. This is the end of it, one way or another. |
| `m5_boss_intro` | `bossIntroDone` | [vael] I am the night that ends every star. Kneel, little light. |
| `m5_boss_p2` | phase 2 | [osei] The engines are black holes! Stay between them, the pulls cancel there. |
| `m5_boss_p3` | phase 3 | [anvil] Throne is shielded. Shoot into the wormholes. The exits are behind it! |
| `m5_boss_p4` | phase 4 | [sparrow] The crown broke loose! That's Vael himself. Take him down! |
| `m5_boss_horizon` | crown at 5% HP | [vael] Then we all fall together. Into the dark! |
| `m5_win` | afterBoss | [anvil] Rift is closing. The Armada is broken. Bring it home, {callsign}. |
| `m5_win2` | afterBoss +4 s | [sparrow] Look at that. Real stars again. |
| `m5_win3` | afterBoss +7 s | [socket] Nothing on her I can't fix. Okay. A lot I can fix. |

`m5_wormhole` and `m5_boss_p2` play from `osei` when s2 is complete; otherwise from `socket`.

## 5. Side stories

All side stories: `kind:'side'`, music `side_theme`, boss music `miniboss_theme`, 2-3 minutes. The choice
pauses play (`SL.story.choice`), shows the speaker's portrait, the prompt and two big option buttons.
Tapping an option resumes with a 1 s slow-mo ramp (0.4 → 1.0) so the player can re-orient. The first
completion of each option awards its skill (`rewards.skill` is computed from `session.flags`). A replay
shows a gold "NEW SKILL" tag on the option the player has not chosen before. Side-story completion gives a
credit bonus but no SP. Failing never changes `save.choices`.

### 5.1 s1: COLD HARBOR (Aegis branch)

- **Unlock:** rescue Dockmaster Vale's VIP pod in m1 (`save.flags.unlock_s1`). Story fallback: completing
  m2 unlocks it ("Vale's distress call finally reached the fleet").
- **Premise:** The ice colony Cold Harbor on Callisto is evacuating on its last liner, the Long Night.
  Nyx hunters swarm the launch and the drill ship HAILSTORM is coming to spear it.
- **Objective:** keep `ally_liner` (the Long Night) alive until it reaches orbit, then destroy HAILSTORM.
  The liner (HP 2,000; ×1.5 on Cadet; hittable by enemy bullets, s/m/l damage ×1) starts at y 1150 and
  climbs to y 940. If its HP reaches 0 the mission fails with "The Long Night is lost."
- **Background:** `bg_cold_harbor` (phases `colony`, `blizzard`, `boss`). **Hazard:** `asteroid_storm`
  with `{variant ice}`. **Enemies:** gnat, dart, wasp, spear, hornet, manta. **Boss:** `mb_hailstorm`.
- **Target duration:** 2:40. **Rewards:** credit bonus 500; skill by option.

**The choice `s1_choice`** (at 48 s, speaker `vale`):
- Prompt: "The liner's shield is failing. Stay on the liner, or pull the hunters off it?"
- Option `guard_liner`: **STAY ON THE LINER** · "Nothing touches the Long Night." Awards `skill_bulwark`.
  After it: a cyan "shield relay" ring (r 220) surrounds the liner; the liner's shield blocks 70% of bullet
  damage only while a player is inside the ring. Enemy aimed fire targets the liner 50% of the time.
  The liner stays on screen until the boss. Waves come straight down the middle. Two pods fall from the
  liner's damaged hab deck.
- Option `draw_fire`: **DRAW THEIR FIRE** · "Light me up. I'll pull them away." Awards `skill_decoy`.
  After it: the player who confirmed gets a pink beacon marker for 50 s; all aimed enemy fire targets that
  player and every hunter wave spawns 20% more members. The liner climbs off the top of the screen at 52 s
  and is safe. Three pods of colonists who missed the liner appear among the hunters.

```
  0.0  banner COLD HARBOR / Callisto ice docks + music side_theme + scroll 70 + bg colony
  0.5  call spawnAlly ally_liner {x 360, y 1150, targetY 940, hp 2000}
  1.5  radio s1_open
  4.0  formation vee dart ×7 x 360
  7.0  formation arc_sweep gnat ×8 {side left}
  9.0  formation arc_sweep gnat ×8 {side right}
 11.0  spawn hornet x 240 {hoverY 220, target liner}
 12.0  radio s1_liner
 15.0  formation pincer dart ×10
 19.0  pod civilian people 3 x 200
 21.0  spawn wasp x 200 + spawn wasp x 520
 25.0  formation staircase gnat ×8 {side right}
 28.0  spawn manta x 360
 31.0  pickup weapon_up x 360
 34.0  formation side_stream dart ×8 {side left}
 37.0  spawn hornet x 480 {hoverY 220, target liner}
 40.0  pod crew people 2 x 520
 44.0  waitClear timeout 10
 46.0  radio s1_hunters
 48.0  choice s1_choice
 48.1  if guard_liner: radio s1_guard + call liner_relay on
 48.1  if draw_fire: radio s1_draw + call beacon chooser 50 + call liner_depart {vy -80}
 50.0  formation pincer dart ×12
 54.0  if guard_liner: spawn hornet x 200 {target liner} + spawn hornet x 520 {target liner}
 54.0  if draw_fire: formation snake spear ×5 x 360
 58.0  formation vee wasp ×5 x 360
 60.0  if guard_liner: pod civilian people 3 x 300 + pod civilian people 2 x 420
 60.0  if draw_fire: pod civilian people 2 x 160 + pod civilian people 2 x 360 + pod civilian people 2 x 560
 64.0  spawn manta x 240 + spawn manta x 480
 68.0  waitClear timeout 12
 70.0  bg blizzard + hazard asteroid_storm {variant ice, duration 24, density 1.0} + radio s1_blizzard
 74.0  formation rain gnat ×12
 80.0  formation side_stream dart ×10 {side right}
 84.0  pod civilian people 3 x 360
 88.0  spawn wasp x 200 + spawn wasp x 360 + spawn wasp x 520
 94.0  pickup weapon_up x 360
 98.0  waitClear timeout 12
100.0  pickup repair x 360 + bg boss + scroll 40
101.0  radio s1_boss_warn
104.0  boss mb_hailstorm
104.1  afterBoss if guard_liner: radio s1_win_guard
104.1  afterBoss if draw_fire: radio s1_win_draw
```

| id | Trigger | Copy |
|---|---|---|
| `s1_open` | 1.5 s | [vale] Long Night is lifting. Twelve hundred souls aboard. Keep them flying! |
| `s1_liner` | 12 s | [anvil] Missile boats are aiming at the liner. Kill them first. |
| `s1_hunters` | 46 s | [vale] More hunters on scope. A lot more. The liner's shield is flickering. |
| `s1_choice` | choice prompt | [vale] The liner's shield is failing. Stay on the liner, or pull the hunters off it? |
| `s1_guard` | after `guard_liner` | [vale] Stay inside the blue ring and our shield holds. Don't leave us! |
| `s1_draw` | after `draw_fire` | [sparrow] Beacon's lit. Every gun out there wants you now. Fly like crazy! |
| `s1_blizzard` | 70 s | [vale] Ice storm off the ring! Those chunks will crack a hull. Careful! |
| `s1_boss_warn` | 101 s | [anvil] Drill ship rising out of the ice. It wants the docks. Stop it. |
| `s1_boss_intro` | `bossIntroDone` | [vale] HAILSTORM. It cut our north dome in half last winter. Get it! |
| `s1_win_guard` | afterBoss, `guard_liner` | [vale] Long Night reached orbit. Everyone's alive. I owe you everything. |
| `s1_win_draw` | afterBoss, `draw_fire` | [vale] They never touched the liner. You took it all. Thank you, {callsign}. |

### 5.2 s2: LAGRANGE DEEP (Gravity branch)

- **Unlock:** rescue Dr. Osei's VIP pod in m2 (`save.flags.unlock_s2`). Story fallback: completing m3.
- **Premise:** With its leash cut in m2, Kerr's Eye drifted into Osei's research station. The Nyx tug
  TETHER is hauling the station into the hole to bury her research. Her gravity core and her crew are still
  aboard.
- **Objective:** reach the station, decide its fate, destroy TETHER.
- **Hazard layout:** the whole mission sits under Kerr's Eye: `black_hole {size large, x 360, y -60,
  fixed, pullMul 0.7}` for the full mission. Its lens sits at the top center; its pull covers the top half of
  the screen. Pods enter from the sides at y 700-800 and drift up toward the hole at 30 px/s (pulled), so the
  player must fly up into the pull to save them.
- **Background:** `bg_kerr` phase `lagrange` (station spine and broken modules scrolling, everything tilting
  toward the hole), then `boss`. **Enemies:** gnat, dart, spear, needler, weaver, manta. **Boss:** `mb_tether`.
- **Target duration:** 2:30. **Rewards:** credit bonus 550; skill by option.

**The choice `s2_choice`** (at 46 s, speaker `osei`):
- Prompt: "The station's splitting. I can save the gravity core or open the hab ring. Not both."
- Option `save_core`: **SAVE THE CORE** · "Grab the core. It's how we win this war." Awards `skill_singularity`.
  After it: `prop_core` (a glowing sphere r 26) tethers 70 px behind the choosing player for the rest of
  the mission. It bends enemy bullets within 110 px toward itself (accel 300 px/s²) and swallows them, but
  it slows its carrier by 15%, and spears and darts dive at it (their contact drains 0 hull: the core is
  indestructible, but each hit knocks its carrier 40 px). The crew escapes on their own lifeboats (no extra
  pods).
- Option `save_crew`: **SAVE THE CREW** · "Open the hab ring. People first." Awards `skill_repulsor`.
  After it: 6 pods of 3 people burst from the station over 20 s and drift up toward the horizon at 45 px/s;
  every pod that crosses the horizon is lost. At 68 s the abandoned core falls in and its collapse releases
  a gravity wave: a ring that expands from the hole at 600 px/s, pushes players 220 px down and erases every
  enemy bullet it passes (the moment Osei designs the Repulsor from).

```
  0.0  banner LAGRANGE DEEP / Edge of Kerr's Eye + music side_theme + scroll 60 + bg lagrange
  0.5  hazard black_hole {size large, x 360, y -60, fixed, pullMul 0.7, life 999}
  1.5  radio s2_open
  4.0  radio s2_pull
  5.0  formation side_stream dart ×8 {side left}
  7.0  formation side_stream dart ×8 {side right}
 10.0  pod civilian people 2 x 40 {y 760, vx 40}
 12.0  spawn weaver x 360 {hoverY 420}
 16.0  formation pincer gnat ×12
 20.0  spawn needler x 160 {hoverY 380} + spawn needler x 560 {hoverY 380}
 24.0  pod crew people 2 x 680 {y 800, vx -40}
 26.0  formation snake dart ×8 x 160
 30.0  pickup weapon_up x 360
 32.0  spawn manta x 240 {hoverY 420} + spawn manta x 480 {hoverY 420}
 38.0  formation rain gnat ×12
 42.0  waitClear timeout 10
 44.0  radio s2_station
 46.0  choice s2_choice
 46.1  if save_core: radio s2_core + call attach_core chooser
 46.1  if save_crew: radio s2_crew + call hab_pods {count 6, people 3, over 20}
 50.0  formation side_stream dart ×10 {side left}
 52.0  if save_core: formation vee spear ×5 x 360 {target core}
 54.0  formation side_stream dart ×10 {side right}
 58.0  spawn weaver x 200 {hoverY 400} + spawn weaver x 520 {hoverY 400}
 62.0  if save_core: formation snake spear ×6 x 560 {target core}
 64.0  pod civilian people 2 x 40 {y 720, vx 40}
 68.0  if save_crew: call core_collapse + radio s2_wave
 70.0  formation pincer dart ×12
 76.0  pickup weapon_up x 360 + spawn needler x 360 {hoverY 360}
 82.0  waitClear timeout 12
 84.0  pickup repair x 360 + bg boss + scroll 30
 85.0  radio s2_boss_warn
 88.0  boss mb_tether
 88.1  afterBoss if save_core: radio s2_win_core
 88.1  afterBoss if save_crew: radio s2_win_crew
```

| id | Trigger | Copy |
|---|---|---|
| `s2_open` | 1.5 s | [osei] Welcome to Lagrange Deep. Mind the hole, it's very hungry today. |
| `s2_pull` | 4 s | [osei] The Eye pulls everything up. Pods too. Catch them before the horizon does. |
| `s2_station` | 44 s | [osei] That's my station. It's splitting in half. Oh no. No, no, no. |
| `s2_choice` | choice prompt | [osei] The station's splitting. I can save the gravity core or open the hab ring. Not both. |
| `s2_core` | after `save_core` | [osei] Core's on your tether! It eats bullets, but it's heavy. They'll come for it. |
| `s2_crew` | after `save_crew` | [osei] Hab ring's open! Eighteen people, falling up. Catch them, {callsign}! |
| `s2_wave` | 68 s | [osei] The core hit the horizon. Gravity wave! Oh, that's beautiful. Brace! |
| `s2_boss_warn` | 85 s | [anvil] The tug is under the hole, hauling the wreck in. Cut its lines. |
| `s2_boss_intro` | `bossIntroDone` | [vael] TETHER buries what you love in the dark. It is very good at it. |
| `s2_win_core` | afterBoss, `save_core` | [osei] Core's safe. Give me a week and your jet will carry a black hole. |
| `s2_win_crew` | afterBoss, `save_crew` | [osei] Everyone's out. And I watched a core die. I know how to push gravity now. |

The `s2_choice` prompt is 88 characters. `s2_win_crew` is 79.
