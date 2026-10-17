// Prints the spoken lines of every story cutscene as JSON, for tools/narrate.py and tools/build.py.
// Usage: node tools/cutscene_lines.js
// Reads cutscenes/earth-vanguard-cutscenes/cutscenes/scenes.js (window.CUTSCENES) and walks each cutscene's shots,
// lines and choice replies in order. Terminal printouts and "(What do you say?)" prompts are not spoken; title cards
// are not narrated. Each line gets a clip id cs_<cutscene>_<nn> (in reading order) and a voice role.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'cutscenes', 'earth-vanguard-cutscenes', 'cutscenes', 'scenes.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(FILE, 'utf8') + '\n;window.__N = typeof N !== "undefined" ? N : {};', sandbox);
const scenes = sandbox.window.CUTSCENES || {};
const N = sandbox.window.__N || {};

function role(who) {
  if (!who) return 'Narrator';
  if (who === 'Puff') return 'Puff';
  if (who === N.HERO || who === '???') return 'Blue Arrow';
  if (who === N.COMMANDER) return 'Commander Kade';
  return null;
}

const out = [];
for (const [id, shots] of Object.entries(scenes)) {
  let n = 0;
  const walk = (lines) => {
    for (const line of lines || []) {
      const text = (line.text || '').trim();
      const spoken = text && line.style !== 'terminal' && !/^\(.*\)$/.test(text);
      if (spoken) {
        const r = role(line.who);
        if (!r) throw new Error(`${id}: no voice role for speaker "${line.who}" (add one in tools/cutscene_lines.js)`);
        n++;
        out.push({ id: `cs_${id}_${String(n).padStart(2, '0')}`, cutscene: id, who: line.who || '', role: r, text });
      }
      for (const c of line.choices || []) walk(c.reply);
    }
  };
  for (const shot of shots) walk(shot.lines);
}
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
