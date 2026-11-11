/* Locked In at Hillside (r30): an escape room played inside the 3D model of 118 Hillside Drive.
   Loaded by tour/index.html only on ?escape=<level>; talks to the engine through window.HILLSIDE.
   The sun is the spine: a time-of-day slider moves the real sun, and light through the house's real windows carries the clues. */
(function(){
  'use strict';
  const H = window.HILLSIDE; if(!H || window.ESCAPE) return;
  const THREE = H.THREE, $ = s => document.querySelector(s);
  const Q = new URLSearchParams(location.search), LEVEL = (Q.get('escape') || 'easy').toLowerCase();
  const ga = (n, p) => { try{ window.gtag && gtag('event', n, Object.assign({level: LEVEL}, p || {})); }catch(e){} };
  const store = {get(k){ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } }, set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W2 = (mx, my) => [my, mx];   // BIM meta (x, y) -> world (x, z)
  const fmtT = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const fmtH = h => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); const ap = hh >= 12 ? 'PM' : 'AM', h12 = ((hh + 11) % 12) + 1; return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

  /* ------------------------------------------------------------------ sun */
  const DOY = 288;
  function sunDir(h){ const p = H.sunPosition(h, DOY), plan = p.az - 46.14 * Math.PI / 180, alt = Math.max(p.alt, -.02);
    return new THREE.Vector3(Math.cos(plan) * Math.cos(alt), Math.sin(alt), Math.sin(plan) * Math.cos(alt)).normalize(); }
  let HOUR = 9, lastSet = 0, setTimer = 0;
  if(!H.TOD.find(t => t.key === 'esc')) H.TOD.push({key: 'esc', label: 'Morning', h: 9, doy: DOY});
  function applyHour(h, force){ HOUR = h; const T = H.TOD.find(t => t.key === 'esc'); T.h = h; T.doy = DOY; T.label = fmtH(h);
    PATCH.update(); clearTimeout(setTimer); const now = performance.now();
    const go = () => { lastSet = performance.now(); if(h >= 18.6) H.setTOD('dusk'); else H.setTOD('esc'); };
    if(force || now - lastSet > 450) go(); else setTimer = setTimeout(go, 220); }

  /* ------------------------------------------------------------------ light through a window, projected onto a room floor (the engine doesn't draw indoor sun patches) */
  function makePatch(spec){ // spec: {win: openingId, room: spaceId, ppf, shadeTop, cutouts: [[ [x,y,z]... ]], strength}
    const B = H.BIM2S, o = B.meta.openings.find(q => q.id === spec.win), sp = B.meta.spaces.find(q => q.id === spec.room);
    const poly = (sp.poly || sp.polygon).map(p => W2(p[0], p[1])), xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const bb = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], ppf = spec.ppf || 36, fy = (sp.floorZ || 0) + .02;
    const cv = document.createElement('canvas'); cv.width = Math.ceil((bb[2] - bb[0]) * ppf); cv.height = Math.ceil((bb[3] - bb[1]) * ppf); const g = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    const mat = new THREE.MeshBasicMaterial({map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .9, toneMapped: false});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(bb[2] - bb[0], bb[3] - bb[1]), mat); mesh.rotation.x = -Math.PI / 2; mesh.position.set((bb[0] + bb[2]) / 2, fy, (bb[1] + bb[3]) / 2); mesh.renderOrder = 2; mesh.name = 'esc-patch';
    H.grp('main').add(mesh);
    // window rectangle in world: centre, along-wall axis, interior face
    const [cx, cz] = W2(o.center[0], o.center[1]), ax = W2(o.axis[0], o.axis[1]), nrm = W2(o.normal[0], o.normal[1]), inSign = -1;   // normal points outside (A = EXTERIOR)
    const xw = cx + nrm[0] * inSign * ((o.thickness || .4) / 2), zw = cz + nrm[1] * inSign * ((o.thickness || .4) / 2);
    const top = spec.shadeTop || o.head, bot = o.sill, half = o.width / 2 - .25;
    const P = (along, y) => new THREE.Vector3(xw + ax[0] * along, y, zw + ax[1] * along);
    const winQuad = [P(-half, bot), P(half, bot), P(half, top), P(-half, top)];
    const frames = (spec.mullions || []).map(a => [P(a - .17, bot), P(a + .17, bot), P(a + .17, top), P(a - .17, top)]);
    const toPx = v => [(v.x - bb[0]) * ppf, (v.z - bb[1]) * ppf];
    const proj = (v, d) => { const t = (v.y - fy) / d.y; return new THREE.Vector3(v.x - d.x * t, fy, v.z - d.z * t); };
    const pathPoly = (pts) => { g.beginPath(); pts.forEach((p, i) => { const q = toPx(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); };
    const api = {mesh, bb, win: {xw, zw, ax, nrm, top, bot}, visibleArea: 0,
      update(){ const d = sunDir(HOUR); g.clearRect(0, 0, cv.width, cv.height);
        const facing = -(d.x * nrm[0] + d.z * nrm[1]);   // > 0: sun is outside this window
        const k = Math.max(0, Math.min(1, (d.y - .03) / .12)) * Math.max(0, Math.min(1, (-facing) * -1 / .25 + 0));
        const into = d.x * nrm[0] + d.z * nrm[1];         // sun on the window's exterior side
        const s = Math.max(0, Math.min(1, (d.y - .025) / .1)) * Math.max(0, Math.min(1, into / .2));
        api.strength = s; if(s <= 0){ tex.needsUpdate = true; mesh.visible = false; return; } mesh.visible = true;
        g.globalCompositeOperation = 'source-over'; const gr = g.createLinearGradient(0, 0, cv.width, 0);
        g.fillStyle = `rgba(255,${Math.round(214 - 40 * (1 - Math.min(1, d.y / .5)))},${Math.round(150 - 60 * (1 - Math.min(1, d.y / .5)))},1)`;
        pathPoly(winQuad.map(v => proj(v, d))); g.fill();
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
        for(const f of frames){ pathPoly(f.map(v => proj(v, d))); g.fill(); }
        for(const c of (spec.cutouts || [])){ pathPoly(c.map(v => proj(v, d))); g.fill(); }
        g.globalCompositeOperation = 'destination-in'; g.beginPath(); poly.forEach((p, i) => { const q = toPx({x: p[0], z: p[1]}); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill();
        g.globalCompositeOperation = 'source-over'; mat.opacity = .62 * s; tex.needsUpdate = true; }};
    return api; }
  const PATCH = {list: [], update(){ PATCH.list.forEach(p => p.update()); }};

  /* ------------------------------------------------------------------ paper cut-outs whose shadows spell digits at one moment */
  const DIGITS = {   // strokes in a unit box (u right, v up; 0..1 x 0..1.6)
    0: [[[0, 0], [1, 0], [1, 1.6], [0, 1.6], [0, 0]]], 1: [[[.5, 0], [.5, 1.6], [.25, 1.35]]], 2: [[[0, 1.6], [1, 1.6], [1, .8], [0, .8], [0, 0], [1, 0]]],
    3: [[[0, 1.6], [1, 1.6], [1, 0], [0, 0]], [[.25, .8], [1, .8]]], 4: [[[0, 1.6], [0, .8], [1, .8]], [[1, 1.6], [1, 0]]], 5: [[[1, 1.6], [0, 1.6], [0, .8], [1, .8], [1, 0], [0, 0]]],
    6: [[[1, 1.6], [0, 1.6], [0, 0], [1, 0], [1, .8], [0, .8]]], 7: [[[0, 1.6], [1, 1.6], [.35, 0]]], 8: [[[0, 0], [1, 0], [1, 1.6], [0, 1.6], [0, 0]], [[0, .8], [1, .8]]], 9: [[[1, .8], [0, .8], [0, 1.6], [1, 1.6], [1, 0], [0, 0]]]};
  function strokeQuads(pts, w){ const q = []; for(let i = 0; i < pts.length - 1; i++){ const [a, b] = [pts[i], pts[i + 1]], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2, ex = dx / L * w / 2, ey = dy / L * w / 2;
      q.push([[a[0] - ex + nx, a[1] - ey + ny], [b[0] + ex + nx, b[1] + ey + ny], [b[0] + ex - nx, b[1] + ey - ny], [a[0] - ex - nx, a[1] - ey - ny]]); } return q; }
  // code -> floor polygons (reading frame: origin, right, up on the floor) -> inverse-projected onto the glass at hour T
  function cutoutsFor(code, frame, T, win){ const d = sunDir(T), out = [];
    [...code].forEach((ch, k) => { for(const st of DIGITS[ch]){ for(const quad of strokeQuads(st, frame.stroke / frame.size)){
      const poly = quad.map(([u, v]) => { const fx = frame.o[0] + (u + k * frame.gap) * frame.size * frame.right[0] + v * frame.size * frame.up[0], fz = frame.o[1] + (u + k * frame.gap) * frame.size * frame.right[1] + v * frame.size * frame.up[1];
        const F = new THREE.Vector3(fx, frame.floorY, fz), t = (win.xw - F.x) / d.x; return new THREE.Vector3(win.xw, F.y + d.y * t, F.z + d.z * t); });
      out.push(poly); } } }); return out; }
  function paperMesh(polys, offset){ const mat = new THREE.MeshStandardMaterial({color: 0xf3efe6, roughness: .95, side: THREE.DoubleSide, transparent: true, opacity: .93});
    const g = new THREE.Group(); g.name = 'esc-paper';
    for(const p of polys){ const sh = new THREE.Shape(p.map(v => new THREE.Vector2(v.z, v.y))); const geo = new THREE.ShapeGeometry(sh); const m = new THREE.Mesh(geo, mat);
      m.rotation.y = -Math.PI / 2; m.position.x = p[0].x + offset; g.add(m); }   // local x -> world z
    H.grp('main').add(g); return g; }

  /* ------------------------------------------------------------------ chalk drawing (canvas) for the pocket door face */
  function chalkTexture(draw, w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.clearRect(0, 0, w, h);
    const kg = x.createLinearGradient(0, 0, w, h); kg.addColorStop(0, '#d9bd8f'); kg.addColorStop(1, '#ccab76'); x.fillStyle = kg; x.fillRect(14, 30, w - 28, h - 44);   // kraft sheet
    for(let i = 0; i < 900; i++){ x.fillStyle = `rgba(90,60,25,${Math.random() * .06})`; x.fillRect(14 + Math.random() * (w - 28), 30 + Math.random() * (h - 44), 2, 1); }
    x.fillStyle = 'rgba(240,226,190,.88)'; x.save(); x.translate(60, 36); x.rotate(-.18); x.fillRect(-50, -14, 100, 28); x.restore(); x.save(); x.translate(w - 60, 36); x.rotate(.16); x.fillRect(-50, -14, 100, 28); x.restore();   // tape
    x.strokeStyle = '#1d1f26'; x.fillStyle = '#1d1f26'; x.lineCap = 'round'; x.lineJoin = 'round'; draw(x, w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }
  function chalkLine(x, pts, w){ x.lineWidth = w; x.beginPath(); pts.forEach((p, i) => { const j = (Math.random() - .5) * w * .25; i ? x.lineTo(p[0] + j, p[1] + j) : x.moveTo(p[0], p[1]); }); x.stroke(); }

  /* ------------------------------------------------------------------ Snowball in the house (a billboard of the shared drawing) */
  let CAT = null;
  function loadSnowball(cb){ if(window.SNOWBALL) return cb(); const s = document.createElement('script'); s.src = '../assets/snowball.js?v=30'; s.onload = cb; s.onerror = cb; document.head.appendChild(s); }
  function makeCat(){ if(CAT || !window.SNOWBALL) return CAT; const img = new Image(), cv = document.createElement('canvas'); cv.width = 384; cv.height = 590;
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    img.onload = () => { const x = cv.getContext('2d'); x.drawImage(img, 0, 0, cv.width, cv.height); tex.needsUpdate = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SNOWBALL.svg({id: 'sb3d', seed: 7, glow: true}).replace('<svg ', '<svg width="384" height="590" '));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false})); sp.center.set(.5, 0); sp.scale.set(1.25, 1.92, 1); sp.visible = false; sp.name = 'esc-snowball'; sp.renderOrder = 5; sp.raycast = function(){};
    H.scene.add(sp); CAT = sp; return sp; }
  function catAt(p){ const c = makeCat(); if(!c) return; c.position.set(p[0], p[1], p[2]); c.visible = true; c.material.opacity = 0; const t0 = performance.now();
    (function f(){ const k = Math.min(1, (performance.now() - t0) / 500); c.material.opacity = k; if(k < 1) requestAnimationFrame(f); })(); }

  /* ------------------------------------------------------------------ levels */
  const LEVELS = {
    easy: {title: 'Pop the Cork', par: 300, start: 9,
      intro: `<p class="lede">Elena designs escape rooms for a living. For her housewarming, she made one out of the house.</p>
        <div class="note"><p>Welcome! The champagne is locked in the little fridge at the coffee bar. The code is somewhere in the house. I'm out getting the cake.</p><p class="sig">— Elena</p><p class="ps">P.S. Snowball watched me hide everything. Ask him.</p></div>`,
      goal: 'Open the coffee-bar fridge',
      views: {coffee: {label: 'Kitchen', pos: [10.6, 5.2, 9.7], look: [22.0, 3.4, 9.6]}, dining: {label: 'Dining room', pos: [15.4, 5.6, 31.4], look: [8.4, .6, 23.6]}},
      startView: 'coffee'},
  };
  const L = LEVELS[LEVEL] || LEVELS.easy;

  /* ------------------------------------------------------------------ state */
  const KEY = 'esc.' + LEVEL + '.v1';
  const S = {t0: 0, pen: 0, hints: 0, solved: false, seen: {}, doorClosed: false, sawDigits: false, started: false, done: false};
  let ITEMS = [], OPEN = null;
  const elapsed = () => S.t0 ? (performance.now() - S.t0) / 1000 + S.pen : 0;

  /* ------------------------------------------------------------------ build the Easy level into the house */
  function buildEasy(){
    const CODE = '327', T = 16;
    const win = H.BIM2S.meta.openings.find(q => q.id === 'WN-L1-03');
    // the roller shade on this window is down a quarter of the way; its bottom edge is the top of the light
    const shadeTop = win.head - .28 - (win.head - .28 - win.sill) * .26;
    const [cx] = W2(win.center[0], win.center[1]), nrm = W2(win.normal[0], win.normal[1]), xw = cx - nrm[0] * (win.thickness || .4) / 2;
    // on the clear strip of floor between the dining table and the sofa, read from the sofa side: right = away from the glass (+x), up = toward the table (-z)
    const frame = {o: [8.5, 25.2], right: [1, 0], up: [0, -1], size: .98, gap: 1.5, stroke: .27, floorY: .02};
    const polys = cutoutsFor(CODE, frame, T, {xw});
    PATCH.list.push(makePatch({win: 'WN-L1-03', room: 'SP-L1-GREAT', ppf: 40, shadeTop, mullions: [0], cutouts: polys}));
    paperMesh(polys, .03);
    // the pocket door: a chalk drawing on its kitchen face, riding on the sliding leaf
    const pd = (H.door28 && H.door28.items || []).find(it => it.id === 'R28-POCKET');
    const tex = chalkTexture((x, w, h) => {
      chalkLine(x, [[60, 330], [300, 330]], 5);                                  // horizon
      x.lineWidth = 5; x.beginPath(); x.arc(90, 300, 26, Math.PI, 0); x.stroke();   // low sun
      for(let i = 0; i < 7; i++){ const a = Math.PI + (i + .5) / 7 * Math.PI; chalkLine(x, [[90 + Math.cos(a) * 36, 300 + Math.sin(a) * 36], [90 + Math.cos(a) * 52, 300 + Math.sin(a) * 52]], 4); }
      [[150, 150, 64, 150], [222, 150, 64, 150]].forEach(([wx, wy, ww, wh]) => { x.lineWidth = 5; x.strokeRect(wx, wy, ww, wh); chalkLine(x, [[wx + 6, wy + 40], [wx + 20, wy + 30], [wx + 8, wy + 60]], 3); });
      chalkLine(x, [[118, 290], [160, 250]], 3); chalkLine(x, [[150, 250], [160, 250], [158, 262]], 3);
      x.lineWidth = 5; x.beginPath(); x.arc(206, 470, 62, 0, Math.PI * 2); x.stroke();   // clock at four
      for(let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; chalkLine(x, [[206 + Math.cos(a) * 52, 470 + Math.sin(a) * 52], [206 + Math.cos(a) * 58, 470 + Math.sin(a) * 58]], 3); }
      chalkLine(x, [[206, 470], [206, 434]], 5); const a4 = (4 / 12) * Math.PI * 2 - Math.PI / 2; chalkLine(x, [[206, 470], [206 + Math.cos(a4) * 30, 470 + Math.sin(a4) * 30]], 6);
      x.font = 'italic 34px Georgia, serif'; x.fillText('— E.', 280, 600);
          }, 380, 680);
    const chalk = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 3.13), new THREE.MeshStandardMaterial({map: tex, transparent: true, roughness: .95}));
    chalk.name = 'esc-chalk'; chalk.renderOrder = 3; chalk.rotation.y = -Math.PI / 2;
    const leaf = pd && pd.parts && pd.parts.find(q => q.k === 0);
    if(leaf && leaf.piv && leaf.base){ leaf.piv.add(chalk); chalk.position.set(22.08 - leaf.base.x, 4.1 - leaf.base.y, 9.52 - leaf.base.z); }
    else { H.grp('main').add(chalk); chalk.position.set(22.1, 3.55, 9.52); chalk.visible = false; }
    S.pocket = pd;
    // interactables
    ITEMS = [
      {id: 'fridge', label: 'Coffee-bar fridge', p: [19.6, 1.7, 11.3], view: {pos: [18.5, 5.0, 8.9], look: [19.7, 1.4, 11.8]}, open: openFridge},
      {id: 'pocket', label: 'Pocket door', p: [22.0, 3.6, 9.5], view: {pos: [17.2, 4.6, 9.6], look: [22.0, 3.7, 9.5]}, open: openPocket},
      {id: 'paper', label: 'Paper on the glass', p: [5.0, 3.8, 22.0], view: {pos: [9.6, 4.4, 21.0], look: [4.8, 3.8, 21.6]}, open: openPaper},
      {id: 'floor', label: 'Dining floor', p: [10.4, .3, 24.4], hidden: true, view: {pos: [10.4, 7.2, 31.0], look: [10.4, 0, 24.4], kind: 'orbit'}, open: () => {}}];
    S.code = CODE; S.T = T;
    // hints, by stage
    S.hint = () => {
      if(!S.doorClosed) return [
        ['Elena wrote on something that only shows when the kitchen is shut up for the night.'],
        ['Snowball wanders over to the pocket door between the fridge and the coffee bar, and sits.', () => { goView('coffee'); catAt([20.6, 0, 10.6]); }],
        ['Tap the pocket door and slide it closed. Elena taped a drawing to its face.', () => { goView('coffee'); catAt([20.6, 0, 10.6]); }]];
      if(!S.sawDigits) return [
        ['The drawing shows a low sun, the two big dining windows and a clock. Something happens in that room at a certain time.'],
        ['Snowball pads into the dining room and lies down in the gap between the table and the sofa, where the sun will land.', () => { goView('dining'); catAt([13.4, 0, 24.6]); }],
        ['Drag the sun to 4:00 PM, then look at the dining floor in front of the windows.', () => { goView('dining'); setSlider(16); }]];
      return [
        ['The shadows only read the right way up from one side. Try looking from the sofa.'],
        ['Snowball hops up by the sofa and stares at the floor.', () => { flyView({pos: [10.4, 7.2, 31.0], look: [10.4, 0, 24.4], kind: 'orbit'}); catAt([12.6, 0, 27.6]); }],
        ['The code is ' + CODE.split('').join(' ') + '.']]; };
  }
  /* ------------------------------------------------------------------ camera */
  function flyView(v, dur){ H.anim = null; H.flyTo(v.pos, v.look, v.kind || 'look', dur || 1.1); }
  function goView(k){ const v = L.views[k]; if(v){ flyView(v); document.querySelectorAll('#escNav button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === k)); } }

  /* ------------------------------------------------------------------ UI */
  const css = `
  html.esc header.bar nav.tabs, html.esc #card, html.esc header.bar .plate, html.esc #aboutBtn, html.esc #labels, html.esc #wplabels, html.esc #ovtag, html.esc #tod, html.esc #viewBtn, html.esc #hwBtn, html.esc #tgBtn, html.esc #phMore, html.esc .g28pill, html.esc #navHelp{display:none!important}
  #escHud{position:fixed;left:0;right:0;top:0;z-index:60;pointer-events:none;font-family:Jost,"Avenir Next","Helvetica Neue",Arial,sans-serif;color:#1f2a3a}
  #escHud .row{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:64px 14px 0}
  .escChip{pointer-events:auto;background:rgba(251,250,247,.94);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:16px;box-shadow:0 8px 30px rgba(15,20,35,.18);padding:10px 14px}
  #escGoal b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:21px;font-weight:600;line-height:1.05}
  #escGoal span{font-size:13.5px;color:#5c6575}
  #escTime{font-variant-numeric:tabular-nums;font-size:15px;color:#5c6575;margin-top:2px}
  #escHint{display:flex;align-items:center;gap:10px;border:0;cursor:pointer;font:inherit;text-align:left}
  #escHint .av{width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at 50% 35%,#34416b,#1a2340);overflow:hidden;display:grid;place-items:end center;flex:none}
  #escHint .av svg{width:44px;height:auto;margin-bottom:-3px}
  #escHint b{display:block;font-size:14.5px;font-weight:500}#escHint small{font-size:12.5px;color:#5c6575}
  #escSun{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;width:min(560px,calc(100% - 28px));pointer-events:auto}
  #escSun .top{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:#5c6575;margin-bottom:4px}
  #escSun .top b{font-size:17px;color:#1f2a3a;font-weight:500;font-variant-numeric:tabular-nums}
  #escSun input{width:100%;accent-color:#c98a12;height:28px}
  #escSun .arc{height:34px;position:relative;margin:0 10px}
  #escSun .arc svg{width:100%;height:34px;display:block}
  #escNav{position:fixed;left:14px;bottom:110px;z-index:60;display:flex;flex-direction:column;gap:6px}
  #escNav button{pointer-events:auto;border:0;border-radius:999px;padding:8px 14px;font:inherit;font-size:14px;background:rgba(251,250,247,.92);box-shadow:0 6px 20px rgba(15,20,35,.15);cursor:pointer;color:#1f2a3a;text-align:left}
  #escNav button[aria-pressed=true]{background:#1f2948;color:#fff}
  .escMark{position:fixed;z-index:55;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 4px rgba(232,184,74,.35),0 0 18px rgba(255,220,140,.6);background:rgba(255,255,255,.12);cursor:pointer;pointer-events:auto;opacity:0;transition:opacity .3s}
  .escMark.on{opacity:1;animation:escPulse 2.4s ease-in-out infinite}
  .escMark span{position:absolute;left:50%;top:52px;transform:translateX(-50%);white-space:nowrap;font:500 12.5px Jost,sans-serif;color:#fff;background:rgba(20,26,44,.75);padding:3px 8px;border-radius:999px}
  .escMark.seen{box-shadow:0 0 0 3px rgba(255,255,255,.25);animation:none}
  @keyframes escPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
  #escPanel{position:fixed;z-index:70;right:14px;top:120px;width:min(380px,calc(100% - 28px));max-height:calc(100% - 240px);overflow:auto;background:#fbfaf7;border-radius:18px;box-shadow:0 20px 60px rgba(10,14,28,.35);padding:18px;font-family:Jost,sans-serif;color:#1f2a3a;transform:translateX(30px);opacity:0;pointer-events:none;transition:.3s}
  #escPanel.on{transform:none;opacity:1;pointer-events:auto}
  #escPanel h3{font-family:"Cormorant Garamond",Georgia,serif;font-size:27px;font-weight:600;margin:0 0 6px;line-height:1.05}
  #escPanel p{margin:0 0 10px;font-size:15.5px;line-height:1.45;color:#2b3442}
  #escPanel .x{position:absolute;right:10px;top:10px;border:0;background:none;font-size:22px;cursor:pointer;color:#5c6575;width:36px;height:36px;border-radius:50%}
  #escPanel .x:hover{background:#eceae4}
  .escBtn{display:inline-flex;align-items:center;justify-content:center;border:1px solid #cfcabe;background:#fff;color:#1f2a3a;border-radius:999px;padding:10px 18px;font:inherit;font-size:15px;cursor:pointer;text-decoration:none;margin:4px 6px 0 0}
  .escBtn.primary{background:#9b2c3c;border-color:#9b2c3c;color:#fff}.escBtn.dark{background:#1f2948;border-color:#1f2948;color:#fff}
  .escPad{display:grid;grid-template-columns:repeat(3,64px);gap:8px;justify-content:center;margin:10px 0}
  .escPad button{height:54px;border-radius:12px;border:1px solid #d6d2c8;background:#fff;font:500 22px Jost,sans-serif;cursor:pointer;color:#1f2a3a}
  .escPad button:active{background:#eceae4}
  .escDisp{display:flex;justify-content:center;gap:10px;margin:6px 0 2px}
  .escDisp i{width:46px;height:58px;border-radius:10px;background:#141a30;color:#ffd77a;font:500 32px/58px Jost,sans-serif;font-style:normal;text-align:center;box-shadow:inset 0 2px 8px rgba(0,0,0,.5)}
  .escDisp.bad{animation:escShake .4s}.escDisp.ok i{color:#7cf0a6}
  @keyframes escShake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
  #escCard{position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(14,19,34,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);font-family:Jost,sans-serif;padding:16px}
  #escCard .c{background:#fbfaf7;color:#1f2a3a;border-radius:22px;max-width:520px;width:100%;padding:24px 24px 20px;box-shadow:0 30px 90px rgba(0,0,0,.45);max-height:calc(100% - 32px);overflow:auto}
  #escCard h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:clamp(32px,5vw,44px);font-weight:600;line-height:1;margin:0 0 8px}
  #escCard .k{font-size:13px;color:#5c6575;margin:0 0 4px;letter-spacing:.02em}
  #escCard .lede{font-family:"Cormorant Garamond",Georgia,serif;font-size:20px;line-height:1.35;margin:0 0 14px;color:#2b3442}
  #escCard .note{background:#fff;border:1px solid #e3e0d8;border-radius:4px;padding:16px 18px;transform:rotate(-.6deg);box-shadow:0 6px 18px rgba(0,0,0,.08);font-family:"Caveat Brush","Marker Felt",cursive;font-size:21px;line-height:1.3;color:#2b2336;margin:0 0 16px}
  #escCard .note p{margin:0 0 8px}#escCard .note .sig{text-align:right}#escCard .note .ps{font-size:18px;color:#5a4d63;margin:0}
  #escCard .how{font-size:14.5px;color:#5c6575;margin:0 0 14px;line-height:1.45}
  #escCard .stats{display:flex;gap:18px;margin:10px 0 14px}#escCard .stats b{display:block;font-size:26px;font-weight:500}#escCard .stats span{font-size:13px;color:#5c6575}
  #escCard .cta{background:#1f2948;color:#f4f1e8;border-radius:16px;padding:16px;margin:10px 0}
  #escCard .cta b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:23px;font-weight:600;line-height:1.1;margin-bottom:4px}#escCard .cta span{display:block;font-size:14px;color:#cdd3e2;margin-bottom:10px}
  #escToast{position:fixed;left:50%;top:130px;transform:translate(-50%,-10px);z-index:90;background:#1f2948;color:#fff;font:500 15px Jost,sans-serif;padding:10px 16px;border-radius:999px;opacity:0;transition:.3s;pointer-events:none;max-width:calc(100% - 40px);text-align:center}
  #escToast.on{opacity:1;transform:translate(-50%,0)}
  #escSay{position:fixed;z-index:65;left:14px;top:130px;max-width:300px;background:#fff;border-radius:16px;padding:10px 14px;font:20px/1.25 "Caveat Brush","Marker Felt",cursive;color:#2b2336;box-shadow:0 10px 30px rgba(15,20,35,.2);opacity:0;transform:translateY(-6px);transition:.3s;pointer-events:none}
  #escSay.on{opacity:1;transform:none}
  @media (max-width:700px){#escHud .row{padding-top:58px}#escGoal b{font-size:18px}#escHint .tx{display:none}#escPanel{left:10px;right:10px;width:auto;top:auto;bottom:118px;max-height:52vh}#escNav{bottom:auto;top:150px;left:10px;flex-direction:row}#escNav button{font-size:13px;padding:7px 12px}#escSay{left:10px;right:10px;max-width:none;top:196px}}
  `;
  function el(tag, attrs, html){ const e = document.createElement(tag); for(const k in (attrs || {})) e.setAttribute(k, attrs[k]); if(html != null) e.innerHTML = html; return e; }
  let hud, panel, toastE, sayE, sunE, navE;
  function buildUI(){ document.head.appendChild(el('style', {}, css)); document.documentElement.classList.add('esc');
    hud = el('div', {id: 'escHud'}, `<div class="row"><div class="escChip" id="escGoal"><b>${esc(L.title)}</b><span>${esc(L.goal)}</span><div id="escTime">0:00</div></div>
      <button class="escChip" id="escHint" type="button" aria-label="Ask Snowball for a hint"><span class="av">${window.SNOWBALL ? SNOWBALL.svg({id: 'sbhud', seed: 7}).replace(/viewBox="[^"]+"/, 'viewBox="110 10 280 300"') : ''}</span><span class="tx"><b>Ask Snowball</b><small>Hints cost a little time</small></span></button></div>`);
    document.body.appendChild(hud);
    sunE = el('div', {id: 'escSun', class: 'escChip'}, `<div class="top"><span>Drag the sun</span><b id="escClock">9:00 AM</b></div><div class="arc" aria-hidden="true"><svg viewBox="0 0 100 34" preserveAspectRatio="none"><path d="M2 32 Q50 -10 98 32" fill="none" stroke="#e3dccd" stroke-width="1.4" vector-effect="non-scaling-stroke"/><circle id="escSunDot" r="3.2" fill="#e8a91f" cx="0" cy="0"/></svg></div><input id="escSlider" type="range" min="7" max="19" step=".25" value="9" aria-label="Time of day">`);
    document.body.appendChild(sunE);
    navE = el('div', {id: 'escNav'}, Object.entries(L.views).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="false">${esc(v.label)}</button>`).join(''));
    document.body.appendChild(navE); navE.querySelectorAll('button').forEach(b => b.onclick = () => goView(b.dataset.v));
    panel = el('div', {id: 'escPanel', role: 'dialog', 'aria-live': 'polite'}); document.body.appendChild(panel);
    toastE = el('div', {id: 'escToast', role: 'status'}); document.body.appendChild(toastE);
    sayE = el('div', {id: 'escSay', 'aria-live': 'polite'}); document.body.appendChild(sayE);
    $('#escHint').onclick = hint;
    const sl = $('#escSlider'); sl.oninput = () => onSlide(+sl.value); sl.onchange = () => { onSlide(+sl.value); applyHour(+sl.value, true); };
    setClock(HOUR); }
  function setSlider(h){ const sl = $('#escSlider'); sl.value = h; onSlide(h); applyHour(h, true); }
  function setClock(h){ $('#escClock').textContent = fmtH(h); const t = (h - 7) / 12, x = 2 + t * 96, y = 32 - Math.sin(t * Math.PI) * 42 * .62 - 0; const d = $('#escSunDot'); if(d){ d.setAttribute('cx', x); d.setAttribute('cy', Math.max(3, 32 - (32 - 3) * Math.sin(t * Math.PI))); } }
  function onSlide(h){ setClock(h); applyHour(h); checkDigits(); }
  let tt = 0; function toast(m, ms){ toastE.textContent = m; toastE.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toastE.classList.remove('on'), ms || 2400); }
  let st = 0; function say(m, ms){ sayE.textContent = m; sayE.classList.add('on'); clearTimeout(st); st = setTimeout(() => sayE.classList.remove('on'), ms || 4200); }
  function openPanel(html, onclose){ panel.innerHTML = `<button class="x" type="button" aria-label="Close">×</button>` + html; panel.classList.add('on'); OPEN = onclose || null;
    panel.querySelector('.x').onclick = closePanel; }
  function closePanel(){ panel.classList.remove('on'); const f = OPEN; OPEN = null; if(f) f(); }

  /* ------------------------------------------------------------------ interactables: markers, picking */
  const marks = new Map(); const _v = new THREE.Vector3();
  function screenOf(p){ _v.set(p[0], p[1], p[2]).project(H.camera); const r = H.canvas.getBoundingClientRect(); if(_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) return null; return [r.left + (_v.x + 1) / 2 * r.width, r.top + (1 - _v.y) / 2 * r.height]; }
  function visible(p){ const s = screenOf(p); if(!s) return null; const d = H.camera.position.distanceTo(_v.set(p[0], p[1], p[2])); if(d > 22) return null;
    const h = H.pick(s[0], s[1]); if(h && h.distance < d - 1.2) return null; return s; }
  // stay where the game put you: the camera only moves when the game moves it (look around freely, but no drifting into cabinets)
  let anchor = null, flying = true;
  function hold(){ if(H.anim){ flying = true; return; } if(flying){ flying = false; anchor = H.camera.position.clone(); return; } if(anchor && H.camera.position.distanceTo(anchor) > .35) H.camera.position.copy(anchor); }
  H.canvas.addEventListener('pointerdown', () => { if(S.started && H.nav === 'orbit' && !H.anim){ const d = new THREE.Vector3(); H.camera.getWorldDirection(d); const c = H.camera.position; H.look(c.toArray(), [c.x + d.x * 8, c.y + d.y * 8, c.z + d.z * 8]); } }, true);
  function frame(){ try{ if(S.started) hold(); }catch(e){} if(!S.started){ requestAnimationFrame(frame); return; }
    for(const it of ITEMS){ if(it.hidden) continue; let m = marks.get(it.id); if(!m){ m = el('button', {class: 'escMark', type: 'button', 'aria-label': it.label}, `<span>${esc(it.label)}</span>`); m.onclick = e => { e.stopPropagation(); interact(it); }; document.body.appendChild(m); marks.set(it.id, m); }
      const s = (performance.now() % 3 < 1 || !m._s) ? visible(it.p) : m._s; m._s = s;
      if(s && !S.done && !panel.classList.contains('on')){ m.style.left = s[0] + 'px'; m.style.top = s[1] + 'px'; m.classList.add('on'); m.classList.toggle('seen', !!S.seen[it.id]); } else m.classList.remove('on'); }
    const e = elapsed(); const te = $('#escTime'); if(te && !S.done) te.textContent = fmtT(e);
    requestAnimationFrame(frame); }
  function interact(it){ S.seen[it.id] = true; ga('esc_look', {item: it.id}); if(it.view) flyView(it.view, .9); it.open(it); }
  H.hooks.click = (cx, cy) => { if(!S.started) return true; if(S.done) return true; let best = null;
    for(const it of ITEMS){ if(it.hidden) continue; const s = screenOf(it.p); if(!s) continue; const d = Math.hypot(s[0] - cx, s[1] - cy); if(d < 60 && (!best || d < best.d)) best = {it, d}; }
    if(best && visible(best.it.p)) interact(best.it); return true; };   // every tap is ours: no walking off into the furniture mid-puzzle

  /* ------------------------------------------------------------------ Easy: the three things */
  function openPocket(){ const pd = S.pocket, closed = S.doorShut != null ? S.doorShut : (pd ? pd.t < .5 : false);
    openPanel(`<h3>The pocket door</h3><p>${closed ? 'Slid shut. Taped to its face: a sheet of kraft paper with a drawing in marker. A low sun, the two big dining windows, an arrow, and a clock.' : 'It disappears into the wall between the fridge and the coffee bar. The attic cabinet sits above it.'}</p>` +
      `<button class="escBtn dark" type="button" id="escSlide">${closed ? 'Slide it open' : 'Slide it closed'}</button>`);
    $('#escSlide').onclick = () => { if(pd && H.door28Toggle) H.door28Toggle(pd); const nowClosed = !closed; S.doorShut = nowClosed; S.doorClosed = S.doorClosed || nowClosed;
      if(nowClosed){ setTimeout(() => { flyView({pos: [18.4, 4.6, 9.5], look: [22.0, 4.0, 9.5]}, .8); say('Elena draws everything.'); }, 650); ga('esc_step', {step: 'pocket'}); }
      setTimeout(openPocket, 700); }; }
  function openPaper(){ openPanel(`<h3>Paper on the glass</h3><p>Small scraps of white paper taped to the inside of the dining window. Squashed, lopsided shapes. They don't look like anything from here.</p>` +
      `<p>${S.doorClosed ? 'Maybe they are not meant to be looked at.' : ''}</p>`); }
  function openFridge(){ let cur = '';
    const draw = (cls) => { const d = $('#escDisp'); if(!d) return; d.className = 'escDisp ' + (cls || ''); d.innerHTML = [0, 1, 2].map(i => `<i>${cur[i] || ''}</i>`).join(''); };
    openPanel(`<h3>The coffee-bar fridge</h3><p>Smoked glass, a bottle-shaped shadow inside, and a small keypad on the handle. Three digits.</p><div class="escDisp" id="escDisp"></div>` +
      `<div class="escPad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}<button type="button" data-n="c" aria-label="Clear">⌫</button><button type="button" data-n="0">0</button><span></span></div>`);
    draw(); panel.querySelectorAll('.escPad button').forEach(b => b.onclick = () => { const n = b.dataset.n; if(n === 'c'){ cur = cur.slice(0, -1); draw(); return; } if(cur.length >= 3) return; cur += n; draw(); beep(520 + cur.length * 80, .06);
      if(cur.length === 3){ if(cur === S.code){ draw('ok'); beep(880, .18); setTimeout(win, 650); } else { draw('bad'); beep(160, .3, 'square'); S.pen += 10; setTimeout(() => { cur = ''; draw(); }, 600); } } }); }
  function checkDigits(){ if(S.sawDigits || !S.T) return; if(Math.abs(HOUR - S.T) <= .26){ S.sawDigits = true; ga('esc_step', {step: 'digits'}); setTimeout(() => say('Snowball\'s tail twitches. Something just happened in the dining room.'), 900); } }

  /* ------------------------------------------------------------------ hints (Snowball) */
  let hintIx = {};
  function hint(){ if(!S.started || S.done) return; const tiers = S.hint(), stage = tiers[0][0]; const i = hintIx[stage] || 0, t = tiers[Math.min(i, tiers.length - 1)];
    hintIx[stage] = Math.min(i + 1, tiers.length - 1); S.hints++; const pen = [15, 30, 60][Math.min(i, 2)]; S.pen += pen; ga('esc_hint', {tier: i + 1});
    say(t[0], 6500); if(t[1]) t[1](); toast(`+${pen}s`, 1200); }

  /* ------------------------------------------------------------------ sound */
  let AC = null; function beep(f, d, type){ try{ AC = AC || new (window.AudioContext || window.webkitAudioContext)(); const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime; o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.08, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d + .2); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .3); }catch(e){} }
  function doorbell(){ beep(659, .5); setTimeout(() => beep(523, .9), 420); }

  /* ------------------------------------------------------------------ start / win */
  function startCard(){ const best = store.get(KEY + '.best');
    const c = el('div', {id: 'escCard'}, `<div class="c"><p class="k">Locked In at Hillside, ${LEVEL === 'easy' ? 'easy, about 5 minutes' : ''}</p><h2>${esc(L.title)}</h2>${L.intro}
      <p class="how">Drag to look around. Tap the glowing circles to look closer. The slider at the bottom moves the sun, and the light in the house moves with it.${best ? ' Your best: ' + fmtT(best.time) + '.' : ''}</p>
      <button class="escBtn primary" type="button" id="escGo">Start</button></div>`);
    document.body.appendChild(c); $('#escGo').focus();
    $('#escGo').onclick = () => { c.remove(); S.started = true; S.t0 = performance.now(); ga('esc_start'); goView(L.startView); say('Elena hides things in plain sight. Look around.'); }; }
  function win(){ S.done = true; closePanel(); const t = elapsed(); ga('esc_win', {secs: Math.round(t), hints: S.hints});
    const best = store.get(KEY + '.best'); if(!best || t < best.time) store.set(KEY + '.best', {time: t, hints: S.hints});
    marks.forEach(m => m.classList.remove('on'));
    say('Champagne! And the doorbell.', 3000); doorbell();
    // the day ends: sun down, lights on, and the front doors open for the guests
    let h = HOUR; const step = () => { h = Math.min(18.75, h + .35); $('#escSlider').value = Math.min(19, h); setClock(h); applyHour(h, true); if(h < 18.75) setTimeout(step, 160); else H.setTOD('dusk'); };
    if(!reduce) step(); else { H.setTOD('dusk'); }
    setTimeout(() => { const i = H.STOPS.findIndex(s => s.id === 'entry'); if(i >= 0){ const s = H.STOPS[i]; H.anim = null; H.flyTo(s.pos, s.look, 'look', 1.6); }
      const fd = (H.door28 && H.door28.items || []).find(it => /D-L0-11|D-LG-02/.test(it.id) && it.t < .5); if(fd && H.door28Toggle) setTimeout(() => H.door28Toggle(fd), 1400); }, 1200);
    setTimeout(finishCard, 6500); }
  function finishCard(){ const t = elapsed(), stars = t <= L.par && S.hints <= 1 ? 3 : t <= L.par * 1.8 ? 2 : 1;
    const c = el('div', {id: 'escCard'}, `<div class="c"><p class="k">Locked In at Hillside</p><h2>Cork popped.</h2>
      <p class="lede">The guests are at the door, and the house is lit for the evening. Elena owes you a slice of cake.</p>
      <div class="stats"><div><b>${fmtT(t)}</b><span>your time</span></div><div><b>${S.hints}</b><span>${S.hints === 1 ? 'hint' : 'hints'}</span></div><div><b>${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</b><span>${stars === 3 ? 'a natural' : stars === 2 ? 'nicely done' : 'you got there'}</span></div></div>
      <div class="cta"><b>The sun really does that.</b><span>118 Hillside Drive is for sale in Woodside. Come stand in that afternoon light yourself.</span><a class="escBtn primary" href="/#contact" id="escSee">See it in person</a></div>
      <button class="escBtn" type="button" id="escShare">Share</button><a class="escBtn" href="/tour/">Walk the house freely</a><a class="escBtn" href="/games/">More games</a><button class="escBtn" type="button" id="escAgain">Play again</button></div>`);
    document.body.appendChild(c);
    $('#escSee').onclick = () => ga('esc_cta', {cta: 'see_in_person'});
    $('#escAgain').onclick = () => location.reload();
    $('#escShare').onclick = async () => { const url = 'https://118hillside.com/tour/?escape=' + LEVEL, text = `I escaped "${L.title}" at 118 Hillside Drive in ${fmtT(t)}. The clue is in the sunlight.`; ga('esc_share');
      try{ if(navigator.share){ await navigator.share({title: 'Locked In at Hillside', text, url}); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
      try{ await navigator.clipboard.writeText(text + ' ' + url); toast('Link copied.'); }catch(e){ toast(url); } }; }

  /* ------------------------------------------------------------------ boot: after the house is ready */
  function boot(){ try{ H.asBuilt && H.asBuilt(); }catch(e){} loadSnowball(() => { try{ buildUI(); buildEasy(); applyHour(L.start, true); setSlider(L.start); makeCat(); }catch(e){ console.error('[escape] build', e); }
    requestAnimationFrame(frame); const go = () => startCard();
    const intro = document.getElementById('intro28'); if(intro){ const mo = new MutationObserver(() => { if(!document.getElementById('intro28')){ mo.disconnect(); go(); } }); mo.observe(document.body, {childList: true}); } else go(); }); }
  // start only once the engine is really drawing frames (the loading card can read "done" a moment before the first render)
  (function wait(n){ let fr = 0; try{ fr = H.renderer.info.render.frame; }catch(e){} const ld = document.getElementById('loading'), up = ld && !ld.classList.contains('done');
    if((fr > 8 && !up) || n > 240) setTimeout(boot, 900); else setTimeout(() => wait(n + 1), 250); })(0);
  window.ESCAPE = {S, ITEMS: () => ITEMS, applyHour, setSlider, PATCH, win, hint, sunDir, interact: id => interact(ITEMS.find(i => i.id === id)), catAt};
})();
