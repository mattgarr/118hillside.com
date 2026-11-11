/* Where's Snowball? (r35): hide and seek with the cat himself, played inside the 3D model of 118 Hillside Drive (the house as it is today).
   Loaded by tour/index.html only on ?snowball=1; talks to the engine through window.HILLSIDE.
   Story: dinner is ready and Snowball would rather play. He is sitting in the entry when you arrive; tap him and he runs off, leaving paw prints.
   A round "Snowball cam" shows what he can see now; pick the room it belongs to and go there. He hides a little better in each room
   (on the sofa, behind the armchair, on the windowsill) and gives up in the fifth. The first trail of the day is the same for everyone.
   The camera never walks: the game stands you at each room's tour viewpoint and you turn on the spot, so nothing can land you on the wrong floor.
   Debug: window.FINDCAT (dev.go(room, spotIndex), dev.spots()), and ?trail=living,kitchen,primary,terrace &hard=1 &seed=7 on the URL. */
(function(){
  'use strict';
  const H = window.HILLSIDE; if(!H || window.FINDCAT) return;
  const THREE = H.THREE, $ = s => document.querySelector(s), cam = H.camera;
  const ga = (n, p) => { try{ window.gtag && gtag('event', n, p || {}); }catch(e){} };
  const store = {get(k){ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } }, set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const fmtT = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const rng = seed => { let s = (Math.abs(seed | 0) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), wrap = a => { while(a > Math.PI) a -= 2 * Math.PI; while(a < -Math.PI) a += 2 * Math.PI; return a; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, Q = new URLSearchParams(location.search);
  const now = new Date(), ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), DAY = ymd(now);
  const dayNum = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5);
  const MONTH = now.getMonth() + 1, WEAR = MONTH === 12 ? 'scarfRed' : MONTH === 11 ? 'scarfGreen' : (MONTH <= 2 ? 'scarfBlue' : null), BELL = true;   // the bell you hear is the bell you see
  let dead = false; const timers = new Set(), later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if(!dead) fn(); }, ms); timers.add(id); return id; };

  /* ---------- the rooms: where you stand is the tour's own viewpoint; every hiding place was placed by hand in the model and checked from there ----------
     spots: p = where his paws are (world feet), n = finishes the sentence "He was ...", d = how hidden (0 in plain sight, 1 partly, 2 peeking).
     cam = two details of the room's real photo (0..1 across, 0..1 down) for the Snowball cam. Facts come from the site's own copy. */
  const ROOM = {
    entry:   {name: 'Entry', at: 'in the entry', photo: '../images/entry-800.jpg', ar: .586, cam: [[.5, .08], [.16, .5]], fy: 0,
      fact: 'A cathedral ceiling and a starburst light, added in 2024.', say: 'Catch me if you can.',
      spots: [{p: [-5.93, .06, -4.07], n: 'sitting in the middle of the entry', d: 0}]},
    living:  {name: 'Living room', at: 'in the living room', photo: '../images/living-room-800.jpg', ar: .591, cam: [[.55, .1], [.5, .72]], fy: 0,
      fact: 'Wood beams cross the ceiling. This part of the house is from the 1920s.', say: 'This rug is my favorite.',
      spots: [{p: [10.5, .03, -4.5], n: 'on the rug', d: 0}, {p: [6.04, 1.38, -6.68], n: 'on the sofa, between the pillows', d: 1}, {p: [8.86, 1.46, 1.06], n: 'in the armchair', d: 1}, {p: [7.1, 1.39, -7.31], n: 'at the far end of the sofa', d: 2}]},
    kitchen: {name: 'Kitchen', at: 'in the kitchen', photo: '../images/kitchen-800.jpg', ar: .64, cam: [[.42, .42], [.9, .45]], fy: 0,
      fact: 'White quartz counters, and a peninsula big enough for homework.', say: 'I was only checking on dinner.',
      spots: [{p: [13.2, 2.9, 14.21], n: 'on the kitchen counter', d: 0}, {p: [9.04, 3.01, 14.23], n: 'on the back counter in the kitchen', d: 0}, {p: [10.19, 2.15, 17.15], n: 'on a kitchen stool', d: 1}, {p: [7.53, 0, 18.7], n: 'behind the breakfast table', d: 2}]},
    great:   {name: 'Great room', at: 'in the great room', photo: '../images/dining-800.jpg', ar: .7325, cam: [[.72, .75], [.47, .52]], fy: 0,
      fact: 'Kitchen, sitting area and dining table share one long, bright room.', say: 'I was watching the birds.',
      spots: [{p: [7.64, 1.3, 32.69], n: 'on the big sofa', d: 0}, {p: [8.44, .03, 28.34], n: 'beside the round coffee table', d: 1}, {p: [9.9, .06, 24.23], n: 'between the two tables', d: 2}]},
    mainbeds: {name: 'Main-level bedroom', at: 'in the main-level bedroom', photo: 'thumbs/p74.jpg', big: 'photos/p74.jpg', ar: .667, cam: [[.36, .6], [.78, .45]], fy: 0,
      fact: 'One of three bedrooms on a quiet hall of the main level.', say: 'I was keeping the bed warm.',
      spots: [{p: [24.32, 2.05, 31.18], n: 'on the bed', d: 0}, {p: [22.2, .03, 34.96], n: 'between the two baskets', d: 1}, {p: [27.31, 0, 28.01], n: 'on the far side of the bed', d: 2}]},
    loft:    {name: 'Loft', at: 'in the loft', photo: 'thumbs/p37.jpg', big: 'photos/p37.jpg', ar: .667, cam: [[.33, .22], [.72, .62]], fy: 5.57,
      fact: 'A sitting spot under the skylights, at the top of the stairs.', say: 'I like the sun up here.',
      spots: [{p: [-22.11, 5.57, -9.89], n: 'next to the big plant', d: 0}, {p: [-24.08, 7.03, -6.09], n: 'on the window seat', d: 1}]},
    primary: {name: 'Primary bedroom', at: 'in the primary bedroom', photo: '../images/primary-bedroom-800.jpg', ar: .68, cam: [[.36, .6], [.72, .5]], fy: 5.57,
      fact: 'Four skylights overhead, and glass doors to a private balcony.', say: 'The big bed is the best bed.',
      spots: [{p: [-18.52, 7.63, -32.3], n: 'on the big bed', d: 0}, {p: [-14.96, 5.6, -38.19], n: 'by the balcony doors', d: 1}, {p: [-20.26, 6.77, -34.81], n: 'beside the pillows', d: 2}]},
    pbath:   {name: 'Primary bath', at: 'in the primary bath', photo: '../images/primary-bath-800.jpg', ar: .68, cam: [[.88, .42], [.2, .62]], fy: 5.57,
      fact: 'Heated floors, two sinks, and a shower big enough for two.', say: 'The floor in here is warm.',
      spots: [{p: [-9.57, 8.4, -24.74], n: 'on the bathroom counter', d: 0}, {p: [-9.79, 5.57, -20.52], n: 'under the window, on the warm floor', d: 1}]},
    balcony: {name: 'Balcony', at: 'on the balcony', photo: '../images/hills-view-800.jpg', ar: .71, cam: [[.5, .35], [.78, .3]], fy: 5.57, tod: 'golden',
      fact: 'The balcony faces the western hills, for watching the sun go down.', say: 'I was watching the hills.',
      spots: [{p: [-19.67, 6.88, -44.86], n: 'on a balcony chair', d: 0}, {p: [-20.9, 5.57, -41.1], n: 'in the corner of the balcony', d: 1}]},
    lower:   {name: 'Downstairs bedroom', at: 'in the downstairs bedroom', photo: '../images/bedroom-800.jpg', ar: .68, cam: [[.72, .72], [.13, .4]], fy: -4.56,
      fact: 'One of two bedrooms downstairs, near the skylit office.', say: 'It is quiet down here.',
      spots: [{p: [-16.76, -2.5, -45.56], n: 'on the bed', d: 0}, {p: [-10.56, -1.27, -41.27], n: 'on the windowsill', d: 1}, {p: [-11.76, -4.56, -44.58], n: 'behind the bed', d: 2}]},
    lounge:  {name: 'Bonus lounge', at: 'in the bonus lounge', photo: '../images/rec-room-800.jpg', ar: .644, cam: [[.43, .34], [.52, .6]], fy: -4.56,
      fact: 'Made for movie nights, with a big TV and a refreshment counter.', say: 'Is it movie night yet?',
      spots: [{p: [-13.98, -2.11, -23.73], n: 'on the glass table', d: 0}, {p: [-20.75, -1.65, -18.84], n: 'on the counter under the TV', d: 1}, {p: [-12.3, -4.51, -24.33], n: 'between the chairs', d: 2}]},
    terrace: {name: 'Terrace', at: 'on the terrace', photo: '../images/rear-yard-800.jpg', ar: .71, cam: [[.38, .45], [.8, .72]], fy: -4.75, open: true,
      fact: 'An outdoor kitchen under a pergola, beside the heritage oak.', say: 'I was guarding the barbecue.',
      spots: [{p: [1.4, -4.7, -23.8], n: 'out on the terrace pavers', d: 0}, {p: [.8, -4.7, -32.4], n: 'beside the outdoor chair', d: 1}, {p: [-5.5, -3.25, -30.4], n: 'on the outdoor sofa', d: 2}]}};
  const stopOf = id => H.STOPS.find(s => s.id === id), stopIx = id => H.STOPS.findIndex(s => s.id === id);
  const POOL = Object.keys(ROOM).filter(k => k !== 'entry' && stopOf(k));
  const ALLSPOTS = POOL.reduce((n, k) => n + ROOM[k].spots.length, 0);
  const CW = 1.38, CH = 2.1;   // Snowball on screen: a touch bigger than life, so small players can spot him across a room

  /* ---------- ray casting against only what is near the room (the terrain and trees are huge and slow) ---------- */
  const rc = new THREE.Raycaster(); rc.camera = cam; const NEAR = {};
  function meshesNear(id, V){ if(NEAR[id]) return NEAR[id]; const list = [], G = H.GROUPS || {}, skip = new Set([G.trees, G.hills, G.terrain].filter(Boolean)), c = new THREE.Vector3();
    try{ H.scene.updateMatrixWorld(true); H.scene.traverse(o => { if(!o.isMesh || o.isSprite || /^(find-|esc-)/.test(o.name)) return; const g = o.geometry; if(!g || !g.attributes || !g.attributes.position) return;
      for(let p = o; p; p = p.parent) if(!p.visible || skip.has(p)) return;
      if(o.isInstancedMesh){ list.push(o); return; } if(!g.boundingSphere) g.computeBoundingSphere();
      c.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld); if(c.distanceTo(V) - g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() < 26) list.push(o); }); }catch(e){}
    return NEAR[id] = list; }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3();
  function clear(M, from, to, slack){ _a.copy(to).sub(from); const L = _a.length(); rc.set(from, _a.normalize()); rc.far = L - (slack || .25); try{ return !rc.intersectObjects(M, true).length; }catch(e){ return true; } }
  // is his head in view from where you stand? (ears, eyes, nose: the head sits left of the picture's centre)
  const HEAD = [[-.32, .9], [-.02, .9], [-.27, .75], [-.07, .75], [-.17, .62]];
  function headSeen(M, V, P){ const rx = -(P.z - V.z), rz = P.x - V.x, L = Math.hypot(rx, rz) || 1; let n = 0;   // (rx, rz) points to the right of the screen
    for(const [cx, cy] of HEAD){ _b.set(P.x + rx / L * cx * CW, P.y + cy * CH, P.z + rz / L * cx * CW); if(clear(M, V, _b)) n++; } return n; }
  // the way he runs off: along the floor, away from you or across the room, as far as the room lets him
  function runPath(M, V, P, fy, open){ const tx = V.x - P.x, tz = V.z - P.z, tl = Math.hypot(tx, tz) || 1; let best = null;
    for(let k = 0; k < 8; k++){ const a = k * Math.PI / 4, dx = Math.sin(a), dz = Math.cos(a), toward = (dx * tx + dz * tz) / tl; if(toward > .5) continue; const pts = []; let floor = false;
      for(let s = 1; s <= 7; s++){ const x = P.x + dx * 1.5 * s, z = P.z + dz * 1.5 * s, top = Math.max(P.y, fy) + 2.2; rc.set(_a.set(x, top, z), _b.set(0, -1, 0)); rc.far = top - fy + .7; let h = null; try{ h = rc.intersectObjects(M, true)[0]; }catch(e){}
        if(h && Math.abs(h.point.y - fy) < .4){ floor = true; pts.push(new THREE.Vector3(x, h.point.y, z)); } else if(!h && open){ floor = true; pts.push(new THREE.Vector3(x, fy + .05, z)); } else if(h && !floor && s <= 2 && h.point.y > fy) continue; else break; }
      const score = pts.length + (toward < -.2 ? .6 : 0) + (pts.length && clear(M, V, _a.copy(pts[pts.length - 1]).setY(fy + 1), .3) ? 1 : 0);
      if(pts.length >= 2 && (!best || score > best.score)) best = {pts, score}; }
    return best ? best.pts : null; }

  /* ---------- drawings ---------- */
  const PAWSVG = (c, extra) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" ${extra || 'aria-hidden="true"'}><g fill="${c || 'currentColor'}"><ellipse cx="16" cy="21" rx="8" ry="6.5"/><ellipse cx="6.5" cy="13" rx="3.2" ry="4.2"/><ellipse cx="12.5" cy="7.5" rx="3.2" ry="4.4"/><ellipse cx="19.5" cy="7.5" rx="3.2" ry="4.4"/><ellipse cx="25.5" cy="13" rx="3.2" ry="4.2"/></g></svg>`;
  // Snowball running, seen from the side (two frames of a gallop), facing right
  const RUNSVG = f => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 160"><ellipse cx="150" cy="150" rx="${f ? 80 : 120}" ry="7" fill="#000" opacity=".22"/><g fill="none" stroke="#111318" stroke-linecap="round">` +
    (f ? `<path d="M88 78 C58 70 34 76 18 96" stroke-width="11"/><path d="M104 96 C112 116 130 130 152 134" stroke-width="13"/><path d="M96 98 C100 120 114 136 134 142" stroke-width="12"/><path d="M200 94 C196 114 182 128 162 134" stroke-width="13"/><path d="M208 96 C208 118 196 134 178 142" stroke-width="12"/>`
       : `<path d="M74 78 C42 62 24 38 32 16" stroke-width="11"/><path d="M86 92 C62 102 36 110 14 102" stroke-width="13"/><path d="M94 96 C74 114 50 122 28 120" stroke-width="12"/><path d="M206 90 C232 98 262 106 286 98" stroke-width="13"/><path d="M198 94 C222 110 250 120 272 116" stroke-width="12"/>`) + `</g>` +
    `<g fill="#111318"><path d="${f ? 'M88 70 C118 36 182 38 214 62 C234 76 232 96 212 102 C172 112 112 110 86 98 C72 90 76 78 88 70Z' : 'M70 72 C100 50 170 48 215 64 C235 72 238 94 215 100 C170 110 100 108 72 98 C58 92 58 80 70 72Z'}"/>` +
    `<g transform="translate(0 ${f ? 4 : 0})"><circle cx="238" cy="58" r="25"/><path d="M220 44 L222 12 L240 34Z"/><path d="M244 34 L263 10 L260 44Z"/></g></g>` +
    `<g transform="translate(0 ${f ? 4 : 0})"><ellipse cx="247" cy="54" rx="5.5" ry="6.5" fill="#f4d23e"/><ellipse cx="248.5" cy="54" rx="1.8" ry="5.5" fill="#050505"/><path d="M262 64 l14 -3 M262 68 l14 3" stroke="#e9ebf0" stroke-width="1.4" opacity=".7"/></g></svg>`;
  // and bounding straight away from you: rump, tail up, ears, back feet
  const BACKSVG = f => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200"><ellipse cx="80" cy="190" rx="${f ? 44 : 54}" ry="7" fill="#000" opacity=".22"/><g transform="translate(0 ${f ? 14 : 0})">` +
    `<path d="M84 112 C112 96 124 62 112 26" fill="none" stroke="#111318" stroke-width="12" stroke-linecap="round"/>` +
    `<g fill="#111318"><circle cx="78" cy="${f ? 70 : 60}" r="27"/><path d="M57 ${f ? 60 : 50} L52 ${f ? 26 : 16} L76 ${f ? 46 : 36}Z"/><path d="M82 ${f ? 46 : 36} L104 ${f ? 26 : 16} L100 ${f ? 60 : 50}Z"/><ellipse cx="80" cy="122" rx="${f ? 52 : 46}" ry="${f ? 42 : 50}"/>` +
    (f ? `<ellipse cx="50" cy="160" rx="15" ry="11"/><ellipse cx="110" cy="160" rx="15" ry="11"/>` : `<ellipse cx="54" cy="172" rx="13" ry="19"/><ellipse cx="106" cy="172" rx="13" ry="19"/>`) + `</g>` +
    (f ? '' : `<g fill="#5d4a55"><ellipse cx="54" cy="180" rx="5" ry="6"/><ellipse cx="106" cy="180" rx="5" ry="6"/></g>`) + `</g></svg>`;
  function texFromSvg(svg, w, h){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    const img = new Image(); img.onload = () => { cv.getContext('2d').drawImage(img, 0, 0, w, h); tex.needsUpdate = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', `<svg width="${w}" height="${h}" `)); return tex; }
  const TEX = {}, OBJ = []; let CAT = null, RUN = null, PAWMAT = null, PAWGEO = null; const PRINTS = [];
  function sprite(tex, w, h, name){ const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false, alphaTest: .04})); sp.center.set(.5, 0); sp.scale.set(w, h, 1); sp.name = name; sp.renderOrder = 6; sp.visible = false; sp.raycast = function(){}; sp.userData.noAO = true; H.scene.add(sp); OBJ.push(sp); return sp; }
  function makeArt(cb){ const done = () => { const S2 = window.SNOWBALL;
      TEX.open = texFromSvg(S2.svg({id: 'sbf', seed: 7, glow: true, wear: WEAR, bell: BELL}), 384, 584); TEX.shut = texFromSvg(S2.svg({id: 'sbc', seed: 7, wear: WEAR, bell: BELL, eyes: 'closed'}), 384, 584);
      TEX.runA = texFromSvg(RUNSVG(0), 384, 205); TEX.runB = texFromSvg(RUNSVG(1), 384, 205); TEX.backA = texFromSvg(BACKSVG(0), 256, 320); TEX.backB = texFromSvg(BACKSVG(1), 256, 320); TEX.paw = texFromSvg(PAWSVG('#4b3a2a', ''), 96, 96);
      CAT = sprite(TEX.open, CW, CH, 'find-snowball'); RUN = sprite(TEX.runA, 2.25, 1.2, 'find-run');
      PAWGEO = new THREE.PlaneGeometry(.42, .42); PAWMAT = new THREE.MeshBasicMaterial({map: TEX.paw, transparent: true, depthWrite: false, opacity: .78, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}); cb(); };
    if(window.SNOWBALL && window.SNOWBALL.v >= 36) return done(); const s = document.createElement('script'); s.src = new URL('../snowball.js?v=36', SRC).href; s.onload = done; s.onerror = () => { if(window.SNOWBALL) done(); }; document.head.appendChild(s); }
  const SRC = (document.currentScript && document.currentScript.src) || new URL('../assets/find/find.js', location.href).href;
  function addPrint(p, yaw, side){ const m = new THREE.Mesh(PAWGEO, PAWMAT); m.name = 'find-paw'; m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, yaw + Math.PI, 0); m.position.set(p.x + Math.cos(yaw) * side * .16, p.y + .035, p.z - Math.sin(yaw) * side * .16); m.renderOrder = 4; m.raycast = function(){}; m.userData.noAO = true; H.scene.add(m); PRINTS.push(m); }
  function clearPrints(){ for(const m of PRINTS) H.scene.remove(m); PRINTS.length = 0; }

  /* ---------- sound: one small set of soft mallet and bell tones, all from one pentatonic scale, through a little echo and a limiter ----------
     Snowball's own voice is the bell on his collar (it comes from his side of the room), a short "mrrp", and a purr when you are close.
     Nothing plays before the first tap; the speaker button mutes everything and remembers; the sound pauses when the tab is hidden.
     audioKit(ctx) builds the whole chain on any context, so FINDCAT.dev.measure() can render every cue offline and check its level. */
  const KEY = 'find.v3'; const SV = (() => { const v = store.get(KEY) || {}, old = store.get('find.v2') || {}; if(v.last == null && old.last){ v.last = old.last; v.streak = old.streak; v.total = old.total; } v.spots = v.spots || {}; return v; })();
  const save = () => store.set(KEY, SV), VOL = .55;
  const NOTE = n => 261.63 * Math.pow(2, (Math.floor(n / 5) * 12 + [0, 2, 4, 7, 9][((n % 5) + 5) % 5]) / 12);   // C major pentatonic, 0 = middle C
  function audioKit(c){ const sum = c.createGain(), dry = c.createGain(), lim = c.createDynamicsCompressor(), master = c.createGain(), dly = c.createDelay(.5), fb = c.createGain(), wet = c.createGain(), lp = c.createBiquadFilter();
    lim.threshold.value = -16; lim.knee.value = 8; lim.ratio.value = 12; lim.attack.value = .003; lim.release.value = .18; master.gain.value = VOL;
    dly.delayTime.value = .19; fb.gain.value = .26; wet.gain.value = .2; lp.type = 'lowpass'; lp.frequency.value = 2400;
    sum.connect(lim); sum.connect(dly); dly.connect(lp); lp.connect(fb); fb.connect(dly); lp.connect(wet); wet.connect(lim); dry.connect(lim); lim.connect(master); master.connect(c.destination);
    let nb = null; const noise = () => { if(!nb){ nb = c.createBuffer(1, Math.floor(c.sampleRate * 2), c.sampleRate); const d = nb.getChannelData(0); let m = 0; for(let i = 0; i < d.length; i++){ d[i] = Math.random() * 2 - 1; m += d[i]; } m /= d.length; for(let i = 0; i < d.length; i++) d[i] -= m; } const s = c.createBufferSource(); s.buffer = nb; s.loop = true; return s; };
    const to = p => { if(!p || !c.createStereoPanner) return sum; const n = c.createStereoPanner(); n.pan.value = clamp(p, -1, 1); n.connect(sum); return n; };
    const env = (g, t, a, pk, d) => { g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(pk, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };
    function part(type, f, t, a, pk, d, dest){ const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); env(g, t, a, pk, d); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + d + .03); return o; }
    const mallet = (n, t, v, d, dest) => { const f = NOTE(n); dest = dest || sum; part('sine', f, t, .008, v, d, dest); part('sine', f * 2, t, .006, v * .26, d * .55, dest); part('triangle', f * 4, t, .005, v * .06, d * .2, dest); };
    const jing = (t, v, dest) => { part('sine', NOTE(17), t, .004, v, .11, dest); part('sine', NOTE(19) * 1.003, t, .004, v * .5, .08, dest); part('sine', NOTE(22), t, .003, v * .22, .05, dest); };   // a tiny round bell: E7, A7, E8
    const CUE = {
      find(t, o){ const k = clamp(o.step || 0, 0, 4), n = [5, 6, 7, 8, 9][k]; mallet(n, t, .3, .5); mallet(n + 2, t + .12, .3, .7); part('sine', NOTE(n + 12), t + .12, .01, .05, .5, sum); return .9; },   // two notes, a step higher each time he is found
      right(t){ mallet(3, t, .3, .55); mallet(5, t + .1, .3, .8); mallet(7, t + .1, .16, .8); return 1; },
      wrong(t){ const o = part('sine', NOTE(-2), t, .04, .26, .3, sum); o.frequency.exponentialRampToValueAtTime(NOTE(-2) * .9, t + .3); const o2 = part('triangle', NOTE(-2) * 2, t, .04, .04, .2, sum); o2.frequency.exponentialRampToValueAtTime(NOTE(-2) * 1.8, t + .25); return .4; },   // a low, soft "hm"
      tick(t){ part('sine', NOTE(14), t, .003, .09, .035, sum); return .06; },
      tap(t){ part('sine', NOTE(9), t, .004, .1, .06, sum); return .08; },
      whoosh(t){ const n = noise(), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.Q.value = .9; f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(1500, t + .28); f.frequency.exponentialRampToValueAtTime(600, t + .6);
        g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.2, t + .2); g.gain.exponentialRampToValueAtTime(.0001, t + .62); n.connect(f); f.connect(g); g.connect(sum); n.start(t); n.stop(t + .66); return .7; },
      bell(t, o){ const d = to(o.pan), v = (o.vol || 1) * .13; [[0, 1], [.075, .55], [.14, .8], [.23, .45]].forEach(h => jing(t + h[0], v * h[1], d)); return .4; },
      mrrp(t, o){ const d = to(o.pan), v = (o.vol || 1), f = c.createBiquadFilter(), g = c.createGain(), tr = c.createGain(), l = c.createOscillator(), lg = c.createGain(), o1 = c.createOscillator(), o2 = c.createOscillator(), g2 = c.createGain(), L = .24;
        f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1500, t + L); f.Q.value = 1.4; o1.type = 'triangle'; o2.type = 'sine'; g2.gain.value = .35;
        o1.frequency.setValueAtTime(NOTE(4), t); o1.frequency.exponentialRampToValueAtTime(NOTE(7), t + L * .8); o2.frequency.setValueAtTime(NOTE(9), t); o2.frequency.exponentialRampToValueAtTime(NOTE(12), t + L * .8);
        l.type = 'sine'; l.frequency.value = 27; lg.gain.value = .42; tr.gain.value = .58; l.connect(lg); lg.connect(tr.gain);   // the rolled "rr"
        g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.32 * v, t + .03); g.gain.setValueAtTime(.32 * v, t + L * .7); g.gain.exponentialRampToValueAtTime(.0001, t + L);
        o1.connect(tr); o2.connect(g2); g2.connect(tr); tr.connect(f); f.connect(g); g.connect(d); [o1, o2, l].forEach(x => { x.start(t); x.stop(t + L + .04); }); return .3; },
      patter(t, o){ const n = o.n || 8; for(let i = 0; i < n; i++) part('sine', NOTE(-5 + (i % 2) * 2), t + i * .085, .004, .1, .04, sum); return n * .085 + .05; },   // paws on the floor
      fanfare(t){ [5, 7, 8, 10].forEach((n, i) => mallet(n, t + i * .13, .26, i === 3 ? 1.1 : .4)); [5, 7, 8].forEach(n => mallet(n, t + .39, .1, 1.1)); mallet(12, t + .62, .14, .9); mallet(15, t + .75, .1, .9); return 1.9; },
      purr(t, o){ const L = o.len || 2, p = purr(); p.level.gain.setValueAtTime(.0001, t); p.level.gain.linearRampToValueAtTime(o.vol || .5, t + .3); p.level.gain.setValueAtTime(o.vol || .5, t + L - .4); p.level.gain.linearRampToValueAtTime(.0001, t + L); p.stop(t + L + .05); return L; }};
    // the purr: low noise and a low tone, pulsed about 23 times a second, breathing in and out
    function purr(){ const n = noise(), nf = c.createBiquadFilter(), ng = c.createGain(), o1 = c.createOscillator(), g1 = c.createGain(), o2 = c.createOscillator(), g2 = c.createGain(), am = c.createGain(), l = c.createOscillator(), lg = c.createGain(), br = c.createGain(), bl = c.createOscillator(), bg = c.createGain(), level = c.createGain();
      nf.type = 'lowpass'; nf.frequency.value = 520; nf.Q.value = .6; ng.gain.value = .5; o1.type = 'sine'; o1.frequency.value = 49; g1.gain.value = .3; o2.type = 'triangle'; o2.frequency.value = 98; g2.gain.value = .16;
      am.gain.value = .5; l.type = 'sine'; l.frequency.value = 23; lg.gain.value = .46; l.connect(lg); lg.connect(am.gain); br.gain.value = .72; bl.type = 'sine'; bl.frequency.value = .42; bg.gain.value = .26; bl.connect(bg); bg.connect(br.gain); level.gain.value = 0;
      n.connect(nf); nf.connect(ng); ng.connect(am); o1.connect(g1); g1.connect(am); o2.connect(g2); g2.connect(am); am.connect(br); br.connect(level); level.connect(dry); const all = [n, o1, o2, l, bl]; all.forEach(x => x.start());
      return {level, stop(t){ all.forEach(x => { try{ x.stop(t); }catch(e){} }); }}; }
    return {c, master, CUE, purr, play(name, o){ try{ return CUE[name](c.currentTime + .02 + ((o && o.at) || 0), o || {}); }catch(e){ return 0; } }}; }
  let AC = null, AK = null, PURR = null;
  const ac = () => { try{ if(!AC){ AC = new (window.AudioContext || window.webkitAudioContext)(); AK = audioKit(AC); AK.master.gain.value = SV.mute ? 0 : VOL; } if(AC.state === 'suspended' && !document.hidden) AC.resume(); }catch(e){} return AC; };
  const snd = (name, o) => { if(!AC || SV.mute || document.hidden) return; try{ AK.play(name, o); }catch(e){} };   // only after the first tap has made the context
  function purrSet(v){ if(!AC) return; try{ if(!PURR){ if(v <= 0) return; PURR = AK.purr(); } PURR.level.gain.setTargetAtTime(v * .5, AC.currentTime, .3); }catch(e){} }
  function setMute(m){ SV.mute = !!m; save(); if(AK) AK.master.gain.setTargetAtTime(m ? 0 : VOL, AC.currentTime, .03); document.querySelectorAll('.fndSnd').forEach(b => { b.setAttribute('aria-pressed', String(!m)); b.setAttribute('aria-label', m ? 'Turn sound on' : 'Turn sound off'); b.classList.toggle('off', !!m); const s = b.querySelector('span'); if(s) s.textContent = m ? 'Sound is off' : 'Sound is on'; }); }
  const onVis = () => { try{ if(!AC) return; if(document.hidden) AC.suspend(); else AC.resume(); }catch(e){} };
  // render every cue on an offline context and report its peak (dBFS), length, clipping and DC offset: the sounds are checked by numbers here, not by ear
  async function measure(){ const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, res = {}; if(!OAC) return {error: 'no OfflineAudioContext'};
    for(const name of ['find', 'right', 'wrong', 'tick', 'tap', 'whoosh', 'bell', 'mrrp', 'patter', 'fanfare', 'purr']) for(const v of name === 'find' ? [0, 4] : [0]){ const sr = 44100, oc = new OAC(2, sr * 4, sr), k = audioKit(oc); k.CUE[name](.05, name === 'find' ? {step: v} : name === 'purr' ? {len: 2.5} : name === 'bell' ? {pan: .7} : {});
      const buf = await oc.startRendering(); let peak = 0, sum = 0, clip = 0, last = 0, sq = 0; for(let ch = 0; ch < 2; ch++){ const d = buf.getChannelData(ch); for(let i = 0; i < d.length; i++){ const a = Math.abs(d[i]); if(a > peak) peak = a; if(a >= .999) clip++; if(a > .001 && i > last) last = i; sum += d[i]; sq += d[i] * d[i]; } }
      res[name + (name === 'find' ? v : '')] = {peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rmsDb: +(10 * Math.log10(sq / (2 * buf.length) || 1e-12)).toFixed(1), secs: +(last / sr).toFixed(2), clipped: clip, dc: +(sum / (2 * buf.length)).toFixed(5)}; }
    return res; }

  /* ---------- where you stand and where you look: the game owns the camera, pinned to the room's viewpoint ---------- */
  const anchor = new THREE.Vector3(); let pinned = false, tw = null;
  const facing = () => { cam.getWorldDirection(_d); return {yaw: Math.atan2(_d.x, _d.z), pitch: Math.asin(clamp(_d.y, -1, 1))}; };
  function aim(yaw, pitch){ const c = Math.cos(pitch); H.look(anchor.toArray(), [anchor.x + Math.sin(yaw) * c * 10, anchor.y + Math.sin(pitch) * 10, anchor.z + Math.cos(yaw) * c * 10]); }
  function turnTo(yaw, pitch, dur){ const a = facing(), dy = wrap(yaw - a.yaw); if(reduce || !dur){ tw = null; aim(a.yaw + dy, pitch); return; } tw = {t0: performance.now(), dur, y0: a.yaw, dy, p0: a.pitch, p1: pitch}; }
  function lookAtPoint(p, dur){ const dx = p.x - anchor.x, dz = p.z - anchor.z; turnTo(Math.atan2(dx, dz), clamp(Math.atan2(p.y - anchor.y, Math.hypot(dx, dz)), -.5, .35), dur); }
  function pin(){ if(pinned && !H.anim && cam.position.distanceToSquared(anchor) > 1e-7){ cam.position.copy(anchor); cam.updateMatrixWorld(); } }
  const prevOBR = H.scene.onBeforeRender, myOBR = function(){ if(!dead){ try{ pin(); }catch(e){} } return prevOBR && prevOBR.apply(this, arguments); }; H.scene.onBeforeRender = myOBR;
  function turn(sign){ if(!S.on || S.mode !== 'seek' || H.anim) return;   // not while travelling: a room-to-room move is never interrupted
    const a = facing(), base = tw ? tw.y0 + tw.dy : a.yaw; turnTo(base + sign * Math.PI / 3.6, tw ? tw.p1 : a.pitch, 420); snd('tick'); S.turned = true; }
  // go to a room: a soft fade, then stand at its tour viewpoint with the tour's own lens
  function travel(id, first, cb){ const st = stopOf(id), R = ROOM[id]; S.mode = 'travel'; ring.classList.remove('on'); purrSet(0); snd('whoosh'); fade.querySelector('b').textContent = R.name; fade.classList.add('on');
    later(() => { clearPrints(); CAT.visible = RUN.visible = false; pinned = false; tw = null;
      let fr = null; try{ fr = window.FRAME_FOR && window.FRAME_FOR(st); }catch(e){} fr = fr || {pos: st.pos, look: st.look};
      try{ H.setTOD(R.tod || 'midday'); }catch(e){}   // the balcony is for sunsets
      try{ H.showStop(stopIx(id)); const a = H.anim; if(a){ a.dur = .001; a.photo = null; a.lift = 0; } }catch(e){}
      let n = 0; (function settle(){ if(dead) return; if(H.anim && n++ < 40) return requestAnimationFrame(settle);
        anchor.set(fr.pos[0], fr.pos[1], fr.pos[2]); pinned = true; H.look(fr.pos, fr.look); cb(fr); later(() => fade.classList.remove('on'), first ? 300 : 420); })(); }, 300); }

  /* ---------- state ---------- */
  const S = {on: false, mode: 'idle', daily: true, hard: !!SV.hard, step: 0, trail: [], spot: null, P: new THREE.Vector3(), path: null, t0: 0, tSeek: 0, tHint: 0, tMeow: 0, tSeen: 0, wrong: 0, helps: 0, miss: 0, turned: false, R: Math.random};
  const dailyDone = SV.last === DAY;
  function newTrail(R){ const pool = POOL.slice(); for(let i = pool.length - 1; i > 0; i--){ const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    let rooms = pool.slice(0, 4); const force = (Q.get('trail') || '').split(',').filter(k => ROOM[k] && k !== 'entry' && stopOf(k)); if(force.length) rooms = force.concat(rooms.filter(k => !force.includes(k))).slice(0, 4);
    S.trail = ['entry'].concat(rooms); S.step = 0; S.wrong = 0; S.helps = 0; S.miss = 0; S.R = R; S.spot = null;
    for(const k of S.trail){ const im = new Image(); im.src = ROOM[k].photo; if(ROOM[k].big){ const b = new Image(); b.src = ROOM[k].big; } } later(() => { for(const k in ROOM){ const im = new Image(); im.src = ROOM[k].photo; } }, 2500); }
  // pick his hiding place for this room: easy first, sneakier later; skip any place the model no longer lets you see
  function chooseSpot(id, fr){ const R = ROOM[id], M = meshesNear(id, anchor), want = S.step === 0 ? 0 : S.hard ? 2 : S.step === 1 ? 0 : S.step === 2 ? 1 : 2;
    const order = R.spots.map((s, i) => ({s, i, r: S.R()})).sort((a, b) => (Math.abs(a.s.d - want) - Math.abs(b.s.d - want)) || (a.r - b.r)); if(S.force != null){ const f = order.findIndex(o => o.i === S.force); if(f > 0) order.unshift(order.splice(f, 1)[0]); S.force = null; }
    for(const o of order){ _v.set(o.s.p[0], o.s.p[1], o.s.p[2]); if(headSeen(M, anchor, _v) >= 3) return o; }
    const d = new THREE.Vector3(fr.look[0] - fr.pos[0], 0, fr.look[2] - fr.pos[2]).normalize(); let dist = 3;   // last resort: on real floor in front of you, never past a railing
    for(const q of [6.5, 5, 4]){ const x = anchor.x + d.x * q, z = anchor.z + d.z * q; rc.set(_a.set(x, R.fy + 2.5, z), _b.set(0, -1, 0)); rc.far = 3.2; let h = null; try{ h = rc.intersectObjects(M, true)[0]; }catch(e){}
      if(((h && Math.abs(h.point.y - R.fy) < .4) || (!h && R.open)) && clear(M, anchor, _v.set(x, R.fy + CH * .8, z))){ dist = q; break; } }
    return {s: {p: [anchor.x + d.x * dist, R.fy + .03, anchor.z + d.z * dist], n: R.at, d: 0}, i: -1}; }
  function arrive(fr){ const id = S.trail[S.step], R = ROOM[id], o = chooseSpot(id, fr); S.spot = o; S.P.set(o.s.p[0], o.s.p[1], o.s.p[2]); S.path = null;
    try{ S.path = runPath(meshesNear(id, anchor), anchor, S.P, R.fy, R.open); }catch(e){}
    CAT.material.map = TEX.open; CAT.material.opacity = 1; CAT.scale.set(CW, CH, 1); CAT.position.copy(S.P); CAT.visible = true;
    if(S.step === 0) lookAtPoint(_v.copy(S.P).setY(S.P.y + CH * .6), 0);
    const t = performance.now(); S.mode = 'seek'; S.tSeek = t; S.tHint = t; S.tMeow = t - 5000; S.tSeen = 0; S.miss = 0; S.turned = false; ui();
    later(() => { if(S.mode !== 'seek') return; if(S.step === 0){ toast('There he is. Tap Snowball.', 5200); ringUntil = performance.now() + 60000; } else if(S.step === 4) toast('This is the last room. Find him.', 4200); else if(S.step === 1) toast('He is hiding in here. Look around, and listen for his bell.', 4600); snd('bell', {pan: panOf()}); S.tMeow = performance.now(); }, 900); }

  /* ---------- UI ---------- */
  const css = `
  html.fnd #mini, html.fnd #cv27, html.fnd header.bar nav.tabs, html.fnd header.bar .plate, html.fnd #aboutBtn, html.fnd #card, html.fnd #labels, html.fnd #wplabels, html.fnd #ovtag, html.fnd #tod, html.fnd #viewBtn, html.fnd #hwBtn, html.fnd #tgBtn, html.fnd #phMore, html.fnd .g28pill, html.fnd #navHelp, html.fnd #hint, html.fnd #pad, html.fnd #gotoWrap, html.fnd #toggles, html.fnd #note, html.fnd #peek27, html.fnd .wptip{display:none!important}
  html.fnd #v33disc{z-index:59}   /* r35: the notice now sits bottom right and keeps itself clear of the bar (its own placer, in the page) */
  html.fnd:not(.fnd-on) #fndTop, html.fnd:not(.fnd-on) #fndBar, html.fnd:not(.fnd-on) #fndWarm{display:none}
  .fnd-chip{background:rgba(251,250,247,.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:18px;box-shadow:0 8px 30px rgba(15,20,35,.2);color:#1f2a3a;font-family:Jost,"Avenir Next","Helvetica Neue",Arial,sans-serif}
  #fndTop{position:fixed;left:12px;right:12px;top:62px;z-index:60;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;pointer-events:none}
  #fndTray{pointer-events:auto;padding:9px 12px 10px}
  #fndTray small{display:flex;justify-content:space-between;gap:12px;font-size:15px;font-weight:500;color:#1f2a3a;margin-bottom:6px}#fndClock{font-style:normal;font-weight:400;color:#5c6575;font-variant-numeric:tabular-nums;display:none}html.fnd-hard #fndClock{display:inline}
  #fndTray .slots{display:flex;gap:6px;align-items:center}
  #fndTray .slot{width:38px;height:38px;border-radius:50%;background:#ece9e1;display:grid;place-items:center;border:2px dashed #cfcabe;color:#c9c3b4;transition:.3s}
  #fndTray .slot svg{width:22px;height:22px}
  #fndTray .slot.got{background:#fff;border:2px solid #e0862a;color:#e0862a}
  #fndTray .slot.pop{animation:fndPop .5s}
  #fndTray .slot.now{border-color:#e0862a}
  #fndTray .slot.cat{overflow:hidden;align-items:end;width:44px;height:44px}#fndTray .slot.cat svg{width:40px;height:auto;margin-bottom:-5px;filter:grayscale(1);opacity:.3}#fndTray .slot.cat.got svg{filter:none;opacity:1}
  @keyframes fndPop{0%{transform:scale(.6)}60%{transform:scale(1.3)}100%{transform:scale(1)}}
  #fndBtns{display:flex;gap:8px;pointer-events:auto}
  #fndBtns button{border:0;cursor:pointer;min-height:48px;padding:10px 16px;font:500 16px Jost,sans-serif;display:flex;align-items:center;gap:8px;color:#1f2a3a}
  #fndBtns svg{width:24px;height:24px}#fndHelp svg{color:#e0862a}
  #fndSnd{width:48px;justify-content:center;padding:0}.fndSnd.off{color:#8a919e}.fndSnd .x{display:none}.fndSnd.off .x{display:inline}.fndSnd.off .w{display:none}
  #fndBar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;display:grid;grid-template-columns:60px minmax(150px,1fr) 60px;align-items:center;gap:10px;padding:8px;width:min(560px,calc(100% - 24px))}
  #fndBar button{width:60px;height:60px;border-radius:16px;border:0;background:#1f2948;color:#fff;cursor:pointer;display:grid;place-items:center}
  #fndBar button svg{width:28px;height:28px}#fndBar button:active{transform:scale(.95)}#fndBar button:disabled{opacity:.35}
  #fndBar .rm{text-align:center;min-width:0}#fndBar .rm b{display:block;font-size:18px;font-weight:500;line-height:1.2}#fndBar .rm span{display:block;font-size:14px;line-height:1.3;color:#4c5565;margin-top:2px}
  #fndWarm{position:fixed;left:50%;bottom:98px;transform:translateX(-50%);z-index:59;display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:999px;transition:opacity .3s}
  #fndWarm i{width:18px;height:18px;display:block;color:#d8d3c6;transition:color .25s,transform .25s}#fndWarm i svg{width:100%;height:100%;display:block}
  #fndWarm i.on{color:#e0862a;transform:scale(1.15)}#fndWarm em{font:normal 500 14px Jost,sans-serif;color:#4c5565;margin-left:6px;min-width:74px}
  html.fnd-hard #fndWarm, #fndWarm.off{opacity:0;pointer-events:none}
  #fndRing{position:fixed;z-index:55;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;border:4px solid #ffd77a;box-shadow:0 0 26px rgba(255,215,122,.95),inset 0 0 20px rgba(255,215,122,.5);pointer-events:none;opacity:0;transition:opacity .3s}
  #fndRing.on{opacity:1;animation:fndR 1.3s ease-in-out infinite}
  @keyframes fndR{0%,100%{transform:scale(.9)}50%{transform:scale(1.12)}}
  #fndEdge{position:fixed;top:44%;z-index:56;background:#1f2948;color:#fff;font:500 17px Jost,sans-serif;padding:10px 14px;border-radius:999px;display:flex;align-items:center;gap:6px;opacity:0;transition:opacity .3s;pointer-events:none}
  #fndEdge.l{left:10px}#fndEdge.r{right:10px;flex-direction:row-reverse}#fndEdge.on{opacity:1}#fndEdge svg{width:20px;height:20px}#fndEdge.r svg{transform:scaleX(-1)}
  #fndBubble{position:fixed;z-index:57;transform:translate(-50%,-100%);background:#fff;color:#1f2a3a;font:500 19px/1.25 Jost,sans-serif;padding:10px 16px;border-radius:18px;border:2px solid #1f2948;box-shadow:0 8px 24px rgba(0,0,0,.25);width:max-content;max-width:min(300px,78vw);text-align:center;pointer-events:none;opacity:0;transition:opacity .2s}
  #fndBubble.on{opacity:1}#fndBubble:after{content:"";position:absolute;left:50%;bottom:-9px;width:14px;height:14px;background:#fff;border-right:2px solid #1f2948;border-bottom:2px solid #1f2948;transform:translateX(-50%) rotate(45deg)}
  .fndTap{position:fixed;z-index:56;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid rgba(255,255,255,.9);box-shadow:0 0 0 2px rgba(31,41,72,.35);pointer-events:none;animation:fndTap .5s ease-out forwards}
  @keyframes fndTap{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}
  #fndFade{position:fixed;inset:0;z-index:70;background:#f6f3ec;display:grid;place-items:center;opacity:0;pointer-events:none;transition:opacity .28s;font-family:"Cormorant Garamond",Georgia,serif;color:#1f2a3a;text-align:center}
  #fndFade.on{opacity:1;pointer-events:auto}#fndFade svg{width:44px;height:44px;color:#e0862a;display:block;margin:0 auto 8px}#fndFade b{font-size:clamp(34px,7vw,52px);font-weight:600}
  #fndCard{position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(14,19,34,.45);font-family:Jost,sans-serif;padding:14px}
  #fndCard.clue{background:rgba(14,19,34,.28)}
  #fndCard .c{background:#fbfaf7;color:#1f2a3a;border-radius:24px;max-width:540px;width:100%;padding:20px 20px 18px;box-shadow:0 30px 90px rgba(0,0,0,.45);max-height:calc(100% - 28px);overflow:auto;text-align:center;animation:fndUp .35s ease-out}
  @keyframes fndUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
  #fndCard .cat{width:128px;margin:-4px auto 0}#fndCard .cat svg{width:100%;height:auto;display:block}
  #fndCard h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:clamp(32px,6vw,44px);font-weight:600;line-height:1;margin:4px 0 8px}
  #fndCard p{font-size:17px;line-height:1.4;margin:0 0 12px;color:#2b3442}
  #fndCard .camrow{display:flex;align-items:center;justify-content:center;gap:16px;margin:2px 0 12px;text-align:left}
  #fndCard .camrow p{margin:0;max-width:230px}
  .fndCam{position:relative;flex:none;width:150px;height:150px;border-radius:50%;overflow:hidden;border:6px solid #1f2948;box-shadow:0 6px 20px rgba(0,0,0,.3),inset 0 0 0 2px #fff;background:#ddd}
  .fndCam img{position:absolute;max-width:none;display:block}.fndCam svg{position:absolute;left:50%;bottom:-2px;width:74%;transform:translateX(-50%)}
  #fndCard .picks{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  #fndCard .picks button{border:3px solid transparent;border-radius:14px;padding:0;overflow:hidden;background:#fff;cursor:pointer;font:500 15px Jost,sans-serif;color:#1f2a3a;box-shadow:0 4px 14px rgba(0,0,0,.12)}
  #fndCard .picks img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#e7e3da}
  #fndCard .picks span{display:block;padding:6px 4px 8px;line-height:1.2}
  #fndCard .picks button:hover,#fndCard .picks button:focus-visible{border-color:#e0862a;outline:0}
  #fndCard .picks button.no{animation:fndS .4s;opacity:.4}#fndCard .picks button.yes{border-color:#2e7b59}
  @keyframes fndS{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
  #fndCard .stats{display:flex;justify-content:center;gap:24px;margin:4px 0 10px}#fndCard .stats b{display:block;font-size:26px;font-weight:500}#fndCard .stats span{font-size:14px;color:#5c6575}
  #fndCard .book{font-size:15px;color:#4c5565;margin:0 0 12px}#fndCard .book i{display:block;height:8px;border-radius:8px;background:#e7e3da;margin:6px auto 0;max-width:260px;overflow:hidden}#fndCard .book i u{display:block;height:100%;background:#e0862a;border-radius:8px}
  #fndCard .cta{background:#1f2948;color:#f4f1e8;border-radius:16px;padding:14px 16px;margin:12px 0 8px;text-align:left}
  #fndCard .cta b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:23px;font-weight:600;line-height:1.1;margin-bottom:4px}#fndCard .cta span{display:block;font-size:15px;line-height:1.35;color:#d5daE6;margin-bottom:10px}
  #fndCard .opt{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:14px}
  #fndCard .opt button{border:1px solid #cfcabe;background:#fff;color:#1f2a3a;border-radius:999px;padding:9px 16px;font:400 15px Jost,sans-serif;cursor:pointer;min-height:44px}
  #fndCard .opt button{display:inline-flex;align-items:center;gap:6px}#fndCard .opt button svg{width:20px;height:20px}#fndCard .opt #fndHard[aria-pressed=true]{background:#1f2948;border-color:#1f2948;color:#fff}
  #fndCard .sub{font-size:14px;color:#5c6575;margin:12px 0 0}
  .fndBtn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;border:1px solid #cfcabe;background:#fff;color:#1f2a3a;border-radius:999px;padding:0 20px;height:46px;font:400 16px/1 Jost,sans-serif;cursor:pointer;text-decoration:none;margin:4px 3px 0;vertical-align:middle}
  .fndBtn.big{font-size:20px;height:58px;padding:0 30px;background:#e0862a;border-color:#e0862a;color:#fff;font-weight:500}
  .fndBtn.next{background:#e0862a;border-color:#e0862a;color:#fff;font-weight:500}
  .fndBtn.primary{background:#9b2c3c;border-color:#9b2c3c;color:#fff;font-weight:500}
  #fndToast{position:fixed;left:16px;right:16px;top:150px;margin:0 auto;width:fit-content;transform:translateY(-10px);z-index:65;background:#1f2948;color:#fff;font:500 17px Jost,sans-serif;padding:11px 20px;border-radius:999px;opacity:0;transition:.3s;pointer-events:none;max-width:calc(100% - 32px);text-align:center}
  #fndToast.on{opacity:1;transform:none}
  .fndConf{position:fixed;z-index:95;width:10px;height:14px;top:-20px;pointer-events:none;animation:fndFall linear forwards}
  @keyframes fndFall{to{transform:translateY(110vh) rotate(720deg)}}
  .fndHeart{position:fixed;z-index:58;font-size:26px;color:#e2583e;pointer-events:none;animation:fndHeart 1.5s ease-out forwards}
  @keyframes fndHeart{from{transform:translate(-50%,0) scale(.6);opacity:1}to{transform:translate(-50%,-90px) scale(1.2);opacity:0}}
  @media (max-width:560px){#fndTop{top:56px;left:8px;right:8px}#fndTray{padding:8px 10px}#fndTray small{font-size:14px}#fndTray .slot{width:32px;height:32px}#fndTray .slot svg{width:18px;height:18px}#fndTray .slot.cat{width:38px;height:38px}#fndTray .slot.cat svg{width:34px}#fndBtns button{padding:10px 12px}#fndHelp{flex-direction:column;gap:2px;padding:6px 8px;min-width:58px}#fndHelp span{font-size:11.5px;line-height:1;white-space:nowrap}#fndHelp svg{width:22px;height:22px}#fndBtns{gap:6px}
    #fndBar{bottom:10px;gap:6px;grid-template-columns:56px minmax(0,1fr) 56px}#fndBar button{width:56px;height:56px}#fndBar .rm b{font-size:17px}#fndBar .rm span{font-size:13px}#fndWarm{bottom:88px}
    #fndCard{align-items:end;padding:8px}#fndCard .c{padding:16px 14px 14px;border-radius:22px}#fndCard .picks button{font-size:13.5px}.fndCam{width:124px;height:124px}#fndCard .camrow{gap:12px}#fndCard .camrow p{font-size:16px}#fndToast{top:132px;font-size:16px}}
  @media (prefers-reduced-motion:reduce){#fndRing.on,#fndTray .slot.pop,#fndCard .c,.fndTap{animation:none}}
  `;
  const IC = {l: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    r: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
    snd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z" fill="currentColor"/><path class="w" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="x" d="m16 9.5 5 5m0-5-5 5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>',
    ears: '<svg viewBox="0 0 170 78" aria-hidden="true"><path d="M18 80 L22 14 L58 44 Q85 34 112 44 L148 14 L152 80Z" fill="#101216"/><path d="M30 46 L28 28 L44 42Z M140 46 L142 28 L126 42Z" fill="#3a2f36"/></svg>'};
  const el = (tag, attrs, html) => { const e = document.createElement(tag); for(const k in (attrs || {})) e.setAttribute(k, attrs[k]); if(html != null) e.innerHTML = html; return e; };
  const DOM = []; const put = e => { document.body.appendChild(e); DOM.push(e); return e; };
  let ring, toastE, fade, bubble, edge, warm, styleE, tt = 0, ringUntil = 0, bubbleUntil = 0;
  const toast = (m, ms) => { toastE.textContent = m; toastE.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toastE.classList.remove('on'), ms || 2600); };
  const face = id => window.SNOWBALL.svg({id, seed: 7}).replace(/viewBox="[^"]+"/, 'viewBox="110 10 180 200"');
  function buildUI(){ styleE = el('style', {}, css); document.head.appendChild(styleE); document.documentElement.classList.add('fnd'); document.documentElement.classList.toggle('fnd-hard', S.hard);
    try{ if(!document.querySelector('link[href*="Jost"]')){ const l = el('link', {rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500&display=swap'}); document.head.appendChild(l); DOM.push(l); } }catch(e){}
    put(el('div', {id: 'fndTop'}, `<div class="fnd-chip" id="fndTray"><small>Find Snowball<em id="fndClock"></em></small><div class="slots" aria-hidden="true">${[0, 1, 2, 3].map(() => `<span class="slot">${PAWSVG()}</span>`).join('')}<span class="slot cat">${face('sbt')}</span></div></div>
      <div id="fndBtns"><button class="fnd-chip" id="fndHelp" type="button" aria-label="Show me where he is">${PAWSVG()}<span>Show me</span></button><button class="fnd-chip fndSnd" id="fndSnd" type="button">${IC.snd}</button></div>`));
    put(el('div', {id: 'fndBar', class: 'fnd-chip'}, `<button type="button" id="fndL" aria-label="Turn left">${IC.l}</button><div class="rm" aria-live="polite"><b id="fndRoom"></b><span id="fndFact"></span></div><button type="button" id="fndR" aria-label="Turn right">${IC.r}</button>`));
    warm = put(el('div', {id: 'fndWarm', class: 'fnd-chip off', 'aria-hidden': 'true'}, [0, 1, 2, 3, 4].map(() => `<i>${PAWSVG()}</i>`).join('') + '<em></em>'));
    ring = put(el('div', {id: 'fndRing'})); toastE = put(el('div', {id: 'fndToast', role: 'status'})); bubble = put(el('div', {id: 'fndBubble'})); edge = put(el('div', {id: 'fndEdge'}, IC.arrow + '<span>Jingle</span>'));
    fade = put(el('div', {id: 'fndFade'}, `<div>${PAWSVG()}<b></b></div>`));
    $('#fndL').onclick = () => turn(1); $('#fndR').onclick = () => turn(-1); $('#fndHelp').onclick = help; $('#fndSnd').onclick = () => { ac(); setMute(!SV.mute); snd('tap'); }; setMute(SV.mute); }
  function ui(){ const id = S.trail[S.step], R = ROOM[id]; if(!R) return; $('#fndRoom').textContent = R.name; $('#fndFact').textContent = R.fact;
    document.querySelectorAll('#fndTray .slot').forEach((s, i) => { s.classList.toggle('got', i < S.step || (i === S.step && /react|clue|done/.test(S.mode))); s.classList.toggle('now', i === S.step && S.mode === 'seek'); });
    const seek = S.mode === 'seek'; warm.classList.toggle('off', !seek || S.step === 0); $('#fndHelp').disabled = !seek; $('#fndL').disabled = $('#fndR').disabled = !seek; }
  function help(){ if(!S.on || S.mode !== 'seek' || H.anim) return; S.helps++; ga('find_help', {step: S.step}); lookAtPoint(_v.copy(S.P).setY(S.P.y + CH * .7), 650); ringUntil = performance.now() + 6000; S.tHint = performance.now(); snd('bell'); }

  /* ---------- where he is on the screen ---------- */
  function scr(p){ _v.copy(p); const d = cam.position.distanceTo(_v); _v.project(cam); if(_v.z > 1 || _v.z < -1) return null; const r = H.canvas.getBoundingClientRect();
    return {x: r.left + (_v.x + 1) / 2 * r.width, y: r.top + (1 - _v.y) / 2 * r.height, nx: _v.x, ny: _v.y, d, px: r.height / (2 * Math.tan(cam.fov * Math.PI / 360) * d)}; }
  const headPt = () => { const rx = -(S.P.z - anchor.z), rz = S.P.x - anchor.x, L = Math.hypot(rx, rz) || 1; return _b.set(S.P.x - rx / L * .17 * CW, CAT.position.y + CH * .76, S.P.z - rz / L * .17 * CW); };
  const relYaw = () => wrap(Math.atan2(S.P.x - anchor.x, S.P.z - anchor.z) - facing().yaw);   // + is to your left
  const panOf = () => clamp(-Math.sin(relYaw()) * .9, -.9, .9);
  function tapRing(x, y){ const t = put(el('i', {class: 'fndTap'})); t.style.left = x + 'px'; t.style.top = y + 'px'; later(() => t.remove(), 520); }
  H.hooks.click = (cx, cy) => { if(dead) return false; if(!S.on) return true; if(S.mode !== 'seek' || !CAT.visible) return true;   // every tap is ours: nobody walks off mid-game
    const s = scr(_a.copy(S.P).setY(S.P.y + CH * .5)); tw = null;
    if(s){ const hw = Math.max(40, s.px * CW * .62), hh = Math.max(46, s.px * CH * .62); if(Math.abs(cx - s.x) < hw && Math.abs(cy - s.y) < hh){ found(); return true; }
      if(Math.hypot(cx - s.x, cy - s.y) < Math.max(150, s.px * 3) && Math.abs(s.nx) < 1 && Math.abs(s.ny) < 1){ tapRing(cx, cy); snd('tap'); toast('Very close. He is right by there.', 1800); S.miss++; return true; } }
    tapRing(cx, cy); snd('tap'); S.miss++; if(S.miss === 3 || S.miss % 6 === 0) toast(S.hard ? 'Not there. Keep looking.' : 'Not there. Turn until the paws light up.', 2600); return true; };

  /* ---------- every frame ---------- */
  const WARMTXT = ['Cold', 'Cold', 'Warmer', 'Warm', 'Very warm', 'Right here'];
  let lastWarm = -1, blinkAt = 0, raf = 0, clockSec = -1;
  function frame(t){ if(dead) return; raf = requestAnimationFrame(frame);
    try{ if(tw){ const k = Math.min(1, (t - tw.t0) / tw.dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, o = tw; aim(o.y0 + o.dy * e, o.p0 + (o.p1 - o.p0) * e); if(k >= 1 && tw === o) tw = null; } pin(); }catch(e){}
    if(!S.on) return;
    if(S.hard && S.mode !== 'done'){ const sec = Math.floor((t - S.t0) / 1000); if(sec !== clockSec){ clockSec = sec; const ck = $('#fndClock'); if(ck) ck.textContent = fmtT(sec); } }
    if(t < bubbleUntil){ const s = scr(_a.copy(headPt()).setY(CAT.position.y + CH * 1.08)); if(s){ bubble.style.left = clamp(s.x, 150, innerWidth - 150) + 'px'; bubble.style.top = Math.max(120, s.y) + 'px'; bubble.classList.add('on'); } } else bubble.classList.remove('on');
    if(S.mode !== 'seek' || !CAT.visible){ ring.classList.remove('on'); return; }
    if(t > blinkAt){ const shut = CAT.material.map === TEX.open; CAT.material.map = shut ? TEX.shut : TEX.open; blinkAt = t + (shut ? 140 : 2400 + Math.random() * 2600); }
    const hs = scr(headPt()), inView = !!hs && Math.abs(hs.nx) < .92 && Math.abs(hs.ny) < .92, ry = relYaw(), ang = Math.abs(ry);
    const w = S.step === 0 ? 5 : inView ? (Math.abs(hs.nx) < .45 ? 5 : 4) : ang < 1.2 ? 3 : ang < 1.9 ? 2 : 1;
    if(w !== lastWarm){ lastWarm = w; warm.querySelectorAll('i').forEach((p, i) => p.classList.toggle('on', i < w)); warm.querySelector('em').textContent = WARMTXT[w]; }
    if(!S.hard) purrSet(w >= 4 ? (w - 3) / 2 : 0);
    if(inView){ if(!S.tSeen) S.tSeen = t; edge.classList.remove('on'); } else S.tSeen = 0;
    // he calls out now and then; the sound comes from his side
    if(t - S.tMeow > (S.step === 0 ? 5200 : 8500)){ S.tMeow = t; snd(Math.random() < .25 ? 'mrrp' : 'bell', {pan: panOf(), vol: inView ? .7 : 1});
      if(!S.hard && !inView && S.step > 0 && t - S.tSeek > 9000){ edge.className = ry > 0 ? 'l on' : 'r on'; later(() => edge.classList.remove('on'), 1700); } }
    // small players never get stuck: after a while he wiggles, then the ring finds him
    if(!S.hard && S.step > 0){ if(inView && S.tSeen && t - S.tSeen > 9000 && t - S.tHint > 9000){ S.tHint = t; hop(.35, 420); }
      if(t - S.tSeek > 32000 && t - S.tHint > 14000){ S.tHint = t; if(!inView) lookAtPoint(_v.copy(S.P).setY(S.P.y + CH * .7), 900); ringUntil = t + 5000; snd('bell'); } }
    if(t < ringUntil && hs && inView){ const r = clamp(hs.px * CH * .6, 46, 120); ring.style.width = ring.style.height = r * 2 + 'px'; ring.style.margin = -r + 'px 0 0 ' + -r + 'px'; ring.style.left = hs.x + 'px'; ring.style.top = hs.y + hs.px * CH * .12 + 'px'; ring.classList.add('on'); } else ring.classList.remove('on'); }
  function hop(hgt, ms, cb){ if(reduce){ cb && cb(); return; } const y0 = S.P.y, t0 = performance.now(); (function f(){ if(dead) return; const k = (performance.now() - t0) / ms; if(k >= 1){ CAT.position.y = y0; CAT.scale.set(CW, CH, 1); cb && cb(); return; } const a = Math.sin(k * Math.PI); CAT.position.y = y0 + a * hgt; CAT.scale.set(CW * (1 + .06 * a), CH * (1 + .1 * a), 1); requestAnimationFrame(f); })(); }
  function say(text, ms){ bubble.textContent = text; bubbleUntil = performance.now() + ms; }

  /* ---------- found him ---------- */
  function found(){ if(S.mode !== 'seek') return; S.mode = 'react'; const last = S.step === 4, id = S.trail[S.step], R = ROOM[id]; ring.classList.remove('on'); ringUntil = 0; edge.classList.remove('on'); toastE.classList.remove('on'); purrSet(0); ui();
    CAT.material.map = TEX.open; snd('mrrp'); if(!last) snd('find', {step: S.step, at: .16}); ga('find_cat', {step: S.step, room: id, spot: S.spot.i});
    const slot = document.querySelectorAll('#fndTray .slot')[S.step]; if(slot){ slot.classList.add('got', 'pop'); later(() => slot.classList.remove('pop'), 600); }
    lookAtPoint(_v.copy(S.P).setY(S.P.y + CH * .7), 500);
    if(last) return finale();
    say(R.say, 1900); hop(1.1, 520, () => hop(.5, 380)); later(() => runAway(() => later(clue, 350)), 1900); }
  function runAway(cb){ const path = S.path; CAT.visible = false; bubbleUntil = 0;
    if(!path || reduce){ if(path){ let side = 1; for(let i = 0; i < path.length; i++){ const q = path[i], p = i ? path[i - 1] : S.P; addPrint(q, Math.atan2(q.x - p.x, q.z - p.z), side); side = -side; } } return cb(); }
    const pts = [S.P.clone()].concat(path), seg = []; let total = 0; for(let i = 1; i < pts.length; i++){ const L = pts[i].distanceTo(pts[i - 1]); seg.push(L); total += L; }
    const dur = clamp(total * 95, 700, 1400), t0 = performance.now(), yaw = Math.atan2(pts[pts.length - 1].x - pts[1].x, pts[pts.length - 1].z - pts[1].z) || 0, hopDown = pts[0].y - pts[1].y > .3;
    cam.getWorldDirection(_d); const across = (-_d.z) * Math.sin(yaw) + _d.x * Math.cos(yaw), right = across > 0, away = _d.x * Math.sin(yaw) + _d.z * Math.cos(yaw) > .8 && Math.abs(across) < .55;   // to the right of the screen, or straight away from you?
    for(const k of ['runA', 'runB']){ TEX[k].repeat.x = right ? 1 : -1; TEX[k].offset.x = right ? 0 : 1; }
    const FA = away ? TEX.backA : TEX.runA, FB = away ? TEX.backB : TEX.runB; if(away) RUN.scale.set(1.5, 1.88, 1); else RUN.scale.set(2.25, 1.2, 1);
    RUN.material.map = FA; RUN.material.opacity = 1; RUN.visible = true; snd('patter', {n: Math.round(dur / 85)}); let laid = 0, side = 1;
    (function f(){ if(dead) return; const k = Math.min(1, (performance.now() - t0) / dur); let dist = k * total, i = 0; while(i < seg.length - 1 && dist > seg[i]){ dist -= seg[i]; i++; }
      const u = seg[i] ? dist / seg[i] : 1; RUN.position.lerpVectors(pts[i], pts[i + 1], u); if(i === 0 && hopDown) RUN.position.y += Math.sin(u * Math.PI) * .7;
      RUN.material.map = Math.floor(k * dur / (away ? 130 : 105)) % 2 ? FB : FA; RUN.material.opacity = k > .82 ? (1 - k) / .18 : 1;
      const done = k * total - (hopDown ? seg[0] : 0); while(laid * .85 < done - .5 && laid < 40){ const dd = laid * .85 + (hopDown ? seg[0] : 0); let j = 0, r = dd; while(j < seg.length - 1 && r > seg[j]){ r -= seg[j]; j++; } addPrint(_a.lerpVectors(pts[j], pts[j + 1], seg[j] ? r / seg[j] : 1), Math.atan2(pts[j + 1].x - pts[j].x, pts[j + 1].z - pts[j].z), side); side = -side; laid++; }
      if(k < 1) requestAnimationFrame(f); else { RUN.visible = false; cb(); } })(); }

  /* ---------- the Snowball cam: a detail of the room he ran to, and three rooms to choose from ---------- */
  function camHTML(k, R){ const rm = ROOM[k], c = rm.cam[Math.floor(R() * rm.cam.length)], Z = S.hard ? 4.2 : 3, w = Z * 100, h = Z * rm.ar * 100;
    const left = clamp(50 - c[0] * w, 100 - w, 0), top = clamp(50 - c[1] * h, 100 - h, 0);
    const st = `style="width:${w}%;left:${left.toFixed(1)}%;top:${top.toFixed(1)}%"`;
    return `<div class="fndCam"><img src="${rm.photo}" alt="" ${st}>${rm.big ? `<img src="${rm.big}" alt="" ${st}>` : ''}${IC.ears}</div>`; }
  function clue(){ if(dead) return; S.mode = 'clue'; ui(); const next = S.trail[S.step + 1], R = S.R, first = S.step === 0;
    const decoys = Object.keys(ROOM).filter(k => k !== next && k !== S.trail[S.step] && stopOf(k)).map(k => [R(), k]).sort((a, b) => a[0] - b[0]).slice(0, 2).map(a => a[1]), opts = [next].concat(decoys).map(k => [R(), k]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
    const c = put(el('div', {id: 'fndCard', class: 'clue', role: 'dialog', 'aria-label': 'Where did Snowball go?'}, `<div class="c"><h2>Where did he go?</h2>
      <div class="camrow">${camHTML(next, R)}<p>${first ? 'He ran off. This is what Snowball can see right now.' : 'Gone again. Here is what he sees now.'} <b>Tap the room he is in.</b></p></div>
      <div class="picks">${opts.map(k => `<button type="button" data-k="${k}"><img src="${ROOM[k].photo}" alt=""><span>${esc(ROOM[k].name)}</span></button>`).join('')}</div></div>`));
    c.querySelectorAll('.picks button').forEach(b => b.onclick = () => { if(b.dataset.k !== next){ b.classList.add('no'); b.disabled = true; S.wrong++; snd('wrong'); c.querySelector('.camrow p').innerHTML = 'Not that room. Look closely at what he sees. <b>Try another one.</b>'; return; }
      b.classList.add('yes'); snd('right'); c.querySelectorAll('button').forEach(x => x.disabled = true); later(() => { c.remove(); S.step++; travel(S.trail[S.step], false, arrive); }, 500); }); }

  /* ---------- the last room: he gives up ---------- */
  function confetti(){ if(reduce) return; const cols = ['#e0862a', '#9b2c3c', '#2d5a3e', '#e8b84a', '#3b6fd8', '#f6f5f1']; for(let i = 0; i < 70; i++){ const c = put(el('i', {class: 'fndConf'})); c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length]; c.style.animationDuration = 1.6 + Math.random() * 1.8 + 's'; c.style.animationDelay = Math.random() * .5 + 's'; later(() => c.remove(), 4200); } }
  function hearts(){ if(reduce) return; for(let i = 0; i < 5; i++) later(() => { const s = scr(headPt()); if(!s) return; const h = put(el('i', {class: 'fndHeart'}, '&#9829;')); h.style.left = s.x + (Math.random() * 60 - 30) + 'px'; h.style.top = s.y - 20 + 'px'; later(() => h.remove(), 1500); }, i * 260); }
  function finale(){ const secs = (performance.now() - S.t0) / 1000, id = S.trail[4], key = id + '.' + S.spot.i; snd('fanfare', {at: .2}); later(() => purrSet(1), 1700); confetti(); hearts(); say('You found me. Is it dinner time?', 2600); hop(1.2, 560, () => hop(.7, 420, () => hop(.35, 320)));
    let first = false, fresh = false; if(S.daily && SV.last !== DAY){ first = true; const y = new Date(now); y.setDate(y.getDate() - 1); SV.streak = SV.last === ymd(y) ? (SV.streak || 0) + 1 : 1; SV.last = DAY; }
    if(S.spot.i >= 0 && !SV.spots[key]){ SV.spots[key] = 1; fresh = true; } SV.total = (SV.total || 0) + 1; save(); ga('find_found', {secs: Math.round(secs), daily: S.daily, hard: S.hard, wrong: S.wrong, helps: S.helps, room: id, spot: S.spot.i});
    later(() => { S.mode = 'done'; ui(); finishCard(secs, first, fresh); }, 2700); later(() => { if(S.mode === 'done') purrSet(0); }, 7000); }
  function finishCard(secs, first, fresh){ const id = S.trail[4], where = S.spot.s.n + (S.spot.i >= 0 && !S.spot.s.n.includes(ROOM[id].name.toLowerCase()) ? ', ' + ROOM[id].at : ''), clean = !S.wrong && !S.helps, got = Object.keys(SV.spots).length;
    const medal = S.hard ? (clean && secs < 120 ? 'Gold medal. No help, no wrong rooms, and fast.' : clean ? 'Silver medal. No help and no wrong rooms.' : 'Bronze medal. You beat sneaky mode.') : '';
    const c = put(el('div', {id: 'fndCard', role: 'dialog', 'aria-label': 'You found Snowball'}, `<div class="c"><div class="cat">${window.SNOWBALL.svg({id: 'sbw', seed: 7, wear: WEAR, bell: BELL})}</div><h2>You found Snowball</h2>
      <p>He was ${esc(where)}. Dinner is served.${medal ? ' ' + medal : clean ? ' You never needed a hint.' : ''}</p>
      <div class="stats"><div><b>${fmtT(secs)}</b><span>${S.daily ? "today's trail" : 'this trail'}</span></div>${SV.streak > 1 ? `<div><b>${SV.streak}</b><span>days in a row</span></div>` : ''}</div>
      <p class="book">${fresh ? 'That is a new hiding place. ' : ''}You have found ${got} of his ${ALLSPOTS} hiding places.<i><u style="width:${Math.round(got / ALLSPOTS * 100)}%"></u></i></p>
      <div class="cta"><b>This house is real, and it is for sale.</b><span>118 Hillside Drive, Woodside. Six bedrooms, three baths, and every room Snowball just ran through.</span><a class="fndBtn primary" href="/#contact" id="fndSee">See it in person</a></div>
      <button class="fndBtn next" type="button" id="fndAgain">New trail</button><button class="fndBtn" type="button" id="fndShare">Share</button><a class="fndBtn" href="/games/">More games</a><a class="fndBtn" href="/tour/">Explore the house</a>
      ${first ? '<p class="sub">He hides somewhere new tomorrow.</p>' : ''}</div>`));
    $('#fndAgain').focus(); $('#fndSee').onclick = () => ga('find_cta', {cta: 'see_in_person'});
    $('#fndAgain').onclick = () => { c.remove(); S.daily = false; begin(rng(Math.floor(Math.random() * 1e9))); };
    $('#fndShare').onclick = async () => { const url = 'https://118hillside.com/games/snowball/', text = S.daily ? `I found Snowball the cat ${where} in ${fmtT(secs)} today. He hides somewhere new every day. Can you find him faster?` : `I found Snowball the cat ${where}. He is hiding again. Your turn.`; ga('find_share');
      try{ if(navigator.share){ await navigator.share({title: "Where's Snowball?", text, url}); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
      try{ await navigator.clipboard.writeText(text + ' ' + url); toast('Copied. Paste it to a friend.'); }catch(e){ toast(url, 6000); } }; }

  /* ---------- start ---------- */
  function begin(R){ document.documentElement.classList.toggle('fnd-hard', S.hard); newTrail(R); S.t0 = performance.now(); S.on = true; document.documentElement.classList.add('fnd-on'); S.mode = 'travel'; lastWarm = -1; ui(); travel('entry', true, fr => { S.t0 = performance.now(); arrive(fr); }); ga('find_start', {daily: S.daily, hard: S.hard}); }
  function startCard(){ const c = put(el('div', {id: 'fndCard', role: 'dialog', 'aria-label': "Where's Snowball?"}, `<div class="c"><div class="cat">${window.SNOWBALL.svg({id: 'sbs', seed: 7, wear: WEAR, bell: BELL})}</div><h2>Where's Snowball?</h2>
      <p>Dinner is ready, but Snowball wants to play hide and seek first. He is somewhere in this house.</p>
      <button class="fndBtn big" type="button" id="fndGo">Go find him</button>
      <div class="opt"><button type="button" id="fndHard" aria-pressed="${S.hard}">Sneaky mode</button><button type="button" class="fndSnd" id="fndSnd2">${IC.snd}<span></span></button></div>
      <p class="sub" id="fndSub"></p></div>`));
    const sub = () => { $('#fndSub').textContent = S.hard ? 'Sneaky mode: he hides better, nothing lights up, and there is a medal for speed.' : SV.streak > 1 && SV.last ? `You have found him ${SV.streak} days in a row.` : dailyDone ? 'You found him today already. He has hidden again.' : 'He hides somewhere new every day. Listen for the bell on his collar.'; }; sub();
    $('#fndGo').focus(); $('#fndSnd2').onclick = () => { ac(); setMute(!SV.mute); snd('bell'); }; setMute(SV.mute); $('#fndHard').onclick = e => { S.hard = !S.hard; SV.hard = S.hard; save(); e.currentTarget.setAttribute('aria-pressed', String(S.hard)); sub(); };
    $('#fndGo').onclick = () => { c.remove(); ac(); S.daily = !dailyDone && !Q.get('seed'); begin(Q.get('seed') ? rng(+Q.get('seed')) : S.daily ? rng(dayNum * 7919 + 13) : rng(Math.floor(Math.random() * 1e9))); }; }
  // the tour's own keys (arrows and space step through tour stops, letters walk) must never reach the engine while the game is up
  function onKey(e){ if(dead || e.metaKey || e.ctrlKey || e.altKey) return; const t = e.target, on = t && t.closest ? t : null, inCard = on && on.closest('#fndCard'), onBtn = on && on.closest('button,a[href],input,textarea,select');
    if(e.type === 'keydown' && S.on && !inCard){ if(e.key === 'ArrowLeft' || /^a$/i.test(e.key)) turn(1); else if(e.key === 'ArrowRight' || /^d$/i.test(e.key)) turn(-1); else if(/^h$/i.test(e.key)) help(); }
    e.stopImmediatePropagation(); if(/^Arrow|^ $|^Page|^Home$|^End$/.test(e.key) && !inCard && !(onBtn && e.key === ' ')) e.preventDefault(); }
  const onDown = e => { if(e.target === H.canvas) tw = null; try{ if(AC && AC.state === 'suspended' && !document.hidden) AC.resume(); }catch(err){} };
  function boot(){ try{ H.asBuilt && H.asBuilt(); H.setTOD('midday'); }catch(e){} if(Q.get('hard')) S.hard = Q.get('hard') === '1';
    addEventListener('keydown', onKey, true); addEventListener('keyup', onKey, true); addEventListener('pointerdown', onDown, true); document.addEventListener('visibilitychange', onVis);
    makeArt(() => { if(dead) return; buildUI(); raf = requestAnimationFrame(frame);
      const intro = document.getElementById('intro28'); if(intro){ const mo = new MutationObserver(() => { if(!document.getElementById('intro28')){ mo.disconnect(); if(!dead) startCard(); } }); mo.observe(document.body, {childList: true}); } else startCard(); }); }
  // start only once the engine is really drawing frames (the loading card can read "done" a moment before the first render)
  (function wait(n){ if(dead) return; let fr = 0; try{ fr = H.renderer.info.render.frame; }catch(e){} const ld = document.getElementById('loading'), up = ld && !ld.classList.contains('done');
    if((fr > 8 && !up) || n > 240) later(boot, 700); else later(() => wait(n + 1), 250); })(0);
  function destroy(){ dead = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); clearTimeout(tt); try{ if(PURR) PURR.stop(); if(AC) AC.close(); }catch(e){} document.removeEventListener('visibilitychange', onVis);
    removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKey, true); removeEventListener('pointerdown', onDown, true); if(H.scene.onBeforeRender === myOBR) H.scene.onBeforeRender = prevOBR; H.hooks.click = null;
    clearPrints(); OBJ.forEach(o => H.scene.remove(o)); DOM.forEach(e => e.remove()); document.querySelectorAll('.fndConf,.fndHeart,.fndTap,#fndCard').forEach(e => e.remove()); if(styleE) styleE.remove(); document.documentElement.classList.remove('fnd', 'fnd-hard', 'fnd-on'); window.FINDCAT = null; }
  window.FINDCAT = {S, ROOM, SV, help, found, turn, destroy, anchor, where: () => ({room: S.trail[S.step], spot: S.spot && S.spot.i, p: S.P.toArray(), scr: scr(headPt())}),
    dev: {measure, kit: () => AK, go(room, i){ document.querySelectorAll('#fndCard').forEach(e => e.remove()); ac(); S.on = true; document.documentElement.classList.add('fnd-on'); S.trail = ['entry', room, room, room, room]; S.step = 1; S.force = i; S.R = Math.random; S.t0 = performance.now(); travel(room, false, arrive); }, spots: () => Object.keys(ROOM).map(k => k + ':' + ROOM[k].spots.length).join(' ')}};
})();
