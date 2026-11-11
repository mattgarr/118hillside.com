/* Where's Snowball? (r32): follow the trail. Played inside the 3D model of 118 Hillside Drive (the house as it is today).
   Loaded by tour/index.html only on ?snowball=1; talks to the engine through window.HILLSIDE.
   Story: dinner is ready and Snowball is missing. He has left four things around the house. Each one you find comes with a clue
   about where he went next; pick the right room from three photos, look around it, find the next thing, and at the end, find him.
   The first trail of the day is the same for everyone (seeded by the date); after that he sets a new one each time. */
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
  const now = new Date(), ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), DAY = ymd(now);
  const dayNum = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5);
  const MONTH = now.getMonth() + 1, WEAR = MONTH === 12 ? 'scarfRed' : MONTH === 11 ? 'scarfGreen' : (MONTH <= 2 ? 'scarfBlue' : null);

  /* ---------- the rooms on the trail: a real photo of each, and the clue that points to it ---------- */
  const ROOM = {
    entry:   {name: 'Entry', photo: 'entry-800.jpg'},
    kitchen: {name: 'Kitchen', photo: 'kitchen-800.jpg', clue: 'He smelled something cooking.'},
    living:  {name: 'Living room', photo: 'living-room-800.jpg', clue: 'He loves the rug under the big wood beams.'},
    great:   {name: 'Dining room', photo: 'dining-800.jpg', clue: 'He likes to sit by the dining table and watch the birds.'},
    lounge:  {name: 'Bonus lounge', photo: 'rec-room-800.jpg', clue: 'Movie time! He went downstairs to the big TV.'},
    primary: {name: 'Primary bedroom', photo: 'primary-bedroom-800.jpg', clue: 'Up the stairs, to the biggest bed in the house.'},
    pbath:   {name: 'Primary bath', photo: 'primary-bath-800.jpg', clue: 'He likes a drink from the bathroom faucet, upstairs.'},
    balcony: {name: 'Balcony', photo: 'hills-view-800.jpg', clue: 'He went out to watch the sun go down over the hills.'},
    lower:   {name: 'Office', photo: 'office-800.jpg', clue: 'A quiet spot downstairs, near the desk under the skylight.'},
    terrace: {name: 'Terrace', photo: 'rear-yard-800.jpg', clue: 'Outside! Under the giant oak tree.'}};
  const POOL = Object.keys(ROOM).filter(k => k !== 'entry' && H.STOPS.some(s => s.id === k));
  const stopOf = id => H.STOPS.find(s => s.id === id), stopIx = id => H.STOPS.findIndex(s => s.id === id);

  /* ---------- the four things he left ---------- */
  const ITEMS = [
    {id: 'paws', name: 'Muddy paw prints', line: 'Muddy paw prints! He came in through the front doors.', w: 1.9, h: 1.2,
     svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 120">${[[40, 78, -18], [98, 44, 8], [152, 80, 24]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})" fill="#6b4a2c"><ellipse cy="10" rx="17" ry="14"/><ellipse cx="-19" cy="-9" rx="7" ry="9"/><ellipse cx="-7" cy="-20" rx="7" ry="9.5"/><ellipse cx="7" cy="-20" rx="7" ry="9.5"/><ellipse cx="19" cy="-9" rx="7" ry="9"/></g>`).join('')}</svg>`},
    {id: 'mouse', name: 'His toy mouse', line: 'His toy mouse. He drops it when something more interesting comes along.', w: 1.5, h: 1.0,
     svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 100"><path d="M118 70 C150 74 150 40 128 44" fill="none" stroke="#c96f8a" stroke-width="5" stroke-linecap="round"/><ellipse cx="72" cy="64" rx="50" ry="27" fill="#8f96a3"/><ellipse cx="72" cy="58" rx="44" ry="19" fill="#a6adb9"/><circle cx="44" cy="38" r="15" fill="#8f96a3"/><circle cx="44" cy="38" r="9" fill="#f2a7bd"/><circle cx="70" cy="34" r="13" fill="#8f96a3"/><circle cx="70" cy="34" r="7.5" fill="#f2a7bd"/><circle cx="34" cy="62" r="4.5" fill="#1b1b1b"/><circle cx="24" cy="70" r="5" fill="#e8809c"/><path d="M26 72 L4 66 M26 74 L4 80" stroke="#444" stroke-width="2" stroke-linecap="round"/><path d="M60 78 q12 8 26 0" stroke="#737a87" stroke-width="3" fill="none" stroke-dasharray="4 4"/></svg>`},
    {id: 'yarn', name: 'His ball of yarn', line: 'His yarn, unrolled halfway across the floor.', w: 1.7, h: 1.2,
     svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 120"><path d="M96 92 C120 112 150 86 166 104" fill="none" stroke="#c7372f" stroke-width="6" stroke-linecap="round"/><circle cx="62" cy="62" r="46" fill="#c7372f"/><g fill="none" stroke="#8e1f1b" stroke-width="4" stroke-linecap="round"><path d="M22 46 C46 30 82 30 104 48"/><path d="M18 66 C46 48 84 50 108 68"/><path d="M26 88 C50 70 82 74 100 92"/><path d="M44 20 C36 50 40 84 56 106"/><path d="M70 16 C60 46 64 84 80 104"/></g><circle cx="46" cy="42" r="10" fill="#e96a5f" opacity=".6"/></svg>`},
    {id: 'feather', name: 'His feather toy', line: 'His feather toy. It is still warm. He must be close!', w: 1.7, h: 1.25,
     svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 125"><path d="M8 116 L96 58" stroke="#c9a86a" stroke-width="7" stroke-linecap="round"/>${[[-30, '#1fa39a'], [0, '#f2b631'], [30, '#e2583e']].map(([r, c]) => `<g transform="translate(96 58) rotate(${r})"><path d="M0 0 C22 -12 54 -14 70 -4 C54 8 22 10 0 0Z" fill="${c}"/><path d="M0 0 L66 -4" stroke="#fff" stroke-width="2" opacity=".7"/></g>`).join('')}<circle cx="96" cy="58" r="8" fill="#7a5a2c"/></svg>`}];

  /* ---------- finding a place to put something: look out from a room's viewpoint, land on a floor or a piece of furniture ---------- */
  const rc = new THREE.Raycaster(); rc.camera = H.camera;
  const shown = o => { for(let p = o; p; p = p.parent) if(!p.visible) return false; return true; };
  const _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
  function castSpot(stop, R, far){ const from = new THREE.Vector3(...stop.pos), look = new THREE.Vector3(...stop.look), base = Math.atan2(look.x - from.x, look.z - from.z);
    for(let k = 0; k < 70; k++){ const yaw = base + (R() * 2 - 1) * Math.PI, pitch = -(.2 + R() * .45), dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      rc.set(from, dir); rc.far = far || 18; let hits; try{ hits = rc.intersectObjects(H.scene.children, true); }catch(e){ continue; }
      const h = hits.find(q => q.object.isMesh && shown(q.object) && !/^(esc-|find-)/.test(q.object.name));   // glass counts as solid: nothing lands in the next room
      if(!h || !h.face || h.distance < 5 || (h.object.material && h.object.material.transparent && h.object.material.opacity < .6)) continue;
      _n.copy(h.face.normal).applyMatrix3(_m3.getNormalMatrix(h.object.matrixWorld)).normalize();
      if(_n.y < .75 || h.point.y > from.y - 1.6 || h.point.y < from.y - 7.5) continue;
      rc.set(new THREE.Vector3(h.point.x, h.point.y + .15, h.point.z), new THREE.Vector3(0, 1, 0)); rc.far = 1.7; let up = []; try{ up = rc.intersectObjects(H.scene.children, true).filter(q => q.object.isMesh && shown(q.object)); }catch(e){}
      if(up.length) continue; return h.point.clone(); }
    const d = look.clone().sub(from).setY(0).normalize(); return new THREE.Vector3(from.x + d.x * 7, from.y - 5, from.z + d.z * 7); }

  /* ---------- sprites ---------- */
  function svgSprite(svg, w, h, name){ const cv = document.createElement('canvas'); cv.width = 384; cv.height = Math.round(384 * h / w); const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    const img = new Image(); img.onload = () => { cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); tex.needsUpdate = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', `<svg width="${cv.width}" height="${cv.height}" `));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false, alphaTest: .05})); sp.center.set(.5, 0); sp.scale.set(w, h, 1); sp.name = name; sp.renderOrder = 5; sp.visible = false; sp.raycast = function(){};
    H.scene.add(sp); return sp; }
  let CAT = null; const SPR = {};
  function makeSprites(cb){ const done = () => { CAT = svgSprite(SNOWBALL.svg({id: 'sbf', seed: 7, glow: true, wear: WEAR}), 1.05, 1.61, 'find-snowball'); for(const it of ITEMS) SPR[it.id] = svgSprite(it.svg, it.w, it.h, 'find-' + it.id); cb(); };
    if(window.SNOWBALL) return done(); const s = document.createElement('script'); s.src = '../assets/snowball.js?v=32'; s.onload = done; document.head.appendChild(s); }

  /* ---------- sound ---------- */
  let AC = null; const ac = () => { try{ AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if(AC.state === 'suspended') AC.resume(); }catch(e){} return AC; };
  function meow(vol){ const a = ac(); if(!a) return; const t = a.currentTime, o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'sine'; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.2;
    o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(840, t + .16); o.frequency.linearRampToValueAtTime(430, t + .55); o2.frequency.setValueAtTime(1040, t); o2.frequency.linearRampToValueAtTime(860, t + .5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.22 * vol, t + .06); g.gain.exponentialRampToValueAtTime(.001, t + .62);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(a.destination); o.start(t); o2.start(t); o.stop(t + .7); o2.stop(t + .7); }
  function tone(fr, d, v, at){ const a = ac(); if(!a) return; const t = a.currentTime + (at || 0), o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = fr; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v || .12, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + .05); }
  const ding = () => { tone(784, .18, .12); tone(1175, .3, .1, .1); }, nope = () => tone(196, .25, .1), fanfare = () => [523, 659, 784, 1047].forEach((fr, i) => tone(fr, i === 3 ? .7 : .22, .14, i * .12));
  function purr(){ const a = ac(); if(!a) return; const t = a.currentTime, o = a.createOscillator(), l = a.createOscillator(), lg = a.createGain(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = 27; l.frequency.value = 24; lg.gain.value = .5; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .2); g.gain.linearRampToValueAtTime(0, t + 2.2); l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(a.destination); o.start(t); l.start(t); o.stop(t + 2.3); l.stop(t + 2.3); }

  /* ---------- state: a trail is five rooms; the first four hold a thing, the fifth holds Snowball ---------- */
  const KEY = 'find.v2';
  const S = {started: false, daily: true, step: 0, trail: [], spots: [], t0: 0, wrong: 0, helps: 0, done: false, stuckAt: 0, picking: false};
  const dailyDone = (store.get(KEY) || {}).last === DAY;
  function newTrail(R){ const pool = POOL.slice(); for(let i = pool.length - 1; i > 0; i--){ const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    S.trail = ['entry'].concat(pool.slice(0, 4)); S.spots = []; S.step = 0; S.wrong = 0; S.helps = 0; S.done = false; S.R = R;
    for(const k in SPR) SPR[k].visible = false; CAT.visible = false; CAT.scale.set(1.05, 1.61, 1);
    for(const k in ROOM){ const im = new Image(); im.src = '../images/' + ROOM[k].photo; } }   // warm the photo choices
  const target = () => S.step < 4 ? SPR[ITEMS[S.step].id] : CAT;
  function enterRoom(first){ const id = S.trail[S.step], st = stopOf(id); H.showStop(stopIx(id)); S.picking = false;
    const place = () => { const p = castSpot(st, S.R, S.step < 4 ? 15 : 20); S.spots[S.step] = p; const t = target(); t.position.copy(p); if(S.step < 4) t.position.y += .08; t.visible = true; S.stuckAt = performance.now(); prompt(); if(S.step === 4) setTimeout(() => meow(.9), 600); };
    setTimeout(place, first ? 300 : 1700); prompt(true); }

  /* ---------- UI ---------- */
  const css = `
  html.fnd #mini, html.fnd #cv27, html.fnd header.bar nav.tabs, html.fnd header.bar .plate, html.fnd #aboutBtn, html.fnd #card, html.fnd #labels, html.fnd #wplabels, html.fnd #ovtag, html.fnd #tod, html.fnd #viewBtn, html.fnd #hwBtn, html.fnd #tgBtn, html.fnd #phMore, html.fnd .g28pill, html.fnd #navHelp{display:none!important}
  .fnd-chip{background:rgba(251,250,247,.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:18px;box-shadow:0 8px 30px rgba(15,20,35,.2);color:#1f2a3a;font-family:Jost,"Avenir Next","Helvetica Neue",Arial,sans-serif}
  #fndTop{position:fixed;left:12px;right:12px;top:62px;z-index:60;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;pointer-events:none}
  #fndTray{pointer-events:auto;padding:10px 12px}
  #fndTray small{display:block;font-size:13px;color:#5c6575;margin-bottom:6px}
  #fndTray .slots{display:flex;gap:6px;align-items:center}
  #fndTray .slot{width:50px;height:44px;border-radius:12px;background:#ece9e1;display:grid;place-items:center;border:2px dashed #cfcabe;transition:.3s}
  #fndTray .slot svg{width:40px;height:34px;opacity:.22;filter:grayscale(1)}
  #fndTray .slot.got{background:#fff;border:2px solid #e0862a}#fndTray .slot.got svg{opacity:1;filter:none}
  #fndTray .slot.now{border-color:#e0862a;animation:fndB 1.2s ease-in-out infinite}
  #fndTray .slot.cat{width:50px;height:50px;border-radius:50%;overflow:hidden;align-items:end}#fndTray .slot.cat svg{width:44px;height:auto;margin-bottom:-4px}
  @keyframes fndB{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
  #fndHelp{pointer-events:auto;border:0;cursor:pointer;padding:10px 16px;font:500 16px Jost,sans-serif;display:flex;align-items:center;gap:8px}
  #fndHelp svg{width:26px;height:26px;fill:#e0862a}
  #fndBar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;display:grid;grid-template-columns:62px minmax(150px,1fr) 62px;align-items:center;gap:8px;padding:8px;width:min(520px,calc(100% - 24px))}
  #fndBar button{width:62px;height:62px;border-radius:16px;border:0;background:#1f2948;color:#fff;font-size:28px;cursor:pointer;display:grid;place-items:center}
  #fndBar button:active{transform:scale(.95)}
  #fndBar .rm{text-align:center}#fndBar .rm small{display:block;font-size:13px;color:#5c6575}#fndBar .rm b{display:block;font-size:17px;font-weight:500;line-height:1.25}
  #fndRing{position:fixed;z-index:55;width:96px;height:96px;margin:-48px 0 0 -48px;border-radius:50%;border:3px solid #ffd77a;box-shadow:0 0 24px rgba(255,215,122,.9),inset 0 0 18px rgba(255,215,122,.5);pointer-events:none;opacity:0;transition:opacity .3s}
  #fndRing.on{opacity:1;animation:fndR 1.4s ease-in-out infinite}
  @keyframes fndR{0%,100%{transform:scale(.9)}50%{transform:scale(1.12)}}
  #fndCard{position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(14,19,34,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);font-family:Jost,sans-serif;padding:14px}
  #fndCard .c{background:#fbfaf7;color:#1f2a3a;border-radius:24px;max-width:560px;width:100%;padding:20px 20px 18px;box-shadow:0 30px 90px rgba(0,0,0,.45);max-height:calc(100% - 28px);overflow:auto;text-align:center}
  #fndCard .cat{width:130px;margin:-4px auto 0}#fndCard .cat svg{width:100%;height:auto;display:block}
  #fndCard .thing{width:150px;margin:0 auto}#fndCard .thing svg{width:100%;height:auto;display:block}
  #fndCard h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:clamp(32px,6vw,44px);font-weight:600;line-height:1;margin:4px 0 8px}
  #fndCard p{font-size:17px;line-height:1.4;margin:0 0 12px;color:#2b3442}
  #fndCard .clue{font-family:"Caveat Brush","Marker Felt",cursive;font-size:25px;line-height:1.2;color:#2b2336;background:#fff;border:1px solid #e3e0d8;border-radius:14px;padding:10px 14px;margin:0 0 12px}
  #fndCard .q{font-size:15px;color:#5c6575;margin:0 0 8px}
  #fndCard .picks{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  #fndCard .picks button{border:3px solid transparent;border-radius:14px;padding:0;overflow:hidden;background:#fff;cursor:pointer;font:500 14.5px Jost,sans-serif;color:#1f2a3a;box-shadow:0 4px 14px rgba(0,0,0,.12)}
  #fndCard .picks img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
  #fndCard .picks span{display:block;padding:6px 4px 8px}
  #fndCard .picks button:hover{border-color:#e0862a}
  #fndCard .picks button.no{animation:fndS .4s;opacity:.45}
  #fndCard .picks button.yes{border-color:#2e7b59}
  @keyframes fndS{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
  #fndCard .steps{display:flex;justify-content:center;gap:16px;margin:0 0 14px;font-size:14px;color:#5c6575}
  #fndCard .steps span{display:grid;gap:4px;justify-items:center;max-width:120px}#fndCard .steps svg{width:54px;height:42px}
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
  @media (max-width:560px){#fndTop{top:56px}#fndTray .slot{width:40px;height:36px}#fndTray .slot svg{width:32px;height:27px}#fndTray .slot.cat{width:40px;height:40px}#fndTray .slot.cat svg{width:36px}#fndHelp span{display:none}#fndCard .picks button{font-size:13px}}
  `;
  const PAW = '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="21" rx="8" ry="6.5"/><ellipse cx="6.5" cy="13" rx="3.2" ry="4.2"/><ellipse cx="12.5" cy="7.5" rx="3.2" ry="4.4"/><ellipse cx="19.5" cy="7.5" rx="3.2" ry="4.4"/><ellipse cx="25.5" cy="13" rx="3.2" ry="4.2"/></svg>';
  const el = (tag, attrs, html) => { const e = document.createElement(tag); for(const k in (attrs || {})) e.setAttribute(k, attrs[k]); if(html != null) e.innerHTML = html; return e; };
  let ring, toastE, tt = 0;
  const toast = (m, ms) => { toastE.textContent = m; toastE.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toastE.classList.remove('on'), ms || 2200); };
  function buildUI(){ document.head.appendChild(el('style', {}, css)); document.documentElement.classList.add('fnd');
    document.body.appendChild(el('div', {id: 'fndTop'}, `<div class="fnd-chip" id="fndTray"><small id="fndGoal">Follow the trail to Snowball</small><div class="slots">${ITEMS.map(it => `<span class="slot" data-i="${it.id}" title="${esc(it.name)}">${it.svg}</span>`).join('')}<span class="slot cat" data-i="cat">${SNOWBALL.svg({id: 'sbt', seed: 7}).replace(/viewBox="[^"]+"/, 'viewBox="110 10 280 300"')}</span></div></div>
      <button class="fnd-chip" id="fndHelp" type="button" aria-label="Show me where to look">${PAW}<span>Show me</span></button>`));
    document.body.appendChild(el('div', {id: 'fndBar', class: 'fnd-chip'}, `<button type="button" id="fndL" aria-label="Turn left">↺</button><div class="rm"><small id="fndRoom"></small><b id="fndDo"></b></div><button type="button" id="fndR" aria-label="Turn right">↻</button>`));
    ring = el('div', {id: 'fndRing'}); document.body.appendChild(ring); toastE = el('div', {id: 'fndToast', role: 'status'}); document.body.appendChild(toastE);
    $('#fndL').onclick = () => turn(1); $('#fndR').onclick = () => turn(-1); $('#fndHelp').onclick = help; }
  function tray(){ document.querySelectorAll('#fndTray .slot').forEach((s, i) => { s.classList.toggle('got', i < S.step || S.done); s.classList.toggle('now', i === S.step && !S.done); }); }
  function prompt(moving){ const id = S.trail[S.step]; $('#fndRoom').textContent = 'You are ' + (/balcony|terrace/.test(id) ? 'on' : 'in') + ' the ' + ROOM[id].name.toLowerCase(); tray();
    $('#fndDo').textContent = moving ? 'Here we go…' : S.step < 4 ? 'Look around. What did Snowball leave here?' : 'He is hiding right here. Find him!'; }
  const _d = new THREE.Vector3();
  function turn(sign){ H.camera.getWorldDirection(_d); const a = Math.atan2(_d.x, _d.z) + sign * Math.PI / 3, c = H.camera.position; H.anim = null; H.flyTo(c.toArray(), [c.x + Math.sin(a) * 10, c.y - 1.6, c.z + Math.cos(a) * 10], 'look', .45); tone(330, .05, .04); }
  function help(){ if(!S.started || S.done || S.picking) return; const p = S.spots[S.step]; if(!p) return; S.helps++; ga('find_help', {step: S.step}); const c = H.camera.position; H.anim = null; H.flyTo(c.toArray(), [p.x, p.y + .6, p.z], 'look', .7); ringUntil = performance.now() + 5000; if(S.step === 4){ meow(1); hop(); } else ding(); }
  function hop(){ if(reduce) return; const t = target(), y0 = t.position.y, t0 = performance.now(); (function f(){ const k = (performance.now() - t0) / 480; if(k >= 1){ t.position.y = y0; return; } t.position.y = y0 + Math.sin(k * Math.PI) * .5; requestAnimationFrame(f); })(); }
  let ringUntil = 0;

  /* ---------- picking in the 3D view ---------- */
  const _v = new THREE.Vector3();
  function scr(dy){ const p = S.spots[S.step]; if(!p) return null; _v.copy(p); _v.y += dy; const d = H.camera.position.distanceTo(_v); _v.project(H.camera); if(_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) return null; const r = H.canvas.getBoundingClientRect();
    return {x: r.left + (_v.x + 1) / 2 * r.width, y: r.top + (1 - _v.y) / 2 * r.height, d, px: r.height / (2 * Math.tan(H.camera.fov * Math.PI / 360) * d)}; }
  H.hooks.click = (cx, cy) => { if(!S.started || S.done || S.picking || !target().visible) return true; const s = scr(S.step < 4 ? .5 : .8); if(!s) return true;   // every tap is ours: no walking off mid-game
    if(Math.hypot(s.x - cx, s.y - cy) > Math.max(52, s.px * 1.1)) return true;
    let h = null; try{ h = H.pick(cx, cy); }catch(e){} if(h && h.distance < s.d - 2.4) return true;
    if(S.step < 4) gotItem(); else found(); return true; };
  let anchor = null, flying = true;   // stay where the game put you: look around freely, but no drifting into furniture
  function hold(){ if(H.anim){ flying = true; return; } if(flying){ flying = false; anchor = H.camera.position.clone(); return; } if(anchor && H.camera.position.distanceTo(anchor) > .35) H.camera.position.copy(anchor); }
  function frame(){ requestAnimationFrame(frame); try{ if(S.started) hold(); }catch(e){} if(!S.started || S.done) return; const t = performance.now(), tg = target();
    if(tg.visible && !reduce && S.step < 4) tg.position.y = S.spots[S.step].y + .08 + Math.abs(Math.sin(t / 420)) * .22;   // the thing bobs so it catches the eye
    if(!S.picking && tg.visible && S.stuckAt && t - S.stuckAt > 26000){ S.stuckAt = t - 10000; ringUntil = t + 3500; if(S.step === 4){ meow(1); hop(); } }   // gentle nudge for small players
    const s = t < ringUntil && !S.picking && scr(S.step < 4 ? .5 : .8); if(s){ ring.style.left = s.x + 'px'; ring.style.top = s.y + 'px'; ring.classList.add('on'); } else ring.classList.remove('on'); }

  /* ---------- found a thing: the clue, and three rooms to choose from ---------- */
  function gotItem(){ const it = ITEMS[S.step], next = S.trail[S.step + 1], R = S.R; S.picking = true; ring.classList.remove('on'); ding(); SPR[it.id].visible = false; ga('find_item', {item: it.id});
    document.querySelector(`#fndTray .slot[data-i="${it.id}"]`).classList.add('got');
    const decoys = Object.keys(ROOM).filter(k => k !== next && k !== S.trail[S.step]).sort(() => R() - .5).slice(0, 2), opts = [next].concat(decoys).sort(() => R() - .5);
    const c = el('div', {id: 'fndCard'}, `<div class="c"><div class="thing">${it.svg}</div><h2>${esc(it.name)}</h2><p>${esc(it.line)}</p>
      <div class="clue">${esc(ROOM[next].clue)}</div><p class="q">Where did he go?</p>
      <div class="picks">${opts.map(k => `<button type="button" data-k="${k}"><img src="../images/${ROOM[k].photo}" alt=""><span>${esc(ROOM[k].name)}</span></button>`).join('')}</div></div>`);
    document.body.appendChild(c);
    c.querySelectorAll('.picks button').forEach(b => b.onclick = () => { if(b.dataset.k !== next){ b.classList.add('no'); b.disabled = true; S.wrong++; nope(); return; }
      b.classList.add('yes'); ding(); setTimeout(() => { c.remove(); S.step++; enterRoom(false); toast(S.step === 4 ? 'This is it. He is in here somewhere!' : 'Yes! Now look around.'); }, 450); }); }

  /* ---------- found Snowball ---------- */
  function confetti(){ if(reduce) return; const cols = ['#e0862a', '#9b2c3c', '#2d5a3e', '#e8b84a', '#3b6fd8', '#f6f5f1']; for(let i = 0; i < 70; i++){ const c = el('i', {class: 'fndConf'}); c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length]; c.style.animationDuration = 1.6 + Math.random() * 1.8 + 's'; c.style.animationDelay = Math.random() * .5 + 's'; document.body.appendChild(c); setTimeout(() => c.remove(), 4200); } }
  function found(){ S.done = true; ring.classList.remove('on'); tray(); const secs = (performance.now() - S.t0) / 1000; meow(1); setTimeout(purr, 500); fanfare(); confetti();
    const sv = store.get(KEY) || {}; let first = false;
    if(S.daily && sv.last !== DAY){ first = true; const y = new Date(now); y.setDate(y.getDate() - 1); sv.streak = sv.last === ymd(y) ? (sv.streak || 0) + 1 : 1; sv.last = DAY; }
    sv.total = (sv.total || 0) + 1; store.set(KEY, sv); ga('find_found', {secs: Math.round(secs), daily: S.daily, wrong: S.wrong, helps: S.helps, room: S.trail[4]});
    const c = H.camera.position.clone(), p = S.spots[4]; H.anim = null; H.flyTo(c.toArray(), [p.x, p.y + .8, p.z], 'look', .7);
    if(!reduce){ const t0 = performance.now(); (function f(){ const k = Math.min(1, (performance.now() - t0) / 900); CAT.position.y = p.y + Math.abs(Math.sin(k * Math.PI * 2)) * .5 * (1 - k); const s = 1 + .25 * Math.sin(k * Math.PI); CAT.scale.set(1.05 * s, 1.61 * s, 1); if(k < 1) requestAnimationFrame(f); })(); }
    setTimeout(() => foundCard(secs, sv, first), 1700); }
  function foundCard(secs, sv, first){ const where = ROOM[S.trail[4]].name.toLowerCase(), perfect = !S.wrong && !S.helps;
    const c = el('div', {id: 'fndCard'}, `<div class="c"><div class="cat">${SNOWBALL.svg({id: 'sbw', seed: 7, wear: WEAR})}</div><h2>You found him!</h2>
      <p>Snowball was ${/balcony|terrace/.test(S.trail[4]) ? 'out on' : 'in'} the ${esc(where)} the whole time. Dinner is served.${perfect ? ' You never took a wrong turn.' : ''}${first ? ' He sets a new trail every day.' : ''}</p>
      <div class="stats"><div><b>${fmtT(secs)}</b><span>${S.daily ? "today's time" : 'this trail'}</span></div>${sv.streak > 1 ? `<div><b>${sv.streak}</b><span>days in a row</span></div>` : ''}<div><b>${sv.total}</b><span>${sv.total === 1 ? 'trail followed' : 'trails followed'}</span></div></div>
      <button class="fndBtn big" type="button" id="fndAgain">New trail!</button>
      <div class="cta"><b>Every room on his trail is real.</b><span>118 Hillside Drive is for sale in Woodside. Come walk the trail yourself.</span><a class="fndBtn primary" href="/#contact" id="fndSee">See it in person</a></div>
      <button class="fndBtn" type="button" id="fndShare">Share</button><a class="fndBtn" href="/games/">More games</a><a class="fndBtn" href="/tour/">Explore the house</a></div>`);
    document.body.appendChild(c); $('#fndAgain').focus();
    $('#fndSee').onclick = () => ga('find_cta', {cta: 'see_in_person'});
    $('#fndAgain').onclick = () => { c.remove(); S.daily = false; begin(rng(Math.floor(Math.random() * 1e9))); };
    $('#fndShare').onclick = async () => { const url = 'https://118hillside.com/games/snowball/', text = S.daily ? `I followed Snowball's trail through this house in ${fmtT(secs)} today${perfect ? ' without one wrong turn' : ''}. Can you beat me?` : `I followed Snowball the cat's trail through 118 Hillside Drive and found him. Your turn.`; ga('find_share');
      try{ if(navigator.share){ await navigator.share({title: "Where's Snowball?", text, url}); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
      try{ await navigator.clipboard.writeText(text + ' ' + url); toast('Link copied.'); }catch(e){ toast(url); } }; }

  /* ---------- start ---------- */
  function begin(R){ newTrail(R); S.t0 = performance.now(); S.started = true; tray(); enterRoom(true); ga('find_start', {daily: S.daily}); }
  function startCard(){ const sv = store.get(KEY) || {};
    const c = el('div', {id: 'fndCard'}, `<div class="c"><div class="cat">${SNOWBALL.svg({id: 'sbs', seed: 7, wear: WEAR})}</div><h2>Where's Snowball?</h2>
      <p>Dinner is ready, and Snowball is nowhere. But he left a trail through the house.</p>
      <div class="steps"><span>${ITEMS[1].svg}Find what he left in each room</span><span>${ITEMS[0].svg}Read the clue and pick where he went</span><span>${SNOWBALL.svg({id: 'sbh', seed: 7}).replace(/viewBox="[^"]+"/, 'viewBox="110 10 280 240"')}Follow the trail and find him</span></div>
      <button class="fndBtn big" type="button" id="fndGo">Start the trail</button>${sv.streak > 1 ? `<p style="font-size:14px;color:#5c6575;margin:12px 0 0">You have found him ${sv.streak} days in a row.</p>` : ''}</div>`);
    document.body.appendChild(c); $('#fndGo').focus();
    $('#fndGo').onclick = () => { c.remove(); ac(); S.daily = !dailyDone; begin(S.daily ? rng(dayNum * 7919 + 13) : rng(Math.floor(Math.random() * 1e9))); }; }
  function boot(){ try{ H.asBuilt && H.asBuilt(); H.setTOD('midday'); }catch(e){} makeSprites(() => { buildUI(); requestAnimationFrame(frame);
    const intro = document.getElementById('intro28'); if(intro){ const mo = new MutationObserver(() => { if(!document.getElementById('intro28')){ mo.disconnect(); startCard(); } }); mo.observe(document.body, {childList: true}); } else startCard(); }); }
  // start only once the engine is really drawing frames (the loading card can read "done" a moment before the first render)
  (function wait(n){ let fr = 0; try{ fr = H.renderer.info.render.frame; }catch(e){} const ld = document.getElementById('loading'), up = ld && !ld.classList.contains('done');
    if((fr > 8 && !up) || n > 240) setTimeout(boot, 900); else setTimeout(() => wait(n + 1), 250); })(0);
  window.FINDCAT = {S, help, gotItem, found, spot: () => S.spots[S.step]};
})();
