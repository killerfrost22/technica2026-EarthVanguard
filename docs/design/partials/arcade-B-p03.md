
### 4.3 m3: STORMWALL

- **Location:** Tantalus Nebula, inside a permanent ion storm.
- **Palette:** base `#070814`, nebula indigo `#1d2450`, nebula plum `#3a1f4d`, storm cloud `#141a33`,
  sheet lightning `#9fb8ff` (background only, alpha ≤ 0.12), Nyx barge hull `#22202e`.
- **Background:** `bg_tantalus`. L0 gradient `#070814` → `#0d0f22`; L1 dim stars (2 depths, 30% alpha);
  L2 painted nebula (two `noiseCanvas` layers, indigo and plum, alpha 0.5, counter-drifting at 4 px/s);
  L3 storm cloud banks (big soft cloud shapes `#141a33` scrolling at parallax 0.4, internal sheet flashes at
  8% alpha every 2-6 s); L4 near wisps (parallax 1.0, alpha 0.15). The background never draws bright bolts
  under the play area; real lightning is a hazard drawn over it.
- **Set pieces and phases:** `nebula` (0 s); `storm` (27 s and 63 s: clouds darken 15%, sheet flashes
  every 1.5-3 s); `eye` (55 s: the clouds part into a calm circle of stars, scroll 70; far ahead the
  TEMPEST's silhouette crosses the eye once, 600 px long, dark with pink running lights); `boss` (163 s:
  a towering cloud wall at the top, lit from inside). Prison barges (bastions carrying pods) at 64 s and
  110 s.
- **Music:** `m3_theme`; boss `boss_theme_heavy`.
- **Hazards:** `ion_storm` three times (27 s: 2 cells; 82 s: 3 cells mixed with a gunship peak; 152 s: 2
  cells in the final rush). Stormcallers chain lightning between each other, a hazard-flavored enemy.
- **Enemy roster:** gnat, dart, wasp, spear, skimmer, hornet, needler, weaver, manta, stormcaller,
  bastion.
- **Rescue pods:** 8 pods plus 2 barge cargo releases, 20 people. VIP: Captain Vance (`vip s3`), released
  when the second barge (110 s) is destroyed.
- **Boss:** `boss_tempest`. **Target duration:** 4:15. **Rewards:** credit bonus 700, SP 2.

```
# OPENING 0-24: low crossers, missile boats
  0.0  banner STORMWALL / Tantalus Nebula + music m3_theme + scroll 100 + bg nebula
  1.5  radio m3_open
  3.0  formation pincer dart ×10
  6.0  formation vee wasp ×5 x 360
  9.0  spawn skimmer {side left, y 300}
 10.0  radio m3_skimmer
 12.0  spawn skimmer {side right, y 420}
 14.0  formation arc_sweep dart ×8 {side left}
 16.0  formation arc_sweep dart ×8 {side right}
 18.0  spawn hornet x 360 {hoverY 240}
 19.0  radio m3_hornet
 21.0  formation rain gnat ×12
 24.0  waitClear timeout 10
# BUILD 26-54: the storm
 26.0  pickup weapon_up x 360
 27.0  bg storm + hazard ion_storm {cells 2, duration 26, strikeEvery 2.4}
 28.0  radio m3_ion
 31.0  formation snake dart ×8 x 160
 34.0  formation snake dart ×8 x 560
 37.0  spawn stormcaller x 260 + spawn stormcaller x 460
 38.0  radio m3_stormcaller
 42.0  pod civilian people 3 x 360
 44.0  formation side_stream gnat ×10 {side left}
 46.0  spawn hornet x 200 {hoverY 260} + spawn hornet x 520 {hoverY 260}
 49.0  formation staircase wasp ×5 {side right}
 53.0  waitClear timeout 14
# BREATHER 55-62: the eye
 55.0  bg eye + scroll 70 + radio m3_eye
 57.0  pod crew people 2 x 240 + pod civilian people 2 x 480
 59.0  pickup shield x 360
 62.0  checkpoint + banner CHECKPOINT / Prison convoy ahead
# PEAK 2 63-109: first prison barge
 63.0  bg storm + scroll 100
 64.0  spawn bastion x 360 {cargo [civilian 3, civilian 2]}
 65.0  radio m3_bastion
 70.0  formation pincer dart ×12
 74.0  spawn skimmer {side left, y 260} + spawn skimmer {side right, y 360}
 78.0  spawn needler x 140 {hoverY 200} + spawn needler x 580 {hoverY 200}
 82.0  hazard ion_storm {cells 3, duration 24, strikeEvery 2.2}
 84.0  formation vee wasp ×5 x 360
 88.0  spawn weaver x 360
 92.0  formation column gnat ×6 x 120 repeat every 4 count 3
 94.0  formation column gnat ×6 x 600 repeat every 4 count 3
100.0  pickup weapon_up x 360
104.0  spawn manta x 240 + spawn manta x 480
108.0  waitClear timeout 16
# PEAK 3 110-143: the VIP barge
110.0  spawn bastion x 360 {cargo [vip rook s3, crew 2], hp 1.2}
111.0  radio m3_convoy
112.0  spawn stormcaller x 160 + spawn stormcaller x 560
116.0  formation side_stream dart ×10 {side left}
118.0  formation side_stream dart ×10 {side right}
122.0  spawn hornet x 360 {hoverY 220}
126.0  formation rain gnat ×14 + pod civilian people 2 x 200
132.0  pickup bomb x 480
134.0  formation pincer dart ×12
138.0  spawn spear x 200 + spawn spear x 360 + spawn spear x 520
142.0  waitClear timeout 14
# FINAL 144-162
144.0  pickup missile x 360 + pod civilian people 3 x 260
145.0  if coop: pod civilian people 3 x 460
146.0  radio m3_regroup
148.0  formation escort_box {leader weaver, escort wasp, count 4} x 360
152.0  hazard ion_storm {cells 2, duration 14, strikeEvery 2.6}
154.0  formation vee dart ×9 x 360
158.0  spawn needler x 200 {hoverY 230} + spawn needler x 520 {hoverY 230}
161.0  waitClear timeout 12
# BOSS
163.0  pickup repair x 360 + bg boss + scroll 50
164.0  radio m3_boss_warn
166.0  banner WARNING / Storm dreadnought TEMPEST
168.0  boss boss_tempest
168.1  afterBoss radio m3_win
```

| id | Trigger | Copy |
|---|---|---|
| `m3_open` | 1.5 s | [anvil] Their fleet is hiding in the storm. We go in after them. |
| `m3_skimmer` | 10 s | [sparrow] Skimmers crossing low! They drop mines behind them. Don't follow the trail. |
| `m3_hornet` | 19 s | [socket] Missile boat. Its missiles can be shot down. Clip them before they bite. |
| `m3_ion` | 28 s | [socket] Ion cell! Inside it your cannons fire at half rate. Watch for strike rings. |
| `m3_stormcaller` | 38 s | [sparrow] Stormcallers! Lightning jumps between them. Don't fly between the pair! |
| `m3_eye` | 55 s | [anvil] We're in the eye. Quiet for a moment. Grab those pods. |
| `m3_bastion` | 65 s | [anvil] Prison barge. Armored nose. Hit it from the sides and the cells pop open. |
| `m3_convoy` | 111 s | [sparrow] Second barge! That one's carrying our pilots. Crack it open! |
| `m3_vip` | VIP pod released | [rook] Captain Vance here. If anyone's out there, I'd love a lift. |
| `m3_regroup` | 146 s | [anvil] Convoy's clear. Storm wall ahead. Something big is waiting in it. |
| `m3_boss_warn` | 164 s | [anvil] Dreadnought in the storm wall. Big as a city. Light it up. |
| `m3_boss_intro` | `bossIntroDone` | [vael] TEMPEST was born in this storm. You will end in it. |
| `m3_boss_p2` | phase 2 | [socket] It's calling the storm! Watch the strike rings and keep moving. |
| `m3_boss_p3` | phase 3 | [sparrow] The eye's open! That's the core. Everything you've got! |
| `m3_win` | afterBoss | [anvil] TEMPEST is falling and the storm is breaking. Good hunting, {callsign}. |

### 4.4 m4: SUNEATER

- **Location:** Orbit of the blue giant Tarsis, inside the Nyx harvester array.
- **Palette:** base `#04070f`, corona `#4f8dff` (alpha ≤ 0.35 under the play area), plasma filaments
  `#7fb6ff`, mirror glass `#1a2438` with sheen `#8fb3ff`, eclipse moon `#0a0d16`, shade-rock basalt
  `#2b2b33`.
- **Background:** `bg_furnace`. L0 gradient `#04070f` → `#081226`; L1 sparse stars (glare-washed, 40%);
  L2 corona glow (radial gradient centered at (−100, −220), r 900, `#4f8dff` at 0.35 → 0) plus slow corona
  streamers (noise strips rotating 1°/s, alpha 0.2); L3 plasma filaments (thin animated arcs, alpha 0.15);
  L4 harvester mirror array (phase `mirrors`: hexagonal panels 120-200 px wide in `#1a2438` with a moving
  blue specular sheen, parallax 0.45) and a far plasma stream (a bright ribbon from the star to a dark dot,
  the SUNEATER, alpha 0.25).
- **Set pieces and phases:** `corona` (0 s); `eclipse` (56 s: a dark moon slides across the star, all
  corona layers dim 60% over 3 s: no flares during it, a breather the player can feel); `mirrors` (64 s);
  `boss` (168 s: the plasma stream grows thick and feeds the boss). Shade rocks (`prop_shade_rock`) drift
  down whenever flares are active.
- **Music:** `m4_theme`; boss `boss_theme_heavy`.
- **Hazards:** `solar_flare` (26 s: 3 flares 9 s apart; 109 s: 4 flares 7 s apart) with shade rocks for
  cover; `mine_field` (65 s: 18 mines over 30 s). Skimmers add mines during the field.
- **Enemy roster:** gnat, dart, wasp, spear, skimmer, hornet, needler, weaver, manta, stormcaller,
  phantom, bastion, tug. Elite variants (`{elite}`) debut here.
- **Rescue pods:** 8 pods, 20 people (one medical pod of 6). VIP: Ixa (`vip s4`) at 120 s, hunted by two
  phantoms that fire at the pod.
- **Boss:** `boss_suneater`. **Target duration:** 4:30. **Rewards:** credit bonus 850, SP 2.

```
# OPENING 0-22: cloakers
  0.0  banner SUNEATER / Blue giant Tarsis + music m4_theme + scroll 110 + bg corona
  1.5  radio m4_open
  3.0  formation pincer dart ×12
  6.0  formation vee wasp ×5 x 360
  9.0  spawn phantom x 200 + spawn phantom x 520
 10.0  radio m4_phantom
 13.0  formation arc_sweep dart ×10 {side left}
 15.0  formation arc_sweep dart ×10 {side right}
 18.0  spawn hornet x 360 {hoverY 230}
 20.0  formation staircase gnat ×8 {side right}
 22.0  waitClear timeout 10
# HAZARD 24-55: solar flares
 24.0  pickup weapon_up x 360
 25.0  call spawnProp prop_shade_rock x 200 {vy 40} + call spawnProp prop_shade_rock x 520 {vy 40}
 26.0  hazard solar_flare {count 3, every 9, first 4}
 27.0  radio m4_flare
 33.0  formation snake dart ×8 x 160
 36.0  formation snake dart ×8 x 560
 41.0  spawn manta x 360 {elite}
 44.0  pod civilian people 3 x 300
 46.0  formation side_stream gnat ×10 {side left}
 50.0  spawn needler x 140 {hoverY 210} + spawn needler x 580 {hoverY 210}
 54.0  waitClear timeout 12
# BREATHER 56-63: eclipse
 56.0  bg eclipse + scroll 80 + radio m4_eclipse
 58.0  pod medical people 6 x 360 + pod crew people 2 x 560
 60.0  pickup shield x 360
 63.0  checkpoint + banner CHECKPOINT / Mine field ahead
# PEAK 2 64-107: mines
 64.0  bg mirrors + scroll 100
 65.0  hazard mine_field {count 18, duration 30, drift 50}
 66.0  radio m4_mines
 70.0  formation pincer dart ×12
 74.0  spawn bastion x 360 {elite}
 78.0  spawn skimmer {side left, y 300} + spawn skimmer {side right, y 420}
 82.0  spawn phantom x 200 + spawn phantom x 360 + spawn phantom x 520
 86.0  spawn weaver x 200 + spawn weaver x 520
 90.0  pickup weapon_up x 360
 92.0  formation rain gnat ×16
 96.0  pod civilian people 3 x 260 + pod civilian people 2 x 460
100.0  spawn hornet x 240 {hoverY 240} + spawn hornet x 480 {hoverY 240}
106.0  waitClear timeout 16
# PEAK 3 108-149: flares again, the defector
108.0  call spawnProp prop_shade_rock x 360 {vy 35, size large}
109.0  hazard solar_flare {count 4, every 7, first 3}
110.0  radio m4_defector
112.0  formation arc_sweep wasp ×6 {side left, elite}
116.0  formation arc_sweep wasp ×6 {side right, elite}
120.0  pod vip people 1 x 300 vip s4 + spawn phantom x 160 {hunt pod} + spawn phantom x 560 {hunt pod}
121.0  radio m4_vip
126.0  spawn stormcaller x 260 + spawn stormcaller x 460
130.0  formation column dart ×6 x 120 repeat every 4 count 3
132.0  formation column dart ×6 x 600 repeat every 4 count 3
136.0  pickup bomb x 360
140.0  spawn tug x 360 {hole small}
144.0  pod civilian people 3 x 520
148.0  waitClear timeout 16
# FINAL 150-167
150.0  pickup missile x 360 + radio m4_regroup
152.0  formation escort_box {leader bastion, escort phantom, count 4} x 360
158.0  formation pincer dart ×14
162.0  if coop: pod civilian people 3 x 360
166.0  waitClear timeout 12
# BOSS
168.0  pickup repair x 360 + bg boss + scroll 40
169.0  radio m4_boss_warn
170.5  banner WARNING / Stellar harvester SUNEATER
172.0  boss boss_suneater
172.1  afterBoss radio m4_win
```

| id | Trigger | Copy |
|---|---|---|
| `m4_open` | 1.5 s | [anvil] Tarsis is bleeding light and they're bottling it. Stop them. |
| `m4_phantom` | 10 s | [sparrow] Phantoms! They cloak. Shoot when you see the shimmer, not before. |
| `m4_flare` | 27 s | [socket] Flare coming! When the edge goes white, get in a rock's shadow. Now! |
| `m4_eclipse` | 56 s | [anvil] A moon is crossing the star. No flares for a moment. Breathe. |
| `m4_mines` | 66 s | [socket] Mine field. Shoot one and it blows its neighbors. Chain them into jets. |
| `m4_defector` | 110 s | [anvil] Nyx pod on our band, sending surrender codes. Their own jets want it dead. |
| `m4_vip` | 121 s | [ixa] Human pilot. I am Ixa. I carry the foundry codes. Please. Catch me. |
| `m4_regroup` | 150 s | [sparrow] Harvester dead ahead. That thing is drinking the sun. |
| `m4_boss_warn` | 169 s | [anvil] Stellar harvester, dead ahead. Its mirrors bounce sunlight. Read the lines. |
| `m4_boss_intro` | `bossIntroDone` | [vael] SUNEATER drinks a star. You are a much smaller meal. |
| `m4_boss_p2` | phase 2 | [socket] Beams bounce off those mirrors. Follow the warning line to the end! |
| `m4_boss_p3` | phase 3 | [anvil] It's going nova! Get behind the falling mirrors when the white comes! |
| `m4_win` | afterBoss | [anvil] SUNEATER is dark and Tarsis is safe. Next stop, their front door. |
