
## 4. Main missions

### 4.0 Difficulty curve and script notation

Each mission alternates PEAK segments (dense waves, a heavy or a hazard) and BREATHER segments (pods,
pickups, radio, a checkpoint). Every new enemy type gets a solo entrance before it appears in a mix. Every
hazard first appears alone, then mixed with enemies.

| | m1 | m2 | m3 | m4 | m5 |
|---|---|---|---|---|---|
| Target length (pre-boss + boss) | 147 + 65 s | 159 + 75 s | 165 + 85 s | 170 + 95 s | 175 + 110 s |
| Peak enemies on screen | 18 | 22 | 26 | 28 | 32 |
| Peak enemy bullets on screen | 120 | 180 | 260 | 340 | 450 |
| Mission tune `bulletSpeed` / `fireRate` | 0.85 / 0.80 | 0.92 / 0.90 | 1.00 / 1.00 | 1.05 / 1.10 | 1.10 / 1.20 |
| New enemies | gnat, dart, wasp, manta, hive | spear, needler, weaver, tug | skimmer, hornet, stormcaller, bastion | phantom, elite variants | warper |
| Signature hazard | asteroid_storm | black_hole | ion_storm | solar_flare, mine_field | wormhole, black_hole |
| Boss (HP) | boss_razorback (9,000) | boss_lodestar (16,000) | boss_tempest (24,000) | boss_suneater (33,000) | boss_ouroboros (45,000) |
| Expected weapon level at boss | 3 | 4 | 4-5 | 5 | 5 |
| Scripted power chips | 4 | 4 | 4 | 4 | 4 |

`tune` is a missions extension field on the mission def (`tune:{bulletSpeed, fireRate}`); enemy and
pattern code multiply it on top of `SL.game.diff`. Bosses use their own numbers and ignore `tune`.

Script notation (one line per director time, `+` joins events that share a time):
- `formation <id> <enemy> ×N x <x> {opts}` → `{at, formation, enemy, count, x, opts}`
- `spawn <enemy> x <x> {opts}`, `hazard <id> {opts}`, `pickup <id> x <x>`, `radio <lineId>`,
  `pod <kind> people N x <x> [vip <sideId>]` (pods enter at y −40 unless noted), `banner TEXT / sub`,
  `music <id>`, `scroll <px/s>`, `bg <phase>`, `waitClear timeout <s>`, `checkpoint`, `boss <id>`,
  `call <what>`, `choice <id>`, `end`, `repeat every <s> count <n>`, `if <condition>`.
- `afterBoss` marks events with `afterBoss:true`.
- Co-op lines marked `if coop` only run in co-op.

### 4.1 m1: FIRST LIGHT

- **Location:** Vesta Shipyards, Asteroid Belt.
- **Palette:** space `#060912`, belt dust `#1f1a26`, Vesta rock `#6e6052` / `#8c7a66`, teal nebula
  `#123a48`, shipyard sodium lights `#ffb15c` (distant, alpha ≤ 0.5), dry-dock fire `#a8452a` (desaturated).
- **Background:** `bg_vesta`. Layers far to near: L0 vertical gradient `#060912` → `#0b1020`; L1 three
  star depths (parallax 0.04 / 0.09 / 0.18, 220 / 140 / 60 stars, twinkle); L2 painted teal-violet nebula
  (`noiseCanvas` 512², palette `#060912` → `#123a48` → `#2b1d3f`, alpha 0.4, parallax 0.07); L3 Vesta
  (cratered planetoid, r 560, center off-screen right at (900, 300), fbm crater texture, terminator lit from
  the upper left, parallax 0.03); L4 distant belt rocks (dark silhouettes `#151320`, blurred, parallax 0.3);
  L5 shipyard gantries (phase `shipyard`: girder trusses 60-90 px wide drawn in `#1b2030` with sodium light
  dots blinking at 0.8-1.6 Hz, parallax 0.6); L6 dust streaks (thin lines, alpha 0.1, parallax 1.2).
- **Set pieces and phases:** `open` (0 s: the Halcyon's catapult deck slides away below the jet for the
  first 3 s, then the open belt); `shipyard` (40 s: burning dry dock with an unfinished carrier hull, slow
  orange pulses at 12% alpha every 3-5 s, welding sparks); `storm` (67 s: brown dust haze `#2a2018` at 30%,
  rock silhouettes double in size); `boss` (142 s: vignette 0.5, scene darkens 20%, the RAZORBACK's shadow
  slides over the dust 3 s before it appears). Sparrow's Kestrel strafes the screen at 52 s.
- **Music:** `m1_theme`; boss `boss_theme`.
- **Hazards:** `asteroid_storm` once (67-97 s, density 0.9, all three rock sizes). Rocks block shots in
  both directions, so they are cover as well as obstacles.
- **Enemy roster:** gnat, dart, wasp, manta, hive. Formations: vee, line, arc_sweep, snake, staircase,
  pincer, side_stream, rain, column, escort_box.
- **Rescue pods:** 6 pods, 15 people. VIP: Dockmaster Vale (`vip s1`) at 120 s, guarded by two wasps.
- **Boss:** `boss_razorback`. **Target duration:** 3:30. **Rewards:** credit bonus 400, SP 1 (first clear).

```
# OPENING 0-20: move, shoot, first chain
  0.0  banner FIRST LIGHT / Vesta Shipyards + music m1_theme + scroll 80 + bg open
  1.5  radio m1_open
  3.0  formation vee gnat ×5 x 360
  6.0  formation vee gnat ×5 x 220
  8.0  formation vee gnat ×5 x 500
  9.5  radio m1_chips
 11.0  formation line dart ×6 x 360 {gap 80, stagger 30}
 14.0  formation arc_sweep gnat ×8 {side left}
 16.5  formation arc_sweep gnat ×8 {side right}
 19.0  pickup weapon_up x 360
# BUILD 20-38: first shooters
 21.0  spawn wasp x 240 + spawn wasp x 480
 22.0  radio m1_wasps
 25.0  formation snake dart ×7 x 140
 28.0  formation snake dart ×7 x 580
 31.0  pod civilian people 3 x 300
 33.0  formation staircase gnat ×6 {side left}
 35.0  spawn wasp x 360 {hoverY 300}
 37.0  waitClear timeout 10
# PEAK 1 40-58: shipyard, first gunship
 40.0  bg shipyard + scroll 100 + radio m1_shipyard
 42.0  formation pincer dart ×10
 45.0  spawn manta x 360
 46.0  radio m1_manta
 48.0  formation side_stream gnat ×8 {side left}
 50.0  formation side_stream gnat ×8 {side right}
 52.0  call spawnAlly ally_kestrel {run strafe_lr} + radio m1_sparrow_run
 54.0  spawn wasp x 160 + spawn wasp x 560
 56.0  pickup weapon_spread x 520
 58.0  waitClear timeout 12
# BREATHER 60-66
 60.0  pod civilian people 4 x 200 + pod civilian people 2 x 520
 61.0  radio m1_pods
 63.0  pickup shield x 360
 66.0  checkpoint + banner CHECKPOINT / Dust storm ahead
# HAZARD 67-98: asteroid storm
 67.0  bg storm + hazard asteroid_storm {duration 30, density 0.9}
 68.5  radio m1_rocks
 72.0  formation rain gnat ×10
 76.0  formation vee dart ×7 x 360
 80.0  spawn wasp x 200 + spawn wasp x 520
 84.0  formation arc_sweep dart ×8 {side left}
 88.0  pod crew people 2 x 420
 90.0  formation arc_sweep dart ×8 {side right}
 94.0  spawn manta x 220 + spawn manta x 500
 98.0  waitClear timeout 14
# BREATHER 100-103
100.0  pickup missile x 360 + radio m1_missiles
# PEAK 2 104-127: carrier and VIP
104.0  formation escort_box {leader hive, escort dart, count 4} x 360
105.5  radio m1_hive
110.0  formation column gnat ×6 x 120 repeat every 4 count 3
112.0  formation column gnat ×6 x 600 repeat every 4 count 3
120.0  pod vip people 1 x 360 vip s1 + spawn wasp x 250 + spawn wasp x 470
121.0  radio m1_vip
124.0  if coop: pod civilian people 3 x 560
126.0  waitClear timeout 14
# FINAL RUSH 128-141
128.0  formation pincer dart ×12
131.0  formation vee gnat ×7 x 360
134.0  formation staircase wasp ×4 {side right}
138.0  pod civilian people 3 x 260
140.0  waitClear timeout 12
# BOSS
142.0  pickup repair x 360 + bg boss + scroll 50
143.0  radio m1_boss_warn
145.0  banner WARNING / Assault carrier RAZORBACK
147.0  boss boss_razorback
147.1  afterBoss radio m1_win
```

Radio cues (copy; speaker in brackets):

| id | Trigger | Copy |
|---|---|---|
| `m1_open` | 1.5 s | [anvil] Starlance, you are clear of the deck. Weapons free, {callsign}. |
| `m1_chips` | 9.5 s | [socket] Kill a whole formation and the last one drops a power chip. Greedy is good. |
| `m1_wasps` | 22 s | [sparrow] Wasps! They shoot back in threes. Slide, don't run. |
| `m1_shipyard` | 40 s | [anvil] Dry dock four is burning. Keep them off the crews. |
| `m1_manta` | 46 s | [socket] Gunship. Its rings have gaps. Thread them, then hit it in the face. |
| `m1_sparrow_run` | 52 s | [sparrow] Sparrow on your wing! Strafing left to right, keep your head down! |
| `m1_pods` | 61 s | [anvil] Escape pods. Fly over them to bring them in. Every one counts. |
| `m1_rocks` | 68.5 s | [sparrow] Rocks inbound! Big ones split. Shoot early or use them as cover. |
| `m1_missiles` | 100 s | [socket] Missile pod! Homing missiles find targets on their own. Spoil her. |
| `m1_hive` | 105.5 s | [anvil] Carrier. It launches drones until it dies. Kill it fast. |
| `m1_vip` | 121 s | [anvil] Gold beacon. That's a VIP pod. Bring them home, {callsign}. |
| `m1_boss_warn` | 143 s | [anvil] Huge contact in the dust. Assault carrier. Here it comes. |
| `m1_boss_intro` | `bossIntroDone` | [vael] Little light. You burn so briefly. RAZORBACK, end it. |
| `m1_boss_p2` | phase 2 | [socket] Its spine's charging. Watch the fins light up and move. |
| `m1_boss_p3` | phase 3 | [sparrow] Hull's open! Hit the core, hit it now! |
| `m1_win` | afterBoss | [anvil] RAZORBACK is down. Vesta is ours again. Come home, {callsign}. |

### 4.2 m2: DEEP PULL

- **Location:** Kerr Station, Jupiter Trojans, beside the captive black hole Kerr's Eye.
- **Palette:** space `#05060d`, Jupiter bands `#4a3426` / `#6b4a32` (dim), accretion glow `#ffcf8a`
  (only near the eye, far away), lens rim `#c9b8ff`, station hull `#2a3044`, station lights `#7fe3ff` at
  alpha ≤ 0.4.
- **Background:** `bg_kerr`. L0 gradient `#05060d` → `#0a0b18`; L1 stars (3 depths); L2 Jupiter (r 900,
  center (−200, −250), banded fbm stripes, lit edge, alpha 0.55, parallax 0.02); L3 Kerr's Eye backdrop
  (painted accretion disk: an ellipse ring 340 × 90 of `#ffcf8a` → `#ff8a5c` → transparent, with a black
  disc r 40 and a thin bright photon ring; parallax 0.05; it is art only and never calls `addLens`);
  L4 debris streams (small station fragments spiraling toward the eye, parallax 0.25); L5 Kerr Station
  (phase `station`: a broken ring 1,400 px across seen at an angle, spokes, hab lights, parallax 0.5).
- **Set pieces and phases:** `approach` (0 s: Jupiter fills the top-left corner); `lensing` (53 s: the
  eye's disk drifts on-screen at the top and background stars near it stretch into arcs, an effect drawn
  by the background, not post); `station` (95 s: the ring station scrolls by, chunks breaking off and
  falling toward the eye); `boss` (154 s: the station ring tilts away, scroll slows to 40).
- **Music:** `m2_theme`; boss `boss_theme`.
- **Hazards:** `black_hole`. First a small free one at 62 s (alone with weak popcorn so the player sees the
  pull eat enemies and bend bullets), then two `tug` heavies each towing a medium hole at 96 s and 110 s.
  Killing a tug releases its hole: it drifts down at 40 px/s and collapses after 6 s.
- **Enemy roster:** gnat, dart, wasp, spear, needler, weaver, manta, tug.
- **Rescue pods:** 7 pods, 17 people. VIP: Dr. Osei (`vip s2`) at 120 s, drifting toward the second tug's
  black hole. If it falls in, `podLost` fires and `osei` is not rescued this run.
- **Boss:** `boss_lodestar`. **Target duration:** 3:55. **Rewards:** credit bonus 550, SP 1.

```
# OPENING 0-22: rammers
  0.0  banner DEEP PULL / Kerr Station + music m2_theme + scroll 90 + bg approach
  1.5  radio m2_open
  3.0  formation vee dart ×7 x 360
  6.0  formation pincer gnat ×10
  9.0  formation snake dart ×7 x 160
 11.0  formation snake dart ×7 x 560
 13.0  spawn spear x 200 + spawn spear x 520
 14.0  radio m2_spears
 17.0  spawn wasp x 360 {hoverY 260}
 19.0  formation staircase gnat ×6 {side right}
 22.0  waitClear timeout 10
# BUILD 24-51: snipers and spirals
 24.0  pickup weapon_up x 360
 26.0  spawn needler x 140 {hoverY 220} + spawn needler x 580 {hoverY 220}
 27.0  radio m2_needlers
 30.0  formation arc_sweep dart ×8 {side left}
 33.0  formation arc_sweep dart ×8 {side right}
 36.0  pod civilian people 3 x 360
 38.0  spawn spear x 160 + spawn spear x 360 + spawn spear x 560
 41.0  spawn weaver x 360
 42.0  radio m2_weaver
 46.0  formation side_stream gnat ×8 {side left}
 48.0  formation side_stream gnat ×8 {side right}
 51.0  waitClear timeout 12
# BREATHER 53-61
 53.0  bg lensing + scroll 70 + radio m2_eye
 55.0  pod civilian people 2 x 220 + pod crew people 2 x 500
 57.0  pickup weapon_lance x 360 + radio m2_lance
 61.0  checkpoint + banner CHECKPOINT / Gravity anomaly ahead
# HAZARD 62-93: first black hole
 62.0  hazard black_hole {size small, x 360, y -120, vy 55, life 26}
 63.0  radio m2_bh_warn
 66.0  formation ring_in gnat ×10 x 360
 67.5  radio m2_bh_eat
 70.0  formation snake dart ×7 x 140
 72.0  formation snake dart ×7 x 580
 75.0  spawn needler x 360 {hoverY 200}
 78.0  formation rain gnat ×12
 82.0  spawn weaver x 200 + spawn weaver x 520
 88.0  pod civilian people 3 x 300
 92.0  waitClear timeout 12
# PEAK 2 95-131: tugs with captive holes, VIP
 95.0  bg station + scroll 100
 96.0  spawn tug x 240 {hole medium}
 97.0  radio m2_tug
100.0  formation pincer dart ×10
104.0  spawn manta x 520
107.0  formation vee spear ×5 x 360
110.0  spawn tug x 480 {hole medium}
113.0  formation side_stream gnat ×10 {side left}
115.0  formation side_stream gnat ×10 {side right}
118.0  pickup bomb x 240
120.0  pod vip people 1 x 420 vip s2 {vy 70}
121.0  radio m2_vip
124.0  spawn wasp x 200 + spawn wasp x 520
126.0  formation staircase dart ×8 {side left}
130.0  waitClear timeout 16
# BREATHER + FINAL 132-153
132.0  pickup weapon_up x 360 + pod civilian people 4 x 260 + pod civilian people 2 x 460
134.0  radio m2_station
137.0  formation escort_box {leader manta, escort wasp, count 4} x 360
143.0  formation column dart ×6 x 160 + formation column dart ×6 x 560
147.0  spawn needler x 200 {hoverY 240} + spawn needler x 520 {hoverY 240}
148.0  if coop: pod civilian people 3 x 360
152.0  waitClear timeout 12
# BOSS
154.0  pickup repair x 360 + bg boss + scroll 40
155.0  radio m2_boss_warn
157.0  banner WARNING / Gravity siege engine LODESTAR
159.0  boss boss_lodestar
159.1  afterBoss radio m2_win
```

| id | Trigger | Copy |
|---|---|---|
| `m2_open` | 1.5 s | [anvil] Kerr Station is breaking up. Clear a path for the lifeboats. |
| `m2_spears` | 14 s | [sparrow] Spears lock on, then ram. When the nose glows red, sidestep! |
| `m2_needlers` | 27 s | [socket] Snipers. See the red line? That's where the shot goes. Don't be there. |
| `m2_weaver` | 42 s | [sparrow] Weaver! Spiral guns. Circle with the spiral, not against it. |
| `m2_eye` | 53 s | [anvil] That's Kerr's Eye ahead. A black hole on a leash. Stay sharp. |
| `m2_lance` | 57 s | [socket] Lance chip! A beam that cuts through everything in a line. Try it. |
| `m2_bh_warn` | 63 s | [socket] Gravity well! It pulls you in. Don't focus near it, you'll lose speed. |
| `m2_bh_eat` | 67.5 s | [sparrow] Ha! It ate their drones. Bullets bend around it too. Use that. |
| `m2_tug` | 97 s | [anvil] Tug ship towing a black hole. Kill it and the hole drifts loose. |
| `m2_vip` | 121 s | [anvil] VIP pod falling toward that hole. Grab it before the horizon does! |
| `m2_station` | 134 s | [sparrow] Lifeboats are clear of the station. Nice flying, {callsign}! |
| `m2_boss_warn` | 155 s | [anvil] Big signature on the leash end. The siege engine. Cut it loose. |
| `m2_boss_intro` | `bossIntroDone` | [vael] LODESTAR holds a dying star. Let it hold you too. |
| `m2_boss_p2` | phase 2 | [osei] Its pull is climbing! Fly at full speed, it can't hold a fast ship. |
| `m2_boss_p3` | phase 3 | [socket] Containment's failing. The hole's growing. Finish it fast. |
| `m2_win` | afterBoss | [anvil] The leash is cut and the Eye is fading. Outstanding work, {callsign}. |

`m2_boss_p2` uses `osei` only when Dr. Osei was rescued this run (`session.flags.vip_s2`); otherwise the
same copy plays from `socket`.
