# Notes and open questions

Places where this storyline and the current game (or the draft text) don't match yet. Decide each one, then update
the story files or the game.

## Echo: a girl or a fish?

The story says the player controls "a girl" in Echo, but also that "the fish represents the protagonist" and that
she searches for her **school** of fish. The Echo minigame in the game right now (`src/24_echo.js`) is the girl:
she escapes a dark facility floor by floor, sees with sound, avoids drones, cameras and lasers, and ends by climbing
out under the open sky. There is no fish or school in it.

Options: keep the girl (and drop the fish lines here), make the player a fish whose goal is reaching its school,
or keep the girl and add the fish as a symbol (for example in the ending or the memory shards).

## Names in the game

- Echo calls her **Subject 7** (her facility number), and names the facility's operator **the Directorate**.
  The story names her **Blue Angel** and doesn't name the subordinate organization. Should Subject 7 stay as her
  number in the facility, with Blue Angel as the name she takes later?
- The advanced civilization has no name yet. The game only refers to it indirectly ("a civilization far older
  than ours").
- **Earth Vanguard** is marked as a temporary name.

## The player's jet and callsign

The shooter currently calls the pilot by a callsign (default LANCE) flying the XF-9 Starlance from the carrier
Halcyon, with a crew listed in `docs/GDD.md`. Is the pilot Blue Angel (with LANCE as her callsign), or someone else?

## Puff

- The draft switched between "he" and "she" for Puff. These files use **he** throughout, which matches most of the
  draft and the game's code (`src/25_puffstory.js`).
- Puff's Ocean's intro and the black-hole memory in Mission 1 (`src/25_puffstory.js`) already place the trials on
  his home ocean world. The game-over "ocean facts" are real facts about **Earth's** oceans; keep them as a link
  to the real world, or reframe them?

## Decisions and trust

"The relationship develops based on the player's decisions and actions." The game already has radio choices in
missions. Which choices and actions raise Puff's trust, and what does each level of trust unlock (memories,
lines, endings)?
