# weapons: `09_weapons.js`, `10_pickups.js`

Owner: weapons. Numbers are GDD 10.1 to 10.3 and 12 (Pilot, before `SL.game.diff`). Everything below is safe to call
from any module after boot; every function tolerates a missing or dead player.

## Ids

- Player bullet types (`SL.pbulletTypes`): `pulse` (r 7, thick bolts r 9), `spread` (r 6), `missile` (r 6, life 3.2 s,
  homing). All drawn additively with white-hot cores; skins: P1 cyan/white, P2 gold/white, overdrive white-gold.
- Player beams (objects in `SL.world.beams`, `kind` field): `lance` (one per player, `pierce: true`, length 1400) and
  `twin_link` (the co-op tether, `pierce: true`, 60 DPS).
- Pickups (`SL.pickupTypes`): `credit credit_big weapon_up weapon_pulse weapon_spread weapon_lance missile shield bomb
  repair`. Drop tables: `drop_small drop_fighter drop_gunship drop_heavy drop_formation`.
- SFX it plays: `shot_pulse shot_spread lance_loop (loop) missile_launch twin_link (loop) powerup weapon_max shield_up
  repair bomb_pickup credit credit_big`.
- Sprite keys (prefix `wpn:` and `pk:`): `wpn:jet<i>:<frame>` (i 0 Starlance, 1 Sunlance; frames 0-8 = bank -0.35..0.35),
  `wpn:jetglow<i>:<frame>`, `wpn:exhaust<i>`, `wpn:bolt|pellet|flare|muzzle|missile|streak:<skin>`, `pk:<capsule id>`,
  `pk:chip`, `pk:credit:<frame>`, `pk:credit_big:<frame>` (8 spin frames).

## `SL.weapons`

| member | notes |
|---|---|
| `update(p, dt)` | called by core every step: fire primaries (pulse, spread, lance), missiles, Twin Link, cosmetics |
| `drawShip(p, ctx)` | the jet (plumes, hull frame by `p.bank`, trim glow, nav lights, glint, muzzle flashes, damage) |
| `drawJet(ctx, {index, x, y, bank, throttle, scale, t})` | draw a jet anywhere (hangar, menus, briefings, ending) |
| `setType(p, type)` -> bool | same type = `levelUp`; different = switch and keep the level; emits `weaponChange` |
| `levelUp(p)` -> bool | false at L5 (caller pays the max bonus); emits `weaponChange`, and `weaponMax` on reaching 5 |
| `levelDown(p)`, `addMissile(p)` -> bool | min L1; missiles 0-3 (false at 3) |
| `onPlayerDown(p)` | kills the lance; solo: level -1 now; co-op: -1 only if the revive timer runs out (`playerRespawn`) |
| `fireMissile(p, x, y, angle, dmg, opts)` | one homing missile (skills such as `sk_salvo` can use it) |
| `label(p)` -> `'PULSE L3'`; `dps(type, level)` | GDD DPS (all bolts / rays), `type` may be `'missile'` (level 0-3) |
| `linked(p)`, `twinLink` | Twin Link state: `{active, charge (0..1 while forming), a, b, beam}` (read only) |
| `TYPES, PULSE, SPREAD, LANCE, MISSILES, LINK, SKINS, JET, FRAMES` | tuning tables (read only) |
| `debugSet(index, type, level, missiles)`, `sandboxConfig(k)` | test hooks |

Modifiers (applied in `update`): `p.stats.fireRateMul` and `p.stats.damageMul` (primaries and missiles; lance DPS uses
both), ion jam x0.5 fire rate, overdrive x1.5 fire rate and x1.25 damage, Twin Link x1.15 damage.

## `SL.pickups`

| member | notes |
|---|---|
| `spawn(id, x, y, opts)` -> pk | `opts {vx, vy, value, life, display}` (`display: true` = static showcase, no drift) |
| `drop(e)` | default enemy death drop: spills credits, then `def.dropChance` (x1.25 co-op, default 0.1) on `def.dropTable`. `opts.drop` at spawn: `false` none, a pickup id always, a table id / weight object / `true` always rolls |
| `roll(tableId \| {id: weight})` -> id | weighted pick; mercy rule turns `bomb` into `repair` while any jet is at hull <= 30% |
| `tables` | the five GDD 10.3 tables (weights) |
| `spill(x, y, total, {r})` -> n | credit crystals for `total` credits (10-value crystals first, about 40 at most) |
| `vacuum(seconds = 6)`, `vacuumActive()` | every pickup flies to the nearest jet (automatic on `bossDeath` 8 s and `missionOutro`) |
| `mercy()`, `CAPSULES`, `ids` | |

Pickup behavior: capsules 44 px glass cells, drift 70 px/s with a side drift that bounces off the edges, life 14 s
(core blinks the last 2 s), magnet 0.6x. Credits: full magnet, life 10 s. Labels: `POWER UP`, `PULSE L3`, `MISSILES L2`,
`SHIELD +40`, `BOMB +1`, `REPAIR +35`, `MAX POWER` (+2,000 x mult and 20 credits). At max: missile +1,000, shield +500,
bomb +2,000, repair +500.

## Cross-module hooks

- Reads `p.data.ionJamT` (seconds; hazards write it, weapons counts it down): half fire rate, flickering trim, sparks.
- Reads `p.data.overdrive` (progress writes it): truthy = overdrive; an object `{fireRate, damage}` overrides the
  multipliers. Progress must not also change stats for it.
- Reads `p.data.wpnSafe` (true holds fire, for cutscenes) and `p.data.wpnHide` (true hides the jet).
- Reads `SL.game.coop`, `SL.game.session.mult`; calls `SL.game.addScore/addCredits`, `SL.player.addShield/addBomb/heal`.
- Emits on `SL.bus`: `weaponChange {p, type, level, missiles, reason: 'type'|'level'|'down'|'missile'}`,
  `weaponMax {p, type}`, `twinLink {active, a, b}`. The HUD should show `TWIN LINK` while `SL.weapons.twinLink.active`
  (weapons only pops a floating `TWIN LINK` text when it forms).
- Listens: `playerRespawn`, `playerRevive`, `bossDeath`, `bossDefeated`, `missionOutro`, `missionStart`, `missionEnd`,
  `worldReset` (stops loops, clears link state).

## Sandboxes

- `?sandbox=weapons`: every primary L1-5, missiles L1-3, overdrive and ion jam against target drones, 3.4 s each, with a
  GDD vs measured single-target DPS panel. `SL.weapons.sandboxConfig(k)` holds config k (0-14 primaries, 15-17
  missiles, 18-20 overdrive / ion jam). Add `&coop=1` for both jets.
- `?sandbox=twinlink`: co-op formation that forms, uses and breaks the Twin Link.
- `?sandbox=jets`: P1 and P2 at 2x, banking left, level (afterburner) and right.
- `?sandbox=pickups`: every pickup in a labeled grid plus live cargo drones that spill credits and items.
