/* Thanksgiving at Hillside (3D): a dinner hunt played inside the 3D model of 118 Hillside Drive.
   Loaded by tour/index.html only on ?feast=1; talks to the engine through window.HILLSIDE. Food and paper goods: feast-props.js.

   Story: pets only. Snowball, the cat of the house, put dinner away with help from Biscuit, an old golden dog who visits and will
   not do stairs, and they left clues in paw-writing. No people are named or described. Each clue is answered by something true about
   the real house: which cold place is level with the terrace, where the afternoon sun lands, which room has four skylights, the
   door under the stairs that looks like a wall, how the main floor connects, which seat faces the sunset. Every dish you carry
   to the table adds a letter tag to the string over it and moves the sun a little lower. Six tags spell THANKS; then the lid
   comes off the smoker, the candles are lit and the house lights come on.

   How it plays (same rules as assets/escape/escape.js): the game owns the camera; you stand at named places, look around freely,
   walk or jump between them, and every searchable thing has an examine view that holds until you go Back. One objective at a
   time. Snowball gives three levels of hint for the step you are on, and the third always finishes it.
   Two clue sets (Snowball's trail and Biscuit's trail) alternate, or pick one with ?hunt=a|b. Debug hook: window.FEAST3D. */
(function(){
  'use strict';
  const H = window.HILLSIDE; if(!H || window.FEAST3D) return;
  const THREE = H.THREE, V3 = THREE.Vector3, canvas = H.canvas, camera = H.camera;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const ga = (n, p) => { try{ window.gtag && gtag('event', n, Object.assign({hunt: HUNT}, p || {})); }catch(e){} };
  const store = {
    get(k){ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }};
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const back3 = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const angDiff = (a, b) => { let d = b - a; while(d > Math.PI) d -= 2 * Math.PI; while(d < -Math.PI) d += 2 * Math.PI; return d; };
  const W2 = (mx, my) => [my, mx];   // BIM meta (x, y) -> world (x, z)
  const fmtT = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const el = (tag, attrs, html) => { const e = document.createElement(tag); for(const k in (attrs || {})) e.setAttribute(k, attrs[k]); if(html != null) e.innerHTML = html; return e; };
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
  const phone = () => innerWidth < 900;
  // where this copy of the site lives (the real domain, or a sub-path on a preview mirror), so Share links the game's own page, which carries its preview
  const SITE = (() => { const m = /githack/.test(location.host) ? location.pathname.match(/^(\/[^\/]+\/[^\/]+\/[^\/]+)\//) : location.pathname.match(/^(.*)\/(tour|games)\//), base = m ? m[1] : '';
    return {base, page: path => location.origin + base + path + (base ? 'index.html' : '')}; })();
  const v3 = a => new V3(a[0], a[1], a[2]);
  // anything that goes wrong is kept where a test can read it (FEAST3D.errors), as well as in the console
  const ERRS = [], oops = (what, e) => { ERRS.push(what + ': ' + String(e && e.message || e).slice(0, 200)); try{ console.error('[feast] ' + what, e); }catch(_){} };
  addEventListener('error', e => { if(/feast/.test(String(e.filename || ''))) ERRS.push('error: ' + String(e.message).slice(0, 200) + ' @' + e.lineno); });
  addEventListener('unhandledrejection', e => { const t = String(e.reason && e.reason.stack || e.reason); if(/feast/.test(t)) ERRS.push('rejection: ' + t.slice(0, 200)); });

  /* ================================================================== which clue set */
  let HUNT = ((/[?&]hunt=([ab])\b/i.exec(location.search) || [])[1] || '').toLowerCase();
  if(!HUNT){ const last = store.get('feast3d.last'); HUNT = last === 'a' ? 'b' : last === 'b' ? 'a' : (new Date().getDate() % 2 ? 'a' : 'b'); }

  /* ================================================================== the places you can stand */
  const EYE = 5.3, L0 = -4.56, L2 = 5.57, TER = -4.8;
  const PLACES = {
    table:   {name: 'Terrace', floor: 'lower', pos: [7.4, TER + EYE, -45.4], face: [-2.2, -2.0, -43.9], fov: 60, map: [5.5, -44],
      note: 'Pavers under the heritage oak, with an outdoor kitchen, a barbecue and a ceramic smoker under the pergola.'},
    lounge:  {name: 'Bonus lounge', floor: 'lower', pos: [-12.6, L0 + EYE, -16.2], face: [-20, -1.6, -21.5], map: [-17, -19.5],
      note: 'A big screen, a drinks counter with its own fridge, and stacking glass doors that open straight onto the terrace.'},
    office:  {name: 'Office', floor: 'lower', pos: [-27.8, L0 + EYE, -10.6], face: [-24.3, -1.9, -8.0], map: [-27, -7.5],
      note: 'A quiet room downstairs with a door that shuts, lit from above by two skylights.'},
    porch:   {name: 'Front porch', floor: 'main', pos: [-6.4, EYE, 5.4], face: [0.4, 2.3, 12.6], map: [-6.5, 11.8],
      note: 'The front deck, with two loungers that look down the paver walk to Hillside Drive.'},
    entry:   {name: 'Entry', floor: 'main', pos: [-5.6, EYE, -0.6], face: [-5.3, 4.7, -8], map: [-6.0, -5.0],
      note: 'A cathedral ceiling, a starburst light, and iron-and-glass doors at both ends. The oak is straight ahead.'},
    living:  {name: 'Living room', floor: 'main', pos: [1.8, EYE, -3.6], face: [8.5, 3.1, -3.0], map: [8.5, -3.5],
      note: 'Fir beams cross the vaulted ceiling. This room is part of the original 1920s house.'},
    kitchen: {name: 'Kitchen', floor: 'main', pos: [12.8, EYE, 8.4], face: [11.2, 3.7, 20], map: [13.0, 13.5],
      note: 'Quartz counters, a long peninsula, a gas range under a glass hood, and a pantry beside the big fridge.'},
    coffee:  {name: 'Coffee bar', floor: 'main', pos: [15.0, EYE, 9.3], face: [21.0, 3.1, 10.9], map: [23.5, 9.0],
      note: 'A coffee bar tucked in beside the kitchen, with a drinks fridge under the counter and a microwave above it.'},
    great:   {name: 'Great room', floor: 'main', pos: [11.2, EYE, 31.95], face: [10.7, 3.3, 22.0], fov: 56, map: [9.0, 30.5],
      note: 'The kitchen, the dining table and this sitting area share one long room with a wall of glass.'},
    loft:    {name: 'Loft', floor: 'upper', pos: [-19.5, L2 + EYE, -11.5], face: [-23.6, 8.2, -6.2], map: [-21.3, -8],
      note: 'A sitting area at the top of the stairs, with cable railings and skylights overhead.'},
    primary: {name: 'Primary bedroom', floor: 'upper', pos: [-12.0, L2 + EYE - .1, -28.2], face: [-18.6, 9.8, -34.2], map: [-16.5, -32],
      note: 'A cathedral ceiling, a walk-in closet, and stacking glass doors to a private balcony.'},
    balcony: {name: 'Balcony', floor: 'upper', pos: [-17.7, L2 + EYE, -41.7], face: [-23.2, 10.2, -47.4], map: [-17.7, -44],
      note: 'A private balcony off the primary bedroom that looks west over the hills.'}};
  const CATSAYS = {lounge: 'Movie night is down here. I get the good pouf.', office: 'The door shuts. I have opinions about that.', porch: 'I watch the front walk from the window. Nobody gets past me.',
    entry: 'Everyone who comes in looks up, then straight through at the oak.', living: 'The beams are a hundred years old. I have climbed none of them. Yet.', kitchen: 'Four doors on that fridge and I cannot open one of them.',
    coffee: 'They call this the coffee bar. I call it the cupboard with the treats.', great: 'The sofa is mine from nine until five.', loft: 'Top of the stairs. Best place to watch everybody.', primary: 'I am not allowed on this bed. I am on it most days.', balcony: 'I watch birds from here. They know.'};
  const ORDER = ['table', 'lounge', 'office', 'porch', 'entry', 'living', 'kitchen', 'coffee', 'great', 'loft', 'primary', 'balcony'];
  const FLOORS = [['upper', 'Upstairs', /^SP-L2-/], ['main', 'Main floor', /^SP-L1-/], ['lower', 'Downstairs', /^SP-L0-/]];
  // walkable graph: the main-floor edges are the ones escape.js ray-checked; the rest were ray-checked the same way (FEAST3D.audit()).
  // Anything not joined here is reached by a short fade, with footsteps for the stairs.
  const NODES = {a1: [4.4, -4.9], a2: [11.4, -4.9], a3: [12.6, -1.0], a4: [12.75, 5.1], j1: [15.7, 12.4], j2: [15.8, 17.2], s1: [15.2, 26.4], s2: [14.3, 31.6],
    t1: [-11.4, -18.9, .7], t2: [-8.4, -18.9, .55], t3: [-2.5, -21.5, .5], t4: [3.2, -27, .5], t5: [4.6, -36, .5], b1: [-13.2, -36.6, 10.8], b2: [-15.2, -39.6, 10.85]};
  const EDGES = [['entry', 'living'], ['living', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'], ['a4', 'kitchen'], ['kitchen', 'coffee'], ['kitchen', 'j1'], ['coffee', 'j1'],
    ['j1', 'j2'], ['j2', 's1'], ['s1', 's2'], ['s2', 'great'],
    ['lounge', 't1'], ['t1', 't2'], ['t2', 't3'], ['t3', 't4'], ['t4', 't5'], ['t5', 'table'], ['primary', 'b1'], ['b1', 'b2'], ['b2', 'balcony']];
  for(const k of ORDER) NODES[k] = [PLACES[k].pos[0], PLACES[k].pos[2]];
  const NODE_Y = k => PLACES[k] ? PLACES[k].pos[1] : NODES[k][2] != null ? NODES[k][2] : EYE;
  // where the "walk here" circles sit, seen from each place (out-of-view ones dock to the screen edge)
  const WALKS = {
    table:   [{to: 'lounge', at: [-9.6, -2.6, -18.9]}, {to: 'entry', at: [-5.4, -1.0, -13.6], label: 'Up the steps to the entry'}],
    lounge:  [{to: 'table', at: [-9.2, -2.9, -19.6]}, {to: 'office', at: [-22.3, -2.4, -14.4]}, {to: 'entry', at: [-20.9, -2.2, -12.8], label: 'Upstairs to the entry'}],
    office:  [{to: 'lounge', at: [-24.9, -2.3, -12.3]}],
    porch:   [{to: 'entry', at: [-5.7, 3.6, 3.2]}],
    entry:   [{to: 'living', at: [0.4, 2.6, -3.0]}, {to: 'porch', at: [-5.7, 3.2, 2.8]}, {to: 'table', at: [-5.7, 3.0, -7.4], label: 'Out to the terrace'}, {to: 'loft', at: [-10.6, 4.4, -5.4], label: 'Upstairs to the loft'}, {to: 'lounge', at: [-10.6, 1.6, -2.0], label: 'Downstairs to the lounge'}],
    living:  [{to: 'entry', at: [-3.4, 2.4, -1.6]}, {to: 'kitchen', at: [12.7, 3.3, 4.7]}],
    kitchen: [{to: 'living', at: [12.75, 3.2, 5.3]}, {to: 'coffee', at: [17.0, 2.6, 9.7]}, {to: 'great', at: [15.7, 2.2, 18.2]}],
    coffee:  [{to: 'kitchen', at: [12.3, 2.8, 8.6]}, {to: 'great', at: [15.8, 1.6, 15.2]}],
    great:   [{to: 'kitchen', at: [15.5, 3.2, 16.6]}],
    loft:    [{to: 'primary', at: [-19.6, 8.6, -15.6]}, {to: 'entry', at: [-16.4, 8.0, -11.2], label: 'Downstairs to the entry'}],
    primary: [{to: 'balcony', at: [-17.7, 8.6, -40.0]}, {to: 'loft', at: [-19.6, 8.8, -26.0]}],
    balcony: [{to: 'primary', at: [-15.8, 8.6, -40.0]}]};

  /* ================================================================== the things you can search
     at: where the gold ring sits.  pos/look/fit: the examine view.  prop: what stands there and where.  show: where a find hovers. */
  const SPOTS = {
    note:        {place: 'table', kind: 'note', label: 'Snowball’s note', at: [0.2, -2.1, -43.6], pos: [3.3, .25, -43.9], look: [0.2, -2.25, -43.6], fit: {w: 2.2, h: 1.6}},
    _table:      {place: 'table', kind: 'table', label: 'Dinner table', at: [-2.6, -2.0, -43.7], pos: [4.3, .35, -45.5], look: [-2.4, -.55, -43.7], fit: {w: 7.4, h: 5.6}},
    smoker:      {place: 'table', kind: 'smoker', label: 'Smoker', at: [0.65, -.9, -48.8], pos: [3.4, .3, -45.9], look: [0.65, -1.15, -48.8], fit: {w: 3.4, h: 3.6},
      title: 'The ceramic smoker', text: 'It was lit early this morning. The dial says the turkey needs a little longer, and Snowball’s rules say it comes last.'},
    coolerLounge:{place: 'lounge', kind: 'cooler', label: 'Drinks fridge', at: [-20.9, -3.0, -22.6], pos: [-17.9, -1.5, -20.3], look: [-21.0, -3.15, -22.6], fit: {w: 2.6, h: 3.1}, center: [-21.8, -3.1, -22.6], hinge: 'min',
      title: 'The lounge drinks fridge', text: 'Under the counter in the bonus lounge, a few steps from the glass doors to the terrace.', act: 'Open it'},
    coolerCoffee:{place: 'coffee', kind: 'cooler', label: 'Drinks fridge', at: [19.64, 1.9, 11.5], pos: [19.64, 2.3, 8.3], look: [19.64, 1.72, 11.7], fit: {w: 2.5, h: 3.1}, center: [19.64, 1.45, 12.5], hinge: 'min',
      title: 'The coffee bar drinks fridge', text: 'Smoked glass, under the coffee bar counter, with the microwave on the shelf above it.', act: 'Open it'},
    fridge:      {place: 'kitchen', kind: 'fridge', label: 'Big fridge', at: [18.4, 3.6, 8.0], pos: [15.4, 4.8, 11.1], look: [18.4, 3.3, 8.0], fit: {w: 3.4, h: 5.6},
      title: 'The big fridge', text: 'Four doors of stainless steel in the kitchen, with the pantry cupboard beside it.', act: 'Open it'},
    boxDining:   {place: 'great', kind: 'box', label: 'Pie box', at: [10.35, 2.9, 22.45], pos: [14.4, 5.2, 25.2], look: [10.35, 2.7, 22.45], fit: {w: 2.6, h: 2}, prop: {at: [10.35, 2.5, 22.45], ry: .5},
      title: 'A box on the dining table', text: 'The dining table sits beside the great room’s wall of glass.', act: 'Lift the lid'},
    boxSitting:  {place: 'great', kind: 'box', label: 'Pie box', at: [10.87, 1.8, 29.62], pos: [11.3, 5.0, 32.6], look: [10.87, 1.55, 29.62], fit: {w: 2.6, h: 2}, prop: {at: [10.87, 1.4, 29.62], ry: -.3},
      title: 'A box on the sofa table', text: 'The low table in the sitting area, between the sofa and the big windows.', act: 'Lift the lid'},
    boxLiving:   {place: 'living', kind: 'box', label: 'Pie box', at: [6.56, 1.75, -2.92], pos: [3.0, 4.7, -3.3], look: [6.56, 1.55, -2.92], fit: {w: 2.6, h: 2}, prop: {at: [6.56, 1.35, -2.92], ry: .2},
      title: 'A box on the coffee table', text: 'The living room table, under the fir beams.', act: 'Lift the lid'},
    boxBistro:   {place: 'lounge', kind: 'box', label: 'Pie box', at: [-14.44, -1.7, -22.5], pos: [-14.7, -.2, -18.8], look: [-14.44, -1.95, -22.5], fit: {w: 2.6, h: 2}, prop: {at: [-14.44, -2.11, -22.5], ry: .3},
      title: 'A box on the lounge table', text: 'The round glass table in the bonus lounge.', act: 'Lift the lid'},
    bagPrimary:  {place: 'primary', kind: 'bag', label: 'Paper bag', at: [-15.3, 7.8, -33.2], pos: [-12.3, 10.1, -31.0], look: [-15.3, 7.9, -33.2], fit: {w: 2.2, h: 2.6}, prop: {at: [-15.3, 7.21, -33.2], ry: 1.2}, decoy: 'mouse',
      title: 'A bag at the foot of the bed', text: 'On the bench in the primary bedroom. Look up and count the skylights.', act: 'Look in the bag'},
    bagOffice:   {place: 'office', kind: 'bag', label: 'Paper bag', at: [-24.2, -1.5, -9.1], pos: [-27.4, -.5, -8.7], look: [-24.2, -1.45, -9.1], fit: {w: 2.2, h: 2.6}, prop: {at: [-24.2, -2.06, -9.1], ry: -1.3}, decoy: 'ball',
      title: 'A bag on the office desk', text: 'On the desk in the office downstairs. Look up and count the skylights.', act: 'Look in the bag'},
    bagLoft:     {place: 'loft', kind: 'bag', label: 'Paper bag', at: [-23.85, 7.6, -5.8], pos: [-20.7, 10.3, -8.4], look: [-23.85, 7.7, -5.8], fit: {w: 2.2, h: 2.6}, prop: {at: [-23.85, 7.03, -5.8], ry: -1.0}, decoy: 'acorn',
      title: 'A bag on the loft bench', text: 'On the bench at the top of the stairs. Look up and count the skylights.', act: 'Look in the bag'},
    bagGreat:    {place: 'great', kind: 'bag', label: 'Paper bag', at: [15.6, .6, 33.2], pos: [15.3, 4.6, 29.4], look: [15.6, .7, 33.2], fit: {w: 2.2, h: 2.6}, prop: {at: [15.6, 0, 33.2], ry: 2.9}, decoy: 'leaf',
      title: 'A bag beside the sofa', text: 'At the far end of the great room, past the kitchen and the dining table.', act: 'Look in the bag'},
    bagEntry:    {place: 'entry', kind: 'bag', label: 'Paper bag', at: [-8.9, .6, -5.6], pos: [-6.0, 4.4, -3.2], look: [-8.9, .7, -5.6], fit: {w: 2.2, h: 2.6}, prop: {at: [-8.9, 0, -5.6], ry: 1.0}, decoy: 'cone',
      title: 'A bag in the entry', text: 'Just inside the front doors, under the cathedral ceiling.', act: 'Look in the bag'},
    bagKitchen:  {place: 'kitchen', kind: 'bag', label: 'Paper bag', at: [8.6, 3.6, 15.75], pos: [10.4, 5.7, 10.4], look: [8.6, 3.6, 15.75], fit: {w: 2.2, h: 2.6}, prop: {at: [8.6, 3.01, 15.75], ry: 2.6}, decoy: 'duck',
      title: 'A bag on the peninsula', text: 'On the long quartz peninsula, where the kitchen meets the great room.', act: 'Look in the bag'},
    bagBalcony:  {place: 'balcony', kind: 'bag', label: 'Paper bag', at: [-17.7, 7.75, -45.05], pos: [-17.7, 10.3, -42.0], look: [-17.7, 7.8, -45.05], fit: {w: 2.2, h: 2.6}, prop: {at: [-17.7, 7.17, -45.05], ry: 3.14}, decoy: 'cone',
      title: 'A bag between the balcony chairs', text: 'On the side table, with the western hills beyond the railing.', act: 'Look in the bag'},
    bagPorch:    {place: 'porch', kind: 'bag', label: 'Paper bag', at: [0.95, 2.0, 9.6], pos: [-2.3, 4.3, 9.3], look: [0.95, 2.0, 9.6], fit: {w: 2.2, h: 2.6}, prop: {at: [0.95, 1.44, 9.6], ry: -1.5}, decoy: 'leaf',
      title: 'A bag on a porch lounger', text: 'On the front porch, looking down the walk to the street.', act: 'Look in the bag'},
    bagSofa:     {place: 'table', kind: 'bag', label: 'Paper bag', at: [-2.25, -2.9, -32.55], pos: [1.3, -.4, -30.4], look: [-2.25, -2.9, -32.55], fit: {w: 2.2, h: 2.6}, prop: {at: [-2.25, -3.5, -32.55], ry: 1.2}, decoy: 'duck',
      title: 'A bag by the terrace sofas', text: 'On the low table between the wicker sofas, under the oak.', act: 'Look in the bag'},
    wallMirror:  {place: 'lounge', kind: 'wall', label: 'Wall with the mirror', at: [-13.5, -1.0, -25.5], pos: [-15.6, -.3, -19.7], look: [-13.5, -1.3, -25.6], fit: {w: 4.4, h: 4.8},
      title: 'The wall with the round mirror', text: 'A painted wall at the far end of the lounge, behind the round table.'},
    wallArt:     {place: 'lounge', kind: 'wall', label: 'Wall with the painting', at: [-15.3, -1.2, -12.8], pos: [-15.8, -.4, -18.4], look: [-15.3, -1.5, -12.7], fit: {w: 5.2, h: 5.2},
      title: 'The wall with the circle painting', text: 'The big painted circle hangs here, over two poufs.'},
    wallPanel:   {place: 'lounge', kind: 'wall', label: 'Wall by the glass doors', at: [-12.2, -2.1, -12.8], pos: [-13.6, -.6, -17.4], look: [-12.3, -2.3, -12.6], fit: {w: 3.4, h: 5.4},
      title: 'The wall by the glass doors', text: 'A plain painted wall with a faint line around part of it. The stairs run above this corner.'}};

  /* ================================================================== the two hunts */
  const DISH = {cider: 'the cider', pie: 'the pie', sauce: 'the cranberry sauce', potatoes: 'the sweet potatoes', candles: 'the candles', rolls: 'the rolls', turkey: 'the turkey'};
  const DISHCAP = {cider: 'Cider', pie: 'The pie', sauce: 'Cranberry sauce', potatoes: 'Sweet potatoes', candles: 'Candles', rolls: 'Rolls', turkey: 'The turkey'};
  const KNOCK = {solid: 'Tok, tok. Solid.', hollow: 'Tonk, tonk. Hollow.'};
  // Trail a is Snowball's: it climbs to the top of the house and follows the sun. Trail b is Biscuit's: it stays low, in the shade and near the food.
  // The hints are always Snowball's, whoever wrote the clue.
  const HUNTS = {
    a: {by: 'Snowball', steps: [
      {dish: 'cider', who: 'Snowball', spots: ['coolerLounge', 'fridge', 'coolerCoffee'], answer: 'coolerLounge',
        clue: 'The cider is somewhere cold. This house has three cold places. Mine is the only one you can reach from the dinner table without using the stairs. Biscuit carried it, and Biscuit does not do stairs.',
        wrong: {fridge: 'Butter, eggs, and more whipped cream than one pie needs. No cider. This fridge is also a full flight of stairs above the table.', coolerCoffee: 'Oat milk and sparkling water for the coffee bar. No cider, and the table is a floor below.'},
        found: 'Cold cider, right where Snowball said. The lounge opens straight onto the terrace, so it is a short walk to the table.',
        thanks: 'Thankful for the downstairs fridge. It is a short trot from the terrace, and the door opens with one paw.',
        hints: ['The dinner table is outside, on the terrace. Start there and count stairs.', 'One room opens onto the terrace through glass doors. It has a fridge of its own.', 'The bonus lounge. I will walk you there.']},
      {dish: 'pie', who: 'Snowball', spots: ['boxDining', 'boxLiving', 'boxBistro'], answer: 'boxDining',
        clue: 'The pie is having a nap in the sun. I recommend it. There are three pie boxes on three tables, and two are fakes. Only one table has sun on it right now.',
        wrong: {boxLiving: 'Napkins, nicely folded. This table is in the shade all afternoon.', boxBistro: 'Napkins. There is no sun down here until tomorrow morning.'},
        found: 'Still warm. The afternoon sun comes through the great room windows and lands on this table.',
        thanks: 'Thankful for the big windows. I get a new sunny spot every hour.',
        hints: ['Sun comes in through glass. Find out which side of the house has it this afternoon.', 'The great room has a wall of windows facing the low sun. I am lying in the warm bit.', 'The dining table in the great room. Come on.']},
      {dish: 'sauce', who: 'Snowball', spots: ['bagPrimary', 'bagOffice', 'bagLoft'], answer: 'bagPrimary',
        clue: 'The cranberry sauce is in the room with four windows in the ceiling. Not two. Four. I counted twice, lying on my back.',
        wrong: {bagOffice: 'Biscuit’s tennis ball. The office has two skylights, which is two short.', bagLoft: 'One acorn from the oak. There are two skylights over the loft. Keep counting.'},
        found: 'Cranberry sauce, under four skylights. Each one has a shade you can close from bed.',
        thanks: 'Thankful for the windows in the ceiling. Sun by day and stars after dark. I have checked both.',
        hints: ['Look up. Some rooms have windows in the ceiling.', 'The office and the loft have two each. Try the top floor, past the loft.', 'The primary bedroom has four. Follow me.']},
      {dish: 'potatoes', who: 'Snowball', spots: ['wallPanel', 'wallMirror', 'wallArt'], answer: 'wallPanel',
        clue: 'The sweet potatoes are in my secret den. One wall in the lounge downstairs is really a door. It has no handle. Knock before you push.',
        wrong: {wallMirror: 'It does not move. That one is a wall.', wallArt: 'It does not move. That one is a wall, and now the painting is crooked. You straighten it.'},
        found: 'The wall swings open. There is a little room under the stairs, and the sweet potatoes are in it.',
        thanks: 'Thankful for the secret door. It is the one room where nobody looks for me.',
        hints: ['Downstairs, in the bonus lounge. Use your knuckles.', 'A hollow wall sounds different. Try the corner by the glass doors, where the stairs go over.', 'This one. I sleep in here on Tuesdays.']},
      {dish: 'candles', who: 'Snowball', spots: ['bagGreat', 'bagEntry', 'bagKitchen'], answer: 'bagGreat', map: 'great',
        clue: 'X marks the candles. I drew you a map of one floor. I did not write which floor. That would be too easy.',
        wrong: {bagEntry: 'A pine cone. You are close to the front doors, but the dots on the map go much further in.', bagKitchen: 'A rubber duck. The dots on the map go past the kitchen.'},
        found: 'Four candles in brass holders, beside the sofa at the far end of the great room.',
        thanks: 'Thankful for the long room. Kitchen at one end, sofa at the other, and I can hear a tin open from either.',
        hints: ['The map shows the front doors. Start there and follow the dots.', 'It is the main floor. The X is at the far end of the long room, past the kitchen and the dining table.', 'Beside the sofa in the great room. This way.']},
      {dish: 'rolls', who: 'Snowball', spots: ['bagBalcony', 'bagPorch', 'bagSofa'], answer: 'bagBalcony',
        clue: 'The rolls are keeping warm in the last of the sun. There are three places to sit outside. Only one of them faces the sunset.',
        wrong: {bagPorch: 'One red leaf. The porch faces the street and gets its sun in the morning.', bagSofa: 'A rubber duck. The terrace is already in the shade of the house.'},
        found: 'Warm rolls, facing the western hills. The balcony gets the last sun of the day.',
        thanks: 'Thankful for the balcony. Best sunset in the house, and the birds know I am watching.',
        hints: ['Find the sun. It is low now, so it is easy.', 'The sun goes down behind the hills. One seat upstairs looks straight at them.', 'The balcony, off the primary bedroom. After you.']}]},
    b: {by: 'Biscuit', steps: [
      {dish: 'cider', who: 'Biscuit', spots: ['coolerCoffee', 'fridge', 'coolerLounge'], answer: 'coolerCoffee',
        clue: 'The cider is somewhere cold. This house has three cold places. Mine is the only one with a microwave right above it. I always know where the microwave is.',
        wrong: {fridge: 'Butter, eggs, and more whipped cream than one pie needs. No cider, and no microwave over this one.', coolerLounge: 'Sodas for movie night. No cider, and no microwave down here.'},
        found: 'Cold cider, under the microwave at the coffee bar.',
        thanks: 'Thankful for the coffee bar. The microwave beeps and then there is food. Every time.',
        hints: ['Find the microwave first. It is not over the stove.', 'There is a small bar beside the kitchen for coffee. Look under its counter.', 'The coffee bar. I will show you.']},
      {dish: 'pie', who: 'Biscuit', spots: ['boxLiving', 'boxDining', 'boxSitting'], answer: 'boxLiving',
        clue: 'A pie should cool out of the sun. So should a dog. There are three pie boxes on three tables, and two of those tables are in the sun right now.',
        wrong: {boxDining: 'Napkins. This table is in full sun, and Biscuit would not approve.', boxSitting: 'Napkins. The sun is all over this table.'},
        found: 'Cool and safe. The living room keeps its shade all afternoon.',
        thanks: 'Thankful for the living room. It stays cool all afternoon, and the beams are even older than I am.',
        hints: ['Two of the tables are by the big west windows. Look at the floor around them.', 'The great room is full of sun. The other table is under the beams.', 'The living room coffee table. Come on.']},
      {dish: 'sauce', who: 'Biscuit', spots: ['bagOffice', 'bagLoft', 'bagPrimary'], answer: 'bagOffice',
        clue: 'The cranberry sauce is under two windows in the ceiling. It is not in a bedroom, and it is not at the top of the stairs. I have never been to the top of the stairs.',
        wrong: {bagLoft: 'One acorn from the oak. Two skylights, yes, but this is the top of the stairs.', bagPrimary: 'Snowball’s toy mouse. This is a bedroom, and it has four skylights.'},
        found: 'Cranberry sauce, on the office desk under two skylights.',
        thanks: 'Thankful for the office. Two skylights, a door that shuts, and a quiet floor to lie on.',
        hints: ['Look up. Three rooms have bags, and all three have skylights.', 'It is downstairs. The room with a desk in it.', 'The office. Follow me.']},
      {dish: 'potatoes', who: 'Biscuit', spots: ['wallPanel', 'wallMirror', 'wallArt'], answer: 'wallPanel',
        clue: 'The sweet potatoes are in Snowball’s secret den. It is under the stairs, behind a door that looks like a wall. I found it with my nose. Knock first.',
        wrong: {wallMirror: 'It does not move. That one is a wall.', wallArt: 'It does not move. That one is a wall, and now the painting is crooked. You straighten it.'},
        found: 'The wall swings open. There is a little room under the stairs, and the sweet potatoes are in it.',
        thanks: 'Thankful for the secret door. For a long time I thought it was a wall.',
        hints: ['The stairs come down into the bonus lounge. Look at the walls there.', 'A hollow wall sounds different. Try the corner by the glass doors.', 'This one. I sleep in here on Tuesdays.']},
      {dish: 'candles', who: 'Biscuit', spots: ['bagKitchen', 'bagEntry', 'bagGreat'], answer: 'bagKitchen', map: 'kitchen',
        clue: 'X marks the candles. Snowball drew the map, because my paws are too big for the pencil. He would not say which floor it is.',
        wrong: {bagEntry: 'A pine cone. You are close to the front doors, but the dots on the map go further in.', bagGreat: 'One red leaf. The dots on the map stop before they get this far.'},
        found: 'Four candles in brass holders, on the kitchen peninsula.',
        thanks: 'Thankful for the peninsula. It is very long, and things fall off both sides.',
        hints: ['The map shows the front doors. Start there and follow the dots.', 'It is the main floor. The dots stop in the kitchen.', 'On the peninsula. This way.']},
      {dish: 'rolls', who: 'Biscuit', spots: ['bagPorch', 'bagBalcony', 'bagSofa'], answer: 'bagPorch',
        clue: 'The rolls are on a seat outside. It is the only one where you can watch who is coming up the front walk. That is my job.',
        wrong: {bagBalcony: 'A pine cone, enjoying the hills. You cannot see the front walk from up here.', bagSofa: 'A rubber duck. From the terrace you can see the oak, but not the street.'},
        found: 'Warm rolls on the porch lounger, with a clear view down the walk to Hillside Drive.',
        thanks: 'Thankful for the front porch. I can see who is coming before the doorbell goes.',
        hints: ['The front walk is on the street side of the house.', 'There are two loungers outside the front doors.', 'The front porch. After you.']}]}};
  const STEPS = HUNTS[HUNT].steps, LETTERS = 'THANKS';
  const HOURS = [15.0, 15.5, 16.0, 16.4, 16.8, 17.2];   // the sun, by how many dishes are on the table (the engine's mid-October sun)
  const SLOT = {turkey: [0, 0, 0], potatoes: [-1.84, .04, 0], rolls: [-2.8, -.04, 0], pie: [1.72, -.02, 0], sauce: [2.5, .34, 0], cider: [2.72, -.36, .6], candles: [0, 0, 0]};
  const PLURAL = {candles: 1, rolls: 1, potatoes: 1};
  // what is on the shelves of the two drinks fridges, front row, door side: [from, to] along the shelf, and the shelf heights
  const STOCK = {coolerLounge: {a: [-21.42, -23.2], b: [-21.42, -22.0], ys: [-3.83, -3.19, -2.55], kind: 'soda'}, coolerCoffee: {a: [19.02, 12.1], b: [20.25, 12.1], ys: [.73, 1.37, 2.01], kind: 'milk'}};
  const TABLE = [-2.6, -2.27, -43.7], CHAIR = [2.0, -2.98, -43.7];   // the table top, and the seat of the chair at its near end

  /* ================================================================== state */
  const S = {started: false, done: false, t0: 0, tEnd: 0, hints: 0, peeks: 0, phase: 'boot', step: 0, place: null, ex: null, busy: false, carry: null, tried: {}, knocked: {}, hot: null,
    visited: {}, coach: {look: false, walk: false, tap: false}, dragPx: 0, lastProgress: 0, onTable: [], hour: 15, hintIx: 0, lit: false};
  const elapsed = () => S.t0 ? ((S.tEnd || performance.now()) - S.t0) / 1000 : 0;
  const cur = () => STEPS[S.step];

  /* ================================================================== the engine keeps out of the way */
  const css0 = `html.fe header.bar, html.fe #card, html.fe #mini, html.fe #cv27, html.fe #labels, html.fe #wplabels, html.fe #ovtag, html.fe #tod, html.fe #viewBtn,
    html.fe #hwBtn, html.fe #tgBtn, html.fe #phMore, html.fe .g28pill, html.fe #navHelp, html.fe #pad, html.fe #peek27, html.fe #v33disc, html.fe #hint, html.fe #joy,
    html.fe .navguide, html.fe .phtoast, html.fe .perfpill, html.fe #wptip, html.fe #door28tip, html.fe #door28hint, html.fe .qhint, html.fe .phlvbar, html.fe #ov{display:none!important}
    html.fe.fe-up #loading{display:none!important}
    html.fe #c{cursor:grab;touch-action:none} html.fe.fe-drag #c{cursor:grabbing}`;
  document.head.appendChild(el('style', {}, css0)); document.documentElement.classList.add('fe');
  H.hooks.click = () => true;
  const ptrs = new Map(); let pinch = 0;
  const onCanvas = e => e.target === canvas;
  addEventListener('pointerdown', e => { if(!onCanvas(e)) return; e.stopPropagation();
    if(!S.started || S.done && !S.free) return; try{ canvas.setPointerCapture(e.pointerId); canvas.focus({preventScroll: true}); }catch(_){}
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), far: 0}); pinch = 0;
    document.documentElement.classList.add('fe-drag'); SND.unlock(); closeMenu(); }, true);
  addEventListener('pointermove', e => { if(!onCanvas(e)) return; e.stopPropagation(); const p = ptrs.get(e.pointerId); if(!p) return;
    if(e.pointerType === 'mouse' && e.buttons === 0){ endPtr(e, false); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.far = Math.max(p.far, Math.hypot(p.x - p.sx, p.y - p.sy));
    if(ptrs.size >= 2){ const [a, b] = [...ptrs.values()], d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); if(pinch) rig.zoom = clamp(rig.zoom * pinch / d, .5, 1); pinch = d; return; }
    rigDrag(dx, dy); }, true);
  function endPtr(e, tap){ const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); pinch = 0; if(!ptrs.size) document.documentElement.classList.remove('fe-drag');
    try{ canvas.releasePointerCapture(e.pointerId); }catch(_){}
    if(tap && p && p.far < 7 && performance.now() - p.t < 450) tapAt(e.clientX, e.clientY); }
  addEventListener('pointerup', e => { if(onCanvas(e)) e.stopPropagation(); if(ptrs.has(e.pointerId)) endPtr(e, onCanvas(e)); }, true);
  addEventListener('pointercancel', e => { if(onCanvas(e)) e.stopPropagation(); if(ptrs.has(e.pointerId)) endPtr(e, false); }, true);
  canvas.addEventListener('lostpointercapture', e => { if(ptrs.has(e.pointerId)) endPtr(e, false); });
  addEventListener('blur', () => { ptrs.clear(); pinch = 0; document.documentElement.classList.remove('fe-drag'); });
  document.addEventListener('visibilitychange', () => { if(document.hidden){ ptrs.clear(); pinch = 0; document.documentElement.classList.remove('fe-drag'); } });
  addEventListener('wheel', e => { if(!onCanvas(e)) return; e.stopPropagation(); e.preventDefault(); if(!S.started || (S.done && !S.free) || rig.move) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1); rig.zoom = clamp(rig.zoom * Math.exp(clamp(dy, -240, 240) * .0016), .5, 1); }, {capture: true, passive: false});
  for(const t of ['dblclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend', 'click', 'mousedown', 'mouseup', 'mousemove']) addEventListener(t, e => { if(onCanvas(e)){ e.stopPropagation(); if(t === 'contextmenu') e.preventDefault(); } }, {capture: true, passive: t !== 'contextmenu'});
  // keys: the tour's shortcuts (arrows and space jump between tour stops) must never fire during the game
  addEventListener('keydown', e => { const dlg = document.querySelector('dialog[open]'); if(dlg) return; e.stopPropagation();
    if(!S.started || S.done) return; const tag = (e.target && e.target.tagName) || '';
    if(e.key === 'Escape'){ if(menuOpen()) closeMenu(); else if(mapOpen() && phone()) setMap(false); else if(clueOpen()) closeClue(); else if(S.ex) back(); return; }
    if(/INPUT|TEXTAREA|SELECT/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
    if(tag === 'BUTTON' || tag === 'A') return;
    const k = {ArrowLeft: [.16, 0], ArrowRight: [-.16, 0], ArrowUp: [0, .1], ArrowDown: [0, -.1]}[e.key];
    if(k && !rig.move){ e.preventDefault(); rigTurn(k[0], k[1]); S.dragPx += 60; } }, true);
  addEventListener('keyup', e => { if(!document.querySelector('dialog[open]')) e.stopPropagation(); }, true);

  /* ================================================================== camera rig (as escape.js) */
  const rig = {pos: new V3(), yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, fov: 62, zoom: 1, off: [0, 0], lim: null, move: null, wakeN: 0, jit: 0, sig: ''};
  const yp = (from, to) => { const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2]; return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
  const aspect = () => (canvas.clientWidth || innerWidth) / Math.max(1, canvas.clientHeight || innerHeight);
  function placeFov(base){ base = base || 62; const a = aspect(); if(a >= 1.25) return base; const t = Math.tan(base / 2 * Math.PI / 180) * 1.25 / a; return Math.min(86, 2 * Math.atan(t) * 180 / Math.PI); }
  function fitFov(fit, dist, free){ const a = aspect(), tv = (fit.h / 2 / dist) / free.fh, th = (fit.w / 2 / dist) / (free.fw * a); return clamp(2 * Math.atan(Math.max(tv, th) * 1.1) * 180 / Math.PI, 22, 86); }
  function wake(n){ rig.wakeN = Math.max(rig.wakeN, n || 20); }
  function rigDrag(dx, dy){ if(rig.move || !S.started || (S.done && !S.free)) return; const k = (camera.fov * Math.PI / 180) / Math.max(200, canvas.clientHeight) * 1.05;
    rigTurn(dx * k, dy * k); S.dragPx += Math.abs(dx) + Math.abs(dy); }
  function rigTurn(dyaw, dpitch){ rig.tyaw += dyaw; rig.tpitch += dpitch;
    if(rig.lim){ const L = rig.lim; rig.tyaw = L.yaw + clamp(angDiff(L.yaw, rig.tyaw), -L.ry, L.ry); rig.tpitch = clamp(rig.tpitch, L.pitch - L.rp, L.pitch + L.rp); }
    else rig.tpitch = clamp(rig.tpitch, -1.05, 1.15); }
  function rigCut(pos, yaw, pitch, fov, off){ rig.move = null; rig.pos.set(pos[0], pos[1], pos[2]); rig.yaw = rig.tyaw = yaw; rig.pitch = rig.tpitch = pitch; rig.fov = fov; rig.off = off || [0, 0]; rig.zoom = 1; rig.sig = ''; rig.lim = null; }
  function rigTravel(pts, to, opts){ opts = opts || {}; const v = pts.map(p => new V3(p[0], p[1], p[2]));
    let len = 0; for(let i = 1; i < v.length; i++) len += v[i].distanceTo(v[i - 1]);
    const curve = v.length > 2 ? new THREE.CatmullRomCurve3(v, false, 'centripetal', .5) : null;
    const dur = reduce ? .01 : (opts.dur || clamp(.55 + len / 12, .8, 4.2));
    rig.move = {t0: performance.now(), dur: dur * 1000, v, curve, len, face: !!opts.face && len > 9, yaw0: rig.yaw, pitch0: rig.pitch, fov0: rig.fov * rig.zoom, off0: rig.off.slice(),
      yaw1: to.yaw, pitch1: to.pitch, fov1: to.fov, off1: to.off || [0, 0], done: opts.done || null};
    rig.zoom = 1; rig.fov = rig.move.fov0; rig.lim = null; return dur; }
  const _p = new V3(), _t = new V3();
  function rigStep(now, dt){
    const m = rig.move;
    if(m){ const u = clamp((now - m.t0) / m.dur, 0, 1), e = ease(u);
      if(m.curve){ m.curve.getPointAt(e, _p); rig.pos.copy(_p); } else rig.pos.lerpVectors(m.v[0], m.v[m.v.length - 1], e);
      let yaw = m.yaw0 + angDiff(m.yaw0, m.yaw1) * (m.face ? smooth(.45, 1, u) : e), pitch = lerp(m.pitch0, m.pitch1, e);
      if(m.face && m.curve){ m.curve.getTangentAt(clamp(e, .001, .999), _t); const ty = Math.atan2(-_t.x, -_t.z), w = smooth(0, .25, u) * (1 - smooth(.5, .92, u));
        const base = m.yaw0 + angDiff(m.yaw0, m.yaw1) * smooth(.45, 1, u); yaw = base + angDiff(base, ty) * w; pitch = lerp(pitch, -.06, w * .8); }
      rig.yaw = rig.tyaw = yaw; rig.pitch = rig.tpitch = pitch; rig.fov = lerp(m.fov0, m.fov1, e); rig.off = [lerp(m.off0[0], m.off1[0], e), lerp(m.off0[1], m.off1[1], e)];
      if(u >= 1){ rig.move = null; rig.yaw = rig.tyaw = m.yaw1; rig.pitch = rig.tpitch = m.pitch1; rig.fov = m.fov1; rig.off = m.off1.slice(); if(m.done) try{ m.done(); }catch(err){ oops('arrive', err); } }
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

  /* ================================================================== small timed animations */
  const TW = [];
  function tween(ms, fn, done){ const t = {t0: performance.now(), ms: reduce ? Math.min(ms, 40) : ms, fn, done}; TW.push(t); return t; }
  function tweens(now){ for(let i = TW.length - 1; i >= 0; i--){ const t = TW[i], u = clamp((now - t.t0) / t.ms, 0, 1); try{ t.fn(u); }catch(e){ oops('tween', e); }
      if(u >= 1){ TW.splice(TW.indexOf(t), 1); if(t.done) try{ t.done(); }catch(e){ oops('tween end', e); } } } if(TW.length) wake(3); }
  const later = (ms, fn) => setTimeout(() => { try{ fn(); }catch(e){ oops('later', e); } }, reduce ? Math.min(ms, 120) : ms);

  /* ================================================================== routes */
  function route(a, b){ if(a === b) return [a]; const adj = {}; for(const [p, q] of EDGES){ const d = Math.hypot(NODES[p][0] - NODES[q][0], NODES[p][1] - NODES[q][1]); (adj[p] = adj[p] || []).push([q, d]); (adj[q] = adj[q] || []).push([p, d]); }
    const dist = {[a]: 0}, prev = {}, open = new Set([a]);
    while(open.size){ let u = null; for(const k of open) if(u == null || dist[k] < dist[u]) u = k; open.delete(u); if(u === b) break;
      for(const [w, d] of (adj[u] || [])){ const nd = dist[u] + d; if(dist[w] == null || nd < dist[w]){ dist[w] = nd; prev[w] = u; open.add(w); } } }
    if(dist[b] == null) return null; const out = [b]; let c = b; while(prev[c]){ c = prev[c]; out.unshift(c); } return out[0] === a ? out : null; }

  /* ================================================================== sun: the hour moves with the hunt, and sunlight lands on the floor
     (the engine draws no indoor sun patches; this is the same projection escape.js uses, through the real window openings) */
  const DOY = 288;
  function sunDir(h){ const p = H.sunPosition(h, DOY), plan = p.az - 46.14 * Math.PI / 180, alt = Math.max(p.alt, -.02);
    return new V3(Math.cos(plan) * Math.cos(alt), Math.sin(alt), Math.sin(plan) * Math.cos(alt)).normalize(); }
  if(!H.TOD.find(t => t.key === 'feast')) H.TOD.push({key: 'feast', label: 'Afternoon', h: 15, doy: DOY});
  function setHour(h){ S.hour = h; S.tod = 'feast'; const T = H.TOD.find(t => t.key === 'feast'); T.h = h; T.doy = DOY; try{ H.setTOD('feast'); }catch(e){ oops('tod', e); } LIGHT.update(); wake(30); }
  function setTod(key){ S.tod = key; S.hour = key === 'golden' ? 17.75 : 18.75; try{ H.setTOD(key); }catch(e){ oops('tod', e); } LIGHT.update(); wake(30); }
  const LIGHT = {planes: [], update(){ for(const r of LIGHT.planes) r.update(); }};
  function opening(id){ const o = H.BIM2S.meta.openings.find(q => q.id === id); if(!o) return null; const c = W2(o.center[0], o.center[1]), a = W2(o.axis[0], o.axis[1]), n = W2(o.normal[0], o.normal[1]);
    return {o, c, a, n, P: (along, y) => new V3(c[0] + a[0] * along, y, c[1] + a[1] * along)}; }
  // a horizontal surface (a floor, a table top) lit through one or more openings; poly is its outline in world (x, z)
  function lightPlane(poly, y, wins, opts){ opts = opts || {}; const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const bb = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], ppf = opts.ppf || 30, fy = y + .03;
    const cv = document.createElement('canvas'); cv.width = Math.ceil((bb[2] - bb[0]) * ppf); cv.height = Math.ceil((bb[3] - bb[1]) * ppf); const g = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.premultiplyAlpha = true; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const mat = new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(bb[2] - bb[0], bb[3] - bb[1]), mat); mesh.rotation.x = -Math.PI / 2; mesh.position.set((bb[0] + bb[2]) / 2, fy, (bb[1] + bb[3]) / 2);
    mesh.renderOrder = 2; mesh.name = 'feast-light'; mesh.raycast = () => {}; H.grp('main').add(mesh);
    const px = v => [(v.x - bb[0]) * ppf, (v.z - bb[1]) * ppf];
    const W = wins.map(w => { const op = opening(w.id); if(!op) return null; const half = op.o.width / 2 - (w.inset == null ? .2 : w.inset), top = w.top || op.o.head - .25, bot = w.bot == null ? op.o.sill + .1 : w.bot;
      return {w, op, quad: [op.P(-half, bot), op.P(half, bot), op.P(half, top), op.P(-half, top)], bars: (w.bars || []).map(b => [op.P(b[0], b[2]), op.P(b[1], b[2]), op.P(b[1], b[3]), op.P(b[0], b[3])]), s: 0}; }).filter(Boolean);
    const api = {mesh, wins: W, lit: 0,
      update(){ const day = S.tod !== 'dusk', d = sunDir(S.hour), low = 1 - Math.min(1, d.y / .5); g.clearRect(0, 0, cv.width, cv.height); let any = false;
        const proj = v => { const t = (v.y - fy) / d.y; return new V3(v.x - d.x * t, fy, v.z - d.z * t); };
        if(day) for(const it of W){ const into = d.x * it.op.n[0] + d.z * it.op.n[1];
          const s = it.s = clamp((d.y - .02) / .09, 0, 1) * clamp((into - .12) / .25, 0, 1); if(s <= 0) continue; any = true;
          g.save(); g.globalAlpha = s; g.fillStyle = g.shadowColor = `rgb(255,${Math.round(238 - 46 * low)},${Math.round(206 - 86 * low)})`; g.shadowBlur = 3;
          g.beginPath(); it.quad.map(proj).forEach((p, i) => { const q = px(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill();
          g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1; g.shadowColor = g.fillStyle = '#000'; g.shadowBlur = 2;
          for(const b of it.bars){ g.beginPath(); b.map(proj).forEach((p, i) => { const q = px(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); }
          g.restore(); }
        if(any){ g.save(); g.globalCompositeOperation = 'destination-in'; g.beginPath(); poly.forEach((p, i) => { const q = px({x: p[0], z: p[1]}); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); g.restore(); }
        api.lit = any ? Math.max(...W.map(w => w.s)) : 0; mesh.visible = any; const gain = opts.gain || 1.35; mat.color.setRGB(gain, gain * .94, gain * .8); tex.needsUpdate = true; }};
    LIGHT.planes.push(api); return api; }
  const spacePoly = id => { const sp = H.BIM2S.meta.spaces.find(q => q.id === id); return sp ? (sp.poly || sp.polygon).map(p => W2(p[0], p[1])) : null; };
  const circle = (cx, cz, r) => { const o = []; for(let i = 0; i < 20; i++) o.push([cx + Math.cos(i / 20 * 6.283) * r, cz + Math.sin(i / 20 * 6.283) * r]); return o; };

  /* ================================================================== surgery on the model: doors that swing, a lid that lifts */
  // take the triangles that pick(centroid, ymin, ymax) chooses out of a merged mesh, as a mesh of their own
  function splitMesh(mesh, pick){ mesh.updateWorldMatrix(true, false);
    const g0 = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(), pos = g0.attributes.position, A = [], B = [], v = new V3(), c = new V3();
    for(let i = 0; i < pos.count; i += 3){ c.set(0, 0, 0); let y0 = 1e9, y1 = -1e9; for(let k = 0; k < 3; k++){ v.fromBufferAttribute(pos, i + k).applyMatrix4(mesh.matrixWorld); c.add(v); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); } c.multiplyScalar(1 / 3); (pick(c, y0, y1) ? A : B).push(i); }
    if(A.length < 2) return null;
    const sub = tris => { const ng = new THREE.BufferGeometry(); for(const name in g0.attributes){ const a = g0.attributes[name], sz = a.itemSize, arr = new Float32Array(tris.length * 3 * sz); let w = 0;
        for(const i of tris) for(let k = 0; k < 3; k++) for(let q = 0; q < sz; q++) arr[w++] = a.array[(i + k) * sz + q]; ng.setAttribute(name, new THREE.BufferAttribute(arr, sz)); } ng.computeBoundingBox(); ng.computeBoundingSphere(); return ng; };
    const mk = (tris, nm) => { const m = new THREE.Mesh(sub(tris), mesh.material); m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale); m.castShadow = mesh.castShadow; m.receiveShadow = mesh.receiveShadow; m.userData = mesh.userData; m.name = nm; mesh.parent.add(m); return m; };
    const part = mk(A, 'feast-part'), rest = B.length ? mk(B, mesh.name + '-rest') : null; mesh.visible = false; return {part, rest}; }
  // an under-counter drinks fridge: its door (with the glass) is hung on a hinge so it can open
  function hingeCooler(sp){ let bc = null, best = 1e9; const v = new V3(), box = new THREE.Box3(), want = v3(sp.center);
    H.scene.traverse(o => { if(o.name !== 'beverageCooler') return; box.setFromObject(o).getCenter(v); const d = v.distanceTo(want); if(d < best){ best = d; bc = o; } });
    if(!bc || best > 2.5) return null; const st = bc.children.find(c => c.name === 'stainless'); if(!st) return null;
    const all = new THREE.Box3().setFromObject(bc), mid = all.getCenter(new V3()), sb = new THREE.Box3().setFromObject(st), floorY = sb.min.y;
    const r = splitMesh(st, (c, y0, y1) => y1 > floorY + .36); if(!r) return null; if(r.rest) r.rest.name = 'stainless-toe';
    const db = new THREE.Box3().setFromObject(r.part), dc = db.getCenter(new V3()), alongZ = (db.max.x - db.min.x) < (db.max.z - db.min.z);
    const out = Math.sign((alongZ ? dc.x - mid.x : dc.z - mid.z) || 1), atMin = sp.hinge !== 'max';
    const pivot = new THREE.Group(); pivot.name = 'feast-cooler-hinge';
    if(alongZ) pivot.position.set(dc.x, 0, atMin ? db.min.z : db.max.z); else pivot.position.set(atMin ? db.min.x : db.max.x, 0, dc.z);
    H.scene.add(pivot); H.scene.updateWorldMatrix(true, true);
    for(const m of [r.part].concat(bc.children.filter(c => /^r8(glass|sheen|led)$/.test(c.name)))) pivot.attach(m);
    const sgn = alongZ ? out * (atMin ? 1 : -1) : -out * (atMin ? 1 : -1);
    const inside = mid.clone(); if(alongZ) inside.x = dc.x - out * .5; else inside.z = dc.z - out * .5; inside.y = floorY + 1.0;
    const front = dc.clone(); if(alongZ) front.x += out * 1.15; else front.z += out * 1.15; front.y = floorY + 1.5;
    return {pivot, k: 0, inside, front, set(k){ this.k = k; pivot.rotation.y = sgn * 1.75 * k; }}; }
  const COOL = {};
  // the ceramic smoker: the dome and what is fixed to it lift on a hinge at the back
  const SMK = {pivot: null, k: 0, c: [0.654, -48.82], seam: -1.2, emit: null, set(k){ this.k = k; if(this.pivot) this.pivot.rotation.x = -.9 * k; }};
  function buildSmoker(){ let grp = null; H.GROUPS.yard.children.forEach(o => { if(o.name === 'outdoorKitchen27') grp = o; });
    const near = c => Math.hypot(c.x - SMK.c[0], c.z - SMK.c[1]) < 1.5;
    try{ const cer = grp && grp.children.find(o => o.isMesh && o.name === 'k28ceramic'); if(cer){ const a = splitMesh(cer, (c, y0) => near(c) && y0 > SMK.seam - .03); if(a){ a.part.material = cer.material.clone(); a.part.material.side = THREE.DoubleSide; const parts = [a.part];
          for(const o of grp.children.slice()){ if(!o.isMesh || o === cer || !o.visible || /^k28(ceramic|ao)|^feast|-rest$/.test(o.name)) continue; try{ const b = splitMesh(o, (c, y0) => near(c) && y0 > SMK.seam + .04 && c.y > SMK.seam + .1); if(b) parts.push(b.part); }catch(e){} }
          const pv = SMK.pivot = new THREE.Group(); pv.name = 'feast-smoker-hinge'; pv.position.set(SMK.c[0], SMK.seam, SMK.c[1] - 1.03); H.scene.add(pv); H.scene.updateWorldMatrix(true, true); for(const m of parts) pv.attach(m);
          // inside: a grate over a bed of coals
          const gr = P.grate(.99); gr.position.set(SMK.c[0], SMK.seam - .1, SMK.c[1]); } } }catch(e){ oops('smoker', e); SMK.pivot = null; }
    SMK.emit = P.emitter({at: new V3(SMK.c[0], -.12, SMK.c[1]), rate: 0, size: .5, rise: .8, drift: [.34, .1], life: 3.4, color: '#dfe3e8', alpha: .34, grow: 2.6}); }

  // the game is played in the house as it is staged: furniture on, nothing moved or removed. What the visitor chose in the tour's
  // Design tab is put back in storage afterwards, so their own arrangement is still there when they return to the tour.
  function asStaged(){ try{ const F = window.__hillsideDesign && window.__hillsideDesign.FURN; if(!F) return 'no handle';
      const ls = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } }, put = (k, v) => { try{ if(v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }catch(e){} };
      const o = ls('hillside.furniture'), e = ls('hillside.furniture.edits.v1'); let did = '';
      if(!F.isOn()){ F.setOn(true); put('hillside.furniture', o); did += 'on '; }
      const ed = F.edits(); if(ed && (Object.keys(ed.mv || {}).length || (ed.rm || []).length)){ F.reset(); put('hillside.furniture.edits.v1', e); did += 'reset'; }
      return did || 'as staged'; }catch(e){ oops('furniture', e); return 'error'; } }

  /* ================================================================== props in the house */
  let P = null;
  const PROP = {}, DISHOBJ = {}, TAGS = [], SETTINGS = [];
  let BUNT = null, noteProp = null, candleLight = null, flames = [], SUNSP = null;
  const _sd = new V3();
  function sunStep(){ if(!SUNSP) return; const day = S.tod !== 'dusk'; SUNSP.visible = day; if(!day) return; const d = sunDir(S.hour), low = 1 - Math.min(1, d.y / .5); SUNSP.position.copy(camera.position).addScaledVector(d, 52000); SUNSP.scale.setScalar(13000 + 5000 * low); SUNSP.material.color.setRGB(1, 1 - .22 * low, 1 - .5 * low); }
  function decorOff(name, cx, cz){ const b = new THREE.Box3(), c = new V3(); for(const k of Object.keys(H.GROUPS)) for(const o of H.GROUPS[k].children){ if(o.name !== name) continue; b.setFromObject(o).getCenter(c); if(Math.hypot(c.x - cx, c.z - cz) < 1.6) o.children.forEach(q => { if(q.name === 'decor') q.visible = false; }); } }
  function buildWorld(){
    P = window.FEASTPROPS(H);
    // the dinner table: runner, eight places, pumpkins and leaves; the moss bowl makes room for the turkey
    try{ H.GROUPS.yard.children.forEach(o => { if(o.name === 'bowl') o.visible = false; }); }catch(e){}
    const T = new THREE.Group(); T.name = 'feast-table'; T.position.set(TABLE[0], TABLE[1], TABLE[2]); P.root.add(T); PROP.table = T;
    T.add(P.runner(6.7, 1.3));
    for(const s of [-1, 1]) [-2.75, -1.05, 1.05, 2.75].forEach((x, i) => { const st = P.setting(s > 0); st.position.set(x, .004, s * 1.22); st.rotation.y = s > 0 ? 0 : Math.PI; T.add(st); SETTINGS.push(st); });
    const pk = [['#d9772b', .19, -3.36, .38], ['#efe6d2', .14, -3.3, -.42], ['#9aa884', .12, 3.38, -.3], ['#d9772b', .12, .98, .42], ['#efe6d2', .11, -.98, -.42]];
    for(const [hex, r, x, z] of pk){ const p = P.pumpkin(r, hex); p.position.set(x, .012, z); p.rotation.y = x * 2; T.add(p); }
    [['#b5471d', -2.2, .48], ['#c98a12', -1.3, -.5], ['#8c2b3d', 1.35, .5], ['#c98a12', 2.3, -.46], ['#b5471d', .5, -.5], ['#8c2b3d', -.45, .52], ['#c98a12', 3.05, .42], ['#b5471d', -3.2, -.1]].forEach(([hex, x, z], i) => { const l = P.leaf(hex, .2 + (i % 3) * .03); l.position.set(x, .02, z); l.rotation.z = i * 1.1; T.add(l); });
    // Snowball's note: a kraft tag lying on the runner by the near end of the table
    noteProp = P.tag('?', true); noteProp.rotation.set(-Math.PI / 2, 0, .35); noteProp.position.set(3.2, .03, .3); T.add(noteProp);
    // the string for the letter tags, across the table, hung from the pergola
    BUNT = P.bunting([-3.2, 2.05, -47.5], [-2.4, 2.05, -39.9], .45, 6); P.root.add(BUNT);
    for(const e of [[-3.2, -47.5], [-2.4, -39.9]]){ const s = P.mesh(new THREE.CylinderGeometry(.008, .008, 3.0, 4), P.std('#b5894e', {roughness: 1}), e[0], 2.05 + 1.5, e[1]); P.root.add(s); }
    // dishes: built once, hidden until found
    for(const id of Object.keys(P.DISH)){ const g = P.DISH[id](); g.visible = false; P.root.add(g); DISHOBJ[id] = g; }
    // bags and boxes
    for(const id in SPOTS){ const sp = SPOTS[id]; if(!sp.prop || !STEPS.some(st => st.spots.includes(id))) continue; const g = sp.kind === 'box' ? P.box() : P.bag(); g.position.set(...sp.prop.at); g.rotation.y = sp.kind === 'bag' ? Math.atan2(sp.pos[0] - sp.prop.at[0], sp.pos[2] - sp.prop.at[2]) : (sp.prop.ry || 0); P.root.add(g); PROP[id] = g; }
    for(const [n, x, z] of [['drumTable', 6.56, -2.92], ['drumTable', 10.87, 29.62], ['bistroTable', -14.44, -22.5]]) try{ decorOff(n, x, z); }catch(e){}
    // the secret base under the stairs: a crate to put things on
    const cr = P.crate(); cr.position.set(-12.3, L0 + .03, -11.25); cr.rotation.y = .12; P.root.add(cr); PROP.crate = cr;
    // sunlight indoors
    try{ const gp = spacePoly('SP-L1-GREAT'), kp = spacePoly('SP-L1-KITCHEN'); const big = [{id: 'WN-L1-03', bars: [[-.17, .17, 0, 9]]}];
      if(gp) LIGHT.great = lightPlane(gp, 0, big, {ppf: 26});
      LIGHT.dining = lightPlane(circle(10.69, 21.37, 2.08), 2.5, big, {ppf: 40, gain: 1.15});
      LIGHT.sitting = lightPlane(circle(10.87, 29.62, 1.78), 1.4, big, {ppf: 40, gain: 1.15});
      if(kp) LIGHT.kitchen = lightPlane(kp, 0, [{id: 'WN-L1-02'}], {ppf: 22}); }catch(e){ oops('light', e); }
    try{ COOL.coolerLounge = hingeCooler(SPOTS.coolerLounge); COOL.coolerCoffee = hingeCooler(SPOTS.coolerCoffee); }catch(e){ oops('coolers', e); }
    buildSmoker();
    for(const id in STOCK){ const K = STOCK[id], cols = ['#b5232c', '#2d6b3c', '#e0862a', '#c9ccd0', '#2f5fb8']; let n = 0;
      K.ys.forEach((y, r) => { for(let i = 0; i < 5; i++){ if(r === 1 && i > 0 && i < 4) continue; const t = i / 4, it = K.kind === 'soda' ? P.can(cols[(n++) % 5]) : P.bottle((n++) % 3 ? 'milk' : 'water'); it.position.set(lerp(K.a[0], K.b[0], t), y + .012, lerp(K.a[1], K.b[1], t)); it.rotation.y = n; P.root.add(it); } }); }
    // where each dish starts
    stash(); makeCat();
    SUNSP = P.sun();
    candleLight = new THREE.PointLight(lin('#ffc27a'), 0, 13, 1.6); candleLight.position.set(TABLE[0], TABLE[1] + 1.7, TABLE[2]); P.root.add(candleLight);
    // the glass doors that stand open: the lounge onto the terrace, the bedroom onto the balcony
    for(const id of ['D-L0-10', 'D-L2-01']) door(id, true);
    door('D-L0-05', false);
  }
  function door(id, open){ try{ const it = (H.door28 && H.door28.items || []).find(q => q.id === id); if(!it || !H.door28.moving) return false; if((open && it.t > .98) || (!open && it.t < .02)) return true; it.dir = open ? 1 : -1; it.lt = performance.now(); H.door28.moving.add(it); wake(90); return true; }catch(e){ return false; } }
  // put every hidden dish where it was left
  function stash(){ for(const st of STEPS){ const sp = SPOTS[st.answer], g = DISHOBJ[st.dish]; g.visible = false; g.scale.setScalar(1); g.rotation.set(0, 0, 0); if(st.dish === 'candles') g.userData.spread(0);
      if(sp.kind === 'wall'){ const top = PROP.crate.position.clone(); top.y += PROP.crate.userData.top; g.position.copy(top); g.visible = true; }
      else if(sp.kind === 'cooler'){ const K = STOCK[st.answer]; g.position.set((K.a[0] + K.b[0]) / 2, K.ys[1] + .012, (K.a[1] + K.b[1]) / 2); g.scale.setScalar(.58); g.rotation.y = st.answer === 'coolerLounge' ? 0 : -Math.PI / 2; g.visible = true; }
      else { const b = PROP[st.answer]; g.position.copy(b.position).add(b.userData.inside); } }
    const t = DISHOBJ.turkey; t.position.set(SMK.c[0], SMK.seam - .09, SMK.c[1]); t.scale.setScalar(.95); t.rotation.y = -.5; t.visible = true; dress(t, false); }
  function dress(t, on){ (t.userData.dress || []).forEach(o => o.visible = on); }
  const showAt = id => { const sp = SPOTS[id]; if(sp.show) return v3(sp.show); if(sp.kind === 'cooler' && COOL[id]) return COOL[id].front.clone(); const b = PROP[id]; return b.position.clone().add(new V3(0, (b.userData.top || .4) + (sp.kind === 'box' ? .45 : .32), 0)); };

  /* ================================================================== Snowball in the house (a billboard of the shared drawing) */
  let CAT = null;
  function loadScript(src, has, cb){ if(has) return cb(); const s = document.createElement('script'); s.src = src; s.onload = cb; s.onerror = () => { oops('could not load ' + src); cb(); }; document.head.appendChild(s); }
  function makeCat(){ if(CAT || !window.SNOWBALL) return CAT; const img = new Image(), cv = document.createElement('canvas'); cv.width = 384; cv.height = 590;
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    img.onload = () => { cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); tex.needsUpdate = true; wake(4); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SNOWBALL.svg({id: 'sbf3d', seed: 7, glow: true}).replace('<svg ', '<svg width="384" height="590" '));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false, opacity: 0})); sp.center.set(.5, .03); sp.scale.set(.86, 1.32, 1); sp.visible = false; sp.name = 'feast-snowball'; sp.renderOrder = 5; sp.raycast = () => {};
    H.scene.add(sp); CAT = sp; return sp; }
  function catAt(p){ const c = makeCat(); if(!c) return; const go = () => { c.position.set(p[0], p[1], p[2]); c.visible = true; fadeCat(1); };
    if(c.visible && c.material.opacity > .05 && c.position.distanceTo(v3(p)) > .5){ fadeCat(0, go); } else go(); }
  function fadeCat(to, then){ const c = CAT; if(!c) return; const from = c.material.opacity, t0 = performance.now(); c._f = t0;
    (function f(){ if(c._f !== t0) return; const k = Math.min(1, (performance.now() - t0) / 380); c.material.opacity = lerp(from, to, k); wake(2); if(k < 1) requestAnimationFrame(f); else { if(to === 0) c.visible = false; if(then) then(); } })(); }
  // where he sits for the second and third hint of each kind of hiding place: on the floor, a step from it, toward where you stand
  function catNear(id){ const sp = SPOTS[id], pl = PLACES[sp.place], a = sp.prop ? sp.prop.at : sp.at, fl = pl.floor === 'upper' ? L2 : pl.floor === 'main' ? 0 : (sp.place === 'table' ? TER : L0);
    const dx = sp.pos[0] - a[0], dz = sp.pos[2] - a[2], d = Math.hypot(dx, dz) || 1; return [a[0] + dx / d * 1.5 + dz / d * .9, fl + .02, a[2] + dz / d * 1.5 - dx / d * .9]; }

  /* ================================================================== sound
     One small set, all Web Audio, the same recipe as escape.js: soft mallet and bell tones from a few decaying sine partials in
     D major pentatonic, filtered noise for doors, paper and steam, a short feedback delay for a little room, and a compressor
     before a quiet master. Nothing plays before the first tap; the context sleeps with the tab. SND.measure() renders every cue
     offline and reports its level (checked by number: nobody has listened to these). */
  const SND = (() => {
    const N = {D3: 146.83, A3: 220, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, B4: 493.88, D5: 587.33, E5: 659.26, Fs5: 739.99, A5: 880, B5: 987.77, D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760, B6: 1975.53};
    const MASTER = .5, K = reduce ? .6 : 1;
    let ac = null, C = null, muted = store.get('feast3d.mute') === true;
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
      steps:  (c, t, n) => { for(let i = 0; i < (n || 3); i++){ noise(c, t + .1 + i * .44, .012, .1, .5, 'lowpass', 170, 110); } },
      slide:  (c, t) => { noise(c, t, .09, .62, .2, 'bandpass', 320, 880, 1.1); noise(c, t, .12, .55, .07, 'highpass', 2400); thud(c, t + .7, 96, 58, .3); },
      paper:  (c, t) => { noise(c, t, .01, .1, .16, 'highpass', 2600); noise(c, t + .12, .012, .14, .13, 'bandpass', 3600, 2200, .8); noise(c, t + .27, .01, .1, .1, 'highpass', 3000); },
      wrong:  (c, t) => { mallet(c, N.E4, t, .3, .16); mallet(c, N.D4, t + .16, .5, .16); },
      find:   (c, t) => { [N.D5, N.Fs5, N.A5, N.D6].forEach((f, i) => mallet(c, f, t + i * .09, 1.2 - i * .1, .15)); ting(c, N.A6, t + .4, .05); ting(c, N.B6, t + .5, .04); },
      fridge: (c, t) => { thud(c, t, 150, 76, .3); noise(c, t + .03, .05, .5, .06, 'bandpass', 700, 300, .6); },
      knockS: (c, t) => { for(const d of [0, .2]){ const o = part(c, 330, t + d, .003, .07, .34); o.frequency.exponentialRampToValueAtTime(250, t + d + .05); noise(c, t + d, .002, .03, .2, 'bandpass', 1400, 900, 1.2); } },
      knockH: (c, t) => { for(const d of [0, .22]){ const o = part(c, 150, t + d, .004, .34, .5); o.frequency.exponentialRampToValueAtTime(96, t + d + .2); part(c, 224, t + d, .004, .2, .14); noise(c, t + d, .002, .04, .14, 'lowpass', 500); } },
      creak:  (c, t) => { noise(c, t, .14, .7, .12, 'bandpass', 420, 900, 3); thud(c, t + .85, 110, 64, .26); },
      lid:    (c, t) => { thud(c, t, 130, 70, .36); noise(c, t + .1, .25, 1.6, .12, 'highpass', 3800); noise(c, t + .15, .3, 1.3, .06, 'bandpass', 1200, 500, .7); },
      clink:  (c, t) => { ting(c, N.D6, t, .09); ting(c, N.A6, t + .05, .06); thud(c, t, 180, 120, .16); },
      tag:    (c, t, i) => { const f = [N.D5, N.E5, N.Fs5, N.A5, N.B5, N.D6][clamp(i || 0, 0, 5)]; mallet(c, f, t, .9, .17); ting(c, f * 2, t + .02, .04); },
      spell:  (c, t) => { [N.D5, N.E5, N.Fs5, N.A5, N.B5, N.D6].forEach((f, i) => mallet(c, f, t + i * .11, 1.4, .13)); bell(c, N.D5, t + .75, 2.6, .12); },
      flame:  (c, t, i) => { noise(c, t, .03, .2, .1, 'bandpass', 900, 2600, .8); mallet(c, [N.A5, N.B5, N.D6, N.Fs6][clamp(i || 0, 0, 3)], t + .06, 1.1, .12); },
      bell:   (c, t) => { bell(c, N.Fs5, t, 2.6, .2); bell(c, N.D5, t + .68, 3.2, .2); },
      chord:  (c, t) => { [N.D3, N.A3, N.D4, N.Fs4, N.A4, N.E5].forEach((f, i) => { part(c, f, t + i * .04, .12, 3.4, f < 200 ? .1 : .07); part(c, f * 1.003, t + i * .04, .16, 2.8, .03, 'triangle'); }); bell(c, N.D5, t + .3, 3, .1); bell(c, N.A5, t + .42, 2.6, .07); },
      shutter:(c, t) => { noise(c, t, .002, .03, .3, 'highpass', 3000); noise(c, t + .09, .003, .05, .24, 'bandpass', 2200, 1600, 1.2); thud(c, t, 150, 90, .12); },
      jingle: (c, t) => { ting(c, N.B6, t, .075); ting(c, N.A6 * 1.01, t + .075, .06); ting(c, N.B6 * .995, t + .17, .07); }};
    const live = () => { if(muted) return null; try{ if(!ac){ const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null; ac = new AC(); C = chain(ac); }
        if(ac.state === 'suspended' && !document.hidden) ac.resume(); return C; }catch(e){ return null; } };
    document.addEventListener('visibilitychange', () => { try{ if(!ac) return; if(document.hidden) ac.suspend(); else if(!muted) ac.resume(); }catch(e){} });
    const play = (name, arg) => { const c = live(); if(!c || document.hidden) return; try{ CUES[name](c, c.a.currentTime + .03, arg); }catch(e){} };
    const api = {get muted(){ return muted; }, cues: Object.keys(CUES),
      setMuted(v){ muted = !!v; store.set('feast3d.mute', muted); try{ if(ac){ C.master.gain.setTargetAtTime(muted ? 0 : MASTER, ac.currentTime, .03); if(!muted && !document.hidden) ac.resume(); } }catch(e){} },
      unlock(){ live(); }, state(){ return ac ? ac.state : 'not started'; },
      async measure(){ const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, out = {}; if(!OAC) return out;
        for(const name of Object.keys(CUES)){ const sr = 44100, o = new OAC(1, sr * 7, sr), c = chain(o); CUES[name](c, .05, name === 'steps' ? 4 : name === 'tag' || name === 'flame' ? 3 : undefined);
          const d = (await o.startRendering()).getChannelData(0); let peak = 0, sq = 0, clip = 0, last = 0, maxStep = 0;
          for(let i = 0; i < d.length; i++){ const v = d[i], a = Math.abs(v); if(a > peak) peak = a; sq += v * v; if(a >= .999) clip++; if(a > .001) last = i; if(i && Math.abs(v - d[i - 1]) > maxStep) maxStep = Math.abs(v - d[i - 1]); }
          const n = Math.max(1, last); let s2 = 0; for(let i = 0; i < n; i++) s2 += d[i];
          out[name] = {peak: +peak.toFixed(3), peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rmsDb: +(10 * Math.log10(sq / n || 1e-12)).toFixed(1), seconds: +((last / sr) - .05).toFixed(2), dc: +(s2 / n).toFixed(5), clipped: clip, maxStep: +maxStep.toFixed(3), end: +Math.abs(d[d.length - 1]).toFixed(5)}; }
        return out; }};
    for(const k of Object.keys(CUES)) api[k] = arg => play(k, arg);
    return api; })();

  /* ================================================================== UI */
  const css = `
  #feRoot{--ink:#1f2a3a;--mut:#5c6575;--navy:#1f2948;--paper:#fbfaf7;--gold:#c98a12;--wine:#9b2c3c;--kraft:#d9bb8f;--kink:#3f2c17;position:fixed;inset:0;z-index:60;pointer-events:none;font-family:Jost,"Avenir Next","Helvetica Neue",Arial,sans-serif;color:var(--ink);-webkit-tap-highlight-color:transparent}
  #feRoot button{font:inherit;cursor:pointer}
  #feRoot .feChip{pointer-events:auto;color:var(--ink);background:rgba(251,250,247,.95);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:16px;box-shadow:0 8px 30px rgba(15,20,35,.2)}
  #feTop{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) 0 max(14px,env(safe-area-inset-left))}
  #feGoal{padding:11px 16px 12px;max-width:420px;min-width:0;border-left:4px solid var(--gold);transition:transform .35s cubic-bezier(.2,.8,.2,1)}
  #feGoal .k{display:flex;gap:8px;align-items:baseline;justify-content:space-between;font-size:12.5px;color:var(--mut);letter-spacing:.02em}
  #feGoal .k b{font-weight:500;color:var(--ink)}
  #feGoal p{margin:3px 0 0;font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:20px;line-height:1.18}
  #feGoal p.hand{font:400 20.5px/1.2 "Caveat Brush","Marker Felt",cursive;color:#2b2336;letter-spacing:.01em}
  #feGoal .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}#feGoal .acts:empty{display:none}
  #feGoal.new{animation:feNew .9s ease}
  @keyframes feNew{0%{transform:translateY(-6px);box-shadow:0 0 0 0 rgba(232,184,74,.9),0 8px 30px rgba(15,20,35,.2)}40%{transform:none;box-shadow:0 0 0 10px rgba(232,184,74,0),0 8px 30px rgba(15,20,35,.2)}100%{transform:none}}
  #feBtns{display:flex;gap:8px;align-items:flex-start;flex:none}
  #feHint{display:flex;align-items:center;gap:10px;border:0;padding:6px 14px 6px 6px;text-align:left;min-height:52px}
  #feHint .av{width:42px;height:42px;border-radius:50%;background:radial-gradient(circle at 50% 35%,#34416b,#1a2340);overflow:hidden;display:grid;place-items:end center;flex:none}
  #feHint .av svg{width:40px;height:auto;margin-bottom:-3px}
  #feHint b{display:block;font-size:14.5px;font-weight:500;line-height:1.15}#feHint small{font-size:12.5px;color:var(--mut)}
  #feHint.nudge{animation:feNudge 1.6s ease-in-out infinite}
  @keyframes feNudge{0%,100%{box-shadow:0 8px 30px rgba(15,20,35,.2),0 0 0 0 rgba(232,184,74,.8)}60%{box-shadow:0 8px 30px rgba(15,20,35,.2),0 0 0 12px rgba(232,184,74,0)}}
  .feIco{width:52px;height:52px;border:0;display:grid;place-items:center;padding:0}.feIco svg{width:22px;height:22px}
  #feMenu{position:absolute;right:max(14px,env(safe-area-inset-right));top:calc(max(14px,env(safe-area-inset-top)) + 60px);padding:8px;display:none;flex-direction:column;min-width:220px;z-index:5}
  #feMenu.on{display:flex}#feMenu button,#feMenu a{border:0;background:none;text-align:left;padding:11px 12px;border-radius:10px;font-size:15px;color:var(--ink);text-decoration:none}
  #feMenu button:hover,#feMenu a:hover{background:#eceae4}
  #feSay{max-width:min(330px,calc(100vw - 28px));background:#fff;border-radius:16px 4px 16px 16px;padding:10px 15px 11px;font:400 20.5px/1.2 "Caveat Brush","Marker Felt",cursive;color:#2b2336;box-shadow:0 10px 30px rgba(15,20,35,.22);opacity:0;transform:translateY(-6px);transition:.3s;pointer-events:none}
  #feSay.on{opacity:1;transform:none}#feSay small{display:block;font:500 11.5px Jost,sans-serif;color:var(--mut);letter-spacing:.03em;margin-bottom:1px}
  #feL,#feR{display:flex;flex-direction:column;gap:8px;min-width:0}#feL{align-items:flex-start}#feR{align-items:flex-end;flex:none}
  #fePlace{max-width:400px;background:rgba(22,28,48,.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;border-radius:16px;padding:10px 16px 12px;opacity:0;transform:translateY(-8px);transition:opacity .5s,transform .5s;pointer-events:none}
  #fePlace.on{opacity:1;transform:none}#fePlace b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:25px;line-height:1.1}#fePlace span{display:block;font-size:14px;line-height:1.35;color:#dfe3ee;margin-top:3px}
  #feDock{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:flex-end;gap:12px;padding:0 max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}
  #feMapWrap{flex:0 0 288px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
  #feMap{padding:10px;position:relative;width:288px}
  #feMap h4{margin:0 0 6px;font-size:12.5px;font-weight:500;color:var(--mut);letter-spacing:.02em}#feMap h4 b{color:var(--ink);font-weight:500}
  #feMap .tabs{display:flex;gap:4px;margin:0 0 8px}
  #feMap .tabs button{flex:1;border:1px solid #d9d4c7;background:#fff;border-radius:999px;padding:6px 4px;font-size:12.5px;color:var(--ink);min-height:32px}
  #feMap .tabs button[aria-pressed=true]{background:var(--navy);border-color:var(--navy);color:#fff}
  #feMap .tabs button.here::after{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--gold);margin-left:5px;vertical-align:middle}
  #feMap .plan{position:relative;width:268px;height:188px}
  #feMap svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  #feMap .pl{position:absolute;transform:translate(-50%,-50%);border:1px solid rgba(31,41,72,.25);background:#fff;border-radius:999px;padding:3px 8px;font-size:11.5px;line-height:1.2;white-space:nowrap;color:var(--ink);box-shadow:0 2px 6px rgba(15,20,35,.12)}
  #feMap .pl:hover{border-color:var(--navy)}#feMap .pl[aria-current=true]{background:var(--navy);border-color:var(--navy);color:#fff}
  #feMap .pl::before{content:"";position:absolute;inset:-9px -4px}
  #feMapBtn{display:none;border:0;padding:0 16px 0 12px;min-height:48px;align-items:center;gap:8px;font-size:15px}
  #feMapBtn svg{width:18px;height:18px;flex:none}#feMapBtn small{color:var(--mut);font-size:13px}
  #feMapX{display:none}
  #feTags{flex:1 1 auto;display:flex;justify-content:center;align-items:flex-end;gap:7px;padding-bottom:4px;min-width:0}
  #feTags i{width:38px;height:50px;font:400 31px/54px "Caveat Brush","Marker Felt",cursive;font-style:normal;text-align:center;color:var(--kink);background:linear-gradient(160deg,#dcbd8c,#caa670);clip-path:polygon(22% 0,78% 0,100% 16%,100% 100%,0 100%,0 16%);opacity:.34;transform:rotate(var(--r,0deg));transition:opacity .4s,transform .5s cubic-bezier(.2,1.6,.4,1);filter:drop-shadow(0 3px 5px rgba(15,20,35,.3))}
  #feTags i.on{opacity:1}#feTags i.pop{transform:rotate(var(--r,0deg)) scale(1.3)}
  #feTags i:not(.on){color:transparent}
  #feDockR{flex:0 0 288px}
  #feCoach{position:absolute;left:50%;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 84px);transform:translate(-50%,8px);background:rgba(22,28,48,.86);color:#fff;border-radius:999px;padding:10px 18px 10px 12px;font-size:15.5px;display:flex;align-items:center;gap:10px;opacity:0;transition:opacity .4s,transform .4s;pointer-events:none;white-space:nowrap;max-width:calc(100% - 24px)}
  #feCoach.on{opacity:1;transform:translate(-50%,0)}#feCoach svg{width:26px;height:26px;flex:none}
  #feCoach.look svg{animation:feSwipe 1.8s ease-in-out infinite}@keyframes feSwipe{0%,100%{transform:translateX(-5px)}50%{transform:translateX(5px)}}
  .feMk{position:absolute;left:0;top:0;width:60px;height:60px;margin:-30px 0 0 -30px;border:0;background:none;padding:0;pointer-events:auto;opacity:0;visibility:hidden;transition:opacity .25s,visibility 0s linear .25s;will-change:transform}
  .feMk.on{opacity:1;visibility:visible;transition:opacity .25s}
  .feMk i{position:absolute;left:8px;top:8px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center}
  .feMk.look i{border:2.5px solid #fff;background:rgba(255,255,255,.14);box-shadow:0 0 0 4px rgba(232,184,74,.55),0 0 22px rgba(255,214,120,.85),inset 0 0 10px rgba(255,220,140,.5)}
  .feMk.look i::after{content:"";width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 8px #ffdc8c}
  .feMk.look.on i{animation:fePulse 2.2s ease-in-out infinite}
  .feMk.look.hot i{box-shadow:0 0 0 6px rgba(232,184,74,.95),0 0 34px 8px rgba(255,214,120,1),inset 0 0 10px rgba(255,220,140,.7)}.feMk.look.hot.on i{animation:fePulse .9s ease-in-out infinite}
  .feMk.walk i{background:rgba(255,255,255,.94);box-shadow:0 4px 14px rgba(15,20,35,.35);color:#1f2948}
  .feMk.walk i svg{width:22px;height:22px}
  .feMk.walk.first.on i{animation:fePulse 1.6s ease-in-out infinite}
  .feMk span{position:absolute;left:50%;top:56px;transform:translateX(-50%);white-space:nowrap;font:500 13px Jost,sans-serif;color:#fff;background:rgba(20,26,44,.82);padding:4px 10px;border-radius:999px}
  .feMk.edge span{top:50%;transform:translateY(-50%)}.feMk.edge.L span{left:58px}.feMk.edge.R span{left:auto;right:58px}
  .feMk:hover span{background:#1f2948}.feMk:focus-visible i{outline:3px solid #fff;outline-offset:3px}
  @keyframes fePulse{0%,100%{transform:scale(1)}50%{transform:scale(1.13)}}
  #feSheet{position:absolute;right:max(16px,env(safe-area-inset-right));top:calc(50% + 34px);width:min(384px,calc(100% - 28px));max-height:calc(100% - 196px);overflow:auto;background:var(--paper);border-radius:20px;box-shadow:0 20px 60px rgba(10,14,28,.38);padding:20px 20px 18px;transform:translate(24px,-50%);opacity:0;visibility:hidden;transition:opacity .3s,transform .3s,visibility 0s linear .3s;pointer-events:none}
  #feSheet.on{transform:translate(0,-50%);opacity:1;visibility:visible;pointer-events:auto;transition:opacity .3s,transform .3s}
  #feSheet h3{font-family:"Cormorant Garamond",Georgia,serif;font-size:28px;font-weight:600;margin:0 0 6px;line-height:1.05}
  #feSheet p{margin:0 0 10px;font-size:16px;line-height:1.45;color:#2b3442}
  #feSheet p.res{font-weight:500;color:var(--ink)}
  #feSheet .row{display:flex;flex-wrap:wrap;gap:8px;margin:12px -20px -18px;padding:10px 20px 18px;position:sticky;bottom:-18px;background:linear-gradient(rgba(251,250,247,0),var(--paper) 12px)}
  .feTagCard{position:relative;background:linear-gradient(160deg,#e2c595,#cfab74);color:var(--kink);border-radius:6px 14px 14px 6px;padding:14px 16px 13px 30px;margin:2px 0 12px;font:400 22px/1.2 "Caveat Brush","Marker Felt",cursive;box-shadow:0 6px 16px rgba(60,40,10,.2);transform:rotate(-.6deg)}
  .feTagCard::before{content:"";position:absolute;left:10px;top:50%;width:9px;height:9px;margin-top:-4.500px;border-radius:50%;background:var(--paper);box-shadow:inset 0 0 0 1.5px #b9945f}
  .feTagCard small{display:block;font:500 12px Jost,sans-serif;letter-spacing:.04em;color:#6b5230;margin-bottom:3px}
  .feTagCard .big{float:left;font-size:58px;line-height:.9;margin:2px 12px 0 0}
  .feTagCard img{display:block;width:100%;height:auto;border-radius:4px;margin:8px 0 2px;box-shadow:0 2px 8px rgba(60,40,10,.25)}
  .feTagCard + .feTagCard{transform:rotate(.5deg)}
  .feBtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid #cfcabe;background:#fff;color:var(--ink);border-radius:999px;padding:0 20px;min-height:46px;font:inherit;font-size:15.5px;cursor:pointer;text-decoration:none;pointer-events:auto;line-height:1.15}
  .feBtn:hover{border-color:#1f2948}.feBtn svg{width:18px;height:18px}
  .feBtn.primary{background:var(--wine,#9b2c3c);border-color:var(--wine,#9b2c3c);color:#fff}.feBtn.primary:hover{background:#842432}
  .feBtn.dark{background:#1f2948;border-color:#1f2948;color:#fff}.feBtn.dark:hover{background:#151c33}
  .feBtn.gold{background:#e8b84a;border-color:#e8b84a;color:#2a1d07;font-weight:500}
  .feBtn.light{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.4);color:#fff}.feBtn.light:hover{background:rgba(255,255,255,.2);border-color:#fff}
  .feBtn.sm{min-height:40px;padding:0 15px;font-size:14.5px}
  .feBtn[disabled]{opacity:.5;cursor:default}
  #feBack{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));display:none;box-shadow:0 8px 30px rgba(15,20,35,.25);min-height:52px;font-size:16px}
  #feToast{position:absolute;left:50%;top:15%;transform:translate(-50%,-10px);background:rgba(22,28,48,.9);color:#fff;font:500 15.5px Jost,sans-serif;padding:10px 18px;border-radius:999px;opacity:0;transition:.3s;pointer-events:none;max-width:calc(100% - 40px);text-align:center}
  #feToast.on{opacity:1;transform:translate(-50%,0)}
  #feRoot #feVoice{pointer-events:none}
  #feVoice{position:absolute;left:50%;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 10px);transform:translate(-50%,14px);width:min(500px,calc(100% - 24px));padding:13px 16px;display:flex;gap:12px;align-items:center;opacity:0;transition:opacity .4s,transform .4s;pointer-events:none}
  #feVoice.on{opacity:1;transform:translate(-50%,0)}
  #feVoice .av{flex:none;width:46px;height:46px;border-radius:50%;color:#fff;display:grid;place-items:center}#feVoice .av svg{width:27px;height:27px}
  #feVoice b{font-weight:500;font-size:16px}#feVoice small{color:#6a7282;font-size:13px;margin-left:6px}#feVoice p{margin:2px 0 0;font-size:16.5px;line-height:1.3}
  #feFade{position:fixed;inset:0;z-index:58;background:#0d111f;opacity:0;pointer-events:none;transition:opacity .32s ease}
  #feFade.on{opacity:1;pointer-events:auto}
  #feFlash{position:fixed;inset:0;z-index:95;background:#fff;opacity:0;pointer-events:none}#feFlash.on{animation:feFl .5s}@keyframes feFl{10%{opacity:.85}100%{opacity:0}}
  #feCard{position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(14,19,34,.5);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);font-family:Jost,"Avenir Next",Arial,sans-serif;padding:16px;overflow:auto;animation:feIn .45s ease;color:#1f2a3a}
  #feCard.side{background:none;backdrop-filter:none;-webkit-backdrop-filter:none;place-items:center end;pointer-events:none;padding-right:max(18px,env(safe-area-inset-right))}#feCard.side .c{pointer-events:auto;max-width:430px;max-height:calc(100% - 8px);overflow:auto}
  @keyframes feIn{from{opacity:0}to{opacity:1}}
  #feCard .c{background:#fbfaf7;color:#1f2a3a;border-radius:24px;max-width:540px;width:100%;padding:26px 26px 22px;box-shadow:0 30px 90px rgba(0,0,0,.45);animation:feUp .5s cubic-bezier(.2,.8,.2,1)}
  @keyframes feUp{from{transform:translateY(18px)}to{transform:none}}
  #feCard h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:clamp(34px,6vw,48px);font-weight:600;line-height:1;margin:0 0 10px}
  #feCard.side h2{font-size:clamp(30px,4vw,38px)}
  #feCard .k{font-size:13px;color:#5c6575;margin:0 0 6px;letter-spacing:.03em}
  #feCard .lede{font-family:"Cormorant Garamond",Georgia,serif;font-size:21px;line-height:1.32;margin:0 0 14px;color:#2b3442}
  #feCard .note{background:#fff;border:1px solid #e3e0d8;border-radius:4px;padding:15px 18px 12px;transform:rotate(-.7deg);box-shadow:0 6px 18px rgba(0,0,0,.09);font:400 22px/1.22 "Caveat Brush","Marker Felt",cursive;color:#2b2336;margin:0 0 18px}
  #feCard .note p{margin:0 0 7px}#feCard .note .sig{text-align:right;line-height:1}#feCard .note .paw{width:30px;height:30px;transform:rotate(-14deg);color:#2b2336;margin:0 4px -4px 0}#feCard .note .paw.big{width:42px;height:42px;transform:rotate(9deg);color:#6b4a1f;margin:0 2px -6px 0}#feCard .note .ps{font-size:19.5px;color:#5a4d63;margin:0}
  #feCard .how{list-style:none;margin:0 0 16px;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  #feCard .how li{background:#f1eee6;border-radius:14px;padding:10px 8px 9px;text-align:center;font-size:13.5px;line-height:1.25;color:#2b3442}
  #feCard .how svg{width:30px;height:30px;display:block;margin:0 auto 5px;color:#1f2948}
  #feCard .foot{font-size:13px;color:#5c6575;line-height:1.45;margin:14px 0 0}
  #feCard .acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  #feCard .stats{display:flex;gap:22px;margin:4px 0 14px;flex-wrap:wrap}#feCard .stats b{display:block;font-size:26px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.1}#feCard .stats span{font-size:13px;color:#5c6575}
  #feCard .stamp{display:inline-block;background:#e8b84a;color:#2a1d07;font:600 17px "Cormorant Garamond",Georgia,serif;padding:5px 12px;border-radius:999px;margin:0 0 10px;transform:rotate(-2deg)}
  #feCard .cta{background:#1f2948;color:#f4f1e8;border-radius:18px;padding:18px 18px 16px;margin:14px 0 14px}
  #feCard .cta b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:25px;font-weight:600;line-height:1.1;margin-bottom:6px}#feCard .cta span{display:block;font-size:15px;line-height:1.45;color:#d5dae8;margin-bottom:14px}
  #feCard .more{display:flex;flex-wrap:wrap;gap:8px}
  #feCard.clue .c{max-width:500px;max-height:calc(100% - 8px);overflow:auto}#feCard.clue .feTagCard img{max-height:62vh;width:auto;max-width:100%;margin:8px auto 2px}
  #feCard img.pc{width:100%;height:auto;border-radius:10px;display:block;box-shadow:0 8px 24px rgba(0,0,0,.25);margin:0 0 12px}
  .feLeaf{position:fixed;top:-30px;width:16px;height:22px;z-index:79;pointer-events:none;border-radius:60% 60% 60% 60%/70% 70% 40% 40%;animation:feFall linear forwards}
  @keyframes feFall{to{transform:translate(var(--dx),108vh) rotate(var(--rot))}}
  html.fe-ex #feMapWrap, html.fe-ex #feDockR, html.fe-ex #feTags{visibility:hidden}html.fe-ex #feBack{display:inline-flex}
  html.fe-cine #feRoot > *:not(#feToast):not(#feVoice){opacity:0!important;pointer-events:none!important;transition:opacity .4s}
  html.fe-cine #feRoot .feMk{display:none}
  html.fe-pre #feRoot{display:none}
  @media (max-width:1180px){#feDockR{display:none}}
  @media (max-width:899px){
    #feTop{flex-direction:column;align-items:stretch;gap:8px;padding-left:10px;padding-right:10px}#feL,#feR{display:contents}
    #feBtns{order:0;align-self:flex-end}#feGoal{order:1;max-width:none;padding:9px 14px 10px}#feGoal p{font-size:18.5px}#feGoal p.hand{font-size:19px}#feSay{order:2;align-self:flex-end}
    #feHint{padding:5px 12px 5px 5px;min-height:48px}#feHint small{display:none}.feIco{width:48px;height:48px}
    #fePlace{position:fixed;left:10px;right:10px;max-width:520px;margin:0 auto;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 70px);padding:8px 14px 10px}#fePlace b{font-size:22px}#fePlace span{font-size:13.5px}
    #feDock{align-items:center;gap:8px;padding-left:10px;padding-right:10px}
    #feMapWrap{flex:none;flex-direction:row}#feMapBtn{display:inline-flex}
    #feMap{display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);box-sizing:border-box;width:min(370px,calc(100% - 16px));padding:14px;z-index:6;box-shadow:0 20px 70px rgba(10,14,28,.5)}
    #feMap.on{display:block}#feMap .plan{width:100%;height:0;padding-bottom:70%}#feMap .pl{font-size:13.5px;padding:7px 11px}#feMap .tabs button{min-height:42px;font-size:14px}
    #feMapX{display:grid;position:absolute;right:6px;top:4px;width:44px;height:44px;border:0;background:none;place-items:center;font-size:24px;color:var(--mut)}
    #feTags{justify-content:flex-end;gap:4px;padding-bottom:0}#feTags i{width:30px;height:40px;font-size:25px;line-height:44px}
    #feCoach{top:auto;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 166px);font-size:14.5px}
    #feSheet{left:10px;right:10px;top:auto;bottom:max(10px,env(safe-area-inset-bottom));width:auto;max-width:560px;margin:0 auto;max-height:58vh;transform:translateY(20px);padding:16px 16px 14px}
    #feSheet.on{transform:none}#feSheet h3{font-size:24px}#feSheet p{font-size:15.5px}.feTagCard{font-size:20px}#feSheet .row{margin:10px -16px -14px;padding:8px 16px 14px;bottom:-14px}
    html.fe-ex #feDock{visibility:hidden}html.fe-ex #feBack{display:none}
    html.fe-ex #feGoal{display:none}
    #feCard .c{padding:20px 18px 18px}#feCard .note{font-size:20.5px}#feCard .lede{font-size:19px}
    #feCard.side{place-items:end center;padding:8px}#feCard.side .c{box-sizing:border-box;max-width:560px;max-height:60vh;padding:16px 16px 14px}#feCard.side .lede{display:none}#feCard.side h2{font-size:30px}
  }
  @media (prefers-reduced-motion:reduce){.feMk.on i,#feHint.nudge,#feCoach svg,.feLeaf{animation:none!important}}
  `;
  const ICO = {
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3l4.5-3.8v12.6L7 14.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3l4.5-3.8v12.6L7 14.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
    walk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/><path d="M6 19l6-6 6 6" opacity=".45"/></svg>',
    drag: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 17.5V8.2a1.9 1.9 0 0 1 3.8 0v6.3m0-1.6a1.9 1.9 0 0 1 3.8 0v2m0-.9a1.9 1.9 0 0 1 3.7 0v5.2c0 4.3-2.8 7.3-6.9 7.3-3.2 0-4.9-1.4-6.6-4.2l-3-5a1.9 1.9 0 0 1 3.2-2l2 2.5"/><path d="M4 7.5h5M4 7.5l2-2M4 7.5l2 2M28 7.5h-5M28 7.5l-2-2M28 7.5l-2 2"/></svg>',
    ring: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="16" r="10" stroke="#c98a12" stroke-width="3"/><circle cx="16" cy="16" r="2.6" fill="currentColor" stroke="none"/></svg>',
    disc: '<svg viewBox="0 0 32 32" fill="none" stroke="#1f2948" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="12" fill="#fff" stroke-width="1.6"/><path d="M10.5 17.5l5.5-5.5 5.5 5.5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6.5-5.600 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15.400 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 8h4l2-3h6l2 3h4v11H3z" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.6"/></svg>'};
  let root, goalE, sayE, placeE, sheetE, toastE, coachE, fadeE, mapE, voiceE;
  const UI = {};
  function buildUI(){ document.head.appendChild(el('style', {}, css)); document.documentElement.classList.add('fe-pre');
    if(!document.querySelector('link[href*="Caveat+Brush"]')) document.head.appendChild(el('link', {rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Caveat+Brush&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Jost:wght@300;400;500&display=swap'}));
    const cat = window.SNOWBALL ? SNOWBALL.svg({id: 'sbfhud', seed: 7}).replace(/viewBox="[^"]+"/, 'viewBox="110 10 280 300"') : '';
    root = el('div', {id: 'feRoot'}, `
      <div id="feTop">
        <div id="feL"><div class="feChip" id="feGoal" role="status" aria-live="polite"><div class="k"><b id="feGoalK">Thanksgiving at Hillside</b><span id="feGoalN"></span></div><p id="feGoalT"></p><div class="acts" id="feGoalA"></div></div>
          <div id="fePlace" aria-live="polite"></div></div>
        <div id="feR"><div id="feBtns">
          <button class="feChip" id="feHint" type="button" aria-label="Ask Snowball for a hint"><span class="av">${cat}</span><span class="tx"><b>Ask Snowball</b><small>For a hint</small></span></button>
          <button class="feChip feIco" id="feSnd" type="button" aria-label="Sound"></button>
          <button class="feChip feIco" id="feMenuBtn" type="button" aria-label="Menu" aria-expanded="false">${ICO.menu}</button>
        </div><div id="feSay" aria-live="polite"></div></div>
      </div>
      <div class="feChip" id="feMenu" role="menu"><button type="button" role="menuitem" id="feRestart">Start again</button><button type="button" role="menuitem" id="feAbout">About this 3D model</button><a role="menuitem" href="/tour/">Leave and explore the house</a><a role="menuitem" href="/games/">More games</a></div>
      <div id="feMarks"></div>
      <div id="feCoach" role="status"></div>
      <div id="feDock">
        <div id="feMapWrap"><button class="feChip" id="feMapBtn" type="button" aria-expanded="false">${ICO.pin}<span id="feMapNow">Terrace</span><small>Map</small></button>
          <div class="feChip" id="feMap"><h4><span id="feMapPre">You are on the</span> <b id="feMapName">terrace</b></h4><button type="button" id="feMapX" aria-label="Close the map">×</button><div class="tabs" id="feTabs" role="tablist" aria-label="Floors"></div><div class="plan" id="fePlan"></div></div></div>
        <div id="feTags" role="img" aria-label="Letter tags found so far">${[...LETTERS].map((c, i) => `<i style="--r:${[-4, 3, -2, 4, -3, 2][i]}deg">${c}</i>`).join('')}</div>
        <div id="feDockR"></div>
      </div>
      <button class="feBtn dark" id="feBack" type="button">${ICO.back}<span>Back</span></button>
      <div id="feSheet" role="dialog" aria-live="polite"></div>
      <div class="feChip" id="feVoice" role="status"></div>
      <div id="feToast" role="status"></div>`);
    document.body.appendChild(root); fadeE = el('div', {id: 'feFade'}); document.body.appendChild(fadeE); document.body.appendChild(el('div', {id: 'feFlash'}));
    goalE = $('#feGoal'); sayE = $('#feSay'); placeE = $('#fePlace'); sheetE = $('#feSheet'); toastE = $('#feToast'); coachE = $('#feCoach'); mapE = $('#feMap'); voiceE = $('#feVoice');
    $('#feHint').onclick = () => { SND.unlock(); hint(); };
    const snd = $('#feSnd'), drawSnd = () => { snd.innerHTML = SND.muted ? ICO.mute : ICO.sound; snd.setAttribute('aria-label', SND.muted ? 'Turn sound on' : 'Turn sound off'); snd.setAttribute('aria-pressed', String(!SND.muted)); };
    snd.onclick = () => { SND.setMuted(!SND.muted); drawSnd(); if(!SND.muted) SND.tap(); toast(SND.muted ? 'Sound off' : 'Sound on', 1100); }; drawSnd(); UI.drawSnd = drawSnd;
    $('#feMenuBtn').onclick = e => { e.stopPropagation(); menuOpen() ? closeMenu() : ($('#feMenu').classList.add('on'), $('#feMenuBtn').setAttribute('aria-expanded', 'true')); };
    $('#feRestart').onclick = () => location.reload();
    $('#feAbout').onclick = () => { closeMenu(); const d = document.getElementById('aboutDlg'); try{ d.showModal(); }catch(e){ if(d) d.setAttribute('open', ''); } };
    $('#feBack').onclick = () => back();
    $('#feMapBtn').onclick = () => setMap(!mapOpen()); $('#feMapX').onclick = () => setMap(false);
    addEventListener('pointerdown', e => { if(menuOpen() && !e.target.closest('#feMenu,#feMenuBtn')) closeMenu(); if(mapOpen() && phone() && !e.target.closest('#feMap,#feMapBtn')) setMap(false); }, true);
    buildMap(); setGoal(true); }
  const menuOpen = () => !!$('#feMenu') && $('#feMenu').classList.contains('on');
  function closeMenu(){ const m = $('#feMenu'); if(m && m.classList.contains('on')){ m.classList.remove('on'); $('#feMenuBtn').setAttribute('aria-expanded', 'false'); } }
  const mapOpen = () => !!mapE && mapE.classList.contains('on');
  function setMap(on){ if(!mapE) return; mapE.classList.toggle('on', on); $('#feMapBtn').setAttribute('aria-expanded', String(on)); if(on) showFloor(PLACES[S.place].floor); }
  let toastT = 0; function toast(m, ms){ toastE.textContent = m; toastE.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastE.classList.remove('on'), ms || 2200); }
  let sayT = 0; function say(m, ms, quiet){ sayE.innerHTML = '<small>Snowball</small>' + esc(m); sayE.classList.add('on'); clearTimeout(sayT); sayT = setTimeout(() => sayE.classList.remove('on'), ms || 5200); if(!quiet) SND.jingle(); }
  let placeT = 0; function placeCard(k){ const Pl = PLACES[k]; placeE.innerHTML = `<b>${esc(Pl.name)}</b><span>${esc(Pl.note)}</span>`; placeE.classList.add('on'); clearTimeout(placeT); placeT = setTimeout(() => placeE.classList.remove('on'), 6500); }
  function fadeThrough(fn, hold){ fadeE.classList.add('on'); setTimeout(() => { try{ fn(); }catch(e){ oops('cut', e); } wake(30); setTimeout(() => fadeE.classList.remove('on'), hold || 260); }, reduce ? 60 : 340); }

  /* ---- objective: one line, always */
  function setGoal(silent){ const K = $('#feGoalK'), N = $('#feGoalN'), T = $('#feGoalT'), A = $('#feGoalA'); let hand = false, k = 'Thanksgiving at Hillside', n = '', t = '', acts = '';
    if(S.phase === 'intro' || S.phase === 'boot') t = 'Tap the gold ring on the table and read the note Snowball left.';
    else if(S.phase === 'hunt'){ const st = cur(); k = DISHCAP[st.dish] + ', from ' + st.who; n = 'Clue ' + (S.step + 1) + ' of 6'; t = st.clue; hand = true; if(st.map) acts = '<button class="feBtn sm" type="button" data-a="map">Look at the map</button>'; }
    else if(S.phase === 'tag') t = 'Read the tag that was tied to it.';
    else if(S.phase === 'carry'){ t = 'Carry ' + DISH[S.carry] + ' out to the table under the oak.'; acts = '<button class="feBtn sm dark" type="button" data-a="carry">Carry it there</button>'; }
    else if(S.phase === 'turkey') t = S.carry ? 'Carry the turkey to the table.' : 'The tags spell THANKS. Lift the lid on the smoker.';
    else if(S.phase === 'candles'){ t = 'Everything is on the table. Light the candles.'; acts = '<button class="feBtn sm gold" type="button" data-a="light">Light the candles</button>'; }
    else if(S.phase === 'end') t = 'Dinner is on the table.';
    K.textContent = k; N.textContent = n; T.textContent = t; T.className = hand ? 'hand' : ''; A.innerHTML = acts;
    const b = A.querySelector('button'); if(b) b.onclick = () => { SND.unlock(); const a = b.dataset.a; if(a === 'map') openClue(); else if(a === 'carry') carryNow(); else if(a === 'light') lightCandles(); };
    if(silent) return; goalE.classList.remove('new'); void goalE.offsetWidth; goalE.classList.add('new'); SND.goal(); }
  function drawTags(pop){ $$('#feTags i').forEach((e, i) => { e.classList.toggle('on', i < S.onTable.length); if(pop === i){ e.classList.add('pop'); setTimeout(() => e.classList.remove('pop'), 600); } }); }

  /* ---- Snowball's map for the candles clue: the main floor, turned a quarter from the map in the corner, with dots from the front doors */
  let mapURL = null;
  function pawMap(target){ if(mapURL) return mapURL; const sp = H.BIM2S.meta.spaces.filter(s => /^SP-L1-/.test(s.id)), c = document.createElement('canvas'), w = 640, h = 880; c.width = w; c.height = h; const x = c.getContext('2d');
    const R = (() => { let s = 17; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#e6cc9c'); g.addColorStop(1, '#d6b47c'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for(let i = 0; i < 2400; i++){ x.fillStyle = `rgba(88,58,22,${R() * .05})`; x.fillRect(R() * w, R() * h, 1 + R() * 5, 1); }
    // world (x, z) -> page: x to the right, the street (+z) at the bottom
    const k = 11.4, pt = (wx, wz) => [78 + (wx + 11) * k, 232 + (wz + 10) * k];
    const ink = '#2a2233', HANDF = '"Caveat Brush","Marker Felt",cursive'; x.strokeStyle = ink; x.fillStyle = ink; x.lineCap = 'round'; x.lineJoin = 'round';
    const wob = (pts, lw, close) => { x.lineWidth = lw; x.beginPath(); pts.forEach((p, i) => { const q = [p[0] + (R() - .5) * 3, p[1] + (R() - .5) * 3]; i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }); if(close) x.closePath(); x.stroke(); };
    for(const s of sp){ const poly = (s.poly || s.polygon).map(p => pt(...W2(p[0], p[1]))); x.fillStyle = 'rgba(255,250,236,.45)'; x.beginPath(); poly.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill(); wob(poly, 4, true); }
    wob([pt(-10.1, 3), pt(-10.1, 15.7), pt(4, 15.7), pt(4, 5)], 3);   // the front deck
    x.fillStyle = ink; x.textAlign = 'left'; x.font = '54px ' + HANDF; x.fillText('TOP SECRET', 30, 62); x.font = '32px ' + HANDF; x.fillText('map by Snowball', 34, 98);
    { x.save(); x.translate(262, 88); x.rotate(-.25); x.beginPath(); x.ellipse(0, 6, 10.5, 9, 0, 0, 6.3); x.fill(); for(const [dx, dy, a] of [[-13, -6, -.5], [-5, -14, -.15], [5, -14, .15], [13, -6, .5]]){ x.beginPath(); x.ellipse(dx, dy, 4, 5.6, a, 0, 6.3); x.fill(); } x.restore(); }
    // the oak, out the back
    { const o = [330, 118]; x.lineWidth = 4.5; for(const [dx, dy, r] of [[0, 0, 30], [-27, 12, 21], [27, 10, 23], [3, -21, 19]]){ x.beginPath(); x.arc(o[0] + dx, o[1] + dy, r, 0, 6.3); x.stroke(); } wob([[o[0] - 6, o[1] + 30], [o[0] - 8, o[1] + 66]], 5); wob([[o[0] + 8, o[1] + 30], [o[0] + 10, o[1] + 66]], 5); x.font = '34px ' + HANDF; x.fillText('the oak', o[0] + 62, o[1] + 14); }
    // front doors with an arrow in, from the porch
    { const d = pt(-5.7, 3); wob([[d[0], d[1] + 84], [d[0], d[1] + 14]], 5); wob([[d[0] - 12, d[1] + 30], [d[0], d[1] + 12], [d[0] + 12, d[1] + 30]], 5); x.font = '32px ' + HANDF; x.textAlign = 'center'; x.fillText('front', d[0] - 2, d[1] + 116); x.fillText('doors', d[0] - 2, d[1] + 144); }
    // street and a car
    wob([[30, h - 62], [w - 30, h - 58]], 4); x.font = '34px ' + HANDF; x.textAlign = 'center'; x.fillText('the street', w * .62, h - 22);
    { const cx = 120, cy = h - 86; x.lineWidth = 4; x.strokeRect(cx - 38, cy - 13, 76, 20); x.beginPath(); x.moveTo(cx - 21, cy - 13); x.lineTo(cx - 11, cy - 30); x.lineTo(cx + 15, cy - 30); x.lineTo(cx + 25, cy - 13); x.stroke(); for(const d of [-23, 23]){ x.beginPath(); x.arc(cx + d, cy + 9, 8, 0, 6.3); x.fill(); } }
    // dots from the front doors to the X
    const path = [[-5.7, 1.6], [-5.6, -.6], [1.8, -3.6], [11.4, -4.9], [12.75, 5.1], [12.8, 8.4]].concat(target === 'great' ? [[15.7, 12.4], [15.8, 17.2], [15.2, 26.4], [15.5, 31.0]] : [[10.9, 10.4]]);
    const X = target === 'great' ? [15.6, 33.2] : [8.8, 13.2];
    x.fillStyle = '#8c2b3d'; for(let i = 0; i < path.length - 1; i++){ const a = pt(...path[i]), b = pt(...path[i + 1]), n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 20)); for(let j = 0; j < n; j++){ const t = j / n; x.beginPath(); x.arc(a[0] + (b[0] - a[0]) * t + (R() - .5) * 3, a[1] + (b[1] - a[1]) * t + (R() - .5) * 3, 4.4, 0, 6.3); x.fill(); } }
    { const q = pt(...X); x.strokeStyle = '#8c2b3d'; wob([[q[0] - 19, q[1] - 19], [q[0] + 19, q[1] + 19]], 9); wob([[q[0] + 19, q[1] - 19], [q[0] - 19, q[1] + 19]], 9); }
    try{ mapURL = c.toDataURL('image/jpeg', .86); }catch(e){ mapURL = ''; } return mapURL; }
  // the clue, full size (and the map, when there is one)
  const clueOpen = () => !!$('#feCard.clue');
  function closeClue(){ const c = $('#feCard.clue'); if(c) c.remove(); }
  function openClue(){ if(S.phase !== 'hunt') return; const st = cur(); closeClue();
    const c = el('div', {id: 'feCard', class: 'clue'}, `<div class="c" role="dialog" aria-label="The clue"><div class="feTagCard"><small>${esc(DISHCAP[st.dish])}, from ${esc(st.who)}</small>${esc(st.clue)}${st.map ? `<img alt="A map of one floor of the house, drawn by Snowball, with dots leading from the front doors to an X" src="${pawMap(st.map)}">` : ''}</div><div class="acts"><button class="feBtn dark" type="button" id="feClueX">Back to the house</button></div></div>`);
    document.body.appendChild(c); c.onclick = e => { if(e.target === c) closeClue(); }; $('#feClueX').onclick = closeClue; try{ $('#feClueX').focus({preventScroll: true}); }catch(e){} }

  /* ---- the map: three floors drawn from the model's own room outlines */
  const MAP = {floor: 'lower', dots: {}, key: ''};
  function buildMap(){ const all = H.BIM2S.meta.spaces;
    const polys = {}; for(const [fl, , re] of FLOORS){ polys[fl] = all.filter(s => re.test(s.id)).map(s => ({id: s.id, p: (s.poly || s.polygon).map(q => W2(q[0], q[1]))})); }
    polys.lower.push({id: 'terrace', out: true, p: [[-10.5, -52], [3.2, -52], [3.2, -37], [11, -37], [11, -13], [-10.5, -13]]});
    polys.upper.push({id: 'balcony', out: true, p: [[-22.6, -46.2], [-12.8, -46.2], [-12.8, -40.2], [-22.6, -40.2]]});
    polys.main.push({id: 'porch', out: true, p: [[-10.1, 3], [4, 3], [4, 15.7], [-10.1, 15.7]]});
    MAP.w = 268; MAP.h = 188; MAP.polys = polys;
    $('#feTabs').innerHTML = FLOORS.map(([fl, name]) => `<button type="button" role="tab" data-f="${fl}" aria-pressed="false">${esc(name)}</button>`).join('');
    $$('#feTabs button').forEach(b => b.onclick = () => { SND.unlock(); SND.tap(); showFloor(b.dataset.f); });
    showFloor('lower'); }
  function showFloor(fl){ MAP.floor = fl; const plan = $('#fePlan'), w = MAP.w, h = MAP.h; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for(const s of MAP.polys[fl]) for(const [x, z] of s.p){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    // the plan is turned a quarter: +z runs to the right and +x runs up, the same on every floor
    const k = Math.min((w - 16) / (z1 - z0), (h - 16) / (x1 - x0)), ox = (w - (z1 - z0) * k) / 2, oy = (h - (x1 - x0) * k) / 2; MAP.pt = (x, z) => [ox + (z - z0) * k, oy + (x1 - x) * k];
    let svg = `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
    for(const s of MAP.polys[fl]){ const d = s.p.map((q, i) => { const m = MAP.pt(q[0], q[1]); return (i ? 'L' : 'M') + m[0].toFixed(1) + ' ' + m[1].toFixed(1); }).join('') + 'Z';
      svg += `<path d="${d}" fill="${s.out ? '#e3e8dc' : '#ece6d8'}" stroke="${s.out ? '#aab49a' : '#a9a08b'}" stroke-width="${s.out ? .8 : 1}" ${s.out ? 'stroke-dasharray="3 2"' : ''} stroke-linejoin="round"/>`; }
    svg += `<g id="feDot"><path d="M0 0L-9 -20A22 22 0 0 1 9 -20Z" fill="rgba(201,138,18,.35)"/><circle r="5.5" fill="#c98a12" stroke="#fff" stroke-width="2"/></g></svg>`;
    plan.innerHTML = svg + ORDER.filter(key => PLACES[key].floor === fl).map(key => { const Pl = PLACES[key], m = MAP.pt(Pl.map[0], Pl.map[1]); return `<button type="button" class="pl" data-p="${key}" aria-current="${key === S.place}" style="left:${(m[0] / w * 100).toFixed(1)}%;top:${(m[1] / h * 100).toFixed(1)}%">${esc(Pl.name)}</button>`; }).join('');
    MAP.dot = $('#feDot'); MAP.key = '';
    $$('.pl', plan).forEach(b => b.onclick = () => { SND.unlock(); if(S.ex || S.busy || rig.move) return; if(phone()) setMap(false); goTo(b.dataset.p); });
    $$('#feTabs button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.f === fl)); b.classList.toggle('here', !!S.place && PLACES[S.place].floor === b.dataset.f); }); }
  function mapStep(){ if(!MAP.dot || !MAP.pt || !S.place) return; const here = PLACES[S.place].floor === MAP.floor; const m = MAP.pt(rig.pos.x, rig.pos.z), fx = -Math.sin(rig.yaw), fz = -Math.cos(rig.yaw), a = Math.atan2(fz, fx) * 180 / Math.PI;
    const key = here + m[0].toFixed(1) + ',' + m[1].toFixed(1) + ',' + a.toFixed(0); if(key === MAP.key) return; MAP.key = key; MAP.dot.style.display = here ? '' : 'none'; MAP.dot.setAttribute('transform', `translate(${m[0].toFixed(1)} ${m[1].toFixed(1)}) rotate(${a.toFixed(1)})`); }
  function mapPlace(k){ $('#feMapPre').textContent = 'You are ' + ({table: 'on', balcony: 'on', porch: 'on', coffee: 'at'}[k] || 'in') + ' the'; $('#feMapName').textContent = PLACES[k].name.toLowerCase(); $('#feMapNow').textContent = PLACES[k].name; showFloor(PLACES[k].floor); }

  /* ---- markers: gold rings (look closer) and white circles (walk there), projected from the house */
  const marks = [], _v = new V3();
  function mark(kind, label, at, act, key){ const b = el('button', {class: 'feMk ' + kind, type: 'button', 'aria-label': (kind === 'walk' ? 'Go: ' + label : 'Look at: ' + label)}, `<i>${kind === 'walk' ? ICO.walk : ''}</i><span>${esc(label)}</span>`);
    b.onclick = e => { e.stopPropagation(); SND.unlock(); act(); }; $('#feMarks').appendChild(b); const m = {b, kind, label, at, act, key, on: false}; marks.push(m); return m; }
  // which rings are live: the note at the start, the three candidates of the clue you are on, the smoker always
  function liveSpots(){ if(!S.place || S.carry) return []; const out = [];
    if(S.phase === 'intro') out.push('note');
    if(S.phase === 'hunt') for(const id of cur().spots) if(!S.tried[id]) out.push(id);
    if(S.phase === 'intro' || S.phase === 'hunt' || S.phase === 'turkey') out.push('smoker');
    return out.filter(id => SPOTS[id].place === S.place); }
  function setMarks(){ for(const m of marks) m.b.remove(); marks.length = 0; if(!S.place || S.ex || S.done) return;
    for(const w of (WALKS[S.place] || [])) mark('walk', w.label || PLACES[w.to].name, w.at, () => goTo(w.to), 'w:' + w.to);
    for(const id of liveSpots()){ const sp = SPOTS[id]; const m = mark('look', sp.label, sp.at, () => examine(id), 's:' + id); if(S.hot === id) m.hot = true; } }
  function marksStep(){ if(!marks.length) return; const r = canvas.getBoundingClientRect(), hide = !!rig.move || S.busy || !S.started || S.done || !!S.ex;
    const top = 46, bot = r.height - 46, padX = 40, items = [], placed = [];
    for(const m of marks){ if(hide){ if(m.on){ m.on = false; m.b.classList.remove('on'); } continue; }
      _v.set(m.at[0], m.at[1], m.at[2]).applyMatrix4(camera.matrixWorldInverse); const behind = _v.z > -.3, side = _v.x;
      _v.set(m.at[0], m.at[1], m.at[2]).project(camera); let x = r.left + (_v.x + 1) / 2 * r.width, y = r.top + (1 - _v.y) / 2 * r.height, edge = '', docked = false;
      if(behind || x < r.left - 10 || x > r.left + r.width + 10 || y < r.top - 60 || y > r.top + r.height + 60){ docked = true; edge = (behind ? side < 0 : x < r.left + r.width / 2) ? 'L' : 'R'; }
      else { x = clamp(x, r.left + padX, r.left + r.width - padX); y = clamp(y, r.top + top, r.top + bot); if(x < r.left + 88) edge = 'L'; else if(x > r.left + r.width - 88) edge = 'R'; }
      items.push({m, x, y, edge, docked}); }
    items.sort((p, q) => (p.docked - q.docked) || ((p.m.kind === 'walk') - (q.m.kind === 'walk')));
    const obs = [], add = e => { if(!e) return; const q = e.getBoundingClientRect(); if(q.width > 2 && q.height > 2) obs.push([q.left - 6, q.top - 6, q.right + 6, q.bottom + 6]); };
    add(goalE); if(placeE.classList.contains('on')) add(placeE); add(phone() ? $('#feMapBtn') : mapE); add($('#feBtns')); if(sayE.classList.contains('on')) add(sayE); add($('#feTags'));
    if(coachE.classList.contains('on')) add(coachE);
    const wOf = m => m.w || (m.w = Math.max(40, (m.b.querySelector('span') || {}).offsetWidth || 90));
    const box = it => { const w = wOf(it.m), hw = Math.max(34, w / 2 + 4); return it.edge === 'L' ? [it.x - 32, it.y - 32, it.x + 36 + w, it.y + 32] : it.edge === 'R' ? [it.x - 36 - w, it.y - 32, it.x + 32, it.y + 32] : [it.x - hw, it.y - 32, it.x + hw, it.y + 84]; };
    const hit = (p, q) => !(p[2] < q[0] || p[0] > q[2] || p[3] < q[1] || p[1] > q[3]);
    // things that are out of view dock to the side they lie on: one tidy stack per side, in the clear band between the HUD above and below
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
      if(!it.docked){ // in view: keep clear of the HUD and of the others, at the nearest free place above or below, or stay put if there is none
        const y0 = it.y, all = obs.concat(placed), free = y => { it.y = y; const q = box(it); return !all.some(o => hit(q, o)); };
        if(!free(y0)){ let ok = false; for(let k = 1; k <= 24 && !ok; k++) for(const d of (y0 > r.top + r.height * .55 ? [-1, 1] : [1, -1])){ const y = y0 + d * 30 * k; if(y < r.top + top || y > r.top + bot) continue; if(free(y)){ ok = true; break; } } if(!ok) it.y = y0; }
        placed.push(box(it)); }
      m.b.style.transform = `translate(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px)`; const cls = 'feMk ' + m.kind + ' on' + (m.hot ? ' hot' : '') + (it.edge ? ' edge ' + it.edge : '') + (m.kind === 'walk' && !S.coach.walk ? ' first' : '');
      if(m.b.className !== cls) m.b.className = cls; m.on = true; } }
  function tapAt(cx, cy){ if(rig.move || S.busy || S.ex) return; let best = null; for(const m of marks){ if(!m.on) continue; const q = m.b.getBoundingClientRect(), d = Math.hypot(q.left + q.width / 2 - cx, q.top + q.height / 2 - cy); if(d < 56 && (!best || d < best.d)) best = {m, d}; } if(best) best.m.act(); }

  /* ---- coach: look, tap, walk, taught one at a time by doing */
  function coach(){ if(!S.started || S.done){ coachE.classList.remove('on'); return; } const c = S.coach; let k = '';
    if(!c.look){ if(S.dragPx > 90){ c.look = true; } else k = 'look'; }
    if(!k && !c.tap && S.phase === 'intro') k = 'tap'; if(!k && !c.walk && S.phase === 'hunt' && S.step === 0) k = 'walk';
    if(S.ex || rig.move || S.busy || (mapOpen() && phone()) || clueOpen()) k = '';
    if(k === UI.coachK) return; UI.coachK = k; coachE.className = k ? 'on ' + k : '';
    if(k) coachE.innerHTML = k === 'look' ? ICO.drag + '<span>Drag to look around</span>' : k === 'walk' ? ICO.disc + '<span>Tap a white circle, or a room on the map</span>' : ICO.ring + '<span>Tap a gold ring to look closer</span>'; }

  /* ================================================================== moving and examining */
  function standPose(k){ const Pl = PLACES[k], a = yp(Pl.pos, Pl.face); return {yaw: a[0], pitch: a[1], fov: placeFov(Pl.fov), off: [0, 0]}; }
  function arrive(k, first){ S.place = k; S.busy = false; mapPlace(k); setMarks(); const fresh = !S.visited[k]; S.visited[k] = true; if((fresh || first) && !S.carry) placeCard(k);
    if(SMK.emit) SMK.emit.rate = k === 'table' ? (S.phase === 'turkey' || S.phase === 'candles' || S.phase === 'end' ? 3.2 : 2) : 0;
    S.lastProgress = performance.now(); ga('feast3d_place', {place: k});
    if(k === 'office') later(320, () => { if(S.place !== 'office') return; const it = (H.door28 && H.door28.items || []).find(q => q.id === 'D-L0-13'); if(it && it.t > .1){ SND.creak(); door('D-L0-13', false); } });
    if(k === 'table' && S.carry) later(250, setDown);
    else if(fresh && CATSAYS[k] && S.phase === 'hunt' && !S.carry) later(1400, () => { if(S.place === k && !S.ex && !rig.move && !sayE.classList.contains('on') && !(performance.now() - (S.hintAt || -1e9) < 12000)) say(CATSAYS[k], 5200, true); }); }
  function goTo(k, opts){ opts = opts || {}; if(!PLACES[k] || S.busy || rig.move || S.done || S.ex) return false;
    if(k === S.place){ const p = standPose(k); rig.lim = null; rig.tyaw = rig.yaw + angDiff(rig.yaw, p.yaw); rig.tpitch = p.pitch; rig.zoom = 1; if(opts.done) opts.done(); return true; }
    const r = route(S.place, k), pose = standPose(k); S.busy = true; if(S.place === 'office') door('D-L0-13', true); if(k === 'balcony' || S.place === 'balcony') door('D-L2-01', true); if(k === 'table' || k === 'lounge') door('D-L0-10', true); S.coach.walk = true; placeE.classList.remove('on'); sayE.classList.remove('on'); for(const m of marks){ m.on = false; m.b.classList.remove('on'); }
    const land = () => { arrive(k); if(opts.done) opts.done(); };
    if(r){ const path = r.map(n => [NODES[n][0], NODE_Y(n), NODES[n][1]]); let len = 0; for(let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]); const dur = rigTravel(path, pose, {face: true, done: land, dur: clamp(.55 + len / 13, .8, 3.6)}); SND.steps(clamp(Math.round(dur / .44), 1, 7)); }
    else { const stairs = PLACES[S.place].floor !== PLACES[k].floor || (S.place === 'table' && k === 'entry') || (S.place === 'entry' && k === 'table'); SND.steps(stairs ? 5 : 3);
      fadeThrough(() => { rigCut(PLACES[k].pos, pose.yaw, pose.pitch, pose.fov); land(); }, stairs ? 420 : 260); }
    return true; }
  function freeArea(){ const W = innerWidth, Hh = innerHeight, r = sheetE.getBoundingClientRect(); const topPad = phone() ? 70 : 30;
    if(phone()){ const b = Math.max(topPad + 80, Hh - r.height - 16); return {fx: .5, fy: (topPad + b) / 2 / Hh, fw: .94, fh: (b - topPad) / Hh}; }
    const l = Math.min(W - 404, W * .62); return {fx: l / 2 / W, fy: .5, fw: l / W * .92, fh: .74}; }
  function examine(id, opts){ const sp = SPOTS[id]; if(!sp || S.busy || rig.move || S.done || S.ex) return false; S.coach.tap = true; ga('feast3d_look', {item: id}); SND.look();
    S.ex = {id, back: {yaw: rig.yaw, pitch: rig.pitch}, mode: (opts && opts.mode) || 'look'}; S.busy = true; setMarks(); placeE.classList.remove('on'); sayE.classList.remove('on');
    document.documentElement.classList.add('fe-ex'); sheetFor(S.ex); sheetE.classList.add('on'); frameExamine(.95, () => { S.busy = false; if(opts && opts.done) opts.done(); }); return true; }
  function frameExamine(dur, done){ const sp = SPOTS[S.ex.id], a = yp(sp.pos, sp.look), dist = Math.hypot(sp.look[0] - sp.pos[0], sp.look[1] - sp.pos[1], sp.look[2] - sp.pos[2]);
    const free = freeArea(), pose = {yaw: a[0], pitch: a[1], fov: fitFov(sp.fit, dist, free), off: [free.fx - .5, free.fy - .5]};
    rigTravel([[rig.pos.x, rig.pos.y, rig.pos.z], sp.pos], pose, {dur, done: () => { rig.lim = {yaw: pose.yaw, pitch: pose.pitch, ry: .32, rp: .22}; if(done) done(); }}); }
  function back(then){ if(!S.ex || rig.move || S.busy || (S.ex.locked && typeof then !== 'function')) return false; const ex = S.ex; SND.back(); sheetE.classList.remove('on'); S.busy = true;
    const Pl = PLACES[S.place], pose = {yaw: ex.back.yaw, pitch: ex.back.pitch, fov: placeFov(Pl.fov), off: [0, 0]};
    rigTravel([[rig.pos.x, rig.pos.y, rig.pos.z], Pl.pos], pose, {dur: .85, done: () => { S.ex = null; S.busy = false; document.documentElement.classList.remove('fe-ex'); setMarks(); if(typeof then === 'function') then(); }}); return true; }
  // a sheet: what you are looking at, what you can do to it, and the way back
  function sheet(html, o){ o = o || {}; sheetE.innerHTML = html + `<div class="row">${(o.acts || []).map((a, i) => `<button class="feBtn ${a.cls || ''}" type="button" data-i="${i}">${esc(a.label)}</button>`).join('')}${o.noBack ? '' : `<button class="feBtn" type="button" data-a="back">${ICO.back}<span>Back to the ${esc(PLACES[S.place].name.toLowerCase())}</span></button>`}</div>`;
    if(S.ex) S.ex.locked = !!o.noBack; $('#feBack').style.visibility = o.noBack ? 'hidden' : '';
    $$('[data-i]', sheetE).forEach(b => b.onclick = () => { SND.unlock(); if(S.busy || rig.move) return; o.acts[+b.dataset.i].go(); });
    const bk = sheetE.querySelector('[data-a=back]'); if(bk) bk.onclick = () => back(); $('#feBack span').textContent = 'Back to the ' + PLACES[S.place].name.toLowerCase(); sheetE.scrollTop = 0;
    if(phone() && S.ex && !rig.move && !S.busy) later(60, () => { if(S.ex && !rig.move) frameExamine(.5); }); }
  const tagCard = (small, text, big) => `<div class="feTagCard">${big ? `<span class="big">${esc(big)}</span>` : ''}<small>${esc(small)}</small>${esc(text)}</div>`;
  function sheetFor(ex){ const id = ex.id, sp = SPOTS[id], st = S.phase === 'hunt' ? cur() : null;
    if(id === 'note') return sheet(`<h3>The dinner hunt</h3>${tagCard('Rules, by Snowball', 'One. Every clue is true. Two. No asking Biscuit. He cannot keep a secret. Three. The turkey comes last.')}${tagCard('Clue 1 of 6, from ' + STEPS[0].who, STEPS[0].clue)}`,
      {noBack: true, acts: [{label: 'Start looking', cls: 'primary', go: () => { if(S.phase === 'intro'){ S.phase = 'hunt'; S.step = 0; S.hintIx = 0; setGoal(); ga('feast3d_step', {step: 0}); } back(() => { if(!S.saidStart){ S.saidStart = true; later(500, () => say('I know where all of it is. Ask if you get stuck. I like being asked.', 5600)); } }); }}]});
    if(id === '_table') return sheetTable(ex);
    if(id === 'smoker') return sheetSmoker(ex);
    if(ex.state === 'found') return sheet(`<h3>You found ${esc(DISH[st.dish])}.</h3><p>${esc(st.found)}</p>`, {noBack: true, acts: [{label: 'Carry it to the table', cls: 'primary', go: () => back(() => carryNow())}]});
    if(ex.state === 'wrong') return sheet(`<h3>${esc(sp.title)}</h3><p class="res">${esc(st.wrong[id] || 'Nothing in here.')}</p>`);
    if(sp.kind === 'wall') return sheet(`<h3>${esc(sp.title)}</h3><p>${esc(sp.text)}</p>${S.knocked[id] ? `<p class="res">${esc(KNOCK[st && st.answer === id ? 'hollow' : 'solid'])}</p>` : ''}`,
      {acts: [{label: 'Knock on it', cls: 'dark', go: () => knock(id)}, {label: 'Push it', go: () => openSpot(id)}]});
    return sheet(`<h3>${esc(sp.title)}</h3><p>${esc(sp.text)}</p>`, {acts: [{label: sp.act || 'Open it', cls: 'dark', go: () => openSpot(id)}]}); }
  function knock(id){ const st = cur(), hollow = st.answer === id; S.knocked[id] = true; hollow ? SND.knockH() : SND.knockS(); S.lastProgress = performance.now(); sheetFor(S.ex);
    const b = el('i', {style: `position:fixed;left:${innerWidth * (freeArea().fx)}px;top:${innerHeight * freeArea().fy}px;width:70px;height:70px;margin:-35px 0 0 -35px;border-radius:50%;border:3px solid rgba(255,255,255,.9);z-index:70;pointer-events:none;transition:transform .5s ease-out,opacity .5s;transform:scale(.3)`}); document.body.appendChild(b); requestAnimationFrame(() => { b.style.transform = 'scale(1.5)'; b.style.opacity = '0'; }); setTimeout(() => b.remove(), 600); }

  /* ---- opening things */
  function emerge(g, from, to, s1, done){ const s0 = g.visible ? g.scale.x : s1 * .25; g.visible = true; g.position.copy(from); tween(720, u => { const e = back3(u); g.position.lerpVectors(from, to, clamp(e, 0, 1.08)); g.scale.setScalar(lerp(s0, s1, clamp(e, 0, 1.1))); }, done); }
  const showScale = id => { const g = DISHOBJ[id]; return clamp(.9 / Math.max(g.userData.h || .5, (g.userData.r || .4) * 2), .55, 1); };
  function openSpot(id){ const sp = SPOTS[id], st = cur(); if(S.phase !== 'hunt' || !st.spots.includes(id) || S.tried[id] || S.busy) return; const right = st.answer === id; S.busy = true; S.lastProgress = performance.now();
    const fin = () => { S.busy = false; if(right) foundDish(id); else wrongSpot(id); };
    if(sp.kind === 'cooler'){ const c = COOL[id]; SND.fridge(); if(c) tween(900, u => c.set(1 - Math.pow(1 - u, 3)), () => later(150, fin)); else later(400, fin); }
    else if(sp.kind === 'fridge'){ SND.fridge(); later(650, fin); }
    else if(sp.kind === 'box'){ SND.paper(); const lid = PROP[id].userData.lid; tween(700, u => { lid.rotation.x = -1.95 * ease(u); }, () => later(120, fin)); }
    else if(sp.kind === 'bag'){ SND.paper(); const b = PROP[id]; tween(420, u => { b.rotation.z = Math.sin(u * Math.PI * 3) * .05 * (1 - u); }, fin); }
    else if(sp.kind === 'wall'){ if(right){ SND.knockH(); later(350, () => { SND.creak(); door('D-L0-05', true); later(1000, fin); }); } else { SND.knockS(); later(500, fin); } }
    else later(300, fin); }
  function wrongSpot(id){ const sp = SPOTS[id]; S.peeks++; S.tried[id] = true; SND.wrong(); ga('feast3d_wrong', {step: S.step, spot: id});
    if(sp.kind === 'bag' || sp.kind === 'box'){ const kind = sp.kind === 'box' ? 'napkins' : sp.decoy, d = P.DECOY[kind](); P.root.add(d); const b = PROP[id], from = b.position.clone().add(b.userData.inside);
      if(sp.kind === 'box'){ d.position.copy(from); d.scale.setScalar(1.25); } else emerge(d, from, showAt(id), 1.7); PROP[id + ':decoy'] = d; }
    if(S.ex) S.ex.state = 'wrong'; sheetFor(S.ex);
    if(S.peeks === 1) later(700, () => say('Not there. The clue is true, so read it again.', 4600)); else if(S.peeks === 4) later(700, () => say('Guessing works eventually. So does asking me.', 5000)); }
  function foundDish(id){ const sp = SPOTS[id], st = cur(), g = DISHOBJ[st.dish]; SND.find(); ga('feast3d_found', {step: S.step, dish: st.dish, peeks: S.peeks, hints: S.hints}); S.hot = null;
    const to = sp.kind === 'wall' ? g.position.clone().add(new V3(0, .42, 0)) : showAt(id);
    emerge(g, g.position.clone(), to, sp.kind === 'wall' ? 1 : showScale(st.dish), () => { g.userData.spin = true; });
    P.sparkle(to.clone().add(new V3(0, .3, 0)), 9); if(g.userData.steam){ const e = P.emitter({at: to.clone().add(new V3(0, (g.userData.h || .3) * showScale(st.dish), 0)), rate: 5, size: .22, rise: .5, life: 1.6, alpha: .3, grow: 1.4}); later(4200, () => { e.on = false; }); }
    S.tried[id] = true; if(S.ex) S.ex.state = 'found'; sheetFor(S.ex); }

  /* ---- carrying a dish, and setting it down */
  const HELD = {g: null, s: 1};
  // a carried dish is drawn at hand size: about a third of a foot tall or half a foot wide at arm's length, whichever is smaller, so a tall jug does not fill the view
  const heldScale = g => clamp(Math.min(.34 / (g.userData.h || .5), .5 / ((g.userData.r || .4) * 2)), .22, .6);
  function carryNow(){ if(clueOpen()) closeClue(); if(S.phase === 'hunt'){ const st = cur(), g = DISHOBJ[st.dish]; S.carry = st.dish; S.phase = 'carry'; HELD.g = g; g.userData.spin = false; HELD.s = heldScale(g); setGoal(); setMarks(); }
    if(S.place === 'table'){ if(!S.ex && !rig.move && !S.busy) setDown(); return; }
    if(!S.ex && !rig.move && !S.busy) goTo('table'); }
  const _h = new V3(), _hq = new THREE.Quaternion(), _hy = new V3(0, 1, 0);
  function heldStep(now){ const g = HELD.g; if(!g || !S.carry || HELD.fly) return; const bob = rig.move ? Math.sin(now / 130) * .025 : 0;
    _h.set(0, -.74 + bob, -1.95).applyMatrix4(camera.matrixWorld); g.position.copy(_h); _hq.setFromAxisAngle(_hy, rig.yaw + .5); g.quaternion.copy(_hq); g.scale.setScalar(HELD.s); g.visible = !fadeE.classList.contains('on'); }
  function slotPos(id){ const s = SLOT[id]; return new V3(TABLE[0] + s[0], TABLE[1] + .02, TABLE[2] + s[1]); }
  function setDown(){ if(!S.carry || S.busy || rig.move || S.ex) return; const id = S.carry; catAt(CHAIR); examine('_table', {mode: 'set', done: () => { const g = DISHOBJ[id], from = g.position.clone(), to = slotPos(id), s0 = g.scale.x, r0 = g.rotation.y, r1 = SLOT[id][2] || 0; HELD.fly = true; S.busy = true; g.rotation.set(0, r0, 0);
      tween(950, u => { const e = ease(u); g.position.lerpVectors(from, to, e); g.position.y += Math.sin(u * Math.PI) * .55; g.scale.setScalar(lerp(s0, 1, e)); g.rotation.y = lerp(r0, r1, e); if(id === 'candles') g.userData.spread(e); },
        () => { HELD.fly = false; HELD.g = null; S.carry = null; g.position.copy(to); g.scale.setScalar(1); SND.clink(); S.onTable.push(id); if(id === 'cider') SETTINGS.forEach(s => { s.userData.cider.visible = true; });
          if(id === 'turkey'){ S.busy = false; S.phase = 'candles'; setGoal(); S.ex.state = 'turkey'; sheetFor(S.ex); return; }
          const i = S.step; S.phase = 'tag'; setGoal(true); later(350, () => hangTag(i, () => { S.busy = false; S.ex.state = 'tag'; sheetFor(S.ex); })); }); }}); }
  function hangTag(i, done){ const piv = P.tag(LETTERS[i]), slot = BUNT.userData.slots[5 - i]; piv.position.copy(slot); piv.rotation.y = Math.PI / 2 + .1; P.root.add(piv); TAGS[i] = piv; SND.tag(i); S.tagsUp = i + 1; drawTags(i);
    tween(1300, u => { piv.scale.setScalar(Math.min(1, u * 5)); piv.rotation.x = .55 * Math.exp(-3.2 * u) * Math.cos(u * 9); }, done); }
  // the table, each time something lands on it: the tag it earned, and the next clue
  function sheetTable(ex){ const i = S.step, st = STEPS[i];
    if(ex.state === 'turkey') return sheet(`<h3>The turkey is on the table.</h3><p>Everything Snowball put away is here, the cider is poured, and the sun is nearly down. One thing left.</p>`, {noBack: true, acts: [{label: 'Light the candles', cls: 'gold', go: () => lightCandles()}]});
    if(ex.state !== 'tag') return sheet(`<h3>The table under the oak</h3><p>${S.carry ? 'Setting it down.' : 'Eight places, a linen runner and a few small pumpkins. The middle of the table is waiting for dinner.'}</p>`, {noBack: !!S.carry});
    const last = i === STEPS.length - 1, nx = STEPS[i + 1];
    if(last) return sheet(`<h3>${esc(DISHCAP[st.dish])}, and the last tag</h3>${tagCard('On the back of the tag', st.thanks, LETTERS[i])}${tagCard('P.S. from Snowball and Biscuit', 'We did not lose dinner. We wanted you to see the whole house before everyone sits down. Happy Thanksgiving. P.P.S. Biscuit says the turkey is ready, and his nose is never wrong. Lift the lid.')}`,
      {noBack: true, acts: [{label: 'Go to the smoker', cls: 'primary', go: () => { tidy(STEPS.length - 1); S.phase = 'turkey'; S.step = STEPS.length; S.hintIx = 0; setGoal(); SND.spell(); setTod('golden'); P.setLift(.9); back(() => later(300, () => { say('It spells THANKS. I knew that.', 4600, true); examine('smoker'); })); }}]});
    return sheet(`<h3>${esc(DISHCAP[st.dish])} ${PLURAL[st.dish] ? 'are' : 'is'} on the table.</h3>${tagCard('On the back of the tag', st.thanks, LETTERS[i])}${tagCard('Clue ' + (i + 2) + ' of 6, from ' + nx.who, nx.clue)}`,
      {noBack: true, acts: [nx.map ? {label: 'Look at the map', cls: 'primary', go: () => { nextStep(); later(900, openClue); }} : {label: 'Start looking', cls: 'primary', go: () => nextStep()}]}); }
  function tidy(i){ const st = STEPS[i]; if(!st) return; for(const id of st.spots){ try{ if(COOL[id]) COOL[id].set(0); for(const k of [id, id + ':decoy']){ const g = PROP[k]; if(g && g.visible){ const s0 = g.scale.x; tween(260, u => g.scale.setScalar(Math.max(.001, s0 * (1 - u))), () => { g.visible = false; }); } } }catch(e){ oops('tidy', e); } } }
  function nextStep(){ tidy(S.step); S.step++; S.phase = 'hunt'; S.tried = {}; S.knocked = {}; S.hot = null; S.hintIx = 0; S.lastProgress = performance.now(); $('#feHint').classList.remove('nudge'); setHour(HOURS[S.step] || 17.2); setGoal(); ga('feast3d_step', {step: S.step});
    back(() => { const n = S.step; if(n === 1) later(600, () => say('The sun moved while you were carrying that.', 4600, true)); else if(n === 3) later(600, () => say('Half of dinner is found. The other half is still clever.', 4800, true)); else if(n === 5) later(600, () => say('One more, and the sun is getting low.', 4600, true)); }); }

  /* ---- the smoker and the turkey */
  function sheetSmoker(ex){ const sp = SPOTS.smoker;
    if(S.phase !== 'turkey') return sheet(`<h3>${esc(sp.title)}</h3><p>${esc(sp.text)}</p>`);
    if(ex.state === 'open') return sheet(`<h3>The turkey</h3><p>All day over oak and apple wood, and it is the color of a good violin. It has been here the whole time, and you could smell it from the balcony.</p>`, {noBack: true, acts: [{label: 'Carry it to the table', cls: 'primary', go: () => { const t = DISHOBJ.turkey; dress(t, true); S.carry = 'turkey'; HELD.g = t; HELD.s = heldScale(t); setGoal(); if(SMK.emit) SMK.emit.rate = 1.2; back(() => { tween(1100, u => SMK.set(1 - ease(u))); setDown(); }); }}]});
    return sheet(`<h3>${esc(sp.title)}</h3><p>The dial has reached its mark. The tags are up, the table is set, and Biscuit’s nose says it is time.</p>`, {acts: [{label: 'Lift the lid', cls: 'primary', go: () => liftLid()}]}); }
  function liftLid(){ if(S.busy || S.lidUp) return; S.busy = true; S.lidUp = true; SND.lid(); ga('feast3d_lid');
    if(SMK.emit){ P.burst(SMK.emit, 16); SMK.emit.rate = 5; later(5000, () => { SMK.emit.rate = 1.6; SMK.emit.at.y = SMK.seam + .3; }); }
    const e2 = P.emitter({at: new V3(SMK.c[0], SMK.seam + .2, SMK.c[1]), rate: 7, size: .9, rise: .9, drift: [.25, .2], life: 2.2, alpha: .3, grow: 2}); later(3200, () => { e2.on = false; });
    tween(1500, u => SMK.set(ease(u)), () => { P.sparkle(new V3(SMK.c[0], SMK.seam + .6, SMK.c[1]), 12); SND.find(); later(500, () => { S.busy = false; if(S.ex){ S.ex.state = 'open'; sheetFor(S.ex); } }); }); }

  /* ---- candles, dusk, what the animals think of it, the end */
  function lightCandles(){ if(S.lit || S.busy || rig.move) return; S.lit = true; S.busy = true; S.phase = 'end'; ga('feast3d_candles'); const c = DISHOBJ.candles;
    sheetE.classList.remove('on'); document.documentElement.classList.add('fe-cine'); for(const m of marks) m.b.classList.remove('on'); sayE.classList.remove('on');
    c.userData.sticks.forEach((st, i) => { const at = new V3(); st.getWorldPosition(at); at.y += st.userData.top; const f = P.flame(at, 1); flames.push(f); later(500 + i * 420, () => { SND.flame(i); tween(500, u => f.on(u)); }); });
    later(500, () => tween(2600, u => { candleLight.intensity = 1.5 * u; }));
    // the sun goes: the model's own dusk, with the house lights on
    later(2500, () => fadeThrough(() => { setTod('dusk'); P.setLift(.75); const sh = SHOT(), a = yp(sh.pos, sh.look); rigCut(sh.pos, a[0], a[1], sh.fov); S.ex = null; document.documentElement.classList.remove('fe-ex'); catAt(CHAIR); for(const t of TAGS) if(t) t.userData.mat.emissiveIntensity = .5; }, 520));
    later(3900, () => { SND.chord(); const sh = SHOT(), a = yp(sh.pos2, sh.look); rigTravel([sh.pos, sh.pos2], {yaw: a[0], pitch: a[1], fov: sh.fov, off: phone() ? [0, -.3] : [-.17, 0]}, {dur: 9}); });
    later(4600, () => { SND.bell(); voices(() => finish()); }); }
  const SHOT = () => aspect() < 1 ? {pos: [8.4, .7, -46.6], pos2: [7.2, .6, -46.2], look: [-2.4, -1.5, -43.3], fov: 80} : {pos: [8.3, .55, -47.1], pos2: [7.3, .5, -46.7], look: [-2.6, -1.3, -43.0], fov: 56};
  // who speaks once the candles are lit: the accomplice, two of the house's other animals, and Snowball last (a: Snowball's trail, b: Biscuit's)
  const PAWSVG = '<svg viewBox="0 0 44 44" aria-hidden="true"><g fill="currentColor"><ellipse cx="22" cy="29" rx="10" ry="8.4"/><ellipse cx="8.6" cy="18" rx="4" ry="5.2" transform="rotate(-24 8.6 18)"/><ellipse cx="16.6" cy="10" rx="4" ry="5.4" transform="rotate(-8 16.6 10)"/><ellipse cx="27.4" cy="10" rx="4" ry="5.4" transform="rotate(8 27.4 10)"/><ellipse cx="35.4" cy="18" rx="4" ry="5.2" transform="rotate(24 35.4 18)"/></g></svg>';
  const VOICES = [
    {n: 'Biscuit', w: 'the golden dog', c: '#b9822e', a: 'I carried the cider. One jug, no stairs, and I did not lick it.', b: 'That was my trail. You followed it better than I do.'},
    {n: 'Mabel', w: 'the tortoise', c: '#5f7a4a', a: 'I set off for the table when you found the cider. Nearly there.', b: 'I set off for the table when you found the cider. Nearly there.'},
    {n: 'Pepper', w: 'the grey parrot', c: '#6c7480', a: 'Secret door! Secret door! Secret door!', b: 'Secret door! Secret door! Secret door!'},
    {n: 'Snowball', w: 'the cat of the house', c: '#d9772b', a: 'You found all of it before sunset. I am nearly impressed.', b: 'You found all of it before sunset. I am nearly impressed.'}];
  function voices(done){ let i = 0; const next = () => { if(i >= VOICES.length){ voiceE.classList.remove('on'); return later(500, done); } const g = VOICES[i++];
      voiceE.classList.remove('on'); later(i === 1 ? 0 : 320, () => { voiceE.innerHTML = `<span class="av" style="background:${g.c}">${PAWSVG}</span><div><b>${esc(g.n)}</b><small>${esc(g.w)}</small><p>${esc(g[HUNT])}</p></div>`; voiceE.classList.add('on'); if(i > 1) SND.tag(i); later(reduce ? 3400 : 2900, next); }); }; next(); }
  function leaves(){ if(reduce) return; const cols = ['#b5471d', '#c98a12', '#8c2b3d', '#d9772b']; for(let i = 0; i < 16; i++){ const l = el('i', {class: 'feLeaf', 'aria-hidden': 'true'}); l.style.left = (Math.random() * 100) + 'vw'; l.style.background = cols[i % 4]; l.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px'); l.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg'); l.style.animationDuration = (4 + Math.random() * 4) + 's'; l.style.animationDelay = (Math.random() * 2.5) + 's'; document.body.appendChild(l); setTimeout(() => l.remove(), 11000); } }
  function finish(){ if(S.done) return; S.done = true; S.free = true; S.busy = false; S.tEnd = performance.now(); const t = elapsed(); ga('feast3d_win', {secs: Math.round(t), hints: S.hints, peeks: S.peeks});
    const best = store.get('feast3d.best.' + HUNT); if(!best || t < best.time) store.set('feast3d.best.' + HUNT, {time: t, hints: S.hints, peeks: S.peeks}); store.set('feast3d.last', HUNT);
    rig.lim = null; leaves(); finishCard(); }
  const other = () => HUNT === 'a' ? 'b' : 'a';
  function finishCard(){ const t = elapsed(), perfect = S.hints === 0 && S.peeks === 0, oth = HUNTS[other()].by; closeCard();
    const c = el('div', {id: 'feCard', class: 'side'}, `<div class="c" role="dialog" aria-labelledby="feH"><p class="k">Thanksgiving at Hillside · ${esc(HUNTS[HUNT].by)}’s trail</p><h2 id="feH">Dinner is on the table.</h2>
      ${perfect ? '<span class="stamp">A perfect hunt</span>' : ''}
      <p class="lede">Everything Snowball put away is under the oak, the candles are lit, and the house lights have come on. He says you may have the first roll. Biscuit has asked for the second.</p>
      <div class="stats"><div><b>${fmtT(t)}</b><span>your time</span></div><div><b>${S.hints}</b><span>${S.hints === 1 ? 'hint from Snowball' : 'hints from Snowball'}</span></div><div><b>${S.peeks}</b><span>${S.peeks === 1 ? 'wrong guess' : 'wrong guesses'}</span></div></div>
      <div class="acts"><button class="feBtn gold" type="button" id="fePic">${ICO.cam}Take a picture of the table</button><button class="feBtn" type="button" id="feShare">Share</button></div>
      <div class="cta"><b>The house is real, and it is for sale.</b><span>118 Hillside Drive is in Woodside, California. The terrace under the oak, the door under the stairs and the four skylights over the bed are all there in person.</span>
        <div class="acts"><a class="feBtn primary" href="/#contact" id="feSee" style="min-height:52px;font-size:17px">See it in person</a><a class="feBtn light" href="/tour/" id="feFree">Explore the house</a></div></div>
      <div class="more"><button class="feBtn" type="button" id="feAgain">Play again on ${esc(oth)}’s trail</button><a class="feBtn" href="/games/" id="feGames">More games</a></div></div>`);
    document.body.appendChild(c);
    $('#feSee').onclick = () => ga('feast3d_cta', {cta: 'see_in_person'}); $('#feFree').onclick = () => ga('feast3d_cta', {cta: 'explore'}); $('#feGames').onclick = () => ga('feast3d_cta', {cta: 'games'});
    $('#feAgain').onclick = () => { ga('feast3d_again'); const u = new URL(location.href); u.searchParams.set('hunt', other()); location.href = u.toString(); };
    $('#feShare').onclick = () => share($('#feShare')); $('#fePic').onclick = () => snap();
    try{ $('#fePic').focus({preventScroll: true}); }catch(e){} }
  function closeCard(){ $$('#feCard').forEach(c => c.remove()); }
  async function share(btn){ const url = SITE.page('/games/feast/'), text = `Thanksgiving at Hillside: Snowball the cat hid dinner all over 118 Hillside Drive, and I got it to the table under the oak in ${fmtT(elapsed())}. Your turn.`; ga('feast3d_share');
    try{ if(navigator.share){ await navigator.share({title: 'Thanksgiving at Hillside', text, url}); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
    try{ await navigator.clipboard.writeText(text + ' ' + url); btn.textContent = 'Link copied'; }catch(e){ btn.textContent = url; } }
  /* the picture: exactly what the canvas shows, with a caption underneath */
  let shot = null;
  function snap(){ let url = null; const off = rig.off; try{ rig.off = [0, 0]; rig.sig = ''; rigStep(performance.now(), 0); url = H.snapshot('image/jpeg', .93); }catch(e){ oops('snapshot', e); } rig.off = off; rig.sig = ''; wake(6); if(!url || url.length < 2000){ toast('That did not work here. Try a screenshot instead.', 3200); return; }
    SND.shutter(); const fl = $('#feFlash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on'); shot = url; ga('feast3d_photo'); setTimeout(pictureCard, reduce ? 0 : 260); }
  async function compose(){ const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = shot; });
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0; const ar = sw / sh; if(ar > 1.9){ const w2 = sh * 1.9; sx = (sw - w2) / 2; sw = w2; } else if(ar < .72){ const h2 = sw / .72; sy = (sh - h2) * .5; sh = h2; }
    try{ await Promise.all([document.fonts.load('600 60px "Cormorant Garamond"'), document.fonts.load('300 26px Jost')]); }catch(e){}
    const perfect = S.hints === 0 && S.peeks === 0, W = sw >= sh ? 1600 : 1200, Hh = Math.round(W * sh / sw), k = sw >= sh ? 1 : 1.12, band = Math.round(150 * k), c = document.createElement('canvas'); c.width = W; c.height = Hh + band; const x = c.getContext('2d');
    x.fillStyle = '#18213a'; x.fillRect(0, 0, W, Hh + band); x.drawImage(img, sx, sy, sw, sh, 0, 0, W, Hh);
    x.textBaseline = 'alphabetic'; x.fillStyle = '#f6f5f1'; x.font = `600 ${Math.round(58 * k)}px "Cormorant Garamond", Georgia, serif`; x.fillText('Thanksgiving at 118 Hillside', Math.round(56 * k), Hh + Math.round(74 * k));
    x.fillStyle = '#c4cad8'; x.font = `300 ${Math.round(25 * k)}px Jost, "Helvetica Neue", Arial, sans-serif`; x.fillText('Dinner found with Snowball the cat at 118hillside.com/games/feast', Math.round(58 * k), Hh + Math.round(116 * k));
    if(perfect){ x.save(); x.translate(W - Math.round(100 * k), Hh + Math.round(band / 2 - 4)); x.rotate(-.18); x.scale(k, k); x.beginPath(); for(let q = 0; q < 32; q++){ const a = q / 32 * Math.PI * 2, r = q % 2 ? 50 : 57; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fillStyle = '#e8b84a'; x.fill(); x.fillStyle = '#2a1d07'; x.textAlign = 'center'; x.font = '600 22px "Cormorant Garamond", Georgia, serif'; x.fillText('A perfect', 0, -4); x.fillText('hunt', 0, 20); x.restore(); }
    return c; }
  async function pictureCard(){ let cv = null; try{ cv = await compose(); }catch(e){ oops('picture', e); toast('That did not work here. Try a screenshot instead.', 3200); return; } closeCard();
    const c = el('div', {id: 'feCard'}, `<div class="c" role="dialog" aria-label="Your picture"><img class="pc" alt="Your picture: the Thanksgiving table at dusk, with a caption underneath" src="${cv.toDataURL('image/jpeg', .9)}">
      <div class="acts"><button class="feBtn primary" type="button" id="feSave">Save the picture</button><button class="feBtn" type="button" id="feShare2">Share</button><button class="feBtn" type="button" id="feRetake">Back to the table</button></div>
      <div class="cta"><b>The house is real, and it is for sale.</b><span>118 Hillside Drive is in Woodside, California. Come and stand on the terrace.</span><div class="acts"><a class="feBtn primary" href="/#contact" id="feSee2">See it in person</a></div></div></div>`);
    document.body.appendChild(c);
    $('#feSave').onclick = () => { const fail = () => toast('That did not work here. Try a screenshot instead.', 3200), give = href => { const a = document.createElement('a'); a.download = 'thanksgiving-at-118-hillside.png'; a.href = href; document.body.appendChild(a); a.click(); a.remove(); $('#feSave').textContent = 'Saved'; ga('feast3d_save'); };
      try{ if(cv.toBlob) cv.toBlob(b => { try{ if(!b) return give(cv.toDataURL('image/png')); const u = URL.createObjectURL(b); give(u); setTimeout(() => URL.revokeObjectURL(u), 20000); }catch(e){ fail(); } }, 'image/png'); else give(cv.toDataURL('image/png')); }catch(e){ fail(); } };
    $('#feShare2').onclick = () => share($('#feShare2')); $('#feRetake').onclick = () => finishCard(); $('#feSee2').onclick = () => ga('feast3d_cta', {cta: 'see_in_person_picture'}); }

  /* ================================================================== hints: Snowball, three levels for the step you are on */
  function hint(){ if(!S.started || S.done || rig.move || S.busy) return; let tiers = null; const tk = k => () => { const go = () => { if(S.place !== k) goTo(k); }; go(); };
    if(S.phase === 'intro') tiers = [['Tap the gold ring on the table. That is my note.'], ['The glowing ring, on the table in front of you.'], ['Fine. I will open it.', () => examine('note')]];
    else if(S.phase === 'hunt'){ const st = cur(), ans = st.answer, pl = SPOTS[ans].place; tiers = [[st.hints[0]], [st.hints[1], () => { catAt(catNear(ans)); }], [st.hints[2], () => { S.hot = ans; for(const id of st.spots) if(id !== ans) S.tried[id] = S.tried[id] || 'skip'; catAt(catNear(ans)); if(S.place !== pl) goTo(pl); else setMarks(); }]]; }
    else if(S.phase === 'carry') tiers = [['Take it out to the table under the oak. The map knows the way.'], ['Downstairs and outside. Tap Terrace on the map.'], ['Follow me.', () => carryNow()]];
    else if(S.phase === 'turkey') tiers = S.carry ? [['The table is right behind you.', () => { if(!S.ex) setDown(); }]] : [['The smoker is the black dome in the outdoor kitchen, by the terrace table.', tk('table')], ['Tap the gold ring on the smoker, then lift the lid.', tk('table')], ['I will do it. Stand back.', () => { const go = () => { if(S.ex && S.ex.id === 'smoker'){ liftLid(); return; } examine('smoker', {done: () => later(300, liftLid)}); }; if(S.place !== 'table') goTo('table', {done: () => later(200, go)}); else go(); }]];
    else if(S.phase === 'candles') tiers = [['The candles are on the table. There is a button for them.'], ['Light the candles. I will keep my tail out of the way.'], ['Fine.', () => lightCandles()]];
    if(!tiers) return;
    if(S.ex && S.ex.locked){ say(S.ex.id === 'note' ? 'Read my note, then start looking.' : S.ex.state === 'found' || S.ex.state === 'open' ? 'You found it. Carry it out to the table.' : S.ex.state === 'turkey' ? 'Light the candles.' : 'Read the tag. The next clue is on it.', 5000); return; }
    const i = Math.min(S.hintIx, tiers.length - 1), t = tiers[i]; S.hintIx = Math.min(i + 1, tiers.length - 1);
    S.hints++; S.lastProgress = performance.now(); $('#feHint').classList.remove('nudge'); ga('feast3d_hint', {phase: S.phase, step: S.step, tier: i + 1});
    const run = () => { if(t[1]) t[1](); say(t[0], 7500); }; S.hintAt = performance.now();
    if(S.ex && t[1] && !(S.phase === 'turkey' && S.ex.id === 'smoker')) back(run); else run(); }

  /* ================================================================== start */
  function startCard(){ const best = store.get('feast3d.best.' + HUNT);
    const c = el('div', {id: 'feCard'}, `<div class="c" role="dialog" aria-labelledby="feH"><p class="k">A game in the real house</p><h2 id="feH">Thanksgiving at Hillside</h2>
      <p class="lede">Dinner was ready. Then Snowball, the cat of the house, put it away, with help from an old golden dog called Biscuit. Now it is hidden all over the house.</p>
      <div class="note"><p>Everyone sits down at sunset. Every dish is somewhere sensible, and we left clues. Carry it all out to the table under the oak and nobody needs to know.</p><p class="sig">${PAWSVG.replace('aria-hidden="true"', 'class="paw" role="img" aria-label="Signed with a small paw print"')}${PAWSVG.replace('aria-hidden="true"', 'class="paw big" role="img" aria-label="and a large one"')}</p><p class="ps">P.S. I know where all of it is. Ask me if you get stuck.</p></div>
      <ul class="how"><li>${ICO.drag}Drag to look around</li><li>${ICO.disc}Tap a white circle to walk there</li><li>${ICO.ring}Tap a gold ring to look closer</li></ul>
      <div class="acts"><button class="feBtn primary" type="button" id="feGo" style="min-width:170px;min-height:52px;font-size:17px">Start the hunt</button><button class="feBtn" type="button" id="feSnd0"></button></div>
      <p class="foot">About ten minutes, for ages seven and up. Today you are on ${esc(HUNTS[HUNT].by)}’s trail${best ? ', and your best time on it is ' + fmtT(best.time) : ''}. The house is real: 118 Hillside Drive in Woodside, California, shown here as a 3D model, and it is for sale.</p></div>`);
    document.body.appendChild(c); const s0 = $('#feSnd0'), d0 = () => { s0.innerHTML = (SND.muted ? ICO.mute : ICO.sound) + '<span>' + (SND.muted ? 'Sound is off' : 'Sound is on') + '</span>'; s0.setAttribute('aria-pressed', String(!SND.muted)); };
    s0.onclick = () => { SND.setMuted(!SND.muted); d0(); UI.drawSnd(); if(!SND.muted) SND.goal(); }; d0(); try{ $('#feGo').focus({preventScroll: true}); }catch(e){}
    $('#feGo').onclick = () => { SND.unlock(); SND.tap(); $('#feGo').disabled = true; fadeThrough(() => { c.remove(); begin(); }, 420); }; }
  function begin(){ document.documentElement.classList.remove('fe-pre'); const p = standPose('table'); rigCut(PLACES.table.pos, p.yaw, p.pitch, p.fov); S.started = true; S.phase = 'intro'; S.t0 = S.lastProgress = performance.now(); ga('feast3d_start');
    setGoal(true); arrive('table', true); catAt(CHAIR); }

  /* ================================================================== frame loop */
  let lastT = performance.now();
  function frame(){ requestAnimationFrame(frame); const now = performance.now(), dt = Math.min(.1, (now - lastT) / 1000); lastT = now;
    try{ if(UI.live){ tweens(now); rigStep(now, dt); heldStep(now); sunStep(); if(P){ P.tick(now / 1000, dt); if(P.active()) wake(2); }
        for(const id in DISHOBJ){ const g = DISHOBJ[id]; if(g.userData.spin && g.visible){ g.rotation.y += dt * .7; wake(2); } } }
      if(S.busy && !rig.move && !TW.length){ if(!frame.busyAt) frame.busyAt = now; else if(now - frame.busyAt > 4200){ S.busy = false; frame.busyAt = 0; } } else frame.busyAt = 0;
      if(S.started){ marksStep(); mapStep(); coach();
        if(!S.done && now - S.lastProgress > 75000 && !S.ex) $('#feHint').classList.add('nudge'); }
    }catch(e){ if(!frame.err){ frame.err = true; oops('frame', e); } } }

  /* ================================================================== boot: after the house is ready */
  function boot(){ try{ H.asBuilt && H.asBuilt(); }catch(e){} S.staged = asStaged();
    let need = 2; const go = () => { if(--need > 0) return;
      const fonts = () => { try{ return Promise.race([Promise.all([document.fonts.load('40px "Caveat Brush"'), document.fonts.load('600 40px "Cormorant Garamond"')]), new Promise(r => setTimeout(r, 2500))]); }catch(e){ return Promise.resolve(); } };
      try{ buildUI(); }catch(e){ oops('ui', e); }
      fonts().then(() => { try{ buildWorld(); setHour(HOURS[0]);
          const a = yp([12.5, .9, -38.5], [-2.6, -1.6, -44]); rigCut([12.5, .9, -38.5], a[0], a[1], aspect() < 1 ? 80 : 58); UI.live = true; }catch(e){ oops('build', e); }
        requestAnimationFrame(frame);
        const clear = () => { const ld = document.getElementById('loading'); let n = 0; (function w(){ let o = 0; try{ o = ld ? +getComputedStyle(ld).opacity : 0; if(ld && getComputedStyle(ld).display === 'none') o = 0; }catch(e){}
            if(o < .03 || n++ > 40){ document.documentElement.classList.add('fe-up'); startCard(); } else setTimeout(w, 120); })(); };
        const intro = document.getElementById('intro28'); if(intro){ const mo = new MutationObserver(() => { if(!document.getElementById('intro28')){ mo.disconnect(); clear(); } }); mo.observe(document.body, {childList: true}); } else clear(); }); };
    loadScript('../assets/snowball.js?v=35', !!window.SNOWBALL, go); loadScript('../assets/feast3d/feast-props.js?v=2', !!window.FEASTPROPS, go); }
  (function wait(n){ let fr = 0; try{ fr = H.renderer.info.render.frame; }catch(e){} const ld = document.getElementById('loading'), up = ld && !ld.classList.contains('done');
    if((fr > 8 && !up) || n > 240) setTimeout(boot, 700); else setTimeout(() => wait(n + 1), 250); })(0);

  /* ================================================================== QA hook */
  const rc = new THREE.Raycaster();
  const shown = o => { for(let p = o; p; p = p.parent) if(!p.visible) return false; return true; };
  const solid = h => h.object.isMesh && shown(h.object) && !(h.object.parent && /^tree/.test(h.object.parent.name)) && !/leaf$|:leaf|contact|^feast|^v33|^r13/.test(h.object.name) && !/^feast/.test(h.object.parent && h.object.parent.name || '') && !(h.object.material && h.object.material.transparent && h.object.material.opacity < .5);
  function ray(o, d, far){ rc.set(v3(o), v3(d).normalize()); rc.far = far || 40; let hs = []; try{ hs = rc.intersectObjects(H.scene.children, true); }catch(e){} for(const h of hs) if(solid(h)) return h; return null; }
  function clearAt(p, hs){ let min = 99, who = ''; for(const dy of (hs || [0, -2, -3.8])) for(let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2, h = ray([p[0], p[1] + dy, p[2]], [Math.cos(a), 0, Math.sin(a)], 10); if(h && h.distance < min){ min = h.distance; who = (h.object.name || h.object.parent.name) + '@' + dy; } } return {min: +min.toFixed(2), who}; }
  function clearSeg(a, b){ const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]); let worst = null; for(const dy of [0, -1.6, -3.4, -4.7]) for(const s of [-.5, 0, .5]){ const nx = -d[2] / len * s, nz = d[0] / len * s, h = ray([a[0] + nx, a[1] + dy, a[2] + nz], d, len); if(h && (!worst || h.distance < worst.d)) worst = {d: +h.distance.toFixed(2), who: h.object.name || h.object.parent.name, dy}; } return worst; }
  window.FEAST3D = {errors: ERRS, S, rig, SITE, HELD, PLACES, SPOTS, STEPS, HUNTS, LIGHT, COOL, SMK, PROP, DISHOBJ, get hunt(){ return HUNT; }, get P(){ return P; }, sound: SND, goTo, examine, back, hint, openSpot, knock, carryNow, setDown, liftLid, lightCandles, setHour, setTod, catAt, say, snap, finish, ray, clearAt, clearSeg, sunDir,
    state: () => ({phase: S.phase, step: S.step, place: S.place, ex: S.ex && {id: S.ex.id, state: S.ex.state, mode: S.ex.mode}, busy: S.busy, move: !!rig.move, carry: S.carry, onTable: S.onTable.slice(), hints: S.hints, peeks: S.peeks, tod: S.tod, hour: S.hour, done: S.done, tw: TW.length,
      marks: marks.filter(m => m.on).map(m => { const q = m.b.getBoundingClientRect(); return {k: m.kind, key: m.key, label: m.label, x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2), edge: /edge/.test(m.b.className)}; })}),
    view(pos, look, fov){ const a = yp(pos, look); rigCut(pos, a[0], a[1], fov || 62); },
    // every authored viewpoint and walk: nearest thing around each standing point, and anything in the way of each walk
    audit(what){ const out = {}; if(!what || what === 'places') for(const k of ORDER) out['place:' + k] = clearAt(PLACES[k].pos);
      if(!what || what === 'spots') for(const id in SPOTS) out['spot:' + id] = clearAt(SPOTS[id].pos, [0]);
      if(!what || what === 'edges') for(const [a, b] of EDGES){ const h = clearSeg([NODES[a][0], NODE_Y(a), NODES[a][1]], [NODES[b][0], NODE_Y(b), NODES[b][1]]); if(h) out['edge:' + a + '>' + b] = h; } return out; },
    // play shortcuts for testing: solve the current clue the long way round, with the real functions
    async solve(){ const w = (f, ms) => new Promise(r => { const t0 = performance.now(); (function q(){ if(f() || performance.now() - t0 > (ms || 9000)) r(); else setTimeout(q, 60); })(); }), idle = () => !S.busy && !rig.move && !TW.length;
      if(S.phase === 'intro'){ examine('note'); await w(idle); sheetE.querySelector('[data-i]').click(); await w(() => !S.ex && idle()); return 'intro'; }
      if(S.phase === 'hunt'){ const st = cur(), pl = SPOTS[st.answer].place; if(S.ex){ back(); await w(() => !S.ex && idle()); } if(S.place !== pl){ goTo(pl); await w(() => S.place === pl && idle()); } examine(st.answer); await w(idle); openSpot(st.answer); await w(() => S.ex && S.ex.state === 'found' && idle()); sheetE.querySelector('[data-i]').click(); await w(() => S.ex && S.ex.state === 'tag' && idle(), 15000); sheetE.querySelector('[data-i]').click(); await w(() => (!S.ex || S.ex.id === 'smoker') && idle(), 9000); return 'step ' + S.step; }
      if(S.phase === 'turkey'){ if(!S.ex){ if(S.place !== 'table'){ goTo('table'); await w(() => S.place === 'table' && idle()); } examine('smoker'); } await w(idle); liftLid(); await w(() => S.ex && S.ex.state === 'open' && idle()); sheetE.querySelector('[data-i]').click(); await w(() => S.phase === 'candles' && idle(), 15000); return 'turkey'; }
      if(S.phase === 'candles'){ lightCandles(); await w(() => S.done, 30000); return 'done'; } return S.phase; }};
})();

/* preview hosts: when the site is served from a sub-path (a test mirror), point root links like /games/ at that copy; no effect on 118hillside.com */
(function(){ if(window.__siteLinks) return; window.__siteLinks = 1; var m = /githack/.test(location.host) ? location.pathname.match(/^(\/[^\/]+\/[^\/]+\/[^\/]+)\//) : location.pathname.match(/^(.*)\/(tour|thanksgiving|halloween|games|woodside)\//), base = m ? m[1] : ''; if(!base) return;
  document.addEventListener('click', function(e){ var a = e.target && e.target.closest && e.target.closest('a[href]'); if(!a) return; var h = a.getAttribute('href'); if(!h || h.charAt(0) !== '/' || h.charAt(1) === '/' || h.indexOf(base + '/') === 0) return;
    a.setAttribute('href', base + h.replace(/^([^?#]*\/)(?=[?#]|$)/, '$1index.html')); }, true);
})();
