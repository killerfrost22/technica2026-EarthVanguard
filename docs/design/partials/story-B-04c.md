
### 4.3 m3 Stormglass
- **Location.** The Ionis Nebula: a blue-black storm nebula full of "stormglass", huge glassy crystal shards
  that conduct lightning. The Armada staging fleet hides in its eye.
- **Palette.** Space `#040a14`, storm navy `#0e2a44`, cloud slate `#1d3550`, crystal teal `#2f6f7a`
  (highlights only), lightning white-violet `#d6e6ff` / `#8f7bff`, Armada running lights `#ff2f6d`.
- **Background `bg_ionis`.**
  1. Gradient `#040a14` to `#0e2a44`; one sparse star layer (0.05), mostly hidden by cloud.
  2. Deep cloud banks (0.06): two fbm noise canvases (scale 0.004, 5 octaves) in `#0e2a44` / `#1d3550`,
     scrolled at slightly different speeds to churn.
  3. Sheet lightning (0.06): every 4-9 s a random cloud region brightens (+12% value, 0.25 s, cosmetic,
     no sound beyond a distant `thunder_far`); never brighter than 40% value.
  4. Stormglass crystals (0.4): translucent hexagonal shards 60-220 px, dark teal body, thin bright edge
     lines, an internal refraction streak that slides as they rotate (0.1-0.3 rad/s).
  5. Fog wisps (1.1): soft low-alpha cloud tufts at the edges.
- **Set pieces and phases.**
  - `calm` (0-41 s): quiet clouds, crystals drifting.
  - `storm` (42-86 s): clouds darken, sheet lightning doubles, crystals hum (`crystal_hum` loop, quiet).
  - `fleet` (88-132 s): Armada capital-ship silhouettes in the far cloud (long dark hulls with rows of
    crimson lights), shuttles docking; one explodes when the test singularity opens.
  - `eye` (boss): a calm circular clearing with a ring of stormglass pillars; lightning crawls between them.
- **Music.** `mus_m3`; boss `mus_boss2`.
- **Hazards.** `ion_storm` from 44 s to 84 s (intensity 1, telegraphed strike lines), and an Armada test
  `blackhole` from 100 s to 130 s. The boss Tempest calls the storm in its later phases.
- **Enemies.** `raptor`, `shade`, `dart`, `hornet`, `mite`, `scythe`, `bulwark`, `wasp`, `basilisk`,
  `harrier`, `snatcher`.
- **Wave script.**
```
  0  music mus_m3 · scroll 100 · bg calm
  1  banner "STORMGLASS" / "Ionis Nebula · Mission 3"
  3  radio m3_open
  5  formation vee raptor x5 @360
  9  spawn shade @200,-40 · spawn shade @520,-40
 10  radio m3_shade
 14  formation pincer dart x10
 18  pod civ 3 @300
 20  formation side_strafe hornet x2 (from right)
 21  radio m3_hornet
 26  formation snake mite x14 @160
 30  pod family 5 @480
 32  spawn shade x3 @180,360,540
 36  formation escort scythe x2 (around a bulwark @360)
 40  waitClear 12
 41  checkpoint
 42  bg storm
 43  radio m3_storm
 44  hazard ion_storm {intensity:1, duration:40}
 47  radio m3_ion_tip
 48  formation curtain dart x8
 52  pod pilot 1 @140
 54  formation arc_ring wasp x10 @360
 58  pod civ 2 @560
 60  spawn basilisk @360,-200
 61  radio m3_basilisk
 66  pod family 4 @300
 68  spawn snatcher @760,240 snatch
 72  formation vee harrier x3 @360
 73  radio m3_harrier
 78  formation pincer scythe x4
 80  pod civ 3 @200
 84  waitClear 15
 86  checkpoint
 88  bg fleet
 89  radio m3_fleet
 90  formation line_sweep raptor x6 @760 (right to left, y 260)
 94  pod civ 3 @420
 96  spawn hornet @200,-60 · spawn hornet @520,-60
100  hazard blackhole {x:200, y:340, horizon:28, pull:460, strength:750, life:30}
101  radio m3_test_hole
104  formation snake mite x14 @560
110  pod vip 1 @560 vip:s3 who:wraith (black pod, white beacon)
110  formation side_strafe harrier x2 (from left; they fire on the VIP pod first)
111  radio m3_vip_rook
113  radio m3_vip_vega
116  pod family 4 @240
118  spawn shade x3 @160,360,560
122  pod family 6 @420
126  formation curtain dart x10
130  waitClear 15
132  checkpoint
133  bg eye · scroll 40
134  radio m3_boss_warn
137  boss tempest
```
- **Rescue pods.** 10 pods, 32 people: civ 3, family 5, pilot 1, civ 2, family 4 (snatcher target), civ 3,
  civ 3, VIP Wraith (1, `vip:'s3'`; the two harriers that enter with it aim at the pod, not at you, until
  it is rescued or destroyed), family 4, family 6. Bonus objective needs 25.
- **Radio cues.**
  - `m3_open` · vega · "Visibility is gone. Trust your scope, {callsign}."
  - `m3_shade` · rook · "Shades. They blink in, shoot and blink out. Watch for the shimmer."
  - `m3_hornet` · patch · "Hornets carry seeker missiles. Shoot the missiles. They pop."
  - `m3_storm` · vega · "Ion storm building. Watch for thin blue lines. That's where it strikes."
  - `m3_ion_tip` · patch · "Lightning fries shields first. Stay off the lines and she'll be fine."
  - `m3_basilisk` · rook · "Basilisk cruiser! Pop the turrets first, then go for the bridge."
  - `m3_harrier` · rook · "Armada aces. They dodge. I hate it when they dodge."
  - `m3_fleet` · vega · "There's the staging fleet. Hit them while they're still docked."
  - `m3_test_hole` · vega · "They're test-firing a singularity. Keep clear of it."
  - `m3_vip_rook` · rook · "That's an Armada pod. Let it burn."
  - `m3_vip_vega` · vega · "Its beacon is white. That's a surrender. Bring it in, {callsign}."
  - `m3_boss_warn` · vega · "Storm's eye ahead. Something huge is drinking the lightning."
- **Boss.** `tempest` (section 8.3), 22,000 HP, target 85-95 s.
- **Target duration.** 4:00.
- **Rewards.** Completion 600 credits, 2 SP. Unlocks `m4`; `s3` if Wraith was rescued.

### 4.4 m4 Crown of Fire
- **Location.** The Pyre Star: a swollen, dying red giant. Armada siphon towers pull rivers of plasma off its
  surface and pipe them to the battleship Sunbreaker, which charges the Maw.
- **Palette.** Space `#0a0406`, ember dark `#2a0c08`, corona `#7a2410` (far, low value), plasma rivers
  `#ff9a3d` / `#ffd27a` (only at the screen edges and far layer), ash rock `#2d2526`, mine red `#ff3b4f`.
- **Background `bg_pyre`.**
  1. Gradient `#0a0406` to `#2a0c08`; one star layer (0.05) washed out near the star.
  2. The Pyre Star (0.015): a colossal disc whose limb fills the bottom-left corner (radius 1600, center at
     (-500, 1900)); fbm granulation in `#5a1a0c` / `#7a2410`, darkened to stay under 40% value; slow-rising
     prominence loops (additive arcs) at its limb.
  3. Plasma rivers (0.05, phase `siphon`): three luminous ribbons arcing from the limb toward the top right,
     made of scrolling noise strips `#ff9a3d` at 30% alpha, kept in the right third of the screen.
  4. Ash asteroids (0.35): dark rocks with glowing cracks `#ff6a3d`. These are cosmetic; the cover rocks used
     against flares are hazard props drawn on layer 3 (section 9.4).
  5. Heat shimmer (post): `addRipple` low-amplitude at the bottom edge during flares.
- **Set pieces and phases.**
  - `corona` (0-74 s): the star's limb, prominences, siphon towers far away.
  - `siphon` (75-138 s): plasma rivers appear; siphon towers pass close, their intake mouths glowing.
  - `battery` (boss): the Sunbreaker's battery sphere glows white-orange at the top; the plasma rivers bend
    into it.
- **Music.** `mus_m4`; boss `mus_boss2`.
- **Hazards.** `solar_flare` five times (left, right, double, right, and in the boss fight) with cover rocks;
  `mine_field` twice (density 1 at 40 s, density 2 at 100 s).
- **Enemies.** `raptor`, `tern`, `scythe`, `mite`, `rookery`, `hornet`, `dart`, `lancet`, `harrier`,
  `bulwark`, `wasp`, `snatcher`. Ally: `ally_rook` (scripted, 76-118 s).
- **Wave script.**
```
  0  music mus_m4 · scroll 100 · bg corona
  1  banner "CROWN OF FIRE" / "Pyre Star · Mission 4"
  3  radio m4_open
  6  formation vee raptor x6 @360
 10  spawn tern @200,-60
 11  radio m4_tern
 16  formation pincer scythe x4
 20  pod civ 3 @480
 22  hazard solar_flare {side:'left', telegraph:2.5}
 23  radio m4_flare_tip
 26  formation snake mite x16 @520
 30  pod family 5 @240
 32  spawn rookery @360,-160
 33  radio m4_rookery
 40  hazard mine_field {density:1, duration:30}
 41  radio m4_mines
 44  formation side_strafe hornet x3 (from left)
 48  pod pilot 1 @600
 50  hazard solar_flare {side:'right', telegraph:2.5}
 54  formation curtain dart x10
 58  pod civ 2 @300
 60  spawn lancet @360,-120
 61  radio m4_lancet
 64  pod family 5 @520
 66  formation escort harrier x2 (around a bulwark @360)
 72  waitClear 15
 74  checkpoint
 75  bg siphon
 76  radio m4_rook_run · call spawnAlly('ally_rook', {x:200, y:1400})
 80  formation vee raptor x7 @360
 84  hazard solar_flare {side:'left', double:true, telegraph:2.5}
 88  pod family 4 @200
 90  spawn tern @160,-60 · spawn tern @560,-60
 96  formation arc_ring wasp x12 @360
100  hazard mine_field {density:2, duration:30}
102  pod civ 3 @420
106  spawn lancet @200,-120 · spawn lancet @520,-120
110  pod civ 3 @160
112  formation pincer harrier x4
118  call rookShotDown() (a lancet beam crosses ally_rook; it explodes, size 'm')
118  radio m4_rook_hit
119  pod vip 1 @360 vip:s4 who:rook
120  spawn snatcher @-40,160 snatch
120  radio m4_rook_pod
124  formation curtain dart x10
128  pod family 6 @520
132  hazard solar_flare {side:'right', telegraph:2.5}
134  pod civ 3 @240
136  waitClear 15
138  checkpoint
139  bg battery · scroll 40
140  radio m4_boss_warn
143  boss sunbreaker
```
- **Rescue pods.** 11 pods, 36 people: civ 3, family 5, pilot 1, civ 2, family 5, family 4, civ 3, civ 3,
  VIP Rook (1, `vip:'s4'`; rescued sets `rook_rescued`, lost sets `rook_captured`), family 6, civ 3.
  Bonus `m4_obj_rescue` needs 30; `m4_obj_vip` "Bring every pilot home" needs the 48 s pilot pod and Rook.
- **Radio cues.**
  - `m4_open` · vega · "The Pyre Star is unstable. When an edge of the screen glows, a flare is coming."
  - `m4_tern` · patch · "Minelayer. Those mines burst into rings. Kill them early or give them room."
  - `m4_flare_tip` · sol · "Flare! Get behind a rock or get out of the light!"
  - `m4_rookery` · rook · "Rookery carrier. It spits darts until you pop the bay."
  - `m4_mines` · vega · "Mine field. They arm when you get close. Shoot them from range."
  - `m4_lancet` · vega · "Beam frigate. When the red line shows, move."
  - `m4_rook_run` · rook · "Rook going in. I'll draw the beams. Try to keep up, {callsign}."
  - `m4_rook_hit` · rook · "I'm hit! I'm hit! Punching out!"
  - `m4_rook_pod` · vega · "Rook's pod is out and a snatcher is on him. Get there first!"
  - `m4_boss_warn` · vega · "Sunbreaker dead ahead. It's drinking the star. Make it choke."
- **Boss.** `sunbreaker` (section 8.4), 30,000 HP, target 95-110 s.
- **Target duration.** 4:20.
- **Rewards.** Completion 700 credits, 2 SP. Unlocks `m5` and `s4` (always; the briefing variant depends on
  `rook_rescued`).
