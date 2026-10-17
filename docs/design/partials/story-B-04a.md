
## 4. Main missions

**Wave script notation.** One director event per line: `t` (director seconds) then the event, in the
ARCHITECTURE 6.11 vocabulary. `formation vee dart x5 @360` = `{at, formation:'vee', enemy:'dart', count:5,
x:360}`. `spawn bulwark @360,-80` = `{at, spawn:'bulwark', x:360, y:-80}`. `pod family 5 @480` = `{at,
pod:{x:480, y:-40, people:5, kind:'family'}}`. `pod vip 1 @260 vip:s1 who:tamsin` adds `vip:'s1', who:'tamsin'`.
`hazard <id> {...}` passes opts. `drop:<pickup>` on a spawn sets `opts.drop`. `waitClear 12` = `{waitClear:true,
timeout:12}`. `snatch` on a snatcher spawn targets the most recent pod. Times are tuned for Pilot; the director
clock pauses during `waitClear`, `boss` and `choice`, so real durations run 10-20% longer than the numbers.

Every main mission ends with its boss; `boss` holds the clock, and `bossDefeated` completes the mission.
Rewards are first-clear values; replays pay 50% of the completion bonus and no SP (section 15).

### 4.1 m1 First Light
- **Location.** Talos Ring: a ring of docks and habitats around the gas giant Talos, mid-evacuation.
- **Palette.** Space `#05070f`, deep blue `#0f1a33`, Talos bands `#c98a5a` / `#8a5236` / `#5a3426`
  (kept below 40% value under the playfield), ring metal `#4a5468`, dock lights `#ffcf8a`, fire glow `#ff7a3d`.
- **Background `bg_talos`.** Layers, back to front (parallax factor x scroll):
  1. Gradient `#05070f` to `#0f1a33`, three star layers (0.04, 0.10, 0.22; 220/120/60 stars, sizes 1-2.5 px,
     twinkle 0.3-1.2 Hz).
  2. Gas giant Talos (0.02): a 1100 px circle centered off-screen right (x 980, y 520) with 14 horizontal
     fbm-warped bands, a storm eye `#e0a070` at 30% alpha, terminator shadow on the right, thin blue
     atmosphere rim `#6fa8ff`.
  3. Nebula wisps (0.07): fbm noise canvas 720x2048 in `#1b2a55` / `#2c1f4a`, alpha 0.35.
  4. Talos Ring (0.35): curved truss arcs crossing the screen diagonally every 1400 px, docks with blinking
     lights `#ffcf8a`, habitat windows, tiny shuttles (white 6x14 px with cyan trails) streaming upward.
  5. Foreground girders (1.3): dark silhouettes `#0b0e18` at 70% alpha sliding past the edges, never over
     the central 70% of the screen.
- **Set pieces and phases.**
  - `launch` (0-4 s): the *Halcyon*'s flight deck (gray plating `#3a4256`, yellow deck stripes `#ffcf5a`,
    blue runway lights) scrolls away under the jet as it rises; catapult steam particles.
  - `dock` (4-50 s): intact ring, shuttles fleeing, distant orange explosions on the ring every 6-9 s.
  - `ring_break` (50-120 s): ring segments split, rotate slowly and drift; sparking cables; habitat windows
    flicker out in sequence.
  - `carrier_shadow` (boss): the Gravewing's bulk darkens the top of the screen (multiply 0.8), red warning
    strobes on ring wreckage.
- **Music.** `mus_m1`; boss `mus_boss1`.
- **Hazards.** `asteroid_storm` from 54 s to 84 s at intensity 1 (ring debris and moonlet rocks; section 9.2).
  It teaches "shoot the big ones, dodge the small ones" before any black hole appears.
- **Enemies.** `dart`, `wasp`, `raptor`, `bulwark`, `snatcher`.
- **Wave script.**
```
  0  music mus_m1 · scroll 120 · bg launch
  1  banner "FIRST LIGHT" / "Talos Ring · Mission 1"
  3  radio m1_open
  4  bg dock
  6  formation vee dart x5 @360
 10  formation vee dart x5 @200
 12  formation vee dart x5 @520
 14  radio m1_tip_move
 17  formation line_sweep wasp x6 @-40 (left to right, y 220)
 21  pod civ 2 @300
 22  radio m1_tip_pod
 25  spawn raptor @200,-60 drop:weapon_pulse
 25  spawn raptor @520,-60
 27  radio m1_rook_join
 30  radio m1_tip_power
 32  formation pincer dart x8
 36  pod family 5 @480
 38  formation side_strafe raptor x3 (from right)
 44  formation snake wasp x8 @120
 48  waitClear 12
 49  checkpoint
 50  bg ring_break · scroll 100
 52  radio m1_rocks
 54  hazard asteroid_storm {intensity:1, duration:30}
 58  formation vee dart x7 @360
 62  pod civ 3 @180
 64  spawn bulwark @360,-100
 65  radio m1_bulwark
 72  pod pilot 1 @600
 74  formation curtain dart x8
 80  pod family 4 @360
 82  spawn snatcher @-40,200 snatch
 83  radio m1_snatcher
 88  formation escort raptor x2 (around a bulwark @360)
 94  pod vip 1 @260 vip:s1 who:tamsin
 95  radio m1_vip
100  formation arc_ring wasp x10 @360
104  pickup weapon_lance @360
105  radio m1_lance
108  formation column_dive raptor x4
112  pod family 6 @520
114  formation pincer dart x10
120  pod civ 3 @160
122  formation vee raptor x5 @360
126  pod civ 3 @420
128  waitClear 15
130  checkpoint
131  bg carrier_shadow · scroll 60
132  radio m1_boss_warn
135  boss gravewing
```
- **Rescue pods.** 9 pods, 28 people: civ 2, family 5, civ 3, pilot 1 (hands you a bomb), family 4 (snatcher
  target), VIP Captain Tamsin (1, `vip:'s1'`, unlocks s1 Lantern Run), family 6, civ 3, civ 3.
  Bonus objective `m1_obj_rescue` needs 20.
- **Radio cues.**
  - `m1_open` · vega · "Halcyon to {callsign}. Darts on the docks. Weapons free."
  - `m1_tip_move` · patch · "She fires on her own. Hold focus to slow down and see your hitbox."
  - `m1_tip_pod` · vega · "Escape pod on scope. Fly over it to pull them aboard."
  - `m1_rook_join` · rook · "Rook on your wing. Kill bet's on. Loser buys the coffee."
  - `m1_tip_power` · patch · "That raptor dropped a power cell. Grab it. More lasers, same pilot."
  - `m1_rocks` · vega · "The ring is breaking up. Shoot the big rocks, dodge the small ones."
  - `m1_bulwark` · rook · "Bulwark gunship. Big, slow and ugly. Like Patch's coffee."
  - `m1_snatcher` · vega · "That drone is grabbing the pod! Shoot it before it drags them off."
  - `m1_vip` · tamsin · "This is Captain Tamsin of the Lantern. My shuttle is gone. Anyone?"
  - `m1_lance` · patch · "Lance cell! It's a beam. It goes through things. Through lots of things."
  - `m1_boss_warn` · vega · "Big contact. That's the carrier launching those darts. Take it apart."
- **Boss.** `gravewing` (section 8.1), 9,000 HP, target 60-70 s.
- **Target duration.** 3:30 (135 s of waves plus waits, about 70 s of boss).
- **Rewards.** Completion 400 credits, 1 SP. Unlocks `m2`; `s1` if Tamsin's pod was rescued.
