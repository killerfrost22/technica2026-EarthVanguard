/* 15_backgrounds.js: the six mission backgrounds of GDD sections 4, 5 and 19 with every phase of the ID catalog:
   bg_vesta (launch belt shipyard storm boss sunrise menu), bg_kerr (approach lensing station boss calm lagrange),
   bg_tantalus (nebula storm eye boss clear boneyard), bg_tarsis (corona eclipse mirrors flare boss calm),
   bg_tartarus (rift binary throne boss finale foundry), bg_callisto (colony blizzard boss orbit).
   Each scene is layered parallax: sky gradient, star tiles with twinkle, painted fbm nebulae, per-pixel lit planets and
   stars (rendered once, cached), mid-layer set pieces from cached sprites, near dust and streaks. setPhase eases a
   table of per-scene "knobs" (snapped when the background was just created, so checkpoint replays land instantly);
   a few phases also run short scripts on the phase clock (launch, rift, finale, sunrise, eclipse, boss shadow).
   Big layers are pre-rendered once into a module cache (evicted per background) and scrolled with drawImage; no
   shadowBlur, filter or getImageData per frame. Public helpers: SL.scenery (docs/api/backgrounds.md).
   Sandboxes: bg:<id> (?phase=<name> holds a phase, otherwise the phases cycle; &cycle=<s>, &bullets=1). */
(function (SL) {
  'use strict';
  const U = SL.util, C = SL.color, A = SL.art;
  const W = SL.W, H = SL.H, TAU = Math.PI * 2, PI = Math.PI;
  const PAD = 32; // overdraw so screen shake never shows an edge
  const clamp = U.clamp, lerp = U.lerp;
  const gauss = (q) => Math.exp(-q * q);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const LV = (() => { const v = [-0.5, -0.62, 0.6], m = Math.hypot(v[0], v[1], v[2]); return [v[0] / m, v[1] / m, v[2] / m]; })();

  // ------------------------------------------------------------------ module canvas store (evicted per background)
  const store = new Map();
  function memo(key, make) {
    let v = store.get(key);
    if (v === undefined) {
      v = make();
      store.set(key, v);
    }
    return v;
  }
  function evict(keep) {
    for (const k of Array.from(store.keys())) {
      const g = k.slice(0, k.indexOf(':'));
      if (keep.indexOf(g) < 0) store.delete(k);
    }
  }
  const cnv = (w, h) => A.canvas(w, h);
  const rgb = (hex) => { const p = C.parse(hex); return [p[0], p[1], p[2]]; };

  // ------------------------------------------------------------------ camera (zoom punch / offset) over the scene base
  const cam = { z: 1, x: 0, y: 0 };
  function camBase(ctx) {
    const b = SL.render.base, s = b.s * cam.z;
    ctx.setTransform(s, 0, 0, s, b.x + ((1 - cam.z) * W / 2 + cam.x) * b.s, b.y + ((1 - cam.z) * H / 2 + cam.y) * b.s);
  }
  /** translate (x, y) x rotate x scale, composed with the scene base and the camera */
  function xf(ctx, x, y, rot, sx, sy) {
    const b = SL.render.base, s = b.s * cam.z;
    const X = b.x + ((x - W / 2) * cam.z + W / 2 + cam.x) * b.s, Y = b.y + ((y - H / 2) * cam.z + H / 2 + cam.y) * b.s;
    if (rot) {
      const c = Math.cos(rot), n = Math.sin(rot);
      ctx.setTransform(c * sx * s, n * sx * s, -n * sy * s, c * sy * s, X, Y);
    } else ctx.setTransform(sx * s, 0, 0, sy * s, X, Y);
  }
  /** general 2x2 matrix [a c; b d] at (x, y) */
  function xfm(ctx, x, y, a, b2, c2, d2) {
    const b = SL.render.base, s = b.s * cam.z;
    const X = b.x + ((x - W / 2) * cam.z + W / 2 + cam.x) * b.s, Y = b.y + ((y - H / 2) * cam.z + H / 2 + cam.y) * b.s;
    ctx.setTransform(a * s, b2 * s, c2 * s, d2 * s, X, Y);
  }
  /** draws canvas c centered at (x, y) with rotation and scale; w,h = logical size (defaults to the canvas size) */
  function blit(ctx, c, x, y, rot, sc, a, w, h) {
    if (a <= 0.003 || !c) return;
    w = w || c.width;
    h = h || c.height;
    ctx.globalAlpha = a > 1 ? 1 : a;
    xf(ctx, x, y, rot || 0, sc, sc);
    ctx.drawImage(c, -w / 2, -h / 2, w, h);
  }

  // ------------------------------------------------------------------ knobs and phases
  function knobs(d, spec) {
    d.k = {};
    d.kt = {};
    d.kr = {};
    for (const n in spec) { d.k[n] = d.kt[n] = spec[n][0]; d.kr[n] = spec[n][1]; }
  }
  function easeKnobs(d, dt) {
    const k = d.k, kt = d.kt, kr = d.kr;
    for (const n in kt) {
      const t = kt[n], v = k[n];
      if (v === t) continue;
      const nv = v + (t - v) * (1 - Math.exp(-kr[n] * dt));
      k[n] = Math.abs(t - nv) < 1e-4 ? t : nv;
    }
  }
  function applyPhase(d, P, name, snap) {
    const base = P._base, ph = P[name] || {};
    for (const n in d.kt) {
      if (n in ph) d.kt[n] = ph[n];
      else if (n in base) d.kt[n] = base[n];
      if (snap) d.k[n] = d.kt[n];
    }
  }

  const defs = Object.create(null);
  let dbgZoom = null; // sandbox inspection zoom (?zoom=&zx=&zy=), background only
  function defineBg(id, S) {
    S.id = id;
    defs[id] = S;
    SL.backgrounds.define(id, {
      phases: S.list.slice(),
      init(bg, opts) {
        opts = opts || {};
        evict(['common', 'vesta', S.group]);
        const d = bg.data;
        d.S = S;
        d.rng = SL.makeRng(opts.seed || S.seed || 7);
        d.t = 0;
        d.pt = 0;
        d.sp = 0;
        d.sy = 0;
        d.ph = null;
        knobs(d, S.knobs);
        S.init(bg, d, opts);
        enter(bg, resolve(S, bg.phase) || S.defaultPhase, true);
      },
      update(bg, dt, scroll) {
        const d = bg.data;
        if (!d.S) return;
        const sp = scroll && isFinite(scroll.speed) ? scroll.speed : 90;
        d.sp = sp;
        d.sy += sp * dt;
        d.t += dt;
        d.pt += dt;
        easeKnobs(d, dt);
        S.update(bg, d, dt);
      },
      draw(bg, ctx) {
        const d = bg.data;
        if (!d.S) return;
        const Z = dbgZoom;
        cam.z = Z ? Z.z : 1;
        cam.x = Z ? -(Z.x - W / 2) * Z.z : 0;
        cam.y = Z ? -(Z.y - H / 2) * Z.z : 0;
        S.draw(bg, d, ctx);
        cam.z = 1;
        cam.x = 0;
        cam.y = 0;
      },
      setPhase(bg, name) {
        const ph = resolve(S, name);
        if (!ph) { bg.phase = bg.data.ph; return; }
        enter(bg, ph, bg.t < 0.25);
      },
    });
  }
  function resolve(S, name) {
    if (!name || name === 'default') return S.defaultPhase;
    if (S.list.indexOf(name) >= 0) return name;
    if (S.alias && S.alias[name]) return S.alias[name];
    U.warnOnce('bgphase:' + S.id + ':' + name, 'background "' + S.id + '": unknown phase "' + name + '" ignored');
    return null;
  }
  function enter(bg, ph, snap) {
    const d = bg.data, S = d.S, prev = d.ph;
    d.ph = ph;
    bg.phase = ph;
    d.pt = 0;
    d.snapped = !!snap;
    applyPhase(d, S.phases, ph, snap);
    if (S.phase) S.phase(bg, d, ph, prev, snap);
  }

  // ------------------------------------------------------------------ painting helpers (one-time generation)
  function skyCanvas(stops) {
    const c = cnv(2, 256), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    for (const s of stops) g.addColorStop(s[0], s[1]);
    x.fillStyle = g;
    x.fillRect(0, 0, 2, 256);
    return c;
  }
  function drawSky(ctx, c) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(c, -PAD, -PAD, W + PAD * 2, H + PAD * 2);
  }
  const TILE_W = W + PAD * 2;
  /** star tile TILE_W x h: o {n, seed, h, size:[a,b], alpha:[a,b], colors, pow, glow (fraction with halo)} */
  function starTile(o) {
    const w = TILE_W, h = o.h || 640, c = cnv(w, h), x = c.getContext('2d'), r = SL.makeRng(o.seed || 1);
    const cols = o.colors || ['#ffffff'];
    for (let i = 0; i < o.n; i++) {
      const sx = r.next() * w, sy = r.next() * h;
      const k = Math.pow(r.next(), o.pow || 2.4);
      const rad = lerp(o.size[0], o.size[1], k);
      const a = lerp(o.alpha[0], o.alpha[1], r.next()) * (0.6 + 0.4 * k);
      const col = cols[r.int(0, cols.length - 1)];
      for (let wy = -1; wy <= 1; wy++) {
        const yy = sy + wy * h;
        if (yy < -12 || yy > h + 12) continue;
        if (k > 0.55 && r.next() < (o.glow != null ? o.glow : 0.5)) {
          x.globalAlpha = a * 0.35;
          const g = A.glow(col, 16, { core: col });
          const gr = rad * 5;
          x.drawImage(g, sx - gr, yy - gr, gr * 2, gr * 2);
        }
        x.globalAlpha = a;
        x.fillStyle = col;
        x.beginPath();
        x.arc(sx, yy, rad, 0, TAU);
        x.fill();
      }
    }
    x.globalAlpha = 1;
    return c;
  }
  /** draws a tile repeated vertically; content moves down as off grows */
  function tileY(ctx, c, off, x0, w, a) {
    if (!(a > 0.003)) return;
    const th = c.height * (w / c.width);
    let y = off % th;
    if (y < 0) y += th;
    while (y > -PAD) y -= th;
    ctx.globalAlpha = a > 1 ? 1 : a;
    for (; y < H + PAD; y += th) ctx.drawImage(c, x0, y, w, th);
  }
  /** tile repeated in both axes, scaled by sc; (ox, oy) offsets in screen px */
  function tileXY(ctx, c, ox, oy, sc, a) {
    if (!(a > 0.003)) return;
    const tw = c.width * sc, th = c.height * sc;
    let x0 = ox % tw;
    if (x0 < 0) x0 += tw;
    while (x0 > -PAD) x0 -= tw;
    let y0 = oy % th;
    if (y0 < 0) y0 += th;
    while (y0 > -PAD) y0 -= th;
    ctx.globalAlpha = a > 1 ? 1 : a;
    for (let y = y0; y < H + PAD; y += th) for (let x = x0; x < W + PAD; x += tw) ctx.drawImage(c, x, y, tw, th);
  }
  /** composite of several tileable noise canvases (same w, h): layers [{op, alpha, ...noiseCanvas opts}] */
  function paintNoise(w, h, layers) {
    const c = cnv(w, h), x = c.getContext('2d');
    for (const L of layers) {
      const n = A.noiseCanvas(w, h, L);
      x.globalCompositeOperation = L.op || 'source-over';
      x.globalAlpha = L.alpha != null ? L.alpha : 1;
      x.drawImage(n, 0, 0);
    }
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    return c;
  }
  /** bilinear sample of a w x h Float32 field, u wraps, v clamps (u, v in 0..1) */
  function samp(f, w, h, u, v) {
    let fx = u * w - 0.5, fy = v * h - 0.5;
    if (fy < 0) fy = 0; else if (fy > h - 1) fy = h - 1;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const xa = ((x0 % w) + w) % w, xb = (xa + 1) % w, yb = y0 + 1 < h ? y0 + 1 : y0;
    const a = f[y0 * w + xa], b = f[y0 * w + xb], c = f[yb * w + xa], e = f[yb * w + xb];
    return (a + (b - a) * tx) + ((c + (e - c) * tx) - (a + (b - a) * tx)) * ty;
  }
  /** 256-entry RGB LUT from [[t, hex], ...] */
  function lut(stops) {
    const L = new Float32Array(256 * 3), S = stops.map((s) => [s[0], rgb(s[1])]);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let k = 0;
      while (k < S.length - 2 && S[k + 1][0] < t) k++;
      const a = S[k], b = S[Math.min(k + 1, S.length - 1)];
      const f = b[0] > a[0] ? clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 0;
      for (let j = 0; j < 3; j++) L[i * 3 + j] = a[1][j] + (b[1][j] - a[1][j]) * f;
    }
    return L;
  }
  function lutAt(L, t, out) {
    const i = (t <= 0 ? 0 : t >= 1 ? 255 : (t * 255) | 0) * 3;
    out[0] = L[i];
    out[1] = L[i + 1];
    out[2] = L[i + 2];
  }

  /** Per-pixel lit sphere, rendered once. o: {r, res, halo, light, tilt, spin, surf(u, v, out) -> height, bump,
      amb, ambC [r,g,b], wrap, gamma, limb, atmo {c, pow, str, bias, halo, haloPow}, flat (emissive, no lighting)} */
  function sphere(o) {
    const res = o.res || 1, r = o.r * res, halo = (o.halo || 0) * res;
    const S = Math.ceil(2 * (r + halo)) + 2, cx = S / 2;
    const c = cnv(S, S), x = c.getContext('2d'), img = x.createImageData(S, S), D = img.data;
    const hb = new Float32Array(S * S), inside = new Uint8Array(S * S);
    const L = o.light || LV, ct = Math.cos(o.tilt || 0), st = Math.sin(o.tilt || 0), spin = o.spin || 0;
    const out = [0, 0, 0], surf = o.surf;
    for (let j = 0; j < S; j++) {
      const dy = (j + 0.5 - cx) / r;
      for (let i = 0; i < S; i++) {
        const dx = (i + 0.5 - cx) / r, d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        const nz = Math.sqrt(1 - d2);
        const tx = dx * ct - dy * st, ty = dx * st + dy * ct;
        let u = (Math.atan2(tx, nz) + spin) / TAU + 0.5;
        u -= Math.floor(u);
        const v = Math.asin(ty < -1 ? -1 : ty > 1 ? 1 : ty) / PI + 0.5;
        const k = j * S + i;
        hb[k] = surf(u, v, out, dx, dy, nz);
        inside[k] = 1;
        D[k * 4] = out[0];
        D[k * 4 + 1] = out[1];
        D[k * 4 + 2] = out[2];
      }
    }
    const bump = (o.bump || 0) * res, amb = o.amb != null ? o.amb : 0.05, wrap = o.wrap || 0, gam = o.gamma || 1;
    const limb = o.limb || 0, ac = o.ambC || [0, 0, 0], at = o.atmo, flat = !!o.flat;
    const lxy = Math.hypot(L[0], L[1]) || 1;
    for (let j = 0; j < S; j++) {
      const dy = (j + 0.5 - cx) / r;
      for (let i = 0; i < S; i++) {
        const dx = (i + 0.5 - cx) / r, d2 = dx * dx + dy * dy, k = j * S + i, p = k * 4;
        const d = Math.sqrt(d2);
        const facing = d > 0 ? (dx * L[0] + dy * L[1]) / (d * lxy) : 0;
        if (inside[k]) {
          const nz0 = Math.sqrt(1 - d2);
          let R0 = D[p], G0 = D[p + 1], B0 = D[p + 2];
          if (!flat) {
            let nx = dx, ny = dy, nz = nz0;
            if (bump) {
              const h0 = hb[k];
              const hl = i > 0 && inside[k - 1] ? hb[k - 1] : h0, hr = i < S - 1 && inside[k + 1] ? hb[k + 1] : h0;
              const hu = j > 0 && inside[k - S] ? hb[k - S] : h0, hd = j < S - 1 && inside[k + S] ? hb[k + S] : h0;
              nx += (hl - hr) * bump * nz0;
              ny += (hu - hd) * bump * nz0;
              const m = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
              nx *= m;
              ny *= m;
              nz *= m;
            }
            const dif = nx * L[0] + ny * L[1] + nz * L[2];
            let lam = (dif + wrap) / (1 + wrap);
            lam = lam > 0 ? (gam === 1 ? lam : Math.pow(lam, gam)) : 0;
            const sh = (amb + (1 - amb) * lam) * (1 - limb * (1 - nz0));
            R0 = R0 * sh + ac[0];
            G0 = G0 * sh + ac[1];
            B0 = B0 * sh + ac[2];
          } else {
            const ld = 1 - limb * (1 - Math.pow(nz0, 0.6));
            R0 *= ld;
            G0 *= ld;
            B0 *= ld;
          }
          if (at && at.str) {
            const f = Math.pow(1 - nz0, at.pow || 3) * clamp(facing * 0.5 + 0.5 + (at.bias || 0), 0, 1) * at.str;
            R0 += at.c[0] * f;
            G0 += at.c[1] * f;
            B0 += at.c[2] * f;
          }
          D[p] = R0;
          D[p + 1] = G0;
          D[p + 2] = B0;
          D[p + 3] = 255 * clamp((1 - d) * r + 0.5, 0, 1);
        } else if (at && at.halo && d < 1 + halo / r) {
          const t = (d - 1) / (halo / r);
          const a = at.halo * Math.pow(1 - t, at.haloPow || 2.4) * clamp(facing * 0.5 + 0.5 + (at.bias || 0), 0, 1);
          D[p] = at.c[0];
          D[p + 1] = at.c[1];
          D[p + 2] = at.c[2];
          D[p + 3] = 255 * clamp(a, 0, 1);
        }
      }
    }
    x.putImageData(img, 0, 0);
    c.res = res;
    return c;
  }
  function drawSphere(ctx, c, x, y, a) {
    if (!(a > 0.003)) return;
    const s = c.width / c.res;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(c, x - s / 2, y - s / 2, s, s);
  }

  /** Heightfield relief shading for flat sprites: hb heights (px), ab alpha 0..1, col(i, j, k, out) albedo;
      o {bump, amb, wrap, light, rim [r,g,b], rimStr, rimPow, spec} */
  function relief(w, h, hb, ab, col, o) {
    o = o || {};
    const c = cnv(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), D = img.data;
    const L = o.light || LV, bump = o.bump || 1, amb = o.amb != null ? o.amb : 0.12, wrap = o.wrap || 0;
    const rim = o.rim, rimStr = o.rimStr || 0, rimPow = o.rimPow || 2, spec = o.spec || 0;
    const out = [0, 0, 0];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i, a = ab[k];
        if (a <= 0.004) continue;
        const h0 = hb[k];
        const hl = i > 0 ? hb[k - 1] : h0, hr = i < w - 1 ? hb[k + 1] : h0;
        const hu = j > 0 ? hb[k - w] : h0, hd = j < h - 1 ? hb[k + w] : h0;
        let nx = (hl - hr) * 0.5 * bump, ny = (hu - hd) * 0.5 * bump, nz = 1;
        const m = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        nx *= m;
        ny *= m;
        nz *= m;
        const dif = nx * L[0] + ny * L[1] + nz * L[2];
        const lam = Math.max(0, (dif + wrap) / (1 + wrap));
        col(i, j, k, out);
        const sh = amb + (1 - amb) * lam;
        let R0 = out[0] * sh, G0 = out[1] * sh, B0 = out[2] * sh;
        if (spec) {
          const hz = dif * 2 * nz - L[2];
          if (hz > 0) { const s = Math.pow(hz, 18) * spec * 255; R0 += s; G0 += s; B0 += s; }
        }
        if (rim && rimStr) {
          const f = Math.pow(1 - nz, rimPow) * rimStr;
          R0 += rim[0] * f;
          G0 += rim[1] * f;
          B0 += rim[2] * f;
        }
        const p = k * 4;
        D[p] = R0;
        D[p + 1] = G0;
        D[p + 2] = B0;
        D[p + 3] = a * 255;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  /** dark outline plus an upper-left rim highlight on an existing path (no fill) */
  function rimStroke(x, path, b, hi) {
    x.save();
    x.lineJoin = 'round';
    x.strokeStyle = 'rgba(4,5,9,0.9)';
    x.lineWidth = 2.2;
    x.stroke(path);
    const g = x.createLinearGradient(b.x, b.y, b.x + b.w * 0.6, b.y + b.h * 0.6);
    g.addColorStop(0, hi || 'rgba(150,170,200,0.55)');
    g.addColorStop(1, 'rgba(150,170,200,0)');
    x.strokeStyle = g;
    x.lineWidth = 1.4;
    x.stroke(path);
    x.restore();
  }
  /** soft glow canvas without the white core (for background lights that must never read as bullets) */
  const softGlow = (color, r) => A.glow(color, r || 32, { core: color });
  /** blurred silhouette of a path (one-time, shadowBlur trick) */
  function blurredShape(w, h, blur, color, drawPath) {
    const c = cnv(w, h), x = c.getContext('2d');
    x.shadowColor = color;
    x.shadowBlur = blur;
    x.shadowOffsetX = w + 200;
    x.translate(-w - 200, 0);
    x.fillStyle = '#000';
    drawPath(x);
    x.fill();
    return c;
  }

  // ------------------------------------------------------------------ small live systems (no allocation per frame)
  function twinkles(rng, n, o) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const col = o.colors[rng.int(0, o.colors.length - 1)];
      out.push({
        x: rng.range(-8, W + 8), y: rng.range(-8, H + 8), r: rng.range(o.size[0], o.size[1]), a: rng.range(o.alpha[0], o.alpha[1]),
        f: rng.range(0.7, 2.6), ph: rng.next() * TAU, par: o.par[rng.int(0, o.par.length - 1)], g: A.glow(col, 16),
      });
    }
    return out;
  }
  function twinkleStep(arr, dy, rng) {
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      s.y += dy * s.par;
      if (s.y > H + 10) { s.y -= H + 20; s.x = rng.range(-8, W + 8); }
    }
  }
  function twinkleDraw(ctx, arr, t, mul) {
    if (mul <= 0.01) return;
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      const tw = 0.5 + 0.5 * Math.sin(t * s.f + s.ph);
      const a = s.a * mul * (0.35 + 0.65 * tw * tw);
      if (a < 0.01) continue;
      ctx.globalAlpha = a > 1 ? 1 : a;
      const rr = s.r * (0.85 + 0.3 * tw);
      ctx.drawImage(s.g, s.x - rr, s.y - rr, rr * 2, rr * 2);
    }
  }
  function dustMake(rng, n, par) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ x: rng.range(0, W), y: rng.range(-200, H), l: rng.range(0.5, 1.4), a: rng.range(0.5, 1), par: par * rng.range(0.8, 1.25) });
    return out;
  }
  function dustStep(arr, dy, rng) {
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      s.y += dy * s.par;
      if (s.y > H + 260) { s.y = -rng.range(60, 400); s.x = rng.range(0, W); }
    }
  }
  function dustDraw(ctx, arr, sp, color, alpha, wd) {
    if (alpha <= 0.003) return;
    ctx.fillStyle = color;
    const len = 14 + sp * 0.2;
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      ctx.globalAlpha = Math.min(1, s.a * alpha);
      ctx.fillRect(s.x, s.y - len * s.l, wd || 1.2, len * s.l);
    }
  }
  /** drifting set pieces: L {items, acc, on, gap:[a,b], margin, max, make(rng, d, L) -> item {c, x, y, r, par, vx, vy, vr, rot, s, a}} */
  function layer(o) { return Object.assign({ items: [], acc: 0, on: 0, gap: [200, 400], margin: 40, max: 30 }, o); }
  function layerStep(L, d, dt, on) {
    const dy = d.sp * dt, its = L.items;
    let j = 0;
    for (let i = 0; i < its.length; i++) {
      const it = its[i];
      it.y += dy * it.par + (it.vy || 0) * dt;
      it.x += (it.vx || 0) * dt;
      it.rot += (it.vr || 0) * dt;
      it.age = (it.age || 0) + dt;
      if (it.dead || it.y - it.r > H + L.margin || it.x < -it.r - 400 || it.x > W + it.r + 400) continue;
      its[j++] = it;
    }
    its.length = j;
    if (on > 0.02) {
      L.acc -= dy * (L.par || 0.5);
      if (L.acc <= 0 && its.length < L.max) {
        const it = L.make(d.rng, d, L);
        if (it) {
          it.y = -it.r - L.margin * 0.5;
          its.push(it);
        }
        L.acc = d.rng.range(L.gap[0], L.gap[1]) / Math.max(0.15, on);
      }
    } else if (L.acc < 0) L.acc = 0;
  }
  function layerFill(L, d, on) {
    L.items.length = 0;
    if (on <= 0.02) return;
    let y = H + L.margin;
    while (y > -L.margin && L.items.length < L.max) {
      const it = L.make(d.rng, d, L);
      if (it) { it.y = y; L.items.push(it); }
      y -= d.rng.range(L.gap[0], L.gap[1]) / Math.max(0.15, on);
    }
    L.acc = d.rng.range(L.gap[0], L.gap[1]) * 0.5;
  }
  function layerDraw(ctx, L, alpha) {
    const its = L.items;
    for (let i = 0; i < its.length; i++) {
      const it = its[i];
      const a = (it.a == null ? 1 : it.a) * alpha;
      if (a <= 0.003) continue;
      if (it.draw) { it.draw(ctx, it, a); continue; }
      blit(ctx, it.c, it.x, it.y, it.rot, it.s || 1, a, it.w, it.h);
    }
    camBase(ctx);
  }
  /** blinking light list on an item: lights [{x, y, f, ph, r}] in item space (unrotated, unscaled) */
  function drawLights(ctx, it, lights, t, glowC, alpha, maxA) {
    const cs = Math.cos(it.rot || 0), sn = Math.sin(it.rot || 0), s = it.s || 1;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      const p = 0.5 + 0.5 * Math.sin(t * L.f * TAU + L.ph);
      const a = alpha * maxA * (0.18 + 0.82 * p * p * p);
      if (a < 0.01) continue;
      const lx = it.x + (L.x * cs - L.y * sn) * s, ly = it.y + (L.x * sn + L.y * cs) * s;
      const rr = (L.r || 6) * s * (0.8 + 0.3 * p);
      ctx.globalAlpha = a > 1 ? 1 : a;
      ctx.drawImage(glowC, lx - rr, ly - rr, rr * 2, rr * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function darken(ctx, a, color) {
    if (a <= 0.003) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.fillStyle = color || '#000000';
    ctx.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
  }

  // ------------------------------------------------------------------ shared art: metal members, trusses, rocks
  function member(x, ax, ay, bx, by, wd, base) {
    x.lineCap = 'round';
    x.strokeStyle = C.darken(base, 0.45);
    x.lineWidth = wd + 1.4;
    x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
    x.strokeStyle = base;
    x.lineWidth = wd;
    x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
    x.strokeStyle = C.rgba(C.lighten(base, 0.5), 0.5);
    x.lineWidth = Math.max(0.7, wd * 0.28);
    x.beginPath(); x.moveTo(ax - 0.5, ay - 0.5); x.lineTo(bx - 0.5, by - 0.5); x.stroke();
  }
  function railV(x, x0, y0, wd, h, base, hi) {
    const g = x.createLinearGradient(x0, 0, x0 + wd, 0);
    g.addColorStop(0, hi || C.lighten(base, 0.42));
    g.addColorStop(0.3, base);
    g.addColorStop(1, C.darken(base, 0.55));
    x.fillStyle = g;
    x.fillRect(x0, y0, wd, h);
    x.fillStyle = 'rgba(255,255,255,0.07)';
    x.fillRect(x0 + wd * 0.2, y0, 1, h);
    x.fillStyle = C.rgba(C.darken(base, 0.6), 0.7);
    for (let y = y0 + 16; y < y0 + h; y += 32) x.fillRect(x0, y, wd, 1.5);
  }
  /** vertical Warren truss in [x0, x0 + w] x [y0, y0 + h]; returns node points */
  function trussV(x, x0, y0, w, h, bay, base, o) {
    o = o || {};
    const cw = o.cw || 8, dw = o.dw || 3, nodes = [];
    for (let y = y0, i = 0; y < y0 + h - 1; y += bay, i++) {
      const xa = i % 2 ? x0 + cw / 2 : x0 + w - cw / 2, xb = i % 2 ? x0 + w - cw / 2 : x0 + cw / 2;
      member(x, xa, y, xb, Math.min(y0 + h, y + bay), dw, base);
      member(x, x0 + cw / 2, y, x0 + w - cw / 2, y, dw * 0.8, base);
      nodes.push([x0, y], [x0 + w, y]);
    }
    railV(x, x0, y0, cw, h, base, o.hi);
    railV(x, x0 + w - cw, y0, cw, h, base, o.hi);
    x.fillStyle = C.darken(base, 0.25);
    for (const n of nodes) x.fillRect(n[0] - (n[0] > x0 ? cw : 0) - 1, n[1] - 3, cw + 2, 6);
    return nodes;
  }
  /** irregular lit rock sprite (relief shaded); pal {lo, hi} albedo, rim color */
  function rockSprite(seed, size, pal) {
    const r = SL.makeRng(seed), S = Math.ceil(size * 1.3), w = S, h = S, cx = S / 2;
    const hb = new Float32Array(w * h), ab = new Float32Array(w * h);
    const nz = A.noise(64, 64, { scale: 14, octaves: 4, seed: seed + 3 });
    const nH = 6, amp = [], ph = [];
    for (let i = 0; i < nH; i++) { amp.push(r.range(0.03, 0.16) / (1 + i * 0.6)); ph.push(r.next() * TAU); }
    const el = r.range(0.7, 1), rot = r.next() * TAU, cr = Math.cos(rot), sr = Math.sin(rot), R0 = size * 0.46;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let dx = i + 0.5 - cx, dy = j + 0.5 - cx;
      const ux = dx * cr - dy * sr, uy = (dx * sr + dy * cr) / el;
      const ang = Math.atan2(uy, ux), dist = Math.hypot(ux, uy);
      let rad = 1;
      for (let q = 0; q < nH; q++) rad += amp[q] * Math.sin((q + 2) * ang + ph[q]);
      const n = samp(nz, 64, 64, i / w, j / h);
      rad *= R0 * (0.94 + 0.12 * n);
      const qd = dist / rad;
      if (qd >= 1.02) continue;
      const k = j * w + i;
      ab[k] = clamp((1 - qd) * rad * 0.9 + 0.5, 0, 1);
      hb[k] = Math.sqrt(Math.max(0, 1 - qd * qd)) * rad * 0.55 + n * size * 0.05;
    }
    // a few craters
    for (let q = 0; q < 5; q++) {
      const ccx = cx + r.range(-0.25, 0.25) * size, ccy = cx + r.range(-0.25, 0.25) * size, cr2 = r.range(0.06, 0.15) * size;
      for (let j = Math.max(0, (ccy - cr2 * 1.5) | 0); j < Math.min(h, ccy + cr2 * 1.5); j++) {
        for (let i = Math.max(0, (ccx - cr2 * 1.5) | 0); i < Math.min(w, ccx + cr2 * 1.5); i++) {
          const qq = Math.hypot(i - ccx, j - ccy) / cr2, k = j * w + i;
          if (!ab[k]) continue;
          hb[k] += qq < 1 ? (qq * qq - 1) * cr2 * 0.35 : gauss((qq - 1) / 0.25) * cr2 * 0.12;
        }
      }
    }
    const lo = rgb(pal.lo), hi = rgb(pal.hi);
    return relief(w, h, hb, ab, (i, j, k, out) => {
      const t = samp(nz, 64, 64, i / w, j / h);
      out[0] = lo[0] + (hi[0] - lo[0]) * t;
      out[1] = lo[1] + (hi[1] - lo[1]) * t;
      out[2] = lo[2] + (hi[2] - lo[2]) * t;
    }, { bump: pal.bump || 1.1, amb: pal.amb || 0.22, wrap: 0.1, rim: pal.rim ? rgb(pal.rim) : null, rimStr: pal.rimStr || 0.4, rimPow: 3 });
  }

  // ==================================================================================================================
  // bg_vesta: Vesta Shipyards, asteroid belt (m1, menu)
  // ==================================================================================================================
  const VESTA_TW = 1024, VESTA_TH = 512;
  function vestaPlanet() {
    return memo('vesta:planet', () => {
      const TW = VESTA_TW, TH = VESTA_TH;
      const n1 = A.noise(TW, TH, { scale: 96, octaves: 6, seed: 41, gain: 0.52, warp: 0.15 });
      const n2 = A.noise(TW, TH, { scale: 40, octaves: 4, seed: 42 });
      const hgt = new Float32Array(TW * TH), alb = new Float32Array(TW * TH);
      for (let k = 0; k < TW * TH; k++) { hgt[k] = (n1[k] - 0.5) * 10; alb[k] = 0.25 + n2[k] * 0.45 + (n1[k] - 0.5) * 0.4; }
      const r = SL.makeRng(77);
      const crater = (cu, cv, rr, depth, peak) => {
        const lat = (cv / TH - 0.5) * PI, cl = Math.max(0.25, Math.cos(lat)), ru = rr / cl, ext = 1.9;
        for (let j = Math.max(0, Math.floor(cv - rr * ext)); j <= Math.min(TH - 1, Math.ceil(cv + rr * ext)); j++) {
          const dv = (j - cv) / rr;
          for (let ii = Math.floor(cu - ru * ext); ii <= Math.ceil(cu + ru * ext); ii++) {
            const du = (ii - cu) / ru, q2 = du * du + dv * dv;
            if (q2 > ext * ext) continue;
            const q = Math.sqrt(q2), k = j * TW + (((ii % TW) + TW) % TW);
            let dh;
            if (q < 1) dh = (q2 - 1) * depth + gauss((q - 1) / 0.2) * depth * 0.38;
            else dh = gauss((q - 1) / 0.2) * depth * 0.38 + Math.exp(-(q - 1) * 3) * depth * 0.04;
            if (peak && q < 0.3) dh += (1 - q / 0.3) ** 2 * depth * peak;
            hgt[k] += dh;
            alb[k] += q < 0.85 ? -0.07 : gauss((q - 1.15) / 0.3) * 0.1;
          }
        }
      };
      crater(TW * 0.36, TH * 0.8, TH * 0.15, 26, 0.5); // the great southern basin
      crater(TW * 0.5, TH * 0.58, TH * 0.07, 14, 0);
      for (let i = 0; i < 300; i++) {
        const rr = 2 + 30 * Math.pow(r.next(), 2.6);
        crater(r.next() * TW, r.range(0.1, 0.9) * TH, rr, rr * 0.45, rr > 16 ? 0.35 : 0);
      }
      const L = lut([[0, '#211c18'], [0.35, '#3a322a'], [0.6, '#544739'], [0.85, '#6a5a48'], [1, '#7a6a56']]);
      return sphere({
        r: 560, res: 0.72, halo: 24, tilt: -0.35, spin: 0.4,
        surf(u, v, out) {
          lutAt(L, samp(alb, TW, TH, u, v), out);
          return samp(hgt, TW, TH, u, v);
        },
        bump: 0.55, amb: 0.035, ambC: [3, 6, 10], wrap: 0.04, limb: 0.15,
        atmo: { c: [70, 110, 140], pow: 4, str: 0.35, bias: -0.15, halo: 0.16, haloPow: 3 },
      });
    });
  }
  function vestaNebula() {
    return memo('vesta:neb', () => paintNoise(512, 512, [
      { scale: 170, octaves: 5, seed: 11, warp: 0.35, palette: [[0, '#060912', 0], [0.42, '#081820', 0], [0.6, '#123a48', 0.55], [0.82, '#1b4652', 0.85], [1, '#2a5a64', 1]] },
      { scale: 128, octaves: 5, seed: 12, warp: 0.3, palette: [[0, '#060912', 0], [0.5, '#140f22', 0], [0.7, '#2b1d3f', 0.6], [0.9, '#3a2650', 0.85], [1, '#4a3060', 1]] },
      { scale: 64, octaves: 4, seed: 13, ridged: true, op: 'destination-out', alpha: 0.75, palette: [[0, '#000', 0], [0.55, '#000', 0], [0.85, '#000', 0.6], [1, '#000', 0.9]] },
      { scale: 96, octaves: 5, seed: 14, ridged: true, op: 'lighter', alpha: 0.35, palette: [[0, '#000', 0], [0.7, '#0f3340', 0], [0.92, '#2a6470', 0.5], [1, '#5a96a0', 0.8]] },
    ]));
  }
  function vestaWisps() {
    return memo('vesta:wisp', () => paintNoise(256, 512, [
      { scale: 90, octaves: 5, seed: 15, warp: 0.4, palette: [[0, '#000', 0], [0.6, '#0e2430', 0], [0.85, '#1c3f4c', 0.45], [1, '#305a66', 0.7]] },
    ]));
  }
  const VESTA_ROCK_PAL = { lo: '#100e18', hi: '#211c2a', rim: '#4a4060', rimStr: 0.35, amb: 0.3, bump: 0.9 };
  function vestaRock(i) { return memo('vesta:rock' + i, () => rockSprite(500 + i * 13, [70, 96, 120, 150, 180, 210][i], VESTA_ROCK_PAL)); }
  const DW = TILE_W;
  function deckSection() {
    return memo('vesta:deck', () => {
      const w = DW, h = 1360, c = cnv(w, h), x = c.getContext('2d'), cx = w / 2, r = SL.makeRng(901);
      const d0 = cx - 210, d1 = cx + 210;
      // hull flanks
      let g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#0b0e15'); g.addColorStop(0.2, '#171c27'); g.addColorStop(0.26, '#1d2330');
      g.addColorStop(0.74, '#1d2330'); g.addColorStop(0.8, '#151a24'); g.addColorStop(1, '#0a0d13');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      // flank greebles: boxes, vents, pipes
      for (const side of [-1, 1]) {
        const ex = side < 0 ? 0 : d1 + 12, ew = d0 - 12;
        for (let y = 10; y < h; y += r.range(40, 120)) {
          const bw = r.range(30, ew - 30), bh = r.range(24, 80), bx = ex + r.range(8, ew - bw - 8);
          const p = new Path2D();
          p.rect(bx, y, bw, bh);
          A.metal(x, p, { base: r.chance(0.5) ? '#232a38' : '#1e2431', spec: 0.12, edge: 1.2, rimLight: 1, bounds: { x: bx, y, w: bw, h: bh } });
          if (r.chance(0.5)) {
            x.fillStyle = 'rgba(0,0,0,0.45)';
            for (let v = bx + 5; v < bx + bw - 5; v += 5) x.fillRect(v, y + 5, 2, bh - 10);
          }
        }
        x.strokeStyle = '#2b3242';
        x.lineWidth = 5;
        const px = side < 0 ? d0 - 26 : d1 + 26;
        x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke();
        x.strokeStyle = 'rgba(160,180,210,0.12)';
        x.lineWidth = 1;
        x.beginPath(); x.moveTo(px - 1.5, 0); x.lineTo(px - 1.5, h); x.stroke();
      }
      // deck plating
      g = x.createLinearGradient(d0, 0, d1, h);
      g.addColorStop(0, '#323a4b'); g.addColorStop(0.5, '#2a3140'); g.addColorStop(1, '#232937');
      x.fillStyle = g;
      x.fillRect(d0, 0, d1 - d0, h);
      const grime = A.noiseCanvas(128, 256, { scale: 24, octaves: 4, seed: 905, palette: [[0, '#000', 0.22], [0.5, '#000', 0], [0.8, '#fff', 0], [1, '#fff', 0.05]] });
      x.globalAlpha = 0.9;
      for (let y = 0; y < h; y += 512) x.drawImage(grime, d0, y, d1 - d0, 512);
      x.globalAlpha = 1;
      // plate seams
      for (let y = 0; y < h; y += 128) {
        for (let k = 0; k < 4; k++) {
          const px0 = d0 + k * 105, off = (y / 128) % 2 ? 0 : 52;
          const tint = r.range(-0.04, 0.04);
          x.fillStyle = tint > 0 ? 'rgba(255,255,255,' + tint + ')' : 'rgba(0,0,0,' + -tint * 2 + ')';
          x.fillRect(px0, y + off, 105, 128);
        }
        x.fillStyle = 'rgba(0,0,0,0.5)';
        x.fillRect(d0, y, d1 - d0, 1.5);
        x.fillStyle = 'rgba(255,255,255,0.05)';
        x.fillRect(d0, y + 1.5, d1 - d0, 1);
      }
      x.fillStyle = 'rgba(0,0,0,0.4)';
      for (let k = 1; k < 4; k++) x.fillRect(d0 + k * 105, 0, 1.5, h);
      // skid marks along the track
      for (let i = 0; i < 40; i++) {
        const sx = cx + r.range(-60, 60), sy = r.range(0, h), sl = r.range(80, 300);
        x.fillStyle = 'rgba(0,0,0,' + r.range(0.06, 0.16) + ')';
        x.fillRect(sx, sy, r.range(3, 9), sl);
      }
      // painted chevrons and edge lines
      x.strokeStyle = 'rgba(200,210,224,0.09)';
      x.lineWidth = 10;
      for (let y = 140; y < h; y += 320) {
        x.beginPath(); x.moveTo(cx - 120, y + 60); x.lineTo(cx - 34, y); x.moveTo(cx + 34, y); x.lineTo(cx + 120, y + 60); x.stroke();
      }
      x.fillStyle = 'rgba(200,210,224,0.10)';
      for (let y = 0; y < h; y += 48) { x.fillRect(d0 + 34, y, 3, 26); x.fillRect(d1 - 37, y, 3, 26); }
      // hazard stripe bands on the deck edges
      for (const bx of [d0 + 6, d1 - 24]) {
        x.save();
        x.beginPath(); x.rect(bx, 0, 18, h); x.clip();
        x.fillStyle = '#16181e';
        x.fillRect(bx, 0, 18, h);
        x.fillStyle = '#6a5520';
        for (let y = -20; y < h + 20; y += 28) {
          x.beginPath(); x.moveTo(bx, y); x.lineTo(bx + 18, y - 14); x.lineTo(bx + 18, y); x.lineTo(bx, y + 14); x.closePath(); x.fill();
        }
        x.restore();
      }
      // catapult track
      x.fillStyle = '#07090d';
      x.fillRect(cx - 6, 0, 12, h);
      railV(x, cx - 12, 0, 6, h, '#3a4252', '#5a6478');
      railV(x, cx + 6, 0, 6, h, '#3a4252', '#5a6478');
      for (let y = 40; y < h; y += 160) { x.fillStyle = '#1a1e26'; x.fillRect(cx - 14, y, 28, 10); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(cx - 14, y, 28, 1); }
      // guide light housings (two rows)
      for (const lx of [cx - 70, cx + 70]) {
        for (let y = 20; y < h; y += 64) {
          x.fillStyle = '#0c0f15'; x.fillRect(lx - 6, y - 10, 12, 20);
          x.fillStyle = '#123038'; x.fillRect(lx - 3.5, y - 7, 7, 14);
          x.fillStyle = 'rgba(127,227,255,0.18)'; x.fillRect(lx - 1.5, y - 6, 3, 5);
        }
      }
      // raised deck lips
      for (const lx of [d0 - 8, d1]) {
        const p = new Path2D();
        p.rect(lx, 0, 8, h);
        A.metal(x, p, { base: '#3a4356', spec: 0.3, edge: 1, rimLight: 1.2, bounds: { x: lx, y: 0, w: 8, h: 64 } });
      }
      // island superstructure on the right flank
      const ix = d1 + 30, iw = w - ix - 18, iy = 300, ih = 470;
      const isl = new Path2D();
      isl.moveTo(ix + 18, iy); isl.lineTo(ix + iw - 10, iy); isl.lineTo(ix + iw, iy + 20); isl.lineTo(ix + iw, iy + ih - 30);
      isl.lineTo(ix + iw - 24, iy + ih); isl.lineTo(ix + 10, iy + ih); isl.lineTo(ix, iy + ih - 20); isl.lineTo(ix, iy + 26); isl.closePath();
      x.fillStyle = 'rgba(0,0,0,0.45)';
      x.save(); x.translate(10, 14); x.fill(isl); x.restore();
      A.metal(x, isl, { base: '#3a4458', spec: 0.35, edge: 1.6, bounds: { x: ix, y: iy, w: iw, h: ih } });
      const deckP = new Path2D();
      for (let y = iy + 40; y < iy + ih - 40; y += 70) deckP.rect(ix + 8, y, iw - 16, 1);
      A.panelLines(x, deckP, '#000000', 0.5);
      x.fillStyle = '#0d1a22';
      x.fillRect(ix + 10, iy + 54, iw - 20, 12);
      x.fillRect(ix + 10, iy + 200, iw - 20, 8);
      x.fillStyle = 'rgba(127,227,255,0.55)';
      for (let k = 0; k < 7; k++) x.fillRect(ix + 14 + k * ((iw - 28) / 7), iy + 57, (iw - 28) / 7 - 4, 5);
      x.fillStyle = 'rgba(127,227,255,0.3)';
      for (let k = 0; k < 5; k++) x.fillRect(ix + 16 + k * ((iw - 32) / 5), iy + 202, (iw - 32) / 5 - 5, 3);
      const dish = new Path2D();
      dish.ellipse(ix + iw / 2, iy + 330, 34, 22, 0, 0, TAU);
      A.metal(x, dish, { base: '#4a5468', spec: 0.5, bounds: { x: ix + iw / 2 - 34, y: iy + 308, w: 68, h: 44 } });
      x.strokeStyle = '#1a1f2a'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(ix + iw / 2, iy + 330); x.lineTo(ix + iw / 2 - 20, iy + 316); x.stroke();
      return c;
    });
  }
  const BOW_H = 600;
  function deckBow() {
    return memo('vesta:bow', () => {
      const w = DW, h = BOW_H, c = cnv(w, h), x = c.getContext('2d'), cx = w / 2;
      const hull = new Path2D();
      hull.moveTo(0, h); hull.lineTo(0, h - 70);
      hull.bezierCurveTo(30, h - 260, cx - 170, 90, cx - 60, 18);
      hull.quadraticCurveTo(cx, -6, cx + 60, 18);
      hull.bezierCurveTo(cx + 170, 90, w - 30, h - 260, w, h - 70);
      hull.lineTo(w, h); hull.closePath();
      A.metal(x, hull, { base: '#1c2230', spec: 0.18, edge: 2, rimLight: 2, bounds: { x: 0, y: 0, w, h } });
      x.save();
      x.clip(hull);
      const deck = new Path2D();
      deck.moveTo(cx - 210, h); deck.lineTo(cx - 210, h - 150);
      deck.bezierCurveTo(cx - 205, 260, cx - 120, 110, cx - 38, 56);
      deck.quadraticCurveTo(cx, 40, cx + 38, 56);
      deck.bezierCurveTo(cx + 120, 110, cx + 205, 260, cx + 210, h - 150);
      deck.lineTo(cx + 210, h); deck.closePath();
      A.metal(x, deck, { base: '#2c3343', spec: 0.1, edge: 1.4, rimLight: 1.6, bounds: { x: cx - 210, y: 0, w: 420, h } });
      x.save(); x.clip(deck);
      x.fillStyle = 'rgba(0,0,0,0.45)';
      for (let y = h - 128; y > 0; y -= 128) x.fillRect(0, y, w, 1.5);
      for (let k = 1; k < 4; k++) x.fillRect(cx - 210 + k * 105, 0, 1.5, h);
      x.restore();
      // track end and stop block
      x.fillStyle = '#07090d'; x.fillRect(cx - 6, 150, 12, h - 150);
      railV(x, cx - 12, 150, 6, h - 150, '#3a4252', '#5a6478');
      railV(x, cx + 6, 150, 6, h - 150, '#3a4252', '#5a6478');
      const stop = new Path2D(); stop.rect(cx - 26, 132, 52, 22);
      A.metal(x, stop, { base: '#4a3a24', spec: 0.3, bounds: { x: cx - 26, y: 132, w: 52, h: 22 } });
      x.fillStyle = '#6a5520';
      for (let k = 0; k < 4; k++) x.fillRect(cx - 24 + k * 13, 134, 6, 18);
      // painted name
      x.fillStyle = 'rgba(200,210,224,0.10)';
      x.font = '800 54px Oxanium, "Segoe UI", Arial, sans-serif';
      x.textAlign = 'center';
      x.fillText('HALCYON', cx, 380);
      x.font = '700 30px Oxanium, "Segoe UI", Arial, sans-serif';
      x.fillText('CVS-01', cx, 430);
      for (const lx of [cx - 70, cx + 70]) {
        for (let y = h - 44; y > 200; y -= 64) {
          x.fillStyle = '#0c0f15'; x.fillRect(lx - 6, y - 10, 12, 20);
          x.fillStyle = '#123038'; x.fillRect(lx - 3.5, y - 7, 7, 14);
        }
      }
      x.restore();
      return c;
    });
  }
  function gantryTile() {
    return memo('vesta:truss', () => {
      const w = 84, h = 256, c = cnv(w + 8, h), x = c.getContext('2d');
      trussV(x, 4, 0, w, h, 64, '#1b2030', { cw: 9, dw: 3.2, hi: '#3c4558' });
      return c;
    });
  }
  function craneArm() {
    return memo('vesta:crane', () => {
      const w = 340, h = 70, c = cnv(w, h), x = c.getContext('2d');
      x.save();
      x.translate(0, h - 6);
      x.rotate(-PI / 2);
      trussV(x, 0, 0, 40, w - 40, 40, '#1b2030', { cw: 7, dw: 2.6, hi: '#3a4356' });
      x.restore();
      // trolley + cab at the tip
      const cab = new Path2D(); cab.rect(w - 52, h - 52, 46, 34);
      A.metal(x, cab, { base: '#2a3242', spec: 0.3, bounds: { x: w - 52, y: h - 52, w: 46, h: 34 } });
      x.fillStyle = 'rgba(255,177,92,0.25)'; x.fillRect(w - 46, h - 46, 30, 6);
      return c;
    });
  }
  /** burning dry dock with an unfinished carrier hull (640 x 1300), plus live points */
  const DOCK = { w: 660, h: 1300 };
  function drydock() {
    return memo('vesta:dock', () => {
      const w = DOCK.w, h = DOCK.h, c = cnv(w, h), x = c.getContext('2d'), cx = w / 2, r = SL.makeRng(733);
      // back cross beams
      for (const by of [70, 470, 880, 1230]) {
        x.save(); x.translate(20, by + 36); x.rotate(-PI / 2);
        trussV(x, 0, 0, 36, w - 40, 36, '#161b28', { cw: 6, dw: 2.4, hi: '#30384a' });
        x.restore();
      }
      // carrier hull: plated lower part, exposed ribs on top
      const hx0 = cx - 190, hx1 = cx + 190, top = 120, bot = 1240;
      const hull = new Path2D();
      hull.moveTo(cx, top); hull.bezierCurveTo(cx + 150, top + 90, hx1, top + 260, hx1, top + 420);
      hull.lineTo(hx1, bot - 60); hull.lineTo(hx1 - 50, bot); hull.lineTo(hx0 + 50, bot); hull.lineTo(hx0, bot - 60);
      hull.lineTo(hx0, top + 420); hull.bezierCurveTo(hx0, top + 260, cx - 150, top + 90, cx, top); hull.closePath();
      x.fillStyle = 'rgba(0,0,0,0.5)';
      x.save(); x.translate(14, 18); x.fill(hull); x.restore();
      x.save();
      x.clip(hull);
      x.fillStyle = '#0a0c12';
      x.fillRect(0, 0, w, h);
      // interior decks seen through the ribs
      for (let y = top + 40; y < 760; y += 46) {
        x.fillStyle = r.chance(0.5) ? '#111520' : '#0d1018';
        x.fillRect(hx0, y, hx1 - hx0, 22);
      }
      // rib frames
      for (let y = top + 30; y < 780; y += 34) {
        const p = new Path2D(); p.rect(hx0, y, hx1 - hx0, 9);
        A.metal(x, p, { base: '#1f2532', light: '#2c3444', spec: 0.06, edge: 0.8, rimLight: 0.6, bounds: { x: hx0, y, w: hx1 - hx0, h: 9 } });
      }
      const keel = new Path2D(); keel.rect(cx - 14, top, 28, bot - top);
      A.metal(x, keel, { base: '#222937', light: '#323b4c', spec: 0.08, edge: 1, rimLight: 0.8, bounds: { x: cx - 14, y: top, w: 28, h: 80 } });
      // plated section with a ragged top edge
      const plate = new Path2D();
      plate.moveTo(hx0 - 10, bot + 10); plate.lineTo(hx0 - 10, 820);
      for (let px = hx0; px <= hx1 + 10; px += 38) plate.lineTo(px, 780 + r.range(-34, 30) + ((px / 38) % 2) * 20);
      plate.lineTo(hx1 + 10, bot + 10); plate.closePath();
      A.metal(x, plate, { base: '#1c222e', light: '#2e3646', dark: '#0b0e14', spec: 0.07, specPos: 0.35, edge: 1.4, rimLight: 1, bounds: { x: hx0, y: 780, w: hx1 - hx0, h: bot - 780 } });
      x.save(); x.clip(plate);
      const seams = new Path2D();
      for (let y = 800; y < bot; y += 60) { seams.moveTo(hx0, y); seams.lineTo(hx1, y); }
      for (let px = hx0 + 64; px < hx1; px += 64) { seams.moveTo(px, 780); seams.lineTo(px, bot); }
      A.panelLines(x, seams, '#000000', 0.55);
      // scorched burn patches
      for (const [bx, by, br] of [[cx - 90, 900, 70], [cx + 110, 1040, 60], [cx - 40, 1160, 50]]) {
        const g = x.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, 'rgba(8,4,2,0.9)'); g.addColorStop(0.55, 'rgba(30,12,6,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(bx - br, by - br, br * 2, br * 2);
        const e = x.createRadialGradient(bx, by, br * 0.25, bx, by, br * 0.7);
        e.addColorStop(0, 'rgba(168,69,42,0)'); e.addColorStop(0.6, 'rgba(168,69,42,0.32)'); e.addColorStop(1, 'rgba(168,69,42,0)');
        x.fillStyle = e; x.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      // hull windows (dark, a few lit sodium)
      for (let y = 840; y < bot - 40; y += 60) {
        for (let px = hx0 + 20; px < hx1 - 20; px += 22) {
          x.fillStyle = r.chance(0.12) ? 'rgba(255,177,92,0.35)' : 'rgba(0,0,0,0.5)';
          x.fillRect(px, y + 24, 9, 4);
        }
      }
      x.restore();
      x.restore();
      rimStroke(x, hull, { x: hx0, y: top, w: hx1 - hx0, h: bot - top });
      // dock towers
      trussV(x, 0, 0, 74, h, 74, '#1b2030', { cw: 10, dw: 3.4, hi: '#3a4356' });
      trussV(x, w - 74, 0, 74, h, 74, '#1b2030', { cw: 10, dw: 3.4, hi: '#3a4356' });
      // front cross beams and support arms reaching the hull
      for (const by of [300, 660, 1040]) {
        x.save(); x.translate(60, by + 30); x.rotate(-PI / 2);
        trussV(x, 0, 0, 30, hx0 - 50, 30, '#1b2030', { cw: 5, dw: 2.2, hi: '#363f52' });
        x.restore();
        x.save(); x.translate(hx1 + 6, by + 30); x.rotate(-PI / 2);
        trussV(x, 0, 0, 30, w - 66 - hx1, 30, '#1b2030', { cw: 5, dw: 2.2, hi: '#363f52' });
        x.restore();
      }
      return c;
    });
  }
  const DOCK_FIRES = [[-90, 250, 1.1], [110, 390, 0.9], [-40, 510, 0.8], [60, -160, 0.7]];
  const DOCK_WELDS = [[-150, -280], [140, -120], [-60, -40], [175, 120]];
  const DOCK_LIGHTS = (() => {
    const out = [];
    for (let i = 0; i < 18; i++) out.push({ x: (i % 2 ? 1 : -1) * 293, y: -620 + i * 72, f: 0.8 + (i % 5) * 0.2, ph: i * 1.7, r: 7 });
    return out;
  })();
  const DOCK_IT = { x: 0, y: 0, rot: 0, s: 1 };
  function bossShadow() {
    return memo('vesta:shadow', () => blurredShape(620, 900, 46, 'rgba(0,0,0,1)', (x) => {
      const cx = 310;
      x.beginPath();
      x.moveTo(cx, 70); x.lineTo(cx + 70, 230); x.lineTo(cx + 250, 420); x.lineTo(cx + 270, 560); x.lineTo(cx + 120, 600);
      x.lineTo(cx + 100, 830); x.lineTo(cx - 100, 830); x.lineTo(cx - 120, 600); x.lineTo(cx - 270, 560); x.lineTo(cx - 250, 420);
      x.lineTo(cx - 70, 230); x.closePath();
    }));
  }
  function godRays() {
    return memo('vesta:rays', () => {
      const S = 1500, c = cnv(S, S), x = c.getContext('2d'), cx = S / 2, r = SL.makeRng(321);
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + r.range(-0.12, 0.12), wd = r.range(0.035, 0.09), len = r.range(0.75, 1) * cx;
        for (let pass = 0; pass < 3; pass++) {
          const ww = wd * (1 + pass * 0.8), al = [0.55, 0.25, 0.12][pass];
          const g = x.createRadialGradient(cx, cx, 0, cx, cx, len);
          g.addColorStop(0, 'rgba(255,217,160,' + al + ')');
          g.addColorStop(0.4, 'rgba(255,200,140,' + al * 0.5 + ')');
          g.addColorStop(1, 'rgba(255,190,130,0)');
          x.fillStyle = g;
          x.beginPath();
          x.moveTo(cx, cx);
          x.arc(cx, cx, len, a - ww / 2, a + ww / 2);
          x.closePath();
          x.fill();
        }
      }
      return c;
    });
  }
  function vestaHaze() {
    return memo('vesta:haze', () => paintNoise(256, 256, [
      { scale: 64, octaves: 5, seed: 31, warp: 0.4, palette: [[0, '#2a2018', 0], [0.4, '#2a2018', 0.15], [0.7, '#3a2c20', 0.55], [1, '#4a3828', 0.85]] },
    ]));
  }

  function vestaRockItem(rng, d, L) {
    const big = d.k.rockScale;
    const i = rng.int(0, 5), c = vestaRock(i);
    const par = rng.range(0.24, 0.36);
    const s = (0.55 + (par - 0.24) * 2.2) * big * rng.range(0.8, 1.15);
    return { c, x: rng.range(-60, W + 60), r: c.width * 0.5 * s, par, vx: rng.range(-6, 6), vy: 0, vr: rng.range(-0.12, 0.12), rot: rng.next() * TAU, s, a: rng.range(0.75, 1) };
  }
  function vestaGantryItem(rng, d) {
    const kind = rng.next();
    const left = rng.next() < 0.5;
    if (kind < 0.62) {
      // vertical truss column at an edge
      const n = rng.int(3, 6), len = n * 256;
      const x = left ? rng.range(-26, 60) : rng.range(W - 60, W + 26);
      const lights = [];
      for (let i = 0; i < n * 2; i++) lights.push({ x: (i % 2 ? 1 : -1) * 44, y: -len / 2 + 64 + i * 128, f: rng.range(0.8, 1.6), ph: rng.next() * TAU, r: 7 });
      return { kind: 'col', n, x, r: len / 2, par: 0.6, vx: 0, vy: 0, vr: 0, rot: 0, s: 1, a: 1, lights, draw: drawTrussCol };
    }
    const c = craneArm();
    const x = left ? c.width / 2 - rng.range(30, 120) : W - c.width / 2 + rng.range(30, 120);
    const fx = left ? 1 : -1;
    return { kind: 'arm', c, x, r: 60, par: 0.6, vx: 0, vy: 0, vr: 0, rot: 0, s: 1, a: 1, flip: !left, lights: [{ x: fx * (c.width / 2 - 30), y: 4, f: rng.range(0.8, 1.6), ph: rng.next() * TAU, r: 8 }, { x: fx * -60, y: 20, f: rng.range(0.8, 1.6), ph: 1, r: 6 }], draw: drawCrane };
  }
  let curD = null; // data of the background being drawn (item draw hooks read time from it)
  function drawTrussCol(ctx, it, a) {
    const c = gantryTile();
    ctx.globalAlpha = a;
    xf(ctx, it.x, it.y, 0, 1, 1);
    const len = it.n * 256;
    for (let i = 0; i < it.n; i++) ctx.drawImage(c, -c.width / 2, -len / 2 + i * 256, c.width, 256);
    camBase(ctx);
    drawLights(ctx, it, it.lights, curD.t, softGlow('#ffb15c', 16), a, 0.5);
  }
  function drawCrane(ctx, it, a) {
    const c = it.c;
    ctx.globalAlpha = a;
    xf(ctx, it.x, it.y, 0, it.flip ? -1 : 1, 1);
    ctx.drawImage(c, -c.width / 2, -c.height / 2);
    ctx.fillStyle = '#0d1018';
    ctx.fillRect(c.width / 2 - 30, c.height / 2 - 18, 1.5, 120);
    ctx.fillRect(c.width / 2 - 38, c.height / 2 + 100, 17, 10);
    camBase(ctx);
    drawLights(ctx, it, it.lights, curD.t, softGlow('#ffb15c', 16), a, 0.5);
  }

  defineBg('bg_vesta', {
    group: 'vesta', seed: 17,
    list: ['launch', 'belt', 'shipyard', 'storm', 'boss', 'sunrise', 'menu'],
    defaultPhase: 'belt',
    alias: { calm: 'belt', danger: 'storm', warp: 'belt' },
    knobs: {
      vx: [900, 0.18], vy: [300, 0.18], va: [0.9, 0.5], neb: [1, 0.5], rocks: [1, 1], rockScale: [1, 0.5], gantry: [0, 1],
      haze: [0, 0.45], dark: [0, 0.6], vig: [0, 0.8], sun: [0, 0.35], dust: [1, 0.6], stars: [1, 0.5], dock: [0, 2],
    },
    phases: {
      _base: { vx: 900, vy: 300, va: 0.92, neb: 1, rocks: 1, rockScale: 1, gantry: 0.18, haze: 0, dark: 0, vig: 0, sun: 0, dust: 1, stars: 1, dock: 0 },
      launch: { vx: 880, vy: 360, rocks: 0.6, gantry: 0, dust: 1.6 },
      belt: {},
      shipyard: { vx: 930, vy: 340, rocks: 0.45, gantry: 1, dock: 1 },
      storm: { vx: 950, vy: 380, va: 0.7, rocks: 1.5, rockScale: 2, gantry: 0, haze: 1, stars: 0.6, neb: 0.7, dust: 1.4 },
      boss: { vx: 960, vy: 420, va: 0.8, rocks: 0.6, rockScale: 1.4, gantry: 0, haze: 0.55, dark: 1, vig: 1, stars: 0.8 },
      sunrise: { vx: 985, vy: 520, va: 1, rocks: 0.5, gantry: 0, haze: 0.15, sun: 1, stars: 0.85 },
      menu: { vx: 840, vy: 330, va: 1, rocks: 0.75, gantry: 0, dust: 0.35 },
    },
    init(bg, d) {
      const rng = d.rng;
      d.sky = memo('vesta:sky', () => skyCanvas([[0, '#060912'], [0.6, '#080d1a'], [1, '#0b1020']]));
      d.st = [
        memo('vesta:st0', () => starTile({ n: 220 / 2, seed: 101, size: [0.35, 0.9], alpha: [0.25, 0.7], colors: ['#ffffff', '#cfe0ff', '#bcd2ff'], glow: 0.1 })),
        memo('vesta:st1', () => starTile({ n: 140 / 2, seed: 102, size: [0.5, 1.2], alpha: [0.35, 0.85], colors: ['#ffffff', '#dbe8ff', '#fff1dc'], glow: 0.3 })),
        memo('vesta:st2', () => starTile({ n: 60 / 2, seed: 103, size: [0.7, 1.6], alpha: [0.45, 0.95], colors: ['#ffffff', '#e8f2ff', '#ffe6c8'], glow: 0.6 })),
      ];
      d.tw = twinkles(rng, 34, { colors: ['#dfeaff', '#ffffff', '#ffe9cf', '#cfe2ff'], size: [2.2, 4.2], alpha: [0.3, 0.75], par: [0.04, 0.09, 0.18] });
      d.neb = vestaNebula();
      d.wisp = vestaWisps();
      d.planet = vestaPlanet();
      d.dust = dustMake(rng, 16, 1.2);
      d.rocks = layer({ par: 0.3, gap: [120, 260], margin: 120, max: 16, make: vestaRockItem });
      d.gant = layer({ par: 0.6, gap: [260, 520], margin: 80, max: 8, make: vestaGantryItem });
      d.dockIt = null;
      d.sparks = [];
      for (let i = 0; i < 48; i++) d.sparks.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
      d.pulse = { t: 99, x: 0, y: 0, next: 2 };
      d.puffs = [];
      d.launch = { fired: false };
      d.shadow = { y: 9999, on: false };
    },
    phase(bg, d, ph, prev, snap) {
      if (snap) {
        layerFill(d.rocks, d, d.k.rocks);
        layerFill(d.gant, d, d.k.gantry);
      }
      if (ph === 'shipyard' && !d.dockIt) {
        d.dockIt = { x: W / 2 + 6, y: snap ? 380 : -DOCK.h / 2 - 40, par: 0.6 };
      }
      if (ph === 'launch') { d.launch = { fired: false }; d.puffs.length = 0; }
      if (ph === 'boss') d.shadow = { y: H + 560, on: false };
      if (ph === 'sunrise') d.sunT = 0;
    },
    update(bg, d, dt) {
      const k = d.k, dy = d.sp * dt;
      twinkleStep(d.tw, dy, d.rng);
      dustStep(d.dust, dy, d.rng);
      layerStep(d.rocks, d, dt, k.rocks);
      layerStep(d.gant, d, dt, k.gantry);
      if (d.dockIt) {
        d.dockIt.y += dy * d.dockIt.par;
        if (d.dockIt.y - DOCK.h / 2 > H + 60) d.dockIt = null;
      }
      // dock fire pulses and welding sparks
      if (d.dockIt) {
        const P = d.pulse;
        P.t += dt;
        P.next -= dt;
        if (P.next <= 0) {
          const f = DOCK_FIRES[d.rng.int(0, DOCK_FIRES.length - 1)];
          P.t = 0; P.x = d.dockIt.x + f[0]; P.y = d.dockIt.y + f[1]; P.next = d.rng.range(3, 5);
        }
        if (d.rng.next() < dt * 14) {
          const wpt = DOCK_WELDS[d.rng.int(0, DOCK_WELDS.length - 1)];
          for (let n = 0, q = 0; n < 3 && q < d.sparks.length; q++) {
            const s = d.sparks[q];
            if (s.life > 0) continue;
            n++;
            s.x = d.dockIt.x + wpt[0]; s.y = d.dockIt.y + wpt[1];
            s.vx = d.rng.range(-90, 90); s.vy = d.rng.range(-120, 20); s.life = d.rng.range(0.35, 0.8); s.l0 = s.life;
          }
        }
      }
      for (const s of d.sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.vy += 320 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt + dy * 0.6;
      }
      // launch script
      if (d.ph === 'launch') {
        const L = d.launch;
        if (!L.fired && d.pt >= 1.0) {
          L.fired = true;
          if (SL.fx && SL.fx.chromatic) SL.fx.chromatic(0.3, 0.45);
          for (let i = 0; i < 18; i++) d.puffs.push({ x: W / 2 + d.rng.range(-20, 20), y: d.rng.range(560, 1320), r: d.rng.range(30, 70), a: d.rng.range(0.18, 0.32), vx: d.rng.range(-50, 50), age: 0 });
        }
      }
      for (const p of d.puffs) { p.age += dt; p.x += p.vx * dt; p.y += (deckVel(d) * 0.85 + 60) * dt; p.r += 60 * dt; }
      if (d.puffs.length && d.puffs[0].age > 1.6) d.puffs.length = 0;
      if (d.ph === 'boss') {
        const S = d.shadow;
        if (!S.on && d.pt > 1.4) { S.on = true; S.y = H + 520; }
        if (S.on) S.y -= 700 * dt;
        if (k.vig > 0.02 && SL.render.vignette) SL.render.vignette(0.35 + 0.15 * k.vig);
      }
      if (d.ph === 'sunrise') d.sunT = (d.sunT || 0) + dt;
    },
    draw(bg, d, ctx) {
      const k = d.k, t = d.t;
      curD = d;
      // launch camera punch (1.04 -> 1.0 when the catapult fires)
      if (d.ph === 'launch' && d.pt >= 1 && d.pt < 1.7) cam.z = 1 + 0.04 * (1 - SL.ease.outCubic((d.pt - 1) / 0.7));
      camBase(ctx);
      drawSky(ctx, d.sky);
      ctx.globalCompositeOperation = 'source-over';
      tileY(ctx, d.st[0], d.sy * 0.04, -PAD, TILE_W, 0.9 * k.stars);
      tileY(ctx, d.neb, d.sy * 0.07, -PAD, TILE_W, 0.4 * k.neb);
      ctx.globalCompositeOperation = 'lighter';
      tileY(ctx, d.wisp, d.sy * 0.11 + 300, -PAD, TILE_W, 0.22 * k.neb);
      ctx.globalCompositeOperation = 'source-over';
      tileY(ctx, d.st[1], d.sy * 0.09, -PAD, TILE_W, 0.9 * k.stars);
      // sun behind Vesta (sunrise)
      const vx = k.vx + Math.sin(t * 0.05) * 6, vy = k.vy + Math.cos(t * 0.04) * 5;
      let sx = 0, sy = 0, sunA = 0;
      if (k.sun > 0.01) {
        const st = d.ph === 'sunrise' ? (d.sunT || 0) : 99;
        const rise = lerp(-36, 34, sstep(0, 6, st));
        const dx = -0.566, dyy = -0.824;
        sx = vx + dx * (560 + rise);
        sy = vy + dyy * (560 + rise);
        sunA = k.sun;
        ctx.globalCompositeOperation = 'lighter';
        A.drawGlow(ctx, sx, sy, 600, '#ffb978', 0.5 * sunA);
        A.drawGlow(ctx, sx, sy, 300, '#ffd9a0', 0.45 * sunA * sstep(0, 4, st));
        ctx.globalCompositeOperation = 'source-over';
      }
      drawSphere(ctx, d.planet, vx, vy, k.va);
      if (sunA > 0.01) {
        const st = d.sunT || 0;
        ctx.globalCompositeOperation = 'lighter';
        const crest = sstep(1.5, 5.5, st);
        // backlit limb crescent
        const ang = Math.atan2(-0.824, -0.566);
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = sunA * (0.08 + 0.3 * crest) * [1, 0.55, 0.3][i];
          ctx.strokeStyle = ['#ffe2b0', '#ffc888', '#ff9f68'][i];
          ctx.lineWidth = [2, 5, 11][i];
          ctx.beginPath();
          const span = [0.55, 0.35, 0.22][i];
          ctx.arc(vx, vy, 559, ang - span, ang + span);
          ctx.stroke();
        }
        A.drawGlow(ctx, sx, sy, 90 + 50 * crest, '#fff3dc', sunA * crest * 0.9);
        // god rays
        const rays = godRays();
        ctx.globalAlpha = sunA * (0.08 + 0.12 * sstep(2, 6, st)) / 0.55;
        xf(ctx, sx, sy, t * 0.012, 1, 1);
        ctx.drawImage(rays, -rays.width / 2, -rays.height / 2);
        camBase(ctx);
        ctx.globalCompositeOperation = 'source-over';
      }
      tileY(ctx, d.st[2], d.sy * 0.18, -PAD, TILE_W, 0.85 * k.stars);
      ctx.globalCompositeOperation = 'lighter';
      twinkleDraw(ctx, d.tw, t, k.stars);
      ctx.globalCompositeOperation = 'source-over';
      // L4 belt rocks
      layerDraw(ctx, d.rocks, 1);
      // shipyard dock
      if (d.dockIt) {
        const D0 = d.dockIt, dc = drydock();
        ctx.globalAlpha = 1;
        ctx.drawImage(dc, D0.x - DOCK.w / 2, D0.y - DOCK.h / 2);
        ctx.globalCompositeOperation = 'lighter';
        const fg = softGlow('#c85a2a', 48);
        for (let i = 0; i < DOCK_FIRES.length; i++) {
          const f = DOCK_FIRES[i];
          const fl = 0.6 + 0.25 * Math.sin(t * 11 + i * 3) + 0.15 * Math.sin(t * 23 + i);
          const rr = 56 * f[2] * (0.9 + 0.2 * fl);
          ctx.globalAlpha = 0.3 * fl;
          ctx.drawImage(fg, D0.x + f[0] - rr, D0.y + f[1] - rr * 1.2, rr * 2, rr * 2);
        }
        const wg = softGlow('#9fd8ff', 16);
        for (let i = 0; i < DOCK_WELDS.length; i++) {
          const fl = Math.max(0, Math.sin(t * 17 + i * 2.1)) * (0.5 + 0.5 * Math.sin(t * 41 + i));
          ctx.globalAlpha = 0.55 * fl;
          const wx = D0.x + DOCK_WELDS[i][0], wy = D0.y + DOCK_WELDS[i][1];
          ctx.drawImage(wg, wx - 9, wy - 9, 18, 18);
        }
        ctx.fillStyle = '#ffc890';
        for (const s of d.sparks) {
          if (s.life <= 0) continue;
          ctx.globalAlpha = 0.7 * (s.life / s.l0);
          ctx.fillRect(s.x, s.y, 1.2, 2.6);
        }
        const P = d.pulse;
        if (P.t < 1.2) {
          const e = P.t < 0.15 ? P.t / 0.15 : Math.exp(-(P.t - 0.15) * 3);
          A.drawGlow(ctx, P.x, P.y, 420, '#a8452a', 0.12 * e / 0.72);
        }
        ctx.globalCompositeOperation = 'source-over';
        DOCK_IT.x = D0.x;
        DOCK_IT.y = D0.y;
        drawLights(ctx, DOCK_IT, DOCK_LIGHTS, t, softGlow('#ffb15c', 16), 1, 0.5);
      }
      // L5 gantries
      layerDraw(ctx, d.gant, 1);
      // storm haze
      if (k.haze > 0.01) {
        darken(ctx, 0.3 * k.haze, '#2a2018');
        const hz = vestaHaze();
        tileXY(ctx, hz, t * 9, d.sy * 0.9, 3.2, 0.5 * k.haze);
        tileXY(ctx, hz, -t * 5 + 300, d.sy * 1.15 + 500, 2.2, 0.3 * k.haze);
      }
      // boss: shadow and darkening
      if (d.ph === 'boss' && d.shadow.on && d.shadow.y > -700) {
        const sh = bossShadow();
        ctx.globalAlpha = 0.5;
        ctx.drawImage(sh, W / 2 - sh.width / 2, d.shadow.y - sh.height / 2);
      }
      darken(ctx, 0.2 * k.dark);
      // L6 dust streaks
      ctx.globalCompositeOperation = 'lighter';
      dustDraw(ctx, d.dust, d.sp, k.haze > 0.3 ? '#c8a888' : '#9fb8d0', 0.1 * k.dust);
      ctx.globalCompositeOperation = 'source-over';
      // launch deck over everything
      if (d.ph === 'launch') drawDeck(ctx, d);
      if (k.sun > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        A.drawGlow(ctx, W + 40, -60, 520, '#ffd9a0', 0.08 * k.sun);
        ctx.globalCompositeOperation = 'source-over';
      }
    },
  });
  const STREAKS = (() => { const r = SL.makeRng(5), a = []; for (let i = 0; i < 26; i++) a.push(r.next(), r.range(160, 420), r.next()); return a; })();
  function deckY(d) {
    const pt = d.pt;
    if (pt < 1) return -40 + 30 * pt + Math.sin(pt * 70) * 0.6;
    const t = pt - 1;
    return -10 + 300 * t + 2600 * t * t;
  }
  function deckVel(d) { return d.pt < 1 ? 30 : 300 + 5200 * (d.pt - 1); }
  function drawDeck(ctx, d) {
    const y0 = deckY(d);
    if (y0 - BOW_H > H + PAD) {
      if (store.has('vesta:deck') && d.pt > 3) { store.delete('vesta:deck'); store.delete('vesta:bow'); }
      return;
    }
    const sec = deckSection(), bow = deckBow();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bow, -PAD, y0 - BOW_H);
    ctx.drawImage(sec, -PAD, y0);
    // chasing guide lights
    const t = d.pt, fired = d.pt >= 1;
    const gl = A.glow('#7fe3ff', 16);
    ctx.globalCompositeOperation = 'lighter';
    for (let li = 0; li < 2; li++) {
      const lx = W / 2 + (li ? 70 : -70);
      for (let ly = 20; ly < 1360; ly += 64) {
        const sy = y0 + ly;
        if (sy < -20 || sy > H + 20) continue;
        const ph = ((ly + t * 1500) % 384) / 384;
        const pulse = Math.exp(-Math.pow((ph - 0.5) * 7, 2));
        const a = (fired ? 0.9 : 0.3 + 0.7 * pulse);
        ctx.globalAlpha = a;
        ctx.drawImage(gl, lx - 9, sy - 13, 18, 26);
      }
      for (let ly = BOW_H - 44; ly > 200; ly -= 64) {
        const sy = y0 - BOW_H + ly;
        if (sy < -20 || sy > H + 20) continue;
        ctx.globalAlpha = fired ? 0.9 : 0.35;
        ctx.drawImage(gl, lx - 9, sy - 13, 18, 26);
      }
    }
    // island and nav lights
    const red = softGlow('#ff4040', 12), grn = softGlow('#40ff90', 12);
    const blink = 0.5 + 0.5 * Math.sin(t * TAU);
    ctx.globalAlpha = 0.5 * blink;
    ctx.drawImage(red, 40 - 10, y0 - 120, 20, 20);
    ctx.drawImage(grn, W - 50, y0 - 120, 20, 20);
    ctx.globalAlpha = 0.6 * blink;
    ctx.drawImage(red, W - 90, y0 + 290, 16, 16);
    ctx.globalCompositeOperation = 'source-over';
    // catapult steam
    if (d.puffs.length) {
      const sm = softGlow('#b8c4d4', 32);
      for (const p of d.puffs) {
        const a = p.a * Math.max(0, 1 - p.age / 1.4);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.drawImage(sm, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }
    // launch speed streaks
    if (fired && d.pt < 2.6) {
      const e = sstep(1, 1.2, d.pt) * (1 - sstep(1.8, 2.6, d.pt));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#cfefff';
      for (let i = 0; i < STREAKS.length; i += 3) {
        const len = STREAKS[i + 1], y = ((STREAKS[i + 2] * H + d.pt * 2600) % (H + len)) - len;
        ctx.globalAlpha = 0.12 * e;
        ctx.fillRect(STREAKS[i] * W, y, 1.5, len);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ==================================================================================================================
  // shared: background metal, gas giants, painted black holes (art only), lensed star fields, spiral debris streams
  // ==================================================================================================================
  const nrm = (v) => { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
  /** A.metal tuned for scenery: dim highlight and faint specular so hulls under the play area stay below 40% value */
  function bgMetal(x, path, base, b, o) {
    o = o || {};
    A.metal(x, path, {
      base, light: o.light || C.lighten(base, o.li != null ? o.li : 0.16), dark: C.darken(base, o.dk != null ? o.dk : 0.62),
      spec: o.spec != null ? o.spec : 0.1, specPos: o.specPos, edge: o.edge != null ? o.edge : 1, rimLight: o.rl != null ? o.rl : 0.9,
      rim: o.rim, rimWidth: o.rw, angle: o.angle, bounds: b,
    });
  }
  const pathOf = (pts) => { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); return p; };
  const boundsOf = (pts) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  };
  /** jagged irregular polygon around (cx, cy): n points, radius rr, jag 0..1 */
  function jagPoly(rng, cx, cy, rx, ry, n, jag) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.range(-0.25, 0.25) * (TAU / n), k = 1 - jag * rng.next();
      out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return out;
  }

  /** banded gas giant (rendered once): o {r, res, halo, seed, bands [[t, hex]], tilt, spin, light, amb, ambC, wrap, limb,
      atmo, storm {u, v, r, b}, turb} */
  function gasGiant(o) {
    const TW = 256, TH = 512;
    const turb = A.noise(TW, TH, { scale: 32, octaves: 5, seed: o.seed, warp: 0.7, gain: 0.55 });
    const fine = A.noise(TW, TH, { scale: 8, octaves: 3, seed: o.seed + 1 });
    const r = SL.makeRng(o.seed + 2), NB = 8, fq = [], ph = [], am = [];
    for (let i = 0; i < NB; i++) { fq.push(r.range(3, 14) * (1 + i * 0.45)); ph.push(r.next() * TAU); am.push(r.range(0.4, 1) / (1 + i * 0.35)); }
    let asum = 0;
    for (const a of am) asum += a;
    const prof = new Float32Array(1024);
    for (let j = 0; j < 1024; j++) {
      const v = j / 1023;
      let s = 0;
      for (let i = 0; i < NB; i++) s += am[i] * Math.sin(v * PI * fq[i] + ph[i]);
      const q = 0.5 + 0.5 * s / asum;
      prof[j] = q * q * (3 - 2 * q); // crisper band edges
    }
    const L = lut(o.bands), st = o.storm, tk = o.turb != null ? o.turb : 0.06;
    return sphere({
      r: o.r, res: o.res, halo: o.halo || 0, tilt: o.tilt || 0, spin: o.spin || 0, light: o.light,
      surf(u, v, out) {
        const t = samp(turb, TW, TH, u, v);
        let vv = v + (t - 0.5) * tk;
        vv = vv < 0 ? 0 : vv > 1 ? 1 : vv;
        let b = prof[(vv * 1023) | 0];
        b = b + (t - 0.5) * 0.3 + (samp(fine, TW, TH, u, v) - 0.5) * 0.12;
        if (st) {
          let du = u - st.u;
          du -= Math.round(du);
          du *= 2.4;
          const dv = v - st.v, q = (du * du + dv * dv) / (st.r * st.r);
          if (q < 1.6) b = lerp(b, st.b, q < 1 ? 1 - q * q * 0.6 : 0.4 * (1.6 - q) / 0.6);
        }
        lutAt(L, b < 0 ? 0 : b > 1 ? 1 : b, out);
        return 0;
      },
      amb: o.amb, ambC: o.ambC, wrap: o.wrap, limb: o.limb, gamma: o.gamma, atmo: o.atmo,
    });
  }

  /** Painted Kerr-style black hole (art only, never addLens): disk semi-axes a x b around a shadow of radius rs; the far
      half of the disk is lensed into an arc over the shadow, a thinner one under it, and a thin photon ring.
      Returns {emis (draw with 'lighter'), shadow (source-over), w, h, a, b, rs}. */
  function paintedHole(o) {
    const res = o.res || 2, a = o.a, b = o.b, rs = o.rs;
    const w = Math.ceil(a * 2.5), h = Math.ceil(Math.max(b * 2.8, rs * 3.8));
    const W2 = Math.ceil(w * res), H2 = Math.ceil(h * res), cx = W2 / 2, cy = H2 / 2;
    const em = cnv(W2, H2), ex = em.getContext('2d'), img = ex.createImageData(W2, H2), D = img.data;
    const streak = A.noise(256, 32, { scale: 16, octaves: 4, seed: o.seed || 3 });
    const Lc = lut(o.colors || [[0, '#fff1d6'], [0.2, '#ffcf8a'], [0.55, '#ff8a5c'], [1, '#2a0c06']]);
    const ri = o.inner || 0.3, A2 = a * res, B2 = b * res, RS = rs * res, dop = o.doppler != null ? o.doppler : 0.45;
    const gain = o.gain || 1, col = [0, 0, 0], ringC = rgb(o.ring || '#c9b8ff'), arcC = [0, 0, 0];
    lutAt(Lc, 0.28, arcC);
    for (let j = 0; j < H2; j++) {
      const py = j + 0.5 - cy;
      for (let i = 0; i < W2; i++) {
        const px = i + 0.5 - cx, dd = Math.hypot(px, py);
        let R = 0, G = 0, B = 0;
        const u = px / A2, v = py / B2, rho = Math.sqrt(u * u + v * v);
        if (rho > ri && rho < 1.3 && !(py < 0 && dd < RS * 1.02)) {
          const t = clamp((rho - ri) / (1 - ri), 0, 1), psi = Math.atan2(v, u);
          const n = samp(streak, 256, 32, psi / TAU + 0.5, t);
          let I = Math.pow(1 - t, 1.5) * (0.5 + 0.95 * n) * sstep(ri, ri + 0.07, rho) * (1 - sstep(0.92, 1.3, rho));
          I *= (1 - dop * Math.cos(psi)) * gain;
          lutAt(Lc, t, col);
          R += col[0] * I; G += col[1] * I; B += col[2] * I;
        }
        if (dd > RS * 0.98) {
          const top = clamp(-py / dd, 0, 1), bot = clamp(py / dd, 0, 1);
          const I1 = (gauss((dd - RS * 1.24) / (RS * 0.13)) * 1.25 + gauss((dd - RS * 1.42) / (RS * 0.3)) * 0.35) * Math.pow(top, 0.6) * (1 - 0.3 * px / dd) * gain;
          const I2 = gauss((dd - RS * 1.09) / (RS * 0.05)) * Math.pow(bot, 1.4) * 0.5 * gain;
          const Ia = I1 + I2;
          R += arcC[0] * Ia; G += arcC[1] * Ia; B += arcC[2] * Ia;
          const pr = gauss((dd - RS * 1.025) / (RS * 0.03)) * 0.6 * gain;
          R += ringC[0] * pr; G += ringC[1] * pr; B += ringC[2] * pr;
        }
        const p = (j * W2 + i) * 4;
        D[p] = R; D[p + 1] = G; D[p + 2] = B; D[p + 3] = 255;
      }
    }
    ex.putImageData(img, 0, 0);
    const sh = cnv(W2, H2), sx = sh.getContext('2d');
    const g = sx.createRadialGradient(cx, cy, RS * 0.92, cx, cy, RS * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = g;
    sx.fillRect(0, 0, W2, H2);
    return { emis: em, shadow: sh, w, h, a, b, rs };
  }
  /** draws a painted hole at (x, y) with a broad glow and orbiting hot spots; lens = lensed star field or null */
  function drawHole(ctx, E, x, y, a, t, glowC, lf, lensA, sc) {
    sc = sc || 1;
    ctx.globalCompositeOperation = 'lighter';
    A.drawGlow(ctx, x, y, E.a * 1.9 * sc, glowC, 0.1 * a);
    A.drawGlow(ctx, x, y, E.a * 0.9 * sc, '#ffcf8a', 0.07 * a);
    ctx.globalCompositeOperation = 'source-over';
    if (lf && lensA > 0.01) lensFieldDraw(ctx, lf, x, y, sc, E.rs * 1.45, E.rs, a * lensA);
    const w = E.w * sc, h = E.h * sc;
    ctx.globalAlpha = Math.min(1, a * 1.3);
    ctx.drawImage(E.shadow, x - w / 2, y - h / 2, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, a * (0.93 + 0.07 * Math.sin(t * 1.7)));
    ctx.drawImage(E.emis, x - w / 2, y - h / 2, w, h);
    const hs = softGlow('#ffe2b0', 16);
    for (let i = 0; i < 4; i++) {
      const ps = t * (1.1 - i * 0.17) + i * 1.9, rr = 0.42 + i * 0.13;
      const hx = Math.cos(ps) * E.a * rr, hy = Math.sin(ps) * E.b * rr;
      if (hy < 0 && Math.hypot(hx, hy) < E.rs * 1.05) continue;
      const dp = 1 - 0.5 * Math.cos(ps);
      ctx.globalAlpha = Math.min(1, a * 0.2 * dp);
      ctx.drawImage(hs, x + hx * sc - 12 * sc, y + hy * sc - 6 * sc, 24 * sc, 12 * sc);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** stars behind a painted hole, drawn lensed into tangential arcs (primary and secondary images of a point lens) */
  function lensField(rng, n, R) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ x: rng.range(-R, R), y: rng.range(-R, R), s: rng.range(0.7, 1.9), a: rng.range(0.35, 0.9), w: rng.int(0, 2) });
    out.R = R;
    return out;
  }
  function lensFieldStep(arr, dx, dy, rng) {
    const R = arr.R;
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      s.x += dx;
      s.y += dy;
      if (s.y > R) { s.y -= 2 * R; s.x = rng.range(-R, R); }
      if (s.x > R) s.x -= 2 * R;
      else if (s.x < -R) s.x += 2 * R;
    }
  }
  const LENS_COLS = ['#ffffff', '#dfe6ff', '#ffe9cf'];
  function lensFieldDraw(ctx, arr, ex, ey, sc, thE, rs, alpha) {
    if (alpha <= 0.01) return;
    const R = arr.R, th4 = thE * thE * 4;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let c = 0; c < 3; c++) {
      ctx.strokeStyle = LENS_COLS[c];
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s.w !== c) continue;
        const b = Math.hypot(s.x, s.y) + 0.01;
        const fade = alpha * s.a * (1 - sstep(R * 0.55, R, b));
        if (fade < 0.01) continue;
        const root = Math.sqrt(b * b + th4), ang = Math.atan2(s.y, s.x);
        const tp = (b + root) / 2, tm = (root - b) / 2, u = b / thE;
        const mu = (u * u + 2) / (2 * u * Math.sqrt(u * u + 4));
        const hw = Math.min(1.25, s.s * 0.8 / b);
        ctx.globalAlpha = Math.min(0.9, fade * (0.4 + 0.45 * mu));
        ctx.lineWidth = Math.max(0.7, s.s * 0.6 * (1 + b / root)) * sc;
        ctx.beginPath();
        ctx.arc(ex, ey, tp * sc, ang - hw, ang + hw);
        ctx.stroke();
        if (tm > rs * 1.1) {
          ctx.globalAlpha = Math.min(0.6, fade * 0.3 * (mu - 0.5));
          ctx.lineWidth = Math.max(0.5, s.s * 0.6 * (1 - b / root)) * sc;
          ctx.beginPath();
          ctx.arc(ex, ey, tm * sc, ang + PI - hw, ang + PI + hw);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = Math.min(1, alpha * 0.045);
    ctx.strokeStyle = '#c9b8ff';
    ctx.lineWidth = 5 * sc;
    ctx.beginPath();
    ctx.arc(ex, ey, thE * sc, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  /** debris streams falling into a center along log-spiral arms (pieces accelerate inward and are respawned outside) */
  const SPIRAL_TW = 1.7;
  function spiralMake(rng, arms, per, sprites) {
    const S = { list: [], spin: 0, arms, sprites };
    for (let a = 0; a < arms; a++) for (let i = 0; i < per; i++) S.list.push(spiralSeed({}, rng, a, S, rng.next()));
    return S;
  }
  function spiralSeed(p, rng, arm, S, f) {
    p.arm = arm;
    p.off = rng.range(-0.2, 0.2) + rng.range(-0.08, 0.08);
    p.r = 80 + f * 1400;
    p.rot = rng.next() * TAU;
    p.vr = rng.range(-1.4, 1.4);
    p.c = S.sprites[rng.int(0, S.sprites.length - 1)];
    p.s = rng.range(0.5, 1.15);
    p.a = rng.range(0.6, 0.95);
    p.q = rng.next();
    p.v = rng.range(0.7, 1.35);
    return p;
  }
  function spiralPos(S, p, r, cx, cy, sq, out) {
    const phi = (p.arm / S.arms) * TAU + p.off + S.spin + SPIRAL_TW * Math.log(r / 80);
    out[0] = cx + Math.cos(phi) * r;
    out[1] = cy + Math.sin(phi) * r * sq;
  }
  function spiralStep(S, dt, rng, speed) {
    S.spin += dt * 0.015;
    for (let i = 0; i < S.list.length; i++) {
      const p = S.list[i];
      p.r -= dt * speed * p.v * (1 + 260 / p.r);
      p.rot += p.vr * dt;
      if (p.r < 60) spiralSeed(p, rng, p.arm, S, 0.85 + rng.next() * 0.15);
    }
  }
  const SP = [0, 0], SP2 = [0, 0];
  function spiralDraw(ctx, S, cx, cy, sq, dens, alpha, laneC) {
    if (alpha <= 0.01 || dens <= 0.01) return;
    // faint dust lanes along the arms
    if (laneC) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = laneC;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.lineWidth = pass ? 9 : 34;
        ctx.globalAlpha = (pass ? 0.12 : 0.06) * alpha * Math.min(1, dens * 1.3);
        ctx.beginPath();
        for (let a = 0; a < S.arms; a++) {
          const p = SP_ARM;
          p.arm = a;
          for (let i = 0; i <= 40; i++) {
            const r = 90 * Math.pow(1500 / 90, i / 40);
            spiralPos(S, p, r, cx, cy, sq, SP);
            if (i) ctx.lineTo(SP[0], SP[1]);
            else ctx.moveTo(SP[0], SP[1]);
          }
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    for (let i = 0; i < S.list.length; i++) {
      const p = S.list[i];
      if (p.q > dens) continue;
      spiralPos(S, p, p.r, cx, cy, sq, SP);
      if (SP[1] < -60 || SP[1] > H + 60 || SP[0] < -60 || SP[0] > W + 60) continue;
      const fade = clamp((dens - p.q) * 8, 0, 1) * sstep(60, 170, p.r);
      const sc = p.s * (0.45 + 0.55 * sstep(60, 900, p.r));
      blit(ctx, p.c, SP[0], SP[1], p.rot, sc, p.a * alpha * fade);
    }
    camBase(ctx);
  }
  const SP_ARM = { arm: 0, off: 0 };
  /** small dark debris sprites (rocks and torn plates) shared by several scenes; pal {lo, hi, rim, plate} */
  function debrisSprites(group, pal, seed) {
    return memo(group + ':debris', () => {
      const out = [];
      for (let i = 0; i < 4; i++) out.push(rockSprite(seed + i * 7, 18 + i * 7, pal));
      for (let i = 0; i < 4; i++) {
        const r = SL.makeRng(seed + 50 + i), s = 16 + i * 8, c = cnv(s * 2, s * 2), x = c.getContext('2d');
        const pts = jagPoly(r, s, s, s * 0.9, s * r.range(0.35, 0.6), r.int(5, 7), 0.45);
        bgMetal(x, pathOf(pts), pal.plate || '#2a3044', boundsOf(pts), { spec: 0.14, rl: 0.8 });
        x.strokeStyle = 'rgba(0,0,0,0.5)';
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(pts[0][0], pts[0][1]);
        x.lineTo(s, s);
        x.stroke();
        out.push(c);
      }
      return out;
    });
  }

  // ==================================================================================================================
  // bg_kerr: Kerr Station under Kerr's Eye (m2) and Lagrange Deep at the edge of the Eye (s2)
  // ==================================================================================================================
  const KERR_LIGHT = nrm([0.78, 0.42, 0.3]); // Jupiter is lit by the Eye's disk (off to the lower right of its center)
  function kerrJupiter() {
    return memo('kerr:jup', () => gasGiant({
      r: 900, res: 0.42, halo: 34, seed: 61, tilt: -0.3, spin: 1.2, light: KERR_LIGHT,
      bands: [[0, '#140d09'], [0.22, '#2a1c13'], [0.42, '#4a3426'], [0.6, '#6b4a32'], [0.78, '#7a5a3e'], [1, '#8e7050']],
      amb: 0.035, ambC: [4, 3, 6], wrap: 0.18, limb: 0.3, turb: 0.07,
      atmo: { c: [200, 140, 90], pow: 3.4, str: 0.5, bias: -0.05, halo: 0.2, haloPow: 2.6 },
      storm: { u: 0.58, v: 0.64, r: 0.045, b: 0.9 },
    }));
  }
  function kerrEye() { return memo('kerr:eye', () => paintedHole({ a: 170, b: 45, rs: 40, res: 2, seed: 71, inner: 0.3, doppler: 0.5, gain: 0.82 })); }
  function kerrNebula() {
    return memo('kerr:neb', () => paintNoise(512, 512, [
      { scale: 160, octaves: 5, seed: 81, warp: 0.45, palette: [[0, '#000000', 0], [0.5, '#07050f', 0], [0.75, '#160d28', 0.55], [1, '#26163a', 0.9]] },
      { scale: 90, octaves: 4, seed: 82, ridged: true, op: 'destination-out', alpha: 0.7, palette: [[0, '#000', 0], [0.6, '#000', 0], [1, '#000', 0.85]] },
    ]));
  }
  /** Kerr Station: a broken habitat ring 1,400 px across seen at an angle (painter-sorted faces), spokes, hub */
  const RING = { Ro: 700, Ri: 642, hz: 30, tau: 1.2, w: 1470, h: 640 };
  function kerrRing() {
    return memo('kerr:ring', () => {
      const Ro = RING.Ro, Ri = RING.Ri, hz = RING.hz, ct = Math.cos(RING.tau), st = Math.sin(RING.tau);
      const w = RING.w, h = RING.h, c = cnv(w, h), x = c.getContext('2d'), cx = w / 2, cy = h / 2 + 14, r = SL.makeRng(4242);
      const P = (a, rad, z) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a) * ct - z * st];
      const base = rgb('#2a3044'), LH = nrm([LV[0], LV[1], LV[2] + 1]);
      const shadeCol = (n, mul) => {
        const l = Math.max(0, n[0] * LV[0] + n[1] * LV[1] + n[2] * LV[2]);
        const sp = Math.pow(Math.max(0, n[0] * LH[0] + n[1] * LH[1] + n[2] * LH[2]), 7) * 46;
        const s = (0.2 + 0.85 * l) * (mul || 1);
        return 'rgb(' + Math.round(base[0] * s + sp) + ',' + Math.round(base[1] * s + sp) + ',' + Math.round(base[2] * s + sp * 1.1) + ')';
      };
      const N = 132, G0 = 4.42, G1 = 4.86, lights = [];
      const faces = [];
      for (let k = 0; k < N; k++) {
        const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU, am = (a0 + a1) / 2;
        if (am > G0 && am < G1) continue;
        const sn = Math.sin(am), cs = Math.cos(am);
        faces.push({ d: ((Ro + Ri) / 2) * sn * st + hz * ct, kind: 0, k, a0, a1, am, sn, n: [0, -st, ct] });
        if (sn > 0) faces.push({ d: Ro * sn * st, kind: 1, k, a0, a1, am, sn, n: [cs, sn * ct, sn * st] });
        else faces.push({ d: Ri * sn * st, kind: 2, k, a0, a1, am, sn, n: [-cs, -sn * ct, -sn * st] });
      }
      faces.sort((p, q) => p.d - q.d);
      const win = (a, da, rad, z, dz, lit, warm) => {
        const p = pathOf([P(a - da, rad, z + dz), P(a + da, rad, z + dz), P(a + da, rad, z - dz), P(a - da, rad, z - dz)]);
        x.fillStyle = lit ? (warm ? 'rgba(207,232,255,0.3)' : 'rgba(127,227,255,0.34)') : 'rgba(4,6,10,0.62)';
        x.fill(p);
        if (lit && r.chance(0.35)) { const q = P(a, rad, z); lights.push({ x: q[0] - cx, y: q[1] - cy, f: r.range(0.15, 0.5), ph: r.next() * TAU, r: 7 }); }
      };
      const drawFace = (f) => {
        const { a0, a1, kind } = f;
        let pts;
        if (kind === 0) pts = [P(a0, Ri, hz), P(a0, Ro, hz), P(a1, Ro, hz), P(a1, Ri, hz)];
        else { const rad = kind === 1 ? Ro : Ri; pts = [P(a0, rad, hz), P(a1, rad, hz), P(a1, rad, -hz), P(a0, rad, -hz)]; }
        const p = pathOf(pts);
        x.fillStyle = shadeCol(f.n, f.k % 6 === 0 ? 0.82 : 1);
        x.fill(p);
        x.strokeStyle = 'rgba(0,0,0,0.42)';
        x.lineWidth = 0.8;
        x.stroke(p);
        const da = (a1 - a0) * 0.13;
        if (kind === 0) {
          if (f.k % 3 === 0) {
            const q = pathOf([P(a0 + da, Ri + 10, hz), P(a0 + da, Ro - 10, hz), P(a1 - da, Ro - 10, hz), P(a1 - da, Ri + 10, hz)]);
            x.fillStyle = 'rgba(14,22,44,0.85)';
            x.fill(q);
            x.strokeStyle = 'rgba(120,150,200,0.12)';
            x.stroke(q);
          }
          if (f.k % 2 === 0) win((a0 + a1) / 2, da * 0.6, (Ro + Ri) / 2, hz, 0, r.chance(0.12), false);
        } else if (kind === 1) {
          for (const z of [hz * 0.42, -hz * 0.2]) for (const fr of [0.3, 0.7]) win(a0 + (a1 - a0) * fr, da, Ro + 0.5, z, hz * 0.13, r.chance(0.16), false);
          if (f.k % 11 === 0) {
            const m = pathOf([P(a0, Ro + 1, hz * 0.95), P(a1, Ro + 1, hz * 0.95), P(a1, Ro + 1, -hz * 0.95), P(a0, Ro + 1, -hz * 0.95)]);
            x.fillStyle = 'rgba(0,0,0,0.25)';
            x.fill(m);
          }
        } else {
          for (const z of [hz * 0.5, 0, -hz * 0.5]) for (const fr of [0.25, 0.5, 0.75]) win(a0 + (a1 - a0) * fr, da * 0.8, Ri - 0.5, z, hz * 0.1, r.chance(0.24), r.chance(0.4));
        }
      };
      const spokeA = [0.5, 1.547, 2.594, 3.641, 4.688, 5.735], Rh = 112;
      const drawSpoke = (a) => {
        const broken = a > G0 && a < G1, end = broken ? 380 : Ri;
        for (const z of [9, -9]) {
          const p0 = P(a, Rh, z), p1 = P(a, end, z);
          member(x, p0[0], p0[1], p1[0], p1[1], 7, '#262c3c');
        }
        for (let rr = Rh + 60; rr < end - 20; rr += 90) { const q0 = P(a, rr, 9), q1 = P(a, rr, -9); member(x, q0[0], q0[1], q1[0], q1[1], 3, '#262c3c'); }
        if (broken) {
          const e = P(a, end, 0);
          x.fillStyle = '#10131b';
          x.fill(pathOf(jagPoly(r, e[0], e[1], 14, 10, 7, 0.6)));
          for (let i = 0; i < 3; i++) { const q = P(a + r.range(-0.05, 0.05), end + r.range(40, 140), r.range(-20, 20)); member(x, e[0], e[1], q[0], q[1], 1.6, '#232838'); }
        } else {
          const e = P(a, Ri - 4, 0);
          x.fillStyle = '#1a1e2a';
          x.fillRect(e[0] - 8, e[1] - 8, 16, 16);
        }
      };
      const drawHub = () => {
        const zt = 46, zb = -46, yt = cy - zt * st, yb = cy - zb * st, ry = Rh * ct;
        const body = new Path2D();
        body.moveTo(cx - Rh, yt);
        body.lineTo(cx - Rh, yb);
        body.ellipse(cx, yb, Rh, ry, 0, PI, 0, true);
        body.lineTo(cx + Rh, yt);
        body.closePath();
        const g = x.createLinearGradient(cx - Rh, 0, cx + Rh, 0);
        g.addColorStop(0, '#3a4258'); g.addColorStop(0.25, '#2c3346'); g.addColorStop(0.7, '#191d29'); g.addColorStop(1, '#0d0f16');
        x.fillStyle = g;
        x.fill(body);
        x.fillStyle = 'rgba(0,0,0,0.35)';
        for (let i = 1; i < 4; i++) x.fillRect(cx - Rh, yt + (yb - yt) * (i / 4), Rh * 2, 1.2);
        for (let i = 0; i < 9; i++) {
          const a = PI * (0.08 + i * 0.105), wx = cx - Math.cos(a) * Rh * 0.98;
          x.fillStyle = r.chance(0.4) ? 'rgba(127,227,255,0.3)' : 'rgba(0,0,0,0.5)';
          x.fillRect(wx - 2, yt + 18 + Math.sin(a) * ry, 4, 7);
        }
        const cap = new Path2D();
        cap.ellipse(cx, yt, Rh, ry, 0, 0, TAU);
        bgMetal(x, cap, '#30384c', { x: cx - Rh, y: yt - ry, w: Rh * 2, h: ry * 2 }, { spec: 0.18, li: 0.2 });
        const ring2 = new Path2D();
        ring2.ellipse(cx, yt, Rh * 0.72, ry * 0.72, 0, 0, TAU);
        x.strokeStyle = 'rgba(0,0,0,0.45)';
        x.lineWidth = 2;
        x.stroke(ring2);
        for (let i = 0; i < 4; i++) {
          const a = i * (PI / 2) + 0.4, p0 = [cx + Math.cos(a) * Rh * 0.3, yt + Math.sin(a) * ry * 0.3], p1 = [cx + Math.cos(a) * Rh * 1.25, yt + Math.sin(a) * ry * 1.25];
          member(x, p0[0], p0[1], p1[0], p1[1], 5, '#2a3042');
          const pod = new Path2D();
          pod.ellipse(p1[0], p1[1], 13, 9, 0, 0, TAU);
          bgMetal(x, pod, '#2e3548', { x: p1[0] - 13, y: p1[1] - 9, w: 26, h: 18 });
          lights.push({ x: p1[0] - cx, y: p1[1] - cy, f: r.range(0.6, 1.1), ph: r.next() * TAU, r: 8 });
        }
        const sr = 34, s0 = yt, s1 = cy - 170 * st;
        const spire = new Path2D();
        spire.moveTo(cx - sr, s0); spire.lineTo(cx - sr, s1); spire.ellipse(cx, s1, sr, sr * ct, 0, PI, 0, false); spire.lineTo(cx + sr, s0);
        spire.ellipse(cx, s0, sr, sr * ct, 0, 0, PI, false);
        spire.closePath();
        const g2 = x.createLinearGradient(cx - sr, 0, cx + sr, 0);
        g2.addColorStop(0, '#3c445a'); g2.addColorStop(0.35, '#2a3044'); g2.addColorStop(1, '#0f1219');
        x.fillStyle = g2;
        x.fill(spire);
        const top = new Path2D();
        top.ellipse(cx, s1, sr, sr * ct, 0, 0, TAU);
        bgMetal(x, top, '#353d52', { x: cx - sr, y: s1 - sr * ct, w: sr * 2, h: sr * 2 * ct });
        x.strokeStyle = '#2a3042';
        x.lineWidth = 2;
        x.beginPath(); x.moveTo(cx, s1); x.lineTo(cx + 8, s1 - 60); x.stroke();
        lights.push({ x: 8, y: s1 - 60 - cy, f: 0.5, ph: 0, r: 10 });
      };
      const capEnd = (g, dir) => {
        const pts = [];
        for (let i = 0; i <= 6; i++) pts.push(P(g + dir * r.range(0, 0.035), Ri + (Ro - Ri) * (i / 6), hz));
        for (let i = 0; i <= 5; i++) pts.push(P(g + dir * r.range(0, 0.04), Ro, hz - (2 * hz) * (i / 5)));
        for (let i = 6; i >= 0; i--) pts.push(P(g + dir * r.range(0, 0.03), Ri + (Ro - Ri) * (i / 6), -hz));
        x.fillStyle = '#0e1118';
        x.fill(pathOf(pts));
        x.strokeStyle = 'rgba(150,170,210,0.16)';
        x.lineWidth = 1;
        x.stroke(pathOf(pts));
        for (let i = 0; i < 3; i++) {
          const p0 = P(g, Ri + (Ro - Ri) * r.next(), r.range(-hz, hz)), p1 = P(g + dir * r.range(0.05, 0.12), Ri + r.range(-30, 70), r.range(-50, 30));
          member(x, p0[0], p0[1], p1[0], p1[1], r.range(1.4, 2.6), '#232838');
        }
      };
      for (const f of faces) if (f.sn < 0) drawFace(f);
      capEnd(G0, 1);
      capEnd(G1, -1);
      for (const a of spokeA) if (Math.sin(a) < 0) drawSpoke(a);
      drawHub();
      for (const a of spokeA) if (Math.sin(a) >= 0) drawSpoke(a);
      for (const f of faces) if (f.sn >= 0) drawFace(f);
      // floating wreckage near the break
      for (let i = 0; i < 7; i++) {
        const q = P(r.range(G0 + 0.04, G1 - 0.04), r.range(Ri - 40, Ro + 60), r.range(-60, 60)), s = r.range(5, 14);
        const pts = jagPoly(r, q[0], q[1], s, s * 0.6, 6, 0.5);
        bgMetal(x, pathOf(pts), '#272d3e', boundsOf(pts), { spec: 0.1 });
      }
      c.cx = cx;
      c.cy = cy;
      c.lights = lights.slice(0, 44);
      c.gap = P((G0 + G1) / 2, (Ro + Ri) / 2, 0).map((v, i) => v - (i ? cy : cx));
      return c;
    });
  }
  function kerrFrags() {
    return memo('kerr:frags', () => {
      const out = [];
      for (let i = 0; i < 4; i++) {
        const r = SL.makeRng(990 + i), s = 30 + i * 18, c = cnv(s * 2 + 8, s * 2 + 8), x = c.getContext('2d'), m = s + 4;
        const pts = jagPoly(r, m, m, s, s * r.range(0.45, 0.7), r.int(7, 10), 0.4);
        const p = pathOf(pts);
        bgMetal(x, p, '#2a3044', boundsOf(pts), { spec: 0.16 });
        x.save();
        x.clip(p);
        x.fillStyle = 'rgba(0,0,0,0.4)';
        for (let k = -s; k < s; k += 12) x.fillRect(m + k, m - s, 1, s * 2);
        for (let k = 0; k < 4; k++) { x.fillStyle = r.chance(0.3) ? 'rgba(127,227,255,0.3)' : 'rgba(0,0,0,0.55)'; x.fillRect(m + r.range(-s * 0.6, s * 0.5), m + r.range(-s * 0.3, s * 0.2), 5, 3); }
        x.restore();
        out.push(c);
      }
      return out;
    });
  }
  /** Lagrange wreckage: a station spine section, a torn hab module and a broken solar wing */
  function kerrModule(i) {
    return memo('kerr:mod' + i, () => {
      const r = SL.makeRng(1200 + i);
      if (i === 0) {
        const w = 140, h = 560, c = cnv(w, h), x = c.getContext('2d');
        trussV(x, 10, 20, 120, h - 40, 60, '#1f2433', { cw: 9, dw: 3, hi: '#3a4356' });
        const core = new Path2D();
        core.rect(w / 2 - 20, 0, 40, h);
        bgMetal(x, core, '#2a3044', { x: w / 2 - 20, y: 0, w: 40, h: 80 }, { spec: 0.16 });
        for (let y = 60; y < h - 60; y += r.range(70, 130)) {
          const tk = new Path2D();
          tk.ellipse(w / 2 + (r.chance(0.5) ? -34 : 34), y, 18, 34, 0, 0, TAU);
          bgMetal(x, tk, '#30364a', { x: w / 2 - 52, y: y - 34, w: 104, h: 68 }, { spec: 0.2 });
        }
        x.globalCompositeOperation = 'destination-out';
        x.fill(pathOf([[0, 0], [w, 0], [w, 18 + r.range(0, 30)], [w * 0.6, 34], [w * 0.3, 10], [0, 28]]));
        x.fill(pathOf([[0, h], [w, h], [w, h - 22], [w * 0.55, h - 44], [w * 0.2, h - 16], [0, h - 30]]));
        return c;
      }
      if (i === 1) {
        const w = 110, h = 320, c = cnv(w, h), x = c.getContext('2d');
        const body = new Path2D();
        body.moveTo(15, 40);
        body.quadraticCurveTo(15, 8, w / 2, 8);
        body.quadraticCurveTo(w - 15, 8, w - 15, 40);
        body.lineTo(w - 15, h - 60);
        for (let k = 0; k <= 8; k++) body.lineTo(w - 15 - (k / 8) * (w - 30), h - 60 + r.range(-6, 34));
        body.closePath();
        bgMetal(x, body, '#2c3346', { x: 15, y: 8, w: w - 30, h: h - 40 }, { spec: 0.2, angle: PI });
        x.save();
        x.clip(body);
        x.fillStyle = 'rgba(0,0,0,0.38)';
        for (let y = 50; y < h; y += 46) x.fillRect(0, y, w, 4);
        for (let y = 64; y < h - 70; y += 46) for (let k = 0; k < 4; k++) { x.fillStyle = r.chance(0.12) ? 'rgba(127,227,255,0.28)' : 'rgba(0,0,0,0.5)'; x.fillRect(26 + k * 16, y, 8, 6); }
        x.restore();
        for (let k = 0; k < 4; k++) member(x, 20 + k * 22, h - 50, 20 + k * 22 + r.range(-10, 10), h - 8, 2, '#262c3c');
        return c;
      }
      const w = 250, h = 104, c = cnv(w, h), x = c.getContext('2d');
      const pts = [[6, 10], [w - 8, 6], [w - 30, h - 40], [w * 0.62, h - 8], [8, h - 10]];
      const p = pathOf(pts);
      x.fillStyle = '#0f1424';
      x.fill(p);
      x.save();
      x.clip(p);
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(90,120,190,0.16)'); g.addColorStop(0.5, 'rgba(20,30,60,0)'); g.addColorStop(1, 'rgba(60,90,160,0.08)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(150,170,210,0.16)';
      for (let k = 6; k < w; k += 20) x.fillRect(k, 0, 1, h);
      for (let k = 10; k < h; k += 18) x.fillRect(0, k, w, 1);
      x.restore();
      x.strokeStyle = '#3a4256';
      x.lineWidth = 2;
      x.stroke(p);
      return c;
    });
  }
  const KERR_HOLE = { x: 360, y: -60 };
  function kerrModItem(rng, d) {
    const i = rng.int(0, 2), c = kerrModule(i), left = rng.next() < 0.5;
    const x = left ? rng.range(30, 210) : rng.range(W - 210, W - 30);
    return { c, x, r: c.height * 0.5, par: rng.range(0.42, 0.58), vx: (360 - x) * 0.012, vy: -8, vr: 0, rot: 0, s: rng.range(0.7, 1), a: rng.range(0.75, 1), wob: rng.next() * TAU, draw: drawKerrMod };
  }
  function drawKerrMod(ctx, it, a) {
    const rot = Math.atan2(KERR_HOLE.y - it.y, KERR_HOLE.x - it.x) + PI / 2 + 0.05 * Math.sin(curD.t * 0.4 + it.wob);
    blit(ctx, it.c, it.x, it.y, rot, it.s, a);
  }

  defineBg('bg_kerr', {
    group: 'kerr', seed: 23,
    list: ['approach', 'lensing', 'station', 'boss', 'calm', 'lagrange'],
    defaultPhase: 'approach',
    alias: { menu: 'lensing', danger: 'station', warp: 'approach' },
    knobs: {
      jx: [-200, 0.1], jy: [-250, 0.1], ja: [0.55, 0.22], ex: [540, 0.2], ey: [-330, 0.16], ea: [0, 0.35], lens: [0, 0.4],
      deb: [0.55, 0.5], stars: [1, 0.5], dark: [0, 0.6], vig: [0, 0.8], glow: [0, 0.35], lag: [0, 1], neb: [1, 0.3], dust: [1, 0.5],
    },
    phases: {
      _base: { jx: -200, jy: -250, ja: 0.55, ex: 540, ey: -330, ea: 0, lens: 0, deb: 0.55, stars: 1, dark: 0, vig: 0, glow: 0, lag: 0, neb: 1, dust: 1 },
      approach: {},
      lensing: { jx: -330, jy: -410, ja: 0.45, ey: 175, ea: 1, lens: 1, deb: 0.75 },
      station: { jx: -460, jy: -560, ja: 0.32, ey: 160, ea: 1, lens: 1, deb: 0.95 },
      boss: { jx: -560, jy: -660, ja: 0.24, ey: 140, ea: 0.95, lens: 0.9, deb: 0.8, dark: 1, vig: 1 },
      calm: { jx: -460, jy: -560, ja: 0.3, ey: 160, ea: 0.26, lens: 0.25, deb: 0.3, stars: 1.1 },
      lagrange: { ja: 0, ea: 0, lens: 0, deb: 1, glow: 1, lag: 1, dust: 1.3, neb: 0.8 },
    },
    init(bg, d) {
      const rng = d.rng;
      d.sky = memo('kerr:sky', () => skyCanvas([[0, '#05060d'], [0.55, '#070812'], [1, '#0a0b18']]));
      d.st = [
        memo('kerr:st0', () => starTile({ n: 120, seed: 201, size: [0.35, 0.9], alpha: [0.25, 0.7], colors: ['#ffffff', '#dfe4ff', '#cfd6ff'], glow: 0.1 })),
        memo('kerr:st1', () => starTile({ n: 70, seed: 202, size: [0.5, 1.2], alpha: [0.35, 0.8], colors: ['#ffffff', '#e6eaff', '#fff0dc'], glow: 0.3 })),
        memo('kerr:st2', () => starTile({ n: 28, seed: 203, size: [0.7, 1.5], alpha: [0.45, 0.9], colors: ['#ffffff', '#ffe9cf'], glow: 0.6 })),
      ];
      d.tw = twinkles(rng, 30, { colors: ['#e6eaff', '#ffffff', '#ffe9cf'], size: [2.2, 4], alpha: [0.3, 0.7], par: [0.03, 0.07, 0.14] });
      d.neb = kerrNebula();
      d.jup = kerrJupiter();
      d.eye = kerrEye();
      d.lf = lensField(rng, 150, 230);
      d.dust = dustMake(rng, 16, 1.2);
      d.spiral = spiralMake(rng, 3, 34, debrisSprites('kerr', { lo: '#17131c', hi: '#352e36', rim: '#9a7458', rimStr: 0.55, amb: 0.3, bump: 0.9, plate: '#2c3244' }, 610));
      d.mods = layer({ par: 0.5, gap: [240, 460], margin: 320, max: 7, make: kerrModItem });
      d.ring = null;
      d.chunks = [];
      d.chunkT = 1;
      kerrRing(); kerrFrags(); for (let i = 0; i < 3; i++) kerrModule(i);
    },
    phase(bg, d, ph, prev, snap) {
      if (snap) layerFill(d.mods, d, d.k.lag);
      if (ph === 'station' && (!d.ring || d.ring.mode !== 'pass')) d.ring = { mode: 'pass', x: 330, y: snap ? 520 : -RING.h / 2 - 60, s: 1, ts: 1, a: 1, rot: -0.04 };
      if (ph === 'boss') d.ring = { mode: 'tilt', x: 250, y: 320, s: 0.44, ts: 1, a: snap ? 0.8 : 0, rot: 0.08, t: 0 };
      if (ph === 'lagrange' || ph === 'approach' || ph === 'lensing') d.ring = null;
    },
    update(bg, d, dt) {
      const k = d.k, dy = d.sp * dt;
      twinkleStep(d.tw, dy, d.rng);
      dustStep(d.dust, dy, d.rng);
      lensFieldStep(d.lf, 2.5 * dt, (5 + d.sp * 0.05) * dt, d.rng);
      spiralStep(d.spiral, dt, d.rng, 26 + 30 * k.lag);
      layerStep(d.mods, d, dt, k.lag);
      const R = d.ring;
      if (R) {
        if (R.mode === 'pass') {
          R.y += dy * 0.5;
          R.rot += dt * 0.004;
          if (R.y - RING.h / 2 * R.s > H + 80) d.ring = null;
        } else if (R.mode === 'tilt') {
          R.t += dt;
          R.a = Math.min(d.ph === 'calm' ? R.a : 0.8, R.a + dt * 0.5);
          R.ts = lerp(1, 0.28, sstep(1, 14, R.t));
          R.y -= dt * 4;
          R.s = Math.max(0.3, R.s - dt * 0.004);
          R.rot += dt * 0.01;
          if (d.ph === 'calm') R.a -= dt * 0.25;
          if (R.a <= 0 && d.ph !== 'boss') d.ring = null;
        }
      }
      // chunks breaking off the ring toward the Eye
      const ex = k.ex, ey = k.ey;
      if (d.ring && d.ring.mode === 'pass' && d.chunks.length < 10) {
        d.chunkT -= dt;
        if (d.chunkT <= 0) {
          d.chunkT = d.rng.range(1.8, 3.6);
          const c = kerrRing(), g = c.gap, fr = kerrFrags();
          const sx = d.ring.x + g[0] * d.ring.s + d.rng.range(-60, 60), sy = d.ring.y + g[1] * d.ring.s * d.ring.ts + d.rng.range(-20, 30);
          d.chunks.push({ c: fr[d.rng.int(0, fr.length - 1)], x: sx, y: sy, rot: d.rng.next() * TAU, vr: d.rng.range(-0.5, 0.5), s: d.rng.range(0.4, 0.8), a: 0, life: 0 });
        }
      }
      for (let i = d.chunks.length - 1; i >= 0; i--) {
        const q = d.chunks[i];
        q.life += dt;
        const vx = ex - q.x, vy = ey - q.y, m = Math.hypot(vx, vy) || 1, sp = 18 + q.life * 9;
        q.x += (vx / m) * sp * dt;
        q.y += (vy / m) * sp * dt + dy * 0.12;
        q.rot += q.vr * dt;
        q.s *= Math.exp(-dt * 0.05);
        q.a = Math.min(1, q.life * 0.8) * (1 - sstep(16, 24, q.life));
        if (q.life > 24 || m < 30) d.chunks.splice(i, 1);
      }
      if (k.vig > 0.02 && SL.render.vignette) SL.render.vignette(0.35 + 0.15 * k.vig);
    },
    draw(bg, d, ctx) {
      const k = d.k, t = d.t;
      curD = d;
      camBase(ctx);
      drawSky(ctx, d.sky);
      ctx.globalCompositeOperation = 'source-over';
      tileY(ctx, d.st[0], d.sy * 0.03, -PAD, TILE_W, 0.9 * k.stars);
      ctx.globalCompositeOperation = 'lighter';
      tileY(ctx, d.neb, d.sy * 0.045 + t * 1.5, -PAD, TILE_W, 0.55 * k.neb);
      ctx.globalCompositeOperation = 'source-over';
      tileY(ctx, d.st[1], d.sy * 0.07, -PAD, TILE_W, 0.85 * k.stars);
      tileY(ctx, d.st[2], d.sy * 0.14, -PAD, TILE_W, 0.8 * k.stars);
      ctx.globalCompositeOperation = 'lighter';
      twinkleDraw(ctx, d.tw, t, k.stars);
      ctx.globalCompositeOperation = 'source-over';
      // L2 Jupiter, lit warm from the Eye side
      if (k.ja > 0.01) drawSphere(ctx, d.jup, k.jx + Math.sin(t * 0.03) * 4, k.jy + Math.cos(t * 0.025) * 3, k.ja);
      // L3 Kerr's Eye (painted, with lensed stars)
      const exx = k.ex + Math.sin(t * 0.06) * 8, eyy = k.ey + Math.sin(t * 0.045) * 4;
      if (k.ea > 0.01 && eyy > -200) drawHole(ctx, d.eye, exx, eyy, k.ea, t, '#ff8a5c', d.lf, k.lens, 1);
      // the s2 hole glow (the hazard draws the hole itself and its lens)
      if (k.glow > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        A.drawGlow(ctx, KERR_HOLE.x, KERR_HOLE.y, 560, '#ff7a4a', 0.14 * k.glow);
        A.drawGlow(ctx, KERR_HOLE.x, KERR_HOLE.y, 300, '#ffcf8a', 0.1 * k.glow * (0.9 + 0.1 * Math.sin(t * 1.3)));
        ctx.globalCompositeOperation = 'source-over';
      }
      // L4 debris streams spiraling into the hole
      const cx = lerp(exx, KERR_HOLE.x, k.lag), cy = lerp(k.ey, KERR_HOLE.y, k.lag);
      spiralDraw(ctx, d.spiral, cx, cy, 0.5, k.deb, 1, '#5a3a2c');
      // chunks drifting off the station
      for (const q of d.chunks) blit(ctx, q.c, q.x, q.y, q.rot, q.s, q.a * 0.9);
      // L5 Kerr Station ring
      const R = d.ring;
      if (R && R.a > 0.01) {
        const c = kerrRing();
        if (R.y + RING.h * R.s > -PAD && R.y - RING.h * R.s < H + PAD) {
          ctx.globalAlpha = R.a;
          xf(ctx, R.x, R.y, R.rot, R.s, R.s * R.ts);
          ctx.drawImage(c, -c.cx, -c.cy);
          camBase(ctx);
          ctx.globalCompositeOperation = 'lighter';
          const lg = softGlow('#7fe3ff', 16), cs = Math.cos(R.rot), sn = Math.sin(R.rot);
          for (const L of c.lights) {
            const p = 0.5 + 0.5 * Math.sin(t * L.f * TAU + L.ph), al = R.a * 0.4 * (0.25 + 0.75 * p * p);
            const lx = L.x * R.s, ly = L.y * R.s * R.ts, px = R.x + lx * cs - ly * sn, py = R.y + lx * sn + ly * cs;
            if (py < -20 || py > H + 20 || px < -20 || px > W + 20) continue;
            const rr = L.r * R.s * (0.85 + 0.25 * p);
            ctx.globalAlpha = al;
            ctx.drawImage(lg, px - rr, py - rr, rr * 2, rr * 2);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      // s2 wreckage tilting toward the hole
      layerDraw(ctx, d.mods, 1);
      darken(ctx, 0.15 * k.dark);
      ctx.globalCompositeOperation = 'lighter';
      dustDraw(ctx, d.dust, d.sp, '#b8a8c8', 0.09 * k.dust);
      ctx.globalCompositeOperation = 'source-over';
    },
  });

  // ==================================================================================================================
  // bg_tantalus: the storm canyon of the Tantalus Nebula (m3) and the Boneyard (s3)
  // ==================================================================================================================
  const CW = { w: 300, h: 1024, edge: 182 }; // canyon wall tile; the inner edge sits near x = edge (left wall)
  function periodicEdge(rng, h, n, amp) {
    const fq = [], ph = [], am = [];
    for (let i = 0; i < n; i++) { fq.push(i + 1 + (i > 2 ? rng.int(0, 3) : 0)); ph.push(rng.next() * TAU); am.push((amp * rng.range(0.45, 1)) / (1 + i * 0.6)); }
    const out = new Float32Array(h);
    for (let j = 0; j < h; j++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += am[i] * Math.sin((j / h) * TAU * fq[i] + ph[i]);
      out[j] = s;
    }
    return out;
  }
  const sampW = (f, w, h, u, v) => samp(f, w, h, u - Math.floor(u), v - Math.floor(v));
  /** bright copy of a cloud density field: the billow structure that sheet lightning lights up from inside */
  function litLayer(w, h, dn, n1, col) {
    const c = cnv(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), D = img.data, rc = rgb(col || '#a8c0ff');
    for (let k = 0; k < w * h; k++) {
      const den = dn[k];
      const a = sstep(0.04, 0.45, den) * (0.3 + 0.7 * n1[k]) * (1 - 0.55 * sstep(0.65, 1, den));
      D[k * 4] = rc[0]; D[k * 4 + 1] = rc[1]; D[k * 4 + 2] = rc[2]; D[k * 4 + 3] = a * 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  /** soft volumetric cloud shading (rendered once): dn density 0..1, hg smooth height; lit from the upper left with
      bright thin fringes on the lit side (no contour artifacts: shading comes from the low-frequency height only) */
  function cloudPaint(w, h, dn, hg, o) {
    o = o || {};
    const c = cnv(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), D = img.data;
    const L = o.light || LV, bump = o.bump || 1, wrap = o.wrap != null ? o.wrap : 0.45;
    const body = rgb(o.body || '#0b0a1e'), mid = rgb(o.mid || '#171d3a'), lit = rgb(o.lit || '#34446c'), rim = rgb(o.rim || '#4a5f8a');
    const glow = o.glow ? rgb(o.glow) : null;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i, den = dn[k];
        if (den < 0.008) continue;
        const h0 = hg[k], hl = i > 0 ? hg[k - 1] : h0, hr = i < w - 1 ? hg[k + 1] : h0, hu = j > 0 ? hg[k - w] : h0, hd = j < h - 1 ? hg[k + w] : h0;
        let nx = (hl - hr) * 0.5 * bump, ny = (hu - hd) * 0.5 * bump;
        const m = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        nx *= m; ny *= m;
        const lam = Math.max(0, (nx * L[0] + ny * L[1] + m * L[2] + wrap) / (1 + wrap));
        const fr = 1 - sstep(0.1, 0.75, den), core = sstep(0.35, 1, den);
        const s = 0.5 + 0.7 * lam, l2 = lam * lam * (0.45 - 0.3 * core), rr = fr * (0.25 + 0.75 * lam) * 0.85;
        let R = lerp(mid[0], body[0], core) * s + lit[0] * l2 + rim[0] * rr;
        let G = lerp(mid[1], body[1], core) * s + lit[1] * l2 + rim[1] * rr;
        let B = lerp(mid[2], body[2], core) * s + lit[2] * l2 + rim[2] * rr;
        if (glow && o.glowAt) { const g = o.glowAt(i, j) * core; R += glow[0] * g; G += glow[1] * g; B += glow[2] * g; }
        const p = k * 4;
        D[p] = R; D[p + 1] = G; D[p + 2] = B; D[p + 3] = 255 * sstep(0.01, 0.3, den);
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  /** one canyon wall (side -1 left, 1 right): billowy cloud mass with lit fringes, plus its lit layer for flashes */
  function cloudWall(side, seed) {
    const w = CW.w, h = CW.h, r = SL.makeRng(seed);
    const nS = A.noise(w, h, { scale: 92, octaves: 5, seed, warp: 0.3, gain: 0.52 });
    const nF = A.noise(w, h, { scale: 24, octaves: 3, seed: seed + 1 });
    const nL = A.noise(w, h, { scale: 128, octaves: 3, seed: seed + 2 });
    const edge = periodicEdge(r, h, 7, 44);
    const hg = new Float32Array(w * h), dn = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i, q = side < 0 ? i : w - 1 - i;
        const dd = (CW.edge + edge[j] - q) / 60 + (nS[k] - 0.5) * 2.5 + (nF[k] - 0.5) * 0.7;
        dn[k] = sstep(-0.35, 1.1, dd);
        hg[k] = sstep(-0.35, 1.6, dd) * 34 + nL[k] * 70 + nS[k] * 14;
      }
    }
    return { body: cloudPaint(w, h, dn, hg, { bump: 0.5 }), lit: litLayer(w, h, dn, nL) };
  }
  function tantWalls() {
    return memo('tant:walls', () => ({ L: cloudWall(-1, 3101), R: cloudWall(1, 3203) }));
  }
  function wallX0(side, reach) { return side < 0 ? reach - CW.edge : W - reach - (CW.w - CW.edge); }
  /** eye of the storm: a cloud annulus around a clear circle (r 430), swirled like a cyclone; drawn at 2.5x */
  const EYE = { res: 0.4, span: 1760, Re: 430 };
  function stormEye() {
    return memo('tant:eye', () => {
      const res = EYE.res, S = Math.ceil(EYE.span * res), c0 = S / 2, NW = 320;
      const N = A.noise(NW, NW, { scale: 64, octaves: 5, seed: 333, warp: 0.3, gain: 0.52 });
      const NL = A.noise(NW, NW, { scale: 110, octaves: 3, seed: 334 });
      const hg = new Float32Array(S * S), dn = new Float32Array(S * S);
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const lx = (i + 0.5 - c0) / res, ly = (j + 0.5 - c0) / res, rr = Math.hypot(lx, ly);
          const th = Math.atan2(ly, lx) + rr * 0.0032, u = (Math.cos(th) * rr) / 1300, v = (Math.sin(th) * rr) / 1300;
          const n = sampW(N, NW, NW, u, v), nl = sampW(NL, NW, NW, u, v), k = j * S + i;
          const dd = (rr - EYE.Re) / 140 + (n - 0.5) * 2.2;
          dn[k] = sstep(-0.3, 1.2, dd);
          hg[k] = (sstep(-0.3, 1.8, dd) * 40 + nl * 80 + n * 12) * res;
        }
      }
      return cloudPaint(S, S, dn, hg, { bump: 0.7, mid: '#1a2a4a', lit: '#2f4f7a', rim: '#4a6a9a' });
    });
  }
  /** towering cloud wall at the top of the screen for the boss (900 x 760 logical, drawn at 2x), lit from inside */
  const FRONT = { w: 900, h: 760, res: 0.5 };
  function frontWall() {
    return memo('tant:front', () => {
      const res = FRONT.res, w = Math.ceil(FRONT.w * res), h = Math.ceil(FRONT.h * res), r = SL.makeRng(444);
      const nS = A.noise(w, h, { scale: 56, octaves: 5, seed: 445, warp: 0.3, gain: 0.52 });
      const nF = A.noise(w, h, { scale: 14, octaves: 3, seed: 446 });
      const nL = A.noise(w, h, { scale: 80, octaves: 3, seed: 447 });
      const edge = periodicEdge(r, w, 6, 60);
      const hg = new Float32Array(w * h), dn = new Float32Array(w * h);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const k = j * w + i, ly = j / res, dd = (500 + edge[i] - ly) / 90 + (nS[k] - 0.5) * 2.4 + (nF[k] - 0.5) * 0.6;
          dn[k] = sstep(-0.3, 1.1, dd);
          hg[k] = (sstep(-0.3, 1.8, dd) * 40 + nL[k] * 80 + nS[k] * 12) * res;
        }
      }
      const body = cloudPaint(w, h, dn, hg, {
        bump: 0.7, light: nrm([-0.25, 0.5, 0.8]), glow: '#2a3470',
        glowAt: (i, j) => { const gx = (i / w - 0.5) / 0.32, gy = (j / h - 0.42) / 0.26; return Math.exp(-(gx * gx + gy * gy)) * 0.6; },
      });
      return { body, lit: litLayer(w, h, dn, nL) };
    });
  }
  /** soft 400 px cloud-flash sprite (noise-broken radial glow) */
  function cloudFlash() {
    return memo('tant:flash', () => {
      const S = 200, c = cnv(S, S), x = c.getContext('2d'), img = x.createImageData(S, S), D = img.data;
      const n = A.noise(S, S, { scale: 40, octaves: 5, seed: 555, warp: 0.4 });
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const dx = (i + 0.5 - S / 2) / (S / 2), dy = (j + 0.5 - S / 2) / (S / 2), q = Math.hypot(dx, dy), k = j * S + i;
        const a = Math.pow(Math.max(0, 1 - q), 1.6) * (0.35 + 0.65 * n[k]);
        D[k * 4] = 175; D[k * 4 + 1] = 198; D[k * 4 + 2] = 255; D[k * 4 + 3] = a * 255;
      }
      x.putImageData(img, 0, 0);
      return c;
    });
  }
  function radialMask(S) {
    return memo('tant:mask', () => {
      const c = cnv(S, S), x = c.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, S, S);
      return c;
    });
  }
  /** faint branching bolt polylines (inside the cloud walls only; the real lightning is the ion_storm hazard) */
  const BOLTS = (() => {
    const r = SL.makeRng(777), out = [];
    const walk = (pts, x, y, ang, len, depth) => {
      const seg = [[x, y]];
      for (let l = 0; l < len; l += 14) {
        ang += r.range(-0.55, 0.55);
        x += Math.cos(ang) * 14;
        y += Math.sin(ang) * 14;
        seg.push([x, y]);
        if (depth < 2 && r.chance(0.12)) walk(pts, x, y, ang + r.sign() * r.range(0.4, 0.9), len * r.range(0.25, 0.45), depth + 1);
      }
      pts.push(seg);
    };
    for (let i = 0; i < 6; i++) {
      const pts = [];
      walk(pts, 0, -130, PI / 2 + r.range(-0.3, 0.3), r.range(200, 300), 0);
      out.push(pts);
    }
    return out;
  })();
  function flashEnv(t) {
    if (t < 0) return 0;
    if (t < 0.05) return t / 0.05;
    if (t < 0.12) return 1 - 0.7 * (t - 0.05) / 0.07;
    if (t < 0.18) return 0.3 + 0.7 * (t - 0.12) / 0.06;
    return Math.exp(-(t - 0.18) * 6);
  }
  function tantNebula(i) {
    return memo('tant:neb' + i, () => paintNoise(512, 512, i === 0 ? [
      { scale: 170, octaves: 5, seed: 901, warp: 0.4, palette: [[0, '#070814', 0], [0.4, '#0d1030', 0], [0.65, '#1d2450', 0.6], [0.85, '#27306a', 0.85], [1, '#323c7a', 1]] },
      { scale: 64, octaves: 4, seed: 902, ridged: true, op: 'destination-out', alpha: 0.6, palette: [[0, '#000', 0], [0.6, '#000', 0], [1, '#000', 0.8]] },
    ] : [
      { scale: 150, octaves: 5, seed: 903, warp: 0.45, palette: [[0, '#070814', 0], [0.45, '#1a0f26', 0], [0.68, '#3a1f4d', 0.55], [0.88, '#4a2a60', 0.85], [1, '#5a3470', 1]] },
      { scale: 80, octaves: 4, seed: 904, ridged: true, op: 'destination-out', alpha: 0.55, palette: [[0, '#000', 0], [0.55, '#000', 0], [1, '#000', 0.85]] },
    ]));
  }
  function tantWisps() {
    return memo('tant:wisp', () => paintNoise(256, 512, [
      { scale: 64, octaves: 5, seed: 905, warp: 0.6, palette: [[0, '#000', 0], [0.62, '#1a2440', 0], [0.86, '#33456c', 0.5], [1, '#4a5f8a', 0.8]] },
    ]));
  }
  /** TEMPEST far ahead: a dark dreadnought silhouette (running lights are live) */
  function tempestFar() {
    return memo('tant:tempest', () => {
      const w = 340, h = 150, c = cnv(w, h), x = c.getContext('2d');
      const hull = pathOf([[8, 96], [40, 82], [96, 78], [120, 70], [228, 70], [262, 80], [318, 88], [334, 96], [318, 104], [262, 110], [96, 112], [40, 108]]);
      bgMetal(x, hull, '#17141f', { x: 8, y: 70, w: 326, h: 42 }, { spec: 0.06, li: 0.12, angle: -PI / 2 });
      for (const [sx, top, bw] of [[132, 8, 22], [212, 18, 18]]) {
        const sp = pathOf([[sx - bw, 76], [sx - 5, top + 10], [sx, top], [sx + 5, top + 10], [sx + bw, 76]]);
        bgMetal(x, sp, '#191522', { x: sx - bw, y: top, w: bw * 2, h: 76 - top }, { spec: 0.05, li: 0.12 });
      }
      const eye = new Path2D();
      eye.ellipse(172, 86, 20, 11, 0, 0, TAU);
      bgMetal(x, eye, '#211a2c', { x: 152, y: 75, w: 40, h: 22 }, { spec: 0.1 });
      x.fillStyle = 'rgba(0,0,0,0.4)';
      for (let k = 60; k < 300; k += 26) x.fillRect(k, 84, 1.2, 22);
      c.lights = [[132, 12], [212, 22], [30, 96], [326, 96], [172, 86], [96, 108], [262, 106]];
      return c;
    });
  }
  /** derelict hulks for the Boneyard (340 / 560 / 780 px long), broken in two places, dark, no lights */
  function hulk(i) {
    return memo('tant:hulk' + i, () => {
      const L = [340, 560, 780][i], Hh = [104, 150, 200][i], r = SL.makeRng(700 + i * 31);
      const w = L + 40, h = Hh + 50, c = cnv(w, h), x = c.getContext('2d'), cy = h / 2, x0 = 20, x1 = w - 20;
      const top = [], bot = [];
      const N = 26;
      for (let k = 0; k <= N; k++) {
        const t = k / N, X = lerp(x0, x1, t);
        let p = t < 0.08 ? 0.75 + t * 2.5 : t > 0.78 ? Math.max(0.12, 1 - Math.pow((t - 0.78) / 0.22, 1.6) * 0.88) : 0.95 + 0.05 * Math.sin(t * 19);
        if (Math.abs(t - 0.3) < 0.04 || Math.abs(t - 0.62) < 0.03) p *= 0.82;
        top.push([X, cy - (Hh / 2) * p * r.range(0.97, 1.02)]);
        bot.push([X, cy + (Hh / 2) * p * 0.86 * r.range(0.97, 1.02)]);
      }
      const hullPts = top.concat(bot.reverse());
      const hullP = pathOf(hullPts);
      bgMetal(x, hullP, '#22202e', { x: x0, y: cy - Hh / 2, w: x1 - x0, h: Hh }, { spec: 0.12, li: 0.15, angle: -PI / 2 - 0.4 });
      x.save();
      x.clip(hullP);
      const seams = new Path2D();
      for (let X = x0 + 40; X < x1; X += r.range(36, 64)) { seams.moveTo(X, 0); seams.lineTo(X, h); }
      seams.moveTo(0, cy - Hh * 0.18); seams.lineTo(w, cy - Hh * 0.18);
      seams.moveTo(0, cy + Hh * 0.2); seams.lineTo(w, cy + Hh * 0.2);
      A.panelLines(x, seams, '#000000', 0.5);
      for (let X = x0 + 30; X < x1 - 60; X += 14) if (r.chance(0.6)) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(X, cy - Hh * 0.08, 6, 3); }
      for (let q = 0; q < 5; q++) {
        const bx = r.range(x0, x1), by = cy + r.range(-Hh * 0.3, Hh * 0.3), br = r.range(20, 60);
        const g = x.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      x.restore();
      // engine block with dead nozzles
      for (let q = 0; q < 3; q++) {
        const ny = cy + (q - 1) * Hh * 0.26, np = new Path2D();
        np.ellipse(x0 + 2, ny, 7, Hh * 0.1, 0, 0, TAU);
        bgMetal(x, np, '#1a1824', { x: x0 - 5, y: ny - Hh * 0.1, w: 14, h: Hh * 0.2 });
      }
      // two breaks: cut out jagged wedges, then show ribs inside
      for (const bt of [0.38 + r.range(-0.04, 0.04), 0.66 + r.range(-0.03, 0.03)].slice(0, i === 0 ? 1 : 2)) {
        const bx = lerp(x0, x1, bt), bw = r.range(18, 34) + i * 6, cut = [];
        for (let k = 0; k <= 8; k++) cut.push([bx - bw / 2 + r.range(-12, 12), lerp(-10, h + 10, k / 8)]);
        for (let k = 8; k >= 0; k--) cut.push([bx + bw / 2 + r.range(-12, 12), lerp(-10, h + 10, k / 8)]);
        x.save();
        x.globalCompositeOperation = 'destination-out';
        x.fill(pathOf(cut));
        x.restore();
        x.save();
        x.clip(hullP);
        for (let k = 0; k < 5; k++) {
          const rx = bx + r.range(-bw * 0.6, bw * 0.6);
          member(x, rx, cy - Hh * 0.42, rx + r.range(-10, 10), cy + Hh * 0.36, r.range(1.6, 3), '#2a2736');
        }
        member(x, bx - bw, cy, bx + bw, cy + r.range(-8, 8), 2.4, '#2a2736');
        x.restore();
      }
      rimStroke(x, hullP, { x: x0, y: cy - Hh / 2, w: x1 - x0, h: Hh }, 'rgba(120,130,170,0.28)');
      return c;
    });
  }
  function hulkItem(rng) {
    const i = rng.next() < 0.45 ? 0 : rng.next() < 0.6 ? 1 : 2, c = hulk(i), left = rng.next() < 0.5;
    const x = i === 2 ? rng.range(120, W - 120) : left ? rng.range(-60, 220) : rng.range(W - 220, W + 60);
    return { c, x, r: c.width * 0.5, par: rng.range(0.32, 0.5), vx: rng.range(-4, 4), vy: 0, vr: rng.range(-0.02, 0.02), rot: rng.range(-PI, PI), s: rng.range(0.85, 1), a: rng.range(0.7, 0.9) };
  }
  const SCRATCH = 360;
  function scratchCanvas() { return memo('tant:scratch', () => cnv(SCRATCH, SCRATCH)); }

  defineBg('bg_tantalus', {
    group: 'tant', seed: 31,
    list: ['nebula', 'storm', 'eye', 'boss', 'clear', 'boneyard'],
    defaultPhase: 'nebula',
    alias: { menu: 'nebula', calm: 'clear', danger: 'storm', warp: 'nebula' },
    knobs: {
      reach: [80, 0.45], wallA: [1, 0.5], wdark: [0, 0.6], flash: [0.3, 2], eye: [0, 0.4], front: [0, 0.32], stars: [0.3, 0.5],
      neb: [1, 0.4], hulks: [0, 1], dark: [0, 0.6], vig: [0, 0.8], wisp: [1, 0.5], dust: [1, 0.5],
    },
    phases: {
      _base: { reach: 80, wallA: 1, wdark: 0, flash: 0.3, eye: 0, front: 0, stars: 0.3, neb: 1, hulks: 0, dark: 0, vig: 0, wisp: 1, dust: 1 },
      nebula: {},
      storm: { reach: 110, wdark: 1, flash: 1, stars: 0.22, neb: 0.85, dust: 1.4, wisp: 1.3 },
      eye: { reach: 30, wallA: 0.55, flash: 0, eye: 1, stars: 1, neb: 0.6, wisp: 0.45 },
      boss: { reach: 100, wdark: 0.7, flash: 1.25, front: 1, stars: 0.25, dark: 1, vig: 1 },
      clear: { reach: -150, wallA: 0, flash: 0, stars: 1, neb: 0.75, wisp: 0.35, dust: 0.6 },
      boneyard: { reach: -150, wallA: 0, flash: 0, stars: 0.5, neb: 0.95, hulks: 1, wisp: 0.6 },
    },
    init(bg, d) {
      const rng = d.rng;
      d.sky = memo('tant:sky', () => skyCanvas([[0, '#070814'], [0.6, '#0a0c1b'], [1, '#0d0f22']]));
      d.st = [
        memo('tant:st0', () => starTile({ n: 110, seed: 301, size: [0.4, 1], alpha: [0.3, 0.8], colors: ['#ffffff', '#d8e0ff', '#c8d4ff'], glow: 0.15 })),
        memo('tant:st1', () => starTile({ n: 46, seed: 302, size: [0.6, 1.5], alpha: [0.4, 0.95], colors: ['#ffffff', '#e0e8ff'], glow: 0.5 })),
      ];
      d.tw = twinkles(rng, 26, { colors: ['#dfe6ff', '#ffffff', '#cfd8ff'], size: [2.2, 4], alpha: [0.3, 0.75], par: [0.05, 0.1] });
      d.neb = [tantNebula(0), tantNebula(1)];
      d.wisp = tantWisps();
      d.walls = tantWalls();
      stormEye(); frontWall(); cloudFlash(); radialMask(SCRATCH); tempestFar(); scratchCanvas();
      for (let i = 0; i < 3; i++) hulk(i);
      d.dust = dustMake(rng, 22, 1.25);
      d.hulks = layer({ par: 0.42, gap: [380, 700], margin: 420, max: 5, make: hulkItem });
      d.fl = { t: 9, next: 1.5, side: -1, x: 0, y: 0, b: 0 };
      d.tempest = { t: -1 };
      d.frontY = -FRONT.h;
    },
    phase(bg, d, ph, prev, snap) {
      if (snap) layerFill(d.hulks, d, d.k.hulks);
      if (ph === 'eye') d.tempest = { t: 0 };
    },
    update(bg, d, dt) {
      const k = d.k, dy = d.sp * dt, rng = d.rng;
      twinkleStep(d.tw, dy, rng);
      dustStep(d.dust, dy, rng);
      layerStep(d.hulks, d, dt, k.hulks);
      if (d.tempest.t >= 0) { d.tempest.t += dt; if (d.tempest.t > 14) d.tempest.t = -1; }
      d.frontY = lerp(-FRONT.h - 40, -70, k.front);
      // sheet flashes inside the cloud walls (and inside the boss's cloud wall)
      const F = d.fl;
      F.t += dt;
      if (k.flash > 0.02 && (k.wallA > 0.3 || k.front > 0.5)) {
        F.next -= dt * k.flash;
        if (F.next <= 0) {
          F.next = rng.range(1.5, 3);
          F.t = 0;
          F.b = rng.int(0, BOLTS.length - 1);
          if (k.front > 0.5 && rng.next() < 0.6) {
            F.side = 0;
            F.x = rng.range(60, W - 60);
            F.y = d.frontY + rng.range(140, 360);
          } else {
            F.side = rng.next() < 0.5 ? -1 : 1;
            const inset = rng.range(30, 120), rch = Math.max(40, k.reach);
            F.x = F.side < 0 ? rch - inset : W - rch + inset;
            F.y = rng.range(140, H - 300);
          }
        }
      }
      if (k.vig > 0.02 && SL.render.vignette) SL.render.vignette(0.35 + 0.15 * k.vig);
    },
    draw(bg, d, ctx) {
      const k = d.k, t = d.t;
      curD = d;
      camBase(ctx);
      drawSky(ctx, d.sky);
      ctx.globalCompositeOperation = 'source-over';
      tileY(ctx, d.st[0], d.sy * 0.05, -PAD, TILE_W, k.stars);
      // L2 painted nebula, two sheets counter-drifting at 4 px/s
      ctx.globalCompositeOperation = 'lighter';
      tileXY(ctx, d.neb[0], t * 4, d.sy * 0.06, 1.6, 0.5 * k.neb);
      tileXY(ctx, d.neb[1], -t * 4 + 260, d.sy * 0.08 + 400, 1.45, 0.5 * k.neb);
      ctx.globalCompositeOperation = 'source-over';
      tileY(ctx, d.st[1], d.sy * 0.1, -PAD, TILE_W, k.stars);
      ctx.globalCompositeOperation = 'lighter';
      twinkleDraw(ctx, d.tw, t, k.stars);
      ctx.globalCompositeOperation = 'source-over';
      // TEMPEST far ahead, crossing once inside the eye
      const T = d.tempest;
      if (T.t > 0.8 && T.t < 13 && k.eye > 0.2) {
        const c = tempestFar(), u = (T.t - 0.8) / 12, tx = lerp(-220, W + 220, u), ty = 290 + Math.sin(u * PI) * -30;
        const a = 0.85 * sstep(0.2, 0.6, k.eye);
        blit(ctx, c, tx, ty, -0.04, 0.75, a);
        ctx.globalCompositeOperation = 'lighter';
        const lg = softGlow('#ff5c8a', 12);
        for (let i = 0; i < c.lights.length; i++) {
          const p = 0.5 + 0.5 * Math.sin(t * 1.2 * TAU + i * 1.3), L = c.lights[i];
          ctx.globalAlpha = a * 0.35 * (0.2 + 0.8 * p * p);
          const lx = tx + (L[0] - c.width / 2) * 0.75, ly = ty + (L[1] - c.height / 2) * 0.75;
          ctx.drawImage(lg, lx - 5, ly - 5, 10, 10);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // the eye: a cyclone annulus opening around a calm circle of stars
      if (k.eye > 0.01) {
        const c = stormEye(), sc = (0.6 + 0.4 * k.eye) / EYE.res;
        blit(ctx, c, W / 2, 600, t * 0.012, sc, Math.min(1, k.eye * 1.6));
        camBase(ctx);
      }
      // L3 canyon walls (a far pass and the near pass), 15% darker in the storm
      const WL = d.walls;
      if (k.wallA > 0.01 && k.reach > -140) {
        const aw = k.wallA * (1 - 0.15 * k.wdark);
        ctx.globalAlpha = 1;
        tileY(ctx, WL.R.body, d.sy * 0.42 + 300, wallX0(1, k.reach + 46), CW.w, aw * 0.55);
        tileY(ctx, WL.L.body, d.sy * 0.42 + 700, wallX0(-1, k.reach + 46), CW.w, aw * 0.55);
        tileY(ctx, WL.L.body, d.sy * 0.6, wallX0(-1, k.reach), CW.w, aw);
        tileY(ctx, WL.R.body, d.sy * 0.6 + 512, wallX0(1, k.reach), CW.w, aw);
      }
      // boss: towering cloud wall at the top
      if (k.front > 0.01) {
        const fw = frontWall();
        ctx.globalAlpha = Math.min(1, k.front * 1.5);
        ctx.drawImage(fw.body, W / 2 - FRONT.w / 2, d.frontY, FRONT.w, FRONT.h);
      }
      // sheet lightning lighting the clouds from inside
      const F = d.fl;
      if (F.t < 0.9) {
        const e = flashEnv(F.t), sc = scratchCanvas(), sx = sc.getContext('2d'), half = SCRATCH / 2;
        let src = null, ox = 0, oy = 0, sw = 0, sh = 0, period = 0;
        if (F.side === 0) {
          const fw = frontWall();
          src = fw.lit; ox = W / 2 - FRONT.w / 2; oy = d.frontY; sw = FRONT.w; sh = FRONT.h;
        } else if (k.wallA > 0.05) {
          const wl = F.side < 0 ? WL.L : WL.R;
          src = wl.lit; ox = wallX0(F.side, k.reach); sw = CW.w; sh = CW.h; period = CW.h;
          oy = ((F.side < 0 ? d.sy * 0.6 : d.sy * 0.6 + 512) % CW.h + CW.h) % CW.h;
        }
        if (src && e > 0.01) {
          sx.globalCompositeOperation = 'source-over';
          sx.clearRect(0, 0, SCRATCH, SCRATCH);
          const bx = ox - (F.x - half), by = oy - (F.y - half);
          if (period) for (let yy = by - period * 2; yy < SCRATCH; yy += period) { if (yy + sh > 0) sx.drawImage(src, bx, yy, sw, sh); }
          else sx.drawImage(src, bx, by, sw, sh);
          sx.globalCompositeOperation = 'destination-in';
          sx.drawImage(radialMask(SCRATCH), 0, 0);
          sx.globalCompositeOperation = 'source-over';
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.min(1, 0.34 * e * (F.side === 0 ? 0.8 : 1));
          ctx.drawImage(sc, F.x - half, F.y - half);
          ctx.globalAlpha = 0.12 * e;
          ctx.drawImage(cloudFlash(), F.x - 200, F.y - 200, 400, 400);
          if (F.side !== 0) {
            const B = BOLTS[F.b], lim = F.side < 0 ? Math.max(30, k.reach) - 8 : W - Math.max(30, k.reach) + 8;
            ctx.strokeStyle = '#9fb8ff';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (let pass = 0; pass < 2; pass++) {
              ctx.lineWidth = pass ? 1.2 : 4;
              ctx.globalAlpha = (pass ? 0.24 : 0.07) * e;
              ctx.beginPath();
              for (const seg of B) {
                for (let i = 0; i < seg.length; i++) {
                  let px = F.x + seg[i][0] * (F.side < 0 ? 0.5 : -0.5);
                  px = F.side < 0 ? Math.min(px, lim) : Math.max(px, lim);
                  const py = F.y + seg[i][1];
                  if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
                }
              }
              ctx.stroke();
            }
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      // s3: derelict hulks
      layerDraw(ctx, d.hulks, 1);
      // L4 near wisps
      ctx.globalCompositeOperation = 'lighter';
      tileXY(ctx, d.wisp, -t * 6, d.sy * 1.0, 1.6, 0.15 * k.wisp);
      ctx.globalCompositeOperation = 'source-over';
      darken(ctx, 0.15 * k.dark);
      ctx.globalCompositeOperation = 'lighter';
      dustDraw(ctx, d.dust, d.sp, '#9fb0d8', 0.08 * k.dust);
      ctx.globalCompositeOperation = 'source-over';
    },
  });

  // ==================================================================================================================
  // bg_tarsis: the Nyx harvester mirror array in orbit of the blue giant Tarsis (m4)
  // ==================================================================================================================
  const TST = { x: -100, y: -220, r: 290 }; // the star; only a blazing arc of its limb shows in the corner
  const TMOON = { r: 520, x0: 500, y0: -800, x1: -680, y1: 370 }; // eclipse moon path (over the star at u = 0.5)
  const STRM = { n: 512, R: 1800 };
  function tarsisStar() {
    return memo('tars:star', () => {
      const gran = A.noise(256, 128, { scale: 6, octaves: 3, seed: 401 }), mott = A.noise(128, 64, { scale: 22, octaves: 3, seed: 402 });
      const L = lut([[0, '#2f5fd0'], [0.35, '#7ea8fb'], [0.7, '#cfe0ff'], [1, '#f4f8ff']]);
      return sphere({
        r: TST.r, res: 0.6, flat: true, limb: 0.72,
        surf(u, v, out) {
          const g = samp(gran, 256, 128, u * 3, v), m = samp(mott, 128, 64, u, v);
          lutAt(L, clamp(0.22 + g * 0.55 + (m - 0.5) * 0.55, 0, 1), out);
          return 0;
        },
      });
    });
  }
  function tarsisCorona() {
    return memo('tars:corona', () => {
      const c = cnv(256, 256), x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(79,141,255,1)');
      g.addColorStop(0.22, 'rgba(79,141,255,0.74)');
      g.addColorStop(0.45, 'rgba(79,141,255,0.42)');
      g.addColorStop(0.72, 'rgba(79,141,255,0.15)');
      g.addColorStop(1, 'rgba(79,141,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);
      return c;
    });
  }
  /** coronal streamers: a polar fan of soft rays around the star (drawn rotating 1 deg/s) */
  function tarsisStreamers() {
    return memo('tars:streamers', () => {
      const N = STRM.n, c = cnv(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), D = img.data;
      const r = SL.makeRng(411), K = [], P = [], Am = [];
      for (let i = 0; i < 9; i++) { K.push(r.int(3, 26)); P.push(r.next() * TAU); Am.push(r.range(0.4, 1)); }
      let as = 0;
      for (const a of Am) as += a;
      const wisp = A.noise(256, 64, { scale: 10, octaves: 4, seed: 412 });
      const half = N / 2, sc = STRM.R / half, r0 = TST.r * 0.98, cA = [79, 141, 255], cB = [196, 218, 255];
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const dx = (i + 0.5 - half) * sc, dy = (j + 0.5 - half) * sc, rho = Math.hypot(dx, dy);
          if (rho < r0 || rho > STRM.R) continue;
          const th = Math.atan2(dy, dx);
          let ray = 0;
          for (let q = 0; q < 9; q++) ray += Am[q] * (0.5 + 0.5 * Math.cos(K[q] * th + P[q]));
          ray = Math.pow(ray / as, 2.2);
          const lr = Math.log(rho / r0);
          const w = samp(wisp, 256, 64, th / TAU + 0.5 + lr * 0.03, clamp(lr / 2, 0, 1));
          const f = Math.pow(r0 / rho, 0.9) * (1 - sstep(0.65, 1, rho / STRM.R)) * sstep(r0, r0 * 1.1, rho);
          const I = clamp(ray * (0.3 + 1.2 * w) * f * 2.6, 0, 1), m = I * I, p = (j * N + i) * 4;
          D[p] = cA[0] + (cB[0] - cA[0]) * m;
          D[p + 1] = cA[1] + (cB[1] - cA[1]) * m;
          D[p + 2] = cA[2] + (cB[2] - cA[2]) * m;
          D[p + 3] = 255 * I;
        }
      }
      x.putImageData(img, 0, 0);
      return c;
    });
  }
  /** a prominence: a low, wispy plasma arch standing on its base line (sprite "up" = outward) */
  function tarsisLoop(i) {
    return memo('tars:loop' + i, () => {
      const r = SL.makeRng(420 + i), w = 260, h = 120, c = cnv(w, h), x = c.getContext('2d');
      x.globalCompositeOperation = 'lighter';
      x.lineCap = 'round';
      x.shadowColor = '#4f8dff';
      x.shadowBlur = 18;
      for (let s = 0; s < 6; s++) {
        const j = s / 5 - 0.5, x0 = 40 + j * 30 + r.range(-8, 8), x1 = w - 40 + j * 26 + r.range(-8, 8);
        const top = 34 + r.range(-6, 16) + Math.abs(j) * 26, lean = r.range(-30, 30);
        x.strokeStyle = s === 2 ? '#dbe8ff' : '#8fb6ff';
        x.globalAlpha = s === 2 ? 0.22 : 0.1 + 0.08 * r.next();
        x.lineWidth = s === 2 ? 1.6 : r.range(2.5, 6);
        x.beginPath();
        x.moveTo(x0, h - 2);
        x.bezierCurveTo(x0 - 6 + lean, top, x1 + 6 + lean, top + r.range(-10, 10), x1, h - 2);
        x.stroke();
      }
      // a few torn wisps lifting off the top of the arch
      x.lineWidth = 1.4;
      for (let s = 0; s < 4; s++) {
        x.globalAlpha = 0.08;
        x.strokeStyle = '#a8c6ff';
        const sx = r.range(w * 0.3, w * 0.7), sy = r.range(36, 56);
        x.beginPath();
        x.moveTo(sx, sy);
        x.quadraticCurveTo(sx + r.range(-30, 30), sy - r.range(14, 30), sx + r.range(-40, 40), sy - r.range(20, 34));
        x.stroke();
      }
      return c;
    });
  }
  const PROMS = [[0.6, 0, 1.0, 0.0], [0.95, 1, 0.78, 1.7], [1.24, 2, 1.12, 3.1], [1.5, 0, 0.7, 4.4]];
  /** coronal field lines: limb angle a, limb angle b, apex distance (from the star center) */
  const FILS = [[0.2, 1.25, 1150], [0.55, 1.5, 900], [0.05, 0.85, 1320], [0.9, 1.75, 1250], [0.35, 1.05, 700], [1.2, 1.62, 820]];
  const DASH = [26, 150], NODASH = [];
  function filamentsDraw(ctx, t, a) {
    if (a <= 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const r0 = TST.r - 4;
    for (let i = 0; i < FILS.length; i++) {
      const F = FILS[i], ext = F[2] * (1 + 0.05 * Math.sin(t * 0.21 + i * 1.7)), am = (F[0] + F[1]) / 2 + 0.04 * Math.sin(t * 0.13 + i);
      const x1 = TST.x + Math.cos(F[0]) * r0, y1 = TST.y + Math.sin(F[0]) * r0;
      const x2 = TST.x + Math.cos(F[1]) * r0, y2 = TST.y + Math.sin(F[1]) * r0;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(TST.x + Math.cos(am) * ext, TST.y + Math.sin(am) * ext, x2, y2);
      ctx.setLineDash(NODASH);
      ctx.strokeStyle = '#4f8dff';
      ctx.globalAlpha = Math.min(1, 0.04 * a);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#7fb6ff';
      ctx.globalAlpha = Math.min(1, 0.05 * a);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.setLineDash(DASH);
      ctx.lineDashOffset = -t * (40 + i * 9);
      ctx.globalAlpha = Math.min(1, 0.13 * a);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.setLineDash(NODASH);
    ctx.lineDashOffset = 0;
    ctx.globalCompositeOperation = 'source-over';
  }
  /** plasma ribbon texture, two periods wide so a source rect never wraps */
  const STRIP = { w: 512, h: 64 };
  function tarsisStrip() {
    return memo('tars:strip', () => {
      const TW = STRIP.w, TH = STRIP.h, one = cnv(TW, TH), ox = one.getContext('2d'), img = ox.createImageData(TW, TH), D = img.data;
      const n1 = A.noise(TW, TH, { scale: 48, octaves: 4, seed: 441 }), n2 = A.noise(TW, TH, { scale: 14, octaves: 3, seed: 442 });
      for (let j = 0; j < TH; j++) {
        const v = ((j + 0.5) / TH) * 2 - 1;
        for (let i = 0; i < TW; i++) {
          const k = j * TW + i, a = n1[k], b = n2[k], vv = v - (n1[32 * TW + i] - 0.5) * 0.55;
          const core = Math.exp(-(vv * vv) / 0.03), body = Math.exp(-(v * v) / 0.3) * (0.5 + 0.5 * clamp(a * b * 2.2, 0, 1));
          const I = clamp(core * 0.9 + body * 0.85, 0, 1), p = k * 4;
          D[p] = 79 + (226 - 79) * core;
          D[p + 1] = 141 + (238 - 141) * core;
          D[p + 2] = 255;
          D[p + 3] = 255 * I;
        }
      }
      ox.putImageData(img, 0, 0);
      const c = cnv(TW * 2, TH), x = c.getContext('2d');
      x.drawImage(one, 0, 0);
      x.drawImage(one, TW, 0);
      return c;
    });
  }
  const SP_PTS = new Float32Array(2 * 25);
  /** textured plasma ribbon along a quadratic curve (flows from (x0, y0) toward (x1, y1) as flow decreases) */
  function streamDraw(ctx, x0, y0, cx, cy, x1, y1, w0, w1, a, flow) {
    if (a <= 0.01) return;
    const tex = tarsisStrip(), TW = STRIP.w, N = 24;
    for (let i = 0; i <= N; i++) {
      const u = i / N, m = 1 - u;
      SP_PTS[i * 2] = m * m * x0 + 2 * m * u * cx + u * u * x1;
      SP_PTS[i * 2 + 1] = m * m * y0 + 2 * m * u * cy + u * u * y1;
    }
    ctx.globalCompositeOperation = 'lighter';
    let s = flow % TW;
    if (s < 0) s += TW;
    for (let i = 0; i < N; i++) {
      const ax = SP_PTS[i * 2], ay = SP_PTS[i * 2 + 1], bx = SP_PTS[i * 2 + 2], by = SP_PTS[i * 2 + 3];
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 0.5) continue;
      const u = (i + 0.5) / N, wd = lerp(w0, w1, u) * (0.8 + 0.2 * Math.sin(u * PI));
      const sw = Math.min(TW, L * 0.6);
      ctx.globalAlpha = Math.min(1, a * sstep(0, 0.14, u) * (1 - 0.45 * sstep(0.8, 1, u)));
      xf(ctx, (ax + bx) / 2, (ay + by) / 2, Math.atan2(by - ay, bx - ax), 1, 1);
      ctx.drawImage(tex, s, 0, sw, STRIP.h, -L / 2, -wd / 2, L, wd);
      s += sw;
      if (s >= TW) s -= TW;
    }
    camBase(ctx);
    ctx.globalCompositeOperation = 'source-over';
  }
  /** the SUNEATER far ahead: a collector dish facing the star on a trailing spindle (lights drawn live) */
  const EAT_AX = 0.66;
  function tarsisEater() {
    return memo('tars:eater', () => {
      const w = 160, h = 120, c = cnv(w, h), x = c.getContext('2d'), ca = Math.cos(EAT_AX), sa = Math.sin(EAT_AX), lights = [];
      x.translate(w / 2, h / 2);
      x.rotate(EAT_AX);
      const body = pathOf([[-4, -8], [40, -6], [62, -2], [67, 0], [62, 2], [40, 6], [-4, 8]]);
      const finA = pathOf([[12, -6], [34, -27], [41, -25], [30, -5]]), finB = pathOf([[12, 6], [34, 27], [41, 25], [30, 5]]);
      bgMetal(x, finA, '#16161f', { x: 12, y: -27, w: 29, h: 22 }, { li: 0.2 });
      bgMetal(x, finB, '#16161f', { x: 12, y: 5, w: 29, h: 22 }, { li: 0.2 });
      bgMetal(x, body, '#1c1c28', { x: -4, y: -8, w: 71, h: 16 }, { li: 0.24, spec: 0.16 });
      x.strokeStyle = 'rgba(255,47,109,0.3)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(6, 0);
      x.lineTo(57, 0);
      x.stroke();
      const g = x.createRadialGradient(-12, -6, 2, -8, 0, 32);
      g.addColorStop(0, '#30406a');
      g.addColorStop(0.55, '#151a28');
      g.addColorStop(1, '#090a11');
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(-8, 0, 11, 31, 0, 0, TAU);
      x.fill();
      x.lineWidth = 1.5;
      x.strokeStyle = 'rgba(127,170,255,0.55)';
      x.beginPath();
      x.ellipse(-8, 0, 11, 31, 0, PI * 0.55, PI * 1.45);
      x.stroke();
      x.strokeStyle = 'rgba(6,6,12,0.9)';
      x.beginPath();
      x.ellipse(-8, 0, 11, 31, 0, -PI * 0.45, PI * 0.45);
      x.stroke();
      for (const p of [[22, 0], [38, 0], [54, 0], [-8, -30], [-8, 30], [36, -25]]) {
        lights.push({ x: p[0] * ca - p[1] * sa, y: p[0] * sa + p[1] * ca, f: 0.5 + lights.length * 0.17, ph: lights.length * 1.3, r: 5 });
      }
      c.lights = lights;
      c.mx = -8 * ca;
      c.my = -8 * sa;
      return c;
    });
  }
  function tarsisNebula() {
    return memo('tars:neb', () => paintNoise(512, 512, [
      { scale: 170, octaves: 5, seed: 481, warp: 0.5, palette: [[0, '#000000', 0], [0.45, '#050a18', 0], [0.72, '#0d1b3a', 0.5], [1, '#1b3160', 0.85]] },
      { scale: 80, octaves: 4, seed: 482, ridged: true, op: 'destination-out', alpha: 0.6, palette: [[0, '#000', 0], [0.6, '#000', 0], [1, '#000', 0.8]] },
    ]));
  }
  /** eclipse moon: dark near side with faint relief (the backlit rim is drawn live, oriented to the star) */
  function tarsisMoon() {
    return memo('tars:moon', () => {
      const n = A.noise(256, 128, { scale: 20, octaves: 5, seed: 461 }), cr = A.noise(256, 128, { scale: 9, octaves: 3, seed: 462, ridged: true });
      const L = lut([[0, '#05070c'], [0.5, '#0a0d16'], [1, '#171c2a']]);
      return sphere({
        r: TMOON.r, res: 0.5, light: nrm([0.62, 0.3, 0.72]), amb: 0.5, wrap: 0.4, bump: 1.4,
        surf(u, v, out) {
          const a = samp(n, 256, 128, u, v), b = samp(cr, 256, 128, u * 2, v);
          lutAt(L, clamp(a * 0.8 + b * 0.3 - 0.05, 0, 1), out);
          return a * 3 + b * 2;
        },
      });
    });
  }
  /** backlit rim around the moon: dir = true is brightest toward +x (rotated to face the star), else uniform */
  function tarsisRim(dir) {
    return memo('tars:rim' + (dir ? 'd' : 'u'), () => {
      const R = TMOON.r * 0.5, S = Math.ceil((R + 44) * 2), c = cnv(S, S), x = c.getContext('2d'), img = x.createImageData(S, S), D = img.data, h = S / 2;
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const dx = i + 0.5 - h, dy = j + 0.5 - h, q = (Math.hypot(dx, dy) - R) / 6;
          if (q < -1.2 || q > 7) continue;
          const f = dir ? 0.12 + 0.88 * Math.pow(Math.max(0, dx / Math.max(1, Math.hypot(dx, dy))), 2.4) : 1;
          const I = (q < 0 ? Math.exp(-q * q * 6) : Math.exp(-q * 0.7) * 0.85 + Math.exp(-q * q * 4) * 0.15) * f;
          const p = (j * S + i) * 4;
          D[p] = 176; D[p + 1] = 208; D[p + 2] = 255; D[p + 3] = 255 * clamp(I, 0, 1);
        }
      }
      x.putImageData(img, 0, 0);
      c.res = 0.5;
      return c;
    });
  }
  /** flare shafts: a fan of hard-edged light wedges from the canvas' left middle; the gaps are crisp shadows */
  function tarsisShafts() {
    return memo('tars:shafts', () => {
      const w = 512, h = 512, c = cnv(w, h), x = c.getContext('2d'), r = SL.makeRng(451);
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(244,248,255,0.95)');
      g.addColorStop(0.45, 'rgba(170,200,255,0.5)');
      g.addColorStop(1, 'rgba(79,141,255,0)');
      x.fillStyle = g;
      let a = -0.45;
      while (a < 0.45) {
        const wd = r.range(0.025, 0.085), gap = r.range(0.012, 0.055);
        x.globalAlpha = r.range(0.4, 1);
        x.beginPath();
        x.moveTo(0, h / 2);
        x.lineTo(w * 1.2 * Math.cos(a), h / 2 + w * 1.2 * Math.sin(a));
        x.lineTo(w * 1.2 * Math.cos(a + wd), h / 2 + w * 1.2 * Math.sin(a + wd));
        x.closePath();
        x.fill();
        a += wd + gap;
      }
      return c;
    });
  }
  function tarsisBand() {
    return memo('tars:band', () => {
      const c = cnv(4, 96), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 96);
      g.addColorStop(0, 'rgba(143,179,255,0)');
      g.addColorStop(0.36, 'rgba(143,179,255,0.45)');
      g.addColorStop(0.5, 'rgba(214,230,255,1)');
      g.addColorStop(0.64, 'rgba(143,179,255,0.45)');
      g.addColorStop(1, 'rgba(143,179,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 4, 96);
      return c;
    });
  }

  // ---- harvester mirror array: honeycomb clusters of hexagonal mirrors on dark trusses
  const HEXR3 = Math.sqrt(3), LIGHT_ANG = Math.atan2(-0.8, -0.6);
  function hexPts(cx, cy, R) {
    const p = [];
    for (let i = 0; i < 6; i++) { const a = (i * PI) / 3; p.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
    return p;
  }
  const MIR_LAYOUTS = [
    { R: 60, cells: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] },
    { R: 76, cells: [[0, -2], [0, -1], [0, 0], [0, 1]], spine: true },
    { R: 66, cells: [[0, 0], [1, 0], [2, -1], [0, 1], [1, 1], [-1, 1]] },
    { R: 100, cells: [[0, 0]], arm: true },
    { R: 54, cells: [[0, 0], [1, 0], [1, -1], [2, -1], [2, -2], [3, -2]], spine: false },
  ];
  function mirrorCluster(i) {
    return memo('tars:mir' + i, () => {
      const Ly = MIR_LAYOUTS[i], R = Ly.R, Rs = R + 7, rng = SL.makeRng(430 + i);
      let cen = Ly.cells.map((q) => [1.5 * Rs * q[0], HEXR3 * Rs * (q[1] + q[0] / 2)]);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const c of cen) { x0 = Math.min(x0, c[0] - R); x1 = Math.max(x1, c[0] + R); y0 = Math.min(y0, c[1] - R); y1 = Math.max(y1, c[1] + R); }
      const bx = (x0 + x1) / 2, by = (y0 + y1) / 2;
      cen = cen.map((c) => [c[0] - bx, c[1] - by]);
      const ext = Ly.spine || Ly.arm ? 150 : 30;
      const w = Math.ceil(x1 - x0 + 40), h = Math.ceil(y1 - y0 + ext * 2 + 20), c = cnv(w, h), x = c.getContext('2d');
      x.translate(w / 2, h / 2);
      const metal = '#222a38', lights = [], glass = new Path2D();
      // back structure: spine truss, mount arm, struts between neighbours
      if (Ly.spine) trussV(x, -14, -h / 2 + 6, 28, h - 12, 36, metal, { cw: 7, dw: 2.6 });
      if (Ly.arm) {
        trussV(x, -12, 0, 24, h / 2 - 6, 30, metal, { cw: 6, dw: 2.4 });
        x.fillStyle = '#151a24';
        x.beginPath();
        x.arc(0, h / 2 - 26, 20, 0, TAU);
        x.fill();
      }
      x.lineCap = 'round';
      for (let a = 0; a < cen.length; a++) {
        for (let b = a + 1; b < cen.length; b++) {
          if (Math.hypot(cen[a][0] - cen[b][0], cen[a][1] - cen[b][1]) < HEXR3 * Rs * 1.05) member(x, cen[a][0], cen[a][1], cen[b][0], cen[b][1], 5, metal);
        }
      }
      for (const cc of cen) {
        const pts = hexPts(cc[0], cc[1], R), path = pathOf(pts), b = { x: cc[0] - R, y: cc[1] - R, w: 2 * R, h: 2 * R };
        bgMetal(x, path, '#2a3242', b, { li: 0.3, spec: 0.2 });
        const gi = hexPts(cc[0], cc[1], R - 7), gp = pathOf(gi);
        const g = x.createLinearGradient(cc[0] - R, cc[1] - R, cc[0] + R * 0.7, cc[1] + R * 0.9);
        g.addColorStop(0, '#2a4169');
        g.addColorStop(0.36, '#1a2438');
        g.addColorStop(0.78, '#070a12');
        g.addColorStop(1, '#0e1526');
        x.fillStyle = g;
        x.fill(gp);
        x.save();
        x.clip(gp);
        const hl = x.createRadialGradient(cc[0] - R * 0.42, cc[1] - R * 0.42, 0, cc[0] - R * 0.42, cc[1] - R * 0.42, R * 0.75);
        hl.addColorStop(0, 'rgba(150,185,245,0.2)');
        hl.addColorStop(1, 'rgba(150,185,245,0)');
        x.fillStyle = hl;
        x.fillRect(cc[0] - R, cc[1] - R, 2 * R, 2 * R);
        // segment grid (three directions) and soft reflection streaks
        x.strokeStyle = 'rgba(143,179,255,0.07)';
        x.lineWidth = 1;
        for (let dir = 0; dir < 3; dir++) {
          const ang = (dir * PI) / 3, ca = Math.cos(ang), sa = Math.sin(ang);
          x.beginPath();
          for (let o = -R; o <= R; o += R / 3.2) {
            x.moveTo(cc[0] + ca * -R * 1.2 - sa * o, cc[1] + sa * -R * 1.2 + ca * o);
            x.lineTo(cc[0] + ca * R * 1.2 - sa * o, cc[1] + sa * R * 1.2 + ca * o);
          }
          x.stroke();
        }
        x.translate(cc[0], cc[1]);
        x.rotate(-0.75);
        x.fillStyle = '#8fb3ff';
        x.globalAlpha = 0.1;
        x.fillRect(rng.range(-R * 0.45, R * 0.05), -R * 1.3, R * 0.2, R * 2.6);
        x.globalAlpha = 0.06;
        x.fillRect(rng.range(R * 0.15, R * 0.5), -R * 1.3, R * 0.07, R * 2.6);
        x.globalAlpha = 0.16;
        x.fillRect(-R * 1.2, -R * 0.62, R * 2.4, 1.2);
        x.restore();
        // inner bevel lit from the upper left, emissive trim on the shaded edges
        x.lineWidth = 1.4;
        for (let e = 0; e < 6; e++) {
          const p0 = gi[e], p1 = gi[(e + 1) % 6], lit = Math.cos((e + 0.5) * (PI / 3) - LIGHT_ANG);
          x.strokeStyle = lit > 0 ? 'rgba(176,200,240,' + (0.32 * lit).toFixed(3) + ')' : 'rgba(0,0,0,' + (0.55 * -lit).toFixed(3) + ')';
          x.beginPath();
          x.moveTo(p0[0], p0[1]);
          x.lineTo(p1[0], p1[1]);
          x.stroke();
        }
        x.strokeStyle = 'rgba(127,182,255,0.28)';
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(gi[0][0], gi[0][1]);
        x.lineTo(gi[1][0], gi[1][1]);
        x.lineTo(gi[2][0], gi[2][1]);
        x.stroke();
        rimStroke(x, path, b, 'rgba(160,185,225,0.42)');
        // glass path for the live sheen, node caps and blinking lights at two corners
        const sub = pathOf(gi);
        glass.addPath(sub);
        for (let q = 0; q < 2; q++) {
          const v = pts[rng.int(0, 5)];
          x.fillStyle = '#151a24';
          x.beginPath();
          x.arc(v[0], v[1], 4.5, 0, TAU);
          x.fill();
          lights.push({ x: v[0], y: v[1], f: rng.range(0.25, 0.7), ph: rng.next() * TAU, r: 8 });
        }
      }
      c.glass = glass;
      c.lights = lights;
      return c;
    });
  }
  function mirrorItem(rng, d) {
    const i = rng.int(0, MIR_LAYOUTS.length - 1), m = mirrorCluster(i), mid = d.k.mirC > 0.5 && rng.next() < 0.3;
    const left = rng.next() < lerp(0.1, 0.45, d.k.mirC);
    const x = mid ? rng.range(240, 480) : left ? rng.range(-150, 40 + 100 * d.k.mirC) : rng.range(560, 790);
    const s = rng.range(0.72, 1.02);
    return { draw: drawMirror, m, x, y: 0, r: Math.max(m.width, m.height) * 0.5 * s, par: 0.45 * rng.range(0.94, 1.08), rot: rng.range(-0.28, 0.28), vr: rng.range(-0.01, 0.01), s, ph: rng.range(0, 1200), a: mid ? 0.8 : 1 };
  }
  const BAND_ANG = -0.75, BAND_NX = Math.cos(BAND_ANG + PI / 2), BAND_NY = Math.sin(BAND_ANG + PI / 2);
  function drawMirror(ctx, it, a) {
    const m = it.m, d = curD, t = d.t;
    blit(ctx, m, it.x, it.y, it.rot, it.s, a);
    const sh = 0.18 * a * d.k.sheen * (1 + 0.15 * d.k.flare);
    if (sh > 0.01) {
      // one coherent glint wave sweeping across the whole array (phase from screen position)
      const per = 760, ph = ((((it.x * 0.55 + it.y * 0.8 - t * 150) % per) + per) % per) - per / 2;
      ctx.save();
      xf(ctx, it.x, it.y, it.rot, it.s, it.s);
      ctx.clip(m.glass);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = sh > 1 ? 1 : sh;
      xf(ctx, it.x + BAND_NX * ph, it.y + BAND_NY * ph, BAND_ANG, 1, 1);
      ctx.drawImage(tarsisBand(), -500, -40, 1000, 80);
      ctx.restore();
    }
    camBase(ctx);
    drawLights(ctx, it, m.lights, t, softGlow('#8fb3ff', 14), a, 0.35);
  }
  function flareFrom() {
    const hz = SL.world && SL.world.hazards;
    if (hz) {
      for (let i = hz.length - 1; i >= 0; i--) {
        const h = hz[i];
        if (h.dead || h.typeId !== 'solar_flare') continue;
        const f = (h.data && (h.data.from || h.data.side)) || h.from || (h.params && h.params.from);
        if (f === 'left' || f === 'right' || f === 'top') return f;
      }
    }
    return null;
  }
  function liveBoss() {
    const b = SL.game && SL.game.boss;
    return b && !b.dead && isFinite(b.x) && isFinite(b.y) ? b : null;
  }
  const FLARE_HOLD = 1.7; // a 'flare' phase reverts to the phase it interrupted after this long (setPhase('flare') again to extend)

  defineBg('bg_tarsis', {
    group: 'tars', seed: 41,
    list: ['corona', 'eclipse', 'mirrors', 'flare', 'boss', 'calm'],
    defaultPhase: 'corona',
    alias: { menu: 'corona', danger: 'mirrors', warp: 'corona' },
    knobs: {
      cor: [1, 1.0], str: [1, 1.0], fil: [1, 0.6], mir: [0.45, 0.6], mirC: [0, 0.5], strm: [1, 0.5], thick: [0, 0.4],
      flare: [0, 5], stars: [1, 0.6], dark: [0, 0.6], vig: [0, 0.8], dust: [1, 0.5], sheen: [1, 0.8],
    },
    phases: {
      _base: { cor: 1, str: 1, fil: 1, mir: 0.45, mirC: 0, strm: 1, thick: 0, flare: 0, stars: 1, dark: 0, vig: 0, dust: 1, sheen: 1 },
      corona: {},
      eclipse: { cor: 0.4, str: 0.4, fil: 0.45, strm: 0.5, stars: 1.6, sheen: 0.35, dust: 0.7 },
      mirrors: { mir: 1, mirC: 1, sheen: 1.15, dust: 1.2 },
      flare: { flare: 1 },
      boss: { mir: 0.55, thick: 1, fil: 1.3, dark: 1, vig: 1, cor: 1.1 },
      calm: { cor: 0.85, str: 0.8, fil: 0.6, mir: 0.35, strm: 0, stars: 1.25, dust: 0.6 },
    },
    init(bg, d) {
      const rng = d.rng;
      d.sky = memo('tars:sky', () => skyCanvas([[0, '#04070f'], [0.5, '#060c1a'], [1, '#081226']]));
      d.st = [
        memo('tars:st0', () => starTile({ n: 70, seed: 471, size: [0.4, 1], alpha: [0.3, 0.8], colors: ['#ffffff', '#dfe8ff', '#cfdcff'], glow: 0.15 })),
        memo('tars:st1', () => starTile({ n: 30, seed: 472, size: [0.6, 1.4], alpha: [0.4, 0.9], colors: ['#ffffff', '#e4ecff'], glow: 0.4 })),
      ];
      d.tw = twinkles(rng, 18, { colors: ['#dfe8ff', '#ffffff'], size: [2.2, 3.6], alpha: [0.25, 0.6], par: [0.03, 0.07] });
      d.star = tarsisStar();
      d.strm = tarsisStreamers();
      tarsisCorona(); tarsisStrip(); tarsisEater(); tarsisMoon(); tarsisRim(true); tarsisRim(false); tarsisShafts(); tarsisBand();
      for (let i = 0; i < 3; i++) tarsisLoop(i);
      for (let i = 0; i < MIR_LAYOUTS.length; i++) mirrorCluster(i);
      d.dust = dustMake(rng, 18, 1.2);
      d.mirs = layer({ par: 0.45, gap: [240, 480], margin: 380, max: 8, make: mirrorItem });
      d.moon = { on: false, lv: false, t: 0, lt: 0, u: 0, u0: 0 };
      d.eat = { x: 486, y: 236 };
      d.eatIt = { x: 0, y: 0, rot: 0, s: 1 };
      d.neb = tarsisNebula();
      d.bossW = 0;
      d.flT = 0;
      d.flPrev = null;
      d.flSrc = null;
    },
    phase(bg, d, ph, prev, snap) {
      if (snap) layerFill(d.mirs, d, d.k.mir);
      if (ph === 'flare') {
        if (prev && prev !== 'flare') d.flPrev = prev;
        d.flT = 0;
        d.flSrc = flareFrom();
        d.flSeed = d.rng.range(0, TAU);
        applyPhase(d, d.S.phases, d.flPrev || 'corona', snap);
        d.kt.flare = 1;
        if (snap) d.k.flare = 1;
      }
      const M = d.moon;
      if (ph === 'eclipse' && (!M.on || M.lv)) {
        M.on = true;
        M.lv = false;
        M.t = snap ? 3.2 : 0;
      } else if (ph !== 'eclipse' && ph !== 'flare' && M.on && !M.lv) {
        M.lv = true;
        M.lt = 0;
        M.u0 = M.u;
      }
    },
    update(bg, d, dt) {
      const k = d.k, dy = d.sp * dt;
      twinkleStep(d.tw, dy, d.rng);
      dustStep(d.dust, dy, d.rng);
      layerStep(d.mirs, d, dt, k.mir);
      const M = d.moon;
      if (M.on) {
        if (!M.lv) {
          M.t += dt;
          const f = Math.min(1, M.t / 3.2);
          M.u = 0.5 * (1 - Math.pow(1 - f, 3)) + 0.0035 * Math.max(0, M.t - 3.2);
        } else {
          M.lt += dt;
          const f = Math.min(1, M.lt / 6);
          M.u = lerp(M.u0, 1, f * f);
          if (f >= 1) M.on = false;
        }
      }
      const b = liveBoss();
      d.bossW = clamp(d.bossW + dt * (b && k.thick > 0.4 ? 0.5 : -0.5), 0, 1);
      if (d.ph === 'flare') {
        d.flT += dt;
        if (d.flT > FLARE_HOLD) enter(bg, d.flPrev || 'corona', false);
      }
      if (k.vig > 0.02 && SL.render.vignette) SL.render.vignette(0.35 + 0.15 * k.vig);
    },
    draw(bg, d, ctx) {
      const k = d.k, t = d.t;
      curD = d;
      camBase(ctx);
      drawSky(ctx, d.sky);
      tileY(ctx, d.st[0], d.sy * 0.03, -PAD, TILE_W, 0.4 * k.stars);
      tileY(ctx, d.st[1], d.sy * 0.07, -PAD, TILE_W, 0.4 * k.stars);
      ctx.globalCompositeOperation = 'lighter';
      twinkleDraw(ctx, d.tw, t, 0.55 * k.stars);
      // L2 corona glow (#4f8dff 0.35 -> 0 over r 900) and streamers rotating 1 deg/s, over a faint reflection nebula
      const cor = k.cor * (1 + 0.15 * k.flare);
      tileXY(ctx, d.neb, t * 2, d.sy * 0.02, 1.7, 0.5 * Math.min(1.1, 0.4 + 0.6 * cor));
      ctx.globalAlpha = Math.min(1, 0.35 * cor);
      ctx.drawImage(tarsisCorona(), TST.x - 900, TST.y - 900, 1800, 1800);
      const ss = (STRM.R * 2) / STRM.n;
      ctx.globalAlpha = Math.min(1, 0.2 * cor * k.str);
      xf(ctx, TST.x, TST.y, t * (PI / 180), ss, ss);
      ctx.drawImage(d.strm, -STRM.n / 2, -STRM.n / 2);
      camBase(ctx);
      ctx.globalAlpha = 1;
      A.drawGlow(ctx, TST.x, TST.y, TST.r * 2.1, '#6fa2ff', 0.4 * cor);
      // the star's limb and its prominences
      ctx.globalCompositeOperation = 'source-over';
      drawSphere(ctx, d.star, TST.x, TST.y, 1);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < PROMS.length; i++) {
        const P = PROMS[i], br = 0.5 + 0.5 * Math.sin(t * 0.35 + P[3]), ang = P[0] + 0.02 * Math.sin(t * 0.1 + P[3]);
        const c = tarsisLoop(P[1]), s = P[2] * (0.9 + 0.12 * br), off = TST.r - 6 + (c.height / 2 - 4) * s;
        blit(ctx, c, TST.x + Math.cos(ang) * off, TST.y + Math.sin(ang) * off, ang + PI / 2, s, (0.5 + 0.3 * br) * Math.min(1, cor));
      }
      camBase(ctx);
      // L3 plasma filaments
      filamentsDraw(ctx, t, k.fil * Math.min(1.2, cor));
      // far plasma stream from the limb to the SUNEATER (or into the live boss)
      if (k.strm > 0.01) {
        let ex = d.eat.x + Math.sin(t * 0.05) * 12, ey = d.eat.y + Math.cos(t * 0.04) * 6;
        const b = liveBoss();
        if (b && d.bossW > 0) { ex = lerp(ex, b.x, d.bossW); ey = lerp(ey, b.y, d.bossW); }
        const al = Math.atan2(ey - TST.y, ex - TST.x), sx = TST.x + Math.cos(al) * (TST.r - 12), sy = TST.y + Math.sin(al) * (TST.r - 12);
        const cx = (sx + ex) / 2 - Math.sin(al) * 150, cy = (sy + ey) / 2 + Math.cos(al) * 150;
        streamDraw(ctx, sx, sy, cx, cy, ex, ey, lerp(46, 84, k.thick), lerp(14, 40, k.thick), 0.25 * k.strm * (1 + 0.25 * k.thick), -t * lerp(70, 150, k.thick));
        const ea = k.strm * (1 - d.bossW);
        if (ea > 0.01) {
          const E = tarsisEater(), it = d.eatIt;
          it.x = ex - E.mx;
          it.y = ey - E.my;
          ctx.globalAlpha = 1;
          A.drawGlow(ctx, ex, ey, 30, '#7fb6ff', 0.25 * ea);
          blit(ctx, E, it.x, it.y, 0, 1, ea);
          camBase(ctx);
          drawLights(ctx, it, E.lights, t, softGlow('#ff5c8a', 12), ea, 0.32);
        }
      }
      // eclipse moon sliding across the star, rim-lit by the corona behind it
      const M = d.moon;
      if (M.on) {
        const mx = lerp(TMOON.x0, TMOON.x1, M.u), my = lerp(TMOON.y0, TMOON.y1, M.u);
        const dist = Math.hypot(mx - TST.x, my - TST.y), cov = 1 - sstep(TMOON.r - TST.r, TMOON.r + TST.r + 200, dist), tot = 1 - sstep(20, 140, dist);
        ctx.globalCompositeOperation = 'source-over';
        drawSphere(ctx, tarsisMoon(), mx, my, 1);
        ctx.globalCompositeOperation = 'lighter';
        const rs = 2;
        if (cov * (1 - tot) > 0.01) {
          const rc = tarsisRim(true);
          blit(ctx, rc, mx, my, Math.atan2(TST.y - my, TST.x - mx), rs, 0.8 * cov * (1 - tot));
        }
        if (tot > 0.01) blit(ctx, tarsisRim(false), mx, my, 0, rs, 0.7 * tot * (0.92 + 0.08 * Math.sin(t * 1.3)));
        camBase(ctx);
        ctx.globalCompositeOperation = 'source-over';
      }
      // L4 harvester mirror array
      layerDraw(ctx, d.mirs, 1);
      // flare: crisp light shafts sweeping in from the flare edge, and a 15% brighter wash
      if (k.flare > 0.01) {
        const src = d.flSrc;
        let ox = TST.x, oy = TST.y, ang = Math.atan2(H / 2 - TST.y, W / 2 - TST.x);
        if (src === 'left') { ox = -700; oy = H / 2; ang = 0; } else if (src === 'right') { ox = W + 700; oy = H / 2; ang = PI; } else if (src === 'top') { ox = W / 2; oy = -700; ang = PI / 2; }
        ang += 0.16 * Math.sin(d.flT * 0.9 + (d.flSeed || 0));
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, 0.16 * k.flare);
        xf(ctx, ox, oy, ang, 5.2, 5.2);
        ctx.drawImage(tarsisShafts(), 0, -256);
        camBase(ctx);
        ctx.globalAlpha = Math.min(1, 0.05 * k.flare);
        ctx.fillStyle = '#4f8dff';
        ctx.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
      darken(ctx, 0.14 * k.dark);
      ctx.globalCompositeOperation = 'lighter';
      dustDraw(ctx, d.dust, d.sp, '#9fc2ff', 0.07 * k.dust);
      ctx.globalCompositeOperation = 'source-over';
    },
  });

  // ==================================================================================================================
  // bg_tartarus: the Tartarus Rift and the OUROBOROS parked between two black holes (m5); the Collapsar Foundry (s4)
  // ==================================================================================================================
  const TRF = { w: 560, h: 1024, hw: 130 }; // the rift tile: a jagged vertical tear ~260 px wide, seamless vertically
  const RIFT_X = 360;
  /** periodic piecewise-linear noise (sharp kinks read as a torn edge); oct [[spacing px, amplitude px], ...] */
  function zigzag(rng, h, oct) {
    const out = new Float32Array(h);
    for (const o of oct) {
      const n = Math.max(2, Math.round(h / o[0])), pts = [];
      for (let i = 0; i < n; i++) pts.push(rng.range(-1, 1) * o[1]);
      for (let j = 0; j < h; j++) {
        const f = (j / h) * n, i0 = Math.floor(f), tt = f - i0, a = pts[i0 % n];
        out[j] += a + (pts[(i0 + 1) % n] - a) * tt;
      }
    }
    return out;
  }
  /** The rift (rendered once): body = starless interior #2a0f3f (opaque) with a violet spill on the void around it;
      rim = pink emissive edge light (drawn 'lighter' at alpha <= 0.25); vein = interior filaments that pulse;
      xl / xr = the torn edges per row (rim sparks ride them). */
  function riftTile() {
    return memo('tart:rift', () => {
      const w = TRF.w, h = TRF.h, r = SL.makeRng(5101), NW = 280, NH = 512;
      const mid = periodicEdge(r, h, 3, 30), wid = periodicEdge(r, h, 4, 0.13);
      const oct = [[96, 15], [36, 8], [13, 3.6], [5, 1.3]];
      const jl = zigzag(r, h, oct), jr = zigzag(r, h, oct);
      const nI = A.noise(NW, NH, { scale: 64, octaves: 5, seed: 5102, warp: 0.6, gain: 0.55 });
      const nV = A.noise(NW, NH, { scale: 44, octaves: 4, seed: 5103, ridged: true });
      const nF = A.noise(NW, NH, { scale: 8, octaves: 3, seed: 5104 });
      const nR = A.noise(32, 256, { scale: 12, octaves: 3, seed: 5105 });
      const xl = new Float32Array(h), xr = new Float32Array(h);
      for (let j = 0; j < h; j++) {
        const c = w / 2 + mid[j], hw = TRF.hw * (1 + wid[j]);
        xl[j] = c - hw + jl[j];
        xr[j] = c + hw + jr[j];
      }
      const mk = () => { const c = cnv(w, h), x = c.getContext('2d'); return { c, x, img: x.createImageData(w, h) }; };
      const Bo = mk(), Ri = mk(), Ve = mk(), B = Bo.img.data, R = Ri.img.data, V = Ve.img.data;
      const cEdge = rgb('#3a1652'), cCore = rgb('#2a0f3f'), cDeep = rgb('#0a070f'), cPink = rgb('#ff5c8a'), cVein = rgb('#8a3ca6');
      for (let j = 0; j < h; j++) {
        const v = j / h;
        for (let i = 0; i < w; i++) {
          const u = i / w, p = (j * w + i) * 4;
          const dl = i + 0.5 - xl[j], dr = xr[j] - i - 0.5, side = dl < dr ? 0 : 1;
          const din = Math.min(dl, dr) + (sampW(nF, NW, NH, u, v) - 0.5) * 6;
          const hot = 0.5 + 0.9 * sampW(nR, 32, 256, side * 0.5 + 0.2, v);
          const I = Math.min(1, (gauss(din / 1.3) + (din > 0 ? 0.4 * Math.exp(-din / 9) : 0.5 * Math.exp(din / 24))) * hot);
          R[p] = cPink[0] * I; R[p + 1] = cPink[1] * I; R[p + 2] = cPink[2] * I; R[p + 3] = 255;
          V[p + 3] = 255;
          const spill = 0.42 * Math.exp(Math.min(0, din) / 60);
          if (din <= -0.5) {
            B[p] = cCore[0]; B[p + 1] = cCore[1]; B[p + 2] = cCore[2]; B[p + 3] = 255 * spill;
            continue;
          }
          const aIn = clamp(din + 0.5, 0, 1), n = sampW(nI, NW, NH, u, v), nv = sampW(nV, NW, NH, u * 2.2, v);
          // the abyss: #2a0f3f along the torn edges, falling to near-black in the depth, with faint violet nebulosity
          const e = sstep(0, 20, din), q = sstep(8, 64, din) * (0.5 + 0.5 * sstep(0.25, 0.75, 1 - n));
          const sh = 0.72 + 0.56 * n;
          B[p] = lerp(lerp(cEdge[0], cCore[0], e), cDeep[0], q) * sh;
          B[p + 1] = lerp(lerp(cEdge[1], cCore[1], e), cDeep[1], q) * sh;
          B[p + 2] = lerp(lerp(cEdge[2], cCore[2], e), cDeep[2], q) * sh;
          B[p + 3] = 255 * (aIn + (1 - aIn) * spill);
          const fI = sstep(0.86, 0.98, nv) * sstep(3, 22, din) * (1 - 0.7 * sstep(30, 90, din)) * (0.3 + 0.7 * n);
          V[p] = cVein[0] * fI; V[p + 1] = cVein[1] * fI; V[p + 2] = cVein[2] * fI;
        }
      }
      Bo.x.putImageData(Bo.img, 0, 0);
      Ri.x.putImageData(Ri.img, 0, 0);
      Ve.x.putImageData(Ve.img, 0, 0);
      return { body: Bo.c, rim: Ri.c, vein: Ve.c, xl, xr, w, h };
    });
  }
  /** rift column at x, scaled sx about x, content scrolled down by off; returns the first tile top */
  function riftDraw(ctx, T, x, sx, off, aB, aR, aV) {
    const h = T.h;
    let y0 = off % h;
    if (y0 < 0) y0 += h;
    while (y0 > -PAD) y0 -= h;
    if (sx < 0.004) return y0;
    xf(ctx, x, 0, 0, sx, 1);
    ctx.globalCompositeOperation = 'source-over';
    if (aB > 0.003) { ctx.globalAlpha = Math.min(1, aB); for (let y = y0; y < H + PAD; y += h) ctx.drawImage(T.body, -T.w / 2, y); }
    ctx.globalCompositeOperation = 'lighter';
    if (aR > 0.003) { ctx.globalAlpha = Math.min(1, aR); for (let y = y0; y < H + PAD; y += h) ctx.drawImage(T.rim, -T.w / 2, y); }
    if (aV > 0.003) { ctx.globalAlpha = Math.min(1, aV); for (let y = y0; y < H + PAD; y += h) ctx.drawImage(T.vein, -T.w / 2, y); }
    camBase(ctx);
    ctx.globalCompositeOperation = 'source-over';
    return y0;
  }
  /** energy sparks crawling along the torn edges */
  function riftSparks(ctx, T, d, x, sx, y0, a) {
    if (a < 0.01 || sx < 0.05) return;
    const g = softGlow('#ff5c8a', 12);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < d.rsp.length; i++) {
      const s = d.rsp[i], jj = Math.min(T.h - 1, Math.floor(s.j));
      const px = x + ((s.side < 0 ? T.xl[jj] : T.xr[jj]) - T.w / 2) * sx;
      const fl = 0.5 + 0.5 * Math.sin(d.t * s.f + s.ph);
      ctx.globalAlpha = Math.min(1, a * s.a * fl * fl);
      const sw = 7 * s.s, sh = 24 * s.s;
      for (let y = y0 + s.j; y < H + 20; y += T.h) if (y > -20) ctx.drawImage(g, px - sw / 2, y - sh / 2, sw, sh);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  const BURST = (() => { const r = SL.makeRng(5601), a = []; for (let i = 0; i < 46; i++) a.push(r.next() * TAU, r.range(0.6, 1.4), r.next()); return a; })();
  /** radial warp streaks (the punch through the tear) */
  function burstDraw(ctx, x, y, f, a) {
    if (a < 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#e8d6ff';
    ctx.lineCap = 'round';
    for (let i = 0; i < BURST.length; i += 3) {
      const ang = BURST[i], sp = BURST[i + 1], ph = BURST[i + 2];
      const r0 = 70 + 820 * ((f * sp + ph) % 1), r1 = r0 + 50 + 300 * f * sp;
      ctx.globalAlpha = Math.min(1, a * (0.2 + 0.3 * ph));
      ctx.lineWidth = 1 + 2.2 * ph;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
      ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ binary backdrop (two painted holes, art only)
  function tartHoles() {
    return memo('tart:holes', () => [
      paintedHole({ a: 64, b: 17, rs: 15, res: 2, seed: 5201, inner: 0.32, doppler: 0.55, gain: 0.78, ring: '#d9ccff',
        colors: [[0, '#fff4e0'], [0.18, '#ffcf8a'], [0.55, '#b0643a'], [1, '#1a0805']] }),
      paintedHole({ a: 52, b: 14, rs: 12, res: 2, seed: 5202, inner: 0.32, doppler: 0.55, gain: 0.78, ring: '#d9ccff',
        colors: [[0, '#ffe6d6'], [0.18, '#ff8a5c'], [0.55, '#9a3a26'], [1, '#160404']] }),
    ]);
  }
  /** faint circumbinary dust ring: ellipse annulus (480 x 144 logical), additive, the far half dimmer */
  function tartBinRing() {
    return memo('tart:bring', () => {
      const w = 540, h = 180, c = cnv(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), D = img.data;
      const n = A.noise(256, 32, { scale: 22, octaves: 4, seed: 5203 }), c1 = rgb('#ff8a5c'), c2 = rgb('#ffcf8a');
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const dx = (i + 0.5 - w / 2) / 240, dy = (j + 0.5 - h / 2) / 72, rho = Math.hypot(dx, dy), p = (j * w + i) * 4;
          const nn = samp(n, 256, 32, Math.atan2(dy, dx) / TAU + 0.5, clamp((rho - 0.7) / 0.6, 0, 1));
          const I = gauss((rho - 1) / 0.15) * (0.25 + 0.9 * nn) * (dy > 0 ? 1 : 0.5) + gauss((rho - 0.78) / 0.05) * 0.25 * nn;
          D[p] = lerp(c1[0], c2[0], nn) * I; D[p + 1] = lerp(c1[1], c2[1], nn) * I; D[p + 2] = lerp(c1[2], c2[2], nn) * I; D[p + 3] = 255;
        }
      }
      x.putImageData(img, 0, 0);
      return c;
    });
  }
  /** one painted hole with its disk tilted by rot and scaled by sc, with hot spots orbiting in the disk plane */
  function holeDraw(ctx, E, x, y, sc, rot, a, t, glowC) {
    ctx.globalCompositeOperation = 'lighter';
    A.drawGlow(ctx, x, y, E.a * 1.7 * sc, glowC, 0.11 * a);
    xf(ctx, x, y, rot, sc, sc);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, a * 1.3);
    ctx.drawImage(E.shadow, -E.w / 2, -E.h / 2, E.w, E.h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, a * (0.92 + 0.08 * Math.sin(t * 1.9)));
    ctx.drawImage(E.emis, -E.w / 2, -E.h / 2, E.w, E.h);
    const hs = softGlow('#ffe2b0', 16);
    for (let i = 0; i < 3; i++) {
      const ps = t * (1.7 - i * 0.32) + i * 2.1, rr = 0.45 + i * 0.15;
      const hx = Math.cos(ps) * E.a * rr, hy = Math.sin(ps) * E.b * rr;
      if (hy < 0 && Math.hypot(hx, hy) < E.rs * 1.05) continue;
      ctx.globalAlpha = Math.min(1, a * 0.22 * (1 - 0.5 * Math.cos(ps)));
      ctx.drawImage(hs, hx - 9, hy - 4.5, 18, 9);
    }
    camBase(ctx);
    ctx.globalCompositeOperation = 'source-over';
  }
  const BIN_PERIOD = 40; // s per mutual orbit (GDD 4.5)
  function binDraw(ctx, d, t) {
    const k = d.k, a = k.bin;
    if (a < 0.01) return;
    const E = tartHoles(), sc = k.binS, cx = k.binX, cy = k.binY;
    const ph = (t * TAU) / BIN_PERIOD + 0.6, c = Math.cos(ph), s = Math.sin(ph), rx = 92 * sc, ry = 30 * sc;
    ctx.globalCompositeOperation = 'lighter';
    A.drawGlow(ctx, cx, cy, 250 * sc, '#ff8a5c', 0.05 * a);
    A.drawGlow(ctx, cx, cy, 120 * sc, '#ffcf8a', 0.04 * a);
    blit(ctx, tartBinRing(), cx, cy, -0.12, sc, 0.42 * a * (0.9 + 0.1 * Math.sin(t * 0.5)));
    camBase(ctx);
    ctx.globalCompositeOperation = 'source-over';
    const p0x = cx + c * rx * 0.42, p0y = cy + s * ry * 0.42, p1x = cx - c * rx * 0.58, p1y = cy - s * ry * 0.58;
    const near0 = s > 0; // lower on screen = nearer; the far hole is drawn first
    for (let q = 0; q < 2; q++) {
      const i = (q === 0) === near0 ? 1 : 0, z = i === 0 ? s : -s;
      holeDraw(ctx, E[i], i === 0 ? p0x : p1x, i === 0 ? p0y : p1y, sc * (1 + 0.07 * z), -0.12, a * (0.88 + 0.12 * z), t + i * 2.3, i === 0 ? '#ffcf8a' : '#ff8a5c');
    }
  }

  // ------------------------------------------------------------------ Nyx megastructures (L4)
  /** offset polygon around a polyline (width w0 at the start, w1 at the end) */
  function ribbonPoly(pts, w0, w1) {
    const L = [], R = [], n = pts.length;
    for (let k = 0; k < n; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const m = Math.hypot(tx, ty) || 1;
      tx /= m;
      ty /= m;
      const hw = lerp(w0, w1, k / (n - 1)) / 2;
      L.push([pts[k][0] - ty * hw, pts[k][1] + tx * hw]);
      R.push([pts[k][0] + ty * hw, pts[k][1] - tx * hw]);
    }
    return L.concat(R.reverse());
  }
  /** Nyx spire: a faceted needle stepping wider toward its base (lit left facet, dark right facet), collars with
      fins, a dashed seam beside the ridge (emissive layer c.e), blinking collar lights */
  function tartSpire(i) {
    return memo('tart:spire' + i, () => {
      const w = [96, 122, 80][i], h = [560, 690, 450][i], P = 24, r = SL.makeRng(5300 + i * 11);
      const c = cnv(w + P * 2, h + P * 2), x = c.getContext('2d'), e = cnv(w + P * 2, h + P * 2), ex = e.getContext('2d');
      x.translate(P, P);
      ex.translate(P, P);
      const cx = w / 2;
      const prof = [[0, 0], [0.15, 0.13], [0.16, 0.22], [0.185, 0.18], [0.41, 0.3], [0.42, 0.42], [0.445, 0.36], [0.67, 0.46],
        [0.68, 0.56], [0.705, 0.5], [0.9, 0.5], [0.93, 0.36], [1, 0.14]];
      const Lp = [], Rp = [];
      for (const q of prof) { Lp.push([cx - q[1] * w, q[0] * h]); Rp.push([cx + q[1] * w, q[0] * h]); }
      Lp.push([cx, h]);
      Rp.push([cx, h]);
      const sil = new Path2D();
      sil.moveTo(cx, 0);
      for (const q of prof) sil.lineTo(cx + q[1] * w, q[0] * h);
      sil.lineTo(cx, h);
      for (let k = prof.length - 1; k >= 0; k--) sil.lineTo(cx - prof[k][1] * w, prof[k][0] * h);
      sil.closePath();
      bgMetal(x, pathOf(Lp), '#1f2130', boundsOf(Lp), { li: 0.36, spec: 0.13, specPos: 0.26 });
      bgMetal(x, pathOf(Rp), '#0e0f16', boundsOf(Rp), { li: 0.16, spec: 0.05, rl: 0.45 });
      // ribs, collar bands and fins
      x.save();
      x.clip(sil);
      for (let y = 18; y < h; y += 22 + r.int(0, 8)) {
        x.fillStyle = 'rgba(0,0,0,0.32)';
        x.fillRect(0, y, w, 1);
        x.fillStyle = 'rgba(150,160,200,0.06)';
        x.fillRect(0, y + 1, w, 1);
      }
      const lights = [];
      for (const ci of [2, 6, 10]) {
        const y0 = prof[ci - 1][0] * h, y1 = prof[ci + 1][0] * h + 2;
        const g = x.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, 'rgba(150,160,200,0.3)');
        g.addColorStop(0.3, 'rgba(40,42,58,0.2)');
        g.addColorStop(1, 'rgba(0,0,0,0.65)');
        x.fillStyle = g;
        x.fillRect(0, y0, w, y1 - y0);
        ex.strokeStyle = '#ff2f6d';
        ex.lineWidth = 1.3;
        ex.beginPath();
        ex.moveTo(cx - prof[ci][1] * w * 0.8, y1 - 1.5);
        ex.lineTo(cx + prof[ci][1] * w * 0.8, y1 - 1.5);
        ex.stroke();
        lights.push({ x: -prof[ci][1] * w - 14, y: y0 + 34 - h / 2, f: r.range(0.4, 0.9), ph: r.next() * TAU, r: 7 });
        lights.push({ x: prof[ci][1] * w + 14, y: y0 + 34 - h / 2, f: r.range(0.4, 0.9), ph: r.next() * TAU, r: 6 });
      }
      x.strokeStyle = 'rgba(170,180,215,0.24)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(cx - 0.6, 3);
      x.lineTo(cx - 0.6, h - 3);
      x.stroke();
      x.restore();
      for (const ci of [2, 6, 10]) {
        const y0 = prof[ci][0] * h, hw = prof[ci][1] * w, fl = 16 + ci * 1.4;
        const FL = [[cx - hw + 2, y0], [cx - hw - fl, y0 + 40], [cx - hw + 4, y0 + 26]];
        const FR = [[cx + hw - 2, y0], [cx + hw + fl, y0 + 40], [cx + hw - 4, y0 + 26]];
        bgMetal(x, pathOf(FL), '#22253a', boundsOf(FL), { li: 0.3, spec: 0.1, edge: 0.6, rl: 0.7 });
        bgMetal(x, pathOf(FR), '#0f1018', boundsOf(FR), { li: 0.14, spec: 0.04, edge: 0.6, rl: 0.3 });
      }
      // dashed seam beside the ridge, with a soft halo pass
      for (let pass = 0; pass < 2; pass++) {
        ex.strokeStyle = pass ? '#ff2f6d' : 'rgba(255,47,109,0.35)';
        ex.lineWidth = pass ? 1.3 : 4;
        ex.lineCap = 'round';
        const rs = SL.makeRng(5390 + i);
        ex.beginPath();
        for (let y = 26; y < h - 30;) {
          const L2 = rs.range(18, 46);
          ex.moveTo(cx + 2.2, y);
          ex.lineTo(cx + 2.2, Math.min(h - 30, y + L2));
          y += L2 + rs.range(16, 40);
        }
        ex.stroke();
      }
      lights.push({ x: 0, y: -h / 2 + 8, f: 0.5, ph: 0, r: 9 });
      c.e = e;
      c.lights = lights;
      return c;
    });
  }
  /** Nyx pylon: a forked emitter mast (hexagonal hub, tapered shaft, two curved prongs with emitter knobs) */
  function tartPylon(i) {
    return memo('tart:pylon' + i, () => {
      const w = 236, h = [430, 360][i], P = 22, spread = [80, 66][i];
      const c = cnv(w + P * 2, h + P * 2), x = c.getContext('2d'), e = cnv(w + P * 2, h + P * 2), ex = e.getContext('2d');
      x.translate(P, P);
      ex.translate(P, P);
      const cx = w / 2, fy = h * 0.56, lights = [], tips = [];
      const sh = [[cx - 14, fy], [cx + 14, fy], [cx + 21, h - 44], [cx - 21, h - 44]];
      bgMetal(x, pathOf(sh), '#1b1d29', boundsOf(sh), { li: 0.3, spec: 0.12 });
      for (let y = fy + 16; y < h - 50; y += 18) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(cx - 18, y, 36, 1.2); }
      for (const sd of [-1, 1]) {
        const pts = [], N = 18, p0 = [cx + sd * 6, fy + 10], p1 = [cx + sd * (spread + 16), fy - 30], p2 = [cx + sd * spread, 24];
        for (let k = 0; k <= N; k++) {
          const t = k / N, a0 = (1 - t) * (1 - t), a1 = 2 * (1 - t) * t, a2 = t * t;
          pts.push([a0 * p0[0] + a1 * p1[0] + a2 * p2[0], a0 * p0[1] + a1 * p1[1] + a2 * p2[1]]);
        }
        const poly = ribbonPoly(pts, 16, 7);
        bgMetal(x, pathOf(poly), sd < 0 ? '#1e2030' : '#11121a', boundsOf(poly), { li: sd < 0 ? 0.34 : 0.16, spec: sd < 0 ? 0.12 : 0.05, edge: 0.8 });
        // emitter knob
        const kx = p2[0], ky = p2[1] - 4, g = x.createRadialGradient(kx - 3, ky - 3, 1, kx, ky, 11);
        g.addColorStop(0, '#4a4d64');
        g.addColorStop(0.5, '#1d1f2c');
        g.addColorStop(1, '#07080c');
        x.fillStyle = g;
        x.beginPath();
        x.arc(kx, ky, 10, 0, TAU);
        x.fill();
        ex.fillStyle = '#ff2f6d';
        ex.beginPath();
        ex.arc(kx, ky, 3.2, 0, TAU);
        ex.fill();
        tips.push([kx - w / 2, ky - h / 2]);
        lights.push({ x: kx - w / 2, y: ky - h / 2, f: 0.7 + 0.2 * sd, ph: sd, r: 10 });
        // seam along the prong
        ex.strokeStyle = 'rgba(255,47,109,0.8)';
        ex.lineWidth = 1.1;
        ex.beginPath();
        for (let k = 3; k < N - 2; k++) { const q = pts[k]; if (k === 3) ex.moveTo(q[0] + sd * 1.5, q[1]); else ex.lineTo(q[0] + sd * 1.5, q[1]); }
        ex.stroke();
      }
      const cb = [[cx - 44, fy - 12], [cx + 44, fy - 12], [cx + 38, fy + 2], [cx - 38, fy + 2]];
      bgMetal(x, pathOf(cb), '#1a1c27', boundsOf(cb), { li: 0.3, spec: 0.1, edge: 0.8 });
      const hub = [];
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + PI / 6; hub.push([cx + Math.cos(a) * 34, h - 34 + Math.sin(a) * 28]); }
      bgMetal(x, pathOf(hub), '#1d1f2c', boundsOf(hub), { li: 0.34, spec: 0.14 });
      A.panelLines(x, pathOf(hub.map((q) => [cx + (q[0] - cx) * 0.6, h - 34 + (q[1] - h + 34) * 0.6])), '#000000', 0.5);
      ex.strokeStyle = '#ff2f6d';
      ex.lineWidth = 1.2;
      ex.beginPath();
      ex.arc(cx, h - 34, 9, 0, TAU);
      ex.stroke();
      lights.push({ x: 0, y: h / 2 - 34, f: 0.35, ph: 1, r: 12 });
      c.e = e;
      c.lights = lights;
      c.tips = tips;
      return c;
    });
  }
  function megaItem(rng) {
    const sp = rng.next() < 0.66, c = sp ? tartSpire(rng.int(0, 2)) : tartPylon(rng.int(0, 1));
    const side = rng.next() < 0.5 ? -1 : 1, s = rng.range(0.82, 1.1);
    return {
      c, s, par: 0.5, x: side < 0 ? rng.range(-6, 150) : rng.range(570, 726), r: (c.height / 2) * s,
      rot: rng.range(-0.15, 0.15) - side * 0.06, vr: 0, ph: rng.next() * TAU, draw: drawMega,
    };
  }
  function drawMega(ctx, it, a) {
    const c = it.c, t = curD.t;
    blit(ctx, c, it.x, it.y, it.rot, it.s, a);
    ctx.globalCompositeOperation = 'lighter';
    blit(ctx, c.e, it.x, it.y, it.rot, it.s, a * 0.3 * (0.62 + 0.38 * Math.sin(t * 1.3 + it.ph)));
    if (c.tips) {
      const cs = Math.cos(it.rot), sn = Math.sin(it.rot), s = it.s, A0 = c.tips[0], B0 = c.tips[1];
      const ax = it.x + (A0[0] * cs - A0[1] * sn) * s, ay = it.y + (A0[0] * sn + A0[1] * cs) * s;
      const bx = it.x + (B0[0] * cs - B0[1] * sn) * s, by = it.y + (B0[0] * sn + B0[1] * cs) * s;
      const len = Math.hypot(bx - ax, by - ay), fl = 0.55 + 0.45 * Math.sin(t * 7 + it.ph) * Math.sin(t * 2.3);
      xf(ctx, (ax + bx) / 2, (ay + by) / 2, Math.atan2(by - ay, bx - ax), len / 56, 0.42 * s);
      ctx.globalAlpha = Math.min(1, a * 0.16 * fl);
      ctx.drawImage(softGlow('#ff5c8a', 32), -32, -32, 64, 64);
    }
    camBase(ctx);
    ctx.globalCompositeOperation = 'source-over';
    drawLights(ctx, it, c.lights, t, softGlow('#ff5c8a', 12), a, 0.3);
  }

  // ------------------------------------------------------------------ OUROBOROS hull (L5): serpent-scale armor
  const HUL = { w: TILE_W, h: 1024, sw: 58, sh: 1024 / 26, tip: 24 };
  const hullCx = (j) => HUL.w / 2 + 80 * Math.sin((j / HUL.h) * TAU + 0.7) + 20 * Math.sin((j / HUL.h) * TAU * 2 + 2.1);
  const hullHw = (j) => 236 + 14 * Math.sin((j / HUL.h) * TAU * 3 + 1.3);
  /** One seamless tile of the serpent's back (tail = the tapered first tile, its tip at the bottom). Scales are
      capsules in (arc length, y) space, rows offset by half a scale; the first row from the top whose capsule holds a
      pixel lies on top, so every scale overlaps the one behind it like shingles. Relief shading gives the domed
      cross-section, keels, the shadow step under each free edge and a dorsal ridge; the seam emission (half
      resolution) hugs the free edges and runs as a dashed line down the spine. */
  function hullTile(tail) {
    return memo('tart:hull' + (tail ? 'T' : 'B'), () => {
      const w = HUL.w, h = HUL.h, SW = HUL.sw, SH = HUL.sh, SR = SW / 2;
      const hb = new Float32Array(w * h), ab = new Float32Array(w * h), al = new Float32Array(w * h * 3);
      const ew = w >> 1, eh = h >> 1, em = new Float32Array(ew * eh);
      const nG = A.noise(196, 256, { scale: 28, octaves: 4, seed: 5401 }), nS = A.noise(64, 64, { scale: 16, octaves: 3, seed: 5402 });
      const base = rgb('#1d1e29'), viol = rgb('#251c30');
      const hsh = (a, b) => { let s = Math.imul((a + 7919) * 374761393 ^ Math.imul(b + 104729, 668265263), 1274126177); s ^= s >>> 15; return (s >>> 0) / 4294967296; };
      const capD = (q, cc, arc, j) => {
        const xc = (cc + 0.5 - (q & 1) * 0.5) * SW, yT = (q - 1) * SH, yC = (q + 0.85) * SH - SR;
        return Math.hypot(arc - xc, j - (j < yT ? yT : j > yC ? yC : j)) - SR;
      };
      for (let j = 0; j < h; j++) {
        const taper = tail ? Math.pow(clamp((h - HUL.tip - j) / 760, 0, 1), 0.55) : 1;
        const cxj = hullCx(j), hwj = hullHw(j) * taper;
        if (hwj < 0.5) continue;
        const rA = Math.ceil(j / SH - 0.85), rB = Math.floor(j / SH + 1);
        const i0 = Math.max(0, Math.floor(cxj - hwj)), i1 = Math.min(w - 1, Math.ceil(cxj + hwj));
        for (let i = i0; i <= i1; i++) {
          const uu = (i + 0.5 - cxj) / hwj;
          if (uu <= -1 || uu >= 1) continue;
          const k = j * w + i, nzc = Math.sqrt(1 - uu * uu), arc = Math.asin(uu) * hwj;
          ab[k] = clamp((1 - Math.abs(uu)) * hwj + 0.3, 0, 1);
          let rv = rB, lx = 0, cc = 0;
          for (let rr = rA; rr <= rB; rr++) {
            if (j < (rr - 1) * SH) continue;
            const colF = arc / SW + (rr & 1) * 0.5, c0 = Math.floor(colF), lxx = (colF - c0 - 0.5) * SW, yC = (rr + 0.85) * SH - SR;
            if (j <= yC ? Math.abs(lxx) <= SR : lxx * lxx + (j - yC) * (j - yC) <= SR * SR) { rv = rr; lx = lxx; cc = c0; break; }
          }
          const yC = (rv + 0.85) * SH - SR, ly = (j - (rv - 1) * SH) / (1.85 * SH);
          const dOwn = j <= yC ? SR - Math.abs(lx) : SR - Math.hypot(lx, j - yC);
          // distance to the two nearest capsules of the row above (they lie on this scale)
          const q = rv - 1, cF = arc / SW + (q & 1) * 0.5, cq = Math.floor(cF), sg = cF - cq - 0.5 < 0 ? -1 : 1;
          const dmin = Math.max(0, Math.min(capD(q, cq, arc, j), capD(q, cq + sg, arc, j)));
          let hs = 3 + 9 * Math.pow(clamp(ly, 0, 1), 1.3) + 1.6 * gauss(lx / 4.5) * sstep(0.35, 1, ly);
          if (dOwn < 2.5) hs -= (2.5 - dOwn) * 1.1;
          const ad = Math.abs(arc);
          if (ad < 34) hs += 9 * (1 - (ad / 34) * (ad / 34));
          hb[k] = nzc * hwj * 0.42 + hs;
          const t1 = hsh(rv, cc), t2 = hsh(cc, rv + 77), g = sampW(nG, 196, 256, i / w, j / h);
          const ao = 1 - 0.62 * Math.exp(-dmin / 4.2);
          const f = (0.8 + 0.4 * t1) * (0.82 + 0.36 * g) * ao * (0.6 + 0.4 * sstep(0, 0.3, nzc));
          const pol = 1 + 0.4 * sstep(3.2, 0.6, dOwn) * (1 - Math.exp(-dmin / 2)), mv = t2 * 0.7;
          al[k * 3] = lerp(base[0], viol[0], mv) * f * pol;
          al[k * 3 + 1] = lerp(base[1], viol[1], mv) * f * pol;
          al[k * 3 + 2] = lerp(base[2], viol[2], mv) * f * pol;
          const seam = Math.exp(-dmin / 1.4) * (0.25 + 0.75 * sampW(nS, 64, 64, arc / 640 + 0.5, (j / h) * 4)) * nzc;
          const sideS = j <= yC ? sstep(SR - 1.8, SR, Math.abs(lx)) * 0.3 * nzc : 0;
          const spine = gauss(arc / 1.3) * ((j * 14 / h) % 1 < 0.62 ? 0.85 : 0.1);
          const I = Math.max(seam, sideS, spine) * (tail ? sstep(0, 60, hwj) : 1);
          const ek = (j >> 1) * ew + (i >> 1);
          if (I > em[ek]) em[ek] = I;
        }
      }
      const body = relief(w, h, hb, ab, (ii, jj, k, out) => { out[0] = al[k * 3]; out[1] = al[k * 3 + 1]; out[2] = al[k * 3 + 2]; },
        { bump: 1, amb: 0.2, wrap: 0.12, rim: rgb('#4a2f66'), rimStr: 0.55, rimPow: 3, spec: 0.12 });
      const ec = cnv(ew, eh), ex = ec.getContext('2d'), img = ex.createImageData(ew, eh), D = img.data, pk = rgb('#ff2f6d');
      for (let k = 0; k < ew * eh; k++) { const I = Math.min(1, em[k]); D[k * 4] = pk[0] * I; D[k * 4 + 1] = pk[1] * I; D[k * 4 + 2] = pk[2] * I; D[k * 4 + 3] = 255; }
      ex.putImageData(img, 0, 0);
      const sil = cnv(ew, eh), sx = sil.getContext('2d');
      sx.drawImage(body, 0, 0, ew, eh);
      sx.globalCompositeOperation = 'source-in';
      sx.fillStyle = '#020204';
      sx.fillRect(0, 0, ew, eh);
      return { body, em: ec, sil };
    });
  }
  const beat = (t) => Math.pow(0.5 + 0.5 * Math.sin(t * 2.2), 8) + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.2 - 0.9), 8);
  function hullDraw(ctx, d, a, dk) {
    if (a < 0.01 || !d.hull.on) return;
    const Tt = hullTile(true), Tb = hullTile(false), h = HUL.h, top0 = d.hull.y - (h - HUL.tip);
    const ea = a * 0.3 * (0.5 + 0.5 * Math.min(1, beat(d.t))) * (1 - 0.8 * dk);
    for (let kk = Math.max(0, Math.floor((top0 - H - PAD) / h) + 1); ; kk++) {
      const y = top0 - kk * h;
      if (y + h < -PAD) break;
      const T = kk === 0 ? Tt : Tb;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(T.body, -PAD, y);
      if (dk > 0.01) { ctx.globalAlpha = Math.min(1, a * dk); ctx.drawImage(T.sil, -PAD, y, HUL.w, h); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, ea);
      ctx.drawImage(T.em, -PAD, y, HUL.w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ the Collapsar Foundry (s4), built on first use
  const FND = { w: 392, h: 512 }; // floor tile at half resolution (TILE_W x 1024 logical)
  function foundryFloor() {
    return memo('tart:floor', () => {
      const w = FND.w, h = FND.h, r = SL.makeRng(5501);
      const nA = A.noise(w, h, { scale: 56, octaves: 5, seed: 5502, gain: 0.55 }), nB = A.noise(w, h, { scale: 14, octaves: 3, seed: 5503 });
      const hb = new Float32Array(w * h), ab = new Float32Array(w * h).fill(1), I = new Float32Array(w * h), sp = new Float32Array(w * h);
      const rivers = [[0.17, 4.2], [0.5, 5.6], [0.84, 3.6]].map((q) => ({ x: q[0] * w, wd: q[1], e: periodicEdge(r, h, 3, 9) }));
      const feeds = [];
      for (let q = 0; q < 10; q++) { const a = r.int(0, 1); feeds.push({ a, y: Math.floor(r.range(0, h)), wd: r.range(1.5, 2.4) }); }
      const pools = [];
      for (let q = 0; q < 8; q++) { const R = rivers[r.int(0, 2)], y = r.range(0, h); pools.push({ x: R.x + R.e[Math.floor(y)] + r.range(-30, 30), y, rr: r.range(6, 15) }); }
      for (let q = 0; q < 70; q++) { const k = Math.floor(r.range(0, h)) * w + Math.floor(r.range(0, w)); I[k] = Math.max(I[k], r.range(0.4, 0.62)); }
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const k = j * w + i, gx = i % 32, gy = j % 32, edge = Math.min(gx, 31 - gx, gy, 31 - gy);
          let hh = 3 * sstep(0, 2, edge) + nA[k] * 4 + nB[k] * 0.8, e = I[k], s = 0;
          for (const R of rivers) {
            const dx = Math.abs(i + 0.5 - (R.x + R.e[j]));
            if (dx > R.wd * 9) continue;
            hh -= 5 * sstep(R.wd + 1.5, R.wd - 0.5, dx);
            e = Math.max(e, gauss(dx / (R.wd * 0.55)));
            s = Math.max(s, Math.exp(-dx / (R.wd * 2.2)));
          }
          for (const F of feeds) {
            let dy = Math.abs(j - F.y);
            dy = Math.min(dy, h - dy);
            if (dy > F.wd * 8) continue;
            const xa = rivers[F.a].x + rivers[F.a].e[j], xb = rivers[F.a + 1].x + rivers[F.a + 1].e[j];
            if (i < xa || i > xb) continue;
            hh -= 4 * sstep(F.wd + 1, F.wd - 0.5, dy);
            e = Math.max(e, gauss(dy / (F.wd * 0.55)) * 0.85);
            s = Math.max(s, Math.exp(-dy / (F.wd * 2.4)) * 0.8);
          }
          for (const Pl of pools) {
            let dy = Math.abs(j - Pl.y);
            dy = Math.min(dy, h - dy);
            const qd = Math.hypot(i - Pl.x, dy) / Pl.rr;
            if (qd > 4) continue;
            if (qd < 1) hh -= 4;
            e = Math.max(e, qd < 1 ? 1 - 0.45 * qd * qd : 0.3 * Math.exp(-(qd - 1) * 3));
            s = Math.max(s, Math.exp(-(qd - 1) * 1.2) * 0.9);
          }
          hb[k] = hh;
          I[k] = e;
          sp[k] = s;
        }
      }
      const body = relief(w, h, hb, ab, (ii, jj, k, out) => {
        const v = 12 + 18 * nA[k], s = sp[k];
        out[0] = v * 1.06 + 70 * s; out[1] = v * 0.9 + 26 * s; out[2] = v * 0.98 + 14 * s;
      }, { bump: 0.8, amb: 0.3, wrap: 0.2 });
      const ec = cnv(w, h), ex = ec.getContext('2d'), img = ex.createImageData(w, h), D = img.data;
      const L = lut([[0, '#000000'], [0.15, '#3a1a2a'], [0.5, '#c4502e'], [0.8, '#ff8a5c'], [1, '#ffcf8a']]), o = [0, 0, 0];
      for (let k = 0; k < w * h; k++) { lutAt(L, Math.min(1, I[k]), o); D[k * 4] = o[0]; D[k * 4 + 1] = o[1]; D[k * 4 + 2] = o[2]; D[k * 4 + 3] = 255; }
      ex.putImageData(img, 0, 0);
      return { body, em: ec };
    });
  }
  function forgeHaze() {
    return memo('tart:haze', () => paintNoise(512, 512, [
      { scale: 128, octaves: 5, seed: 5510, warp: 0.5, palette: [[0, '#000000', 0], [0.45, '#140810', 0], [0.7, '#3a1a2a', 0.6], [1, '#5a2a30', 0.9]] },
      { scale: 64, octaves: 4, seed: 5511, ridged: true, op: 'lighter', alpha: 0.5, palette: [[0, '#000', 0], [0.75, '#000', 0], [0.95, '#ff8a5c', 0.35], [1, '#ffb070', 0.5]] },
    ]));
  }
  /** forge-lit scaffold: a Warren truss tower with decks (side view), warm light on its lower right */
  function scafTower(i) {
    return memo('tart:tower' + i, () => {
      const w = [112, 92][i], h = [760, 620][i], P = 10, c = cnv(w + P * 2, h + P * 2), x = c.getContext('2d'), r = SL.makeRng(5520 + i);
      x.translate(P, P);
      trussV(x, 0, 0, w, h, [56, 48][i], '#252935', { cw: 10, dw: 4, hi: '#3a3f50' });
      const lights = [];
      for (let y = 110; y < h - 60; y += 170 + r.int(0, 40)) {
        const pl = [[-8, y], [w + 8, y], [w + 4, y + 13], [-4, y + 13]];
        bgMetal(x, pathOf(pl), '#2a2e3a', boundsOf(pl), { spec: 0.1, edge: 0.6 });
        x.fillStyle = 'rgba(0,0,0,0.5)';
        for (let xx = -4; xx < w + 4; xx += 9) x.fillRect(xx, y - 7, 1, 7);
        x.fillRect(-6, y - 8, w + 12, 1);
        lights.push({ x: (r.next() < 0.5 ? -4 : w + 4) - w / 2, y: y - h / 2, f: r.range(0.3, 0.8), ph: r.next() * TAU, r: 7 });
      }
      x.globalCompositeOperation = 'source-atop';
      const g = x.createLinearGradient(w, h, w * 0.35, h * 0.35);
      g.addColorStop(0, 'rgba(255,138,92,0.34)');
      g.addColorStop(0.5, 'rgba(255,120,80,0.12)');
      g.addColorStop(1, 'rgba(255,138,92,0)');
      x.fillStyle = g;
      x.fillRect(-P, -P, w + P * 2, h + P * 2);
      c.lights = lights;
      return c;
    });
  }
  /** catwalk truss spanning the shaft (horizontal), lit from below */
  function scafWalk() {
    return memo('tart:walk', () => {
      const len = 900, th = 56, P = 10, c = cnv(len + P * 2, th + P * 2), x = c.getContext('2d');
      x.translate(P, P + th);
      x.rotate(-PI / 2);
      trussV(x, 0, 0, th, len, 52, '#232631', { cw: 8, dw: 3, hi: '#363a4a' });
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      const g = x.createLinearGradient(0, th + P * 2, 0, 0);
      g.addColorStop(0, 'rgba(255,138,92,0.3)');
      g.addColorStop(1, 'rgba(255,138,92,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, len + P * 2, th + P * 2);
      const lights = [];
      for (let q = 0; q < 6; q++) lights.push({ x: -len / 2 + 80 + q * 148, y: th / 2, f: 0.45, ph: q * 0.9, r: 6 });
      c.lights = lights;
      return c;
    });
  }
  function scafItem(rng) {
    if (rng.next() < 0.22) {
      const c = scafWalk();
      return { c, x: W / 2 + rng.range(-40, 40), r: 120, par: 0.62, rot: rng.range(-0.1, 0.1), s: 1, draw: drawScaf };
    }
    const c = scafTower(rng.int(0, 1)), side = rng.next() < 0.5 ? -1 : 1, s = rng.range(0.85, 1.05);
    return { c, x: side < 0 ? rng.range(10, 120) : rng.range(600, 710), r: (c.height / 2) * s, par: 0.62, rot: rng.range(-0.06, 0.06), s, draw: drawScaf };
  }
  function drawScaf(ctx, it, a) {
    blit(ctx, it.c, it.x, it.y, it.rot, it.s, a);
    camBase(ctx);
    drawLights(ctx, it, it.c.lights, curD.t, softGlow('#ffb070', 12), a, 0.3);
  }
  /** magnetic seed cage: three dim rings precessing around a caged black-hole seed (art only, never addLens) */
  function cageItem(rng) {
    const side = rng.next() < 0.5 ? -1 : 1, R = rng.range(34, 62), rings = [];
    for (let q = 0; q < 3; q++) rings.push({ rot: rng.range(0, PI), tilt: rng.range(0.3, 1.2), vt: rng.range(0.2, 0.45) * (rng.next() < 0.5 ? -1 : 1), r: R * (1 - q * 0.13) });
    return { x: side < 0 ? rng.range(50, 230) : rng.range(490, 670), r: R * 1.7, par: 0.35, rot: 0, R, rings, ph: rng.next() * TAU, s: 1, draw: drawCage };
  }
  function drawCage(ctx, it, a) {
    const t = curD.t;
    ctx.globalCompositeOperation = 'lighter';
    A.drawGlow(ctx, it.x, it.y, it.R * 1.6, '#b26bff', 0.06 * a);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = '#020104';
    ctx.beginPath();
    ctx.arc(it.x, it.y, it.R * 0.15, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#b26bff';
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = Math.min(1, 0.26 * a * (0.8 + 0.2 * Math.sin(t * 3 + it.ph)));
    ctx.beginPath();
    ctx.arc(it.x, it.y, it.R * 0.19, 0, TAU);
    ctx.stroke();
    const ng = softGlow('#b26bff', 10);
    for (const g of it.rings) {
      const tilt = g.tilt + 0.3 * Math.sin(t * g.vt + it.ph), sq = Math.max(0.1, Math.abs(Math.cos(tilt))), rot = g.rot + t * g.vt * 0.4;
      xf(ctx, it.x, it.y, rot, 1, sq);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, 0.6 * a);
      ctx.strokeStyle = '#232634';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, g.r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#4a4d63';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, g.r - 1.5, PI * 0.9, PI * 1.75);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      for (let n = 0; n < 4; n++) {
        const an = (n / 4) * TAU + t * 0.6;
        ctx.globalAlpha = Math.min(1, 0.22 * a * (0.5 + 0.5 * Math.sin(t * 2 + n + it.ph)));
        ctx.drawImage(ng, Math.cos(an) * g.r - 5, Math.sin(an) * g.r - 5, 10, 10);
      }
    }
    camBase(ctx);
    ctx.globalCompositeOperation = 'source-over';
  }
  function foundryInit(d) {
    if (d.fnd) return;
    d.fnd = { floor: foundryFloor(), haze: forgeHaze() };
    scafTower(0); scafTower(1); scafWalk();
    d.cages = layer({ par: 0.35, gap: [320, 560], margin: 140, max: 5, make: cageItem });
    d.scaf = layer({ par: 0.62, gap: [240, 460], margin: 420, max: 8, make: scafItem });
  }
  function tartNebula() {
    return memo('tart:neb', () => paintNoise(512, 512, [
      { scale: 170, octaves: 5, seed: 5701, warp: 0.5, palette: [[0, '#000000', 0], [0.5, '#05030a', 0], [0.75, '#120822', 0.5], [1, '#22103a', 0.85]] },
      { scale: 72, octaves: 4, seed: 5702, ridged: true, op: 'destination-out', alpha: 0.65, palette: [[0, '#000', 0], [0.6, '#000', 0], [1, '#000', 0.85]] },
    ]));
  }

  defineBg('bg_tartarus', {
    group: 'tart', seed: 53,
    list: ['rift', 'binary', 'throne', 'boss', 'finale', 'foundry'],
    defaultPhase: 'rift',
    alias: { calm: 'binary', danger: 'throne', warp: 'rift', menu: 'binary' },
    knobs: {
      stars: [1, 0.6], neb: [1, 0.5], rift: [1, 0.6], rim: [1, 0.8], bin: [0.75, 0.5], binS: [0.8, 0.3], binX: [560, 0.3], binY: [220, 0.3],
      mega: [0.35, 1], hull: [0, 0.6], hullDk: [0, 0.5], forge: [0, 0.8], heat: [0, 1.2], dark: [0, 0.6], vig: [0, 0.8], dust: [1, 0.5],
    },
    phases: {
      _base: { stars: 1, neb: 1, rift: 1, rim: 1, bin: 0.75, binS: 0.8, binX: 560, binY: 220, mega: 0.35, hull: 0, hullDk: 0, forge: 0, heat: 0, dark: 0, vig: 0, dust: 1 },
      rift: {},
      binary: { rift: 0.75, bin: 1, binS: 1.25, binX: 505, binY: 250, mega: 0.2, dust: 0.7, stars: 1.1 },
      throne: { rift: 0.6, rim: 0.85, bin: 0.8, binS: 0.95, binX: 585, binY: 175, mega: 1, hull: 1, stars: 0.8, neb: 0.8, dust: 1.2 },
      boss: { rift: 0.5, bin: 0.9, binS: 1.05, binX: 560, binY: 150, mega: 0.12, hull: 1, hullDk: 0.82, dark: 1, vig: 1, stars: 0.7, dust: 0.5 },
      finale: { bin: 0.9, binS: 1, binX: 520, binY: 250, mega: 0, hull: 0, stars: 1.3, neb: 1.2, dust: 0.3 },
      foundry: { rift: 0, bin: 0, mega: 0, hull: 0, forge: 1, heat: 0.3, stars: 0.5, neb: 0.6, dust: 0.8 },
      bossF: { rift: 0, bin: 0, mega: 0, hull: 0, forge: 1, heat: 1, dark: 1, vig: 1, stars: 0.4, neb: 0.5, dust: 0.5 }, // 'boss' after 'foundry' (s4)
    },
    init(bg, d, opts) {
      const rng = d.rng;
      d.sky = memo('tart:sky', () => skyCanvas([[0, '#030308'], [0.55, '#05040c'], [1, '#090613']]));
      d.st = [
        memo('tart:st0', () => starTile({ n: 46, seed: 5801, size: [0.4, 1], alpha: [0.25, 0.7], colors: ['#ffe9d6', '#ffd6bd', '#ffc4a6', '#f6d0c8'], glow: 0.15 })),
        memo('tart:st1', () => starTile({ n: 18, seed: 5802, size: [0.6, 1.4], alpha: [0.35, 0.85], colors: ['#ffe9d6', '#ffd0b4'], glow: 0.45 })),
      ];
      d.tw = twinkles(rng, 14, { colors: ['#ffe9d6', '#ffd6bd'], size: [2.2, 3.6], alpha: [0.25, 0.6], par: [0.02, 0.05] });
      d.neb = tartNebula();
      d.rift = riftTile();
      d.riftY = 0;
      d.rsp = [];
      for (let i = 0; i < 18; i++) d.rsp.push({ side: i % 2 ? 1 : -1, j: rng.range(0, TRF.h), v: rng.range(24, 80) * (rng.next() < 0.5 ? -1 : 1), a: rng.range(0.12, 0.25), s: rng.range(0.7, 1.4), f: rng.range(2, 6), ph: rng.next() * TAU });
      tartHoles(); tartBinRing();
      for (let i = 0; i < 3; i++) tartSpire(i);
      tartPylon(0); tartPylon(1);
      if (opts.phase !== 'foundry') { hullTile(true); hullTile(false); }
      d.mega = layer({ par: 0.5, gap: [260, 520], margin: 380, max: 8, make: megaItem });
      d.hull = { on: false, y: 0 };
      d.dust = dustMake(rng, 18, 1.2);
      d.fnd = null;
      d.fmode = false;
    },
    phase(bg, d, ph, prev, snap) {
      if (ph === 'foundry' || (ph === 'boss' && (prev === 'foundry' || d.fmode))) {
        foundryInit(d);
        if (ph === 'boss') applyPhase(d, d.S.phases, 'bossF', snap);
        if (!d.fmode || snap) { layerFill(d.cages, d, 1); layerFill(d.scaf, d, 1); }
        d.fmode = true;
      } else d.fmode = false;
      if (snap) layerFill(d.mega, d, d.k.mega);
      if (ph === 'rift') d.fxP = false; // the punch through the tear replays on every entry
      if (ph === 'finale') d.fxF = false;
      if (ph === 'throne' && (!d.hull.on || snap)) { d.hull.on = true; d.hull.y = snap ? H + 4000 : -30; }
      if (ph === 'boss' && !d.fmode && !d.hull.on && snap) { d.hull.on = true; d.hull.y = H + 4000; }
    },
    update(bg, d, dt) {
      const k = d.k, dy = d.sp * dt;
      twinkleStep(d.tw, dy, d.rng);
      dustStep(d.dust, dy, d.rng);
      d.riftY += dy * 0.04;
      for (let i = 0; i < d.rsp.length; i++) {
        const s = d.rsp[i];
        s.j += s.v * dt;
        if (s.j >= TRF.h) s.j -= TRF.h;
        else if (s.j < 0) s.j += TRF.h;
      }
      layerStep(d.mega, d, dt, k.mega);
      if (d.fnd) { layerStep(d.cages, d, dt, k.forge); layerStep(d.scaf, d, dt, k.forge); }
      if (d.hull.on) {
        d.hull.y += dy * 0.7;
        if (d.kt.hull === 0 && k.hull < 0.01) d.hull.on = false;
      }
      const fx = SL.fx;
      if (d.ph === 'rift' && !d.fxP && d.pt >= 0.58) {
        d.fxP = true;
        if (fx && fx.chromatic) fx.chromatic(0.9, 0.6);
        if (fx && fx.flash) fx.flash('#ff5c8a', 0.14, 0.5);
      }
      if (d.ph === 'finale' && !d.fxF && d.pt >= 2.6) {
        d.fxF = true;
        if (fx && fx.flash) fx.flash('#f4eeff', 0.3, 1.0);
        if (fx && fx.chromatic) fx.chromatic(0.35, 0.5);
      }
      if (k.vig > 0.02 && SL.render.vignette) SL.render.vignette(0.35 + 0.15 * k.vig);
    },
    draw(bg, d, ctx) {
      const k = d.k, t = d.t, T = d.rift, pt = d.pt;
      curD = d;
      camBase(ctx);
      drawSky(ctx, d.sky);
      tileY(ctx, d.st[0], d.sy * 0.02, -PAD, TILE_W, 0.75 * k.stars);
      tileY(ctx, d.st[1], d.sy * 0.05, -PAD, TILE_W, 0.75 * k.stars);
      ctx.globalCompositeOperation = 'lighter';
      twinkleDraw(ctx, d.tw, t, 0.6 * k.stars);
      tileXY(ctx, d.neb, t * 3, d.sy * 0.03, 1.8, 0.55 * k.neb);
      ctx.globalCompositeOperation = 'source-over';
      // the foundry floor far below (s4), molten channels flickering at alpha <= 0.3
      const F = d.fnd, fa = F ? k.forge : 0;
      if (fa > 0.01) {
        const off = d.sy * 0.12, fl = 0.85 + 0.1 * Math.sin(t * 5.3) * Math.sin(t * 2.1) + 0.15 * k.heat * beat(t * 0.8);
        tileY(ctx, F.floor.body, off, -PAD, TILE_W, fa);
        ctx.globalCompositeOperation = 'lighter';
        tileY(ctx, F.floor.em, off, -PAD, TILE_W, fa * 0.3 * Math.min(1, fl));
        tileXY(ctx, F.haze, t * 5, d.sy * 0.2 - t * 14, 1.6, fa * (0.3 + 0.12 * k.heat * beat(t * 0.8)));
        A.drawGlow(ctx, -80, 1020, 560, '#ff8a5c', 0.1 * fa * fl);
        A.drawGlow(ctx, 800, 360, 480, '#ff8a5c', 0.08 * fa * fl);
        A.drawGlow(ctx, 360, 1400, 700, '#3a1a2a', 0.3 * fa);
        ctx.globalCompositeOperation = 'source-over';
        darken(ctx, 0.12 * fa);
      }
      // L2 the rift: punch-through on entry ('rift'), collapse into white-violet light ('finale')
      let sx = 1, aB = k.rift, aR = 0.25 * k.rim * k.rift, aV = 0.25 * k.rift * (0.55 + 0.45 * Math.sin(t * 0.9));
      if (d.ph === 'rift' && pt < 2.6) {
        const zs = 1 + 11 * Math.pow(clamp(pt / 1.0, 0, 1), 3), za = 1 - sstep(0.7, 1.35, pt);
        if (za > 0.01) riftDraw(ctx, T, RIFT_X, zs, d.riftY, za, 0.25 * za * (1 + 1.5 * sstep(0.2, 0.6, pt)), 0.25 * za);
        burstDraw(ctx, RIFT_X, 700, pt, sstep(0.3, 0.6, pt) * (1 - sstep(0.75, 1.3, pt)));
        const fin = sstep(1.1, 2.6, pt);
        aB *= fin; aR *= fin; aV *= fin;
      } else if (d.ph === 'finale') {
        sx = 1 - sstep(0.5, 2.6, pt);
        aR *= (1 + 2.4 * sstep(0.5, 2.4, pt)) * (1 - sstep(2.45, 2.65, pt));
        aB *= 1 - sstep(2.3, 2.6, pt);
      }
      const y0 = riftDraw(ctx, T, RIFT_X, sx, d.riftY, aB, aR, aV);
      riftSparks(ctx, T, d, RIFT_X, sx, y0, aB);
      // L3 the binary
      binDraw(ctx, d, t);
      // foundry: caged seeds and scaffolds
      if (fa > 0.01) {
        layerDraw(ctx, d.cages, fa);
        layerDraw(ctx, d.scaf, fa);
      }
      // L4 Nyx megastructures, L5 the OUROBOROS hull beneath the action
      layerDraw(ctx, d.mega, 1);
      hullDraw(ctx, d, k.hull, k.hullDk);
      // finale: the closing seam flares and blooms into white-violet light, leaving a soft aura
      if (d.ph === 'finale') {
        const g1 = sstep(0.9, 2.6, pt) * (1 - sstep(2.7, 4, pt)), g2 = sstep(2.35, 2.9, pt) * (1 - 0.7 * sstep(3, 5, pt));
        ctx.globalCompositeOperation = 'lighter';
        if (g1 > 0.01) {
          ctx.globalAlpha = Math.min(1, 0.45 * g1);
          ctx.drawImage(softGlow('#f4eeff', 32), RIFT_X - 24 - 60 * g1, -PAD, 48 + 120 * g1, H + PAD * 2);
        }
        if (g2 > 0.01) {
          const br = 0.92 + 0.08 * Math.sin(t * 0.8);
          A.drawGlow(ctx, RIFT_X, H * 0.45, 780, '#f4eeff', 0.3 * g2 * br);
          A.drawGlow(ctx, RIFT_X, H * 0.45, 380, '#d9c8ff', 0.16 * g2 * br);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      darken(ctx, 0.16 * k.dark);
      ctx.globalCompositeOperation = 'lighter';
      dustDraw(ctx, d.dust, d.sp, fa > 0.5 ? '#ffb48a' : '#c9b8ff', 0.06 * k.dust);
      ctx.globalCompositeOperation = 'source-over';
    },
  });

  // @@BACKGROUNDS@@

  // ==================================================================================================================
  // public helpers, sandboxes
  // ==================================================================================================================
  SL.scenery = {
    defs,
    /** current resolved phase of the live background */
    phase() { const bg = SL.world && SL.world.bg; return bg && bg.data && bg.data.ph ? bg.data.ph : (bg ? bg.phase : null); },
    /** readability check: draws only the live background into an offscreen canvas (q = 1, no shake) and returns value /
        saturation stats for the central 560 px column (x 80-640, y0..y1). Debug use; not for per-frame code. */
    stats(o) {
      o = o || {};
      const bg = SL.world && SL.world.bg;
      if (!bg || !bg.def || !bg.def.draw) return null;
      const c = cnv(W, H), x = c.getContext('2d');
      const R = SL.render, saved = R.base;
      R.base = { s: 1, x: 0, y: 0, shakeX: 0, shakeY: 0 };
      try { bg.def.draw(bg, x); } finally { R.base = saved; }
      const x0 = o.x0 != null ? o.x0 : 80, x1 = o.x1 != null ? o.x1 : 640, y0 = o.y0 || 0, y1 = o.y1 || H;
      const px = x.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      const hv = new Uint32Array(101), hs = new Uint32Array(101);
      let n = 0, over = 0;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const v = mx / 255, s = mx > 0 ? (mx - mn) / mx : 0;
        hv[Math.round(v * 100)]++;
        if (v > 0.12) hs[Math.round(s * 100)]++;
        if (v > 0.4) over++;
        n++;
      }
      const pct = (h, p) => { let acc = 0; const tot = h.reduce((a, b) => a + b, 0); for (let i = 0; i <= 100; i++) { acc += h[i]; if (acc >= tot * p) return i / 100; } return 1; };
      return { phase: bg.data && bg.data.ph, v50: pct(hv, 0.5), v99: pct(hv, 0.99), v999: pct(hv, 0.999), over40: +(over / n).toFixed(5), s95: pct(hs, 0.95) };
    },
  };

  function registerSandboxes() {
    for (const id of Object.keys(defs)) {
      const S = defs[id];
      SL.debug.sandbox('bg:' + id, () => {
        const P = SL.debug.params || {};
        const want = P.phase && S.list.indexOf(P.phase) >= 0 ? P.phase : null;
        dbgZoom = +P.zoom > 0 ? { z: +P.zoom, x: P.zx != null ? +P.zx : W / 2, y: P.zy != null ? +P.zy : H / 2 } : null;
        if (want) SL.world.setPhase(want);
        if (P.bullets) {
          SL.every(0.5, (i) => {
            if (!SL.fireEnemy) return;
            const types = ['orb', 'orbBig', 'needle', 'shard'];
            for (let j = 0; j < 10; j++) SL.fireEnemy(360 + Math.sin(i) * 160, 140, (j / 10) * TAU + i * 0.3, 150, types[(i + j) % 4]);
          });
        }
        const cyc = +P.cycle > 0 ? +P.cycle : 7;
        let acc = 0, idx = 0;
        return (dt) => {
          if (want) return;
          acc += dt;
          if (acc >= cyc) { acc = 0; idx = (idx + 1) % S.list.length; SL.world.setPhase(S.list[idx]); }
        };
      }, { name: 'Background ' + id, bg: id, god: true, scroll: id === 'bg_vesta' ? 80 : 90 });
    }
  }
  registerSandboxes();
})(window.SL = window.SL || {});
