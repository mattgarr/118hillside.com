/* Where's Snowball? (r36): hide and seek with the cat himself, played inside the 3D model of 118 Hillside Drive (the house as it is today, at dusk).
   Loaded by tour/index.html only on ?snowball=1; talks to the engine through window.HILLSIDE.
   Story: dinner is ready and Snowball would rather play. He is sitting in the entry when you arrive; tap him and he runs off, leaving paw prints.
   A round "Snowball cam" shows what he can see now; pick the room it belongs to and go there. In that room he is hiding, and never in the view
   you arrive with: you turn (and in most rooms walk between two standing places) until some part of him shows, an ear over the armchair, a face in
   the kitchen sink, a tail by the shower glass. The paw meter and the bell on his collar say how close you are looking. He hides better in each room
   and gives up in the fifth. The first trail of the day is the same for everyone.
   What he hides behind is the real model: on arriving in a room the game gathers the triangles around it once and asks, from each standing place,
   which parts of his outline can be seen. That one answer drives the opening view, the meter, the tap target and the help, and FINDCAT.dev.audit()
   runs the same test over every hiding place.
   Debug: window.FINDCAT (dev.go(room, spot), dev.audit(), dev.clues(), dev.measure(), dev.show(room, spot, 'open' | 'spot')), and
   ?trail=living,kitchen,primary,terrace &hard=1 &seed=7 on the URL. */
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


  /* ---------- the rooms ----------
     v = standing places [x, z, ways to look (degrees, the first is the best view of the room)]; you arrive at the first one. Every place was ray-checked in the model.
     spots: p = where his paws are (world feet), n = finishes the sentence "He was ...", d = how hidden from the place you would spot him
       (0 in plain sight, 1 easy once you turn, 2 partly behind something, 3 only ears, eyes or a tail), w = you have to walk to the other standing place, box = he brought a cardboard box.
     cam = details of the room's real photo for the Snowball cam [across 0..1, down 0..1, what it shows]; each is something no other room's photo has.
     grp = what a room shares with others: a space, a view into each other's photo, or a look (the three bedrooms all show a made bed; the balcony and the terrace are both sunsets). Two rooms with a group in common
     are never offered as choices together. fit = which part of a tall photo the choice button shows. Facts come from the site's own copy. */
  const ROOM = {
    entry:   {name: 'Entry', at: 'in the entry', photo: '../images/entry-800.jpg', ar: .586, grp: ['front'], fy: 0, cam: [[.5, .05, 'the starburst light']],
      fact: 'A cathedral ceiling and a starburst light, added in 2024.', say: 'Catch me if you can.', v: [[-12.25, -3.3, 90]],
      spots: [{p: [-5.93, .06, -4.07], n: 'sitting in the middle of the entry', d: 0}]},
    living:  {name: 'Living room', at: 'in the living room', photo: '../images/living-room-800.jpg', ar: .591, grp: ['front'], fy: 0, cam: [[.62, .1, 'the wood beams'], [.5, .74, 'the glass coffee table']],
      fact: 'Wood beams cross the ceiling. This part of the house is from the 1920s.', say: 'This rug is my favorite.', v: [[.8, -2.2, 125, 60, 95], [12.4, -4.6, 285, 240]],
      spots: [{p: [7.5, 1.39, -6.5], n: 'on the sofa, between the pillows', d: 1}, {p: [13.2, .05, -2.6], n: 'in a cardboard box by the big picture', d: 1, box: 1}, {p: [10, .06, -2.5], n: 'behind the coffee table', d: 2},
        {p: [12, .03, -7], n: 'at the far end of the sofa', d: 2}, {p: [10.5, .03, 2.5], n: 'tucked behind an armchair', d: 2, w: 1}, {p: [12.5, .03, -8.5], n: 'beside the lamp table', d: 2, w: 1}, {p: [13, .03, 4], n: 'behind the far armchair', d: 3}]},
    kitchen: {name: 'Kitchen', at: 'in the kitchen', photo: '../images/kitchen-800.jpg', ar: .64, grp: ['great'], fy: 0, cam: [[.45, .15, 'the shiny stove hood'], [.2, .76, 'the woven kitchen stools']],
      fact: 'White quartz counters, and a peninsula big enough for homework.', say: 'I was only checking on dinner.', v: [[15.2, 10.2, 315, 225], [15, 18.6, 320, 240]],
      spots: [{p: [6.5, 3.04, 13.5], n: 'on the counter by the sink', d: 1}, {p: [7, 2.18, 12], n: 'in the kitchen sink', d: 2}, {p: [14, .03, 17], n: 'at the end of the kitchen island', d: 2},
        {p: [6.5, .03, 18.5], n: 'past the last kitchen stool', d: 2, w: 1}, {p: [10, .03, 15.5], n: 'under the island, between the stools', d: 3, w: 1}, {p: [8.5, .03, 18.5], n: 'behind the kitchen stools', d: 3, w: 1}]},
    great:   {name: 'Great room', at: 'in the great room', photo: '../images/dining-800.jpg', ar: .7325, grp: ['great'], fy: 0, cam: [[.5, .82, 'the glass dining table'], [.12, .7, 'the wooden sideboard']],
      fact: 'Kitchen, sitting area and dining table share one long, bright room.', say: 'I was watching the birds.', v: [[15, 26, 315, 223], [6.4, 23.9, 60, 135]],
      spots: [{p: [5.5, 2.62, 34], n: 'on the back of the big sofa', d: 1}, {p: [9.5, 2.53, 20.5], n: 'on the dining table', d: 1}, {p: [15.8, .05, 32.5], n: 'in a cardboard box by the big sofa', d: 1, box: 1}, {p: [13.5, 1.65, 21.5], n: 'on a dining chair', d: 2},
        {p: [8.5, .06, 29], n: 'behind the round coffee table', d: 2}, {p: [11, .06, 32], n: 'between the sofa and the coffee table', d: 2}, {p: [6.5, .03, 18.5], n: 'behind the dining chairs', d: 3}]},
    mainbeds: {name: 'Main-level bedroom', at: 'in the main-level bedroom', photo: 'thumbs/p74.jpg', big: 'photos/p74.jpg', ar: .667, grp: ['bed'], fy: 0, cam: [[.2, .6, 'the wooden bedside table'], [.5, .12, 'the ceiling fan']],
      fact: 'One of three bedrooms on a quiet hall of the main level.', say: 'I was keeping the bed warm.', v: [[19, 33.5, 141, 78], [26.9, 29.5, 250, 200]],
      spots: [{p: [22.5, 2.08, 29], n: 'on the bed', d: 1}, {p: [27, .03, 34], n: 'beside the white chair', d: 2}, {p: [27.5, .03, 29], n: 'on the far side of the bed', d: 2}, {p: [28, .03, 26], n: 'by the far bedside table', d: 2}, {p: [28, .03, 35], n: 'behind the white chair', d: 3}]},
    loft:    {name: 'Loft', at: 'in the loft', photo: 'thumbs/x06.jpg', big: 'photos/x06.jpg', ar: 1.333, fit: '50% 36%', grp: ['loft'], fy: 5.57, cam: [[.4, .66, 'the railing at the top of the stairs'], [.62, .3, 'the triangle windows']],
      fact: 'A sitting spot under the skylights, at the top of the stairs.', say: 'I like the sun up here.', v: [[-19.8, -9.8, 345, 180, 20], [-19, -16.8, 180, 0]],
      spots: [{p: [-24, 7.06, -7.5], n: 'on the window seat', d: 1}, {p: [-18, 5.6, -4.5], n: 'at the top of the stairs, behind the railing', d: 2}, {p: [-18, 5.6, -18], n: 'down the upstairs hall', d: 2},
        {p: [-21, 5.6, -20], n: 'round the corner in the upstairs hall', d: 2, w: 1}, {p: [-24, 5.6, -13.5], n: 'behind the big plant', d: 2}]},
    primary: {name: 'Primary bedroom', at: 'in the primary bedroom', photo: '../images/primary-bedroom-800.jpg', ar: .68, grp: ['suite', 'bed'], fy: 5.57, cam: [[.3, .5, 'the blue bedroom wall'], [.74, .5, 'the doors to the balcony']],
      fact: 'Four skylights overhead, and glass doors to a private balcony.', say: 'The big bed is the best bed.', v: [[-12.8, -33.5, 274, 215, 330], [-16.6, -38.4, 20, 320]],
      spots: [{p: [-18.5, 7.66, -31], n: 'on the big bed', d: 1}, {p: [-19.5, 5.63, -38], n: 'at the corner of the big bed', d: 2}, {p: [-9.5, 5.6, -28.5], n: 'behind the dresser', d: 2},
        {p: [-21.5, 5.63, -37.5], n: 'between the bed and the balcony doors', d: 3}, {p: [-21, 5.63, -29], n: 'on the far side of the big bed', d: 3}]},
    pbath:   {name: 'Primary bath', at: 'in the primary bath', photo: '../images/primary-bath-800.jpg', ar: .68, grp: ['pbath'], fy: 5.57, cam: [[.88, .36, 'the brass shower'], [.2, .62, 'the towels on their rings']],
      fact: 'Heated floors, two sinks, and a shower big enough for two.', say: 'The floor in here is warm.', v: [[-13.5, -22, 180, 27, 100]],
      spots: [{p: [-10, 8.43, -25.1], n: 'on the bathroom counter', d: 1}, {p: [-9.5, 5.6, -19.1], n: 'in the gap by the shower glass', d: 1}, {p: [-11.5, 5.6, -19.1], n: 'in the shower, behind the glass', d: 2}, {p: [-14, 5.6, -16.1], n: 'round the little wall by the shower', d: 3}]},
    balcony: {name: 'Balcony', at: 'on the balcony', photo: '../images/hills-view-800.jpg', ar: .71, grp: ['suite', 'outside'], fy: 5.57, tod: 'golden', cam: [[.42, .34, 'the hills at sunset'], [.22, .52, 'the tall pine and the hills']],
      fact: 'The balcony faces the western hills, for watching the sun go down.', say: 'I was watching the hills.', v: [[-17.7, -42.5, 235, 125, 180]],   // out on the deck, turned off the house wall (the first place stood in the slider doorway with the door frame and bedroom in view)
      spots: [{p: [-20.5, 6.91, -44.5], n: 'on a balcony chair', d: 1}, {p: [-21.5, 5.6, -43.5], n: 'behind a balcony chair', d: 2}, {p: [-14, 5.6, -45.5], n: 'in the corner behind a balcony chair', d: 3}]},
    lower:   {name: 'Downstairs bedroom', at: 'in the downstairs bedroom', photo: '../images/bedroom-800.jpg', ar: .68, grp: ['bed'], fy: -4.56, cam: [[.75, .34, 'the picture on the green wall'], [.12, .42, 'the dark round picture']],
      fact: 'One of two bedrooms downstairs, near the skylit office.', say: 'It is quiet down here.', v: [[-12.3, -40.5, 216, 160, 290], [-18.2, -40.3, 135, 90]],
      spots: [{p: [-16, -2.55, -47], n: 'on the bed, by the pillows', d: 1}, {p: [-12.4, -4.51, -45.2], n: 'in a cardboard box by the window', d: 1, box: 1}, {p: [-20, -4.5, -43], n: 'at the far corner of the bed', d: 2}, {p: [-20, -4.5, -46], n: 'on the far side of the bed', d: 3}]},
    lounge:  {name: 'Bonus lounge', at: 'in the bonus lounge', photo: '../images/rec-room-800.jpg', ar: .644, grp: ['lounge'], fy: -4.56, cam: [[.43, .32, 'the big screen'], [.2, .52, 'the black glass door']],
      fact: 'Made for movie nights, with a big TV and a refreshment counter.', say: 'I am ready for movie night.', v: [[-13, -17.5, 255, 195, 330], [-19.3, -22.5, 60, 120]],
      spots: [{p: [-22, -1.52, -19], n: 'on the counter under the big screen', d: 1}, {p: [-15.5, -4.5, -21.5], n: 'under the glass table', d: 2}, {p: [-19.5, -4.5, -13], n: 'behind the two footstools', d: 2}, {p: [-18, -4.5, -24.5], n: 'behind the table and chairs', d: 2},
        {p: [-20, -4.53, -11], n: 'in the doorway to the stairs', d: 2, w: 1}, {p: [-11.5, -4.53, -23.5], n: 'behind a chair, by the glass doors', d: 3}]},
    terrace: {name: 'Terrace', at: 'on the terrace', photo: '../images/rear-yard-800.jpg', ar: .71, grp: ['outside'], fy: -4.75, tod: 'golden', open: true, cam: [[.74, .45, 'the trunk of the big oak'], [.3, .5, 'the back of the house, lit up']],
      fact: 'An outdoor kitchen under a pergola, beside the heritage oak.', say: 'I was guarding the barbecue.', v: [[.4, -31, 274, 197, 120], [-2, -39.5, 200, 330]],
      spots: [{p: [-5, -3.21, -33], n: 'on the outdoor sofa', d: 1}, {p: [-8.5, -1.72, -39.5], n: 'on the outdoor kitchen counter', d: 1}, {p: [-2.5, -4.72, -40.5], n: 'beside the outdoor dining chairs', d: 2}, {p: [.5, -4.72, -41], n: 'by the outdoor dining table', d: 2}, {p: [1, -4.72, -38.5], n: 'behind the woven chair', d: 3}]}};
  const stopOf = id => H.STOPS.find(s => s.id === id), stopIx = id => H.STOPS.findIndex(s => s.id === id);
  const POOL = Object.keys(ROOM).filter(k => k !== 'entry' && stopOf(k));
  const ALLSPOTS = Object.keys(ROOM).reduce((n, k) => n + ROOM[k].spots.length, 0);
  const CW = 1.38, CH = 2.1, EYE = 5;   // Snowball on screen: a touch bigger than life, so small players can spot him across a room; your eyes are 5 ft over the floor
  const eyeOf = (R, i) => new THREE.Vector3(R.v[i][0], R.fy + EYE, R.v[i][1]);

  /* ---------- what is in the way: the triangles around a room, gathered once, and plain ray tests against them (the engine's own picking walks the whole house) ---------- */
  const SOUPS = {}; let SP = null, PX = null;   // the room you are in, and the cardboard box when he brought one
  function gather(root, B, own){ const out = [], G = H.GROUPS || {}, skip = new Set([G.trees, G.hills, G.terrain].filter(Boolean)), m4 = new THREE.Matrix4(), bb = new THREE.Box3(), w = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    try{ root.updateMatrixWorld(true); root.traverse(o => { if(!o.isMesh || o.isSprite) return; const g = o.geometry, pos = g && g.attributes && g.attributes.position; if(!pos) return;
      for(let p = o; p; p = p.parent){ if(!p.visible || skip.has(p)) return; if(!own && /^(find-|esc-|r13-)/.test(p.name)) return; }
      const m = o.material; if(m && !Array.isArray(m) && m.transparent && (m.opacity < .98 || m.depthWrite === false)) return;   // glass and shadow decals hide nothing
      if(!g.boundingBox) g.computeBoundingBox(); const idx = g.index, n = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
      for(let k = 0; k < inst; k++){ if(o.isInstancedMesh){ o.getMatrixAt(k, m4); m4.premultiply(o.matrixWorld); } else m4.copy(o.matrixWorld); if(B){ bb.copy(g.boundingBox).applyMatrix4(m4); if(!bb.intersectsBox(B)) continue; } const e = m4.elements;
        for(let i = 0; i + 2 < n; i += 3){ for(let j = 0; j < 3; j++){ const q = idx ? idx.getX(i + j) : i + j, x = pos.getX(q), y = pos.getY(q), z = pos.getZ(q); w[j * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; w[j * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; w[j * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; }
          if(B && (Math.max(w[0], w[3], w[6]) < B.min.x || Math.min(w[0], w[3], w[6]) > B.max.x || Math.max(w[1], w[4], w[7]) < B.min.y || Math.min(w[1], w[4], w[7]) > B.max.y || Math.max(w[2], w[5], w[8]) < B.min.z || Math.min(w[2], w[5], w[8]) > B.max.z)) continue;
          out.push(w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7], w[8]); } } }); }catch(e){}
    return new Float32Array(out); }
  function soupFor(id){ if(SOUPS[id]) return SOUPS[id]; const R = ROOM[id]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; const grow = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    R.v.forEach(v => grow(v[0], v[1])); R.spots.forEach(s => grow(s.p[0], s.p[2])); return SOUPS[id] = gather(H.scene, new THREE.Box3(new THREE.Vector3(x0 - 6, R.fy - .7, z0 - 6), new THREE.Vector3(x1 + 6, R.fy + 10, z1 + 6))); }
  // the nearest thing a ray meets within `far` (Infinity if nothing); any = stop at the first; sub = only these triangles of the room
  function rayIn(t, n, sub, ox, oy, oz, dx, dy, dz, best, any){
    for(let k = 0; k < n; k++){ const i = (sub ? sub[k] : k) * 9, ax = t[i], ay = t[i + 1], az = t[i + 2], e1x = t[i + 3] - ax, e1y = t[i + 4] - ay, e1z = t[i + 5] - az, e2x = t[i + 6] - ax, e2y = t[i + 7] - ay, e2z = t[i + 8] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz; if(det > -1e-9 && det < 1e-9) continue; const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az, u = (tx * px + ty * py + tz * pz) * inv; if(u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv; if(v < 0 || u + v > 1) continue; const d = (e2x * qx + e2y * qy + e2z * qz) * inv; if(d > 1e-4 && d < best){ best = d; if(any) return d; } } return best; }
  function hit(ox, oy, oz, dx, dy, dz, far, any, sub){ let b = far; if(SP) b = rayIn(SP, sub ? sub.length : SP.length / 9, sub, ox, oy, oz, dx, dy, dz, b, any); if(PX && !(any && b < far)) b = rayIn(PX, PX.length / 9, null, ox, oy, oz, dx, dy, dz, b, any); return b < far ? b : Infinity; }
  function within(x0, y0, z0, x1, y1, z1){ const t = SP, out = []; if(!t) return out; for(let k = 0, n = t.length / 9; k < n; k++){ const i = k * 9;
      if(Math.max(t[i], t[i + 3], t[i + 6]) < x0 || Math.min(t[i], t[i + 3], t[i + 6]) > x1 || Math.max(t[i + 1], t[i + 4], t[i + 7]) < y0 || Math.min(t[i + 1], t[i + 4], t[i + 7]) > y1 || Math.max(t[i + 2], t[i + 5], t[i + 8]) < z0 || Math.min(t[i + 2], t[i + 5], t[i + 8]) > z1) continue; out.push(k); } return out; }
  const clearTo = (a, b, slack) => { const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz) || 1; return hit(a.x, a.y, a.z, dx / L, dy / L, dz / L, L - (slack == null ? .25 : slack), true) === Infinity; };
  // his outline as points across the drawing (u from -.5 at the left edge to .5, v from 0 at his paws to 1 at his ear tips); read from the real drawing once it has loaded
  let MASK = (() => { const m = []; for(let j = 0; j < 18; j++) for(let i = 0; i < 12; i++){ const u = (i + .5) / 12 - .5, v = 1 - (j + .5) / 18; if(Math.pow((u - .05) / .36, 2) + Math.pow((v - .3) / .31, 2) < 1 || Math.pow((u + .1) / .24, 2) + Math.pow((v - .74) / .2, 2) < 1) m.push([u, v]); } return m; })();
  function readMask(svg){ try{ const im = new Image(); im.onload = () => { try{ const cv = document.createElement('canvas'); cv.width = 24; cv.height = 36; const g = cv.getContext('2d'); g.drawImage(im, 0, 0, 24, 36); const px = g.getImageData(0, 0, 24, 36).data, m = [];
        for(let j = 0; j < 36; j += 2) for(let i = 0; i < 24; i += 2){ let a = 0; for(const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) a += px[((j + dj) * 24 + i + di) * 4 + 3]; if(a / 4 > 150) m.push([(i + 1) / 24 - .5, 1 - (j + 1) / 36]); } if(m.length > 40) MASK = m; }catch(e){} };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg width="96" height="146" ')); }catch(e){} }
  /* what of him can be seen from an eye point: f = share of his outline, head = share of his head (ears, eyes, nose), and the box around the visible part
     (u0..u1 across, v0..v1 up) with its middle (cu, cv). He is a flat picture standing upright and turned to face you, so this is exact for what gets drawn. */
  function vis(V, P){ const rx = V.z - P.z, rz = -(V.x - P.x), L = Math.hypot(rx, rz) || 1, ux = rx / L * CW, uz = rz / L * CW, hx = Math.abs(ux) * .5, hz = Math.abs(uz) * .5;
    const sub = within(Math.min(V.x, P.x - hx) - .05, Math.min(V.y, P.y) - .05, Math.min(V.z, P.z - hz) - .05, Math.max(V.x, P.x + hx) + .05, Math.max(V.y, P.y + CH) + .05, Math.max(V.z, P.z + hz) + .05);
    let n = 0, hd = 0, hn = 0, su = 0, sv = 0, u0 = 1, u1 = -1, v0 = 1, v1 = 0;
    for(const [u, v] of MASK){ const dx = P.x + ux * u - V.x, dy = P.y + v * CH - V.y, dz = P.z + uz * u - V.z, D = Math.hypot(dx, dy, dz), ok = hit(V.x, V.y, V.z, dx / D, dy / D, dz / D, D - .12, true, sub) === Infinity;
      if(v > .55) hn++; if(!ok) continue; n++; su += u; sv += v; if(v > .55) hd++; if(u < u0) u0 = u; if(u > u1) u1 = u; if(v < v0) v0 = v; if(v > v1) v1 = v; }
    return {n, f: n / MASK.length, head: hn ? hd / hn : 0, cu: n ? su / n : 0, cv: n ? sv / n : .5, u0: u0 - .04, u1: u1 + .04, v0: Math.max(0, v0 - .03), v1: Math.min(1, v1 + .03), d: Math.hypot(P.x - V.x, P.z - V.z)}; }
  // a point on him: u across the picture, v up it, as you see him from V
  function onCat(V, P, u, v, out){ const rx = V.z - P.z, rz = -(V.x - P.x), L = Math.hypot(rx, rz) || 1; return out.set(P.x + rx / L * u * CW, P.y + v * CH, P.z + rz / L * u * CW); }
  // how wide the picture is: half the angle from the middle of the screen to its side edge (the lens is the tour's own for the room: about 95 degrees across on a wide screen)
  const hHalf = () => Math.atan(Math.tan(cam.fov * Math.PI / 360) / (cam.zoom || 1) * (cam.aspect || 1.6));
  const yawTo = (V, P) => Math.atan2(P.x - V.x, P.z - V.z);
  /* you arrive looking a little down (PITCH0), the way people look into a room, so the floor a few feet away is in the picture. poseAt puts a stand-in camera with the
     room's lens at a standing place; outOfView asks whether his whole outline (and a margin, and room to hop) is outside the picture from there, hidden or not. */
  const PITCH0 = -.24, PC = cam.clone();
  function poseAt(V, yaw, pitch){ const c = Math.cos(pitch); PC.projectionMatrix.copy(cam.projectionMatrix); PC.projectionMatrixInverse.copy(cam.projectionMatrixInverse); PC.position.copy(V); PC.up.set(0, 1, 0); PC.lookAt(V.x + Math.sin(yaw) * c * 10, V.y + Math.sin(pitch) * 10, V.z + Math.cos(yaw) * c * 10); PC.updateMatrixWorld(true); PC.matrixWorldInverse.copy(PC.matrixWorld).invert(); return PC; }
  const inPicture = (p, m) => { _b.copy(p).project(PC); return _b.z < 1 && Math.abs(_b.x) < m && Math.abs(_b.y) < m; };
  function outOfView(yaw, V, P){ poseAt(V, yaw, PITCH0); for(const [u, v] of [[-.62, 0], [.62, 0], [-.62, 1.2], [.62, 1.2], [0, .6], [-.62, .6], [.62, .6]]) if(inPicture(onCat(V, P, u, v, _a), 1.04)) return false; return true; }
  // the way you face when you arrive: a good view of the room that does not have him in it
  function openingYaw(R, V, P, v0){ const want = R.v[0].slice(2).map(d => d * Math.PI / 180); for(const y of want) if(outOfView(y, V, P)) return y; if(!v0.n) return want[0];
    // none of the room's good views leaves him out: turn the nearest one just far enough that it does, as long as it still looks into the room and not at a wall
    const roomy = y => Math.min(hit(V.x, V.y, V.z, Math.sin(y), 0, Math.cos(y), 30), hit(V.x, V.y, V.z, Math.sin(y + .35), 0, Math.cos(y + .35), 30), hit(V.x, V.y, V.z, Math.sin(y - .35), 0, Math.cos(y - .35), 30)) > 5; let best = null;
    for(const y of want) for(const s of [1, -1]) for(let k = 1; k <= 36; k++){ const c = y + s * k * Math.PI / 36; if(outOfView(c, V, P) && roomy(c)){ if(!best || k < best.k) best = {y: c, k}; break; } }
    if(best) return best.y; for(let k = 0; k < 12; k++){ const y = k * Math.PI / 6; if(!outOfView(y, V, P)) continue; let s = 0; for(const a of [-.3, 0, .3]) s += Math.min(30, hit(V.x, V.y, V.z, Math.sin(y + a), 0, Math.cos(y + a), 30)); if(!best || s > best.s) best = {y, s}; }
    return best ? best.y : wrap(yawTo(V, P) + Math.PI); }
  // the way he runs off: along the floor, away from you or across the room, as far as the room lets him
  function runPath(V, P, fy, open){ const tx = V.x - P.x, tz = V.z - P.z, tl = Math.hypot(tx, tz) || 1; let best = null;
    for(let k = 0; k < 8; k++){ const a = k * Math.PI / 4, dx = Math.sin(a), dz = Math.cos(a), toward = (dx * tx + dz * tz) / tl; if(toward > .5) continue; const pts = []; let floor = false;
      for(let s = 1; s <= 7; s++){ const x = P.x + dx * 1.5 * s, z = P.z + dz * 1.5 * s, top = Math.max(P.y, fy) + 2.2, t = hit(x, top, z, 0, -1, 0, top - fy + .7), y = top - t;
        if(t !== Infinity && Math.abs(y - fy) < .4){ floor = true; pts.push(new THREE.Vector3(x, y, z)); } else if(t === Infinity && open){ floor = true; pts.push(new THREE.Vector3(x, fy + .05, z)); } else if(t !== Infinity && !floor && s <= 2 && y > fy) continue; else break; }
      const score = pts.length + (toward < -.2 ? .6 : 0) + (pts.length && clearTo(V, _a.copy(pts[pts.length - 1]).setY(fy + 1), .3) ? 1 : 0);
      if(pts.length >= 2 && (!best || score > best.score)) best = {pts, score}; }
    return best ? best.pts : null; }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3();

  /* ---------- drawings ---------- */
  const PAWSVG = (c, extra) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" ${extra || 'aria-hidden="true"'}><g fill="${c || 'currentColor'}"><ellipse cx="16" cy="21" rx="8" ry="6.5"/><ellipse cx="6.5" cy="13" rx="3.2" ry="4.2"/><ellipse cx="12.5" cy="7.5" rx="3.2" ry="4.4"/><ellipse cx="19.5" cy="7.5" rx="3.2" ry="4.4"/><ellipse cx="25.5" cy="13" rx="3.2" ry="4.2"/></g></svg>`;
  // Snowball running, seen from the side (two frames of a gallop), facing right
  // (the orange tabby of assets/snowball.js: ginger coat, darker stripes, ringed tail, cream belly, muzzle and feet)
  const RUNSVG = f => { const leg = (d, c, w) => `<path d="${d}" stroke="${c}" stroke-width="${w}"/>`, foot = (x, y, c) => `<circle cx="${x}" cy="${y}" r="7" fill="${c}" stroke="#b9895a" stroke-width="1"/>`, tail = f ? 'M88 78 C58 70 34 76 18 96' : 'M74 78 C42 62 24 38 32 16',
      body = f ? 'M88 70 C118 36 182 38 214 62 C234 76 232 96 212 102 C172 112 112 110 86 98 C72 90 76 78 88 70Z' : 'M70 72 C100 50 170 48 215 64 C235 72 238 94 215 100 C170 110 100 108 72 98 C58 92 58 80 70 72Z';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 160"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#df8531"/><stop offset=".6" stop-color="#eea04c"/><stop offset="1" stop-color="#fbe3c0"/></linearGradient><clipPath id="c"><path d="${body}"/></clipPath></defs>` +
    `<ellipse cx="150" cy="150" rx="${f ? 80 : 120}" ry="7" fill="#000" opacity=".22"/><g fill="none" stroke-linecap="round">` + leg(tail, '#e08a36', 11) + `<path d="${tail}" stroke="#a64c15" stroke-width="11" stroke-dasharray="5 9" stroke-dashoffset="-8" stroke-linecap="butt" opacity=".85"/>` +
    (f ? leg('M96 98 C100 120 114 136 134 142', '#c9742a', 12) + leg('M208 96 C208 118 196 134 178 142', '#c9742a', 12) + foot(134, 142, '#ecdcc2') + foot(178, 142, '#ecdcc2') + leg('M104 96 C112 116 130 130 152 134', '#e8923c', 13) + leg('M200 94 C196 114 182 128 162 134', '#e8923c', 13) + foot(152, 134, '#fff5e4') + foot(162, 134, '#fff5e4')
       : leg('M94 96 C74 114 50 122 28 120', '#c9742a', 12) + leg('M198 94 C222 110 250 120 272 116', '#c9742a', 12) + foot(28, 120, '#ecdcc2') + foot(272, 116, '#ecdcc2') + leg('M86 92 C62 102 36 110 14 102', '#e8923c', 13) + leg('M206 90 C232 98 262 106 286 98', '#e8923c', 13) + foot(14, 102, '#fff5e4') + foot(286, 98, '#fff5e4')) + `</g>` +
    `<path d="${body}" fill="url(#b)"/><g clip-path="url(#c)" fill="none" stroke="#a64c15" stroke-width="5.5" stroke-linecap="round" opacity=".8">${[92, 112, 132, 152, 172, 192].map((x, i) => `<path d="M${x} 30 q${i - 7} 26 ${-3 + (i % 2) * 2} ${46 + (i % 2) * 7}"/>`).join('')}</g>` +
    `<g transform="translate(0 ${f ? 4 : 0})"><path d="M220 44 L222 12 L240 34Z" fill="#cf7a2b"/><path d="M244 34 L263 10 L260 44Z" fill="#e08a36"/><path d="M249 35 L260 18 L258 41Z" fill="#f0b6a0"/><circle cx="238" cy="58" r="25" fill="#e8923c"/><ellipse cx="252" cy="68" rx="11" ry="9" fill="#fff5e4"/>` +
    `<path d="M231 36 l2 9 M239 35 l1 9 M225 52 l-9 3 M227 63 l-9 5" stroke="#a64c15" stroke-width="3.2" stroke-linecap="round" opacity=".85"/><ellipse cx="247" cy="54" rx="6.3" ry="7.2" fill="#3d1c08"/><ellipse cx="247" cy="54" rx="5.2" ry="6" fill="#f4b62e"/><ellipse cx="248.5" cy="54" rx="1.9" ry="5.2" fill="#0b0705"/><circle cx="249.8" cy="51.4" r="1.4" fill="#fff"/>` +
    `<path d="M259 60 l6 1 l-3.5 4Z" fill="#de8672"/><path d="M260 66 l15 -3 M260 69 l15 3" stroke="#4a2a12" stroke-width="2.2" opacity=".25"/><path d="M260 66 l15 -3 M260 69 l15 3" stroke="#fffaf0" stroke-width="1.3"/></g></svg>`; };
  // and bounding straight away from you: rump, tail up, ears, back feet
  const BACKSVG = f => { const hy = f ? 70 : 60, rump = `<ellipse cx="80" cy="122" rx="${f ? 52 : 46}" ry="${f ? 42 : 50}"`, tail = 'M84 112 C112 96 124 62 112 26';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200"><defs><radialGradient id="b" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#f2a955"/><stop offset="1" stop-color="#cf7829"/></radialGradient><clipPath id="c">${rump}/></clipPath></defs>` +
    `<ellipse cx="80" cy="190" rx="${f ? 44 : 54}" ry="7" fill="#000" opacity=".22"/><g transform="translate(0 ${f ? 14 : 0})">` +
    `<path d="M57 ${hy - 10} L52 ${hy - 44} L76 ${hy - 24}Z M82 ${hy - 24} L104 ${hy - 44} L100 ${hy - 10}Z" fill="#cf7a2b"/><circle cx="78" cy="${hy}" r="27" fill="#e8923c"/><path d="M70 ${hy - 23} l2 13 M78 ${hy - 26} l0 14 M86 ${hy - 23} l-2 13" stroke="#a64c15" stroke-width="3.4" stroke-linecap="round" opacity=".85"/>` +
    rump + ` fill="url(#b)"/><g clip-path="url(#c)" fill="none" stroke="#a64c15" stroke-width="5" stroke-linecap="round" opacity=".75"><path d="M80 78 L80 150"/>${[92, 108, 124, 140].map(y => `<path d="M80 ${y} C68 ${y + 2} 54 ${y + 8} 38 ${y + 22} M80 ${y} C92 ${y + 2} 106 ${y + 8} 122 ${y + 22}"/>`).join('')}</g>` +
    `<path d="${tail}" fill="none" stroke="#e08a36" stroke-width="12" stroke-linecap="round"/><path d="${tail}" fill="none" stroke="#a64c15" stroke-width="12" stroke-dasharray="5 9" stroke-dashoffset="-10" opacity=".85"/>` +
    `<g fill="#fff5e4" stroke="#b9895a" stroke-width="1">` + (f ? `<ellipse cx="50" cy="160" rx="15" ry="11"/><ellipse cx="110" cy="160" rx="15" ry="11"/>` : `<ellipse cx="54" cy="172" rx="13" ry="19"/><ellipse cx="106" cy="172" rx="13" ry="19"/>`) + `</g>` +
    (f ? '' : `<g fill="#d9938a"><ellipse cx="54" cy="180" rx="5" ry="6"/><ellipse cx="106" cy="180" rx="5" ry="6"/></g>`) + `</g></svg>`; };
  function texFromSvg(svg, w, h){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    const img = new Image(); img.onload = () => { cv.getContext('2d').drawImage(img, 0, 0, w, h); tex.needsUpdate = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', `<svg width="${w}" height="${h}" `)); return tex; }
  const TEX = {}, OBJ = []; let CAT = null, RUN = null, BOX = null, PAWMAT = null, PAWGEO = null; const PRINTS = [], STEPS = [];
  function sprite(tex, w, h, name){ const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false, alphaTest: .04})); sp.center.set(.5, 0); sp.scale.set(w, h, 1); sp.name = name; sp.renderOrder = 6; sp.visible = false; sp.raycast = function(){}; sp.userData.noAO = true; H.scene.add(sp); OBJ.push(sp); return sp; }
  // Snowball hiding is a flat picture that stands upright and turns to face you (a sprite leans with your gaze, and would poke through whatever he is behind)
  function board(tex, w, h, name){ const g = new THREE.PlaneGeometry(1, 1); g.translate(0, .5, 0); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, alphaTest: .04, side: THREE.DoubleSide}));
    m.scale.set(w, h, 1); m.name = name; m.renderOrder = 6; m.visible = false; m.frustumCulled = false; m.raycast = function(){}; m.userData.noAO = true;
    m.onBeforeRender = function(){ this.rotation.y = Math.atan2(cam.position.x - this.position.x, cam.position.z - this.position.z); this.updateMatrixWorld(); const k = clamp(1.02 / (H.renderer.toneMappingExposure || 1), .55, 1); this.material.color.setRGB(k, k, k); };   // he is drawn unlit, so the brighter exposure outdoors would bleach him
    H.scene.add(m); OBJ.push(m); return m; }
  // the cardboard box he sometimes brings: open at the top, so his head shows over the rim
  function makeBox(){ const g = new THREE.Group(), card = new THREE.MeshStandardMaterial({color: 0xb98a55, roughness: .92}), dark = new THREE.MeshStandardMaterial({color: 0x86603a, roughness: 1}), W = 1.8, T = .06, HT = 1.12;
    const add = (geo, mat, x, y, z, ry, rx) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if(ry) m.rotation.y = ry; if(rx) m.rotation.x = rx; m.castShadow = m.receiveShadow = true; m.raycast = function(){}; g.add(m); };
    const side = new THREE.BoxGeometry(W, HT, T), flap = new THREE.BoxGeometry(W, T, .6); add(side, card, 0, HT / 2, W / 2); add(side, card, 0, HT / 2, -W / 2); add(side, card, W / 2, HT / 2, 0, Math.PI / 2); add(side, card, -W / 2, HT / 2, 0, Math.PI / 2);
    add(new THREE.BoxGeometry(W, T, W), dark, 0, T / 2, 0); add(flap, card, 0, HT - .25, W / 2 + .18, 0, 1); add(flap, card, 0, HT - .25, -W / 2 - .18, 0, -1);
    g.name = 'find-prop'; g.visible = false; H.scene.add(g); OBJ.push(g); return g; }
  // a place you can walk to: a ring on the floor with two shoe prints
  function stepTex(){ const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); g.beginPath(); g.arc(64, 64, 55, 0, 7); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill(); g.lineWidth = 10; g.strokeStyle = '#e0862a'; g.stroke();
    g.fillStyle = '#1f2948'; for(const [x, y] of [[49, 78], [79, 62]]){ g.beginPath(); g.ellipse(x, y, 10, 15, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x, y - 23, 8.5, 6, 0, 0, 7); g.fill(); } const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t; }
  function makeStep(){ const m = new THREE.Mesh(new THREE.CircleGeometry(1.05, 28), new THREE.MeshBasicMaterial({map: TEX.step, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3}));
    m.rotation.x = -Math.PI / 2; m.name = 'find-step'; m.renderOrder = 5; m.visible = false; m.raycast = function(){}; m.userData.noAO = true; H.scene.add(m); OBJ.push(m); return m; }
  function makeArt(cb){ const done = () => { const S2 = window.SNOWBALL;
      TEX.open = texFromSvg(S2.svg({id: 'sbf', seed: 7, glow: true, wear: WEAR, bell: BELL}), 384, 584); TEX.shut = texFromSvg(S2.svg({id: 'sbc', seed: 7, wear: WEAR, bell: BELL, eyes: 'closed'}), 384, 584);
      TEX.runA = texFromSvg(RUNSVG(0), 384, 205); TEX.runB = texFromSvg(RUNSVG(1), 384, 205); TEX.backA = texFromSvg(BACKSVG(0), 256, 320); TEX.backB = texFromSvg(BACKSVG(1), 256, 320); TEX.paw = texFromSvg(PAWSVG('#4b3a2a', ''), 96, 96);
      CAT = board(TEX.open, CW, CH, 'find-snowball'); RUN = sprite(TEX.runA, 2.25, 1.2, 'find-run'); BOX = makeBox(); TEX.step = stepTex(); STEPS.push(makeStep(), makeStep()); readMask(S2.svg({id: 'sbm', seed: 7}));
      PAWGEO = new THREE.PlaneGeometry(.42, .42); PAWMAT = new THREE.MeshBasicMaterial({map: TEX.paw, transparent: true, depthWrite: false, opacity: .78, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}); cb(); };
    if(window.SNOWBALL && window.SNOWBALL.v >= 37) return done(); const s = document.createElement('script'); s.src = new URL('../snowball.js?v=37', SRC).href; s.onload = done; s.onerror = () => { if(window.SNOWBALL) done(); }; document.head.appendChild(s); }
  const SRC = (document.currentScript && document.currentScript.src) || new URL('../assets/find/find.js', location.href).href;
  function addPrint(p, yaw, side){ const m = new THREE.Mesh(PAWGEO, PAWMAT); m.name = 'find-paw'; m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, yaw + Math.PI, 0); m.position.set(p.x + Math.cos(yaw) * side * .16, p.y + .035, p.z - Math.sin(yaw) * side * .16); m.renderOrder = 4; m.raycast = function(){}; m.userData.noAO = true; H.scene.add(m); PRINTS.push(m); }
  function clearPrints(){ for(const m of PRINTS) H.scene.remove(m); PRINTS.length = 0; }

  /* ---------- sound: one small set of soft mallet and bell tones, all from one pentatonic scale, through a little echo and a limiter ----------
     Snowball's own voice is the bell on his collar (it comes from his side of the room, and a little more often the closer you are to looking at him),
     a short "mrrp", and a soft purr for the happy moments only: when you find him, and at the end. Nothing purrs while you are looking.
     Nothing plays before the first tap; the speaker button mutes everything and remembers; the sound pauses when the tab is hidden.
     audioKit(ctx) builds the whole chain on any context, so FINDCAT.dev.measure() can render every cue offline and check its level. */
  const KEY = 'find.v4'; const SV = (() => { const v = store.get(KEY) || {}, old = store.get('find.v3') || store.get('find.v2') || {}; if(v.last == null && old.last){ v.last = old.last; v.streak = old.streak; v.total = old.total; } if(v.mute == null && old.mute != null) v.mute = old.mute; if(v.hard == null && old.hard != null) v.hard = old.hard; v.spots = v.spots || {}; return v; })();   // v4: the hiding places were renumbered, so the collection starts again; the streak and settings carry over
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
      /* the purr, for the happy moments only. A real purr is a soft, breathy rumble: this is breath noise held under about 400 Hz (three gentle low-passes),
         swelling in rounded, shallow waves about 26 times a second (a sine that takes the level between 0.4 and 1, never a switch), a little quieter, quicker and
         brighter breathing in than out, with the pulse rate wandering so it is never mechanical, and a very quiet tone under it that drifts with the breath.
         It is scheduled for a set length and fades itself out. o.probe = a node that gets the bare pulse shape (dev.measure reads the envelope from it). */
      purr(t, o){ const L = o.len || 3, vol = o.vol == null ? 1 : o.vol, probe = o.probe, src = probe ? c.createConstantSource() : noise();
        const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), f3 = c.createBiquadFilter(), hp = c.createBiquadFilter(), ng = c.createGain(), tone = c.createOscillator(), tg = c.createGain();
        const am = c.createGain(), lfo = c.createOscillator(), depth = c.createGain(), w1 = c.createOscillator(), w1g = c.createGain(), w2 = c.createOscillator(), w2g = c.createGain(), level = c.createGain();
        f1.type = f2.type = f3.type = 'lowpass'; f1.Q.value = f2.Q.value = f3.Q.value = .5; f1.frequency.value = f2.frequency.value = 300; f3.frequency.value = 420; hp.type = 'highpass'; hp.frequency.value = 45; hp.Q.value = .5; ng.gain.value = .125;
        tone.type = 'sine'; tone.frequency.value = 104; tg.gain.value = .0018;
        lfo.type = 'sine'; lfo.frequency.value = 26; am.gain.value = .7; depth.gain.value = .3; lfo.connect(depth); depth.connect(am.gain);
        w1.frequency.value = .73; w1g.gain.value = 1.1; w2.frequency.value = 1.31; w2g.gain.value = .6; w1.connect(w1g); w1g.connect(lfo.frequency); w2.connect(w2g); w2g.connect(lfo.frequency);
        if(probe) src.connect(am); else { src.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(ng); ng.connect(hp); tone.connect(tg); tg.connect(hp); hp.connect(am); }
        am.connect(level); level.connect(probe || dry); level.gain.setValueAtTime(0, t);
        const end = t + L - .75; let x = t, n = 0;
        while(x < end){ const tin = .8 + .1 * Math.sin(n * 1.7), tout = 1.2 + .15 * Math.sin(n * 2.3 + 1);
          level.gain.setTargetAtTime(.5 * vol, x, .14); lfo.frequency.setTargetAtTime(27.5, x, .2); f1.frequency.setTargetAtTime(340, x, .2); tone.frequency.setTargetAtTime(110, x, .25);
          if(x + tin < end){ level.gain.setTargetAtTime(vol, x + tin, .18); lfo.frequency.setTargetAtTime(24.5, x + tin, .25); f1.frequency.setTargetAtTime(270, x + tin, .25); tone.frequency.setTargetAtTime(98, x + tin, .3); }
          x += tin + tout; n++; }
        level.gain.setTargetAtTime(0, end, .14); [src, tone, lfo, w1, w2].forEach(s => { s.start(t); s.stop(t + L + .25); }); return L; }};
    return {c, master, CUE, play(name, o){ try{ return CUE[name](c.currentTime + .02 + ((o && o.at) || 0), o || {}); }catch(e){ return 0; } }}; }
  let AC = null, AK = null;
  const ac = () => { try{ if(!AC){ AC = new (window.AudioContext || window.webkitAudioContext)(); AK = audioKit(AC); AK.master.gain.value = SV.mute ? 0 : VOL; } if(AC.state === 'suspended' && !document.hidden) AC.resume(); }catch(e){} return AC; };
  const snd = (name, o) => { if(!AC || SV.mute || document.hidden) return; try{ AK.play(name, o); }catch(e){} };   // only after the first tap has made the context
  function setMute(m){ SV.mute = !!m; save(); if(AK) AK.master.gain.setTargetAtTime(m ? 0 : VOL, AC.currentTime, .03); document.querySelectorAll('.fndSnd').forEach(b => { b.setAttribute('aria-pressed', String(!m)); b.setAttribute('aria-label', m ? 'Turn sound on' : 'Turn sound off'); b.classList.toggle('off', !!m); const s = b.querySelector('span'); if(s) s.textContent = m ? 'Sound is off' : 'Sound is on'; }); }
  const onVis = () => { try{ if(!AC) return; if(document.hidden) AC.suspend(); else AC.resume(); }catch(e){} };
  /* render every cue on an offline context and report its peak (dBFS), length, clipping and DC offset: the sounds are checked by numbers here, not by ear.
     The purr is also checked against its brief: where its energy sits (third-octave bands), how far down it is above 1 kHz, how far under the bell it peaks,
     and the shape of its pulse (rate, depth, and the fastest 10-to-90 % rise), read from the bare envelope. */
  async function measure(){ const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, res = {}, sr = 44100; if(!OAC) return {error: 'no OfflineAudioContext'};
    const render = (secs, fn) => { const oc = new OAC(2, Math.ceil(sr * secs), sr), k = audioKit(oc); fn(k, oc); return oc.startRendering(); }, r1 = x => +x.toFixed(1);
    const stat = buf => { let peak = 0, sum = 0, clip = 0, last = 0, sq = 0; for(let ch = 0; ch < 2; ch++){ const d = buf.getChannelData(ch); for(let i = 0; i < d.length; i++){ const a = Math.abs(d[i]); if(a > peak) peak = a; if(a >= .999) clip++; if(a > .001 && i > last) last = i; sum += d[i]; sq += d[i] * d[i]; } }
      return {peakDb: r1(20 * Math.log10(peak || 1e-9)), rmsDb: r1(10 * Math.log10(sq / (2 * buf.length) || 1e-12)), secs: +(last / sr).toFixed(2), clipped: clip, dc: +(sum / (2 * buf.length)).toFixed(5)}; };
    for(const name of ['find', 'right', 'wrong', 'tick', 'tap', 'whoosh', 'bell', 'mrrp', 'patter', 'fanfare']) for(const v of name === 'find' ? [0, 4] : [0])
      res[name + (name === 'find' ? v : '')] = stat(await render(4, k => k.CUE[name](.05, name === 'find' ? {step: v} : name === 'bell' ? {pan: .7} : {})));
    const bell0 = stat(await render(2, k => k.CUE.bell(.05, {}))), pb = await render(5.6, k => k.CUE.purr(.05, {len: 5})), d = pb.getChannelData(0), P = res.purr = stat(pb);
    const N = 8192, cf = [], bands = []; for(let f = 31.5; f < 12000; f *= Math.pow(2, 1 / 3)){ cf.push(f); bands.push(0); } let hi = 0;
    for(let s = Math.floor(sr * .5); s + N < d.length - sr * .5; s += N / 2){ const re = new Float64Array(N), im = new Float64Array(N); for(let i = 0; i < N; i++) re[i] = d[s + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / N));
      for(let i = 1, j = 0; i < N; i++){ let bit = N >> 1; for(; j & bit; bit >>= 1) j ^= bit; j ^= bit; if(i < j){ const t = re[i]; re[i] = re[j]; re[j] = t; } }
      for(let len = 2; len <= N; len <<= 1){ const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for(let i = 0; i < N; i += len){ let cr = 1, ci = 0; for(let k = 0; k < len / 2; k++){ const a = i + k, b = a + len / 2, vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr; re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
      for(let k = 1; k < N / 2; k++){ const f = k * sr / N, p = re[k] * re[k] + im[k] * im[k]; if(f > 1000) hi += p; const bi = Math.round(Math.log2(f / 31.5) * 3); if(bi >= 0 && bi < bands.length) bands[bi] += p; } }
    let pk = 0; bands.forEach((b, i) => { if(b > bands[pk]) pk = i; });
    const e = (await render(5.6, (k, oc) => k.CUE.purr(.05, {len: 5, probe: oc.destination}))).getChannelData(0), ext = [], rise = [], depth = [], per = []; let dir = 1, last = Math.floor(sr * .85);   // turning points of the pulse (5 % swing or more)
    for(let k = last + 1; k < sr * 4.2; k++){ const dv = e[k] - e[last]; if(dir > 0 && dv < -.05 * e[last]){ ext.push([last, 1]); dir = -1; last = k; } else if(dir < 0 && dv > .05 * e[last]){ ext.push([last, -1]); dir = 1; last = k; } else if((dir > 0 && dv > 0) || (dir < 0 && dv < 0)) last = k; }
    const mins = ext.filter(x => x[1] < 0).map(x => x[0]); for(let m = 0; m < mins.length - 1; m++) per.push(sr / (mins[m + 1] - mins[m]));
    for(let m = 0; m < ext.length - 1; m++){ if(ext[m][1] > 0 || ext[m + 1][1] < 0) continue; const i0 = ext[m][0], i1 = ext[m + 1][0], lo = e[i0], hv = e[i1]; let t10 = null, t90 = null; for(let k = i0; k <= i1; k++){ const u = (e[k] - lo) / (hv - lo); if(t10 == null && u >= .1) t10 = k; if(u >= .9){ t90 = k; break; } } rise.push((t90 - t10) / sr * 1000); depth.push((hv - lo) / (hv + lo)); }
    const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    Object.assign(P, {underBellPeakDb: r1(bell0.peakDb - P.peakDb), peakBandHz: Math.round(cf[pk]), above1kHzDb: r1(10 * Math.log10((hi || 1e-30) / bands[pk])), pulsesPerSec: r1(avg(per)), pulseRateRange: [r1(Math.min(...per)), r1(Math.max(...per))], pulseDepthPct: Math.round(avg(depth) * 100), fastestPulseRiseMs: r1(Math.min(...rise))});
    return res; }


  /* ---------- where you stand and where you look: the game owns the camera, pinned to a standing place in the room ---------- */
  const anchor = new THREE.Vector3(); let pinned = false, tw = null, walk = null;
  const facing = () => { cam.getWorldDirection(_d); return {yaw: Math.atan2(_d.x, _d.z), pitch: Math.asin(clamp(_d.y, -1, 1))}; };
  function aim(yaw, pitch){ const c = Math.cos(pitch); H.look(anchor.toArray(), [anchor.x + Math.sin(yaw) * c * 10, anchor.y + Math.sin(pitch) * 10, anchor.z + Math.cos(yaw) * c * 10]); }
  function turnTo(yaw, pitch, dur){ const a = facing(), dy = wrap(yaw - a.yaw); if(reduce || !dur){ tw = null; aim(a.yaw + dy, pitch); return; } tw = {t0: performance.now(), dur, y0: a.yaw, dy, p0: a.pitch, p1: pitch}; }
  function lookAtPoint(p, dur){ const dx = p.x - anchor.x, dz = p.z - anchor.z; turnTo(Math.atan2(dx, dz), clamp(Math.atan2(p.y - anchor.y, Math.hypot(dx, dz)) + .08, -.85, .35), dur); }
  function pin(){ if(pinned && !H.anim && cam.position.distanceToSquared(anchor) > 1e-7){ cam.position.copy(anchor); cam.updateMatrixWorld(); } }
  const prevOBR = H.scene.onBeforeRender, myOBR = function(){ if(!dead){ try{ pin(); }catch(e){} } return prevOBR && prevOBR.apply(this, arguments); }; H.scene.onBeforeRender = myOBR;
  function turn(sign){ if(!S.on || S.mode !== 'seek' || H.anim || walk) return;   // not while travelling: a room-to-room move is never interrupted
    const a = facing(), base = tw ? tw.y0 + tw.dy : a.yaw, y = base + sign * Math.PI / 3.6; turnTo(y, tiltFor(y, tw ? tw.p1 : a.pitch), 420); snd('tick'); S.turned = true; S.tAct = performance.now(); nudge(null); }
  /* a turn or a walk keeps the tilt you had, with one exception: when it brings the part of him that shows into the picture from side to side but leaves it
     above or below the frame (he is close to your feet, or up on a counter), the tilt eases just far enough to bring him in. Small players have no way to tilt. */
  function tiltFor(yaw, pitch){ const v = cur(); if(S.step === 0 || v.n < SEEN()) return pitch; const p = aimPt(), dx = p.x - anchor.x, dz = p.z - anchor.z; if(Math.abs(wrap(Math.atan2(dx, dz) - yaw)) > hHalf() - .12) return pitch;
    const el = Math.atan2(p.y - anchor.y, Math.hypot(dx, dz)), reach = Math.atan(Math.tan(cam.fov * Math.PI / 360) / (cam.zoom || 1)); return clamp(pitch, el - reach * .5, el + reach * .2); }   // the buttons cover the bottom of the picture, so he is brought in above them
  /* walk to another standing place in the room. You keep looking the way you were looking; it is a short glide when the way is clear at eye height
     and a blink when something is in between, so the camera never passes through furniture. */
  function walkTo(i, then){ if(!S.on || S.mode !== 'seek' || walk || H.anim) return false; const R = ROOM[room()], n = R.v.length; if(n < 2) return false; i = ((i % n) + n) % n; if(i === S.view){ then && then(); return false; }
    const to = eyeOf(R, i), a = tw ? {yaw: tw.y0 + tw.dy, pitch: tw.p1} : facing(); tw = null; S.walked = true; S.tAct = performance.now(); snd('patter', {n: 5}); nudge(null);
    const land = () => { anchor.copy(to); aim(a.yaw, a.pitch); S.view = i; walk = null; placeSteps(); lastWarm = -1; ui(); if(!then){ let y = a.yaw; const far = q => Math.min(hit(to.x, to.y, to.z, Math.sin(q), 0, Math.cos(q), 9), hit(to.x, to.y, to.z, Math.sin(q + .4), 0, Math.cos(q + .4), 9), hit(to.x, to.y, to.z, Math.sin(q - .4), 0, Math.cos(q - .4), 9));
        if(far(y) < 3.5){ const w = R.v[i].slice(2).map(d => d * Math.PI / 180).find(q => far(q) > 4.5); if(w != null) y = w; }   // walked up to a wall: face the way that place looks into the room
        const p2 = tiltFor(y, a.pitch); if(y !== a.yaw || Math.abs(p2 - a.pitch) > .01) turnTo(y, p2, 400); } then && then(); };
    if(!reduce && clearTo(anchor, to, .1)) walk = {t0: performance.now(), dur: clamp(anchor.distanceTo(to) * 70, 450, 900), from: anchor.clone(), to, yaw: a.yaw, pitch: a.pitch, land};
    else { walk = {}; blink.classList.add('on'); later(() => { land(); later(() => blink.classList.remove('on'), 140); }, 210); }
    return true; }
  function placeSteps(){ const R = ROOM[room()], show = S.mode === 'seek' && S.step > 0; let k = 0; if(R && show) R.v.forEach((v, i) => { if(i === S.view || !STEPS[k]) return; const m = STEPS[k++]; m.position.set(v[0], R.fy + .05, v[1]); m.userData.to = i; m.visible = true; }); for(; k < STEPS.length; k++) STEPS[k].visible = false; }
  const hideSteps = () => STEPS.forEach(m => { m.visible = false; });
  // go to a room: a soft fade, then stand at its first standing place with the tour's own lens for the room
  function travel(id, first, cb){ const R = ROOM[id]; S.mode = 'travel'; ring.classList.remove('on'); hideSteps(); nudge(null); snd('whoosh'); fade.querySelector('b').textContent = R.name; fade.classList.add('on');
    later(() => { clearPrints(); CAT.visible = RUN.visible = BOX.visible = false; PX = null; pinned = false; tw = null; walk = null;
      try{ H.showStop(stopIx(id)); const a = H.anim; if(a){ a.dur = .001; a.photo = null; a.lift = 0; } }catch(e){}
      let n = 0; (function settle(){ if(dead) return; if(H.anim && n++ < 40) return requestAnimationFrame(settle);
        try{ if(H.tod !== (R.tod || 'dusk')) H.setTOD(R.tod || 'dusk'); }catch(err){}   // dinner time: the lamps are on and the white rooms have some shape; outdoors it is still golden
        const e = eyeOf(R, 0), y = R.v[0][2] * Math.PI / 180; anchor.copy(e); pinned = true; aim(y, PITCH0); cb(); later(() => fade.classList.remove('on'), first ? 300 : 420); })(); }, 300); }

  /* ---------- state ---------- */
  const S = {on: false, mode: 'idle', daily: true, hard: !!SV.hard, seed: 0, step: 0, trail: [], spot: null, P: new THREE.Vector3(), path: null, view: 0, vis: [], best: 0, open: 0, t0: 0, tSeek: 0, tHint: 0, tMeow: 0, tSeen: 0, tAct: 0, tWig: 0,
    wrong: 0, helps: 0, miss: 0, asked: 0, fresh: 0, got: [], turned: false, walked: false, taught: false, force: null, dev: false};
  const NOV = {n: 0, f: 0, head: 0, cu: 0, cv: .6, u0: -.5, u1: .5, v0: 0, v1: 1, d: 9}, room = () => S.trail[S.step], cur = () => S.vis[S.view] || NOV;
  const dailyDone = SV.last === DAY, stepR = salt => rng(S.seed * 31 + S.step * 977 + salt);
  // a trail left half way is picked up again after a reload (same rooms, same hiding places), for the rest of the day
  const RUNKEY = 'find.run', saveRun = phase => S.dev || store.set(RUNKEY, {day: DAY, at: Date.now(), daily: S.daily, hard: S.hard, seed: S.seed, trail: S.trail, step: S.step, phase, wrong: S.wrong, helps: S.helps, fresh: S.fresh, got: S.got, ms: Math.round(performance.now() - S.t0)});
  const savedRun = () => { const r = store.get(RUNKEY); return r && r.day === DAY && Date.now() - r.at < 6 * 3600e3 && Array.isArray(r.trail) && r.trail.length === 5 && r.trail.every(k => ROOM[k] && stopOf(k)) && r.step >= 0 && r.step < 5 && (r.step > 0 || r.phase === 'clue') ? r : null; };
  function newTrail(seed){ const R = rng(seed), pool = POOL.slice(); for(let i = pool.length - 1; i > 0; i--){ const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    let rooms = pool.slice(0, 4); const force = (Q.get('trail') || '').split(',').filter(k => ROOM[k] && k !== 'entry' && stopOf(k)); if(force.length) rooms = force.concat(rooms.filter(k => !force.includes(k))).slice(0, 4);
    S.seed = seed; S.trail = ['entry'].concat(rooms); S.step = 0; S.wrong = 0; S.helps = 0; S.miss = 0; S.fresh = 0; S.got = []; S.spot = null; preload(); }
  function preload(){ for(const k of S.trail){ const im = new Image(); im.src = ROOM[k].photo; if(ROOM[k].big){ const b = new Image(); b.src = ROOM[k].big; } } later(() => { for(const k in ROOM){ const im = new Image(); im.src = ROOM[k].photo; } }, 2500); }
  function setProp(s){ if(s && s.box){ BOX.position.set(s.p[0], s.p[1] - .05, s.p[2]); BOX.rotation.y = .4; BOX.visible = true; PX = gather(BOX, null, true); } else { BOX.visible = false; PX = null; } }
  /* pick his hiding place for this room. The trail gets harder: the first hiding room wants a place that is easy once you turn, the next one where he is
     partly behind something, then one you have to walk for, and last one where only his ears, eyes or tail show. Sneaky mode starts at the hardest.
     A place is used only if the model still lets some of him be seen from one of the room's standing places. */
  const PREF = [['d0'], ['d1', 'd2', 'd2w', 'd3'], ['d2', 'd2w', 'd1', 'd3'], ['d2w', 'd3', 'd2', 'd1'], ['d3', 'd2w', 'd2', 'd1']], klass = s => s.d === 2 && s.w ? 'd2w' : 'd' + s.d;
  const SEEN = () => S.hard ? 3 : 6;   // how many points of his outline must show before he counts as visible from a place (about 5 % of him; 3 % in sneaky mode)
  function seeAll(R, P){ const vs = R.v.map((v, i) => vis(eyeOf(R, i), P)), sc = q => q.f * (q.d < 3 ? .3 : 1); let best = 0; if(vs[0].f < .1) vs.forEach((q, i) => { if(sc(q) > sc(vs[best]) + 1e-6) best = i; }); return {vs, best}; }
  // how big the part of him that shows is on this screen, in pixels (the longer side), from the place you would spot him: small screens drop the hiding places that would be specks
  const sizeOn = q => { const b = q.vs[q.best]; return Math.max((b.u1 - b.u0) * CW, (b.v1 - b.v0) * CH) * H.canvas.getBoundingClientRect().height / (2 * Math.tan(cam.fov * Math.PI / 360) / (cam.zoom || 1) * Math.hypot(b.d, 3)); }, BIG = () => S.hard ? 12 : 22;
  function chooseSpot(id){ const R = ROOM[id], Rn = stepR(1), pref = S.step === 0 ? PREF[0] : PREF[S.hard ? 4 : Math.min(S.step, 4)];
    const order = R.spots.map((s, i) => ({s, i, r: Rn(), k: (pref.indexOf(klass(s)) + 9) % 9, old: S.daily || !SV.spots[id + '.' + i] ? 0 : 1})).sort((a, b) => (a.k - b.k) || (a.old - b.old) || (a.r - b.r));
    if(S.force != null){ const f = order.findIndex(o => o.i === S.force); if(f > 0) order.unshift(order.splice(f, 1)[0]); S.force = null; }
    for(const o of order){ setProp(o.s); const q = seeAll(R, _v.set(o.s.p[0], o.s.p[1], o.s.p[2])); if(q.vs[q.best].n >= SEEN() && sizeOn(q) >= BIG() && hit(o.s.p[0], o.s.p[1] + .5, o.s.p[2], 0, -1, 0, 1.3) !== Infinity) return Object.assign(o, q); }
    setProp(null); const V = eyeOf(R, 0), y0 = R.v[0][2] * Math.PI / 180;   // last resort: out on real floor, behind the way you arrive facing
    for(const q of [5, 4, 3]) for(const a of [Math.PI, 2.4, -2.4, 1.7, -1.7, 1, -1, 0]){ const x = V.x + Math.sin(y0 + a) * q, z = V.z + Math.cos(y0 + a) * q, t = hit(x, R.fy + 2.5, z, 0, -1, 0, 3.2); if(!((t !== Infinity && Math.abs(R.fy + 2.5 - t - R.fy) < .4) || (t === Infinity && R.open))) continue;
      const s = seeAll(R, _v.set(x, R.fy + .03, z)); if(s.vs[0].f > .6) return Object.assign({s: {p: [x, R.fy + .03, z], n: R.at, d: 1}, i: -1}, s); }
    return Object.assign({s: {p: [V.x + Math.sin(y0 + Math.PI) * 3, R.fy + .03, V.z + Math.cos(y0 + Math.PI) * 3], n: R.at, d: 1}, i: -1}, {vs: R.v.map(() => Object.assign({}, NOV, {n: MASK.length, f: 1, head: 1})), best: 0}); }
  function arrive(){ const id = room(), R = ROOM[id]; SP = soupFor(id); const o = chooseSpot(id), V = eyeOf(R, 0); S.spot = o; S.P.set(o.s.p[0], o.s.p[1], o.s.p[2]); S.vis = o.vs; S.best = o.best; S.view = 0; S.path = null; anchor.copy(V);
    CAT.material.map = TEX.open; CAT.material.opacity = 1; CAT.scale.set(CW, CH, 1); CAT.position.copy(S.P); CAT.visible = true;
    if(S.step === 0) lookAtPoint(_v.copy(S.P).setY(S.P.y + CH * .6), 0); else aim(S.open = openingYaw(R, V, S.P, S.vis[0]), PITCH0);
    const t = performance.now(); S.mode = 'seek'; S.tSeek = S.tHint = S.tAct = t; S.tMeow = t - 5000; S.tSeen = 0; S.miss = 0; S.asked = 0; S.turned = S.walked = S.taught = false; lastWarm = -1; placeSteps(); ui(); saveRun('seek');
    later(() => { if(S.mode !== 'seek') return; snd('bell', {pan: panOf()}); S.tMeow = performance.now();
      if(S.step === 0){ toast('There he is. Tap Snowball.', 5200); ringUntil = performance.now() + 60000; }
      else if(S.step === 4) toast('This is the last room. Find him.', 4200);
      else if(S.hard) return;
      else if(S.step === 1){ toast('He is hiding in this room. Turn to look for him.', 5200); nudge('turn', 5200); }
      else if(S.vis[0].n < SEEN() && R.v.length > 1){ toast('He is tucked away. Try walking across the room.', 5200); nudge('walk', 5200); }
      else if(S.step === 2) toast('He hides better now. Look for his ears, or his tail.', 4800); }, 900); }

  /* ---------- UI ---------- */
  const css = `
  html.fnd #mini, html.fnd #cv27, html.fnd header.bar nav.tabs, html.fnd header.bar .plate, html.fnd #aboutBtn, html.fnd #card, html.fnd #labels, html.fnd #wplabels, html.fnd #ovtag, html.fnd #tod, html.fnd #viewBtn, html.fnd #hwBtn, html.fnd #tgBtn, html.fnd #phMore, html.fnd .g28pill, html.fnd #navHelp, html.fnd #hint, html.fnd #pad, html.fnd #gotoWrap, html.fnd #toggles, html.fnd #note, html.fnd #peek27, html.fnd .wptip{display:none!important}
  html.fnd #v33disc{z-index:59}   /* r35: the notice now sits bottom right and keeps itself clear of the bar (its own placer, in the page) */
  html.fnd:not(.fnd-on) #fndTop, html.fnd:not(.fnd-on) #fndBar{display:none}
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
  #fndBtns button{border:0;cursor:pointer;min-height:48px;padding:10px 16px;font:500 16px Jost,sans-serif;display:flex;align-items:center;gap:8px;color:#1f2a3a}#fndBtns button:disabled{opacity:.45;cursor:default}
  #fndBtns svg{width:24px;height:24px}#fndHelp svg{color:#e0862a}
  #fndSnd{width:48px;justify-content:center;padding:0}.fndSnd.off{color:#8a919e}.fndSnd .x{display:none}.fndSnd.off .x{display:inline}.fndSnd.off .w{display:none}
  #fndBar{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:60;padding:8px;width:min(520px,calc(100% - 20px));box-sizing:border-box}
  #fndBar .rm{text-align:center;min-width:0;padding:2px 6px 8px}#fndBar .rm b{display:block;font-size:18px;font-weight:500;line-height:1.2}#fndBar .rm span{display:block;font-size:14px;line-height:1.3;color:#4c5565;margin-top:2px}
  #fndBar .go{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}#fndBar.one .go{grid-template-columns:1fr 1fr}#fndBar.one #fndW{display:none}
  #fndBar button{height:58px;border-radius:16px;border:0;background:#1f2948;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font:500 17px Jost,sans-serif;padding:0 6px}
  #fndBar #fndW{background:#b9641a}#fndBar button svg{width:26px;height:26px;flex:none}#fndBar button:active{transform:scale(.96)}#fndBar button:disabled{opacity:.35;cursor:default}
  #fndBar button.nudge{animation:fndNudge 1s ease-in-out infinite}
  @keyframes fndNudge{0%,100%{box-shadow:0 0 0 0 rgba(255,215,122,0)}50%{box-shadow:0 0 0 7px rgba(255,215,122,.85)}}
  #fndWarm{position:fixed;z-index:60;left:50%;bottom:130px;transform:translateX(-50%);display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:999px;transition:opacity .3s;white-space:nowrap}
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
  #fndBlink{position:fixed;inset:0;z-index:54;background:#f6f3ec;opacity:0;pointer-events:none;transition:opacity .18s}#fndBlink.on{opacity:1}
  #fndCard{position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(14,19,34,.45);font-family:Jost,sans-serif;padding:14px}
  #fndCard.clue{background:rgba(14,19,34,.28)}
  #fndCard .c{background:#fbfaf7;color:#1f2a3a;border-radius:24px;max-width:540px;width:100%;padding:20px 20px 18px;box-shadow:0 30px 90px rgba(0,0,0,.45);max-height:calc(100% - 28px);overflow:auto;text-align:center;animation:fndUp .35s ease-out;box-sizing:border-box}
  @keyframes fndUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
  #fndCard .cat{width:118px;margin:-4px auto 0}#fndCard .fin .cat{width:84px}#fndCard .fin{padding-top:14px}#fndCard .cat svg{width:100%;height:auto;display:block}
  #fndCard h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:clamp(32px,6vw,44px);font-weight:600;line-height:1;margin:4px 0 8px}
  #fndCard p{font-size:17px;line-height:1.4;margin:0 0 12px;color:#2b3442}
  #fndCard .how{list-style:none;margin:0 auto 14px;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:460px}
  #fndCard .how li{background:#f1eee6;border-radius:14px;padding:10px 6px 9px;font-size:14.5px;line-height:1.25;color:#2b3442}#fndCard .how svg{width:30px;height:30px;display:block;margin:0 auto 5px;color:#b9641a}
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
  #fndCard .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0 8px}#fndCard .stats div{background:#f1eee6;border-radius:14px;padding:9px 4px 8px}
  #fndCard .stats b{display:block;font-size:25px;font-weight:500;line-height:1.1;font-variant-numeric:tabular-nums}#fndCard .stats span{display:block;font-size:13.5px;line-height:1.2;color:#4c5565;margin-top:3px}
  #fndCard .book{font-size:15px;color:#4c5565;margin:0 0 12px}#fndCard .book i{display:block;height:8px;border-radius:8px;background:#e7e3da;margin:0 auto 7px;max-width:300px;overflow:hidden}#fndCard .book i u{display:block;height:100%;background:#e0862a;border-radius:8px}
  #fndCard .cta{background:#1f2948;color:#f4f1e8;border-radius:16px;padding:14px 16px;margin:12px 0 8px;text-align:left}
  #fndCard .cta b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:23px;font-weight:600;line-height:1.1;margin-bottom:4px}#fndCard .cta span{display:block;font-size:15px;line-height:1.35;color:#d5daE6;margin-bottom:10px}
  #fndCard .opt{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:14px}
  #fndCard .opt button{border:1px solid #cfcabe;background:#fff;color:#1f2a3a;border-radius:999px;padding:9px 16px;font:400 15px Jost,sans-serif;cursor:pointer;min-height:44px}
  #fndCard .opt button{display:inline-flex;align-items:center;gap:6px}#fndCard .opt button svg{width:20px;height:20px}#fndCard .opt #fndHard[aria-pressed=true]{background:#1f2948;border-color:#1f2948;color:#fff}
  #fndCard .sub{font-size:14px;color:#5c6575;margin:12px 0 0}
  #fndCard .link{width:100%;box-sizing:border-box;margin:8px 0 0;padding:9px 10px;border:1px solid #cfcabe;border-radius:10px;font:400 14px Jost,sans-serif;color:#1f2a3a;background:#fff;text-align:center}
  .fndBtn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;border:1px solid #cfcabe;background:#fff;color:#1f2a3a;border-radius:999px;padding:0 20px;height:46px;font:400 16px/1 Jost,sans-serif;cursor:pointer;text-decoration:none;margin:4px 3px 0;vertical-align:middle}
  .fndBtn.big{font-size:20px;height:58px;padding:0 30px;background:#b9641a;border-color:#b9641a;color:#fff;font-weight:500}
  .fndBtn.next{background:#b9641a;border-color:#b9641a;color:#fff;font-weight:500}
  .fndBtn.primary{background:#9b2c3c;border-color:#9b2c3c;color:#fff;font-weight:500}
  #fndToast{position:fixed;left:16px;right:16px;top:150px;margin:0 auto;width:fit-content;transform:translateY(-10px);z-index:90;background:#1f2948;color:#fff;font:500 17px Jost,sans-serif;padding:11px 20px;border-radius:999px;opacity:0;transition:.3s;pointer-events:none;max-width:calc(100% - 32px);text-align:center;box-shadow:0 6px 22px rgba(0,0,0,.3)}
  #fndToast.on{opacity:1;transform:none}
  .fndConf{position:fixed;z-index:95;width:10px;height:14px;top:-20px;pointer-events:none;animation:fndFall linear forwards}
  @keyframes fndFall{to{transform:translateY(110vh) rotate(720deg)}}
  .fndHeart{position:fixed;z-index:58;font-size:26px;color:#e2583e;pointer-events:none;animation:fndHeart 1.5s ease-out forwards}
  @keyframes fndHeart{from{transform:translate(-50%,0) scale(.6);opacity:1}to{transform:translate(-50%,-90px) scale(1.2);opacity:0}}
  @media (max-width:560px){#fndTop{top:56px;left:8px;right:8px}#fndTray{padding:8px 10px}#fndTray small{font-size:14px}#fndTray .slot{width:32px;height:32px}#fndTray .slot svg{width:18px;height:18px}#fndTray .slot.cat{width:38px;height:38px}#fndTray .slot.cat svg{width:34px}#fndBtns button{padding:10px 12px}#fndHelp{flex-direction:column;gap:2px;padding:6px 8px;min-width:58px}#fndHelp span{font-size:11.5px;line-height:1;white-space:nowrap}#fndHelp svg{width:22px;height:22px}#fndBtns{gap:6px}
    #fndBar{bottom:10px;padding:7px}#fndBar .rm{padding:1px 4px 6px}#fndBar .rm b{font-size:17px}#fndBar .rm span{font-size:13px}#fndBar .go{gap:6px}#fndBar button{height:54px;font-size:16px;gap:6px}#fndBar button svg{width:24px;height:24px}
    #fndCard{align-items:end;padding:8px}#fndCard .c{padding:16px 14px 14px;border-radius:22px}#fndCard .cat{width:92px}#fndCard .picks button{font-size:13.5px}.fndCam{width:124px;height:124px}#fndCard .camrow{gap:12px}#fndCard .camrow p{font-size:16px}#fndCard .how li{font-size:13.5px;padding:8px 4px}#fndCard .stats b{font-size:22px}#fndCard .stats span{font-size:12.5px}#fndToast{top:132px;font-size:16px}}
  @media (max-height:520px){#fndBar .rm span{display:none}#fndCard .cat{width:70px}}
  @media (prefers-reduced-motion:reduce){#fndRing.on,#fndTray .slot.pop,#fndCard .c,.fndTap,#fndBar button.nudge{animation:none}#fndBar button.nudge{box-shadow:0 0 0 5px rgba(255,215,122,.85)}}
  `;
  const IC = {l: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    r: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
    snd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z" fill="currentColor"/><path class="w" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="x" d="m16 9.5 5 5m0-5-5 5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>',
    ears: '<svg viewBox="0 0 170 78" aria-hidden="true"><path d="M18 80 L22 14 L58 44 Q85 34 112 44 L148 14 L152 80Z" fill="#e58f3a" stroke="#b05a1c" stroke-width="2" stroke-linejoin="round"/><path d="M28 54 L27 25 L49 44Z M142 54 L143 25 L121 44Z" fill="#f0b6a0"/><path d="M70 80 L69 62 L85 73 L101 62 L100 80 M85 63 L85 50 M77 58 L76 49 M93 58 L94 49" fill="none" stroke="#a64c15" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/></svg>'};
  Object.assign(IC, {walk: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="8" cy="15.5" rx="3.3" ry="4.6"/><ellipse cx="8" cy="8.3" rx="2.6" ry="1.9"/><ellipse cx="16.5" cy="11.5" rx="3.3" ry="4.6"/><ellipse cx="16.5" cy="4.3" rx="2.6" ry="1.9"/></svg>',
    look: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6.5" width="18" height="13" rx="2.5"/><path d="M8.5 6.5 10 4h4l1.5 2.5"/><circle cx="12" cy="13" r="3.4"/></svg>'});
  const el = (tag, attrs, html) => { const e = document.createElement(tag); for(const k in (attrs || {})) e.setAttribute(k, attrs[k]); if(html != null) e.innerHTML = html; return e; };
  const DOM = []; const put = e => { document.body.appendChild(e); DOM.push(e); return e; };
  let ring, toastE, fade, blink, bubble, edge, warm, styleE, tt = 0, ringUntil = 0, bubbleUntil = 0, nudgeT = 0;
  const toast = (m, ms) => { toastE.textContent = m; toastE.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toastE.classList.remove('on'), ms || 2600); };
  const face = id => window.SNOWBALL.svg({id, seed: 7}).replace(/viewBox="[^"]+"/, 'viewBox="110 10 180 200"');
  // make a button glow for a moment: 'turn' the two arrows, 'walk' the walk button, null = stop
  function nudge(what, ms){ clearTimeout(nudgeT); const L = $('#fndL'), R = $('#fndR'), W = $('#fndW'); if(!L) return; L.classList.toggle('nudge', what === 'turn'); R.classList.toggle('nudge', what === 'turn'); W.classList.toggle('nudge', what === 'walk'); if(what && ms) nudgeT = setTimeout(() => nudge(null), ms); }
  function buildUI(){ styleE = el('style', {}, css); document.head.appendChild(styleE); document.documentElement.classList.add('fnd'); document.documentElement.classList.toggle('fnd-hard', S.hard);
    try{ if(!document.querySelector('link[href*="Jost"]')){ const l = el('link', {rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500&display=swap'}); document.head.appendChild(l); DOM.push(l); } }catch(e){}
    put(el('div', {id: 'fndTop'}, `<div class="fnd-chip" id="fndTray"><small>Find Snowball<em id="fndClock"></em></small><div class="slots" aria-hidden="true">${[0, 1, 2, 3].map(() => `<span class="slot">${PAWSVG()}</span>`).join('')}<span class="slot cat">${face('sbt')}</span></div></div>
      <div id="fndBtns"><button class="fnd-chip" id="fndHelp" type="button">${PAWSVG()}<span>Hint</span></button><button class="fnd-chip fndSnd" id="fndSnd" type="button">${IC.snd}</button></div>`));
    put(el('div', {id: 'fndBar', class: 'fnd-chip'}, `<div id="fndWarm" class="fnd-chip off" aria-hidden="true">${[0, 1, 2, 3, 4].map(() => `<i>${PAWSVG()}</i>`).join('')}<em></em></div>
      <div class="rm" aria-live="polite"><b id="fndRoom"></b><span id="fndFact"></span></div>
      <div class="go"><button type="button" id="fndL" aria-label="Turn left">${IC.l}<span>Turn</span></button><button type="button" id="fndW" aria-label="Walk to the other side of the room">${IC.walk}<span>Walk</span></button><button type="button" id="fndR" aria-label="Turn right"><span>Turn</span>${IC.r}</button></div>`));
    warm = put($('#fndWarm')); ring = put(el('div', {id: 'fndRing'})); toastE = put(el('div', {id: 'fndToast', role: 'status'})); bubble = put(el('div', {id: 'fndBubble'})); edge = put(el('div', {id: 'fndEdge'}, IC.arrow + '<span>Jingle</span>'));
    fade = put(el('div', {id: 'fndFade'}, `<div>${PAWSVG()}<b></b></div>`)); blink = put(el('div', {id: 'fndBlink'}));
    $('#fndL').onclick = () => turn(1); $('#fndR').onclick = () => turn(-1); $('#fndW').onclick = () => walkTo(S.view + 1); $('#fndHelp').onclick = () => help(); $('#fndSnd').onclick = () => { ac(); setMute(!SV.mute); snd('tap'); }; setMute(SV.mute); }
  function ui(){ const id = room(), R = ROOM[id]; if(!R) return; $('#fndRoom').textContent = R.name; $('#fndFact').textContent = R.fact;
    document.querySelectorAll('#fndTray .slot').forEach((s, i) => { s.classList.toggle('got', i < S.step || (i === S.step && /react|clue|done/.test(S.mode))); s.classList.toggle('now', i === S.step && S.mode === 'seek'); });
    const seek = S.mode === 'seek', hb = $('#fndHelp'), show = S.asked > 0 || S.step === 0; warm.classList.toggle('off', !seek || S.step === 0); hb.disabled = !seek; $('#fndL').disabled = $('#fndR').disabled = !seek; $('#fndW').disabled = !seek || S.step === 0;
    $('#fndBar').classList.toggle('one', R.v.length < 2 || S.step === 0); hb.querySelector('span').textContent = show ? 'Show me' : 'Hint'; hb.setAttribute('aria-label', show ? 'Show me where he is' : 'Give me a hint'); }
  /* help, in two steps so a small player is never stuck and an older one is not handed the answer: the first press is a hint (he rings his bell and jumps,
     and you are told which way, or to walk); the second press takes you to where he can be seen, turns you to him and rings him. Left alone long enough,
     the game does the second step itself. */
  function help(auto){ if(!S.on || S.mode !== 'seek' || H.anim || walk) return; const t = performance.now(); S.tHint = S.tAct = t; S.taught = true; if(!auto){ S.helps++; ga('find_help', {step: S.step, tier: S.asked}); }
    if(!auto && !S.asked && S.step > 0){ S.asked = 1; ui(); snd('bell', {pan: panOf(), vol: 1.2}); hop(.9, 520); const v = cur();
      if(v.n < SEEN() && S.best !== S.view){ toast('He is behind something from here. Try walking.', 3600); nudge('walk', 5000); }
      else if(!onScreen()){ const left = relYaw() > 0; edge.className = left ? 'l on' : 'r on'; later(() => edge.classList.remove('on'), 2600); toast(left ? 'Jingle. He is to your left.' : 'Jingle. He is to your right.', 2600); nudge('turn', 2600); }
      else toast('He is in front of you. Look closely.', 2600); return; }
    S.asked = 2; ui(); const go = () => { lookAtPoint(aimPt(), 650); ringUntil = performance.now() + 7000; S.tHint = performance.now(); snd('bell'); later(() => { if(S.mode === 'seek') hop(.5, 420); }, 700); }; if(S.view !== S.best) walkTo(S.best, go); else go(); }

  /* ---------- where he is on the screen ---------- */
  function scr(p){ _v.copy(p); const d = cam.position.distanceTo(_v); _v.project(cam); if(_v.z > 1 || _v.z < -1) return null; const r = H.canvas.getBoundingClientRect();
    return {x: r.left + (_v.x + 1) / 2 * r.width, y: r.top + (1 - _v.y) / 2 * r.height, nx: _v.x, ny: _v.y, d, px: r.height / (2 * Math.tan(cam.fov * Math.PI / 360) * d)}; }
  const aimPt = () => { const v = cur(); return onCat(anchor, S.P, v.cu, v.n ? v.cv : .6, _b).setY(CAT.position.y + (v.n ? v.cv : .6) * CH); };   // the middle of what shows of him from here
  const headPt = () => onCat(anchor, S.P, -.17, .76, _b).setY(CAT.position.y + CH * .76);
  const relYaw = () => wrap(yawTo(anchor, S.P) - facing().yaw);   // + is to your left
  const panOf = () => clamp(-Math.sin(relYaw()) * .9, -.9, .9);
  const onScreen = () => { const v = cur(), s = v.n >= SEEN() && scr(aimPt()); return !!s && Math.abs(s.nx) < .94 && Math.abs(s.ny) < .94; };
  // the part of him you can see, as a box on the screen (and the box of all of him)
  function catRect(){ const v = cur(), box = (u0, u1, v0, v1) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for(const [u, w] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]){ const s = scr(onCat(anchor, S.P, u, w, _a)); if(!s) return null; x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); } return {x0, x1, y0, y1}; };
    return {part: v.n ? box(v.u0, v.u1, v.v0, v.v1) : null, all: box(-.5, .5, 0, 1)}; }
  const inBox = (b, x, y, minHalf, pad) => { if(!b) return false; const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, hw = Math.max(minHalf, (b.x1 - b.x0) / 2 + pad), hh = Math.max(minHalf, (b.y1 - b.y0) / 2 + pad); return Math.abs(x - cx) < hw && Math.abs(y - cy) < hh; };
  function tapRing(x, y){ const t = put(el('i', {class: 'fndTap'})); t.style.left = x + 'px'; t.style.top = y + 'px'; later(() => t.remove(), 520); }
  /* every tap on the house is ours, so nobody walks off mid-game. A tap finds him when it lands on the part of him that shows (with a generous margin:
     at least an 88 px square, 64 in sneaky mode); outside sneaky mode a tap anywhere on his outline counts as long as some of him shows.
     He cannot be found from a place where none of him can be seen. */
  H.hooks.click = (cx, cy) => { if(dead) return false; if(!S.on) return true; if(S.mode !== 'seek' || !CAT.visible || walk) return true; tw = null; S.tAct = performance.now();
    const v = cur(), seen = v.n >= SEEN() || S.step === 0, r = seen || (v.n > 0 && !S.hard) ? catRect() : null;
    if(r && seen && (inBox(r.part, cx, cy, S.hard ? 32 : 44, S.hard ? 10 : 22) || (!S.hard && inBox(r.all, cx, cy, 0, 6)))){ found(); return true; }
    if(r && !seen && !S.hard && inBox(r.part, cx, cy, 26, 12)){ found(); return true; }   // a sliver of him (an ear round a corner) is too little to count as seen, but a tap right on it still finds him
    for(const m of STEPS){ if(!m.visible) continue; const s = scr(m.position); if(s && Math.hypot(cx - s.x, cy - s.y) < Math.max(44, s.px * 1.15) && clearTo(anchor, m.position, .3)){ tapRing(cx, cy); walkTo(m.userData.to); return true; } }
    tapRing(cx, cy); snd('tap'); S.miss++;
    if(r && r.part && inBox(r.part, cx, cy, 150, 110)){ toast('Very close. He is right by there.', 1800); return true; }
    if(S.miss === 3 || S.miss % 6 === 0) toast(S.hard ? 'Not there. Keep looking.' : 'Not there. Turn until the paws light up.', 2600); return true; };

  /* ---------- every frame ---------- */
  const WARMTXT = ['', 'Cold', 'Warmer', 'Warm', 'Very warm', 'Right there'];
  let lastWarm = -1, lastStuck = false, blinkAt = 0, raf = 0, clockSec = -1;
  function frame(t){ if(dead) return; raf = requestAnimationFrame(frame);
    try{ if(walk && walk.t0){ const o = walk, k = Math.min(1, (t - o.t0) / o.dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; anchor.lerpVectors(o.from, o.to, e); aim(o.yaw, o.pitch); if(k >= 1) o.land(); }
      else if(tw){ const k = Math.min(1, (t - tw.t0) / tw.dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, o = tw; aim(o.y0 + o.dy * e, o.p0 + (o.p1 - o.p0) * e); if(k >= 1 && tw === o) tw = null; } pin(); }catch(e){}
    if(!S.on) return;
    if(S.hard && S.mode !== 'done'){ const sec = Math.floor((t - S.t0) / 1000); if(sec !== clockSec){ clockSec = sec; const ck = $('#fndClock'); if(ck) ck.textContent = fmtT(sec); } }
    if(t < bubbleUntil){ const s = scr(_a.copy(headPt()).setY(CAT.position.y + CH * 1.08)); if(s){ bubble.style.left = clamp(s.x, 150, innerWidth - 150) + 'px'; bubble.style.top = Math.max(120, s.y) + 'px'; bubble.classList.add('on'); } } else bubble.classList.remove('on');
    if(S.mode !== 'seek' || !CAT.visible){ ring.classList.remove('on'); return; }
    if(t > blinkAt){ const shut = CAT.material.map === TEX.open; CAT.material.map = shut ? TEX.shut : TEX.open; blinkAt = t + (shut ? 140 : 2400 + Math.random() * 2600); }
    const pulse = 1 + .07 * Math.sin(t / 260); for(const m of STEPS) if(m.visible) m.scale.set(pulse, pulse, 1);
    /* the paw meter: one or two paws when you face away, three when you face him, four and five once the part of him that shows is on the screen.
       Facing him from a place where nothing of him shows reads "Try walking", and the walk button glows. */
    const barTop = $('#fndBar').getBoundingClientRect().top; warm.style.bottom = Math.round(innerHeight - barTop + 8) + 'px';   // the meter floats just above the bar as its own layer, so the page's notice pill steps clear of it
    const v = cur(), seen = v.n >= SEEN(), hs = seen ? scr(aimPt()) : null, inView = !!hs && Math.abs(hs.nx) < .94 && hs.ny < .94 && hs.y < barTop - 12, ry = relYaw(), ang = Math.abs(ry);
    const w = S.step === 0 ? 5 : inView ? (Math.abs(hs.nx) < .5 ? 5 : 4) : ang < .7 ? 3 : ang < 1.6 ? 2 : 1, stuck = S.step > 0 && !seen && ang < .7 && !walk && ROOM[room()].v.length > 1;
    if(S.step > 0 && !S.turned && Math.abs(wrap(facing().yaw - S.open)) > .3) S.turned = true;
    if(w !== lastWarm || stuck !== lastStuck){ lastWarm = w; lastStuck = stuck; warm.querySelectorAll('i').forEach((p, i) => p.classList.toggle('on', i < w)); warm.querySelector('em').textContent = stuck ? 'Try walking' : w === 3 && hs && Math.abs(hs.nx) < .6 ? (hs.ny < 0 ? 'Look down' : 'Look up') : WARMTXT[w]; if(!S.hard){ if(stuck) nudge('walk'); else $('#fndW').classList.remove('nudge'); } }
    if(inView){ if(!S.tSeen) S.tSeen = t; edge.classList.remove('on'); } else S.tSeen = 0;
    // his bell comes from his side of the room, and a little more often the closer you are to looking at him
    if(t - S.tMeow > (S.step === 0 ? 5200 : [0, 8500, 7000, 5600, 4300, 3500][w])){ S.tMeow = t; snd(Math.random() < .2 ? 'mrrp' : 'bell', {pan: panOf(), vol: w >= 4 ? 1 : .8});
      if(!S.hard && !inView && !stuck && S.step > 0 && t - S.tSeek > 12000){ edge.className = ry > 0 ? 'l on' : 'r on'; later(() => edge.classList.remove('on'), 1700); } }
    if(!S.hard && S.step > 0){
      if(S.step === 1 && !S.taught && !S.turned && t - S.tSeek > 10000){ S.taught = true; toast('Tap an arrow to turn around.', 3800); nudge('turn', 5000); }
      // small players never get stuck: he wiggles when he is on the screen and not spotted, and after a while the game shows him
      if(inView && S.tSeen && t - S.tSeen > 7000 && t - S.tWig > 7000){ S.tWig = t; hop(.45, 420); snd('bell', {pan: panOf(), vol: .9}); }
      if(t - S.tSeek > 45000 && t - S.tHint > 20000 && t - S.tAct > 2500) help(true); }
    if(t < ringUntil && inView){ const b = catRect().part, r = b ? clamp(Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 16, 44, 130) : 60; ring.style.width = ring.style.height = r * 2 + 'px'; ring.style.margin = -r + 'px 0 0 ' + -r + 'px'; ring.style.left = (b ? (b.x0 + b.x1) / 2 : hs.x) + 'px'; ring.style.top = (b ? (b.y0 + b.y1) / 2 : hs.y) + 'px'; ring.classList.add('on'); } else ring.classList.remove('on'); }
  function hop(hgt, ms, cb){ if(reduce){ cb && cb(); return; } const y0 = S.P.y, t0 = performance.now(); (function f(){ if(dead) return; const k = (performance.now() - t0) / ms; if(k >= 1){ CAT.position.y = y0; CAT.scale.set(CW, CH, 1); cb && cb(); return; } const a = Math.sin(k * Math.PI); CAT.position.y = y0 + a * hgt; CAT.scale.set(CW * (1 + .06 * a), CH * (1 + .1 * a), 1); requestAnimationFrame(f); })(); }
  function say(text, ms){ bubble.textContent = text; bubbleUntil = performance.now() + ms; }

  /* ---------- found him ---------- */
  function found(){ if(S.mode !== 'seek') return; S.mode = 'react'; const last = S.step === 4, id = room(), R = ROOM[id], key = id + '.' + S.spot.i; ring.classList.remove('on'); ringUntil = 0; edge.classList.remove('on'); toastE.classList.remove('on'); hideSteps(); nudge(null); ui();
    CAT.material.map = TEX.open; snd('mrrp'); snd('purr', {at: .3, len: last ? 5.5 : 2.8}); if(!last) snd('find', {step: S.step, at: .16}); ga('find_cat', {step: S.step, room: id, spot: S.spot.i, view: S.view});
    if(S.spot.i >= 0 && !S.got.includes(key)){ S.got.push(key); if(!SV.spots[key]){ SV.spots[key] = DAY; S.fresh++; } save(); }   // every place you find him in goes in the collection
    const slot = document.querySelectorAll('#fndTray .slot')[S.step]; if(slot){ slot.classList.add('got', 'pop'); later(() => slot.classList.remove('pop'), 600); }
    lookAtPoint(_v.copy(S.P).setY(S.P.y + CH * .7), 500);
    if(last) return finale();
    say(R.say, 1900); hop(1.1, 520, () => hop(.5, 380)); later(() => { try{ S.path = runPath(anchor, S.P, R.fy, R.open); }catch(e){ S.path = null; } runAway(() => later(clue, 350)); }, 1900); }
  function runAway(cb){ const path = S.path; CAT.visible = false; bubbleUntil = 0;
    if(!path || reduce){ if(path){ let side = 1; for(let i = 0; i < path.length; i++){ const q = path[i], p = i ? path[i - 1] : S.P; addPrint(q, Math.atan2(q.x - p.x, q.z - p.z), side); side = -side; } } return cb(); }
    const pts = [S.P.clone()].concat(path), seg = []; let total = 0; for(let i = 1; i < pts.length; i++){ const L = pts[i].distanceTo(pts[i - 1]); seg.push(L); total += L; }
    const dur = clamp(total * 95, 700, 1400), t0 = performance.now(), yaw = Math.atan2(pts[pts.length - 1].x - pts[1].x, pts[pts.length - 1].z - pts[1].z) || 0, hopDown = pts[0].y - pts[1].y > .3;
    cam.getWorldDirection(_d); const across = (-_d.z) * Math.sin(yaw) + _d.x * Math.cos(yaw), right = across > 0, away = _d.x * Math.sin(yaw) + _d.z * Math.cos(yaw) > .8 && Math.abs(across) < .55;   // to the right of the screen, or straight away from you?
    for(const k of ['runA', 'runB']){ TEX[k].repeat.x = right ? 1 : -1; TEX[k].offset.x = right ? 0 : 1; }
    const FA = away ? TEX.backA : TEX.runA, FB = away ? TEX.backB : TEX.runB; if(away) RUN.scale.set(1.5, 1.88, 1); else RUN.scale.set(2.25, 1.2, 1);
    RUN.material.map = FA; RUN.material.opacity = 1; RUN.material.color.copy(CAT.material.color); RUN.visible = true; snd('patter', {n: Math.round(dur / 85)}); let laid = 0, side = 1;
    (function f(){ if(dead) return; const k = Math.min(1, (performance.now() - t0) / dur); let dist = k * total, i = 0; while(i < seg.length - 1 && dist > seg[i]){ dist -= seg[i]; i++; }
      const u = seg[i] ? dist / seg[i] : 1; RUN.position.lerpVectors(pts[i], pts[i + 1], u); if(i === 0 && hopDown) RUN.position.y += Math.sin(u * Math.PI) * .7;
      RUN.material.map = Math.floor(k * dur / (away ? 130 : 105)) % 2 ? FB : FA; RUN.material.opacity = k > .82 ? (1 - k) / .18 : 1;
      const done = k * total - (hopDown ? seg[0] : 0); while(laid * .85 < done - .5 && laid < 40){ const dd = laid * .85 + (hopDown ? seg[0] : 0); let j = 0, r = dd; while(j < seg.length - 1 && r > seg[j]){ r -= seg[j]; j++; } addPrint(_a.lerpVectors(pts[j], pts[j + 1], seg[j] ? r / seg[j] : 1), Math.atan2(pts[j + 1].x - pts[j].x, pts[j + 1].z - pts[j].z), side); side = -side; laid++; }
      if(k < 1) requestAnimationFrame(f); else { RUN.visible = false; cb(); } })(); }

  /* ---------- the Snowball cam: a detail of the room he ran to, and three rooms to choose from ----------
     The clue is fair by construction: the detail is cut from the photo of the room he is in (no two rooms use the same photo) and is of something only that
     photo has; the three choices never include two rooms with a group in common (rooms that share a space, whose photos show each other, or that look alike,
     as the three bedrooms do); and the room you are standing in is not offered. FINDCAT.dev.clues() deals every combination and checks them. */
  const clash = (a, b) => ROOM[a].grp.some(t => ROOM[b].grp.includes(t));
  function pickClue(next, here, R){ const pool = Object.keys(ROOM).filter(k => k !== next && k !== here && stopOf(k) && !clash(k, next)).map(k => [R(), k]).sort((a, b) => a[0] - b[0]).map(a => a[1]), decoys = [];
    for(const k of pool){ if(decoys.length === 2) break; if(decoys.every(d => !clash(d, k))) decoys.push(k); }
    const cams = ROOM[next].cam; return {opts: [next].concat(decoys).map(k => [R(), k]).sort((a, b) => a[0] - b[0]).map(a => a[1]), c: cams[Math.floor(R() * cams.length)]}; }
  function camHTML(k, c){ const rm = ROOM[k], Z = S.hard ? 4.2 : 3, w = Z * 100, h = Z * rm.ar * 100;
    const left = clamp(50 - c[0] * w, 100 - w, 0), top = clamp(50 - c[1] * h, 100 - h, 0);
    const st = `style="width:${w}%;left:${left.toFixed(1)}%;top:${top.toFixed(1)}%"`;
    return `<div class="fndCam"><img src="${rm.photo}" alt="" ${st}>${rm.big ? `<img src="${rm.big}" alt="" ${st}>` : ''}${IC.ears}</div>`; }
  function clue(){ if(dead) return; S.mode = 'clue'; ui(); saveRun('clue'); const next = S.trail[S.step + 1], first = S.step === 0, q = pickClue(next, room(), stepR(2)), sees = S.hard ? '' : ` He can see ${esc(q.c[2])}.`;
    const c = put(el('div', {id: 'fndCard', class: 'clue', role: 'dialog', 'aria-label': 'Where did Snowball go?'}, `<div class="c"><h2>Where did he go?</h2>
      <div class="camrow">${camHTML(next, q.c)}<p>${first ? 'He ran off. This is his view right now.' : 'Gone again. This is his view now.'}${sees} <b>Tap the room he is in.</b></p></div>
      <div class="picks">${q.opts.map(k => `<button type="button" data-k="${k}"><img src="${ROOM[k].photo}" alt=""${ROOM[k].fit ? ` style="object-position:${ROOM[k].fit}"` : ''}><span>${esc(ROOM[k].name)}</span></button>`).join('')}</div></div>`));
    c.querySelectorAll('.picks button').forEach(b => b.onclick = () => { if(b.dataset.k !== next){ b.classList.add('no'); b.disabled = true; S.wrong++; snd('wrong'); c.querySelector('.camrow p').innerHTML = 'Not that room. Find what he sees in one of the other photos. <b>Tap that room.</b>'; return; }
      b.classList.add('yes'); snd('right'); c.querySelectorAll('button').forEach(x => x.disabled = true); later(() => { c.remove(); S.step++; travel(room(), false, arrive); }, 500); }); }

  /* ---------- the last room: he gives up ---------- */
  function confetti(){ if(reduce) return; const cols = ['#e0862a', '#9b2c3c', '#2d5a3e', '#e8b84a', '#3b6fd8', '#f6f5f1']; for(let i = 0; i < 70; i++){ const c = put(el('i', {class: 'fndConf'})); c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length]; c.style.animationDuration = 1.6 + Math.random() * 1.8 + 's'; c.style.animationDelay = Math.random() * .5 + 's'; later(() => c.remove(), 4200); } }
  function hearts(){ if(reduce) return; for(let i = 0; i < 5; i++) later(() => { const s = scr(headPt()); if(!s) return; const h = put(el('i', {class: 'fndHeart'}, '&#9829;')); h.style.left = s.x + (Math.random() * 60 - 30) + 'px'; h.style.top = s.y - 20 + 'px'; later(() => h.remove(), 1500); }, i * 260); }
  function finale(){ const secs = (performance.now() - S.t0) / 1000, id = S.trail[4]; snd('fanfare', {at: .2}); confetti(); hearts(); say('You found me. Now it is dinner time.', 2600); hop(1.2, 560, () => hop(.7, 420, () => hop(.35, 320)));
    let first = false; if(S.daily && SV.last !== DAY){ first = true; const y = new Date(now); y.setDate(y.getDate() - 1); SV.streak = SV.last === ymd(y) ? (SV.streak || 0) + 1 : 1; SV.last = DAY; }
    SV.total = (SV.total || 0) + 1; save(); store.set(RUNKEY, null); ga('find_found', {secs: Math.round(secs), daily: S.daily, hard: S.hard, wrong: S.wrong, helps: S.helps, room: id, spot: S.spot.i, fresh: S.fresh});
    later(() => { S.mode = 'done'; ui(); finishCard(secs, first); }, 2700); }
  // the game's own page, on whatever copy of the site this is (118hillside.com, or a preview mirror under a sub-path)
  const SITE = (() => { const m = /githack/.test(location.host) ? location.pathname.match(/^(\/[^\/]+\/[^\/]+\/[^\/]+)\//) : location.pathname.match(/^(.*)\/(tour|thanksgiving|halloween|games|woodside)\//); return m ? m[1] : ''; })();
  const gameURL = () => location.origin + SITE + '/games/snowball/' + (SITE ? 'index.html' : '');
  function finishCard(secs, first){ const id = S.trail[4], where = S.spot.s.n + (S.spot.i >= 0 && !S.spot.s.n.includes(ROOM[id].name.toLowerCase()) ? ', ' + ROOM[id].at : ''), clean = !S.wrong && !S.helps, got = Object.keys(SV.spots).filter(k => { const q = k.split('.'); return ROOM[q[0]] && ROOM[q[0]].spots[+q[1]]; }).length, streak = SV.streak || 0, done = SV.last === DAY;
    const medal = S.hard ? (clean && secs < 150 ? 'Gold medal. No help, no wrong rooms, and fast.' : clean ? 'Silver medal. No help and no wrong rooms.' : 'Bronze medal. You beat sneaky mode.') : '';
    const c = put(el('div', {id: 'fndCard', role: 'dialog', 'aria-label': 'You found Snowball'}, `<div class="c fin"><div class="cat">${window.SNOWBALL.svg({id: 'sbw', seed: 7, wear: WEAR, bell: BELL})}</div><h2>You found Snowball</h2>
      <p>He was ${esc(where)}. Dinner is served.${medal ? ' ' + medal : clean ? ' You never needed a hint.' : ''}</p>
      <div class="stats"><div><b>${fmtT(secs)}</b><span>${S.daily ? "today's trail" : 'this trail'}</span></div><div><b>${streak}</b><span>${streak === 1 ? 'day in a row' : 'days in a row'}</span></div><div><b>${got} of ${ALLSPOTS}</b><span>hiding places found</span></div></div>
      <p class="book"><i><u style="width:${Math.max(2, Math.round(got / ALLSPOTS * 100))}%"></u></i>${S.fresh ? (S.fresh === 1 ? 'One new hiding place' : S.fresh + ' new hiding places') + ' on this trail. ' : 'No new hiding places this time. '}${first ? 'That was today’s trail. He hides somewhere new tomorrow.' : S.daily ? '' : done ? 'Today’s trail is done, so this one was for practice.' : 'This one was for practice.'}</p>
      <div class="cta"><b>This house is real, and it is for sale.</b><span>118 Hillside Drive, Woodside. Six bedrooms, three baths, and every room Snowball just ran through.</span><a class="fndBtn primary" href="/#contact" id="fndSee">See it in person</a></div>
      <button class="fndBtn next" type="button" id="fndAgain">Play a new trail</button><button class="fndBtn" type="button" id="fndShare">Share this game</button><a class="fndBtn" href="/games/">More games</a><a class="fndBtn" href="/tour/">Explore the house</a></div>`));
    $('#fndAgain').focus(); $('#fndSee').onclick = () => ga('find_cta', {cta: 'see_in_person'});
    $('#fndAgain').onclick = () => { c.remove(); S.daily = false; begin(Math.floor(Math.random() * 1e9)); };
    $('#fndShare').onclick = async e => { const b = e.currentTarget, url = gameURL(), n = S.got.length, text = `Where's Snowball? I found the cat in ${n === 1 ? 'one hiding place' : n + ' hiding places'} around a real house in ${fmtT(secs)}${S.daily ? ', on today’s trail' : ''}. He hides somewhere new every day.`; ga('find_share');
      const say2 = (label, msg) => { b.textContent = label; toast(msg, 3200); later(() => { b.textContent = 'Share this game'; }, 3200); };
      try{ if(navigator.share){ await navigator.share({title: "Where's Snowball?", text, url}); say2('Shared', 'Shared. Thank you.'); return; } }catch(err){ if(err && err.name === 'AbortError') return; }
      try{ await navigator.clipboard.writeText(text + ' ' + url); say2('Link copied', 'Copied. Paste it in a message to a friend.'); }
      catch(err){ let i = c.querySelector('.link'); if(!i){ i = el('input', {class: 'link', readonly: '', 'aria-label': 'Link to this game', value: url}); b.parentNode.appendChild(i); } i.focus(); i.select(); try{ i.scrollIntoView({block: 'nearest'}); }catch(e2){}
        let ok = false; try{ ok = document.execCommand('copy'); }catch(e2){} if(ok) say2('Link copied', 'Copied. Paste it in a message to a friend.'); else toast('Here is the link. Copy it and send it to a friend.', 5000); } }; }

  /* ---------- start ---------- */
  function begin(seed, saved){ document.documentElement.classList.toggle('fnd-hard', S.hard); S.dev = false; newTrail(seed); S.on = true; document.documentElement.classList.add('fnd-on'); S.mode = 'travel'; lastWarm = -1;
    if(saved){ S.trail = saved.trail; S.step = saved.step; S.wrong = saved.wrong || 0; S.helps = saved.helps || 0; S.fresh = saved.fresh || 0; S.got = saved.got || []; preload(); }
    S.t0 = performance.now() - (saved ? saved.ms || 0 : 0); ui();
    travel(room(), true, () => { if(!saved) S.t0 = performance.now(); if(saved && saved.phase === 'clue'){ SP = soupFor(room()); S.spot = {s: ROOM[room()].spots[0], i: -1}; ui(); later(clue, 500); } else arrive(); });
    ga(saved ? 'find_resume' : 'find_start', {daily: S.daily, hard: S.hard, step: S.step}); }
  function startCard(){ const sv = savedRun(), rm = sv && ROOM[sv.trail[sv.step]];
    const c = put(el('div', {id: 'fndCard', role: 'dialog', 'aria-label': "Where's Snowball?"}, `<div class="c"><div class="cat">${window.SNOWBALL.svg({id: 'sbs', seed: 7, wear: WEAR, bell: BELL})}</div><h2>Where's Snowball?</h2>
      <p>${sv ? `You were ${esc(rm.at)}, and you have found him ${sv.step + (sv.phase === 'clue' ? 1 : 0)} of 5 times.` : 'Dinner is ready, but Snowball wants to play hide and seek first. Find him in five rooms of this house.'}</p>
      <ul class="how"><li>${IC.look}Turn and walk to look around the room</li><li>${PAWSVG()}Tap Snowball when you spot him</li><li>${IC.photo}His photo shows where he ran next</li></ul>
      <button class="fndBtn big" type="button" id="fndGo">${sv ? 'Keep looking' : 'Start looking'}</button>${sv ? '<button class="fndBtn" type="button" id="fndOver">Start a new trail</button>' : ''}
      <div class="opt">${sv ? '' : `<button type="button" id="fndHard" aria-pressed="${S.hard}">Sneaky mode</button>`}<button type="button" class="fndSnd" id="fndSnd2">${IC.snd}<span></span></button></div>
      <p class="sub" id="fndSub"></p></div>`));
    const sub = () => { $('#fndSub').textContent = sv ? '' : S.hard ? 'Sneaky mode: only his ears or his tail show, nothing lights up, and there is a medal for speed.' : SV.streak > 1 && SV.last ? `You have found him ${SV.streak} days in a row.` : dailyDone ? 'You finished today’s trail. This one is for practice.' : 'He hides somewhere new every day. Listen for the bell on his collar.'; }; sub();
    const fresh = () => { S.daily = !dailyDone && !Q.get('seed'); begin(Q.get('seed') ? +Q.get('seed') : S.daily ? dayNum * 7919 + 13 : Math.floor(Math.random() * 1e9)); };
    $('#fndGo').focus(); $('#fndSnd2').onclick = () => { ac(); setMute(!SV.mute); snd('bell'); }; setMute(SV.mute); if($('#fndHard')) $('#fndHard').onclick = e => { S.hard = !S.hard; SV.hard = S.hard; save(); e.currentTarget.setAttribute('aria-pressed', String(S.hard)); sub(); };
    $('#fndGo').onclick = () => { c.remove(); ac(); if(sv){ S.daily = !!sv.daily; S.hard = !!sv.hard; begin(sv.seed, sv); } else fresh(); };
    if($('#fndOver')) $('#fndOver').onclick = () => { c.remove(); ac(); store.set(RUNKEY, null); if(Q.get('hard') == null) S.hard = !!SV.hard; fresh(); }; }
  // the tour's own keys (arrows and space step through tour stops, letters walk) must never reach the engine while the game is up
  function onKey(e){ if(dead || e.metaKey || e.ctrlKey || e.altKey) return; const t = e.target, on = t && t.closest ? t : null, inCard = on && on.closest('#fndCard'), onBtn = on && on.closest('button,a[href],input,textarea,select');
    if(e.type === 'keydown' && S.on && !inCard){ if(e.key === 'ArrowLeft' || /^a$/i.test(e.key)) turn(1); else if(e.key === 'ArrowRight' || /^d$/i.test(e.key)) turn(-1); else if(e.key === 'ArrowUp' || /^w$/i.test(e.key)){ if(S.step > 0) walkTo(S.view + 1); } else if(/^h$/i.test(e.key)) help(); }
    e.stopImmediatePropagation(); if(/^Arrow|^ $|^Page|^Home$|^End$/.test(e.key) && !inCard && !(onBtn && e.key === ' ')) e.preventDefault(); }
  const onDown = e => { if(e.target === H.canvas){ tw = null; S.tAct = performance.now(); } try{ if(AC && AC.state === 'suspended' && !document.hidden) AC.resume(); }catch(err){} };
  function boot(){ try{ H.asBuilt && H.asBuilt(); H.setTOD('golden'); }catch(e){} if(Q.get('hard')) S.hard = Q.get('hard') === '1';
    addEventListener('keydown', onKey, true); addEventListener('keyup', onKey, true); addEventListener('pointerdown', onDown, true); document.addEventListener('visibilitychange', onVis);
    makeArt(() => { if(dead) return; buildUI(); raf = requestAnimationFrame(frame);
      const intro = document.getElementById('intro28'); if(intro){ const mo = new MutationObserver(() => { if(!document.getElementById('intro28')){ mo.disconnect(); if(!dead) startCard(); } }); mo.observe(document.body, {childList: true}); } else startCard(); }); }
  // start only once the engine is really drawing frames (the loading card can read "done" a moment before the first render)
  (function wait(n){ if(dead) return; let fr = 0; try{ fr = H.renderer.info.render.frame; }catch(e){} const ld = document.getElementById('loading'), up = ld && !ld.classList.contains('done');
    if((fr > 8 && !up) || n > 240) later(boot, 700); else later(() => wait(n + 1), 250); })(0);
  function destroy(){ dead = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); clearTimeout(tt); clearTimeout(nudgeT); try{ if(AC) AC.close(); }catch(e){} document.removeEventListener('visibilitychange', onVis);
    removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKey, true); removeEventListener('pointerdown', onDown, true); if(H.scene.onBeforeRender === myOBR) H.scene.onBeforeRender = prevOBR; H.hooks.click = null;
    clearPrints(); OBJ.forEach(o => H.scene.remove(o)); DOM.forEach(e => e.remove()); document.querySelectorAll('.fndConf,.fndHeart,.fndTap,#fndCard').forEach(e => e.remove()); if(styleE) styleE.remove(); document.documentElement.classList.remove('fnd', 'fnd-hard', 'fnd-on'); window.FINDCAT = null; }

  /* ---------- checks (FINDCAT.dev): the same sight test the game plays with, run over every room, standing place and hiding place ----------
     await audit() goes to each room in turn (so the lens is the real one for this screen) and reports, for each hiding place: what share of him shows
     from each standing place; the view you arrive with, and how many points of him are on the screen in it (must be none); and, from the place you
     would spot him, the size on screen of the part that shows and of its tap target. Also every standing place: the floor under it, the nearest
     wall or furniture, and whether the walk to the others is a glide or a blink. Run it at a desktop size and again at a phone size. */
  async function audit(opt){ opt = opt || {}; const rc = H.canvas.getBoundingClientRect(), rows = [], bad = [], sum = {screen: Math.round(rc.width) + 'x' + Math.round(rc.height), rooms: 0, places: 0, spots: 0, seenOnArrival: 0, needWalk: 0, byHow: {}}, pc = PC, pose = poseAt; S.dev = true;
    const shown = (V, P) => MASK.filter(([u, v]) => { const q = onCat(V, P, u, v, _a), dx = q.x - V.x, dy = q.y - V.y, dz = q.z - V.z, D = Math.hypot(dx, dy, dz); return hit(V.x, V.y, V.z, dx / D, dy / D, dz / D, D - .12, true) === Infinity; });
    document.querySelectorAll('#fndCard').forEach(e => e.remove());
    for(const id of opt.rooms || Object.keys(ROOM)){ const R = ROOM[id]; if(!stopOf(id)) continue; await new Promise(res => travel(id, true, res)); SP = soupFor(id); PX = null; sum.rooms++;
      const eyes = R.v.map((v, i) => eyeOf(R, i)), wide = Math.round(hHalf() * 360 / Math.PI);
      eyes.forEach((V, i) => { sum.places++; const fl = hit(V.x, V.y, V.z, 0, -1, 0, 9); let near = 99; for(let k = 0; k < 16; k++){ const a = k * Math.PI / 8; near = Math.min(near, hit(V.x, V.y, V.z, Math.sin(a), 0, Math.cos(a), 30), hit(V.x, R.fy + 1.2, V.z, Math.sin(a), 0, Math.cos(a), 30)); }
        const row = `${id} place ${i}: floor ${fl.toFixed(2)} ft under the eye, nearest thing ${near.toFixed(1)} ft, walks ${eyes.map((W, j) => j === i ? '-' : clearTo(V, W, .1) ? 'glide' : 'blink').join('/')}, lens ${wide} deg across`; rows.push(row);
        if(Math.abs(fl - EYE) > .2) bad.push(row + ' !! NOT-ON-THE-FLOOR'); if(near < .9) bad.push(row + ' !! TOO-CLOSE'); });
      R.spots.forEach((s, i) => { sum.spots++; setProp(s); const P = new THREE.Vector3(s.p[0], s.p[1], s.p[2]), q = seeAll(R, P), b = q.vs[q.best], V0 = eyes[0], Vb = eyes[q.best], flags = [], how = 'd' + s.d + (s.w ? 'w' : ''); sum.byHow[how] = (sum.byHow[how] || 0) + 1;
        if(!(hit(P.x, P.y + .5, P.z, 0, -1, 0, 3) < .75)) flags.push('NOTHING-UNDER-HIM'); if(b.n < 6) flags.push('TOO-HIDDEN'); if(id !== 'entry' && !!s.w !== (q.vs[0].n < 6)) flags.push(s.w ? 'W-BUT-SEEN-FROM-ARRIVAL' : 'NEEDS-WALK'); if(q.vs[0].n < 6) sum.needWalk++;
        const yaw = id === 'entry' ? yawTo(V0, P) : openingYaw(R, V0, P, q.vs[0]); pose(V0, yaw, PITCH0); let n0 = 0; for(const [u, v] of shown(V0, P)){ _b.copy(onCat(V0, P, u, v, _a)).project(pc); if(_b.z < 1 && Math.abs(_b.x) < 1 && Math.abs(_b.y) < 1) n0++; }
        if(n0 && id !== 'entry'){ sum.seenOnArrival++; flags.push('IN-OPENING-VIEW'); }
        const c = onCat(Vb, P, b.cu, b.cv, new THREE.Vector3()), dx = c.x - Vb.x, dz = c.z - Vb.z; pose(Vb, yawTo(Vb, P), PITCH0); const tilt = id !== 'entry' && !inPicture(c, .9) ? ' (the game tilts the view to him)' : ''; if(tilt) sum.tilts = (sum.tilts || 0) + 1; pose(Vb, Math.atan2(dx, dz), clamp(Math.atan2(c.y - Vb.y, Math.hypot(dx, dz)), -.6, .35)); let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
        for(const [u, v] of [[b.u0, b.v0], [b.u1, b.v0], [b.u0, b.v1], [b.u1, b.v1]]){ _b.copy(onCat(Vb, P, u, v, _a)).project(pc); x0 = Math.min(x0, _b.x); x1 = Math.max(x1, _b.x); y0 = Math.min(y0, _b.y); y1 = Math.max(y1, _b.y); }
        const pw = (x1 - x0) / 2 * rc.width, ph = (y1 - y0) / 2 * rc.height; if(sizeOn(q) < 12) flags.push('TINY'); const note = sizeOn(q) < 22 ? ' (sneaky mode only at this screen size)' : ''; if(note) sum.sneakyOnly = (sum.sneakyOnly || 0) + 1; if(Math.abs((x0 + x1) / 2) > .94 || Math.abs((y0 + y1) / 2) > .94) flags.push('OFF-SCREEN-WHEN-SHOWN');
        const row = `${id}.${i} ${how}${s.box ? ' box' : ''} "${s.n}" | shows ` + q.vs.map((x, j) => `${Math.round(x.f * 100)}% head ${Math.round(x.head * 100)}% @${x.d.toFixed(0)}ft`).join(', ') + ` | spot from place ${q.best} | arrive facing ${Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360)}, ${n0} pts on screen | shows ${Math.round(pw)}x${Math.round(ph)} px, tap ${Math.round(Math.max(88, pw + 44))}x${Math.round(Math.max(88, ph + 44))}` + note + tilt + (flags.length ? ' !! ' + flags.join(' ') : '');
        rows.push(row); if(flags.length) bad.push(row); }); }
    setProp(null); return {ok: !bad.length, sum, bad, rows}; }
  // every clue the game can deal: each pair of rooms it is in and runs to, many shuffles; none may offer two rooms of a group, a wrong number of choices, or the room you are in
  function clues(n){ const R = rng(20261111), bad = [], photos = {}, seen = {}; let cards = 0; for(const k in ROOM){ if(photos[ROOM[k].photo]) bad.push('two rooms use the photo ' + ROOM[k].photo); photos[ROOM[k].photo] = k; if(!ROOM[k].cam.length) bad.push(k + ' has no cam detail'); }
    for(let i = 0; i < (n || 40); i++) for(const here of Object.keys(ROOM)) for(const next of POOL){ if(next === here) continue; const q = pickClue(next, here, R), o = q.opts; cards++; o.forEach(k => { seen[k] = (seen[k] || 0) + 1; });
        if(o.length !== 3 || new Set(o).size !== 3 || !o.includes(next) || o.includes(here) || clash(o[0], o[1]) || clash(o[0], o[2]) || clash(o[1], o[2]) || !ROOM[next].cam.includes(q.c)) bad.push(here + ' -> ' + next + ': ' + q.opts.join(', ')); }
    return {ok: !bad.length, cards, bad: bad.slice(0, 20), offered: seen}; }
  // stand at the view you arrive with ('open') or where you would spot him ('spot') for one hiding place; resolves once you are there
  function show(roomId, i, which){ return new Promise(res => { document.querySelectorAll('#fndCard').forEach(e => e.remove()); S.on = S.dev = true; document.documentElement.classList.add('fnd-on'); S.daily = false; S.seed = 1; S.trail = ['entry', roomId, roomId, roomId, roomId]; S.step = roomId === 'entry' ? 0 : 1; S.force = i; S.t0 = performance.now();
      travel(roomId, true, () => { arrive(); toastE.classList.remove('on'); if(which === 'spot' && S.step > 0){ anchor.copy(eyeOf(ROOM[roomId], S.best)); S.view = S.best; lookAtPoint(aimPt(), 0); placeSteps(); } later(() => res(where()), 700); }); }); }
  const where = () => { const r = S.mode === 'seek' && CAT && CAT.visible ? catRect() : null, v = cur(), b = r && r.part; return {room: room(), step: S.step, mode: S.mode, spot: S.spot && S.spot.i, name: S.spot && S.spot.s.n, place: S.view, spotFrom: S.best, shows: +v.f.toFixed(2), turn: +(relYaw() * 180 / Math.PI).toFixed(0), onScreen: S.mode === 'seek' && onScreen(),
    rect: b ? {x: Math.round((b.x0 + b.x1) / 2), y: Math.round((b.y0 + b.y1) / 2), w: Math.round(b.x1 - b.x0), h: Math.round(b.y1 - b.y0)} : null}; };
  window.FINDCAT = {S, ROOM, SV, help, found, turn, walkTo, destroy, anchor, where,
    dev: {measure, audit, clues, show, pose(){ anchor.copy(eyeOf(ROOM[room()], S.best)); S.view = S.best; lookAtPoint(aimPt(), 0); placeSteps(); return where(); }, kit: () => AK, go(roomId, i){ document.querySelectorAll('#fndCard').forEach(e => e.remove()); ac(); S.on = S.dev = true; document.documentElement.classList.add('fnd-on'); S.daily = false; S.seed = Math.floor(Math.random() * 1e6); S.trail = ['entry', roomId, roomId, roomId, roomId]; S.step = 1; S.force = i; S.t0 = performance.now(); travel(roomId, false, arrive); }, spots: () => Object.keys(ROOM).map(k => k + ':' + ROOM[k].spots.length).join(' ')}};
})();

/* preview hosts: when the site is served from a sub-path (a test mirror), point root links like /games/ at that copy; no effect on 118hillside.com */
(function(){ if(window.__siteLinks) return; window.__siteLinks = 1; var m = /githack/.test(location.host) ? location.pathname.match(/^(\/[^\/]+\/[^\/]+\/[^\/]+)\//) : location.pathname.match(/^(.*)\/(tour|thanksgiving|halloween|games|woodside)\//), base = m ? m[1] : ''; if(!base) return;
  document.addEventListener('click', function(e){ var a = e.target && e.target.closest && e.target.closest('a[href]'); if(!a) return; var h = a.getAttribute('href'); if(!h || h.charAt(0) !== '/' || h.charAt(1) === '/' || h.indexOf(base + '/') === 0) return;
    a.setAttribute('href', base + h.replace(/^([^?#]*\/)(?=[?#]|$)/, '$1index.html')); }, true);
})();
