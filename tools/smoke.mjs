// Smoke suite (ARCHITECTURE 6.12). Run it through tools/smoke.sh, which builds first.
// Every mission in SL.missions.ids(), solo and co-op, with autopilot=2&god=1&mute=1&seed=7, fast-forwarded in
// chunks of SL.debug.sim while the real-time loop is held (SL.debug.hold). Asserts per run: no console errors or
// exceptions, bounded entity counts, finite player positions, the director reaching the boss, the boss defeated
// within 240 s of sim time after it appears, and mission completion. Screenshots go to shots/smoke/
// (<mission>_<mode>_10s, _60s, _boss, _results). Prints a table; exits 1 when anything failed.
// The in-page suite (?test=smoke, window.__TEST__) runs first unless --no-suite.
//
// Options: --page dist/earthvanguard.html  --only m1,s2  --modes solo,coop  --chunk 2 (sim seconds per eval)
//          --max 900 (sim seconds allowed to reach the boss)  --boss-time 240  --no-suite  --no-shots
//          --limits enemies=150,ebullets=1000  --gpu default|swiftshader  --size 720x1280
import { launch } from './cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : def; };
const flag = (name) => argv.includes('--' + name);

const PAGE = opt('page', 'dist/earthvanguard.html').split('?')[0];
const ONLY = opt('only', '').split(',').map((s) => s.trim()).filter(Boolean);
const MODES = opt('modes', 'solo,coop').split(',').map((s) => s.trim()).filter((m) => m === 'solo' || m === 'coop');
const CHUNK = Math.max(0.5, Number(opt('chunk', '2')) || 2);
const MAX_TO_BOSS = Number(opt('max', '900')) || 900;
const BOSS_TIME = Number(opt('boss-time', '240')) || 240;
const SHOTS = !flag('no-shots');
const OUT = 'shots/smoke';
const [W, H] = opt('size', '720x1280').split('x').map(Number);
const LIMITS = { enemies: 150, ebullets: 1000, pbullets: 500, particles: 2500, pickups: 250, pods: 30, hazards: 8 };
for (const kv of opt('limits', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (k in LIMITS && Number(v) > 0) LIMITS[k] = Number(v);
}

const baseUrl = pathToFileURL(resolve(PAGE)).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isBad = (l) => l.level === 'exception' || l.level === 'error' || l.level === 'log-error';

const b = await launch({ width: W, height: H, gpu: opt('gpu', 'default'), uncapped: flag('uncapped') });

async function load(query) {
  await b.goto(baseUrl + '?' + query);
  for (let i = 0; i < 100; i++) {
    let ok = false;
    try { ok = await b.eval('!!(window.SL && SL.booted && SL.game && SL.game.state !== "boot")'); } catch {}
    if (ok) return true;
    await sleep(100);
  }
  return false;
}

async function shot(name) {
  if (!SHOTS) return null;
  await sleep(120);
  const p = resolve(OUT, name + '.png');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, await b.screenshot());
  return OUT + '/' + name + '.png';
}

function newErrors(from) {
  return b.logs.slice(from).filter(isBad).map((l) => l.text + (l.url ? ' @' + l.url + ':' + l.line : ''));
}

// ---------------------------------------------------------------- in-page suite
const rows = [];
let failed = false;

if (!flag('no-suite')) {
  const from = b.logs.length;
  const row = { mission: '(in-page suite)', mode: '-', status: 'FAIL', notes: [] };
  if (await load('test=smoke&mute=1&seed=7')) {
    let rep = null;
    for (let i = 0; i < 1800 && !rep; i++) {
      try { rep = await b.eval('window.__TEST__ ? JSON.stringify(window.__TEST__) : null'); } catch {}
      if (!rep) await sleep(100);
    }
    if (rep) {
      const r = JSON.parse(rep);
      row.result = r.passed + '/' + r.total;
      row.sim = (r.ms / 1000).toFixed(1) + 's real';
      for (const t of r.results) if (!t.ok) row.notes.push(t.name + ': ' + t.note);
      if (!r.failed) row.status = 'PASS';
    } else row.notes.push('window.__TEST__ never appeared');
  } else row.notes.push('page did not boot');
  const errs = newErrors(from);
  row.errors = errs.length;
  if (errs.length) { row.status = 'FAIL'; row.notes.push(...errs.slice(0, 5)); }
  if (row.status !== 'PASS') failed = true;
  rows.push(row);
}

// ---------------------------------------------------------------- missions
let ids = [];
if (await load('mute=1')) ids = JSON.parse(await b.eval('JSON.stringify(SL.missions.ids())'));
if (ONLY.length) ids = ids.filter((id) => ONLY.includes(id));
if (!ids.length) { console.log('No missions to run (SL.missions.ids() was empty or --only matched nothing).'); failed = true; }

for (const id of ids) {
  for (const mode of MODES) {
    const tag = id + '_' + mode;
    const row = { mission: id, mode, status: 'FAIL', notes: [], shots: [] };
    rows.push(row);
    const from = b.logs.length;
    // hold=1: the real-time loop never advances the mission, so runs are deterministic (only sim steps it)
    const query = 'mission=' + encodeURIComponent(id) + '&autopilot=2&god=1&mute=1&seed=7&hold=1' + (mode === 'coop' ? '&coop=1' : '');
    if (!(await load(query))) { row.notes.push('page did not boot'); failed = true; continue; }
    const st0 = JSON.parse(await b.eval('JSON.stringify(SL.debug.state())'));
    if (st0.state !== 'mission') { row.notes.push('mission did not start (state ' + st0.state + ')'); failed = true; continue; }
    if (mode === 'coop' && st0.players.length !== 2) row.notes.push('co-op started with ' + st0.players.length + ' players');
    await b.eval('SL.debug.hold = true');

    const max = { enemies: 0, ebullets: 0, pbullets: 0, particles: 0, pickups: 0, pods: 0, hazards: 0 };
    let t = 0, bossAt = null, fightStart = null, fightId = '', st = st0, shot10 = false, shot60 = false, shotBoss = false;
    let badPos = null, stopped = '';
    const fights = [];
    while (true) {
      try {
        st = JSON.parse(await b.eval('JSON.stringify(SL.debug.sim(' + CHUNK + '))'));
      } catch (e) { stopped = 'sim threw: ' + e.message; break; }
      t += CHUNK;
      for (const k in max) if (st[k] > max[k]) max[k] = st[k];
      for (const p of st.players) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < -400 || p.x > 1120 || (p.y > 1700 && !st.outro)) badPos = badPos || ('player at ' + p.x + ',' + p.y + ' at ' + t + 's');
      }
      // every boss fight (a mission may hold several boss events) must end within BOSS_TIME
      if (st.boss && fightStart == null) { fightStart = t; fightId = st.boss.id; if (bossAt == null) bossAt = t; }
      if (!st.boss && fightStart != null) { fights.push({ id: fightId, s: t - fightStart }); fightStart = null; }
      if (!shot10 && t >= 10) { shot10 = true; row.shots.push(await shot(tag + '_10s')); }
      if (!shot60 && t >= 60) { shot60 = true; row.shots.push(await shot(tag + '_60s')); }
      if (!shotBoss && fightStart != null && st.boss && !st.boss.dying && t >= fightStart + 8) { shotBoss = true; row.shots.push(await shot(tag + '_boss')); }
      if (st.result) break;
      if (st.state !== 'mission') { stopped = 'left the mission (state ' + st.state + ')'; break; }
      if (bossAt == null && t >= MAX_TO_BOSS) { stopped = 'director did not reach a boss within ' + MAX_TO_BOSS + ' s'; break; }
      if (fightStart != null && t - fightStart > BOSS_TIME) { stopped = 'boss "' + fightId + '" not defeated within ' + BOSS_TIME + ' s'; break; }
      if (t >= MAX_TO_BOSS + BOSS_TIME * 2) { stopped = 'no result after ' + t + ' s of sim time'; break; }
    }
    if (st.result) { await sleep(250); row.shots.push(await shot(tag + '_results')); }

    row.sim = t.toFixed(0) + 's';
    row.bossAt = bossAt != null ? bossAt.toFixed(0) + 's' : '-';
    row.fight = fights.length ? fights.map((f) => f.s.toFixed(0) + 's').join('+') : '-';
    row.result = st.result ? (st.result.success ? 'complete ' + st.result.rank : 'failed') : '-';
    row.score = st.result ? st.result.score : st.score;
    row.max = max;
    const errs = newErrors(from);
    row.errors = errs.length;
    const problems = [];
    if (stopped) problems.push(stopped);
    if (!bossAt) problems.push('boss never appeared');
    if (!st.result || !st.result.success) problems.push('mission not completed');
    for (const k in LIMITS) if (max[k] > LIMITS[k]) problems.push(k + ' peaked at ' + max[k] + ' (limit ' + LIMITS[k] + ')');
    if (badPos) problems.push(badPos);
    problems.push(...errs.slice(0, 5));
    if (errs.length > 5) problems.push('... ' + (errs.length - 5) + ' more console errors');
    row.notes.push(...problems);
    row.status = problems.length || row.notes.some((n) => n.startsWith('co-op')) ? 'FAIL' : 'PASS';
    if (row.status !== 'PASS') failed = true;
  }
}

await b.close();

// ---------------------------------------------------------------- table
const head = ['mission', 'mode', 'status', 'result', 'sim', 'boss at', 'fight', 'score', 'peak en/eb/pb/fx', 'errors'];
const body = rows.map((r) => [
  r.mission, r.mode, r.status, r.result || '-', r.sim || '-', r.bossAt || '-', r.fight || '-',
  r.score != null ? String(r.score) : '-',
  r.max ? [r.max.enemies, r.max.ebullets, r.max.pbullets, r.max.particles].join('/') : '-',
  String(r.errors != null ? r.errors : '-'),
]);
const widths = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
const line = (cells) => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
console.log('');
console.log(line(head));
console.log('|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|');
for (const row of body) console.log(line(row));
console.log('');
for (const r of rows) {
  if (r.notes.length) {
    console.log(r.mission + (r.mode !== '-' ? ' [' + r.mode + ']' : '') + ':');
    for (const n of r.notes) console.log('  - ' + n);
  }
}
const shots = rows.flatMap((r) => r.shots || []).filter(Boolean);
if (shots.length) console.log('Screenshots: ' + shots.length + ' in ' + OUT + '/');
console.log(failed ? 'SMOKE: FAIL' : 'SMOKE: PASS');
process.exit(failed ? 1 : 0);
