/* gi-r43: baked indirect light for the 3D tour - a prototype for the kitchen, the dining & sitting area (great room) and the living room.
   Loaded only with ?gi=1 (or ?gi=bake for the bake tools in gi-bake.js); without the flag tour/index.html never requests this file.

   What it does:
   - The sun stays a real-time light with real-time shadows. Only indirect light is precomputed: an irradiance volume, a grid of light
     probes (spherical harmonics L1 per colour, 1.25 ft apart) over the three rooms, path traced on the GPU over the tour's own scene.
   - Separate components keep the time of day continuous: the sky through the windows (baked per sun position with that time's painted
     sky, tinted at run time by the sky the page is drawing now), the sun's bounce (baked with a unit white sun at the same positions,
     scaled by the sun's colour and intensity now) and the room lamps' bounce (scaled by the lamps now). Sun positions are blended with
     smooth weights on the angle to the current sun, so dragging the sun glides.
   - Every standard material inside the rooms takes its diffuse indirect light from the volume instead of the room panorama and the
     hemisphere fill (shader hook appended to the r40 two-environment chunks); reflections keep the panorama, scaled by the volume's
     brightness. A baked ambient-occlusion volume (4 in grid) adds contact shadow; in these rooms SSAO and the r13 corner bands fade out.
   - Off for the design ideas (they move walls), and when the data or WebGL2 is missing. */
(function(){
'use strict';
const Q = location.search, MM = /[?&]gi=([a-z0-9]+)/i.exec(Q), MODE = MM ? MM[1].toLowerCase() : '';
if(!MODE || MODE === '0' || !window.THREE) return;
const V3 = THREE.Vector3;
const qp = (k, d) => { const m = new RegExp('[?&]' + k + '=([^&]*)').exec(Q); return m ? decodeURIComponent(m[1]) : d; };
const GI = window.GI = {mode: MODE, ver: 2, on: false, ready: false, why: 'loading', H: null, n: 0, composes: 0, k: 0, t: 0, ssaoK: 0,
  // tuning (also from the URL: &gigain=, &gispec=, &giao=, &gissao=keep)
  EV: 5.5, ev: qp('giev', ''), wb: +qp('giwb', .9), wbLight: +qp('giwbl', .5), spec: +qp('gispec', .7), aoK: +qp('giao', 1), hemiKill: 1, sigma: +qp('gisig', .2), keepSSAO: qp('gissao', '') === 'keep',
  base: qp('gibase', 'gi/'),
  U: {giOn: {value: 0}, giK: {value: 0}, giGain: {value: new V3(1, 1, 1)}, giHemi: {value: 1}, giSpec: {value: .7}, giAOK: {value: 1},
    giT0: {value: null}, giT1: {value: null}, giAO: {value: null}, giRoom: {value: null},
    giB0: {value: new V3()}, giBS: {value: new V3(1, 1, 1)}, giN: {value: new V3(1, 1, 1)}, giNOff: {value: .45},
    giRB: {value: new THREE.Vector4()}, giRY: {value: new THREE.Vector2(-1, 15)},
    giA0: {value: new V3()}, giAS: {value: new V3(1, 1, 1)}, giAN: {value: new V3(1, 1, 1)}, giAT: {value: new THREE.Vector2(1, 1)}, giAOff: {value: .2}}};
GI.log = [];
const say = (...a) => { GI.log.push(a.join(' ')); if(GI.log.length > 60) GI.log.shift(); };
// ?gi=2: tier B as well (gi-rt.js: the indirect light traced per pixel while the camera rests; it uses the bake's tracer). Not on phones yet.
GI.tierB = MODE === '2' && (!matchMedia('(pointer:coarse)').matches || qp('girt', '') === 'force');
if(MODE === 'bake' || GI.tierB) document.write('<script src="gi-bake.js?v=' + (qp('gibv', '2')) + '"><\/script>');
if(GI.tierB) document.write('<script src="gi-rt.js?v=' + (qp('gibv', '2')) + '"><\/script>');
if(qp('giqa', '')) document.write('<script src="gi-qa.js?v=' + (qp('gibv', '2')) + '"><\/script>');

/* ---------------- shader hooks (appended to the r40 chunks, so they only exist where r40's interior mask r40m does) ---------------- */
const G = '#if defined( STANDARD ) && defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )';
function patchChunks(){ const C = THREE.ShaderChunk; if(C.__gi) return true; C.__gi = 1;
  C.envmap_physical_pars_fragment += `
${G}
uniform vec3 giGain; uniform float giOn, giK, giHemi, giSpec, giAOK, giNOff, giAOff; uniform highp sampler2D giT0, giT1; uniform sampler2D giAO, giRoom;
uniform vec3 giB0, giBS, giN, giA0, giAS, giAN; uniform vec4 giRB; uniform vec2 giRY, giAT;
float giRoomW( vec3 P ){ vec2 uv = ( P.xz - giRB.xy ) * giRB.zw; if( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || P.y < giRY.x || P.y > giRY.y ) return 0.0; return texture2D( giRoom, uv ).r; }
vec3 giIrr( vec3 P, vec3 n ){
  vec3 g = clamp( ( P - giB0 ) * giBS, vec3( 0.0 ), giN - 1.0 ); float y0 = floor( g.y ), f = g.y - y0, y1 = min( y0 + 1.0, giN.y - 1.0 );
  vec2 s = vec2( g.x + 0.5, g.z + 0.5 ) / vec2( giN.x, giN.z * giN.y ), u0 = s + vec2( 0.0, y0 / giN.y ), u1 = s + vec2( 0.0, y1 / giN.y );
  vec4 A = mix( texture2D( giT0, u0 ), texture2D( giT0, u1 ), f ); vec2 B = mix( texture2D( giT1, u0 ).rg, texture2D( giT1, u1 ).rg, f );
  float l = max( dot( A.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-6 );
  return A.rgb * max( 1.0 + dot( vec3( A.a, B ), n ) / l, 0.0 ); }
float giAOat( vec3 P, vec3 n ){
  vec3 g = clamp( ( P - giA0 ) * giAS, vec3( 0.0 ), giAN - 1.0 ); float y0 = floor( g.y ), f = g.y - y0, y1 = min( y0 + 1.0, giAN.y - 1.0 );
  vec2 s = vec2( g.x + 0.5, g.z + 0.5 ) / ( vec2( giAN.x, giAN.z ) * giAT );
  vec2 t0 = vec2( mod( y0, giAT.x ), floor( y0 / giAT.x ) ) / giAT, t1 = vec2( mod( y1, giAT.x ), floor( y1 / giAT.x ) ) / giAT;
  vec4 v = mix( texture2D( giAO, s + t0 ), texture2D( giAO, s + t1 ), f ); return clamp( v.r + dot( v.gba * 2.0 - 1.0, n ), 0.0, 1.0 ); }
${GI.rt ? GI.rt.PARS : ''}
#endif
`;
  C.lights_fragment_maps += `
${G}
if( giOn > 0.5 ){
  vec3 giNw = inverseTransformDirection( geometry.normal, viewMatrix );
  // inside? r40's interior mask, except high up: its ceiling height is the BIM space's top in 8-bit steps, and on the sloped ceilings (and
  // the tops of the walls under them) the real surface sits within a step of it, which showed as stripes of sky light. Above 6-7 ft a
  // surface that does not face up counts as inside when the plan 1.5 ft in front of it is well inside the rooms.
  float giIn = max( r40m, smoothstep( 6.0, 7.0, vR40W.y ) * step( giNw.y, 0.5 ) * smoothstep( 0.55, 0.9, giRoomW( vR40W + giNw * 1.5 ) ) );
  float giW = giK * giIn * giRoomW( vR40W + giNw * 0.75 );
  if( giW > 0.001 ){
    vec3 giE = giIrr( vR40W + giNw * giNOff, giNw ) * giGain;
    float giO = mix( 1.0, giAOat( vR40W + giNw * giAOff, giNw ), giAOK );
${GI.rt ? GI.rt.MAIN : ''}
    float giL0 = dot( iblIrradiance, vec3( 0.2126, 0.7152, 0.0722 ) ), giL1 = dot( giE, vec3( 0.2126, 0.7152, 0.0722 ) );
    radiance *= mix( 1.0, clamp( giL1 / max( giL0, 1e-4 ), 0.2, 1.25 ) * giO, giW * giSpec );
    iblIrradiance = mix( iblIrradiance, giE * giO, giW );
    irradiance *= 1.0 - giW * giHemi;
  }
}
#endif
`;
  return true; }

/* ---------------- the sky panorama each environment was made from (to tint the baked sky by the sky drawn now) ---------------- */
function patchPMREM(){ const P = THREE.PMREMGenerator.prototype; if(P.__gi) return; P.__gi = 1; const f = P.fromEquirectangular;
  P.fromEquirectangular = function(tex){ const rt = f.apply(this, arguments); try{ if(tex && tex.image && tex.image.getContext) rt.giSrc = tex.image; }catch(e){} return rt; }; }
// SH L1 irradiance of an equirect canvas (sRGB, as rebuildEnvironment paints it): {a: [r,g,b], b: [[x],[y],[z]] per channel}
const _cv = document.createElement('canvas'); _cv.width = 64; _cv.height = 32;
GI.skySH = function(src, W = 64, H = 32){ const g = _cv.getContext('2d', {willReadFrequently: true}); _cv.width = W; _cv.height = H; g.drawImage(src, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data;
  const lin = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
  const c = new Float64Array(12); for(let j = 0; j < H; j++){ const v = 1 - (j + .5) / H, el = (v - .5) * Math.PI, cy = Math.sin(el), ce = Math.cos(el), dw = (2 * Math.PI / W) * (Math.PI / H) * ce;
    for(let i = 0; i < W; i++){ const u = (i + .5) / W, az = (u - .5) * 2 * Math.PI, x = ce * Math.cos(az), z = ce * Math.sin(az), o = (j * W + i) * 4;
      for(let k = 0; k < 3; k++){ const L = lin(d[o + k]) * dw; c[k] += L * .282095; c[3 + k] += L * .488603 * x; c[6 + k] += L * .488603 * cy; c[9 + k] += L * .488603 * z; } } }
  const A0 = Math.PI * .282095, A1 = 2 * Math.PI / 3 * .488603; return Array.from(c, (v, i) => v * (i < 3 ? A0 : A1)); };   // E(n) = a + bx nx + by ny + bz nz

/* ---------------- the room mask: the prototype rooms' BIM spaces in plan, 6 in cells, blurred one cell ---------------- */
GI.ROOMS = ['SP-L1-KITCHEN', 'SP-L1-GREAT', 'SP-L1-LIVING'];
function buildRoomMask(){ const B = GI.H.BIM2S; if(!B || !B.spaces) return false; const sp = B.spaces.filter(s => GI.ROOMS.includes(s.id)); if(!sp.length) return false;
  const c = .5; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for(const s of sp){ z0 = Math.min(z0, s.bb[0]); x0 = Math.min(x0, s.bb[1]); z1 = Math.max(z1, s.bb[2]); x1 = Math.max(x1, s.bb[3]); }
  x0 -= 2; z0 -= 2; x1 += 2; z1 += 2; const NX = Math.ceil((x1 - x0) / c), NZ = Math.ceil((z1 - z0) / c), a = new Float32Array(NX * NZ);
  for(let j = 0; j < NZ; j++) for(let i = 0; i < NX; i++){ const X = x0 + (i + .5) * c, Z = z0 + (j + .5) * c; for(const s of sp) if(B.contains(s, Z, X)){ a[j * NX + i] = 1; break; } }
  // close the gaps between the three rooms (the walls and openings between them count as inside): dilate 2, erode 2
  const R = 2, d = new Float32Array(a.length), e = new Float32Array(a.length), at = (A, i, j) => i < 0 || j < 0 || i >= NX || j >= NZ ? 0 : A[j * NX + i];
  for(let j = 0; j < NZ; j++) for(let i = 0; i < NX; i++){ let v = 0; for(let dj = -R; dj <= R && !v; dj++) for(let di = -R; di <= R; di++) if(at(a, i + di, j + dj)){ v = 1; break; } d[j * NX + i] = v; }
  for(let j = 0; j < NZ; j++) for(let i = 0; i < NX; i++){ let v = 1; for(let dj = -R; dj <= R && v; dj++) for(let di = -R; di <= R; di++) if(!at(d, i + di, j + dj)){ v = 0; break; } e[j * NX + i] = v || a[j * NX + i]; }
  // the edge: one cell out (the bounding walls' own thickness stays inside), then feathered over about 2 ft (two box blurs of 2 cells), so an
  // opening to a room the volume does not cover is a soft hand-over to the page's light, while the rooms' own walls stay fully inside
  let f = new Float32Array(NX * NZ); for(let j = 0; j < NZ; j++) for(let i = 0; i < NX; i++){ let v = 0; for(let dj = -1; dj <= 1 && !v; dj++) for(let di = -1; di <= 1; di++) if(at(e, i + di, j + dj)){ v = 1; break; } f[j * NX + i] = v; }
  const FR = GI.feather != null ? GI.feather : 2; for(let pass = 0; pass < 2 && FR > 0; pass++) for(const [ax, az] of [[1, 0], [0, 1]]){ const g2 = new Float32Array(NX * NZ); for(let j = 0; j < NZ; j++) for(let i = 0; i < NX; i++){ let s = 0; for(let k = -FR; k <= FR; k++) s += at(f, i + k * ax, j + k * az); g2[j * NX + i] = s / (2 * FR + 1); } f = g2; }
  const o = new Uint8Array(NX * NZ * 4); for(let j = 0; j < NZ; j++) for(let i = 0; i < NX; i++){ const v = Math.round(255 * Math.max(e[j * NX + i] ? Math.min(1, f[j * NX + i] * 1.0) : 0, f[j * NX + i])); o.set([v, v, v, 255], (j * NX + i) * 4); }
  const t = new THREE.DataTexture(o, NX, NZ, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  GI.U.giRoom.value = t; GI.U.giRB.value.set(x0, z0, 1 / (NX * c), 1 / (NZ * c)); GI.mask = {x0, z0, c, NX, NZ, a: e, f}; return true; }
GI.roomAt = (x, y, z) => { const M = GI.mask; if(!M || y < GI.U.giRY.value.x || y > GI.U.giRY.value.y) return 0; const i = Math.floor((x - M.x0) / M.c), j = Math.floor((z - M.z0) / M.c); return i < 0 || j < 0 || i >= M.NX || j >= M.NZ ? 0 : M.a[j * M.NX + i]; };

/* ---------------- data ---------------- */
const toHalf = (() => { const f = new Float32Array(1), u = new Uint32Array(f.buffer); return v => { f[0] = v; const x = u[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if(e <= 0) return s; if(e >= 31) return s | 0x7bff; return s | (e << 10) | ((m + 0x1000) >>> 13 > 0x3ff ? 0x3ff : (m + 0x1000) >>> 13); }; })();
async function inflate(buf){ if(typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
  const s = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'))); return new Uint8Array(await s.arrayBuffer()); }
// file format: gi/index.json (grid, sun keys, volumes with their kind, per-key coefficients and ranges) + gi/<version>.bin (deflate). Volumes decode to Float32Array(12 * NP): a.rgb, bx.rgb, by.rgb, bz.rgb per probe.
async function load(){ try{
    const ix = await (await fetch(GI.base + 'index.json?v=' + GI.ver, {cache: 'no-cache'})).json(); GI.index = ix;
    const raw = await inflate(await (await fetch(GI.base + ix.file + '?v=' + ix.version)).arrayBuffer()); GI.bytes = ix.bytes; if(ix.delta) for(let i = 1; i < raw.length; i++) raw[i] = (raw[i] + raw[i - 1]) & 255;
    GI.data = decode(ix, raw); setupTextures(); GI.ready = true; GI.why = 'ok'; say('data', ix.version, ix.bytes); }
  catch(e){ GI.why = 'no data: ' + (e && e.message || e); console.warn('[gi]', GI.why); } }
GI.useData = (ix, raw) => { GI.index = ix; GI.data = decode(ix, raw); GI.volMean = null; GI.meanIdx = null; setupTextures(); GI.ready = true; GI.why = 'ok'; GI.last = ''; };   // the bake page hands its result in directly
// volumes decode to Float32Array(6 * NP): L0 r, g, b and the luminance L1 x, y, z per probe (enc 'sq8': 6 planes of NP bytes, v = sign(t) t^2 m)
function decode(ix, u8){ const g = ix.grid, NP = g.nx * g.ny * g.nz, vols = []; let o = 0;
  for(const v of ix.vols){ const C = v.C || 6, F = new Float32Array(6 * NP);
    for(let c = 0; c < C; c++){ const m = v.m[c]; for(let p = 0; p < NP; p++){ const t = (u8[o + c * NP + p] - 128) / 127; F[p * 6 + c] = Math.sign(t) * t * t * m; } } o += C * NP;
    vols.push(Object.assign({F}, v)); }
  // probes the bake did not trace (in walls, above the sloped ceilings, outside) are filled outward from their traced neighbours until the
  // grid is full: a surface between a traced probe and an empty one would otherwise fade to black across that cell (bands up the vault)
  { const nx = g.nx, ny = g.ny, nz = g.nz, has = new Uint8Array(NP); for(const v of vols){ const F = v.F; for(let p = 0; p < NP; p++) if(!has[p] && (F[p * 6] !== 0 || F[p * 6 + 1] !== 0 || F[p * 6 + 2] !== 0)) has[p] = 1; }
    for(let ring = 0; ring < 40; ring++){ const add = []; for(let p = 0; p < NP; p++){ if(has[p]) continue; const x = p % nx, z = Math.floor(p / nx) % nz, y = Math.floor(p / (nx * nz)), nb = [];
        for(let dy = -1; dy <= 1; dy++) for(let dz = -1; dz <= 1; dz++) for(let dx = -1; dx <= 1; dx++){ const X = x + dx, Y = y + dy, Z = z + dz; if(X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue; const j = (Y * nz + Z) * nx + X; if(has[j]) nb.push(j, 1 / (Math.abs(dx) + Math.abs(dy) + Math.abs(dz))); }
        if(nb.length) add.push([p, nb]); }
      if(!add.length) break;
      for(const v of vols){ const F = v.F; for(const [p, nb] of add){ let w = 0; const s = [0, 0, 0, 0, 0, 0]; for(let k = 0; k < nb.length; k += 2){ const j = nb[k] * 6, ww = nb[k + 1]; w += ww; for(let c = 0; c < 6; c++) s[c] += ww * F[j + c]; } for(let c = 0; c < 6; c++) F[p * 6 + c] = s[c] / w; } }
      for(const [p] of add) has[p] = 1; } }
  let ao = null; if(ix.ao && ix.ao.v === 2){ const A = ix.ao, n = A.nx * A.ny * A.nz * 4; ao = u8.subarray(o, o + n); o += n; }
  return {NP, vols, ao}; }
function setupTextures(){ const ix = GI.index, g = ix.grid, U = GI.U, NP = g.nx * g.ny * g.nz;
  GI.half = [0, 1].map(() => new Uint16Array(NP * 4));
  GI.tex = GI.half.map(h => { const t = new THREE.DataTexture(h, g.nx, g.nz * g.ny, THREE.RGBAFormat, THREE.HalfFloatType); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; });
  [U.giT0.value, U.giT1.value] = GI.tex; U.giB0.value.set(g.x0, g.y0, g.z0); U.giBS.value.set(1 / g.d, 1 / g.d, 1 / g.d); U.giN.value.set(g.nx, g.ny, g.nz);
  GI.acc = new Float32Array(NP * 6);
  const A = ix.ao; if(A && GI.data.ao){ const tw = A.tx * A.nx, th = A.ty * A.nz, img = new Uint8Array(tw * th * 4), nv = A.nx * A.ny * A.nz; for(let i = 0; i < img.length; i += 4){ img[i] = 255; img[i + 1] = img[i + 2] = img[i + 3] = 128; }
    for(let y = 0; y < A.ny; y++){ const ox = (y % A.tx) * A.nx, oz = Math.floor(y / A.tx) * A.nz;
      for(let z = 0; z < A.nz; z++) for(let x = 0; x < A.nx; x++){ const i = (y * A.nz + z) * A.nx + x, q = ((oz + z) * tw + ox + x) * 4; for(let k = 0; k < 4; k++) img[q + k] = GI.data.ao[k * nv + i]; } }
    const t = new THREE.DataTexture(img, tw, th, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
    U.giAO.value = t; U.giA0.value.set(A.x0, A.y0, A.z0); U.giAS.value.set(1 / A.d, 1 / A.d, 1 / A.d); U.giAN.value.set(A.nx, A.ny, A.nz); U.giAT.value.set(A.tx, A.ty); }
  else { const t = new THREE.DataTexture(new Uint8Array([255, 128, 128, 128]), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; U.giAO.value = t; U.giAN.value.set(1, 1, 1); U.giAT.value.set(1, 1); }
  U.giRY.value.set(ix.room ? ix.room.y0 : -1, ix.room ? ix.room.y1 : 15); U.giNOff.value = ix.nOff != null ? ix.nOff : .45; U.giAOff.value = A && A.off != null ? A.off : .15; }

/* ---------------- composing the volume for the light now ---------------- */
const lum = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
/* sun keys blended by angle: the two nearest keys, each weighted (d3 - d) / d, d = its angle to the sun now, d3 = the third nearest's.
   A key's weight goes to zero exactly when it stops being one of the two nearest, and it is the only one when the sun is on it, so the
   blend is continuous everywhere and glides between keys however far apart they are (Gaussian weights snapped across wide gaps). */
GI.weights = function(dir){ const K = GI.index.keys, d = K.map(k => Math.acos(Math.max(-1, Math.min(1, dir.x * k.dir[0] + dir.y * k.dir[1] + dir.z * k.dir[2]))));
  const o = d.map((v, i) => i).sort((a, b) => d[a] - d[b]), w = new Array(K.length).fill(0); if(K.length < 3){ w[o[0]] = 1; return w; }
  const d3 = d[o[2]], a = (d3 - d[o[0]]) / (d[o[0]] + 1e-4), b = (d3 - d[o[1]]) / (d[o[1]] + 1e-4), s = a + b;
  if(!(s > 1e-9)){ w[o[0]] = .5; w[o[1]] = .5; return w; } w[o[0]] = a / s; w[o[1]] = b / s; return w; };
GI.state = function(){ const H = GI.H, ix = GI.index, w = GI.weights(H.SUN_DIR), K = ix.keys;
  // sky: the baked sky of each key, tinted by the sky the page draws now (its SH L0) over the keys' blended reference
  const env = H.ENV_RT, src = env && env.giSrc; let sky = GI._sky;
  if(src && (!sky || sky.src !== src)){ const sh = GI.skySH(src); sky = GI._sky = {src, a: sh.slice(0, 3)}; }
  const ref = [0, 1, 2].map(c => K.reduce((s, k, i) => s + w[i] * k.sky[c], 0)), tint = sky ? [0, 1, 2].map(c => sky.a[c] / Math.max(1e-6, ref[c])) : [1, 1, 1];
  const sc = H.sun.color, si = H.sun.intensity, sun = [sc.r * si, sc.g * si, sc.b * si];
  let ln = 0, n = 0; for(const l of H.DUSK_LIGHTS) if(GI.inRegion(l)){ ln += l.intensity; n++; } ln = n ? ln / n : 0; const lamp = ix.lampRef > 0 ? ln / ix.lampRef : 0;
  return {w, tint, sun, lamp}; };
GI.inRegion = l => { const p = l.getWorldPosition ? l.getWorldPosition(new V3()) : l.position, g = GI.index.grid; return p.x >= g.x0 - 2 && p.x <= g.x0 + g.d * g.nx + 2 && p.z >= g.z0 - 2 && p.z <= g.z0 + g.d * g.nz + 2 && p.y >= g.y0 - 3 && p.y <= g.y0 + g.d * g.ny + 3; };
// the per-volume RGB scales: a volume belongs to 'sky' or 'sun' (with a coefficient per key) or 'lamp'
GI.scales = function(S){ return GI.data.vols.map(v => { let k = 0; if(v.coef) for(let i = 0; i < S.w.length; i++) k += S.w[i] * v.coef[i];
  if(v.kind === 'sky') return S.tint.map(t => k * t); if(v.kind === 'sun') return S.sun.map(s => k * s); if(v.kind === 'lamp') return [S.lamp, S.lamp, S.lamp]; return [0, 0, 0]; }); };
GI.evNow = () => GI.ev !== '' ? +GI.ev : (GI.index && GI.index.ev != null ? GI.index.ev : GI.EV);
/* Exposure and white balance (see tour/LIGHTING.md, section 6).
   Units: every component is traced in the page's own light units (a sun of intensity I gives PI * I * cos, a sky texel its radiance, the
   lamps the page's own fall-off), and nothing is rescaled per room or per time of day.
   One camera constant, GI.EV: the page draws interiors as a real-estate photograph does, exposed for the room with the windows pulled
   back, so its daylight indoors sits a fixed number of stops over the physical bounce of its own sun and sky. The daylight components
   (sky, sun bounce) are lifted by 2^EV, the same in every room and at every time; the r40 meter then exposes the frame. The lamps are
   authored at interior exposure already and are not lifted.
   White balance: the cast a camera balances away is the ROOM's (the oak floor tints everything it bounces), not the illuminant's: golden
   hour stays golden (half of the illuminant's colour is followed, as a camera's auto balance does). So the reference is the rooms' mean bounce (probes below 9 ft) under the same sun and sky made white; its
   colour is taken to neutral with strength GI.wb. The lamps keep their warmth against that daylight balance. */
GI.compose = function(){ const S = GI.state(), sc = GI.scales(S), D = GI.data, NP = D.NP, A = GI.acc; A.fill(0);
  const add = kind => D.vols.forEach((v, i) => { if((v.kind === 'lamp') !== kind) return; const s = kind ? sc[i].map((x, c) => x / GI.gainNow[c]) : sc[i], sl = .2126 * s[0] + .7152 * s[1] + .0722 * s[2]; if(Math.abs(s[0]) + Math.abs(s[1]) + Math.abs(s[2]) < 1e-9) return; const F = v.F;
    for(let o = 0; o < NP * 6; o += 6){ A[o] += F[o] * s[0]; A[o + 1] += F[o + 1] * s[1]; A[o + 2] += F[o + 2] * s[2]; A[o + 3] += F[o + 3] * sl; A[o + 4] += F[o + 4] * sl; A[o + 5] += F[o + 5] * sl; } });
  add(false);
  if(!GI.meanIdx && GI.mask){ const g = GI.index.grid; GI.meanIdx = []; for(let p = 0; p < NP; p++){ const x = p % g.nx, z = Math.floor(p / g.nx) % g.nz, y = Math.floor(p / (g.nx * g.nz)), X = g.x0 + x * g.d, Y = g.y0 + y * g.d, Z = g.z0 + z * g.d;
    if(Y < 9 && GI.roomAt(X, Y, Z) > .5) GI.meanIdx.push(p); } }
  // each volume's mean over those probes (once): the rooms' mean for any light is then a sum over the volumes
  if(GI.meanIdx && !GI.volMean) GI.volMean = D.vols.map(v => { const m = [0, 0, 0]; for(const p of GI.meanIdx) for(let c = 0; c < 3; c++) m[c] += v.F[p * 6 + c]; return m.map(x => x / Math.max(1, GI.meanIdx.length)); });
  const lumC = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2], m = [0, 0, 0], mw = [0, 0, 0];
  if(GI.volMean){ const ref = [0, 1, 2].map(c => GI.index.keys.reduce((a, k, i) => a + S.w[i] * k.sky[c], 0)), yr = lumC(ref), ys = lumC(S.sun);
    D.vols.forEach((v, i) => { if(v.kind === 'lamp') return; const vm = GI.volMean[i]; let k = 0; if(v.coef) for(let j = 0; j < S.w.length; j++) k += S.w[j] * v.coef[j];
      for(let c = 0; c < 3; c++){ m[c] += vm[c] * sc[i][c]; mw[c] += vm[c] * (v.kind === 'sky' ? k * lumC(S.tint.map((t, q) => t * ref[q])) / Math.max(1e-6, ref[c]) : ys); } }); }
  const Y = Math.max(0, lumC(m)), Yw = lumC(mw), lift = Math.pow(2, GI.evNow());
  GI.mean = Y; GI.meanRGB = m; GI.cast = Yw > 1e-7 ? mw.map(v => v / Yw) : [1, 1, 1];
  // and half of the illuminant's own colour (a camera's auto white balance follows a golden sun part of the way, not all of it)
  const act = Y > 1e-7 ? m.map(v => Math.max(1e-4, v / Y)) : [1, 1, 1];
  GI.wbGain = GI.cast.map((v, c) => v > 1e-4 ? Math.pow(1 / v, GI.wb) * Math.pow(v / act[c], GI.wbLight) : 1); { const w = GI.wbGain, y = lumC(w); GI.wbGain = w.map(v => v / y); }
  GI.gainNow = GI.wbGain.map(v => v * lift);
  add(true);   // the lamps, divided by the daylight gain so they arrive unlifted and unbalanced
  const [h0, h1] = GI.half;
  for(let p = 0, o = 0, q = 0; p < NP; p++, o += 6, q += 4){ h0[q] = toHalf(Math.max(0, A[o])); h0[q + 1] = toHalf(Math.max(0, A[o + 1])); h0[q + 2] = toHalf(Math.max(0, A[o + 2])); h0[q + 3] = toHalf(A[o + 3]); h1[q] = toHalf(A[o + 4]); h1[q + 1] = toHalf(A[o + 5]); }
  for(const t of GI.tex) t.needsUpdate = true; GI.composes++; GI.S = S; return S; };
// what the volume gives at a point and normal (QA), from the composed (float) data
GI.gainNow = [1, 1, 1];
GI.at = function(x, y, z, n = [0, 1, 0]){ const g = GI.index.grid, A = GI.acc, dims = [g.nx, g.ny, g.nz], f = [(x - g.x0) / g.d, (y - g.y0) / g.d, (z - g.z0) / g.d].map((v, i) => Math.max(0, Math.min(dims[i] - 1, v)));
  const i0 = f.map(Math.floor), t = f.map((v, i) => v - i0[i]), a = [0, 0, 0], b = [0, 0, 0];
  for(let c = 0; c < 8; c++){ const ii = [0, 1, 2].map(k => Math.min(dims[k] - 1, i0[k] + ((c >> k) & 1))), w = [0, 1, 2].reduce((s, k) => s * (((c >> k) & 1) ? t[k] : 1 - t[k]), 1);
    const o = ((ii[1] * g.nz + ii[2]) * g.nx + ii[0]) * 6; for(let k = 0; k < 3; k++){ a[k] += w * Math.max(0, A[o + k]); b[k] += w * A[o + 3 + k]; } }
  const l = Math.max(1e-6, .2126 * a[0] + .7152 * a[1] + .0722 * a[2]), m = Math.max(0, 1 + (b[0] * n[0] + b[1] * n[1] + b[2] * n[2]) / l);
  return a.map(v => +(v * m).toFixed(5)); };
/* ---------------- each frame (before the page draws) ---------------- */
let lastT = 0;
GI.frame = function(){ const H = GI.H; if(!H) return; GI.n++;
  if(!GI.mask) try{ buildRoomMask(); }catch(e){ console.warn('[gi] mask', e); GI.mask = false; }
  if(!GI.ready){ GI.U.giOn.value = 0; return; }
  const now = performance.now(), dt = Math.min(.25, Math.max(0, (now - (lastT || now)) / 1000)); lastT = now;
  // off for the design ideas (they move walls and cabinets: the bake would be wrong), and if forced off
  const want = (H.variant === 'asbuilt' && !GI.forceOff && GI.mask) ? 1 : 0;
  GI.k = GI.snap ? want : (GI.k < want ? Math.min(want, GI.k + dt / .8) : Math.max(want, GI.k - dt / .8)); GI.snap = false;
  const U = GI.U; U.giOn.value = GI.k > 0 ? 1 : 0; U.giK.value = GI.k * GI.k * (3 - 2 * GI.k); U.giGain.value.set(GI.gainNow[0], GI.gainNow[1], GI.gainNow[2]); U.giSpec.value = GI.spec; U.giAOK.value = GI.aoK; U.giHemi.value = GI.hemiKill;
  GI.on = GI.k > 0;
  const s = H.SUN_DIR, c = H.sun.color, env = H.ENV_RT, src = env && env.giSrc, isrc = null;
  let ln = 0; for(const l of H.DUSK_LIGHTS) ln += l.intensity;
  const key = [s.x, s.y, s.z, c.r, c.g, c.b, H.sun.intensity, ln, GI.evNow(), GI.wb, GI.wbLight].map(v => v.toFixed(5)).join(',') + (src ? (src.__giId || (src.__giId = ++GI.srcN)) : 0) + ':' + (isrc ? (isrc.__giId || (isrc.__giId = ++GI.srcN)) : 0) + ':' + !!GI.mask;
  if(key !== GI.last && GI.on){ GI.last = key; try{ GI.compose(); }catch(e){ console.warn('[gi] compose', e); GI.ready = false; } }
  r13Fade(); ssaoFade(dt); if(GI.rt) try{ GI.rt.frame(); }catch(e){ if(!GI.rt.err){ GI.rt.err = String(e && e.message || e); console.warn('[gi-rt] frame', e); } } };
GI.srcN = 0;
/* r13 corner bands: their multiply decals double up with baked corners; inside the rooms their vertices are lifted to white (kept, restored when GI is off) */
function r13Fade(){ const want = GI.on && GI.k > .5; if(GI._r13 === want && (GI.n % 120) !== 7) return; let nm = 0; GI.H.scene.traverse(o => { if(o.isMesh && o.material && o.material.name === "r13Occlusion") nm++; }); if(GI._r13 === want && nm === GI._r13m) return; GI._r13m = nm;   /* the bands are built at idle after load: look again now and then */ const H = GI.H; let n = 0;
  H.scene.traverse(o => { if(!o.isMesh || !o.material || o.material.name !== 'r13Occlusion') return; const col = o.geometry.attributes.color, pos = o.geometry.attributes.position; if(!col) return;
    if(!o.userData.giC0) o.userData.giC0 = Float32Array.from(col.array); const C0 = o.userData.giC0, P = new V3(); o.updateMatrixWorld();
    for(let i = 0; i < col.count; i++){ P.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); const w = want ? Math.max(GI.roomAt(P.x, P.y, P.z), GI.roomAt(P.x + .4, P.y, P.z), GI.roomAt(P.x - .4, P.y, P.z), GI.roomAt(P.x, P.y, P.z + .4), GI.roomAt(P.x, P.y, P.z - .4)) : 0;
      for(let k = 0; k < 3; k++) col.array[i * 3 + k] = C0[i * 3 + k] + (1 - C0[i * 3 + k]) * w; if(w) n++; }
    col.needsUpdate = true; });
  GI._r13 = want; GI.r13n = n; }
/* SSAO (desktop only): eased out while the camera is in the rooms (the baked volume and AO replace it there) */
function ssaoFade(dt){ const H = GI.H, sa = H.ssao; if(!sa || !H.composer || GI.keepSSAO) return; if(GI.ssao0 == null) GI.ssao0 = {max: sa.maxDistance, min: sa.minDistance};
  const p = H.camera.position, want = GI.on ? GI.roomAt(p.x, p.y, p.z) * GI.k : 0; GI.ssaoK = GI.snapAO ? want : (GI.ssaoK < want ? Math.min(want, GI.ssaoK + dt / 1.6) : Math.max(want, GI.ssaoK - dt / 1.6)); GI.snapAO = false;
  const k = GI.ssaoK * GI.ssaoK * (3 - 2 * GI.ssaoK), A = GI.ssao0; sa.maxDistance = A.max + (A.min * .5 - A.max) * k; }

GI.host = function(H){ GI.H = H;
  if(!H.R40E || !H.R40E.on){ GI.why = 'needs the r40 two-environment lighting (it is off with ?r40env=0)'; return; }
  if(!H.renderer.capabilities.isWebGL2){ GI.why = 'needs WebGL2'; return; }
  patchChunks(); Object.assign(H.R40E.U, GI.U, GI.rt ? GI.rt.U : null); patchPMREM();
  if(MODE !== 'bake' || /[?&]giload=1\b/.test(Q)) load(); else GI.why = 'bake page';
  if(GI.bake && GI.bake.host) try{ GI.bake.host(H); }catch(e){ console.warn('[gi] bake host', e); } };
GI.status = () => ({mode: GI.mode, ready: GI.ready, on: GI.on, why: GI.why, k: +GI.k.toFixed(3), ev: GI.evNow(), gain: GI.gainNow.map(v => +v.toFixed(2)), wb: (GI.wbGain || [1, 1, 1]).map(v => +v.toFixed(3)), cast: (GI.cast || [1, 1, 1]).map(v => +v.toFixed(3)), mean: +(GI.mean || 0).toFixed(5), meanRGB: (GI.meanRGB || []).map(v => +v.toFixed(5)), ssaoK: +GI.ssaoK.toFixed(3), composes: GI.composes, r13n: GI.r13n, bytes: GI.bytes, rt: GI.rt ? GI.rt.status() : null,
  S: GI.S ? {w: GI.S.w.map(v => +v.toFixed(3)), tint: GI.S.tint.map(v => +v.toFixed(3)), sun: GI.S.sun.map(v => +v.toFixed(3)), lamp: +GI.S.lamp.toFixed(3)} : null});
})();
