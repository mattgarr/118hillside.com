/* Locked In at Hillside, Hard: The Sunset Heist (all three floors and the terrace). Loaded by escape.js when the level starts.
   Midsummer, sunrise to sunset. Snowball has "stolen" everyone's favourite thing and locked it in a strongbox. Four witnesses each saw him
   at one moment of the day, and at each moment he left a number written in light that only shows at that hour:
     Biscuit (entry, morning): dusty paw prints that only show in the low sun through the front doors' iron grid, walking a 7;
     Pepper (skylit office, early afternoon): "Sun on the desk", the skylight's square lands on the desk and its paper leaves a 5;
     Admiral (kitchen, late afternoon): lower his shade and the sun throws the shadow of a cut-out hanging outside onto it, a 3;
     Snowball's own note (primary bedroom, sunset): the low sun through the balcony doors writes an 8 across the floor.
   He also tore his map into three sheets of tracing paper, one per floor: the loft window seat (the backwards writing on the shower glass
   reads WINDOW SEAT in the mirror), Clover in the middle bedroom closet (she comes out when the room is dark), and Mabel on the terrace (she
   moves when the sun does). Stacked, lined up by the stairs, they put an X on the lounge wall under the stairs: the hidden door. The
   strongbox's lock is the sun's arc from his first note: the numbers go in the order of the day, 7538.
   Logic, codes and hints: logic.js (hard). Design: DESIGN.md section 6. */
(function(){
  'use strict';
  window.ESCAPE_LEVELS = window.ESCAPE_LEVELS || {};
  function make(E){
    const {H, THREE, S, has, give, sunIn, door, doorT, shade, shadeT, shadeItem, windowSource, lightPlane, makeStrips, buildPaper, paperLight, prop, paperCanvas, texOf, onFont, petAt, petWalk, yawTo, PETS,
      catAt, say, toast, goTo, examine, back, act, setSlider, sweepTo, sunKey, line, note, NOTES, setBook, bookRender, SND, esc, lin, wake, clamp, sunDir, rig, rigTravel, rigCut, yp, aspect, fadeThrough, win, finishCard, fmtH, arcSVG, EYE, $} = E;
    const LY = -4.56, LE = LY + EYE, UY = 5.57, UE = UY + EYE, TY = -4.79, ICON = (who, s) => window.ESC_PETS ? ESC_PETS.icon(who, s) : '';

    /* ---------------------------------------------------------------- places */
    const PL = {
      entry:    {name: 'Entry', floor: 'main', pos: [-5.7, EYE, -4.6], face: [-5.4, 2.0, 2.6], map: [-6.0, -2.3],
        note: 'Iron-and-glass doors at both ends: the front doors catch the morning sun, the back doors the evening. The stairs are off to the side.'},
      living:   {name: 'Living room', short: 'Living', floor: 'main', pos: [1.8, EYE, -3.6], face: [10, 5.0, -2.9], map: [5.0, -2.5],
        note: 'Fir beams cross the vaulted ceiling. This room is part of the original 1920s house.'},
      kitchen:  {name: 'Kitchen', floor: 'main', pos: [12.4, EYE, 9.6], face: [5.4, 3.6, 10.0], map: [12.4, 9.0],
        note: 'All white, with quartz counters and a big window over the sink. Admiral’s bowl sits on the counter by the window.'},
      hall:     {name: 'Bedroom hall', short: 'Hall', floor: 'main', pos: [23.8, EYE, 10.6], face: [23.8, 4.6, 16.0], map: [23.8, 9.4],
        note: 'A short hall off the kitchen, with a bedroom at each end and the hall bath.'},
      middlebed:{name: 'Middle bedroom', short: 'Middle bed', floor: 'main', pos: [29.8, EYE, 15.6], face: [21.5, 4.2, 19.0], map: [27.0, 19.0],
        note: 'The middle bedroom, at the end of the hall, with a closet behind three sliding doors and a big window with a blackout shade.'},
      loft:     {name: 'Loft', floor: 'upper', pos: [-14.6, UE, -10.4], face: [-24.0, UY + 2.4, -6.0], map: [-19.0, -9.0],
        note: 'A sitting area at the top of the stairs, with a window seat under the windows.'},
      pbath:    {name: 'Primary bath', short: 'Bath', floor: 'upper', pos: [-12.0, UE, -22.4], face: [-11.0, UY + 3.4, -19.0], map: [-13.0, -21.0],
        note: 'Heated floors, two sinks under two mirrors, and a big glass shower.'},
      primary:  {name: 'Primary bedroom', short: 'Primary', floor: 'upper', pos: [-10.4, UE, -27.4], face: [-17.6, UY + 3.0, -38.0], map: [-16.0, -31.0],
        note: 'Four skylights in a cathedral ceiling, and stacking glass doors to a balcony that faces the hills.'},
      lounge:   {name: 'Bonus lounge', short: 'Lounge', floor: 'lower', pos: [-16.0, LE, -20.6], face: [-12.6, LY + 2.6, -12.8], map: [-16.5, -18.5],
        note: 'The bonus lounge: a big TV, a refreshment counter, glass doors to the terrace, and the wall under the stairs.'},
      office:   {name: 'Skylit office', short: 'Office', floor: 'lower', pos: [-28.0, LE, -10.6], face: [-23.8, LY + 1.6, -5.4], map: [-27.0, -7.5],
        note: 'The skylit office, across the lower entry from the laundry room. Two skylights, and windows on two walls.'},
      terrace:  {name: 'Terrace', floor: 'lower', pos: [-4.6, TY + EYE, -29.4], face: [-4.8, TY + .8, -39.0], map: [-4.0, -33.0],
        note: 'Paver stone, an outdoor kitchen under the pergola, and the heritage oak over it all.'}};
    const NODES = {a1: [4.4, -4.9], a2: [11.4, -4.9], a3: [12.6, -1.0], a4: [12.75, 5.1], kh: [20.3, 9.3], h1: [23.8, 8.3], h2: [23.8, 13.5]};
    const EDGES = [['entry', 'living'], ['living', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'], ['a4', 'kitchen'], ['kitchen', 'kh'], ['kh', 'h1'], ['h1', 'hall'], ['hall', 'h2'], ['h2', 'middlebed']];
    const WALKS = {
      entry: [{to: 'living', at: [0.4, 2.6, -3.0]}, {to: 'loft', label: 'Up the stairs', at: [-12.0, 6.5, -7.0]}, {to: 'lounge', label: 'Down the stairs', at: [-12.0, 1.5, -6.0]}],
      living: [{to: 'entry', at: [-3.4, 2.4, -1.6]}, {to: 'kitchen', at: [12.7, 3.3, 4.7]}],
      kitchen: [{to: 'living', at: [12.75, 3.2, 5.0]}, {to: 'hall', at: [22.2, 3.0, 8.9]}],
      hall: [{to: 'kitchen', at: [22.0, 3.0, 8.6]}, {to: 'middlebed', at: [23.9, 3.0, 14.2]}],
      middlebed: [{to: 'hall', at: [23.0, 3.0, 13.6]}],
      loft: [{to: 'entry', label: 'Down the stairs', at: [-15.5, UY + 1.0, -6.0]}, {to: 'pbath', at: [-19.7, UY + 3.0, -15.5]}, {to: 'primary', at: [-19.6, UY + 3.0, -17.5]}],
      pbath: [{to: 'loft', at: [-17.7, UY + 3.0, -19.4]}, {to: 'primary', at: [-16.0, UY + 3.0, -25.4]}],
      primary: [{to: 'pbath', at: [-19.6, UY + 3.0, -25.8]}, {to: 'loft', at: [-19.0, UY + 3.0, -24.0]}],
      lounge: [{to: 'entry', label: 'Up the stairs', at: [-19.0, LY + 3.0, -12.8]}, {to: 'office', at: [-23.0, LY + 3.0, -14.6]}, {to: 'terrace', at: [-10.6, LY + 3.0, -19.0]}],
      office: [{to: 'lounge', at: [-25.0, LY + 3.0, -12.6]}],
      terrace: [{to: 'lounge', at: [-10.4, LY + 3.0, -20.6]}]};

    /* ---------------------------------------------------------------- drawings */
    const ICONIMG = {};
    function iconImg(who, cb){ const im = ICONIMG[who] = ICONIMG[who] || {img: new Image(), cbs: []}; if(im.ok) return cb && cb(im.img); if(cb) im.cbs.push(cb);
      if(!im.img.src){ im.img.onload = () => { im.ok = true; for(const f of im.cbs) f(im.img); im.cbs = []; }; im.img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ICON(who, 96).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')); } }
    const KEEP = {};
    function keep(id, make){ const k = KEEP[id] = {make, cv: make()}; return k; }
    function redrawAll(){ for(const id in KEEP){ const k = KEEP[id]; if(!k || typeof k.make !== 'function') continue; k.cv = k.make(); if(k.mesh){ k.mesh.material.map.image = k.cv; k.mesh.material.map.needsUpdate = true; } if(NOTES[id]) NOTES[id].url = ''; } wake(4); }
    onFont(redrawAll); ['biscuit', 'admiral', 'pepper', 'clover', 'mabel'].forEach(w => iconImg(w, redrawAll));
    // Snowball's first note: the sun's arc over the hills, with four paw prints along it
    function arcDraw(x, w, h, ink, x0, y0, aw, ah, slots){ const pts = [.1, .37, .63, .9].map(t => { const a = Math.PI * (1 - t); return [x0 + aw / 2 + Math.cos(a) * aw * .42, y0 + ah * .9 - Math.sin(a) * ah * .74]; });
      ink.line([[x0 + aw * .03, y0 + ah * .9], [x0 + aw * .97, y0 + ah * .9]], 6); x.save(); x.setLineDash([16, 14]); x.beginPath(); x.ellipse(x0 + aw / 2, y0 + ah * .9, aw * .42, ah * .74, 0, Math.PI, 0); x.lineWidth = 5; x.strokeStyle = '#1c2030'; x.stroke(); x.restore();
      x.fillStyle = '#f2b632'; x.beginPath(); x.arc(x0 + aw * .08, y0 + ah * .9, 18, 0, 7); x.fill(); x.fillStyle = '#e07b39'; x.beginPath(); x.arc(x0 + aw * .92, y0 + ah * .9, 18, 0, 7); x.fill();
      for(const [px, py] of pts) ink.paw(px, py, .55, -.2); return pts; }
    function firstNote(){ return paperCanvas(1000, 760, 'kraft', (x, w, h, ink) => { ink.tape(140, 32, -.15); ink.tape(w - 140, 32, .12);
      ink.text('My day.', w / 2, 100, 84); arcDraw(x, w, h, ink, 90, 150, 820, 470); ink.text('Morning', 160, 660, 50); ink.text('Sunset', 840, 660, 50); ink.paw(w - 110, h - 80, .9, -.22); }, 7); }
    // three sheets of tracing paper, one per floor, drawn to the same scale and lined up by the stairs
    const STAIRS = 'SP-L1-STAIRHALL';
    const HD = [-12.2, -12.6];   // the hidden door, in plan
    let TF = null;
    function tf(){ if(TF) return TF; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for(const s of H.BIM2S.meta.spaces){ if(!/^SP-L[012]-/.test(s.id)) continue; for(const q of (s.poly || s.polygon)){ const x = q[1], z = q[0]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } }
      const w = 900, h = 700, k = Math.min((w - 100) / (z1 - z0), (h - 120) / (x1 - x0)), ox = (w - (z1 - z0) * k) / 2, oy = 60 + (h - 120 - (x1 - x0) * k) / 2;
      return (TF = {w, h, P: (x, z) => [ox + (z - z0) * k, oy + (x1 - x) * k], k}); }
    // part: 'lines' draws only the pencil, 'marks' only the red, anything else both
    function sheetDraw(floor, bg, part){ const T = tf(); return paperCanvas(T.w, T.h, bg ? 'tracing' : 'none', (x, w, h, ink) => { if(!bg) x.clearRect(0, 0, w, h);
      const c = T.P(HD[0], HD[1]);
      if(part !== 'marks'){
      const re = {upper: /^SP-L2-/, main: /^SP-L1-/, lower: /^SP-L0-/}[floor];
      for(const s of H.BIM2S.meta.spaces){ if(!re.test(s.id) || /STAIRHALL/.test(s.id)) continue; const p = (s.poly || s.polygon).map(q => T.P(q[1], q[0])); ink.line(p.concat([p[0]]), s.id === 'SP-L0-LOUNGE' ? 7 : 4, s.id === 'SP-L0-LOUNGE' ? '#33415c' : 'rgba(60,70,90,.7)'); }
      // the stairs, the same on every sheet: an outline and its treads
      const st = E.spacePoly(STAIRS).map(q => T.P(q[0], q[1])); ink.line(st.concat([st[0]]), 7, '#1c2030');
      const xs = st.map(p => p[0]), ys = st.map(p => p[1]), sx0 = Math.min(...xs), sx1 = Math.max(...xs), sy0 = Math.min(...ys), sy1 = Math.max(...ys); for(let i = 1; i < 8; i++){ const xx = sx0 + (sx1 - sx0) * i / 8; ink.line([[xx, sy0 + 4], [xx, sy1 - 4]], 3, '#1c2030'); }
      ink.text('stairs', (sx0 + sx1) / 2, sy0 - 26, 38); }
      if(part !== 'lines'){
      if(floor === 'upper') ink.line([[c[0] - 44, c[1] + 44], [c[0] + 44, c[1] - 44]], 10, '#c0392b');
      if(floor === 'main') ink.line([[c[0] - 44, c[1] - 44], [c[0] + 44, c[1] + 44]], 10, '#c0392b');
      if(floor === 'lower'){ x.strokeStyle = '#c0392b'; x.lineWidth = 8; x.beginPath(); x.arc(c[0], c[1], 66, 0, 7); x.stroke(); } }
      if(bg) ink.text({upper: 'upstairs', main: 'main floor', lower: 'downstairs'}[floor], 130, h - 46, 46, '#5a6478'); }, floor.length); }
    // the mirror writing on the shower glass, and the same words as they show in the mirror
    function glassCanvas(mirror){ const c = document.createElement('canvas'); c.width = 1400; c.height = 520; const x = c.getContext('2d');
      x.save(); if(!mirror){ x.translate(c.width, 0); x.scale(-1, 1); }
      x.font = '600 230px Caveat, "Segoe Print", cursive'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
      x.strokeStyle = mirror ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.9)'; x.lineWidth = 16; x.strokeText('WINDOW SEAT', c.width / 2, c.height / 2);
      x.fillStyle = mirror ? 'rgba(70,90,110,.6)' : 'rgba(150,175,195,.75)'; x.fillText('WINDOW SEAT', c.width / 2, c.height / 2); x.restore(); return c; }
    function noteCanvas(text, sub){ return paperCanvas(800, 600, 'kraft', (x, w, h, ink) => { ink.tape(w / 2, 30, -.05); ink.text(text, w / 2, 190, 92); if(sub) ink.text(sub, w / 2, 330, 60);
      // the sun touching the hills
      x.strokeStyle = '#1c2030'; x.lineWidth = 8; x.beginPath(); x.moveTo(90, 500); x.quadraticCurveTo(240, 400, 380, 470); x.quadraticCurveTo(520, 380, 710, 480); x.stroke(); x.beginPath(); x.arc(470, 432, 56, Math.PI * 1.08, Math.PI * 1.92); x.stroke();
      ink.paw(w - 90, h - 70, .8, -.2); }, 9); }
    // what each number looks like, for the notebook
    function readCanvas(d, title, tint){ return paperCanvas(600, 760, 'paper', (x, w, h, ink) => { const g = x.createLinearGradient(40, 0, w - 40, h); g.addColorStop(0, tint[0]); g.addColorStop(1, tint[1]); x.fillStyle = g; x.fillRect(40, 40, w - 80, h - 120);
      const SEG = {0: 'abcdef', 3: 'abgcd', 5: 'afgcd', 7: 'abc', 8: 'abcdefg'}[d] || 'g', R = {a: [.25, .9, .75, 1], b: [.75, .5, .87, .9], c: [.75, .1, .87, .5], d: [.25, 0, .75, .1], e: [.13, .1, .25, .5], f: [.13, .5, .25, .9], g: [.25, .45, .75, .55]};
      x.fillStyle = 'rgba(40,30,30,.6)'; for(const s of SEG){ const r = R[s]; const X0 = 120 + r[0] * 360, X1 = 120 + r[2] * 360, Y0 = 600 - r[3] * 480, Y1 = 600 - r[1] * 480; x.fillRect(X0, Y0, X1 - X0, Y1 - Y0); }
      ink.text(title, w / 2, h - 44, 44); }, 13); }

    /* ---------------------------------------------------------------- the world */
    const W = {};
    const SEAT = [-23.8, 7.05, -5.8], MABEL0 = [-4.2, -4.75, -39.3], MABEL1 = [-6.7, -4.75, -39.6], CLO = [19.6, 0, 17.2], BOWL = [5.75, 3.01, 10.25];
    const kitchenSun = () => { const d = sunDir(S.hour); return d.y > .03 && d.x < -.03; };   // the sink window faces the afternoon sun
    const admiralInSun = () => kitchenSun() && shadeT('WN-L1-02') < .5;
    function build(){
      keep('first', firstNote);
      // tidy the desk the skylight lands on (the laptop and boxes would sit on the number); the desk stays
      try{ H.scene.traverse(o => { if(o.name === 'deskX') o.children.forEach(q => { if(q.name === 'decor') q.visible = false; }); }); }catch(e){}
      // ---- Biscuit's sunny squares: the front doors' grid on the entry floor, with paw prints that only show in the light (a 7)
      const grid = [[-1.46, -1.3, 0, 9], [1.3, 1.46, 0, 9], [-4.4, 4.4, 2.8, 2.94], [-4.4, 4.4, 5.28, 5.42]];
      const PR = []; const seg = (a, b, n) => { for(let i = 0; i <= n; i++){ const t = i / n; PR.push([a[0] + (b[0] - a[0]) * t + (i % 2 ? .18 : -.18), a[1] + (b[1] - a[1]) * t, Math.atan2(b[0] - a[0], b[1] - a[1])]); } };
      seg([-4.5, 2.1], [-8.5, 2.1], 7); seg([-8.5, 1.6], [-9.3, -2.4], 7);
      const prints = (g, uv) => { if(!has('metBiscuit')) return; g.globalAlpha = .9; g.fillStyle = '#000';
        for(const [px, pz, a] of PR){ const c = uv(new THREE.Vector3(px, 0, pz)); g.save(); g.translate(c[0], c[1]); g.rotate(-a); const s = 1.35; g.scale(s, s);
          g.beginPath(); g.ellipse(0, 4, 7, 6, 0, 0, 7); g.fill(); for(const [dx, dy] of [[-7, -5], [-2.5, -8.5], [2.5, -8.5], [7, -5]]){ g.beginPath(); g.ellipse(dx, dy, 2.2, 3, 0, 0, 7); g.fill(); } g.restore(); }
        g.globalAlpha = 1; };
      W.front = windowSource('D-LG-02', {room: 'SP-L1-ENTRY', bot: .1, top: 7.8, inset: .25, bars: grid, decal: prints});
      // the dust itself, drawn on the floor and faded in only while the low morning sun is on it (the holes in the light alone are too faint on a bright phone screen)
      { const X0 = -10.2, Z0 = -3.2, FW = 6.6, FH = 6.0, K = 100, cv = document.createElement('canvas'); cv.width = FW * K; cv.height = FH * K; const g = cv.getContext('2d');
        g.fillStyle = 'rgba(92,74,52,.62)';
        for(let i = 0; i < PR.length; i++){ const [px, pz] = PR[i], n = PR[Math.min(i + 1, PR.length - 1)], q = PR[Math.max(i - 1, 0)], du = n[0] - q[0], dv = n[1] - q[1];
          g.save(); g.translate((px - X0) * K, (pz - Z0) * K); g.rotate(Math.atan2(du, -dv)); g.scale(3.6, 3.6);
          g.beginPath(); g.ellipse(0, 4, 7, 6, 0, 0, 7); g.fill(); for(const [dx, dy] of [[-7, -5], [-2.5, -8.5], [2.5, -8.5], [7, -5]]){ g.beginPath(); g.ellipse(dx, dy, 2.2, 3, 0, 0, 7); g.fill(); } g.restore(); }
        W.pm = prop(cv, [X0 + FW / 2, .03, Z0 + FH / 2], [0, 1, 0], FW, FH, {tone: 1}); W.pm.material.opacity = 0; W.pm.visible = false; }
      W.entry = lightPlane({floor: 'SP-L1-ENTRY', ppf: 34, gain: 1.7, sources: [W.front, windowSource('D-L0-11', {room: 'SP-L1-ENTRY', bot: .1, top: 7.8, inset: .25, bars: grid})]});
      // ---- Pepper's desk: the office skylights, the square of light on the floor and the desk; paper on one skylight leaves a 5 on the desk at a quarter past two
      const skyQuad = id => { const it = shadeItem(id), R = it.rects[0], P = (a, b) => R.c.clone().addScaledVector(R.u, a).addScaledVector(R.v, b); return {it, R, quad: [P(-R.hu * .92, -R.hv * .92), P(R.hu * .92, -R.hv * .92), P(R.hu * .92, R.hv * .92), P(-R.hu * .92, R.hv * .92)], out: R.n.clone().negate()}; };
      const s11 = skyQuad('SK-R11'), s12 = skyQuad('SK-R12'), T_DESK = 14.25, DY = -2.06;
      const dS = sunDir(T_DESK), t0 = (s12.R.c.y - DY) / dS.y, cen = [s12.R.c.x - dS.x * t0, s12.R.c.z - dS.z * t0];
      const deskStrips = makeStrips('5', {o: [cen[0] - .6, DY + .02, cen[1] - .35], right: [0, 0, 1], up: [1, 0, 0], size: .7, pitch: 1.5}, {p: s12.R.c.toArray(), n: s12.R.n.toArray()}, T_DESK);
      W.skyPaper = buildPaper(deskStrips, [0, -.01, 0]);
      const skySrc = (s, strips, gate) => ({out: () => s.out, quad: () => s.it.t > .5 ? null : s.quad, strips: strips ? () => strips : null, gate, color: 'rgba(255,250,232,1)'});
      W.officeFloor = lightPlane({floor: 'SP-L0-OFFICE', ppf: 30, gain: 1.6, sources: [skySrc(s11), skySrc(s12)], holes: [[[-25.25, -7.15], [-23.2, -7.15], [-23.2, -3.35], [-25.25, -3.35]]]});
      W.desk = lightPlane({clip: [[-25.2, -7.1], [-23.25, -7.1], [-23.25, -3.4], [-25.2, -3.4]], y: DY + .01, ppf: 60, blend: 'paint', shade: 'rgba(132,124,114,.9)', sources: [skySrc(s11), skySrc(s12, deskStrips, () => has('metPepper'))]});
      W.deskCen = cen;
      // ---- Admiral's shadow show: a cut-out hanging outside the sink window; with the shade down, the late sun puts its shadow on the shade (a 3 at five o'clock)
      const ks = shadeItem('WN-L1-02'), KX = ks.F.cx + ks.F.inn[0] * (ks.d + .05), KZ = ks.F.cz, KW = ks.F.W - .3, KY0 = ks.y0 + .1, KY1 = ks.y1 - .45, T_SH = 17;
      const shadeFrame = {O: [KX, KY1, KZ + KW / 2], U: [0, 0, -1], V: [0, 1, 0], w: KW, h: KY1 - KY0};   // seen from the kitchen, looking out: right is -z
      const cutStrips = makeStrips('3', {o: [KX, KY0 + .45, KZ + .55], right: [0, 0, -1], up: [0, 1, 0], size: 1.25, pitch: 1.5}, {p: [3.1, 0, KZ], n: [1, 0, 0]}, T_SH);
      W.cut = buildPaper(cutStrips, [0, 0, 0]);
      const kwin = windowSource('WN-L1-02', {room: 'SP-L1-KITCHEN', strips: cutStrips, gate: () => has('metAdmiral') && shadeT('WN-L1-02') > .97});
      kwin.color = 'rgba(255,240,206,1)';
      W.screen = lightPlane({plane: shadeFrame, blend: 'paint', base: 'rgba(96,84,70,.82)', ppf: 40, blur: 2, lift: .02, order: 5, sources: [kwin]});
      // ---- Snowball's last job: paper strips on the balcony doors write an 8 across the bedroom floor at a quarter to eight
      const sl0 = windowSource('D-L2-01', {room: 'SP-L2-PRIMARY'}), sop = sl0.op, sout = sl0.out(), T_SUN = 19.625;   // between half past seven and a quarter to eight, so both read
      const slStrips = makeStrips('8', {o: [-13.4, UY + .05, -29.4], right: [1, 0, 0], up: [0, 0, -1], size: 1.15, pitch: 1.5}, {p: [sop.c[0], 0, sop.c[1]], n: [sout.x, 0, sout.z]}, T_SUN);
      W.slPaper = buildPaper(slStrips, [-sout.x * .03, 0, -sout.z * .03], 'upper');
      W.slider = windowSource('D-L2-01', {room: 'SP-L2-PRIMARY', shade: 'D-L2-01', bot: UY + .1, bars: [[-1.5, -1.38, 0, 20], [1.38, 1.5, 0, 20]], strips: slStrips, gate: () => has('sunsetNote')});
      W.primary = lightPlane({floor: 'SP-L2-PRIMARY', ppf: 34, gain: 2.4, group: 'upper', sources: [W.slider], holes: [[[-24.2, -36.8], [-16.5, -36.8], [-16.5, -29.7], [-24.2, -29.7]]], after: p => paperLight(p.s)});
      const nc = keep('sunsetNote', () => noteCanvas('Last job of the day.', 'when the sun touches the hills'));
      W.sunsetNote = nc.mesh = prop(nc.cv, [-17.6, UY + 4.4, -39.95], [0, 0, 1], 1.4, 1.05, {group: 'upper'});
      // ---- the shower glass and the mirror
      W.glass = prop(glassCanvas(false), [-11.2, UY + 3.5, -19.40], [0, 0, -1], 3.6, 1.34, {group: 'upper', tone: 1, both: false});
      // the house's mirrors reflect a captured picture of the room, which would show these words a second time, slightly off. The writing is kept
      // out of that capture (its own layer, drawn only by the main camera) and the mirror shows one clean copy, in the close look
      W.glass.layers.set(9); try{ H.camera.layers.enable(9); }catch(e){}
      W.mirror = prop(glassCanvas(true), [-11.4, 10.6, -25.5], [0, 0, 1], 2.1, .78, {group: 'upper', tone: 1}); W.mirror.visible = false;
      // ---- the window seat cushion and the upper sheet under it
      const ks2 = keep('sheetUp', () => sheetDraw('upper', true)); W.sheetUp = ks2.mesh = prop(ks2.cv, [SEAT[0], SEAT[1] + .02, SEAT[2]], [0, 1, 0], 1.6, 1.25, {group: 'upper', spin: -Math.PI / 2}); W.sheetUp.visible = false;
      // ---- the main sheet (Clover leaves it on the closet floor) and the lower sheet (under Mabel)
      const ks3 = keep('sheetMain', () => sheetDraw('main', true)); W.sheetMain = ks3.mesh = prop(ks3.cv, [CLO[0] + 2.6, .03, CLO[2] + .3], [0, 1, 0], 1.5, 1.17, {spin: Math.PI / 2}); W.sheetMain.visible = false;
      const ks4 = keep('sheetLow', () => sheetDraw('lower', true)); W.sheetLow = ks4.mesh = prop(ks4.cv, [MABEL0[0], MABEL0[1] + .03, MABEL0[2]], [0, 1, 0], 1.5, 1.17, {group: 'main', spin: Math.PI});
      // ---- the strongbox behind the hidden door
      const box = W.box = new THREE.Group(); const steel = new THREE.MeshStandardMaterial({color: lin(0x3a4250), roughness: .45, metalness: .7});
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.1), steel); body.position.y = .55; box.add(body);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.54, .12, 1.14), new THREE.MeshStandardMaterial({color: lin(0x2b313c), roughness: .4, metalness: .7})); lid.position.y = 1.16; box.add(lid); W.lid = lid;
      const fc = document.createElement('canvas'); fc.width = 512; fc.height = 256; W.boxFace = fc; const fx = fc.getContext('2d'); fx.fillStyle = '#e9e2cf'; fx.fillRect(0, 0, 512, 256);
      const ft = texOf(fc); W.boxTex = ft; const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .55), new THREE.MeshBasicMaterial({map: ft, toneMapped: false})); face.position.set(0, .62, -.56); face.rotation.y = Math.PI; box.add(face);
      box.position.set(-12.3, LY, -10.6); box.traverse(o => { o.raycast = () => {}; }); H.grp('main').add(box); boxFace('');
      // ---- the animals and their things
      petAt('biscuit', [-2.4, 0, -0.4], yawTo([-2.4, 0, -0.4], [-5.7, 0, -4.6]));
      petAt('admiral', BOWL, yawTo(BOWL, [12.4, 0, 9.6]));
      petAt('pepper', [-26.8, LY, -6.2], yawTo([-26.8, 0, -6.2], [-28.0, 0, -10.6]));
      petAt('clover', CLO, yawTo(CLO, [29.8, 0, 15.6])); PETS.clover.scale.setScalar(.56); PETS.clover.visible = false;
      petAt('mabel', [MABEL0[0], MABEL0[1] + .02, MABEL0[2]], yawTo(MABEL0, [-6.4, 0, -27.0])); PETS.mabel.scale.setScalar(.42);
      E.cat; }
    function boxFace(cur, st){ const c = W.boxFace; if(!c) return; const x = c.getContext('2d'); x.fillStyle = '#e9e2cf'; x.fillRect(0, 0, 512, 256);
      const pts = [.1, .37, .63, .9].map(t => { const a = Math.PI * (1 - t); return [256 + Math.cos(a) * 215, 230 - Math.sin(a) * 170]; });
      x.strokeStyle = '#1c2030'; x.lineWidth = 6; x.beginPath(); x.moveTo(20, 230); x.lineTo(492, 230); x.stroke(); x.setLineDash([12, 10]); x.beginPath(); x.ellipse(256, 230, 215, 170, 0, Math.PI, 0); x.stroke(); x.setLineDash([]);
      x.fillStyle = '#f2b632'; x.beginPath(); x.arc(41, 230, 14, 0, 7); x.fill(); x.fillStyle = '#e07b39'; x.beginPath(); x.arc(471, 230, 14, 0, 7); x.fill();
      pts.forEach((p, i) => { x.fillStyle = '#141a30'; x.fillRect(p[0] - 26, p[1] - 30, 52, 60); x.fillStyle = st === 'open' ? '#7cf0a6' : st === 'bad' ? '#ff7a6b' : '#ffd77a'; x.font = '500 44px Jost, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText((cur || '')[i] || '', p[0], p[1] + 2); });
      if(W.boxTex) W.boxTex.needsUpdate = true; wake(4); }
    const clean = () => {};

    /* ---------------------------------------------------------------- readings, wakings and the notebook */
    const printsUp = () => has('metBiscuit') && W.front && W.front.s > .3 && sunIn('prints');
    const deskUp = () => has('metPepper') && W.desk && W.desk.s > .3 && sunIn('desk');
    const shadowUp = () => has('kitchenDown') && shadeT('WN-L1-02') > .97 && W.screen && W.screen.s > .3 && sunIn('shadow');
    const sunsetUp = () => has('sunsetNote') && W.slider && W.slider.s > .3 && sunIn('sunsetFloor');
    const readN = (part, who, d, title, tint, line, sayIt) => { if(!give(part)) return; SND.reveal(); note(part, {title, where: '', img: () => readCanvas(d, title, tint), text: line}); if(sayIt) setTimeout(() => say(sayIt[0], 5200, false, sayIt[1]), 500); };
    function checks(){
      if(S.ex){ const id = S.ex.id;
        if(id === 'prints' && printsUp()) readN('p_biscuit', 'biscuit', '7', 'Paw prints in the sun', ['#fff3c9', '#f6d98a'], 'Dusty paw prints that only show in the low morning sun through the front doors. They walk a seven.', ['That’s him. That’s his feet. A seven.', 'biscuit']);
        if(id === 'desk' && deskUp()) readN('p_pepper', 'pepper', '5', 'Sun on the desk', ['#fff1c2', '#f3cf7c'], 'The skylight’s square of sun on the desk, early in the afternoon. The paper on the skylight leaves a five.', ['FIVE! FIVE! SUN ON THE DESK!', 'pepper']);
        if(id === 'kshade' && shadowUp()) readN('p_admiral', 'admiral', '3', 'Shadow on the shade', ['#fff6e0', '#f1dcb2'], 'Late in the afternoon, with the shade down, the cut-out hanging outside throws a three onto it.', ['A three. Hideous. Now leave the shade down.', 'admiral']);
        if(id === 'floorP' && sunsetUp()) readN('p_sunset', 'snowball', '8', 'The last light', ['#ffd9a8', '#f39c5a'], 'At sunset, the low sun through the balcony doors writes an eight across the bedroom floor.', ['Last job of the day. Eight. I’m very thorough.']); }
      if(has('metMabel') && !has('sheetLow') && sunIn('mabelMoves')){ give('sheetLow'); petWalk('mabel', [MABEL1[0], MABEL1[1] + .02, MABEL1[2]], 5200); setTimeout(() => say('Cold. Moving. Slowly.', 4600, false, 'mabel'), 400);
        note('sheetLow', {title: 'Tracing paper: downstairs', where: 'Under Mabel, on the terrace', img: () => KEEP.sheetLow.cv, text: 'The lower level in pencil, with the stairs, and a red circle on the lounge wall.'}); }
      if(S.place === 'kitchen' || (S.ex && S.ex.id === 'admiral')) admiralPose(); }
    function admiralPose(){ const g = PETS.admiral; if(!g) return; g.rotation.y = admiralInSun() ? yawTo(BOWL, [3, 0, 10]) + Math.PI : yawTo(BOWL, [12.4, 0, 9.6]); }
    function stackView(){ const ids = ['sheetUp', 'sheetMain', 'sheetLow'].filter(has), T = tf();
      const fl = id => id === 'sheetUp' ? 'upper' : id === 'sheetMain' ? 'main' : 'lower', all = ids.length === 3;
      const cv = paperCanvas(T.w, T.h, 'paper'), x = cv.getContext('2d');
      for(const id of ids) x.drawImage(sheetDraw(fl(id), false, 'lines'), 0, 0);
      for(const id of ids) x.drawImage(sheetDraw(fl(id), false, 'marks'), 0, 0);
      // the full sheet is mostly empty paper: show the part round the stairs, big
      const c = T.P(HD[0], HD[1]), cw = 560, ch = 420, sx = clamp(c[0] - cw / 2, 0, T.w - cw), sy = clamp(c[1] - ch / 2, 0, T.h - ch);
      const out = document.createElement('canvas'); out.width = cw; out.height = ch; out.getContext('2d').drawImage(cv, sx, sy, cw, ch, 0, 0, cw, ch);
      bookRender({html: `<h2>Three floors, one map</h2><p class="sub">${all ? 'All three sheets, one on top of the other, lined up by the stairs.' : 'The sheets you have so far, lined up by the stairs. There’s one more somewhere.'}</p><div class="stackv"><img alt="${all ? 'The three plans stacked: two red strokes cross inside a red circle on the lower level, by the stairs' : 'The plans stacked so far'}" src="${out.toDataURL('image/png')}"></div>`});
      if(all && give('stacked')){ SND.found(); setTimeout(() => say('X marks the spot. I’m a classicist. Lounge, under the stairs.', 6000), 600); } }

    /* ---------------------------------------------------------------- things to look at */
    const SP = {
      biscuit: {from: ['entry'], label: () => 'Biscuit', at: () => [-2.4, 2.0, -0.4], pos: [-4.4, 4.4, -3.4], look: [-2.4, 1.0, -0.4], fit: {w: 3, h: 2.6},
        sheet: () => ({title: 'Biscuit', body: `${line('biscuit', 'He went past me first thing. Sun was coming in the front doors. Didn’t wipe his paws.')}${line('biscuit', 'He took my ball. I liked my ball.')}`}),
        seen(){ if(give('metBiscuit')){ sunKey(true); W.entry.update(); } }},
      prints: {from: ['entry'], sun: true, when: () => has('metBiscuit') && W.front.s > .05, label: () => 'Sun on the floor', at: () => [-7.0, .2, 0.6], pos: [-6.6, 8.6, -5.8], look: [-6.8, 0, .2], fit: {w: 7, h: 6.4},
        sheet: () => printsUp() ? {title: 'Sun on the floor', body: '<p>Squares of morning sun from the front doors’ iron grid, and in them, dusty paw prints you’d never see in the shade.</p>'}
          : {title: 'Sun on the floor', body: '<p>Squares of sun from the front doors. The light’s too high, or too low, to show any dust.</p>'},
        seen(){ checks(); }},
      admiral: {from: ['kitchen'], label: () => 'Admiral', at: () => [BOWL[0], BOWL[1] + 1.0, BOWL[2]], pos: [8.6, 5.0, 10.2], look: [BOWL[0], BOWL[1] + .4, BOWL[2]], fit: {w: 2.6, h: 2.4},
        sheet: () => admiralInSun() ? {title: 'Admiral', body: `${line('admiral', 'Direct sun. On my bowl. I shan’t speak until it stops.', true)}<p>The goldfish has turned his back on you and is sulking behind his castle. The afternoon sun is pouring through the window over the sink.</p>`}
          : {title: 'Admiral', body: `${line('admiral', 'The cat hung some rubbish outside my window. On a string. He said it’s for late in the afternoon, with my shade down. I shan’t be watching.')}${line('admiral', 'He also took my castle.')}`},
        seen(){ if(!admiralInSun() && give('metAdmiral')) setTimeout(() => say('Late afternoon, shade down. Fish are very precise.', 5000), 1600); }},
      kshade: {from: ['kitchen'], sun: true, seen(){ checks(); }, when: () => has('metAdmiral'), label: () => shadeT('WN-L1-02') > .5 ? 'Shade on the window' : 'Window over the sink', at: () => [4.9, 5.4, 9.5], pos: [9.6, 5.3, 9.5], look: [4.7, 5.0, 9.5], fit: {w: 6.4, h: 4.6},
        sheet: () => shadeT('WN-L1-02') > .5 ? {title: shadowUp() ? 'Shadow on the shade' : 'The kitchen shade', body: shadowUp() ? '<p>The shade glows with the sun behind it, and the cut-out hanging outside throws a crisp shadow onto it.</p>' : '<p>A light-filtering roller shade, all the way down. When the sun is on the window, it glows.</p>', acts: [{label: 'Raise the shade', cls: '', run: () => act(() => { SND.shade(); shade('WN-L1-02', false); }, 900)}]}
          : {title: 'The window over the sink', body: '<p>A big window over the sink, with a roller shade rolled up at the top. Something papery is hanging outside, on a string.</p>', acts: [{label: 'Lower the shade', run: () => act(() => { SND.shade(); shade('WN-L1-02', true); give('kitchenDown'); admiralPose(); }, 900)}]}},
      pepper: {from: ['office'], label: () => 'Pepper', at: () => [-26.8, LY + 2.2, -6.2], pos: [-28.6, LE - .6, -9.2], look: [-26.8, LY + 1.2, -6.2], fit: {w: 2.6, h: 2.6},
        sheet: () => ({title: 'Pepper', body: `${line('pepper', 'SUN ON THE DESK! SUN ON THE DESK!', true)}<p>Pepper repeats whatever she heard last. The last thing she heard was Snowball.</p>${line('pepper', 'MY FEATHER! HE TOOK MY RED FEATHER!')}`}),
        seen(){ if(give('metPepper')){ SND.chirp(); W.desk.update(); setTimeout(() => say('I may have said that out loud.', 4200), 1500); } }},
      desk: {from: ['office'], sun: true, when: () => has('metPepper') && (W.desk.s > .05 || W.officeFloor.s > .05), label: () => W.desk.s > .05 ? 'Sun on the desk' : 'Squares of sun', at: () => W.desk.s > .05 ? [W.deskCen[0], -1.7, W.deskCen[1]] : [-25.6, LY + .3, -7.5],
        pose: () => W.desk.s > .05 ? {pos: [-26.6, LY + 6.0, W.deskCen[1]], look: [W.deskCen[0], -2.06, W.deskCen[1]], fit: {w: 2.6, h: 2.2}} : {pos: [-28.0, LY + 6.6, -10.6], look: [-26.0, LY, -7.0], fit: {w: 6.0, h: 5.0}},
        sheet: () => deskUp() ? {title: 'Sun on the desk', body: '<p>The square of sun from the skylight sits right on the desk. Strips of paper on the skylight glass leave a figure in it.</p>'}
          : W.desk.s > .05 ? {title: 'Sun on the desk', body: '<p>Sun on the desk, but the shadows of the paper on the skylight are pulled out of shape.</p>'}
          : {title: 'Squares of sun', body: '<p>Two squares of sun from the skylights, on the floor. They creep across the room as the sun moves.</p>'},
        seen(){ checks(); }},
      note: {from: ['primary'], label: () => 'Note on the doors', at: () => [-17.6, UY + 4.4, -39.6], pos: [-17.6, UE - .2, -35.6], look: [-17.6, UY + 4.3, -39.95], fit: {w: 2.0, h: 1.6},
        sheet: () => ({title: 'Snowball’s note', body: `${line('snowball', 'Last job of the day. When the sun touches the hills.')}<p>Taped to the stacking doors to the balcony. Below it, strips of paper on the glass. Beyond the glass, the hills.</p>`}),
        seen(){ if(give('sunsetNote')){ note('sunsetNote', {title: 'Last job of the day', where: 'On the balcony doors', img: () => KEEP.sunsetNote.cv, text: 'Snowball’s note: the last job of the day was when the sun touched the hills.'}); sunKey(true); } }},
      floorP: {from: ['primary'], sun: true, when: () => has('sunsetNote') && W.slider.s > .05, label: () => 'Light on the floor', at: () => [-12.8, UY + .2, -30.4], pos: [-11.6, UY + 6.4, -26.9], look: [-12.9, UY, -30.4], fit: {w: 5.6, h: 4.6},
        sheet: () => sunsetUp() ? {title: 'The last light', body: '<p>Low gold light from the balcony doors, all the way across the floor. The card on the glass leaves a figure in it.</p>'}
          : {title: 'Light on the floor', body: '<p>Sun from the balcony doors on the floor. The shadows of the paper are long and out of shape. Not quite the moment.</p>'},
        seen(){ checks(); }},
      glass: {from: ['pbath'], label: () => 'Writing on the glass', at: () => [-11.2, UY + 3.5, -19.6], pos: [-11.2, UY + 3.8, -23.6], look: [-11.2, UY + 3.5, -19.4], fit: {w: 4.4, h: 2.2},
        sheet: () => ({title: 'Writing on the shower glass', body: `<p>Big soapy letters on the shower glass. They don’t read right.</p>${line('snowball', 'I wrote that. It’s not wrong. You’re looking at it wrong.')}`}),
        seen(){ give('sawGlass'); }},
      mirror: {from: ['pbath'], when: () => has('sawGlass'), label: () => 'Mirror', at: () => [-11.4, 10.85, -25.3], pos: [-11.6, 10.9, -21.4], look: [-11.4, 10.85, -25.56], fit: {w: 4.4, h: 4.4},
        sheet: () => ({title: 'In the mirror', body: '<p>The shower glass is behind you, and in the mirror over the sinks the soapy letters read the right way round.</p>' + line('snowball', 'There we are. Off you go.')}),
        seen(){ if(give('mirror')) note('mirror', {title: 'In the mirror', where: 'Primary bath', img: () => glassCanvas(true), text: 'The writing on the shower glass, read in the mirror: WINDOW SEAT.'}); }},
      seat: {from: ['loft'], when: () => has('mirror'), label: () => has('sheetUp') ? 'Window seat' : 'Cushion on the window seat', at: () => [SEAT[0] + .3, SEAT[1] + .6, SEAT[2]], pos: [-20.0, UE, -6.4], look: [SEAT[0], SEAT[1], SEAT[2]], fit: {w: 3.2, h: 2.6},
        sheet: () => has('sheetUp') ? {title: 'Under the cushion', body: `<p>A sheet of tracing paper with the upstairs drawn on it in pencil, the stairs, and one red stroke.</p>${line('snowball', 'One per floor. Obviously.')}`}
          : {title: 'The window seat', body: '<p>A cushioned seat under the loft windows. The cushion sits a little high.</p>', acts: [{label: 'Lift the cushion', run: () => act(() => { SND.paper(); W.sheetUp.visible = true; give('sheetUp'); note('sheetUp', {title: 'Tracing paper: upstairs', where: 'Under the window seat cushion', img: () => KEEP.sheetUp.cv, text: 'The upper floor in pencil, with the stairs, and one red stroke.'}); }, 600)}]}},
      closet: {from: ['middlebed'], label: () => 'Closet with three doors', at: () => [20.9, 3.4, 18.9], pos: [26.8, 5.2, 18.9], look: [20.6, 2.6, 18.6], fit: {w: 8, h: 6.6},
        sheet: () => { const open = doorT('D-L1-07') > .5;
          if(!open) return {title: 'The closet', body: '<p>A closet behind three sliding doors. Something inside goes very still.</p>', acts: [{label: 'Slide the doors open', run: () => act(() => { SND.slide(); door('D-L1-07', true); setTimeout(() => { PETS.clover.visible = true; }, 400); }, 1300)}]};
          if(!has('sheetMain')) return {title: 'Clover', body: `${line('clover', 'Too bright. Much too bright. I’m not coming out.', true)}<p>Clover is pressed into the back of the closet, holding something papery. The big window floods the room with light.</p>`};
          return {title: 'Clover', body: `${line('clover', 'Thank you. That’s better. He hid my carrot, you know.')}<p>She left a sheet of tracing paper on the floor by the closet: the main floor in pencil, the stairs, and one red stroke.</p>`}; },
        seen(){ if(doorT('D-L1-07') > .5) give('metClover'); }},
      cshade: {from: ['middlebed'], when: () => has('metClover'), label: () => shadeT('WN-L1-08') > .5 ? 'Shade' : 'Big window', at: () => [31.9, 4.6, 19.0], pos: [26.0, 5.2, 18.6], look: [32.3, 4.4, 19.0], fit: {w: 6.6, h: 5.2},
        sheet: () => shadeT('WN-L1-08') > .5 ? {title: 'The bedroom shade', body: '<p>A blackout honeycomb shade, all the way down. The room is dim and quiet.</p>'}
          : {title: 'The big window', body: '<p>A big window with a blackout honeycomb shade drawn right up under the head.</p>', acts: [{label: 'Lower the shade', run: () => act(() => { SND.shade(); shade('WN-L1-08', true); setTimeout(cloverOut, 700); }, 1000)}]}},
      mabel: {from: ['terrace'], sun: true, label: () => 'Mabel', at: () => { const g = PETS.mabel; return g ? [g.position.x, TY + 1.2, g.position.z] : MABEL0; }, pose: () => { const g = PETS.mabel, p = g ? g.position : {x: MABEL0[0], z: MABEL0[2]}; return {pos: [p.x + .4, TY + 3.8, p.z + 3.6], look: [p.x, TY + .4, p.z], fit: {w: 3.4, h: 2.6}}; },
        sheet: () => has('sheetLow') ? {title: 'Mabel', body: `${line('mabel', 'Warm here. This spot. For now.')}<p>She left a sheet of tracing paper on the paving: the lower level in pencil, the stairs, and a red circle.</p>${line('mabel', 'He took my strawberry. I’ll get over it. Slowly.')}`}
          : {title: 'Mabel', body: `${line('mabel', 'Warm. Staying.', true)}<p>Mabel is sitting on the warm paving, on top of something papery. She isn’t going anywhere while the sun’s on her.</p>${line('mabel', 'I move when the sun moves. Not before.')}`},
        seen(){ if(give('metMabel')){ sunKey(true); setTimeout(checks, 500); } }},
      panel: {from: ['lounge'], when: () => has('stacked'), label: () => doorT('D-L0-05') > .5 ? 'Under the stairs' : 'Wall under the stairs', at: () => [-12.2, LY + 2.4, -12.9], pos: [-14.6, LE - .4, -18.6], look: [-12.2, LY + 2.3, -12.74], fit: {w: 4.2, h: 4.4},
        sheet: () => doorT('D-L0-05') > .5 ? {title: 'Under the stairs', body: '<p>A little hidden room under the stairs, and in it, a steel strongbox.</p>'}
          : {title: 'The wall under the stairs', body: '<p>A short panel in the lounge wall, right where the X is. No handle, no hinges you can see. Just a hairline all the way round.</p>', acts: [{label: 'Push the panel', run: () => act(() => { SND.slide(); door('D-L0-05', true); give('panelOpen', 'sawBox', 'p_arc'); setTimeout(() => say('My hidden room. Well. The house’s. I just use it.', 5200), 1200); }, 1300)}]}},
      box: {from: ['lounge'], when: () => has('panelOpen'), lock: 'box', arc: true, label: () => 'Strongbox', at: () => [-12.3, LY + 1.4, -10.9], pos: [-12.3, LE - 1.2, -15.0], look: [-12.3, LY + .7, -10.6], fit: {w: 2.4, h: 2.0},
        sheet: () => ({title: 'Snowball’s strongbox', body: '<p>A steel box with a lock drawn on its front: the sun’s path from sunrise to sunset, with four places for a number along it.</p>'}),
        face: (cur, cls) => boxFace(cur, cls === 'ok' ? 'open' : cls === 'bad' ? 'bad' : '')}};
    function cloverOut(){ const g = PETS.clover; if(!g || has('sheetMain')) return; g.visible = true; petWalk('clover', [CLO[0] + 3.2, 0, CLO[2] - .4], 1500); W.sheetMain.visible = true; SND.thump();
      setTimeout(() => say('Better. Much better. That’s for you, on the floor.', 4800, false, 'clover'), 900);
      give('sheetMain'); note('sheetMain', {title: 'Tracing paper: main floor', where: 'Clover’s closet, middle bedroom', img: () => KEEP.sheetMain.cv, text: 'The main floor in pencil, with the stairs, and one red stroke.'}); }

    /* ---------------------------------------------------------------- the reveal: sunset on the terrace */
    function finale(){ win(); $('#escGoalT').textContent = 'Not a heist. A lost and found.';
      const R = rig, a = yp([-12.3, LE - .6, -14.4], [-12.3, LY + .8, -10.6]); rigTravel([[R.pos.x, R.pos.y, R.pos.z], [-12.3, LE - .6, -14.4]], {yaw: a[0], pitch: a[1], fov: aspect() < 1 ? 80 : 56, off: [0, 0]}, {dur: 1.0});
      setTimeout(() => { if(W.lid){ W.lid.position.z = .3; W.lid.rotation.x = -1.1; wake(10); } SND.fridge(); toast('Everyone’s favourite things.', 2600); }, 900);
      setTimeout(() => { // cut to the terrace at sunset: everyone has their thing back
        const sh = aspect() < 1 ? {pos: [1.6, TY + 6.6, -36.2], look: [-4.6, TY + .6, -39.0], fov: 76} : {pos: [2.2, TY + 6.4, -35.6], look: [-4.4, TY + .9, -39.0], fov: 58};
        const a1 = yp(sh.pos, sh.look);
        fadeThrough(() => { door('D-L0-10', true, true); rigCut(sh.pos, a1[0], a1[1], sh.fov); setSlider(20.25);
          const P = [['biscuit', [-6.4, -4.75, -38.6]], ['mabel', [-2.4, -4.73, -38.4]], ['clover', [-4.0, -4.75, -37.8]], ['pepper', [-5.4, -4.75, -40.4]]];
          for(const [who, p] of P){ const g = petAt(who, p, yawTo(p, sh.pos)); if(who === 'clover') g.scale.setScalar(.56); if(who === 'mabel') g.scale.setScalar(.42); g.visible = true; }
          petAt('admiral', [-1.2, -4.75, -40.0], yawTo([-1.2, 0, -40.0], sh.pos));
          things(); catAt([-3.4, -4.75, -36.4]);
          rigTravel([sh.pos, [sh.pos[0] - 1.2, sh.pos[1] - .3, sh.pos[2] - .4]], {yaw: a1[0], pitch: a1[1], fov: sh.fov, off: aspect() < 1 ? [0, -.28] : [-.16, 0]}, {dur: 9}); }, 520);
        setTimeout(() => say('Not a heist. A lost and found. Everything was under a sofa somewhere. You’re welcome.', 7000), 1800);
        setTimeout(() => finishCard({title: 'Sunset.', bubbles: false,
          lede: 'Snowball spent the longest day of the year finding everyone’s favourite thing: a ball, a castle, a red feather, a carrot and a strawberry. The heist was a lost and found, and the paw prints on his first note were the plan all along.',
          real: '118 Hillside Drive faces the sun all day: morning light through the front doors, skylights over the office and the primary bedroom, and sunset over the hills from the balcony. Six bedrooms and three full baths, with a terrace under a heritage oak, in Woodside, California.',
          share: t => `Locked In at Hillside, Hard: I tracked Snowball through every room of 118 Hillside Drive from sunrise to sunset and opened his strongbox in ${t}. Your turn.`}), 5200); }, 3600); }
    function things(){ const add = (geo, col, p, s) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color: lin(col), roughness: .5})); m.position.set(...p); if(s) m.scale.set(...s); m.raycast = () => {}; H.grp('main').add(m); return m; };
      const G = -4.75;
      add(new THREE.SphereGeometry(.22, 18, 14), 0xd8e04a, [-5.6, G + .22, -37.9]);                         // Biscuit's ball
      add(new THREE.SphereGeometry(.16, 14, 10), 0xd6303a, [-1.8, G + .16, -37.8], [1, 1.2, 1]);             // Mabel's strawberry
      add(new THREE.ConeGeometry(.06, .4, 10), 0xf08a24, [-3.5, G + .06, -37.3]).rotation.z = Math.PI / 2;    // Clover's carrot
      add(new THREE.BoxGeometry(.6, .02, .05), 0xd63a2e, [-4.8, G + .02, -39.7]);                             // Pepper's red feather
      add(new THREE.CylinderGeometry(.16, .2, .4, 8), 0x9aa3ad, [-.5, G + .2, -39.6]); add(new THREE.ConeGeometry(.18, .22, 8), 0xc0392b, [-.5, G + .51, -39.6]); }   // Admiral's castle

    return {places: PL, start: 'entry', nodes: NODES, edges: EDGES, walks: WALKS, spots: SP, book: true,
      mapRooms: ['SP-L1-ENTRY', 'SP-L1-LIVING', 'SP-L1-KITCHEN', 'SP-L1-HALL', 'SP-L1-BED2', 'SP-L1-BED2-CLOSET', 'SP-L2-LOFT', 'SP-L2-HALL', 'SP-L2-PBATH', 'SP-L2-PRIMARY', 'SP-L0-LOUNGE', 'SP-L0-ENTRY', 'SP-L0-OFFICE', 'SP-L0-STORAGE-B'],
      saveDoors: ['D-L1-07', 'D-L0-05', 'R28-POCKET'], saveShades: ['WN-L1-02', 'WN-L1-08', 'D-L2-01'],
      build(){ build(); },
      restore(){ door('R28-POCKET', true, true); door('D-L1-06', true, true); door('D-L2-02', true, true); door('D-L2-03', true, true); door('D-L2-04', true, true);
        if(doorT('D-L1-07') > .5) PETS.clover.visible = true;
        if(has('sheetMain')){ PETS.clover.visible = true; PETS.clover.position.set(CLO[0] + 3.2, 0, CLO[2] - .4); W.sheetMain.visible = true; }
        if(has('sheetLow')) PETS.mabel.position.set(MABEL1[0], MABEL1[1] + .02, MABEL1[2]);
        if(has('sheetUp')) W.sheetUp.visible = true; admiralPose(); E.LIGHT.update(); },
      begin(resumed){ if(!S.notes.includes('first')) note('first', {title: 'Snowball’s first note', where: 'From the start', img: () => KEEP.first.cv, text: 'The longest day of the year. The sun’s path from morning to sunset, with four paw prints along it.'});
        catAt([-9.2, 0, -5.6]); if(!resumed) setTimeout(() => say('The longest day of the year. Lots of daylight to work with. Ask Biscuit.', 5200), E.phone() ? 7200 : 2600); },
      onHour(){ checks(); },
      onArrive(k){ if(k === 'kitchen') admiralPose(); if(k === 'terrace') door('D-L0-10', true); },
      frame: () => { if(W.mirror) W.mirror.visible = !!(S.ex && S.ex.id === 'mirror' && !S.backing);
        if(W.pm){ const on = printsUp() ? 1 : 0, o = W.pm.material.opacity; if(Math.abs(on - o) > .01){ W.pm.material.opacity = o + (on - o) * .18; wake(2); } else W.pm.material.opacity = on; W.pm.visible = W.pm.material.opacity > .01; } },
      progress: () => { const n = ['p_biscuit', 'p_pepper', 'p_admiral', 'p_sunset'].filter(has).length, m = ['sheetUp', 'sheetMain', 'sheetLow'].filter(has).length; return (n || m) ? `Numbers ${n}/4 · Sheets ${m}/3` : ''; },
      numbers: () => [['p_biscuit', 'biscuit'], ['p_pepper', 'pepper'], ['p_admiral', 'admiral'], ['p_sunset', 'snowball']].filter(([p]) => has(p))
        .map(([p, who]) => ({icon: who === 'snowball' ? '' : ICON(who, 28), value: E.LG.parts[p].value, label: 'Read at ' + fmtH(S.read[p] != null ? S.read[p] : S.hour)})),
      bookActs: () => { const n = ['sheetUp', 'sheetMain', 'sheetLow'].filter(has).length; return n >= 2 ? [{label: n === 3 ? 'Lay the three sheets on top of each other' : 'Lay the sheets on top of each other', run: () => { SND.paper(); stackView(); }}] : []; },
      wrongLine: n => n === 1 ? 'Wrong order. My first note had the order.' : n % 3 === 0 ? 'That’s three. The lock and I need a moment.' : null,
      hintActs: {
        biscuit: [null, null, () => examine('biscuit')],
        prints: [null, () => sunKey(true), () => { const go = () => { setSlider(9.25); setTimeout(() => examine('prints'), 400); }; if(S.place === 'entry') go(); else goTo('entry', {done: go}); }],
        admiral: [null, () => { if(admiralInSun()) sweepTo(10, 1400); }, () => { const go = () => { if(admiralInSun()) setSlider(10); setTimeout(() => examine('admiral'), 400); }; if(S.place === 'kitchen') go(); else goTo('kitchen', {done: go}); }],
        shadow: [null, () => sunKey(true), () => { const go = () => { if(shadeT('WN-L1-02') < .5){ shade('WN-L1-02', true); give('kitchenDown'); } setTimeout(() => { setSlider(17); setTimeout(() => examine('kshade'), 900); }, 900); }; if(S.place === 'kitchen') go(); else goTo('kitchen', {done: go}); }],
        pepper: [null, null, () => goTo('office')],
        desk: [null, () => sunKey(true), () => { const go = () => { setSlider(14.5); setTimeout(() => examine('desk'), 400); }; if(S.place === 'office') go(); else goTo('office', {done: go}); }],
        sunset: [null, null, () => goTo('primary')],
        sunsetFloor: [null, () => sunKey(true), () => { const go = () => { setSlider(19.75); setTimeout(() => examine('floorP'), 400); }; if(S.place === 'primary') go(); else goTo('primary', {done: go}); }],
        glass: [null, null, () => goTo('pbath')],
        mirror: [null, null, () => examine('mirror')],
        cushion: [null, null, () => goTo('loft')],
        clover: [null, null, () => goTo('middlebed')],
        mabel: [null, null, () => goTo('terrace')],
        mabelMove: [null, () => sunKey(true), () => sweepTo(16.5, 1600)],
        stack: [null, () => setBook(true), () => { setBook(true); stackView(); }],
        panel: [null, () => { if(S.place !== 'lounge') goTo('lounge'); }, () => { const go = () => setTimeout(() => examine('panel'), 300); if(S.place === 'lounge') go(); else goTo('lounge', {done: go}); }]},
      win: finale};
  }
  window.ESCAPE_LEVELS.hard = {make, card: {
    lede: 'The longest day of the year, quarter to seven in the morning. Snowball has a plan, and by sunset he means to have pulled it off.',
    note: E => `<div class="note"><p>Today is the longest day of the year, so it’s the best day for a heist. I’ve taken everyone’s favourite thing and locked it all in my strongbox, somewhere you’ll never find.</p><p>I left my numbers around the house, written in light. Each one only shows at its own time of day. Everybody saw a bit of what I did. None of them will just tell you.</p><p>Here’s my day, if it helps:</p>${E.arcSVG(340, 150, false)}<p class="sig"><svg class="paw" viewBox="0 0 44 44" role="img" aria-label="Signed with a paw print"><g fill="currentColor"><ellipse cx="22" cy="29" rx="10" ry="8.4"/><ellipse cx="8.6" cy="18" rx="4" ry="5.2" transform="rotate(-24 8.6 18)"/><ellipse cx="16.6" cy="10" rx="4" ry="5.4" transform="rotate(-8 16.6 10)"/><ellipse cx="27.4" cy="10" rx="4" ry="5.4" transform="rotate(8 27.4 10)"/><ellipse cx="35.4" cy="18" rx="4" ry="5.2" transform="rotate(24 35.4 18)"/></g></svg></p></div>`}};
})();
