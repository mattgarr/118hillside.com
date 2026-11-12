/* gi-r42 bake tools (?gi=bake only). A GPU path tracer over the tour's own scene (the page as loaded: furnished, trees on, as built)
   that bakes the irradiance volume and the ambient-occlusion volume read by gi.js.

   - B.extract(): every visible lit mesh within the bake box (the rooms plus 40 ft around: decks, terrain, trees, the neighbours of the
     windows), triangle by triangle, with a diffuse albedo per material (colour x the texture's mean, linear), its alpha coverage
     (foliage cards, screens: a ray passes a card with probability 1 - coverage) and its sidedness. Glass, decals and helpers are left out.
   - B.build(): a binned-SAH BVH in JS; the triangles and nodes go to float textures.
   - The trace shader: one fragment = one probe x one direction; a path of up to 5 bounces (Lambert, Russian roulette), with the sky added
     where it escapes (component sky), next-event estimation to a unit white sun (component sun, sun key k) or to the room lamps
     (component lamp). Light that arrives at the probe directly from the sun or a lamp is NOT included: the page draws that in real time.
   - B.run(): passes of 64 stratified directions per probe, read back and projected to SH L1 on the CPU, checkpointed to IndexedDB after
     every component so a reload or a throttled tab loses at most one component.
   Units: three.js r128 non-physical lights. A directional light of intensity I gives irradiance PI * I * cos, an environment texel L
   gives radiance L, a Lambert surface reflects albedo / PI of its irradiance. */
(function(){
'use strict';
const GI = window.GI; if(!GI) return;
const B = GI.bake = {log: [], st: {}};
let H, THREE, R;
const say = (...a) => { const s = a.join(' '); B.log.push(s); if(B.log.length > 200) B.log.shift(); console.info('[gi-bake]', s); };
B.host = h => { H = h; THREE = h.THREE; R = h.renderer; say('host'); };

/* ---------------- the volume (keep in step with the index the bake writes) ---------------- */
B.grid = {x0: -1.5, y0: .4, z0: -10.25, d: 1.25, nx: 21, ny: 12, nz: 39};
B.box = {min: [-42, -18, -52], max: [64, 45, 78]};   // scene geometry taken into the bake
B.aoGrid = {x0: -1.25, y0: -.1, z0: -10, d: 1 / 3, nx: 72, ny: 42, nz: 141, R: 2.5};

/* ---------------- materials ---------------- */
const _c = document.createElement('canvas'); _c.width = _c.height = 32;
const s2l = c => c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
const texMean = new Map();
function texStats(t, alphaTest){ if(!t) return null; const key = t.uuid + ':' + (alphaTest || 0); if(texMean.has(key)) return texMean.get(key);
  let r = null; try{ const img = t.image; let d = null, n = 0;
    if(img && (img.getContext || img.tagName === 'IMG' || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) || img.tagName === 'CANVAS')){
      const g = _c.getContext('2d', {willReadFrequently: true}); g.clearRect(0, 0, 32, 32); g.drawImage(img, 0, 0, 32, 32); d = g.getImageData(0, 0, 32, 32).data; n = 1024; }
    else if(img && img.data && img.width){ const W = img.width, Hh = img.height, src = img.data, ch = src.length / (W * Hh); if(ch >= 3 && src instanceof Uint8Array){ n = Math.min(4096, W * Hh); d = new Uint8Array(n * 4); for(let i = 0; i < n; i++){ const s = Math.floor(i * W * Hh / n) * ch; d[i * 4] = src[s]; d[i * 4 + 1] = src[s + 1]; d[i * 4 + 2] = src[s + 2]; d[i * 4 + 3] = ch === 4 ? src[s + 3] : 255; } } }
    if(d){ const srgb = t.encoding === THREE.sRGBEncoding; let rr = 0, gg = 0, bb = 0, aa = 0, cov = 0; for(let i = 0; i < n; i++){ const a = d[i * 4 + 3] / 255; const f = v => srgb ? s2l(v / 255) : v / 255; rr += f(d[i * 4]) * (a > 0 ? 1 : 0); gg += f(d[i * 4 + 1]) * (a > 0 ? 1 : 0); bb += f(d[i * 4 + 2]) * (a > 0 ? 1 : 0); aa += a; cov += alphaTest ? (a >= alphaTest ? 1 : 0) : a; }
      const m = Math.max(1, Array.from({length: n}, (_, i) => d[i * 4 + 3] > 0 ? 1 : 0).reduce((x, y) => x + y, 0)); r = {rgb: [rr / m, gg / m, bb / m], a: aa / n, cov: cov / n}; } }
  catch(e){ r = null; }
  texMean.set(key, r); return r; }
function matInfo(m, mesh){ const c = m.color ? [m.color.r, m.color.g, m.color.b] : [1, 1, 1], at = m.alphaTest || 0;
  let alb = c.slice(), cov = 1; const ts = texStats(m.map, at);
  if(ts){ alb = alb.map((v, i) => v * ts.rgb[i]); if(at > 0 || m.transparent) cov = at > 0 ? ts.cov : ts.a; }
  const am = texStats(m.alphaMap, at); if(am) cov *= at > 0 ? am.cov : am.rgb[1];
  if(m.transparent) cov *= m.opacity; else if(at > 0 && m.opacity < at) cov = 0;
  if(m.vertexColors && mesh.geometry.attributes.color){ const ca = mesh.geometry.attributes.color, n = Math.min(ca.count, 2000); let s = [0, 0, 0]; for(let i = 0; i < n; i++){ const j = Math.floor(i * ca.count / n); s[0] += ca.getX(j); s[1] += ca.getY(j); s[2] += ca.getZ(j); } alb = alb.map((v, i) => v * s[i] / n); }
  const met = m.metalness || 0; alb = alb.map(v => Math.min(.92, v * (1 - .6 * met)));
  return {alb, cov: Math.max(0, Math.min(1, cov)), side: m.side === THREE.DoubleSide ? 1 : m.side === THREE.BackSide ? 2 : 0, name: m.name || ''}; }
function skip(o, m){ if(!m || !m.visible) return 'hidden'; if(o.isSprite || o.isPoints || o.isLine) return 'helper';
  if(m.isMeshBasicMaterial || m.isShaderMaterial || m.isRawShaderMaterial || m.isMeshDepthMaterial) return 'basic';
  if(m.userData && m.userData.glass20) return 'glass'; if((m.transmission || 0) > 0 || /glass/i.test(m.name || '')) return 'glass';
  if(m.transparent && m.opacity < .35) return 'transparent'; if(/^(find-|esc-|deck-|gi-)/.test(o.name || '')) return 'game'; if(m.blending === THREE.MultiplyBlending || m.blending === THREE.AdditiveBlending) return 'decal';
  return null; }
const visible = o => { for(let p = o; p; p = p.parent) if(!p.visible) return false; return true; };

/* ---------------- geometry ---------------- */
B.extract = function(){ const t0 = performance.now(), box = new THREE.Box3(new THREE.Vector3(...B.box.min), new THREE.Vector3(...B.box.max)), S = H.scene; S.updateMatrixWorld(true);
  const mats = [], mIx = new Map(), P = [], M = [], why = {}, kept = {}; let nT = 0; const bb = new THREE.Box3(), va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), mw = new THREE.Matrix4(), im = new THREE.Matrix4();
  const mid = (m, o) => { const k = m.uuid + (m.vertexColors ? o.geometry.uuid : ''); let i = mIx.get(k); if(i == null){ i = mats.length; mats.push(matInfo(m, o)); mIx.set(k, i); } return i; };
  S.traverse(o => { if(!o.isMesh || !visible(o)) return; const g = o.geometry, pos = g && g.attributes.position; if(!pos) return; if(!g.boundingBox) g.computeBoundingBox();
    const ms = [].concat(o.material), groups = g.groups && g.groups.length && Array.isArray(o.material) ? g.groups : [{start: 0, count: g.index ? g.index.count : pos.count, materialIndex: 0}];
    const inst = o.isInstancedMesh ? o.count : 1, idx = g.index;
    for(let k = 0; k < inst; k++){ mw.copy(o.matrixWorld); if(o.isInstancedMesh){ o.getMatrixAt(k, im); mw.multiply(im); }
      bb.copy(g.boundingBox).applyMatrix4(mw); if(!bb.intersectsBox(box)) continue;
      for(const gr of groups){ const m = ms[gr.materialIndex || 0], w = skip(o, m); if(w){ why[w] = (why[w] || 0) + gr.count / 3; continue; } const mi = mid(m, o);
        let top = o; while(top.parent && top.parent !== S) top = top.parent; const tn = top.name || top.type;
        const end = Math.min(gr.start + gr.count, idx ? idx.count : pos.count);
        for(let i = gr.start; i + 2 < end; i += 3){ const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
          va.fromBufferAttribute(pos, a).applyMatrix4(mw); vb.fromBufferAttribute(pos, b).applyMatrix4(mw); vc.fromBufferAttribute(pos, c).applyMatrix4(mw);
          if(Math.max(va.x, vb.x, vc.x) < box.min.x || Math.min(va.x, vb.x, vc.x) > box.max.x || Math.max(va.y, vb.y, vc.y) < box.min.y || Math.min(va.y, vb.y, vc.y) > box.max.y || Math.max(va.z, vb.z, vc.z) < box.min.z || Math.min(va.z, vb.z, vc.z) > box.max.z) continue;
          P.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z); M.push(mi); nT++; kept[tn] = (kept[tn] || 0) + 1; } } } });
  B.geo = {P: new Float32Array(P), M: new Uint32Array(M), mats, n: nT}; B.st.extract = {tris: nT, mats: mats.length, ms: Math.round(performance.now() - t0), skipped: why, kept};
  say('extract', nT, 'tris', mats.length, 'mats', B.st.extract.ms, 'ms'); return B.st.extract; };

/* ---------------- BVH (binned SAH), flattened depth first: left child = next node ---------------- */
B.build = function(){ const t0 = performance.now(), {P, n} = B.geo, bmin = new Float32Array(n * 3), bmax = new Float32Array(n * 3), cen = new Float32Array(n * 3), ord = new Uint32Array(n);
  for(let t = 0; t < n; t++){ ord[t] = t; for(let k = 0; k < 3; k++){ const a = P[t * 9 + k], b = P[t * 9 + 3 + k], c = P[t * 9 + 6 + k]; bmin[t * 3 + k] = Math.min(a, b, c); bmax[t * 3 + k] = Math.max(a, b, c); cen[t * 3 + k] = (a + b + c) / 3; } }
  let nodes = new Float32Array(Math.max(1024, n * 2) * 8), nn = 0; const NB = 16, bc = new Int32Array(NB), bl = new Float32Array(NB * 6); let maxD = 0;
  const area = (x0, y0, z0, x1, y1, z1) => { const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0; return dx < 0 ? 0 : 2 * (dx * dy + dy * dz + dz * dx); };
  function node(s, e, depth){ const me = nn++; if(nn * 8 > nodes.length){ const nx = new Float32Array(nodes.length * 2); nx.set(nodes); nodes = nx; } if(depth > maxD) maxD = depth;
    let x0 = 1e30, y0 = 1e30, z0 = 1e30, x1 = -1e30, y1 = -1e30, z1 = -1e30, cx0 = 1e30, cy0 = 1e30, cz0 = 1e30, cx1 = -1e30, cy1 = -1e30, cz1 = -1e30;
    for(let i = s; i < e; i++){ const t = ord[i] * 3; if(bmin[t] < x0) x0 = bmin[t]; if(bmin[t + 1] < y0) y0 = bmin[t + 1]; if(bmin[t + 2] < z0) z0 = bmin[t + 2]; if(bmax[t] > x1) x1 = bmax[t]; if(bmax[t + 1] > y1) y1 = bmax[t + 1]; if(bmax[t + 2] > z1) z1 = bmax[t + 2];
      if(cen[t] < cx0) cx0 = cen[t]; if(cen[t + 1] < cy0) cy0 = cen[t + 1]; if(cen[t + 2] < cz0) cz0 = cen[t + 2]; if(cen[t] > cx1) cx1 = cen[t]; if(cen[t + 1] > cy1) cy1 = cen[t + 1]; if(cen[t + 2] > cz1) cz1 = cen[t + 2]; }
    const o = me * 8; nodes[o] = x0; nodes[o + 1] = y0; nodes[o + 2] = z0; nodes[o + 4] = x1; nodes[o + 5] = y1; nodes[o + 6] = z1;
    const cnt = e - s; const leaf = () => { nodes[o + 3] = s; nodes[o + 7] = cnt; return me; };
    if(cnt <= 2 || depth > 60) return leaf();
    const ex = [cx1 - cx0, cy1 - cy0, cz1 - cz0], ax = ex[0] >= ex[1] && ex[0] >= ex[2] ? 0 : ex[1] >= ex[2] ? 1 : 2, lo = [cx0, cy0, cz0][ax], span = ex[ax];
    if(!(span > 1e-7)) return cnt <= 8 ? leaf() : split(s, e, depth, me, o, Math.floor((s + e) / 2), ax, true);
    bc.fill(0); for(let b = 0; b < NB; b++){ bl[b * 6] = bl[b * 6 + 1] = bl[b * 6 + 2] = 1e30; bl[b * 6 + 3] = bl[b * 6 + 4] = bl[b * 6 + 5] = -1e30; }
    const kf = NB / span; for(let i = s; i < e; i++){ const t = ord[i] * 3; let b = Math.floor((cen[t + ax] - lo) * kf); if(b >= NB) b = NB - 1; bc[b]++; const q = b * 6;
      for(let k = 0; k < 3; k++){ if(bmin[t + k] < bl[q + k]) bl[q + k] = bmin[t + k]; if(bmax[t + k] > bl[q + 3 + k]) bl[q + 3 + k] = bmax[t + k]; } }
    let best = 1e30, bs = -1; const la = new Float32Array(NB), lc = new Int32Array(NB); { let a0 = 1e30, a1 = 1e30, a2 = 1e30, b0 = -1e30, b1 = -1e30, b2 = -1e30, c = 0;
      for(let b = 0; b < NB - 1; b++){ const q = b * 6; if(bc[b]){ a0 = Math.min(a0, bl[q]); a1 = Math.min(a1, bl[q + 1]); a2 = Math.min(a2, bl[q + 2]); b0 = Math.max(b0, bl[q + 3]); b1 = Math.max(b1, bl[q + 4]); b2 = Math.max(b2, bl[q + 5]); } c += bc[b]; la[b] = c ? area(a0, a1, a2, b0, b1, b2) : 0; lc[b] = c; } }
    { let a0 = 1e30, a1 = 1e30, a2 = 1e30, b0 = -1e30, b1 = -1e30, b2 = -1e30, c = 0;
      for(let b = NB - 1; b > 0; b--){ const q = b * 6; if(bc[b]){ a0 = Math.min(a0, bl[q]); a1 = Math.min(a1, bl[q + 1]); a2 = Math.min(a2, bl[q + 2]); b0 = Math.max(b0, bl[q + 3]); b1 = Math.max(b1, bl[q + 4]); b2 = Math.max(b2, bl[q + 5]); } c += bc[b];
        const cost = la[b - 1] * lc[b - 1] + (c ? area(a0, a1, a2, b0, b1, b2) * c : 0); if(lc[b - 1] > 0 && c > 0 && cost < best){ best = cost; bs = b; } } }
    const leafCost = area(x0, y0, z0, x1, y1, z1) * cnt;
    if(bs < 0 || (best >= leafCost * .9 && cnt <= 4)) return cnt <= 8 ? leaf() : split(s, e, depth, me, o, Math.floor((s + e) / 2), ax, true);
    // partition by bin
    let i = s, j = e - 1; while(i <= j){ const t = ord[i] * 3; let b = Math.floor((cen[t + ax] - lo) * kf); if(b >= NB) b = NB - 1; if(b < bs) i++; else { const tmp = ord[i]; ord[i] = ord[j]; ord[j] = tmp; j--; } }
    if(i === s || i === e) return cnt <= 8 ? leaf() : split(s, e, depth, me, o, Math.floor((s + e) / 2), ax, true);
    return split(s, e, depth, me, o, i, ax, false); }
  function split(s, e, depth, me, o, m, ax, median){
    if(median){ const sub = Array.from(ord.subarray(s, e)).sort((a, b) => cen[a * 3 + ax] - cen[b * 3 + ax]); ord.set(sub, s); }
    node(s, m, depth + 1); const r = node(m, e, depth + 1); nodes[o + 3] = r; nodes[o + 7] = 0; return me; }
  node(0, n, 0);
  B.bvh = {nodes: nodes.subarray(0, nn * 8), nn, ord, maxD}; B.st.build = {nodes: nn, depth: maxD, ms: Math.round(performance.now() - t0)}; say('bvh', nn, 'nodes depth', maxD, B.st.build.ms, 'ms'); return B.st.build; };

/* ---------------- GPU data ---------------- */
const TW = 4096;
function ftex(arr, texels){ const h = Math.max(1, Math.ceil(texels / TW)), d = new Float32Array(TW * h * 4); d.set(arr.subarray ? arr.subarray(0, Math.min(arr.length, d.length)) : arr);
  const t = new THREE.DataTexture(d, TW, h, THREE.RGBAFormat, THREE.FloatType); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true; return t; }
B.upload = function(){ const {P, M, mats, n} = B.geo, {nodes, nn, ord} = B.bvh, T = new Float32Array(n * 12);
  for(let i = 0; i < n; i++){ const t = ord[i], p = t * 9, o = i * 12, m = mats[M[t]];
    T[o] = P[p]; T[o + 1] = P[p + 1]; T[o + 2] = P[p + 2]; T[o + 3] = M[t];
    T[o + 4] = P[p + 3] - P[p]; T[o + 5] = P[p + 4] - P[p + 1]; T[o + 6] = P[p + 5] - P[p + 2]; T[o + 7] = m.cov;
    T[o + 8] = P[p + 6] - P[p]; T[o + 9] = P[p + 7] - P[p + 1]; T[o + 10] = P[p + 8] - P[p + 2]; T[o + 11] = m.side; }
  const Mt = new Float32Array(mats.length * 4); mats.forEach((m, i) => { Mt.set([m.alb[0], m.alb[1], m.alb[2], m.cov], i * 4); });
  for(const k of ['tTri', 'tNode', 'tMat']) if(B[k]) B[k].dispose();
  B.tTri = ftex(T, n * 3); B.tNode = ftex(nodes, nn * 2); B.tMat = ftex(Mt, mats.length); say('upload', (T.byteLength + nodes.byteLength) / 1e6 | 0, 'MB'); return {tri: n, nodes: nn}; };

/* ---------------- the trace shader ---------------- */
const FS = `precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uTri, uNode, uMat, uSky, uPrb;
uniform int uComp, uDirs, uOff, uOutW, uMaxB, uSeed, uNL, uNoGeo;
uniform vec2 uJit; uniform vec3 uSun; uniform float uAOR;
uniform vec4 uLP[40]; uniform vec4 uLC[40]; uniform vec4 uLD[40]; uniform vec2 uLE[40];
out vec4 oc;
ivec2 ix(int i){ return ivec2(i % ${TW}, i / ${TW}); }
uint hsh(uint x){ x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
uint st; float rnd(){ st = hsh(st + 0x9e3779b9u); return float(st >> 8) / 16777216.0; }
int stk[64]; float hitT; int hitI;
vec3 safe(vec3 d){ return vec3(abs(d.x) < 1e-9 ? 1e-9 : d.x, abs(d.y) < 1e-9 ? 1e-9 : d.y, abs(d.z) < 1e-9 ? 1e-9 : d.z); }
bool isect(vec3 ro, vec3 rd, float tmax, bool anyHit, uint rid){
  hitI = -1; hitT = tmax; if(uNoGeo == 1) return false;
  vec3 inv = 1.0 / safe(rd); int sp = 0, ni = 0; float best = tmax;
  for(int it = 0; it < 200000; it++){
    vec4 A = texelFetch(uNode, ix(2 * ni), 0), Bn = texelFetch(uNode, ix(2 * ni + 1), 0);
    vec3 t0 = (A.xyz - ro) * inv, t1 = (Bn.xyz - ro) * inv, tn3 = min(t0, t1), tf3 = max(t0, t1);
    float tn = max(max(tn3.x, tn3.y), max(tn3.z, 0.0)), tf = min(min(tf3.x, tf3.y), min(tf3.z, best));
    if(tn <= tf){
      int c = int(Bn.w + 0.5);
      if(c > 0){ int f = int(A.w + 0.5);
        for(int k = 0; k < 16; k++){ if(k >= c) break; int t = f + k;
          vec4 V0 = texelFetch(uTri, ix(3 * t), 0), E1 = texelFetch(uTri, ix(3 * t + 1), 0), E2 = texelFetch(uTri, ix(3 * t + 2), 0);
          vec3 p = cross(rd, E2.xyz); float det = dot(E1.xyz, p); if(abs(det) < 1e-14) continue; float id = 1.0 / det; vec3 s = ro - V0.xyz;
          float u = dot(s, p) * id; if(u < 0.0 || u > 1.0) continue; vec3 q = cross(s, E1.xyz); float v = dot(rd, q) * id; if(v < 0.0 || u + v > 1.0) continue;
          float tt = dot(E2.xyz, q) * id; if(tt <= 1e-4 || tt >= best) continue;
          if(E1.w < 0.999 && float(hsh(rid ^ (uint(t) * 0x27d4eb2du)) >> 8) / 16777216.0 >= E1.w) continue;
          best = tt; hitI = t; if(anyHit){ hitT = best; return true; } }
      } else { if(sp < 64) stk[sp++] = int(A.w + 0.5); ni = ni + 1; continue; }
    }
    if(sp == 0) break; ni = stk[--sp];
  }
  hitT = best; return hitI >= 0;
}
vec3 sky(vec3 d){ ivec2 sz = textureSize(uSky, 0); float u = atan(d.z, d.x) * 0.15915494 + 0.5, v = asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5;
  return texelFetch(uSky, ivec2(clamp(int(u * float(sz.x)), 0, sz.x - 1), clamp(int(v * float(sz.y)), 0, sz.y - 1)), 0).rgb; }
vec3 cosDir(vec3 n){ float r1 = rnd(), r2 = rnd(), ph = 6.28318531 * r1, sr = sqrt(r2); vec3 t = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0))), b = cross(n, t);
  return normalize(t * (cos(ph) * sr) + b * (sin(ph) * sr) + n * sqrt(max(0.0, 1.0 - r2))); }
void main(){
  ivec2 fc = ivec2(gl_FragCoord.xy); int pix = fc.y * uOutW + fc.x, pr = uOff + pix / uDirs, j = pix - (pix / uDirs) * uDirs;
  vec4 PP = texelFetch(uPrb, ix(pr), 0); if(PP.w < 0.5){ oc = vec4(0.0); return; }
  int sq = int(sqrt(float(uDirs)) + 0.5); float a = (float(j - (j / sq) * sq) + uJit.x) / float(sq), b = (float(j / sq) + uJit.y) / float(sq);
  float z = 1.0 - 2.0 * a, rr = sqrt(max(0.0, 1.0 - z * z)), ph = 6.28318531 * b; vec3 d = vec3(rr * cos(ph), z, rr * sin(ph));
  st = hsh(uint(pr) * 9781u + uint(j) * 6271u + uint(uSeed) * 26699u + 1u);
  vec3 o = PP.xyz, L = vec3(0.0), T = vec3(1.0); float first = 1e9;
  if(uComp == 3){ bool h = isect(o, d, uAOR, false, hsh(st)); float r = 1e9; if(h){ vec4 E1 = texelFetch(uTri, ix(3 * hitI + 1), 0), E2 = texelFetch(uTri, ix(3 * hitI + 2), 0);
      vec3 n = cross(E1.xyz, E2.xyz); bool front = dot(n, d) < 0.0; int side = int(E2.w + 0.5); if(side == 2) front = !front; r = (front || side == 1) ? hitT : -hitT; }
    oc = vec4(0.0, 0.0, 0.0, r); return; }
  for(int bn = 0; bn < 6; bn++){ if(bn >= uMaxB) break;
    uint rid = hsh(st ^ (uint(bn + 1) * 0x68e31da4u));
    if(!isect(o, d, 1e6, false, rid)){ if(uComp == 0) L += T * sky(d); if(bn == 0) first = 1e9; break; }
    vec4 V0 = texelFetch(uTri, ix(3 * hitI), 0), E1 = texelFetch(uTri, ix(3 * hitI + 1), 0), E2 = texelFetch(uTri, ix(3 * hitI + 2), 0);
    vec3 n = normalize(cross(E1.xyz, E2.xyz)); bool front = dot(n, d) < 0.0; int side = int(E2.w + 0.5); if(side == 2) front = !front;
    if(!front && side != 1){ if(bn == 0) first = -hitT; break; }
    if(dot(n, d) > 0.0) n = -n;
    if(bn == 0) first = hitT;
    vec3 P = o + d * hitT, alb = texelFetch(uMat, ix(int(V0.w + 0.5)), 0).rgb, Po = P + n * 2e-3;
    if(uComp == 1){ float c = dot(n, uSun); if(c > 0.0 && !isect(Po, uSun, 1e6, true, hsh(rid + 77u))) L += T * alb * c; }
    else if(uComp == 2 && uNL > 0){ int li = min(int(rnd() * float(uNL)), uNL - 1); vec4 LP = uLP[li], LC = uLC[li], LD = uLD[li];
      vec3 tl = LP.xyz - P; float dl = length(tl); vec3 wl = tl / max(dl, 1e-4); float c = dot(n, wl);
      float att = (LP.w > 0.0 && LC.w > 0.0) ? pow(clamp(1.0 - dl / LP.w, 0.0, 1.0), LC.w) : 1.0;
      if(LD.w > 0.5) att *= smoothstep(uLE[li].x, uLE[li].y, dot(-wl, LD.xyz));
      if(c > 0.0 && att > 0.0 && !isect(Po, wl, dl - 4e-3, true, hsh(rid + 99u))) L += T * alb * LC.rgb * (c * att * float(uNL)); }
    T *= alb;
    if(bn >= 1){ float q = clamp(max(T.r, max(T.g, T.b)) * 1.2, 0.05, 1.0); if(rnd() > q) break; T /= q; }
    d = cosDir(n); o = Po;
  }
  oc = vec4(L, first);
}`;
function mat(){ if(B.mat) return B.mat; const U = {uTri: {value: null}, uNode: {value: null}, uMat: {value: null}, uSky: {value: null}, uPrb: {value: null},
    uComp: {value: 0}, uDirs: {value: 64}, uOff: {value: 0}, uOutW: {value: 1024}, uMaxB: {value: 5}, uSeed: {value: 1}, uNL: {value: 0}, uNoGeo: {value: 0},
    uJit: {value: new THREE.Vector2()}, uSun: {value: new THREE.Vector3(0, 1, 0)}, uAOR: {value: 2.5},
    uLP: {value: Array.from({length: 40}, () => new THREE.Vector4())}, uLC: {value: Array.from({length: 40}, () => new THREE.Vector4())}, uLD: {value: Array.from({length: 40}, () => new THREE.Vector4())}, uLE: {value: Array.from({length: 40}, () => new THREE.Vector2())}};
  B.mat = new THREE.RawShaderMaterial({glslVersion: THREE.GLSL3, uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: 'in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FS});
  B.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), B.mat); B.quad.frustumCulled = false; B.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); B.qs = new THREE.Scene(); B.qs.add(B.quad); return B.mat; }

/* ---------------- probes ---------------- */
B.probes = function(list){ const g = B.grid, pts = list || []; if(!list) for(let y = 0; y < g.ny; y++) for(let z = 0; z < g.nz; z++) for(let x = 0; x < g.nx; x++) pts.push([g.x0 + x * g.d, g.y0 + y * g.d, g.z0 + z * g.d]);
  const n = pts.length, d = new Float32Array(Math.ceil(n / TW) * TW * 4 || TW * 4); pts.forEach((p, i) => d.set([p[0], p[1], p[2], 1], i * 4));
  if(B.tPrb) B.tPrb.dispose(); const t = new THREE.DataTexture(d, TW, Math.max(1, Math.ceil(n / TW)), THREE.RGBAFormat, THREE.FloatType); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; B.tPrb = t; B.np = n; B.pts = pts; return n; };

/* ---------------- sky: the canvas the page painted for ENV_RT, as linear radiance ---------------- */
B.skyFrom = function(src){ const W = src.width, Hh = src.height, g = document.createElement('canvas'); g.width = W; g.height = Hh; const c = g.getContext('2d'); c.drawImage(src, 0, 0); const d = c.getImageData(0, 0, W, Hh).data, f = new Float32Array(W * Hh * 4);
  for(let j = 0; j < Hh; j++) for(let i = 0; i < W; i++){ const s = (j * W + i) * 4, o = ((Hh - 1 - j) * W + i) * 4; f[o] = s2l(d[s] / 255); f[o + 1] = s2l(d[s + 1] / 255); f[o + 2] = s2l(d[s + 2] / 255); f[o + 3] = 1; }
  const t = new THREE.DataTexture(f, W, Hh, THREE.RGBAFormat, THREE.FloatType); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
B.skyNow = () => { const e = H.ENV_RT, s = e && e.giSrc; if(!s) throw new Error('no sky source (PMREM patch missed it)'); return s; };

/* ---------------- lights for the lamp component (the room lamps and fixtures near the rooms, as they are now) ---------------- */
B.lights = function(){ const g = B.grid, L = [], p = new THREE.Vector3(), q = new THREE.Vector3(), ext = 6;
  H.scene.traverse(o => { if(!(o.isPointLight || o.isSpotLight) || !visible(o) || !(o.intensity > 0)) return; o.getWorldPosition(p);
    if(p.x < g.x0 - ext || p.x > g.x0 + g.d * g.nx + ext || p.z < g.z0 - ext || p.z > g.z0 + g.d * g.nz + ext || p.y < -2 || p.y > 20) return;
    const e = {pos: p.toArray(), col: [o.color.r * o.intensity, o.color.g * o.intensity, o.color.b * o.intensity], dist: o.distance || 0, decay: o.decay || 0, spot: !!o.isSpotLight, name: o.name || o.type, I: o.intensity};
    if(o.isSpotLight){ o.target.getWorldPosition(q); e.dir = q.sub(p).normalize().toArray(); e.cos = [Math.cos(o.angle), Math.cos(o.angle * (1 - o.penumbra))]; } L.push(e); });
  return L; };
function setLights(L){ const U = mat().uniforms; const n = Math.min(40, L.length); U.uNL.value = n;
  for(let i = 0; i < n; i++){ const l = L[i]; U.uLP.value[i].set(l.pos[0], l.pos[1], l.pos[2], l.dist); U.uLC.value[i].set(l.col[0], l.col[1], l.col[2], l.decay); U.uLD.value[i].set(...(l.dir || [0, -1, 0]), l.spot ? 1 : 0); U.uLE.value[i].set(...(l.cos || [0, 0])); } }

/* ---------------- running a component ---------------- */
const yield_ = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
function dirOf(j, jit, sq){ const a = ((j % sq) + jit[0]) / sq, b = (Math.floor(j / sq) + jit[1]) / sq, z = 1 - 2 * a, rr = Math.sqrt(Math.max(0, 1 - z * z)), ph = 2 * Math.PI * b; return [rr * Math.cos(ph), z, rr * Math.sin(ph)]; }
// comp: 'sky' | 'sun' | 'lamp' | 'ao'; o: {sun: [x,y,z], sky: canvas, lights, passes, maxB, dirs, noGeo, R}
B.run = async function(comp, o = {}){ const U = mat().uniforms, np = B.np, dirs = o.dirs || 64, sq = Math.round(Math.sqrt(dirs)), passes = o.passes || 16, W = 1024, rows = Math.ceil(np * dirs / W), t0 = performance.now();
  U.uTri.value = B.tTri; U.uNode.value = B.tNode; U.uMat.value = B.tMat; U.uPrb.value = B.tPrb; U.uDirs.value = dirs; U.uOutW.value = W; U.uMaxB.value = o.maxB || 5; U.uNoGeo.value = o.noGeo ? 1 : 0;
  U.uComp.value = {sky: 0, sun: 1, lamp: 2, ao: 3}[comp]; U.uAOR.value = o.R || 2.5;
  if(comp === 'sun') U.uSun.value.set(...o.sun).normalize();
  if(comp === 'sky'){ if(B.tSky) B.tSky.dispose(); B.tSky = B.skyFrom(o.sky || B.skyNow()); } if(!B.tSky){ B.tSky = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType); B.tSky.needsUpdate = true; } U.uSky.value = B.tSky;
  if(comp === 'lamp') setLights(o.lights || B.lights());
  const maxRows = Math.min(rows, o.rows || 4096), chunk = o.chunkRows || 64;
  if(!B.rt || B.rt.width !== W || B.rt.height < maxRows){ if(B.rt) B.rt.dispose(); B.rt = new THREE.WebGLRenderTarget(W, maxRows, {type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false}); }
  const acc = new Float64Array(np * 12), aoS = comp === 'ao' ? new Float64Array(np * 3) : null, stat = new Float64Array(np * 3), buf = new Float32Array(W * chunk * 4);
  const prevRT = R.getRenderTarget(), prevAC = R.autoClear; R.autoClear = false;
  const probesPerBatch = Math.floor(maxRows * W / dirs);
  try{ for(let pass = 0; pass < passes; pass++){ const jit = [Math.random(), Math.random()]; U.uJit.value.set(jit[0], jit[1]); const DD = Array.from({length: dirs}, (_, j) => dirOf(j, jit, sq)); U.uSeed.value = (o.seed || 1) * 1000 + pass;
      for(let p0 = 0; p0 < np; p0 += probesPerBatch){ const nb = Math.min(probesPerBatch, np - p0), rr = Math.ceil(nb * dirs / W); U.uOff.value = p0;
        for(let y = 0; y < rr; y += chunk){ const h = Math.min(chunk, rr - y); B.rt.scissor.set(0, y, W, h); B.rt.scissorTest = true; B.rt.viewport.set(0, 0, W, maxRows); R.setRenderTarget(B.rt); R.render(B.qs, B.cam);
          R.readRenderTargetPixels(B.rt, 0, y, W, h, buf);
          for(let k = 0; k < W * h; k++){ const pix = (y * W) + k, pr = p0 + Math.floor(pix / dirs); if(pr >= p0 + nb) break; const j = pix % dirs, q = k * 4, dd = DD[j], f = buf[q + 3];
            if(aoS){ const r = o.R || 2.5; if(f < 0) aoS[pr * 3 + 1]++; else if(f < r) aoS[pr * 3] += 1 - f / r; aoS[pr * 3 + 2]++; continue; }
            const a = pr * 12; for(let c = 0; c < 3; c++){ const L = buf[q + c]; acc[a + c] += L * .282095; acc[a + 3 + c] += L * .488603 * dd[0]; acc[a + 6 + c] += L * .488603 * dd[1]; acc[a + 9 + c] += L * .488603 * dd[2]; }
            const s = pr * 3; if(f < 0) stat[s]++; else if(f < 1e8) stat[s + 1] += f; stat[s + 2]++; }
          await yield_(); } }
      if(o.onPass) o.onPass(pass); } }
  finally{ R.setRenderTarget(prevRT); R.autoClear = prevAC; }
  const ms = performance.now() - t0, N = dirs * passes;
  if(aoS){ const ao = new Float32Array(np * 2); for(let p = 0; p < np; p++){ ao[p * 2] = aoS[p * 3] / Math.max(1, aoS[p * 3 + 2]); ao[p * 2 + 1] = aoS[p * 3 + 1] / Math.max(1, aoS[p * 3 + 2]); } return {comp, ms, N, ao}; }
  // SH (radiance) -> irradiance-ready L1: E(n) = a + b . n, per channel; layout a.rgb, bx.rgb, by.rgb, bz.rgb
  const sh = new Float32Array(np * 12), A0 = Math.PI * .282095, A1 = 2 * Math.PI / 3 * .488603, k = 4 * Math.PI / N;
  for(let p = 0; p < np; p++) for(let c = 0; c < 3; c++){ const a = p * 12; sh[a + c] = acc[a + c] * k * A0; sh[a + 3 + c] = acc[a + 3 + c] * k * A1; sh[a + 6 + c] = acc[a + 6 + c] * k * A1; sh[a + 9 + c] = acc[a + 9 + c] * k * A1; }
  const back = new Float32Array(np); for(let p = 0; p < np; p++) back[p] = stat[p * 3] / Math.max(1, stat[p * 3 + 2]);
  return {comp, ms: Math.round(ms), N, sh, back, rays: np * N}; };

/* ---------------- IndexedDB checkpoints ---------------- */
function db(){ return B._db || (B._db = new Promise((res, rej) => { const r = indexedDB.open('gi-r42', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); }
B.put = async (k, v) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); }); };
B.get = async k => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readonly'), r = t.objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
B.keys = async () => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readonly'), r = t.objectStore('kv').getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
B.del = async k => { const d = await db(); return new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = () => res(true); }); };

/* ---------------- setup in one call ---------------- */
B.prepare = function(){ const a = B.extract(), b = B.build(), c = B.upload(); B.probes(); mat(); return {extract: {tris: a.tris, mats: a.mats, ms: a.ms, skipped: a.skipped}, build: b, upload: c, probes: B.np}; };
// a time of day by hour and day of year (the escape game's way): the page's own setTOD with a custom preset
B.tod = function(h, doy, dusk){ const T = H.TOD; let t = T.find(x => x.key === 'gibake'); if(!t){ t = {key: 'gibake', label: 'Bake', h, doy}; T.push(t); } t.h = h; t.doy = doy; H.setTOD(dusk ? 'dusk' : 'gibake');
  return {dir: H.SUN_DIR.toArray(), sun: [H.sun.color.r, H.sun.color.g, H.sun.color.b, H.sun.intensity], tod: H.TOD_KEY}; };

/* ---------------- which probes to trace: in the three rooms' air (BIM spaces) and not inside furniture or walls ---------------- */
const gpos = i => { const g = B.grid, x = i % g.nx, z = Math.floor(i / g.nx) % g.nz, y = Math.floor(i / (g.nx * g.nz)); return [g.x0 + x * g.d, g.y0 + y * g.d, g.z0 + z * g.d]; };
B.classify = async function(o = {}){ const g = B.grid, BS = H.BIM2S, N = g.nx * g.ny * g.nz, cls = new Uint8Array(N), pos = i => { const x = i % g.nx, z = Math.floor(i / g.nx) % g.nz, y = Math.floor(i / (g.nx * g.nz)); return [g.x0 + x * g.d, g.y0 + y * g.d, g.z0 + z * g.d]; };
  for(let i = 0; i < N; i++){ const [x, y, z] = pos(i), s = BS.spaceAt(z, x, y); cls[i] = s ? (GI.ROOMS.includes(s.id) ? 2 : s.interior ? 1 : 0) : 0; }
  const cand = []; for(let i = 0; i < N; i++) if(cls[i] === 2) cand.push(i);
  B.probes(cand.map(pos)); const r = await B.run('ao', {passes: o.passes || 1, dirs: 64, R: 1e5}); const valid = new Uint8Array(N), list = [];
  cand.forEach((i, k) => { if(r.ao[k * 2 + 1] < (o.maxBack || .06)){ valid[i] = 1; list.push(i); } });
  B.cls = cls; B.valid = valid; B.list = list; B.pos = pos; B.probes(list.map(pos)); B.st.classify = {N, rooms: cand.length, valid: list.length, ms: r.ms}; say('classify', JSON.stringify(B.st.classify)); return B.st.classify; };

/* ---------------- the whole bake: per key the sky and the unit sun, then the lamps at dusk; every component checkpointed ---------------- */
B.KEYS = [{h: 7.75, doy: 288}, {h: 9.25, doy: 288}, {h: 10.75, doy: 288}, {h: 12.25, doy: 288}, {h: 13.75, doy: 288}, {h: 15.25, doy: 288}, {h: 16.5, doy: 288}, {h: 17.4, doy: 288}, {h: 18.15, doy: 288}, {h: 18.75, doy: 288, dusk: true},
  {h: 9.5, doy: 165}, {h: 13, doy: 172}, {h: 17, doy: 172}, {h: 19.25, doy: 172}];
B.bakeAll = async function(o = {}){ const tag = o.tag || 'v1', keys = o.keys || B.KEYS, passes = o.passes || 16, t0 = performance.now(), tod0 = H.TOD_KEY, done = [], have = new Set(await B.keys());
  if(!B.list) await B.classify();
  const meta = (await B.get(tag + ':meta')) || {tag, list: B.list, grid: B.grid, keys: [], passes, made: new Date().toISOString()};
  if(meta.list.length !== B.list.length || meta.list.some((v, i) => v !== B.list[i])){ B.list = meta.list; B.probes(B.list.map(gpos)); say('probe list from the checkpoint', B.list.length); }
  const quit = () => o.budgetMs && performance.now() - t0 > o.budgetMs;
  try{
    for(let k = 0; k < keys.length; k++){ if(quit()) break; const K = keys[k], nm = tag + ':' + k;
      if(have.has(nm + ':sky') && have.has(nm + ':sun') && meta.keys[k]) continue;
      const st = B.tod(K.h, K.doy, K.dusk), src = B.skyNow(), sh = GI.skySH(src);
      meta.keys[k] = {h: K.h, doy: K.doy, dusk: !!K.dusk, dir: st.dir, sunCol: st.sun, sky: sh.slice(0, 3), skySH: sh, tod: st.tod}; await B.put(tag + ':meta', meta);
      if(!have.has(nm + ':sky')){ const r = await B.run('sky', {sky: src, passes, maxB: o.maxB || 5, seed: 11 + k}); await B.put(nm + ':sky', {sh: r.sh, ms: r.ms}); done.push(nm + ':sky ' + r.ms); say(nm, 'sky', r.ms); }
      if(quit()) break;
      if(!have.has(nm + ':sun')){ const r = await B.run('sun', {sun: st.dir, passes, maxB: o.maxB || 5, seed: 51 + k}); await B.put(nm + ':sun', {sh: r.sh, ms: r.ms}); done.push(nm + ':sun ' + r.ms); say(nm, 'sun', r.ms); } }
    if(!quit() && !have.has(tag + ':lamp')){ B.tod(18.75, 288, true); const L = B.lights(); let s = 0, n = 0; for(const l of H.DUSK_LIGHTS) if(GI.inRegion ? inReg(l) : true){ s += l.intensity; n++; }
      meta.lampRef = n ? s / n : 0; meta.lights = L.map(l => ({name: l.name, I: +l.I.toFixed(3), pos: l.pos.map(v => +v.toFixed(2))})); await B.put(tag + ':meta', meta);
      const r = await B.run('lamp', {lights: L, passes, maxB: o.maxB || 5, seed: 97}); await B.put(tag + ':lamp', {sh: r.sh, ms: r.ms}); done.push('lamp ' + r.ms + ' (' + L.length + ' lights)'); say('lamp', r.ms); } }
  finally{ try{ H.setTOD(tod0); }catch(e){} }
  const all = new Set(await B.keys()), need = keys.map((_, k) => [tag + ':' + k + ':sky', tag + ':' + k + ':sun']).flat().concat([tag + ':lamp']);
  return {done, missing: need.filter(x => !all.has(x)), ms: Math.round(performance.now() - t0)}; };
function inReg(l){ const p = l.getWorldPosition(new THREE.Vector3()), g = B.grid; return p.x >= g.x0 - 2 && p.x <= g.x0 + g.d * g.nx + 2 && p.z >= g.z0 - 2 && p.z <= g.z0 + g.d * g.nz + 2 && p.y >= g.y0 - 3 && p.y <= g.y0 + g.d * g.ny + 3; }

/* ---------------- the AO volume (contact shadow): obscurance within R over the sphere, in the rooms only ---------------- */
B.bakeAO = async function(o = {}){ const A = Object.assign({}, B.aoGrid, o.grid || {}), BS = H.BIM2S, N = A.nx * A.ny * A.nz, list = [], P = [];
  for(let y = 0; y < A.ny; y++) for(let z = 0; z < A.nz; z++) for(let x = 0; x < A.nx; x++){ const X = A.x0 + x * A.d, Y = A.y0 + y * A.d, Z = A.z0 + z * A.d;
    if(GI.roomAt(X, Y, Z) > 0 || GI.roomAt(X + .6, Y, Z) > 0 || GI.roomAt(X - .6, Y, Z) > 0 || GI.roomAt(X, Y, Z + .6) > 0 || GI.roomAt(X, Y, Z - .6) > 0){ list.push((y * A.nz + z) * A.nx + x); P.push([X, Y, Z]); } }
  const out = new Float32Array(N * 2).fill(-1), step = o.batch || 60000, t0 = performance.now();
  for(let s = 0; s < list.length; s += step){ B.probes(P.slice(s, s + step)); const r = await B.run('ao', {passes: o.passes || 1, dirs: o.dirs || 64, R: A.R});
    for(let k = 0; k < r.ao.length / 2; k++){ out[list[s + k] * 2] = r.ao[k * 2]; out[list[s + k] * 2 + 1] = r.ao[k * 2 + 1]; } say('ao', s, '/', list.length); }
  await B.put((o.tag || 'v1') + ':ao', {grid: A, ao: out}); B.probes(B.list ? B.list.map(gpos) : undefined); return {voxels: list.length, ms: Math.round(performance.now() - t0)}; };

/* ---------------- from the checkpoints to the files ---------------- */
function jacobi(Ain, n){ const A = Ain.map(r => r.slice()), V = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0));
  for(let sw = 0; sw < 60; sw++){ let off = 0; for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++) off += A[i][j] * A[i][j]; if(off < 1e-22) break;
    for(let p = 0; p < n; p++) for(let q = p + 1; q < n; q++){ if(Math.abs(A[p][q]) < 1e-30) continue; const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for(let k = 0; k < n; k++){ const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for(let k = 0; k < n; k++){ const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for(let k = 0; k < n; k++){ const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; } } }
  const ev = Array.from({length: n}, (_, i) => A[i][i]), ord = ev.map((v, i) => i).sort((a, b) => ev[b] - ev[a]); return {val: ord.map(i => ev[i]), vec: ord.map(i => V.map(r => r[i]))}; }
// grid volume from a list-order SH array, then dilated into the cells around the rooms (walls, furniture, outside: never lit from there)
function toGrid(sh, list, N){ const F = new Float32Array(N * 12); list.forEach((i, k) => { for(let c = 0; c < 12; c++) F[i * 12 + c] = sh[k * 12 + c]; }); return F; }
function dilate(F, filled0, g, rings){ const N = g.nx * g.ny * g.nz, filled = Uint8Array.from(filled0);
  for(let r = 0; r < rings; r++){ const add = []; for(let i = 0; i < N; i++){ if(filled[i]) continue; const x = i % g.nx, z = Math.floor(i / g.nx) % g.nz, y = Math.floor(i / (g.nx * g.nz)); let n = 0; const s = new Float64Array(12);
      for(let dy = -1; dy <= 1; dy++) for(let dz = -1; dz <= 1; dz++) for(let dx = -1; dx <= 1; dx++){ const X = x + dx, Y = y + dy, Z = z + dz; if(X < 0 || Y < 0 || Z < 0 || X >= g.nx || Y >= g.ny || Z >= g.nz) continue; const j = (Y * g.nz + Z) * g.nx + X; if(!filled[j]) continue; const w = 1 / (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) || 1); n += w; for(let c = 0; c < 12; c++) s[c] += F[j * 12 + c] * w; }
      if(n > 0) add.push([i, s.map(v => v / n)]); }
    for(const [i, s] of add){ F.set(s, i * 12); filled[i] = 1; } }
  return filled; }
function denoise(F, valid, g, k){ if(!(k > 0)) return; const N = g.nx * g.ny * g.nz, G = Float32Array.from(F);
  for(let i = 0; i < N; i++){ if(!valid[i]) continue; const x = i % g.nx, z = Math.floor(i / g.nx) % g.nz, y = Math.floor(i / (g.nx * g.nz)); let n = 1; const s = new Float64Array(12); for(let c = 0; c < 12; c++) s[c] = G[i * 12 + c];
    for(const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]){ const X = x + dx, Y = y + dy, Z = z + dz; if(X < 0 || Y < 0 || Z < 0 || X >= g.nx || Y >= g.ny || Z >= g.nz) continue; const j = (Y * g.nz + Z) * g.nx + X; if(!valid[j]) continue; n += k; for(let c = 0; c < 12; c++) s[c] += k * G[j * 12 + c]; }
    for(let c = 0; c < 12; c++) F[i * 12 + c] = s[c] / n; } }
// low rank (no centring, so a blend of keys stays a blend of coefficients): x_k = sum_b coef[k][b] * basis_b
function pca(vols0, used, energy, maxR){ const K = vols0.length, G = Array.from({length: K}, () => new Array(K).fill(0));
  // each key normalised first, so a dim key (dusk) is kept as well as a bright one; its norm goes back into its coefficients
  const nrm = vols0.map(X => { let s = 0; for(const i of used) for(let c = 0; c < 12; c++) s += X[i * 12 + c] * X[i * 12 + c]; return Math.sqrt(s) || 1; }), vols = vols0.map((X, k) => X.map(v => v / nrm[k]));
  for(let a = 0; a < K; a++) for(let b = a; b < K; b++){ let s = 0; const A = vols[a], Bv = vols[b]; for(const i of used) for(let c = 0; c < 12; c++) s += A[i * 12 + c] * Bv[i * 12 + c]; G[a][b] = G[b][a] = s; }
  const {val, vec} = jacobi(G, K), tot = val.reduce((x, y) => x + Math.max(0, y), 0); let r = 0, acc = 0; while(r < Math.min(K, maxR || K) && (acc < energy * tot || r < 1)){ acc += Math.max(0, val[r]); r++; }
  const N = vols[0].length / 12, bases = [], coef = Array.from({length: K}, () => new Array(r).fill(0));
  for(let b = 0; b < r; b++){ const sl = Math.sqrt(Math.max(1e-30, val[b])), U = new Float32Array(N * 12); for(let k = 0; k < K; k++){ const w = vec[b][k] / sl; if(!w) continue; const X = vols[k]; for(let i = 0; i < U.length; i++) U[i] += w * X[i]; }
    // sign: the first basis positive in L0
    let sg = 0; for(const i of used) sg += U[i * 12] + U[i * 12 + 1] + U[i * 12 + 2]; const f = sg < 0 ? -1 : 1; if(f < 0) for(let i = 0; i < U.length; i++) U[i] = -U[i];
    for(let k = 0; k < K; k++) coef[k][b] = f * vec[b][k] * sl * nrm[k]; bases.push(U); }
  return {bases, coef, energy: acc / tot, val}; }
function quant(F, used, NP, bits){ const r = [], mx = bits === 16 ? 65535 : 255, out = bits === 16 ? new Uint16Array(12 * NP) : new Uint8Array(12 * NP);
  for(let c = 0; c < 12; c++){ let lo = 1e30, hi = -1e30; for(const i of used){ const v = F[i * 12 + c]; if(v < lo) lo = v; if(v > hi) hi = v; } if(!(hi > lo)){ lo = Math.min(0, lo); hi = lo + 1e-6; }
    // zero must be exact (outside the used cells)
    if(lo > 0) lo = 0; if(hi < 0) hi = 0; const sc = mx / (hi - lo), z = Math.round(-lo * sc); hi = lo + mx / sc; r.push([+lo.toPrecision(7), +hi.toPrecision(7)]);
    for(let p = 0; p < NP; p++){ const v = used.has ? (used.has(p) ? F[p * 12 + c] : 0) : F[p * 12 + c]; out[c * NP + p] = Math.max(0, Math.min(mx, Math.round((v - lo) * sc))); } }
  return {q: out, r}; }
async function deflate(u8){ const s = new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))); return new Uint8Array(await s.arrayBuffer()); }
B.finish = async function(o = {}){ const tag = o.tag || 'v1', meta = await B.get(tag + ':meta'), g = meta.grid, N = g.nx * g.ny * g.nz, list = meta.list, K = meta.keys.length, t0 = performance.now();
  const valid = new Uint8Array(N); for(const i of list) valid[i] = 1;
  const load = async nm => { const r = await B.get(nm); if(!r) throw new Error('missing ' + nm); const F = toGrid(r.sh, list, N); denoise(F, valid, g, o.blur != null ? o.blur : .35); return F; };
  const sky = [], sun = []; for(let k = 0; k < K; k++){ sky.push(await load(tag + ':' + k + ':sky')); sun.push(await load(tag + ':' + k + ':sun')); } const lamp = await load(tag + ':lamp');
  let filled = null; for(const F of [...sky, ...sun, lamp]) filled = dilate(F, valid, g, o.rings || 3);
  const used = []; for(let i = 0; i < N; i++) if(filled[i]) used.push(i); const usedSet = new Set(used);
  const ps = pca(sky, used, o.eSky || .9995, o.rSky || 5), pu = pca(sun, used, o.eSun || .999, o.rSun || 8);
  // reconstruction error of the low rank, at the probes in the rooms (L0 luminance, relative)
  const err = (vols, P) => { let worst = 0, tot = 0, n = 0; vols.forEach((X, k) => { for(const i of list){ let rec = 0; const L = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
      const a = [0, 1, 2].map(c => P.bases.reduce((s, U, b) => s + P.coef[k][b] * U[i * 12 + c], 0)), x = [0, 1, 2].map(c => X[i * 12 + c]); rec = Math.abs(L(a) - L(x)) / Math.max(1e-4, L(x)); worst = Math.max(worst, rec); tot += rec; n++; } }); return {mean: +(tot / n).toFixed(4), worst: +worst.toFixed(3)}; };
  const vols = [], parts = [];
  const push = (F, kind, coef, bits) => { const qz = quant(F, usedSet, N, bits); vols.push({kind, coef: coef ? coef.map(v => +v.toPrecision(6)) : undefined, enc: bits === 16 ? 'q16' : 'q8', r: qz.r}); parts.push(new Uint8Array(qz.q.buffer)); };
  ps.bases.forEach((U, b) => push(U, 'sky', ps.coef.map(c => c[b]), b === 0 ? 16 : (o.bits || 8)));
  pu.bases.forEach((U, b) => push(U, 'sun', pu.coef.map(c => c[b]), b === 0 ? 16 : (o.bits || 8)));
  push(lamp, 'lamp', null, 16);
  let ao = null; const AOr = await B.get(tag + ':ao');
  if(AOr && o.ao !== false){ const A = AOr.grid, n = A.nx * A.ny * A.nz, a = new Uint8Array(n);
    const raw = AOr.ao, val = new Float32Array(n).fill(-1);
    for(let i = 0; i < n; i++){ if(raw[i * 2] < 0) continue; if(raw[i * 2 + 1] > .25) continue; val[i] = raw[i * 2]; }   // inside a solid: filled from outside neighbours below
    for(let r = 0; r < 3; r++){ const nv = Float32Array.from(val); for(let i = 0; i < n; i++){ if(val[i] >= 0 || raw[i * 2] < 0) continue; const x = i % A.nx, z = Math.floor(i / A.nx) % A.nz, y = Math.floor(i / (A.nx * A.nz)); let s = 0, m = 0;
        for(const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]){ const X = x + dx, Y = y + dy, Z = z + dz; if(X < 0 || Y < 0 || Z < 0 || X >= A.nx || Y >= A.ny || Z >= A.nz) continue; const j = (Y * A.nz + Z) * A.nx + X; if(val[j] >= 0){ s += val[j]; m++; } }
        if(m) nv[i] = s / m; } val.set(nv); }
    // the obscurance of open floor seen from the sampling offset above it (the median of that layer): no darkening there
    const yl = Math.round(((o.aoOff || .2) - A.y0) / A.d), lay = []; for(let i = yl * A.nx * A.nz; i < (yl + 1) * A.nx * A.nz; i++) if(val[i] >= 0) lay.push(val[i]); lay.sort((x, y) => x - y); const flat = o.aoFlat || lay[lay.length >> 1] || .4; B.st.aoFlat = flat;
    for(let i = 0; i < n; i++){ const v = val[i]; a[i] = v < 0 ? 255 : Math.round(255 * Math.max(0, Math.min(1, 1 - Math.max(0, v - flat) / (1 - flat) * (o.aoK || 1.6)))); }
    ao = {x0: A.x0, y0: A.y0, z0: A.z0, d: A.d, nx: A.nx, ny: A.ny, nz: A.nz, tx: Math.ceil(Math.sqrt(A.ny * A.nz / A.nx)), off: o.aoOff || .2}; ao.ty = Math.ceil(A.ny / ao.tx); parts.push(a); }
  let tot = 0; for(const p of parts) tot += p.length; const all = new Uint8Array(tot); let off = 0; for(const p of parts){ all.set(p, off); off += p.length; }
  const z = await deflate(all), ver = o.version || ('gi-' + tag);
  const index = {version: ver, made: meta.made, file: ver + '.bin', bytes: z.length, raw: tot, grid: g, nOff: o.nOff || .45, room: {y0: -1, y1: 15},
    keys: meta.keys.map(k => ({h: k.h, doy: k.doy, dusk: k.dusk, dir: k.dir.map(v => +v.toFixed(5)), sky: k.sky.map(v => +v.toPrecision(6)), sunCol: k.sunCol.map(v => +v.toFixed(4))})),
    lampRef: meta.lampRef, lights: meta.lights, passes: meta.passes, rays: meta.passes * 64, probes: list.length, vols, ao,
    pca: {sky: {rank: ps.bases.length, energy: +ps.energy.toFixed(6), err: err(sky, ps)}, sun: {rank: pu.bases.length, energy: +pu.energy.toFixed(6), err: err(sun, pu)}}};
  B.out = {index, z, raw: all}; say('finish', z.length, 'bytes', Math.round(performance.now() - t0), 'ms'); return {bytes: z.length, raw: tot, pca: index.pca, vols: vols.length, ms: Math.round(performance.now() - t0)}; };
// hand the result to gi.js in this page (no reload) and switch it on
B.apply = function(){ const {index, raw} = B.out; GI.useData(index, raw); GI.mode = '1'; GI.snap = true; return GI.status(); };
B.b64 = (off = 0, len = 180000) => { const z = B.out.z, s = z.subarray(off, off + len); let b = ''; for(let i = 0; i < s.length; i += 8192) b += String.fromCharCode.apply(null, s.subarray(i, i + 8192)); return btoa(b); };
})();
