/*
 * Earth Vanguard — cutscene illustrations
 * ---------------------------------------
 * Every scene is generated SVG (1600x900, cropped to fit any screen) with light
 * CSS animation. Style: cinematic silhouettes with a colour accent per character
 *   Blue Arrow  → blue scarf + blue rim light
 *   Best friend → amber scarf
 *   Enforcers   → tall hats, glowing red visors
 *   Overseers   → the giant red eye
 *   Puff        → orange pufferfish (always in colour)
 * Scenes with a transparent sky let the animated canvas background show through.
 */
(function (global) {
  'use strict';

  const C = {
    ink: '#090b16', blue: '#4fc3ff', blueHi: '#a6ecff', red: '#ff3b3b', amber: '#ffae42',
    cyan: '#5ee7ff',
  };

  const ART_CSS = `
  .cs-art{position:absolute;inset:0;overflow:hidden}
  .cs-art svg{position:absolute;inset:0;width:100%;height:100%;display:block}
  .cs-art-cam{position:absolute;inset:0;transform-origin:50% 45%;transition-property:transform;transition-timing-function:ease-out;will-change:transform}
  .cs-art::after{content:"";position:absolute;left:0;right:0;bottom:0;height:42%;pointer-events:none;
    background:linear-gradient(180deg,transparent,rgba(0,0,0,.55) 70%,rgba(0,0,0,.75))}
  .cs-art [class^="a-"]{transform-box:fill-box}
  .a-pulse{animation:aPulse 2.4s ease-in-out infinite}
  .a-bob{animation:aBob 3.2s ease-in-out infinite}
  .a-bob2{animation:aBob 4.1s ease-in-out infinite reverse}
  .a-wave{transform-origin:0% 50%;animation:aWave 1.1s ease-in-out infinite alternate}
  .a-sway{transform-origin:50% 100%;animation:aSway 3.6s ease-in-out infinite alternate}
  .a-flicker{transform-origin:50% 100%;animation:aFlick .28s ease-in-out infinite alternate}
  .a-flicker2{transform-origin:50% 100%;animation:aFlick .37s ease-in-out infinite alternate-reverse}
  .a-rise{animation:aRise 7s linear infinite}
  .a-drift{animation:aDrift 14s ease-in-out infinite alternate}
  .a-ring{transform-origin:center;animation:aRing 3.2s ease-out infinite}
  .a-spin{transform-origin:center;animation:aSpin 30s linear infinite}
  .a-spinr{transform-origin:center;animation:aSpin 18s linear infinite reverse}
  .a-scan{animation:aScan 4s linear infinite}
  .a-fly{animation:aFly 6s ease-in infinite}
  .a-march{animation:aMarch .9s ease-in-out infinite alternate}
  .a-shoot{animation:aShoot 1.6s ease-out infinite}
  .a-break{transform-origin:center;animation:aBreak 9s ease-out infinite}
  .a-flash{animation:aFlash 1.6s ease-in-out infinite}
  @keyframes aPulse{0%,100%{opacity:.6}50%{opacity:1}}
  @keyframes aBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  @keyframes aWave{0%{transform:skewY(-5deg) scaleX(.94)}100%{transform:skewY(5deg) scaleX(1.06)}}
  @keyframes aSway{0%{transform:rotate(-3deg)}100%{transform:rotate(3deg)}}
  @keyframes aFlick{0%{transform:scale(.92,.9) skewX(-3deg);opacity:.85}100%{transform:scale(1.06,1.1) skewX(3deg);opacity:1}}
  @keyframes aRise{0%{transform:translateY(0);opacity:0}15%{opacity:.7}100%{transform:translateY(-320px);opacity:0}}
  @keyframes aDrift{0%{transform:translateX(0)}100%{transform:translateX(-60px)}}
  @keyframes aRing{0%{transform:scale(.05);opacity:.95}100%{transform:scale(1);opacity:0}}
  @keyframes aSpin{to{transform:rotate(360deg)}}
  @keyframes aScan{0%{transform:translateY(-120px)}100%{transform:translateY(900px)}}
  @keyframes aFly{0%{transform:translate(0,0);opacity:0}10%{opacity:1}100%{transform:translate(700px,-260px);opacity:0}}
  @keyframes aMarch{0%{transform:translateY(0)}100%{transform:translateY(-3px)}}
  @keyframes aShoot{0%{opacity:0;transform:translateX(0)}10%{opacity:1}60%{opacity:1}100%{opacity:0;transform:translateX(40px)}}
  @keyframes aBreak{0%{transform:translate(0,0) rotate(0)}100%{transform:translate(var(--dx,40px),var(--dy,-30px)) rotate(var(--rot,25deg))}}
  @keyframes aFlash{0%,100%{opacity:.25}50%{opacity:1}}
  @media (prefers-reduced-motion:reduce){.cs-art *{animation:none!important}}
  `;

  /* ---------- helpers ---------- */
  const f = n => Math.round(n * 10) / 10;
  function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; }
  const pts = p => p.map(q => f(q[0]) + ',' + f(q[1])).join(' ');
  const limb = (p, w, c) => `<polyline points="${pts(p)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

  const DEFS = `<defs>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glowBig" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="blur24" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="24"/></filter>
    <radialGradient id="puffBody" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ffe7a0"/><stop offset=".55" stop-color="#ffb43c"/><stop offset="1" stop-color="#d9741a"/></radialGradient>
    <radialGradient id="eyeIris" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3c0"/><stop offset=".25" stop-color="#ffb347"/><stop offset=".6" stop-color="#e0262a"/><stop offset="1" stop-color="#3a0008"/></radialGradient>
    <radialGradient id="warm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ff7a2a" stop-opacity="0"/></radialGradient>
    <radialGradient id="cool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#bff3ff" stop-opacity=".9"/><stop offset="1" stop-color="#4fc3ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="redGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff5a3a" stop-opacity=".8"/><stop offset="1" stop-color="#ff2a1a" stop-opacity="0"/></radialGradient>
    <linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="-30" y1="0" x2="-280" y2="0"><stop offset="0" stop-color="#bff3ff" stop-opacity=".9"/><stop offset="1" stop-color="#4fc3ff" stop-opacity="0"/></linearGradient>
    <linearGradient id="beamDown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a" stop-opacity=".45"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></linearGradient>
    <linearGradient id="beamCyan" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#5ee7ff" stop-opacity=".5"/><stop offset="1" stop-color="#5ee7ff" stop-opacity="0"/></linearGradient>
    <linearGradient id="beamRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4a3a" stop-opacity=".5"/><stop offset="1" stop-color="#ff4a3a" stop-opacity="0"/></linearGradient>
  </defs>`;
  const svg = inner => `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${DEFS}${inner}</svg>`;
  const rect = (fill, extra = '') => `<rect x="-50" y="-50" width="1700" height="1000" fill="${fill}" ${extra}/>`;
  function lin(id, stops, vertical = true) {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">` +
      stops.map(s => `<stop offset="${s[0]}" stop-color="${s[1]}" stop-opacity="${s[2] == null ? 1 : s[2]}"/>`).join('') + '</linearGradient>';
  }

  /* ---------- characters (all face LEFT unless flip) ---------- */
  const POSES = {
    stand: { l: [[-6, -92], [-8, -46], [-9, 0]], r: [[6, -92], [8, -46], [9, 0]], al: [[-14, -140], [-19, -112], [-20, -86]], ar: [[14, -140], [19, -112], [20, -86]] },
    walk: { l: [[-5, -92], [-14, -46], [-24, 0]], r: [[5, -92], [11, -46], [19, -2]], al: [[-14, -140], [-22, -114], [-26, -90]], ar: [[14, -140], [19, -114], [24, -92]] },
    armout: { l: [[-6, -92], [-18, -46], [-28, 0]], r: [[6, -92], [12, -46], [20, 0]], al: [[-14, -140], [-44, -138], [-74, -142]], ar: [[14, -140], [20, -112], [22, -86]] },
    run: { l: [[-5, -92], [-30, -64], [-34, -14]], r: [[5, -92], [22, -56], [44, -66]], al: [[-14, -140], [-30, -118], [-44, -130]], ar: [[14, -140], [30, -122], [42, -106]], lean: -14 },
    kneel: { dy: 40, l: [[-6, -92], [-36, -72], [-38, -40]], r: [[6, -92], [14, -48], [46, -44]], al: [[-14, -140], [-46, -150], [-76, -162]], ar: [[14, -140], [-14, -138], [-42, -148]], lean: -6 },
    raised: { l: [[-6, -92], [-4, -46], [4, -4]], r: [[6, -92], [14, -48], [24, -6]], al: [[-14, -140], [-38, -150], [-58, -164]], ar: [[14, -140], [38, -150], [58, -164]] },
    aim: { l: [[-6, -92], [-18, -46], [-28, 0]], r: [[6, -92], [14, -46], [24, 0]], al: [[-14, -140], [-46, -136], [-76, -138]], ar: [[14, -140], [-18, -130], [-58, -136]], gun: true },
    cheer: { l: [[-6, -92], [-10, -46], [-12, 0]], r: [[6, -92], [10, -46], [12, 0]], al: [[-14, -140], [-30, -168], [-40, -196]], ar: [[14, -140], [30, -168], [40, -196]] },
    fist: { l: [[-6, -92], [-10, -46], [-12, 0]], r: [[6, -92], [10, -46], [12, 0]], al: [[-14, -140], [-26, -170], [-30, -200]], ar: [[14, -140], [19, -112], [20, -86]] },
    helmet: { l: [[-6, -92], [-12, -46], [-16, 0]], r: [[6, -92], [12, -46], [18, 0]], al: [[-14, -140], [-24, -114], [-36, -104]], ar: [[14, -140], [19, -112], [20, -86]], helmet: true },
  };

  function figure(p, o, col) {
    let g = '';
    g += limb(p.r, 12, col) + limb(p.ar, 8, col);
    g += `<path d="M-15,-142 Q0,-148 15,-142 L12,-92 Q0,-86 -12,-92 Z" fill="${col}"/>`;
    if (o.coat) g += `<path d="M-14,-128 L-24,-48 Q0,-42 24,-48 L14,-128 Z" fill="${col}"/>`;
    if (o.jacket) g += `<path d="M-17,-142 L-19,-84 L19,-84 L17,-142 Z" fill="${col}"/>`;
    g += limb(p.l, 12, col) + limb(p.al, 8, col);
    if (p.gun) g += `<path d="M-70,-146 L-98,-146 L-98,-138 L-80,-138 L-76,-128 L-68,-128 Z" fill="${col}"/>`;
    if (p.helmet) g += `<ellipse cx="-42" cy="-108" rx="17" ry="15" fill="${col}"/>`;
    g += `<rect x="-4" y="-154" width="8" height="14" fill="${col}"/><circle cx="0" cy="-165" r="13" fill="${col}"/>`;
    if (o.hair === 'bob') g += `<path d="M-15,-162 C-18,-186 18,-188 15,-162 L16,-146 L8,-153 L-8,-153 L-16,-146 Z" fill="${col}"/>`;
    if (o.hair === 'pony') g += `<path d="M-13,-170 C-6,-184 12,-182 14,-168 C30,-170 34,-146 26,-124 C22,-142 18,-154 10,-158 Z" fill="${col}"/>`;
    if (o.hair === 'hood') g += `<path d="M-17,-160 C-19,-190 19,-190 17,-160 L19,-140 L-19,-140 Z" fill="${col}"/>`;
    if (o.hair === 'cap') g += `<path d="M-14,-170 L-14,-180 L14,-180 L14,-170 Z M-24,-172 L14,-172 L14,-168 L-24,-168 Z" fill="${col}"/>`;
    return g;
  }

  function person(x, y, s, o = {}) {
    const p = POSES[o.pose || 'stand'];
    const col = o.fill || C.ink;
    const lean = (p.lean || 0) + (o.lean || 0);
    const inner = (c) => `<g transform="translate(0,${p.dy || 0}) rotate(${lean})">${figure(p, o, c)}</g>`;
    let g = `<g transform="translate(${x},${y}) scale(${o.flip ? -s : s},${s})">`;
    if (o.rim) g += `<g transform="translate(${o.rimDx || 2.2},${o.rimDy || -1.5})" opacity="${o.rimOp || .95}" filter="url(#glow)">${inner(o.rim)}</g>`;
    g += inner(col);
    const dy = p.dy || 0;
    if (o.streak) g += `<g transform="translate(0,${dy}) rotate(${lean})"><path d="M-7,-182 Q-14,-170 -15,-150" stroke="${o.streak}" stroke-width="3.5" fill="none" stroke-linecap="round" filter="url(#glow)"/></g>`;
    if (o.scarf) g += `<g transform="translate(0,${dy}) rotate(${lean})"><g class="a-wave"><path d="M-13,-148 Q0,-141 13,-148 L13,-140 Q34,-140 60,-128 Q42,-131 36,-126 Q24,-133 12,-134 Q0,-131 -13,-138 Z" fill="${o.scarf}" filter="url(#glow)"/></g></g>`;
    if (o.visor) g += `<g transform="translate(0,${dy}) rotate(${lean})"><rect x="-13" y="-170" width="14" height="4" rx="2" fill="${o.visor}" filter="url(#glow)"/></g>`;
    return g + '</g>';
  }

  function guard(x, y, s, o = {}) {
    const col = o.fill || '#05060b';
    const pose = o.pose || 'rifle';
    let a = '';
    if (pose === 'rifle') a = limb([[26, -160], [30, -128], [0, -118]], 11, col) + limb([[-26, -160], [-34, -128], [-20, -112]], 11, col) +
      `<path d="M34,-100 L-58,-150 L-62,-143 L30,-93 Z" fill="${col}"/><rect x="-74" y="-156" width="14" height="5" fill="${col}" transform="rotate(-28 -66 -153)"/>`;
    if (pose === 'baton') a = limb([[26, -160], [30, -128], [26, -100]], 11, col) + limb([[-26, -160], [-42, -190], [-36, -222]], 11, col) +
      limb([[-36, -222], [-62, -252]], 7, col) + `<circle cx="-62" cy="-252" r="5" fill="${C.red}" filter="url(#glow)"/>`;
    if (pose === 'grab') a = limb([[26, -160], [0, -142], [-44, -146]], 11, col) + limb([[-26, -160], [-52, -152], [-80, -156]], 11, col);
    if (pose === 'point') a = limb([[26, -160], [30, -128], [26, -100]], 11, col) + limb([[-26, -160], [-58, -160], [-90, -164]], 11, col);
    let g = `<g transform="translate(${x},${y}) scale(${o.flip ? -s : s},${s})">`;
    g += limb([[9, -104], [11, -52], [13, 0]], 16, col) + limb([[-9, -104], [-12, -52], [-14, 0]], 16, col);
    g += `<rect x="-24" y="-8" width="20" height="10" rx="3" fill="${col}"/><rect x="4" y="-8" width="20" height="10" rx="3" fill="${col}"/>`;
    g += `<path d="M-30,-170 L30,-170 L24,-100 L-24,-100 Z" fill="${col}"/>`;
    g += `<path d="M-24,-104 L-34,-40 L-8,-56 Z M24,-104 L34,-40 L8,-56 Z" fill="${col}"/>`;
    g += `<ellipse cx="-30" cy="-166" rx="16" ry="10" fill="${col}"/><ellipse cx="30" cy="-166" rx="16" ry="10" fill="${col}"/>`;
    g += a;
    g += `<path d="M-15,-172 L-17,-202 L17,-202 L15,-172 Z" fill="${col}"/><rect x="-20" y="-206" width="40" height="7" fill="${col}"/>`;
    g += `<rect x="-15" y="-246" width="30" height="42" rx="3" fill="${col}"/>`;
    g += `<rect x="-10" y="-236" width="20" height="3" fill="${C.red}" opacity=".5"/>`;
    g += `<rect x="-17" y="-192" width="22" height="5" rx="2" fill="${C.red}" class="a-pulse" filter="url(#glow)"/>`;
    g += `<rect x="-6" y="-108" width="12" height="7" fill="${C.red}" opacity=".7"/>`;
    return g + '</g>';
  }

  function oldWoman(x, y, s, col) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <path d="M-56,0 C-60,-40 -44,-92 -6,-106 C26,-114 48,-90 50,-60 C53,-30 52,-10 58,0 Z" fill="${col}"/>
      <circle cx="-22" cy="-108" r="15" fill="${col}"/>
      <path d="M-40,-112 C-34,-136 0,-136 6,-110 C-6,-120 -26,-122 -40,-112 Z" fill="${col}"/>
      ${limb([[-14, -86], [-42, -108], [-50, -136]], 8, col)}
      ${limb([[20, -60], [44, -40], [62, 0]], 5, col)}
    </g>`;
  }

  function puff(x, y, s, o = {}) {
    let spikes = '';
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2, b = .13;
      spikes += `${f(Math.cos(a - b) * 37)},${f(Math.sin(a - b) * 37)} ${f(Math.cos(a) * 53)},${f(Math.sin(a) * 53)} ${f(Math.cos(a + b) * 37)},${f(Math.sin(a + b) * 37)} `;
    }
    const mood = o.mood || 'calm';
    let face = '';
    face += `<circle cx="14" cy="-10" r="12" fill="#fff"/><circle cx="35" cy="-8" r="9.5" fill="#fff"/>`;
    const py = mood === 'sad' ? 2 : 0, px = o.look === 'up' ? -3 : 0;
    face += `<circle cx="${17 + 0}" cy="${-9 + py + px}" r="6" fill="#1a1020"/><circle cx="37" cy="${-7 + py + px}" r="5" fill="#1a1020"/>`;
    face += `<circle cx="19" cy="${-12 + px}" r="2.4" fill="#fff"/><circle cx="39" cy="${-10 + px}" r="2" fill="#fff"/>`;
    if (mood === 'sad') face += `<path d="M3,-26 L22,-21 M30,-20 L44,-24" stroke="#7a3a10" stroke-width="3" stroke-linecap="round"/><path d="M33,20 Q40,13 48,20" stroke="#7a3a10" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    else if (mood === 'happy') face += `<path d="M32,14 Q40,23 49,13" stroke="#7a3a10" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    else if (mood === 'firm') face += `<path d="M4,-25 L23,-22 M30,-22 L45,-20" stroke="#7a3a10" stroke-width="3" stroke-linecap="round"/><path d="M34,16 L47,16" stroke="#7a3a10" stroke-width="3" stroke-linecap="round"/>`;
    else face += `<ellipse cx="42" cy="16" rx="4" ry="3.2" fill="#7a3a10"/>`;
    let gog = '';
    if (o.goggles) gog = `<path d="M-30,-22 Q8,-48 46,-26" stroke="#3a2a2a" stroke-width="5" fill="none"/>
      <circle cx="4" cy="-37" r="9" fill="#7fe3ff" stroke="#2a2030" stroke-width="3"/><circle cx="24" cy="-36" r="9" fill="#7fe3ff" stroke="#2a2030" stroke-width="3"/>
      <circle cx="1" cy="-40" r="2.5" fill="#fff"/><circle cx="21" cy="-39" r="2.5" fill="#fff"/>`;
    let bubble = '';
    if (o.bubble) bubble = `<circle r="76" fill="#4fb8ff" fill-opacity=".14" stroke="#a6ecff" stroke-width="2.5" stroke-opacity=".8"/>
      <path d="M-48,-44 A64,64 0 0 1 -6,-66" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>
      <rect x="-30" y="66" width="60" height="16" rx="5" fill="#2a3550" stroke="#6fd3ff" stroke-width="1.5"/>`;
    const body = `
      <path d="M-36,0 L-64,-22 Q-56,0 -64,22 Z" fill="#f29a2e"/>
      <polygon points="${spikes}" fill="#d9821c"/>
      <circle r="40" fill="url(#puffBody)"/>
      <ellipse cx="6" cy="17" rx="26" ry="15" fill="#fff4cc" opacity=".75"/>
      <circle cx="-14" cy="-20" r="4" fill="#c9701a" opacity=".55"/><circle cx="-24" cy="-6" r="3" fill="#c9701a" opacity=".55"/><circle cx="-4" cy="-30" r="3" fill="#c9701a" opacity=".55"/>
      <path d="M-6,8 Q-24,22 -4,26 Z" fill="#f29a2e"/>
      ${face}${gog}`;
    return `<g transform="translate(${x},${y})"><g class="${o.still ? '' : 'a-bob'}"><g transform="scale(${o.flip ? -s : s},${s})">${o.bubble ? `<g transform="translate(6,0)">${bubble}</g>` : ''}${body}</g></g></g>`;
  }

  function vship(x, y, s, rot = 0, o = {}) {
    return `<g transform="translate(${x},${y}) rotate(${rot}) scale(${s})">
      ${o.noTrail ? '' : `<path d="M-30,-5 L-280,-2 L-280,2 L-30,5 Z" fill="url(#trail)"/>`}
      <path d="M72,0 L-18,-15 L-36,-38 L-44,-34 L-32,-9 L-38,0 L-32,9 L-44,34 L-36,38 L-18,15 Z" fill="${o.fill || '#1b2a44'}" stroke="#6fd3ff" stroke-width="1.6"/>
      <path d="M44,0 Q24,-9 6,-5 L6,5 Q24,9 44,0 Z" fill="#7fe3ff" opacity=".9"/>
      <path d="M-10,-3 L-28,-26 M-10,3 L-28,26" stroke="#4fc3ff" stroke-width="2"/>
      <circle cx="-38" cy="0" r="7" fill="#dff8ff" filter="url(#glow)"/>
    </g>`;
  }
  function eship(x, y, s, rot = 0) {
    return `<g transform="translate(${x},${y}) rotate(${rot}) scale(${s})">
      <path d="M64,0 L14,-26 L-36,-34 L-22,-10 L-40,0 L-22,10 L-36,34 L14,26 Z" fill="#170a0f" stroke="#7a1a24" stroke-width="2"/>
      <path d="M40,0 L10,-8 L10,8 Z" fill="${C.red}" filter="url(#glow)" class="a-pulse"/>
      <circle cx="-30" cy="0" r="5" fill="#ff7a5a" filter="url(#glow)"/>
    </g>`;
  }
  function eye(x, y, s, o = {}) {
    let seg = '';
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      seg += `<line x1="${f(Math.cos(a) * 240)}" y1="${f(Math.sin(a) * 86)}" x2="${f(Math.cos(a) * 296)}" y2="${f(Math.sin(a) * 106)}" stroke="#3a1e2c" stroke-width="3"/>`;
    }
    return `<g transform="translate(${x},${y}) scale(${s})">
      <ellipse rx="380" ry="190" fill="url(#redGlow)" opacity="${o.halo || .5}" class="a-pulse"/>
      <ellipse rx="300" ry="110" fill="#0d0910" stroke="#4a2638" stroke-width="4"/>
      ${seg}
      <ellipse rx="236" ry="84" fill="#160c14" stroke="#5a2a3a" stroke-width="2"/>
      <ellipse rx="150" ry="58" fill="#0a0408"/>
      <g class="a-pulse"><circle r="74" fill="url(#eyeIris)" filter="url(#glow)"/></g>
      <ellipse rx="11" ry="60" fill="#140004"/>
      <circle cx="-26" cy="-26" r="8" fill="#fff" opacity=".55"/>
      ${[-260, -170, 170, 260].map(px => `<circle cx="${px}" cy="${px > 0 ? 34 : 34}" r="5" fill="${C.red}" class="a-pulse" filter="url(#glow)"/>`).join('')}
    </g>`;
  }
  function planet(x, y, r, id, c1, c2, o = {}) {
    return `<radialGradient id="${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>
      <radialGradient id="${id}s" cx=".32" cy=".28" r=".85"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>
      <g transform="translate(${x},${y})">
      ${o.atmo ? `<circle r="${r * 1.06}" fill="none" stroke="${o.atmo}" stroke-width="${r * .07}" opacity=".45" filter="url(#blur6)"/>` : ''}
      <circle r="${r}" fill="url(#${id})"/>
      ${o.extra || ''}
      <circle r="${r}" fill="url(#${id}s)"/>
      </g>`;
  }
  function skyline(seed, y0, minH, maxH, col, win, winCol = '#ffcf70', winOp = .55) {
    const r = rng(seed); let x = -60, g = '';
    while (x < 1660) {
      const w = 40 + r() * 90, h = minH + r() * (maxH - minH);
      g += `<rect x="${f(x)}" y="${f(y0 - h)}" width="${f(w)}" height="${f(h + 400)}" fill="${col}"/>`;
      if (r() < .25) g += `<rect x="${f(x + w / 2 - 2)}" y="${f(y0 - h - 26)}" width="4" height="26" fill="${col}"/>`;
      if (win) for (let wy = y0 - h + 14; wy < y0 - 10; wy += 22) for (let wx = x + 8; wx < x + w - 10; wx += 16)
        if (r() < win) g += `<rect x="${f(wx)}" y="${f(wy)}" width="6" height="9" fill="${winCol}" opacity="${f(winOp * (.5 + r() * .5))}"/>`;
      x += w + 2 + r() * 8;
    }
    return g;
  }
  function fishSchool(cx, cy, n, spread, col, seed, size = 1) {
    const r = rng(seed); let g = '';
    for (let i = 0; i < n; i++) {
      const x = cx + (r() - .5) * spread, y = cy + (r() - .5) * spread * .45, s = size * (.6 + r() * .6);
      g += `<path transform="translate(${f(x)},${f(y)}) scale(${f(s)})" d="M0,0 Q10,-7 22,0 Q10,7 0,0 Z M0,0 L-8,-6 L-8,6 Z" fill="${col}"/>`;
    }
    return g;
  }
  function coral(x, y, s, col, seed) {
    const r = rng(seed); let d = '';
    (function br(px, py, len, ang, w, depth) {
      const nx = px + Math.cos(ang) * len, ny = py + Math.sin(ang) * len;
      d += `<path d="M${f(px)},${f(py)} L${f(nx)},${f(ny)}" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round"/>`;
      if (depth <= 0) { d += `<circle cx="${f(nx)}" cy="${f(ny)}" r="${f(w * .8)}" fill="${col}"/>`; return; }
      br(nx, ny, len * .75, ang - .35 - r() * .3, w * .72, depth - 1);
      br(nx, ny, len * .75, ang + .35 + r() * .3, w * .72, depth - 1);
    })(0, 0, 60, -Math.PI / 2, 14, 4);
    return `<g transform="translate(${x},${y}) scale(${s})"><g class="a-sway">${d}</g></g>`;
  }
  function kelp(x, y, h, col, delay) {
    return `<g transform="translate(${x},${y})"><g class="a-sway" style="animation-delay:${delay}s">
      <path d="M0,0 C-30,${-h * .25} 30,${-h * .5} 0,${-h * .75} C-20,${-h * .88} 10,${-h * .95} 4,${-h}" stroke="${col}" stroke-width="10" fill="none" stroke-linecap="round"/>
      <ellipse cx="14" cy="${-h * .4}" rx="16" ry="6" fill="${col}" transform="rotate(-30 14 ${-h * .4})"/>
      <ellipse cx="-14" cy="${-h * .65}" rx="16" ry="6" fill="${col}" transform="rotate(30 -14 ${-h * .65})"/></g></g>`;
  }
  function flames(x, y, s) {
    const fl = (dx, h, w, c, cls, d) => `<g transform="translate(${dx},0)"><path class="${cls}" style="animation-delay:${d}s" d="M${-w},0 C${-w},${-h * .4} ${-w * .2},${-h * .55} 0,${-h} C${w * .3},${-h * .6} ${w},${-h * .45} ${w},0 Z" fill="${c}"/></g>`;
    return `<g transform="translate(${x},${y}) scale(${s})">
      <ellipse cy="-60" rx="200" ry="140" fill="url(#warm)" opacity=".55" class="a-pulse"/>
      ${fl(-90, 150, 40, '#ff5a1f', 'a-flicker', 0)}${fl(-20, 220, 55, '#ff6a1f', 'a-flicker2', .1)}${fl(60, 170, 45, '#ff5a1f', 'a-flicker', .2)}${fl(120, 120, 34, '#ff4a1a', 'a-flicker2', 0)}
      ${fl(-80, 100, 24, '#ffb347', 'a-flicker2', .1)}${fl(-15, 150, 32, '#ffc85a', 'a-flicker', 0)}${fl(60, 110, 26, '#ffb347', 'a-flicker2', .2)}
      ${fl(-15, 80, 16, '#fff2b0', 'a-flicker', .1)}
    </g>`;
  }
  function smoke(x, y, n, seed, col = '#1a0e10') {
    const r = rng(seed); let g = '';
    for (let i = 0; i < n; i++) g += `<g class="a-rise" style="animation-delay:${f(-r() * 7)}s"><circle cx="${f(x + (r() - .5) * 160)}" cy="${f(y)}" r="${f(40 + r() * 50)}" fill="${col}" opacity=".7" filter="url(#blur6)"/></g>`;
    return g;
  }
  const emblem = (x, y, s, col = C.blue) => `<g transform="translate(${x},${y}) scale(${s})" opacity=".85">
      <path d="M0,-60 L52,-38 L46,22 Q30,50 0,64 Q-30,50 -46,22 L-52,-38 Z" fill="none" stroke="${col}" stroke-width="5" filter="url(#glow)"/>
      <path d="M-26,-22 L0,34 L26,-22" fill="none" stroke="${col}" stroke-width="8" stroke-linejoin="round"/>
      <circle cx="0" cy="-34" r="7" fill="${col}"/></g>`;
  const HERO = { hair: 'bob', scarf: C.blue, rim: C.blue, streak: C.blueHi, jacket: true };
  const FRIEND = { hair: 'pony', scarf: C.amber, rim: C.amber, rimOp: .5 };

  /* ---------- scenes ---------- */
  const A = {};

  // The bored civilization looming over a game board of planets (sky transparent)
  A.overseers = () => {
    let grid = '';
    const P = (u, v) => { const yb = 560 + v * 200, half = 300 + v * 380; return [800 - half + u * half * 2, yb]; };
    for (let i = 0; i <= 8; i++) { const a = P(i / 8, 0), b = P(i / 8, 1); grid += `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/>`; }
    for (let j = 0; j <= 5; j++) { const v = Math.pow(j / 5, 1.3), a = P(0, v), b = P(1, v); grid += `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/>`; }
    const piece = (x, y, r, id, c1, c2, extra, atmo) => `<ellipse cx="${x}" cy="${y + r + 4}" rx="${r * 1.2}" ry="${r * .28}" fill="#000" opacity=".55"/>
      <ellipse cx="${x}" cy="${y + r + 2}" rx="${r * .9}" ry="${r * .2}" fill="#ffd27a" opacity=".25"/>${planet(x, y, r, id, c1, c2, { atmo, extra })}`;
    return svg(`
      <path d="M500,560 L1100,560 L1480,760 L120,760 Z" fill="#120a24" opacity=".85"/>
      <g stroke="#7a5cff" stroke-opacity=".35" stroke-width="1.5">${grid}</g>
      <path d="M500,560 L1100,560 L1480,760 L120,760 Z" fill="none" stroke="#b49cff" stroke-opacity=".6" stroke-width="2.5" filter="url(#glow)"/>
      <path d="M690,300 L910,300 L1180,620 L420,620 Z" fill="url(#beamDown)" opacity=".5"/>
      ${piece(560, 640, 34, 'pl1', '#8fd0ff', '#1d3c8a', '', '#8fd0ff')}
      ${piece(800, 600, 26, 'pl2', '#b8f0a0', '#2a6a3a', '', '#b8f0a0')}
      ${piece(1050, 660, 40, 'pl3', '#ffd59a', '#a0461a', '', '#ffb36b')}
      ${piece(680, 700, 22, 'pl4', '#e0b0ff', '#4a1a7a', '', '#e0b0ff')}
      ${piece(930, 720, 30, 'pl5', '#7a5a5a', '#2a1414', `<path d="M-20,-18 L-4,-2 L-12,10 L6,24 M-4,-2 L14,-10" stroke="#ff6a3a" stroke-width="3" fill="none" filter="url(#glow)"/>`)}
      <g class="a-bob2">${eye(800, 230, .9)}</g>
      <path d="M1000,260 C1080,320 1060,520 1050,620" stroke="#ff5a3a" stroke-width="2" fill="none" stroke-dasharray="6 10" opacity=".7" class="a-pulse"/>
    `);
  };

  // Her city under occupation; citizens march under guard
  A.oppressed = () => {
    const r = rng(7); let line = '';
    const xs = [300, 370, 440, 520, 600, 690, 770, 860, 940, 1020, 1100, 1180, 1260];
    xs.forEach((x, i) => {
      if (x === 860) line += person(x, 630, 1.0, Object.assign({ pose: 'walk', flip: true, lean: -2 }, HERO));
      else if (x === 770) line += person(x, 630, 1.0, Object.assign({ pose: 'walk', flip: true, lean: 6 }, FRIEND));
      else line += `<g class="a-march" style="animation-delay:${f(r() * .9)}s">${person(x, 630, .9 + r() * .2, { pose: 'walk', flip: true, lean: 8 + r() * 6, coat: r() < .5, hair: ['hood', 'bob', 'cap', ''][Math.floor(r() * 4)], fill: '#1a0d14' })}</g>`;
    });
    return svg(`${lin('skyO', [[0, '#1a0618'], [.5, '#6a1e2a'], [.82, '#d0602e'], [1, '#f08a3a']]).replace('<linearGradient', '<defs><linearGradient').replace('</linearGradient>', '</linearGradient></defs>')}
      ${rect('url(#skyO)')}
      <circle cx="1180" cy="470" r="150" fill="#ffb36b" opacity=".35" filter="url(#blur24)"/>
      <circle cx="1180" cy="470" r="80" fill="#ffd29a" opacity=".55"/>
      <path d="M560,190 L280,640 L1320,640 L1040,190 Z" fill="url(#beamRed)" opacity=".35"/>
      <g class="a-bob2">
        <ellipse cx="800" cy="150" rx="620" ry="78" fill="#12070e"/>
        <ellipse cx="800" cy="128" rx="380" ry="54" fill="#1e0c16"/>
        <path d="M180,150 Q800,250 1420,150" stroke="#3a1424" stroke-width="6" fill="none"/>
        ${Array.from({ length: 13 }, (_, i) => `<circle cx="${320 + i * 80}" cy="${190 + Math.sin(i / 12 * Math.PI) * 22}" r="5" fill="${C.red}" filter="url(#glow)" class="a-pulse" style="animation-delay:${i * .12}s"/>`).join('')}
        <circle cx="800" cy="205" r="22" fill="url(#eyeIris)" filter="url(#glow)"/>
      </g>
      <g opacity=".55">${skyline(11, 520, 60, 200, '#5a1e2a', .08, '#ffb070', .4)}</g>
      ${skyline(23, 600, 80, 300, '#2a0c16', .12)}
      <g transform="translate(1300,330)"><rect x="-80" y="-50" width="160" height="100" fill="#14060c" stroke="#ff3b3b" stroke-width="3" class="a-pulse"/>
        <ellipse rx="44" ry="20" fill="none" stroke="#ff3b3b" stroke-width="5" filter="url(#glow)"/><circle r="10" fill="#ff3b3b" filter="url(#glow)"/></g>
      <g transform="translate(300,360)"><rect x="-60" y="-40" width="120" height="80" fill="#14060c" stroke="#ff3b3b" stroke-width="3" class="a-pulse"/>
        <ellipse rx="34" ry="15" fill="none" stroke="#ff3b3b" stroke-width="4" filter="url(#glow)"/><circle r="8" fill="#ff3b3b"/></g>
      <rect x="-50" y="630" width="1700" height="400" fill="#0c0509"/>
      <rect x="-50" y="628" width="1700" height="4" fill="#ff8a4a" opacity=".25"/>
      ${guard(200, 632, 1.15, { pose: 'rifle', flip: true })}
      ${line}
      ${guard(1400, 632, 1.15, { pose: 'point' })}
    `);
  };

  // She steps between the guards and an old woman
  A.standup = () => {
    let crowd = ''; const r = rng(3);
    for (let i = 0; i < 16; i++) crowd += person(80 + i * 98 + r() * 30, 600, .75 + r() * .1, { fill: '#4a1c2a', coat: r() < .5, hair: ['hood', 'bob', 'cap', ''][Math.floor(r() * 4)], flip: r() < .5 });
    return svg(`${'<defs>' + lin('skyS', [[0, '#240818'], [.6, '#7a2a2a'], [1, '#c4562e']]) + lin('cone', [[0, '#ffd8a0', .5], [1, '#ffd8a0', 0]]) + '</defs>'}
      ${rect('url(#skyS)')}
      ${skyline(41, 500, 120, 360, '#3a1220', .14, '#ffb070', .5)}
      <rect x="-50" y="560" width="1700" height="400" fill="#1c0a12"/>
      <g opacity=".85">${crowd}</g>
      <rect x="-50" y="640" width="1700" height="400" fill="#0c0509"/>
      <path d="M1240,170 L1080,640 L1420,640 Z" fill="url(#cone)"/>
      <rect x="1236" y="150" width="8" height="490" fill="#0c0509"/><path d="M1220,160 L1270,160 L1258,176 L1232,176 Z" fill="#0c0509"/>
      <circle cx="1245" cy="178" r="7" fill="#ffe2b0" filter="url(#glow)"/>
      <ellipse cx="660" cy="640" rx="420" ry="16" fill="#000" opacity=".4"/>
      ${guard(380, 642, 1.3, { pose: 'baton', flip: true })}
      <g transform="translate(2.5,-2)" filter="url(#glow)" opacity=".8">${oldWoman(620, 642, 1.1, '#ffb070')}</g>
      ${oldWoman(620, 642, 1.1, '#090b16')}
      <circle cx="700" cy="636" r="7" fill="#d0602e"/><circle cx="724" cy="638" r="6" fill="#8aa040"/><circle cx="748" cy="636" r="6" fill="#d0602e"/>
      <path d="M680,642 L712,620 L740,642 Z" fill="#2a1414"/>
      ${guard(880, 642, 1.3, { pose: 'point', flip: true })}
      ${person(1080, 642, 1.4, Object.assign({ pose: 'armout' }, HERO))}
    `);
  };

  // House burning; her friend dragged to a transport (burn canvas behind)
  A.taken = () => svg(`
      <path d="M-50,560 C200,520 400,560 600,540 C800,520 1000,560 1200,540 C1400,520 1500,550 1650,540 L1650,950 L-50,950 Z" fill="#14060a"/>
      ${smoke(1180, 360, 9, 5)}
      <g transform="translate(1180,640)">
        <path d="M-150,0 L-150,-170 L0,-270 L150,-170 L150,0 Z" fill="#0b0406"/>
        <path d="M-20,-270 L60,-230 L40,-205 Z" fill="#0b0406"/>
        <rect x="-110" y="-140" width="60" height="50" fill="#ff8a3a" class="a-flash"/><rect x="50" y="-140" width="60" height="50" fill="#ffb347" class="a-flash" style="animation-delay:.4s"/>
        <rect x="-30" y="-90" width="60" height="90" fill="#ff6a2a" class="a-flash" style="animation-delay:.2s"/>
      </g>
      ${flames(1180, 450, 1.2)}
      ${flames(1060, 560, .6)}${flames(1310, 540, .7)}
      <g class="a-bob2"><g transform="translate(330,170)">
        <path d="M-210,10 L-120,-46 L150,-46 L230,0 L150,40 L-140,40 Z" fill="#12070c" stroke="#5a1a24" stroke-width="3"/>
        ${[-120, -60, 0, 60, 120].map(x => `<rect x="${x}" y="-20" width="30" height="8" fill="${C.red}" opacity=".8" class="a-pulse"/>`).join('')}
        <circle cx="180" cy="6" r="9" fill="#ff7a5a" filter="url(#glow)"/>
      </g></g>
      <path d="M300,210 L180,640 L560,640 L360,210 Z" fill="#ffe0b0" opacity=".18"/>
      <ellipse cx="370" cy="640" rx="190" ry="14" fill="#ffe0b0" opacity=".18"/>
      ${guard(250, 642, 1.2, { pose: 'grab', flip: true })}
      ${person(370, 610, 1.15, Object.assign({ pose: 'raised', lean: 6 }, FRIEND))}
      ${guard(490, 642, 1.2, { pose: 'grab' })}
      ${person(820, 642, 1.3, Object.assign({ pose: 'kneel' }, HERO))}
      ${guard(940, 642, 1.25, { pose: 'grab' })}
    `);

  // Containment cell 0-17
  A.facility = () => {
    const cell = (x, label, occupied) => `<g transform="translate(${x},0)">
      <rect x="-150" y="170" width="300" height="470" fill="#0a1820" stroke="#2a5a6a" stroke-width="6"/>
      <rect x="-142" y="178" width="284" height="454" fill="#5ee7ff" opacity="${occupied ? .1 : .04}"/>
      <rect x="-120" y="182" width="240" height="6" fill="${C.cyan}" opacity="${occupied ? .9 : .25}" filter="url(#glow)"/>
      ${occupied ? `<path d="M-100,188 L100,188 L140,632 L-140,632 Z" fill="#a6ecff" opacity=".1"/>` : ''}
      ${[0, 1, 2, 3, 4, 5, 6].map(i => `<line x1="${-150 + i * 50}" y1="170" x2="${-150 + i * 50}" y2="640" stroke="#2a5a6a" stroke-width="2" opacity=".45"/>`).join('')}
      <text x="0" y="230" text-anchor="middle" font-family="Courier New,monospace" font-size="30" font-weight="700" fill="${occupied ? C.cyan : '#2a5a6a'}" letter-spacing="4" ${occupied ? 'filter="url(#glow)"' : ''}>${label}</text>
      <path d="M-170,170 L-150,150 L150,150 L170,170 L170,660 L-170,660 Z" fill="none" stroke="#11262e" stroke-width="14"/>
    </g>`;
    const girl = `<g transform="translate(800,632) scale(1.35)">
      <g transform="translate(2,-1.5)" filter="url(#glow)" opacity=".9"><path d="M-34,0 C-40,-30 -36,-62 -18,-80 L6,-84 C24,-74 34,-56 38,-40 L44,-6 L48,0 Z" fill="${C.cyan}"/></g>
      <path d="M-34,0 C-40,-30 -36,-62 -18,-80 L6,-84 C24,-74 34,-56 38,-40 L44,-6 L48,0 Z" fill="${C.ink}"/>
      <circle cx="10" cy="-82" r="14" fill="${C.ink}"/>
      <path d="M-4,-86 C-4,-104 24,-104 24,-86 L26,-72 L-2,-70 Z" fill="${C.ink}"/>
      <path d="M-16,-62 Q16,-50 36,-38" stroke="#16202e" stroke-width="7" fill="none" stroke-linecap="round"/>
    </g>`;
    return svg(`
      ${rect('#05080c')}
      <rect x="-50" y="640" width="1700" height="400" fill="#081016"/>
      <rect x="-50" y="638" width="1700" height="3" fill="#2a5a6a" opacity=".6"/>
      ${[100, 260, 420].map(y => `<path d="M-50,${y / 4 + 20} L1650,${y / 4 + 20}" stroke="#0e1a22" stroke-width="16"/>`).join('')}
      ${cell(400, '0-16', false)}${cell(800, '0-17', true)}${cell(1200, '0-18', false)}
      ${girl}
      <g transform="translate(1140,640) scale(1,-.25)" opacity=".25">${''}</g>
      <g class="a-bob"><g transform="translate(1040,120)">
        <ellipse rx="44" ry="16" fill="#101820" stroke="#2a3a48" stroke-width="2"/>
        <circle cy="8" r="9" fill="${C.red}" filter="url(#glow)" class="a-pulse"/>
        <path d="M-6,14 L-90,520 L60,520 L6,14 Z" fill="#ff3b3b" opacity=".07"/>
        <path d="M-60,0 L-84,-6 M60,0 L84,-6" stroke="#2a3a48" stroke-width="4"/></g></g>
      <g class="a-scan"><rect x="-50" y="0" width="1700" height="3" fill="${C.red}" opacity=".5" filter="url(#glow)"/></g>
      <circle cx="1540" cy="60" r="8" fill="${C.red}" filter="url(#glow)" class="a-flash"/>
    `);
  };

  // Echo: running blind through the dark, sound reveals the cave
  A.underground = () => {
    const rings = [0, 1.05, 2.1].map(d => `<g class="a-ring" style="animation-delay:${d}s"><circle cx="760" cy="500" r="900" fill="none" stroke="${C.cyan}" stroke-width="3"/></g>`).join('');
    return svg(`
      ${rect('#010307')}
      <g class="a-pulse" fill="none" stroke="${C.cyan}" stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)" opacity=".75">
        <path d="M-50,120 L80,160 L160,110 L240,190 L330,140 L420,220 L500,150 L600,200 L700,120 L820,180 L900,130 L1000,200 L1080,150 L1180,190 L1260,110 L1360,170 L1450,130 L1650,170" stroke-width="3"/>
        <path d="M240,190 L250,260 L262,200 M600,200 L606,280 L618,210 M1000,200 L1008,250 L1018,205" stroke-width="2"/>
        <path d="M-50,560 L120,540 L300,566 L520,540 L700,556 L920,538 L1010,560 L1050,640 L1080,780" stroke-width="3"/>
        <path d="M1160,640 L1200,560 L1400,540 L1650,552" stroke-width="3"/>
        <path d="M60,560 L40,700 M380,560 L420,720" stroke-width="2" opacity=".5"/>
      </g>
      ${rings}
      <circle cx="1380" cy="330" r="90" fill="url(#cool)" class="a-pulse"/>
      <circle cx="1380" cy="330" r="18" fill="#ffffff" filter="url(#glowBig)"/>
      <g class="a-drift" opacity=".75">${fishSchool(1320, 340, 18, 260, C.cyan, 9, .9)}</g>
      ${person(760, 548, 1.25, { pose: 'run', flip: true, hair: 'bob', rim: C.cyan, fill: '#020409', rimDx: -2.5, rimDy: -1 })}
      <ellipse cx="760" cy="550" rx="60" ry="6" fill="${C.cyan}" opacity=".35" filter="url(#glow)"/>
    `);
  };

  // Out of the cave; fish-shaped lights rise to the stars (stars behind)
  A.surface = () => svg(`
      <path d="M-50,-50 L1650,-50 L1650,950 L-50,950 Z M260,640 C200,420 360,140 800,110 C1240,140 1400,420 1340,640 Z" fill="#03050c" fill-rule="evenodd"/>
      <path d="M260,640 C200,420 360,140 800,110 C1240,140 1400,420 1340,640" fill="none" stroke="#4fc3ff" stroke-opacity=".25" stroke-width="4"/>
      <path d="M-50,640 L1650,640 L1650,950 L-50,950 Z" fill="#03050c"/>
      <path d="M560,640 Q800,610 1040,640 Z" fill="#0a1226"/>
      <ellipse cx="800" cy="300" rx="420" ry="240" fill="url(#cool)" opacity=".25"/>
      <g class="a-rise" style="animation-duration:9s">${fishSchool(820, 420, 26, 520, '#bff3ff', 21, .8)}</g>
      <g class="a-rise" style="animation-duration:9s;animation-delay:-4.5s">${fishSchool(760, 460, 20, 420, '#7fe3ff', 33, .7)}</g>
      ${person(800, 640, 1.5, { pose: 'cheer', hair: 'bob', fill: '#03050c', rim: C.blueHi, rimDy: -2.5, rimDx: 0 })}
    `);

  // Fleeing her burning homeworld (stars behind)
  A.escape = () => svg(`
      ${planet(260, 1040, 640, 'home', '#a0442a', '#2a0c0c', { atmo: '#ff6a3a', extra: Array.from({ length: 14 }, (_, i) => { const r = rng(i + 40); return `<circle cx="${f(-200 + r() * 700)}" cy="${f(-560 + r() * 300)}" r="${f(3 + r() * 6)}" fill="#ffb347" filter="url(#glow)" class="a-pulse" style="animation-delay:${f(r() * 2)}s"/>`; }).join('') })}
      ${planet(1380, 160, 70, 'refuge', '#cfe8ff', '#3a6aa0', { atmo: '#9fd8ff' })}
      ${eship(520, 470, .8, -20)}${eship(400, 560, .6, -30)}${eship(650, 400, .5, -18)}
      <g class="a-pulse"><path d="M640,410 L860,320" stroke="#ff3b3b" stroke-width="4" filter="url(#glow)"/><path d="M560,470 L780,360" stroke="#ff3b3b" stroke-width="3" filter="url(#glow)" opacity=".6"/></g>
      <path d="M380,620 C600,520 820,420 1040,320" stroke="#a6ecff" stroke-width="3" fill="none" stroke-dasharray="2 14" opacity=".55"/>
      <g class="a-bob">${vship(1060, 300, 1.4, -24)}</g>
    `);

  // A hologram of the Vanguard commander (stars through the window)
  A.recruit = () => {
    let scan = ''; for (let y = 190; y < 600; y += 6) scan += `<line x1="880" y1="${y}" x2="1120" y2="${y}" stroke="${C.cyan}" stroke-width="1" opacity=".18"/>`;
    return svg(`
      <path d="M-50,-50 L1650,-50 L1650,950 L-50,950 Z M140,90 L1460,90 L1460,470 L140,470 Z" fill="#070b18" fill-rule="evenodd"/>
      <rect x="140" y="90" width="1320" height="380" fill="none" stroke="#1a2a48" stroke-width="10"/>
      <line x1="580" y1="90" x2="580" y2="470" stroke="#1a2a48" stroke-width="8"/><line x1="1020" y1="90" x2="1020" y2="470" stroke="#1a2a48" stroke-width="8"/>
      ${planet(1250, 300, 90, 'refugeR', '#cfe8ff', '#3a6aa0', { atmo: '#9fd8ff' })}
      <rect x="-50" y="470" width="1700" height="500" fill="#0a1022"/>
      <path d="M-50,640 L1650,640 L1650,950 L-50,950 Z" fill="#060a16"/>
      ${emblem(330, 560, .9)}
      <path d="M1000,628 L860,180 L1140,180 Z" fill="url(#beamCyan)" opacity=".6"/>
      <ellipse cx="1000" cy="630" rx="110" ry="20" fill="#0e1a30" stroke="${C.cyan}" stroke-width="3" filter="url(#glow)"/>
      <g class="a-pulse" opacity=".85">${person(1000, 600, 2.0, { pose: 'stand', hair: 'cap', jacket: true, fill: '#2a8ab0', rim: C.cyan, rimOp: .8 })}</g>
      ${scan}
      ${person(640, 642, 1.45, Object.assign({ pose: 'stand', flip: true }, HERO))}
    `);
  };

  // Training deck: hologram targets
  A.training = () => {
    const target = (x, y, s, d) => `<g class="a-bob" style="animation-delay:${d}s"><g transform="translate(${x},${y}) scale(${s})" filter="url(#glow)">
      <circle r="42" fill="none" stroke="#ff9a3c" stroke-width="5"/><circle r="26" fill="none" stroke="#ff9a3c" stroke-width="4"/><circle r="9" fill="#ff9a3c"/>
      <line x1="0" y1="46" x2="0" y2="90" stroke="#ff9a3c" stroke-width="3" opacity=".5"/></g></g>`;
    let floor = ''; for (let i = -12; i <= 12; i++) floor += `<line x1="${800 + i * 30}" y1="560" x2="${800 + i * 160}" y2="900"/>`;
    for (let j = 0; j < 6; j++) { const y = 560 + Math.pow(j / 5, 1.6) * 340; floor += `<line x1="-50" y1="${f(y)}" x2="1650" y2="${f(y)}"/>`; }
    return svg(`
      ${rect('#060a18')}
      <rect x="-50" y="80" width="1700" height="120" fill="#0a1226"/>
      ${[200, 520, 840, 1160, 1480].map(x => `<rect x="${x - 70}" y="200" width="140" height="10" fill="${C.blue}" opacity=".5" filter="url(#glow)"/>`).join('')}
      <g opacity=".5">${vship(300, 300, 1.1, 0, { noTrail: true, fill: '#0e1830' })}${vship(1300, 320, 1.1, 180, { noTrail: true, fill: '#0e1830' })}</g>
      <rect x="-50" y="560" width="1700" height="400" fill="#081024"/>
      <g stroke="${C.blue}" stroke-opacity=".22" stroke-width="1.5">${floor}</g>
      ${target(1000, 330, 1.1, 0)}${target(1200, 420, .9, .7)}${target(1380, 300, .8, 1.4)}
      <g transform="translate(1180,440)" class="a-flash"><circle r="60" fill="url(#warm)"/>
        ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<line x1="0" y1="0" x2="${f(Math.cos(i * .785) * 50)}" y2="${f(Math.sin(i * .785) * 50)}" stroke="#ffd27a" stroke-width="3"/>`).join('')}</g>
      <g class="a-shoot"><path d="M560,486 L700,470" stroke="#bff3ff" stroke-width="6" stroke-linecap="round" filter="url(#glow)"/></g>
      <g class="a-shoot" style="animation-delay:.8s"><path d="M640,476 L780,458" stroke="#bff3ff" stroke-width="6" stroke-linecap="round" filter="url(#glow)"/></g>
      ${person(420, 642, 1.45, Object.assign({ pose: 'aim', flip: true }, HERO))}
    `);
  };

  // Meeting Puff in the hangar (stars through the bay door)
  A.puffmeet = () => svg(`
      <path d="M-50,-50 L1650,-50 L1650,950 L-50,950 Z M260,120 L1340,120 L1340,560 L260,560 Z" fill="#0a0f1e" fill-rule="evenodd"/>
      <path d="M260,120 L1340,120 L1340,560 L260,560 Z" fill="none" stroke="#24304e" stroke-width="18"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<path d="M${260 + i * 135},120 l20,-30 l20,30" fill="#ffcf3a" opacity=".6"/>`).join('')}
      <rect x="260" y="548" width="1080" height="10" fill="${C.blue}" opacity=".6" filter="url(#glow)"/>
      <rect x="-50" y="560" width="1700" height="400" fill="#0c1428"/>
      <path d="M-50,640 L1650,640 L1650,950 L-50,950 Z" fill="#070b18"/>
      ${vship(330, 600, 1.6, 0, { noTrail: true })}
      ${vship(1280, 610, 1.4, 180, { noTrail: true, fill: '#3a2a1a' })}
      <ellipse cx="740" cy="642" rx="80" ry="8" fill="#000" opacity=".5"/>
      ${person(720, 642, 1.5, Object.assign({ pose: 'helmet', flip: true }, HERO))}
      ${puff(980, 470, 1.25, { bubble: true, goggles: true, flip: true, mood: 'calm' })}
      <ellipse cx="980" cy="642" rx="60" ry="7" fill="#000" opacity=".4"/>
    `);

  // Black hole anomaly (stars behind)
  A.blackhole = () => svg(`
      <g transform="translate(900,330)">
        <ellipse rx="520" ry="300" fill="url(#warm)" opacity=".18"/>
        <g class="a-spin"><ellipse rx="440" ry="100" fill="none" stroke="#ff9a3c" stroke-width="22" stroke-dasharray="120 40 60 30" opacity=".55" filter="url(#glow)"/></g>
        <g class="a-spinr"><ellipse rx="340" ry="76" fill="none" stroke="#ffd27a" stroke-width="14" stroke-dasharray="90 30 40 20" opacity=".7" filter="url(#glow)"/></g>
        <path d="M-200,0 A200,200 0 0 1 200,0" fill="none" stroke="#ffe7b0" stroke-width="18" opacity=".55" filter="url(#glowBig)"/>
        <circle r="128" fill="none" stroke="#fff3d0" stroke-width="5" filter="url(#glowBig)"/>
        <circle r="120" fill="#000"/>
        <path d="M-440,0 A440,100 0 0 0 440,0" fill="none" stroke="#ffb347" stroke-width="20" opacity=".8" filter="url(#glow)"/>
        <path d="M-330,6 A330,70 0 0 0 330,6" fill="none" stroke="#fff3d0" stroke-width="8" opacity=".9" filter="url(#glow)"/>
      </g>
      <g class="a-bob">${vship(360, 560, .9, -8)}</g>
      <g class="a-bob2">${vship(250, 640, .7, -12, { fill: '#3a2a1a' })}</g>
    `);

  // Puff's ocean when it was alive (ocean canvas behind)
  A.reef = () => {
    const r = rng(77); let corals = '';
    const cols = ['#ff6fa8', '#ff9a5a', '#b48cff', '#5affd0', '#ffd25a'];
    for (let i = 0; i < 11; i++) corals += coral(60 + i * 150 + r() * 40, 700 + r() * 30, .9 + r() * .9, cols[i % 5], i + 5);
    let kelps = ''; for (let i = 0; i < 8; i++) kelps += kelp(40 + i * 220 + r() * 60, 720, 280 + r() * 220, '#2fa86a', f(r() * 2));
    return svg(`
      ${kelps}
      <path d="M-50,690 C200,650 400,700 700,670 C1000,640 1300,690 1650,660 L1650,950 L-50,950 Z" fill="#e6c88a" opacity=".85"/>
      ${corals}
      ${[260, 640, 1100, 1450].map((x, i) => `<path d="M${x - 70},700 A70,60 0 0 1 ${x + 70},700 Z" fill="${['#ff7a5a', '#c08cff', '#ffb35a', '#ff6fa8'][i]}"/><path d="M${x - 50},690 q15,-30 30,0 q15,-30 30,0 q15,-30 30,0" stroke="#00000033" stroke-width="4" fill="none"/>`).join('')}
      <g class="a-drift">${fishSchool(420, 260, 24, 320, '#ffe28a', 12, 1.1)}</g>
      <g class="a-drift" style="animation-direction:alternate-reverse">${fishSchool(1250, 330, 18, 260, '#7fe3ff', 15, 1)}</g>
      ${puff(800, 400, 1.6, { mood: 'happy' })}
    `);
  };

  // The same reef, poisoned (polluted canvas behind)
  A.polluted = () => {
    const r = rng(77); let corals = '';
    for (let i = 0; i < 11; i++) corals += coral(60 + i * 150 + r() * 40, 700 + r() * 30, .9 + r() * .9, ['#4a4e46', '#3e423c', '#555a50'][i % 3], i + 5);
    const barrel = (x, y, rot) => `<g transform="translate(${x},${y}) rotate(${rot})"><rect x="-28" y="-40" width="56" height="80" rx="6" fill="#4a5a2a"/><rect x="-28" y="-14" width="56" height="6" fill="#2a3416"/><rect x="-28" y="12" width="56" height="6" fill="#2a3416"/><path d="M-10,-8 L10,-8 L0,8 Z" fill="#c8d040"/></g>`;
    return svg(`
      <path d="M-50,690 C200,650 400,700 700,670 C1000,640 1300,690 1650,660 L1650,950 L-50,950 Z" fill="#3a3a2a"/>
      ${corals}
      <g transform="translate(0,0)"><path d="M-50,120 L300,120 L300,170 L-50,170 Z" fill="#2a2c28"/><rect x="290" y="100" width="40" height="90" fill="#3a3c38"/>
        <path d="M330,140 C400,160 420,300 380,520 C360,620 520,700 600,720 L120,720 C160,600 260,400 330,140 Z" fill="#1a1a10" opacity=".75"/></g>
      <path d="M1650,60 L1300,60 L1300,110 L1650,110 Z" fill="#2a2c28"/><rect x="1270" y="40" width="40" height="90" fill="#3a3c38"/>
      <path d="M1270,90 C1200,120 1180,260 1240,420 C1280,520 1180,640 1100,720 L1500,720 C1440,560 1320,360 1270,90 Z" fill="#1a1a10" opacity=".6"/>
      ${barrel(520, 690, 70)}${barrel(1180, 700, -20)}${barrel(980, 710, 95)}
      <ellipse cx="760" cy="720" rx="60" ry="22" fill="none" stroke="#1a1a18" stroke-width="18"/>
      <g class="a-drift"><path d="M600,260 c30,-20 60,10 50,40 c-10,30 -50,30 -60,0 Z" fill="#c8c8c0" opacity=".25"/><path d="M1000,200 l40,10 l-10,30 l-40,-6 Z" fill="#c8c8c0" opacity=".25"/></g>
      ${puff(820, 420, 1.2, { mood: 'sad' })}
    `);
  };

  // The trial offer: the eye in the murk (polluted canvas behind)
  A.trialeye = () => svg(`
      ${rect('#1a0606', 'opacity=".35"')}
      <g class="a-bob2">${eye(800, 250, 1.35, { halo: .8 })}</g>
      <path d="M720,330 L620,700 L980,700 L880,330 Z" fill="url(#beamRed)" opacity=".5"/>
      ${puff(800, 560, .9, { mood: 'firm', look: 'up' })}
    `);

  // Puff's planet breaking apart (stars behind)
  A.destroyed = () => {
    const r = rng(5); let chunks = '';
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, d = 250 + r() * 80;
      chunks += `<g class="a-break" style="--dx:${f(Math.cos(a) * 160)}px;--dy:${f(Math.sin(a) * 120)}px;--rot:${f(r() * 120 - 60)}deg;animation-delay:${f(-r() * 4)}s">
        <path transform="translate(${f(800 + Math.cos(a) * d)},${f(380 + Math.sin(a) * d * .9)}) rotate(${f(r() * 360)})" d="M0,-${f(10 + r() * 16)} L${f(12 + r() * 10)},0 L0,${f(10 + r() * 12)} L-${f(10 + r() * 10)},4 Z" fill="#2a4a6a" stroke="#ff8a3a" stroke-width="2"/></g>`;
    }
    return svg(`
      ${[0, 1.6].map(d => `<g class="a-ring" style="animation-delay:${d}s"><circle cx="800" cy="380" r="700" fill="none" stroke="#ffb347" stroke-width="6" opacity=".7"/></g>`).join('')}
      ${planet(800, 380, 230, 'oceanW', '#7fd8ff', '#0a2a5a', { atmo: '#ff6a3a', extra: `<g filter="url(#glow)" stroke="#ffb347" stroke-width="6" fill="none" stroke-linecap="round" class="a-pulse">
        <path d="M-210,-40 L-120,-20 L-60,-70 L10,-30 L60,-90 L140,-60 L220,-100"/><path d="M-60,-70 L-40,20 L-90,90 L-40,170"/><path d="M10,-30 L40,60 L120,90 L160,170"/><path d="M60,-90 L40,-200"/></g>
        <circle r="230" fill="url(#redGlow)" opacity=".5"/>` })}
      ${chunks}
      <g class="a-bob">${vship(1220, 640, .6, -20, { fill: '#3a2a1a' })}</g>
    `);
  };

  // Talking it over at the observation window (stars through window)
  A.window = () => svg(`
      <path d="M-50,-50 L1650,-50 L1650,950 L-50,950 Z M200,100 C200,100 800,40 1400,100 L1400,540 L200,540 Z" fill="#070b18" fill-rule="evenodd"/>
      <path d="M200,100 C200,100 800,40 1400,100 L1400,540 L200,540 Z" fill="none" stroke="#1a2a48" stroke-width="12"/>
      <rect x="-50" y="540" width="1700" height="400" fill="#0a1022"/>
      <rect x="160" y="540" width="1280" height="22" fill="#121a34"/>
      ${person(640, 642, 1.45, Object.assign({ pose: 'stand', flip: true, lean: -2 }, HERO, { rimDx: -2, rim: C.blueHi }))}
      ${puff(880, 460, 1.0, { bubble: true, goggles: true, flip: true, mood: 'calm' })}
    `);

  // Cockpit: distress call from home (stars through the canopy)
  A.distress = () => svg(`
      <path d="M-50,-50 L1650,-50 L1650,950 L-50,950 Z M160,520 C200,240 420,90 800,80 C1180,90 1400,240 1440,520 Z" fill="#05080f" fill-rule="evenodd"/>
      <path d="M160,520 C200,240 420,90 800,80 C1180,90 1400,240 1440,520" fill="none" stroke="#1a2a48" stroke-width="16"/>
      <line x1="800" y1="80" x2="800" y2="520" stroke="#1a2a48" stroke-width="10"/>
      ${planet(1060, 300, 110, 'homeD', '#a0442a', '#2a0c0c', { atmo: '#ff6a3a' })}
      <g class="a-bob2"><ellipse cx="1060" cy="190" rx="130" ry="18" fill="#12070e"/><circle cx="1060" cy="200" r="7" fill="${C.red}" filter="url(#glow)"/></g>
      <path d="M-50,520 L1650,520 L1650,950 L-50,950 Z" fill="#0a1022"/>
      <path d="M200,520 L1400,520 L1300,640 L300,640 Z" fill="#111a32" stroke="#24304e" stroke-width="3"/>
      ${Array.from({ length: 18 }, (_, i) => `<rect x="${330 + i * 52}" y="${560 + (i % 3) * 22}" width="22" height="9" rx="2" fill="${['#4fc3ff', '#5affd0', '#ffcf3a'][i % 3]}" opacity=".7" class="a-pulse" style="animation-delay:${i * .17}s"/>`).join('')}
      <g class="a-flash"><g transform="translate(560,330)">
        <circle r="96" fill="#ff3b3b" opacity=".12"/><circle r="96" fill="none" stroke="${C.red}" stroke-width="4" filter="url(#glow)"/>
        <path d="M0,-50 L46,34 L-46,34 Z" fill="none" stroke="${C.red}" stroke-width="7" stroke-linejoin="round"/>
        <rect x="-4" y="-18" width="8" height="30" fill="${C.red}"/><circle cy="22" r="5" fill="${C.red}"/></g></g>
      <path d="M560,430 L560,520" stroke="${C.red}" stroke-width="3" opacity=".6"/>
    `);

  // Heading home with the squadron (stars + planet through the bay)
  A.return = () => svg(`
      ${planet(1150, 330, 200, 'homeR', '#c0603a', '#2a0c0c', { atmo: '#ff8a4a' })}
      <g class="a-bob2"><ellipse cx="1150" cy="140" rx="230" ry="30" fill="#12070e"/><circle cx="1150" cy="158" r="9" fill="${C.red}" filter="url(#glow)"/></g>
      <g class="a-fly">${vship(500, 400, .7, -18)}</g>
      <g class="a-fly" style="animation-delay:1.5s">${vship(420, 470, .6, -18)}</g>
      <g class="a-fly" style="animation-delay:3s">${vship(560, 300, .55, -18)}</g>
      <g class="a-fly" style="animation-delay:4.2s">${vship(380, 360, .5, -18, { fill: '#3a2a1a' })}</g>
      <path d="M-50,-50 L1650,-50 L1650,950 L-50,950 Z M120,60 L1500,60 L1500,560 L120,560 Z" fill="#070b18" fill-rule="evenodd"/>
      <path d="M120,60 L1500,60 L1500,560 L120,560 Z" fill="none" stroke="#24304e" stroke-width="16"/>
      <rect x="120" y="548" width="1380" height="10" fill="${C.blue}" opacity=".6" filter="url(#glow)"/>
      <rect x="-50" y="560" width="1700" height="400" fill="#0c1428"/>
      <path d="M-50,640 L1650,640 L1650,950 L-50,950 Z" fill="#070b18"/>
      ${emblem(190, 330, .55)}
      ${person(560, 642, 1.75, Object.assign({ pose: 'fist', flip: true }, HERO))}
      ${puff(780, 440, 1.1, { bubble: true, goggles: true, flip: false, mood: 'firm' })}
    `);

  // Ending: sunrise, the people freed
  A.liberation = () => {
    const r = rng(19); let crowd = '';
    for (let i = 0; i < 22; i++) {
      const x = 60 + i * 70 + r() * 20;
      if (Math.abs(x - 800) < 110) continue;
      crowd += person(x, 650 + r() * 10, .85 + r() * .25, { pose: r() < .6 ? 'cheer' : 'fist', fill: '#1a1020', hair: ['hood', 'bob', 'cap', 'pony', ''][Math.floor(r() * 5)], coat: r() < .4, flip: r() < .5 });
    }
    return svg(`<defs>${lin('dawn', [[0, '#1b2a5a'], [.45, '#6a5aa0'], [.75, '#f08a5a'], [1, '#ffd08a']])}</defs>
      ${rect('url(#dawn)')}
      <circle cx="800" cy="560" r="220" fill="#ffe0a0" opacity=".45" filter="url(#blur24)"/>
      <circle cx="800" cy="560" r="110" fill="#fff0c8"/>
      <g opacity=".6">${skyline(41, 590, 80, 260, '#4a3050', .06, '#ffe0a0', .6)}</g>
      <g transform="translate(1280,160) rotate(14)"><ellipse rx="220" ry="28" fill="#2a1824" opacity=".75"/><path d="M-40,20 L-60,60 M30,22 L50,70" stroke="#2a1824" stroke-width="6"/></g>
      ${smoke(1300, 220, 5, 3, '#3a2a3a')}
      ${vship(300, 210, .7, -8)}${vship(420, 160, .55, -8)}${vship(210, 130, .5, -8)}
      <rect x="-50" y="640" width="1700" height="400" fill="#140c18"/>
      ${crowd}
      ${person(760, 652, 1.45, Object.assign({ pose: 'cheer', flip: true }, HERO, { rim: '#ffe0a0' }))}
      ${person(850, 652, 1.35, Object.assign({ pose: 'fist' }, FRIEND, { rim: '#ffe0a0', rimOp: .9 }))}
    `);
  };

  /* ---------- register ---------- */
  function inject() {
    if (document.getElementById('cs-art-style')) return;
    const s = document.createElement('style'); s.id = 'cs-art-style'; s.textContent = ART_CSS; document.head.appendChild(s);
  }
  const cache = {};
  global.CUTSCENE_ART = {
    has: k => !!A[k],
    render(k) { inject(); return cache[k] || (cache[k] = A[k]()); },
    list: () => Object.keys(A),
  };
})(window);
