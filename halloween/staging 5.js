/*!
 * STAGE — staging furniture & decor for the 118 Hillside walkthrough (three.js r128, global THREE + FIX).
 * Adds the pieces the listing photos are staged with that the FIX library does not have
 * (L-sectional, benches, knit poufs, seagrass ottoman, faceted sideboard, framed art, rugs, outdoor sets ...).
 * Same conventions as FIX: feet; origin = centre of the piece's BACK edge on the floor; width along x,
 * depth toward +z (front faces +z), y up. Wall-hung pieces (art, mirror) take opts.mountY (centre height).
 * API: STAGE.make(kind, opts) -> THREE.Group (userData {kind, category:'furniture', opts, size:[w,d,h]})
 *      STAGE.sizeOf(kind, opts) · STAGE.kinds · STAGE.has(kind)
 * Kinds not defined here fall through to FIX.make, so a staging table can mix both.
 */
(function (global) {
'use strict';
var THREE = global.THREE, FIX = global.FIX;
if (!THREE || !FIX || !FIX.helpers) { if (global.console) console.warn('STAGE: needs three.js and fixtures.js'); return; }
var H = FIX.helpers, Builder = H.Builder, M = H.M, PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
var STAGE = { version: '1.0.0' }, KINDS = {}, ORDER = [];

function opt(d, o) { var r = {}, k; for (k in d) r[k] = d[k]; if (o) for (k in o) if (o[k] !== undefined) r[k] = o[k]; return r; }
function rng(seed) { var s = (seed >>> 0) || 0x9e3779b9; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function lin(c) { return new THREE.Color(c).convertSRGBToLinear(); }
function std(p) { if (p.color !== undefined) p.color = lin(p.color); return new THREE.MeshStandardMaterial(p); }
function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
function ctex(c, rep) { var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; if (rep) t.repeat.set(rep[0], rep[1]); return t; }
function noise(x, W, Hh, n, R, cols, r0, r1) { for (var i = 0; i < n; i++) { x.fillStyle = cols[(R() * cols.length) | 0]; var r = r0 + R() * (r1 - r0); x.beginPath(); x.arc(R() * W, R() * Hh, r, 0, TAU); x.fill(); } }

/* ------------------------------------------------------------ textures & materials */
var TX = {};
function tex(name) {
  if (TX[name]) return TX[name];
  var c, x, R, i, j, W = 256;
  switch (name) {
    case 'knit': c = canvas(W); x = c.getContext('2d'); x.fillStyle = '#808080'; x.fillRect(0, 0, W, W);   // bump: chunky knit bobbles
      for (j = 0; j < 8; j++) for (i = 0; i < 8; i++) { var cx = i * 32 + (j % 2) * 16 + 16, cy = j * 32 + 16, g = x.createRadialGradient(cx, cy, 2, cx, cy, 16); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#303030'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 15, 0, TAU); x.fill(); }
      TX[name] = ctex(c, [2.4, 2.4]); TX[name].encoding = THREE.LinearEncoding; break;
    case 'velvet': c = canvas(W); x = c.getContext('2d'); R = rng(5); x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, W, W);
      noise(x, W, W, 1800, R, ['rgba(255,255,255,.06)', 'rgba(0,0,0,.07)'], 1, 4); TX[name] = ctex(c, [1, 1]); TX[name].encoding = THREE.LinearEncoding; break;
    case 'seagrass': c = canvas(W); x = c.getContext('2d'); R = rng(7); x.fillStyle = '#7d6440'; x.fillRect(0, 0, W, W);   // coiled seagrass rope rows (one tone per coil)
      for (j = 0; j < 20; j++) for (i = 0; i < 26; i++) { var yy = j * 12.8, xx = i * 10 + (j % 2) * 5, sv = 0.82 + R() * 0.3;
        x.fillStyle = 'rgb(' + (176 * sv | 0) + ',' + (146 * sv | 0) + ',' + (98 * sv | 0) + ')';
        x.beginPath(); x.ellipse(xx + 5, yy + 6.4, 5.4, 6.6, 0.55, 0, TAU); x.fill(); x.strokeStyle = 'rgba(70,50,22,.45)'; x.lineWidth = 1.2; x.stroke(); }
      TX[name] = ctex(c, [2.2, 2.2]); break;
    case 'wicker': c = canvas(W); x = c.getContext('2d'); R = rng(9); x.fillStyle = '#5d4835'; x.fillRect(0, 0, W, W);
      for (j = 0; j < 32; j++) for (i = 0; i < 32; i++) { x.fillStyle = ((i + j) % 2) ? 'rgba(130,100,72,1)' : 'rgba(96,74,54,1)'; x.fillRect(i * 8 + 1, j * 8 + 1, 6 + R(), 6 + R()); }
      TX[name] = ctex(c, [2, 2]); break;
    case 'stripe': c = canvas(128); x = c.getContext('2d'); x.fillStyle = '#efede7'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#2d2f33';
      for (i = 0; i < 4; i++) x.fillRect(0, i * 32 + 10, 128, 10); TX[name] = ctex(c, [1.5, 1.5]); break;
    case 'sisal': c = canvas(W); x = c.getContext('2d'); R = rng(11); x.fillStyle = '#7c6446'; x.fillRect(0, 0, W, W);  // boucle sisal: golden tan, one tone per loop
      for (j = 0; j < 64; j++) for (i = 0; i < 64; i++) { var v = 0.8 + R() * 0.32; x.fillStyle = 'rgb(' + (150 * v | 0) + ',' + (121 * v | 0) + ',' + (86 * v | 0) + ')'; x.beginPath(); x.ellipse(i * 4 + 2, j * 4 + 2 + ((i % 2) ? 1 : 0), 1.9, 1.6, (j % 2) ? 0.7 : -0.7, 0, TAU); x.fill(); }
      TX[name] = ctex(c, [1, 1]); break;
    case 'juteGrey': c = canvas(W); x = c.getContext('2d'); R = rng(13); x.fillStyle = '#4f4740'; x.fillRect(0, 0, W, W);
      for (j = 0; j < 22; j++) for (i = 0; i < 22; i++) { var v2 = 0.7 + R() * 0.55; x.fillStyle = 'rgb(' + (118 * v2 | 0) + ',' + (104 * v2 | 0) + ',' + (90 * v2 | 0) + ')'; x.beginPath(); x.ellipse(i * 11.6 + 6, j * 11.6 + 6, 6.2, 4.6, (i + j) % 2 ? 0.8 : -0.8, 0, TAU); x.fill(); }
      TX[name] = ctex(c, [1, 1]); break;
    case 'darkSisal': c = canvas(W); x = c.getContext('2d'); R = rng(17); x.fillStyle = '#4a3a2a'; x.fillRect(0, 0, W, W);
      for (j = 0; j < 64; j++) for (i = 0; i < 64; i++) { var v3 = 0.75 + R() * 0.4; x.fillStyle = 'rgb(' + (106 * v3 | 0) + ',' + (84 * v3 | 0) + ',' + (62 * v3 | 0) + ')'; x.fillRect(i * 4, j * 4 + ((i % 2) ? 2 : 0), 3.4, 3.4); }
      TX[name] = ctex(c, [1, 1]); break;
    case 'creamWool': c = canvas(W); x = c.getContext('2d'); R = rng(19); x.fillStyle = '#e9e4d9'; x.fillRect(0, 0, W, W);
      noise(x, W, W, 2500, R, ['rgba(255,255,255,.18)', 'rgba(150,140,120,.12)'], 0.6, 2); TX[name] = ctex(c, [1, 1]); break;
  }
  return TX[name];
}
/* textile prints for pillows, throws, bed scarves and towels (photos): canvas tiles, box-projected UVs in feet */
var PATS = {};
function patTex(name) {
  if (PATS[name]) return PATS[name];
  var W = 256, c = canvas(W), x = c.getContext('2d'), R = rng(name.length * 977 + 13), i, j, tile = 1;
  var bg = function (col) { x.fillStyle = col; x.fillRect(0, 0, W, W); };
  switch (name) {
    case 'ikatBW': bg('#1c1c1d'); tile = 0.7; x.fillStyle = '#eeebe4';      // black ground, feathered white ikat diamonds (p44 left pillow)
      for (j = 0; j < 4; j++) for (i = 0; i < 4; i++) { var cx = i * 64 + (j % 2) * 32 + 16, cy = j * 64 + 32; for (var k = 0; k < 7; k++) { var hw = 22 - Math.abs(k - 3) * 6, yy = cy - 21 + k * 6; x.fillRect(cx - hw + (R() - 0.5) * 4, yy, hw * 2, 3.2); } }
      break;
    case 'diamondBW': bg('#efece6'); tile = 0.55; x.strokeStyle = '#1b1b1b'; x.lineWidth = 9;   // white ground, black zigzag diamonds (p44 right pillow)
      for (j = -1; j < 5; j++) { x.beginPath(); for (i = 0; i <= 8; i++) x.lineTo(i * 32, j * 64 + 32 + (i % 2 ? -22 : 22)); x.stroke(); }
      break;
    case 'triBW': bg('#efece6'); tile = 0.5; x.fillStyle = '#1e1e1e';       // small black triangles on white (lower study pillows + throw)
      for (j = 0; j < 4; j++) for (i = 0; i < 4; i++) { var tx = i * 64 + (j % 2) * 32 + 16, ty = j * 64 + 18; x.beginPath(); x.moveTo(tx, ty); x.lineTo(tx + 20, ty + 30); x.lineTo(tx - 20, ty + 30); x.closePath(); x.fill(); }
      break;
    case 'basketGrey': bg('#ecebe7'); tile = 1.5; x.fillStyle = '#4e4f53';   // primary-bed pillows (p06): charcoal bands woven over/under on white
      [70, 112, 144, 186].forEach(function (p, n) { x.fillRect(p - 12, 0, 24, W); });
      x.fillStyle = '#ecebe7'; [70, 112, 144, 186].forEach(function (p) { [70, 186].forEach(function (q) { x.fillRect(p - 12, q - 12, 24, 24); }); });
      x.fillStyle = '#5c5d61'; [70, 112, 144, 186].forEach(function (q, n) { if (n === 0 || n === 3) x.fillRect(0, q - 12, W, 24); });
      x.fillStyle = '#4e4f53'; [112, 144].forEach(function (p) { [70, 186].forEach(function (q) { x.fillRect(p - 12, q - 12, 24, 24); }); });
      break;
    case 'latticeBrown': bg('#ece6da'); tile = 0.35; x.strokeStyle = '#5e4a38'; x.lineWidth = 7;   // office chair pillows (p20): brown trellis on cream
      for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) { x.beginPath(); x.ellipse(i * 128 + 64, j * 128 + 64, 56, 56, 0, 0, TAU); x.stroke(); }
      break;
    case 'stripeGrey': bg('#ecebe7'); tile = 0.9; x.fillStyle = '#8b8b8d'; for (i = 0; i < 4; i++) x.fillRect(0, i * 64 + 8, W, 26); break;   // p58 pillow + throw
    case 'scarfArrow': bg('#e6e0d4'); tile = 0.6; x.strokeStyle = '#faf8f3'; x.lineWidth = 12;     // main bedroom scarf (p74): white arrows on oat
      for (j = 0; j < 4; j++) for (i = 0; i < 4; i++) { var ax = i * 64 + 32, ay = j * 64 + 14; x.beginPath(); x.moveTo(ax - 18, ay + 30); x.lineTo(ax, ay + 8); x.lineTo(ax + 18, ay + 30); x.stroke(); }
      break;
    case 'scarfOgee': bg('#e9e4d9'); tile = 0.7; x.strokeStyle = '#fbf9f4'; x.lineWidth = 10;      // second bedroom scarf (p62): white hex ogee on cream
      for (j = 0; j < 3; j++) for (i = 0; i < 3; i++) { var hx = i * 86 + (j % 2) * 43, hy = j * 86 + 43; x.beginPath(); for (var a = 0; a <= 6; a++) x.lineTo(hx + 36 * Math.cos(a * PI / 3), hy + 30 * Math.sin(a * PI / 3)); x.stroke(); }
      break;
    case 'quilt': bg('#f6f4ef'); tile = 0.45; x.strokeStyle = 'rgba(140,135,125,.45)'; x.lineWidth = 3;   // quilted coverlet: diamond stitching
      for (i = -4; i < 8; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64 + W, W); x.stroke(); x.beginPath(); x.moveTo(i * 64 + W, 0); x.lineTo(i * 64, W); x.stroke(); }
      break;
    case 'terry': bg('#f7f6f2'); tile = 0.25; noise(x, W, W, 5000, R, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.6)'], 0.8, 2); break;
    case 'knitTan': bg('#8f7a5e'); tile = 0.3; for (j = 0; j < 16; j++) for (i = 0; i < 16; i++) { x.fillStyle = (i + j) % 2 ? '#a48d6d' : '#7d6a51'; x.fillRect(i * 16, j * 16, 15, 15); } break;
    case 'knitOlive': bg('#6d6550'); tile = 0.3; for (j = 0; j < 16; j++) for (i = 0; i < 16; i++) { x.fillStyle = (i % 2) ? '#857b62' : '#6a604b'; x.fillRect(i * 16, j * 16 + (i % 2) * 8, 15, 15); } break;
    case 'pierced': bg('#f1efe9'); tile = 0.55; x.fillStyle = '#9d9a94';                       // garden stool fretwork (p10): looped cut-outs read as shadowed holes
      for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) { var px = i * 128 + 64, py = j * 128 + 64; for (var q = 0; q < 4; q++) { x.beginPath(); x.ellipse(px + 30 * Math.cos(q * HALF), py + 30 * Math.sin(q * HALF), 20, 11, q * HALF, 0, TAU); x.fill(); } }
      break;
  }
  var t = ctex(c, [1 / tile, 1 / tile]); PATS[name] = t; return t;
}
function patMat(name, rough) { return std({ color: 0xffffff, map: patTex(name), roughness: rough || 0.95, bumpMap: tex('velvet'), bumpScale: 0.0015 }); }
var MATS = {
  velvetCharcoal: function () { return std({ color: 0x55565a, roughness: 0.78, bumpMap: tex('velvet'), bumpScale: 0.002 }); },
  knitWhite: function () { return std({ color: 0xf2efe8, roughness: 1, bumpMap: tex('knit'), bumpScale: 0.02 }); },
  seagrass: function () { var t = tex('seagrass'); return std({ color: 0xffffff, map: t, bumpMap: t, bumpScale: 0.01, roughness: 0.9 }); },
  facetNavy: function () { return std({ color: 0x1f2735, roughness: 0.55 }); },
  greyWood: function () { return std({ color: 0x8f9396, roughness: 0.55, bumpMap: tex('velvet'), bumpScale: 0.001 }); },
  aluCharcoal: function () { return std({ color: 0x3b3c3f, roughness: 0.45, metalness: 0.35 }); },
  cushionWhite: function () { return std({ color: 0xf2f0eb, roughness: 0.95 }); },
  wicker: function () { var t = tex('wicker'); return std({ color: 0xffffff, map: t, bumpMap: t, bumpScale: 0.01, roughness: 0.85 }); },
  stoneWhite: function () { return std({ color: 0xece9e2, roughness: 0.4 }); },
  stripeCushion: function () { return std({ color: 0xffffff, map: tex('stripe'), roughness: 0.95 }); },
  linenCream: function () { return std({ color: 0xe9e3d6, roughness: 0.95, bumpMap: tex('velvet'), bumpScale: 0.0015 }); },
  satinBrass: function () { return std({ color: 0xb79a63, roughness: 0.35, metalness: 0.9 }); },
  petal: function () { return std({ color: 0xfbfaf6, roughness: 0.6, side: THREE.DoubleSide }); },
  frameBlack: function () { return std({ color: 0x151515, roughness: 0.5 }); },
  frameWhite: function () { return std({ color: 0xf3f2ee, roughness: 0.6 }); },
  matBoard: function () { return std({ color: 0xf7f6f2, roughness: 0.9 }); },
  rubberBall: function () { return std({ color: 0x8a8d90, roughness: 0.35 }); },
  // ---- v20 decor: textiles sampled from the listing photos
  pillowSlate: function () { return std({ color: 0x545b65, roughness: 0.95, bumpMap: tex('velvet'), bumpScale: 0.002 }); },      // sitting-room sectional (p12)
  pillowGreyLinen: function () { return std({ color: 0xc6c3bd, roughness: 0.95, bumpMap: tex('velvet'), bumpScale: 0.002 }); },
  pillowCream: function () { return std({ color: 0xece7dd, roughness: 0.95, bumpMap: tex('velvet'), bumpScale: 0.002 }); },
  pillowBlack: function () { return std({ color: 0x19191a, roughness: 0.85, bumpMap: tex('velvet'), bumpScale: 0.002 }); },      // living chairs + sofa (p44)
  pillowNavy: function () { return std({ color: 0x223049, roughness: 0.8, bumpMap: tex('velvet'), bumpScale: 0.002 }); },       // lower bedroom (p58)
  pillowGrey: function () { return std({ color: 0x6b6b6e, roughness: 0.9, bumpMap: tex('velvet'), bumpScale: 0.002 }); },
  pillowTaupe: function () { return std({ color: 0x8a7f78, roughness: 0.9, bumpMap: tex('velvet'), bumpScale: 0.002 }); },      // p63 / stair bench
  pillowBrown: function () { return std({ color: 0x4a3e36, roughness: 0.9, bumpMap: tex('velvet'), bumpScale: 0.002 }); },
  velvetTaupe: function () { return std({ color: 0x5d544f, roughness: 0.7, bumpMap: tex('velvet'), bumpScale: 0.002 }); },      // bonus-lounge velvet (p65/p72)
  boucleWhite: function () { return std({ color: 0xf0ece4, roughness: 1, bumpMap: tex('knit'), bumpScale: 0.004 }); },
  ikatBW: function () { return patMat('ikatBW'); }, diamondBW: function () { return patMat('diamondBW'); }, triBW: function () { return patMat('triBW'); },
  basketGrey: function () { return patMat('basketGrey'); }, latticeBrown: function () { return patMat('latticeBrown'); }, stripeGrey: function () { return patMat('stripeGrey'); },
  scarfArrow: function () { return patMat('scarfArrow'); }, scarfOgee: function () { return patMat('scarfOgee'); },
  quiltWhite: function () { return std({ color: 0xffffff, map: patTex('quilt'), bumpMap: patTex('quilt'), bumpScale: 0.004, roughness: 0.95 }); },
  quiltGrey: function () { return std({ color: 0xc9cacc, map: patTex('quilt'), bumpMap: patTex('quilt'), bumpScale: 0.004, roughness: 0.95 }); },
  knitTan: function () { return std({ color: 0xffffff, map: patTex('knitTan'), bumpMap: tex('knit'), bumpScale: 0.006, roughness: 1 }); },     // p74 pillows
  knitOlive: function () { return std({ color: 0xffffff, map: patTex('knitOlive'), bumpMap: tex('knit'), bumpScale: 0.006, roughness: 1 }); }, // p62 pillows
  throwCharcoal: function () { return std({ color: 0x3a3a3d, roughness: 1, bumpMap: tex('knit'), bumpScale: 0.004 }); },
  throwBrown: function () { return std({ color: 0x4b4038, roughness: 1, bumpMap: tex('knit'), bumpScale: 0.004 }); },
  towelWhite: function () { return std({ color: 0xffffff, map: patTex('terry'), bumpMap: patTex('terry'), bumpScale: 0.006, roughness: 1 }); },
  stoolPierced: function () { var t = patTex('pierced').clone(); t.needsUpdate = true; t.repeat.set(5, 1.6); return std({ color: 0xffffff, map: t, roughness: 0.3 }); },
  frameOak: function () { return std({ color: 0xb48a5c, roughness: 0.6 }); },
  frameSilver: function () { return std({ color: 0xa9abad, roughness: 0.35, metalness: 0.8 }); },
  ceramicMatte: function () { return std({ color: 0xece8df, roughness: 0.8, bumpMap: tex('velvet'), bumpScale: 0.003 }); },
  ceramicSpeckle: function () { var c0 = canvas(128), g = c0.getContext('2d'), R = rng(41); g.fillStyle = '#e4dccb'; g.fillRect(0, 0, 128, 128); noise(g, 128, 128, 260, R, ['#9a8f7c', '#b5aa95', '#6f665a'], 0.5, 1.6);
    return std({ color: 0xffffff, map: ctex(c0, [3, 3]), roughness: 0.85 }); },
  ceramicBlack: function () { return std({ color: 0x1d1c1b, roughness: 0.75 }); },
  ceramicStripe: function () { var c0 = canvas(64, 256), g = c0.getContext('2d'), R = rng(43); g.fillStyle = '#eae4d8'; g.fillRect(0, 0, 64, 256);
    for (var k = 0; k < 22; k++) { g.fillStyle = 'rgba(' + (120 + R() * 40 | 0) + ',' + (108 + R() * 30 | 0) + ',' + (92 + R() * 20 | 0) + ',' + (0.35 + R() * 0.4) + ')'; g.fillRect(0, R() * 256, 64, 1 + R() * 4); }
    var t0 = ctex(c0, [1, 1]); return std({ color: 0xffffff, map: t0, roughness: 0.8 }); },
  ceramicBlue: function () { return std({ color: 0x8396b3, roughness: 0.3 }); },
  creamBox: function () { return std({ color: 0xd9ccb3, roughness: 0.7 }); },
  rattanTray: function () { var t = tex('seagrass'); return std({ color: 0xd8b98a, map: t, roughness: 0.9 }); },
  succulentGreen: function () { return std({ color: 0x8aa37a, roughness: 0.55 }); },
  appleGreen: function () { return std({ color: 0x8fb04a, roughness: 0.4 }); },
  boardWood: function () { return std({ color: 0xb98d5c, roughness: 0.6 }); },
  glassClear: function () { return new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.28, metalness: 0 }); },
  wineGlass: function () { return std({ color: 0x3a1418, roughness: 0.25 }); },
  stoneTravertine: function () { return std({ color: 0xd9cfbf, roughness: 0.7, bumpMap: tex('velvet'), bumpScale: 0.002 }); },
  coralWhite: function () { return std({ color: 0xf4f1ea, roughness: 0.9 }); },
  nickel: function () { return std({ color: 0xc9c4b8, roughness: 0.3, metalness: 0.9 }); },
  shadeLinen: function () { return std({ color: 0xcfc2a8, emissive: 0xffe2b8, emissiveIntensity: 0.12, roughness: 0.95, side: THREE.DoubleSide }); },
  shadeWhite: function () { return std({ color: 0xf6f3ec, emissive: 0xffe9c8, emissiveIntensity: 0.18, roughness: 0.95, side: THREE.DoubleSide }); },
  ceramicGrey: function () { return std({ color: 0x8c8d8c, roughness: 0.55 }); },
  mirrorGlass: function () { return std({ color: 0xe4e8ea, roughness: 0.22, metalness: 0.35, envMapIntensity: 0.5, emissive: 0x9aa0a4, emissiveIntensity: 0.25 }); },   // indoor mirror: muted (the scene env is an outdoor sky)
  rubberGrey: function () { return std({ color: 0x77797c, roughness: 0.45 }); },
  orchidLeaf: function () { return std({ color: 0x2f4b25, roughness: 0.35 }); },
  orchidStem: function () { return std({ color: 0x55603a, roughness: 0.6 }); },
  petalLip: function () { return std({ color: 0xf1e3b0, roughness: 0.6 }); },
  seatGrey: function () { return std({ color: 0xa29e98, roughness: 0.95, bumpMap: tex('velvet'), bumpScale: 0.002 }); },   // landing seat cushion (p36/p40)
  oakPale: function () { return std({ color: 0xc4ad8d, roughness: 0.65 }); }
};
var made = {}, ovr = {};
for (var mk in MATS) (function (k) { Object.defineProperty(ovr, k, { enumerable: true, get: function () { if (!made[k]) { made[k] = MATS[k](); made[k].name = k; } return made[k]; } }); })(mk);
// make the new materials resolvable by name through FIX.mat (so FIX kinds can use them as fabric/finish too)
var reg = {}; for (var k2 in MATS) reg[k2] = ovr[k2]; FIX.setMaterials(reg);

// one material per rug / artwork (texture drawn for that piece)
var CUST = {};
function rugMat(o) {
  var key = 'rug:' + o.pattern + ':' + o.w + 'x' + o.d + ':' + (o.color || '') + (o.accent || '');
  if (CUST[key]) return [key, CUST[key]];
  var t, m;
  if (o.pattern === 'checker') {   // grey/ivory diamond-check flat weave (dining / sitting area)
    var S = 64, nx = Math.max(2, Math.round(o.w / 1.15)), ny = Math.max(2, Math.round(o.d / 1.15)), c = canvas(nx * S, ny * S), x = c.getContext('2d'), R = rng(23);
    x.fillStyle = o.color || '#ece8df'; x.fillRect(0, 0, c.width, c.height);
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) { if ((i + j) % 2) continue; x.fillStyle = o.accent || '#7c7c7a'; x.fillRect(i * S, j * S, S, S); }
    noise(x, c.width, c.height, nx * ny * 60, R, ['rgba(255,255,255,.10)', 'rgba(0,0,0,.08)'], 0.5, 1.5);
    x.strokeStyle = o.color || '#ece8df'; x.lineWidth = 10; x.strokeRect(5, 5, c.width - 10, c.height - 10);
    t = ctex(c, [1, 1]); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    m = std({ color: 0xffffff, map: t, roughness: 1 });
  } else {
    if (o.pattern === 'taupe') {   // muted taupe-brown low pile with soft lighter swirls (main-level bedroom p74)
      var c2 = canvas(512), x2 = c2.getContext('2d'), R2 = rng(29); x2.fillStyle = '#7e6a55'; x2.fillRect(0, 0, 512, 512);
      for (var q = 0; q < 70; q++) { x2.strokeStyle = 'rgba(' + (170 + R2() * 30 | 0) + ',' + (150 + R2() * 25 | 0) + ',' + (125 + R2() * 20 | 0) + ',' + (0.12 + R2() * 0.18) + ')'; x2.lineWidth = 4 + R2() * 14;
        x2.beginPath(); var sx = R2() * 512, sy = R2() * 512; x2.moveTo(sx, sy); x2.bezierCurveTo(sx + (R2() - 0.5) * 300, sy + (R2() - 0.5) * 300, sx + (R2() - 0.5) * 300, sy + (R2() - 0.5) * 300, sx + (R2() - 0.5) * 400, sy + (R2() - 0.5) * 400); x2.stroke(); }
      noise(x2, 512, 512, 6000, R2, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.06)'], 0.6, 1.6);
      t = ctex(c2, [1, 1]); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; m = std({ color: 0xffffff, map: t, roughness: 1 }); m.name = key; CUST[key] = m; return [key, m];
    }
    var nm = { sisal: 'sisal', juteGrey: 'juteGrey', darkSisal: 'darkSisal', creamWool: 'creamWool' }[o.pattern] || 'sisal';
    var base = tex(nm); t = base.clone(); t.needsUpdate = true; t.repeat.set(o.w / 2.2, o.d / 2.2);
    m = std({ color: 0xffffff, map: t, bumpMap: t, bumpScale: 0.004, roughness: 1 });
  }
  m.name = key; CUST[key] = m; return [key, m];
}
function artMat(o) {
  var key = 'art:' + o.style + ':' + o.seed + ':' + o.w + 'x' + o.h + ':' + (o.mat || 0);
  if (CUST[key]) return [key, CUST[key]];
  // image area in feet (inside frame and mat): the canvas keeps the piece's aspect so marks are never stretched
  var iw = Math.max(0.3, o.w - 2 * (o.frame ? 0.07 : 0) - 2 * (o.mat || 0)), ih = Math.max(0.3, o.h - 2 * (o.frame ? 0.07 : 0) - 2 * (o.mat || 0));
  var big = Math.max(iw, ih) > 3, pw = big ? 1024 : 512, ph = Math.max(64, Math.round(pw * ih / iw)), c = canvas(pw, ph), x = c.getContext('2d'), R = rng(o.seed * 131 + 7), i, j;
  var paper = '#f3f1eb', ink = '#161616', grey = '#8f8c86', S = Math.min(pw, ph);
  x.fillStyle = paper; x.fillRect(0, 0, pw, ph);
  function brush(col, x0, y0, w, h, a, rough) {        // painterly block: overlapping translucent strokes with ragged edges
    x.save(); x.translate(x0 + w / 2, y0 + h / 2); x.rotate(a || 0); x.fillStyle = col;
    for (var k = 0; k < 14; k++) { x.globalAlpha = 0.18 + R() * 0.2; var jx = (R() - 0.5) * w * (rough || 0.06), jy = (R() - 0.5) * h * (rough || 0.06);
      x.beginPath(); x.moveTo(-w / 2 + jx, -h / 2 + jy); x.lineTo(w / 2 + jx * 0.5, -h / 2 - jy); x.lineTo(w / 2 - jx, h / 2 + jy * 0.7); x.lineTo(-w / 2 - jx * 0.6, h / 2 - jy); x.closePath(); x.fill(); }
    x.globalAlpha = 1; x.restore(); }
  function rrect(x0, y0, w, h, r) { x.beginPath(); x.moveTo(x0 + r, y0); x.arcTo(x0 + w, y0, x0 + w, y0 + h, r); x.arcTo(x0 + w, y0 + h, x0, y0 + h, r); x.arcTo(x0, y0 + h, x0, y0, r); x.arcTo(x0, y0, x0 + w, y0, r); x.closePath(); }
  var st = o.style;
  if (st === 'blots') {               // dining/sitting-room abstract (p16, p12): off-white field, grey-beige washes, white panel, black rounded block, black bar
    x.fillStyle = '#ebe8e1'; x.fillRect(0, 0, pw, ph);
    brush('#c9c4b9', pw * 0.04, ph * 0.38, pw * 0.62, ph * 0.42, 0.01); brush('#d6d2c9', pw * 0.06, ph * 0.1, pw * 0.3, ph * 0.3, -0.02);
    brush('#ffffff', pw * 0.58, ph * 0.1, pw * 0.22, ph * 0.62, 0); brush('#b9b5ad', pw * 0.82, ph * 0.08, pw * 0.14, ph * 0.7, 0.01, 0.1);
    x.fillStyle = ink; rrect(pw * 0.3, ph * 0.12, pw * 0.2, ph * 0.18, S * 0.03); x.fill();
    brush(ink, pw * 0.5, ph * 0.8, pw * 0.42, ph * 0.075, -0.01, 0.03); brush('#3a3a38', pw * 0.62, ph * 0.66, pw * 0.08, ph * 0.08, 0);
  } else if (st === 'brush') {        // lower study abstract (p64): white impasto with umber / charcoal / grey dabs in loose columns
    x.fillStyle = '#efede7'; x.fillRect(0, 0, pw, ph);
    for (i = 0; i < 60; i++) brush(R() < 0.5 ? '#ffffff' : '#dcd9d2', pw * R(), ph * R(), pw * (0.05 + R() * 0.12), ph * (0.04 + R() * 0.1), (R() - 0.5) * 0.3);
    for (i = 0; i < 34; i++) { var cx = pw * (0.08 + 0.84 * ((i % 6) / 5) + (R() - 0.5) * 0.08), cy = ph * (0.08 + R() * 0.84);
      brush(['#5a3f2a', '#2b2622', '#7b6a5a', '#8d8b86', '#3d332b'][(R() * 5) | 0], cx, cy, pw * (0.02 + R() * 0.035), ph * (0.04 + R() * 0.09), (R() - 0.5) * 0.4, 0.2); }
  } else if (st === 'dots') {         // stair-hall piece (p36/p40): rows of black ink dashes on white, denser in the middle
    x.fillStyle = '#f6f5f1'; x.fillRect(0, 0, pw, ph); x.fillStyle = ink;
    var rows = 30, cols = 26;
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) { if (R() < 0.12) continue;
      var px = pw * (0.06 + 0.88 * (i + 0.5 + (R() - 0.5) * 0.5) / cols), py = ph * (0.05 + 0.9 * (j + 0.5 + (R() - 0.5) * 0.3) / rows);
      x.save(); x.translate(px, py); x.rotate(1.25 + (R() - 0.5) * 0.5); x.beginPath(); x.ellipse(0, 0, S * (0.011 + R() * 0.008), S * (0.0045 + R() * 0.003), 0, 0, TAU); x.fill(); x.restore(); }
  } else if (st === 'circles') {      // sitting-room ring print (p12/p41): white scribbled rings on a black square, matted
    x.fillStyle = '#121212'; x.fillRect(0, 0, pw, ph); x.strokeStyle = '#f2f0ea'; x.lineCap = 'round';
    for (i = 0; i < 9; i++) { x.lineWidth = 2 + R() * 3; x.beginPath(); x.ellipse(pw / 2 + (R() - 0.5) * pw * 0.06, ph / 2 + (R() - 0.5) * ph * 0.05, pw * (0.17 + R() * 0.12), ph * (0.11 + R() * 0.08), 0.15 + (R() - 0.5) * 0.3, R() * TAU, R() * TAU + TAU * (0.8 + R() * 0.2)); x.stroke(); }
  } else if (st === 'swirl') {        // primary bedroom (p26/p24): two grey ribbons twisting down a white field, thin float frame
    x.fillStyle = '#f2f1ee'; x.fillRect(0, 0, pw, ph); x.lineCap = 'round';
    for (i = 0; i < 2; i++) { var g = x.createLinearGradient(0, 0, pw, 0); g.addColorStop(0, i ? '#5d5e62' : '#7d7e82'); g.addColorStop(1, i ? '#8a8b8f' : '#5a5b5f');
      x.strokeStyle = g; x.lineWidth = pw * 0.12; x.beginPath(); x.moveTo(pw * (0.38 + i * 0.22), -10);
      x.bezierCurveTo(pw * (0.05 + i * 0.75), ph * 0.3, pw * (0.95 - i * 0.8), ph * 0.55, pw * (0.45 + i * 0.12), ph * 0.75); x.bezierCurveTo(pw * (0.3 + i * 0.3), ph * 0.85, pw * (0.5 - i * 0.1), ph * 0.95, pw * (0.48 + i * 0.1), ph + 10); x.stroke(); }
  } else if (st === 'marks') {        // living-room pair (p23): one small black stamp-like abstract, centred on white
    x.fillStyle = '#fafaf7'; x.fillRect(0, 0, pw, ph); x.fillStyle = ink;
    x.fillRect(pw * 0.42, ph * 0.4, pw * 0.16, ph * 0.12); x.fillStyle = paper; x.fillRect(pw * 0.45, ph * 0.43, pw * 0.06, ph * 0.05);
    x.fillStyle = ink; for (i = 0; i < 6; i++) x.fillRect(pw * (0.4 + R() * 0.2), ph * (0.52 + R() * 0.08), 3 + R() * 8, 2 + R() * 4);
  } else if (st === 'goldsquare') {   // living-room east wall (p51/p53): small gold-and-black square floating on white
    x.fillStyle = '#fafaf7'; x.fillRect(0, 0, pw, ph); x.fillStyle = '#b8964e'; x.fillRect(pw * 0.4, ph * 0.4, pw * 0.2, ph * 0.2); x.fillStyle = ink; x.beginPath(); x.arc(pw * 0.5, ph * 0.5, S * 0.05, 0, TAU); x.fill();
  } else if (st === 'wave') {         // lower bedroom pair (p58): a large navy-charcoal sweep with a pale rim over cream
    x.fillStyle = '#ece9e2'; x.fillRect(0, 0, pw, ph);
    var gw = x.createLinearGradient(0, 0, pw, ph); gw.addColorStop(0, '#2a3446'); gw.addColorStop(1, '#3d4a5e');
    x.fillStyle = gw; x.beginPath(); x.moveTo(pw * 0.05, ph); x.bezierCurveTo(-pw * 0.05, ph * 0.45, pw * 0.25, ph * 0.18, pw * 0.75, ph * 0.22); x.bezierCurveTo(pw * 1.05, ph * 0.3, pw, ph * 0.7, pw * 0.92, ph); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(190,200,210,.55)'; x.lineWidth = 3; for (i = 0; i < 4; i++) { x.beginPath(); x.moveTo(pw * (0.15 + i * 0.05), ph); x.bezierCurveTo(pw * (0.1 + i * 0.05), ph * 0.5, pw * 0.4, ph * (0.3 + i * 0.03), pw * (0.8 - i * 0.03), ph * (0.35 + i * 0.04)); x.stroke(); }
  } else if (st === 'collage') {      // over the lower bed (p58): blue / slate / white patchwork with a few black lines
    x.fillStyle = '#c9ced4'; x.fillRect(0, 0, pw, ph);
    for (i = 0; i < 26; i++) brush(['#2f3d55', '#6d7f99', '#e9e9e6', '#1d1f22', '#9aa6b5', '#4b5a73'][(R() * 6) | 0], pw * R() * 0.9, ph * R() * 0.9, pw * (0.08 + R() * 0.2), ph * (0.08 + R() * 0.25), (R() - 0.5) * 0.1, 0.1);
    x.strokeStyle = ink; x.lineWidth = 3; for (i = 0; i < 5; i++) { x.beginPath(); x.moveTo(pw * R(), ph * R()); x.lineTo(pw * R(), ph * R()); x.stroke(); }
  } else if (st === 'grid' || st === 'weave') {   // office (p20): black-and-white striped squares laid as a basket weave
    x.fillStyle = '#f4f3ef'; x.fillRect(0, 0, pw, ph); var n = 6, cw = pw / n, chh = ph / Math.round(n * ph / pw), nr = Math.round(n * ph / pw);
    for (j = 0; j < nr; j++) for (i = 0; i < n; i++) { var vert = (i + j) % 2;
      for (var k = 0; k < 6; k++) { x.fillStyle = k % 2 ? '#202020' : (R() < 0.5 ? '#9a9a96' : '#5a5a58'); x.globalAlpha = 0.85;
        if (vert) x.fillRect(i * cw + cw * (k / 6) + 2, j * chh + 3, cw / 9, chh - 6); else x.fillRect(i * cw + 3, j * chh + chh * (k / 6) + 2, cw - 6, chh / 9); }
      x.globalAlpha = 1; }
  } else if (st === 'geo') {          // study far wall (x04): bold black wedges and a bar on white
    x.fillStyle = '#f5f4f0'; x.fillRect(0, 0, pw, ph); x.fillStyle = ink;
    x.beginPath(); x.moveTo(pw * 0.1, ph * 0.25); x.lineTo(pw * 0.55, ph * 0.12); x.lineTo(pw * 0.45, ph * 0.32); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(pw * 0.35, ph * 0.5); x.lineTo(pw * 0.8, ph * 0.38); x.lineTo(pw * 0.62, ph * 0.72); x.closePath(); x.fill();
    x.fillRect(pw * 0.2, ph * 0.78, pw * 0.5, ph * 0.04); brush('#8a8a86', pw * 0.55, ph * 0.15, pw * 0.3, ph * 0.12, 0.2);
  } else if (st === 'landing') {      // stair landing (p40): charcoal and ochre shapes with grey washes, black frame
    x.fillStyle = '#f0eee8'; x.fillRect(0, 0, pw, ph);
    brush('#c7c3bb', pw * 0.05, ph * 0.1, pw * 0.5, ph * 0.7, 0.05); brush('#2a2826', pw * 0.4, ph * 0.12, pw * 0.38, ph * 0.66, -0.1, 0.15);
    brush('#1a1a1a', pw * 0.12, ph * 0.3, pw * 0.25, ph * 0.3, 0.2, 0.15); brush('#b28a46', pw * 0.62, ph * 0.38, pw * 0.08, ph * 0.3, 0.3); brush('#6d6b67', pw * 0.75, ph * 0.1, pw * 0.2, ph * 0.5, 0, 0.1);
  } else if (st === 'botanical') {    // workout room (p73 mirror): grey-green abstract botanical on white
    x.fillStyle = '#eceae4'; x.fillRect(0, 0, pw, ph);
    for (i = 0; i < 40; i++) { x.save(); x.translate(pw * R(), ph * R()); x.rotate(R() * TAU); x.fillStyle = ['#7d8a80', '#a3ada4', '#5f6b63', '#c9cec8', '#8a8f9a'][(R() * 5) | 0]; x.globalAlpha = 0.55;
      x.beginPath(); x.ellipse(0, 0, S * (0.04 + R() * 0.1), S * (0.015 + R() * 0.03), 0, 0, TAU); x.fill(); x.restore(); }
    x.globalAlpha = 1;
  } else {                            // plain white textured canvas (primary bedroom, bonus lounge)
    x.fillStyle = '#f1efea'; x.fillRect(0, 0, pw, ph);
    for (i = 0; i < 40; i++) { x.strokeStyle = 'rgba(0,0,0,' + (0.02 + R() * 0.04) + ')'; x.lineWidth = 1 + R() * 3; x.beginPath(); var y0 = ph * R(); x.moveTo(0, y0); x.bezierCurveTo(pw * 0.3, y0 + (R() - 0.5) * 40, pw * 0.7, y0 + (R() - 0.5) * 40, pw, y0 + (R() - 0.5) * 30); x.stroke(); }
    noise(x, pw, ph, 1400, R, ['rgba(0,0,0,.03)', 'rgba(255,255,255,.4)'], 1, 4);
  }
  var t = ctex(c, [1, 1]); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
  var m = std({ color: 0xffffff, map: t, roughness: 0.88 }); m.name = key; CUST[key] = m; return [key, m];
}

function def(kind, defaults, build, size, note) { KINDS[kind] = { kind: kind, defaults: defaults, build: build, size: size, note: note || '' }; ORDER.push(kind); }
function leg(b, mat, x, z, h, r0, r1) { b.cyl(mat, r1 || r0, r0, h, x, h / 2, z, 10); }
function legs4(b, mat, w, d, h, inset, r) { [[-1, inset], [1, inset], [-1, d - inset], [1, d - inset]].forEach(function (p) { leg(b, mat, p[0] * (w / 2 - inset), p[1], h, r, r * 0.8); }); }

/* ------------------------------------------------------------ seating */
def('sectional', { w: 9, d: 3.2, ret: 6.6, side: 1, h: 2.6, fabric: 'fabricLight', legs: 'woodDark', pillows: ['fabricDark', 'linenCream', 'fabricDark'] }, function (b, o) {
  var w = o.w, d = o.d, L = o.ret, s = o.side, f = o.fabric, lh = 0.28, seatY = lh + 0.5, bt = 0.62, aw = 0.55;
  var xr0 = s > 0 ? w / 2 - d : -w / 2, xr1 = s > 0 ? w / 2 : -w / 2 + d;          // return (chaise end) span in x
  var xa0 = s > 0 ? -w / 2 : w / 2 - aw, xa1 = xa0 + aw;                            // arm at the far end
  b.rbox(f, w, seatY - lh, d, 0.08, 0, (lh + seatY) / 2, d / 2, { seg: 2 });       // main plinth
  b.rbox(f, d, seatY - lh, L - d, 0.08, (xr0 + xr1) / 2, (lh + seatY) / 2, d + (L - d) / 2, { seg: 2 });   // return plinth
  b.rbox(f, w, o.h - seatY, bt, 0.16, 0, seatY + (o.h - seatY) / 2, bt / 2, { seg: 3 });                  // back
  var xo = s > 0 ? w / 2 - bt / 2 : -w / 2 + bt / 2;
  b.rbox(f, bt, o.h - seatY, L - 0.2, 0.16, xo, seatY + (o.h - seatY) / 2, (L - 0.2) / 2 + 0.1, { seg: 3 });   // back along the return's outer side
  b.rbox(f, aw, 2.05 - lh, d, 0.2, (xa0 + xa1) / 2, lh + (2.05 - lh) / 2, d / 2, { seg: 3 });          // track arm
  b.rbox(f, d - bt, 2.05 - lh, aw, 0.2, (xr0 + xr1) / 2 - s * bt / 2, lh + (2.05 - lh) / 2, L - aw / 2, { seg: 3 });   // arm at the end of the return
  // seat cushions
  var x0 = s > 0 ? -w / 2 + aw : -w / 2 + d, x1 = s > 0 ? w / 2 - d : w / 2 - aw, n = Math.max(2, Math.round((x1 - x0) / 2.4)), cw = (x1 - x0) / n, i;
  for (i = 0; i < n; i++) {
    b.rbox(f, cw - 0.03, 0.5, d - bt, 0.15, x0 + cw * (i + 0.5), seatY + 0.25, bt + (d - bt) / 2, { seg: 3, bulge: [0.01, 0.05, 0.02], flat: 4 });
    b.rbox(f, cw - 0.04, 1.2, 0.5, 0.2, x0 + cw * (i + 0.5), seatY + 0.5 + 0.6, bt + 0.22, { seg: 3, bulge: [0.01, 0.03, 0.08], flat: 4, rx: -0.18 });
  }
  b.rbox(f, d - bt - 0.03, 0.5, L - aw - bt - 0.03, 0.15, (xr0 + xr1) / 2 - s * bt / 2, seatY + 0.25, bt + (L - aw - bt) / 2, { seg: 3, bulge: [0.01, 0.05, 0.02], flat: 4 });   // corner + return cushion
  b.rbox(f, 0.5, 1.2, L - aw - 0.6, 0.2, xo - s * 0.4, seatY + 1.1, (L - aw) / 2 + 0.3, { seg: 3, bulge: [0.08, 0.03, 0.01], flat: 4, rz: s * 0.18 });
  // throw pillows (dark / light / dark as staged)
  var P = o.pillows || [];
  for (i = 0; i < P.length; i++) { var px = x0 + 0.9 + i * 1.25; if (px > x1 + d - 0.6) break;
    b.rbox(P[i], 1.45, 1.45, 0.36, 0.2, px, seatY + 0.5 + 0.75, bt + 0.55, { seg: 3, bulge: [0, 0, 0.12], flat: 3, rx: -0.25, ry: (i % 2 ? 0.2 : -0.2) }); }
  b.rbox(P[0] || 'fabricDark', 0.36, 1.45, 1.45, 0.2, xo - s * 0.6, seatY + 0.5 + 0.75, d + 0.4, { seg: 3, bulge: [0.12, 0, 0], flat: 3, rz: s * 0.25 });
  [[-w / 2 + 0.25, 0.25], [w / 2 - 0.25, 0.25], [-w / 2 + 0.25, d - 0.25], [w / 2 - 0.25, L - 0.25], [(xr0 + xr1) / 2 - s * (d / 2 - 0.25), L - 0.25]].forEach(function (p) { leg(b, o.legs, p[0], p[1], lh, 0.06, 0.05); });
}, function (o) { return [o.w, o.ret, o.h]; }, 'L-shaped sectional: main run along the back + return (side +1 = local +x end).');

def('clubChair', { w: 2.7, d: 2.9, h: 2.75, fabric: 'velvetCharcoal', legs: 'woodDark' }, function (b, o) {
  var w = o.w, d = o.d, f = o.fabric, lh = 0.35, seatY = 1.45, aw = 0.42;
  b.rbox(f, w, seatY - lh - 0.4, d, 0.1, 0, lh + (seatY - lh - 0.4) / 2, d / 2, { seg: 2 });
  b.rbox(f, w - 2 * aw, 0.42, d - 0.6, 0.14, 0, seatY - 0.2, 0.6 + (d - 0.6) / 2, { seg: 3, bulge: [0.01, 0.05, 0.02], flat: 4 });
  b.rbox(f, w, o.h - lh, 0.5, 0.16, 0, lh + (o.h - lh) / 2, 0.25, { seg: 3, rx: -0.06 });
  [-1, 1].forEach(function (s) { b.rbox(f, aw, 2.15 - lh, d - 0.1, 0.16, s * (w / 2 - aw / 2), lh + (2.15 - lh) / 2, d / 2 + 0.05, { seg: 3 }); });
  b.rbox('linenCream', 1.35, 1.2, 0.34, 0.18, 0, seatY + 0.7, 0.75, { seg: 3, bulge: [0, 0, 0.1], flat: 3, rx: -0.25 });
  [[-1, 0.3], [1, 0.3], [-1, d - 0.3], [1, d - 0.3]].forEach(function (p) { leg(b, o.legs, p[0] * (w / 2 - 0.22), p[1], lh, 0.055, 0.04); });
}, function (o) { return [o.w, o.d, o.h]; }, 'Track-arm club chair (velvet), lumbar pillow.');

def('bench', { w: 4.6, d: 1.6, h: 1.6, fabric: 'linenWhite', legs: 'blackMetal', tufted: false }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, ch = 0.55;
  b.rbox(o.fabric, w, ch, d, 0.12, 0, h - ch / 2, d / 2, { seg: 3, bulge: [0.01, 0.04, 0.01], flat: 4 });
  if (o.tufted) for (var i = 0; i < 6; i++) for (var j = 0; j < 2; j++) b.sphere('fabricDark', 0.03, -w / 2 + w * (i + 0.5) / 6, h + 0.005, d * (j + 0.5) / 2, 6, 4);
  [[-1, 0.15], [1, 0.15], [-1, d - 0.15], [1, d - 0.15]].forEach(function (p) { b.bb(o.legs, p[0] * (w / 2 - 0.15) - 0.05, 0, p[1] - 0.05, p[0] * (w / 2 - 0.15) + 0.05, h - ch, p[1] + 0.05); });
  b.bb(o.legs, -w / 2 + 0.15, 0.35, d / 2 - 0.03, w / 2 - 0.15, 0.41, d / 2 + 0.03);
}, function (o) { return [o.w, o.d, o.h]; }, 'Upholstered end-of-bed bench on slim legs.');

def('pouf', { s: 1.65, h: 1.45, mat: 'knitWhite' }, function (b, o) {
  b.rbox(o.mat, o.s, o.h, o.s, 0.28, 0, o.h / 2, o.s / 2, { seg: 4, bulge: [0.06, 0.04, 0.06] });
}, function (o) { return [o.s, o.s, o.h]; }, 'Chunky-knit cube pouf.');

def('ottomanRound', { dia: 2.7, h: 1.4, mat: 'seagrass' }, function (b, o) {
  var R = o.dia / 2, h = o.h;
  b.lathe(o.mat, [[0, 0], [R * 0.8, 0], [R * 0.95, h * 0.12], [R, h * 0.45], [R * 0.97, h * 0.8], [R * 0.86, h * 0.97], [R * 0.6, h], [0, h]], 48, 0, 0, R);
}, function (o) { return [o.dia, o.dia, o.h]; }, 'Round woven seagrass ottoman / coffee table.');

def('parsonsChair', { fabric: 'linenWhite', legs: 'satinBrass', seatH: 1.6 }, function (b, o) {
  var sH = o.seatH, f = o.fabric;
  b.rbox(f, 1.55, 0.36, 1.6, 0.08, 0, sH - 0.18, 0.95, { seg: 2, bulge: [0, 0.02, 0] });
  b.rbox(f, 1.55, 1.75, 0.32, 0.08, 0, sH - 0.3 + 0.88, 0.2, { seg: 2, rx: -0.06 });
  [[-0.68, 0.22], [0.68, 0.22], [-0.68, 1.65], [0.68, 1.65]].forEach(function (p) { b.bb(o.legs, p[0] - 0.035, 0, p[1] - 0.035, p[0] + 0.035, sH - 0.36, p[1] + 0.035); });
  b.bb(o.legs, -0.7, 0.1, 0.19, 0.7, 0.14, 0.25); b.bb(o.legs, -0.7, 0.1, 1.62, 0.7, 0.14, 1.68);
}, function (o) { return [1.6, 1.8, o.seatH + 1.6]; }, 'Straight-back upholstered dining chair on slim metal legs.');

def('slipChair', { fabric: 'fabricOat', seatH: 1.6 }, function (b, o) {
  var sH = o.seatH, f = o.fabric;
  b.rbox(f, 1.75, sH - 0.05, 1.8, 0.1, 0, (sH - 0.05) / 2, 1.0, { seg: 2, bulge: [0.02, 0, 0.02] });
  b.rbox(f, 1.7, 1.8, 0.4, 0.2, 0, sH + 0.8, 0.28, { seg: 3, rx: -0.08 });
  b.rbox('linenCream', 1.1, 1.0, 0.3, 0.15, 0, sH + 0.55, 0.6, { seg: 3, bulge: [0, 0, 0.08], rx: -0.25 });
}, function (o) { return [1.8, 1.9, o.seatH + 1.7]; }, 'Slipcovered host chair (skirted).');

def('outdoorLounge', { w: 2.7, d: 2.8, h: 2.3, frame: 'aluCharcoal', cushion: 'cushionWhite', style: 'box' }, function (b, o) {
  var w = o.w, d = o.d, fr = o.frame;
  if (o.style === 'slipper') {   // front porch (p38): armless slipper chair, thin black frame, white seat + tall back cushion
    [-1, 1].forEach(function (sx) { [0.2, d - 0.2].forEach(function (z) { b.bb(fr, sx * (w / 2 - 0.1) - 0.04, 0, z - 0.04, sx * (w / 2 - 0.1) + 0.04, 1.0, z + 0.04); }); });
    b.bb(fr, -w / 2 + 0.06, 0.92, 0.12, w / 2 - 0.06, 1.0, d - 0.12); b.rod(fr, [-w / 2 + 0.1, 1.0, 0.2], [-w / 2 + 0.1, o.h + 0.1, 0.02], 0.035, 8); b.rod(fr, [w / 2 - 0.1, 1.0, 0.2], [w / 2 - 0.1, o.h + 0.1, 0.02], 0.035, 8);
    b.rbox(o.cushion, w - 0.1, 0.42, d - 0.2, 0.1, 0, 1.2, 0.15 + (d - 0.2) / 2, { seg: 3, bulge: [0, 0.03, 0] });
    b.rbox(o.cushion, w - 0.15, o.h - 1.2, 0.4, 0.12, 0, 1.4 + (o.h - 1.2) / 2, 0.3, { seg: 3, rx: -0.12, bulge: [0, 0, 0.05] });
    b.rbox('stripeGrey', 1.3, 0.75, 0.3, 0.12, 0, 1.85, 0.75, { seg: 3, rx: -0.25, bulge: [0, 0, 0.08], flat: 3, boxUV: true });
    return;
  }
  if (o.style === 'shell') {   // balcony set (p10/p19): mid-grey shell, arms sweep down to the front, low back; thick seat + one big pillow
    var ah = 2.05;
    [-1, 1].forEach(function (s) { b.rbox(fr, 0.26, ah - 0.25, d - 0.15, 0.06, s * (w / 2 - 0.13), 0.25 + (ah - 0.25) / 2, (d - 0.15) / 2, { seg: 2 });
      b.rbox(fr, 0.26, 0.28, 0.9, 0.12, s * (w / 2 - 0.13), ah - 0.22, d - 0.4, { seg: 2, rx: 0.5 }); });
    b.rbox(fr, w, ah - 0.1, 0.24, 0.06, 0, 0.25 + (ah - 0.35) / 2 + 0.05, 0.12, { seg: 2 });
    b.bb(fr, -w / 2 + 0.2, 0.25, 0.2, w / 2 - 0.2, 0.55, d - 0.12, 0.04);
    [-1, 1].forEach(function (s) { [0.15, d - 0.25].forEach(function (z) { b.bb(fr, s * (w / 2 - 0.13) - 0.1, 0, z - 0.08, s * (w / 2 - 0.13) + 0.1, 0.26, z + 0.08); }); });
    b.rbox(o.cushion, w - 0.52, 0.55, d - 0.3, 0.1, 0, 0.55 + 0.27, 0.24 + (d - 0.3) / 2, { seg: 3, bulge: [0, 0.03, 0] });
    b.rbox(o.cushion, w - 0.62, 1.45, 0.42, 0.18, 0, 1.1 + 0.7, 0.5, { seg: 3, rx: -0.14, bulge: [0, 0, 0.1], flat: 3 });
    return;
  }
  [-1, 1].forEach(function (s) { b.rbox(fr, 0.28, 1.95, d, 0.05, s * (w / 2 - 0.14), 0.975, d / 2, { seg: 1 }); });
  b.rbox(fr, w, o.h - 0.2, 0.25, 0.05, 0, 0.2 + (o.h - 0.2) / 2, 0.125, { seg: 1 });
  b.bb(fr, -w / 2 + 0.28, 0.4, 0.25, w / 2 - 0.28, 0.55, d - 0.1);
  b.rbox(o.cushion, w - 0.62, 0.48, d - 0.35, 0.1, 0, 0.8, 0.3 + (d - 0.35) / 2, { seg: 3, bulge: [0, 0.03, 0] });
  b.rbox(o.cushion, w - 0.62, 1.25, 0.42, 0.12, 0, 1.6, 0.48, { seg: 3, rx: -0.12, bulge: [0, 0, 0.05] });
  b.rbox(o.cushion, 1.3, 1.0, 0.32, 0.14, 0, 1.75, 0.8, { seg: 3, rx: -0.25, bulge: [0, 0, 0.08] });
}, function (o) { return [o.w, o.d, o.h]; }, 'Outdoor lounge chair: charcoal aluminium box frame, white cushions.');

def('wickerSofa', { w: 6.4, d: 2.9, h: 2.5, seats: 3 }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, aw = 0.45;
  b.rbox('wicker', w, 1.15, d, 0.1, 0, 0.575, d / 2, { seg: 2 });
  b.rbox('wicker', w, h, 0.45, 0.1, 0, h / 2, 0.225, { seg: 2 });
  [-1, 1].forEach(function (s) { b.rbox('wicker', aw, 1.95, d, 0.1, s * (w / 2 - aw / 2), 0.975, d / 2, { seg: 2 }); });
  var iw = w - 2 * aw, n = o.seats, cw = iw / n;
  for (var i = 0; i < n; i++) { var x = -iw / 2 + cw * (i + 0.5);
    b.rbox('cushionWhite', cw - 0.04, 0.42, d - 0.5, 0.1, x, 1.35, 0.45 + (d - 0.5) / 2, { seg: 3, bulge: [0, 0.03, 0] });
    b.rbox('cushionWhite', cw - 0.06, 1.15, 0.4, 0.12, x, 2.05, 0.68, { seg: 3, rx: -0.15, bulge: [0, 0, 0.05] }); }
}, function (o) { return [o.w, o.d, o.h]; }, 'Brown all-weather wicker sofa (or club chair with seats:1) with white cushions.');

def('outdoorCoffee', { w: 3.8, d: 2.2, h: 1.3 }, function (b, o) {
  b.rbox('wicker', o.w - 0.1, o.h - 0.12, o.d - 0.1, 0.05, 0, (o.h - 0.12) / 2, o.d / 2, { seg: 1 });
  b.rbox('wood', o.w, 0.12, o.d, 0.02, 0, o.h - 0.06, o.d / 2, { seg: 1 });
}, function (o) { return [o.w, o.d, o.h]; }, 'Wicker coffee table with teak top.');

def('outdoorDiningTable', { w: 7.5, d: 3.4, h: 2.45 }, function (b, o) {
  var w = o.w, d = o.d, h = o.h;
  b.rbox('stoneWhite', w, 0.14, d, 0.03, 0, h - 0.07, d / 2, { seg: 2 });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { b.bb('aluCharcoal', p[0] * (w / 2 - 0.35) - 0.08, 0, d / 2 + p[1] * (d / 2 - 0.35) - 0.08, p[0] * (w / 2 - 0.35) + 0.08, h - 0.14, d / 2 + p[1] * (d / 2 - 0.35) + 0.08); });
  b.bb('aluCharcoal', -w / 2 + 0.35, h - 0.4, d / 2 - 0.05, w / 2 - 0.35, h - 0.14, d / 2 + 0.05);
}, function (o) { return [o.w, o.d, o.h]; }, 'Outdoor dining table: white stone top, charcoal aluminium legs.');

def('outdoorChair', {}, function (b, o) {
  var sH = 1.5;
  b.rbox('aluCharcoal', 1.8, 0.12, 1.75, 0.04, 0, sH - 0.25, 1.0, { seg: 1 });
  b.rbox('stripeCushion', 1.6, 0.3, 1.55, 0.08, 0, sH - 0.06, 1.0, { seg: 2, bulge: [0, 0.02, 0] });
  var pts = [], R = 1.0, N = 14, i;   // curved horseshoe back
  for (i = 0; i <= N; i++) { var a = -1.2 + 2.4 * i / N; pts.push(new THREE.Vector3(Math.sin(a) * R, 0, 1.0 - Math.cos(a) * R * 0.85)); }
  for (i = 0; i < N; i++) { var p = pts[i], q = pts[i + 1], mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, L = Math.hypot(q.x - p.x, q.z - p.z) + 0.02, ang = Math.atan2(q.x - p.x, q.z - p.z);
    b.boxR('aluCharcoal', 0.1, 1.05, L, mx, sH + 0.45, mz, 0, ang, 0); }
  [[-0.78, 0.25], [0.78, 0.25], [-0.78, 1.75], [0.78, 1.75]].forEach(function (p2) { b.bb('aluCharcoal', p2[0] - 0.05, 0, p2[1] - 0.05, p2[0] + 0.05, sH - 0.25, p2[1] + 0.05); });
}, function () { return [2.0, 1.95, 2.55]; }, 'Outdoor dining armchair: charcoal round back, striped seat cushion.');

def('gardenStool', { dia: 1.1, h: 1.5, mat: 'ceramicWhite' }, function (b, o) {
  var R = o.dia / 2, h = o.h;
  b.lathe(o.mat, [[0, 0], [R * 0.85, 0], [R, h * 0.15], [R * 1.05, h * 0.5], [R, h * 0.85], [R * 0.86, h], [0, h]], 28, 0, 0, R);
}, function (o) { return [o.dia, o.dia, o.h]; }, 'Ceramic garden stool.');

/* ------------------------------------------------------------ tables & storage */
def('diningTableGlass', { w: 6.6, d: 3.3, h: 2.5, frame: 'blackMetal' }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, t = 0.1, fr = o.frame;
  b.box('glass', w - 0.04, 0.04, d - 0.04, 0, h - 0.02, d / 2);
  b.box('glassEdge', w - 0.04, 0.04, 0.004, 0, h - 0.02, d - 0.022);
  b.bb(fr, -w / 2, h - 0.04 - t, 0, w / 2, h - 0.04, t); b.bb(fr, -w / 2, h - 0.04 - t, d - t, w / 2, h - 0.04, d);
  b.bb(fr, -w / 2, h - 0.04 - t, 0, -w / 2 + t, h - 0.04, d); b.bb(fr, w / 2 - t, h - 0.04 - t, 0, w / 2, h - 0.04, d);
  [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(function (p) { var x = p[0] * (w / 2 - t / 2), z = p[1] ? d - t / 2 : t / 2; b.bb(fr, x - t / 2, 0, z - t / 2, x + t / 2, h - 0.04, z + t / 2); });
}, function (o) { return [o.w, o.d, o.h]; }, 'Glass-top dining table on a black steel frame.');

def('deskX', { w: 4.6, d: 2.2, h: 2.5, frame: 'chrome' }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, fr = o.frame;
  b.box('glass', w, 0.04, d, 0, h - 0.02, d / 2); b.box('glassEdge', w, 0.04, 0.004, 0, h - 0.02, d - 0.002);
  [-1, 1].forEach(function (s) { var x = s * (w / 2 - 0.35);
    b.rod(fr, [x, 0.02, 0.2], [x, h - 0.05, d - 0.2], 0.04, 8); b.rod(fr, [x, 0.02, d - 0.2], [x, h - 0.05, 0.2], 0.04, 8); });
  b.rod(fr, [-w / 2 + 0.35, h * 0.5, d / 2], [w / 2 - 0.35, h * 0.5, d / 2], 0.03, 8);
}, function (o) { return [o.w, o.d, o.h]; }, 'Glass writing desk on chrome X legs.');

def('ovalDesk', { w: 4, d: 2.1, h: 2.5, mat: 'cabinetWhite' }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, s = new THREE.Shape();
  s.absellipse(0, d / 2, w / 2, d / 2, 0, TAU, false, 0);
  b.extrude(o.mat, s, 0.1, M(0, h, 0, HALF, 0, 0), { bevel: 0.02, bevelSegments: 2, curveSegments: 40 });
  [[-1, 0.4], [1, 0.4], [-1, d - 0.4], [1, d - 0.4]].forEach(function (p) { b.rod(o.mat, [p[0] * (w / 2 - 0.55), h - 0.05, p[1]], [p[0] * (w / 2 - 0.45), 0, p[1] + (p[1] < d / 2 ? -0.08 : 0.08)], 0.06, 10, { r2: 0.035 }); });
}, function (o) { return [o.w, o.d, o.h]; }, 'White oval writing desk on splayed tapered legs.');

def('sideboard', { w: 5.5, d: 1.6, h: 2.7, style: 'faceted', top: 'cabinetOak' }, function (b, o) {
  var w = o.w, d = o.d, h = o.h, y0 = 0.3, i, j;
  if (o.style === 'faceted') {   // black faceted (pyramid) fronts, oak case — great room, per photos
    b.rbox(o.top, w, 0.12, d, 0.02, 0, h - 0.06, d / 2, { seg: 1 });
    b.rbox(o.top, 0.12, h - 0.12, d, 0.02, -w / 2 + 0.06, (h - 0.12) / 2, d / 2, { seg: 1 }); b.rbox(o.top, 0.12, h - 0.12, d, 0.02, w / 2 - 0.06, (h - 0.12) / 2, d / 2, { seg: 1 });
    b.bb('facetNavy', -w / 2 + 0.12, y0, 0.05, w / 2 - 0.12, h - 0.12, d - 0.08);
    b.bb(o.top, -w / 2 + 0.12, 0, 0.1, w / 2 - 0.12, y0, d - 0.15);
    var cols = Math.round((w - 0.24) / 0.62), rows = 3, cw = (w - 0.24) / cols, rh = (h - 0.12 - y0) / rows;
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
      var g = new THREE.ConeGeometry(Math.min(cw, rh) * 0.68, 0.22, 4, 1); g.rotateY(PI / 4); g.rotateX(HALF); g.scale(cw / Math.min(cw, rh), rh / Math.min(cw, rh), 1);
      b.add('facetNavy', g, M(-w / 2 + 0.12 + cw * (i + 0.5), y0 + rh * (j + 0.5), d - 0.08 + 0.11)); }
  } else {                       // grey-wash four-door credenza — primary bedroom
    var m = 'greyWood';
    b.rbox(m, w, h - y0, d, 0.02, 0, y0 + (h - y0) / 2, d / 2, { seg: 1 });
    b.bb('blackMetal', -w / 2 + 0.1, 0, 0.15, w / 2 - 0.1, y0, d - 0.2);
    for (i = 1; i < 4; i++) b.bb('frameBlack', -w / 2 + w * i / 4 - 0.006, y0 + 0.08, d - 0.005, -w / 2 + w * i / 4 + 0.006, h - 0.08, d + 0.002);
    for (i = 0; i < 4; i++) b.bb('blackMetal', -w / 2 + w * (i + 0.5) / 4 - 0.25, h - 0.45, d, -w / 2 + w * (i + 0.5) / 4 + 0.25, h - 0.41, d + 0.04);
  }
}, function (o) { return [o.w, o.d, o.h]; }, 'Sideboard: style faceted (black pyramid fronts, oak case) | grey (four-door credenza).');

def('drinkTable', { dia: 1.15, h: 2.0, mat: 'stainless' }, function (b, o) {
  var R = o.dia / 2, h = o.h, m = o.mat;
  b.cyl(m, R * 0.6, R * 0.65, 0.05, 0, 0.025, R, 32); b.cyl(m, 0.05, 0.05, h - 0.1, 0, h / 2, R, 12);
  b.cyl(m, R, R, 0.04, 0, h - 0.02, R, 40); b.torus(m, R, 0.02, 0, h + 0.01, R, 6, 40, { rx: HALF });
}, function (o) { return [o.dia, o.dia, o.h]; }, 'Pedestal drink table with a lipped tray top.');

/* ------------------------------------------------------------ decor */
def('art', { w: 3, h: 3, mountY: 5.2, style: 'blots', seed: 1, frame: 'frameBlack', mat: 0, depth: 0.1, fw: 0.07 }, function (b, o) {
  var w = o.w, h = o.h, y = o.mountY, t = o.fw, dz = o.depth, km = artMat(o);
  if (o.frame) { b.bb(o.frame, -w / 2, y - h / 2, 0, w / 2, y - h / 2 + t, dz); b.bb(o.frame, -w / 2, y + h / 2 - t, 0, w / 2, y + h / 2, dz);
    b.bb(o.frame, -w / 2, y - h / 2, 0, -w / 2 + t, y + h / 2, dz); b.bb(o.frame, w / 2 - t, y - h / 2, 0, w / 2, y + h / 2, dz); }
  var iw = w - (o.frame ? 2 * t : 0), ih = h - (o.frame ? 2 * t : 0);
  if (o.mat) { b.box('matBoard', iw, ih, 0.01, 0, y, dz - 0.03); iw -= 2 * o.mat; ih -= 2 * o.mat; }
  b.useMaterial(km[0], km[1]);
  var g = new THREE.PlaneGeometry(iw, ih); b.add(km[0], g, M(0, y, dz - 0.02), { keepUV: true });
  b.box(o.frame || 'frameWhite', iw, ih, 0.02, 0, y, dz - 0.04);
}, function (o) { return [o.w, o.depth, o.mountY + o.h / 2]; }, 'Framed wall art (procedural abstract; style blots|brush|dots|circles|swirl|marks|goldsquare|wave|collage|weave|geo|landing|botanical|plain; frame frameBlack|frameOak|frameWhite|frameSilver|false; mat = mat width ft).');

def('floorMirror', { w: 2, h: 6, lean: 0.12, frame: 'frameBlack' }, function (b, o) {
  b.push(M(0, 0, 0.75, -o.lean, 0, 0));
  b.bb(o.frame, -o.w / 2, 0, -0.06, o.w / 2, o.h, 0.02);
  b.box('mirrorGlass', o.w - 0.16, o.h - 0.16, 0.01, 0, o.h / 2, 0.03);
  b.pop();
}, function (o) { return [o.w, 0.9, o.h]; }, 'Leaning floor mirror (frame frameBlack | frameSilver).');

def('yogaBall', { dia: 2.1 }, function (b, o) { b.sphere('rubberBall', o.dia / 2, 0, o.dia / 2, o.dia / 2, 28, 18); }, function (o) { return [o.dia, o.dia, o.dia]; }, 'Exercise ball.');

def('orchid', { h: 1.7, pot: 'ceramicWhite', mountY: 0, potDia: 0.7, seed: 3, stems: 3, bowl: false }, function (b, o) {
  // white phalaenopsis: broad glossy leaves fanning from the pot, arching stems with a cascade of flat blooms (photos p44, p12, p25)
  var y = o.mountY, R = o.potDia / 2, R2 = rng(o.seed * 17 + 3), cz = R, ph = o.bowl ? R * 0.75 : R * 1.15;
  if (o.bowl) b.lathe(o.pot, [[0, 0], [R * 0.45, 0], [R * 0.85, ph * 0.45], [R, ph], [R * 0.95, ph], [0, ph * 0.85]], 36, 0, y, cz);
  else b.lathe(o.pot, [[0, 0], [R * 0.75, 0], [R, R * 0.6], [R * 0.95, ph], [R * 0.85, ph * 1.04], [0, ph * 1.04]], 24, 0, y, cz);
  var nl = 5 + (o.seed % 3);
  for (var k = 0; k < nl; k++) { var a = k / nl * TAU + R2() * 0.5, L = 0.32 + R2() * 0.12;
    b.sphere('orchidLeaf', L, Math.cos(a) * L * 0.85, y + ph + 0.02, cz + Math.sin(a) * L * 0.85, 10, 6, { sx: 1, sy: 0.08, sz: 0.38, ry: -a, rz: -0.35 }); }
  for (var s2 = 0; s2 < o.stems; s2++) {
    var ex = (R2() - 0.5) * 0.7 + (s2 - (o.stems - 1) / 2) * 0.22, ez = (R2() - 0.5) * 0.35, top = y + o.h * (0.88 + R2() * 0.12), arch = 0.25 + R2() * 0.2;
    b.tube('orchidStem', [[0, y + ph, cz], [ex * 0.2, y + (top - y) * 0.6, cz + ez * 0.2], [ex * 0.6, top, cz + ez * 0.6], [ex + arch * Math.sign(ex || 1), top - 0.12, cz + ez]], 0.012, 10, 4);
    for (var f = 0; f < 8; f++) { var t = f / 7, fx = ex * (0.5 + t * 0.5) + arch * Math.sign(ex || 1) * t, fy = top - 0.04 - t * 0.28 - (R2() - 0.5) * 0.05, fz = cz + ez * (0.6 + 0.4 * t) + 0.04 + (R2() - 0.5) * 0.08;
      var r0 = 0.14 - t * 0.035, ry0 = (R2() - 0.5) * 1.2;   // three broad petals + lip, facing out
      b.sphere('petal', r0, fx, fy, fz, 10, 6, { sz: 0.22, ry: ry0 }); b.sphere('petal', r0 * 0.7, fx - r0 * 0.75, fy - r0 * 0.15, fz, 8, 5, { sz: 0.22, ry: ry0 }); b.sphere('petal', r0 * 0.7, fx + r0 * 0.75, fy - r0 * 0.15, fz, 8, 5, { sz: 0.22, ry: ry0 });
      b.sphere('petalLip', r0 * 0.28, fx, fy - r0 * 0.25, fz + 0.03, 6, 4); }
  }
}, function (o) { return [Math.max(0.9, o.potDia), Math.max(0.9, o.potDia), o.mountY + o.h]; }, 'White phalaenopsis orchid in a ceramic pot (or low planter bowl with bowl: true); mountY = surface height.');

def('vase', { h: 1.0, dia: 0.6, mat: 'ceramicWhite', mountY: 0 }, function (b, o) {
  var R = o.dia / 2, h = o.h, y = o.mountY;
  b.lathe(o.mat, [[0, 0], [R * 0.7, 0], [R, h * 0.35], [R * 0.85, h * 0.75], [R * 0.4, h * 0.92], [R * 0.45, h], [0, h]], 24, 0, y, R);
}, function (o) { return [o.dia, o.dia, o.mountY + o.h]; }, 'Ceramic vase (mountY = surface height).');

def('books', { mountY: 0, n: 3 }, function (b, o) {
  var y = o.mountY, cols = ['frameWhite', 'fabricDark', 'linenCream', 'facetNavy'];
  for (var i = 0; i < o.n; i++) b.box(cols[i % cols.length], 0.95 - i * 0.06, 0.09, 0.7 - i * 0.04, 0.02 * i, y + 0.045 + i * 0.09, 0.4, 0.05 * i);
}, function (o) { return [1, 0.8, o.mountY + o.n * 0.09]; }, 'Stack of coffee-table books.');

def('basket', { dia: 1.3, h: 1.25 }, function (b, o) {
  var R = o.dia / 2; b.cyl('seagrass', R, R * 0.9, o.h, 0, o.h / 2, R, 28, { open: true }); b.cyl('seagrass', R * 0.9, R * 0.9, 0.04, 0, 0.02, R, 28);
}, function (o) { return [o.dia, o.dia, o.h]; }, 'Woven seagrass basket.');

def('throwBlanket', { w: 1.3, mountY: 1.6, mat: 'fabricDark' }, function (b, o) {
  b.rbox(o.mat, o.w, 0.06, 2.0, 0.02, 0, o.mountY + 0.03, 1.0, { seg: 1 });
}, function (o) { return [o.w, 2, o.mountY]; }, 'Folded throw draped over a seat.');

def('rug2', { w: 8, d: 10, pattern: 'sisal', color: null, accent: null, thick: 0.03 }, function (b, o) {
  var km = rugMat(o), w = o.w, d = o.d;
  b.useMaterial(km[0], km[1]);
  var g = new THREE.BoxGeometry(w, o.thick, d); b.add(km[0], g, M(0, o.thick / 2 + 0.003, d / 2), { keepUV: true });
}, function (o) { return [o.w, o.d, o.thick]; }, 'Area rug: pattern checker | sisal | juteGrey | darkSisal | creamWool.');


/* ------------------------------------------------------------ v20 decor: soft goods, lamps, tabletop, bath (from the listing photos)
   Tabletop / soft pieces take opts.mountY (surface height) like orchid/vase. Several small things of one kind are built as ONE piece
   (pillows, towelStack, books) so a room adds a handful of meshes, not dozens. */
var BX = { boxUV: true };
// throw pillows in a row: items [[mat, x, w, h, ry, z, rx]] (x across the seat, z from the back of the piece; lean = backward tilt)
def('pillows', { items: [['pillowCream', 0, 1.5, 1.5]], mountY: 1.4, t: 0.42, lean: -0.26 }, function (b, o) {
  o.items.forEach(function (it) { var w = it[2] || 1.5, h = it[3] || w, z = it[5] || 0, rx = it[6] != null ? it[6] : o.lean, t = Math.min(o.t, w * 0.32);
    b.rbox(it[0], w, h, t, Math.min(0.2, t * 0.48), it[1] || 0, o.mountY + Math.cos(rx) * h / 2 - 0.04, z + t / 2 - Math.sin(rx) * h / 2, { seg: 3, bulge: [0, 0, t * 0.3], flat: 3, rx: rx, ry: it[4] || 0, boxUV: true }); });
}, function (o) { var x0 = 0, x1 = 0, hm = 0; o.items.forEach(function (it) { x0 = Math.min(x0, (it[1] || 0) - (it[2] || 1.5) / 2); x1 = Math.max(x1, (it[1] || 0) + (it[2] || 1.5) / 2); hm = Math.max(hm, it[3] || it[2] || 1.5); }); return [x1 - x0, 0.9, o.mountY + hm]; },
  'Row of throw pillows: items [[material, x, w, h, ry, z, rx]] on a seat or bed at mountY.');

// bed scarf / folded coverlet across the foot of a bed: top panel + two side drops (mountY = duvet top)
def('bedRunner', { w: 5.6, d: 1.7, drop: 1.0, mountY: 1.97, mat: 'scarfArrow', t: 0.05 }, function (b, o) {
  var w = o.w, d = o.d, y = o.mountY;
  b.rbox(o.mat, w, o.t, d, 0.02, 0, y + o.t / 2, d / 2, { seg: 1, bulge: [0, 0.02, 0], flat: 3, boxUV: true });
  [-1, 1].forEach(function (s) { b.rbox(o.mat, o.t, o.drop, d, 0.02, s * (w / 2 + o.t / 2 - 0.02), y - o.drop / 2 + o.t, d / 2, { seg: 1, boxUV: true }); });
}, function (o) { return [o.w + 0.1, o.d, o.mountY + o.t]; }, 'Bed scarf / folded coverlet across the bed (mountY = duvet top).');

// throw draped over an arm, a bench end or the foot of a bed: top run (len) + a drop down the front (drop), optional fringe
def('throwDrape', { w: 1.4, len: 1.6, drop: 1.2, mountY: 2.05, mat: 'throwCharcoal', t: 0.07, ry: 0, fringe: false }, function (b, o) {
  b.push(M(0, 0, 0, 0, o.ry, 0));
  b.rbox(o.mat, o.w, o.t, o.len, 0.03, 0, o.mountY + o.t / 2, o.len / 2, { seg: 2, bulge: [0, 0.03, 0], flat: 3, boxUV: true });
  b.rbox(o.mat, o.w, o.drop, o.t, 0.03, 0, o.mountY - o.drop / 2 + o.t, o.len + o.t / 2, { seg: 2, bulge: [0, 0, 0.03], flat: 3, rx: 0.06, boxUV: true });
  if (o.fringe) for (var i = 0; i < 14; i++) b.box(o.mat, 0.03, 0.22, 0.02, -o.w / 2 + o.w * (i + 0.5) / 14, o.mountY - o.drop - 0.05 + o.t, o.len + o.t / 2 + 0.02);
  b.pop();
}, function (o) { return [o.w, o.len + 0.2, o.mountY + o.t]; }, 'Draped throw: top run + front drop (+ fringe).');

// table lamps by style (photos): ribbed white column (p06/p74), gourd (p63/p64), stacked grey (p20), square column + square shade (p58), tall white (p44)
def('lamp', { style: 'ribbed', h: 2.2, mountY: 0, base: 'ceramicWhite', shade: 'shadeWhite', shadeDia: 1.25, shadeH: 0.8, square: false }, function (b, o) {
  var y = o.mountY, h = o.h, sH = o.shadeH, bh = h - sH - 0.22, R0 = o.shadeDia / 2, cz = R0, pts;
  if (o.style === 'ribbed') pts = [[0, 0], [0.2, 0], [0.24, 0.04], [0.3, bh * 0.15], [0.31, bh * 0.6], [0.27, bh * 0.85], [0.12, bh * 0.95], [0.05, bh], [0, bh]];
  else if (o.style === 'gourd') pts = [[0, 0], [0.18, 0], [0.26, bh * 0.12], [0.33, bh * 0.3], [0.2, bh * 0.52], [0.25, bh * 0.66], [0.13, bh * 0.85], [0.06, bh * 0.92], [0.07, bh], [0, bh]];
  else if (o.style === 'drum') pts = [[0, 0], [0.27, 0], [0.29, 0.04], [0.29, bh * 0.88], [0.22, bh * 0.96], [0.06, bh], [0, bh]];
  else if (o.style === 'stacked') pts = [[0, 0], [0.24, 0], [0.3, bh * 0.12], [0.22, bh * 0.26], [0.34, bh * 0.45], [0.24, bh * 0.62], [0.3, bh * 0.75], [0.12, bh * 0.92], [0.06, bh], [0, bh]];
  else pts = [[0, 0], [0.22, 0], [0.22, 0.05], [0.13, 0.08], [0.13, bh * 0.92], [0.17, bh * 0.95], [0.06, bh], [0, bh]];
  var rib = o.style === 'ribbed' ? function (g) { var p = g.attributes.position; for (var i = 0; i < p.count; i++) { var X = p.getX(i), Z = p.getZ(i), a = Math.atan2(Z, X), k = 1 + 0.045 * Math.max(0, Math.cos(a * 22)); p.setX(i, X * k); p.setZ(i, Z * k); } g.computeVertexNormals(); } : null;
  if (o.style === 'column') { b.box(o.base, 0.42, 0.06, 0.42, 0, y + 0.03, cz); b.box(o.base, 0.18, bh - 0.06, 0.18, 0, y + bh / 2 + 0.03, cz); }
  else b.lathe(o.base, pts, 40, 0, y, cz, { deform: rib });
  b.cyl('nickel', 0.02, 0.02, sH * 0.7 + 0.22, 0, y + bh + (sH * 0.7 + 0.22) / 2, cz, 8);
  b.sphere('bulb', 0.09, 0, y + h - sH * 0.55, cz, 12, 8);
  if (o.square) b.cyl(o.shade, R0 * 0.82 * 1.3, R0 * 1.3, sH, 0, y + h - sH / 2, cz, 4, { open: true, ry: PI / 4 });
  else b.cyl(o.shade, R0 * 0.88, R0, sH, 0, y + h - sH / 2, cz, 40, { open: true });
}, function (o) { return [o.shadeDia * (o.square ? 1.3 : 1), o.shadeDia, o.mountY + o.h]; }, 'Table lamp: style ribbed | gourd | stacked | column (+square shade); shade shadeWhite | shadeLinen.');

// footed bowl (dining centrepiece p34/p16: white ceramic, two lug handles) or planter bowl (living orchid p44)
def('bowl', { dia: 1.5, h: 0.95, mat: 'ceramicMatte', mountY: 0, foot: true, handles: true, fill: null }, function (b, o) {
  var R0 = o.dia / 2, h = o.h, y = o.mountY, cz = R0, f = o.foot ? h * 0.42 : 0;
  if (o.foot) b.lathe(o.mat, [[0, 0], [R0 * 0.3, 0], [R0 * 0.3, 0.02], [R0 * 0.2, f * 0.6], [R0 * 0.22, f], [0, f]], 32, 0, y, cz);
  b.lathe(o.mat, [[0, f], [R0 * 0.35, f], [R0 * 0.8, f + (h - f) * 0.45], [R0, h], [R0 * 0.96, h], [R0 * 0.76, f + (h - f) * 0.5], [R0 * 0.3, f + 0.06], [0, f + 0.06]], 48, 0, y, cz);
  if (o.handles) [-1, 1].forEach(function (s) { b.torus(o.mat, 0.1, 0.03, s * (R0 * 0.93), y + h - 0.16, cz, 8, 16, { ry: HALF }); });
  if (o.fill === 'apples') { var Rr = rng(5); for (var i = 0; i < 6; i++) { var a = i / 6 * TAU, r = i ? R0 * 0.45 : 0; b.sphere('appleGreen', 0.16, Math.cos(a) * r, y + h - 0.06 + (i ? 0 : 0.1), cz + Math.sin(a) * r, 12, 9, { sy: 0.92 }); } }
}, function (o) { return [o.dia, o.dia, o.mountY + o.h]; }, 'Ceramic bowl (footed with handles, or planter; fill apples).');

// vases and jars: style bottle | ribbed | jar (ginger jar with lid) | cylinder | round | gourd (pair-ready via n + gap)
def('vase2', { style: 'bottle', h: 1.0, dia: 0.5, mat: 'ceramicMatte', mountY: 0, n: 1, gap: 0.15, hs: null }, function (b, o) {
  for (var k = 0; k < o.n; k++) {
    var hh = o.h * (o.hs ? o.hs[k] : (k ? 0.78 : 1)), R0 = o.dia / 2 * (o.hs ? 1 : (k ? 0.9 : 1)), x = (k - (o.n - 1) / 2) * (o.dia + o.gap), y = o.mountY, cz = o.dia / 2, pts;
    if (o.style === 'jar') pts = [[0, 0], [R0 * 0.6, 0], [R0, hh * 0.35], [R0 * 0.85, hh * 0.72], [R0 * 0.45, hh * 0.82], [R0 * 0.48, hh * 0.86], [R0 * 0.52, hh * 0.9], [R0 * 0.3, hh], [0, hh]];
    else if (o.style === 'cylinder') pts = [[0, 0], [R0 * 0.92, 0], [R0, hh * 0.08], [R0, hh * 0.86], [R0 * 0.75, hh * 0.95], [R0 * 0.55, hh], [0, hh]];
    else if (o.style === 'round') pts = [[0, 0], [R0 * 0.5, 0], [R0, hh * 0.45], [R0 * 0.8, hh * 0.85], [R0 * 0.55, hh], [0, hh * 0.98]];
    else if (o.style === 'gourd') pts = [[0, 0], [R0 * 0.55, 0], [R0, hh * 0.3], [R0 * 0.75, hh * 0.58], [R0 * 0.45, hh * 0.7], [R0 * 0.5, hh * 0.86], [R0 * 0.3, hh], [0, hh]];
    else pts = [[0, 0], [R0 * 0.7, 0], [R0, hh * 0.35], [R0 * 0.85, hh * 0.75], [R0 * 0.4, hh * 0.92], [R0 * 0.45, hh], [0, hh]];
    var rib = o.style === 'ribbed' ? function (g) { var p = g.attributes.position; for (var i = 0; i < p.count; i++) { var X = p.getX(i), Z = p.getZ(i), a = Math.atan2(Z, X), kk = 1 + 0.05 * Math.abs(Math.cos(a * 9)); p.setX(i, X * kk); p.setZ(i, Z * kk); } g.computeVertexNormals(); } : null;
    b.lathe(o.mat, pts, 32, x, y, cz, { deform: rib });
  }
}, function (o) { return [o.n * o.dia + (o.n - 1) * o.gap, o.dia, o.mountY + o.h]; }, 'Vase / jar (styles bottle ribbed jar cylinder round gourd), n in a row.');

def('decorBox', { w: 0.95, d: 0.6, h: 0.32, mat: 'creamBox', mountY: 0 }, function (b, o) {
  b.rbox(o.mat, o.w, o.h - 0.04, o.d, 0.01, 0, o.mountY + (o.h - 0.04) / 2, o.d / 2, { seg: 1 }); b.rbox(o.mat, o.w + 0.03, 0.05, o.d + 0.03, 0.01, 0, o.mountY + o.h - 0.025, o.d / 2, { seg: 1 });
}, function (o) { return [o.w, o.d, o.mountY + o.h]; }, 'Lidded decorative box.');

def('knot', { s: 0.35, mat: 'ceramicMatte', mountY: 0 }, function (b, o) {
  var g = new THREE.TorusKnotGeometry(o.s * 0.42, o.s * 0.12, 64, 10, 2, 3); b.add(o.mat, g, M(0, o.mountY + o.s * 0.62, o.s * 0.6, HALF * 0.6, 0, 0));
}, function (o) { return [o.s * 1.2, o.s * 1.2, o.mountY + o.s * 1.2]; }, 'White ceramic knot sculpture (living console p23).');

def('coral', { s: 0.8, mountY: 0 }, function (b, o) {
  var R = rng(9), y = o.mountY, cz = 0.3; b.box('ceramicBlack', 0.5, 0.08, 0.32, 0, y + 0.04, cz);
  for (var i = 0; i < 18; i++) { var a = R() * TAU, r = R() * o.s * 0.4, hh = 0.2 + R() * o.s * 0.5; b.rod('coralWhite', [Math.cos(a) * r * 0.3, y + 0.08, cz + Math.sin(a) * r * 0.2], [Math.cos(a) * r, y + 0.08 + hh, cz + Math.sin(a) * r * 0.5], 0.025, 5, { r2: 0.035 }); }
}, function (o) { return [o.s, 0.6, o.mountY + o.s * 0.7]; }, 'White coral on a black stand (study desk x04).');

// folded towels: stack of n, or rolled (roll: true) in a row
def('towelStack', { n: 2, w: 1.1, d: 0.62, t: 0.16, mountY: 0, roll: false, mat: 'towelWhite' }, function (b, o) {
  for (var i = 0; i < o.n; i++) {
    if (o.roll) b.cyl(o.mat, o.t * 1.2, o.t * 1.2, o.w, (i - (o.n - 1) / 2) * o.t * 2.6, o.mountY + o.t * 1.2, o.d / 2, 16, { rx: HALF });
    else b.rbox(o.mat, o.w - i * 0.02, o.t, o.d, o.t * 0.45, 0, o.mountY + o.t * (i + 0.5), o.d / 2, { seg: 3, bulge: [0, 0.01, 0], boxUV: true });
  }
}, function (o) { return o.roll ? [o.n * o.t * 2.6, o.w, o.mountY + o.t * 2.4] : [o.w, o.d, o.mountY + o.n * o.t]; }, 'Folded (stacked) or rolled white towels.');

def('soapPump', { mountY: 0, mat: 'ceramicMatte', h: 0.55 }, function (b, o) {
  var y = o.mountY, h = o.h; b.lathe(o.mat, [[0, 0], [0.1, 0], [0.11, h * 0.08], [0.11, h * 0.65], [0.06, h * 0.75], [0, h * 0.75]], 20, 0, y, 0.12);
  b.cyl('nickel', 0.025, 0.025, h * 0.22, 0, y + h * 0.86, 0.12, 8); b.box('nickel', 0.035, 0.03, 0.14, 0, y + h * 0.96, 0.18);
}, function (o) { return [0.24, 0.3, o.mountY + o.h]; }, 'Soap / lotion pump.');

def('succulent', { pot: 'bowl', dia: 1.0, mountY: 0, mat: 'ceramicWhite' }, function (b, o) {
  var R0 = o.dia / 2, y = o.mountY, cz = R0, ph = o.pot === 'square' ? R0 * 1.3 : R0 * 0.95, R = rng(12);
  if (o.pot === 'square') { b.box('satinBrass', o.dia * 0.8, ph, o.dia * 0.8, 0, y + ph / 2, cz); }
  else b.lathe(o.mat, [[0, 0], [R0 * 0.55, 0], [R0 * 0.92, ph * 0.5], [R0, ph], [R0 * 0.94, ph], [0, ph * 0.9]], 36, 0, y, cz);
  for (var k = 0; k < 3; k++) for (var i = 0; i < 7 + k * 3; i++) { var a = i / (7 + k * 3) * TAU + k * 0.4, r = (0.08 + k * 0.1) * o.dia, L = (0.14 + k * 0.05) * o.dia;
    b.sphere('succulentGreen', L, Math.cos(a) * r, y + ph + 0.06 + (2 - k) * 0.05 * o.dia, cz + Math.sin(a) * r, 8, 6, { sx: 0.55, sy: 0.32, sz: 1, ry: -a + HALF, rx: -0.5 + k * 0.25 }); }
}, function (o) { return [o.dia, o.dia, o.mountY + o.dia]; }, 'Succulent (echeveria) in a white bowl or brass square pot.');

def('trayRound', { dia: 1.3, mountY: 0, mat: 'rattanTray' }, function (b, o) {
  var R0 = o.dia / 2; b.cyl(o.mat, R0 * 0.94, R0 * 0.94, 0.03, 0, o.mountY + 0.015, R0, 40); b.cyl(o.mat, R0, R0 * 0.94, 0.2, 0, o.mountY + 0.1, R0, 40, { open: true });
}, function (o) { return [o.dia, o.dia, o.mountY + 0.2]; }, 'Round woven tray.');

def('cuttingBoard', { dia: 1.4, n: 1, mountY: 0, mat: 'boardWood' }, function (b, o) {
  for (var i = 0; i < o.n; i++) b.cyl(o.mat, o.dia / 2 - i * 0.08, o.dia / 2 - i * 0.08, 0.06, 0, o.mountY + 0.03 + i * 0.065, o.dia / 2, 40);
  if (o.n === 1) b.box(o.mat, 0.22, 0.06, 0.45, o.dia / 2 + 0.2, o.mountY + 0.03, o.dia / 2, 0);
}, function (o) { return [o.dia + (o.n === 1 ? 0.45 : 0), o.dia, o.mountY + o.n * 0.065]; }, 'Round wood board(s).');

def('canisters', { n: 2, h: 0.7, dia: 0.42, mountY: 0 }, function (b, o) {
  for (var i = 0; i < o.n; i++) { var x = (i - (o.n - 1) / 2) * (o.dia + 0.08), hh = o.h * (i ? 0.8 : 1);
    b.cyl('ceramicWhite', o.dia / 2, o.dia / 2, hh, x, o.mountY + hh / 2, o.dia / 2, 24); b.cyl('boardWood', o.dia / 2 + 0.01, o.dia / 2 + 0.01, 0.07, x, o.mountY + hh + 0.035, o.dia / 2, 24); }
}, function (o) { return [o.n * (o.dia + 0.08), o.dia, o.mountY + o.h + 0.07]; }, 'White kitchen canisters with wood lids.');

def('wineSet', { mountY: 0 }, function (b, o) {
  var y = o.mountY; b.rbox('ceramicWhite', 1.2, 0.05, 0.55, 0.01, 0, y + 0.025, 0.3, { seg: 1 });
  [-0.38, -0.2].forEach(function (x, i) { b.lathe('wineGlass', [[0, 0], [0.12, 0], [0.13, 0.65], [0.06, 0.78], [0.04, 0.95], [0.045, 1.0], [0, 1.0]], 16, x, y + 0.05, 0.3 + i * 0.05); });
  [0.05, 0.25, 0.45].forEach(function (x) { b.lathe('glassClear', [[0, 0], [0.12, 0], [0.12, 0.02], [0.015, 0.03], [0.015, 0.32], [0.1, 0.4], [0.13, 0.55], [0.11, 0.66], [0.105, 0.66], [0, 0.4]], 16, x, y + 0.05, 0.3); });
}, function (o) { return [1.2, 0.6, o.mountY + 1.05]; }, 'Two wine bottles and three glasses on a white tray (bonus-lounge counter p65).');

// round wall mirror with a thin black frame (entry p54)
def('wallMirror', { dia: 2.6, mountY: 5.4, frame: 'frameBlack', depth: 0.08 }, function (b, o) {
  var R0 = o.dia / 2, y = o.mountY; b.torus(o.frame, R0 - 0.04, 0.045, 0, y, o.depth, 10, 64);
  b.cyl('mirrorGlass', R0 - 0.06, R0 - 0.06, 0.02, 0, y, o.depth - 0.02, 64, { rx: HALF });
  b.cyl('frameBlack', R0 - 0.08, R0 - 0.08, 0.04, 0, y, 0.03, 32, { rx: HALF });
}, function (o) { return [o.dia, o.depth + 0.05, o.mountY + o.dia / 2]; }, 'Round wall mirror, thin black frame.');

// round stone drum side table (living p44/p51) and a four-leg round wood side table (sitting area p12)
def('drumTable', { dia: 1.4, h: 1.75, mat: 'stoneTravertine' }, function (b, o) {
  var R0 = o.dia / 2, h = o.h; b.lathe(o.mat, [[0, 0], [R0 * 0.8, 0], [R0 * 0.7, h * 0.1], [R0 * 0.42, h * 0.5], [R0 * 0.5, h * 0.88], [R0, h * 0.92], [R0, h], [0, h]], 40, 0, 0, R0);
}, function (o) { return [o.dia, o.dia, o.h]; }, 'Travertine drum / pedestal side table.');
def('woodSideTable', { dia: 1.9, h: 1.85, mat: 'oakPale' }, function (b, o) {
  var R0 = o.dia / 2, h = o.h, cz = R0; b.cyl(o.mat, R0, R0, 0.14, 0, h - 0.07, cz, 40);
  for (var i = 0; i < 4; i++) { var a = i * HALF + PI / 4, r = R0 * 0.62; b.box(o.mat, 0.2, h - 0.14, 0.2, Math.cos(a) * r, (h - 0.14) / 2, cz + Math.sin(a) * r); }
  b.torus(o.mat, R0 * 0.62, 0.05, 0, h * 0.25, cz, 6, 32, { rx: HALF });
}, function (o) { return [o.dia, o.dia, o.h]; }, 'Round wood side table on four square legs with a lower ring.');


/* ------------------------------------------------------------ v20 decor round 2: bath hardware + hanging towels, stair-landing window seat
   Hardware and the seat base are BUILT-INS (the page tags them category 'builtin': they stay with the furniture off); towels, the seat
   cushion and pillows are their contents (hide with the furniture). Origin = back centre on the wall / floor, front +z. */
def('towelRing', { mountY: 4.0, dia: 0.55, finish: 'nickel' }, function (b, o) {
  var y = o.mountY, m = o.finish, R0 = o.dia / 2;
  b.cyl(m, 0.1, 0.1, 0.04, 0, y, 0.02, 24, { rx: HALF });                 // round backplate
  b.cyl(m, 0.025, 0.025, 0.12, 0, y, 0.09, 10, { rx: HALF });              // post
  b.torus(m, R0, 0.022, 0, y - R0 + 0.02, 0.15, 8, 40);                     // ring parallel to the wall, hung from the post
}, function (o) { return [o.dia, 0.2, o.mountY + 0.1]; }, 'Towel ring (brushed nickel): backplate, post, ring.');
def('towelHook', { mountY: 5.6, finish: 'nickel' }, function (b, o) {
  var y = o.mountY, m = o.finish; b.cyl(m, 0.06, 0.06, 0.04, 0, y, 0.02, 20, { rx: HALF }); b.rod(m, [0, y, 0.04], [0, y - 0.04, 0.2], 0.02, 8); b.sphere(m, 0.03, 0, y - 0.02, 0.21, 8, 6);
}, function (o) { return [0.14, 0.22, o.mountY + 0.06]; }, 'Robe hook.');
// towel hanging from a bar (style 'bar': folded over, front + back panel) or through a ring (style 'ring'); mountY = bar / ring-bottom height
def('towelHang', { style: 'bar', w: 1.5, drop: 1.5, mountY: 4.0, z: 0.21, mat: 'towelWhite', t: 0.05 }, function (b, o) {
  var y = o.mountY, w = o.w, d = o.drop, t = o.t, z = o.z;
  if (o.style === 'ring') {
    b.rbox(o.mat, w, d, t, 0.02, 0, y - d / 2 + 0.02, z - 0.035, { seg: 1, bulge: [0, 0, 0.015], boxUV: true });
    b.rbox(o.mat, w * 0.96, d * 0.92, t, 0.02, 0, y - d * 0.46 + 0.02, z + 0.035, { seg: 1, bulge: [0, 0, 0.02], boxUV: true });
    b.cyl(o.mat, 0.06, 0.06, w * 0.9, 0, y + 0.02, z, 12, { rz: HALF });   // fold over the ring
  } else {
    b.rbox(o.mat, w, d, t, 0.02, 0, y - d / 2, z + 0.06, { seg: 1, bulge: [0, 0, 0.02], boxUV: true });
    b.rbox(o.mat, w, d * 0.82, t, 0.02, 0, y - d * 0.41, z - 0.06, { seg: 1, boxUV: true });
    b.cyl(o.mat, 0.075, 0.075, w, 0, y + 0.01, z, 12, { rz: HALF });
  }
}, function (o) { return [o.w, 0.3, o.mountY + 0.1]; }, 'Hanging towel over a bar or through a ring.');
// built-in window seat (stair landing p36/p40): painted plinth box; cushion as its own piece
def('windowSeat', { w: 5.9, d: 1.9, h: 1.05, mat: 'cabinetWhite' }, function (b, o) {
  b.bb(o.mat, -o.w / 2, 0.3, 0, o.w / 2, o.h, o.d - 0.02, 0.01); b.bb(o.mat, -o.w / 2 + 0.03, 0, 0, o.w / 2 - 0.03, 0.3, o.d - 0.12, 0.005);
  b.bb(o.mat, -o.w / 2, o.h - 0.06, o.d - 0.04, o.w / 2, o.h, o.d + 0.02, 0.01);
}, function (o) { return [o.w, o.d + 0.02, o.h]; }, 'Built-in window seat base (painted).');
def('seatCushion', { w: 5.9, d: 1.9, t: 0.38, mountY: 1.05, fabric: 'seatGrey' }, function (b, o) {
  b.rbox(o.fabric, o.w - 0.04, o.t, o.d - 0.04, 0.09, 0, o.mountY + o.t / 2, o.d / 2, { seg: 3, bulge: [0, 0.03, 0], flat: 4 });
}, function (o) { return [o.w, o.d, o.mountY + o.t]; }, 'Box seat cushion.');

/* ------------------------------------------------------------ API */
STAGE.has = function (kind) { return !!KINDS[kind] || (FIX.kinds || []).some(function (k) { return k.kind === kind; }); };
STAGE.make = function (kind, o) {
  var K = KINDS[kind];
  if (!K) { var g0 = FIX.make(kind, o); return g0; }
  var oo = opt(K.defaults, o), b = new Builder();
  K.build(b, oo);
  var g = b.build(kind);
  g.userData = { kind: kind, category: 'furniture', opts: oo, size: K.size(oo) };
  return g;
};
STAGE.sizeOf = function (kind, o) { var K = KINDS[kind]; if (K) return K.size(opt(K.defaults, o)); return FIX.sizeOf(kind, o); };
STAGE.kinds = ORDER.map(function (k) { return { kind: k, note: KINDS[k].note }; });
global.STAGE = STAGE;
})(typeof window !== 'undefined' ? window : this);
