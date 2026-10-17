
## 7. Bullets and patterns

### 7.1 Readability and fairness rules

- Enemy bullets are white-hot at the core with a saturated halo (pink `#ff4fd8`, orange `#ff8a3d`,
  violet `#b26bff`, red `#ff3b4f`) and draw above everything except hazard overlays. Halos are cached
  sprites per type and color.
- Size tells damage: small (s) bullets are r ≤ 6, medium (m) r 8-12, large (l) r ≥ 16.
- No enemy bullet spawns within 120 px of a living player. A new enemy may not fire aimed shots during
  its first 0.6 s on screen. Bullets slower than 100 px/s must be large (`orb_huge`, `flare`, `mine`).
- Every burst of 5 or more bullets is preceded by a 0.3-0.6 s charge glow on its emitter.
- Warning lines (beams, dashes, snipers, harpoons) are 2 px, `#ff3b4f` at alpha 0.45, pulsing at 6 Hz,
  and flash white for the final 0.15 s. Area strikes use a dashed ring. Off-screen threats use a red edge
  glow on the side they come from.
- Soft cap: above 520 enemy bullets, `spiral`, `stream` and `rain_curtain` halve their emission rate.

### 7.2 Enemy bullet types

| id | Look | r | Damage | Behavior |
|---|---|---|---|---|
| `orb` | Round, white core r 3, pink halo (color option) | 6 | s | Straight. The workhorse. |
| `orbBig` | White core r 5, orange halo, faint outer ring | 11 | m | Straight, often slower (120-200). |
| `orb_huge` | White core r 9, red halo, outer ring pulsing at 3 Hz | 20 | l | Slow (80-140), used as landmarks and split carriers. |
| `needle` | Capsule 4 × 22 along velocity, white core, violet edge | 4 | s | Fast (300-620). Snipers, streams, fans. |
| `shard` | Spinning diamond 8 × 14, white core, orange halo | 6 | s | Straight; split product of `flare`. |
| `mine` | Dark sphere r 10, blinking pink light ring | 10 | m | Decelerates to 0 over 0.4 s, arms after 0.5 s; a player within 90 px makes it pop into a `ring` of 8 `orb` (160 px/s) after 0.3 s. One player hit destroys it without the ring. Lives 6 s, then fizzles. |
| `missile` | Body 8 × 20, steel nose, orange exhaust trail | 8 | m | 150 → 260 px/s (accel 140), homing 1.6 rad/s for 2.5 s, then straight. Shootable: 10 HP, +20 score. |
| `spark` | 3-segment jagged bolt, white core, violet halo | 5 | s | Straight with ±18 px lateral jitter at 12 Hz. Ion attacks. |
| `petal` | Teardrop, white core, pink-to-violet gradient | 6 | s | Curves with constant `turn` (±0.9 rad/s) for 1.2 s, then straight. |
| `flare` | Flickering fireball, white-yellow core, orange-red corona | 16 | l | Slow (110-130); usually splits (`split`) into `shard`. |
| `void_orb` | Dark core, violet rim, white pinpoint, faint lens shimmer | 8 | m | Gravity coupling 2.5: black holes bend it 2.5× harder than other bullets. |
| `beam` | Core enemy beam restyled: white core, pink edges, crackling edge sparks | width | 45/s | Telegraph line first (section 6.8 of ARCHITECTURE). |

Normal enemy bullets have gravity coupling 0.5 (black holes bend them half as hard as they pull the
player); player bullets have coupling 0.35.

### 7.3 Pattern library

All patterns live in `SL.patterns`, take `(src, ..., opts)` and return the bullets fired. Counts marked
"×fireRate" scale with `SL.game.diff.fireRate × mission.tune.fireRate` (rounded, never below 60% of base).

| id | Description | Parameters (defaults) |
|---|---|---|
| `aimed` | N bullets centered on the target. | count 1, spread 0.18 × (n−1), speed 240, type `orb` |
| `aimed_burst` | `aimed` repeated `shots` times; re-aims each shot unless `lock`. | count 1, shots 3, gap 0.12, speed 230, lock false |
| `fan` | N bullets across `spread` around `angle`. | count 5, spread 0.9, speed 220, angle 90° |
| `ring` | N bullets evenly around 360°. | count 12 ×fireRate, speed 180, offset 0 |
| `ring_stagger` | Rings that alternate a half-gap offset each volley. | count 12 ×fireRate, speed 150, every 2.2 |
| `spiral` | Continuous emission from rotating arms, on/off duty cycle. | arms 3, rate 9/s per arm ×fireRate, spin 1.4 rad/s, speed 170, on 2.0, off 1.2 |
| `double_spiral` | Two spirals spinning opposite ways (lattice of crossings). | arms 2 + 2, rate 8/s, spin ±1.2, speed 160 |
| `stream` | Fast line of bullets, slow tracking. | rate 12/s, duration 1.0, speed 320, track 0.6 rad/s, type `needle` |
| `wave` | Fan whose bullets weave sideways. | count 7, spread 1.0, speed 180, amp 40, freq 1.2 |
| `flower` | Petals curving alternately left/right into a flower. | count 16 ×fireRate, speed 150, turn ±0.9, type `petal` |
| `wall_gap` | Horizontal wall with a gap at the target's x. | count 14, spacing 52, gap 104 px, speed 140 |
| `rain_curtain` | Bullets falling from the top edge in columns with moving safe lanes. | rate 14/s, duration 3, speed 220 ± 40, type `shard`, safeLanes 2 (90 px), laneShift 1.5 s |
| `lattice` | Two sets of diagonal lines crossing into diamond safe cells. | lines 6 per side, angle ±0.5 rad from down, spacing 120, speed 160 |
| `pinwheel` | Straight streams from a rotating emitter: rotating spokes. | arms 4, spin 0.9 rad/s, rate 10/s per arm, speed 200 |
| `orbit_release` | Bullets orbit the source, then release outward or aimed. | count 16, radius 120, orbit 1.2 s, spin 2 rad/s, release `aimed`, speed 200 |
| `homing_salvo` | Missiles kicked outward, then homing. | count 2, kick 120, type `missile` |
| `split_shot` | Big bullets that split after a delay. | type `flare`, count 5, spread 0.9, speed 120, at 1.2, split {count 6, type `shard`, speed 180} |
| `sniper_line` | Tracking sight, lock, then fast needles. | track 1.0, lock 0.25, shots 1, gap 0.08, speed 620 |
| `beam` | Core enemy beam with telegraph. | width 26, telegraph 0.8, duration 1.2, follow false |
| `beam_sweep` | Beam that sweeps an arc while active; telegraph shows the start line plus a curved arrow. | from, to (rad), width 30, telegraph 0.9, duration 1.6 |
| `cross_beams` | Four beams in a rotating cross. | arms 4, spin 0.5 rad/s, width 22, telegraph 1.0, duration 6 |
| `mine_lay` | Drops mines behind the source. | every 0.7, type `mine` |
| `gravity_sling` | `void_orb`s thrown tangentially around a gravity source; they slingshot out toward the players. | count 8, speed 200, source (hole), dir ±1 |

## 8. Bosses

Common rules for every boss and mini-boss:
- HP below is Pilot solo; it scales with `diff.enemyHp` (and ×1.35 in co-op). The boss bar is one bar;
  parts are damage zones on the boss. Damage dealt to a part also comes off the bar; a part also has its own
  "part HP". When part HP reaches 0 the part breaks (its attacks stop, debris falls) and the bar takes a
  break bonus.
- **Phase break:** at each threshold the boss is invulnerable for 1.5 s, flashes white, sheds armor
  debris, emits `bossPhase`, and every enemy bullet on screen turns into credit sparks ("PHASE BREAK"
  +2,000 × multiplier). This is the built-in breather between phases.
- Intro: 3-4 s, invulnerable, music switches to the boss track, the HUD shows the name, title and bar.
- **Time bonus:** 500 × max(0, target − fight seconds), target 90 / 100 / 110 / 120 / 140 s for m1-m5
  and 60 s for mini-bosses.
- Death: about 3 s (m5: 4.5 s) of slow-mo and chained explosions, `clearEnemyBullets({toCredits:true})`,
  then `SL.game.bossDefeated(b)`.
- Weak points flash briefly with a yellow-white hit marker so players learn where to aim.

### 8.1 `boss_razorback`: RAZORBACK, "Nyx Assault Carrier" (m1)

- **Look (560 × 380):** a wedge-shaped carrier pointing down. Graphite hull with heavy specular bands,
  panel lines, and pink running lights blinking along the wing edges. A dorsal spine of 6 serrated fins
  (each 40 × 70) runs down the centerline; fin edges glow pink when charging. Two wing-root sponsons at
  (±190, −20) carry twin-barrel turrets (r 34) that rotate to aim. A launch bay mouth (120 px wide) sits at
  the prow tip with a hot orange interior. Four big engines at the rear (top) with upward plumes.
- **HP:** 9,000. Thresholds: 1.0 / 0.65 / 0.30. Score 50,000.
- **Parts:** `turret_l`, `turret_r` (part HP 1,200, break bonus 400); `bay` (×1.5 damage while open);
  `core` (exposed in phase 3, ×2.0).
- **Intro (4 s):** its shadow crosses the dust, then it descends from y −300 to y 230 in 3 s; engines
  roar, turrets swivel onto the player.
- **Phase 1, Broadside (100-65%).** Movement: sway ±80 px at 0.15 Hz.
  - Turret bursts: `aimed_burst` 3 `orb` at 250 px/s, 0.12 s apart, the two turrets alternating every
    1.2 s. Telegraph: barrel glow 0.3 s. Counter: one sidestep per burst.
  - Bay launch: the bay opens (0.6 s glow) and launches a `vee` of 4 gnats every 7 s; the bay takes ×1.5
    for the 1.5 s it is open. Counter: park under the bay and burst it.
  - Prow fan: `fan` of 7 `orbBig` at 180 px/s, spread 1.0, every 3.5 s.
- **Phase 2, Spine Lance (65-30%).** Movement: strafes ±200 px over 6 s.
  - Fin sweep: the 6 fins light one after another (0.15 s each, 0.9 s total), then fire in the same order,
    each a `fan` of 3 `needle` at 380 px/s (spread 0.3): a curtain sweeping left to right (alternates
    direction each time), every 4 s. Counter: go to the side that fires first, as soon as it has fired.
  - `ring_stagger` from the bay: two rings of 14 `orb` at 170 px/s, 0.5 s apart, every 3.5 s.
  - Surviving turrets keep bursting, every 1.6 s.
- **Phase 3, Open Bay (30-0%).** The spine plates blow open and expose the core.
  - `beam_sweep` from the core: telegraph 0.9 s (line plus arrow), sweep 70° in 1.6 s, width 34,
    alternating direction, every 6 s. Counter: stand where the sweep ends and slip behind the start line
    once it passes.
  - Between beams: `spiral` 2 arms, 10/s per arm, 180 px/s, spin 1.6, 2.5 s on, 1.5 s off.
  - Below 10%: spin 2.2 and an aimed `orbBig` every 1.0 s.
- **Death:** slow-mo 0.35 for 1.2 s; six `m` explosions run down the spine; turrets tear off and tumble
  away; the core implodes (white flash, shockwave r 400 with ripple), then `boss` explosion; 30 `credit`
  + 4 `credit_big`.
- **Music:** `boss_theme`.

### 8.2 `boss_lodestar`: LODESTAR, "Gravity Siege Engine" (m2)

- **Look (440 × 440):** a ring of 12 graphite armor segments (outer diameter 420, 70 px thick) with pink
  seams between segments and 8 violet containment emitters on the inner rim. Four anchor pylons (60 × 110,
  violet coil tips) stand out at the diagonals. In the center floats a captive black hole: horizon r 34,
  an orange-white accretion swirl (two counter-rotating noise rings), and a thin bright photon ring.
  `SL.render.addLens(cx, cy, horizon, 1.0)` every frame; without distortion it draws a black disc, the
  photon ring and a dark radial falloff.
- **HP:** 16,000. Thresholds: 1.0 / 0.70 / 0.40. Score 70,000.
- **Gravity:** its hole pulls players at 700 px/s² (radius 560), 1,000 in phase 2, 1,400 in phase 3.
  Bullets bend by their coupling. Player shots that cross the horizon are swallowed, so aim at the ring.
  Horizon contact: 18 damage every 0.5 s.
- **Parts:** `pylon_ne`, `pylon_nw`, `pylon_se`, `pylon_sw` (part HP 1,500, break bonus 400). Each broken
  pylon silences its attacks and lowers the pull by 10%. The hole itself cannot be hit.
- **Intro (4 s):** the ring descends to y 300 while spinning up; the hole flares; the lens grows from 0
  to full over 2 s and nearby stars bend.
- **Phase 1, Orbit (100-70%).** The ring rotates at 0.3 rad/s.
  - Pylon rings: each pylon in clockwise order (0.6 s apart) fires a `ring` of 8 `orb` at 170 px/s after a
    0.4 s tip flare; the cycle repeats every 4 s.
  - `orbit_release`: 16 `void_orb` appear around the hole at r 110, orbit for 1.2 s, then release aimed
    at 200 px/s, bending as they leave. Every 6 s. The orbiting bullets are their own telegraph.
- **Phase 2, Undertow (70-40%).**
  - Twin beams: the NE and SW pylons fire `beam_sweep` (width 28) inward-down, each sweeping 60° in 2.0 s
    after a 1.0 s telegraph. Every 7 s.
  - `rain_curtain` of `shard` from the ring's lower edge (12/s for 2.5 s, 2 safe lanes); the shards bend
    toward the hole, so the lanes curve. Counter: follow the lane's curve, not a straight line.
  - `gravity_sling`: 8 `void_orb` thrown tangentially at 220 px/s; they loop the hole and come out toward
    the players. Every 5 s.
- **Phase 3, Collapse (40-0%).** Containment fails: horizon grows from 34 to 52 over 2 s.
  - Gravity pulse every 6 s: a violet ring contracts from r 600 into the hole for 1.0 s (telegraph,
    rumble), then the pull spikes to 2,000 px/s² for 1.2 s. Counter: full speed away, never focus.
  - `double_spiral` from the ring, 4 arms at 160 px/s; bullets that bend into the horizon vanish.
  - Below 15% segments break off and fall as debris props that block bullets.
- **Death:** segments spiral into the hole one by one (2 s); the hole swells, then pops in a white flash
  with a huge ripple (r 700), and the lens vanishes; slow-mo 0.3.
- **Music:** `boss_theme`.
