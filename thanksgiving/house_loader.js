/* bim2 house loader (WS5) — loads the compiled scene package (scene.glb + scene.meta.json) into a three.js r128 page and
   answers every semantic question the page used to guess from geometry, by LOOKUP into the meta data:
     which space / tour room is a point in, is it indoors, which floor surface is under it, how high is the ceiling,
     which element does a picked triangle belong to, which walls / colliders / doors exist.
   DESIGN.md §0 rule: the page performs no geometric reasoning about semantics. Everything here is point-in-polygon or
   plane evaluation on authored/compiled data; nothing samples rendered geometry.

   Frames. Meta polygons are BIM plan feet (x = east, y = north), z = up, absolute (storey elevation already applied).
   three.js world = W2(x, y) = [y, x] with y up, i.e. world (X, Y, Z) = (bimY, bimZ, bimX). The GLB is already in world frame.

   No page globals are read or written: the page hands in THREE and its hooks (material mapping, group attach).
   window.BIM2 is the single export.                                                                                       */
(function(root){
  'use strict';
  const VERSION = '0.2.0';
  const EPS = 1e-6;

  /* ---------- geometry helpers (exact, on data) ---------- */
  function inPoly(P, x, y){ let c = false; for(let i = 0, j = P.length - 1; i < P.length; j = i++){ const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
      if(((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + EPS * (yj === yi)) + xi)) c = !c; } return c; }
  function bbox(P){ let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for(const p of P){ if(p[0] < x0) x0 = p[0]; if(p[0] > x1) x1 = p[0]; if(p[1] < y0) y0 = p[1]; if(p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; }
  function inBox(b, x, y, m){ m = m || 0; return x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m; }
  function area(P){ let a = 0; for(let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1]; return a / 2; }
  const plane = (pl, x, y) => pl.c + (pl.gx || 0) * x + (pl.gy || 0) * y;
  const W2 = (x, y) => [y, x];             // BIM plan -> world (X, Z)
  const P2 = (X, Z) => [Z, X];             // world (X, Z) -> BIM plan

  /* ---------- meta normalisation: accept the §3.3/§3.4 spellings, produce one internal shape ---------- */
  function num(v, d){ return typeof v === 'number' && isFinite(v) ? v : d; }
  function planeOf(p){ if(!p) return null; const q = p.P || p.plane || p; if(typeof q.c !== 'number') return null; return {c: q.c, gx: num(q.gx, 0), gy: num(q.gy, 0)}; }
  function normalize(meta){
    if(!meta || typeof meta !== 'object') throw new Error('bim2: scene meta missing');
    const fmt = meta.format || ''; if(fmt && !/scene-meta/.test(fmt)) throw new Error('bim2: not a scene meta file (format ' + fmt + ')');
    const storeys = (meta.storeys || []).map(s => ({id: s.id, name: s.name, elevation: num(s.elevation, 0), height: num(s.height, null), cut: num(s.cut, null)}));
    const stOf = Object.fromEntries(storeys.map(s => [s.id, s]));
    const spaces = (meta.spaces || []).map(s => {
      const poly = s.polygon || s.poly || s.outline; if(!poly || poly.length < 3) throw new Error('bim2: space ' + s.id + ' has no polygon');
      const st = stOf[s.storey] || {elevation: 0};
      const floorZ = num(s.floorZ, num(s.floor && s.floor.z, st.elevation));
      const c = s.ceiling || {}; const planes = (c.planes || []).map(p => ({poly: p.poly || p.polygon || null, pl: planeOf(p)})).filter(p => p.pl);
      for(const p of planes) p.bb = p.poly ? bbox(p.poly) : null;
      const flatH = num(c.height, null);   // FLAT {height} relative to floor
      const interior = s.interior != null ? !!s.interior : !(s.exterior || s.openAir || c.form === 'NONE');
      const holes = (s.holes || []).filter(h => h && h.length > 2);
      return {id: s.id, name: s.name || s.id, storey: s.storey, tourRoom: s.tourRoom || null, floorZ, poly, holes, bb: bbox(poly), area: Math.abs(area(poly)) - holes.reduce((t, h) => t + Math.abs(area(h)), 0),
        ceilingForm: c.form || (planes.length ? 'PLANES' : flatH != null ? 'FLAT' : 'UNKNOWN'), planes, flatH,
        topZ: num(s.topZ, num(s.volume && s.volume.z1, null)), openTo: c.form === 'OPEN_TO' ? (c.space || c.to || null) : null,
        interior, openAir: !!(s.openAir || s.exterior), lightingZone: s.lightingZone || s.tourRoom || s.id, raw: s};
    });
    const walk = (meta.walkable || meta.walkables || []).map((w, i) => {
      const poly = w.poly || w.polygon; if(!poly) return null;
      return {id: w.id || ('WK-' + i), element: w.element || w.id || null, kind: (w.kind || 'FLOOR').toUpperCase(), poly, holes: (w.holes || []).filter(h => h && h.length > 2), bb: bbox(poly),
        z: num(w.z, null), pl: planeOf(w.plane), space: w.space || null, storey: w.storey || null, exterior: !!(w.exterior || w.deck)};
    }).filter(Boolean);
    const colliders = (meta.colliders || []).map((c, i) => {
      const poly = c.poly || c.polygon || (c.box ? [[c.box[0], c.box[1]], [c.box[2], c.box[1]], [c.box[2], c.box[3]], [c.box[0], c.box[3]]] : null); if(!poly) return null;
      return {id: c.id || ('CL-' + i), element: c.element || c.id || null, kind: (c.kind || 'WALL').toUpperCase(), poly, bb: bbox(poly), z0: num(c.z0, -1e3), z1: num(c.z1, 1e3), pass: !!c.pass, storey: c.storey || null, exterior: !!c.exterior};
    }).filter(Boolean);
    const openings = (meta.openings || []).map(o => ({id: o.id, cls: o.class || o.cls, kind: o.kind || o.type || '', host: o.host || null, storey: o.storey || null,
      center: o.center, axis: o.axis || [1, 0], normal: o.normal || null, width: num(o.width, 3), sill: num(o.sill, 0), head: num(o.head, 7), thickness: num(o.thickness, num(o.depth, .5)),
      spaces: o.spaces || {}, exterior: !!(o.exterior || o.isExternal), glazed: num(o.glazed, 0), leaf: o.leaf || null, raw: o}));
    return {format: meta.format, version: meta.version, source: meta.source || {}, glb: meta.glb || {}, storeys, spaces, walk, colliders, openings,
      lights: meta.lights || [], furnishings: meta.furnishings || [], materials: meta.materials || {}, groups: meta.groups || {}, stops: meta.stops || [],
      flights: meta.flights || [], extras: meta.extras || {}, roofs: meta.roofs || [], builtins: meta.builtins || [], slabs: meta.slabs || [], exteriorLights: meta.exteriorLights || null,
      options: (meta.options || []).map(o => Object.assign({}, o, {hide: o.hide || [], hideRanges: o.hideRanges || []})),
      boundaries: Array.isArray(meta.boundaries) ? Object.fromEntries(meta.boundaries.map(b => [b.id, b.space])) : (meta.boundaries || {}),
      cut: meta.cut || {}, site: meta.site || null, exteriorFaces: meta.exteriorFaces || []};   // FX 11/3: site.grade + kernel G1 exterior faces (rule:curb-above-grade)
  }

  /* ---------- queries (all on data) ---------- */
  function makeQueries(S){
    const SP = S.spaces;
    const ceilAt = (s, x, y) => {             // absolute z of the ceiling of space s over plan point (x, y), or null when unknown
      let best = null;
      for(const p of s.planes){ if(p.poly && !(inBox(p.bb, x, y, .01) && inPoly(p.poly, x, y))) continue; const z = plane(p.pl, x, y); if(best === null || z > best) best = z; }
      if(best !== null) return best;
      if(s.openTo && S.spaceById && S.spaceById[s.openTo] && S.spaceById[s.openTo] !== s){ const t = S.spaceById[s.openTo]; let lo = null;
        for(const p of t.planes){ const z = plane(p.pl, x, y); if(lo === null || z < lo) lo = z; }
        if(lo !== null) return lo; if(t.flatH != null) return t.floorZ + t.flatH; }
      if(s.flatH != null) return s.floorZ + s.flatH;
      if(s.topZ != null) return s.topZ;
      return null;
    };
    const topOf = (s, x, y) => { const c = ceilAt(s, x, y); if(c !== null) return c; const st = S.storeyOf[s.storey]; return s.floorZ + ((st && st.height) || 9); };
    const inHoles = (H, x, y) => { if(!H || !H.length) return false; for(const h of H) if(inPoly(h, x, y)) return true; return false; };
    const contains = (s, x, y) => inBox(s.bb, x, y) && inPoly(s.poly, x, y) && !inHoles(s.holes, x, y);
    /* the space whose air contains plan point (x, y) at absolute height z (highest floor wins where volumes stack) */
    function spaceAt(x, y, z, tol){ tol = tol == null ? .25 : tol; let b = null;
      for(const s of SP){ if(!contains(s, x, y)) continue; if(z < s.floorZ - tol) continue; if(z > topOf(s, x, y) + tol) continue; if(!b || s.floorZ > b.floorZ) b = s; }
      return b; }
    /* the space a person standing with feet at z is in (floor within reach below the feet) */
    function spaceUnderFeet(x, y, z){ let b = null; for(const s of SP){ if(!contains(s, x, y)) continue; if(s.floorZ > z + .6 || s.floorZ < z - 1.2) continue; if(!b || s.floorZ > b.floorZ) b = s; } return b; }
    /* every space whose plan polygon contains (x, y) on the given storey set */
    function spacesAtPlan(x, y, storeys){ return SP.filter(s => (!storeys || storeys.includes(s.storey)) && contains(s, x, y)); }
    function walkAt(x, y, lo, hi){            // highest walkable surface z in [lo, hi] at (x, y), or null
      let b = null; for(const w of S.walk){ if(!inBox(w.bb, x, y) || !inPoly(w.poly, x, y) || inHoles(w.holes, x, y)) continue; const z = w.pl ? plane(w.pl, x, y) : w.z; if(z == null) continue;
        if(z >= lo && z <= hi && (b === null || z > b)) b = z; } return b; }
    function walkRecAt(x, y, lo, hi){ let b = null, bz = null; for(const w of S.walk){ if(!inBox(w.bb, x, y) || !inPoly(w.poly, x, y) || inHoles(w.holes, x, y)) continue; const z = w.pl ? plane(w.pl, x, y) : w.z;
        if(z == null || z < lo || z > hi) continue; if(bz === null || z > bz){ bz = z; b = w; } } return b; }
    return {ceilAt, topOf, spaceAt, spaceUnderFeet, spacesAtPlan, walkAt, walkRecAt, contains};
  }

  /* interleaved vertex buffers (the kernel's option deltas use them) become plain attributes: page code that rebuilds geometry
     (dollhouse cut, merges) reads attribute.array */
  function deinterleave(g){ for(const k of Object.keys(g.attributes)){ const a = g.attributes[k]; if(!a.isInterleavedBufferAttribute) continue;
      const n = a.count, s = a.itemSize, out = new (a.array.constructor)(n * s), get = ['getX', 'getY', 'getZ', 'getW'];
      for(let i = 0; i < n; i++) for(let c = 0; c < s; c++) out[i * s + c] = a[get[c]](i);
      g.setAttribute(k, new T_.BufferAttribute(out, s, a.normalized)); } }
  /* ---------- picking: triangle -> element via extras.ranges ---------- */
  function elementOfFace(mesh, faceIndex){
    const R = mesh && mesh.userData && mesh.userData.bim2 && mesh.userData.bim2.ranges; if(!R || faceIndex == null) return null;
    let lo = 0, hi = R.length - 1; while(lo <= hi){ const m = (lo + hi) >> 1, r = R[m]; if(faceIndex < r[2]) hi = m - 1; else if(faceIndex >= r[2] + r[3]) lo = m + 1; else return {element: r[0], boundary: r[1] || null}; }
    return null; }

  /* ---------- loading ---------- */
  async function sha256Hex(buf){ try{ if(!(root.crypto && crypto.subtle)) return null; const h = await crypto.subtle.digest('SHA-256', buf); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); }catch(e){ return null; } }
  async function fetchBuf(url, fetchFn){ const r = await (fetchFn || fetch)(url); if(!r.ok) throw new Error('bim2: ' + url + ' ' + r.status); return r.arrayBuffer(); }

  /* opts: {THREE, glb: url, meta: url | object, mapMaterial(name, gltfMat, info) -> THREE.Material, groupOf(extras, info) -> string,
            attach(groupName, object3d), verifyHash: bool, fetch} */
  async function load(opts){
    const T = opts.THREE || root.THREE; if(!T) throw new Error('bim2: THREE missing'); T_ = T;
    if(!T.GLTFLoader) throw new Error('bim2: THREE.GLTFLoader missing (load examples/js/loaders/GLTFLoader.js for r128)');
    const t0 = (root.performance || Date).now();
    const metaBase = typeof opts.meta === 'string' && root.location ? new URL(opts.meta, root.location.href).href : (root.location ? root.location.href : '');
    const metaRaw = typeof opts.meta === 'string' ? JSON.parse(new TextDecoder().decode(await fetchBuf(opts.meta, opts.fetch))) : opts.meta;
    const meta = normalize(metaRaw);
    const buf = await fetchBuf(opts.glb, opts.fetch);
    const glbSha = opts.verifyHash !== false ? await sha256Hex(buf) : null;
    const want = meta.glb && (meta.glb.sha256 || meta.glb.hash);
    if(want && glbSha && want !== glbSha) console.warn('bim2: scene.glb sha256 ' + glbSha.slice(0, 12) + ' does not match meta glb.sha256 ' + String(want).slice(0, 12) + '; loading anyway');
    const gltf = await new Promise((res, rej) => new T.GLTFLoader().parse(buf, '', res, rej));
    const S = {version: VERSION, meta, gltf, glbSha, glbBytes: buf.byteLength, storeyOf: Object.fromEntries(meta.storeys.map(s => [s.id, s])),
      spaces: meta.spaces, walk: meta.walk, colliders: meta.colliders, openings: meta.openings, spaceById: Object.fromEntries(meta.spaces.map(s => [s.id, s])), metaBase,
      meshes: [], byGroup: {}, materials: new Map(), unmapped: new Set(), elementMeshes: new Map(), nTris: 0};
    const sceneRoot = gltf.scene || (gltf.scenes && gltf.scenes[0]);
    const list = []; sceneRoot.updateMatrixWorld(true);
    sceneRoot.traverse(o => { if(o.isMesh) list.push(o); });
    for(const m of list){
      // extras live on the node (userData) or on the mesh (glTF mesh.extras -> geometry.userData? r128 puts node extras in userData)
      const ex = Object.assign({}, (m.parent && m.parent.userData) || {}, m.userData || {});
      const info = {name: m.name, group: ex.group || 'walls', storey: ex.storey || null, material: ex.material || (m.material && m.material.name) || '', ranges: ex.ranges || [], ex};
      info.ranges.sort((a, b) => a[2] - b[2]);
      const key = info.material; let mat = S.materials.get(key);
      if(mat === undefined){ mat = opts.mapMaterial ? opts.mapMaterial(key, m.material, info, meta.materials[key.split('#')[0]] || null, meta.materials[key] || null) : null; if(!mat){ S.unmapped.add(key); mat = m.material; } S.materials.set(key, mat); }
      m.material = mat;
      deinterleave(m.geometry); m.geometry.applyMatrix4(m.matrixWorld); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); m.updateMatrix();
      if(!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
      m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox();
      m.castShadow = !(mat && mat.transparent); m.receiveShadow = true;
      m.userData = {bim2: info, el: info.ranges.length === 1 ? info.ranges[0][0] : undefined}; GEO0.set(m, m.geometry);
      const g = opts.groupOf ? opts.groupOf(info.ex, info) : info.group;
      (S.byGroup[g] = S.byGroup[g] || []).push(m);
      if(opts.attach) opts.attach(g, m);
      S.meshes.push(m);
      const nt = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; S.nTris += nt;
      for(const r of info.ranges){ const a = S.elementMeshes.get(r[0]) || []; a.push(m); S.elementMeshes.set(r[0], a); }
    }
    Object.assign(S, makeQueries(S));
    S.loadMs = Math.round((root.performance || Date).now() - t0);
    API.state = S; return S;
  }

  /* ---------- design options: hide elements of the merged meshes by their exact triangle ranges; option packages add meshes ---------- */
  function hiddenIndex(m, hide, g, I){        // a copy of the mesh's index with the triangles of hidden elements collapsed (degenerate)
    const R = m.userData.bim2.ranges; if(!I) return null; let arr = null;
    for(const r of R){ if(!hide.has(r[0]) && !(r[1] && hide.has(r[0] + '|' + r[1]))) continue; if(!arr) arr = I.array.slice(); const a0 = r[2] * 3, a1 = (r[2] + r[3]) * 3; for(let k = a0; k < a1; k++) arr[k] = arr[a0]; }
    return arr ? new (T_ || root.THREE).BufferAttribute(arr, 1) : null; }
  let T_ = null;
  const GEO0 = new WeakMap();                 // the as-loaded geometry of each package mesh (the page may swap m.geometry, e.g. the dollhouse cut)
  function setVariant(key){                   // show option `key` (null / 'asbuilt' = the as-built package); returns true when it changed
    const S = st(); const opt = key && S.meta.options.find(o => o.id === key || o.legacyId === key);
    const hide = new Set(opt ? (opt.hide || []).concat((opt.hideRanges || []).map(h => h[0] + '|' + h[1])) : []), ck = opt ? opt.id : '';
    if((S._var || '') === ck) return false; S._var = ck;
    for(const m of S.meshes){ const u = m.userData; if(u.bim2.option) continue; const g = GEO0.get(m) || m.geometry;
      if(!u.idx0) u.idx0 = g.index;
      let alt = u.alt && u.alt[ck]; if(alt === undefined){ alt = hide.size ? hiddenIndex(m, hide, g, u.idx0) : null; (u.alt = u.alt || {})[ck] = alt; }
      g.setIndex(alt || u.idx0); }
    return true; }
  async function loadOptions(o, only){        // o: {fetch, mapMaterial, groupOf, attach(group, mesh, optionId)}; only: one option id / legacyId
    const S = st(); const T = T_; S.optionLoaded = S.optionLoaded || {};
    for(const opt of S.meta.options){ if(!opt.glb || (only && opt.id !== only && opt.legacyId !== only) || S.optionLoaded[opt.id]) continue; S.optionLoaded[opt.id] = 'loading'; try{
        if(opt.meta && !opt.data){ const mb = await fetchBuf(S.metaBase ? new URL(opt.meta, S.metaBase).href : opt.meta, o.fetch); opt.data = JSON.parse(new TextDecoder().decode(mb)); }
        const buf = await fetchBuf(S.metaBase ? new URL(opt.glb, S.metaBase).href : opt.glb, o.fetch); const gl = await new Promise((res, rej) => new T.GLTFLoader().parse(buf, '', res, rej)); const sc = gl.scene || gl.scenes[0]; sc.updateMatrixWorld(true);
        const L = []; sc.traverse(x => { if(x.isMesh) L.push(x); });
        for(const m of L){ const ex = Object.assign({}, (m.parent && m.parent.userData) || {}, m.userData || {}); const info = {group: ex.group || 'walls', storey: ex.storey || null, material: ex.material || '', ranges: (ex.ranges || []).sort((a, b) => a[2] - b[2]), ex, option: opt.id};
          let mat = S.materials.get(info.material); if(mat === undefined){ mat = (o.mapMaterial && o.mapMaterial(info.material, m.material, info, S.meta.materials[info.material.split('#')[0]] || null, S.meta.materials[info.material] || null)) || m.material; S.materials.set(info.material, mat); }
          m.material = mat; deinterleave(m.geometry); m.geometry.applyMatrix4(m.matrixWorld); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); m.updateMatrix(); m.geometry.computeBoundingSphere();
          m.castShadow = true; m.receiveShadow = true; m.userData = {bim2: info};
          if(o.attach) o.attach(o.groupOf ? o.groupOf(ex, info) : info.group, m, opt.legacyId || opt.id); (S.optionMeshes = S.optionMeshes || []).push(m); }
        S.optionLoaded[opt.id] = 'ok';
      }catch(e){ S.optionLoaded[opt.id] = 'failed'; console.warn('[bim2] option package', opt.id, e); } } }

  /* ---------- world-frame façade (what the page calls) ---------- */
  const st = () => { if(!API.state) throw new Error('bim2: not loaded'); return API.state; };
  const API = {
    VERSION, state: null, load, normalize, inPoly, W2, P2, elementOfFace, setVariant, loadOptions,
    options(){ const S = st(); return S.meta.options.map(o => ({id: o.id, legacyId: o.legacyId || null, set: o.set || null, name: o.name || o.id, note: o.note || null,
      hide: (o.hide || []).length + (o.hideRanges || []).length, glb: o.glb || null, loaded: (S.optionLoaded || {})[o.id] || null})); },
    option(key){ return st().meta.options.find(o => o.id === key || o.legacyId === key) || null; },
    /* space containing world point (X, Y, Z) */
    spaceAtWorld(X, Y, Z){ const [x, y] = P2(X, Z); return st().spaceAt(x, y, Y); },
    /* tour room id at world point, by the space it is in (null when the space has no tour room) */
    tourRoomAtWorld(X, Y, Z){ const s = API.spaceAtWorld(X, Y, Z); return s ? s.tourRoom : null; },
    /* indoors = inside the air of an interior space (balcony / porch / decks are exterior spaces or no space) */
    isIndoorWorld(X, Y, Z){ const s = API.spaceAtWorld(X, Y, Z); return !!(s && s.interior); },
    /* plan-only test: is (X, Z) inside any interior space's footprint on any storey (pad m ft) */
    inFootprintWorld(X, Z, m){ const [x, y] = P2(X, Z); m = m || 0; for(const s of st().spaces){ if(!s.interior) continue; if(!inBox(s.bb, x, y, m)) continue; if(m > 0 || inPoly(s.poly, x, y)) return true; } return false; },
    /* highest walkable surface at or below feetY + reach (null when none: caller falls back to terrain) */
    walkAtWorld(X, Z, feetY, reach){ const [x, y] = P2(X, Z); return st().walkAt(x, y, -1e4, feetY + (reach == null ? 1.7 : reach)); },
    ceilingAtWorld(X, Y, Z){ const S = st(), [x, y] = P2(X, Z), s = S.spaceAt(x, y, Y); return s ? S.ceilAt(s, x, y) : null; },
    spaceById(id){ return st().spaceById[id] || null; },
    meshesOf(id){ return st().elementMeshes.get(id) || []; },
    pick(hit){ return hit && hit.object ? elementOfFace(hit.object, hit.faceIndex) : null; },
    /* the space a triangle's face bounds (2nd-level boundary -> space), or null when the package has no boundary for it */
    triSpace(mesh, t){ const S = API.state; if(!S) return null; const e = elementOfFace(mesh, t); if(!e || !e.boundary) return null;
      const sid = S.meta.boundaries[e.boundary]; return sid ? S.spaceById[sid] || null : null; },
    /* what decides the dollhouse section of triangle t: {space} (the space its boundary bounds, or the space / storey the
       compiled model ties its element to: meta.cut), {remove: true} (it goes with the roof), or null (no data) */
    cutTarget(mesh, t){ const S = API.state; if(!S) return null; const e = elementOfFace(mesh, t); if(!e) return null;
      const ok = mesh.userData.bim2.option, O = ok ? API.option(ok) : null, D = O ? O.data || {} : null;   // an option's mesh: the option's own maps
      if(ok && !(D && (D.boundaries || D.cut))) return null;                                          // (never the as-built ids: they differ per compile)
      const M = D ? {boundaries: D.boundaries || {}, cut: D.cut || {}} : S.meta, k = (e.boundary && (M.boundaries[e.boundary] || M.cut[e.boundary])) || M.cut[e.element]; if(!k) return null;
      if(k === '!') return {remove: true};
      if(k[0] === '@'){ const s = S.storeyOf[k.slice(1)]; return s ? {space: {id: k, storey: s.id, floorZ: s.elevation, interior: true}} : null; }
      if(D){ const r = (D.spaces || []).find(q => q.id === k); if(!r) return null; const st = S.storeyOf[r.storey] || {elevation: 0};
        return {space: {id: r.id, storey: r.storey, floorZ: num(r.floorZ, st.elevation), interior: r.interior != null ? !!r.interior : !(r.exterior || r.openAir)}}; }
      const sp = S.spaceById[k]; return sp ? {space: sp} : null; },
    /* compat records in the shapes the v22 page code consumes (world frame) — built once from meta, never from geometry */
    compat(){ const S = st(); if(S._compat) return S._compat; return (S._compat = compatOf(S, S)); },
    /* the same compat records for an option's own run-time data (opt.data, fetched by loadOptions) */
    compatOption(key){ const S = st(), o = API.option(key); if(!o || !o.data) return null; if(o._compat) return o._compat;
      const N = normalize(Object.assign({format: 'scene-meta', storeys: S.meta.storeys}, o.data, {options: []}));
      return (o._compat = compatOf(S, {spaces: N.spaces, walk: N.walk, colliders: N.colliders, openings: N.openings})); },
    summary(){ const S = st(); const g = {}; for(const k in S.byGroup) g[k] = S.byGroup[k].length;
      return {version: VERSION, source: S.meta.source, glbSha256: S.glbSha, glbBytes: S.glbBytes, meshes: S.meshes.length, tris: S.nTris, groups: g, spaces: S.spaces.length,
        walkable: S.walk.length, colliders: S.colliders.length, openings: S.openings.length, unmappedMaterials: Array.from(S.unmapped), loadMs: S.loadMs,
        options: S.meta.options.length, optionsLoaded: Object.assign({}, S.optionLoaded || {})}; }
  };
  /* compat records in the shapes the v22 page code consumes (world frame) - built from meta data D (the package or an option), never from geometry */
  function compatOf(S, D){
      const wp = P => P.map(([x, y]) => W2(x, y));
      const box = P => { const xs = P.map(p => p[0]), zs = P.map(p => p[1]); return {x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs)}; };
      const upper = id => { const s = S.storeyOf[id]; return !!(s && /L2|upper/i.test(s.id + ' ' + (s.name || ''))); };
      const FLOORS = D.walk.filter(w => !w.pl && w.z != null).map(w => { const poly = wp(w.poly); return Object.assign({poly, holes: w.holes.length ? w.holes.map(wp) : null, y: w.z, deck: w.exterior, up: upper(w.storey) || w.z > 4, bim2: w.id, kind: w.kind, space: w.space}, box(poly)); });
      const RAMPS = D.walk.filter(w => w.pl).map(w => { const poly = wp(w.poly), b = box(poly); const pl = w.pl;
        // a plane ramp: height along its steeper world axis (BIM gy -> world x, BIM gx -> world z)
        const axis = Math.abs(pl.gy) >= Math.abs(pl.gx) ? 'x' : 'z';
        const zAt = (X, Z) => plane(pl, Z, X);
        const from = axis === 'x' ? b.x0 : b.z0, to = axis === 'x' ? b.x1 : b.z1, mid = axis === 'x' ? (b.z0 + b.z1) / 2 : (b.x0 + b.x1) / 2;
        const hA = axis === 'x' ? zAt(from, mid) : zAt(mid, from), hB = axis === 'x' ? zAt(to, mid) : zAt(mid, to);
        return Object.assign({axis, from, to, hA, hB, bim2: w.id, poly}, b); });
      const COLLIDERS = D.colliders.map(c => { const poly = wp(c.poly); return Object.assign({y0: c.z0, y1: c.z1, top: c.z1, pass: c.pass, bim2: c.element, kind: c.kind, poly}, box(poly)); });
      const SPACES = D.spaces.map(s => ({id: s.id, pts: wp(s.poly), floor: s.floorZ, storey: s.storey, name: s.name, roomId: s.tourRoom, rooms: s.tourRoom ? [s.tourRoom] : [], interior: s.interior, bim2: s}));
      const WALLGEO = D.colliders.filter(c => c.kind === 'WALL').map(c => { const pts = wp(c.poly), b = box(pts);
        const rect = pts.length === 4 && pts.every((p, i) => { const q = pts[(i + 1) % 4]; return Math.abs(p[0] - q[0]) < .01 || Math.abs(p[1] - q[1]) < .01; });
        return {w: {id: c.element, z0: c.z0, z1: c.z1, isExternal: c.exterior}, pts, rect, bx0: b.x0, bx1: b.x1, bz0: b.z0, bz1: b.z1, z0: c.z0, z1: c.z1}; });
      const OPENRECTS = D.openings.filter(o => o.center).map(o => { const [cx, cz] = W2(o.center[0], o.center[1]), u = W2(o.axis[0], o.axis[1]), horiz = Math.abs(u[0]) > .5, hw = o.width / 2 - .02, ht = o.thickness / 2 + .05;
        const r = horiz ? [cx - hw, cz - ht, cx + hw, cz + ht, o.sill, o.head] : [cx - ht, cz - hw, cx + ht, cz + hw, o.sill, o.head]; r.id = o.id; r.ext = o.exterior; return r; });
      return {FLOORS, RAMPS, COLLIDERS, SPACES, WALLGEO, OPENRECTS};
  }
  API._test = {makeQueries, compatOf, hiddenIndex};   // unit tests (web/tests) only
  root.BIM2 = API;
})(typeof window !== 'undefined' ? window : globalThis);
