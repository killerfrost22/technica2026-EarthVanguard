/* 05_art.js (core)
   Provides: SL.art = { define(key, w, h, drawFn(ctx, w, h), {pad, res}), get(key), has(key), prewarm(keys),
   drawSprite(ctx, key, x, y, rot, scale, alpha), getFlash(key), drawFlash(ctx, key, x, y, rot, scale, alpha),
   glow(color, radius, {core}), drawGlow(ctx, x, y, radius, color, alpha), ring(color, radius, width),
   metal(ctx, path, {base, light, dark, angle, rim, spec, specPos, edge, bounds}), panelLines(ctx, path, color, alpha),
   emissive(ctx, path, color, glow, {stroke}), flame(ctx, x, y, width, length, inner, outer, t),
   noise(w, h, {scale, octaves, seed, gain, lacunarity, ridged, warp}), noiseCanvas(w, h, {palette, alphaCurve, ...}),
   poly(points), symPath(cx, halfPoints), canvas(w, h), lightDir } and SL.pal (shared palette).
   Sprites are generated once (lazily on first get, or in prewarm) and cached; generators may use
   shadowBlur, filters and gradients freely. Per-frame helpers (drawSprite, drawGlow, flame) only blit
   cached canvases. */
(function (SL) {
  'use strict';

  const U = SL.util, C = SL.color;
  const TAU = Math.PI * 2;
  const gens = Object.create(null);
  const cache = new Map();
  const flashCache = new WeakMap();
  const glowCache = new Map();
  const flameCache = new Map();
  const ringCache = new Map();
  const canvasWraps = new WeakMap();

  SL.pal = {
    player: { hull: '#e8eef7', trim: '#3fc8ff', glow: '#7fe3ff', engine: '#9fe8ff' },
    player2: { hull: '#2b2f3a', trim: '#ffb53f', glow: '#ffd27a', engine: '#ffb070' },
    enemy: { hull: '#1c1f2b', hull2: '#3a3f55', seam: '#ff2f6d', glow: '#ff5c8a', engine: '#ff7a3d' },
    ebullet: { pink: '#ff4fd8', orange: '#ff8a3d', violet: '#b26bff', red: '#ff3b4f' },
    credit: '#ffd34d',
    rescue: '#5dffb0',
    space: { deep: '#03040a', navy: '#070b1c', violet: '#1a0f2e', teal: '#06222a' },
    ui: { cyan: '#3fc8ff', amber: '#ffb53f', magenta: '#ff2f6d', text: '#e8eef7', dim: '#93a0ba' },
  };

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function placeholder(key) {
    const s = 32;
    const c = makeCanvas(s, s);
    const x = c.getContext('2d');
    x.fillStyle = '#ff00ff';
    x.fillRect(0, 0, s, s);
    x.fillStyle = '#000';
    x.fillRect(0, 0, s / 2, s / 2);
    x.fillRect(s / 2, s / 2, s / 2, s / 2);
    return { key, canvas: c, w: s, h: s, pad: 0, res: 1, cw: s, ch: s, placeholder: true };
  }

  /** {canvas} (or a bare canvas wrapped by the caller) -> a full sprite record drawn at the canvas size. */
  function normalizeSprite(o) {
    const c = o.canvas;
    const w = o.w || c.width, h = o.h || c.height;
    return Object.assign(o, { key: o.key || null, w, h, pad: o.pad || 0, res: o.res || 1, cw: w + 2 * (o.pad || 0), ch: h + 2 * (o.pad || 0) });
  }

  function build(key, g) {
    const pad = g.pad, res = g.res;
    const cw = g.w + pad * 2, ch = g.h + pad * 2;
    const canvas = makeCanvas(cw * res, ch * res);
    const ctx = canvas.getContext('2d');
    ctx.scale(res, res);
    ctx.translate(pad, pad);
    try {
      g.fn(ctx, g.w, g.h);
    } catch (err) {
      console.error('[SL.art] sprite generator "' + key + '" threw:', err);
      return placeholder(key);
    }
    return { key, canvas, w: g.w, h: g.h, pad, res, cw, ch };
  }

  /** Inverse-transformed canvas rectangle in the current user space (default gradient bounds). */
  function localBounds(ctx) {
    let m;
    try { m = ctx.getTransform().inverse(); } catch (e) { m = null; }
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (!m) return { x: 0, y: 0, w: cw, h: ch };
    const pts = [[0, 0], [cw, 0], [0, ch], [cw, ch]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  }

  // ------------------------------------------------------------------ noise
  function gradTable(seed) {
    const rng = SL.makeRng(seed);
    const gx = new Float32Array(256), gy = new Float32Array(256), perm = new Uint8Array(512);
    for (let i = 0; i < 256; i++) {
      const a = rng.next() * TAU;
      gx[i] = Math.cos(a);
      gy[i] = Math.sin(a);
      perm[i] = i;
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    return { gx, gy, perm };
  }
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  /** Periodic 2D gradient noise in about [-0.7, 0.7]; periods px, py in lattice cells. */
  function pnoise(T, x, y, px, py) {
    const xf = Math.floor(x), yf = Math.floor(y);
    const fx = x - xf, fy = y - yf;
    const x0 = ((xf % px) + px) % px, y0 = ((yf % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const p = T.perm;
    const h00 = p[(p[x0 & 255] + y0) & 255], h10 = p[(p[x1 & 255] + y0) & 255];
    const h01 = p[(p[x0 & 255] + y1) & 255], h11 = p[(p[x1 & 255] + y1) & 255];
    const n00 = T.gx[h00] * fx + T.gy[h00] * fy;
    const n10 = T.gx[h10] * (fx - 1) + T.gy[h10] * fy;
    const n01 = T.gx[h01] * fx + T.gy[h01] * (fy - 1);
    const n11 = T.gx[h11] * (fx - 1) + T.gy[h11] * (fy - 1);
    const u = fade(fx), v = fade(fy);
    const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
    return a + (b - a) * v;
  }

  function noise(w, h, o) {
    o = o || {};
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    const scale = o.scale || 64;
    const octaves = U.clamp(o.octaves || 4, 1, 8);
    const gain = o.gain != null ? o.gain : 0.5;
    const lac = Math.max(1, Math.round(o.lacunarity || 2));
    const seed = o.seed != null ? o.seed : 1;
    const warp = o.warp || 0;
    const T = gradTable(seed), Tw = warp ? gradTable(seed + 7919) : null;
    const cx = Math.max(1, Math.round(w / scale)), cy = Math.max(1, Math.round(h / scale));
    const out = new Float32Array(w * h);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let u = i / w, v = j / h;
        if (warp) {
          const wx = pnoise(Tw, u * cx, v * cy, cx, cy) + 0.5 * pnoise(Tw, u * cx * 2 + 5.2, v * cy * 2 + 1.3, cx * 2, cy * 2);
          const wy = pnoise(Tw, u * cx + 9.7, v * cy + 3.1, cx, cy) + 0.5 * pnoise(Tw, u * cx * 2 + 2.8, v * cy * 2 + 7.4, cx * 2, cy * 2);
          u += wx * warp;
          v += wy * warp;
        }
        let sum = 0, amp = 1, fX = cx, fY = cy;
        for (let k = 0; k < octaves; k++) {
          let n = pnoise(T, u * fX, v * fY, fX, fY);
          if (o.ridged) { n = 1 - Math.abs(n * 1.4); n *= n; }
          sum += n * amp;
          amp *= gain;
          fX *= lac;
          fY *= lac;
        }
        out[j * w + i] = sum;
        if (sum < lo) lo = sum;
        if (sum > hi) hi = sum;
      }
    }
    const span = hi - lo || 1;
    for (let k = 0; k < out.length; k++) out[k] = (out[k] - lo) / span;
    return out;
  }

  function paletteLUT(palette, alphaCurve) {
    const stops = (palette && palette.length ? palette : [[0, '#000000'], [1, '#ffffff']])
      .map((s) => ({ t: s[0], c: C.parse(s[1]), a: s.length > 2 ? s[2] : C.parse(s[1])[3] }))
      .sort((a, b) => a.t - b.t);
    const lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let k = 0;
      while (k < stops.length - 1 && stops[k + 1].t < t) k++;
      const s0 = stops[k], s1 = stops[Math.min(k + 1, stops.length - 1)];
      const f = s1.t > s0.t ? U.clamp((t - s0.t) / (s1.t - s0.t), 0, 1) : 0;
      let a = s0.a + (s1.a - s0.a) * f;
      if (typeof alphaCurve === 'function') a *= U.clamp(+alphaCurve(t) || 0, 0, 1);
      else if (typeof alphaCurve === 'number') a *= Math.pow(t, alphaCurve);
      lut[i * 4] = s0.c[0] + (s1.c[0] - s0.c[0]) * f;
      lut[i * 4 + 1] = s0.c[1] + (s1.c[1] - s0.c[1]) * f;
      lut[i * 4 + 2] = s0.c[2] + (s1.c[2] - s0.c[2]) * f;
      lut[i * 4 + 3] = a * 255;
    }
    return lut;
  }

  // ------------------------------------------------------------------ public API
  const A = SL.art = {
    lightDir: { x: -0.6, y: -0.8 },

    define(key, w, h, fn, opts) {
      if (typeof fn !== 'function') { console.warn('[SL.art] define("' + key + '") needs a draw function'); return; }
      opts = opts || {};
      gens[key] = { w: Math.max(1, w), h: Math.max(1, h), fn, pad: opts.pad != null ? opts.pad : 2, res: opts.res || 1 };
      cache.delete(key);
    },

    has(key) { return !!gens[key] || cache.has(key); },

    get(key) {
      // a sprite object (from get, or built by hand as {canvas, cw, ch}) passes straight through; a bare canvas is
      // wrapped once (cached)
      if (key && typeof key === 'object') {
        if (key.canvas) return key.cw ? key : normalizeSprite(key);
        if (typeof key.getContext === 'function') {
          let wrap = canvasWraps.get(key);
          if (!wrap) { wrap = normalizeSprite({ canvas: key }); canvasWraps.set(key, wrap); }
          return wrap;
        }
      }
      let s = cache.get(key);
      if (s) return s;
      const g = gens[key];
      if (!g) {
        U.warnOnce('art:' + key, 'unknown sprite "' + key + '"; drawing a placeholder');
        s = placeholder(key);
      } else s = build(key, g);
      cache.set(key, s);
      return s;
    },

    prewarm(keys) { (keys || Object.keys(gens)).forEach((k) => A.get(k)); },

    drawSprite(ctx, key, x, y, rot, scale, alpha) {
      if (!key) return;
      const s = typeof key === 'string' || !key.cw ? A.get(key) : key;
      scale = scale == null ? 1 : scale;
      alpha = alpha == null ? 1 : alpha;
      if (alpha <= 0 || scale === 0) return;
      const w = s.cw * scale, h = s.ch * scale;
      const pa = ctx.globalAlpha;
      if (alpha !== 1) ctx.globalAlpha = pa * alpha;
      if (!rot) ctx.drawImage(s.canvas, x - w / 2, y - h / 2, w, h);
      else {
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.drawImage(s.canvas, -w / 2, -h / 2, w, h);
        ctx.rotate(-rot);
        ctx.translate(-x, -y);
      }
      if (alpha !== 1) ctx.globalAlpha = pa;
    },

    /** White silhouette of a sprite (cached), for hit flashes. */
    getFlash(key) {
      const s = typeof key === 'string' || !key.cw ? A.get(key) : key;
      let f = flashCache.get(s);
      if (f) return f;
      const c = makeCanvas(s.canvas.width, s.canvas.height);
      const x = c.getContext('2d');
      x.drawImage(s.canvas, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, c.width, c.height);
      f = { key: s.key, canvas: c, w: s.w, h: s.h, pad: s.pad, res: s.res, cw: s.cw, ch: s.ch, src: s };
      flashCache.set(s, f);
      return f;
    },

    drawFlash(ctx, key, x, y, rot, scale, alpha) {
      if (!(alpha > 0)) return;
      A.drawSprite(ctx, A.getFlash(key), x, y, rot, scale, Math.min(1, alpha));
    },

    /** Cached radial glow canvas (2r x 2r): white-hot core, color body, soft transparent edge. */
    glow(color, radius, opts) {
      const core = (opts && opts.core) || '#ffffff';
      const r = Math.max(2, Math.ceil(radius || 32));
      const key = color + '|' + r + '|' + core;
      let c = glowCache.get(key);
      if (c) return c;
      c = makeCanvas(r * 2, r * 2);
      const x = c.getContext('2d');
      const g = x.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, C.rgba(core, 1));
      g.addColorStop(0.1, C.rgba(C.mix(core, color, 0.45), 0.95));
      g.addColorStop(0.24, C.rgba(color, 0.72));
      g.addColorStop(0.44, C.rgba(color, 0.3));
      g.addColorStop(0.7, C.rgba(color, 0.09));
      g.addColorStop(1, C.rgba(color, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, r * 2, r * 2);
      if (glowCache.size > 600) glowCache.clear();
      glowCache.set(key, c);
      return c;
    },

    /** Additive blit of a cached glow (one 64 px master per color, scaled). */
    drawGlow(ctx, x, y, radius, color, alpha) {
      if (!(radius > 0)) return;
      alpha = alpha == null ? 1 : alpha;
      if (alpha <= 0) return;
      const c = A.glow(color, 64);
      const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pa * alpha;
      ctx.drawImage(c, x - radius, y - radius, radius * 2, radius * 2);
      ctx.globalAlpha = pa;
      ctx.globalCompositeOperation = po;
    },

    /** Cached glowing ring canvas (2r x 2r) with the given line width (px at that radius). */
    ring(color, radius, width) {
      const r = Math.max(4, Math.ceil(radius || 64));
      const lw = Math.max(1, width || r * 0.08);
      const key = color + '|' + r + '|' + lw;
      let c = ringCache.get(key);
      if (c) return c;
      c = makeCanvas(r * 2, r * 2);
      const x = c.getContext('2d');
      const inner = Math.max(0, r - lw * 3.2);
      const g = x.createRadialGradient(r, r, inner, r, r, r);
      const mid = U.clamp((r - lw * 1.6 - inner) / (r - inner), 0.05, 0.95);
      g.addColorStop(0, C.rgba(color, 0));
      g.addColorStop(mid * 0.7, C.rgba(color, 0.25));
      g.addColorStop(mid, C.rgba(C.mix(color, '#ffffff', 0.6), 1));
      g.addColorStop(Math.min(0.99, mid + (1 - mid) * 0.45), C.rgba(color, 0.45));
      g.addColorStop(1, C.rgba(color, 0));
      x.fillStyle = g;
      x.beginPath();
      x.arc(r, r, r, 0, TAU);
      x.fill();
      if (ringCache.size > 200) ringCache.clear();
      ringCache.set(key, c);
      return c;
    },

    /** Glossy metal fill lit from the upper left: gradient body, specular band, inner edge shading,
        rim light on lit edges and a dark outline. For sprite generators. */
    metal(ctx, path, o) {
      o = o || {};
      const base = o.base || '#9aa6bb';
      const light = o.light || C.lighten(base, 0.55);
      const dark = o.dark || C.darken(base, 0.62);
      const b = o.bounds || localBounds(ctx);
      const ang = o.angle != null ? o.angle : Math.atan2(A.lightDir.y, A.lightDir.x);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const ext = Math.max(b.w, b.h) * 0.55;
      const dx = Math.cos(ang) * ext, dy = Math.sin(ang) * ext;
      ctx.save();
      const g = ctx.createLinearGradient(cx + dx, cy + dy, cx - dx, cy - dy);
      g.addColorStop(0, light);
      g.addColorStop(0.36, base);
      g.addColorStop(0.7, C.mix(base, dark, 0.55));
      g.addColorStop(1, dark);
      ctx.fillStyle = g;
      ctx.fill(path);
      ctx.clip(path);
      const spec = o.spec != null ? o.spec : 0.55;
      if (spec > 0) {
        const p0 = o.specPos != null ? o.specPos : 0.3;
        const sg = ctx.createLinearGradient(cx + dx, cy + dy, cx - dx, cy - dy);
        const st = (t) => U.clamp(t, 0, 1);
        sg.addColorStop(st(p0 - 0.13), 'rgba(255,255,255,0)');
        sg.addColorStop(st(p0 - 0.025), 'rgba(255,255,255,' + spec + ')');
        sg.addColorStop(st(p0 + 0.02), 'rgba(255,255,255,' + spec * 0.42 + ')');
        sg.addColorStop(st(p0 + 0.15), 'rgba(255,255,255,0)');
        sg.addColorStop(st(p0 + 0.3), 'rgba(255,255,255,0)');
        sg.addColorStop(st(p0 + 0.36), 'rgba(255,255,255,' + spec * 0.16 + ')');
        sg.addColorStop(st(p0 + 0.42), 'rgba(255,255,255,0)');
        ctx.fillStyle = sg;
        ctx.fill(path);
      }
      ctx.lineJoin = 'round';
      const edge = o.edge != null ? o.edge : 2.6;
      if (edge > 0) {
        ctx.strokeStyle = C.rgba(dark, 0.6);
        ctx.lineWidth = edge * 2;
        ctx.stroke(path);
      }
      const rg = ctx.createLinearGradient(cx + dx, cy + dy, cx - dx * 0.2, cy - dy * 0.2);
      rg.addColorStop(0, C.rgba(C.mix(light, '#ffffff', 0.5), 0.95));
      rg.addColorStop(1, C.rgba(light, 0));
      ctx.strokeStyle = rg;
      ctx.lineWidth = o.rimLight != null ? o.rimLight : 2.4;
      ctx.stroke(path);
      ctx.restore();
      if (o.rim !== false) {
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = typeof o.rim === 'string' ? o.rim : C.rgba(C.darken(dark, 0.45), 0.92);
        ctx.lineWidth = o.rimWidth || 1.3;
        ctx.stroke(path);
        ctx.restore();
      }
    },

    /** Engraved panel seams: dark groove plus a faint lower-right highlight. */
    panelLines(ctx, path, color, alpha) {
      alpha = alpha == null ? 0.45 : alpha;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.rgba(color || '#000000', alpha);
      ctx.stroke(path);
      ctx.translate(0.8, 0.8);
      ctx.strokeStyle = C.rgba('#ffffff', alpha * 0.32);
      ctx.stroke(path);
      ctx.restore();
    },

    /** Glowing seams and lights (fill, or stroke with {stroke: width}). */
    emissive(ctx, path, color, glow, o) {
      glow = glow == null ? 8 : glow;
      const stroke = o && o.stroke;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
      if (stroke) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = stroke;
        ctx.stroke(path);
        ctx.stroke(path);
      } else {
        ctx.fillStyle = color;
        ctx.fill(path);
        ctx.fill(path);
      }
      ctx.shadowBlur = 0;
      const hot = C.rgba(C.mix(color, '#ffffff', 0.65), 0.7);
      if (stroke) {
        ctx.strokeStyle = hot;
        ctx.lineWidth = Math.max(0.6, stroke * 0.45);
        ctx.stroke(path);
      } else {
        ctx.fillStyle = hot;
        ctx.save();
        ctx.clip(path);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.85;
        ctx.fill(path);
        ctx.restore();
      }
      ctx.restore();
    },

    /** Animated engine plume pointing +y from (x, y), additive. Cheap: two cached blits. */
    flame(ctx, x, y, width, length, inner, outer, t) {
      if (!(length > 0) || !(width > 0)) return;
      inner = inner || '#ffffff';
      outer = outer || '#3fc8ff';
      const key = inner + '|' + outer;
      let spr = flameCache.get(key);
      if (!spr) {
        spr = makeFlame(inner, outer);
        if (flameCache.size > 64) flameCache.clear();
        flameCache.set(key, spr);
      }
      t = t || 0;
      const ph = x * 0.37 + y * 0.11;
      const flick = 0.84 + 0.09 * Math.sin(t * 47 + ph) + 0.07 * Math.sin(t * 29.3 + ph * 1.7);
      const L = length * flick;
      const wd = width * (0.93 + 0.07 * Math.sin(t * 61 + ph));
      const po = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(spr, x - wd / 2, y - wd * 0.3, wd, L + wd * 0.3);
      const gc = A.glow(outer, 64);
      const gr = wd * 1.05;
      ctx.drawImage(gc, x - gr, y - gr * 0.85, gr * 2, gr * 2);
      ctx.globalCompositeOperation = po;
    },

    noise,

    noiseCanvas(w, h, o) {
      o = o || {};
      w = Math.max(1, Math.floor(w));
      h = Math.max(1, Math.floor(h));
      const f = noise(w, h, o);
      const lut = paletteLUT(o.palette, o.alphaCurve);
      const c = makeCanvas(w, h);
      const x = c.getContext('2d');
      const img = x.createImageData(w, h);
      const d = img.data;
      for (let i = 0; i < f.length; i++) {
        const k = Math.min(255, Math.max(0, Math.round(f[i] * 255))) * 4;
        const j = i * 4;
        d[j] = lut[k];
        d[j + 1] = lut[k + 1];
        d[j + 2] = lut[k + 2];
        d[j + 3] = lut[k + 3];
      }
      x.putImageData(img, 0, 0);
      return c;
    },

    /** Path2D from a flat [x0, y0, x1, y1, ...] or [[x, y], ...] list (closed). */
    poly(points, open) {
      const p = new Path2D();
      const flat = Array.isArray(points[0]) ? points.flat() : points;
      for (let i = 0; i < flat.length; i += 2) {
        if (i === 0) p.moveTo(flat[0], flat[1]); else p.lineTo(flat[i], flat[i + 1]);
      }
      if (!open) p.closePath();
      return p;
    },

    /** Closed symmetric hull: halfPoints are [dx, y] pairs down the right side (dx >= 0 from cx). */
    symPath(cx, halfPoints) {
      const p = new Path2D();
      const pts = Array.isArray(halfPoints[0]) ? halfPoints : chunk(halfPoints);
      pts.forEach(([dx, y], i) => { if (i === 0) p.moveTo(cx + dx, y); else p.lineTo(cx + dx, y); });
      for (let i = pts.length - 1; i >= 0; i--) p.lineTo(cx - pts[i][0], pts[i][1]);
      p.closePath();
      return p;
    },

    canvas: makeCanvas,
    localBounds,
  };

  function chunk(flat) {
    const out = [];
    for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
    return out;
  }

  function makeFlame(inner, outer) {
    const w = 32, h = 128;
    const c = makeCanvas(w, h);
    const x = c.getContext('2d');
    x.globalCompositeOperation = 'lighter';
    const outerGlow = A.glow(outer, 32, { core: outer });
    const innerGlow = A.glow(inner, 32, { core: '#ffffff' });
    const n = 26;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const r = 15 * (1 - k * 0.82);
      const yy = 6 + k * (h - 26);
      x.globalAlpha = 0.34 * Math.pow(1 - k, 1.35);
      x.drawImage(outerGlow, w / 2 - r, yy - r, r * 2, r * 2);
    }
    for (let i = 0; i < 14; i++) {
      const k = i / 13;
      const r = 7.5 * (1 - k * 0.75);
      const yy = 5 + k * (h * 0.42);
      x.globalAlpha = 0.5 * Math.pow(1 - k, 1.6);
      x.drawImage(innerGlow, w / 2 - r, yy - r, r * 2, r * 2);
    }
    return c;
  }
})(window.SL = window.SL || {});
