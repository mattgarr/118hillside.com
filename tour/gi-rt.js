/* gi-r43, tier B (?gi=2): the indirect light traced per pixel while the camera rests.

   The page keeps drawing its own picture (materials, textures, the sun and its shadows, exposure). Only the indirect light a surface
   receives changes source: from the baked probes (gi.js) to a value traced for that very pixel.

   - When the camera has stood still for a few frames, each pixel's visible surface point is found by a ray from the camera through
     the same BVH the bake uses (gi-bake.js), and then, a few samples a frame, a ray leaves that point in a cosine-weighted direction.
     Where it escapes it brings the sky; where it lands it brings that surface's albedo times the light falling there: the sun (a
     shadow ray), the lamps, and the bounce light the probes already hold. Outside the probes' rooms the path goes on by itself.
     The running mean is the irradiance at that pixel: contact shadows, the dark under cabinets and furniture, light fall-off from
     the windows and bounce colour, with no grid and no leaks.
   - The result is an irradiance cache in the screen of the pose it was traced from. The materials look it up by projecting THEIR
     world position into that pose and comparing the distance, so it stays valid while the camera then moves (irradiance on a diffuse
     surface does not depend on the viewer); what was hidden falls back to the probes. A new rest pose traces a second cache and
     fades over the first. A change of light (time of day, sun drag, lamps) fades the cache out and starts again.
   - Units as in gi.js: everything in the page's light units, lifted and white-balanced by the same giGain as the probes.
   Desktop only for now (float targets, a 60 MB BVH): phones stay on the probes. */
(function(){
'use strict';
const GI = window.GI; if(!GI || !GI.bake) return;
const B = GI.bake, Q = location.search, qp = (k, d) => { const m = new RegExp('[?&]' + k + '=([^&]*)').exec(Q); return m ? decodeURIComponent(m[1]) : d; };
const RT = GI.rt = {ready: false, why: 'waiting', scale: +qp('girs', .5), max: +qp('gimax', 768), min: +qp('gimin', 48), spf: 1, spfMax: +qp('gispf', 6), still: 0, traced: 0, builds: 0, buf: [], cur: 0, log: []};
let H, THREE, R;

const VS = 'in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FS_PRIM = () => B.FSLIB + `
uniform mat4 uIVP; uniform vec3 uCam; uniform vec2 uRes; uniform int uOut;
void main(){
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0; vec4 f = uIVP * vec4(ndc, 1.0, 1.0); vec3 rd = normalize(f.xyz / f.w - uCam), o = uCam;
  ivec2 fc = ivec2(gl_FragCoord.xy); uint rid = hsh(uint(fc.x) * 7919u + uint(fc.y) * 104729u + 17u); float tt = 0.0;
  for(int k = 0; k < 6; k++){
    if(!isect(o, rd, 1e6, false, rid)){ oc = vec4(0.0, 0.0, 0.0, -1.0); return; }
    vec4 E1 = texelFetch(uTri, ix(3 * hitI + 1), 0), E2 = texelFetch(uTri, ix(3 * hitI + 2), 0);
    vec3 n = normalize(cross(E1.xyz, E2.xyz)); bool front = dot(n, rd) < 0.0; int side = int(E2.w + 0.5); if(side == 2) front = !front;
    tt += hitT; o += rd * hitT;
    if(front || side == 1){ if(dot(n, rd) > 0.0) n = -n; oc = uOut == 0 ? vec4(o, tt) : vec4(n, 1.0); return; }
    o += rd * 2e-3; tt += 2e-3;   // a culled back face: the page draws what is behind it
  }
  oc = vec4(0.0, 0.0, 0.0, -1.0);
}`;
const FS_GATH = () => B.FSLIB + `
uniform sampler2D uG0, uG1, uPrev, giT0, giT1, giRoom;
uniform float uN, uNOff, uLampOn; uniform vec3 uSunC, uLampK, giB0, giBS, giN; uniform vec4 giRB; uniform vec2 giRY; uniform int uFrame;
float roomW(vec3 P){ vec2 uv = (P.xz - giRB.xy) * giRB.zw; if(uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || P.y < giRY.x || P.y > giRY.y) return 0.0; return texture(giRoom, uv).r; }
vec3 probeE(vec3 P, vec3 n){
  vec3 g = clamp((P - giB0) * giBS, vec3(0.0), giN - 1.0); float y0 = floor(g.y), f = g.y - y0, y1 = min(y0 + 1.0, giN.y - 1.0);
  vec2 s = vec2(g.x + 0.5, g.z + 0.5) / vec2(giN.x, giN.z * giN.y), u0 = s + vec2(0.0, y0 / giN.y), u1 = s + vec2(0.0, y1 / giN.y);
  vec4 A = mix(texture(giT0, u0), texture(giT0, u1), f); vec2 Bv = mix(texture(giT1, u0).rg, texture(giT1, u1).rg, f);
  float l = max(dot(A.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-6); return A.rgb * max(1.0 + dot(vec3(A.a, Bv), n) / l, 0.0); }
void main(){
  ivec2 fc = ivec2(gl_FragCoord.xy); vec4 G0 = texelFetch(uG0, fc, 0); if(G0.w < 0.0){ oc = vec4(0.0, 0.0, 0.0, -1.0); return; }
  vec3 n = texelFetch(uG1, fc, 0).xyz, prev = texelFetch(uPrev, fc, 0).rgb;
  st = hsh(uint(fc.x) * 9781u + uint(fc.y) * 6271u + uint(uFrame) * 26699u + 1u);
  vec3 o = G0.xyz + n * 2e-3, d = cosDir(n), L = vec3(0.0), T = vec3(1.0);
  for(int bn = 0; bn < 4; bn++){
    uint rid = hsh(st ^ (uint(bn + 1) * 0x68e31da4u));
    if(!isect(o, d, 1e6, false, rid)){ L += T * sky(d); break; }
    vec4 V0 = texelFetch(uTri, ix(3 * hitI), 0), E1 = texelFetch(uTri, ix(3 * hitI + 1), 0), E2 = texelFetch(uTri, ix(3 * hitI + 2), 0);
    vec3 n2 = normalize(cross(E1.xyz, E2.xyz)); bool front = dot(n2, d) < 0.0; int side = int(E2.w + 0.5); if(side == 2) front = !front;
    if(!front && side != 1) break;
    if(dot(n2, d) > 0.0) n2 = -n2;
    vec3 P = o + d * hitT, alb = texelFetch(uMat, ix(int(V0.w + 0.5)), 0).rgb, Po = P + n2 * 2e-3;
    float c = dot(n2, uSun); if(c > 0.0 && uSunC.g + uSunC.r > 1e-5 && !isect(Po, uSun, 1e6, true, hsh(rid + 77u))) L += T * alb * uSunC * c;
    if(uLampOn > 0.5 && uNL > 0){ int li = min(int(rnd() * float(uNL)), uNL - 1); vec4 LP = uLP[li], LC = uLC[li], LD = uLD[li];
      vec3 tl = LP.xyz - P; float dl = length(tl); vec3 wl = tl / max(dl, 1e-4); float cl = dot(n2, wl);
      float att = (LP.w > 0.0 && LC.w > 0.0) ? pow(clamp(1.0 - dl / LP.w, 0.0, 1.0), LC.w) : 1.0;
      if(LD.w > 0.5) att *= smoothstep(uLE[li].x, uLE[li].y, dot(-wl, LD.xyz));
      if(cl > 0.0 && att > 0.0 && !isect(Po, wl, dl - 4e-3, true, hsh(rid + 99u))) L += T * alb * LC.rgb * uLampK * (cl * att * float(uNL)); }
    if(roomW(P + n2 * 0.75) > 0.5){ L += T * alb * probeE(P + n2 * uNOff, n2) * 0.31830989; break; }
    T *= alb; if(bn >= 1){ float q = clamp(max(T.r, max(T.g, T.b)) * 1.2, 0.05, 1.0); if(rnd() > q) break; T /= q; }
    d = cosDir(n2); o = Po;
  }
  L = min(L, vec3(64.0));
  oc = vec4(mix(prev, L * 3.14159265, 1.0 / (uN + 1.0)), G0.w);
}`;

/* the lookup in every material (added to gi.js's hook): 4 texels of the cache, each kept only if it holds this very surface.
   Slot 0 is the older cache, slot 1 the current one, drawn over it. */
RT.PARS = `
uniform highp sampler2D giS0, giS1; uniform mat4 giSVP0, giSVP1; uniform vec3 giSC0, giSC1; uniform vec2 giSK; uniform vec2 giSR0, giSR1;
vec4 giScr( highp sampler2D S, mat4 VP, vec3 C, vec2 res, vec3 P ){
  vec4 c = VP * vec4( P, 1.0 ); if( c.w <= 0.0 ) return vec4( 0.0 ); vec2 uv = c.xy / c.w * 0.5 + 0.5; if( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return vec4( 0.0 );
  float d = distance( P, C ), tol = 0.06 + d * 0.012; vec2 p = uv * res - 0.5, f = fract( p ); ivec2 i0 = ivec2( floor( p ) ), mx = ivec2( res ) - 1; vec3 s = vec3( 0.0 ); float w = 0.0;
  for( int k = 0; k < 4; k ++ ){ ivec2 o = ivec2( k & 1, k >> 1 ); vec4 t = texelFetch( S, clamp( i0 + o, ivec2( 0 ), mx ), 0 );
    float b = ( o.x == 1 ? f.x : 1.0 - f.x ) * ( o.y == 1 ? f.y : 1.0 - f.y ) * ( 1.0 - smoothstep( tol, tol * 2.0, abs( t.a - d ) ) ) * step( 0.0, t.a ); s += t.rgb * b; w += b; }
  return w > 0.02 ? vec4( s / w, smoothstep( 0.02, 0.3, w ) ) : vec4( 0.0 ); }
`;
RT.MAIN = `
    if( giSK.x + giSK.y > 0.001 ){
      if( giSK.x > 0.001 ){ vec4 s = giScr( giS0, giSVP0, giSC0, giSR0, vR40W ); float k = s.a * giSK.x; giE = mix( giE, s.rgb * giGain, k ); giO = mix( giO, 1.0, k ); }
      if( giSK.y > 0.001 ){ vec4 s = giScr( giS1, giSVP1, giSC1, giSR1, vR40W ); float k = s.a * giSK.y; giE = mix( giE, s.rgb * giGain, k ); giO = mix( giO, 1.0, k ); }
    }
`;
const T3 = window.THREE;
RT.U = {giS0: {value: null}, giS1: {value: null}, giSVP0: {value: new T3.Matrix4()}, giSVP1: {value: new T3.Matrix4()}, giSC0: {value: new T3.Vector3()}, giSC1: {value: new T3.Vector3()}, giSK: {value: new T3.Vector2(0, 0)}, giSR0: {value: new T3.Vector2(1, 1)}, giSR1: {value: new T3.Vector2(1, 1)}};
{ const t = new T3.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, T3.RGBAFormat); t.needsUpdate = true; RT.U.giS0.value = RT.U.giS1.value = t; }

function mkRT(w, h, type){ return new THREE.WebGLRenderTarget(w, h, {type, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false}); }
function quadMat(fs, U){ return new THREE.RawShaderMaterial({glslVersion: THREE.GLSL3, uniforms: U, depthTest: false, depthWrite: false, vertexShader: VS, fragmentShader: fs}); }
RT.build = function(){ const t0 = performance.now(); B.extract(); B.build(); B.upload(); RT.builds++; RT.buildMs = Math.round(performance.now() - t0); RT.tris = B.geo.n; };
RT.init = function(){ H = GI.H; THREE = H.THREE; R = H.renderer;
  if(!R.capabilities.isWebGL2 || !R.extensions.get('EXT_color_buffer_float')){ RT.why = 'no float targets'; return false; }
  RT.build();
  const lampU = () => ({uLP: {value: Array.from({length: 40}, () => new THREE.Vector4())}, uLC: {value: Array.from({length: 40}, () => new THREE.Vector4())}, uLD: {value: Array.from({length: 40}, () => new THREE.Vector4())}, uLE: {value: Array.from({length: 40}, () => new THREE.Vector2())}, uNL: {value: 0}});
  const base = () => ({uTri: {value: B.tTri}, uNode: {value: B.tNode}, uMat: {value: B.tMat}, uSky: {value: null}, uNoGeo: {value: 0}});
  RT.uP = Object.assign(base(), {uIVP: {value: new THREE.Matrix4()}, uCam: {value: new THREE.Vector3()}, uRes: {value: new THREE.Vector2()}, uOut: {value: 0}});
  const g = GI.U;
  RT.uG = Object.assign(base(), lampU(), {uG0: {value: null}, uG1: {value: null}, uPrev: {value: null}, uN: {value: 0}, uNOff: g.giNOff, uLampOn: {value: 0}, uSunC: {value: new THREE.Vector3()}, uLampK: {value: new THREE.Vector3(1, 1, 1)}, uSun: {value: new THREE.Vector3(0, 1, 0)}, uFrame: {value: 0},
    giT0: g.giT0, giT1: g.giT1, giRoom: g.giRoom, giB0: g.giB0, giBS: g.giBS, giN: g.giN, giRB: g.giRB, giRY: g.giRY});
  RT.mP = quadMat(FS_PRIM(), RT.uP); RT.mG = quadMat(FS_GATH(), RT.uG);
  RT.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), RT.mP); RT.quad.frustumCulled = false; RT.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); RT.qs = new THREE.Scene(); RT.qs.add(RT.quad);
  RT.ready = true; RT.why = 'ok'; return true; };
function size(){ const s = R.getDrawingBufferSize(new THREE.Vector2()); return [Math.max(8, Math.round(s.x * RT.scale)), Math.max(8, Math.round(s.y * RT.scale))]; }
function alloc(){ const [w, h] = size(); if(RT.w === w && RT.h === h && RT.buf.length) return; RT.w = w; RT.h = h;
  for(const b of RT.buf){ b.a.dispose(); b.b.dispose(); } if(RT.g0){ RT.g0.dispose(); RT.g1.dispose(); }
  RT.g0 = mkRT(w, h, THREE.FloatType); RT.g1 = mkRT(w, h, THREE.HalfFloatType);
  RT.buf = [0, 1].map(() => ({a: mkRT(w, h, THREE.HalfFloatType), b: mkRT(w, h, THREE.HalfFloatType), n: 0, k: 0, VP: new THREE.Matrix4(), C: new THREE.Vector3(), key: '', light: '', stale: false}));
  RT.cur = 0; RT.gKey = ''; RT.U.giSK.value.set(0, 0); }
function draw(mat, target){ RT.quad.material = mat; R.setRenderTarget(target); R.render(RT.qs, RT.cam); }
function setLights(){ const L = B.lights(), U = RT.uG, n = Math.min(40, L.length); U.uNL.value = n; RT.nl = n;
  for(let i = 0; i < n; i++){ const l = L[i]; U.uLP.value[i].set(l.pos[0], l.pos[1], l.pos[2], l.dist); U.uLC.value[i].set(l.col[0], l.col[1], l.col[2], l.decay); U.uLD.value[i].set(...(l.dir || [0, -1, 0]), l.spot ? 1 : 0); U.uLE.value[i].set(...(l.cos || [0, 0])); } }
const camKey = c => { const e = c.matrixWorld.elements, p = c.projectionMatrix.elements; let s = ''; for(let i = 0; i < 16; i++) s += e[i].toFixed(5) + ','; return s + p[0].toFixed(5) + ',' + p[5].toFixed(5) + ',' + RT.w + 'x' + RT.h; };
let lastT = 0, dtS = 16;
/* once a frame, before the page draws (from GI.frame) */
RT.frame = function(){
  if(!RT.ready){ if(RT.why === 'waiting' && GI.ready && GI.on && GI.n > 20 && (window.__perfTrees || /perf-lazytrees-off|perf-off/.test(location.href))){ RT.why = 'building'; try{ RT.init(); }catch(e){ RT.why = 'init: ' + (e && e.message || e); console.warn('[gi-rt]', e); } } return; }
  const now = performance.now(), dt = Math.min(250, now - (lastT || now)); lastT = now; dtS += (dt - dtS) * .1; alloc();
  const cam = H.camera, U = RT.U, on = GI.on && GI.k > .99 && !RT.off && (H.mode === 'tour' || H.mode === 'walk' || RT.anyMode);
  const key = camKey(cam), light = GI.last || '';
  if(key === RT.key) RT.still++; else { RT.still = 0; RT.key = key; }
  let c = RT.buf[RT.cur], o = RT.buf[1 - RT.cur];
  for(const b of RT.buf) if((b.n > 0 || b.k > 0) && (b.light !== light || !on)) b.stale = true;
  // a cache traced under another light fades out, then is cleared
  for(const b of RT.buf) if(b.stale){ b.k = Math.max(0, b.k - dt / 350); if(b.k <= 0){ b.n = 0; b.stale = false; b.key = ''; } }
  if(on && RT.still >= 3 && light === RT.lightPrev){
    if(c.key !== key && !c.stale){
      // a new rest pose: the shown cache (if it is worth keeping) becomes the old one, the other slot starts
      if(c.n >= RT.min && c.k > 0){ o.k = 0; o.n = 0; RT.cur = 1 - RT.cur; const t = c; c = o; o = t; }
      c.n = 0; c.k = 0; c.key = key; c.light = light; cam.updateMatrixWorld(); c.VP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); c.C.setFromMatrixPosition(cam.matrixWorld);
      const prevRT = R.getRenderTarget(), ac = R.autoClear; R.autoClear = false;
      try{ RT.uP.uIVP.value.copy(c.VP).invert(); RT.uP.uCam.value.copy(c.C); RT.uP.uRes.value.set(RT.w, RT.h); RT.uP.uTri.value = B.tTri; RT.uP.uNode.value = B.tNode;
        RT.uP.uOut.value = 0; draw(RT.mP, RT.g0); RT.uP.uOut.value = 1; draw(RT.mP, RT.g1); }
      finally{ R.setRenderTarget(prevRT); R.autoClear = ac; }
      RT.gKey = key; }
    if(c.key === key && RT.gKey === key && !c.stale && c.n < RT.max){
      const G = RT.uG, S = GI.S || {}, sun = S.sun || [0, 0, 0], gn = GI.gainNow, env = H.ENV_RT, src = env && env.giSrc;
      if(src && RT.skySrc !== src){ RT.skySrc = src; if(RT.tSky) RT.tSky.dispose(); RT.tSky = B.skyFrom(src); }
      if(RT.lightsKey !== light){ RT.lightsKey = light; setLights(); }
      G.uSky.value = RT.tSky; G.uTri.value = B.tTri; G.uNode.value = B.tNode; G.uMat.value = B.tMat; G.uG0.value = RT.g0.texture; G.uG1.value = RT.g1.texture; G.uSun.value.copy(H.SUN_DIR).normalize();
      G.uSunC.value.set(sun[0], sun[1], sun[2]); if(!(H.SUN_DIR.y > 0)) G.uSunC.value.set(0, 0, 0); G.uLampOn.value = RT.nl > 0 ? 1 : 0; G.uLampK.value.set(1 / gn[0], 1 / gn[1], 1 / gn[2]);
      // samples this frame: as many as the frame time allows
      if(dtS < 19 && RT.spf < RT.spfMax) RT.spf += .25; else if(dtS > 26 && RT.spf > 1) RT.spf -= .5; const ns = RT.fixed || Math.max(1, Math.floor(RT.spf));
      const prevRT = R.getRenderTarget(), ac = R.autoClear; R.autoClear = false;
      try{ for(let i = 0; i < ns && c.n < RT.max; i++){ G.uPrev.value = c.a.texture; G.uN.value = c.n; G.uFrame.value = (RT.traced++ % 1000003) + 1; draw(RT.mG, c.b); const t = c.a; c.a = c.b; c.b = t; c.n++; } }
      finally{ R.setRenderTarget(prevRT); R.autoClear = ac; } }
    // fade the new cache in over the old one, then let the old one go
    if(c.n >= RT.min && !c.stale && c.k < 1){ c.k = Math.min(1, c.k + dt / 600); if(c.k >= 1 && o.k > 0){ o.k = 0; o.n = 0; o.key = ''; } }
  }
  RT.lightPrev = light;
  const bo = RT.buf[1 - RT.cur], bc = RT.buf[RT.cur], sm = x => x * x * (3 - 2 * x);
  U.giS0.value = bo.a.texture; U.giS1.value = bc.a.texture; U.giSVP0.value.copy(bo.VP); U.giSVP1.value.copy(bc.VP); U.giSC0.value.copy(bo.C); U.giSC1.value.copy(bc.C); U.giSR0.value.set(RT.w, RT.h); U.giSR1.value.set(RT.w, RT.h);
  U.giSK.value.set(bo.n > 0 ? sm(bo.k) : 0, bc.n > 0 ? sm(bc.k) : 0); };
RT.status = () => ({ready: RT.ready, why: RT.why, tris: RT.tris, buildMs: RT.buildMs, w: RT.w, h: RT.h, still: RT.still, cur: RT.cur, spf: RT.spf, dt: +dtS.toFixed(1), nl: RT.nl, buf: RT.buf.map(b => ({n: b.n, k: +b.k.toFixed(2), stale: b.stale}))});
})();
