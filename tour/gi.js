/* gi-r42: baked indirect light for the 3D tour - a prototype for the kitchen, the dining & sitting area (great room) and the living room.
   Loaded only with ?gi=1 (or ?gi=bake for the bake tools in gi-bake.js); without the flag tour/index.html never requests this file.

   What it does (tour/GI.md has the study):
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
const GI = window.GI = {mode: MODE, ver: 1, on: false, ready: false, why: 'loading', H: null, n: 0, composes: 0, k: 0, t: 0, ssaoK: 0,
  // tuning (also from the URL: &gigain=, &gispec=, &giao=, &gissao=keep)
  gain: +qp('gigain', 1), spec: +qp('gispec', .7), aoK: +qp('giao', 1), hemiKill: 1, sigma: +qp('gisig', .2), keepSSAO: qp('gissao', '') === 'keep',
  base: qp('gibase', 'gi/'),
  U: {giOn: {value: 0}, giK: {value: 0}, giGain: {value: 1}, giHemi: {value: 1}, giSpec: {value: .7}, giAOK: {value: 1},
    giT0: {value: null}, giT1: {value: null}, giT2: {value: null}, giAO: {value: null}, giRoom: {value: null},
    giB0: {value: new V3()}, giBS: {value: new V3(1, 1, 1)}, giN: {value: new V3(1, 1, 1)}, giNOff: {value: .45},
    giRB: {value: new THREE.Vector4()}, giRY: {value: new THREE.Vector2(-1, 15)},
    giA0: {value: new V3()}, giAS: {value: new V3(1, 1, 1)}, giAN: {value: new V3(1, 1, 1)}, giAT: {value: new THREE.Vector2(1, 1)}, giAOff: {value: .2}}};
GI.log = [];
const say = (...a) => { GI.log.push(a.join(' ')); if(GI.log.length > 60) GI.log.shift(); };
if(MODE === 'bake') document.write('<script src="gi-bake.js?v=' + (qp('gibv', '1')) + '"><\/script>');

/* ---------------- shader hooks (appended to the r40 chunks, so they only exist where r40's interior mask r40m does) ---------------- */
const G = '#if defined( STANDARD ) && defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )';
function patchChunks(){ const C = THREE.ShaderChunk; if(C.__gi) return true; C.__gi = 1;
  C.envmap_physical_pars_fragment += `
${G}
uniform float giOn, giK, giGain, giHemi, giSpec, giAOK, giNOff, giAOff; uniform sampler2D giT0, giT1, giT2, giAO, giRoom;
uniform vec3 giB0, giBS, giN, giA0, giAS, giAN; uniform vec4 giRB; uniform vec2 giRY, giAT;
float giRoomW( vec3 P ){ vec2 uv = ( P.xz - giRB.xy ) * giRB.zw; if( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || P.y < giRY.x || P.y > giRY.y ) return 0.0; return texture2D( giRoom, uv ).r; }
vec3 giIrr( vec3 P, vec3 n ){
  vec3 g = clamp( ( P - giB0 ) * giBS, vec3( 0.0 ), giN - 1.0 ); float y0 = floor( g.y ), f = g.y - y0, y1 = min( y0 + 1.0, giN.y - 1.0 );
  vec2 s = vec2( g.x + 0.5, g.z + 0.5 ) / vec2( giN.x, giN.z * giN.y ), u0 = s + vec2( 0.0, y0 / giN.y ), u1 = s + vec2( 0.0, y1 / giN.y );
  vec4 A = mix( texture2D( giT0, u0 ), texture2D( giT0, u1 ), f ), B = mix( texture2D( giT1, u0 ), texture2D( giT1, u1 ), f ), C = mix( texture2D( giT2, u0 ), texture2D( giT2, u1 ), f );
  return max( A.rgb + vec3( A.a, B.r, B.g ) * n.x + vec3( B.b, B.a, C.r ) * n.y + C.gba * n.z, vec3( 0.0 ) ); }
float giAOat( vec3 P ){
  vec3 g = clamp( ( P - giA0 ) * giAS, vec3( 0.0 ), giAN - 1.0 ); float y0 = floor( g.y ), f = g.y - y0, y1 = min( y0 + 1.0, giAN.y - 1.0 );
  vec2 s = vec2( g.x + 0.5, g.z + 0.5 ) / ( vec2( giAN.x, giAN.z ) * giAT );
  vec2 t0 = vec2( mod( y0, giAT.x ), floor( y0 / giAT.x ) ) / giAT, t1 = vec2( mod( y1, giAT.x ), floor( y1 / giAT.x ) ) / giAT;
  return mix( texture2D( giAO, s + t0 ).r, texture2D( giAO, s + t1 ).r, f ); }
#endif
`;
  C.lights_fragment_maps += `
${G}
if( giOn > 0.5 && r40m > 0.001 ){
  vec3 giNw = inverseTransformDirection( geometry.normal, viewMatrix );
  float giW = giK * r40m * giRoomW( vR40W + giNw * 0.75 );
  if( giW > 0.001 ){
    vec3 giE = giIrr( vR40W + giNw * giNOff, giNw ) * giGain;
    float giO = mix( 1.0, giAOat( vR40W + giNw * giAOff ), giAOK );
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
  P.fromEquirectangular = function(tex){ const rt = f.apply(this, arguments); try{ if(tex && tex.image && tex.image.getContext) rt.userData.giSrc = tex.image; }catch(e){} return rt; }; }
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
function buildRoomMask(){ const B = GI.H.BIM2S; if(!B || !B.spaces) return false; const sp = B.spaces.filter(s => GI.ROOMS.includes(s.id)); if(sp.length < GI.ROOMS.length) return false;
  const c = .5; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for(const s of sp){ z0 = Math.min(z0, s.bb[0]); x0 = Math.min(x0, s.bb[1]); z1 = Math.max(z1, s.bb[2]); x1 = Math.max(x1, s.bb[3]); }
  x0 -= 2; z0 -= 2; x1 += 2; z1 += 2; const NX = Math.ceil((x1 - x0) / c), NZ = Math.ceil((z1 - z0) / c), a = new Float32Array(NX * NZ);
  for(let j = 0; j < NZ; j++) for(let i = 0; i < NX; i++){ const X = x0 + (i + .5) * c, Z = z0 + (j + .5) * c; for(const s of sp) if(B.contains(s, Z, X)){ a[j * NX + i] = 1; break; } }
  // close the gaps between the three rooms (the walls and openings between them count as inside): dilate 2, erode 2
  const R = 2, d = new Float32Array(a.length), e = new Float32Array(a.length), at = (A, i, j) => i < 0 || j < 0 || i >= NX || j >= NZ ? 0 : A[j * NX + i];
  for(let j = 0; j < NZ; j++) for(let i = 0; i < NX; i++){ let v = 0; for(let dj = -R; dj <= R && !v; dj++) for(let di = -R; di <= R; di++) if(at(a, i + di, j + dj)){ v = 1; break; } d[j * NX + i] = v; }
  for(let j = 0; j < NZ; j++) for(let i = 0; i < NX; i++){ let v = 1; for(let dj = -R; dj <= R && v; dj++) for(let di = -R; di <= R; di++) if(!at(d, i + di, j + dj)){ v = 0; break; } e[j * NX + i] = v || a[j * NX + i]; }
  const o = new Uint8Array(NX * NZ * 4); for(let j = 0; j < NZ; j++) for(let i = 0; i < NX; i++){ let s = 0, w = 0; for(let dj = -1; dj <= 1; dj++) for(let di = -1; di <= 1; di++){ const k = (di ? .5 : 1) * (dj ? .5 : 1); s += at(e, i + di, j + dj) * k; w += k; }
    const v = Math.round(255 * s / w); o.set([v, v, v, 255], (j * NX + i) * 4); }
  const t = new THREE.DataTexture(o, NX, NZ, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  GI.U.giRoom.value = t; GI.U.giRB.value.set(x0, z0, 1 / (NX * c), 1 / (NZ * c)); GI.mask = {x0, z0, c, NX, NZ, a: e}; return true; }
GI.roomAt = (x, y, z) => { const M = GI.mask; if(!M || y < GI.U.giRY.value.x || y > GI.U.giRY.value.y) return 0; const i = Math.floor((x - M.x0) / M.c), j = Math.floor((z - M.z0) / M.c); return i < 0 || j < 0 || i >= M.NX || j >= M.NZ ? 0 : M.a[j * M.NX + i]; };

/* ---------------- data ---------------- */
const toHalf = (() => { const f = new Float32Array(1), u = new Uint32Array(f.buffer); return v => { f[0] = v; const x = u[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if(e <= 0) return s; if(e >= 31) return s | 0x7bff; return s | (e << 10) | ((m + 0x1000) >>> 13 > 0x3ff ? 0x3ff : (m + 0x1000) >>> 13); }; })();
async function inflate(buf){ if(typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
  const s = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'))); return new Uint8Array(await s.arrayBuffer()); }
// file format (gi/index.json + gi/*.bin, deflate): see GI.md. Volumes decode to Float32Array(12 * NP): a.rgb, bx.rgb, by.rgb, bz.rgb per probe.
async function load(){ try{
    const ix = await (await fetch(GI.base + 'index.json?v=' + GI.ver, {cache: 'no-cache'})).json(); GI.index = ix;
    const raw = await inflate(await (await fetch(GI.base + ix.file + '?v=' + ix.version)).arrayBuffer()); GI.bytes = ix.bytes;
    GI.data = decode(ix, raw); setupTextures(); GI.ready = true; GI.why = 'ok'; say('data', ix.version, ix.bytes); }
  catch(e){ GI.why = 'no data: ' + (e && e.message || e); console.warn('[gi]', GI.why); } }
GI.useData = (ix, raw) => { GI.index = ix; GI.data = decode(ix, raw); setupTextures(); GI.ready = true; GI.why = 'ok'; GI.last = ''; };   // the bake page hands its result in directly
function decode(ix, u8){ const g = ix.grid, NP = g.nx * g.ny * g.nz, vols = []; let o = 0;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  for(const v of ix.vols){ const F = new Float32Array(12 * NP);
    if(v.enc === 'q8'){   // per value: (q / 255) * (hi - lo) + lo, ranges per channel group
      for(let p = 0; p < NP; p++) for(let k = 0; k < 12; k++){ const r = v.r[k]; F[p * 12 + k] = u8[o + k * NP + p] / 255 * (r[1] - r[0]) + r[0]; } o += 12 * NP; }
    else if(v.enc === 'q16'){ for(let p = 0; p < NP; p++) for(let k = 0; k < 12; k++){ const r = v.r[k]; F[p * 12 + k] = dv.getUint16(o + (k * NP + p) * 2, true) / 65535 * (r[1] - r[0]) + r[0]; } o += 24 * NP; }
    else if(v.enc === 'f32'){ for(let i = 0; i < 12 * NP; i++) F[i] = dv.getFloat32(o + i * 4, true); o += 48 * NP; }
    vols.push(Object.assign({F}, v)); }
  let ao = null; if(ix.ao){ const A = ix.ao, n = A.nx * A.ny * A.nz; ao = u8.subarray(o, o + n); o += n; }
  return {NP, vols, ao}; }
function setupTextures(){ const ix = GI.index, g = ix.grid, U = GI.U, NP = g.nx * g.ny * g.nz;
  GI.half = [0, 1, 2].map(() => new Uint16Array(NP * 4));
  GI.tex = GI.half.map(h => { const t = new THREE.DataTexture(h, g.nx, g.nz * g.ny, THREE.RGBAFormat, THREE.HalfFloatType); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; });
  [U.giT0.value, U.giT1.value, U.giT2.value] = GI.tex; U.giB0.value.set(g.x0, g.y0, g.z0); U.giBS.value.set(1 / g.d, 1 / g.d, 1 / g.d); U.giN.value.set(g.nx, g.ny, g.nz);
  GI.acc = new Float32Array(NP * 12);
  const A = ix.ao; if(A && GI.data.ao){ const tw = A.tx * A.nx, th = A.ty * A.nz, img = new Uint8Array(tw * th * 4).fill(255);
    for(let y = 0; y < A.ny; y++){ const ox = (y % A.tx) * A.nx, oz = Math.floor(y / A.tx) * A.nz;
      for(let z = 0; z < A.nz; z++) for(let x = 0; x < A.nx; x++){ const v = GI.data.ao[(y * A.nz + z) * A.nx + x], q = ((oz + z) * tw + ox + x) * 4; img[q] = img[q + 1] = img[q + 2] = v; } }
    const t = new THREE.DataTexture(img, tw, th, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
    U.giAO.value = t; U.giA0.value.set(A.x0, A.y0, A.z0); U.giAS.value.set(1 / A.d, 1 / A.d, 1 / A.d); U.giAN.value.set(A.nx, A.ny, A.nz); U.giAT.value.set(A.tx, A.ty); }
  else { const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; U.giAO.value = t; U.giAN.value.set(1, 1, 1); U.giAT.value.set(1, 1); }
  U.giRY.value.set(ix.room ? ix.room.y0 : -1, ix.room ? ix.room.y1 : 15); U.giNOff.value = ix.nOff != null ? ix.nOff : .45; U.giAOff.value = A && A.off != null ? A.off : .2; }

/* ---------------- composing the volume for the light now ---------------- */
const lum = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
GI.weights = function(dir){ const K = GI.index.keys, w = K.map(k => { const c = Math.max(-1, Math.min(1, dir.x * k.dir[0] + dir.y * k.dir[1] + dir.z * k.dir[2])), a = Math.acos(c) / GI.sigma; return Math.exp(-a * a); });
  let s = w.reduce((x, y) => x + y, 0); if(!(s > 1e-12)){ let b = 0, bi = 0; K.forEach((k, i) => { const c = dir.x * k.dir[0] + dir.y * k.dir[1] + dir.z * k.dir[2]; if(c > b || i === 0){ b = c; bi = i; } }); w.fill(0); w[bi] = 1; s = 1; }
  return w.map(v => v / s); };
GI.state = function(){ const H = GI.H, ix = GI.index, w = GI.weights(H.SUN_DIR), K = ix.keys;
  // sky: the baked sky of each key, tinted by the sky the page draws now (its SH L0) over the keys' blended reference
  const env = H.ENV_RT, src = env && env.userData && env.userData.giSrc; let sky = GI._sky;
  if(src && (!sky || sky.src !== src)){ const sh = GI.skySH(src); sky = GI._sky = {src, a: sh.slice(0, 3)}; }
  const ref = [0, 1, 2].map(c => K.reduce((s, k, i) => s + w[i] * k.sky[c], 0)), tint = sky ? [0, 1, 2].map(c => sky.a[c] / Math.max(1e-6, ref[c])) : [1, 1, 1];
  const sc = H.sun.color, si = H.sun.intensity, sun = [sc.r * si, sc.g * si, sc.b * si];
  let ln = 0, n = 0; for(const l of H.DUSK_LIGHTS) if(GI.inRegion(l)){ ln += l.intensity; n++; } ln = n ? ln / n : 0; const lamp = ix.lampRef > 0 ? ln / ix.lampRef : 0;
  return {w, tint, sun, lamp}; };
GI.inRegion = l => { const p = l.getWorldPosition ? l.getWorldPosition(new V3()) : l.position, g = GI.index.grid; return p.x >= g.x0 - 2 && p.x <= g.x0 + g.d * g.nx + 2 && p.z >= g.z0 - 2 && p.z <= g.z0 + g.d * g.nz + 2 && p.y >= g.y0 - 3 && p.y <= g.y0 + g.d * g.ny + 3; };
// the per-volume RGB scales: a volume belongs to 'sky' or 'sun' (with a coefficient per key) or 'lamp'
GI.scales = function(S){ return GI.data.vols.map(v => { let k = 0; if(v.coef) for(let i = 0; i < S.w.length; i++) k += S.w[i] * v.coef[i];
  if(v.kind === 'sky') return S.tint.map(t => k * t); if(v.kind === 'sun') return S.sun.map(s => k * s); if(v.kind === 'lamp') return [S.lamp, S.lamp, S.lamp]; return [0, 0, 0]; }); };
GI.compose = function(){ const S = GI.state(), sc = GI.scales(S), D = GI.data, NP = D.NP, A = GI.acc; A.fill(0);
  D.vols.forEach((v, i) => { const s = sc[i]; if(Math.abs(s[0]) + Math.abs(s[1]) + Math.abs(s[2]) < 1e-7) return; const F = v.F;
    for(let p = 0, o = 0; p < NP; p++, o += 12) for(let c = 0; c < 12; c += 3){ A[o + c] += F[o + c] * s[0]; A[o + c + 1] += F[o + c + 1] * s[1]; A[o + c + 2] += F[o + c + 2] * s[2]; } });
  const [h0, h1, h2] = GI.half;
  for(let p = 0, o = 0, q = 0; p < NP; p++, o += 12, q += 4){ h0[q] = toHalf(A[o]); h0[q + 1] = toHalf(A[o + 1]); h0[q + 2] = toHalf(A[o + 2]); h0[q + 3] = toHalf(A[o + 3]);
    h1[q] = toHalf(A[o + 4]); h1[q + 1] = toHalf(A[o + 5]); h1[q + 2] = toHalf(A[o + 6]); h1[q + 3] = toHalf(A[o + 7]); h2[q] = toHalf(A[o + 8]); h2[q + 1] = toHalf(A[o + 9]); h2[q + 2] = toHalf(A[o + 10]); h2[q + 3] = toHalf(A[o + 11]); }
  for(const t of GI.tex) t.needsUpdate = true; GI.composes++; GI.S = S; return S; };
// what the volume gives at a point and normal (QA), from the composed (float) data
GI.at = function(x, y, z, n = [0, 1, 0]){ const g = GI.index.grid, A = GI.acc, f = [(x - g.x0) / g.d, (y - g.y0) / g.d, (z - g.z0) / g.d].map((v, i) => Math.max(0, Math.min([g.nx, g.ny, g.nz][i] - 1, v)));
  const i0 = f.map(Math.floor), t = f.map((v, i) => v - i0[i]), out = [0, 0, 0];
  for(let c = 0; c < 8; c++){ const ii = [c & 1, (c >> 1) & 1, (c >> 2) & 1].map((b, k) => Math.min([g.nx, g.ny, g.nz][k] - 1, i0[k] + b)), w = [0, 1, 2].reduce((s, k) => s * (((c >> k) & 1) ? t[k] : 1 - t[k]), 1);
    const o = ((ii[1] * g.nz + ii[2]) * g.nx + ii[0]) * 12; for(let k = 0; k < 3; k++) out[k] += w * (A[o + k] + A[o + 3 + k] * n[0] + A[o + 6 + k] * n[1] + A[o + 9 + k] * n[2]); }
  return out.map(v => +Math.max(0, v).toFixed(5)); };

/* ---------------- each frame (before the page draws) ---------------- */
let lastT = 0;
GI.frame = function(){ const H = GI.H; if(!H) return; GI.n++;
  if(!GI.mask) try{ buildRoomMask(); }catch(e){ console.warn('[gi] mask', e); GI.mask = false; }
  if(!GI.ready){ GI.U.giOn.value = 0; return; }
  const now = performance.now(), dt = Math.min(.25, Math.max(0, (now - (lastT || now)) / 1000)); lastT = now;
  // off for the design ideas (they move walls and cabinets: the bake would be wrong), and if forced off
  const want = (H.variant === 'asbuilt' && !GI.forceOff && GI.mask) ? 1 : 0;
  GI.k = GI.snap ? want : (GI.k < want ? Math.min(want, GI.k + dt / .8) : Math.max(want, GI.k - dt / .8)); GI.snap = false;
  const U = GI.U; U.giOn.value = GI.k > 0 ? 1 : 0; U.giK.value = GI.k * GI.k * (3 - 2 * GI.k); U.giGain.value = GI.gain; U.giSpec.value = GI.spec; U.giAOK.value = GI.aoK; U.giHemi.value = GI.hemiKill;
  GI.on = GI.k > 0;
  const s = H.SUN_DIR, c = H.sun.color, env = H.ENV_RT, src = env && env.userData && env.userData.giSrc;
  let ln = 0; for(const l of H.DUSK_LIGHTS) ln += l.intensity;
  const key = [s.x, s.y, s.z, c.r, c.g, c.b, H.sun.intensity, ln].map(v => v.toFixed(5)).join(',') + (src ? (src.__giId || (src.__giId = ++GI.srcN)) : 0);
  if(key !== GI.last && GI.on){ GI.last = key; try{ GI.compose(); }catch(e){ console.warn('[gi] compose', e); GI.ready = false; } }
  r13Fade(); ssaoFade(dt); };
GI.srcN = 0;
/* r13 corner bands: their multiply decals double up with baked corners; inside the rooms their vertices are lifted to white (kept, restored when GI is off) */
function r13Fade(){ const want = GI.on && GI.k > .5; if(GI._r13 === want) return; const H = GI.H; let n = 0;
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
  patchChunks(); Object.assign(H.R40E.U, GI.U); patchPMREM();
  if(MODE !== 'bake' || /[?&]giload=1\b/.test(Q)) load(); else GI.why = 'bake page';
  if(GI.bake && GI.bake.host) try{ GI.bake.host(H); }catch(e){ console.warn('[gi] bake host', e); } };
GI.status = () => ({mode: GI.mode, ready: GI.ready, on: GI.on, why: GI.why, k: +GI.k.toFixed(3), ssaoK: +GI.ssaoK.toFixed(3), composes: GI.composes, r13n: GI.r13n, bytes: GI.bytes,
  S: GI.S ? {w: GI.S.w.map(v => +v.toFixed(3)), tint: GI.S.tint.map(v => +v.toFixed(3)), sun: GI.S.sun.map(v => +v.toFixed(3)), lamp: +GI.S.lamp.toFixed(3)} : null});
})();
