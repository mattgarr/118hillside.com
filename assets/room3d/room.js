/* Room for Everyone, in 3D: a logic puzzle played inside the 3D model of 118 Hillside Drive (the house as it is today).
   Loaded by tour/index.html only on ?room=...; talks to the engine through window.HILLSIDE.

   Animal guests arrive with clues. You decide who gets which room. Every puzzle has exactly one answer (room-logic.js proves it, and
   solve.js prints the proof), but some of what you need is not written down: where the morning sun lands, which windows look at
   the oak, which rooms have skylights. You find those out by going into the rooms and looking, and Snowball only checks a clue
   against things you have seen.

   How it is built:
   - Overview: the engine's own Dollhouse cut (rooms open at the top). The upper level lifts off to show what is under it.
     The game owns the camera (an orbit around the house); the engine never sees a pointer, wheel or key event while it runs.
   - Inside a room: you stand at a spot that was ray-checked clear of walls and furniture, look around freely, tap gold rings
     to note what is there, and drag the sun across a midsummer day. Sun patches are drawn from the model's real windows and
     skylights, dimmed by what rays cast through the model's trees, eaves and neighbours say reaches each one (room-data.js).
   - Sound is one small synthesized set (see SND); SND.measure() renders every cue offline and reports its level.
   Debug hook: window.ROOM3D (state, place, enter, leave, hint, solve, setHour, dev.*). */
(function(){
  'use strict';
  const H = window.HILLSIDE; if(!H || window.ROOM3D) return;
  const THREE = H.THREE, canvas = H.canvas, camera = H.camera, V3 = THREE.Vector3;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const Q = new URLSearchParams(location.search);
  const ga = (n, p) => { try{ window.gtag && gtag('event', n, p || {}); }catch(e){} };
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
  const LAYOUT = new URLSearchParams(location.search).get('layout');
  const phone = () => LAYOUT === 'wide' ? false : LAYOUT === 'phone' ? true : innerWidth < 900;
  const inPoly = (x, z, P) => { let c = false; for(let i = 0, j = P.length - 1; i < P.length; j = i++){ const a = P[i], b = P[j]; if((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  let LG = null, DATA = null;   // room-logic.js and room-data.js, loaded before anything is built
  const KEY = 'rfe3d.v1', DOY = 172, H0 = 7, H1 = 19.5;   // the sun is shown for 21 June, 7 AM to 7:30 PM
  const ORDER = ['primary', 'loft', 'garden', 'middle', 'front', 'corner', 'side', 'office', 'lounge', 'garage'];

  /* ================================================================== state */
  const SAVE = Object.assign({solved: {}, notes: {}, seen: {}, light: {}, tips: {}}, store.get(KEY) || {});
  const save = () => store.set(KEY, SAVE);
  const S = {view: 'boot', L: null, li: 0, at: {}, sel: null, room: null, busy: false, started: false, done: false, t0: 0, tEnd: 0, hints: 0, clean: true,
    upperOn: true, hour: 13, status: [], hintFor: null, hintTier: 0, dragPx: 0, lastAct: 0, sweeping: false, lightSeen: {lo: false, hi: false}};
  const elapsed = () => S.t0 ? ((S.tEnd || performance.now()) - S.t0) / 1000 : 0;

  /* ================================================================== the rooms, measured from the model */
  const GEO = {};
  function measure(){ const M = H.BIM2S.meta;
    for(const id of ORDER){ const sl = LG.SLOTS[id], sp = M.spaces.find(q => q.id === sl.sp), P = (sp.poly || sp.polygon).map(p => W2(p[0], p[1]));
      let a = 0, cx = 0, cz = 0; for(let i = 0, j = P.length - 1; i < P.length; j = i++){ const f = P[j][0] * P[i][1] - P[i][0] * P[j][1]; a += f; cx += (P[j][0] + P[i][0]) * f; cz += (P[j][1] + P[i][1]) * f; }
      const xs = P.map(p => p[0]), zs = P.map(p => p[1]);
      GEO[id] = {id, sp, P, fy: sp.floorZ || 0, c: [cx / (3 * a), cz / (3 * a)], area: Math.abs(a / 2), bb: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]}; } }
  function opening(id){ const o = H.BIM2S.meta.openings.find(q => q.id === id); if(!o) return null; const c = W2(o.center[0], o.center[1]), a = W2(o.axis[0], o.axis[1]), n0 = W2(o.normal[0], o.normal[1]);
    const out = o.spaces.A === 'EXTERIOR' ? n0 : [-n0[0], -n0[1]];   // the normal points at side A
    return {o, c, a, out, P: (along, y, inset) => new V3(c[0] + a[0] * along - out[0] * (inset || 0), y, c[1] + a[1] * along - out[1] * (inset || 0))}; }
  const skyItem = id => { try{ return (window.BL35.items || []).find(i => i.id === id) || null; }catch(e){ return null; } };
  const standOf = id => (DATA.stand && DATA.stand[id]) || {pos: [GEO[id].c[0], GEO[id].fy + 5, GEO[id].c[1]], face: [GEO[id].c[0] + 1, GEO[id].fy + 4.5, GEO[id].c[1]], pawn: [GEO[id].c[0], GEO[id].c[1]]};

  /* what there is to notice in each room. note: the fact it earns (room-logic.js), also: more facts the same look earns */
  const RINGS = {
    primary: [
      {note: 'door', also: ['view:hills'], op: 'D-L2-01', y: 3.4, label: 'Balcony doors', t: 'Glass doors stack open onto a private balcony that faces west, toward the hills.'},
      {note: 'sky', sky: ['SK-R07', 'SK-R08', 'SK-R09', 'SK-R10'], label: 'Skylights', t: 'Four skylights in the cathedral ceiling, each with its own shade.'},
      {note: 'view:oak', op: 'WN-L2-05', label: 'Garden window', t: 'The heritage oak fills this window.'},
      {note: 'bath', op: 'D-L2-04', y: 3.6, label: 'Door to the bath', t: 'Through here the suite has a hall of its own, a walk-in closet and a bath with two skylights. Nobody else in the house uses it.'}],
    loft: [{note: 'x:loft', op: 'WN-L2-11', label: 'Gable windows', t: 'A sitting loft at the top of the stairs, with tall windows in the gable. The primary suite is the only bedroom up here.'},
      // SK-R03 and SK-R04 are over the stair hall beside the loft, not over the loft's own floor: the model's rooms say so, and so does the puzzle
      {note: 'x:stairsky', beside: 1, sky: ['SK-R03', 'SK-R04'], label: 'Skylights over the stairs', t: 'These two skylights are over the stair hall, beside the loft. The loft has none in its own ceiling.'}],
    garden: [{note: 'view:oak', op: 'WN-L1-06', label: 'Window', t: 'This window looks into the back garden, straight at the heritage oak.'}],
    middle: [{note: 'view:side', op: 'WN-L1-08', label: 'Window', t: 'A wide window onto the side garden. The hall bath is the next door along the hallway.'}],
    front: [{note: 'view:street', op: 'WN-L1-05', label: 'Windows', t: 'Two windows over the front garden, toward Hillside Drive.'},
      {note: 'x:pocket', op: 'D-L1-08', y: 3.6, label: 'Pocket door', t: 'A pocket door straight into the dining and sitting area. This bedroom is not on the bedroom hallway.'}],
    corner: [{note: 'film', op: 'WN-L0-03', label: 'Rainbow window', t: 'Rainbow film on every pane. When the sun comes through it, the floor goes all colours.'},
      {note: 'view:terrace', op: 'WN-L0-06', label: 'Terrace window', t: 'This one looks onto the terrace and the outdoor kitchen under the pergola.'}],
    side: [{note: 'film', op: 'WN-L0-07', label: 'Rainbow window', t: 'Rainbow film on the lower panes, clear glass above.'},
      {note: 'sky', sky: ['SK-R05', 'SK-R06'], label: 'Skylights', t: 'Two skylights in this room’s own ceiling, one toward each end.'}],
    office: [{note: 'sky', sky: ['SK-R11', 'SK-R12'], label: 'Skylights', t: 'Two skylights and windows on two walls. The lower level’s own front door is just outside this room.'}],
    lounge: [{note: 'door', also: ['view:terrace'], op: 'D-L0-10', y: 3.4, label: 'Glass doors', t: 'Three glass panels stack open onto the terrace, under the heritage oak.'},
      {note: 'tv', at: [-22.6, 1.0, -20.4], label: 'Big screen', t: 'A big screen on the wall with speakers built in around it, and a drinks fridge beside it.'}],
    garage: [{note: 'ev', op: 'D-LG-01', y: 4.2, label: 'Garage door', t: 'An oversized garage with a tall ceiling. It has a 50-amp, 240-volt outlet, the kind an electric car or an RV plugs into.'}]};
  function ringAt(slot, r){ if(r._at) return r._at; let p = null;
    if(r.at) p = r.at.slice();
    else if(r.op){ const op = opening(r.op); if(op){ const y = r.y != null ? GEO[slot].fy + r.y : (op.o.sill + op.o.head) / 2, v = op.P(0, y, .35); p = [v.x, v.y, v.z]; } }
    else if(r.sky){ const st = standOf(slot); let best = null;   // the skylight you can see best from where you stand: near, but not right overhead
      for(const id of r.sky){ const it = skyItem(id), q = it && it.rects && it.rects[0]; if(!q) continue; const d = Math.hypot(q.c.x - st.pos[0], q.c.z - st.pos[2]), sc = Math.abs(d - 2.2); if(!best || sc < best.sc) best = {sc, c: q.c}; }   // the glass at the top of a well is only seen from nearly under it
      if(best) p = [best.c.x, best.c.y - .4, best.c.z]; }
    if(!p) p = [GEO[slot].c[0], GEO[slot].fy + 6.5, GEO[slot].c[1]]; r._at = p; return p; }
  const NOTE_TXT = {bath: 'A bath of its own', door: 'A door straight outside', sky: 'Skylights', film: 'Rainbow film on a window', 'view:oak': 'Looks at the old oak', 'view:terrace': 'Looks onto the terrace',
    'view:street': 'Looks toward the street', 'view:hills': 'Looks west to the hills', 'view:side': 'Looks onto the side garden', tv: 'The big screen', ev: 'A 50-amp, 240-volt outlet',
    'x:loft': 'Tall gable windows', 'x:pocket': 'Opens off the dining area', 'x:stairsky': 'Skylights over the stairs beside it, none of its own'};
  const NOTE_ICO = {bath: 'bath', door: 'door', sky: 'sky', film: 'film', 'view:oak': 'oak', 'view:terrace': 'terrace', 'view:street': 'street', 'view:hills': 'hills', 'view:side': 'leaf', tv: 'tv', ev: 'ev', 'x:loft': 'win', 'x:pocket': 'win', 'x:stairsky': 'sky'};
  const hasNote = (slot, n) => !!(SAVE.notes[slot] && SAVE.notes[slot][n]);
  // what you know: a thing a room has, once you have looked at it; a thing it lacks, once you have been inside; its light, once you have watched it
  const known = (slot, note, has) => note === 'light' ? !!SAVE.light[slot] : has ? hasNote(slot, note) : !!SAVE.seen[slot];

  /* ================================================================== sun */
  function sunAt(h){ const p = H.sunPosition(h, DOY), plan = p.az - 46.14 * Math.PI / 180, alt = Math.max(p.alt, -.02);
    return {alt: p.alt, v: new V3(Math.cos(plan) * Math.cos(alt), Math.sin(alt), Math.sin(plan) * Math.cos(alt)).normalize()}; }
  if(!H.TOD.find(t => t.key === 'rfe')) H.TOD.push({key: 'rfe', label: 'Midsummer', h: 13, doy: DOY});
  let todAt = 0, todTimer = 0, todKey = '';
  function applyHour(h, force){ S.hour = h; if(SUN.cur) SUN.cur.update(); wake(20); clearTimeout(todTimer); const now = performance.now();
    const go = () => { todAt = performance.now(); const T = H.TOD.find(t => t.key === 'rfe'); T.h = h; T.doy = DOY; T.label = fmtH(h); try{ H.setTOD('rfe'); todKey = 'rfe'; }catch(e){ console.warn('[room] tod', e); } wake(30); };
    if(force || now - todAt > 420) go(); else todTimer = setTimeout(go, 200); }
  // how much of the sun reaches one opening at an hour (0..1): from the rays cast in the model, half-hourly from 7:00
  function litOf(str, h){ if(!str) return 1; const x = clamp((h - H0) * 2, 0, str.length - 1), i = Math.floor(x), f = x - i, a = +str[i] / 9, b = +str[Math.min(str.length - 1, i + 1)] / 9; return lerp(a, b, f); }
  const SKY_NOON = lin('#4a9fee'), SKY_LOW = lin('#f2b27a');   // what a skylight shows from inside: midday blue, warm when the sun is low
  const SUN = {rooms: {}, cur: null,
    // every opening of a room that the sun can come through: its glass as a quad, which way it faces, and its measured share of sun
    openings(slot){ const out = [], D = (DATA.sun || {})[slot] || [];
      for(const d of D){ if(d.id){ const op = opening(d.id); if(!op) continue; const half = op.o.width / 2 - .22, bot = op.o.sill + .15, top = op.o.head - .15;
          out.push({id: d.id, lit: d.lit, n: new V3(op.out[0], 0, op.out[1]), quad: [op.P(-half, bot), op.P(half, bot), op.P(half, top), op.P(-half, top)], film: d.id === 'WN-L0-03' ? 1 : d.id === 'WN-L0-07' ? .55 : 0}); }
        else if(d.sk){ const it = skyItem(d.sk), r = it && it.rects && it.rects[0]; if(!r) continue; const c = new V3(r.c.x, r.c.y, r.c.z), u = new V3(r.u.x, r.u.y, r.u.z).multiplyScalar(r.hu), v = new V3(r.v.x, r.v.y, r.v.z).multiplyScalar(r.hv);
          out.push({id: d.sk, lit: d.lit, n: new V3(0, 1, 0), rn: new V3(r.n.x, r.n.y, r.n.z), sky: true, quad: [c.clone().sub(u).sub(v), c.clone().add(u).sub(v), c.clone().add(u).add(v), c.clone().sub(u).add(v)]}); } }
      return out; },
    strength(o, h){ const s = sunAt(h); const inc = s.v.dot(o.n); return clamp((s.alt - .03) / .09, 0, 1) * clamp(inc / .16, 0, 1) * smooth(.36, .62, litOf(o.lit, h)); },   // under about four rays in nine it is dapple, not sun
    // the hours a room has direct sun, as the game states them
    facts(slot){ const O = SUN.openings(slot); let am = false, pm = false, any = false; const spans = []; let open = null;
      for(let h = H0; h <= H1 + 1e-6; h += .25){ let m = 0; for(const o of O) m = Math.max(m, SUN.strength(o, h)); const on = m >= .45;
        if(on){ any = true; if(h <= 10) am = true; if(h >= 17.5) pm = true; if(open == null) open = h; } else if(open != null){ spans.push([open, h - .25]); open = null; } }
      if(open != null) spans.push([open, H1]);
      return {am, pm, none: !any, spans}; },
    text(slot){ const f = SUN.facts(slot); if(f.none) return 'No direct sun at any hour'; const names = []; if(f.am) names.push('in the morning'); if(f.spans.some(s => s[1] >= 11 && s[0] <= 16.5)) names.push('in the middle of the day'); if(f.pm) names.push('in the evening');
      const hr = h => fmtH(h).replace(':00', ''); return 'Direct sun ' + names.join(' and ') + ': ' + f.spans.map(s => hr(s[0]) + ' to ' + hr(s[1])).join(', '); },
    build(slot){ if(SUN.rooms[slot]) return SUN.rooms[slot]; const G = GEO[slot], O = SUN.openings(slot), bb = G.bb, ppf = 22, fy = G.fy + .06;
      const cv = document.createElement('canvas'); cv.width = Math.ceil((bb[2] - bb[0]) * ppf); cv.height = Math.ceil((bb[3] - bb[1]) * ppf); const g = cv.getContext('2d');
      const tex = new THREE.CanvasTexture(cv); tex.premultiplyAlpha = true; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      // light multiplies what is under it: out = floor * (1 + light), so oak stays oak and a rug stays a rug
      const mat = new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor});
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(bb[2] - bb[0], bb[3] - bb[1]), mat); mesh.rotation.x = -Math.PI / 2; mesh.position.set((bb[0] + bb[2]) / 2, fy, (bb[1] + bb[3]) / 2);
      mesh.renderOrder = 2; mesh.name = 'rfe-light'; mesh.raycast = () => {}; mesh.visible = false; H.scene.add(mesh);
      const px = v => [(v.x - bb[0]) * ppf, (v.z - bb[1]) * ppf];
      // the glass itself glows when the sun is on it, so you can tell even where a bed hides the floor
      for(const o of O){ const q = o.quad, d = o.sky ? new V3(0, -.12, 0) : o.n.clone().multiplyScalar(-.1), a = []; for(const i of [0, 1, 2, 0, 2, 3]) a.push(q[i].x + d.x, q[i].y + d.y, q[i].z + d.z);
        const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
        o.glow = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({color: 0xffe2a8, map: o.film ? SUN.rainbow() : null, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide}));
        o.glow.renderOrder = 5; o.glow.raycast = () => {}; o.glow.visible = false; o.glow.name = 'rfe-glow'; H.scene.add(o.glow);
        // seen from inside, a skylight is a patch of sky. The model's own sky is nearly the colour of the ceiling from below, so each pane gets
        // a plain sky-coloured sheet just outside its glass, shown only while you stand in the room
        if(o.sky && o.rn){ const up = o.rn.clone().multiplyScalar(-.3), b = []; for(const i of [0, 1, 2, 0, 2, 3]) b.push(q[i].x + up.x, q[i].y + up.y, q[i].z + up.z);
          const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(b, 3));
          o.pane = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({color: SKY_NOON.clone(), toneMapped: false, fog: false, side: THREE.DoubleSide})); o.pane.raycast = () => {}; o.pane.visible = false; o.pane.name = 'rfe-skypane'; H.scene.add(o.pane); } }
      const api = {slot, mesh, O, level: 0,
        update(){ const s = sunAt(S.hour), d = s.v, low = 1 - Math.min(1, d.y / .5); g.clearRect(0, 0, cv.width, cv.height); let any = 0;
          for(const o of O) if(o.pane){ o.pane.visible = S.view === 'room'; o.pane.material.color.copy(SKY_NOON).lerp(SKY_LOW, low * low); }
          const proj = v => { const t = (v.y - fy) / Math.max(.02, d.y); return new V3(v.x - d.x * t, fy, v.z - d.z * t); };
          for(const o of O){ const k = SUN.strength(o, S.hour); o.s = k; const lit = k >= .3 && S.view === 'room'; o.glow.visible = lit; o.glow.material.opacity = lit ? k * (o.film ? .5 : .32) : 0; if(k < .3) continue; any = Math.max(any, k); const q = o.quad.map(proj).map(px);
            g.save(); g.globalAlpha = k; g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
            const warm = `rgb(255,${Math.round(238 - 46 * low)},${Math.round(206 - 86 * low)})`;
            if(o.film){ const gr = g.createLinearGradient(q[0][0], q[0][1], q[1][0], q[1][1]); ['#ff6b6b', '#ffb347', '#fff275', '#7be495', '#6ec5ff', '#b28dff', '#ff8ad4'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
              g.shadowColor = '#ffd9a0'; g.shadowBlur = 3; g.fillStyle = warm; g.globalAlpha = k * (1 - o.film * .75); g.fill(); g.globalAlpha = k * o.film; g.fillStyle = gr; g.fill(); }
            else { g.shadowColor = g.fillStyle = warm; g.shadowBlur = o.sky ? 5 : 3; g.fill(); }
            g.restore(); }
          if(any > 0){ g.save(); g.globalCompositeOperation = 'destination-in'; g.beginPath(); G.P.forEach((p, i) => { const q = [(p[0] - bb[0]) * ppf, (p[1] - bb[1]) * ppf]; i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); g.restore(); }
          api.level = any; mesh.visible = any > 0 && S.view === 'room'; const gain = 1.5; mat.color.setRGB(gain, gain * .94, gain * .8); tex.needsUpdate = true; }};
      SUN.rooms[slot] = api; return api; },
    rainbow(){ if(SUN._rb) return SUN._rb; const c = document.createElement('canvas'); c.width = 128; c.height = 4; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 128, 0); ['#ff6b6b', '#ffb347', '#fff275', '#7be495', '#6ec5ff', '#b28dff', '#ff8ad4', '#ffb347', '#7be495'].forEach((q, i, a) => gr.addColorStop(i / (a.length - 1), q)); g.fillStyle = gr; g.fillRect(0, 0, 128, 4); return (SUN._rb = new THREE.CanvasTexture(c)); },
    show(slot){ for(const k in SUN.rooms){ SUN.rooms[k].mesh.visible = false; for(const o of SUN.rooms[k].O){ o.glow.visible = false; if(o.pane) o.pane.visible = false; } } SUN.cur = slot ? SUN.build(slot) : null; if(SUN.cur) SUN.cur.update(); }};

  /* ================================================================== the engine keeps out of the way */
  const css0 = `html.rfe header.bar, html.rfe #card, html.rfe #mini, html.rfe #cv27, html.rfe #labels, html.rfe #wplabels, html.rfe #ovtag, html.rfe #tod, html.rfe #viewBtn,
    html.rfe #hwBtn, html.rfe #tgBtn, html.rfe #phMore, html.rfe .g28pill, html.rfe #navHelp, html.rfe #pad, html.rfe #peek27, html.rfe #v33disc, html.rfe #hint, html.rfe #joy,
    html.rfe .navguide, html.rfe .phtoast, html.rfe .perfpill, html.rfe #wptip, html.rfe #door28tip, html.rfe #door28hint, html.rfe .qhint, html.rfe .phlvbar, html.rfe #ov,
    html.rfe #toggles, html.rfe #lvSeg, html.rfe .phdx{display:none!important}
    html.rfe.rfe-up #loading{display:none!important}
    html.rfe #c{cursor:grab;touch-action:none} html.rfe.rfe-drag #c{cursor:grabbing}`;
  document.head.appendChild(el('style', {}, css0)); document.documentElement.classList.add('rfe');
  H.hooks.click = () => true;
  const ptrs = new Map(); let pinch = 0, panMid = null;
  const onCanvas = e => e.target === canvas;
  const live = () => S.started && !S.busy && !rig.move && (!S.done || (S.view === 'win' && !document.getElementById('rfeCard')));
  addEventListener('pointerdown', e => { if(!onCanvas(e)) return; e.stopPropagation();
    if(!S.started) return; try{ canvas.setPointerCapture(e.pointerId); canvas.focus({preventScroll: true}); }catch(_){}
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), far: 0, btn: e.button, shift: e.shiftKey}); pinch = 0; panMid = null;
    document.documentElement.classList.add('rfe-drag'); SND.unlock(); closeMenus(); if(UI.clues && S.view === 'room') UI.clues(false); }, true);
  addEventListener('pointermove', e => { if(!onCanvas(e)) return; e.stopPropagation(); const p = ptrs.get(e.pointerId); if(!p) return;
    if(e.pointerType === 'mouse' && e.buttons === 0){ endPtr(e, false); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.far = Math.max(p.far, Math.hypot(p.x - p.sx, p.y - p.sy));
    if(ptrs.size >= 2){ const [a, b] = [...ptrs.values()], d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if(pinch) rigZoom(pinch / d); pinch = d; if(panMid && S.view === 'over') rigPan(mid[0] - panMid[0], mid[1] - panMid[1]); panMid = mid; return; }
    if(S.view === 'over' && (p.btn === 2 || p.shift)) rigPan(dx, dy); else rigDrag(dx, dy); }, true);
  function endPtr(e, tap){ const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); pinch = 0; panMid = null; if(!ptrs.size) document.documentElement.classList.remove('rfe-drag');
    try{ canvas.releasePointerCapture(e.pointerId); }catch(_){}
    if(tap && p && p.far < 8 && performance.now() - p.t < 500) tapAt(e.clientX, e.clientY); }
  addEventListener('pointerup', e => { if(onCanvas(e)) e.stopPropagation(); if(ptrs.has(e.pointerId)) endPtr(e, onCanvas(e)); }, true);
  addEventListener('pointercancel', e => { if(onCanvas(e)) e.stopPropagation(); if(ptrs.has(e.pointerId)) endPtr(e, false); }, true);
  canvas.addEventListener('lostpointercapture', e => { if(ptrs.has(e.pointerId)) endPtr(e, false); });
  const dropPtrs = () => { ptrs.clear(); pinch = 0; panMid = null; document.documentElement.classList.remove('rfe-drag'); };
  addEventListener('blur', dropPtrs); document.addEventListener('visibilitychange', () => { if(document.hidden) dropPtrs(); });
  addEventListener('wheel', e => { if(!onCanvas(e)) return; e.stopPropagation(); e.preventDefault(); if(!live()) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1); rigZoom(Math.exp(clamp(dy, -240, 240) * .0016)); }, {capture: true, passive: false});
  for(const t of ['dblclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'click']) addEventListener(t, e => { if(onCanvas(e)){ e.stopPropagation(); if(t === 'contextmenu') e.preventDefault(); } }, {capture: true, passive: t !== 'contextmenu'});
  // keys: the tour's shortcuts (arrows and space jump between tour stops) must never fire during the game
  addEventListener('keydown', e => { const dlg = document.querySelector('dialog[open]'); if(dlg) return; e.stopPropagation();
    if(!S.started || S.done) return; const tag = (e.target && e.target.tagName) || '';
    if(e.key === 'Escape'){ if(anyMenu()) closeMenus(); else if(S.sel){ select(null); } else if(S.view === 'room') leave(); return; }
    if(/INPUT|TEXTAREA|SELECT/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
    if(tag === 'BUTTON' || tag === 'A') return;
    const k = {ArrowLeft: [-60, 0], ArrowRight: [60, 0], ArrowUp: [0, -40], ArrowDown: [0, 40]}[e.key];
    if(k && live()){ e.preventDefault(); rigDrag(k[0], k[1]); } }, true);
  addEventListener('keyup', e => { if(!document.querySelector('dialog[open]')) e.stopPropagation(); }, true);

  /* ================================================================== camera rig
     One pose (position, look-at point, field of view, screen offset). Over the house it comes from an orbit; in a room from a
     standing point and the way you face. Moves between the two are flown along a curve and never pass control to the engine. */
  const rig = {pos: new V3(0, 60, 60), at: new V3(), fov: 40, off: [0, 0], move: null, wakeN: 0, jit: 0, sig: '',
    orb: {T: [0, 0, -6], th: 2.5, phi: .62, r: 140, zoom: 1, fit: 140, fov: 38, pan: [0, 0]},
    st: {pos: new V3(), yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, fov: 62, zoom: 1}};
  const aspect = () => (canvas.clientWidth || innerWidth) / Math.max(1, canvas.clientHeight || innerHeight);
  const yp = (from, to) => { const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2]; return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
  function placeFov(base){ base = base || 64; const a = aspect(); if(a >= 1.25) return base; const t = Math.tan(base / 2 * Math.PI / 180) * 1.25 / a; return Math.min(88, 2 * Math.atan(t) * 180 / Math.PI); }
  function wake(n){ rig.wakeN = Math.max(rig.wakeN, n || 20); }
  // the part of the screen the house (or the room) can use, in pixels
  function freeRect(){ const W = innerWidth, Hh = innerHeight; let l = 12, t = 84, r = W - 12, b = Hh - 16; const pn = $('#rfePanel'), box = q => { const e = $(q); return e ? e.getBoundingClientRect() : null; };
    if(S.view === 'win') return {l: 8, t: 76, r: W - 8, b: Hh - 96, W, Hh};
    if(phone()){ l = 6; r = W - 6;
      if(S.view === 'room'){ const rc = box('#rfeRoom'), dk = box('#rfeSun'); t = (rc && rc.height > 10 ? rc.bottom : 150) + 6; b = (dk && dk.height > 10 ? dk.top : Hh - 190) - 6; }
      else { const g = box('#rfeGoal'), q = pn ? pn.getBoundingClientRect() : null; t = (g && g.height > 10 ? g.bottom : 120) + 6; b = (q && q.height > 10 ? q.top : Hh - 300) - 58; } }
    else { if(pn){ const q = pn.getBoundingClientRect(); if(q.width > 10) l = q.right + 14; } b = Hh - 78; }
    if(r - l < 120){ l = 6; r = W - 6; } if(b - t < 110){ t = 60; b = Hh - 60; } return {l, t, r, b, W, Hh}; }
  // where the orbit puts the camera, fitted so the house fills the free part of the screen
  function orbitFit(){ const o = rig.orb, F = freeRect(), cam = orbitFit.cam || (orbitFit.cam = new THREE.PerspectiveCamera()); cam.fov = o.fov; cam.aspect = F.W / F.Hh; cam.updateProjectionMatrix();
    const T = new V3(o.T[0], o.T[1], o.T[2]), sp = Math.sin(o.phi), dir = new V3(sp * Math.sin(o.th), Math.cos(o.phi), sp * Math.cos(o.th));
    if(!orbitFit.pts){ orbitFit.pts = []; for(const sp of H.BIM2S.meta.spaces){ const fz = sp.floorZ || 0, P = sp.poly || sp.polygon; for(const p of P){ orbitFit.pts.push([p[1], fz, p[0], fz > 4]); orbitFit.pts.push([p[1], fz + (fz > 4 ? 9 : 8), p[0], fz > 4]); } } }
    const pts = orbitFit.pts.filter(p => S.upperOn || !p[3]).map(p => new V3(p[0], p[1], p[2]));
    const hw = (F.r - F.l) / F.W, hh = (F.b - F.t) / F.Hh; let lo = 30, hi = 520;
    // the house's own extent on screen is not centred on the point the camera looks at, so the fit measures it and re-centres it
    let cx = 0, cy = 0; const _q = new V3();
    for(let i = 0; i < 22; i++){ const r = (lo + hi) / 2; cam.position.copy(T).addScaledVector(dir, r); cam.lookAt(T); cam.updateMatrixWorld(true); let x0 = 9, x1 = -9, y0 = 9, y1 = -9, bad = false;
      for(const p of pts){ _q.copy(p).project(cam); if(_q.z > 1) bad = true; x0 = Math.min(x0, _q.x); x1 = Math.max(x1, _q.x); y0 = Math.min(y0, _q.y); y1 = Math.max(y1, _q.y); }
      if(!bad && (x1 - x0) / 2 <= hw * (phone() ? .97 : .9) && (y1 - y0) / 2 <= hh * (phone() ? .92 : .84)){ hi = r; cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; } else lo = r; }
    o.fit = hi; o.offFit = [((F.l + F.r) / 2) / F.W - .5 - cx / 2, ((F.t + F.b) / 2) / F.Hh - .5 + cy / 2]; }
  function orbitPose(){ const o = rig.orb, r = o.fit * o.zoom, sp = Math.sin(o.phi), T = [o.T[0] + o.pan[0], o.T[1], o.T[2] + o.pan[1]];
    return {pos: [T[0] + r * sp * Math.sin(o.th), T[1] + r * Math.cos(o.phi), T[2] + r * sp * Math.cos(o.th)], at: T, fov: o.fov, off: (o.offFit || [0, 0]).slice()}; }
  function standPose(){ const s = rig.st, cp = Math.cos(s.pitch), p = s.pos; return {pos: [p.x, p.y, p.z], at: [p.x - Math.sin(s.yaw) * cp * 10, p.y + Math.sin(s.pitch) * 10, p.z - Math.cos(s.yaw) * cp * 10], fov: clamp(s.fov * s.zoom, 20, 88), off: [s.offX || 0, s.offY || 0]}; }
  function rigDrag(dx, dy){ if(!live()) return; S.dragPx += Math.abs(dx) + Math.abs(dy); S.lastAct = performance.now();
    if(S.view === 'over' || S.view === 'win'){ const o = rig.orb; o.th -= dx * .0052; o.phi = clamp(o.phi - dy * .004, .12, 1.12); }
    else if(S.view === 'room'){ const s = rig.st, k = (camera.fov * Math.PI / 180) / Math.max(200, canvas.clientHeight) * 1.05; s.tyaw += dx * k; s.tpitch = clamp(s.tpitch + dy * k, -1.15, 1.25); s.slow = false; S.lookBack = 0; } }
  function rigZoom(f){ if(!live()) return; if(S.view === 'over' || S.view === 'win'){ const o = rig.orb; o.zoom = clamp(o.zoom * f, .3, 1.15); } else if(S.view === 'room'){ const s = rig.st; s.zoom = clamp(s.zoom * f, .5, 1); } }
  function rigPan(dx, dy){ if(!live() || S.view !== 'over') return; const o = rig.orb, k = o.fit * o.zoom * 2 * Math.tan(o.fov * Math.PI / 360) / Math.max(200, canvas.clientHeight);
    const rx = Math.cos(o.th), rz = -Math.sin(o.th), fx = -Math.sin(o.th), fz = -Math.cos(o.th);   // screen right and screen up, on the ground
    o.pan[0] = clamp(o.pan[0] - dx * k * rx + dy * k * fx / Math.max(.35, Math.cos(o.phi)), -34, 34); o.pan[1] = clamp(o.pan[1] - dx * k * rz + dy * k * fz / Math.max(.35, Math.cos(o.phi)), -44, 44); }
  // fly from the pose we are in to another, along an arc when a middle point is given
  function rigFly(to, opts){ opts = opts || {}; const from = {pos: rig.pos.clone(), at: rig.at.clone(), fov: rig.fov, off: rig.off.slice()};
    const dur = reduce ? .01 : (opts.dur || 1); rig.move = {t0: performance.now(), dur: dur * 1000, from, to: {pos: new V3(...to.pos), at: new V3(...to.at), fov: to.fov, off: (to.off || [0, 0]).slice()}, mid: opts.mid ? new V3(...opts.mid) : null, done: opts.done || null}; return dur; }
  function rigCut(p){ rig.move = null; rig.pos.set(...p.pos); rig.at.set(...p.at); rig.fov = p.fov; rig.off = (p.off || [0, 0]).slice(); rig.sig = ''; }
  const _a = new V3(), _b = new V3(), _p = new V3();
  function rigStep(now, dt){ const m = rig.move;
    if(m){ const u = clamp((now - m.t0) / m.dur, 0, 1), e = ease(u);
      if(m.mid){ _a.lerpVectors(m.from.pos, m.mid, e); _b.lerpVectors(m.mid, m.to.pos, e); rig.pos.lerpVectors(_a, _b, e); } else rig.pos.lerpVectors(m.from.pos, m.to.pos, e);
      rig.at.lerpVectors(m.from.at, m.to.at, e); rig.fov = lerp(m.from.fov, m.to.fov, e); rig.off = [lerp(m.from.off[0], m.to.off[0], e), lerp(m.from.off[1], m.to.off[1], e)];
      if(u >= 1){ rig.move = null; if(m.done) try{ m.done(); }catch(err){ console.error('[room] arrive', err); } } }
    else if(S.view === 'over' || S.view === 'win' || S.view === 'title'){ const p = orbitPose(); rig.pos.set(...p.pos); rig.at.set(...p.at); rig.fov = p.fov; rig.off = p.off; }
    else if(S.view === 'room'){ const s = rig.st, k = 1 - Math.exp(-dt * (s.slow && !reduce ? 4.5 : 16)); s.yaw += angDiff(s.yaw, s.tyaw) * k; s.pitch += (s.tpitch - s.pitch) * k;
      if(Math.abs(angDiff(s.yaw, s.tyaw)) < 2e-4) s.yaw = s.tyaw; if(Math.abs(s.tpitch - s.pitch) < 2e-4) s.pitch = s.tpitch;
      const p = standPose(); rig.pos.set(...p.pos); rig.at.set(...p.at); rig.fov = p.fov; rig.off = p.off; }
    if(rig.wakeN > 0){ rig.wakeN--; rig.jit = rig.jit ? 0 : 2e-4; }
    // write the pose only when it changed, so a still view lets the engine render its sharp frame
    const sig = [rig.pos.x, rig.pos.y + rig.jit, rig.pos.z, rig.at.x, rig.at.y, rig.at.z, rig.fov, rig.off[0], rig.off[1], aspect()].map(n => n.toFixed(4)).join(',');
    const drift = H.anim || H.nav !== 'look' || camera.position.distanceToSquared(_p.set(rig.pos.x, rig.pos.y + rig.jit, rig.pos.z)) > 1e-7;
    if(sig === rig.sig && !drift) return; rig.sig = sig;
    H.look([rig.pos.x, rig.pos.y + rig.jit, rig.pos.z], [rig.at.x, rig.at.y, rig.at.z]);
    const ox = rig.off[0], oy = rig.off[1], cw = Math.max(1, canvas.clientWidth || innerWidth), ch = Math.max(1, canvas.clientHeight || innerHeight);
    if(Math.abs(ox) > 1e-4 || Math.abs(oy) > 1e-4) camera.setViewOffset(cw, ch, -ox * cw, -oy * ch, cw, ch); else if(camera.view) camera.clearViewOffset();
    camera.aspect = cw / ch; camera.fov = rig.fov; camera.zoom = 1; camera.userData.sy = 0; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); }

  /* ================================================================== the house: cut open over the top, or whole when you are inside */
  const HOUSE = {mode: '', hid: [],
    level(up){ try{ const want = up ? 'upper' : 'main', b = document.querySelector('#lvSeg button[data-lv="' + want + '"]'); if(b && b.getAttribute('aria-checked') !== 'true') b.click(); }catch(e){ console.warn('[room] level', e); } },
    over(){ try{ if(H.mode !== 'doll') H.setMode('doll'); HOUSE.level(S.upperOn); }catch(e){ console.warn('[room] doll', e); }
      // the neighbours' houses are context for a walk, not for a board
      if(!HOUSE.hid.length && H.GROUPS.land) H.GROUPS.land.traverse(o => { if(o.name && /^neighbours-/.test(o.name) && o.visible){ o.visible = false; HOUSE.hid.push(o); } });
      HOUSE.mode = 'over'; PAWN.sync(); wake(40); },
    inside(){ for(const o of HOUSE.hid) o.visible = true; HOUSE.hid.length = 0; try{ if(H.mode !== 'tour') H.setMode('tour'); }catch(e){ console.warn('[room] tour', e); } HOUSE.mode = 'in'; PAWN.sync(); wake(40); },
    restore(){ for(const o of HOUSE.hid) o.visible = true; HOUSE.hid.length = 0; }};
  // a still of the frame on screen, laid over the canvas while the house changes underneath, then faded away
  function dissolve(change, then){ let img = null;
    try{ if(!reduce){ const src = H.snapshot('image/jpeg', .82); img = el('img', {id: 'rfeShot', alt: '', src}); document.body.appendChild(img); } }catch(e){ img = null; }
    try{ change(); }catch(e){ console.error('[room] cut', e); } wake(40);
    const fin = () => { if(img && img.parentNode) img.remove(); if(then){ const f = then; then = null; f(); } };
    if(!img){ fin(); return; }
    setTimeout(() => { img.classList.add('out'); setTimeout(fin, 520); }, 90); }

  /* ================================================================== guests as game pieces */
  /*PIECES*/
  /* One game piece per guest, made of plain shapes so each reads from above and from across a room: the animal in its own colours,
     on a round base in the guest's colour (the same colour as its medallion in the guest list and the tint on its floor).
     Every figure faces +x and stands on the floor at y = 0. Sizes are in feet; the pieces are toys, not life size. */
  function buildPiece(THREE, G, lin){
    const g = new THREE.Group(), fig = new THREE.Group(); g.add(fig);
    const M = (col, o) => new THREE.MeshStandardMaterial(Object.assign({color: lin(col), roughness: .6, metalness: 0}, o || {}));
    const add = (geo, m, p, r, s) => { const x = new THREE.Mesh(geo, m); if(p) x.position.set(p[0], p[1], p[2]); if(r) x.rotation.set(r[0], r[1], r[2]); if(s) x.scale.set(s[0], s[1], s[2]); fig.add(x); return x; };
    const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 20, h || 14), cyl = (a, b, h, n) => new THREE.CylinderGeometry(a, b, h, n || 16), cone = (r, h, n) => new THREE.ConeGeometry(r, h, n || 14), box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
    const dark = M('#22252d', {roughness: .3}), white = M('#f7f3ea'), wood = M('#9a7650', {roughness: .75}), pink = M('#e79a96');
    const pair = (geo, m, p, r, s) => { add(geo, m, p, r, s); add(geo, m, [p[0], p[1], -p[2]], r ? [-r[0], -r[1], r[2]] : null, s); };   // the same part on both sides
    const eyes = (x, y, z, r) => pair(sph(r || .085, 10, 8), dark, [x, y, z]);
    const base = r => { const b = new THREE.Mesh(cyl(r * .94, r, .24, 36), M(G.col, {roughness: .45})); b.position.y = .12; g.add(b);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * .9, .035, 6, 40), M('#fff6de', {roughness: .5})); rim.rotation.x = Math.PI / 2; rim.position.y = .25; g.add(rim); fig.position.y = .24; };
    const k = G.ico;
    if(k === 'duck'){ base(1.3); const body = M('#f8f5ec'), bill = M('#f29a2e');
      add(sph(.85), body, [-.08, .95, 0], null, [1.3, .95, 1]); add(cone(.3, .65), body, [-1.08, 1.4, 0], [0, 0, 1]);
      add(cyl(.3, .4, .75), body, [.58, 1.7, 0], [0, 0, -.25]); add(sph(.47), body, [.74, 2.28, 0]);
      add(sph(.26), bill, [1.2, 2.17, 0], null, [1.4, .42, .95]); eyes(.98, 2.42, .3, .075);
      pair(sph(.55), M('#e6e0d0'), [-.15, 1.1, .78], null, [1.15, .62, .28]); pair(sph(.24), bill, [.25, .08, .36], null, [1.4, .3, .9]); }
    else if(k === 'dog'){ base(1.3); const fur = M('#d9a443', {roughness: .75}), pale = M('#eccb82', {roughness: .75}), ear = M('#b47f2b', {roughness: .8});
      add(sph(.76), fur, [-.15, .95, 0], null, [.98, 1.18, .92]); add(sph(.5), pale, [.3, 1.0, 0], null, [.7, 1.05, .8]);
      add(sph(.6), fur, [.32, 2.18, 0]); add(sph(.3), pale, [.86, 2.02, 0], null, [1.35, .82, .92]); add(sph(.115, 10, 8), dark, [1.24, 2.1, 0]); eyes(.76, 2.34, .3);
      pair(sph(.3), ear, [.22, 2.06, .6], [-.28, 0, 0], [.6, 1.3, .36]);
      pair(cyl(.16, .14, 1.0), fur, [.52, .5, .3]); pair(sph(.2), pale, [.64, .1, .3], null, [1.35, .6, 1]); pair(sph(.45), fur, [-.25, .42, .55], null, [1.1, .8, .6]);
      add(cyl(.1, .06, .95), fur, [-.98, .42, 0], [0, 0, 1.15]); }
    else if(k === 'fish'){ base(1.25); const glass = M('#e4f4f9', {transparent: true, opacity: .16, roughness: .05, depthWrite: false}), water = M('#7fd0e8', {transparent: true, opacity: .26, roughness: .1, depthWrite: false, side: THREE.DoubleSide}), gold = M('#ff6a00', {emissive: lin('#ff5a00'), emissiveIntensity: .55, roughness: .4});
      add(cyl(.5, .66, .46), M('#efe6d2'), [0, .23, 0]);
      add(sph(.36), gold, [.12, 1.36, 0], null, [1.45, 1, .78]); add(cone(.34, .5, 4), gold, [-.6, 1.36, 0], [0, 0, -Math.PI / 2], [1, 1, .35]); add(cone(.15, .3, 4), gold, [.02, 1.78, 0], [0, 0, .5], [1, 1, .35]); eyes(.46, 1.45, .2, .06);
      const w = add(new THREE.SphereGeometry(.93, 24, 12, 0, Math.PI * 2, .9, Math.PI - .9), water, [0, 1.42, 0]); w.renderOrder = 6; const top = add(new THREE.CircleGeometry(.73, 24), water, [0, 2.0, 0], [-Math.PI / 2, 0, 0]); top.renderOrder = 6;
      const b = add(sph(1.0, 24, 18), glass, [0, 1.42, 0]); b.renderOrder = 7; add(new THREE.TorusGeometry(.5, .06, 8, 28), M('#e8f4f8', {transparent: true, opacity: .7, roughness: .1}), [0, 2.3, 0], [Math.PI / 2, 0, 0]).renderOrder = 7; }
    else if(k === 'rooster'){ base(1.3); const body = M('#b8562c'), neck = M('#e3a43b'), red = M('#d7332f'), yel = M('#f2b632'), tail = M('#1f4f43');
      add(sph(.8), body, [-.05, 1.3, 0], null, [1.15, 1, .9]); add(cyl(.33, .5, .95), neck, [.48, 2.05, 0], [0, 0, -.3]); add(sph(.39), neck, [.68, 2.64, 0]);
      for(const [x, y] of [[.5, 3.04], [.69, 3.12], [.88, 3.02]]) add(sph(.17, 12, 10), red, [x, y, 0], null, [1, 1, .5]);
      add(cone(.12, .36), yel, [1.12, 2.6, 0], [0, 0, -Math.PI / 2]); add(sph(.13, 12, 10), red, [.98, 2.3, 0], null, [.8, 1.5, .6]); eyes(.86, 2.74, .27, .06);
      pair(sph(.55), M('#8f4021'), [-.1, 1.35, .72], null, [1.1, .7, .25]);
      for(const [x, y, a] of [[-.82, 2.2, .2], [-.98, 2.0, .5], [-1.14, 1.72, .85]]) add(sph(.3), tail, [x, y, 0], [0, 0, a], [.5, 2.2, .26]);
      pair(cyl(.06, .06, .7), yel, [.08, .35, .25]); pair(sph(.16, 12, 8), yel, [.2, .05, .25], null, [1.6, .3, 1]); }
    else if(k === 'lizard'){ base(1.3); const skin = M('#d99e45', {roughness: .8}), pale = M('#e6b962', {roughness: .8}), beard = M('#8a5f22', {roughness: .8});
      const rock = add(new THREE.SphereGeometry(1.1, 9, 6), M('#8f867a', {roughness: .9, flatShading: true}), [-.05, .26, 0], null, [1.05, .36, .88]); rock.rotation.y = .4;
      add(sph(.5), skin, [-.15, .86, 0], null, [1.65, .55, 1.08]); add(sph(.36), pale, [.82, 1.12, 0], null, [1.25, .78, 1.15]); add(sph(.3), beard, [.76, .9, 0], null, [1, .62, 1.3]);
      pair(cone(.07, .22, 8), beard, [.74, .98, .44], [Math.PI / 2, 0, 0]); eyes(1.0, 1.25, .27, .06);
      add(cone(.25, 1.25), skin, [-1.02, .76, .32], [0, .55, 1.42]);
      pair(cyl(.1, .08, .55), skin, [.42, .7, .62], [-.9, 0, 0]); pair(cyl(.1, .08, .55), skin, [-.6, .66, .64], [-.9, 0, 0]);
      for(let i = 0; i < 5; i++) add(cone(.055, .16, 6), beard, [-.7 + i * .26, 1.14 - Math.abs(i - 2) * .03, 0]); }
    else if(k === 'owl'){ base(1.2); const buff = M('#d8b57a', {roughness: .8}), wing = M('#b68b50', {roughness: .8});
      add(cyl(.42, .5, .8), wood, [0, .4, 0]);
      add(sph(.72), buff, [0, 1.66, 0], null, [.9, 1.2, .85]); add(sph(.6), white, [.22, 1.6, 0], null, [.75, 1.1, .62]);
      add(sph(.56), buff, [.05, 2.6, 0], null, [1, .92, 1.05]);
      pair(sph(.33), white, [.47, 2.64, .2], null, [.36, 1.05, .95]); add(sph(.22), white, [.5, 2.38, 0], null, [.36, .9, .9]);
      eyes(.6, 2.7, .2, .095); add(cone(.07, .2, 8), M('#e2c08e'), [.64, 2.48, 0], [0, 0, -2.2]);
      pair(sph(.6), wing, [-.1, 1.62, .62], null, [.5, 1.25, .3]); pair(sph(.12, 10, 8), M('#e2b04a'), [.22, .84, .2]); }
    else if(k === 'hamster'){ base(1.2); const fur = M('#e2a95b', {roughness: .8}), pale = M('#f1cd92', {roughness: .8}), cream = M('#fbf3e2', {roughness: .8});
      add(sph(.85), fur, [0, .92, 0], null, [1, 1.1, 1]); add(sph(.7), cream, [.28, .82, 0], null, [.7, 1, .85]);
      add(sph(.6), fur, [.12, 1.72, 0]); pair(sph(.42), pale, [.42, 1.5, .38]);
      pair(sph(.2, 12, 10), M('#c98a6a'), [0, 2.26, .42], null, [.5, 1, 1]); eyes(.62, 1.85, .26, .095); add(sph(.075, 10, 8), pink, [.76, 1.66, 0]);
      pair(sph(.14, 10, 8), pink, [.64, 1.12, .22]); pair(sph(.2, 12, 8), pink, [.36, .08, .4], null, [1.4, .5, 1]); }
    else if(k === 'rabbit'){ base(1.25); const fur = M('#cfc2b2', {roughness: .85}), inner = M('#eeb7b0', {roughness: .8});
      add(sph(.8), fur, [-.12, .82, 0], null, [1.1, 1, .95]); add(sph(.55), fur, [.48, 1.72, 0]);
      pair(sph(.2), fur, [.34, 2.72, .2], [.12, 0, .15], [.72, 3.3, .46]); pair(sph(.13), inner, [.42, 2.72, .2], [.12, 0, .15], [.5, 3.6, .46]);
      eyes(.86, 1.85, .3, .085); add(sph(.07, 10, 8), pink, [1.02, 1.68, 0]); pair(sph(.2), white, [.84, 1.56, .14], null, [.8, .7, .8]);
      add(sph(.25), white, [-.98, .72, 0]); pair(sph(.18, 12, 8), fur, [.55, .1, .28], null, [1.3, .6, 1]); pair(sph(.25, 12, 8), fur, [.02, .1, .56], null, [1.6, .5, .8]); }
    else if(k === 'parrot'){ base(1.2); const grey = M('#8b929b', {roughness: .75}), pale = M('#aab0b7', {roughness: .75}), wing = M('#727983', {roughness: .75}), red = M('#d63a2e');
      add(cyl(.07, .07, 1.5), wood, [0, .75, 0]); add(cyl(.07, .07, 1.3), wood, [0, 1.5, 0], [Math.PI / 2, 0, 0]); add(cyl(.4, .46, .1), wood, [0, .05, 0]);
      add(sph(.3), red, [-.42, 1.5, 0], [0, 0, -.5], [.55, 1.7, .6]);
      add(sph(.58), grey, [-.05, 2.26, 0], [0, 0, -.15], [.9, 1.35, .85]); add(sph(.45), pale, [.2, 3.1, 0]);
      pair(sph(.22, 12, 10), white, [.47, 3.16, .22], null, [.42, 1, 1]); eyes(.56, 3.18, .25, .06);
      add(sph(.2, 12, 10), dark, [.62, 2.98, 0], null, [1.1, 1.2, .7]); add(cone(.1, .26, 8), dark, [.73, 2.8, 0], [0, 0, Math.PI]);
      pair(sph(.5), wing, [-.15, 2.2, .5], null, [.45, 1.3, .3]); pair(sph(.09, 8, 6), dark, [.06, 1.58, .15]); }
    else if(k === 'guinea'){ base(1.3); const brown = M('#7d4e2a', {roughness: .85}), ginger = M('#d98a3d', {roughness: .85}), cream = M('#f6efe2', {roughness: .85}); fig.scale.set(1.12, 1.12, 1.12);
      add(sph(.72), cream, [-.1, .74, 0], null, [1.45, .95, 1.05]); add(sph(.66), brown, [-.6, .76, 0], null, [1, .94, 1.07]);
      add(sph(.55), ginger, [.78, .86, 0], null, [1.1, .95, 1]); add(sph(.3), cream, [1.06, .95, 0], null, [1, .9, .45]);
      pair(sph(.17, 12, 10), M('#a56a4a'), [.6, 1.32, .42], null, [.4, .9, 1.1]); eyes(1.08, 1.03, .34, .08); add(sph(.07, 10, 8), pink, [1.36, .82, 0]);
      pair(sph(.14, 10, 8), pink, [.62, .07, .38], null, [1.4, .5, 1]); pair(sph(.14, 10, 8), pink, [-.62, .07, .4], null, [1.4, .5, 1]); }
    else if(k === 'tortoise'){ base(1.4); const shell = M('#7b7a3c', {roughness: .7}), rim = M('#5c592b', {roughness: .7}), scute = M('#9a9750', {roughness: .7}), skin = M('#b0a862', {roughness: .85});
      add(new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell, [-.08, .42, 0], null, [1.12, .88, .95]); add(cyl(1.0, 1.04, .16, 28), rim, [-.08, .42, 0], null, [1.12, 1, .95]);
      add(sph(.33), scute, [-.08, 1.2, 0], null, [1.1, .3, 1]); for(const [x, z] of [[.5, 0], [-.66, 0], [-.08, .52], [-.08, -.52]]) add(sph(.3), scute, [x, 1.0, z], null, [1, .3, 1]);
      add(cyl(.17, .2, .55), skin, [1.02, .62, 0], [0, 0, -1.1]); add(sph(.3), skin, [1.3, .78, 0]); eyes(1.46, .86, .2, .055);
      pair(cyl(.2, .22, .46), skin, [.6, .23, .64]); pair(cyl(.2, .22, .46), skin, [-.76, .23, .64]); add(cone(.1, .3, 8), skin, [-1.28, .38, 0], [0, 0, Math.PI / 2]); }
    else if(k === 'wheel'){ base(1.3); const steel = M('#c9ced6', {metalness: .6, roughness: .35}), tread = M('#7fcfe0', {roughness: .6, side: THREE.DoubleSide}), frame = M(G.col);
      for(const z of [-.34, .34]) add(new THREE.TorusGeometry(1.15, .07, 8, 36), steel, [0, 1.42, z]);
      add(new THREE.CylinderGeometry(1.15, 1.15, .66, 36, 1, true), tread, [0, 1.42, 0], [Math.PI / 2, 0, 0]);
      for(let i = 0; i < 3; i++) add(cyl(.035, .035, 2.3, 6), steel, [0, 1.42, -.34], [0, 0, i * Math.PI / 3]);
      add(cyl(.1, .1, .9, 10), steel, [0, 1.42, -.1], [Math.PI / 2, 0, 0]);
      for(const s of [-1, 1]) add(cyl(.07, .07, 1.62, 8), frame, [s * .42, .7, -.52], [0, 0, s * .52]); add(box(1.9, .12, .5), frame, [0, .06, -.52]); }
    else if(k === 'lettuce'){ base(1.3); const leaf = M('#6fb53a', {roughness: .8, flatShading: true}), heart = M('#b4de62', {roughness: .8}), soil = M('#4a3526', {roughness: .95});
      for(const x of [-.95, .95]) for(const z of [-.45, .45]) add(cyl(.07, .07, .7, 8), wood, [x, .35, z]);
      add(box(2.3, .38, 1.3), M('#b98a55', {roughness: .7}), [0, .86, 0]); add(box(2.14, .1, 1.14), soil, [0, 1.04, 0]);
      for(const x of [-.7, 0, .7]) for(const z of [-.3, .3]){ const h = add(new THREE.SphereGeometry(.31, 7, 5), leaf, [x, 1.24, z], [0, x * 2 + z * 3, 0], [1, .78, 1]); h.rotation.x = .2 * z; add(sph(.16, 8, 6), heart, [x, 1.4, z]); } }
    else if(k === 'scope'){ base(1.2); const tube = M(G.col, {roughness: .35}), cream = M('#f1e9d6');
      for(let i = 0; i < 3; i++){ const a = i * 2.094; add(cyl(.055, .055, 2.6, 8), dark, [Math.cos(a) * .52, 1.2, Math.sin(a) * .52], [Math.sin(a) * .4, 0, -Math.cos(a) * .4]); }
      add(sph(.16, 12, 10), dark, [0, 2.4, 0]); add(cyl(.27, .21, 2.5, 18), tube, [.05, 2.75, 0], [0, 0, -1.05]); add(cyl(.29, .29, .16, 18), cream, [1.1, 3.35, 0], [0, 0, -1.05]); add(cyl(.1, .1, .3, 10), dark, [-1.1, 2.1, 0], [0, 0, -1.05]); }
    else if(k === 'van'){ const paint = M(G.col, {roughness: .3, metalness: .25}), glass = M('#dfe9ef', {roughness: .15}), lamp = M('#fff3c4', {emissive: lin('#ffe9a8'), emissiveIntensity: .5});
      add(box(5.2, 1.9, 2.4), paint, [0, 1.45, 0]); add(box(1.5, .75, 2.44), glass, [1.55, 1.9, 0]); add(box(.06, .8, 2.0), glass, [2.6, 1.9, 0]); add(box(1.9, .6, 2.44), glass, [-.9, 1.95, 0]);
      for(const [x, z] of [[-1.6, -1.2], [-1.6, 1.2], [1.6, -1.2], [1.6, 1.2]]) add(cyl(.52, .52, .3, 18), dark, [x, .52, z], [Math.PI / 2, 0, 0]);
      pair(box(.06, .2, .4), lamp, [2.61, 1.0, .8]); add(box(.3, .3, .06), M('#f2b632'), [-2.0, 1.2, 1.21]); }
    else { base(1.2); add(sph(.7), M(G.col), [0, .8, 0]); }
    return g; }
  /*PIECES-END*/
  // Over the house a piece is drawn at twice its size and more, like a token on a board, so it reads from that far away; inside a room it is toy size.
  const PAWN = {g: {}, hop: {}, K_OVER: 2.4, K_IN: 1,
    build(id){ const g = buildPiece(THREE, LG.GUESTS[id], lin); g.userData.h = new THREE.Box3().setFromObject(g).max.y;
      g.traverse(o => { o.raycast = () => {}; if(o.isMesh){ o.castShadow = false; o.receiveShadow = false; } }); g.name = 'rfe-pawn:' + id; g.visible = false; H.scene.add(g); PAWN.g[id] = g; return g; },
    spot(slot){ const s = standOf(slot); return s.pawn || GEO[slot].c; },
    // every piece where its guest is; pieces upstairs go away with the upper level
    sync(){ if(!S.L) return; for(const id of Object.keys(PAWN.g)){ const g = PAWN.g[id], slot = S.at[id], on = !!slot && S.L.guests.indexOf(id) >= 0;
        if(!on){ g.visible = false; continue; } const p = PAWN.spot(slot), G = GEO[slot]; g.position.set(p[0], G.fy + .02, p[1]);
        // over the house a piece faces the way the house is first seen from; in the room you are standing in, it turns to look at you
        const st = standOf(slot); let yaw = st.pawnYaw != null ? st.pawnYaw : .9;
        if(st.pawnYaw == null && S.view === 'room' && S.room === slot){ const e = standOf(slot).pos; yaw = Math.atan2(-(e[2] - p[1]), e[0] - p[0]); }
        g.rotation.y = yaw;
        const k = HOUSE.mode === 'over' ? PAWN.K_OVER : PAWN.K_IN; g.userData.k = k; if(!PAWN.hop[id]) g.scale.set(k, k, k);
        g.visible = !(HOUSE.mode === 'over' && !S.upperOn && LG.SLOTS[slot].lv === 'upper'); }
      wake(10); },
    drop(id){ PAWN.hop[id] = performance.now(); wake(40); },
    step(now){ for(const id in PAWN.hop){ const g = PAWN.g[id], u = (now - PAWN.hop[id]) / 520, k = (g && g.userData.k) || 1; if(!g || u >= 1){ if(g){ g.scale.set(k, k, k); const sl = S.at[id]; if(sl) g.position.y = GEO[sl].fy + .02; } delete PAWN.hop[id]; continue; }
        const sl = S.at[id]; if(!sl) continue; const b = Math.sin(Math.min(1, u * 1.25) * Math.PI) * 1.6 * k * (1 - u * .5), sq = u > .8 ? 1 - Math.sin((u - .8) / .2 * Math.PI) * .12 : 1; g.position.y = GEO[sl].fy + .02 + b; g.scale.set(k / Math.sqrt(sq), k * sq, k / Math.sqrt(sq)); wake(3); } }};

  /* floor tints: which rooms can take the guest in your hand, and the lids that keep rooms dark until their light comes on */
  const TINT = {m: {}, lid: {},
    shape(slot, y){ const P = GEO[slot].P, tri = THREE.ShapeUtils.triangulateShape(P.map(p => new THREE.Vector2(p[0], p[1])), []), pos = [];
      for(const t of tri) for(const i of [t[2], t[1], t[0]]) pos.push(P[i][0], y, P[i][1]); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g; },
    build(){ for(const id of ORDER){ const m = new THREE.Mesh(TINT.shape(id, GEO[id].fy + .09), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide}));
        m.renderOrder = 3; m.raycast = () => {}; m.visible = false; m.name = 'rfe-tint'; H.scene.add(m); TINT.m[id] = m;
        const lid = new THREE.Mesh(TINT.shape(id, GEO[id].fy + (LG.SLOTS[id].lv === 'garage' ? 8.6 : 7.9)), new THREE.MeshBasicMaterial({color: 0x05070d, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide}));
        lid.renderOrder = 4; lid.raycast = () => {}; lid.visible = false; lid.name = 'rfe-lid'; H.scene.add(lid); TINT.lid[id] = lid; } },
    step(now){ const over = S.view === 'over' && !rig.move; for(const id of ORDER){ const m = TINT.m[id], sl = LG.SLOTS[id]; let col = null, op = 0;
        const hiddenUp = !S.upperOn && sl.lv === 'upper';
        if(over && !hiddenUp){ const occ = occupant(id); if(S.sel){ const ok = fits(S.sel, id); if(ok){ col = '#e8b84a'; op = .2 + .12 * Math.sin(now / 260); } } else if(S.hover === id){ col = '#ffffff'; op = .16; }
          if(!col && occ){ col = LG.GUESTS[occ].col; op = .2; } }
        if(op <= 0){ if(m.visible){ m.visible = false; wake(4); } continue; }
        m.material.color.set(col); if(Math.abs(m.material.opacity - op) > .004 || !m.visible){ m.material.opacity = op; m.visible = true; wake(3); } } }};

  /* ================================================================== sound
     One small set, all Web Audio, the same recipe as the other games in the house: soft mallet and bell tones from a few
     decaying sine partials, every pitch from D major pentatonic, filtered noise for movement, a short feedback delay for a
     little room, a compressor before a quiet master. Nothing plays before the first tap; the context sleeps with the tab. */
  const SND = (() => {
    const N = {D3: 146.83, A3: 220, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, B4: 493.88, D5: 587.33, E5: 659.26, Fs5: 739.99, A5: 880, B5: 987.77, D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760, B6: 1975.53};
    const SCALE = [N.D4, N.E4, N.Fs4, N.A4, N.B4, N.D5, N.E5, N.Fs5, N.A5, N.B5, N.D6];
    const MASTER = .5, K = reduce ? .6 : 1;
    let ac = null, C = null, muted = store.get('rfe.mute') === true;
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
      tap:   (c, t) => mallet(c, N.A5, t, .16, .12),
      pick:  (c, t) => { mallet(c, N.D5, t, .22, .13); noise(c, t, .005, .05, .05, 'highpass', 3000); },
      place: (c, t) => { thud(c, t, 150, 92, .34); mallet(c, N.A4, t + .03, .5, .15); mallet(c, N.D5, t + .11, .7, .12); },
      lift:  (c, t) => { noise(c, t, .12, .5, .1, 'bandpass', 380, 1300, .9); mallet(c, N.Fs4, t + .1, .5, .08); },
      dive:  (c, t) => { noise(c, t, .14, .55, .1, 'bandpass', 1200, 360, .8); mallet(c, N.A4, t + .25, .5, .09); },
      back:  (c, t) => { noise(c, t, .12, .5, .09, 'bandpass', 360, 1100, .8); mallet(c, N.D5, t + .2, .4, .09); },
      note:  (c, t) => { ting(c, N.A6, t, .07); ting(c, N.D6 * 2, t + .09, .06); mallet(c, N.D5, t, .5, .08); },
      ok:    (c, t) => { mallet(c, N.Fs5, t, .5, .13); mallet(c, N.A5, t + .1, .8, .12); },
      bad:   (c, t) => { thud(c, t, 128, 84, .36); thud(c, t + .17, 108, 72, .3); },
      hint:  (c, t) => { ting(c, N.B6, t, .075); ting(c, N.A6 * 1.01, t + .075, .06); ting(c, N.B6 * .995, t + .17, .07); },
      goal:  (c, t) => { mallet(c, N.Fs5, t, .6, .12); mallet(c, N.A5, t + .13, .9, .11); },
      lamp:  (c, t, i) => { const f = SCALE[clamp(i || 0, 0, SCALE.length - 1)]; mallet(c, f, t, 1.3, .16); part(c, f * 2, t + .02, .05, 1.1, .03); },
      win:   (c, t) => { bell(c, N.D5, t, 3.0, .18); bell(c, N.Fs5, t + .3, 3.0, .15); bell(c, N.A5, t + .6, 3.4, .15); part(c, N.D3, t, .05, 2.4, .08, 'triangle'); }};
    const liveC = () => { if(muted) return null; try{ if(!ac){ const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null; ac = new AC(); C = chain(ac); }
        if(ac.state === 'suspended' && !document.hidden) ac.resume(); return C; }catch(e){ return null; } };
    document.addEventListener('visibilitychange', () => { try{ if(!ac) return; if(document.hidden) ac.suspend(); else if(!muted) ac.resume(); }catch(e){} });
    const play = (name, arg) => { const c = liveC(); if(!c || document.hidden) return; try{ CUES[name](c, c.a.currentTime + .03, arg); }catch(e){} };
    const api = {get muted(){ return muted; }, cues: Object.keys(CUES),
      setMuted(v){ muted = !!v; store.set('rfe.mute', muted); try{ if(ac){ C.master.gain.setTargetAtTime(muted ? 0 : MASTER, ac.currentTime, .03); if(!muted && !document.hidden) ac.resume(); } }catch(e){} },
      unlock(){ liveC(); }, state(){ return ac ? ac.state : 'not started'; },
      // render every cue offline through the same chain and report level, length, DC offset and clipping (checked by number, not by ear)
      async measure(){ const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, out = {}; if(!OAC) return out;
        for(const name of Object.keys(CUES)){ const sr = 44100, o = new OAC(1, sr * 7, sr), c = chain(o); CUES[name](c, .05, name === 'lamp' ? 5 : undefined);
          const d = (await o.startRendering()).getChannelData(0); let peak = 0, sq = 0, clip = 0, last = 0, maxStep = 0;
          for(let i = 0; i < d.length; i++){ const v = d[i], a = Math.abs(v); if(a > peak) peak = a; sq += v * v; if(a >= .999) clip++; if(a > .001) last = i; if(i && Math.abs(v - d[i - 1]) > maxStep) maxStep = Math.abs(v - d[i - 1]); }
          const n = Math.max(1, last); let s2 = 0; for(let i = 0; i < n; i++) s2 += d[i];
          out[name] = {peak: +peak.toFixed(3), peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rmsDb: +(10 * Math.log10(sq / n || 1e-12)).toFixed(1), seconds: +((last / sr) - .05).toFixed(2), dc: +(s2 / n).toFixed(5), clipped: clip, maxStep: +maxStep.toFixed(3), end: +Math.abs(d[d.length - 1]).toFixed(5)}; }
        return out; }};
    for(const k of Object.keys(CUES)) api[k] = arg => play(k, arg);
    return api; })();

  /* ================================================================== icons */
  const svg = (d, vb) => `<svg viewBox="${vb || '0 0 24 24'}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  /*GI*/
  const GI = {   // one small drawing per guest, drawn for its own medallion colour: a pale silhouette with dark eyes, so it reads at 14 pixels
    duck: '<g stroke="none"><ellipse cx="10.4" cy="15.8" rx="7.4" ry="4.9" fill="currentColor"/><path d="M3.700 14.600L1.500 10.200l4.900 1.900z" fill="currentColor"/><path d="M12.300 8.500h6v6.500h-6z" fill="currentColor"/><circle cx="15.300" cy="7.300" r="4" fill="currentColor"/><path d="M18.700 6.400h3.200a1.350 1.350 0 0 1 0 2.700h-3.200z" fill="#ffb74a"/><circle cx="16.300" cy="6.500" r=".95" fill="#1c2230"/></g>',
    dog: '<g stroke="none"><ellipse cx="12" cy="11.900" rx="6.200" ry="7" fill="currentColor"/><ellipse cx="5.500" cy="11" rx="2.500" ry="5.300" transform="rotate(10 5.500 11)" fill="#f7dfa6"/><ellipse cx="18.500" cy="11" rx="2.500" ry="5.300" transform="rotate(-10 18.500 11)" fill="#f7dfa6"/><circle cx="9.700" cy="10.600" r="1" fill="#1c2230"/><circle cx="14.300" cy="10.600" r="1" fill="#1c2230"/><ellipse cx="12" cy="14.400" rx="1.700" ry="1.200" fill="#1c2230"/></g><path d="M12 15.600v1.300" stroke="#1c2230" stroke-width="1.100"/>',
    fish: '<g stroke="none" fill="currentColor"><ellipse cx="13.300" cy="12.500" rx="6.700" ry="4.500"/><path d="M7.800 12.500L2.300 7.500v10z"/><path d="M10.800 8.600l3.400-3 1.900 3.200z"/><circle cx="16.800" cy="11.400" r="1" fill="#1c2230"/></g><circle cx="20.600" cy="5.300" r="1" stroke-width="1.200"/><circle cx="18.300" cy="3" r=".5" stroke-width="1.200"/>',
    rooster: '<g stroke="none"><circle cx="9.200" cy="5" r="1.900" fill="#ffd0c9"/><circle cx="11.900" cy="4" r="2.100" fill="#ffd0c9"/><circle cx="14.600" cy="5.200" r="1.800" fill="#ffd0c9"/><circle cx="12" cy="9.800" r="4.700" fill="currentColor"/><path d="M7.700 11.400c-1.800 3.500-2.500 6.700-1 9.600h10.600c1.400-2.900.6-6.400-1.300-9.600z" fill="currentColor"/><ellipse cx="15.700" cy="14.600" rx="1.250" ry="2.100" fill="#ffd0c9"/><path d="M16.100 8.300l4.500 1.600-4.500 1.700z" fill="#ffc94a"/><circle cx="13.300" cy="8.900" r=".95" fill="#1c2230"/></g>',
    lizard: '<path d="M16.700 6.400c-1.400 2.800-3.500 4.300-4.700 6.900" stroke-width="3.800"/><path d="M11.800 13.800c-.9 3-3.500 3.900-5 4.900-1.300.9-1.400 2-.5 2.600" stroke-width="1.900"/><path d="M15.300 9l3.400 1.300M14.100 8L10.800 6.300M12.500 12.900l3.300 1.700M11.300 12.200L8 11.200" stroke-width="1.700"/><ellipse cx="17.700" cy="4.600" rx="2.500" ry="2.100" transform="rotate(-30 17.700 4.600)" fill="currentColor" stroke="none"/>',
    owl: '<g stroke="none"><path d="M12 3c-4.900 0-7.400 3.400-7.400 8.500 0 5.400 3.100 9.500 7.400 9.500s7.400-4.100 7.400-9.500C19.400 6.400 16.900 3 12 3z" fill="currentColor"/><circle cx="8.900" cy="9.800" r="2.700" fill="#1c2230"/><circle cx="15.100" cy="9.800" r="2.700" fill="#1c2230"/><circle cx="9.500" cy="9.200" r=".85" fill="#fff"/><circle cx="15.700" cy="9.200" r=".85" fill="#fff"/><path d="M12 11.800l-1.200 1.600 1.200 1.800 1.200-1.800z" fill="#f2b632"/></g>',
    hamster: '<g stroke="none"><circle cx="6.500" cy="6.800" r="2.900" fill="currentColor"/><circle cx="17.500" cy="6.800" r="2.900" fill="currentColor"/><circle cx="6.500" cy="6.800" r="1.300" fill="#f0a9a0"/><circle cx="17.500" cy="6.800" r="1.300" fill="#f0a9a0"/><ellipse cx="12" cy="13.500" rx="8.300" ry="6.900" fill="currentColor"/><circle cx="8.800" cy="12" r="1.100" fill="#1c2230"/><circle cx="15.200" cy="12" r="1.100" fill="#1c2230"/><ellipse cx="12" cy="14.500" rx="1.050" ry=".8" fill="#e2767a"/></g><path d="M10.300 16.900c.6.600 1.200.5 1.700-.3.500.8 1.100.9 1.700.3" stroke="#1c2230" stroke-width="1"/>',
    rabbit: '<g stroke="none"><ellipse cx="9" cy="6.800" rx="2.200" ry="5.300" transform="rotate(-8 9 6.800)" fill="currentColor"/><ellipse cx="15" cy="6.800" rx="2.200" ry="5.300" transform="rotate(8 15 6.800)" fill="currentColor"/><ellipse cx="9" cy="7.200" rx=".9" ry="3.500" transform="rotate(-8 9 7.200)" fill="#f0a9a0"/><ellipse cx="15" cy="7.200" rx=".9" ry="3.500" transform="rotate(8 15 7.200)" fill="#f0a9a0"/><ellipse cx="12" cy="15.600" rx="6.400" ry="5.600" fill="currentColor"/><circle cx="9.500" cy="14.500" r="1" fill="#1c2230"/><circle cx="14.500" cy="14.500" r="1" fill="#1c2230"/><ellipse cx="12" cy="16.700" rx=".95" ry=".7" fill="#e2767a"/></g>',
    parrot: '<g stroke="none"><path d="M11.700 2.800c-3.700 0-6.200 2.700-6.200 6.400 0 1.700.4 3 1 4.400.8 2 .9 3.900.3 6l5-1.200c3.300-1.500 4.900-4.500 4.900-8.200V7.300c-.4-2.800-2.200-4.500-5-4.500z" fill="currentColor"/><path d="M7 19.200l-1.800 3.600 5.600-1.600 1.100-2.800z" fill="#ff7b6b"/><path d="M15.400 5.900c3.200-.6 5 1 4.600 3.600-.3 1.900-1.400 3.200-2.800 3.900.3-1.500-.3-2.600-1.800-3z" fill="#1c2230"/><circle cx="12.600" cy="7.100" r="1.800" fill="#fff"/><circle cx="12.800" cy="7.100" r=".95" fill="#1c2230"/></g>',
    guinea: '<g stroke="none"><path d="M2.600 13.900c0-3.700 3.900-6.300 9.500-6.300 5.400 0 9.300 2.600 9.300 5.900 0 2.600-1.900 4.300-4.700 4.300H6.700c-2.400 0-4.100-1.600-4.100-3.900z" fill="currentColor"/><path d="M2.600 13.900c0-3.100 2.700-5.400 6.900-6.100 1 2.600.6 6.900-1.200 10H6.700c-2.400 0-4.100-1.600-4.100-3.900z" fill="#d79a55"/><ellipse cx="15.400" cy="7.700" rx="1.800" ry="1.300" fill="#f0b9a0"/><circle cx="17.800" cy="11.700" r="1.050" fill="#1c2230"/></g><path d="M7 18.200v1.600M10.200 18.200v1.600M14.800 18.200v1.600M18 18.200v1.600" stroke-width="1.500"/>',
    tortoise: '<g stroke="none" fill="currentColor"><path d="M2.900 15.600a8 7.600 0 0 1 16 0z"/><path d="M17.200 13.200h3.400v2.400h-3.400z"/><circle cx="20.600" cy="13" r="2.300"/><rect x="4.800" y="15" width="3.200" height="4.300" rx="1.300"/><rect x="13.800" y="15" width="3.200" height="4.300" rx="1.300"/><path d="M3.300 15.300l-2.200 1.200 2.500.5z"/><circle cx="21.200" cy="12.500" r=".75" fill="#1c2230"/></g><path d="M7.300 15.400c.4-3.400 1.800-5.500 3.600-6.600M14.500 15.400c-.4-3.400-1.800-5.500-3.600-6.600M5.300 12.300h11.200" stroke="rgba(28,34,48,.5)" stroke-width="1"/>',
    wheel: '<circle cx="12" cy="10.200" r="7"/><path d="M12 3.200v14M5.900 6.700l12.200 7M18.100 6.700l-12.200 7" stroke-width="1.100"/><path d="M12 10.200L7.200 21M12 10.200L16.800 21M5 21h14"/>',
    lettuce: '<path d="M12 21c-5.200 0-8.500-3-8.500-7.300 0-2.200.9-3.800 2.300-4.800.1-2.600 1.700-4.400 3.800-4.400.9 0 1.700.3 2.400.9.700-.6 1.500-.9 2.400-.9 2.100 0 3.700 1.800 3.800 4.400 1.400 1 2.300 2.600 2.300 4.800C20.500 18 17.200 21 12 21z" fill="#dff5ae" stroke="none"/><path d="M12 20V9.500M12 13.800L8.300 10.300M12 16l3.900-3.800" stroke="#2c7a3a" stroke-width="1.400"/>',
    scope: '<path d="M4 9.500l11.500-4.200 1.500 4-11.500 4.200zM11.500 12.500L8 20.500M11.500 12.500l4 8M11.500 12.500v8"/>',
    van: '<path d="M2.500 16.500V7.300a1 1 0 0 1 1-1h10.300l4.700 4.400 2.400.9a1 1 0 0 1 .6.900v4h-2.100M9 16.500h5.800M2.500 16.500h1.600"/><path d="M13.400 6.700v4.300h4.800" stroke-width="1.300"/><circle cx="6.500" cy="16.800" r="2.200"/><circle cx="17.200" cy="16.800" r="2.200"/>'};
  /*GI-END*/
  const NI = {   // one per kind of note
    am: '<path d="M3 18.500h18M7 18.500a5 5 0 0 1 10 0M12 10V4M9.500 6.500L12 4l2.500 2.500M4.500 12.500l1.800 1.300M19.500 12.500l-1.800 1.300"/>',
    pm: '<path d="M3 18.500h18M7 18.500a5 5 0 0 1 10 0M12 4v6M9.500 7.500L12 10l2.500-2.500M4.500 12.500l1.800 1.300M19.500 12.500l-1.800 1.300"/>',
    mid: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.400M12 18.600V21M3 12h2.400M18.600 12H21M5.600 5.600l1.700 1.700M16.700 16.700l1.700 1.700M5.600 18.400l1.700-1.700M16.700 7.300l1.700-1.700"/>',
    none: '<circle cx="12" cy="12" r="4.500"/><path d="M4.500 4.500l15 15"/>',
    sky: '<path d="M3.500 10L12 4l8.500 6v9.500h-17z"/><path d="M9 10.500h6v4.500H9z"/>',
    film: '<path d="M3 17.500a9 9 0 0 1 18 0M6.500 17.500a5.500 5.500 0 0 1 11 0M10 17.500a2 2 0 0 1 4 0"/>',
    oak: '<path d="M12 21v-7M12 14c-5 0-7.200-3-6.200-6 1-3 4.200-3 6.200-5 2 2 5.200 2 6.200 5 1 3-1.200 6-6.200 6z"/>',
    terrace: '<path d="M2.500 7.500h19M5 7.500V20M19 7.500V20M2.500 20h19M9 20v-5h6v5M9 4.500v3M15 4.500v3"/>',
    street: '<path d="M8 21L10 3M16 21L14 3M12 5v3M12 11v3M12 17v3"/>',
    hills: '<path d="M2 18.500l6-8.500 4 5 3-4 7 7.500z"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14zM5 19l8-8"/>',
    bath: '<path d="M3 11h18v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6zM6 11V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2"/>',
    door: '<path d="M13 4h6v16h-6M3 12h11M10 8l4 4-4 4"/>',
    tv: '<rect x="3" y="5" width="18" height="12" rx="1.500"/><path d="M8 21h8M12 17v4"/>',
    ev: '<path d="M13 3L6 13h5l-1 8 7-10h-5z"/>',
    win: '<rect x="5" y="4" width="14" height="16" rx="1"/><path d="M12 4v16M5 12h14"/>'};
  const ICO = {
    sound: svg('<path d="M4 9.500h3l4.500-3.800v12.600L7 14.500H4z"/><path d="M15.500 9a4.200 4.200 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11"/>'),
    mute: svg('<path d="M4 9.500h3l4.500-3.800v12.600L7 14.500H4z"/><path d="M16 9.500l5 5M21 9.500l-5 5"/>'),
    menu: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.900"/><circle cx="12" cy="12" r="1.900"/><circle cx="19" cy="12" r="1.900"/></svg>',
    back: svg('<path d="M14.500 5.500L8 12l6.500 6.500"/>'), fwd: svg('<path d="M9.500 5.500L16 12l-6.500 6.500"/>'),
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.500v13l11-6.500z"/></svg>',
    house: svg('<path d="M3.500 11.500L12 4.500l8.500 7M6 10v9.500h12V10"/>'),
    lift: svg('<path d="M4 15l8-4 8 4-8 4zM4 9.500l8-4 8 4-8 4z"/>'),
    list: svg('<path d="M8 6.500h12M8 12h12M8 17.500h12"/><circle cx="4" cy="6.500" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="17.500" r="1" fill="currentColor"/>'),
    bed: svg('<path d="M3 18.500V7M3 14h18v4.500M21 14v-2.500a3 3 0 0 0-3-3h-7V14M6.500 11.500a1.500 1.500 0 1 0 0-.01"/>'),
    drag: svg('<path d="M12.500 17.500V8.200a1.900 1.900 0 0 1 3.800 0v6.300m0-1.600a1.900 1.900 0 0 1 3.800 0v2m0-.9a1.900 1.900 0 0 1 3.700 0v5.200c0 4.300-2.800 7.300-6.900 7.300-3.200 0-4.900-1.400-6.600-4.200l-3-5a1.900 1.900 0 0 1 3.200-2l2 2.500"/>', '0 0 32 32'),
    ring: '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="10" stroke="#c98a12" stroke-width="3"/><circle cx="16" cy="16" r="2.600" fill="currentColor"/></svg>',
    check: svg('<path d="M5 12.500l4.500 4.500L19 7.500"/>'), cross: svg('<path d="M6.500 6.500l11 11M17.500 6.500l-11 11"/>')};
  const gIco = id => svg(GI[LG.GUESTS[id].ico] || GI.star);
  const nIco = k => svg(NI[k] || NI.win);

  /* ================================================================== UI */
  const css = `
  #rfeRoot{--ink:#1f2a3a;--mut:#5c6575;--navy:#1f2948;--paper:#fbfaf7;--gold:#c98a12;--wine:#9b2c3c;--ok:#2e7b59;--tape:#66ade6;--tapeink:#0f3556;position:fixed;inset:0;z-index:60;pointer-events:none;font-family:Jost,"Avenir Next","Helvetica Neue",Arial,sans-serif;color:var(--ink);-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
  #rfeRoot button{font:inherit;cursor:pointer}:where(#rfeRoot) button{color:#1f2a3a}
  #rfeRoot .rfeChip{pointer-events:auto;color:var(--ink);background:rgba(251,250,247,.95);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:16px;box-shadow:0 8px 30px rgba(15,20,35,.2)}
  #rfeTop{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) 0 max(14px,env(safe-area-inset-left))}
  #rfeGoal{padding:10px 16px 11px;width:340px;max-width:100%;min-width:0;border-left:4px solid var(--gold);box-sizing:border-box}
  #rfeGoal .k{display:flex;gap:8px;align-items:baseline;font-size:12.500px;color:var(--mut);letter-spacing:.02em}
  #rfeGoal .k b{font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#rfeTime{font-variant-numeric:tabular-nums;margin-left:auto}
  #rfeGoal p{margin:3px 0 0;font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:19.500px;line-height:1.18}
  #rfeGoal.new{animation:rfeNew .9s ease}
  @keyframes rfeNew{0%{box-shadow:0 0 0 0 rgba(232,184,74,.9),0 8px 30px rgba(15,20,35,.2)}40%{box-shadow:0 0 0 10px rgba(232,184,74,0),0 8px 30px rgba(15,20,35,.2)}}
  #rfeR{display:flex;flex-direction:column;gap:8px;align-items:flex-end;flex:none;margin-left:auto}
  #rfeBtns{display:flex;gap:8px;align-items:flex-start}
  #rfeHint{display:flex;align-items:center;gap:10px;border:0;padding:6px 14px 6px 6px;text-align:left;min-height:52px}
  #rfeHint .av{width:42px;height:42px;border-radius:50%;background:radial-gradient(circle at 50% 35%,#34416b,#1a2340);overflow:hidden;display:grid;place-items:end center;flex:none}
  #rfeHint .av svg{width:40px;height:auto;margin-bottom:-3px}
  #rfeHint b{display:block;font-size:14.500px;font-weight:500;line-height:1.15}#rfeHint small{font-size:12.500px;color:var(--mut)}
  #rfeHint.nudge{animation:rfeNudge 1.6s ease-in-out infinite}
  @keyframes rfeNudge{0%,100%{box-shadow:0 8px 30px rgba(15,20,35,.2),0 0 0 0 rgba(232,184,74,.8)}60%{box-shadow:0 8px 30px rgba(15,20,35,.2),0 0 0 12px rgba(232,184,74,0)}}
  .rfeIco{width:52px;height:52px;border:0;display:grid;place-items:center;padding:0}.rfeIco svg{width:22px;height:22px}
  #rfeMenu{position:absolute;right:max(14px,env(safe-area-inset-right));top:calc(max(14px,env(safe-area-inset-top)) + 60px);padding:8px;display:none;flex-direction:column;min-width:230px;z-index:9}
  #rfeMenu.on{display:flex}#rfeMenu button,#rfeMenu a{border:0;background:none;text-align:left;padding:11px 12px;border-radius:10px;font-size:15px;color:var(--ink);text-decoration:none}
  #rfeMenu button:hover,#rfeMenu a:hover{background:#eceae4}
  #rfeSay{max-width:min(330px,calc(100vw - 28px));background:#fff;border-radius:16px 4px 16px 16px;padding:11px 15px;font:400 20px/1.22 "Caveat Brush",Caveat,"Segoe Print","Bradley Hand",cursive;color:#2b2336;box-shadow:0 10px 30px rgba(15,20,35,.22);opacity:0;transform:translateY(-6px);transition:.3s;pointer-events:none}
  #rfeSay.on{opacity:1;transform:none}#rfeSay small{display:block;font:500 11.500px Jost,sans-serif;color:var(--mut);letter-spacing:.03em;margin-bottom:1px}
  /* the guest list and the clues */
  #rfePanel{position:absolute;left:max(14px,env(safe-area-inset-left));top:calc(max(14px,env(safe-area-inset-top)) + 92px);bottom:max(14px,env(safe-area-inset-bottom));width:340px;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box}
  #rfePanel h3{margin:0;padding:12px 16px 4px;font:500 12.500px Jost,sans-serif;color:var(--mut);letter-spacing:.02em;display:flex;justify-content:space-between;align-items:baseline}
  #rfePanel h3 span{font-variant-numeric:tabular-nums}
  #rfeTray{display:flex;flex-wrap:wrap;gap:8px 8px;padding:4px 14px 10px}
  .rfeG{position:relative;display:inline-flex;align-items:center;gap:7px;border:0;background:none;padding:3px 4px 3px 2px;border-radius:12px;pointer-events:auto;touch-action:none;text-align:left}
  .rfeG .em{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none;box-shadow:inset 0 -3px 0 rgba(0,0,0,.18),0 2px 5px rgba(15,20,35,.25)}.rfeG .em svg{width:20px;height:20px}
  .rfeG .tp{display:block;background:var(--tape);color:var(--tapeink);font:400 18.500px/1 "Caveat Brush",Caveat,"Marker Felt",cursive;padding:5px 9px 6px;border-radius:2px;transform:rotate(-1.2deg);box-shadow:0 1px 2px rgba(15,20,35,.2);white-space:nowrap;clip-path:polygon(0 8%,3% 0,97% 4%,100% 0,100% 92%,97% 100%,3% 96%,0 100%)}
  .rfeG.t .tp{background:#d6b98f;color:#45321c}
  .rfeG small{display:block;font-size:11.500px;color:var(--mut);margin:2px 0 0 2px;line-height:1.1;white-space:nowrap}
  .rfeG.sel{background:rgba(232,184,74,.28);box-shadow:0 0 0 2px #e8b84a}
  .rfeG.in .tp{opacity:.62}.rfeG:focus-visible{outline:2px solid var(--navy);outline-offset:2px}
  .rfeG.pulse .em{animation:rfePulse 1.5s ease-in-out infinite}
  @keyframes rfePulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
  #rfeSelBar{display:none;margin:0 14px 8px;padding:8px 10px 9px 12px;background:#f4ecd8;border-radius:12px;font-size:14px;line-height:1.3;align-items:center;gap:8px}
  #rfeSelBar.on{display:flex}#rfeSelBar span{flex:1;min-width:0}#rfeSelBar i{font-style:normal;color:var(--mut);display:block;font-size:13px}
  #rfeSelBar button{border:1px solid #cfc6ad;background:#fff;border-radius:999px;min-height:36px;padding:0 12px;font-size:13.500px;white-space:nowrap;pointer-events:auto}
  #rfeClues{list-style:none;margin:0;padding:0 8px 10px;overflow:auto;flex:1;min-height:0;-webkit-overflow-scrolling:touch;pointer-events:auto}
  #rfeClues li{position:relative;padding:8px 8px 8px 38px;border-radius:12px;font-size:15px;line-height:1.36;color:#2b3442}
  #rfeClues li + li{margin-top:1px}
  #rfeClues li .st{position:absolute;left:8px;top:8px;width:22px;height:22px;border-radius:50%;border:1.500px solid #c9c4b6;display:grid;place-items:center;color:#fff;font:500 12px Jost,sans-serif;box-sizing:border-box}
  #rfeClues li .st svg{width:14px;height:14px;stroke-width:2.600}
  #rfeClues li.ok{color:#7b8490}#rfeClues li.ok .tx{text-decoration:line-through;text-decoration-color:rgba(46,123,89,.6)}#rfeClues li.ok .st{background:var(--ok);border-color:var(--ok)}
  #rfeClues li.bad{background:#f8e7e4;color:#5d1f27}#rfeClues li.bad .st{background:var(--wine);border-color:var(--wine)}
  #rfeClues li.unseen .st{background:#e8b84a;border-color:#e8b84a;color:#3b2a05}
  #rfeClues li.hl{box-shadow:inset 3px 0 0 #e8b84a;background:#faf4e2}#rfeClues li.bad.hl{background:#f8e7e4}
  #rfeClues li .go{display:block;margin-top:4px;border:0;background:none;padding:0;font-size:13.500px;color:#7a5300;text-decoration:underline;text-underline-offset:2px;text-align:left}
  #rfeClues li.flash{animation:rfeFlash .8s ease}
  @keyframes rfeFlash{0%{background:#fff3c9}100%{}}
  #rfeStory{margin:0;padding:0 16px 8px;font:500 16.500px/1.32 "Cormorant Garamond",Georgia,serif;color:#2b3442}
  @media (max-height:760px){#rfeStory{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding-bottom:0;margin-bottom:8px}}
  #rfePanelX{display:none;position:absolute;right:4px;top:2px;width:44px;height:40px;border:0;background:none;font-size:26px;line-height:1;color:#5c6575;z-index:2;pointer-events:auto}
  /* room names over the house */
  #rfeLabels{position:absolute;inset:0;overflow:hidden;pointer-events:none}
  .rfeLb{position:absolute;left:0;top:0;border:0;padding:0;background:none;pointer-events:auto;will-change:transform;opacity:0;visibility:hidden;transition:opacity .25s,visibility 0s linear .25s;text-align:center}
  .rfeLb.on{opacity:1;visibility:visible;transition:opacity .25s}
  .rfeLb .nm{display:inline-flex;align-items:center;gap:5px;background:rgba(20,26,44,.84);color:#fff;border-radius:999px;padding:5px 11px 5px 11px;font:500 13px/1.15 Jost,sans-serif;white-space:nowrap;box-shadow:0 3px 10px rgba(10,14,28,.3)}
  .rfeLb .nm i{font-style:normal;display:inline-flex;gap:2px;color:#ffd77a}.rfeLb .nm i svg{width:14px;height:14px}
  .rfeLb .nm .oe{width:22px;height:22px;border-radius:50%;display:inline-grid;place-items:center;color:#fff;margin:-2px 1px -2px -7px;box-shadow:0 0 0 1.500px #fff}.rfeLb .nm .oe svg{width:14px;height:14px}
  .rfeLb .oc{display:block;margin:3px auto 0;width:max-content;background:var(--tape);color:var(--tapeink);font:400 16.500px/1 "Caveat Brush",Caveat,cursive;padding:4px 8px 5px;border-radius:2px;transform:rotate(-1.500deg);box-shadow:0 2px 4px rgba(10,14,28,.3)}
  .rfeLb .oc.t{background:#d6b98f;color:#45321c}
  .rfeLb.ghost .nm{background:rgba(20,26,44,.5);border:1px dashed rgba(255,255,255,.7);padding:4px 10px}
  .rfeLb.can .nm{background:#c98a12;box-shadow:0 0 0 3px rgba(232,184,74,.5),0 3px 10px rgba(10,14,28,.3)}
  .rfeLb.no{opacity:.45}.rfeLb.hov .nm,.rfeLb:hover .nm{background:#1f2948}.rfeLb.can:hover .nm,.rfeLb.can.hov .nm{background:#a87008}
  .rfeLb:focus-visible .nm{outline:3px solid #fff;outline-offset:2px}
  .rfeLb::before{content:"";position:absolute;inset:-8px -6px}
  .rfeSayG{position:absolute;left:0;top:0;background:#fff;border-radius:14px 14px 14px 3px;padding:7px 12px 8px;font:400 17.500px/1.15 "Caveat Brush",Caveat,cursive;color:#2b2336;box-shadow:0 8px 24px rgba(10,14,28,.35);max-width:210px;opacity:0;transition:opacity .35s;pointer-events:none;will-change:transform}
  .rfeSayG.on{opacity:1}.rfeSayG small{display:block;font:500 11px Jost,sans-serif;color:var(--mut)}
  /* the dock under the house */
  #rfeDock{position:absolute;left:368px;right:0;bottom:0;display:flex;justify-content:center;align-items:flex-end;gap:10px;padding:0 max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) 0;flex-wrap:wrap}
  .rfeBtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid #cfcabe;background:#fff;color:var(--ink,#1f2a3a);border-radius:999px;padding:0 18px;min-height:46px;font:inherit;font-size:15.500px;cursor:pointer;text-decoration:none;pointer-events:auto;white-space:nowrap}
  .rfeBtn:hover{border-color:#1f2948}.rfeBtn svg{width:18px;height:18px;flex:none}
  .rfeBtn.primary{background:#9b2c3c;border-color:#9b2c3c;color:#fff}.rfeBtn.primary:hover{background:#842432}
  .rfeBtn.dark{background:#1f2948;border-color:#1f2948;color:#fff}.rfeBtn.dark:hover{background:#151c33}
  .rfeBtn.light{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.4);color:#fff}.rfeBtn.light:hover{background:rgba(255,255,255,.2);border-color:#fff}
  .rfeBtn.shadow{box-shadow:0 8px 30px rgba(15,20,35,.25)}
  #rfeLift[aria-pressed=true],#rfeCluesBtn[aria-pressed=true]{background:#1f2948;border-color:#1f2948;color:#fff}
  #rfeLift.pulse{animation:rfeNudge 1.6s ease-in-out infinite}
  #rfeTip{font-size:14.500px;color:#fff;background:rgba(22,28,48,.78);border-radius:999px;padding:9px 16px;pointer-events:none;opacity:0;transition:opacity .4s;align-self:center;max-width:100%;box-sizing:border-box;text-align:center}
  #rfeTip.on{opacity:1}
  /* inside a room */
  #rfeRoom{position:absolute;left:max(14px,env(safe-area-inset-left));top:max(14px,env(safe-area-inset-top));width:340px;padding:10px 12px 12px 14px;display:none;box-sizing:border-box;border-left:4px solid var(--gold)}
  #rfeRoom .hd{display:flex;align-items:center;gap:4px}#rfeRoom .hd b{flex:1;min-width:0;font:600 24px/1.1 "Cormorant Garamond",Georgia,serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #rfeRoom .hd button{width:40px;height:40px;border:1px solid #d6d2c8;background:#fff;border-radius:50%;display:grid;place-items:center;padding:0;flex:none}#rfeRoom .hd button svg{width:18px;height:18px}
  #rfeRoom .lv{font-size:13px;color:var(--mut);margin:1px 0 6px}
  #rfeRoom .wh{margin:0 0 7px;font-size:13.500px;line-height:1.3;color:#3b4350}
  #rfeRoom ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
  #rfeRoom li{display:flex;gap:8px;align-items:flex-start;font-size:14.500px;line-height:1.3}#rfeRoom li svg{width:18px;height:18px;flex:none;margin-top:1px;color:#8a5e00}
  #rfeRoom li.todo{color:var(--mut)}#rfeRoom li.todo svg{color:#a9a595}#rfeRoom .hd b{text-align:center}
  #rfeRoom li.new{animation:rfeFlash 1.2s ease;border-radius:8px}
  #rfeRoom .cap{margin:8px 0 0;padding:8px 10px;background:#f4ecd8;border-radius:10px;font:500 16.500px/1.3 "Cormorant Garamond",Georgia,serif;color:#33290f;display:none}
  #rfeRoom .cap.on{display:block}
  #rfeFace{display:flex;align-items:center;gap:8px;width:100%;margin:8px 0 0;padding:5px 10px 5px 6px;border:1px solid #d6d2c8;background:#fff;border-radius:999px;min-height:36px;font-size:13.500px;line-height:1.2;text-align:left;color:var(--ink);pointer-events:auto;box-sizing:border-box}
  #rfeFace .cmp{width:24px;height:24px;flex:none}#rfeFace .cmp svg{width:24px;height:24px;display:block}#rfeFaceT{flex:1;min-width:0}
  #rfeFace i{font-style:normal;color:#7a5300;text-decoration:underline;text-underline-offset:2px;white-space:nowrap;display:none}
  #rfeFace.off{border-color:#e8b84a;background:#fdf7e4}#rfeFace.off i{display:inline}#rfeFace:not(.off){cursor:default}
  #rfeSun{flex:1 1 250px;max-width:520px;padding:9px 16px 11px;display:none}
  #rfeSun .top{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--mut);gap:8px;white-space:nowrap}#rfeSunNow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
  #rfeSunNow::before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;border:1.500px solid #a9a595;margin-right:6px;vertical-align:-1px;box-sizing:border-box}#rfeSunNow.on{color:#7a5300}#rfeSunNow.on::before{background:#f2b632;border-color:#d98f0c;box-shadow:0 0 6px #f2b632}
  #rfeSun .top b{font-size:18.500px;color:var(--ink);font-weight:500;font-variant-numeric:tabular-nums}
  #rfeSun .top button{flex:none;border:1px solid #d6d2c8;background:#fff;border-radius:999px;min-height:36px;padding:0 12px 0 8px;display:inline-flex;align-items:center;gap:4px;font-size:13.500px;color:var(--ink)}#rfeSun .top button svg{width:16px;height:16px}
  #rfeSun.key{box-shadow:0 0 0 2px #e8b84a,0 0 26px rgba(232,184,74,.55),0 8px 30px rgba(15,20,35,.2)}
  #rfeSlider{-webkit-appearance:none;appearance:none;width:100%;height:34px;background:transparent;margin:2px 0 0;display:block;cursor:pointer;pointer-events:auto}
  #rfeSlider::-webkit-slider-runnable-track{height:10px;border-radius:999px;background:linear-gradient(90deg,#f0b98a 0%,#f7e3a8 14%,#cfe4f3 34%,#cfe4f3 62%,#f7dc9c 82%,#ee9d6c 100%);box-shadow:inset 0 1px 2px rgba(0,0,0,.18)}
  #rfeSlider::-moz-range-track{height:10px;border-radius:999px;background:linear-gradient(90deg,#f0b98a 0%,#f7e3a8 14%,#cfe4f3 34%,#cfe4f3 62%,#f7dc9c 82%,#ee9d6c 100%)}
  #rfeSlider::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;margin-top:-10px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff3c4,#f2b632 60%,#d98f0c);border:2px solid #fff;box-shadow:0 0 0 3px rgba(242,182,50,.35),0 3px 8px rgba(0,0,0,.3)}
  #rfeSlider::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff3c4,#f2b632 60%,#d98f0c);border:2px solid #fff;box-shadow:0 0 0 3px rgba(242,182,50,.35),0 3px 8px rgba(0,0,0,.3)}
  #rfeSlider:focus-visible{outline:2px solid var(--navy);outline-offset:2px;border-radius:8px}
  #rfeSun .ticks{display:flex;justify-content:space-between;font-size:11.500px;color:var(--mut);margin:0 2px;font-variant-numeric:tabular-nums}
  #rfeWho{position:absolute;right:max(14px,env(safe-area-inset-right));bottom:calc(max(14px,env(safe-area-inset-bottom)) + 58px);padding:8px;display:none;flex-direction:column;min-width:240px;max-height:60vh;overflow:auto;z-index:8}
  #rfeWho.on{display:flex}#rfeWho h4{margin:4px 8px 6px;font:500 12.500px Jost,sans-serif;color:var(--mut)}
  #rfeWho button{display:flex;align-items:center;gap:9px;border:0;background:none;text-align:left;padding:7px 8px;border-radius:10px;font-size:15px}
  #rfeWho button:hover{background:#eceae4}#rfeWho button .em{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none}#rfeWho button .em svg{width:18px;height:18px}
  #rfeWho button small{display:block;color:var(--mut);font-size:12.500px}
  .rfeMk{position:absolute;left:0;top:0;width:60px;height:60px;margin:-30px 0 0 -30px;border:0;background:none;padding:0;pointer-events:auto;opacity:0;visibility:hidden;transition:opacity .25s,visibility 0s linear .25s;will-change:transform}
  .rfeMk.on{opacity:1;visibility:visible;transition:opacity .25s}
  .rfeMk i{position:absolute;left:8px;top:8px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;border:2.500px solid #fff;background:rgba(255,255,255,.14);box-shadow:0 0 0 4px rgba(232,184,74,.55),0 0 22px rgba(255,214,120,.85),inset 0 0 10px rgba(255,220,140,.5);box-sizing:border-box}
  .rfeMk i::after{content:"";width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 8px #ffdc8c}
  .rfeMk.on:not(.got) i{animation:rfePulse 2.2s ease-in-out infinite}
  .rfeMk.got i{border-color:rgba(255,255,255,.75);box-shadow:0 0 0 3px rgba(46,123,89,.55);background:rgba(46,123,89,.35)}.rfeMk.got i::after{display:none}.rfeMk.got i svg{width:20px;height:20px;color:#fff;stroke-width:2.600}
  .rfeMk span{position:absolute;left:50%;top:56px;transform:translateX(-50%);white-space:nowrap;font:500 13px Jost,sans-serif;color:#fff;background:rgba(20,26,44,.82);padding:4px 10px;border-radius:999px}
  .rfeMk.edge span{top:50%;transform:translateY(-50%)}.rfeMk.edge.L span{left:58px}.rfeMk.edge.R span{left:auto;right:58px}
  .rfeMk:hover span{background:#1f2948}.rfeMk:focus-visible i{outline:3px solid #fff;outline-offset:3px}
  #rfeToast{position:absolute;left:calc(50% + 177px);top:15%;transform:translate(-50%,-10px);background:rgba(22,28,48,.9);color:#fff;font:500 15.500px Jost,sans-serif;padding:10px 18px;border-radius:999px;opacity:0;transition:.3s;pointer-events:none;width:max-content;max-width:calc(100% - 420px);text-align:center;z-index:7;box-sizing:border-box}
  html.rfe-cine #rfeToast{left:50%;max-width:calc(100% - 40px)}
  #rfeToast.on{opacity:1;transform:translate(-50%,0)}
  #rfeGhost{--tape:#66ade6;--tapeink:#0f3556;--mut:#5c6575;position:fixed;left:0;top:0;z-index:70;pointer-events:none;display:none;will-change:transform}
  #rfeShot{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:58;pointer-events:none;opacity:1;transition:opacity .5s ease}
  #rfeShot.out{opacity:0}
  #rfeCard{position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(14,19,34,.5);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);font-family:Jost,"Avenir Next",Arial,sans-serif;padding:16px;overflow:auto;animation:rfeIn .45s ease}
  @keyframes rfeIn{from{opacity:0}to{opacity:1}}
  #rfeCard .c{background:#fbfaf7;color:#1f2a3a;border-radius:24px;max-width:560px;width:100%;padding:26px 26px 22px;box-shadow:0 30px 90px rgba(0,0,0,.45);animation:rfeUp .5s cubic-bezier(.2,.8,.2,1);box-sizing:border-box}
  @keyframes rfeUp{from{transform:translateY(18px)}to{transform:none}}
  #rfeCard h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:clamp(34px,6vw,48px);font-weight:600;line-height:1;margin:0 0 10px}
  #rfeCard .k{font-size:13px;color:#5c6575;margin:0 0 6px;letter-spacing:.03em}
  #rfeCard .lede{font-family:"Cormorant Garamond",Georgia,serif;font-size:21px;line-height:1.32;margin:0 0 14px;color:#2b3442}
  #rfeCard .how{list-style:none;margin:0 0 16px;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  #rfeCard .how li{background:#f1eee6;border-radius:14px;padding:10px 8px 9px;text-align:center;font-size:13.500px;line-height:1.25;color:#2b3442}
  #rfeCard .how svg{width:30px;height:30px;display:block;margin:0 auto 5px;color:#1f2948}
  #rfeCard .who{display:flex;flex-wrap:wrap;gap:8px 10px;margin:0 0 16px;padding:0;list-style:none}
  #rfeCard .who li{display:flex;gap:9px;align-items:center;flex:1 1 220px;min-width:0;font-size:14px;line-height:1.3;color:#3b4350}
  #rfeCard .who .em{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none}#rfeCard .who .em svg{width:21px;height:21px}
  #rfeCard .who b{display:block;font-weight:500;color:#1f2a3a;font-size:15px}
  #rfeCard .rule{margin:0 0 16px;padding:9px 12px;background:#f1eee6;border-radius:12px;font-size:14px;line-height:1.4;color:#2b3442}
  #rfeCard .lv{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px;padding:0;list-style:none}
  #rfeCard .lv button{border:1px solid #d6d2c8;background:#fff;border-radius:14px;padding:8px 12px 9px;text-align:left;min-width:132px;min-height:52px;font-size:14.500px;line-height:1.2;color:#1f2a3a;font-family:inherit;cursor:pointer}
  #rfeCard .lv button small{display:block;color:#5c6575;font-size:12.500px;margin-top:2px}#rfeCard .lv button.done{border-color:#9cc7b3;background:#edf6f1}#rfeCard .lv button:hover{border-color:#1f2948}
  #rfeCard .foot{font-size:13px;color:#5c6575;line-height:1.45;margin:14px 0 0}
  #rfeCard .acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  #rfeCard .stats{display:flex;gap:24px;margin:4px 0 14px;flex-wrap:wrap}#rfeCard .stats b{display:block;font-size:27px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.1}#rfeCard .stats span{font-size:13px;color:#5c6575}
  #rfeCard .badges{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}#rfeCard .badges span{background:#edf6f1;color:#1f5a41;border-radius:999px;padding:5px 12px;font-size:13.500px}
  #rfeCard .cta{background:#1f2948;color:#f4f1e8;border-radius:18px;padding:18px 18px 16px;margin:0 0 14px}
  #rfeCard .cta b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:25px;font-weight:600;line-height:1.1;margin-bottom:6px}#rfeCard .cta span{display:block;font-size:15px;line-height:1.45;color:#d5dae8;margin-bottom:14px}
  #rfeCard .more{display:flex;flex-wrap:wrap;gap:8px}
  html.rfe-pre #rfeRoot{display:none}
  html.rfe-in #rfeRoom{display:block}html.rfe-in #rfeSun{display:block}html.rfe-in #rfeLabels .rfeLb{display:none}html.rfe-in #rfeLift,html.rfe-in #rfeTip{display:none}
  html.rfe-in #rfeGoal,html.rfe-in #rfeStory,html.rfe-in #rfeWhoH,html.rfe-in #rfeTray,html.rfe-in #rfeSelBar{display:none}
  html.rfe-in #rfePanel{top:calc(var(--room-b,230px) + 10px);bottom:auto;max-height:calc(100% - var(--room-b,230px) - 24px)}
  html:not(.rfe-in) #rfeBack,html:not(.rfe-in) #rfeWhoBtn,html:not(.rfe-in) #rfeMarks{display:none}
  html.rfe-cine #rfeRoot > *:not(#rfeLabels):not(#rfeToast){opacity:0!important;pointer-events:none!important;transition:opacity .4s}
  html.rfe-cine .rfeLb{pointer-events:none}
  #rfeCluesBtn{display:none}
  /*PH*/
    #rfeTop{flex-direction:column;align-items:stretch;gap:6px;padding-left:8px;padding-right:8px;padding-top:max(8px,env(safe-area-inset-top))}#rfeR{display:contents}
    #rfeBtns{order:0;align-self:flex-end}#rfeGoal{order:1;width:auto;padding:8px 12px 9px}#rfeGoal p{font-size:17.500px}#rfeSay{order:2;align-self:flex-end;font-size:18.500px}
    #rfeHint{padding:4px 12px 4px 4px;min-height:46px}#rfeHint small{display:none}#rfeHint .av{width:38px;height:38px}.rfeIco{width:46px;height:46px}
    #rfeMenu{top:calc(max(8px,env(safe-area-inset-top)) + 52px);right:8px}
    #rfePanel,html.rfe-in #rfePanel{left:8px;right:8px;top:auto;bottom:max(8px,env(safe-area-inset-bottom));width:auto;max-height:38vh}
    #rfeToast{left:50%;max-width:calc(100% - 40px)}
    #rfeStory{display:none}
    #rfePanel h3{padding:8px 14px 2px}
    #rfeTray{flex-wrap:nowrap;padding:4px 8px 6px;gap:2px;pointer-events:auto}
    .rfeG{flex:1 1 0;min-width:0;flex-direction:column;gap:3px;padding:4px 0 3px;align-items:center}.rfeG .em{width:38px;height:38px}.rfeG > span:last-child{display:block;min-width:0;max-width:100%}
    .rfeG .tp{background:none;color:var(--ink);font:500 10.500px/1.12 Jost,sans-serif;padding:0;transform:none;box-shadow:none;clip-path:none;white-space:normal;text-align:center;overflow-wrap:anywhere}.rfeG.t .tp{background:none;color:var(--ink)}
    .rfeG small{display:none}.rfeG.in .tp{opacity:1;color:var(--mut)}.rfeG.in .em{opacity:.5;box-shadow:0 0 0 2px #fff,0 0 0 4px var(--ok)}
    #rfeClues li{font-size:14.500px;padding:7px 8px 7px 36px}
    #rfeDock{left:0;padding:0 8px;bottom:calc(var(--panel-h,0px) + max(8px,env(safe-area-inset-bottom)) + 8px);gap:8px}
    #rfeTip{font-size:13.500px;padding:7px 12px}
    html.rfe-in #rfePanel{display:none}html.rfe-in.rfe-clues #rfePanel{display:flex;bottom:max(8px,env(safe-area-inset-bottom));max-height:60vh;z-index:6;box-shadow:0 20px 70px rgba(10,14,28,.5)}html.rfe-in.rfe-clues #rfePanelX{display:block}html.rfe-in.rfe-clues #rfePanel h3{padding-right:48px}
    html.rfe-in #rfeDock{bottom:max(8px,env(safe-area-inset-bottom));flex-wrap:wrap;gap:6px}
    html.rfe-in #rfeSay{position:absolute;right:8px;top:calc(var(--room-b,170px) + 6px);z-index:5}
    html.rfe-in .rfeBtn{flex:1 1 auto;padding:0 10px;font-size:14.500px;gap:6px}#rfeBack span::after{content:""}#rfeSun .ticks{display:none}#rfeSun .top b{font-size:17px}#rfeSunNow{font-size:12.500px}#rfePlay span{display:none}#rfeSun .top button{padding:0 9px}
    html.rfe-in #rfeCluesBtn{display:inline-flex}
    #rfeSun{flex:1 1 100%;max-width:none;order:-1;padding:7px 14px 9px}
    #rfeRoom{left:8px;right:8px;top:var(--top-h,66px);width:auto;padding:6px 8px 8px 8px;border-left:0}#rfeFace{margin-top:6px;min-height:34px;font-size:13px}#rfeRoom .hd b{font-size:21px}#rfeRoom li{font-size:13.500px}#rfeRoom .lv{text-align:center;margin:0 0 3px}#rfeRoom .wh{text-align:center;font-size:12.500px;margin-bottom:5px}
    #rfeRoom ul{gap:2px;padding:0 4px}#rfeRoom .cap{font-size:15.500px;margin-top:6px}#rfeRoom .hd button{width:44px;height:44px}
    #rfeWho{right:8px;left:8px;bottom:calc(max(8px,env(safe-area-inset-bottom)) + 58px)}
    .rfeBtn{padding:0 14px;font-size:15px}
    .rfeLb .nm{font-size:12px;padding:4px 9px}.rfeLb .oc{font-size:15px}
    #rfeCard .c{padding:20px 18px 18px}#rfeCard .lede{font-size:19px}#rfeCard .how li{font-size:12.500px}
  /*END*/
  @media (prefers-reduced-motion:reduce){.rfeMk.on i,#rfeHint.nudge,.rfeG.pulse .em{animation:none!important}}
  `;
  document.head.appendChild(el('link', {rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Caveat+Brush&family=Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500&display=swap'}));
  let root, toastE, sayE;
  function buildUI(){ const a = css.indexOf('/*PH*/'), b = css.indexOf('/*END*/'); document.head.appendChild(el('style', {}, css.slice(0, a) + css.slice(b)));
    // the compact layout is its own sheet, so ?layout=wide or ?layout=phone can force either one in any window (used for testing)
    document.head.appendChild(el('style', {media: LAYOUT === 'wide' ? 'not all' : LAYOUT === 'phone' ? 'all' : '(max-width:899px)'}, css.slice(a, b))); document.documentElement.classList.add('rfe-pre');
    const cat = window.SNOWBALL ? SNOWBALL.svg({id: 'sbrfe', seed: 7}).replace(/viewBox="[^"]+"/, 'viewBox="110 10 280 300"') : '';
    root = el('div', {id: 'rfeRoot'}, `
      <div id="rfeLabels"></div><div id="rfeMarks"></div>
      <div id="rfeTop">
        <div class="rfeChip" id="rfeGoal" role="status" aria-live="polite"><div class="k"><b id="rfeTitle">Room for Everyone</b><span id="rfeTime">0:00</span></div><p id="rfeGoalT"></p></div>
        <div id="rfeR"><div id="rfeBtns">
          <button class="rfeChip" id="rfeHint" type="button" aria-label="Ask Snowball for a hint"><span class="av">${cat}</span><span class="tx"><b>Ask Snowball</b><small>For a hint</small></span></button>
          <button class="rfeChip rfeIco" id="rfeSnd" type="button" aria-label="Sound"></button>
          <button class="rfeChip rfeIco" id="rfeMenuBtn" type="button" aria-label="Menu" aria-expanded="false">${ICO.menu}</button>
        </div><div id="rfeSay" aria-live="polite"></div></div>
      </div>
      <div class="rfeChip" id="rfeMenu" role="menu"><button type="button" role="menuitem" id="rfeRestart">Start this puzzle again</button><button type="button" role="menuitem" id="rfePick">Choose another puzzle</button><button type="button" role="menuitem" id="rfeAbout">About this 3D model</button><a role="menuitem" href="/tour/">Leave and explore the house</a><a role="menuitem" href="/games/">More games</a></div>
      <div class="rfeChip" id="rfeRoom" aria-live="polite"></div>
      <div class="rfeChip" id="rfePanel"><button type="button" id="rfePanelX" aria-label="Close the clues">×</button><p id="rfeStory"></p><h3 id="rfeWhoH"><span>Who is staying</span><span id="rfeCount"></span></h3><div id="rfeTray"></div>
        <div id="rfeSelBar"></div><h3><span>What they asked for</span><span id="rfeDone"></span></h3><ol id="rfeClues"></ol></div>
      <div id="rfeDock">
        <button class="rfeBtn dark shadow" id="rfeBack" type="button">${ICO.back}<span>Whole house</span></button>
        <div id="rfeTip" role="status"></div>
        <button class="rfeBtn shadow" id="rfeLift" type="button" aria-pressed="false">${ICO.lift}<span>Lift off the upper level</span></button>
        <div class="rfeChip" id="rfeSun"><div class="top"><span id="rfeSunNow"></span><b id="rfeClock">1:00 PM</b><button type="button" id="rfePlay">${ICO.play}<span>Watch the day</span></button></div>
          <input id="rfeSlider" type="range" min="${H0}" max="${H1}" step=".25" value="13" aria-label="Time of day">
          <div class="ticks" aria-hidden="true"><span>7 AM</span><span>10</span><span>1 PM</span><span>4</span><span>7:30</span></div></div>
        <button class="rfeBtn shadow" id="rfeCluesBtn" type="button" aria-pressed="false">${ICO.list}<span>Clues</span></button>
        <button class="rfeBtn primary shadow" id="rfeWhoBtn" type="button" aria-expanded="false">${ICO.bed}<span>Put a guest here</span></button>
      </div>
      <div class="rfeChip" id="rfeWho" role="menu"></div>
      <div id="rfeToast" role="status"></div>`);
    document.body.appendChild(root); document.body.appendChild(el('div', {id: 'rfeGhost'}));
    toastE = $('#rfeToast'); sayE = $('#rfeSay');
    $('#rfeHint').onclick = () => { SND.unlock(); hint(); };
    const snd = $('#rfeSnd'), drawSnd = () => { snd.innerHTML = SND.muted ? ICO.mute : ICO.sound; snd.setAttribute('aria-label', SND.muted ? 'Turn sound on' : 'Turn sound off'); snd.setAttribute('aria-pressed', String(!SND.muted)); };
    snd.onclick = () => { SND.setMuted(!SND.muted); drawSnd(); if(!SND.muted) SND.tap(); toast(SND.muted ? 'Sound off' : 'Sound on', 1100); }; drawSnd(); UI.drawSnd = drawSnd;
    $('#rfeMenuBtn').onclick = e => { e.stopPropagation(); const on = !$('#rfeMenu').classList.contains('on'); closeMenus(); $('#rfeMenu').classList.toggle('on', on); $('#rfeMenuBtn').setAttribute('aria-expanded', String(on)); };
    $('#rfeRestart').onclick = () => { closeMenus(); if(S.L) startLevel(S.L, true); };
    $('#rfePick').onclick = () => { closeMenus(); titleCard(); };
    $('#rfeAbout').onclick = () => { closeMenus(); const d = document.getElementById('aboutDlg'); try{ d.showModal(); }catch(e){ if(d) d.setAttribute('open', ''); } };
    $('#rfeBack').onclick = () => { SND.unlock(); leave(); };
    $('#rfeLift').onclick = () => { SND.unlock(); setUpper(!S.upperOn); };
    const clues = on => { document.documentElement.classList.toggle('rfe-clues', on); $('#rfeCluesBtn').setAttribute('aria-pressed', String(on)); }; UI.clues = clues;
    $('#rfeCluesBtn').onclick = () => clues(!document.documentElement.classList.contains('rfe-clues')); $('#rfePanelX').onclick = () => clues(false);
    $('#rfeWhoBtn').onclick = e => { e.stopPropagation(); SND.unlock(); const on = !$('#rfeWho').classList.contains('on'); closeMenus(); if(on) openWho(); };
    const sl = $('#rfeSlider'); sl.oninput = () => onSlide(+sl.value, true); sl.onchange = () => { onSlide(+sl.value, true); applyHour(+sl.value, true); };
    sl.addEventListener('pointerdown', () => { SND.unlock(); S.sweeping = false; $('#rfeSun').classList.remove('key'); });
    $('#rfePlay').onclick = () => { SND.unlock(); watchDay(); };
    addEventListener('pointerdown', e => { if(anyMenu() && !e.target.closest('#rfeMenu,#rfeMenuBtn,#rfeWho,#rfeWhoBtn')) closeMenus(); }, true);
    addEventListener('resize', () => { layoutVars(); orbitFit(); if(S.view === 'room') reframe(); });
    try{ new ResizeObserver(() => { layoutVars(); if(S.view === 'over' && !rig.move) orbitFit(); }).observe($('#rfePanel')); new ResizeObserver(() => { layoutVars(); if(S.view === 'room') reframe(); }).observe($('#rfeRoom')); }catch(e){} }
  const UI = {};
  const anyMenu = () => !!($('#rfeMenu') && ($('#rfeMenu').classList.contains('on') || $('#rfeWho').classList.contains('on')));
  function closeMenus(){ const m = $('#rfeMenu'); if(!m) return; m.classList.remove('on'); $('#rfeMenuBtn').setAttribute('aria-expanded', 'false'); $('#rfeWho').classList.remove('on'); $('#rfeWhoBtn').setAttribute('aria-expanded', 'false'); }
  function layoutVars(){ const pn = $('#rfePanel'), top = $('#rfeTop'); if(!pn) return; const st = document.documentElement.style;
    st.setProperty('--panel-h', (phone() && S.view !== 'room' ? Math.round(pn.getBoundingClientRect().height) : 0) + 'px'); st.setProperty('--top-h', Math.round(($('#rfeBtns').getBoundingClientRect().bottom || 60) + 6) + 'px');
    const rb = $('#rfeRoom').getBoundingClientRect(); if(rb.height > 10) st.setProperty('--room-b', Math.round(rb.bottom) + 'px'); }
  let toastT = 0; function toast(m, ms){ toastE.textContent = m; toastE.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastE.classList.remove('on'), ms || 2400); }
  let sayT = 0; function say(m, ms, quiet){ sayE.innerHTML = '<small>Snowball</small>' + esc(m); sayE.classList.add('on'); clearTimeout(sayT); sayT = setTimeout(() => sayE.classList.remove('on'), ms || 6000); if(!quiet) SND.hint(); }
  function setGoal(t, quiet){ const g = $('#rfeGoalT'); if(g.textContent === t) return; g.textContent = t; if(quiet) return; const c = $('#rfeGoal'); c.classList.remove('new'); void c.offsetWidth; c.classList.add('new'); }
  function tip(t){ const e = $('#rfeTip'); if(!t){ e.classList.remove('on'); return; } e.textContent = t; e.classList.add('on'); }

  /* ================================================================== the puzzle on the table */
  const nmOf = g => LG.GUESTS[g].name, NmOf = g => LG.Nm(g), shortOf = g => LG.GUESTS[g].short || LG.GUESTS[g].name;   // NmOf: at the start of a sentence or on its own
  const occupant = slot => { for(const g in S.at) if(S.at[g] === slot) return g; return null; };
  const fits = (g, slot) => LG.isP(g) ? !!LG.SLOTS[slot].bed : !LG.SLOTS[slot].bed;
  const lvTxt = slot => { const sl = LG.SLOTS[slot]; return sl.lv === 'garage' ? 'A level of its own, between lower and main' : (sl.lv[0].toUpperCase() + sl.lv.slice(1) + ' level') + (sl.bed ? ', bedroom' : ', not a bedroom'); };
  function statusOf(c){ const t = LG.test(c, S.at, S.L, LG.WORLDS[0]); if(t === null) return {s: 'open'};
    const miss = LG.needs(c, S.at).filter(n => !known(n[0], n[1], n[2])); if(miss.length) return {s: 'unseen', miss: miss[0]};
    return {s: t ? 'ok' : 'bad'}; }
  const solved = () => S.L.guests.every(g => S.at[g]) && S.L.clues.every(c => LG.test(c, S.at, S.L, LG.WORLDS[0]) === true);
  function renderTray(){ const tray = $('#rfeTray'); tray.innerHTML = ''; let left = 0;
    for(const g of S.L.guests){ const G = LG.GUESTS[g], slot = S.at[g]; if(!slot) left++;
      const b = el('button', {type: 'button', class: 'rfeG' + (G.kind === 't' ? ' t' : '') + (S.sel === g ? ' sel' : '') + (slot ? ' in' : ''), 'data-g': g, 'aria-pressed': String(S.sel === g),
        'aria-label': NmOf(g) + (slot ? ', in the ' + LG.SLOTS[slot].name : ', no room yet')}, `<span class="em" style="background:${G.col}">${gIco(g)}</span><span><span class="tp">${esc(shortOf(g))}</span><small>${slot ? esc(LG.SLOTS[slot].name) : 'No room yet'}</small></span>`);
      tray.appendChild(b); bindChip(b, g); }
    $('#rfeCount').textContent = left ? left + ' to place' : 'All placed';
    const bar = $('#rfeSelBar'); if(S.sel){ const G = LG.GUESTS[S.sel], slot = S.at[S.sel];
        bar.innerHTML = `<span><b>${esc(NmOf(S.sel))}</b><i>${esc(G.bio)}</i></span>` + (slot ? `<button type="button" id="rfeOut">Take out</button>` : ''); bar.classList.add('on');
        const o = $('#rfeOut'); if(o) o.onclick = () => { unplace(S.sel); }; } else bar.classList.remove('on');
    layoutVars(); }
  function renderClues(flash){ const ol = $('#rfeClues'), prev = S.status.map(x => x.s); ol.innerHTML = ''; S.status = S.L.clues.map(statusOf); let ok = 0;
    // "Never broke a clue" is lost the moment any clue shows as broken: on a placement, on a swap, or when a look inside a room proves an earlier placement wrong.
    // Only a placement Snowball makes himself (the third hint) is not held against the player.
    if(!S.hinting && !S.done && S.status.some((x, i) => x.s === 'bad' && prev[i] !== 'bad')) S.clean = false;
    S.L.clues.forEach((c, i) => { const st = S.status[i], who = LG.whoOf(c); if(st.s === 'ok') ok++;
      const li = el('li', {class: st.s + (S.sel && who.indexOf(S.sel) >= 0 ? ' hl' : '') + (flash && prev[i] && prev[i] !== st.s && st.s !== 'open' ? ' flash' : '')},
        `<span class="st" aria-hidden="true">${st.s === 'ok' ? ICO.check : st.s === 'bad' ? ICO.cross : st.s === 'unseen' ? '?' : ''}</span><span class="tx">${esc(c.t)}</span>` +
        (st.s === 'unseen' ? `<button type="button" class="go" data-slot="${st.miss[0]}">${esc(missTxt(st.miss))}</button>` : '') +
        `<span style="position:absolute;left:-9999px">${st.s === 'ok' ? 'Met.' : st.s === 'bad' ? 'Not met.' : st.s === 'unseen' ? 'Not checked yet.' : ''}</span>`);
      const go = li.querySelector('.go'); if(go) go.onclick = () => { SND.unlock(); if(S.view === 'room' && S.room !== go.dataset.slot) hop(go.dataset.slot); else if(S.view === 'over') enter(go.dataset.slot); };
      ol.appendChild(li); });
    $('#rfeDone').textContent = ok + ' of ' + S.L.clues.length + ' met'; return prev; }
  const missTxt = m => { const r = LG.SLOTS[m[0]].name; return m[1] === 'light' ? `Not checked yet. Go and watch the light in the ${r}.` : `Not checked yet. Go and look in the ${r}.`; };
  function refresh(flash){ renderTray(); const prev = renderClues(flash); drawLabels(); PAWN.sync(); objective(); layoutVars(); return prev; }
  function objective(){ if(!S.L || S.done) return; const left = S.L.guests.filter(g => !S.at[g]), bad = S.status.filter(x => x.s === 'bad').length, uns = S.status.filter(x => x.s === 'unseen').length;
    if(S.view === 'room'){ const r = RINGS[S.room] || [], todo = r.filter(q => !hasNote(S.room, q.note)).length;
      setGoal(todo ? 'Look around. Tap a gold ring to note what is here.' : !SAVE.light[S.room] ? 'Drag the sun across the day and watch the floor.' : 'You have seen this room. Put a guest here, or go back out.', true); return; }
    if(S.sel) setGoal('Choose a room for ' + nmOf(S.sel) + '.', true);
    else if(bad) setGoal(bad === 1 ? 'One clue is broken. Move a guest.' : bad + ' clues are broken. Move a guest.', true);
    else if(!left.length && uns) setGoal('Everyone has a room, but Snowball cannot check ' + (uns === 1 ? 'one clue' : uns + ' clues') + ' yet.', true);
    else if(left.length === S.L.guests.length) setGoal('Give every guest a room. Tap a room to go inside and look.', true);
    else if(left.length) setGoal(left.length === 1 ? NmOf(left[0]) + ' still ' + LG.vb(left[0], 'needs', 'need') + ' a room.' : left.length + ' guests still need a room.', true);
    else setGoal('Everyone has a room.', true); }
  function select(g){ if(S.done) return; S.sel = g; if(g) SND.pick(); renderTray(); renderClues(); drawLabels(); objective();
    if(g && S.view === 'over'){ tip(LG.isP(g) ? 'Tap one of the six bedrooms' : 'Tap a room that is not a bedroom'); } else tip('');
    $('#rfeLift').classList.toggle('pulse', !!g && S.view === 'over' && S.upperOn && ORDER.some(id => covered(id) && fits(g, id))); }
  function place(g, slot, opts){ opts = opts || {}; if(S.done || !S.L || S.L.guests.indexOf(g) < 0) return false;
    if(!fits(g, slot)){ toast(LG.isP(g) ? `The ${LG.SLOTS[slot].name.toLowerCase()} is not a bedroom. ${NmOf(g)} ${LG.vb(g, 'needs', 'need')} one of the six bedrooms.` : `${NmOf(g)} ${LG.vb(g, 'goes', 'go')} in a room that is not a bedroom: the loft, the office, the lounge or the garage.`, 4200); SND.bad(); return false; }
    if(!S.t0) S.t0 = performance.now(); const was = S.status.map(x => x.s), prevSlot = S.at[g], occ = occupant(slot);
    if(occ && occ !== g){ if(prevSlot && fits(occ, prevSlot)) S.at[occ] = prevSlot; else delete S.at[occ]; }
    S.at[g] = slot; S.sel = null; S.lastAct = performance.now(); tip(''); $('#rfeLift').classList.remove('pulse'); if(!PAWN.g[g]) PAWN.build(g); S.hinting = !!opts.hint; try{ refresh(true); }finally{ S.hinting = false; } PAWN.drop(g); if(occ && occ !== g && S.at[occ]) PAWN.drop(occ);
    const now = S.status.map(x => x.s), newBad = now.some((s, i) => s === 'bad' && was[i] !== 'bad'), newOk = now.some((s, i) => s === 'ok' && was[i] !== 'ok');
    SND.place(); if(newBad) setTimeout(() => SND.bad(), 260); else if(newOk) setTimeout(() => SND.ok(), 240);
    ga('rfe3d_place', {level: S.L.id}); if(solved()) setTimeout(win, 700); else coachAfterPlace(); return true; }
  function unplace(g){ if(S.done || !S.at[g]) return; delete S.at[g]; S.sel = null; SND.tap(); refresh(true); }
  function coachAfterPlace(){ if(SAVE.tips.unseen) return; const i = S.status.findIndex(x => x.s === 'unseen'); if(i < 0) return; SAVE.tips.unseen = 1; save();
    setTimeout(() => { if(!S.done) say('I only tick a clue once we have both seen the proof. Tap a room and go and look.', 8000); }, 900); }

  /* ---- chips: tap to pick up, or drag onto a room */
  let drag = null;
  function bindChip(b, g){
    b.addEventListener('pointerdown', e => { if(S.done || S.busy) return; SND.unlock(); drag = {g, id: e.pointerId, sx: e.clientX, sy: e.clientY, on: false, t: performance.now(), touch: e.pointerType === 'touch'}; });
    b.addEventListener('click', e => { e.preventDefault(); if(drag && drag.moved) return; if(S.done) return; select(S.sel === g ? null : g); }); }
  addEventListener('pointermove', e => { if(!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if(!drag.on){ if(Math.hypot(dx, dy) < 10) return;
      if(S.view !== 'over'){ drag = null; return; } drag.on = drag.moved = true; S.sel = drag.g; renderTray(); renderClues(); drawLabels(); const gh = $('#rfeGhost'), G = LG.GUESTS[drag.g];
      gh.innerHTML = `<span class="rfeG${G.kind === 't' ? ' t' : ''}"><span class="em" style="background:${G.col}">${gIco(drag.g)}</span><span><span class="tp">${esc(shortOf(drag.g))}</span></span></span>`; gh.style.display = 'block'; SND.pick(); }
    e.preventDefault(); $('#rfeGhost').style.transform = `translate(${e.clientX - 24}px,${e.clientY - 46}px)`; S.hover = slotAt(e.clientX, e.clientY); drawLabels(); }, {capture: true, passive: false});
  const endDrag = e => { if(!drag || e.pointerId !== drag.id) return; const d = drag; drag = null; if(!d.on) return; $('#rfeGhost').style.display = 'none'; const slot = e.type === 'pointerup' ? slotAt(e.clientX, e.clientY) : null; S.hover = null;
    setTimeout(() => { if(d) d.moved = false; }, 0); if(slot) place(d.g, slot); else { S.sel = null; refresh(); } };
  addEventListener('pointerup', endDrag, true); addEventListener('pointercancel', endDrag, true);

  /* ---- room names over the house, and picking a room with a tap */
  const LB = {};
  function buildLabels(){ const host = $('#rfeLabels'); for(const id of ORDER){ const b = el('button', {type: 'button', class: 'rfeLb', 'data-slot': id}); host.appendChild(b); LB[id] = {b, on: false, x: 0, y: 0};
      b.onclick = e => { e.stopPropagation(); SND.unlock(); onRoom(id); }; b.onpointerenter = () => { S.hover = id; }; b.onpointerleave = () => { if(S.hover === id) S.hover = null; }; } }
  function drawLabels(){ if(!S.L) return; for(const id of ORDER){ const L = LB[id], sl = LG.SLOTS[id], occ = occupant(id), ghost = covered(id);
      const icons = noteIcons(id), cls = 'rfeLb' + (L.on ? ' on' : '') + (ghost ? ' ghost' : '') + (S.sel ? (fits(S.sel, id) ? ' can' : ' no') : '') + (S.hover === id ? ' hov' : '');
      // who is in the room: a strip of tape under the name where there is space, the guest's own medallion inside the name on a phone (so names never jump about)
      const ph = phone(), html = `<span class="nm">${occ && ph ? `<b class="oe" style="background:${LG.GUESTS[occ].col}">${gIco(occ)}</b>` : ''}${esc(sl.name)}${icons ? '<i>' + icons + '</i>' : ''}</span>` + (occ && !ph ? `<span class="oc${LG.GUESTS[occ].kind === 't' ? ' t' : ''}">${esc(shortOf(occ))}</span>` : '');
      if(L.html !== html){ L.b.innerHTML = html; L.html = html; L.w = 0; } if(L.b.className !== cls){ L.b.className = cls; L.w = 0; }
      L.b.setAttribute('aria-label', sl.name + ', ' + lvTxt(id) + (occ ? ', ' + nmOf(occ) : ', empty')); } }
  function noteIcons(id){ let s = ''; const N = SAVE.notes[id] || {}; if(SAVE.light[id]){ const sl = LG.SLOTS[id]; s += sl.none ? nIco('none') : (sl.am ? nIco('am') : '') + (sl.pm ? nIco('pm') : '') + (!sl.am && !sl.pm ? nIco('mid') : ''); }
    for(const k of Object.keys(N)) if(NOTE_ICO[k] && k.indexOf('x:') !== 0) s += nIco(NOTE_ICO[k]); return s; }
  // a room you cannot see right now: under the upper level, or lifted off with it
  const UNDER = {corner: 1, side: 1, lounge: 1};
  const covered = id => S.upperOn ? !!UNDER[id] : LG.SLOTS[id].lv === 'upper';
  const _v = new V3();
  function labelsStep(){ const show = S.view === 'over' && !rig.move && !S.busy, r = canvas.getBoundingClientRect(), F = freeRect(), placed = [], items = [];
    for(const id of ORDER){ const L = LB[id]; if((!show && S.view !== 'win') || (covered(id) && !occupant(id))){ if(L.on){ L.on = false; L.b.classList.remove('on'); } continue; }
      const G = GEO[id], occ = occupant(id), pc = occ && PAWN.g[occ], lift = !!(pc && pc.visible);   // with a piece in the room, the name goes just above its head
      if(lift){ const q = PAWN.spot(id); _v.set(q[0], G.fy + (pc.userData.h || 3.5) * (pc.userData.k || 1) + .4, q[1]).project(camera); } else _v.set(G.c[0], G.fy + (covered(id) && S.upperOn ? 14 : 4.5), G.c[1]).project(camera);
      const x = r.left + (_v.x + 1) / 2 * r.width, y = r.top + (1 - _v.y) / 2 * r.height; items.push({id, x, y, z: _v.z, lift}); }
    // each name goes as near its room as it can without covering another: tried in a fixed order and in small steps, so a name moves little when another changes
    for(const it of items){ const L = LB[it.id]; if(!L.w){ L.w = L.b.offsetWidth || 110; L.h = L.b.offsetHeight || 28; } const w = L.w, h = L.h, cx = x => clamp(x, F.l + w / 2 + 2, F.r - w / 2 - 2), cy = y => clamp(y, F.t + h / 2, F.b - h / 2); if(it.lift) it.y -= h / 2 + 2;
      let x = cx(it.x), y = cy(it.y); const hit = (xx, yy) => placed.some(q => !(xx + w / 2 + 4 < q[0] || xx - w / 2 - 4 > q[2] || yy + h / 2 + 2 < q[1] || yy - h / 2 - 2 > q[3]));
      for(const o of LB_TRY){ const xx = cx(it.x + o[0]), yy = cy(it.y + o[1]); if(!hit(xx, yy)){ x = xx; y = yy; break; } }
      placed.push([x - w / 2, y - h / 2, x + w / 2, y + h / 2]); L.x = x; L.y = y;
      L.b.style.transform = `translate(${(x - w / 2).toFixed(1)}px,${(y - h / 2).toFixed(1)}px)`; if(!L.on){ L.on = true; L.b.classList.add('on'); } } }
  const LB_TRY = (() => { const o = []; for(const dx of [0, -44, 44, -88, 88, -132, 132]) for(const dy of [0, 14, -14, 28, -28, 42, -42, 56, -56, 70, -70]) o.push([dx, dy]); return o.sort((a, b) => (Math.abs(a[0]) * .7 + Math.abs(a[1])) - (Math.abs(b[0]) * .7 + Math.abs(b[1]))); })();
  // which room is under a point on the screen: a label first, then the floors you can see
  const _ray = new THREE.Raycaster(), _n = new THREE.Vector2();
  function slotAt(cx, cy){ for(const id of ORDER){ const L = LB[id]; if(!L.on) continue; const q = L.b.getBoundingClientRect(); if(cx >= q.left - 10 && cx <= q.right + 10 && cy >= q.top - 10 && cy <= q.bottom + 10) return id; }
    const r = canvas.getBoundingClientRect(); _n.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height * 2 - 1)); _ray.setFromCamera(_n, camera); const o = _ray.ray.origin, d = _ray.ray.direction; let best = null;
    for(const id of ORDER){ if(covered(id)) continue; const G = GEO[id], t = (G.fy + .1 - o.y) / d.y; if(!(t > 0)) continue; const x = o.x + d.x * t, z = o.z + d.z * t; if(inPoly(x, z, G.P) && (!best || t < best.t)) best = {id, t}; }
    return best ? best.id : null; }
  function tapAt(cx, cy){ if(!live()) return; if(S.view === 'over'){ const id = slotAt(cx, cy); if(id) onRoom(id); else if(S.sel) select(null); } }
  function onRoom(id){ if(!live() || S.view !== 'over') return; if(S.sel){ place(S.sel, id); return; } enter(id); }
  function setUpper(on, quiet){ if(S.upperOn === on) return; S.upperOn = on; if(!quiet) SND.lift(); HOUSE.level(on); $('#rfeLift').setAttribute('aria-pressed', String(!on)); $('#rfeLift span').textContent = on ? 'Lift off the upper level' : 'Put the upper level back';
    $('#rfeLift').classList.remove('pulse'); orbitFit(); drawLabels(); PAWN.sync(); wake(80); if(!on && !SAVE.tips.lift && !S.done){ SAVE.tips.lift = 1; save(); toast('Two bedrooms, a bath and the lounge sit under the primary suite.', 4200); } }

  /* ================================================================== going into a room and coming back out */
  function standView(slot){ const st = standOf(slot), a = yp(st.pos, st.face); return {pos: st.pos, yaw: a[0], pitch: a[1]}; }
  function reframe(){ const s = rig.st, F = freeRect(); s.offX = ((F.l + F.r) / 2) / F.W - .5; s.offY = phone() ? ((F.t + F.b) / 2) / F.Hh - .5 : 0; rig.sig = ''; }
  function setStand(slot){ const v = standView(slot), s = rig.st; s.pos.set(...v.pos); s.yaw = s.tyaw = v.yaw; s.pitch = s.tpitch = v.pitch; s.fov = placeFov(68); s.zoom = 1; s.slow = false; S.lookBack = 0; }
  function peekPose(slot){ const G = GEO[slot], o = rig.orb, dx = Math.sin(o.th), dz = Math.cos(o.th); return {pos: [G.c[0] + dx * 13, G.fy + 30, G.c[1] + dz * 13], at: [G.c[0], G.fy + 1, G.c[1]], fov: 42, off: rig.off.slice()}; }
  function enter(slot){ if(!GEO[slot] || S.busy || rig.move || S.done || S.view !== 'over') return; S.busy = true; S.sel = null; tip(''); closeMenus(); SND.dive(); ga('rfe3d_enter', {room: slot});
    if(!S.t0) S.t0 = performance.now(); if(covered(slot)) setUpper(!S.upperOn, true);
    rigFly(peekPose(slot), {dur: .85, done: () => { dissolve(() => { S.view = 'room'; S.room = slot; HOUSE.inside(); setStand(slot); rigCut(standPose()); document.documentElement.classList.add('rfe-in'); arrive(slot); }, () => { S.busy = false; }); }}); }
  function hop(slot){ if(!GEO[slot] || S.busy || rig.move || S.done || S.view !== 'room' || slot === S.room) return; S.busy = true; closeMenus(); SND.dive();
    dissolve(() => { S.room = slot; setStand(slot); rigCut(standPose()); arrive(slot); }, () => { S.busy = false; }); }
  // the hour you arrive at counts as seen: come in at evening, drag to morning, and you have watched the light
  function arrive(slot){ if(!SAVE.seen[slot]){ SAVE.seen[slot] = 1; save(); } S.lightSeen = {lo: S.hour <= 8.5, hi: S.hour >= 18.5}; S.sweeping = false; SUN.show(slot); setClock(S.hour); noteLight(); setMarks(); drawRoom(); layoutVars(); reframe();
    renderClues(true); objective(); $('#rfeSun').classList.toggle('key', !SAVE.light[slot]); S.lastAct = performance.now(); document.documentElement.classList.remove('rfe-clues'); $('#rfeCluesBtn').setAttribute('aria-pressed', 'false');
    PAWN.sync(); }
  function leave(then){ if(S.view !== 'room' || S.busy || rig.move) return; const slot = S.room; S.busy = true; closeMenus(); SND.back(); S.sweeping = false;
    dissolve(() => { S.view = 'over'; S.room = null; SUN.show(null); for(const m of marks) m.b.remove(); marks.length = 0; document.documentElement.classList.remove('rfe-in', 'rfe-clues');
      if(covered(slot)) setUpper(!S.upperOn, true); HOUSE.over(); orbitFit(); layoutVars(); orbitFit(); rigCut(peekPose(slot)); refresh(); },
      () => { rigFly(orbitPose(), {dur: .9, done: () => { S.busy = false; if(then) then(); }}); }); }

  /* ---- the card for the room you are standing in */
  // +x in the model is north-east, -z north-west (toward the hills), +z south-east (toward the street): measured from the model's own sun
  function facing(){ const s = rig.st; let b = (46.14 + Math.atan2(-Math.cos(s.yaw), -Math.sin(s.yaw)) * 180 / Math.PI) % 360; if(b < 0) b += 360;
    const word = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(b / 45) % 8];
    const off = (x, z) => Math.abs(angDiff(s.yaw, Math.atan2(-(x - s.pos.x), -(z - s.pos.z)))); let to = '';
    if(off(7.7, -30.3) < .5) to = 'the old oak'; else if(S.room && LG.SLOTS[S.room].lv === 'lower' && off(-3.5, -44) < .45) to = 'the outdoor kitchen';
    else if(Math.abs(angDiff(s.yaw, 0)) < .7) to = 'the hills'; else if(Math.abs(angDiff(s.yaw, Math.PI)) < .7) to = 'the street';
    return {b, text: 'Facing ' + word + (to ? ', toward ' + to : '')}; }
  const turned = () => { if(S.view !== 'room' || !S.room) return false; const s = rig.st, v = standView(S.room); return Math.abs(angDiff(s.tyaw, v.yaw)) > .6 || Math.abs(s.tpitch - v.pitch) > .3 || s.zoom < .95; };
  function faceRoom(){ if(S.view !== 'room' || !S.room || S.busy || rig.move) return; const s = rig.st, v = standView(S.room); s.tyaw = s.yaw + angDiff(s.yaw, v.yaw); s.tpitch = v.pitch; s.zoom = 1; s.slow = true; S.lookBack = 0; S.lastAct = performance.now(); SND.tap(); }
  function faceStep(now){ if(S.view !== 'room') return; const e = $('#rfeFace'); if(!e) return;
    // a look up at a skylight settles back to the way you came in by itself, unless you have taken hold of the view since
    if(S.lookBack && now > S.lookBack){ S.lookBack = 0; const s = rig.st, v = standView(S.room); s.tyaw = s.yaw + angDiff(s.yaw, v.yaw); s.tpitch = v.pitch; s.zoom = 1; s.slow = true; }
    const f = facing(), off = turned(), key = f.text + '|' + Math.round(f.b / 2) + '|' + off; if(key === UI.faceKey) return; UI.faceKey = key;
    $('#rfeFaceT').textContent = f.text; const n = e.querySelector('g'); if(n) n.setAttribute('transform', 'rotate(' + (-f.b).toFixed(0) + ' 12 12)');
    e.classList.toggle('off', off); e.setAttribute('aria-label', f.text + (off ? '. Turn back to the way you came in.' : '')); }
  const COMPASS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#c9c4b6" stroke-width="1.5"/><g><path d="M12 3.600l2.600 8.400H9.400z" fill="#9b2c3c"/><path d="M12 20.400l2.600-8.400H9.400z" fill="#c9c4b6"/></g><circle cx="12" cy="12" r="1.300" fill="#1f2a3a"/></svg>';
  function drawRoom(fresh){ const slot = S.room; if(!slot) return; const sl = LG.SLOTS[slot], r = RINGS[slot] || [], occ = occupant(slot); let li = '';
    li += SAVE.light[slot] ? `<li${fresh === 'light' ? ' class="new"' : ''}>${nIco(sl.none ? 'none' : sl.am ? 'am' : sl.pm ? 'pm' : 'mid')}<span>${esc(SUN.text(slot))}</span></li>` : `<li class="todo">${nIco('mid')}<span>Light: drag the sun across a midsummer day</span></li>`;
    for(const q of r) if(hasNote(slot, q.note)) li += `<li${fresh === q.note ? ' class="new"' : ''}>${nIco(NOTE_ICO[q.note])}<span>${esc(NOTE_TXT[q.note])}</span></li>`;
    const todo = r.filter(q => !hasNote(slot, q.note)).length; if(todo) li += `<li class="todo">${ICO.ring}<span>${todo === 1 ? 'One more thing' : todo + ' things'} to notice: tap the gold ${todo === 1 ? 'ring' : 'rings'}</span></li>`;
    const i = ORDER.indexOf(slot), prev = ORDER[(i + ORDER.length - 1) % ORDER.length], next = ORDER[(i + 1) % ORDER.length], cap = UI.cap && UI.capSlot === slot;
    $('#rfeRoom').innerHTML = `<div class="hd"><button type="button" id="rfePrev" aria-label="Previous room: ${esc(LG.SLOTS[prev].name)}">${ICO.back}</button><b>${esc(sl.name)}</b><button type="button" id="rfeNext" aria-label="Next room: ${esc(LG.SLOTS[next].name)}">${ICO.fwd}</button></div>
      <div class="lv">${esc(lvTxt(slot))}${occ ? ' · ' + esc(NmOf(occ)) : ''}</div><p class="wh">${esc(LG.WHERE[slot])}</p><ul>${li}</ul><p class="cap${cap ? ' on' : ''}">${cap ? esc(UI.cap) : ''}</p>
      <button type="button" id="rfeFace"><span class="cmp">${COMPASS}</span><span id="rfeFaceT"></span><i>Turn back</i></button>`;
    UI.faceKey = ''; $('#rfeFace').onclick = () => { if(turned()) faceRoom(); }; faceStep(performance.now()); layoutVars();
    $('#rfePrev').onclick = () => { SND.unlock(); hop(prev); }; $('#rfeNext').onclick = () => { SND.unlock(); hop(next); }; if(S.view === 'room') requestAnimationFrame(reframe); }
  function openWho(){ const slot = S.room, w = $('#rfeWho'), occ = occupant(slot); let h = `<h4>${esc(LG.SLOTS[slot].name)}</h4>`;
    const list = S.L.guests.filter(g => fits(g, slot) && g !== occ); if(!list.length) h += `<h4>${LG.SLOTS[slot].bed ? 'Nobody on this guest list needs another bedroom.' : 'Nothing on this guest list goes in a room like this.'}</h4>`;
    for(const g of list.sort((a, b) => (S.at[a] ? 1 : 0) - (S.at[b] ? 1 : 0))) h += `<button type="button" data-g="${g}"><span class="em" style="background:${LG.GUESTS[g].col}">${gIco(g)}</span><span>${esc(NmOf(g))}<small>${S.at[g] ? 'Move from the ' + esc(LG.SLOTS[S.at[g]].name) : 'No room yet'}</small></span></button>`;
    if(occ) h += `<button type="button" data-g="-"><span class="em" style="background:#8a8f99">${ICO.cross}</span><span>Leave it empty<small>Take ${esc(nmOf(occ))} out</small></span></button>`;
    w.innerHTML = h; w.classList.add('on'); $('#rfeWhoBtn').setAttribute('aria-expanded', 'true');
    $$('button', w).forEach(b => b.onclick = () => { closeMenus(); if(b.dataset.g === '-') unplace(occ); else place(b.dataset.g, slot); drawRoom(); }); }

  /* ---- gold rings: the things in a room worth a look */
  const marks = [];
  function setMarks(){ for(const m of marks) m.b.remove(); marks.length = 0; if(S.view !== 'room' || !S.room) return;
    for(const q of (RINGS[S.room] || [])){ const b = el('button', {class: 'rfeMk', type: 'button', 'aria-label': 'Look at the ' + q.label.toLowerCase()}, `<i>${hasNote(S.room, q.note) ? ICO.check : ''}</i><span>${esc(q.label)}</span>`);
      const m = {b, q, at: ringAt(S.room, q), on: false}; b.onclick = e => { e.stopPropagation(); SND.unlock(); look(m); }; $('#rfeMarks').appendChild(b); marks.push(m); } }
  function look(m){ if(S.busy || rig.move) return; const s = rig.st, a = yp([s.pos.x, s.pos.y, s.pos.z], m.at); s.tyaw = s.yaw + angDiff(s.yaw, a[0]); s.tpitch = clamp(a[1], -1.15, 1.25); s.zoom = Math.min(s.zoom, .82); s.slow = false;
    S.lookBack = a[1] > .6 ? performance.now() + (reduce ? 3000 : 5200) : 0;
    const slot = S.room, fresh = !hasNote(slot, m.q.note); SAVE.notes[slot] = SAVE.notes[slot] || {}; for(const n of [m.q.note].concat(m.q.also || [])) SAVE.notes[slot][n] = 1; save();
    UI.cap = m.q.t; UI.capSlot = slot; if(fresh){ SND.note(); ga('rfe3d_note', {room: slot, note: m.q.note}); } else SND.tap();
    setMarks(); drawRoom(fresh ? m.q.note : null); renderClues(true); objective(); S.lastAct = performance.now(); }
  function marksStep(){ if(!marks.length) return; const r = canvas.getBoundingClientRect(), hide = !!rig.move || S.busy || S.view !== 'room';
    const F = freeRect(), top = phone() ? F.t + 30 : 96, bot = phone() ? F.b - 52 : r.height - 150, padX = 40, placed = [], xl = (phone() ? r.left : Math.max(r.left, F.l - 14)) + padX, xr = r.left + r.width - padX;
    for(const m of marks){ if(hide){ if(m.on){ m.on = false; m.b.classList.remove('on'); } continue; }
      _v.set(m.at[0], m.at[1], m.at[2]).applyMatrix4(camera.matrixWorldInverse); const behind = _v.z > -.3, side = _v.x;
      _v.set(m.at[0], m.at[1], m.at[2]).project(camera); let x = r.left + (_v.x + 1) / 2 * r.width, y = r.top + (1 - _v.y) / 2 * r.height, edge = '';
      if(behind || x < xl - 50 || x > xr + 50 || y < r.top - 60 || y > r.top + r.height + 60){ edge = (behind ? side < 0 : x < (xl + xr) / 2) ? 'L' : 'R'; x = edge === 'L' ? xl : xr; y = r.top + Math.max(top + 24, r.height * .45); }
      else { x = clamp(x, xl, xr); y = clamp(y, r.top + top, r.top + bot); if(x < xl + 48) edge = 'L'; else if(x > xr - 48) edge = 'R'; }
      let n = 0; const hit = q => Math.abs(q[0] - x) < 150 && Math.abs(q[1] - y) < 44; while(placed.some(hit) && n++ < 10){ y += 46; if(y > r.top + bot) y = r.top + top + 24; }
      placed.push([x, y]); m.b.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; const cls = 'rfeMk on' + (hasNote(S.room, m.q.note) ? ' got' : '') + (edge ? ' edge ' + edge : ''); if(m.b.className !== cls) m.b.className = cls; m.on = true; } }

  /* ---- the sun slider */
  function setClock(h){ $('#rfeClock').textContent = fmtH(h); const on = !!(SUN.cur && SUN.cur.level >= .45), e = $('#rfeSunNow'); e.textContent = on ? 'Sun in this room now' : 'No direct sun in here now'; e.className = on ? 'on' : '';
    $('#rfeSlider').setAttribute('aria-valuetext', fmtH(h) + ', ' + e.textContent); }
  function onSlide(h, user){ applyHour(h); setClock(h); if(user) S.lastAct = performance.now(); if(S.view === 'room'){ if(h <= 8.5) S.lightSeen.lo = true; if(h >= 18.5) S.lightSeen.hi = true; noteLight(); } }
  function noteLight(){ const slot = S.room; if(!slot || SAVE.light[slot] || !(S.lightSeen.lo && S.lightSeen.hi)) return; SAVE.light[slot] = 1; save(); SND.note(); $('#rfeSun').classList.remove('key'); drawRoom('light'); renderClues(true); objective(); ga('rfe3d_light', {room: slot}); }
  function setHour(h){ $('#rfeSlider').value = h; onSlide(h); applyHour(h, true); }
  function watchDay(){ if(S.sweeping || S.view !== 'room') return; S.sweeping = true; const t0 = performance.now(), ms = reduce ? 1400 : 5200, slot = S.room; $('#rfeSun').classList.remove('key');
    (function f(){ if(!S.sweeping || S.room !== slot || S.view !== 'room'){ S.sweeping = false; return; } const u = clamp((performance.now() - t0) / ms, 0, 1), h = Math.round(lerp(H0, H1, u) * 4) / 4;
      if(h !== S.hour){ $('#rfeSlider').value = h; onSlide(h); } if(u < 1) requestAnimationFrame(f); else { S.sweeping = false; applyHour(H1, true); } })();
    // a hidden tab does not animate: make sure the day still ends
    setTimeout(() => { if(S.sweeping && S.room === slot){ S.sweeping = false; setHour(H1); S.lightSeen.lo = S.lightSeen.hi = true; noteLight(); } }, ms + 1500); }

  /* ================================================================== hints: Snowball, three levels for the guest you are stuck on */
  function hintTarget(){ const ans = S.L.answer; return (S.L.order || S.L.guests).find(g => S.at[g] !== ans[g]) || null; }
  function hint(){ if(!S.started || S.done || S.busy || rig.move || !S.L) return; const g = hintTarget(); if(!g) return; if(S.hintFor !== g){ S.hintFor = g; S.hintTier = 0; }
    const tier = S.hintTier, slot = S.L.answer[g]; S.hintTier = Math.min(2, tier + 1); S.hints++; S.lastAct = performance.now(); $('#rfeHint').classList.remove('nudge'); ga('rfe3d_hint', {level: S.L.id, tier: tier + 1});
    const H2 = (S.L.hints || {})[g], own = S.L.clues.filter(c => LG.whoOf(c).indexOf(g) >= 0);
    if(tier === 0) say(H2 ? H2[0] : 'Start with ' + nmOf(g) + '. ' + (own[0] ? own[0].t : ''), 9000);
    else if(tier === 1) say(H2 ? H2[1] : NmOf(g) + ' ' + LG.vb(g, 'belongs', 'belong') + (LG.SLOTS[slot].lv === 'garage' ? ' in a room with a car door.' : ' on the ' + LG.LEVEL_NAME[LG.SLOTS[slot].lv] + '.'), 9000);
    else { const put = () => { say(`I will do it. ${NmOf(g)} ${LG.vb(g, 'goes', 'go')} in the ${LG.SLOTS[slot].name}.`, 7000);
          // what I show you counts as seen
          for(const c of own) for(const n of LG.needs(c, Object.assign({}, S.at, {[g]: slot}))){ if(n[1] === 'light') SAVE.light[n[0]] = 1; else if(n[2]){ SAVE.notes[n[0]] = SAVE.notes[n[0]] || {}; SAVE.notes[n[0]][n[1]] = 1; } else SAVE.seen[n[0]] = 1; } save();
          if(covered(slot) && S.view === 'over') setUpper(!S.upperOn); place(g, slot, {hint: true}); S.hintFor = null; S.hintTier = 0; };
      if(S.view === 'room') leave(put); else put(); } }

  /* ================================================================== cards: title, the guest list for a puzzle, and the end */
  function closeCard(){ const c = $('#rfeCard'); if(c) c.remove(); }
  const sndBtn = () => `<button class="rfeBtn" type="button" id="rfeSnd0"></button>`;
  function bindSnd0(){ const s0 = $('#rfeSnd0'); if(!s0) return; const d0 = () => { s0.innerHTML = (SND.muted ? ICO.mute : ICO.sound) + '<span>' + (SND.muted ? 'Sound is off' : 'Sound is on') + '</span>'; s0.setAttribute('aria-pressed', String(!SND.muted)); };
    s0.onclick = () => { SND.setMuted(!SND.muted); d0(); UI.drawSnd(); if(!SND.muted) SND.goal(); }; d0(); }
  function levelList(){ const day = LG.dayNumber(new Date()), dk = 'day' + day;
    return `<ul class="lv">` + LG.LEVELS.map((L, i) => { const b = SAVE.solved[L.id]; return `<li><button type="button" data-lv="${i}" class="${b ? 'done' : ''}">${i + 1}. ${esc(L.title)}<small>${b ? 'Solved in ' + fmtT(b.time) : L.guests.length + ' to place'}</small></button></li>`; }).join('') +
      `<li><button type="button" data-lv="daily" class="${SAVE.solved[dk] ? 'done' : ''}">Today’s guest list<small>${SAVE.solved[dk] ? 'Solved in ' + fmtT(SAVE.solved[dk].time) : 'A new one every day'}</small></button></li></ul>`; }
  function nextLevel(){ const i = LG.LEVELS.findIndex(L => !SAVE.solved[L.id]); return i < 0 ? 'daily' : i; }
  function titleCard(){ closeCard(); try{ orbitFit(); }catch(e){} const first = !Object.keys(SAVE.solved).length, nx = nextLevel();
    const c = el('div', {id: 'rfeCard'}, `<div class="c" role="dialog" aria-labelledby="rfeH"><p class="k">A logic puzzle inside a real house</p><h2 id="rfeH">Room for Everyone</h2>
      <p class="lede">Snowball the cat lives at 118 Hillside Drive, and his friends are coming to stay. Every one of them has asked for something. Work out who gets which room. Some of what you need is written in the clues. The rest you find by going into the rooms and looking.</p>
      <ul class="how"><li>${ICO.bed}Tap a guest, then a room</li><li>${ICO.house}Tap a room on its own to go inside</li><li>${ICO.ring}Tap gold rings and drag the sun to see what a room has</li></ul>
      ${first ? '' : levelList()}
      <div class="acts"><button class="rfeBtn primary" type="button" id="rfeGo" style="min-width:150px;min-height:52px;font-size:17px">${first ? 'Meet the guests' : nx === 'daily' ? 'Play today’s guest list' : 'Play puzzle ' + (nx + 1)}</button>${sndBtn()}</div>
      <p class="foot">Five puzzles and a new one every day, each with exactly one answer. The house is real: 118 Hillside Drive in Woodside, California, and it is for sale. What you see here is a 3D model of it, and the sunlight is the model’s, worked out for a midsummer day. The animals are made up.</p></div>`);
    document.body.appendChild(c); bindSnd0(); const go = v => { SND.unlock(); SND.tap(); introCard(v === 'daily' ? LG.daily(LG.dayNumber(new Date())) : LG.LEVELS[v]); };
    $('#rfeGo').onclick = () => go(nx); $$('#rfeCard .lv button').forEach(b => b.onclick = () => go(b.dataset.lv === 'daily' ? 'daily' : +b.dataset.lv)); try{ $('#rfeGo').focus({preventScroll: true}); }catch(e){} }
  // who takes a bedroom and what does not: said once, on the card for each puzzle
  function ruleTxt(L){ const join = a => a.length > 2 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a.join(' and ');
    const ps = L.guests.filter(LG.isP), ts = L.guests.filter(g => !LG.isP(g)), tn = ts.map((g, i) => i ? nmOf(g) : NmOf(g));
    return `${join(ps.map(nmOf))} each get a bedroom of their own.` + (ts.length ? ` ${join(tn)} ${ts.length > 1 ? 'go in rooms that are not bedrooms' : 'goes in a room that is not a bedroom'}: the loft, the office, the lounge or the garage.` : ''); }
  function introCard(L){ closeCard(); if(!L){ titleCard(); return; } try{ orbitFit(); }catch(e){} const i = LG.LEVELS.indexOf(L);
    const c = el('div', {id: 'rfeCard'}, `<div class="c" role="dialog" aria-labelledby="rfeH"><p class="k">${i >= 0 ? 'Puzzle ' + (i + 1) + ' of ' + LG.LEVELS.length : new Date().toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'})}</p><h2 id="rfeH">${esc(L.title)}</h2>
      <p class="lede">${esc(L.story)}</p>
      <ul class="who">${L.guests.map(g => `<li><span class="em" style="background:${LG.GUESTS[g].col}">${gIco(g)}</span><span><b>${esc(NmOf(g))}</b>${esc(LG.GUESTS[g].bio)}</span></li>`).join('')}</ul>
      <p class="rule">${esc(ruleTxt(L))}</p>
      <div class="acts"><button class="rfeBtn primary" type="button" id="rfeGo" style="min-width:150px;min-height:52px;font-size:17px">Show me the house</button><button class="rfeBtn" type="button" id="rfeOther">Other puzzles</button></div></div>`);
    document.body.appendChild(c); $('#rfeGo').onclick = () => { SND.unlock(); SND.goal(); closeCard(); startLevel(L); }; $('#rfeOther').onclick = () => titleCard(); try{ $('#rfeGo').focus({preventScroll: true}); }catch(e){} }
  function startLevel(L, again){ if(!L.answer) L.answer = LG.prove(L).answer; const begin = () => { S.L = L; S.li = LG.LEVELS.indexOf(L); S.at = {}; S.sel = null; S.done = false; S.t0 = 0; S.tEnd = 0; S.hints = 0; S.clean = true; S.status = []; S.hintFor = null; S.hintTier = 0; S.started = true; S.lastAct = performance.now();
      document.documentElement.classList.remove('rfe-pre', 'rfe-cine'); for(const id in PAWN.g) PAWN.g[id].visible = false; for(const g of L.guests) if(!PAWN.g[g]) PAWN.build(g); for(const id of ORDER){ TINT.lid[id].visible = false; }
      $('#rfeTitle').textContent = L.title; $('#rfeStory').textContent = L.story; UI.cap = null; if(!S.upperOn) setUpper(true, true);
      if(todKey !== 'rfe' || S.hour !== 13){ $('#rfeSlider').value = 13; setClock(13); applyHour(13, true); }
      S.view = 'over'; HOUSE.over(); layoutVars(); refresh(); orbitFit(); layoutVars(); orbitFit(); ga('rfe3d_start', {level: L.id});
      const u = new URL(location.href); u.searchParams.set('puzzle', L.daily ? 'daily' : String(S.li + 1)); try{ history.replaceState(null, '', u); }catch(e){}
      const bc = $('#rfeBackCard'); if(bc) bc.remove();
      if(!SAVE.tips.first){ SAVE.tips.first = 1; save(); setTimeout(() => { if(!S.done && !Object.keys(S.at).length) say('Pick a guest, then tap a room. Or tap a room and go and have a look first.', 8000); }, 1800); } };
    if(S.view === 'room'){ S.busy = false; rig.move = null; dissolve(() => { S.view = 'over'; S.room = null; SUN.show(null); for(const m of marks) m.b.remove(); marks.length = 0; document.documentElement.classList.remove('rfe-in', 'rfe-clues'); begin(); rigCut(orbitPose()); }); }
    else { begin(); rigCut(orbitPose()); } }

  /* ---- the end of a puzzle: dusk, and a light in every room that has somebody in it */
  const BUB = [];
  function win(){ if(S.done) return; S.done = true; S.tEnd = performance.now(); S.sel = null; const t = elapsed(), L = S.L; tip(''); closeMenus(); ga('rfe3d_win', {level: L.id, secs: Math.round(t), hints: S.hints, clean: S.clean ? 1 : 0});
    const best = SAVE.solved[L.id]; if(!best || t < best.time) SAVE.solved[L.id] = {time: t, hints: S.hints, clean: S.clean}; save();
    const show = () => { document.documentElement.classList.add('rfe-cine'); S.view = 'win'; renderTray(); renderClues(); drawLabels(); setGoal('Everyone has a room.', true); toast('Everyone has a room.', 2600); SND.ok();
      // downstairs and the main level first, with the upper level lifted off if anyone is under it; then it comes back and its own lights go on
      const low = ORDER.filter(id => occupant(id) && LG.SLOTS[id].lv !== 'upper').reverse(), up = ORDER.filter(id => occupant(id) && LG.SLOTS[id].lv === 'upper');
      setUpper(!low.some(id => UNDER[id]), true); orbitFit(); const o = rig.orb, th0 = o.th; let n = 0;
      const lids = () => { for(const id of ORDER){ const lid = TINT.lid[id], on = !covered(id) && !lid.userData.lit; if(on){ lid.material.opacity = .78; lid.visible = true; } else if(covered(id)) lid.visible = false; } wake(60); };
      for(const id of ORDER) TINT.lid[id].userData.lit = false;
      setTimeout(() => { lids(); try{ H.setTOD('dusk'); todKey = 'dusk'; }catch(e){} wake(90); }, 700);
      const lightUp = (list, then) => { let i = 0; (function next(){ if(i >= list.length){ then(); return; } const id = list[i++], g = occupant(id); TINT.lid[id].userData.lit = true; fadeLid(id); SND.lamp(n++ + 1); PAWN.drop(g); bubble(id, g); setTimeout(next, reduce ? 500 : 1000); })(); };
      const finish = () => { setTimeout(() => { for(const id of ORDER){ TINT.lid[id].userData.lit = true; fadeLid(id); } SND.win(); }, 500); setTimeout(endCard, 2800); };
      setTimeout(() => lightUp(low, () => { if(S.upperOn){ lightUp(up, finish); return; } setUpper(true); setTimeout(() => { lids(); orbitFit(); }, 60); setTimeout(() => lightUp(up, finish), 1300); }), 2200);
      if(!reduce){ const t0 = performance.now(); (function spin(){ if(S.view !== 'win' || document.getElementById('rfeCard')) return; o.th = th0 + (performance.now() - t0) / 1000 * .03; requestAnimationFrame(spin); })(); } };
    if(S.view === 'room') leaveForWin(show); else show(); }
  function leaveForWin(then){ const slot = S.room; S.busy = true; dissolve(() => { S.view = 'win'; S.room = null; SUN.show(null); for(const m of marks) m.b.remove(); marks.length = 0; document.documentElement.classList.remove('rfe-in', 'rfe-clues'); if(!S.upperOn) setUpper(true, true); HOUSE.over(); layoutVars(); orbitFit(); rigCut(orbitPose()); }, () => { S.busy = false; then(); }); }
  function fadeLid(id){ const lid = TINT.lid[id]; if(!lid.visible) return; const a0 = lid.material.opacity, t0 = performance.now(); (function f(){ const u = clamp((performance.now() - t0) / 700, 0, 1); lid.material.opacity = a0 * (1 - u); wake(3); if(u < 1) requestAnimationFrame(f); else lid.visible = false; })();
    setTimeout(() => { lid.visible = false; wake(4); }, 1500); }
  function bubble(slot, g){ const b = el('div', {class: 'rfeSayG'}, `<small>${esc(shortOf(g))}</small>${esc(LG.GUESTS[g].yay)}`); $('#rfeLabels').appendChild(b); BUB.push({b, slot, t: performance.now()}); requestAnimationFrame(() => b.classList.add('on'));
    setTimeout(() => { b.classList.remove('on'); setTimeout(() => b.remove(), 500); }, 2500); }
  function bubStep(){ for(let i = BUB.length - 1; i >= 0; i--){ const q = BUB[i]; if(!q.b.parentNode){ BUB.splice(i, 1); continue; } const L = LB[q.slot], w = q.b.offsetWidth || 160, F = freeRect(); q.b.style.transform = `translate(${clamp(L.x + 14, F.l, F.r - w).toFixed(1)}px,${(L.y - 62).toFixed(1)}px)`; } }
  function endCard(){ const L = S.L, t = elapsed(), i = LG.LEVELS.indexOf(L), nx = nextLevel(), last = nx === 'daily' && !!SAVE.solved['day' + LG.dayNumber(new Date())];
    const nextTxt = last ? 'Play one again' : nx === 'daily' ? 'Play today’s guest list' : 'Next puzzle: ' + LG.LEVELS[nx].title;
    const learned = {warm: 'You have just learned what the listing takes a page to say: a primary suite upstairs with its own bath, three bedrooms beside the kitchen, and two more downstairs.',
      sun: 'Now you know where the light goes in this model of the house: morning sun at the front, evening sun at the back, and a bedroom the old oak keeps in shade.',
      wheel: 'Three levels, with a flight of stairs between each. That is how a squeaky wheel and a light sleeper can share this house.',
      stars: 'A loft, a skylit office and a lounge that opens onto the terrace, on top of six bedrooms. There is a room here for whatever a visitor brings along.',
      full: 'Six bedrooms on three levels, three full baths, and still a loft, an office, a lounge and a garage left over. Room for everyone.'}[L.id] || 'Six bedrooms on three levels, with a loft, a skylit office and a lounge besides. Every day the guest list changes and they all still fit.';
    const c = el('div', {id: 'rfeCard'}, `<div class="c" role="dialog" aria-labelledby="rfeH"><p class="k">${i >= 0 ? 'Puzzle ' + (i + 1) + ' of ' + LG.LEVELS.length + ' · ' + esc(L.title) : 'Today’s guest list'}</p><h2 id="rfeH">Everyone has a room.</h2>
      <p class="lede">${esc(L.epi || 'The lights are on, every bed and basket is taken, and nobody is on the sofa.')}</p>
      <div class="stats"><div><b>${fmtT(t)}</b><span>your time</span></div><div><b>${S.hints}</b><span>${S.hints === 1 ? 'hint from Snowball' : 'hints from Snowball'}</span></div></div>
      ${S.hints === 0 || S.clean ? `<div class="badges">${S.hints === 0 ? '<span>No hints</span>' : ''}${S.clean ? '<span>Never broke a clue</span>' : ''}</div>` : ''}
      <div class="acts" style="margin-bottom:14px"><button class="rfeBtn dark" type="button" id="rfeNextB" style="min-height:52px;font-size:16.500px">${esc(nextTxt)}</button></div>
      <div class="cta"><b>The house is real, and it is for sale.</b><span>${esc(learned)} It is 118 Hillside Drive in Woodside, California, and you can walk through it in person.</span>
        <div class="acts"><a class="rfeBtn primary" href="/#contact" id="rfeSee" style="min-height:52px;font-size:17px">See it in person</a><a class="rfeBtn light" href="/tour/" id="rfeFree">Explore the house</a></div></div>
      <div class="more"><button class="rfeBtn" type="button" id="rfeShare">Share</button><a class="rfeBtn" href="/games/">More games</a><button class="rfeBtn" type="button" id="rfeStay">Look at the house</button></div></div>`);
    document.body.appendChild(c); $('#rfeSee').onclick = () => ga('rfe3d_cta', {cta: 'see_in_person'}); $('#rfeFree').onclick = () => ga('rfe3d_cta', {cta: 'explore'});
    $('#rfeNextB').onclick = () => { SND.unlock(); if(last) titleCard(); else introCard(nx === 'daily' ? LG.daily(LG.dayNumber(new Date())) : LG.LEVELS[nx]); };
    $('#rfeStay').onclick = () => { closeCard(); const b = el('button', {class: 'rfeBtn dark shadow', type: 'button', id: 'rfeBackCard', style: 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:75'}, 'Back to the results'); document.body.appendChild(b); b.onclick = () => { b.remove(); endCard(); }; };
    $('#rfeShare').onclick = async () => { const url = 'https://118hillside.com/games/room/' + (L.daily ? '?puzzle=daily' : '?puzzle=' + (i + 1)), text = L.daily ? `I found a room for every animal on today’s guest list at 118 Hillside Drive in ${fmtT(t)}${S.hints ? '' : ', with no hints'}. Your turn.` : `I found a room for every animal at 118 Hillside Drive: “${L.title}” in ${fmtT(t)}${S.hints ? '' : ', with no hints'}. Your turn.`; ga('rfe3d_share');
      try{ if(navigator.share){ await navigator.share({title: 'Room for Everyone', text, url}); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
      try{ await navigator.clipboard.writeText(text + ' ' + url); $('#rfeShare').textContent = 'Link copied'; }catch(e){ $('#rfeShare').textContent = url; } };
    try{ $('#rfeNextB').focus({preventScroll: true}); }catch(e){} }

  /* ================================================================== frame loop */
  let lastT = performance.now(), lastTime = '';
  function frame(){ requestAnimationFrame(frame); const now = performance.now(), dt = Math.min(.1, (now - lastT) / 1000); lastT = now;
    try{ if(UI.live){ rigStep(now, dt); PAWN.step(now); TINT.step(now); }
      // nothing may stay locked: a step that never reports back is released
      if(S.busy && !rig.move){ if(!frame.busyAt) frame.busyAt = now; else if(now - frame.busyAt > 3200){ S.busy = false; frame.busyAt = 0; const s = $('#rfeShot'); if(s) s.remove(); } } else frame.busyAt = 0;
      if(S.started){ labelsStep(); marksStep(); bubStep(); faceStep(now);
        if(!S.done){ const ts = fmtT(elapsed()); if(ts !== lastTime){ lastTime = ts; $('#rfeTime').textContent = ts; }
          if(now - S.lastAct > 90000) $('#rfeHint').classList.add('nudge'); } }
    }catch(e){ if(!frame.err){ frame.err = true; console.error('[room] frame', e); } } }

  /* ================================================================== developer tools: measuring the house (used to make room-data.js, and to check it) */
  const dev = {
    solids(){ const out = []; H.scene.traverseVisible(o => { if(!o.isMesh || !o.geometry || /^rfe-/.test(o.name || '')) return; for(let p = o; p; p = p.parent) if(p.name && /^rfe-/.test(p.name)) return; const m = o.material; if(!m) return;
        if(!Array.isArray(m)){ if((m.transparent && m.opacity < .6) || m.blending === THREE.AdditiveBlending || /glass|pane/i.test(m.name || '')) return; }
        const g = o.geometry; if(!g.boundingSphere) g.computeBoundingSphere(); if(g.boundingSphere.radius > 2000) return; out.push(o); }); return out; },
    // the clearest place to stand in a room, and a clear spot for a game piece
    stand(slot, solids, step){ solids = solids || dev.solids(); const G = GEO[slot], rc = new THREE.Raycaster(), cand = [], D = []; for(let i = 0; i < 8; i++) D.push(new V3(Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4)));
      const clr = (x, z, hs, cap) => { let m = cap; for(const h of hs){ const o = new V3(x, G.fy + h, z); for(const d of D){ rc.set(o, d); rc.far = m; const hit = rc.intersectObjects(solids, false)[0]; if(hit) m = Math.min(m, hit.distance); if(m < 1) return m; } } return m; };
      // you must be standing on the floor: a ray dropped from eye height, here and a step to each side, has to reach it (a spot on a bed reads as clear to the side rays, which start inside the mattress)
      const DN = new V3(0, -1, 0), floor = (x, z) => { for(const [dx, dz] of [[0, 0], [.7, 0], [-.7, 0], [0, .7], [0, -.7]]){ rc.set(new V3(x + dx, G.fy + 5.2, z + dz), DN); rc.far = 8; const hit = rc.intersectObjects(solids, false)[0]; if(!hit || hit.point.y - G.fy > .35) return false; } return true; };
      step = step || 1.4; for(let x = G.bb[0] + 1.4; x < G.bb[2] - 1.3; x += step) for(let z = G.bb[1] + 1.4; z < G.bb[3] - 1.3; z += step){ if(!inPoly(x, z, G.P) || !floor(x, z)) continue; const c = clr(x, z, [1.2, 4.6], 5); if(c >= 1) cand.push({x: +x.toFixed(2), z: +z.toFixed(2), c: +c.toFixed(2)}); }
      cand.sort((a, b) => b.c - a.c); return cand; },
    // is there a clear line from where you stand to each thing worth a look
    los(solids){ solids = solids || dev.solids(); const rc = new THREE.Raycaster(), out = {}; for(const slot of ORDER){ const st = standOf(slot), o = new V3(...st.pos); out[slot] = (RINGS[slot] || []).map(q => { const at = new V3(...ringAt(slot, q)), d = at.clone().sub(o), L = d.length(); rc.set(o, d.normalize()); rc.far = L - .4; const hit = rc.intersectObjects(solids, false)[0];
          return q.label + ': ' + (hit ? 'BLOCKED at ' + hit.distance.toFixed(1) + ' of ' + L.toFixed(1) + ' by ' + (hit.object.name || hit.object.parent.name) : 'clear ' + L.toFixed(1)); }); } return out; },
    // how much sun reaches each opening of a room, half-hourly from 7:00 to 19:30 on 21 June, 0..9
    sunScan(slot, solids){ solids = solids || dev.solids(); const M = H.BIM2S.meta, sp = LG.SLOTS[slot].sp, rc = new THREE.Raycaster(), out = [], fy = GEO[slot].fy; rc.far = 700;
      const scan = (pts, n, inside) => { let s = ''; for(let h = H0; h <= H1 + 1e-6; h += .5){ const su = sunAt(h); if(su.alt < .035 || su.v.dot(n) < .08){ s += '0'; continue; } let lit = 0;
          for(const p of pts){ rc.set(p, su.v); rc.far = 700; if(rc.intersectObjects(solids, false).length) continue; if(inside){ rc.set(p.clone().addScaledVector(su.v, -.5), su.v.clone().negate()); rc.far = 40; const hit = rc.intersectObjects(solids, false)[0]; if(!hit || hit.point.y > fy + 7) continue; } lit++; }
          s += String(Math.round(lit / pts.length * 9)); } return s; };
      for(const o of M.openings){ if(!((o.glazed || 0) >= .5)) continue; const A = o.spaces.A, B = o.spaces.B; if(!((A === sp && B === 'EXTERIOR') || (B === sp && A === 'EXTERIOR'))) continue;
        const op = opening(o.id), pts = []; for(const a of [-.32, 0, .32]) for(const v of [.25, .5, .75]) pts.push(op.P(a * o.width, o.sill + (o.head - o.sill) * v, -.6)); out.push({id: o.id, lit: scan(pts, new V3(op.out[0], 0, op.out[1]), false)}); }
      const skies = [].concat(...(RINGS[slot] || []).filter(q => q.sky && !q.beside).map(q => q.sky));
      for(const id of skies){ const it = skyItem(id), r = it && it.rects && it.rects[0]; if(!r) continue; const pts = []; for(const a of [-.6, 0, .6]) for(const b of [-.6, 0, .6]) pts.push(new V3(r.c.x + r.u.x * r.hu * a + r.v.x * r.hv * b, r.c.y + r.u.y * r.hu * a + r.v.y * r.hv * b + .5, r.c.z + r.u.z * r.hu * a + r.v.z * r.hv * b)); out.push({sk: id, lit: scan(pts, new V3(0, 1, 0), true)}); }
      return out; },
    // the model against room-logic.js: levels, hallways, walls, what is over what, and the sun
    verify(){ const M = H.BIM2S.meta, bad = [], SL = LG.SLOTS, bySp = {}; for(const id of ORDER) bySp[SL[id].sp] = id;
      const lvOfZ = z => z > 4 ? 'upper' : z > -1 ? 'main' : z > -4 ? 'garage' : 'lower'; for(const id of ORDER) if(lvOfZ(GEO[id].fy) !== SL[id].lv) bad.push('level ' + id);
      const doorsOf = sp => M.openings.filter(o => /^(D|OP)-/.test(o.id) && (o.spaces.A === sp || o.spaces.B === sp)).map(o => o.spaces.A === sp ? o.spaces.B : o.spaces.A);
      const hall = (a, b) => doorsOf(SL[a].sp).some(h => /HALL$/.test(h) && doorsOf(SL[b].sp).indexOf(h) >= 0);
      for(const a of LG.BEDS) for(const b of LG.BEDS){ if(a >= b) continue; const want = LG.HALLS.some(p => p.indexOf(a) >= 0 && p.indexOf(b) >= 0); if(hall(a, b) !== want) bad.push('hall ' + a + '/' + b); }
      const shared = (a, b) => { let tot = 0; const A = GEO[a].P, B = GEO[b].P; for(let i = 0; i < A.length; i++){ const p1 = A[i], p2 = A[(i + 1) % A.length], L1 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); if(L1 < .3) continue; const u = [(p2[0] - p1[0]) / L1, (p2[1] - p1[1]) / L1];
            for(let j = 0; j < B.length; j++){ const q1 = B[j], q2 = B[(j + 1) % B.length], L2 = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]); if(L2 < .3 || Math.abs(u[0] * (q2[1] - q1[1]) - u[1] * (q2[0] - q1[0])) / L2 > .05) continue;
              if(Math.abs((q1[0] - p1[0]) * -u[1] + (q1[1] - p1[1]) * u[0]) > 1) continue; const b0 = (q1[0] - p1[0]) * u[0] + (q1[1] - p1[1]) * u[1], b1 = (q2[0] - p1[0]) * u[0] + (q2[1] - p1[1]) * u[1]; tot += Math.max(0, Math.min(L1, Math.max(b0, b1)) - Math.max(0, Math.min(b0, b1))); } } return tot; };
      for(const a of ORDER) for(const b of ORDER){ if(a >= b || SL[a].lv !== SL[b].lv) continue; const len = shared(a, b), sure = LG.WALLS.some(p => p.indexOf(a) >= 0 && p.indexOf(b) >= 0), unsure = LG.WALLS_UNSURE.some(p => p.indexOf(a) >= 0 && p.indexOf(b) >= 0);
        if(SL[a].bed && SL[b].bed && ((len > 5) !== sure || (len > 1 && len <= 5) !== unsure)) bad.push('wall ' + a + '/' + b + ' ' + len.toFixed(1)); }
      const over = (a, b) => { let n = 0, t = 0; const G = GEO[b]; for(let x = G.bb[0] + .25; x < G.bb[2]; x += .5) for(let z = G.bb[1] + .25; z < G.bb[3]; z += .5){ if(!inPoly(x, z, G.P)) continue; t++; if(inPoly(x, z, GEO[a].P)) n++; } return n * .25; };
      for(const a of LG.BEDS) for(const b of LG.BEDS){ if(GEO[a].fy <= GEO[b].fy + 1) continue; const want = LG.OVER.some(p => p[0] === a && p[1] === b); if((over(a, b) > 12) !== want) bad.push('over ' + a + '/' + b + ' ' + over(a, b).toFixed(0)); }
      for(const id of ORDER){ if(!(DATA.sun || {})[id]) continue; const f = SUN.facts(id); for(const k of ['am', 'pm', 'none']) if(!!f[k] !== !!SL[id][k] && id !== 'garage' && id !== 'loft') bad.push('sun ' + id + ' ' + k + ' is ' + f[k]); }
      const sk = id => (RINGS[id] || []).some(q => q.sky && q.sky.every(s => { const it = skyItem(s), r = it && it.rects && it.rects[0]; return r && inPoly(r.c.x, r.c.z, GEO[id].P); })); for(const id of ORDER) if(sk(id) !== !!SL[id].sky) bad.push('skylight ' + id);
      if(bad.length) console.warn('[room] the model and the puzzle facts disagree:', bad.join('; ')); return bad; }};

  /* ================================================================== boot: after the house is ready */
  function loadScript(src, cb){ const s = document.createElement('script'); s.src = src; s.onload = () => cb(true); s.onerror = () => cb(false); document.head.appendChild(s); }
  function boot(){ try{ H.asBuilt && H.asBuilt(); }catch(e){}
    // beds in the bedrooms and the oak outside the windows: the game needs the furniture and the trees on, and puts the visitor's own saved choice back straight away
    for(const [id, k] of [['furnBtn', 'hillside.furniture'], ['treesBtn', 'hillside.trees']]) try{ const b = document.getElementById(id); if(b && b.getAttribute('aria-pressed') === 'false'){ const was = localStorage.getItem(k); b.click(); if(was == null) localStorage.removeItem(k); else localStorage.setItem(k, was); } }catch(e){}
    const base = (document.currentScript && document.currentScript.src) || '';
    loadScript('../assets/room3d/room-logic.js?v=2', () => loadScript('../assets/room3d/room-data.js?v=2', () => { const go = () => { LG = window.ROOM_LOGIC; DATA = window.ROOM_DATA || {}; if(!LG){ console.error('[room] the puzzle rules did not load'); return; }
        try{ measure(); buildUI(); buildLabels(); TINT.build(); S.view = 'title'; HOUSE.over(); orbitFit(); rigCut(orbitPose()); UI.live = true; applyHour(13, true); setTimeout(() => { try{ dev.verify(); }catch(e){ console.warn('[room] verify', e); } }, 4000); }catch(e){ console.error('[room] build', e); }
        requestAnimationFrame(frame);
        const first = () => { document.documentElement.classList.add('rfe-up'); const v = Q.get('puzzle'), n = parseInt(v, 10);
          if(v === 'daily') introCard(LG.daily(LG.dayNumber(new Date()))); else if(n >= 1 && n <= LG.LEVELS.length) introCard(LG.LEVELS[n - 1]); else titleCard(); };
        // the card waits for the photo introduction to leave, or for the loading poster to finish fading: never two things on screen at once
        const clear = () => { const ld = document.getElementById('loading'); let n = 0; (function w(){ let o = 0; try{ o = ld ? +getComputedStyle(ld).opacity : 0; if(ld && getComputedStyle(ld).display === 'none') o = 0; }catch(e){}
            if(o < .03 || n++ > 40) first(); else setTimeout(w, 120); })(); };
        const intro = document.getElementById('intro28'); if(intro){ const mo = new MutationObserver(() => { if(!document.getElementById('intro28')){ mo.disconnect(); clear(); } }); mo.observe(document.body, {childList: true}); } else clear(); };
      if(window.SNOWBALL) go(); else loadScript('../assets/snowball.js?v=37', go); })); }
  // start only once the engine is really drawing frames (the loading card can read "done" a moment before the first render)
  (function wait(n){ let fr = 0; try{ fr = H.renderer.info.render.frame; }catch(e){} const ld = document.getElementById('loading'), up = ld && !ld.classList.contains('done');
    if((fr > 8 && !up) || n > 240) setTimeout(boot, 700); else setTimeout(() => wait(n + 1), 250); })(0);
  window.ROOM3D = {S, SAVE, rig, GEO, RINGS, SUN, PAWN, HOUSE, sound: SND, dev, get logic(){ return LG; }, get data(){ return DATA; },
    place, unplace, select, enter, leave, hop, hint, setUpper, setHour, watchDay, look: i => look(marks[i]), marks, startLevel, titleCard, introCard, endCard,
    solve(){ if(S.L) for(const g of (S.L.order || S.L.guests)) if(S.at[g] !== S.L.answer[g]) place(g, S.L.answer[g], {hint: true}); }, standOf, orbitFit, freeRect, facing, faceRoom};
})();

/* preview hosts: when the site is served from a sub-path (a test mirror), point root links like /games/ at that copy; no effect on 118hillside.com */
(function(){ if(window.__siteLinks) return; window.__siteLinks = 1; var m = /githack/.test(location.host) ? location.pathname.match(/^(\/[^\/]+\/[^\/]+\/[^\/]+)\//) : location.pathname.match(/^(.*)\/(tour|thanksgiving|halloween|games|woodside)\//), base = m ? m[1] : ''; if(!base) return;
  document.addEventListener('click', function(e){ var a = e.target && e.target.closest && e.target.closest('a[href]'); if(!a) return; var h = a.getAttribute('href'); if(!h || h.charAt(0) !== '/' || h.charAt(1) === '/' || h.indexOf(base + '/') === 0) return;
    a.setAttribute('href', base + h.replace(/^([^?#]*\/)(?=[?#]|$)/, '$1index.html')); }, true);
})();
