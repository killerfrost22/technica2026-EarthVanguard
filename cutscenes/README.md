# Cutscenes

The story cutscenes live in [`earth-vanguard-cutscenes/`](earth-vanguard-cutscenes/). The script (all the text,
art, backgrounds and choices) is [`earth-vanguard-cutscenes/cutscenes/scenes.js`](earth-vanguard-cutscenes/cutscenes/scenes.js).

- **Preview:** open `earth-vanguard-cutscenes/demo.html` in a browser, or open the game with `?cutscene=<id>`
  (for example `dist/earthvanguard.html?cutscene=intro`).
- **In the game:** `python3 tools/build.py` inlines the three cutscene files into `dist/earthvanguard.html`, and
  `src/26_cutscenes.js` plays them at the right moments. Rebuild after editing `scenes.js`.

The story order and where each cutscene plays are in
[`earth-vanguard-cutscenes/README.md`](earth-vanguard-cutscenes/README.md). The background story they follow is in
[`../storyline/`](../storyline/).
