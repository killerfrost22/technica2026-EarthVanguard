
### 4.2 m2 Gravity Well
- **Location.** Port Meridian: a mining colony built through a cluster of hollowed asteroids, now falling
  into the first black hole the Armada ever opened on a world.
- **Palette.** Space `#06050d`, violet dark `#1a1230`, dusty teal `#173238`, rock `#3b3540`, mining lamps
  `#ffcf8a`, accretion glow `#ffb36b` (only on hazards and the far set piece, never under bullets).
- **Background `bg_meridian`.**
  1. Gradient `#06050d` to `#1a1230`; two star layers (0.05, 0.14); stars stretch into short arcs during the
     `collapse` phase (tangential streaks around the far hole).
  2. Far black hole "the Meridian well" (0.01, phase `collapse` and later): a black disc 140 px at the top
     center with a thin orange-white photon ring `#ffe2b8` and a tilted accretion disc (two ellipses of
     additive fbm streaks `#ffb36b` to `#ff6a3d`, rotating 0.15 rad/s). Purely painted, no gameplay.
  3. Dust nebula (0.06): noise canvas in `#173238` / `#2a1a4a`, alpha 0.4.
  4. Asteroid colony (0.3): hollow rocks with lit windows, gantries, mining towers with red tip lights.
  5. Debris streams (0.9): small rock chips sliding slowly toward the far hole (phase `collapse`).
- **Set pieces and phases.**
  - `colony` (0-60 s): towers standing, lamps lit, freighters lifting off.
  - `collapse` (62-130 s): towers tilt and break toward the top of the screen, rock chips stream upward,
    the background stars lens around the far hole (`addLens` at (360, -60), radius 0, strength 0.35, cosmetic).
  - `lotus` (boss): the sky turns violet `#2a1446`; the Black Lotus descends, petals closed.
- **Music.** `mus_m2`; boss `mus_boss1`.
- **Hazards.** `blackhole`, the debut: a small teaching hole at 36 s (weak pull), then a medium hole at 95 s
  with Dr. Sol's pod falling toward it. The `siphon` enemy carries its own small pull field.
- **Enemies.** `dart`, `mite`, `wasp`, `raptor`, `scythe`, `gyre`, `siphon`, `bulwark`, `snatcher`.
- **Wave script.**
```
  0  music mus_m2 · scroll 110 · bg colony
  1  banner "GRAVITY WELL" / "Port Meridian · Mission 2"
  3  radio m2_open
  5  formation vee dart x6 @360
  9  formation snake mite x12 @200
 10  radio m2_mites
 14  pod civ 3 @200
 16  formation side_strafe scythe x3 (from left)
 22  formation pincer dart x8
 26  pod family 5 @480
 28  spawn gyre @360,-80
 34  radio m2_bend
 36  hazard blackhole {x:360, y:380, horizon:24, pull:400, strength:500, life:22, grow:0}
 38  radio m2_bh_tip
 40  formation arc_ring wasp x10 @360 (orbiting the hole)
 46  pod civ 2 @140 (drifts toward the hole)
 50  formation curtain dart x8
 58  waitClear 12
 60  checkpoint
 62  bg collapse · scroll 90
 63  radio m2_collapse
 64  spawn siphon @200,-80
 66  radio m2_siphon
 70  formation snake mite x14 @520
 74  pod pilot 1 @560
 78  formation escort scythe x2 (around a bulwark @360)
 82  pod family 4 @300
 84  spawn snatcher @760,180 snatch
 90  formation vee raptor x5 @360
 95  hazard blackhole {x:520, y:300, horizon:32, pull:520, strength:850, life:40, grow:0}
 96  pod vip 1 @300 vip:s2 who:sol (falls toward the hole; about 18 s to reach the horizon)
 97  radio m2_vip
100  formation pincer scythe x4
104  radio m2_vip_hurry (if the VIP pod is still out)
106  spawn siphon @520,-80
110  formation line_sweep wasp x8 @-40
116  pod civ 3 @180
120  formation curtain mite x16
124  pod family 6 @420
128  waitClear 15
130  checkpoint
131  bg lotus · scroll 50
132  radio m2_boss_warn
135  boss black_lotus
```
- **Rescue pods.** 9 pods, 30 people: civ 3, family 5, civ 2 (falls toward the first hole), pilot 1, family 4
  (snatcher target), VIP Dr. Sol (1, `vip:'s2'`, unlocks s2 Event Horizon), civ 3, family 6, plus a hidden
  family 5 pod that only appears if you clear the 70 s mite snake within 6 s
  (`{at:76, pod:{x:600, people:5, kind:'family'}, if:s=>s.flags.m2_fast_snake}`). Bonus objective needs 25.
- **Radio cues.**
  - `m2_open` · vega · "Meridian's beacons are still on. Somebody's alive down there."
  - `m2_mites` · rook · "Mites. Tiny, dumb and about a thousand of them. My favorite."
  - `m2_bend` · vega · "Gravity spike dead ahead. The stars are bending. Hold on."
  - `m2_bh_tip` · patch · "Black hole! It pulls everything, your lasers too. Stay off the dark middle."
  - `m2_collapse` · vega · "The colony is falling in. Move fast, {callsign}."
  - `m2_siphon` · rook · "That ship is hauling its own little black hole. Rude."
  - `m2_vip` · sol · "This is Dr. Ines Sol! My pod is falling into the well. Please hurry!"
  - `m2_vip_hurry` · sol · "I can see the horizon from here. It's beautiful. I'd rather not touch it!"
  - `m2_boss_warn` · vega · "There's the source. A singularity ship. Cut it down."
- **Boss.** `black_lotus` (section 8.2), 16,000 HP, target 70-80 s.
- **Target duration.** 3:45.
- **Rewards.** Completion 500 credits, 1 SP. Unlocks `m3`; `s2` if Dr. Sol was rescued.
