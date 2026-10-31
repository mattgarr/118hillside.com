/*!
 * FIX — procedural fixtures & furniture library for three.js r128 (global THREE).
 * 118 Hillside Drive walkthrough.  Units: FEET.
 * Local frame: origin = centre of the fixture's BACK edge on the floor (y=0); width along x
 * (symmetric), depth toward +z (front faces +z), y up.  Wall-hung items use opts.mountY;
 * ceiling items hang from the origin toward -y.
 * API:  FIX.setMaterials(map) · FIX.mat(name) · FIX.make(kind, opts) · FIX.kinds
 *       FIX.makeEnvironment(renderer) (optional PMREM env map for metals/glass)
 */
(function (global) {
'use strict';
var THREE = global.THREE;
if (!THREE) throw new Error('FIX: load three.js r128 before fixtures.js');

var IN = 1 / 12, PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
var CT = 1.25 * IN;          // counter thickness
var KICK = 4 * IN;           // toe kick height
var KICKD = 3 * IN;          // toe kick recess
var DOORT = 0.75 * IN;       // door / drawer front thickness
var GAP = 0.125 * IN;        // reveal between fronts

var FIX = { version: '1.0.0', units: 'feet' };
var KINDS = {};
var KIND_ORDER = [];

function def(kind, category, defaults, build, size, note) {
  KINDS[kind] = { kind: kind, category: category, defaults: defaults, build: build, size: size, note: note || '' };
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
function rng(seed) {
  var s = (seed >>> 0) || 0x9e3779b9;
  return function () {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ matrices */
var _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
// translate + rotate (Euler YXZ: yaw, then pitch, then roll) + scale
function M(x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx || 0, ry || 0, rz || 0, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x || 0, y || 0, z || 0);
  if (sx === undefined) sx = 1;
  if (sy === undefined) sy = sx;
  if (sz === undefined) sz = sx;
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
// position + options {rx,ry,rz,sx,sy,sz} (each scale defaults to 1 independently)
function MO(x, y, z, o) {
  o = o || {};
  return M(x, y, z, o.rx, o.ry, o.rz, o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy, o.sz == null ? 1 : o.sz);
}

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
  for (var k in g.attributes) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
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
function mergeGeoms(list) {
  var nv = 0, ni = 0, i;
  list.forEach(function (g) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
  var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  var idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  var vo = 0, io = 0;
  list.forEach(function (g) {
    var p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv, cnt = p.count;
    pos.set(p.array.length === cnt * 3 ? p.array : p.array.subarray(0, cnt * 3), vo * 3);
    nor.set(n.array.length === cnt * 3 ? n.array : n.array.subarray(0, cnt * 3), vo * 3);
    if (t) uv.set(t.array.length === cnt * 2 ? t.array : t.array.subarray(0, cnt * 2), vo * 2);
    if (g.index) { var a = g.index.array, L = g.index.count; for (i = 0; i < L; i++) idx[io + i] = a[i] + vo; io += L; }
    else { for (i = 0; i < cnt; i++) idx[io + i] = vo + i; io += cnt; }
    vo += cnt;
  });
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}
// split an ExtrudeGeometry by its groups → [capsGeo, sidesGeo]
function splitGroups(g) {
  var gi = g.index ? null : true, out = [];
  g.groups.forEach(function (gr) {
    var ng = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach(function (k) {
      var a = g.attributes[k]; if (!a) return;
      ng.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
    });
    out[gr.materialIndex] = ng;
  });
  return out;
}

/* rounded box: per-face grids, analytic rounding, optional pillow bulge.
   bulge: number or [bx,by,bz] — outward displacement at face centres (feet). */
function roundedBoxGeo(w, h, d, r, seg, bulge, flatSeg) {
  seg = seg || 3;
  var H = [w / 2, h / 2, d / 2];
  r = Math.max(0.0005, Math.min(r, H[0] - 1e-5, H[1] - 1e-5, H[2] - 1e-5));
  if (r <= 0.0005) r = 0.0005;
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
    var bl = B[nA] || 0, grid = [];
    for (var j = 0; j < nvv; j++) {
      for (var i = 0; i < nu; i++) {
        var p = [0, 0, 0]; p[nA] = s * H[nA]; p[uA] = cu[i]; p[vA] = cv[j];
        var c = [clamp(p[0], -(H[0] - r), H[0] - r), clamp(p[1], -(H[1] - r), H[1] - r), clamp(p[2], -(H[2] - r), H[2] - r)];
        var dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        dx /= L; dy /= L; dz /= L;
        var q = [c[0] + dx * r, c[1] + dy * r, c[2] + dz * r];
        var flat = Math.abs(p[uA]) < H[uA] - r - 1e-9 && Math.abs(p[vA]) < H[vA] - r - 1e-9;
        if (bl) {
          var su = (H[uA] - r) > 1e-6 ? clamp(c[uA] / (H[uA] - r), -1, 1) : 1;
          var sv = (H[vA] - r) > 1e-6 ? clamp(c[vA] / (H[vA] - r), -1, 1) : 1;
          var fb = (1 - su * su) * (1 - su * su) * (1 - sv * sv) * (1 - sv * sv);
          q[nA] += s * bl * fb;
        }
        pos.push(q[0], q[1], q[2]); nor.push(dx, dy, dz);
        grid.push(flat);
      }
    }
    for (j = 0; j < nvv - 1; j++) for (i = 0; i < nu - 1; i++) {
      var a = base + j * nu + i, b = a + 1, cc = a + nu, dd = cc + 1;
      if (!flip) idx.push(a, b, dd, a, dd, cc); else idx.push(a, dd, b, a, cc, dd);
    }
    if (bl) { // finite-difference normals on the bulged flat zone
      for (j = 1; j < nvv - 1; j++) for (i = 1; i < nu - 1; i++) {
        if (!grid[j * nu + i]) continue;
        var k0 = base + j * nu + i;
        var ia = (k0 + 1) * 3, ib = (k0 - 1) * 3, ja = (k0 + nu) * 3, jb = (k0 - nu) * 3;
        var ux = pos[ia] - pos[ib], uy = pos[ia + 1] - pos[ib + 1], uz = pos[ia + 2] - pos[ib + 2];
        var vx = pos[ja] - pos[jb], vy = pos[ja + 1] - pos[jb + 1], vz = pos[ja + 2] - pos[jb + 2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        var outward = [0, 0, 0]; outward[nA] = s;
        if (nx * outward[0] + ny * outward[1] + nz * outward[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
        nor[k0 * 3] = nx; nor[k0 * 3 + 1] = ny; nor[k0 * 3 + 2] = nz;
      }
    }
    base += nu * nvv;
  });
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setIndex(idx);
  return g;
}

/* open-top rounded-rect basin (sinks, tubs). Rim at y=0, bottom at y=-depth.
   Faces point inward/up (visible from inside).  taper = inset of the floor per side. */
function basinGeo(w, d, depth, rc, rb, taper, cseg) {
  cseg = cseg || 6; taper = taper || 0;
  rb = Math.min(rb, depth * 0.9, (Math.min(w, d) / 2 - taper) * 0.9);
  var rings = [], k;
  var wallSteps = 4;
  for (k = 0; k <= wallSteps; k++) { var t = k / wallSteps; rings.push([taper * t, -(depth - rb) * t]); }
  for (k = 1; k <= 6; k++) { var ph = k / 6 * HALF; rings.push([taper + rb - rb * Math.cos(ph), -depth + rb - rb * Math.sin(ph)]); }
  function ringPts(inset) {
    var hw = w / 2 - inset, hd = d / 2 - inset, r = Math.max(rc - inset, 0.01);
    r = Math.min(r, hw - 1e-4, hd - 1e-4);
    var pts = [], cs = [[hw - r, hd - r, 0], [-(hw - r), hd - r, HALF], [-(hw - r), -(hd - r), PI], [hw - r, -(hd - r), 1.5 * PI]];
    cs.forEach(function (c) { for (var i = 0; i <= cseg; i++) { var a = c[2] + i / cseg * HALF; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } });
    return pts;
  }
  var pos = [], idx = [], N = 0;
  rings.forEach(function (rg) { var pts = ringPts(rg[0]); N = pts.length; pts.forEach(function (p) { pos.push(p[0], rg[1], p[1]); }); });
  var R = rings.length;
  for (k = 0; k < R - 1; k++) for (var i = 0; i < N; i++) {
    var i2 = (i + 1) % N, a = k * N + i, b = k * N + i2, c = (k + 1) * N + i, dd = (k + 1) * N + i2;
    idx.push(a, c, b, b, c, dd);
  }
  // floor cap (fan)
  var ci = pos.length / 3; pos.push(0, -depth, 0);
  var last = (R - 1) * N;
  for (i = 0; i < N; i++) idx.push(ci, last + (i + 1) % N, last + i);
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // orientation check: first wall vertex normal should point toward centre
  var n = g.attributes.normal, px = pos[0], pz = pos[2];
  if (n.getX(0) * px + n.getZ(0) * pz > 0) { flipWinding(g); g.computeVertexNormals(); }
  // floor normal should be +y
  if (g.attributes.normal.getY(ci) < 0) { /* fan winding only */ }
  return g;
}

/* loft through closed rings (each an array of [x,y,z], equal length). capEnd: fan-close the last ring.
   outward: sample point + direction used to orient the winding. */
function loftGeo(rings, capEnd, check) {
  var N = rings[0].length, pos = [], idx = [], k, i;
  rings.forEach(function (r) { r.forEach(function (p) { pos.push(p[0], p[1], p[2]); }); });
  for (k = 0; k < rings.length - 1; k++) for (i = 0; i < N; i++) {
    var i2 = (i + 1) % N, a = k * N + i, b = k * N + i2, c = (k + 1) * N + i, d = (k + 1) * N + i2;
    idx.push(a, b, c, b, d, c);
  }
  if (capEnd) {
    var last = rings[rings.length - 1], cx = 0, cy = 0, cz = 0;
    last.forEach(function (p) { cx += p[0]; cy += p[1]; cz += p[2]; });
    var ci = pos.length / 3; pos.push(cx / N, cy / N, cz / N);
    var L = (rings.length - 1) * N;
    for (i = 0; i < N; i++) idx.push(L + i, L + (i + 1) % N, ci);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  if (check) { // check = [vertexIndex, [dx,dy,dz]] expected normal direction
    var n = g.attributes.normal, vi = check[0], dv = check[1];
    if (n.getX(vi) * dv[0] + n.getY(vi) * dv[1] + n.getZ(vi) * dv[2] < 0) { flipWinding(g); g.computeVertexNormals(); }
  }
  return g;
}

/* rectangular frustum (flat shaded): bottom rect [bx0,bx1]x[bz0,bz1] at y0, top rect at y1 */
function frustumGeo(b, t, y0, y1, caps) {
  var P = [[b[0], y0, b[2]], [b[1], y0, b[2]], [b[1], y0, b[3]], [b[0], y0, b[3]],
           [t[0], y1, t[2]], [t[1], y1, t[2]], [t[1], y1, t[3]], [t[0], y1, t[3]]];
  var F = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  if (caps) { F.push([3, 2, 1, 0]); F.push([4, 5, 6, 7]); }
  var pos = [];
  F.forEach(function (f) {
    [[f[0], f[1], f[2]], [f[0], f[2], f[3]]].forEach(function (tri) { tri.forEach(function (i) { pos.push(P[i][0], P[i][1], P[i][2]); }); });
  });
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // make sure faces point outward (centre test)
  var cx = (b[0] + b[1] + t[0] + t[1]) / 4, cy = (y0 + y1) / 2, cz = (b[2] + b[3] + t[2] + t[3]) / 4;
  var n = g.attributes.normal, p = g.attributes.position;
  if ((p.getX(0) - cx) * n.getX(0) + (p.getY(0) - cy) * n.getY(0) + (p.getZ(0) - cz) * n.getZ(0) < 0) {
    flipWinding(g); g = g.toNonIndexed(); g.computeVertexNormals();
  }
  return g;
}

/* ------------------------------------------------------------------ 2D shapes */
function rrPath(p, w, h, r, cx, cy) {
  cx = cx || 0; cy = cy || 0; r = Math.max(0.0001, Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5));
  var x = cx - w / 2, y = cy - h / 2;
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.absarc(x + w - r, y + r, r, -HALF, 0, false);
  p.lineTo(x + w, y + h - r); p.absarc(x + w - r, y + h - r, r, 0, HALF, false);
  p.lineTo(x + r, y + h); p.absarc(x + r, y + h - r, r, HALF, PI, false);
  p.lineTo(x, y + r); p.absarc(x + r, y + r, r, PI, 1.5 * PI, false);
  return p;
}
function rrShape(w, h, r, cx, cy) { return rrPath(new THREE.Shape(), w, h, r, cx, cy); }
function rrHole(w, h, r, cx, cy) { return rrPath(new THREE.Path(), w, h, r, cx, cy); }
function ellShape(rx, ry, cx, cy, hole) { var s = hole ? new THREE.Path() : new THREE.Shape(); s.absellipse(cx || 0, cy || 0, rx, ry, 0, TAU, false, 0); return s; }
// shape from [x,z] plan points → Shape in (x, -z) so that extrude + M(..,-HALF) lands in plan
function planShape(pts) { return new THREE.Shape(pts.map(function (p) { return new THREE.Vector2(p[0], -p[1]); })); }
// arch-top outline (bottom at y0), rect if archR<=0
function archPath(p, w, h, y0) {
  var r = w / 2, yc = y0 + h - r;
  p.moveTo(-r, y0); p.lineTo(r, y0); p.lineTo(r, yc); p.absarc(0, yc, r, 0, PI, false); p.lineTo(-r, y0);
  return p;
}

/* ------------------------------------------------------------------ builder */
function Builder() { this.parts = {}; this.order = []; this.stack = [new THREE.Matrix4()]; this.objects = []; this.custom = {}; this.flags = {}; }
Builder.prototype.top = function () { return this.stack[this.stack.length - 1]; };
Builder.prototype.push = function (m) { this.stack.push(this.top().clone().multiply(m)); return this; };
Builder.prototype.pop = function () { if (this.stack.length > 1) this.stack.pop(); return this; };
Builder.prototype.add = function (mat, g, m, o) {
  o = o || {};
  clean(g);
  var mm = this.top().clone(); if (m) mm.multiply(m);
  g.applyMatrix4(mm);
  if (mm.determinant() < 0) flipWinding(g);
  if (!o.keepUV && (BOXUV[mat] || o.boxUV)) boxUV(g, o.grainY);
  if (!this.parts[mat]) { this.parts[mat] = []; this.order.push(mat); }
  this.parts[mat].push(g);
  return g;
};
Builder.prototype.useMaterial = function (name, material) { this.custom[name] = material; return this; };
Builder.prototype.object = function (obj, m) { if (m) obj.applyMatrix4(this.top().clone().multiply(m)); else obj.applyMatrix4(this.top().clone()); this.objects.push(obj); return obj; };
// primitives (centre-positioned)
Builder.prototype.box = function (mat, w, h, d, x, y, z, ry, o) { return this.add(mat, new THREE.BoxGeometry(w, h, d), M(x, y, z, 0, ry || 0, 0), o); };
Builder.prototype.boxR = function (mat, w, h, d, x, y, z, rx, ry, rz, o) { return this.add(mat, new THREE.BoxGeometry(w, h, d), M(x, y, z, rx, ry, rz), o); };
Builder.prototype.rbox = function (mat, w, h, d, r, x, y, z, o) {
  o = o || {};
  return this.add(mat, roundedBoxGeo(w, h, d, r, o.seg || (r > 0.04 ? 3 : 1), o.bulge, o.flat), MO(x, y, z, o), o);
};
// box from min/max corners
Builder.prototype.bb = function (mat, x0, y0, z0, x1, y1, z1, r, o) {
  var w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
  if (r) return this.rbox(mat, w, h, d, r, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
  return this.box(mat, w, h, d, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, o);
};
// cylinder along y centred at (x,y,z); o.rx/o.rz to orient
Builder.prototype.cyl = function (mat, rt, rb, h, x, y, z, seg, o) {
  o = o || {};
  return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg || 16, 1, !!o.open), MO(x, y, z, o), o);
};
// cylinder between two points
Builder.prototype.rod = function (mat, a, b, r, seg, o) {
  var A = new THREE.Vector3(a[0], a[1], a[2]), Bv = new THREE.Vector3(b[0], b[1], b[2]);
  var dir = Bv.clone().sub(A), L = dir.length();
  var g = new THREE.CylinderGeometry(r, (o && o.r2) || r, L, seg || 10, 1, !!(o && o.open));
  var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  var m = new THREE.Matrix4().compose(A.clone().add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return this.add(mat, g, m, o);
};
Builder.prototype.sphere = function (mat, r, x, y, z, ws, hs, o) {
  o = o || {};
  return this.add(mat, new THREE.SphereGeometry(r, ws || 16, hs || 12, o.phiStart || 0, o.phiLength || TAU, o.thetaStart || 0, o.thetaLength || PI),
    MO(x, y, z, o), o);
};
// lathe: pts = [[r,y],...]
Builder.prototype.lathe = function (mat, pts, seg, x, y, z, o) {
  o = o || {};
  var v = pts.map(function (p) { return new THREE.Vector2(Math.max(p[0], 0.0001), p[1]); });
  var g = new THREE.LatheGeometry(v, seg || 32, o.phiStart || 0, o.phiLength || TAU);
  if (o.deform) o.deform(g);
  return this.add(mat, g, MO(x, y, z, o), o);
};
Builder.prototype.torus = function (mat, R, r, x, y, z, rs, ts, o) {
  o = o || {};
  return this.add(mat, new THREE.TorusGeometry(R, r, rs || 8, ts || 32, o.arc || TAU), MO(x, y, z, o), o);
};
// tube through points [[x,y,z],...]
Builder.prototype.tube = function (mat, pts, r, segs, rs, o) {
  o = o || {};
  var curve = new THREE.CatmullRomCurve3(pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }), !!o.closed, o.curveType || 'centripetal', o.tension);
  var g = new THREE.TubeGeometry(curve, segs || 32, r, rs || 8, !!o.closed);
  var gg = this.add(mat, g, o.m, o);
  if (o.caps && !o.closed) { // end caps
    var p0 = curve.getPoint(0), p1 = curve.getPoint(1);
    this.sphere(mat, r, p0.x, p0.y, p0.z, rs || 8, 6, { m: null });
    this.sphere(mat, r, p1.x, p1.y, p1.z, rs || 8, 6);
  }
  return gg;
};
Builder.prototype.extrude = function (mat, shapes, depth, m, o) {
  o = o || {};
  var g = new THREE.ExtrudeGeometry(shapes, {
    depth: depth, steps: 1, curveSegments: o.curveSegments || 12,
    bevelEnabled: !!o.bevel, bevelThickness: o.bevel || 0, bevelSize: o.bevelSize !== undefined ? o.bevelSize : (o.bevel || 0),
    bevelOffset: 0, bevelSegments: o.bevelSegments || 3
  });
  if (o.split) { // [capsMat, sidesMat]
    var parts = splitGroups(g), self = this;
    if (parts[0]) self.add(o.split[0], parts[0], m, o);
    if (parts[1]) self.add(o.split[1], parts[1], m, o);
    return g;
  }
  return this.add(mat, g, m, o);
};
Builder.prototype.shape = function (mat, shapes, m, o) { return this.add(mat, new THREE.ShapeGeometry(shapes, (o && o.curveSegments) || 12), m, o); };
Builder.prototype.build = function (kind) {
  var group = new THREE.Group();
  var self = this;
  this.order.forEach(function (k) {
    var geo = mergeGeoms(self.parts[k]);
    var mat = self.custom[k] || FIX.mat(k);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.name = k;
    var glassy = mat.transparent && mat.opacity < 0.95 || NOSHADOW[k];
    mesh.castShadow = !glassy;
    mesh.receiveShadow = true;
    if (mat.transparent) mesh.renderOrder = 2;
    group.add(mesh);
  });
  this.objects.forEach(function (o) { group.add(o); });
  group.name = kind || 'fixture';
  return group;
};

/* ------------------------------------------------------------------ procedural textures */
var TEX = {};
function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
function toTex(c, repeatFeet, color) {
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeatFeet) t.repeat.set(1 / repeatFeet[0], 1 / (repeatFeet[1] || repeatFeet[0]));
  if (color !== false) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}
// draw fn(ctx, ox, oy) at 9 offsets so strokes wrap seamlessly
function wrapDraw(ctx, W, H, fn) { for (var ox = -W; ox <= W; ox += W) for (var oy = -H; oy <= H; oy += H) fn(ox, oy); }
function speckle(ctx, W, H, n, rand, cols, rmin, rmax) {
  for (var i = 0; i < n; i++) {
    ctx.fillStyle = cols[(rand() * cols.length) | 0];
    var r = rmin + rand() * (rmax - rmin);
    ctx.beginPath(); ctx.arc(rand() * W, rand() * H, r, 0, TAU); ctx.fill();
  }
}
function veins(ctx, W, H, rand, n, color, alpha, width, blur, len) {
  for (var v = 0; v < n; v++) {
    var x = rand() * W, y = rand() * H, ang = rand() * TAU, pts = [[x, y]];
    var steps = 30 + (rand() * (len || 60)) | 0;
    for (var s = 0; s < steps; s++) {
      ang += (rand() - 0.5) * 0.6; x += Math.cos(ang) * W / 60; y += Math.sin(ang) * H / 60; pts.push([x, y]);
    }
    var wv = width * (0.4 + rand());
    ctx.save(); ctx.filter = blur ? 'blur(' + blur + 'px)' : 'none';
    ctx.strokeStyle = color; ctx.globalAlpha = alpha * (0.5 + rand() * 0.5); ctx.lineWidth = wv; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    wrapDraw(ctx, W, H, function (ox, oy) {
      ctx.beginPath(); ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
      ctx.stroke();
    });
    ctx.restore();
  }
}
var MAKETEX = {
  marble: function () {
    var W = 1024, c = canvas(W), x = c.getContext('2d'), R = rng(11);
    x.fillStyle = '#f1f1ef'; x.fillRect(0, 0, W, W);
    for (var i = 0; i < 40; i++) { // soft clouds
      var gx = R() * W, gy = R() * W, rr = 80 + R() * 220;
      wrapDraw(x, W, W, function (ox, oy) {
        var g = x.createRadialGradient(gx + ox, gy + oy, 0, gx + ox, gy + oy, rr);
        g.addColorStop(0, 'rgba(200,202,206,0.18)'); g.addColorStop(1, 'rgba(200,202,206,0)');
        x.fillStyle = g; x.fillRect(gx + ox - rr, gy + oy - rr, rr * 2, rr * 2);
      });
    }
    veins(x, W, W, R, 14, '#9a9ea6', 0.35, 10, 6, 80);
    veins(x, W, W, R, 22, '#80858f', 0.55, 2.2, 0.8, 70);
    veins(x, W, W, R, 40, '#a7abb2', 0.45, 0.9, 0, 40);
    return toTex(c, [5, 5]);
  },
  quartz: function () {
    var W = 1024, c = canvas(W), x = c.getContext('2d'), R = rng(23);
    x.fillStyle = '#f7f7f5'; x.fillRect(0, 0, W, W);
    veins(x, W, W, R, 6, '#c9cbcf', 0.25, 14, 10, 90);
    veins(x, W, W, R, 8, '#b4b7bd', 0.28, 1.6, 0.6, 80);
    speckle(x, W, W, 2600, R, ['rgba(160,160,160,0.25)', 'rgba(200,195,185,0.35)', 'rgba(255,255,255,0.6)'], 0.4, 1.4);
    return toTex(c, [6, 6]);
  },
  wood: function (base, dark, seed, repeat, contrast) {
    var W = 512, c = canvas(W), x = c.getContext('2d'), R = rng(seed), i, oy, px, yy;
    contrast = contrast || 1;
    x.fillStyle = base; x.fillRect(0, 0, W, W);
    // broad tonal bands (plank-to-plank / growth variation); grain runs along u (x)
    for (i = 0; i < 26; i++) {
      var by = R() * W, bh = 6 + R() * 40, ph0 = R() * TAU;
      x.fillStyle = R() < 0.5 ? dark : '#ffffff'; x.globalAlpha = (0.025 + R() * 0.05) * contrast;
      for (oy = -W; oy <= W; oy += W) { x.beginPath(); for (px = 0; px <= W; px += 16) { yy = by + oy + Math.sin(px / W * TAU + ph0) * 2; if (px === 0) x.moveTo(px, yy); else x.lineTo(px, yy); }
        for (px = W; px >= 0; px -= 16) { yy = by + bh + oy + Math.sin(px / W * TAU + ph0) * 2; x.lineTo(px, yy); } x.fill(); }
    }
    // fine straight grain lines
    for (i = 0; i < 190; i++) {
      var y0 = R() * W, amp = 0.4 + R() * 1.6, ph = R() * TAU;
      x.strokeStyle = dark; x.globalAlpha = (0.04 + R() * 0.13) * contrast; x.lineWidth = 0.5 + R() * 1.3;
      for (oy = -W; oy <= W; oy += W) {
        x.beginPath();
        for (px = 0; px <= W; px += 8) { yy = y0 + oy + Math.sin(px / W * TAU + ph) * amp; if (px === 0) x.moveTo(px, yy); else x.lineTo(px, yy); }
        x.stroke();
      }
    }
    // a few cathedral flecks + pores
    for (i = 0; i < 420; i++) {
      x.fillStyle = R() < 0.6 ? dark : 'rgba(255,255,255,0.6)'; x.globalAlpha = (0.05 + R() * 0.1) * contrast;
      x.fillRect(R() * W, R() * W, 2 + R() * 14, 0.7);
    }
    x.globalAlpha = 1;
    return toTex(c, repeat || [3, 3]);
  },
  boucle: function () {
    var W = 512, c = canvas(W), x = c.getContext('2d'), R = rng(5);
    x.fillStyle = '#808080'; x.fillRect(0, 0, W, W);
    for (var i = 0; i < 9000; i++) {
      var cx = R() * W, cy = R() * W, r = 1.2 + R() * 2.8, v = (100 + R() * 155) | 0;
      x.strokeStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.lineWidth = 0.8 + R();
      x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke();
    }
    return toTex(c, [1.6, 1.6], false);
  },
  linen: function (seed) {
    var W = 256, c = canvas(W), x = c.getContext('2d'), R = rng(seed || 7);
    x.fillStyle = '#808080'; x.fillRect(0, 0, W, W);
    for (var i = 0; i < W; i += 2) {
      var v = (110 + R() * 50) | 0; x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.6)'; x.fillRect(0, i, W, 1);
      v = (110 + R() * 50) | 0; x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.6)'; x.fillRect(i, 0, 1, W);
    }
    for (i = 0; i < 400; i++) { x.fillStyle = R() < 0.5 ? 'rgba(60,60,60,0.25)' : 'rgba(200,200,200,0.25)'; x.fillRect(R() * W, R() * W, 1 + R() * 14, 1); }
    return toTex(c, [0.5, 0.5], false);
  },
  rattan: function () {
    var W = 512, c = canvas(W), x = c.getContext('2d'), R = rng(9), n = 16, s = W / n;
    x.fillStyle = '#6b4a28'; x.fillRect(0, 0, W, W);
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      var horiz = ((i + j) & 1) === 0, px = i * s, py = j * s;
      var g = horiz ? x.createLinearGradient(px, py, px, py + s) : x.createLinearGradient(px, py, px + s, py);
      var b = 0.9 + R() * 0.2;
      g.addColorStop(0, 'rgb(' + (150 * b | 0) + ',' + (110 * b | 0) + ',' + (62 * b | 0) + ')');
      g.addColorStop(0.5, 'rgb(' + (214 * b | 0) + ',' + (172 * b | 0) + ',' + (112 * b | 0) + ')');
      g.addColorStop(1, 'rgb(' + (140 * b | 0) + ',' + (100 * b | 0) + ',' + (56 * b | 0) + ')');
      x.fillStyle = g;
      if (horiz) { x.fillRect(px - 1, py + 2, s + 2, s - 4); } else { x.fillRect(px + 2, py - 1, s - 4, s + 2); }
      x.strokeStyle = 'rgba(80,50,20,0.35)'; x.lineWidth = 1;
      for (var k = 1; k < 4; k++) { x.beginPath(); if (horiz) { x.moveTo(px, py + k * s / 4); x.lineTo(px + s, py + k * s / 4); } else { x.moveTo(px + k * s / 4, py); x.lineTo(px + k * s / 4, py + s); } x.stroke(); }
    }
    return toTex(c, [0.45, 0.45]);
  },
  subway: function () { // 2 tiles wide (3x6"), 2 courses, running bond → 1ft x 0.5ft
    var W = 512, H = 256, c = canvas(W, H), x = c.getContext('2d'), R = rng(3), gr = 5;
    x.fillStyle = '#d9d8d3'; x.fillRect(0, 0, W, H);
    function tile(tx, ty, tw, th) {
      var g = x.createLinearGradient(0, ty, 0, ty + th), b = 0.97 + R() * 0.03;
      var c0 = (250 * b) | 0, c1 = (240 * b) | 0;
      g.addColorStop(0, 'rgb(' + c0 + ',' + c0 + ',' + (c0 - 2) + ')'); g.addColorStop(0.15, 'rgb(' + c0 + ',' + c0 + ',' + c0 + ')');
      g.addColorStop(0.85, 'rgb(' + c1 + ',' + c1 + ',' + (c1 - 2) + ')'); g.addColorStop(1, 'rgb(' + (c1 - 14) + ',' + (c1 - 14) + ',' + (c1 - 16) + ')');
      x.fillStyle = g; x.fillRect(tx + gr / 2, ty + gr / 2, tw - gr, th - gr);
    }
    for (var row = 0; row < 2; row++) for (var k = -1; k < 3; k++) tile(k * 256 + (row ? 128 : 0), row * 128, 256, 128);
    return toTex(c, [1, 0.5]);
  },
  leather: function () {
    var W = 256, c = canvas(W), x = c.getContext('2d'), R = rng(13);
    x.fillStyle = '#9a5b2e'; x.fillRect(0, 0, W, W);
    speckle(x, W, W, 3000, R, ['rgba(70,35,15,0.12)', 'rgba(190,120,70,0.10)'], 0.6, 2.4);
    return toTex(c, [1, 1]);
  },
  glaze: function () {
    var W = 256, c = canvas(W), x = c.getContext('2d'), R = rng(17);
    x.fillStyle = '#2f5b45'; x.fillRect(0, 0, W, W);
    speckle(x, W, W, 500, R, ['rgba(20,50,35,0.35)', 'rgba(90,140,110,0.25)', 'rgba(60,95,70,0.3)'], 2, 9);
    speckle(x, W, W, 900, R, ['rgba(10,30,20,0.4)'], 0.4, 1);
    return toTex(c, [0.8, 0.8]);
  },
  brushed: function () {
    var W = 256, c = canvas(W), x = c.getContext('2d'), R = rng(19);
    x.fillStyle = '#e4e4e4'; x.fillRect(0, 0, W, W);
    for (var i = 0; i < 700; i++) { var v = (205 + R() * 45) | 0; x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.3)'; x.fillRect(0, R() * W, W, 0.5 + R()); }
    return toTex(c, [1, 1]);
  },
  terrazzoSoil: function () {
    var W = 128, c = canvas(W), x = c.getContext('2d'), R = rng(29);
    x.fillStyle = '#3b2e24'; x.fillRect(0, 0, W, W);
    speckle(x, W, W, 700, R, ['#2a201a', '#55463a', '#6d5b4a'], 0.5, 2);
    return toTex(c, [0.5, 0.5]);
  },
  bark: function () {
    var W = 128, c = canvas(W), x = c.getContext('2d'), R = rng(31);
    x.fillStyle = '#6e6152'; x.fillRect(0, 0, W, W);
    for (var i = 0; i < 160; i++) { x.fillStyle = R() < 0.5 ? 'rgba(40,32,24,0.4)' : 'rgba(150,140,125,0.35)'; x.fillRect(R() * W, R() * W, 1 + R() * 3, 6 + R() * 30); }
    return toTex(c, [0.3, 0.3]);
  }
};
function getTex(name) {
  if (!TEX[name]) {
    switch (name) {
      case 'oakLight': TEX[name] = MAKETEX.wood('#d9c3a0', '#8c6c47', 41, [4, 4], 1.0); break;
      case 'oakMid': TEX[name] = MAKETEX.wood('#c39a6b', '#6e4a2a', 43, [4, 4], 1.1); break;
      case 'walnut': TEX[name] = MAKETEX.wood('#5e3e29', '#2a180d', 47, [4, 4], 1.4); break;
      default: TEX[name] = MAKETEX[name]();
    }
  }
  return TEX[name];
}

/* ------------------------------------------------------------------ materials */
// colours are authored in sRGB hex and converted to linear (renderer.outputEncoding = sRGBEncoding)
function lin(c) { return (c instanceof THREE.Color ? c.clone() : new THREE.Color(c)).convertSRGBToLinear(); }
function std(p) {
  if (p.color !== undefined) p.color = lin(p.color);
  if (p.emissive !== undefined) p.emissive = lin(p.emissive);
  return new THREE.MeshStandardMaterial(p);
}
var BOXUV = { quartz: 1, marble: 1, cabinetOak: 1, wood: 1, woodDark: 1, rattan: 1, fabricLight: 1, fabricDark: 1, fabricOat: 1,
  leather: 1, tileWhite: 1, ceramicGreen: 1, stainless: 1, linenWhite: 1, soil: 1, bark: 1 };
var NOSHADOW = { bulb: 1, lightDisk: 1, glass: 1, glassEdge: 1, glassTint: 1, water: 1, acrylic: 1 };
var MATDEF = {
  porcelain: function () { return std({ color: 0xfbfbf9, roughness: 0.15, metalness: 0 }); },
  enamel: function () { return std({ color: 0xfafaf8, roughness: 0.12, metalness: 0 }); },
  quartz: function () { return std({ color: 0xffffff, map: getTex('quartz'), roughness: 0.25, metalness: 0 }); },
  marble: function () { return std({ color: 0xffffff, map: getTex('marble'), roughness: 0.2, metalness: 0 }); },
  cabinetWhite: function () { return std({ color: 0xf3f2ec, roughness: 0.45, metalness: 0 }); },
  cabinetOak: function () { return std({ color: 0xffffff, map: getTex('oakLight'), roughness: 0.55, metalness: 0 }); },
  stainless: function () { return std({ color: 0xe6e8ea, map: getTex('brushed'), metalness: 0.85, roughness: 0.32 }); },
  chrome: function () { return std({ color: 0xffffff, metalness: 1, roughness: 0.12 }); },
  blackMetal: function () { return std({ color: 0x161617, metalness: 0.5, roughness: 0.5 }); },
  brass: function () { return std({ color: 0xc8a25e, metalness: 1, roughness: 0.35 }); },
  castIron: function () { return std({ color: 0x0e0e0e, metalness: 0.25, roughness: 0.8 }); },
  glass: function () { return std({ color: 0xdff0ea, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }); },
  glassEdge: function () { return std({ color: 0x7fb8a2, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.75, depthWrite: false }); },
  glassTint: function () { return std({ color: 0x3c4542, metalness: 0.3, roughness: 0.04, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }); },
  darkGlass: function () { return std({ color: 0x0c0e10, metalness: 0.3, roughness: 0.06 }); },
  acrylic: function () { return std({ color: 0xf4f8f9, metalness: 0, roughness: 0.2, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }); },
  water: function () { return std({ color: 0xbcd6dc, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.55, depthWrite: false }); },
  mirror: function () { return std({ color: 0xf4f7f6, metalness: 1, roughness: 0.03, envMapIntensity: 1.2 }); },
  fabricLight: function () { var t = getTex('boucle'); return std({ color: 0xefe9de, roughness: 0.95, metalness: 0, bumpMap: t, bumpScale: 0.004, roughnessMap: null }); },
  fabricDark: function () { var t = getTex('linen'); return std({ color: 0x3b3c3e, roughness: 0.92, metalness: 0, bumpMap: t, bumpScale: 0.002 }); },
  fabricOat: function () { var t = getTex('linen'); return std({ color: 0xcdbfa6, roughness: 0.95, metalness: 0, bumpMap: t, bumpScale: 0.003 }); },
  linenWhite: function () { var t = getTex('linen'); return std({ color: 0xf6f4ef, roughness: 0.9, metalness: 0, bumpMap: t, bumpScale: 0.0015 }); },
  wood: function () { return std({ color: 0xffffff, map: getTex('oakMid'), roughness: 0.6, metalness: 0 }); },
  woodDark: function () { return std({ color: 0xffffff, map: getTex('walnut'), roughness: 0.55, metalness: 0 }); },
  rattan: function () { var t = getTex('rattan'); return std({ color: 0xffffff, map: t, bumpMap: t, bumpScale: 0.006, roughness: 0.8, metalness: 0 }); },
  leather: function () { return std({ color: 0xffffff, map: getTex('leather'), roughness: 0.5, metalness: 0 }); },
  tileWhite: function () { return std({ color: 0xffffff, map: getTex('subway'), roughness: 0.2, metalness: 0 }); },
  rubberBlack: function () { return std({ color: 0x141414, roughness: 0.9, metalness: 0 }); },
  plasticWhite: function () { return std({ color: 0xf5f5f3, roughness: 0.35, metalness: 0 }); },
  plasticGrey: function () { return std({ color: 0x8d9092, roughness: 0.45, metalness: 0 }); },
  ceramicGreen: function () { return std({ color: 0xffffff, map: getTex('glaze'), roughness: 0.25, metalness: 0 }); },
  ceramicWhite: function () { return std({ color: 0xf2efe8, roughness: 0.35, metalness: 0 }); },
  terracotta: function () { return std({ color: 0xb8714d, roughness: 0.85, metalness: 0 }); },
  screen: function () { return std({ color: 0x07080a, roughness: 0.08, metalness: 0.4 }); },
  bulb: function () { return std({ color: 0xfff4dc, emissive: 0xffe2b0, emissiveIntensity: 1.6, roughness: 0.3 }); },
  lightDisk: function () { return std({ color: 0xffffff, emissive: 0xfff3e0, emissiveIntensity: 1.4, roughness: 0.5 }); },
  opal: function () { return std({ color: 0xffffff, emissive: 0xfff0d8, emissiveIntensity: 0.55, roughness: 0.4 }); },
  shade: function () { var t = getTex('linen'); return std({ color: 0xf4efe6, emissive: 0xffe9c8, emissiveIntensity: 0.18, roughness: 0.95, bumpMap: t, bumpScale: 0.002, side: THREE.DoubleSide }); },
  leaf: function () { return std({ color: 0x3f6a32, roughness: 0.5, metalness: 0, side: THREE.DoubleSide }); },
  leafOlive: function () { return std({ color: 0x7f8e6b, roughness: 0.75, metalness: 0, side: THREE.DoubleSide }); },
  bark: function () { return std({ color: 0xffffff, map: getTex('bark'), roughness: 0.9, metalness: 0 }); },
  soil: function () { return std({ color: 0xffffff, map: getTex('terrazzoSoil'), roughness: 1, metalness: 0 }); },
  drywall: function () { return std({ color: 0xf4f3ef, roughness: 0.9, metalness: 0 }); },
  flashing: function () { return std({ color: 0x4a4d50, roughness: 0.5, metalness: 0.6 }); },
  frameDark: function () { return std({ color: 0x2b2b2a, roughness: 0.5, metalness: 0.5 }); },
  roofing: function () { return std({ color: 0x8b8d8c, roughness: 0.95, metalness: 0 }); }
};
var MATS = {}, OVERRIDES = {};
FIX.setMaterials = function (map) { for (var k in map) OVERRIDES[k] = map[k]; return FIX; };
FIX.mat = function (name) {
  if (OVERRIDES[name]) return OVERRIDES[name];
  if (!MATS[name]) {
    var f = MATDEF[name];
    if (!f) { if (global.console) console.warn('FIX: unknown material "' + name + '", using grey'); MATS[name] = std({ color: 0x999999, roughness: 0.6 }); }
    else MATS[name] = f();
    MATS[name].name = name;
    if (MATS[name].metalness < 0.5 && MATS[name].envMapIntensity === 1) MATS[name].envMapIntensity = 0.55;
  }
  return MATS[name];
};
FIX.materialNames = function () { return Object.keys(MATDEF); };

/* optional: soft studio environment for reflections (metals, glass, mirror) */
FIX.makeEnvironment = function (renderer) {
  var pm = new THREE.PMREMGenerator(renderer);
  var sc = new THREE.Scene();
  function bx(w, h, d, x, y, z, col, side) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: col, side: side || THREE.FrontSide }));
    m.position.set(x, y, z); sc.add(m); return m;
  }
  bx(40, 14, 40, 0, 6, 0, new THREE.Color(0.42, 0.42, 0.43), THREE.BackSide);       // room
  bx(40, 0.1, 40, 0, -0.9, 0, new THREE.Color(0.12, 0.11, 0.1));                     // floor
  bx(14, 0.2, 6, 0, 12.8, 0, new THREE.Color(6, 6, 5.7));                             // ceiling panels
  bx(6, 0.2, 14, -12, 12.8, 0, new THREE.Color(2.2, 2.2, 2.1));
  bx(0.2, 7, 12, 19.8, 6, 0, new THREE.Color(2.6, 2.7, 2.9));                           // windows
  bx(12, 7, 0.2, 0, 6, -19.8, new THREE.Color(1.5, 1.55, 1.6));
  bx(0.2, 5, 8, -19.8, 5, 6, new THREE.Color(1, 1, 1));
  var tex = pm.fromScene(sc, 0.02).texture;
  pm.dispose();
  return tex;
};

/* ================================================================== shared parts */
function sub(b, kind, o, m) {
  var K = KINDS[kind];
  b.push(m || new THREE.Matrix4());
  K.build(b, opt(K.defaults, o));
  b.pop();
}
var FRAME = 2.75 * IN;
// 5-piece shaker front, front face at zf, centred (cx,cy)
function shakerFront(b, mat, w, h, cx, cy, zf, o) {
  o = o || {};
  var t = DOORT, rec = 0.3 * IN, r = 0.006;
  if (o.slab) { b.rbox(mat, w, h, t, 0.01, cx, cy, zf - t / 2); return; }
  var f = o.frame || FRAME;
  f = Math.max(1.1 * IN, Math.min(f, w * 0.24, h * 0.24));
  var zc = zf - t / 2;
  b.rbox(mat, f, h, t, r, cx - w / 2 + f / 2, cy, zc);
  b.rbox(mat, f, h, t, r, cx + w / 2 - f / 2, cy, zc);
  b.rbox(mat, w - 2 * f + 0.004, f, t, r, cx, cy + h / 2 - f / 2, zc);
  b.rbox(mat, w - 2 * f + 0.004, f, t, r, cx, cy - h / 2 + f / 2, zc);
  if (o.glass) {
    b.box('glass', w - 2 * f + 0.02, h - 2 * f + 0.02, 0.016, cx, cy, zf - t * 0.65);
    if (o.mullions) { // single horizontal mullion for tall glass doors
      b.box(mat, w - 2 * f, 0.07, t * 0.7, cx, cy, zf - t * 0.5);
    }
  } else {
    b.box(mat, w - 2 * f + 0.01, h - 2 * f + 0.01, t - rec, cx, cy, zf - t + (t - rec) / 2);
  }
  return f;
}
function barPull(b, mat, len, x, y, z, vertical) {
  var r = 0.021, so = 0.1, pr = 0.016, inset = 0.045;
  if (vertical) {
    b.cyl(mat, r, r, len, x, y, z + so, 14);
    b.sphere(mat, r, x, y + len / 2, z + so, 12, 6, { thetaLength: HALF });
    b.sphere(mat, r, x, y - len / 2, z + so, 12, 6, { thetaStart: HALF, thetaLength: HALF });
    b.cyl(mat, pr, pr * 1.25, so, x, y + len / 2 - inset, z + so / 2, 10, { rx: HALF });
    b.cyl(mat, pr, pr * 1.25, so, x, y - len / 2 + inset, z + so / 2, 10, { rx: HALF });
  } else {
    b.cyl(mat, r, r, len, x, y, z + so, 14, { rz: HALF });
    b.sphere(mat, r, x + len / 2, y, z + so, 12, 6, { thetaLength: HALF, rz: -HALF });
    b.sphere(mat, r, x - len / 2, y, z + so, 12, 6, { thetaLength: HALF, rz: HALF });
    b.cyl(mat, pr, pr * 1.25, so, x + len / 2 - inset, y, z + so / 2, 10, { rx: HALF });
    b.cyl(mat, pr, pr * 1.25, so, x - len / 2 + inset, y, z + so / 2, 10, { rx: HALF });
  }
}
function knob(b, mat, x, y, z, s) {
  s = s || 1;
  b.lathe(mat, [[0, 0], [0.028 * s, 0], [0.018 * s, 0.03 * s], [0.02 * s, 0.07 * s], [0.05 * s, 0.09 * s], [0.055 * s, 0.11 * s], [0.045 * s, 0.128 * s], [0, 0.132 * s]], 18, x, y, z, { rx: HALF });
}
function pullFor(b, o, kind, frontW, x, y, z, vertical, len) {
  var m = o.hw || 'blackMetal';
  if (o.pull === 'knob') { knob(b, m, x, y, z); return; }
  if (o.pull === 'none') return;
  if (!len) len = vertical ? 5 * IN : (frontW > 2.6 ? 10 * IN : frontW > 1.4 ? 7 * IN : 5 * IN);
  barPull(b, m, len, x, y, z, vertical);
}
/* stacked rows of fronts.  rows: top→bottom {h|f, k:'drawer'|'false'|'doors'|'slabDrawer', n, pull:'top'|'bottom'|'mid', pullY, pullLen, glass} */
function fronts(b, o, x0, x1, y0, y1, rows, zf) {
  var fin = o.finish, H = y1 - y0, fixed = 0, nFill = 0;
  rows.forEach(function (r) { if (r.h) fixed += r.h; else nFill += (r.f || 1); });
  var y = y1;
  rows.forEach(function (r) {
    var rh = r.h || (H - fixed) * (r.f || 1) / nFill;
    var ya = y - rh, yb = y; y = ya;
    var fy0 = ya + GAP / 2, fy1 = yb - GAP / 2, fh = fy1 - fy0, cy = (fy0 + fy1) / 2;
    var X0 = x0 + GAP / 2, X1 = x1 - GAP / 2, W = X1 - X0, cx = (X0 + X1) / 2;
    if (r.k === 'drawer' || r.k === 'false' || r.k === 'slabDrawer') {
      shakerFront(b, fin, W, fh, cx, cy, zf, { slab: r.k === 'slabDrawer' || o.style === 'slab' });
      if (r.k !== 'false') {
        if (r.k === 'slabDrawer' && o.pull === 'none') return;
        if (W > 3.2 && o.pull !== 'knob') { pullFor(b, o, 'drawer', W, cx - W / 4, cy, zf, false, 7 * IN); pullFor(b, o, 'drawer', W, cx + W / 4, cy, zf, false, 7 * IN); }
        else pullFor(b, o, 'drawer', W, cx, cy, zf, false);
      }
    } else if (r.k === 'panel') {
      shakerFront(b, fin, W, fh, cx, cy, zf, {});
    } else {
      var n = r.n || (W > 1.75 ? 2 : 1), dw = (W - (n - 1) * GAP) / n;
      for (var i = 0; i < n; i++) {
        var dcx = X0 + dw / 2 + i * (dw + GAP);
        var f = shakerFront(b, fin, dw, fh, dcx, cy, zf, { glass: r.glass, slab: o.style === 'slab' }) || FRAME;
        var side = n === 1 ? (o.hinge === 'right' ? -1 : 1) : (i < (n - 1) / 2 ? 1 : (i > (n - 1) / 2 ? -1 : 1));
        var len = r.pullLen || (o.pull === 'knob' ? 0 : 5 * IN);
        var px = dcx + side * (dw / 2 - f / 2);
        var py = r.pull === 'bottom' ? fy0 + 0.1 + len / 2 : r.pull === 'mid' ? (r.pullY !== undefined ? r.pullY : cy) : fy1 - 0.1 - len / 2;
        if (o.pull === 'knob') py = r.pull === 'bottom' ? fy0 + 0.2 : r.pull === 'mid' ? (r.pullY !== undefined ? r.pullY : cy) : fy1 - 0.2;
        pullFor(b, o, 'door', dw, px, py, zf, true, len);
      }
    }
  });
}
// counter slab with eased edge and optional holes [{x,z,w,d,r}] (plan coords)
function counterSlab(b, mat, x0, x1, z0, z1, y0, holes, t, ease) {
  t = t || CT; ease = ease || 0.014;
  var w = x1 - x0, d = z1 - z0;
  var sh = rrShape(w - 2 * ease, d - 2 * ease, 0.004, (x0 + x1) / 2, -(z0 + z1) / 2);
  (holes || []).forEach(function (h) {
    if (h.ellipse) sh.holes.push(ellShape(h.w / 2 + ease, h.d / 2 + ease, h.x, -h.z, true));
    else sh.holes.push(rrHole(h.w + 2 * ease, h.d + 2 * ease, (h.r || 0.06) + ease, h.x, -h.z));
  });
  b.extrude(mat, sh, t - 2 * ease, M(0, y0 + ease, 0, -HALF, 0, 0), { bevel: ease, bevelSegments: 2, curveSegments: 14 });
}
function addSink(b, cx, zBack, yUnder, sw, sd, mat, depth, rc, rb) {
  depth = depth || 0.75;
  b.add(mat, basinGeo(sw, sd, depth, rc || 0.07, rb || 0.07, 0.03, 6), M(cx, yUnder, zBack + sd / 2));
  // under-rim flange (hidden lip) so the counter cut-out never shows a gap
  var fl = rrShape(sw + 0.12, sd + 0.12, 0.12, cx, -(zBack + sd / 2)); fl.holes.push(rrHole(sw - 0.004, sd - 0.004, rc || 0.07, cx, -(zBack + sd / 2)));
  b.extrude(mat, fl, 0.01, M(0, yUnder - 0.012, 0, -HALF, 0, 0), {});
  var dz = zBack + sd * 0.62;
  b.lathe('chrome', [[0, 0], [0.085, 0], [0.085, 0.006], [0.07, 0.012], [0.055, 0.004], [0, 0.002]], 28, cx, yUnder - depth + 0.002, dz);
  b.cyl('rubberBlack', 0.05, 0.05, 0.006, cx, yUnder - depth + 0.006, dz, 20);
}

// cabinet box; open:true builds it from panels so an undermount basin inside stays visible
function carcass(b, fin, x0, y0, z0, x1, y1, z1, open) {
  if (!open) { b.bb(fin, x0, y0, z0, x1, y1, z1); return; }
  var t = 0.06;
  b.bb(fin, x0, y0, z0, x0 + t, y1, z1); b.bb(fin, x1 - t, y0, z0, x1, y1, z1);
  b.bb(fin, x0 + t, y0, z0, x1 - t, y0 + t, z1); b.bb(fin, x0 + t, y0, z0, x1 - t, y1, z0 + t);
  b.bb('castIron', x0 + t, y0 + t, z0 + t, x1 - t, y0 + t + 0.004, z1);   // shadowy floor of the sink base
}
/* ================================================================== KITCHEN */
var CAB_DEF = { finish: 'cabinetWhite', hw: 'blackMetal', pull: 'bar', hinge: 'left', style: 'shaker' };
function baseRows(type, w, H) {
  if (type === 'auto') type = w < 1.2 ? 'doors' : 'drawerDoor';
  switch (type) {
    case 'drawers': return H > 2.0 ? [{ h: 0.52, k: 'drawer' }, { f: 0.45, k: 'drawer' }, { f: 0.55, k: 'drawer' }] : [{ f: 1, k: 'drawer' }, { f: 1, k: 'drawer' }];
    case 'sink': return [{ h: 0.52, k: 'false' }, { k: 'doors' }];
    case 'doors': return [{ k: 'doors' }];
    case 'panel': return [{ k: 'panel' }];
    default: return [{ h: 0.52, k: 'drawer' }, { k: 'doors' }];
  }
}
function sides(v) {
  if (v === true || v === 'both') return [1, 1];
  if (v === 'left') return [1, 0];
  if (v === 'right') return [0, 1];
  return [0, 0];
}
function baseCabinet(b, o) {
  var w = o.w, d = o.d, top = o.h - CT, fin = o.finish;
  var ep = sides(o.endPanel), xl = -w / 2 + ep[0] * DOORT, xr = w / 2 - ep[1] * DOORT;
  carcass(b, fin, xl, KICK, 0, xr, top, d - DOORT, o.doors === 'sink');
  b.bb(fin, xl, 0, 0, xr, KICK, d - DOORT - KICKD);
  if (ep[0]) b.bb(fin, -w / 2, 0, 0, xl, top, d, 0.006);
  if (ep[1]) b.bb(fin, xr, 0, 0, w / 2, top, d, 0.006);
  fronts(b, o, xl, xr, KICK, top, baseRows(o.doors, xr - xl, top - KICK), d);
  if (o.counter) {
    var so = Array.isArray(o.sideOverhang) ? o.sideOverhang : [o.sideOverhang, o.sideOverhang];
    var holes = [], sinkOn = o.doors === 'sink' && o.sink;
    var sw = Math.min(w - 0.6, o.sinkW || 2.5), sd = 1.5, cz = (d + o.overhang) / 2 + 0.12;
    if (sinkOn) holes.push({ x: 0, z: cz, w: sw - 0.025, d: sd - 0.025, r: 0.06 });
    counterSlab(b, o.counter, -w / 2 - so[0], w / 2 + so[1], 0, d + o.overhang, top, holes);
    if (o.splash) b.bb(o.counter, -w / 2 - so[0], o.h, 0, w / 2 + so[1], o.h + o.splash, 0.06, 0.008);
    if (sinkOn) {
      addSink(b, 0, cz - sd / 2, top, sw, sd, o.sinkMat || 'stainless', 0.75);
      if (o.faucet) sub(b, 'faucetKitchen', { mountY: o.h, finish: o.faucetFinish }, M(0, 0, cz - sd / 2 - 0.3));
    }
  }
}
def('baseCabinet', 'kitchen', opt(CAB_DEF, { w: 3, d: 2, h: 3, doors: 'auto', counter: 'quartz', overhang: 0.08, sideOverhang: 0, endPanel: false,
  sink: true, sinkW: null, sinkMat: 'stainless', faucet: true, faucetFinish: 'chrome', splash: 0 }),
  baseCabinet, function (o) { return [o.w, o.d + (o.counter ? o.overhang : 0), o.h]; },
  'doors: auto|drawers|sink|doors|panel. counter: quartz|marble|null (null leaves the 1.25" counter zone empty). sideOverhang: number or [left,right]. hw: blackMetal|brass|chrome; pull: bar|knob|none.');

def('counter', 'kitchen', { w: 6, d: 2.08, t: CT, mat: 'quartz', mountY: 3 - CT, holes: [], splash: 0 }, function (b, o) {
  counterSlab(b, o.mat, -o.w / 2, o.w / 2, 0, o.d, o.mountY, o.holes, o.t);
  if (o.splash) b.bb(o.mat, -o.w / 2, o.mountY + o.t, 0, o.w / 2, o.mountY + o.t + o.splash, 0.06, 0.008);
}, function (o) { return [o.w, o.d, o.mountY + o.t]; }, 'Free counter slab; holes [{x,z,w,d,r}] in local plan coords. mountY = underside.');

def('upperCabinet', 'kitchen', opt(CAB_DEF, { w: 3, h: 3, d: 13 * IN, mountY: 4.5, glass: false, crown: false, contents: true }), function (b, o) {
  var w = o.w, y0 = o.mountY, y1 = y0 + o.h, zc = o.d - DOORT, fin = o.finish, th = 0.06;
  if (o.glass) {
    b.bb(fin, -w / 2, y0, 0, -w / 2 + th, y1, zc); b.bb(fin, w / 2 - th, y0, 0, w / 2, y1, zc);
    b.bb(fin, -w / 2, y1 - th, 0, w / 2, y1, zc); b.bb(fin, -w / 2, y0, 0, w / 2, y0 + th, zc);
    b.bb(fin, -w / 2, y0, 0, w / 2, y1, 0.04);
    var ns = Math.max(1, Math.round(o.h / 1.05) - 1);
    for (var i = 1; i <= ns; i++) {
      var ys = y0 + o.h * i / (ns + 1);
      b.bb(fin, -w / 2 + th, ys - 0.05, 0.04, w / 2 - th, ys, zc - 0.03);
    }
    if (o.contents) {
      var R = rng(Math.round(w * 100 + o.h * 10));
      for (i = 0; i <= ns; i++) {
        var yb = i === 0 ? y0 + th : y0 + o.h * i / (ns + 1);
        var x = -w / 2 + 0.25;
        while (x < w / 2 - 0.3) {
          var t = R();
          if (t < 0.4) { // plate stack
            var n = 4 + ((R() * 3) | 0);
            for (var k = 0; k < n; k++) b.lathe('porcelain', [[0, 0], [0.3, 0.0], [0.4, 0.04], [0.38, 0.045], [0.28, 0.012], [0, 0.012]], 18, x + 0.15, yb + k * 0.035, 0.42, { });
            x += 0.95;
          } else if (t < 0.75) { // glasses
            for (k = 0; k < 3; k++) b.lathe('glass', [[0, 0], [0.11, 0], [0.12, 0.38], [0.11, 0.38], [0.1, 0.02], [0, 0.02]], 16, x + k * 0.22, yb, 0.35 + (k % 2) * 0.25);
            x += 0.75;
          } else { // bowls
            for (k = 0; k < 2; k++) b.lathe('porcelain', [[0, 0], [0.12, 0], [0.25, 0.16], [0.28, 0.24], [0.26, 0.24], [0.23, 0.17], [0.1, 0.03], [0, 0.03]], 24, x + 0.2, yb + k * 0.08, 0.45);
            x += 0.7;
          }
        }
      }
    }
  } else {
    b.bb(fin, -w / 2, y0, 0, w / 2, y1, zc);
  }
  var n = w <= 1.75 ? 1 : (w <= 4.2 ? 2 : 3);
  fronts(b, o, -w / 2, w / 2, y0, y1, [{ k: 'doors', n: n, pull: 'bottom', glass: o.glass }], o.d);
  if (o.crown) {
    b.bb(fin, -w / 2 - 0.04, y1, 0, w / 2 + 0.04, y1 + 0.08, o.d + 0.04, 0.005);
    b.bb(fin, -w / 2 - 0.1, y1 + 0.08, 0, w / 2 + 0.1, y1 + 0.3, o.d + 0.1, 0.01);
    b.bb(fin, -w / 2 - 0.13, y1 + 0.3, 0, w / 2 + 0.13, y1 + 0.36, o.d + 0.13, 0.008);
  }
}, function (o) { return [o.w, o.d, o.mountY + o.h]; }, 'Wall cabinet; bottom at mountY. glass:true adds glazed doors, shelves and dishes.');

def('tallCabinet', 'kitchen', opt(CAB_DEF, { w: 2, h: 8, d: 2, split: 5.75 }), function (b, o) {
  var w = o.w, d = o.d, fin = o.finish, top = o.h;
  b.bb(fin, -w / 2, KICK, 0, w / 2, top, d - DOORT);
  b.bb(fin, -w / 2, 0, 0, w / 2, KICK, d - DOORT - KICKD);
  var n = w <= 1.75 ? 1 : 2;
  fronts(b, o, -w / 2, w / 2, KICK, top, [
    { h: top - o.split, k: 'doors', n: n, pull: 'bottom' },
    { k: 'doors', n: n, pull: 'mid', pullY: 3.6, pullLen: 12 * IN }], d);
}, function (o) { return [o.w, o.d, o.h]; }, 'Pantry / tall cabinet with upper and lower doors (split = height of the break).');

def('island', 'kitchen', opt(CAB_DEF, { w: 7, d: 3.5, h: 3, seatingSide: 'front', overhang: 1.0, counter: 'quartz', sink: false, faucetFinish: 'chrome', waterfall: false, cabDepth: 2 }), function (b, o) {
  var w = o.w, d = o.d, top = o.h - CT, ov = 0.08, fin = o.finish;
  if (o.seatingSide === 'back') b.push(M(0, 0, d, 0, PI, 0));
  var endOv = o.waterfall ? CT : 0.08;
  var x0 = -w / 2 + endOv, x1 = w / 2 - endOv;
  var zBack = d - (o.seatingSide === 'none' ? ov : o.overhang);
  var cd = Math.min(o.cabDepth, zBack - ov);
  // cabinet run facing −z (working side)
  var inner = x1 - x0 - 2 * DOORT;
  var segs = inner >= 5.5 ? [1.5, inner - 3, 1.5] : inner >= 3.5 ? [1.5, inner - 1.5] : [inner];
  var types = segs.length === 3 ? ['drawers', o.sink ? 'sink' : 'doors', 'drawers'] : segs.length === 2 ? ['drawers', o.sink ? 'sink' : 'doors'] : [o.sink ? 'sink' : 'doors'];
  var xc = x0 + DOORT, sinkX = null;
  segs.forEach(function (sw, i) {
    var cx = xc + sw / 2;
    sub(b, 'baseCabinet', { w: sw, d: cd, h: o.h, doors: types[i], counter: null, finish: fin, hw: o.hw, pull: o.pull }, M(-cx, 0, ov + cd, 0, PI, 0));
    if (types[i] === 'sink') sinkX = -cx;
    xc += sw;
  });
  // end panels + filler to the seating-side back panel
  b.bb(fin, x0, 0, ov, x0 + DOORT, top, zBack, 0.006);
  b.bb(fin, x1 - DOORT, 0, ov, x1, top, zBack, 0.006);
  if (zBack - (ov + cd) > 0.01) b.bb(fin, x0 + DOORT, 0, ov + cd, x1 - DOORT, top, zBack - DOORT);
  if (o.seatingSide !== 'none') {
    // seating-side panel with applied shaker panels
    var np = Math.max(1, Math.round((x1 - x0) / 2.2)), pw = (x1 - x0) / np;
    for (var i = 0; i < np; i++) shakerFront(b, fin, pw - 0.004, top - 0.02, x0 + pw * (i + 0.5), top / 2 + 0.01, zBack, {});
    b.bb(fin, x0, 0, zBack, x1, 0.3, zBack + 0.03, 0.005); // base shoe
  } else {
    sub(b, 'baseCabinet', { w: x1 - x0 - 2 * DOORT, d: zBack - ov - cd, h: o.h, doors: 'doors', counter: null, finish: fin, hw: o.hw, pull: o.pull }, M(0, 0, ov + cd));
  }
  var holes = [], sw = 2.5, sd = 1.5, cz = ov + cd / 2 + 0.05;
  if (o.sink && sinkX !== null) holes.push({ x: sinkX, z: cz, w: sw - 0.025, d: sd - 0.025, r: 0.06 });
  counterSlab(b, o.counter || 'quartz', -w / 2, w / 2, 0, d, top, holes);
  if (o.waterfall) {
    b.bb(o.counter || 'quartz', -w / 2, 0, 0, -w / 2 + CT, top + 0.001, d, 0.012);
    b.bb(o.counter || 'quartz', w / 2 - CT, 0, 0, w / 2, top + 0.001, d, 0.012);
  }
  if (o.sink && sinkX !== null) {
    addSink(b, sinkX, cz - sd / 2, top, sw, sd, 'stainless', 0.75);
    sub(b, 'faucetKitchen', { mountY: o.h, finish: o.faucetFinish }, M(sinkX, 0, cz + sd / 2 + 0.3, 0, PI, 0));
  }
  if (o.seatingSide === 'back') b.pop();
}, function (o) { return [o.w, o.d, o.h]; }, 'Cabinets face the working side; seatingSide front(+z)|back(-z)|none. overhang = knee-space depth. waterfall: quartz end panels.');

def('sinkUndermount', 'kitchen', { w: 2.5, d: 1.5, depth: 0.75, mountY: 3 - CT, mat: 'stainless', cutout: false }, function (b, o) {
  addSink(b, 0, 0, o.mountY, o.w, o.d, o.mat, o.depth);
  if (o.cutout) counterSlab(b, 'quartz', -o.w / 2 - 0.5, o.w / 2 + 0.5, -0.3, o.d + 0.4, o.mountY, [{ x: 0, z: o.d / 2, w: o.w - 0.025, d: o.d - 0.025, r: 0.06 }]);
}, function (o) { return [o.w + 0.12, o.d + 0.12, o.mountY]; }, 'Origin = centre of the bowl\'s back rim edge at y=mountY (counter underside). Counter cut-out = w-0.025 × d-0.025, r=0.06. cutout:true adds a demo counter.');

def('faucetKitchen', 'kitchen', { mountY: 3, finish: 'chrome', reach: 0.75, height: 1.35 }, function (b, o) {
  var m = o.finish, y = o.mountY, z0 = 0.1, R = o.reach / 2;
  b.lathe(m, [[0, 0], [0.1, 0], [0.1, 0.01], [0.088, 0.02], [0, 0.022]], 28, 0, y, z0);
  b.lathe(m, [[0, 0.02], [0.074, 0.02], [0.074, 0.05], [0.064, 0.085], [0.058, 0.36], [0.05, 0.42], [0, 0.425]], 28, 0, y, z0);
  // side lever
  b.cyl(m, 0.034, 0.034, 0.07, 0.085, y + 0.3, z0, 18, { rz: HALF });
  b.rod(m, [0.115, y + 0.3, z0], [0.15, y + 0.5, z0 + 0.03], 0.016, 10);
  b.sphere(m, 0.018, 0.15, y + 0.5, z0 + 0.03, 10, 6);
  // gooseneck
  var cy = y + o.height - R, pts = [[0, y + 0.40, z0], [0, y + 0.6, z0], [0, cy - 0.15, z0]];
  for (var k = 0; k <= 12; k++) { var th = k / 12 * PI; pts.push([0, cy + R * Math.sin(th), z0 + R - R * Math.cos(th)]); }
  pts.push([0, cy - 0.06, z0 + 2 * R]);
  b.tube(m, pts, 0.04, 64, 12);
  // pull-down spray head
  var hz = z0 + 2 * R;
  b.cyl(m, 0.043, 0.043, 0.02, 0, cy - 0.05, hz, 20);
  b.lathe(m, [[0, 0], [0.04, 0], [0.05, 0.01], [0.051, 0.2], [0.046, 0.3], [0, 0.3]], 22, 0, cy - 0.37, hz);
  b.cyl('rubberBlack', 0.038, 0.038, 0.006, 0, cy - 0.372, hz, 18);
  b.box('rubberBlack', 0.03, 0.06, 0.006, 0, cy - 0.17, hz + 0.05);
}, function (o) { return [0.3, 0.2 + o.reach, o.mountY + o.height]; }, 'Gooseneck pull-down. Origin = back edge of the deck plate (base centre at z=0.1) on the counter at mountY.');

def('range36', 'kitchen', { w: 3, d: 2.25, h: 3, backguard: 'low', knobs: 'stainless' }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, ff = d - 0.12; // front face of body
  var ct = h - 0.08; // cooktop deck
  b.bb('blackMetal', -w / 2 + 0.08, 0, 0.2, w / 2 - 0.08, 0.32, ff - 0.12);
  b.bb('stainless', -w / 2, 0.32, 0, w / 2, ct, ff);
  b.bb('stainless', -w / 2, ct - 0.04, 0, w / 2, ct, ff + 0.08, 0.012);
  b.bb('castIron', -w / 2 + 0.07, ct, 0.22, w / 2 - 0.07, ct + 0.006, ff - 0.02);
  // control band
  b.bb('stainless', -w / 2 + 0.01, ct - 0.4, ff - 0.02, w / 2 - 0.01, ct - 0.04, ff + 0.06, 0.012);
  var nk = 7, ky = ct - 0.22, kz = ff + 0.06;
  for (var i = 0; i < nk; i++) {
    var kx = -w / 2 + 0.3 + i * (w - 0.6) / (nk - 1);
    b.cyl('blackMetal', 0.085, 0.085, 0.012, kx, ky, kz + 0.004, 24, { rx: HALF });
    b.lathe(o.knobs, [[0, 0], [0.072, 0], [0.074, 0.02], [0.064, 0.032], [0.06, 0.1], [0.055, 0.112], [0, 0.114]], 24, kx, ky, kz, { rx: HALF });
    b.box(o.knobs, 0.022, 0.1, 0.05, kx, ky, kz + 0.13);
  }
  // oven door
  var dy0 = 0.36, dy1 = ct - 0.44;
  b.rbox('stainless', w - 0.04, dy1 - dy0, 0.11, 0.03, 0, (dy0 + dy1) / 2, ff + 0.03, { seg: 2 });
  b.rbox('darkGlass', w - 0.9, 0.82, 0.03, 0.05, 0, dy0 + 0.95, ff + 0.08, { seg: 2 });
  b.rbox('blackMetal', w - 0.8, 0.92, 0.02, 0.06, 0, dy0 + 0.95, ff + 0.077, { seg: 2 });
  var hy = dy1 - 0.17, hz = ff + 0.27;
  b.cyl('stainless', 0.045, 0.045, w - 0.5, 0, hy, hz, 20, { rz: HALF });
  [-1, 1].forEach(function (s) {
    b.sphere('stainless', 0.045, s * (w / 2 - 0.25), hy, hz, 16, 8);
    b.lathe('stainless', [[0, 0], [0.045, 0], [0.035, 0.08], [0.03, 0.19], [0, 0.19]], 16, s * (w / 2 - 0.35), hy, ff + 0.085, { rx: HALF });
  });
  // burners + grates (2 rows x 3)
  var bx = [-w / 3, 0, w / 3], bz = [0.66, ff - 0.62], gy = ct + 0.075;
  bx.forEach(function (x) {
    bz.forEach(function (z) {
      b.lathe('castIron', [[0, 0], [0.17, 0], [0.165, 0.025], [0.12, 0.03], [0, 0.03]], 24, x, ct, z);
      b.lathe('stainless', [[0, 0], [0.13, 0], [0.13, 0.02], [0, 0.02]], 24, x, ct + 0.025, z);
      b.lathe('castIron', [[0, 0], [0.105, 0], [0.11, 0.022], [0.09, 0.035], [0, 0.038]], 24, x, ct + 0.045, z);
    });
    var gx0 = x - w / 6 + 0.03, gx1 = x + w / 6 - 0.03, gz0 = 0.26, gz1 = ff - 0.2, t = 0.055;
    b.bb('castIron', gx0, gy - 0.04, gz0, gx1, gy, gz0 + t);
    b.bb('castIron', gx0, gy - 0.04, gz1 - t, gx1, gy, gz1);
    b.bb('castIron', gx0, gy - 0.04, gz0, gx0 + t, gy, gz1);
    b.bb('castIron', gx1 - t, gy - 0.04, gz0, gx1, gy, gz1);
    var zm = (bz[0] + bz[1]) / 2;
    b.bb('castIron', gx0, gy - 0.04, zm - t / 2, gx1, gy, zm + t / 2);
    bz.forEach(function (z) {
      var ri = 0.13;
      b.bb('castIron', gx0, gy - 0.03, z - t / 2, x - ri, gy, z + t / 2);
      b.bb('castIron', x + ri, gy - 0.03, z - t / 2, gx1, gy, z + t / 2);
      var za = z < zm ? gz0 : zm, zb = z < zm ? zm : gz1;
      b.bb('castIron', x - t / 2, gy - 0.03, za, x + t / 2, gy, z - ri);
      b.bb('castIron', x - t / 2, gy - 0.03, z + ri, x + t / 2, gy, zb);
    });
    // grate feet
    [[gx0, gz0], [gx1, gz0], [gx0, gz1], [gx1, gz1]].forEach(function (p) { b.cyl('rubberBlack', 0.025, 0.025, 0.04, p[0] + (p[0] < x ? 0.03 : -0.03), ct + 0.02, p[1] + (p[1] < zm ? 0.03 : -0.03), 8); });
  });
  if (o.backguard === 'low') b.bb('stainless', -w / 2, ct - 0.04, 0, w / 2, ct + 0.33, 0.14, 0.012);
  if (o.backguard === 'high') { b.bb('stainless', -w / 2, ct - 0.04, 0, w / 2, ct + 1.0, 0.14, 0.012); b.bb('stainless', -w / 2, ct + 0.94, 0, w / 2, ct + 1.0, 0.75, 0.012); }
  // feet / legs
  [-1, 1].forEach(function (s) { b.cyl('stainless', 0.05, 0.05, 0.3, s * (w / 2 - 0.15), 0.15, ff - 0.25, 12); });
}, function (o) { return [o.w, o.d + 0.27, o.h + (o.backguard === 'low' ? 0.33 : o.backguard === 'high' ? 1.0 : 0)]; }, 'Pro-style 36" gas range, 6 burners, continuous cast-iron grates. backguard: low|high|none.');

def('hoodChimney', 'kitchen', { w: 3, d: 1.75, mountY: 6.0, toCeiling: 8.5, chimneyW: 1.0, chimneyD: 0.83 }, function (b, o) {
  var w = o.w, d = o.d, y0 = o.mountY, sk = 0.3, cw = o.chimneyW, cd = o.chimneyD, yP = y0 + sk, yT = y0 + sk + 0.95;
  b.rbox('stainless', w, sk, d, 0.015, 0, y0 + sk / 2, d / 2, { seg: 1 });
  b.add('stainless', frustumGeo([-w / 2 + 0.01, w / 2 - 0.01, 0, d - 0.01], [-cw / 2, cw / 2, 0, cd], yP, yT, false));
  if (o.toCeiling > yT) b.bb('stainless', -cw / 2, yT, 0, cw / 2, o.toCeiling, cd);
  // underside baffles + lights
  b.bb('blackMetal', -w / 2 + 0.06, y0 - 0.002, 0.06, w / 2 - 0.06, y0 + 0.02, d - 0.06);
  var nf = 3;
  for (var i = 0; i < nf; i++) {
    var fx = -w / 2 + 0.14 + (w - 0.28) * (i + 0.5) / nf, fw = (w - 0.28) / nf - 0.04;
    for (var k = 0; k < 9; k++) b.box('stainless', 0.03, 0.03, d - 0.4, fx - fw / 2 + fw * (k + 0.5) / 9, y0 + 0.004, d / 2 - 0.05, 0);
  }
  [-1, 1].forEach(function (s) { b.cyl('lightDisk', 0.09, 0.09, 0.01, s * (w / 2 - 0.35), y0 - 0.006, d - 0.18, 20); });
  // controls on the front lip
  for (i = 0; i < 4; i++) b.cyl('blackMetal', 0.025, 0.025, 0.012, w / 2 - 0.2 - i * 0.12, y0 + sk / 2, d + 0.004, 14, { rx: HALF });
}, function (o) { return [o.w, o.d, o.toCeiling]; }, 'Chimney wall hood; bottom of skirt at mountY, chimney cover runs to toCeiling.');

def('fridgeFrenchDoor', 'kitchen', { w: 3, h: 6, d: 2.5, dispenser: false }, function (b, o) {
  var w = o.w, h = o.h, d = o.d, zf = d - 0.24, dt = 0.2, fy = 0.32 + 1.55;
  b.bb('stainless', -w / 2, 0.3, 0, w / 2, h, zf);
  b.bb('blackMetal', -w / 2 + 0.03, 0, zf - 0.3, w / 2 - 0.03, 0.31, zf);
  for (var i = 0; i < 10; i++) b.box('castIron', 0.12, 0.012, 0.02, -w / 2 + 0.4 + i * (w - 0.8) / 9, 0.16, zf + 0.002);
  // freezer drawer
  b.rbox('stainless', w - 0.02, fy - 0.33, dt, 0.035, 0, (0.33 + fy) / 2, zf + dt / 2, { seg: 2 });
  // french doors
  var dh = h - 0.02 - (fy + 0.03), dyc = fy + 0.03 + dh / 2;
  [-1, 1].forEach(function (s) {
    b.rbox('stainless', w / 2 - 0.015, dh, dt, 0.035, s * (w / 4 + 0.0035), dyc, zf + dt / 2, { seg: 2 });
    var hx = s * 0.17, hl = 2.6, hyc = fy + 0.45 + hl / 2, hz = zf + dt + 0.18;
    b.cyl('stainless', 0.042, 0.042, hl, hx, hyc, hz, 20);
    b.sphere('stainless', 0.042, hx, hyc + hl / 2, hz, 14, 6, { thetaLength: HALF });
    b.sphere('stainless', 0.042, hx, hyc - hl / 2, hz, 14, 6, { thetaStart: HALF, thetaLength: HALF });
    [hyc + hl / 2 - 0.12, hyc - hl / 2 + 0.12].forEach(function (yy) {
      b.lathe('stainless', [[0, 0], [0.04, 0], [0.032, 0.06], [0.028, 0.19], [0, 0.19]], 16, hx, yy, zf + dt, { rx: HALF });
    });
  });
  // drawer handle
  var hy = fy - 0.25, hz2 = zf + dt + 0.18, hlen = w - 0.6;
  b.cyl('stainless', 0.042, 0.042, hlen, 0, hy, hz2, 20, { rz: HALF });
  [-1, 1].forEach(function (s) {
    b.sphere('stainless', 0.042, s * hlen / 2, hy, hz2, 14, 8);
    b.lathe('stainless', [[0, 0], [0.04, 0], [0.032, 0.06], [0.028, 0.19], [0, 0.19]], 16, s * (hlen / 2 - 0.12), hy, zf + dt, { rx: HALF });
  });
  if (o.dispenser) {
    b.rbox('darkGlass', 0.75, 1.0, 0.03, 0.06, -w / 4 - 0.08, 4.15, zf + dt + 0.005, { seg: 2 });
  }
}, function (o) { return [o.w, o.d + 0.25, o.h]; }, 'Stainless French-door fridge with bottom freezer drawer; d = body+doors (handles add ~0.25).');

def('dishwasher', 'kitchen', { w: 2, h: 3 - CT, d: 2, panel: 'stainless', hw: 'blackMetal' }, function (b, o) {
  var w = o.w, h = o.h, d = o.d;
  b.bb('stainless', -w / 2 + 0.02, 0.33, 0, w / 2 - 0.02, h, d - 0.1);
  b.bb('blackMetal', -w / 2 + 0.03, 0, 0.2, w / 2 - 0.03, 0.34, d - KICKD - 0.06);
  if (o.panel === 'stainless') {
    b.rbox('stainless', w - 0.02, h - 0.38, 0.1, 0.02, 0, 0.36 + (h - 0.38) / 2, d - 0.05, { seg: 2 });
    var hy = h - 0.3, hz = d + 0.12, L = w - 0.4;
    b.cyl('stainless', 0.04, 0.04, L, 0, hy, hz, 20, { rz: HALF });
    [-1, 1].forEach(function (s) {
      b.sphere('stainless', 0.04, s * L / 2, hy, hz, 14, 8);
      b.lathe('stainless', [[0, 0], [0.036, 0], [0.03, 0.05], [0.026, 0.12], [0, 0.12]], 14, s * (L / 2 - 0.1), hy, d, { rx: HALF });
    });
    b.box('darkGlass', 0.3, 0.008, 0.06, w / 2 - 0.4, h - 0.005, d - 0.08);
  } else {
    var fin = o.panel === true || o.panel === 'cabinet' ? 'cabinetWhite' : o.panel;
    fronts(b, { finish: fin, hw: o.hw, pull: 'bar' }, -w / 2, w / 2, KICK, h, [{ k: 'drawer' }], d);
  }
}, function (o) { return [o.w, o.d + 0.16, o.h]; }, 'Under-counter dishwasher (top at counter underside). panel: stainless|cabinet|<material>.');

def('microwaveDrawer', 'kitchen', opt(CAB_DEF, { w: 2.5, d: 2, h: 3, counter: 'quartz', overhang: 0.08, cabinet: true, mountY: 1.6 }), function (b, o) {
  function unit(cx, y0, z) {
    var mw = 2.0, mh = 1.25;
    b.rbox('stainless', mw, mh, 0.08, 0.02, cx, y0 + mh / 2, z - 0.04, { seg: 1 });
    b.rbox('darkGlass', mw - 0.5, 0.62, 0.02, 0.04, cx, y0 + 0.5, z + 0.002, { seg: 2 });
    b.box('darkGlass', mw - 0.06, 0.16, 0.02, cx, y0 + mh - 0.1, z + 0.002);
    b.cyl('lightDisk', 0.02, 0.02, 0.01, cx + mw / 2 - 0.22, y0 + mh - 0.1, z + 0.013, 10, { rx: HALF });
    b.box('stainless', mw - 0.3, 0.04, 0.03, cx, y0 + mh - 0.22, z + 0.01);
    b.bb('blackMetal', cx - mw / 2, y0, -0.0, cx + mw / 2, y0 + mh, z - 0.08);
  }
  if (!o.cabinet) { unit(0, o.mountY, 2.0); return; }
  var w = o.w, d = o.d, top = o.h - CT, fin = o.finish;
  b.bb(fin, -w / 2, KICK, 0, w / 2, top, d - DOORT);
  b.bb(fin, -w / 2, 0, 0, w / 2, KICK, d - DOORT - KICKD);
  var my0 = top - 0.12 - 1.25;
  // frame around the unit
  b.bb(fin, -w / 2 + GAP, my0 - 0.02, d - DOORT, w / 2 - GAP, top - GAP, d, 0.004);
  unit(0, my0, d + 0.04);
  fronts(b, o, -w / 2, w / 2, KICK, my0 - 0.03, [{ k: 'drawer' }], d);
  if (o.counter) counterSlab(b, o.counter, -w / 2, w / 2, 0, d + o.overhang, top, []);
}, function (o) { return o.cabinet ? [o.w, o.d + o.overhang, o.h] : [2, 2.05, o.mountY + 1.25]; }, 'Base cabinet with 24" microwave drawer over a deep drawer. cabinet:false → appliance only, bottom at mountY.');

def('barStool', 'kitchen', { seatH: 2.1, frame: 'blackMetal', seat: 'rattan', back: false }, function (b, o) {
  var sH = o.seatH, cz = 0.75, f = o.frame;
  b.lathe(o.seat, [[0, sH - 0.13], [0.58, sH - 0.13], [0.65, sH - 0.11], [0.685, sH - 0.06], [0.68, sH - 0.015], [0.64, sH + 0.012], [0.45, sH + 0.008], [0.2, sH - 0.008], [0, sH - 0.01]], 40, 0, 0, cz);
  b.torus(f, 0.6, 0.026, 0, sH - 0.15, cz, 8, 40, { rx: HALF });
  var top = sH - 0.16;
  for (var i = 0; i < 4; i++) {
    var a = PI / 4 + i * HALF, ca = Math.cos(a), sa = Math.sin(a);
    b.rod(f, [0.5 * ca, top, cz + 0.5 * sa], [0.72 * ca, 0.02, cz + 0.72 * sa], 0.032, 10);
    b.cyl('rubberBlack', 0.034, 0.034, 0.03, 0.72 * ca, 0.015, cz + 0.72 * sa, 10);
  }
  var fy = 0.72, fr = 0.72 + (0.5 - 0.72) * (fy / top);
  b.torus(f, fr - 0.005, 0.022, 0, fy, cz, 8, 40, { rx: HALF });
  if (o.back) {
    b.lathe(o.seat, [[0.6, sH + 0.35], [0.66, sH + 0.35], [0.66, sH + 0.75], [0.6, sH + 0.75]], 30, 0, 0, cz, { phiStart: PI * 0.62, phiLength: PI * 0.76 });
    for (i = 0; i < 2; i++) { var aa = PI * 0.62 + 0.1 + i * (PI * 0.76 - 0.2); b.rod(f, [0.6 * Math.sin(aa), sH - 0.12, cz + 0.6 * Math.cos(aa)], [0.62 * Math.sin(aa), sH + 0.55, cz + 0.62 * Math.cos(aa)], 0.02, 8); }
  }
}, function (o) { return [1.5, 1.5, o.seatH + (o.back ? 0.75 : 0)]; }, 'Counter stool (seatH 2.1 for 36" counters, 2.5 for 42" bars). Woven rattan seat on black steel legs.');

/* ================================================================== BATH */
def('toilet', 'bath', { lid: 'closed', mat: 'porcelain', button: 'chrome' }, function (b, o) {
  var m = o.mat, zc = 1.6, ez = 1.34, seat = m === 'porcelain' ? 'plasticWhite' : m, N = 64, rim = 1.25;
  // one continuous skirted body: egg-shaped plan sections → rim deck → glazed bowl interior
  function egg(y, hw, zb, zf) {
    var r = [], zm = (zf + zb) / 2, hl = (zf - zb) / 2;
    for (var i = 0; i < N; i++) {
      var t = i / N * TAU, sn = Math.sin(t), cs = Math.cos(t), nz = cs > 0 ? 2.1 : 3.6;
      r.push([hw * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / 2.6), y, zm + hl * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / nz)]);
    }
    return r;
  }
  function ell(y, rr, zcc) { var r = []; for (var i = 0; i < N; i++) { var t = i / N * TAU; r.push([rr * Math.sin(t), y, (zcc || zc) + rr * ez * Math.cos(t)]); } return r; }
  var rings = [
    egg(0.0, 0.43, 0.42, 2.18), egg(0.03, 0.455, 0.4, 2.21), egg(0.3, 0.46, 0.37, 2.24), egg(0.7, 0.5, 0.35, 2.3), egg(1.0, 0.56, 0.34, 2.37),
    egg(1.17, 0.595, 0.34, 2.41), egg(rim - 0.025, 0.6, 0.35, 2.415), egg(rim - 0.004, 0.588, 0.37, 2.405), egg(rim, 0.57, 0.39, 2.39),
    ell(rim, 0.47), ell(rim - 0.015, 0.44), ell(rim - 0.09, 0.415), ell(1.05, 0.37), ell(0.93, 0.3), ell(0.86, 0.21)
  ];
  b.add(m, loftGeo(rings, true, [N * 3, [0, 0, 1]]));
  b.cyl('water', 0.2, 0.2, 0.004, 0, 0.875, zc + 0.02, 32, { sz: ez });
  // integrated low-profile tank
  b.rbox(m, 1.22, 0.95, 0.6, 0.15, 0, rim - 0.05 + 0.475, 0.36, { seg: 4 });
  b.rbox(m, 1.26, 0.085, 0.64, 0.04, 0, rim + 0.9 + 0.04, 0.365, { seg: 3 });
  var ty = rim + 0.985;
  b.lathe(o.button, [[0, 0], [0.075, 0], [0.075, 0.012], [0.065, 0.022], [0, 0.024]], 28, 0, ty, 0.39);
  b.box('plasticGrey', 0.004, 0.026, 0.11, 0, ty + 0.017, 0.39);
  // seat ring (superellipse section) following the rim
  var sp = [], R = 0.49, hw = 0.096, hh = 0.03, yc = rim + 0.004 + hh;
  for (var i = 0; i <= 28; i++) {
    var a = i / 28 * TAU, c = Math.cos(a), sN = Math.sin(a);
    sp.push([R + hw * Math.sign(c) * Math.pow(Math.abs(c), 0.45), yc + hh * Math.sign(sN) * Math.pow(Math.abs(sN), 0.45)]);
  }
  b.lathe(seat, sp, 56, 0, 0, zc, { sz: ez });
  var lid = [[0, 0], [0.565, 0], [0.588, 0.008], [0.596, 0.024], [0.587, 0.04], [0.55, 0.05], [0.3, 0.056], [0, 0.058]];
  var hz = zc - 0.6 * ez + 0.02, ly = rim + 0.066;
  [-0.34, 0.34].forEach(function (x) {
    b.rbox(seat, 0.12, 0.06, 0.11, 0.025, x, rim + 0.03, hz - 0.03, { seg: 2 });
    b.cyl(o.button, 0.02, 0.02, 0.13, x, rim + 0.05, hz - 0.03, 12, { rz: HALF });
  });
  if (o.lid === 'open') {
    b.push(M(0, ly, hz - 0.03, -1.62, 0, 0));
    b.lathe(seat, lid, 56, 0, 0, zc - hz + 0.03, { sz: ez });
    b.pop();
  } else {
    b.lathe(seat, lid, 56, 0, ly, zc, { sz: ez });
  }
}, function () { return [1.26, 2.42, 2.25]; }, 'Elongated one-piece skirted toilet (single lofted body + glazed bowl), 12" rough-in (drain 1.0 ft from wall). lid: closed|open.');

/* bath faucet: origin = back edge of the deck flange; base centre at z=0.07 */
def('faucetBath', 'bath', { mountY: 2.83, style: 'widespread', finish: 'chrome', spread: 8 * IN, handle: 'lever' }, function (b, o) {
  var m = o.finish, y = o.mountY, z0 = 0.07;
  function flange(x, r) { b.lathe(m, [[0, 0], [r, 0], [r, 0.01], [r * 0.85, 0.02], [0, 0.022]], 24, x, y, z0); }
  if (o.style === 'single') {
    flange(0, 0.08);
    b.lathe(m, [[0, 0.02], [0.05, 0.02], [0.048, 0.5], [0.044, 0.52], [0, 0.522]], 24, 0, y, z0);
    b.tube(m, [[0, y + 0.42, z0], [0, y + 0.43, z0 + 0.15], [0, y + 0.42, z0 + 0.32], [0, y + 0.38, z0 + 0.38]], 0.024, 24, 12);
    b.cyl(m, 0.026, 0.026, 0.04, 0, y + 0.37, z0 + 0.385, 14);
    b.cyl('rubberBlack', 0.018, 0.018, 0.004, 0, y + 0.348, z0 + 0.385, 12);
    b.cyl(m, 0.03, 0.03, 0.05, 0, y + 0.545, z0, 14);
    b.rod(m, [0, y + 0.56, z0], [0, y + 0.6, z0 + 0.22], 0.014, 10);
    b.sphere(m, 0.016, 0, y + 0.6, z0 + 0.22, 10, 6);
    return;
  }
  // widespread: arc spout + two handles
  flange(0, 0.075);
  b.lathe(m, [[0, 0.02], [0.05, 0.02], [0.044, 0.2], [0, 0.205]], 24, 0, y, z0);
  var R = 0.16, cy = y + 0.3, pts = [[0, y + 0.18, z0], [0, cy - 0.04, z0]];
  for (var k = 0; k <= 10; k++) { var th = k / 10 * PI; pts.push([0, cy + R * Math.sin(th), z0 + R - R * Math.cos(th)]); }
  pts.push([0, cy - 0.05, z0 + 2 * R]);
  b.tube(m, pts, 0.026, 40, 10);
  b.cyl(m, 0.03, 0.03, 0.04, 0, cy - 0.06, z0 + 2 * R, 16);
  b.cyl('rubberBlack', 0.022, 0.022, 0.004, 0, cy - 0.081, z0 + 2 * R, 12);
  [-1, 1].forEach(function (s) {
    var x = s * o.spread / 2;
    flange(x, 0.06);
    b.lathe(m, [[0, 0.02], [0.04, 0.02], [0.036, 0.12], [0.03, 0.14], [0, 0.142]], 20, x, y, z0);
    if (o.handle === 'cross') {
      for (var i = 0; i < 4; i++) { var a = PI / 4 + i * HALF; b.rod(m, [x, y + 0.13, z0], [x + 0.09 * Math.cos(a), y + 0.14, z0 + 0.09 * Math.sin(a)], 0.012, 8); b.sphere(m, 0.018, x + 0.09 * Math.cos(a), y + 0.14, z0 + 0.09 * Math.sin(a), 8, 6); }
    } else {
      b.rod(m, [x, y + 0.12, z0], [x + s * 0.03, y + 0.15, z0 + 0.2], 0.013, 10, { r2: 0.016 });
      b.sphere(m, 0.016, x + s * 0.03, y + 0.15, z0 + 0.2, 10, 6);
    }
  });
}, function (o) { return [o.style === 'single' ? 0.2 : o.spread + 0.15, 0.45, o.mountY + 0.5]; }, 'style: widespread|single; handle: lever|cross. Origin = back edge of the deck flange at counter height mountY.');

def('vanity', 'bath', { w: 4, d: 1.75, h: 2.83, sinks: 1, top: 'marble', style: 'shaker', finish: null, hw: 'brass', pull: 'bar',
  faucet: 'widespread', faucetFinish: 'chrome', splash: 4 * IN, basin: 'oval', overhang: 0.06 }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, top = h - CT, floating = o.style === 'floating';
  var fin = o.finish || (floating ? 'cabinetOak' : 'cabinetWhite');
  var cab = { finish: fin, hw: o.hw, pull: o.pull, style: floating ? 'slab' : 'shaker' };
  var cabD = d - o.overhang, secs;
  if (o.sinks === 2) secs = w >= 5.5 ? [{ t: 's', w: (w - 1.5) / 2 }, { t: 'd', w: 1.5 }, { t: 's', w: (w - 1.5) / 2 }] : [{ t: 's', w: w / 2 }, { t: 's', w: w / 2 }];
  else secs = w >= 4.5 ? [{ t: 'd', w: 1.25 }, { t: 's', w: w - 2.5 }, { t: 'd', w: 1.25 }] : [{ t: 's', w: w }];
  var y0 = floating ? top - 1.55 : KICK;
  carcass(b, fin, -w / 2, y0, 0, w / 2, top, cabD - DOORT, true);
  if (!floating) b.bb(fin, -w / 2, 0, 0, w / 2, KICK, cabD - DOORT - KICKD);
  var x = -w / 2, basins = [];
  secs.forEach(function (s) {
    var rows;
    if (floating) rows = [{ f: 1, k: 'drawer' }, { f: 1.2, k: 'drawer' }];
    else rows = s.t === 's' ? [{ h: 0.45, k: 'false' }, { k: 'doors' }] : [{ h: 0.6, k: 'drawer' }, { f: 1, k: 'drawer' }, { f: 1, k: 'drawer' }];
    fronts(b, cab, x, x + s.w, y0, top, rows, cabD);
    if (s.t === 's') basins.push(x + s.w / 2);
    x += s.w;
  });
  var bw = 1.42, bd = 1.12, cz = cabD / 2 + 0.1, holes = [];
  basins.forEach(function (bx) {
    holes.push(o.basin === 'oval' ? { x: bx, z: cz, w: bw - 0.03, d: bd - 0.03, ellipse: true } : { x: bx, z: cz, w: bw - 0.03, d: bd - 0.03, r: 0.14 });
  });
  counterSlab(b, o.top, -w / 2, w / 2, 0, d, top, holes);
  if (o.splash) b.bb(o.top, -w / 2, h, 0, w / 2, h + o.splash, 0.06, 0.006);
  basins.forEach(function (bx) {
    if (o.basin === 'oval') {
      b.lathe('porcelain', [[0.5, 0], [0.5, -0.03], [0.47, -0.14], [0.4, -0.27], [0.28, -0.37], [0.14, -0.41], [0, -0.42]], 40, bx, top, cz, { sx: bw, sy: 1.15, sz: bd });
      var fl = ellShape(bw / 2 + 0.08, bd / 2 + 0.08, bx, -cz); fl.holes.push(ellShape(bw / 2 - 0.002, bd / 2 - 0.002, bx, -cz, true));
      b.extrude('porcelain', fl, 0.02, M(0, top - 0.02, 0, -HALF, 0, 0), { curveSegments: 24 });
      b.lathe('chrome', [[0, 0], [0.07, 0], [0.07, 0.006], [0.055, 0.01], [0, 0.008]], 24, bx, top - 0.483, cz);
    } else {
      addSink(b, bx, cz - bd / 2, top, bw, bd, 'porcelain', 0.5, 0.14, 0.14);
    }
    if (o.faucet) sub(b, 'faucetBath', { mountY: h, style: o.faucet, finish: o.faucetFinish }, M(bx, 0, cz - bd / 2 - 0.31));
  });
}, function (o) { return [o.w, o.d, o.h + (o.splash || 0)]; }, 'Bath vanity with undermount basin(s) and faucet(s). style shaker (toe kick, white) | floating (wall-hung oak, 18.6" box). basin oval|rect.');

function frameMat(f) { return f === 'thin black' || f === 'black' ? 'blackMetal' : f === 'brass' ? 'brass' : f === 'oak' ? 'wood' : f === 'chrome' ? 'chrome' : f === 'walnut' ? 'woodDark' : null; }
function outline(p, shape, w, h, y0) {
  if (shape === 'round') { p.absarc(0, y0 + w / 2, w / 2, 0, TAU, false); return p; }
  if (shape === 'arch') return archPath(p, w, h, y0);
  return rrPath(p, w, h, 0.02, 0, y0 + h / 2);
}
def('mirror', 'bath', { w: 2.5, h: 3.25, mountY: 3.75, frame: 'thin black', shape: 'rect', fw: 0.07 }, function (b, o) {
  var w = o.w, h = o.shape === 'round' ? o.w : o.h, y0 = o.mountY, fm = frameMat(o.frame), fw = fm ? o.fw : 0;
  if (fm) {
    var fs = outline(new THREE.Shape(), o.shape, w, h, y0);
    fs.holes.push(outline(new THREE.Path(), o.shape, w - 2 * fw, h - 2 * fw, y0 + fw));
    var cs = o.shape === 'rect' ? 4 : 40;
    b.extrude(fm, fs, 0.06, M(0, 0, 0.01), { bevel: 0.008, bevelSegments: 2, curveSegments: cs });
    b.extrude('mirror', outline(new THREE.Shape(), o.shape, w - fw * 1.2, h - fw * 1.2, y0 + fw * 0.6), 0.015, M(0, 0, 0.03), { curveSegments: cs });
  } else {
    b.extrude('mirror', outline(new THREE.Shape(), o.shape, w - 0.01, h - 0.01, y0 + 0.005), 0.02, M(0, 0, 0.012), { bevel: 0.005, bevelSegments: 2, curveSegments: o.shape === 'rect' ? 4 : 40 });
    b.extrude('frameDark', outline(new THREE.Shape(), o.shape, w - 0.3, h - 0.3, y0 + 0.15), 0.012, M(0, 0, 0), { curveSegments: 24 });
  }
}, function (o) { return [o.w, 0.09, o.mountY + (o.shape === 'round' ? o.w : o.h)]; }, 'frame: none|thin black|brass|oak|walnut|chrome; shape: rect|arch|round. Bottom edge at mountY.');

def('medicineCabinet', 'bath', { w: 1.5, h: 2.17, d: 0.33, mountY: 3.9, recessed: true }, function (b, o) {
  var w = o.w, h = o.h, y0 = o.mountY, z = o.recessed ? 0 : o.d - 0.07;
  if (!o.recessed) b.bb('plasticWhite', -w / 2 + 0.01, y0 + 0.01, 0, w / 2 - 0.01, y0 + h - 0.01, z, 0.01);
  b.rbox('stainless', w, h, 0.07, 0.012, 0, y0 + h / 2, z + 0.035, { seg: 2 });
  b.extrude('mirror', rrShape(w - 0.02, h - 0.02, 0.01, 0, y0 + h / 2), 0.01, M(0, 0, z + 0.07), { bevel: 0.004, bevelSegments: 1 });
}, function (o) { return [o.w, o.recessed ? 0.08 : o.d, o.mountY + o.h]; }, 'Mirrored medicine cabinet; recessed:true leaves only the 1" door proud of the wall.');

def('tubAlcove', 'bath', { w: 5, d: 2.5, h: 1.67, drain: 'left', spout: true, finish: 'chrome' }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, rim = 0.12, m = 'enamel', ds = o.drain === 'left' ? -1 : 1;
  var bw = w - 0.6, bd = d - 0.68, bcx = -ds * 0.04, bcz = d / 2 - 0.05, depth = h - rim - 0.17;
  counterSlab(b, m, -w / 2, w / 2, 0, d, h - rim, [{ x: bcx, z: bcz, w: bw, d: bd, r: 0.32 }], rim, 0.03);
  b.rbox(m, w, h - 0.02, 0.22, 0.05, 0, (h - 0.02) / 2, d - 0.11, { seg: 3 });
  b.add(m, basinGeo(bw + 0.03, bd + 0.03, depth, 0.33, 0.24, 0.13, 7), M(bcx, h - rim + 0.002, bcz));
  var fy = h - rim - depth;
  var dx = bcx + ds * (bw / 2 - 0.5);
  b.lathe('chrome', [[0, 0], [0.09, 0], [0.09, 0.008], [0.07, 0.014], [0, 0.012]], 24, dx, fy + 0.002, bcz);
  for (var i = -2; i <= 2; i++) b.box('castIron', 0.01, 0.004, 0.09, dx + i * 0.025, fy + 0.016, bcz);
  // overflow on the drain-end wall
  var ox = bcx + ds * (bw / 2 - 0.1);
  b.lathe('chrome', [[0, 0], [0.12, 0], [0.12, 0.01], [0.09, 0.025], [0, 0.028]], 24, ox, h - 0.55, bcz, { rz: ds * HALF });
  if (o.spout) {
    var sx = ds * w / 2, sy = h + 0.4;
    b.lathe(o.finish, [[0, 0], [0.11, 0], [0.11, 0.012], [0.08, 0.03], [0, 0.03]], 24, sx, sy, bcz, { rz: ds * HALF });
    b.rbox(o.finish, 0.55, 0.1, 0.16, 0.045, sx - ds * 0.3, sy, bcz, { seg: 3 });
    b.box('rubberBlack', 0.1, 0.006, 0.1, sx - ds * 0.5, sy - 0.051, bcz);
  }
}, function (o) { return [o.w, o.d, o.h]; }, 'Alcove tub with integral apron; drain end left|right; spout mounts on the drain-end wall.');

def('tubFreestanding', 'bath', { w: 5.5, d: 2.67, h: 1.92, filler: false, finish: 'chrome' }, function (b, o) {
  var R = o.d / 2, h = o.h, sx = o.w / o.d;
  b.lathe('enamel', [[0, 0], [R * 0.72, 0], [R * 0.76, 0.025], [R * 0.82, 0.22], [R * 0.92, h * 0.58], [R * 0.985, h - 0.13], [R, h - 0.04], [R - 0.012, h - 0.002],
    [R - 0.07, h - 0.002], [R - 0.085, h - 0.03], [R - 0.1, h - 0.18], [R * 0.84, h * 0.45], [R * 0.66, 0.34], [R * 0.4, 0.22], [0, 0.2]], 72, 0, 0, R, { sx: sx });
  var dx = -o.w * 0.25;
  b.lathe('chrome', [[0, 0], [0.08, 0], [0.08, 0.008], [0.06, 0.014], [0, 0.012]], 24, dx, 0.215, R);
  if (o.filler) {
    var fx = o.w / 2 + 0.38, m = o.finish;
    b.lathe(m, [[0, 0], [0.13, 0], [0.13, 0.015], [0.1, 0.03], [0, 0.03]], 24, fx, 0, R);
    b.cyl(m, 0.045, 0.05, 2.75, fx, 1.4, R, 20);
    b.tube(m, [[fx, 2.7, R], [fx, 2.95, R], [fx - 0.12, 3.12, R], [fx - 0.38, 3.12, R], [fx - 0.55, 3.0, R], [fx - 0.6, 2.88, R]], 0.035, 40, 12);
    b.cyl(m, 0.04, 0.04, 0.06, fx - 0.6, 2.85, R, 14);
    b.rod(m, [fx, 2.45, R], [fx + 0.1, 2.5, R + 0.15], 0.014, 8);
    b.cyl(m, 0.035, 0.035, 0.45, fx + 0.06, 2.0, R, 14);
  }
}, function (o) { return [o.w + (o.filler ? 0.9 : 0), o.d, o.h]; }, 'Oval soaking tub (lathe shell). filler:true adds a floor-mount filler at the +x end.');

def('showerGlass', 'bath', { w: 3, h: 6.5, door: true, doorW: 2, finish: 'chrome', curbH: 0, bar: 0 }, function (b, o) {
  var t = 0.375 * IN, y0 = o.curbH + 0.04, y1 = o.curbH + o.h, m = o.finish, w = o.w;
  function pane(x0, x1) {
    b.box('glass', x1 - x0, y1 - y0, t, (x0 + x1) / 2, (y0 + y1) / 2, 0);
    b.box('glassEdge', 0.006, y1 - y0, t * 1.02, x0 + 0.003, (y0 + y1) / 2, 0);
    b.box('glassEdge', 0.006, y1 - y0, t * 1.02, x1 - 0.003, (y0 + y1) / 2, 0);
    b.box('glassEdge', x1 - x0, 0.006, t * 1.02, (x0 + x1) / 2, y1 - 0.003, 0);
    b.box('glassEdge', x1 - x0, 0.006, t * 1.02, (x0 + x1) / 2, y0 + 0.003, 0);
  }
  function clamp2(x, y, ax) { b.rbox(m, ax ? 0.2 : 0.16, 0.18, 0.11, 0.025, x, y, 0, { seg: 2 }); }
  if (o.curbH > 0) b.bb('marble', -w / 2, 0, -0.2, w / 2, o.curbH, 0.25, 0.015);
  if (!o.door) {
    pane(-w / 2 + 0.02, w / 2);
    clamp2(-w / 2 + 0.07, y0 + 0.8); clamp2(-w / 2 + 0.07, y1 - 0.8);
    [-w / 4, w / 4].forEach(function (x) { b.rbox(m, 0.3, 0.12, 0.09, 0.015, x, y0 + 0.04, 0, { seg: 1 }); });
    if (o.bar > 0) { b.rod(m, [w / 2 - 0.1, y1 - 0.15, 0], [w / 2 - 0.1, y1 - 0.15, -o.bar], 0.025, 12); b.sphere(m, 0.06, w / 2 - 0.1, y1 - 0.15, -o.bar, 12, 8); }
    return;
  }
  var g = 0.03, xd1 = w / 2 - g, xd0 = xd1 - o.doorW, xf1 = xd0 - g;
  if (xf1 > -w / 2 + 0.3) { pane(-w / 2 + 0.02, xf1); clamp2(-w / 2 + 0.07, y0 + 0.8); clamp2(-w / 2 + 0.07, y1 - 0.8); }
  pane(xd0, xd1);
  [y0 + 0.75, y1 - 0.75].forEach(function (y) { b.rbox(m, 0.26, 0.22, 0.1, 0.02, xd0 - g / 2, y, 0, { seg: 2 }); });
  var px = xd1 - 0.28;
  [-1, 1].forEach(function (s) {
    b.cyl(m, 0.025, 0.025, 1.0, px, 3.4 + o.curbH, s * 0.13, 16);
    [0.42, -0.42].forEach(function (dy) { b.cyl(m, 0.018, 0.018, 0.13, px, 3.4 + o.curbH + dy, s * 0.065, 10, { rx: HALF }); });
  });
}, function (o) { return [o.w, 0.3, o.h + o.curbH]; }, 'Frameless 3/8" glass on the z=0 line. door:true → fixed panel (at -x) + hinged door (+x); bar = support-bar length toward -z for fixed panels.');

def('showerHead', 'bath', { mountY: 6.75, style: 'rain', finish: 'chrome', dia: 0.67 }, function (b, o) {
  var y = o.mountY, m = o.finish;
  b.lathe(m, [[0, 0], [0.11, 0], [0.11, 0.012], [0.07, 0.03], [0, 0.03]], 24, 0, y, 0, { rx: HALF });
  if (o.style === 'rain') {
    b.tube(m, [[0, y, 0.02], [0, y + 0.03, 0.5], [0, y + 0.04, 1.0], [0, y + 0.0, 1.18], [0, y - 0.12, 1.22]], 0.032, 40, 12);
    var hy = y - 0.15;
    b.lathe(m, [[0, 0], [o.dia / 2 - 0.02, 0], [o.dia / 2, 0.015], [o.dia / 2 - 0.01, 0.035], [0.05, 0.045], [0, 0.05]], 48, 0, hy, 1.22);
    b.cyl('plasticGrey', o.dia / 2 - 0.035, o.dia / 2 - 0.035, 0.004, 0, hy - 0.001, 1.22, 40);
  } else {
    b.tube(m, [[0, y, 0.02], [0, y - 0.05, 0.22], [0, y - 0.16, 0.38]], 0.028, 20, 10);
    b.lathe(m, [[0, 0], [0.04, 0], [0.13, 0.1], [0.14, 0.13], [0, 0.135]], 28, 0, y - 0.18, 0.4, { rx: -0.9 });
  }
}, function (o) { return [o.dia, o.style === 'rain' ? 1.6 : 0.6, o.mountY + 0.1]; }, 'Wall arm shower head; arm centre at mountY. style rain (8" disc) | classic.');

def('showerValve', 'bath', { mountY: 3.75, finish: 'chrome', diverter: false }, function (b, o) {
  var y = o.mountY, m = o.finish;
  b.lathe(m, [[0, 0], [0.29, 0], [0.29, 0.012], [0.26, 0.03], [0, 0.034]], 40, 0, y, 0, { rx: HALF });
  b.lathe(m, [[0, 0.03], [0.07, 0.03], [0.065, 0.12], [0.05, 0.14], [0, 0.145]], 24, 0, y, 0, { rx: HALF });
  b.rod(m, [0, y, 0.13], [0.33, y - 0.02, 0.17], 0.018, 10, { r2: 0.024 });
  b.sphere(m, 0.024, 0.33, y - 0.02, 0.17, 10, 6);
  if (o.diverter) b.lathe(m, [[0, 0], [0.06, 0], [0.05, 0.06], [0, 0.065]], 16, 0, y + 0.18, 0.03, { rx: HALF });
}, function (o) { return [0.6, 0.2, o.mountY + 0.3]; }, 'Pressure-balance valve trim; centre at mountY.');

def('towelBar', 'bath', { w: 2, mountY: 4, finish: 'chrome' }, function (b, o) {
  var y = o.mountY, m = o.finish, L = o.w;
  [-1, 1].forEach(function (s) {
    b.lathe(m, [[0, 0], [0.06, 0], [0.06, 0.01], [0.045, 0.03], [0.03, 0.2], [0, 0.2]], 18, s * L / 2, y, 0, { rx: HALF });
  });
  b.cyl(m, 0.03, 0.03, L + 0.04, 0, y, 0.21, 16, { rz: HALF });
}, function (o) { return [o.w + 0.12, 0.25, o.mountY + 0.06]; }, 'Towel bar; bar centre line at mountY.');

def('sconce', 'bath', { mountY: 6.5, finish: 'brass', shade: 'cylinder' }, function (b, o) {
  var y = o.mountY, m = o.finish;
  b.lathe(m, [[0, 0], [0.19, 0], [0.19, 0.012], [0.16, 0.035], [0, 0.04]], 28, 0, y, 0, { rx: HALF });
  b.rod(m, [0, y, 0.03], [0, y, 0.34], 0.025, 12);
  if (o.shade === 'globe') {
    b.lathe(m, [[0, 0], [0.07, 0], [0.075, 0.06], [0, 0.06]], 20, 0, y - 0.03, 0.42);
    b.sphere('opal', 0.24, 0, y + 0.2, 0.42, 28, 18);
  } else {
    b.lathe(m, [[0, 0], [0.12, 0], [0.12, 0.05], [0.115, 0.06], [0, 0.06]], 24, 0, y - 0.32, 0.42);
    b.cyl(m, 0.012, 0.012, 0.3, 0, y - 0.17, 0.42, 8);
    b.cyl('opal', 0.15, 0.15, 0.62, 0, y + 0.05, 0.42, 32);
    b.lathe(m, [[0, 0], [0.115, 0], [0.12, 0.04], [0, 0.045]], 24, 0, y + 0.36, 0.42);
  }
}, function (o) { return [0.4, 0.66, o.mountY + 0.4]; }, 'Bath sconce, opal glass. shade cylinder|globe. Backplate centre at mountY.');

/* ================================================================== LAUNDRY */
MATDEF.applianceGraphite = function () { return std({ color: 0x3a3c3f, roughness: 0.35, metalness: 0.35 }); };
MATDEF.bottleGlass = function () { return std({ color: 0x2b4a32, roughness: 0.08, metalness: 0.2 }); };
function laundryUnit(b, o, y0, dryer) {
  var w = o.w, d = o.d, h = o.h, m = o.color === 'graphite' ? 'applianceGraphite' : 'plasticWhite';
  var ring = dryer ? (o.color === 'graphite' ? 'blackMetal' : 'plasticGrey') : 'chrome';
  b.rbox(m, w, h - 0.07, d - 0.04, 0.06, 0, y0 + 0.07 + (h - 0.07) / 2, (d - 0.04) / 2, { seg: 3 });
  [[-1, 0.3], [1, 0.3], [-1, d - 0.3], [1, d - 0.3]].forEach(function (p) { b.cyl('rubberBlack', 0.06, 0.07, 0.075, p[0] * (w / 2 - 0.2), y0 + 0.037, p[1], 12); });
  var zf = d - 0.04, py = y0 + h - 0.23;
  b.bb(m, -w / 2 + 0.05, py - 0.17, zf - 0.02, w / 2 - 0.05, py + 0.17, zf + 0.012, 0.01);
  if (!dryer) {
    b.rbox(m, 0.62, 0.25, 0.03, 0.02, -w / 2 + 0.42, py, zf + 0.02, { seg: 2 });
    b.box('plasticGrey', 0.3, 0.025, 0.012, -w / 2 + 0.42, py - 0.08, zf + 0.036);
  }
  var kx = dryer ? -0.35 : 0.0;
  b.cyl('chrome', 0.13, 0.13, 0.025, kx, py, zf + 0.025, 32, { rx: HALF });
  b.lathe(m, [[0, 0], [0.105, 0], [0.105, 0.05], [0.095, 0.06], [0, 0.065]], 32, kx, py, zf + 0.03, { rx: HALF });
  b.box('plasticGrey', 0.016, 0.07, 0.01, kx, py + 0.06, zf + 0.098);
  b.rbox('darkGlass', 0.6, 0.17, 0.02, 0.02, dryer ? 0.35 : w / 2 - 0.5, py, zf + 0.018, { seg: 2 });
  for (var i = 0; i < 3; i++) b.cyl('lightDisk', 0.012, 0.012, 0.005, (dryer ? 0.2 : w / 2 - 0.65) + i * 0.1, py - 0.03, zf + 0.03, 8, { rx: HALF });
  // door
  var cy = y0 + h * 0.43, R = 0.66;
  b.torus(ring, R, 0.075, 0, cy, zf + 0.06, 12, 56);
  b.torus('rubberBlack', R - 0.09, 0.03, 0, cy, zf + 0.05, 8, 48);
  b.cyl(m === 'plasticWhite' ? 'plasticGrey' : 'blackMetal', R + 0.075, R + 0.075, 0.03, 0, cy, zf + 0.0, 48, { rx: HALF });
  var cap = 0.62, sr = 1.1, th = Math.asin(cap / sr);
  b.sphere(dryer ? 'glassTint' : 'glassTint', sr, 0, cy, zf + 0.09 - sr * Math.cos(th) + 0.0, 40, 6, { thetaLength: th, rx: HALF });
  b.cyl('stainless', R - 0.12, R - 0.12, 0.6, 0, cy, zf - 0.32, 40, { rx: HALF, open: true });
  b.cyl('plasticGrey', R - 0.12, R - 0.12, 0.01, 0, cy, zf - 0.62, 40, { rx: HALF });
  b.box('plasticGrey', 0.04, 0.3, 0.03, R + 0.12, cy, zf + 0.03);
}
def('washerFront', 'laundry', { w: 2.25, d: 2.6, h: 3.17, color: 'white', stacked: false }, function (b, o) {
  laundryUnit(b, o, 0, false);
  if (o.stacked) laundryUnit(b, o, o.h + 0.02, true);
}, function (o) { return [o.w, o.d + 0.1, o.stacked ? o.h * 2 + 0.02 : o.h]; }, 'Front-load washer; stacked:true adds the matching dryer on top. color white|graphite.');
def('dryerFront', 'laundry', { w: 2.25, d: 2.6, h: 3.17, color: 'white', stacked: false, mountY: 0 }, function (b, o) {
  laundryUnit(b, o, o.mountY, true);
}, function (o) { return [o.w, o.d + 0.1, o.mountY + o.h]; }, 'Front-load dryer; mountY to stack (3.19 on a washer).');

def('beverageCooler', 'laundry', { w: 1.25, h: 3 - CT, d: 2, hinge: 'left', bottles: true }, function (b, o) {
  var w = o.w, h = o.h, d = o.d, zf = d - 0.12, x0 = -w / 2 + 0.01, x1 = w / 2 - 0.01, y0 = 0.3, z1 = zf - 0.1;
  // open-front black cabinet so racks and bottles show through the door
  b.bb('blackMetal', x0, y0, 0, x0 + 0.07, h, z1); b.bb('blackMetal', x1 - 0.07, y0, 0, x1, h, z1);
  b.bb('blackMetal', x0, h - 0.07, 0, x1, h, z1); b.bb('blackMetal', x0, y0, 0, x1, y0 + 0.09, z1);
  b.bb('blackMetal', x0, y0, 0, x1, h, 0.06);
  b.bb('stainless', x0 + 0.07, y0 + 0.09, 0.06, x1 - 0.07, h - 0.07, 0.075);
  b.bb('castIron', -w / 2 + 0.01, 0, 0.2, w / 2 - 0.01, 0.3, zf - 0.1);
  b.bb('blackMetal', -w / 2 + 0.03, 0.02, zf - 0.11, w / 2 - 0.03, 0.29, zf - 0.09);
  [-1, 1].forEach(function (sx) { b.bb('lightDisk', sx * (w / 2 - 0.1) - 0.012, y0 + 0.15, z1 - 0.12, sx * (w / 2 - 0.1) + 0.012, h - 0.12, z1 - 0.1); });
  var nr = 5;
  for (var r = 0; r < nr; r++) {
    var ry = 0.45 + r * (h - 0.75) / nr;
    b.bb('stainless', x0 + 0.07, ry, 0.08, x1 - 0.07, ry + 0.02, z1 - 0.02);
    if (o.bottles) for (var k = 0; k < 3; k++) {
      var bxp = -w / 2 + 0.25 + k * (w - 0.5) / 2;
      b.lathe('bottleGlass', [[0, 0], [0.12, 0], [0.125, 0.02], [0.125, 0.75], [0.1, 0.85], [0.045, 0.95], [0.045, 1.12], [0.05, 1.14], [0, 1.15]], 14, bxp, ry + 0.145, z1 - 0.06, { rx: -HALF });
      b.cyl('brass', 0.05, 0.05, 0.06, bxp, ry + 0.145, z1 - 0.06 - 1.12, 10, { rx: HALF });
    }
  }
  // door: stainless frame + tinted glass
  var t = 0.1, y0 = 0.33, y1 = h - 0.02;
  b.bb('stainless', -w / 2, y0, zf - t, -w / 2 + 0.12, y1, zf, 0.012);
  b.bb('stainless', w / 2 - 0.12, y0, zf - t, w / 2, y1, zf, 0.012);
  b.bb('stainless', -w / 2 + 0.12, y1 - 0.14, zf - t, w / 2 - 0.12, y1, zf, 0.012);
  b.bb('stainless', -w / 2 + 0.12, y0, zf - t, w / 2 - 0.12, y0 + 0.14, zf, 0.012);
  b.box('glassTint', w - 0.22, y1 - y0 - 0.26, 0.02, 0, (y0 + y1) / 2, zf - 0.04);
  var hx = (o.hinge === 'left' ? 1 : -1) * (w / 2 - 0.08), hl = 1.9;
  b.cyl('stainless', 0.032, 0.032, hl, hx, (y0 + y1) / 2, zf + 0.12, 16);
  [hl / 2 - 0.1, -hl / 2 + 0.1].forEach(function (dy) { b.cyl('stainless', 0.022, 0.026, 0.12, hx, (y0 + y1) / 2 + dy, zf + 0.06, 10, { rx: HALF }); });
}, function (o) { return [o.w, o.d + 0.15, o.h]; }, 'Under-counter wine/beverage cooler with stainless-framed glass door, racks and bottles.');

/* ================================================================== LIGHTING (origin = ceiling point, hangs toward -y) */
function canopy(b, m, r, hgt) { b.lathe(m, [[0, -hgt], [r * 0.85, -hgt * 0.92], [r, -hgt * 0.25], [r, 0], [0, 0]], 32, 0, 0, 0); }
def('recessedLight', 'lighting', { dia: 4 * IN, trim: 'plasticWhite', light: false, intensity: 0.6, square: false }, function (b, o) {
  var r = o.dia / 2, R = r + 0.085;
  if (o.square) {
    b.bb(o.trim, -R, -0.014, -R, R, 0, R, 0.006);
    b.bb('castIron', -r, -0.016, -r, r, -0.013, r);
    b.bb('lightDisk', -r * 0.72, -0.019, -r * 0.72, r * 0.72, -0.015, r * 0.72);
  } else {
    b.lathe(o.trim, [[r, -0.014], [R, -0.012], [R + 0.004, -0.004], [R, 0], [0, 0]], 40, 0, 0, 0);
    b.lathe('castIron', [[0, -0.017], [r * 0.98, -0.017], [r, -0.014], [0, -0.014]], 32, 0, 0, 0);
    b.cyl('lightDisk', r * 0.72, r * 0.72, 0.004, 0, -0.0195, 0, 28);
  }
  if (o.light) {
    var L = new THREE.SpotLight(0xfff0dc, o.intensity, 16, 0.85, 0.7, 2);
    L.position.set(0, -0.05, 0); L.target.position.set(0, -6, 0); L.castShadow = false;
    b.object(L); b.object(L.target);
  }
}, function (o) { return [o.dia + 0.17, o.dia + 0.17, 0.02]; }, 'Flush 4" LED trim. light:true adds a non-shadow SpotLight (intensity) pointing down.');

def('pendantGlobe', 'lighting', { dia: 1.0, drop: 2.5, finish: 'brass', cord: 'rod', light: false, intensity: 0.5 }, function (b, o) {
  var m = o.finish, R = o.dia / 2, gy = -o.drop + R;
  canopy(b, m, 0.24, 0.09);
  var top = gy + R + 0.12;
  b.cyl(o.cord === 'cord' ? 'rubberBlack' : m, o.cord === 'cord' ? 0.012 : 0.02, o.cord === 'cord' ? 0.012 : 0.02, -0.09 - top, 0, (top - 0.09) / 2, 0, 10);
  b.lathe(m, [[0, top - 0.17], [0.1, top - 0.17], [0.12, top - 0.06], [0.06, top], [0, top]], 24, 0, 0, 0);
  b.sphere('opal', R, 0, gy, 0, 40, 24);
  if (o.light) { var L = new THREE.PointLight(0xffe6c0, o.intensity, 18, 2); L.position.set(0, gy, 0); b.object(L); }
}, function (o) { return [o.dia, o.dia, o.drop]; }, 'Opal globe pendant; drop = ceiling to bottom of globe.');

// Entry chandelier as built: LITFAD 24-light "starburst" (lighting.json; photos p54 underside, p53/p61 side, p71 front).
// A short stem drops from a round canopy to a flat 6-7" hub disc; 24 thin arms leave the hub rim radially, run out almost level and
// curve down at the ends; each arm ends in a vertical black tube (~1" dia x 6-7") whose lower end holds the LED. The arm meets the
// tube about 1" above its bottom through a small chrome collar (p54). Measured from p71 (door frame = 9'-0" scale): hub ~8'-9" AFF,
// tube bottoms ~8'-2" AFF, tube-ring diameter ~5'-0" (p71: 4.8 ft, p61: 5.2 ft). y = 0 is the ceiling; everything hangs below it.
// style 'globes' keeps the earlier generic sputnik (arms on a sphere, globe bulbs) for the showroom.
def('sputnikChandelier', 'lighting', { style: 'tubes', span: 5.0, arms: 24, stem: 0.6, sag: 0.5, tubeLen: 0.56, tubeDia: 1.05 * IN, armDia: 0.38 * IN, hubDia: 6.5 * IN,
  alt: 1, drop: 3.2, finish: 'blackMetal', tips: 'brass', collar: 'chrome', light: false, intensity: 0.8 }, function (b, o) {
  var m = o.finish;
  if (o.style === 'tubes') {
    var hy = -o.stem, R0 = o.hubDia / 2, tr = o.tubeDia / 2, ar = o.armDia / 2;
    canopy(b, m, 0.21, 0.07);
    b.cyl(m, 0.022, 0.022, o.stem - 0.07, 0, -0.07 - (o.stem - 0.07) / 2, 0, 10);
    // hub: flat disc with a smaller raised collar where the arms are fixed (p54)
    b.lathe(m, [[0, hy - 0.045], [R0 * 0.96, hy - 0.045], [R0, hy - 0.025], [R0, hy + 0.01], [R0 * 0.7, hy + 0.03], [R0 * 0.62, hy + 0.075], [0.03, hy + 0.08], [0, hy + 0.08]], 40, 0, 0, 0);
    b.sphere(m, 0.025, 0, hy - 0.05, 0, 10, 6);
    for (var i = 0; i < o.arms; i++) {
      var a = i / o.arms * TAU, c = Math.cos(a), s = Math.sin(a);
      var R = (o.span / 2 - tr) * (i % 2 ? o.alt : 1), yT = hy - o.sag;          // arm tip (tube joint)
      var P = function (r, y) { return [c * r, y, s * r]; };
      // arm: leaves the hub rim level, rises a hair, then bends down into the tube (CatmullRom through 5 points)
      b.tube(m, [P(R0 * 0.85, hy - 0.01), P(R * 0.4, hy - o.sag * 0.06), P(R * 0.72, hy - o.sag * 0.3), P(R * 0.92, hy - o.sag * 0.68), P(R - tr * 1.1, yT)], ar, 20, 6);
      var yb = yT - 0.085;                                                         // tube bottom: arm joins ~1" above it
      b.cyl(m, tr, tr, o.tubeLen, c * R, yb + o.tubeLen / 2, s * R, 12);
      b.cyl(o.collar, tr * 1.1, tr * 1.1, 0.035, c * R, yT, s * R, 12);
      b.cyl('bulb', tr * 0.78, tr * 0.6, 0.03, c * R, yb - 0.012, s * R, 12);
    }
    if (o.light) { var L = new THREE.PointLight(0xffe2b8, o.intensity, 22, 2); L.position.set(0, hy - o.sag, 0); b.object(L); }
    return;
  }
  var Rs = o.span / 2, hy2 = -o.drop + Rs;
  canopy(b, m, 0.25, 0.1);
  b.cyl(m, 0.025, 0.025, -0.1 - hy2, 0, (hy2 - 0.1) / 2, 0, 10);
  b.sphere(m, 0.17, 0, hy2, 0, 24, 16);
  var n = o.arms, ga = PI * (3 - Math.sqrt(5)), k = 0;
  for (var j = 0; j < n + 6 && k < n; j++) {
    var y = 1 - (j + 0.5) / (n + 6) * 2, rr = Math.sqrt(1 - y * y), aa = j * ga;
    if (y > 0.8) continue;
    var dx = Math.cos(aa) * rr, dz = Math.sin(aa) * rr; k++;
    var L1 = Rs - 0.2, L2 = Rs - 0.1;
    b.rod(m, [dx * 0.15, hy2 + y * 0.15, dz * 0.15], [dx * L1, hy2 + y * L1, dz * L1], 0.014, 6);
    b.rod(o.tips, [dx * L1, hy2 + y * L1, dz * L1], [dx * L2, hy2 + y * L2, dz * L2], 0.028, 10);
    b.sphere('bulb', 0.055, dx * (Rs - 0.045), hy2 + y * (Rs - 0.045), dz * (Rs - 0.045), 12, 8);
  }
  if (o.light) { var L2b = new THREE.PointLight(0xffe2b8, o.intensity, 22, 2); L2b.position.set(0, hy2, 0); b.object(L2b); }
}, function (o) { return o.style === 'tubes' ? [o.span, o.span, o.stem + o.sag + 0.1] : [o.span, o.span, o.drop]; },
  'Entry chandelier (style tubes = as-built LITFAD 24-light starburst: hub on a short stem, 24 level arms curving down into vertical black LED tubes; drop = stem+sag+0.1). style globes = generic sputnik.');

def('ceilingFan', 'lighting', { dia: 52 * IN, color: 'black', blades: 3, downrod: 0.5, light: false, bladeMat: null }, function (b, o) {
  var m = o.color === 'white' ? 'plasticWhite' : o.color === 'brass' ? 'brass' : 'blackMetal';
  var bm = o.bladeMat || (o.color === 'white' ? 'plasticWhite' : o.color === 'brass' ? 'wood' : 'blackMetal');
  canopy(b, m, 0.26, 0.2);
  var yr = -0.2 - o.downrod;
  b.cyl(m, 0.035, 0.035, o.downrod + 0.02, 0, -0.2 - o.downrod / 2, 0, 12);
  var yM = yr - 0.2;
  b.lathe(m, [[0, yM - 0.17], [0.16, yM - 0.17], [0.28, yM - 0.12], [0.34, yM - 0.05], [0.345, yM + 0.03], [0.3, yM + 0.1], [0.12, yM + 0.15], [0.06, yM + 0.2], [0, yM + 0.2]], 40, 0, 0, 0);
  var R = o.dia / 2, r0 = 0.42;
  var s = new THREE.Shape();
  s.moveTo(r0, -0.14); s.lineTo(R - 0.35, -0.21); s.quadraticCurveTo(R, -0.22, R, 0); s.quadraticCurveTo(R, 0.22, R - 0.35, 0.21); s.lineTo(r0, 0.14); s.lineTo(r0, -0.14);
  for (var i = 0; i < o.blades; i++) {
    var a = i / o.blades * TAU;
    b.extrude(bm, s, 0.028, M(0, yM - 0.04, 0, -HALF + 0.18, a, 0), { bevel: 0.006, bevelSegments: 1, curveSegments: 8 });
    b.push(M(0, 0, 0, 0, a, 0));
    b.bb(m, 0.25, yM - 0.07, -0.05, 0.6, yM - 0.03, 0.05, 0.012);
    b.pop();
  }
  if (o.light) b.sphere('opal', 0.2, 0, yM - 0.17, 0, 24, 8, { thetaStart: HALF, thetaLength: HALF });
}, function (o) { return [o.dia, o.dia, 0.2 + o.downrod + 0.45]; }, '52" three-blade fan; color black|white|brass (brass → wood blades). light:true adds an opal bowl.');

def('wallSconce', 'lighting', { mountY: 6, finish: 'blackMetal', shade: 'shade', light: false }, function (b, o) {
  var y = o.mountY, m = o.finish;
  b.lathe(m, [[0, 0], [0.14, 0], [0.14, 0.012], [0.12, 0.04], [0, 0.045]], 28, 0, y - 0.15, 0, { rx: HALF });
  b.tube(m, [[0, y - 0.15, 0.04], [0, y - 0.15, 0.28], [0, y - 0.08, 0.48], [0, y + 0.08, 0.55]], 0.02, 24, 8);
  b.lathe(m, [[0, 0], [0.04, 0], [0.045, 0.12], [0, 0.12]], 14, 0, y + 0.08, 0.55);
  b.sphere('bulb', 0.07, 0, y + 0.27, 0.55, 14, 10);
  b.cyl(o.shade, 0.3, 0.3, 0.5, 0, y + 0.3, 0.55, 40, { open: true });
  b.torus(m, 0.3, 0.006, 0, y + 0.55, 0.55, 4, 40, { rx: HALF });
  b.torus(m, 0.3, 0.006, 0, y + 0.05, 0.55, 4, 40, { rx: HALF });
  if (o.light) { var L = new THREE.PointLight(0xffe2b8, 0.35, 10, 2); L.position.set(0, y + 0.27, 0.55); b.object(L); }
}, function (o) { return [0.62, 0.86, o.mountY + 0.55]; }, 'Black swing-arm style sconce with linen drum shade; backplate centre at mountY - 0.15.');

/* ================================================================== SKYLIGHTS (origin = centre of roof opening, on the roof surface) */
def('skylightDeck', 'building', { w: 2, l: 2, pitch: 0.35, frame: 'frameDark', shaft: 0 }, function (b, o) {
  var w = o.w, l = o.l, f = o.frame, hh = 0.36, rw = 0.17;
  b.push(M(0, 0, 0, o.pitch, 0, 0));
  b.bb('flashing', -w / 2 - 0.3, 0, -l / 2 - 0.4, w / 2 + 0.3, 0.012, l / 2 + 0.3);
  b.bb('flashing', -w / 2 - 0.08, 0.012, -l / 2 - 0.08, w / 2 + 0.08, 0.16, l / 2 + 0.08, 0.01);
  b.bb(f, -w / 2, 0.012, -l / 2, -w / 2 + rw, hh, l / 2, 0.02);
  b.bb(f, w / 2 - rw, 0.012, -l / 2, w / 2, hh, l / 2, 0.02);
  b.bb(f, -w / 2 + rw, 0.012, -l / 2, w / 2 - rw, hh, -l / 2 + rw, 0.02);
  b.bb(f, -w / 2 + rw, 0.012, l / 2 - rw, w / 2 - rw, hh - 0.04, l / 2, 0.02);
  b.bb('rubberBlack', -w / 2 + rw - 0.02, hh - 0.06, -l / 2 + rw - 0.02, w / 2 - rw + 0.02, hh - 0.045, l / 2 - rw + 0.02);
  b.box('glass', w - 2 * rw + 0.06, 0.03, l - 2 * rw + 0.06, 0, hh - 0.03, 0);
  if (!(o.shaft > 0)) b.bb('frameDark', -w / 2 + rw, 0.02, -l / 2 + rw, w / 2 - rw, 0.03, l / 2 - rw);
  if (o.shaft > 0) {
    var s = o.shaft;
    b.bb('drywall', -w / 2, -s, -l / 2, -w / 2 + 0.05, 0, l / 2); b.bb('drywall', w / 2 - 0.05, -s, -l / 2, w / 2, 0, l / 2);
    b.bb('drywall', -w / 2, -s, -l / 2, w / 2, 0, -l / 2 + 0.05); b.bb('drywall', -w / 2, -s, l / 2 - 0.05, w / 2, 0, l / 2);
  }
  b.pop();
}, function (o) { return [o.w + 0.6, o.l + 0.7, 0.4]; }, 'Deck-mount skylight. Built in the roof plane: tilted by pitch about x so it rises toward -z (eave side faces +z). shaft = light-well depth below the roof plane.');

def('skylightCurb', 'building', { w: 2, l: 2, curbH: 0.5, dome: true, frame: 'frameDark' }, function (b, o) {
  var w = o.w, l = o.l, t = 0.18, h = o.curbH, f = o.frame;
  b.bb('roofing', -w / 2 - t, 0, -l / 2 - t, -w / 2, h, l / 2 + t, 0.01);
  b.bb('roofing', w / 2, 0, -l / 2 - t, w / 2 + t, h, l / 2 + t, 0.01);
  b.bb('roofing', -w / 2, 0, -l / 2 - t, w / 2, h, -l / 2, 0.01);
  b.bb('roofing', -w / 2, 0, l / 2, w / 2, h, l / 2 + t, 0.01);
  b.bb(f, -w / 2 - t - 0.03, h, -l / 2 - t - 0.03, w / 2 + t + 0.03, h + 0.09, -l / 2 + 0.02, 0.01);
  b.bb(f, -w / 2 - t - 0.03, h, l / 2 - 0.02, w / 2 + t + 0.03, h + 0.09, l / 2 + t + 0.03, 0.01);
  b.bb(f, -w / 2 - t - 0.03, h, -l / 2 + 0.02, -w / 2 + 0.02, h + 0.09, l / 2 - 0.02, 0.01);
  b.bb(f, w / 2 - 0.02, h, -l / 2 + 0.02, w / 2 + t + 0.03, h + 0.09, l / 2 - 0.02, 0.01);
  b.bb('frameDark', -w / 2, 0.005, -l / 2, w / 2, 0.012, l / 2);
  if (o.dome) b.sphere('acrylic', 1, 0, h + 0.08, 0, 36, 10, { thetaLength: HALF, sx: w / 2 + 0.12, sy: Math.min(w, l) * 0.18, sz: l / 2 + 0.12 });
  else b.box('glass', w + 0.2, 0.03, l + 0.2, 0, h + 0.1, 0);
}, function (o) { return [o.w + 0.42, o.l + 0.42, o.curbH + 0.1 + (o.dome ? Math.min(o.w, o.l) * 0.18 : 0)]; }, 'Curb-mount skylight for flat roofs: membrane-wrapped curb, metal cap, acrylic dome (dome:false → flat glass).');

/* ================================================================== FURNITURE */
function taperLeg(b, mat, x, z, h, r0, r1, y0, seg) { b.cyl(mat, r1, r0, h, x, (y0 || 0) + h / 2, z, seg || 14, { grainY: true }); }
function squareLeg(b, mat, x, z, y0, y1, bot, top) {
  b.add(mat, frustumGeo([x - bot / 2, x + bot / 2, z - bot / 2, z + bot / 2], [x - top / 2, x + top / 2, z - top / 2, z + top / 2], y0, y1, true), null, { grainY: true });
}

def('sofa3', 'furniture', { w: 7.5, d: 3.2, h: 2.7, fabric: 'fabricLight', legs: 'woodDark', seats: 3, pillows: true, pillowMat: 'fabricOat' }, function (b, o) {
  var w = o.w, d = o.d, f = o.fabric, legH = 0.3, aw = 0.62, armH = 2.05, deckY = legH + 0.52;
  b.rbox(f, w - 0.1, 0.52, d - 0.1, 0.1, 0, legH + 0.26, d / 2, { seg: 3 });
  [-1, 1].forEach(function (s) { b.rbox(f, aw, armH - legH, d, 0.24, s * (w / 2 - aw / 2), legH + (armH - legH) / 2, d / 2, { seg: 3, bulge: [0.03, 0.025, 0], flat: 3 }); });
  var iw = w - 2 * aw, bh = (o.h - 0.55) - legH;
  b.rbox(f, iw + 0.12, bh, 0.62, 0.2, 0, legH + bh / 2, 0.31, { seg: 3 });
  var n = o.seats, cw = iw / n, sz0 = 0.62;
  for (var i = 0; i < n; i++) {
    var x = -iw / 2 + cw * (i + 0.5);
    b.rbox(f, cw - 0.025, 0.6, d - sz0 + 0.02, 0.17, x, deckY + 0.29, sz0 + (d - sz0) / 2 - 0.01, { seg: 3, bulge: [0.015, 0.06, 0.025], flat: 4 });
    b.rbox(f, cw - 0.03, 1.38, 0.56, 0.22, x, deckY + 0.55 + 0.66, sz0 + 0.27, { seg: 3, bulge: [0.015, 0.03, 0.09], flat: 4, rx: -0.2 });
  }
  if (o.pillows) {
    [-1, 1].forEach(function (s) {
      b.rbox(o.pillowMat, 1.5, 1.5, 0.38, 0.2, s * (iw / 2 - 0.85), deckY + 0.6 + 0.8, 1.42, { seg: 3, bulge: [0, 0, 0.12], flat: 3, rx: -0.26, ry: -s * 0.28, rz: s * 0.07 });
    });
  }
  [[-1, 0.22], [1, 0.22], [-1, d - 0.22], [1, d - 0.22]].forEach(function (p) { taperLeg(b, o.legs, p[0] * (w / 2 - 0.22), p[1], legH, 0.07, 0.045); });
}, function (o) { return [o.w, o.d, o.h]; }, 'Three-seat sofa: rounded track arms, pillowed seat/back cushions, two throw pillows, tapered walnut legs.');

def('armchairBoucle', 'furniture', { w: 2.8, d: 2.7, h: 2.45, fabric: 'fabricLight', legs: 'woodDark' }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, f = o.fabric, t = 0.42, bev = 0.15, y0 = 0.28;
  var ax = w / 2 - bev, az = d / 2 - bev, ix = w / 2 - t + bev, iz = d / 2 - t + bev, zc = d / 2, ph0 = 0.78, N = 40, pts = [], k, a;
  for (k = 0; k <= N; k++) { a = -ph0 + (PI + 2 * ph0) * k / N; pts.push([ax * Math.cos(a), zc - az * Math.sin(a)]); }
  // rounded arm end (+x side → -x after loop): cap from outer end to inner end
  var capPts = function (aEnd, dir) {
    var ox = ax * Math.cos(aEnd), oz = zc - az * Math.sin(aEnd), qx = ix * Math.cos(aEnd), qz = zc - iz * Math.sin(aEnd);
    var mx = (ox + qx) / 2, mz = (oz + qz) / 2, rr = Math.hypot(ox - qx, oz - qz) / 2, base = Math.atan2(oz - mz, ox - mx), out = [];
    for (var j = 1; j < 8; j++) { var aa = base + dir * PI * j / 8; out.push([mx + rr * Math.cos(aa), mz + rr * Math.sin(aa)]); }
    return out;
  };
  pts = pts.concat(capPts(PI + ph0, -1));
  for (k = N; k >= 0; k--) { a = -ph0 + (PI + 2 * ph0) * k / N; pts.push([ix * Math.cos(a), zc - iz * Math.sin(a)]); }
  pts = pts.concat(capPts(-ph0, -1));
  b.extrude(f, planShape(pts), h - y0 - 2 * bev, M(0, y0 + bev, 0, -HALF, 0, 0), { bevel: bev, bevelSegments: 4 });
  // oval seat cushion and plinth that follow the barrel
  var cb = 0.1;
  b.extrude(f, ellShape(ix + 0.06 - cb, az - 0.04 - cb, 0, -(zc + 0.03)), 0.44 - 2 * cb, M(0, 1.02 + cb, 0, -HALF, 0, 0), { bevel: cb, bevelSegments: 4, curveSegments: 48 });
  var bb2 = 0.06;
  b.extrude(f, ellShape(ax - 0.03, az - 0.03, 0, -zc), 1.06 - y0 - 2 * bb2, M(0, y0 + bb2, 0, -HALF, 0, 0), { bevel: bb2, bevelSegments: 2, curveSegments: 48 });
  [[-1, 0.62], [1, 0.62], [-1, d - 0.62], [1, d - 0.62]].forEach(function (p) { taperLeg(b, o.legs, p[0] * (w / 2 - 0.5), p[1], y0, 0.065, 0.05); });
}, function (o) { return [o.w, o.d, o.h]; }, 'Curvy barrel club chair in boucle: one extruded horseshoe shell with soft 2" bevels + pillowed seat.');

def('coffeeTableGlass', 'furniture', { w: 4, d: 2, h: 1.33, t: 0.5 * IN, r: 0.12 }, function (b, o) {
  var w = o.w, h = o.h, t = o.t, r = o.r, s = new THREE.Shape(), ri = r - t;
  s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - r); s.absarc(-w / 2 + r, h - r, r, PI, HALF, true);
  s.lineTo(w / 2 - r, h); s.absarc(w / 2 - r, h - r, r, HALF, 0, true); s.lineTo(w / 2, 0);
  s.lineTo(w / 2 - t, 0); s.lineTo(w / 2 - t, h - r); s.absarc(w / 2 - r, h - r, ri, 0, HALF, false);
  s.lineTo(-w / 2 + r, h - t); s.absarc(-w / 2 + r, h - r, ri, HALF, PI, false); s.lineTo(-w / 2 + t, 0); s.lineTo(-w / 2, 0);
  b.extrude('glass', s, o.d, null, { curveSegments: 10, split: ['glassEdge', 'glass'] });
}, function (o) { return [o.w, o.d, o.h]; }, 'Waterfall glass/acrylic coffee table (single bent 1/2" sheet; green edges).');

def('sideTable', 'furniture', { style: 'pedestal', dia: 1.5, h: 1.75, mat: null }, function (b, o) {
  var R = o.dia / 2, h = o.h, cz = R;
  if (o.style === 'pedestal') {
    var m = o.mat || 'woodDark';
    b.lathe(m, [[0, 0], [R * 0.8, 0], [R * 0.82, 0.04], [R * 0.74, 0.12], [R * 0.52, 0.35], [R * 0.42, h * 0.5], [R * 0.5, h - 0.38], [R * 0.78, h - 0.16], [R * 0.97, h - 0.07], [R, h - 0.04], [R * 0.99, h], [0, h]], 96, 0, 0, cz, {
      deform: function (g) {
        var p = g.attributes.position;
        for (var i = 0; i < p.count; i++) {
          var y = p.getY(i); if (y < 0.13 || y > h - 0.17) continue;
          var x = p.getX(i), z = p.getZ(i), ang = Math.atan2(x, z), s = 1 + 0.07 * Math.pow(Math.abs(Math.cos(12 * ang)), 0.6) - 0.035;
          p.setX(i, x * s); p.setZ(i, z * s);
        }
        g.computeVertexNormals();
      }
    });
  } else if (o.style === 'glass') {
    b.cyl('glass', R, R, 0.04, 0, h - 0.02, cz, 48);
    b.torus(o.mat || 'brass', R, 0.012, 0, h - 0.045, cz, 6, 48, { rx: HALF });
    for (var i = 0; i < 3; i++) { var a = i / 3 * TAU; b.rod(o.mat || 'brass', [Math.cos(a) * R * 0.95, h - 0.05, cz + Math.sin(a) * R * 0.95], [Math.cos(a) * R * 0.95, 0.0, cz + Math.sin(a) * R * 0.95], 0.016, 8); }
    b.torus(o.mat || 'brass', R * 0.95, 0.014, 0, 0.014, cz, 6, 48, { rx: HALF });
  } else {
    var mm = o.mat || 'wood';
    b.cyl(mm, R, R, 0.1, 0, h - 0.05, cz, 48);
    for (i = 0; i < 3; i++) { a = i / 3 * TAU + 0.5; b.rod(mm, [Math.cos(a) * R * 0.45, h - 0.1, cz + Math.sin(a) * R * 0.45], [Math.cos(a) * R * 0.75, 0, cz + Math.sin(a) * R * 0.75], 0.05, 10, { r2: 0.035, grainY: true }); }
  }
}, function (o) { return [o.dia, o.dia, o.h]; }, 'style pedestal (carved fluted walnut drum) | round (oak, 3 splayed legs) | glass (brass frame).');

def('consoleTable', 'furniture', { w: 5, d: 1.33, h: 2.5, top: 'wood', frame: 'wood', shelf: true }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, fm = o.frame;
  if (o.top === 'glass') { b.box('glass', w, 0.04, d, 0, h - 0.02, d / 2); b.box('glassEdge', w, 0.04, 0.004, 0, h - 0.02, d - 0.002); }
  else b.rbox(o.top, w, 0.11, d, 0.025, 0, h - 0.055, d / 2, { seg: 2 });
  var ty = o.top === 'glass' ? h - 0.04 : h - 0.11;
  [[-1, 0.13], [1, 0.13], [-1, d - 0.13], [1, d - 0.13]].forEach(function (p) { squareLeg(b, fm, p[0] * (w / 2 - 0.13), p[1], 0, ty, 0.1, 0.15); });
  b.rbox(fm, w - 0.4, 0.22, 0.06, 0.01, 0, ty - 0.11, d - 0.13);
  b.rbox(fm, w - 0.4, 0.22, 0.06, 0.01, 0, ty - 0.11, 0.13);
  [-1, 1].forEach(function (s) { b.rbox(fm, 0.06, 0.22, d - 0.4, 0.01, s * (w / 2 - 0.13), ty - 0.11, d / 2); });
  if (o.shelf) b.rbox(fm, w - 0.36, 0.07, d - 0.3, 0.012, 0, 0.55, d / 2);
}, function (o) { return [o.w, o.d, o.h]; }, 'Console / sofa table, oak with tapered legs and lower shelf; top: wood|glass.');

def('diningTable', 'furniture', { w: 7, d: 3.5, h: 2.5, top: 'cabinetOak', base: 'trestle', baseMat: null }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, tt = 0.13, bm = o.baseMat || o.top, cz = d / 2;
  b.rbox(o.top, w, tt, d, 0.035, 0, h - tt / 2, cz, { seg: 3 });
  if (o.base === 'trestle') {
    [-1, 1].forEach(function (s) {
      var x = s * (w / 2 - 1.05);
      b.rbox(bm, 0.36, 0.22, d - 0.5, 0.05, x, 0.11, cz, { seg: 2 });
      b.rbox(bm, 0.3, 0.2, d - 0.75, 0.04, x, h - tt - 0.1, cz, { seg: 2 });
      b.rbox(bm, 0.3, h - tt - 0.42, 0.42, 0.04, x, 0.22 + (h - tt - 0.42) / 2, cz - 0.42, { seg: 2, grainY: true });
      b.rbox(bm, 0.3, h - tt - 0.42, 0.42, 0.04, x, 0.22 + (h - tt - 0.42) / 2, cz + 0.42, { seg: 2, grainY: true });
    });
    b.rbox(bm, w - 2.1 + 0.3, 0.3, 0.26, 0.04, 0, 0.95, cz, { seg: 2 });
  } else {
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { squareLeg(b, bm, p[0] * (w / 2 - 0.3), cz + p[1] * (d / 2 - 0.3), 0, h - tt, 0.17, 0.26); });
    b.rbox(bm, w - 0.8, 0.3, 0.07, 0.01, 0, h - tt - 0.15, 0.27); b.rbox(bm, w - 0.8, 0.3, 0.07, 0.01, 0, h - tt - 0.15, d - 0.27);
    b.rbox(bm, 0.07, 0.3, d - 0.8, 0.01, -w / 2 + 0.27, h - tt - 0.15, cz); b.rbox(bm, 0.07, 0.3, d - 0.8, 0.01, w / 2 - 0.27, h - tt - 0.15, cz);
  }
}, function (o) { return [o.w, o.d, o.h]; }, 'White-oak dining table, 1.5" top; base trestle|legs.');

def('diningChair', 'furniture', { style: 'upholstered', fabric: 'fabricLight', wood: 'woodDark', seatH: 1.55 }, function (b, o) {
  var sH = o.seatH, wd = o.wood;
  if (o.style === 'wishbone') {
    var m = o.wood === 'woodDark' ? 'wood' : o.wood;
    [-1, 1].forEach(function (s) {
      taperLeg(b, m, s * 0.66, 1.6, sH - 0.1, 0.05, 0.06);
      b.tube(m, [[s * 0.6, 0, 0.3], [s * 0.6, sH * 0.6, 0.28], [s * 0.62, sH, 0.3], [s * 0.66, 2.05, 0.38], [s * 0.7, 2.3, 0.55]], 0.055, 16, 8);
      b.rod(m, [s * 0.62, sH - 0.12, 0.35], [s * 0.66, sH - 0.12, 1.6], 0.025, 8);
    });
    var arc = [];
    for (var k = 0; k <= 16; k++) { var a = PI * k / 16; arc.push([-Math.cos(a) * 0.72, 2.3 + Math.sin(a) * 0.06, 0.55 - Math.sin(a) * 0.48]); }
    b.tube(m, arc, 0.055, 40, 10);
    var y = new THREE.Shape();
    y.moveTo(-0.07, 0); y.lineTo(0.07, 0); y.lineTo(0.07, 0.25); y.quadraticCurveTo(0.12, 0.45, 0.32, 0.62); y.lineTo(0.22, 0.66);
    y.quadraticCurveTo(0.05, 0.5, 0, 0.42); y.quadraticCurveTo(-0.05, 0.5, -0.22, 0.66); y.lineTo(-0.32, 0.62); y.quadraticCurveTo(-0.12, 0.45, -0.07, 0.25); y.lineTo(-0.07, 0);
    b.extrude(m, y, 0.05, M(0, sH - 0.05, 0.13, -0.1, 0, 0), { bevel: 0.01, bevelSegments: 1 });
    b.rbox('rattan', 1.36, 0.08, 1.35, 0.03, 0, sH - 0.06, 0.98, { seg: 1 });
    b.bb(m, -0.7, sH - 0.16, 0.28, 0.7, sH - 0.08, 0.36, 0.01); b.bb(m, -0.7, sH - 0.16, 1.58, 0.7, sH - 0.08, 1.66, 0.01);
    b.bb(m, -0.7, sH - 0.16, 0.28, -0.62, sH - 0.08, 1.66, 0.01); b.bb(m, 0.62, sH - 0.16, 0.28, 0.7, sH - 0.08, 1.66, 0.01);
    return;
  }
  // upholstered: curved back + pillowed seat on walnut legs
  [-1, 1].forEach(function (s) {
    b.rod(wd, [s * 0.62, 0, 1.62], [s * 0.6, sH - 0.25, 1.55], 0.045, 12, { r2: 0.06, grainY: true });
    b.rod(wd, [s * 0.6, 0, 0.12], [s * 0.6, sH - 0.25, 0.32], 0.045, 12, { r2: 0.06, grainY: true });
  });
  b.rbox(o.fabric, 1.62, 0.34, 1.62, 0.12, 0, sH - 0.17, 0.95, { seg: 3, bulge: [0.01, 0.035, 0.012], flat: 4 });
  var pts = [], R = 1.7, a0 = 0.42, N = 18, th = 0.2, cz = 0.18 + R;
  for (var i = 0; i <= N; i++) { var aa = -a0 + 2 * a0 * i / N; pts.push([R * Math.sin(aa), cz - R * Math.cos(aa)]); }
  for (i = N; i >= 0; i--) { aa = -a0 + 2 * a0 * i / N; pts.push([(R - th) * Math.sin(aa), cz - (R - th) * Math.cos(aa)]); }
  b.push(M(0, sH - 0.1, 0.1, -0.12, 0, 0));
  b.extrude(o.fabric, planShape(pts), 1.12 - 0.16, M(0, 0.08, 0, -HALF, 0, 0), { bevel: 0.08, bevelSegments: 3 });
  b.pop();
}, function (o) { return [1.65, 1.8, o.style === 'wishbone' ? 2.4 : o.seatH + 1.15]; }, 'style upholstered (curved boucle back, walnut legs) | wishbone (oak, woven seat).');

function bed(b, o, mw, md) {
  var up = o.upholstery, legH = 0.3, frameTop = 1.2, mattT = 0.85, headT = 0.36, headH = o.headH, fw = mw + 0.42;
  if (o.channels) {
    var n = Math.round(fw / 0.62), cw = fw / n;
    for (var i = 0; i < n; i++) b.rbox(up, cw + 0.01, headH - 0.35, headT, 0.13, -fw / 2 + cw * (i + 0.5), 0.35 + (headH - 0.35) / 2, headT / 2, { seg: 2, bulge: [0, 0, 0.05], flat: 2 });
  } else b.rbox(up, fw, headH - 0.35, headT, 0.15, 0, 0.35 + (headH - 0.35) / 2, headT / 2, { seg: 3, bulge: [0, 0.01, 0.05], flat: 4 });
  var z0 = headT, flen = md + 0.3;
  b.rbox(up, fw, frameTop - legH, flen, 0.12, 0, legH + (frameTop - legH) / 2, z0 + flen / 2, { seg: 3 });
  [[-1, z0 + 0.25], [1, z0 + 0.25], [-1, z0 + flen - 0.25], [1, z0 + flen - 0.25]].forEach(function (p) { b.cyl(o.legs, 0.07, 0.07, legH, p[0] * (fw / 2 - 0.25), legH / 2, p[1], 12); });
  var mz0 = z0 + 0.12, mz1 = mz0 + md, my0 = frameTop - 0.22, my1 = my0 + mattT;
  b.rbox('linenWhite', mw, mattT, md, 0.14, 0, (my0 + my1) / 2, (mz0 + mz1) / 2, { seg: 3 });
  var dz0 = mz0 + 1.6, dz1 = mz1 + 0.13, dy0 = my1 - 0.62, dy1 = my1 + 0.14;
  b.rbox(o.bedding, mw + 0.42, dy1 - dy0, dz1 - dz0, 0.13, 0, (dy0 + dy1) / 2, (dz0 + dz1) / 2, { seg: 3, bulge: [0.03, 0.06, 0.02], flat: 5 });
  b.rbox(o.bedding, mw + 0.46, 0.2, 0.75, 0.095, 0, dy1 + 0.04, dz0 + 0.3, { seg: 3, bulge: [0, 0.05, 0.02], flat: 4 });
  // sheets visible above duvet fold
  b.rbox('linenWhite', mw + 0.06, 0.12, 1.75, 0.05, 0, my1 + 0.02, mz0 + 0.9, { seg: 2 });
  // pillows
  var np = mw > 5.5 ? 3 : 2, pw = (mw - 0.2) / np;
  if (o.euro) for (i = 0; i < np; i++) b.rbox(o.shamMat, Math.min(2.15, pw), 2.1, 0.5, 0.22, -mw / 2 + 0.1 + pw * (i + 0.5), my1 + 1.0, mz0 + 0.42, { seg: 3, bulge: [0, 0, 0.14], flat: 3, rx: -0.22 });
  for (i = 0; i < 2; i++) {
    var pww = (mw - 0.3) / 2;
    b.rbox('linenWhite', pww, 1.55, 0.48, 0.22, -mw / 2 + 0.15 + pww * (i + 0.5), my1 + 0.72, mz0 + (o.euro ? 0.9 : 0.55), { seg: 3, bulge: [0, 0, 0.13], flat: 3, rx: -0.42 });
  }
  b.rbox(o.accentMat, 1.6, 0.85, 0.36, 0.17, 0, my1 + 0.48, mz0 + 1.25, { seg: 3, bulge: [0, 0, 0.1], flat: 4, rx: -0.5 });
  if (o.throwBlanket) b.rbox(o.throwMat, mw + 0.56, 0.74, 1.47, 0.07, 0, dy1 - 0.34 + 0.06, mz1 - 0.52, { seg: 2, bulge: [0.02, 0.03, 0.02], flat: 3 });
}
var BED_DEF = { upholstery: 'fabricLight', bedding: 'linenWhite', legs: 'woodDark', headH: 4.6, channels: true, euro: true, shamMat: 'fabricOat', accentMat: 'fabricDark', throwBlanket: true, throwMat: 'fabricOat' };
def('bedQueen', 'furniture', opt(BED_DEF, {}), function (b, o) { bed(b, o, 5, 6.67); }, function (o) { return [5.42, 7.45, o.headH]; }, 'Queen (60x80") on upholstered channel-tufted platform with duvet, shams, pillows, lumbar and throw.');
def('bedKing', 'furniture', opt(BED_DEF, {}), function (b, o) { bed(b, o, 6.33, 6.67); }, function (o) { return [6.75, 7.45, o.headH]; }, 'King (76x80") — same construction as bedQueen.');

def('nightstand', 'furniture', { w: 2, d: 1.5, h: 2, finish: 'cabinetOak', hw: 'brass', pull: 'knob', legs: true }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, fin = o.finish, y0 = o.legs ? 0.55 : 0.08;
  b.rbox(fin, w, h - y0 - 0.08, d - 0.06, 0.02, 0, y0 + (h - y0 - 0.08) / 2, (d - 0.06) / 2, { seg: 1 });
  b.rbox(fin, w + 0.04, 0.08, d, 0.02, 0, h - 0.04, d / 2, { seg: 2 });
  fronts(b, { finish: fin, hw: o.hw, pull: o.pull, style: 'slab' }, -w / 2 + 0.04, w / 2 - 0.04, y0 + 0.04, h - 0.1, [{ f: 1, k: 'drawer' }, { f: 1, k: 'drawer' }], d);
  if (o.legs) [[-1, 0.12], [1, 0.12], [-1, d - 0.18], [1, d - 0.18]].forEach(function (p) { squareLeg(b, fin, p[0] * (w / 2 - 0.12), p[1], 0, y0 + 0.02, 0.08, 0.12); });
  else b.bb(fin, -w / 2 + 0.1, 0, 0.1, w / 2 - 0.1, y0, d - 0.15);
}, function (o) { return [o.w + 0.04, o.d + 0.13, o.h]; }, 'Two-drawer oak nightstand on tapered legs (legs:false → plinth).');

def('dresser', 'furniture', { w: 5, d: 1.67, h: 2.67, finish: 'cabinetOak', hw: 'blackMetal', pull: 'bar', cols: 2, rows: 3 }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, fin = o.finish, y0 = 0.42;
  b.rbox(fin, w, h - y0 - 0.08, d - 0.06, 0.02, 0, y0 + (h - y0 - 0.08) / 2, (d - 0.06) / 2, { seg: 1 });
  b.rbox(fin, w + 0.05, 0.09, d, 0.025, 0, h - 0.045, d / 2, { seg: 2 });
  var cw = (w - 0.08) / o.cols, rows = [];
  for (var r = 0; r < o.rows; r++) rows.push({ f: 1 + r * 0.12, k: 'drawer' });
  for (var c = 0; c < o.cols; c++) fronts(b, { finish: fin, hw: o.hw, pull: o.pull, style: 'slab' }, -w / 2 + 0.04 + c * cw, -w / 2 + 0.04 + (c + 1) * cw, y0 + 0.04, h - 0.1, rows, d);
  [[-1, 0.14], [1, 0.14], [-1, d - 0.2], [1, d - 0.2]].forEach(function (p) { squareLeg(b, fin, p[0] * (w / 2 - 0.14), p[1], 0, y0 + 0.02, 0.09, 0.13); });
}, function (o) { return [o.w + 0.05, o.d + 0.13, o.h]; }, 'Six-drawer oak dresser (cols x rows) on tapered legs.');

def('desk', 'furniture', { w: 4.5, d: 2, h: 2.5, top: 'cabinetOak', frame: 'blackMetal', laptop: true }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, f = o.frame;
  b.rbox(o.top, w, 0.1, d, 0.025, 0, h - 0.05, d / 2, { seg: 2 });
  [-1, 1].forEach(function (s) {
    var x = s * (w / 2 - 0.2);
    b.bb(f, x - 0.05, 0, 0.12, x + 0.05, 0.08, d - 0.12, 0.01);
    b.bb(f, x - 0.05, h - 0.18, 0.12, x + 0.05, h - 0.1, d - 0.12, 0.01);
    b.bb(f, x - 0.05, 0, 0.12, x + 0.05, h - 0.1, 0.22, 0.01);
    b.bb(f, x - 0.05, 0, d - 0.22, x + 0.05, h - 0.1, d - 0.12, 0.01);
  });
  b.bb(f, -w / 2 + 0.2, h - 0.6, 0.15, w / 2 - 0.2, h - 0.52, 0.22, 0.01);
  if (o.laptop) {
    b.push(M(0.3, h, d / 2 + 0.1, 0, -0.15, 0));
    b.rbox('stainless', 1.0, 0.04, 0.72, 0.02, 0, 0.02, 0, { seg: 1 });
    b.rbox('stainless', 1.0, 0.68, 0.03, 0.02, 0, 0.36, -0.36, { seg: 1, rx: -0.3 });
    b.box('screen', 0.92, 0.6, 0.005, 0, 0.36, -0.336, 0, { });
    b.pop();
  }
}, function (o) { return [o.w, o.d, o.h]; }, 'Oak-top writing desk on black steel sled legs (+ optional laptop).');

def('officeChair', 'furniture', { fabric: 'fabricDark', frame: 'blackMetal' }, function (b, o) {
  var f = o.frame, cz = 1.1;
  for (var i = 0; i < 5; i++) {
    var a = i / 5 * TAU + 0.3, ca = Math.cos(a), sa = Math.sin(a);
    b.push(M(0, 0, cz, 0, -a, 0));
    b.rbox(f, 1.0, 0.07, 0.13, 0.03, 0.55, 0.27, 0, { seg: 1, rz: 0.08 });
    b.pop();
    b.cyl('rubberBlack', 0.09, 0.09, 0.07, ca * 1.02, 0.1, cz + sa * 1.02, 14, { rz: HALF, ry: -a });
    b.cyl(f, 0.02, 0.02, 0.1, ca * 1.02, 0.2, cz + sa * 1.02, 6);
  }
  b.cyl(f, 0.13, 0.15, 0.12, 0, 0.3, cz, 16);
  b.cyl('chrome', 0.04, 0.04, 0.75, 0, 0.7, cz, 14);
  b.cyl(f, 0.065, 0.065, 0.4, 0, 0.55, cz, 14);
  b.rbox(f, 0.6, 0.12, 0.7, 0.04, 0, 1.12, cz, { seg: 1 });
  b.rbox(o.fabric, 1.75, 0.3, 1.65, 0.13, 0, 1.33, cz + 0.05, { seg: 3, bulge: [0.01, 0.04, 0.01], flat: 4 });
  b.rbox(f, 0.18, 1.0, 0.1, 0.04, 0, 1.6, cz - 0.82, { seg: 1, rx: -0.12 });
  b.rbox(o.fabric, 1.6, 1.65, 0.24, 0.13, 0, 2.65, cz - 0.86, { seg: 3, bulge: [0.01, 0.01, 0.04], flat: 4, rx: -0.14 });
  [-1, 1].forEach(function (s) {
    b.rbox(f, 0.08, 0.6, 0.14, 0.03, s * 0.86, 1.6, cz + 0.05, { seg: 1 });
    b.rbox('rubberBlack', 0.28, 0.08, 0.85, 0.035, s * 0.86, 1.93, cz + 0.1, { seg: 2 });
  });
}, function () { return [2.2, 2.2, 3.5]; }, 'Task chair with 5-star base, casters, upholstered seat/back and T-arms.');

/* rugs: own material per pattern/colour */
var RUGMATS = {};
function rugMaterial(o) {
  var key = 'rug:' + o.pattern + ':' + o.color + ':' + o.accent + ':' + (o.pattern === 'geometric' ? o.w + 'x' + o.d : '');
  if (RUGMATS[key]) return [key, RUGMATS[key]];
  var mat, R = rng(77);
  if (o.pattern === 'jute') {
    var W = 512, c = canvas(W), x = c.getContext('2d');
    x.fillStyle = o.color === '#e8e1d3' ? '#a88b5f' : o.color; x.fillRect(0, 0, W, W);
    var rows = 16, cols = 8, rh = W / rows, cw = W / cols;
    for (var r = 0; r < rows; r++) for (var k = -1; k <= cols; k++) {
      var cx = k * cw + (r % 2 ? cw / 2 : 0) + cw / 2, cy = r * rh + rh / 2;
      var g = x.createRadialGradient(cx, cy, 2, cx, cy, cw * 0.6);
      var bb = 0.85 + R() * 0.25;
      g.addColorStop(0, 'rgba(' + (225 * bb | 0) + ',' + (196 * bb | 0) + ',' + (150 * bb | 0) + ',1)');
      g.addColorStop(1, 'rgba(' + (140 * bb | 0) + ',' + (110 * bb | 0) + ',' + (70 * bb | 0) + ',1)');
      x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, cw * 0.5, rh * 0.46, (r % 2 ? 0.25 : -0.25), 0, TAU); x.fill();
    }
    for (k = 0; k < 2500; k++) { x.strokeStyle = R() < 0.5 ? 'rgba(90,65,35,0.25)' : 'rgba(240,215,170,0.25)'; x.lineWidth = 0.7; var px = R() * W, py = R() * W, aa = R() * PI; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(aa) * 8, py + Math.sin(aa) * 8); x.stroke(); }
    var t = toTex(c, [1.4, 1.4]);
    mat = std({ color: 0xffffff, map: t, bumpMap: t, bumpScale: 0.01, roughness: 1, metalness: 0 });
  } else if (o.pattern === 'geometric') {
    var Wd = 1024, Ht = Math.round(1024 * o.d / o.w), c2 = canvas(Wd, Ht), y = c2.getContext('2d');
    y.fillStyle = o.color; y.fillRect(0, 0, Wd, Ht);
    var ppf = Wd / o.w;
    for (k = 0; k < 9000; k++) { y.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)'; y.fillRect(R() * Wd, R() * Ht, 2 + R() * 4, 2 + R() * 4); }
    y.strokeStyle = o.accent; y.globalAlpha = 0.75; y.lineWidth = ppf * 0.06;
    var bm = ppf * 0.6; y.strokeRect(bm, bm, Wd - 2 * bm, Ht - 2 * bm); y.lineWidth = ppf * 0.025; y.strokeRect(bm + ppf * 0.18, bm + ppf * 0.18, Wd - 2 * bm - ppf * 0.36, Ht - 2 * bm - ppf * 0.36);
    var cell = ppf * 1.25, ix0 = bm + ppf * 0.5, iy0 = bm + ppf * 0.5, ix1 = Wd - ix0, iy1 = Ht - iy0;
    y.save(); y.beginPath(); y.rect(ix0, iy0, ix1 - ix0, iy1 - iy0); y.clip();
    y.lineWidth = ppf * 0.03; y.globalAlpha = 0.6;
    for (var gx = ix0 - cell; gx < ix1 + cell; gx += cell) for (var gy = iy0 - cell; gy < iy1 + cell; gy += cell * 1.4) {
      y.beginPath(); y.moveTo(gx, gy + cell * 0.7); y.quadraticCurveTo(gx + cell * 0.25, gy + cell * 0.7, gx + cell * 0.5, gy); y.quadraticCurveTo(gx + cell * 0.75, gy + cell * 0.7, gx + cell, gy + cell * 0.7);
      y.quadraticCurveTo(gx + cell * 0.75, gy + cell * 0.7, gx + cell * 0.5, gy + cell * 1.4); y.quadraticCurveTo(gx + cell * 0.25, gy + cell * 0.7, gx, gy + cell * 0.7); y.stroke();
    }
    y.restore(); y.globalAlpha = 1;
    var t2 = toTex(c2); t2.wrapS = t2.wrapT = THREE.ClampToEdgeWrapping;
    var bump = getTex('linen');
    mat = std({ color: 0xffffff, map: t2, bumpMap: bump, bumpScale: 0.004, roughness: 1, metalness: 0 });
  } else {
    mat = std({ color: new THREE.Color(o.color), bumpMap: getTex('linen'), bumpScale: 0.004, roughness: 1, metalness: 0 });
  }
  mat.name = key; RUGMATS[key] = mat;
  return [key, mat];
}
def('rug', 'furniture', { w: 8, d: 10, pattern: 'geometric', color: '#ece6da', accent: '#9a948a', thick: 0.035 }, function (b, o) {
  var km = rugMaterial(o), w = o.w, d = o.d;
  b.useMaterial(km[0], km[1]);
  var g = new THREE.ExtrudeGeometry(rrShape(w - 0.02, d - 0.02, 0.06, 0, -d / 2), { depth: o.thick - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 6 });
  var p = g.attributes.position, uv = g.attributes.uv;
  for (var i = 0; i < p.count; i++) {
    if (o.pattern === 'geometric') uv.setXY(i, (p.getX(i) + w / 2) / w, 1 + p.getY(i) / d);
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  b.add(km[0], g, M(0, 0.01, 0, -HALF, 0, 0), { keepUV: true });
}, function (o) { return [o.w, o.d, o.thick]; }, 'Area rug. pattern geometric (trellis on colour, accent lines) | jute (chunky braid) | solid. Own material per pattern/colour.');

def('floorLamp', 'furniture', { h: 5.6, finish: 'blackMetal', shadeDia: 1.35 }, function (b, o) {
  var h = o.h, m = o.finish, cz = 0.68, R = o.shadeDia / 2;
  b.lathe(m, [[0, 0], [0.45, 0], [0.45, 0.03], [0.4, 0.07], [0.05, 0.08], [0, 0.08]], 40, 0, 0, cz);
  b.cyl(m, 0.025, 0.025, h - 0.9, 0, 0.08 + (h - 0.9) / 2, cz, 10);
  b.cyl(m, 0.04, 0.04, 0.18, 0, h - 0.8, cz, 14);
  b.sphere('bulb', 0.11, 0, h - 0.6, cz, 16, 12);
  b.cyl('shade', R * 0.88, R, 1.0, 0, h - 0.5, cz, 48, { open: true });
  b.torus(m, R * 0.88, 0.006, 0, h, cz, 4, 48, { rx: HALF });
  [0, 1, 2].forEach(function (i) { var a = i / 3 * TAU; b.rod(m, [0, h - 0.72, cz], [Math.cos(a) * R * 0.86, h - 0.02, cz + Math.sin(a) * R * 0.86], 0.006, 4); });
}, function (o) { return [o.shadeDia, o.shadeDia, o.h]; }, 'Black column floor lamp with linen drum shade.');

def('tableLamp', 'furniture', { h: 2.3, base: 'ceramicWhite', mountY: 0, shadeDia: 1.2, finish: 'brass' }, function (b, o) {
  var y = o.mountY, h = o.h, s = h * 0.48, R = o.shadeDia / 2, cz = R;
  b.lathe(o.base, [[0, 0], [0.18, 0], [0.22, 0.03 * s], [0.34, 0.22 * s], [0.38, 0.45 * s], [0.33, 0.72 * s], [0.18, 0.92 * s], [0.08, 1.0 * s], [0.085, 1.04 * s], [0, 1.04 * s]], 40, 0, y, cz);
  b.cyl(o.finish, 0.025, 0.025, h - 0.85 - s, 0, y + s + (h - 0.85 - s) / 2, cz, 10);
  b.sphere('bulb', 0.1, 0, y + h - 0.6, cz, 16, 12);
  b.cyl('shade', R * 0.82, R, 0.85, 0, y + h - 0.425, cz, 48, { open: true });
}, function (o) { return [o.shadeDia, o.shadeDia, o.mountY + o.h]; }, 'Ceramic gourd table lamp with linen drum shade; mountY = table-top height.');

function leafCloud(b, mat, clusters, R, count, size) {
  var pos = [], nor = [], idx = [], n = 0;
  clusters.forEach(function (cl) {
    for (var i = 0; i < count; i++) {
      var u = R() * 2 - 1, th = R() * TAU, rr = Math.cbrt(R()), s = Math.sqrt(1 - u * u);
      var cx = cl[0] + cl[3] * rr * s * Math.cos(th), cy = cl[1] + cl[4] * rr * u, cz = cl[2] + cl[3] * rr * s * Math.sin(th);
      var yaw = R() * TAU, pitch = -0.6 + R() * 1.4, len = size[0] * (0.7 + R() * 0.6), wid = size[1] * (0.7 + R() * 0.6);
      var dx = Math.cos(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.sin(yaw) * Math.cos(pitch);
      var sx = -Math.sin(yaw), sz = Math.cos(yaw);
      var nx = -dy * sz, ny = dz * sx - dx * sz, nz = dy * sx; var nl = Math.hypot(nx, ny, nz) || 1;
      var droop = 0.3 * len;
      pos.push(cx, cy, cz,
        cx + dx * len * 0.45 + sx * wid, cy + dy * len * 0.45, cz + dz * len * 0.45 + sz * wid,
        cx + dx * len, cy + dy * len - droop * 0.4, cz + dz * len,
        cx + dx * len * 0.45 - sx * wid, cy + dy * len * 0.45, cz + dz * len * 0.45 - sz * wid);
      for (var k = 0; k < 4; k++) nor.push(nx / nl, Math.abs(ny / nl) + 0.3, nz / nl);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
    }
  });
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx); g.computeVertexNormals();
  b.add(mat, g);
}
def('plantPot', 'furniture', { type: 'olive', h: 6, potDia: 1.6, pot: 'ceramicWhite', seed: 3 }, function (b, o) {
  var R = o.potDia / 2, ph = Math.max(1.0, o.potDia * 0.95), cz = R, rnd = rng(o.seed * 7919 + 1);
  b.lathe(o.pot, [[0, 0], [R * 0.72, 0], [R * 0.8, 0.04], [R * 0.97, ph * 0.8], [R, ph - 0.04], [R * 0.985, ph], [R * 0.9, ph], [R * 0.88, ph - 0.08], [0, ph - 0.08]], 48, 0, 0, cz);
  b.cyl('soil', R * 0.88, R * 0.88, 0.02, 0, ph - 0.07, cz, 32);
  var top = o.h;
  if (o.type === 'fiddle') {
    var stems = [[0, 0], [0.18, 0.12], [-0.15, -0.1]];
    stems.forEach(function (st, si) {
      var hh = top * (0.8 + 0.2 * (si === 0 ? 1 : rnd()));
      b.tube('bark', [[st[0], ph - 0.08, cz + st[1]], [st[0] * 1.5, (ph + hh) / 2, cz + st[1] * 1.5], [st[0] * 2.2, hh - 0.3, cz + st[1] * 2.2]], 0.03, 12, 6);
      var nl = 9;
      for (var i = 0; i < nl; i++) {
        var t = 0.25 + 0.75 * i / (nl - 1), ly = ph + (hh - ph) * t, yaw = i * 2.4 + si, L = 0.75 + 0.35 * rnd();
        var s = new THREE.Shape();
        s.moveTo(0, 0); s.bezierCurveTo(0.22, 0.1, 0.18, 0.4, 0.26, 0.62); s.bezierCurveTo(0.32, 0.85, 0.12, 1.0, 0, 1.0);
        s.bezierCurveTo(-0.12, 1.0, -0.32, 0.85, -0.26, 0.62); s.bezierCurveTo(-0.18, 0.4, -0.22, 0.1, 0, 0);
        var x0 = st[0] * (1 + t * 1.2), z0 = cz + st[1] * (1 + t * 1.2);
        b.shape('leaf', s, M(x0, ly, z0, -0.9 + rnd() * 0.5, yaw, rnd() * 0.3 - 0.15, L, L, L), { curveSegments: 6 });
      }
    });
  } else {
    var tr = [[0, ph - 0.08, cz], [0.05, ph + 0.8, cz + 0.03], [-0.04, top * 0.45, cz - 0.02], [0.03, top * 0.55, cz]];
    b.tube('bark', tr, 0.065, 16, 8);
    var cl = [];
    for (var k = 0; k < 6; k++) {
      var a = k / 6 * TAU + rnd() * 0.5, rr = 0.55 + rnd() * 0.35, ey = top * (0.62 + rnd() * 0.3);
      var ex = Math.cos(a) * rr, ez = cz + Math.sin(a) * rr * 0.9;
      b.tube('bark', [[0.03, top * 0.5, cz], [ex * 0.5, (top * 0.55 + ey) / 2, cz + (ez - cz) * 0.5], [ex, ey, ez]], 0.03, 10, 6);
      cl.push([ex, ey + 0.15, ez, 0.62, 0.42]);
    }
    cl.push([0, top - 0.35, cz, 0.6, 0.35]);
    leafCloud(b, 'leafOlive', cl, rnd, 150, [0.16, 0.022]);
  }
}, function (o) { return [o.potDia + (o.type === 'olive' ? 1.6 : 1.2), o.potDia + 1.4, o.h]; }, 'Potted olive tree (leaf cloud) or fiddle-leaf fig (shape leaves). pot: ceramicWhite|terracotta|ceramicGreen|...');

def('exerciseBike', 'furniture', { frame: 'blackMetal', accent: 'stainless', saddle: 'rubberBlack' }, function (b, o) {
  var f = o.frame;
  b.rbox(f, 1.9, 0.12, 0.3, 0.05, 0, 0.06, 0.35, { seg: 1 });
  b.rbox(f, 1.75, 0.12, 0.3, 0.05, 0, 0.06, 3.9, { seg: 1 });
  [-0.8, 0.8].forEach(function (x) { b.cyl('rubberBlack', 0.06, 0.06, 0.04, x, 0.02, 0.35, 10); b.cyl('rubberBlack', 0.06, 0.06, 0.04, x * 0.9, 0.02, 3.9, 10); });
  // sweeping main frame: rear foot -> handlebar column
  b.tube(f, [[0, 0.12, 0.35], [0, 0.35, 0.9], [0, 0.85, 1.6], [0, 1.7, 2.25], [0, 2.7, 2.6], [0, 3.35, 2.75]], 0.1, 40, 12);
  // front leg down to the front foot
  b.tube(f, [[0, 1.0, 1.8], [0, 0.65, 2.7], [0, 0.35, 3.4], [0, 0.12, 3.9]], 0.075, 24, 10);
  // flywheel + guard
  b.cyl(o.accent, 0.62, 0.62, 0.12, 0, 1.05, 3.1, 48, { rz: HALF });
  b.cyl(f, 0.5, 0.5, 0.16, 0, 1.05, 3.1, 40, { rz: HALF });
  b.torus(f, 0.64, 0.035, 0.0, 1.05, 3.1, 8, 48, { ry: HALF, arc: PI * 1.15, rz: 0 });
  // seat post + saddle
  b.rod(f, [0, 0.7, 1.45], [0, 2.75, 0.95], 0.05, 12);
  b.rod(o.accent, [0, 2.45, 1.02], [0, 2.85, 0.92], 0.035, 10);
  var sad = new THREE.Shape();
  sad.moveTo(-0.08, 0.55); sad.quadraticCurveTo(0, 0.6, 0.08, 0.55); sad.lineTo(0.1, 0.2); sad.quadraticCurveTo(0.3, 0.05, 0.25, -0.1);
  sad.quadraticCurveTo(0, -0.2, -0.25, -0.1); sad.quadraticCurveTo(-0.3, 0.05, -0.1, 0.2); sad.lineTo(-0.08, 0.55);
  b.extrude(o.saddle, sad, 0.06, M(0, 2.88, 0.9, -HALF, PI, 0), { bevel: 0.035, bevelSegments: 3 });
  // handlebar
  b.rod(f, [0, 3.35, 2.75], [0, 3.62, 2.62], 0.05, 10);
  b.tube(f, [[-0.42, 3.5, 2.2], [-0.44, 3.62, 2.48], [-0.3, 3.66, 2.62], [0, 3.66, 2.64], [0.3, 3.66, 2.62], [0.44, 3.62, 2.48], [0.42, 3.5, 2.2]], 0.035, 30, 8);
  // screen facing the rider (-z)
  b.rod(f, [0, 3.66, 2.66], [0, 4.0, 2.72], 0.03, 8);
  b.push(M(0, 4.25, 2.74, -0.22, PI, 0));
  b.rbox(f, 1.8, 1.1, 0.08, 0.04, 0, 0, 0, { seg: 1 });
  b.box('screen', 1.7, 1.0, 0.01, 0, 0, 0.042);
  b.pop();
  // crank + pedals
  b.cyl(f, 0.13, 0.13, 0.42, 0, 0.98, 2.3, 18, { rz: HALF });
  [-1, 1].forEach(function (s) {
    var a = s > 0 ? 0.5 : 0.5 + PI, py = 0.98 + Math.sin(a) * 0.5, pz = 2.3 + Math.cos(a) * 0.5;
    b.rod(o.accent, [s * 0.24, 0.98, 2.3], [s * 0.26, py, pz], 0.03, 8);
    b.rbox(f, 0.3, 0.05, 0.4, 0.02, s * 0.42, py, pz, { seg: 1 });
  });
}, function () { return [1.9, 4.1, 4.8]; }, 'Peloton-style spin bike: sweeping frame, flywheel, saddle, bars, rider-facing screen. Rider sits at low z facing +z.');

def('tvWall', 'furniture', { size: 65, mountY: 4.5, standoff: 0.12 }, function (b, o) {
  var W = o.size * 0.8716 / 12, H = o.size * 0.4903 / 12, t = 0.07, y = o.mountY, z = o.standoff;
  b.bb('blackMetal', -0.6, y - 0.4, 0, 0.6, y + 0.4, z - t / 2, 0.01);
  b.rbox('frameDark', W, H, t, 0.012, 0, y, z, { seg: 1 });
  b.box('screen', W - 0.04, H - 0.04, 0.004, 0, y, z + t / 2 + 0.001);
}, function (o) { return [o.size * 0.8716 / 12, 0.2, o.mountY + o.size * 0.4903 / 24]; }, 'Wall-mounted flat TV (size = diagonal inches); screen centre at mountY.');

/* ================================================================== OUTDOOR KITCHEN (rear terrace, photos p30 / p43 / p47) */
// The as-built outdoor kitchen is a run of modular stainless-steel cabinets (brushed carcass, end panels, counter) with
// teak-look vertical-grain door and drawer fronts, a built-in stainless gas grill with a side burner, a three-drawer stack
// and an open stainless cart that carries a black ceramic kamado. Louvred black aluminium screens stand behind it.
MATDEF.teak = function () { return std({ color: 0xffffff, map: getTex('teak'), roughness: 0.55, metalness: 0 }); };
MATDEF.ceramicBlack = function () { return std({ color: 0x0d0e10, roughness: 0.22, metalness: 0.15 }); };
MATDEF.grate = function () { return std({ color: 0x2a2b2c, roughness: 0.6, metalness: 0.6 }); };
MATDEF.screenBlack = function () { return std({ color: 0x1a1b1c, roughness: 0.55, metalness: 0.35 }); };
BOXUV.teak = 1;
(function () { var g = getTex; getTex = function (name) { if (name === 'teak' && !TEX.teak) TEX.teak = MAKETEX.wood('#7b4a2c', '#3a1d0e', 53, [3, 3], 1.25); return g(name); }; })();

// stainless carcass + counter shared by every module; returns the front plane z and the usable front box
function okCarcass(b, o) {
  var w = o.w, d = o.d, h = o.h, toe = 0.33, tt = 1.5 * IN, ov = 1 * IN;
  b.bb('stainless', -w / 2, toe, 0, w / 2, h - tt, d - 0.06);                                   // body
  b.bb('rubberBlack', -w / 2 + 0.06, 0, 0.1, w / 2 - 0.06, toe, d - 0.22);                       // recessed toe kick
  if (o.top !== false) b.bb('stainless', -w / 2 - (o.ends !== 'none' ? 0.02 : 0), h - tt, 0, w / 2 + (o.ends !== 'none' ? 0.02 : 0), h, d + ov, 0.01);
  return { z: d - 0.06, y0: toe + 0.06, y1: h - tt - 0.06, x0: -w / 2 + 0.09, x1: w / 2 - 0.09 };
}
// a teak front (door or drawer) inside a stainless reveal, with a stainless pull
function okFront(b, x0, x1, y0, y1, z, pull) {
  b.bb('teak', x0 + 0.02, y0 + 0.02, z, x1 - 0.02, y1 - 0.02, z + 0.06, 0.008, { grainY: true });
  // three shallow vertical grooves = board look of the fronts (p43)
  var n = Math.max(2, Math.round((x1 - x0) / 0.38));
  for (var i = 1; i < n; i++) { var x = x0 + (x1 - x0) * i / n; b.bb('woodDark', x - 0.006, y0 + 0.06, z + 0.055, x + 0.006, y1 - 0.06, z + 0.064); }
  if (pull === 'h') { var cx = (x0 + x1) / 2, py = y1 - 0.16, L = Math.min(1.1, (x1 - x0) * 0.55);
    b.rod('stainless', [cx - L / 2, py, z + 0.13], [cx + L / 2, py, z + 0.13], 0.018, 8);
    b.rod('stainless', [cx - L / 2, py, z + 0.06], [cx - L / 2, py, z + 0.13], 0.014, 6); b.rod('stainless', [cx + L / 2, py, z + 0.06], [cx + L / 2, py, z + 0.13], 0.014, 6); }
  else if (pull) { var px = pull === 'l' ? x0 + 0.14 : x1 - 0.14, y = y1 - 0.25;
    b.rod('stainless', [px, y - 0.32, z + 0.12], [px, y, z + 0.12], 0.016, 8);
    b.rod('stainless', [px, y - 0.32, z + 0.06], [px, y - 0.32, z + 0.12], 0.012, 6); b.rod('stainless', [px, y, z + 0.06], [px, y, z + 0.12], 0.012, 6); }
}
function okDoors(b, f, n) {
  var w = (f.x1 - f.x0) / n;
  for (var i = 0; i < n; i++) okFront(b, f.x0 + w * i, f.x0 + w * (i + 1), f.y0, f.y1, f.z, n === 1 ? 'r' : (i % 2 ? 'l' : 'r'));
}

def('outdoorCabinet', 'outdoor', { w: 3, d: 2.17, h: 3.0, front: 'doors', doors: 2, drawers: 3, ends: 'both' }, function (b, o) {
  var f = okCarcass(b, o);
  if (o.front === 'drawers') { var hh = (f.y1 - f.y0) / o.drawers; for (var i = 0; i < o.drawers; i++) okFront(b, f.x0, f.x1, f.y0 + hh * i, f.y0 + hh * (i + 1), f.z, 'h'); }
  else if (o.front === 'blank') { /* plain stainless filler (corner piece) */ }
  else if (o.front === 'open') { b.bb('rubberBlack', f.x0, f.y0, f.z - 0.02, f.x1, f.y1, f.z + 0.005); }
  else okDoors(b, f, o.doors);
}, function (o) { return [o.w, o.d + IN, o.h]; }, 'Stainless outdoor base cabinet, teak-look fronts: front doors|drawers|open.');

// built-in gas grill on a teak-front base: side burner (left, closed lid) + main grill with a stainless hood
def('builtInGrill', 'outdoor', { w: 5.0, d: 2.17, h: 3.0, grillW: 3.5, side: 1.15, ends: 'both' }, function (b, o) {
  var f = okCarcass(b, o), h = o.h, d = o.d, gx0 = o.w / 2 - o.grillW - 0.05, gx1 = o.w / 2 - 0.05, sx0 = gx0 - o.side, sx1 = gx0;
  // base fronts: one door under the side burner, two under the grill (below the control band)
  var band = 0.62;
  okFront(b, f.x0, sx1 - 0.02, f.y0, f.y1, f.z, 'r');
  okDoors(b, { x0: gx0, x1: gx1, y0: f.y0, y1: f.y1 - band + 0.06, z: f.z }, 2);
  // control band (sloped stainless fascia) + knobs: 5 for the grill, 2 for the side burner
  b.bb('stainless', gx0, h - band, d - 0.1, gx1, h - 0.02, d + 0.08, 0.02);
  b.bb('stainless', sx0 + 0.04, h - 0.45, d - 0.1, sx1 - 0.03, h - 0.02, d + 0.06, 0.02);
  for (var i = 0; i < 5; i++) { var kx = gx0 + 0.45 + (o.grillW - 0.9) * i / 4; b.cyl('blackMetal', 0.075, 0.08, 0.1, kx, h - band / 2 - 0.04, d + 0.13, 16, { rx: HALF }); b.cyl('stainless', 0.03, 0.03, 0.02, kx, h - band / 2 - 0.04, d + 0.19, 8, { rx: HALF }); }
  for (var j = 0; j < 2; j++) { var kx2 = sx0 + 0.3 + j * 0.5; b.cyl('blackMetal', 0.07, 0.075, 0.1, kx2, h - 0.24, d + 0.11, 16, { rx: HALF }); }
  // grill head: firebox lip + hood (rounded back, flat front, long handle bar)
  var hz0 = 0.3, hz1 = d - 0.05, hw = o.grillW - 0.1, hc = (gx0 + gx1) / 2;
  b.bb('stainless', gx0, h, hz0 - 0.05, gx1, h + 0.12, hz1, 0.01);
  var s = new THREE.Shape(); var D = hz1 - hz0, Hh = 0.72;
  s.moveTo(0, 0); s.lineTo(D, 0); s.lineTo(D, Hh * 0.55); s.quadraticCurveTo(D * 0.95, Hh, D * 0.55, Hh); s.lineTo(D * 0.25, Hh * 0.97); s.quadraticCurveTo(0, Hh * 0.9, 0, Hh * 0.4); s.lineTo(0, 0);
  b.extrude('stainless', s, hw, M(hc + hw / 2, h + 0.12, hz0, 0, -HALF, 0), { bevel: 0.015, bevelSegments: 2, curveSegments: 12 });
  b.rod('stainless', [hc - hw / 2 + 0.25, h + 0.12 + Hh * 0.5, hz1 + 0.17], [hc + hw / 2 - 0.25, h + 0.12 + Hh * 0.5, hz1 + 0.17], 0.035, 12);
  [-1, 1].forEach(function (sg) { b.rod('stainless', [hc + sg * (hw / 2 - 0.25), h + 0.12 + Hh * 0.5, hz1 + 0.01], [hc + sg * (hw / 2 - 0.25), h + 0.12 + Hh * 0.5, hz1 + 0.17], 0.025, 8); });
  b.cyl('chrome', 0.07, 0.07, 0.02, hc, h + 0.12 + Hh * 0.72, hz1 - 0.02, 20, { rx: HALF });         // thermometer
  // side burner lid
  b.bb('stainless', sx0 + 0.06, h, 0.35, sx1 - 0.06, h + 0.1, d - 0.12, 0.02);
}, function (o) { return [o.w, o.d + 0.25, o.h + 0.85]; }, 'Built-in stainless gas grill (grillW) with a left side burner (side) on a teak-front base; hood closed.');

// open stainless cart with a shelf and a teak drawer, carrying a black ceramic kamado (photos p43, p47)
def('kamadoStation', 'outdoor', { w: 2.6, d: 2.4, h: 3.0, egg: 1.75 }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, t = 0.07;
  b.bb('stainless', -w / 2, 0.08, 0, -w / 2 + t, h, d); b.bb('stainless', w / 2 - t, 0.08, 0, w / 2, h, d);       // side panels
  b.bb('stainless', -w / 2, h - 0.12, 0, w / 2, h, d, 0.01);                                                      // top deck
  b.bb('stainless', -w / 2, 0.08, 0, w / 2, h, 0.06);                                                             // back
  b.bb('stainless', -w / 2 + t, 1.3, 0.06, w / 2 - t, 1.36, d - 0.05);                                            // shelf
  b.bb('stainless', -w / 2, 0, 0.05, w / 2, 0.08, d - 0.05);                                                      // plinth
  okFront(b, -w / 2 + t, w / 2 - t, 0.1, 1.25, d - 0.08, 'h');                                                    // drawer
  // kamado: glazed ceramic bowl + dome, stainless band at the seam, cast vent on top, bamboo-free (photos show none)
  var R = o.egg / 2, y0 = h + 0.02, cz = d / 2, yS = y0 + R * 0.95;
  b.cyl('blackMetal', R * 0.55, R * 0.6, 0.06, 0, y0 + 0.03, cz, 24);
  b.lathe('ceramicBlack', [[0, y0 + 0.05], [R * 0.55, y0 + 0.06], [R * 0.85, y0 + R * 0.35], [R, y0 + R * 0.75], [R, yS]], 40, 0, 0, cz);
  b.lathe('ceramicBlack', [[R * 0.99, yS + 0.04], [R * 0.98, yS + R * 0.3], [R * 0.8, yS + R * 0.72], [R * 0.45, yS + R * 0.95], [0.12, yS + R * 1.02], [0, yS + R * 1.02]], 40, 0, 0, cz);
  b.torus('stainless', R + 0.02, 0.035, 0, yS - 0.02, cz, 8, 40, { rx: HALF });
  b.torus('stainless', R + 0.02, 0.035, 0, yS + 0.07, cz, 8, 40, { rx: HALF });
  b.cyl('stainless', 0.13, 0.15, 0.12, 0, yS + R * 1.02 + 0.06, cz, 20);
  b.cyl('blackMetal', 0.16, 0.14, 0.05, 0, yS + R * 1.02 + 0.14, cz, 20);
  b.bb('stainless', -0.18, yS - 0.06, cz + R - 0.02, 0.18, yS + 0.02, cz + R + 0.18, 0.02);                     // front latch / handle
  b.bb('blackMetal', -0.3, yS - 0.25, cz - R - 0.12, 0.3, yS + 0.25, cz - R + 0.02, 0.02);                        // rear hinge
}, function (o) { return [o.w, o.d, o.h + o.egg * 1.05 + 0.2]; }, 'Open stainless cart (shelf + teak drawer) with a large black ceramic kamado on top.');

// louvred privacy screen panel: horizontal blade slats between two slim side rails (black aluminium), origin bottom-centre
def('louvreScreen', 'outdoor', { w: 4, h: 7.5, slat: 3.5 * IN, gap: 1.25 * IN, depth: 1.25 * IN, tilt: 0.12, rails: true }, function (b, o) {
  var n = Math.floor((o.h + o.gap) / (o.slat + o.gap)), pitch = o.h / n;
  for (var i = 0; i < n; i++) b.boxR('screenBlack', o.w - (o.rails ? 0.1 : 0), o.slat, 0.03, 0, pitch * (i + 0.5), 0, o.tilt, 0, 0);
  if (o.rails) [-1, 1].forEach(function (s) { b.bb('screenBlack', s * o.w / 2 - 0.05, 0, -o.depth / 2, s * o.w / 2 + 0.05, o.h, o.depth / 2); });
}, function (o) { return [o.w, o.depth, o.h]; }, 'Black louvred screen panel (horizontal blades, slight tilt), w x h.');

/* ================================================================== API */
FIX.make = function (kind, o) {
  var K = KINDS[kind];
  if (!K) throw new Error('FIX.make: unknown kind "' + kind + '"');
  var oo = opt(K.defaults, o);
  var b = new Builder();
  K.build(b, oo);
  var g = b.build(kind);
  g.userData = { kind: kind, category: K.category, opts: oo, size: K.size(oo) };
  return g;
};
FIX.kinds = KIND_ORDER.map(function (k) {
  var K = KINDS[k];
  return { kind: k, category: K.category, defaults: K.defaults, size: K.size(opt(K.defaults, {})), note: K.note };
});
FIX.sizeOf = function (kind, o) { var K = KINDS[kind]; return K.size(opt(K.defaults, o)); };
FIX.helpers = { roundedBox: roundedBoxGeo, basin: basinGeo, merge: mergeGeoms, M: M, Builder: Builder };
FIX.stats = function (obj) {
  var tris = 0, meshes = 0;
  obj.traverse(function (m) { if (m.isMesh) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
  return { meshes: meshes, triangles: Math.round(tris) };
};
global.FIX = FIX;
})(typeof window !== 'undefined' ? window : this);
