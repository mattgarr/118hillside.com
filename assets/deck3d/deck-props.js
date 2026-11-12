/* Deck the House with Snowball (3D): the decorations.
   Everything here is built from three.js primitives inside the walkable model of 118 Hillside Drive (feet, y up).
   window.DECKPROPS(H) returns {apply(state, ctx), setOn, lightUp, tick, ...}; assets/deck3d/deck.js drives it.
   The tour's "Holiday decor" control (assets/holiday/holiday.js) builds its Winter holidays dress from the same props:
   window.DECKPROPS(host, {porchLight: false}) plus the state keys the game never sets (tree 'classic', room2, ter2, oakFront, menorahLit).
   Lights are GPU points (one draw call per string) plus instanced bulbs, so a few thousand of them stay cheap on phones. */
(function(){
  'use strict';
  window.DECKPROPS = function(H, opt){
    opt = opt || {};
    const THREE = H.THREE, V3 = THREE.Vector3, noop = function(){};
    const root = new THREE.Group(); root.name = 'deck3d'; H.scene.add(root);
    const col = hex => new THREE.Color(hex).convertSRGBToLinear();
    const rng = seed => { let s = (Math.abs(seed | 0) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
    const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const Y = new V3(0, 1, 0);
    /* one warm light under the porch eave, on after dark, so the wreath, the toran and the little tree keep their color at night */
    const porch = new THREE.PointLight(col('#ffd7a6'), 0, 18, 1.6); porch.position.set(-5.7, 7.1, 6.6); porch.name = 'deck-porch-light'; if(opt.porchLight !== false) root.add(porch);   // the tour leaves it out: a light added to a running scene recompiles every lit material

    /* ---------- materials and shared geometry ---------- */
    const MATS = new Map();
    const std = (hex, o) => { const k = hex + JSON.stringify(o || {}); let m = MATS.get(k); if(!m){ m = new THREE.MeshStandardMaterial(Object.assign({color: col(hex), roughness: .85, metalness: 0}, o || {})); MATS.set(k, m); } return m; };
    const metal = (hex, rough) => std(hex, {metalness: .85, roughness: rough == null ? .32 : rough});
    const own = m => { m.userData.own = true; return m; };
    const glowMat = (hex, emHex, k) => own(new THREE.MeshStandardMaterial({color: col(hex), emissive: col(emHex), emissiveIntensity: 0, roughness: .7}));
    const G = {
      sph: new THREE.SphereGeometry(1, 12, 9), sphLo: new THREE.IcosahedronGeometry(1, 1), bulb: new THREE.SphereGeometry(1, 7, 5),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 12), cylLo: new THREE.CylinderGeometry(1, 1, 1, 7), box: new THREE.BoxGeometry(1, 1, 1),
      spike: new THREE.ConeGeometry(.5, 1, 6, 1).translate(0, .5, 0), spike4: new THREE.ConeGeometry(.5, 1, 4, 1).translate(0, .5, 0),
      leaf: new THREE.SphereGeometry(.5, 7, 5).scale(1, 1, .16).translate(0, .5, 0),
      flame: new THREE.LatheGeometry([[0, 0], [.36, .16], [.5, .36], [.4, .62], [.16, .86], [0, 1]].map(p => new THREE.Vector2(p[0], p[1])), 8),
      disc: new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)};
    const mesh = (geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if(sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); return m; };
    const basisQ = (X, Yv, Z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Yv, Z));
    const qY = dir => new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize());
    function inst(geo, mat, items){ const m = new THREE.InstancedMesh(geo, mat, items.length), M = new THREE.Matrix4(), P = new V3(), Q = new THREE.Quaternion(), S = new V3(), I = new THREE.Quaternion();
      items.forEach((it, i) => { if(it.p.isVector3) P.copy(it.p); else P.set(it.p[0], it.p[1], it.p[2]); if(typeof it.s === 'number') S.set(it.s, it.s, it.s); else if(it.s) S.set(it.s[0], it.s[1], it.s[2]); else S.set(1, 1, 1);
        M.compose(P, it.q || I, S); m.setMatrixAt(i, M); if(it.c != null) m.setColorAt(i, it.c.isColor ? it.c : col(it.c)); });
      m.instanceMatrix.needsUpdate = true; if(m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; return m; }
    function canvasTex(w, h, draw, o){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; if(o && o.repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); } return t; }
    const TEX = {}; const tex = (k, f) => TEX[k] || (TEX[k] = f());

    /* ---------- lights: glow points with twinkle / chase / fade in the vertex shader ---------- */
    const U = {time: {value: 0}, scale: {value: 600}, halo: {value: 1}};
    const VS = `attribute vec3 aColor; attribute float aSize; attribute float aPhase; attribute float aSeq;
      uniform float uTime, uOn, uMode, uScale; varying vec3 vC; varying float vB;
      void main(){ float b = 1.0;
        if(uMode > 3.5){ b = .8 + .2 * sin(uTime * 11. + aPhase * 50.) * sin(uTime * 7.3 + aPhase * 20.); }
        else if(uMode > 2.5){ b = .3 + .7 * (.5 + .5 * sin(uTime * 1.15)); }
        else if(uMode > 1.5){ float p = fract(aSeq / 7. - uTime * .55); b = .12 + .88 * smoothstep(.55, 1., p); }
        else if(uMode > .5){ float t = uTime * (.8 + aPhase * 1.2) + aPhase * 40.; b = clamp(.62 + .5 * sin(t * 2.1) * sin(t * 1.27 + aPhase * 6.), .1, 1.); }
        vB = b * uOn; vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mv; gl_PointSize = min(180., aSize * uScale * (.6 + .4 * b) / max(.2, -mv.z)); }`;
    const FS = `uniform float uHalo; varying vec3 vC; varying float vB;
      void main(){ float d = length(gl_PointCoord - .5) * 2.; if(d > 1.) discard; float core = smoothstep(.34, .0, d), halo = pow(1. - d, 2.4);
        vec3 c = vC * (halo * .5 * uHalo + core * 1.25) + vec3(core * core * .55); gl_FragColor = vec4(c * vB, 0.); }`;
    const SETS = new Set();
    const scaleHook = function(r, s, cam){ const rt = r.getRenderTarget(), h = rt ? rt.height : r.domElement.height; U.scale.value = h * .5 * cam.projectionMatrix.elements[5]; };
    let ON = 1;
    /* pts: [{p: Vector3, c: '#hex', s: glow diameter (ft), q: distance along the string, r: bulb radius, dark: true for a bulb with no glow}] */
    function lightSet(g, pts, o){ o = o || {}; const n = pts.length, pos = new Float32Array(n * 3), cl = new Float32Array(n * 3), sz = new Float32Array(n), ph = new Float32Array(n), sq = new Float32Array(n), R = rng(o.seed || 3), C = {};
      pts.forEach((p, i) => { pos[i * 3] = p.p.x; pos[i * 3 + 1] = p.p.y; pos[i * 3 + 2] = p.p.z; const c = C[p.c] || (C[p.c] = col(p.c)); cl[i * 3] = c.r; cl[i * 3 + 1] = c.g; cl[i * 3 + 2] = c.b; sz[i] = p.dark ? 0 : (p.s || 1); ph[i] = R(); sq[i] = p.q == null ? i : p.q; });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aColor', new THREE.BufferAttribute(cl, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); geo.setAttribute('aSeq', new THREE.BufferAttribute(sq, 1));
      const mat = new THREE.ShaderMaterial({uniforms: {uTime: U.time, uScale: U.scale, uHalo: U.halo, uOn: {value: ON}, uMode: {value: reduce ? 0 : (o.mode || 0)}}, vertexShader: VS, fragmentShader: FS, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false, transparent: true});
      const P = new THREE.Points(geo, mat); P.frustumCulled = false; P.renderOrder = 8; P.onBeforeRender = scaleHook; P.userData.own = true; mat.userData.own = true; g.add(P);
      const set = {points: P, mat, seq: o.seq == null ? 3 : o.seq, glows: [], flames: null, body: null, center: pts.length ? pts[Math.floor(n / 2)].p.clone() : new V3()};
      if(o.body){ const bm = own(new THREE.MeshBasicMaterial({color: 0xffffff})); set.body = inst(o.bodyGeo || G.bulb, bm, pts.map(p => ({p: p.p, s: o.bodyScale ? [p.r * o.bodyScale[0], p.r * o.bodyScale[1], p.r * o.bodyScale[2]] : (p.r || .05), c: p.c}))); set.body.userData.own = true; g.add(set.body); }
      g.userData.sets.push(set); SETS.add(set); applyOn(set, ON); return set; }
    function applyOn(set, v){ set.on = v; set.mat.uniforms.uOn.value = v; if(set.body) set.body.material.color.setScalar(.22 + .78 * v); set.glows.forEach(q => { q.m.emissiveIntensity = q.k * v; }); if(set.flames) set.flames.visible = v > .4; }
    /* candle flames: a small bright teardrop that flickers, plus its glow */
    const flameMat = new THREE.MeshBasicMaterial({color: new THREE.Color(1.9, 1.15, .42)});
    function flames(g, at, o){ o = o || {}; const items = at.map(a => ({p: a.p, s: [(a.s || 1) * .075, (a.s || 1) * .2, (a.s || 1) * .075]})), im = inst(G.flame, flameMat, items); im.userData.own = true; g.add(im);
      const set = lightSet(g, at.map(a => ({p: a.p.clone().add(new V3(0, (a.s || 1) * .09, 0)), c: o.c || '#ffb45a', s: (a.s || 1) * (o.glow || 1.15)})), {mode: 4, seq: o.seq, seed: o.seed || 9});
      set.flames = im; im.visible = ON > .4; im.userData.at = items; im.userData.ph = at.map((a, i) => i * 1.7 + (o.seed || 0)); FLICK.add(im); return set; }
    const FLICK = new Set(), _M = new THREE.Matrix4(), _P = new V3(), _S = new V3(), _Q = new THREE.Quaternion();
    function flick(t){ if(reduce) return; FLICK.forEach(im => { if(!im.visible) return; const A = im.userData.at, ph = im.userData.ph; for(let i = 0; i < A.length; i++){ const it = A[i], k = 1 + .16 * Math.sin(t * 9 + ph[i]) * Math.sin(t * 5.3 + ph[i] * 2.1), sw = .012 * Math.sin(t * 6.1 + ph[i]);
        _P.set(it.p.x + sw, it.p.y, it.p.z); _S.set(it.s[0], it.s[1] * k, it.s[2]); _M.compose(_P, _Q, _S); im.setMatrixAt(i, _M); } im.instanceMatrix.needsUpdate = true; }); }

    /* ---------- little helpers ---------- */
    function along(pts, step, start){ const out = []; let carry = start || 0, dist = 0; for(let i = 0; i < pts.length - 1; i++){ const a = pts[i], b = pts[i + 1], L = a.distanceTo(b); let t = carry; while(t <= L){ out.push({p: a.clone().lerp(b, t / L), q: dist + t, dir: b.clone().sub(a).normalize()}); t += step; } carry = t - L; dist += L; } return out; }
    function swag(a, b, sag, n){ const out = []; for(let i = 0; i <= n; i++){ const t = i / n, p = a.clone().lerp(b, t); p.y -= sag * 4 * t * (1 - t); out.push(p); } return out; }
    function wire(g, pts, hex, closed){ const geo = new THREE.BufferGeometry().setFromPoints(pts), l = new (closed ? THREE.LineLoop : THREE.Line)(geo, wireMat(hex)); l.userData.own = true; l.frustumCulled = false; g.add(l); return l; }
    const WM = {}; const wireMat = hex => WM[hex] || (WM[hex] = new THREE.LineBasicMaterial({color: col(hex || '#1c2a20')}));
    const rc = new THREE.Raycaster();
    const shown = o => { for(let p = o; p; p = p.parent) if(!p.visible) return false; return true; };
    const solid = h => h.object.isMesh && shown(h.object) && !(h.object.parent && /^tree/.test(h.object.parent.name)) && !/leaf|^find-|^esc-/.test(h.object.name) && !(h.object.material && h.object.material.transparent && h.object.material.opacity < .5);
    function down(x, z, y0, far){ rc.set(new V3(x, y0 == null ? 30 : y0, z), new V3(0, -1, 0)); rc.far = far || 60; let hs = []; try{ hs = rc.intersectObjects(H.scene.children, true); }catch(e){} for(const h of hs) if(solid(h)) return h; return null; }
    const FY = new Map(); let REC = null;   // ground heights worked out ahead of time by prewarm(); empty in the game, where every height is a fresh ray
    const floorY = (x, z, y0, dflt) => { const k = x.toFixed(2) + ',' + z.toFixed(2) + ',' + (y0 == null ? '' : y0); if(FY.has(k)){ const v = FY.get(k); return v == null ? dflt : v; } if(REC){ REC.push([x, z, y0, k]); return dflt; } const h = down(x, z, y0); return h ? h.point.y : dflt; };
    const blobTex = () => tex('blob', () => canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(.6, 'rgba(0,0,0,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }));
    function blob(g, x, y, z, r, op){ const m = new THREE.Mesh(G.disc, std('#000000', {map: blobTex(), transparent: true, opacity: op || .8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2})); m.position.set(x, y + .012, z); m.scale.set(r, 1, r); m.renderOrder = 2; g.add(m); return m; }
    const grp = name => { const g = new THREE.Group(); g.name = 'deck-' + name; g.userData.sets = []; return g; };
    const W2 = (mx, my) => [my, mx];   // model meta (x, y) -> world (x, z)
    function opening(id){ const o = H.BIM2S && H.BIM2S.meta.openings.find(q => q.id === id); if(!o) return null; const [x, z] = W2(o.center[0], o.center[1]), n = W2(o.normal[0], o.normal[1]), ax = o.axis ? W2(o.axis[0], o.axis[1]) : [-n[1], n[0]];
      return {x, z, nx: n[0], nz: n[1], ax: ax[0], az: ax[1], w: o.width, sill: o.sill, head: o.head, th: o.thickness || .5}; }

    /* ---------- the roofline: strings that follow the real eaves and gables ---------- */
    const ROOF = [   // each: outward direction (x, z) and the roof edge it follows, read off the shingle mesh
      {n: [0, 1], p: [[3.2, 7.89, 38.19], [18.43, 14.13, 38.19], [33.69, 7.89, 38.19]]},        // great-room gable facing the street
      {n: [-1, 0], p: [[3.2, 7.89, 38.1], [3.2, 7.89, 6.9]]},                                    // long eave over the entry court
      {n: [0, 1], p: [[3.1, 8.13, 6.32], [-10.1, 8.13, 6.32]]},                                  // eave over the front doors
      {n: [1, 0], p: [[-10.17, 6.04, 6.5], [-10.17, 6.04, 23.74]]},                              // garage eave beside the steps
      {n: [0, 1], p: [[-10.17, 6.04, 23.74], [-17.99, 10.57, 23.74], [-26.67, 5.52, 23.74]]},    // garage gable
      {n: [-1, 0], p: [[-26.67, 5.52, 23.74], [-26.67, 5.52, -1.19]]},
      {n: [0, 1], p: [[-26.27, 13.37, -1.14], [-17.86, 18.27, -1.14], [-9.4, 13.37, -1.14]]},    // upper gable
      {n: [1, 0], p: [[-9.4, 13.37, -1.14], [-9.4, 13.37, -13.2]]},
      {n: [1, 0], p: [[-7.42, 13.75, -13.7], [-7.42, 13.75, -37.53]]},                           // upper eave over the terrace
      {n: [0, -1], p: [[-9.4, 13.37, -41.36], [-17.85, 18.28, -41.36], [-26.27, 13.37, -41.36]]},
      {n: [1, 0], p: [[33.69, 7.89, 38.19], [33.69, 7.89, 3.62]]},
      {n: [0, -1], p: [[3.79, 8.13, -10.93], [-10.1, 8.13, -10.93]]},                            // living-room eave at the back
      {n: [1, 0], p: [[-9.2, 8.37, -39.1], [-9.2, 5.38, -51.08]]},
      {n: [0, -1], p: [[-9.2, 5.38, -51.08], [-26.16, 5.38, -51.08]]}];
    const PAL = {warm: ['#ffd49a'], multi: ['#ff4136', '#2fd158', '#3a82ff', '#ffc928', '#ff8a1e'], icicle: ['#d9efff', '#f4fbff'], hanukkah: ['#3f7dff', '#f4f8ff'], kwanzaa: ['#f0322e', '#141414', '#27b24f'], marigold: ['#ffa21c', '#ffc23f'], fairy: ['#ffe0b0']};
    const MODES = {steady: 0, twinkle: 1, chase: 2, breathe: 3};
    function buildRoof(S){ if(S.lights === 'none' || !PAL[S.lights]) return null; const g = grp('roof'), pal = PAL[S.lights], kind = S.lights, mini = kind === 'fairy' || kind === 'marigold', ice = kind === 'icicle', R = rng(5);
      const pts = [], wires = []; let q0 = 0, k = 0;
      ROOF.forEach(e => { const lvl = e.p.every(p => Math.abs(p[1] - e.p[0][1]) < .02), out = lvl ? .54 : .34, dn = lvl ? .12 : .24;   // level eaves carry a gutter (.42 deep, .36 tall): clip the string to its front lip, not inside it
        const line = e.p.map(p => new V3(p[0] + e.n[0] * out, p[1] - dn, p[2] + e.n[1] * out)); wires.push(line);
        along(line, ice ? .62 : mini ? .4 : 1.02, .3).forEach(s => { const sag = mini ? Math.sin(s.q * 2.4) * .05 : 0;
          if(ice){ const n = 2 + Math.floor(R() * 5); for(let j = 0; j < n; j++) pts.push({p: new V3(s.p.x, s.p.y - .05 - j * .24, s.p.z), c: pal[(k + j) % pal.length], s: .5, q: q0 + s.q + j * .8, r: .028}); k++; }
          else pts.push({p: new V3(s.p.x, s.p.y - (mini ? .02 : .1) + sag, s.p.z), c: pal[k++ % pal.length], s: mini ? .7 : 1.5, q: q0 + s.q, r: mini ? .036 : .09, dark: pal[(k - 1) % pal.length] === '#141414'}); });
        q0 += 40; });
      wires.forEach(w => wire(g, w, '#22302a'));
      lightSet(g, pts, {mode: MODES[S.motion] == null ? 1 : MODES[S.motion], seq: 0, body: true, bodyScale: mini || ice ? [1, 1, 1] : [1, 1.55, 1], seed: 7});
      return g; }

    /* ---------- wreaths and the toran, on the iron-and-glass front doors ---------- */
    function bow(g, hex, x, y, z, s){ const m = std(hex, {roughness: .55}); [-1, 1].forEach(d => { const l = mesh(new THREE.TorusGeometry(.17 * s, .055 * s, 6, 14), m, x + d * .19 * s, y + .02 * s, z); l.scale.set(1.15, .72, .6); l.rotation.z = d * .35; g.add(l);
        const t = mesh(G.box, m, x + d * .11 * s, y - .27 * s, z, .1 * s, .42 * s, .02 * s); t.rotation.z = d * .28; g.add(t); }); g.add(mesh(G.sph, m, x, y, z + .02 * s, .075 * s)); }
    function ringItems(n, R0, tube, R, f){ const out = []; for(let i = 0; i < n; i++){ const a = R() * 6.283, b = R() * 6.283, rr = R0 + Math.cos(b) * tube; out.push(f(new V3(Math.cos(a) * rr, Math.sin(a) * rr, Math.sin(b) * tube * .8 + tube * .4), a, b, i)); } return out; }
    function buildDoor(S, ctx){ const d = opening('D-LG-02'); if(S.door === 'none' || !d) return null; const g = grp('door'), R = rng(21), z = d.z + d.th / 2 + .1, kind = S.door;
      if(kind === 'toran'){ const y = d.head - .12, x0 = d.x - d.w / 2 + .25, x1 = d.x + d.w / 2 - .25, items = [], leaves = [], n = 5, cols = ['#ff9d12', '#ffc21f', '#ff7f0a'];
        for(let s = 0; s < n; s++){ const a = new V3(lerp(x0, x1, s / n), y, z), b = new V3(lerp(x0, x1, (s + 1) / n), y, z); along(swag(a, b, .28, 10), .2, .1).forEach((q, i) => items.push({p: q.p, s: .105 + R() * .02, c: cols[(i + s) % 3]}));
          for(let e = 0; e <= (s === n - 1 ? 1 : 0); e++){ const hx = e ? b.x : a.x, len = (s + e) % 2 ? 3 : 5; for(let j = 0; j < len; j++) items.push({p: new V3(hx, y - .14 - j * .19, z), s: .1, c: cols[(j + s) % 3]});
            leaves.push({p: new V3(hx, y - .12 - len * .19, z), q: new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), Math.PI), s: [.2, .42, .2], c: '#2f7d3a'}); } }
        g.add(inst(G.sphLo, std('#ffffff', {roughness: .9}), items)); g.add(inst(G.leaf, std('#ffffff', {roughness: .6}), leaves));
        lightSet(g, along([new V3(x0, y + .08, z), new V3(x1, y + .08, z)], .5, .2).map(q => ({p: q.p, c: '#ffb648', s: .7})), {mode: 1, seq: 1});
        return g; }
      const cx = d.x, cy = 5.25, R0 = .74, tube = .2, w = new THREE.Group(); w.position.set(cx, cy, z + .1); g.add(w); w.userData.sets = g.userData.sets;   // its lights register with the door group's sets
      const ring = mesh(new THREE.TorusGeometry(R0, tube * .7, 8, 28), std(kind === 'harvest' ? '#8a6a34' : kind === 'bluesilver' ? '#2b3a55' : '#1d3a25')); w.add(ring);
      /* the wreath hangs on the door leaf, so it swings with it: each frame it takes the leaf's pose relative to the closed door */
      { const rest = {p: w.position.clone(), q: w.quaternion.clone()}, st = {piv: null, m0: null, tried: 0}, A = new THREE.Matrix4(), B = new THREE.Matrix4(), sc = new V3();
        let seen = false; const tick = () => { if(!g.parent){ if(seen) return; } else seen = true; requestAnimationFrame(tick); if(!g.parent) return; try{
          if(!st.piv){ if(st.tried++ % 30) return; const it = window.DOOR28 && DOOR28.items && DOOR28.items.find(i => i.id === 'D-LG-02'), pt = it && it.parts && it.parts[0]; if(!pt || !pt.piv || !pt.quat0) return;
            const piv = pt.piv, q = piv.quaternion.clone(); piv.quaternion.copy(pt.quat0); piv.updateWorldMatrix(true, true); g.updateWorldMatrix(true, false);
            const wRest = new THREE.Matrix4().compose(rest.p, rest.q, new V3(1, 1, 1)).premultiply(g.matrixWorld);
            st.m0 = new THREE.Matrix4().copy(piv.matrixWorld).invert().multiply(wRest); piv.quaternion.copy(q); piv.updateMatrixWorld(true); st.piv = piv; }
          A.copy(st.piv.matrixWorld).multiply(st.m0); B.copy(g.matrixWorld).invert().multiply(A); B.decompose(w.position, w.quaternion, sc);
        }catch(e){} }; requestAnimationFrame(tick); }
      const tang = (a, out, lift) => new V3(-Math.sin(a) + Math.cos(a) * out, Math.cos(a) + Math.sin(a) * out, lift).normalize();
      if(kind === 'evergreen' || kind === 'citrus'){ const greens = ['#1f4d2e', '#2a6138', '#24573a', '#356d3f'];
        w.add(inst(G.spike, std('#ffffff', {roughness: .9}), ringItems(520, R0, tube, R, (p, a, b) => ({p, q: qY(tang(a, (R() - .35) * 1.3, .25 + R() * .9)), s: [.07, .26 + R() * .2, .05], c: greens[Math.floor(R() * 4)]}))));
        if(kind === 'evergreen'){ w.add(inst(G.sph, std('#b3141f', {roughness: .35}), ringItems(26, R0, tube * .8, R, p => ({p: p.setZ(tube + .03), s: .04 + R() * .015})))); bow(w, '#b3141f', 0, -R0, tube + .1, 1.25); }
        else { const sl = [], st = []; for(let i = 0; i < 9; i++){ const a = i / 9 * 6.283 + .3; sl.push({p: new V3(Math.cos(a) * R0, Math.sin(a) * R0, tube + .05), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + (R() - .5) * .5, 0, R() * 3)), s: [.16, .025, .16], c: i % 3 ? '#f08a1d' : '#e0611a'});
            st.push({p: new V3(Math.cos(a + .35) * R0, Math.sin(a + .35) * R0, tube + .06), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a + 1.2)), s: [.028, .34, .028], c: '#7a4a26'}); }
          w.add(inst(G.cyl, std('#ffffff', {roughness: .6}), sl)); w.add(inst(G.cylLo, std('#ffffff', {roughness: .8}), st)); bow(w, '#c9a36a', 0, -R0, tube + .1, 1.05); } }
      else if(kind === 'magnolia'){ const cs = ['#1f4a2a', '#255a31', '#6b4a2a', '#1c4226'];
        w.add(inst(G.leaf, std('#ffffff', {roughness: .28}), ringItems(150, R0, tube * .8, R, (p, a) => ({p, q: qY(tang(a, (R() - .4) * 1.5, .35 + R() * .6)), s: [.2, .42 + R() * .12, .2], c: cs[Math.floor(R() * 4)]})))); }
      else if(kind === 'eucalyptus'){ const cs = ['#8fa893', '#a3b8a4', '#7b9783', '#b7c8b6'];
        w.add(inst(G.leaf, std('#ffffff', {roughness: .7}), ringItems(260, R0, tube * .9, R, (p, a) => ({p, q: qY(tang(a, (R() - .4) * 1.4, .3 + R() * .8)), s: [.15, .17 + R() * .06, .15], c: cs[Math.floor(R() * 4)]}))));
        w.add(inst(G.sph, std('#e6e8ea', {roughness: .4}), ringItems(22, R0, tube * .7, R, p => ({p: p.setZ(tube + .02), s: .03})))); bow(w, '#f3f1ea', 0, -R0, tube + .1, 1.2); }
      else if(kind === 'bluesilver'){ const cs = ['#2f5fd0', '#c9d2de', '#1d3f9a', '#e8edf3', '#5d8cf0'];
        w.add(inst(G.sph, std('#ffffff', {metalness: .75, roughness: .22}), ringItems(90, R0, tube * .75, R, p => ({p, s: .075 + R() * .06, c: cs[Math.floor(R() * 5)]}))));
        const st = new THREE.Mesh(starGeo(.26, .11, .07), metal('#dfe6ee', .25)); st.position.set(0, R0 + .08, tube + .08); w.add(st); }
      else if(kind === 'harvest'){ const cs = ['#d9b25a', '#c99a3e', '#e3c477', '#b8862f'];
        w.add(inst(G.spike, std('#ffffff', {roughness: .8}), ringItems(380, R0, tube * .8, R, (p, a) => ({p, q: qY(tang(a, (R() - .2) * 1.2, .2 + R() * .7)), s: [.05, .34 + R() * .22, .04], c: cs[Math.floor(R() * 4)]}))));
        w.add(inst(G.sph, std('#a4161f', {roughness: .4}), ringItems(22, R0, tube * .7, R, p => ({p: p.setZ(tube + .03), s: .042}))));
        const corn = []; [-.5, 0, .5].forEach((o, i) => corn.push({p: new V3(o * .34, -R0 - .02 + Math.abs(o) * .12, tube + .1), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI + o * .9)), s: [.075, .36, .075], c: ['#e8b93c', '#b4502a', '#e3c056'][i]})); w.add(inst(G.sphLo, std('#ffffff', {roughness: .6}), corn)); bow(w, '#b9925a', 0, -R0 + .26, tube + .12, .8); }
      if(kind !== 'bluesilver'){ const lp = []; for(let i = 0; i < 26; i++){ const a = i / 26 * 6.283; lp.push({p: new V3(Math.cos(a) * (R0 + (i % 2 ? .08 : -.08)), Math.sin(a) * (R0 + (i % 2 ? .08 : -.08)), tube + .07), c: '#ffdca8', s: .34}); } lightSet(w, lp, {mode: 1, seq: 1}); }   // on the wreath itself, so they swing with the door
      else lightSet(w, [{p: new V3(0, R0 + .08, tube + .2), c: '#cfe2ff', s: 1.1}], {mode: 3, seq: 1});
      w.traverse(o => { if(o.isMesh && !o.isInstancedMesh) o.userData.own = true; });   // keep the ring and bow out of the bake, which would pin them to the doorway
      return g; }

    /* a five-point star with a ridge down each arm */
    function starGeo(Ro, Ri, d){ const v = [], ring = []; for(let i = 0; i < 10; i++){ const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? Ri : Ro; ring.push([Math.cos(a) * r, Math.sin(a) * r, 0]); }
      for(let i = 0; i < 10; i++){ const a = ring[i], b = ring[(i + 1) % 10]; v.push(0, 0, d, ...a, ...b, 0, 0, -d, ...b, ...a); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g; }

    /* ---------- hanging from the porch eave: paper stars, red lanterns, Moravian stars ---------- */
    function buildHang(S){ if(S.hang === 'none') return null; const g = grp('hang'), kind = S.hang, y0 = 7.72, z = 6.0, xs = [-9.0, -7.3, -4.1, -2.4, -.7], drop = [1.3, .85, .85, 1.3, .95], pts = [];
      const cord = std('#2a2a2a'), set0 = {glows: []};
      xs.forEach((x, i) => { const y = y0 - drop[i]; g.add(mesh(G.cylLo, cord, x, (y0 + y) / 2 + .2, z, .008, y0 - y - .2, .008)); let m, c;
        if(kind === 'star'){ m = glowMat(i % 2 ? '#ff8f1f' : '#ffb028', i % 2 ? '#ff7a12' : '#ffa21c'); const s = new THREE.Mesh(tex('starG', () => starGeo(.56, .23, .2)), m); s.position.set(x, y, z); s.rotation.y = (i - 2) * .22; g.add(s); c = '#ffab3c';
          [-1, 0, 1].forEach(t => { const tl = mesh(G.box, std(i % 2 ? '#e8452c' : '#ffcf4a'), x + t * .1, y - .62, z, .035, .42, .008); tl.rotation.z = t * .12; g.add(tl); }); set0.glows.push({m, k: 1.5}); }
        else if(kind === 'red'){ m = glowMat('#d8231c', '#ff3a1c'); const b = mesh(G.sph, m, x, y, z, .36, .31, .36); g.add(b); c = '#ff5a34'; const gold = metal('#d9aa3f');
          g.add(mesh(G.cyl, gold, x, y + .31, z, .15, .06, .15)); g.add(mesh(G.cyl, gold, x, y - .31, z, .15, .06, .15)); g.add(mesh(G.cylLo, std('#c9242a'), x, y - .56, z, .03, .44, .03)); g.add(mesh(G.sph, gold, x, y - .35, z, .04));
          for(let r = 0; r < 6; r++){ const rib = mesh(new THREE.TorusGeometry(.362, .008, 4, 20), gold, x, y, z); rib.scale.y = .86; rib.rotation.y = r * Math.PI / 6; g.add(rib); } set0.glows.push({m, k: 1.1}); }
        else { m = glowMat('#f6f3ea', '#ffe6b8'); const core = new THREE.IcosahedronGeometry(1, 0), P = core.attributes.position, dirs = [], seen = {};
          for(let k = 0; k < P.count; k += 3){ const a = new V3().fromBufferAttribute(P, k), b = new V3().fromBufferAttribute(P, k + 1), cc = new V3().fromBufferAttribute(P, k + 2); dirs.push(a.clone().add(b).add(cc).normalize()); [a, b, cc].forEach(v => { const key = v.toArray().map(q => q.toFixed(2)).join(); if(!seen[key]){ seen[key] = 1; dirs.push(v.clone().normalize()); } }); }
          const sp = inst(G.spike4, m, dirs.map((dv, k) => ({p: dv.clone().multiplyScalar(.12), q: qY(dv), s: [.2, k % 4 ? .38 : .5, .2]}))); sp.position.set(x, y, z); g.add(sp); g.add(mesh(G.sphLo, m, x, y, z, .17)); c = '#ffe9c4'; set0.glows.push({m, k: 1.25}); }
        pts.push({p: new V3(x, y, z + .05), c, s: kind === 'moravian' ? 1.9 : 2.3}); });
      const set = lightSet(g, pts, {mode: 3, seq: 1, seed: 4}); set.mat.uniforms.uMode.value = 0; set.glows = set0.glows; applyOn(set, ON); return g; }

    /* ---------- lighting the way in: diyas, luminarias, rail garland, rangoli ---------- */
    const diyaGeo = () => tex('diya', () => new THREE.LatheGeometry([[0, 0], [.07, 0], [.13, .035], [.145, .075], [.125, .08], [.06, .03], [0, .03]].map(p => new THREE.Vector2(p[0], p[1])), 12));
    function diyas(g, at, seq){ g.add(inst(diyaGeo(), std('#b5562c', {roughness: .8}), at.map((p, i) => ({p, q: new THREE.Quaternion().setFromAxisAngle(Y, i * 1.3)})))); return flames(g, at.map(p => ({p: new V3(p.x + .06, p.y + .06, p.z), s: .8})), {seq, glow: 1.3}); }
    const bagTex = () => tex('bag', () => canvasTex(64, 96, (x, w, h) => { const g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(.45, '#c9c9c9'); g.addColorStop(1, '#6a6a6a'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(255,255,255,.9)';
      const star = (cx, cy, r) => { x.beginPath(); for(let i = 0; i < 10; i++){ const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .45 : r; x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } x.fill(); }; star(32, 52, 11); star(14, 30, 4); star(50, 28, 4); star(18, 74, 3.5); star(48, 76, 3.5); }));
    const bagGeo = () => tex('bagG', () => { const g = new THREE.BoxGeometry(.52, .8, .36, 1, 1, 1).translate(0, .4, 0), idx = Array.from(g.index.array); idx.splice(12, 6); g.setIndex(idx); return g; });   // paper bag with the top open
    function luminarias(g, at, seq){ const m = own(new THREE.MeshStandardMaterial({color: col('#e9d6ae'), emissive: col('#ffa23a'), emissiveMap: bagTex(), emissiveIntensity: 0, roughness: .9, side: THREE.DoubleSide}));
      g.add(inst(bagGeo(), m, at.map((p, i) => ({p, q: new THREE.Quaternion().setFromAxisAngle(Y, (i * 2.4) % 1 - .5)}))));
      const set = lightSet(g, at.map(p => ({p: new V3(p.x, p.y + .34, p.z), c: '#ffae52', s: 1.9})), {mode: 4, seq, seed: 31}); set.glows.push({m, k: 1.7}); applyOn(set, ON); return set; }
    const rangoliTex = () => tex('rangoli', () => canvasTex(512, 512, (x, w) => { const c = w / 2; x.translate(c, c); const ring = (n, r0, r1, wd, cols, rot) => { for(let i = 0; i < n; i++){ x.save(); x.rotate(i / n * Math.PI * 2 + (rot || 0)); x.beginPath(); x.moveTo(r0, 0); x.quadraticCurveTo((r0 + r1) / 2, wd, r1, 0); x.quadraticCurveTo((r0 + r1) / 2, -wd, r0, 0); x.fillStyle = cols[i % cols.length]; x.fill(); x.restore(); } };
      const disc = (r, f) => { x.beginPath(); x.arc(0, 0, r, 0, 7); x.fillStyle = f; x.fill(); };
      disc(246, '#f4ecd8'); disc(238, '#b3176b'); ring(16, 150, 236, 34, ['#ffb300', '#ff6f1a']); disc(164, '#1f8a70'); ring(12, 84, 160, 30, ['#ffffff', '#ffd23f'], .26); disc(96, '#e23a52'); ring(8, 26, 92, 26, ['#ffb300', '#ffffff'], .39); disc(30, '#3b2fa8'); disc(13, '#ffd23f');
      x.fillStyle = '#ffffff'; for(let i = 0; i < 32; i++){ const a = i / 32 * 6.283; x.beginPath(); x.arc(Math.cos(a) * 243, Math.sin(a) * 243, 4, 0, 7); x.fill(); }
      const id = x.getImageData(0, 0, w, w), R = rng(3); for(let i = 0; i < id.data.length; i += 4){ if(id.data[i + 3]){ const n = (R() - .5) * 26; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } } x.setTransform(1, 0, 0, 1, 0, 0); x.putImageData(id, 0, 0); }));
    function rangoli(g, x, y, z, r, seq){ const m = new THREE.Mesh(G.disc, std('#ffffff', {map: rangoliTex(), transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3})); m.position.set(x, y + .015, z); m.scale.set(r, 1, r); m.renderOrder = 3; g.add(m);
      const at = []; for(let i = 0; i < 6; i++){ const a = i / 6 * 6.283 + .4; at.push(new V3(x + Math.cos(a) * (r + .22), y + .01, z + Math.sin(a) * (r + .22))); } return diyas(g, at, seq); }
    function garland(g, pts, o){ o = o || {}; const R = rng(o.seed || 17), greens = ['#1f4d2e', '#2a6138', '#24573a', '#356d3f'], items = [], rad = o.r || .16;
      along(pts, .055, 0).forEach(s => { for(let k = 0; k < 2; k++){ const a = R() * 6.283, X = new V3().crossVectors(s.dir, Y); if(X.lengthSq() < .01) X.set(1, 0, 0); X.normalize(); const Z = new V3().crossVectors(s.dir, X).normalize();
          const out = X.clone().multiplyScalar(Math.cos(a)).addScaledVector(Z, Math.sin(a)); items.push({p: s.p.clone().addScaledVector(out, rad * .25), q: qY(out.clone().addScaledVector(s.dir, (R() - .5) * 1.6)), s: [.06, rad * (1.1 + R() * .9), .05], c: greens[Math.floor(R() * 4)]}); } });
      g.add(inst(G.spike, std('#ffffff', {roughness: .9}), items));
      return lightSet(g, along(pts, .34, .1).map((s, i) => ({p: new V3(s.p.x + Math.sin(i * 2.1) * rad * .8, s.p.y + Math.cos(i * 1.7) * rad * .7, s.p.z + Math.cos(i * 2.6) * rad * .8), c: o.c || '#ffdca8', s: .48})), {mode: 1, seq: o.seq == null ? 2 : o.seq, seed: o.seed}); }
    function buildPath(S){ const P = S.path || []; if(!P.length) return null; const g = grp('path');
      if(P.includes('diyas')){ const at = []; for(let z = 15.95; z < 20.2; z += .82){ [-9.45, -.6].forEach(x => { const h = down(x, z, 3, 9); if(h && h.point.y < .2) at.push(new V3(x, h.point.y + .005, z)); }); } [-9.45, -.6].forEach(x => at.push(new V3(x, .005, 15.1))); diyas(g, at, 1); }
      if(P.includes('luminarias')){ const at = []; for(let i = 0; i < 7; i++){ const z = 21.4 + i * 3.1; [-10.3, .5].forEach(x => { const lx = i > 3 ? (x < -5 ? [-3.1, -2.4, -2.1][i - 4] : x + (i - 3) * .9) : x; at.push(new V3(lx, floorY(lx, z, 2, -3.5) + .01, z)); }); }   /* r35: past the steps the left row follows the walk on the house side of the oak */
        for(let i = 0; i < 5; i++){ const t = (i + 1) / 5; [[-2.1 + t * 3.4, 43.2 + t * 14], [3.2 + t * 6.2, 43.2 + t * 14]].forEach(q => at.push(new V3(q[0], floorY(q[0], q[1], 2, -3.5) + .01, q[1]))); } luminarias(g, at, 2); }
      if(P.includes('garland')){ const a = new V3(3.75, 3.12, 15.56), b = new V3(.06, 3.12, 15.6), c = new V3(.06, .22, 19.82); garland(g, swag(a, b, .22, 12).concat(swag(b, c, .28, 14).slice(1)), {seq: 2}); bow(g, '#b3141f', .06, 3.05, 15.74, 1); bow(g, '#b3141f', 3.7, 3.05, 15.7, 1); }
      if(P.includes('rangoli')) rangoli(g, -5, floorY(-5, 23.4, 2, -3.5), 23.4, 2.3, 1);
      return g; }

    /* ---------- trees ----------
       r40 (owner 11/11: "the Christmas trees ... has a weird sort of solid cone shape in the middle. Let's make that a little bit more realistic").
       The old tree was a dark solid cone with 4,000 needle-textured spikes stuck in it. Now a fir is built the way one grows: a thin tapering
       trunk and leader, whorls of branches that get shorter toward the top, each branch drooping and turning up at the tip, carrying flat
       fronds of needle sprays (alpha-cut cards in a shallow V, painted on canvas). Everything green is ONE merged mesh and one material;
       trunk and branch wood is a second; ornaments hang from branch tips, the string of lights is draped along the branches, the topper
       sits on the leader. No per-frame work beyond the light shader everything else already uses. */
    function GB(){ this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; }
    GB.prototype.vert = function(p, n, u, v, c){ this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.u.push(u, v); this.c.push(c.r, c.g, c.b); return this.v++; };
    GB.prototype.add = function(geo, M, c){ const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv, I = geo.index, NM = new THREE.Matrix3().getNormalMatrix(M), v = new V3(), n = new V3(), o = this.v;
      for(let k = 0; k < P.count; k++){ v.fromBufferAttribute(P, k).applyMatrix4(M); n.fromBufferAttribute(N, k).applyMatrix3(NM).normalize(); this.vert(v, n, UV ? UV.getX(k) : 0, UV ? UV.getY(k) : 0, c); }
      if(I) for(let k = 0; k < I.count; k++) this.i.push(o + I.getX(k)); else for(let k = 0; k < P.count; k++) this.i.push(o + k); };
    GB.prototype.geo = function(){ const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1)); g.computeBoundingSphere(); return g; };
    /* one fir frond seen from above: a twig with two ranks of needles curving forward, a third rank lying over the twig, paler new growth
       at the tip; the flocked tree's copy is dusted white. 256 x 512, alpha-cut. */
    const sprayTex = flock => tex('spray' + (flock ? 'F' : ''), () => { const t = canvasTex(256, 512, (x, w, h) => { const R = rng(flock ? 44 : 43), cx = s => w / 2 + Math.sin(s * 2.6) * w * .035;
        x.lineCap = 'round'; x.strokeStyle = '#5b4a30'; for(let s = 0; s < 1; s += .02){ x.lineWidth = 7 - s * 4.5; x.beginPath(); x.moveTo(cx(s), h * (1 - s)); x.lineTo(cx(s + .02), h * (1 - s - .02)); x.stroke(); }
        const needle = (s, side, lenK, ang, lw, light) => { const px = cx(s), py = h * (1 - s), L = w * .43 * lenK * (s > .8 ? 1 - (s - .8) * 2.4 : 1) * (.86 + R() * .26), a = ang + (R() - .5) * .22, ex = px + side * Math.sin(a) * L, ey = py - Math.cos(a) * L, mx = px + side * Math.sin(a) * L * .5, my = py - Math.cos(a) * L * .5 + L * .07;
          const hue = 128 + R() * 22 - (s > .78 ? 18 : 0), sat = 38 + R() * 16, li = (s > .78 ? 30 : 16) + R() * 9 + light;
          x.lineWidth = lw; x.strokeStyle = `hsl(${hue},${sat}%,${li}%)`; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(mx, my, ex, ey); x.stroke();
          x.lineWidth = lw * .45; x.strokeStyle = `hsla(${hue - 6},${sat - 8}%,${li + 13}%,.55)`; x.beginPath(); x.moveTo(mx, my - lw * .2); x.lineTo(ex, ey); x.stroke(); };
        for(let s = .02; s < .985; s += .0105) [-1, 1].forEach(sd => needle(s, sd, 1, 1.0 + R() * .3, 5.2, 0));
        for(let s = .03; s < .97; s += .016) needle(s, R() > .5 ? 1 : -1, .55, .3 + R() * .35, 5, 4);
        if(flock){ for(let i = 0; i < 900; i++){ const s = R(), sd = R() > .5 ? 1 : -1, d = R() * .42 * w, px = cx(s) + sd * d * Math.sin(1.1), py = h * (1 - s) - d * .45, rr = 3 + R() * 7;
            const gr = x.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, 'rgba(250,252,255,.95)'); gr.addColorStop(.7, 'rgba(240,244,248,.8)'); gr.addColorStop(1, 'rgba(240,244,248,0)'); x.fillStyle = gr; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill(); } } });
      return t; });
    const firMat = flock => tex('firMat' + (flock ? 'F' : ''), () => { const m = new THREE.MeshStandardMaterial({color: 0xffffff, map: sprayTex(flock), vertexColors: true, alphaTest: .42, side: THREE.DoubleSide, roughness: flock ? .9 : .78, metalness: 0});
      m.onBeforeCompile = s => { s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', '')); };   // fronds are lit by their rounded normals from both sides
      m.customProgramCacheKey = () => 'deck-fir'; m.name = 'deck-fir'; return m; });
    const woodMat = () => std('#ffffff', {vertexColors: true, roughness: .92});
    const ORN = {classic: ['#b3141f', '#e0b33c', '#c9a24a', '#f1e3b4', '#8e1f2b', '#e0b33c'], fir: ['#c81e2b', '#e0b33c', '#1f5fbf', '#c9d0d8', '#1d8a4a', '#b8327a'], flocked: ['#d9b866', '#e9edf1', '#c9a24a', '#b8c4d0'], pencil: ['#e0b33c', '#c9a24a', '#f0d27a'], small: ['#c81e2b', '#e0b33c']};
    const TLITE = {classic: ['#ffe0b0'], fir: ['#ff4136', '#2fd158', '#3a82ff', '#ffc928', '#ff8a1e'], flocked: ['#ffe0b0'], pencil: ['#ffcf6a'], small: ['#ffe0b0']};
    const TINT = {classic: [.96, 1.0, .9], fir: [.86, .98, 1.06], pencil: [.98, 1.0, .9], flocked: [1, 1, 1]};   // Fraser deep green; the noble fir a little blue
    function conifer(g, o){ const R = rng(o.seed || 11), h = o.h, r = o.r, kind = o.kind, flock = kind === 'flocked', small = !!o.small, t3 = new THREE.Group(); t3.position.set(o.x, o.y, o.z); g.add(t3);
      const sc = clamp(r / 2.2, .5, 1), yb = o.pot ? .58 : .16, y0 = Math.max(yb + .25, h * .12), yTop = h - .42, tint = TINT[kind] || TINT.classic;
      const prof = t => Math.pow(1 - t, .92) * (1 + .06 * Math.sin(t * 9 + (o.seed || 11))), W = new GB(), F = new GB(), wc = new THREE.Color(), fc = new THREE.Color();
      const _n = new V3(), _r = new V3(), sh = (p, nc) => { _r.set(p.x, 0, p.z); const d = _r.length(); if(d > 1e-4) _r.divideScalar(d); return _n.copy(nc).multiplyScalar(.38).addScaledVector(_r, .62).addScaledVector(Y, .22).normalize(); };
      const shadeC = (p, base) => { const t = clamp((p.y - y0) / (h - y0), 0, 1), rad = Math.hypot(p.x, p.z) / (r * prof(Math.min(.98, t)) + .25), ao = lerp(.5, 1.06, clamp((rad - .12) / .8, 0, 1)) * lerp(.9, 1.06, t);
        return fc.setRGB(base[0] * ao, base[1] * ao, base[2] * ao); };
      /* a frond card in a shallow V: base, direction, length, width, fold (rad); S0 a side vector when the frond stands upright */
      const frond = (b, D, len, wid, k, S0) => { const S = S0 ? S0.clone() : new V3().crossVectors(D, Y); if(S.lengthSq() < 1e-6) S.set(1, 0, 0); S.normalize(); const Nc = new V3().crossVectors(S, D).normalize(), fold = .42 + R() * .2, roll = (R() - .5) * .5;
        const Sr = S.clone().multiplyScalar(Math.cos(roll)).addScaledVector(Nc, Math.sin(roll)), Nr = Nc.clone().multiplyScalar(Math.cos(roll)).addScaledVector(S, -Math.sin(roll));
        const L = Sr.clone().multiplyScalar(-Math.cos(fold)).addScaledVector(Nr, Math.sin(fold)), Rt = Sr.clone().multiplyScalar(Math.cos(fold)).addScaledVector(Nr, Math.sin(fold));
        const base = [tint[0] * k * (.9 + R() * .2), tint[1] * k * (.9 + R() * .2), tint[2] * k * (.9 + R() * .2)], tip = b.clone().addScaledVector(D, len).addScaledVector(Y, -len * .08), o0 = F.v;
        [[b, 0], [tip, 1]].forEach(([p, v], e) => { const hw = wid * (e ? .82 : 1) / 2; [[L, 0], [null, .5], [Rt, 1]].forEach(([side, u]) => { const q = side ? p.clone().addScaledVector(side, hw) : p.clone(); F.vert(q, sh(q, Nr), u, v, shadeC(q, base)); }); });
        F.i.push(o0, o0 + 1, o0 + 4, o0, o0 + 4, o0 + 3, o0 + 1, o0 + 2, o0 + 5, o0 + 1, o0 + 5, o0 + 4); };
      /* wood: a tapered n-gon tube through points */
      const tube = (pts, rads, n, hex) => { wc.copy(col(hex)); const o0 = W.v; for(let i = 0; i < pts.length; i++){ const D = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize(), S = new V3().crossVectors(D, Math.abs(D.y) > .95 ? new V3(1, 0, 0) : Y).normalize(), N2 = new V3().crossVectors(S, D);
          for(let j = 0; j <= n; j++){ const a = j / n * 6.283, d = S.clone().multiplyScalar(Math.cos(a)).addScaledVector(N2, Math.sin(a)); W.vert(pts[i].clone().addScaledVector(d, rads[i]), d, j / n, i, wc); } }
        for(let i = 0; i < pts.length - 1; i++) for(let j = 0; j < n; j++){ const a = o0 + i * (n + 1) + j, b = a + n + 1; W.i.push(a, a + 1, b + 1, a, b + 1, b); } };
      const tw = small ? .055 : .085;
      tube([new V3(0, o.pot ? .3 : 0, 0), new V3(.006, y0, -.004), new V3(-.01, (y0 + h) / 2, .006), new V3(0, h - .3, 0), new V3(0, h + .03, 0)], [tw, tw * .9, tw * .55, tw * .3, .012], 7, '#5a4330');
      /* whorls of branches; each branch: polyline bp(u), fronds along its axis, alternating side fronds, a paler upturned tip */
      const tiers = Math.max(8, Math.round((yTop - y0) / (small ? .27 : .31))), lights = [], tips = [];
      for(let i = 0; i < tiers; i++){ const t = i / (tiers - 1), y = y0 + (yTop - y0) * t + (i && i < tiers - 1 ? (R() - .5) * .08 : 0), rr = r * prof(t) + .12, nb = Math.max(4, Math.round((small ? 3.5 : 4.5) + rr * (kind === 'pencil' ? 4.2 : 3.6))), off = i * 2.39996 + R();
        for(let k = 0; k < nb; k++){ if(R() < .06 && t < .9) continue;   // a gap here and there, as a real tree has
          const a = off + k / nb * 6.283 + (R() - .5) * .38, Hd = new V3(Math.sin(a), 0, Math.cos(a)), L = rr * (.84 + R() * .3), e = lerp(-.1, .62, Math.pow(t, 1.2)) + (R() - .5) * .14, drop = L * lerp(.3, .06, t) * (.8 + R() * .4);
          const B = new V3(0, y, 0), bp = u => B.clone().addScaledVector(Hd, L * Math.cos(e) * u).addScaledVector(Y, L * Math.sin(e) * u - drop * u * u + (u > .82 ? L * .5 * (u - .82) * (u - .82) : 0)), bd = u => bp(Math.min(1, u + .04)).sub(bp(Math.max(0, u - .04))).normalize();
          tube([bp(0), bp(.45), bp(.85)], [tw * .32, tw * .2, .008], 4, '#4e3b2a');
          const fl = .44 * sc, fw = fl * .5, Sm = new V3().crossVectors(Hd, Y).normalize();
          const na = Math.max(1, Math.ceil(L * .78 / (fl * .72))); for(let j = 0; j < na; j++){ const u = .22 + j * .78 / na; frond(bp(u), bd(u), Math.min(fl, L * .78 / na * 1.35), fw, 1); }
          frond(bp(.93), bd(.93).addScaledVector(Y, .25).normalize(), fl * .7, fw * .9, 1.16);   // this year's growth at the tip
          let sd = R() > .5 ? 1 : -1; for(let u = .16; u < .9; u += (.15 * sc + .05) / Math.max(.4, L) * (.85 + R() * .3)){ sd = -sd; const ll = (.26 + .52 * (1 - u)) * Math.min(1, .4 + L * .35) * sc * 1.25, ang = .78 + (R() - .5) * .3;
            const D = bd(u).multiplyScalar(Math.cos(ang)).addScaledVector(Sm, sd * Math.sin(ang)).addScaledVector(Y, .1 + R() * .12).normalize(), b0 = bp(u);
            if(ll > fl * 1.1){ frond(b0, D, ll * .55, fw, .96); const D2 = D.clone().addScaledVector(Y, -.12).normalize(); frond(b0.clone().addScaledVector(D, ll * .5), D2, ll * .55, fw * .9, 1.04); } else frond(b0, D, ll, fw * .95, 1); }
          const nl = L * (small ? 1.5 : 1.6); for(let j = 0; j < nl; j++){ const u = .38 + .58 * ((j + R()) / Math.max(1, nl)); lights.push(bp(u).addScaledVector(Sm, (R() - .5) * .22 * sc).addScaledVector(Y, .055)); }
          if(t < .93) tips.push({p: bp(.9), t}); } }
      for(let k = 0; k < 4; k++){ const a = k * 1.571 + R() * .3, S0 = new V3(Math.cos(a), 0, Math.sin(a)); frond(new V3(0, yTop - .1, 0), new V3(Math.sin(a) * .18, 1, Math.cos(a) * .18).normalize(), .52 * sc + .1, .2 * sc, 1.12, S0); }   // the leader's own shoots
      const fm = new THREE.Mesh(F.geo(), firMat(flock)); fm.name = 'fir-fronds'; fm.userData.own = true; t3.add(fm);   // own: bake() leaves it whole (it would drop the vertex colours) and scrap() frees its geometry
      /* stand and skirt: a draped velvet skirt with a cream hem, one mesh; the window tree stands in its pot */
      if(o.pot){ t3.add(mesh(new THREE.CylinderGeometry(.42, .33, .62, 16), std(o.pot, {roughness: .6}), 0, .31, 0)); t3.add(mesh(G.cyl, std('#3a2a1e', {roughness: 1}), 0, .6, 0, .39, .02, .39)); }
      else { const SK = new GB(), NA = 56, rings = [[.05, .24, 0], [.11, .2, 0], [.3, .15, 0], [.6, .07, .4], [.85, .035, .8], [1, .03, 1], [1, .03, 1, 1], [1.07, .015, 1, 1]], red = col('#8e1f2b'), cream = col('#efe6d2'), Rs = r * .85;
        rings.forEach(([f, yy, fold, hem]) => { for(let j = 0; j <= NA; j++){ const a = j / NA * 6.283, w = Math.sin(a * 7 + 1.3) * .5 + Math.sin(a * 3 + .4) * .3, rad = Rs * f * (1 + .03 * w * fold); SK.vert(new V3(Math.cos(a) * rad, yy + .045 * w * fold, Math.sin(a) * rad), new V3(Math.cos(a) * .25 * fold, 1, Math.sin(a) * .25 * fold).normalize(), j / NA, f, hem ? cream : red); } });
        for(let i = 0; i < rings.length - 1; i++) for(let j = 0; j < NA; j++){ const a = i * (NA + 1) + j, b = a + NA + 1; SK.i.push(a, b, a + 1, a + 1, b, b + 1); }
        const sk = new THREE.Mesh(SK.geo(), std('#ffffff', {vertexColors: true, side: THREE.DoubleSide, roughness: .95})); sk.name = 'fir-skirt'; sk.userData.own = true; t3.add(sk); }
      const wm = new THREE.Mesh(W.geo(), woodMat()); wm.name = 'fir-wood'; wm.userData.own = true; t3.add(wm);
      /* ornaments hang a hand's width below branch tips, each with a little gold cap */
      const pal = ORN[small ? 'small' : kind] || ORN.fir, nO = Math.round(h * r * (small ? 1.7 : 5)), orn = [], caps = [];
      for(let i = tips.length - 1; i > 0; i--){ const j = Math.floor(R() * (i + 1)); [tips[i], tips[j]] = [tips[j], tips[i]]; }
      for(const q of tips){ if(orn.length >= nO) break; if(orn.some(z => z.p.distanceTo(q.p) < .5 * sc + .1)) continue; const s = (small ? .07 : .09) + R() * .04, p = q.p.clone().add(new V3(0, -.07 - s, 0));
        orn.push({p, s, c: pal[Math.floor(R() * 99) % pal.length]}); caps.push({p: p.clone().add(new V3(0, s * .93, 0)), s: [s * .3, s * .22, s * .3]}); }
      if(orn.length){ t3.add(inst(G.sph, std('#ffffff', {metalness: .65, roughness: .2}), orn)); t3.add(inst(G.cylLo, metal('#c9a24a', .35), caps)); }
      /* the string of lights, draped along the branches (as many as the old tree carried), twinkling as before */
      const lp = [], lpal = TLITE[small ? 'small' : kind] || TLITE.fir, N = Math.round(h * r * (small ? 12 : 13));
      for(let i = lights.length - 1; i > 0; i--){ const j = Math.floor(R() * (i + 1)); [lights[i], lights[j]] = [lights[j], lights[i]]; }
      lights.slice(0, N).sort((a, b) => a.y - b.y).forEach((p, i) => lp.push({p: new V3(o.x + p.x, o.y + p.y, o.z + p.z), c: lpal[i % lpal.length], s: lpal.length > 1 ? .56 : .5, r: .03, q: i}));
      lightSet(g, lp, {mode: 1, seq: o.seq == null ? 2 : o.seq, body: true, seed: 12});
      if(!o.pot && !small){ const gifts = [[-.9, .9, .7, .5, .6, '#b3232c', '#f1e3b4'], [.8, 1.1, .55, .7, .55, '#1f4f8f', '#e8edf3'], [1.25, .2, .8, .42, .6, '#e8e0cf', '#b3232c'], [-1.3, -.1, .5, .36, .5, '#2d6b3c', '#e0b33c']], GG = new GB(), M = new THREE.Matrix4(), Q = new THREE.Quaternion();
        gifts.forEach(q => { const k = r / 2.3, at = new V3(q[0] * k, q[3] / 2 + .005, q[1] * k); Q.setFromAxisAngle(Y, q[0]); [[q[2], q[3], q[4], q[5]], [q[2] + .012, q[3] + .012, .08, q[6]], [.08, q[3] + .012, q[4] + .012, q[6]]].forEach(([bx, by, bz, hx]) => GG.add(G.box, M.compose(at, Q, new V3(bx, by, bz)), col(hx))); });
        const gm = new THREE.Mesh(GG.geo(), std('#ffffff', {vertexColors: true, roughness: .55})); gm.name = 'fir-gifts'; gm.userData.own = true; t3.add(gm); }
      if(o.topper === 'star'){ const m = own(new THREE.MeshStandardMaterial({color: col('#f2c14e'), metalness: .7, roughness: .3, emissive: col('#ffb53a'), emissiveIntensity: 0})); const s = new THREE.Mesh(tex('topStar', () => starGeo(.34, .14, .09)), m), ss = small ? .6 : 1; s.position.set(0, h + .03 + .13 * ss, 0); s.scale.setScalar(ss); t3.add(s);   // the star's lower notch sits on the leader
        const set = lightSet(g, [{p: new V3(o.x, o.y + s.position.y, o.z), c: '#ffd27a', s: small ? 1.3 : 2.1}], {mode: 3, seq: 4}); set.mat.uniforms.uMode.value = 0; set.glows.push({m, k: 1.3}); applyOn(set, ON); }
      if(o.topper === 'flake'){ const m = own(new THREE.MeshStandardMaterial({color: col('#f4f8ff'), emissive: col('#bfe0ff'), emissiveIntensity: 0, roughness: .4})), f = new THREE.Group(); f.position.set(0, h + .3, 0);
        for(let i = 0; i < 3; i++){ const arm = mesh(G.box, m, 0, 0, 0, .05, .72, .04); arm.rotation.z = i * Math.PI / 3; f.add(arm); [-1, 1].forEach(e => [-1, 1].forEach(sd => { const b = mesh(G.box, m, 0, 0, 0, .035, .17, .035); const a = i * Math.PI / 3; b.position.set(-Math.sin(a) * e * .22, Math.cos(a) * e * .22, 0); b.rotation.z = a + sd * .9 * e; b.position.x += Math.cos(a) * sd * .05; b.position.y += Math.sin(a) * sd * .05; f.add(b); })); } t3.add(f);
        const set = lightSet(g, [{p: new V3(o.x, o.y + h + .3, o.z), c: '#cfe6ff', s: 1.9}], {mode: 3, seq: 4}); set.mat.uniforms.uMode.value = 0; set.glows.push({m, k: 1.2}); applyOn(set, ON); }
      if(o.shadow !== false) blob(g, o.x, o.y, o.z, r * 1.25, .75); }
    function olive(g, o){ const R = rng(23), t3 = new THREE.Group(); t3.position.set(o.x, o.y, o.z); g.add(t3);
      t3.add(mesh(new THREE.CylinderGeometry(.62, .44, .95, 20), std('#b9643c', {roughness: .75}), 0, .475, 0)); t3.add(mesh(new THREE.TorusGeometry(.62, .05, 6, 24).rotateX(Math.PI / 2), std('#b9643c', {roughness: .75}), 0, .95, 0)); t3.add(mesh(G.cyl, std('#3a2c22'), 0, .9, 0, .56, .04, .56));
      const trunk = [new V3(0, .9, 0), new V3(.08, 1.9, .03), new V3(-.05, 2.9, -.04), new V3(.04, 3.6, .02)], tm = std('#6f6253'); for(let i = 0; i < 3; i++){ const a = trunk[i], b = trunk[i + 1], m = mesh(G.cylLo, tm, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, .075 - i * .012, a.distanceTo(b) + .04, .075 - i * .012); m.quaternion.copy(qY(b.clone().sub(a))); t3.add(m); }
      const blobs = [[0, 4.5, 0, 1.05], [.75, 4.1, .2, .7], [-.7, 4.2, -.3, .72], [.1, 5.3, -.1, .78], [-.2, 4.0, .7, .62], [.3, 4.7, -.75, .6]], cs = ['#7d8f6b', '#93a37f', '#6c7f5d', '#a7b494'], leaves = [], br = [], lp = [];
      blobs.forEach((b, bi) => { const c = new V3(b[0], b[1], b[2]); const m = mesh(G.cylLo, tm, 0, 0, 0, .03, 1, .03), from = new V3(0, 3.5, 0), d = c.clone().sub(from); m.position.copy(from).addScaledVector(d, .5); m.scale.y = d.length(); m.quaternion.copy(qY(d)); br.push(m);
        for(let i = 0; i < 60; i++){ const dir = new V3(R() - .5, R() - .5, R() - .5).normalize(), p = c.clone().addScaledVector(dir, b[3] * Math.pow(R(), .4)); leaves.push({p, q: qY(dir.clone().add(new V3(0, .6, 0))), s: [.07, .24 + R() * .1, .07], c: cs[Math.floor(R() * 4)]}); }
        for(let i = 0; i < 14; i++){ const dir = new V3(R() - .5, R() - .5, R() - .5).normalize(); lp.push({p: new V3(o.x, o.y, o.z).add(c).addScaledVector(dir, b[3] * .95), c: '#ffe0b0', s: .5}); } });
      br.forEach(m => t3.add(m)); t3.add(inst(G.leaf, std('#ffffff', {roughness: .7}), leaves)); lightSet(g, lp, {mode: 1, seq: 2, seed: 5}); blob(g, o.x, o.y, o.z, 1.3, .7); }
    const TREE_AT = [-3.15, 0, -5.2];
    function buildTree(S){ if(S.tree === 'none') return null; const g = grp('tree'), [x, y, z] = TREE_AT;
      if(S.tree === 'olive') olive(g, {x, y, z}); else conifer(g, {x, y, z, kind: S.tree, h: S.tree === 'pencil' ? 7.0 : 6.6, r: S.tree === 'pencil' ? 1.15 : 2.2, topper: S.topper});
      return g; }

    /* ---------- candles, menorah, kinara ---------- */
    function menorah(g, x, y, z, ry, lit, s, seq){ s = s || 1; const m = new THREE.Group(); m.position.set(x, y, z); m.rotation.y = ry; m.scale.setScalar(s); g.add(m); const br = metal('#c9a24a', .28);
      m.add(mesh(G.cyl, br, 0, .03, 0, .3, .06, .16)); m.add(mesh(G.cyl, br, 0, .1, 0, .13, .1, .1)); m.add(mesh(G.cyl, br, 0, .62, 0, .032, 1.0, .032)); m.add(mesh(G.sph, br, 0, .42, 0, .07));
      const cups = [[0, 1.16]]; for(let i = 1; i <= 4; i++){ const R0 = .165 * i, t = new THREE.Mesh(new THREE.TorusGeometry(R0, .024, 6, 26, Math.PI), br); t.rotation.z = Math.PI; t.position.y = 1.02; m.add(t); cups.push([R0, 1.02], [-R0, 1.02]); }
      const at = []; m.updateMatrixWorld(true);
      cups.forEach((c, i) => { m.add(mesh(G.cyl, br, c[0], c[1] + .03, 0, .05, .06, .05)); const on = i === 0 || lit >= 9 || (c[0] > 0 && Math.round(c[0] / .165) <= lit) || (lit > 4 && c[0] < 0 && Math.round(-c[0] / .165) <= lit - 4);
        if(!on) return; m.add(mesh(G.cylLo, std(i % 2 ? '#2f5fd0' : '#f4f1e8', {roughness: .5}), c[0], c[1] + .2, 0, .026, .3, .026)); at.push({p: m.localToWorld(new V3(c[0], c[1] + .36, 0)), s: .8 * s}); });
      return flames(g, at, {seq, glow: 1.25}); }
    const mkekaTex = () => tex('mkeka', () => canvasTex(256, 160, (x, w, h) => { x.fillStyle = '#d9b877'; x.fillRect(0, 0, w, h); const bands = [['#b3232c', 18, 16], ['#161616', 38, 10], ['#1f7a3a', 52, 16], ['#161616', 96, 6], ['#b3232c', 108, 10], ['#1f7a3a', 124, 16]]; bands.forEach(b => { x.fillStyle = b[0]; x.fillRect(0, b[1], w, b[2]); });
      for(let i = 0; i < w; i += 4){ x.fillStyle = i % 8 ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.12)'; x.fillRect(i, 0, 2, h); } for(let j = 0; j < h; j += 4){ x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, j, w, 1); } }));
    function kinara(g, x, y, z, ry, o){ o = o || {}; const k = new THREE.Group(); k.position.set(x, y, z); k.rotation.y = ry; k.scale.setScalar(o.s || 1); g.add(k); const wood = std('#5b3a22', {roughness: .55}), at = [], cs = ['#c4202a', '#c4202a', '#c4202a', '#151515', '#1f8a3f', '#1f8a3f', '#1f8a3f'];
      if(o.mat){ const mk = mesh(G.box, std('#ffffff', {map: mkekaTex(), roughness: .95}), 0, .012, 0, 2.5, .024, 1.5); k.add(mk); y += 0; }
      const by = o.mat ? .024 : 0; k.add(mesh(G.box, wood, 0, by + .05, 0, 1.7, .1, .3)); k.updateMatrixWorld(true);
      for(let i = 0; i < 7; i++){ const px = (i - 3) * .23, hh = .12 + (3 - Math.abs(i - 3)) * .1; k.add(mesh(G.box, wood, px, by + .1 + hh / 2, 0, .2, hh, .22)); k.add(mesh(G.cylLo, std(cs[i], {roughness: .45}), px, by + .1 + hh + .22, 0, .034, .44, .034)); at.push({p: k.localToWorld(new V3(px, by + .1 + hh + .45, 0)), s: .85 * (o.s || 1)}); }
      if(o.mat){ const cornM = std('#ffffff', {roughness: .6}), husk = std('#cdbf8a', {roughness: .9});
        [[-.95, .42, .5], [-.72, .5, -.2]].forEach((c, i) => { const e = mesh(G.sphLo, cornM, c[0], by + .075, c[1], .075, .3, .075); e.material = std(i ? '#e3b83a' : '#eccb52', {roughness: .55}); e.rotation.set(Math.PI / 2, 0, c[2]); k.add(e); const hk = mesh(G.leaf, husk, c[0] - Math.sin(c[2]) * .28, by + .05, c[1] + Math.cos(c[2]) * .28, .16, .34, .16); hk.rotation.set(Math.PI / 2, 0, c[2]); k.add(hk); });
        k.add(mesh(new THREE.SphereGeometry(.3, 16, 8, 0, 6.3, Math.PI / 2, Math.PI / 2), std('#7a5230', {roughness: .5, side: THREE.DoubleSide}), .88, by + .185, .38, 1, .6, 1));
        [['#e8862a', .8, .32, .42, .1], ['#c4202a', .98, .34, .32, .095], ['#8fb54a', .86, .33, .52, .09], ['#f0c93a', 1.0, .36, .48, .08], ['#e8862a', .9, .42, .38, .085]].forEach(f => k.add(mesh(G.sph, std(f[0], {roughness: .5}), f[1], by + f[2] - .12, f[3], f[4])));
        const cup = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.09, 0], [.03, .05], [.025, .16], [.1, .28], [.11, .36], [.09, .36], [.0, .2]].map(p => new THREE.Vector2(p[0], p[1])), 12), wood); cup.position.set(.2, by, .5); k.add(cup); }
      return flames(g, at, {seq: o.seq, glow: 1.3}); }
    function candle(g, x, y, z, seqAt){ const br = metal('#c9a24a', .3); g.add(mesh(G.cyl, br, x, y + .015, z, .1, .03, .1)); g.add(mesh(G.cyl, br, x, y + .09, z, .03, .14, .03)); g.add(mesh(G.cyl, br, x, y + .17, z, .055, .03, .055)); g.add(mesh(G.cylLo, std('#f5efdf', {roughness: .5}), x, y + .43, z, .03, .5, .03)); seqAt.push({p: new V3(x, y + .7, z), s: .9}); }
    /* what the street sees. At dusk the model's own window glass glows and hides the room behind it, so things "in the window" sit
       on the inside sill when you are indoors and just outside the glass when you are looking from outside. */
    const WINS = [['WN-L1-01', [0]], ['WN-LG-01', [0]], ['WN-L1-02', [-.25, .25]], ['WN-L1-03', [-.25, .25]], ['WN-L1-04', [-.25, .25]], ['WN-L1-05', [0]], ['WN-L1-07', [0]]];
    function sill(o, f, inside){ const k = inside ? -(o.th / 2 + .16) : (o.th / 2 + .2); return new V3(o.x + o.ax * o.w * f + o.nx * k, o.sill + (inside ? .02 : -.02), o.z + o.az * o.w * f + o.nz * k); }
    function buildWin(S, ctx){ const Wn = S.win || []; if(!Wn.length) return null; const g = grp('win'), ins = !!ctx.inside, cand = [], hasM = Wn.includes('menorah'), hasK = Wn.includes('kinara');
      if(Wn.includes('candles')) WINS.forEach(([id, fs]) => { const o = opening(id); if(!o) return; if(id === 'WN-L1-01' && hasM) return; fs.forEach(f => { if(id === 'WN-L1-03' && hasK && f === (o.az > 0 ? -.25 : .25)) return; const p = sill(o, f, ins); candle(g, p.x, p.y, p.z, cand); }); });
      if(cand.length) flames(g, cand, {seq: 1, glow: 1.5, seed: 3});
      if(hasM){ const o = opening('WN-L1-01'); if(o){ const p = sill(o, 0, ins); menorah(g, p.x, p.y, p.z, Math.atan2(o.nx, o.nz), S.menorahLit || 5, .92, 1); } }   // the game lights five (it is the fifth night in its story); the tour's holiday dress lights all nine
      if(hasK){ const o = opening('WN-L1-03'); if(o){ const f = o.az > 0 ? -.25 : .25, p = sill(o, f, ins); kinara(g, p.x, p.y, p.z, Math.atan2(o.nx, o.nz), {s: .95, seq: 1}); } }
      if(Wn.includes('tree')) conifer(g, {x: -8.9, y: 0, z: 4.7, kind: 'fir', h: 4.4, r: 1.25, small: true, pot: '#2b2f38', topper: 'star', seq: 1, seed: 31});
      return g; }

    /* ---------- around the living room ---------- */
    function poinsettia(g, x, y, z, s){ const R = rng(Math.round(x * 31 + z * 7)), p = new THREE.Group(); p.position.set(x, y, z); p.scale.setScalar(s || 1); g.add(p);
      p.add(mesh(new THREE.CylinderGeometry(.34, .26, .5, 14), metal('#c9a24a', .45), 0, .25, 0)); const lv = [];
      const ringL = (n, yy, len, tilt, cs, off) => { for(let i = 0; i < n; i++){ const a = off + i / n * 6.283 + (R() - .5) * .3, dir = new V3(Math.sin(a) * Math.cos(tilt), Math.sin(tilt), Math.cos(a) * Math.cos(tilt)), X = new V3().crossVectors(Y, dir).normalize(), Z = new V3().crossVectors(X, dir).normalize();
          lv.push({p: new V3(0, yy, 0), q: basisQ(X, dir, Z), s: [len * .5, len * (.9 + R() * .2), len * .5], c: cs[Math.floor(R() * cs.length)]}); } };
      ringL(9, .55, .62, -.05, ['#1f5a2c', '#256b34', '#1b4f27'], 0); ringL(8, .78, .56, .25, ['#1f5a2c', '#256b34'], .4); ringL(8, 1.0, .5, .22, ['#c4161f', '#d21f2a', '#a9121a'], .2); ringL(6, 1.08, .36, .5, ['#d21f2a', '#e02a33'], .6); ringL(5, 1.12, .22, .9, ['#e02a33'], 0);
      p.add(inst(G.leaf, std('#ffffff', {roughness: .6, side: THREE.DoubleSide}), lv)); p.add(mesh(G.sphLo, std('#e8c63a'), 0, 1.13, 0, .06)); blob(g, x, y, z, .6 * (s || 1), .6); }
    function hideDecor(on){ const b = new THREE.Box3(new V3(4, .5, -4.1), new V3(9.1, 3.2, -1.8)), bb = new THREE.Box3(); const f = H.grp && H.grp('furn@asbuilt'); if(!f) return;
      f.traverse(o => { if(o.userData.deckHid){ o.visible = true; o.userData.deckHid = false; } }); if(!on) return;
      f.traverse(o => { if(o.name === 'decor' && o.visible){ bb.setFromObject(o); if(!bb.isEmpty() && b.containsBox(bb)){ o.visible = false; o.userData.deckHid = true; } } }); }
    function tableTop(x, z, dflt){ let best = null; [[0, 0], [.5, .3], [-.5, -.3], [1.2, 0], [-1.2, 0]].forEach(d => { const h = down(x + d[0], z + d[1], 4, 5); if(h && h.point.y > .6 && (best == null || h.point.y < best)) best = h.point.y; }); return best == null ? dflt : best; }
    const BEAMS = [3.05, 6.8, 10.55];
    function buildRoom(S, ctx){ const Rm = S.room || []; hideDecor(Rm.includes('kinara') || Rm.includes('menorah')); if(!Rm.length) return null; const g = grp('room');
      if(Rm.includes('kinara')){ const y = tableTop(6.55, -2.95, 1.45); kinara(g, 6.55, y, -2.95, 0, {mat: true, seq: 2}); }
      if(Rm.includes('menorah')){ const mx = Rm.includes('kinara') ? 8.3 : 6.55, y = tableTop(mx, -2.95, 1.45); menorah(g, mx, y, -2.95, 0, 9, Rm.includes('kinara') ? .72 : .9, 2); }
      if(Rm.includes('beams')) BEAMS.forEach((x, i) => { const pts = []; for(let s = 0; s < 3; s++){ const a = new V3(x, 8.36, -7.0 + s * 3.13), b = new V3(x, 8.36, -7.0 + (s + 1) * 3.13); swag(a, b, .42, 10).forEach((p, j) => { if(s === 0 || j) pts.push(p); }); } garland(g, pts, {seq: 3, seed: 40 + i, r: .19}); [-7, -3.87, -.74, 2.39].forEach(z => bow(g, '#b3141f', x, 8.2, z, .9)); });
      if(Rm.includes('poinsettia')){ poinsettia(g, .75, 0, -5.9, 1.15); poinsettia(g, 11.2, 0, -5.75, 1.15); poinsettia(g, 12.9, 0, -6.6, .95); }
      if(Rm.includes('rangoli')) rangoli(g, -5.7, floorY(-5.7, -2.4, 3, 0), -2.4, 1.9, 2);
      if(Rm.includes('box')){ const b = new THREE.Group(); b.position.set(BOX_AT[0], BOX_AT[1], BOX_AT[2]); b.rotation.y = .5; g.add(b); const kr = std('#b98a55', {roughness: .95, side: THREE.DoubleSide}), w = 1.7, h = 1.05, d = 1.3, t = .03;
        b.add(mesh(G.box, kr, 0, t / 2, 0, w, t, d)); [[0, d / 2, w, 0], [0, -d / 2, w, 0], [w / 2, 0, d, 1], [-w / 2, 0, d, 1]].forEach((s, i) => { const wl = mesh(G.box, kr, s[0], h / 2, s[1], s[3] ? t : s[2], h, s[3] ? s[2] : t); b.add(wl);
          const fl = mesh(G.box, kr, 0, 0, 0, s[3] ? t : s[2], s[3] ? d * .42 : d * .42, s[3] ? s[2] : t), pv = new THREE.Group(); pv.position.set(s[0], h, s[1]); fl.position.y = d * .21; pv.add(fl); if(s[3]) pv.rotation.z = (s[0] > 0 ? -1 : 1) * 2.05; else pv.rotation.x = (s[1] > 0 ? 1 : -1) * 2.0; b.add(pv); });
        b.add(mesh(G.box, std('#d8c8a0', {roughness: .7}), 0, h * .5, d / 2 + .018, .16, h, .006)); blob(g, BOX_AT[0], BOX_AT[1], BOX_AT[2], 1.35, .7); }
      return g; }
    const BOX_AT = [2.5, 0, -3.3];

    /* ---------- the heritage oak and the terrace ---------- */
    const OAKS = {};
    function oakInfo(name){ name = name || 'tree:OAK-BACK'; let OAK = OAKS[name]; if(OAK) return OAK; let tree = null, bark = null; H.scene.traverse(o => { if(o.name === name){ tree = o; bark = o.children.find(c => c.name === 'bark') || bark; } }); if(!bark) return {trunk: [], canopy: []};   // not remembered: the trees are planted a moment after the house
      bark.updateWorldMatrix(true, false); const P = bark.geometry.attributes.position, v = new V3(), V = []; for(let i = 0; i < P.count; i++){ v.fromBufferAttribute(P, i).applyMatrix4(bark.matrixWorld); V.push(v.clone()); }
      const low = V.filter(q => q.y < -1.5 && q.y > -5); let cx = 8.3, cz = -27.2; if(low.length){ cx = low.reduce((s, q) => s + q.x, 0) / low.length; cz = low.reduce((s, q) => s + q.z, 0) / low.length; }
      const g0 = floorY(cx + 2.6, cz, 6, -4.8); let trunk = [], top = null;
      /* r40: the trunk's own rings (trees.js records where they sit in the bark geometry): a radius for every 7.5 degrees round each ring, so
         a string wrapped on it follows the root flare, the buttress lobes and the burls instead of a mean circle that dipped into the bark */
      const TR = tree && tree.userData && tree.userData.info && tree.userData.info.trunk, NB = 48, TAU = Math.PI * 2;
      if(TR && TR.n > 2 && TR.start + TR.n * TR.W <= P.count){
        for(let k = 0; k < TR.n; k++){ const m = TR.W - 1, ring = []; let mx = 0, my = 0, mz = 0; for(let j = 0; j < m; j++){ const q = V[TR.start + k * TR.W + j]; ring.push(q); mx += q.x; my += q.y; mz += q.z; } mx /= m; my /= m; mz /= m;
          const pa = ring.map(q => [Math.atan2(q.z - mz, q.x - mx), Math.hypot(q.x - mx, q.z - mz)]).sort((p, q) => p[0] - q[0]), rs = new Float32Array(NB); let rm = 0;
          for(let bI = 0; bI < NB; bI++){ const an = -Math.PI + (bI + .5) / NB * TAU; let i1 = pa.findIndex(e => e[0] >= an); if(i1 < 0) i1 = 0; const i0 = (i1 - 1 + pa.length) % pa.length; let a0 = pa[i0][0], a1 = pa[i1][0], aa = an; if(a1 <= a0) a1 += TAU; if(aa < a0) aa += TAU;
            rs[bI] = lerp(pa[i0][1], pa[i1][1], clamp((aa - a0) / Math.max(1e-6, a1 - a0), 0, 1)); rm += rs[bI]; }
          trunk.push({y: my, x: mx, z: mz, r: rm / NB, rs}); }
        trunk.sort((p, q) => p.y - q.y); const k0 = Math.max(0, trunk.findIndex(q => q.y > g0) - 1); trunk = trunk.slice(k0);
        if(trunk.length > 2){ cx = trunk[0].x; cz = trunk[0].z; top = TR.split != null ? new V3(0, TR.split, 0).applyMatrix4(bark.matrixWorld).y - .45 : trunk[trunk.length - 1].y; top = Math.min(top, trunk[trunk.length - 1].y); }
        else trunk = []; }
      if(!trunk.length){ let px = cx, pz = cz;   // older trees.js: slices of the bark's vertices
        for(let y = g0 + .3; y < g0 + 9.5; y += .3){ const sl = V.filter(q => Math.abs(q.y - y) < .7 && Math.hypot(q.x - px, q.z - pz) < 2.4); if(sl.length < 4) continue; const mx = sl.reduce((s, q) => s + q.x, 0) / sl.length, mz = sl.reduce((s, q) => s + q.z, 0) / sl.length, r = sl.reduce((s, q) => s + Math.hypot(q.x - mx, q.z - mz), 0) / sl.length;
          if(r > 1.9 && y > g0 + 3) break; px = mx; pz = mz; trunk.push({y, x: mx, z: mz, r: clamp(r, .7, y < g0 + 2 ? 1.75 : 1.45)}); } }
      top = top != null ? top : trunk.length ? trunk[trunk.length - 1].y : g0 + 7;
      OAK = OAKS[name] = {trunk, canopy: V.filter(q => q.y > top + 1.5 && q.y < top + 24 && Math.hypot(q.x - cx, q.z - cz) < 24), cx, cz, g0, top}; return OAK; }
    /* the trunk's surface at height y and compass angle a (radians, atan2(dz, dx)) */
    function trunkAt(o, y){ const T = o.trunk; let i = 0; while(i < T.length - 2 && T[i + 1].y < y) i++; const A = T[i], B = T[i + 1], k = clamp((y - A.y) / Math.max(.01, B.y - A.y), 0, 1); return {A, B, k, x: lerp(A.x, B.x, k), z: lerp(A.z, B.z, k)}; }
    function trunkR(s, a){ const A = s.A, B = s.B; if(!A.rs || !B.rs) return lerp(A.r, B.r, s.k) * 1.08 + .01; const NB = A.rs.length, f = (a + Math.PI) / (Math.PI * 2) * NB - .5, fl = Math.floor(f), t = f - fl, i0 = ((fl % NB) + NB) % NB, i1 = (i0 + 1) % NB;
      return lerp(lerp(A.rs[i0], A.rs[i1], t), lerp(B.rs[i0], B.rs[i1], t), s.k); }
    /* a trunk wrapped in one warm string, bulbs resting on the bark all the way round; the tour's holiday dress also wraps the leaning oak by the street */
    function trunkWrap(g, o, seq, seed){ if(o.trunk.length < 3) return; const pts = [], T = o.trunk, y0 = Math.max(T[0].y, (o.g0 != null ? o.g0 : T[0].y) + .18), y1 = Math.min(o.top != null ? o.top : 1e9, T[T.length - 1].y); let a = 0;
      for(let y = y0; y < y1; ){ const s = trunkAt(o, y), r = trunkR(s, a) + .07; pts.push({p: new V3(s.x + Math.cos(a) * r, y, s.z + Math.sin(a) * r), c: '#ffd596', s: .62, q: pts.length * .25, r: .035}); const da = .24 / r; a += da; if(a > Math.PI) a -= Math.PI * 2; y += da / 6.283 * .62; }
      lightSet(g, pts, {mode: 1, seq, body: true, seed}); }
    function buildOakFront(S){ if(!S.oakFront) return null; const o = oakInfo('tree:OAK-FRONT'); if(o.trunk.length < 3) return null; const g = grp('oakfront'); trunkWrap(g, o, 1, 22); return g; }
    function buildOak(S){ if(S.oak === 'none') return null; const o = oakInfo(), g = grp('oak'), R = rng(9);
      if((S.oak === 'wrap' || S.oak === 'both') && o.trunk.length > 2) trunkWrap(g, o, 1, 2);
      if((S.oak === 'branches' || S.oak === 'both') && o.canopy.length){ const pts = [], n = Math.min(900, o.canopy.length); for(let i = 0; i < n; i++){ const q = o.canopy[Math.floor(R() * o.canopy.length)]; pts.push({p: new V3(q.x + (R() - .5) * .5, q.y + (R() - .5) * .5 - .1, q.z + (R() - .5) * .5), c: R() > .25 ? '#ffe2b4' : '#ffc978', s: .7 + R() * .35}); }
        lightSet(g, pts, {mode: 1, seq: 2, seed: 6}); }
      return g; }
    const TER_EDGE = [[.7, -25.6], [.8, -28.6], [1.3, -31.6], [2.6, -34.4], [4.4, -37], [6.4, -39.8], [8.2, -42.8], [8.6, -45.8], [6.6, -48.6], [3.8, -51.2]];
    function buildTer(S){ const Tr = S.ter || []; if(!Tr.length) return null; const g = grp('ter'), o = oakInfo();
      if(Tr.includes('bistro')){ const oy = Math.min(o.top || 4, 4.6), oakA = new V3((o.cx || 8.3) - .9, oy, (o.cz || -27.2) - .5), runs = [[oakA, new V3(2.85, 5.0, -37.3), 1.0], [oakA, new V3(-9.9, 5.6, -28.5), 1.3], [new V3(2.7, 4.5, -37.5), new V3(-3.6, 4.5, -50.0), .45], [new V3(-3.6, 4.5, -50.0), new V3(-9.7, 4.5, -37.5), .45], [new V3(2.7, 4.5, -37.5), new V3(-9.7, 4.5, -37.5), .4]], pts = []; let q0 = 0;
        runs.forEach(r => { const line = swag(r[0], r[1], r[2], 26); wire(g, line, '#151515'); along(line, 1.05, .5).forEach(s => pts.push({p: new V3(s.p.x, s.p.y - .16, s.p.z), c: '#ffcf8a', s: 1.25, q: q0 + s.q, r: .09})); q0 += 30; });
        lightSet(g, pts, {mode: 0, seq: 2, body: true, seed: 14}); }
      if(Tr.includes('luminarias')) luminarias(g, TER_EDGE.map(p => new V3(p[0], floorY(p[0], p[1], 2, -4.8) + .01, p[1])), 2);
      if(Tr.includes('lanterns')){ const ty = tableTop(-2.6, -43.7, -2.3), at = [], iron = std('#17181b', {roughness: .5, metalness: .4});
        [[-4.7, -43.7, 1], [-.5, -43.7, .82]].forEach(p => { const l = new THREE.Group(); l.position.set(p[0], ty, p[1]); l.scale.setScalar(p[2]); g.add(l); l.add(mesh(G.box, iron, 0, .025, 0, .46, .05, .46)); l.add(mesh(G.box, iron, 0, .95, 0, .46, .05, .46));
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(c => l.add(mesh(G.box, iron, c[0] * .21, .49, c[1] * .21, .035, .9, .035))); const cap = mesh(G.spike4, iron, 0, .97, 0, .58, .26, .58); cap.rotation.y = Math.PI / 4; l.add(cap); const ring = mesh(new THREE.TorusGeometry(.09, .014, 5, 14), iron, 0, 1.3, 0); l.add(ring);
          l.add(mesh(G.cyl, std('#f5efdf', {roughness: .5}), 0, .25, 0, .1, .4, .1)); at.push({p: new V3(p[0], ty + .47 * p[2], p[1]), s: 1.1 * p[2]}); });
        flames(g, at, {seq: 2, glow: 2.2}); }
      if(Tr.includes('smoker')){ let c = null; H.scene.traverse(q => { if(q.isMesh && /^k2\dceramic$/.test(q.name) && shown(q)) c = q; }); const b = new THREE.Box3(); if(c) b.setFromObject(c); const p = c ? b.getCenter(new V3()) : new V3(-8.5, -1, -48.5), top = c ? b.max.y : 0;
        lightSet(g, [{p: new V3(p.x, p.y - (c ? (b.max.y - b.min.y) * .12 : 0), p.z + (c ? (b.max.z - b.min.z) * .52 : 0)), c: '#ff6a1e', s: 1.5}, {p: new V3(p.x, top + .1, p.z), c: '#ff8a3a', s: .9}], {mode: 4, seq: 2});
        const sm = own(new THREE.SpriteMaterial({map: tex('smoke', () => canvasTex(64, 64, (x, w) => { const gr = x.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(235,235,240,.5)'); gr.addColorStop(1, 'rgba(235,235,240,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, w); })), transparent: true, depthWrite: false, opacity: .3})); const puffs = [];
        for(let i = 0; i < 6; i++){ const s = new THREE.Sprite(sm); s.raycast = noop; s.userData.k = i / 6; g.add(s); puffs.push(s); } g.userData.tick = t => puffs.forEach(s => { const k = ((reduce ? 0 : t * .12) + s.userData.k) % 1; s.position.set(p.x + Math.sin(k * 5 + s.userData.k * 9) * .3 * k, top + .2 + k * 4.2, p.z + k * .6); s.scale.setScalar(.5 + k * 1.9); s.visible = k < .96; }); }
      return g; }

    /* ---------- weather: snow that falls outdoors only, lies on roofs and ground, and can be built into something ---------- */
    const SNOW = {u: {uCover: {value: 0}, uLight: {value: new THREE.Color(1, 1, 1)}, uSun: {value: new V3(0, 1, 0)}, uSunC: {value: new THREE.Color(0, 0, 0)}}, over: [], fall: null, found: false};
    function snowMat(){ return SNOW.mat || (SNOW.mat = new THREE.ShaderMaterial({uniforms: SNOW.u, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform float uCover; uniform vec3 uLight, uSun, uSunC; varying vec3 vW; varying vec3 vN;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main(){ vec3 N = normalize(vN); float up = smoothstep(.3, .62, N.y); float f = n(vW.xz * .35) * .55 + n(vW.xz * 1.3) * .3 + n(vW.xz * 5.) * .15;
          float a = up * smoothstep(1. - uCover * 1.25, 1.12 - uCover * 1.05, f + uCover * .5) * (.5 + .46 * uCover); a *= smoothstep(150., 95., length(vW.xz));
          if(a < .01) discard; float sh = .88 + .12 * n(vW.xz * 2.2); vec3 c = (uLight * (.72 + .28 * N.y) + uSunC * max(0., dot(N, uSun))) * sh; gl_FragColor = vec4(c, a); }`})); }
    function snowFind(){ if(SNOW.found) return; SNOW.found = true; const seen = new Set(), pickM = [], bb = new THREE.Box3(), sz = new V3();
      const take = o => { if(seen.has(o)) return; seen.add(o); if(o.isInstancedMesh || !o.geometry || !o.geometry.attributes.normal) return; const m = o.material; if(!m || Array.isArray(m) || m.transparent || m.alphaTest > 0) return; bb.setFromObject(o); bb.getSize(sz); if(sz.x * sz.z < 40) return; pickM.push(o); };
      for(let x = -44; x <= 44; x += 4) for(let z = -64; z <= 76; z += 4){ rc.set(new V3(x + .37, 60, z + .41), new V3(0, -1, 0)); rc.far = 90; let hs = []; try{ hs = rc.intersectObjects(H.scene.children, true); }catch(e){} const h = hs.find(solid); if(!h) continue; let p = h.object, bad = false; for(let q = p; q; q = q.parent) if(/^furn|^deck3d$|^trees/.test(q.name)) bad = true; if(!bad && !/cushion|wicker|decor|sofa|chair|k2\d|p2\d(?!poly)|bowl|teak|contact|-ao/i.test(p.name)) take(p); }
      H.scene.traverse(o => { if(o.isMesh && /comp-shingle-arch|modbit-torchdown|flagstone|paver-band|^site\|.*deck-composite/.test(o.name) && shown(o)) take(o); });
      pickM.forEach(o => { o.updateWorldMatrix(true, false); const m = new THREE.Mesh(o.geometry, snowMat()); m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld); m.matrixWorld.copy(o.matrixWorld); m.renderOrder = 1; m.raycast = noop; m.frustumCulled = false; m.name = 'deck-snow'; m.visible = false; root.add(m); SNOW.over.push(m); }); }
    const HOUSE = [[3.2, 3.6, 33.7, 38.2], [-10.2, -11, 28.1, 6.3], [-26.7, -1.2, -10.2, 23.7], [-34.5, -51.1, -7.4, -1.1], [-10.2, -50.7, 3, -37]];
    function snowFall(n){ const R = rng(77), pos = new Float32Array(n * 3), ph = new Float32Array(n); for(let i = 0; i < n; i++){ pos[i * 3] = R() * 70; pos[i * 3 + 1] = R() * 36; pos[i * 3 + 2] = R() * 70; ph[i] = R(); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
      const mat = new THREE.ShaderMaterial({uniforms: {uTime: U.time, uScale: U.scale, uCam: {value: new V3()}, uAmt: {value: 1}, uTint: SNOW.u.uLight, uR: {value: HOUSE.map(r => new THREE.Vector4(r[0], r[1], r[2], r[3]))}}, transparent: true, depthWrite: false,
        vertexShader: `attribute float aPhase; uniform float uTime, uScale, uAmt; uniform vec3 uCam; uniform vec4 uR[5]; varying float vA;
          void main(){ vec3 p = position; float sp = 2.2 + aPhase * 2.4; p.y = mod(p.y - uTime * sp, 36.); p.x += sin(uTime * .7 + aPhase * 30.) * .6; p.z += cos(uTime * .5 + aPhase * 17.) * .6;
            vec3 w = vec3(mod(p.x - uCam.x, 70.) - 35. + uCam.x, p.y - 8. + uCam.y, mod(p.z - uCam.z, 70.) - 35. + uCam.z); vA = aPhase < uAmt ? 1. : 0.;
            for(int i = 0; i < 5; i++){ if(w.x > uR[i].x && w.x < uR[i].z && w.z > uR[i].y && w.z < uR[i].w && w.y < 19.) vA = 0.; }
            vec4 mv = viewMatrix * vec4(w, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = clamp((.11 + aPhase * .1) * uScale / max(.3, -mv.z), 1.5, 14.); if(vA < .5) gl_Position = vec4(2., 2., 2., 1.); }`,
        fragmentShader: `uniform vec3 uTint; varying float vA; void main(){ float d = length(gl_PointCoord - .5) * 2.; if(d > 1.) discard; gl_FragColor = vec4(min(vec3(1.), uTint * 1.25 + .12), (1. - d * d) * .85 * vA); }`});
      const P = new THREE.Points(geo, mat); P.frustumCulled = false; P.renderOrder = 7; P.raycast = noop; P.onBeforeRender = scaleHook; P.name = 'deck-snowfall'; return P; }
    const SNOWMAN_AT = [-8.8, 26.1];
    function buildWeather(S){ const w = S.weather, full = w === 'snowday'; if(w === 'clear' || !w){ SNOW.over.forEach(m => m.visible = false); if(SNOW.fall) SNOW.fall.visible = false; return null; }
      snowFind(); SNOW.u.uCover.value = full ? 1 : .42; SNOW.over.forEach(m => m.visible = true); if(!SNOW.fall){ SNOW.fall = snowFall(2600); root.add(SNOW.fall); } SNOW.fall.visible = true; SNOW.fall.material.uniforms.uAmt.value = full ? 1 : .35;
      if(!full || S.yard === 'none') return null; const g = grp('yard'), [x, z] = SNOWMAN_AT, y = floorY(x, z, 2, -3.5), snow = std('#f4f7fb', {roughness: .95}), coal = std('#15161a'), s = new THREE.Group(); s.position.set(x, y, z); s.rotation.y = .25; g.add(s);
      if(S.yard === 'snowman'){ s.add(mesh(G.sphLo, snow, 0, .95, 0, 1.1, 1.0, 1.1)); s.add(mesh(G.sphLo, snow, 0, 2.35, 0, .82, .78, .82)); s.add(mesh(G.sphLo, snow, 0, 3.45, 0, .58));
        [[-.2, 3.58], [.2, 3.58]].forEach(e => s.add(mesh(G.sph, coal, e[0], e[1], .52, .055))); for(let i = 0; i < 5; i++){ const a = -.5 + i * .25; s.add(mesh(G.sph, coal, Math.sin(a) * .28, 3.3 - Math.cos(a) * .1 + .02, .52, .035)); } [2.65, 2.3, 1.95].forEach(yy => s.add(mesh(G.sph, coal, 0, yy, .8 - Math.abs(yy - 2.35) * .2, .06)));
        const nose = mesh(G.spike, std('#e8771c'), 0, 3.45, .55, .12, .48, .12); nose.rotation.x = Math.PI / 2; s.add(nose);
        const sc = std('#2f5fb8', {roughness: .8}); const sf = mesh(new THREE.TorusGeometry(.5, .11, 6, 20), sc, 0, 3.0, 0); sf.rotation.x = Math.PI / 2; s.add(sf); const tl = mesh(G.box, sc, .34, 2.6, .5, .2, .7, .06); tl.rotation.z = -.15; s.add(tl);
        const hat = std('#1a1b20', {roughness: .7}); s.add(mesh(G.cyl, hat, 0, 3.95, 0, .62, .05, .62)); s.add(mesh(G.cyl, hat, 0, 4.3, 0, .4, .7, .4)); s.add(mesh(G.cyl, std('#b3232c'), 0, 4.03, 0, .41, .12, .41));
        const st = std('#4a3424'); [[-1, .9], [1, 1.1]].forEach(a => { const arm = mesh(G.cylLo, st, a[0] * 1.15, 2.7, 0, .035, 1.3, .035); arm.rotation.z = -a[0] * a[1]; s.add(arm); const tw = mesh(G.cylLo, st, a[0] * 1.55, 3.05, .02, .022, .4, .022); tw.rotation.z = -a[0] * .2; s.add(tw); }); }
      else { s.add(mesh(G.sphLo, snow, 0, .85, 0, 1.0, .95, 1.15)); s.add(mesh(G.sphLo, snow, 0, 2.0, .15, .68, .64, .68)); [[-.36, 2.55], [.36, 2.55]].forEach(e => { const ear = mesh(G.spike4, snow, e[0], e[1], .15, .36, .5, .2); ear.rotation.z = -e[0] * .5; s.add(ear); });
        const eye = std('#e8b93c', {roughness: .3}); [[-.24, 2.1], [.24, 2.1]].forEach(e => { s.add(mesh(G.sph, eye, e[0], e[1], .74, .085, .1, .05)); s.add(mesh(G.sph, coal, e[0], e[1], .78, .03, .08, .02)); }); s.add(mesh(G.sph, std('#d9788a'), 0, 1.93, .8, .05, .04, .04));
        const wh = std('#4a3424'); [-1, 1].forEach(d => [-.12, 0, .12].forEach(a => { const q = mesh(G.cylLo, wh, d * .5, 1.9 + a, .72, .008, .5, .008); q.rotation.z = Math.PI / 2 + d * a * 1.6; s.add(q); }));
        const tail = new THREE.Mesh(new THREE.TorusGeometry(.6, .15, 6, 14, Math.PI * 1.1), snow); tail.position.set(.85, .32, -.2); tail.rotation.x = Math.PI / 2; s.add(tail); [[-.4, .6], [.4, .6]].forEach(p => s.add(mesh(G.sphLo, snow, p[0], .22, p[1] + .5, .24, .2, .3))); }
      blob(g, x, y, z, 1.6, .45); return g; }

    /* ---------- Snowball himself: a billboard of the shared drawing, with whatever he is wearing ---------- */
    const CAT = {sp: {}, cur: null};
    function catSprite(pose, wear){ const k = pose + '|' + (wear || ''); if(CAT.sp[k]) return CAT.sp[k]; const peek = pose === 'peek', cw = 384, ch = Math.round(cw * (peek ? 260 / 220 : 462 / 304)), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
      const img = new Image(); img.onload = () => { cv.getContext('2d').drawImage(img, 0, 0, cw, ch); t.needsUpdate = true; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(window.SNOWBALL.svg({id: 'dk' + k.replace(/\W/g, ''), seed: 7, glow: true, pose: peek ? 'peek' : 'sit', wear: wear && wear !== 'none' ? wear : null}).replace('<svg ', `<svg width="${cw}" height="${ch}" `));
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: t, transparent: true, depthWrite: false, alphaTest: .04})); sp.center.set(.5, 0); const hgt = peek ? 1.15 : 1.75; sp.scale.set(hgt * cw / ch, hgt, 1); sp.name = 'deck-snowball'; sp.renderOrder = 5; sp.raycast = noop; sp.visible = false; root.add(sp); return (CAT.sp[k] = sp); }
    function setCat(at, wear, inBox){ if(!window.SNOWBALL) return; const sp = catSprite(inBox ? 'peek' : 'sit', wear); if(CAT.cur && CAT.cur !== sp) CAT.cur.visible = false; CAT.cur = sp; if(!at){ sp.visible = false; return; } sp.position.set(at[0], at[1], at[2]); sp.visible = true; }

    /* ---------- wiring it together ---------- */
    const FEAT = {
      roof: {sig: S => S.lights, build: buildRoof}, door: {sig: S => S.door, build: buildDoor}, hang: {sig: S => S.hang, build: buildHang}, path: {sig: S => (S.path || []).slice().sort().join(), build: buildPath},
      win: {sig: (S, c) => (S.win || []).slice().sort().join() + (c.inside ? '|in' : '|out') + (S.menorahLit || ''), build: buildWin}, tree: {sig: S => S.tree + '|' + S.topper, build: buildTree}, room: {sig: S => (S.room || []).slice().sort().join(), build: buildRoom},
      oak: {sig: S => S.oak, build: buildOak}, ter: {sig: S => (S.ter || []).slice().sort().join(), build: buildTer}, yard: {sig: S => S.weather + '|' + S.yard, build: buildWeather},
      /* second layers, set only by the tour's holiday dress, so it can show and hide parts on their own (the beam garland with the roof, the strings in the oak with the trees) */
      room2: {sig: S => (S.room2 || []).slice().sort().join(), build: (S, c) => S.room2 && S.room2.length ? buildRoom({room: S.room2}, c) : null}, ter2: {sig: S => (S.ter2 || []).slice().sort().join(), build: S => S.ter2 && S.ter2.length ? buildTer({ter: S.ter2}) : null},
      oakFront: {sig: S => S.oakFront ? '1' : '', build: buildOakFront}};
    const LIVE = {};
    function bake(g){ const by = new Map(), list = [], v = new V3(), nm = new THREE.Matrix3(); g.updateMatrixWorld(true);
      g.traverse(o => { if(!o.isMesh || o.isInstancedMesh || o.userData.own) return; const m = o.material; if(!m || Array.isArray(m) || m.transparent || !o.geometry || !o.geometry.attributes.position) return; list.push(o); });
      if(list.length < 3) return;
      list.forEach(o => { let e = by.get(o.material); if(!e) by.set(o.material, e = {pos: [], nor: [], uv: []}); const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, P = geo.attributes.position, N = geo.attributes.normal, T = geo.attributes.uv; nm.getNormalMatrix(o.matrixWorld);
        for(let i = 0; i < P.count; i++){ v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); e.pos.push(v.x, v.y, v.z); if(N) v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); else v.set(0, 1, 0); e.nor.push(v.x, v.y, v.z); e.uv.push(T ? T.getX(i) : 0, T ? T.getY(i) : 0); }
        if(geo !== o.geometry) geo.dispose(); if(o.parent) o.parent.remove(o); });
      by.forEach((e, m) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(e.pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(e.nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(e.uv, 2)); const me = new THREE.Mesh(geo, m); me.userData.own = true; g.add(me); }); }
    function scrap(g){ g.userData.sets.forEach(s => { SETS.delete(s); if(s.flames) FLICK.delete(s.flames); }); if(g.parent) g.parent.remove(g);
      g.traverse(o => { if(o.userData.own && o.geometry && o.geometry.dispose) o.geometry.dispose(); if(o.isInstancedMesh){ FLICK.delete(o); if(o.dispose) o.dispose(); } const m = o.material; if(m && m.userData && m.userData.own) m.dispose(); }); }
    function kill(k){ const L = LIVE[k]; if(!L || !L.g) return; scrap(L.g); L.g = null; }
    /* the tour only: find the ground under everything a state stands on the walk, a few rays per frame, before it is built (a ray into the terrain takes about 30 ms) */
    function prewarm(S, done){ const rec = REC = []; let g = null; try{ g = buildPath(S); }catch(e){} REC = null; if(g) try{ scrap(g); }catch(e){} let i = 0;
      (function step(){ const t0 = performance.now(); while(i < rec.length && performance.now() - t0 < 34){ const q = rec[i++]; if(!FY.has(q[3])){ const h = down(q[0], q[1], q[2]); FY.set(q[3], h ? h.point.y : null); } } if(i < rec.length) requestAnimationFrame(step); else if(done) done(rec.length); })(); }
    function apply(S, ctx){ ctx = ctx || {}; const changed = []; for(const k in FEAT){ const f = FEAT[k], sig = f.sig(S, ctx); if(LIVE[k] && LIVE[k].sig === sig) continue; kill(k); let g = null; try{ g = f.build(S, ctx); }catch(e){ console.warn('[deck3d] ' + k, e); }
        LIVE[k] = {sig, g}; if(g){ try{ bake(g); }catch(e){ console.warn('[deck3d] bake ' + k, e); } g.traverse(o => { o.raycast = noop; }); root.add(g); changed.push(k); } }
      const mode = MODES[S.motion] == null ? 1 : MODES[S.motion]; if(LIVE.roof && LIVE.roof.g) LIVE.roof.g.userData.sets.forEach(s => { s.mat.uniforms.uMode.value = reduce ? 0 : mode; });
      return changed; }
    function setOn(v){ ON = v; SETS.forEach(s => applyOn(s, v)); }
    /* switch everything on in order: roofline, then the doors and windows, the path, the rooms, and the toppers last */
    function lightUp(onStep, onDone){ const sets = Array.from(SETS).sort((a, b) => a.seq - b.seq); ON = 1; let t = 250; const groups = {}; sets.forEach(s => { (groups[s.seq] = groups[s.seq] || []).push(s); }); const keys = Object.keys(groups).map(Number).sort((a, b) => a - b); let i = 0;
      keys.forEach(k => groups[k].forEach((s, j) => { const at = t; t += reduce ? 60 : (j < 3 ? 420 : 140); setTimeout(() => { const t0 = performance.now(); (function f(){ const q = Math.min(1, (performance.now() - t0) / (reduce ? 1 : 520)); applyOn(s, q * q * (3 - 2 * q)); if(q < 1 && SETS.has(s)) requestAnimationFrame(f); })(); if(onStep) onStep(i++, k); }, at); }));
      setTimeout(() => { setOn(1); if(onDone) onDone(); }, t + 600); return t + 600; }
    const SKY = {afternoon: [[1.02, 1, .97], [.5, .46, .4]], golden: [[.95, .86, .78], [.75, .5, .3]], dusk: [[.3, .34, .46], [.1, .06, .04]], morning: [[1, 1, 1], [.5, .48, .44]], midday: [[1.05, 1.05, 1.05], [.5, .5, .48]]};
    function tick(t, tod){ U.time.value = t; flick(t); const night = tod === 'dusk'; U.halo.value = night ? 1 : .5; porch.intensity = night ? .85 : 0; const k = SKY[tod] || SKY.afternoon; SNOW.u.uLight.value.setRGB(k[0][0], k[0][1], k[0][2]); SNOW.u.uSunC.value.setRGB(k[1][0] * .5, k[1][1] * .5, k[1][2] * .5); if(H.SUN_DIR) SNOW.u.uSun.value.copy(H.SUN_DIR);
      if(SNOW.fall && SNOW.fall.visible) SNOW.fall.material.uniforms.uCam.value.copy(H.camera.position); for(const key in LIVE){ const g = LIVE[key].g; if(g && g.userData.tick) g.userData.tick(t); } }
    function count(){ let pts = 0, meshes = 0; root.traverse(o => { if(o.isPoints) pts += o.geometry.attributes.position.count; if(o.isMesh) meshes++; }); return {points: pts, meshes, sets: SETS.size}; }
    return {root, apply, setOn, lightUp, tick, setCat, count, oakInfo, floorY, prewarm, group: k => (LIVE[k] && LIVE[k].g) || null, BOX_AT, TREE_AT, SNOWMAN_AT, get on(){ return ON; }};
  };
})();
