/* Locked In at Hillside (r39): an escape room played inside the 3D model of 118 Hillside Drive, in three levels.
   Loaded by tour/index.html on ?escape=<level>; talks to the engine through window.HILLSIDE.

   Levels: easy (The Lemonade Lock, this file), medium (The Missing Treat Tin, medium.js) and hard (The Sunset Heist, hard.js). The start
   card picks one, remembers it, and the share link carries it (?level=). A level's props, animals and drawings load only when it starts.
   The design is assets/escape/DESIGN.md. Every level's logic (what needs what, the codes, the objectives and Snowball's hints) is data in
   logic.js; this file gates every ring and button with it, and `node assets/escape/check.js` proves each level solvable and leak-free.

   How it plays (unchanged from r35, now for every floor):
   - The game owns the camera. You stand at named places, look around freely, and walk between them: along paths ray-checked against the
     walls and furniture where a level has them, and through a short fade (stairs, other floors, the map) where it doesn't.
   - Every clue has an examine view framed in the free part of the screen. One objective line says what to do next. Snowball gives three
     levels of hint for it. Medium and Hard keep a notebook of every clue at full size, readable on a phone.
   - The sun is the puzzle: the slider moves the real sun, and light through the real windows and skylights carries the codes.
   - Progress is saved per level and survives a reload; best times are kept per level.
   The cast is pets only. No people are named or described anywhere in the game.
   Debug hook: window.ESCAPE (state, rig, goTo, examine, back, hint, setSlider, give, qa). */
(function(){
  'use strict';
  const H = window.HILLSIDE; if(!H || window.ESCAPE) return;
  const THREE = H.THREE, canvas = H.canvas, camera = H.camera;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const store = {
    get(k){ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
    del(k){ try{ localStorage.removeItem(k); }catch(e){} }};
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
  const SITE = (() => { const m = /githack/.test(location.host) ? location.pathname.match(/^(\/[^\/]+\/[^\/]+\/[^\/]+)\//) : location.pathname.match(/^(.*)\/(tour|games)\//), base = m ? m[1] : '';
    return {base, page: path => location.origin + base + path + (base ? 'index.html' : '')}; })();
  const PAW = '<svg class="paw" viewBox="0 0 44 44" role="img" aria-label="Signed with a paw print"><g fill="currentColor"><ellipse cx="22" cy="29" rx="10" ry="8.4"/><ellipse cx="8.6" cy="18" rx="4" ry="5.2" transform="rotate(-24 8.6 18)"/><ellipse cx="16.6" cy="10" rx="4" ry="5.4" transform="rotate(-8 16.6 10)"/><ellipse cx="27.4" cy="10" rx="4" ry="5.4" transform="rotate(8 27.4 10)"/><ellipse cx="35.4" cy="18" rx="4" ry="5.2" transform="rotate(24 35.4 18)"/></g></svg>';
  // where this script lives, so the level files load from the same place with the same version
  const SRC = (document.currentScript && document.currentScript.src) || (Array.from(document.scripts).map(s => s.src).find(s => /escape\/escape\.js/.test(s)) || '');
  const DIR = SRC.replace(/escape\.js.*$/, ''), VER = (SRC.match(/[?&]v=([^&]+)/) || [])[1] || '1';
  const loadJS = name => new Promise((ok, no) => { const s = document.createElement('script'); s.src = DIR + name + '?v=' + VER; s.onload = ok; s.onerror = () => no(new Error('could not load ' + name)); document.head.appendChild(s); });

  /* ================================================================== levels */
  const LEVELS = ['easy', 'medium', 'hard'];
  const META = {
    easy:   {name: 'Easy', title: 'The Lemonade Lock', time: 'About 5 minutes', mins: 5, who: 'A first go, and younger players', where: 'The main floor',
      blurb: 'Snowball has locked the lemonade in a drinks fridge. One clue, and the sun.'},
    medium: {name: 'Medium', title: 'The Missing Treat Tin', time: '15 to 20 minutes', mins: 15, who: 'Families, and anyone who did Easy', where: 'Two floors',
      blurb: 'The treat tin is gone and four of Snowball’s friends are acting very strange.'},
    hard:   {name: 'Hard', title: 'The Sunset Heist', time: '30 to 40 minutes', mins: 30, who: 'Sharp teens and grown-ups', where: 'The whole house, sunrise to sunset',
      blurb: 'The longest day of the year. Snowball plans a heist by sunset, and everyone saw a bit of it.'}};
  const Q = new URLSearchParams(location.search), pickL = v => LEVELS.includes(v) ? v : null;
  const URL_LEVEL = pickL((Q.get('level') || '').toLowerCase()) || pickL((Q.get('escape') || '').toLowerCase());
  let LEVEL = URL_LEVEL || pickL(store.get('esc.level')) || 'easy';
  let LG = null, L = null;   // the level's logic (logic.js) and its world (this file for Easy, medium.js / hard.js)
  const ga = (n, p) => { try{ window.gtag && gtag('event', n, Object.assign({level: LEVEL}, p || {})); }catch(e){} };
  window.ESCAPE_LEVELS = window.ESCAPE_LEVELS || {};
  const EYE = 5.3;

  /* ================================================================== state */
  const S = {started: false, done: false, t0: 0, hints: 0, place: null, ex: null, busy: false, f: {}, read: {}, notes: [], hintIx: {},
    visited: {}, wrong: 0, wrongRun: 0, pauseUntil: 0, lastProgress: 0, coach: {look: false, walk: false, tap: false}, dragPx: 0, hour: 10};
  const elapsed = () => S.t0 ? ((S.tEnd || performance.now()) - S.t0) / 1000 : 0;
  const has = f => !!S.f[f];
  const can = id => { const st = LG && LG.steps[id]; return !!st && st.needs.every(has); };
  const fresh = id => can(id) && !LG.steps[id].gives.every(has);
  const sunIn = id => { const st = LG && LG.steps[id]; return !!(st && st.sun) && S.hour >= st.sun[0] - 1e-6 && S.hour <= st.sun[1] + 1e-6; };
  function give(){ let any = false; for(const f of arguments){ if(!S.f[f]){ S.f[f] = true; any = true; if(/^p_/.test(f) && S.read[f] == null) S.read[f] = S.hour; } }
    if(!any) return false; S.lastProgress = performance.now(); ga('esc_step', {flags: Array.from(arguments).join(',')});
    const fresh = LG ? LG.goals.filter(g => g.needs.some(f => Array.prototype.includes.call(arguments, f)) && g.needs.every(has) && !g.done.some(has)) : []; if(fresh.length) UI.goalId = fresh[0].id;
    const was = UI.goalId; setGoal(); if(UI.goalId !== was) { hintReset(); } if(!S.ex) setMarks(); save(); return true; }

  /* ================================================================== sun */
  let DOY = 288;
  function sunDir(h, doy){ const p = H.sunPosition(h, doy || DOY), plan = p.az - 46.14 * Math.PI / 180, alt = Math.max(p.alt, -.02);
    return new THREE.Vector3(Math.cos(plan) * Math.cos(alt), Math.sin(alt), Math.sin(plan) * Math.cos(alt)).normalize(); }
  const sunAlt = h => H.sunPosition(h, DOY).alt;
  let DUSK = 18.55;   // the hour the house lights come on: when the sun is down to a hair over the hills
  if(!H.TOD.find(t => t.key === 'esc')) H.TOD.push({key: 'esc', label: 'Morning', h: 10, doy: DOY});
  let todAt = 0, todTimer = 0;
  function applyHour(h, force){ S.hour = h; const T = H.TOD.find(t => t.key === 'esc'); T.h = h; T.doy = DOY; T.label = fmtH(h);
    LIGHT.update(); wake(30); clearTimeout(todTimer); if(L && L.onLight) try{ L.onLight(h); }catch(e){ console.warn('[escape] light', e); } const now = performance.now();
    const go = () => { todAt = performance.now(); try{ H.setTOD(h >= DUSK ? 'dusk' : 'esc'); }catch(e){ console.warn('[escape] tod', e); } wake(20); };
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
    rigDrag(dx, dy, e.clientX, e.clientY); }, true);
  function endPtr(e, tap){ const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); pinch = 0; if(!ptrs.size) document.documentElement.classList.remove('esc-drag');
    try{ canvas.releasePointerCapture(e.pointerId); }catch(_){}
    if(tap && p && p.far < 7 && performance.now() - p.t < 450) tapAt(e.clientX, e.clientY); }
  addEventListener('pointerup', e => { if(onCanvas(e)) e.stopPropagation(); if(ptrs.has(e.pointerId)) endPtr(e, onCanvas(e)); }, true);
  addEventListener('pointercancel', e => { if(onCanvas(e)) e.stopPropagation(); if(ptrs.has(e.pointerId)) endPtr(e, false); }, true);
  canvas.addEventListener('lostpointercapture', e => { if(ptrs.has(e.pointerId)) endPtr(e, false); });
  addEventListener('blur', () => { ptrs.clear(); pinch = 0; document.documentElement.classList.remove('esc-drag'); });
  document.addEventListener('visibilitychange', () => { if(document.hidden){ ptrs.clear(); pinch = 0; document.documentElement.classList.remove('esc-drag'); save(); } });
  addEventListener('pagehide', () => save());
  addEventListener('wheel', e => { if(!onCanvas(e)) return; e.stopPropagation(); e.preventDefault(); if(!S.started || S.done || rig.move) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1); rig.zoom = clamp(rig.zoom * Math.exp(clamp(dy, -240, 240) * .0016), .5, 1); }, {capture: true, passive: false});
  for(const t of ['dblclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend']) addEventListener(t, e => { if(onCanvas(e)){ e.stopPropagation(); if(t === 'contextmenu') e.preventDefault(); } }, {capture: true, passive: t !== 'contextmenu'});
  // keys: the tour's shortcuts (arrows and space jump between tour stops) must never fire during the game
  addEventListener('keydown', e => { const dlg = document.querySelector('dialog[open]'); if(dlg) return; e.stopPropagation();
    if(!S.started || S.done) return; const tag = (e.target && e.target.tagName) || '';
    if(e.key === 'Escape'){ if(bookOpen()) setBook(false); else if(menuOpen()) closeMenu(); else if(mapOpen()) setMap(false); else if(S.ex) back(); return; }
    if(/INPUT|TEXTAREA|SELECT/.test(tag) || e.metaKey || e.ctrlKey || e.altKey || bookOpen()) return;
    const lockId = S.ex && SPOTS[S.ex.id] && SPOTS[S.ex.id].lock;
    if(lockId && /^[0-9]$/.test(e.key)){ padPress(e.key); e.preventDefault(); return; }
    if(lockId && e.key === 'Backspace'){ padPress('c'); e.preventDefault(); return; }
    if(tag === 'BUTTON' || tag === 'A') return;
    const k = {ArrowLeft: [.16, 0], ArrowRight: [-.16, 0], ArrowUp: [0, .1], ArrowDown: [0, -.1]}[e.key];
    if(k && !rig.move){ e.preventDefault(); rigTurn(k[0], k[1]); S.dragPx += 60; } }, true);
  addEventListener('keyup', e => { if(!document.querySelector('dialog[open]')) e.stopPropagation(); }, true);

  /* ================================================================== camera rig */
  const rig = {pos: new THREE.Vector3(), yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, fov: 62, zoom: 1, off: [0, 0], lim: null, move: null, wakeN: 0, jit: 0, sig: ''};
  const yp = (from, to) => { const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2]; return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
  const aspect = () => (canvas.clientWidth || innerWidth) / Math.max(1, canvas.clientHeight || innerHeight);
  function placeFov(base){ base = base || 62; const a = aspect(); if(a >= 1.25) return base; const t = Math.tan(base / 2 * Math.PI / 180) * 1.25 / a; return Math.min(86, 2 * Math.atan(t) * 180 / Math.PI); }
  function fitFov(fit, dist, free){ const a = aspect(), tv = (fit.h / 2 / dist) / free.fh, th = (fit.w / 2 / dist) / (free.fw * a); return clamp(2 * Math.atan(Math.max(tv, th) * 1.1) * 180 / Math.PI, 22, 86); }
  function wake(n){ rig.wakeN = Math.max(rig.wakeN, n || 20); }
  function rigDrag(dx, dy, x, y){ if(rig.move || !S.started || S.done) return; const k = (camera.fov * Math.PI / 180) / Math.max(200, canvas.clientHeight) * 1.05;
    const g = x != null && window.GRAB41 ? window.GRAB41.lookDelta(x, y, dx, dy) : null;   // r41: the tour's shared grab-the-world look (the scenery under the pointer stays under it)
    if(g) rigTurn(g[0], g[1]); else rigTurn(dx * k, dy * k); S.dragPx += Math.abs(dx) + Math.abs(dy); }
  function rigTurn(dyaw, dpitch){ rig.tyaw += dyaw; rig.tpitch += dpitch;
    if(rig.lim){ const Lm = rig.lim; rig.tyaw = Lm.yaw + clamp(angDiff(Lm.yaw, rig.tyaw), -Lm.ry, Lm.ry); rig.tpitch = clamp(rig.tpitch, Lm.pitch - Lm.rp, Lm.pitch + Lm.rp); }
    else rig.tpitch = clamp(rig.tpitch, -1.05, .8); }
  function rigCut(pos, yaw, pitch, fov, off){ rig.move = null; rig.pos.set(pos[0], pos[1], pos[2]); rig.yaw = rig.tyaw = yaw; rig.pitch = rig.tpitch = pitch; rig.fov = fov; rig.off = off || [0, 0]; rig.zoom = 1; rig.sig = ''; rig.lim = null; }
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

  /* ================================================================== the level's world: places, walking graph, things to look at */
  let PLACES = {}, ORDER = [], NODES = {}, EDGES = [], WALKS = {}, SPOTS = {};
  function route(a, b){ if(a === b) return [a]; const adj = {}; for(const [p, q] of EDGES){ if(!NODES[p] || !NODES[q]) continue; const d = Math.hypot(NODES[p][0] - NODES[q][0], NODES[p][1] - NODES[q][1]); (adj[p] = adj[p] || []).push([q, d]); (adj[q] = adj[q] || []).push([p, d]); }
    const dist = {[a]: 0}, prev = {}, open = new Set([a]);
    while(open.size){ let u = null; for(const k of open) if(u == null || dist[k] < dist[u]) u = k; open.delete(u); if(u === b) break;
      for(const [w, d] of (adj[u] || [])){ const nd = dist[u] + d; if(dist[w] == null || nd < dist[w]){ dist[w] = nd; prev[w] = u; open.add(w); } } }
    if(dist[b] == null) return null; const out = [b]; let c = b; while(prev[c]){ c = prev[c]; out.unshift(c); } return out; }
  const nodeY = n => (PLACES[n] ? PLACES[n].pos[1] : (NODES[n] && NODES[n][2] != null ? NODES[n][2] : EYE));

  /* ================================================================== house helpers: doors, shades, openings */
  const DOORS = () => (H.door28 && H.door28.items) || [];
  const doorItem = id => DOORS().find(it => it.id === id);
  function door(id, open, instant){ const it = doorItem(id); if(!it) return false; const t = open ? 1 : 0; if(Math.abs(it.t - t) < .01 && !(H.door28.moving && H.door28.moving.has(it))) return true;
    if(instant && window.__door28){ window.__door28.set(id, t); wake(10); return true; }
    it.dir = open ? 1 : -1; it.lt = performance.now(); H.door28.moving.add(it); wake(80); return true; }
  const doorT = id => { const it = doorItem(id); return it ? it.t : 0; };
  const shadeItem = id => (window.BL35 && BL35.items || []).find(it => it.id === id);
  function shade(id, down, instant){ const it = shadeItem(id); if(!it) return false; const t = down ? 1 : 0;
    if(instant || !window.__bl35){ if(window.__bl35) window.__bl35.set(id, t); wake(10); LIGHT.update(); return true; }
    if(Math.abs(it.t - t) < .01 && !BL35.moving.has(it)) return true; if(BL35.moving.has(it)){ if((it.dir > 0) !== down) window.__bl35.toggle(id); } else window.__bl35.toggle(id); wake(70); return true; }
  const shadeT = id => { const it = shadeItem(id); return it ? it.t : 0; };
  // where the hem of a shade is (world height), for the light under it
  function shadeHem(id, op){ const it = shadeItem(id); if(!it) return op.o.head; const e = ease(clamp(it.t, 0, 1));
    if(it.drop) return Math.max(op.o.sill, it.y1 - it.drop(e)); return lerp(op.o.head - .2, op.o.sill, e); }
  function opening(id){ const o = H.BIM2S.meta.openings.find(q => q.id === id); if(!o) return null; const c = W2(o.center[0], o.center[1]), a = W2(o.axis[0], o.axis[1]), n = W2(o.normal[0], o.normal[1]);
    return {o, c, a, n, P: (along, y) => new THREE.Vector3(c[0] + a[0] * along, y, c[1] + a[1] * along)}; }
  const spacePoly = id => { const sp = H.BIM2S.meta.spaces.find(q => q.id === id); return sp ? (sp.poly || sp.polygon).map(p => W2(p[0], p[1])) : null; };
  const spaceFloor = id => { const sp = H.BIM2S.meta.spaces.find(q => q.id === id); return sp ? (sp.floorZ || 0) : 0; };
  function inPoly(poly, x, z){ let c = false; for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const [xi, zi] = poly[i], [xj, zj] = poly[j]; if(((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; }

  /* ================================================================== sunlight on surfaces (the engine draws no indoor sun patches)
     A light plane is a flat surface (a floor, a bed, a desk, a lowered shade) and the openings that light it: each opening is a quad of
     glass with an outward direction, frame bars that block light, and paper strips (card blocks, tracing paper lets light through).
     The quad is carried along the sun onto the plane each time the hour changes. Film tints the light; a decal marks it (paw prints). */
  const LIGHT = {planes: [], update(){ for(const r of LIGHT.planes) try{ r.update(); }catch(e){ console.warn('[escape] light plane', e); } }};
  function frameOf(o){ // a plane: origin O, unit axes U (across) and V (up the plane), normal N = U x V
    const O = new THREE.Vector3(...o.O), U = new THREE.Vector3(...o.U).normalize(), V = new THREE.Vector3(...o.V).normalize(), N = new THREE.Vector3().crossVectors(U, V).normalize();
    return {O, U, V, N, w: o.w, h: o.h}; }
  function lightPlane(o){
    // o: {floor: spaceId | clip: [[x,z]], y, ...} for a horizontal plane, or {plane: {O, U, V, w, h}} for any other; sources: [{quad(), out: V3, bars, strips, film, gate}]
    let F, clip = null, ppf = o.ppf || 34;
    if(o.plane) F = frameOf(o.plane);
    else { clip = o.clip || spacePoly(o.floor); const y = o.y != null ? o.y : spaceFloor(o.floor); const xs = clip.map(p => p[0]), zs = clip.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      F = frameOf({O: [x0, y, z0], U: [1, 0, 0], V: [0, 0, -1], w: x1 - x0, h: z1 - z0}); }   // image top-left at (x0, z0); down the image is +z
    const cv = document.createElement('canvas'); cv.width = Math.max(8, Math.ceil(F.w * ppf)); cv.height = Math.max(8, Math.ceil(F.h * ppf)); const g = cv.getContext('2d');
    const tmp = document.createElement('canvas'); tmp.width = cv.width; tmp.height = cv.height; const tg = tmp.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.premultiplyAlpha = true; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const paint = o.blend === 'paint';
    // light multiplies what is under it: out = surface * (1 + light), so oak stays oak and a rug stays a rug. A screen ("paint") is drawn as it is.
    const mat = paint ? new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide})
      : new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide});
    const geo = new THREE.PlaneGeometry(F.w, F.h), mesh = new THREE.Mesh(geo, mat), lift = o.lift != null ? o.lift : .05;
    const C = F.O.clone().addScaledVector(F.U, F.w / 2).addScaledVector(F.V, -F.h / 2).addScaledVector(F.N, lift);
    // PlaneGeometry's +x is the image's right (U), +y the image's up (V), +z its face (N); the canvas top-left sits at O
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(F.U, F.V, F.N)); mesh.position.copy(C);
    mesh.renderOrder = o.order || 2; mesh.name = 'esc-light'; mesh.raycast = () => {}; mesh.visible = false; H.grp(o.group || 'main').add(mesh);
    const toUV = v => { const d = v.clone().sub(F.O); return [d.dot(F.U) * ppf, -d.dot(F.V) * ppf]; };
    const api = {mesh, F, cv, s: 0, o,
      // a point carried along the sun onto the plane
      proj(v, d){ const den = d.dot(F.N); if(Math.abs(den) < 1e-5) return v.clone(); const t = v.clone().sub(F.O).dot(F.N) / den; return v.clone().addScaledVector(d, -t); },
      update(){ const d = sunDir(S.hour); g.clearRect(0, 0, cv.width, cv.height); let any = false, best = 0;
        const low = 1 - Math.min(1, d.y / .5);
        for(const src of o.sources){ if(src.gate && !src.gate()){ src.s = 0; continue; }
          const quad = src.quad(); if(!quad) continue; const out = src.out(), into = d.dot(out);
          const s = src.s = clamp((d.y - .02) / .09, 0, 1) * clamp(into / .14, 0, 1) * (src.k ? src.k() : 1); if(s <= 0) continue; any = true; best = Math.max(best, s);
          const path = (ctx, pts) => { ctx.beginPath(); pts.forEach((p, i) => { const q = toUV(api.proj(p, d)); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); };
          const col = paint ? (src.color || 'rgba(255,246,224,1)') : `rgb(255,${Math.round(238 - 46 * low)},${Math.round(206 - 86 * low)})`;
          tg.clearRect(0, 0, cv.width, cv.height); tg.globalCompositeOperation = 'source-over'; tg.globalAlpha = 1;
          if(o.shade){ g.save(); g.globalAlpha = s; g.fillStyle = o.shade; path(g, quad); g.fill(); g.restore(); }
          tg.fillStyle = tg.shadowColor = col; tg.shadowBlur = o.blur != null ? o.blur : 3; path(tg, quad); tg.fill();
          if(src.film){ // rainbow film: the colour sweeps across the pane, a different hue every hand's width
            const a = toUV(api.proj(quad[0], d)), b = toUV(api.proj(quad[1], d)), gr = tg.createLinearGradient(a[0], a[1], b[0], b[1]);
            for(let i = 0; i <= 12; i++) gr.addColorStop(i / 12, `hsl(${(i * 47 + 8) % 360},100%,56%)`);
            tg.globalCompositeOperation = 'source-atop'; tg.shadowBlur = 0; tg.fillStyle = gr; tg.globalAlpha = 1; path(tg, quad); tg.fill(); tg.globalAlpha = 1; }
          tg.globalCompositeOperation = 'destination-out'; tg.shadowColor = tg.fillStyle = '#000'; tg.shadowBlur = 2;
          for(const b of (src.bars ? src.bars() : [])){ path(tg, b); tg.fill(); }
          for(const st of (src.strips ? src.strips() : [])){ tg.globalAlpha = st.card ? 1 : .1; tg.shadowBlur = st.card ? 2.5 : 0; path(tg, st.quad); tg.fill(); }
          tg.globalAlpha = 1; tg.shadowBlur = 0;
          if(src.decal){ tg.globalCompositeOperation = 'destination-out'; src.decal(tg, v => toUV(v)); }
          tg.globalCompositeOperation = 'source-over';
          g.save(); g.globalAlpha = s; g.drawImage(tmp, 0, 0); g.restore(); }
        if(any && o.base){ g.save(); g.globalCompositeOperation = 'destination-over'; g.globalAlpha = best; g.fillStyle = o.base; g.fillRect(0, 0, cv.width, cv.height); g.restore(); }   // a screen: shadow where the light isn't
        if(any && clip){ g.save(); g.globalCompositeOperation = 'destination-in'; g.beginPath(); clip.forEach((p, i) => { const q = toUV(new THREE.Vector3(p[0], F.O.y, p[1])); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); g.restore(); }
        if(any && o.holes) for(const hp of o.holes){ g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); hp.forEach((p, i) => { const q = toUV(new THREE.Vector3(p[0], F.O.y, p[1])); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); g.restore(); }
        api.s = best; mesh.visible = any; const gain = o.gain || 1.45; if(!paint) mat.color.setRGB(gain, gain * .94, gain * .8); tex.needsUpdate = true; if(o.after) o.after(api); }};
    // world point -> is it lit on this plane right now (used to wake a dog in a sunbeam)
    api.litAt = (x, z) => { const d = sunDir(S.hour); for(const src of o.sources){ if(src.gate && !src.gate()) continue; const q = src.quad(); if(!q || d.dot(src.out()) <= .02 || d.y <= .02) continue;
        const pts = q.map(p => { const r = api.proj(p, d); return [r.x, r.z]; }); if(inPoly(pts, x, z)) return true; } return false; };
    LIGHT.planes.push(api); return api; }
  // the glass of a window or door as a light source; top/bot can follow a shade
  function windowSource(id, opt){ opt = opt || {}; const op = opening(id); if(!op) return null; const out = new THREE.Vector3(-op.n[0], 0, -op.n[1]);
    // which way is outside: the opening's normal can point either way, so test which side the room is on
    const room = opt.room && spacePoly(opt.room); if(room){ const c = op.c, n = op.n; if(inPoly(room, c[0] - n[0] * 1.5, c[1] - n[1] * 1.5)) out.set(n[0], 0, n[1]); }
    const half = op.o.width / 2 - (opt.inset == null ? .2 : opt.inset);
    const top = () => (opt.shade ? Math.min(opt.top || op.o.head, shadeHem(opt.shade, op)) : (opt.top || op.o.head)), bot = () => opt.bot == null ? op.o.sill : opt.bot;
    return {op, out: () => out, quad: () => { const t = top(), b = bot(); if(t - b < .05) return null; return [op.P(-half, b), op.P(half, b), op.P(half, t), op.P(-half, t)]; },
      bars: () => (opt.bars || []).map(b => [op.P(b[0], b[2]), op.P(b[1], b[2]), op.P(b[1], b[3]), op.P(b[0], b[3])]), strips: opt.strips ? () => opt.strips : null, film: !!opt.film, gate: opt.gate, decal: opt.decal}; }

  /* ================================================================== paper strips: three boxy figures in card and tracing paper
     makeStrips(code, frame, plane, hour): the figures are laid out on a target surface (frame: origin, right, up, size, pitch) and each strip is
     that surface rectangle carried back along the sun at `hour` to the plane of the glass (or of a cut-out hanging outside). At that hour,
     and only near it, the card strips' shadows spell the code. */
  const SEG = {0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd'};
  function segRects(){ const h = 1.7, t = .2, g = .045, m = h / 2; return {
      a: [t + g, h - t, 1 - t - g, h], g: [t + g, m - t / 2, 1 - t - g, m + t / 2], d: [t + g, 0, 1 - t - g, t],
      f: [0, m + g, t, h], b: [1 - t, m + g, 1, h], e: [0, 0, t, m - g], c: [1 - t, 0, 1, m - g]}; }
  function makeStrips(code, frame, plane, hour, doy){ const d = sunDir(hour, doy), R = segRects(), out = [];
    const O = new THREE.Vector3(...frame.o), Rt = new THREE.Vector3(...frame.right).normalize(), Up = new THREE.Vector3(...frame.up).normalize();
    const P0 = new THREE.Vector3(...plane.p), N = new THREE.Vector3(...plane.n).normalize(), dn = d.dot(N);
    [...code].forEach((ch, k) => { if(ch === ' ') return; for(const s of 'abcdefg'){ const r = R[s], card = SEG[ch].includes(s);
      const quad = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map(([u, v]) => { const f = O.clone().addScaledVector(Rt, (u + k * frame.pitch) * frame.size).addScaledVector(Up, v * frame.size);
        const t = P0.clone().sub(f).dot(N) / dn; return f.addScaledVector(d, t); });
      out.push({quad, card, digit: k, seg: s}); } }); return out; }
  const PAPERM = {};
  function paperMats(){ if(PAPERM.card) return PAPERM;
    PAPERM.card = new THREE.MeshStandardMaterial({color: lin(0xf4f0e6), roughness: .95, metalness: 0, side: THREE.DoubleSide, emissive: lin(0xf4f0e6), emissiveIntensity: .1});
    PAPERM.vellum = new THREE.MeshStandardMaterial({color: lin(0xf6f3ea), roughness: .9, metalness: 0, side: THREE.DoubleSide, emissive: lin(0xf6f3ea), emissiveIntensity: .1, transparent: true, opacity: .93});
    return PAPERM; }
  function buildPaper(strips, inward, group){ const g = new THREE.Group(); g.name = 'esc-paper'; const M = paperMats(); const box = new THREE.Box3();
    for(const s of strips){ const geo = new THREE.BufferGeometry(), q = s.quad, a = [];
      for(const i of [0, 1, 2, 0, 2, 3]) a.push(q[i].x + inward[0], q[i].y + (inward[1] || 0), q[i].z + inward[2]);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, s.card ? M.card : M.vellum); m.raycast = () => {}; m.renderOrder = 4; g.add(m); q.forEach(v => box.expandByPoint(v)); }
    H.grp(group || 'main').add(g); g.userData.box = box; return g; }
  // with the sun behind them, card goes dark against the light and tracing paper glows: the same truth the floor shows
  function paperLight(s){ if(!PAPERM.card) return; const k = clamp(s, 0, 1); PAPERM.card.color.copy(lin(0xf4f0e6)).multiplyScalar(1 - .5 * k); PAPERM.card.emissiveIntensity = .1 * (1 - k); PAPERM.vellum.emissiveIntensity = .1 + .5 * k; }

  /* ================================================================== props: drawings, notes and cards as flat planes in the house */
  function texOf(cv){ const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; }
  // a flat sheet: centre, the direction it faces, its size in feet; unlit so a drawing keeps its colours whatever the hour
  function prop(cv, at, face, w, h, opt){ opt = opt || {}; const tex = texOf(cv);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({map: tex, transparent: true, toneMapped: false, side: opt.both ? THREE.DoubleSide : THREE.FrontSide}));
    m.position.set(at[0], at[1], at[2]); const f = new THREE.Vector3(...face).normalize();
    if(Math.abs(f.y) > .9){ m.rotation.x = f.y > 0 ? -Math.PI / 2 : Math.PI / 2; if(opt.spin) m.rotation.z = opt.spin; } else m.rotation.y = Math.atan2(f.x, f.z);
    m.material.color.setScalar(opt.tone || .86); m.renderOrder = 3; m.raycast = () => {}; m.name = 'esc-prop'; H.grp(opt.group || 'main').add(m); m.userData.redraw = fn => { fn(cv); tex.needsUpdate = true; wake(4); }; return m; }
  // a sheet of paper on a canvas: kraft, white or tracing; draw(x, w, h) inks it
  function paperCanvas(w, h, kind, draw, seed){ const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    let s = seed || 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const bg = kind === 'kraft' ? ['#d8bb8c', '#c9a873'] : kind === 'tracing' ? ['rgba(250,248,240,.86)', 'rgba(244,242,232,.86)'] : kind === 'card' ? ['#fbf6ea', '#f1e9d6'] : ['#fdfcf8', '#f4f1ea'];
    const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]); x.fillStyle = gr; x.fillRect(10, 10, w - 20, h - 20);
    for(let i = 0; i < (kind === 'kraft' ? 2200 : 500); i++){ x.fillStyle = `rgba(88,58,22,${rnd() * (kind === 'kraft' ? .05 : .025)})`; x.fillRect(10 + rnd() * (w - 20), 10 + rnd() * (h - 20), 1 + rnd() * 4, 1); }
    x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 2; x.strokeRect(11, 11, w - 22, h - 22);
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = x.fillStyle = '#1c2030';
    const ink = {rnd, line(pts, lw, col){ x.strokeStyle = col || '#1c2030'; x.lineWidth = lw; x.beginPath(); pts.forEach((p, i) => { const j = (rnd() - .5) * lw * .25; i ? x.lineTo(p[0] + j, p[1] + j) : x.moveTo(p[0], p[1]); }); x.stroke(); },
      text(t, px, py, size, col, align){ x.font = `600 ${size}px Caveat, "Segoe Print", "Bradley Hand", cursive`; x.textAlign = align || 'center'; x.textBaseline = 'middle'; x.fillStyle = col || '#1c2030'; x.fillText(t, px, py); },
      paw(px, py, sc, rot, col){ x.save(); x.translate(px, py); x.rotate(rot || -.2); x.scale(sc, sc); x.fillStyle = col || '#1c2030'; x.beginPath(); x.ellipse(0, 18, 31, 26, 0, 0, Math.PI * 2); x.fill();
        for(const [dx, dy, a] of [[-38, -17, -.5], [-14, -40, -.15], [14, -40, .15], [38, -17, .5]]){ x.beginPath(); x.ellipse(dx, dy, 11.5, 16, a, 0, Math.PI * 2); x.fill(); } x.restore(); },
      tape(cx, cy, a){ x.save(); x.translate(cx, cy); x.rotate(a); x.fillStyle = 'rgba(243,232,200,.9)'; x.fillRect(-70, -20, 140, 40); x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(-70, -20, 140, 7); x.restore(); }};
    if(draw) draw(x, w, h, ink); return c; }
  // the handwriting font may arrive after the first draw: redraw every prop that asked
  const REDRAW = []; function onFont(fn){ REDRAW.push(fn); }
  try{ document.fonts.load('600 60px Caveat').then(() => { for(const f of REDRAW) try{ f(); }catch(e){} wake(4); }); }catch(e){}

  /* ================================================================== animals (Medium and Hard): figures from pets.js, standing in the house */
  const PETS = {};
  function petAt(who, p, yaw, opt){ opt = opt || {}; let g = PETS[who]; if(!g){ if(!window.ESC_PETS) return null; g = PETS[who] = ESC_PETS.build(who); H.grp(opt.group || 'main').add(g); }
    if(p){ g.position.set(p[0], p[1], p[2]); g.visible = true; } if(yaw != null) g.rotation.y = yaw; if(opt.scale) g.scale.setScalar(opt.scale); wake(6); return g; }
  // turn a figure (which faces +x) toward a point
  const yawTo = (from, to) => Math.atan2(-(to[2] - from[2]), to[0] - from[0]);
  // a slow move across the floor (Mabel plods, Biscuit gets up)
  function petWalk(who, to, ms, then){ const g = PETS[who]; if(!g) return; const a = g.position.clone(), b = new THREE.Vector3(...to), t0 = performance.now(); g.rotation.y = yawTo(a.toArray(), to);
    (function f(){ const u = clamp((performance.now() - t0) / (reduce ? 10 : ms), 0, 1); g.position.lerpVectors(a, b, ease(u)); g.position.y = lerp(a.y, b.y, u) + Math.abs(Math.sin(u * Math.PI * 6)) * .04; wake(3); if(u < 1) requestAnimationFrame(f); else if(then) then(); })(); }

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
     pentatonic so the cues are in tune with each other, filtered noise for doors, shades and the fizz, a short feedback delay for a
     little room, and a compressor before a quiet master. Nothing plays before the first tap; the context sleeps with the tab.
     r39 adds a few voices for the animals (a thump, a soft woof, a chirp, a squeak), all short and quiet. */
  const SND = (() => {
    const N = {D3: 146.83, A3: 220, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, B4: 493.88, D5: 587.33, E5: 659.26, Fs5: 739.99, A5: 880, B5: 987.77, D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760, B6: 1975.53};
    const MASTER = .5, K = reduce ? .6 : 1;
    let ac = null, C = null, muted = store.get('esc.mute') === true;
    function chain(a){ const bus = a.createGain(), send = a.createGain(), dl = a.createDelay(1), fb = a.createGain(), lp = a.createBiquadFilter(), comp = a.createDynamicsCompressor(), master = a.createGain();
      send.gain.value = .22; dl.delayTime.value = .19; fb.gain.value = .3; lp.type = 'lowpass'; lp.frequency.value = 2400;
      bus.connect(comp); bus.connect(send); send.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(comp);
      comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .22;
      master.gain.value = MASTER; comp.connect(master); master.connect(a.destination);
      let nb = null; const noiseBuf = () => { if(!nb){ nb = a.createBuffer(1, Math.floor(a.sampleRate * 2.5), a.sampleRate); const d = nb.getChannelData(0); let s = 20241; for(let i = 0; i < d.length; i++){ s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; } } return nb; };
      return {a, bus, master, noiseBuf}; }
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
      found:  (c, t) => { [N.D5, N.Fs5, N.A5, N.D6].forEach((f, i) => mallet(c, f, t + i * .07, .9 - i * .1, .13)); },
      steps:  (c, t, n) => { for(let i = 0; i < (n || 3); i++){ noise(c, t + .1 + i * .44, .012, .1, .5, 'lowpass', 170, 110); } },
      slide:  (c, t) => { noise(c, t, .09, .62, .2, 'bandpass', 320, 880, 1.1); noise(c, t, .12, .55, .07, 'highpass', 2400); thud(c, t + .7, 96, 58, .3); },
      shade:  (c, t) => { noise(c, t, .06, .55, .12, 'bandpass', 900, 1600, 1.4); noise(c, t + .02, .05, .5, .05, 'highpass', 4200); },
      paper:  (c, t) => { noise(c, t, .01, .1, .13, 'highpass', 2600); noise(c, t + .12, .012, .14, .11, 'bandpass', 3600, 2200, .8); },
      key:    (c, t, i) => mallet(c, [N.D5, N.Fs5, N.A5, N.B5][clamp((i || 1) - 1, 0, 3)], t, .32, .17),
      wrong:  (c, t) => { thud(c, t, 132, 84, .42); thud(c, t + .19, 110, 70, .36); },
      right:  (c, t) => { [N.D4, N.A4, N.D5, N.Fs5, N.B5].forEach((f, i) => mallet(c, f, t + i * .055, 1.9 - i * .15, .15 - i * .012)); part(c, N.D3, t, .03, 1.6, .1, 'triangle'); },
      reveal: (c, t) => { [N.A5, N.D6, N.Fs6, N.E6, N.B5, N.D6, N.A6, N.Fs6, N.D6].forEach((f, i) => { const at = t + i * .2; part(c, f, at, .09, 1.5, .055); part(c, f * 2, at, .06, .7, .016); part(c, f * 1.003, at + .02, .12, 1.3, .03); }); part(c, N.D4, t, .5, 2.4, .05, 'triangle'); part(c, N.A4, t + .3, .5, 2.2, .04); },
      fridge: (c, t) => { thud(c, t, 150, 76, .3); noise(c, t + .03, .05, .5, .06, 'bandpass', 700, 300, .6); },
      cork:   (c, t) => { const o = part(c, 520, t, .003, .11, .5); o.frequency.exponentialRampToValueAtTime(110, t + .07); noise(c, t, .002, .06, .4, 'bandpass', 1500, 600, 1.3);
                noise(c, t + .06, .08, 1.5, .1, 'highpass', 5200); noise(c, t + .1, .2, 1.1, .05, 'bandpass', 7200, 4200, 2); mallet(c, N.D5, t + .5, 1.2, .08); mallet(c, N.A5, t + .62, 1.4, .08); mallet(c, N.Fs6, t + .74, 1.6, .06); },
      bell:   (c, t) => { bell(c, N.Fs5, t, 2.6, .2); bell(c, N.D5, t + .68, 3.2, .2); },
      jingle: (c, t) => { ting(c, N.B6, t, .075); ting(c, N.A6 * 1.01, t + .075, .06); ting(c, N.B6 * .995, t + .17, .07); },
      thump:  (c, t) => thud(c, t, 90, 48, .5),
      woof:   (c, t) => { const o = part(c, 240, t, .01, .16, .2, 'triangle'); o.frequency.exponentialRampToValueAtTime(150, t + .14); noise(c, t, .01, .12, .12, 'bandpass', 600, 380, 1.5); },
      chirp:  (c, t) => { for(let i = 0; i < 3; i++){ const o = part(c, 1800 + i * 220, t + i * .09, .004, .07, .06); o.frequency.exponentialRampToValueAtTime(2600 + i * 200, t + i * .09 + .05); } },
      squeak: (c, t) => { const o = part(c, 2400, t, .004, .09, .05); o.frequency.exponentialRampToValueAtTime(3100, t + .07); },
      party:  (c, t) => { [N.D5, N.Fs5, N.A5, N.D6, N.A5, N.D6, N.Fs6].forEach((f, i) => mallet(c, f, t + i * .11, 1.1, .12)); noise(c, t + .02, .002, .05, .3, 'bandpass', 1400, 500, 1.2); }};
    const live = () => { if(muted) return null; try{ if(!ac){ const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null; ac = new AC(); C = chain(ac); }
        if(ac.state === 'suspended' && !document.hidden) ac.resume(); return C; }catch(e){ return null; } };
    document.addEventListener('visibilitychange', () => { try{ if(!ac) return; if(document.hidden) ac.suspend(); else if(!muted) ac.resume(); }catch(e){} });
    const play = (name, arg) => { const c = live(); if(!c || document.hidden) return; try{ CUES[name](c, c.a.currentTime + .03, arg); }catch(e){} };
    const api = {get muted(){ return muted; }, cues: Object.keys(CUES),
      setMuted(v){ muted = !!v; store.set('esc.mute', muted); try{ if(ac){ C.master.gain.setTargetAtTime(muted ? 0 : MASTER, ac.currentTime, .03); if(!muted && !document.hidden) ac.resume(); } }catch(e){} },
      unlock(){ live(); }, state(){ return ac ? ac.state : 'not started'; },
      async measure(){ const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, out = {}; if(!OAC) return out;
        for(const name of Object.keys(CUES)){ const sr = 44100, o = new OAC(1, sr * 7, sr), c = chain(o); CUES[name](c, .05, name === 'key' ? 3 : name === 'steps' ? 4 : undefined);
          const d = (await o.startRendering()).getChannelData(0); let peak = 0, sq = 0, clip = 0, last = 0;
          for(let i = 0; i < d.length; i++){ const v = d[i], a = Math.abs(v); if(a > peak) peak = a; sq += v * v; if(a >= .999) clip++; if(a > .001) last = i; }
          out[name] = {peak: +peak.toFixed(3), peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rmsDb: +(10 * Math.log10(sq / Math.max(1, last) || 1e-12)).toFixed(1), seconds: +((last / sr) - .05).toFixed(2), clipped: clip}; }
        return out; }};
    for(const k of Object.keys(CUES)) api[k] = arg => play(k, arg);
    return api; })();

  /* ================================================================== UI */
  const css = `
  #escRoot{--ink:#1f2a3a;--mut:#5c6575;--navy:#1f2948;--paper:#fbfaf7;--gold:#c98a12;--wine:#9b2c3c;position:fixed;inset:0;z-index:60;pointer-events:none;font-family:Jost,"Avenir Next","Helvetica Neue",Arial,sans-serif;color:var(--ink);-webkit-tap-highlight-color:transparent}
  #escRoot button{font:inherit;cursor:pointer}
  #escRoot .escChip{pointer-events:auto;color:var(--ink);background:rgba(251,250,247,.95);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:16px;box-shadow:0 8px 30px rgba(15,20,35,.2)}
  #escTop{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) 0 max(14px,env(safe-area-inset-left))}
  #escGoal{padding:11px 16px 12px;max-width:400px;min-width:0;border-left:4px solid var(--gold);transition:transform .35s cubic-bezier(.2,.8,.2,1)}
  #escGoal .k{display:flex;gap:8px;align-items:baseline;font-size:12.5px;color:var(--mut);letter-spacing:.02em;flex-wrap:wrap}
  #escGoal .k b{font-weight:500;color:var(--ink)} #escTime{font-variant-numeric:tabular-nums} #escProg{margin-left:auto;color:var(--ink);font-weight:500}
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
  .escIco{width:52px;height:52px;border:0;display:grid;place-items:center;padding:0;position:relative}.escIco svg{width:22px;height:22px}
  #escBookBtn{display:none!important}#escBookBtn.on{display:grid!important}#escBookBtn i{position:absolute;right:3px;top:3px;min-width:19px;height:19px;border-radius:10px;background:var(--wine);color:#fff;font:500 11.5px/19px Jost,sans-serif;font-style:normal;text-align:center;padding:0 4px}
  #escBookBtn.pop{animation:escPop .7s ease}@keyframes escPop{30%{transform:scale(1.18)}}
  #escMenu{position:absolute;right:max(14px,env(safe-area-inset-right));top:calc(max(14px,env(safe-area-inset-top)) + 60px);padding:8px;display:none;flex-direction:column;min-width:210px;z-index:5}
  #escMenu.on{display:flex}#escMenu button,#escMenu a{border:0;background:none;text-align:left;padding:11px 12px;border-radius:10px;font-size:15px;color:var(--ink);text-decoration:none}
  #escMenu button:hover,#escMenu a:hover{background:#eceae4}
  #escSay{max-width:min(340px,calc(100vw - 28px));background:#fff;border-radius:16px 4px 16px 16px;padding:11px 15px;font:600 21px/1.2 Caveat,"Segoe Print","Bradley Hand",cursive;color:#2b2336;box-shadow:0 10px 30px rgba(15,20,35,.22);opacity:0;transform:translateY(-6px);transition:.3s;pointer-events:none}
  #escSay.on{opacity:1;transform:none}#escSay small{display:flex;align-items:center;gap:6px;font:500 11.5px Jost,sans-serif;color:var(--mut);letter-spacing:.03em;margin-bottom:1px}#escSay small svg{width:18px;height:18px}
  #escL,#escR{display:flex;flex-direction:column;gap:8px;min-width:0}#escL{align-items:flex-start}#escR{align-items:flex-end;flex:none}
  #escPlace{max-width:380px;background:rgba(22,28,48,.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;border-radius:16px;padding:10px 16px 12px;opacity:0;transform:translateY(-8px);transition:opacity .5s,transform .5s;pointer-events:none}
  #escPlace.on{opacity:1;transform:none}#escPlace b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:25px;line-height:1.1}#escPlace span{display:block;font-size:14px;line-height:1.35;color:#dfe3ee;margin-top:3px}
  #escDock{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:flex-end;gap:12px;padding:0 max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}
  #escMapWrap{flex:0 0 268px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
  #escMap{padding:10px;position:relative;width:268px}
  #escMap h4{margin:0 0 6px;font-size:12.5px;font-weight:500;color:var(--mut);letter-spacing:.02em;display:flex;justify-content:space-between;align-items:center;gap:6px}
  #escMap h4 b{color:var(--ink);font-weight:500}
  #escFloors{display:flex;gap:4px}#escFloors button{border:1px solid #d6d1c4;background:#fff;border-radius:999px;font-size:12px;padding:3px 9px;color:var(--ink)}#escFloors button[aria-pressed=true]{background:var(--navy);border-color:var(--navy);color:#fff}
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
  #escSlider::-webkit-slider-runnable-track{height:10px;border-radius:999px;background:var(--sky);box-shadow:inset 0 1px 2px rgba(0,0,0,.18)}
  #escSlider::-moz-range-track{height:10px;border-radius:999px;background:var(--sky)}
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
  #escSheet{position:absolute;right:max(16px,env(safe-area-inset-right));top:50%;width:min(380px,calc(100% - 28px));max-height:calc(100% - 200px);overflow:auto;background:var(--paper);border-radius:20px;box-shadow:0 20px 60px rgba(10,14,28,.38);padding:20px 20px 18px;transform:translate(24px,-50%);opacity:0;visibility:hidden;transition:opacity .3s,transform .3s,visibility 0s linear .3s;pointer-events:none}
  #escSheet.on{transform:translate(0,-50%);opacity:1;visibility:visible;pointer-events:auto;transition:opacity .3s,transform .3s}
  #escSheet h3{font-family:"Cormorant Garamond",Georgia,serif;font-size:28px;font-weight:600;margin:0 0 6px;line-height:1.05}
  #escSheet p{margin:0 0 10px;font-size:16px;line-height:1.45;color:#2b3442}
  #escSheet .row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  #escSheet .line{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid #e6e1d6;border-radius:4px 16px 16px 16px;padding:9px 13px;margin:0 0 10px;font:600 22px/1.2 Caveat,"Segoe Print","Bradley Hand",cursive;color:#2b2336}
  #escSheet .line svg{width:30px;height:30px;flex:none;margin-top:1px}#escSheet .line.big{font-size:28px;letter-spacing:.02em}
  #escSheet .got{display:flex;align-items:center;gap:10px;background:#f2efe6;border-radius:14px;padding:9px 12px;margin:2px 0 10px;font-size:15px}#escSheet .got b{font-size:30px;font-weight:500;line-height:1;min-width:26px;text-align:center}
  #escSheet .thumps{display:flex;flex-wrap:wrap;gap:6px 10px;margin:4px 0 10px}#escSheet .thumps span{font:600 28px Caveat,cursive;color:#3f5f6c;opacity:0;transform:scale(.6);animation:escThump .35s ease forwards}
  @keyframes escThump{to{opacity:1;transform:none}}
  .escBtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid #cfcabe;background:#fff;color:var(--ink);border-radius:999px;padding:0 20px;min-height:46px;font:inherit;font-size:15.5px;cursor:pointer;text-decoration:none;pointer-events:auto}
  .escBtn:hover{border-color:#1f2948}.escBtn svg{width:18px;height:18px}.escBtn[disabled]{opacity:.55;cursor:default}
  .escBtn.primary{background:var(--wine,#9b2c3c);border-color:var(--wine,#9b2c3c);color:#fff}.escBtn.primary:hover{background:#842432}
  .escBtn.dark{background:#1f2948;border-color:#1f2948;color:#fff}.escBtn.dark:hover{background:#151c33}
  .escBtn.light{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.4);color:#fff}.escBtn.light:hover{background:rgba(255,255,255,.2);border-color:#fff}
  #escBack{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));display:none;box-shadow:0 8px 30px rgba(15,20,35,.25);min-height:52px;font-size:16px}
  .escDisp{display:flex;justify-content:center;gap:10px;margin:8px 0 4px;align-items:center}
  .escDisp i{width:50px;height:60px;border-radius:10px;background:#141a30;color:#ffd77a;font:500 34px/60px Jost,sans-serif;font-style:normal;text-align:center;box-shadow:inset 0 2px 8px rgba(0,0,0,.5)}
  .escDisp.bad{animation:escShake .4s}.escDisp.bad i{color:#ff8b7c}.escDisp.ok i{color:#7cf0a6}
  .escArc{position:relative;width:100%;max-width:330px;margin:2px auto 0;aspect-ratio:2.4/1}.escArc svg{position:absolute;inset:0;width:100%;height:100%;color:#1f2a3a}.escArc .escDisp{position:absolute;inset:0;margin:0;display:block}
  .escArc .escDisp i{position:absolute;transform:translate(-50%,-50%);width:44px;height:52px;line-height:52px;font-size:29px}
  .escPause{text-align:center;font-size:14.5px;color:var(--wine);min-height:20px;margin:2px 0 0}
  @keyframes escShake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
  .escPad{display:grid;grid-template-columns:repeat(3,72px);gap:8px;justify-content:center;margin:10px 0 2px}
  .escPad button{height:54px;border-radius:14px;border:1px solid #d6d2c8;background:#fff;font:500 22px Jost,sans-serif;color:var(--ink)}
  .escPad button:active{background:#eceae4;transform:scale(.97)}.escPad .z{grid-column:2}.escPad .c{grid-column:3;grid-row:4;font-size:18px}.escPad[aria-disabled=true] button{opacity:.45}.escDelW{display:none;justify-content:center;margin:4px 0 0}
  #escToast{position:absolute;left:50%;top:15%;transform:translate(-50%,-10px);background:rgba(22,28,48,.9);color:#fff;font:500 15.5px Jost,sans-serif;padding:10px 18px;border-radius:999px;opacity:0;transition:.3s;pointer-events:none;max-width:calc(100% - 40px);text-align:center}
  #escToast.on{opacity:1;transform:translate(-50%,0)}
  #escFade{position:fixed;inset:0;z-index:58;background:#0d111f;opacity:0;pointer-events:none;transition:opacity .32s ease}
  #escFade.on{opacity:1;pointer-events:auto}
  #escBook{position:fixed;inset:0;z-index:70;background:rgba(14,19,34,.6);display:none;place-items:center;padding:14px;pointer-events:auto;font-family:Jost,"Avenir Next",Arial,sans-serif;color:#1f2a3a}
  #escBook.on{display:grid}
  #escBook .bk{background:#fbfaf7;border-radius:22px;max-width:760px;width:100%;max-height:calc(100% - 8px);overflow:auto;padding:18px 18px 16px;box-shadow:0 30px 90px rgba(0,0,0,.45);position:relative;box-sizing:border-box}
  #escBook h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:32px;font-weight:600;margin:0 0 2px;line-height:1.05;padding-right:44px}
  #escBook .sub{font-size:14px;color:#5c6575;margin:0 0 12px}
  #escBook .x{position:absolute;right:8px;top:8px;width:46px;height:46px;border:0;background:none;font-size:28px;color:#5c6575;cursor:pointer}
  #escBook .nums{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
  #escBook .num{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e3dfd5;border-radius:14px;padding:6px 12px 6px 8px;font-size:13.5px;color:#5c6575;line-height:1.25}
  #escBook .num b{font-size:28px;font-weight:500;color:#1f2a3a;line-height:1}#escBook .num svg{width:28px;height:28px;flex:none}
  #escBook .clues{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  #escBook .clue{border:1px solid #e3dfd5;background:#fff;border-radius:14px;padding:8px;text-align:left;cursor:pointer;font:inherit;color:inherit}
  #escBook .clue:hover{border-color:#1f2948}#escBook .clue img{display:block;width:100%;height:120px;object-fit:contain;background:#ebe7dd;border-radius:8px}
  #escBook .clue span{display:block;font-size:13.5px;line-height:1.3;margin-top:6px}
  #escBook .big img{display:block;max-width:100%;max-height:60vh;margin:0 auto;border-radius:10px;background:#ebe7dd}
  #escBook .big p{font-size:15.5px;line-height:1.45;margin:10px 0 0}
  #escBook .acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  #escBook .stackv{position:relative;max-width:560px;margin:0 auto;background:#ebe7dd;border-radius:10px}#escBook .stackv img{position:absolute;left:0;top:0;width:100%;height:auto;background:none}#escBook .stackv img:first-child{position:relative}
  #escCard{position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(14,19,34,.5);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);font-family:Jost,"Avenir Next",Arial,sans-serif;padding:16px;overflow:auto;animation:escIn .45s ease}
  @keyframes escIn{from{opacity:0}to{opacity:1}}
  #escCard .c{background:#fbfaf7;color:#1f2a3a;border-radius:24px;max-width:580px;width:100%;padding:24px 24px 20px;box-shadow:0 30px 90px rgba(0,0,0,.45);animation:escUp .5s cubic-bezier(.2,.8,.2,1);box-sizing:border-box}
  @keyframes escUp{from{transform:translateY(18px)}to{transform:none}}
  #escCard h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:clamp(34px,6vw,48px);font-weight:600;line-height:1;margin:0 0 10px}
  #escCard .k{font-size:13px;color:#5c6575;margin:0 0 6px;letter-spacing:.03em}
  #escCard .lede{font-family:"Cormorant Garamond",Georgia,serif;font-size:21px;line-height:1.32;margin:0 0 14px;color:#2b3442}
  #escCard .note{background:#fff;border:1px solid #e3e0d8;border-radius:4px;padding:15px 18px 12px;transform:rotate(-.7deg);box-shadow:0 6px 18px rgba(0,0,0,.09);font:600 23px/1.22 Caveat,"Segoe Print","Bradley Hand",cursive;color:#2b2336;margin:0 0 16px}
  #escCard .note p{margin:0 0 7px}#escCard .note .sig{text-align:right;line-height:1}#escCard .note .paw{width:38px;height:38px;transform:rotate(-14deg);color:#2b2336;margin:-2px 6px -4px 0}#escCard .note .ps{font-size:20px;color:#5a4d63;margin:0}
  #escCard .note svg.arc{display:block;width:100%;max-width:320px;height:auto;margin:4px auto 2px;color:#2b2336}
  #escCard .how{list-style:none;margin:0 0 16px;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  #escCard .how li{background:#f1eee6;border-radius:14px;padding:10px 8px 9px;text-align:center;font-size:13.5px;line-height:1.25;color:#2b3442}
  #escCard .how svg{width:30px;height:30px;display:block;margin:0 auto 5px;color:#1f2948}
  #escCard .lv{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 14px}
  #escCard .lv button{border:1.5px solid #ddd8cc;background:#fff;border-radius:16px;padding:10px 10px 9px;text-align:left;font:inherit;color:#1f2a3a;cursor:pointer;display:flex;flex-direction:column;gap:3px}
  #escCard .lv button:hover{border-color:#1f2948}#escCard .lv button[aria-checked=true]{border-color:#9b2c3c;box-shadow:0 0 0 1.5px #9b2c3c inset;background:#fffaf6}
  #escCard .lv b{font-size:12.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#9b2c3c}#escCard .lv .t{font-family:"Cormorant Garamond",Georgia,serif;font-size:19px;font-weight:600;line-height:1.05}
  #escCard .lv small{font-size:12.5px;color:#5c6575;line-height:1.3}#escCard .lv .best{color:#2c7a3a}
  #escCard .foot{font-size:13px;color:#5c6575;line-height:1.45;margin:14px 0 0}
  #escCard .acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  #escCard .stats{display:flex;gap:26px;margin:4px 0 16px}#escCard .stats b{display:block;font-size:28px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.1}#escCard .stats span{font-size:13px;color:#5c6575}
  #escCard .cta{background:#1f2948;color:#f4f1e8;border-radius:18px;padding:18px 18px 16px;margin:0 0 14px}
  #escCard .cta b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:26px;font-weight:600;line-height:1.1;margin-bottom:6px}#escCard .cta span{display:block;font-size:15px;line-height:1.45;color:#d5dae8;margin-bottom:14px}
  #escCard .more{display:flex;flex-wrap:wrap;gap:8px}
  #escCard.side{background:none;backdrop-filter:none;-webkit-backdrop-filter:none;place-items:center end;pointer-events:none;padding-right:max(18px,env(safe-area-inset-right))}
  #escCard.side .c{position:relative;pointer-events:auto;max-width:450px;max-height:calc(100% - 8px);overflow-x:hidden;overflow-y:auto}#escCard.side h2{font-size:clamp(32px,4vw,42px)}
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
    #escMap{display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(360px,calc(100% - 24px));padding:14px;z-index:6;box-shadow:0 20px 70px rgba(10,14,28,.5);box-sizing:border-box}
    #escMap.on{display:block}#escMap .plan{width:100%;height:0;padding-bottom:71%}#escMap .pl{font-size:13.5px;padding:7px 11px}#escMapX{display:grid;position:absolute;right:6px;top:4px;width:44px;height:44px;border:0;background:none;place-items:center;font-size:24px;color:var(--mut)}
    #escMap h4{padding-right:40px;flex-wrap:wrap}#escFloors button{font-size:13.5px;padding:6px 11px}
    #escSun{order:1;max-width:none;margin:0;padding:8px 14px 10px}
    #escCoach{top:236px;font-size:14.5px}
    #escSheet{left:10px;right:10px;top:auto;bottom:max(10px,env(safe-area-inset-bottom));width:auto;max-width:560px;margin:0 auto;max-height:62vh;transform:translateY(20px);padding:16px 16px 14px}
    #escSheet.on{transform:none}#escSheet h3{font-size:24px}#escSheet p{font-size:15.5px}#escSheet .line{font-size:21px}
    html.esc-ex #escDock{visibility:hidden}html.esc-ex.esc-exsun #escSun{visibility:visible;position:fixed;left:10px;right:10px;bottom:calc(var(--sheet-h,180px) + 18px)}
    html.esc-ex #escBack{display:none}
    .escPad{grid-template-columns:repeat(5,1fr);gap:7px}.escPad button{height:50px}.escPad .z{grid-column:auto}.escPad .c{display:none}.escDisp .c2{display:grid!important}.escDelW{display:flex}#escToast{top:40%}
    #escCard .c{padding:20px 18px 18px}#escCard .note{font-size:21px}#escCard .lede{font-size:19px}
    #escCard .lv{gap:6px}#escCard .lv button{padding:8px 9px 8px}#escCard .lv .t{font-size:17px}#escCard .lv small{font-size:12px}
    #escCard.side{place-items:end center;padding:8px}#escCard.side .c{box-sizing:border-box;max-width:560px;max-height:calc(100% - 180px);padding:16px 16px 14px}#escCard.side h2{font-size:32px}#escCard.side .lede{font-size:18px;margin-bottom:10px}#escCard.side .stats{margin-bottom:10px}
    #escBook{padding:6px}#escBook .bk{padding:14px 12px 12px}#escBook .clues{grid-template-columns:repeat(2,1fr)}
  }
  @media (max-width:520px){#escCard .lv{grid-template-columns:1fr}#escCard .lv button{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;align-items:baseline}#escCard .lv small{grid-column:1 / -1}}
  @media (prefers-reduced-motion:reduce){.escMk.on i,#escHint.nudge,#escCoach svg,.escBub,#escSheet .thumps span{animation:none!important;opacity:1;transform:none}}
  `;
  const ICO = {
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3l4.5-3.8v12.6L7 14.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3l4.5-3.8v12.6L7 14.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5h11.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11.5M9 8.5h6M9 11.5h4"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
    walk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/><path d="M6 19l6-6 6 6" opacity=".45"/></svg>',
    drag: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 17.5V8.2a1.9 1.9 0 0 1 3.8 0v6.3m0-1.6a1.9 1.9 0 0 1 3.8 0v2m0-.9a1.9 1.9 0 0 1 3.7 0v5.2c0 4.3-2.8 7.3-6.9 7.3-3.2 0-4.9-1.4-6.6-4.2l-3-5a1.9 1.9 0 0 1 3.2-2l2 2.5"/><path d="M4 7.5h5M4 7.5l2-2M4 7.5l2 2M28 7.5h-5M28 7.5l-2-2M28 7.5l-2 2"/></svg>',
    ring: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="16" r="10" stroke="#c98a12" stroke-width="3"/><circle cx="16" cy="16" r="2.6" fill="currentColor" stroke="none"/></svg>',
    disc: '<svg viewBox="0 0 32 32" fill="none" stroke="#1f2948" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="12" fill="#fff" stroke-width="1.6"/><path d="M10.5 17.5l5.5-5.5 5.5 5.5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6.5-5.6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/></svg>'};
  // the sun's arc over the hills with four paw prints on it (Hard: Snowball's first note), or four empty places (his strongbox)
  const ARC_T = [.1, .37, .63, .9];
  const arcPts = (w, h) => ARC_T.map(t => { const a = Math.PI * (1 - t); return [w / 2 + Math.cos(a) * w * .42, h * .9 - Math.sin(a) * h * .74]; });
  function arcSVG(w, h, slots){ const pts = arcPts(w, h);
    let s = `<svg class="arc" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="M${w * .03} ${h * .9}H${w * .97}" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".55"/>`;
    s += `<path d="M${w * .08} ${h * .9}A${w * .42} ${h * .74} 0 0 1 ${w * .92} ${h * .9}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="7 7" opacity=".7"/>`;
    s += `<circle cx="${w * .08}" cy="${h * .9}" r="10" fill="#f2b632"/><circle cx="${w * .92}" cy="${h * .9}" r="10" fill="#e07b39"/><circle cx="${w / 2}" cy="${h * .16 - 4}" r="11" fill="#f7c948" opacity=".9"/>`;
    if(!slots) for(const [x, y] of pts) s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(.5) rotate(-12)" fill="currentColor"><ellipse cx="0" cy="12" rx="13" ry="11"/><ellipse cx="-16" cy="-6" rx="5" ry="7"/><ellipse cx="-6" cy="-15" rx="5" ry="7"/><ellipse cx="6" cy="-15" rx="5" ry="7"/><ellipse cx="16" cy="-6" rx="5" ry="7"/></g>`;
    return s + '</svg>'; }
  let root, goalE, sayE, placeE, sheetE, toastE, coachE, fadeE, mapE, sunE, bookE;
  const UI = {};
  const fontLink = el('link', {rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500&display=swap'}); document.head.appendChild(fontLink);
  function buildUI(){ document.head.appendChild(el('style', {}, css)); document.documentElement.classList.add('esc-pre');
    const cat = window.SNOWBALL ? SNOWBALL.svg({id: 'sbhud', seed: 7}).replace(/viewBox="[^"]+"/, 'viewBox="110 10 280 300"') : '';
    root = el('div', {id: 'escRoot'}, `
      <div id="escTop">
        <div id="escL"><div class="escChip" id="escGoal" role="status" aria-live="polite"><div class="k"><b id="escTitle">The Lemonade Lock</b><span id="escTime">0:00</span><span id="escProg"></span></div><p id="escGoalT"></p></div>
          <div id="escPlace" aria-live="polite"></div></div>
        <div id="escR"><div id="escBtns">
          <button class="escChip" id="escHint" type="button" aria-label="Ask Snowball for a hint"><span class="av">${cat}</span><span class="tx"><b>Ask Snowball</b><small>For a hint</small></span></button>
          <button class="escChip escIco" id="escBookBtn" type="button" aria-label="Open your notebook">${ICO.book}<i id="escBookN">0</i></button>
          <button class="escChip escIco" id="escSnd" type="button" aria-label="Sound"></button>
          <button class="escChip escIco" id="escMenuBtn" type="button" aria-label="Menu" aria-expanded="false">${ICO.menu}</button>
        </div><div id="escSay" aria-live="polite"></div></div>
      </div>
      <div class="escChip" id="escMenu" role="menu"><button type="button" role="menuitem" id="escRestart">Start this level again</button><button type="button" role="menuitem" id="escLevels">Choose a different level</button><button type="button" role="menuitem" id="escAbout">About this 3D model</button><a role="menuitem" href="/tour/">Leave and explore the house</a><a role="menuitem" href="/games/">More games</a></div>
      <div id="escCoach" role="status"></div>
      <div id="escMarks"></div>
      <div id="escDock">
        <div id="escMapWrap"><button class="escChip" id="escMapBtn" type="button" aria-expanded="false">${ICO.pin}<span id="escMapNow">Entry</span><small>Map</small></button>
          <div class="escChip" id="escMap"><h4><span>You are in the <b id="escMapName">entry</b></span><span id="escFloors"></span></h4><button type="button" id="escMapX" aria-label="Close the map">×</button><div class="plan" id="escPlan"></div></div></div>
        <div class="escChip" id="escSun"><div class="top"><span id="escSunL">Time of day</span><b id="escClock">10:00 AM</b></div>
          <input id="escSlider" type="range" min="7" max="19" step=".25" value="10" aria-label="Time of day">
          <div class="ticks" id="escTicks" aria-hidden="true"></div></div>
        <div id="escDockR"></div>
      </div>
      <button class="escBtn dark" id="escBack" type="button">${ICO.back}<span>Back</span></button>
      <div id="escSheet" role="dialog" aria-live="polite"></div>
      <div id="escToast" role="status"></div>`);
    document.body.appendChild(root); fadeE = el('div', {id: 'escFade'}); document.body.appendChild(fadeE);
    bookE = el('div', {id: 'escBook', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Notebook'}); document.body.appendChild(bookE);
    bookE.addEventListener('pointerdown', e => { if(e.target === bookE) setBook(false); });
    goalE = $('#escGoal'); sayE = $('#escSay'); placeE = $('#escPlace'); sheetE = $('#escSheet'); toastE = $('#escToast'); coachE = $('#escCoach'); mapE = $('#escMap'); sunE = $('#escSun');
    $('#escHint').onclick = () => { SND.unlock(); hint(); };
    $('#escBookBtn').onclick = () => { SND.unlock(); SND.paper(); setBook(true); };
    const snd = $('#escSnd'), drawSnd = () => { snd.innerHTML = SND.muted ? ICO.mute : ICO.sound; snd.setAttribute('aria-label', SND.muted ? 'Turn sound on' : 'Turn sound off'); snd.setAttribute('aria-pressed', String(!SND.muted)); };
    snd.onclick = () => { SND.setMuted(!SND.muted); drawSnd(); if(!SND.muted) SND.tap(); toast(SND.muted ? 'Sound off' : 'Sound on', 1100); }; drawSnd(); UI.drawSnd = drawSnd;
    $('#escMenuBtn').onclick = e => { e.stopPropagation(); menuOpen() ? closeMenu() : ($('#escMenu').classList.add('on'), $('#escMenuBtn').setAttribute('aria-expanded', 'true')); };
    $('#escRestart').onclick = () => { store.del(saveKey()); location.reload(); };
    $('#escLevels').onclick = () => { save(); store.set('esc.pick', 1); location.reload(); };
    $('#escAbout').onclick = () => { closeMenu(); const d = document.getElementById('aboutDlg'); try{ d.showModal(); }catch(e){ if(d) d.setAttribute('open', ''); } };
    $('#escBack').onclick = () => back();
    $('#escMapBtn').onclick = () => setMap(!mapOpen()); $('#escMapX').onclick = () => setMap(false);
    const sl = $('#escSlider'); sl.oninput = () => onSlide(+sl.value, true); sl.onchange = () => { onSlide(+sl.value, true); applyHour(+sl.value, true); save(); };
    sl.addEventListener('pointerdown', () => { SND.unlock(); sunKey(false); });
    addEventListener('pointerdown', e => { if(menuOpen() && !e.target.closest('#escMenu,#escMenuBtn')) closeMenu(); if(mapOpen() && phone() && !e.target.closest('#escMap,#escMapBtn')) setMap(false); }, true); }
  const menuOpen = () => !!$('#escMenu') && $('#escMenu').classList.contains('on');
  function closeMenu(){ const m = $('#escMenu'); if(m && m.classList.contains('on')){ m.classList.remove('on'); $('#escMenuBtn').setAttribute('aria-expanded', 'false'); } }
  const mapOpen = () => !!mapE && mapE.classList.contains('on');
  function setMap(on){ if(!mapE) return; mapE.classList.toggle('on', on); $('#escMapBtn').setAttribute('aria-expanded', String(on)); if(on && PLACES[S.place]) mapFloor(PLACES[S.place].floor); }
  let toastT = 0; function toast(m, ms){ toastE.textContent = m; toastE.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastE.classList.remove('on'), ms || 2200); }
  // a line from Snowball, or from another animal (who = 'pepper' and so on)
  let sayT = 0; function say(m, ms, quiet, who){ const nm = who && who !== 'snowball' ? who[0].toUpperCase() + who.slice(1) : 'Snowball', ic = who && who !== 'snowball' && window.ESC_PETS ? ESC_PETS.icon(who, 18) : '';
    sayE.innerHTML = '<small>' + ic + nm + '</small>' + esc(m); sayE.classList.add('on'); clearTimeout(sayT); sayT = setTimeout(() => sayE.classList.remove('on'), ms || 4600); if(!quiet) (who === 'pepper' ? SND.chirp : who === 'biscuit' ? SND.woof : who === 'nugget' ? SND.squeak : SND.jingle)(); }
  let placeT = 0; function placeCard(k){ const P = PLACES[k]; placeE.innerHTML = `<b>${esc(P.name)}</b><span>${esc(P.note)}</span>`; placeE.classList.add('on'); clearTimeout(placeT); placeT = setTimeout(() => placeE.classList.remove('on'), 6500); }
  function fadeThrough(fn, hold){ fadeE.classList.add('on'); setTimeout(() => { try{ fn(); }catch(e){ console.error('[escape] cut', e); } wake(30); setTimeout(() => fadeE.classList.remove('on'), hold || 260); }, reduce ? 60 : 340); }

  /* ---- objective: the next open goal, preferring the floor you are on */
  function openGoals(){ return LG.goals.filter(g => g.needs.every(has) && !g.done.some(has)); }
  function goalNow(){ const open = openGoals(); if(!open.length) return null; const fl = S.place && PLACES[S.place] ? PLACES[S.place].floor : '';
    const pref = open.find(g => g.id === UI.goalId);   // keep the one showing while it is still open and on this floor
    if(pref && (!pref.floor || pref.floor === fl || !open.some(g => g.floor === fl))) return pref;
    return open.find(g => g.floor === fl) || open.find(g => !g.floor) || open[0]; }
  function setGoal(silent){ if(!LG) return; const g = goalNow(); const id = g ? g.id : 'done'; const txt = g ? g.text : (L.doneText || 'Done.');
    $('#escProg').textContent = L.progress ? L.progress() : '';
    if(id === UI.goalId && $('#escGoalT').textContent === txt) return; UI.goalId = id; $('#escGoalT').textContent = txt; $('#escHint').classList.remove('nudge'); sunKey(false);
    if(silent) return; goalE.classList.remove('new'); void goalE.offsetWidth; goalE.classList.add('new'); SND.goal(); }
  function sunKey(on){ sunE.classList.toggle('key', on); $('#escSunL').textContent = on ? 'Time of day: drag the sun' : 'Time of day'; }

  /* ---- saving: per level, everything needed to carry on after a reload */
  const saveKey = () => 'esc.' + LEVEL + '.save.v1';
  function save(){ if(!S.started || S.done || !L) return; const world = {doors: {}, shades: {}};
    for(const id of (L.saveDoors || [])) world.doors[id] = doorT(id) > .5 ? 1 : 0; for(const id of (L.saveShades || [])) world.shades[id] = shadeT(id) > .5 ? 1 : 0;
    store.set(saveKey(), {f: S.f, read: S.read, notes: S.notes, hour: S.hour, place: S.place, el: elapsed(), hints: S.hints, wrong: S.wrong, visited: S.visited, coach: S.coach, hintIx: S.hintIx, world, at: Date.now()}); }
  const saved = lv => { const s = store.get('esc.' + lv + '.save.v1'); return s && s.f && !s.f.opened && Date.now() - (s.at || 0) < 1000 * 3600 * 24 * 30 ? s : null; };

  /* ---- time slider */
  function setClock(h){ $('#escClock').textContent = fmtH(h); $('#escSlider').setAttribute('aria-valuetext', fmtH(h)); }
  function onSlide(h, user){ const was = S.hour; setClock(h); applyHour(h); if(user) S.lastProgress = performance.now();
    try{ if(L.onHour) L.onHour(h, was, user); }catch(e){ console.warn('[escape] hour', e); }
    if(S.ex && SPOTS[S.ex.id] && SPOTS[S.ex.id].sun) sheetFor(S.ex);
    if(!S.ex){ const sig = Object.keys(SPOTS).filter(id => { const sp = SPOTS[id]; return sp.from.includes(S.place) && (!sp.when || sp.when()); }).join(); if(sig !== UI.markSig) setMarks(); } }
  function setSlider(h){ $('#escSlider').value = h; onSlide(h); applyHour(h, true); }
  function sweepTo(h1, ms, then){ const h0 = S.hour, t0 = performance.now(); (function f(){ const u = clamp((performance.now() - t0) / ms, 0, 1), h = Math.round(lerp(h0, h1, ease(u)) * 4) / 4; if(h !== S.hour){ $('#escSlider').value = h; onSlide(h); }
      if(u < 1) requestAnimationFrame(f); else { applyHour(h1, true); save(); if(then) then(); } })(); }
  // the slider's track is the sky over the level's day: night blue, warm low sun, pale blue high sun
  function skyTrack(){ const [a, b] = LG.hours, stops = []; for(let i = 0; i <= 24; i++){ const h = a + (b - a) * i / 24, alt = sunAlt(h) * 180 / Math.PI;
      const c = alt < -1 ? [74, 79, 124] : alt < 5 ? [238, 157, 108] : alt < 14 ? [247, 214, 150] : alt < 28 ? [244, 232, 196] : [207, 228, 243]; stops.push(`rgb(${c.join(',')}) ${(i / 24 * 100).toFixed(1)}%`); }
    root.style.setProperty('--sky', `linear-gradient(90deg,${stops.join(',')})`);
    const ticks = []; for(let h = a; h <= b + 1e-6; h += 3) ticks.push(h); if(Math.abs(ticks[ticks.length - 1] - b) > .01) ticks.push(b);
    $('#escTicks').innerHTML = ticks.map((h, i) => `<span>${i === 0 || i === ticks.length - 1 || h === 12 ? fmtH(h).replace(':00', '') : ((h + 11) % 12 + 1)}</span>`).join('');
    const sl = $('#escSlider'); sl.min = a; sl.max = b; }

  /* ---- the map: one plan per floor, a pill for every place; tap a pill to go there */
  const MAP = {dot: null, floor: null, tf: {}};
  const FLOOR_NAME = {main: 'Main', upper: 'Upper', lower: 'Lower'}, FLOOR_STOREY = {main: /^SP-L1-/, upper: /^SP-L2-/, lower: /^SP-L0-/};
  function buildMap(){ const floors = [...new Set(ORDER.map(k => PLACES[k].floor))]; MAP.floors = floors;
    $('#escFloors').innerHTML = floors.length > 1 ? floors.map(f => `<button type="button" data-f="${f}" aria-pressed="false">${FLOOR_NAME[f]}</button>`).join('') : '';
    $$('#escFloors button').forEach(b => b.onclick = e => { e.stopPropagation(); mapFloor(b.dataset.f); });
    for(const f of floors){ const sp = H.BIM2S.meta.spaces.filter(s => FLOOR_STOREY[f].test(s.id)); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      const polys = sp.map(s => { const p = (s.poly || s.polygon).map(q => W2(q[0], q[1])); for(const [x, z] of p){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return {id: s.id, p}; });
      for(const k of ORDER) if(PLACES[k].floor === f){ const m = PLACES[k].map || [PLACES[k].pos[0], PLACES[k].pos[2]]; x0 = Math.min(x0, m[0] - 2); x1 = Math.max(x1, m[0] + 2); z0 = Math.min(z0, m[1] - 3); z1 = Math.max(z1, m[1] + 3); }
      const w = 248, h = 176, k = Math.min(w / (z1 - z0), h / (x1 - x0)), ox = (w - (z1 - z0) * k) / 2, oy = (h - (x1 - x0) * k) / 2;
      MAP.tf[f] = {pt: (x, z) => [ox + (z - z0) * k, oy + (x1 - x) * k], polys, w, h}; }
    mapFloor(PLACES[ORDER[0]].floor); }
  // the plan is turned a quarter: +z runs to the right and +x runs up, so the walk from the entry to the great room reads left to right
  function mapFloor(f){ if(!MAP.tf[f]) return; MAP.floor = f; const T = MAP.tf[f], plan = $('#escPlan'), w = T.w, h = T.h, used = L.mapRooms || null;
    let svg = `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
    for(const s of T.polys){ const d = s.p.map((q, i) => { const m = T.pt(q[0], q[1]); return (i ? 'L' : 'M') + m[0].toFixed(1) + ' ' + m[1].toFixed(1); }).join('') + 'Z', on = !used || used.includes(s.id);
      svg += `<path d="${d}" fill="${on ? '#e9e3d4' : '#f3f0e8'}" stroke="${on ? '#a9a08b' : '#d6d1c4'}" stroke-width="${on ? 1.2 : .8}" stroke-linejoin="round"/>`; }
    svg += `<g id="escDot"><path d="M0 0L-9 -20A22 22 0 0 1 9 -20Z" fill="rgba(201,138,18,.35)"/><circle r="5.5" fill="#c98a12" stroke="#fff" stroke-width="2"/></g></svg>`;
    plan.innerHTML = svg + ORDER.filter(key => PLACES[key].floor === f).map(key => { const P = PLACES[key], mp = P.map || [P.pos[0], P.pos[2]], m = T.pt(mp[0], mp[1]); return `<button type="button" class="pl" data-p="${key}" style="left:${(m[0] / w * 100).toFixed(1)}%;top:${(m[1] / h * 100).toFixed(1)}%">${esc(P.short || P.name)}</button>`; }).join('');
    MAP.dot = $('#escDot'); MAP.key = ''; $$('.pl', plan).forEach(b => b.onclick = () => { SND.unlock(); if(phone()) setMap(false); const go = () => goTo(b.dataset.p); if(S.ex){ if(S.backing) S.after = go; else if(!S.busy) back(go); return; } go(); });
    requestAnimationFrame(() => unclash(plan));
    $$('#escFloors button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f))); if(S.place) mapPlace(S.place, true); }
  // labels that land on each other are pushed apart, a few pixels at a time, until none overlap
  function unclash(plan){ const pills = $$('.pl', plan); if(pills.length < 2) return; const W = plan.clientWidth, Hh = plan.clientHeight || plan.getBoundingClientRect().height; if(!W || !Hh) return;
    const R = pills.map(b => ({b, x: parseFloat(b.style.left) / 100 * W, y: parseFloat(b.style.top) / 100 * Hh, w: b.offsetWidth + 4, h: b.offsetHeight + 3}));
    for(let it = 0; it < 60; it++){ let moved = false;
      for(let i = 0; i < R.length; i++) for(let j = i + 1; j < R.length; j++){ const a = R[i], c = R[j], ox = (a.w + c.w) / 2 - Math.abs(a.x - c.x), oy = (a.h + c.h) / 2 - Math.abs(a.y - c.y);
        if(ox > 0 && oy > 0){ moved = true; const s = a.y <= c.y ? -1 : 1, d = Math.min(oy / 2 + .5, 6); a.y += s * d; c.y -= s * d; } }
      for(const r of R){ r.y = clamp(r.y, r.h / 2, Hh - r.h / 2); r.x = clamp(r.x, r.w / 2, W - r.w / 2); } if(!moved) break; }
    for(const r of R){ r.b.style.left = (r.x / W * 100).toFixed(1) + '%'; r.b.style.top = (r.y / Hh * 100).toFixed(1) + '%'; } }
  function mapStep(){ if(!MAP.dot || !MAP.floor) return; const here = PLACES[S.place]; const show = !!here && here.floor === MAP.floor; MAP.dot.style.display = show ? '' : 'none'; if(!show) return;
    const m = MAP.tf[MAP.floor].pt(rig.pos.x, rig.pos.z), fx = -Math.sin(rig.yaw), fz = -Math.cos(rig.yaw), a = Math.atan2(fz, fx) * 180 / Math.PI;
    const key = m[0].toFixed(1) + ',' + m[1].toFixed(1) + ',' + a.toFixed(0); if(key === MAP.key) return; MAP.key = key; MAP.dot.setAttribute('transform', `translate(${m[0].toFixed(1)} ${m[1].toFixed(1)}) rotate(${a.toFixed(1)})`); }
  function mapPlace(k, keep){ const P = PLACES[k]; if(!keep && P.floor !== MAP.floor) return mapFloor(P.floor); $$('#escPlan .pl').forEach(b => b.setAttribute('aria-current', String(b.dataset.p === k))); $('#escMapName').textContent = P.name.toLowerCase(); $('#escMapNow').textContent = P.short || P.name; }

  /* ---- markers: gold rings (look closer) and white circles (walk there), projected from the house */
  const marks = [], _v = new THREE.Vector3();
  function mark(kind, label, at, act, key){ const b = el('button', {class: 'escMk ' + kind, type: 'button', 'aria-label': (kind === 'walk' ? 'Walk to the ' + label.toLowerCase() : label + ', take a closer look')}, `<i>${kind === 'walk' ? ICO.walk : ''}</i><span>${esc(label)}</span>`);
    b.onclick = e => { e.stopPropagation(); if(performance.now() - (m.moved || 0) < 350) return; SND.unlock(); act(); }; $('#escMarks').appendChild(b); const m = {b, kind, label, at, act, key, on: false}; marks.push(m); return m; }
  function setMarks(){ for(const m of marks) m.b.remove(); marks.length = 0; UI.markSig = ''; if(!S.place || S.ex || S.done) return;
    for(const w of (WALKS[S.place] || [])) if(!w.when || w.when()) mark('walk', w.label || PLACES[w.to].name, w.at, () => goTo(w.to), 'w:' + w.to);
    const ids = []; for(const id in SPOTS){ const sp = SPOTS[id]; if(sp.from.includes(S.place) && (!sp.when || sp.when())){ ids.push(id); mark('look', sp.label(), sp.at(), () => examine(id), 's:' + id); } }
    UI.markSig = ids.join(); }
  function marksStep(){ if(!marks.length) return; const r = canvas.getBoundingClientRect(), hide = !!rig.move || S.busy || !S.started || S.done || !!S.ex || bookOpen();
    const top = 46, bot = r.height - 46, padX = 40, items = [], placed = [];
    for(const m of marks){ if(hide){ if(m.on){ m.on = false; m.b.classList.remove('on'); } continue; }
      _v.set(m.at[0], m.at[1], m.at[2]).applyMatrix4(camera.matrixWorldInverse); const behind = _v.z > -.3, side = _v.x;
      _v.set(m.at[0], m.at[1], m.at[2]).project(camera); let x = r.left + (_v.x + 1) / 2 * r.width, y = r.top + (1 - _v.y) / 2 * r.height, edge = '', docked = false;
      if(behind || x < r.left - 10 || x > r.left + r.width + 10 || y < r.top - 60 || y > r.top + r.height + 60){ docked = true; edge = (behind ? side < 0 : x < r.left + r.width / 2) ? 'L' : 'R'; }
      else { x = clamp(x, r.left + padX, r.left + r.width - padX); y = clamp(y, r.top + top, r.top + bot); if(x < r.left + 88) edge = 'L'; else if(x > r.left + r.width - 88) edge = 'R'; }
      items.push({m, x, y, edge, docked}); }
    items.sort((p, q) => (p.docked - q.docked) || ((p.m.kind === 'walk') - (q.m.kind === 'walk')));
    const obs = [], add = e => { if(!e) return; const q = e.getBoundingClientRect(); if(q.width > 2 && q.height > 2) obs.push([q.left - 6, q.top - 6, q.right + 6, q.bottom + 6]); };
    add(goalE); add(phone() ? $('#escMapBtn') : mapE); add($('#escBtns')); add(sunE);
    // the room card and the speech bubble come and go; the space they took stays reserved while you're in this place, so rings don't jump when they fade
    const stick = UI.stick && UI.stick.place === S.place ? UI.stick : (UI.stick = {place: S.place, boxes: {}});
    const keep = (k, e) => { if(e.classList.contains('on')){ const q = e.getBoundingClientRect(); if(q.width > 2 && q.height > 2){ const b = [q.left - 6, q.top - 6, q.right + 6, q.bottom + 6], o = stick.boxes[k];
        stick.boxes[k] = o ? [Math.min(o[0], b[0]), Math.min(o[1], b[1]), Math.max(o[2], b[2]), Math.max(o[3], b[3])] : b; } } if(stick.boxes[k]) obs.push(stick.boxes[k]); };
    keep('place', placeE); keep('say', sayE);
    // the 'drag to look around' tip comes and goes and lets taps through, so it doesn't push rings about
    const wOf = m => m.w || (m.w = Math.max(40, (m.b.querySelector('span') || {}).offsetWidth || 90));
    const box = it => { const w = wOf(it.m), hw = Math.max(34, w / 2 + 4); return it.edge === 'L' ? [it.x - 32, it.y - 32, it.x + 36 + w, it.y + 32] : it.edge === 'R' ? [it.x - 36 - w, it.y - 32, it.x + 32, it.y + 32] : [it.x - hw, it.y - 32, it.x + hw, it.y + 84]; };
    const hit = (p, q) => !(p[2] < q[0] || p[0] > q[2] || p[3] < q[1] || p[1] > q[3]);
    const stack = (list, x0, x1, maxPitch) => { const n = list.length; if(!n) return; let yMin = r.top + top, yMax = r.top + bot;
      for(const o of obs){ if(o[2] < x0 || o[0] > x1) continue; if((o[1] + o[3]) / 2 < r.top + r.height / 2) yMin = Math.max(yMin, o[3] + 36); else yMax = Math.min(yMax, o[1] - 36); }
      const pitch = n > 1 ? clamp((yMax - yMin) / (n - 1), 40, maxPitch) : 0, start = clamp(r.top + r.height * .42 - (n - 1) * pitch / 2, yMin, Math.max(yMin, yMax - (n - 1) * pitch));
      list.forEach((it, i) => { it.x = it.edge === 'L' ? r.left + padX : r.left + r.width - padX; it.y = start + i * pitch; placed.push(box(it)); }); };
    const dockL = items.filter(it => it.docked && it.edge === 'L'), dockR = items.filter(it => it.docked && it.edge === 'R');
    const reach = list => Math.max(...list.map(it => 36 + wOf(it.m))) + padX;
    if(dockL.length && dockR.length && reach(dockL) + reach(dockR) + 10 > r.width){ const seq = []; for(let i = 0; i < Math.max(dockL.length, dockR.length); i++){ if(dockL[i]) seq.push(dockL[i]); if(dockR[i]) seq.push(dockR[i]); }
      stack(seq, r.left, r.left + r.width, 58); }
    else { stack(dockL, r.left, r.left + 290, 66); stack(dockR, r.left + r.width - 290, r.left + r.width, 66); }
    for(const it of items){ const m = it.m;
      if(!it.docked){ const y0 = it.y, all = obs.concat(placed), free = y => { it.y = y; const q = box(it); return !all.some(o => hit(q, o)); };
        if(!free(y0)){ let ok = false; for(let k = 1; k <= 3 && !ok; k++) for(const d of (y0 > r.top + r.height * .55 ? [-1, 1] : [1, -1])){ const y = y0 + d * 30 * k; if(y < r.top + top || y > r.top + bot) continue; if(free(y)){ ok = true; break; } } if(!ok) it.y = y0; }
        placed.push(box(it)); }
      // a ring that has just jumped (not one gliding with the camera) ignores taps for a moment, so a tap meant for the old spot doesn't land on it
      if(m.px != null && Math.hypot(it.x - m.px, it.y - m.py) > 24 && !rig.move && !ptrs.size) m.moved = performance.now(); m.px = it.x; m.py = it.y;
      m.b.style.transform = `translate(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px)`; const cls = 'escMk ' + m.kind + ' on' + (it.edge ? ' edge ' + it.edge : '') + (m.kind === 'walk' && !S.coach.walk ? ' first' : '');
      if(m.b.className !== cls) m.b.className = cls; m.on = true; } }
  function tapAt(cx, cy){ if(rig.move || S.busy || S.ex) return; let best = null; for(const m of marks){ if(!m.on) continue; const q = m.b.getBoundingClientRect(), d = Math.hypot(q.left + q.width / 2 - cx, q.top + q.height / 2 - cy); if(d < 56 && (!best || d < best.d)) best = {m, d}; } if(best) best.m.act(); }

  /* ---- coach: look, walk, tap, taught one at a time by doing */
  function coach(){ if(!S.started || S.done){ coachE.classList.remove('on'); return; } const c = S.coach; let k = '';
    if(!c.look){ if(S.dragPx > 140){ c.look = true; } else k = 'look'; }
    if(!k && !c.walk) k = 'walk'; if(!k && !c.tap && marks.some(m => m.kind === 'look' && m.on)) k = 'tap';
    if(S.ex || rig.move || mapOpen() || bookOpen() || elapsed() > 300) k = '';
    if(k){ let y, x = '';
      if(phone()) y = $('#escTop').getBoundingClientRect().bottom + 10;
      else { const g = goalE.getBoundingClientRect(), b = $('#escBtns').getBoundingClientRect(); if(b.left - g.right > 360){ y = g.top + 6; x = Math.round((g.right + b.left) / 2) + 'px'; } else y = Math.max(g.bottom, placeE.classList.contains('on') ? placeE.getBoundingClientRect().bottom : 0) + 12; }
      y = Math.round(y) + 'px'; if(coachE.style.top !== y) coachE.style.top = y; if(coachE.style.left !== x) coachE.style.left = x; }
    if(k === UI.coachK) return; UI.coachK = k; coachE.className = k ? 'on ' + k : '';
    if(k) coachE.innerHTML = k === 'look' ? ICO.drag + '<span>Drag to look around</span>' : k === 'walk' ? ICO.disc + '<span>Tap a white circle to walk there</span>' : ICO.ring + '<span>Tap a gold ring to look closer</span>'; }

  /* ================================================================== moving and examining */
  function standPose(k){ const P = PLACES[k], f = (P.faceAt && P.faceAt()) || P.face, a = yp(P.pos, f); return {yaw: a[0], pitch: a[1], fov: placeFov(P.fov), off: [0, 0]}; }
  function arrive(k, first){ S.place = k; S.busy = false; mapPlace(k); setMarks(); const fr = !S.visited[k]; S.visited[k] = true; if(fr || first) placeCard(k);
    S.lastProgress = performance.now(); setGoal(); ga('esc_place', {place: k}); try{ if(L.onArrive) L.onArrive(k, fr); }catch(e){ console.warn('[escape] arrive', e); } save(); }
  const FLOOR_Y = {main: 0, upper: 5.57, lower: -4.56};
  function goTo(k, opts){ opts = opts || {}; if(!PLACES[k] || S.busy || rig.move || S.done) return false; if(S.ex){ return false; }
    if(k === S.place){ const p = standPose(k); rig.lim = null; rig.tyaw = rig.yaw + angDiff(rig.yaw, p.yaw); rig.tpitch = p.pitch; rig.zoom = 1; if(opts.done) opts.done(); return true; }
    const r = route(S.place, k), pose = opts.pose || standPose(k); S.busy = true; S.coach.walk = true; placeE.classList.remove('on'); sayE.classList.remove('on');
    if(r && !opts.fade){ const path = r.map(n => NODES[n] ? [NODES[n][0], nodeY(n), NODES[n][1]] : PLACES[n].pos);
      const dur = rigTravel(path, pose, {face: true, done: () => { arrive(k); if(opts.done) opts.done(); }}); SND.steps(clamp(Math.round(dur / .44), 1, 7)); return true; }
    // another floor, or a room the walking graph doesn't reach: a short fade (stairs, a hall) and you are there
    const a = PLACES[S.place], b = PLACES[k], ud = a && b && a.floor !== b.floor ? (FLOOR_Y[b.floor] > FLOOR_Y[a.floor] ? 'Up the stairs' : 'Down the stairs') : '';
    SND.steps(ud ? 6 : 4); fadeThrough(() => { rigCut(b.pos, pose.yaw, pose.pitch, pose.fov); arrive(k); if(ud) toast(ud + ' to the ' + b.name.toLowerCase(), 1800); if(opts.done) setTimeout(opts.done, 450); }, 420); return true; }
  function freeArea(){ const W = innerWidth, Hh = innerHeight, r = sheetE.getBoundingClientRect(); const topPad = phone() ? Math.max(118, goalE.getBoundingClientRect().bottom + 10) : 30;
    if(phone()){ const sunH = document.documentElement.classList.contains('esc-exsun') ? 118 : 0, b = Math.max(topPad + 80, Hh - r.height - 16 - sunH); return {fx: .5, fy: (topPad + b) / 2 / Hh, fw: .94, fh: (b - topPad) / Hh}; }
    const l = Math.min(W - 400, W * .62); return {fx: l / 2 / W, fy: .5, fw: l / W * .92, fh: .74}; }
  function examine(id){ const sp = SPOTS[id]; if(!sp || S.busy || rig.move || S.done || S.ex) return; S.coach.tap = true; ga('esc_look', {item: id}); SND.look();
    S.ex = {id, back: {yaw: rig.yaw, pitch: rig.pitch}}; S.busy = true; setMarks(); placeE.classList.remove('on'); sayE.classList.remove('on');
    document.documentElement.classList.add('esc-ex'); document.documentElement.classList.toggle('esc-exsun', !!sp.sun);
    sheetFor(S.ex); sheetE.classList.add('on'); frameExamine(.95, () => { S.busy = false; try{ if(sp.seen) sp.seen(); }catch(e){ console.error('[escape] seen', e); } if(S.ex && S.ex.id === id && !SPOTS[id].lock) sheetFor(S.ex); }); }
  function frameExamine(dur, done){ const sp = SPOTS[S.ex.id], po = sp.pose ? sp.pose() : sp, a = yp(po.pos, po.look), dist = Math.hypot(po.look[0] - po.pos[0], po.look[1] - po.pos[1], po.look[2] - po.pos[2]);
    document.documentElement.style.setProperty('--sheet-h', Math.round(sheetE.getBoundingClientRect().height) + 'px');
    const free = freeArea(), pose = {yaw: a[0], pitch: a[1], fov: fitFov(po.fit, dist, free), off: [free.fx - .5, free.fy - .5]};
    rigTravel([[rig.pos.x, rig.pos.y, rig.pos.z], po.pos], pose, {dur, done: () => { rig.lim = {yaw: pose.yaw, pitch: pose.pitch, ry: .2, rp: .14}; if(done) done(); }}); }
  function reframe(){ if(!S.ex) return; const id = S.ex.id; S.busy = true; frameExamine(.8, () => { S.busy = false; const sp = SPOTS[id]; if(!S.ex || S.ex.id !== id) return;
    try{ if(sp.seen) sp.seen(); }catch(e){ console.error('[escape] seen', e); } if(!sp.lock) sheetFor(S.ex); }); }
  function back(then){ if(!S.ex || rig.move || S.busy) return; const ex = S.ex; SND.back(); sheetE.classList.remove('on'); S.busy = true; S.backing = true;
    const P = PLACES[S.place], pose = {yaw: ex.back.yaw, pitch: ex.back.pitch, fov: placeFov(P.fov), off: [0, 0]};
    rigTravel([[rig.pos.x, rig.pos.y, rig.pos.z], P.pos], pose, {dur: .85, done: () => { S.ex = null; S.busy = false; S.backing = false; document.documentElement.classList.remove('esc-ex', 'esc-exsun'); setMarks(); const af = S.after; S.after = null; if(typeof then === 'function') then(); else if(af) af(); }}); }
  // a sheet: title, body html, and buttons ({label, run, cls}); Back is always last
  function sheet(title, body, acts){ sheetE.innerHTML = `<h3>${title}</h3>${body || ''}<div class="row"></div>`; const row = sheetE.querySelector('.row');
    for(const a of (acts || [])){ const b = el('button', {class: 'escBtn ' + (a.cls || 'dark'), type: 'button'}, a.label); b.onclick = () => { if(S.busy || rig.move) return; SND.unlock(); a.run(); }; row.appendChild(b); }
    const bk = el('button', {class: 'escBtn', type: 'button'}, `${ICO.back}<span>Back to the ${esc(PLACES[S.place].name.toLowerCase())}</span>`); bk.onclick = () => back(); row.appendChild(bk);
    $('#escBack span').textContent = 'Back to the ' + PLACES[S.place].name.toLowerCase(); }
  function sheetFor(ex){ const sp = SPOTS[ex.id]; if(!sp) return; if(sp.lock) return sheetLock(sp); const h0 = sheetE.getBoundingClientRect().height, r = sp.sheet(); sheet(r.title, r.body, r.acts); if(r.after) r.after(sheetE);
    // a sheet that grows or shrinks moves the sun slider and, on a phone, the space left for the picture
    const h1 = sheetE.getBoundingClientRect().height; document.documentElement.style.setProperty('--sheet-h', Math.round(h1) + 'px');
    if(phone() && h0 > 0 && Math.abs(h1 - h0) > 40 && S.ex && !S.busy && !rig.move){ S.busy = true; frameExamine(.5, () => { S.busy = false; }); } }
  // an animal's line, with its picture
  const CATICON = () => UI.cat || (UI.cat = window.SNOWBALL ? SNOWBALL.svg({id: 'sbln', seed: 7}).replace(/viewBox="[^"]+"/, 'viewBox="130 20 240 250"').replace('<svg ', '<svg width="30" height="30" ') : '');
  const line = (who, text, big) => `<div class="line${big ? ' big' : ''}">${who === 'snowball' ? CATICON() : window.ESC_PETS ? ESC_PETS.icon(who, 30) : ''}<span>${esc(text)}</span></div>`;
  // do something to the house from a sheet, then let it finish moving before the sheet and the view catch up
  function act(fn, ms){ S.busy = true; try{ fn(); }catch(e){ console.error('[escape] act', e); } setTimeout(() => { S.busy = false; if(S.ex){ sheetFor(S.ex); reframe(); } else setMarks(); save(); }, reduce ? 60 : (ms || 700)); }

  /* ---- locks: a keypad for N digits; three wrong in a row and it pauses (Medium and Hard) */
  let padCur = '', padLock = false;
  function sheetLock(sp){ const K = LG.locks[sp.lock], n = K.answer.length, r = sp.sheet ? sp.sheet() : {};
    padCur = padCur.length > n ? '' : padCur; padLock = false;
    const disp = sp.arc ? `<div class="escArc">${arcSVG(330, 138, true)}<div class="escDisp" id="escDisp" aria-live="polite"></div></div>` : `<div class="escDisp" id="escDisp" aria-live="polite"></div>`;
    sheet(r.title || 'The lock', (r.body || '') + disp + (sp.arc ? `<div class="escDelW"><button type="button" class="escBtn" id="escDel" style="min-height:42px;padding:0 16px" aria-label="Delete the last digit">⌫ Delete</button></div>` : '') + `<p class="escPause" id="escPause"></p><div class="escPad" id="escPad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button type="button" data-n="${k}">${k}</button>`).join('')}<button type="button" class="z" data-n="0">0</button><button type="button" class="c" data-n="c" aria-label="Delete the last digit">⌫</button></div>`, r.acts);
    padDraw(); $$('.escPad button', sheetE).forEach(b => b.onclick = () => padPress(b.dataset.n)); if($('#escDel')) $('#escDel').onclick = () => padPress('c'); pauseTick(); }
  function padDraw(cls){ const d = $('#escDisp'); if(!d) return; const sp = SPOTS[S.ex && S.ex.id]; if(!sp || !sp.lock) return; const n = LG.locks[sp.lock].answer.length;
    d.className = 'escDisp ' + (cls || '');
    if(sp.arc){ const pts = arcPts(330, 138); d.innerHTML = pts.map((p, i) => `<i style="left:${(p[0] / 330 * 100).toFixed(1)}%;top:${(p[1] / 138 * 100).toFixed(1)}%">${padCur[i] || ''}</i>`).join(''); }
    else d.innerHTML = Array.from({length: n}, (_, i) => `<i>${padCur[i] || ''}</i>`).join('') + `<button type="button" class="escBtn c2" style="display:none;min-height:48px;padding:0 14px" aria-label="Delete the last digit">⌫</button>`;
    const c2 = d.querySelector('.c2'); if(c2) c2.onclick = () => padPress('c'); if(sp.face) sp.face(padCur, cls); }
  function pauseTick(){ const p = $('#escPause'), pad = $('#escPad'); if(!p || !pad) return; const left = Math.ceil((S.pauseUntil - Date.now()) / 1000);
    if(left > 0){ p.textContent = `The lock is resting. Try again in ${left} s.`; pad.setAttribute('aria-disabled', 'true'); clearTimeout(UI.pauseT); UI.pauseT = setTimeout(pauseTick, 500); } else { p.textContent = ''; pad.removeAttribute('aria-disabled'); } }
  function padPress(n){ const sp = SPOTS[S.ex && S.ex.id]; if(!sp || !sp.lock || padLock || S.done || S.busy) return; SND.unlock(); if(Date.now() < S.pauseUntil){ SND.tap(); return; }
    const K = LG.locks[sp.lock], N = K.answer.length;
    if(n === 'c'){ padCur = padCur.slice(0, -1); padDraw(); SND.tap(); return; } if(padCur.length >= N) return; padCur += n; padDraw(); SND.key(Math.min(4, padCur.length));
    if(padCur.length < N) return; padLock = true;
    if(padCur === K.answer){ padDraw('ok'); SND.right(); store.del('esc.' + LEVEL + '.pause'); S.wrongRun = 0; give(...LG.steps[Object.keys(LG.steps).find(k => LG.steps[k].lock === sp.lock)].gives); setTimeout(() => L.win(sp.lock), 650); }
    else { padDraw('bad'); SND.wrong(); S.wrong++; S.wrongRun++; ga('esc_wrong', {n: S.wrong}); const tries = S.wrongRun;
      if(K.pause && tries % K.pause === 0) S.pauseUntil = Date.now() + 20000;
      // kept apart from the saved game (and on the wall clock), so neither a reload nor starting over skips the pause or resets the count
      store.set('esc.' + LEVEL + '.pause', {until: S.pauseUntil, run: S.wrongRun});
      setTimeout(() => { padCur = ''; padLock = false; padDraw(); pauseTick(); const ln = L.wrongLine ? L.wrongLine(S.wrong, sp.lock) : null; if(ln) say(ln, 4200); }, 650); save(); } }

  /* ---- the notebook (Medium and Hard): every clue at full size, and the numbers so far */
  const NOTES = {};   // id -> {title, img: canvas, text, kind, who}
  const bookOpen = () => !!bookE && bookE.classList.contains('on');
  function note(id, def){ if(def) NOTES[id] = Object.assign(NOTES[id] || {}, def); if(!S.notes.includes(id)){ S.notes.push(id); const b = $('#escBookBtn'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); SND.paper(); toast('Added to your notebook: ' + (NOTES[id].title || 'a clue'), 2200); }
    bookCount(); save(); }
  function bookCount(){ const b = $('#escBookBtn'); if(!b) return; b.classList.toggle('on', !!L && !!L.book); $('#escBookN').textContent = S.notes.length + Object.keys(LG.parts).filter(p => has(p) && LG.parts[p].value.length === 1).length; }
  const imgOf = id => { const N = NOTES[id]; if(!N || !N.img) return ''; if(!N.url) try{ N.url = N.img().toDataURL('image/png'); }catch(e){ N.url = ''; } return N.url; };
  function setBook(on, view){ if(!bookE) return; if(!on){ bookE.classList.remove('on'); return; } bookE.classList.add('on'); bookRender(view); }
  function bookRender(view){ const nums = L.numbers ? L.numbers() : [], cards = S.notes.filter(id => NOTES[id]);
    let h = `<div class="bk"><button class="x" type="button" aria-label="Close the notebook">×</button>`;
    if(view && view.big){ const N = NOTES[view.big];
      h += `<h2>${esc(N.title)}</h2><p class="sub">${esc(N.where || '')}</p><div class="big"><img alt="${esc(N.alt || N.title)}" src="${imgOf(view.big)}">${N.text ? `<p>${esc(N.text)}</p>` : ''}</div>`;
      h += `<div class="acts"><button class="escBtn" type="button" data-a="all">${ICO.back}<span>All my clues</span></button>${(N.acts || []).map((a, i) => `<button class="escBtn dark" type="button" data-x="${i}">${esc(a.label)}</button>`).join('')}</div>`; }
    else if(view && view.html){ h += view.html + `<div class="acts"><button class="escBtn" type="button" data-a="all">${ICO.back}<span>All my clues</span></button></div>`; }
    else { h += `<h2>Notebook</h2><p class="sub">${cards.length ? 'Everything you’ve found. Tap a clue to see it big.' : 'Nothing yet. Clues you find go in here.'}</p>`;
      if(nums.length) h += `<div class="nums">${nums.map(n => `<div class="num">${n.icon || ''}<b>${esc(n.value)}</b><span>${esc(n.label)}</span></div>`).join('')}</div>`;
      h += `<div class="cards">${cards.map(id => `<button class="clue" type="button" data-c="${id}"><img alt="" src="${imgOf(id)}"><span>${esc(NOTES[id].title)}</span></button>`).join('')}</div>`;
      if(L.bookActs) h += `<div class="acts">${L.bookActs().map((a, i) => `<button class="escBtn dark" type="button" data-b="${i}">${esc(a.label)}</button>`).join('')}</div>`; }
    bookE.innerHTML = h + '</div>';
    bookE.querySelector('.x').onclick = () => setBook(false);
    $$('[data-c]', bookE).forEach(b => b.onclick = () => { SND.paper(); bookRender({big: b.dataset.c}); });
    $$('[data-a=all]', bookE).forEach(b => b.onclick = () => bookRender());
    if(view && view.big){ const N = NOTES[view.big]; $$('[data-x]', bookE).forEach(b => b.onclick = () => N.acts[+b.dataset.x].run()); }
    if(L.bookActs && !view){ const A = L.bookActs(); $$('[data-b]', bookE).forEach(b => b.onclick = () => A[+b.dataset.b].run()); }
    try{ bookE.querySelector('.x').focus({preventScroll: true}); }catch(e){} }

  /* ================================================================== hints: Snowball, three tiers for the objective showing */
  function hintReset(){}
  function hint(){ if(!S.started || S.done || rig.move || S.busy) return; const g = goalNow(); if(!g) return; const i = Math.min(S.hintIx[g.id] || 0, 2); S.hintIx[g.id] = Math.min(i + 1, 2);
    S.hints++; S.lastProgress = performance.now(); $('#escHint').classList.remove('nudge'); ga('esc_hint', {goal: g.id, tier: i + 1});
    const fn = L.hintActs && L.hintActs[g.id] && L.hintActs[g.id][i];
    const run = () => { say(g.hints[i], 7000); if(fn) try{ fn(); }catch(e){ console.warn('[escape] hint', e); } save(); };
    if(bookOpen()) setBook(false);
    if(S.ex && fn){ back(); const w = setInterval(() => { if(!S.ex && !rig.move && !S.busy){ clearInterval(w); run(); } }, 80); } else run(); }

  /* ================================================================== start and finish */
  function startCard(){ const pickNow = store.get('esc.pick'); store.del('esc.pick');
    const c = el('div', {id: 'escCard'}); document.body.appendChild(c);
    const draw = () => { const M = META[LEVEL], best = store.get('esc.' + LEVEL + '.v2.best') || (LEVEL === 'easy' ? store.get('esc.easy.v2.best') : null), sv = saved(LEVEL), D = window.ESCAPE_LEVELS[LEVEL] && window.ESCAPE_LEVELS[LEVEL].card;
      const lv = LEVELS.map(k => { const m = META[k], b = store.get('esc.' + k + '.v2.best'); return `<button type="button" role="radio" aria-checked="${k === LEVEL}" data-l="${k}"><b>${m.name}</b><span class="t">${m.title}</span><small>${m.time}. ${m.who}.${b ? ` <span class="best">Best ${fmtT(b.time)}</span>` : ''}</small></button>`; }).join('');
      const note = D ? (typeof D.note === 'function' ? D.note(API) : D.note) : `<div class="note"><p>${esc(M.blurb)}</p></div>`;
      c.innerHTML = `<div class="c" role="dialog" aria-labelledby="escH"><p class="k">Locked In at Hillside · ${M.name} · ${M.where}</p><h2 id="escH">${M.title}</h2>
        <div class="lv" role="radiogroup" aria-label="Choose a level">${lv}</div>
        ${D && D.lede ? `<p class="lede">${D.lede}</p>` : ''}${note}
        <ul class="how"><li>${ICO.drag}Drag to look around</li><li>${ICO.disc}Tap a white circle to walk there</li><li>${ICO.ring}Tap a gold ring to look closer</li></ul>
        <div class="acts">${sv ? `<button class="escBtn primary" type="button" id="escGo" style="min-width:150px;min-height:52px;font-size:17px">Carry on (${fmtT(sv.el)} in)</button><button class="escBtn" type="button" id="escNew">Start over</button>` : `<button class="escBtn primary" type="button" id="escGo" style="min-width:150px;min-height:52px;font-size:17px">Go inside</button>`}<button class="escBtn" type="button" id="escSnd0"></button></div>
        <p class="foot">${M.time}${best ? ', and your best so far is ' + fmtT(best.time) : ''}. The house is real: 118 Hillside Drive in Woodside, California, shown here as a 3D model, and it’s for sale. Its furniture and decor are AI-generated.</p></div>`;
      const s0 = $('#escSnd0'), d0 = () => { s0.innerHTML = (SND.muted ? ICO.mute : ICO.sound) + '<span>' + (SND.muted ? 'Sound is off' : 'Sound is on') + '</span>'; s0.setAttribute('aria-pressed', String(!SND.muted)); };
      s0.onclick = () => { SND.setMuted(!SND.muted); d0(); UI.drawSnd(); if(!SND.muted) SND.goal(); }; d0();
      $$('.lv button', c).forEach(b => b.onclick = () => { if(b.dataset.l === LEVEL) return; SND.unlock(); SND.tap(); LEVEL = b.dataset.l; store.set('esc.level', LEVEL); ga('esc_level', {pick: LEVEL});
        const want = LEVEL; preload(LEVEL).then(() => { if(LEVEL === want) draw(); }); draw(); try{ c.querySelector(`[data-l="${want}"]`).focus({preventScroll: true}); }catch(e){} });
      const go = resume => { SND.unlock(); SND.tap(); $('#escGo').disabled = true; $('#escGo').textContent = 'Opening the house'; if(!resume) store.del(saveKey());
        store.set('esc.level', LEVEL); preload(LEVEL).then(() => fadeThrough(() => { c.remove(); begin(resume ? saved(LEVEL) : null); }, 420)).catch(e => { console.error('[escape] level', e); $('#escGo').disabled = false; $('#escGo').textContent = 'Try again'; }); };
      $('#escGo').onclick = () => go(!!sv); if($('#escNew')) $('#escNew').onclick = () => go(false);
      if(!pickNow) try{ $('#escGo').focus({preventScroll: true}); }catch(e){} };
    draw(); preload(LEVEL).then(draw).catch(() => {}); }
  // a level's files, once: the logic for every level, and for Medium and Hard their world and the animals
  const PRE = {};
  function preload(lv){ if(PRE[lv]) return PRE[lv]; const need = []; if(!window.ESCAPE_LOGIC) need.push(loadJS('logic.js'));
    if(lv !== 'easy'){ if(!window.ESC_PETS) need.push(loadJS('pets.js')); if(!window.ESCAPE_LEVELS[lv]) need.push(loadJS(lv + '.js')); }
    return (PRE[lv] = Promise.all(need).catch(e => { PRE[lv] = null; throw e; })); }
  function begin(sv){ document.documentElement.classList.remove('esc-pre'); LG = window.ESCAPE_LOGIC[LEVEL]; DOY = LG.doy;
    L = (LEVEL === 'easy' ? EASY : window.ESCAPE_LEVELS[LEVEL].make)(API);
    PLACES = L.places; ORDER = Object.keys(PLACES); NODES = Object.assign({}, L.nodes || {}); for(const k of ORDER) NODES[k] = [PLACES[k].pos[0], PLACES[k].pos[2], PLACES[k].pos[1]];
    EDGES = L.edges || []; WALKS = L.walks || {}; SPOTS = L.spots;
    DUSK = L.dusk || (() => { for(let h = LG.hours[0] + 6; h <= 24; h += .05) if(sunAlt(h) < .012) return h; return 20; })();
    $('#escTitle').textContent = LG.title; skyTrack(); buildMap(); try{ L.build(); }catch(e){ console.error('[escape] build', e); }
    { const pz = store.get('esc.' + LEVEL + '.pause'); if(pz){ S.pauseUntil = +pz.until || 0; S.wrongRun = +pz.run || 0; } }
    if(sv){ S.f = sv.f || {}; S.read = sv.read || {}; S.notes = sv.notes || []; S.hints = sv.hints || 0; S.wrong = sv.wrong || 0; S.visited = sv.visited || {}; S.coach = sv.coach || S.coach; S.hintIx = sv.hintIx || {};
      for(const id in ((sv.world || {}).doors || {})) door(id, sv.world.doors[id] === 1, true); for(const id in ((sv.world || {}).shades || {})) shade(id, sv.world.shades[id] === 1, true); }
    const h0 = sv ? sv.hour : LG.start; $('#escSlider').value = h0; setClock(h0); applyHour(h0, true);
    try{ if(L.restore) L.restore(!!sv); }catch(e){ console.error('[escape] restore', e); }
    const k0 = sv && PLACES[sv.place] ? sv.place : L.start, p = standPose(k0); rigCut(PLACES[k0].pos, p.yaw, p.pitch, p.fov);
    S.started = true; S.t0 = performance.now() - (sv ? sv.el * 1000 : 0); S.lastProgress = performance.now(); ga(sv ? 'esc_resume' : 'esc_start');
    bookCount(); arrive(k0, true); setGoal(true); try{ if(L.begin) L.begin(!!sv); }catch(e){ console.error('[escape] begin', e); } LIGHT.update(); }
  function win(){ if(S.done) return; S.done = true; S.tEnd = performance.now(); const t = elapsed(); ga('esc_win', {secs: Math.round(t), hints: S.hints});
    const k = 'esc.' + LEVEL + '.v2.best', best = store.get(k); if(!best || t < best.time) store.set(k, {time: t, hints: S.hints}); store.del(saveKey());
    sheetE.classList.remove('on'); setBook(false); document.documentElement.classList.add('esc-cine'); for(const m of marks) m.b.classList.remove('on'); }
  // copies text; when the async clipboard is refused it falls back to a hidden textarea and the copy command
  async function copyText(text){ try{ await navigator.clipboard.writeText(text); return true; }catch(e){} try{ const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return !!ok; }catch(e){ return false; } }
  function showLink(btn, url){ let i = btn.parentNode.querySelector('input.shareLink'); if(!i){ i = document.createElement('input'); i.className = 'shareLink'; i.readOnly = true; i.value = url; i.setAttribute('aria-label', 'Link to this game'); i.style.cssText = 'flex:1 1 100%;width:100%;min-width:0;box-sizing:border-box;margin-top:8px;padding:10px 12px;border:1.5px solid #d9a24a;border-radius:12px;font:14px Jost,sans-serif;color:#1f2433;background:#fff'; btn.parentNode.appendChild(i); } btn.textContent = 'Copy the link below'; i.focus(); i.select(); }
  function finishCard(F){ const t = elapsed(), next = LEVELS[LEVELS.indexOf(LEVEL) + 1];
    const c = el('div', {id: 'escCard', class: 'side'}, `<div class="c" role="dialog" aria-labelledby="escH"><p class="k">Locked In at Hillside · ${META[LEVEL].name}</p><h2 id="escH">${F.title}</h2>
      <p class="lede">${F.lede}</p>
      <div class="stats"><div><b>${fmtT(t)}</b><span>your time</span></div><div><b>${S.hints}</b><span>${S.hints === 1 ? 'hint from Snowball' : 'hints from Snowball'}</span></div></div>
      <div class="cta"><b>The house is real, and it’s for sale.</b><span>${F.real}</span>
        <div class="acts"><a class="escBtn primary" href="/#contact" id="escSee" style="min-height:52px;font-size:17px">See it in person</a><a class="escBtn light" href="/tour/" id="escFree">Explore the house freely</a></div></div>
      <div class="more">${next ? `<button class="escBtn dark" type="button" id="escNext">Play ${META[next].name}: ${META[next].title}</button>` : ''}<button class="escBtn" type="button" id="escShare">Share</button><button class="escBtn" type="button" id="escAgain">Play again</button><a class="escBtn" href="/games/">More games</a></div></div>`);
    document.body.appendChild(c); const card = c.querySelector('.c');
    if(!reduce && F.bubbles) for(let i = 0; i < 9; i++){ const b = el('i', {class: 'escBub', 'aria-hidden': 'true'}); b.style.right = (14 + Math.random() * 120) + 'px'; b.style.animationDelay = (Math.random() * 3) + 's'; b.style.width = b.style.height = (6 + Math.random() * 7) + 'px'; card.appendChild(b); }
    $('#escSee').onclick = () => ga('esc_cta', {cta: 'see_in_person'}); $('#escFree').onclick = () => ga('esc_cta', {cta: 'explore'});
    $('#escAgain').onclick = () => { store.set('esc.level', LEVEL); location.reload(); };
    if(next) $('#escNext').onclick = () => { store.set('esc.level', next); ga('esc_next', {to: next}); const u = new URL(location.href); u.searchParams.set('escape', next); u.searchParams.delete('level'); location.href = u.toString(); };
    $('#escShare').onclick = async () => { const url = SITE.page('/games/escape/') + '?level=' + LEVEL, text = F.share(fmtT(t)); ga('esc_share');
      try{ if(navigator.share){ await navigator.share({title: 'Locked In at Hillside', text, url}); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
      if(await copyText(text + ' ' + url)) $('#escShare').textContent = 'Link copied'; else showLink($('#escShare'), url); };
    try{ $('#escSee').focus({preventScroll: true}); }catch(e){} }

  /* ================================================================== the toolkit a level file gets (medium.js and hard.js) */
  const API = {H, THREE, S, has, give, can, fresh, sunIn, get LG(){ return LG; }, door, doorT, doorItem, shade, shadeT, shadeItem, opening, spacePoly, spaceFloor, inPoly,
    lightPlane, windowSource, makeStrips, buildPaper, paperLight, prop, paperCanvas, texOf, onFont, petAt, petWalk, yawTo, PETS, catAt, fadeCat, say, toast, goTo, examine, back, act, reframe,
    setSlider, sweepTo, sunKey, setGoal, setMarks, sheetFor, line, note, NOTES, setBook, bookRender, SND, PAW, ICO, esc, el, lin, wake, clamp, lerp, ease, smooth, sunDir, sunAlt,
    rig, rigTravel, rigCut, yp, aspect, placeFov, fadeThrough, win, finishCard, fmtT, fmtH, arcSVG, store, LIGHT, phone, reduce, hour: () => S.hour, place: () => S.place, ex: () => S.ex,
    get cat(){ return CAT; }, EYE, $, $$};

  /* ================================================================== Easy: The Lemonade Lock (the r35 level, with the shade fix; r45: lemonade, not champagne)
     The great-room roller shades now start down, so the light on the floor can't give the code away before Snowball's drawing is found;
     the drawing shows them rolled up, and the gold ring that raises them appears once you've seen it. */
  function EASY(E){
    const CODE = '327', T_SUN = 16;
    const PL = {
      entry:   {name: 'Entry', floor: 'main', pos: [-5.6, EYE, -0.6], face: [-5.3, 4.7, -8], map: [-7.6, -2.3],
        note: 'A cathedral ceiling, a starburst light, and iron-and-glass doors at both ends. The heritage oak is straight ahead.'},
      living:  {name: 'Living room', floor: 'main', pos: [1.8, EYE, -3.6], face: [10, 5.0, -2.9], map: [3.4, -3.2],
        note: 'Fir beams cross the vaulted ceiling. This room is part of the original 1920s house.'},
      kitchen: {name: 'Kitchen', floor: 'main', pos: [12.8, EYE, 8.4], face: [11.2, 3.7, 20], map: [12.4, 8.2],
        note: 'Quartz counters, a long peninsula and a Bosch gas range. The great room opens up past the peninsula.'},
      coffee:  {name: 'Coffee bar', floor: 'main', pos: [15.0, EYE, 9.3], face: [21.0, 3.1, 10.9], map: [20.6, 9.4],
        note: 'A coffee bar with its own drinks fridge, tucked in beside the kitchen.'},
      great:   {name: 'Great room', floor: 'main', pos: [13.4, EYE, 31.95], face: [10.7, 3.3, 22.0], fov: 56, map: [10.4, 28.2],
        faceAt: () => lightOn(S.hour) && has('shadesUp') ? [10.95, .9, 24.7] : null,
        note: 'The kitchen, the dining table and this sitting area share one long room, with butcher-block shelves over the built-in cabinets and large windows along one side.'}};
    const lightOn = h => h >= 14.75 && h <= 17.25, lightUp = h => sunIn('lightFloor');
    const DRAW = {mesh: null, tex: null}, FR = {pivot: null, lock: null, lockTex: null, glow: null, open: 0, anim: null};
    const shadesUp = () => shadeT('WN-L1-03') < .5;
    // Snowball's drawing: a low sun, the two big panes with their shades rolled up, the light on the floor, and a clock at four
    function drawingCanvas(){ return paperCanvas(760, 1360, 'kraft', (x, w, h, ink) => {
      ink.tape(118, 40, -.17); ink.tape(w - 118, 40, .15);
      ink.line([[70, 520], [300, 518]], 9); x.lineWidth = 9; x.beginPath(); x.arc(170, 516, 54, Math.PI, 0); x.stroke();
      for(let i = 0; i < 7; i++){ const a = Math.PI + (i + .5) / 7 * Math.PI; ink.line([[170 + Math.cos(a) * 74, 516 + Math.sin(a) * 74], [170 + Math.cos(a) * 106, 516 + Math.sin(a) * 106]], 7); }
      for(const wx of [356, 520]){ x.lineWidth = 10; x.strokeRect(wx, 200, 150, 290); ink.line([[wx + 16, 272], [wx + 46, 242]], 5); ink.line([[wx + 16, 310], [wx + 70, 256]], 5);
        // the shade, rolled right up: a fat roll across the top of the pane, and an arrow pointing up
        x.fillStyle = '#f3ecdc'; x.strokeStyle = '#1c2030'; x.lineWidth = 7; x.beginPath(); x.roundRect ? x.roundRect(wx - 8, 168, 166, 34, 16) : x.rect(wx - 8, 168, 166, 34); x.fill(); x.stroke();
        ink.line([[wx + 120, 300], [wx + 120, 222]], 7); ink.line([[wx + 102, 242], [wx + 120, 222], [wx + 138, 242]], 7); }
      ink.line([[338, 502], [690, 502]], 12);
      ink.line([[250, 470], [340, 400]], 7); ink.line([[312, 398], [342, 398], [340, 428]], 7);
      ink.line([[300, 590], [700, 590], [640, 760], [180, 760], [300, 590]], 7);
      x.save(); x.setLineDash([16, 14]); ink.line([[430, 505], [330, 640]], 5); ink.line([[596, 505], [520, 640]], 5); x.restore();
      ink.text('?  ?  ?', 440, 690, 96);
      const cx = 380, cy = 1010, r = 150; x.strokeStyle = '#1c2030'; x.lineWidth = 11; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
      for(let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2, r0 = i % 3 ? r - 20 : r - 34; ink.line([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)]], i % 3 ? 5 : 9); }
      for(const [n, a] of [['12', -90], ['3', 0], ['6', 90], ['9', 180]]){ const q = a * Math.PI / 180; ink.text(n, cx + Math.cos(q) * (r - 62), cy + Math.sin(q) * (r - 62) + 3, 50); }
      ink.line([[cx, cy], [cx, cy - 104]], 9); const a4 = (4 / 12) * Math.PI * 2 - Math.PI / 2; ink.line([[cx, cy], [cx + Math.cos(a4) * 70, cy + Math.sin(a4) * 70]], 13);
      x.fillStyle = '#1c2030'; x.beginPath(); x.arc(cx, cy, 11, 0, Math.PI * 2); x.fill();
      ink.paw(w - 150, h - 128, 1, -.22); }, 7); }
    function buildDrawing(){ const pd = doorItem('R28-POCKET'); E.pocket = pd || null;
      const tex = DRAW.tex = texOf(drawingCanvas());
      const m = DRAW.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 3.13), new THREE.MeshBasicMaterial({map: tex, transparent: true, toneMapped: false}));
      m.name = 'esc-drawing'; m.renderOrder = 3; m.rotation.y = -Math.PI / 2; m.raycast = () => {}; m.material.color.setScalar(.84);
      if(!placeDrawing()){ H.grp('main').add(m); m.position.set(22.149, 4.1, 9.525); m.visible = false; DRAW.loose = true; }
      onFont(() => { tex.image = drawingCanvas(); tex.needsUpdate = true; }); }
    // the sheet rides on the sliding leaf, a hair off its kitchen face (measured from the leaf's own geometry each time)
    function placeDrawing(){ const pd = E.pocket, m = DRAW.mesh, leaf = pd && pd.parts && pd.parts.find(q => q.k === 0); if(!m || !leaf || !leaf.piv) return false;
      let minx = Infinity; for(const c of leaf.piv.children){ if(c === m || !c.geometry) continue; if(!c.geometry.boundingBox) c.geometry.computeBoundingBox(); const b = c.geometry.boundingBox; if(b && isFinite(b.min.x)) minx = Math.min(minx, b.min.x + c.position.x); }
      if(!isFinite(minx)) minx = -.0623; if(m.parent !== leaf.piv) leaf.piv.add(m); m.position.set(minx - .006, 4.1, 0); m.visible = true; DRAW.loose = false; return true; }
    const doorShut = () => doorT('R28-POCKET') < .5;
    function slideDoor(shut){ SND.slide(); placeDrawing(); door('R28-POCKET', !shut); if(DRAW.mesh && DRAW.loose) DRAW.mesh.visible = shut; if(shut) give('doorShut'); }
    function buildFridge(){ let bc = null; const v = new THREE.Vector3();
      H.scene.traverse(o => { if(bc || o.name !== 'beverageCooler') return; o.getWorldPosition(v); if(Math.abs(v.x - 19.64) < 1.2 && Math.abs(v.z - 13.5) < 1.6 && Math.abs(v.y) < 1) bc = o; });
      const host = H.grp('main');
      // r45: a bottle of pink lemonade (it used to be champagne): a round-shouldered glass bottle, a white cap and a lemon on the label
      const prof = [[0, 0], [.13, 0], [.145, .02], [.145, .5], [.13, .6], [.07, .7], [.055, .82], [.055, .9], [0, .9]].map(p => new THREE.Vector2(p[0], p[1]));
      const glassM = new THREE.MeshStandardMaterial({color: lin(0xf4a3b5), roughness: .18, metalness: .05, emissive: lin(0xd8667f), emissiveIntensity: .3});
      const capM = new THREE.MeshStandardMaterial({color: lin(0xf5f2ea), roughness: .4, metalness: .2, emissive: lin(0xf5f2ea), emissiveIntensity: .25});
      const lc0 = document.createElement('canvas'); lc0.width = 256; lc0.height = 64; { const g = lc0.getContext('2d'); g.fillStyle = '#f6efd9'; g.fillRect(0, 0, 256, 64);
        for(const cx of [40, 168]){ g.fillStyle = '#f2cf3b'; g.beginPath(); g.ellipse(cx, 32, 22, 16, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#5c9a3c'; g.beginPath(); g.ellipse(cx + 20, 16, 9, 4, -.6, 0, Math.PI * 2); g.fill(); } }
      const labelT = new THREE.CanvasTexture(lc0); labelT.encoding = THREE.sRGBEncoding;
      const labelM = new THREE.MeshStandardMaterial({map: labelT, roughness: .8, emissive: lin(0xf1ead8), emissiveIntensity: .2});
      const bottle = new THREE.Group(); bottle.name = 'esc-bottle';
      bottle.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 28), glassM));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.064, .064, .07, 20), capM); cap.position.y = .925; bottle.add(cap);
      const lab = new THREE.Mesh(new THREE.CylinderGeometry(.148, .148, .22, 28, 1, true), labelM); lab.position.y = .28; bottle.add(lab);
      bottle.rotation.z = Math.PI / 2; bottle.rotation.y = .12; bottle.position.set(20.16, 1.37 + .152, 12.5); bottle.traverse(o => { o.raycast = () => {}; }); host.add(bottle); FR.bottle = bottle;
      const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gx = gc.getContext('2d'), gr = gx.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,226,170,1)'); gr.addColorStop(.4, 'rgba(255,205,130,.45)'); gr.addColorStop(1, 'rgba(255,190,110,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
      const glow = FR.glow = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0})); glow.position.set(19.64, 1.75, 13.2); glow.scale.set(2.7, 2.9, 1); glow.raycast = () => {}; glow.renderOrder = 6; host.add(glow);
      const lc = document.createElement('canvas'); lc.width = 256; lc.height = 128; FR.lockCv = lc; const lt = FR.lockTex = new THREE.CanvasTexture(lc); lt.encoding = THREE.sRGBEncoding; lt.anisotropy = 4;
      const lock = FR.lock = new THREE.Mesh(new THREE.BoxGeometry(.5, .25, .035), [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({color: lin(0x1a1c22), roughness: .5, metalness: .4})).concat([new THREE.MeshBasicMaterial({map: lt, toneMapped: false}), new THREE.MeshStandardMaterial({color: lin(0x1a1c22)})]));
      lock.rotation.y = Math.PI; lock.position.set(19.9, 2.42, 11.672); lock.raycast = () => {}; lock.name = 'esc-lock'; host.add(lock); lockFace('', 'locked');
      if(!bc) return;
      try{ // split the door from the toe grille, and hang it (with its glass) on a hinge at the right-hand side
        const st = bc.children.find(c => c.name === 'stainless'); if(!st) return; st.updateWorldMatrix(true, false);
        const g0 = st.geometry.index ? st.geometry.toNonIndexed() : st.geometry.clone(), pos = g0.attributes.position, dr = [], toe = [];
        let hx = 1e9, hz = 0, n = 0;
        for(let i = 0; i < pos.count; i += 3){ let ymax = -1e9; for(let k = 0; k < 3; k++){ v.fromBufferAttribute(pos, i + k).applyMatrix4(st.matrixWorld); ymax = Math.max(ymax, v.y); if(v.z > 11.68){ hx = Math.min(hx, v.x); hz += v.z; n++; } } (ymax <= .37 ? toe : dr).push(i); }
        const sub = tris => { const ng = new THREE.BufferGeometry(); for(const name in g0.attributes){ const a = g0.attributes[name], sz = a.itemSize, arr = new Float32Array(tris.length * 3 * sz); let w = 0;
            for(const i of tris) for(let k = 0; k < 3; k++) for(let c = 0; c < sz; c++) arr[w++] = a.array[(i + k) * sz + c]; ng.setAttribute(name, new THREE.BufferAttribute(arr, sz)); } ng.computeBoundingBox(); ng.computeBoundingSphere(); return ng; };
        if(dr.length < 6 || !isFinite(hx)) return;
        const mk = tris => { const m = new THREE.Mesh(sub(tris), st.material); m.position.copy(st.position); m.quaternion.copy(st.quaternion); m.scale.copy(st.scale); m.castShadow = st.castShadow; m.receiveShadow = st.receiveShadow; m.userData = st.userData; return m; };
        const dm = mk(dr); dm.name = 'esc-cooler-door'; st.parent.add(dm); if(toe.length){ const tm = mk(toe); tm.name = 'stainless-toe'; st.parent.add(tm); } st.visible = false;
        const pivot = FR.pivot = new THREE.Group(); pivot.name = 'esc-cooler-hinge'; pivot.position.set(hx + .02, 0, n ? hz / n : 11.72); host.add(pivot); host.updateWorldMatrix(true, true);
        for(const m of [dm].concat(bc.children.filter(c => /^r8(glass|sheen|led)$/.test(c.name))).concat([lock])) pivot.attach(m);
      }catch(e){ console.warn('[escape] fridge door', e); FR.pivot = null; } }
    function lockFace(txt, state){ const c = FR.lockCv; if(!c) return; const x = c.getContext('2d'); x.fillStyle = '#14161c'; x.fillRect(0, 0, 256, 128);
      x.fillStyle = '#05070c'; x.fillRect(16, 22, 168, 84); x.font = '600 66px "IBM Plex Mono", ui-monospace, Menlo, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = state === 'open' ? '#7cf0a6' : state === 'bad' ? '#ff7a6b' : '#ffd77a'; for(let i = 0; i < 3; i++) x.fillText(txt[i] || '·', 46 + i * 54, 66);
      x.beginPath(); x.arc(220, 64, 15, 0, Math.PI * 2); x.fillStyle = state === 'open' ? '#55e08a' : '#e2503f'; x.fill(); FR.lockTex.needsUpdate = true; wake(4); }
    function openFridgeDoor(){ FR.anim = {t0: performance.now(), dur: reduce ? 10 : 1100}; SND.fridge(); }
    const PAPER = {box: null, src: null};
    function checkLit(){ if(has('shadesUp') && shadesUp() && lightUp(S.hour) && !has('lit')){ give('lit'); SND.reveal();
        if(S.place === 'great' || (S.ex && S.ex.id === 'floor')) say('There it is.', 3600, true); else say('Something just changed. Go look.', 5200, true); } }
    const SP = {
      fridge: {from: ['coffee'], lock: 'fridge', label: () => 'Drinks fridge', at: () => [19.64, 1.9, 11.5], pos: [19.64, 2.3, 8.3], look: [19.64, 1.72, 11.7], fit: {w: 2.5, h: 3.1},
        sheet: () => ({title: 'The drinks fridge', body: '<p>Smoked glass, one bottle of pink lemonade on the shelf, and a keypad lock that wants three digits.</p>'}),
        face: (cur, cls) => lockFace(cur, cls === 'ok' ? 'open' : cls === 'bad' ? 'bad' : 'locked'),
        seen(){ if(give('sawFridge') && !has('sawDrawing')) say('Locked. I did that.', 3800); }},
      pocket: {from: ['coffee'], label: () => doorShut() ? 'Drawing on the door' : 'Pocket door', at: () => [22.0, doorShut() ? 2.2 : 4.1, 9.55],
        pose: () => doorShut() ? {pos: [18.5, 4.2, 9.525], look: [22.15, 4.1, 9.525], fit: {w: 2.05, h: 3.45}} : {pos: [17.2, 4.7, 9.55], look: [22.1, 3.7, 9.55], fit: {w: 3.6, h: 6.4}},
        sheet: () => !doorShut() ? {title: 'The pocket door', body: '<p>It slides out of the wall between the fridge and the coffee bar, and closes the kitchen off from the bedroom hall.</p>',
            acts: [{label: 'Slide it shut', run: () => act(() => slideDoor(true), 720)}]}
          : {title: 'Snowball’s drawing', body: '<p>Kraft paper, taped where you can’t see it while the door is open. A low sun, two tall windows with their shades rolled right up, light landing on a floor, and a clock. Signed with a paw print.</p>',
            acts: [{label: 'Slide the door open', cls: '', run: () => act(() => slideDoor(false), 500)}]},
        seen(){ if(doorShut() && give('sawDrawing')){ say('I drew that. The clock took three tries.'); checkLit(); } }},
      shades: {from: ['great'], when: () => has('sawDrawing'), label: () => shadesUp() ? 'Big windows' : 'Shades on the big windows', at: () => [4.9, 5.4, 25.4], pos: [10.6, 5.2, 25.4], look: [4.7, 4.6, 25.4], fit: {w: 14.5, h: 6.4},
        sheet: () => ({title: 'The big windows', body: shadesUp() ? '<p>Two large picture windows, with light-filtering roller shades rolled up out of the way. Strips of paper are taped to the glass.</p>' : '<p>Two large picture windows. The roller shades are all the way down. Snowball likes it dark for his nap.</p>',
          acts: [shadesUp() ? {label: 'Lower the shades', cls: '', run: () => act(() => { SND.shade(); shade('WN-L1-03', true); }, 900)} : {label: 'Raise the shades', run: () => act(() => { SND.shade(); shade('WN-L1-03', false); give('shadesUp'); setTimeout(checkLit, 650); }, 900)}]})},
      paper: {from: ['great'], when: () => shadesUp(), label: () => 'Paper on the window', at: () => PAPER.box ? [PAPER.box.max.x + .05, (PAPER.box.min.y + PAPER.box.max.y) / 2, (PAPER.box.min.z + PAPER.box.max.z) / 2] : [4.7, 3.2, 23.4],
        pose: () => { const b = PAPER.box, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2; return {pos: [8.9, cy + .25, cz], look: [b.max.x, cy, cz], fit: {w: b.max.z - b.min.z + .9, h: b.max.y - b.min.y + .9}}; },
        sheet: () => { const lit = PAPER.src && PAPER.src.s > .3; return {title: 'Paper on the window', body: `<p>Strips of paper taped to the glass in three boxy figures. Some are white card and some are tracing paper.</p><p>${lit ? 'With the sun behind them, the card goes dark and the tracing paper glows.' : 'No sun on this side of the house, so they all look the same.'}</p>`}; },
        seen(){ SND.paper(); if(!E.saidPaper){ E.saidPaper = true; say('Light can tell them apart.', 4600); } }},
      floor: {from: ['great'], when: () => has('shadesUp') && lightOn(S.hour), sun: true, label: () => 'Light on the floor', at: () => [11.0, .15, 26.35], pos: [10.95, 7.7, 29.0], look: [10.95, 0, 24.5], fit: {w: 6.4, h: 3.3},
        sheet: () => { const up = lightUp(S.hour), on = lightOn(S.hour) && shadesUp();
          return up && on ? {title: 'Light on the floor', body: '<p>The card strips block the sun and the tracing paper lets it through. Three digits, the right way up from here.</p>'}
            : on ? {title: 'Light on the floor', body: '<p>Shadows from the paper on the window, pulled out of shape. The sun isn’t quite where Snowball drew it.</p>'}
            : {title: 'The floor', body: '<p>No sun through the big windows at this hour.</p>'}; },
        seen(){ checkRead(); }}};
    function checkRead(){ if(S.ex && S.ex.id === 'floor' && lightUp(S.hour) && shadesUp() && has('lit')) give('p_code', 'readCode'); }
    return {places: PL, start: 'entry', dusk: 18.55,
      nodes: {a1: [4.4, -4.9], a2: [11.4, -4.9], a3: [12.6, -1.0], a4: [12.75, 5.1], j1: [15.7, 12.4], j2: [15.8, 17.2], s1: [15.2, 26.4], s2: [14.3, 31.6]},
      edges: [['entry', 'living'], ['living', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'], ['a4', 'kitchen'], ['kitchen', 'coffee'], ['kitchen', 'j1'], ['coffee', 'j1'], ['j1', 'j2'], ['j2', 's1'], ['s1', 's2'], ['s2', 'great']],
      walks: {entry: [{to: 'living', at: [0.4, 2.6, -3.0]}], living: [{to: 'entry', at: [-3.4, 2.4, -1.6]}, {to: 'kitchen', at: [12.7, 3.3, 4.7]}],
        kitchen: [{to: 'living', at: [12.75, 3.2, 5.3]}, {to: 'coffee', at: [17.0, 2.6, 9.7]}, {to: 'great', at: [15.7, 2.2, 18.2]}],
        coffee: [{to: 'kitchen', at: [12.3, 2.8, 8.6]}, {to: 'great', at: [15.8, 1.6, 15.2]}], great: [{to: 'kitchen', at: [15.5, 3.2, 16.6]}]},
      mapRooms: ['SP-L1-ENTRY', 'SP-L1-LIVING', 'SP-L1-KITCHEN', 'SP-L1-GREAT'],
      spots: SP, saveDoors: ['R28-POCKET'], saveShades: ['WN-L1-03'],
      build(){ shade('WN-L1-03', true, true);   // Snowball pulled them down for his nap
        const src0 = windowSource('WN-L1-03', {room: 'SP-L1-GREAT'}), win = src0.op, out = src0.out();
        const strips = makeStrips(CODE, {o: [8.6, .05, 25.5], right: [1, 0, 0], up: [0, 0, -1], size: 1.15, pitch: 1.52}, {p: [win.c[0], 0, win.c[1]], n: [out.x, 0, out.z]}, T_SUN);
        PAPER.group = buildPaper(strips, [-out.x * .014, 0, -out.z * .014]); PAPER.box = PAPER.group.userData.box;
        PAPER.src = windowSource('WN-L1-03', {room: 'SP-L1-GREAT', shade: 'WN-L1-03', bot: win.o.sill + .12, bars: [[-.17, .17, 0, 9]], strips});
        LIGHT.dining = lightPlane({floor: 'SP-L1-GREAT', sources: [PAPER.src], ppf: 40, after: () => paperLight(PAPER.src.s)});
        const grid = [[-1.46, -1.3, 0, 9], [1.3, 1.46, 0, 9], [-4.4, 4.4, 2.8, 2.94], [-4.4, 4.4, 5.28, 5.42]];
        LIGHT.entry = lightPlane({floor: 'SP-L1-ENTRY', ppf: 30, sources: [windowSource('D-LG-02', {room: 'SP-L1-ENTRY', bot: .1, top: 7.8, inset: .25, bars: grid}), windowSource('D-L0-11', {room: 'SP-L1-ENTRY', bot: .1, top: 7.8, inset: .25, bars: grid})]});
        // the vases on the sitting-area table stand between the sofa and the floor you need to read; the table stays
        try{ const b = new THREE.Box3(); for(const k of Object.keys(H.GROUPS)) for(const c of H.GROUPS[k].children){ if(c.name !== 'drumTable') continue; b.setFromObject(c); if(b.min.z > 27 && b.max.z < 32 && b.min.x > 8) c.children.forEach(q => { if(q.name === 'decor') q.visible = false; }); } }catch(e){}
        buildDrawing(); buildFridge(); makeCat(); },
      restore(){ placeDrawing(); if(DRAW.mesh && DRAW.loose) DRAW.mesh.visible = doorShut(); LIGHT.update(); },
      begin(resumed){ catAt(resumed ? [14.3, 0, 24.7] : [-.2, 0, -4.6]); if(!resumed) setTimeout(() => { if(!has('sawFridge') && !rig.move) say('Nothing’s hidden in a drawer. I don’t do drawers.', 4600); }, phone() ? 7200 : 2600); },
      onHour(h){ checkLit(); checkRead(); if(DRAW.mesh) DRAW.mesh.material.color.setScalar(h >= 18.55 ? .5 : .84); },
      frame(now){ if(!FR.anim) return; const u = clamp((now - FR.anim.t0) / FR.anim.dur, 0, 1), e = 1 - Math.pow(1 - u, 3); FR.open = e;
        if(FR.pivot) FR.pivot.rotation.y = e * 1.78; if(FR.glow) FR.glow.material.opacity = .75 * e; wake(3); if(u >= 1) FR.anim = null; },
      wrongLine: n => n === 1 ? 'No.' : n % 3 === 0 ? 'Only a thousand to go. I can wait.' : null,
      hintActs: {
        arrive: [null, () => catAt([12.2, 0, 3.7]), () => { catAt([17.8, 0, 9.0]); goTo('coffee'); }],
        fridge: [null, () => { catAt([21.3, 0, 8.6]); if(S.place !== 'coffee') goTo('coffee'); }, () => { catAt([21.3, 0, 8.6]); if(S.place !== 'coffee') goTo('coffee'); }],
        drawing: [null, () => { sunKey(true); if(S.place !== 'great') goTo('great'); }, () => { const go = () => { SND.shade(); shade('WN-L1-03', false); give('shadesUp'); setTimeout(() => sweepTo(T_SUN, 1500, checkLit), 500); }; if(S.place !== 'great') goTo('great', {done: go}); else go(); }],
        light: [null, () => { catAt([14.3, 0, 24.7]); if(!lightOn(S.hour)) sweepTo(T_SUN, 1200); }, () => { const go = () => setTimeout(() => examine('floor'), 250); if(!lightUp(S.hour)) setSlider(T_SUN); if(S.ex) return; if(S.place === 'great') go(); else goTo('great', {done: go}); }]},
      win(){ win(); $('#escGoalT').textContent = 'The fridge is open.';
        const a = yp([19.35, 2.8, 8.3], [19.75, 1.6, 12.2]); rigTravel([[rig.pos.x, rig.pos.y, rig.pos.z], [19.35, 2.8, 8.3]], {yaw: a[0], pitch: a[1], fov: aspect() < 1 ? 80 : 58, off: [0, 0]}, {dur: 1.2});
        setTimeout(openFridgeDoor, 250); setTimeout(() => toast('Pink lemonade.', 2400), 1300);
        setTimeout(() => { // the afternoon runs out, the house lights come on, and the doorbell goes: the last view is the lit house from outside
          const sh = aspect() < 1 ? {pos: [-6, 5, 34], pos2: [-6, 5, 31], look: [-6, 5, 0], fov: 80, off: [0, -.36], cat: [-4.6, 0, 6]} : {pos: [-5, 6.2, 41], pos2: [-5, 6, 36.5], look: [-5, 4.8, 0], fov: 58, off: [-.17, 0], cat: [-4.6, 0, 6]};
          const a1 = yp(sh.pos, sh.look), a2 = yp(sh.pos2, sh.look);
          fadeThrough(() => { rigCut(sh.pos, a1[0], a1[1], sh.fov); $('#escSlider').value = 18.75; setClock(18.75); applyHour(18.75, true); catAt(sh.cat);
            rigTravel([sh.pos, sh.pos2], {yaw: a2[0], pitch: a2[1], fov: sh.fov, off: sh.off}, {dur: 9}); }, 520);
          setTimeout(() => { SND.bell(); }, 1500);
          setTimeout(() => door('D-LG-02', true), 2500);
          setTimeout(() => { SND.cork(); finishCard({title: 'Lemonade time.', bubbles: true,
            lede: 'The house is lit for the evening. Snowball says you’re nearly as clever as he is. He’s keeping the bottle cap.',
            real: '118 Hillside Drive is in Woodside, California, with six bedrooms and three full baths. The afternoon sun really does come through the great room like that. Come and stand in it.',
            share: t => `Locked In at Hillside: Snowball the cat locked the lemonade in a fridge at 118 Hillside Drive, and I got it out in ${t}. Your turn.`}); }, 5600); }, 3400); }};
  }
  EASY.card = {lede: 'Snowball, the orange tabby who runs this house, has locked tonight’s pink lemonade in a drinks fridge. He wants to see if you’re as clever as he is.',
    note: `<div class="note"><p>I locked up the lemonade. The code is somewhere in the house. I left you one clue. It’s a good one.</p><p class="sig">${PAW}</p><p class="ps">P.S. If you get stuck, ask me. I love being asked.</p></div>`};
  window.ESCAPE_LEVELS.easy = {make: EASY, card: EASY.card};

  /* ================================================================== frame loop */
  let lastT = performance.now(), lastTime = '';
  function frame(){ requestAnimationFrame(frame); const now = performance.now(), dt = Math.min(.1, (now - lastT) / 1000); lastT = now;
    try{ if(UI.live){ rigStep(now, dt); if(L && L.frame) L.frame(now, dt); }
      // a shade on its way up or down moves the light under it
      const mv = !!(window.BL35 && BL35.moving.size); if((mv && now - (UI.lu || 0) > 90) || (!mv && UI.blMv)){ UI.lu = now; LIGHT.update(); } UI.blMv = mv;
      if(S.busy && !rig.move){ if(!frame.busyAt) frame.busyAt = now; else if(now - frame.busyAt > 2600){ S.busy = false; frame.busyAt = 0; } } else frame.busyAt = 0;
      if(S.started){ marksStep(); mapStep(); coach();
        if(!S.done){ const ts = fmtT(elapsed()); if(ts !== lastTime){ lastTime = ts; $('#escTime').textContent = ts; if(+ts.split(':')[1] % 15 === 0) save(); }
          if(now - S.lastProgress > 80000 && !S.ex) $('#escHint').classList.add('nudge'); } }
    }catch(e){ if(!frame.err){ frame.err = true; console.error('[escape] frame', e); } } }

  /* ================================================================== boot: after the house is ready */
  function boot(){ try{ H.asBuilt && H.asBuilt(); }catch(e){}
    loadSnowball(() => { try{ buildUI(); $('#escSlider').value = S.hour; setClock(S.hour); applyHour(S.hour, true);
        const a = yp([-7.6, 5.1, 15.8], [-5.6, 4.6, 6]); rigCut([-7.6, 5.1, 15.8], a[0], a[1], aspect() < 1 ? 80 : 60); UI.live = true; }catch(e){ console.error('[escape] build', e); }
      requestAnimationFrame(frame);
      const clear = () => { const ld = document.getElementById('loading'); let n = 0; (function w(){ let o = 0; try{ o = ld ? +getComputedStyle(ld).opacity : 0; if(ld && getComputedStyle(ld).display === 'none') o = 0; }catch(e){}
          if(o < .03 || n++ > 40){ document.documentElement.classList.add('esc-up'); startCard(); } else setTimeout(w, 120); })(); };
      const intro = document.getElementById('intro28'); if(intro){ const mo = new MutationObserver(() => { if(!document.getElementById('intro28')){ mo.disconnect(); clear(); } }); mo.observe(document.body, {childList: true}); } else clear(); }); }
  (function wait(n){ let fr = 0; try{ fr = H.renderer.info.render.frame; }catch(e){} const ld = document.getElementById('loading'), up = ld && !ld.classList.contains('done');
    if((fr > 8 && !up) || n > 240) setTimeout(boot, 700); else setTimeout(() => wait(n + 1), 250); })(0);

  /* ================================================================== debug and QA (window.ESCAPE) */
  const QA = {
    // are the walking edges clear? rays at ankle, knee, counter and eye height along each edge, against everything solid
    edges(){ const rc = new THREE.Raycaster(), out = [], objs = Object.values(H.GROUPS).filter(g => g.visible && !/tree|hill|terrain|land/.test(g.name || ''));
      for(const [p, q] of EDGES){ const a = NODES[p], b = NODES[q]; if(!a || !b) continue; const ya = nodeY(p) - EYE, yb = nodeY(q) - EYE, L0 = Math.hypot(b[0] - a[0], b[1] - a[1]); let worst = null;
        for(const hgt of [.6, 2.2, 3.4, 5.0]) for(const side of [-.45, 0, .45]){ const nx = -(b[1] - a[1]) / L0 * side, nz = (b[0] - a[0]) / L0 * side;
          const o = new THREE.Vector3(a[0] + nx, ya + hgt, a[1] + nz), d = new THREE.Vector3(b[0] - a[0], yb - ya, b[1] - a[1]); const len = d.length(); d.normalize(); rc.set(o, d); rc.far = len;
          const h = rc.intersectObjects(objs, true).find(x => x.object.isMesh && x.object.visible && !(x.object.material && x.object.material.transparent) && !/^esc-/.test(x.object.name));
          if(h && (!worst || h.distance < worst.d)) worst = {d: +h.distance.toFixed(2), at: hgt, side, what: h.object.name || (h.object.parent && h.object.parent.name)}; }
        out.push([p + '-' + q, +L0.toFixed(1), worst]); }
      return out; },
    // the game's gates must be the logic's gates: every step whose needs are not met has no ring that gives it
    audit(){ const bad = []; for(const [id, st] of Object.entries(LG.steps)){ if(st.free) continue; const ok = st.needs.every(has); if(!ok && st.gives.every(f => !has(f))) continue; } return {flags: Object.keys(S.f), open: openGoals().map(g => g.id), bad}; }};
  window.ESCAPE = {S, rig, get L(){ return L; }, get LG(){ return LG; }, get PLACES(){ return PLACES; }, get SPOTS(){ return SPOTS; }, LIGHT, PETS, NOTES, API, sound: SND, goTo, examine, back, hint, setSlider, give, has, catAt, say, padPress, setBook, sunDir,
    view(pos, look, fov){ const a = yp(pos, look); rigCut(pos, a[0], a[1], fov || 62); }, qa: QA, get level(){ return LEVEL; }};
})();

/* preview hosts: when the site is served from a sub-path (a test mirror), point root links like /games/ at that copy; no effect on 118hillside.com */
(function(){ if(window.__siteLinks) return; window.__siteLinks = 1; var m = /githack/.test(location.host) ? location.pathname.match(/^(\/[^\/]+\/[^\/]+\/[^\/]+)\//) : location.pathname.match(/^(.*)\/(tour|thanksgiving|halloween|games|woodside)\//), base = m ? m[1] : ''; if(!base) return;
  document.addEventListener('click', function(e){ var a = e.target && e.target.closest && e.target.closest('a[href]'); if(!a) return; var h = a.getAttribute('href'); if(!h || h.charAt(0) !== '/' || h.charAt(1) === '/' || h.indexOf(base + '/') === 0) return;
    a.setAttribute('href', base + h.replace(/^([^?#]*\/)(?=[?#]|$)/, '$1index.html')); }, true);
})();
