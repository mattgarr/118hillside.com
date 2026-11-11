/* Where's Snowball? (r31): daily hide-and-seek inside the 3D model of 118 Hillside Drive.
   Loaded by tour/index.html only on ?snowball=1; talks to the engine through window.HILLSIDE.
   Snowball hides somewhere new every day (seeded by the date). More paws = closer. After the daily find he hides again, anywhere. */
(function(){
  'use strict';
  const H = window.HILLSIDE; if(!H || window.FINDCAT) return;
  const THREE = H.THREE, $ = s => document.querySelector(s);
  const ga = (n, p) => { try{ window.gtag && gtag('event', n, p || {}); }catch(e){} };
  const store = {get(k){ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } }, set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const fmtT = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const rng = seed => { let s = (Math.abs(seed | 0) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const now = new Date(), DAY = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const dayNum = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  const MONTH = now.getMonth() + 1, WEAR = MONTH === 12 ? 'scarfRed' : MONTH === 11 ? 'scarfGreen' : (MONTH <= 2 ? 'scarfBlue' : null);

  /* ---------- rooms (tour stops you can stand in) ---------- */
  const SKIP = new Set(['intro', 'street', 'dusk']);
  const ROOMS = H.STOPS.map((s, i) => ({s, i})).filter(q => !SKIP.has(q.s.id));
  const NAME = {garage: 'Garage', porch: 'Front porch', entry: 'Entry', living: 'Living room', kitchen: 'Kitchen', great: 'Dining room', mainbeds: 'Bedroom hall', stairs: 'Stairs', loft: 'Loft', primary: 'Primary bedroom', pbath: 'Primary bath', balcony: 'Balcony', lower: 'Downstairs bedrooms', lounge: 'Bonus lounge', terrace: 'Terrace', yard: 'Under the oak'};
  const nameOf = s => NAME[s.id] || s.t;

  /* ---------- finding a hiding spot: look out from a room's viewpoint, land on a floor or a piece of furniture ---------- */
  const rc = new THREE.Raycaster(); rc.camera = H.camera;
  const shown = o => { for(let p = o; p; p = p.parent) if(!p.visible) return false; return true; };
  const _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
  function castSpot(stop, R){ const from = new THREE.Vector3(...stop.pos), look = new THREE.Vector3(...stop.look), base = Math.atan2(look.x - from.x, look.z - from.z);
    for(let k = 0; k < 60; k++){ const yaw = base + (R() * 2 - 1) * Math.PI, pitch = -(.16 + R() * .5), dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      rc.set(from, dir); rc.far = 24; let hits; try{ hits = rc.intersectObjects(H.scene.children, true); }catch(e){ continue; }
      const h = hits.find(q => q.object.isMesh && shown(q.object) && !/^(esc-|find-)/.test(q.object.name) && !(q.object.material && q.object.material.transparent && q.object.material.opacity < .6));
      if(!h || !h.face || h.distance < 5 || h.distance > 22) continue;
      _n.copy(h.face.normal).applyMatrix3(_m3.getNormalMatrix(h.object.matrixWorld)).normalize();
      if(_n.y < .75 || h.point.y > from.y - 1.6 || h.point.y < from.y - 7.5) continue;
      // room to sit: nothing right above the spot
      rc.set(new THREE.Vector3(h.point.x, h.point.y + .15, h.point.z), new THREE.Vector3(0, 1, 0)); rc.far = 1.7; let up = []; try{ up = rc.intersectObjects(H.scene.children, true).filter(q => q.object.isMesh && shown(q.object)); }catch(e){}
      if(up.length) continue;
      return {p: h.point.clone(), on: h.point.y > (from.y - 4.2)}; }
    return null; }
  const nearRoom = (p, fallback) => { let best = null; for(const r of ROOMS){ if(Math.abs((r.s.pos[1] - 5) - p.y) > 3.2) continue; const d = Math.hypot(r.s.pos[0] - p.x, r.s.pos[2] - p.z); if(!best || d < best.d) best = {r, d}; } return best ? best.r : fallback; };
  function chooseSpot(R){ for(let t = 0; t < 12; t++){ const room = ROOMS[Math.floor(R() * ROOMS.length)], sp = castSpot(room.s, R); if(sp) return Object.assign(sp, {room: nearRoom(sp.p, room)}); }
    const room = ROOMS.find(q => q.s.id === 'living') || ROOMS[0]; return {p: new THREE.Vector3(room.s.look[0], room.s.pos[1] - 5, room.s.look[2]), room, on: false}; }

  /* ---------- Snowball ---------- */
  let CAT = null, SPOT = null;
  function makeCat(cb){ const done = () => { const cv = document.createElement('canvas'); cv.width = 384; cv.height = 590; const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
      const img = new Image(); img.onload = () => { cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); tex.needsUpdate = true; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SNOWBALL.svg({id: 'sbf', seed: 7, glow: true, wear: WEAR}).replace('<svg ', '<svg width="384" height="590" '));
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false, alphaTest: .05})); sp.center.set(.5, 0); sp.scale.set(1.05, 1.61, 1); sp.name = 'find-snowball'; sp.renderOrder = 5; sp.visible = false; sp.raycast = function(){};
      H.scene.add(sp); CAT = sp; cb(); };
    if(window.SNOWBALL) return done(); const s = document.createElement('script'); s.src = '../assets/snowball.js?v=31'; s.onload = done; document.head.appendChild(s); }
  function hide(R){ SPOT = chooseSpot(R); CAT.position.copy(SPOT.p); CAT.visible = true; CAT.scale.set(1.05, 1.61, 1); S.t0 = performance.now(); S.found = false; S.calls = 0; S.hotAt = 0; ga('find_hide', {room: SPOT.room.s.id, daily: S.daily}); }

  /* ---------- sound ---------- */
  let AC = null; const ac = () => { try{ AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if(AC.state === 'suspended') AC.resume(); }catch(e){} return AC; };
  function meow(vol){ const a = ac(); if(!a || S.muted) return; const t = a.currentTime, o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'sine'; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.2;
    o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(840, t + .16); o.frequency.linearRampToValueAtTime(430, t + .55); o2.frequency.setValueAtTime(1040, t); o2.frequency.linearRampToValueAtTime(860, t + .5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.22 * vol, t + .06); g.gain.exponentialRampToValueAtTime(.001, t + .62);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(a.destination); o.start(t); o2.start(t); o.stop(t + .7); o2.stop(t + .7); }
  function tone(fr, d, v, at){ const a = ac(); if(!a || S.muted) return; const t = a.currentTime + (at || 0), o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = fr; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v || .12, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + .05); }
  const fanfare = () => [523, 659, 784, 1047].forEach((fr, i) => tone(fr, i === 3 ? .7 : .22, .14, i * .12));
  function purr(){ const a = ac(); if(!a || S.muted) return; const t = a.currentTime, o = a.createOscillator(), l = a.createOscillator(), lg = a.createGain(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = 27; l.frequency.value = 24; lg.gain.value = .5; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .2); g.gain.linearRampToValueAtTime(0, t + 2.2); l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(a.destination); o.start(t); l.start(t); o.stop(t + 2.3); l.stop(t + 2.3); }

  /* ---------- state ---------- */
  const KEY = 'find.v1', SAVED = store.get(KEY) || {};
  const S = {t0: 0, found: false, daily: true, calls: 0, round: 0, muted: false, started: false, heat: 0, hotAt: 0, roomIx: Math.max(0, ROOMS.findIndex(q => q.s.id === 'entry'))};
  const dailyDone = SAVED.last === DAY;

  /* ---------- warmth ---------- */
  function heatNow(){ if(!SPOT) return 1; const c = H.camera.position, p = SPOT.p, dy = Math.abs((c.y - 5) - p.y), d = Math.hypot(c.x - p.x, c.z - p.z) + (dy > 4 ? 26 : 0);
    return d < 17 ? 5 : d < 30 ? 4 : d < 46 ? 3 : d < 64 ? 2 : 1; }
  const HEAT_TXT = ['', 'Brrr. He is far away.', 'Cold. Keep looking.', 'Getting warmer!', 'Very warm! He is close.', 'He is right here! Look all around.'];

  /* ---------- UI ---------- */
  const css = `
  html.fnd header.bar nav.tabs, html.fnd header.bar .plate, html.fnd #aboutBtn, html.fnd #card, html.fnd #labels, html.fnd #wplabels, html.fnd #ovtag, html.fnd #tod, html.fnd #viewBtn, html.fnd #hwBtn, html.fnd #tgBtn, html.fnd #phMore, html.fnd .g28pill, html.fnd #navHelp{display:none!important}
  .fnd-chip{background:rgba(251,250,247,.95);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:18px;box-shadow:0 8px 30px rgba(15,20,35,.2);color:#1f2a3a;font-family:Jost,"Avenir Next","Helvetica Neue",Arial,sans-serif}
  #fndTop{position:fixed;left:12px;right:12px;top:62px;z-index:60;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;pointer-events:none}
  #fndHeat{pointer-events:auto;padding:10px 16px 10px 14px}
  #fndHeat .paws{display:flex;gap:5px;margin-bottom:3px}
  #fndHeat .paws svg{width:30px;height:30px;fill:#d8d4ca;transition:fill .3s,transform .3s}
  #fndHeat .paws svg.on{fill:#e0862a;transform:scale(1.08)}
  #fndHeat[data-h="5"] .paws svg.on{fill:#d5412c;animation:fndB 1s ease-in-out infinite}
  #fndHeat b{display:block;font-size:16px;font-weight:500;line-height:1.2;max-width:230px}
  #fndHeat small{font-size:13px;color:#5c6575;font-variant-numeric:tabular-nums}
  @keyframes fndB{0%,100%{transform:scale(1.08)}50%{transform:scale(1.22)}}
  #fndCall{pointer-events:auto;border:0;cursor:pointer;padding:10px 16px;font:500 16px Jost,sans-serif;display:flex;align-items:center;gap:8px}
  #fndCall svg{width:26px;height:26px}
  #fndNav{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;display:grid;grid-template-columns:64px minmax(150px,1fr) 64px;align-items:center;gap:6px;padding:8px;width:min(440px,calc(100% - 24px))}
  #fndNav button{width:64px;height:64px;border-radius:16px;border:0;background:#1f2948;color:#fff;font-size:30px;cursor:pointer;display:grid;place-items:center}
  #fndNav button:active{transform:scale(.95)}
  #fndNav .rm{text-align:center}#fndNav .rm small{display:block;font-size:12.5px;color:#5c6575}#fndNav .rm b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:24px;font-weight:600;line-height:1.05}
  #fndRing{position:fixed;z-index:55;width:90px;height:90px;margin:-45px 0 0 -45px;border-radius:50%;border:3px solid #ffd77a;box-shadow:0 0 24px rgba(255,215,122,.8);pointer-events:none;opacity:0;transition:opacity .3s}
  #fndRing.on{opacity:1;animation:fndR 1.1s ease-out infinite}
  @keyframes fndR{0%{transform:scale(.5);opacity:1}100%{transform:scale(1.5);opacity:0}}
  #fndCard{position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(14,19,34,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);font-family:Jost,sans-serif;padding:16px}
  #fndCard .c{background:#fbfaf7;color:#1f2a3a;border-radius:24px;max-width:480px;width:100%;padding:22px 22px 18px;box-shadow:0 30px 90px rgba(0,0,0,.45);max-height:calc(100% - 32px);overflow:auto;text-align:center}
  #fndCard .cat{width:150px;margin:-6px auto 0}#fndCard .cat svg{width:100%;height:auto;display:block}
  #fndCard h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:clamp(34px,6vw,46px);font-weight:600;line-height:1;margin:4px 0 8px}
  #fndCard p{font-size:17px;line-height:1.4;margin:0 0 12px;color:#2b3442}
  #fndCard .how{display:flex;justify-content:center;gap:14px;margin:0 0 14px;font-size:14px;color:#5c6575}
  #fndCard .how span{display:grid;gap:4px;justify-items:center;max-width:110px}#fndCard .how svg{width:34px;height:34px}
  #fndCard .stats{display:flex;justify-content:center;gap:22px;margin:6px 0 12px}#fndCard .stats b{display:block;font-size:26px;font-weight:500}#fndCard .stats span{font-size:13px;color:#5c6575}
  #fndCard .cta{background:#1f2948;color:#f4f1e8;border-radius:16px;padding:14px;margin:12px 0 8px;text-align:left}
  #fndCard .cta b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:22px;font-weight:600;line-height:1.1;margin-bottom:4px}#fndCard .cta span{display:block;font-size:14px;color:#cdd3e2;margin-bottom:10px}
  .fndBtn{display:inline-flex;align-items:center;justify-content:center;border:1px solid #cfcabe;background:#fff;color:#1f2a3a;border-radius:999px;padding:11px 20px;font:inherit;font-size:16px;cursor:pointer;text-decoration:none;margin:4px 3px 0}
  .fndBtn.big{font-size:20px;padding:15px 30px;background:#e0862a;border-color:#e0862a;color:#fff;font-weight:500}
  .fndBtn.primary{background:#9b2c3c;border-color:#9b2c3c;color:#fff}
  #fndToast{position:fixed;left:50%;top:150px;transform:translate(-50%,-10px);z-index:90;background:#1f2948;color:#fff;font:500 16px Jost,sans-serif;padding:10px 18px;border-radius:999px;opacity:0;transition:.3s;pointer-events:none;max-width:calc(100% - 40px);text-align:center}
  #fndToast.on{opacity:1;transform:translate(-50%,0)}
  .fndConf{position:fixed;z-index:95;width:10px;height:14px;top:-20px;pointer-events:none;animation:fndFall linear forwards}
  @keyframes fndFall{to{transform:translateY(110vh) rotate(720deg)}}
  @media (max-width:560px){#fndTop{top:56px}#fndHeat .paws svg{width:25px;height:25px}#fndHeat b{font-size:14.5px;max-width:170px}#fndCall span{display:none}}
  `;
  const PAW = '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="21" rx="8" ry="6.5"/><ellipse cx="6.5" cy="13" rx="3.2" ry="4.2"/><ellipse cx="12.5" cy="7.5" rx="3.2" ry="4.4"/><ellipse cx="19.5" cy="7.5" rx="3.2" ry="4.4"/><ellipse cx="25.5" cy="13" rx="3.2" ry="4.2"/></svg>';
  const el = (tag, attrs, html) => { const e = document.createElement(tag); for(const k in (attrs || {})) e.setAttribute(k, attrs[k]); if(html != null) e.innerHTML = html; return e; };
  let ring, toastE, tt = 0;
  const toast = (m, ms) => { toastE.textContent = m; toastE.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toastE.classList.remove('on'), ms || 2200); };
  function buildUI(){ document.head.appendChild(el('style', {}, css)); document.documentElement.classList.add('fnd');
    const top = el('div', {id: 'fndTop'}, `<div class="fnd-chip" id="fndHeat" data-h="1" role="status" aria-live="polite"><div class="paws">${PAW.repeat(5)}</div><b id="fndTxt">Where is Snowball?</b><small id="fndTime">0:00</small></div>
      <button class="fnd-chip" id="fndCall" type="button" aria-label="Call Snowball"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 10v4h3l5 4V6L7 10H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg><span>Call him</span></button>`);
    document.body.appendChild(top);
    const nav = el('div', {id: 'fndNav', class: 'fnd-chip'}, `<button type="button" id="fndPrev" aria-label="Previous room">‹</button><div class="rm"><small>You are in the</small><b id="fndRoom"></b></div><button type="button" id="fndNext" aria-label="Next room">›</button>`);
    document.body.appendChild(nav);
    ring = el('div', {id: 'fndRing'}); document.body.appendChild(ring); toastE = el('div', {id: 'fndToast', role: 'status'}); document.body.appendChild(toastE);
    $('#fndPrev').onclick = () => go(-1); $('#fndNext').onclick = () => go(1); $('#fndCall').onclick = call; }
  function go(d){ S.roomIx = (S.roomIx + d + ROOMS.length) % ROOMS.length; const r = ROOMS[S.roomIx]; H.showStop(r.i); $('#fndRoom').textContent = nameOf(r.s); tone(d > 0 ? 440 : 392, .08, .06);
    clearTimeout(go.t); go.t = setTimeout(() => { if(!S.found && S.started) meow(heatNow() / 5); }, 1500); }
  function call(){ if(S.found || !S.started) return; S.calls++; const h = heatNow(); meow(h / 5); ga('find_call', {heat: h});
    toast(h === 5 ? 'Meow! That was close by.' : h >= 3 ? 'A faint meow. Getting warmer.' : 'You can barely hear him. Try another room.');
    if(h === 5){ hop(); showRing(2600); } }
  function hop(){ if(reduce || !CAT) return; const y0 = SPOT.p.y, t0 = performance.now(); (function f(){ const k = (performance.now() - t0) / 480; if(k >= 1 || S.found){ CAT.position.y = y0; return; } CAT.position.y = y0 + Math.sin(k * Math.PI) * .55; requestAnimationFrame(f); })(); }
  let ringUntil = 0; const showRing = ms => { ringUntil = performance.now() + ms; };

  /* ---------- picking ---------- */
  const _v = new THREE.Vector3();
  function catScreen(dy){ _v.copy(SPOT.p); _v.y += dy; const d = H.camera.position.distanceTo(_v); _v.project(H.camera); if(_v.z > 1) return null; const r = H.canvas.getBoundingClientRect();
    return {x: r.left + (_v.x + 1) / 2 * r.width, y: r.top + (1 - _v.y) / 2 * r.height, d, pxPerFt: r.height / (2 * Math.tan(H.camera.fov * Math.PI / 360) * d)}; }
  H.hooks.click = (cx, cy) => { if(!S.started || S.found || !SPOT) return false; const s = catScreen(.8); if(!s) return false;
    const rad = Math.max(46, s.pxPerFt * 1.0); if(Math.hypot(s.x - cx, s.y - cy) > rad) return false;
    let h = null; try{ h = H.pick(cx, cy); }catch(e){} if(h && h.distance < s.d - 2.2) return false;   // something solid is in front of him
    found(); return true; };

  /* ---------- loop ---------- */
  function frame(){ requestAnimationFrame(frame); if(!S.started || !SPOT) return; const t = performance.now();
    if(!S.found){ if(t - (frame.t || 0) > 300){ frame.t = t; const h = heatNow(); if(h !== S.heat){ S.heat = h; const box = $('#fndHeat'); box.dataset.h = h; box.querySelectorAll('.paws svg').forEach((p, i) => p.classList.toggle('on', i < h)); $('#fndTxt').textContent = HEAT_TXT[h]; if(h === 5 && !S.hotAt) S.hotAt = t; if(h < 5) S.hotAt = 0; }
        $('#fndTime').textContent = fmtT((t - S.t0) / 1000);
        if(S.hotAt && t - S.hotAt > 22000 && t > ringUntil){ S.hotAt = t - 12000; showRing(2400); hop(); meow(1); } }   // a little help for small players
      const on = t < ringUntil, s = on && catScreen(.8); if(s && Math.abs(s.x) < 5000){ ring.style.left = s.x + 'px'; ring.style.top = s.y + 'px'; ring.classList.add('on'); } else ring.classList.remove('on'); } }

  /* ---------- found ---------- */
  function confetti(){ if(reduce) return; const cols = ['#e0862a', '#9b2c3c', '#2d5a3e', '#e8b84a', '#3b6fd8', '#f6f5f1']; for(let i = 0; i < 70; i++){ const c = el('i', {class: 'fndConf'}); c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length]; c.style.animationDuration = 1.6 + Math.random() * 1.8 + 's'; c.style.animationDelay = Math.random() * .5 + 's'; document.body.appendChild(c); setTimeout(() => c.remove(), 4200); } }
  function found(){ S.found = true; S.round++; ring.classList.remove('on'); const secs = (performance.now() - S.t0) / 1000; meow(1); setTimeout(purr, 500); fanfare(); confetti();
    const sv = store.get(KEY) || {}; let first = false;
    if(S.daily && sv.last !== DAY){ first = true; const y = new Date(now); y.setDate(y.getDate() - 1); const yk = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
      sv.streak = sv.last === yk ? (sv.streak || 0) + 1 : 1; sv.last = DAY; sv.today = secs; }
    sv.total = (sv.total || 0) + 1; store.set(KEY, sv); ga('find_found', {secs: Math.round(secs), daily: S.daily, calls: S.calls, room: SPOT.room.s.id});
    // he hops out and the camera turns to him
    const c = H.camera.position.clone(), p = SPOT.p; H.anim = null; H.flyTo(c.toArray(), [p.x, p.y + .8, p.z], 'look', .7);
    if(!reduce){ const t0 = performance.now(); (function f(){ const k = Math.min(1, (performance.now() - t0) / 900); CAT.position.y = p.y + Math.abs(Math.sin(k * Math.PI * 2)) * .5 * (1 - k); const s = 1 + .25 * Math.sin(k * Math.PI); CAT.scale.set(1.05 * s, 1.61 * s, 1); if(k < 1) requestAnimationFrame(f); })(); }
    setTimeout(() => foundCard(secs, sv, first), 1700); }
  function foundCard(secs, sv, first){ const where = nameOf(SPOT.room.s).toLowerCase(), art = /^(under|downstairs)/.test(where) ? '' : 'the ';
    const c = el('div', {id: 'fndCard'}, `<div class="c"><div class="cat">${SNOWBALL.svg({id: 'sbw', seed: 7, wear: WEAR})}</div><h2>You found him!</h2>
      <p>Snowball was hiding ${SPOT.on ? 'up on something' : 'on the floor'} in ${art}${esc(where)}.${first ? ' He hides somewhere new every day.' : ''}</p>
      <div class="stats"><div><b>${fmtT(secs)}</b><span>${S.daily ? "today's time" : 'this round'}</span></div>${sv.streak > 1 ? `<div><b>${sv.streak}</b><span>days in a row</span></div>` : ''}<div><b>${sv.total}</b><span>${sv.total === 1 ? 'find' : 'finds'}</span></div></div>
      <button class="fndBtn big" type="button" id="fndAgain">Hide again!</button>
      <div class="cta"><b>His hiding spots are real.</b><span>118 Hillside Drive is for sale in Woodside. Come see the rooms Snowball likes best.</span><a class="fndBtn primary" href="/#contact" id="fndSee">See it in person</a></div>
      <button class="fndBtn" type="button" id="fndShare">Share</button><a class="fndBtn" href="/games/">More games</a><a class="fndBtn" href="/tour/">Explore the house</a></div>`);
    document.body.appendChild(c); $('#fndAgain').focus();
    $('#fndSee').onclick = () => ga('find_cta', {cta: 'see_in_person'});
    $('#fndAgain').onclick = () => { c.remove(); S.daily = false; hide(rng(Math.floor(Math.random() * 1e9))); toast('Ready or not! He is hiding somewhere new.'); setTimeout(() => meow(heatNow() / 5), 900); };
    $('#fndShare').onclick = async () => { const url = 'https://118hillside.com/games/snowball/', text = S.daily ? `I found Snowball in ${fmtT(secs)} today. He hides somewhere new in this house every day. Can you beat me?` : `I found Snowball the cat hiding in ${art}${where} at 118 Hillside Drive. Your turn.`; ga('find_share');
      try{ if(navigator.share){ await navigator.share({title: "Where's Snowball?", text, url}); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
      try{ await navigator.clipboard.writeText(text + ' ' + url); toast('Link copied.'); }catch(e){ toast(url); } }; }

  /* ---------- start ---------- */
  function startCard(){ const sv = store.get(KEY) || {};
    const c = el('div', {id: 'fndCard'}, `<div class="c"><div class="cat">${SNOWBALL.svg({id: 'sbs', seed: 7, wear: WEAR})}</div><h2>Where's Snowball?</h2>
      <p>Snowball is hiding somewhere in the house. ${dailyDone ? 'You found today’s spot already, so he is hiding somewhere else.' : 'He picks a new spot every day.'}</p>
      <div class="how"><span><svg viewBox="0 0 32 32" fill="#e0862a">${PAW.replace(/<\/?svg[^>]*>/g, '')}</svg>More paws means you are closer</span><span><svg viewBox="0 0 24 24" fill="none" stroke="#1f2a3a" stroke-width="1.8" stroke-linecap="round"><path d="M4 10v4h3l5 4V6L7 10H4z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>Call him and listen for a meow</span><span><svg viewBox="0 0 24 24" fill="none" stroke="#1f2a3a" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="#1f2a3a"/></svg>Tap him when you see him</span></div>
      <button class="fndBtn big" type="button" id="fndGo">Ready or not!</button>${sv.streak > 1 && sv.last ? `<p style="font-size:14px;color:#5c6575;margin:12px 0 0">You have found him ${sv.streak} days in a row.</p>` : ''}</div>`);
    document.body.appendChild(c); $('#fndGo').focus();
    $('#fndGo').onclick = () => { c.remove(); ac(); S.started = true; S.daily = !dailyDone; hide(S.daily ? rng(dayNum * 7919 + 13) : rng(Math.floor(Math.random() * 1e9))); S.roomIx--; go(1); ga('find_start', {daily: S.daily}); }; }
  function boot(){ try{ H.setTOD('midday'); }catch(e){} makeCat(() => { buildUI(); requestAnimationFrame(frame);
    const intro = document.getElementById('intro28'); if(intro){ const mo = new MutationObserver(() => { if(!document.getElementById('intro28')){ mo.disconnect(); startCard(); } }); mo.observe(document.body, {childList: true}); } else startCard(); }); }
  const ld = document.getElementById('loading');
  if(ld && !ld.classList.contains('done')) new MutationObserver((m, o) => { if(ld.classList.contains('done')){ o.disconnect(); setTimeout(boot, 300); } }).observe(ld, {attributes: true, attributeFilter: ['class']}); else setTimeout(boot, 300);
  window.FINDCAT = {S, spot: () => SPOT, rooms: ROOMS.map(r => r.s.id), hideIn(id, seed){ const room = ROOMS.find(q => q.s.id === id), sp = castSpot(room.s, rng(seed || 5)); if(!sp) return null; SPOT = Object.assign(sp, {room}); CAT.position.copy(SPOT.p); CAT.visible = true; S.found = false; S.t0 = performance.now(); return SPOT.p.toArray(); }, found, heatNow, go};
})();
