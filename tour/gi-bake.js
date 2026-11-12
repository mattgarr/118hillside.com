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
B.skyNow = () => { const e = H.ENV_RT, s = e && e.userData.giSrc; if(!s) throw new Error('no sky source (PMREM patch missed it)'); return s; };

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
  if(comp === 'sky'){ if(B.tSky) B.tSky.dispose(); B.tSky = B.skyFrom(o.sky || B.skyNow()); } U.uSky.value = B.tSky || B.skyFrom(B.skyNow());
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
})();
