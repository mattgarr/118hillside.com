/*!
 * STAGING33 — the 10/31/2026 re-staging of 118 Hillside (owner photos IMG_0465-0611), for the walkthrough (three.js r128).
 * Loaded after staging.js. Two parts:
 *  1. Library: new staged pieces and new styles of existing kinds, added by wrapping STAGE.make (fixtures.js / staging.js are not
 *     edited). A new STYLE of an existing kind keeps its kind name (sofa3 style 'curve' is still a sofa3), so everything that reads
 *     userData.kind (Furniture registry names, Halloween swaps, games, checks) keeps working. Same conventions as FIX / STAGE: feet,
 *     origin = centre of the piece's back edge on the floor, front +z, wall pieces take mountY. Materials are made on first use.
 *  2. STAGING33.rows(h): the staging table (same row format as the page's STAGING), room by room against the 10/31 photos.
 *     h = page helpers {p23At, p23Yaw, LOUNGE_SPEC}. Nothing is built at load: the page builds one staging when it needs it.
 */
(function (global) {
'use strict';
var THREE = global.THREE, FIX = global.FIX, STAGE = global.STAGE;
if (!THREE || !FIX || !FIX.helpers || !STAGE) { if (global.console) console.warn('STAGING33: needs three.js, fixtures.js and staging.js'); return; }
var H = FIX.helpers, Builder = H.Builder, M = H.M, PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
function opt(d, o) { var r = {}, k; for (k in d) r[k] = d[k]; if (o) for (k in o) if (o[k] !== undefined) r[k] = o[k]; return r; }
function rng(seed) { var s = (seed >>> 0) || 0x9e3779b9; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function lin(c) { return new THREE.Color(c).convertSRGBToLinear(); }
function std(p) { if (p.color !== undefined) p.color = lin(p.color); var m = new THREE.MeshStandardMaterial(p); if (m.metalness < 0.5) m.envMapIntensity = 0.55; return m; }
function cv(w, h, fn) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; fn(c.getContext('2d'), w, h || w); return c; }
function tx(c, rep, linear) { var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (!linear) t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; if (rep) t.repeat.set(rep[0], rep[1]); return t; }
function speck(x, W, Hh, n, R, cols, r0, r1) { for (var i = 0; i < n; i++) { x.fillStyle = cols[(R() * cols.length) | 0]; x.beginPath(); x.arc(R() * W, R() * Hh, r0 + R() * (r1 - r0), 0, TAU); x.fill(); } }

/* ------------------------------------------------------------ textures */
var TX = {};
function T(name) {
  if (TX[name]) return TX[name];
  var R;
  switch (name) {
    case 'boucleBump': R = rng(3); TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#808080'; x.fillRect(0, 0, W, W);   // bouclé: tight random loops
      for (var i = 0; i < 2600; i++) { var px = R() * W, py = R() * W, r = 1.6 + R() * 2.4; var g = x.createRadialGradient(px, py, 0.3, px, py, r); g.addColorStop(0, '#f2f2f2'); g.addColorStop(1, 'rgba(60,60,60,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill(); } }), [3, 3], true); break;
    case 'grain': R = rng(5); TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#808080'; x.fillRect(0, 0, W, W);
      for (var i = 0; i < 160; i++) { x.fillStyle = R() < 0.5 ? 'rgba(40,40,40,' + (0.05 + R() * 0.12) + ')' : 'rgba(230,230,230,' + (0.05 + R() * 0.12) + ')'; x.fillRect(0, R() * W, W, 0.6 + R() * 2.2); } }), [1, 1], true); break;
    case 'greyWash': R = rng(7); TX[name] = tx(cv(512, 128, function (x, W, Hh) { x.fillStyle = '#a7a199'; x.fillRect(0, 0, W, Hh);   // grey-washed oak (dining, p498/516)
      for (var i = 0; i < 220; i++) { x.fillStyle = R() < 0.5 ? 'rgba(110,104,96,' + (0.08 + R() * 0.18) + ')' : 'rgba(205,200,192,' + (0.08 + R() * 0.2) + ')'; x.fillRect(0, R() * Hh, W, 0.5 + R() * 1.8); } }), [1, 1]); break;
    case 'reclaimed': R = rng(9); TX[name] = tx(cv(512, 256, function (x, W, Hh) { var cols = ['#8d6a4a', '#a07a55', '#7d5c40', '#ad8a62', '#94704e'];   // reclaimed plank bench (p529)
      for (var j = 0; j < 4; j++) { x.fillStyle = cols[(R() * cols.length) | 0]; x.fillRect(0, j * Hh / 4, W, Hh / 4); for (var i = 0; i < 60; i++) { x.fillStyle = 'rgba(30,20,10,' + (0.08 + R() * 0.15) + ')'; x.fillRect(R() * W, j * Hh / 4 + R() * Hh / 4, 20 + R() * 120, 0.8 + R()); } x.fillStyle = 'rgba(20,12,6,.6)'; x.fillRect(0, j * Hh / 4, W, 2); } }), [1, 1]); break;
    case 'chevronWood': R = rng(11); TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#9c7a52'; x.fillRect(0, 0, W, W);   // primary dresser: chevron-laid reclaimed strips (p586)
      for (var j = 0; j < 8; j++) for (var i = 0; i < 4; i++) { var v = 0.78 + R() * 0.35; x.fillStyle = 'rgb(' + (160 * v | 0) + ',' + (124 * v | 0) + ',' + (82 * v | 0) + ')'; var cx = i * 64 + 32, cy = j * 32;
        x.beginPath(); x.moveTo(cx - 32, cy); x.lineTo(cx, cy + 16); x.lineTo(cx + 32, cy); x.lineTo(cx + 32, cy + 28); x.lineTo(cx, cy + 44); x.lineTo(cx - 32, cy + 28); x.closePath(); x.fill(); x.strokeStyle = 'rgba(50,34,18,.55)'; x.lineWidth = 1.4; x.stroke(); } }), [1, 1]); break;
    case 'jute': R = rng(13); TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#8a7350'; x.fillRect(0, 0, W, W);   // chunky braided jute (poufs, office + Evie rugs)
      for (var j = 0; j < 16; j++) for (var i = 0; i < 16; i++) { var v = 0.82 + R() * 0.3; x.fillStyle = 'rgb(' + (190 * v | 0) + ',' + (160 * v | 0) + ',' + (112 * v | 0) + ')'; x.beginPath(); x.ellipse(i * 16 + 8, j * 16 + 8, 7.5, 5.5, ((i + j) % 2 ? 0.7 : -0.7), 0, TAU); x.fill(); x.strokeStyle = 'rgba(80,60,30,.5)'; x.lineWidth = 1; x.stroke(); } }), [1, 1]); break;
    case 'seagrassMat': R = rng(15); TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#7c6a4c'; x.fillRect(0, 0, W, W);   // seagrass basketweave (great room rug p495)
      for (var j = 0; j < 16; j++) for (var i = 0; i < 16; i++) { var hz = (i + j) % 2, v = 0.85 + R() * 0.22; for (var k = 0; k < 3; k++) { x.fillStyle = 'rgb(' + (158 * v | 0) + ',' + (140 * v | 0) + ',' + (104 * v | 0) + ')';
        if (hz) x.fillRect(i * 16 + 1, j * 16 + 1 + k * 5, 14, 4); else x.fillRect(i * 16 + 1 + k * 5, j * 16 + 1, 4, 14); } } }), [1, 1]); break;
    case 'knitDark': R = rng(17); TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#3c3c3c'; x.fillRect(0, 0, W, W);   // chunky knit, charcoal (Josie poufs p548)
      for (var j = 0; j < 10; j++) for (var i = 0; i < 10; i++) { var cx = i * 25.6 + (j % 2) * 12.8 + 12, cy = j * 25.6 + 12; var g = x.createRadialGradient(cx, cy, 1, cx, cy, 13); g.addColorStop(0, '#6a6a6a'); g.addColorStop(1, '#262626'); x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, 12, 10, 0.5, 0, TAU); x.fill(); } }), [2, 2]); break;
    case 'geoBW': TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#efe9df'; x.fillRect(0, 0, W, W); x.strokeStyle = '#151515'; x.lineWidth = 14; x.lineCap = 'square';   // lounge cube poufs: bold black lattice on cream (p538)
      for (var k = 0; k < 2; k++) { var o = k * 128; x.beginPath(); x.moveTo(o + 20, 20); x.lineTo(o + 64, 64); x.lineTo(o + 108, 20); x.moveTo(o + 20, 108); x.lineTo(o + 64, 64); x.lineTo(o + 108, 108); x.moveTo(o + 64, 20); x.lineTo(o + 64, 0); x.stroke();
        x.beginPath(); x.moveTo(o + 20, 148); x.lineTo(o + 64, 192); x.lineTo(o + 108, 148); x.moveTo(o + 20, 236); x.lineTo(o + 64, 192); x.lineTo(o + 108, 236); x.stroke(); } }), [1, 1]); break;
    case 'mudcloth': TX[name] = tx(cv(128, 128, function (x, W) { x.fillStyle = '#ece6da'; x.fillRect(0, 0, W, W); x.fillStyle = '#1e1c1a';   // front-living pillows: rows of black triangles (p506)
      for (var j = 0; j < 4; j++) for (var i = 0; i < 4; i++) { var cx = i * 32 + (j % 2) * 16 + 8, cy = j * 32 + 8; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + 16, cy); x.lineTo(cx + 8, cy + 14); x.closePath(); x.fill(); } }), [1.6, 1.6]); break;
    case 'stripeBW': TX[name] = tx(cv(128, 128, function (x, W) { x.fillStyle = '#f1efea'; x.fillRect(0, 0, W, W); x.fillStyle = '#1a1a1a'; x.fillRect(0, 54, W, 20); }), [1, 1]); break;   // white pillow, black band (p495)
    case 'duvetStripe': TX[name] = tx(cv(128, 128, function (x, W) { x.fillStyle = '#f2f1ee'; x.fillRect(0, 0, W, W); x.fillStyle = '#7d8086'; for (var i = 0; i < 4; i++) x.fillRect(0, i * 32 + 4, W, 13); }), [1, 1.25]); break;   // Josie duvet (p548). r38: 1.25 tiles per ft (was 3: 1-inch stripes shimmered into moire from the door)
    case 'blueDot': R = rng(19); TX[name] = tx(cv(128, 128, function (x, W) { x.fillStyle = '#eef0f2'; x.fillRect(0, 0, W, W); x.fillStyle = '#4f6684';   // Evie coverlet: small blue-grey block print (p561)
      for (var j = 0; j < 8; j++) for (var i = 0; i < 8; i++) { x.beginPath(); x.ellipse(i * 16 + (j % 2) * 8 + 4, j * 16 + 6, 4.6, 3.2, 0.6, 0, TAU); x.fill(); } }), [1.5, 1.5]); break;
    case 'creamGeo': R = rng(21); TX[name] = tx(cv(256, 128, function (x, W, Hh) { x.fillStyle = '#efe8da'; x.fillRect(0, 0, W, Hh);   // front-bedroom quilt: tan / cream geometric patchwork (p508)
      for (var i = 0; i < 70; i++) { x.fillStyle = ['#c9ad86', '#dcc7a6', '#b8976b', '#f6f1e6'][(R() * 4) | 0]; x.beginPath(); var px = R() * W, py = R() * Hh, s = 6 + R() * 12; x.moveTo(px, py); x.lineTo(px + s, py + s * 0.4); x.lineTo(px + s * 0.3, py + s); x.closePath(); x.fill(); } }), [2, 1]); break;
    case 'plaidBeige': TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#e4dccd'; x.fillRect(0, 0, W, W); x.fillStyle = 'rgba(150,132,104,.45)';   // primary rug: soft beige windowpane plaid (p585)
      for (var i = 0; i < 4; i++) { x.fillRect(i * 64 + 20, 0, 5, W); x.fillRect(i * 64 + 30, 0, 2, W); x.fillRect(0, i * 64 + 20, W, 5); x.fillRect(0, i * 64 + 30, W, 2); } }), [3, 3]); break;
    case 'herringGrey': TX[name] = tx(cv(128, 128, function (x, W) { x.fillStyle = '#b7b4ae'; x.fillRect(0, 0, W, W); x.strokeStyle = '#8f8b85'; x.lineWidth = 3;   // front-bedroom flat weave (p508)
      for (var j = 0; j < 8; j++) for (var i = 0; i < 8; i++) { x.beginPath(); x.moveTo(i * 16, j * 16 + 8); x.lineTo(i * 16 + 8, j * 16 + (i % 2 ? 0 : 16)); x.stroke(); } }), [6, 6]); break;
    case 'diamondGrey': TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#a9a7a1'; x.fillRect(0, 0, W, W); x.strokeStyle = 'rgba(228,224,216,.85)'; x.lineWidth = 2.2;   // front-living rug: soft grey, thin ivory diamond lines (p515)
      x.beginPath(); for (var i = -2; i < 4; i++) { x.moveTo(i * 128, 0); x.lineTo(i * 128 + 256, 256); x.moveTo(i * 128 + 256, 0); x.lineTo(i * 128, 256); } x.stroke(); }), [2, 2]); break;
    case 'greyWool': R = rng(23); TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#b1b0ab'; x.fillRect(0, 0, W, W); speck(x, W, W, 2600, R, ['rgba(255,255,255,.12)', 'rgba(60,60,60,.10)'], 0.6, 1.8); }), [2, 2]); break;
    case 'greyLowPile': R = rng(27); TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#bab8b2'; x.fillRect(0, 0, W, W);   // lounge: light grey low-pile area rug, soft cloudy abrash (p538/539)
      for (var i = 0; i < 70; i++) { var px = R() * W, py = R() * W, r = 14 + R() * 34, g = x.createRadialGradient(px, py, 0, px, py, r), a = 0.05 + R() * 0.07; g.addColorStop(0, R() < 0.5 ? 'rgba(150,148,143,' + a + ')' : 'rgba(222,220,214,' + a + ')'); g.addColorStop(1, 'rgba(180,178,172,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r); }
      speck(x, W, W, 1800, R, ['rgba(255,255,255,.08)', 'rgba(70,70,70,.07)'], 0.5, 1.4); }), [1, 1]); break;
    case 'woven': R = rng(25); TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#8c8578'; x.fillRect(0, 0, W, W);   // loft bench: woven flat leather straps (p574)
      for (var j = 0; j < 8; j++) for (var i = 0; i < 8; i++) { x.fillStyle = (i + j) % 2 ? '#bdb5a6' : '#a59d8e'; x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); } }), [3, 1]); break;
    case 'concrete': R = rng(27); TX[name] = tx(cv(256, 256, function (x, W) { x.fillStyle = '#9d9a94'; x.fillRect(0, 0, W, W); speck(x, W, W, 1800, R, ['rgba(255,255,255,.10)', 'rgba(40,40,40,.10)', 'rgba(120,115,105,.2)'], 0.5, 2.6); }), [1, 1]); break;
    case 'moss': R = rng(29); TX[name] = tx(cv(128, 128, function (x, W) { x.fillStyle = '#3f5a23'; x.fillRect(0, 0, W, W); speck(x, W, W, 1600, R, ['#5f7f2f', '#2c4318', '#79963c', '#4b6b28'], 0.8, 2.4); }), [1, 1]); break;
    case 'popcorn': R = rng(31); TX[name] = tx(cv(64, 64, function (x, W) { x.fillStyle = '#f2ead5'; x.fillRect(0, 0, W, W); speck(x, W, W, 240, R, ['#fffaf0', '#e2cfa0', '#f8f0dc'], 1, 3); }), [1, 1]); break;
  }
  return TX[name];
}

/* ------------------------------------------------------------ materials (lazy, resolvable by name through FIX.mat) */
var MD = {
  boucleCream: function () { return std({ color: 0xe8e3d8, roughness: 1, bumpMap: T('boucleBump'), bumpScale: 0.006 }); },
  plasterCream: function () { return std({ color: 0xe2dacb, roughness: 0.92, bumpMap: T('grain'), bumpScale: 0.0012 }); },
  paintWhite33: function () { return std({ color: 0xefede8, roughness: 0.7 }); },
  blackMatte33: function () { return std({ color: 0x1b1b1b, roughness: 0.55 }); },
  greyWash33: function () { return std({ color: 0xffffff, map: T('greyWash'), roughness: 0.78 }); },
  oakDrum33: function () { var t = T('greyWash'); return std({ color: 0xc8ab83, roughness: 0.75, bumpMap: T('grain'), bumpScale: 0.002 }); },
  reclaimed33: function () { return std({ color: 0xffffff, map: T('reclaimed'), roughness: 0.85 }); },
  chevronWood33: function () { return std({ color: 0xffffff, map: T('chevronWood'), roughness: 0.8 }); },
  jute33: function () { return std({ color: 0xffffff, map: T('jute'), roughness: 1 }); },
  seagrass33: function () { return std({ color: 0xffffff, map: T('seagrassMat'), roughness: 1 }); },
  knitDark33: function () { return std({ color: 0xffffff, map: T('knitDark'), roughness: 1 }); },
  geoBW33: function () { return std({ color: 0xffffff, map: T('geoBW'), roughness: 0.95 }); },
  mudcloth33: function () { return std({ color: 0xffffff, map: T('mudcloth'), roughness: 0.95 }); },
  stripeBW33: function () { return std({ color: 0xffffff, map: T('stripeBW'), roughness: 0.95 }); },
  duvetStripe33: function () { return std({ color: 0xffffff, map: T('duvetStripe'), roughness: 0.95 }); },
  blueDot33: function () { return std({ color: 0xffffff, map: T('blueDot'), roughness: 0.95 }); },
  creamGeo33: function () { return std({ color: 0xffffff, map: T('creamGeo'), roughness: 0.95 }); },
  woven33: function () { return std({ color: 0xffffff, map: T('woven'), roughness: 0.8 }); },
  concrete33: function () { return std({ color: 0xffffff, map: T('concrete'), roughness: 0.95 }); },
  moss33: function () { return std({ color: 0xffffff, map: T('moss'), roughness: 1 }); },
  popcorn33: function () { return std({ color: 0xffffff, map: T('popcorn'), roughness: 1 }); },
  pillowBrown33: function () { return std({ color: 0x7a5a45, roughness: 0.9, bumpMap: T('grain'), bumpScale: 0.001 }); },
  pillowNavy33: function () { return std({ color: 0x2f3d55, roughness: 0.9 }); },
  pillowCharcoal33: function () { return std({ color: 0x55555a, roughness: 0.95, bumpMap: T('boucleBump'), bumpScale: 0.004 }); },
  pillowTaupe33: function () { return std({ color: 0xb7aa98, roughness: 0.95 }); },
  linenOat33: function () { return std({ color: 0xd8cdb9, roughness: 0.95 }); },
  ceramicBrown33: function () { return std({ color: 0x4a3c34, roughness: 0.85 }); },
  ceramicTex33: function () { return std({ color: 0xece9e2, roughness: 0.8, bumpMap: T('boucleBump'), bumpScale: 0.004 }); },
  ceramicGreyTex33: function () { return std({ color: 0xbdbcb7, roughness: 0.8, bumpMap: T('boucleBump'), bumpScale: 0.005 }); },
  glass33: function () { return std({ color: 0xdfe8e6, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.32 }); },
  glassTop33: function () { return std({ color: 0xc9d8d3, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45 }); },
  acrylic33: function () { return std({ color: 0xf2f6f6, roughness: 0.04, transparent: true, opacity: 0.22 }); },
  brass33: function () { return std({ color: 0xb8954f, roughness: 0.35, metalness: 0.9 }); },
  gold33: function () { return std({ color: 0xb09a62, roughness: 0.45, metalness: 0.8 }); },
  cord33: function () { return std({ color: 0xb9ad97, roughness: 1, bumpMap: T('jute'), bumpScale: 0.003 }); },
  wineRed33: function () { return std({ color: 0x5a1219, roughness: 0.2, transparent: true, opacity: 0.85 }); },
  lemon33: function () { return std({ color: 0xe0c13a, roughness: 0.55 }); },
  rubberGrey33: function () { return std({ color: 0x8a95a3, roughness: 0.5 }); },
  matBlack33: function () { return std({ color: 0x1c1c1e, roughness: 0.9 }); },
  capWhite33: function () { return std({ color: 0xf4f4f2, roughness: 0.4 }); },
  leatherBlack33: function () { return std({ color: 0x232323, roughness: 0.5 }); },
  greyWood33: function () { return std({ color: 0xb9b3aa, roughness: 0.85, bumpMap: T('grain'), bumpScale: 0.003 }); },
  darkWood33: function () { return std({ color: 0x7a6552, roughness: 0.6, bumpMap: T('grain'), bumpScale: 0.0015 }); },
  midWood33: function () { return std({ color: 0x9a8268, roughness: 0.65, bumpMap: T('grain'), bumpScale: 0.0015 }); },
  cushionCream33: function () { return std({ color: 0xe6e0d3, roughness: 0.95 }); },
  frameCharcoal33: function () { return std({ color: 0x2c2d2f, roughness: 0.45, metalness: 0.55 }); }
};
var MADE = {}, _mat = FIX.mat;
FIX.mat = function (name) { if (MD[name]) { if (!MADE[name]) { MADE[name] = MD[name](); MADE[name].name = name; } return MADE[name]; } return _mat.apply(this, arguments); };

/* ------------------------------------------------------------ per-piece canvases: rugs + art */
var CUST = {};
function rugMat(o) {
  var key = 'rug33:' + o.pattern + ':' + o.w + 'x' + o.d; if (CUST[key]) return [key, CUST[key]];
  var tname = { seagrass: 'seagrassMat', jute: 'jute', diamondGrey: 'diamondGrey', herringGrey: 'herringGrey', greyWool: 'greyWool', plaidBeige: 'plaidBeige', greyLowPile: 'greyLowPile' }[o.pattern];
  var base = T(tname), t = base.clone(); t.needsUpdate = true; t.repeat.set(o.w / 1.2, o.d / 1.2);
  if (o.pattern === 'diamondGrey' || o.pattern === 'plaidBeige') t.repeat.set(o.w / 4.5, o.d / 4.5);
  if (o.pattern === 'greyLowPile') t.repeat.set(o.w / 5, o.d / 5);
  var m = std({ color: 0xffffff, map: t, roughness: 1 }); m.name = key; CUST[key] = m; return [key, m];
}
function artMat(o) {
  var key = 'art33:' + o.style + ':' + o.seed + ':' + o.w + 'x' + o.h; if (CUST[key]) return [key, CUST[key]];
  var iw = Math.max(0.3, o.w - 2 * (o.frame ? o.fw : 0) - 2 * (o.mat || 0)), ih = Math.max(0.3, o.h - 2 * (o.frame ? o.fw : 0) - 2 * (o.mat || 0));
  var pw = Math.max(iw, ih) > 3 ? 1024 : 512, ph = Math.max(64, Math.round(pw * ih / iw)), R = rng(o.seed * 977 + 13), S = Math.min(pw, ph), st = o.style;
  var c = cv(pw, ph, function (x, W, Hh) {
    function blob(col, cx, cy, rx, ry, a) { x.save(); x.translate(cx, cy); x.rotate(a || 0); x.fillStyle = col; x.beginPath(); for (var k = 0; k <= 24; k++) { var t = k / 24 * TAU, r = 1 + (R() - 0.5) * 0.12; x.lineTo(Math.cos(t) * rx * r, Math.sin(t) * ry * r); } x.closePath(); x.fill(); x.restore(); }
    function stroke(col, pts, w) { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); pts.forEach(function (p, i) { if (i) x.lineTo(p[0] * W, p[1] * Hh); else x.moveTo(p[0] * W, p[1] * Hh); }); x.stroke(); }
    function grainy(n, a) { for (var i = 0; i < n; i++) { x.fillStyle = R() < 0.5 ? 'rgba(0,0,0,' + a + ')' : 'rgba(255,255,255,' + a * 2 + ')'; x.fillRect(R() * W, R() * Hh, 1 + R() * 3, 1 + R() * 3); } }
    if (st === 'geoNeutral') {          // great room (p495/496): overlapping grey / putty / cream planes, black notches and dots
      x.fillStyle = '#d9d6d0'; x.fillRect(0, 0, W, Hh);
      x.fillStyle = '#a5a29c'; x.fillRect(0, Hh * 0.55, W * 0.62, Hh * 0.45); x.fillStyle = '#efece6'; x.fillRect(W * 0.45, 0, W * 0.55, Hh * 0.55);
      x.fillStyle = '#8f8a83'; x.fillRect(W * 0.62, Hh * 0.55, W * 0.38, Hh * 0.45); x.fillStyle = '#c4beb4'; x.beginPath(); x.ellipse(W * 0.32, Hh * 0.28, W * 0.3, Hh * 0.2, 0.4, 0, TAU); x.fill();
      x.fillStyle = '#121212'; x.beginPath(); x.arc(W * 0.36, Hh * 0.47, W * 0.11, 0, PI); x.fill(); x.beginPath(); x.arc(W * 0.86, Hh * 0.82, W * 0.035, 0, TAU); x.fill(); x.beginPath(); x.arc(W * 0.66, Hh * 0.14, W * 0.03, 0, TAU); x.fill();
      x.fillStyle = '#f7f5f0'; x.fillRect(W * 0.08, Hh * 0.62, W * 0.25, Hh * 0.18); grainy(5000, 0.03);
    } else if (st === 'creamField') {   // front living (p505/514): sand-beige wash over white, a seam line, a small black stroke
      x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, W, Hh); var gr = x.createLinearGradient(0, 0, 0, Hh * 0.6); gr.addColorStop(0, '#e2d6c1'); gr.addColorStop(1, '#d8c9ae'); x.fillStyle = gr; x.fillRect(0, 0, W, Hh * 0.58);
      x.fillStyle = '#ece6da'; x.fillRect(W * 0.1, Hh * 0.62, W * 0.35, Hh * 0.2); x.fillStyle = '#e0d4c0'; x.fillRect(W * 0.55, Hh * 0.6, W * 0.4, Hh * 0.12);
      x.strokeStyle = 'rgba(120,105,85,.6)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, Hh * 0.5); x.lineTo(W, Hh * 0.5); x.stroke(); stroke('#1b1b1b', [[0.42, 0.84], [0.56, 0.835], [0.66, 0.845]], S * 0.012); grainy(6000, 0.025);
    } else if (st === 'leafBW') {       // middle bedroom desk wall (p525): black ground, a cream bilobed leaf shape
      x.fillStyle = '#141414'; x.fillRect(0, 0, W, Hh); x.fillStyle = '#ede7da'; x.beginPath(); x.moveTo(W * 0.15, Hh * 0.62); x.bezierCurveTo(W * 0.3, Hh * 0.2, W * 0.55, Hh * 0.35, W * 0.5, Hh * 0.55); x.bezierCurveTo(W * 0.6, Hh * 0.3, W * 0.9, Hh * 0.35, W * 0.86, Hh * 0.6); x.bezierCurveTo(W * 0.7, Hh * 0.8, W * 0.35, Hh * 0.85, W * 0.15, Hh * 0.62); x.fill();
      x.fillStyle = '#141414'; x.beginPath(); x.ellipse(W * 0.5, Hh * 0.6, W * 0.04, Hh * 0.12, 0.2, 0, TAU); x.fill(); grainy(3000, 0.03);
    } else if (st === 'chevron') {      // gym wall (p529): white sheet, one bold black '>' brush stroke
      x.fillStyle = '#f6f5f1'; x.fillRect(0, 0, W, Hh); stroke('#121212', [[0.2, 0.28], [0.78, 0.47], [0.24, 0.8]], S * 0.07); grainy(2000, 0.02);
    } else if (st === 'enso') {         // lounge (p538): white canvas, black ensō circle with dry-brush splatter
      x.fillStyle = '#f5f4f0'; x.fillRect(0, 0, W, Hh); x.strokeStyle = '#111'; x.lineCap = 'round';
      for (var k = 0; k < 9; k++) { x.lineWidth = S * (0.012 + R() * 0.03); x.globalAlpha = 0.5 + R() * 0.5; x.beginPath(); x.arc(W / 2 + (R() - 0.5) * 8, Hh / 2 + (R() - 0.5) * 8, S * (0.3 + R() * 0.04), -0.2 + R() * 0.3, 5.6 + R() * 0.4); x.stroke(); }
      x.globalAlpha = 1; speck(x, W, Hh, 120, R, ['#111'], 0.8, 3.5);
    } else if (st === 'kidsLoops') {    // office (p545): white, painterly green / blue / magenta / gold loops and bars
      x.fillStyle = '#f7f6f2'; x.fillRect(0, 0, W, Hh); stroke('#2f8a4a', [[0.55, 0.1], [0.6, 0.45], [0.62, 0.7]], S * 0.09); stroke('#4a86c5', [[0.08, 0.32], [0.9, 0.3]], S * 0.04);
      x.strokeStyle = '#4a86c5'; x.lineWidth = S * 0.035; x.beginPath(); x.ellipse(W * 0.3, Hh * 0.65, W * 0.15, Hh * 0.17, 0, 0, TAU); x.stroke(); stroke('#c4549a', [[0.12, 0.1], [0.3, 0.22], [0.2, 0.42]], S * 0.025); stroke('#d6a63a', [[0.62, 0.5], [0.95, 0.52]], S * 0.025);
    } else if (st === 'letters') {      // office alphabet poster
      x.fillStyle = '#fbfaf6'; x.fillRect(0, 0, W, Hh); var L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', cols = ['#e2463c', '#2f78c4', '#f2b52e', '#3aa45a', '#8c4bb5', '#f07a2b'];
      x.font = 'bold ' + (S * 0.13 | 0) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (var q = 0; q < 26; q++) { x.fillStyle = cols[q % cols.length]; x.fillText(L[q], W * (0.14 + (q % 5) * 0.18), Hh * (0.16 + Math.floor(q / 5) * 0.14)); }
    } else if (st === 'days') {         // office days-of-the-week poster
      x.fillStyle = '#fbfaf6'; x.fillRect(0, 0, W, Hh); var dc = ['#e2463c', '#f07a2b', '#f2b52e', '#3aa45a', '#2f78c4', '#5a4bb5', '#c4549a'];
      for (var d = 0; d < 7; d++) { x.fillStyle = dc[d]; x.fillRect(W * 0.12, Hh * (0.2 + d * 0.1), W * 0.76, Hh * 0.075); }
    } else if (st === 'swirlWhite') {   // stair hall (p535): white canvas, a raised grey-white ribbon swirl
      x.fillStyle = '#f2f0eb'; x.fillRect(0, 0, W, Hh); x.strokeStyle = '#c9c6bf'; x.lineCap = 'round';
      for (var s2 = 0; s2 < 9; s2++) { x.lineWidth = 3; var o2 = s2 * 6; x.beginPath(); x.moveTo(W * 0.15 + o2, Hh * 0.75); x.bezierCurveTo(W * 0.2 + o2, Hh * 0.1, W * 0.55 + o2, Hh * 0.15, W * 0.5 + o2, Hh * 0.5); x.bezierCurveTo(W * 0.45 + o2, Hh * 0.85, W * 0.85 + o2, Hh * 0.8, W * 0.82 + o2, Hh * 0.3); x.stroke(); }
      x.strokeStyle = '#9c988f'; x.lineWidth = 2; x.beginPath(); x.moveTo(W * 0.15, Hh * 0.75); x.bezierCurveTo(W * 0.2, Hh * 0.1, W * 0.55, Hh * 0.15, W * 0.5, Hh * 0.5); x.stroke();
    } else if (st === 'blackCream') {   // loft stair wall (p536/578): cream ground, sand washes, black brush marks
      x.fillStyle = '#efe9de'; x.fillRect(0, 0, W, Hh); blob('#ddd2bf', W * 0.4, Hh * 0.5, W * 0.38, Hh * 0.3, 0.3); blob('#f8f6f1', W * 0.6, Hh * 0.35, W * 0.2, Hh * 0.14, -0.4);
      stroke('#141414', [[0.42, 0.32], [0.5, 0.34], [0.47, 0.5], [0.58, 0.62]], S * 0.05); stroke('#141414', [[0.3, 0.6], [0.32, 0.8]], S * 0.025); grainy(4000, 0.025);
    } else if (st === 'creamPanel') {   // primary (p586): cream / white / putty planes, soft arc
      x.fillStyle = '#e8e2d7'; x.fillRect(0, 0, W, Hh); x.fillStyle = '#f6f3ee'; x.fillRect(W * 0.12, 0, W * 0.3, Hh); x.fillStyle = '#d4cbbb'; x.beginPath(); x.arc(W * 0.2, Hh * 0.55, W * 0.28, -HALF, HALF); x.fill(); grainy(5000, 0.02);
    } else if (st === 'greyScape') {    // front bedroom (p511): grey / white / black abstract landscape
      x.fillStyle = '#d7d8d6'; x.fillRect(0, 0, W, Hh); var g3 = x.createLinearGradient(0, 0, 0, Hh); g3.addColorStop(0, '#eef0ef'); g3.addColorStop(0.55, '#a9adad'); g3.addColorStop(1, '#5d6162'); x.fillStyle = g3; x.fillRect(0, 0, W, Hh);
      for (var r2 = 0; r2 < 26; r2++) { x.fillStyle = 'rgba(' + (R() < 0.5 ? '30,32,34' : '250,250,248') + ',' + (0.1 + R() * 0.3) + ')'; x.fillRect(R() * W, Hh * (0.45 + R() * 0.3), W * (0.1 + R() * 0.4), 2 + R() * 6); }
    } else if (st === 'ribbon') {       // Josie (p548): white canvas, one wide grey ribbon brush twisting top to bottom
      x.fillStyle = '#f2f1ec'; x.fillRect(0, 0, W, Hh); var ph0 = R() * 3;
      for (var y = 0; y < Hh; y += 2) { var tt = y / Hh, cx2 = W * (0.5 + 0.18 * Math.sin(tt * 7 + ph0)), wd = W * (0.1 + 0.08 * Math.cos(tt * 5 + ph0)); x.fillStyle = 'rgba(' + (95 + 30 * Math.sin(tt * 9) | 0) + ',' + (100 + 30 * Math.sin(tt * 9) | 0) + ',' + (108 + 30 * Math.sin(tt * 9) | 0) + ',.9)'; x.fillRect(cx2 - wd, y, wd * 2, 2.2); }
    } else {                            // plain / blank
      x.fillStyle = '#f3f1ec'; x.fillRect(0, 0, W, Hh); grainy(1500, 0.015);
    }
  });
  var t = tx(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
  var m = std({ color: 0xffffff, map: t, roughness: 0.88 }); m.name = key; CUST[key] = m; return [key, m];
}

/* ------------------------------------------------------------ kinds */
var K = {};
function def(key, defaults, build, size) { K[key] = { defaults: defaults, build: build, size: size }; }
function legs4(b, mat, w, d, h, ins, r) { [[-1, ins], [1, ins], [-1, d - ins], [1, d - ins]].forEach(function (p) { b.cyl(mat, r, r * 0.8, h, p[0] * (w / 2 - ins), h / 2, p[1], 10); }); }

// curved bouclé sofa (p495): soft continuous back + rolled arms, deep seat, recessed plinth
def('sofa3:curve', { w: 8.2, d: 3.3, h: 2.35, fabric: 'boucleCream' }, function (b, o) {
  var w = o.w, d = o.d, f = o.fabric, aw = 0.85, seatY = 1.35;
  b.rbox('blackMatte33', w - 0.9, 0.22, d - 0.7, 0.04, 0, 0.11, d / 2, { seg: 1 });                                   // recessed plinth
  b.rbox(f, w - 0.25, seatY - 0.62 - 0.2, d - 0.15, 0.32, 0, 0.2 + (seatY - 0.82) / 2 + 0.01, d / 2, { seg: 4, bulge: [0.04, 0.04, 0.04] });   // base
  b.rbox(f, w - 2 * aw + 0.3, 0.55, d - 0.9, 0.24, 0, seatY - 0.27, 0.85 + (d - 0.9) / 2, { seg: 4, bulge: [0.02, 0.06, 0.03], flat: 4 });   // seat cushion
  b.rbox(f, w - 0.2, o.h - 0.25, 0.95, 0.42, 0, 0.25 + (o.h - 0.25) / 2, 0.48, { seg: 5, bulge: [0.03, 0.03, 0.07], flat: 3 });   // back
  [-1, 1].forEach(function (s) { b.rbox(f, aw + 0.15, 2.05 - 0.25, d - 0.1, 0.4, s * (w / 2 - aw / 2 - 0.05), 0.25 + (2.05 - 0.25) / 2, d / 2 + 0.03, { seg: 5, bulge: [0.06, 0.04, 0.05], flat: 3 }); });
}, function (o) { return [o.w, o.d, o.h]; });
// oval / round coffee + side tables
def('drumTable:oval', { w: 4.8, d: 2.0, h: 1.35, mat: 'plasterCream' }, function (b, o) {        // great room (p495): cream oval top over a narrower oval plinth
  var s1 = new THREE.Shape(); s1.absellipse(0, -o.d / 2, o.w / 2, o.d / 2, 0, TAU, false, 0);
  var s2 = new THREE.Shape(); s2.absellipse(0, -o.d / 2, o.w / 2 - 0.35, o.d / 2 - 0.3, 0, TAU, false, 0);
  b.extrude(o.mat, s2, o.h - 0.32, M(0, 0, 0, -HALF, 0, 0), { curveSegments: 40 });
  b.extrude(o.mat, s1, 0.26, M(0, o.h - 0.29, 0, -HALF, 0, 0), { bevel: 0.03, bevelSegments: 2, curveSegments: 48 });
}, function (o) { return [o.w, o.d, o.h]; });
def('drumTable:woodDrum', { dia: 3.6, h: 1.4, mat: 'oakDrum33' }, function (b, o) {             // front living (p515): light oak drum, slightly tapered
  var R0 = o.dia / 2; b.lathe(o.mat, [[0, 0], [R0 * 0.86, 0], [R0 * 0.93, o.h * 0.5], [R0, o.h - 0.04], [R0 * 0.99, o.h], [0, o.h]], 64, 0, 0, R0);
  for (var i = 0; i < 40; i++) { var a = i / 40 * TAU; b.boxR('midWood33', 0.015, o.h * 0.9, 0.05, Math.cos(a) * (R0 * 0.94), o.h * 0.48, R0 + Math.sin(a) * (R0 * 0.94), 0, -a, 0); }
}, function (o) { return [o.dia, o.dia, o.h]; });
def('woodSideTable:fluted', { w: 1.9, d: 1.3, h: 2.0, mat: 'paintWhite33' }, function (b, o) { // great room lamp tables (p495): white oval fluted pedestal
  var rx = o.w / 2, rz = o.d / 2;
  b.lathe(o.mat, [[0, 0], [1, 0], [1, o.h - 0.1], [0.96, o.h - 0.05], [0, o.h - 0.05]], 48, 0, 0, rz, { deform: function (g) { var p = g.attributes.position; for (var i = 0; i < p.count; i++) { var X = p.getX(i), Z = p.getZ(i), a = Math.atan2(Z, X), k = 1 - 0.035 * Math.max(0, Math.cos(a * 36)) * (p.getY(i) < o.h - 0.12 ? 1 : 0); p.setX(i, X * rx * k); p.setZ(i, Z * rz * k); } g.computeVertexNormals(); } });
  var s = new THREE.Shape(); s.absellipse(0, -rz, rx + 0.03, rz + 0.03, 0, TAU, false, 0); b.extrude(o.mat, s, 0.06, M(0, o.h - 0.06, 0, -HALF, 0, 0), { curveSegments: 40 });
}, function (o) { return [o.w, o.d, o.h]; });
def('woodSideTable:tulip', { dia: 1.7, h: 1.75 }, function (b, o) {                              // great room (p533): white marble round on a white tulip foot
  var R0 = o.dia / 2; b.cyl('marble', R0, R0, 0.07, 0, o.h - 0.035, R0, 48);
  b.lathe('paintWhite33', [[0, 0], [R0 * 0.62, 0], [R0 * 0.6, 0.06], [R0 * 0.25, 0.22], [0.09, 0.6], [0.08, o.h - 0.3], [0.2, o.h - 0.08], [0, o.h - 0.07]], 40, 0, 0, R0);
}, function (o) { return [o.dia, o.dia, o.h]; });
def('woodSideTable:tier', { dia: 1.8, h: 2.0 }, function (b, o) {                                 // front living (p506): round two-tier light oak, curved legs
  var R0 = o.dia / 2; b.cyl('oakPale', R0, R0, 0.1, 0, o.h - 0.05, R0, 40); b.cyl('oakPale', R0 * 0.82, R0 * 0.82, 0.08, 0, 0.55, R0, 40);
  for (var i = 0; i < 3; i++) { var a = i / 3 * TAU + 0.3, r = R0 * 0.82; b.tube('oakPale', [[Math.cos(a) * r, 0, R0 + Math.sin(a) * r], [Math.cos(a) * r * 1.06, o.h * 0.5, R0 + Math.sin(a) * r * 1.06], [Math.cos(a) * r, o.h - 0.1, R0 + Math.sin(a) * r]], 0.05, 8, 6); }
}, function (o) { return [o.dia, o.dia, o.h]; });
// lamps
function lampTop(b, o, y, cz) { var R0 = o.shadeDia / 2, sH = o.shadeH; b.cyl('nickel', 0.02, 0.02, sH * 0.7, 0, y + sH * 0.35, cz, 8); b.sphere('bulb', 0.09, 0, y + sH * 0.45, cz, 12, 8); b.cyl(o.shade, R0 * 0.97, R0, sH, 0, y + sH / 2 + 0.12, cz, 40, { open: true }); }
def('lamp:glassCyl', { h: 2.5, mountY: 0, shade: 'shadeWhite', shadeDia: 1.35, shadeH: 0.9 }, function (b, o) {   // clear glass column + white drum (p495)
  var y = o.mountY, bh = o.h - o.shadeH - 0.12, cz = o.shadeDia / 2;
  b.cyl('nickel', 0.24, 0.26, 0.06, 0, y + 0.03, cz, 32); b.cyl('glass33', 0.2, 0.2, bh - 0.12, 0, y + 0.06 + (bh - 0.12) / 2, cz, 32); b.cyl('nickel', 0.05, 0.05, bh, 0, y + bh / 2, cz, 8); b.cyl('nickel', 0.1, 0.1, 0.06, 0, y + bh - 0.03, cz, 16);
  lampTop(b, o, y + bh, cz);
}, function (o) { return [o.shadeDia, o.shadeDia, o.mountY + o.h]; });
def('lamp:rings', { h: 2.4, mountY: 0, base: 'paintWhite33', shade: 'shadeWhite', shadeDia: 1.35, shadeH: 0.85 }, function (b, o) {   // stacked-ring ceramic (p585)
  var y = o.mountY, bh = o.h - o.shadeH - 0.12, cz = o.shadeDia / 2, n = 9;
  for (var i = 0; i < n; i++) b.torus(o.base, 0.27, 0.055, 0, y + 0.06 + i * (bh - 0.1) / n, cz, 8, 32, { rx: HALF });
  b.cyl(o.base, 0.27, 0.27, bh - 0.06, 0, y + bh / 2, cz, 32); lampTop(b, o, y + bh, cz);
}, function (o) { return [o.shadeDia, o.shadeDia, o.mountY + o.h]; });
def('lamp:urn', { h: 2.2, mountY: 0, base: 'ceramicTex33', shade: 'shadeWhite', shadeDia: 1.2, shadeH: 0.8 }, function (b, o) {   // textured ceramic urn / gourd (p508, p548, p560)
  var y = o.mountY, bh = o.h - o.shadeH - 0.12, cz = o.shadeDia / 2;
  b.lathe(o.base, [[0, 0], [0.16, 0], [0.26, bh * 0.15], [0.33, bh * 0.45], [0.27, bh * 0.75], [0.1, bh * 0.92], [0.07, bh], [0, bh]], 36, 0, y, cz); lampTop(b, o, y + bh, cz);
}, function (o) { return [o.shadeDia, o.shadeDia, o.mountY + o.h]; });
def('lamp:column', { h: 2.3, mountY: 0, base: 'paintWhite33', shade: 'shadeWhite', shadeDia: 1.25, shadeH: 0.85 }, function (b, o) {   // white column (p525)
  var y = o.mountY, bh = o.h - o.shadeH - 0.12, cz = o.shadeDia / 2; b.cyl(o.base, 0.3, 0.3, bh * 0.85, 0, y + bh * 0.425, cz, 32); b.cyl(o.base, 0.08, 0.1, bh * 0.15, 0, y + bh * 0.925, cz, 16); lampTop(b, o, y + bh, cz);
}, function (o) { return [o.shadeDia, o.shadeDia, o.mountY + o.h]; });
def('lamp:clear', { h: 2.4, mountY: 0, shade: 'linenOat33', shadeDia: 1.25, shadeH: 0.8 }, function (b, o) {   // office (p545): clear turned acrylic base, grey shade
  var y = o.mountY, bh = o.h - o.shadeH - 0.12, cz = o.shadeDia / 2;
  b.lathe('acrylic33', [[0, 0], [0.25, 0], [0.25, 0.08], [0.12, 0.2], [0.2, bh * 0.35], [0.1, bh * 0.55], [0.17, bh * 0.75], [0.07, bh], [0, bh]], 24, 0, y, cz); lampTop(b, o, y + bh, cz);
}, function (o) { return [o.shadeDia, o.shadeDia, o.mountY + o.h]; });
// decor
def('ringSculpture', { mountY: 0, s: 0.42 }, function (b, o) {                                   // great room coffee table (p533): stacked black rings
  var y = o.mountY, s = o.s; b.cyl('blackMatte33', 0.2, 0.22, 0.06, 0, y + 0.03, 0.3, 24);
  [[0, 0.32, 0, 0], [0.18, 0.62, 0.05, 0.8], [-0.12, 0.92, -0.04, -0.6], [0.05, 1.18, 0.02, 0.3]].forEach(function (q) { b.torus('blackMatte33', s * 0.5, 0.05, q[0], y + q[1], 0.3 + q[2], 8, 28, { rx: 0, ry: q[3] }); });
}, function (o) { return [0.7, 0.6, o.mountY + 1.45]; });
def('vase2:egg', { h: 1.5, dia: 0.85, mountY: 0, mat: 'ceramicBrown33', n: 2, gap: 0.12 }, function (b, o) {   // front living (p507): two dark egg vases, small mouth
  for (var k = 0; k < o.n; k++) { var hh = o.h * (k ? 0.72 : 1), R0 = o.dia / 2 * (k ? 1.05 : 0.9), x = (k - (o.n - 1) / 2) * (o.dia + o.gap);
    b.lathe(o.mat, [[0, 0], [R0 * 0.5, 0], [R0 * 0.9, hh * 0.18], [R0, hh * 0.45], [R0 * 0.82, hh * 0.78], [R0 * 0.3, hh * 0.97], [R0 * 0.18, hh], [0, hh * 0.98]], 32, x, o.mountY, o.dia / 2 + (k ? 0.25 : 0)); }
}, function (o) { return [o.n * o.dia + (o.n - 1) * o.gap, o.dia + 0.3, o.mountY + o.h]; });
def('bowl:moss', { dia: 1.5, h: 0.75, mountY: 0, mat: 'blackMatte33', foot: true }, function (b, o) {   // front living + outdoor table (p515, p471): footed bowl of moss
  var R0 = o.dia / 2, y = o.mountY, cz = R0, f = o.foot ? 0.18 : 0;
  if (f) b.cyl(o.mat, R0 * 0.32, R0 * 0.38, f, 0, y + f / 2, cz, 28);
  b.lathe(o.mat, [[0, f], [R0 * 0.4, f], [R0 * 0.85, f + (o.h - f) * 0.6], [R0, o.h - 0.15], [R0 * 0.96, o.h - 0.13], [R0 * 0.5, f + 0.1], [0, f + 0.1]], 40, 0, y, cz);
  b.sphere('moss33', R0 * 0.92, 0, y + o.h - 0.2, cz, 24, 12, { sy: 0.32, thetaLength: HALF });
}, function (o) { return [o.dia, o.dia, o.mountY + o.h + 0.15]; });
def('vossBottles', { n: 2, mountY: 0, gap: 0.35 }, function (b, o) {                               // gym (p528): Voss glass bottles
  for (var i = 0; i < o.n; i++) { var x = (i - (o.n - 1) / 2) * o.gap; b.cyl('glass33', 0.12, 0.12, 0.72, x, o.mountY + 0.36, 0.15, 20); b.cyl('water', 0.11, 0.11, 0.6, x, o.mountY + 0.31, 0.15, 16); b.cyl('capWhite33', 0.11, 0.11, 0.09, x, o.mountY + 0.765, 0.15, 20); }
}, function (o) { return [o.n * o.gap, 0.3, o.mountY + 0.82]; });
def('yogaMat', { w: 2.0, d: 6.0, towel: true, dumbbells: true }, function (b, o) {             // gym (p528): black mat, folded white towel, pair of black dumbbells
  b.rbox('matBlack33', o.w, 0.02, o.d, 0.01, 0, 0.012, o.d / 2, { seg: 1 });
  if (o.towel) b.rbox('towelWhite', 1.0, 0.18, 0.75, 0.06, 0, 0.11, 0.7, { seg: 2, bulge: [0, 0.02, 0] });
  if (o.dumbbells) [-0.25, 0.25].forEach(function (x) { b.cyl('blackMatte33', 0.035, 0.035, 0.7, x, 0.09, 1.9, 8, { rx: HALF }); [-0.3, 0.3].forEach(function (z) { b.cyl('blackMatte33', 0.09, 0.09, 0.12, x, 0.09, 1.9 + z, 6, { rx: HALF }); }); });
}, function (o) { return [o.w, o.d, 0.25]; });
def('basket:mats', { dia: 1.6, h: 1.5 }, function (b, o) {                                       // gym (p530): tall woven basket of rolled grey mats
  var R0 = o.dia / 2; b.cyl('seagrass', R0, R0 * 0.85, o.h, 0, o.h / 2, R0, 28, { open: true }); b.cyl('seagrass', R0 * 0.85, R0 * 0.85, 0.04, 0, 0.02, R0, 24);
  [[-0.25, -0.15, 0.1], [0.22, 0.05, -0.08], [-0.05, 0.25, 0.05], [0.2, -0.28, 0.12]].forEach(function (q, i) { b.cyl(i % 2 ? 'rubberGrey33' : 'matBlack33', 0.2, 0.2, 2.1, q[0], 1.05, R0 + q[1], 16, { rx: q[2], rz: q[2] }); });
}, function (o) { return [o.dia, o.dia, 2.2]; });
def('yogaBall:grey', { dia: 1.85 }, function (b, o) { b.sphere('rubberGrey33', o.dia / 2, 0, o.dia / 2, o.dia / 2, 28, 18); }, function (o) { return [o.dia, o.dia, o.dia]; });
def('bench:wood', { w: 4.2, d: 1.35, h: 1.5 }, function (b, o) {                               // gym (p529): reclaimed plank bench, slab legs
  var w = o.w, d = o.d, h = o.h; b.bb('reclaimed33', -w / 2, h - 0.2, 0, w / 2, h, d, 0.01, { boxUV: true });
  [-1, 1].forEach(function (s) { b.bb('reclaimed33', s * (w / 2 - 0.45) - 0.12, 0, 0.12, s * (w / 2 - 0.45) + 0.12, h - 0.2, d - 0.12, 0, { boxUV: true }); });
  b.bb('reclaimed33', -w / 2 + 0.6, 0.35, d / 2 - 0.08, w / 2 - 0.6, 0.5, d / 2 + 0.08);
}, function (o) { return [o.w, o.d, o.h]; });
def('bench:woven', { w: 5.0, d: 1.5, h: 1.5 }, function (b, o) {                               // loft (p574): light wood frame, woven leather seat
  var w = o.w, d = o.d, h = o.h; b.bb('woven33', -w / 2 + 0.08, h - 0.12, 0.08, w / 2 - 0.08, h - 0.04, d - 0.08, 0, { boxUV: true });
  [[-1, 0.08], [1, 0.08], [-1, d - 0.08], [1, d - 0.08]].forEach(function (p) { b.bb('oakPale', p[0] * (w / 2 - 0.08) - 0.07, 0, p[1] - 0.07, p[0] * (w / 2 - 0.08) + 0.07, h, p[1] + 0.07); });
  b.bb('oakPale', -w / 2 + 0.08, h - 0.16, 0.02, w / 2 - 0.08, h - 0.04, 0.14); b.bb('oakPale', -w / 2 + 0.08, h - 0.16, d - 0.14, w / 2 - 0.08, h - 0.04, d - 0.02);
  [-1, 1].forEach(function (s) { b.bb('oakPale', s * (w / 2 - 0.08) - 0.06, 0.4, 0.1, s * (w / 2 - 0.08) + 0.06, 0.5, d - 0.1); });
}, function (o) { return [o.w, o.d, o.h]; });
def('pouf:round', { dia: 1.7, h: 1.3, mat: 'jute33' }, function (b, o) {                          // jute (p512) / chunky knit (p548) round pouf
  var R0 = o.dia / 2; b.sphere(o.mat, R0, 0, o.h * 0.5, R0, 32, 16, { sy: o.h / o.dia });
}, function (o) { return [o.dia, o.dia, o.h]; });
def('pouf:cube', { s: 1.6, h: 1.35, mat: 'geoBW33' }, function (b, o) {                           // lounge (p538): patterned cube pouf
  b.rbox(o.mat, o.s, o.h, o.s, 0.16, 0, o.h / 2, o.s / 2, { seg: 3, bulge: [0.05, 0.03, 0.05], boxUV: true });
}, function (o) { return [o.s, o.s, o.h]; });
// dining
def('diningTableGlass:pedestalRound', { dia: 4.2, h: 2.5 }, function (b, o) {                     // p498/516: round grey-washed top on a wide pedestal
  var R0 = o.dia / 2; b.cyl('greyWash33', R0, R0, 0.12, 0, o.h - 0.06, R0, 64); b.cyl('greyWash33', R0 - 0.08, R0 - 0.15, 0.1, 0, o.h - 0.17, R0, 48);
  b.lathe('greyWash33', [[0, 0], [R0 * 0.55, 0], [R0 * 0.55, 0.12], [R0 * 0.24, 0.35], [0.36, 1.1], [0.42, o.h - 0.22], [0, o.h - 0.22]], 40, 0, 0, R0);
}, function (o) { return [o.dia, o.dia, o.h]; });
def('parsonsChair:slipper', { arms: false, seatH: 1.6, fabric: 'linenWhite', legs: 'greyWash33' }, function (b, o) {   // p516: cream upholstered, grey-wash legs; arms: slipper arms
  var sH = o.seatH, f = o.fabric, w = o.arms ? 1.95 : 1.65;
  b.rbox(f, w, 0.4, 1.7, 0.08, 0, sH - 0.2, 0.95, { seg: 2, bulge: [0, 0.02, 0] });
  if (o.arms) { var sh = new THREE.Shape(); sh.absarc(0, 0, 0.95, 0, PI, false); sh.absarc(0, 0, 0.75, PI, 0, true); b.extrude(f, sh, 1.2, M(0, sH - 0.05, 1.0, -HALF, 0, 0), { bevel: 0.05, bevelSegments: 2, curveSegments: 24 }); }
  else b.rbox(f, w, 1.55, 0.3, 0.1, 0, sH + 0.6, 0.2, { seg: 3, rx: -0.08 });
  [[-1, 0.25], [1, 0.25], [-1, 1.65], [1, 1.65]].forEach(function (p) { b.bb(o.legs, p[0] * (w / 2 - 0.12) - 0.05, 0, p[1] - 0.05, p[0] * (w / 2 - 0.12) + 0.05, sH - 0.4, p[1] + 0.05); });
}, function (o) { return [o.arms ? 1.95 : 1.65, 1.85, o.seatH + (o.arms ? 1.2 : 1.4)]; });
def('counterStoolRope:cream', { seatH: 2.15, w: 1.5, d: 1.3 }, function (b, o) {                 // p503/516: backless cream cushion on a brass square frame
  var w = o.w, d = o.d, sH = o.seatH; b.rbox('cushionCream33', w, 0.32, d, 0.08, 0, sH - 0.16, d / 2, { seg: 3, bulge: [0, 0.03, 0] });
  [[-1, 0.06], [1, 0.06], [-1, d - 0.06], [1, d - 0.06]].forEach(function (p) { b.bb('brass33', p[0] * (w / 2 - 0.06) - 0.03, 0, p[1] - 0.03, p[0] * (w / 2 - 0.06) + 0.03, sH - 0.32, p[1] + 0.03); });
  b.bb('brass33', -w / 2 + 0.06, 0.6, 0.03, w / 2 - 0.06, 0.66, 0.09); b.bb('brass33', -w / 2 + 0.06, 0.6, d - 0.09, w / 2 - 0.06, 0.66, d - 0.03);
  [-1, 1].forEach(function (s) { b.bb('brass33', s * (w / 2 - 0.06) - 0.03, 0.6, 0.06, s * (w / 2 - 0.06) + 0.03, 0.66, d - 0.06); });
}, function (o) { return [o.w, o.d, o.seatH]; });
// beds & storage
def('nightstand:mirrored', { w: 1.8, d: 1.4, h: 2.15 }, function (b, o) {                        // Evie (p559): white frame, mirrored fret front
  var w = o.w, d = o.d, h = o.h; b.bb('cabinetWhite', -w / 2, 0.15, 0, w / 2, h, d, 0.01); b.bb('mirrorGlass', -w / 2 + 0.12, 0.3, d, w / 2 - 0.12, h - 0.15, d + 0.01);
  b.torus('cabinetWhite', 0.3, 0.03, 0, h * 0.55, d + 0.02, 6, 24); legs4(b, 'cabinetWhite', w, d, 0.15, 0.1, 0.05);
}, function (o) { return [o.w, o.d, o.h]; });
def('sideboard:circle', { w: 4.0, d: 1.5, h: 2.6 }, function (b, o) {                            // Evie (p561): white two-door cabinet, chrome ring pull across the doors
  var w = o.w, d = o.d, h = o.h; b.bb('cabinetWhite', -w / 2, 0.25, 0, w / 2, h, d, 0.02); b.bb('cabinetWhite', -w / 2 + 0.1, 0, 0.1, w / 2 - 0.1, 0.25, d - 0.1);
  b.box('blackMatte33', 0.01, h - 0.4, 0.01, 0, h / 2 + 0.12, d + 0.002); b.torus('chrome', 0.38, 0.035, 0, h * 0.55, d + 0.03, 8, 40);
}, function (o) { return [o.w, o.d, o.h]; });
def('sideboard:chevron', { w: 5.6, d: 1.6, h: 2.6 }, function (b, o) {                           // primary (p586): reclaimed chevron-front four-door chest, iron legs
  var w = o.w, d = o.d, h = o.h; b.bb('midWood33', -w / 2, 0.35, 0, w / 2, h, d, 0.02);
  for (var i = 0; i < 4; i++) b.add('chevronWood33', (function () { var g = new THREE.PlaneGeometry(w / 4 - 0.08, h - 0.55); return g; })(), M(-w / 2 + w / 8 + i * w / 4, 0.35 + (h - 0.35) / 2, d + 0.005, 0, 0, 0), { keepUV: true });
  [[-1, 0.15], [1, 0.15], [-1, d - 0.15], [1, d - 0.15]].forEach(function (p) { b.bb('blackMatte33', p[0] * (w / 2 - 0.15) - 0.04, 0, p[1] - 0.04, p[0] * (w / 2 - 0.15) + 0.04, 0.35, p[1] + 0.04); });
  [-1, 1].forEach(function (s) { b.bb('blackMatte33', s * 0.06 - 0.015, h * 0.5, d + 0.01, s * 0.06 + 0.015, h * 0.5 + 0.4, d + 0.05); });
}, function (o) { return [o.w, o.d, o.h]; });
def('consoleTable:waterfall', { w: 3.6, d: 1.15, h: 2.5 }, function (b, o) {                    // Josie (p548): clear glass waterfall console
  var w = o.w, d = o.d, h = o.h; b.box('glassTop33', w, 0.04, d, 0, h - 0.02, d / 2); [-1, 1].forEach(function (s) { b.box('glassTop33', 0.04, h - 0.04, d, s * (w / 2 - 0.02), (h - 0.04) / 2, d / 2); });
}, function (o) { return [o.w, o.d, o.h]; });
def('consoleTable:slab', { w: 5.5, d: 1.4, h: 2.55 }, function (b, o) {                         // stair hall (p535): reclaimed grey-wood slab top on two block legs
  var w = o.w, d = o.d, h = o.h; b.bb('greyWood33', -w / 2, h - 0.25, 0, w / 2, h, d, 0.02, { boxUV: true });
  [-1, 1].forEach(function (s) { b.bb('greyWood33', s * (w / 2 - 0.55) - 0.4, 0, 0.12, s * (w / 2 - 0.55) + 0.4, h - 0.25, d - 0.12, 0.01, { boxUV: true }); });
}, function (o) { return [o.w, o.d, o.h]; });
def('deskX:white', { w: 4.2, d: 2.0, h: 2.5 }, function (b, o) {                                // office (p545): white lacquer top, white X legs
  var w = o.w, d = o.d, h = o.h; b.bb('paintWhite33', -w / 2, h - 0.12, 0, w / 2, h, d, 0.02); b.bb('paintWhite33', -w / 2 + 0.1, h - 0.4, 0.1, w / 2 - 0.1, h - 0.12, d - 0.1, 0.01);
  [-1, 1].forEach(function (s) { var x = s * (w / 2 - 0.2); b.rod('paintWhite33', [x, 0, 0.1], [x, h - 0.4, d - 0.1], 0.06, 6); b.rod('paintWhite33', [x, 0, d - 0.1], [x, h - 0.4, 0.1], 0.06, 6); });
}, function (o) { return [o.w, o.d, o.h]; });
def('ghostChair', { seatH: 1.55 }, function (b, o) {                                            // office (p546): clear acrylic chair
  var sH = o.seatH; b.rbox('acrylic33', 1.5, 0.08, 1.45, 0.05, 0, sH, 0.85, { seg: 2 }); b.rbox('acrylic33', 1.45, 1.25, 0.08, 0.08, 0, sH + 0.7, 0.18, { seg: 2, rx: -0.1 });
  [[-0.65, 0.2], [0.65, 0.2], [-0.65, 1.5], [0.65, 1.5]].forEach(function (p) { b.rod('acrylic33', [p[0] * 1.05, 0, p[1] + (p[1] > 1 ? 0.08 : -0.05)], [p[0], sH, p[1]], 0.04, 8); });
}, function (o) { return [1.5, 1.6, o.seatH + 1.35]; });
def('cubeShelf', { cols: 2, rows: 2, cell: 1.1, d: 1.3 }, function (b, o) {                     // office (p544): white 2x2 cube unit
  var w = o.cols * o.cell + 0.06 * (o.cols + 1), h = o.rows * o.cell + 0.06 * (o.rows + 1), d = o.d, t = 0.06, i;
  b.bb('paintWhite33', -w / 2, 0, 0, w / 2, t, d); b.bb('paintWhite33', -w / 2, h - t, 0, w / 2, h, d); b.bb('paintWhite33', -w / 2, 0, 0, w / 2, h, 0.02);
  for (i = 0; i <= o.cols; i++) { var x = -w / 2 + i * (o.cell + t); b.bb('paintWhite33', x, 0, 0, x + t, h, d); }
  for (i = 1; i < o.rows; i++) { var y = i * (o.cell + t); b.bb('paintWhite33', -w / 2, y, 0, w / 2, y + t, d); }
}, function (o) { return [o.cols * o.cell + 0.06 * (o.cols + 1), o.d, o.rows * o.cell + 0.06 * (o.rows + 1)]; });
def('toyBlocks', { mountY: 0 }, function (b, o) {                                                // office desk (p545): stacked wooden blocks
  var y = o.mountY; [[0, 0, 0], [0.32, 0, 0.1], [0.12, 0.25, -0.05]].forEach(function (q, i) { b.box(i === 2 ? 'oakPale' : 'midWood33', 0.28, 0.25, 0.28, q[0], y + 0.125 + q[1], 0.25 + q[2], 0.3 * i); });
}, function (o) { return [0.7, 0.5, o.mountY + 0.5]; });
// lounge
def('bistroTable', { dia: 3.4, h: 2.45 }, function (b, o) {                                      // lounge (p538): round glass top on a white tulip base
  var R0 = o.dia / 2; b.cyl('glassTop33', R0, R0, 0.04, 0, o.h - 0.02, R0, 48);
  b.lathe('paintWhite33', [[0, 0], [R0 * 0.42, 0], [R0 * 0.4, 0.06], [R0 * 0.15, 0.3], [0.1, 0.8], [0.1, o.h - 0.35], [0.3, o.h - 0.05], [0, o.h - 0.05]], 40, 0, 0, R0);
}, function (o) { return [o.dia, o.dia, o.h]; });
def('wishboneChair', { seatH: 1.45 }, function (b, o) {                                          // lounge (p538): black wishbone chair, natural cord seat
  var sH = o.seatH, F = 'blackMatte33'; b.rbox('cord33', 1.55, 0.09, 1.35, 0.03, 0, sH, 0.95, { seg: 1 });
  [[-0.7, 1.6], [0.7, 1.6]].forEach(function (p) { b.rod(F, [p[0], 0, p[1]], [p[0] * 0.95, sH, p[1] - 0.08], 0.05, 8); });
  [-0.68, 0.68].forEach(function (x) { b.tube(F, [[x, 0, 0.35], [x * 0.98, sH * 0.7, 0.32], [x * 0.85, sH + 0.62, 0.22]], 0.05, 10, 6); });
  b.tube(F, [[-0.7, sH + 0.62, 0.32], [-0.45, sH + 0.72, 0.06], [0, sH + 0.76, 0], [0.45, sH + 0.72, 0.06], [0.7, sH + 0.62, 0.32]], 0.045, 24, 6);
  b.tube(F, [[0, sH + 0.05, 0.25], [0, sH + 0.4, 0.12], [-0.12, sH + 0.72, 0.02]], 0.035, 8, 6); b.tube(F, [[0, sH + 0.4, 0.12], [0.12, sH + 0.72, 0.02]], 0.035, 6, 6);
  b.bb(F, -0.72, sH - 0.1, 0.35, 0.72, sH - 0.02, 1.62);
}, function (o) { return [1.6, 1.75, o.seatH + 0.8]; });
def('wallMirror:grid', { dia: 2.6, mountY: 5.6, depth: 0.08 }, function (b, o) {                  // lounge (p538): round black frame, window-grid muntins
  var R0 = o.dia / 2, y = o.mountY, z = o.depth; b.torus('blackMatte33', R0 - 0.06, 0.07, 0, y, z, 10, 64); b.cyl('mirrorGlass', R0 - 0.08, R0 - 0.08, 0.02, 0, y, z - 0.02, 64, { rx: HALF });
  for (var i = -2; i <= 2; i++) { var u = i * R0 / 3, L = 2 * Math.sqrt(Math.max(0, (R0 - 0.08) * (R0 - 0.08) - u * u)); b.box('blackMatte33', 0.05, L, 0.04, u, y, z + 0.01); b.box('blackMatte33', L, 0.05, 0.04, 0, y + u, z + 0.01); }
}, function (o) { return [o.dia, o.depth + 0.05, o.mountY + o.dia / 2]; });
def('wallMirror:shell', { dia: 2.0, mountY: 5.6, depth: 0.1 }, function (b, o) {                   // Evie (p561): round mirror, chunky white textured frame
  var R0 = o.dia / 2, y = o.mountY; b.torus('ceramicTex33', R0 - 0.14, 0.15, 0, y, o.depth, 10, 48); b.cyl('mirrorGlass', R0 - 0.26, R0 - 0.26, 0.02, 0, y, o.depth - 0.03, 48, { rx: HALF });
}, function (o) { return [o.dia, o.depth + 0.1, o.mountY + o.dia / 2]; });
def('jarTray', { mountY: 0 }, function (b, o) {                                                   // wet bar (p540/547): wood tray, glass jars (popcorn, candy), two red bottles
  var y = o.mountY; b.bb('midWood33', -1.25, y, 0.05, 1.25, y + 0.08, 1.05, 0.01);
  [[-0.75, 0.55, 0.75, 'popcorn33'], [0.0, 0.55, 0.9, 'popcorn33'], [0.72, 0.5, 0.7, 'wineRed33']].forEach(function (q) { b.cyl(q[3], 0.26, 0.26, q[2] * 0.8, q[0], y + 0.08 + q[2] * 0.4, q[1], 20); b.cyl('glass33', 0.3, 0.3, q[2], q[0], y + 0.08 + q[2] / 2, q[1], 24); b.cyl('glass33', 0.2, 0.2, 0.12, q[0], y + 0.14 + q[2], q[1], 16); });
  [1.1, 0.95].forEach(function (x, i) { b.lathe('wineRed33', [[0, 0], [0.08, 0], [0.08, 0.4], [0.03, 0.55], [0.03, 0.65], [0, 0.65]], 12, x, y + 0.08, 0.3 + i * 0.2); });
}, function (o) { return [2.5, 1.1, o.mountY + 1.2]; });
def('gameTray', { mountY: 0 }, function (b, o) {                                                 // lounge table (p538): lucite tic-tac-toe tray with black / white pieces
  var y = o.mountY; b.box('acrylic33', 1.2, 0.05, 1.0, 0, y + 0.025, 0.5);
  for (var i = 0; i < 5; i++) b.cyl(i % 2 ? 'blackMatte33' : 'capWhite33', 0.11, 0.11, 0.05, -0.36 + (i % 3) * 0.36, y + 0.075, 0.25 + Math.floor(i / 3) * 0.4, 16);
}, function (o) { return [1.2, 1.0, o.mountY + 0.12]; });
def('fruitBasket', { mountY: 0 }, function (b, o) {                                               // kitchen (p501): round woven basket of wine bottles + a wire basket of lemons
  var y = o.mountY; b.cyl('seagrass', 0.75, 0.65, 0.35, 0, y + 0.175, 0.75, 32, { open: true }); b.cyl('seagrass', 0.65, 0.65, 0.03, 0, y + 0.015, 0.75, 24);
  [[-0.3, 0.6, 0.5], [0, 0.85, 0.45], [0.3, 0.6, 0.55]].forEach(function (q) { b.lathe('wineRed33', [[0, 0], [0.12, 0], [0.12, 0.75], [0.04, 0.95], [0.04, 1.15], [0, 1.15]], 12, q[0], y + 0.05, q[1], { rx: q[2] - 0.5 }); });
  for (var i = 0; i < 5; i++) b.sphere('lemon33', 0.13, 0.55 + (i % 3) * 0.2, y + 0.15 + (i > 2 ? 0.2 : 0), 1.25 + (i % 2) * 0.15, 10, 8, { sx: 1.25 });
}, function (o) { return [1.8, 1.6, o.mountY + 1.2]; });
// outdoor
def('outdoorLounge:club', { w: 2.6, d: 2.7, h: 2.5 }, function (b, o) {                         // balcony (p591): dark frame lounge chair, thick cream cushions
  var w = o.w, d = o.d, F = 'frameCharcoal33';
  [-1, 1].forEach(function (s) { b.tube(F, [[s * (w / 2 - 0.08), 0, d - 0.15], [s * (w / 2 - 0.08), 1.7, d - 0.25], [s * (w / 2 - 0.08), 1.95, d * 0.5], [s * (w / 2 - 0.08), 2.1, 0.2], [s * (w / 2 - 0.08), 0, 0.15]], 0.06, 24, 8); });
  b.bb(F, -w / 2 + 0.08, 0.7, 0.2, w / 2 - 0.08, 0.8, d - 0.25);
  b.rbox('cushionCream33', w - 0.25, 0.5, d - 0.45, 0.12, 0, 1.05, 0.3 + (d - 0.45) / 2, { seg: 3, bulge: [0, 0.03, 0] });
  b.rbox('cushionCream33', w - 0.4, 1.3, 0.45, 0.16, 0, 1.85, 0.42, { seg: 3, rx: -0.2, bulge: [0, 0, 0.06] });
}, function (o) { return [o.w, o.d, o.h]; });
def('outdoorSide', { s: 1.5, h: 1.6 }, function (b, o) {                                         // balcony (p591): small dark square side table
  var s = o.s, h = o.h, F = 'frameCharcoal33'; b.bb('blackMatte33', -s / 2, h - 0.06, 0, s / 2, h, s); [[-1, 0.06], [1, 0.06], [-1, s - 0.06], [1, s - 0.06]].forEach(function (p) { b.bb(F, p[0] * (s / 2 - 0.06) - 0.04, 0, p[1] - 0.04, p[0] * (s / 2 - 0.06) + 0.04, h - 0.06, p[1] + 0.04); });
}, function (o) { return [o.s, o.s, o.h]; });
def('wickerSofa:frame', { w: 6.4, d: 2.9, h: 2.4, seats: 3 }, function (b, o) {                 // terrace (p494): black aluminium box frame, white cushions
  var w = o.w, d = o.d, F = 'frameCharcoal33', aw = 0.32, n = o.seats, iw = w - 2 * aw, cw = iw / n;
  [-1, 1].forEach(function (s) { b.bb(F, s * (w / 2 - aw / 2) - aw / 2, 0, 0, s * (w / 2 - aw / 2) + aw / 2, 2.0, d, 0.03); });
  b.bb(F, -w / 2, 0, 0, w / 2, o.h, 0.3, 0.03); b.bb(F, -w / 2 + aw, 0.35, 0.3, w / 2 - aw, 0.6, d - 0.05, 0.02);
  for (var i = 0; i < n; i++) { var x = -iw / 2 + cw * (i + 0.5);
    b.rbox('cushionWhite', cw - 0.04, 0.5, d - 0.4, 0.1, x, 0.85, 0.32 + (d - 0.4) / 2, { seg: 3, bulge: [0, 0.03, 0] });
    b.rbox('cushionWhite', cw - 0.06, 1.25, 0.42, 0.12, x, 1.7, 0.55, { seg: 3, rx: -0.15, bulge: [0, 0, 0.05] }); }
}, function (o) { return [o.w, o.d, o.h]; });
def('outdoorCoffee:black', { w: 3.8, d: 2.2, h: 1.25 }, function (b, o) {                       // terrace (p494): low black slatted coffee table
  var w = o.w, d = o.d, h = o.h, F = 'frameCharcoal33'; for (var i = 0; i < 7; i++) b.bb('blackMatte33', -w / 2 + 0.05, h - 0.1, 0.05 + i * (d - 0.1) / 7, w / 2 - 0.05, h, 0.05 + (i + 0.85) * (d - 0.1) / 7);
  b.bb(F, -w / 2, h - 0.25, 0, w / 2, h - 0.1, d); [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(function (p) { var x = p[0] * (w / 2 - 0.12), z = p[1] ? d - 0.12 : 0.12; b.bb(F, x - 0.1, 0, z - 0.1, x + 0.1, h - 0.25, z + 0.1); });
}, function (o) { return [o.w, o.d, o.h]; });
def('fireBowl', { dia: 2.4, h: 1.0 }, function (b, o) {                                          // terrace edge (p476/482): round concrete fire bowl
  var R0 = o.dia / 2; b.lathe('concrete33', [[0, 0], [R0 * 0.7, 0], [R0, o.h * 0.75], [R0, o.h], [R0 * 0.85, o.h], [R0 * 0.8, o.h * 0.7], [0, o.h * 0.6]], 48, 0, 0, R0);
  b.cyl('blackMatte33', R0 * 0.78, R0 * 0.78, 0.04, 0, o.h * 0.62, R0, 40);
}, function (o) { return [o.dia, o.dia, o.h]; });
// rugs + art (one material per piece, same geometry as STAGE)
def('rug2:33', { w: 8, d: 10, pattern: 'jute', thick: 0.03 }, function (b, o) {
  var km = rugMat(o); b.useMaterial(km[0], km[1]); b.add(km[0], new THREE.BoxGeometry(o.w, o.thick, o.d), M(0, o.thick / 2 + 0.003, o.d / 2), { keepUV: true });
}, function (o) { return [o.w, o.d, o.thick]; });
def('art:33', { w: 3, h: 3, mountY: 5.2, style: 'plain', seed: 1, frame: 'frameBlack', mat: 0, depth: 0.1, fw: 0.06 }, function (b, o) {
  var w = o.w, h = o.h, y = o.mountY, t = o.fw, dz = o.depth, km = artMat(o);
  if (o.frame) { b.bb(o.frame, -w / 2, y - h / 2, 0, w / 2, y - h / 2 + t, dz); b.bb(o.frame, -w / 2, y + h / 2 - t, 0, w / 2, y + h / 2, dz);
    b.bb(o.frame, -w / 2, y - h / 2, 0, -w / 2 + t, y + h / 2, dz); b.bb(o.frame, w / 2 - t, y - h / 2, 0, w / 2, y + h / 2, dz); }
  var iw = w - (o.frame ? 2 * t : 0), ih = h - (o.frame ? 2 * t : 0);
  if (o.mat) { b.box('matBoard', iw, ih, 0.01, 0, y, dz - 0.03); iw -= 2 * o.mat; ih -= 2 * o.mat; }
  b.useMaterial(km[0], km[1]); b.add(km[0], new THREE.PlaneGeometry(iw, ih), M(0, y, dz - 0.02), { keepUV: true });
  b.box(o.frame || 'paintWhite33', iw, ih, 0.02, 0, y, dz - 0.04);
}, function (o) { return [o.w, o.depth, o.mountY + o.h / 2]; });

/* route: kind (+ style / pattern) -> builder key */
var RUG_P = { seagrass: 1, jute: 1, diamondGrey: 1, herringGrey: 1, greyWool: 1, plaidBeige: 1, greyLowPile: 1 };
var ART_S = { geoNeutral: 1, creamField: 1, leafBW: 1, chevron: 1, enso: 1, kidsLoops: 1, letters: 1, days: 1, blank: 1, swirlWhite: 1, blackCream: 1, creamPanel: 1, greyScape: 1, ribbon: 1 };
function route(kind, o) {
  if (K[kind]) return kind;
  if (kind === 'rug2' && RUG_P[o.pattern]) return 'rug2:33';
  if (kind === 'art' && ART_S[o.style]) return 'art:33';
  if (o.style && K[kind + ':' + o.style]) return kind + ':' + o.style;
  return null;
}
var _make = STAGE.make;
STAGE.make = function (kind, o) {
  o = o || {}; var k = route(kind, o); if (!k) return _make.apply(this, arguments);
  var D = K[k], oo = opt(D.defaults, o), b = new Builder(); D.build(b, oo);
  var g = b.build(kind); g.userData = { kind: kind, category: 'furniture', opts: oo, size: D.size(oo), s33: k }; return g;
};
var _has = STAGE.has; STAGE.has = function (kind) { return !!K[kind] || _has.apply(this, arguments); };

/* ------------------------------------------------------------ the 10/31 staging table (plan px like STAGING; upper rooms: upper-plan px) */
function rows(h) {
  var LS = h.LOUNGE_SPEC, A = h.p23At, Y = h.p23Yaw, R = [];
  function add() { for (var i = 0; i < arguments.length; i++) R.push(arguments[i]); }
  // GREAT ROOM (model room 'living'; p495, p496, p497, p533): curved bouclé sofa on the window wall between white fluted oval tables with
  // clear-glass lamps, two bouclé barrel chairs across the cream oval coffee table, white marble tulip table, seagrass rug, one large
  // grey / cream / black abstract on the closet wall. The glass console and prints of the Dec 2025 staging are gone.
  add(['living', 'rug2', { w: 12, d: 9.2, pattern: 'seagrass' }, [1470, 1838], 's'],
    ['living', 'sofa3', { style: 'curve', w: 8.2, d: 3.3 }, [1458, 1695], 's', { key: 'gS' }],
    ['living', 'pillows', { mountY: 1.35, lean: -0.3, items: [['pillowBlack', -2.45, 1.5, 1.5, 0.15], ['stripeBW33', -1.25, 1.45, 1.45, 0.05], ['stripeBW33', 1.25, 1.45, 1.45, -0.05], ['pillowBlack', 2.45, 1.5, 1.5, -0.15]] }, 0, 's', { on: 'gS', z: 0.9 }],
    ['living', 'woodSideTable', { style: 'fluted', w: 1.9, d: 1.3 }, [1316, 1690], 's', { key: 'gL' }],
    ['living', 'lamp', { style: 'glassCyl' }, 0, 's', { on: 'gL' }],
    ['living', 'woodSideTable', { style: 'fluted', w: 1.9, d: 1.3 }, [1600, 1690], 's', { key: 'gR' }],
    ['living', 'lamp', { style: 'glassCyl' }, 0, 's', { on: 'gR' }],
    ['living', 'drumTable', { style: 'oval', w: 4.8, d: 2.0 }, [1475, 1822], 's', { key: 'gC' }],
    ['living', 'ringSculpture', {}, 0, 's', { on: 'gC', dx: -0.9 }],
    ['living', 'succulent', { pot: 'bowl', dia: 0.75 }, 0, 's', { on: 'gC', dx: 0.15, dz: -0.15 }],
    ['living', 'books', { n: 2 }, 0, 's', { on: 'gC', dx: 1.25, dz: 0.1 }],
    ['living', 'armchairBoucle', { fabric: 'boucleCream', legs: 'blackMetal' }, [1402, 1925], 150, { key: 'gA1' }],
    ['living', 'pillows', { mountY: 1.45, lean: -0.28, items: [['pillowBlack', 0, 1.45, 1.35]] }, 0, 's', { on: 'gA1', z: 0.42 }],
    ['living', 'armchairBoucle', { fabric: 'boucleCream', legs: 'blackMetal' }, [1550, 1925], 210, { key: 'gA2' }],
    ['living', 'pillows', { mountY: 1.45, lean: -0.28, items: [['stripeBW33', 0, 1.4, 1.3]] }, 0, 's', { on: 'gA2', z: 0.42 }],
    ['living', 'woodSideTable', { style: 'tulip', dia: 1.6 }, [1476, 1990], 'n', { key: 'gT' }],
    ['living', 'decorBox', { w: 0.6, d: 0.45, h: 0.25, mat: 'ceramicGrey' }, 0, 'n', { on: 'gT' }],
    ['living', 'art', { w: 3.9, h: 4.9, mountY: 5.0, style: 'geoNeutral', seed: 1, frame: 'frameBlack', fw: 0.06 }, [1666, 1810], 'w', { back: true }]);
  // DINING (in 'great'; p498, p516): round grey-washed pedestal table, two slipper-arm chairs at the ends, two side chairs, black bowl
  add(['great', 'diningTableGlass', { style: 'pedestalRound', dia: 4.2 }, [1585, 2470], 's', { key: 'dn' }],
    ['great', 'bowl', { dia: 1.5, h: 0.5, foot: false, handles: false, mat: 'ceramicBlack' }, 0, 's', { on: 'dn' }],
    ['great', 'parsonsChair', { style: 'slipper', arms: true }, [1658, 2470], 'w'], ['great', 'parsonsChair', { style: 'slipper', arms: true }, [1512, 2470], 'e'],
    ['great', 'parsonsChair', { style: 'slipper' }, [1560, 2408], 's'], ['great', 'parsonsChair', { style: 'slipper' }, [1610, 2408], 's']);
  // FRONT LIVING (sitting area in 'great'; p506, p507, p514, p515, p505): cream L-sectional (return along the big window), mudcloth / black /
  // brown pillows, round light-oak drum table with a moss bowl, two dark egg vases + books, grey diamond rug, two-tier oak tables with
  // white gourd lamps at both ends, cream abstract over the sectional and a second one on the bedroom-door wall. No sideboard, poufs or ottoman.
  add(['great', 'rug2', { w: 8.5, d: 10, pattern: 'diamondGrey' }, [1570, 2738], 'e'],
    ['great', 'sectional', { w: 9, ret: 6.8, side: 1, fabric: 'linenCream', pillows: ['mudcloth33', 'pillowBrown33', 'pillowBlack'] }, [1553, 2781], 'n', { key: 'sec' }],
    ['great', 'pillows', { mountY: 1.3, lean: -0.3, items: [['mudcloth33', -0.2, 1.4, 1.4, 0.15], ['pillowBlack', 1.1, 1.35, 1.35, -0.1]] }, 0, 'n', { on: 'sec', dx: 2.1, z: 1.1 }],
    ['great', 'throwDrape', { w: 1.3, len: 0.6, drop: 1.5, mountY: 2.05, ry: -Math.PI / 2, mat: 'mudcloth33' }, 0, 'n', { on: 'sec', dx: -3.92, z: 1.75 }],
    ['great', 'drumTable', { style: 'woodDrum', dia: 3.6 }, [1590, 2690], 's', { key: 'ct' }],
    ['great', 'bowl', { style: 'moss', dia: 1.35, h: 0.55 }, 0, 's', { on: 'ct', dx: -0.55, dz: -0.3 }],
    ['great', 'vase2', { style: 'egg', h: 1.35, dia: 0.8 }, 0, 's', { on: 'ct', dx: 0.6, dz: -0.55 }],
    ['great', 'books', { n: 2 }, 0, 's', { on: 'ct', dx: 0.35, dz: 0.8 }],
    ['great', 'woodSideTable', { style: 'tier', dia: 1.8 }, [1722, 2843], 'n', { key: 'st1' }],
    ['great', 'lamp', { style: 'urn', h: 2.3 }, 0, 'n', { on: 'st1' }],
    ['great', 'woodSideTable', { style: 'tier', dia: 1.8 }, [1462, 2600], 'n', { key: 'st2' }],
    ['great', 'lamp', { style: 'urn', h: 2.3 }, 0, 'n', { on: 'st2' }],
    ['great', 'art', { w: 3.4, h: 4.6, mountY: 5.4, style: 'creamField', seed: 2, frame: 'frameBlack', fw: 0.05 }, [1486, 2882], 'n', { back: true }],
    ['great', 'art', { w: 3.4, h: 4.6, mountY: 5.3, style: 'creamField', seed: 5, frame: 'frameBlack', fw: 0.05 }, [1750, 2650], 'w', { back: true }]);
  // KITCHEN (p501, p503, p504): styled only - black canisters by the sink, glass jars on the back counter, a basket of wine + lemons
  add(['kitchen', 'counterStoolRope', { style: 'cream' }, 0, 180, { bim: [16.957, 8.0] }], ['kitchen', 'counterStoolRope', { style: 'cream' }, 0, 180, { bim: [16.957, 9.62] }],
    ['kitchen', 'counterStoolRope', { style: 'cream' }, 0, 180, { bim: [16.957, 11.24] }], ['kitchen', 'counterStoolRope', { style: 'cream' }, 0, 180, { bim: [16.957, 12.86] }],
    ['kitchen', 'canisters', { n: 3, dia: 0.4 }, [1478, 2290], 'e', { drop: true }],
    ['kitchen', 'fruitBasket', {}, [1478, 2125], 'e', { drop: true }],
    ['kitchen', 'vase2', { style: 'cylinder', h: 0.9, dia: 0.5, n: 3, gap: 0.08, mat: 'glassClear', hs: [1, 0.8, 0.9] }, [1560, 2057], 's', { drop: true }]);
  // FRONT BEDROOM (fan; old staging 'b3'; p508, p511, p512): white bed, cream geometric quilt, white + brown pillows, grey wood nightstands with
  // textured white lamps, grey herringbone rug, white slipper chair + round oak table by the street windows, two jute poufs, grey landscape print
  add(['mainbeds', 'rug2', { w: 6, d: 9, pattern: 'herringGrey' }, [1909, 2715], 's'],
    ['mainbeds', 'bedQueen', { upholstery: 'linenCream', channels: false, shamMat: 'linenWhite', accentMat: 'pillowBrown33', throwBlanket: false }, [1909, 2664], 's', { key: 'fb' }],
    ['mainbeds', 'pillows', { mountY: 1.88, lean: -0.38, items: [['linenWhite', -0.8, 1.45, 1.45, 0.1], ['linenWhite', 0.8, 1.45, 1.45, -0.1]] }, 0, 's', { on: 'fb', z: 1.0 }],
    ['mainbeds', 'bedRunner', { w: 5.6, d: 2.6, drop: 1.0, mountY: 2.0, mat: 'creamGeo33' }, 0, 's', { on: 'fb', z: 3.9 }],
    ['mainbeds', 'nightstand', { w: 1.8, legs: false, finish: 'greyWood33', hw: 'blackMetal', pull: 'bar' }, [1812, 2580], 's', { key: 'fbL' }],
    ['mainbeds', 'lamp', { style: 'urn', h: 2.1, shade: 'linenOat33' }, 0, 's', { on: 'fbL' }],
    ['mainbeds', 'nightstand', { w: 1.8, legs: false, finish: 'greyWood33', hw: 'blackMetal', pull: 'bar' }, [2006, 2580], 's', { key: 'fbR' }],
    ['mainbeds', 'lamp', { style: 'urn', h: 2.1 }, 0, 's', { on: 'fbR' }],
    ['mainbeds', 'slipChair', { fabric: 'linenWhite' }, [2000, 2832], 225, { key: 'fbC' }],
    ['mainbeds', 'pillows', { mountY: 1.6, lean: -0.25, items: [['linenOat33', 0, 1.3, 1.2]] }, 0, 's', { on: 'fbC', z: 0.5 }],
    ['mainbeds', 'pouf', { style: 'round', dia: 1.6 }, [1872, 2845], 's'], ['mainbeds', 'pouf', { style: 'round', dia: 1.6 }, [1928, 2848], 's'],
    ['mainbeds', 'art', { w: 2.4, h: 3.0, mountY: 5.2, style: 'greyScape', seed: 3, frame: 'frameSilver', fw: 0.05 }, [1767, 2660], 'e', { back: true }]);
  // MIDDLE BEDROOM L1-S05 staged as office / gym (p525-531): black oval desk with a white chair + bouclé chair, column lamp and olive tree in the
  // window corner, leaf print; two black yoga mats with towels, dumbbells and Voss water, grey balls, reclaimed bench under the black chevron
  // print, woven basket of rolled mats, two tall leaning mirrors on the hall-door wall
  add(['mainbeds', 'ovalDesk', { w: 4.2, d: 2.0, h: 2.5, mat: 'blackMatte33' }, [1928, 1858], 'w', { key: 'gD' }],
    ['mainbeds', 'lamp', { style: 'column', h: 2.25 }, 0, 'w', { on: 'gD', dx: -1.3 }],
    ['mainbeds', 'succulent', { pot: 'bowl', dia: 0.6 }, 0, 'w', { on: 'gD', dx: 0.2 }],
    ['mainbeds', 'books', { n: 2 }, 0, 'w', { on: 'gD', dx: 1.15 }],
    ['mainbeds', 'slipChair', { fabric: 'linenWhite' }, [1978, 1858], 'w'],
    ['mainbeds', 'armchairBoucle', { w: 2.4, d: 2.3, h: 2.3, fabric: 'boucleCream', legs: 'blackMetal' }, [1928, 1767], 's'],
    ['mainbeds', 'plantPot', { type: 'olive', h: 6, potDia: 1.4, seed: 4 }, [1968, 1772], 's'],
    ['mainbeds', 'art', { w: 2.8, h: 2.8, mountY: 5.6, style: 'leafBW', seed: 4, frame: 'frameBlack', fw: 0.05 }, [2008, 1858], 'w', { back: true }],
    ['mainbeds', 'yogaMat', { d: 5.2 }, [1818, 1950], 's'], ['mainbeds', 'yogaMat', { d: 5.2, dumbbells: false }, [1872, 1950], 's'],
    ['mainbeds', 'vossBottles', { n: 2 }, [1872, 2005], 's'],
    ['mainbeds', 'bench', { style: 'wood', w: 4.2 }, [1777, 1955], 'e', { key: 'gB' }],
    ['mainbeds', 'vossBottles', { n: 3 }, 0, 'e', { on: 'gB', dx: 1.2 }],
    ['mainbeds', 'art', { w: 3.0, h: 4.4, mountY: 5.5, style: 'chevron', seed: 6, frame: 'frameBlack', fw: 0.05, mat: 0.18 }, [1753, 1955], 'e', { back: true }],
    ['mainbeds', 'yogaBall', { style: 'grey', dia: 1.75 }, [1784, 1870], 'e'] /* v33merge M2 */, ['mainbeds', 'yogaBall', { style: 'grey', dia: 1.75 }, [1830, 1855], 'e'],
    ['mainbeds', 'basket', { style: 'mats' }, [1875, 1752], 's'],
    ['mainbeds', 'floorMirror', { frame: 'frameSilver', w: 1.9, h: 6.2 }, [2008, 1945], 'w', { back: true }],
    ['mainbeds', 'floorMirror', { frame: 'frameSilver', w: 1.9, h: 6.2 }, [2008, 1998], 'w', { back: true }]);
  // r38 MIDDLE BEDROOM (model BED2, at the end of the bedroom hall; not in the 10/31 photos, so it stood empty and read as unfinished once it
  // became a tour stop): a simple guest-room set in the house palette. Queen bed against the south wall with its back to the front bedroom,
  // white linen with oat pillows, grey wood nightstands with urn lamps, a grey wool rug, one grey landscape print over the bed. The closet
  // doors (west wall), the hall door's swing and the window (east wall) stay clear.
  add(['mainbeds', 'rug2', { w: 6, d: 8, pattern: 'greyWool' }, [2015, 2378], 'n'],
    ['mainbeds', 'bedQueen', { upholstery: 'linenWhite', channels: false, shamMat: 'linenWhite', accentMat: 'pillowTaupe33', throwBlanket: false }, [2015, 2428], 'n', { key: 'mb' }],
    ['mainbeds', 'pillows', { mountY: 1.88, lean: -0.38, items: [['linenOat33', -0.8, 1.45, 1.45, 0.1], ['linenOat33', 0.8, 1.45, 1.45, -0.1]] }, 0, 'n', { on: 'mb', z: 1.0 }],
    ['mainbeds', 'bedRunner', { w: 5.6, d: 2.4, drop: 1.0, mountY: 2.0, mat: 'linenOat33' }, 0, 'n', { on: 'mb', z: 4.0 }],
    ['mainbeds', 'nightstand', { w: 1.8, legs: false, finish: 'greyWood33', hw: 'blackMetal', pull: 'bar' }, [1918, 2508], 'n', { key: 'mbL' }],
    ['mainbeds', 'lamp', { style: 'urn', h: 2.1, shade: 'linenOat33' }, 0, 'n', { on: 'mbL' }],
    ['mainbeds', 'nightstand', { w: 1.8, legs: false, finish: 'greyWood33', hw: 'blackMetal', pull: 'bar' }, [2112, 2508], 'n', { key: 'mbR' }],
    ['mainbeds', 'lamp', { style: 'urn', h: 2.1, shade: 'linenOat33' }, 0, 'n', { on: 'mbR' }],
    ['mainbeds', 'art', { w: 3.6, h: 2.4, mountY: 5.6, style: 'greyScape', seed: 21, frame: 'frameSilver', fw: 0.05 }, [2015, 2539], 'n', { back: true }]);
  // HALL BATH (unchanged from the listing staging; hardware is built-in)
  add(['mainbath', 'succulent', { pot: 'bowl', dia: 0.9 }, [2010, 2062], 's', { drop: true }],
    ['mainbath', 'soapPump', {}, [2050, 2054], 's', { drop: true }],
    ['mainbath', 'towelStack', { n: 1, w: 0.6, d: 0.5, t: 0.14 }, [2062, 2064], 's', { drop: true }],
    ['mainbath', 'towelBar', { w: 2, mountY: 4.5, finish: 'nickel' }, [2138, 2072], 'w', { back: true, fixture: true, key: 'mbB1' }],
    ['mainbath', 'towelHang', { style: 'bar', w: 1.55, drop: 1.6, mountY: 4.5 }, 0, 'w', { on: 'mbB1', z: 0 }],
    ['mainbath', 'towelBar', { w: 2.5, mountY: 3.7, finish: 'nickel' }, [2138, 2160], 'w', { back: true, fixture: true, key: 'mbB2' }],
    ['mainbath', 'towelHang', { style: 'bar', w: 1.1, drop: 1.55, mountY: 3.7 }, 0, 'w', { on: 'mbB2', z: 0, dx: -0.6 }],
    ['mainbath', 'towelHang', { style: 'bar', w: 1.1, drop: 1.55, mountY: 3.7 }, 0, 'w', { on: 'mbB2', z: 0, dx: 0.6 }],
    ['mainbath', 'towelRing', { mountY: 4.1 }, [2092, 2026], 's', { back: true, fixture: true, key: 'mbR' }],
    ['mainbath', 'towelHang', { style: 'ring', w: 0.8, drop: 1.05, mountY: 3.6, z: 0.15 }, 0, 's', { on: 'mbR', z: 0 }]);
  // ENTRY + STAIR HALL (p535, p572): reclaimed grey-wood console with two white vases + books under the white swirl canvas (where the shoe
  // bench stood), woven basket with a cream throw at the top of the lower stair; the round entry mirror stays
  add(['entry', 'wallMirror', { dia: 2.5, mountY: 5.5 }, [1004, 1930], 'e', { back: true }],
    ['stairs', 'consoleTable', { style: 'slab', w: 4.8 }, [870, 1861], 'n', { key: 'sc' }],
    ['stairs', 'vase2', { style: 'round', h: 1.25, dia: 0.75, n: 2, gap: 0.1, mat: 'ceramicWhite', hs: [1, 0.8] }, 0, 'n', { on: 'sc', dx: -1.2 }],
    ['stairs', 'books', { n: 3 }, 0, 'n', { on: 'sc', dx: 1.3 }],
    ['stairs', 'art', { w: 4.6, h: 3.6, mountY: 5.6, style: 'swirlWhite', seed: 7, frame: 'frameOak', fw: 0.06 }, [870, 1884], 'n', { back: true }],
    ['stairs', 'basket', { dia: 1.6, h: 1.2 }, [951, 1761], 's', { key: 'sb' }],   // r5 (agentA, owner r5 #4; photos IMG_0535/IMG_0572): on the main landing at the foot of the up-flight, against the down-stair rail - [985, 1688] put it on the ST-UP1 treads (only its throw showed, as a pad on a tread)
    ['stairs', 'throwDrape', { w: 1.2, len: 0.9, drop: 1.0, mountY: 1.2, mat: 'linenOat33', fringe: true }, 0, 's', { on: 'sb', z: 0.4 }]);
  // LOWER LOUNGE (model room 'rec'; p538, p539, p540, p547): round glass bistro table + four black wishbone chairs by the slider, striped vases
  // and a tic-tac-toe tray, two black / cream geometric cube poufs under the large ensō canvas, round grid mirror, jar tray on the wet bar.
  // Floor stays tile (owner 11/2); a large light-grey low-pile area rug covers the open floor from the bar walkway to the slider.
  add(['rec', 'rug2', { w: 9, d: 12, pattern: 'greyLowPile' }, [872, 1392], 's'],
    ['rec', 'bistroTable', { dia: 3.4 }, [915, 1300], 's', { key: 'lt' }],
    ['rec', 'vase2', { style: 'round', h: 1.0, dia: 0.62, n: 2, gap: 0.05, mat: 'ceramicStripe', hs: [1, 0.75] }, 0, 's', { on: 'lt', dx: -0.45 }],
    ['rec', 'gameTray', {}, 0, 's', { on: 'lt', dx: 0.5, dz: 0.2 }],
    ['rec', 'wishboneChair', {}, [915, 1242], 's'], ['rec', 'wishboneChair', {}, [915, 1358], 'n'], ['rec', 'wishboneChair', {}, [857, 1300], 'e'], ['rec', 'wishboneChair', {}, [973, 1300], 'w'],
    ['rec', 'pouf', { style: 'cube' }, [830, 1538], 'n'], ['rec', 'pouf', { style: 'cube' }, [880, 1540], 'n'],
    ['rec', 'art', { w: 4.4, h: 4.4, mountY: 5.0, style: 'enso', seed: 8, frame: false, depth: 0.14 }, [855, 1568], 'n', { back: true }],
    ['rec', 'wallMirror', { style: 'grid', dia: 2.6, mountY: 5.5 }, [940, 1212], 's', { back: true }],
    ['rec', 'jarTray', {}, [732, 1345], 'e', { drop: true }]);
  // EVIE'S (two windows, model room 'lbed1'; p559-p564): bed under the window, white + navy pillows, blue-grey block-print coverlet,
  // mirrored nightstands with textured lamps, jute rug, white circle cabinet with a plant + vases + box under a round white mirror
  add(['lbed1', 'rug2', { w: 8, d: 10, pattern: 'jute' }, [865, 728], 's'],
    ['lbed1', 'bedQueen', { upholstery: 'linenWhite', accentMat: 'pillowNavy33', shamMat: 'linenWhite', throwBlanket: false }, [865, 672], 's', { key: 'eB' }],
    ['lbed1', 'pillows', { mountY: 1.88, lean: -0.38, items: [['pillowNavy33', -1.05, 1.4, 1.4, 0.12], ['linenOat33', 0, 1.35, 1.35, 0], ['pillowNavy33', 1.05, 1.4, 1.4, -0.12]] }, 0, 's', { on: 'eB', z: 1.05 }],
    ['lbed1', 'bedRunner', { w: 5.6, d: 4.4, drop: 1.15, mountY: 2.0, mat: 'blueDot33' }, 0, 's', { on: 'eB', z: 2.9 }],
    ['lbed1', 'nightstand', { style: 'mirrored', w: 1.6, d: 1.3 }, [768, 600], 's', { key: 'eL' }],
    ['lbed1', 'lamp', { style: 'urn', h: 2.4, base: 'ceramicGreyTex33', shade: 'linenOat33' }, 0, 's', { on: 'eL' }],
    ['lbed1', 'nightstand', { style: 'mirrored', w: 1.6, d: 1.3 }, [962, 600], 's', { key: 'eR' }],
    ['lbed1', 'lamp', { style: 'urn', h: 2.4, base: 'ceramicGreyTex33', shade: 'linenOat33' }, 0, 's', { on: 'eR' }],
    ['lbed1', 'sideboard', { style: 'circle', w: 4.0 }, [935, 886], 'n', { key: 'eC' }],
    ['lbed1', 'succulent', { pot: 'square', dia: 0.6 }, 0, 'n', { on: 'eC', dx: -1.3 }],
    ['lbed1', 'vase2', { style: 'ribbed', h: 0.8, dia: 0.5, n: 2, gap: 0.05, mat: 'ceramicGreyTex33', hs: [1, 0.75] }, 0, 'n', { on: 'eC', dx: -0.5 }],
    ['lbed1', 'decorBox', { w: 0.8, d: 0.55, h: 0.35 }, 0, 'n', { on: 'eC', dx: 1.1 }],
    ['lbed1', 'wallMirror', { style: 'shell', dia: 2.0, mountY: 5.5 }, [935, 912], 'n', { back: true }]);
  // JOSIE'S (one window, model room 'lbed2'; p548-p556): bed under the window, grey-striped duvet, grey + white pillows, white nightstands
  // with small grey lamps, two charcoal knit poufs at the foot, grey rug, glass waterfall console with two vases and a basket under two
  // grey ribbon canvases. The Dec 2025 study (desk, boucle chair, ottoman) is gone.
  add(['lbed2', 'rug2', { w: 6, d: 9, pattern: 'greyWool' }, [575, 990], 's'],
    ['lbed2', 'bedQueen', { upholstery: 'linenWhite', accentMat: 'pillowCharcoal33', shamMat: 'linenWhite', throwBlanket: false }, [575, 938], 's', { key: 'jB' }],
    ['lbed2', 'pillows', { mountY: 1.88, lean: -0.38, items: [['pillowCharcoal33', -0.9, 1.4, 1.4, 0.12], ['linenWhite', 0, 1.3, 1.3, 0], ['pillowCharcoal33', 0.9, 1.4, 1.4, -0.12]] }, 0, 's', { on: 'jB', z: 1.05 }],
    ['lbed2', 'bedRunner', { w: 5.6, d: 4.9, drop: 1.2, mountY: 2.0, mat: 'duvetStripe33' }, 0, 's', { on: 'jB', z: 2.4 }],
    ['lbed2', 'nightstand', { w: 1.6, d: 1.3, finish: 'cabinetWhite', hw: 'chrome', pull: 'knob', legs: true }, [482, 870], 's', { key: 'jL' }],
    ['lbed2', 'lamp', { style: 'urn', h: 1.9, base: 'ceramicGreyTex33', shadeDia: 1.0, shadeH: 0.7 }, 0, 's', { on: 'jL' }],
    ['lbed2', 'nightstand', { w: 1.6, d: 1.3, finish: 'cabinetWhite', hw: 'chrome', pull: 'knob', legs: true }, [668, 870], 's', { key: 'jR' }],
    ['lbed2', 'lamp', { style: 'urn', h: 1.9, base: 'ceramicGreyTex33', shadeDia: 1.0, shadeH: 0.7 }, 0, 's', { on: 'jR' }],
    ['lbed2', 'pouf', { style: 'round', dia: 1.7, h: 1.35, mat: 'knitDark33' }, [548, 1062], 's'], ['lbed2', 'pouf', { style: 'round', dia: 1.7, h: 1.35, mat: 'knitDark33' }, [602, 1064], 's'],
    ['lbed2', 'consoleTable', { style: 'waterfall', w: 3.6 }, [476, 1040], 'e', { key: 'jC' }],
    ['lbed2', 'vase2', { style: 'cylinder', h: 1.05, dia: 0.42, n: 2, gap: 0.05, mat: 'ceramicStripe', hs: [1, 0.8] }, 0, 'e', { on: 'jC', dx: -0.8 }],
    ['lbed2', 'basket', { dia: 1.3, h: 1.0 }, [478, 1040], 'e'],
    ['lbed2', 'art', { w: 2.9, h: 3.6, mountY: 5.3, style: 'ribbon', seed: 9, frame: 'frameOak', fw: 0.05 }, [452, 990], 'e', { back: true }],
    ['lbed2', 'art', { w: 2.9, h: 3.6, mountY: 5.3, style: 'ribbon', seed: 10, frame: 'frameOak', fw: 0.05 }, [452, 1090], 'e', { back: true }]);
  // SKYLIT OFFICE (p542-p546): white X desk on the right-hand wall under the green / blue abstract, clear lamp, toy blocks, acrylic chair with
  // a navy pillow, white 2x2 cube unit under the alphabet + days posters and a blank oak frame, jute rug. Walls stay Serenely (owner).
  add(['office', 'rug2', { w: 5, d: 7, pattern: 'jute' }, [585, 1700], 's'],
    ['office', 'deskX', { style: 'white', w: 4.2, d: 2.0 }, [654, 1700], 'w', { key: 'oD' }],
    ['office', 'lamp', { style: 'clear', h: 2.3 }, 0, 'w', { on: 'oD', dx: 1.4 }],
    ['office', 'toyBlocks', {}, 0, 'w', { on: 'oD', dx: -0.9 }],
    ['office', 'books', { n: 2 }, 0, 'w', { on: 'oD', dx: 0.2 }],
    ['office', 'ghostChair', {}, [608, 1700], 'e', { key: 'oC' }],
    ['office', 'pillows', { mountY: 1.6, lean: -0.25, items: [['pillowNavy33', 0, 1.2, 1.1]] }, 0, 'e', { on: 'oC', z: 0.3 }],
    ['office', 'art', { w: 3.2, h: 3.4, mountY: 5.6, style: 'kidsLoops', seed: 11, frame: 'frameOak', fw: 0.05 }, [680, 1700], 'w', { back: true }],
    ['office', 'cubeShelf', {}, [497, 1640], 'e', { key: 'oS' }],
    ['office', 'vase2', { style: 'cylinder', h: 0.6, dia: 0.4, n: 2, gap: 0.1, mat: 'glassClear' }, 0, 'e', { on: 'oS' }],
    ['office', 'art', { w: 1.8, h: 2.3, mountY: 5.0, style: 'letters', seed: 12, frame: 'frameOak', fw: 0.05 }, [466, 1615], 'e', { back: true }],
    ['office', 'art', { w: 1.5, h: 2.0, mountY: 4.5, style: 'days', seed: 13, frame: 'frameOak', fw: 0.05 }, [466, 1672], 'e', { back: true }],
    ['office', 'art', { w: 2.0, h: 2.0, mountY: 6.0, style: 'blank', seed: 14, frame: 'frameOak', fw: 0.05 }, [466, 1672], 'e', { back: true }]);
  // LOWER BATH (unchanged)
  add(['lbath', 'towelRing', { mountY: 4.0 }, [1013, 988], 'w', { back: true, fixture: true, key: 'lbR1' }],
    ['lbath', 'towelBar', { w: 1.5, mountY: 2.0, finish: 'nickel' }, 0, 'w', { bim: [-30.15, -10.74], back: true, fixture: true, key: 'lbT22' }],
    ['lbath', 'towelHang', { style: 'ring', w: 0.8, drop: 1.05, mountY: 3.5, z: 0.15 }, 0, 'w', { on: 'lbR1', z: 0 }],
    ['lbath', 'towelRing', { mountY: 4.0 }, [1013, 1018], 'w', { back: true, fixture: true, key: 'lbR2' }],
    ['lbath', 'towelHang', { style: 'ring', w: 0.8, drop: 1.05, mountY: 3.5, z: 0.15 }, 0, 'w', { on: 'lbR2', z: 0 }],
    ['lbath', 'succulent', { pot: 'square', dia: 0.65 }, [946, 950], 's', { drop: true }],
    ['lbath', 'towelStack', { n: 2, w: 0.75, t: 0.13, roll: true }, [922, 952], 's', { drop: true }]);
  // PRIMARY (p585-p593): cream tufted king, cream / taupe bedding with a fringed cream throw, dark-wood nightstands with stacked-ring white
  // lamps, cream bench, beige plaid rug, chevron-front reclaimed dresser under the north window, gold leaning mirror, large cream canvas
  add(['primary', 'rug2', { w: 12, d: 9, pattern: 'plaidBeige' }, [1995, 720], 'e'],
    ['primary', 'bedKing', { upholstery: 'linenCream', channels: false, accentMat: 'pillowTaupe33', shamMat: 'linenWhite', throwBlanket: false }, [1939, 720], 'e', { key: 'pB' }],
    ['primary', 'pillows', { mountY: 1.88, lean: -0.38, items: [['pillowTaupe33', -1.4, 1.5, 1.5, 0.12], ['linenOat33', 0, 1.45, 1.45, 0], ['pillowTaupe33', 1.4, 1.5, 1.5, -0.12]] }, 0, 'e', { on: 'pB', z: 1.05 }],
    ['primary', 'bedRunner', { w: 6.85, d: 3.4, drop: 1.05, mountY: 2.0, mat: 'linenOat33' }, 0, 'e', { on: 'pB', z: 3.85 }],
    ['primary', 'throwDrape', { w: 1.5, len: 3.6, drop: 1.6, mountY: 2.06, mat: 'cushionCream33', fringe: true }, 0, 'e', { on: 'pB', z: 3.7 }],
    ['primary', 'nightstand', { w: 2.3, d: 1.6, h: 2.2, legs: false, finish: 'darkWood33', hw: 'blackMetal', pull: 'bar' }, [1863, 598], 'e', { key: 'pL' }],
    ['primary', 'lamp', { style: 'rings', h: 2.35 }, 0, 'e', { on: 'pL' }],
    ['primary', 'nightstand', { w: 2.3, d: 1.6, h: 2.2, legs: false, finish: 'darkWood33', hw: 'blackMetal', pull: 'bar' }, [1863, 842], 'e', { key: 'pR' }],
    ['primary', 'lamp', { style: 'rings', h: 2.35 }, 0, 'e', { on: 'pR' }],
    ['primary', 'bench', { w: 5, fabric: 'cushionCream33', legs: 'woodDark' }, [2072, 720], 'e'],
    ['primary', 'sideboard', { style: 'chevron', w: 5.6 }, [2218, 725], 'w', { key: 'pS' }],
    ['primary', 'plantPot', { type: 'olive', h: 1.7, potDia: 0.75, seed: 7 }, 0, 'w', { on: 'pS', dx: -1.7 }],
    ['primary', 'vase2', { style: 'cylinder', h: 0.75, dia: 0.4, n: 1, mat: 'ceramicWhite' }, 0, 'w', { on: 'pS', dx: -1.0 }],
    ['primary', 'books', { n: 2 }, 0, 'w', { on: 'pS', dx: 1.5 }],
    ['primary', 'floorMirror', { frame: 'gold33', w: 2.4, h: 5.8 }, [2195, 578], 'w', { back: true }],
    ['primary', 'art', { w: 3.6, h: 4.8, mountY: 5.6, style: 'creamPanel', seed: 15, frame: 'greyWood33', fw: 0.08 }, [2100, 913], 'n', { back: true }]);
  // PRIMARY BATH (unchanged)
  add(['pbath', 'trayRound', { dia: 1.3 }, [2142, 948], 's', { drop: true, key: 'pbT' }],
    ['pbath', 'vase2', { style: 'cylinder', h: 1.0, dia: 0.4, n: 2, gap: 0.05, mat: 'ceramicWhite', hs: [1, 0.72], mountY: 0.03 }, 0, 's', { on: 'pbT', dx: 0.1 }],
    ['pbath', 'orchid', { h: 1.6, stems: 2, seed: 11, potDia: 0.45, mountY: 0.03 }, 0, 's', { on: 'pbT', dx: -0.35, dz: -0.1 }],
    ['pbath', 'soapPump', {}, [2113, 944], 's', { drop: true }],
    ['pbath', 'towelStack', { n: 1, w: 0.7, d: 0.5, t: 0.15 }, [2168, 952], 's', { drop: true }],
    // r35 owner 11/10: the two rings hang below the window sill, one toward each end of the window (primary-bath photo). At 4.0 ft they
    // crossed the sill (3.79 ft), so the wall-fit rule slid both off the window to the same spot and they read as one doubled-up bar.
    ['pbath', 'towelRing', { mountY: 3.3 }, 0, 'w', { bim: [-22.27, -8.9], back: true, fixture: true, key: 'pbR1' }],
    ['pbath', 'towelHang', { style: 'ring', w: 0.8, drop: 1.05, mountY: 2.8, z: 0.15 }, 0, 'w', { on: 'pbR1', z: 0 }],
    ['pbath', 'towelRing', { mountY: 3.3 }, 0, 'w', { bim: [-20.62, -8.9], back: true, fixture: true, key: 'pbR2' }],
    ['pbath', 'towelHang', { style: 'ring', w: 0.8, drop: 1.05, mountY: 2.8, z: 0.15 }, 0, 'w', { on: 'pbR2', z: 0 }]);
  // UPPER LOFT + HALL (p574, p575, p578): woven-leather bench with two cream pillows under the corner windows (no window seat in the 10/31
  // photos), a fiddle-leaf fig in a cream pot, the black / cream abstract on the landing wall
  add(['loft', 'bench', { style: 'woven', w: 5.0 }, 0, 'e', { bim: [-5.8, -24.58], back: true, key: 'lb' }],
    ['loft', 'pillows', { mountY: 1.5, lean: -0.2, items: [['linenOat33', -1.6, 1.5, 1.45, 0.05], ['pillowTaupe33', -0.35, 1.45, 1.4, -0.05]] }, 0, 'e', { on: 'lb', z: 0.02 }],
    ['loft', 'plantPot', { type: 'fiddle', h: 7, potDia: 1.7, pot: 'ceramicTex33', seed: 6 }, 0, 'e', { bim: [-12.2, -22.9] }],
    ['loft', 'art', { w: 3.6, h: 4.4, mountY: 5.8, style: 'blackCream', seed: 16, frame: 'frameBlack', fw: 0.05 }, 0, 'e', { bim: [-11.0, -24.58], back: true }]);
  // BALCONY (p591, p592): two dark-frame lounge chairs with cream cushions, small dark side table between
  add(['balcony', 'outdoorLounge', { style: 'club' }, function (r) { return [r[0] + 0.55, r[1] + (r[3] - r[1]) * 0.28]; }, 0, { deck: 'balcony', back: true }],
    ['balcony', 'outdoorSide', {}, function (r) { return [r[0] + 0.95, r[1] + (r[3] - r[1]) * 0.5]; }, 0, { deck: 'balcony' }],
    ['balcony', 'outdoorLounge', { style: 'club' }, function (r) { return [r[0] + 0.55, r[1] + (r[3] - r[1]) * 0.72]; }, 0, { deck: 'balcony', back: true }]);
  // FRONT PORCH: not photographed 10/31 -> keep the listing pair
  add(['frontdeck', 'outdoorLounge', { frame: 'blackMetal', w: 2.4, d: 2.6, h: 2.9, style: 'slipper' }, function (r) { return [r[0] + (r[2] - r[0]) * 0.36, r[3] - 3.1]; }, 270, { deck: 'DK-FRONT' }],
    ['frontdeck', 'outdoorLounge', { frame: 'blackMetal', w: 2.4, d: 2.6, h: 2.9, style: 'slipper' }, function (r) { return [r[0] + (r[2] - r[0]) * 0.52, r[3] - 3.1]; }, 270, { deck: 'DK-FRONT' }]);
  // TERRACE (p476, p494, p482): black-frame lounge set with white cushions (sofa along the house + two club chairs + low black table with a moss
  // bowl), same footprint as the listing set (LOUNGE_SPEC); two round concrete fire bowls on the paver edge
  add(['terrace', 'wickerSofa', { style: 'frame' }, A.apply(null, LS.sofa.at), Y(LS.sofa.face, LS.sofa.at)],
    ['terrace', 'outdoorCoffee', { style: 'black' }, A.apply(null, LS.coffee.at), Y(LS.coffee.face, LS.coffee.at), { key: 'tc' }],
    ['terrace', 'bowl', { style: 'moss', dia: 1.2, h: 0.45, mat: 'concrete33' }, 0, 0, { on: 'tc' }],
    ['terrace', 'wickerSofa', { style: 'frame', w: 2.9, seats: 1 }, A.apply(null, LS.chairE.at), Y(LS.chairE.face, LS.chairE.at)],
    ['terrace', 'wickerSofa', { style: 'frame', w: 2.9, seats: 1 }, A.apply(null, LS.chairW.at), Y(LS.chairW.face, LS.chairW.at)]);
  if (h.fireBowls) h.fireBowls.forEach(function (p) { R.push(['terrace', 'fireBowl', {}, A(p[0], p[1]), 0]); });
  return R;
}
global.STAGING33 = { version: '1.0.0', rows: rows, kinds: Object.keys(K), make: function (k, o) { return STAGE.make(k, o); } };
})(typeof window !== 'undefined' ? window : this);
