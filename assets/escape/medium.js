/* Locked In at Hillside, Medium: The Missing Treat Tin (main floor and lower level). Loaded by escape.js when the level starts.
   A July afternoon. Snowball's treat tin is gone and four friends are acting strangely. Each has a number: Biscuit's is under him, and he
   only wakes when the sun reaches his bed (raise the great-room shades and move the sun); Clover's is hiding where her plan on the fridge
   says (the front bedroom closet, the one room that opens off the dining table) and she thumps it; Pepper's is written in light through the
   rainbow film in lower-level bedroom 2, but only in the evening sun; Nugget's is under him in the skylit office, with the order of all four,
   and he only wakes after sunset. The four go into the lounge drinks fridge in Nugget's order (4962). The reveal: a birthday party.
   Logic, codes and hints: logic.js (medium). Design: DESIGN.md section 5. */
(function(){
  'use strict';
  window.ESCAPE_LEVELS = window.ESCAPE_LEVELS || {};
  function make(E){
    const {H, THREE, S, has, give, sunIn, door, doorT, shade, shadeT, opening, windowSource, lightPlane, makeStrips, buildPaper, paperLight, prop, paperCanvas, texOf, onFont, petAt, petWalk, yawTo, PETS,
      catAt, say, toast, goTo, examine, back, act, setSlider, sweepTo, sunKey, line, note, NOTES, SND, PAW, esc, lin, wake, clamp, sunDir, rigTravel, rigCut, yp, aspect, fadeThrough, win, finishCard, fmtH, EYE, $} = E;
    const LY = -4.56, LE = LY + EYE, ICON = (who, s) => window.ESC_PETS ? ESC_PETS.icon(who, s) : '';
    const DIG = {biscuit: '6', clover: '4', pepper: '9', nugget: '2'}, ORDER = ['clover', 'pepper', 'biscuit', 'nugget'];

    /* ---------------------------------------------------------------- places */
    const PL = {
      kitchen:  {name: 'Coffee bar', short: 'Coffee bar', floor: 'main', pos: [15.0, EYE, 9.3], face: [20.0, 2.6, 11.6], map: [19.0, 9.6],
        note: 'The coffee bar, with its own drinks fridge, beside the kitchen. The treats live here. Lived here.'},
      great:    {name: 'Great room', floor: 'main', pos: [14.8, EYE, 31.2], face: [11.0, 1.8, 25.0], fov: 58, map: [10.4, 28.2],
        note: 'The dining table and the sitting area share one long room, with large windows along one side.'},
      frontbed: {name: 'Front bedroom', short: 'Front bed', floor: 'main', pos: [19.4, EYE, 33.4], face: [29.0, 4.0, 29.0], map: [23.5, 30.5],
        note: 'The first of three bedrooms on the main level. Its door is a pocket door off the dining area.'},
      hall:     {name: 'Bedroom hall', short: 'Hall', floor: 'main', pos: [23.8, EYE, 10.6], face: [23.8, 4.6, 3.0], map: [23.8, 9.4],
        note: 'A short hall off the kitchen, with a bedroom at each end and the hall bath.'},
      middlebed:{name: 'Middle bedroom', short: 'Middle bed', floor: 'main', pos: [29.8, EYE, 15.6], face: [21.5, 4.2, 19.0], map: [27.0, 19.0],
        note: 'The middle bedroom, at the end of the hall, with a closet behind three sliding doors.'},
      backbed:  {name: 'Back bedroom', short: 'Back bed', floor: 'main', pos: [21.0, EYE, 3.4], face: [24.0, 4.4, -5.0], map: [21.5, -1.0],
        note: 'The back bedroom, at the other end of the hall, staged as a gym and office.'},
      living:   {name: 'Living room', short: 'Living', floor: 'main', pos: [1.8, EYE, -3.6], face: [10, 5.0, -2.9], map: [5.0, -2.5],
        note: 'Fir beams cross the vaulted ceiling. This room is part of the original 1920s house.'},
      entry:    {name: 'Entry', floor: 'main', pos: [-6.0, EYE, -2.2], face: [-14.0, 4.0, -6.5], map: [-6.0, -2.3],
        note: 'The entry, with the stairs off to the side: up to the loft, down to the lower level.'},
      lounge:   {name: 'Bonus lounge', short: 'Lounge', floor: 'lower', pos: [-14.4, LE, -15.6], face: [-22.6, LY + 2.6, -21.4], map: [-16.5, -18.5],
        note: 'The bonus lounge: a big TV, a refreshment counter with its own drinks fridge, and glass doors to the terrace.'},
      office:   {name: 'Skylit office', short: 'Office', floor: 'lower', pos: [-27.3, LE, -11.4], face: [-30.2, LY + 2.4, -7.6], map: [-27.0, -7.5],
        note: 'The skylit office, across the lower entry from the laundry room. Two skylights, and windows on two walls.'},
      lhall:    {name: 'Lower hall', short: 'Lower hall', floor: 'lower', pos: [-18.5, LE, -26.6], face: [-18.5, LY + 4.4, -36.0], map: [-18.5, -30.0],
        note: 'The lower hall: a bedroom at each end and the bath between them.'},
      lbed2:    {name: 'Downstairs bedroom', short: 'Bedroom', floor: 'lower', pos: [-25.2, LE, -27.4], face: [-24.0, LY + 1.0, -37.4], map: [-26.0, -33.0],
        note: 'A bedroom with skylights overhead and rainbow film on the bottom of its window.'}};
    const NODES = {k1: [15.7, 12.4], k2: [15.8, 17.2], g1: [15.2, 26.4], g2: [15.6, 32.4], fb: [17.4, 33.0], kh: [20.3, 9.3], h1: [23.8, 8.3], h2: [23.8, 13.5], hb: [23.8, 5.2],
      a1: [4.4, -4.9], a2: [11.4, -4.9], a3: [12.6, -1.0], a4: [12.75, 5.1], kk: [12.8, 8.4],
      lh0: [-18.5, -25.0], lo1: [-19.5, -19.0]};
    for(const k of ['lh0', 'lo1']) NODES[k][2] = LE;
    const EDGES = [['kitchen', 'k1'], ['k1', 'k2'], ['k2', 'g1'], ['g1', 'great'], ['great', 'g2'], ['g2', 'fb'], ['fb', 'frontbed'], ['kitchen', 'kh'], ['kh', 'h1'], ['h1', 'hall'],
      ['hall', 'h2'], ['h2', 'middlebed'], ['hall', 'hb'], ['hb', 'backbed'], ['kitchen', 'kk'], ['kk', 'a4'], ['a4', 'a3'], ['a3', 'a2'], ['a2', 'a1'], ['a1', 'living'], ['living', 'entry'],
      ['lounge', 'lo1'], ['lo1', 'lh0'], ['lh0', 'lhall'], ['lhall', 'lbed2']];
    const WALKS = {
      kitchen: [{to: 'great', at: [15.8, 1.6, 15.2]}, {to: 'hall', at: [22.2, 3.0, 8.9]}, {to: 'living', at: [12.6, 3.0, 4.2]}],
      great: [{to: 'kitchen', at: [15.5, 3.2, 16.6]}, {to: 'frontbed', at: [17.3, 3.2, 33.0]}],
      frontbed: [{to: 'great', at: [16.6, 3.2, 33.0]}],
      hall: [{to: 'kitchen', at: [22.0, 3.0, 8.6]}, {to: 'middlebed', at: [23.9, 3.0, 14.2]}, {to: 'backbed', at: [23.9, 3.0, 4.6]}],
      middlebed: [{to: 'hall', at: [23.0, 3.0, 13.6]}], backbed: [{to: 'hall', at: [23.9, 3.0, 5.6]}],
      living: [{to: 'kitchen', at: [12.7, 3.3, 4.7]}, {to: 'entry', at: [-3.4, 2.4, -1.6]}],
      entry: [{to: 'living', at: [0.4, 2.6, -3.0]}, {to: 'lounge', label: 'Down the stairs', at: [-12.0, 1.5, -6.0]}],
      lounge: [{to: 'entry', label: 'Up the stairs', at: [-19.0, LY + 3.0, -12.8]}, {to: 'office', at: [-23.0, LY + 3.0, -14.6]}, {to: 'lhall', at: [-18.6, LY + 3.0, -25.4]}],
      office: [{to: 'lounge', at: [-25.0, LY + 3.0, -12.6]}],
      lhall: [{to: 'lounge', at: [-18.6, LY + 3.0, -25.0]}, {to: 'lbed2', at: [-20.4, LY + 3.0, -27.9]}],
      lbed2: [{to: 'lhall', at: [-20.5, LY + 3.0, -27.9]}]};

    /* ---------------------------------------------------------------- drawings */
    // pet icons drawn into canvases (they are tiny SVGs; loaded once)
    const ICONIMG = {};
    function iconImg(who, cb){ if(ICONIMG[who] && ICONIMG[who].ok) return cb && cb(ICONIMG[who].img); const im = ICONIMG[who] = ICONIMG[who] || {img: new Image(), cbs: []}; if(cb) im.cbs.push(cb);
      if(!im.img.src){ im.img.onload = () => { im.ok = true; for(const f of im.cbs) f(im.img); im.cbs = []; }; im.img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ICON(who, 96).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')); } }
    const KEEP = {};   // canvases that redraw when the font or an icon arrives: id -> {draw, mesh}
    function keep(id, w, h, kind, draw, seed){ const make = () => paperCanvas(w, h, kind, draw, seed); const k = KEEP[id] = {make, cv: make()};
      onFont(() => { k.cv = k.make(); if(k.mesh) k.mesh.material.map.image = k.cv, k.mesh.material.map.needsUpdate = true; if(NOTES[id]) NOTES[id].url = ''; });
      return k; }
    const redrawAll = () => { for(const id in KEEP){ const k = KEEP[id]; if(!k || typeof k.make !== 'function') continue; k.cv = k.make(); if(k.mesh){ k.mesh.material.map.image = k.cv; k.mesh.material.map.needsUpdate = true; } if(NOTES[id]) NOTES[id].url = ''; } wake(4); };
    ['biscuit', 'clover', 'pepper', 'nugget'].forEach(w => iconImg(w, () => redrawAll()));
    const face = (x, who, cx, cy, s) => { const I = ICONIMG[who]; if(I && I.ok) x.drawImage(I.img, cx - s / 2, cy - s / 2, s, s); else { x.fillStyle = ESC_PETS.COL[who]; x.beginPath(); x.arc(cx, cy, s * .35, 0, 7); x.fill(); } };
    // Clover's plan of the bedroom wing, drawn from the real rooms (so it matches the house), with a carrot on one closet
    function planCanvas(){ return paperCanvas(1000, 760, 'paper', (x, w, h, ink) => {
      const ids = ['SP-L1-GREAT', 'SP-L1-BED3', 'SP-L1-BED3-CLOSET', 'SP-L1-BED2', 'SP-L1-BED2-CLOSET', 'SP-L1-HALL', 'SP-L1-BATH', 'SP-L1-BED1', 'SP-L1-BED1-CLOSET', 'SP-L1-KITCHEN'];
      const sp = ids.map(id => ({id, p: E.spacePoly(id)})).filter(s => s.p);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for(const s of sp) for(const [a, b] of s.p){ x0 = Math.min(x0, a); x1 = Math.max(x1, a); z0 = Math.min(z0, b); z1 = Math.max(z1, b); }
      // turned so the dining table sits at the bottom and the hall runs up the page, as you'd see it walking in from the kitchen
      // turned like the map in the corner of the screen: the long way of the wing runs across, the windows of the great room at the top
      const k = Math.min((w - 120) / (z1 - z0), (h - 170) / (x1 - x0)), ox = (w - (z1 - z0) * k) / 2, oy = 90 + (h - 170 - (x1 - x0) * k) / 2;
      const P = (a, b) => [ox + (b - z0) * k, oy + (x1 - a) * k];
      for(const s of sp){ const big = !/CLOSET/.test(s.id); ink.line(s.p.concat([s.p[0]]).map(q => P(q[0], q[1])), big ? 9 : 6, big ? '#2a3448' : '#5a6478'); }
      // the dining table and its chairs, in the great room
      const t0 = P(12.8, 19.3), t1 = P(8.6, 23.5); x.lineWidth = 7; x.strokeStyle = '#7a4b22'; x.strokeRect(t0[0], t0[1], t1[0] - t0[0], t1[1] - t0[1]);
      for(const [a, b] of [[9.5, 24.3], [11.6, 24.3], [9.5, 18.5], [11.6, 18.5], [7.8, 21.4], [13.6, 21.4]]){ const c = P(a, b); x.strokeRect(c[0] - 14, c[1] - 14, 28, 28); }
      ink.text('table', (t0[0] + t1[0]) / 2, (t0[1] + t1[1]) / 2, 40, '#7a4b22');
      // the pocket door from the dining area into the front bedroom, drawn as a gap with a little arrow
      const d0 = P(17.2, 32.0), d1 = P(17.2, 34.0), dm = [(d0[0] + d1[0]) / 2, (d0[1] + d1[1]) / 2]; x.fillStyle = '#fdfcf8'; x.fillRect(Math.min(d0[0], d1[0]), dm[1] - 9, Math.abs(d1[0] - d0[0]), 18);
      ink.line([[dm[0], dm[1] + 60], [dm[0], dm[1] - 40]], 6, '#c0392b'); ink.line([[dm[0] - 16, dm[1] - 20], [dm[0], dm[1] - 40], [dm[0] + 16, dm[1] - 20]], 6, '#c0392b');
      // the carrot, on the front bedroom's closet
      const c = P(31.0, 29.0); x.save(); x.translate(c[0], c[1]); x.rotate(-.5); x.fillStyle = '#f08a24'; x.beginPath(); x.moveTo(-14, -36); x.lineTo(14, -36); x.lineTo(0, 46); x.closePath(); x.fill();
      x.strokeStyle = '#b55e10'; x.lineWidth = 3; for(const y of [-20, -4, 12]){ x.beginPath(); x.moveTo(-8, y); x.lineTo(4, y + 4); x.stroke(); }
      x.fillStyle = '#3c9a3c'; for(const a of [-.5, 0, .5]){ x.save(); x.rotate(a); x.beginPath(); x.ellipse(0, -52, 6, 18, 0, 0, 7); x.fill(); x.restore(); } x.restore();
      ink.line([[c[0] - 46, c[1] - 46], [c[0] + 46, c[1] + 46]], 6, '#c0392b'); ink.line([[c[0] + 46, c[1] - 46], [c[0] - 46, c[1] + 46]], 6, '#c0392b');
      ink.text('kitchen', P(11, 10.5)[0], P(11, 10.5)[1], 44, '#5a6478');
      // signed with a rabbit's hind foot
      x.save(); x.translate(w - 110, h - 70); x.rotate(-.3); x.fillStyle = '#5f7f8c'; x.beginPath(); x.ellipse(0, 0, 18, 40, 0, 0, 7); x.fill(); for(const dx of [-12, -4, 4, 12]){ x.beginPath(); x.ellipse(dx, -46, 5, 8, 0, 0, 7); x.fill(); } x.restore();
      ink.text('I’m here. Don’t thump.', 250, 52, 46, '#2a3448'); }, 11); }
    // Biscuit's number: six dog biscuits laid out as a big 6, on a napkin with a party hat doodled in the corner
    function biscuitCanvas(){ return paperCanvas(700, 900, 'card', (x, w, h, ink) => {
      const bone = (cx, cy, a) => { x.save(); x.translate(cx, cy); x.rotate(a); x.fillStyle = '#c98f4e'; x.strokeStyle = '#8a5a26'; x.lineWidth = 4;
        x.beginPath(); x.roundRect ? x.roundRect(-46, -14, 92, 28, 12) : x.rect(-46, -14, 92, 28); x.fill(); x.stroke();
        for(const [dx, dy] of [[-48, -14], [-48, 14], [48, -14], [48, 14]]){ x.beginPath(); x.arc(dx, dy, 15, 0, 7); x.fill(); x.stroke(); } x.restore(); };
      // a 6: a hook over the top and a loop at the bottom, made of biscuits
      const pts = [[470, 170, -.5], [350, 160, .1], [255, 250, 1.1], [235, 380, 1.5], [250, 520, 1.7], [330, 640, .6], [470, 650, -.4], [545, 550, 1.3], [480, 450, 2.6], [340, 450, .2]];
      pts.forEach(p => bone(p[0], p[1], p[2]));
      // party hat in the corner (a clue to the twist)
      x.save(); x.translate(590, 780); x.rotate(.2); x.fillStyle = '#e8506a'; x.beginPath(); x.moveTo(-40, 40); x.lineTo(40, 40); x.lineTo(0, -60); x.closePath(); x.fill();
      x.fillStyle = '#ffd34d'; for(const [dx, dy] of [[-12, 10], [12, -8], [0, 26]]){ x.beginPath(); x.arc(dx, dy, 7, 0, 7); x.fill(); } x.beginPath(); x.arc(0, -64, 12, 0, 7); x.fill(); x.restore();
      ink.text('woof', 120, 820, 52, '#8a5a26'); }, 21); }
    // Nugget's card: four faces in a row, his own number in sunflower seeds, and the lounge fridge with balloons
    function nuggetCanvas(){ return paperCanvas(1000, 720, 'card', (x, w, h, ink) => {
      ORDER.forEach((who, i) => { const cx = 150 + i * 233, cy = 170; x.fillStyle = '#f2ece0'; x.beginPath(); x.arc(cx, cy, 92, 0, 7); x.fill(); face(x, who, cx, cy, 150);
        ink.line([[cx - 70, 300], [cx + 70, 300]], 5, '#8a6a4a'); if(who === 'nugget'){ // his own number: a 2 in sunflower seeds
          const seed = (sx, sy, a) => { x.save(); x.translate(sx, sy); x.rotate(a); x.fillStyle = '#3a3230'; x.beginPath(); x.ellipse(0, 0, 7, 14, 0, 0, 7); x.fill(); x.fillStyle = '#e9e1cf'; x.fillRect(-1.5, -11, 3, 22); x.restore(); };
          const tw = [[-46, 330], [-24, 312], [4, 306], [32, 314], [46, 336], [42, 362], [24, 386], [2, 408], [-20, 430], [-42, 452], [-20, 456], [6, 456], [32, 456], [54, 456]];
          tw.forEach(([dx, dy], j) => seed(cx + dx, dy + 6, j * .7)); }
        else ink.text('?', cx, 360, 120, '#b9ad99'); });
      // the drinks fridge under the big TV, with balloons tied to it
      const fx = 330, fy = 520; x.strokeStyle = '#2a3448'; x.lineWidth = 6; x.strokeRect(fx - 200, fy - 10, 400, 40); x.strokeRect(fx - 60, fy + 30, 120, 130); x.strokeRect(fx - 46, fy + 44, 92, 100);
      x.strokeRect(fx - 170, fy - 150, 340, 120); ink.text('TV', fx, fy - 90, 56, '#2a3448');
      [['#e8506a', 590, 470], ['#4aa3df', 680, 440], ['#ffd34d', 770, 480]].forEach(([c, bx, by]) => { x.fillStyle = c; x.beginPath(); x.ellipse(bx, by, 46, 56, 0, 0, 7); x.fill(); ink.line([[bx, by + 56], [bx - 30, by + 130], [fx + 60, fy + 90]], 3, '#5a6478'); });
      ink.text('lounge', 800, 640, 60, '#2a3448'); ink.line([[690, 640], [430, 600]], 5, '#2a3448'); ink.line([[452, 584], [430, 600], [450, 620]], 5, '#2a3448'); }, 31); }
    // the ring in the crumbs on the coffee bar where the tin stood
    function ringCanvas(){ const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for(let i = 0; i < 900; i++){ const a = r() * 7, d = 120 + Math.pow(r(), .5) * 130; if(d > 150 && d < 178 && r() < .9) continue; x.fillStyle = `rgba(${150 + r() * 60 | 0},${100 + r() * 50 | 0},${50 + r() * 30 | 0},${.5 + r() * .5})`; x.beginPath(); x.arc(256 + Math.cos(a) * d, 256 + Math.sin(a) * d, 1.5 + r() * 4, 0, 7); x.fill(); }
      return c; }
    // the lock on the lounge fridge: a keypad face that shows what you've typed
    function lockCanvas(cur, st){ const c = KEEP.lockCv || (KEEP.lockCv = document.createElement('canvas')); c.width = 256; c.height = 128; const x = c.getContext('2d');
      x.fillStyle = '#14161c'; x.fillRect(0, 0, 256, 128); x.fillStyle = '#05070c'; x.fillRect(12, 22, 186, 84); x.font = '600 56px ui-monospace, Menlo, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = st === 'open' ? '#7cf0a6' : st === 'bad' ? '#ff7a6b' : '#ffd77a'; for(let i = 0; i < 4; i++) x.fillText((cur || '')[i] || '·', 36 + i * 44, 66);
      x.beginPath(); x.arc(226, 64, 14, 0, 7); x.fillStyle = st === 'open' ? '#55e08a' : '#e2503f'; x.fill(); if(W.lockTex) W.lockTex.needsUpdate = true; wake(4); return c; }
    // the TV at the end
    function tvCanvas(){ return paperCanvas(1280, 720, 'paper', (x, w, h, ink) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1d2650'); g.addColorStop(1, '#3a1f4e'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      for(let i = 0; i < 80; i++){ x.fillStyle = ['#ffd34d', '#e8506a', '#4aa3df', '#7cf0a6'][i % 4]; x.fillRect(ink.rnd() * w, ink.rnd() * h, 10, 18); }
      ink.text('Happy birthday,', w / 2, h * .36, 150, '#fff3c4'); ink.text('Snowball!', w / 2, h * .62, 190, '#ffd34d'); ink.paw(w - 140, h - 110, 1.3, -.2, '#fff3c4'); }, 41); }

    /* ---------------------------------------------------------------- the world */
    const W = {};
    const greatUp = () => shadeT('WN-L1-03') < .5;
    const BED = [11.6, 0, 25.4];   // Biscuit's bed, in the walkway between the dining table and the sitting area
    const NEST = [-30.15, -2.18, -9.75];   // Nugget's nest, on the cube shelf in the office under the skylights
    function build(){
      shade('WN-L1-03', true, true);   // somebody pulled the great-room shades down
      // the ring where the tin stood, flat on the coffee bar counter
      W.ring = prop(ringCanvas(), [18.0, 3.02, 12.45], [0, 1, 0], 1.1, 1.1, {tone: 1});
      // Clover's plan, under a magnet on the kitchen fridge
      const k1 = keep('plan', 1000, 760, 'paper', null); k1.make = planCanvas; k1.cv = planCanvas();
      W.plan = k1.mesh = prop(k1.cv, [17.62, 4.5, 7.82], [0, 0, 1], 1.32, 1.0);
      const mag = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .04, 18), new THREE.MeshStandardMaterial({color: lin(0xe8506a), roughness: .4})); mag.rotation.x = Math.PI / 2; mag.position.set(17.05, 4.98, 7.86); mag.raycast = () => {}; H.grp('main').add(mag);
      // Biscuit asleep on his bed, with his number under him
      const bed = new THREE.Group(); bed.name = 'esc-dogbed';
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.15, .32, 12, 32), new THREE.MeshStandardMaterial({color: lin(0x6b7f9a), roughness: .95})); rim.rotation.x = Math.PI / 2; rim.scale.set(1.25, 1, 1); rim.position.y = .3; bed.add(rim);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, .2, 32), new THREE.MeshStandardMaterial({color: lin(0xd9d2c3), roughness: 1})); pad.scale.set(1.25, 1, 1); pad.position.y = .12; bed.add(pad);
      bed.position.set(BED[0], 0, BED[2]); bed.traverse(o => { o.raycast = () => {}; }); H.grp('main').add(bed);
      const k2 = keep('biscuit', 700, 900, 'card', null); k2.make = biscuitCanvas; k2.cv = biscuitCanvas();
      W.biscuitCard = k2.mesh = prop(k2.cv, [BED[0], .235, BED[2]], [0, 1, 0], 1.25, 1.6, {spin: 0});
      W.light = lightPlane({floor: 'SP-L1-GREAT', ppf: 26, gain: 2.3, sources: [windowSource('WN-L1-03', {room: 'SP-L1-GREAT', shade: 'WN-L1-03', bars: [[-.17, .17, 0, 9]]})]});
      // Pepper's rainbow: card and tracing paper on the film of lower-level bedroom 2's window, a 9 at half past five in July
      const src0 = windowSource('WN-L0-07', {room: 'SP-L0-BED2'}), op = src0.op, out = src0.out();
      const strips = makeStrips('9', {o: [-23.0, LY + .05, -34.0], right: [1, 0, 0], up: [0, 0, -1], size: 1.1, pitch: 1.5}, {p: [op.c[0], 0, op.c[1]], n: [out.x, 0, out.z]}, 17.5);
      W.paper = buildPaper(strips, [-out.x * .03, 0, -out.z * .03]);
      W.film = windowSource('WN-L0-07', {room: 'SP-L0-BED2', top: 1.06, film: true, strips, gate: () => has('metPepper')});
      W.rainbow = lightPlane({floor: 'SP-L0-BED2', ppf: 40, gain: 1.9, holes: [[[-30.05, -39.6], [-24.4, -39.6], [-24.4, -32.3], [-30.05, -32.3]]], sources: [W.film], after: p => paperLight(p.s)});
      // Nugget's nest in the office, his card under him
      const nest = new THREE.Mesh(new THREE.TorusGeometry(.42, .16, 10, 24), new THREE.MeshStandardMaterial({color: lin(0xe9dcc0), roughness: 1})); nest.rotation.x = Math.PI / 2; nest.position.set(NEST[0], NEST[1] + .12, NEST[2]); nest.raycast = () => {}; H.grp('main').add(nest);
      const k3 = keep('nugget', 1000, 720, 'card', null); k3.make = nuggetCanvas; k3.cv = nuggetCanvas();
      W.nuggetCard = k3.mesh = prop(k3.cv, [NEST[0] + .02, NEST[1] + .03, NEST[2]], [0, 1, 0], 1.0, .72, {spin: Math.PI / 2});
      // the keypad on the lounge drinks fridge
      const lc = lockCanvas('', 'locked'), lt = W.lockTex = texOf(lc); lt.anisotropy = 4;
      const lock = W.lock = new THREE.Mesh(new THREE.BoxGeometry(.035, .25, .5), [new THREE.MeshBasicMaterial({map: lt, toneMapped: false})].concat([1, 2, 3, 4, 5].map(() => new THREE.MeshStandardMaterial({color: lin(0x1a1c22), roughness: .5, metalness: .4}))));
      lock.position.set(-20.76, LY + 2.45, -22.6); lock.raycast = () => {}; H.grp('main').add(lock); lockCanvas('', 'locked'); lt.needsUpdate = true;
      // the animals
      petAt('biscuit', [BED[0], .2, BED[2]], yawTo(BED, [13.6, 0, 31.6])); PETS.biscuit.rotation.z = 0;
      petAt('clover', [31.1, 0, 27.6], yawTo([31.1, 0, 27.6], [19.4, 0, 33.4])); PETS.clover.scale.setScalar(.56); PETS.clover.visible = false; W.carrot = carrot([31.55, .32, 27.35]); W.carrot.visible = false;
      petAt('pepper', [-22.0, LY, -38.4], yawTo([-22.0, 0, -38.4], [-21.6, 0, -27.6]));
      petAt('nugget', [NEST[0], NEST[1] + .12, NEST[2]], yawTo(NEST, [-25.0, 0, -11.0]));
      E.makeCat = true; }
    const sleepy = g => { if(!g) return; g.rotation.z = 0; };
    function biscuitAsleep(){ const g = PETS.biscuit; if(!g) return; if(!W.zb) W.zb = zzz([BED[0] + .4, 2.9, BED[2]]); W.zb.visible = true; g.position.set(BED[0], .2, BED[2]); g.rotation.set(0, yawTo(BED, [13.6, 0, 31.6]), 0); g.scale.set(.78, .5, .78); W.biscuitCard.visible = false; }
    function biscuitUp(anim){ const g = PETS.biscuit; if(!g) return; if(W.zb) W.zb.visible = false; g.scale.setScalar(.78); W.biscuitCard.visible = true; const to = [BED[0] - 2.3, 0, BED[2] + .4];
      if(anim) petWalk('biscuit', to, 1400, () => { g.rotation.y = yawTo(to, BED); }); else { g.position.set(...to); g.rotation.y = yawTo(to, BED); } }
    function nuggetAsleep(){ const g = PETS.nugget; if(!g) return; if(!W.zn) W.zn = zzz([NEST[0], NEST[1] + 1.0, NEST[2]]); W.zn.scale.set(.7, .7, 1); W.zn.visible = true; g.position.set(NEST[0], NEST[1] + .12, NEST[2]); g.scale.set(.2, .13, .2); W.nuggetCard.visible = false; }
    function nuggetUp(anim){ const g = PETS.nugget; if(!g) return; if(W.zn) W.zn.visible = false; g.scale.setScalar(.2); W.nuggetCard.visible = true; const to = [NEST[0], NEST[1] + .02, NEST[2] + .95];
      if(anim) petWalk('nugget', to, 900); else g.position.set(...to); }
    function cloverOut(){ const g = PETS.clover; if(!g) return; g.visible = true; if(W.carrot) W.carrot.visible = true; }

    // Biscuit wakes when the real sun reaches his bed
    function sunOnBed(){ return greatUp() && W.light && W.light.litAt(BED[0], BED[2]); }
    function checks(user){
      if(has('metBiscuit') && has('greatUp') && !has('biscuitAwake') && sunOnBed()){ give('biscuitAwake'); biscuitUp(true); SND.woof(); setTimeout(() => SND.woof(), 260);
        say(S.place === 'great' ? 'Sun on the nose. Biscuit’s up. Check what he was lying on.' : 'That’s a bark. Biscuit’s awake. Great room.', 5200); }
      if(has('metNugget') && !has('nuggetAwake') && S.hour >= 20.75){ give('nuggetAwake', 'p_nugget', 'p_order'); nuggetUp(true); SND.squeak(); setTimeout(() => SND.squeak(), 180);
        if(S.place === 'office') say('Morning, Nugget. He was asleep on a card.', 5200); else say('Squeaking. Nugget’s up. Office.', 5200);
        noteNugget(); }
      if(S.ex && S.ex.id === 'rainbow' && rainbowUp()) readRainbow(); }
    const rainbowUp = () => has('metPepper') && W.film && W.film.s > .5 && sunIn('rainbow');
    function readRainbow(){ if(give('p_pepper')){ SND.reveal(); setTimeout(() => say('RAINBOW! NINE! NINE! SURPRI... no. Nothing.', 5200, false, 'pepper'), 500); notePepper(); } }
    // the notebook
    const imgK = id => () => KEEP[id].cv;
    function noteCase(){ note('case', {title: 'Snowball’s case notes', where: 'From the start', img: () => caseCanvas(), text: 'Four suspects. Biscuit is asleep in the great room. Clover is hiding. Pepper is downstairs being loud. Nugget is asleep in the office.'}); }
    function caseCanvas(){ return paperCanvas(1000, 640, 'kraft', (x, w, h, ink) => { ink.text('SUSPECTS', w / 2, 70, 76);
      [['biscuit', 'asleep. suspicious.'], ['clover', 'hiding'], ['pepper', 'shouting SURPRISE'], ['nugget', 'asleep since breakfast']].forEach(([who, t], i) => { const cx = 140 + i * 240;
        x.fillStyle = '#f4ead6'; x.beginPath(); x.arc(cx, 250, 92, 0, 7); x.fill(); face(x, who, cx, 250, 150); ink.text(who[0].toUpperCase() + who.slice(1), cx, 380, 54); ink.text(t, cx, 440, 34, '#5a3d1e'); });
      ink.text('The tin was on the coffee bar. Now it isn’t.', w / 2, 540, 46); ink.paw(w - 90, h - 70, .9, -.2); }, 3); }
    KEEP.case = {make: caseCanvas, cv: null}; onFont(() => { if(NOTES.case) NOTES.case.url = ''; });
    const noteMap = () => note('plan', {title: 'Clover’s plan', where: 'On the kitchen fridge', img: imgK('plan'), text: 'A plan of the bedroom wing, with a carrot drawn on one closet. Look at which room the carrot is in, and where its door is.'});
    const noteBiscuit = () => note('biscuit', {title: 'Under Biscuit', where: 'On his bed, in the great room', img: imgK('biscuit'), text: 'Biscuits laid out in a six. And a party hat. Odd.'});
    const notePepper = () => note('pepper', {title: 'Pepper’s rainbow', where: 'The downstairs bedroom, in the evening sun', img: () => rainbowCanvas(), text: 'In the rainbow on the floor, the card on the window leaves a nine.'});
    const noteNugget = () => note('nugget', {title: 'Under Nugget', where: 'His nest in the skylit office', img: imgK('nugget'), text: 'Four faces in a row: Clover, Pepper, Biscuit, Nugget. His own number is a two, in sunflower seeds. And the lounge fridge, with balloons.'});
    function rainbowCanvas(){ return paperCanvas(600, 760, 'paper', (x, w, h, ink) => { const g = x.createLinearGradient(40, 0, w - 40, h); for(let i = 0; i <= 8; i++) g.addColorStop(i / 8, `hsl(${(i * 47 + 8) % 360},90%,72%)`); x.fillStyle = g; x.fillRect(40, 40, w - 80, h - 80);
      const R = {a: [.25, .9, .75, 1], b: [.75, .5, .87, .9], c: [.75, .1, .87, .5], d: [.25, 0, .75, .1], f: [.13, .5, .25, .9], g: [.25, .45, .75, .55]}; x.fillStyle = 'rgba(40,30,30,.55)';
      for(const s of 'abcdfg'){ const r = R[s]; const X0 = 120 + r[0] * 360, X1 = 120 + r[2] * 360, Y0 = 640 - r[3] * 520, Y1 = 640 - r[1] * 520; x.fillRect(X0, Y0, X1 - X0, Y1 - Y0); } }, 51); }
    const clover = {th: 0};

    /* ---------------------------------------------------------------- things to look at */
    const SP = {
      ring: {from: ['kitchen'], label: () => 'Where the tin was', at: () => [18.0, 3.2, 12.45], pos: [15.9, 5.4, 10.4], look: [18.0, 3.0, 12.45], fit: {w: 2.2, h: 1.8},
        sheet: () => ({title: 'Where the tin was', body: `<p>A clean ring in the crumbs on the coffee bar, exactly the size of a treat tin. Whoever took it didn’t bother to wipe up.</p>${line('snowball', 'Exhibit A. The scene of the crime. I’ve been robbed.')}`}),
        seen(){ noteCase(); }},
      plan: {from: ['kitchen'], label: () => 'Drawing on the fridge', at: () => [17.62, 4.5, 7.95], pos: [17.62, 4.6, 10.6], look: [17.62, 4.5, 7.82], fit: {w: 1.55, h: 1.2},
        sheet: () => ({title: 'Clover’s plan', body: `<p>A plan of the bedroom wing in pencil, held up with a magnet. Three bedrooms, a hall, a bath and the dining table, and a carrot drawn on one closet. Signed with a rabbit’s foot.</p>`}),
        seen(){ if(give('cloverMap')){ noteMap(); say('Rabbits draw better plans than you’d think. Find the carrot.', 5200); } }},
      biscuit: {from: ['great'], when: () => !has('biscuitAwake'), label: () => 'Biscuit', at: () => [BED[0], 1.6, BED[2]], pos: [BED[0] + 1.6, 4.6, BED[2] + 4.2], look: [BED[0], .6, BED[2]], fit: {w: 3.4, h: 2.6},
        sheet: () => ({title: 'Biscuit', body: `${line('biscuit', 'Zzz. Mm. Sun. Sun’s gone. Zzz.')}<p>Biscuit is fast asleep on his bed in the gloom. Both big shades are down. He looks guilty, but he always looks guilty.</p>${line('snowball', 'Biscuit only naps in the sun. Somebody pulled the shades.')}`}),
        seen(){ give('metBiscuit'); checks(); }},
      shades: {from: ['great'], when: () => has('metBiscuit'), label: () => greatUp() ? 'Big windows' : 'Shades on the big windows', at: () => [4.9, 5.4, 25.4], pos: [10.6, 5.2, 25.4], look: [4.7, 4.6, 25.4], fit: {w: 14.5, h: 6.4},
        sheet: () => ({title: 'The big windows', body: greatUp() ? '<p>Two large picture windows, with the roller shades rolled right up. The sun comes in here in the afternoon and moves across the floor as it goes down.</p>' : '<p>Two large picture windows, with both roller shades pulled all the way down.</p>',
          acts: [greatUp() ? {label: 'Lower the shades', cls: '', run: () => act(() => { SND.shade(); shade('WN-L1-03', true); }, 900)} : {label: 'Raise the shades', run: () => act(() => { SND.shade(); shade('WN-L1-03', false); give('greatUp'); setTimeout(() => { checks(); if(!has('biscuitAwake')) sunKey(true); }, 700); }, 900)}]})},
      bed: {from: ['great'], when: () => has('biscuitAwake'), label: () => 'Biscuit’s bed', at: () => [BED[0], .6, BED[2]], pos: [BED[0] + .3, 5.0, BED[2] + 2.4], look: [BED[0], .2, BED[2]], fit: {w: 2.4, h: 2.4},
        sheet: () => ({title: 'Under Biscuit', body: `<p>He was lying on a napkin. On it, six dog biscuits laid out in a big six. In the corner, a little party hat.</p>${line('biscuit', 'Those are for later. Not for now. Nobody said anything.')}<div class="got">${ICON('biscuit', 34)}<b>6</b><span>Biscuit’s number</span></div>`}),
        seen(){ if(give('p_biscuit')){ noteBiscuit(); SND.found(); setTimeout(() => say('A party hat. On evidence. Interesting.', 4600), 900); } }},
      closetF: {from: ['frontbed'], when: () => has('cloverMap'), label: () => doorT('D-L1-09') > .5 ? 'Closet' : 'Closet with three doors', at: () => [29.6, 3.4, 29.0],
        pose: () => ({pos: [22.6, 5.2, 29.0], look: [30.4, 2.6, 29.0], fit: {w: 7.4, h: 6.6}}),
        sheet: () => { const open = doorT('D-L1-09') > .5;
          if(!open) return {title: 'The closet', body: '<p>A closet behind three sliding doors, each on its own track.</p>', acts: [{label: 'Slide the doors open', run: () => act(() => { SND.slide(); door('D-L1-09', true); setTimeout(() => { cloverOut(); }, 500); }, 1300)}]};
          if(!has('p_clover')) return {title: 'Clover', body: `${line('clover', 'Oh. You found me. Please don’t thump.')}<p>Clover is pressed into the corner of the closet, next to a carrot tied up in ribbon. She looks at you, and then she thumps her back foot. Again. And again.</p><div class="thumps">${['THUMP', 'THUMP', 'THUMP', 'THUMP'].map((t, i) => `<span style="animation-delay:${.45 + i * .55}s">${t}</span>`).join('')}</div>`};
          return {title: 'Clover', body: `${line('clover', 'That was my number. Four. Please go away now. Nicely.')}<div class="got">${ICON('clover', 34)}<b>4</b><span>Clover thumped four times</span></div>`}; },
        seen(){ if(doorT('D-L1-09') > .5 && !has('p_clover')){ for(let i = 0; i < 4; i++) setTimeout(() => SND.thump(), 450 + i * 550);
            setTimeout(() => { if(give('cloverFound', 'p_clover')){ note('clover', {title: 'Clover’s thumps', where: 'Front bedroom closet', img: () => thumpCanvas(), text: 'Clover thumped her foot four times. Rabbits count with their feet.'}); say('Rabbits count with their feet.', 4600); } }, 2800); } }},
      closetM: {from: ['middlebed'], when: () => has('cloverMap'), label: () => 'Closet with three doors', at: () => [20.9, 3.4, 18.9], pos: [27.6, 5.2, 18.9], look: [20.6, 2.8, 18.9], fit: {w: 8, h: 6.6},
        sheet: () => doorT('D-L1-07') > .5 ? {title: 'The closet', body: `<p>Shirts on hangers and a stack of boxes. No rabbit.</p>${line('snowball', 'Shirts. No rabbit. Look at her plan again.')}`, acts: [{label: 'Slide the doors shut', cls: '', run: () => act(() => { SND.slide(); door('D-L1-07', false); }, 1300)}]}
          : {title: 'The closet', body: '<p>Another closet behind three sliding doors.</p>', acts: [{label: 'Slide the doors open', run: () => act(() => { SND.slide(); door('D-L1-07', true); }, 1300)}]}},
      pepper: {from: ['lbed2'], label: () => 'Pepper', at: () => [-22.0, LY + 2.0, -38.4], pos: [-21.2, LE - .4, -34.6], look: [-22.0, LY + 1.0, -38.6], fit: {w: 2.6, h: 2.6},
        sheet: () => ({title: 'Pepper', body: has('p_pepper') ? `${line('pepper', 'NINE! NINE! I DIDN’T SAY ANYTHING!')}<div class="got">${ICON('pepper', 34)}<b>9</b><span>Pepper’s number, in the rainbow</span></div>`
          : `${line('pepper', 'SURPRISE! ... No. Nothing. NO RAINBOW, NO TALKING!', true)}<p>The bottom of the window over the bed is covered in rainbow film, with strips of paper stuck on it in a boxy figure. Some are card, some are tracing paper.</p>`}),
        seen(){ if(give('metPepper')){ SND.chirp(); setTimeout(() => say('She said surprise. Write that down.', 4200), 1400); W.rainbow.update(); } }},
      rainbow: {from: ['lbed2'], sun: true, when: () => has('metPepper') && W.film && W.film.s > .05, label: () => 'Rainbow on the floor', at: () => [-22.55, LY + .3, -35.3], pos: [-21.9, LY + 7.2, -32.6], look: [-22.55, LY, -35.45], fit: {w: 3.6, h: 3.0},
        sheet: () => rainbowUp() ? {title: 'Rainbow on the floor', body: '<p>Colour all over the floor, and the card strips on the film leave a dark figure in it. The tracing paper lets the colour through.</p>'}
          : {title: 'Rainbow on the floor', body: '<p>Colour on the floor, but the shadows of the paper are pulled out of shape. Not quite the right time.</p>'},
        seen(){ if(rainbowUp()) readRainbow(); }},
      nugget: {from: ['office'], sun: true, label: () => has('nuggetAwake') ? 'Nugget’s nest' : 'Nugget', at: () => [NEST[0], NEST[1] + .6, NEST[2]], pos: [-26.6, LY + 4.2, -9.4], look: [NEST[0], NEST[1] + .1, NEST[2]], fit: {w: 2.0, h: 1.6},
        sheet: () => has('nuggetAwake') ? {title: 'Under Nugget', body: `<p>He was sleeping on a card. Four faces in a row, Clover, Pepper, Biscuit and Nugget, with sunflower seeds in a two under his own face. And a drawing of the lounge drinks fridge, with balloons.</p>${line('nugget', 'That’s the order. Don’t tell Snowball. Oh.')}<div class="got">${ICON('nugget', 34)}<b>2</b><span>Nugget’s number, and the order</span></div>`}
          : {title: 'Nugget', body: `${line('nugget', 'Zzzzz.')}<p>Nugget is curled up in his nest on the shelf, under the skylights. He is very, very asleep.</p>${line('snowball', 'He sleeps all day. Useless till dark.')}`},
        seen(){ if(give('metNugget')){ sunKey(true); setTimeout(checks, 600); } }},
      party: {from: ['lounge'], lock: 'party', label: () => 'Drinks fridge', at: () => [-20.8, LY + 2.2, -22.6], pos: [-17.0, LE - .6, -22.6], look: [-21.2, LY + 1.8, -22.6], fit: {w: 3.0, h: 3.4},
        sheet: () => ({title: 'The lounge drinks fridge', body: has('p_order') ? '<p>A keypad lock for four digits. Nugget’s card has the order.</p>' : '<p>The drinks fridge under the TV has a keypad lock on it, for four digits. Somebody’s been busy.</p>'}),
        face: (cur, cls) => lockCanvas(cur, cls === 'ok' ? 'open' : cls === 'bad' ? 'bad' : 'locked')}};
    function carrot(at){ const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(.09, .55, 12), new THREE.MeshStandardMaterial({color: lin(0xf08a24), roughness: .7}));
      c.rotation.z = Math.PI / 2 + .2; g.add(c); for(const a of [-.4, 0, .4]){ const l = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), new THREE.MeshStandardMaterial({color: lin(0x3c9a3c)})); l.scale.set(1, 3, 1); l.position.set(-.3, .06, a * .12); l.rotation.z = Math.PI / 2 + a; g.add(l); }
      const bow = new THREE.Mesh(new THREE.TorusGeometry(.07, .022, 6, 16), new THREE.MeshStandardMaterial({color: lin(0xe8506a)})); bow.position.set(-.12, .06, 0); g.add(bow);
      g.position.set(...at); g.traverse(o => { o.raycast = () => {}; }); H.grp('main').add(g); return g; }
    function tin(at){ const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .62, 32), new THREE.MeshStandardMaterial({color: lin(0x2f6f8f), roughness: .3, metalness: .6}));
      body.position.y = .31; g.add(body); const lid = new THREE.Mesh(new THREE.CylinderGeometry(.44, .44, .08, 32), new THREE.MeshStandardMaterial({color: lin(0xd9b44a), roughness: .3, metalness: .7})); lid.position.y = .66; g.add(lid);
      const rib = new THREE.MeshStandardMaterial({color: lin(0xe8506a), roughness: .5}); for(const r of [0, Math.PI / 2]){ const b = new THREE.Mesh(new THREE.TorusGeometry(.43, .03, 6, 32), rib); b.rotation.y = r; b.position.y = .35; b.scale.set(1, .85, 1); g.add(b); }
      for(const s of [-1, 1]){ const l = new THREE.Mesh(new THREE.TorusGeometry(.13, .035, 8, 18), rib); l.position.set(s * .12, .8, 0); l.rotation.y = Math.PI / 2; l.scale.set(1, .7, 1); g.add(l); }
      g.position.set(...at); g.traverse(o => { o.raycast = () => {}; }); H.grp('main').add(g); return g; }
    // a little "z z z" over an animal that's asleep
    function zzz(at){ const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.strokeStyle = 'rgba(31,41,72,.75)'; x.lineWidth = 8;
      for(const [t, px, py, sz] of [['z', 60, 210, 70], ['z', 120, 140, 90], ['Z', 190, 70, 110]]){ x.font = `600 ${sz}px Caveat, cursive`; x.strokeText(t, px, py); x.fillText(t, px, py); }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: texOf(c), transparent: true, depthWrite: false})); sp.scale.set(1.1, 1.1, 1); sp.position.set(...at); sp.renderOrder = 6; sp.raycast = () => {}; H.grp('main').add(sp); return sp; }
    function thumpCanvas(){ return paperCanvas(700, 500, 'paper', (x, w, h, ink) => { face(x, 'clover', 120, 130, 150); ['THUMP', 'THUMP', 'THUMP', 'THUMP'].forEach((t, i) => ink.text(t, 330 + (i % 2) * 220, 110 + Math.floor(i / 2) * 120, 70, '#3f5f6c')); ink.text('four', w / 2, 420, 90, '#9b2c3c'); }, 61); }

    /* ---------------------------------------------------------------- the reveal */
    function party(){ win(); $('#escGoalT').textContent = 'Happy birthday, Snowball.';
      const a = yp([-15.2, LE, -15.0], [-21.6, LY + 2.0, -21.2]), R = E.rig; rigTravel([[R.pos.x, R.pos.y, R.pos.z], [-15.2, LE, -15.0]], {yaw: a[0], pitch: a[1], fov: aspect() < 1 ? 80 : 60, off: [0, 0]}, {dur: 1.4});
      setTimeout(() => { SND.party(); toast('SURPRISE!', 2600); setSlider(20.9);
        // the TV, balloons, and everyone: Biscuit came round the side and in through the terrace doors
        const tv = prop(tvCanvas(), [-22.62, 1.05, -20.4], [1, 0, 0], 5.3, 2.98, {tone: 1}); tv.renderOrder = 4;
        door('D-L0-10', true);
        [['#e8506a', -19.6, -18.2], ['#4aa3df', -20.2, -20.0], ['#ffd34d', -19.8, -24.4], ['#7cf0a6', -14.0, -24.8], ['#e8506a', -12.4, -16.0]].forEach(([c, bx, bz], i) => {
          const b = new THREE.Mesh(new THREE.SphereGeometry(.42, 18, 14), new THREE.MeshStandardMaterial({color: lin(c), roughness: .35, emissive: lin(c), emissiveIntensity: .25})); b.scale.y = 1.2; b.position.set(bx, LY + 7.6 + (i % 2) * .4, bz); b.raycast = () => {}; H.grp('main').add(b);
          const s = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, 3.2), new THREE.MeshBasicMaterial({color: 0xffffff})); s.position.set(bx, LY + 5.6 + (i % 2) * .4, bz); H.grp('main').add(s); });
        petAt('biscuit', [-18.4, LY, -23.2], yawTo([-18.4, 0, -23.2], [-15.2, 0, -15.0])); PETS.biscuit.scale.setScalar(.78); tin([-21.7, -1.55, -21.1]);
        petAt('clover', [-18.0, LY, -19.2], yawTo([-18.0, 0, -19.2], [-15.2, 0, -15.0]));
        petAt('pepper', [-21.2, -1.55, -18.0], yawTo([-20.9, 0, -18.4], [-15.2, 0, -15.0]));
        petAt('nugget', [-21.5, -1.55, -19.9], yawTo([-21.5, 0, -19.9], [-15.2, 0, -15.0])); PETS.nugget.scale.setScalar(.26);
        catAt([-17.4, LY, -17.4]); wake(40); }, 1500);
      setTimeout(() => say('You all knew. Fine. I’m not crying. It’s the dust.', 6000), 3600);
      setTimeout(() => finishCard({title: 'Surprise!', bubbles: false,
        lede: 'It was never a theft. Biscuit, Clover, Pepper and Nugget hid the treat tin so Snowball wouldn’t eat the party before it started, and every clue was an invitation. Pepper nearly gave it away all afternoon.',
        real: '118 Hillside Drive has a lower-level lounge made for nights like this, with a refreshment counter and its own drinks fridge, and glass doors out to the terrace. Six bedrooms and three full baths, in Woodside, California.',
        share: t => `Locked In at Hillside, Medium: somebody stole Snowball’s treat tin at 118 Hillside Drive. I cracked the case in ${t}. Your turn.`}), 6200); }

    /* ---------------------------------------------------------------- the level */
    return {places: PL, start: 'kitchen', nodes: NODES, edges: EDGES, walks: WALKS, spots: SP, book: true,
      mapRooms: ['SP-L1-KITCHEN', 'SP-L1-GREAT', 'SP-L1-BED3', 'SP-L1-BED3-CLOSET', 'SP-L1-HALL', 'SP-L1-BED2', 'SP-L1-BED2-CLOSET', 'SP-L1-BED1', 'SP-L1-LIVING', 'SP-L1-ENTRY', 'SP-L0-LOUNGE', 'SP-L0-ENTRY', 'SP-L0-OFFICE', 'SP-L0-HALL', 'SP-L0-BED2'],
      saveDoors: ['D-L1-09', 'D-L1-07', 'D-L1-08', 'R28-POCKET'], saveShades: ['WN-L1-03'],
      build(){ build(); },
      restore(resumed){ door('D-L1-08', true, true); door('R28-POCKET', true, true); door('D-L0-07', true, true);
        if(has('biscuitAwake')) biscuitUp(false); else biscuitAsleep();
        if(has('nuggetAwake')) nuggetUp(false); else nuggetAsleep();
        if(has('cloverFound') || doorT('D-L1-09') > .5) cloverOut(); W.light.update(); W.rainbow.update(); },
      begin(resumed){ if(!S.notes.includes('case')) noteCase(); catAt(resumed ? [13.0, 0, 9.6] : [16.6, 0, 11.4]);
        if(!resumed) setTimeout(() => say('My tin. Gone. Look at the counter.', 4600), E.phone() ? 7200 : 2600); },
      onHour(h, was, user){ checks(user); },
      onArrive(k, first){ if(k === 'lbed2' && first && !has('metPepper')) setTimeout(() => say('SURPRISE! Oh. Wrong time. Hello.', 4200, false, 'pepper'), 900); },
      progress: () => { const n = ['p_biscuit', 'p_clover', 'p_pepper', 'p_nugget'].filter(has).length; return n ? `Numbers: ${n} of 4` : ''; },
      numbers: () => ['clover', 'pepper', 'biscuit', 'nugget'].filter(w => has('p_' + w)).map(w => ({icon: ICON(w, 28), value: DIG[w], label: w[0].toUpperCase() + w.slice(1) + '’s number'}))
        .concat(has('p_order') ? [{icon: '', value: '→', label: 'Order: Clover, Pepper, Biscuit, Nugget'}] : []),
      wrongLine: (n) => n === 1 ? 'Not that. Nugget knows the order.' : n % 3 === 0 ? 'The keypad’s sulking. Give it a minute.' : null,
      hintActs: {
        biscuit: [null, () => catAt([13.0, 0, 24.0]), () => goTo('great')],
        biscuitWake: [null, () => { sunKey(true); if(S.place !== 'great') goTo('great'); }, () => { const go = () => { if(!greatUp()){ SND.shade(); shade('WN-L1-03', false); give('greatUp'); } setTimeout(() => sweepTo(17.25, 1600, checks), 600); }; if(S.place !== 'great') goTo('great', {done: go}); else go(); }],
        biscuitRead: [null, null, () => { const go = () => setTimeout(() => examine('bed'), 300); if(S.place === 'great') go(); else goTo('great', {done: go}); }],
        cloverMap: [null, () => catAt([17.6, 0, 9.4]), () => { const go = () => setTimeout(() => examine('plan'), 300); if(S.place === 'kitchen') go(); else goTo('kitchen', {done: go}); }],
        cloverFind: [null, () => catAt([16.4, 0, 31.6]), () => { const go = () => setTimeout(() => examine('closetF'), 300); if(S.place === 'frontbed') go(); else goTo('frontbed', {done: go}); }],
        pepper: [null, null, () => goTo('lbed2')],
        pepperRainbow: [null, () => sunKey(true), () => { const go = () => { setSlider(17.5); setTimeout(() => examine('rainbow'), 400); }; if(S.place === 'lbed2') go(); else goTo('lbed2', {done: go}); }],
        nugget: [null, null, () => goTo('office')],
        nuggetWake: [null, () => sunKey(true), () => sweepTo(21, 1600)],
        party: [null, () => { if(S.place !== 'lounge') goTo('lounge'); }, null]},
      win: party};
  }
  window.ESCAPE_LEVELS.medium = {make, card: {
    lede: 'A July afternoon. Snowball’s treat tin has vanished from the coffee bar, and four of his friends know more than they’re saying.',
    note: `<div class="note"><p>Code red. The treat tin is gone. There’s a ring in the crumbs where it stood.</p><p>Biscuit is asleep, which is suspicious. Clover is hiding. Pepper keeps shouting SURPRISE and then saying nothing. Nugget hasn’t woken up since breakfast.</p><p>You’re my assistant. Find my tin.</p><p class="sig"><svg class="paw" viewBox="0 0 44 44" role="img" aria-label="Signed with a paw print"><g fill="currentColor"><ellipse cx="22" cy="29" rx="10" ry="8.4"/><ellipse cx="8.6" cy="18" rx="4" ry="5.2" transform="rotate(-24 8.6 18)"/><ellipse cx="16.6" cy="10" rx="4" ry="5.4" transform="rotate(-8 16.6 10)"/><ellipse cx="27.4" cy="10" rx="4" ry="5.4" transform="rotate(8 27.4 10)"/><ellipse cx="35.4" cy="18" rx="4" ry="5.2" transform="rotate(24 35.4 18)"/></g></svg></p></div>`}};
})();
