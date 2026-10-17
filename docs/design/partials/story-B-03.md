
## 3. Story

### 3.1 Premise
The Lyra Reach is a frontier cluster of a dozen colonies. Dr. Ines Sol built the singularity engine there to
open gravity lanes for colony ships. The Vanta Armada stole it, built a flagship around it, the *Dreadmaw*,
and now uses it as a weapon: the Maw. It opens a black hole on a world, the world falls in, and the Armada
moves on. Next on its list is the Lyra sun itself.

The carrier *Halcyon* is the last Lyra Defense Fleet ship in the Reach. It is evacuating everyone it can toward
the Sanctum jump gate. The Armada wants the carrier dead, and the carrier has one answer: the XF-9 *Starlance*.

The main story is five missions and a line of dialogue each way. The side stories are where the crew gets
personal and where your jet learns its skills.

**Prologue card** (new game, shown over the title backdrop, 3 lines, one at a time, 2.5 s each):
1. "The Vanta Armada has a weapon that makes black holes."
2. "Six worlds of the Lyra Reach are gone. The carrier Halcyon is running."
3. "Its last hope is a prototype jet. Its pilot is you."

### 3.2 Briefings
A briefing is one screen: title, location, 2-4 radio lines (portrait and typewriter, tap to skip a line),
objectives, LAUNCH. Lines marked *(co-op)* replace the line above them when two players fly.
Objectives marked *bonus* do not block completion; each pays credits (section 13.3).

**m1 First Light** · Talos Ring, gas giant Talos
- `vega`: "The Armada hit the Talos Ring an hour ago. Forty thousand people are still in the docks."
- `patch`: "The Starlance is fueled and grumpy. So am I. Bring her back in one piece."
- `patch` *(co-op)*: "Both Starlances are fueled. Two jets, one paint budget. Bring them back."
- `vega`: "Clear the lanes, cover the shuttles, pick up anyone drifting. Launch when ready, {callsign}."
- Objectives: `m1_obj_boss` "Destroy the strike carrier Gravewing" · `m1_obj_rescue` *bonus* "Rescue 20
  people" · `m1_obj_vip` *bonus* "Find Captain Tamsin's escape pod"

**m2 Gravity Well** · Port Meridian, mining colony
- `vega`: "Port Meridian went dark. Then the stars around it started to bend."
- `rook`: "Something out there is eating light. Love that for us."
- `vega`: "The Armada opened a black hole on the colony. Get the miners out and kill what made it."
- Objectives: `m2_obj_boss` "Destroy the singularity ship Black Lotus" · `m2_obj_rescue` *bonus* "Rescue 25
  people" · `m2_obj_vip` *bonus* "Find the scientist who sent the distress call"

**m3 Stormglass** · Ionis Nebula
- `vega`: "The Armada is regrouping inside the Ionis Nebula. Ion storms, no visibility."
- `patch`: "Lightning eats shields for breakfast. Stay out of the blue stuff."
- `vega`: "Find their staging fleet and break it. Anything that surrenders, you bring home."
- Objectives: `m3_obj_boss` "Destroy the storm dreadnought Tempest" · `m3_obj_rescue` *bonus* "Rescue 25
  people" · `m3_obj_vip` *bonus* "Pick up the Armada pod with the white beacon"

**m4 Crown of Fire** · Pyre Star, a dying red giant
- `sol`: "They're draining the Pyre Star to feed the Maw. Once it's full, it eats the Lyra sun."
- `vega`: "The siphon ship Sunbreaker is their battery. Take it out. Mind the flares."
- `rook`: "Fire, mines and a giant battery. Race you there, {callsign}."
- Objectives: `m4_obj_boss` "Destroy the siphon battleship Sunbreaker" · `m4_obj_rescue` *bonus* "Rescue 30
  people" · `m4_obj_vip` *bonus* "Bring every pilot home"

**m5 The Maw** · The Black Veil, flagship Dreadmaw
- `vega`: "This is it. The Dreadmaw sits at the heart of the Veil, and the Maw is open."
- `sol`: "Hit the Maw core when it flares white. That's the only window. I'm sorry I built it."
- `patch`: "Everything I've got is bolted to that jet. Spend all of it."
- `vega`: "The Halcyon flies with you. Bring everyone home, {callsign}."
- Objectives: `m5_obj_boss` "Destroy the Dreadmaw and close the Maw" · `m5_obj_rescue` *bonus* "Rescue 30
  people" · `m5_obj_nohit` *bonus* "Beat the Dreadmaw with no lives lost"

**s1 Lantern Run** · Talos Wake, the debris lanes behind Talos
- `tamsin`: "The Lantern carries two thousand souls and one bad engine. The Armada knows it."
- `patch`: "My kid brother Milo is on that ship. Please, {callsign}."
- `vega`: "Escort the Lantern to the jump point. It doesn't stop, so neither do you."
- Objectives: `s1_obj_escort` "Keep the Lantern flying" · `s1_obj_boss` "Destroy the jammer frigate Hush" ·
  `s1_obj_rescue` *bonus* "Rescue 15 people"

**s2 Event Horizon** · The Cradle, home of the caged black hole Hollow Star
- `sol`: "The Armada keeps a black hole in a cage at the Cradle. My research array still orbits it."
- `sol`: "If they crack that array, every star in the Reach becomes a door for the Maw."
- `vega`: "Get in, get the array, get out. Doc rides with you on comms."
- Objectives: `s2_obj_array` "Reach Dr. Sol's research array" · `s2_obj_boss` "Destroy the Cagewarden" ·
  `s2_obj_rescue` *bonus* "Rescue 10 people"

**s3 Wraith** · The Needle Field, an Armada minefield
- `wraith`: "The Armada builds its jets in a yard hidden in the Needle Field. I know the way in."
- `rook`: "She knows the way in. Great. Does she know the way out?"
- `vega`: "Follow her lead until she gives you a reason not to. Hit the yard."
- Objectives: `s3_obj_yard` "Destroy the shipyard's four slipway cranes" · `s3_obj_boss` "Defeat the ace
  Jackal" · `s3_obj_rescue` *bonus* "Rescue 10 people"

**s4 No One Left Behind** · The Oubliette, a prison hulk in the Pyre Star's shadow
- If `rook_rescued` (you saved Rook's pod in m4):
  - `rook`: "The Oubliette holds sixty of our pilots. I came this close to being one."
  - `vega`: "Break the hulk open and bring them home. Every pod counts."
  - `rook`: "I'm flying your wing on this one. No arguments."
- If Rook was captured:
  - `vega`: "Rook is alive. The Armada took him to the prison hulk Oubliette."
  - `patch`: "Sixty pilots in there, and one owes me forty credits. Go get him, {callsign}."
- Objectives: `s4_obj_free` "Free the prisoners: rescue 40 people" · `s4_obj_boss` "Destroy the Warden" ·
  `s4_obj_rook` (captured variant only) "Rescue Rook"

### 3.3 Ending and epilogue
After the Dreadmaw's death sequence the screen holds on the Maw collapsing to a white point, a silent beat,
then a ring of light (shockwave) and the Lyra sun's glare washing in from the top. Then the `ending` screen.

**Ending radio** (auto-advancing, 3 s per line):
1. `vega`: "The Maw is closed. The Lyra sun is still burning. All wings, come home."
2. `rook`: "Told you I'd win the race. Fine, call it a tie. Don't tell anyone."
3. `sol`: "The engine is gone. Good. Next time I build a door, I'll build a lock first."
4. `patch`: "Look at her. Scorched, dented, perfect. Get in here, {callsign}."

**Epilogue card** (lines appear one by one; conditional lines only when their flag is set):
- "The Lyra Reach lives."
- "{rescued_total} people you pulled from the dark made it home."
- If `s1` done: "The Lantern reached Sanctum. Milo says he wants to be a mechanic."
- If `choice_wraith` = `trust`: "Wraith flies with the Halcyon now. Her visor is still white."
- If `choice_wraith` = `cuff`: "Wraith sits in the brig, drawing star maps for the fleet. She asked for paper."
- If `s4` done: "Sixty pilots walked off the Oubliette and into the Halcyon's mess hall."
- If no side stories done: "Somewhere out there, people are still waiting for a Starlance."
- "The Halcyon flies on."
- Final stamp: "STARLANCE · MISSION ACCOMPLISHED", then the credit line "Thanks for flying, {callsign}."

**Post-credits sting** (one line, after 4 s on a black screen): `corvane`, static-wrecked: "Little light...
the Veil... remembers." Then the title screen. (No sequel content; it is flavor.)
