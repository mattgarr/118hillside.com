/*!
 * TREES — photoreal-leaning procedural trees for three.js r128 (global THREE).
 * 118 Hillside Drive, Woodside CA walkthrough.  Units: FEET, y up, origin = base of the trunk on the ground.
 * API:  TREES.make(kind, {lod, seed, ...}) · TREES.forest(points, opts) · TREES.kinds
 *       TREES.setMaterials(map) · TREES.mat(name) · TREES.setWind(s, angle) · TREES.tick(t) · TREES.stats(obj)
 * No external assets: bark, leaf atlases and normal maps are painted on canvas at load and cached.
 */
(function (global) {
'use strict';
var THREE = global.THREE;
if (!THREE) throw new Error('TREES: load three.js r128 before trees.js');

var PI = Math.PI, TAU = PI * 2, HALF = PI / 2, IN = 1 / 12, DEG = PI / 180;
var TREES = { version: '1.0.0', units: 'feet' };
var CONFIG = { leafAtlas: 1024, barkSize: 512, anisotropy: 4, budget: { hero: 38000, mid: 5200, far: 290 } };

function opt(defaults, o) {
  var r = {}, k;
  for (k in defaults) r[k] = defaults[k];
  if (o) for (k in o) if (o[k] !== undefined) r[k] = o[k];
  return r;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function rng(seed) {
  var s = (seed >>> 0) || 0x9e3779b9;
  s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
  return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hashStr(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seedOf(seed, salt) { return (Math.imul((seed | 0) + 0x632be5ab, 2654435761) ^ hashStr(String(salt || ''))) >>> 0; }
function rr(R, a, b) { return a + (b - a) * R(); }
function pick(R, arr) { return arr[(R() * arr.length) | 0]; }
function gauss(R) { return (R() + R() + R() - 1.5) * 1.15; }

/* ------------------------------------------------------------------ value noise */
function hash3(x, y, z, s) {
  var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683) ^ Math.imul((s | 0) + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise3(x, y, z, s) {
  var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  function H(a, b, c) { return hash3(xi + a, yi + b, zi + c, s); }
  return lerp(lerp(lerp(H(0, 0, 0), H(1, 0, 0), u), lerp(H(0, 1, 0), H(1, 1, 0), u), v),
              lerp(lerp(H(0, 0, 1), H(1, 0, 1), u), lerp(H(0, 1, 1), H(1, 1, 1), u), v), w) * 2 - 1;
}
function fbm3(x, y, z, s, oct) {
  var a = 0.5, f = 1, t = 0, n = 0;
  for (var i = 0; i < (oct || 4); i++) { t += a * vnoise3(x * f, y * f, z * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return t / n;
}
/* tileable 2-D value noise: lattice wraps with period (px, py) */
function tnoise(x, y, px, py, s) {
  var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  function H(a, b) { return hash3(((xi + a) % px + px) % px, ((yi + b) % py + py) % py, 7, s); }
  return lerp(lerp(H(0, 0), H(1, 0), u), lerp(H(0, 1), H(1, 1), u), v) * 2 - 1;
}
function tfbm(x, y, px, py, s, oct, gain) {
  var a = 0.5, f = 1, t = 0, n = 0;
  for (var i = 0; i < (oct || 4); i++) { t += a * tnoise(x * f, y * f, px * f, py * f, s + i * 31); n += a; a *= (gain || 0.5); f *= 2; }
  return t / n;
}

/* ------------------------------------------------------------------ colour (authored sRGB → linear) */
function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function hexLin(hex) {
  if (Array.isArray(hex)) return hex.slice();
  if (typeof hex === 'string') hex = parseInt(hex.replace('#', ''), 16);
  return [s2l(((hex >> 16) & 255) / 255), s2l(((hex >> 8) & 255) / 255), s2l((hex & 255) / 255)];
}
function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function mulc(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function colorTex(t) { if (THREE.SRGBColorSpace !== undefined && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding; return t; }
function setLin(color, hex) { var c = hexLin(hex); color.setRGB(c[0], c[1], c[2]); return color; }

/* ------------------------------------------------------------------ vectors as arrays */
function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vsc(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function vmad(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function vlen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
function vnorm(a) { var l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function vlerp(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function perp(d) { var a = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; return vnorm(vcross(d, a)); }
function randDir(R) { var u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u); return [s * Math.cos(a), u, s * Math.sin(a)]; }
function vrot(v, k, a) { var c = Math.cos(a), s = Math.sin(a), d = vdot(k, v), x = vcross(k, v); return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)]; }
function horiz(a) { return [Math.sin(a), 0, -Math.cos(a)]; }    // compass azimuth (0 = north = -z, π/2 = east = +x)

/* compass direction → azimuth radians.  Accepts 'NW', degrees (number > 2π treated as degrees? no: use {deg}) or radians. */
var COMPASS = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
function azimuth(d) {
  if (d == null) return 0;
  if (typeof d === 'string') { var k = COMPASS[d.toUpperCase()]; return (k == null ? 0 : k) * DEG; }
  if (typeof d === 'object' && d.deg != null) return d.deg * DEG;
  return +d || 0;
}
/* {dir, amount} | number | [dx, dz] → {az, amt} */
function dirAmount(v, defAmt) {
  if (v == null || v === false) return { az: 0, amt: 0 };
  if (typeof v === 'number') return { az: 0, amt: v };
  if (Array.isArray(v)) { var l = Math.hypot(v[0], v[1]); return { az: Math.atan2(v[0], -v[1]), amt: l }; }
  return { az: azimuth(v.dir), amt: v.amount == null ? (defAmt || 0.3) : v.amount };
}

/* ------------------------------------------------------------------ Mesher: indexed geometry with colour */
function Mesher() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; }
Mesher.prototype.vert = function (p, n, u, v, c) {
  this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.u.push(u, v);
  if (c) this.c.push(c[0], c[1], c[2]); else this.c.push(1, 1, 1);
  return this.v++;
};
Mesher.prototype.tri = function (a, b, c) { this.i.push(a, b, c); };
Mesher.prototype.quad = function (a, b, c, d) { this.i.push(a, b, c, a, c, d); };
Mesher.prototype.tris = function () { return this.i.length / 3; };
Mesher.prototype.geometry = function () {
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
  g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
};
function triCount(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }

/* parse a #rrggbb list into linear colours */
function tints(list) { return list.map(hexLin); }
/* ================================================================== TEXTURES (all painted procedurally, cached) */
var TEX = {};
function canvas(w, h) {
  if (typeof document !== 'undefined') { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
  return new OffscreenCanvas(w, h || w);
}
function getTex(name) { if (!TEX[name]) TEX[name] = TEXDEF[name.split(':')[0]](name.split(':')[1]); return TEX[name]; }

/* ---- data texture with hand-built mips.  Transparent texels get pulled colour (pull-push) so filtering never
   blends in black; each mip's alpha is rescaled per cell so the same fraction of texels passes alphaTest 0.5. */
function mipTexture(img, A, cells, srgb, coverage) {
  var d = img.data, i, x, y, L;
  if (coverage) {
    // pull: premultiplied pyramid
    var pyr = [], W = A, cur = new Float32Array(A * A * 4);
    for (i = 0; i < A * A; i++) { var a = d[i * 4 + 3] / 255; cur[i * 4] = d[i * 4] * a; cur[i * 4 + 1] = d[i * 4 + 1] * a; cur[i * 4 + 2] = d[i * 4 + 2] * a; cur[i * 4 + 3] = a; }
    pyr.push(cur);
    while (W > 1) {
      var w2 = W >> 1, nx = new Float32Array(w2 * w2 * 4);
      for (y = 0; y < w2; y++) for (x = 0; x < w2; x++) for (var ch = 0; ch < 4; ch++) {
        nx[(y * w2 + x) * 4 + ch] = cur[((2 * y) * W + 2 * x) * 4 + ch] + cur[((2 * y) * W + 2 * x + 1) * 4 + ch] + cur[((2 * y + 1) * W + 2 * x) * 4 + ch] + cur[((2 * y + 1) * W + 2 * x + 1) * 4 + ch];
      }
      pyr.push(nx); cur = nx; W = w2;
    }
    // push: unpremultiplied colour per level, filled from the coarser level where empty
    var fill = null;
    for (L = pyr.length - 1; L >= 0; L--) {
      var P = pyr[L], Wl = A >> L, col = new Float32Array(Wl * Wl * 3);
      for (y = 0; y < Wl; y++) for (x = 0; x < Wl; x++) {
        var k = y * Wl + x, wa = P[k * 4 + 3];
        if (wa > 1e-4) { col[k * 3] = P[k * 4] / wa; col[k * 3 + 1] = P[k * 4 + 1] / wa; col[k * 3 + 2] = P[k * 4 + 2] / wa; }
        else if (fill) { var fk = (y >> 1) * (Wl >> 1) + (x >> 1); col[k * 3] = fill[fk * 3]; col[k * 3 + 1] = fill[fk * 3 + 1]; col[k * 3 + 2] = fill[fk * 3 + 2]; }
      }
      fill = col;
    }
    for (i = 0; i < A * A; i++) {
      var al = d[i * 4 + 3] / 255;
      if (al < 0.98) { var t = al; d[i * 4] = lerp(fill[i * 3], d[i * 4], t); d[i * 4 + 1] = lerp(fill[i * 3 + 1], d[i * 4 + 1], t); d[i * 4 + 2] = lerp(fill[i * 3 + 2], d[i * 4 + 2], t); }
    }
  }
  var levels = [{ data: new Uint8Array(d.buffer.slice(0)), width: A, height: A }], cover = [], n = cells, cs0 = A / n, cell, px, py, ox, oy;
  if (coverage) for (cell = 0; cell < n * n; cell++) {
    var cnt = 0; ox = (cell % n) * cs0; oy = ((cell / n) | 0) * cs0;
    for (py = oy; py < oy + cs0; py++) for (px = ox; px < ox + cs0; px++) if (d[(py * A + px) * 4 + 3] >= 128) cnt++;
    cover.push(cnt / (cs0 * cs0));
  }
  var Wm = A, prev = levels[0].data;
  while (Wm > 1) {
    var h2 = Wm >> 1, nd = new Uint8Array(h2 * h2 * 4);
    for (py = 0; py < h2; py++) for (px = 0; px < h2; px++) for (var c2 = 0; c2 < 4; c2++) {
      var s = prev[((2 * py) * Wm + 2 * px) * 4 + c2] + prev[((2 * py) * Wm + 2 * px + 1) * 4 + c2] + prev[((2 * py + 1) * Wm + 2 * px) * 4 + c2] + prev[((2 * py + 1) * Wm + 2 * px + 1) * 4 + c2];
      nd[(py * h2 + px) * 4 + c2] = (s + 2) >> 2;
    }
    var cs = h2 / n;
    if (coverage && cs >= 2) for (cell = 0; cell < n * n; cell++) {
      var hist = new Uint32Array(256), tot = 0; ox = (cell % n) * cs; oy = ((cell / n) | 0) * cs;
      for (py = oy; py < oy + cs; py++) for (px = ox; px < ox + cs; px++) { hist[nd[(py * h2 + px) * 4 + 3]]++; tot++; }
      var want = cover[cell] * tot, acc = 0, q = 255;
      for (q = 255; q > 0; q--) { acc += hist[q]; if (acc >= want) break; }
      if (q > 3 && q < 250) {
        var kk = 128 / q;
        for (py = oy; py < oy + cs; py++) for (px = ox; px < ox + cs; px++) { i = (py * h2 + px) * 4 + 3; nd[i] = Math.min(255, Math.round(nd[i] * kk)); }
      }
    }
    levels.push({ data: nd, width: h2, height: h2 });
    prev = nd; Wm = h2;
  }
  var tx = new THREE.DataTexture(levels[0].data, A, A, THREE.RGBAFormat);
  tx.mipmaps = levels; tx.generateMipmaps = false; tx.flipY = false;
  tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearMipmapLinearFilter;
  tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.anisotropy = CONFIG.anisotropy;
  if (srgb) colorTex(tx);
  tx.needsUpdate = true;
  return tx;
}
/* height field (Float32 0..1, W×H) → tangent-space normal map pixels (flipY=false: +v = +row) */
function heightToNormal(hf, W, H, k, wrap) {
  var out = new Uint8ClampedArray(W * H * 4);
  function at(x, y) {
    if (wrap) { x = (x + W) % W; y = (y + H) % H; } else { x = clamp(x, 0, W - 1); y = clamp(y, 0, H - 1); }
    return hf[y * W + x];
  }
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
    var l = Math.sqrt(dx * dx + dy * dy + 1), i = (y * W + x) * 4;
    out[i] = (-dx / l * 0.5 + 0.5) * 255; out[i + 1] = (-dy / l * 0.5 + 0.5) * 255; out[i + 2] = (1 / l * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}
function pixelsTexture(px, W, H, srgb, repeat) {
  var c = canvas(W, H), x = c.getContext('2d'), im = x.createImageData(W, H);
  im.data.set(px); x.putImageData(im, 0, 0);
  var t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = CONFIG.anisotropy;
  if (srgb) colorTex(t);
  t.needsUpdate = true;
  return t;
}

/* ================================================================== BARK
   Each style returns height h (0..1) and an sRGB colour for texel (x, y) in [0,1)², tileable. */
function tcell(x, y, nx, ny, s) {   // tileable jittered-grid Voronoi: [F1, F2, cellId]
  var gx = x * nx, gy = y * ny, ix = Math.floor(gx), iy = Math.floor(gy), f1 = 9, f2 = 9, id = 0;
  for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
    var cx = ix + i, cy = iy + j, wx = ((cx % nx) + nx) % nx, wy = ((cy % ny) + ny) % ny;
    var px = cx + 0.15 + 0.7 * hash3(wx, wy, 1, s), py = cy + 0.15 + 0.7 * hash3(wx, wy, 2, s);
    var d = Math.hypot((gx - px) * 1.0, (gy - py) * 1.0);
    if (d < f1) { f2 = f1; f1 = d; id = hash3(wx, wy, 3, s); } else if (d < f2) f2 = d;
  }
  return [f1, f2, id];
}
function hexRGB(h) { h = parseInt(h.replace('#', ''), 16); return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }
function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
var BARK = {
  // Quercus agrifolia: grey-brown, broad flat ridges split by dark furrows and cross-checks, pale lichen mottling.
  liveOak: { tile: [2.4, 3.6], normal: 9, f: function (x, y) {
    var wx = x + tfbm(x * 2, y * 3, 2, 3, 5, 3) * 0.1;
    var n = tfbm(wx * 9, y * 2, 9, 2, 11, 4), n2 = tfbm(wx * 17, y * 3, 17, 3, 13, 3);
    var fur = 1 - smooth(0.0, 0.16, Math.abs(n)), fur2 = 1 - smooth(0.0, 0.1, Math.abs(n2));
    var ck = tfbm(wx * 10, y * 7, 10, 7, 17, 2), crack = (1 - smooth(0.0, 0.07, Math.abs(ck))) * smooth(0.1, 0.4, tfbm(x * 4, y * 4, 4, 4, 19, 2));
    var det = tfbm(x * 48, y * 24, 48, 24, 3, 3) * 0.5 + 0.5;
    var h = clamp(1 - fur * 0.85 - fur2 * 0.3 - crack * 0.45 + (det - 0.5) * 0.25 + Math.abs(n) * 0.3, 0, 1);
    var lich = smooth(0.1, 0.5, tfbm(x * 4, y * 3, 4, 3, 41, 4)), lich2 = smooth(0.3, 0.6, tfbm(x * 9, y * 7, 9, 7, 47, 3));
    var c = mix3(hexRGB('#2e2823'), hexRGB('#655d53'), smooth(0.1, 0.75, h));
    c = mix3(c, hexRGB('#8e8a82'), lich * 0.6 * smooth(0.45, 0.85, h));
    c = mix3(c, hexRGB('#848c72'), lich2 * 0.35 * smooth(0.5, 0.9, h));
    c = mix3(c, hexRGB('#a8a69c'), Math.pow(det, 3) * 0.35 * smooth(0.55, 0.95, h));
    return [h, c];
  } },
  // Quercus lobata: pale grey, deeply checkered "alligator" blocks
  valleyOak: { tile: [2.4, 2.6], normal: 8, f: function (x, y) {
    var wx = x + tfbm(x * 3, y * 3, 3, 3, 7, 3) * 0.06, wy = y + tfbm(x * 4, y * 4, 4, 4, 9, 3) * 0.05;
    var ck = tcell(wx, wy, 9, 5, 33), e = ck[1] - ck[0] + tfbm(x * 20, y * 20, 20, 20, 8, 2) * 0.06, h = smooth(0.02, 0.2, e) * (0.75 + 0.25 * ck[2]);
    var det = tfbm(x * 40, y * 40, 40, 40, 9, 3) * 0.5 + 0.5; h = clamp(h * 0.85 + det * 0.15, 0, 1);
    var c = mix3(hexRGB('#2a2622'), mix3(hexRGB('#7b766d'), hexRGB('#9c978c'), ck[2]), smooth(0.1, 0.6, h));
    c = mix3(c, hexRGB('#a9a89c'), smooth(0.2, 0.6, tfbm(x * 5, y * 5, 5, 5, 3, 3)) * 0.35 * h);
    return [h, c];
  } },
  // Quercus kelloggii: dark, ridged & plated
  blackOak: { tile: [2.2, 3.0], normal: 8, f: function (x, y) {
    var wx = x + tfbm(x * 2, y * 3, 2, 3, 61, 3) * 0.1;
    var n = tfbm(wx * 8, y * 2, 8, 2, 63, 4), fur = 1 - smooth(0.0, 0.25, Math.abs(n));
    var ck = tfbm(wx * 12, y * 10, 12, 10, 65, 2), crack = 1 - smooth(0.0, 0.08, Math.abs(ck));
    var det = tfbm(x * 32, y * 32, 32, 32, 67, 3) * 0.5 + 0.5, h = clamp(1 - fur * 0.9 - crack * 0.4 + (det - 0.5) * 0.3, 0, 1);
    var c = mix3(hexRGB('#1c1815'), hexRGB('#4c463f'), smooth(0.1, 0.75, h));
    return [h, mix3(c, hexRGB('#77736a'), smooth(0.3, 0.7, tfbm(x * 6, y * 6, 6, 6, 69, 3)) * 0.35 * h)];
  } },
  // Sequoia sempervirens: thick fibrous cinnamon-red bark, long vertical stringy ridges, grey weathering
  redwood: { tile: [2.0, 6.0], normal: 9, f: function (x, y) {
    var warp = tfbm(x * 2, y * 2, 2, 2, 71, 2) * 0.12;
    var fib = tfbm((x + warp) * 22, y * 1.2, 22, 1, 73, 4), big = tfbm((x + warp) * 5, y * 0.6, 5, 1, 75, 3);
    var rid = Math.pow(1 - Math.abs(big), 1.6), str = fib * 0.5 + 0.5;
    var h = clamp(rid * 0.6 + str * 0.4, 0, 1);
    var c = mix3(hexRGB('#3b1d13'), hexRGB('#8d4e33'), smooth(0.15, 0.75, h));
    c = mix3(c, hexRGB('#a8664a'), Math.pow(str, 3) * 0.5);
    c = mix3(c, hexRGB('#8b7a70'), smooth(0.25, 0.6, tfbm(x * 3, y * 1, 3, 1, 77, 3)) * 0.45 * h);
    return [h, c];
  } },
  // Pinus radiata: dark grey-brown, deep furrows between long scaly plates with reddish inner faces
  pine: { tile: [2.2, 3.0], normal: 8, f: function (x, y) {
    var ck = tcell(x + tfbm(x * 3, y * 3, 3, 3, 81, 3) * 0.07, y + tfbm(x * 4, y * 4, 4, 4, 82, 3) * 0.05, 5, 3, 83), e = ck[1] - ck[0] + tfbm(x * 24, y * 24, 24, 24, 84, 2) * 0.07;
    var pl = smooth(0.0, 0.2, e), det = tfbm(x * 30, y * 30, 30, 30, 85, 3) * 0.5 + 0.5;
    var h = clamp(pl * (0.7 + 0.3 * ck[2]) + det * 0.15, 0, 1);
    var c = mix3(hexRGB('#1d1714'), mix3(hexRGB('#5a4a3f'), hexRGB('#7a5a45'), ck[2]), smooth(0.08, 0.5, h));
    c = mix3(c, hexRGB('#8e8277'), smooth(0.6, 0.95, det) * 0.4 * pl);
    return [h, c];
  } },
  // Umbellularia (bay laurel): smooth grey-brown, faint scales and lenticels
  smooth: { tile: [1.6, 2.0], normal: 3, f: function (x, y) {
    var m = tfbm(x * 6, y * 4, 6, 4, 91, 4) * 0.5 + 0.5, det = tfbm(x * 40, y * 20, 40, 20, 93, 2) * 0.5 + 0.5;
    var len = smooth(0.82, 0.9, tfbm(x * 30, y * 60, 30, 60, 95, 2) * 0.5 + 0.5);
    var h = clamp(m * 0.4 + det * 0.3 - len * 0.2 + 0.2, 0, 1);
    var c = mix3(hexRGB('#4d463d'), hexRGB('#7a7164'), m);
    return [h, mix3(c, hexRGB('#38322c'), len * 0.6)];
  } },
  // Arbutus menziesii: smooth orange-red with peeling darker curls and pale new bark
  madrone: { tile: [1.6, 2.0], normal: 4, f: function (x, y) {
    var p = tfbm(x * 4, y * 3, 4, 3, 101, 4), peel = smooth(0.05, 0.12, p), det = tfbm(x * 30, y * 30, 30, 30, 103, 2) * 0.5 + 0.5;
    var h = clamp(0.4 + peel * 0.35 + det * 0.15, 0, 1);
    var c = mix3(hexRGB('#5e2f1f'), hexRGB('#b0582f'), peel);
    c = mix3(c, hexRGB('#b8a170'), smooth(0.5, 0.7, tfbm(x * 3, y * 2, 3, 2, 105, 3)) * 0.4 * peel);
    return [h, c];
  } }
};
function barkTextures(style) {
  var B = BARK[style], S = CONFIG.barkSize, hf = new Float32Array(S * S), px = new Uint8ClampedArray(S * S * 4);
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var r = B.f(x / S, y / S), i = y * S + x;
    hf[i] = r[0]; px[i * 4] = r[1][0]; px[i * 4 + 1] = r[1][1]; px[i * 4 + 2] = r[1][2]; px[i * 4 + 3] = 255;
  }
  return { map: pixelsTexture(px, S, S, true, true), normal: pixelsTexture(heightToNormal(hf, S, S, B.normal, true), S, S, false, true), tile: B.tile };
}

/* ================================================================== LEAVES
   Painted into two canvases at once: colour (RGBA, alpha cut) and height (dome per leaf → normal map). */
function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')'; }
function shade(c, k) { return [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)]; }
/* half-width profile (t along the blade 0 = base, 1 = tip) per leaf shape */
var LEAFSHAPE = {
  clo: function (t, side, R) {      // coast live oak: oval, spine-toothed
    var w = Math.pow(Math.sin(PI * Math.pow(t, 0.85)), 0.75) * 0.3;
    var tooth = Math.max(0, Math.sin(t * PI * 5.0 + side * 0.6)); w *= 1 + 0.16 * Math.pow(tooth, 6) * smooth(0.1, 0.25, t) * (1 - smooth(0.85, 1, t));
    return w;
  },
  valley: function (t, side) {      // valley oak: deep rounded lobes
    var env = Math.pow(Math.sin(PI * Math.pow(t, 0.75)), 0.7) * 0.5, lobe = 0.45 + 0.55 * Math.pow(Math.abs(Math.sin(t * PI * 4.5 + side * 0.25)), 0.6);
    return env * lobe * (t < 0.1 ? t / 0.1 : 1);
  },
  black: function (t, side) {       // black oak: deep, pointed bristle-tipped lobes
    var env = Math.pow(Math.sin(PI * Math.pow(t, 0.7)), 0.6) * 0.55, ph = (t * 3.2 + side * 0.1) % 1;
    var lobe = 0.25 + 0.75 * Math.pow(1 - Math.abs(ph - 0.55) * 2, 1.6);
    return env * Math.max(0.2, lobe) * (t < 0.12 ? t / 0.12 : 1);
  },
  bay: function (t) { return Math.pow(Math.sin(PI * Math.pow(t, 0.9)), 0.9) * 0.2; },
  madrone: function (t) { return Math.pow(Math.sin(PI * Math.pow(t, 0.75)), 0.75) * 0.33; },
  needle: function (t) { return (t < 0.85 ? 1 : (1 - t) / 0.15) * 0.06; }
};
/* draw one leaf: base (x,y), direction ang (canvas radians), length L, width scale Wd (multiplies profile) */
function leaf(P, x, y, ang, L, Wd, shape, col, R, o) {
  o = o || {};
  var f = LEAFSHAPE[shape], N = shape === 'needle' ? 3 : L < 30 ? 10 : 22, pts = [], i, t, ca = Math.cos(ang), sa = Math.sin(ang), curl = o.curl || 0;
  for (i = 0; i <= N; i++) { t = i / N; pts.push([t, f(t, 1, R) * Wd]); }
  function tp(t, w) { var bend = curl * t * t * L; return [x + ca * t * L - sa * (w * L + bend), y + sa * t * L + ca * (w * L + bend)]; }
  var path = new Path2D(), p0 = tp(0, 0); path.moveTo(p0[0], p0[1]);
  for (i = 0; i <= N; i++) { var q = tp(pts[i][0], pts[i][1]); path.lineTo(q[0], q[1]); }
  for (i = N; i >= 0; i--) { t = i / N; var q2 = tp(t, -f(t, -1, R) * Wd); path.lineTo(q2[0], q2[1]); }
  path.closePath();
  var cx = tp(0.5, 0), mid = tp(0.45, (o.sheenSide || 0.12) * Wd);
  // colour: base fill + glossy sheen toward the midrib + darker margin
  P.c.fillStyle = rgba(col); P.c.fill(path);
  if (L < 30 || shape === 'needle') {   // small leaves / needles: cheap flat fill + flat height (no gradients or clipping)
    var hv = ((o.hBase == null ? 0.55 : o.hBase) + 0.2) * 255 | 0;
    P.h.fillStyle = 'rgb(' + hv + ',0,0)'; P.h.fill(path);
    return;
  }
  var g = P.c.createRadialGradient(mid[0], mid[1], 0, cx[0], cx[1], L * 0.6);
  g.addColorStop(0, rgba(shade(col, o.sheen || 1.45), 0.85)); g.addColorStop(0.5, rgba(shade(col, 1.08), 0.35)); g.addColorStop(1, rgba(shade(col, 0.7), 0.6));
  P.c.save(); P.c.clip(path); P.c.fillStyle = g; P.c.fillRect(cx[0] - L, cx[1] - L, 2 * L, 2 * L);
  if (o.rib !== false && L > 10) {    // midrib + a few veins
    P.c.strokeStyle = rgba(shade(col, o.ribK || 1.5), 0.55); P.c.lineWidth = Math.max(0.6, L * 0.022);
    P.c.beginPath(); var a0 = tp(0, 0), a1 = tp(0.95, 0); P.c.moveTo(a0[0], a0[1]); P.c.quadraticCurveTo(tp(0.5, 0)[0], tp(0.5, 0)[1], a1[0], a1[1]); P.c.stroke();
    if (L > 22) {
      P.c.lineWidth = Math.max(0.5, L * 0.01); P.c.strokeStyle = rgba(shade(col, 1.25), 0.35);
      for (var v = 0.2; v < 0.85; v += 0.16) for (var sd = -1; sd <= 1; sd += 2) {
        var b0 = tp(v, 0), b1 = tp(v + 0.12, sd * f(v + 0.1, sd, R) * Wd * 0.85); P.c.beginPath(); P.c.moveTo(b0[0], b0[1]); P.c.lineTo(b1[0], b1[1]); P.c.stroke();
      }
    }
  }
  P.c.restore();
  // height: dome (convex leaf)
  var hg = P.h.createRadialGradient(cx[0], cx[1], 0, cx[0], cx[1], L * 0.55);
  var hb = o.hBase == null ? 0.55 : o.hBase;
  hg.addColorStop(0, 'rgb(' + ((hb + 0.4) * 255 | 0) + ',0,0)'); hg.addColorStop(1, 'rgb(' + (hb * 255 | 0) + ',0,0)');
  P.h.fillStyle = hg; P.h.fill(path);
}
function stem(P, pts, w0, w1, col) {
  for (var i = 1; i < pts.length; i++) {
    var t = i / (pts.length - 1);
    P.c.strokeStyle = rgba(col); P.c.lineCap = 'round'; P.c.lineWidth = lerp(w0, w1, t);
    P.c.beginPath(); P.c.moveTo(pts[i - 1][0], pts[i - 1][1]); P.c.lineTo(pts[i][0], pts[i][1]); P.c.stroke();
    P.h.strokeStyle = 'rgb(140,0,0)'; P.h.lineWidth = lerp(w0, w1, t); P.h.beginPath(); P.h.moveTo(pts[i - 1][0], pts[i - 1][1]); P.h.lineTo(pts[i][0], pts[i][1]); P.h.stroke();
  }
}
function curvePts(x0, y0, x1, y1, bend, n) {
  var pts = [], dx = x1 - x0, dy = y1 - y0, nx = -dy, ny = dx;
  for (var i = 0; i <= n; i++) { var t = i / n, b = Math.sin(PI * t) * bend; pts.push([x0 + dx * t + nx * b, y0 + dy * t + ny * b]); }
  return pts;
}
function along(pts, t) { var f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i; return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k), Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0])]; }

/* broadleaf sprig: a twig rising from the card's bottom-centre with alternate leaves and 1–2 side shoots */
function sprig(P, S, R, sp) {
  var tw = hexRGB(sp.twig || '#5b4a3a');
  if (sp.fork) sp = Object.assign({}, sp, { sides: 0 });
  function shoot(x0, y0, x1, y1, bend, depth, scale) {
    var pts = curvePts(x0, y0, x1, y1, bend, 8);
    stem(P, pts, S * 0.014 * scale, S * 0.005 * scale, tw);
    var n = Math.round(sp.n * scale), side = R() < 0.5 ? 1 : -1, leaves = [];
    for (var i = 0; i < n; i++) {
      var t = sp.start + (1 - sp.start) * (i + 0.5 * R()) / n, a = along(pts, Math.min(1, t)); side = -side;
      var ang = a[2] + side * rr(R, sp.angle[0], sp.angle[1]) * DEG, L = S * sp.len * rr(R, 0.75, 1.15) * scale * (1 - 0.3 * t * t);
      leaves.push([a[0], a[1], ang, L]);
    }
    var tipA = along(pts, 1);   // terminal rosette
    for (var j = 0; j < (sp.tip || 0); j++) leaves.push([tipA[0], tipA[1], tipA[2] + rr(R, -0.7, 0.7), S * sp.len * rr(R, 0.6, 0.95) * scale]);
    if (depth > 0) for (var k = 0; k < sp.sides; k++) {
      var st = rr(R, 0.15, 0.65), b = along(pts, st), sd = (k % 2 ? 1 : -1), ea = b[2] + sd * rr(R, 0.45, 0.95), len = S * rr(R, 0.3, 0.46) * scale;
      shoot(b[0], b[1], b[0] + Math.cos(ea) * len, b[1] + Math.sin(ea) * len, sd * 0.08, depth - 1, scale * 0.7);
    }
    leaves.forEach(function (l) {
      var under = R() < (sp.under || 0), base = under ? hexRGB(pick(R, sp.underCols)) : hexRGB(pick(R, sp.cols));
      base = shade(base, rr(R, 0.85, 1.12));
      if (sp.old && R() < sp.old) base = hexRGB(pick(R, ['#8a7a3c', '#7d6a34', '#6e7a3a']));
      leaf(P, l[0], l[1], l[2], l[3], sp.wd * rr(R, 0.6, 1.15), sp.shape, base, R, { curl: rr(R, -0.12, 0.12), sheen: under ? 1.12 : sp.sheen, hBase: 0.5 + 0.2 * R() });
    });
  }
  if (sp.fork) {   // short stem that fans into several leafy shoots: a rounded cluster, not a fern
    var my = S * rr(R, 0.7, 0.8), mx = S * rr(R, 0.45, 0.55), ms = curvePts(S * 0.5, S * 0.99, mx, my, rr(R, -0.1, 0.1), 6);
    stem(P, ms, S * 0.016, S * 0.011, tw);
    for (var f = 0; f < sp.fork; f++) {
      var fa = -HALF + lerp(-1.05, 1.05, (f + rr(R, 0.2, 0.8)) / sp.fork), fl = S * rr(R, 0.42, 0.58) * (1 - 0.22 * Math.abs(fa + HALF));
      var ft = along(ms, rr(R, 0.6, 1)), fx = ft[0] + Math.cos(fa) * fl, fy = ft[1] + Math.sin(fa) * fl;
      shoot(ft[0], ft[1], clamp(fx, S * 0.1, S * 0.9), clamp(fy, S * 0.08, S * 0.9), rr(R, -0.15, 0.15), 0, rr(R, 0.8, 1.0));
    }
    return;
  }
  var x1 = S * rr(R, 0.4, 0.6), y1 = S * rr(R, 0.06, 0.14);
  shoot(S * 0.5, S * 0.99, x1, y1, rr(R, -0.12, 0.12), 1, 1);
}
/* conifer spray (redwood): drooping flattened sprays, needles in two ranks */
function spray(P, S, R, sp) {
  var tw = hexRGB('#6a4a32');
  function axis(x0, y0, x1, y1, bend, depth, sc) {
    var pts = curvePts(x0, y0, x1, y1, bend, 10);
    stem(P, pts, S * 0.008 * sc, S * 0.003 * sc, tw);
    var n = Math.round(60 * sc);
    for (var i = 0; i < n; i++) {
      var t = 0.04 + 0.96 * i / n, a = along(pts, t), L = S * 0.06 * sc * (1 - 0.45 * t) * rr(R, 0.85, 1.1);
      for (var sd = -1; sd <= 1; sd += 2) {
        var c = hexRGB(t > 0.75 && R() < sp.tipNew ? pick(R, sp.newCols) : pick(R, sp.cols));
        leaf(P, a[0], a[1], a[2] + sd * rr(R, 0.9, 1.25), L, 1.6, 'needle', shade(c, rr(R, 0.85, 1.1)), R, { rib: false, sheen: 1.2, hBase: 0.55 });
      }
    }
    if (depth > 0) for (var k = 0; k < 7; k++) {
      var st = 0.12 + 0.7 * k / 7, b = along(pts, st), sd2 = (k % 2 ? 1 : -1), ea = b[2] + sd2 * rr(R, 0.55, 0.85), len = S * rr(R, 0.18, 0.3) * (1 - st * 0.5);
      axis(b[0], b[1], b[0] + Math.cos(ea) * len, b[1] + Math.sin(ea) * len, sd2 * 0.05, depth - 1, sc * 0.7);
    }
  }
  axis(S * 0.5, S * 0.99, S * rr(R, 0.45, 0.55), S * 0.06, rr(R, -0.08, 0.08), 1, 1);
}
/* pine tufts: long needles in brush-like tufts at twig ends */
function tufts(P, S, R, sp) {
  var tw = hexRGB('#5a4535'), main = curvePts(S * 0.5, S * 0.99, S * rr(R, 0.45, 0.55), S * 0.45, rr(R, -0.1, 0.1), 8);
  stem(P, main, S * 0.03, S * 0.016, tw);
  var tips = [[along(main, 1), 0]];
  for (var k = 0; k < sp.forks; k++) {
    var b = along(main, rr(R, 0.45, 0.8)), sd = k % 2 ? 1 : -1, ea = b[2] + sd * rr(R, 0.35, 0.7), len = S * rr(R, 0.2, 0.3);
    var pts = curvePts(b[0], b[1], b[0] + Math.cos(ea) * len, b[1] + Math.sin(ea) * len, 0, 4);
    stem(P, pts, S * 0.02, S * 0.012, tw); tips.push([along(pts, 1), 1]);
  }
  tips.forEach(function (tp) {
    var a = tp[0];
    for (var i = 0; i < sp.needles; i++) {
      var t = Math.pow(R(), 0.7), dir = a[2] + gauss(R) * 0.55, L = S * rr(R, 0.22, 0.34) * (tp[1] ? 0.85 : 1);
      var bx = a[0] - Math.cos(a[2]) * t * S * 0.12, by = a[1] - Math.sin(a[2]) * t * S * 0.12;
      var c = hexRGB(pick(R, sp.cols));
      leaf(P, bx, by, dir + (R() - 0.5) * 0.9 * t, L, 0.16, 'needle', shade(c, rr(R, 0.8, 1.15)), R, { rib: false, sheen: 1.3, curl: rr(R, -0.05, 0.05) });
    }
  });
}
/* dead interior twigs: grey, leafless, forked */
function deadTwig(P, S, R) {
  var col = hexRGB('#6f675e');
  function br(x, y, a, L, w, d) {
    var x1 = x + Math.cos(a) * L, y1 = y + Math.sin(a) * L, pts = curvePts(x, y, x1, y1, rr(R, -0.08, 0.08), 4);
    stem(P, pts, w, w * 0.6, shade(col, rr(R, 0.8, 1.2)));
    if (d > 0) { br(x1, y1, a + rr(R, 0.25, 0.6), L * rr(R, 0.55, 0.75), w * 0.65, d - 1); br(x1, y1, a - rr(R, 0.25, 0.6), L * rr(R, 0.55, 0.75), w * 0.65, d - 1); }
  }
  br(S * 0.5, S * 0.99, -HALF + rr(R, -0.15, 0.15), S * 0.32, S * 0.02, 3);
}
/* a dense leaf mass for mid/far canopy cards: lumpy outline, leaves overlapping, baked self-shade from above */
function clump(P, S, R, sp) {
  // irregular leafy mass: several sub-lobes, density fading toward a soft, leafy edge (no hard disc outline)
  var lobes = [], i;
  for (i = 0; i < 9; i++) { var a = R() * TAU, d = i ? S * rr(R, 0.1, 0.2) : 0; lobes.push([S * 0.5 + Math.cos(a) * d, S * 0.5 + Math.sin(a) * d * 0.85, S * (i ? rr(R, 0.1, 0.16) : 0.2)]); }
  function inside(x, y) { var m = 9; lobes.forEach(function (l) { m = Math.min(m, Math.hypot(x - l[0], y - l[1]) / l[2]); }); return m; }
  var n = sp.n || 900, items = [], lo = S * 0.1, span = S * 0.8;
  for (i = 0; i < n * 4 && items.length < n; i++) {
    var x = lo + R() * span, y = lo + R() * span, m = inside(x, y);
    if (m > 1.35 || R() > 1 - smooth(0.7, 1.35, m)) continue;
    var hole = fbm3(x / S * 7, y / S * 7, 0.5, 77, 2);
    if (hole < -0.3 && m > 0.5 && R() < 0.7) continue;
    items.push([x, y, m]);
  }
  items.sort(function (a, b) { return a[1] - b[1]; });
  items.forEach(function (it) {
    var y = it[1], top = 1 - (y - S * 0.15) / (S * 0.7), k = clamp(0.72 + 0.4 * top, 0.55, 1.15);
    if (it[2] < 0.75 && R() < 0.25) k *= 0.72;   // interior shade
    var c = shade(hexRGB(pick(R, sp.cols)), k * rr(R, 0.85, 1.12));
    var ang = sp.droop ? HALF + gauss(R) * 0.6 : (R() < 0.5 ? -HALF + gauss(R) * 1.2 : R() * TAU);
    leaf(P, it[0], it[1], ang, S * sp.len * rr(R, 0.7, 1.2), sp.wd, sp.shape, c, R, { rib: false, sheen: 1.25 });
  });
}

/* atlas cells: 2×2 grid of 512² cells in a 1024 atlas.  cell UV rect [u0, v0, u1, v1] (v grows downward = canvas y) */
function cellRect(i, n) { n = n || 2; var x = i % n, y = (i / n) | 0; return [x / n, y / n, (x + 1) / n, (y + 1) / n]; }
var LEAFSETS = {
  // Coast live oak: small convex spiny dark-glossy leaves; a few yellowed old leaves; pale fuzzy undersides
  clo: [function (P, S, R) { sprig(P, S, R, { shape: 'clo', n: 16, len: 0.1, wd: 1, angle: [30, 95], start: 0.05, tip: 4, sides: 4, fork: 5, sheen: 1.55, under: 0.08,
          cols: ['#4a5c2a', '#55682f', '#435426', '#5e7034', '#4b5a2b'], underCols: ['#6b7550', '#737c58'], old: 0.025, twig: '#5d5144' }); },
        function (P, S, R) { sprig(P, S, R, { shape: 'clo', n: 15, len: 0.11, wd: 1.05, angle: [30, 95], start: 0.05, tip: 3, sides: 4, fork: 4, sheen: 1.5, under: 0.08,
          cols: ['#566a30', '#617536', '#4c5e2b', '#6a7c3a'], underCols: ['#6f7a54'], old: 0.02, twig: '#5d5144' }); },
        function (P, S, R) { sprig(P, S, R, { shape: 'clo', n: 16, len: 0.095, wd: 0.95, angle: [25, 95], start: 0.04, tip: 4, sides: 5, fork: 6, sheen: 1.6, under: 0.1,
          cols: ['#3f5023', '#4a5c28', '#384820', '#53652e'], underCols: ['#6b7550', '#737c58'], old: 0.03, twig: '#5d5144' }); },
        deadTwig],
  // Deciduous oaks: valley oak (rounded lobes) and black oak (bristle lobes); matte
  deciduous: [function (P, S, R) { sprig(P, S, R, { shape: 'valley', n: 9, len: 0.22, wd: 1, angle: [35, 70], start: 0.2, tip: 3, sides: 2, sheen: 1.2, under: 0.12,
          cols: ['#556b31', '#5f7637', '#4b602b', '#687d3c'], underCols: ['#8a9a6a'], twig: '#5b4e40' }); },
        function (P, S, R) { sprig(P, S, R, { shape: 'black', n: 8, len: 0.25, wd: 1, angle: [35, 70], start: 0.2, tip: 3, sides: 2, sheen: 1.35, under: 0.1,
          cols: ['#40592a', '#4a632e', '#385224', '#55703a'], underCols: ['#7f9064'], twig: '#4a3f36' }); },
        function (P, S, R) { sprig(P, S, R, { shape: 'valley', n: 11, len: 0.19, wd: 1, angle: [40, 75], start: 0.15, tip: 3, sides: 2, sheen: 1.2, under: 0.15,
          cols: ['#5b7034', '#64793a', '#506530'], underCols: ['#8d9c70'], twig: '#5b4e40' }); },
        deadTwig],
  // bay laurel (lance) and madrone (broad, glossy)
  broadleaf: [function (P, S, R) { sprig(P, S, R, { shape: 'bay', n: 14, len: 0.22, wd: 1, angle: [25, 50], start: 0.15, tip: 3, sides: 2, sheen: 1.45, under: 0.12,
          cols: ['#3f5a2e', '#4a6634', '#365029', '#52703a'], underCols: ['#7d8f68'], twig: '#5f6a3a' }); },
        function (P, S, R) { sprig(P, S, R, { shape: 'madrone', n: 10, len: 0.26, wd: 1, angle: [30, 60], start: 0.25, tip: 5, sides: 2, sheen: 1.7, under: 0.15,
          cols: ['#40602d', '#4b6b33', '#385628'], underCols: ['#9aa57e'], twig: '#9b4a2b' }); },
        function (P, S, R) { sprig(P, S, R, { shape: 'bay', n: 18, len: 0.18, wd: 1.1, angle: [25, 55], start: 0.1, tip: 3, sides: 3, sheen: 1.4, under: 0.15,
          cols: ['#3a542b', '#456031', '#4f6a37'], underCols: ['#7d8f68'], twig: '#5f6a3a' }); },
        deadTwig],
  redwood: [function (P, S, R) { spray(P, S, R, { cols: ['#2f4628', '#365030', '#2a3f24', '#3c5732'], newCols: ['#6c8a45', '#7a9850'], tipNew: 0.35 }); },
        function (P, S, R) { spray(P, S, R, { cols: ['#334b2b', '#3a5531', '#2c4226'], newCols: ['#64843f'], tipNew: 0.2 }); },
        function (P, S, R) { spray(P, S, R, { cols: ['#2b4125', '#324a2b', '#273b21'], newCols: ['#5a7a3a'], tipNew: 0.1 }); },
        deadTwig],
  pine: [function (P, S, R) { tufts(P, S, R, { forks: 2, needles: 300, cols: ['#2f4a2a', '#385530', '#2a4226', '#41603a'] }); },
        function (P, S, R) { tufts(P, S, R, { forks: 3, needles: 260, cols: ['#334d2c', '#3c5833', '#2d4527'] }); },
        function (P, S, R) { tufts(P, S, R, { forks: 1, needles: 340, cols: ['#2c4627', '#36522f', '#41603a'] }); },
        deadTwig],
  // mid/far canopy: one dense clump per family.  Bottom-left corner of each cell holds an opaque bark swatch for far trunks.
  clump: [function (P, S, R) { clump(P, S, R, { shape: 'clo', len: 0.045, wd: 1, n: 1500, cols: ['#3d4f26', '#46582b', '#36481f', '#4f6230', '#56692f'] }); },
          function (P, S, R) { clump(P, S, R, { shape: 'valley', len: 0.06, wd: 1, n: 1000, cols: ['#556b31', '#5f7637', '#4b602b', '#687d3c'] }); },
          function (P, S, R) { clump(P, S, R, { shape: 'needle', len: 0.08, wd: 1, n: 1800, droop: true, cols: ['#2a3f24', '#30482b', '#36502e', '#40603a'] }); },
          function (P, S, R) { clump(P, S, R, { shape: 'needle', len: 0.11, wd: 0.25, n: 2600, cols: ['#2a4226', '#33502d', '#3b5a35'] }); }]
};
var BARKSWATCH = [0.012, 0.93, 0.07, 0.988];   // within a clump cell (fractions): far-LOD trunks sample its centre
function leafAtlas(set) {
  var A = CONFIG.leafAtlas, S = A / 2, cc = canvas(A), hc = canvas(A), P = { c: cc.getContext('2d'), h: hc.getContext('2d') };
  P.h.fillStyle = 'rgb(90,0,0)'; P.h.fillRect(0, 0, A, A);
  LEAFSETS[set].forEach(function (fn, i) {
    var r = cellRect(i), ox = r[0] * A, oy = r[1] * A, m = 3;
    P.c.save(); P.h.save(); P.c.translate(ox, oy); P.h.translate(ox, oy);
    P.c.beginPath(); P.c.rect(m, m, S - 2 * m, S - 2 * m); P.c.clip(); P.h.beginPath(); P.h.rect(m, m, S - 2 * m, S - 2 * m); P.h.clip();
    fn(P, S, rng(seedOf(7 + i, set)));
    if (set === 'clump') {
      var b = BARKSWATCH; P.c.fillStyle = i === 2 ? '#7c4a33' : i === 3 ? '#5a4a40' : '#6a635a';
      P.c.fillRect(b[0] * S, b[1] * S, (b[2] - b[0]) * S, (b[3] - b[1]) * S);
    }
    P.c.restore(); P.h.restore();
  });
  var img = P.c.getImageData(0, 0, A, A);
  var hd = P.h.getImageData(0, 0, A, A).data, hf = new Float32Array(A * A);
  for (var i = 0; i < A * A; i++) hf[i] = hd[i * 4] / 255;
  var nrm = heightToNormal(hf, A, A, 3.0, false), nimg = { data: new Uint8ClampedArray(nrm.buffer) };
  return { map: mipTexture(img, A, 2, true, true), normal: mipTexture(nimg, A, 2, false, false), canvas: cc };
}
var TEXDEF = {
  bark: function (style) { return barkTextures(style); },
  leaf: function (set) { return leafAtlas(set); }
};
/* ================================================================== MATERIALS
   names:  'bark:<style>'  (liveOak valleyOak blackOak redwood pine smooth madrone)
           'leaf:<set>'    (clo deciduous broadleaf redwood pine)  — hero sprig cards
           'clump'         — mid/far canopy cards + far trunks (one atlas for every kind) */
var WIND = { enabled: false, uniforms: { treeTime: { value: 0 }, treeWind: { value: 0 }, treeWindDir: { value: new THREE.Vector2(1, 0.3).normalize() } } };
var WIND_GLSL = [
  '#ifdef USE_INSTANCING',
  '  mat4 twM = modelMatrix * instanceMatrix;',
  '#else',
  '  mat4 twM = modelMatrix;',
  '#endif',
  '  mat3 twR = mat3(twM);',
  '  float twS2 = max(dot(twR[0], twR[0]), 1e-6);',
  '  float twH = max(transformed.y, 0.0) * sqrt(twS2);',
  '  float twPh = treeTime * 0.9 + dot(twM[3].xz, vec2(0.031, 0.027));',
  '  float twA = treeWind * 0.0009 * twH * twH / (1.0 + 0.015 * twH);',
  '  vec3 twD = vec3(treeWindDir.x, 0.0, treeWindDir.y) * (0.6 + 0.4 * sin(twPh)) * twA;',
  '#ifdef TREE_LEAF',
  '  float twF = treeWind * 0.05 * (0.4 + 0.6 * color.r);',
  '  twD += vec3(sin(treeTime * 5.3 + position.x * 1.7 + position.y), sin(treeTime * 6.1 + position.z * 1.9) * 0.6, cos(treeTime * 4.7 + position.z * 1.3 + position.x)) * twF;',
  '#endif',
  '  transformed += vec3(dot(twR[0], twD), dot(twR[1], twD), dot(twR[2], twD)) / twS2;'
].join('\n');
var TRANSLUCENCY_GLSL = [
  '#if NUM_DIR_LIGHTS > 0',
  '  {',
  '    vec3 tV = normalize(vViewPosition);',
  '    vec3 tL = directionalLights[0].direction;',
  '    float tB = pow(max(dot(-tV, tL), 0.0), 4.0);',
  '    float tN = 0.35 + 0.65 * max(dot(-normal, tL), 0.0);',
  '    reflectedLight.indirectDiffuse += diffuseColor.rgb * diffuseColor.rgb * 3.0 * directionalLights[0].color * vec3(1.0, 1.1, 0.45) * tB * tN * TREE_TRANSLUCENCY;',
  '  }',
  '#endif'
].join('\n');
function leafCompile(isDepth, translucency) {
  return function (shader) {
    if (!isDepth) {
      // cards carry "volume" normals bent toward the canopy hull: keep them on both faces instead of flipping back faces
      shader.fragmentShader = shader.fragmentShader
        .replace(/normal\s*=\s*normal\s*\*\s*faceDirection\s*;/g, '')
        .replace(/normal\s*\*=\s*faceDirection\s*;/g, '');
      if (translucency > 0) shader.fragmentShader = '#define TREE_TRANSLUCENCY ' + translucency.toFixed(3) + '\n' +
        shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + TRANSLUCENCY_GLSL);
    }
    windPatch(shader, true, isDepth);
  };
}
function windPatch(shader, isLeaf, isDepth) {
  if (!WIND.enabled) return;
  for (var k in WIND.uniforms) shader.uniforms[k] = WIND.uniforms[k];
  var pre = 'uniform float treeTime;\nuniform float treeWind;\nuniform vec2 treeWindDir;\n';
  if (isLeaf && !isDepth) pre = '#define TREE_LEAF\n' + pre;
  var glsl = isDepth ? WIND_GLSL.replace(/color\.r/g, '1.0') : WIND_GLSL;
  shader.vertexShader = pre + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + glsl);
}
function treeKey(tag) { return function () { return 'trees-' + tag + '-w' + (WIND.enabled ? 1 : 0); }; }

function std(p) { var c = p.color; delete p.color; var m = new THREE.MeshStandardMaterial(p); if (c !== undefined) setLin(m.color, c); return m; }
var LEAFLOOK = {   // roughness / normal strength / translucency per foliage set
  clo: [0.6, 0.75, 0.4], deciduous: [0.74, 0.6, 0.5], broadleaf: [0.6, 0.7, 0.45], redwood: [0.78, 0.45, 0.45], pine: [0.62, 0.5, 0.45], clump: [0.7, 0.8, 0.35]
};
var MATS = {}, OVERRIDES = {}, DEPTHS = {};
function makeMat(name) {
  var sp = name.split(':'), kind = sp[0], arg = sp[1], m;
  if (kind === 'bark') {
    var bt = getTex('bark:' + arg);
    m = std({ color: 0xffffff, map: bt.map, normalMap: bt.normal, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.93, metalness: 0, vertexColors: true });
    m.onBeforeCompile = function (s) { windPatch(s, false, false); };
    m.customProgramCacheKey = treeKey('bark');
  } else if (kind === 'leaf' || kind === 'clump') {
    var set = kind === 'clump' ? 'clump' : arg, lt = getTex('leaf:' + set), L = LEAFLOOK[set] || [0.6, 0.6, 0.5];
    m = std({ color: 0xffffff, map: lt.map, normalMap: lt.normal, normalScale: new THREE.Vector2(L[1], L[1]), roughness: L[0], metalness: 0,
      vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    m.onBeforeCompile = leafCompile(false, L[2]);
    m.customProgramCacheKey = treeKey('leaf-' + set);
  } else {
    m = std({ color: 0x888888, roughness: 0.8 });
  }
  m.name = 'trees:' + name;
  return m;
}
TREES.setMaterials = function (map) { for (var k in map) OVERRIDES[k] = map[k]; return TREES; };
TREES.mat = function (name) {
  if (OVERRIDES[name]) return OVERRIDES[name];
  if (!MATS[name]) MATS[name] = makeMat(name);
  return MATS[name];
};
TREES.materialNames = function () {
  return Object.keys(BARK).map(function (b) { return 'bark:' + b; }).concat(['leaf:clo', 'leaf:deciduous', 'leaf:broadleaf', 'leaf:redwood', 'leaf:pine', 'clump']);
};
/* alpha-tested depth material so leaves cast dappled shadows */
function depthMat(name) {
  if (!DEPTHS[name]) {
    var src = TREES.mat(name);
    var d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: src.map, alphaTest: src.alphaTest || 0.5, side: THREE.DoubleSide });
    d.onBeforeCompile = leafCompile(true, 0); d.customProgramCacheKey = treeKey('depth');
    DEPTHS[name] = d;
  }
  return DEPTHS[name];
}
/* ================================================================== GROWTH: crown envelope, branch turtle, child spawning */

/* Crown envelope: lumpy, optionally lop-sided ellipsoid.  val(p) < 1 inside, = 1 on the hull. */
function Envelope(o) {
  this.c = o.c; this.rx = o.rx; this.rz = o.rz || o.rx; this.up = o.up; this.down = o.down;
  this.lump = o.lump || 0; this.seed = o.seed || 1; this.bias = o.bias || { az: 0, amt: 0 }; this.flat = o.flat || 2;
  this.bdir = horiz(this.bias.az); this.cone = o.cone || 0; this.base = o.base == null ? -1e9 : o.base;
}
Envelope.prototype.val = function (p) {
  var dx = p[0] - this.c[0], dz = p[2] - this.c[2], dy = p[1] - this.c[1], hl = Math.hypot(dx, dz) || 1e-6;
  var b = 1 + this.bias.amt * (dx * this.bdir[0] + dz * this.bdir[2]) / hl;
  var ry = dy > 0 ? this.up : this.down, rx = this.rx * b, rz = this.rz * b;
  if (this.cone) {    // conifers: radius shrinks linearly toward the top
    var tt = clamp((p[1] - (this.c[1] - this.down)) / (this.up + this.down), 0, 1);
    var rad = Math.max(0.05, Math.pow(1 - tt, this.cone)) * rx;
    var v0 = Math.max(hl / rad, Math.abs(dy) > 0 ? (dy > 0 ? dy / this.up : -dy / this.down) : 0);
    return v0 / (1 + this.lump * fbm3(dx * 0.08, p[1] * 0.08, dz * 0.08, this.seed, 3));
  }
  var e = this.flat, a = Math.pow(Math.pow(Math.abs(dx / rx), 2) + Math.pow(Math.abs(dz / rz), 2), e / 2) + Math.pow(Math.abs(dy / ry), e);
  var r = Math.pow(a, 1 / e), n = [dx / (rx * r + 1e-6), dy / (ry * r + 1e-6), dz / (rz * r + 1e-6)];
  var l = 1 + this.lump * fbm3(n[0] * 1.6 + 3, n[1] * 1.6, n[2] * 1.6, this.seed, 3);
  if (p[1] < this.base) r += (this.base - p[1]) * 0.2;
  return r / l;
};
Envelope.prototype.grad = function (p) {
  var e = 0.4, v = this.val(p);
  return vnorm([this.val([p[0] + e, p[1], p[2]]) - v, this.val([p[0], p[1] + e, p[2]]) - v, this.val([p[0], p[1], p[2] + e]) - v]);
};
/* distance along d from p until val ≥ lim (marching) */
Envelope.prototype.exit = function (p, d, lim, maxL) {
  var step = Math.max(0.4, maxL / 50), s = 0;
  if (this.val(p) >= lim) {   // starting below/outside the crown (e.g. leaders leaving a short trunk): find the entry first
    while (s < maxL && this.val(vmad(p, d, s)) >= lim) s += step;
    if (s >= maxL) return 0;
  }
  while (s < maxL) { s += step; if (this.val(vmad(p, d, s)) >= lim) return s - step * 0.5; }
  return maxL;
};

var BRID = 0;
function Branch(order) { this.pts = []; this.rad = []; this.order = order; this.kids = []; this.parent = null; this.tp = 0; this.len = 0; this.id = BRID++; this.dead = false; this.cum = []; }
Branch.prototype.finish = function () {
  var c = 0; this.cum = [0];
  for (var i = 1; i < this.pts.length; i++) { c += vlen(vsub(this.pts[i], this.pts[i - 1])); this.cum.push(c); }
  this.len = c; return this;
};
Branch.prototype.at = function (t) {   // {p, d, r} at arclength fraction t
  var s = clamp(t, 0, 1) * this.len, i = 1;
  while (i < this.pts.length - 1 && this.cum[i] < s) i++;
  var s0 = this.cum[i - 1], s1 = this.cum[i], k = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
  return { p: vlerp(this.pts[i - 1], this.pts[i], k), d: vnorm(vsub(this.pts[i], this.pts[i - 1])), r: lerp(this.rad[i - 1], this.rad[i], k) };
};
Branch.prototype.tip = function () { return this.pts[this.pts.length - 1]; };

/* Turtle growth.  g: {p, d, len, r0, r1, segs, taper, up:[start,end] tropism (+ up / − droop, per ft),
   wobble (sinuosity, rad), wf (wobble frequency along length), env, envLim, steer, minLen, twist} */
function growBranch(R, order, g) {
  var b = new Branch(order), segs = Math.max(1, g.segs | 0), sl = g.len / segs, d = vnorm(g.d), p = g.p, ns = (R() * 1e6) | 0;
  var a1 = perp(d), a2 = vcross(d, a1), wob = g.wobble || 0, wf = g.wf || 1.3, entered = false;
  b.pts.push(p); b.rad.push(g.r0);
  for (var i = 1; i <= segs; i++) {
    var t = i / segs, up = g.up ? lerp(g.up[0], g.up[1], t) : 0;
    if (wob) {   // smooth sinuous meander (noise, not jitter)
      var w1 = fbm3(t * wf * g.len * 0.1, 0.5, 0.5, ns, 2), w2 = fbm3(0.5, t * wf * g.len * 0.1, 0.5, ns + 3, 2);
      d = vnorm(vadd(d, vadd(vsc(a1, w1 * wob * sl * 0.35), vsc(a2, w2 * wob * sl * 0.35))));
    }
    if (g.kink) d = vnorm(vadd(d, vsc(randDir(R), g.kink)));
    if (up) { d = vnorm(vadd(d, [0, up * sl, 0])); }
    if (g.env && g.steer) {
      var ev = g.env.val(p);
      if (ev < (g.envLim || 1)) entered = true;
      if (entered && ev > (g.envLim || 1) * 0.9) { var gr = g.env.grad(p), out = vdot(gr, d); if (out > 0) d = vnorm(vmad(d, gr, -out * g.steer)); }
    }
    if (g.minY != null && p[1] + d[1] * sl < g.minY) d = vnorm([d[0], Math.max(d[1], 0.05), d[2]]);
    p = vmad(p, d, sl);
    b.pts.push(p);
    b.rad.push(lerp(g.r0, g.r1, Math.pow(t, g.taper || 1)));
    if (g.env && entered && g.env.val(p) > (g.envLim || 1) * 1.12 && i < segs) break;   // ran out of crown
  }
  var nP = b.pts.length;   // re-taper over the realised length so early-stopped branches still end thin
  if (nP > 1) for (var k = 0; k < nP; k++) b.rad[k] = lerp(g.r0, g.r1, Math.pow(k / (nP - 1), g.taper || 1));
  return b.finish();
}

/* spawn children along a parent.  s: {n | perFt, t:[t0,t1], angle:[a,b] deg, roll (deg, default golden), len:[a,b] (fraction of
   parent length) | lenAbs:[a,b], lenProfile(t), rr (radius ratio), tip (tip/base radius), segs, up, wobble, env, envK,
   horiz (0..1 flatten toward horizontal), outward (bias away from trunk axis), upBias, minLen, minR, plane (2-rank sprays)} */
function spawn(R, parent, s, origin) {
  var n = s.n != null ? s.n : Math.max(0, Math.round(parent.len * s.perFt * rr(R, 0.8, 1.2)));
  var out = [], roll = R() * TAU, t0 = s.t[0], t1 = s.t[1];
  for (var k = 0; k < n; k++) {
    var t = t0 + (t1 - t0) * (n === 1 ? R() : (k + rr(R, 0.15, 0.85)) / n);
    var a = parent.at(t), pd = a.d;
    roll += (s.plane ? PI : (s.roll || 137.5) * DEG) + rr(R, -0.35, 0.35);
    var side = vrot(perp(pd), pd, roll), ang = rr(R, s.angle[0], s.angle[1]) * DEG;
    var d = vnorm(vadd(vsc(pd, Math.cos(ang)), vsc(side, Math.sin(ang))));
    if (s.outward) {
      var hv = [a.p[0] - origin[0], 0, a.p[2] - origin[2]], hl = Math.hypot(hv[0], hv[2]);
      if (hl > 0.01) d = vnorm(vmad(d, vsc(hv, 1 / hl), s.outward));
    }
    if (s.horiz) d = vnorm([d[0], d[1] * (1 - s.horiz), d[2]]);
    if (s.upBias) d = vnorm(vadd(d, [0, s.upBias, 0]));
    var lp = s.lenProfile ? s.lenProfile(t) : 1;
    var len = (s.lenAbs ? rr(R, s.lenAbs[0], s.lenAbs[1]) : parent.len * rr(R, s.len[0], s.len[1])) * lp;
    if (s.env) { var ex = s.env.exit(a.p, d, s.envLim || 1, len * 1.6 + 2); len = Math.min(len * (s.envStretch || 1.15), ex * (s.envK || 1)); }
    if (len < (s.minLen || 0.4)) continue;
    var r0 = clamp(a.r * (s.rr || 0.6) * Math.pow(clamp(len / Math.max(parent.len * (1 - t), 0.1), 0.2, 1.4), 0.35), s.minR || 0.02, a.r * 0.92);
    // start on the parent's axis so the child grows out of its surface without a visible joint
    var c = growBranch(R, parent.order + 1, { p: vmad(a.p, d, -a.r * 0.15), d: d, len: len + a.r * 0.15, r0: r0, r1: Math.max(s.minR || 0.02, Math.min(0.09, r0 * (s.tip || 0.3))),
      segs: s.segs || 4, up: s.up, wobble: s.wobble, kink: s.kink, taper: s.taper, wf: s.wf, env: s.envSteer ? s.env : null, steer: s.envSteer, envLim: s.envLim, taper: s.taper, minY: s.minY != null ? s.minY : parent.minY });
    c.minY = s.minY != null ? s.minY : parent.minY;
    c.parent = parent; c.tp = t; parent.kids.push(c); out.push(c);
  }
  return out;
}
function allBranches(root) { var L = [], st = [root]; while (st.length) { var b = st.pop(); L.push(b); for (var i = 0; i < b.kids.length; i++) st.push(b.kids[i]); } return L; }

/* ================================================================== LIGHT: density grid for ambient occlusion */
function DensityGrid(lo, hi, n) {
  this.lo = lo; this.n = n; this.sz = [Math.max(hi[0] - lo[0], 1) / n, Math.max(hi[1] - lo[1], 1) / n, Math.max(hi[2] - lo[2], 1) / n];
  this.d = new Float32Array(n * n * n);
}
DensityGrid.prototype.idx = function (p) {
  var n = this.n, x = ((p[0] - this.lo[0]) / this.sz[0]) | 0, y = ((p[1] - this.lo[1]) / this.sz[1]) | 0, z = ((p[2] - this.lo[2]) / this.sz[2]) | 0;
  if (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n) return -1;
  return (y * n + z) * n + x;
};
DensityGrid.prototype.add = function (p, a) { var i = this.idx(p); if (i >= 0) this.d[i] += a; };
DensityGrid.prototype.finish = function (k) { var v = this.sz[0] * this.sz[1] * this.sz[2]; for (var i = 0; i < this.d.length; i++) this.d[i] = this.d[i] / v * k; };
var AODIRS = (function () {
  var L = [[0, 1, 0]];
  for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; L.push(vnorm([Math.cos(a), 0.9, Math.sin(a)])); }
  for (i = 0; i < 6; i++) { a = (i + 0.5) / 6 * TAU; L.push(vnorm([Math.cos(a), 0.2, Math.sin(a)])); }
  return L;
})();
/* sky visibility 0..1 at p (marches the density grid in 13 upper-hemisphere directions) */
DensityGrid.prototype.sky = function (p) {
  var st = Math.min(this.sz[0], this.sz[1], this.sz[2]) * 0.9, tot = 0, wsum = 0, maxs = this.n * 1.8;
  for (var k = 0; k < AODIRS.length; k++) {
    var d = AODIRS[k], od = 0, q = p.slice(), w = 0.5 + d[1];
    for (var s = 0; s < maxs; s++) {
      q[0] += d[0] * st; q[1] += d[1] * st; q[2] += d[2] * st;
      var i = this.idx(q); if (i < 0) break;
      od += this.d[i] * st;
      if (od > 6) break;
    }
    tot += Math.exp(-od) * w; wsum += w;
  }
  return tot / wsum;
};

/* ================================================================== MESHING: tapered bark tubes */
/* style: {tile:[w,h] ft}, tint(b, ringIndex, y) → linear rgb, sky(p) → 0..1, shape(b, i, theta) → radius multiplier */
function tubeMesh(m, b, sides, tile, colorFn, shapeFn, step, cap) {
  var pts = b.pts, n = pts.length, idx = [], i;
  step = step || 1;
  for (i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  var T = [], N = [], ring0 = m.v, rAvg = 0;
  idx.forEach(function (ii) { rAvg += b.rad[ii]; }); rAvg /= idx.length;
  var urep = Math.max(1, Math.round(TAU * rAvg / tile[0])), vOff = (b.id * 0.618) % 1;
  for (var k = 0; k < idx.length; k++) {
    var a = idx[Math.max(0, k - 1)], c = idx[Math.min(idx.length - 1, k + 1)];
    T.push(vnorm(vsub(pts[c], pts[a])));
  }
  var Nn = perp(T[0]);
  for (k = 0; k < idx.length; k++) {
    Nn = vnorm(vsub(Nn, vsc(T[k], vdot(Nn, T[k]))));
    N.push(Nn);
  }
  for (k = 0; k < idx.length; k++) {
    var ii = idx[k], p = pts[ii], t = T[k], nn = N[k], bb = vcross(t, nn), r = b.rad[ii], col = colorFn(b, ii, p);
    var dr = k > 0 ? (b.rad[idx[k - 1]] - r) / Math.max(1e-3, vlen(vsub(pts[idx[k - 1]], p))) : 0;
    for (var j = 0; j <= sides; j++) {
      var th = j / sides * TAU, dir = vadd(vsc(nn, Math.cos(th)), vsc(bb, Math.sin(th)));
      var rm = shapeFn ? shapeFn(b, ii, th, p) : 1, q = vmad(p, dir, r * rm);
      m.vert(q, vnorm(vmad(dir, t, dr * 0.6)), j / sides * urep, b.cum[ii] / tile[1] + vOff, col);
    }
  }
  var W = sides + 1;
  for (k = 0; k < idx.length - 1; k++) for (j = 0; j < sides; j++) {
    var a0 = ring0 + k * W + j; m.quad(a0, a0 + W, a0 + W + 1, a0 + 1);
  }
  if (cap) {   // close the open end (trunk tops that split into leaders; pruning cuts get a paler, callused face)
    var last = idx[idx.length - 1], cc = colorFn(b, last, pts[last]);
    if (b.pruned) cc = mulc(mixc(cc, [0.62, 0.5, 0.36], 0.55), 1.1);
    var ce = m.vert(pts[last], T[T.length - 1], 0.5, 0.5, cc), base = ring0 + (idx.length - 1) * W;
    for (j = 0; j < sides; j++) m.tri(base + j, base + j + 1, ce);
  }
}

/* ================================================================== LEAF CARDS */
/* one quad card.  base at p, axis u (length h), side s (width w), face f.  normalFn(q, f) → bent normal. */
var CARDCLIP = null;   // set while building a tree with a clearance volume: fn(p) → true when p is inside it
function cardClipped(q) { if (!CARDCLIP) return false; for (var i = 0; i < q.length; i++) if (CARDCLIP(q[i])) { CARDCLIP.n++; return true; } return false; }
function card(m, p, u, s, f, w, h, rect, normalFn, col, droop) {
  var hw = w * 0.5, tipD = (droop || 0) * h;
  var c0 = vmad(p, s, -hw), c1 = vmad(p, s, hw), c2 = vmad(vmad(vmad(p, u, h), s, hw), f, -tipD), c3 = vmad(vmad(vmad(p, u, h), s, -hw), f, -tipD);
  if (CARDCLIP && cardClipped([c0, c1, c2, c3, vlerp(c0, c2, 0.5)])) return;
  var u0 = rect[0], v0 = rect[1], u1 = rect[2], v1 = rect[3];   // canvas: bottom of cell (stem) = v1
  var i0 = m.vert(c0, normalFn(c0, f), u0, v1, col), i1 = m.vert(c1, normalFn(c1, f), u1, v1, col);
  var i2 = m.vert(c2, normalFn(c2, f), u1, v0, col), i3 = m.vert(c3, normalFn(c3, f), u0, v0, col);
  m.quad(i0, i1, i2, i3);
}
/* centered card (mid/far clumps): centre c, axes a (horizontal), b (vertical) */
function ccard(m, c, a, b, w, h, rect, normalFn, col) {
  var f = vnorm(vcross(a, b));
  var c0 = vmad(vmad(c, a, -w / 2), b, -h / 2), c1 = vmad(vmad(c, a, w / 2), b, -h / 2), c2 = vmad(vmad(c, a, w / 2), b, h / 2), c3 = vmad(vmad(c, a, -w / 2), b, h / 2);
  if (CARDCLIP && cardClipped([c0, c1, c2, c3, c])) return;
  var i0 = m.vert(c0, normalFn(c0, f), rect[0], rect[3], col(c0)), i1 = m.vert(c1, normalFn(c1, f), rect[2], rect[3], col(c1));
  var i2 = m.vert(c2, normalFn(c2, f), rect[2], rect[1], col(c2)), i3 = m.vert(c3, normalFn(c3, f), rect[0], rect[1], col(c3));
  m.quad(i0, i1, i2, i3);
}
/* inset a cell rect a little so filtering never bleeds a neighbour */
function inset(r, k) { k = k || 0.004; return [r[0] + k, r[1] + k, r[2] - k, r[3] - k]; }
/* ================================================================== BUILD PIPELINE
   kind program → skeleton {trunk, branches, env, origin} → leaf anchors → light grid → LOD meshes.
   Returns {bark: BufferGeometry|null, leaf: BufferGeometry, info} (leaf uses 'leaf:<set>' for hero, 'clump' for mid/far). */

var SIDES = { hero: [18, 12, 8, 5, 3, 3], mid: [8, 6, 4, 3, 3, 3] };

function skeletonOf(K, o) {
  BRID = 0;
  var R = rng(seedOf(o.seed, K.kind));
  var sk = K.skeleton(R, o);
  sk.R = R;
  sk.list = [];
  sk.roots.forEach(function (r) { sk.list = sk.list.concat(allBranches(r)); });
  sk.list.sort(function (a, b) { return a.id - b.id; });
  return sk;
}

/* leaf anchors: points along terminal branches where sprig cards attach.  Shell / hole culling makes clumps and sky gaps. */
function leafAnchors(sk, L, o) {
  var R = rng(seedOf(o.seed, 'anchors')), env = sk.env, A = [], hs = seedOf(o.seed, 'holes') & 0xffff;
  var ht = L.holes == null ? 0.25 : L.holes, dens = o.density == null ? 1 : o.density;
  sk.list.forEach(function (b) {
    if (b.dead || b.order < L.minOrder) return;
    var terminal = (b.kids.length === 0 && !b.pruned) || b.order >= L.order;
    if (!terminal && !(L.along && b.order >= L.order - 1)) return;
    var t0 = terminal ? L.t0 : 0.55, n = Math.max(1, Math.round(b.len * (1 - t0) / L.step));
    var clumpB = b; while (clumpB.parent && clumpB.order > L.clumpOrder) clumpB = clumpB.parent;
    for (var i = 0; i < n; i++) {
      var t = t0 + (1 - t0) * (n === 1 ? 1 : (i + 0.5 * R()) / (n - 0.5)), a = b.at(Math.min(1, t));
      var ev = env.val(a.p), keep = smooth(L.shell[0], L.shell[1], ev);
      if (L.minY != null && a.p[1] < L.minY) keep *= 0.2;
      var hn = fbm3(a.p[0] * L.holeF, a.p[1] * L.holeF * 1.3, a.p[2] * L.holeF, hs, 3);
      keep *= smooth(-ht - 0.12, -ht + 0.12, hn);
      if (R() > keep * Math.min(1, dens)) continue;
      A.push({ p: a.p, d: a.d, b: b, clump: clumpB.id, ev: ev });
    }
  });
  return A;
}

/* group anchors into clumps {c, r, n, members, hue} */
function clumpsOf(A, sk, o) {
  var map = {}, list = [];
  A.forEach(function (a) { var c = map[a.clump]; if (!c) { c = map[a.clump] = { c: [0, 0, 0], n: 0, members: [] }; list.push(c); } c.c = vadd(c.c, a.p); c.n++; c.members.push(a); });
  var R = rng(seedOf(o.seed, 'clumps'));
  list.forEach(function (c) {
    c.c = vsc(c.c, 1 / c.n); var s = 0;
    c.members.forEach(function (a) { s += vdot(vsub(a.p, c.c), vsub(a.p, c.c)); a.cl = c; });
    c.r = Math.sqrt(s / c.n) + 0.6;
    c.c = vmad(c.c, sk.env.grad(c.c), c.r * 0.25);
    c.hue = R();
  });
  return list;
}

function lightGrid(sk, A, cardArea) {
  var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  A.forEach(function (a) { for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.p[k]); hi[k] = Math.max(hi[k], a.p[k]); } });
  sk.list.forEach(function (b) { var p = b.tip(); for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } });
  lo = vsub(lo, [3, 3, 3]); hi = vadd(hi, [3, 3, 3]); lo[1] = Math.min(lo[1], 0);
  var G = new DensityGrid(lo, hi, 22);
  A.forEach(function (a) { G.add(a.p, cardArea); });
  sk.list.forEach(function (b) { if (b.order <= 2) for (var i = 0; i < b.pts.length; i++) G.add(b.pts[i], b.rad[i] * 2 * (b.len / b.pts.length) * 1.5); });
  G.finish(0.5);
  return G;
}

/* bark colour per vertex: kind tint × sky light × base darkening */
function barkColor(K, sk, G, o) {
  return function (b, i, p) {
    var c = K.barkTint(b, p, sk), sky = G ? G.sky(p) : 1;
    var ao = lerp(0.42, 1.0, Math.pow(sky, 0.7)) * lerp(0.75, 1, smooth(0, 2.5, p[1]));
    if (b.dead) c = mixc(c, [0.55, 0.52, 0.48], 0.6);
    return mulc(c, ao);
  };
}

function buildHero(K, sk, o, budget, mid) {
  var L = K.leaf, bm = new Mesher(), lm = new Mesher(), R = rng(seedOf(o.seed, mid ? 'midcards' : 'hero'));
  var A = leafAnchors(sk, L, o), cl = clumpsOf(A, sk, o), G = lightGrid(sk, A, L.size * L.size * 0.45 * (L.perAnchor || 2.5));
  var bc = barkColor(K, sk, G, o), tile = BARK[K.bark(o)].tile;
  // branches: thickest first, stop adding twig tubes once over the branch budget
  var bl = sk.list.slice().sort(function (a, b) { return a.order - b.order || b.rad[0] - a.rad[0]; });
  var brBudget = budget * (K.branchShare || 0.38);
  if (mid) bl.forEach(function (b) {   // mid: trunk + major limbs only, coarse
    if (b.order > (K.midOrders || 2) || b.rad[0] < (K.midMinR || 0.05)) return;
    var step = Math.max(1, Math.ceil(b.pts.length / (b.order === 0 ? 8 : b.order === 1 ? 6 : 3)));
    tubeMesh(bm, b, SIDES.mid[b.order], tile, bc, b.order === 0 ? K.trunkShape(sk) : null, step, (b.order === 0 && sk.capTrunk) || b.pruned);
  });
  else bl.forEach(function (b) {
    var sides = (K.sides || SIDES.hero)[Math.min(b.order, 5)];
    if (b.order >= 3 && bm.tris() > brBudget) return;
    if (b.rad[0] < 0.012) return;
    var step = b.order >= 4 ? Math.max(1, b.pts.length - 1) : b.order === 3 ? 2 : 1;
    tubeMesh(bm, b, sides, tile, bc, b.order === 0 ? K.trunkShape(sk) : null, step, (b.order === 0 && sk.capTrunk) || b.pruned);
  });
  // cards
  var nCards = Math.max(50, Math.floor((budget - bm.tris()) / 2)), per = nCards / Math.max(1, A.length);
  // mid: same sprig cards, fewer and bigger (same leaf area, so the canopy keeps its density and colour)
  var sizeMul = mid ? clamp(Math.sqrt(CONFIG.budget.hero * (1 - (K.branchShare || 0.38)) / 2 / nCards), 1, 3.2) : 1;
  var tintsL = K.tints(o), env = sk.env, bend0 = L.bend, cells = L.cells.map(function (c) { return inset(cellRect(c)); });
  var deadRect = inset(cellRect(3)), acc = 0, bend = bend0 == null ? 0.72 : bend0;
  if (mid) bend = Math.min(0.85, bend + 0.1);
  A.forEach(function (a) {
    acc += per; var k = Math.floor(acc); acc -= k;
    var sky = G.sky(a.p), hue = a.cl.hue, ci = hue < 0.5 ? 0 : hue < 0.82 ? 1 : 2;
    var base = tintsL[Math.min(ci, tintsL.length - 1)];
    var cc = a.cl.c;
    for (var j = 0; j < k; j++) {
      var out = env.grad(a.p), rd = randDir(R), sz = L.size * sizeMul * rr(R, 0.75, 1.25);
      var u = vnorm(vadd(vadd(vsc(a.d, L.dirW), vsc(out, L.outW)), vadd([0, L.upW, 0], vsc(rd, L.randW))));
      var fv = vnorm(vadd(vadd(vsc(out, 0.5), [0, L.faceUp, 0]), vsc(randDir(R), 0.7)));
      fv = vnorm(vsub(fv, vsc(u, vdot(fv, u)))); var s = vnorm(vcross(u, fv));
      var p = vadd(vmad(a.p, randDir(R), L.spread * sz), vsc(u, -sz * 0.12));
      var ao = lerp(0.38, 1.0, Math.pow(sky, 0.7)) * lerp(0.82, 1.0, smooth(sk.H * 0.15, sk.H * 0.75, p[1]));
      var col = mulc(mixc(base, tintsL[(ci + 1) % tintsL.length], R() * 0.25), ao * rr(R, 0.88, 1.12) * (mid ? 0.9 : 1));
      var dead = R() < (L.deadCards || 0) && a.ev < 0.85;
      var nf = (function (cc) {
        return function (q, f) {
          var hn = env.grad(q), cn = vnorm(vsub(q, cc)), vn = vnorm(vadd(vsc(hn, 0.55), vsc(cn, 0.45)));
          return vnorm(vadd(vsc(f, 1 - bend), vsc(vn, bend)));
        };
      })(cc);
      card(lm, p, u, s, fv, sz * (L.aspect || 1), sz, dead ? deadRect : cells[(R() * cells.length) | 0], nf, dead ? mulc([0.8, 0.75, 0.7], ao) : col, L.droop || 0.12);
    }
  });
  return { bark: bm.tris() ? bm.geometry() : null, leaf: lm.tris() ? lm.geometry() : null, leafMat: 'leaf:' + L.set,
    info: { anchors: A.length, clumps: cl.length, branches: sk.list.length, barkTris: bm.tris(), leafTris: lm.tris() } };
}

function buildMid(K, sk, o, budget) {
  var L = K.leaf, bm = new Mesher(), lm = new Mesher(), R = rng(seedOf(o.seed, 'mid'));
  var A = leafAnchors(sk, L, o), cl = clumpsOf(A, sk, o), G = lightGrid(sk, A, L.size * L.size * 0.45 * (L.perAnchor || 2.5));
  var bc = barkColor(K, sk, G, o), tile = BARK[K.bark(o)].tile, env = sk.env;
  var maxO = K.midOrders || 2;
  sk.list.forEach(function (b) {
    if (b.order > maxO || b.rad[0] < (K.midMinR || 0.05)) return;
    var sides = SIDES.mid[b.order], step = Math.max(1, Math.ceil(b.pts.length / (b.order === 0 ? 8 : b.order === 1 ? 6 : 3)));
    tubeMesh(bm, b, sides, tile, bc, b.order === 0 ? K.trunkShape(sk) : null, step, b.order === 0 && sk.capTrunk);
  });
  var nCards = Math.max(30, Math.floor((budget - bm.tris()) / 2)), per = nCards / Math.max(1, cl.length);
  var rect = inset(cellRect(K.clumpCell), 0.04), tintsL = K.tints(o), acc = 0, scale = K.midScale || 1;
  cl.forEach(function (c) {
    acc += per; var k = Math.max(1, Math.floor(acc)); acc -= k;
    var base = tintsL[c.hue < 0.5 ? 0 : c.hue < 0.82 ? 1 : 2] || tintsL[0];
    var sizeK = Math.sqrt(3 / Math.max(k, 1));
    for (var j = 0; j < k; j++) {
      var out = env.grad(c.c), m = c.members[(R() * c.members.length) | 0];
      var ctr = j === 0 ? c.c : vlerp(c.c, m.p, 0.6);
      var w = (c.r * 2.0 + L.size) * 1.15 * scale * rr(R, 0.85, 1.15) * Math.max(0.6, sizeK);
      var yaw = R() * TAU, a = [Math.cos(yaw), 0, Math.sin(yaw)], bv = vnorm(vadd([0, 1, 0], vsc(randDir(R), 0.35)));
      if (j % 3 === 2) { bv = vnorm([-a[2], 0.15, a[0]]); }        // one in three lies flat-ish (reads from above)
      if (j % 3 === 0) { a = vnorm(vcross([0, 1, 0], out)); if (vlen(a) < 0.1) a = [1, 0, 0]; }   // faces outward
      bv = vnorm(vsub(bv, vsc(a, vdot(bv, a))));
      ccard(lm, ctr, a, bv, w, w, rect, function (q, f) {
        var hn = env.grad(q), cn = vnorm(vsub(q, c.c));
        return vnorm(vadd(vsc(f, 0.15), vadd(vsc(hn, 0.5), vsc(cn, 0.35))));
      }, function (q) {
        var sky = G.sky(q);
        return mulc(base, lerp(0.35, 1.0, Math.pow(sky, 0.75)) * rr(R, 0.9, 1.08) * (K.midGain || 0.82));
      });
    }
  });
  return { bark: bm.tris() ? bm.geometry() : null, leaf: lm.geometry(), leafMat: 'clump', info: { clumps: cl.length, barkTris: bm.tris(), leafTris: lm.tris() } };
}

/* far: ~20 super-clumps (k-means of clumps) × 3 crossed cards + a prism trunk, all in the clump material */
function buildFar(K, sk, o, budget) {
  var L = K.leaf, lm = new Mesher(), R = rng(seedOf(o.seed, 'far'));
  var A = leafAnchors(sk, L, o), cl = clumpsOf(A, sk, o), G = lightGrid(sk, A, L.size * L.size * 0.45 * (L.perAnchor || 2.5)), env = sk.env;
  var bc0 = barkColor(K, sk, null, o), ft = (typeof K.farTint === 'function' ? K.farTint(o) : K.farTint) || [1, 1, 1], bc = function (b, i, p) { var c = bc0(b, i, p); return [c[0] * ft[0], c[1] * ft[1], c[2] * ft[2]]; };
  var rect = inset(cellRect(K.clumpCell), 0.04), cr = cellRect(K.clumpCell);
  var sw = [lerp(cr[0], cr[2], (BARKSWATCH[0] + BARKSWATCH[2]) / 2), lerp(cr[1], cr[3], (BARKSWATCH[1] + BARKSWATCH[3]) / 2)];
  // trunk + leaders as low prisms, UVs pinned to the bark swatch
  var tm = new Mesher();
  sk.list.forEach(function (b) {
    if (b.order > (K.farOrders == null ? 1 : K.farOrders) || b.rad[0] < 0.15) return;
    var keep = new Branch(b.order); keep.id = b.id; var n = b.pts.length, idx = b.order === 0 ? [0, Math.floor(n / 2), n - 1] : [0, Math.floor(n / 4), Math.floor(n / 2)];
    if (K.farTrunkRings && b.order === 0) { idx = []; for (var q = 0; q < K.farTrunkRings; q++) idx.push(Math.round(q / (K.farTrunkRings - 1) * (n - 1))); }
    idx.forEach(function (i) { keep.pts.push(b.pts[i]); keep.rad.push(b.rad[i]); }); keep.finish();
    tubeMesh(tm, keep, b.order === 0 ? 5 : 3, [1e6, 1e6], bc, null, 1, false);
  });
  for (var i = 0; i < tm.u.length; i += 2) { tm.u[i] = sw[0]; tm.u[i + 1] = sw[1]; }
  // k-means
  var nG = clamp(Math.floor((budget - tm.tris()) / 4), 4, K.farGroups || 30), cents = [];
  var srt = cl.slice().sort(function (a, b) { return b.n - a.n; });
  for (i = 0; i < Math.min(nG, srt.length); i++) cents.push(srt[Math.floor(i * srt.length / nG)].c.slice());
  var asg = new Array(cl.length);
  for (var it = 0; it < 8; it++) {
    cl.forEach(function (c, ci) { var best = 0, bd = 1e18; cents.forEach(function (ct, k) { var d = vdot(vsub(c.c, ct), vsub(c.c, ct)); if (d < bd) { bd = d; best = k; } }); asg[ci] = best; });
    var sums = cents.map(function () { return [0, 0, 0, 0]; });
    cl.forEach(function (c, ci) { var s = sums[asg[ci]]; s[0] += c.c[0] * c.n; s[1] += c.c[1] * c.n; s[2] += c.c[2] * c.n; s[3] += c.n; });
    cents = cents.map(function (ct, k) { var s = sums[k]; return s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : ct; });
  }
  var tintsL = K.tints(o);
  cents.forEach(function (ct, k) {
    var rs = 0, nn = 0;
    cl.forEach(function (c, ci) { if (asg[ci] === k) { var dd = vlen(vsub(c.c, ct)) + c.r * 0.8; rs += dd * dd * c.n; nn += c.n; } });
    if (!nn) return;
    var rad = Math.sqrt(rs / nn), w = (rad * 2 + L.size) * 1.25 * (K.farScale || 1), yaw = R() * TAU, a = [Math.cos(yaw), 0, Math.sin(yaw)], a2 = [-a[2], 0, a[0]];
    var base = tintsL[k % Math.min(2, tintsL.length)];
    if (o.season === 'winter' && K.deciduous) base = [0.62, 0.56, 0.5];   // bare twig mass
    var nf = function (q, f) { return vnorm(vadd(vsc(env.grad(q), 0.85), vsc(vnorm(vsub(q, ct)), 0.15))); };
    var cf = function (q) { return mulc(base, lerp(0.5, 1.0, Math.pow(G.sky(q), 0.75)) * (K.farGain || 0.8)); };
    ccard(lm, ct, a, [0, 1, 0], w, w * (K.farVert || 0.9), rect, nf, cf);
    ccard(lm, ct, a2, [0, 1, 0], w, w * (K.farVert || 0.9), rect, nf, cf);
  });
  // merge trunk into the leaf mesher (single draw call)
  var off = lm.v;
  for (i = 0; i < tm.v; i++) lm.vert([tm.p[i * 3], tm.p[i * 3 + 1], tm.p[i * 3 + 2]], [tm.n[i * 3], tm.n[i * 3 + 1], tm.n[i * 3 + 2]], tm.u[i * 2], tm.u[i * 2 + 1], [tm.c[i * 3], tm.c[i * 3 + 1], tm.c[i * 3 + 2]]);
  for (i = 0; i < tm.i.length; i++) lm.i.push(tm.i[i] + off);
  return { bark: null, leaf: lm.geometry(), leafMat: 'clump', info: { groups: cents.length, leafTris: lm.tris() } };
}

/* ================================================================== CLEARANCE PRUNING
   Arborist rule: limbs are kept a clearance away from a building.  o.avoid(x, y, z, r) (WORLD feet, r = branch radius)
   returns true inside the clearance volume (the caller inflates walls / roofs / decks by the clearance).  Every limb that
   enters it gets a reduction cut back to its last lateral before the hit (or a removal cut at its parent when it has no
   lateral there); everything beyond the cut goes with it, and a limb left with no live laterals is removed too.  The trunk
   is never cut (reported in info.trunkInside).  Leaf cards that would still reach into the volume are not emitted. */
function treeToWorld(o) {
  var at = o.at || [0, 0, 0], ry = o.ry || 0, c = Math.cos(ry), sn = Math.sin(ry), k = o.worldScale || 1;
  return function (p) { return [(p[0] * c + p[2] * sn) * k + at[0], p[1] * k + (at[1] || 0), (-p[0] * sn + p[2] * c) * k + (at[2] || 0)]; };
}
function avoidTest(o) { var xf = treeToWorld(o), av = o.avoid, k = o.worldScale || 1; return function (p, r) { var w = xf(p); return !!av(w[0], w[1], w[2], (r || 0) * k); }; }
/* first arclength at which the tube (centre line ± radius) enters the volume; -1 when it never does */
function tubeHit(b, test) {
  b.free = 0;   // arclength of the last sample known to be clear
  for (var i = 1; i < b.pts.length; i++) {
    var a = b.pts[i - 1], c = b.pts[i], L = b.cum[i] - b.cum[i - 1], n = Math.max(1, Math.ceil(L / 0.7));
    for (var j = 1; j <= n; j++) { var t = j / n; if (test(vlerp(a, c, t), lerp(b.rad[i - 1], b.rad[i], t) * 1.25 + 0.3)) return b.cum[i - 1] + L * t; b.free = b.cum[i - 1] + L * t; }   // + margin: the mesher's coarser rings cut corners
  }
  return -1;
}
function cutOff(b) { var st = [b]; while (st.length) { var x = st.pop(); x.cut = true; for (var i = 0; i < x.kids.length; i++) st.push(x.kids[i]); } }
function truncate(b, s) {   // keep [0, s] of the branch, re-normalise the laterals' attachment fractions
  var L0 = b.len, i = 1;
  while (i < b.pts.length - 1 && b.cum[i] < s) i++;
  var k = (s - b.cum[i - 1]) / Math.max(1e-6, b.cum[i] - b.cum[i - 1]), p = vlerp(b.pts[i - 1], b.pts[i], k), r = lerp(b.rad[i - 1], b.rad[i], k);
  b.pts = b.pts.slice(0, i).concat([p]); b.rad = b.rad.slice(0, i).concat([r]); b.finish();
  b.kids.forEach(function (c) { if (c.tp * L0 > s) cutOff(c); else c.tp = c.tp * L0 / b.len; });
}
function leafLen(sk) { var s = 0; sk.list.forEach(function (b) { if (!b.cut && b.order >= 2) s += b.len; }); return s; }
function pruneSkeleton(sk, o) {
  var test = avoidTest(o), info = { reduced: 0, removed: 0, trunkInside: false }, before = leafLen(sk);
  sk.list.forEach(function (b) {   // ids grow with generation: parents come before their laterals
    if (b.cut) return;
    if (b.order === 0) { if (tubeHit(b, test) >= 0) info.trunkInside = true; return; }
    var s = tubeHit(b, test); if (s < 0) return;
    var best = -1;
    var free = b.free;
    b.kids.forEach(function (c) { var at = c.tp * b.len; if (!c.cut && at < free - 0.1 && at > best) best = at; });
    if (best < 0) { cutOff(b); info.removed++; return; }                         // removal cut at the parent
    truncate(b, Math.min(free, best + Math.max(0.3, b.rad[0] * 1.5)));         // reduction cut just past the lateral (branch collar)
    b.pruned = true; info.reduced++;
  });
  for (var changed = true; changed;) {   // a reduced limb that lost all its laterals is a bare stub: take it off at its parent
    changed = false;
    sk.list.forEach(function (b) { if (b.cut) return; b.kids = b.kids.filter(function (c) { return !c.cut; });
      if (b.pruned && b.order > 0 && !b.kids.length) { cutOff(b); info.removed++; changed = true; } });
  }
  sk.list = sk.list.filter(function (b) { return !b.cut; });
  sk.list.forEach(function (b) { b.kids = b.kids.filter(function (c) { return !c.cut; }); });
  info.keep = before > 0 ? leafLen(sk) / before : 1;
  sk.keepFrac = info.keep; sk.pruneInfo = info;
  return info;
}

function buildParts(K, o) {
  var lod = o.lod || 'hero', sk = skeletonOf(K, o), budget = (o.budget || CONFIG.budget[lod]);
  if (o.avoid) { pruneSkeleton(sk, o); budget = Math.round(budget * clamp(sk.keepFrac, 0.25, 1)); var ct = avoidTest(o); CARDCLIP = function (p) { return ct(p, 0); }; CARDCLIP.n = 0; }
  try {
    var r = lod === 'far' ? buildFar(K, sk, o, budget) : lod === 'mid' ? buildHero(K, sk, o, budget, true) : buildHero(K, sk, o, budget);
  } finally { var clipped = CARDCLIP ? CARDCLIP.n : 0; CARDCLIP = null; }
  if (sk.pruneInfo) { sk.pruneInfo.cardsClipped = clipped; r.info.prune = sk.pruneInfo; }
  if (o.season === 'winter' && K.deciduous && lod !== 'far') { r.leaf = null; }
  r.barkMat = 'bark:' + K.bark(o);
  r.size = { height: sk.H, spread: sk.W };
  return r;
}
/* ================================================================== KINDS */
var KINDS = {}, KIND_ORDER = [];
function defKind(K) { KINDS[K.kind] = K; KIND_ORDER.push(K.kind); }

/* trunk cross-section: base flare + root buttress lobes + burls */
function flareShape(sk, lobes, flare, burl) {
  var s = sk.seed;
  return function (b, i, th, p) {
    var y = Math.max(0, p[1]), f = 1 + flare * Math.exp(-y / 1.6) + flare * 0.35 * Math.exp(-y / 5);
    var lb = 1 + lobes * Math.pow(0.5 + 0.5 * Math.cos(th * 5 + s % 7 + Math.sin(th * 3) * 0.8), 3) * Math.exp(-y / 2.2);
    var bu = 1 + burl * fbm3(Math.cos(th) * 1.3, y * 0.35, Math.sin(th) * 1.3, s, 3);
    return f * lb * bu;
  };
}

/* ---- decurrent crown program (oaks, bay, madrone, Monterey pine):
   trunk → leaders (low split) → limbs → branches → twigs, every order clipped by a lumpy crown envelope. */
function crownSkeleton(P) {
  return function (R, o) {
    var H = o.height, W = o.spread, r0 = o.trunkDia / 24, lean = dirAmount(o.lean, 0.15), bias = dirAmount(o.trunkBias, 0.25);
    var bdir = horiz(bias.az), ldir = horiz(lean.az), sd = seedOf(o.seed, 'env') & 0xffff;
    var E = P.env(H, W);
    var env = new Envelope({ c: [bdir[0] * bias.amt * W * 0.18 + ldir[0] * lean.amt * H * 0.3, E.cy, bdir[2] * bias.amt * W * 0.18 + ldir[2] * lean.amt * H * 0.3],
      rx: W / 2, up: E.up, down: E.down, flat: E.flat, lump: E.lump, seed: sd, bias: { az: bias.az, amt: bias.amt * 0.45 }, base: E.base });
    var sk = { env: env, H: H, W: W, roots: [], origin: [0, 0, 0], seed: sd, capTrunk: true };
    // trunk
    var sh = o.trunkHeight ? o.trunkHeight * rr(R, 0.95, 1.05) : H * rr(R, P.split[0], P.split[1]), td = vnorm([ldir[0] * lean.amt, 1, ldir[2] * lean.amt]);
    var trunk = growBranch(R, 0, { p: [0, -1.2, 0], d: td, len: sh + 1.2, r0: r0, r1: r0 * P.trunkTop, segs: Math.max(4, Math.round(sh / 1.2)), wobble: P.trunkWob, wf: 0.8 });
    var te = trunk.tip(), tdir = trunk.at(1).d, tr = trunk.rad[trunk.rad.length - 1];
    trunk.pts.push(vmad(te, tdir, tr * 0.45), vmad(te, tdir, tr * 0.8)); trunk.rad.push(tr * 0.8, tr * 0.35); trunk.finish();
    sk.roots.push(trunk); sk.trunk = trunk; sk.capTrunk = true;
    // leaders
    var n = clamp(Math.round(o.leaders), 1, 6), az0 = R() * TAU, leaders = [];
    for (var i = 0; i < n; i++) {
      var az = az0 + i / n * TAU + rr(R, -0.4, 0.4);
      if (bias.amt) { var dA = Math.atan2(Math.sin(bias.az - az), Math.cos(bias.az - az)); az += dA * bias.amt * 0.6; }
      var elev = (n === 1 ? rr(R, 70, 85) : rr(R, P.elev[0], P.elev[1])) * DEG;
      if (i === 0 && n > 2) elev = Math.max(elev, P.elev[1] * DEG);                       // one leader stays more upright
      var h = horiz(az), d = vnorm([h[0] * Math.cos(elev), Math.sin(elev), h[2] * Math.cos(elev)]);
      d = vnorm(vadd(d, vsc(td, P.leaderLift == null ? 0.25 : P.leaderLift)));
      var st = trunk.at(rr(R, P.leaderStart[0], P.leaderStart[1])), side = vdot(h, bdir);
      var reach = env.exit(st.p, d, 0.98, H * 2) * rr(R, P.leaderReach[0], P.leaderReach[1]) * (1 + bias.amt * side * 0.3);
      var lr = r0 * P.trunkTop * Math.sqrt(1.6 / n) * rr(R, 0.85, 1.1) * (1 + bias.amt * side * 0.2);
      var ld = growBranch(R, 1, { p: vmad(st.p, d, -lr * 0.3), d: d, len: reach, r0: Math.min(lr, r0 * P.trunkTop * 0.95), r1: Math.min(0.14, lr * P.leaderTip),
        segs: Math.max(8, Math.round(reach / 2)), up: P.leaderUp, wobble: P.leaderWob, wf: 1.1, taper: P.leaderTaper || 0.8, env: env, steer: P.leaderSteer == null ? 0.5 : P.leaderSteer, envLim: 1.0, minY: 3 });
      ld.parent = trunk; ld.tp = st.t; ld.minY = 3; trunk.kids.push(ld); leaders.push(ld);
    }
    var origin = [0, 0, 0], prev = leaders;
    P.levels.forEach(function (lv, li) {
      var next = [];
      prev.forEach(function (pb) {
        if (pb.dead) return;
        var s = {}; for (var k in lv) s[k] = lv[k];
        s.env = env;
        var kids = spawn(R, pb, s, origin);
        kids.forEach(function (c) {
          if (lv.deadInterior && env.val(c.tip()) < lv.deadInterior && R() < 0.45) { c.dead = true; }
        });
        next = next.concat(kids);
      });
      prev = next;
    });
    return sk;
  };
}

function oakTint(trunkHex, limbHex, twigHex) {
  var a = hexLin(trunkHex), b = hexLin(limbHex), c = hexLin(twigHex);
  return function (b0, p, sk) {
    var o = b0.order, t = o === 0 ? 0 : o === 1 ? 0.35 + 0.4 * smooth(4, sk.H * 0.6, p[1]) : 0.85;
    var col = t < 1 ? mixc(a, b, t) : b;
    if (o >= 3) col = mixc(b, c, 0.6);
    return col;
  };
}

/* ---------------------------------------------------------------- coast live oak (hero) */
defKind({
  kind: 'coastLiveOak', latin: 'Quercus agrifolia', common: 'Coast live oak',
  note: 'Hero tree. Short massive trunk splitting low into 2–5 sinuous, wide-spreading limbs that arch toward horizontal; broad irregular dome of dense, dark glossy evergreen foliage in clumps with sky holes; grey-brown furrowed bark, paler grey on the upper limbs; dead twigs inside.',
  defaults: { height: 45, spread: 60, trunkDia: 28, trunkHeight: null, lean: null, leaders: 4, density: 1, trunkBias: null, seed: 1 },
  options: { height: 'ft (30–70)', spread: 'crown width ft (35–75)', trunkDia: 'trunk diameter at breast height, inches', trunkHeight: 'ft to the first split (default ≈ 0.17–0.26 × height)', lean: "{dir:'NW'|radians, amount 0–0.5}", leaders: '2–5 main limbs from the low split',
    density: 'foliage 0.4–1.3', trunkBias: "{dir:'NW', amount 0–0.6} — heavier/longer canopy to that side", seed: 'int' },
  bark: function () { return 'liveOak'; }, clumpCell: 0,
  barkTint: oakTint('#bdb7ae', '#c2beb6', '#b9b2a8'),
  tints: function () { return [[1.45, 1.5, 1.15], [1.85, 1.68, 0.9], [1.25, 1.42, 1.3]]; },
  trunkShape: function (sk) { return flareShape(sk, 0.28, 0.5, 0.08); },
  leaf: { set: 'clo', cells: [0, 1, 2], size: 2.2, step: 0.45, t0: 0.2, order: 4, minOrder: 3, clumpOrder: 3, shell: [0.38, 0.75], holes: 0.22, holeF: 0.075,
    dirW: 0.4, outW: 0.7, upW: 0.25, randW: 0.6, faceUp: 0.6, spread: 0.55, bend: 0.72, droop: 0.1, deadCards: 0.02, along: true, perAnchor: 2.4 },
  branchShare: 0.32,
  skeleton: crownSkeleton({
    env: function (H, W) { return { cy: H * 0.58, up: H * 0.42, down: H * 0.34, flat: 2.6, lump: 0.22, base: H * 0.22 }; },
    split: [0.17, 0.26], trunkTop: 0.92, trunkWob: 0.25, elev: [32, 62], leaderStart: [0.68, 0.92], leaderReach: [0.85, 0.97], leaderTip: 0.28, leaderTaper: 1.5,
    leaderUp: [0.012, -0.035], leaderWob: 0.9, leaderLift: 0.08, leaderSteer: 0.25,
    levels: [
      { perFt: 0.34, t: [0.1, 0.98], angle: [30, 62], len: [0.5, 0.85], rr: 0.7, tip: 0.2, taper: 1.3, segs: 11, up: [0.02, -0.03], wobble: 0.9, kink: 0.1, outward: 0.2, horiz: 0.05, upBias: 0.32, envK: 0.97, minR: 0.05, minLen: 3, minY: 9 },
      { perFt: 0.42, t: [0.15, 1.0], angle: [30, 65], len: [0.3, 0.5], rr: 0.55, tip: 0.3, segs: 6, up: [0.02, -0.02], wobble: 0.8, kink: 0.28, outward: 0.25, upBias: 0.15, envK: 1.0, minR: 0.026, minLen: 1.5, deadInterior: 0.45 },
      { perFt: 1.8, t: [0.3, 1.0], angle: [35, 80], lenAbs: [1.0, 2.2], rr: 0.6, tip: 0.4, segs: 2, kink: 0.35, upBias: 0.15, envK: 1.1, minR: 0.018, minLen: 0.6 }
    ]
  })
});

/* ---------------------------------------------------------------- valley oak (deciduous, broad, weeping outer limbs) */
defKind({
  kind: 'valleyOak', latin: 'Quercus lobata', common: 'Valley oak', deciduous: true,
  note: 'Largest California oak: broad, open, with long arching limbs whose outer twigs weep; pale checkered bark; deeply lobed matte leaves. season:"winter" → bare.',
  defaults: { height: 65, spread: 70, trunkDia: 36, lean: null, leaders: 3, density: 1, trunkBias: null, season: null, seed: 1 },
  options: { height: 'ft (50–90)', spread: 'ft', trunkDia: 'in', lean: '{dir, amount}', leaders: '2–4', density: '0.4–1.3', trunkBias: '{dir, amount}', season: "null|'winter'" },
  bark: function () { return 'valleyOak'; }, clumpCell: 1,
  barkTint: oakTint('#d8d4cc', '#e8e6e0', '#d0c9bf'),
  tints: function () { return [[1.0, 1.0, 0.9], [1.15, 1.08, 0.72], [0.95, 1.02, 0.95]]; },
  trunkShape: function (sk) { return flareShape(sk, 0.18, 0.28, 0.05); },
  leaf: { set: 'deciduous', cells: [0, 2, 0], size: 1.7, step: 0.7, t0: 0.2, order: 4, minOrder: 3, clumpOrder: 3, shell: [0.48, 0.8], holes: 0.3, holeF: 0.06,
    dirW: 0.6, outW: 0.5, upW: -0.25, randW: 0.6, faceUp: 0.5, spread: 0.55, bend: 0.7, droop: 0.2, deadCards: 0.015, along: true, perAnchor: 2.4 },
  skeleton: crownSkeleton({
    env: function (H, W) { return { cy: H * 0.55, up: H * 0.45, down: H * 0.45, flat: 2.2, lump: 0.15, base: H * 0.1 }; },
    split: [0.18, 0.28], trunkTop: 0.8, trunkWob: 0.15, elev: [40, 68], leaderStart: [0.75, 1.0], leaderReach: [0.85, 0.97], leaderTip: 0.22,
    leaderUp: [0.01, -0.04], leaderWob: 0.6,
    levels: [
      { perFt: 0.22, t: [0.15, 0.98], angle: [25, 55], len: [0.5, 0.85], rr: 0.6, tip: 0.2, segs: 9, up: [0.01, -0.05], wobble: 0.6, outward: 0.35, upBias: 0.15, envK: 0.98, minR: 0.05, minLen: 3 },
      { perFt: 0.45, t: [0.2, 1.0], angle: [30, 65], len: [0.35, 0.6], rr: 0.58, tip: 0.3, segs: 4, up: [-0.02, -0.08], wobble: 0.5, outward: 0.15, upBias: 0.0, envK: 1.0, minR: 0.028, minLen: 1.5, deadInterior: 0.45 },
      { perFt: 0.65, t: [0.3, 1.0], angle: [30, 70], lenAbs: [1.8, 3.4], rr: 0.6, tip: 0.4, segs: 1, upBias: -0.3, envK: 1.1, minR: 0.018, minLen: 0.8 }
    ]
  })
});

/* ---------------------------------------------------------------- black oak (deciduous, upright oval) */
defKind({
  kind: 'blackOak', latin: 'Quercus kelloggii', common: 'California black oak', deciduous: true,
  note: 'Upright, oval-crowned deciduous oak with steep leaders, dark ridged bark and glossy, bristle-lobed leaves. season:"winter" → bare.',
  defaults: { height: 55, spread: 42, trunkDia: 24, lean: null, leaders: 3, density: 1, trunkBias: null, season: null, seed: 1 },
  options: { height: 'ft (35–75)', spread: 'ft', trunkDia: 'in', lean: '{dir, amount}', leaders: '2–4', density: '0.4–1.3', trunkBias: '{dir, amount}', season: "null|'winter'" },
  bark: function () { return 'blackOak'; }, clumpCell: 1,
  barkTint: oakTint('#c6c0b8', '#dcd7cf', '#cfc7bd'),
  tints: function () { return [[0.95, 1.0, 0.95], [1.1, 1.08, 0.8], [0.88, 0.98, 1.0]]; },
  trunkShape: function (sk) { return flareShape(sk, 0.15, 0.25, 0.05); },
  leaf: { set: 'deciduous', cells: [1, 1, 2], size: 1.6, step: 0.65, t0: 0.22, order: 4, minOrder: 3, clumpOrder: 3, shell: [0.5, 0.82], holes: 0.3, holeF: 0.08,
    dirW: 0.5, outW: 0.6, upW: 0.15, randW: 0.6, faceUp: 0.6, spread: 0.5, bend: 0.7, droop: 0.12, deadCards: 0.015, along: true, perAnchor: 2.4 },
  skeleton: crownSkeleton({
    env: function (H, W) { return { cy: H * 0.6, up: H * 0.4, down: H * 0.36, flat: 2.0, lump: 0.15, base: H * 0.22 }; },
    split: [0.22, 0.32], trunkTop: 0.8, trunkWob: 0.15, elev: [58, 78], leaderStart: [0.75, 1.0], leaderReach: [0.85, 0.97], leaderTip: 0.2,
    leaderUp: [0.01, -0.005], leaderWob: 0.5,
    levels: [
      { perFt: 0.26, t: [0.15, 0.98], angle: [25, 50], len: [0.45, 0.75], rr: 0.6, tip: 0.22, segs: 8, up: [0.02, -0.01], wobble: 0.5, outward: 0.3, upBias: 0.3, envK: 0.98, minR: 0.05, minLen: 3 },
      { perFt: 0.5, t: [0.2, 1.0], angle: [30, 60], len: [0.35, 0.6], rr: 0.58, tip: 0.3, segs: 4, up: [0.02, -0.02], wobble: 0.4, outward: 0.1, upBias: 0.25, envK: 1.0, minR: 0.028, minLen: 1.5, deadInterior: 0.45 },
      { perFt: 0.7, t: [0.3, 1.0], angle: [30, 65], lenAbs: [1.5, 3.0], rr: 0.6, tip: 0.4, segs: 1, upBias: 0.2, envK: 1.08, minR: 0.018, minLen: 0.8 }
    ]
  })
});

/* ---------------------------------------------------------------- generic broadleaf evergreen: bay laurel | madrone */
defKind({
  kind: 'broadleaf', latin: 'Umbellularia californica | Arbutus menziesii', common: 'Bay laurel / madrone',
  note: "Neighbourhood evergreen broadleaf. species:'bay' (dense multi-stem dome, smooth grey bark, lance leaves) or 'madrone' (leaning sinuous red trunk, open crown, broad glossy leaves).",
  defaults: { species: 'bay', height: 40, spread: 32, trunkDia: 16, lean: null, leaders: 4, density: 1, trunkBias: null, seed: 1 },
  options: { species: "'bay'|'madrone'", height: 'ft (25–60)', spread: 'ft', trunkDia: 'in', lean: '{dir, amount}', leaders: '2–6 stems', density: '0.4–1.3', trunkBias: '{dir, amount}' },
  bark: function (o) { return o.species === 'madrone' ? 'madrone' : 'smooth'; }, clumpCell: 0, farTint: function (o) { return o.species === 'madrone' ? [1.7, 0.75, 0.5] : [1.05, 1.0, 0.92]; },
  barkTint: function (b, p, sk) { return b.order >= 3 ? [1.05, 0.95, 0.8] : [1, 1, 1]; },
  tints: function (o) { return o.species === 'madrone' ? [[1.05, 1.05, 0.9], [1.2, 1.1, 0.75], [0.95, 1.02, 1.0]] : [[1.0, 1.02, 0.95], [1.12, 1.1, 0.8], [0.9, 1.0, 1.0]]; },
  trunkShape: function (sk) { return flareShape(sk, 0.1, 0.2, 0.03); },
  leaf: { set: 'broadleaf', cells: [0, 2, 0], size: 1.6, step: 0.55, t0: 0.22, order: 4, minOrder: 3, clumpOrder: 3, shell: [0.45, 0.78], holes: 0.4, holeF: 0.09,
    dirW: 0.5, outW: 0.6, upW: 0.3, randW: 0.6, faceUp: 0.6, spread: 0.5, bend: 0.72, droop: 0.1, deadCards: 0.01, along: true, perAnchor: 2.4 },
  skeleton: function (R, o) {
    var mad = o.species === 'madrone';
    return crownSkeleton(mad ? {
      env: function (H, W) { return { cy: H * 0.62, up: H * 0.38, down: H * 0.3, flat: 2.0, lump: 0.25, base: H * 0.3 }; },
      split: [0.25, 0.35], trunkTop: 0.8, trunkWob: 0.6, elev: [45, 70], leaderStart: [0.7, 1.0], leaderReach: [0.85, 0.97], leaderTip: 0.22,
      leaderUp: [0.025, 0.0], leaderWob: 0.55,
      levels: [
        { perFt: 0.22, t: [0.25, 0.98], angle: [25, 50], len: [0.45, 0.8], rr: 0.6, tip: 0.22, segs: 8, up: [0.02, 0.0], wobble: 0.9, outward: 0.25, upBias: 0.35, envK: 0.98, minR: 0.04, minLen: 2.5 },
        { perFt: 0.5, t: [0.3, 1.0], angle: [30, 60], len: [0.35, 0.6], rr: 0.58, tip: 0.3, segs: 3, up: [0.02, 0.0], wobble: 0.5, outward: 0.1, upBias: 0.3, envK: 1.0, minR: 0.025, minLen: 1.2 },
        { perFt: 0.7, t: [0.4, 1.0], angle: [30, 60], lenAbs: [1.2, 2.4], rr: 0.6, tip: 0.4, segs: 1, upBias: 0.3, envK: 1.08, minR: 0.016, minLen: 0.7 }
      ] } : {
      env: function (H, W) { return { cy: H * 0.55, up: H * 0.45, down: H * 0.45, flat: 2.0, lump: 0.12, base: H * 0.08 }; },
      split: [0.03, 0.06], trunkTop: 0.75, trunkWob: 0.1, elev: [55, 78], leaderStart: [0.3, 0.9], leaderReach: [0.85, 0.97], leaderTip: 0.2,
      leaderUp: [0.015, 0.0], leaderWob: 0.6,
      levels: [
        { perFt: 0.3, t: [0.2, 0.98], angle: [25, 50], len: [0.4, 0.7], rr: 0.6, tip: 0.22, segs: 6, up: [0.02, 0.0], wobble: 0.5, outward: 0.3, upBias: 0.3, envK: 0.98, minR: 0.04, minLen: 2 },
        { perFt: 0.6, t: [0.2, 1.0], angle: [30, 60], len: [0.35, 0.6], rr: 0.58, tip: 0.3, segs: 3, up: [0.02, -0.01], wobble: 0.4, outward: 0.15, upBias: 0.2, envK: 1.0, minR: 0.025, minLen: 1.2, deadInterior: 0.4 },
        { perFt: 0.8, t: [0.3, 1.0], angle: [30, 65], lenAbs: [1.2, 2.4], rr: 0.6, tip: 0.4, segs: 1, upBias: 0.2, envK: 1.08, minR: 0.016, minLen: 0.7 }
      ] })(R, o);
  }
});
KINDS.broadleaf.leafFor = function (o) { return o.species === 'madrone' ? [1, 1, 0] : [0, 2, 0]; };

/* ---------------------------------------------------------------- Monterey pine */
defKind({
  kind: 'pine', latin: 'Pinus radiata', common: 'Monterey pine',
  note: 'Mature Monterey pine: tall trunk forking high into 2–3 leaders, broad irregular flat-topped crown, upswept branch ends carrying dark needle tufts; deeply furrowed dark bark.',
  defaults: { height: 75, spread: 45, trunkDia: 30, lean: null, leaders: 3, density: 1, trunkBias: null, seed: 1 },
  options: { height: 'ft (50–110)', spread: 'ft', trunkDia: 'in', lean: '{dir, amount}', leaders: '1–4', density: '0.4–1.3', trunkBias: '{dir, amount}' },
  bark: function () { return 'pine'; }, clumpCell: 3, farTint: [0.85, 0.8, 0.78],
  barkTint: function (b) { return b.order >= 2 ? [1.1, 1.0, 0.95] : [1, 1, 1]; },
  tints: function () { return [[1.0, 1.0, 1.0], [1.1, 1.06, 0.85], [0.9, 0.98, 1.05]]; },
  trunkShape: function (sk) { return flareShape(sk, 0.12, 0.22, 0.03); },
  leaf: { set: 'pine', cells: [0, 1, 2], size: 1.9, step: 0.75, t0: 0.55, order: 3, minOrder: 2, clumpOrder: 2, shell: [0.35, 0.7], holes: 0.15, holeF: 0.06,
    dirW: 0.9, outW: 0.4, upW: 0.45, randW: 0.45, faceUp: 0.3, spread: 0.4, bend: 0.68, droop: 0.05, deadCards: 0.02, along: true, perAnchor: 2.8 },
  sides: [16, 10, 6, 4, 3, 3], branchShare: 0.3,
  skeleton: crownSkeleton({
    env: function (H, W) { return { cy: H * 0.66, up: H * 0.34, down: H * 0.32, flat: 2.6, lump: 0.25, base: H * 0.32 }; },
    split: [0.45, 0.6], trunkTop: 0.7, trunkWob: 0.15, elev: [60, 80], leaderStart: [0.85, 1.0], leaderReach: [0.85, 0.95], leaderTip: 0.15,
    leaderUp: [0.01, 0.0], leaderWob: 0.5,
    levels: [
      { perFt: 0.55, t: [0.0, 0.95], angle: [55, 85], len: [0.5, 0.9], rr: 0.45, tip: 0.25, segs: 6, up: [-0.01, 0.06], wobble: 0.5, outward: 0.5, upBias: 0.05, envK: 1.0, minR: 0.04, minLen: 2.5 },
      { perFt: 0.7, t: [0.35, 1.0], angle: [30, 55], len: [0.25, 0.45], rr: 0.55, tip: 0.35, segs: 2, up: [0.03, 0.08], wobble: 0.3, outward: 0.1, upBias: 0.35, envK: 1.05, minR: 0.025, minLen: 1, deadInterior: 0.4 }
    ]
  })
});

/* ---------------------------------------------------------------- coast redwood (excurrent) */
defKind({
  kind: 'coastRedwood', latin: 'Sequoia sempervirens', common: 'Coast redwood',
  note: 'Tall narrow cone with a straight, flared, fibrous red-brown trunk; branches droop then turn up at the tips and carry hanging flat sprays. crowded:true (default) keeps foliage to the upper two-thirds.',
  defaults: { height: 100, spread: 28, trunkDia: 48, lean: null, crowded: true, density: 1, seed: 1 },
  options: { height: 'ft (60–120)', spread: 'ft (≈ 0.25–0.35 × height)', trunkDia: 'in', lean: '{dir, amount} (small)', crowded: 'true → bare lower third (stand-grown)', density: '0.4–1.3' },
  bark: function () { return 'redwood'; }, clumpCell: 2, farTint: [1.6, 0.85, 0.65],
  barkTint: function (b) { return b.order >= 1 ? [0.85, 0.8, 0.78] : [1, 1, 1]; },
  tints: function () { return [[1.0, 1.0, 0.95], [1.12, 1.08, 0.8], [0.92, 1.0, 1.0]]; },
  trunkShape: function (sk) { return flareShape(sk, 0.3, 0.45, 0.04); },
  leaf: { set: 'redwood', cells: [0, 1, 2], size: 2.6, step: 0.45, t0: 0.05, order: 2, minOrder: 1, clumpOrder: 2, shell: [-1, 0.2], holes: 0.45, holeF: 0.1,
    dirW: 0.7, outW: 0.35, upW: -0.5, randW: 0.5, faceUp: 0.15, spread: 0.35, bend: 0.65, droop: 0.15, deadCards: 0.02, along: true, perAnchor: 2.4 },
  sides: [18, 5, 3, 3, 3, 3], branchShare: 0.3, midOrders: 1, midMinR: 0.3, farOrders: 0, farTrunkRings: 4, farGroups: 34, farVert: 1.2, midScale: 1.05,
  skeleton: function (R, o) {
    var H = o.height, W = o.spread, r0 = o.trunkDia / 24, lean = dirAmount(o.lean, 0.03), ld = horiz(lean.az), sd = seedOf(o.seed, 'env') & 0xffff;
    var base = o.crowded === false ? H * 0.08 : H * 0.33;
    var env = new Envelope({ c: [0, base, 0], rx: W / 2, up: H - base, down: 3, cone: 0.95, lump: 0.12, seed: sd });
    var sk = { env: env, H: H, W: W, roots: [], origin: [0, 0, 0], seed: sd, capTrunk: false };
    var trunk = growBranch(R, 0, { p: [0, -0.4, 0], d: vnorm([ld[0] * lean.amt, 1, ld[2] * lean.amt]), len: H - 3, r0: r0, r1: 0.06, segs: 26, wobble: 0.008, taper: 0.75 });
    sk.roots.push(trunk); sk.trunk = trunk;
    // whorl-ish primary branches, horizontal-to-drooping, upturned tips
    var y0 = Math.max(4, base - H * 0.08), nB = Math.round((H - y0) * 1.25 * Math.min(1.3, o.density || 1));
    var br = [];
    for (var i = 0; i < nB; i++) {
      var t = (y0 + (H * 0.985 - y0) * (i + R() * 0.8) / nB) / H, a = trunk.at(t), y = a.p[1];
      var az = i * 137.5 * DEG + rr(R, -0.3, 0.3), h = horiz(az), dn = rr(R, -0.35, 0.05) - 0.2 * smooth(0.5, 1, 1 - t);
      var d = vnorm([h[0], dn + 0.4 * smooth(0.75, 1, t), h[2]]);
      var room = env.exit(a.p, d, 1.0, W) * rr(R, 0.85, 1.05);
      if (y < base) { room = Math.min(room, rr(R, 1, 4)); }
      if (room < 1) continue;
      var rb = clamp(0.035 * room + 0.03, 0.04, r0 * 0.18);
      var b = growBranch(R, 1, { p: a.p, d: d, len: room + a.r, r0: rb, r1: 0.03, segs: Math.max(3, Math.round(room / 2.5)), up: [-0.05, 0.12], wobble: 0.3 });
      b.parent = trunk; b.tp = t; trunk.kids.push(b);
      if (y < base) { b.dead = true; continue; }
      br.push(b);
    }
    // branchlets in two ranks, drooping
    br.forEach(function (b) {
      spawn(R, b, { perFt: 1.4, t: [0.1, 1.0], angle: [45, 80], lenAbs: [1.6, 3.4], rr: 0.6, tip: 0.4, segs: 2, up: [-0.12, -0.2], plane: true, minR: 0.014, minLen: 0.6 }, [0, 0, 0]);
    });
    return sk;
  }
});

/* per-kind dynamic leaf cells (broadleaf species) */
function leafSpec(K, o) {
  if (!K.leafFor) return K.leaf;
  var L = {}; for (var k in K.leaf) L[k] = K.leaf[k];
  L.cells = K.leafFor(o);
  return L;
}
/* ================================================================== API */
var LODS = ['hero', 'mid', 'far'];
function kindFor(kind) {
  var K = KINDS[kind];
  if (!K) throw new Error('TREES: unknown kind "' + kind + '" (have ' + KIND_ORDER.join(', ') + ')');
  return K;
}
function partsFor(kind, o) {
  var K = kindFor(kind), oo = opt(K.defaults, o);
  oo.lod = LODS.indexOf(o && o.lod) >= 0 ? o.lod : 'hero';
  var K2 = Object.create(K); K2.leaf = leafSpec(K, oo);
  var t0 = now(), r = buildParts(K2, oo);
  if (oo.season === 'winter' && K.deciduous && oo.lod === 'far') { /* keep a thin canopy so far bare trees still read */ }
  r.ms = now() - t0; r.opts = oo;
  return r;
}
function now() { return (typeof performance !== 'undefined' ? performance : Date).now(); }
function partMesh(geo, matName, leafy, inst, count) {
  var m = inst ? new THREE.InstancedMesh(geo, TREES.mat(matName), count) : new THREE.Mesh(geo, TREES.mat(matName));
  m.castShadow = true; m.receiveShadow = true;
  if (leafy) m.customDepthMaterial = depthMat(matName);
  if (inst) m.frustumCulled = false;
  return m;
}

/* TREES.make(kind, {lod:'hero'|'mid'|'far', seed, ...kind options, at:[x,y,z], ry}) → THREE.Group */
var MADE = {};
TREES.make = function (kind, o) {
  o = o || {};
  var key = o.cacheKey ? kind + '|' + o.cacheKey : null, r = key && MADE[key] ? MADE[key] : partsFor(kind, o), g = new THREE.Group(), tris = 0;
  if (key) MADE[key] = r;   // TREES.make with the same cacheKey reuses the geometry (lets a page pre-build trees in idle time)
  if (r.bark) { var b = partMesh(r.bark, r.barkMat, false); b.name = 'bark'; g.add(b); tris += triCount(r.bark); }
  if (r.leaf) { var l = partMesh(r.leaf, r.leafMat, true); l.name = 'leaf'; g.add(l); tris += triCount(r.leaf); }
  g.name = kind + ':' + r.opts.lod;
  g.userData = { kind: kind, lod: r.opts.lod, opts: r.opts, size: r.size, triangles: tris, info: r.info, buildMs: Math.round(r.ms) };
  if (o.at) g.position.set(o.at[0], o.at[1] || 0, o.at[2] || 0);
  if (o.ry) g.rotation.y = o.ry;
  return g;
};

/* geometry cache for forests: kind|lod|variant → parts */
var GEO = {};
function variantParts(kind, lod, v, base, kopts) {
  var key = kind + '|' + lod + '|' + v + '|' + base + '|' + (kopts ? JSON.stringify(kopts) : '');
  if (!GEO[key]) { var o = opt(kopts || {}, { lod: lod, seed: base * 7919 + v * 104729 + 11 }); GEO[key] = partsFor(kind, o); }
  return GEO[key];
}

/* TREES.forest(points, opts) → Group of InstancedMesh per kind × LOD × variant × part.
   points: [{kind, x, z, y?, scale?, seed?, ry?}]
   opts: {center:[x,z] | Vector3, lodRadii:[120,400], variants:{hero:1, mid:2, far:2}, heightAt(x,z), seed, kindOpts:{kind:{...}},
          shadows:{hero:true, mid:true, far:true}, sink:0.4} */
TREES.forest = function (points, opts) {
  opts = opt({ center: [0, 0], lodRadii: [120, 400], variants: { hero: 1, mid: 2, far: 2 }, heightAt: null, seed: 1, kindOpts: {}, shadows: { hero: true, mid: true, far: true }, sink: 0.4 }, opts);
  var group = new THREE.Group(); group.name = 'trees:forest';
  var meshes = {}, t0 = now(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  var pts = points.map(function (p, i) {
    var s = p.seed != null ? p.seed : i * 7 + 1, R = rng(seedOf(s, 'inst'));
    var y = p.y != null ? p.y : opts.heightAt ? opts.heightAt(p.x, p.z) : 0;
    return { kind: p.kind, x: p.x, z: p.z, y: y - (opts.sink || 0) * (p.scale || 1), s: p.scale || 1, ry: p.ry != null ? p.ry : R() * TAU, h: (R() * 1e9) | 0, src: p };
  });
  // clearance: an instance whose geometry (any LOD it can switch to) reaches into opts.avoid is not planted; the caller gets it
  // back in userData.rejected (instances share geometry, so they cannot be pruned one by one)
  var rejected = [];
  if (opts.avoid) {
    var bx = opts.avoidBox, v3 = new THREE.Vector3(), mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), YY = new THREE.Vector3(0, 1, 0);
    pts = pts.filter(function (p) {
      var D = kindFor(p.kind).defaults, kd = opts.kindOpts[p.kind] || {}, reach = Math.max((kd.height || D.height || 60), (kd.spread || D.spread || 60)) * p.s + 4;
      if (bx && (p.x + reach < bx[0] || p.x - reach > bx[3] || p.z + reach < bx[2] || p.z - reach > bx[5])) return true;
      mm.compose(v3.set(p.x, p.y, p.z), qq.setFromAxisAngle(YY, p.ry), new THREE.Vector3(p.s, p.s, p.s));
      var seen = {}, bad = false;
      LODS.forEach(function (lod) {
        var v = p.h % (opts.variants[lod] || 1), key = lod + v; if (bad || seen[key]) return; seen[key] = 1;
        var parts = variantParts(p.kind, lod, v, opts.seed, opts.kindOpts[p.kind]);
        [parts.bark, parts.leaf].forEach(function (g) {
          if (!g || bad) return; var P = g.attributes.position;
          for (var i = 0; i < P.count; i++) { v3.fromBufferAttribute(P, i).applyMatrix4(mm); if (opts.avoid(v3.x, v3.y, v3.z, 0)) { bad = true; return; } }
        });
      });
      if (bad) rejected.push(p.src);
      return !bad;
    });
  }
  function lodOf(p, c) { var d = Math.hypot(p.x - c[0], p.z - c[1]); return d < opts.lodRadii[0] ? 'hero' : d < opts.lodRadii[1] ? 'mid' : 'far'; }
  function cap(kind) { var n = 0; pts.forEach(function (p) { if (p.kind === kind) n++; }); return n; }
  function bucket(kind, lod, v) {
    var key = kind + '|' + lod + '|' + v;
    if (!meshes[key]) {
      var parts = variantParts(kind, lod, v, opts.seed, opts.kindOpts[kind]), n = cap(kind), list = [];
      if (parts.bark) list.push(partMesh(parts.bark, parts.barkMat, false, true, n));
      if (parts.leaf) list.push(partMesh(parts.leaf, parts.leafMat, true, true, n));
      list.forEach(function (m) { m.name = key + (m.customDepthMaterial ? ':leaf' : ':bark'); m.castShadow = !!opts.shadows[lod]; m.count = 0; group.add(m); });
      meshes[key] = { list: list, n: 0, tris: list.reduce(function (a, m) { return a + triCount(m.geometry); }, 0) };
    }
    return meshes[key];
  }
  var vis = null, sph = new THREE.Sphere();
  function setCenter(cx, cz) {
    var c = [cx, cz], k;
    for (k in meshes) meshes[k].n = 0;
    pts.forEach(function (p) {
      var lod = lodOf(p, c), v = p.h % (opts.variants[lod] || 1), b = bucket(p.kind, lod, v);
      pos.set(p.x, p.y, p.z); q.setFromAxisAngle(Y, p.ry); sc.set(p.s, p.s, p.s); m4.compose(pos, q, sc);
      b.list.forEach(function (m) { m.setMatrixAt(b.n, m4); });
      b.n++;
      // bounds of this instance (union of its parts' spheres, + 2 ft for the wind sway) for per-frame culling
      p.b = b; p.me = p.me || new Float32Array(16); m4.toArray(p.me);
      var r = 0; sph.makeEmpty(); b.list.forEach(function (m) { var bs = m.geometry.boundingSphere || (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere); if (sph.isEmpty()) sph.copy(bs); else sph.union(bs); });
      sph.applyMatrix4(m4); p.sc = sph.center.clone(); p.sr = sph.radius + 2;
    });
    vis = null;
    var tris = 0, calls = 0, inst = { hero: 0, mid: 0, far: 0 };
    for (k in meshes) {
      var b = meshes[k];
      b.list.forEach(function (m) { m.count = b.n; m.visible = b.n > 0; m.instanceMatrix.needsUpdate = true; if (b.n) calls++; });
      tris += b.tris * b.n; inst[k.split('|')[1]] += b.n;
    }
    group.userData.stats = { trees: pts.length, drawCalls: calls, triangles: tris, byLod: inst, meshes: Object.keys(meshes).length };
    return group.userData.stats;
  }
  var c0 = opts.center && opts.center.isVector3 ? [opts.center.x, opts.center.z] : (opts.center || [0, 0]);
  setCenter(c0[0], c0[1]);
  group.userData.buildMs = Math.round(now() - t0);
  group.userData.rejected = rejected;
  /* cull(frusta): plant only the instances that touch one of the frusta (the view and, for shadow casters, the sun's
     shadow box), so trees behind the camera cost nothing.  Rewrites the instance buffers only when the set changes. */
  group.userData.cull = function (frusta) {
    var k, changed = !vis, i, p;
    if (!vis) vis = new Uint8Array(pts.length);
    for (i = 0; i < pts.length; i++) {
      p = pts[i]; if (!p.b) continue; sph.center.copy(p.sc); sph.radius = p.sr;
      var v = 0; for (var f = 0; f < frusta.length; f++) if (frusta[f].intersectsSphere(sph)) { v = 1; break; }
      if (v !== vis[i]) { vis[i] = v; changed = true; }
    }
    if (!changed) return false;
    for (k in meshes) meshes[k].n = 0;
    for (i = 0; i < pts.length; i++) { p = pts[i]; if (!vis[i] || !p.b) continue; var b = p.b; for (var j = 0; j < b.list.length; j++) b.list[j].instanceMatrix.array.set(p.me, b.n * 16); b.n++; }
    for (k in meshes) { var bb = meshes[k]; bb.list.forEach(function (m) { m.count = bb.n; m.visible = bb.n > 0; m.instanceMatrix.needsUpdate = true; }); }
    return true;
  };
  group.userData.setCenter = function (x, z) { if (x && x.isVector3) { z = x.z; x = x.x; } return setCenter(x, z); };
  return group;
};

TREES.kinds = KIND_ORDER.map(function (k) {
  var K = KINDS[k];
  return { kind: k, latin: K.latin, common: K.common, defaults: K.defaults, options: K.options, note: K.note, deciduous: !!K.deciduous };
});
TREES.stats = function (obj) {
  var tris = 0, meshes = 0, instances = 0, calls = 0;
  obj.traverse(function (m) {
    if (!m.isMesh || m.visible === false) return;
    meshes++; var t = triCount(m.geometry);
    if (m.isInstancedMesh) { if (m.count) calls++; tris += t * m.count; instances += m.count; } else { calls++; tris += t; }
  });
  return { meshes: meshes, drawCalls: calls, triangles: Math.round(tris), instances: instances };
};
TREES.setWind = function (strength, angle) {
  var on = strength > 0;
  WIND.uniforms.treeWind.value = strength || 0;
  if (angle !== undefined) WIND.uniforms.treeWindDir.value.set(Math.cos(angle), Math.sin(angle));
  if (on !== WIND.enabled) {
    WIND.enabled = on;
    for (var k in MATS) MATS[k].needsUpdate = true;
    for (var d in DEPTHS) DEPTHS[d].needsUpdate = true;
  }
  return TREES;
};
TREES.tick = function (seconds) { WIND.uniforms.treeTime.value = seconds; };
/* build (and cache) the forest geometry for one kind × LOD × variant ahead of time, e.g. one per idle slice */
TREES.prepare = function (kind, lod, v, seed, kopts) { var t = now(), r = variantParts(kind, lod, v || 0, seed == null ? 1 : seed, kopts); return { ms: now() - t, mats: [r.barkMat, r.leafMat].filter(Boolean) }; };
/* paint (and cache) a material's textures ahead of time */
TREES.warm = function (name) { var t = now(); TREES.mat(name); return now() - t; };
TREES.config = function (c) { for (var k in c) CONFIG[k] = c[k]; return TREES; };
TREES.texture = function (name) { return getTex(name); };   // 'leaf:clo' → {map, normal, canvas}; 'bark:liveOak' → {map, normal, tile}
TREES.dispose = function () {
  var k;
  for (k in MATS) MATS[k].dispose(); for (k in DEPTHS) DEPTHS[k].dispose();
  for (k in TEX) { var t = TEX[k]; if (t.map) t.map.dispose(); if (t.normal) t.normal.dispose(); }
  for (k in GEO) { if (GEO[k].bark) GEO[k].bark.dispose(); if (GEO[k].leaf) GEO[k].leaf.dispose(); }
  MATS = {}; DEPTHS = {}; TEX = {}; GEO = {};
};
TREES.helpers = { rng: rng, seedOf: seedOf, fbm3: fbm3, Mesher: Mesher, Envelope: Envelope, growBranch: growBranch, tubeMesh: tubeMesh, hexLin: hexLin };
global.TREES = TREES;
})(typeof window !== 'undefined' ? window : this);
