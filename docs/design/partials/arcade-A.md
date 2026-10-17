# STARLANCE — Game Design Document (arcade combat draft)

Built on `docs/ARCHITECTURE.md`. All numbers are Pilot difficulty unless a row says otherwise. Enemy HP,
bullet speed, enemy fire rate, damage and credits are then scaled by `SL.game.diff` and the co-op rules in
section 12. Ids are lowercase snake_case, except the core bullet id `orbBig`, which keeps its ARCHITECTURE
spelling. The player's callsign appears in copy as `{callsign}` (default LANCE).

## 1. Pitch and tone

**Pitch.** The Vex Armada came through the Halcyon Rift and burned the outer colonies in a week. Its flagship,
the Crown of Vex, feeds on black holes, and it is heading for humanity's last shipyards. You fly the XF-9
Starlance, a white-and-cyan prototype jet that can stack its lasers into a wall of light. Across five
missions you blast through Vex jets and warships, dodge bullet curtains that bend around black holes, pull
stranded people out of the wreckage, and take down a screen-filling boss at the end of every level. Between
sorties you spend credits in the hangar, and four side stories let you choose which signature skill your
jet learns. A friend can grab a second jet and fly with you on the same keyboard.

**Tone.** Bright, loud, heroic. Space is dark and gorgeous; the danger glows pink and orange; your jet
glows cyan. The story stays light: a short briefing before each level, then crew voices on the radio that
cheer, warn and joke while you fight. The villain is arrogant and theatrical. Nobody gives speeches mid-fight.

**What makes it feel like Lightning Fighter.**
- Relative drag control on touch: the jet follows your finger's motion, not its position, so the thumb
  never hides the ship. Auto-fire on by default.
- Weapon capsules that stack: same color = +1 level and a visibly bigger gun; a new color swaps the gun
  and keeps the level. Every level changes the shot shape on screen.
- Glossy metal jets with specular highlights, bloom on every laser, and chunky explosions that throw debris,
  shockwaves and gold credit crystals you vacuum up.
- Big multi-phase bosses with their own health bar, phase marks, armor that breaks off, and a slow-motion
  death that rains credits.
- Constant reward rhythm: kill chains grow the multiplier, formations pay out a bonus capsule when fully
  wiped, and heavies always drop something.

## 2. Characters

Portraits are drawn on a 96×96 canvas (`SL.story.characters[id].portrait(ctx, w, h, t, talking)`): a
rounded-square backdrop in the character's color at 25% alpha, the head lit from the upper left, a 1 px
scanline overlay, and a mouth or visor light that pulses with `talking`. Radio chirps play through
`radio_open` with the per-character recipe below.

| id | Name | Callsign | Role | Radio personality |
|---|---|---|---|---|
| `p1` | the player (name = save callsign) | LANCE (default) | XF-9 Starlance pilot, Lance One | Silent in combat; speaks only in choice options |
| `p2` | Player 2 (name = p2 callsign) | EMBER (default) | XF-9B Emberlance pilot, Lance Two | Silent; named by others in co-op lines |
| `hale` | Commander Iris Hale | ANVIL | CO of the carrier CSV Meridian | Calm, clipped, warm under pressure; gives orders and praise |
| `sparrow` | Lt. Juno Park | SPARROW | Wingmate, flies the flank in an XF-7 Kestrel | Cocky, quick jokes, loyal, first to warn you |
| `oz` | Chief Osvaldo "Oz" Reyes | WRENCH | Meridian crew chief and mechanic | Gruff, practical tips, proud of the jet |
| `rook` | Captain Dax Rook | JACKPOT | Smuggler captain (side story s1) | Charming rogue, always making a deal |
| `amari` | Dr. Lena Amari | TYCHO | Gravity physicist from Tycho Deep (s2) | Precise, curious, dry humor |
| `vale` | Mayor Tamsin Vale | LANTERN | Leader of the refugee convoy (s3) | Steady, protective, emotional at the edges |
| `nyx` | Nyx | NYX | Vex ace who defects (s4) | Quiet, formal, slightly alien phrasing |
| `vessane` | High Marshal Vessane | CROWN | Commander of the Vex Armada, rides the Crown of Vex | Arrogant, poetic, cold |

**Portrait looks** (shapes, colors, motion):
- `p1`: rounded white helmet `#e8eef7` with a cyan trim stripe `#3fc8ff` over the crown, a mirrored visor
  filling 60% of the face (vertical gradient `#7fe3ff` to `#0b3550`, a diagonal white specular streak that
  slides across every 4 s), small chevron decal on the left temple, chin guard in `#9aa6b8`. Talking:
  the visor's bottom edge glows `#7fe3ff`.
- `p2`: same helmet shape in graphite `#2b2f3a` with gold trim `#ffb53f`, amber visor (`#ffd27a` to
  `#4a2a00`), ember decal (three flame strokes). Talking: gold glow along the visor edge.
- `hale`: no helmet; officer headset with a mic boom on the right. Short swept silver hair `#c9ced6`, deep
  brown skin `#7a4e33`, square jaw, narrow eyes, navy collar `#1d2b4a` with two gold pips `#ffd34d`.
  Backdrop: bridge blue `#1b3a5c`. Talking: jaw moves 2 px, mic tip blinks green.
- `sparrow`: open-face white flight helmet with an orange sparrow-wing decal `#ff8a4c`, rose visor raised
  `#ffb3c1` at 40% alpha, light tan skin `#e3b58f`, black bob hair `#15161c` at the cheeks, grin (curved
  mouth with a white tooth line). Backdrop `#3a2416`. Talking: mouth opens, one eyebrow lifts.
- `oz`: bald head `#a8754f`, welding goggles pushed up on the forehead (two brass circles `#c9a14a` with
  green lenses `#5c8f6a`), thick grey beard `#9aa0a8`, orange work collar `#ff9a3d`, a grease smudge.
  Backdrop `#2a2a2a`. Talking: beard bounces 1 px.
- `rook`: red-brown leather flight cap `#7a3b2a` with brass goggles on top, a scar across the left cheek,
  stubble dots, gold tooth glint `#ffd34d` when talking, skin `#c68a5e`. Backdrop `#3b2a1a`.
- `amari`: white EVA hood `#eef2f6` with a violet lens visor flipped up `#a98bff`, round glasses with
  white glints, dark brown skin `#5e3b28`, tight curls `#1a1210` at the hood edge. Backdrop `#241d3a`.
- `vale`: civilian pressure suit collar in `#e6f5ec` with a green stripe `#5dffb0`, hood down, copper-red
  braid `#c2502e` over the shoulder, freckles, pale skin `#f0c9a8`, a small lantern pin that glows
  `#ffd27a`. Backdrop `#173328`.
- `nyx`: angular black Vex helmet `#14111d` with crimson seam lines `#ff2f6d`, visor split so one grey-violet
  eye shows, skin `#b9b3c9` with faint circuit lines `#8f86a8`, one white hair strand. Backdrop `#2a1520`.
  Talking: seams pulse.
- `vessane`: tall crown helmet with five spires `#2c2440` tipped in `#ff2f6d`, face hidden by a smooth
  mirror mask `#3a2f4d` with a pink specular arc, two glowing eye slits `#ff5c8a`. Backdrop `#1a0f1a` with
  a slow red vignette. Talking: eye slits flare; the radio box border turns crimson.

**Radio chirps** (`radio_open` variants, 40-120 ms):
`p1` two rising sine blips 1200→1600 Hz · `p2` two falling triangle blips 1000→800 Hz · `hale` clean
square 600 Hz then a filtered click · `sparrow` bright triple chirp 2000/2400/2000 Hz · `oz` buzzy saw
220 Hz through a 900 Hz bandpass · `rook` detuned 700+740 Hz wobble · `amari` sine glide 900→1300 Hz ·
`vale` soft chime 660+990 Hz with a long tail · `nyx` reversed noise swell plus a 1400 Hz ping ·
`vessane` low distorted 55+82 Hz chord with ring modulation and long reverb.

## 3. Story

**Premise.** Three weeks ago the Vex Armada tore through the Halcyon Rift. Its flagship, the Crown of Vex,
carries a caged black hole as its engine and its weapon. The Coalition has one carrier left in the
sector, the CSV Meridian, and one prototype: the XF-9 Starlance. Commander Hale sends you through five
battlefields, each one a step toward the Crown. Along the way you pull survivors out of escape pods. Four of
them have their own fight to finish, and helping them teaches the Starlance new tricks.

**Briefings** (shown on the briefing screen; 2-4 lines, typed out with the speaker's portrait):

| Mission | Title | Location | Lines | Objectives |
|---|---|---|---|---|
| `m1` | FIRST LIGHT | Vesta Belt, Calder orbit | `hale`: Vex raiders hit the Vesta yards an hour ago. Civilian ships are still in there. / `sparrow`: First real sortie in the XF-9, {callsign}. Try not to scratch it. / `hale`: Clear the belt and bring the pods home. Their carrier is called HARROW. | Destroy HARROW · Rescue the escape pods · Bonus: find Captain Rook's pod |
| `m2` | EVENT HORIZON | Erebus black hole, Tycho Deep station | `hale`: The Vex built a machine around Erebus. A black hole. / `oz`: Gravity grabs you, your bullets, everything. Keep the throttle hot. / `hale`: Tycho Deep is evacuating through the battle. Get them out. | Destroy THE ORRERY · Rescue the escape pods · Bonus: find Dr. Amari's pod |
| `m3` | STORMFRONT | Tethys Major, upper storm bands | `hale`: The Armada is hiding a fleet in Tethys Major's storm bands. / `sparrow`: Lightning the size of continents. Fun. / `hale`: Refugee ships are trapped in there. And something big moves under the clouds. | Destroy TEMPEST · Rescue the escape pods · Bonus: find Mayor Vale's pod |
| `m4` | SUNBREAKER | Helios Gate, star corona | `hale`: The Vex are building a lens at Helios. It turns a star into a gun. / `oz`: When the sky goes white, get behind a wreck plate. Shadow saves lives. / `hale`: Break the Prism before it fires on the Meridian. | Destroy HELIOS PRISM · Rescue the escape pods · Bonus: answer the unknown signal |
| `m5` | CROWN OF VEX | Halcyon Rift mouth | `hale`: This is it. The Crown of Vex sits at the mouth of the Rift. / `vessane`: Little jet. I have eaten stars. You are a spark. / `hale`: Every ship we have is behind you, {callsign}. End this. | Destroy CROWN OF VEX · Rescue the escape pods |
| `s1` | ROOK'S GAMBIT | Kowloon Drift, Vesta Belt junkyard | `rook`: Name's Rook. I stole a Vex weapons barge, then hid it in a minefield. / `oz`: Vex weapon tech? I want it on my bench. / `rook`: Clear my tug a lane and you get first pick. Mind the mines. | Keep Rook's tug alive · Destroy MINEMOTHER · Choose a crate |
| `s2` | THE AMARI EQUATION | Tycho Deep lab, Erebus gravity rift | `amari`: My lab is still out there. My equation can steer gravity itself. / `hale`: If the Vex get it first, they'll aim it at us. / `amari`: Get me to the core. Then we decide what it becomes. | Reach the lab core · Destroy GRAVITON · Decide the core's fate |
| `s3` | LANTERN RUN | Tethys Major nightside | `vale`: Three transports. Nine thousand people. One storm between us and the Meridian. / `sparrow`: Escort duty in an ion storm. My favorite. / `vale`: Keep the Lanterns lit, pilot. Please. | Escort the Lantern convoy · Destroy RAVAGER · Rescue the spilled pods |
| `s4` | THE DEFECTOR | The Wormhole Net, Helios to the Rift | `nyx`: I am Nyx. I flew for the Crown. Now I fly against it. / `hale`: She says she has codes to the Crown's black hole cage. I don't trust her yet. / `nyx`: The Wraith hunts me. Keep me alive and the codes are yours. | Keep Nyx alive · Destroy WRAITH · Choose the route |

**Ending: AFTERGLOW** (ending screen; typed lines, then epilogue cards, then credits roll):
- `hale`: The Rift is closing. The Armada is scattering without its Crown.
- `sparrow`: Somebody owes me a drink. Somebody is you, {callsign}.
- `oz`: I'll have the Starlance polished by morning. She earned it.
- `hale`: Meridian to all ships. Come home. We made it.

Epilogue cards: one per side story, showing the most recently chosen option (`save.choices[side]` last
entry), or the unplayed card.
- `s1_reactor`: Rook's reactor guns now ride on every Coalition jet. He takes a royalty.
- `s1_lens`: Rook opened a lens shop on Ceres. The sign says "As flown by {callsign}."
- `s2_weaponize`: Dr. Amari locked the Singularity design away. "Once was enough," she said.
- `s2_harness`: Amari's gravity engines now pull colony ships home in days, not years.
- `s3_hold`: All three Lanterns reached the Meridian. Vale named the new colony after them.
- `s3_chase`: Vale's people built a beacon on Tethys for every pod you pulled from the storm.
- `s4_trust`: Nyx flies with Sparrow's squadron now. She still salutes like a Vex.
- `s4_codes`: Nyx's codes shut down the last Vex garrisons. She vanished before anyone could thank her.
- Unplayed: Some signals were never answered. Out in the dark, they still blink.

Final card: "Thank you for flying, {callsign}." with total people rescued (`save.rescuedTotal`).

## 4. Main missions

**Wave script notation.** Each row is one or more director events (ARCHITECTURE 6.11) at director-clock
second `t`. `vee dart×5 x360` means `{at, formation:'vee', enemy:'dart', count:5, x:360}`;
`spawn bulwark x360` means `{at, spawn:'bulwark', x:360, y:-80}`; `hazard blackhole {…}` means
`{at, hazard:'blackhole', x, y, opts}`; `pod 3p x180` means `{at, pod:{x:180, y:-40, people:3,
kind:'civilian'}}`; `pickup weapon_spread x360` drops from y −30; `radio m1_r01`, `bg yards`,
`scroll 120`, `music mus_m1`, `waitClear 10` (timeout seconds), `checkpoint`, `boss boss_harrow`.
Side entries use `{side:left|right}`. Rows tagged PEAK are the densest moments; BREATHER rows are
deliberate low-threat gaps with a reward. Every mission opens with
`{at:2, banner:'MISSION n', sub:'TITLE'}`, and `bossWarning` is raised by `SL.spawnBoss`.
Formation member counts listed are Pilot solo; co-op adds members per section 12.

**Difficulty curve across m1-m5** (Pilot; enemy bullet speeds before `diff.bulletSpeed`):

| | m1 | m2 | m3 | m4 | m5 |
|---|---|---|---|---|---|
| Enemy bullet speed range (px/s) | 150-320 | 140-330 | 160-360 | 160-380 | 140-420 |
| Typical / peak enemy bullets on screen | 40 / 110 | 70 / 180 | 100 / 260 | 140 / 340 | 180 / 450 |
| Enemies spawned before boss | ~150 | ~170 | ~190 | ~200 | ~220 |
| Heavies (gunship or bigger) before boss | 4 | 9 | 11 | 14 | 17 |
| New threats introduced | darts, wisps, razors, harriers, bulwark, rocks | hornets, lanterns, obelisks, eclipse, black holes | mantis, arc pylons, hive, ion storm | specters, wardens, seeker mines, flares, mines | wormholes, gravity rifts, everything mixed |
| Expected weapon level at boss | 3 | 4 | 4-5 | 5 | 5 + missiles 3 |
| Boss HP / target fight length | 9,000 / 65 s | 15,000 / 80 s | 22,000 / 90 s | 30,000 / 100 s | 45,000 / 115 s |

### m1 — FIRST LIGHT

- **Location:** Vesta Belt, high orbit over the ice giant Calder. **Target duration:** 3:10 (122 s waves +
  ~65 s boss + outro). **Music:** `mus_m1`, boss `mus_boss_1`. **Boss:** `boss_harrow`.
- **Palette:** space `#04060d` `#0a1224`, nebula `#0e2238` `#1d3b5c`, Calder `#2a3c52` `#3e5a76` with
  rim `#9fc3e6`, yard lights `#ffb46b`, rock `#151a24` rim `#3a4a60`.
- **Background `bg_vesta`** layers (back to front, scroll factor): `deep` gradient plus 3 star layers
  (220/120/50 stars, 0.05/0.12/0.25) · `nebula` fbm teal-blue clouds at 50% alpha (0.08) · `planet`
  Calder, r 520 at (−80, 1350), dark banded disk with a thin lit crescent upper left and a tilted ring at
  18% alpha (0.02) · `far_rocks` 14 dark asteroid silhouettes with slow spin (0.35) · `yard` set pieces
  (0.6) · `dust` 30 faint streaks (1.4).
- **Set pieces and phases:** `yards` (0-50 s): skeletal gantries with blinking amber lights slide past,
  two burning freighter hulks with dim orange fire, a docking ring tumbling. `belt` (50-116 s): far rocks
  triple, gantries end, Calder's ring arcs into view. `storm`: set automatically by `asteroid_storm`
  (rocks tint dusky red, dust streaks align to the storm angle). `boss` (116 s): scroll slows to 60;
  HARROW's shadow passes over the belt before it arrives.
- **Hazards:** `asteroid_storm` twice (52 s gentle, 96 s heavy). It teaches dodging bodies, not bullets.
- **Enemies:** `dart`, `wisp`, `razor`, `harrier`, `bulwark`.
- **Pods:** 6 pods, 13 people; VIP `rook` at 76 s (unlocks `s1`).
- **Rewards:** first clear 600 credits and 1 SP; replay 240 credits. First S rank +1 SP.

| t | Events | Notes |
|---|---|---|
| 0 | `music mus_m1` · `scroll 120` · `bg yards` · `radio m1_r01` | launch from the Meridian |
| 4 | `vee dart×5 x360` | first kills |
| 7 | `vee dart×5 x200` | |
| 9 | `vee dart×5 x520` | |
| 11 | `radio m1_r02` | |
| 13 | `sine_chain wisp×8 {side:left}` | |
| 16 | `sine_chain wisp×8 {side:right}` | |
| 18 | `pickup weapon_pulse x360` | teaches stacking (L2) |
| 20 | `pod 2p x180` · `radio m1_r03` | first rescue |
| 24 | `line_sweep razor×3 {side:left}` | first aimed fans |
| 28 | `pincer dart×8` | |
| 31 | `line_sweep razor×3 {side:right}` | |
| 34 | `waitClear 8` | |
| 35 | `radio m1_r04` · `pod 3p x520` (at 36) | BREATHER |
| 38 | `column_dive dart×6 x260` | |
| 40 | `column_dive dart×6 x460` | |
| 43 | `spawn bulwark x360` · `radio m1_r05` | first gunship, rings |
| 46 | `sine_chain wisp×6 {side:left}` | |
| 50 | `bg belt` · `pickup weapon_spread x300` | |
| 52 | `hazard asteroid_storm {dir:ul, rate:0.8, dur:22, sizes:[s,m]}` · `radio m1_r06` (53) | |
| 56 | `vee dart×7 x360` | |
| 60 | `cross_strafe harrier×2` | rain curtains |
| 64 | `pod 2p x400` | |
| 66 | `sine_chain wisp×8 {side:right}` | |
| 70 | `cross_strafe harrier×2` | |
| 72 | `pickup missile x360` | missiles L1 |
| 74 | `waitClear 10` | |
| 75 | `checkpoint` | |
| 76 | `pod {x:150, people:1, vip:'rook', kind:'vip'}` · `radio m1_r07` | VIP |
| 80 | `wall dart×8` | |
| 84 | `spawn bulwark x220` · `spawn bulwark x500` | PEAK (two ring guns) |
| 86 | `pincer razor×4` | PEAK |
| 92 | `ambush_rear dart×4` · `radio m1_r08` | first rear attack |
| 96 | `hazard asteroid_storm {dir:ur, rate:1.4, dur:16, sizes:[s,m,l]}` | PEAK |
| 98 | `vee razor×5 x360` | |
| 104 | `pod 3p x300` | |
| 106 | `pickup shield x360` | |
| 108 | `sine_chain wisp×10 {side:left}` | BREATHER (popcorn feast for the multiplier) |
| 112 | `waitClear 12` | |
| 114 | `pod 2p x560` | |
| 116 | `bg boss` · `scroll 60` · `radio m1_r09` | |
| 118 | `pickup bomb x360` | |
| 122 | `boss boss_harrow` | radio `m1_r10` on intro |

**Radio cues:**
- `m1_r01` (hale, t 0) "Lance One, you're clear of the Meridian. Vesta yards dead ahead."
- `m1_r02` (sparrow, t 11) "Darts. Easy kills. Stay in their faces and keep shooting."
- `m1_r03` (hale, t 20) "Escape pod on scope. Fly over it to bring them aboard."
- `m1_r04` (oz, t 35) "Same color capsule stacks your guns. New color swaps them. Level stays."
- `m1_r05` (sparrow, t 43) "Gunship! Get under it and burn it before it rings you."
- `m1_r06` (hale, t 53) "Rock storm from the upper left. Shoot the big ones before they split."
- `m1_r07` (rook, t 76) "Mayday! Rook here. Pick me up and I'll make it worth your while!"
- `m1_r14` (rook, VIP rescued) "Ha! Thanks, pilot. Find me later. I've got a barge full of Vex toys."
- `m1_r08` (sparrow, t 92) "Six o'clock! They're coming up from behind!"
- `m1_r09` (hale, t 116) "Big contact inbound. That's the carrier. That's HARROW."
- `m1_r10` (vessane, boss intro) "Coalition jet. Turn back, and live a little longer."
- `m1_r11` (hale, boss phase 2) "It's shedding armor! Hit the launch bay when the doors open!"
- `m1_r12` (sparrow, boss phase 3) "Reactor's exposed! Red arrows mean it's about to ram. Slide aside!"
- `m1_r13` (hale, boss defeated) "HARROW is down. Good flying, {callsign}. Bring them home."

### m2 — EVENT HORIZON

- **Location:** the black hole Erebus and the evacuating research station Tycho Deep. **Target
  duration:** 3:45 (138 s waves + ~80 s boss + outro). **Music:** `mus_m2`, boss `mus_boss_1`.
  **Boss:** `boss_orrery`.
- **Palette:** space `#05030a` `#110a1f`, accretion disk `#ffb070` `#ff6a3d` `#5a1a3a` (dimmed to 55%),
  photon ring `#fff1d6`, station hull `#c9d2dc` windows `#5dffb0`, debris `#1a1426` rim `#4a3a66`.
- **Background `bg_erebus`** layers: `deep` violet-black gradient plus 3 star layers whose stars near
  Erebus are drawn pre-bent along arcs (0.05/0.1/0.2) · `erebus` painted black hole at (560, 240): shadow
  disk r 110, tilted accretion disk 640×150 at 0.3 rad (left side Doppler-bright), thin photon ring, plus
  one weak `addLens(560, 240, 0, 0.35)` that is skipped whenever 4 or more gameplay lenses are active (0.03)
  · `streams` debris fragments spiraling toward Erebus (0.3) · `station` Tycho Deep set pieces (0.55) ·
  `sparks` faint infalling glints (1.2).
- **Set pieces and phases:** `approach` (0-58 s): Erebus small and far, debris sparse. `disk` (58-102 s):
  the disk swells and brightens 20%, debris streams faster. `station` (102-136 s): Tycho Deep's white
  habitat cylinder (420 px long, green window rows, two docking arms) slides past on the left while
  cosmetic lifeboats launch from it. `boss` (136 s): scroll 40; the Orrery's two support struts lower
  from the top edge before the boss drops in.
- **Hazards:** `blackhole` small at 30 s (tutorial), medium + small pair at 80 s (PEAK); the boss itself
  becomes a gravity source in phase 2. Eclipse interdictors carry mini holes.
- **Enemies:** `dart`, `wisp`, `hornet`, `razor`, `harrier`, `bulwark`, `lantern`, `obelisk`, `eclipse`.
- **Pods:** 7 pods, 20 people (two 4-person shuttles); VIP `amari` at 72 s (unlocks `s2`).
- **Rewards:** first clear 800 credits and 2 SP; replay 320 credits. First S rank +1 SP.

| t | Events | Notes |
|---|---|---|
| 0 | `music mus_m2` · `scroll 110` · `bg approach` · `radio m2_r01` | |
| 3 | `loop_swarm hornet×8 {side:left}` | new popcorn |
| 7 | `vee razor×3 x360` | |
| 9 | `loop_swarm hornet×8 {side:right}` | |
| 12 | `radio m2_r02` | |
| 14 | `sine_chain wisp×8 {side:left}` | |
| 16 | `pod 3p x520` | |
| 18 | `spawn lantern x240` | seed bombs |
| 22 | `spawn lantern x480` | |
| 24 | `pickup weapon_lance x360` · `radio m2_r03` | first lance |
| 26 | `column_dive dart×6 x360` | lance pierces the column |
| 30 | `hazard blackhole {x:360, y:420, size:'small', life:18, drift:25}` · `radio m2_r04` | first black hole, no bullets near it yet |
| 33 | `sine_chain wisp×8 {side:right}` | wisps get swallowed: shows the pull |
| 36 | `pod 2p x160` | pod drifts toward the hole |
| 40 | `cross_strafe harrier×2` | streams curve around the hole |
| 46 | `spawn obelisk x200` | |
| 48 | `spawn obelisk x520` | PEAK (spirals bending through gravity) |
| 52 | `radio m2_r05` | |
| 56 | `waitClear 10` | |
| 58 | `checkpoint` · `bg disk` | |
| 60 | `pickup missile x300` | BREATHER |
| 62 | `wall dart×8` | |
| 64 | `spawn eclipse x360` · `radio m2_r06` | carries a mini hole |
| 70 | `loop_swarm hornet×8 {side:left}` | |
| 72 | `pod {x:480, people:2, vip:'amari', kind:'vip'}` · `radio m2_r07` | VIP, drifting toward the eclipse |
| 76 | `pincer razor×4` | |
| 80 | `hazard blackhole {x:180, y:300, size:'medium', life:20}` · `hazard blackhole {x:560, y:700, size:'small', life:16}` | PEAK |
| 82 | `spawn bulwark x360` | its rings warp between two holes |
| 86 | `cross_strafe harrier×2` | |
| 90 | `pod 3p x300` | |
| 92 | `pickup shield x360` | |
| 94 | `sine_chain wisp×10 {side:right}` | BREATHER |
| 100 | `waitClear 12` | |
| 102 | `bg station` | |
| 104 | `radio m2_r08` · `pod {x:200, people:4, kind:'shuttle'}` · `pod {x:520, people:4, kind:'shuttle'}` | |
| 106 | `escort bulwark+razor×4 x360` | |
| 112 | `ambush_rear hornet×6` | |
| 116 | `spawn eclipse x220` · `spawn lantern x500` | PEAK |
| 122 | `vee razor×5 x360` | |
| 126 | `pod 2p x360` | |
| 128 | `waitClear 14` | |
| 130 | `checkpoint` | |
| 132 | `pickup power x360` · `pickup bomb x240` | BREATHER |
| 134 | `radio m2_r09` | |
| 136 | `bg boss` · `scroll 40` | |
| 138 | `boss boss_orrery` | radio `m2_r10` on intro |

**Radio cues:**
- `m2_r01` (hale, t 0) "Erebus ahead. Don't stare at it. Stay sharp."
- `m2_r02` (oz, t 12) "Hornets loop, then dive. Hold your line and let them come to you."
- `m2_r03` (oz, t 24) "Lance capsule! That beam pierces. Line them up."
- `m2_r04` (hale, t 30) "Gravity anomaly! It pulls everything. Fly wide and don't touch the dark."
- `m2_r05` (sparrow, t 52) "Their shots bend around the hole! Watch the curve, not the gun!"
- `m2_r06` (oz, t 64) "That ring ship carries its own black hole. Kill it and the hole collapses."
- `m2_r07` (amari, t 72) "This is Dr. Amari, Tycho Deep! Our pod is drifting toward the horizon!"
- `m2_r14` (amari, VIP rescued) "You caught us! My lab is still out there. I'll need your help."
- `m2_r08` (hale, t 104) "Tycho Deep is launching lifeboats. Cover them!"
- `m2_r09` (hale, t 134) "Energy spike at the station core. Something is waking up."
- `m2_r10` (vessane, boss intro) "The Orrery drinks a black hole. What do you drink, little jet?"
- `m2_r11` (oz, boss phase 2) "Containment's broken! It's pulling. Stay low and keep moving!"
- `m2_r12` (hale, boss phase 3) "It's collapsing! Find the gaps in those rings!"
- `m2_r13` (hale, boss defeated) "Erebus is quiet again. You did that, {callsign}."

### m3 — STORMFRONT

- **Location:** above the cloud deck of the gas giant Tethys Major. **Target duration:** 4:00 (140 s
  waves + ~90 s boss + outro). **Music:** `mus_m3`, boss `mus_boss_2`. **Boss:** `boss_tempest`.
- **Palette:** cloud deck `#1d1530` `#2a1d3d` `#3b2a52`, deep bands `#1d2a44`, in-cloud lightning glow
  `#c9a3ff` (diffuse, 20% alpha), eye blue `#1f3f66`, moon `#8a9bb3`.
- **Background `bg_tethys`** layers: `deck` three fbm cloud bands (0.1/0.18/0.3) drifting sideways in
  opposite directions · `glow` soft lightning blooms inside the clouds every 1.5-4 s, always wider than
  120 px and blurred so they never read as bullets · `towers` anvil storm towers sliding past (0.5) ·
  `wisps` fast near streaks (1.6).
- **Set pieces and phases:** `upper` (0-52 s): open cloud tops, distant towers. `stormwall` (52-96 s):
  cloud walls rise at both edges and the sky darkens 20%; lightning blooms double. `eye` (96-136 s): the
  storm's calm eye opens, a clear circle showing deep blue layers and a distant moon (the breather).
  `boss` (136 s): clouds churn; a dark serpent shadow slides under the deck from bottom to top twice.
- **Hazards:** `ion_storm` at 28 s (2 cells) and 72 s (3 cells, PEAK); TEMPEST calls strikes in phase 3.
- **Enemies:** `dart`, `wisp`, `hornet`, `razor`, `harrier`, `bulwark`, `obelisk`, `mantis`, `arc_pylon`,
  `hive`.
- **Pods:** 8 pods, 21 people; VIP `vale` at 66 s (unlocks `s3`). Mantis interceptors try to steal pods.
- **Rewards:** first clear 1,000 credits and 2 SP; replay 400 credits. First S rank +1 SP.

| t | Events | Notes |
|---|---|---|
| 0 | `music mus_m3` · `scroll 130` · `bg upper` · `radio m3_r01` | |
| 3 | `vee razor×5 x360` | |
| 6 | `loop_swarm hornet×8 {side:right}` | |
| 10 | `fence_pair arc_pylon×2 x360` · `radio m3_r02` | first fence |
| 14 | `sine_chain wisp×10 {side:left}` | |
| 18 | `pod 3p x200` | |
| 20 | `cross_strafe harrier×2` | |
| 24 | `fence_pair arc_pylon×2 x360 {gapLow:true}` | fence lower on screen |
| 26 | `pickup weapon_spread x360` | |
| 28 | `hazard ion_storm {cells:2, strike:3.5, dur:30}` · `radio m3_r03` | |
| 32 | `column_dive dart×6 x260` · `column_dive dart×6 x460` | |
| 36 | `spawn mantis x200` · `spawn mantis x520` · `radio m3_r04` | blink ghosts |
| 40 | `pod 2p x520` | |
| 42 | `spawn mantis x360 {grab:true}` | goes for the pod |
| 46 | `pincer razor×4` | |
| 50 | `waitClear 10` | |
| 52 | `checkpoint` · `bg stormwall` | |
| 54 | `pickup missile x260` · `pickup shield x460` | BREATHER |
| 56 | `spawn hive x360` · `radio m3_r05` | carrier spawns hornets |
| 60 | `fence_pair arc_pylon×2 x240` · `fence_pair arc_pylon×2 x480` | two fences, staggered |
| 66 | `pod {x:160, people:3, vip:'vale', kind:'vip'}` · `radio m3_r06` | VIP |
| 68 | `cross_strafe harrier×2` | |
| 72 | `hazard ion_storm {cells:3, strike:2.8, dur:26}` | PEAK |
| 74 | `escort bulwark+razor×4 x360` | PEAK |
| 80 | `spawn mantis x160` · `spawn mantis x360` · `spawn mantis x560` | |
| 84 | `pod {x:400, people:4, kind:'shuttle'}` | |
| 88 | `wall dart×8` | |
| 92 | `waitClear 12` | |
| 94 | `radio m3_r07` | |
| 96 | `bg eye` · `pod 2p x250` · `pickup power x360` | BREATHER (the eye) |
| 98 | `pod 2p x470` | |
| 100 | `sine_chain wisp×8 {side:left}` · `loop_swarm hornet×8 {side:right}` | |
| 106 | `ring_burst dart×8 {x:360, y:300}` | |
| 110 | `spawn obelisk x200` · `spawn obelisk x520` | |
| 116 | `spawn hive x360` · `spawn mantis x200` · `spawn mantis x520` | PEAK |
| 120 | `pod 2p x560` | |
| 124 | `ambush_rear dart×6` | |
| 130 | `pod 3p x360` | |
| 132 | `waitClear 14` | |
| 134 | `checkpoint` | |
| 136 | `pickup bomb x260` · `pickup repair x460` · `bg boss` · `scroll 90` | |
| 138 | `radio m3_r08` | |
| 140 | `boss boss_tempest` | radio `m3_r09` on intro |

**Radio cues:**
- `m3_r01` (hale, t 0) "Entering Tethys Major. Storm bands below you. Keep above the lightning."
- `m3_r02` (sparrow, t 10) "Pylons with a fence between them. Pop one and the fence drops!"
- `m3_r03` (oz, t 28) "Ion cells! Lightning follows the glow lines. Step off the line."
- `m3_r04` (hale, t 36) "Mantis interceptors. They blink. Watch for the pink ghost."
- `m3_r05` (sparrow, t 56) "Hive carrier! Kill it fast or it fills the sky with hornets!"
- `m3_r06` (vale, t 66) "Lantern One to any ship! My pod's hull is cracking. Please!"
- `m3_r14` (vale, VIP rescued) "You saved me. My convoy is still in the storm. Will you help them?"
- `m3_r07` (oz, t 94) "Storm cells kill shield regen. Stay out of the glow when you can."
- `m3_r08` (hale, t 138) "Something huge under the clouds. It's surfacing beneath you!"
- `m3_r09` (vessane, boss intro) "The storm has teeth, pilot. Let it show you."
- `m3_r10` (sparrow, boss phase 2) "Lightning fences! Look for the bright gap and slide through!"
- `m3_r11` (hale, boss phase 3) "It dove! Watch the edges. It'll come in from the sides!"
- `m3_r12` (hale, boss defeated) "TEMPEST is down. The storm is just weather again."

### m4 — SUNBREAKER

- **Location:** Helios Gate, the corona of a white star and the half-built Vex lens forge. **Target
  duration:** 4:20 (150 s waves + ~100 s boss + outro). **Music:** `mus_m4`, boss `mus_boss_2`.
  **Boss:** `boss_prism`.
- **Palette:** corona `#1a0804` `#3a1208` `#6b2410`, prominences `#8a3010` at 40%, forge girders
  `#0e0b0a` with edge light `#ff9a3d` at 50%, solar wind `#ffcf8a` at 8%, flare white `#fff4d6` (flare
  events only), wreck plates `#3a3f4a` rim `#cfd6e0`.
- **Background `bg_helios`** layers: `deep` warm black, sparse stars · `limb` the star's limb, an arc of
  radius 2400 whose top sits at y 1500 (below the screen) with its glow rising to y 900 at 35% alpha;
  granulation fbm only below y 1100 (0.02) · `prominences` three slow plasma arcs (0.15) · `forge` Dyson
  girder lattices with orange-lit edges and rotating collector mirrors (0.5) · `wind` streaks (1.3).
- **Set pieces and phases:** `corona` (0-60 s): open corona, prominences arch at the edges. `forge`
  (60-104 s): the Helios Forge girders fill the edges; collector mirrors glint. `flare` (104-148 s): the
  star brightens 15% and prominences swell; each `solar_flare` event briefly washes the background white
  at 30%. `boss` (148 s): the Prism eclipses the star; the whole background dims 25%.
- **Hazards:** `minefield` (24 s, 94 s) and `solar_flare` (44 s single sweep, 80 s double, 118 s from below);
  every flare brings 3-4 drifting wreck plates to hide behind.
- **Enemies:** `dart`, `wisp`, `hornet`, `razor`, `harrier`, `bulwark`, `mantis`, `specter`, `arc_pylon`,
  `hive`, `warden`, `seeker_mine`.
- **Pods:** 8 pods, 21 people; VIP `nyx` (kind `defector`) at 76 s (unlocks `s4`).
- **Rewards:** first clear 1,200 credits and 2 SP; replay 480 credits. First S rank +1 SP.

| t | Events | Notes |
|---|---|---|
| 0 | `music mus_m4` · `scroll 140` · `bg corona` · `radio m4_r01` | |
| 3 | `vee razor×5 x360` · `vee dart×5 x200` | |
| 7 | `loop_swarm hornet×8 {side:left}` | |
| 10 | `cross_strafe harrier×2` | |
| 14 | `spawn specter x200` · `spawn specter x520` · `radio m4_r02` | stealth intro |
| 18 | `pod 3p x300` | |
| 20 | `wall dart×8` | |
| 24 | `hazard minefield {count:10, area:'top', drift:40}` · `radio m4_r03` | |
| 28 | `sine_chain wisp×10 {side:right}` | wisps chain-pop mines |
| 32 | `spawn warden x360` · `radio m4_r04` | first frigate beam |
| 36 | `pod 2p x520` | |
| 38 | `pickup weapon_lance x360` | |
| 40 | `pincer razor×4` | |
| 44 | `hazard solar_flare {from:'left', warn:2.0, sweeps:1, plates:3}` · `radio m4_r05` | first flare |
| 50 | `escort bulwark+razor×4 x360` | |
| 54 | `spawn specter x180` · `spawn specter x360` · `spawn specter x540` | |
| 58 | `waitClear 12` | |
| 60 | `checkpoint` · `bg forge` | |
| 62 | `pickup missile x260` · `pickup shield x460` | BREATHER |
| 64 | `ring_burst seeker_mine×6 {x:360, y:260}` | |
| 68 | `spawn warden x200` · `spawn warden x520` | PEAK (crossing beams) |
| 72 | `loop_swarm hornet×8 {side:left}` | |
| 76 | `pod {x:600, people:1, vip:'nyx', kind:'defector'}` · `radio m4_r06` | VIP |
| 78 | `radio m4_r07` | |
| 80 | `hazard solar_flare {from:'right', warn:2.0, sweeps:2, gap:4, plates:3}` | |
| 84 | `cross_strafe harrier×2` · `vee razor×5 x360` | PEAK |
| 90 | `pod {x:200, people:4, kind:'shuttle'}` | |
| 94 | `hazard minefield {count:14, area:'full', drift:30}` | |
| 96 | `spawn mantis x200 {grab:true}` · `spawn mantis x520 {grab:true}` | pod thieves |
| 100 | `pod 3p x450` | |
| 102 | `waitClear 14` | |
| 104 | `bg flare` · `pickup power x360` · `radio m4_r08` | BREATHER |
| 108 | `sine_chain wisp×10 {side:left}` · `spawn specter x360` | |
| 112 | `pod 3p x360` | |
| 114 | `spawn hive x360` | |
| 118 | `hazard solar_flare {from:'bottom', warn:2.4, sweeps:1, plates:4}` | flare rises from the star |
| 122 | `fence_pair arc_pylon×2 x360` · `cross_strafe harrier×2` | |
| 126 | `spawn warden x360` · `ring_burst seeker_mine×4 {x:360, y:200}` | PEAK |
| 132 | `pod 3p x300` | |
| 134 | `pod 2p x520` | |
| 136 | `ambush_rear razor×4` | |
| 142 | `waitClear 14` | |
| 144 | `checkpoint` | |
| 146 | `pickup bomb x260` · `pickup repair x460` | |
| 148 | `bg boss` · `scroll 50` · `radio m4_r09` | |
| 150 | `boss boss_prism` | radio `m4_r10` on intro |

**Radio cues:**
- `m4_r01` (hale, t 0) "Helios Gate. The star is their gun. Don't give it a clean shot."
- `m4_r02` (sparrow, t 14) "I see shimmer. Stealth jets! Shoot the ripple before it decloaks."
- `m4_r03` (oz, t 24) "Mag mines. They arm when you get close. Shoot them into the enemy."
- `m4_r04` (hale, t 32) "Warden frigate. Its beam fires down the line you see. Don't be on it."
- `m4_r05` (oz, t 44) "Flare coming! Get behind a wreck plate. The shadow saves you!"
- `m4_r06` (nyx, t 76) "Vex pilot to Coalition jet. I am defecting. Do not shoot. Please."
- `m4_r07` (hale, t 78) "A Vex pod. Your call, {callsign}. If you pick her up, I want her watched."
- `m4_r14` (nyx, VIP rescued) "You did not shoot. Thank you. I know how to hurt the Crown."
- `m4_r08` (sparrow, t 104) "Breather. Check your guns. The Prism is close."
- `m4_r09` (hale, t 148) "The Prism is turning toward the Meridian. Stop it. Now."
- `m4_r10` (vessane, boss intro) "Helios kneels to me. So will your fleet."
- `m4_r11` (oz, boss phase 2) "Sunbeam sweep! Get behind the shade plates!"
- `m4_r12` (sparrow, boss phase 3) "Mirrors are gone! The core spins its beams. Circle with them!"
- `m4_r13` (hale, boss defeated) "The Prism is glass. Helios is free. One target left."

### m5 — CROWN OF VEX

- **Location:** the mouth of the Halcyon Rift, where the Coalition fleet makes its last stand.
  **Target duration:** 4:35 (132 s waves + ~115 s boss + outro). **Music:** `mus_m5`, boss
  `mus_boss_final`. **Boss:** `boss_crown`.
- **Palette:** rift nebula `#1a0612` `#2a0c2a` `#3d1240`, fracture light `#e6d6ff` (thin, 30%), fleet
  silhouettes `#1c2433`, tunnel streaks `#7f6bff` at 25%, Crown hull `#14111d` with red lights `#ff2f6d`.
- **Background `bg_rift`** layers: `deep` crimson-violet gradient plus 3 star layers · `cracks`
  white-violet fracture lines across space that pulse slowly (0.05) · `fleet` Coalition capital ships far
  away (0.15) trading long, thin, dim tracer lines at 12% alpha (never dot-shaped) · `tunnel` (phase only)
  radial streaks converging on a vanishing point at (360, −200) with rings of light passing every 0.6 s ·
  `throne` the Crown's silhouette, a dark mass with rows of red lights that grows over 50 s (0.2) ·
  `wisps` violet near streaks (1.5).
- **Set pieces and phases:** `fleet` (0-52 s): the battle rages behind you; a Coalition cruiser breaks in
  half in the far layer at 40 s. `tunnel` (52-80 s): scroll 300 inside a wormhole, the fastest section of
  the game. `throne` (80-130 s): the Crown rises over the horizon. `boss` (130 s): the Crown fills the top
  third; the stars freeze. `collapse` (outro): the Rift folds shut in white light.
- **Hazards:** `wormhole` (14 s single pair, 92 s two pairs), `gravity_rift` (30 s, 102 s), `blackhole`
  large in the tunnel (64 s). The boss adds its own black hole, side holes and wormholes.
- **Enemies:** all 15 types.
- **Pods:** 9 pods, 23 people, plus Sparrow's ejection pod at 108 s (`vip:'sparrow'`, `safe:true`: enemy
  bullets pass over it and it cannot be lost; a missed pod is collected by the Meridian).
- **Story flags:** if `save.choices.s4` contains `s4_trust`, Nyx flies in as an ally for the first 25 s
  of the boss (140 DPS needle streams at the boss). If it contains `s4_codes`, both broadside batteries
  start with 25% less HP. Both can apply after replays.
- **Rewards:** first clear 1,500 credits and 3 SP; replay 600 credits. First S rank +1 SP. Unlocks the
  ending and post-game.

| t | Events | Notes |
|---|---|---|
| 0 | `music mus_m5` · `scroll 150` · `bg fleet` · `radio m5_r01` | |
| 3 | `vee razor×5 x240` · `vee razor×5 x480` | |
| 6 | `loop_swarm hornet×8 {side:left}` · `loop_swarm hornet×8 {side:right}` | |
| 10 | `cross_strafe harrier×2` | |
| 14 | `hazard wormhole {pairs:1, a:{x:180, y:300}, b:{x:540, y:900}, life:16}` · `radio m5_r02` | |
| 16 | `spawn mantis x180 {via:'wormhole'}` · `spawn mantis x540 {via:'wormhole'}` | enemies step out of portals |
| 20 | `pod 3p x360` | |
| 22 | `spawn eclipse x360` | |
| 26 | `fence_pair arc_pylon×2 x360` | |
| 30 | `hazard gravity_rift {y:640, angle:0.2, life:20, flip:4}` · `radio m5_r03` | |
| 32 | `sine_chain wisp×10 {side:left}` | |
| 36 | `spawn warden x200` | its beam bends at the rift |
| 40 | `pod 2p x560` | |
| 42 | `pincer razor×4` | |
| 46 | `spawn specter x180` · `spawn specter x360` · `spawn specter x540` | |
| 50 | `waitClear 12` | |
| 52 | `checkpoint` · `bg tunnel` · `scroll 300` · `radio m5_r04` | speed section |
| 54 | `column_dive dart×6 x200` · `column_dive dart×6 x360` · `column_dive dart×6 x520` | |
| 58 | `pod 3p x200` · `pod 3p x520` | |
| 60 | `loop_swarm hornet×8 {side:left}` | |
| 64 | `hazard blackhole {x:360, y:260, size:'large', life:22}` | PEAK |
| 66 | `cross_strafe harrier×2` | PEAK (streams wrap the hole) |
| 70 | `spawn lantern x200` · `spawn lantern x520` | |
| 72 | `pod 2p x360` | |
| 74 | `pickup power x260` · `pickup missile x460` | |
| 78 | `waitClear 10` | |
| 80 | `bg throne` · `scroll 120` · `radio m5_r05` · `pickup shield x360` | BREATHER |
| 84 | `escort warden+razor×4 x360` | |
| 88 | `spawn hive x360` | |
| 92 | `hazard wormhole {pairs:2, life:18}` | |
| 94 | `pod {x:300, people:4, kind:'shuttle'}` | |
| 98 | `spawn obelisk x200` · `spawn obelisk x520` | |
| 100 | `pod 3p x600` · `ring_burst seeker_mine×6 {x:360, y:240}` | |
| 102 | `hazard gravity_rift {y:520, angle:-0.15, life:18, flip:3}` | |
| 104 | `spawn mantis x160` · `spawn mantis x360` · `spawn mantis x560` | |
| 108 | `pod {x:300, people:1, vip:'sparrow', kind:'pilot', safe:true}` · `radio m5_r15` | Sparrow ejects |
| 110 | `ambush_rear razor×4` · `cross_strafe harrier×2` | |
| 116 | `spawn eclipse x220` · `spawn eclipse x500` | PEAK |
| 120 | `pod 2p x160` | |
| 122 | `waitClear 14` | |
| 124 | `checkpoint` | |
| 126 | `pickup repair x260` · `pickup bomb x460` · `pickup shield x360` | BREATHER |
| 128 | `radio m5_r06` | |
| 130 | `bg boss` · `scroll 30` | |
| 132 | `boss boss_crown` | radio `m5_r07`, then `m5_r18` or `m5_r19` |

**Radio cues:**
- `m5_r01` (hale, t 0) "All wings, this is Meridian. Lance leads. Everyone else, follow the light."
- `m5_r02` (oz, t 14) "Wormholes! What goes in one comes out the other. Bullets too."
- `m5_r03` (hale, t 30) "Gravity rift across your path! It pulls, then pushes. Time your crossing."
- `m5_r04` (sparrow, t 52) "We're in the tunnel! Everything's fast in here. Stay smooth!"
- `m5_r05` (vessane, t 80) "You came all this way to die where stars die. How fitting."
- `m5_r15` (sparrow, t 108) "I'm hit! Ejecting! {callsign}, come get me!"
- `m5_r16` (sparrow, Sparrow's pod rescued) "Knew you'd come. Now go kill that thing."
- `m5_r17` (hale, Sparrow's pod missed) "Meridian has Sparrow's pod. She's safe. Eyes forward, {callsign}."
- `m5_r06` (hale, t 128) "Last stop. Everything we have is behind you."
- `m5_r07` (vessane, boss intro) "I am the Crown. Kneel, or be erased."
- `m5_r18` (nyx, boss intro, s4_trust) "Nyx on your wing. Their left battery is weak. Hit it with me."
- `m5_r19` (oz, boss intro, s4_codes) "Nyx's codes are in. Battery armor is glitching. Hit the sides!"
- `m5_r08` (hale, boss phase 2) "The Maw is charging! Get off the center line!"
- `m5_r09` (oz, boss phase 3) "The cage is open! It's pulling hard. Hold the bottom corners!"
- `m5_r10` (vessane, boss form 2) "Then burn with me."
- `m5_r11` (sparrow, boss phase 5) "Cage orbs! Find the gap before they close!"
- `m5_r12` (hale, boss phase 6) "It's breaking apart! Finish it, {callsign}!"
- `m5_r13` (hale, boss defeated) "Crown of Vex is down. All ships... come home."

## 5. Side stories

**Shared rules.**
- **Tier.** Each side story plays at the enemy tier of the mission after its unlock: `s1` tier 2, `s2` tier 3,
  `s3` tier 4, `s4` tier 5 (tier rules in section 7). Each is 2:30-3:00 including a 45-60 s mini-boss.
- **Unlock.** Rescuing the VIP pod sets `save.flags.unlock_<vip>` and unlocks the side story right after that
  mission's results. If the VIP was missed, the Meridian's sweepers find them later, and the side story
  unlocks when the next main mission is cleared (`s4`: when `m5` is cleared, with the post-game briefing).
- **Choice.** Every side story has one `{choice:'<id>'}` event. The radio line just before it is the
  prompt. The dialog shows the speaker's portrait, a title, and two option cards; each card has a tag,
  `SKILL` (a triggered active) or `ALWAYS ON` (a passive), so the player knows what kind of skill they are
  picking. On replay, an option whose skill is already owned shows `OWNED`; the other shows `NEW`.
- **Trial.** The chosen skill switches on for both jets the moment the player picks, for the rest of that
  run (actives get a 20 s trial cooldown). The player feels the reward before they earn it. Completing the
  mission grants the skill node permanently (section 14).
- **Allies.** Escort allies are `SL.spawnAlly` entities with `hittable:true`. Aimed enemy patterns in side
  stories pick the ally instead of the nearest player 30% of the time. Ally hull shows as a green bar under
  the boss-bar slot with the ally's name. An ally destroyed fails the mission.
- **Rewards.** First clear: the skill for the option picked, plus credits; replay: 40% credits, plus the
  other skill if the other option is picked. Side stories give no SP.

### s1 — ROOK'S GAMBIT

- **Unlock:** `unlock_rook` (pod in `m1` at 76 s) or `m2` cleared. **Tier** 2. **Target** 2:40 (86 s waves +
  ~55 s mini-boss + outro).
- **Premise:** Captain Rook stole a Vex weapons barge and hid it in the junkyard minefield of Kowloon Drift.
  His tug can haul one crate out. Vex salvage crews want it back, and the minefield is not what it seems.
- **Objective:** Keep Rook's tug alive · Destroy MINEMOTHER · Choose a crate. **Fail:** tug destroyed
  ("Rook's tug was destroyed.").
- **Background:** `bg_vesta`, phase `drift`: the yards replaced by a junkyard of broken hulls (8 large
  wreck silhouettes, 300-600 px, `#151a24` with rim `#3a4a60`), smuggler beacons blinking gold `#ffd34d`
  at 30% alpha, Calder's crescent far below. **Music:** `mus_side`, mini-boss `mus_miniboss`.
- **Hazards:** `minefield`, one light `asteroid_storm`. **Enemies:** `dart`, `wisp`, `razor`, `harrier`,
  `bulwark`. **Boss:** `boss_minemother`.
- **Ally `rook_tug`:** 120×90 px stubby salvage tug: rust-red hull `#7a3b2a` with brass trim `#c9a14a`,
  a cab with a lit amber window, four clamp arms and a glowing tow cable that sways behind it; a crate
  rides in the clamps after the choice (reactor crate: orange-glowing drum; lens crate: a crystal dish that
  throws rainbow glints). HP 600, r 46, stays at y 1080 and follows the player's x with lag (max 110 px/s).
- **Pods:** 5 pods, 11 people. **Rewards:** first clear 500 credits + skill; replay 200 credits.

| t | Events | Notes |
|---|---|---|
| 0 | `music mus_side` · `scroll 100` · `bg drift` · `radio s1_r01` | tug enters below the player |
| 3 | `vee dart×5 x360` | |
| 6 | `hazard minefield {count:8, area:'top', drift:35}` · `radio s1_r02` | |
| 10 | `sine_chain wisp×8 {side:left}` | wisps pop mines |
| 14 | `line_sweep razor×3 {side:right}` | they aim at the tug |
| 18 | `pod 2p x200` | |
| 20 | `pickup weapon_cycle x360` | |
| 24 | `column_dive dart×6 x260` | |
| 28 | `spawn bulwark x360` · `radio s1_r03` | PEAK |
| 34 | `hazard asteroid_storm {dir:'ul', rate:0.7, dur:14, sizes:['s','m']}` | rocks shield the tug |
| 38 | `pincer razor×4` | |
| 42 | `pod 3p x480` | |
| 46 | `waitClear 10` | |
| 48 | `checkpoint` · `radio s1_r04` | the barge drifts in from the top |
| 52 | `radio s1_r05` | prompt |
| 54 | `choice s1_crate` | |
| 55 | `radio s1_r06` if reactor · `radio s1_r07` if lens | |
| 58 | reactor: `hazard minefield {count:16, area:'full', drift:40, seek:'ally'}` · `radio s1_r08` | PEAK |
| 58 | lens: `escort bulwark+razor×4 x240` · `radio s1_r09` | PEAK |
| 64 | lens: `escort bulwark+razor×4 x480` | |
| 62 | `cross_strafe harrier×2` | |
| 70 | `pod 2p x300` · `pod 2p x520` | BREATHER |
| 74 | `wall dart×8` | |
| 76 | `pod 2p x360` | |
| 80 | `waitClear 12` | |
| 82 | `checkpoint` · `pickup bomb x360` · `radio s1_r10` | |
| 86 | `boss boss_minemother` | radio `s1_r11` on intro, `s1_r12` on defeat |

**CHOICE `s1_crate`** — dialog title "TWO CRATES, ONE TUG", speaker `rook`, prompt `s1_r05`.

| Option id | Button | Card text | Skill (section 14) |
|---|---|---|---|
| `s1_reactor` | TAKE THE REACTOR CORE | ALWAYS ON · Reactor Guns: +15% fire rate. Getting shot down costs no weapon level. | `sk_reactor_guns` |
| `s1_lens` | TAKE THE FOCUS LENS | SKILL · Sun Lance: a 2.5 s mega beam that melts everything in its path. | `sk_sun_lance` |

- **After `s1_reactor`:** the tug's reactor powers a turret: twin pulses at the nearest enemy within 500 px
  (60 DPS). The crate is heavy: tug lag speed drops to 80 px/s. The reactor's heat draws the mines: the
  58 s minefield is twice as dense and armed mines steer toward the tug (`seek:'ally'`). MINEMOTHER adds
  one extra mine wave per cycle (section 8).
- **After `s1_lens`:** every 12 s the tug fires the lens: a 0.8 s, 400 DPS lance at the highest-HP enemy on
  screen. The lens's signature draws salvage crews: two escort groups at 58 s and 64 s instead of the
  dense minefield.

**Radio copy:**
- `s1_r01` (rook, t 0) "Welcome to Kowloon Drift. Mind the junk. Some of it bites."
- `s1_r02` (oz, t 6) "Mines ahead. Pop them early and they'll take the Vex with them."
- `s1_r03` (rook, t 28) "That gunship wants my tug. Don't let it touch her!"
- `s1_r04` (rook, t 48) "There's my barge! Two crates left. Both priceless."
- `s1_r05` (rook, t 52, prompt) "Reactor core or focus lens? My tug can haul one. Pick fast!"
- `s1_r06` (rook, after reactor) "Reactor it is! Hot cargo. My tug's guns just woke up."
- `s1_r07` (rook, after lens) "The lens! Careful, she's worth more than my ship."
- `s1_r08` (oz, t 58 reactor) "Reactor heat is pulling the mines in! Pop them before they reach the tug!"
- `s1_r09` (sparrow, t 58 lens) "Salvage crews want that lens! Two gunships inbound!"
- `s1_r10` (rook, t 82) "Uh, pilot? That minefield is moving. That's not a minefield."
- `s1_r11` (vessane, boss intro) "A thief and a pilot. My Minemother will sort you both."
- `s1_r12` (rook, boss defeated) "Ha! Pleasure doing business, {callsign}. The crate's yours."
- `s1_r13` (rook, tug hull below 50%) "She's leaking fuel! Keep them off my tug!"
- `s1_r14` (rook, tug hull below 20%) "One more hit and I'm swimming home, pilot!"

### s2 — THE AMARI EQUATION

- **Unlock:** `unlock_amari` (pod in `m2` at 72 s) or `m3` cleared. **Tier** 3. **Target** 2:45 (90 s waves +
  ~55 s mini-boss + outro).
- **Premise:** Dr. Amari's lab hangs inside the Erebus gravity rift. Her equation can steer gravity, and the
  lab core can be tuned once: into a weapon or into an engine. The Vex want it either way.
- **Objective:** Reach the lab core · Destroy GRAVITON · Decide the core's fate. **Fail:** shuttle destroyed
  ("Dr. Amari's shuttle was lost.").
- **Background:** `bg_erebus`, phases `rift` (Erebus huge and close at the top right, cracked space lines
  in violet `#b26bff` at 20%) then `lab` (Tycho Deep's research ring, a 900 px arc of white modules with
  green windows `#5dffb0`, slides in from the right and frames the core: a glass sphere 140 px with a
  slow blue-white swirl). **Music:** `mus_side`, mini-boss `mus_miniboss`.
- **Hazards:** `gravity_rift`, `blackhole`. **Enemies:** `hornet`, `wisp`, `razor`, `harrier`, `lantern`,
  `obelisk`, `eclipse`, `hive`, `bulwark`, `dart`. **Boss:** `boss_graviton`.
- **Ally `amari_shuttle`:** 90×110 px white science shuttle `#eef2f6` with violet lens windows `#a98bff`,
  a ring-shaped gravity coil around its waist that glows when it moves. HP 500, r 36. Flies the center lane
  at y 1000 until 50 s, docks at the lab (invulnerable while docked, 50-56 s), then follows the player's x at
  y 1080 (max 120 px/s).
- **Pods:** 5 pods, 11 people. **Rewards:** first clear 550 credits + skill; replay 220 credits.

| t | Events | Notes |
|---|---|---|
| 0 | `music mus_side` · `scroll 110` · `bg rift` · `radio s2_r01` | |
| 3 | `loop_swarm hornet×8 {side:left}` | |
| 8 | `hazard gravity_rift {y:560, angle:0.12, life:18, flip:4}` · `radio s2_r02` | |
| 12 | `spawn lantern x240` · `spawn lantern x480` | seeds bend at the rift |
| 18 | `sine_chain wisp×10 {side:right}` | |
| 22 | `pod 2p x300` | |
| 24 | `pickup weapon_cycle x360` | |
| 26 | `spawn obelisk x360` | PEAK |
| 32 | `hazard gravity_rift {y:420, angle:-0.2, life:16, flip:3}` | |
| 34 | `cross_strafe harrier×2` | |
| 40 | `pincer razor×4` | |
| 44 | `pod 3p x520` | |
| 48 | `waitClear 10` | |
| 50 | `checkpoint` · `bg lab` · `scroll 60` · `radio s2_r03` | shuttle docks |
| 54 | `radio s2_r04` | prompt |
| 56 | `choice s2_core` | |
| 57 | `radio s2_r05` if weaponize · `radio s2_r06` if harness | |
| 60 | weaponize: `hazard blackhole {x:200, y:360, size:'small', life:14}` · `radio s2_r07` | |
| 62 | weaponize: `spawn eclipse x360` | PEAK (three gravity wells) |
| 70 | weaponize: `hazard blackhole {x:520, y:520, size:'medium', life:14}` · `loop_swarm hornet×8 {side:right}` | |
| 60 | harness: `hazard gravity_rift {y:600, angle:0, life:24, flip:6}` · `radio s2_r08` | |
| 62 | harness: `spawn hive x360` | PEAK |
| 70 | harness: `escort bulwark+razor×4 x360` | |
| 66 | `pod 2p x200` · `pod 2p x520` | |
| 78 | `wall dart×8` | |
| 80 | `pod 2p x360` | |
| 84 | `waitClear 12` | |
| 86 | `checkpoint` · `pickup bomb x360` · `radio s2_r09` | BREATHER |
| 90 | `boss boss_graviton` | radio `s2_r10` on intro, `s2_r11` on defeat |

**CHOICE `s2_core`** — dialog title "TUNE THE CORE", speaker `amari`, prompt `s2_r04`.

| Option id | Button | Card text | Skill |
|---|---|---|---|
| `s2_weaponize` | MAKE IT A WEAPON | SKILL · Singularity: throw a micro black hole that eats bullets and crushes enemies. | `sk_singularity` |
| `s2_harness` | MAKE IT AN ENGINE | ALWAYS ON · Gravity Drive: gravity pulls you less, and your guns hit 30% harder inside it. | `sk_gravity_drive` |

- **After `s2_weaponize`:** the core goes unstable. Two black holes ignite (60 s small, 70 s medium) and an
  Eclipse arrives, so the back half is three gravity wells at once. GRAVITON enters enraged: +20% fire rate.
- **After `s2_harness`:** the rifts calm down (flip every 6 s instead of 3-4 s) and the shuttle gains a
  gravity shield that absorbs 3 hits (blue-white bubble). The Vex send a hive and an escort group to grab the
  engine instead.

**Radio copy:**
- `s2_r01` (amari, t 0) "My shuttle knows the way. Keep the hornets off its hull."
- `s2_r02` (hale, t 8) "Gravity rift ahead. Cross just as it flips. The push throws you clear."
- `s2_r03` (amari, t 50) "There! The lab core. Cover me while I dock."
- `s2_r04` (amari, t 54, prompt) "I can tune the core once. A weapon, or an engine. Choose."
- `s2_r05` (amari, after weaponize) "A weapon, then. Stand back. It's waking up hungry."
- `s2_r06` (amari, after harness) "An engine. Good. Gravity will carry you now, not crush you."
- `s2_r07` (amari, t 60 weaponize) "It's unstable! Black holes forming! Use them before they use you!"
- `s2_r08` (oz, t 60 harness) "Engine's live! Fly through the rift. It feeds your guns now."
- `s2_r09` (hale, t 86) "Vex gravity tug inbound. It wants the core."
- `s2_r10` (vessane, boss intro) "Give me the equation, Doctor. Or I take it from your ashes."
- `s2_r11` (amari, boss defeated) "The core is safe. So are we. Thank you, {callsign}."
- `s2_r12` (amari, shuttle hull below 50%) "Hull breach on the shuttle! I'd like to keep my air, please."
