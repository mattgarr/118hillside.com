/*!
 * LAND — procedural landscape library for three.js r128 (global THREE).
 * 118 Hillside Drive walkthrough.  Units: FEET, y up.
 * Every item's origin is the centre of its base on the ground (y = 0).  Polygons are [[x,z],...] in feet.
 * API:  LAND.make(kind, opts) · LAND.kinds · LAND.setMaterials(map) · LAND.mat(name)
 *       LAND.scatter(polygon, palette, opts) · LAND.zone0(footprints, dist) · LAND.ground(polygon, surface, opts)
 *       LAND.palettes · LAND.setWind(strength, angle) · LAND.tick(seconds) · LAND.makeSkyEnvironment(renderer)
 */
(function (global) {
'use strict';
var THREE = global.THREE;
if (!THREE) throw new Error('LAND: load three.js r128 before landscape.js');

var PI = Math.PI, TAU = PI * 2, HALF = PI / 2, IN = 1 / 12;
var LAND = { version: '1.0.0', units: 'feet' };
var KINDS = {}, KIND_ORDER = [];
var CONFIG = { atlasSize: 512, detail: 1, anisotropy: 4 };
var GEOCACHE = {};   // scatter: cached per-kind geometries

/* kind registry.  meta: {latin, common, concept:[...], combustible, place:'sink'|'level'|'world', bloom:{seasons, color}} */
function def(kind, category, defaults, build, size, note, meta) {
  KINDS[kind] = { kind: kind, category: category, defaults: defaults, build: build, size: size, note: note || '', meta: meta || {} };
  KIND_ORDER.push(kind);
}
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
  s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;   // decorrelate small seeds
  return function () {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function hashStr(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seedOf(seed, salt) { return (Math.imul((seed | 0) + 0x632be5ab, 2654435761) ^ hashStr(String(salt || ''))) >>> 0; }
function pick(R, arr) { return arr[(R() * arr.length) | 0]; }
function rr(R, a, b) { return a + (b - a) * R(); }

/* ------------------------------------------------------------------ noise (value noise, deterministic) */
function hash3(x, y, z, s) {
  var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683) ^ Math.imul((s | 0) + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise3(x, y, z, s) {
  var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  function H(a, b, c) { return hash3(xi + a, yi + b, zi + c, s); }
  var x00 = lerp(H(0, 0, 0), H(1, 0, 0), u), x10 = lerp(H(0, 1, 0), H(1, 1, 0), u);
  var x01 = lerp(H(0, 0, 1), H(1, 0, 1), u), x11 = lerp(H(0, 1, 1), H(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1;
}
function fbm3(x, y, z, s, oct) {
  var a = 0.5, f = 1, t = 0, n = 0;
  for (var i = 0; i < (oct || 4); i++) { t += a * vnoise3(x * f, y * f, z * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return t / n;
}
function fbm2(x, z, s, oct) { return fbm3(x, 0.37, z, s, oct); }

/* ------------------------------------------------------------------ colour (authored sRGB → linear, version-proof) */
function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function hexLin(hex) {
  if (Array.isArray(hex)) return hex.slice();
  if (typeof hex === 'string') hex = parseInt(hex.replace('#', ''), 16);
  return [s2l(((hex >> 16) & 255) / 255), s2l(((hex >> 8) & 255) / 255), s2l((hex & 255) / 255)];
}
function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function mulc(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
// random brightness + small hue drift (toward yellow or blue), on linear colours
function jit(c, R, amt, hue) {
  var k = 1 + (R() * 2 - 1) * amt, h = (R() * 2 - 1) * (hue || 0);
  return [c[0] * k * (1 + h * 0.6), c[1] * k * (1 + h * 0.25), c[2] * k * (1 - h)];
}
function setLin(color, hex) { var c = hexLin(hex); color.setRGB(c[0], c[1], c[2]); return color; }
function colorTex(t) { if (THREE.SRGBColorSpace !== undefined && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding; return t; }

/* ------------------------------------------------------------------ matrices */
var _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function M(x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e); _p.set(x || 0, y || 0, z || 0);
  if (sx === undefined) sx = 1; if (sy === undefined) sy = sx; if (sz === undefined) sz = sx;
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
function MO(x, y, z, o) { o = o || {}; return M(x, y, z, o.rx, o.ry, o.rz, o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy, o.sz == null ? 1 : o.sz); }

/* ------------------------------------------------------------------ small vector helpers (arrays) */
function v3(x, y, z) { return [x, y, z]; }
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
// rotate vector v about unit axis k by angle a (Rodrigues)
function vrot(v, k, a) { var c = Math.cos(a), s = Math.sin(a), d = vdot(k, v), x = vcross(k, v); return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)]; }

/* ------------------------------------------------------------------ Mesher: raw indexed geometry with colour */
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

/* ------------------------------------------------------------------ geometry utils */
function ensureIndex(g) {
  if (!g.index) {
    var n = g.attributes.position.count, a = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (var i = 0; i < n; i++) a[i] = i;
    g.setIndex(new THREE.BufferAttribute(a, 1));
  }
  return g;
}
function flipWinding(g) {
  ensureIndex(g);
  var a = g.index.array;
  for (var i = 0; i < a.length; i += 3) { var t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
  g.index.needsUpdate = true;
}
function clean(g) {
  for (var k in g.attributes) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  var n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) { var c = new Float32Array(n * 3); c.fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  g.clearGroups();
  return g;
}
// planar box projection, UVs in feet.  grainY: vertical grain on vertical faces.
function boxUV(g, grainY) {
  var p = g.attributes.position, n = g.attributes.normal, c = p.count, uv = new Float32Array(c * 2);
  for (var i = 0; i < c; i++) {
    var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    var ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; }
    else if (az >= ax) { if (grainY) { u = y; v = x; } else { u = x; v = y; } }
    else { if (grainY) { u = y; v = z; } else { u = z; v = y; } }
    uv[2 * i] = u; uv[2 * i + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
function tint(g, c) {
  var col = g.attributes.color.array;
  for (var i = 0; i < col.length; i += 3) { col[i] *= c[0]; col[i + 1] *= c[1]; col[i + 2] *= c[2]; }
}
function mergeGeoms(list) {
  var nv = 0, ni = 0, i;
  list.forEach(function (g) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
  var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
  var idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  var vo = 0, io = 0;
  list.forEach(function (g) {
    var p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv, c = g.attributes.color, cnt = p.count;
    pos.set(p.array.subarray(0, cnt * 3), vo * 3);
    nor.set(n.array.subarray(0, cnt * 3), vo * 3);
    if (t) uv.set(t.array.subarray(0, cnt * 2), vo * 2);
    if (c) col.set(c.array.subarray(0, cnt * 3), vo * 3); else col.fill(1, vo * 3, (vo + cnt) * 3);
    if (g.index) { var a = g.index.array, L = g.index.count; for (i = 0; i < L; i++) idx[io + i] = a[i] + vo; io += L; }
    else { for (i = 0; i < cnt; i++) idx[io + i] = vo + i; io += cnt; }
    vo += cnt;
  });
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}
function triCount(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }

/* rounded box (from FIX): per-face grids, analytic rounding, optional pillow bulge */
function roundedBoxGeo(w, h, d, r, seg, bulge, flatSeg) {
  seg = seg || 3;
  var H = [w / 2, h / 2, d / 2];
  r = Math.max(0.0005, Math.min(r, H[0] - 1e-5, H[1] - 1e-5, H[2] - 1e-5));
  var B = bulge ? (Array.isArray(bulge) ? bulge : [bulge, bulge, bulge]) : [0, 0, 0];
  var anyB = B[0] || B[1] || B[2];
  flatSeg = flatSeg || (anyB ? 5 : 1);
  function coords(hh) {
    var a0 = hh - r, out = [], k;
    for (k = seg; k >= 1; k--) out.push(-a0 - r * Math.tan(k / seg * PI / 4));
    for (k = 0; k <= flatSeg; k++) out.push(-a0 + 2 * a0 * k / flatSeg);
    for (k = 1; k <= seg; k++) out.push(a0 + r * Math.tan(k / seg * PI / 4));
    return out;
  }
  var faces = [[0, 1, 1, 2], [0, -1, 1, 2], [1, 1, 2, 0], [1, -1, 2, 0], [2, 1, 0, 1], [2, -1, 0, 1]];
  var pos = [], nor = [], idx = [], base = 0;
  faces.forEach(function (f) {
    var nA = f[0], s = f[1], uA = f[2], vA = f[3];
    var cu = coords(H[uA]), cv = coords(H[vA]), nu = cu.length, nvv = cv.length;
    var cyc = ((uA + 1) % 3 === vA) ? 1 : -1, flip = cyc * s < 0;
    var bl = B[nA] || 0, i, j;
    for (j = 0; j < nvv; j++) for (i = 0; i < nu; i++) {
      var p = [0, 0, 0]; p[nA] = s * H[nA]; p[uA] = cu[i]; p[vA] = cv[j];
      var c = [clamp(p[0], -(H[0] - r), H[0] - r), clamp(p[1], -(H[1] - r), H[1] - r), clamp(p[2], -(H[2] - r), H[2] - r)];
      var dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= L; dy /= L; dz /= L;
      var q = [c[0] + dx * r, c[1] + dy * r, c[2] + dz * r];
      if (bl) {
        var su = (H[uA] - r) > 1e-6 ? clamp(c[uA] / (H[uA] - r), -1, 1) : 1;
        var sv = (H[vA] - r) > 1e-6 ? clamp(c[vA] / (H[vA] - r), -1, 1) : 1;
        q[nA] += s * bl * (1 - su * su) * (1 - su * su) * (1 - sv * sv) * (1 - sv * sv);
      }
      pos.push(q[0], q[1], q[2]); nor.push(dx, dy, dz);
    }
    for (j = 0; j < nvv - 1; j++) for (i = 0; i < nu - 1; i++) {
      var a = base + j * nu + i, b = a + 1, cc = a + nu, dd = cc + 1;
      if (!flip) idx.push(a, b, dd, a, dd, cc); else idx.push(a, dd, b, a, cc, dd);
    }
    base += nu * nvv;
  });
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  if (anyB) g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ builder: parts keyed by material name */
function Builder(o) { this.parts = {}; this.order = []; this.meshers = {}; this.objects = []; this.o = o || {}; }
Builder.prototype._part = function (mat) { if (!this.parts[mat]) { this.parts[mat] = []; this.order.push(mat); } return this.parts[mat]; };
// a Mesher that is merged into part `mat` at build time
Builder.prototype.mesher = function (mat) { if (!this.meshers[mat]) { this.meshers[mat] = new Mesher(); this._part(mat); } return this.meshers[mat]; };
Builder.prototype.add = function (mat, g, m, o) {
  o = o || {};
  clean(g);
  if (m) { g.applyMatrix4(m); if (m.determinant() < 0) flipWinding(g); }
  if (!o.keepUV && (BOXUV[mat] || o.boxUV)) boxUV(g, o.grainY);
  if (o.color) tint(g, hexLin(o.color));
  this._part(mat).push(g);
  return g;
};
Builder.prototype.box = function (mat, w, h, d, x, y, z, ry, o) { return this.add(mat, new THREE.BoxGeometry(w, h, d), M(x, y, z, 0, ry || 0, 0), o); };
Builder.prototype.bb = function (mat, x0, y0, z0, x1, y1, z1, o) {
  return this.add(mat, new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), M((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), o);
};
Builder.prototype.rbox = function (mat, w, h, d, r, x, y, z, o) {
  o = o || {};
  return this.add(mat, roundedBoxGeo(w, h, d, r, o.seg || (r > 0.04 ? 3 : 1), o.bulge, o.flat), MO(x, y, z, o), o);
};
Builder.prototype.cyl = function (mat, rt, rb, h, x, y, z, seg, o) {
  o = o || {};
  return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg || 16, o.hseg || 1, !!o.open), MO(x, y, z, o), o);
};
Builder.prototype.rod = function (mat, a, b, r, seg, o) {
  var A = new THREE.Vector3(a[0], a[1], a[2]), Bv = new THREE.Vector3(b[0], b[1], b[2]);
  var dir = Bv.clone().sub(A), L = dir.length();
  var g = new THREE.CylinderGeometry((o && o.r2) || r, r, L, seg || 8, 1, !!(o && o.open));
  var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  var m = new THREE.Matrix4().compose(A.clone().add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return this.add(mat, g, m, o);
};
Builder.prototype.sphere = function (mat, r, x, y, z, ws, hs, o) {
  o = o || {};
  return this.add(mat, new THREE.SphereGeometry(r, ws || 12, hs || 8, 0, TAU, o.thetaStart || 0, o.thetaLength || PI), MO(x, y, z, o), o);
};
Builder.prototype.lathe = function (mat, pts, seg, x, y, z, o) {
  o = o || {};
  var v = pts.map(function (p) { return new THREE.Vector2(Math.max(p[0], 0.0001), p[1]); });
  var g = new THREE.LatheGeometry(v, seg || 32, o.phiStart || 0, o.phiLength || TAU);
  return this.add(mat, g, MO(x, y, z, o), o);
};
Builder.prototype.torus = function (mat, R, r, x, y, z, rs, ts, o) {
  o = o || {};
  return this.add(mat, new THREE.TorusGeometry(R, r, rs || 8, ts || 32, o.arc || TAU), MO(x, y, z, o), o);
};
Builder.prototype.tube = function (mat, pts, r, segs, rs, o) {
  o = o || {};
  var curve = new THREE.CatmullRomCurve3(pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }), !!o.closed, 'centripetal');
  return this.add(mat, new THREE.TubeGeometry(curve, segs || 24, r, rs || 6, !!o.closed), o.m, o);
};
Builder.prototype.extrude = function (mat, shapes, depth, m, o) {
  o = o || {};
  var g = new THREE.ExtrudeGeometry(shapes, {
    depth: depth, steps: 1, curveSegments: o.curveSegments || 12,
    bevelEnabled: !!o.bevel, bevelThickness: o.bevel || 0, bevelSize: o.bevelSize !== undefined ? o.bevelSize : (o.bevel || 0),
    bevelOffset: 0, bevelSegments: o.bevelSegments || 2
  });
  return this.add(mat, g, m, o);
};
Builder.prototype.object = function (obj) { this.objects.push(obj); return obj; };
Builder.prototype.geometries = function () {   // {mat: BufferGeometry}
  var out = {}, self = this;
  this.order.forEach(function (k) {
    var list = self.parts[k].slice();
    if (self.meshers[k] && self.meshers[k].v) list.push(self.meshers[k].geometry());
    if (list.length) out[k] = list.length === 1 ? list[0] : mergeGeoms(list);
    if (self.shift && out[k]) { out[k].translate(self.shift[0], self.shift[1], self.shift[2]); out[k].computeBoundingSphere(); }
  });
  return out;
};
Builder.prototype.build = function (kind) {
  var group = new THREE.Group(), geos = this.geometries();
  for (var k in geos) group.add(partMesh(k, geos[k]));
  var sh = this.shift;
  this.objects.forEach(function (o) { if (sh) o.position.add(new THREE.Vector3(sh[0], sh[1], sh[2])); group.add(o); });
  group.name = kind || 'landscape';
  return group;
};
function partMesh(k, geo) {
  var mat = LAND.mat(k), mesh = new THREE.Mesh(geo, mat);
  mesh.name = k;
  mesh.castShadow = !NOSHADOW[k] && !(mat.transparent && mat.opacity < 0.95);
  mesh.receiveShadow = !NORECEIVE[k];
  if (DEPTHMAT[k]) mesh.customDepthMaterial = depthMaterial(k);
  if (mat.transparent) mesh.renderOrder = 2;
  return mesh;
}

/* ------------------------------------------------------------------ 2D polygon utilities (plan coords [x,z]) */
function polyArea(p) { var a = 0; for (var i = 0, n = p.length; i < n; i++) { var q = p[i], r = p[(i + 1) % n]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; }
function ccw(p) { return polyArea(p) < 0 ? p.slice().reverse() : p.slice(); }
function bbox(p) { var b = [1e9, 1e9, -1e9, -1e9]; p.forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }); return b; }
function inPoly(p, x, z) {
  var c = false;
  for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
    var xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c;
  }
  return c;
}
function segDist(x, z, ax, az, bx, bz) {
  var dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = L ? clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1) : 0;
  var px = ax + dx * t - x, pz = az + dz * t - z; return Math.sqrt(px * px + pz * pz);
}
function edgeDist(p, x, z, open) {
  var d = 1e9, n = p.length;
  for (var i = 0; i < (open ? n - 1 : n); i++) { var a = p[i], b = p[(i + 1) % n]; d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1])); }
  return d;
}
// region = [[x,z]...] or {outer:[...], holes:[[...]]}
function regionOuter(r) { return Array.isArray(r) ? r : r.outer; }
function regionHoles(r) { return Array.isArray(r) ? [] : (r.holes || []); }
function inRegion(r, x, z) {
  if (!inPoly(regionOuter(r), x, z)) return false;
  var h = regionHoles(r); for (var i = 0; i < h.length; i++) if (inPoly(h[i], x, z)) return false;
  return true;
}
function regionEdgeDist(r, x, z) {
  var d = edgeDist(regionOuter(r), x, z), h = regionHoles(r);
  for (var i = 0; i < h.length; i++) d = Math.min(d, edgeDist(h[i], x, z));
  return d;
}
// offset a simple polygon by d (d>0 outward, round joins on convex corners; d<0 inward)
function offsetPoly(poly, d, seg) {
  var p = ccw(poly), n = p.length, out = [], i;
  seg = seg || 6;
  if (Math.abs(d) < 1e-9) return p;
  for (i = 0; i < n; i++) {
    var a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
    var e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]];
    var l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    var n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2];   // outward normals of a CCW polygon
    var cross = e1[0] * e2[1] - e1[1] * e2[0];
    var convex = cross > 1e-9;
    if ((convex && d > 0) || (!convex && d < 0 && cross < -1e-9)) {
      var a0 = Math.atan2(n1[1], n1[0]), a1 = Math.atan2(n2[1], n2[0]), da = a1 - a0;
      while (da > PI) da -= TAU; while (da < -PI) da += TAU;
      var k = Math.max(1, Math.ceil(Math.abs(da) / (HALF / seg)));
      for (var j = 0; j <= k; j++) { var t = a0 + da * j / k; out.push([b[0] + Math.cos(t) * Math.abs(d) * Math.sign(d), b[1] + Math.sin(t) * Math.abs(d) * Math.sign(d)]); }
    } else {
      var bx = n1[0] + n2[0], bz = n1[1] + n2[1], bl = Math.hypot(bx, bz);
      if (bl < 1e-6) { out.push([b[0] + n1[0] * d, b[1] + n1[1] * d]); continue; }
      bx /= bl; bz /= bl;
      var cosh = bx * n1[0] + bz * n1[1], m = d / Math.max(cosh, 0.25);
      out.push([b[0] + bx * m, b[1] + bz * m]);
    }
  }
  return out;
}
// buffer an open polyline into a polygon (paths, edging strips)
function polylinePoly(pts, width, capSeg) {
  var hw = width / 2, L = [], Rr = [], n = pts.length, i;
  for (i = 0; i < n; i++) {
    var a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    var dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, m = hw;
    if (i > 0 && i < n - 1) {
      var d1 = [pts[i][0] - a[0], pts[i][1] - a[1]], l1 = Math.hypot(d1[0], d1[1]) || 1, n1 = [-d1[1] / l1, d1[0] / l1];
      m = hw / Math.max(0.3, nx * n1[0] + nz * n1[1]);
    }
    L.push([pts[i][0] + nx * m, pts[i][1] + nz * m]); Rr.push([pts[i][0] - nx * m, pts[i][1] - nz * m]);
  }
  var out = L.slice(), k = capSeg || 5;
  function cap(p, q, sgn) {   // semicircle from L side to R side around p, heading away from q
    var dx = p[0] - q[0], dz = p[1] - q[1], l = Math.hypot(dx, dz) || 1, a0 = Math.atan2(dz / l, dx / l);
    for (var j = 1; j < k; j++) { var t = a0 + sgn * (HALF - PI * j / k); out.push([p[0] + Math.cos(t) * hw, p[1] + Math.sin(t) * hw]); }
  }
  cap(pts[n - 1], pts[n - 2], 1);
  for (i = n - 1; i >= 0; i--) out.push(Rr[i]);
  cap(pts[0], pts[1], 1);
  return out;
}
// Sutherland–Hodgman: clip `subject` (any simple polygon) by convex `clip` (CCW)
function clipConvex(subject, clip) {
  var out = subject;
  for (var i = 0; i < clip.length && out.length; i++) {
    var a = clip[i], b = clip[(i + 1) % clip.length], inp = out; out = [];
    var inside = function (p) { return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0; };
    for (var j = 0; j < inp.length; j++) {
      var P = inp[j], Q = inp[(j + 1) % inp.length], ip = inside(P), iq = inside(Q);
      if (ip) out.push(P);
      if (ip !== iq) {
        var dx = Q[0] - P[0], dz = Q[1] - P[1], ex = b[0] - a[0], ez = b[1] - a[1];
        var den = dx * ez - dz * ex; if (Math.abs(den) < 1e-12) continue;
        var t = ((a[0] - P[0]) * ez - (a[1] - P[1]) * ex) / den;
        out.push([P[0] + dx * t, P[1] + dz * t]);
      }
    }
  }
  return out;
}
// clip a convex polygon by a half-plane  n·p <= c
function clipHalf(poly, nx, nz, c) {
  var out = [];
  for (var j = 0; j < poly.length; j++) {
    var P = poly[j], Q = poly[(j + 1) % poly.length], dp = nx * P[0] + nz * P[1] - c, dq = nx * Q[0] + nz * Q[1] - c;
    if (dp <= 0) out.push(P);
    if ((dp <= 0) !== (dq <= 0)) { var t = dp / (dp - dq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}
function insetConvex(poly, d) {   // shrink a CCW convex polygon by d
  var out = poly, n = poly.length;
  for (var i = 0; i < n && out.length > 2; i++) {
    var a = poly[i], b = poly[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez); if (l < 1e-9) continue;
    var nx = ez / l, nz = -ex / l;   // outward
    out = clipHalf(out, nx, nz, nx * a[0] + nz * a[1] - d);
  }
  return out;
}
function convexPoly(p) {
  for (var i = 0, n = p.length; i < n; i++) { var a = p[i], b = p[(i + 1) % n], c = p[(i + 2) % n]; if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -1e-9) return false; }
  return true;
}
// triangulate region → {pts:[[x,z]...], tris:[[a,b,c]...]}.
// maxEdge = 0: exact ear-clipping of the outline.  maxEdge > 0: the region is cut by a square grid (cell = maxEdge) so
// terrain-following surfaces get evenly sized triangles; outline clipped exactly, convex holes subtracted exactly,
// concave holes by triangle-centroid test.
function triangulateRegion(region, maxEdge) {
  var outer = ccw(regionOuter(region)), holes = regionHoles(region).map(ccw), V2 = function (p) { return new THREE.Vector2(p[0], p[1]); };
  if (!maxEdge) {
    var hs = holes.map(function (h) { return h.slice().reverse(); });
    var faces = THREE.ShapeUtils.triangulateShape(outer.map(V2), hs.map(function (h) { return h.map(V2); }));
    var P0 = outer.slice(); hs.forEach(function (h) { P0 = P0.concat(h); });
    return { pts: P0, tris: faces.map(function (f) { return [f[0], f[1], f[2]]; }) };
  }
  var bb = bbox(outer), nx = Math.max(1, Math.ceil((bb[2] - bb[0]) / maxEdge)), nz = Math.max(1, Math.ceil((bb[3] - bb[1]) / maxEdge));
  var sx = (bb[2] - bb[0]) / nx, sz = (bb[3] - bb[1]) / nz, pts = [], tris = [], keys = {};
  var hinfo = holes.map(function (h) { return { p: h, bb: bbox(h), convex: convexPoly(h) }; });
  function vid(p) { var k = Math.round(p[0] * 512) + ',' + Math.round(p[1] * 512); if (keys[k] === undefined) { keys[k] = pts.length; pts.push(p); } return keys[k]; }
  function inConcaveHole(x, z) { for (var i = 0; i < hinfo.length; i++) if (!hinfo[i].convex && inPoly(hinfo[i].p, x, z)) return true; return false; }
  function emit(P, full) {
    if (full) { var a = vid(P[0]), b = vid(P[1]), c = vid(P[2]), d = vid(P[3]); tris.push([a, b, c], [a, c, d]); return; }
    var f = THREE.ShapeUtils.triangulateShape(P.map(V2), []);
    f.forEach(function (t) {
      var A = P[t[0]], B = P[t[1]], C = P[t[2]];
      if (Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) < 1e-7) return;
      if (inConcaveHole((A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3)) return;
      tris.push([vid(A), vid(B), vid(C)]);
    });
  }
  for (var i = 0; i < nx; i++) for (var j = 0; j < nz; j++) {
    var x0 = bb[0] + i * sx, x1 = i === nx - 1 ? bb[2] : bb[0] + (i + 1) * sx, z0 = bb[1] + j * sz, z1 = j === nz - 1 ? bb[3] : bb[1] + (j + 1) * sz;
    var cell = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    var piece = clipConvex(outer, cell);
    if (piece.length < 3 || Math.abs(polyArea(piece)) < 1e-6) continue;
    var full = piece.length === 4 && Math.abs(Math.abs(polyArea(piece)) - (x1 - x0) * (z1 - z0)) < 1e-6, pieces = [piece], cut = false;
    hinfo.forEach(function (H) {
      if (H.bb[2] < x0 || H.bb[0] > x1 || H.bb[3] < z0 || H.bb[1] > z1 || !H.convex) { if (!H.convex && !(H.bb[2] < x0 || H.bb[0] > x1 || H.bb[3] < z0 || H.bb[1] > z1)) cut = true; return; }
      var out = [];
      pieces.forEach(function (Pc) {
        var rest = Pc, hp = H.p;
        for (var e = 0; e < hp.length && rest.length >= 3; e++) {
          var a = hp[e], b = hp[(e + 1) % hp.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) continue;
          var nxo = (b[1] - a[1]) / L, nzo = -(b[0] - a[0]) / L, c = nxo * a[0] + nzo * a[1];
          var part = clipHalf(rest, -nxo, -nzo, -c);
          if (part.length >= 3 && Math.abs(polyArea(part)) > 1e-7) out.push(part);
          rest = clipHalf(rest, nxo, nzo, c);
        }
      });
      if (out.length !== 1 || Math.abs(polyArea(out[0]) - polyArea(pieces[0])) > 1e-7) cut = true;
      pieces = out;
    });
    pieces.forEach(function (Pc) { emit(Pc, full && !cut); });
  }
  return { pts: pts, tris: tris };
}

function sampleHeight(heightAt, x, z) { return heightAt ? heightAt(x, z) : 0; }
function slopeNormal(heightAt, x, z, e) {
  if (!heightAt) return [0, 1, 0];
  e = e || 0.5;
  var dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return vnorm([-dx, 1, -dz]);
}
/* ================================================================== PROCEDURAL TEXTURES (canvas, cached) */
var TEX = {};
function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
function toTex(c, repeatFeet, color) {
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeatFeet) t.repeat.set(1 / repeatFeet[0], 1 / (repeatFeet[1] || repeatFeet[0]));
  if (color !== false) colorTex(t);
  t.anisotropy = CONFIG.anisotropy;
  return t;
}
// draw fn(ox, oy) at 9 offsets so strokes wrap seamlessly
function wrapDraw(W, H, fn) { for (var ox = -W; ox <= W; ox += W) for (var oy = -H; oy <= H; oy += H) fn(ox, oy); }
function grey(v, a) { v = (clamp(v, 0, 1) * 255) | 0; return a === undefined ? 'rgb(' + v + ',' + v + ',' + v + ')' : 'rgba(' + v + ',' + v + ',' + v + ',' + a + ')'; }
function rgbS(hex, k, a) {
  var c = typeof hex === 'string' ? parseInt(hex.slice(1), 16) : hex; k = k === undefined ? 1 : k;
  var r = clamp(((c >> 16) & 255) * k, 0, 255) | 0, g = clamp(((c >> 8) & 255) * k, 0, 255) | 0, b = clamp((c & 255) * k, 0, 255) | 0;
  return a === undefined ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function blob(ctx, x, y, r, R, n, jag) {   // irregular polygon
  n = n || 7; jag = jag === undefined ? 0.35 : jag;
  ctx.beginPath();
  var a0 = R() * TAU;
  for (var i = 0; i < n; i++) { var a = a0 + i / n * TAU, rr2 = r * (1 - jag / 2 + jag * R()); if (i) ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); else ctx.moveTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath();
}

/* ------------------------------------------------------------------ plant atlas: 4×4 cells, greyscale art tinted by vertex colour */
var CELL = { broad: 0, small: 1, needle: 2, lance: 3, palmate: 4, round: 5, feathery: 6, large: 7,
  spike: 8, cup: 9, tube: 10, truss: 11, umbel: 12, berry: 13, bark: 14, solid: 15 };
// sprite rect inside its cell (fractions): [x0, y0, x1, y1]; base of the sprig is at the rect's bottom centre
var CELLRECT = { spike: [0.32, 0.03, 0.68, 0.97], bark: [0.06, 0.06, 0.94, 0.94], solid: [0.04, 0.04, 0.46, 0.96], dense: [0.56, 0.06, 0.94, 0.94] };
function cellUV(name) {   // → [u0, v0, u1, v1] (v grows downward in canvas = upward in data rows; we keep canvas orientation, flipY=false)
  var idx = CELL[name === 'dense' ? 'solid' : name], cx = idx % 4, cy = (idx / 4) | 0, r = CELLRECT[name] || [0.03, 0.03, 0.97, 0.97];
  return [(cx + r[0]) / 4, (cy + r[1]) / 4, (cx + r[2]) / 4, (cy + r[3]) / 4];
}
function cellAspect(name) { var u = cellUV(name); return (u[3] - u[1]) / (u[2] - u[0]); }

function leafPath(x, shape, L, W) {   // leaf pointing up (−y) from the origin; W = half width
  x.beginPath(); x.moveTo(0, 0);
  switch (shape) {
    case 'needle': x.bezierCurveTo(W, -L * 0.2, W, -L * 0.8, 0, -L); x.bezierCurveTo(-W, -L * 0.8, -W, -L * 0.2, 0, 0); break;
    case 'lance': x.bezierCurveTo(W * 1.2, -L * 0.15, W * 0.9, -L * 0.6, 0, -L); x.bezierCurveTo(-W * 0.9, -L * 0.6, -W * 1.2, -L * 0.15, 0, 0); break;
    case 'round': x.bezierCurveTo(W * 1.35, -L * 0.02, W * 1.35, -L * 0.92, 0, -L); x.bezierCurveTo(-W * 1.35, -L * 0.92, -W * 1.35, -L * 0.02, 0, 0); break;
    case 'ovate': x.bezierCurveTo(W * 1.5, -L * 0.1, W * 1.0, -L * 0.75, 0, -L); x.bezierCurveTo(-W * 1.0, -L * 0.75, -W * 1.5, -L * 0.1, 0, 0); break;
    case 'heart': x.bezierCurveTo(W * 0.6, L * 0.08, W * 1.5, -L * 0.25, W * 0.9, -L * 0.65); x.quadraticCurveTo(W * 0.4, -L * 0.95, 0, -L);
      x.quadraticCurveTo(-W * 0.4, -L * 0.95, -W * 0.9, -L * 0.65); x.bezierCurveTo(-W * 1.5, -L * 0.25, -W * 0.6, L * 0.08, 0, 0); break;
    default: x.bezierCurveTo(W * 1.25, -L * 0.12, W * 1.1, -L * 0.7, 0, -L); x.bezierCurveTo(-W * 1.1, -L * 0.7, -W * 1.25, -L * 0.12, 0, 0);
  }
  x.closePath();
}
function drawLeaf(x, px, py, ang, L, W, shape, tone, rib) {
  x.save(); x.translate(px, py); x.rotate(ang);
  leafPath(x, shape, L, W);
  var g = x.createLinearGradient(-W, 0, W, 0);
  g.addColorStop(0, grey(tone * 0.8)); g.addColorStop(0.42, grey(tone * 1.04)); g.addColorStop(0.58, grey(tone * 0.95)); g.addColorStop(1, grey(tone * 0.76));
  x.fillStyle = g; x.fill();
  if (rib !== false && W > 1.2) { x.strokeStyle = grey(tone * 0.62, 0.8); x.lineWidth = Math.max(0.6, W * 0.14); x.beginPath(); x.moveTo(0, -L * 0.05); x.lineTo(0, -L * 0.9); x.stroke(); }
  x.restore();
}
// a stem from (x0,y0) heading `ang` (0 = straight up) bending by `bend`; returns sample fn
function stemPts(x0, y0, len, ang, bend) {
  return function (t) {
    var a = ang + bend * t;
    // integrate heading roughly: position along quadratic arc
    var px = x0 + Math.sin(ang + bend * t * 0.5) * len * t, py = y0 - Math.cos(ang + bend * t * 0.5) * len * t;
    return [px, py, a];
  };
}
function drawStem(x, f, width, tone) {
  x.strokeStyle = grey(tone); x.lineWidth = width; x.lineCap = 'round'; x.beginPath();
  for (var i = 0; i <= 12; i++) { var p = f(i / 12); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
  x.stroke();
}
// sprig with alternate leaves
function sprig(x, R, S, x0, y0, len, ang, bend, n, shape, L, W, spread, toneBase) {
  var f = stemPts(x0, y0, len, ang, bend);
  drawStem(x, f, Math.max(1, S * 0.012), 0.42);
  for (var i = 0; i < n; i++) {
    var t = 0.12 + 0.88 * i / Math.max(1, n - 1), p = f(t), side = (i % 2 ? 1 : -1), k = 1 - 0.38 * t;
    var la = p[2] + side * (spread * (0.7 + 0.5 * R())), tone = Math.min(1, (toneBase || 0.85) * (0.86 + 0.22 * R()) * (0.9 + 0.14 * t));
    drawLeaf(x, p[0], p[1], la, L * k * (0.85 + 0.3 * R()), W * k * (0.85 + 0.3 * R()), shape, tone);
  }
  var e = f(1);
  drawLeaf(x, e[0], e[1], e[2], L * 0.7, W * 0.7, shape, (toneBase || 0.78) * 1.08);
}
function palmLeaf(x, px, py, ang, r, tone, lobes) {
  x.save(); x.translate(px, py); x.rotate(ang);
  lobes = lobes || 7;
  x.beginPath(); x.moveTo(0, 0);
  for (var i = 0; i < lobes; i++) {
    var a = -PI * 0.92 + (PI * 1.84) * i / (lobes - 1) - HALF, la = r * (i === 0 || i === lobes - 1 ? 0.55 : 1 - Math.abs(i - (lobes - 1) / 2) * 0.12);
    var aL = a - 0.17, aR = a + 0.17;
    x.quadraticCurveTo(Math.cos(aL) * la * 0.45, Math.sin(aL) * la * 0.45, Math.cos(a) * la, Math.sin(a) * la);
    x.quadraticCurveTo(Math.cos(aR) * la * 0.45, Math.sin(aR) * la * 0.45, Math.cos(a + 0.24) * r * 0.22, Math.sin(a + 0.24) * r * 0.22);
  }
  x.closePath();
  var g = x.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, grey(tone * 0.75)); g.addColorStop(0.5, grey(tone)); g.addColorStop(1, grey(tone * 0.86));
  x.fillStyle = g; x.fill();
  x.strokeStyle = grey(tone * 0.6, 0.6); x.lineWidth = 0.7;
  for (i = 1; i < lobes - 1; i++) { var a2 = -PI * 0.92 + (PI * 1.84) * i / (lobes - 1) - HALF; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a2) * r * 0.8, Math.sin(a2) * r * 0.8); x.stroke(); }
  x.restore();
}
function floret(x, px, py, r, tone, petals, R) {
  petals = petals || 5;
  var a0 = R() * TAU;
  for (var i = 0; i < petals; i++) {
    var a = a0 + i / petals * TAU;
    x.fillStyle = grey(tone * (0.85 + 0.2 * R()));
    x.beginPath(); x.ellipse(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.5, r * 0.55, r * 0.36, a, 0, TAU); x.fill();
  }
  x.fillStyle = grey(tone * 0.62); x.beginPath(); x.arc(px, py, r * 0.18, 0, TAU); x.fill();
}

function fan(x, R, S, n, spread, len, bend, leaves, shape, L, W, leafSpread, tone0) {
  // sprigs start from a short twig network in the lower part of the cell and reach toward random points above,
  // so the card reads as a natural leafy cluster rather than a radial fan
  for (var j = 0; j < n; j++) {
    var bx = S * (0.5 + (R() - 0.5) * 0.42), by = S * (0.97 - R() * 0.3);
    var tx = S * (0.1 + 0.8 * R()), ty = S * (0.04 + 0.5 * R());
    var a = Math.atan2(tx - bx, by - ty) * 0.85, L0 = Math.hypot(tx - bx, by - ty);
    if (by < S * 0.93) { drawStem(x, stemPts(S * 0.5, S * 0.97, Math.hypot(bx - S * 0.5, S * 0.97 - by), Math.atan2(bx - S * 0.5, S * 0.97 - by), 0), Math.max(1, S * 0.012), 0.45); }
    sprig(x, R, S, bx, by, Math.max(S * 0.25, L0) * (0.85 + 0.2 * R()), clamp(a, -spread * 1.2, spread * 1.2), (R() - 0.5) * bend, Math.max(3, Math.round(leaves * (0.6 + 0.5 * L0 / (S * len)))), shape, L, W, leafSpread, tone0 + (j % 3) * 0.04);
  }
}
var DRAWCELL = {
  broad: function (x, S, R) { fan(x, R, S, 8, 0.95, 0.86, 0.5, 7, 'ellipse', S * 0.23, S * 0.08, 0.85, 0.86); },     // toyon, coffeeberry, camellia
  small: function (x, S, R) { fan(x, R, S, 14, 1.0, 0.86, 0.6, 14, 'ellipse', S * 0.1, S * 0.042, 1.0, 0.84); },      // boxwood, ceanothus, oak
  needle: function (x, S, R) { fan(x, R, S, 13, 0.9, 0.88, 0.4, 22, 'needle', S * 0.13, S * 0.02, 0.55, 0.86); },     // rosemary, lavender, buckwheat
  lance: function (x, S, R) { fan(x, R, S, 10, 0.95, 0.86, 0.5, 9, 'lance', S * 0.21, S * 0.045, 0.62, 0.88); },      // olive, salvias, monkey flower
  palmate: function (x, S, R) {   // Japanese maple
    for (var i = 0; i < 11; i++) {
      var a = -1.15 + 2.3 * i / 10 + (R() - 0.5) * 0.3, len = S * (0.26 + 0.16 * R());
      var px = S * 0.5 + Math.sin(a) * len * 1.05, py = S * 0.95 - Math.cos(a) * len * 1.35;
      x.strokeStyle = grey(0.6); x.lineWidth = 1; x.beginPath(); x.moveTo(S * 0.5, S * 0.97); x.lineTo(px, py); x.stroke();
      palmLeaf(x, px, py, a * 0.6 + (R() - 0.5) * 0.6, S * (0.17 + 0.05 * R()), 0.8 + 0.04 * (i % 4), 7);
    }
  },
  round: function (x, S, R) { fan(x, R, S, 9, 0.95, 0.86, 0.4, 7, 'round', S * 0.14, S * 0.062, 0.85, 0.86); },       // manzanita, redbud
  feathery: function (x, S, R) {   // finely dissected: yarrow, poppy foliage, ferny
    for (var j = 0; j < 9; j++) {
      var a = -0.9 + 1.8 * j / 8 + (R() - 0.5) * 0.2, f = stemPts(S * 0.5, S * 0.97, S * (0.62 + 0.3 * R()), a, (R() - 0.5) * 0.7);
      drawStem(x, f, Math.max(1, S * 0.012), 0.62);
      for (var i = 0; i < 28; i++) {
        var t = 0.08 + 0.92 * i / 27, p = f(t), side = i % 2 ? 1 : -1, L = S * 0.095 * (1 - 0.6 * t);
        var la = p[2] + side * 1.05, ex = p[0] + Math.sin(la) * L, ey = p[1] - Math.cos(la) * L;
        x.strokeStyle = grey((0.8 + 0.03 * (j % 3)) * (0.85 + 0.2 * R())); x.lineWidth = Math.max(1.2, S * 0.018);
        x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(ex, ey); x.stroke();
        x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex + Math.sin(la - 0.6) * L * 0.45, ey - Math.cos(la - 0.6) * L * 0.45); x.stroke();
        x.beginPath(); x.moveTo((p[0] + ex) / 2, (p[1] + ey) / 2); x.lineTo((p[0] + ex) / 2 + Math.sin(la + 0.7) * L * 0.35, (p[1] + ey) / 2 - Math.cos(la + 0.7) * L * 0.35); x.stroke();
      }
    }
  },
  large: function (x, S, R) {   // big ovate leaves: hydrangea, rhododendron whorls
    for (var i = 0; i < 8; i++) {
      var a = -1.15 + 2.3 * i / 7 + (R() - 0.5) * 0.2;
      drawLeaf(x, S * 0.5 + Math.sin(a) * S * 0.04, S * 0.94, a, S * (0.44 + 0.08 * R()), S * (0.13 + 0.03 * R()), 'ovate', 0.8 + 0.03 * (i % 3));
    }
    for (i = 0; i < 3; i++) drawLeaf(x, S * 0.5, S * 0.94, (i - 1) * 0.35, S * 0.5, S * 0.15, 'ovate', 0.95);
  },
  spike: function (x, S, R) {   // salvia / lavender / ceanothus spike (narrow sprite)
    var cx = S * 0.5, y0 = S * 0.97, y1 = S * 0.04;
    x.strokeStyle = grey(0.55); x.lineWidth = Math.max(1, S * 0.016); x.beginPath(); x.moveTo(cx, y0); x.lineTo(cx, y1 + S * 0.03); x.stroke();
    var n = 46;
    for (var i = 0; i < n; i++) {
      var t = 0.3 + 0.7 * Math.pow(i / (n - 1), 0.85), y = lerp(y0, y1, t), wid = S * 0.13 * (1 - Math.pow(t, 2.2) * 0.75) * (0.5 + 0.5 * Math.sin(t * 40) * 0.3 + 0.35);
      var side = R() < 0.5 ? -1 : 1, px = cx + side * wid * (0.25 + 0.7 * R());
      var tone = 0.7 + 0.3 * R() + (side > 0 ? 0.05 : -0.06);
      x.fillStyle = grey(tone); x.beginPath(); x.ellipse(px, y, S * 0.03 * (1.1 - t * 0.4), S * 0.042 * (1.1 - t * 0.4), side * 0.5, 0, TAU); x.fill();
      if (R() < 0.35) { x.fillStyle = grey(1.0); x.beginPath(); x.ellipse(px + side * S * 0.02, y - S * 0.01, S * 0.012, S * 0.022, side * 0.8, 0, TAU); x.fill(); }
    }
  },
  cup: function (x, S, R) {   // poppy cups on wiry stalks + buds
    var F = [[0.3, 0.42, -0.35, 0.17], [0.68, 0.3, 0.3, 0.19], [0.52, 0.62, 0.05, 0.14]];
    F.forEach(function (f) {
      var fx = S * f[0], fy = S * f[1], r = S * f[3];
      x.strokeStyle = grey(0.55); x.lineWidth = Math.max(1, S * 0.012); x.beginPath(); x.moveTo(S * 0.5, S * 0.98); x.quadraticCurveTo(fx, S * 0.8, fx, fy + r * 0.5); x.stroke();
      x.save(); x.translate(fx, fy); x.rotate(f[2]);
      for (var p = 0; p < 4; p++) {   // four overlapping petals forming a cup
        var a = -HALF + (p - 1.5) * 0.55, g = x.createRadialGradient(0, r * 0.45, 0, 0, r * 0.2, r * 1.1);
        g.addColorStop(0, grey(0.62)); g.addColorStop(0.5, grey(0.92 - p * 0.03)); g.addColorStop(1, grey(1.0));
        x.fillStyle = g; x.beginPath(); x.ellipse(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42 + r * 0.25, r * 0.5, r * 0.62, a + HALF, 0, TAU); x.fill();
      }
      x.fillStyle = grey(0.5); x.beginPath(); x.ellipse(0, r * 0.3, r * 0.22, r * 0.12, 0, 0, TAU); x.fill();
      x.restore();
    });
    [[0.2, 0.7, -0.5], [0.82, 0.62, 0.45]].forEach(function (b) {
      x.strokeStyle = grey(0.55); x.lineWidth = 1; x.beginPath(); x.moveTo(S * 0.5, S * 0.98); x.quadraticCurveTo(S * b[0], S * 0.9, S * b[0], S * b[1]); x.stroke();
      drawLeaf(x, S * b[0], S * b[1], b[2], S * 0.13, S * 0.03, 'lance', 0.7, false);
    });
  },
  tube: function (x, S, R) {   // tubular flowers: California fuchsia, monkey flower, aloe/hesperaloe racemes
    for (var j = 0; j < 3; j++) {
      var a = -0.4 + 0.4 * j, f = stemPts(S * 0.5, S * 0.97, S * 0.82, a, (R() - 0.5) * 0.5);
      drawStem(x, f, Math.max(1, S * 0.012), 0.6);
      for (var i = 0; i < 7; i++) {
        var t = 0.3 + 0.7 * i / 6, p = f(t), side = i % 2 ? 1 : -1, la = p[2] + side * (0.75 + 0.3 * R()), L = S * (0.2 - 0.06 * t);
        x.save(); x.translate(p[0], p[1]); x.rotate(la);
        var g = x.createLinearGradient(0, 0, 0, -L);
        g.addColorStop(0, grey(0.62)); g.addColorStop(0.6, grey(0.92)); g.addColorStop(1, grey(1.0));
        x.fillStyle = g; x.beginPath(); x.moveTo(-S * 0.008, 0); x.lineTo(-S * 0.022, -L * 0.85); x.quadraticCurveTo(-S * 0.045, -L * 1.05, 0, -L * 1.02);
        x.quadraticCurveTo(S * 0.045, -L * 1.05, S * 0.022, -L * 0.85); x.lineTo(S * 0.008, 0); x.closePath(); x.fill();
        x.restore();
      }
    }
  },
  truss: function (x, S, R) {   // flower trusses / mopheads (azalea, rhododendron, hydrangea, camellia): irregular clusters of florets
    var cx = S * 0.5, cy = S * 0.46;
    x.strokeStyle = grey(0.55); x.lineWidth = Math.max(1, S * 0.02); x.beginPath(); x.moveTo(cx, S * 0.98); x.lineTo(cx, cy + S * 0.1); x.stroke();
    var pts = [];
    for (var c = 0; c < 5; c++) {   // sub-clusters make the outline lumpy
      var ca = R() * TAU, cd = S * (0.08 + 0.14 * R()), sx = cx + Math.cos(ca) * cd, sy = cy + Math.sin(ca) * cd * 0.9, sr = S * (0.16 + 0.07 * R());
      for (var i = 0; i < 9; i++) { var a = R() * TAU, d = Math.sqrt(R()) * sr; pts.push([sx + Math.cos(a) * d, sy + Math.sin(a) * d * 0.9]); }
    }
    pts.sort(function (a, b) { return a[1] - b[1]; });
    pts.forEach(function (p) {
      var shade = 0.78 + 0.22 * (1 - (p[1] - (cy - S * 0.4)) / (0.8 * S)) - (p[0] - cx) / S * 0.08;
      x.fillStyle = grey(shade * 0.6, 0.9); x.beginPath(); x.arc(p[0] + 1.5, p[1] + 2, S * 0.085, 0, TAU); x.fill();
      floret(x, p[0], p[1], S * (0.1 + 0.03 * R()), shade, 5, R);
    });
  },
  umbel: function (x, S, R) {   // dense domes of tiny florets: yarrow, buckwheat, ceanothus fluff, toyon blossom, muhly haze
    var domes = [[0.5, 0.42, 0.3], [0.3, 0.52, 0.2], [0.7, 0.5, 0.22], [0.42, 0.3, 0.18], [0.62, 0.32, 0.17]];
    x.strokeStyle = grey(0.62); x.lineWidth = Math.max(1, S * 0.012);
    domes.forEach(function (d) { x.beginPath(); x.moveTo(S * 0.5, S * 0.98); x.quadraticCurveTo(S * d[0], S * 0.8, S * d[0], S * (d[1] + 0.08)); x.stroke(); });
    domes.forEach(function (d) {
      var cx = S * d[0], cy = S * d[1], rx = S * d[2], ry = rx * 0.62;
      x.fillStyle = grey(0.55); x.beginPath(); x.ellipse(cx, cy + ry * 0.15, rx * 0.95, ry * 0.9, 0, 0, TAU); x.fill();
      for (var i = 0; i < 110; i++) {
        var a2 = R() * TAU, dd = Math.sqrt(R()), px = cx + Math.cos(a2) * dd * rx, py = cy + Math.sin(a2) * dd * ry - (1 - dd) * ry * 0.3;
        x.fillStyle = grey((0.75 + 0.25 * R()) * (py < cy ? 1.05 : 0.86)); x.beginPath(); x.arc(px, py, S * (0.012 + 0.012 * R()), 0, TAU); x.fill();
      }
    });
  },
  berry: function (x, S, R) {   // berry clusters: toyon (red), coffeeberry (black-purple)
    for (var j = 0; j < 4; j++) {
      var bx = S * (0.22 + 0.56 * j / 3), by = S * (0.3 + 0.3 * R());
      x.strokeStyle = grey(0.5); x.lineWidth = Math.max(1, S * 0.012); x.beginPath(); x.moveTo(S * 0.5, S * 0.98); x.quadraticCurveTo(bx, S * 0.8, bx, by); x.stroke();
      for (var i = 0; i < 16; i++) {
        var a = R() * TAU, d = Math.sqrt(R()) * S * 0.1, px = bx + Math.cos(a) * d, py = by + Math.sin(a) * d * 0.8, r = S * (0.026 + 0.01 * R());
        var g = x.createRadialGradient(px - r * 0.35, py - r * 0.35, 0, px, py, r);
        g.addColorStop(0, grey(1)); g.addColorStop(0.35, grey(0.85)); g.addColorStop(1, grey(0.5));
        x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
      }
    }
  },
  bark: function (x, S, R) {   // opaque fissured bark (tinted per species)
    var r = CELLRECT.bark, x0 = S * r[0] - 2, y0 = S * r[1] - 2, w = S * (r[2] - r[0]) + 4, h = S * (r[3] - r[1]) + 4;
    x.fillStyle = grey(0.8); x.fillRect(x0, y0, w, h);
    for (var i = 0; i < 70; i++) {
      var px = x0 + R() * w, py = y0 + R() * h, L = S * (0.1 + 0.3 * R());
      x.strokeStyle = R() < 0.55 ? grey(0.5 + 0.15 * R(), 0.6) : grey(0.92 + 0.08 * R(), 0.5); x.lineWidth = 1 + R() * S * 0.03;
      x.beginPath(); x.moveTo(px, py); x.bezierCurveTo(px + (R() - 0.5) * 6, py + L * 0.3, px + (R() - 0.5) * 6, py + L * 0.6, px + (R() - 0.5) * 4, py + L); x.stroke();
    }
  },
  solid: function (x, S, R) {   // left: striated blade/leaf skin (grasses, succulents); right: dense leafy core
    var r = CELLRECT.solid, x0 = S * r[0] - 2, w = S * (r[2] - r[0]) + 4, y0 = S * r[1] - 2, h = S * (r[3] - r[1]) + 4;
    x.fillStyle = grey(0.86); x.fillRect(x0, y0, w, h);
    for (var i = 0; i < 40; i++) { x.fillStyle = grey(0.78 + 0.2 * R(), 0.6); x.fillRect(x0 + R() * w, y0, 0.6 + R() * 1.4, h); }
    var d = CELLRECT.dense, dx0 = S * d[0] - 2, dw = S * (d[2] - d[0]) + 4, dy0 = S * d[1] - 2, dh = S * (d[3] - d[1]) + 4;
    x.save(); x.beginPath(); x.rect(dx0, dy0, dw, dh); x.clip();
    x.fillStyle = grey(0.32); x.fillRect(dx0, dy0, dw, dh);
    for (i = 0; i < 260; i++) drawLeaf(x, dx0 + R() * dw, dy0 + R() * dh + S * 0.04, R() * TAU, S * (0.05 + 0.04 * R()), S * 0.018, 'ellipse', 0.4 + 0.45 * R(), false);
    x.restore();
  }
};

function buildAtlas() {
  var A = CONFIG.atlasSize, S = A / 4, c = canvas(A), x = c.getContext('2d'), names = Object.keys(CELL);
  x.clearRect(0, 0, A, A);
  names.forEach(function (nm) {
    var idx = CELL[nm], cx = (idx % 4) * S, cy = ((idx / 4) | 0) * S, m = Math.max(2, S * 0.025);
    x.save(); x.translate(cx, cy); x.beginPath(); x.rect(m, m, S - 2 * m, S - 2 * m); x.clip();
    DRAWCELL[nm](x, S, rng(seedOf(17, nm)));
    x.restore();
  });
  var img = x.getImageData(0, 0, A, A), d = img.data, i, cell, px, py;
  // 1. give fully transparent texels the cell's mean opaque colour (no dark fringes when filtering)
  for (cell = 0; cell < 16; cell++) {
    var ox = (cell % 4) * S, oy = ((cell / 4) | 0) * S, sr = 0, sg = 0, sb = 0, n = 0;
    for (py = oy; py < oy + S; py++) for (px = ox; px < ox + S; px++) { i = (py * A + px) * 4; if (d[i + 3] > 128) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; } }
    if (!n) continue; sr /= n; sg /= n; sb /= n;
    for (py = oy; py < oy + S; py++) for (px = ox; px < ox + S; px++) {
      i = (py * A + px) * 4; var a = d[i + 3] / 255;
      if (a < 0.5) { var k = a * 2; d[i] = lerp(sr, d[i], k); d[i + 1] = lerp(sg, d[i + 1], k); d[i + 2] = lerp(sb, d[i + 2], k); }
    }
  }
  // 2. mip chain with per-cell alpha-coverage preservation (cards don't dissolve with distance)
  var levels = [{ data: new Uint8Array(d.buffer.slice(0)), width: A, height: A }], cover = [];
  for (cell = 0; cell < 16; cell++) {
    var cnt = 0; ox = (cell % 4) * S; oy = ((cell / 4) | 0) * S;
    for (py = oy; py < oy + S; py++) for (px = ox; px < ox + S; px++) if (d[(py * A + px) * 4 + 3] >= 128) cnt++;
    cover.push(cnt / (S * S));
  }
  var W = A, prev = levels[0].data;
  while (W > 1) {
    var w2 = W >> 1, nd = new Uint8Array(w2 * w2 * 4);
    for (py = 0; py < w2; py++) for (px = 0; px < w2; px++) {
      for (var ch = 0; ch < 4; ch++) {
        var s = prev[((2 * py) * W + 2 * px) * 4 + ch] + prev[((2 * py) * W + 2 * px + 1) * 4 + ch] + prev[((2 * py + 1) * W + 2 * px) * 4 + ch] + prev[((2 * py + 1) * W + 2 * px + 1) * 4 + ch];
        nd[(py * w2 + px) * 4 + ch] = (s + 2) >> 2;
      }
    }
    var cs = w2 / 4;
    if (cs >= 2) for (cell = 0; cell < 16; cell++) {   // rescale alpha so the same fraction passes alphaTest 0.5
      var al = []; ox = (cell % 4) * cs; oy = ((cell / 4) | 0) * cs;
      for (py = oy; py < oy + cs; py++) for (px = ox; px < ox + cs; px++) al.push(nd[(py * w2 + px) * 4 + 3]);
      al.sort(function (a, b) { return b - a; });
      var q = al[Math.min(al.length - 1, Math.floor(cover[cell] * al.length))];
      if (q > 4 && q < 128) { var kk = 128 / q; for (py = oy; py < oy + cs; py++) for (px = ox; px < ox + cs; px++) { i = (py * w2 + px) * 4 + 3; nd[i] = Math.min(255, nd[i] * kk); } }
    }
    levels.push({ data: nd, width: w2, height: w2 });
    prev = nd; W = w2;
  }
  var t = new THREE.DataTexture(levels[0].data, A, A, THREE.RGBAFormat);
  t.mipmaps = levels;
  t.generateMipmaps = false;
  t.flipY = false;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = CONFIG.anisotropy;
  colorTex(t);
  t.needsUpdate = true;
  t.userData = { canvas: c };
  return t;
}

/* ------------------------------------------------------------------ ground & material textures */
var GRAVEL = {
  grey: ['#9d9a94', '#b8b4ad', '#7f7c77', '#cbc7be', '#8e8982', '#aaa396', '#6f6c68'],
  gold: ['#b99a6c', '#cbab7d', '#a3865d', '#d8c098', '#8f7454', '#c0a37b', '#7b6347'],
  black: ['#3d3d3c', '#4c4b49', '#2e2e2d', '#595854', '#68665f', '#454240'],
  river: ['#8f8a80', '#a69f92', '#6f6b64', '#b9b1a2', '#857a6b', '#9d978d', '#c3bcae']
};
var MAKETEX = {
  gravel: function (pal) {
    var W = 512, c = canvas(W), x = c.getContext('2d'), R = rng(seedOf(3, pal)), cols = GRAVEL[pal] || GRAVEL.grey, round = pal === 'river';
    x.fillStyle = rgbS(cols[6] || cols[0], 0.42); x.fillRect(0, 0, W, W);
    for (var i = 0; i < 5200; i++) {
      var px = R() * W, py = R() * W, r = (round ? 5 : 3.2) + R() * (round ? 9 : 6.5), col = pick(R, cols), k = 0.8 + R() * 0.35, nv = round ? 10 : 5 + ((R() * 3) | 0), jag = round ? 0.12 : 0.45, sd = R();
      wrapDraw(W, W, function (ox, oy) {
        if (px + ox < -20 || px + ox > W + 20 || py + oy < -20 || py + oy > W + 20) return;
        var r1 = rng(seedOf(i, sd));
        x.fillStyle = 'rgba(0,0,0,0.38)'; blob(x, px + ox + 1.6, py + oy + 1.8, r * 1.02, r1, nv, jag); x.fill();
        r1 = rng(seedOf(i, sd));
        x.fillStyle = rgbS(col, k); blob(x, px + ox, py + oy, r, r1, nv, jag); x.fill();
        r1 = rng(seedOf(i, sd));
        x.fillStyle = rgbS(col, k * 1.18, 0.55); blob(x, px + ox - r * 0.22, py + oy - r * 0.25, r * 0.55, r1, nv, jag); x.fill();
      });
    }
    return toTex(c, [1.6, 1.6]);
  },
  meadow: function () {   // dry summer grass (golden Peninsula hills)
    var W = 512, c = canvas(W), x = c.getContext('2d'), R = rng(61), i;
    x.fillStyle = '#7d6a44'; x.fillRect(0, 0, W, W);
    var cols = ['#c8b07a', '#b39a62', '#8a7448', '#d8c38e', '#9c8656', '#a89060', '#6f6a46', '#cdb98a', '#e0cf9e'];
    x.lineCap = 'round';
    for (i = 0; i < 16000; i++) {
      var px = R() * W, py = R() * W, a = -HALF + (R() - 0.5) * 2.4, L = 4 + R() * 14, dx = Math.cos(a) * L, dy = Math.sin(a) * L;
      x.strokeStyle = pick(R, cols); x.globalAlpha = 0.5 + R() * 0.5; x.lineWidth = 0.8 + R() * 1.4;
      var edge = px < 16 || py < 16 || px > W - 16 || py > W - 16;
      if (edge) wrapDraw(W, W, function (ox, oy) { x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + dx, py + oy + dy); x.stroke(); });
      else { x.beginPath(); x.moveTo(px, py); x.lineTo(px + dx, py + dy); x.stroke(); }
    }
    x.globalAlpha = 1;
    return toTex(c, [3, 3]);
  },
  dg: function () {
    var W = 512, c = canvas(W), x = c.getContext('2d'), R = rng(5), i;
    x.fillStyle = '#a68a63'; x.fillRect(0, 0, W, W);
    for (i = 0; i < 260; i++) {   // soft mottling
      var gx = R() * W, gy = R() * W, rad = 10 + R() * 40, dark = R() < 0.5;
      wrapDraw(W, W, function (ox, oy) { var g = x.createRadialGradient(gx + ox, gy + oy, 0, gx + ox, gy + oy, rad); g.addColorStop(0, dark ? 'rgba(120,95,65,0.12)' : 'rgba(225,205,170,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(gx + ox - rad, gy + oy - rad, rad * 2, rad * 2); });
    }
    var cols = ['#866b4a', '#cbb58d', '#6a5337', '#ddd0b0', '#977650', '#584532', '#b9996c', '#9a8164'];
    for (i = 0; i < 26000; i++) { x.fillStyle = pick(R, cols); x.globalAlpha = 0.35 + R() * 0.5; var s = 0.8 + R() * 1.8; x.fillRect(R() * W, R() * W, s, s); }
    x.globalAlpha = 1;
    for (i = 0; i < 700; i++) {   // small pebbles
      var px = R() * W, py = R() * W, r = 1.5 + R() * 3, col = pick(R, cols);
      x.fillStyle = 'rgba(40,30,20,0.35)'; blob(x, px + 0.8, py + 0.9, r, R, 6, 0.4); x.fill();
      x.fillStyle = col; blob(x, px, py, r, R, 6, 0.4); x.fill();
    }
    return toTex(c, [2.5, 2.5]);
  },
  mulch: function () {
    var W = 512, c = canvas(W), x = c.getContext('2d'), R = rng(7);
    x.fillStyle = '#2e2117'; x.fillRect(0, 0, W, W);
    var cols = ['#6b4a30', '#5a3d26', '#7d5a3b', '#4a3220', '#8a6a48', '#9a7a55', '#3f2b1c'];
    x.lineCap = 'round';
    for (var i = 0; i < 4200; i++) {
      var px = R() * W, py = R() * W, a = R() * TAU, L = 6 + R() * 26, w = 1.5 + R() * 3.5, bend = (R() - 0.5) * 0.6, col = pick(R, cols), k = 0.75 + R() * 0.5;
      wrapDraw(W, W, function (ox, oy) {
        if (px + ox < -40 || px + ox > W + 40 || py + oy < -40 || py + oy > W + 40) return;
        var ex = px + ox + Math.cos(a) * L, ey = py + oy + Math.sin(a) * L, mx = px + ox + Math.cos(a + bend) * L * 0.5, my = py + oy + Math.sin(a + bend) * L * 0.5;
        x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = w + 1.5; x.beginPath(); x.moveTo(px + ox + 1, py + oy + 1.2); x.quadraticCurveTo(mx + 1, my + 1.2, ex + 1, ey + 1.2); x.stroke();
        x.strokeStyle = rgbS(col, k); x.lineWidth = w; x.beginPath(); x.moveTo(px + ox, py + oy); x.quadraticCurveTo(mx, my, ex, ey); x.stroke();
      });
    }
    return toTex(c, [3, 3]);
  },
  lawn: function (striped) {
    var W = 512, c = canvas(W), x = c.getContext('2d'), R = rng(9);
    x.fillStyle = '#2e461e'; x.fillRect(0, 0, W, W);
    var cols = ['#4a7030', '#57803a', '#3b5d27', '#668c46', '#42672d', '#4f6e2e', '#77975a', '#30491f', '#5f7838', '#6d7d45'];
    x.lineCap = 'round';
    for (var i = 0; i < 30000; i++) {
      var px = R() * W, py = R() * W, a = R() * TAU, L = 2 + R() * 6, dx = Math.cos(a) * L, dy = Math.sin(a) * L;
      x.strokeStyle = pick(R, cols); x.globalAlpha = 0.55 + R() * 0.45; x.lineWidth = 0.9 + R() * 1.3;
      var edge = px < 8 || py < 8 || px > W - 8 || py > W - 8;
      if (edge) wrapDraw(W, W, function (ox, oy) { x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + dx, py + oy + dy); x.stroke(); });
      else { x.beginPath(); x.moveTo(px, py); x.lineTo(px + dx, py + dy); x.stroke(); }
    }
    x.globalAlpha = 1;
    if (striped) {   // mowing stripes: two 2-ft bands per 4-ft tile, soft edges
      var g = x.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(255,255,240,0.0)'); g.addColorStop(0.05, 'rgba(255,255,240,0.035)'); g.addColorStop(0.45, 'rgba(255,255,240,0.035)'); g.addColorStop(0.5, 'rgba(0,0,0,0.0)');
      g.addColorStop(0.55, 'rgba(0,20,0,0.04)'); g.addColorStop(0.95, 'rgba(0,20,0,0.04)'); g.addColorStop(1, 'rgba(255,255,240,0.0)');
      x.fillStyle = g; x.fillRect(0, 0, W, W);
      return toTex(c, [4, 4]);
    }
    return toTex(c, [2, 2]);
  },
  concrete: function () {
    var W = 512, c = canvas(W), x = c.getContext('2d'), R = rng(11), i;
    x.fillStyle = '#c4bfb5'; x.fillRect(0, 0, W, W);
    for (i = 0; i < 160; i++) {
      var gx = R() * W, gy = R() * W, rad = 20 + R() * 90, dark = R() < 0.5;
      wrapDraw(W, W, function (ox, oy) { var g = x.createRadialGradient(gx + ox, gy + oy, 0, gx + ox, gy + oy, rad); g.addColorStop(0, dark ? 'rgba(130,125,115,0.08)' : 'rgba(235,232,225,0.09)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(gx + ox - rad, gy + oy - rad, rad * 2, rad * 2); });
    }
    for (i = 0; i < 9000; i++) { x.fillStyle = R() < 0.5 ? 'rgba(90,85,78,0.25)' : 'rgba(250,248,240,0.3)'; x.fillRect(R() * W, R() * W, 1, 1); }
    for (i = 0; i < 500; i++) { x.fillStyle = 'rgba(110,104,96,' + (0.03 + R() * 0.05) + ')'; x.fillRect(0, R() * W, W, 0.8 + R()); }   // broom finish
    x.fillStyle = 'rgba(70,66,60,0.85)'; x.fillRect(0, 0, W, 2); x.fillRect(0, 0, 2, W);                                        // saw-cut joints at the tile edges
    x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(0, 2, W, 1); x.fillRect(2, 0, 1, W);
    return toTex(c, [5, 5]);
  },
  stone: function () {   // greyscale flagstone / paver grain, tinted per stone
    var W = 256, c = canvas(W), x = c.getContext('2d'), R = rng(13), i;
    x.fillStyle = grey(0.8); x.fillRect(0, 0, W, W);
    for (i = 0; i < 90; i++) { var gx = R() * W, gy = R() * W, rad = 8 + R() * 30, dk = R() < 0.5;
      wrapDraw(W, W, function (ox, oy) { var g = x.createRadialGradient(gx + ox, gy + oy, 0, gx + ox, gy + oy, rad); g.addColorStop(0, dk ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(gx + ox - rad, gy + oy - rad, rad * 2, rad * 2); }); }
    for (i = 0; i < 70; i++) { x.strokeStyle = R() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)'; x.lineWidth = 1 + R() * 3; var y = R() * W; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(W * 0.3, y + (R() - 0.5) * 10, W * 0.6, y + (R() - 0.5) * 10, W, y); x.stroke(); }
    for (i = 0; i < 5000; i++) { x.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)'; x.fillRect(R() * W, R() * W, 1, 1); }
    return toTex(c, [2, 2]);
  },
  rock: function () {   // boulder granite/fieldstone, greyscale + lichen
    var W = 256, c = canvas(W), x = c.getContext('2d'), R = rng(17), i;
    x.fillStyle = grey(0.7); x.fillRect(0, 0, W, W);
    for (i = 0; i < 80; i++) { var gx = R() * W, gy = R() * W, rad = 10 + R() * 40, dk = R() < 0.55;
      wrapDraw(W, W, function (ox, oy) { var g = x.createRadialGradient(gx + ox, gy + oy, 0, gx + ox, gy + oy, rad); g.addColorStop(0, dk ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(gx + ox - rad, gy + oy - rad, rad * 2, rad * 2); }); }
    for (i = 0; i < 4500; i++) { var v = R(); x.fillStyle = v < 0.35 ? 'rgba(20,20,20,0.5)' : v < 0.7 ? 'rgba(255,255,255,0.45)' : 'rgba(150,140,130,0.4)'; var s = 0.8 + R() * 2; x.fillRect(R() * W, R() * W, s, s); }
    for (i = 0; i < 40; i++) { var lx = R() * W, ly = R() * W; for (var k = 0; k < 14; k++) { x.fillStyle = 'rgba(235,235,220,' + (0.15 + R() * 0.2) + ')'; x.beginPath(); x.arc(lx + (R() - 0.5) * 14, ly + (R() - 0.5) * 14, 1 + R() * 3.5, 0, TAU); x.fill(); } }
    return toTex(c, [3, 3]);
  },
  veneer: function () {   // stacked ledgestone, 4 ft × 2 ft tile
    var W = 512, H = 256, c = canvas(W, H), x = c.getContext('2d'), R = rng(19);
    x.fillStyle = '#3d362e'; x.fillRect(0, 0, W, H);
    var cols = ['#a39580', '#8d7f6c', '#b8a991', '#7a6d5d', '#9e8a71', '#c2b49c', '#6e655a', '#a89b8a'];
    var y = 0;
    while (y < H) {
      var hh = Math.min(H - y, 10 + R() * 22), xx = -R() * 60;
      while (xx < W) {
        var ww = 40 + R() * 110, col = pick(R, cols), k = 0.85 + R() * 0.3, gap = 2.2;
        var draw = function (ox) {
          x.fillStyle = rgbS(col, k * 0.72); x.fillRect(xx + ox + gap, y + gap, ww - gap * 2, hh - gap * 1.5);
          var g = x.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, rgbS(col, k * 1.12)); g.addColorStop(0.7, rgbS(col, k)); g.addColorStop(1, rgbS(col, k * 0.8));
          x.fillStyle = g; x.fillRect(xx + ox + gap, y + gap, ww - gap * 2 - 1.5, hh - gap * 2 - 1);
          for (var s = 0; s < ww * hh / 30; s++) { x.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'; x.fillRect(xx + ox + gap + R() * (ww - 4), y + gap + R() * (hh - 4), 1.5, 1); }
        };
        draw(0); if (xx + ww > W) draw(-W);
        xx += ww;
      }
      y += hh;
    }
    return toTex(c, [4, 2]);
  },
  bluestone: function () {
    var W = 256, c = canvas(W), x = c.getContext('2d'), R = rng(23), i;
    x.fillStyle = '#7b858a'; x.fillRect(0, 0, W, W);
    for (i = 0; i < 70; i++) { var gx = R() * W, gy = R() * W, rad = 10 + R() * 50, t = R();
      wrapDraw(W, W, function (ox, oy) { var g = x.createRadialGradient(gx + ox, gy + oy, 0, gx + ox, gy + oy, rad); g.addColorStop(0, t < 0.4 ? 'rgba(60,70,78,0.12)' : t < 0.8 ? 'rgba(170,175,175,0.12)' : 'rgba(150,120,90,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(gx + ox - rad, gy + oy - rad, rad * 2, rad * 2); }); }
    for (i = 0; i < 5000; i++) { x.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'; x.fillRect(R() * W, R() * W, 1, 1); }
    return toTex(c, [2, 2]);
  },
  corten: function () {
    var W = 256, c = canvas(W), x = c.getContext('2d'), R = rng(29), i;
    x.fillStyle = '#7f4423'; x.fillRect(0, 0, W, W);
    var cols = ['rgba(163,90,42,', 'rgba(110,58,29,', 'rgba(184,103,47,', 'rgba(80,42,22,', 'rgba(140,72,34,'];
    for (i = 0; i < 260; i++) { var gx = R() * W, gy = R() * W, rad = 4 + R() * 26, cc = pick(R, cols), al = 0.15 + R() * 0.3;
      wrapDraw(W, W, function (ox, oy) { var g = x.createRadialGradient(gx + ox, gy + oy, 0, gx + ox, gy + oy, rad); g.addColorStop(0, cc + al + ')'); g.addColorStop(1, cc + '0)'); x.fillStyle = g; x.fillRect(gx + ox - rad, gy + oy - rad, rad * 2, rad * 2); }); }
    for (i = 0; i < 3000; i++) { x.fillStyle = R() < 0.5 ? 'rgba(60,30,15,0.3)' : 'rgba(200,120,60,0.25)'; x.fillRect(R() * W, R() * W, 1 + R(), 1 + R()); }
    for (i = 0; i < 40; i++) { x.fillStyle = 'rgba(70,35,18,' + (0.05 + R() * 0.08) + ')'; x.fillRect(R() * W, 0, 1 + R() * 3, W); }   // runoff streaks
    return toTex(c, [2, 2]);
  },
  wood: function (base, dark, seed) {
    var W = 256, c = canvas(W), x = c.getContext('2d'), R = rng(seed), i;
    x.fillStyle = base; x.fillRect(0, 0, W, W);
    for (i = 0; i < 120; i++) {
      var y0 = R() * W, amp = 0.4 + R() * 1.6, ph = R() * TAU;
      x.strokeStyle = dark; x.globalAlpha = 0.05 + R() * 0.14; x.lineWidth = 0.5 + R() * 1.4;
      for (var oy = -W; oy <= W; oy += W) { x.beginPath(); for (var px = 0; px <= W; px += 8) { var yy = y0 + oy + Math.sin(px / W * TAU + ph) * amp; if (px === 0) x.moveTo(px, yy); else x.lineTo(px, yy); } x.stroke(); }
    }
    for (i = 0; i < 300; i++) { x.fillStyle = R() < 0.6 ? dark : 'rgba(255,255,255,0.6)'; x.globalAlpha = 0.05 + R() * 0.1; x.fillRect(R() * W, R() * W, 2 + R() * 12, 0.7); }
    x.globalAlpha = 1;
    return toTex(c, [2, 2]);
  },
  cladding: function () {   // vertical board cladding (spa cabinet, planters): 6" boards with gaps
    var W = 256, c = canvas(W), x = c.getContext('2d'), R = rng(31), bw = W / 4;
    x.fillStyle = '#1c1a18'; x.fillRect(0, 0, W, W);
    for (var b = 0; b < 4; b++) {
      var k = 0.9 + R() * 0.2;
      x.fillStyle = rgbS('#8a8278', k); x.fillRect(b * bw + 2, 0, bw - 4, W);
      for (var i = 0; i < 40; i++) { x.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'; x.fillRect(b * bw + 2 + R() * (bw - 6), 0, 0.6 + R() * 1.4, W); }
    }
    return toTex(c, [2, 2]);
  },
  fabric: function () {
    var W = 128, c = canvas(W), x = c.getContext('2d'), R = rng(37);
    x.fillStyle = '#808080'; x.fillRect(0, 0, W, W);
    for (var i = 0; i < W; i += 2) {
      var v = (110 + R() * 50) | 0; x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.6)'; x.fillRect(0, i, W, 1);
      v = (110 + R() * 50) | 0; x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.6)'; x.fillRect(i, 0, 1, W);
    }
    return toTex(c, [0.4, 0.4], false);
  },
  waterNormal: function () {
    var W = 256, c = canvas(W), x = c.getContext('2d'), img = x.createImageData(W, W), d = img.data;
    function h(px, py) { return fbm3(px / W * 6, py / W * 6, 0.5, 41, 4); }
    for (var py = 0; py < W; py++) for (var px = 0; px < W; px++) {
      // periodic sampling for seamless tiling
      var hx = h((px + 1) % W, py) - h((px - 1 + W) % W, py), hy = h(px, (py + 1) % W) - h(px, (py - 1 + W) % W);
      var nx = -hx * 3, ny = -hy * 3, nz = 1, l = Math.sqrt(nx * nx + ny * ny + 1), i = (py * W + px) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return toTex(c, [3, 3], false);
  },
  lava: function () {
    var W = 128, c = canvas(W), x = c.getContext('2d'), R = rng(43);
    x.fillStyle = '#1b1715'; x.fillRect(0, 0, W, W);
    for (var i = 0; i < 500; i++) { var px = R() * W, py = R() * W, r = 2 + R() * 5;
      x.fillStyle = 'rgba(0,0,0,0.5)'; blob(x, px + 1, py + 1, r, R, 6, 0.5); x.fill();
      x.fillStyle = rgbS(pick(R, ['#4a3a33', '#5b463b', '#3a302c', '#6e4e3a', '#2f2a27']), 0.9 + R() * 0.3); blob(x, px, py, r, R, 6, 0.5); x.fill(); }
    return toTex(c, [1, 1]);
  },
  contact: function () {
    var W = 64, c = canvas(W), x = c.getContext('2d');
    var g = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.45, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, W);
    var t = new THREE.CanvasTexture(c); return t;
  },
  flame: function () {
    var W = 128, c = canvas(W), x = c.getContext('2d'), R = rng(47);
    for (var i = 0; i < 9; i++) {
      var cx = W * (0.2 + 0.6 * R()), h = W * (0.5 + 0.45 * R()), w = W * (0.1 + 0.08 * R());
      var g = x.createLinearGradient(0, W, 0, W - h);
      g.addColorStop(0, 'rgba(255,240,200,0.9)'); g.addColorStop(0.25, 'rgba(255,170,60,0.8)'); g.addColorStop(0.7, 'rgba(230,80,20,0.45)'); g.addColorStop(1, 'rgba(160,30,0,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(cx - w, W); x.quadraticCurveTo(cx - w * 1.1, W - h * 0.5, cx + (R() - 0.5) * w, W - h); x.quadraticCurveTo(cx + w * 1.1, W - h * 0.5, cx + w, W); x.closePath(); x.fill();
    }
    var t = new THREE.CanvasTexture(c); colorTex(t); return t;
  }
};
function getTex(name) {
  if (!TEX[name]) {
    switch (name) {
      case 'atlas': TEX[name] = buildAtlas(); break;
      case 'gravel': TEX[name] = MAKETEX.gravel('grey'); break;
      case 'gravelGold': TEX[name] = MAKETEX.gravel('gold'); break;
      case 'gravelBlack': TEX[name] = MAKETEX.gravel('black'); break;
      case 'gravelRiver': TEX[name] = MAKETEX.gravel('river'); break;
      case 'lawnStriped': TEX[name] = MAKETEX.lawn(true); break;
      case 'teak': TEX[name] = MAKETEX.wood('#a8784a', '#5a3a1e', 51); break;
      case 'cedar': TEX[name] = MAKETEX.wood('#b0704a', '#5e3220', 53); break;
      case 'woodGrey': TEX[name] = MAKETEX.wood('#9b968e', '#55514c', 57); break;
      case 'woodPaint': TEX[name] = MAKETEX.wood('#e8e8e8', '#b8b8b8', 59); break;
      default: TEX[name] = MAKETEX[name]();
    }
  }
  return TEX[name];
}
/* ================================================================== MATERIALS */
function std(p) {
  var c = p.color, e = p.emissive; delete p.color; delete p.emissive;
  var m = new THREE.MeshStandardMaterial(p);
  if (c !== undefined) setLin(m.color, c);
  if (e !== undefined) setLin(m.emissive, e);
  return m;
}
// surfaces lying on terrain: pull toward the camera a little so they never z-fight the ground mesh
function groundMat(tex, rough, extra) {
  var p = { color: 0xffffff, map: getTex(tex), roughness: rough, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };
  for (var k in extra || {}) p[k] = extra[k];
  return std(p);
}

/* wind: optional vertex sway (off by default; LAND.setWind turns it on) */
var WIND = { enabled: false, uniforms: { landTime: { value: 0 }, landWind: { value: 0 }, landWindDir: { value: new THREE.Vector2(1, 0.3).normalize() } } };
var WIND_GLSL = [
  '#ifdef USE_INSTANCING',
  '  mat4 lwM = modelMatrix * instanceMatrix;',
  '#else',
  '  mat4 lwM = modelMatrix;',
  '#endif',
  '  mat3 lwR = mat3(lwM);',
  '  float lwS2 = max(dot(lwR[0], lwR[0]), 1e-6);',
  '  float lwH = max(transformed.y, 0.0) * sqrt(lwS2);',
  '  float lwPh = landTime * 1.7 + dot(lwM[3].xz, vec2(0.23, 0.31));',
  '  float lwA = landWind * 0.03 * lwH * lwH / (1.0 + 0.5 * lwH);',
  '  vec3 lwD = vec3(landWindDir.x, 0.0, landWindDir.y) * (0.55 + 0.45 * sin(lwPh)) * lwA',
  '          + vec3(sin(lwPh * 2.7 + position.x * 3.0 + position.z), 0.0, cos(lwPh * 2.3 + position.z * 3.0 + position.x)) * lwA * 0.2;',
  '  transformed += vec3(dot(lwR[0], lwD), dot(lwR[1], lwD), dot(lwR[2], lwD)) / lwS2;'
].join('\n');
function plantCompile(isDepth) {
  return function (shader) {
    if (!isDepth) {   // cards carry "volume" normals: keep them on both faces instead of flipping back faces
      shader.fragmentShader = shader.fragmentShader
        .replace(/normal\s*=\s*normal\s*\*\s*faceDirection\s*;/g, '')
        .replace(/normal\s*\*=\s*faceDirection\s*;/g, '');
    }
    if (WIND.enabled) {
      for (var k in WIND.uniforms) shader.uniforms[k] = WIND.uniforms[k];
      shader.vertexShader = 'uniform float landTime;\nuniform float landWind;\nuniform vec2 landWindDir;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_GLSL);
    }
  };
}
function plantKey() { return 'land-plant-w' + (WIND.enabled ? 1 : 0); }

var BOXUV = { corten: 1, steel: 1, teak: 1, cedar: 1, paintWhite: 1, paintCharcoal: 1, paintSage: 1, cladding: 1, capstone: 1,
  concrete: 1, cushion: 1, cushionCharcoal: 1, cushionAccent: 1, cover: 1, woodGrey: 1 };
var NOSHADOW = { contact: 1, flame: 1, bulb: 1, water: 1, glow: 1 };
var NORECEIVE = { contact: 1, flame: 1, bulb: 1, glow: 1 };
var DEPTHMAT = { plant: 1 };
var MATDEF = {
  plant: function () {
    var m = std({ color: 0xffffff, map: getTex('atlas'), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
    m.onBeforeCompile = plantCompile(false); m.customProgramCacheKey = plantKey;
    return m;
  },
  contact: function () {
    var m = new THREE.MeshBasicMaterial({ map: getTex('contact'), transparent: true, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    m.toneMapped = false; return m;
  },
  gravel: function () { return groundMat('gravel', 1); },
  gravelGold: function () { return groundMat('gravelGold', 1); },
  gravelBlack: function () { return groundMat('gravelBlack', 0.9); },
  gravelRiver: function () { return groundMat('gravelRiver', 0.85); },
  dg: function () { return groundMat('dg', 1); },
  mulch: function () { return groundMat('mulch', 1); },
  lawn: function () { return groundMat('lawnStriped', 0.92); },
  lawnPlain: function () { return groundMat('lawn', 0.92); },
  meadow: function () { return groundMat('meadow', 1); },
  concrete: function () { return std({ color: 0xffffff, map: getTex('concrete'), roughness: 0.85, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }); },
  flagstone: function () { return std({ color: 0xffffff, map: getTex('stone'), roughness: 0.82, metalness: 0, vertexColors: true }); },
  paver: function () { return std({ color: 0xffffff, map: getTex('stone'), roughness: 0.8, metalness: 0, vertexColors: true }); },
  mortar: function () { return groundMat('dg', 1, { color: 0x9a9286 }); },
  stone: function () { return std({ color: 0xffffff, map: getTex('rock'), roughness: 0.9, metalness: 0, vertexColors: true }); },
  veneer: function () { return std({ color: 0xffffff, map: getTex('veneer'), roughness: 0.92, metalness: 0 }); },
  capstone: function () { return std({ color: 0xffffff, map: getTex('bluestone'), roughness: 0.75, metalness: 0 }); },
  corten: function () { return std({ color: 0xffffff, map: getTex('corten'), roughness: 0.85, metalness: 0.25 }); },
  steel: function () { return std({ color: 0x2c2c2b, roughness: 0.55, metalness: 0.6 }); },
  teak: function () { return std({ color: 0xffffff, map: getTex('teak'), roughness: 0.7, metalness: 0 }); },
  cedar: function () { return std({ color: 0xffffff, map: getTex('cedar'), roughness: 0.75, metalness: 0 }); },
  woodGrey: function () { return std({ color: 0xffffff, map: getTex('woodGrey'), roughness: 0.8, metalness: 0 }); },
  paintWhite: function () { return std({ color: 0xf3f1ea, map: getTex('woodPaint'), roughness: 0.55, metalness: 0 }); },
  paintCharcoal: function () { return std({ color: 0x55585a, map: getTex('woodPaint'), roughness: 0.55, metalness: 0 }); },
  paintSage: function () { return std({ color: 0xa3b097, map: getTex('woodPaint'), roughness: 0.55, metalness: 0 }); },
  cushion: function () { return std({ color: 0xdcd3c2, roughness: 0.95, metalness: 0, bumpMap: getTex('fabric'), bumpScale: 0.003 }); },
  cushionCharcoal: function () { return std({ color: 0x4d4e50, roughness: 0.95, metalness: 0, bumpMap: getTex('fabric'), bumpScale: 0.003 }); },
  cushionAccent: function () { return std({ color: 0xb8683f, roughness: 0.95, metalness: 0, bumpMap: getTex('fabric'), bumpScale: 0.003 }); },
  frame: function () { return std({ color: 0x3b3b3a, roughness: 0.45, metalness: 0.55 }); },
  acrylic: function () { return std({ color: 0xe8eae9, roughness: 0.22, metalness: 0 }); },
  cladding: function () { return std({ color: 0xffffff, map: getTex('cladding'), roughness: 0.8, metalness: 0 }); },
  cover: function () { return std({ color: 0x5d5952, roughness: 0.75, metalness: 0, bumpMap: getTex('fabric'), bumpScale: 0.002 }); },
  water: function () { return std({ color: 0x3b8792, roughness: 0.04, metalness: 0.05, normalMap: getTex('waterNormal'), normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.86, envMapIntensity: 1.2 }); },
  lava: function () { return std({ color: 0xffffff, map: getTex('lava'), roughness: 1, metalness: 0 }); },
  soil: function () { return std({ color: 0xffffff, map: getTex('mulch'), roughness: 1, metalness: 0 }); },
  flame: function () {
    var m = new THREE.MeshBasicMaterial({ map: getTex('flame'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.toneMapped = false; return m;
  },
  ember: function () { return std({ color: 0x3a1a0c, emissive: 0xff5a14, emissiveIntensity: 1.4, roughness: 0.9 }); },
  bulb: function () { return std({ color: 0xfff3dc, emissive: 0xffd9a0, emissiveIntensity: 2.0, roughness: 0.3 }); },
  cable: function () { return std({ color: 0x1b1b1b, roughness: 0.6, metalness: 0 }); },
  rvBody: function () { return std({ color: 0xf1f0ea, roughness: 0.32, metalness: 0 }); },
  rvTrim: function () { return std({ color: 0x8a8781, roughness: 0.45, metalness: 0.1 }); },
  rvStripe: function () { return std({ color: 0x33373b, roughness: 0.4, metalness: 0.1 }); },
  glassDark: function () { return std({ color: 0x1b2226, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.1 }); },
  rubber: function () { return std({ color: 0x1c1c1c, roughness: 0.9, metalness: 0 }); },
  rim: function () { return std({ color: 0xc9cbcc, roughness: 0.3, metalness: 0.9 }); },
  propane: function () { return std({ color: 0xeceae4, roughness: 0.4, metalness: 0.1 }); }
};
var MATS = {}, OVERRIDES = {}, DEPTHS = {};
LAND.setMaterials = function (map) { for (var k in map) OVERRIDES[k] = map[k]; return LAND; };
LAND.mat = function (name) {
  if (OVERRIDES[name]) return OVERRIDES[name];
  if (!MATS[name]) {
    var f = MATDEF[name];
    if (!f) { if (global.console) console.warn('LAND: unknown material "' + name + '", using grey'); MATS[name] = std({ color: 0x999999, roughness: 0.8 }); }
    else MATS[name] = f();
    MATS[name].name = name;
    if (MATS[name].isMeshStandardMaterial && MATS[name].metalness < 0.5 && MATS[name].envMapIntensity === 1) MATS[name].envMapIntensity = 0.7;
  }
  return MATS[name];
};
LAND.materialNames = function () { return Object.keys(MATDEF); };
function depthMaterial(name) {
  if (!DEPTHS[name]) {
    var src = LAND.mat(name);
    var d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: src.map, alphaTest: src.alphaTest || 0.5, side: THREE.DoubleSide });
    d.onBeforeCompile = plantCompile(true); d.customProgramCacheKey = plantKey;
    DEPTHS[name] = d;
  }
  return DEPTHS[name];
}

/* optional outdoor environment (sky dome → PMREM) for soft sky light + reflections */
LAND.makeSkyEnvironment = function (renderer, o) {
  o = opt({ top: 0x5f8fc4, horizon: 0xdfe6e8, ground: 0x6d6450, sun: [-0.45, 0.62, 0.65], sunColor: 0xfff1d8, sunStrength: 14 }, o);
  var pm = new THREE.PMREMGenerator(renderer), sc = new THREE.Scene();
  var g = new THREE.SphereGeometry(50, 48, 24), p = g.attributes.position, cols = new Float32Array(p.count * 3);
  var T = hexLin(o.top), Hc = hexLin(o.horizon), G = hexLin(o.ground), sd = vnorm(o.sun), SC = hexLin(o.sunColor);
  for (var i = 0; i < p.count; i++) {
    var d = vnorm([p.getX(i), p.getY(i), p.getZ(i)]), c;
    if (d[1] >= 0) c = mixc(Hc, T, Math.pow(d[1], 0.55)); else c = mixc(Hc, G, Math.min(1, -d[1] * 5));
    var s = Math.max(0, vdot(d, sd)), glow = Math.pow(s, 8) * 0.8 + Math.pow(s, 400) * o.sunStrength;
    cols[i * 3] = c[0] + SC[0] * glow; cols[i * 3 + 1] = c[1] + SC[1] * glow; cols[i * 3 + 2] = c[2] + SC[2] * glow;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  var tex = pm.fromScene(sc, 0.04).texture;
  pm.dispose(); g.dispose();
  return tex;
};
/* ================================================================== PLANT TOOLKIT
   Everything vegetal is written into ONE part ('plant'): leaf / flower cards, stems, grass blades, succulent leaves,
   trunks and dense cores all sample the same 512² atlas, so each plant kind is a single draw call (and a single
   InstancedMesh in LAND.scatter).  Colour = atlas texel (greyscale art) × vertex colour (species tint × AO). */
var PM = 'plant', UP = [0, 1, 0];
function detailOf(o) { return clamp((o.detail != null ? o.detail : 1) * CONFIG.detail, 0.15, 2); }
function bloomOn(o, meta) {
  if (o.bloom === true || o.bloom === false) return o.bloom;
  if (!o.season) return true;
  return !!(meta && meta.bloom && meta.bloom.seasons.indexOf(o.season) >= 0);
}
function tints(t) { return (Array.isArray(t) ? t : [t]).map(hexLin); }

/* ---------------------------------------------------------------- envelope: the plant's outer volume */
function Envelope(shape, w, h, d, lump, seed) {
  this.shape = shape; this.w = w; this.h = h; this.d = d || w; this.lump = lump || 0; this.seed = seed || 1;
  var c, r;
  switch (shape) {
    case 'mound': c = [0, 0, 0]; r = [w / 2, h, this.d / 2]; break;               // half ellipsoid sitting on the ground
    case 'mat': c = [0, 0, 0]; r = [w / 2, h, this.d / 2]; break;
    case 'dome': c = [0, h * 0.32, 0]; r = [w / 2, h * 0.68, this.d / 2]; break;  // rounder, skirt reaches the ground
    case 'globe': c = [0, h / 2, 0]; r = [w / 2, h / 2, this.d / 2]; break;
    case 'upright': c = [0, h * 0.54, 0]; r = [w / 2, h * 0.46, this.d / 2]; break;
    case 'vase': c = [0, h * 0.58, 0]; r = [w / 2, h * 0.42, this.d / 2]; break;
    case 'box': c = [0, h / 2, 0]; r = [w / 2, h / 2, this.d / 2]; break;        // clipped hedge / cube (superellipsoid)
    case 'cone': c = [0, h * 0.4, 0]; r = [w / 2, h, this.d / 2]; break;         // clipped cone / pyramid
    default: c = [0, h / 2, 0]; r = [w / 2, h / 2, this.d / 2];
  }
  this.c = c; this.r = r; this.sq = 8;
}
Envelope.prototype.lumpAt = function (dir) { return this.lump ? 1 + this.lump * vnoise3(dir[0] * 1.8 + 3, dir[1] * 1.8 + 1, dir[2] * 1.8 + 7, this.seed) : 1; };
// map a unit direction + radial fraction to a point
Envelope.prototype.point = function (dir, rho) {
  if (this.shape === 'box') {
    var n = this.sq, s = Math.pow(Math.pow(Math.abs(dir[0]), n) + Math.pow(Math.abs(dir[1]), n) + Math.pow(Math.abs(dir[2]), n), 1 / n), kk = rho * this.lumpAt(dir) / s;
    return [dir[0] * this.r[0] * kk, this.c[1] + dir[1] * this.r[1] * kk, dir[2] * this.r[2] * kk];
  }
  if (this.shape === 'cone') {
    var t = clamp(dir[1] * 0.5 + 0.5, 0, 1), hl = Math.hypot(dir[0], dir[2]) || 1, rad = Math.pow(1 - t, 0.9) * rho * this.lumpAt(dir);
    return [dir[0] / hl * this.r[0] * rad, t * this.h * lerp(1, rho, 0.3), dir[2] / hl * this.r[2] * rad];
  }
  var k = rho * this.lumpAt(dir), p = [this.c[0] + dir[0] * this.r[0] * k, this.c[1] + dir[1] * this.r[1] * k, this.c[2] + dir[2] * this.r[2] * k];
  var yn = clamp(p[1] / this.h, 0, 1), s = 1;
  if (this.shape === 'upright') s = 0.55 + 0.45 * smooth(0, 0.5, yn);
  else if (this.shape === 'vase') s = 0.3 + 0.7 * Math.pow(yn, 0.7);
  else if (this.shape === 'dome') s = 0.8 + 0.2 * smooth(0, 0.3, yn);
  p[0] *= s; p[2] *= s;
  if (p[1] < 0) p[1] *= 0.15;
  return p;
};
Envelope.prototype.sampleDir = function (R, minY) {
  var d;
  for (var t = 0; t < 30; t++) {
    d = randDir(R);
    var lo = minY !== undefined ? minY : (this.shape === 'mound' || this.shape === 'mat') ? -0.05 : this.shape === 'dome' ? -0.55 : -1;
    if (d[1] >= lo) break;
  }
  if (this.shape === 'mat') { d[1] = Math.abs(d[1]) * 0.8 + 0.05; d = vnorm(d); }
  return d;
};
// extra sub-ellipsoids on the shell break the symmetric "ball" look
Envelope.prototype.addLobes = function (R, n, size, minY) {
  this.lobes = [];
  for (var i = 0; i < n; i++) {
    var d = this.sampleDir(R, minY === undefined ? 0.05 : minY), p = this.point(d, 0.55 + 0.15 * R()), s = size * (0.75 + 0.5 * R());
    this.lobes.push({ c: p, r: [this.r[0] * s, this.r[1] * s * 0.85, this.r[2] * s] });
  }
  return this;
};
// sample a point for foliage: → [point, outward dir]
Envelope.prototype.sample = function (R, minY, rho) {
  if (this.lobes && this.lobes.length && R() < 0.55) {
    var L = this.lobes[(R() * this.lobes.length) | 0], d = randDir(R);
    if (d[1] < -0.3) d[1] = -d[1] * 0.5;
    var k = rho * this.lumpAt(d), p = [L.c[0] + d[0] * L.r[0] * k, Math.max(-0.05, L.c[1] + d[1] * L.r[1] * k), L.c[2] + d[2] * L.r[2] * k];
    return [p, vnorm(vadd(vnorm(vsub(p, this.c)), d))];
  }
  var dir = this.sampleDir(R, minY);
  return [this.point(dir, rho), dir];
};
Envelope.prototype._lobeN = function (p) {
  var best = null, bd = 1e9;
  for (var i = 0; i < this.lobes.length; i++) {
    var L = this.lobes[i], dx = (p[0] - L.c[0]) / L.r[0], dy = (p[1] - L.c[1]) / L.r[1], dz = (p[2] - L.c[2]) / L.r[2], dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dd < bd) { bd = dd; best = L; }
  }
  return [best, bd];
};
// outward "volume" normal for a point
Envelope.prototype.normal = function (p, upBias) {
  if (this.lobes && this.lobes.length) {
    var ln = this._lobeN(p), L = ln[0];
    var nm = this._normal(p, upBias), nl = vnorm([(p[0] - L.c[0]) / (L.r[0] * L.r[0]), (p[1] - L.c[1]) / (L.r[1] * L.r[1]), (p[2] - L.c[2]) / (L.r[2] * L.r[2])]);
    var wl = clamp(1.6 - ln[1], 0, 1) * 0.6;
    nl[1] += upBias === undefined ? 0.25 : upBias;
    return vnorm(vadd(vsc(nm, 1 - wl), vsc(vnorm(nl), wl)));
  }
  return this._normal(p, upBias);
};
Envelope.prototype._normal = function (p, upBias) {
  if (this.shape === 'box') {
    var n = this.sq, x = (p[0] - this.c[0]) / this.r[0], y = (p[1] - this.c[1]) / this.r[1], z = (p[2] - this.c[2]) / this.r[2];
    var g = vnorm([Math.sign(x) * Math.pow(Math.abs(x), n - 1) / this.r[0], Math.sign(y) * Math.pow(Math.abs(y), n - 1) / this.r[1], Math.sign(z) * Math.pow(Math.abs(z), n - 1) / this.r[2]]);
    g = vnorm(vadd(g, vsc(vnorm([x, y, z]), 0.6))); g[1] += (upBias === undefined ? 0.15 : upBias * 0.6);
    return vnorm(g);
  }
  if (this.shape === 'cone') {
    var hl = Math.hypot(p[0], p[2]) || 1, sl = this.r[0] / this.h;
    var nc = vnorm([p[0] / hl, sl + 0.25, p[2] / hl]); nc[1] += (upBias === undefined ? 0.15 : upBias * 0.5);
    return vnorm(nc);
  }
  var d = [(p[0] - this.c[0]) / (this.r[0] * this.r[0]), (p[1] - this.c[1]) / (this.r[1] * this.r[1]) * (this.shape === 'mound' || this.shape === 'mat' ? 0.7 : 1), (p[2] - this.c[2]) / (this.r[2] * this.r[2])];
  d = vnorm(d); d[1] += upBias === undefined ? 0.25 : upBias;
  return vnorm(d);
};
// normalised radial position (0 centre .. 1 shell) for AO
Envelope.prototype.rho = function (p) {
  var r0 = this._rho(p);
  if (this.lobes && this.lobes.length) r0 = Math.min(r0, this._lobeN(p)[1]);
  return r0;
};
Envelope.prototype._rho = function (p) {
  if (this.shape === 'box') {
    var n = this.sq;
    return Math.pow(Math.pow(Math.abs(p[0] / this.r[0]), n) + Math.pow(Math.abs((p[1] - this.c[1]) / this.r[1]), n) + Math.pow(Math.abs(p[2] / this.r[2]), n), 1 / n);
  }
  if (this.shape === 'cone') { var t = clamp(p[1] / this.h, 0, 0.98); return Math.hypot(p[0] / this.r[0], p[2] / this.r[2]) / Math.max(0.05, Math.pow(1 - t, 0.9)); }
  var dx = (p[0] - this.c[0]) / this.r[0], dy = (p[1] - this.c[1]) / this.r[1], dz = (p[2] - this.c[2]) / this.r[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};
Envelope.prototype.ao = function (p, strength) {
  var rho = clamp(this.rho(p), 0, 1.1), yn = clamp(p[1] / this.h, 0, 1), s = strength === undefined ? 1 : strength;
  var a = lerp(0.5, 1.0, Math.pow(Math.min(rho, 1), 1.4)) * lerp(0.78, 1.04, Math.pow(yn, 0.6));
  return lerp(1, a, s);
};

/* ---------------------------------------------------------------- cards */
// quad: base point, up axis u, side axis s, size; colours per vertex via colFn(p)
function cardQ(m, cell, base, u, s, w, h, nfn, colFn) {
  var uv = cellUV(cell), hw = w / 2;
  var p0 = vmad(base, s, -hw), p1 = vmad(base, s, hw), p2 = vmad(p1, u, h), p3 = vmad(p0, u, h);
  var a = m.vert(p0, nfn(p0), uv[0], uv[3], colFn(p0)), b = m.vert(p1, nfn(p1), uv[2], uv[3], colFn(p1));
  var c = m.vert(p2, nfn(p2), uv[2], uv[1], colFn(p2)), d = m.vert(p3, nfn(p3), uv[0], uv[1], colFn(p3));
  m.quad(a, b, c, d);
}
function crossQ(m, cell, base, u, w, h, nfn, colFn, R, n) {
  var s = perp(u), a0 = R() * PI;
  for (var k = 0; k < (n || 2); k++) cardQ(m, cell, base, u, vrot(s, u, a0 + k * PI / (n || 2)), w, h, nfn, colFn);
}
// a thin stalk (two crossed strips) using the striated 'solid' cell
function stalk(m, a, b, wid, nfn, col) {
  var u = vnorm(vsub(b, a)), L = vlen(vsub(b, a)), s = perp(u);
  var f = function () { return col; };
  cardQ(m, 'solid', a, u, s, wid, L, nfn, f);
  cardQ(m, 'solid', a, u, vcross(u, s), wid, L, nfn, f);
}

/* foliage: N leaf cards distributed in an envelope, concentrated toward the shell, pointing outward like sprigs */
function foliage(m, env, R, P) {
  var n = Math.round(P.n), cols = P.tints, size = P.size, cell = P.cell, aspect = cellAspect(cell);
  var shell = P.shell === undefined ? 0.55 : P.shell, outw = P.out === undefined ? 0.85 : P.out, upw = P.up === undefined ? 0.45 : P.up;
  for (var i = 0; i < n; i++) {
    var rho = 1 - (1 - shell) * Math.pow(R(), 1.8), sp = env.sample(R, P.minY, rho), p = sp[0], dir = sp[1];
    var u, s, w = size * (0.7 + 0.6 * R()), h = w * aspect, base;
    if (P.tangent) {   // clipped surfaces: cards lie on the shell, tilted out a little
      var nn = env.normal(p, 0), t0 = vnorm(vcross(nn, randDir(R)));
      u = vnorm(vadd(t0, vsc(nn, P.tangent)));
      s = vnorm(vcross(u, nn));
      base = vmad(vmad(p, u, -h * 0.5), nn, -0.02);
    } else {
      u = vnorm(vadd(vadd(vsc(dir, outw), vsc(UP, upw)), vsc(randDir(R), P.rand === undefined ? 0.55 : P.rand)));
      s = vnorm(vcross(u, randDir(R)));
      base = vmad(p, u, -h * (P.inset === undefined ? 0.45 : P.inset));
    }
    if (base[1] < -0.05) base[1] = -0.05;
    var col = jit(cols[(R() * cols.length) | 0], R, P.jit || 0.12, 0.08), aoS = P.ao;
    cardQ(m, cell, base, u, s, w, h, function (q) { return env.normal(q, P.nup); }, function (q) { return vsc(col, env.ao(q, aoS)); });
  }
}
/* flowers: 'tips' (spikes rising from the upper shell), 'surface' (trusses facing out), 'above' (on stalks above the foliage) */
function flowers(m, env, R, P) {
  var n = Math.round(P.n), cols = P.tints, cell = P.cell, aspect = cellAspect(cell), upr = P.upright === undefined ? 0.7 : P.upright;
  var stalkCol = P.stalk ? hexLin(P.stalk) : null;
  for (var i = 0; i < n; i++) {
    var dir = env.sampleDir(R, P.minY === undefined ? 0.15 : P.minY);
    var col = jit(cols[(R() * cols.length) | 0], R, P.jit || 0.1, 0.05);
    var w = P.size * (0.75 + 0.5 * R()), h = w * aspect * (P.stretch || 1);
    var nfn = function (q) { return env.normal(q, 0.55); }, cf = function () { return col; };
    if (P.where === 'surface') {
      var sp1 = env.sample(R, P.minY === undefined ? 0.15 : P.minY, P.rho || (0.97 + 0.08 * R())), p = sp1[0], nrm = vnorm(vadd(sp1[1], vsc(UP, 0.3)));
      var u = vnorm(vsub(UP, vsc(nrm, vdot(UP, nrm)))); if (vlen(u) < 0.1) u = perp(nrm);
      u = vrot(u, nrm, (R() - 0.5) * 1.2);
      var s = vcross(u, nrm);
      cardQ(m, cell, vmad(p, u, -h * 0.5), u, s, w, h, function () { return vnorm(vadd(nrm, [0, 0.4, 0])); }, cf);
    } else if (P.where === 'above') {
      var root = env.point(dir, 0.35 + 0.3 * R()), top = env.point(dir, 1.0);
      var L = (P.stalkLen || 0.8) * (0.7 + 0.6 * R());
      var lean = vnorm(vadd(vsc(UP, upr * 2), vsc([dir[0], 0, dir[2]], 1 - upr + 0.15)));
      var tip = vmad([top[0], Math.max(top[1], root[1]), top[2]], lean, L);
      if (stalkCol) stalk(m, root, tip, P.stalkW || 0.03, nfn, vsc(stalkCol, 0.9 + 0.2 * R()));
      var uu = vnorm(vadd(lean, vsc(randDir(R), 0.15)));
      if (P.face) { // flower faces up/out (poppy cups, umbels)
        var nn = vnorm(vadd(UP, vsc([dir[0], 0, dir[2]], 0.6))), su = vnorm(vcross(nn, randDir(R))), uf = vcross(su, nn);
        cardQ(m, cell, vmad(tip, uf, -h * 0.45), uf, su, w, h, function () { return vnorm(vadd(nn, [0, 0.5, 0])); }, cf);
        cardQ(m, cell, vmad(tip, vnorm(vadd(UP, vsc(uf, 0.2))), -h * 0.15), vnorm(vadd(UP, vsc(uf, 0.2))), su, w, h, nfn, cf);
      } else crossQ(m, cell, vmad(tip, uu, -h * 0.2), uu, w, h, nfn, cf, R);
    } else {   // 'tips': spikes emerging from the shell
      var sp2 = env.sample(R, P.minY === undefined ? 0.15 : P.minY, 0.9 + 0.12 * R()), p2 = sp2[0], d2 = sp2[1];
      var u2 = vnorm(vadd(vadd(vsc(UP, upr), vsc(d2, 1 - upr)), vsc(randDir(R), 0.12)));
      crossQ(m, cell, vmad(p2, u2, -h * (P.inset === undefined ? 0.25 : P.inset)), u2, w, h, nfn, cf, R);
    }
  }
}

/* ---------------------------------------------------------------- tubes (stems, branches, trunks) with the bark cell */
function tubeM(m, pts, radii, sides, colFn, cell) {
  cell = cell || 'bark';
  var uv = cellUV(cell), n = pts.length, rings = [], prevN = null, i, k;
  for (i = 0; i < n; i++) {
    var t = vnorm(vsub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    var nn = prevN ? vnorm(vsub(prevN, vsc(t, vdot(prevN, t)))) : perp(t);
    if (vlen(nn) < 0.1) nn = perp(t);
    prevN = nn;
    var bb = vcross(t, nn), ring = [];
    for (k = 0; k <= sides; k++) {
      var a = k / sides * TAU, dir = vadd(vsc(nn, Math.cos(a)), vsc(bb, Math.sin(a)));
      var p = vmad(pts[i], dir, radii[i]);
      ring.push(m.vert(p, dir, lerp(uv[0], uv[2], k / sides), (i % 2) ? uv[1] : uv[3], colFn(p, i / (n - 1))));
    }
    rings.push(ring);
  }
  for (i = 0; i < n - 1; i++) for (k = 0; k < sides; k++) m.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k + 1], rings[i][k + 1]);
  return rings;
}
// a wandering limb from a to b with gentle noise
function limbPts(a, b, segs, wob, R) {
  var out = [], d = vsub(b, a), L = vlen(d), s1 = perp(vnorm(d)), s2 = vcross(vnorm(d), s1);
  var ph1 = R() * TAU, ph2 = R() * TAU;
  for (var i = 0; i <= segs; i++) {
    var t = i / segs, k = Math.sin(t * PI) * wob * L;
    out.push(vadd(vadd(vmad(a, d, t), vsc(s1, Math.sin(ph1 + t * 3.1) * k)), vsc(s2, Math.sin(ph2 + t * 2.3) * k * 0.7)));
  }
  return out;
}
/* stems for shrubs: from near the base out to the envelope (visible through open foliage) */
function stems(m, env, R, n, rad, col, P) {
  P = P || {};
  for (var i = 0; i < n; i++) {
    var a = R() * TAU, r0 = env.w * 0.06 * R(), base = [Math.cos(a) * r0, -0.05, Math.sin(a) * r0];
    var dir = env.sampleDir(R, P.minY === undefined ? 0.25 : P.minY), end = env.point(dir, P.reach || (0.6 + 0.3 * R()));
    var pts = limbPts(base, end, 4, 0.12, R);
    var c = jit(col, R, 0.1);
    tubeM(m, pts, pts.map(function (q, k) { return rad * (1 - 0.65 * k / (pts.length - 1)); }), 4, function (p) { return vsc(c, env.ao(p, 0.7)); });
    if (P.branch && R() < P.branch) {
      var mid = pts[2], d2 = env.sampleDir(R, 0.3), e2 = env.point(d2, 0.75 + 0.2 * R()), p2 = limbPts(mid, e2, 3, 0.1, R);
      tubeM(m, p2, p2.map(function (q, k) { return rad * 0.6 * (1 - 0.6 * k / (p2.length - 1)); }), 4, function (p) { return vsc(c, env.ao(p, 0.7)); });
    }
  }
}
/* dense core blob so dense shrubs don't look see-through (uses the opaque 'dense' leafy cell) */
function coreBlob(m, env, R, scale, col, seg) {
  var uv = cellUV('dense'), W = seg || 10, H = Math.max(4, Math.round(W * 0.6)), grid = [], i, j;
  var lo = (env.shape === 'mound' || env.shape === 'mat') ? 0.02 : 0;
  for (j = 0; j <= H; j++) {
    var row = [], th = lo ? lerp(0, HALF * 1.05, j / H) : lerp(-HALF, HALF, j / H);
    for (i = 0; i < W; i++) {
      var ph = i / W * TAU, dir = [Math.cos(th) * Math.cos(ph), Math.sin(th), Math.cos(th) * Math.sin(ph)];
      if (lo && j === 0) dir = vnorm([dir[0], -0.02, dir[2]]);
      row.push(env.point(dir, scale));
    }
    grid.push(row);
  }
  var cu = (uv[2] - uv[0]), cv = (uv[3] - uv[1]);
  function tri(a, b, c) {
    var nA = env.normal(a, 0.2), nB = env.normal(b, 0.2), nC = env.normal(c, 0.2);
    var e1 = vnorm(vsub(b, a)), fn = vnorm(vcross(vsub(b, a), vsub(c, a))), e2 = vcross(fn, e1);
    var P2 = [a, b, c].map(function (p) { var d = vsub(p, a); return [vdot(d, e1), vdot(d, e2)]; });
    var minu = Math.min(P2[0][0], P2[1][0], P2[2][0]), minv = Math.min(P2[0][1], P2[1][1], P2[2][1]);
    var k = 0.22;   // atlas fraction per foot
    var spanU = (Math.max(P2[0][0], P2[1][0], P2[2][0]) - minu) * k, spanV = (Math.max(P2[0][1], P2[1][1], P2[2][1]) - minv) * k;
    var sc = Math.min(1, cu * 0.95 / Math.max(spanU, 1e-6), cv * 0.95 / Math.max(spanV, 1e-6)) * k;
    var ou = uv[0] + R() * Math.max(0, cu - spanU * sc / k), ov = uv[1] + R() * Math.max(0, cv - spanV * sc / k);
    var ids = [a, b, c].map(function (p, q) {
      var cc = vsc(col, env.ao(p, 0.7) * 1.25);
      return m.vert(p, [nA, nB, nC][q], ou + (P2[q][0] - minu) * sc, ov + (P2[q][1] - minv) * sc, cc);
    });
    m.tri(ids[0], ids[2], ids[1]);
  }
  for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
    var a = grid[j][i], b = grid[j][(i + 1) % W], c = grid[j + 1][(i + 1) % W], d = grid[j + 1][i];
    tri(a, b, c); tri(a, c, d);
  }
}

/* ---------------------------------------------------------------- grasses: bundles of curved blade strips */
function grassClump(m, R, P) {
  var uv = cellUV('solid'), n = Math.round(P.blades), segs = P.segs || 4;
  var cb = hexLin(P.base), cm = hexLin(P.mid), ct = hexLin(P.tip);
  for (var i = 0; i < n; i++) {
    var a = R() * TAU, rb = Math.sqrt(R()) * P.spread, bx = Math.cos(a) * rb, bz = Math.sin(a) * rb;
    var az = a + (R() - 0.5) * (P.twist || 0.9), outer = P.spread > 0 ? rb / P.spread : R();
    var tilt = (P.tilt0 || 0.08) + (P.tilt || 0.7) * Math.pow(outer, 0.8) * (0.55 + 0.45 * R());
    var L = P.h * (0.65 + 0.45 * R()) / Math.max(0.35, Math.cos(tilt * 0.8));
    var droop = (P.arch || 0) * (0.5 + 0.7 * R()) * (0.4 + outer);
    var hd = [Math.cos(az), 0, Math.sin(az)], side = [-Math.sin(az), 0, Math.cos(az)];
    var w0 = P.width * (0.75 + 0.5 * R()), jc = jit([1, 1, 1], R, P.jit || 0.12, 0.1), pos = [bx, -0.03, bz], ids = [];
    side = vrot(side, UP, (R() - 0.5) * 0.6);
    for (var k = 0; k <= segs; k++) {
      var t = k / segs, ang = tilt + droop * t * t;
      var tang = vnorm(vadd(vsc(hd, Math.sin(ang)), vsc(UP, Math.cos(ang))));
      if (k > 0) pos = vmad(pos, tang, L / segs);
      var wv = w0 * (1 - Math.pow(t, P.taper || 1.6)) * (k === 0 ? 0.8 : 1);
      var nrm = vnorm(vadd(vadd(vcross(tang, side), vsc(UP, 0.9)), vsc(hd, 0.35)));
      if (nrm[1] < 0.15) nrm = vnorm(vadd(nrm, [0, 0.5, 0]));
      var col = t < 0.5 ? mixc(cb, cm, t * 2) : mixc(cm, ct, (t - 0.5) * 2);
      col = [col[0] * jc[0], col[1] * jc[1], col[2] * jc[2]];
      if (k === segs) { ids.push([m.vert(pos, nrm, (uv[0] + uv[2]) / 2, uv[1], col)]); break; }
      var vv = lerp(uv[3], uv[1], t);
      ids.push([m.vert(vmad(pos, side, -wv / 2), nrm, uv[0], vv, col), m.vert(vmad(pos, side, wv / 2), nrm, uv[2], vv, col)]);
    }
    for (k = 0; k < ids.length - 1; k++) {
      if (ids[k + 1].length === 1) m.tri(ids[k][0], ids[k][1], ids[k + 1][0]);
      else m.quad(ids[k][0], ids[k][1], ids[k + 1][1], ids[k + 1][0]);
    }
  }
}

/* ---------------------------------------------------------------- succulent rosettes: real leaf geometry */
function rosette(m, R, P) {
  var n = Math.round(P.leaves), golden = 2.39996, uv = cellUV('solid'), segs = P.segs || 5;
  var cBase = hexLin(P.base), cMid = hexLin(P.color), cTip = hexLin(P.tip || P.color), cEdge = hexLin(P.edge || P.color), cSpine = hexLin(P.spine || '#3a2a1e');
  for (var i = 0; i < n; i++) {
    var t = n > 1 ? i / (n - 1) : 0;   // 0 = outer (oldest), 1 = inner
    var az = i * golden + (R() - 0.5) * 0.25;
    var el = lerp(P.el0, P.el1, Math.pow(t, P.elPow || 0.8)) + (R() - 0.5) * 0.12;
    var L = P.len * lerp(1, P.innerLen || 0.45, Math.pow(t, 1.2)) * (0.9 + 0.2 * R());
    var hw = P.width * lerp(1, 0.6, t) * (0.9 + 0.2 * R()), th = P.thick * lerp(1, 0.7, t);
    var hd = [Math.cos(az), 0, Math.sin(az)], side = [-Math.sin(az), 0, Math.cos(az)];
    var r0 = P.r0 * (1 - t * 0.8), base = [hd[0] * r0, (P.y0 || 0) + t * (P.rise || 0), hd[2] * r0];
    var curl = (P.curl || 0) * (1 - t * 0.6) + (R() - 0.5) * 0.15;   // + bends tip down, − cups up
    var pos = base, rings = [];
    for (var k = 0; k <= segs; k++) {
      var s = k / segs, ang = el - curl * s * s * 1.2;
      var tang = vnorm(vadd(vsc(hd, Math.cos(ang)), vsc(UP, Math.sin(ang))));
      if (k > 0) pos = vmad(pos, tang, L / segs);
      var upn = vnorm(vcross(side, tang));          // leaf's upper-surface normal
      var wv = hw * Math.sin(Math.min(1, s * (P.wPeak ? 1 / P.wPeak : 2.2) + 0.15) * HALF) * (1 - Math.pow(s, 2.5));
      if (P.strap) wv = hw * (1 - Math.pow(s, 3));
      var tv = th * (1 - s * 0.85);
      if (k === segs) { wv = 0; tv = 0; }
      var c = s < 0.15 ? mixc(cBase, cMid, s / 0.15) : s > 0.85 ? mixc(cMid, cTip, (s - 0.85) / 0.15) : cMid;
      if (k === segs) c = cSpine;
      // cross-section: left edge, upper channel, right edge, keel
      var pts = [vmad(pos, side, -wv), vmad(pos, upn, tv * (P.channel === undefined ? 0.15 : P.channel)), vmad(pos, side, wv), vmad(pos, upn, -tv)];
      var nrm = [vnorm(vadd(vsc(side, -1), vsc(upn, 0.4))), vnorm(vadd(upn, vsc(UP, 0.2))), vnorm(vadd(side, vsc(upn, 0.4))), vnorm(vsc(upn, -1))];
      var cols = [mixc(c, cEdge, 0.7), c, mixc(c, cEdge, 0.7), vsc(c, 0.8)];
      rings.push(pts.map(function (p, q) { return m.vert(p, nrm[q], q === 1 ? (uv[0] + uv[2]) / 2 : q === 3 ? uv[2] : uv[0], lerp(uv[3], uv[1], s), cols[q]); }));
    }
    for (k = 0; k < segs; k++) for (var q2 = 0; q2 < 4; q2++) {
      var a = rings[k][q2], b = rings[k][(q2 + 1) % 4], cc = rings[k + 1][(q2 + 1) % 4], d = rings[k + 1][q2];
      m.quad(a, d, cc, b);
    }
  }
}

/* ---------------------------------------------------------------- trees: skeleton + leaf-card clusters */
function treeBuild(m, R, P) {
  var H = P.h, W = P.w, cBark = hexLin(P.bark), leafCols = P.leafTints, det = P.detail || 1;
  var crownY0 = P.trunkH, crownC = [0, crownY0 + (H - crownY0) * (P.crownMid || 0.5), 0];
  var cr = [W / 2, (H - crownY0) / 2, W / 2];
  var crown = { c: crownC, r: cr };
  function crownRho(p) { var dx = (p[0] - crownC[0]) / cr[0], dy = (p[1] - crownC[1]) / cr[1], dz = (p[2] - crownC[2]) / cr[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  // 1. cluster centres near the crown shell (Poisson-ish)
  var K = Math.round(P.clusters * Math.sqrt(det)), cl = [], tries = 0, minD = P.clusterR * (P.clusterGap || 1.0);
  while (cl.length < K && tries < K * 60) {
    tries++;
    var d = randDir(R); if (d[1] < (P.minY === undefined ? -0.55 : P.minY)) continue;
    var rho = lerp(P.innerRho || 0.45, 0.92, Math.pow(R(), 0.5));
    var p = [crownC[0] + d[0] * cr[0] * rho, crownC[1] + d[1] * cr[1] * rho * (P.flatTop && d[1] > 0 ? 0.8 : 1), crownC[2] + d[2] * cr[2] * rho];
    if (P.layers) { var L = P.layers, ly = Math.round((p[1] - crownY0) / ((H - crownY0) / L)); p[1] = lerp(p[1], crownY0 + ly * (H - crownY0) / L + 0.2, 0.7); }
    var ok = true; for (var j = 0; j < cl.length; j++) if (vlen(vsub(cl[j], p)) < minD) { ok = false; break; }
    if (ok) cl.push(p);
  }
  // 2. trunks
  var trunks = [], nT = P.trunks || 1;
  for (var t = 0; t < nT; t++) {
    var a = (t / nT) * TAU + R() * 0.8, lean = nT > 1 ? (P.lean || 0.35) : (P.lean || 0.05) * (R() - 0.5);
    var b0 = nT > 1 ? [Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25] : [0, 0, 0];
    var top = [Math.cos(a) * H * lean * 0.35 + (nT > 1 ? 0 : (R() - 0.5) * 0.3), crownY0 + (R() - 0.3) * 0.8, Math.sin(a) * H * lean * 0.35];
    trunks.push({ base: b0, top: top, pts: limbPts(vadd(b0, [0, -0.4, 0]), top, 5, P.gnarl || 0.06, R), kids: [] });
  }
  // 3. assign clusters to trunks (nearest azimuth) and grow scaffold limbs: trunk top → group centroid → clusters
  cl.forEach(function (c) {
    var best = 0, bd = 1e9; trunks.forEach(function (tr, i) { var dd = vlen(vsub([c[0], 0, c[2]], [tr.top[0] * 1.5, 0, tr.top[2] * 1.5])); if (dd < bd) { bd = dd; best = i; } });
    trunks[best].kids.push(c);
  });
  var segsAll = [];   // [pts, r0, r1, sides]
  var rTip = P.twigR || 0.03;
  trunks.forEach(function (tr) {
    var kids = tr.kids; if (!kids.length) kids = [vadd(tr.top, [0, 1, 0])];
    // group kids into scaffolds by azimuth
    var nS = Math.max(1, Math.min(P.scaffolds || 4, kids.length));
    var groups = []; for (var g = 0; g < nS; g++) groups.push([]);
    kids.forEach(function (c) { var az = Math.atan2(c[2] - tr.top[2], c[0] - tr.top[0]); var gi = Math.floor(((az + PI) / TAU) * nS + 0.5 * (P.rot || 0)) % nS; groups[gi].push(c); });
    var trunkArea = 0;
    groups.forEach(function (gr) {
      if (!gr.length) return;
      var cen = [0, 0, 0]; gr.forEach(function (c) { cen = vadd(cen, c); }); cen = vsc(cen, 1 / gr.length);
      var start = vlerp(tr.pts[tr.pts.length - 2], tr.top, R());
      var fork = vlerp(start, cen, 0.55 + 0.15 * R()); fork[1] = Math.max(fork[1], start[1] + 0.3);
      var leafArea = 0;
      gr.forEach(function (c) {
        var tw = limbPts(fork, vadd(c, [0, -P.clusterR * 0.3, 0]), 3, 0.1, R);
        segsAll.push([tw, Math.sqrt(1) * rTip * 1.6, rTip, 4]);
        leafArea += 1;
      });
      var rS = rTip * 1.6 * Math.sqrt(leafArea) * 1.05;
      segsAll.push([limbPts(start, fork, 4, 0.08, R), rS, rTip * 1.6 * Math.sqrt(leafArea) * 0.85, 5]);
      trunkArea += leafArea;
    });
    var rT = Math.max(P.trunkR || 0.2, rTip * 1.6 * Math.sqrt(trunkArea) * 1.1);
    if (P.trunkR) rT = P.trunkR * (nT > 1 ? 0.75 : 1);
    segsAll.push([tr.pts, rT * 1.25, rT * 0.8, P.trunkSides || 7]);
  });
  segsAll.forEach(function (sg) {
    var pts = sg[0], r0 = sg[1], r1 = sg[2];
    tubeM(m, pts, pts.map(function (q, k) { return lerp(r0, r1, k / (pts.length - 1)); }), sg[3], function (p) {
      var ao = lerp(0.72, 1, clamp(crownRho(p), 0, 1));
      return vsc(cBark, ao);
    });
  });
  // 4. foliage clusters
  if (P.leafless) return { crown: crown, clusters: cl };
  var per = Math.max(4, Math.round(P.perCluster * det)), aspect = cellAspect(P.cell);
  cl.forEach(function (c) {
    var rc = P.clusterR * (0.8 + 0.4 * R()), flat = P.clusterFlat || 0.65;
    for (var i = 0; i < per; i++) {
      var d = randDir(R); var rr2 = 1 - 0.6 * Math.pow(R(), 1.6);
      var p = [c[0] + d[0] * rc * rr2, c[1] + d[1] * rc * rr2 * flat, c[2] + d[2] * rc * rr2];
      var out = vnorm(vsub(p, crownC));
      var u = vnorm(vadd(vadd(vsc(d, 0.7), vsc(out, 0.4)), vadd(vsc(UP, P.leafUp === undefined ? 0.35 : P.leafUp), vsc(randDir(R), 0.6))));
      var s = vnorm(vcross(u, randDir(R)));
      var w = P.leafSize * (0.75 + 0.5 * R()), h = w * aspect;
      var col = jit(leafCols[(R() * leafCols.length) | 0], R, 0.12, 0.08);
      cardQ(m, P.cell, vmad(p, u, -h * 0.45), u, s, w, h, function (q) {
        var a1 = vnorm([(q[0] - c[0]) / rc, (q[1] - c[1]) / (rc * flat), (q[2] - c[2]) / rc]), a2 = vnorm([(q[0] - crownC[0]) / (cr[0] * cr[0]), (q[1] - crownC[1]) / (cr[1] * cr[1]), (q[2] - crownC[2]) / (cr[2] * cr[2])]);
        return vnorm(vadd(vadd(vsc(a1, 0.55), vsc(a2, 0.6)), [0, 0.3, 0]));
      }, function (q) {
        var lr = clamp(vlen([(q[0] - c[0]) / rc, (q[1] - c[1]) / (rc * flat), (q[2] - c[2]) / rc]), 0, 1);
        var ao = lerp(0.55, 1, Math.pow(lr, 1.2)) * lerp(0.62, 1.05, clamp(crownRho(q), 0, 1)) * lerp(0.85, 1.05, clamp((q[1] - crownY0) / (H - crownY0), 0, 1));
        return vsc(col, ao);
      });
    }
  });
  if (P.extra) P.extra(cl, crown);
  return { crown: crown, clusters: cl };
}
/* ================================================================== PLANTS: shrubs, perennials, grasses, succulents
   Common options for every plant: w, h (mature size, ft), seed, bloom (true|false|'auto'), season ('spring'|'summer'|'fall'|'winter'|null),
   detail (card/blade count multiplier; 0.5–0.7 for phones), contact (soft ground-contact shadow decal, default true). */
var LEAF_K = 1.85, CORE_K = 0.86;   // global card-size / core-size tuning
var PLANT_COMMON = { seed: 1, bloom: 'auto', season: null, detail: 1, contact: true };
function plantDefaults(o) { return opt(PLANT_COMMON, o); }
function contactDecal(b, w, d) {
  var g = new THREE.PlaneGeometry(w, d); g.rotateX(-HALF); g.translate(0, 0.02, 0);
  b.add('contact', g, null, { keepUV: true });
}
function shrubSize(o) { return [o.w, o.d || o.w, o.h]; }
// spec(o, R) → {shape, lump, w, h, d, leaf:{cell,tints,size,n,...}, core:{scale,tint}, stems:{n,rad,col,...}, flowers:[{...}]}
function buildShrub(kind, b, o, spec) {
  var R = rng(seedOf(o.seed, kind)), m = b.mesher(PM), det = detailOf(o), S = spec(o, R), K = KINDS[kind];
  var env = new Envelope(S.shape, S.w || o.w, S.h || o.h, S.d || o.d || o.w, S.lump === undefined ? 0.15 : S.lump, o.seed);
  var nl = S.lobes !== undefined ? S.lobes : (S.shape === 'mat' ? 4 : 3);
  if (nl) env.addLobes(R, nl, S.lobeSize || 0.5);
  var dflt = K.defaults, k = clamp(Math.sqrt((o.w * o.h) / (dflt.w * dflt.h)), 0.55, 2.2);
  if (S.core) coreBlob(m, env, R, S.core.scale * CORE_K, S.leaf ? mulc(hexLin(S.leaf.tints[0]), 0.62) : hexLin(S.core.tint), S.core.seg);
  if (S.stems) stems(m, env, R, Math.max(1, Math.round(S.stems.n * Math.min(1, det + 0.3))), S.stems.rad * k, hexLin(S.stems.col), S.stems);
  var L = S.leaf;
  if (L) foliage(m, env, R, { cell: L.cell, tints: tints(L.tints), size: L.size * k * LEAF_K, n: L.n * det * (S.nScale || 1), shell: L.shell, out: L.out, up: L.up, rand: L.rand, inset: L.inset, jit: L.jit, ao: L.ao, minY: L.minY, nup: L.nup });
  if (S.flowers && bloomOn(o, K.meta)) S.flowers.forEach(function (F) {
    if (!F) return;
    var P = {}; for (var q in F) P[q] = F[q];
    P.n = F.n * det; P.tints = tints(F.tint); P.size = F.size * k; if (F.stalkLen) P.stalkLen = F.stalkLen * k;
    flowers(m, F.env || env, R, P);
  });
  if (S.after) S.after(m, env, R, k, det);
  if (o.contact) contactDecal(b, (S.w || o.w) * 1.15, (S.d || o.d || o.w) * 1.15);
}
function defShrub(kind, category, meta, defaults, spec, note) {
  def(kind, category, plantDefaults(defaults), function (b, o) { buildShrub(kind, b, o, spec); }, meta.sizeFn || shrubSize, note,
    { latin: meta.latin, common: meta.common, concept: meta.concept, combustible: true, place: 'sink', bloom: meta.bloom, mature: meta.mature, water: meta.water });
}
var FLOWERCOL = {
  white: ['#f7f4ec', '#fbf9f3', '#efebe0'], pink: ['#f08cb4', '#f6a0c2', '#e67aa6'], coral: ['#f27a6e', '#f58a7a', '#e8685e'],
  magenta: ['#d6408e', '#e0549b', '#c8337f'], red: ['#c8283a', '#d63345', '#b81f30'], lavender: ['#a78bd6', '#b59ce0', '#9a7cca'],
  blue: ['#7d98d8', '#8eaae2', '#6c86c8'], yellow: ['#f2d64a', '#f6e05e', '#e8c93a'], purple: ['#7b4fa8', '#8a5cb8', '#6c3f98'],
  orange: ['#f38a1a', '#f59a20', '#ee7a12'], apricot: ['#f2a24a', '#f4b260', '#ea9238']
};

/* ---------------------------------------------------------------- MEDITERRANEAN */
defShrub('salviaLeucantha', 'perennial', { latin: 'Salvia leucantha', common: 'Mexican bush sage', concept: ['mediterranean'], mature: '3–4 ft h × 4–6 ft w', water: 'low',
  bloom: { seasons: ['summer', 'fall', 'winter'], color: 'velvety purple spikes (Aug–Dec)' } },
  { w: 4.5, h: 3.5, color: 'purple' }, function (o) {
    return { shape: 'mound', lump: 0.22,
      leaf: { cell: 'lance', tints: ['#97a685', '#a5b293', '#8b9b7a'], size: 0.55, n: 330, shell: 0.45, out: 0.9, up: 0.55 },
      stems: { n: 16, rad: 0.03, col: '#b9bcb2', minY: 0.35, reach: 0.95 },
      flowers: [{ where: 'tips', cell: 'spike', tint: FLOWERCOL[o.color] || o.color, n: 56, size: 0.26, stretch: 1.55, upright: 0.42, minY: 0.18, inset: 0.15 }] };
  }, 'Arching grey-green mound with long velvety spikes at the stem tips. color: purple|lavender|white or hex.');

defShrub('salviaGreggii', 'perennial', { latin: 'Salvia greggii', common: 'Autumn sage', concept: ['mediterranean', 'desert'], mature: '2–3 ft h × 2–3 ft w', water: 'low',
  bloom: { seasons: ['spring', 'summer', 'fall'], color: 'red, pink or coral (spring–fall)' } },
  { w: 2.5, h: 2.2, color: 'red' }, function (o) {
    return { shape: 'dome', lump: 0.2,
      leaf: { cell: 'small', tints: ['#5f7d43', '#6c8a4c', '#56713d'], size: 0.36, n: 280, shell: 0.5 },
      core: { scale: 0.62, tint: '#3e5230' },
      stems: { n: 10, rad: 0.02, col: '#6e5c48', minY: 0.3 },
      flowers: [{ where: 'tips', cell: 'tube', tint: FLOWERCOL[o.color] || o.color, n: 60, size: 0.3, upright: 0.75, minY: 0.1 }] };
  }, 'Twiggy rounded sage with small bright tubular flowers. color: red|pink|coral|white or hex.');

defShrub('lavender', 'perennial', { latin: 'Lavandula × intermedia ‘Grosso’', common: 'Lavender', concept: ['mediterranean'], mature: '2–3 ft h × 2–3 ft w', water: 'low',
  bloom: { seasons: ['spring', 'summer'], color: 'violet wands on long stalks (May–Aug)' } },
  { w: 3, h: 2.6, type: 'intermedia' }, function (o) {
    var fh = o.h * 0.52;
    return { shape: 'dome', lump: 0.12, h: fh,
      leaf: { cell: 'needle', tints: ['#9fae95', '#adbaa2', '#93a389'], size: 0.42, n: 270, shell: 0.6, up: 0.6 },
      core: { scale: 0.8, tint: '#7a8873' },
      flowers: [{ where: 'above', cell: 'spike', tint: o.type === 'spanish' ? ['#5a3d8c', '#6a4a9c'] : ['#7f6cba', '#8b78c5', '#7262ad'], n: 95, size: 0.11, stretch: 1.7, stalkLen: (o.h - fh) * 0.75, stalk: '#a4ae92', stalkW: 0.022, upright: 0.72, minY: 0.05 }] };
  }, 'Silver-grey cushion with dozens of long-stalked violet wands. type: intermedia | spanish (deeper violet, smaller).');

defShrub('rosemary', 'shrub', { latin: 'Salvia rosmarinus', common: 'Rosemary (‘Tuscan Blue’ / prostrate)', concept: ['mediterranean'], mature: 'upright 4–6 ft h × 4 ft w; prostrate 1–2 ft h × 6 ft w', water: 'low',
  bloom: { seasons: ['winter', 'spring'], color: 'pale blue flecks (Dec–Apr)' } },
  { w: 4, h: 4.5, habit: 'upright' }, function (o) {
    var pro = o.habit === 'prostrate';
    return { shape: pro ? 'mat' : 'upright', lump: pro ? 0.35 : 0.22,
      leaf: { cell: 'needle', tints: ['#6a8160', '#788e6c', '#5e7457'], size: pro ? 0.5 : 0.55, n: pro ? 320 : 380, shell: 0.5, up: pro ? 0.2 : 0.8, out: pro ? 1 : 0.6 },
      core: { scale: 0.72, tint: '#3f4f3a' },
      stems: { n: pro ? 8 : 12, rad: 0.035, col: '#7a6a55', minY: pro ? 0.05 : 0.5 },
      flowers: [{ where: 'surface', cell: 'umbel', tint: ['#a8b8e2', '#b9c6ea'], n: pro ? 40 : 50, size: 0.3, minY: 0.0 }] };
  }, 'Upright ‘Tuscan Blue’ column or prostrate trailing mat (habit: upright|prostrate).');

/* ---------------------------------------------------------------- CALIFORNIA NATIVE */
defShrub('manzanita', 'shrub', { latin: 'Arctostaphylos densiflora ‘Howard McMinn’', common: 'Manzanita', concept: ['native'], mature: '5–6 ft h × 6–7 ft w', water: 'very low',
  bloom: { seasons: ['winter', 'spring'], color: 'white-pink urn clusters (Jan–Mar)' } },
  { w: 6, h: 5, habit: 'shrub' }, function (o) {
    var gc = o.habit === 'groundcover';
    return { shape: gc ? 'mat' : 'dome', lump: 0.28, h: gc ? Math.min(o.h, 1.2) : o.h,
      leaf: { cell: gc ? 'small' : 'round', tints: gc ? ['#4f6e3a', '#5b7c44'] : ['#8aa36f', '#97ae7b', '#7b955f'], size: gc ? 0.42 : 0.54, n: gc ? 340 : 330, shell: 0.6, up: 0.6 },
      core: { scale: 0.6, tint: '#4c5f3b' },
      stems: gc ? null : { n: 14, rad: 0.075, col: '#9a3f22', branch: 0.7, reach: 0.78, minY: 0.2 },
      flowers: [{ where: 'surface', cell: 'umbel', tint: ['#f4dcdc', '#f6e8e2', '#efd2d2'], n: 70, size: 0.6 }] };
  }, 'Dense grey-green dome on mahogany-red stems; habit: shrub|groundcover (‘Emerald Carpet’). For the tree form use manzanitaTree.');

defShrub('ceanothus', 'shrub', { latin: 'Ceanothus ‘Concha’', common: 'California lilac', concept: ['native'], mature: '6 ft h × 7–8 ft w', water: 'very low',
  bloom: { seasons: ['spring'], color: 'cobalt-blue puffs (Mar–May)' } },
  { w: 7, h: 6, habit: 'shrub' }, function (o) {
    var gc = o.habit === 'groundcover';
    return { shape: gc ? 'mat' : 'dome', lump: 0.22, h: gc ? Math.min(o.h, 2) : o.h,
      leaf: { cell: 'small', tints: ['#46663a', '#527342', '#3e5a33'], size: 0.46, n: 340, shell: 0.6 },
      core: { scale: 0.7, tint: '#2b3d22' },
      flowers: [{ where: 'surface', cell: 'truss', tint: ['#5a6cd0', '#6a7cd8', '#4e5fc0', '#7484dc'], n: 240, size: 0.5 }] };
  }, 'Dark glossy evergreen dome smothered in blue in spring; habit: shrub|groundcover (‘Yankee Point’).');

defShrub('toyon', 'shrub', { latin: 'Heteromeles arbutifolia', common: 'Toyon', concept: ['native'], mature: '8–15 ft h × 8–10 ft w', water: 'very low',
  bloom: { seasons: ['summer'], color: 'white flat clusters (Jun–Jul); red berries Nov–Jan' } },
  { w: 9, h: 9, show: 'auto' }, function (o) {
    var show = o.show !== 'auto' ? o.show : (o.season === 'summer' ? 'flowers' : o.season === 'spring' ? 'none' : 'berries');
    var fl = [];
    if (show === 'flowers' && o.bloom !== false) fl.push({ where: 'surface', cell: 'umbel', tint: ['#f4f1e4', '#efeadb'], n: 70, size: 0.7 });
    if (show === 'berries' && o.bloom !== false) fl.push({ where: 'surface', cell: 'berry', tint: ['#c9261d', '#d33424', '#b81c18'], n: 90, size: 0.55 });
    return { shape: 'dome', lump: 0.3, lobes: 4, lobeSize: 0.55,
      leaf: { cell: 'broad', tints: ['#4a6a37', '#567842', '#40602f'], size: 0.58, n: 430, shell: 0.55 },
      core: { scale: 0.66, tint: '#2c3f22' },
      stems: { n: 8, rad: 0.09, col: '#77736a', minY: 0.55, reach: 0.7 },
      flowers: fl };
  }, 'Large evergreen shrub; show: auto|berries|flowers|none (auto follows season; berries if no season).');

defShrub('coffeeberry', 'shrub', { latin: 'Frangula californica ‘Mound San Bruno’', common: 'Coffeeberry', concept: ['native'], mature: '4–6 ft h × 5–7 ft w', water: 'very low',
  bloom: { seasons: ['summer', 'fall'], color: 'berries red → black (Aug–Oct)' } },
  { w: 6, h: 5 }, function () {
    return { shape: 'dome', lump: 0.2,
      leaf: { cell: 'broad', tints: ['#46613a', '#52703f', '#3e5733'], size: 0.6, n: 380, shell: 0.55 },
      core: { scale: 0.68, tint: '#2a3b21' },
      flowers: [{ where: 'surface', cell: 'berry', tint: ['#7a1f22', '#2e1d29', '#4f1828', '#9a2a22'], n: 50, size: 0.45 }] };
  }, 'Dense deep-green dome; fruit shown when blooming.');

defShrub('californiaFuchsia', 'perennial', { latin: 'Epilobium canum', common: 'California fuchsia', concept: ['native'], mature: '1–2 ft h × 3 ft w', water: 'very low',
  bloom: { seasons: ['summer', 'fall'], color: 'scarlet tubes (Aug–Oct)' } },
  { w: 3, h: 1.5 }, function () {
    return { shape: 'mound', lump: 0.3,
      leaf: { cell: 'lance', tints: ['#a8b39c', '#b4bea8', '#9ba78e'], size: 0.32, n: 280, shell: 0.5 },
      flowers: [{ where: 'tips', cell: 'tube', tint: ['#e8462b', '#f05632', '#d93c25'], n: 95, size: 0.36, upright: 0.45, minY: 0.05 }] };
  }, 'Low silvery mound covered in scarlet tubular flowers late in the season.');

defShrub('buckwheat', 'shrub', { latin: 'Eriogonum fasciculatum', common: 'California buckwheat', concept: ['native'], mature: '2–3 ft h × 3–4 ft w', water: 'very low',
  bloom: { seasons: ['spring', 'summer', 'fall'], color: 'cream-pink pompoms (May–Sep), aging rust (fall)' } },
  { w: 3.5, h: 2.5 }, function (o) {
    var rust = o.season === 'fall';
    return { shape: 'dome', lump: 0.3, h: o.h * 0.8,
      leaf: { cell: 'needle', tints: ['#66744f', '#73805b', '#5b6847'], size: 0.44, n: 250, shell: 0.55 },
      core: { scale: 0.6, tint: '#3f4832' },
      stems: { n: 12, rad: 0.025, col: '#6b5a48', minY: 0.3 },
      flowers: [{ where: 'above', cell: 'umbel', tint: rust ? ['#a8562e', '#94492a', '#b8693a'] : ['#f2ede2', '#f3e2e4', '#ebe3d2'], n: 70, size: 0.46, stalkLen: o.h * 0.3, stalk: '#7a6a52', stalkW: 0.02, face: true, upright: 0.6 }] };
  }, 'Fine needle-leaved mound with flat-topped flower heads that age to rust in fall.');

defShrub('yarrow', 'perennial', { latin: 'Achillea millefolium', common: 'Yarrow', concept: ['native', 'mediterranean'], mature: '1–3 ft h × 2 ft w', water: 'low',
  bloom: { seasons: ['spring', 'summer'], color: 'white flat umbels (cultivars yellow, pink)' } },
  { w: 2, h: 2.2, color: 'white' }, function (o) {
    return { shape: 'mound', lump: 0.2, h: o.h * 0.4,
      leaf: { cell: 'feathery', tints: ['#6f8f52', '#7e9d5f', '#648448'], size: 0.42, n: 170, shell: 0.4, up: 0.9 },
      flowers: [{ where: 'above', cell: 'umbel', tint: FLOWERCOL[o.color] || o.color, n: 24, size: 0.48, stalkLen: o.h * 0.55, stalk: '#7e9468', stalkW: 0.022, face: true, upright: 0.85 }] };
  }, 'Ferny clump with flat flower heads on stiff stalks. color: white|yellow|pink or hex.');

defShrub('poppy', 'perennial', { latin: 'Eschscholzia californica', common: 'California poppy', concept: ['native'], mature: '1 ft h × 1–1.5 ft w', water: 'very low',
  bloom: { seasons: ['spring', 'summer'], color: 'orange satin cups (Feb–Jun)' } },
  { w: 1.3, h: 1.0, color: 'orange' }, function (o) {
    return { shape: 'mound', lump: 0.25, h: o.h * 0.5,
      leaf: { cell: 'feathery', tints: ['#86a596', '#93b1a1', '#7b9a8b'], size: 0.34, n: 95, shell: 0.4, up: 0.8 },
      flowers: [{ where: 'above', cell: 'cup', tint: FLOWERCOL[o.color] || o.color, n: 9, size: 0.42, stalkLen: o.h * 0.35, stalk: '#86a596', stalkW: 0.015, face: true, upright: 0.7 }] };
  }, 'Blue-green ferny tuft with satiny cups; plant in drifts. color: orange|yellow|white or hex.');

defShrub('stickyMonkeyFlower', 'shrub', { latin: 'Diplacus aurantiacus', common: 'Sticky monkey flower', concept: ['native'], mature: '2–4 ft h × 3 ft w', water: 'very low',
  bloom: { seasons: ['spring', 'summer'], color: 'apricot-orange trumpets (Apr–Jul)' } },
  { w: 3, h: 3 }, function () {
    return { shape: 'dome', lump: 0.3,
      leaf: { cell: 'lance', tints: ['#46653a', '#527143', '#3e5b33'], size: 0.42, n: 300, shell: 0.5 },
      stems: { n: 10, rad: 0.03, col: '#5d5242', minY: 0.3 },
      flowers: [{ where: 'surface', cell: 'tube', tint: FLOWERCOL.apricot, n: 85, size: 0.4 }] };
  }, 'Open twiggy shrub with dark sticky leaves and apricot flowers.');

defShrub('salviaClevelandii', 'shrub', { latin: 'Salvia clevelandii', common: 'Cleveland sage', concept: ['native'], mature: '3–5 ft h × 4–5 ft w', water: 'very low',
  bloom: { seasons: ['spring', 'summer'], color: 'lavender-blue whorls (May–Jul)' } },
  { w: 4.5, h: 4 }, function (o) {
    return { shape: 'dome', lump: 0.2, h: o.h * 0.75,
      leaf: { cell: 'lance', tints: ['#a3ad97', '#afb8a3', '#96a18b'], size: 0.45, n: 320, shell: 0.5 },
      core: { scale: 0.6, tint: '#6f7a66' },
      stems: { n: 10, rad: 0.03, col: '#8c8678', minY: 0.4 },
      flowers: [{ where: 'above', cell: 'spike', tint: ['#8a86cf', '#9a96d8', '#7c78c2'], n: 40, size: 0.16, stretch: 1.3, stalkLen: o.h * 0.25, stalk: '#a3ad97', stalkW: 0.02, upright: 0.8 }] };
  }, 'Aromatic grey sage with stacked lavender-blue whorls on stalks.');

/* ---------------------------------------------------------------- TRADITIONAL (irrigated) */
defShrub('azalea', 'shrub', { latin: 'Rhododendron (Southern Indica azalea)', common: 'Azalea', concept: ['traditional'], mature: '3–5 ft h × 3–5 ft w', water: 'regular',
  bloom: { seasons: ['spring'], color: 'white, pink, coral or magenta trusses (Mar–Apr)' } },
  { w: 4, h: 3.5, color: 'pink' }, function (o) {
    return { shape: 'dome', lump: 0.16,
      leaf: { cell: 'broad', tints: ['#47663a', '#527242', '#3f5d33'], size: 0.42, n: 320, shell: 0.6 },
      core: { scale: 0.72, tint: '#2a3d22' },
      flowers: [{ where: 'surface', cell: 'truss', tint: FLOWERCOL[o.color] || o.color, n: 150, size: 0.55 }] };
  }, 'Mounded evergreen azalea, smothered in trusses in spring. color: white|pink|coral|magenta|red or hex.');

defShrub('rhododendron', 'shrub', { latin: 'Rhododendron (large-leaf hybrid)', common: 'Rhododendron', concept: ['traditional'], mature: '6–8 ft h × 5–7 ft w', water: 'regular',
  bloom: { seasons: ['spring'], color: 'large trusses: lavender, pink, white, red (Apr–May)' } },
  { w: 6, h: 7, color: 'lavender' }, function (o) {
    return { shape: 'upright', lump: 0.2,
      leaf: { cell: 'large', tints: ['#3d5a32', '#47663a', '#36522c'], size: 0.95, n: 230, shell: 0.55, up: 0.3 },
      core: { scale: 0.66, tint: '#26381e' },
      stems: { n: 7, rad: 0.07, col: '#6a6258', minY: 0.5, reach: 0.65 },
      flowers: [{ where: 'surface', cell: 'truss', tint: FLOWERCOL[o.color] || o.color, n: 60, size: 0.78 }] };
  }, 'Big-leaved evergreen with large spring trusses. color: lavender|pink|white|red or hex.');

defShrub('camellia', 'shrub', { latin: 'Camellia japonica', common: 'Camellia', concept: ['traditional'], mature: '6–12 ft h × 5–8 ft w', water: 'regular',
  bloom: { seasons: ['winter', 'spring'], color: 'rose-form blooms: red, pink, white (Jan–Apr)' } },
  { w: 6, h: 9, color: 'red' }, function (o) {
    return { shape: 'upright', lump: 0.16,
      leaf: { cell: 'broad', tints: ['#35532b', '#3f5f33', '#2f4b26'], size: 0.68, n: 400, shell: 0.6, up: 0.35 },
      core: { scale: 0.7, tint: '#22341c' },
      flowers: [{ where: 'surface', cell: 'truss', tint: FLOWERCOL[o.color] || o.color, n: 75, size: 0.34 }] };
  }, 'Upright glossy evergreen with winter blooms. color: red|pink|white or hex.');

defShrub('hydrangea', 'shrub', { latin: 'Hydrangea macrophylla', common: 'Bigleaf hydrangea', concept: ['traditional'], mature: '4–6 ft h × 4–6 ft w', water: 'regular (part shade)',
  bloom: { seasons: ['summer'], color: 'mopheads blue (acid soil) or pink (Jun–Aug)' } },
  { w: 5, h: 4.5, color: 'blue' }, function (o) {
    var dormant = o.season === 'winter';
    return { shape: 'dome', lump: 0.18, nScale: dormant ? 0.15 : 1,
      leaf: { cell: 'large', tints: ['#5a8a3c', '#66964a', '#4f7b35'], size: 0.85, n: 210, shell: 0.6, up: 0.4 },
      core: dormant ? null : { scale: 0.68, tint: '#30491f' },
      stems: { n: 14, rad: 0.035, col: '#8a7a62', minY: 0.35, reach: 0.85 },
      flowers: [{ where: 'surface', cell: 'truss', tint: FLOWERCOL[o.color] || o.color, n: 48, size: 0.92 }] };
  }, 'Coarse-leaved mound with big mophead flowers. color: blue|pink|white|lavender or hex. Winter: bare canes.');

def('boxwood', 'shrub', plantDefaults({ w: 2.5, h: 2.5, shape: 'globe', length: 8 }), function (b, o) {
  var R = rng(seedOf(o.seed, 'boxwood')), m = b.mesher(PM), det = detailOf(o);
  var hedge = o.shape === 'hedge', cube = o.shape === 'cube', cone = o.shape === 'cone';
  var W = hedge ? o.length : o.w, D = o.w, Hh = o.h;
  var env = new Envelope(hedge || cube ? 'box' : cone ? 'cone' : 'globe', W, Hh, D, 0.03, o.seed);
  var area = hedge || cube ? 2 * (W * Hh + D * Hh) + W * D : cone ? PI * (D / 2) * Math.hypot(D / 2, Hh) : 4 * PI * Math.pow((W + Hh + D) / 6, 2);
  var n = clamp(area * 12, 120, 1300) * det;
  coreBlob(m, env, R, 0.94, hexLin('#2c4521'), hedge ? 16 : 10);
  foliage(m, env, R, { cell: 'small', tints: tints(['#557a36', '#5f8540', '#4c6f31']), size: 0.62, n: n, shell: 0.97, tangent: 0.35, ao: 0.45, nup: 0.15 });
  if (o.contact) contactDecal(b, W * 1.1, D * 1.1);
}, function (o) { return o.shape === 'hedge' ? [o.length, o.w, o.h] : [o.w, o.w, o.h]; },
  'Clipped boxwood: shape globe|cube|cone|hedge (hedge runs along x for `length`).',
  { latin: 'Buxus ‘Green Velvet’', common: 'Boxwood (clipped)', concept: ['traditional'], combustible: true, place: 'sink', mature: 'clipped 2–3 ft globes or hedges', water: 'regular', bloom: null });

defShrub('agapanthus', 'perennial', { latin: 'Agapanthus orientalis', common: 'Lily of the Nile', concept: ['traditional'], mature: '2 ft h foliage, 4 ft in bloom × 2–3 ft w', water: 'moderate',
  bloom: { seasons: ['summer'], color: 'blue or white globes on tall stalks (Jun–Aug)' } },
  { w: 2.5, h: 4, color: 'blue' }, function (o) {
    return { shape: 'mound', lump: 0.1, h: o.h * 0.45,
      after: function (m, env, R, k, det) {
        grassClump(m, R, { blades: 46 * det, h: o.h * 0.42, spread: 0.25, width: 0.13 * k, tilt: 0.85, tilt0: 0.25, arch: 0.9, segs: 4, taper: 2.5, base: '#5f7a3c', mid: '#6f8f45', tip: '#7c9b50' });
      },
      flowers: [{ where: 'above', cell: 'truss', tint: FLOWERCOL[o.color] || o.color, n: 7, size: 0.55, stalkLen: o.h * 0.55, stalk: '#6f8a48', stalkW: 0.035, upright: 0.92, face: true, env: new Envelope('mound', o.w * 0.3, o.h * 0.4, o.w * 0.3, 0, 1) }] };
  }, 'Strap-leaf clump with globes of blue (or white) flowers on tall stalks.');

/* ---------------------------------------------------------------- GRASSES */
function defGrass(kind, meta, defaults, P, note) {
  def(kind, 'grass', plantDefaults(defaults), function (b, o) {
    var R = rng(seedOf(o.seed, kind)), m = b.mesher(PM), det = detailOf(o), p = P(o), k = clamp(Math.sqrt(o.w * o.h / (KINDS[kind].defaults.w * KINDS[kind].defaults.h)), 0.6, 2);
    grassClump(m, R, { blades: p.blades * det, h: p.h || o.h, spread: o.w * (p.spread || 0.12), width: p.width * k, tilt: p.tilt, tilt0: p.tilt0, arch: p.arch, segs: p.segs || 4, base: p.base, mid: p.mid, tip: p.tip, taper: p.taper, jit: p.jit });
    if (p.plume && bloomOn(o, KINDS[kind].meta)) {
      var env = new Envelope('mound', o.w * 0.5, (p.h || o.h) * 0.8, o.w * 0.5, 0.1, o.seed), F = p.plume;
      flowers(m, env, R, { where: 'above', cell: F.cell, tints: tints(F.tint), n: F.n * det, size: F.size * k, stretch: F.stretch, stalkLen: F.stalkLen * k, stalk: F.stalk, stalkW: F.stalkW || 0.012, upright: F.upright, minY: 0.3, face: F.face });
    }
    if (o.contact) contactDecal(b, o.w * 0.9, o.w * 0.9);
  }, shrubSize, note, { latin: meta.latin, common: meta.common, concept: meta.concept, combustible: true, place: 'sink', bloom: meta.bloom, mature: meta.mature, water: meta.water });
}
defGrass('deerGrass', { latin: 'Muhlenbergia rigens', common: 'Deer grass', concept: ['native', 'mediterranean'], mature: '3–4 ft h × 4 ft w (spikes to 5 ft)', water: 'very low',
  bloom: { seasons: ['summer', 'fall'], color: 'pencil-thin tan spikes (Jun–Oct)' } },
  { w: 4, h: 3.4 }, function (o) { return { blades: 165, width: 0.045, spread: 0.1, tilt: 0.75, tilt0: 0.06, arch: 0.55, base: '#4f5e3c', mid: '#8e9771', tip: '#c6bf96',
    plume: { cell: 'spike', tint: ['#c2b089', '#b39f78', '#cdbd98'], n: 34, size: 0.05, stretch: 3.2, stalkLen: o.h * 0.42, stalk: '#a99c78', upright: 0.82 } }; },
  'Fountain of fine grey-green blades with slender tan flower spikes.');
defGrass('pinkMuhly', { latin: 'Muhlenbergia capillaris', common: 'Pink muhly', concept: ['mediterranean'], mature: '3 ft h × 3 ft w', water: 'low',
  bloom: { seasons: ['fall'], color: 'airy pink-purple haze (Sep–Nov)' } },
  { w: 3, h: 2.6 }, function (o) { return { blades: 150, width: 0.028, spread: 0.12, tilt: 0.7, arch: 0.5, base: '#4b6236', mid: '#6f8a52', tip: '#8fa56c',
    plume: { cell: 'feathery', tint: ['#e3a3c8', '#eab2d2', '#d690ba'], n: 60, size: 0.9, stretch: 1, stalkLen: o.h * 0.2, upright: 0.6 } }; },
  'Fine green clump; in fall a cloud of pink flowers (bloom shows the haze).');
defGrass('blueFescue', { latin: 'Festuca idahoensis ‘Siskiyou Blue’', common: 'Blue fescue', concept: ['native', 'mediterranean'], mature: '1 ft h × 1–1.5 ft w', water: 'low',
  bloom: { seasons: ['spring', 'summer'], color: 'small tan panicles' } },
  { w: 1.3, h: 1.0 }, function (o) { return { blades: 130, width: 0.022, spread: 0.12, tilt: 1.05, tilt0: 0.1, arch: 0.3, base: '#6a8486', mid: '#9cb4b6', tip: '#b8c8c4',
    plume: { cell: 'spike', tint: ['#c8bd98'], n: 10, size: 0.04, stretch: 2.5, stalkLen: o.h * 0.6, stalk: '#a8b0a0', upright: 0.85 } }; },
  'Tidy blue-grey pincushion tuft.');
defGrass('blueOatGrass', { latin: 'Helictotrichon sempervirens', common: 'Blue oat grass', concept: ['mediterranean'], mature: '2–3 ft h × 2–3 ft w', water: 'low',
  bloom: { seasons: ['spring', 'summer'], color: 'buff oat-like panicles (May–Jul)' } },
  { w: 2.5, h: 2.4 }, function (o) { return { blades: 130, width: 0.04, spread: 0.1, tilt: 0.6, tilt0: 0.05, arch: 0.25, base: '#6b8689', mid: '#8aa4a8', tip: '#a7bcbc',
    plume: { cell: 'spike', tint: ['#c9b991', '#bba983'], n: 14, size: 0.08, stretch: 2.2, stalkLen: o.h * 0.6, stalk: '#a8a68a', upright: 0.6 } }; },
  'Stiff steel-blue fountain with arching buff seed heads.');
defGrass('lomandra', { latin: 'Lomandra longifolia ‘Breeze’', common: 'Mat rush', concept: ['mediterranean', 'traditional'], mature: '2–3 ft h × 3 ft w', water: 'low',
  bloom: null },
  { w: 3, h: 2.4 }, function () { return { blades: 160, width: 0.05, spread: 0.14, tilt: 0.75, tilt0: 0.1, arch: 1.0, base: '#3f5b2a', mid: '#5f8040', tip: '#7c9a52' }; },
  'Soft fountain of bright-green strap leaves (evergreen, lawn-edge friendly).');
defGrass('featherReedGrass', { latin: 'Calamagrostis × acutiflora ‘Karl Foerster’', common: 'Feather reed grass', concept: ['traditional', 'mediterranean'], mature: '2–3 ft foliage, 5 ft plumes × 2 ft w', water: 'moderate',
  bloom: { seasons: ['summer', 'fall'], color: 'upright wheat-tan plumes (Jun–Nov)' } },
  { w: 2, h: 5 }, function (o) { return { h: o.h * 0.5, blades: 120, width: 0.04, spread: 0.12, tilt: 0.35, tilt0: 0.04, arch: 0.35, base: '#465e33', mid: '#6a854a', tip: '#8fa266',
    plume: { cell: 'spike', tint: ['#cdb88d', '#c2ac80', '#d7c49c'], n: 46, size: 0.09, stretch: 2.4, stalkLen: o.h * 0.42, stalk: '#a99a70', upright: 0.96 } }; },
  'Upright clump with vertical wheat-coloured plumes — strong vertical accent.');
defGrass('berkeleySedge', { latin: 'Carex divulsa (sold as ‘Berkeley sedge’; not native)', common: 'Berkeley sedge', concept: ['traditional'], mature: '1–2 ft h × 2 ft w', water: 'moderate',
  bloom: null },
  { w: 2, h: 1.4 }, function () { return { blades: 150, width: 0.035, spread: 0.12, tilt: 0.95, tilt0: 0.12, arch: 0.9, base: '#33492a', mid: '#4e6a37', tip: '#6c8749' }; },
  'Dark-green arching sedge for shade / lawn substitute.');

/* ---------------------------------------------------------------- SUCCULENTS & DESERT ACCENTS (real geometry) */
var AGAVES = {
  americana: { w: 7, h: 4.5, leaves: 22, len: 3.9, width: 0.36, thick: 0.15, el0: 0.32, el1: 1.35, curl: 0.55, r0: 0.35, color: '#8fa4a1', edge: '#a8b8b4', base: '#cdd3c4', tip: '#7f8f89', spine: '#3a2c20', wPeak: 0.4 },
  parryi: { w: 2.2, h: 1.6, leaves: 36, len: 1.05, width: 0.2, thick: 0.1, el0: 0.45, el1: 1.45, curl: -0.25, r0: 0.12, color: '#a2b3b0', edge: '#b5c3bf', base: '#d0d5c7', tip: '#4a3828', spine: '#2b1f17', elPow: 0.6, wPeak: 0.55 },
  attenuata: { w: 4, h: 3, leaves: 30, len: 2.0, width: 0.3, thick: 0.06, el0: 0.12, el1: 1.25, curl: 0.95, r0: 0.18, color: '#a3bd94', edge: '#b7cca8', base: '#c9d6bb', tip: '#9fb98f', spine: '#9fb98f', y0: 0.8, wPeak: 0.45, trunk: 0.85 },
  blueGlow: { w: 2, h: 1.6, leaves: 26, len: 1.05, width: 0.09, thick: 0.07, el0: 0.4, el1: 1.4, curl: 0.0, r0: 0.08, color: '#7fa7a0', edge: '#d8b84a', base: '#b9cbb8', tip: '#b6352c', spine: '#7a1f18', strap: true }
};
def('agave', 'succulent', plantDefaults({ w: null, h: null, variety: 'americana' }), function (b, o) {
  var V = AGAVES[o.variety] || AGAVES.americana; o.w = o.w || V.w; o.h = o.h || V.h;
  var R = rng(seedOf(o.seed, 'agave')), m = b.mesher(PM), kx = o.w / V.w, ky = o.h / V.h, k = Math.sqrt(kx * ky);
  var det = detailOf(o), n = Math.max(8, Math.round(V.leaves * Math.min(1, 0.5 + det * 0.5)));
  if (V.trunk) {   // foxtail agave sits on a short curved trunk
    var tp = limbPts([0, -0.2, 0], [0.1, V.y0 * ky, 0.05], 3, 0.05, R);
    tubeM(m, tp, tp.map(function () { return 0.16 * k; }), 6, function () { return hexLin('#8e8a72'); });
  }
  rosette(m, R, { leaves: n, len: V.len * k, width: V.width * k, thick: V.thick * k, el0: V.el0, el1: V.el1, elPow: V.elPow, curl: V.curl, r0: V.r0 * k, y0: (V.y0 || 0) * ky, rise: 0.25 * k,
    color: V.color, edge: V.edge, base: V.base, tip: V.tip, spine: V.spine, wPeak: V.wPeak, strap: V.strap, segs: 5 });
  if (o.contact) contactDecal(b, o.w * 0.95, o.w * 0.95);
}, function (o) { var V = AGAVES[o.variety] || AGAVES.americana; return [o.w || V.w, o.w || V.w, o.h || V.h]; },
  'Real-geometry rosette. variety: americana (7 ft blue-grey) | parryi (compact, dark spines) | attenuata (foxtail, soft, on a short trunk) | blueGlow (red-edged). Non-flowering (monocarpic).',
  { latin: 'Agave americana / parryi / attenuata / ‘Blue Glow’', common: 'Agave', concept: ['desert'], combustible: true, place: 'sink', mature: 'americana 4–6 ft h × 6–10 ft w; parryi 2 × 2 ft', water: 'very low', bloom: null });

def('aloe', 'succulent', plantDefaults({ w: 2.2, h: 2.4, variety: 'blueElf' }), function (b, o) {
  var R = rng(seedOf(o.seed, 'aloe')), m = b.mesher(PM), det = detailOf(o), striata = o.variety === 'striata', k = Math.sqrt(o.w * o.h / (striata ? 2.5 * 3 : 2.2 * 2.4));
  var heads = striata ? [[0, 0, 1]] : [[0, 0, 1], [0.45, 0.2, 0.85], [-0.35, 0.35, 0.8], [-0.1, -0.45, 0.9]];
  var leafH = striata ? 1.1 : 1.0;
  heads.forEach(function (hd) {
    var sub = new Mesher();
    rosette(sub, R, striata ? { leaves: Math.round(18 * Math.min(1, 0.5 + det * 0.5)), len: 1.25 * k * hd[2], width: 0.22 * k, thick: 0.07 * k, el0: 0.25, el1: 1.2, curl: 0.35, r0: 0.08, color: '#9fb0aa', edge: '#d88a7a', base: '#c6cdbf', tip: '#c28a7a', spine: '#b07a6a', wPeak: 0.3, segs: 4 }
      : { leaves: Math.round(11 * Math.min(1, 0.5 + det * 0.5)), len: 1.0 * k * hd[2], width: 0.1 * k, thick: 0.07 * k, el0: 0.85, el1: 1.45, curl: 0.15, r0: 0.05, color: '#86a5a0', edge: '#9fbab3', base: '#b8c8bd', tip: '#9a8a7a', spine: '#7a5a4a', segs: 4 });
    var g = sub.geometry(); g.translate(hd[0] * o.w * 0.35, 0, hd[1] * o.w * 0.35); b.add(PM, g, null, { keepUV: true });
  });
  if (bloomOn(o, KINDS.aloe.meta)) {
    var nS = striata ? 4 : 6, col = hexLin(striata ? '#f0704a' : '#e8452a'), stc = hexLin(striata ? '#b0605a' : '#8a6a5a');
    for (var i = 0; i < nS; i++) {
      var a = R() * TAU, r0 = R() * o.w * 0.25, base = [Math.cos(a) * r0, leafH * 0.4 * k, Math.sin(a) * r0];
      var top = [base[0] + Math.cos(a) * 0.3, o.h * (0.85 + 0.15 * R()), base[2] + Math.sin(a) * 0.3];
      var nfn = function () { return [0, 1, 0]; };
      stalk(m, base, top, 0.035 * k, nfn, stc);
      var u = vnorm(vsub(top, base)), w = 0.28 * k, h = w * cellAspect('tube') * 1.6;
      crossQ(m, 'tube', vmad(top, u, -h * 0.55), vnorm(vadd(u, [0, 0.4, 0])), w, h, nfn, function () { return col; }, R, 3);
    }
  }
  if (o.contact) contactDecal(b, o.w, o.w);
}, function (o) { return [o.w, o.w, o.h]; },
  'variety: blueElf (clumping blue rosettes, red-orange winter spikes) | striata (coral aloe, single broad rosette).',
  { latin: 'Aloe ‘Blue Elf’ / Aloe striata', common: 'Aloe', concept: ['desert'], combustible: true, place: 'sink', mature: '1.5–2 ft h × 2 ft w (spikes to 2.5 ft)', water: 'very low',
    bloom: { seasons: ['winter', 'spring'], color: 'red-orange / coral torch spikes (Jan–Apr)' } });

def('hesperaloe', 'succulent', plantDefaults({ w: 3.5, h: 5, color: 'coral' }), function (b, o) {
  var R = rng(seedOf(o.seed, 'hesperaloe')), m = b.mesher(PM), det = detailOf(o), k = Math.sqrt(o.w * o.h / 17.5);
  grassClump(m, R, { blades: 75 * det, h: o.h * 0.5, spread: o.w * 0.08, width: 0.075 * k, tilt: 0.65, tilt0: 0.06, arch: 0.45, segs: 4, taper: 2.2, base: '#4f5b3c', mid: '#5d6b47', tip: '#6c7553', jit: 0.08 });
  if (bloomOn(o, KINDS.hesperaloe.meta)) {
    var col = tints(o.color === 'yellow' ? ['#e8c84a', '#f0d35a'] : ['#e0607a', '#e86f86', '#d4546e']), stc = hexLin('#9a4a58');
    for (var i = 0; i < 6; i++) {
      var a = R() * TAU, lean = 0.25 + 0.2 * R(), pts = [], L = o.h * (0.85 + 0.15 * R());
      for (var s = 0; s <= 5; s++) { var t = s / 5; pts.push([Math.cos(a) * lean * L * t * t, L * t - lean * L * t * t * 0.3, Math.sin(a) * lean * L * t * t]); }
      tubeM(m, pts, pts.map(function (q, kk) { return 0.025 * k * (1 - kk / 7); }), 4, function () { return stc; }, 'solid');
      for (var f = 0; f < 5; f++) {
        var t2 = 0.45 + 0.5 * f / 4, idx = Math.min(4, Math.floor(t2 * 5)), p0 = vlerp(pts[idx], pts[idx + 1], t2 * 5 - idx);
        var c = col[(R() * col.length) | 0], w = 0.22 * k, h = w * cellAspect('tube') * 0.9;
        crossQ(m, 'tube', p0, vnorm(vadd([Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5], vsc(randDir(R), 0.3))), w, h, function () { return [0, 1, 0]; }, function () { return c; }, R, 2);
      }
    }
  }
  if (o.contact) contactDecal(b, o.w * 0.9, o.w * 0.9);
}, function (o) { return [o.w, o.w, o.h]; },
  'Grassy clump of stiff leaves with tall arching coral (or yellow) flower stalks. color: coral|yellow.',
  { latin: 'Hesperaloe parviflora', common: 'Red yucca', concept: ['desert'], combustible: true, place: 'sink', mature: '3 ft h × 4 ft w (stalks to 5 ft)', water: 'very low',
    bloom: { seasons: ['spring', 'summer', 'fall'], color: 'coral-pink bells on 5 ft stalks (Apr–Oct)' } });

def('yucca', 'succulent', plantDefaults({ w: 3.2, h: 7, form: 'rostrata' }), function (b, o) {
  var R = rng(seedOf(o.seed, 'yucca')), m = b.mesher(PM), det = detailOf(o), uv = cellUV('solid');
  var stemless = o.form !== 'rostrata', headR = o.w / 2, cy = stemless ? 0 : o.h - headR * 0.95;
  if (!stemless) {   // trunk wrapped in a skirt of dead leaves
    var tp = limbPts([0, -0.2, 0], [0.1, cy, 0.05], 5, 0.04, R);
    tubeM(m, tp, tp.map(function (q, k) { return o.w * 0.15 * (1 - 0.2 * k / 5); }), 8, function (p) { return vsc(hexLin('#a89a7c'), lerp(0.7, 1, p[1] / cy)); });
    var sk = hexLin('#b9aa86');
    for (var i = 0; i < 120 * det; i++) {
      var a = R() * TAU, y = cy - R() * Math.min(2.2, cy * 0.6), d = [Math.cos(a), 0, Math.sin(a)];
      var root = [d[0] * o.w * 0.14, y, d[2] * o.w * 0.14], tip = vadd(root, vsc(vnorm([d[0] * 0.35, -1, d[2] * 0.35]), 1.0 + R() * 0.7));
      stalk(m, root, tip, 0.07, function () { return vnorm(vadd(d, [0, 0.3, 0])); }, vsc(sk, 0.75 + 0.35 * R()));
    }
  }
  var cl = hexLin(stemless ? '#5f7f4a' : '#8fa7b0'), ct = hexLin(stemless ? '#d0c060' : '#b6c6c8'), nL = Math.round((stemless ? 70 : 230) * det);
  for (var j = 0; j < nL; j++) {
    var dir = randDir(R);
    if (stemless) { dir[1] = Math.abs(dir[1]) * 0.9 + 0.15; dir = vnorm(dir); }
    else if (dir[1] < -0.65) dir[1] = -0.65 + R() * 0.2;
    var L = (stemless ? o.h * 0.85 : headR) * (0.75 + 0.35 * R()), base = [dir[0] * 0.12, cy + (stemless ? 0 : 0.15), dir[2] * 0.12];
    if (stemless) dir = vnorm(vadd(dir, [0, 0.25, 0]));
    var tip = vmad(base, dir, L), s = vnorm(vcross(dir, perp(dir))), w = (stemless ? 0.12 : 0.045) * (0.8 + 0.4 * R());
    var nrm = vnorm(vadd(dir, [0, 0.4, 0])), c = jit(cl, R, 0.08);
    var a0 = m.vert(vmad(base, s, -w / 2), nrm, uv[0], uv[3], vsc(c, 0.7)), a1 = m.vert(vmad(base, s, w / 2), nrm, uv[2], uv[3], vsc(c, 0.7));
    var a2 = m.vert(vmad(vmad(base, dir, L * 0.7), s, w * 0.4), nrm, uv[2], uv[1], c), a3 = m.vert(vmad(vmad(base, dir, L * 0.7), s, -w * 0.4), nrm, uv[0], uv[1], stemless ? mixc(c, ct, 0.5) : c);
    var a4 = m.vert(tip, nrm, (uv[0] + uv[2]) / 2, uv[1], stemless ? ct : vsc(c, 1.1));
    m.quad(a0, a1, a2, a3); m.tri(a3, a2, a4);
  }
  if (o.contact) contactDecal(b, o.w * (stemless ? 1 : 0.6), o.w * (stemless ? 1 : 0.6));
}, function (o) { return [o.w, o.w, o.h]; },
  'form: rostrata (beaked yucca: shaggy trunk + sphere of stiff blue leaves) | stemless (Y. filamentosa ‘Color Guard’ style rosette; set h≈2.5).',
  { latin: 'Yucca rostrata', common: 'Beaked yucca', concept: ['desert'], combustible: true, place: 'sink', mature: '6–12 ft h × 3 ft w head', water: 'very low', bloom: null });
/* ================================================================== TREES (branching trunks + leaf-card clusters, < 8k triangles) */
function defTree(kind, meta, defaults, P, note) {
  def(kind, 'tree', plantDefaults(defaults), function (b, o) {
    var R = rng(seedOf(o.seed, kind)), m = b.mesher(PM), p = P(o, R);
    p.h = o.h; p.w = o.w; p.detail = detailOf(o);
    var res = treeBuild(m, R, p);
    if (p.after) p.after(m, R, res, o);
    if (o.contact) contactDecal(b, o.w * 0.55, o.w * 0.55);
  }, function (o) { return [o.w, o.w, o.h]; }, note,
  { latin: meta.latin, common: meta.common, concept: meta.concept, combustible: true, place: 'sink', bloom: meta.bloom, mature: meta.mature, water: meta.water });
}
// flowers / fruit scattered over a tree's clusters
function treeBlooms(m, R, res, cell, cols, n, size, stretch) {
  var cl = res.clusters, aspect = cellAspect(cell), crownC = res.crown.c;
  for (var i = 0; i < n; i++) {
    var c = cl[(R() * cl.length) | 0], d = randDir(R), p = vadd(c, vsc(d, 1.2 + R()));
    var out = vnorm(vadd(vsub(p, crownC), [0, 0.5, 0])), u = vnorm(vadd(out, vsc(randDir(R), 0.5))), s = vnorm(vcross(u, randDir(R)));
    var w = size * (0.75 + 0.5 * R()), h = w * aspect * (stretch || 1), col = jit(cols[(R() * cols.length) | 0], R, 0.1);
    cardQ(m, cell, vmad(p, u, -h * 0.4), u, s, w, h, function () { return out; }, function () { return col; });
  }
}

defTree('olive', { latin: 'Olea europaea (fruitless, e.g. ‘Swan Hill’)', common: 'Olive', concept: ['mediterranean'], mature: '15–25 ft h × 15–20 ft w (garden: 12–16 ft)', water: 'low', bloom: null },
  { w: 13, h: 14, trunks: 3 }, function (o) {
    return { trunks: o.trunks, trunkH: o.h * 0.32, lean: 0.4, gnarl: 0.16, trunkR: 0.3, trunkSides: 7, bark: '#8a8476', scaffolds: 3,
      clusters: 34, clusterR: 1.7, clusterGap: 0.95, perCluster: 44, cell: 'lance', leafSize: 0.72, leafUp: 0.25, innerRho: 0.35, minY: -0.5,
      leafTints: tints(['#93a07e', '#a3af8f', '#84926f', '#b1bba1']), twigR: 0.035 };
  }, 'Gnarled multi-trunk olive with a silvery, see-through canopy. trunks: 1|3.');

defTree('coastLiveOak', { latin: 'Quercus agrifolia', common: 'Coast live oak', concept: ['native'], mature: '30–60 ft h × 35–70 ft w', water: 'none once established (no summer irrigation under canopy)', bloom: null },
  { w: 34, h: 30, trunks: 1 }, function (o) {
    return { trunks: o.trunks, trunkH: o.h * 0.26, lean: 0.12, gnarl: 0.1, trunkR: o.h * 0.04, trunkSides: 8, bark: '#5e574e', scaffolds: 5, crownMid: 0.45,
      clusters: 44, clusterR: o.w * 0.1, clusterGap: 0.95, perCluster: 58, cell: 'small', leafSize: 1.25, leafUp: 0.25, innerRho: 0.4, minY: -0.35, flatTop: true,
      leafTints: tints(['#4f6538', '#5b7140', '#455a31', '#677a48']), twigR: 0.07 };
  }, 'Broad evergreen native oak with a dense dark crown; a 1-trunk heritage form or trunks:2.');

defTree('japaneseMaple', { latin: 'Acer palmatum ‘Bloodgood’', common: 'Japanese maple', concept: ['traditional'], mature: '15–20 ft h × 15–20 ft w', water: 'regular (part shade)',
  bloom: null },
  { w: 15, h: 14, color: 'red' }, function (o) {
    var c = o.season === 'fall' ? ['#d8532a', '#e86d2a', '#c8402a', '#e9a03a', '#b8302a'] : o.color === 'green' ? ['#6f9c3f', '#7ca94a', '#628f37'] : ['#8a2a2c', '#9b3434', '#7a2328', '#a8403a'];
    return { trunks: 3, trunkH: o.h * 0.2, lean: 0.45, gnarl: 0.1, trunkR: 0.2, trunkSides: 6, bark: '#6a665e', scaffolds: 3, layers: 4, clusterFlat: 0.42,
      clusters: 32, clusterR: 2.1, clusterGap: 1.0, perCluster: 46, cell: 'palmate', leafSize: 0.85, leafUp: 0.6, innerRho: 0.3, minY: -0.6,
      leafTints: tints(c), leafless: o.season === 'winter', twigR: 0.03 };
  }, 'Multi-stem, layered canopy of palmate leaves. color: red|green; season fall → crimson/orange, winter → bare branches.');

defTree('westernRedbud', { latin: 'Cercis occidentalis', common: 'Western redbud', concept: ['native'], mature: '10–18 ft h × 10–15 ft w', water: 'very low',
  bloom: { seasons: ['spring'], color: 'magenta-pink on bare twigs (Feb–Apr)' } },
  { w: 12, h: 12 }, function (o) {
    var spring = o.season === 'spring' || (!o.season && o.bloom !== false), winter = o.season === 'winter';
    var c = o.season === 'fall' ? ['#d9b94a', '#e6c656', '#c9a43a'] : ['#6f9447', '#7ca052', '#658a3e'];
    return { trunks: 4, trunkH: o.h * 0.22, lean: 0.4, gnarl: 0.12, trunkR: 0.16, trunkSides: 6, bark: '#5a524b', scaffolds: 3,
      clusters: 26, clusterR: 1.8, perCluster: spring ? 14 : 40, cell: 'round', leafSize: 0.7, innerRho: 0.35,
      leafTints: tints(c), leafless: winter, twigR: 0.028,
      after: spring && !winter ? function (m, R, res) { treeBlooms(m, R, res, 'berry', tints(['#c8408c', '#d6509a', '#b8357e', '#e070b0']), 700 * detailOf(o), 0.55); } : null };
  }, 'Multi-trunk native; spring (or no season) shows the magenta bloom, summer heart-shaped leaves, fall yellow, winter bare.');

defTree('manzanitaTree', { latin: 'Arctostaphylos manzanita ‘Dr. Hurd’', common: 'Manzanita (tree form)', concept: ['native'], mature: '10–15 ft h × 10–12 ft w', water: 'very low',
  bloom: { seasons: ['winter', 'spring'], color: 'white urn clusters (Jan–Mar)' } },
  { w: 11, h: 11 }, function (o) {
    return { trunks: 4, trunkH: o.h * 0.35, lean: 0.5, gnarl: 0.2, trunkR: 0.17, trunkSides: 7, bark: '#9a3a1e', scaffolds: 3,
      clusters: 24, clusterR: 1.7, perCluster: 46, cell: 'round', leafSize: 0.55, innerRho: 0.35,
      leafTints: tints(['#8aa36f', '#97ae7b', '#7b955f']), twigR: 0.04,
      after: bloomOn(o, KINDS.manzanitaTree.meta) ? function (m, R, res) { treeBlooms(m, R, res, 'umbel', tints(['#f6e6e2', '#f3dada']), 70 * detailOf(o), 0.45); } : null };
  }, 'Sculptural mahogany-red trunks under a grey-green crown.');
/* ================================================================== GROUND SURFACES, ZONE 0, PATHS (world plan coordinates)
   LAND.ground(region, surface, opts) → THREE.Group.  region: [[x,z],...] or {outer:[...], holes:[[...]]} in feet.
   surface: 'gravel' | 'decomposedGranite' ('dg') | 'mulch' | 'lawn' | 'flagstone' | 'pavers' | 'concrete'.
   opts.heightAt(x,z) makes every vertex follow the terrain. */
var SURF = {
  gravel: { mat: 'gravel', lift: 0.04 }, dg: { mat: 'dg', lift: 0.03 }, decomposedGranite: { mat: 'dg', lift: 0.03 },
  mulch: { mat: 'mulch', lift: 0.045 }, lawn: { mat: 'lawn', lift: 0.03 }, meadow: { mat: 'meadow', lift: 0.02 }, concrete: { mat: 'concrete', lift: 0.08 },
  mortar: { mat: 'mortar', lift: 0.02 }, soil: { mat: 'soil', lift: 0.03 }
};
var GRAVELMAT = { grey: 'gravel', gold: 'gravelGold', black: 'gravelBlack', river: 'gravelRiver' };
var STONECOL = {
  arizona: ['#c9a27f', '#b98d6c', '#d4b08c', '#a8805e', '#c49a78', '#ddb998'],
  bluestone: ['#7f8b92', '#717e86', '#8c969b', '#6c767b', '#86857c'],
  buff: ['#cdbd9e', '#bfad8b', '#d9caab', '#b29f7f', '#c6b493'],
  slate: ['#5f6468', '#51575b', '#6c7072', '#6e6157', '#5a5450'],
  sierra: ['#a9a59c', '#9a958b', '#b8b2a6', '#8f8a80', '#c2bcb0', '#a39a8a']
};
var PAVERCOL = {
  charcoal: ['#6d6c6a', '#5c5b59', '#7a7976', '#656360', '#83817d'],
  sand: ['#cbb99c', '#bdab8e', '#d8c8ac', '#b39f82', '#c4b294'],
  grey: ['#a7a59f', '#9a9892', '#b3b1ab', '#8f8d88', '#bcbab3'],
  terracotta: ['#b8704e', '#a8603f', '#c47e5a', '#9c5a3c', '#c98b66'],
  blend: ['#a39a8c', '#8f877a', '#b5ab9b', '#7e776c', '#c1b6a4', '#9b8f7d']
};
function hAt(o, x, z) { return o.heightAt ? o.heightAt(x, z) : 0; }

// flat or terrain-following surface mesh over a region
function surfaceMesher(m, region, o, lift, colFn) {
  var tr = triangulateRegion(region, o.res || (o.heightAt ? 2.5 : 8)), ids = [];
  tr.pts.forEach(function (p) {
    var y = hAt(o, p[0], p[1]) + lift, n = slopeNormal(o.heightAt, p[0], p[1]);
    ids.push(m.vert([p[0], y, p[1]], n, p[0], p[1], colFn ? colFn(p[0], p[1]) : [1, 1, 1]));
  });
  tr.tris.forEach(function (t) {
    var a = tr.pts[t[0]], b = tr.pts[t[1]], c = tr.pts[t[2]];
    var cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cr < 0) m.tri(ids[t[0]], ids[t[1]], ids[t[2]]); else m.tri(ids[t[0]], ids[t[2]], ids[t[1]]);
  });
  return tr;
}
// vertical skirt along a polygon boundary (slab edges, planter walls on slopes)
function skirt(m, poly, o, top, depth, colFn, outward) {
  var p = ccw(poly), n = p.length;
  for (var i = 0; i < n; i++) {
    var a = p[i], b = p[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
    var k = Math.max(1, Math.ceil(L / 2)), nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
    if (outward === false) { nx = -nx; nz = -nz; }
    var prev = null, s;
    for (s = 0; s <= k; s++) {
      var x = lerp(a[0], b[0], s / k), z = lerp(a[1], b[1], s / k), yt = hAt(o, x, z) + top, yb = hAt(o, x, z) - depth, c = colFn ? colFn(x, z) : [0.85, 0.85, 0.85];
      var cur = [m.vert([x, yt, z], [nx, 0, nz], L * s / k, yt, c), m.vert([x, yb, z], [nx, 0, nz], L * s / k, yb, vsc(c, 0.8))];
      if (prev) { if (outward === false) m.quad(prev[0], prev[1], cur[1], cur[0]); else m.quad(prev[0], cur[0], cur[1], prev[1]); }
      prev = cur;
    }
  }
}
function variationFn(o, seed, amt, extra) {
  return function (x, z) {
    var v = 1 + amt * fbm2(x * 0.11, z * 0.11, seed, 3) + amt * 0.5 * vnoise3(x * 0.6, 0.5, z * 0.6, seed + 3);
    var c = [v, v, v];
    if (extra) c = extra(x, z, c);
    if (o.tint) { var t = hexLin(o.tint); c = [c[0] * t[0] * 2.2, c[1] * t[1] * 2.2, c[2] * t[2] * 2.2]; }
    return c;
  };
}

function isConvex(p) {
  for (var i = 0, n = p.length; i < n; i++) { var a = p[i], b = p[(i + 1) % n], c = p[(i + 2) % n]; if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -1e-9) return false; }
  return true;
}
/* ---- flagstone: Voronoi stones clipped to the region, with gaps over a joint material */
function voronoiCells(region, size, R, jit) {
  var bb = bbox(regionOuter(region)), pts = [], cell = size, i, j;
  for (var x = bb[0] - cell; x <= bb[2] + cell; x += cell) for (var z = bb[1] - cell; z <= bb[3] + cell; z += cell * 0.87) {
    pts.push([x + (R() - 0.5) * cell * (jit || 0.85) + ((Math.round(z / (cell * 0.87)) % 2) ? cell / 2 : 0), z + (R() - 0.5) * cell * (jit || 0.85)]);
  }
  var cells = [], gs = cell * 1.6, grid = {};
  pts.forEach(function (p, k) { var key = Math.floor(p[0] / gs) + ',' + Math.floor(p[1] / gs); (grid[key] = grid[key] || []).push(k); });
  pts.forEach(function (p, k) {
    var poly = [[p[0] - cell * 2, p[1] - cell * 2], [p[0] + cell * 2, p[1] - cell * 2], [p[0] + cell * 2, p[1] + cell * 2], [p[0] - cell * 2, p[1] + cell * 2]];
    var gx = Math.floor(p[0] / gs), gz = Math.floor(p[1] / gs);
    for (i = -2; i <= 2; i++) for (j = -2; j <= 2; j++) {
      var lst = grid[(gx + i) + ',' + (gz + j)]; if (!lst) continue;
      lst.forEach(function (q) {
        if (q === k) return;
        var o = pts[q], nx = o[0] - p[0], nz = o[1] - p[1], mx = (o[0] + p[0]) / 2, mz = (o[1] + p[1]) / 2;
        poly = clipHalf(poly, nx, nz, nx * mx + nz * mz);
      });
    }
    if (poly.length >= 3) cells.push({ site: p, poly: ccw(poly) });
  });
  return cells;
}
function chamferPoly(p, f) {   // cut every corner (rounder, more natural stones)
  var out = [], n = p.length;
  for (var i = 0; i < n; i++) {
    var a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
    out.push([lerp(b[0], a[0], f), lerp(b[1], a[1], f)], [lerp(b[0], c[0], f), lerp(b[1], c[1], f)]);
  }
  return out;
}
// one raised stone/paver: top polygon at terrain + thick, optional bevel, sides down to grade
function slabPiece(m, poly, o, thick, bevel, col, R, uvOff) {
  var p = ccw(poly), n = p.length; if (n < 3) return;
  var tilt = [(R() - 0.5) * 0.012, (R() - 0.5) * 0.012], c0 = [0, 0]; p.forEach(function (q) { c0[0] += q[0] / n; c0[1] += q[1] / n; });
  function topY(x, z) { return hAt(o, x, z) + thick + (x - c0[0]) * tilt[0] + (z - c0[1]) * tilt[1]; }
  var inner = bevel && isConvex(p) ? insetConvex(p, bevel) : p;
  if (inner.length < 3) inner = p;
  // top face
  var V2 = function (q) { return new THREE.Vector2(q[0], q[1]); }, faces = THREE.ShapeUtils.triangulateShape(inner.map(V2), []), ids = [];
  var nrm = slopeNormal(o.heightAt, c0[0], c0[1]);
  inner.forEach(function (q) {
    var cv = vsc(col, 1 + 0.06 * vnoise3(q[0] * 1.3, 0.2, q[1] * 1.3, 5));
    ids.push(m.vert([q[0], topY(q[0], q[1]), q[1]], nrm, q[0] + uvOff[0], q[1] + uvOff[1], cv));
  });
  faces.forEach(function (f) {
    var a = inner[f[0]], b = inner[f[1]], c = inner[f[2]], cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cr < 0) m.tri(ids[f[0]], ids[f[1]], ids[f[2]]); else m.tri(ids[f[0]], ids[f[2]], ids[f[1]]);
  });
  // bevel ring + sides (only when the inset kept the vertex count)
  var useBevel = bevel && inner.length === n;
  for (var i = 0; i < n; i++) {
    var a2 = p[i], b2 = p[(i + 1) % n], L = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]); if (L < 1e-5) continue;
    var nx = (b2[1] - a2[1]) / L, nz = -(b2[0] - a2[0]) / L, sc = vsc(col, 0.72);
    var yA = topY(a2[0], a2[1]) - (useBevel ? bevel * 0.7 : 0), yB = topY(b2[0], b2[1]) - (useBevel ? bevel * 0.7 : 0);
    var s0 = m.vert([a2[0], yA, a2[1]], [nx, 0, nz], 0, yA, sc), s1 = m.vert([b2[0], yB, b2[1]], [nx, 0, nz], L, yB, sc);
    var s2 = m.vert([b2[0], hAt(o, b2[0], b2[1]) - 0.06, b2[1]], [nx, 0, nz], L, -0.06, vsc(sc, 0.7)), s3 = m.vert([a2[0], hAt(o, a2[0], a2[1]) - 0.06, a2[1]], [nx, 0, nz], 0, -0.06, vsc(sc, 0.7));
    m.quad(s0, s1, s2, s3);
    if (useBevel) {
      var ia = inner[i], ib = inner[(i + 1) % n], bn = vnorm([nx, 1.2, nz]), bc = vsc(col, 0.9);
      var t0 = m.vert([ia[0], topY(ia[0], ia[1]), ia[1]], bn, ia[0] + uvOff[0], ia[1] + uvOff[1], bc), t1 = m.vert([ib[0], topY(ib[0], ib[1]), ib[1]], bn, ib[0] + uvOff[0], ib[1] + uvOff[1], bc);
      var t2 = m.vert([b2[0], yB, b2[1]], bn, b2[0] + uvOff[0], b2[1] + uvOff[1], bc), t3 = m.vert([a2[0], yA, a2[1]], bn, a2[0] + uvOff[0], a2[1] + uvOff[1], bc);
      m.quad(t0, t1, t2, t3);
    }
  }
}
function flagstoneInto(b, region, o) {
  var R = rng(seedOf(o.seed, 'flag')), m = b.mesher('flagstone'), cols = (STONECOL[o.stone] || STONECOL.arizona).map(hexLin);
  var cells = voronoiCells(region, o.size || 2.2, R, 0.9), outer = ccw(regionOuter(region)), holes = regionHoles(region), n = 0;
  cells.forEach(function (c) {
    var poly = insetConvex(c.poly, (o.gap === undefined ? 0.07 : o.gap) / 2); if (poly.length < 3) return;
    poly = chamferPoly(poly, 0.12 + R() * 0.08);
    poly = poly.map(function (q) { return [q[0] + (R() - 0.5) * 0.03, q[1] + (R() - 0.5) * 0.03]; });
    var clipped = clipConvex(outer, poly); if (clipped.length < 3 || Math.abs(polyArea(clipped)) < 0.08) return;
    var cx = 0, cz = 0; clipped.forEach(function (q) { cx += q[0] / clipped.length; cz += q[1] / clipped.length; });
    for (var h = 0; h < holes.length; h++) if (inPoly(holes[h], cx, cz)) return;
    var col = jit(cols[(R() * cols.length) | 0], R, 0.1, 0.05);
    slabPiece(m, clipped, o, o.thick === undefined ? 0.14 : o.thick, 0.03, col, R, [R() * 7, R() * 7]);
    n++;
  });
  var joint = o.joint === undefined ? 'dg' : o.joint;
  if (joint && joint !== 'none') groundInto(b, region, joint === 'grass' ? 'lawn' : joint, opt(o, { tint: null, lift: 0.02 }));
  return n;
}
function paversInto(b, region, o) {
  var R = rng(seedOf(o.seed, 'paver')), m = b.mesher('paver'), cols = (PAVERCOL[o.color] || PAVERCOL.blend).map(hexLin);
  var size = o.size || [1, 2], pw = size[0], pl = size[1], gap = o.gap === undefined ? 0.02 : o.gap, ang = o.angle || 0, ca = Math.cos(ang), sa = Math.sin(ang);
  var outer = ccw(regionOuter(region)), holes = regionHoles(region), bb = bbox(outer), cx0 = (bb[0] + bb[2]) / 2, cz0 = (bb[1] + bb[3]) / 2;
  var span = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2 + pl * 2, rects = [], i, j;
  function W(u, v) { return [cx0 + u * ca - v * sa, cz0 + u * sa + v * ca]; }
  var pat = o.pattern || 'runningBond';
  if (pat === 'basketweave') {
    var B = pl;   // 2 pavers (pw×pl) per block when pl = 2·pw
    for (i = -Math.ceil(span / B); i <= Math.ceil(span / B); i++) for (j = -Math.ceil(span / B); j <= Math.ceil(span / B); j++) {
      var u0 = i * B, v0 = j * B;
      for (var k = 0; k < Math.round(B / pw); k++) {
        if ((i + j) % 2 === 0) rects.push([u0, v0 + k * pw, u0 + B, v0 + (k + 1) * pw]);
        else rects.push([u0 + k * pw, v0, u0 + (k + 1) * pw, v0 + B]);
      }
    }
  } else {
    for (j = -Math.ceil(span / pw); j <= Math.ceil(span / pw); j++) {
      var off = pat === 'stack' ? 0 : ((j % 2 + 2) % 2) * pl / 2;
      for (i = -Math.ceil(span / pl) - 1; i <= Math.ceil(span / pl) + 1; i++) rects.push([i * pl + off, j * pw, (i + 1) * pl + off, (j + 1) * pw]);
    }
  }
  var count = 0;
  rects.forEach(function (r) {
    var poly = [W(r[0] + gap / 2, r[1] + gap / 2), W(r[2] - gap / 2, r[1] + gap / 2), W(r[2] - gap / 2, r[3] - gap / 2), W(r[0] + gap / 2, r[3] - gap / 2)];
    var cx = 0, cz = 0; poly.forEach(function (q) { cx += q[0] / 4; cz += q[1] / 4; });
    if (cx < bb[0] - pl || cx > bb[2] + pl || cz < bb[1] - pl || cz > bb[3] + pl) return;
    var clipped = clipConvex(outer, ccw(poly)); if (clipped.length < 3 || Math.abs(polyArea(clipped)) < 0.04) return;
    var ccx = 0, ccz = 0; clipped.forEach(function (q) { ccx += q[0] / clipped.length; ccz += q[1] / clipped.length; });
    for (var h = 0; h < holes.length; h++) if (inPoly(holes[h], ccx, ccz)) return;
    var col = jit(cols[(R() * cols.length) | 0], R, 0.06, 0.03);
    slabPiece(m, clipped, o, o.thick === undefined ? 0.16 : o.thick, clipped.length === 4 ? 0.025 : 0, col, R, [R() * 5, R() * 5]);
    count++;
  });
  groundInto(b, region, 'mortar', opt(o, { lift: 0.04 }));
  if (o.edge !== false && o.heightAt) skirt(b.mesher('paver'), outer, o, 0.16, 0.4, function () { return vsc(cols[0], 0.7); });
  return count;
}
function groundInto(b, region, surface, o) {
  if (surface === 'flagstone') return flagstoneInto(b, region, o);
  if (surface === 'pavers') return paversInto(b, region, o);
  var S = SURF[surface]; if (!S) throw new Error('LAND.ground: unknown surface "' + surface + '"');
  var mat = surface === 'gravel' ? (GRAVELMAT[o.color] || 'gravel') : S.mat, lift = o.lift === undefined ? S.lift : o.lift;
  var seed = seedOf(o.seed, surface), amt = o.variation === undefined ? (surface === 'lawn' ? 0.12 : surface === 'meadow' ? 0.2 : 0.1) : o.variation;
  if (surface === 'lawn' && o.stripes === false) mat = 'lawnPlain';
  var colFn = variationFn(o, seed, amt, null), sa = o.stripeAngle || 0;
  var m = b.mesher(mat), v0 = m.v;
  surfaceMesher(m, region, o, lift, colFn);
  if (sa) for (var vi = v0; vi < m.v; vi++) {   // rotate the UVs (mowing-stripe / texture direction)
    var uu = m.u[vi * 2], vv = m.u[vi * 2 + 1];
    m.u[vi * 2] = uu * Math.cos(sa) + vv * Math.sin(sa); m.u[vi * 2 + 1] = -uu * Math.sin(sa) + vv * Math.cos(sa);
  }
  if (surface === 'concrete' && o.edge !== false) skirt(m, regionOuter(region), o, lift, (o.thickness || 0.33) + (o.heightAt ? 0.4 : 0), function () { return [0.8, 0.8, 0.8]; });
  return 1;
}
LAND.ground = function (region, surface, opts) {
  var o = opt({ seed: 1 }, opts), b = new Builder(o);
  if (surface === 'decomposedGranite') surface = 'dg';
  var n = groundInto(b, region, surface, o);
  var g = b.build('ground:' + surface);
  g.traverse(function (c) { if (c.isMesh) c.castShadow = surface === 'flagstone' || surface === 'pavers'; });
  g.userData = { surface: surface, region: region, pieces: n };
  return g;
};
LAND.surfaces = ['gravel', 'decomposedGranite', 'mulch', 'lawn', 'flagstone', 'pavers', 'concrete', 'meadow'];

/* ---- Zone 0: the 0–5 ft ember-resistant band around structures */
LAND.zone0 = function (footprints, dist, opts) {
  opts = opts || {};
  if (footprints.length && typeof footprints[0][0] === 'number') footprints = [footprints];
  var d = dist === undefined ? 5 : dist;
  return footprints.map(function (fp) {
    var off = offsetPoly(fp, d, 4);
    if (opts.ring) return { outer: off, holes: [ccw(fp)], combustibleOnly: true, buffer: 0 };
    off.combustibleOnly = true; off.buffer = 0; off.footprint = fp;
    return off;
  });
};
// true when a footprint of radius r at (x,z) reaches into any of the zones (polygons from LAND.zone0, or {polygon, buffer})
LAND.zone0Check = function (zones, x, z, r) {
  r = r || 0;
  for (var i = 0; i < zones.length; i++) {
    var a = normAvoid(zones[i]);
    if (inPoly(a.poly, x, z) || edgeDist(a.poly, x, z) < a.buffer + r) return true;
  }
  return false;
};
LAND.offset = function (poly, d) { return offsetPoly(poly, d); };
LAND.pathPolygon = function (points, width) { return polylinePoly(points, width || 3); };
/* ================================================================== HARDSCAPE (non-combustible: allowed in Zone 0) */
var HARD = function (extra) { var m = { combustible: false, place: 'level', concept: ['all'] }; for (var k in extra || {}) m[k] = extra[k]; return m; };
var ROCKCOL = { granite: ['#aaa69d', '#b4afa5', '#9d988f'], fieldstone: ['#8f8a7f', '#857f72', '#9a9384'], sandstone: ['#c4a47c', '#b8966e', '#cfb08a'], basalt: ['#55534f', '#4b4a47', '#605d58'] };

/* ---------------------------------------------------------------- boulders */
// planar projection chosen per triangle (non-indexed geometry): no stretching where the dominant axis changes
function faceUV(g) {
  var p = g.attributes.position, uv = new Float32Array(p.count * 2), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (var i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)); var ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (var k = 0; k < 3; k++) {
      var x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      if (ay >= ax && ay >= az) { uv[(i + k) * 2] = x; uv[(i + k) * 2 + 1] = z; }
      else if (az >= ax) { uv[(i + k) * 2] = x; uv[(i + k) * 2 + 1] = y; }
      else { uv[(i + k) * 2] = z; uv[(i + k) * 2 + 1] = y; }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
function boulderGeo(o, R) {
  var ico = new THREE.IcosahedronGeometry(1, clamp(o.res | 0, 1, 9)), pos = ico.attributes.position, map = {}, verts = [], idx = [], i;
  for (i = 0; i < pos.count; i++) {
    var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), key = Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4);
    if (map[key] === undefined) { map[key] = verts.length; verts.push([x, y, z]); }
    idx.push(map[key]);
  }
  ico.dispose();
  var planes = [], style = o.style, nP = style === 'angular' ? 14 : style === 'flat' ? 6 : 4, sd = (o.seed * 131) | 0;
  for (i = 0; i < nP; i++) { var n = randDir(R); planes.push([n, style === 'angular' ? 0.5 + 0.22 * R() : 0.78 + 0.18 * R()]); }
  if (style === 'flat') planes.push([[0, 1, 0], 0.25 + 0.1 * R()]);
  var H = o.h / (1 - o.bury), P = [], RH = [];
  verts.forEach(function (v) {
    var r = 1 + 0.17 * fbm3(v[0] * 1.3 + 7, v[1] * 1.3, v[2] * 1.3, sd, 4) + 0.05 * vnoise3(v[0] * 5, v[1] * 5, v[2] * 5, sd + 1);
    var p = vsc(v, r);
    planes.forEach(function (pl) { var dd = vdot(p, pl[0]) - pl[1]; if (dd > 0) p = vmad(p, pl[0], -dd * (style === 'angular' ? 1.0 : 0.92)); });
    if (p[1] < 0) p[1] *= 0.75;
    RH.push(r);
    P.push([p[0] * o.w / 2, (p[1] * 0.5 + 0.5) * H - o.bury * H, p[2] * o.d / 2]);
  });
  var g = new THREE.BufferGeometry(), arr = new Float32Array(P.length * 3);
  P.forEach(function (p, k) { arr[k * 3] = p[0]; arr[k * 3 + 1] = p[1]; arr[k * 3 + 2] = p[2]; });
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); g.setIndex(idx); g.computeVertexNormals();
  var cols = (ROCKCOL[o.type] || ROCKCOL.granite).map(hexLin), base = cols[(R() * cols.length) | 0], lich = hexLin(o.type === 'basalt' ? '#7d8070' : '#c9c9b2'), soil = hexLin('#5a4a38');
  var nrm = g.attributes.normal, ca = new Float32Array(P.length * 3);
  P.forEach(function (p, k) {
    var c = vsc(base, lerp(0.72, 1.08, clamp((RH[k] - 0.85) / 0.3, 0, 1)) * (1 + 0.08 * vnoise3(p[0] * 2, p[1] * 2, p[2] * 2, sd + 5)));
    var ny = nrm.getY(k), l = fbm3(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, sd + 9, 3);
    if (o.lichen !== false && ny > 0.25 && l > 0.12) c = mixc(c, lich, clamp((l - 0.12) * 3, 0, 0.55) * clamp((ny - 0.25) * 2, 0, 1));
    var gy = clamp((p[1] + 0.05) / 0.35, 0, 1); c = mixc(vsc(soil, 0.9), c, 0.45 + 0.55 * gy);
    ca[k * 3] = c[0]; ca[k * 3 + 1] = c[1]; ca[k * 3 + 2] = c[2];
  });
  g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  g = g.toNonIndexed();
  if (style === 'angular') g.computeVertexNormals();   // faceted, fractured look (others keep smooth normals)
  faceUV(g);
  return g;
}
def('boulder', 'hardscape', { w: 3, h: 1.8, d: 2.4, style: 'round', type: 'granite', bury: 0.3, res: 6, seed: 1, lichen: true }, function (b, o) {
  var R = rng(seedOf(o.seed, 'boulder'));
  b.add('stone', boulderGeo(o, R), null, { keepUV: true });
}, function (o) { return [o.w, o.d, o.h]; },
  'Irregular boulder, partly buried (bury = fraction of its height below grade). style: round|angular|flat; type: granite|fieldstone|sandstone|basalt; res = icosahedron detail, 20·(res+1)² tris (6 → 980, 4 → 500).',
  HARD({ place: 'sink', common: 'Boulder' }));

/* ---------------------------------------------------------------- steel edging (world-space polyline) */
function densifyLine(pts, step, closed) {
  var out = [], n = pts.length;
  for (var i = 0; i < (closed ? n : n - 1); i++) {
    var a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / step));
    for (var j = 0; j < k; j++) out.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
  }
  if (!closed) out.push(pts[n - 1]); else out.push(pts[0]);
  return out;
}
function ribbon(m, pts, o, yTop, yBot, thick, col) {   // a thin vertical strip with both faces + top
  var n = pts.length, prev = null;
  for (var i = 0; i < n; i++) {
    var a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1;
    var nx = dz / l, nz = -dx / l, x = pts[i][0], z = pts[i][1], g = hAt(o, x, z), u = 0;
    if (i) u = prev.u + Math.hypot(x - prev.x, z - prev.z);
    var L = [x + nx * thick / 2, z + nz * thick / 2], Rr = [x - nx * thick / 2, z - nz * thick / 2];
    var v = [
      m.vert([L[0], g + yTop, L[1]], [nx, 0, nz], u, yTop, col), m.vert([L[0], g - yBot, L[1]], [nx, 0, nz], u, -yBot, vsc(col, 0.7)),
      m.vert([Rr[0], g + yTop, Rr[1]], [-nx, 0, -nz], u, yTop, col), m.vert([Rr[0], g - yBot, Rr[1]], [-nx, 0, -nz], u, -yBot, vsc(col, 0.7)),
      m.vert([L[0], g + yTop, L[1]], [0, 1, 0], u, 0, col), m.vert([Rr[0], g + yTop, Rr[1]], [0, 1, 0], u, thick, col)
    ];
    if (prev) {
      var p = prev.v;
      m.quad(p[0], v[0], v[1], p[1]); m.quad(p[2], p[3], v[3], v[2]); m.quad(p[4], p[5], v[5], v[4]);
    }
    prev = { v: v, x: x, z: z, u: u };
  }
}
def('steelEdging', 'hardscape', { points: [[-4, 0], [0, 0.6], [4, 0]], closed: false, height: 0.1, depth: 0.3, thick: 0.02, finish: 'steel', heightAt: null }, function (b, o) {
  var pts = densifyLine(o.points, 0.75, o.closed);
  ribbon(b.mesher(o.finish === 'corten' ? 'corten' : 'steel'), pts, o, o.height, o.depth, o.thick, [1, 1, 1]);
}, function (o) { var bb = bbox(o.points); return [bb[2] - bb[0], bb[3] - bb[1], o.height]; },
  'Steel landscape edging along `points` ([[x,z],...] world feet; closed for a loop). 3/16" strip, `height` exposed above grade. finish: steel|corten. Follows heightAt.',
  HARD({ place: 'world', common: 'Steel edging' }));

/* ---------------------------------------------------------------- Corten planters & raised beds */
function bedInfo(b, poly, y) { b.info = b.info || {}; b.info.bed = poly; b.info.bedY = y; }
def('cortenPlanter', 'hardscape', { shape: 'rect', w: 6, d: 2, h: 2, dia: 3, t: 0.025, soil: true, finish: 'corten' }, function (b, o) {
  var mat = o.finish === 'black' ? 'steel' : 'corten', drop = (o._drop || 0) + 0.1, h = o.h, t = o.t, sy = h - 0.2;
  if (o.shape === 'round') {
    var r = o.dia / 2, seg = 48;
    b.add(mat, new THREE.CylinderGeometry(r, r, h + drop, seg, 1, true), M(0, (h - drop) / 2, 0), { keepUV: true });
    var inner = new THREE.CylinderGeometry(r - t, r - t, h, seg, 1, true); flipWinding(inner); inner.computeVertexNormals();
    var nA = inner.attributes.normal; for (var i = 0; i < nA.count; i++) nA.setXYZ(i, -nA.getX(i), -nA.getY(i), -nA.getZ(i));
    b.add(mat, inner, M(0, h / 2, 0), { keepUV: true });
    var ring = new THREE.RingGeometry(r - t, r, seg, 1); ring.rotateX(-HALF); b.add(mat, ring, M(0, h, 0), { keepUV: true });
    // UVs: wrap the corten texture around (feet)
    if (o.soil) { var disc = new THREE.CircleGeometry(r - t, seg); disc.rotateX(-HALF); var duv = disc.attributes.uv, dp = disc.attributes.position; for (i = 0; i < duv.count; i++) duv.setXY(i, dp.getX(i), dp.getZ(i)); b.add('soil', disc, M(0, sy, 0), { keepUV: true }); }
    var circ = []; for (i = 0; i < 24; i++) circ.push([Math.cos(i / 24 * TAU) * (r - t - 0.1), Math.sin(i / 24 * TAU) * (r - t - 0.1)]);
    bedInfo(b, circ, sy);
  } else {
    var w = o.w, d = o.shape === 'square' ? o.w : o.d, yc = (h - drop) / 2, H = h + drop;
    b.box(mat, w, H, t, 0, yc, -d / 2 + t / 2); b.box(mat, w, H, t, 0, yc, d / 2 - t / 2);
    b.box(mat, t, H, d - 2 * t, -w / 2 + t / 2, yc, 0); b.box(mat, t, H, d - 2 * t, w / 2 - t / 2, yc, 0);
    if (o.soil) { var pl = new THREE.PlaneGeometry(w - 2 * t, d - 2 * t); pl.rotateX(-HALF); var pu = pl.attributes.uv, pp = pl.attributes.position; for (i = 0; i < pu.count; i++) pu.setXY(i, pp.getX(i), pp.getZ(i)); b.add('soil', pl, M(0, sy, 0), { keepUV: true }); }
    bedInfo(b, [[-w / 2 + t + 0.15, -d / 2 + t + 0.15], [w / 2 - t - 0.15, -d / 2 + t + 0.15], [w / 2 - t - 0.15, d / 2 - t - 0.15], [-w / 2 + t + 0.15, d / 2 - t - 0.15]], sy);
  }
}, function (o) { return o.shape === 'round' ? [o.dia, o.dia, o.h] : [o.w, o.shape === 'square' ? o.w : o.d, o.h]; },
  'Weathering-steel planter, 1/4" walls. shape: rect|square|round (dia). Soil top at h−0.2; userData.bed / bedWorld + bedY give the planting polygon for LAND.scatter. finish: corten|black.',
  HARD({ common: 'Corten planter', concept: ['desert', 'mediterranean'] }));

def('raisedBed', 'hardscape', { w: 8, d: 4, h: 1.5, material: 'cedar', soil: true }, function (b, o) {
  var mat = o.material, w = o.w, d = o.d, h = o.h, drop = (o._drop || 0), bt = 0.125, post = 0.29, sy = h - 0.15;
  if (mat === 'corten' || mat === 'steel') {
    var t = 0.025, yc = (h - drop) / 2, H = h + drop;
    b.box(mat, w, H, t, 0, yc, -d / 2); b.box(mat, w, H, t, 0, yc, d / 2); b.box(mat, t, H, d, -w / 2, yc, 0); b.box(mat, t, H, d, w / 2, yc, 0);
    b.box(mat, w + 0.12, 0.04, 0.16, 0, h, -d / 2); b.box(mat, w + 0.12, 0.04, 0.16, 0, h, d / 2); b.box(mat, 0.16, 0.04, d, -w / 2, h, 0); b.box(mat, 0.16, 0.04, d, w / 2, h, 0);
  } else {
    var n = Math.max(1, Math.round(h / 0.5)), bh = h / n;
    for (var i = 0; i < n; i++) {
      var y = i * bh + bh / 2;
      b.box(mat, w, bh - 0.01, bt, 0, y, -d / 2 + bt / 2); b.box(mat, w, bh - 0.01, bt, 0, y, d / 2 - bt / 2);
      b.box(mat, bt, bh - 0.01, d - 2 * bt, -w / 2 + bt / 2, y, 0); b.box(mat, bt, bh - 0.01, d - 2 * bt, w / 2 - bt / 2, y, 0);
    }
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { b.box(mat, post, h + drop, post, c[0] * (w / 2 - post / 2 - bt), (h - drop) / 2, c[1] * (d / 2 - post / 2 - bt)); });
    if (drop > 0.05) { b.box(mat, w, drop, bt, 0, -drop / 2, -d / 2 + bt / 2); b.box(mat, w, drop, bt, 0, -drop / 2, d / 2 - bt / 2); b.box(mat, bt, drop, d, -w / 2 + bt / 2, -drop / 2, 0); b.box(mat, bt, drop, d, w / 2 - bt / 2, -drop / 2, 0); }
    var cw = 0.45; b.box(mat, w + 0.1, 0.12, cw, 0, h + 0.06, -d / 2 + cw / 2 - 0.05); b.box(mat, w + 0.1, 0.12, cw, 0, h + 0.06, d / 2 - cw / 2 + 0.05);
    b.box(mat, cw, 0.12, d - 2 * cw + 0.1, -w / 2 + cw / 2 - 0.05, h + 0.06, 0); b.box(mat, cw, 0.12, d - 2 * cw + 0.1, w / 2 - cw / 2 + 0.05, h + 0.06, 0);
  }
  if (o.soil) { var pl = new THREE.PlaneGeometry(w - 0.3, d - 0.3); pl.rotateX(-HALF); var pu = pl.attributes.uv, pp = pl.attributes.position; for (var k = 0; k < pu.count; k++) pu.setXY(k, pp.getX(k), pp.getZ(k)); b.add('soil', pl, M(0, sy, 0), { keepUV: true }); }
  bedInfo(b, [[-w / 2 + 0.4, -d / 2 + 0.4], [w / 2 - 0.4, -d / 2 + 0.4], [w / 2 - 0.4, d / 2 - 0.4], [-w / 2 + 0.4, d / 2 - 0.4]], sy);
}, function (o) { return [o.w, o.d, o.h]; },
  'Raised vegetable/cutting bed. material: cedar (boards, posts, cap rail) | corten | steel. Note: wood is combustible — keep cedar beds out of Zone 0.',
  HARD({ common: 'Raised bed', concept: ['traditional', 'desert'], combustible: 'cedar' }));

/* ---------------------------------------------------------------- low stone seat wall (straight or arc) */
def('seatWall', 'hardscape', { length: 10, radius: 0, arc: 2.2, h: 1.5, t: 1.25, cap: 'capstone', capT: 0.17, capOver: 0.08 }, function (b, o) {
  var pts = [], i, n, drop = (o._drop || 0) + 0.15;
  if (o.radius > 0) { n = Math.max(6, Math.ceil(o.arc * o.radius / 0.8)); for (i = 0; i <= n; i++) { var a = -HALF - o.arc / 2 + o.arc * i / n; pts.push([Math.cos(a) * o.radius, Math.sin(a) * o.radius]); } }
  else { n = Math.max(1, Math.ceil(o.length / 4)); for (i = 0; i <= n; i++) pts.push([-o.length / 2 + o.length * i / n, 0]); }
  var mv = b.mesher('veneer'), mc = b.mesher(o.cap);
  function side(ht, off, y0, y1, m, uvTop) {
    var out = [], u = 0;
    for (var k = 0; k < pts.length; k++) {
      var a = pts[Math.max(0, k - 1)], c = pts[Math.min(pts.length - 1, k + 1)], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1;
      var nx = dz / l, nz = -dx / l;
      if (k) u += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      out.push({ p: [pts[k][0] + nx * off, pts[k][1] + nz * off], n: [nx * Math.sign(off), 0, nz * Math.sign(off)], u: u });
    }
    return out;
  }
  function wallFaces(m, half, y0, y1, uvMode) {
    var A = side(0, half, y0, y1), B = side(0, -half, y0, y1), k, ids = [];
    [A, B].forEach(function (S, si) {
      var prev = null;
      S.forEach(function (s) {
        var t = m.vert([s.p[0], y1, s.p[1]], s.n, s.u, y1), bt = m.vert([s.p[0], y0, s.p[1]], s.n, s.u, y0);
        if (prev) { if (si === 0) m.quad(prev[0], t, bt, prev[1]); else m.quad(prev[0], prev[1], bt, t); }
        prev = [t, bt];
      });
    });
    // top & bottom
    [[y1, [0, 1, 0]], [y0, [0, -1, 0]]].forEach(function (tb, ti) {
      var prev = null;
      for (k = 0; k < A.length; k++) {
        var a = m.vert([A[k].p[0], tb[0], A[k].p[1]], tb[1], A[k].p[0], A[k].p[1]), c = m.vert([B[k].p[0], tb[0], B[k].p[1]], tb[1], B[k].p[0], B[k].p[1]);
        if (prev) { if (ti === 0) m.quad(prev[0], prev[1], c, a); else m.quad(prev[0], a, c, prev[1]); }
        prev = [a, c];
      }
    });
    // end caps
    [[0, 1], [A.length - 1, -1]].forEach(function (e) {
      var a = A[e[0]].p, c = B[e[0]].p, k2 = e[0] === 0 ? 1 : A.length - 2, dx = pts[e[0]][0] - pts[k2][0], dz = pts[e[0]][1] - pts[k2][1], l = Math.hypot(dx, dz) || 1, nn = [dx / l, 0, dz / l];
      var v0 = m.vert([a[0], y1, a[1]], nn, 0, y1), v1 = m.vert([c[0], y1, c[1]], nn, half * 2, y1), v2 = m.vert([c[0], y0, c[1]], nn, half * 2, y0), v3 = m.vert([a[0], y0, a[1]], nn, 0, y0);
      if (e[1] > 0) m.quad(v0, v3, v2, v1); else m.quad(v0, v1, v2, v3);
    });
  }
  wallFaces(mv, o.t / 2, -drop, o.h - o.capT, 'v');
  wallFaces(mc, o.t / 2 + o.capOver, o.h - o.capT, o.h, 'c');
}, function (o) { return o.radius > 0 ? [2 * o.radius * Math.sin(Math.min(PI, o.arc / 2)) + o.t, o.radius + o.t, o.h] : [o.length, o.t, o.h]; },
  'Low stacked-ledgestone seat wall (18" high, 15" deep) with a bluestone cap. Straight (`length`, centred on the origin along x) or curved (`radius` + `arc` radians, origin = circle centre, arc centred on −z — wraps a fire pit placed at the origin). cap: capstone|concrete.',
  HARD({ common: 'Seat wall', concept: ['mediterranean', 'native', 'traditional'] }));

/* ---------------------------------------------------------------- RV pad */
def('rvPad', 'hardscape', { w: 12, l: 40, surface: 'concrete', wheelStops: true, hookup: true, seed: 1 }, function (b, o) {
  var w = o.w, l = o.l, rect = [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2]], drop = o._drop || 0, lo = { seed: o.seed, res: 8 };
  if (o.surface === 'gravel') {
    groundInto(b, rect, 'gravel', opt(lo, { lift: 0.06 }));
    ribbon(b.mesher('steel'), densifyLine(rect, 2, true), {}, 0.1, 0.3 + drop, 0.02, [1, 1, 1]);
  } else if (o.surface === 'pavers') {
    groundInto(b, rect, 'pavers', opt(lo, { color: 'grey', size: [1, 1], pattern: 'stack', edge: false }));
  } else {
    groundInto(b, rect, 'concrete', opt(lo, { thickness: 0.33 + drop, lift: 0.06 }));
  }
  if (o.wheelStops) [-1, 1].forEach(function (s) { b.rbox('concrete', 3, 0.42, 0.55, 0.06, s * 2.6, 0.27, l / 2 - 2.2, { seg: 1, color: '#d8d4cc' }); });
  if (o.hookup) {
    b.box('frame', 0.45, 3.2, 0.35, w / 2 + 1.2, 1.6, l / 2 - 8);
    b.rbox('frame', 0.75, 0.9, 0.5, 0.05, w / 2 + 1.2, 3.4, l / 2 - 8, { seg: 1 });
    b.rbox('concrete', 1.2, 0.3, 1.0, 0.04, w / 2 + 1.2, 0.1, l / 2 - 8, { seg: 1 });
  }
}, function (o) { return [o.w + (o.hookup ? 2.5 : 0), o.l, 0.5]; },
  'Level RV / trailer parking pad (long axis z). surface: concrete (slab with saw-cut joints) | gravel (steel edged) | pavers. Wheel stops at +z end; utility pedestal (30/50 A + water) at +x side.',
  HARD({ common: 'RV pad' }));
/* ================================================================== FEATURES & OUTDOOR FURNITURE */
var FEAT = function (extra) { var m = { combustible: true, place: 'level', concept: ['all'] }; for (var k in extra || {}) m[k] = extra[k]; return m; };
// cylinder wall with UVs in feet (u around, v up) for veneer/corten wrapping
function wrapCyl(b, mat, r, y0, y1, seg, inside) {
  var g = new THREE.CylinderGeometry(r, r, y1 - y0, seg, 1, true), uv = g.attributes.uv, p = g.attributes.position;
  for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * r, p.getY(i) + (y0 + y1) / 2);
  if (inside) { flipWinding(g); var n = g.attributes.normal; for (i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
  return b.add(mat, g, M(0, (y0 + y1) / 2, 0), { keepUV: true });
}
function annulus(b, mat, r0, r1, y, seg, down) {
  var g = new THREE.RingGeometry(r0, r1, seg, 1), p = g.attributes.position, uv = g.attributes.uv;
  for (var i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getY(i));
  g.rotateX(down ? HALF : -HALF);
  return b.add(mat, g, M(0, y, 0), { keepUV: true });
}
function flames(b, h, r, R) {
  var g = [], m = new Mesher(), uvs = [0, 0, 1, 1];
  for (var i = 0; i < 5; i++) {
    var a = i / 5 * PI + R() * 0.3, ox = (R() - 0.5) * r * 0.6, oz = (R() - 0.5) * r * 0.6, w = r * (1.1 + 0.5 * R()), hh = h * (0.75 + 0.4 * R());
    var s = [Math.cos(a), 0, Math.sin(a)], base = [ox, 0, oz], n = [0, 1, 0];
    var v0 = m.vert(vmad(base, s, -w / 2), n, 0, 0), v1 = m.vert(vmad(base, s, w / 2), n, 1, 0), v2 = m.vert(vadd(vmad(base, s, w / 2), [0, hh, 0]), n, 1, 1), v3 = m.vert(vadd(vmad(base, s, -w / 2), [0, hh, 0]), n, 0, 1);
    m.quad(v0, v1, v2, v3);
  }
  return m.geometry();
}

/* ---------------------------------------------------------------- fire pit */
def('firePit', 'feature', { style: 'stone', dia: 4, h: 1.3, flame: true, light: false, fuel: 'gas', seed: 1 }, function (b, o) {
  var R = rng(seedOf(o.seed, 'firepit')), r = o.dia / 2, h = o.h, drop = (o._drop || 0) + 0.1, seg = 40, bedY;
  if (o.style === 'steel' || o.style === 'corten') {
    var mat = o.style === 'corten' ? 'corten' : 'steel', rb = r, bh = Math.min(h, 1.1);
    b.lathe(mat, [[0, 0.02], [rb * 0.35, 0.02], [rb * 0.38, 0.32], [rb * 0.82, bh * 0.62], [rb, bh], [rb * 0.97, bh + 0.03], [rb * 0.9, bh], [rb * 0.72, bh * 0.66], [rb * 0.3, bh * 0.42], [0, bh * 0.4]], 48, 0, 0, 0, {});
    b.cyl(mat, rb * 0.4, rb * 0.42, 0.06, 0, 0.03, 0, 32);
    bedY = bh * 0.45;
    if (o.fuel === 'wood') for (var k = 0; k < 4; k++) { var a = k / 4 * TAU + R(); b.rod('teak', [Math.cos(a) * rb * 0.45, bedY + 0.1, Math.sin(a) * rb * 0.45], [Math.cos(a + PI) * rb * 0.15, bedY + 0.35, Math.sin(a + PI) * rb * 0.15], 0.11, 7, { color: '#5a3a28' }); }
    else b.cyl('lava', rb * 0.62, rb * 0.62, 0.04, 0, bedY + 0.05, 0, 32, { keepUV: true });
    bedY += 0.1;
  } else {
    var wallMat = o.style === 'concrete' ? 'concrete' : 'veneer', capMat = o.style === 'concrete' ? 'concrete' : 'capstone', ri = r - 0.55, capT = 0.17;
    wrapCyl(b, wallMat, r, -drop, h - capT, seg);
    wrapCyl(b, 'steel', ri, h - 1.0, h, seg, true);
    annulus(b, capMat, ri, r + 0.08, h, seg);
    annulus(b, capMat, r - 0.02, r + 0.08, h - capT, seg, true);
    wrapCyl(b, capMat, r + 0.08, h - capT, h, seg);
    bedY = h - 0.42;
    var bed = new THREE.CircleGeometry(ri, seg); bed.rotateX(-HALF); var bu = bed.attributes.uv, bp = bed.attributes.position;
    for (var i = 0; i < bu.count; i++) bu.setXY(i, bp.getX(i), bp.getZ(i));
    b.add('lava', bed, M(0, bedY, 0), { keepUV: true });
    b.torus('steel', ri * 0.55, 0.03, 0, bedY + 0.03, 0, 6, 32, { rx: HALF });
  }
  if (o.flame) {
    var fl = flames(b, o.style === 'steel' || o.style === 'corten' ? 1.6 : 1.4, r * 0.55, R);
    b.add('flame', fl, M(0, bedY, 0), { keepUV: true });
    b.torus('ember', (o.style === 'stone' || o.style === 'concrete' ? (r - 0.55) : r * 0.5) * 0.55, 0.05, 0, bedY + 0.05, 0, 6, 32, { rx: HALF });
    if (o.light) { var L = new THREE.PointLight(0xff8a3c, 1.6, 22, 2); L.position.set(0, bedY + 1.0, 0); L.castShadow = false; b.object(L); }
  }
}, function (o) { return [o.dia + 0.16, o.dia + 0.16, o.h + (o.flame ? 1.2 : 0)]; },
  'Round fire pit. style: stone (ledgestone wall, bluestone cap, steel liner, lava-rock bed) | concrete | steel | corten (spun bowl). flame: additive flame cards + ember ring; light: adds a warm PointLight (no shadows). fuel: gas|wood.',
  FEAT({ combustible: false, common: 'Fire pit', concept: ['mediterranean', 'native', 'traditional', 'desert'] }));

/* ---------------------------------------------------------------- Adirondack chair */
var WOODMAT = { white: 'paintWhite', charcoal: 'paintCharcoal', sage: 'paintSage', teak: 'teak', cedar: 'cedar', grey: 'woodGrey' };
def('adirondackChair', 'furniture', { color: 'white' }, function (b, o) {
  var m = WOODMAT[o.color] || o.color, sl = 0.29, th = 0.07;
  b.shift = [0, 0, -1.1];
  // side stringers (seat rails) sloping down toward the back
  [-1, 1].forEach(function (s) {
    b.add(m, new THREE.BoxGeometry(th, 0.38, 2.75), M(s * 1.0, 0.95, 1.55, -0.2, 0, 0), { boxUV: true });
    b.box(m, th, 1.95, 0.3, s * 1.07, 0.98, 2.62);                        // front legs
    b.add(m, new THREE.BoxGeometry(th, 0.3, 1.6), M(s * 0.92, 0.45, 0.62, 1.05, 0, 0), { boxUV: true });   // back legs
    b.add(m, new THREE.BoxGeometry(0.48, th, 2.55), M(s * 1.17, 2.0, 1.6, 0.04, 0, 0), { boxUV: true });  // wide arms
    b.box(m, 0.08, 0.35, 0.28, s * 1.07, 1.8, 2.45);                     // arm corbel
  });
  for (var i = 0; i < 7; i++) {   // seat slats
    var z = 2.6 - i * 0.33, y = 1.22 - (2.6 - z) * 0.2;
    b.add(m, new THREE.BoxGeometry(2.05, th, 0.26), M(0, y, z, -0.2, 0, 0), { boxUV: true });
  }
  b.box(m, 2.05, 0.3, th, 0, 1.0, 2.66);
  // back slats, fanned, reclined ~22° with a rounded top
  var nB = 7;
  for (i = 0; i < nB; i++) {
    var t = (i - (nB - 1) / 2) / ((nB - 1) / 2), Lb = 2.75 - 0.55 * t * t, x0 = t * 0.62, ang = t * 0.12;
    var gb = new THREE.BoxGeometry(0.26, Lb, th);
    gb.translate(0, Lb / 2, 0);
    b.add(m, gb, M(x0 * 0.85, 0.82, 0.42, -0.38, 0, -ang), { boxUV: true, grainY: true });
  }
  b.add(m, new THREE.BoxGeometry(2.0, 0.28, th), M(0, 1.55, 0.1, -0.38, 0, 0), { boxUV: true });
  b.add(m, new THREE.BoxGeometry(2.3, 0.24, th), M(0, 2.15, -0.12, -0.38, 0, 0), { boxUV: true });
}, function () { return [2.6, 3.1, 3.4]; }, 'Classic slatted Adirondack chair, front faces +z. color: white|charcoal|sage|teak|cedar|grey.',
  FEAT({ common: 'Adirondack chair' }));

/* ---------------------------------------------------------------- outdoor lounge sofa */
def('loungeSofa', 'furniture', { w: 7, d: 3, h: 2.5, seats: 3, frame: 'teak', cushion: 'cushion', pillows: true, pillowMat: 'cushionAccent' }, function (b, o) {
  var w = o.w, d = o.d, f = o.frame === 'aluminum' ? 'frame' : (WOODMAT[o.frame] || o.frame), cu = o.cushion, legH = 0.42, aw = 0.42, armH = 2.0;
  b.shift = [0, 0, -d / 2];
  // frame: slatted sides + base rails
  [-1, 1].forEach(function (s) {
    var x = s * (w / 2 - aw / 2);
    for (var k = 0; k < 4; k++) b.box(f, aw, 0.12, 0.08, x, legH + 0.25 + k * 0.38, 0.12 + (d - 0.24) * (k % 2 ? 1 : 0) * 0);
    b.box(f, aw, armH, 0.14, x, armH / 2, 0.08); b.box(f, aw, armH, 0.14, x, armH / 2, d - 0.08);
    b.box(f, aw + 0.04, 0.1, d, x, armH - 0.05, d / 2);
    for (var j = 0; j < 5; j++) b.box(f, 0.08, armH - legH - 0.2, 0.1, x, legH + (armH - legH - 0.2) / 2, 0.45 + j * (d - 0.9) / 4);
    b.box(f, aw, 0.12, d, x, legH, d / 2);
  });
  b.box(f, w - 2 * aw, 0.12, 0.12, 0, legH, 0.1); b.box(f, w - 2 * aw, 0.12, 0.12, 0, legH, d - 0.1);
  b.box(f, w - 2 * aw, 0.06, d - 0.2, 0, legH + 0.05, d / 2);
  b.box(f, w - 2 * aw, 1.4, 0.12, 0, legH + 0.7, 0.1);
  var iw = w - 2 * aw, n = o.seats, cw = iw / n, sy = legH + 0.1;
  for (var i = 0; i < n; i++) {
    var x = -iw / 2 + cw * (i + 0.5);
    b.rbox(cu, cw - 0.03, 0.5, d - 0.75, 0.13, x, sy + 0.25, 0.75 + (d - 0.75) / 2 - 0.02, { seg: 2, bulge: [0.01, 0.05, 0.02], flat: 3 });
    b.rbox(cu, cw - 0.04, 1.35, 0.5, 0.16, x, sy + 0.5 + 0.62, 0.42, { seg: 2, bulge: [0.01, 0.02, 0.07], flat: 3, rx: -0.18 });
  }
  if (o.pillows) [-1, 1].forEach(function (s) { b.rbox(o.pillowMat, 1.3, 1.3, 0.35, 0.18, s * (iw / 2 - 0.8), sy + 1.25, 0.95, { seg: 2, bulge: [0, 0, 0.1], flat: 3, rx: -0.25, ry: -s * 0.3 }); });
}, function (o) { return [o.w, o.d, o.h]; }, 'Deep-seated outdoor sofa, front faces +z; frame: teak|aluminum|white|charcoal; cushion: cushion (oat)|cushionCharcoal; accent pillows.',
  FEAT({ common: 'Outdoor sofa' }));

/* ---------------------------------------------------------------- bench */
def('bench', 'furniture', { w: 5, d: 1.5, h: 1.5, back: false, material: 'teak' }, function (b, o) {
  var m = WOODMAT[o.material] || o.material, w = o.w, d = o.d, h = o.h, n = 5, sw = d / n;
  b.shift = [0, 0, -d / 2];
  if (o.material === 'concrete' || o.material === 'stone') {
    var sm = o.material === 'concrete' ? 'concrete' : 'capstone';
    b.rbox(sm, w, 0.25, d, 0.03, 0, h - 0.125, d / 2, { seg: 1 });
    [-1, 1].forEach(function (s) { b.rbox(sm, 0.4, h - 0.25, d * 0.85, 0.02, s * (w / 2 - 0.6), (h - 0.25) / 2, d / 2, { seg: 1 }); });
    return;
  }
  for (var i = 0; i < n; i++) b.box(m, w, 0.1, sw - 0.04, 0, h - 0.05, sw * (i + 0.5));
  [-1, 1].forEach(function (s) {
    var x = s * (w / 2 - 0.35);
    b.box(m, 0.22, h - 0.1, 0.22, x, (h - 0.1) / 2, 0.2); b.box(m, 0.22, h - 0.1, 0.22, x, (h - 0.1) / 2, d - 0.2);
    b.box(m, 0.18, 0.18, d - 0.2, x, h - 0.19, d / 2); b.box(m, 0.14, 0.14, d - 0.2, x, 0.35, d / 2);
    if (o.back) { b.add(m, new THREE.BoxGeometry(0.2, 1.6, 0.18), M(x, h + 0.65, 0.05, -0.12, 0, 0), { boxUV: true }); }
  });
  if (o.back) for (var k = 0; k < 3; k++) b.add(m, new THREE.BoxGeometry(w - 0.4, 0.28, 0.08), M(0, h + 0.4 + k * 0.42, 0.02 - k * 0.05, -0.12, 0, 0), { boxUV: true });
}, function (o) { return [o.w, o.d, o.h + (o.back ? 1.4 : 0)]; }, 'Slatted garden bench (material teak|cedar|white|charcoal|concrete|stone), back:true adds a slatted back. Front faces +z.',
  FEAT({ common: 'Bench' }));

/* ---------------------------------------------------------------- hot tub */
function rrPts(hw, r, cseg) {
  var pts = [];
  [[hw - r, hw - r, 0], [-(hw - r), hw - r, HALF], [-(hw - r), -(hw - r), PI], [hw - r, -(hw - r), 1.5 * PI]].forEach(function (c) { for (var i = 0; i <= cseg; i++) { var a = c[2] + i / cseg * HALF; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } });
  return pts;
}
function spaBasin(w, depth, rc, inset, seat) {   // rounded-rect basin rings (inner faces), opening at y = 0
  var rings = [[inset, 0], [inset + 0.1, -0.3], [inset + 0.1, -seat + 0.25], [inset + 0.25, -seat], [inset + 1.2, -seat - 0.05], [inset + 1.3, -seat - 0.3], [inset + 1.32, -depth + 0.25], [inset + 1.5, -depth]];
  var cseg = 6, pos = [], idx = [], N;
  rings.forEach(function (rg) {
    var hw = w / 2 - rg[0], r = Math.max(0.05, Math.min(rc - rg[0] * 0.5, hw - 0.01)), pts = [];
    [[hw - r, hw - r, 0], [-(hw - r), hw - r, HALF], [-(hw - r), -(hw - r), PI], [hw - r, -(hw - r), 1.5 * PI]].forEach(function (c) { for (var i = 0; i <= cseg; i++) { var a = c[2] + i / cseg * HALF; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } });
    N = pts.length; pts.forEach(function (p) { pos.push(p[0], rg[1], p[1]); });
  });
  for (var k = 0; k < rings.length - 1; k++) for (var i = 0; i < N; i++) { var i2 = (i + 1) % N, a = k * N + i, bq = k * N + i2, c = (k + 1) * N + i, d = (k + 1) * N + i2; idx.push(a, bq, c, bq, d, c); }
  var ci = pos.length / 3; pos.push(0, -depth, 0); var last = (rings.length - 1) * N;
  for (i = 0; i < N; i++) idx.push(ci, last + i, last + (i + 1) % N);
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  var n = g.attributes.normal; if (n.getX(0) * pos[0] + n.getZ(0) * pos[2] > 0) { flipWinding(g); g.computeVertexNormals(); }
  return g;
}
def('hotTub', 'feature', { w: 7.5, h: 3, cover: 'off', steps: true, cladding: 'cladding', water: true }, function (b, o) {
  var w = o.w, h = o.h, drop = (o._drop || 0) + 0.05, rim = 0.32;
  // cabinet with vertical cladding + darker base trim and corner posts
  var ch = h - 0.25 + drop, cy = (h - 0.25 - drop) / 2, ct = 0.2;   // open-top cabinet: four clad walls
  b.box(o.cladding, w - 0.1, ch, ct, 0, cy, -(w - 0.1) / 2 + ct / 2, 0, { boxUV: true, grainY: true }); b.box(o.cladding, w - 0.1, ch, ct, 0, cy, (w - 0.1) / 2 - ct / 2, 0, { boxUV: true, grainY: true });
  b.box(o.cladding, ct, ch, w - 0.1 - 2 * ct, -(w - 0.1) / 2 + ct / 2, cy, 0, 0, { boxUV: true, grainY: true }); b.box(o.cladding, ct, ch, w - 0.1 - 2 * ct, (w - 0.1) / 2 - ct / 2, cy, 0, 0, { boxUV: true, grainY: true });
  b.box('frame', w - 0.06, 0.18, w - 0.06, 0, 0.09 - drop * 0, 0);
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { b.box(o.cladding, 0.32, h - 0.25 + drop, 0.32, c[0] * (w / 2 - 0.14), (h - 0.25 - drop) / 2, c[1] * (w / 2 - 0.14), 0, { boxUV: true, grainY: true }); });
  // acrylic top: rounded rim + basin
  var hw0 = w / 2 - rim, rc0 = 1.2 - rim * 0.5, deck = new THREE.Shape(), hole = new THREE.Path();
  rrPts(w / 2 - 0.04, 0.16, 3).forEach(function (q, k) { if (k) deck.lineTo(q[0], q[1]); else deck.moveTo(q[0], q[1]); });
  rrPts(hw0, rc0, 6).forEach(function (q, k) { if (k) hole.lineTo(q[0], q[1]); else hole.moveTo(q[0], q[1]); });
  deck.holes.push(hole);
  var dg = new THREE.ExtrudeGeometry(deck, { depth: 0.18, steps: 1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 6 });
  dg.rotateX(-HALF); b.add('acrylic', dg, M(0, h - 0.22, 0));
  b.add('acrylic', spaBasin(w, 2.9, 1.2, rim, 1.15), M(0, h, 0));
  if (o.water && o.cover !== 'on') {
    var ws = new THREE.Shape(); rrPts(hw0 - 0.12, rc0 - 0.1, 6).forEach(function (q, k) { if (k) ws.lineTo(q[0], q[1]); else ws.moveTo(q[0], q[1]); });
    var wg = new THREE.ShapeGeometry(ws); wg.rotateX(-HALF);
    var wu = wg.attributes.uv, wp = wg.attributes.position; for (var i = 0; i < wu.count; i++) wu.setXY(i, wp.getX(i), wp.getZ(i));
    b.add('water', wg, M(0, h - 0.42, 0), { keepUV: true });
  }
  if (o.cover === 'on') {
    b.rbox('cover', w - 0.04, 0.38, w - 0.04, 0.14, 0, h + 0.19, 0, { seg: 3, bulge: [0, 0.04, 0], flat: 3 });
    b.box('cover', w - 0.3, 0.03, 0.06, 0, h + 0.39, 0);
  } else if (o.cover === 'folded') {
    b.rbox('cover', w - 0.04, 0.32, w / 2, 0.12, 0, h + 0.16, -w / 4, { seg: 3, rx: 0 });
    b.rbox('cover', w - 0.04, 0.32, w / 2, 0.12, 0, h + 0.48, -w / 4, { seg: 3 });
  } else if (o.cover === 'lifter') {
    b.rbox('cover', w - 0.04, w / 2, 0.32, 0.12, 0, h + 0.2 + w / 4, -w / 2 - 0.3, { seg: 3, rx: -0.12 });
    b.rbox('cover', w - 0.04, w / 2, 0.32, 0.12, 0, h + 0.2 + w / 4, -w / 2 - 0.65, { seg: 3, rx: -0.12 });
  }
  if (o.steps) {
    b.box(o.cladding, 3.2, 1.0, 1.25, 0, 0.5, w / 2 + 0.62, 0, { boxUV: true });
    b.box(o.cladding, 3.2, 0.5, 1.0, 0, 0.25, w / 2 + 1.25 + 0.5, 0, { boxUV: true });
    b.box('frame', 3.25, 0.06, 1.3, 0, 1.03, w / 2 + 0.62); b.box('frame', 3.25, 0.06, 1.05, 0, 0.53, w / 2 + 1.75);
  }
}, function (o) { return [o.w, o.w + (o.steps ? 2.3 : 0), o.h]; },
  'Square acrylic spa (7.5 × 7.5 × 3 ft) in a vertical-board cabinet. cover: off|on|folded|lifter; steps:true adds a two-step box at +z; water surface when uncovered.',
  FEAT({ common: 'Hot tub', concept: ['traditional', 'desert', 'mediterranean'] }));

/* ---------------------------------------------------------------- string lights */
def('stringLights', 'feature', { points: null, sag: 0.05, spacing: 1.25, posts: true, postH: 10, bulb: 0.075, heightAt: null, lights: 0, closed: true }, function (b, o) {
  var pts = o.points || [[-8, 9.5, -6], [8, 9.5, -6], [8, 9.5, 6], [-8, 9.5, 6]];
  var spans = o.closed ? pts.length : pts.length - 1, mc = b.mesher('cable'), mb = b.mesher('bulb');
  for (var s = 0; s < spans; s++) {
    var a = pts[s], c = pts[(s + 1) % pts.length], L = Math.hypot(c[0] - a[0], c[2] - a[2]), n = Math.max(2, Math.round(L / 0.8)), line = [];
    for (var i = 0; i <= n; i++) { var t = i / n; line.push([lerp(a[0], c[0], t), lerp(a[1], c[1], t) - 4 * o.sag * L * t * (1 - t), lerp(a[2], c[2], t)]); }
    tubeM(mc, line, line.map(function () { return 0.012; }), 4, function () { return [1, 1, 1]; }, null);
    var nb = Math.max(1, Math.round(L / o.spacing));
    for (i = 0; i < nb; i++) {
      var tb = (i + 0.5) / nb, p = [lerp(a[0], c[0], tb), lerp(a[1], c[1], tb) - 4 * o.sag * L * tb * (1 - tb), lerp(a[2], c[2], tb)];
      var sock = new THREE.CylinderGeometry(0.025, 0.025, 0.12, 5, 1, true); sock.translate(p[0], p[1] - 0.08, p[2]); b.add('cable', sock, null, { keepUV: true });
      var bulb = new THREE.SphereGeometry(o.bulb, 6, 4); bulb.scale(1, 1.25, 1); bulb.translate(p[0], p[1] - 0.14 - o.bulb, p[2]); b.add('bulb', bulb, null, { keepUV: true });
    }
  }
  if (o.posts) pts.forEach(function (p) {
    var g = o.heightAt ? o.heightAt(p[0], p[2]) : 0, H = p[1] - g + 0.4;
    b.box('cedar', 0.3, H, 0.3, p[0], g + H / 2 - 0.1, p[2], 0, { boxUV: true, grainY: true });
    b.box('steel', 0.36, 0.04, 0.36, p[0], p[1] + 0.32, p[2]);
  });
  for (var k = 0; k < (o.lights || 0); k++) {
    var q = pts[k % pts.length], q2 = pts[(k + 1) % pts.length], lp = new THREE.PointLight(0xffd29a, 0.8, 18, 2);
    lp.position.set((q[0] + q2[0]) / 2, (q[1] + q2[1]) / 2 - 0.6, (q[2] + q2[2]) / 2); b.object(lp);
  }
}, function (o) { var p = o.points || [[-8, 9.5, -6], [8, 9.5, 6]], bb = bbox(p.map(function (q) { return [q[0], q[2]]; })); return [bb[2] - bb[0], bb[3] - bb[1], 10]; },
  'Café string lights on catenary spans between `points` [[x,y,z],...] (world feet, y = attachment height; default a 16×12 ft square at 9.5 ft). posts:true adds 4×4 cedar posts down to heightAt; lights:n adds n warm PointLights.',
  FEAT({ place: 'world', common: 'String lights', concept: ['mediterranean', 'traditional', 'native', 'desert'] }));

/* ---------------------------------------------------------------- generic travel trailer (unbranded) */
def('rvTrailer', 'vehicle', { length: 26, w: 8, h: 10.5, stripe: 'charcoal', awning: true, seed: 1 }, function (b, o) {
  var L = o.length - 4, W = o.w, y0 = 1.75, y1 = o.h - 0.75, zf = -L / 2, zr = L / 2;   // body footprint along z; front (tongue) toward −z
  // side profile (z, y): sloped, rounded front cap; near-vertical rounded rear
  var s = new THREE.Shape(), rf = 1.3, rr = 0.6;
  s.moveTo(zr - rr, y0); s.lineTo(zf + 1.2, y0);
  s.quadraticCurveTo(zf, y0, zf, y0 + 1.0); s.lineTo(zf, y0 + 3.2);
  s.bezierCurveTo(zf, y0 + 5.5, zf + 0.6, y1 - 0.2, zf + rf + 1.4, y1);
  s.lineTo(zr - rr, y1); s.quadraticCurveTo(zr, y1, zr, y1 - rr); s.lineTo(zr, y0 + rr); s.quadraticCurveTo(zr, y0, zr - rr, y0);
  var bev = 0.35, body = new THREE.ExtrudeGeometry(s, { depth: W - 2 * bev, steps: 1, curveSegments: 10, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4 });
  body.translate(0, 0, -(W - 2 * bev) / 2); body.rotateY(HALF);   // shape x → −z
  var bp = body.attributes.position, bn = body.attributes.normal; for (var i = 0; i < bp.count; i++) { bp.setZ(i, -bp.getZ(i)); bn.setZ(i, -bn.getZ(i)); }
  flipWinding(body);
  b.add('rvBody', body, null, { keepUV: true });
  // decals: two bands, swept upward toward the rear (no lettering)
  var sc = o.stripe === 'blue' ? 'glassDark' : 'rvStripe';
  [-1, 1].forEach(function (sd) {
    var x = sd * (W / 2 + 0.005);
    for (var k = 0; k < 6; k++) {
      var z0 = zf + 2.4 + k * (L - 3.4) / 6, z1 = z0 + (L - 3.4) / 6, ya = y0 + 1.0 + k * 0.18, yb = y0 + 1.0 + (k + 1) * 0.18;
      b.add(sc, new THREE.BoxGeometry(0.02, 0.32, z1 - z0 + 0.02), M(x, (ya + yb) / 2, (z0 + z1) / 2, -Math.atan2(yb - ya, z1 - z0), 0, 0));
      b.add('rvTrim', new THREE.BoxGeometry(0.02, 0.12, z1 - z0 + 0.02), M(x, (ya + yb) / 2 + 0.3, (z0 + z1) / 2, -Math.atan2(yb - ya, z1 - z0), 0, 0));
    }
  });
  // windows (dark glass, black frames) — door side is +x
  function win(sd, z, y, ww, hh) { var x = sd * (W / 2 + 0.02); b.rbox('rubber', 0.05, hh + 0.12, ww + 0.12, 0.06, x, y, z, { seg: 2 }); b.rbox('glassDark', 0.07, hh, ww, 0.05, x, y, z, { seg: 2 }); }
  win(1, zf + 4.2, y0 + 4.6, 3.2, 1.8); win(1, zr - 4.0, y0 + 4.6, 3.6, 1.8); win(1, zr - 9.0, y0 + 4.9, 1.6, 1.2);
  win(-1, zf + 5.5, y0 + 4.6, 4.5, 1.9); win(-1, zr - 5.5, y0 + 4.6, 2.8, 1.8); win(-1, zr - 1.4, y0 + 4.9, 1.2, 1.0);
  b.add('glassDark', new THREE.BoxGeometry(W - 1.6, 1.1, 0.1), M(0, y0 + 4.0, zf - 0.02, -0.28, 0, 0));
  b.rbox('glassDark', W - 2.4, 1.4, 0.06, 0.06, 0, y0 + 4.6, zr + 0.02, { seg: 2 });
  // entry door (+x) with window, handle, steps
  var dz = zr - 6.2;
  b.rbox('rvTrim', 0.05, 6.4, 2.25, 0.06, W / 2 + 0.02, y0 + 3.2, dz, { seg: 2 }); b.rbox('rvBody', 0.07, 6.2, 2.08, 0.05, W / 2 + 0.03, y0 + 3.2, dz, { seg: 2 });
  b.rbox('glassDark', 0.09, 1.3, 1.1, 0.05, W / 2 + 0.04, y0 + 4.7, dz, { seg: 2 });
  b.box('rim', 0.12, 0.3, 0.08, W / 2 + 0.07, y0 + 3.0, dz - 0.8);
  [0, 1].forEach(function (k) { b.box('steel', 1.0, 0.06, 2.0, W / 2 + 0.5 + k * 0.85, y0 - 0.55 - k * 0.6, dz); });
  // baggage doors + utility hatches
  b.rbox('rvTrim', 0.05, 1.5, 3.0, 0.08, W / 2 + 0.02, y0 + 1.2, zf + 3.0, { seg: 2 }); b.rbox('rvTrim', 0.05, 1.5, 3.0, 0.08, -W / 2 - 0.02, y0 + 1.2, zf + 3.0, { seg: 2 });
  b.rbox('rvTrim', 0.05, 0.8, 0.9, 0.05, -W / 2 - 0.02, y0 + 1.3, zr - 8, { seg: 1 });
  // awning: rolled canvas tube + arms on the door side
  if (o.awning) {
    b.cyl('rvTrim', 0.22, 0.22, L - 7, W / 2 + 0.35, y1 - 0.45, zr - (L - 7) / 2 - 3.5, 16, { rx: HALF });
    [zr - 3.8, zf + 4.2].forEach(function (z) { b.rod('rim', [W / 2 + 0.05, y0 + 0.4, z], [W / 2 + 0.3, y1 - 0.6, z], 0.05, 6); });
  }
  // roof: AC shroud, vents, rear ladder
  b.rbox('rvBody', 2.4, 1.0, 3.0, 0.3, 0, y1 + 0.5, zr - 9, { seg: 3 });
  b.rbox('rvTrim', 1.3, 0.35, 1.3, 0.12, 0, y1 + 0.17, zf + 6, { seg: 2 }); b.rbox('rvTrim', 1.2, 0.3, 1.2, 0.1, 1.5, y1 + 0.15, zr - 3.5, { seg: 2 });
  [-0.8, 0.8].forEach(function (x) { b.rod('rim', [x, y0 + 1.6, zr + 0.25], [x, y1 + 0.2, zr + 0.25], 0.04, 6); });
  for (i = 0; i < 9; i++) b.rod('rim', [-0.8, y0 + 1.9 + i * 0.75, zr + 0.25], [0.8, y0 + 1.9 + i * 0.75, zr + 0.25], 0.03, 5);
  // chassis, wheels (tandem axle), fender skirts
  [-1, 1].forEach(function (sd) { b.box('steel', 0.3, 0.55, L - 1.0, sd * (W / 2 - 1.6), y0 - 0.3, 0.3); });
  var ax = [2.0, 4.6];
  ax.forEach(function (az) {
    [-1, 1].forEach(function (sd) {
      var wx = sd * (W / 2 - 0.85), wy = 1.2;
      b.cyl('rubber', 1.2, 1.2, 0.72, wx, wy, az, 24, { rz: HALF });
      b.cyl('rim', 0.72, 0.72, 0.74, wx, wy, az, 16, { rz: HALF });
      b.cyl('steel', 0.22, 0.22, 0.76, wx, wy, az, 10, { rz: HALF });
    });
  });
  [-1, 1].forEach(function (sd) {
    b.add('rvStripe', new THREE.CylinderGeometry(1.42, 1.42, 0.06, 24, 1, true, 0, PI), M(sd * (W / 2 + 0.01), 1.25, 3.3, 0, 0, HALF), { keepUV: true });
  });
  // A-frame tongue, coupler, jack, propane bottles, battery box
  var tz = zf - 3.6;
  [-1, 1].forEach(function (sd) { b.rod('steel', [sd * (W / 2 - 1.6), y0 - 0.3, zf + 0.4], [sd * 0.15, 1.75, tz], 0.13, 6); });
  b.box('steel', 0.4, 0.3, 0.9, 0, 1.75, tz - 0.3);
  b.cyl('steel', 0.13, 0.13, 2.4, 0, 1.4, tz + 0.9, 10); b.cyl('steel', 0.3, 0.3, 0.06, 0, 0.12, tz + 0.9, 12);
  [-0.55, 0.55].forEach(function (x) { b.lathe('propane', [[0, -0.85], [0.25, -0.8], [0.4, -0.6], [0.42, -0.4], [0.42, 0.4], [0.4, 0.6], [0.25, 0.8], [0.08, 0.85], [0.08, 0.98], [0, 0.98]], 14, x, 2.75, zf - 1.5); });
  b.rbox('rubber', 1.4, 0.8, 0.8, 0.06, 0, 2.2, zf - 2.5, { seg: 1 });
  b.box('rvTrim', 7.2, 0.25, 0.4, 0, y0 - 0.1, zr + 0.2);
  [-1, 1].forEach(function (sd) { b.rbox('ember', 0.5, 0.35, 0.08, 0.04, sd * (W / 2 - 0.6), y0 + 0.9, zr + 0.04, { seg: 1 }); });
  // stabiliser jacks
  [[-1, zr - 1.2], [1, zr - 1.2], [-1, zf + 1.4], [1, zf + 1.4]].forEach(function (j) { b.rod('steel', [j[0] * (W / 2 - 1.6), y0 - 0.4, j[1]], [j[0] * (W / 2 - 1.2), 0.05, j[1]], 0.06, 5); });
}, function (o) { return [o.w + 0.8, o.length, o.h]; },
  'Generic 26 ft travel trailer, unbranded (no lettering): rounded front cap, swept stripe bands, tandem axle, A-frame tongue with propane, awning on the +x (door) side. Long axis z, tongue toward −z.',
  FEAT({ common: 'Travel trailer', place: 'level', concept: ['all'] }));
/* ================================================================== SCATTER: fill a planting bed with instanced plants
   LAND.scatter(region, palette, opts) → THREE.Group of InstancedMesh (one per kind × part × variant) + one contact-shadow mesh.
   palette: [{kind, weight, size:[min,max] (scale on mature size), opts:{...kind options}, spacing}]
   opts: spacing (1 = mature canopies just touch), seed, avoid:[poly | {polygon, buffer, combustibleOnly}], edge:{kind,...} | [...],
         heightAt, drift (ft, size of single-species drifts), mix (0–1 chance of a random species inside a drift),
         variants (geometry variants per kind), detail, bloom, season, inset (fraction of canopy radius kept inside the bed),
         maxCount, contact, tilt (random lean, radians), canopy (avoid buffers measured to the canopy edge; default true) */
function cacheKey(kind, o) {
  return kind + '|' + JSON.stringify(o, function (k, v) { return typeof v === 'function' || k === 'at' || k === 'ry' ? undefined : v; });
}
function kindGeometries(kind, o) {
  var key = cacheKey(kind, o);
  if (!GEOCACHE[key]) {
    var K = KINDS[kind], oo = opt(K.defaults, o), b = new Builder(oo);
    oo.contact = false;
    K.build(b, oo);
    var geos = b.geometries();
    delete geos.contact;
    GEOCACHE[key] = geos;
  }
  return GEOCACHE[key];
}
function proxyGeometry(g, sphere) {   // shares GPU buffers; own bounding sphere covering every instance
  var p = new THREE.BufferGeometry();
  for (var k in g.attributes) p.setAttribute(k, g.attributes[k]);
  p.setIndex(g.index);
  p.boundingSphere = sphere;
  p.boundingBox = null;
  return p;
}
function normAvoid(a) {
  if (Array.isArray(a)) return { poly: a, buffer: a.buffer || 0, comb: !!a.combustibleOnly };
  return { poly: a.polygon || a.outer || a.poly, buffer: a.buffer || 0, comb: !!a.combustibleOnly, holes: a.holes };
}
LAND.scatter = function (region, palette, opts) {
  var o = opt({ spacing: 1.0, seed: 1, avoid: [], edge: null, heightAt: null, drift: null, mix: 0.12, variants: 1, maxCount: 4000,
    contact: true, detail: 1, bloom: 'auto', season: null, tilt: 0.05, inset: 0.3, canopy: true, sizeJitter: 0.06, shadows: true }, opts);
  var R = rng(seedOf(o.seed, 'scatter')), outer = regionOuter(region), bb = bbox(outer);
  // ---- palette entries
  var E = palette.map(function (e, i) {
    var K = KINDS[e.kind]; if (!K) throw new Error('LAND.scatter: unknown kind "' + e.kind + '"');
    if (K.meta.place === 'world') throw new Error('LAND.scatter: "' + e.kind + '" is a world-space kind');
    var eo = {}; for (var k in e.opts || {}) eo[k] = e.opts[k];
    var plant = !!K.meta.latin && K.category !== 'hardscape';
    if (plant) { if (eo.detail === undefined) eo.detail = o.detail; if (eo.bloom === undefined) eo.bloom = o.bloom; if (eo.season === undefined) eo.season = o.season; }
    var sz = K.size(opt(K.defaults, eo));
    return { i: i, kind: e.kind, K: K, weight: e.weight === undefined ? 1 : e.weight, size: e.size || [0.85, 1.15], opts: eo,
      w: Math.max(sz[0], sz[1]), d: sz[1], h: sz[2], spacing: e.spacing || 1, comb: K.meta.combustible !== false, plant: plant, list: [] };
  });
  var AV = (o.avoid || []).map(normAvoid);
  function blocked(x, z, r, comb) {
    for (var i = 0; i < AV.length; i++) {
      var a = AV[i]; if (a.comb && !comb) continue;
      if (inPoly(a.poly, x, z)) return true;
      if (a.buffer + (o.canopy ? r : 0) > 0 && edgeDist(a.poly, x, z) < a.buffer + (o.canopy ? r : 0)) return true;
    }
    return false;
  }
  // ---- spatial hash of placed plants
  var maxW = 1; E.forEach(function (e) { maxW = Math.max(maxW, e.w * e.size[1]); });
  var cell = maxW, grid = {}, placed = [];
  function near(x, z, r, sp) {
    var gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
      var L = grid[(gx + i) + ',' + (gz + j)]; if (!L) continue;
      for (var k = 0; k < L.length; k++) { var p = L[k], d = Math.hypot(p.x - x, p.z - z); if (d < (r + p.r) * Math.min(sp, p.sp)) return true; }
    }
    return false;
  }
  function place(e, x, z, s, fixed) {
    var r = e.w * s / 2, sp = o.spacing * e.spacing;
    if (!inRegion(region, x, z) || (!fixed && regionEdgeDist(region, x, z) < r * o.inset)) return false;
    if (blocked(x, z, r, e.comb)) return false;
    if (near(x, z, r, sp)) return false;
    var p = { e: e, x: x, z: z, s: s, r: r, sp: sp, ry: R() * TAU };
    var key = Math.floor(x / cell) + ',' + Math.floor(z / cell);
    (grid[key] = grid[key] || []).push(p); placed.push(p); e.list.push(p);
    return true;
  }
  // ---- edge / border planting along the outline
  var edges = o.edge ? (Array.isArray(o.edge) ? o.edge : [o.edge]) : [];
  edges.forEach(function (ed) {
    var K = KINDS[ed.kind], eo = ed.opts || {}, sz = K.size(opt(K.defaults, eo)), w = Math.max(sz[0], sz[1]);
    var plant = !!K.meta.latin && K.category !== 'hardscape';
    if (plant) { if (eo.detail === undefined) eo.detail = o.detail; if (eo.bloom === undefined) eo.bloom = o.bloom; if (eo.season === undefined) eo.season = o.season; }
    var e = { i: E.length, kind: ed.kind, K: K, weight: 0, size: ed.size || [0.9, 1.1], opts: eo, w: w, d: sz[1], h: sz[2], spacing: 0.75, comb: K.meta.combustible !== false, plant: plant, list: [] };
    E.push(e);
    var inset = ed.inset === undefined ? w * 0.5 : ed.inset, step = ed.spacing || w * 0.9, line = offsetPoly(outer, -inset, 3);
    line = densifyLine(line, step / 4, true);
    var acc = 0;
    for (var i = 1; i < line.length; i++) {
      acc += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
      if (acc >= step) { acc = 0; var s = lerp(e.size[0], e.size[1], R()); place(e, line[i][0] + (R() - 0.5) * 0.15 * w, line[i][1] + (R() - 0.5) * 0.15 * w, s, true); }
    }
  });
  // ---- drifts: species territories (weight ≈ share of plant count)
  var avgW = 0, wsum = 0; E.forEach(function (e) { if (e.weight) { avgW += e.w * e.weight; wsum += e.weight; } }); avgW = wsum ? avgW / wsum : 3;
  var driftD = o.drift || avgW * 2.6, seeds = [], areaW = E.map(function (e) { return e.weight * e.w * e.w; }), aw = areaW.reduce(function (a, b) { return a + b; }, 0);
  function wpick() { var t = R() * aw; for (var i = 0; i < E.length; i++) { t -= areaW[i]; if (t <= 0 && E[i].weight) return E[i]; } return E[0]; }
  function cpick() { var t = R() * wsum; for (var i = 0; i < E.length; i++) { if (!E[i].weight) continue; t -= E[i].weight; if (t <= 0) return E[i]; } return E[0]; }
  for (var x = bb[0] - driftD; x <= bb[2] + driftD; x += driftD) for (var z = bb[1] - driftD; z <= bb[3] + driftD; z += driftD * 0.87) seeds.push([x + (R() - 0.5) * driftD, z + (R() - 0.5) * driftD, wpick()]);
  function speciesAt(x, z) {
    if (R() < o.mix) return cpick();
    var best = null, bd = 1e9;
    for (var i = 0; i < seeds.length; i++) { var d = (seeds[i][0] - x) * (seeds[i][0] - x) + (seeds[i][1] - z) * (seeds[i][1] - z); if (d < bd) { bd = d; best = seeds[i][2]; } }
    return best;
  }
  // ---- fill: random darts, biggest-first acceptance by drift
  if (wsum > 0) {
    var area = Math.abs(polyArea(outer)), minW = 1e9; E.forEach(function (e) { if (e.weight) minW = Math.min(minW, e.w * e.size[0]); });
    var tries = clamp(Math.round(area / (minW * minW) * 14), 400, 90000), fails = 0;
    for (var t = 0; t < tries && placed.length < o.maxCount; t++) {
      var px = lerp(bb[0], bb[2], R()), pz = lerp(bb[1], bb[3], R());
      var e = speciesAt(px, pz);
      if (!e || !e.weight) continue;
      if (!place(e, px, pz, lerp(e.size[0], e.size[1], R()) * (o.density === undefined ? 1 : 1))) fails++;
    }
  }
  // ---- build instanced meshes
  var group = new THREE.Group(), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), qt = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color(), UPV = new THREE.Vector3(0, 1, 0), counts = {};
  group.name = 'scatter';
  var contactList = [];
  E.forEach(function (e) {
    if (!e.list.length) return;
    counts[e.kind] = (counts[e.kind] || 0) + e.list.length;
    var nv = Math.max(1, Math.min(o.variants, e.list.length));
    for (var v = 0; v < nv; v++) {
      var sub = e.list.filter(function (p, k) { return k % nv === v; }); if (!sub.length) continue;
      var vo = {}; for (var k in e.opts) vo[k] = e.opts[k];
      vo.seed = (e.opts.seed || 1) + v * 7919 + (o.variantSeed || 0);
      var geos = kindGeometries(e.kind, vo);
      var cx = 0, cz = 0, cy = 0; sub.forEach(function (p) { p.y = o.heightAt ? o.heightAt(p.x, p.z) : 0; cx += p.x; cz += p.z; cy += p.y; });
      cx /= sub.length; cz /= sub.length; cy /= sub.length;
      for (var part in geos) {
        var g = geos[part]; if (!g.boundingSphere) g.computeBoundingSphere();
        var gr = g.boundingSphere.radius + g.boundingSphere.center.length(), rad = 0;
        sub.forEach(function (p) { rad = Math.max(rad, Math.hypot(p.x - cx, p.y - cy, p.z - cz) + gr * p.s * 1.15); });
        var mesh = new THREE.InstancedMesh(proxyGeometry(g, new THREE.Sphere(new THREE.Vector3(cx, cy, cz), rad)), LAND.mat(part), sub.length);
        var R2 = rng(seedOf(o.seed, e.kind + part + v));
        sub.forEach(function (p, idx) {
          var n = slopeNormal(o.heightAt, p.x, p.z, Math.max(0.3, p.r * 0.5)), sink = (1 - n[1]) * p.r * 0.6 + (e.plant ? 0.02 : 0);
          var Rs = rng(seedOf((p.x * 1000) | 0, (p.z * 1000) | 0));
          pos.set(p.x, p.y - sink, p.z);
          q.setFromAxisAngle(UPV, p.ry);
          if (e.plant && o.tilt) { qt.setFromEuler(new THREE.Euler((Rs() - 0.5) * 2 * o.tilt, 0, (Rs() - 0.5) * 2 * o.tilt)); q.premultiply(qt); }
          var j = o.sizeJitter;
          scl.set(p.s * (1 + (Rs() - 0.5) * 2 * j), p.s * (1 + (Rs() - 0.5) * 2 * j * 1.3), p.s * (1 + (Rs() - 0.5) * 2 * j));
          mtx.compose(pos, q, scl);
          mesh.setMatrixAt(idx, mtx);
          var c = jit([1, 1, 1], Rs, e.plant ? 0.09 : 0.06, e.plant ? 0.07 : 0.02);
          col.setRGB(c[0], c[1], c[2]); mesh.setColorAt(idx, col);
        });
        mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        var mat = mesh.material;
        mesh.castShadow = o.shadows && !NOSHADOW[part] && !(mat.transparent && mat.opacity < 0.95);
        mesh.receiveShadow = !NORECEIVE[part];
        if (DEPTHMAT[part]) mesh.customDepthMaterial = depthMaterial(part);
        mesh.name = e.kind + ':' + part + (nv > 1 ? ':' + v : '');
        group.add(mesh);
      }
      if (o.contact && e.plant) sub.forEach(function (p) { contactList.push(p); });
    }
  });
  if (contactList.length) {
    var cg = new THREE.PlaneGeometry(1, 1); cg.rotateX(-HALF);
    var cxs = 0, czs = 0; contactList.forEach(function (p) { cxs += p.x; czs += p.z; }); cxs /= contactList.length; czs /= contactList.length;
    var crad = 0; contactList.forEach(function (p) { crad = Math.max(crad, Math.hypot(p.x - cxs, p.z - czs) + p.r * 1.5); });
    cg.boundingSphere = new THREE.Sphere(new THREE.Vector3(cxs, o.heightAt ? o.heightAt(cxs, czs) : 0, czs), crad + 10);
    var cm = new THREE.InstancedMesh(cg, LAND.mat('contact'), contactList.length);
    contactList.forEach(function (p, i) {
      var n = slopeNormal(o.heightAt, p.x, p.z, Math.max(0.3, p.r * 0.5));
      q.setFromUnitVectors(UPV, new THREE.Vector3(n[0], n[1], n[2]));
      pos.set(p.x, (p.y || 0) + 0.03, p.z); scl.set(p.e.w * p.s * 1.15, 1, p.e.d * p.s * 1.15);
      mtx.compose(pos, q, scl); cm.setMatrixAt(i, mtx);
    });
    cm.instanceMatrix.needsUpdate = true; cm.castShadow = false; cm.receiveShadow = false; cm.renderOrder = 1; cm.name = 'contactShadows';
    group.add(cm);
  }
  group.userData = {
    placements: placed.map(function (p) { return { kind: p.e.kind, x: p.x, z: p.z, y: p.y || 0, scale: p.s, ry: p.ry, r: p.r }; }),
    counts: counts, count: placed.length
  };
  return group;
};
/* ================================================================== CONCEPT PALETTES (ready for LAND.scatter)
   weight ≈ relative plant count; size = scale range on the mature size. Mix in boulders for gravel / native gardens. */
LAND.palettes = {
  mediterranean: [
    { kind: 'lavender', weight: 5, size: [0.85, 1.1] },
    { kind: 'salviaLeucantha', weight: 2, size: [0.8, 1.05] },
    { kind: 'salviaGreggii', weight: 2, size: [0.8, 1.0], opts: { color: 'coral' } },
    { kind: 'rosemary', weight: 1, size: [0.7, 0.9] },
    { kind: 'blueOatGrass', weight: 3, size: [0.8, 1.1] },
    { kind: 'pinkMuhly', weight: 1, size: [0.8, 1.0] },
    { kind: 'boulder', weight: 0.4, size: [0.4, 0.8], opts: { res: 4 } }
  ],
  native: [
    { kind: 'manzanita', weight: 2, size: [0.75, 1.0] },
    { kind: 'ceanothus', weight: 2, size: [0.7, 0.9] },
    { kind: 'toyon', weight: 0.6, size: [0.7, 0.85] },
    { kind: 'coffeeberry', weight: 1.2, size: [0.75, 0.95] },
    { kind: 'salviaClevelandii', weight: 2, size: [0.8, 1.0] },
    { kind: 'stickyMonkeyFlower', weight: 2, size: [0.8, 1.0] },
    { kind: 'deerGrass', weight: 3, size: [0.8, 1.05] },
    { kind: 'buckwheat', weight: 3, size: [0.8, 1.05] },
    { kind: 'californiaFuchsia', weight: 3, size: [0.8, 1.0] },
    { kind: 'yarrow', weight: 2, size: [0.8, 1.0] },
    { kind: 'poppy', weight: 6, size: [0.9, 1.2] }
  ],
  traditional: [
    { kind: 'azalea', weight: 4, size: [0.75, 1.0], opts: { color: 'pink' } },
    { kind: 'azalea', weight: 2, size: [0.75, 1.0], opts: { color: 'white', seed: 2 } },
    { kind: 'rhododendron', weight: 1, size: [0.8, 1.0] },
    { kind: 'camellia', weight: 0.8, size: [0.8, 1.0] },
    { kind: 'hydrangea', weight: 2, size: [0.75, 0.9] },
    { kind: 'boxwood', weight: 3, size: [0.7, 0.9] },
    { kind: 'agapanthus', weight: 2, size: [0.9, 1.0] },
    { kind: 'berkeleySedge', weight: 2, size: [0.8, 1.1] }
  ],
  desert: [
    { kind: 'agave', weight: 1, size: [0.55, 0.7], opts: { variety: 'americana' } },
    { kind: 'agave', weight: 2, size: [0.8, 1.0], opts: { variety: 'parryi' } },
    { kind: 'aloe', weight: 2, size: [0.8, 1.0] },
    { kind: 'hesperaloe', weight: 4, size: [0.8, 1.0] },
    { kind: 'blueFescue', weight: 3, size: [0.9, 1.1] },
    { kind: 'salviaGreggii', weight: 2, size: [0.8, 0.9], opts: { color: 'red' } },
    { kind: 'boulder', weight: 0.7, size: [0.5, 0.9], opts: { type: 'basalt', res: 4, style: 'angular' } }
  ]
};
LAND.concepts = { mediterranean: 'Mediterranean gravel garden', native: 'California native', traditional: 'Traditional irrigated garden', desert: 'Desert accents' };
/* ================================================================== CONCEPT KINDS (118 Hillside landscape concepts, v18)
   Extra species and site pieces used by the three concept plans in 87_concepts_plans.js:
   oak-woodland understory (Douglas iris, hummingbird sage, foothill sedge, island alum root), Mediterranean shrubs
   (westringia, dwarf olive, germander), edibles for raised beds (tomato, kale, lettuce), and hardscape (path light,
   stepping stone, log round, glazed pot).  Same conventions as 31_plants.js: feet, origin = base centre, front +z. */

/* ---- materials used only by these kinds */
MATDEF.lampGlow = function () { return std({ color: 0xfff1d8, emissive: 0xffc98a, emissiveIntensity: 0, roughness: 0.4 }); };
MATDEF.bronze = function () { return std({ color: 0x3b3128, roughness: 0.45, metalness: 0.6 }); };
MATDEF.logBark = function () { return std({ color: 0x5e5246, roughness: 0.95, metalness: 0, vertexColors: true }); };
MATDEF.logEnd = function () { return std({ color: 0xb59a76, roughness: 0.9, metalness: 0, vertexColors: true }); };
MATDEF.glazedPot = function () { return std({ color: 0x5f6f73, roughness: 0.28, metalness: 0.05 }); };
MATDEF.terracotta = function () { return std({ color: 0xb4734f, roughness: 0.85, metalness: 0 }); };
MATDEF.stepStone = function () { return std({ color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors: true }); };
NOSHADOW.lampGlow = 1; NORECEIVE.lampGlow = 1;
// night switch for concept lighting (lamps glow only when on); returns LAND
LAND.setNight = function (on, level) { var m = LAND.mat('lampGlow'); m.emissiveIntensity = on ? (level || 2.4) : 0; return LAND; };

/* ---- extra metadata the concept rules read (fire / deer / sun / water), keyed by kind.  fire: low | moderate | high fuel
   (CAL FIRE / Woodside FPD plant guidance, simplified); water: none (no summer water once established) | low | moderate | regular;
   sun: sun | part | shade (what the plant tolerates); deer: resistant | moderate | browsed. */
var CONCEPT_META = {
  douglasIris: { fire: 'low', water: 'none', sun: 'part,shade', deer: 'resistant' },
  hummingbirdSage: { fire: 'low', water: 'none', sun: 'part,shade', deer: 'resistant' },
  foothillSedge: { fire: 'low', water: 'low', sun: 'sun,part,shade', deer: 'resistant' },
  coralBells: { fire: 'low', water: 'low', sun: 'part,shade', deer: 'moderate' },
  westringia: { fire: 'low', water: 'low', sun: 'sun,part', deer: 'resistant' },
  dwarfOlive: { fire: 'moderate', water: 'low', sun: 'sun', deer: 'resistant' },
  germander: { fire: 'low', water: 'low', sun: 'sun', deer: 'resistant' },
  tomato: { fire: 'low', water: 'regular', sun: 'sun', deer: 'browsed' },
  kale: { fire: 'low', water: 'regular', sun: 'sun,part', deer: 'browsed' },
  lettuce: { fire: 'low', water: 'regular', sun: 'sun,part', deer: 'browsed' },
  // existing library kinds
  agave: { fire: 'low', water: 'low', sun: 'sun,part', deer: 'resistant' },
  manzanita: { fire: 'moderate', water: 'none', sun: 'sun,part', deer: 'resistant' },
  ceanothus: { fire: 'moderate', water: 'none', sun: 'sun,part', deer: 'moderate' },
  toyon: { fire: 'moderate', water: 'none', sun: 'sun,part,shade', deer: 'moderate' },
  coffeeberry: { fire: 'low', water: 'none', sun: 'sun,part,shade', deer: 'resistant' },
  californiaFuchsia: { fire: 'low', water: 'none', sun: 'sun', deer: 'resistant' },
  buckwheat: { fire: 'high', water: 'none', sun: 'sun', deer: 'resistant' },
  yarrow: { fire: 'low', water: 'low', sun: 'sun,part', deer: 'resistant' },
  poppy: { fire: 'low', water: 'none', sun: 'sun', deer: 'resistant' },
  stickyMonkeyFlower: { fire: 'moderate', water: 'none', sun: 'sun,part', deer: 'resistant' },
  salviaClevelandii: { fire: 'moderate', water: 'none', sun: 'sun', deer: 'resistant' },
  salviaLeucantha: { fire: 'low', water: 'low', sun: 'sun', deer: 'resistant' },
  salviaGreggii: { fire: 'low', water: 'low', sun: 'sun,part', deer: 'resistant' },
  lavender: { fire: 'moderate', water: 'low', sun: 'sun', deer: 'resistant' },
  rosemary: { fire: 'high', water: 'low', sun: 'sun', deer: 'resistant' },
  deerGrass: { fire: 'moderate', water: 'none', sun: 'sun,part', deer: 'resistant' },
  blueFescue: { fire: 'low', water: 'low', sun: 'sun,part', deer: 'resistant' },
  blueOatGrass: { fire: 'moderate', water: 'low', sun: 'sun', deer: 'resistant' },
  lomandra: { fire: 'low', water: 'low', sun: 'sun,part,shade', deer: 'resistant' },
  berkeleySedge: { fire: 'low', water: 'moderate', sun: 'part,shade', deer: 'resistant' },
  agapanthus: { fire: 'low', water: 'moderate', sun: 'sun,part', deer: 'resistant' },
  boxwood: { fire: 'moderate', water: 'moderate', sun: 'sun,part,shade', deer: 'resistant' },
  featherReedGrass: { fire: 'moderate', water: 'moderate', sun: 'sun,part', deer: 'resistant' },
  olive: { fire: 'moderate', water: 'low', sun: 'sun', deer: 'resistant' },
  westernRedbud: { fire: 'low', water: 'none', sun: 'sun,part', deer: 'moderate' },
  manzanitaTree: { fire: 'moderate', water: 'none', sun: 'sun', deer: 'resistant' },
  japaneseMaple: { fire: 'low', water: 'regular', sun: 'part', deer: 'browsed' }
};
LAND.conceptMeta = CONCEPT_META;

/* ---------------------------------------------------------------- oak-woodland understory */
defGrass('douglasIris', { latin: 'Iris douglasiana (Pacific Coast iris)', common: 'Douglas iris', concept: ['native'], mature: '1–1.5 ft h × 2 ft w', water: 'none',
  bloom: { seasons: ['spring'], color: 'lavender-violet flags (Mar–May)' } },
  { w: 2, h: 1.4 }, function (o) { return { blades: 70, width: 0.075, spread: 0.13, tilt: 0.55, tilt0: 0.08, arch: 0.65, segs: 4, base: '#3d5530', mid: '#587545', tip: '#7c935c',
    plume: { cell: 'cup', tint: ['#8a72c8', '#7d64bd', '#a08ad6', '#e9e1f4'], n: 16, size: 0.32, stretch: 1.0, stalkLen: o.h * 0.75, stalk: '#5c7448', stalkW: 0.018, upright: 0.7, face: 0.5 } }; },
  'Clump of arching strap leaves with lavender-violet iris flags in spring; dry shade under oaks.');

defShrub('hummingbirdSage', 'perennial', { latin: 'Salvia spathacea', common: 'Hummingbird sage', concept: ['native'], mature: '1.5–2.5 ft h × 3 ft w (spreads)', water: 'none',
  bloom: { seasons: ['spring', 'summer'], color: 'magenta whorls on stout stalks (Mar–Jun)' } },
  { w: 3, h: 2.2 }, function (o) {
    var fh = o.h * 0.45;
    return { shape: 'mound', lump: 0.3, h: fh, lobes: 4, lobeSize: 0.45,
      leaf: { cell: 'large', tints: ['#7f9a5e', '#8ca66a', '#728d53'], size: 0.62, n: 130, shell: 0.55, up: 0.35, out: 0.9 },
      core: { scale: 0.55, tint: '#465c32' },
      flowers: [{ where: 'above', cell: 'spike', tint: ['#b8346a', '#c9427a', '#a52a5c'], n: 14, size: 0.2, stretch: 2.2, stalkLen: (o.h - fh) * 0.9, stalk: '#7a6a52', stalkW: 0.03, upright: 0.85, minY: 0.2 }] };
  }, 'Low patch of big, soft, fruity-scented leaves with magenta flower whorls on stalks; thrives in dry oak shade.');

defGrass('foothillSedge', { latin: 'Carex tumulicola', common: 'Foothill sedge', concept: ['native'], mature: '1–1.5 ft h × 1.5–2 ft w', water: 'low',
  bloom: null },
  { w: 1.8, h: 1.3 }, function () { return { blades: 210, width: 0.034, spread: 0.1, tilt: 0.9, tilt0: 0.1, arch: 0.9, base: '#3a5230', mid: '#5f7a45', tip: '#8f9c62' }; },
  'Fine, arching native sedge; a soft, unmown groundcover for oak shade.');

defShrub('coralBells', 'perennial', { latin: 'Heuchera maxima', common: 'Island alum root', concept: ['native'], mature: '1–1.5 ft h (stalks 2.5 ft) × 2 ft w', water: 'low',
  bloom: { seasons: ['winter', 'spring'], color: 'airy white-pink sprays (Feb–May)' } },
  { w: 2, h: 2.4 }, function (o) {
    var fh = o.h * 0.42;
    return { shape: 'mound', lump: 0.25, h: fh, lobes: 3,
      leaf: { cell: 'round', tints: ['#4f6e3e', '#5b7b48', '#45613a'], size: 0.5, n: 120, shell: 0.6, up: 0.5 },
      core: { scale: 0.5, tint: '#2e4226' },
      flowers: [{ where: 'above', cell: 'umbel', tint: ['#f1dfe0', '#ead0d4', '#f6ecec'], n: 16, size: 0.26, stretch: 1.4, stalkLen: (o.h - fh) * 0.95, stalk: '#6a4e46', stalkW: 0.012, upright: 0.9 }] };
  }, 'Mounds of round scalloped leaves with tall airy sprays of tiny pale flowers.');

/* ---------------------------------------------------------------- Mediterranean shrubs */
defShrub('westringia', 'shrub', { latin: 'Westringia fruticosa ‘Grey Box’', common: 'Coast rosemary', concept: ['mediterranean'], mature: '2–3 ft h × 3 ft w', water: 'low',
  bloom: { seasons: ['winter', 'spring', 'summer', 'fall'], color: 'small white flowers, most of the year' } },
  { w: 3, h: 2.6 }, function () {
    return { shape: 'dome', lump: 0.1, lobes: 2, lobeSize: 0.4,
      leaf: { cell: 'needle', tints: ['#aab6a1', '#b9c3af', '#9eab95'], size: 0.4, n: 340, shell: 0.65, up: 0.55 },
      core: { scale: 0.82, tint: '#7d8a74' },
      flowers: [{ where: 'surface', cell: 'small', tint: ['#f3f2ee', '#ebeae4'], n: 60, size: 0.16 }] };
  }, 'Tidy grey-green dome (clips like boxwood, but deer- and drought-tolerant); dots of white flowers.');

defShrub('dwarfOlive', 'shrub', { latin: 'Olea europaea ‘Montra’ (Little Ollie)', common: 'Dwarf olive', concept: ['mediterranean'], mature: '4–6 ft h × 4–6 ft w', water: 'low',
  bloom: null },
  { w: 4.5, h: 4.5 }, function () {
    return { shape: 'dome', lump: 0.14, lobes: 3, lobeSize: 0.45,
      leaf: { cell: 'lance', tints: ['#7f8f6c', '#909f7d', '#a7b294'], size: 0.48, n: 380, shell: 0.6, up: 0.4 },
      core: { scale: 0.78, tint: '#4b5640' },
      stems: { n: 6, rad: 0.05, col: '#8a8476', minY: 0.3, reach: 0.6 } };
  }, 'Fruitless dwarf olive: a dense, silvery evergreen globe; no pruning to keep it 4–5 ft.');

defShrub('germander', 'perennial', { latin: 'Teucrium × lucidrys', common: 'Germander', concept: ['mediterranean'], mature: '1–1.5 ft h × 2 ft w', water: 'low',
  bloom: { seasons: ['summer'], color: 'rose-purple spikes (Jun–Aug)' } },
  { w: 2, h: 1.3 }, function () {
    return { shape: 'dome', lump: 0.12,
      leaf: { cell: 'small', tints: ['#3f5a32', '#4a673a', '#36502c'], size: 0.3, n: 260, shell: 0.6 },
      core: { scale: 0.8, tint: '#263a1e' },
      flowers: [{ where: 'tips', cell: 'spike', tint: ['#b06a9a', '#c07aa8'], n: 40, size: 0.14, stretch: 1.6, upright: 0.85, minY: 0.3 }] };
  }, 'Low glossy dark-green edging plant (a deer-proof boxwood substitute) with rose-purple summer spikes.');

/* ---------------------------------------------------------------- edibles (raised beds) */
defShrub('tomato', 'edible', { latin: 'Solanum lycopersicum (caged)', common: 'Tomato', concept: ['family'], mature: '4–5 ft h × 2 ft w (in a cage)', water: 'regular',
  bloom: { seasons: ['summer', 'fall'], color: 'red fruit (Jul–Oct)' } },
  { w: 2, h: 4.5 }, function () {
    return { shape: 'upright', lump: 0.3, lobes: 3,
      leaf: { cell: 'palmate', tints: ['#4c7a33', '#5a8a3c', '#43702c'], size: 0.42, n: 230, shell: 0.5, up: 0.3 },
      core: { scale: 0.6, tint: '#2c4a1e' },
      flowers: [{ where: 'surface', cell: 'berry', tint: ['#d23a22', '#e0502a', '#c22e1c', '#e7a13a'], n: 26, size: 0.36 }],
      after: function (m, env, R) {   // galvanised cage: 3 rings + 4 legs
        var col = [0.55, 0.56, 0.56], rr = [0.55, 0.75, 0.95], H = env.h;
        for (var k = 0; k < 4; k++) { var a = k / 4 * TAU + 0.4; tubeM(m, [[Math.cos(a) * 0.5, -0.3, Math.sin(a) * 0.5], [Math.cos(a) * 0.95, H * 0.95, Math.sin(a) * 0.95]], [0.012, 0.012], 4, function () { return col; }, 'solid'); }
        rr.forEach(function (r, i) { var pts = []; for (var j = 0; j <= 12; j++) { var b2 = j / 12 * TAU; pts.push([Math.cos(b2) * r, H * (0.3 + i * 0.3), Math.sin(b2) * r]); } tubeM(m, pts, pts.map(function () { return 0.01; }), 3, function () { return col; }, 'solid'); });
      } };
  }, 'Caged tomato plant with ripening fruit.');

defShrub('kale', 'edible', { latin: 'Brassica oleracea (Lacinato kale)', common: 'Kale', concept: ['family'], mature: '2–3 ft h × 2 ft w', water: 'regular', bloom: null },
  { w: 1.8, h: 2.2 }, function () {
    return { shape: 'vase', lump: 0.15,
      leaf: { cell: 'lance', tints: ['#3f5e4c', '#48685a', '#365246'], size: 0.85, n: 60, shell: 0.6, up: 0.85, out: 0.6 },
      core: { scale: 0.4, tint: '#2f4a3a' } };
  }, 'Upright rosette of long blue-green crinkled leaves.');

defShrub('lettuce', 'edible', { latin: 'Lactuca sativa', common: 'Lettuce', concept: ['family'], mature: '0.6 ft h × 1 ft w', water: 'regular', bloom: null },
  { w: 1.0, h: 0.6 }, function () {
    return { shape: 'dome', lump: 0.1, lobes: 0,
      leaf: { cell: 'broad', tints: ['#86b04a', '#9cc257', '#7aa340', '#a0443a'], size: 0.42, n: 50, shell: 0.75, up: 0.7 },
      core: { scale: 0.7, tint: '#6f9a3a' } };
  }, 'Loose-leaf lettuce head (green and red).');

/* ---------------------------------------------------------------- site pieces */
// low bronze path light: 18" post, hood, warm lens (glows only after LAND.setNight(true))
def('pathLight', 'hardscape', { h: 1.6, seed: 1 }, function (b, o) {
  b.cyl('bronze', 0.05, 0.06, o.h - 0.15, 0, (o.h - 0.15) / 2 - 0.25, 0, 8);
  b.cyl('lampGlow', 0.11, 0.09, 0.12, 0, o.h - 0.16, 0, 10);
  b.cyl('bronze', 0.03, 0.2, 0.09, 0, o.h - 0.05, 0, 12);
  b.cyl('bronze', 0.02, 0.02, 0.02, 0, o.h + 0.0, 0, 6);
}, function (o) { return [0.4, 0.4, o.h]; }, 'Low-voltage bronze path light (lens glows at night).', HARD({ common: 'Path light' }));

// in-ground uplight well for the oak (round bronze rim with a glowing lens)
def('uplight', 'hardscape', { seed: 1 }, function (b) {
  b.cyl('bronze', 0.32, 0.34, 0.12, 0, 0.02, 0, 14);
  b.cyl('lampGlow', 0.24, 0.24, 0.02, 0, 0.085, 0, 14);
}, function () { return [0.7, 0.7, 0.1]; }, 'Flush in-grade uplight (lens glows at night).', HARD({ common: 'Uplight' }));

// irregular flat stepping stone (Sierra / bluestone flag), set on grade
def('steppingStone', 'hardscape', { w: 2.2, d: 1.8, t: 0.16, stone: 'buff', seed: 1 }, function (b, o) {
  var R = rng(seedOf(o.seed, 'step')), n = 9, sh = new THREE.Shape(), cols = (STONECOL[o.stone] || STONECOL.buff).map(hexLin), c0 = cols[(R() * cols.length) | 0];
  for (var i = 0; i < n; i++) { var a = i / n * TAU + (R() - 0.5) * 0.35, r = 0.82 + 0.18 * R(); var x = Math.cos(a) * o.w / 2 * r, z = Math.sin(a) * o.d / 2 * r; if (i) sh.lineTo(x, z); else sh.moveTo(x, z); }
  var g = new THREE.ExtrudeGeometry(sh, { depth: o.t, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(HALF); g.translate(0, 0.05, 0);   // top face at y = 0.05 + bevel (stone stands ~1" proud of the mulch)
  var p = g.attributes.position, ca = new Float32Array(p.count * 3);
  for (i = 0; i < p.count; i++) { var v = 1 + 0.1 * vnoise3(p.getX(i) * 1.7, 0.3, p.getZ(i) * 1.7, o.seed); ca[i * 3] = c0[0] * v; ca[i * 3 + 1] = c0[1] * v; ca[i * 3 + 2] = c0[2] * v; }
  g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  if (g.index) g = g.toNonIndexed(); g.computeVertexNormals(); faceUV(g);
  b.add('stepStone', g, null, { keepUV: true });
}, function (o) { return [o.w, o.d, 0.2]; }, 'Irregular flagstone stepper set on grade (no excavation: oak-root friendly).', HARD({ common: 'Stepping stone', place: 'level' }));

// log round (play stepper / stool): bark side + sawn end with rings
def('logRound', 'feature', { r: 0.6, h: 1.2, seed: 1 }, function (b, o) {
  var R = rng(seedOf(o.seed, 'log')), g = new THREE.CylinderGeometry(o.r, o.r * 1.04, o.h + 0.2, 14, 3, true), p = g.attributes.position, ca = new Float32Array(p.count * 3);
  for (var i = 0; i < p.count; i++) { var a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.05 * Math.sin(a * 7 + o.seed) + 0.03 * (R() - 0.5); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    var v = 0.85 + 0.25 * vnoise3(Math.cos(a) * 3, p.getY(i) * 2, Math.sin(a) * 3, o.seed); ca[i * 3] = v; ca[i * 3 + 1] = v * 0.97; ca[i * 3 + 2] = v * 0.93; }
  g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); g.computeVertexNormals();
  b.add('logBark', g, M(0, (o.h - 0.2) / 2, 0), { keepUV: true });
  var top = new THREE.CircleGeometry(o.r * 1.0, 14), tp = top.attributes.position, tc = new Float32Array(tp.count * 3);
  for (i = 0; i < tp.count; i++) { var d = Math.hypot(tp.getX(i), tp.getY(i)) / o.r, ring = 0.88 + 0.12 * Math.cos(d * 26), edge = d > 0.92 ? 0.6 : 1; tc[i * 3] = ring * edge; tc[i * 3 + 1] = ring * edge * 0.95; tc[i * 3 + 2] = ring * edge * 0.88; }
  top.setAttribute('color', new THREE.BufferAttribute(tc, 3)); top.rotateX(-HALF);
  b.add('logEnd', top, M(0, o.h, 0), { keepUV: true });
}, function (o) { return [o.r * 2, o.r * 2, o.h]; }, 'Sawn log round (natural play stepper / stool).', FEAT({ common: 'Log round', place: 'sink' }));

// large glazed or terracotta pot with soil top (plant into it via userData.bedWorld)
def('gardenPot', 'hardscape', { dia: 2.4, h: 2.2, finish: 'glazedPot', seed: 1 }, function (b, o) {
  var r = o.dia / 2, pts = [[0.001, 0], [r * 0.72, 0], [r * 0.86, h4(0.15)], [r * 0.98, h4(0.55)], [r, h4(0.92)], [r * 1.04, h4(0.95)], [r * 1.04, o.h], [r * 0.93, o.h], [r * 0.93, o.h - 0.15]];
  function h4(t) { return o.h * t; }
  b.lathe(o.finish, pts, 28, 0, 0, 0);
  var s = new THREE.CircleGeometry(r * 0.93, 24); s.rotateX(-HALF); b.add('soil', s, M(0, o.h - 0.15, 0), { keepUV: true });
  b.info = { bed: (function () { var q = []; for (var i = 0; i < 12; i++) { var a = i / 12 * TAU; q.push([Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85]); } return q; })(), bedY: o.h - 0.15 };
}, function (o) { return [o.dia * 1.04, o.dia * 1.04, o.h]; }, 'Large glazed (or terracotta) pot; userData.bedWorld/bedY give the soil circle.', HARD({ common: 'Garden pot' }));
/* ================================================================== LANDSCAPE CONCEPT PLANS (118 Hillside Dr, Woodside — v18)
   Three buildable concepts for the front and back yards plus add-ons (gas fire bowl, hot tub, boulder outcrop, garden lighting).
   Everything is written in the BIM plan frame (feet; x = plan east, y = plan north); the page passes `toWorld(x, y) → [wx, wz]`.

   How a yard is planted (rules, not one-off placements):
     1. Each concept names its beds (polygons drawn on the site plan), the layering edge of each bed (fence = back, so tall
        plants go to the back and low plants to the viewing edge), and per layer two species lists: `open` (outside any oak
        canopy: sun) and `canopy` (under an oak: dry shade).  Species sit on a triangular grid at their on-centre spacing
        (how a planting plan is specified), in single-species drifts along the bed.
     2. Every candidate plant then passes the SITE RULES below; plants that fail are simply not planted (the rules carve the
        beds), explicit specimens / hardscape that fail are reported as plan errors.
   SITE RULES (see LAND.conceptRules):
     house / paved   nothing on the house, decks or existing paving (pots excepted)
     zone0           no plants within 5 ft of the house (CA Zone 0 ember-resistant zone: gravel only)
     zone1-fuel      'high' fuel plants not within 30 ft of the house; 'moderate' fuel not within 10 ft
     oak-trunk       nothing new within 10 ft of an oak trunk (root crown; leave leaf litter)
     oak-water       inside an oak drip line only plants that need no or low summer water (no irrigation over oak roots)
     oak-ladder      inside an oak drip line no shrub taller than 3 ft (no ladder fuel under the canopy)
     oak-turf        no lawn inside an oak drip line
     sun             sun-only plants only outside the oak canopies
     stop            nothing taller than the viewer's eye within 2.5 ft of a tour viewpoint
     utility         3 ft clear around utility lids
     feature / path  plants stay off the fire-pit / hot-tub pads, the play area and walking paths
     fence / lot     plant centres stay inside the lot and off the fence line */

var CPL = {};
function cpCircle(c, r, n) { var p = []; n = n || 28; for (var i = 0; i < n; i++) { var a = i / n * TAU; p.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } return p; }
function cpEllipse(c, rx, ry, rot, n) { var p = [], cs = Math.cos(rot || 0), sn = Math.sin(rot || 0); n = n || 24; for (var i = 0; i < n; i++) { var a = i / n * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; p.push([c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]); } return p; }
function cpLineDist(pts, x, y) {   // distance to a polyline + arc-length parameter of the closest point
  var best = 1e9, s = 0, acc = 0;
  for (var i = 0; i < pts.length - 1; i++) {
    var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9, t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (L * L), 0, 1);
    var d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y); if (d < best) { best = d; s = acc + t * L; }
    acc += L;
  }
  return { d: best, s: s, len: acc };
}
function cpPolyDist(poly, x, y) { return inPoly(poly, x, y) ? 0 : edgeDist(poly, x, y); }
function cpLattice(poly, oc, seed) {   // triangular grid at on-centre spacing, small jitter (nursery-crew accuracy)
  var bb = bbox(poly), R = rng(seedOf(seed, 'lat')), out = [], dy = oc * 0.866, row = 0, ox = R() * oc, oy = R() * dy;
  for (var y = bb[1] - oy; y <= bb[3] + dy; y += dy, row++) for (var x = bb[0] - ox + (row % 2 ? oc / 2 : 0); x <= bb[2] + oc; x += oc) {
    var px = x + (R() - 0.5) * oc * 0.24, py = y + (R() - 0.5) * oc * 0.24;
    if (inPoly(poly, px, py)) out.push([px, py, R()]);
  }
  return out;
}
function cpHash(a, b) { var h = Math.imul((a | 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul((b | 0) + 0x7f4a7c15, 2246822519); h ^= h >>> 15; return ((h >>> 0) % 100000) / 100000; }
function cpPick(list, u) { var t = 0, W = 0, wt = function (e) { return e.w === undefined ? 1 : e.w; }; list.forEach(function (e) { W += wt(e); }); u *= W; for (var i = 0; i < list.length; i++) { t += wt(list[i]); if (!wt(list[i])) continue; if (u <= t) return list[i]; } return list[list.length - 1]; }

/* ---------------------------------------------------------------- the rules */
LAND.conceptRules = function (ctx) {
  var M = LAND.conceptMeta, R = {};
  R.oakAt = function (x, y) {   // → {inDrip, trunk distance, oak}
    var res = { inDrip: false, dTrunk: 1e9, drip: 0 };
    ctx.oaks.forEach(function (o) { var d = Math.hypot(x - o.c[0], y - o.c[1]); if (d < res.dTrunk) res.dTrunk = d; if (d < o.drip) { res.inDrip = true; res.drip = o.drip; } });
    return res;
  };
  R.houseDist = function (x, y) { var d = 1e9; ctx.house.forEach(function (p) { d = Math.min(d, cpPolyDist(p, x, y)); }); return d; };
  // plant rule check → null (ok) or the rule name
  R.plant = function (kind, x, y, r, h, opt) {
    opt = opt || {};
    var meta = M[kind] || {}, K = KINDS[kind], tree = K && K.category === 'tree';
    if (!inPoly(ctx.lot, x, y)) return 'lot';
    for (var i = 0; i < ctx.fences.length; i++) if (cpLineDist(ctx.fences[i], x, y).d < Math.max(0.5, r * 0.45)) return 'fence';
    var hd = R.houseDist(x, y);
    if (hd <= 0.3) return 'house';
    if (!opt.onPaving) for (i = 0; i < ctx.paved.length; i++) if (cpPolyDist(ctx.paved[i], x, y) < Math.max(0.3, r * 0.35)) return 'paved';
    if (hd < 5 + r * 0.5) return 'zone0';
    if (meta.fire === 'high' && hd < 30) return 'zone1-fuel';
    if (meta.fire === 'moderate' && hd < 10) return 'zone1-fuel';
    var oak = R.oakAt(x, y);
    if (oak.dTrunk < 10 + (tree ? r * 0.5 : 0)) return 'oak-trunk';
    if (oak.inDrip) {
      if (meta.water === 'moderate' || meta.water === 'regular') return 'oak-water';
      if (!tree && h > 3.05) return 'oak-ladder';
      if (meta.sun && meta.sun.indexOf('part') < 0 && meta.sun.indexOf('shade') < 0) return 'sun';
    }
    for (i = 0; i < ctx.stops.length; i++) { var s = ctx.stops[i]; if (Math.hypot(x - s.at[0], y - s.at[1]) < 2.5 + (opt.canopyR || r * 0.6) && h > s.eye - 1.5) return 'stop'; }   // trees: the whole canopy stays clear of the viewer
    for (i = 0; i < ctx.utilities.length; i++) { var u = ctx.utilities[i]; if (Math.hypot(x - u.at[0], y - u.at[1]) < (u.clear || 3) + r * 0.5) return 'utility'; }
    for (i = 0; i < ctx.features.length; i++) if (cpPolyDist(ctx.features[i].pad, x, y) < r * 0.6 + 0.3) return 'feature';
    for (i = 0; i < (ctx.paths || []).length; i++) if (cpLineDist(ctx.paths[i].pts, x, y).d < ctx.paths[i].half + r * 0.6) return 'path';
    return null;
  };
  // hardscape / feature rule check (soft notes for drip-line encroachment)
  R.feature = function (pad, label) {
    var issues = [], notes = [], minTrunk = 1e9, enc = 0;
    pad.forEach(function (q) {
      var oak = R.oakAt(q[0], q[1]); minTrunk = Math.min(minTrunk, oak.dTrunk);
      if (oak.inDrip) enc = Math.max(enc, oak.drip - oak.dTrunk);
      if (R.houseDist(q[0], q[1]) < 5) issues.push(label + ': inside Zone 0');
      if (!inPoly(ctx.lot, q[0], q[1])) issues.push(label + ': outside the lot');
    });
    if (minTrunk < 10) issues.push(label + ': within 10 ft of an oak trunk');
    if (enc > 0.05) notes.push(label + ': edge reaches ' + enc.toFixed(1) + ' ft inside the estimated oak drip line (set on grade, no excavation; arborist to confirm)');
    return { issues: issues, notes: notes };
  };
  return R;
};

/* ---------------------------------------------------------------- planting engine */
// → {placements:[{kind,x,y,s,ry,opts}], rejected:{rule:n}}
function cpPlantBed(bed, ctx, rules, placed, seed) {
  var out = [], rej = {}, poly = bed.poly, pts0 = null, back = bed.back, dMax = 0, cen = [0, 0];
  poly.forEach(function (q) { cen[0] += q[0] / poly.length; cen[1] += q[1] / poly.length; });
  function depth(x, y) { return back === 'centre' ? Math.hypot(x - cen[0], y - cen[1]) : cpLineDist(back, x, y).d; }
  function along(x, y) { return back === 'centre' ? (Math.atan2(y - cen[1], x - cen[0]) + PI) * 6 : cpLineDist(back, x, y).s; }
  pts0 = cpLattice(poly, 1.5, seed); pts0.forEach(function (p) { dMax = Math.max(dMax, depth(p[0], p[1])); });
  if (back === 'centre') dMax = Math.max(dMax, 1);
  var drift = bed.drift || 7;
  bed.layers.forEach(function (L, li) {
    var lat = cpLattice(poly, L.oc, seed + li * 31);
    lat.forEach(function (p) {
      var t = depth(p[0], p[1]) / (dMax || 1); if (back === 'centre') t = 1 - t;   // islands: tall in the middle
      if (back === 'centre' ? (t < 1 - L.band[1] || t > 1 - L.band[0]) : (t < L.band[0] || t > L.band[1])) return;
      var oak = rules.oakAt(p[0], p[1]), list = oak.inDrip ? L.canopy : L.open;
      if (!list || !list.length) return;
      var di = Math.floor((along(p[0], p[1]) + cpHash(li, seed) * drift) / drift), sp = cpPick(list, cpHash(di * 7 + li, seed + 17));
      if (!sp || sp.kind === 'none') return;
      if (L.fill !== undefined && p[2] > L.fill) return;          // open planting: leave some lattice spots as mulch
      var sz = LAND.sizeOf(sp.kind, sp.opts || {}), s = lerp((sp.size || [0.85, 1.05])[0], (sp.size || [0.85, 1.05])[1], p[2]), r = Math.max(sz[0], sz[1]) * s / 2, h = sz[2] * s;
      var why = rules.plant(sp.kind, p[0], p[1], r, h);
      if (!why) for (var k = 0; k < placed.length; k++) { var q = placed[k]; if (Math.hypot(q.x - p[0], q.y - p[1]) < (q.r + r) * 0.72) { why = 'spacing'; break; } }
      if (why) { rej[why] = (rej[why] || 0) + 1; return; }
      var pl = { kind: sp.kind, x: p[0], y: p[1], s: s, r: r, h: h, ry: p[2] * TAU * 7, opts: sp.opts || {}, bed: bed.name };
      placed.push(pl); out.push(pl);
    });
  });
  return { placements: out, rejected: rej };
}
function cpRow(row, rules, placed, issues) {   // hedge / screen row along a polyline at on-centre spacing
  var out = [], L = cpLineDist(row.pts, row.pts[0][0], row.pts[0][1]).len, n = Math.max(1, Math.round(L / row.oc));
  for (var i = 0; i <= n; i++) {
    if (row.ends === false && (i === 0 || i === n)) continue;
    var t = i / n * L, acc = 0, p = null;
    for (var k = 0; k < row.pts.length - 1 && !p; k++) { var a = row.pts[k], b = row.pts[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (acc + l >= t - 1e-6) { var u = (t - acc) / (l || 1); p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; } acc += l; }
    var sz = LAND.sizeOf(row.kind, row.opts || {}), s = row.scale || 1, r = Math.max(sz[0], sz[1]) * s / 2, why = rules.plant(row.kind, p[0], p[1], r, sz[2] * s, row);
    if (why) { if (row.strict) issues.push(row.kind + ' row: ' + why); continue; }
    var pl = { kind: row.kind, x: p[0], y: p[1], s: s, r: r, h: sz[2] * s, ry: i * 1.7, opts: row.opts || {}, bed: row.name || 'row' }; placed.push(pl); out.push(pl);
  }
  return out;
}

// instanced meshes for a list of placements (one InstancedMesh per kind × part × variant) — same path as LAND.scatter
function cpInstances(list, ctx) {
  var group = new THREE.Group(), by = {}, mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), qt = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color(), UPV = new THREE.Vector3(0, 1, 0);
  list.forEach(function (p) { var key = p.kind + '|' + JSON.stringify(p.opts || {}); (by[key] = by[key] || []).push(p); });
  var contact = [];
  Object.keys(by).forEach(function (key) {
    var L = by[key], kind = L[0].kind, K = KINDS[kind], nv = L.length > 8 ? 2 : 1, plant = !!K.meta.latin;
    for (var v = 0; v < nv; v++) {
      var sub = L.filter(function (p, i) { return i % nv === v; }); if (!sub.length) continue;
      var vo = {}; for (var k in L[0].opts) vo[k] = L[0].opts[k];
      vo.seed = (vo.seed || 1) + v * 7919; if (plant) { if (vo.season === undefined) vo.season = ctx.season || null; if (vo.detail === undefined) vo.detail = ctx.detail || 1; }
      var geos = kindGeometries(kind, vo), cx = 0, cy = 0, cz = 0;
      sub.forEach(function (p) { var w = ctx.toWorld(p.x, p.y); p.wx = w[0]; p.wz = w[1]; p.wy = (p.yOverride !== undefined ? p.yOverride : ctx.heightAt(w[0], w[1])); cx += p.wx; cy += p.wy; cz += p.wz; });
      cx /= sub.length; cy /= sub.length; cz /= sub.length;
      for (var part in geos) {
        var g = geos[part]; if (!g.boundingSphere) g.computeBoundingSphere();
        var gr = g.boundingSphere.radius + g.boundingSphere.center.length(), rad = 0;
        sub.forEach(function (p) { rad = Math.max(rad, Math.hypot(p.wx - cx, p.wy - cy, p.wz - cz) + gr * p.s * 1.15); });
        var mesh = new THREE.InstancedMesh(proxyGeometry(g, new THREE.Sphere(new THREE.Vector3(cx, cy, cz), rad)), LAND.mat(part), sub.length);
        sub.forEach(function (p, i) {
          var Rs = rng(seedOf((p.x * 1000) | 0, (p.y * 1000) | 0));
          pos.set(p.wx, p.wy - (plant ? 0.04 : 0), p.wz); q.setFromAxisAngle(UPV, p.ry || 0);
          if (plant && K.category !== 'tree') { qt.setFromEuler(new THREE.Euler((Rs() - 0.5) * 0.08, 0, (Rs() - 0.5) * 0.08)); q.premultiply(qt); }
          scl.set(p.s * (1 + (Rs() - 0.5) * 0.1), p.s * (1 + (Rs() - 0.5) * 0.14), p.s * (1 + (Rs() - 0.5) * 0.1));
          mtx.compose(pos, q, scl); mesh.setMatrixAt(i, mtx);
          var c = plant ? jit([1, 1, 1], Rs, 0.08, 0.06) : [1, 1, 1]; col.setRGB(c[0], c[1], c[2]); mesh.setColorAt(i, col);
        });
        mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = !NOSHADOW[part]; mesh.receiveShadow = !NORECEIVE[part];
        if (DEPTHMAT[part]) mesh.customDepthMaterial = depthMaterial(part);
        mesh.name = kind + ':' + part; group.add(mesh);
      }
      if (plant) sub.forEach(function (p) { contact.push(p); });
    }
  });
  if (contact.length) {   // soft contact shadows under every plant
    var cg = new THREE.PlaneGeometry(1, 1); cg.rotateX(-HALF);
    var cm = new THREE.InstancedMesh(cg, LAND.mat('contact'), contact.length), sx = 0, sz2 = 0;
    contact.forEach(function (p) { sx += p.wx; sz2 += p.wz; }); sx /= contact.length; sz2 /= contact.length;
    var crad = 0; contact.forEach(function (p) { crad = Math.max(crad, Math.hypot(p.wx - sx, p.wz - sz2) + p.r * 1.6); });
    cg.boundingSphere = new THREE.Sphere(new THREE.Vector3(sx, ctx.heightAt(sx, sz2), sz2), crad + 10);
    contact.forEach(function (p, i) { pos.set(p.wx, p.wy + 0.03, p.wz); q.identity(); scl.set(p.r * 2.3, 1, p.r * 2.3); mtx.compose(pos, q, scl); cm.setMatrixAt(i, mtx); cm.setColorAt(i, col.setRGB(1, 1, 1)); });
    // every InstancedMesh carries instanceColor: three r128 reuses a program compiled with instanceColor for meshes without it (crash in shared-material passes)
    cm.instanceMatrix.needsUpdate = true; cm.instanceColor.needsUpdate = true; cm.castShadow = cm.receiveShadow = false; cm.renderOrder = 1; cm.name = 'contactShadows'; group.add(cm);
  }
  return group;
}

// merge every static (non-instanced) mesh of a group by material: dozens of Zone 0 rings / boulders / steppers → a few draw calls
function cpMerge(group) {
  group.updateMatrixWorld(true);
  var inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), buckets = {}, keep = [];
  group.traverse(function (o) {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry.attributes.normal) return;
    var key = o.material.uuid + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + o.renderOrder;
    var g = o.geometry.clone(), m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(m);
    (buckets[key] = buckets[key] || { list: [], src: o }).list.push(g); keep.push(o);
  });
  keep.forEach(function (o) { o.parent.remove(o); o.geometry.dispose(); });
  var out = new THREE.Group(); out.name = 'merged';
  for (var k in buckets) {
    var B = buckets[k], geo = B.list.length === 1 ? B.list[0] : mergeGeoms(B.list), mesh = new THREE.Mesh(geo, B.src.material);
    mesh.castShadow = B.src.castShadow; mesh.receiveShadow = B.src.receiveShadow; mesh.renderOrder = B.src.renderOrder; mesh.customDepthMaterial = B.src.customDepthMaterial; mesh.name = B.src.name;
    out.add(mesh);
  }
  // drop now-empty groups
  var empties = []; group.traverse(function (o) { if (o !== group && o.isGroup && !o.children.length) empties.push(o); }); empties.forEach(function (o) { o.parent.remove(o); });
  group.add(out);
  return group;
}

/* ---------------------------------------------------------------- species shorthands (mature size from LAND.kinds; oc = on-centre spacing, ft) */
var SP = {
  iris: { kind: 'douglasIris', size: [0.85, 1.1] }, hsage: { kind: 'hummingbirdSage', size: [0.85, 1.1] }, sedge: { kind: 'foothillSedge', size: [0.85, 1.1] },
  alum: { kind: 'coralBells', size: [0.85, 1.05] }, coffee: { kind: 'coffeeberry', size: [0.8, 0.95] }, yankee: { kind: 'ceanothus', size: [0.85, 1.0], opts: { habit: 'groundcover', w: 7, h: 2 } },
  fuchsia: { kind: 'californiaFuchsia', size: [0.8, 1.0] }, yarrow: { kind: 'yarrow', size: [0.8, 1.0] }, deer: { kind: 'deerGrass', size: [0.8, 0.95] },
  csage: { kind: 'salviaClevelandii', size: [0.75, 0.9] }, monkey: { kind: 'stickyMonkeyFlower', size: [0.8, 0.95] }, fescue: { kind: 'blueFescue', size: [0.9, 1.1] },
  carpet: { kind: 'manzanita', size: [0.85, 1.0], opts: { habit: 'groundcover', w: 6, h: 1.2 } }, poppy: { kind: 'poppy', size: [0.9, 1.2] },
  lav: { kind: 'lavender', size: [0.85, 1.05] }, westr: { kind: 'westringia', size: [0.85, 1.0] }, ollie: { kind: 'dwarfOlive', size: [0.85, 1.0] },
  germ: { kind: 'germander', size: [0.9, 1.05] }, leuc: { kind: 'salviaLeucantha', size: [0.75, 0.9] }, greggii: { kind: 'salviaGreggii', size: [0.85, 1.0], opts: { color: 'coral' } },
  oat: { kind: 'blueOatGrass', size: [0.85, 1.0] }, lomandra: { kind: 'lomandra', size: [0.85, 1.0] }, rosemary: { kind: 'rosemary', size: [0.8, 0.9], opts: { habit: 'prostrate', w: 5, h: 1.5 } },
  agap: { kind: 'agapanthus', size: [0.85, 1.0], opts: { color: 'white' } }, box: { kind: 'westringia', size: [0.75, 0.85] },
  toyon: { kind: 'toyon', size: [0.8, 0.9] }, foxtail: { kind: 'agave', size: [1, 1], opts: { variety: 'attenuata' } }
};
function sp(key, w) { var s = SP[key]; return { kind: s.kind, size: s.size, opts: s.opts, w: w === undefined ? 1 : w }; }

/* ---------------------------------------------------------------- shared site layout (BIM plan feet), from the survey + photos */
var SITE = {
  backStop: [-48.4, 28.5],
  // understory / border beds in the back yard (designed on the plan; the rules carve Zone 0, the oak trunk zone, terrace, pads)
  bed: {
    westFence: [[-56.2, -1.5], [-56.6, 21.5], [-51.2, 21.5], [-49.6, 15.5], [-50.2, 6], [-50.8, -1.5]],
    nwCorner: [[-56.6, 22.5], [-56.9, 34.6], [-51.5, 34.6], [-51.8, 29.5], [-53.2, 25.5], [-51.2, 22.5]],
    northFence: [[-46.5, 35.0], [-9.0, 34.3], [-9.0, 30.2], [-15.5, 28.6], [-24.0, 29.6], [-33.0, 30.2], [-40.5, 30.6], [-45.5, 31.4]],
    island: [[-44.0, 27.4], [-38.5, 27.6], [-33.0, 25.4], [-31.0, 21.0], [-33.6, 18.4], [-38.8, 18.6], [-42.6, 21.0]],
    east: [[-20.0, 16.0], [-13.4, 13.5], [-13.4, 28.0], [-20.5, 28.4], [-22.5, 22.5]],
    glade: [[-45.5, 13.2], [-38.6, 12.4], [-33.6, 17.6], [-26.0, 19.0], [-19.8, 16.2], [-14.0, 13.8], [-14.0, 27.6], [-30.0, 29.2], [-45.0, 29.8]],
    terraceWest: [[-49.6, 15.0], [-45.0, 15.5], [-41.5, 12.6], [-44.2, 9.6], [-47.6, 4.0], [-49.8, 4.0]]
  },
  back: { westFence: [[-56.6, -2], [-57.3, 35]], northFence: [[-57.5, 35.4], [-8, 34.5]] },
  path: [[-42.6, 10.2], [-44.6, 13.6], [-45.6, 17.4], [-46.4, 21.0], [-47.4, 24.4]],     // terrace west tip → NW viewpoint landing
  landing: { c: [-49.6, 28.9], r: 4.2 },
  fire: { spots: [[-45.4, 25.4], [-43.6, 21.2]], pad: 5.2 },
  tub: { c: [-52.35, 29.9], w: 6.5, ry: 0 },       // spa sits in the NW corner, the only spot clear of the oak drip line
  // terrace string-light posts stand in weighted pots on the existing pavers (no footings near oak roots)
  lightPots: [[-44.6, 3.4], [-34.4, -1.2], [-18.5, 2.0]],
  lightWall: [[-40.2, -2.5], [-36.0, -9.8], [-27.5, -9.8], [-17.0, -9.8]],
  vegBeds: [{ c: [-54.3, 6.2], w: 3, l: 8 }, { c: [-54.3, 16.6], w: 3, l: 8 }],
  play: { c: [-43.8, 16.2], rx: 5.6, ry: 4.4, rot: 0.9 }
};

/* ---------------------------------------------------------------- THE CONCEPTS */
CPL.oak = {
  name: 'Oak woodland garden',
  blurb: 'California natives that grow wild under coast live oaks: Douglas iris, hummingbird sage and sedges in the oak shade; coffeeberry, ceanothus and California fuchsia where the sun reaches; fieldstone boulders and flagstone steppers to the far corner. No lawn and no summer water near the oak roots.',
  back: {
    beds: [
      { name: 'west fence', poly: SITE.bed.westFence, back: SITE.back.westFence, drift: 8, layers: [
        { band: [0, 0.55], oc: 5, open: [sp('coffee', 3), sp('toyon', 0)], canopy: [sp('hsage', 2), sp('alum', 1)] },
        { band: [0.5, 1.01], oc: 2.2, open: [sp('fuchsia', 2), sp('yarrow', 1), sp('fescue', 1)], canopy: [sp('iris', 2), sp('sedge', 2)] }] },
      { name: 'NW corner', poly: SITE.bed.nwCorner, back: SITE.back.westFence, drift: 6, layers: [
        { band: [0, 0.6], oc: 5.5, open: [sp('coffee', 2)], canopy: [sp('hsage', 1)] },
        { band: [0.55, 1.01], oc: 2.6, open: [sp('fuchsia', 1), sp('deer', 1)], canopy: [sp('iris', 1)] }] },
      { name: 'north fence', poly: SITE.bed.northFence, back: SITE.back.northFence, drift: 9, layers: [
        { band: [0, 0.5], oc: 3, open: [sp('coffee', 1)], canopy: [sp('hsage', 3), sp('alum', 1.4)] },
        { band: [0.45, 1.01], oc: 1.8, open: [sp('fuchsia', 1)], canopy: [sp('iris', 2), sp('sedge', 2.5)] }] },
      { name: 'oak glade', poly: SITE.bed.glade, back: 'centre', drift: 6, layers: [
        { band: [0, 1.01], oc: 2.0, fill: 0.8, canopy: [sp('sedge', 3), sp('iris', 2), sp('hsage', 1.2), sp('alum', 0.6)], open: [sp('fuchsia', 1)] }] },
      { name: 'island', poly: SITE.bed.island, back: 'centre', drift: 5, layers: [
        { band: [0, 0.45], oc: 3, canopy: [sp('hsage', 2), sp('alum', 1)], open: [sp('yankee', 1)] },
        { band: [0.4, 1.01], oc: 1.8, canopy: [sp('iris', 2), sp('sedge', 2)], open: [sp('fuchsia', 1)] }] },
      { name: 'east', poly: SITE.bed.east, back: [[-13.4, 12], [-13.4, 30]], drift: 6, layers: [
        { band: [0, 0.5], oc: 3, canopy: [sp('hsage', 1), sp('alum', 1)] },
        { band: [0.45, 1.01], oc: 1.8, canopy: [sp('iris', 1), sp('sedge', 1)] }] },
      { name: 'terrace west', poly: SITE.bed.terraceWest, back: [[-50, 2], [-50, 16]], drift: 5, layers: [
        { band: [0, 1.01], oc: 2, canopy: [sp('iris', 1), sp('sedge', 1.5), sp('hsage', 0.7)] }] }
    ],
    specimens: [
      { kind: 'westernRedbud', at: [-54.0, 14.6], opts: { w: 10, h: 12, trunks: 3 }, note: 'multi-trunk western redbud: magenta in early spring, gold in fall' },
      { kind: 'toyon', at: [-54.4, 32.4], opts: { w: 8, h: 9 }, note: 'toyon screens the rear fence; red berries in winter' }
    ],
    boulders: [ { at: [-41.2, 22.6], w: 4.2, h: 2.1, d: 3.2 }, { at: [-38.6, 24.6], w: 2.8, h: 1.5, d: 2.3 }, { at: [-39.4, 20.6], w: 2.2, h: 1.0, d: 1.9, style: 'flat' },
      { at: [-44.0, 9.4], w: 2.6, h: 1.3, d: 2.1 }, { at: [-17.2, 21.5], w: 3.0, h: 1.4, d: 2.4 } ],
    steppers: true, landing: 'dg', ground: []
  },
  front: { fill: 'native', ground: [], boulders: [{ at: [33.2, -9.2], w: 3.2, h: 1.5, d: 2.5 }, { at: [35.0, -6.8], w: 2.0, h: 1.0, d: 1.6 }] }
};

CPL.med = {
  name: 'Mediterranean courtyard',
  blurb: 'A gravel garden in the spirit of a Provençal courtyard: a multi-trunk olive in the sunny corner, lavender, coast rosemary, dwarf olive and Mexican sage in steel-edged beds, low-water mat rush under the oak, and café lights strung over the terrace from planted pots. Plants need little water once established.',
  back: {
    beds: [
      { name: 'west fence', poly: SITE.bed.westFence, back: SITE.back.westFence, drift: 7, layers: [
        { band: [0, 0.55], oc: 4.5, open: [sp('ollie', 2), sp('leuc', 1)], canopy: [sp('lomandra', 1)] },
        { band: [0.5, 1.01], oc: 2.6, open: [sp('lav', 3), sp('germ', 1)], canopy: [sp('westr', 1), sp('hsage', 1)] }] },
      { name: 'NW corner', poly: SITE.bed.nwCorner, back: SITE.back.westFence, drift: 5, layers: [
        { band: [0, 0.6], oc: 4.5, open: [sp('leuc', 1)] },
        { band: [0.55, 1.01], oc: 2.6, open: [sp('lav', 2), sp('oat', 1)] }] },
      { name: 'north fence', poly: SITE.bed.northFence, back: SITE.back.northFence, drift: 8, layers: [
        { band: [0, 0.5], oc: 3.2, open: [sp('ollie', 1)], canopy: [sp('lomandra', 2), sp('westr', 1)] },
        { band: [0.45, 1.01], oc: 2.2, open: [sp('lav', 1)], canopy: [sp('germ', 0), sp('lomandra', 1), sp('westr', 1.2)] }] },
      { name: 'oak glade', poly: SITE.bed.glade, back: 'centre', drift: 7, layers: [
        { band: [0, 1.01], oc: 2.6, fill: 0.5, canopy: [sp('lomandra', 2), sp('westr', 1)] }] },
      { name: 'island', poly: SITE.bed.island, back: 'centre', drift: 5, layers: [
        { band: [0, 0.5], oc: 3, canopy: [sp('westr', 1)], open: [sp('lav', 1)] },
        { band: [0.45, 1.01], oc: 2.4, canopy: [sp('lomandra', 1)], open: [sp('germ', 1)] }] },
      { name: 'east', poly: SITE.bed.east, back: [[-13.4, 12], [-13.4, 30]], drift: 6, layers: [
        { band: [0, 1.01], oc: 2.8, canopy: [sp('lomandra', 1), sp('westr', 1)] }] }
    ],
    specimens: [ { kind: 'olive', at: [-54.0, 14.2], opts: { w: 11, h: 13, trunks: 3 }, note: 'fruitless multi-trunk olive (‘Swan Hill’)' } ],
    pots: true, stringLights: true, gravel: 'gold', edging: true, boulders: [],
    ground: [{ surface: 'gravel', color: 'gold', region: 'yard', keepOak: 10 }]
  },
  front: { fill: 'med', ground: [{ surface: 'gravel', color: 'gold', region: 'yard', keepOak: 10 }], pots: [[40.6, 1.6], [40.6, -14.6]], boulders: [] }
};

CPL.family = {
  name: 'Family garden',
  blurb: 'A garden to use every day: a small lawn-alternative play lawn in the one sunny corner clear of the oak roots, a natural play space under the oak (log steppers and climbing boulders on soft wood-fiber), and two steel raised vegetable beds with drip along the redwood fence. Easy-care, deer-resistant shrubs edge the beds.',
  back: {
    beds: [
      { name: 'north fence', poly: SITE.bed.northFence, back: SITE.back.northFence, drift: 9, layers: [
        { band: [0, 0.55], oc: 3, open: [sp('westr', 1)], canopy: [sp('lomandra', 1), sp('hsage', 1)] },
        { band: [0.5, 1.01], oc: 2, open: [sp('germ', 1)], canopy: [sp('sedge', 1), sp('iris', 1)] }] },
      { name: 'east', poly: SITE.bed.east, back: [[-13.4, 12], [-13.4, 30]], drift: 6, layers: [
        { band: [0, 1.01], oc: 2.6, canopy: [sp('lomandra', 1), sp('sedge', 1)] }] },
      { name: 'oak glade', poly: SITE.bed.glade, back: 'centre', drift: 7, layers: [
        { band: [0, 1.01], oc: 2.2, fill: 0.45, canopy: [sp('sedge', 2), sp('iris', 1)] }] },
      { name: 'terrace west', poly: SITE.bed.terraceWest, back: [[-50, 2], [-50, 16]], drift: 5, layers: [
        { band: [0, 1.01], oc: 2.2, canopy: [sp('lomandra', 1), sp('sedge', 1)] }] }
    ],
    specimens: [], lawn: true, play: true, veg: true, boulders: [],
    ground: []
  },
  front: { fill: 'family', ground: [], boulders: [] }
};
CPL.order = ['oak', 'med', 'family'];

// front-yard fills: one bed = all plantable front ground; the rules pick shade or sun species by oak canopy
var FRONTFILL = {
  native: [{ band: [0, 0.5], oc: 3, open: [sp('carpet', 1), sp('csage', 1), sp('deer', 0.6)], canopy: [sp('hsage', 2), sp('alum', 1)] },
           { band: [0.45, 1.01], oc: 1.9, open: [sp('fuchsia', 1), sp('poppy', 1), sp('yarrow', 1)], canopy: [sp('iris', 2), sp('sedge', 2)] }],
  med: [{ band: [0, 0.5], oc: 3, open: [sp('ollie', 1), sp('leuc', 1)], canopy: [sp('westr', 2), sp('lomandra', 1)] },
        { band: [0.45, 1.01], oc: 2.4, open: [sp('lav', 2), sp('oat', 1), sp('greggii', 1)], canopy: [sp('germ', 0), sp('lomandra', 1), sp('westr', 1)] }],
  family: [{ band: [0, 0.5], oc: 3, open: [sp('westr', 1)], canopy: [sp('westr', 1), sp('lomandra', 1)] },
           { band: [0.45, 1.01], oc: 2.2, open: [sp('agap', 1), sp('germ', 1)], canopy: [sp('lomandra', 1), sp('sedge', 1)] }]
};
// add-on palettes
var TUBSCREEN = { kind: 'dwarfOlive', oc: 4.2, scale: 0.95 };

/* ---------------------------------------------------------------- build one concept
   ctx (page-supplied, BIM plan frame): {toWorld, heightAt, lot, house:[poly], paved:[poly], fences:[polyline], oaks:[{c, drip}],
   stops:[{name, at, eye}], utilities:[{at, clear}], frontLine (x dividing front/back), season, detail, coarse}
   sel: {front, back, fire, tub, boulders, lights}  →  {group, report:{schedule, rejected, issues, notes, counts}} */
LAND.buildConcepts = function (sel, ctx) {
  var root = new THREE.Group(); root.name = 'landscapeConcepts';
  var report = { schedule: {}, rejected: {}, issues: [], notes: [], features: [] };
  var W = ctx.toWorld, H = ctx.heightAt, Ww = function (p) { return W(p[0], p[1]); }, wpoly = function (P) { return P.map(Ww); };
  var anyConcept = sel.front !== 'today' || sel.back !== 'today';
  var back = CPL[sel.back], front = CPL[sel.front];
  ctx.features = [];
  ctx.paths = [];
  if (back && back.back.steppers) ctx.paths.push({ pts: SITE.path, half: 1.6 });
  if (back && back.back.play) ctx.features.push({ kind: 'play', pad: cpEllipse(SITE.play.c, SITE.play.rx + 0.4, SITE.play.ry + 0.4, SITE.play.rot, 20) });
  // ---- add-on pads (they claim their ground first)
  if (sel.tub) { var t = SITE.tub, hw = t.w / 2 + 0.3; ctx.features.push({ kind: 'tub', pad: [[t.c[0] - hw, t.c[1] - hw - 2.6], [t.c[0] + hw, t.c[1] - hw - 2.6], [t.c[0] + hw, t.c[1] + hw], [t.c[0] - hw, t.c[1] + hw]] }); }
  if (sel.fire) {   // the fire bowl takes the first candidate spot whose pad clears the other pads
    var spot = SITE.fire.spots.filter(function (c) { return ctx.features.every(function (f) { return f.pad.every(function (q) { return Math.hypot(q[0] - c[0], q[1] - c[1]) > SITE.fire.pad + 0.3; }) && !inPoly(f.pad, c[0], c[1]); }); })[0] || SITE.fire.spots[SITE.fire.spots.length - 1];
    SITE.fire.c = spot; ctx.features.push({ kind: 'fire', pad: cpCircle(spot, SITE.fire.pad, 24) });
    if (spot !== SITE.fire.spots[0]) report.notes.push('Fire bowl and hot tub together: the sunny corner fits only one of them clear of the oak, so the fire bowl moves under the canopy edge. Not recommended without an arborist and Woodside Fire review; choose one.');
  }
  var rules = LAND.conceptRules(ctx);
  ctx.features.forEach(function (f) { if (f.kind === 'play') return; var r = rules.feature(f.pad, f.kind === 'fire' ? 'Fire bowl pad' : 'Hot tub pad'); report.issues = report.issues.concat(r.issues); report.notes = report.notes.concat(r.notes); });
  var placed = [], all = [], seed = 101, hard = new THREE.Group(); hard.name = 'conceptHardscape';
  function mk(kind, at, o) { var w = Ww(at), oo = {}; for (var k in o || {}) oo[k] = o[k]; oo.at = w; oo.heightAt = H; oo.seed = oo.seed || seed++; var g = LAND.make(kind, oo); hard.add(g); return g; }
  function count(list) { list.forEach(function (p) { report.schedule[p.kind] = (report.schedule[p.kind] || 0) + 1; }); all = all.concat(list); }
  function addRej(r) { for (var k in r) report.rejected[k] = (report.rejected[k] || 0) + r[k]; }
  function specimen(s) {
    var sz = LAND.sizeOf(s.kind, s.opts || {}), r = Math.max(sz[0], sz[1]) / 2, why = rules.plant(s.kind, s.at[0], s.at[1], KINDS[s.kind].category === 'tree' ? 1 : r, sz[2], { canopyR: r });
    if (why === 'feature') { report.notes.push(KINDS[s.kind].meta.common + ' omitted to make room for the add-on'); return; }
    if (why) { report.issues.push(s.kind + ' at ' + s.at.join(',') + ' breaks rule ' + why); return; }
    var pl = { kind: s.kind, x: s.at[0], y: s.at[1], s: 1, r: KINDS[s.kind].category === 'tree' ? 1.2 : r, h: sz[2], ry: s.at[0] * 0.37, opts: s.opts || {} }; placed.push(pl); count([pl]);
  }
  function boulder(b) {
    var why = null, oak = rules.oakAt(b.at[0], b.at[1]);
    if (oak.dTrunk < 10) why = 'oak-trunk'; if (rules.houseDist(b.at[0], b.at[1]) < 0.5) why = 'house';
    ctx.features.forEach(function (f) { if (!(b.play && f.kind === 'play') && cpPolyDist(f.pad, b.at[0], b.at[1]) < b.w * 0.4) why = 'feature'; });
    if (why === 'feature') { report.notes.push('a boulder gives way to the add-on pad'); return; }
    if (why) { if (!b.soft) report.issues.push('boulder at ' + b.at.join(',') + ' breaks rule ' + why); return; }
    mk('boulder', b.at, { w: b.w, h: b.h, d: b.d, style: b.style || 'round', type: b.type || 'granite', bury: 0.22, res: ctx.coarse ? 3 : 5, ry: b.at[1] * 0.7 });
    placed.push({ kind: 'boulder', x: b.at[0], y: b.at[1], r: b.w / 2, h: b.h });
    report.schedule.boulder = (report.schedule.boulder || 0) + 1;
  }
  var yard = { back: ctx.backRegion, front: ctx.frontRegion };
  function groundYard(G, region) {
    var holes = ctx.house.map(wpoly).concat(ctx.paved.map(function (P) { return wpoly(offsetPoly(ccw(P), 1.6, 2)); }));
    if (G.keepOak) ctx.oaks.forEach(function (o) { holes.push(wpoly(cpCircle(o.c, G.keepOak, 20))); });
    ctx.features.forEach(function (f) { holes.push(wpoly(f.pad)); });
    try { root.add(LAND.ground({ outer: wpoly(region), holes: holes }, G.surface, { heightAt: H, lift: 0.25, color: G.color, seed: seed++ })); } catch (e) { report.issues.push('ground ' + G.surface + ': ' + e.message); }
  }
  // ---- Zone 0 band (any concept): grey gravel, steel edge at its outer line
  if (anyConcept) {
    try {
      var rings = LAND.zone0(ctx.house.map(wpoly), 5, { ring: true });
      var allHoles = ctx.house.map(wpoly).concat(ctx.paved.map(function (P) { return wpoly(offsetPoly(ccw(P), 1.6, 2)); }));   // existing paving closes the < 1.6 ft sliver to the wall: no gravel over pavers rings.forEach(function (ring) { root.add(LAND.ground({ outer: ring.outer, holes: allHoles.filter(function (h) { var a = bbox(h), b = bbox(ring.outer); return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]); }) }, 'gravel', { heightAt: H, lift: 0.28, color: 'grey', seed: 3 })); });
    } catch (e) { report.issues.push('zone0: ' + e.message); }
  }
  // ---- back yard
  if (back) {
    var B = back.back;
    (B.ground || []).forEach(function (G) { groundYard(G, yard.back); });
    B.beds.forEach(function (bed, i) { var r = cpPlantBed(bed, ctx, rules, placed, seed + i * 13); addRej(r.rejected); count(r.placements); });
    (B.specimens || []).forEach(specimen);
    if (sel.boulders || B.boulders.length) (B.boulders.length ? B.boulders : []).forEach(boulder);
    if (B.steppers) {   // flagstone steppers on grade from the terrace to the NW landing, ~24" o.c.
      var L = cpLineDist(SITE.path, SITE.path[0][0], SITE.path[0][1]).len, n = Math.round(L / 2.1);
      for (var k = 0; k <= n; k++) { var tt = k / n, idx = Math.min(SITE.path.length - 2, Math.floor(tt * (SITE.path.length - 1))), u = tt * (SITE.path.length - 1) - idx, a = SITE.path[idx], b = SITE.path[idx + 1];
        var p = [lerp(a[0], b[0], u) + (k % 2 ? 0.25 : -0.25), lerp(a[1], b[1], u)]; if (rules.oakAt(p[0], p[1]).dTrunk < 6) continue; mk('steppingStone', p, { w: 2.3, d: 1.7, stone: 'buff', ry: Math.atan2(b[0] - a[0], b[1] - a[1]) + k * 0.4 }); }
    }
    if (B.landing) { try { root.add(LAND.ground(wpoly(cpCircle(SITE.landing.c, SITE.landing.r, 22)), B.landing === 'dg' ? 'decomposedGranite' : 'gravel', { heightAt: H, lift: 0.3, seed: 41 })); } catch (e) {} }
    if (B.edging) {   // steel edge along the bed lines that face the open gravel
      [SITE.bed.westFence, SITE.bed.island, SITE.bed.northFence].forEach(function (P) {
        var pts = P.map(Ww); try { hard.add(LAND.make('steelEdging', { points: pts, closed: true, heightAt: H, height: 0.12 })); } catch (e) {} });
    }
    if (B.pots) {   // large glazed pots on the terrace (no soil disturbance under the oak), planted with dwarf olive / lavender
      [[-40.5, 6.2, 'foxtail'], [-15.6, 7.6, 'foxtail'], [-43.6, -1.2, 'foxtail']].forEach(function (q) {
        var sq = SP[q[2]], why = rules.plant(sq.kind, q[0], q[1], 1.2, 2.5, { onPaving: true }); if (why) { report.issues.push('terrace pot at ' + q[0] + ',' + q[1] + ' breaks rule ' + why); return; }
        var pot = mk('gardenPot', [q[0], q[1]], { dia: 2.5, h: 2.1, finish: 'glazedPot' });
        var s = SP[q[2]], sz = LAND.sizeOf(s.kind, s.opts || {}), sc = 0.95;
        var pl = { kind: s.kind, x: q[0], y: q[1], s: sc, r: sz[0] * sc / 2, h: sz[2] * sc, ry: q[0], opts: s.opts || {}, yOverride: pot.position.y + pot.userData.bedY }; count([pl]);
      });
    }
    if (B.lawn) {   // the play lawn: the NW corner outside the oak drip line (+1.5 ft), minus the add-on pads
      var oakB = ctx.oaks.reduce(function (a, o) { return Math.hypot(o.c[0] - SITE.backStop[0], o.c[1] - SITE.backStop[1]) < Math.hypot(a.c[0] - SITE.backStop[0], a.c[1] - SITE.backStop[1]) ? o : a; });
      var R0 = oakB.drip + 1.5, x0 = -55.4, y1 = 33.9, y0 = 22.5, cx = oakB.c[0], cy = oakB.c[1];
      var a1 = Math.atan2(y1 - cy, -Math.sqrt(Math.max(0, R0 * R0 - (y1 - cy) * (y1 - cy)))), a2 = Math.atan2(y0 - cy, -Math.sqrt(Math.max(0, R0 * R0 - (y0 - cy) * (y0 - cy))));
      var lawn = [[x0, y1]];
      for (var j = 0; j <= 14; j++) { var aa = lerp(a1, a2, j / 14); lawn.push([cx + Math.cos(aa) * R0, cy + Math.sin(aa) * R0]); }
      lawn.push([x0, y0]);
      var lawnHoles = ctx.features.map(function (f) { return wpoly(f.pad); });
      SITE.vegBeds.forEach(function (vb) { lawnHoles.push(wpoly([[vb.c[0] - vb.w / 2 - 0.5, vb.c[1] - vb.l / 2 - 0.5], [vb.c[0] + vb.w / 2 + 0.5, vb.c[1] - vb.l / 2 - 0.5], [vb.c[0] + vb.w / 2 + 0.5, vb.c[1] + vb.l / 2 + 0.5], [vb.c[0] - vb.w / 2 - 0.5, vb.c[1] + vb.l / 2 + 0.5]])); });
      lawn.forEach(function (q) { if (rules.oakAt(q[0], q[1]).inDrip) report.issues.push('lawn vertex inside an oak drip line'); });
      try { root.add(LAND.ground({ outer: wpoly(lawn), holes: lawnHoles }, 'lawn', { heightAt: H, lift: 0.27, stripes: false, seed: 7, tint: '#b2ad98' })); } catch (e) { report.issues.push('lawn: ' + e.message); }
      try { hard.add(LAND.make('steelEdging', { points: wpoly(lawn), closed: true, heightAt: H, height: 0.1 })); } catch (e) {}
      var area = Math.abs(polyArea(lawn)); report.notes.push('Play lawn ≈ ' + Math.round(area) + ' sq ft (lawn alternative, e.g. UC Verde buffalo grass), all outside the oak drip line');
      report.lawnArea = Math.round(area);
    }
    if (B.play) {   // natural play under the oak: wood-fiber surface on grade, log steppers, flat climbing boulders
      var P = SITE.play, ell = cpEllipse(P.c, P.rx, P.ry, P.rot, 26);
      try { root.add(LAND.ground({ outer: wpoly(ell), holes: ctx.paved.map(wpoly) }, 'dg', { heightAt: H, lift: 0.3, seed: 77, tint: '#c9b79c' })); /* engineered wood fiber reads light tan (the bark-mulch texture is far darker) */ hard.add(LAND.make('steelEdging', { points: wpoly(ell), closed: true, heightAt: H, height: 0.1 })); } catch (e) {}
      for (var li = 0; li < 7; li++) { var a2 = P.rot + 2.5 + li * 0.42, rr2 = 0.62; var at2 = [P.c[0] + Math.cos(a2) * P.rx * rr2, P.c[1] + Math.sin(a2) * P.ry * rr2 * 1.1];
        if (rules.oakAt(at2[0], at2[1]).dTrunk < 10) continue; mk('logRound', at2, { r: 0.5 + (li % 3) * 0.08, h: 0.6 + (li % 4) * 0.25 }); }
      [{ at: [P.c[0] + 1.2, P.c[1] + 1.6], w: 3.6, h: 1.6, d: 3.0, style: 'flat', play: true }, { at: [P.c[0] + 3.0, P.c[1] - 0.6], w: 2.6, h: 1.1, d: 2.2, style: 'flat', play: true }].forEach(boulder);
      var bAt = [P.c[0] - 3.4, P.c[1] + 4.6], bw = Ww(bAt), cw0 = Ww(P.c); mk('bench', bAt, { w: 5, material: 'teak', back: true, ry: Math.atan2(cw0[0] - bw[0], cw0[1] - bw[1]) });   // faces the play space
    }
    if (B.veg) {   // two 3×8 ft weathering-steel raised beds on grade (outside the drip line), drip irrigated
      SITE.vegBeds.forEach(function (vb, i) {
        var oak = rules.oakAt(vb.c[0], vb.c[1]); if (oak.inDrip) report.issues.push('raised bed ' + i + ' inside an oak drip line');
        var g = mk('raisedBed', vb.c, { w: vb.l, d: vb.w, h: 1.5, material: 'corten', ry: HALF });
        var crops = ['tomato', 'kale', 'lettuce', 'lettuce', 'kale', 'tomato'], ys = vb.c[1] - vb.l / 2 + 0.8;
        for (var c2 = 0; c2 < 6; c2++) for (var cc = 0; cc < 2; cc++) {
          var crop = crops[(c2 + i) % crops.length]; if (crop === 'tomato' && cc) continue;
          var pl = { kind: crop, x: vb.c[0] + (crop === 'tomato' ? 0 : (cc ? 0.65 : -0.65)), y: ys + c2 * 1.3, s: crop === 'lettuce' ? 0.95 : 0.9, r: 0.6, h: 2, ry: c2 + cc, opts: { season: 'summer' }, yOverride: g.position.y + (g.userData.bedY || 1.35) };
          count([pl]);
        }
      });
      report.notes.push('Raised beds: weathering steel (not cedar), outside the oak drip line; add hoop netting for deer and birds');
    }
    if (B.stringLights || sel.lights) {   // café lights over the terrace, from 3 planted pot-posts to the pergola and the wing wall
      var posts = SITE.lightPots, wall = SITE.lightWall, yT = function (p) { var w = Ww(p); return H(w[0], w[1]); };
      var tY = Math.max.apply(null, posts.concat(wall).map(yT)) + 0.22, zig = [];
      zig.push([wall[0], 9.4]); for (var pi = 0; pi < posts.length; pi++) { zig.push([posts[pi], 9.8]); if (wall[pi + 1]) zig.push([wall[pi + 1], 9.0]); }
      var pts3 = zig.map(function (z) { var w = Ww(z[0]); return [w[0], tY + z[1], w[1]]; });
      try { hard.add(LAND.make('stringLights', { points: pts3, closed: false, posts: false, sag: 0.04, spacing: 1.4, lights: 0 })); } catch (e) { report.issues.push('lights: ' + e.message); }
      posts.forEach(function (p) {
        var pot = mk('gardenPot', p, { dia: 2.0, h: 1.8, finish: 'glazedPot' }), w = Ww(p), py = pot.position.y;
        var post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, tY + 9.9 - py, 8), LAND.mat('steel')); post.position.set(w[0], (tY + 9.9 + py) / 2, w[1]); post.castShadow = true; hard.add(post);
        if (!rules.plant('lomandra', p[0], p[1], 1, 1.4, { onPaving: true })) count([{ kind: 'lomandra', x: p[0], y: p[1], s: 0.6, r: 0.9, h: 1.4, ry: p[0], opts: {}, yOverride: py + pot.userData.bedY }]);
      });
      report.notes.push('String lights hang from steel posts set in weighted planters on the existing terrace (no footings in the oak root zone) and from the pergola and wall');
    }
  }
  // ---- front yard: one bed = all plantable ground in front; species by sun/shade from the rules
  if (front) {
    var F = front.front;
    (F.ground || []).forEach(function (G) { groundYard(G, yard.front); });
    var fb = { name: 'front', poly: yard.front, back: ctx.frontBack, drift: 6, layers: FRONTFILL[F.fill] };
    var r2 = cpPlantBed(fb, ctx, rules, placed, 707); addRej(r2.rejected); count(r2.placements);
    (F.boulders || []).forEach(boulder);
    (F.pots || []).forEach(function (q) { var pot = mk('gardenPot', q, { dia: 2.6, h: 2.3, finish: 'glazedPot' }); var s = SP.ollie, sz = LAND.sizeOf(s.kind, {});
      count([{ kind: s.kind, x: q[0], y: q[1], s: 0.6, r: sz[0] * 0.3, h: sz[2] * 0.6, ry: q[1], opts: {}, yOverride: pot.position.y + pot.userData.bedY }]); });
  }
  // ---- add-ons
  if (sel.boulders && back && !back.back.boulders.length) [{ at: [-41.2, 22.6], w: 4.2, h: 2.1, d: 3.2 }, { at: [-38.6, 24.6], w: 2.8, h: 1.5, d: 2.3 }, { at: [-39.4, 20.6], w: 2.2, h: 1.0, d: 1.9, style: 'flat' }].forEach(function (b) { b.soft = true; boulder(b); });
  if (sel.boulders && (!back || back === CPL.oak) && !back) [{ at: [-41.2, 22.6], w: 4.2, h: 2.1, d: 3.2 }, { at: [-38.6, 24.6], w: 2.8, h: 1.5, d: 2.3 }].forEach(function (b) { b.soft = true; boulder(b); });
  if (sel.fire) {
    var f = SITE.fire;
    try { root.add(LAND.ground(wpoly(cpCircle(f.c, f.pad - 0.6, 26)), 'gravel', { heightAt: H, lift: 0.33, color: back === CPL.med ? 'gold' : 'grey', seed: 61 })); } catch (e) {}
    try { hard.add(LAND.make('steelEdging', { points: wpoly(cpCircle(f.c, f.pad - 0.6, 26)), closed: true, heightAt: H, height: 0.1 })); } catch (e) {}
    mk('firePit', f.c, { style: back === CPL.med ? 'concrete' : 'stone', dia: 3.6, fuel: 'gas', flame: true });
    var cw = Ww(f.c);
    [0.35, 1.95, 3.55, 5.15].forEach(function (a) { var at = [f.c[0] + Math.cos(a) * 4.1, f.c[1] + Math.sin(a) * 4.1]; if (ctx.stops.some(function (st) { return Math.hypot(st.at[0] - at[0], st.at[1] - at[1]) < 2.5; })) return;   // the viewer's seat stays open
      var o = mk('adirondackChair', at, { color: back === CPL.oak ? 'cedar' : back === CPL.med ? 'charcoal' : 'white' }); var w2 = Ww(at); o.rotation.y = Math.atan2(cw[0] - w2[0], cw[1] - w2[1]); });
    report.features.push('Gas fire bowl (no wood burning), 3.6 ft, on a gravel pad set on grade; ≥ 10 ft to fences and house: ' + (function () { var d = 1e9; ctx.fences.forEach(function (L) { d = Math.min(d, cpLineDist(L, f.c[0], f.c[1]).d); }); return d.toFixed(1); })() + ' ft to the nearest fence');
  }
  if (sel.tub) {
    var T = SITE.tub;
    try { root.add(LAND.ground(wpoly(ctx.features.filter(function (x) { return x.kind === 'tub'; })[0].pad), 'pavers', { heightAt: H, lift: 0.3, color: 'charcoal', seed: 9 })); } catch (e) {}
    var tub = mk('hotTub', T.c, { w: T.w, cover: 'folded', steps: true, cladding: 'woodGrey', ry: T.ry + PI });
    // privacy: a row of dwarf olives screens the open (south) side; the redwood fence covers north and west
    count(cpRow({ name: 'tub screen', kind: TUBSCREEN.kind, pts: [[T.c[0] - 3.4, T.c[1] - T.w / 2 - 4.6], [T.c[0] + 0.4, T.c[1] - T.w / 2 - 4.6]], oc: TUBSCREEN.oc, scale: TUBSCREEN.scale }, rules, placed, report.issues));
    report.features.push('Hot tub 6.5 × 6.5 ft (2–4 person), fiber-cement-clad, on pavers set on grade in the NW corner — the only spot clear of the oak drip line');
  }
  if (sel.lights) {   // garden lighting: path lights along the steppers / beds and two in-grade oak uplights
    var lp = [[-43.4, 12.4], [-45.4, 18.8], [-47.6, 25.0], [-36.0, 28.0], [-25.0, 29.0], [-16.0, 27.0]];
    lp.forEach(function (p) { mk('pathLight', p, { h: 1.6 }); });
    [[-30.5, 19.5], [-38.4, 14.0]].forEach(function (p) { mk('uplight', p); });
    report.features.push('Low-voltage lighting: 6 bronze path lights, 2 in-grade oak uplights, café lights over the terrace (warm 2700 K, dark-sky friendly)');
  }
  root.add(hard);
  cpMerge(root);
  if (all.length) root.add(cpInstances(all, ctx));
  root.traverse(function (o) { if (o.isMesh && !o.isInstancedMesh && o.receiveShadow === undefined) o.receiveShadow = true; });
  report.counts = { plants: all.length, kinds: Object.keys(report.schedule).length, stats: LAND.stats(root) };
  return { group: root, report: report };
};

// plant schedule rows for the UI (common name, latin, size, count) — sorted trees → shrubs → perennials → grasses
LAND.conceptSchedule = function (report) {
  var order = { tree: 0, shrub: 1, perennial: 2, grass: 3, edible: 4, succulent: 5 }, rows = [];
  for (var k in report.schedule) { var K = KINDS[k]; if (!K || !K.meta.latin) continue; rows.push({ kind: k, n: report.schedule[k], common: K.meta.common, latin: K.meta.latin, mature: K.meta.mature || '', water: K.meta.water || '', cat: K.category, deer: (LAND.conceptMeta[k] || {}).deer || '', fire: (LAND.conceptMeta[k] || {}).fire || '' }); }
  rows.sort(function (a, b) { return (order[a.cat] - order[b.cat]) || (b.n - a.n); });
  return rows;
};
LAND.conceptPlans = CPL;
LAND.conceptSite = SITE;
/* ================================================================== API */
// terrain sampling around a footprint: {min, max, centre}
function footprintHeights(heightAt, x, z, rx, rz, ry) {
  var c = heightAt(x, z), mn = c, mx = c, cs = Math.cos(ry || 0), sn = Math.sin(ry || 0);
  for (var i = 0; i < 12; i++) {
    var a = i / 12 * TAU, lx = Math.cos(a) * rx, lz = Math.sin(a) * rz;
    var h = heightAt(x + lx * cs + lz * sn, z - lx * sn + lz * cs); mn = Math.min(mn, h); mx = Math.max(mx, h);
  }
  return { min: mn, max: mx, c: c };
}
LAND.make = function (kind, o) {
  var K = KINDS[kind];
  if (!K) throw new Error('LAND.make: unknown kind "' + kind + '"');
  var oo = opt(K.defaults, o), place = K.meta.place || 'level', fh = null;
  if (oo.heightAt && oo.at && place !== 'world') {
    var sz = K.size(oo);
    fh = footprintHeights(oo.heightAt, oo.at[0], oo.at[1], sz[0] * (place === 'sink' ? 0.3 : 0.5), sz[1] * (place === 'sink' ? 0.3 : 0.5), oo.ry);
    oo._drop = fh.max - fh.min;   // builders with plinths / skirts extend down by this much
  }
  var b = new Builder(oo);
  K.build(b, oo);
  var g = b.build(kind);
  g.userData = { kind: kind, category: K.category, opts: oo, size: K.size(oo), meta: K.meta };
  if (b.info) for (var ik in b.info) g.userData[ik] = b.info[ik];
  if (oo.at && place !== 'world') {
    var y = 0;
    if (fh) y = place === 'sink' ? fh.min + (fh.c - fh.min) * 0.35 : fh.max;
    g.position.set(oo.at[0], y + (oo.y || 0), oo.at[1]);
  }
  if (oo.ry && place !== 'world') g.rotation.y = oo.ry;
  if (g.userData.bed) {   // planting polygon in world plan coordinates (for LAND.scatter inside planters / raised beds)
    var cs = Math.cos(oo.ry || 0), sn = Math.sin(oo.ry || 0), ax = oo.at ? oo.at[0] : 0, az = oo.at ? oo.at[1] : 0;
    g.userData.bedWorld = g.userData.bed.map(function (q) { return [ax + q[0] * cs + q[1] * sn, az - q[0] * sn + q[1] * cs]; });
    g.userData.bedWorldY = g.position.y + g.userData.bedY;
  }
  return g;
};
LAND.kinds = KIND_ORDER.map(function (k) {
  var K = KINDS[k];
  return { kind: k, category: K.category, defaults: K.defaults, size: K.size(opt(K.defaults, {})), note: K.note, meta: K.meta };
});
LAND.sizeOf = function (kind, o) { var K = KINDS[kind]; return K.size(opt(K.defaults, o)); };
LAND.stats = function (obj) {
  var tris = 0, meshes = 0, instances = 0;
  obj.traverse(function (m) {
    if (!m.isMesh) return;
    meshes++;
    var t = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    if (m.isInstancedMesh) { tris += t * m.count; instances += m.count; } else tris += t;
  });
  return { meshes: meshes, drawCalls: meshes, triangles: Math.round(tris), instances: instances };
};
LAND.setWind = function (strength, angle) {
  var on = strength > 0;
  WIND.uniforms.landWind.value = strength || 0;
  if (angle !== undefined) WIND.uniforms.landWindDir.value.set(Math.cos(angle), Math.sin(angle));
  if (on !== WIND.enabled) {
    WIND.enabled = on;
    if (MATS.plant) MATS.plant.needsUpdate = true;
    for (var k in DEPTHS) DEPTHS[k].needsUpdate = true;
  }
  return LAND;
};
LAND.tick = function (seconds) { WIND.uniforms.landTime.value = seconds; };
LAND.config = function (c) { for (var k in c) CONFIG[k] = c[k]; return LAND; };
LAND.helpers = { Builder: Builder, Mesher: Mesher, M: M, rng: rng, merge: mergeGeoms, offset: offsetPoly, polylinePolygon: polylinePoly,
  inPolygon: inPoly, inRegion: inRegion, triangulate: triangulateRegion, roundedBox: roundedBoxGeo, cellUV: cellUV, atlas: function () { return getTex('atlas'); } };
LAND.dispose = function () {
  for (var k in MATS) { MATS[k].dispose(); } for (var t in TEX) { if (TEX[t].dispose) TEX[t].dispose(); }
  for (var d in DEPTHS) DEPTHS[d].dispose();
  MATS = {}; TEX = {}; DEPTHS = {}; GEOCACHE = {};
};
global.LAND = LAND;
})(typeof window !== 'undefined' ? window : this);
