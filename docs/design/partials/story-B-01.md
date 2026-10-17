# STARLANCE: Game Design Document (story, choices and progression draft)

Draft lens: story, choices and progression. Every number here is tuned against `docs/ARCHITECTURE.md` section 5
(Pilot difficulty unless stated). Ids are lowercase snake_case and are collected in section 20.
Radio copy is final and at most 90 characters with a 10-letter callsign substituted.

## 1. Pitch and tone

**Pitch.** The Vanta Armada came out of the Black Veil with a weapon that makes black holes, and one by one the
worlds of the Lyra Reach are falling in. The carrier *Halcyon* is the last ship standing between the Armada and
two million refugees, and its best weapon is a prototype jet: the XF-9 *Starlance*. You fly it. Five missions take
you from a burning evacuation ring to the throat of the Armada flagship, through black holes that bend your
lasers, ion storms that short your shield and solar flares that sweep the screen. Between battles you pull
civilians out of escape pods, spend hard-won credits in Patch's hangar, and fly four short side stories where
one radio call, *trust her or cuff her, stay or strike*, decides which skill your jet learns. A friend can grab a
second jet, the gold XF-9B *Sunlance*, on the same keyboard.

**Tone.** Bright, brave, a little cheeky. Saturday-morning space opera with real stakes and zero homework: the
crew jokes under fire, the villain is grand and cold, and every briefing is four lines long. Loss is felt
through the people you did or did not save, never through cutscenes. Nobody monologues while you are dodging.

**What makes it feel like Lightning Fighter.**
- Portrait 9:16 vertical scroller, finger-drag movement, auto-fire on, a tiny hitbox inside a big glossy jet.
- Weapon pickups that visibly transform your fire: twin lasers that thicken into four, a fan that widens to
  seven, a piercing beam that swells from a needle into a pillar.
- Chunky glossy metal enemies with emissive seams; explosions that fill the screen; credit crystals that rain
  and swirl into your magnet.
- Huge multi-phase bosses with named health bars, phase pips and a slow-motion death.
- A between-missions upgrade loop (hangar plus skill tree) that makes the jet feel stronger every sortie.
- What we add on top: black holes that warp the whole screen (and your bullets), people to rescue in the
  crossfire, a crew that talks to you, and choices that shape your build.

## 2. Characters

All portraits are procedural busts drawn in a 160x160 canvas (`SL.story.characters[id].portrait`), lit from the
upper left, with a colored rim light from the right in the character's `color`. Talking animation: the mouth
(or visor glow, for helmets) pulses with the typewriter, the head bobs 1 px at 3 Hz, and a scanline overlay
(2 px lines, 8% alpha) scrolls downward at 20 px/s. Every radio line plays the speaker's chirp, then 0.25 s of
`radio_static` under the first characters.

| id | Name | Callsign | Role | Color |
|---|---|---|---|---|
| `vega` | Commander Imani Vega | ANCHOR | Captain of the carrier *Halcyon*; mission commander | `#3fc8ff` |
| `rook` | Lt. Tomas Reyes | ROOK | Your wingmate; flies an LF-7 *Kite* interceptor | `#ff8a3d` |
| `patch` | Chief Nell Okafor | PATCH | Chief mechanic; runs the hangar | `#ffb53f` |
| `tamsin` | Captain Bo Tamsin | LANTERN | Master of the refugee liner *Lantern* (VIP, m1) | `#ffd27a` |
| `sol` | Dr. Ines Sol | none ("Doc") | Astrophysicist who designed the singularity engine (VIP, m2) | `#a58bff` |
| `wraith` | Ren Ashvale | WRAITH | Armada ace who defects (VIP, m3) | `#e8eef7` |
| `corvane` | Admiral Nyx Corvane | BLACK CROWN | Commander of the Vanta Armada | `#ff2f6d` |
| `p1` | the player | `{callsign}` (default LANCE) | Pilot of the XF-9 *Starlance* | `#7fe3ff` |
| `p2` | co-op player | `{p2callsign}` (default HALO) | Pilot of the XF-9B *Sunlance* | `#ffd27a` |

### `vega`: Commander Imani Vega (ANCHOR)
- **Radio personality.** Calm, dry, protective. Short sentences, never raises her voice, finds one warm word
  per mission and spends it well. Calls the player by callsign, never "kid". The emotional anchor of the crew.
- **Sample voice.** "Steady, {callsign}. Fly the pattern, not the panic."
- **Portrait.** No helmet. Oval face, deep brown skin `#6b4a3a` with a warm highlight `#8a6450`; close-cropped
  silver hair `#c9ccd4` as a 6 px cap with soft fbm texture; small gold stud earring `#ffcf5a`. Officer headset:
  a graphite band `#2b2f3a` over the head and a thin boom mic to the mouth with a cyan tip light `#3fc8ff`.
  Navy high collar `#1d2a44` with two gold rank bars `#ffcf5a`. Background: carrier bridge, a blurred cyan
  tactical grid `#0d2338` with slow-scrolling hex lines. Eyes narrow and steady; talking = small mouth arc.
- **Chirp.** Two soft sine tones 660 Hz then 880 Hz, 60 ms each, 5 ms attack, gentle 1.2 kHz lowpass.

### `rook`: Lt. Tomas Reyes (ROOK)
- **Radio personality.** Cocky, funny, loyal to the bone. Keeps a running kill bet, nicknames every enemy ship,
  pretends not to care and always comes back for you. Distrusts the Armada defector on sight.
- **Sample voice.** "That's twelve for me. You're on what, three? Cute."
- **Portrait.** White flight helmet `#e8eef7` with an orange flash stripe `#ff8a3d` from brow to crown and a
  "7" decal; gold mirrored visor (`#ffe08a` to `#b07a1a` vertical gradient with a white specular streak)
  flipped half up. Visible lower face: tan skin `#c08a62`, stubble (dark dots, 20% alpha), crooked grin.
  Oxygen hose `#3a3f55` curling down-left. Background: cockpit glass with orange HUD reticle reflections.
- **Chirp.** Square-wave double blip 1200 Hz then 1500 Hz, 40 ms each, 30 ms apart, highpassed at 600 Hz.

### `patch`: Chief Nell Okafor (PATCH)
- **Radio personality.** Gruff, motherly, technical. Talks to the jet more than the pilot ("easy, girl"),
  measures life in credits and bolts, gives the upgrade tips. Her little brother Milo rides the *Lantern*.
- **Sample voice.** "You scratch my paint, you buy the paint. Bring her home."
- **Portrait.** Round face, dark brown skin `#4e3426`, freckles of lighter dots, black curly hair `#16161d`
  tied up under a red bandana `#d8434a` with white dots. Welding goggles pushed up on the forehead: graphite
  frames `#2b2f3a`, amber lenses `#ffb53f` with a hot specular dot. Grease smudge `#1c1f2b` on one cheek,
  headset on one ear, orange coverall collar `#c4622d`. Background: hangar bay, warm amber lamp bokeh.
- **Chirp.** Triangle wave 440 Hz, 70 ms, plus a 30 ms bandpassed noise crackle and a 2.4 kHz metallic ping.

### `tamsin`: Captain Bo Tamsin (LANTERN)
- **Radio personality.** Old, gentle, formal ("pilot", "if you please"), seafaring metaphors. Has carried
  refugees across the Reach for thirty years and is very tired of it. Quietly fierce when his ship is hit.
- **Portrait.** Long face, pale weathered skin `#d9b99b` with line strokes at the eyes, full grey beard
  `#a7a9b0` (noise-textured), captain's cap `#20324f` with a gold lantern badge `#ffd27a`, a scarf `#6a2f2f`.
  Background: liner bridge with warm cabin light `#ffcf8a` and porthole circles.
- **Chirp.** A soft bell: sine 520 Hz plus a 1435 Hz partial at 30%, 10 ms attack, 180 ms decay.

### `sol`: Dr. Ines Sol ("Doc")
- **Radio personality.** Fast, brilliant, excitable, guilt-ridden. She built the singularity engine to open
  gravity lanes for colony ships; the Armada stole it. Explains black holes in one breath and apologizes in
  the next. Says "beautiful" about terrifying things.
- **Portrait.** Heart-shaped face, olive skin `#b98f6b`, black bob `#16161d` with a white streak on the left,
  round wire glasses with a violet reflection band `#a58bff` sweeping across every 3 s. Lab collar `#e8eef7`
  with a glowing holo-pen `#a58bff` clipped to it. Background: swirling violet accretion-disc doodles on a
  dark lab screen `#120d22`.
- **Chirp.** FM sine bloop: carrier 900 Hz, modulator 45 Hz at depth 300 Hz, 110 ms, pitch falling 15%.

### `wraith`: Ren Ashvale (WRAITH)
- **Radio personality.** Clipped, cold, honest, bone-dry humor. Former Armada ace who defected after seeing
  a black hole swallow a hospital moon. Uses as few words as possible. Never says thank you; pays debts in
  actions.
- **Portrait.** Armada pilot helmet: black glossy shell `#1c1f2b` with a raked crest fin and two short swept
  horns; the Armada crimson visor slit has been painted over white `#e8eef7` with a rough brush edge. When
  "talking", the white slit pulses. A thin scar line `#c9ccd4` crosses the shell above the visor.
  Background: dark red-black `#1a0a10` with a slashed-out Armada sigil.
- **Chirp.** Bandpassed noise sweep 3 kHz down to 800 Hz over 90 ms, then a dry 1.8 kHz click.

### `corvane`: Admiral Nyx Corvane (BLACK CROWN)
- **Radio personality.** Calm, grand, menacing; speaks of the void like a religion and of humans as "little
  lights". Never shouts. Interrupts the crew's channel (the radio box border turns crimson and glitches).
- **Portrait.** Full obsidian helmet `#0d0e14` with a crown of five swept fins (rim light `#3a3f55`), a single
  horizontal visor slit glowing `#ff2f6d` that brightens on speech. No face. Horizontal glitch slices offset
  by 2-6 px twice per second; chromatic red/cyan split of 1 px. Background: slow black-hole vortex (radial
  noise swirl) in `#2a0612` to `#000000`.
- **Chirp.** Ring-modulated drone: 110 Hz saw times 31 Hz sine, 160 ms, with a reversed noise swell before it.

### `p1` and `p2`: the pilots
- Silent protagonists. They speak only through choices: the chosen option's copy is shown in the radio box as
  the pilot's reply, with the pilot portrait.
- **`p1` portrait.** White flight helmet `#e8eef7` with cyan trim `#3fc8ff`, smoked visor `#0e2233` with a
  cyan HUD reflection `#7fe3ff` and the callsign stenciled on the brow. Background: cockpit, cyan glow.
- **`p2` portrait.** Graphite helmet `#2b2f3a` with gold trim `#ffb53f`, amber visor `#5a3a10` with gold
  reflection `#ffd27a`, sun-ray decal on the brow. Background: cockpit, warm gold glow.
- **Chirp.** `p1`: sine 1000 Hz, 30 ms. `p2`: sine 800 Hz, 30 ms.
