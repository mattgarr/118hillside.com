/* aobake step 1: load the tour page headless (no drawing) and export the geometry the bake needs, as the page builds it.
     node export_page.js <scene> <out.bin>        scene: asbuilt | open4k | jan24 | apr24b
   Exported (world frame, feet):
     - every bim2 package mesh the scene shows (as-built meshes, plus the idea's own meshes): its name, its vertex positions after the
       page's load-time edits (r41 jog flattening moves a few wall vertices up to 3") and its CURRENT index (hidden elements of an idea
       are collapsed triangles, page-appended faces included);
     - occluders the page builds in code and that never move: kitchen / bath cabinets, counters, built-ins, stairs and rails the page
       adds, appliances that are fixtures (userData.category 'fixture' / 'builtin'). NOT exported: staged furniture
       (category 'furniture', and fixture `contents`), decals (r13 / r17 / contact / noAO), glass and other transparent surfaces,
       emissive lamps, landscape, trees, terrain.
   Needs Playwright (NODE_PATH or a global install; /opt/npm-tools in the agent container) and network for the three.js CDN files
   (or THREE_DIR=<a three@0.128.0 package dir> to serve them locally). */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; try{ ({chromium} = require('playwright')); }catch(e){ ({chromium} = require('/opt/npm-tools/node_modules/playwright')); }
const ROOT = path.resolve(__dirname, '../../../..');            // repo root (serves /tour/...)
const scene = process.argv[2] || 'asbuilt', out = process.argv[3];
if(!out){ console.error('usage: node export_page.js <asbuilt|open4k|jan24|apr24b> <out.bin>'); process.exit(2); }
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css', '.bin': 'application/octet-stream', '.txt': 'text/plain', '.mp3': 'audio/mpeg'};
const srv = http.createServer((q, r) => { try{ const u = decodeURIComponent(q.url.split('?')[0]); let f = path.join(ROOT, u); if(!f.startsWith(ROOT)){ r.writeHead(403); return r.end(); }
    if(fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if(!fs.existsSync(f)){ r.writeHead(404); return r.end(); }
    r.writeHead(200, {'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store'}); fs.createReadStream(f).pipe(r); }catch(e){ r.writeHead(500); r.end(); } });

(async () => {
  await new Promise(res => srv.listen(0, '127.0.0.1', res)); const PORT = srv.address().port, BASE = 'http://127.0.0.1:' + PORT;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const b = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], proxy: proxy ? {server: proxy, bypass: '127.0.0.1'} : undefined});
  const c = await b.newContext({viewport: {width: 1000, height: 700}, deviceScaleFactor: 1});
  const TD = process.env.THREE_DIR;
  if(TD){ await c.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/, r => r.fulfill({path: path.join(TD, 'build/three.min.js'), contentType: 'text/javascript'}));
    await c.route(/cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/(.*)/, r => r.fulfill({path: path.join(TD, r.request().url().split('three@0.128.0/')[1]), contentType: 'text/javascript'})); }
  await c.route(/googletagmanager|google-analytics|fonts\.g(oogleapis|static)/, r => r.abort());
  const p = await c.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  // no drawing: the export needs the scene graph, not pixels (software GL is slow)
  await p.addInitScript(() => { const gc = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(t){ const g = gc.apply(this, arguments);
      if(g && /webgl/.test(t) && !g.__nd){ g.__nd = 1; for(const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) g[k] = function(){}; } return g; }; });
  const t0 = Date.now();
  await p.goto(BASE + '/tour/index.html?qa=1&nointro=1&ao=0', {waitUntil: 'load', timeout: 900000});
  await p.waitForFunction(() => { const L = document.getElementById('loading'); return window.__TOUR && window.BIM2 && BIM2.state && (!L || L.classList.contains('done')); }, null, {timeout: 900000, polling: 500});
  console.log('page ready', Date.now() - t0, 'ms');
  if(scene !== 'asbuilt'){
    await p.evaluate(id => window.IT46.show(id), scene);
    await p.waitForFunction(id => { const S = BIM2.state; return S && S.optionLoaded && Object.keys(S.optionLoaded).some(k => k.endsWith(id) && S.optionLoaded[k] === 'ok'); }, scene, {timeout: 600000, polling: 500});
  }
  await p.waitForTimeout(8000);   // idle-time builds (r42 alcove faces, r13) settle
  const res = await p.evaluate(sceneId => {
    const S = BIM2.state, sc = window.__TOUR.scene; sc.updateMatrixWorld(true);
    const b64 = u8 => { let s = ''; const CH = 0x8000; for(let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); };
    const optId = sceneId === 'asbuilt' ? null : S.meta.options.find(o => o.id.endsWith(sceneId) || o.legacyId === sceneId).id;
    const pkg = [], pkgSet = new Set();
    const add = (m, opt) => { pkgSet.add(m); const g = m.geometry, P = g.attributes.position, I = g.index; m.updateMatrixWorld(true);
      const pos = new Float32Array(P.count * 3); const E = m.matrixWorld.elements;
      for(let i = 0; i < P.count; i++){ const x = P.getX(i), y = P.getY(i), z = P.getZ(i); pos[3 * i] = E[0] * x + E[4] * y + E[8] * z + E[12]; pos[3 * i + 1] = E[1] * x + E[5] * y + E[9] * z + E[13]; pos[3 * i + 2] = E[2] * x + E[6] * y + E[10] * z + E[14]; }
      const idx = I ? new Uint32Array(I.array) : null;
      let vis = true; for(let o = m; o; o = o.parent) if(!o.visible) vis = false;
      pkg.push({name: m.name, opt: opt || null, n: P.count, vis, pos: b64(new Uint8Array(pos.buffer)), idx: idx ? b64(new Uint8Array(idx.buffer)) : null}); };
    for(const m of S.meshes) add(m, null);
    for(const m of (S.optionMeshes || [])) if(m.userData.bim2.option === optId) add(m, optId); else pkgSet.add(m);
    const SKIPG = /^(trees|hills|terrain|land|landscape)(@|$)/;
    const vis = o => { for(; o; o = o.parent) if(!o.visible) return false; return true; };
    const why = {}, objs = [], T = [];
    const M4 = new THREE.Matrix4(), IM = new THREE.Matrix4();
    sc.traverse(o => { if(!o.isMesh || pkgSet.has(o) || o.isSkinnedMesh) return; const g = o.geometry; if(!g || !g.attributes || !g.attributes.position) return;
      let top = o; while(top.parent && top.parent !== sc) top = top.parent; const tg = top.name || '';
      let reason = null, cat = null, kind = null;
      for(let q = o; q; q = q.parent){ const u = q.userData || {}; if(u.contents) reason = reason || 'contents'; if(u.noAO) reason = reason || 'noAO'; if(cat == null && u.category){ cat = u.category; kind = u.kind || null; } }
      const mat = Array.isArray(o.material) ? o.material[0] : o.material, n = (o.name || '') + ' ' + ((mat && mat.name) || '');
      if(!reason && !vis(o)) reason = 'hidden';
      if(!reason && SKIPG.test(tg)) reason = 'group:' + tg.split('@')[0];
      if(!reason && (/^r1[37]-|^r49|contact|k28ao|r13Occlusion|sheen|glow|_led|halo|wash|decal|shadow/i.test(n))) reason = 'decal';
      if(!reason && (!mat || mat.visible === false)) reason = 'nomat';
      if(!reason && (mat.type === 'ShaderMaterial' || mat.type === 'RawShaderMaterial' || mat.type === 'PointsMaterial' || mat.type === 'LineBasicMaterial')) reason = 'shader';
      if(!reason && (/glass/i.test(n) || mat.transparent && (mat.opacity < .9 || /skylight|acrylic|film|water|mirror/i.test(n)))) reason = 'transparent';
      if(!reason && mat.blending !== THREE.NormalBlending) reason = 'blend';
      if(!reason && mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) * (mat.emissiveIntensity == null ? 1 : mat.emissiveIntensity) > .6) reason = 'emissive';
      if(!reason && mat.type === 'MeshBasicMaterial') reason = 'basic';
      if(reason){ why[reason] = (why[reason] || 0) + 1; return; }
      const pos = g.attributes.position, idx = g.index, d = g.drawRange, nn = idx ? idx.count : pos.count, a = Math.max(0, d.start), bnd = Math.min(nn, d.start + d.count);
      const inst = o.isInstancedMesh ? o.count : 1, t0 = T.length / 9;
      for(let ii = 0; ii < inst; ii++){ if(o.isInstancedMesh){ o.getMatrixAt(ii, IM); M4.multiplyMatrices(o.matrixWorld, IM); } else M4.copy(o.matrixWorld); const E = M4.elements;
        for(let j = a; j + 2 < bnd; j += 3) for(let q = 0; q < 3; q++){ const vi = idx ? idx.getX(j + q) : j + q; const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
          T.push(E[0] * x + E[4] * y + E[8] * z + E[12], E[1] * x + E[5] * y + E[9] * z + E[13], E[2] * x + E[6] * y + E[10] * z + E[14]); } }
      objs.push({group: tg.split('@')[0], cat, kind, name: o.name || (o.parent && o.parent.name) || '', mat: (mat && mat.name) || '', t0, nt: T.length / 9 - t0}); });
    const f = new Float32Array(T);
    return {scene: sceneId, option: optId, glbSha: S.glbSha, optionSha: S.optionSha || null, pkg, occ: b64(new Uint8Array(f.buffer)), occTris: f.length / 9, why, objs};
  }, scene);
  // binary: 4-byte json length, json (with base64 blobs moved out), then blobs
  const blobs = []; const put = s => { const buf = Buffer.from(s, 'base64'); const o = {off: 0, len: buf.length}; blobs.push([o, buf]); return o; };
  for(const m of res.pkg){ m.pos = put(m.pos); if(m.idx) m.idx = put(m.idx); }
  res.occ = put(res.occ);
  let off = 0; for(const [o, buf] of blobs){ o.off = off; off += buf.length; }
  const js = Buffer.from(JSON.stringify(res)); const hdr = Buffer.alloc(4); hdr.writeUInt32LE(js.length);
  fs.writeFileSync(out, Buffer.concat([hdr, js, ...blobs.map(x => x[1])]));
  console.log('exported', scene, 'pkg meshes', res.pkg.length, 'occluder tris', res.occTris, 'skipped', JSON.stringify(res.why), (Date.now() - t0) + 'ms');
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
