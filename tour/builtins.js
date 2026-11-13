/*!
 * BUILTIN — built-in joinery for the 118 Hillside walkthrough (three.js r128, global THREE + FIX).
 * Same conventions as FIX: feet; origin = centre of the piece's BACK edge on the floor; width along x,
 * depth toward +z (front faces +z), y up.
 * Kinds are fixtures (category 'builtin'): they stay when the viewer turns the furniture off. Their CONTENTS
 * (books, vases) are staging: they are built into a child group tagged userData.contents = true, which the page
 * shows or hides with the furniture.
 *
 * builtinBookcase — a wall-to-wall built-in for a recess (photos p16 / p34 / p31 / x02 / x03): a run of white
 *   raised-panel base cabinets (pairs of doors, round knobs, recessed toe kick) under a thin quartz top, with
 *   floating butcher-block (edge-glued maple, 1 1/2") shelves above; optional side panels, crown and LED strips under the shelves (off by
 *   default: the recess walls are the sides and the photos show neither crown nor strip lights).
 *   The shelves are filled procedurally (seeded): runs of upright books in a muted palette, some series of
 *   matching volumes, the odd book leaning on its neighbours, flat stacks topped with a small object, and a few
 *   vases / bowls. Books are drawn with InstancedMesh (4 spine designs + one page-block mesh), the cabinetry and
 *   decor are merged per material, so the whole piece is ~15 draw calls whatever the shelf length.
 *
 * API: BUILTIN.make(kind, opts) -> THREE.Group (userData {kind, category:'builtin', opts, size:[w,d,h]})
 *      BUILTIN.sizeOf(kind, opts) · BUILTIN.has(kind) · BUILTIN.kinds · BUILTIN.fillStats(group)
 */
(function (global) {
'use strict';
var THREE = global.THREE, FIX = global.FIX;
if (!THREE || !FIX || !FIX.helpers) { if (global.console) console.warn('BUILTIN: needs three.js and fixtures.js'); return; }
var H = FIX.helpers, Builder = H.Builder, M = H.M, PI = Math.PI, TAU = PI * 2, HALF = PI / 2, IN = 1 / 12;
var BUILTIN = { version: '1.0.0' }, KINDS = {}, ORDER = [];

function opt(d, o) { var r = {}, k; for (k in d) r[k] = d[k]; if (o) for (k in o) if (o[k] !== undefined) r[k] = o[k]; return r; }
function rng(seed) { var s = (seed >>> 0) || 0x9e3779b9; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function lin(c) { return new THREE.Color(c).convertSRGBToLinear(); }
function std(p) { if (p.color !== undefined) p.color = lin(p.color); return new THREE.MeshStandardMaterial(p); }
function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }

/* ------------------------------------------------------------ textures & materials */
var TX = {};
function butcherBlock() {   // edge-glued maple butcher block: staves 1.5-2" wide running along u (the shelf length), 1 ft tile, oiled
  if (TX.bb) return TX.bb;
  var W = 512, PXIN = W / 12, c = canvas(W), x = c.getContext('2d'), R = rng(23), i;
  var y0 = 0, staves = [];
  while (y0 < W - 1) { var sw = Math.round((1.5 + R() * 0.5) * PXIN); if (W - (y0 + sw) < 1.5 * PXIN) sw = W - y0; staves.push([y0, sw]); y0 += sw; }
  staves.forEach(function (st) {
    var ys = st[0], sw = st[1], base = 0.84 + R() * 0.16, warm = R(), seg = 0;
    while (seg < W) {   // finger-jointed lengths, each a slightly different board
      var L = 160 + R() * 340, t = base * (0.95 + R() * 0.08);
      x.fillStyle = 'rgb(' + (224 * t | 0) + ',' + ((182 + warm * 14) * t | 0) + ',' + ((130 + warm * 16) * t | 0) + ')';
      x.fillRect(seg, ys, L, sw); seg += L;
    }
    for (i = 0; i < 22; i++) {   // long grain lines, lengthwise
      x.strokeStyle = 'rgba(' + (140 + R() * 40 | 0) + ',' + (98 + R() * 30 | 0) + ',' + (55 + R() * 20 | 0) + ',' + (0.07 + R() * 0.12) + ')';
      x.lineWidth = 0.5 + R() * 1.3; var yy = ys + 2 + R() * (sw - 4), ph = R() * 6; x.beginPath(); x.moveTo(0, yy);
      for (var u = 0; u <= W; u += 32) x.lineTo(u, yy + Math.sin(u / 85 + ph) * 1.1); x.stroke();
    }
    x.fillStyle = 'rgba(110,75,40,.22)'; x.fillRect(0, ys, W, 1.2);   // glue line
  });
  var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return (TX.bb = t);
}
function spineTex(k) {      // greyscale spine designs: 0.78 grey = the book's own colour, lighter / darker bands = foil and labels
  if (TX['sp' + k]) return TX['sp' + k];
  var W = 64, Hh = 256, c = canvas(W, Hh), x = c.getContext('2d'), base = 199;
  x.fillStyle = 'rgb(' + base + ',' + base + ',' + base + ')'; x.fillRect(0, 0, W, Hh);
  var band = function (y, h, v) { x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(4, y, W - 4, h); };
  var R = rng(31 + k * 7);
  var text = function (y0, y1, v, w0) {   // a title running along the spine: a narrow column of letter strokes broken into words
    x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.9)'; var cw = Math.max(3, (w0 || 12) / 3);
    for (var y = y0; y < y1;) { var L = 2 + R() * 3; x.fillRect(W / 2 - cw / 2 + (R() - 0.5), y, cw * (0.7 + R() * 0.3), L); y += L + 1.2 + (R() < 0.18 ? 6 : 0); }
  };
  switch (k) {
    case 0: band(16, 2, 245); band(22, 1, 245); text(56, 118, 240); text(200, 208, 240, 10); band(232, 1, 245); band(237, 2, 245); break;   // gilt rules + title
    case 1: band(44, 56, 232); text(52, 92, 80, 18); band(222, 10, 150); break;                                                          // paper label + dark foot band
    case 2: text(28, 96, 246); text(214, 222, 246, 8); break;                                                                             // plain jacket, light title
    case 3: band(0, 30, 150); band(226, 30, 150); text(70, 128, 60, 16); break;                                                           // two-tone jacket, dark title
  }
  x.fillStyle = 'rgb(' + base + ',' + base + ',' + base + ')'; x.fillRect(0, 0, 4, Hh);   // u < 4px: plain (cover / edge faces sample here)
  var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return (TX['sp' + k] = t);
}
var MATS = {
  maple: function () { return std({ color: 0xffffff, map: butcherBlock(), roughness: 0.72, metalness: 0 }); },   // matte oiled finish
  satinNickel: function () { return std({ color: 0xcfcdc8, metalness: 1, roughness: 0.32 }); },
  ledgeA: function () { return std({ color: 0xa39c90, roughness: 0.93, metalness: 0 }); },    // r44 stacked ledgestone, four tones
  ledgeB: function () { return std({ color: 0x8f887c, roughness: 0.95, metalness: 0 }); },
  ledgeC: function () { return std({ color: 0xb4ad9f, roughness: 0.9, metalness: 0 }); },
  ledgeD: function () { return std({ color: 0x7c766c, roughness: 0.95, metalness: 0 }); },
  stoneBlack: function () { return std({ color: 0x2b2826, roughness: 0.92, metalness: 0 }); },
  stoneCream: function () { return std({ color: 0xe9e3d6, roughness: 0.8, metalness: 0 }); },
  glazeSage: function () { return std({ color: 0x9aa58f, roughness: 0.35, metalness: 0 }); },
  pages: function () { return std({ color: 0xefe8d8, roughness: 0.95, metalness: 0 }); },
  ledStrip: function () { return std({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 1.2, roughness: 0.5 }); },
  ledGlow: function () { return std({ color: 0xfff4e0, emissive: 0xfff4e0, emissiveIntensity: 0.25, roughness: 1, transparent: true, opacity: 0.0 }); }
};
var made = {};
function mat(k) { if (!made[k]) { made[k] = MATS[k](); made[k].name = k; } return made[k]; }
var spineMats = [];
function spineMat(k) { if (!spineMats[k]) { spineMats[k] = std({ color: 0xffffff, map: spineTex(k), roughness: 0.7, metalness: 0 }); spineMats[k].name = 'bookSpine' + k; } return spineMats[k]; }

function def(kind, defaults, build, size, note, category) { KINDS[kind] = { kind: kind, category: category || 'builtin', defaults: defaults, build: build, size: size, note: note || '' }; ORDER.push(kind); }

/* ------------------------------------------------------------ joinery */
var DOORT = 0.75 * IN, GAP = 0.125 * IN;
// raised-panel door (photos: square frame, a beaded / ogee step down to a flat raised field) centred (cx, cy), face at zf
function raisedDoor(b, fin, w, h, cx, cy, zf) {
  var t = DOORT, f = Math.min(2.5 * IN, w * 0.2, h * 0.2), zc = zf - t / 2, bead = 0.45 * IN;
  b.rbox(fin, f, h, t, 0.006, cx - w / 2 + f / 2, cy, zc);
  b.rbox(fin, f, h, t, 0.006, cx + w / 2 - f / 2, cy, zc);
  b.rbox(fin, w - 2 * f + 0.004, f, t, 0.006, cx, cy + h / 2 - f / 2, zc);
  b.rbox(fin, w - 2 * f + 0.004, f, t, 0.006, cx, cy - h / 2 + f / 2, zc);
  var iw = w - 2 * f, ih = h - 2 * f;
  b.box(fin, iw + 0.01, ih + 0.01, t * 0.45, cx, cy, zf - t + t * 0.225);                  // recessed ground
  [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (s) {                                  // bead moulding around the field
    if (s[0]) b.box(fin, bead, ih - 0.004, t * 0.32, cx + s[0] * (iw / 2 - bead / 2), cy, zf - t * 0.55 + t * 0.16);
    else b.box(fin, iw - 0.004, bead, t * 0.32, cx, cy + s[1] * (ih / 2 - bead / 2), zf - t * 0.55 + t * 0.16);
  });
  b.box(fin, iw - 2 * bead - 0.03, ih - 2 * bead - 0.03, t * 0.7, cx, cy, zf - t + t * 0.35);   // raised field
}
function knob(b, m, x, y, z) {
  b.lathe(m, [[0, 0], [0.026, 0], [0.016, 0.028], [0.018, 0.062], [0.05, 0.082], [0.055, 0.1], [0.046, 0.116], [0, 0.12]], 18, x, y, z, { rx: HALF });
}
function counterSlab(b, m, x0, x1, z0, z1, y0, t) {
  var e = 0.012;
  b.rbox(m, x1 - x0, t, z1 - z0, e, (x0 + x1) / 2, y0 + t / 2, (z0 + z1) / 2, { boxUV: true });
}

/* ------------------------------------------------------------ shelf contents */
var PALETTE = ['#e9e2d4', '#dcd0b8', '#cbbb9d', '#ada38e', '#8a9381', '#64726a', '#8e9ca4', '#5f6e7b', '#3e4954', '#2f3236', '#202225',
  '#8c705a', '#a6846b', '#bb998b', '#c8b8ac', '#71604f', '#f1eee7', '#b7a982', '#7d6d52', '#9b8f7d', '#4f5a52'];
var ACCENT = ['#7a4034', '#2f4a44', '#9b6b3d', '#5a4a63'];
function pickColor(R) { return R() < 0.07 ? ACCENT[(R() * ACCENT.length) | 0] : PALETTE[(R() * PALETTE.length) | 0]; }

// fills one shelf bay: x0..x1 (local), floor y, clear height hClear, depth d (z from 0 = back), pushes books into list / decor into b
function fillBay(R, books, b, x0, x1, y, hClear, d, density) {
  var x = x0 + 0.03 + R() * 0.1, end = x1 - 0.03, lastH = 0;
  var maxH = Math.min(hClear - 0.06, 1.0);
  while (x < end - 0.08) {
    var r = R();
    if (r < 0.12 * (1.4 - density)) { x += 0.15 + R() * 0.35; lastH = 0; continue; }          // breathing space
    if (r < 0.26) {                                                                             // decor object
      var o = decor(R, b, x, y, Math.min(hClear - 0.05, 0.9), d, end);
      if (o) { x = o + 0.06 + R() * 0.12; lastH = 0; continue; }
    }
    if (r < 0.40) {                                                                             // flat stack (+ object on top)
      var n = 2 + ((R() * 4) | 0), sw = 0.62 + R() * 0.32, yy = y, sx = x + sw / 2;
      if (sx + sw / 2 > end) break;
      for (var i = 0; i < n && yy - y < hClear * 0.55; i++) {
        var th = 0.05 + R() * 0.1, bw = sw * (0.9 + R() * 0.1), dd = Math.min(d - 0.05, 0.5 + R() * 0.3);
        books.push({ x: sx + (R() - 0.5) * 0.04, y: yy, z: d - 0.03 - dd + (R() - 0.5) * 0.03 - 0.02, t: bw, h: th, d: dd, flat: true, ry: (R() - 0.5) * 0.08, c: pickColor(R), s: (R() * 4) | 0 });
        yy += th;
      }
      if (R() < 0.55 && hClear - (yy - y) > 0.35) smallObject(R, b, sx, yy, d * 0.5, hClear - (yy - y) - 0.05);
      x += sw + 0.05 + R() * 0.08; lastH = 0; continue;
    }
    // run of upright books: sometimes a matching series
    var nb = 4 + ((R() * 11) | 0), series = R() < 0.3, sc = pickColor(R), sh = 0.62 + R() * (maxH - 0.62), sd = 0.5 + R() * 0.2, ss = (R() * 4) | 0;
    for (var k = 0; k < nb; k++) {
      var t = series ? 0.1 + R() * 0.02 : 0.05 + Math.pow(R(), 1.6) * 0.14;
      if (x + t > end) break;
      var h = series ? sh : Math.min(maxH, 0.58 + R() * 0.42), dz = series ? sd : Math.min(d - 0.04, 0.45 + R() * 0.3);
      books.push({ x: x + t / 2, y: y, z: Math.max(0.01, d - 0.05 - dz - R() * 0.03), t: t, h: h, d: dz, c: series ? sc : pickColor(R), s: series ? ss : (R() * 4) | 0 });
      x += t + 0.002 + R() * 0.004; lastH = h;
    }
    if (lastH > 0 && R() < 0.35) {                                                             // one leaning on the run
      var lt = 0.06 + R() * 0.08, lh = Math.min(lastH * (0.8 + R() * 0.15), maxH), a = 0.12 + R() * 0.2, ld = 0.45 + R() * 0.25;
      var span = lh * Math.sin(a) + lt * Math.cos(a);
      if (x + span < end) { books.push({ x: x + span / 2, y: y, z: Math.max(0.01, d - 0.05 - ld), t: lt, h: lh, d: ld, rz: a, c: pickColor(R), s: (R() * 4) | 0 }); x += span; }
    }
    x += 0.02 + R() * 0.06; lastH = 0;
  }
}
function smallObject(R, b, x, y, z, hMax) {
  var k = R();
  if (k < 0.4) { var r = 0.09 + R() * 0.05; b.sphere(R() < 0.5 ? 'stoneBlack' : 'stoneCream', r, x, y + r * 0.92, z, 18, 12); }
  else if (k < 0.75) { var h = Math.min(hMax, 0.35 + R() * 0.2); b.lathe('ceramicWhite', [[0, 0], [0.07, 0], [0.085, h * 0.35], [0.06, h * 0.75], [0.03, h * 0.86], [0.035, h], [0, h]], 20, x, y, z); }
  else b.bb('wood', x - 0.2, y, z - 0.13, x + 0.2, y + 0.14, z + 0.13, 0.01);
}
// a free-standing object; returns its right edge or null when it doesn't fit
function decor(R, b, x, y, hMax, d, end) {
  var k = R(), z = Math.min(d * 0.5, 0.5);
  if (hMax < 0.45) return null;
  if (k < 0.4) {                     // round black stoneware pot (as staged in the photos)
    var r = Math.min(0.26 + R() * 0.16, d * 0.5 - 0.02), h = Math.min(hMax, r * (1.3 + R() * 0.4));
    if (x + 2 * r > end) return null;
    b.lathe('stoneBlack', [[0, 0], [r * 0.55, 0], [r * 0.92, h * 0.25], [r, h * 0.5], [r * 0.85, h * 0.8], [r * 0.45, h * 0.97], [r * 0.38, h], [0, h * 0.99]], 28, x + r, y, z);
    return x + 2 * r;
  }
  if (k < 0.65) {                    // tall white bottle vase
    var h2 = Math.min(hMax, 0.55 + R() * 0.3), r2 = 0.13;
    if (x + 2 * r2 > end) return null;
    b.lathe(R() < 0.6 ? 'ceramicWhite' : 'glazeSage', [[0, 0], [r2 * 0.8, 0], [r2, h2 * 0.15], [r2 * 0.95, h2 * 0.5], [r2 * 0.6, h2 * 0.7], [r2 * 0.32, h2 * 0.82], [r2 * 0.36, h2], [0, h2]], 24, x + r2, y, z);
    return x + 2 * r2;
  }
  if (k < 0.85) {                    // shallow bowl
    var r3 = Math.min(0.32, d * 0.5 - 0.02);
    if (x + 2 * r3 > end) return null;
    b.lathe('stoneCream', [[0, 0], [r3 * 0.45, 0], [r3 * 0.85, 0.08], [r3, 0.16], [r3 * 0.94, 0.165], [r3 * 0.78, 0.09], [0, 0.07]], 28, x + r3, y, z);
    return x + 2 * r3;
  }
  var w = 0.38 + R() * 0.12;         // knot / sculpture stand-in: a low burl box
  if (x + w > end) return null;
  b.bb('wood', x, y, z - 0.16, x + w, y + 0.2, z + 0.16, 0.012);
  return x + w;
}
// books -> InstancedMeshes: per spine design, one for upright and one for flat books (spine UVs turned 90 deg), plus page blocks
function unitBook(flat) {   // unit book: base on y=0, back at z=0, spine (+z face) at z=1; only the spine samples the design
  var geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0.5);
  var uv = geo.attributes.uv;
  for (var i = 0; i < uv.count; i++) {
    if ((i / 4 | 0) !== 4) uv.setXY(i, 0.02, 0.5);
    else if (flat) { var u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, 1 - u); }   // lying: the title runs along the length
  }
  return geo;
}
function bookMeshes(list) {
  var g = new THREE.Group(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  var geoU = unitBook(false), geoF = unitBook(true), pg = new THREE.BoxGeometry(1, 1, 1); pg.translate(0, 0.5, 0.5);
  var frame = function (bk, cap) {   // matrix of the book, or of its page block (a thin cap just above the cover top, short of the spine)
    e.set(0, bk.ry || 0, bk.rz || 0, 'YXZ'); q.setFromEuler(e);
    if (bk.rz) {   // leaning: centre placed so the low corner sits on the shelf
      var a = Math.abs(bk.rz), cy = (bk.h * Math.cos(a) + bk.t * Math.sin(a)) / 2;
      p.set(bk.x, bk.y + cy, bk.z).add(new THREE.Vector3(0, -bk.h / 2, 0).applyQuaternion(q));
    } else p.set(bk.x, bk.y, bk.z);
    if (!cap) return new THREE.Matrix4().compose(p, q, s.set(bk.t, bk.h, bk.d));
    var mm = new THREE.Matrix4().compose(p, q, s.set(bk.t - 0.012, 0.006, bk.d - 0.025));
    return mm.multiply(new THREE.Matrix4().makeTranslation(0, (bk.h + 0.0015) / 0.006, 0));
  };
  [false, true].forEach(function (flat) {
    var byS = [[], [], [], []];
    list.forEach(function (bk) { if (!!bk.flat === flat) byS[bk.s].push(bk); });
    byS.forEach(function (arr, k) {
      if (!arr.length) return;
      var im = new THREE.InstancedMesh(flat ? geoF : geoU, spineMat(k), arr.length);
      arr.forEach(function (bk, i) { im.setMatrixAt(i, frame(bk)); col.copy(lin(bk.c)).multiplyScalar(1.28); im.setColorAt(i, col); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; im.name = (flat ? 'booksFlat' : 'books') + k; g.add(im);
    });
  });
  var up = list.filter(function (bk) { return !bk.flat; });
  if (up.length) {
    var ip = new THREE.InstancedMesh(pg, mat('pages'), up.length);
    up.forEach(function (bk, i) { ip.setMatrixAt(i, frame(bk, true)); });
    ip.instanceMatrix.needsUpdate = true; ip.frustumCulled = false; ip.castShadow = false; ip.receiveShadow = true; ip.name = 'bookPages'; g.add(ip);
  }
  g.userData.bookCount = list.length;
  return g;
}

/* ------------------------------------------------------------ builtinBookcase */
def('builtinBookcase', {
  w: 10, d: 1.0, h: 3.0, ct: 1.25 * IN, counter: 'quartz', overhang: 1 * IN, boxes: 3, doorsPerBox: 2, kick: 4 * IN, kickD: 2.5 * IN,
  finish: 'cabinetWhite', hw: 'satinNickel',
  levels: [5.0, 6.25, 7.5, 8.75], shelfT: 1.5 * IN, shelfD: null, shelfMat: 'maple',
  sidePanels: false, crown: false, lights: false,
  fill: 'books', seed: 7, density: 0.8, counterDecor: true, counterMat: null
}, function (b, o, R, books, deco) {
  var w = o.w, d = o.d, top = o.h - o.ct, fin = o.finish, xl = -w / 2 + (o.sidePanels ? DOORT : 0), xr = w / 2 - (o.sidePanels ? DOORT : 0);
  // base cabinets: carcass, recessed toe kick, then a row of boxes with pairs of raised-panel doors
  b.bb(fin, xl, o.kick, 0, xr, top, d - DOORT);
  b.bb(fin, xl, 0, 0, xr, o.kick, d - DOORT - o.kickD);
  b.bb('castIron', xl + 0.01, 0, d - DOORT - o.kickD - 0.002, xr - 0.01, 0.004, d - DOORT - o.kickD + 0.01);   // shadow line at the toe
  var bw = (xr - xl) / o.boxes, fy0 = o.kick + GAP / 2, fy1 = top - 0.1, fh = fy1 - fy0, cy = (fy0 + fy1) / 2;
  b.bb(fin, xl, fy1, d - DOORT, xr, top, d, 0.004);   // face-frame top rail under the counter
  for (var i = 0; i < o.boxes; i++) {
    var X0 = xl + i * bw + GAP / 2, X1 = xl + (i + 1) * bw - GAP / 2, n = o.doorsPerBox, dw = (X1 - X0 - (n - 1) * GAP) / n;
    for (var j = 0; j < n; j++) {
      var dcx = X0 + dw / 2 + j * (dw + GAP);
      raisedDoor(b, fin, dw, fh, dcx, cy, d);
      var side = n === 1 ? 1 : (j < n / 2 ? 1 : -1);
      knob(b, o.hw, dcx + side * (dw / 2 - 0.13), fy1 - 0.2, d);
    }
  }
  if (o.sidePanels) [-1, 1].forEach(function (s) { b.bb(fin, s < 0 ? -w / 2 : w / 2 - DOORT, 0, 0, s < 0 ? -w / 2 + DOORT : w / 2, o.levels[o.levels.length - 1] + 0.2, d, 0.004); });
  if (o.counter) counterSlab(b, o.counter, -w / 2, w / 2, 0, d + o.overhang, top, o.ct);
  // floating shelves (hidden cleats), wall to wall
  var sd = o.shelfD || d, st = o.shelfT;
  o.levels.forEach(function (lv) {
    b.bb(o.shelfMat, -w / 2 + 0.003, lv - st, 0, w / 2 - 0.003, lv, sd, 0.008, { boxUV: true });
    if (o.lights) { b.bb('ledStrip', -w / 2 + 0.1, lv - st - 0.012, sd - 0.12, w / 2 - 0.1, lv - st - 0.002, sd - 0.09); }
  });
  if (o.crown) {
    var ct = o.levels[o.levels.length - 1] + 0.9;
    b.bb(fin, -w / 2, ct, 0, w / 2, ct + 0.3, sd + 0.08, 0.01);
  }
  // contents
  if (o.fill === 'books') {
    var floors = [{ y: o.h, clear: o.levels[0] - st - o.h, counter: true }];
    o.levels.forEach(function (lv, k) { floors.push({ y: lv, clear: k + 1 < o.levels.length ? o.levels[k + 1] - st - lv : 1.15 }); });
    floors.forEach(function (f) {
      if (f.counter) {   // the counter keeps a light touch: a pair of vases and a short stack (photos: two black vases)
        if (!o.counterDecor) return;
        var cx = -w * 0.18 + (R() - 0.5) * 0.4;
        [-0.2, 0.2].forEach(function (dx) { var h = 0.95; deco.lathe('stoneBlack', [[0, 0], [0.12, 0], [0.17, h * 0.22], [0.1, h * 0.45], [0.18, h * 0.62], [0.11, h * 0.85], [0.07, h * 0.92], [0.075, h], [0, h]], 24, cx + dx, f.y, d * 0.45); });
        var sx = w * 0.22, yy = f.y;
        for (var q = 0; q < 3; q++) { var th = 0.07 + R() * 0.06; books.push({ x: sx - 0.4, y: yy, z: d * 0.08, t: 0.85 - q * 0.06, h: th, d: 0.62 - q * 0.04, flat: true, ry: (R() - 0.5) * 0.1, c: pickColor(R), s: (R() * 4) | 0 }); yy += th; }
        smallObject(R, deco, sx, yy, d * 0.4, 0.5);
        return;
      }
      fillBay(R, books, deco, -w / 2 + 0.02, w / 2 - 0.02, f.y, f.clear, sd, o.density);
    });
  }
}, function (o) { return [o.w, o.d + o.overhang, o.levels[o.levels.length - 1] + (o.crown ? 1.2 : 0)]; },
'Wall-to-wall built-in for a recess: raised-panel base cabinets + quartz top, floating butcher-block shelves above, filled with books / decor (seeded). levels = shelf top heights (ft).');

/* ------------------------------------------------------------ libraryWall (concept r43f)
   A wall of books that follows a vaulted ceiling: painted uprights from the floor to the ceiling line, butcher-block shelves on one set
   of levels right along the wall, base cabinets with a deeper top under the tall bays, a rolling ladder on a black rail.
   top(x) = apex - pitch * |x - ridge| is the ceiling line along the wall (local x, feet). bays = [[x0, x1, type], ...] along the wall:
   'base' (cabinet doors to baseH, shelves above), 'seat' (shelves from seatH: a window seat stands in front of it), 'door' (a doorway
   passes through: shelves from doorH up, the bay split above the door), 'post' (left empty: structure stands there). */
def('libraryWall', {
  w: 17.33, d: 1.0, baseD: 1.33, baseH: 3.0, ridge: 4.92, apex: 13.57, pitch: 0.41, bays: null, doorH: 7.4, seatH: 1.9, step: 1.1,
  rail: 8.45, railFrom: null, ladderX: null, ladderRun: 1.9, finish: 'cabinetWhite', shelfMat: 'maple', hw: 'satinNickel', ladderMat: 'wood',
  fill: 'books', seed: 21, density: 0.92
}, function (b, o, R, books, deco) {
  var d = o.d, fin = o.finish, T = 0.085, st = 1.25 * IN, ct = 1.5 * IN, kick = 4 * IN, i;
  var top = function (x) { return o.apex - o.pitch * Math.abs(x - o.ridge); };
  var bays = (o.bays && o.bays.length) ? o.bays : [[-o.w / 2, o.w / 2, 'base']];
  var snap = function (y) { return o.baseH + Math.round((y - o.baseH) / o.step) * o.step; };
  var upright = function (x, y0, dep) { var xx = Math.max(-o.w / 2 + T / 2, Math.min(o.w / 2 - T / 2, x)); b.bb(fin, xx - T / 2, y0, 0, xx + T / 2, top(xx) - 0.012, dep || d, 0.004); };
  var shelves = function (x0, x1, y0, floorIsShelf) {   // shelves and their contents between two uprights, from y0 up to the ceiling line
    var lo = Math.min(top(x0), top(x1)), ys = [], y;
    for (y = y0; y + 0.78 <= lo; y += o.step) ys.push(y);
    ys.forEach(function (yy, k) {
      if (k > 0 || floorIsShelf) b.bb(o.shelfMat, x0, yy - st, 0, x1, yy, d - 0.015, 0.004, { boxUV: true });
      var clear = (k + 1 < ys.length ? ys[k + 1] - st : lo - 0.04) - yy;
      if (o.fill === 'books' && clear > 0.5) fillBay(R, books, deco, x0 + 0.015, x1 - 0.015, yy, Math.min(clear, 1.3), d - 0.03, o.density);
    });
  };
  var edges = {};
  bays.forEach(function (B) { if (B[2] !== 'post') { edges[B[0].toFixed(3)] = B[0]; edges[B[1].toFixed(3)] = B[1]; } });
  for (var e in edges) upright(edges[e], 0);
  bays.forEach(function (B) {
    var x0 = B[0] + T / 2, x1 = B[1] - T / 2, ty = B[2], w = x1 - x0, cx = (x0 + x1) / 2;
    if (ty === 'post') return;
    // the board under the ceiling, following the slope (a bay never straddles the ridge: the post bay does)
    var ya = top(B[0]), yb = top(B[1]), L = Math.hypot(B[1] - B[0], yb - ya);
    b.boxR(fin, L, 0.07, d, (B[0] + B[1]) / 2, (ya + yb) / 2 - 0.05, d / 2, 0, 0, Math.atan2(yb - ya, B[1] - B[0]));
    if (ty === 'base') {
      var bd = o.baseD, ctop = o.baseH - ct, fy0 = kick + GAP / 2, fy1 = ctop - 0.1, fh = fy1 - fy0, n = w > 1.3 ? 2 : 1, dw = (w - 2 * GAP - (n - 1) * GAP) / n;
      b.bb(fin, B[0], kick, 0, B[1], ctop, bd - DOORT);
      b.bb(fin, B[0], 0, 0, B[1], kick, bd - DOORT - 2.5 * IN);
      b.bb('castIron', B[0] + 0.01, 0, bd - DOORT - 2.5 * IN - 0.002, B[1] - 0.01, 0.004, bd - DOORT - 2.5 * IN + 0.01);
      b.bb(fin, B[0], fy1, bd - DOORT, B[1], ctop, bd, 0.004);
      for (var j = 0; j < n; j++) {
        var dcx = x0 + GAP + dw / 2 + j * (dw + GAP);
        raisedDoor(b, fin, dw, fh, dcx, (fy0 + fy1) / 2, bd);
        knob(b, o.hw, dcx + (n === 1 ? 1 : (j === 0 ? 1 : -1)) * (dw / 2 - 0.13), fy1 - 0.2, bd);
      }
      b.rbox(o.shelfMat, B[1] - B[0] + 0.002, ct, bd + 1 * IN, 0.01, (B[0] + B[1]) / 2, ctop + ct / 2, (bd + 1 * IN) / 2, { boxUV: true });
      shelves(x0, x1, o.baseH, false);
    } else if (ty === 'seat') {
      var sy = snap(o.seatH);
      b.bb(fin, x0, 0, d - DOORT, x1, sy - st, d, 0.004);
      shelves(x0, x1, sy, true);
    } else if (ty === 'door') {
      var dy = snap(o.doorH), m = Math.max(1, Math.ceil((B[1] - B[0]) / 2.4)), sw = (B[1] - B[0]) / m;
      b.bb(o.shelfMat, x0, dy - st, 0, x1, dy, d - 0.015, 0.004, { boxUV: true });                 // the shelf over the door, wall to wall
      b.bb(fin, x0, dy - st - 0.3, d - DOORT, x1, dy - st, d, 0.004);                               // and a head board under it
      for (i = 1; i < m; i++) upright(B[0] + i * sw, dy);
      for (i = 0; i < m; i++) shelves(B[0] + i * sw + T / 2, B[0] + (i + 1) * sw - T / 2, dy, false);
    }
  });
  // rail and rolling ladder
  var rz = Math.max(d, 0) + 0.22, ry = o.rail, xa = o.railFrom != null ? o.railFrom : -o.w / 2 + 0.1, xb = o.w / 2 - 0.08;
  if (ry) {
    b.rod('blackMetal', [xa, ry, rz], [xb, ry, rz], 0.035, 12);
    for (var e2 in edges) { var ex = edges[e2]; if (ex < xa - 0.01 || ex > xb + 0.1 || top(ex) < ry + 0.3) continue; ex = Math.min(ex, o.w / 2 - T / 2);
      b.bb('blackMetal', ex - 0.03, ry - 0.03, d - 0.01, ex + 0.03, ry + 0.03, rz); }
    b.sphere('blackMetal', 0.05, xa, ry, rz, 10, 8); b.sphere('blackMetal', 0.05, xb, ry, rz, 10, 8);
    if (o.ladderX != null) {
      var lx = o.ladderX, zf = rz + o.ladderRun, y1 = ry + 0.42, z1 = rz + 0.06 - (0.42 / ry) * o.ladderRun * 0.0, Hh = y1 - 0.14, run = zf - z1, Ll = Math.hypot(Hh, run), th = -Math.asin(run / Ll), lm = o.ladderMat, hw2 = 0.72;
      [-1, 1].forEach(function (s) {
        b.boxR(lm, 0.1, Ll, 0.2, lx + s * hw2, 0.14 + Hh / 2, (zf + z1) / 2, th, 0, 0);
        b.cyl('blackMetal', 0.13, 0.13, 0.07, lx + s * (hw2 + 0.02), 0.13, zf + 0.02, 18, { rz: HALF });
        b.rod('blackMetal', [lx + s * hw2, ry + 0.2, rz + 0.1], [lx + s * hw2, ry + 0.07, rz], 0.03, 8);
        b.sphere('blackMetal', 0.06, lx + s * hw2, ry + 0.06, rz, 10, 8);
      });
      var nr = Math.floor(Hh / 0.95);
      for (i = 1; i <= nr; i++) { var t = (i * 0.95) / Hh; b.box(lm, 2 * hw2 - 0.08, 0.075, 0.34, lx, 0.14 + Hh * t, zf - run * t); }
    }
  }
}, function (o) { return [o.w, o.baseD + (o.ladderX != null ? o.ladderRun + 0.5 : 0.1), o.apex]; },
'Library wall under a vaulted ceiling: painted uprights and butcher-block shelves to the ceiling line, base cabinets, a doorway through the books, rolling ladder on a rail. bays = [[x0, x1, base|seat|door|post]].');

/* ------------------------------------------------------------ kitchen pieces the photos show that FIX lacks */
// island glass-canopy hood (p00 / p01 / p11 / p49): slim square stainless chimney, thin stainless body with LED cans,
// and a wider flat tempered-glass canopy around it. Origin: centre of the back edge of the canopy, bottom at mountY.
// island hood after p00 / p01 / x01 (owner 11/10: 'make the hood realistic'): a sloped stainless body (a shallow frustum, mesh filters and
// two LED lights underneath, a push-button strip on the front slope), a tempered-glass canopy bent into a shallow arch across its width with
// visible green edges, a stainless collar where the chimney passes through, and a two-piece telescoping chimney (the upper cover is a
// touch larger and overlaps the lower one, so a fine shadow line shows at the joint).
def('hoodGlassCanopy', { w: 3, d: 2, mountY: 6.0, toCeiling: 9.6, bodyW: 2.5, bodyD: 1.62, bodyH: 0.2, taper: 0.86, chW: 0.78, chD: 0.62, sag: 0.13, lift: 0.06, glassT: 0.028 }, function (b, o) {
  var zc = o.d / 2, y0 = o.mountY, y1 = y0 + o.bodyH, k = Math.SQRT1_2;
  // body: four flat sloped faces (a 4-sided frustum, flat shaded)
  var fr = new THREE.CylinderGeometry(k * o.taper, k, o.bodyH, 4, 1, false); fr.rotateY(PI / 4); fr.scale(o.bodyW, 1, o.bodyD);
  fr = fr.toNonIndexed(); fr.computeVertexNormals(); b.add('stainless', fr, M(0, y0 + o.bodyH / 2, zc));
  var bw = o.bodyW, bd = o.bodyD;
  b.bb('stainless', -bw / 2 + 0.02, y0 - 0.03, zc - bd / 2 + 0.02, bw / 2 - 0.02, y0, zc + bd / 2 - 0.02);                     // rolled bottom rim
  [-1, 1].forEach(function (s) {                                                                                                // two mesh filters in a stainless frame
    var fx0 = s < 0 ? -bw / 2 + 0.1 : 0.05, fx1 = s < 0 ? -0.05 : bw / 2 - 0.1;
    b.bb('hoodFilter', fx0, y0 - 0.036, zc - bd / 2 + 0.1, fx1, y0 - 0.031, zc + bd / 2 - 0.26);
    b.bb('stainless', (fx0 + fx1) / 2 - 0.12, y0 - 0.045, zc + bd / 2 - 0.33, (fx0 + fx1) / 2 + 0.12, y0 - 0.034, zc + bd / 2 - 0.29);   // filter pull tab
    b.cyl('lightDisk', 0.075, 0.075, 0.012, s * (bw / 2 - 0.34), y0 - 0.036, zc + bd / 2 - 0.15, 22);                          // LED spots near the front
    b.torus('stainless', 0.082, 0.009, s * (bw / 2 - 0.34), y0 - 0.034, zc + bd / 2 - 0.15, 8, 22, { rx: HALF });
  });
  var tilt = Math.atan2(bd / 2 * (1 - o.taper), o.bodyH), zf = zc + bd / 2 - (bd / 2 * (1 - o.taper)) * 0.45, yf = y0 + o.bodyH * 0.45;
  b.boxR('blackMetal', 0.62, 0.075, 0.006, -bw * 0.22, yf, zf + 0.004, -tilt, 0, 0);                                            // control strip
  for (var i = 0; i < 4; i++) b.cyl('chrome', 0.022, 0.022, 0.012, -bw * 0.22 - 0.22 + i * 0.12, yf, zf + 0.01, 14, { rx: HALF - tilt });
  b.boxR('ledBlue', 0.05, 0.022, 0.004, -bw * 0.22 + 0.25, yf, zf + 0.009, -tilt, 0, 0);
  // the glass: an arch across the width (ends lower than the middle), with a hole for the chimney collar
  var hw = o.chW / 2 + 0.07, hd = o.chD / 2 + 0.07, yc = y1 + o.lift, gw = o.w / 2;
  var ya = function (x) { return yc - o.sag * (x / gw) * (x / gw); };
  var xs = [], zs = [0, zc - hd, zc + hd, o.d], N = 28, j;
  for (j = 0; j <= N; j++) xs.push(-gw + 2 * gw * j / N); xs.push(-hw, hw); xs.sort(function (p, q) { return p - q; });
  var pos = [], idx = [], quad = function (a, c, e2, f) { var n = pos.length / 3; pos.push.apply(pos, a.concat(c, e2, f)); idx.push(n, n + 1, n + 2, n, n + 2, n + 3); };
  for (j = 0; j < xs.length - 1; j++) for (var q2 = 0; q2 < 3; q2++) {
    var xa = xs[j], xb = xs[j + 1], za = zs[q2], zb = zs[q2 + 1];
    if (q2 === 1 && xa >= -hw - 1e-6 && xb <= hw + 1e-6) continue;                                                               // the collar hole
    quad([xa, ya(xa), za], [xb, ya(xb), za], [xb, ya(xb), zb], [xa, ya(xa), zb]);
  }
  var gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setIndex(idx); gg.computeVertexNormals();
  b.add('glassCanopy', gg, null, { keepUV: true });   // the page's glass pass (glass20) gives 'glassCanopy' its thick-glass look
  // the green edges a viewer actually sees on tempered glass: thin ribbons around the rim
  var ep = [], ei = [], t = o.glassT, rib = function (pts) {
    for (var r = 0; r < pts.length - 1; r++) { var A = pts[r], B = pts[r + 1], n = ep.length / 3;
      ep.push(A[0], A[1] - t / 2, A[2], B[0], B[1] - t / 2, B[2], B[0], B[1] + t / 2, B[2], A[0], A[1] + t / 2, A[2]); ei.push(n, n + 1, n + 2, n, n + 2, n + 3); } };
  var front = [], back = []; for (j = 0; j <= N; j++){ var xx = -gw + 2 * gw * j / N; front.push([xx, ya(xx), o.d]); back.push([xx, ya(xx), 0]); }
  rib(front); rib(back); rib([[-gw, ya(-gw), 0], [-gw, ya(-gw), o.d]]); rib([[gw, ya(gw), 0], [gw, ya(gw), o.d]]);
  var eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3)); eg.setIndex(ei); eg.computeVertexNormals();
  b.add('glassEdge', eg, null, { keepUV: true });
  // collar that clamps the glass, then the telescoping chimney to the ceiling
  b.rbox('stainless', o.chW + 0.1, 0.1, o.chD + 0.1, 0.012, 0, yc + 0.02, zc, { seg: 2 });
  b.rbox('stainless', o.chW + 0.06, 0.05, o.chD + 0.06, 0.008, 0, yc - 0.06, zc, { seg: 2 });
  var yj = yc + 0.07 + (o.toCeiling - yc) * 0.48;
  b.bb('stainless', -o.chW / 2, y1 - 0.02, zc - o.chD / 2, o.chW / 2, yj + 0.05, zc + o.chD / 2);                                  // lower section
  b.bb('stainless', -o.chW / 2 - 0.018, yj, zc - o.chD / 2 - 0.018, o.chW / 2 + 0.018, o.toCeiling, zc + o.chD / 2 + 0.018);       // upper cover
  b.bb('blackMetal', -o.chW / 2 - 0.004, yj - 0.006, zc - o.chD / 2 - 0.004, o.chW / 2 + 0.004, yj, zc + o.chD / 2 + 0.004);       // shadow line at the joint
  b.bb('stainless', -o.chW / 2 - 0.05, o.toCeiling - 0.04, zc - o.chD / 2 - 0.05, o.chW / 2 + 0.05, o.toCeiling, zc + o.chD / 2 + 0.05);   // ceiling trim
}, function (o) { return [o.w, o.d, o.toCeiling]; }, 'Island hood: sloped stainless body, arched glass canopy with green edges, telescoping chimney (bottom of body = mountY).');
// over-the-counter microwave set into the wall cabinets (p48, r28): a GE unit in a stainless trim kit. Stainless case with softened edges,
// a black-glass door over about three quarters of the face (no bar handle: it is a push-to-open door), a black control panel with a
// small green-white readout and a faint keypad, and the trim kit's vent band below with fine slots.
def('upperMicrowave', { w: 2.5, h: 1.4, d: 1.33, mountY: 4.6, kit: 0.14 }, function (b, o) {
  var w = o.w, k = o.kit, y0 = o.mountY + k, h = o.h - k, y1 = y0 + h, d = o.d, zf = d - 0.02, i;
  b.rbox('stainless', w, h, d - 0.04, 0.03, 0, y0 + h / 2, (d - 0.04) / 2, { seg: 3 });                            // case
  var dw = (w - 0.12) * 0.74, x0 = -w / 2 + 0.06, x1 = x0 + dw;
  b.bb('stainless', x0 - 0.012, y0 + 0.05, zf - 0.012, x1 + 0.012, y1 - 0.05, zf + 0.004);                      // door frame lip
  b.bb('darkGlass', x0, y0 + 0.07, zf, x1, y1 - 0.07, zf + 0.012);                                              // door glass
  b.add('mwDoorFace', new THREE.PlaneGeometry(x1 - x0, h - 0.14), M((x0 + x1) / 2, (y0 + y1) / 2, zf + 0.0125), { keepUV: true });   // window mesh + reflections (r28)
  var cx0 = x1 + 0.05, cx1 = w / 2 - 0.06;
  b.bb('darkGlass', cx0, y0 + 0.07, zf, cx1, y1 - 0.07, zf + 0.01);                                             // control panel
  b.add('mwPanelFace', new THREE.PlaneGeometry(cx1 - cx0, h - 0.14), M((cx0 + cx1) / 2, (y0 + y1) / 2, zf + 0.0105), { keepUV: true });   // readout + touch keys (r28)
  b.bb('stainless', -w / 2, o.mountY, 0.02, w / 2, y0, zf);                                                     // trim kit band
  b.bb('blackMetal', -w / 2 + 0.12, o.mountY + 0.035, zf - 0.006, w / 2 - 0.12, y0 - 0.035, zf + 0.001);         // vent recess
  for (i = 0; i < 34; i++) { var vx = -w / 2 + 0.16 + i * (w - 0.32) / 33; b.bb('stainless', vx - 0.012, o.mountY + 0.04, zf - 0.003, vx + 0.012, y0 - 0.04, zf + 0.003); }   // slots
  b.bb('stainless', -w / 2 + 0.03, o.mountY - 0.002, 0.05, w / 2 - 0.03, o.mountY + 0.004, zf - 0.04);
}, function (o) { return [o.w, o.d, o.mountY + o.h]; }, 'Over-the-counter microwave in a trim kit; bottom of the kit at mountY.');
// open end cubby on a run of wall cabinets (p48: plates on two shelves), no doors
def('upperCubby', { w: 1.1, h: 2.6, d: 13 * IN, mountY: 4.6, shelves: 2, finish: 'cabinetWhite', dishes: true }, function (b, o) {
  var w = o.w, y0 = o.mountY, y1 = y0 + o.h, d = o.d, t = 0.06, fin = o.finish;
  b.bb(fin, -w / 2, y0, 0, -w / 2 + t, y1, d); b.bb(fin, w / 2 - t, y0, 0, w / 2, y1, d);
  b.bb(fin, -w / 2, y0, 0, w / 2, y0 + t, d); b.bb(fin, -w / 2, y1 - t, 0, w / 2, y1, d); b.bb(fin, -w / 2, y0, 0, w / 2, y1, 0.04);
  var n = o.shelves;
  for (var i = 1; i <= n; i++) b.bb(fin, -w / 2 + t, y0 + o.h * i / (n + 1) - 0.05, 0.04, w / 2 - t, y0 + o.h * i / (n + 1), d - 0.02);
  if (o.dishes) for (i = 0; i <= n; i++) {
    var yb = i === 0 ? y0 + t : y0 + o.h * i / (n + 1);
    for (var k = 0; k < 5; k++) b.lathe('porcelain', [[0, 0], [0.25, 0], [0.34, 0.035], [0.32, 0.04], [0.24, 0.01], [0, 0.01]], 18, 0, yb + k * 0.03, d * 0.5);
  }
}, function (o) { return [o.w, o.d, o.mountY + o.h]; }, 'Open end cubby for a run of wall cabinets (shelves, stacked plates).');
MATS.glassCanopy = function () { return std({ color: 0xe8f2ee, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }); };
MATS.mwDoorFace = function () {   // black glass door: a perforated window (dot mesh), a slim frame line and a soft reflection streak
  var W = 512, H = 256, c = canvas(W, H), x = c.getContext('2d'), i, j;
  x.fillStyle = '#0a0b0c'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1b1f22'; x.fillRect(58, 44, W - 116, H - 88);
  x.fillStyle = '#07080a'; for (j = 48; j < H - 46; j += 5) for (i = 62; i < W - 60; i += 5) { x.beginPath(); x.arc(i, j, 1.5, 0, 6.3); x.fill(); }
  x.strokeStyle = 'rgba(140,150,158,.35)'; x.lineWidth = 2; x.strokeRect(56, 42, W - 112, H - 84);
  var g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.35, 'rgba(255,255,255,.07)'); g.addColorStop(.45, 'rgba(255,255,255,.16)'); g.addColorStop(.55, 'rgba(255,255,255,.04)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return std({ color: 0xffffff, map: t, roughness: 0.12, metalness: 0.2 });
};
MATS.mwPanelFace = function () {   // control panel: a lit clock readout, a 4 x 3 touch keypad, start / stop keys and the door button
  var W = 128, H = 256, c = canvas(W, H), x = c.getContext('2d'), i;
  x.fillStyle = '#0b0c0e'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#0f1a16'; x.fillRect(14, 22, W - 28, 30); x.fillStyle = '#a7f0cf'; x.font = 'bold 20px monospace'; x.textAlign = 'center'; x.fillText('12:00', W / 2, 44);
  x.strokeStyle = 'rgba(170,178,186,.55)'; x.lineWidth = 1.5; x.fillStyle = 'rgba(200,206,212,.6)'; x.font = '9px sans-serif';
  var labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'pop', '0', '+30'];
  for (i = 0; i < 12; i++) { var cx = 22 + (i % 3) * 36, cy = 68 + ((i / 3) | 0) * 26; x.strokeRect(cx - 12, cy - 9, 24, 18); x.fillText(labels[i], cx, cy + 3); }
  x.strokeRect(14, 178, 46, 20); x.strokeRect(W - 60, 178, 46, 20); x.fillText('stop', 37, 192); x.fillText('start', W - 37, 192);
  x.fillStyle = 'rgba(120,128,136,.5)'; x.fillRect(22, 214, W - 44, 22); x.fillStyle = '#e8ecef'; x.fillText('door', W / 2, 229);
  var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return std({ color: 0xffffff, map: t, roughness: 0.15, metalness: 0.15, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.18 });
};
MATS.mwWindow = function () { return std({ color: 0x23272a, metalness: 0.2, roughness: 0.08 }); };
MATS.mwDisplay = function () { return std({ color: 0x0d1210, emissive: 0x9ce8c6, emissiveIntensity: 0.35, roughness: 0.3 }); };
MATS.mwKey = function () { return std({ color: 0x2a2d30, metalness: 0.2, roughness: 0.35 }); };
MATS.ledBlue = function () { return std({ color: 0x9fd2ff, emissive: 0x6fb8ff, emissiveIntensity: 1.1, roughness: 0.4 }); };
MATS.hoodFilter = function () {   // aluminium mesh filter: a fine diamond weave, satin grey
  var W = 128, c = canvas(W), x = c.getContext('2d'), i; x.fillStyle = '#9c9fa1'; x.fillRect(0, 0, W, W);
  x.strokeStyle = 'rgba(215,218,220,.55)'; x.lineWidth = 1.2;
  for (i = -W; i < 2 * W; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + W, W); x.stroke(); x.beginPath(); x.moveTo(i, W); x.lineTo(i + W, 0); x.stroke(); }
  var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return std({ color: 0xffffff, map: t, metalness: 0.7, roughness: 0.45 });
};
// satin-nickel hardware for FIX cabinets too (kitchen photos: knobs on doors, bar pulls on drawers, all satin nickel)
FIX.setMaterials({ satinNickel: mat('satinNickel') });
// Cambria Brittanicca quartz (the owner's counters): warm-white ground, bold sweeping taupe-grey veins, polished.
// Seamless 2048^2 tile = 6 ft (texgen/brittanicca.py); UVs are in feet (extrude caps / sides, box UVs, backsplash).
MATS.brittanicca = function () {
  var webp = false; try { webp = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) {}
  var t = new THREE.TextureLoader().load('tex/brittanicca.' + (webp ? 'webp' : 'jpg'));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.repeat.set(1 / 6, 1 / 6);
  return new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.12, metalness: 0, envMapIntensity: 1.0 });
};
FIX.setMaterials({ brittanicca: mat('brittanicca') });

/* ------------------------------------------------------------ kitchen fidelity (v19 round 2) */
// slide-in gas range, 30" (p00 / p11 / p49): no backguard (the counter runs on behind it), front controls with 5 knobs,
// black cooktop with 5 sealed burners (4 + an oval centre burner) under three continuous cast-iron grates, window oven door
// with a bar handle, storage drawer at the toe. Side lips overlap the counter edges.
def('rangeSlideIn30', { w: 2.5, d: 2.08, h: 3.0 }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, ff = d - 0.04, ct = h - 0.02;
  b.bb('stainless', -w / 2, 0.36, 0.02, w / 2, ct - 0.05, ff);                                         // body
  b.bb('castIron', -w / 2 + 0.05, 0, 0.3, w / 2 - 0.05, 0.36, ff - 0.08);                            // toe recess
  b.bb('darkGlass', -w / 2 - 0.04, ct - 0.05, 0.02, w / 2 + 0.04, ct, ff + 0.02, 0.006);              // black cooktop, lips over the counter
  var ky = ct - 0.2;                                                                                  // front control panel (slide-in)
  b.bb('stainless', -w / 2 + 0.01, ct - 0.38, ff - 0.02, w / 2 - 0.01, ct - 0.06, ff + 0.05, 0.01);
  for (var i = 0; i < 5; i++) {
    var kx = -w / 2 + 0.32 + i * (w - 0.64) / 4;
    b.lathe('stainless', [[0, 0], [0.07, 0], [0.072, 0.02], [0.062, 0.03], [0.058, 0.09], [0.05, 0.1], [0, 0.102]], 22, kx, ky, ff + 0.05, { rx: HALF });
    b.box('stainless', 0.02, 0.09, 0.04, kx, ky, ff + 0.17);
  }
  var dy0 = 0.62, dy1 = ct - 0.42;                                                                    // oven door + window + handle
  b.rbox('stainless', w - 0.04, dy1 - dy0, 0.1, 0.025, 0, (dy0 + dy1) / 2, ff + 0.04, { seg: 2 });
  b.rbox('darkGlass', w - 0.7, 0.75, 0.02, 0.04, 0, dy0 + 0.75, ff + 0.095, { seg: 2 });
  var hy = dy1 - 0.15, hz = ff + 0.24;
  b.cyl('stainless', 0.04, 0.04, w - 0.45, 0, hy, hz, 18, { rz: HALF });
  [-1, 1].forEach(function (s) { b.lathe('stainless', [[0, 0], [0.04, 0], [0.032, 0.07], [0.028, 0.16], [0, 0.16]], 14, s * (w / 2 - 0.3), hy, ff + 0.08, { rx: HALF }); });
  b.rbox('stainless', w - 0.04, 0.24, 0.08, 0.02, 0, 0.49, ff + 0.03, { seg: 2 });                    // storage drawer
  b.cyl('stainless', 0.03, 0.03, w - 0.8, 0, 0.5, ff + 0.12, 14, { rz: HALF });
  // burners: 4 round at the corners, 1 oval in the middle
  var bp = [[-w / 2 + 0.55, 0.55, 1], [w / 2 - 0.55, 0.55, 0.85], [-w / 2 + 0.55, d - 0.62, 0.85], [w / 2 - 0.55, d - 0.62, 1], [0, d / 2, 1.1]];
  bp.forEach(function (q, k) {
    var sx = k === 4 ? 1.0 : 1, sz = k === 4 ? 1.45 : 1, r = 0.15 * q[2];
    b.lathe('stainless', [[0, 0], [r, 0], [r * 0.95, 0.02], [0, 0.02]], 24, q[0], ct, q[1], { sx: sx, sz: sz });
    b.lathe('castIron', [[0, 0], [r * 0.72, 0], [r * 0.74, 0.03], [r * 0.6, 0.045], [0, 0.048]], 24, q[0], ct + 0.015, q[1], { sx: sx, sz: sz });
  });
  // three continuous grates (left, centre, right), bars on a 2" grid
  var gy = ct + 0.1, t = 0.04, z0 = 0.2, z1 = d - 0.22, segs = [[-w / 2 + 0.06, -w / 2 + 0.06 + (w - 0.12) * 0.36], [-w / 2 + 0.06 + (w - 0.12) * 0.36, w / 2 - 0.06 - (w - 0.12) * 0.36], [w / 2 - 0.06 - (w - 0.12) * 0.36, w / 2 - 0.06]];
  segs.forEach(function (sg) {
    var x0 = sg[0] + 0.01, x1 = sg[1] - 0.01;
    b.bb('castIron', x0, gy - 0.035, z0, x1, gy, z0 + t); b.bb('castIron', x0, gy - 0.035, z1 - t, x1, gy, z1);
    b.bb('castIron', x0, gy - 0.035, z0, x0 + t, gy, z1); b.bb('castIron', x1 - t, gy - 0.035, z0, x1, gy, z1);
    for (var zz = z0 + 0.22; zz < z1 - 0.15; zz += 0.22) b.bb('castIron', x0, gy - 0.025, zz - 0.015, x1, gy, zz + 0.015);
    for (var xx = x0 + 0.2; xx < x1 - 0.12; xx += 0.2) b.bb('castIron', xx - 0.015, gy - 0.025, z0, xx + 0.015, gy, z1);
    [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(function (p) { b.cyl('rubberBlack', 0.02, 0.02, 0.08, p[0] + (p[0] === x0 ? 0.03 : -0.03), ct + 0.02, p[1] + (p[1] === z0 ? 0.03 : -0.03), 8); });
  });
}, function (o) { return [o.w, o.d + 0.28, o.h + 0.1]; }, '30" slide-in gas range: 5 burners, continuous grates, front controls, no backguard.');

// finished back / end panel of a cabinet run (p01: the peninsula's room side under the seating overhang is white panelling)
// r44: stacked ledgestone cladding for a chimney breast (origin at the wall, the breast w wide and d deep, faces +z). Courses of
// split stone in four tones, each stone a little proud of the last; the top follows a gable (apex at x = 0, falling at `pitch`) when
// apex > 0. hole = [x0, y0, x1, y1] is left open for the firebox.
def('ledgestone', { w: 7, d: 1.25, h: 12, apex: 0, pitch: 0, course: 0.3, t: 0.16, seed: 11, hole: null }, function (b, o, R) {
  var W = o.w / 2, d = o.d, t = o.t, tones = ['ledgeA', 'ledgeB', 'ledgeC', 'ledgeA', 'ledgeD', 'ledgeC'], H = o.hole;
  var topAt = function (x) { return o.apex > 0 ? o.apex - o.pitch * Math.abs(x) : o.h; };
  var hMax = o.apex > 0 ? o.apex : o.h, g = 0.012;
  for (var y = 0, k = 0; y < hMax - 0.06; k++) {
    var ch = o.course * (0.8 + R() * 0.45), y1 = Math.min(y + ch, hMax);
    // the front: stones along x, clipped to the gable and split round the firebox
    for (var x = -W - R() * 0.9; x < W;) {
      var L = 0.7 + R() * 1.3, a = Math.max(-W, x), e = Math.min(W, x + L), pr = R() * 0.06, m = tones[(R() * tones.length) | 0]; x += L;
      var segs = [[a, e]];
      if (H && y1 > H[1] && y < H[3]) { segs = []; if (a < H[0]) segs.push([a, Math.min(e, H[0])]); if (e > H[2]) segs.push([Math.max(a, H[2]), e]); }
      for (var i = 0; i < segs.length; i++) {
        var s0 = segs[i][0], s1 = segs[i][1], yt = Math.min(y1, topAt(s0), topAt(s1), topAt((s0 + s1) / 2));
        if (s1 - s0 < 0.12 || yt - y < 0.08) continue;
        b.bb(m, s0 + g, y + g, d - t, s1 - g, yt - g, d + pr, 0.012);
      }
    }
    // the two returns: one or two stones along the depth
    for (var sd = -1; sd <= 1; sd += 2) {
      var yt2 = Math.min(y1, topAt(W)); if (yt2 - y < 0.08) continue;
      var cut = R() < 0.5 ? 0 : 0.35 + R() * (d - 0.7);
      var zs = cut ? [[0, cut], [cut, d + 0.02]] : [[0, d + 0.02]];
      for (var j = 0; j < zs.length; j++) { var p2 = R() * 0.05, mm = tones[(R() * tones.length) | 0];
        b.bb(mm, sd > 0 ? W - t : -W - p2, y + g, zs[j][0] + g, sd > 0 ? W + p2 : -W + t, yt2 - g, zs[j][1] - g, 0.012); }
    }
    y = y1;
  }
}, function (o) { return [o.w, o.d + 0.1, o.apex > 0 ? o.apex : o.h]; }, 'Stacked ledgestone cladding for a chimney breast; top follows a gable when apex/pitch are given; hole leaves the firebox open.');

// r44: a low built-in under a window: raised-panel doors on a plinth, a wood top (origin at the wall, faces +z)
def('lowBuiltin', { w: 8, d: 1.33, h: 2.5, finish: 'cabinetWhite', top: 'maple', kick: 4 * IN }, function (b, o) {
  var w = o.w, d = o.d, fin = o.finish, tt = 0.125, n = Math.max(2, Math.round(w / 1.7)), ch = o.h - tt, dw = (w - 0.1) / n;
  b.bb(fin, -w / 2, o.kick, 0, w / 2, ch, d - DOORT); b.bb(fin, -w / 2 + 0.02, 0, 0, w / 2 - 0.02, o.kick, d - DOORT - 0.2);
  for (var i = 0; i < n; i++) raisedDoor(b, fin, dw - 0.03, ch - o.kick - 0.08, -w / 2 + 0.05 + dw * (i + 0.5), (ch + o.kick) / 2, d - DOORT * 0.4);
  b.rbox(o.top, w + 0.04, tt, d + 0.1, 0.01, 0, ch + tt / 2, (d + 0.1) / 2, { boxUV: true });
}, function (o) { return [o.w, o.d + 0.1, o.h]; }, 'Low built-in cabinet with a wood top, for under a window.');

// r44: one continuous crown along the top of a run of tall cabinets (origin at the wall, the run w long and d deep, faces +z)
def('cabinetCrown', { w: 8, d: 2.08, mountY: 8, finish: 'cabinetWhite', endL: true, endR: true }, function (b, o) {
  var w = o.w, d = o.d, y = o.mountY, fin = o.finish, l = o.endL ? 1 : 0, r = o.endR ? 1 : 0;
  b.bb(fin, -w / 2 - 0.04 * l, y, 0, w / 2 + 0.04 * r, y + 0.08, d + 0.04, 0.005);
  b.bb(fin, -w / 2 - 0.1 * l, y + 0.08, 0, w / 2 + 0.1 * r, y + 0.3, d + 0.1, 0.01);
  b.bb(fin, -w / 2 - 0.13 * l, y + 0.3, 0, w / 2 + 0.13 * r, y + 0.36, d + 0.13, 0.008);
}, function (o) { return [o.w + 0.26, o.d + 0.13, o.mountY + 0.36]; }, 'Continuous crown for the top of a tall cabinet run.');

// r44: a tall oven column for a cabinet wall: drawer, a 27-in wall oven, a built-in microwave over it, a cabinet above (origin at the wall, faces +z)
def('wallOvenStack', { w: 2.5, h: 8, d: 2.08, finish: 'cabinetWhite', kick: 4 * IN }, function (b, o) {
  var w = o.w, d = o.d, fin = o.finish, zf = d, aw = Math.min(w - 0.26, 2.25), x0 = -aw / 2, x1 = aw / 2;
  b.bb(fin, -w / 2, o.kick, 0, w / 2, o.h, d); b.bb(fin, -w / 2 + 0.02, 0, 0, w / 2 - 0.02, o.kick, d - 0.25);            // carcass, toe kick
  raisedDoor(b, fin, w - 0.14, 1.5, 0, o.kick + 0.85, zf + DOORT * 0.6);                                                  // drawer front
  b.bb('stainless', -0.5, o.kick + 1.36, zf + DOORT, 0.5, o.kick + 1.41, zf + DOORT + 0.09);
  function oven(y0, y1, band) {
    b.bb('stainless', x0, y0, zf - 0.02, x1, y1, zf + 0.05);                                                             // face
    b.bb('darkGlass', x0 + 0.1, y0 + 0.14, zf + 0.05, x1 - 0.1, y1 - band - 0.08, zf + 0.058);                            // door glass
    b.bb('darkGlass', x0 + 0.1, y1 - band, zf + 0.05, x1 - 0.1, y1 - 0.06, zf + 0.056);                                   // control band
    b.bb('stainless', x0 + 0.14, y1 - band - 0.2, zf + 0.12, x1 - 0.14, y1 - band - 0.15, zf + 0.17);                     // handle bar
    b.bb('stainless', x0 + 0.2, y1 - band - 0.2, zf + 0.05, x0 + 0.25, y1 - band - 0.15, zf + 0.14); b.bb('stainless', x1 - 0.25, y1 - band - 0.2, zf + 0.05, x1 - 0.2, y1 - band - 0.15, zf + 0.14);
  }
  oven(2.3, 4.7, 0.36); oven(4.85, 6.2, 0.3);                                                                             // wall oven, microwave
  var uh = o.h - 6.45, dw = (w - 0.14) / 2;
  if (uh > 0.6) for (var i = 0; i < 2; i++) raisedDoor(b, fin, dw - 0.03, uh - 0.12, (i ? 1 : -1) * dw / 2, 6.38 + uh / 2, zf + DOORT * 0.6);
}, function (o) { return [o.w, o.d + 0.2, o.h]; }, 'Tall oven column: drawer, wall oven, built-in microwave, cabinet above; origin at the wall back, faces +z.');

def('finishedPanel', { w: 5, h: 2.896, t: 0.06, panels: 0, kick: 4 * IN, finish: 'cabinetWhite' }, function (b, o) {
  var w = o.w, t = o.t, n = o.panels || Math.max(1, Math.round(w / 1.6)), fin = o.finish;
  b.bb(fin, -w / 2, 0, 0, w / 2, o.h, t);
  b.bb(fin, -w / 2, 0, t, w / 2, o.kick, t + 0.05, 0.006);                                            // base moulding
  var pw = (w - 0.1) / n, y0 = o.kick + 0.2, y1 = o.h - 0.25;
  for (var i = 0; i < n; i++) { var cx = -w / 2 + 0.05 + pw * (i + 0.5); raisedDoor(b, fin, pw - 0.18, y1 - y0, cx, (y0 + y1) / 2, t + DOORT * 0.6); }
}, function (o) { return [o.w, o.t + 0.06, o.h]; }, 'Finished panelled back for a cabinet run (raised panels + base moulding); origin at the panel back, faces +z.');

// counter stool, woven rope (p01 / p11 / p49): grey rope lattice shell (back + arms) on a weathered-oak frame with stretchers,
// grey seat cushion. Loose furniture (category furniture): it follows the furniture switch and can be moved in Design.
function ropeTex() {
  if (TX.rope) return TX.rope;
  var W = 256, c = canvas(W), x = c.getContext('2d'), i, j, cell = 22;
  x.clearRect(0, 0, W, W);
  for (j = 0; j < W / cell; j++) for (i = 0; i < W / cell; i++) {   // diamond lattice of twisted cord
    var cx = i * cell + (j % 2) * cell / 2, cy = j * cell;
    x.strokeStyle = 'rgba(120,116,110,1)'; x.lineWidth = 9; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx - cell / 2, cy); x.lineTo(cx, cy + cell / 2); x.lineTo(cx + cell / 2, cy); x.stroke();
    x.strokeStyle = 'rgba(196,190,180,1)'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(cx - cell / 2, cy); x.lineTo(cx, cy + cell / 2); x.lineTo(cx + cell / 2, cy); x.stroke();
  }
  var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.repeat.set(9, 3); t.anisotropy = 4;
  return (TX.rope = t);
}
MATS.ropeWeave = function () { return std({ color: 0xffffff, map: ropeTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }); };
MATS.oakWeathered = function () { return std({ color: 0xa69276, roughness: 0.85, metalness: 0 }); };
MATS.cushionGrey = function () { return std({ color: 0x8e8a84, roughness: 0.95, metalness: 0 }); };
def('counterStoolRope', { seatH: 2.17, w: 1.75, d: 1.65, backH: 3.05 }, function (b, o) {
  var w = o.w, d = o.d, sH = o.seatH, cz = d / 2, r = Math.min(w, d) / 2 - 0.02, leg = 0.1;
  // legs (slightly splayed) + stretchers (footrest at ~10")
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
    b.rod('oakWeathered', [q[0] * (w / 2 - 0.12), 0, cz + q[1] * (d / 2 - 0.12)], [q[0] * (w / 2 - 0.25), sH - 0.15, cz + q[1] * (d / 2 - 0.25)], leg / 2 + 0.01, 8);
  });
  [0.85, 1.25].forEach(function (yy, k) {
    var ix = w / 2 - 0.16 - yy * 0.06, iz = d / 2 - 0.16 - yy * 0.06;
    b.bb('oakWeathered', -ix, yy - 0.04, cz + iz - 0.035, ix, yy + 0.04, cz + iz + 0.035);
    b.bb('oakWeathered', -ix, yy - 0.04, cz - iz - 0.035, ix, yy + 0.04, cz - iz + 0.035);
    if (k === 0) [-1, 1].forEach(function (s) { b.bb('oakWeathered', s * ix - 0.035, yy - 0.04, cz - iz, s * ix + 0.035, yy + 0.04, cz + iz); });
  });
  b.bb('oakWeathered', -w / 2 + 0.16, sH - 0.2, cz - d / 2 + 0.16, w / 2 - 0.16, sH - 0.1, cz + d / 2 - 0.16, 0.02);     // seat apron
  // rope shell: a surface of revolution round the back, arms stepping down toward the front
  var L = 4.2, top = o.backH;
  b.lathe('ropeWeave', [[r * 0.92, sH - 0.12], [r, sH + 0.25], [r * 1.04, (sH + top) / 2], [r * 1.07, top]], 36, 0, 0, cz, {
    phiStart: PI - L / 2, phiLength: L,
    deform: function (g) { var p = g.attributes.position; for (var i = 0; i < p.count; i++) { var X = p.getX(i), Z = p.getZ(i), Y = p.getY(i), ph = Math.atan2(X, Z);
      var f = Math.abs(Math.abs(ph) - PI) / (L / 2); var k = 1 - 0.55 * Math.pow(Math.min(1, f), 1.6); if (Y > sH) p.setY(i, sH + (Y - sH) * k); } p.needsUpdate = true; g.computeVertexNormals(); } });
  b.cyl('cushionGrey', r * 0.95, r * 0.95, 0.16, 0, sH + 0.0, cz, 28);                          // seat cushion
  b.rbox('cushionGrey', w * 0.55, 0.5, 0.12, 0.05, 0, sH + 0.5, cz - r * 0.8);                 // lumbar cushion
}, function (o) { return [o.w, o.d, o.backH]; }, 'Counter stool: woven rope shell, oak frame, grey cushion; origin at the back edge.', 'furniture');

// FIX cabinets, two photo-driven options without touching fixtures.js:
//  style:'raised' - raised / beaded panel fronts: FIX builds its shaker fronts, and while it does, the shaker field (the
//    0.45"-thick recessed panel box every shaker door / drawer gets) is replaced by a recessed ground, a bead and a raised field.
//  led:true (upperCabinet) - an LED strip under the front edge (emissive) + a dim point light the page turns on at dusk.
var IN45 = (0.75 - 0.3) * IN, fixMake = FIX.make;
function raisedField(b, mat, w, h, x, y, zPanelCentre) {
  var t = DOORT, zf = zPanelCentre - IN45 / 2 + t, bead = 0.45 * IN;
  b.box(mat, w, h, t * 0.45, x, y, zf - t + t * 0.225);
  [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (s) {
    if (s[0]) b.box(mat, bead, h - 0.004, t * 0.32, x + s[0] * (w / 2 - bead / 2), y, zf - t * 0.55 + t * 0.16);
    else b.box(mat, w - 0.004, bead, t * 0.32, x, y + s[1] * (h / 2 - bead / 2), zf - t * 0.55 + t * 0.16);
  });
  if (w > 0.12 && h > 0.12) b.box(mat, w - 2 * bead - 0.03, h - 2 * bead - 0.03, t * 0.7, x, y, zf - t + t * 0.35);
}
FIX.make = function (kind, o) {
  var raised = o && o.style === 'raised', g;
  if (!raised) g = fixMake(kind, o);
  else {
    var BP = H.Builder.prototype, box0 = BP.box, oo = {}, k;
    for (k in o) oo[k] = o[k]; oo.style = 'shaker';
    var hook = function (mat, w, h, d, x, y, z, ry, opt2) {
      if (!ry && !opt2 && Math.abs(d - IN45) < 1e-6 && w > 0.08 && h > 0.08) { BP.box = box0; try { raisedField(this, mat, w, h, x, y, z); } finally { BP.box = hook; } return null; }
      return box0.apply(this, arguments);
    };
    BP.box = hook;
    try { g = fixMake(kind, oo); } finally { BP.box = box0; }
    g.userData.opts.style = 'raised';
  }
  if (kind === 'upperCabinet' && o && o.led) {
    var w = o.w || 3, y0 = (o.mountY || 4.5), dd = (o.d || 13 * IN);
    var strip = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.012, 0.06), mat('ledStrip'));
    strip.position.set(0, y0 - 0.008, dd - 0.16); strip.castShadow = false; strip.name = 'ledStrip'; g.add(strip);
    if (w >= 1.8) { var L2 = new THREE.PointLight(0xfff0d8, 0, 5.5, 2); L2.position.set(0, y0 - 0.25, dd - 0.1); L2.userData.underCab = true; g.add(L2); }
  }
  return g;
};
BUILTIN.ledMaterial = function () { return mat('ledStrip'); };

/* ================================================================== API */
function useMats(b) { for (var k in MATS) b.useMaterial(k, mat(k)); }
BUILTIN.make = function (kind, o) {
  var K = KINDS[kind];
  if (!K) throw new Error('BUILTIN.make: unknown kind "' + kind + '"');
  var oo = opt(K.defaults, o), R = rng(oo.seed || 1), books = [];
  var b = new Builder(); useMats(b);
  var deco = new Builder(); useMats(deco);
  K.build(b, oo, R, books, deco);
  var g = b.build(kind);
  g.userData = { kind: kind, category: K.category, opts: oo, size: K.size(oo) };
  if (books.length || deco.order.length) {
    var c = deco.order.length ? deco.build(kind + ':decor') : new THREE.Group();
    c.children.forEach(function (m) { m.castShadow = false; });
    if (books.length) c.add(bookMeshes(books));
    c.name = 'contents'; c.userData = { contents: true, books: books.length };
    g.add(c);
  }
  return g;
};
BUILTIN.has = function (kind) { return !!KINDS[kind]; };
BUILTIN.sizeOf = function (kind, o) { var K = KINDS[kind]; return K.size(opt(K.defaults, o)); };
BUILTIN.kinds = ORDER.map(function (k) { var K = KINDS[k]; return { kind: k, category: K.category, defaults: K.defaults, size: K.size(opt(K.defaults, {})), note: K.note }; });
BUILTIN.fillStats = function (g) { var c = g.children.find(function (x) { return x.userData && x.userData.contents; }); return c ? { books: c.userData.books } : { books: 0 }; };
global.BUILTIN = BUILTIN;
})(typeof window !== 'undefined' ? window : this);
