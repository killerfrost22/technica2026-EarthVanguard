/*
 * Earth Vanguard — cutscene player
 * ---------------------------------
 * Zero-dependency DOM overlay that plays motion-comic cutscenes on top of any
 * web game (Phaser, plain canvas, etc). Scene data lives in scenes.js.
 *
 *   <script src="cutscenes/cutscenes.js"><\/script>
 *   <script src="cutscenes/scenes.js"><\/script>
 *
 *   Cutscene.play('intro', { state: gameState }).then(result => {
 *     // result = { id, skipped, choices: {...}, state }
 *   });
 *
 * Optional hooks: onMusic(name) and onSfx(name) for the script's music / sfx cues, onVoice(speaking) while a
 * narration clip is sounding (to lower the music under it). The text scales with the host page's --ts (the game's
 * Text size setting; 1.15 is normal).
 *
 * Controls: click / Space / Enter / → = advance (first press finishes the
 * typing), Esc = skip the whole cutscene.
 */
(function (global) {
  'use strict';

  const CSS = `
  .cs-root{--cs-ts:calc(var(--ts, 1.15) / 1.15);position:fixed;inset:0;z-index:9999;overflow:hidden;background:#000;color:#eef2ff;
    font-family:"Barlow Semi Condensed","Trebuchet MS","Segoe UI",system-ui,sans-serif;user-select:none;cursor:pointer;
    opacity:0;transition:opacity .5s ease}
  .cs-root.cs-in{opacity:1}
  .cs-root.cs-contained{position:absolute}
  .cs-bg{position:absolute;inset:0;width:100%;height:100%;transition:opacity .45s ease}
  .cs-artstage{position:absolute;inset:0;pointer-events:none}
  .cs-artlayer{transition:opacity 1.1s ease}
  .cs-stage{position:absolute;inset:8vh 0 26% 0;display:flex;align-items:center;justify-content:center;pointer-events:none}
  .cs-layer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .9s ease}
  .cs-layer.cs-show{opacity:1}
  .cs-card{position:relative;width:min(78vw,calc(56vh * var(--arn,1.7778)));aspect-ratio:var(--ar,16/9);overflow:hidden;
    transform:rotate(var(--tilt,0deg));transition:transform .9s ease}
  .cs-card img{width:100%;height:100%;object-fit:cover;display:block;transform-origin:50% 50%;
    transition-property:transform;transition-timing-function:linear;will-change:transform}
  .cs-paper{background:#fbf8ef;padding:10px;border-radius:3px;
    box-shadow:0 20px 60px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.08)}
  .cs-paper img{border-radius:2px;mix-blend-mode:multiply;filter:sepia(.18) contrast(1.05)}
  .cs-paper::after{content:"";position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(ellipse at center,transparent 55%,rgba(60,40,10,.18) 100%)}
  .cs-ink{mix-blend-mode:screen;background:#000}
  .cs-ink img{filter:invert(1) contrast(1.3)}
  .cs-ink::after{content:"";position:absolute;inset:0;background:var(--ink,#5ee7ff);mix-blend-mode:multiply;pointer-events:none}
  .cs-ink::before{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;
    background:radial-gradient(ellipse at center,transparent 45%,#000 100%)}
  .cs-title{position:absolute;inset:0 0 18% 0;display:flex;flex-direction:column;align-items:center;justify-content:center;
    text-align:center;pointer-events:none;opacity:0;transform:scale(1.04);transition:opacity 1.1s ease,transform 3s ease}
  .cs-title.cs-show{opacity:1;transform:scale(1)}
  .cs-title h1{margin:0;font-family:"Oxanium","Trebuchet MS",system-ui,sans-serif;font-size:clamp(34px,7vw,92px);letter-spacing:.32em;font-weight:800;padding-left:.32em;
    color:#fff;text-shadow:0 0 24px rgba(120,190,255,.75),0 0 2px #fff}
  .cs-title p{margin:.9em 0 0;font-size:clamp(14px,1.8vw,22px);letter-spacing:.18em;color:#a9c4ff;text-transform:uppercase}
  .cs-box{position:absolute;left:50%;bottom:calc(6vh + 14px);transform:translateX(-50%);width:min(880px,calc(100% - 32px));
    min-height:118px;box-sizing:border-box;padding:18px 24px 22px;border-radius:10px;
    background:linear-gradient(180deg,rgba(10,16,38,.86),rgba(6,8,22,.92));
    border:1px solid rgba(140,180,255,.28);box-shadow:0 10px 40px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06);
    opacity:0;transition:opacity .35s ease}
  .cs-box.cs-show{opacity:1}
  .cs-who{font-family:"Oxanium","Trebuchet MS",system-ui,sans-serif;font-size:calc(13px * var(--cs-ts));font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#7fb2ff;margin-bottom:6px;min-height:1em}
  .cs-text{font-size:calc(clamp(16px,2.1vw,22px) * var(--cs-ts));line-height:1.5;white-space:pre-wrap}
  .cs-text.cs-terminal{font-family:"Courier New",ui-monospace,monospace;color:#ff6b6b;letter-spacing:.04em}
  .cs-text.cs-quiet{font-style:italic;color:#c9d4ee}
  .cs-next{position:absolute;right:18px;bottom:10px;font-size:14px;color:#7fb2ff;opacity:0;animation:cs-bob 1s ease-in-out infinite}
  .cs-next.cs-show{opacity:1}
  @keyframes cs-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
  .cs-choices{display:flex;flex-direction:column;gap:8px;margin-top:12px}
  .cs-choices button{all:unset;cursor:pointer;padding:10px 14px;border-radius:7px;font-size:calc(17px * var(--cs-ts));
    background:rgba(127,178,255,.1);border:1px solid rgba(127,178,255,.35);color:#eef2ff}
  .cs-choices button:hover,.cs-choices button:focus-visible{background:rgba(127,178,255,.25);border-color:#7fb2ff}
  .cs-skip{all:unset;position:absolute;top:14px;right:16px;padding:7px 12px;border-radius:6px;cursor:pointer;
    font-size:13px;letter-spacing:.08em;color:#c9d4ee;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.18);z-index:5}
  .cs-skip:hover{color:#fff;border-color:rgba(255,255,255,.5)}
  .cs-dots{position:absolute;top:22px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:5}
  .cs-dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.22)}
  .cs-dots i.cs-on{background:#7fb2ff}
  .cs-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:4}
  .cs-flash.cs-go{animation:cs-flash .9s ease-out}
  @keyframes cs-flash{0%{opacity:.95}100%{opacity:0}}
  .cs-shake{animation:cs-shake .55s linear 2}
  @keyframes cs-shake{0%,100%{transform:translate(0,0)}20%{transform:translate(-7px,4px)}40%{transform:translate(6px,-5px)}
    60%{transform:translate(-4px,-3px)}80%{transform:translate(5px,3px)}}
  .cs-letterbox::before,.cs-letterbox::after{content:"";position:absolute;left:0;right:0;height:6vh;background:#000;z-index:3}
  .cs-letterbox::before{top:0}.cs-letterbox::after{bottom:0}
  @media (prefers-reduced-motion:reduce){.cs-card img{transition:none!important}.cs-shake{animation:none}}
  `;

  const cfg = { basePath: 'cutscenes/img/', images: {}, typeSpeed: 28 };
  // Voice clips: window.CUTSCENE_VO maps a line's exact text to an audio URL (the game build fills it in from
  // narration/audio). A line without a clip just types out silently.
  const voice = new (global.Audio || function () {})();
  function stopVoice() { try { voice.pause(); } catch (e) { /* no audio */ } }
  function playVoice(text, opts) {
    const src = global.CUTSCENE_VO && global.CUTSCENE_VO[text];
    if (!src || opts.voice === false || !voice.play) return;
    voice.src = src;
    voice.currentTime = 0;
    voice.volume = opts.voiceVolume != null ? opts.voiceVolume : 1;
    const p = voice.play();
    if (p && p.catch) p.catch(() => { /* autoplay blocked: stay silent */ });
  }
  const REDUCED = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = null;

  function injectCSS() {
    if (document.getElementById('cs-style')) return;
    const s = document.createElement('style');
    s.id = 'cs-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function srcFor(name) { return cfg.images[name] || (cfg.basePath + name); }

  /* ---------------- procedural backgrounds ---------------- */
  function Backdrop(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, mode = 'black', t0 = performance.now(), raf = 0, parts = [], rings = [];
    const rnd = (a, b) => a + Math.random() * (b - a);

    function resize() {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }
    function seed() {
      parts = [];
      const n = Math.round((W * H) / 9000);
      if (mode === 'stars' || mode === 'void') {
        for (let i = 0; i < n * 1.6; i++) parts.push({ x: rnd(0, W), y: rnd(0, H), z: rnd(0.2, 1), p: rnd(0, 6.28) });
      } else if (mode === 'ocean' || mode === 'polluted' || mode === 'collapse') {
        for (let i = 0; i < n * 0.5; i++) parts.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(1, 4), v: rnd(10, 40), k: 'b' });
        if (mode !== 'ocean') for (let i = 0; i < n * 0.35; i++)
          parts.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(2, 9), v: rnd(-6, 6), a: rnd(0, 6.28), s: rnd(-.6, .6), k: 'd' });
      } else if (mode === 'burn') {
        for (let i = 0; i < n * 0.7; i++) parts.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(1, 3), v: rnd(20, 70), w: rnd(0, 6.28) });
      } else if (mode === 'facility') {
        for (let i = 0; i < 40; i++) parts.push({ x: rnd(0, W), y: rnd(0, H), l: rnd(20, 120), v: rnd(.2, 1) });
      }
      rings = [];
    }
    function grad(c1, c2) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    function frame(now) {
      const t = (now - t0) / 1000, dt = 1 / 60;
      ctx.globalAlpha = 1;
      switch (mode) {
        case 'stars': case 'void': {
          grad(mode === 'void' ? '#000' : '#040615', mode === 'void' ? '#05030c' : '#0d1236');
          if (mode === 'stars') {
            const neb = ctx.createRadialGradient(W * .7, H * .3, 0, W * .7, H * .3, W * .6);
            neb.addColorStop(0, 'rgba(90,70,190,.20)'); neb.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
          }
          for (const s of parts) {
            s.x -= s.z * 8 * dt; if (s.x < 0) s.x += W;
            ctx.globalAlpha = (.35 + .65 * Math.abs(Math.sin(t * s.z * 1.7 + s.p))) * s.z;
            ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.z * 2, s.z * 2);
          }
          break;
        }
        case 'ocean': case 'polluted': case 'collapse': {
          if (mode === 'ocean') grad('#0d6b8f', '#021726');
          else if (mode === 'polluted') grad('#26362a', '#070b08');
          else grad('#3a1a14', '#080404');
          // light rays
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 5; i++) {
            const x = W * (i / 5) + Math.sin(t * .3 + i) * 60;
            ctx.globalAlpha = mode === 'ocean' ? .07 : .025;
            ctx.fillStyle = mode === 'collapse' ? '#ff5a3c' : '#bff3ff';
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 120, 0); ctx.lineTo(x - 60, H); ctx.lineTo(x - 200, H); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          for (const p of parts) {
            if (p.k === 'b') {
              p.y -= p.v * dt; p.x += Math.sin(t * 2 + p.y * .02) * .3;
              if (p.y < -10) { p.y = H + 10; p.x = rnd(0, W); }
              ctx.globalAlpha = mode === 'ocean' ? .45 : .2;
              ctx.strokeStyle = '#d9fbff'; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.stroke();
            } else {
              p.x += p.v * dt; p.y += Math.sin(t + p.x * .01) * .15; p.a += p.s * dt;
              if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
              ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
              ctx.globalAlpha = .55; ctx.fillStyle = mode === 'collapse' ? '#5a2a20' : '#4b5446';
              ctx.fillRect(-p.r, -p.r * .6, p.r * 2, p.r * 1.2); ctx.restore();
            }
          }
          if (mode === 'collapse') {
            ctx.globalAlpha = .18 + .14 * Math.sin(t * 5);
            ctx.fillStyle = '#ff2a1a'; ctx.fillRect(0, 0, W, H);
          }
          break;
        }
        case 'burn': {
          grad('#0a0303', '#3b0c04');
          const g = ctx.createRadialGradient(W * .5, H * 1.1, 0, W * .5, H * 1.1, H * .9);
          g.addColorStop(0, `rgba(255,110,30,${.35 + .08 * Math.sin(t * 7)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          for (const e of parts) {
            e.y -= e.v * dt; e.x += Math.sin(t * 3 + e.w) * .6;
            if (e.y < -5) { e.y = H + 5; e.x = rnd(0, W); }
            ctx.globalAlpha = Math.max(0, e.y / H) * .9;
            ctx.fillStyle = e.r > 2 ? '#ffb347' : '#ff6a2a'; ctx.fillRect(e.x, e.y, e.r, e.r);
          }
          break;
        }
        case 'facility': {
          grad('#07090c', '#0e1216');
          ctx.strokeStyle = 'rgba(80,110,130,.10)'; ctx.lineWidth = 1;
          for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
          for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
          const sy = (t * 120) % (H + 200) - 100;
          const sg = ctx.createLinearGradient(0, sy - 60, 0, sy + 60);
          sg.addColorStop(0, 'rgba(255,40,40,0)'); sg.addColorStop(.5, 'rgba(255,40,40,.16)'); sg.addColorStop(1, 'rgba(255,40,40,0)');
          ctx.fillStyle = sg; ctx.fillRect(0, sy - 60, W, 120);
          for (const p of parts) {
            p.x += p.v; if (p.x > W) p.x = -p.l;
            ctx.globalAlpha = .12; ctx.fillStyle = '#9fc7d8'; ctx.fillRect(p.x, p.y, p.l, 1);
          }
          ctx.globalAlpha = (Math.sin(t * 4) > .2) ? .9 : .15;
          ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(W - 40, 40, 6, 0, 6.28); ctx.fill();
          break;
        }
        case 'sonar': {
          ctx.globalAlpha = 1; ctx.fillStyle = '#010306'; ctx.fillRect(0, 0, W, H);
          if (Math.random() < .018 || rings.length === 0) rings.push({ x: rnd(W * .2, W * .8), y: rnd(H * .2, H * .7), r: 0 });
          for (const r of rings) {
            r.r += 140 * dt;
            for (let k = 0; k < 3; k++) {
              const rr = r.r - k * 26; if (rr <= 0) continue;
              ctx.globalAlpha = Math.max(0, 1 - rr / (W * .55)) * (.55 - k * .15);
              ctx.strokeStyle = '#5ee7ff'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.arc(r.x, r.y, rr, 0, 6.28); ctx.stroke();
            }
          }
          rings = rings.filter(r => r.r < W * .6);
          break;
        }
        default: ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      }
      raf = requestAnimationFrame(frame);
    }
    return {
      start() { resize(); global.addEventListener('resize', resize); raf = requestAnimationFrame(frame); },
      stop() { cancelAnimationFrame(raf); global.removeEventListener('resize', resize); },
      async set(m) {
        m = m || 'black';
        if (m === mode) return;
        canvas.style.opacity = 0; await sleep(420);
        mode = m; seed(); canvas.style.opacity = 1;
      }
    };
  }

  /* ---------------- player ---------------- */
  function buildDOM(parent) {
    const root = el('div', 'cs-root cs-letterbox' + (parent !== document.body ? ' cs-contained' : ''), parent);
    const ui = {
      root,
      bg: el('canvas', 'cs-bg', root),
      artStage: el('div', 'cs-artstage', root),
      stage: el('div', 'cs-stage', root),
      title: el('div', 'cs-title', root),
      box: el('div', 'cs-box', root),
      flash: el('div', 'cs-flash', root),
      dots: el('div', 'cs-dots', root),
      skip: el('button', 'cs-skip', root),
    };
    ui.layers = [el('div', 'cs-layer', ui.stage), el('div', 'cs-layer', ui.stage)];
    ui.artLayers = [el('div', 'cs-layer cs-artlayer', ui.artStage), el('div', 'cs-layer cs-artlayer', ui.artStage)];
    ui.who = el('div', 'cs-who', ui.box);
    ui.text = el('div', 'cs-text', ui.box);
    ui.choices = el('div', 'cs-choices', ui.box);
    ui.next = el('div', 'cs-next', ui.box);
    ui.next.textContent = '▸';
    ui.skip.textContent = 'SKIP ⏭  (Esc)';
    ui.skip.type = 'button';
    return ui;
  }

  function play(id, opts) {
    opts = opts || {};
    const scenes = global.CUTSCENES || {};
    const shots = Array.isArray(id) ? id : scenes[id];
    if (!shots) return Promise.reject(new Error('Unknown cutscene: ' + id));
    if (active) active.abort();
    injectCSS();

    const state = opts.state || {};
    const result = { id, skipped: false, choices: {}, state };
    if (opts.onVoice) {
      voice.onplaying = () => opts.onVoice(true);
      voice.onpause = voice.onended = () => opts.onVoice(false);
    }
    const ui = buildDOM(opts.parent || document.body);
    const bd = Backdrop(ui.bg);
    let waiter = null, skipped = false, layerIdx = 0;

    const advance = () => { if (waiter) { const w = waiter; waiter = null; w(); } };
    const waitInput = () => new Promise(r => { waiter = r; if (skipped) advance(); });
    const doSkip = () => { skipped = true; result.skipped = true; stopVoice(); advance(); };

    function onKey(e) {
      if (['Space', 'Enter', 'NumpadEnter', 'ArrowRight', 'Escape'].includes(e.code)) {
        if (ui.choices.childElementCount && e.code !== 'Escape') return; // let buttons handle keys
        e.preventDefault(); e.stopPropagation();
        if (e.repeat) return;
        e.code === 'Escape' ? doSkip() : advance();
      }
    }
    function onClick(e) {
      if (e.target.closest('.cs-skip')) { doSkip(); return; }
      if (e.target.closest('.cs-choices')) return;
      advance();
    }
    global.addEventListener('keydown', onKey, true);
    ui.root.addEventListener('pointerdown', onClick);

    // progress dots
    shots.forEach(() => el('i', '', ui.dots));

    function flash() { ui.flash.classList.remove('cs-go'); void ui.flash.offsetWidth; ui.flash.classList.add('cs-go'); opts.onSfx && opts.onSfx('flash'); }
    function shake() { if (REDUCED) return; [ui.stage, ui.artStage].forEach(n => { n.classList.remove('cs-shake'); void n.offsetWidth; n.classList.add('cs-shake'); }); }

    let artIdx = 0, lastArt = null;
    function showArt(shot) {
      const A = global.CUTSCENE_ART;
      const key = shot.art && A && A.has(shot.art) ? shot.art : null;
      const old = ui.artLayers[artIdx];
      if (key === lastArt && key && !shot.cam) return;      // same picture continues
      lastArt = key;
      artIdx ^= 1;
      const layer = ui.artLayers[artIdx];
      layer.innerHTML = '';
      if (!key) { old.classList.remove('cs-show'); return; }
      const wrap = el('div', 'cs-art', layer);
      const cam = el('div', 'cs-art-cam', wrap);
      cam.innerHTML = A.render(key);
      const c = shot.cam || {};
      const from = c.from || [1.0, 0, 0], to = c.to || [1.08, 0, -1];
      const tf = v => `scale(${v[0]}) translate(${v[1]}%,${v[2]}%)`;
      cam.style.transform = tf(from); cam.style.transitionDuration = '0ms';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        layer.classList.add('cs-show'); old.classList.remove('cs-show');
        if (!REDUCED) { cam.style.transitionDuration = (c.dur || 12000) + 'ms'; cam.style.transform = tf(to); }
      }));
    }

    function showPanel(shot) {
      const old = ui.layers[layerIdx];
      layerIdx ^= 1;
      const layer = ui.layers[layerIdx];
      layer.innerHTML = '';
      if (!shot.img) { old.classList.remove('cs-show'); return; }
      const card = el('div', 'cs-card ' + (shot.style === 'ink' ? 'cs-ink' : 'cs-paper'), layer);
      if (shot.ink) card.style.setProperty('--ink', shot.ink);
      card.style.setProperty('--tilt', (shot.tilt != null ? shot.tilt : 0) + 'deg');
      const img = el('img', '', card);
      img.alt = shot.alt || '';
      img.onload = () => {
        card.style.setProperty('--ar', img.naturalWidth + '/' + img.naturalHeight);
        card.style.setProperty('--arn', (img.naturalWidth / img.naturalHeight).toFixed(4));
      };
      img.src = srcFor(shot.img);
      const cam = shot.cam || {};
      const from = cam.from || [1.0, 0, 0], to = cam.to || [1.12, 0, 0];
      const tf = c => `scale(${c[0]}) translate(${c[1]}%,${c[2]}%)`;
      img.style.transform = tf(from);
      img.style.transitionDuration = '0ms';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        layer.classList.add('cs-show'); old.classList.remove('cs-show');
        if (!REDUCED) { img.style.transitionDuration = (cam.dur || 10000) + 'ms'; img.style.transform = tf(to); }
      }));
    }

    function showTitle(shot) {
      ui.title.classList.remove('cs-show');
      ui.title.innerHTML = '';
      if (!shot.title) return;
      el('h1', '', ui.title).textContent = shot.title;
      if (shot.sub) el('p', '', ui.title).textContent = shot.sub;
      requestAnimationFrame(() => ui.title.classList.add('cs-show'));
    }

    async function typeLine(line) {
      ui.box.classList.add('cs-show');
      ui.next.classList.remove('cs-show');
      ui.who.textContent = line.who || '';
      ui.text.className = 'cs-text' + (line.style ? ' cs-' + line.style : '');
      ui.text.textContent = '';
      const txt = line.text || '';
      if (line.sfx && opts.onSfx) opts.onSfx(line.sfx);
      stopVoice();
      if (!skipped) playVoice(txt, opts);
      let i = 0, done = false;
      const speed = line.speed || cfg.typeSpeed;
      const typing = new Promise(res => {
        const tick = () => {
          if (done) return;
          i = Math.min(txt.length, i + 1);
          ui.text.textContent = txt.slice(0, i);
          if (i >= txt.length) { done = true; res(); } else setTimeout(tick, txt[i - 1] && '.,!?—…'.includes(txt[i - 1]) ? speed * 6 : speed);
        };
        tick();
      });
      if (!skipped) await Promise.race([typing, waitInput()]);
      done = true; ui.text.textContent = txt;
      if (skipped) return;
      if (line.choices) return;
      ui.next.classList.add('cs-show');
      if (line.auto) await Promise.race([sleep(line.auto), waitInput()]);
      else await waitInput();
      waiter = null;
    }

    async function choose(line) {
      if (skipped) {
        const def = line.choices[line.default || 0];
        if (line.id) result.choices[line.id] = def.value;
        def.effect && def.effect(state);
        return null;
      }
      return new Promise(res => {
        line.choices.forEach((c, k) => {
          const b = el('button', '', ui.choices);
          b.textContent = c.text; b.type = 'button';
          b.onclick = ev => {
            ev.stopPropagation();
            ui.choices.innerHTML = '';
            if (line.id) result.choices[line.id] = c.value;
            c.effect && c.effect(state);
            res(c);
          };
          if (k === 0) setTimeout(() => b.focus(), 30);
        });
        // clicks on the background don't advance past a choice; Esc picks the default
        const guard = () => {
          if (!skipped) { waiter = guard; return; }
          ui.choices.innerHTML = '';
          const def = line.choices[line.default || 0];
          if (line.id) result.choices[line.id] = def.value;
          def.effect && def.effect(state);
          res(null);
        };
        waiter = guard;
      });
    }

    async function runLines(lines) {
      for (const line of lines || []) {
        if (skipped) break;
        if (line.when && !line.when(state)) continue;
        await typeLine(line);
        if (line.choices) {
          const picked = await choose(line);
          if (picked && picked.reply) await runLines(picked.reply);
        }
      }
    }

    const run = async () => {
      // cleanup always runs: a throw mid-cutscene must not leave the overlay and its key capture over the page
      try {
        bd.start();
        requestAnimationFrame(() => ui.root.classList.add('cs-in'));
        for (let i = 0; i < shots.length && !skipped; i++) {
          const shot = shots[i];
          if (shot.when && !shot.when(state)) continue;
          [...ui.dots.children].forEach((d, k) => d.classList.toggle('cs-on', k <= i));
          ui.box.classList.remove('cs-show');
          ui.title.classList.remove('cs-show');
          if (shot.music && opts.onMusic) opts.onMusic(shot.music);
          if (shot.sfx && opts.onSfx) opts.onSfx(shot.sfx);
          await bd.set(shot.bg);
          showArt(shot);
          showPanel(shot);
          showTitle(shot);
          if (shot.flash) flash();
          if (shot.shake) shake();
          await sleep(shot.img || shot.title || shot.art ? 650 : 250);
          if (shot.lines && shot.lines.length) await runLines(shot.lines);
          else await Promise.race([sleep(shot.hold || 3200), waitInput()]);
          waiter = null;
        }
        ui.root.classList.remove('cs-in');
        await sleep(500);
        return result;
      } finally {
        cleanup();
      }
    };

    function cleanup() {
      stopVoice();
      voice.onplaying = voice.onpause = voice.onended = null;
      bd.stop();
      global.removeEventListener('keydown', onKey, true);
      ui.root.remove();
      if (active && active.ui === ui) active = null;
    }

    active = { ui, abort: () => { doSkip(); } };
    return run();
  }

  function preload(id) {
    const shots = (global.CUTSCENES || {})[id] || [];
    return Promise.all(shots.filter(s => s.img).map(s => new Promise(r => {
      const i = new Image(); i.onload = i.onerror = r; i.src = srcFor(s.img);
    })));
  }

  global.Cutscene = {
    play,
    preload,
    config(o) { Object.assign(cfg, o || {}); if (o && o.images) cfg.images = Object.assign({}, cfg.images, o.images); },
    isPlaying: () => !!active,
    skip: () => active && active.abort(),
  };
})(window);
