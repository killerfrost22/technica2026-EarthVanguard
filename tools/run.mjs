// Drive the game in headless Chrome.
// Usage (from the starlance folder, using Windows node):
//   node.exe tools/run.mjs --page "dist/starlance.html?debug=1" --steps '[{"wait":1500},{"shot":"shots/title.png"}]'
// Steps: {"wait":ms} {"eval":"js expr"} {"shot":"path.png"} {"key":"Space"} {"down":"KeyW"} {"up":"KeyW"}
//        {"click":[x,y]} {"touch":["touchStart"|"touchMove"|"touchEnd",x,y]} {"mouse":["down"|"move"|"up"|"right",x,y]}
//        A shot may add "clip":[x,y,w,h,scale] (CSS px) for a zoomed close-up.
//        {"viewport":[w,h,dpr,mobile]} resizes the page mid-run (resize, DPR and orientation checks).
// Flags: --size 720x1280  --gpu default|swiftshader (default = real GPU)  --allow-errors
//        --uncapped (no display frame pacing: fps then measures real headroom; the default headless clock on this
//        machine ticks at about 57 Hz even for an empty page)
// Prints every eval result and all console errors/exceptions. Exits 1 if the page threw (unless --allow-errors).
import { launch } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const flag = (name) => argv.includes('--' + name);

const pageArg = opt('page', 'dist/starlance.html');
const [file, query = ''] = pageArg.split('?');
const url = /^(https?|file):/.test(pageArg) ? pageArg : pathToFileURL(resolve(file)).href + (query ? '?' + query : '');
const [w, h] = opt('size', '720x1280').split('x').map(Number);
const steps = JSON.parse(opt('steps', '[{"wait":1500}]'));

const b = await launch({ width: w, height: h, gpu: opt('gpu', 'default'), uncapped: flag('uncapped') });
let failed = false;
try {
  await b.goto(url);
  for (const s of steps) {
    if (s.wait) await new Promise((r) => setTimeout(r, s.wait));
    else if (s.eval) { const v = await b.eval(s.eval); console.log('EVAL', typeof v === 'string' ? v : JSON.stringify(v)); }
    else if (s.shot) { const p = resolve(s.shot); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, await b.screenshot(s.clip)); console.log('SHOT', s.shot); }
    else if (s.mouse) await b.mouse(s.mouse[0], s.mouse[1], s.mouse[2]);
    else if (s.key) await b.key(s.key);
    else if (s.down) await b.key(s.down, 'down');
    else if (s.up) await b.key(s.up, 'up');
    else if (s.click) await b.click(s.click[0], s.click[1]);
    else if (s.touch) await b.touch(s.touch[0], s.touch[1], s.touch[2]);
    else if (s.viewport) {
      // {"viewport":[w, h, dpr?, mobile?]}: resize the page mid-run (resize / DPR / orientation tests)
      const [vw, vh, dpr = 1, mobile = false] = s.viewport;
      await b.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: dpr, mobile: !!mobile });
      console.log('VIEWPORT', vw + 'x' + vh + '@' + dpr);
    }
  }
} catch (e) {
  console.log('HARNESS ERROR', e.message);
  failed = true;
}
const bad = b.logs.filter((l) => l.level === 'exception' || l.level === 'error' || l.level === 'log-error');
for (const l of b.logs) if (l.level !== 'log' && l.level !== 'info' && l.level !== 'debug') console.log(`[${l.level}] ${l.text}${l.url ? ' @' + l.url + ':' + l.line : ''}`);
console.log(bad.length ? `CONSOLE ERRORS: ${bad.length}` : 'CONSOLE ERRORS: 0');
await b.close();
process.exit(failed || (bad.length && !flag('allow-errors')) ? 1 : 0);
