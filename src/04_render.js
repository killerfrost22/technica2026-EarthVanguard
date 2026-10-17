/* 04_render.js (core)
   Provides: SL.render = { ctx (scene 2D context in 720x1280 logical space), hud (HUD context, logical
   space), scene (offscreen scene canvas), hasGL, distortion, quality, qualitySetting, auto, q, bloom,
   setQuality(q), addLens(x, y, radius, strength), addRipple(x, y, radius, amplitude, width),
   chromatic(amount), flash(color, alpha), desaturate(amount), vignette(amount), setTransform(ctx, x, y,
   rot, sx, sy), resetTransform(ctx), frame(), beginUpdate(), endUpdate(), resize(), toLogical(clientX,
   clientY), toScreen(x, y), cssW, cssH, dpr, scale, base, fps, frameMs, glInfo, loseContextForTest() }.
   Pipeline (WebGL1): scene canvas -> texture -> bright pass + 1/4 downsample -> separable gaussian blur
   at 1/4, 1/8, 1/16 (Medium: 1/8 and 1/16) -> composite with lens and ripple UV distortion, chromatic
   aberration, soft-limited bloom, flash, desaturate, vignette, dither -> #screen.
   Fallback (no WebGL, ?nogl=1, context lost, Low quality): the scene is blitted to a 2D #screen with 2D
   flash, desaturate and vignette; lens and ripple are skipped (distortion = false).
   Post effects are per frame: those added during SL.update persist until the next update step (so a
   paused frame keeps them); those added while drawing are cleared after the frame. Also owns the
   blurred #ambient backdrop that fills the page around the 9:16 game box. */
(function (SL) {
  'use strict';

  const W = SL.W, H = SL.H, U = SL.util;
  const MAX_LENS = 6, MAX_RIPPLE = 8;
  const QUALITY = {
    high: { q: 1, gl: true, levels: 3, particles: 2500 },
    medium: { q: 1, gl: true, levels: 2, particles: 1600 },
    low: { q: 0.75, gl: false, levels: 0, particles: 900 },
  };
  const ORDER = ['high', 'medium', 'low'];

  // ------------------------------------------------------------------ per-frame post effects
  function makeFx() {
    return {
      lens: Array.from({ length: MAX_LENS }, () => ({ x: 0, y: 0, r: 0, s: 1 })), nLens: 0,
      rip: Array.from({ length: MAX_RIPPLE }, () => ({ x: 0, y: 0, r: 0, a: 0, w: 1 })), nRip: 0,
      chroma: 0, flashA: 0, flashC: [255, 255, 255], desat: 0, vig: -1,
    };
  }
  function clearFx(f) { f.nLens = 0; f.nRip = 0; f.chroma = 0; f.flashA = 0; f.desat = 0; f.vig = -1; }
  const fxU = makeFx(), fxD = makeFx();
  let inUpdate = false;
  const cur = () => (inUpdate ? fxU : fxD);

  // ------------------------------------------------------------------ state
  let gameEl = null, appEl = null, hudEl = null, ambientEl = null;
  let glCanvas = null, c2Canvas = null, c2 = null;
  let hudCtx = null, ambCtx = null;
  let G = null;
  let glLost = false;
  let noGL = false;
  let glActive = false;
  let dirty = true;
  let bw = 1, bh = 1;
  let frameNo = 0;
  let lastFrame = 0;
  let autoAcc = 0, autoN = 0, autoStart = 0;
  let vigCanvas = null;
  let cqSupported = true;
  const drawErrors = new Set();

  const R = SL.render = {
    ctx: null,
    hud: null,
    scene: null,
    hasGL: false,
    distortion: false,
    quality: 'high',
    qualitySetting: 'auto',
    auto: true,
    q: 1,
    cssW: W * 0.5,
    cssH: H * 0.5,
    left: 0,
    top: 0,
    dpr: 1,
    scale: 0.5,
    /** Scene base transform (uniform scale + shake offset, in scene-canvas pixels). */
    base: { s: 1, x: 0, y: 0, shakeX: 0, shakeY: 0 },
    fps: 60,
    frameMs: 16.7,
    glInfo: '',
    QUALITY,
    /** Bloom tuning, read every frame: bright-pass threshold and knee (0..1 of the brightest channel),
        overall strength, weights of the 1/4, 1/8 and 1/16 blur levels, and knee2 (soft limit on the
        added bloom, b / (1 + knee2 * b), so hot cores cannot run away). */
    bloom: { threshold: 0.74, knee: 0.22, strength: 2.8, weights: [1.0, 0.95, 0.85], knee2: 0.55 },

    addLens(x, y, radius, strength) {
      const f = cur();
      if (f.nLens >= MAX_LENS || !(radius > 0) || !isFinite(x) || !isFinite(y) || !isFinite(radius)) return;
      const l = f.lens[f.nLens++];
      l.x = x; l.y = y; l.r = radius; l.s = strength == null || !isFinite(strength) ? 1 : U.clamp(strength, 0, 3);
    },
    addRipple(x, y, radius, amplitude, width) {
      const f = cur();
      if (f.nRip >= MAX_RIPPLE || !(radius >= 0) || !isFinite(x) || !isFinite(y) || !isFinite(radius)) return;
      const r = f.rip[f.nRip++];
      r.x = x; r.y = y; r.r = radius; r.a = isFinite(amplitude) ? amplitude : 0; r.w = Math.max(1, isFinite(width) && width > 0 ? width : 30);
    },
    chromatic(amount) { const f = cur(); f.chroma = Math.max(f.chroma, U.clamp(+amount || 0, 0, 1)); },
    flash(color, alpha) {
      const f = cur();
      alpha = U.clamp(+alpha || 0, 0, 1);
      if (alpha <= f.flashA) return;
      f.flashA = alpha;
      const p = SL.color.parse(color || '#ffffff');
      f.flashC[0] = p[0]; f.flashC[1] = p[1]; f.flashC[2] = p[2];
    },
    desaturate(amount) { const f = cur(); f.desat = Math.max(f.desat, U.clamp(+amount || 0, 0, 1)); },
    vignette(amount) { const f = cur(); f.vig = Math.max(f.vig, U.clamp(+amount || 0, 0, 1)); },

    /** Called by the game around every update step. Clears update-phase effects unless keep is true
        (hit-stop: the world is frozen, so its lenses and ripples must stay on screen). */
    beginUpdate(keep) { if (!keep) clearFx(fxU); inUpdate = true; },
    endUpdate() { inUpdate = false; },

    setQuality(q) {
      if (!QUALITY[q]) return;
      R.quality = q;
      R.q = QUALITY[q].q;
      if (!R.scene) return;
      sizeScene();
      chooseOutput();
      if (SL.fx && SL.fx.setCap) SL.fx.setCap(QUALITY[q].particles);
      SL.bus.emit('qualityChange', { quality: q });
    },

    resize() { dirty = true; },

    /** Scene ctx helper: translate(x, y) * rotate(rot) * scale(sx, sy) composed with the scene base
        (quality scale + camera shake). Cheaper than save/translate/rotate/restore in hot draw code. */
    setTransform(ctx, x, y, rot, sx, sy) {
      const b = R.base, s = b.s;
      sx = sx == null ? 1 : sx;
      sy = sy == null ? sx : sy;
      const c = rot ? Math.cos(rot) : 1, n = rot ? Math.sin(rot) : 0;
      ctx.setTransform(c * sx * s, n * sx * s, -n * sy * s, c * sy * s, b.x + x * s, b.y + y * s);
    },
    /** Restores the scene base transform, alpha 1 and source-over. */
    resetTransform(ctx) {
      const b = R.base;
      ctx.setTransform(b.s, 0, 0, b.s, b.x, b.y);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },

    toLogical(clientX, clientY) {
      return { x: ((clientX - R.left) / Math.max(1, R.cssW)) * W, y: ((clientY - R.top) / Math.max(1, R.cssH)) * H };
    },
    toScreen(x, y) {
      return { x: R.left + (x / W) * R.cssW, y: R.top + (y / H) * R.cssH };
    },

    frame,

    /** Test hook: simulates a lost WebGL context (and restores it after `restoreMs` if given). */
    loseContextForTest(restoreMs) {
      if (!G) return false;
      const ext = G.gl.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      ext.loseContext();
      if (restoreMs != null) setTimeout(() => { try { ext.restoreContext(); } catch (e) { /* ignore */ } }, restoreMs);
      return true;
    },
  };

  // ------------------------------------------------------------------ sizing
  function measure() {
    dirty = false;
    if (!gameEl) return;
    if (!cqSupported && appEl) {
      const aw = appEl.clientWidth, ah = appEl.clientHeight;
      const w = Math.max(1, Math.min(aw, (ah * 9) / 16));
      gameEl.style.width = w + 'px';
      gameEl.style.height = (w * 16) / 9 + 'px';
    }
    const r = gameEl.getBoundingClientRect();
    R.cssW = Math.max(1, r.width);
    R.cssH = Math.max(1, r.height);
    R.left = r.left;
    R.top = r.top;
    R.dpr = Math.min(window.devicePixelRatio || 1, 2);
    R.scale = R.cssW / W;
    const nw = Math.max(1, Math.round(R.cssW * R.dpr)), nh = Math.max(1, Math.round(R.cssH * R.dpr));
    if (nw !== bw || nh !== bh) {
      bw = nw; bh = nh;
      if (glCanvas) { glCanvas.width = bw; glCanvas.height = bh; }
      if (c2Canvas) { c2Canvas.width = bw; c2Canvas.height = bh; }
      if (hudEl) { hudEl.width = bw; hudEl.height = bh; }
      SL.bus.emit('resize', { w: R.cssW, h: R.cssH, dpr: R.dpr });
    }
  }

  function sizeScene() {
    const sw = Math.round(W * R.q), sh = Math.round(H * R.q);
    if (R.scene.width !== sw || R.scene.height !== sh) {
      R.scene.width = sw;
      R.scene.height = sh;
    }
    if (G) sizeTargets();
  }

  // ------------------------------------------------------------------ WebGL
  const VS = 'attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}';

  const FS_BRIGHT = [
    'precision mediump float;',
    'varying vec2 vUv;uniform sampler2D uTex;uniform vec2 uTexel;uniform float uThresh;uniform float uKnee;',
    'vec3 bright(vec3 c){',
    '  float m=max(c.r,max(c.g,c.b));',
    '  float soft=clamp(m-uThresh+uKnee,0.0,2.0*uKnee);',
    '  soft=soft*soft/(4.0*uKnee+0.00001);',
    '  return c*(max(soft,m-uThresh)/max(m,0.00001));',
    '}',
    'void main(){',
    '  vec3 a=bright(texture2D(uTex,vUv+uTexel*vec2(-1.0,-1.0)).rgb);',
    '  vec3 b=bright(texture2D(uTex,vUv+uTexel*vec2(1.0,-1.0)).rgb);',
    '  vec3 c=bright(texture2D(uTex,vUv+uTexel*vec2(-1.0,1.0)).rgb);',
    '  vec3 d=bright(texture2D(uTex,vUv+uTexel*vec2(1.0,1.0)).rgb);',
    '  gl_FragColor=vec4((a+b+c+d)*0.25,1.0);',
    '}',
  ].join('\n');

  const FS_DOWN = [
    'precision mediump float;',
    'varying vec2 vUv;uniform sampler2D uTex;uniform vec2 uTexel;',
    'void main(){',
    '  vec3 c=texture2D(uTex,vUv+uTexel*vec2(-1.0,-1.0)).rgb+texture2D(uTex,vUv+uTexel*vec2(1.0,-1.0)).rgb',
    '        +texture2D(uTex,vUv+uTexel*vec2(-1.0,1.0)).rgb+texture2D(uTex,vUv+uTexel*vec2(1.0,1.0)).rgb;',
    '  gl_FragColor=vec4(c*0.25,1.0);',
    '}',
  ].join('\n');

  const FS_BLUR = [
    'precision mediump float;',
    'varying vec2 vUv;uniform sampler2D uTex;uniform vec2 uDir;',
    'void main(){',
    '  vec3 c=texture2D(uTex,vUv).rgb*0.2270270270;',
    '  c+=texture2D(uTex,vUv+uDir*1.3846153846).rgb*0.3162162162;',
    '  c+=texture2D(uTex,vUv-uDir*1.3846153846).rgb*0.3162162162;',
    '  c+=texture2D(uTex,vUv+uDir*3.2307692308).rgb*0.0702702703;',
    '  c+=texture2D(uTex,vUv-uDir*3.2307692308).rgb*0.0702702703;',
    '  gl_FragColor=vec4(c,1.0);',
    '}',
  ].join('\n');

  function compositeSrc(prec) {
    return [
      'precision ' + prec + ' float;',
      'varying vec2 vUv;',
      'uniform sampler2D uScene;uniform sampler2D uB0;uniform sampler2D uB1;uniform sampler2D uB2;',
      'uniform vec2 uRes;',
      'uniform vec4 uLens[6];uniform int uLensN;',
      'uniform vec4 uRip[8];uniform float uRipW[8];uniform int uRipN;',
      'uniform vec3 uBloomW;uniform float uBloomK;uniform float uChroma;uniform vec4 uFlash;uniform float uDesat;uniform float uVig;uniform float uTime;',
      'float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}',
      'void main(){',
      '  vec2 p=vUv*uRes;',
      '  vec2 src=p;',
      '  float mask=1.0;',
      '  float rim=0.0;',
      '  for(int i=0;i<6;i++){',
      '    if(i>=uLensN)break;',
      '    vec4 L=uLens[i];',
      '    vec2 d=p-L.xy;',
      '    float r=max(length(d),0.001);',
      '    float E=L.w;',
      '    float win=1.0-smoothstep(E*2.5,E*5.0,r);',
      // point-mass lens equation: the source seen at image radius r lies at r - E^2/r (Einstein ring at r = E)
      '    src-=(d/r)*(E*E/r)*win;',
      '    mask*=smoothstep(L.z*0.9,L.z*1.03,r);',
      '    float z=(r-L.z*1.06)/(L.z*0.07);',
      '    rim+=exp(-z*z);',
      '  }',
      '  for(int i=0;i<8;i++){',
      '    if(i>=uRipN)break;',
      '    vec4 Q=uRip[i];',
      '    vec2 d=p-Q.xy;',
      '    float r=max(length(d),0.001);',
      '    float x=(r-Q.z)/uRipW[i];',
      '    if(abs(x)<1.0){',
      '      float k=1.0-x*x;',
      '      src-=(d/r)*Q.w*x*k*k*2.6;',
      '    }',
      '  }',
      '  vec2 uv=src/uRes;',
      '  vec3 col;',
      '  if(uChroma>0.001){',
      '    vec2 off=(vUv-0.5)*uChroma*0.022;',
      '    col.r=texture2D(uScene,uv+off).r;',
      '    col.g=texture2D(uScene,uv).g;',
      '    col.b=texture2D(uScene,uv-off).b;',
      '  }else col=texture2D(uScene,uv).rgb;',
      '  vec3 bloom=texture2D(uB0,uv).rgb*uBloomW.x+texture2D(uB1,uv).rgb*uBloomW.y+texture2D(uB2,uv).rgb*uBloomW.z;',
      // soft knee on the bloom term: faint halos stay linear, hot cores (explosions) cannot run away
      '  col+=bloom/(1.0+bloom*uBloomK);',
      '  col*=mask;',
      '  col+=vec3(1.0,0.82,0.62)*rim*0.10*mask;',
      '  col=1.0-(1.0-col)*(1.0-uFlash.rgb*uFlash.a);',
      '  float l=dot(col,vec3(0.299,0.587,0.114));',
      '  col=mix(col,vec3(l),uDesat);',
      '  vec2 q=vUv-0.5;',
      '  float v=smoothstep(0.32,0.92,length(q*vec2(1.25,1.0))*1.18);',
      '  col*=1.0-uVig*v;',
      '  col+=(hash(gl_FragCoord.xy+uTime)-0.5)/255.0;',
      '  gl_FragColor=vec4(col,1.0);',
      '}',
    ].join('\n');
  }

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('shader compile failed: ' + log);
    }
    return s;
  }
  function program(gl, fs, uniforms) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('program link failed: ' + gl.getProgramInfoLog(p));
    const u = {};
    for (const name of uniforms) u[name] = gl.getUniformLocation(p, name);
    return { p, u };
  }
  function texture(gl, w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w && h) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }
  function target(gl, w, h) {
    const tex = texture(gl, w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok && !gl.isContextLost()) throw new Error('framebuffer incomplete');
    return { tex, fb, w, h };
  }

  function getContext(canvas) {
    const opts = {
      alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false,
      preserveDrawingBuffer: false, powerPreference: 'high-performance',
    };
    try { return canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { return null; }
  }

  function buildGL(gl) {
    const hp = gl.getShaderPrecisionFormat && gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const prec = hp && hp.precision > 0 ? 'highp' : 'mediump';
    const g = {
      gl,
      bright: program(gl, FS_BRIGHT, ['uTex', 'uTexel', 'uThresh', 'uKnee']),
      down: program(gl, FS_DOWN, ['uTex', 'uTexel']),
      blur: program(gl, FS_BLUR, ['uTex', 'uDir']),
      comp: program(gl, compositeSrc(prec), ['uScene', 'uB0', 'uB1', 'uB2', 'uRes', 'uLens', 'uLensN', 'uRip', 'uRipW',
        'uRipN', 'uBloomW', 'uBloomK', 'uChroma', 'uFlash', 'uDesat', 'uVig', 'uTime']),
      buf: gl.createBuffer(),
      sceneTex: texture(gl, 0, 0),
      sceneW: 0, sceneH: 0,
      black: texture(gl, 1, 1),
      lv: [], tmp: [],
      lensArr: new Float32Array(MAX_LENS * 4),
      ripArr: new Float32Array(MAX_RIPPLE * 4),
      ripW: new Float32Array(MAX_RIPPLE),
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.bindTexture(gl.TEXTURE_2D, g.black);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    R.glInfo = (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) + ' (' + prec + ')';
    return g;
  }

  function sizeTargets() {
    const gl = G.gl;
    for (const t of G.lv.concat(G.tmp)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    G.lv = []; G.tmp = [];
    const sw = R.scene.width, sh = R.scene.height;
    let w = Math.max(1, Math.round(sw / 4)), h = Math.max(1, Math.round(sh / 4));
    for (let i = 0; i < 3; i++) {
      G.lv.push(target(gl, w, h));
      G.tmp.push(target(gl, w, h));
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
    }
  }

  function initGL() {
    if (noGL) return false;
    if (!glCanvas) return false;
    const gl = getContext(glCanvas);
    if (!gl) return false;
    try {
      G = buildGL(gl);
      sizeTargets();
      R.hasGL = true;
      return true;
    } catch (err) {
      console.warn('[SL.render] WebGL setup failed; using 2D output.', err && err.message);
      G = null;
      R.hasGL = false;
      return false;
    }
  }

  function pass(prog, tgt, w, h) {
    const gl = G.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fb : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.p);
  }
  function draw() { G.gl.drawArrays(G.gl.TRIANGLES, 0, 3); }
  function bindTex(unit, tex) {
    const gl = G.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }
  function blurLevel(i) {
    const gl = G.gl, a = G.lv[i], b = G.tmp[i], pr = G.blur;
    pass(pr, b, b.w, b.h);
    gl.uniform1i(pr.u.uTex, 0);
    bindTex(0, a.tex);
    gl.uniform2f(pr.u.uDir, 1 / a.w, 0);
    draw();
    pass(pr, a, a.w, a.h);
    bindTex(0, b.tex);
    gl.uniform2f(pr.u.uDir, 0, 1 / a.h);
    draw();
  }

  function compositeGL(fx) {
    const gl = G.gl;
    if (gl.isContextLost()) return false;
    const sc = R.scene;
    // upload the scene
    bindTex(0, G.sceneTex);
    if (G.sceneW !== sc.width || G.sceneH !== sc.height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sc);
      G.sceneW = sc.width;
      G.sceneH = sc.height;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sc);
    }
    const levels = QUALITY[R.quality].levels || 2;
    // bright pass into 1/4
    const l0 = G.lv[0];
    pass(G.bright, l0, l0.w, l0.h);
    gl.uniform1i(G.bright.u.uTex, 0);
    gl.uniform2f(G.bright.u.uTexel, 1 / sc.width, 1 / sc.height);
    const bl = R.bloom;
    gl.uniform1f(G.bright.u.uThresh, U.clamp(+bl.threshold || 0.6, 0.05, 2));
    gl.uniform1f(G.bright.u.uKnee, U.clamp(+bl.knee || 0.28, 0.01, 1));
    draw();
    if (levels >= 3) blurLevel(0);
    for (let i = 1; i < 3; i++) {
      const src = G.lv[i - 1], dst = G.lv[i];
      pass(G.down, dst, dst.w, dst.h);
      gl.uniform1i(G.down.u.uTex, 0);
      bindTex(0, src.tex);
      gl.uniform2f(G.down.u.uTexel, 1 / src.w, 1 / src.h);
      draw();
      blurLevel(i);
    }
    // composite
    const c = G.comp, u = c.u;
    pass(c, null, bw, bh);
    bindTex(0, G.sceneTex);
    bindTex(1, levels >= 3 ? G.lv[0].tex : G.black);
    bindTex(2, G.lv[1].tex);
    bindTex(3, G.lv[2].tex);
    gl.uniform1i(u.uScene, 0);
    gl.uniform1i(u.uB0, 1);
    gl.uniform1i(u.uB1, 2);
    gl.uniform1i(u.uB2, 3);
    gl.uniform2f(u.uRes, W, H);
    const sx = R.base.shakeX, sy = R.base.shakeY;
    let n = 0;
    const lists = [fxU, fxD];
    for (const f of lists) {
      for (let i = 0; i < f.nLens && n < MAX_LENS; i++, n++) {
        const l = f.lens[i];
        G.lensArr[n * 4] = l.x + sx;
        G.lensArr[n * 4 + 1] = H - (l.y + sy);
        G.lensArr[n * 4 + 2] = l.r;
        G.lensArr[n * 4 + 3] = l.r * (1 + 1.2 * l.s);
      }
    }
    gl.uniform4fv(u.uLens, G.lensArr);
    gl.uniform1i(u.uLensN, n);
    n = 0;
    for (const f of lists) {
      for (let i = 0; i < f.nRip && n < MAX_RIPPLE; i++, n++) {
        const r = f.rip[i];
        G.ripArr[n * 4] = r.x + sx;
        G.ripArr[n * 4 + 1] = H - (r.y + sy);
        G.ripArr[n * 4 + 2] = r.r;
        G.ripArr[n * 4 + 3] = r.a;
        G.ripW[n] = r.w;
      }
    }
    gl.uniform4fv(u.uRip, G.ripArr);
    gl.uniform1fv(u.uRipW, G.ripW);
    gl.uniform1i(u.uRipN, n);
    const bw3 = bl.weights || [0.8, 0.9, 1.05], str = bl.strength != null ? +bl.strength : 1;
    if (levels >= 3) gl.uniform3f(u.uBloomW, bw3[0] * str, bw3[1] * str, bw3[2] * str);
    else gl.uniform3f(u.uBloomW, 0, (bw3[1] + bw3[0] * 0.35) * str, bw3[2] * 1.1 * str);
    gl.uniform1f(u.uBloomK, bl.knee2 != null ? Math.max(0, +bl.knee2) : 0.55);
    gl.uniform1f(u.uChroma, fx.chroma);
    gl.uniform4f(u.uFlash, fx.flashC[0] / 255, fx.flashC[1] / 255, fx.flashC[2] / 255, fx.flashA);
    gl.uniform1f(u.uDesat, fx.desat);
    gl.uniform1f(u.uVig, fx.vig);
    gl.uniform1f(u.uTime, (frameNo % 997) * 0.731);
    draw();
    return true;
  }

  // ------------------------------------------------------------------ 2D output
  function ensure2D() {
    if (c2Canvas) return;
    c2Canvas = document.createElement('canvas');
    c2Canvas.className = 'sl-screen-canvas';
    c2Canvas.width = bw;
    c2Canvas.height = bh;
    c2Canvas.hidden = true;
    if (glCanvas && glCanvas.parentNode) glCanvas.parentNode.insertBefore(c2Canvas, glCanvas.nextSibling);
    else if (gameEl) gameEl.insertBefore(c2Canvas, gameEl.firstChild);
    c2 = c2Canvas.getContext('2d', { alpha: false });
  }

  function makeVignette() {
    const c = document.createElement('canvas');
    c.width = 90; c.height = 160;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(45, 80, 30, 45, 80, 108);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = g;
    x.fillRect(0, 0, 90, 160);
    return c;
  }

  function composite2D(fx) {
    const c = c2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.drawImage(R.scene, 0, 0, bw, bh);
    if (fx.vig > 0.001) {
      c.globalAlpha = Math.min(1, fx.vig * 1.25);
      c.drawImage(vigCanvas, 0, 0, bw, bh);
    }
    if (fx.desat > 0.01) {
      c.globalCompositeOperation = 'saturation';
      c.globalAlpha = fx.desat;
      c.fillStyle = '#808080';
      c.fillRect(0, 0, bw, bh);
    }
    if (fx.flashA > 0.004) {
      c.globalCompositeOperation = 'screen';
      c.globalAlpha = fx.flashA;
      c.fillStyle = 'rgb(' + fx.flashC[0] + ',' + fx.flashC[1] + ',' + fx.flashC[2] + ')';
      c.fillRect(0, 0, bw, bh);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  function chooseOutput() {
    const want = !!G && !glLost && QUALITY[R.quality].gl;
    glActive = want;
    R.hasGL = !!G && !glLost;
    R.distortion = glActive;
    if (!glActive) ensure2D();
    if (glCanvas) {
      glCanvas.hidden = !glActive;
      glCanvas.id = glActive ? 'screen' : 'screen-gl';
    }
    if (c2Canvas) {
      c2Canvas.hidden = glActive;
      c2Canvas.id = glActive ? 'screen-2d' : 'screen';
    }
  }

  // ------------------------------------------------------------------ frame
  const mergedFx = makeFx();
  function mergeFx() {
    const m = mergedFx;
    m.chroma = Math.max(fxU.chroma, fxD.chroma);
    const fu = fxU.flashA >= fxD.flashA ? fxU : fxD;
    m.flashA = fu.flashA;
    m.flashC[0] = fu.flashC[0]; m.flashC[1] = fu.flashC[1]; m.flashC[2] = fu.flashC[2];
    m.desat = Math.max(fxU.desat, fxD.desat);
    const v = Math.max(fxU.vig, fxD.vig);
    m.vig = v >= 0 ? v : 0.35;
    return m;
  }

  function reportDrawError(err) {
    const key = String(err && err.message);
    if (drawErrors.has(key) || drawErrors.size > 40) return;
    drawErrors.add(key);
    console.error('[SL.render] scene draw threw:', err);
  }

  function trackTiming(now) {
    const dt = lastFrame ? now - lastFrame : 16.7;
    lastFrame = now;
    if (dt > 0 && dt < 250) {
      R.frameMs += (dt - R.frameMs) * 0.05;
      R.fps = 1000 / Math.max(1, R.frameMs);
    }
    if (!autoStart) autoStart = now;
    const paused = SL.game && SL.game.paused;
    // one-off hitches (lazy sprite generation, GC) count at most 50 ms each, so a few long frames cannot trip the
    // 20 ms average on their own; a steadily slow machine still averages above it
    if (R.auto && dt > 0 && dt < 250 && !paused && document.visibilityState !== 'hidden') { autoAcc += Math.min(dt, 50); autoN++; }
    if (now - autoStart >= 3000) {
      if (R.auto && autoN >= 30) autoStep(autoAcc / autoN);
      autoAcc = 0; autoN = 0; autoStart = now;
    }
  }

  // Auto quality: above 20 ms average over 3 s, step down one level. Each step is checked over the next window: if it
  // bought no speed (>= 85% of the frame time before the first step), frames are paced by the browser or display (a
  // 30 Hz power-saving clock), not by our work, so the next level is tried, and if even Low gains nothing the starting
  // quality is restored and auto holds until frames are fast again (< 18 ms).
  let autoProbe = null, autoHold = false;
  function autoStep(avg) {
    if (autoHold) { if (avg < 18) autoHold = false; return; }
    const i = ORDER.indexOf(R.quality);
    if (autoProbe) {
      if (avg <= autoProbe.avg * 0.85) { autoProbe = null; } else if (i >= 0 && i < ORDER.length - 1) {
        console.warn('[SL.render] quality ' + R.quality + ' did not help (' + avg.toFixed(1) + ' ms); trying ' + ORDER[i + 1]);
        R.setQuality(ORDER[i + 1]);
        return;
      } else {
        console.warn('[SL.render] lower quality did not speed frames up (' + avg.toFixed(1) + ' ms): the frame clock is capped; back to ' + autoProbe.from);
        R.setQuality(autoProbe.from);
        autoProbe = null;
        autoHold = true;
        return;
      }
    }
    if (avg > 20 && i >= 0 && i < ORDER.length - 1) {
      console.warn('[SL.render] average frame time ' + avg.toFixed(1) + ' ms; quality ' + R.quality + ' -> ' + ORDER[i + 1]);
      autoProbe = { from: R.quality, avg };
      R.setQuality(ORDER[i + 1]);
    }
  }

  function frame() {
    if (!R.ctx) return;
    const now = performance.now();
    // frames rendered inside SL.debug.sim are not real frames: keep them out of fps and auto quality
    if (SL.debug && SL.debug.simulating) lastFrame = 0; else trackTiming(now);
    // a DPR-only change (window moved to another monitor) fires no resize event
    if (!dirty && Math.min(window.devicePixelRatio || 1, 2) !== R.dpr) dirty = true;
    if (dirty) measure();
    frameNo++;
    inUpdate = false;

    const ctx = R.ctx, q = R.q;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#03040a';
    ctx.fillRect(0, 0, R.scene.width, R.scene.height);
    const sh = SL.fx && SL.fx.shakeOffset ? SL.fx.shakeOffset() : null;
    const sx = sh ? sh.x : 0, sy = sh ? sh.y : 0;
    R.base.s = q;
    R.base.shakeX = sx;
    R.base.shakeY = sy;
    R.base.x = sx * q;
    R.base.y = sy * q;
    ctx.setTransform(q, 0, 0, q, R.base.x, R.base.y);
    try {
      if (SL.world && SL.world.draw) SL.world.draw(ctx);
    } catch (err) {
      reportDrawError(err);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const fx = mergeFx();
    let done = false;
    if (glActive && G) {
      try { done = compositeGL(fx); } catch (err) {
        console.warn('[SL.render] WebGL composite failed; switching to 2D.', err && err.message);
        G = null;
        chooseOutput();
      }
    }
    if (!done) { ensure2D(); if (!glActive) composite2D(fx); }

    if (hudCtx) {
      hudCtx.setTransform(1, 0, 0, 1, 0, 0);
      hudCtx.clearRect(0, 0, bw, bh);
      hudCtx.setTransform(bw / W, 0, 0, bh / H, 0, 0);
      hudCtx.globalAlpha = 1;
      hudCtx.globalCompositeOperation = 'source-over';
      try {
        if (SL.hud && typeof SL.hud.draw === 'function') SL.hud.draw(hudCtx);
      } catch (err) { reportDrawError(err); }
      hudCtx.setTransform(bw / W, 0, 0, bh / H, 0, 0);
      hudCtx.globalAlpha = 1;
      hudCtx.globalCompositeOperation = 'source-over';
      try {
        if (SL.debug && typeof SL.debug.drawOverlay === 'function') SL.debug.drawOverlay(hudCtx);
      } catch (err) { reportDrawError(err); }
    }

    if (ambCtx && frameNo % 4 === 0) {
      ambCtx.globalAlpha = 1;
      ambCtx.drawImage(R.scene, 0, 0, ambientEl.width, ambientEl.height);
    }
    clearFx(fxD);
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    appEl = document.getElementById('app');
    gameEl = document.getElementById('game');
    hudEl = document.getElementById('hud');
    ambientEl = document.getElementById('ambient');
    glCanvas = document.getElementById('screen');
    if (!gameEl) {
      gameEl = document.createElement('div');
      gameEl.id = 'game';
      document.body.appendChild(gameEl);
    }
    if (!glCanvas) {
      glCanvas = document.createElement('canvas');
      glCanvas.id = 'screen';
      gameEl.insertBefore(glCanvas, gameEl.firstChild);
    }
    glCanvas.classList.add('sl-screen-canvas');
    if (!hudEl) {
      hudEl = document.createElement('canvas');
      hudEl.id = 'hud';
      gameEl.appendChild(hudEl);
    }
    try { cqSupported = !!(window.CSS && CSS.supports && CSS.supports('width', '1cqw')); } catch (e) { cqSupported = false; }

    R.scene = document.createElement('canvas');
    R.ctx = R.scene.getContext('2d', { alpha: false });
    hudCtx = hudEl.getContext('2d');
    R.hud = hudCtx;
    if (ambientEl) {
      ambientEl.width = 36;
      ambientEl.height = 64;
      ambCtx = ambientEl.getContext('2d', { alpha: false });
      ambCtx.imageSmoothingQuality = 'high';
      ambCtx.fillStyle = '#04050b';
      ambCtx.fillRect(0, 0, 36, 64);
    }
    vigCanvas = makeVignette();

    const params = (SL.debug && SL.debug.params) || {};
    noGL = params.nogl === '1' || params.nogl === 'true';
    const setting = (SL.save && SL.save.settings && SL.save.settings.quality) || 'auto';
    const forced = QUALITY[params.quality] ? params.quality : null;
    R.qualitySetting = forced || setting;
    R.auto = !forced && setting === 'auto';
    R.quality = forced || (QUALITY[setting] ? setting : 'high');
    R.q = QUALITY[R.quality].q;

    measure();
    R.scene.width = Math.round(W * R.q);
    R.scene.height = Math.round(H * R.q);
    initGL();
    chooseOutput();
    if (SL.fx && SL.fx.setCap) SL.fx.setCap(QUALITY[R.quality].particles);

    glCanvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      glLost = true;
      console.warn('[SL.render] WebGL context lost; using 2D output until it is restored.');
      chooseOutput();
    }, false);
    glCanvas.addEventListener('webglcontextrestored', () => {
      glLost = false;
      G = null;
      const gl = getContext(glCanvas);
      if (gl) {
        try { G = buildGL(gl); sizeTargets(); } catch (err) { console.warn('[SL.render] WebGL restore failed.', err && err.message); G = null; }
      }
      chooseOutput();
    }, false);

    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => { dirty = true; });
      ro.observe(gameEl);
      if (appEl) ro.observe(appEl);
    }
    window.addEventListener('resize', () => { dirty = true; });
    window.addEventListener('orientationchange', () => { dirty = true; });
    SL.bus.on('settingsChanged', (e) => {
      if (!e || e.key !== 'quality' || QUALITY[params.quality]) return;
      R.qualitySetting = e.value;
      R.auto = e.value === 'auto';
      autoProbe = null;
      autoHold = false;
      R.setQuality(R.auto ? 'high' : e.value);
    });
  }

  SL.onBoot(boot);
})(window.SL = window.SL || {});
