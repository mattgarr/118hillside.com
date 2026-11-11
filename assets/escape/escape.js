/* Locked In at Hillside (r35): an escape room played inside the 3D model of 118 Hillside Drive.
   Loaded by tour/index.html only on ?escape=<level>; talks to the engine through window.HILLSIDE.

   The sun is the puzzle: a time slider moves the real sun, and light through the house's real windows carries the code.

   r35 rebuilds how the game is played:
   - The game owns the camera. You stand at named places, look around freely, and walk between them along paths that were
     ray-checked against the walls and furniture. The engine never sees a pointer, wheel or key event while the game runs,
     so nothing can leave you inside a cabinet, and the view stays exactly where you leave it (no re-levelling, no spring back).
   - Every clue has an "examine" view: the camera frames it squarely in the free part of the screen and holds until you go Back.
   - One objective line always says what to do next. Snowball gives three levels of hint for the step you are on.
   - The paper on the great room window is card and tracing paper in the same boxy figures, so only the sun can tell you the digits.
   - Sound is one small synthesized set (see SND); SND.measure() renders every cue offline and reports its level.
   The cast is pets only: Snowball, the cat of the house, locked the bottle away, drew the clue and signs with a paw print. He is also
   the one who gives the hints. No people are named or described anywhere in the game.
   Debug hook: window.ESCAPE (state, rig, goTo, examine, back, hint, setSlider, sound). */
(function(){
  'use strict';
  const H = window.HILLSIDE; if(!H || window.ESCAPE) return;
  const THREE = H.THREE, canvas = H.canvas, camera = H.camera;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const LEVEL = 'easy';
  const ga = (n, p) => { try{ window.gtag && gtag('event', n, Object.assign({level: LEVEL}, p || {})); }catch(e){} };
  const store = {
    get(k){ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }};
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const angDiff = (a, b) => { let d = b - a; while(d > Math.PI) d -= 2 * Math.PI; while(d < -Math.PI) d += 2 * Math.PI; return d; };
  const W2 = (mx, my) => [my, mx];   // BIM meta (x, y) -> world (x, z)
  const fmtT = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const fmtH = h => { let hh = Math.floor(h + 1e-6), mm = Math.round((h - hh) * 60); if(mm === 60){ hh++; mm = 0; } const ap = hh >= 12 ? 'PM' : 'AM', h12 = ((hh + 11) % 12) + 1; return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const el = (tag, attrs, html) => { const e = document.createElement(tag); for(const k in (attrs || {})) e.setAttribute(k, attrs[k]); if(html != null) e.innerHTML = html; return e; };
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
  const phone = () => innerWidth < 900;   // the compact layout: phones and narrow windows
  // where this copy of the site lives (the real domain, or a sub-path on a preview mirror), so Share can link the game's own page, which carries its preview
  const SITE = (() => { const m = /githack/.test(location.host) ? location.pathname.match(/^(\/[^\/]+\/[^\/]+\/[^\/]+)\//) : location.pathname.match(/^(.*)\/(tour|games)\//), base = m ? m[1] : '';
    return {base, page: path => location.origin + base + path + (base ? 'index.html' : '')}; })();
  const PAW = '<svg class="paw" viewBox="0 0 44 44" role="img" aria-label="Signed with a paw print"><g fill="currentColor"><ellipse cx="22" cy="29" rx="10" ry="8.4"/><ellipse cx="8.6" cy="18" rx="4" ry="5.2" transform="rotate(-24 8.6 18)"/><ellipse cx="16.6" cy="10" rx="4" ry="5.4" transform="rotate(-8 16.6 10)"/><ellipse cx="27.4" cy="10" rx="4" ry="5.4" transform="rotate(8 27.4 10)"/><ellipse cx="35.4" cy="18" rx="4" ry="5.2" transform="rotate(24 35.4 18)"/></g></svg>';

  /* ================================================================== the level */
  const CODE = '327', T_SUN = 16, DOY = 288, EYE = 5.3;
  const PLACES = {
    entry:   {name: 'Entry', pos: [-5.6, EYE, -0.6], face: [-5.3, 4.7, -8], map: [-7.6, -2.3],
      note: 'A cathedral ceiling, a starburst light, and iron-and-glass doors at both ends. The heritage oak is straight ahead.'},
    living:  {name: 'Living room', pos: [1.8, EYE, -3.6], face: [10, 5.0, -2.9], map: [3.4, -3.2],
      note: 'Fir beams cross the vaulted ceiling. This room is part of the original 1920s house.'},
    kitchen: {name: 'Kitchen', pos: [12.8, EYE, 8.4], face: [11.2, 3.7, 20], map: [12.4, 8.2],
      note: 'Quartz counters, a long peninsula and a Bosch gas range. The great room opens up past the peninsula.'},
    coffee:  {name: 'Coffee bar', pos: [15.0, EYE, 9.3], face: [21.0, 3.1, 10.9], map: [20.6, 9.4],
      note: 'A coffee bar with its own drinks fridge, tucked in beside the kitchen.'},
    great:   {name: 'Great room', pos: [11.2, EYE, 31.95], face: [10.7, 3.3, 22.0], faceLight: [10.95, .9, 24.7], fov: 56, map: [10.4, 28.2],
      note: 'The kitchen, the dining table and this sitting area share one long room, with butcher-block shelves over the built-in cabinets and large windows along one side.'}};
  const ORDER = ['entry', 'living', 'kitchen', 'coffee', 'great'];
  // walkable graph (x, z at eye height). Plain nodes are corners of the route. Every edge was ray-cast in the model at ankle, knee,
  // counter and eye height across a one-foot-wide path, and all of them are clear of walls and furniture.
  const NODES = {a1: [4.4, -4.9], a2: [11.4, -4.9], a3: [12.6, -1.0], a4: [12.75, 5.1], j1: [15.7, 12.4], j2: [15.8, 17.2], s1: [15.2, 26.4], s2: [14.3, 31.6]};
  for(const k of ORDER) NODES[k] = [PLACES[k].pos[0], PLACES[k].pos[2]];
  const EDGES = [['entry', 'living'], ['living', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'], ['a4', 'kitchen'], ['kitchen', 'coffee'], ['kitchen', 'j1'], ['coffee', 'j1'],
    ['j1', 'j2'], ['j2', 's1'], ['s1', 's2'], ['s2', 'great']];
  // where the "walk here" circles sit, seen from each place
  const WALKS = {
    entry:   [{to: 'living', at: [0.4, 2.6, -3.0]}],
    living:  [{to: 'entry', at: [-3.4, 2.4, -1.6]}, {to: 'kitchen', at: [12.7, 3.3, 4.7]}],
    kitchen: [{to: 'living', at: [12.75, 3.2, 5.3]}, {to: 'coffee', at: [17.0, 2.6, 9.7]}, {to: 'great', at: [15.7, 2.2, 18.2]}],
    coffee:  [{to: 'kitchen', at: [12.3, 2.8, 8.6]}, {to: 'great', at: [15.8, 1.6, 15.2]}],
    great:   [{to: 'kitchen', at: [15.5, 3.2, 16.6]}]};

  /* ================================================================== state */
  const KEY = 'esc.easy.v2';
  const S = {started: false, done: false, t0: 0, hints: 0, stage: 'arrive', place: null, ex: null, busy: false,
    seen: {}, visited: {}, doorShut: false, sawDrawing: false, sawLight: false, readCode: false, wrong: 0, lastProgress: 0,
    coach: {look: false, walk: false, tap: false}, dragPx: 0, hour: 10};
  const elapsed = () => S.t0 ? ((S.tEnd || performance.now()) - S.t0) / 1000 : 0;

  /* ================================================================== sun */
  function sunDir(h){ const p = H.sunPosition(h, DOY), plan = p.az - 46.14 * Math.PI / 180, alt = Math.max(p.alt, -.02);
    return new THREE.Vector3(Math.cos(plan) * Math.cos(alt), Math.sin(alt), Math.sin(plan) * Math.cos(alt)).normalize(); }
  if(!H.TOD.find(t => t.key === 'esc')) H.TOD.push({key: 'esc', label: 'Morning', h: 10, doy: DOY});
  let todAt = 0, todTimer = 0;
  function applyHour(h, force){ S.hour = h; const T = H.TOD.find(t => t.key === 'esc'); T.h = h; T.doy = DOY; T.label = fmtH(h);
    LIGHT.update(); wake(30); clearTimeout(todTimer); if(DRAW.mesh) DRAW.mesh.material.color.setScalar(h >= 18.55 ? .5 : .84); const now = performance.now();
    const go = () => { todAt = performance.now(); try{ H.setTOD(h >= 18.55 ? 'dusk' : 'esc'); }catch(e){ console.warn('[escape] tod', e); } wake(20); };
    if(force || now - todAt > 420) go(); else todTimer = setTimeout(go, 200); }

  /* ================================================================== the engine keeps out of the way */
  const css0 = `html.esc header.bar, html.esc #card, html.esc #mini, html.esc #cv27, html.esc #labels, html.esc #wplabels, html.esc #ovtag, html.esc #tod, html.esc #viewBtn,
    html.esc #hwBtn, html.esc #tgBtn, html.esc #phMore, html.esc .g28pill, html.esc #navHelp, html.esc #pad, html.esc #peek27, html.esc #v33disc, html.esc #hint, html.esc #joy,
    html.esc .navguide, html.esc .phtoast, html.esc .perfpill, html.esc #wptip, html.esc #door28tip, html.esc #door28hint, html.esc .qhint, html.esc .phlvbar, html.esc #ov{display:none!important}
    html.esc.esc-up #loading{display:none!important}
    html.esc #c{cursor:grab;touch-action:none} html.esc.esc-drag #c{cursor:grabbing}`;
  document.head.appendChild(el('style', {}, css0)); document.documentElement.classList.add('esc');
  H.hooks.click = () => true;
  const ptrs = new Map(); let pinch = 0;
  const onCanvas = e => e.target === canvas;
  addEventListener('pointerdown', e => { if(!onCanvas(e)) return; e.stopPropagation();
    if(!S.started || S.done) return; try{ canvas.setPointerCapture(e.pointerId); canvas.focus({preventScroll: true}); }catch(_){}
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), far: 0}); pinch = 0;
    document.documentElement.classList.add('esc-drag'); SND.unlock(); closeMenu(); }, true);
  addEventListener('pointermove', e => { if(!onCanvas(e)) return; e.stopPropagation(); const p = ptrs.get(e.pointerId); if(!p) return;
    if(e.pointerType === 'mouse' && e.buttons === 0){ endPtr(e, false); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.far = Math.max(p.far, Math.hypot(p.x - p.sx, p.y - p.sy));
    if(ptrs.size >= 2){ const [a, b] = [...ptrs.values()], d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); if(pinch) rig.zoom = clamp(rig.zoom * pinch / d, .5, 1); pinch = d; return; }
    rigDrag(dx, dy); }, true);
  function endPtr(e, tap){ const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); pinch = 0; if(!ptrs.size) document.documentElement.classList.remove('esc-drag');
    try{ canvas.releasePointerCapture(e.pointerId); }catch(_){}
    if(tap && p && p.far < 7 && performance.now() - p.t < 450) tapAt(e.clientX, e.clientY); }
  addEventListener('pointerup', e => { if(onCanvas(e)) e.stopPropagation(); if(ptrs.has(e.pointerId)) endPtr(e, onCanvas(e)); }, true);
  addEventListener('pointercancel', e => { if(onCanvas(e)) e.stopPropagation(); if(ptrs.has(e.pointerId)) endPtr(e, false); }, true);
  canvas.addEventListener('lostpointercapture', e => { if(ptrs.has(e.pointerId)) endPtr(e, false); });
  addEventListener('blur', () => { ptrs.clear(); pinch = 0; document.documentElement.classList.remove('esc-drag'); });
  document.addEventListener('visibilitychange', () => { if(document.hidden){ ptrs.clear(); pinch = 0; document.documentElement.classList.remove('esc-drag'); } });
  addEventListener('wheel', e => { if(!onCanvas(e)) return; e.stopPropagation(); e.preventDefault(); if(!S.started || S.done || rig.move) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1); rig.zoom = clamp(rig.zoom * Math.exp(clamp(dy, -240, 240) * .0016), .5, 1); }, {capture: true, passive: false});
  for(const t of ['dblclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend']) addEventListener(t, e => { if(onCanvas(e)){ e.stopPropagation(); if(t === 'contextmenu') e.preventDefault(); } }, {capture: true, passive: t !== 'contextmenu'});
  // keys: the tour's shortcuts (arrows and space jump between tour stops) must never fire during the game
  addEventListener('keydown', e => { const dlg = document.querySelector('dialog[open]'); if(dlg) return; e.stopPropagation();
    if(!S.started || S.done) return; const tag = (e.target && e.target.tagName) || '';
    if(e.key === 'Escape'){ if(menuOpen()) closeMenu(); else if(mapOpen()) setMap(false); else if(S.ex) back(); return; }
    if(/INPUT|TEXTAREA|SELECT/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
    if(S.ex && S.ex.id === 'fridge' && /^[0-9]$/.test(e.key)){ padPress(e.key); e.preventDefault(); return; }
    if(S.ex && S.ex.id === 'fridge' && e.key === 'Backspace'){ padPress('c'); e.preventDefault(); return; }
    if(tag === 'BUTTON' || tag === 'A') return;
    const k = {ArrowLeft: [.16, 0], ArrowRight: [-.16, 0], ArrowUp: [0, .1], ArrowDown: [0, -.1]}[e.key];
    if(k && !rig.move){ e.preventDefault(); rigTurn(k[0], k[1]); S.dragPx += 60; } }, true);
  addEventListener('keyup', e => { if(!document.querySelector('dialog[open]')) e.stopPropagation(); }, true);

  /* ================================================================== camera rig */
  const rig = {pos: new THREE.Vector3(), yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, fov: 62, zoom: 1, off: [0, 0], lim: null, move: null, wakeN: 0, jit: 0, sig: ''};
  const yp = (from, to) => { const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2]; return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
  const aspect = () => (canvas.clientWidth || innerWidth) / Math.max(1, canvas.clientHeight || innerHeight);
  // a place view is authored for a landscape frame; a tall phone keeps the same sideways coverage where it can
  function placeFov(base){ base = base || 62; const a = aspect(); if(a >= 1.25) return base; const t = Math.tan(base / 2 * Math.PI / 180) * 1.25 / a; return Math.min(86, 2 * Math.atan(t) * 180 / Math.PI); }
  function fitFov(fit, dist, free){ const a = aspect(), tv = (fit.h / 2 / dist) / free.fh, th = (fit.w / 2 / dist) / (free.fw * a); return clamp(2 * Math.atan(Math.max(tv, th) * 1.1) * 180 / Math.PI, 22, 86); }
  function wake(n){ rig.wakeN = Math.max(rig.wakeN, n || 20); }
  function rigDrag(dx, dy){ if(rig.move || !S.started || S.done) return; const k = (camera.fov * Math.PI / 180) / Math.max(200, canvas.clientHeight) * 1.05;
    rigTurn(dx * k, dy * k); S.dragPx += Math.abs(dx) + Math.abs(dy); }
  function rigTurn(dyaw, dpitch){ rig.tyaw += dyaw; rig.tpitch += dpitch;
    if(rig.lim){ const L = rig.lim; rig.tyaw = L.yaw + clamp(angDiff(L.yaw, rig.tyaw), -L.ry, L.ry); rig.tpitch = clamp(rig.tpitch, L.pitch - L.rp, L.pitch + L.rp); }
    else rig.tpitch = clamp(rig.tpitch, -1.05, .8); }
  function rigCut(pos, yaw, pitch, fov, off){ rig.move = null; rig.pos.set(pos[0], pos[1], pos[2]); rig.yaw = rig.tyaw = yaw; rig.pitch = rig.tpitch = pitch; rig.fov = fov; rig.off = off || [0, 0]; rig.zoom = 1; rig.sig = ''; }
  // travel along a list of points; "face" turns the head along the route in the middle of a longer walk
  function rigTravel(pts, to, opts){ opts = opts || {}; const v = pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    let len = 0; for(let i = 1; i < v.length; i++) len += v[i].distanceTo(v[i - 1]);
    const curve = v.length > 2 ? new THREE.CatmullRomCurve3(v, false, 'centripetal', .5) : null;
    const dur = reduce ? .01 : (opts.dur || clamp(.55 + len / 12, .8, 4.2));
    rig.move = {t0: performance.now(), dur: dur * 1000, v, curve, len, face: !!opts.face && len > 9, yaw0: rig.yaw, pitch0: rig.pitch, fov0: rig.fov * rig.zoom, off0: rig.off.slice(),
      yaw1: to.yaw, pitch1: to.pitch, fov1: to.fov, off1: to.off || [0, 0], done: opts.done || null};
    rig.zoom = 1; rig.fov = rig.move.fov0; rig.lim = null; return dur; }
  const _p = new THREE.Vector3(), _t = new THREE.Vector3();
  function rigStep(now, dt){
    const m = rig.move;
    if(m){ const u = clamp((now - m.t0) / m.dur, 0, 1), e = ease(u);
      if(m.curve){ m.curve.getPointAt(e, _p); rig.pos.copy(_p); } else rig.pos.lerpVectors(m.v[0], m.v[m.v.length - 1], e);
      let yaw = m.yaw0 + angDiff(m.yaw0, m.yaw1) * (m.face ? smooth(.45, 1, u) : e), pitch = lerp(m.pitch0, m.pitch1, e);
      if(m.face && m.curve){ m.curve.getTangentAt(clamp(e, .001, .999), _t); const ty = Math.atan2(-_t.x, -_t.z), w = smooth(0, .25, u) * (1 - smooth(.5, .92, u));
        const base = m.yaw0 + angDiff(m.yaw0, m.yaw1) * smooth(.45, 1, u); yaw = base + angDiff(base, ty) * w; pitch = lerp(pitch, -.06, w * .8); }
      rig.yaw = rig.tyaw = yaw; rig.pitch = rig.tpitch = pitch; rig.fov = lerp(m.fov0, m.fov1, e); rig.off = [lerp(m.off0[0], m.off1[0], e), lerp(m.off0[1], m.off1[1], e)];
      if(u >= 1){ rig.move = null; rig.yaw = rig.tyaw = m.yaw1; rig.pitch = rig.tpitch = m.pitch1; rig.fov = m.fov1; rig.off = m.off1.slice(); if(m.done) try{ m.done(); }catch(err){ console.error('[escape] arrive', err); } }
    } else {
      const k = 1 - Math.exp(-dt * 18); rig.yaw += angDiff(rig.yaw, rig.tyaw) * k; rig.pitch += (rig.tpitch - rig.pitch) * k;
      if(Math.abs(angDiff(rig.yaw, rig.tyaw)) < 2e-4) rig.yaw = rig.tyaw; if(Math.abs(rig.tpitch - rig.pitch) < 2e-4) rig.pitch = rig.tpitch; }
    if(rig.wakeN > 0){ rig.wakeN--; rig.jit = rig.jit ? 0 : 2e-4; }
    // write the pose only when it changed, so a still view lets the engine render its sharp frame
    const fov = clamp(rig.fov * (rig.move ? 1 : rig.zoom), 18, 88);
    const sig = [rig.pos.x, rig.pos.y + rig.jit, rig.pos.z, rig.yaw, rig.pitch, fov, rig.off[0], rig.off[1], aspect()].map(n => n.toFixed(5)).join(',');
    const drift = H.anim || H.nav !== 'look' || camera.position.distanceToSquared(_p.set(rig.pos.x, rig.pos.y + rig.jit, rig.pos.z)) > 1e-7;
    if(sig === rig.sig && !drift) return; rig.sig = sig;
    const cp = Math.cos(rig.pitch), x = rig.pos.x, y = rig.pos.y + rig.jit, z = rig.pos.z;
    H.look([x, y, z], [x - Math.sin(rig.yaw) * cp * 10, y + Math.sin(rig.pitch) * 10, z - Math.cos(rig.yaw) * cp * 10]);
    const ox = rig.off[0], oy = rig.off[1];
    const cw = Math.max(1, canvas.clientWidth || innerWidth), ch = Math.max(1, canvas.clientHeight || innerHeight);
    if(Math.abs(ox) > 1e-4 || Math.abs(oy) > 1e-4) camera.setViewOffset(cw, ch, -ox * cw, -oy * ch, cw, ch); else if(camera.view) camera.clearViewOffset();
    camera.aspect = cw / ch;
    camera.fov = fov; camera.zoom = 1; camera.userData.sy = 0; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); }

  /* ================================================================== routes */
  function route(a, b){ if(a === b) return [a]; const adj = {}; for(const [p, q] of EDGES){ const d = Math.hypot(NODES[p][0] - NODES[q][0], NODES[p][1] - NODES[q][1]); (adj[p] = adj[p] || []).push([q, d]); (adj[q] = adj[q] || []).push([p, d]); }
    const dist = {[a]: 0}, prev = {}, open = new Set([a]);
    while(open.size){ let u = null; for(const k of open) if(u == null || dist[k] < dist[u]) u = k; open.delete(u); if(u === b) break;
      for(const [w, d] of (adj[u] || [])){ const nd = dist[u] + d; if(dist[w] == null || nd < dist[w]){ dist[w] = nd; prev[w] = u; open.add(w); } } }
    const out = [b]; let c = b; while(prev[c]){ c = prev[c]; out.unshift(c); } return out[0] === a ? out : [a, b]; }

  /* ================================================================== sunlight on the floor (the engine draws no indoor sun patches) */
  const LIGHT = {rooms: [], update(){ for(const r of LIGHT.rooms) r.update(); }};
  function opening(id){ const o = H.BIM2S.meta.openings.find(q => q.id === id); if(!o) return null; const c = W2(o.center[0], o.center[1]), a = W2(o.axis[0], o.axis[1]), n = W2(o.normal[0], o.normal[1]);
    return {o, c, a, n, P: (along, y) => new THREE.Vector3(c[0] + a[0] * along, y, c[1] + a[1] * along)}; }
  // a room's floor with the light of one or more openings: each has a top and bottom, frame bars that block light, and optional paper strips
  function floorLight(roomId, wins, opts){ opts = opts || {};
    const sp = H.BIM2S.meta.spaces.find(q => q.id === roomId); if(!sp) return null;
    const poly = (opts.clip || (sp.poly || sp.polygon).map(p => W2(p[0], p[1]))), xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const bb = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], ppf = opts.ppf || 36, fy = (sp.floorZ || 0) + .05;
    const cv = document.createElement('canvas'); cv.width = Math.ceil((bb[2] - bb[0]) * ppf); cv.height = Math.ceil((bb[3] - bb[1]) * ppf); const g = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.premultiplyAlpha = true; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    // light multiplies what is under it: out = floor * (1 + light), so oak stays oak and a rug stays a rug
    const mat = new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(bb[2] - bb[0], bb[3] - bb[1]), mat); mesh.rotation.x = -Math.PI / 2; mesh.position.set((bb[0] + bb[2]) / 2, fy, (bb[1] + bb[3]) / 2);
    mesh.renderOrder = 2; mesh.name = 'esc-light'; mesh.raycast = () => {}; H.grp('main').add(mesh);
    const px = v => [(v.x - bb[0]) * ppf, (v.z - bb[1]) * ppf];
    const path = pts => { g.beginPath(); pts.forEach((p, i) => { const q = px(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); };
    const W = wins.map(w => { const op = opening(w.id); if(!op) return null; const half = op.o.width / 2 - (w.inset == null ? .2 : w.inset), top = w.top || op.o.head, bot = w.bot == null ? op.o.sill : w.bot;
      return {w, op, quad: [op.P(-half, bot), op.P(half, bot), op.P(half, top), op.P(-half, top)], bars: (w.bars || []).map(b => [op.P(b[0], b[2]), op.P(b[1], b[2]), op.P(b[1], b[3]), op.P(b[0], b[3])]), s: 0}; }).filter(Boolean);
    const api = {mesh, wins: W, fy,
      update(){ const d = sunDir(S.hour), low = 1 - Math.min(1, d.y / .5); g.clearRect(0, 0, cv.width, cv.height); let any = false;
        const proj = v => { const t = (v.y - fy) / d.y; return new THREE.Vector3(v.x - d.x * t, fy, v.z - d.z * t); };
        for(const it of W){ const into = d.x * it.op.n[0] + d.z * it.op.n[1];   // sun on the outside of this opening
          const s = it.s = clamp((d.y - .02) / .09, 0, 1) * clamp(into / .18, 0, 1); if(s <= 0) continue; any = true;
          g.save(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = s; g.shadowColor = g.fillStyle = `rgb(255,${Math.round(238 - 46 * low)},${Math.round(206 - 86 * low)})`; g.shadowBlur = 2.5;
          // draw this opening on its own layer first, so its bars and strips cut only its own light
          if(!api.tmp){ api.tmp = document.createElement('canvas'); api.tmp.width = cv.width; api.tmp.height = cv.height; } const tg = api.tmp.getContext('2d'); tg.clearRect(0, 0, cv.width, cv.height);
          const tpath = pts => { tg.beginPath(); pts.forEach((p, i) => { const q = px(p); i ? tg.lineTo(q[0], q[1]) : tg.moveTo(q[0], q[1]); }); tg.closePath(); };
          tg.globalCompositeOperation = 'source-over'; tg.globalAlpha = 1; tg.fillStyle = tg.shadowColor = g.fillStyle; tg.shadowBlur = 3; tpath(it.quad.map(proj)); tg.fill();
          tg.globalCompositeOperation = 'destination-out'; tg.shadowColor = tg.fillStyle = '#000'; tg.shadowBlur = 2;
          for(const b of it.bars){ tpath(b.map(proj)); tg.fill(); }
          for(const st of (it.w.strips || [])){ tg.globalAlpha = st.card ? 1 : .1; tg.shadowBlur = st.card ? 2.5 : 0; tpath(st.quad.map(proj)); tg.fill(); }
          tg.globalAlpha = 1; tg.shadowBlur = 0; tg.globalCompositeOperation = 'source-over';
          g.shadowBlur = 0; g.drawImage(api.tmp, 0, 0); g.restore(); }
        if(any){ g.save(); g.globalCompositeOperation = 'destination-in'; g.beginPath(); poly.forEach((p, i) => { const q = px({x: p[0], z: p[1]}); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); g.restore(); }
        mesh.visible = any; const gain = opts.gain || 1.45; mat.color.setRGB(gain, gain * .94, gain * .8); tex.needsUpdate = true; }};
    LIGHT.rooms.push(api); return api; }

  /* ================================================================== paper strips on the glass: three boxy figures, card or tracing paper */
  const SEG = {0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd'};
  function segRects(){ const h = 1.7, t = .2, g = .045, m = h / 2; return {   // unit box: 1 wide, 1.7 tall; [u0, v0, u1, v1]
      a: [t + g, h - t, 1 - t - g, h], g: [t + g, m - t / 2, 1 - t - g, m + t / 2], d: [t + g, 0, 1 - t - g, t],
      f: [0, m + g, t, h], b: [1 - t, m + g, 1, h], e: [0, 0, t, m - g], c: [1 - t, 0, 1, m - g]}; }
  // floor frame: origin, "right" and "up" directions on the floor, digit width; each strip is the floor rectangle carried back along the 4 PM sun to the glass
  function makeStrips(code, frame, win){ const d = sunDir(T_SUN), R = segRects(), out = [], dn = d.x * win.n[0] + d.z * win.n[1];
    [...code].forEach((ch, k) => { for(const s of 'abcdefg'){ const r = R[s], card = SEG[ch].includes(s);
      const quad = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map(([u, v]) => { const fx = frame.o[0] + (u + k * frame.pitch) * frame.size * frame.right[0] + v * frame.size * frame.up[0],
          fz = frame.o[1] + (u + k * frame.pitch) * frame.size * frame.right[1] + v * frame.size * frame.up[1];
        const t = ((win.c[0] - fx) * win.n[0] + (win.c[1] - fz) * win.n[1]) / dn; return new THREE.Vector3(fx + d.x * t, frame.floorY + d.y * t, fz + d.z * t); });
      out.push({quad, card, digit: k, seg: s}); } }); return out; }
  const PAPER = {group: null, card: null, vellum: null, box: null};
  function buildPaper(strips, win){ const g = new THREE.Group(); g.name = 'esc-paper';
    PAPER.card = new THREE.MeshStandardMaterial({color: lin(0xf4f0e6), roughness: .95, metalness: 0, side: THREE.DoubleSide, emissive: lin(0xf4f0e6), emissiveIntensity: .1});
    PAPER.vellum = new THREE.MeshStandardMaterial({color: lin(0xf6f3ea), roughness: .9, metalness: 0, side: THREE.DoubleSide, emissive: lin(0xf6f3ea), emissiveIntensity: .1, transparent: true, opacity: .93});
    const box = new THREE.Box3(), inX = -win.n[0] * .014, inZ = -win.n[1] * .014;   // a hair inside the glass
    for(const s of strips){ const geo = new THREE.BufferGeometry(), q = s.quad, a = [];
      for(const i of [0, 1, 2, 0, 2, 3]) a.push(q[i].x + inX, q[i].y, q[i].z + inZ);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, s.card ? PAPER.card : PAPER.vellum); m.raycast = () => {}; m.renderOrder = 4; g.add(m); q.forEach(v => box.expandByPoint(v)); }
    H.grp('main').add(g); PAPER.group = g; PAPER.box = box; return g; }
  // with the sun behind them, card goes dark against the light and tracing paper glows: the same truth the floor shows
  function paperLight(s){ if(!PAPER.card) return; const k = clamp(s, 0, 1); PAPER.card.color.copy(lin(0xf4f0e6)).multiplyScalar(1 - .5 * k); PAPER.card.emissiveIntensity = .1 * (1 - k); PAPER.vellum.emissiveIntensity = .1 + .5 * k; }

  /* ================================================================== Snowball's drawing on the pocket door, signed with a paw print */
  function drawingCanvas(){ const w = 760, h = 1360, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const kg = x.createLinearGradient(0, 0, w, h); kg.addColorStop(0, '#d8bb8c'); kg.addColorStop(1, '#c9a873'); x.fillStyle = kg; x.fillRect(26, 58, w - 52, h - 86);
    for(let i = 0; i < 2600; i++){ x.fillStyle = `rgba(88,58,22,${rnd() * .055})`; x.fillRect(26 + rnd() * (w - 52), 58 + rnd() * (h - 86), 1 + rnd() * 5, 1); }
    x.fillStyle = 'rgba(120,84,40,.10)'; x.fillRect(26, 58, w - 52, 5); x.fillRect(26, h - 33, w - 52, 5);
    const tape = (cx, cy, a) => { x.save(); x.translate(cx, cy); x.rotate(a); x.fillStyle = 'rgba(243,232,200,.9)'; x.fillRect(-92, -26, 184, 52); x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(-92, -26, 184, 8); x.restore(); };
    tape(118, 66, -.17); tape(w - 118, 66, .15);
    const ink = '#1c2030'; x.strokeStyle = ink; x.fillStyle = ink; x.lineCap = 'round'; x.lineJoin = 'round';
    const line = (pts, lw) => { x.lineWidth = lw; x.beginPath(); pts.forEach((p, i) => { const j = (rnd() - .5) * lw * .3; i ? x.lineTo(p[0] + j, p[1] + j) : x.moveTo(p[0], p[1]); }); x.stroke(); };
    // low sun on a horizon
    line([[70, 520], [300, 518]], 9); x.lineWidth = 9; x.beginPath(); x.arc(170, 516, 54, Math.PI, 0); x.stroke();
    for(let i = 0; i < 7; i++){ const a = Math.PI + (i + .5) / 7 * Math.PI; line([[170 + Math.cos(a) * 74, 516 + Math.sin(a) * 74], [170 + Math.cos(a) * 106, 516 + Math.sin(a) * 106]], 7); }
    // two big panes side by side, with a sill
    for(const wx of [356, 520]){ x.lineWidth = 10; x.strokeRect(wx, 190, 150, 300); line([[wx + 16, 262], [wx + 46, 232]], 5); line([[wx + 16, 300], [wx + 70, 246]], 5); }
    line([[338, 502], [690, 502]], 12);
    // the light goes through the glass and lands on the floor
    line([[250, 470], [340, 400]], 7); line([[312, 398], [342, 398], [340, 428]], 7);
    line([[300, 590], [700, 590], [640, 760], [180, 760], [300, 590]], 7);
    x.save(); x.setLineDash([16, 14]); line([[430, 505], [330, 640]], 5); line([[596, 505], [520, 640]], 5); x.restore();
    x.font = '600 96px Caveat, "Segoe Print", "Bradley Hand", cursive'; x.textAlign = 'center'; x.fillText('?  ?  ?', 440, 712);
    // a clock at four
    const cx = 380, cy = 1010, r = 150; x.lineWidth = 11; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    for(let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2, r0 = i % 3 ? r - 20 : r - 34; line([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)]], i % 3 ? 5 : 9); }
    x.font = '600 50px Caveat, "Segoe Print", "Bradley Hand", cursive'; x.textBaseline = 'middle';
    for(const [n, a] of [['12', -90], ['3', 0], ['6', 90], ['9', 180]]){ const q = a * Math.PI / 180; x.fillText(n, cx + Math.cos(q) * (r - 62), cy + Math.sin(q) * (r - 62) + 3); }
    line([[cx, cy], [cx, cy - 104]], 9); const a4 = (4 / 12) * Math.PI * 2 - Math.PI / 2; line([[cx, cy], [cx + Math.cos(a4) * 70, cy + Math.sin(a4) * 70]], 13);
    x.beginPath(); x.arc(cx, cy, 11, 0, Math.PI * 2); x.fill();
    // signed with a paw print: one pad and four toes, pressed on at a slight angle
    x.save(); x.translate(w - 150, h - 128); x.rotate(-.22); x.beginPath(); x.ellipse(0, 18, 31, 26, 0, 0, Math.PI * 2); x.fill();
    for(const [dx, dy, a] of [[-38, -17, -.5], [-14, -40, -.15], [14, -40, .15], [38, -17, .5]]){ x.beginPath(); x.ellipse(dx, dy, 11.5, 16, a, 0, Math.PI * 2); x.fill(); } x.restore();
    return c; }
  const DRAW = {mesh: null, tex: null};
  function buildDrawing(){ const pd = (H.door28 && H.door28.items || []).find(it => it.id === 'R28-POCKET'); S.pocket = pd || null;
    const tex = DRAW.tex = new THREE.CanvasTexture(drawingCanvas()); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
    // unlit, so the kraft paper keeps its colour whatever the hour (the lit version washed out in the low afternoon sun)
    const m = DRAW.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 3.13), new THREE.MeshBasicMaterial({map: tex, transparent: true, toneMapped: false}));
    m.name = 'esc-drawing'; m.renderOrder = 3; m.rotation.y = -Math.PI / 2; m.raycast = () => {}; m.material.color.setScalar(.84);
    if(!placeDrawing()){ H.grp('main').add(m); m.position.set(22.149, 4.1, 9.525); m.visible = false; DRAW.loose = true; }
    // the handwriting font may arrive after the first draw
    try{ document.fonts.load('600 60px Caveat').then(() => { tex.image = drawingCanvas(); tex.needsUpdate = true; wake(4); }); }catch(e){} }
  // the sheet rides on the sliding leaf, a hair off its kitchen face (measured from the leaf's own geometry each time, never assumed)
  function placeDrawing(){ const pd = S.pocket, m = DRAW.mesh, leaf = pd && pd.parts && pd.parts.find(q => q.k === 0); if(!m || !leaf || !leaf.piv) return false;
    let minx = Infinity; for(const c of leaf.piv.children){ if(c === m || !c.geometry) continue; if(!c.geometry.boundingBox) c.geometry.computeBoundingBox(); const b = c.geometry.boundingBox; if(b && isFinite(b.min.x)) minx = Math.min(minx, b.min.x + c.position.x); }
    if(!isFinite(minx)) minx = -.0623; if(m.parent !== leaf.piv) leaf.piv.add(m); m.position.set(minx - .006, 4.1, 0); m.visible = true; DRAW.loose = false; return true; }
  function slideDoor(shut){ const it = S.pocket; S.doorShut = shut; SND.slide(); placeDrawing();
    if(it && H.door28 && H.door28.moving){ it.dir = shut ? -1 : 1; it.lt = performance.now(); H.door28.moving.add(it); } else if(DRAW.mesh && DRAW.loose) DRAW.mesh.visible = shut; wake(70); }

  /* ================================================================== the drinks fridge: a bottle inside, a keypad lock, and a door that opens */
  const FR = {pivot: null, lock: null, lockTex: null, glow: null, open: 0, anim: null};
  function buildFridge(){ let bc = null; const v = new THREE.Vector3();
    H.scene.traverse(o => { if(bc || o.name !== 'beverageCooler') return; o.getWorldPosition(v); if(Math.abs(v.x - 19.64) < 1.2 && Math.abs(v.z - 13.5) < 1.6 && Math.abs(v.y) < 1) bc = o; });
    const host = H.grp('main');
    // a champagne bottle lying on the middle shelf
    const prof = [[0, 0], [.13, 0], [.145, .02], [.145, .52], [.12, .62], [.06, .78], [.05, .97], [.058, .975], [.058, 1.0], [0, 1.0]].map(p => new THREE.Vector2(p[0], p[1]));
    const glassM = new THREE.MeshStandardMaterial({color: lin(0x0d3a25), roughness: .22, metalness: .1, emissive: lin(0x0a3320), emissiveIntensity: .32});
    const foilM = new THREE.MeshStandardMaterial({color: lin(0xd2a646), roughness: .35, metalness: .7, emissive: lin(0x8a6418), emissiveIntensity: .7});
    const labelM = new THREE.MeshStandardMaterial({color: lin(0xf1ead8), roughness: .8, emissive: lin(0xf1ead8), emissiveIntensity: .35});
    const bottle = new THREE.Group(); bottle.name = 'esc-bottle';
    bottle.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 28), glassM));
    const foil = new THREE.Mesh(new THREE.CylinderGeometry(.062, .068, .26, 20), foilM); foil.position.y = .875; bottle.add(foil);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.07, 16, 10), foilM); cap.position.y = 1.0; cap.scale.y = .7; bottle.add(cap);
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(.148, .148, .26, 28, 1, true), labelM); lab.position.y = .3; bottle.add(lab);
    bottle.rotation.z = Math.PI / 2; bottle.rotation.y = .12; bottle.position.set(20.16, 1.37 + .152, 12.5); bottle.traverse(o => { o.raycast = () => {}; }); host.add(bottle); FR.bottle = bottle;
    // warm light spilling out when it opens
    const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gx = gc.getContext('2d'), gr = gx.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,226,170,1)'); gr.addColorStop(.4, 'rgba(255,205,130,.45)'); gr.addColorStop(1, 'rgba(255,190,110,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
    const glow = FR.glow = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0})); glow.position.set(19.64, 1.75, 13.2); glow.scale.set(2.7, 2.9, 1); glow.raycast = () => {}; glow.renderOrder = 6; host.add(glow);
    // the keypad lock stuck to the glass
    const lc = document.createElement('canvas'); lc.width = 256; lc.height = 128; FR.lockCv = lc; const lt = FR.lockTex = new THREE.CanvasTexture(lc); lt.encoding = THREE.sRGBEncoding; lt.anisotropy = 4;
    const lock = FR.lock = new THREE.Mesh(new THREE.BoxGeometry(.5, .25, .035), [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({color: lin(0x1a1c22), roughness: .5, metalness: .4})).concat([new THREE.MeshBasicMaterial({map: lt, toneMapped: false}), new THREE.MeshStandardMaterial({color: lin(0x1a1c22)})]));
    lock.rotation.y = Math.PI; lock.position.set(19.9, 2.42, 11.672); lock.raycast = () => {}; lock.name = 'esc-lock'; host.add(lock); lockFace('', 'locked');
    if(!bc) return;
    try{ // split the door from the toe grille, and hang it (with its glass) on a hinge at the right-hand side
      const st = bc.children.find(c => c.name === 'stainless'); if(!st) return; st.updateWorldMatrix(true, false);
      const g0 = st.geometry.index ? st.geometry.toNonIndexed() : st.geometry.clone(), pos = g0.attributes.position, door = [], toe = [];
      let hx = 1e9, hz = 0, n = 0;
      for(let i = 0; i < pos.count; i += 3){ let ymax = -1e9; for(let k = 0; k < 3; k++){ v.fromBufferAttribute(pos, i + k).applyMatrix4(st.matrixWorld); ymax = Math.max(ymax, v.y); if(v.z > 11.68){ hx = Math.min(hx, v.x); hz += v.z; n++; } } (ymax <= .37 ? toe : door).push(i); }
      const sub = tris => { const ng = new THREE.BufferGeometry(); for(const name in g0.attributes){ const a = g0.attributes[name], sz = a.itemSize, arr = new Float32Array(tris.length * 3 * sz); let w = 0;
          for(const i of tris) for(let k = 0; k < 3; k++) for(let c = 0; c < sz; c++) arr[w++] = a.array[(i + k) * sz + c]; ng.setAttribute(name, new THREE.BufferAttribute(arr, sz)); } ng.computeBoundingBox(); ng.computeBoundingSphere(); return ng; };
      if(door.length < 6 || !isFinite(hx)) return;
      const mk = tris => { const m = new THREE.Mesh(sub(tris), st.material); m.position.copy(st.position); m.quaternion.copy(st.quaternion); m.scale.copy(st.scale); m.castShadow = st.castShadow; m.receiveShadow = st.receiveShadow; m.userData = st.userData; return m; };
      const dm = mk(door); dm.name = 'esc-cooler-door'; st.parent.add(dm); if(toe.length){ const tm = mk(toe); tm.name = 'stainless-toe'; st.parent.add(tm); } st.visible = false;
      const pivot = FR.pivot = new THREE.Group(); pivot.name = 'esc-cooler-hinge'; pivot.position.set(hx + .02, 0, n ? hz / n : 11.72); host.add(pivot); host.updateWorldMatrix(true, true);
      for(const m of [dm].concat(bc.children.filter(c => /^r8(glass|sheen|led)$/.test(c.name))).concat([lock])) pivot.attach(m);
    }catch(e){ console.warn('[escape] fridge door', e); FR.pivot = null; } }
  function lockFace(txt, state){ const c = FR.lockCv; if(!c) return; const x = c.getContext('2d'); x.fillStyle = '#14161c'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#05070c'; x.fillRect(16, 22, 168, 84); x.font = '600 66px "IBM Plex Mono", ui-monospace, Menlo, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = state === 'open' ? '#7cf0a6' : state === 'bad' ? '#ff7a6b' : '#ffd77a'; for(let i = 0; i < 3; i++) x.fillText(txt[i] || '·', 46 + i * 54, 66);
    x.beginPath(); x.arc(220, 64, 15, 0, Math.PI * 2); x.fillStyle = state === 'open' ? '#55e08a' : '#e2503f'; x.fill(); FR.lockTex.needsUpdate = true; wake(4); }
  function openFridgeDoor(){ FR.anim = {t0: performance.now(), dur: reduce ? 10 : 1100}; SND.fridge(); }
  function fridgeStep(now){ if(!FR.anim) return; const u = clamp((now - FR.anim.t0) / FR.anim.dur, 0, 1), e = 1 - Math.pow(1 - u, 3); FR.open = e;
    if(FR.pivot) FR.pivot.rotation.y = e * 1.78; if(FR.glow) FR.glow.material.opacity = .75 * e; wake(3); if(u >= 1) FR.anim = null; }

  /* ================================================================== Snowball in the house (a billboard of the shared drawing) */
  let CAT = null;
  function loadSnowball(cb){ if(window.SNOWBALL) return cb(); const s = document.createElement('script'); s.src = '../assets/snowball.js?v=36'; s.onload = cb; s.onerror = cb; document.head.appendChild(s); }
  function makeCat(){ if(CAT || !window.SNOWBALL) return CAT; const img = new Image(), cv = document.createElement('canvas'); cv.width = 384; cv.height = 590;
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    img.onload = () => { cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); tex.needsUpdate = true; wake(4); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SNOWBALL.svg({id: 'sb3d', seed: 7, glow: true}).replace('<svg ', '<svg width="384" height="590" '));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false, opacity: 0})); sp.center.set(.5, .03); sp.scale.set(.86, 1.32, 1); sp.visible = false; sp.name = 'esc-snowball'; sp.renderOrder = 5; sp.raycast = () => {};
    H.scene.add(sp); CAT = sp; return sp; }
  function catAt(p){ const c = makeCat(); if(!c) return; const go = () => { c.position.set(p[0], p[1], p[2]); c.visible = true; fadeCat(1); };
    if(c.visible && c.material.opacity > .05 && c.position.distanceTo(new THREE.Vector3(p[0], p[1], p[2])) > .5){ fadeCat(0, go); } else go(); }
  function fadeCat(to, then){ const c = CAT; if(!c) return; const from = c.material.opacity, t0 = performance.now(); c._f = t0;
    (function f(){ if(c._f !== t0) return; const k = Math.min(1, (performance.now() - t0) / 380); c.material.opacity = lerp(from, to, k); wake(2); if(k < 1) requestAnimationFrame(f); else { if(to === 0) c.visible = false; if(then) then(); } })(); }

  /* ================================================================== sound
     One small set, all Web Audio: soft mallet and bell tones built from a few decaying sine partials, every pitch from D major
     pentatonic so the cues are in tune with each other, filtered noise for the door and the fizz, a short feedback delay for a
     little room, and a compressor before a quiet master. Nothing plays before the first tap; the context sleeps with the tab.
     (tour/hwsfx.js was considered and left alone: it is a Halloween palette with its own mute state.) */
  const SND = (() => {
    const N = {D3: 146.83, A3: 220, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, B4: 493.88, D5: 587.33, E5: 659.26, Fs5: 739.99, A5: 880, B5: 987.77, D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760, B6: 1975.53};
    const MASTER = .5, K = reduce ? .6 : 1;   // reduced motion: the same cues, shorter tails
    let ac = null, C = null, muted = store.get('esc.mute') === true;
    function chain(a){ const bus = a.createGain(), send = a.createGain(), dl = a.createDelay(1), fb = a.createGain(), lp = a.createBiquadFilter(), comp = a.createDynamicsCompressor(), master = a.createGain();
      send.gain.value = .22; dl.delayTime.value = .19; fb.gain.value = .3; lp.type = 'lowpass'; lp.frequency.value = 2400;
      bus.connect(comp); bus.connect(send); send.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(comp);
      comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .22;
      master.gain.value = MASTER; comp.connect(master); master.connect(a.destination);
      let nb = null; const noiseBuf = () => { if(!nb){ nb = a.createBuffer(1, Math.floor(a.sampleRate * 2.5), a.sampleRate); const d = nb.getChannelData(0); let s = 20241; for(let i = 0; i < d.length; i++){ s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; } } return nb; };
      return {a, bus, master, noiseBuf}; }
    // one partial: gentle attack, exponential fall, stopped only after it is far below hearing, so nothing clicks
    function part(c, f, t, att, dec, vol, type){ const o = c.a.createOscillator(), g = c.a.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.setTargetAtTime(0, t + att, dec * K / 5); o.connect(g); g.connect(c.bus); o.start(t); o.stop(t + att + dec * K * 1.7 + .05); return o; }
    const mallet = (c, f, t, dur, vol) => { part(c, f, t, .008, dur, vol); part(c, f * 2, t, .006, dur * .45, vol * .26); part(c, f * 3.98, t, .004, dur * .14, vol * .1); part(c, f, t, .012, dur * .8, vol * .2, 'triangle'); };
    const BELL = [[.5, .22, 1.25], [1, 1, 1], [1.19, .34, .8], [1.5, .2, .66], [2, .42, .55], [2.66, .15, .4], [3.01, .09, .3], [4.07, .05, .2]];
    const bell = (c, f, t, dur, vol) => { for(const [r, a, d] of BELL) part(c, f * r, t, .006, dur * d, vol * a); };
    const ting = (c, f, t, vol) => { part(c, f, t, .003, .32, vol); part(c, f * 2.76, t, .003, .16, vol * .4); part(c, f * 5.4, t, .002, .07, vol * .18); };
    function noise(c, t, att, dur, vol, type, f0, f1, q){ const s = c.a.createBufferSource(), f = c.a.createBiquadFilter(), g = c.a.createGain(); s.buffer = c.noiseBuf(); s.loop = true; f.type = type; f.Q.value = q || .7;
      f.frequency.setValueAtTime(f0, t); if(f1) f.frequency.exponentialRampToValueAtTime(f1, t + att + dur * K); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.setTargetAtTime(0, t + att, dur * K / 4.5);
      s.connect(f); f.connect(g); g.connect(c.bus); s.start(t, (t * 7.3) % 2); s.stop(t + att + dur * K * 1.8 + .05); }
    const thud = (c, t, f0, f1, vol) => { const o = part(c, f0, t, .008, .2, vol); o.frequency.exponentialRampToValueAtTime(f1, t + .14); noise(c, t, .004, .05, vol * .25, 'lowpass', 260); };
    const CUES = {
      tap:    (c, t) => mallet(c, N.A5, t, .16, .13),
      look:   (c, t) => { mallet(c, N.A4, t, .3, .16); mallet(c, N.D5, t + .09, .45, .16); },
      back:   (c, t) => { mallet(c, N.D5, t, .25, .12); mallet(c, N.A4, t + .09, .4, .13); },
      goal:   (c, t) => { mallet(c, N.Fs5, t, .6, .14); mallet(c, N.A5, t + .13, .9, .13); },
      steps:  (c, t, n) => { for(let i = 0; i < (n || 3); i++){ noise(c, t + .1 + i * .44, .012, .1, .5, 'lowpass', 170, 110); } },
      slide:  (c, t) => { noise(c, t, .09, .62, .2, 'bandpass', 320, 880, 1.1); noise(c, t, .12, .55, .07, 'highpass', 2400); thud(c, t + .7, 96, 58, .3); },
      paper:  (c, t) => { noise(c, t, .01, .1, .13, 'highpass', 2600); noise(c, t + .12, .012, .14, .11, 'bandpass', 3600, 2200, .8); },
      key:    (c, t, i) => mallet(c, [N.D5, N.Fs5, N.A5][clamp((i || 1) - 1, 0, 2)], t, .32, .17),
      wrong:  (c, t) => { thud(c, t, 132, 84, .42); thud(c, t + .19, 110, 70, .36); },
      right:  (c, t) => { [N.D4, N.A4, N.D5, N.Fs5, N.B5].forEach((f, i) => mallet(c, f, t + i * .055, 1.9 - i * .15, .15 - i * .012)); part(c, N.D3, t, .03, 1.6, .1, 'triangle'); },
      reveal: (c, t) => { [N.A5, N.D6, N.Fs6, N.E6, N.B5, N.D6, N.A6, N.Fs6, N.D6].forEach((f, i) => { const at = t + i * .2; part(c, f, at, .09, 1.5, .055); part(c, f * 2, at, .06, .7, .016); part(c, f * 1.003, at + .02, .12, 1.3, .03); }); part(c, N.D4, t, .5, 2.4, .05, 'triangle'); part(c, N.A4, t + .3, .5, 2.2, .04); },
      fridge: (c, t) => { thud(c, t, 150, 76, .3); noise(c, t + .03, .05, .5, .06, 'bandpass', 700, 300, .6); },
      cork:   (c, t) => { const o = part(c, 520, t, .003, .11, .5); o.frequency.exponentialRampToValueAtTime(110, t + .07); noise(c, t, .002, .06, .4, 'bandpass', 1500, 600, 1.3);
                noise(c, t + .06, .08, 1.5, .1, 'highpass', 5200); noise(c, t + .1, .2, 1.1, .05, 'bandpass', 7200, 4200, 2); mallet(c, N.D5, t + .5, 1.2, .08); mallet(c, N.A5, t + .62, 1.4, .08); mallet(c, N.Fs6, t + .74, 1.6, .06); },
      bell:   (c, t) => { bell(c, N.Fs5, t, 2.6, .2); bell(c, N.D5, t + .68, 3.2, .2); },
      jingle: (c, t) => { ting(c, N.B6, t, .075); ting(c, N.A6 * 1.01, t + .075, .06); ting(c, N.B6 * .995, t + .17, .07); }};
    const live = () => { if(muted) return null; try{ if(!ac){ const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null; ac = new AC(); C = chain(ac); }
        if(ac.state === 'suspended' && !document.hidden) ac.resume(); return C; }catch(e){ return null; } };
    document.addEventListener('visibilitychange', () => { try{ if(!ac) return; if(document.hidden) ac.suspend(); else if(!muted) ac.resume(); }catch(e){} });
    const play = (name, arg) => { const c = live(); if(!c || document.hidden) return; try{ CUES[name](c, c.a.currentTime + .03, arg); }catch(e){} };
    const api = {get muted(){ return muted; }, cues: Object.keys(CUES),
      setMuted(v){ muted = !!v; store.set('esc.mute', muted); try{ if(ac){ C.master.gain.setTargetAtTime(muted ? 0 : MASTER, ac.currentTime, .03); if(!muted && !document.hidden) ac.resume(); } }catch(e){} },
      unlock(){ live(); }, state(){ return ac ? ac.state : 'not started'; },
      // render every cue offline through the same chain and report level, length, DC offset and clipping (checked by number, not by ear)
      async measure(){ const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, out = {}; if(!OAC) return out;
        for(const name of Object.keys(CUES)){ const sr = 44100, o = new OAC(1, sr * 7, sr), c = chain(o); CUES[name](c, .05, name === 'key' ? 3 : name === 'steps' ? 4 : undefined);
          const d = (await o.startRendering()).getChannelData(0); let peak = 0, sum = 0, sq = 0, clip = 0, last = 0, maxStep = 0;
          for(let i = 0; i < d.length; i++){ const v = d[i], a = Math.abs(v); if(a > peak) peak = a; sum += v; sq += v * v; if(a >= .999) clip++; if(a > .001) last = i; if(i && Math.abs(v - d[i - 1]) > maxStep) maxStep = Math.abs(v - d[i - 1]); }
          const n = Math.max(1, last); let s2 = 0; for(let i = 0; i < n; i++) s2 += d[i];
          out[name] = {peak: +peak.toFixed(3), peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rmsDb: +(10 * Math.log10(sq / n || 1e-12)).toFixed(1), seconds: +((last / sr) - .05).toFixed(2), dc: +(s2 / n).toFixed(5), clipped: clip, maxStep: +maxStep.toFixed(3), end: +Math.abs(d[d.length - 1]).toFixed(5)}; }
        return out; }};
    for(const k of Object.keys(CUES)) api[k] = arg => play(k, arg);
    return api; })();

  /* ================================================================== UI */
  const css = `
  #escRoot{--ink:#1f2a3a;--mut:#5c6575;--navy:#1f2948;--paper:#fbfaf7;--gold:#c98a12;--wine:#9b2c3c;position:fixed;inset:0;z-index:60;pointer-events:none;font-family:Jost,"Avenir Next","Helvetica Neue",Arial,sans-serif;color:var(--ink);-webkit-tap-highlight-color:transparent}
  #escRoot button{font:inherit;cursor:pointer}
  #escRoot .escChip{pointer-events:auto;color:var(--ink);background:rgba(251,250,247,.95);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:16px;box-shadow:0 8px 30px rgba(15,20,35,.2)}
  #escTop{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) 0 max(14px,env(safe-area-inset-left))}
  #escGoal{padding:11px 16px 12px;max-width:380px;min-width:0;border-left:4px solid var(--gold);transition:transform .35s cubic-bezier(.2,.8,.2,1)}
  #escGoal .k{display:flex;gap:8px;align-items:baseline;font-size:12.5px;color:var(--mut);letter-spacing:.02em}
  #escGoal .k b{font-weight:500;color:var(--ink)} #escTime{font-variant-numeric:tabular-nums}
  #escGoal p{margin:3px 0 0;font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:20px;line-height:1.18}
  #escGoal.new{animation:escNew .9s ease}
  @keyframes escNew{0%{transform:translateY(-6px);box-shadow:0 0 0 0 rgba(232,184,74,.9),0 8px 30px rgba(15,20,35,.2)}40%{transform:none;box-shadow:0 0 0 10px rgba(232,184,74,0),0 8px 30px rgba(15,20,35,.2)}100%{transform:none}}
  #escBtns{display:flex;gap:8px;align-items:flex-start;flex:none}
  #escHint{display:flex;align-items:center;gap:10px;border:0;padding:6px 14px 6px 6px;text-align:left;min-height:52px}
  #escHint .av{width:42px;height:42px;border-radius:50%;background:radial-gradient(circle at 50% 35%,#34416b,#1a2340);overflow:hidden;display:grid;place-items:end center;flex:none}
  #escHint .av svg{width:40px;height:auto;margin-bottom:-3px}
  #escHint b{display:block;font-size:14.5px;font-weight:500;line-height:1.15}#escHint small{font-size:12.5px;color:var(--mut)}
  #escHint.nudge{animation:escNudge 1.6s ease-in-out infinite}
  @keyframes escNudge{0%,100%{box-shadow:0 8px 30px rgba(15,20,35,.2),0 0 0 0 rgba(232,184,74,.8)}60%{box-shadow:0 8px 30px rgba(15,20,35,.2),0 0 0 12px rgba(232,184,74,0)}}
  .escIco{width:52px;height:52px;border:0;display:grid;place-items:center;padding:0}.escIco svg{width:22px;height:22px}
  #escMenu{position:absolute;right:max(14px,env(safe-area-inset-right));top:calc(max(14px,env(safe-area-inset-top)) + 60px);padding:8px;display:none;flex-direction:column;min-width:210px;z-index:5}
  #escMenu.on{display:flex}#escMenu button,#escMenu a{border:0;background:none;text-align:left;padding:11px 12px;border-radius:10px;font-size:15px;color:var(--ink);text-decoration:none}
  #escMenu button:hover,#escMenu a:hover{background:#eceae4}
  #escSay{max-width:min(320px,calc(100vw - 28px));background:#fff;border-radius:16px 4px 16px 16px;padding:11px 15px;font:600 21px/1.2 Caveat,"Segoe Print","Bradley Hand",cursive;color:#2b2336;box-shadow:0 10px 30px rgba(15,20,35,.22);opacity:0;transform:translateY(-6px);transition:.3s;pointer-events:none}
  #escSay.on{opacity:1;transform:none}#escSay small{display:block;font:500 11.5px Jost,sans-serif;color:var(--mut);letter-spacing:.03em;margin-bottom:1px}
  #escL,#escR{display:flex;flex-direction:column;gap:8px;min-width:0}#escL{align-items:flex-start}#escR{align-items:flex-end;flex:none}
  #escPlace{max-width:380px;background:rgba(22,28,48,.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;border-radius:16px;padding:10px 16px 12px;opacity:0;transform:translateY(-8px);transition:opacity .5s,transform .5s;pointer-events:none}
  #escPlace.on{opacity:1;transform:none}#escPlace b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:25px;line-height:1.1}#escPlace span{display:block;font-size:14px;line-height:1.35;color:#dfe3ee;margin-top:3px}
  #escDock{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:flex-end;gap:12px;padding:0 max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}
  #escMapWrap{flex:0 0 268px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
  #escMap{padding:10px;position:relative;width:268px}
  #escMap h4{margin:0 0 6px;font-size:12.5px;font-weight:500;color:var(--mut);letter-spacing:.02em;display:flex;justify-content:space-between;align-items:center}
  #escMap h4 b{color:var(--ink);font-weight:500}
  #escMap .plan{position:relative;width:248px;height:176px}
  #escMap svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  #escMap .pl{position:absolute;transform:translate(-50%,-50%);border:1px solid rgba(31,41,72,.25);background:#fff;border-radius:999px;padding:3px 8px;font-size:11.5px;line-height:1.2;white-space:nowrap;color:var(--ink);box-shadow:0 2px 6px rgba(15,20,35,.12)}
  #escMap .pl:hover{border-color:var(--navy)}#escMap .pl[aria-current=true]{background:var(--navy);border-color:var(--navy);color:#fff}
  #escMap .pl::before{content:"";position:absolute;inset:-9px -4px}
  #escMapBtn{display:none;border:0;padding:0 16px 0 12px;min-height:46px;align-items:center;gap:8px;font-size:15px}
  #escMapBtn svg{width:18px;height:18px;flex:none}#escMapBtn small{color:var(--mut);font-size:13px}
  #escMapX{display:none}
  #escSun{flex:1 1 auto;max-width:560px;margin:0 auto;padding:10px 16px 12px;transition:box-shadow .4s}
  #escSun.key{box-shadow:0 0 0 2px #e8b84a,0 0 26px rgba(232,184,74,.55),0 8px 30px rgba(15,20,35,.2)}
  #escSun .top{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:var(--mut)}
  #escSun .top b{font-size:19px;color:var(--ink);font-weight:500;font-variant-numeric:tabular-nums}
  #escSlider{-webkit-appearance:none;appearance:none;width:100%;height:36px;background:transparent;margin:2px 0 0;display:block;cursor:pointer}
  #escSlider::-webkit-slider-runnable-track{height:10px;border-radius:999px;background:linear-gradient(90deg,#f0b98a 0%,#f7e3a8 16%,#cfe4f3 38%,#cfe4f3 58%,#f7dc9c 76%,#ee9d6c 91%,#4a4f7c 100%);box-shadow:inset 0 1px 2px rgba(0,0,0,.18)}
  #escSlider::-moz-range-track{height:10px;border-radius:999px;background:linear-gradient(90deg,#f0b98a 0%,#f7e3a8 16%,#cfe4f3 38%,#cfe4f3 58%,#f7dc9c 76%,#ee9d6c 91%,#4a4f7c 100%)}
  #escSlider::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;margin-top:-10px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff3c4,#f2b632 60%,#d98f0c);border:2px solid #fff;box-shadow:0 0 0 3px rgba(242,182,50,.35),0 3px 8px rgba(0,0,0,.3)}
  #escSlider::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff3c4,#f2b632 60%,#d98f0c);border:2px solid #fff;box-shadow:0 0 0 3px rgba(242,182,50,.35),0 3px 8px rgba(0,0,0,.3)}
  #escSlider:focus-visible{outline:2px solid var(--navy);outline-offset:2px;border-radius:8px}
  #escSun .ticks{display:flex;justify-content:space-between;font-size:11.5px;color:var(--mut);margin:0 5px;font-variant-numeric:tabular-nums}
  #escSun .ticks span{width:44px;text-align:center}#escSun .ticks span:first-child{text-align:left;margin-left:-5px}#escSun .ticks span:last-child{text-align:right;margin-right:-5px}
  #escDockR{flex:0 0 268px}
  #escCoach{position:absolute;left:50%;top:96px;transform:translate(-50%,8px);background:rgba(22,28,48,.86);color:#fff;border-radius:999px;padding:10px 18px 10px 12px;font-size:15.5px;display:flex;align-items:center;gap:10px;opacity:0;transition:opacity .4s,transform .4s;pointer-events:none;white-space:nowrap;max-width:calc(100% - 24px)}
  #escCoach.on{opacity:1;transform:translate(-50%,0)}#escCoach svg{width:26px;height:26px;flex:none}
  #escCoach.look svg{animation:escSwipe 1.8s ease-in-out infinite}@keyframes escSwipe{0%,100%{transform:translateX(-5px)}50%{transform:translateX(5px)}}
  .escMk{position:absolute;left:0;top:0;width:60px;height:60px;margin:-30px 0 0 -30px;border:0;background:none;padding:0;pointer-events:auto;opacity:0;visibility:hidden;transition:opacity .25s,visibility 0s linear .25s;will-change:transform}
  .escMk.on{opacity:1;visibility:visible;transition:opacity .25s}
  .escMk i{position:absolute;left:8px;top:8px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center}
  .escMk.look i{border:2.5px solid #fff;background:rgba(255,255,255,.14);box-shadow:0 0 0 4px rgba(232,184,74,.55),0 0 22px rgba(255,214,120,.85),inset 0 0 10px rgba(255,220,140,.5)}
  .escMk.look i::after{content:"";width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 8px #ffdc8c}
  .escMk.look.on i{animation:escPulse 2.2s ease-in-out infinite}
  .escMk.walk i{background:rgba(255,255,255,.94);box-shadow:0 4px 14px rgba(15,20,35,.35);color:#1f2948}
  .escMk.walk i svg{width:22px;height:22px}
  .escMk.walk.first.on i{animation:escPulse 1.6s ease-in-out infinite}
  .escMk span{position:absolute;left:50%;top:56px;transform:translateX(-50%);white-space:nowrap;font:500 13px Jost,sans-serif;color:#fff;background:rgba(20,26,44,.82);padding:4px 10px;border-radius:999px}
  .escMk.edge span{top:50%;transform:translateY(-50%)}.escMk.edge.L span{left:58px}.escMk.edge.R span{left:auto;right:58px}
  .escMk:hover span{background:#1f2948}.escMk:focus-visible i{outline:3px solid #fff;outline-offset:3px}
  @keyframes escPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.13)}}
  #escSheet{position:absolute;right:max(16px,env(safe-area-inset-right));top:50%;width:min(372px,calc(100% - 28px));max-height:calc(100% - 200px);overflow:auto;background:var(--paper);border-radius:20px;box-shadow:0 20px 60px rgba(10,14,28,.38);padding:20px 20px 18px;transform:translate(24px,-50%);opacity:0;visibility:hidden;transition:opacity .3s,transform .3s,visibility 0s linear .3s;pointer-events:none}
  #escSheet.on{transform:translate(0,-50%);opacity:1;visibility:visible;pointer-events:auto;transition:opacity .3s,transform .3s}
  #escSheet h3{font-family:"Cormorant Garamond",Georgia,serif;font-size:28px;font-weight:600;margin:0 0 6px;line-height:1.05}
  #escSheet p{margin:0 0 10px;font-size:16px;line-height:1.45;color:#2b3442}
  #escSheet .row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .escBtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid #cfcabe;background:#fff;color:var(--ink);border-radius:999px;padding:0 20px;min-height:46px;font:inherit;font-size:15.5px;cursor:pointer;text-decoration:none;pointer-events:auto}
  .escBtn:hover{border-color:#1f2948}.escBtn svg{width:18px;height:18px}
  .escBtn.primary{background:var(--wine,#9b2c3c);border-color:var(--wine,#9b2c3c);color:#fff}.escBtn.primary:hover{background:#842432}
  .escBtn.dark{background:#1f2948;border-color:#1f2948;color:#fff}.escBtn.dark:hover{background:#151c33}
  .escBtn.light{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.4);color:#fff}.escBtn.light:hover{background:rgba(255,255,255,.2);border-color:#fff}
  #escBack{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));display:none;box-shadow:0 8px 30px rgba(15,20,35,.25);min-height:52px;font-size:16px}
  .escDisp{display:flex;justify-content:center;gap:10px;margin:8px 0 4px;align-items:center}
  .escDisp i{width:50px;height:60px;border-radius:10px;background:#141a30;color:#ffd77a;font:500 34px/60px Jost,sans-serif;font-style:normal;text-align:center;box-shadow:inset 0 2px 8px rgba(0,0,0,.5)}
  .escDisp.bad{animation:escShake .4s}.escDisp.bad i{color:#ff8b7c}.escDisp.ok i{color:#7cf0a6}
  @keyframes escShake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
  .escPad{display:grid;grid-template-columns:repeat(3,72px);gap:8px;justify-content:center;margin:10px 0 2px}
  .escPad button{height:54px;border-radius:14px;border:1px solid #d6d2c8;background:#fff;font:500 22px Jost,sans-serif;color:var(--ink)}
  .escPad button:active{background:#eceae4;transform:scale(.97)}.escPad .z{grid-column:2}.escPad .c{grid-column:3;grid-row:4;font-size:18px}
  #escToast{position:absolute;left:50%;top:15%;transform:translate(-50%,-10px);background:rgba(22,28,48,.9);color:#fff;font:500 15.5px Jost,sans-serif;padding:10px 18px;border-radius:999px;opacity:0;transition:.3s;pointer-events:none;max-width:calc(100% - 40px);text-align:center}
  #escToast.on{opacity:1;transform:translate(-50%,0)}
  #escFade{position:fixed;inset:0;z-index:58;background:#0d111f;opacity:0;pointer-events:none;transition:opacity .32s ease}
  #escFade.on{opacity:1;pointer-events:auto}
  #escCard{position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(14,19,34,.5);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);font-family:Jost,"Avenir Next",Arial,sans-serif;padding:16px;overflow:auto;animation:escIn .45s ease}
  @keyframes escIn{from{opacity:0}to{opacity:1}}
  #escCard .c{background:#fbfaf7;color:#1f2a3a;border-radius:24px;max-width:540px;width:100%;padding:26px 26px 22px;box-shadow:0 30px 90px rgba(0,0,0,.45);animation:escUp .5s cubic-bezier(.2,.8,.2,1)}
  @keyframes escUp{from{transform:translateY(18px)}to{transform:none}}
  #escCard h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:clamp(36px,6vw,50px);font-weight:600;line-height:1;margin:0 0 10px}
  #escCard .k{font-size:13px;color:#5c6575;margin:0 0 6px;letter-spacing:.03em}
  #escCard .lede{font-family:"Cormorant Garamond",Georgia,serif;font-size:21px;line-height:1.32;margin:0 0 14px;color:#2b3442}
  #escCard .note{background:#fff;border:1px solid #e3e0d8;border-radius:4px;padding:15px 18px 12px;transform:rotate(-.7deg);box-shadow:0 6px 18px rgba(0,0,0,.09);font:600 23px/1.22 Caveat,"Segoe Print","Bradley Hand",cursive;color:#2b2336;margin:0 0 18px}
  #escCard .note p{margin:0 0 7px}#escCard .note .sig{text-align:right;line-height:1}#escCard .note .paw{width:38px;height:38px;transform:rotate(-14deg);color:#2b2336;margin:-2px 6px -4px 0}#escCard .note .ps{font-size:20px;color:#5a4d63;margin:0}
  #escCard .how{list-style:none;margin:0 0 16px;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  #escCard .how li{background:#f1eee6;border-radius:14px;padding:10px 8px 9px;text-align:center;font-size:13.5px;line-height:1.25;color:#2b3442}
  #escCard .how svg{width:30px;height:30px;display:block;margin:0 auto 5px;color:#1f2948}
  #escCard .foot{font-size:13px;color:#5c6575;line-height:1.45;margin:14px 0 0}
  #escCard .acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  #escCard .stats{display:flex;gap:26px;margin:4px 0 16px}#escCard .stats b{display:block;font-size:28px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.1}#escCard .stats span{font-size:13px;color:#5c6575}
  #escCard .cta{background:#1f2948;color:#f4f1e8;border-radius:18px;padding:18px 18px 16px;margin:0 0 14px}
  #escCard .cta b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:26px;font-weight:600;line-height:1.1;margin-bottom:6px}#escCard .cta span{display:block;font-size:15px;line-height:1.45;color:#d5daE8;margin-bottom:14px}
  #escCard .more{display:flex;flex-wrap:wrap;gap:8px}
  #escCard.side{background:none;backdrop-filter:none;-webkit-backdrop-filter:none;place-items:center end;pointer-events:none;padding-right:max(18px,env(safe-area-inset-right))}
  #escCard.side .c{position:relative;pointer-events:auto;max-width:440px;max-height:calc(100% - 8px);overflow-x:hidden;overflow-y:auto}#escCard.side h2{font-size:clamp(32px,4vw,42px)}
  .escBub{position:absolute;top:150px;width:9px;height:9px;border-radius:50%;border:1.5px solid rgba(201,138,18,.55);animation:escBub 3.2s ease-in infinite}
  @keyframes escBub{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:.9}100%{transform:translateY(-150px) scale(1.2);opacity:0}}
  html.esc-ex #escMapWrap, html.esc-ex #escDockR{visibility:hidden}html.esc-ex #escBack{display:inline-flex}
  html.esc-cine #escRoot > *:not(#escToast){opacity:0!important;pointer-events:none!important;transition:opacity .4s}
  html.esc-pre #escRoot{display:none}
  @media (max-width:1180px){#escDockR{display:none}}
  @media (max-width:899px){
    #escTop{flex-direction:column;align-items:stretch;gap:8px;padding-left:10px;padding-right:10px}#escL,#escR{display:contents}
    #escBtns{order:0;align-self:flex-end}#escGoal{order:1;max-width:none;padding:9px 14px 10px}#escGoal p{font-size:18.5px}#escSay{order:2;align-self:flex-end}
    #escHint{padding:5px 12px 5px 5px;min-height:48px}#escHint small{display:none}.escIco{width:48px;height:48px}
    #escPlace{order:3;max-width:none;padding:8px 14px 10px}#escPlace b{font-size:22px}#escPlace span{font-size:13.5px}
    #escDock{flex-direction:column;align-items:stretch;gap:8px;padding-left:10px;padding-right:10px}
    #escMapWrap{flex:none;order:0;flex-direction:row}#escMapBtn{display:inline-flex}
    #escMap{display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(340px,calc(100% - 24px));padding:14px;z-index:6;box-shadow:0 20px 70px rgba(10,14,28,.5)}
    #escMap.on{display:block}#escMap .plan{width:100%;height:0;padding-bottom:71%}#escMap .pl{font-size:13.5px;padding:7px 11px}#escMapX{display:grid;position:absolute;right:6px;top:4px;width:44px;height:44px;border:0;background:none;place-items:center;font-size:24px;color:var(--mut)}
    #escSun{order:1;max-width:none;margin:0;padding:8px 14px 10px}
    #escCoach{top:236px;font-size:14.5px}
    #escSheet{left:10px;right:10px;top:auto;bottom:max(10px,env(safe-area-inset-bottom));width:auto;max-width:560px;margin:0 auto;max-height:62vh;transform:translateY(20px);padding:16px 16px 14px}
    #escSheet.on{transform:none}#escSheet h3{font-size:24px}#escSheet p{font-size:15.5px}
    html.esc-ex #escDock{visibility:hidden}html.esc-ex.esc-exsun #escSun{visibility:visible;position:fixed;left:10px;right:10px;bottom:calc(var(--sheet-h,180px) + 18px)}
    html.esc-ex #escBack{display:none}
    .escPad{grid-template-columns:repeat(5,1fr);gap:7px}.escPad button{height:50px}.escPad .z{grid-column:auto}.escPad .c{display:none}.escDisp .c2{display:grid!important}
    #escCard .c{padding:20px 18px 18px}#escCard .note{font-size:21px}#escCard .lede{font-size:19px}
    #escCard.side{place-items:end center;padding:8px}#escCard.side .c{box-sizing:border-box;max-width:560px;max-height:calc(100% - 180px);padding:16px 16px 14px}#escCard.side h2{font-size:32px}#escCard.side .lede{font-size:18px;margin-bottom:10px}#escCard.side .stats{margin-bottom:10px}
  }
  @media (prefers-reduced-motion:reduce){.escMk.on i,#escHint.nudge,#escCoach svg,.escBub{animation:none!important}}
  `;
  const ICO = {
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3l4.5-3.8v12.6L7 14.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3l4.5-3.8v12.6L7 14.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
    walk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/><path d="M6 19l6-6 6 6" opacity=".45"/></svg>',
    drag: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 17.5V8.2a1.9 1.9 0 0 1 3.8 0v6.3m0-1.6a1.9 1.9 0 0 1 3.8 0v2m0-.9a1.9 1.9 0 0 1 3.7 0v5.2c0 4.3-2.8 7.3-6.9 7.3-3.2 0-4.900-1.400-6.600-4.200l-3-5a1.9 1.9 0 0 1 3.200-2l2 2.500"/><path d="M4 7.500h5M4 7.500l2-2M4 7.500l2 2M28 7.500h-5M28 7.500l-2-2M28 7.500l-2 2"/></svg>',
    ring: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="16" r="10" stroke="#c98a12" stroke-width="3"/><circle cx="16" cy="16" r="2.6" fill="currentColor" stroke="none"/></svg>',
    disc: '<svg viewBox="0 0 32 32" fill="none" stroke="#1f2948" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="12" fill="#fff" stroke-width="1.6"/><path d="M10.500 17.500l5.500-5.500 5.500 5.500"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6.500-5.600 6.500-10.500a6.500 6.500 0 0 0-13 0C5.500 15.400 12 21 12 21z"/><circle cx="12" cy="10.500" r="2.300"/></svg>'};
  let root, goalE, sayE, placeE, sheetE, toastE, coachE, fadeE, mapE, sunE;
  const fontLink = el('link', {rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500&display=swap'}); document.head.appendChild(fontLink);
  function buildUI(){ document.head.appendChild(el('style', {}, css)); document.documentElement.classList.add('esc-pre');
    const cat = window.SNOWBALL ? SNOWBALL.svg({id: 'sbhud', seed: 7}).replace(/viewBox="[^"]+"/, 'viewBox="110 10 280 300"') : '';
    root = el('div', {id: 'escRoot'}, `
      <div id="escTop">
        <div id="escL"><div class="escChip" id="escGoal" role="status" aria-live="polite"><div class="k"><b>Pop the Cork</b><span id="escTime">0:00</span></div><p id="escGoalT"></p></div>
          <div id="escPlace" aria-live="polite"></div></div>
        <div id="escR"><div id="escBtns">
          <button class="escChip" id="escHint" type="button" aria-label="Ask Snowball for a hint"><span class="av">${cat}</span><span class="tx"><b>Ask Snowball</b><small>For a hint</small></span></button>
          <button class="escChip escIco" id="escSnd" type="button" aria-label="Sound"></button>
          <button class="escChip escIco" id="escMenuBtn" type="button" aria-label="Menu" aria-expanded="false">${ICO.menu}</button>
        </div><div id="escSay" aria-live="polite"></div></div>
      </div>
      <div class="escChip" id="escMenu" role="menu"><button type="button" role="menuitem" id="escRestart">Start again</button><button type="button" role="menuitem" id="escAbout">About this 3D model</button><a role="menuitem" href="/tour/">Leave and explore the house</a><a role="menuitem" href="/games/">More games</a></div>
      <div id="escMarks"></div>
      <div id="escCoach" role="status"></div>
      <div id="escDock">
        <div id="escMapWrap"><button class="escChip" id="escMapBtn" type="button" aria-expanded="false">${ICO.pin}<span id="escMapNow">Entry</span><small>Map</small></button>
          <div class="escChip" id="escMap"><h4><span>You are in the <b id="escMapName">entry</b></span></h4><button type="button" id="escMapX" aria-label="Close the map">×</button><div class="plan" id="escPlan"></div></div></div>
        <div class="escChip" id="escSun"><div class="top"><span id="escSunL">Time of day</span><b id="escClock">10:00 AM</b></div>
          <input id="escSlider" type="range" min="7" max="19" step=".25" value="10" aria-label="Time of day">
          <div class="ticks" aria-hidden="true"><span>7 AM</span><span>10</span><span>1 PM</span><span>4</span><span>7 PM</span></div></div>
        <div id="escDockR"></div>
      </div>
      <button class="escBtn dark" id="escBack" type="button">${ICO.back}<span>Back</span></button>
      <div id="escSheet" role="dialog" aria-live="polite"></div>
      <div id="escToast" role="status"></div>`);
    document.body.appendChild(root); fadeE = el('div', {id: 'escFade'}); document.body.appendChild(fadeE);
    goalE = $('#escGoal'); sayE = $('#escSay'); placeE = $('#escPlace'); sheetE = $('#escSheet'); toastE = $('#escToast'); coachE = $('#escCoach'); mapE = $('#escMap'); sunE = $('#escSun');
    $('#escHint').onclick = () => { SND.unlock(); hint(); };
    const snd = $('#escSnd'), drawSnd = () => { snd.innerHTML = SND.muted ? ICO.mute : ICO.sound; snd.setAttribute('aria-label', SND.muted ? 'Turn sound on' : 'Turn sound off'); snd.setAttribute('aria-pressed', String(!SND.muted)); };
    snd.onclick = () => { SND.setMuted(!SND.muted); drawSnd(); if(!SND.muted) SND.tap(); toast(SND.muted ? 'Sound off' : 'Sound on', 1100); }; drawSnd(); UI.drawSnd = drawSnd;
    $('#escMenuBtn').onclick = e => { e.stopPropagation(); menuOpen() ? closeMenu() : ($('#escMenu').classList.add('on'), $('#escMenuBtn').setAttribute('aria-expanded', 'true')); };
    $('#escRestart').onclick = () => location.reload();
    $('#escAbout').onclick = () => { closeMenu(); const d = document.getElementById('aboutDlg'); try{ d.showModal(); }catch(e){ if(d) d.setAttribute('open', ''); } };
    $('#escBack').onclick = () => back();
    $('#escMapBtn').onclick = () => setMap(!mapOpen()); $('#escMapX').onclick = () => setMap(false);
    const sl = $('#escSlider'); sl.oninput = () => onSlide(+sl.value, true); sl.onchange = () => { onSlide(+sl.value, true); applyHour(+sl.value, true); };
    sl.addEventListener('pointerdown', () => { SND.unlock(); sunKey(false); });
    addEventListener('pointerdown', e => { if(menuOpen() && !e.target.closest('#escMenu,#escMenuBtn')) closeMenu(); if(mapOpen() && phone() && !e.target.closest('#escMap,#escMapBtn')) setMap(false); }, true);
    buildMap(); setGoal(true); setClock(S.hour); }
  const UI = {};
  const menuOpen = () => !!$('#escMenu') && $('#escMenu').classList.contains('on');
  function closeMenu(){ const m = $('#escMenu'); if(m && m.classList.contains('on')){ m.classList.remove('on'); $('#escMenuBtn').setAttribute('aria-expanded', 'false'); } }
  const mapOpen = () => !!mapE && mapE.classList.contains('on');
  function setMap(on){ if(!mapE) return; mapE.classList.toggle('on', on); $('#escMapBtn').setAttribute('aria-expanded', String(on)); }
  let toastT = 0; function toast(m, ms){ toastE.textContent = m; toastE.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastE.classList.remove('on'), ms || 2200); }
  let sayT = 0; function say(m, ms, quiet){ sayE.innerHTML = '<small>Snowball</small>' + esc(m); sayE.classList.add('on'); clearTimeout(sayT); sayT = setTimeout(() => sayE.classList.remove('on'), ms || 4600); if(!quiet) SND.jingle(); }
  let placeT = 0; function placeCard(k){ const P = PLACES[k]; placeE.innerHTML = `<b>${esc(P.name)}</b><span>${esc(P.note)}</span>`; placeE.classList.add('on'); clearTimeout(placeT); placeT = setTimeout(() => placeE.classList.remove('on'), 6500); }
  function fadeThrough(fn, hold){ fadeE.classList.add('on'); setTimeout(() => { try{ fn(); }catch(e){ console.error('[escape] cut', e); } wake(30); setTimeout(() => fadeE.classList.remove('on'), hold || 260); }, reduce ? 60 : 340); }

  /* ---- objective */
  const GOALS = {
    arrive: 'The champagne is locked in a drinks fridge somewhere in this house. Find it.',
    fridge: 'The lock wants three digits. Find what Snowball left for you.',
    drawing: 'Snowball’s drawing is a set of instructions. Make the house match it.',
    light: 'The sun is where the drawing put it. Find where that light lands.',
    code: 'You have three digits. Take them to the lock.',
    done: 'The fridge is open.'};
  const RANK = ['arrive', 'fridge', 'drawing', 'light', 'code', 'done'];
  function setStage(st){ if(RANK.indexOf(st) <= RANK.indexOf(S.stage)) return false; S.stage = st; S.lastProgress = performance.now(); hintIx = 0; ga('esc_step', {step: st}); setGoal(); $('#escHint').classList.remove('nudge');
    sunKey(false); return true; }
  function sunKey(on){ sunE.classList.toggle('key', on); $('#escSunL').textContent = on ? 'Time of day: drag the sun' : 'Time of day'; }
  function setGoal(silent){ $('#escGoalT').textContent = GOALS[S.stage]; if(silent) return; goalE.classList.remove('new'); void goalE.offsetWidth; goalE.classList.add('new'); SND.goal(); }

  /* ---- time slider */
  function setClock(h){ $('#escClock').textContent = fmtH(h); $('#escSlider').setAttribute('aria-valuetext', fmtH(h)); }
  const lightUp = h => h >= T_SUN - .25 && h <= T_SUN + .5;                      // the digits read true
  const lightOn = h => h >= 14.75 && h <= 17.25;                        // there is paper-shadow on the floor at all
  function onSlide(h, user){ const was = S.hour; setClock(h); applyHour(h); if(user) S.lastProgress = performance.now(); if(lightOn(h) !== lightOn(was) && !S.ex) setMarks();
    if(lightUp(h) && !lightUp(was)){ SND.reveal(); if(!S.sawLight){ S.sawLight = true;
        if(S.place === 'great' || (S.ex && S.ex.id === 'floor')) say('There it is.', 3600, true); else say('Something in the house just changed.', 5200, true);
        if(S.stage === 'drawing') setStage('light'); } }
    if(S.ex && S.ex.id === 'floor') sheetFor(S.ex); }
  function setSlider(h){ $('#escSlider').value = h; onSlide(h); applyHour(h, true); }
  function sweepTo(h1, ms, then){ const h0 = S.hour, t0 = performance.now(); (function f(){ const u = clamp((performance.now() - t0) / ms, 0, 1), h = Math.round(lerp(h0, h1, ease(u)) * 4) / 4; if(h !== S.hour){ $('#escSlider').value = h; onSlide(h); }
      if(u < 1) requestAnimationFrame(f); else { applyHour(h1, true); if(then) then(); } })(); }

  /* ---- the map */
  const MAP = {k: 1, x1: 0, z0: 0, dot: null};
  function buildMap(){ const plan = $('#escPlan'), sp = H.BIM2S.meta.spaces.filter(s => /^SP-L1-/.test(s.id)), main = {'SP-L1-ENTRY': 1, 'SP-L1-LIVING': 1, 'SP-L1-KITCHEN': 1, 'SP-L1-GREAT': 1};
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; const polys = sp.map(s => { const p = (s.poly || s.polygon).map(q => W2(q[0], q[1])); for(const [x, z] of p){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return {id: s.id, p}; });
    // plan turned a quarter: +z runs to the right and +x runs up, so the walk from the entry to the great room reads left to right
    const w = 248, h = 176, k = Math.min(w / (z1 - z0), h / (x1 - x0)), ox = (w - (z1 - z0) * k) / 2, oy = (h - (x1 - x0) * k) / 2;
    MAP.pt = (x, z) => [ox + (z - z0) * k, oy + (x1 - x) * k];
    let svg = `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
    for(const s of polys){ const d = s.p.map((q, i) => { const m = MAP.pt(q[0], q[1]); return (i ? 'L' : 'M') + m[0].toFixed(1) + ' ' + m[1].toFixed(1); }).join('') + 'Z';
      svg += `<path d="${d}" fill="${main[s.id] ? '#e9e3d4' : '#f3f0e8'}" stroke="${main[s.id] ? '#a9a08b' : '#d6d1c4'}" stroke-width="${main[s.id] ? 1.2 : .8}" stroke-linejoin="round"/>`; }
    svg += `<g id="escDot"><path d="M0 0L-9 -20A22 22 0 0 1 9 -20Z" fill="rgba(201,138,18,.35)"/><circle r="5.5" fill="#c98a12" stroke="#fff" stroke-width="2"/></g></svg>`;
    plan.innerHTML = svg + ORDER.map(key => { const P = PLACES[key], m = MAP.pt(P.map[0], P.map[1]); return `<button type="button" class="pl" data-p="${key}" style="left:${(m[0] / w * 100).toFixed(1)}%;top:${(m[1] / h * 100).toFixed(1)}%">${esc(P.name)}</button>`; }).join('');
    MAP.dot = $('#escDot'); $$('.pl', plan).forEach(b => b.onclick = () => { SND.unlock(); if(phone()) setMap(false); if(S.ex) return; goTo(b.dataset.p); }); }
  function mapStep(){ if(!MAP.dot || !MAP.pt) return; const m = MAP.pt(rig.pos.x, rig.pos.z), fx = -Math.sin(rig.yaw), fz = -Math.cos(rig.yaw), a = Math.atan2(fz, fx) * 180 / Math.PI;   // the wedge points up the page at 0; on the page, forward is (du, dv) = (fz, -fx)
    const key = m[0].toFixed(1) + ',' + m[1].toFixed(1) + ',' + a.toFixed(0); if(key === MAP.key) return; MAP.key = key; MAP.dot.setAttribute('transform', `translate(${m[0].toFixed(1)} ${m[1].toFixed(1)}) rotate(${a.toFixed(1)})`); }
  function mapPlace(k){ $$('#escPlan .pl').forEach(b => b.setAttribute('aria-current', String(b.dataset.p === k))); $('#escMapName').textContent = PLACES[k].name.toLowerCase(); $('#escMapNow').textContent = PLACES[k].name; }

  /* ---- markers: gold rings (look closer) and white circles (walk there), projected from the house */
  const marks = [], _v = new THREE.Vector3();
  function mark(kind, label, at, act, key){ const b = el('button', {class: 'escMk ' + kind, type: 'button', 'aria-label': (kind === 'walk' ? 'Walk to the ' + label.toLowerCase() : 'Look at the ' + label.toLowerCase())}, `<i>${kind === 'walk' ? ICO.walk : ''}</i><span>${esc(label)}</span>`);
    b.onclick = e => { e.stopPropagation(); SND.unlock(); act(); }; $('#escMarks').appendChild(b); const m = {b, kind, label, at, act, key, on: false}; marks.push(m); return m; }
  function setMarks(){ for(const m of marks) m.b.remove(); marks.length = 0; if(!S.place || S.ex || S.done) return;
    for(const w of (WALKS[S.place] || [])) mark('walk', PLACES[w.to].name, w.at, () => goTo(w.to), 'w:' + w.to);
    for(const id in SPOTS){ const sp = SPOTS[id]; if(sp.from.includes(S.place) && (!sp.when || sp.when())) mark('look', sp.label(), sp.at(), () => examine(id), 's:' + id); } }
  function marksStep(){ if(!marks.length) return; const r = canvas.getBoundingClientRect(), hide = !!rig.move || S.busy || !S.started || S.done || !!S.ex;
    const top = 46, bot = r.height - 46, padX = 40, items = [], placed = [];
    for(const m of marks){ if(hide){ if(m.on){ m.on = false; m.b.classList.remove('on'); } continue; }
      _v.set(m.at[0], m.at[1], m.at[2]).applyMatrix4(camera.matrixWorldInverse); const behind = _v.z > -.3, side = _v.x;
      _v.set(m.at[0], m.at[1], m.at[2]).project(camera); let x = r.left + (_v.x + 1) / 2 * r.width, y = r.top + (1 - _v.y) / 2 * r.height, edge = '', docked = false;
      // out of view: dock it to the side it lies on, so nothing you can do from here is ever off screen
      if(behind || x < r.left - 10 || x > r.left + r.width + 10 || y < r.top - 60 || y > r.top + r.height + 60){ docked = true; edge = (behind ? side < 0 : x < r.left + r.width / 2) ? 'L' : 'R'; }
      else { x = clamp(x, r.left + padX, r.left + r.width - padX); y = clamp(y, r.top + top, r.top + bot); if(x < r.left + 88) edge = 'L'; else if(x > r.left + r.width - 88) edge = 'R'; }
      items.push({m, x, y, edge, docked}); }
    // the rings you look at are placed first, so a walk label gives way to a ring and never the other way round
    items.sort((p, q) => (p.docked - q.docked) || ((p.m.kind === 'walk') - (q.m.kind === 'walk')));
    // everything on screen that a marker must not sit on, measured as it is right now
    const obs = [], add = e => { if(!e) return; const q = e.getBoundingClientRect(); if(q.width > 2 && q.height > 2) obs.push([q.left - 6, q.top - 6, q.right + 6, q.bottom + 6]); };
    add(goalE); if(placeE.classList.contains('on')) add(placeE); add(phone() ? $('#escMapBtn') : mapE); add($('#escBtns')); if(sayE.classList.contains('on')) add(sayE); add(sunE);
    if(coachE.classList.contains('on')) add(coachE);
    const wOf = m => m.w || (m.w = Math.max(40, (m.b.querySelector('span') || {}).offsetWidth || 90));
    const box = it => { const w = wOf(it.m), hw = Math.max(34, w / 2 + 4); return it.edge === 'L' ? [it.x - 32, it.y - 32, it.x + 36 + w, it.y + 32] : it.edge === 'R' ? [it.x - 36 - w, it.y - 32, it.x + 32, it.y + 32] : [it.x - hw, it.y - 32, it.x + hw, it.y + 84]; };
    const hit = (p, q) => !(p[2] < q[0] || p[0] > q[2] || p[3] < q[1] || p[1] > q[3]);
    // things that are out of view: one tidy stack per side, in the clear band between the HUD above and below
    const stack = (list, x0, x1, maxPitch) => { const n = list.length; if(!n) return; let yMin = r.top + top, yMax = r.top + bot;
      for(const o of obs){ if(o[2] < x0 || o[0] > x1) continue; if((o[1] + o[3]) / 2 < r.top + r.height / 2) yMin = Math.max(yMin, o[3] + 36); else yMax = Math.min(yMax, o[1] - 36); }
      const pitch = n > 1 ? clamp((yMax - yMin) / (n - 1), 40, maxPitch) : 0, start = clamp(r.top + r.height * .42 - (n - 1) * pitch / 2, yMin, Math.max(yMin, yMax - (n - 1) * pitch));
      list.forEach((it, i) => { it.x = it.edge === 'L' ? r.left + padX : r.left + r.width - padX; it.y = start + i * pitch; placed.push(box(it)); }); };
    const dockL = items.filter(it => it.docked && it.edge === 'L'), dockR = items.filter(it => it.docked && it.edge === 'R');
    const reach = list => Math.max(...list.map(it => 36 + wOf(it.m))) + padX;
    if(dockL.length && dockR.length && reach(dockL) + reach(dockR) + 10 > r.width){ // a narrow screen, and labels long enough to meet in the middle: the two sides take turns, row by row
      const seq = []; for(let i = 0; i < Math.max(dockL.length, dockR.length); i++){ if(dockL[i]) seq.push(dockL[i]); if(dockR[i]) seq.push(dockR[i]); }
      stack(seq, r.left, r.left + r.width, 58); }
    else { stack(dockL, r.left, r.left + 290, 66); stack(dockR, r.left + r.width - 290, r.left + r.width, 66); }
    for(const it of items){ const m = it.m;
      if(!it.docked){ // in view: the nearest free place above or below, or stay put if there is none
        const y0 = it.y, all = obs.concat(placed), free = y => { it.y = y; const q = box(it); return !all.some(o => hit(q, o)); };
        if(!free(y0)){ let ok = false; for(let k = 1; k <= 24 && !ok; k++) for(const d of (y0 > r.top + r.height * .55 ? [-1, 1] : [1, -1])){ const y = y0 + d * 30 * k; if(y < r.top + top || y > r.top + bot) continue; if(free(y)){ ok = true; break; } } if(!ok) it.y = y0; }
        placed.push(box(it)); }
      m.b.style.transform = `translate(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px)`; const cls = 'escMk ' + m.kind + ' on' + (it.edge ? ' edge ' + it.edge : '') + (m.kind === 'walk' && !S.coach.walk ? ' first' : '');
      if(m.b.className !== cls) m.b.className = cls; m.on = true; } }
  function tapAt(cx, cy){ if(rig.move || S.busy || S.ex) return; let best = null; for(const m of marks){ if(!m.on) continue; const q = m.b.getBoundingClientRect(), d = Math.hypot(q.left + q.width / 2 - cx, q.top + q.height / 2 - cy); if(d < 56 && (!best || d < best.d)) best = {m, d}; } if(best) best.m.act(); }

  /* ---- coach: look, walk, tap, taught one at a time by doing */
  function coach(){ if(!S.started || S.done){ coachE.classList.remove('on'); return; } const c = S.coach; let k = '';
    if(!c.look){ if(S.dragPx > 140){ c.look = true; } else k = 'look'; }
    if(!k && !c.walk) k = 'walk'; if(!k && !c.tap && S.place === 'coffee' && !S.ex) k = 'tap';
    if(S.ex || rig.move || mapOpen() || S.stage !== 'arrive') k = '';
    if(k){ let y, x = '';   // the coach line sits in the top bar when there is room between the objective and the buttons; otherwise just under what is at the top
      if(phone()) y = $('#escTop').getBoundingClientRect().bottom + 10;
      else { const g = goalE.getBoundingClientRect(), b = $('#escBtns').getBoundingClientRect(); if(b.left - g.right > 360){ y = g.top + 6; x = Math.round((g.right + b.left) / 2) + 'px'; } else y = Math.max(g.bottom, placeE.classList.contains('on') ? placeE.getBoundingClientRect().bottom : 0) + 12; }
      y = Math.round(y) + 'px'; if(coachE.style.top !== y) coachE.style.top = y; if(coachE.style.left !== x) coachE.style.left = x; }
    if(k === UI.coachK) return; UI.coachK = k; coachE.className = k ? 'on ' + k : '';
    if(k) coachE.innerHTML = k === 'look' ? ICO.drag + '<span>Drag to look around</span>' : k === 'walk' ? ICO.disc + '<span>Tap a white circle to walk there</span>' : ICO.ring + '<span>Tap a gold ring to look closer</span>'; }

  /* ================================================================== moving and examining */
  function standPose(k){ const P = PLACES[k], a = yp(P.pos, P.faceLight && lightOn(S.hour) ? P.faceLight : P.face); return {yaw: a[0], pitch: a[1], fov: placeFov(P.fov), off: [0, 0]}; }
  function arrive(k, first){ S.place = k; S.busy = false; mapPlace(k); setMarks(); const fresh = !S.visited[k]; S.visited[k] = true; if(fresh || first) placeCard(k);
    if(k === 'coffee' && S.stage === 'arrive'){ /* objective moves on once they look at the fridge */ }
    S.lastProgress = performance.now(); ga('esc_place', {place: k}); }
  function goTo(k, opts){ opts = opts || {}; if(!PLACES[k] || S.busy || rig.move || S.done) return false; if(S.ex){ return false; }
    if(k === S.place){ const p = standPose(k); rig.lim = null; rig.tyaw = rig.yaw + angDiff(rig.yaw, p.yaw); rig.tpitch = p.pitch; rig.zoom = 1; return true; }
    const path = route(S.place, k).map(n => [NODES[n][0], EYE, NODES[n][1]]); S.busy = true; S.coach.walk = true; placeE.classList.remove('on'); sayE.classList.remove('on');
    const pose = opts.pose || standPose(k); const dur = rigTravel(path, pose, {face: true, done: () => { arrive(k); if(opts.done) opts.done(); }}); SND.steps(clamp(Math.round(dur / .44), 1, 7)); return true; }
  // the free part of the screen while a sheet is open, as fractions: where the thing you are examining should sit
  function freeArea(){ const W = innerWidth, Hh = innerHeight, r = sheetE.getBoundingClientRect(); const topPad = phone() ? Math.max(118, goalE.getBoundingClientRect().bottom + 10) : 30;
    if(phone()){ const sunH = document.documentElement.classList.contains('esc-exsun') ? 96 : 0, b = Math.max(topPad + 80, Hh - r.height - 16 - sunH); return {fx: .5, fy: (topPad + b) / 2 / Hh, fw: .94, fh: (b - topPad) / Hh}; }
    const l = Math.min(W - 392, W * .62); return {fx: l / 2 / W, fy: .5, fw: l / W * .92, fh: .74}; }
  const SPOTS = {
    fridge: {from: ['coffee'], label: () => 'Drinks fridge', at: () => [19.64, 1.9, 11.5], pos: [19.64, 2.3, 8.3], look: [19.64, 1.72, 11.7], fit: {w: 2.5, h: 3.1}},
    pocket: {from: ['coffee'], label: () => S.doorShut ? 'Drawing on the door' : 'Pocket door', at: () => [22.0, S.doorShut ? 2.2 : 4.1, 9.55],
      pose: () => S.doorShut ? {pos: [18.5, 4.2, 9.525], look: [22.15, 4.1, 9.525], fit: {w: 2.05, h: 3.45}} : {pos: [17.2, 4.7, 9.55], look: [22.1, 3.7, 9.55], fit: {w: 3.6, h: 6.4}}},
    paper: {from: ['great'], label: () => 'Paper on the window', at: () => PAPER.box ? [PAPER.box.max.x + .05, (PAPER.box.min.y + PAPER.box.max.y) / 2, (PAPER.box.min.z + PAPER.box.max.z) / 2] : [4.7, 3.2, 23.4],
      pose: () => { const b = PAPER.box, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2; return {pos: [8.9, cy + .25, cz], look: [b.max.x, cy, cz], fit: {w: b.max.z - b.min.z + .9, h: b.max.y - b.min.y + .9}}; }},
    floor: {from: ['great'], when: () => lightOn(S.hour), label: () => 'Light on the floor', at: () => [11.0, .15, 26.35], pos: [10.95, 7.7, 29.0], look: [10.95, 0, 24.5], fit: {w: 6.4, h: 3.3}, sun: true}};
  function examine(id){ const sp = SPOTS[id]; if(!sp || S.busy || rig.move || S.done || S.ex) return; S.seen[id] = true; S.coach.tap = true; ga('esc_look', {item: id}); SND.look();
    S.ex = {id, back: {yaw: rig.yaw, pitch: rig.pitch}}; S.busy = true; setMarks(); placeE.classList.remove('on'); sayE.classList.remove('on');
    document.documentElement.classList.add('esc-ex'); document.documentElement.classList.toggle('esc-exsun', !!sp.sun);
    sheetFor(S.ex); sheetE.classList.add('on'); frameExamine(.95, () => { S.busy = false; onExamined(id); }); }
  function frameExamine(dur, done){ const sp = SPOTS[S.ex.id], po = sp.pose ? sp.pose() : sp, a = yp(po.pos, po.look), dist = Math.hypot(po.look[0] - po.pos[0], po.look[1] - po.pos[1], po.look[2] - po.pos[2]);
    document.documentElement.style.setProperty('--sheet-h', Math.round(sheetE.getBoundingClientRect().height) + 'px');
    const free = freeArea(), pose = {yaw: a[0], pitch: a[1], fov: fitFov(po.fit, dist, free), off: [free.fx - .5, free.fy - .5]};
    rigTravel([[rig.pos.x, rig.pos.y, rig.pos.z], po.pos], pose, {dur, done: () => { rig.lim = {yaw: pose.yaw, pitch: pose.pitch, ry: .2, rp: .14}; if(done) done(); }}); }
  function back(){ if(!S.ex || rig.move || S.busy) return; const ex = S.ex; SND.back(); sheetE.classList.remove('on'); S.busy = true;
    const P = PLACES[S.place], pose = {yaw: ex.back.yaw, pitch: ex.back.pitch, fov: placeFov(P.fov), off: [0, 0]};
    rigTravel([[rig.pos.x, rig.pos.y, rig.pos.z], P.pos], pose, {dur: .85, done: () => { S.ex = null; S.busy = false; document.documentElement.classList.remove('esc-ex', 'esc-exsun'); setMarks(); }}); }
  function sheet(html){ sheetE.innerHTML = html + `<div class="row"><button class="escBtn" type="button" data-a="back">${ICO.back}<span>Back to the ${esc(PLACES[S.place].name.toLowerCase())}</span></button></div>`;
    const bk = sheetE.querySelector('[data-a=back]'); bk.onclick = () => back(); const ex = sheetE.querySelector('.row'); const extra = sheetE.querySelector('[data-a=act]'); if(extra) ex.insertBefore(extra, bk);
    $('#escBack span').textContent = 'Back to the ' + PLACES[S.place].name.toLowerCase(); }
  function sheetFor(ex){ const id = ex.id;
    if(id === 'fridge') return sheetFridge();
    if(id === 'pocket'){ if(!S.doorShut){ sheet(`<h3>The pocket door</h3><p>It slides out of the wall between the fridge and the coffee bar, and closes the kitchen off from the bedroom hall.</p><button class="escBtn dark" type="button" data-a="act">Slide it shut</button>`);
        sheetE.querySelector('[data-a=act]').onclick = () => { if(S.busy || rig.move) return; slideDoor(true); S.busy = true; setTimeout(() => { S.busy = false; sheetFor(ex); frameExamine(.9, () => { S.busy = false; if(!S.sawDrawing){ S.sawDrawing = true; say('I drew that. The clock took three tries.'); setStage(lightUp(S.hour) ? 'light' : 'drawing'); } }); S.busy = true; }, reduce ? 50 : 720); }; }
      else { sheet(`<h3>Snowball’s drawing</h3><p>Kraft paper, taped where nobody sees it while the door is open. A low sun, two tall windows side by side, light landing on a floor, and a clock. It is signed with a paw print.</p><button class="escBtn" type="button" data-a="act">Slide the door open</button>`);
        sheetE.querySelector('[data-a=act]').onclick = () => { if(S.busy || rig.move) return; slideDoor(false); S.busy = true; setTimeout(() => { S.busy = false; sheetFor(ex); frameExamine(.9, () => { S.busy = false; }); S.busy = true; }, reduce ? 50 : 500); }; }
      return; }
    if(id === 'paper'){ const lit = LIGHT.dining && LIGHT.dining.wins[0].s > .3;
      return sheet(`<h3>Paper on the window</h3><p>Strips of paper taped to the glass in three boxy figures. Some are white card and some are tracing paper.</p><p>${lit ? 'With the sun behind them, the card goes dark and the tracing paper glows.' : 'With no sun on this side of the house, they all look the same.'}</p>`); }
    if(id === 'floor'){ const up = lightUp(S.hour), on = lightOn(S.hour);
      return sheet(up ? `<h3>Light on the floor</h3><p>The card strips block the sun and the tracing paper lets it through. Three digits, the right way up from here.</p>`
        : on ? `<h3>Light on the floor</h3><p>Shadows from the paper on the window, pulled out of shape. The sun is not quite where Snowball drew it.</p>`
        : `<h3>The floor</h3><p>No sun through the big windows at this hour.</p>`); } }
  function onExamined(id){ if(id === 'fridge'){ if(S.stage === 'arrive'){ setStage('fridge'); say('Locked. I did that.', 3800); } }
    if(id === 'paper'){ SND.paper(); if(!S.said_paper){ S.said_paper = true; say('Light can tell them apart.', 4600); } }
    if(id === 'floor') checkRead();
    if(id === 'pocket' && S.doorShut && !S.sawDrawing){ S.sawDrawing = true; setStage(lightUp(S.hour) ? 'light' : 'drawing'); } }
  function checkRead(){ if(S.ex && S.ex.id === 'floor' && lightUp(S.hour) && !S.readCode){ S.readCode = true; S.sawLight = true; if(RANK.indexOf(S.stage) < RANK.indexOf('code')){ S.stage = 'light'; setStage('code'); } } }

  /* ---- the fridge keypad */
  let padCur = '', padLock = false;
  function sheetFridge(){ padCur = ''; padLock = false;
    sheet(`<h3>The drinks fridge</h3><p>Smoked glass, one bottle on the shelf, and a keypad lock that wants three digits.</p>
      <div class="escDisp" id="escDisp" aria-live="polite"></div>
      <div class="escPad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}<button type="button" class="z" data-n="0">0</button><button type="button" class="c" data-n="c" aria-label="Delete the last digit">⌫</button></div>`);
    padDraw(); $$('.escPad button', sheetE).forEach(b => b.onclick = () => padPress(b.dataset.n)); }
  function padDraw(cls){ const d = $('#escDisp'); if(!d) return; d.className = 'escDisp ' + (cls || '');
    d.innerHTML = [0, 1, 2].map(i => `<i>${padCur[i] || ''}</i>`).join('') + `<button type="button" class="escBtn c2" style="display:none;min-height:48px;padding:0 14px" aria-label="Delete the last digit">⌫</button>`;
    d.querySelector('.c2').onclick = () => padPress('c'); lockFace(padCur, cls === 'ok' ? 'open' : cls === 'bad' ? 'bad' : 'locked'); }
  function padPress(n){ if(padLock || S.done || !S.ex || S.ex.id !== 'fridge') return; SND.unlock();
    if(n === 'c'){ padCur = padCur.slice(0, -1); padDraw(); SND.tap(); return; } if(padCur.length >= 3) return; padCur += n; padDraw(); SND.key(padCur.length);
    if(padCur.length < 3) return; padLock = true;
    if(padCur === CODE){ padDraw('ok'); SND.right(); setTimeout(win, 620); }
    else { padDraw('bad'); SND.wrong(); S.wrong++; ga('esc_wrong', {n: S.wrong}); setTimeout(() => { padCur = ''; padLock = false; padDraw(); if(S.wrong === 1) say('No.', 2600); else if(S.wrong % 3 === 0) say('Guessing is a thousand tries. I can wait.', 4600); }, 650); } }

  /* ================================================================== hints: Snowball, three levels for the step you are on */
  let hintIx = 0;
  const HINTS = {
    arrive: [['Coffee bar. Past the kitchen. Follow the white circles.'], ['I’ll wait by the kitchen door.', () => catAt([12.2, 0, 3.7])], ['Fine. Come with me.', () => { catAt([17.8, 0, 9.0]); goTo('coffee'); }]],
    fridge: [['I put my clue where you only see it with the kitchen shut.'], ['I’m sitting next to it. The door that slides into the wall.', () => { catAt([21.3, 0, 8.6]); if(S.place !== 'coffee') goTo('coffee'); }],
      ['Tap the pocket door and slide it shut.', () => { catAt([21.3, 0, 8.6]); if(S.place !== 'coffee') goTo('coffee'); }]],
    drawing: [['Read my drawing again. Start with the clock.'], ['A low sun. The two big windows by the dining table. Four o’clock. The slider at the bottom is the sun.', () => sunKey(true)], ['I’ll do it. Four in the afternoon.', () => sweepTo(T_SUN, 1500)]],
    light: [['The two tall windows in my drawing are in the great room. Look down.'], ['I’m lying in the warm bit. You can’t miss me.', () => { catAt([14.3, 0, 24.7]); if(lightOn(S.hour) === false) sweepTo(T_SUN, 1200); }],
      ['Tap the light on the floor.', () => { const go = () => setTimeout(() => examine('floor'), 250); if(!lightUp(S.hour)) setSlider(T_SUN); if(S.ex) return; if(S.place === 'great') go(); else goTo('great', {done: go}); }]],
    code: [['You’ve read it. Now go and use it.'], ['Left to right, as it lies on the floor.'], ['Three, two, seven. You’re welcome.']]};
  function hint(){ if(!S.started || S.done || rig.move || S.busy) return; const tiers = HINTS[S.stage]; if(!tiers) return; const i = Math.min(hintIx, tiers.length - 1), t = tiers[i]; hintIx = Math.min(i + 1, tiers.length - 1);
    S.hints++; S.lastProgress = performance.now(); $('#escHint').classList.remove('nudge'); ga('esc_hint', {stage: S.stage, tier: i + 1});
    const run = () => { say(t[0], 7000); if(t[1]) t[1](); };
    if(S.ex && t[1]){ back(); const w = setInterval(() => { if(!S.ex && !rig.move && !S.busy){ clearInterval(w); run(); } }, 80); } else run(); }

  /* ================================================================== start and finish */
  function startCard(){ const best = store.get(KEY + '.best');
    const c = el('div', {id: 'escCard'}, `<div class="c" role="dialog" aria-labelledby="escH"><p class="k">Locked In at Hillside · Easy</p><h2 id="escH">Pop the Cork</h2>
      <p class="lede">Snowball is the cat of the house. There is champagne for this evening, and he has locked it in a drinks fridge to find out whether you are as clever as he is.</p>
      <div class="note"><p>Welcome. I have locked the champagne away. The code is hidden in the house. I left one clue, and it is a good one.</p><p class="sig">${PAW}</p><p class="ps">P.S. The doorbell rings at dusk. If you get stuck, ask me. I like being asked.</p></div>
      <ul class="how"><li>${ICO.drag}Drag to look around</li><li>${ICO.disc}Tap a white circle to walk there</li><li>${ICO.ring}Tap a gold ring to look closer</li></ul>
      <div class="acts"><button class="escBtn primary" type="button" id="escGo" style="min-width:150px;min-height:52px;font-size:17px">Go inside</button><button class="escBtn" type="button" id="escSnd0"></button></div>
      <p class="foot">About five minutes${best ? ', and your best so far is ' + fmtT(best.time) : ''}. The house is real: 118 Hillside Drive in Woodside, California, shown here as a 3D model, and it is for sale.</p></div>`);
    document.body.appendChild(c); const s0 = $('#escSnd0'), d0 = () => { s0.innerHTML = (SND.muted ? ICO.mute : ICO.sound) + '<span>' + (SND.muted ? 'Sound is off' : 'Sound is on') + '</span>'; s0.setAttribute('aria-pressed', String(!SND.muted)); };
    s0.onclick = () => { SND.setMuted(!SND.muted); d0(); UI.drawSnd(); if(!SND.muted) SND.goal(); }; d0(); try{ $('#escGo').focus({preventScroll: true}); }catch(e){}
    $('#escGo').onclick = () => { SND.unlock(); SND.tap(); $('#escGo').disabled = true; fadeThrough(() => { c.remove(); begin(); }, 420); }; }
  function begin(){ document.documentElement.classList.remove('esc-pre'); const p = standPose('entry'); rigCut(PLACES.entry.pos, p.yaw, p.pitch, p.fov); S.started = true; S.t0 = S.lastProgress = performance.now(); ga('esc_start');
    arrive('entry', true); catAt([-.2, 0, -4.6]); setTimeout(() => { if(S.stage === 'arrive' && !rig.move) say('It is all in plain sight. That is the sporting way.', 4600); }, phone() ? 7200 : 2600); }   // on a phone, after the place card has gone
  function win(){ if(S.done) return; S.done = true; S.tEnd = performance.now(); S.stage = 'done'; const t = elapsed(); ga('esc_win', {secs: Math.round(t), hints: S.hints});
    const best = store.get(KEY + '.best'); if(!best || t < best.time) store.set(KEY + '.best', {time: t, hints: S.hints});
    sheetE.classList.remove('on'); document.documentElement.classList.add('esc-cine'); for(const m of marks) m.b.classList.remove('on'); $('#escGoalT').textContent = GOALS.done;
    // step back a little so the open door and the bottle both sit in frame
    const a = yp([19.35, 2.8, 8.3], [19.75, 1.6, 12.2]); rigTravel([[rig.pos.x, rig.pos.y, rig.pos.z], [19.35, 2.8, 8.3]], {yaw: a[0], pitch: a[1], fov: aspect() < 1 ? 80 : 58, off: [0, 0]}, {dur: 1.2});
    setTimeout(openFridgeDoor, 250); setTimeout(() => toast('Champagne.', 2400), 1300);
    setTimeout(() => { // the afternoon runs out, the house lights come on, and the doorbell goes: the last view is the lit house from outside
      const sh = SHOT(), a = yp(sh.pos, sh.look), a2 = yp(sh.pos2, sh.look);
      fadeThrough(() => { rigCut(sh.pos, a[0], a[1], sh.fov); $('#escSlider').value = 18.75; setClock(18.75); applyHour(18.75, true); catAt(sh.cat);
        rigTravel([sh.pos, sh.pos2], {yaw: a2[0], pitch: a2[1], fov: sh.fov, off: sh.off}, {dur: 9}); }, 520);
      setTimeout(() => { SND.bell(); }, 1500);
      setTimeout(() => { const fd = (H.door28 && H.door28.items || []).find(it => it.id === 'D-LG-02'); if(fd && fd.t < .5 && H.door28.moving){ fd.dir = 1; fd.lt = performance.now(); H.door28.moving.add(fd); wake(90); } }, 2500);
      setTimeout(finishCard, 5600); }, 3400); }
  // the closing view: a slow move toward the lit house at dusk; the finish card sits beside it (below it on a phone), so the view is moved over to stay in the clear
  const SHOT = () => aspect() < 1 ? {pos: [-6, 5, 34], pos2: [-6, 5, 31], look: [-6, 5, 0], fov: 80, off: [0, -.36], cat: [-4.6, 0, 6]} : {pos: [-5, 6.2, 41], pos2: [-5, 6, 36.5], look: [-5, 4.8, 0], fov: 58, off: [-.17, 0], cat: [-4.6, 0, 6]};
  function finishCard(){ const t = elapsed(); SND.cork();
    const c = el('div', {id: 'escCard', class: 'side'}, `<div class="c" role="dialog" aria-labelledby="escH"><p class="k">Locked In at Hillside · Easy</p><h2 id="escH">Cork popped.</h2>
      <p class="lede">The doorbell is ringing and the house is lit for the evening. Snowball says you are nearly as clever as he is, and he is keeping the box the champagne came in.</p>
      <div class="stats"><div><b>${fmtT(t)}</b><span>your time</span></div><div><b>${S.hints}</b><span>${S.hints === 1 ? 'hint from Snowball' : 'hints from Snowball'}</span></div></div>
      <div class="cta"><b>The house is real, and it is for sale.</b><span>118 Hillside Drive is in Woodside, California, with six bedrooms and three full baths. The afternoon sun really does come through the great room like that. Come and stand in it.</span>
        <div class="acts"><a class="escBtn primary" href="/#contact" id="escSee" style="min-height:52px;font-size:17px">See it in person</a><a class="escBtn light" href="/tour/" id="escFree">Explore the house freely</a></div></div>
      <div class="more"><button class="escBtn" type="button" id="escShare">Share</button><button class="escBtn" type="button" id="escAgain">Play again</button><a class="escBtn" href="/games/">More games</a></div></div>`);
    document.body.appendChild(c); const card = c.querySelector('.c');
    if(!reduce) for(let i = 0; i < 9; i++){ const b = el('i', {class: 'escBub', 'aria-hidden': 'true'}); b.style.right = (14 + Math.random() * 120) + 'px'; b.style.animationDelay = (Math.random() * 3) + 's'; b.style.width = b.style.height = (6 + Math.random() * 7) + 'px'; card.appendChild(b); }
    $('#escSee').onclick = () => ga('esc_cta', {cta: 'see_in_person'}); $('#escFree').onclick = () => ga('esc_cta', {cta: 'explore'});
    $('#escAgain').onclick = () => location.reload();
    $('#escShare').onclick = async () => { const url = SITE.page('/games/escape/'), text = `Locked In at Hillside: Snowball the cat locked the champagne in a fridge at 118 Hillside Drive, and I got it out in ${fmtT(t)}. Your turn.`; ga('esc_share');
      try{ if(navigator.share){ await navigator.share({title: 'Locked In at Hillside', text, url}); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
      try{ await navigator.clipboard.writeText(text + ' ' + url); $('#escShare').textContent = 'Link copied'; }catch(e){ $('#escShare').textContent = url; } };
    try{ $('#escSee').focus({preventScroll: true}); }catch(e){} }

  /* ================================================================== build the level into the house */
  function buildWorld(){
    const win = opening('WN-L1-03');
    // the roller shade on the big window sits a quarter of the way down; its hem is the top of the light
    const shadeTop = win.o.head - .28 - (win.o.head - .28 - win.o.sill) * .26;
    // on the clear oak between the dining table and the rug, read from the sofa: right = away from the glass (+x), up = toward the table (-z)
    const frame = {o: [8.6, 25.5], right: [1, 0], up: [0, -1], size: 1.15, pitch: 1.52, floorY: .05};
    const strips = makeStrips(CODE, frame, win); buildPaper(strips, win);
    LIGHT.dining = floorLight('SP-L1-GREAT', [{id: 'WN-L1-03', top: shadeTop, bot: win.o.sill + .12, bars: [[-.17, .17, 0, 9]], strips}], {ppf: 40});
    // the iron-and-glass doors at both ends of the entry: morning sun through the front, late sun through the back
    const grid = [[-1.46, -1.3, 0, 9], [1.3, 1.46, 0, 9], [-4.4, 4.4, 2.8, 2.94], [-4.4, 4.4, 5.28, 5.42]];
    LIGHT.entry = floorLight('SP-L1-ENTRY', [{id: 'D-LG-02', bot: .1, top: 7.8, inset: .25, bars: grid}, {id: 'D-L0-11', bot: .1, top: 7.8, inset: .25, bars: grid}], {ppf: 30});
    const upd = LIGHT.dining.update; LIGHT.dining.update = function(){ upd(); paperLight(LIGHT.dining.wins[0].s); };
    // the vases on the sitting-area table stand between the sofa and the floor you need to read; the table stays
    try{ const b = new THREE.Box3(); for(const k of Object.keys(H.GROUPS)) for(const c of H.GROUPS[k].children){ if(c.name !== 'drumTable') continue; b.setFromObject(c); if(b.min.z > 27 && b.max.z < 32 && b.min.x > 8) c.children.forEach(q => { if(q.name === 'decor') q.visible = false; }); } }catch(e){}
    buildDrawing(); buildFridge(); makeCat(); }

  /* ================================================================== frame loop */
  let lastT = performance.now(), lastTime = '';
  function frame(){ requestAnimationFrame(frame); const now = performance.now(), dt = Math.min(.1, (now - lastT) / 1000); lastT = now;
    try{ if(UI.live){ rigStep(now, dt); fridgeStep(now); }
      // nothing may stay locked: a step that never reports back is released
      if(S.busy && !rig.move){ if(!frame.busyAt) frame.busyAt = now; else if(now - frame.busyAt > 2600){ S.busy = false; frame.busyAt = 0; } } else frame.busyAt = 0;
      if(S.started){ marksStep(); mapStep(); coach();
        if(!S.done){ const ts = fmtT(elapsed()); if(ts !== lastTime){ lastTime = ts; $('#escTime').textContent = ts; }
          if(now - S.lastProgress > 80000 && !S.ex) $('#escHint').classList.add('nudge'); } }
    }catch(e){ if(!frame.err){ frame.err = true; console.error('[escape] frame', e); } } }

  /* ================================================================== boot: after the house is ready */
  function boot(){ try{ H.asBuilt && H.asBuilt(); }catch(e){}
    loadSnowball(() => { try{ buildUI(); buildWorld(); $('#escSlider').value = S.hour; setClock(S.hour); applyHour(S.hour, true);
        const a = yp([-7.6, 5.1, 15.8], [-5.6, 4.6, 6]); rigCut([-7.6, 5.1, 15.8], a[0], a[1], aspect() < 1 ? 80 : 60); UI.live = true; }catch(e){ console.error('[escape] build', e); }
      requestAnimationFrame(frame);
      // the card waits for the photo introduction to leave, or for the loading poster to finish fading: never two things on screen at once
      const clear = () => { const ld = document.getElementById('loading'); let n = 0; (function w(){ let o = 0; try{ o = ld ? +getComputedStyle(ld).opacity : 0; if(ld && getComputedStyle(ld).display === 'none') o = 0; }catch(e){}
          if(o < .03 || n++ > 40){ document.documentElement.classList.add('esc-up'); startCard(); } else setTimeout(w, 120); })(); };
      const intro = document.getElementById('intro28'); if(intro){ const mo = new MutationObserver(() => { if(!document.getElementById('intro28')){ mo.disconnect(); clear(); } }); mo.observe(document.body, {childList: true}); } else clear(); }); }
  // start only once the engine is really drawing frames (the loading card can read "done" a moment before the first render)
  (function wait(n){ let fr = 0; try{ fr = H.renderer.info.render.frame; }catch(e){} const ld = document.getElementById('loading'), up = ld && !ld.classList.contains('done');
    if((fr > 8 && !up) || n > 240) setTimeout(boot, 700); else setTimeout(() => wait(n + 1), 250); })(0);
  window.ESCAPE = {S, rig, PLACES, SPOTS, LIGHT, FR, SITE, sound: SND, goTo, examine, back, hint, win, setSlider, sunDir, catAt, padPress, say,
    view(pos, look, fov){ const a = yp(pos, look); rigCut(pos, a[0], a[1], fov || 62); }};
})();

/* preview hosts: when the site is served from a sub-path (a test mirror), point root links like /games/ at that copy; no effect on 118hillside.com */
(function(){ if(window.__siteLinks) return; window.__siteLinks = 1; var m = /githack/.test(location.host) ? location.pathname.match(/^(\/[^\/]+\/[^\/]+\/[^\/]+)\//) : location.pathname.match(/^(.*)\/(tour|thanksgiving|halloween|games|woodside)\//), base = m ? m[1] : ''; if(!base) return;
  document.addEventListener('click', function(e){ var a = e.target && e.target.closest && e.target.closest('a[href]'); if(!a) return; var h = a.getAttribute('href'); if(!h || h.charAt(0) !== '/' || h.charAt(1) === '/' || h.indexOf(base + '/') === 0) return;
    a.setAttribute('href', base + h.replace(/^([^?#]*\/)(?=[?#]|$)/, '$1index.html')); }, true);
})();
