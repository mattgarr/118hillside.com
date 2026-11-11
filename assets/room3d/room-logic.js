/* Room for Everyone: the rules, the house facts, the puzzles and the solver. No drawing in here.
   Used by room.js in the browser (window.ROOM_LOGIC) and by solve.js in Node (module.exports), so the proof that every puzzle
   has exactly one answer runs on the same code the game plays.

   The house facts were measured from the building model (tour/bim2/scene.meta.json) and from rays cast in the 3D scene:
   - level, bedroom or not, shared hallways, shared walls and what sits over what come from the model's rooms, doors and floors;
   - skylights, rainbow film, doors to the outside and the primary bath come from the model's own elements;
   - sun comes from rays cast from each window toward the real sun for this site on 21 June, through the model's trees, eaves
     and neighbours (room.js, ROOM3D.dev.sunScan). "am" is direct sun at some point from 7 to 10 in the morning, "pm" from
     5:30 to 7:30 in the evening, "none" is no direct sun at any hour.
   room.js re-measures the structural facts from the live model when it starts and warns if they drift (ROOM3D.dev.verify()). */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.ROOM_LOGIC = factory(); })(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  /* ------------------------------------------------------------------ the rooms */
  const SLOTS = {
    primary: {name: 'Primary suite',  sp: 'SP-L2-PRIMARY', lv: 'upper',  bed: 1, own: 1, out: 1, sky: 1, pm: 1, views: ['hills', 'oak']},
    loft:    {name: 'Loft',           sp: 'SP-L2-LOFT',    lv: 'upper',  bed: 0},   // no sky: the two skylights seen from the loft (SK-R03, SK-R04) are over the stair hall beside it
    garden:  {name: 'Garden bedroom', sp: 'SP-L1-BED1',    lv: 'main',   bed: 1, none: 1, views: ['oak']},
    middle:  {name: 'Middle bedroom', sp: 'SP-L1-BED2',    lv: 'main',   bed: 1, am: 1, views: ['side']},
    front:   {name: 'Front bedroom',  sp: 'SP-L1-BED3',    lv: 'main',   bed: 1, am: 1, views: ['street']},
    corner:  {name: 'Corner bedroom', sp: 'SP-L0-BED1',    lv: 'lower',  bed: 1, pm: 1, film: 1, views: ['terrace']},
    side:    {name: 'Side bedroom',   sp: 'SP-L0-BED2',    lv: 'lower',  bed: 1, pm: 1, film: 1, sky: 1},
    office:  {name: 'Skylit office',  sp: 'SP-L0-OFFICE',  lv: 'lower',  bed: 0, sky: 1},
    lounge:  {name: 'Bonus lounge',   sp: 'SP-L0-LOUNGE',  lv: 'lower',  bed: 0, out: 1, none: 1, tv: 1, views: ['terrace']},
    garage:  {name: 'Garage',         sp: 'SP-LG-GARAGE',  lv: 'garage', bed: 0, ev: 1}
  };
  const WHERE = {primary: 'The only bedroom upstairs. It sits over the two lower bedrooms.', loft: 'At the top of the stairs, beside the primary suite.',
    garden: 'On the bedroom hallway, with the Middle bedroom and the hall bath.', middle: 'On the bedroom hallway, with the Garden bedroom and the hall bath. The Front bedroom is through one wall.',
    front: 'Opens off the dining area, not the bedroom hallway. The Middle bedroom is through one wall.', corner: 'On the lower hallway, with the Side bedroom and the lower bath. The primary suite is overhead.',
    side: 'On the lower hallway, with the Corner bedroom and the lower bath. The primary suite is overhead.', office: 'By the lower level’s own front door.',
    lounge: 'Open to the lower hallway and the stairs. The primary bath is overhead, not a bedroom.', garage: 'A level of its own, a few steps up from the lower level. Nothing sleeps above it.'};
  const SLOT_IDS = Object.keys(SLOTS), BEDS = SLOT_IDS.filter(s => SLOTS[s].bed), SPARE = SLOT_IDS.filter(s => !SLOTS[s].bed);
  const LEVEL_NAME = {upper: 'upper level', main: 'main level', lower: 'lower level', garage: 'garage'};
  const LEVEL_RANK = {lower: 0, garage: 0.5, main: 1, upper: 2};
  // bedrooms whose doors open onto the same hallway (and so share that hallway's bathroom)
  const HALLS = [['garden', 'middle'], ['corner', 'side']];
  // rooms with a wall in common. The two lower bedrooms only touch along four feet at one corner, so that pair is "unsure":
  // every puzzle must have the same single answer whether or not it counts.
  const WALLS = [['middle', 'front']], WALLS_UNSURE = [['corner', 'side']];
  // [upper room, room under its floor]
  const OVER = [['primary', 'corner'], ['primary', 'side']];
  const pairIn = (list, a, b) => list.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));

  /* ------------------------------------------------------------------ what a visitor can notice in a room
     Each fact a clue can lean on belongs to one "note". A note about something a room HAS is earned by looking at it
     (a gold ring in the room, or watching the light there). That a room LACKS something is known once you have been inside. */
  const NOTE_OF = {own: 'bath', out: 'door', sky: 'sky', film: 'film', am: 'light', pm: 'light', none: 'light', tv: 'tv', ev: 'ev'};
  const noteOf = attr => attr.indexOf('view:') === 0 ? attr : NOTE_OF[attr];
  const has = (slot, attr) => attr.indexOf('view:') === 0 ? (SLOTS[slot].views || []).indexOf(attr.slice(5)) >= 0 : !!SLOTS[slot][attr];

  /* ------------------------------------------------------------------ guests
     Every guest is an animal, or something an animal brought. Kind 'p' takes one of the six bedrooms (a bed, a basket, a perch
     or a bowl on the dresser). Kind 't' goes in one of the four rooms that are not bedrooms: Mabel, who sleeps in her shell,
     and the things. */
  const GUESTS = {
    puddle:  {name: 'Puddle', kind: 'p', col: '#2b7c9e', ico: 'duck',
      bio: 'A duck. She takes a long bath every morning and does not share the tub.', yay: 'Quack. That means yes.'},
    biscuit: {name: 'Biscuit', kind: 'p', col: '#c08a2b', ico: 'dog',
      bio: 'An old, gentle golden dog and a regular visitor. He follows his nose and will not do stairs.', yay: 'No stairs between me and the kitchen.'},
    admiral: {name: 'Admiral', kind: 'p', col: '#d2622a', ico: 'fish',
      bio: 'A goldfish in a round glass bowl. Direct sun warms the water, so the bowl stays in the shade.', yay: 'Shade all day. Blub.'},
    rufus:   {name: 'Rufus', kind: 'p', col: '#a8323a', ico: 'rooster',
      bio: 'A rooster. He is up before the sun and likes everyone to know it.', yay: 'First sun on my perch. I shall announce it.'},
    ziggy:   {name: 'Ziggy', kind: 'p', col: '#8f8a2a', ico: 'lizard',
      bio: 'A bearded dragon. He spends all day getting warm and saves his best basking for last.', yay: 'There is my sunset.'},
    olive:   {name: 'Olive', kind: 'p', col: '#5b4a9c', ico: 'owl',
      bio: 'A visiting barn owl. She keeps night hours and watches the sky.', yay: 'Stars, straight from my perch.'},
    nugget:  {name: 'Nugget', kind: 'p', col: '#8c5a3c', ico: 'hamster',
      bio: 'A hamster who sleeps all day and is busy all night. The wheel came too.', yay: 'Good night. See you at dusk.'},
    clover:  {name: 'Clover', kind: 'p', col: '#5f7f8c', ico: 'rabbit',
      bio: 'A shy rabbit with very good ears. One thump overhead and Clover is under the bed.', yay: 'Not a footstep. Thank you.'},
    pepper:  {name: 'Pepper', kind: 'p', col: '#b8408a', ico: 'parrot',
      bio: 'A grey parrot who loves colour and repeats whatever was said last.', yay: 'Rainbows on the floor. Rainbows on the floor.'},
    truffle: {name: 'Truffle', kind: 'p', col: '#2f8f6b', ico: 'guinea',
      bio: 'A guinea pig who is never far from the next meal.', yay: 'A short trot from bed to lettuce.'},
    wheel:   {name: 'Nugget’s wheel', short: 'The wheel', kind: 't', col: '#8c5a3c', ico: 'wheel', bio: 'It squeaks, and it turns from dusk until dawn.', yay: 'Squeak. Squeak. Squeak.'},
    mabel:   {name: 'Mabel', kind: 't', col: '#2f8a80', ico: 'tortoise', bio: 'A tortoise who likes warm paving and takes her time. She sleeps in her shell, so she does not need a bedroom.', yay: 'Already outside. It took a while.'},
    lettuce: {name: 'Truffle’s lettuce', short: 'The lettuce', kind: 't', col: '#2f8f6b', ico: 'lettuce', bio: 'A tray of it, still growing. It needs daylight.', yay: 'Growing nicely.'},
    scope:   {name: 'Olive’s telescope', short: 'The telescope', kind: 't', col: '#5b4a9c', ico: 'scope', bio: 'It points at the sky. Olive has claimed it as a perch.', yay: 'Pointed at the sky.'},
    van:     {name: 'the van', short: 'The van', kind: 't', col: '#3d5a98', ico: 'van', bio: 'Electric, and nearly flat after bringing everyone here.', yay: 'Plugged in.'}
  };
  const isP = g => GUESTS[g].kind === 'p';
  const nm = g => GUESTS[g].name;
  const Nm = g => nm(g)[0].toUpperCase() + nm(g).slice(1);   // at the start of a sentence ("the van" becomes "The van")
  const vb = (g, s, p) => GUESTS[g].pl ? p : s;   // verb agreement, should a guest ever be a pair

  /* ------------------------------------------------------------------ clues
     A clue is {k: kind, ...args, t: text}. test(clue, at, level, world) returns true (met), false (broken) or null (cannot say
     yet, because someone it speaks of has no room). needs(clue, at) lists the [room, note, has] facts the clue leans on now. */
  const lvOf = (s, world) => (world && world.garageLower && s === 'garage') ? 'lower' : SLOTS[s].lv;
  const wallsOf = world => (world && world.cornerSide) ? WALLS.concat(WALLS_UNSURE) : WALLS;
  const sleepersOf = L => L.guests.filter(isP);
  // "nobody else ..." clues: broken as soon as one other guest with a bedroom breaks them, met only when every such guest has a room
  const others = (c, at, L, bad) => { const s = at[c.who]; if(!s) return null; let open = false;
    for(const g of sleepersOf(L)){ if(g === c.who) continue; const o = at[g]; if(!o){ open = true; continue; } if(bad(s, o)) return false; } return open ? null : true; };
  const KINDS = {
    // who's room has (or, with no: true, lacks) one fact
    attr: {who: c => [c.who],
      test(c, at){ const s = at[c.who]; if(!s) return null; return has(s, c.attr) === !c.no; },
      needs(c, at){ const s = at[c.who]; return s ? [[s, noteOf(c.attr), has(s, c.attr)]] : []; }},
    level: {who: c => [c.who], test(c, at, L, w){ const s = at[c.who]; return s ? c.lv.indexOf(lvOf(s, w)) >= 0 : null; }},
    notin: {who: c => [c.who], test(c, at){ const s = at[c.who]; return s ? c.slots.indexOf(s) < 0 : null; }},
    isin: {who: c => [c.who], test(c, at){ const s = at[c.who]; return s ? c.slots.indexOf(s) >= 0 : null; }},
    same: {who: c => [c.a, c.b], test(c, at, L, w){ const a = at[c.a], b = at[c.b]; return a && b ? lvOf(a, w) === lvOf(b, w) : null; }},
    diff: {who: c => [c.a, c.b], test(c, at, L, w){ const a = at[c.a], b = at[c.b]; return a && b ? lvOf(a, w) !== lvOf(b, w) : null; }},
    higher: {who: c => [c.a, c.b], test(c, at, L, w){ const a = at[c.a], b = at[c.b]; return a && b ? LEVEL_RANK[lvOf(a, w)] > LEVEL_RANK[lvOf(b, w)] : null; }},
    hall: {who: c => [c.a, c.b], test(c, at){ const a = at[c.a], b = at[c.b]; return a && b ? pairIn(HALLS, a, b) === !c.no : null; }},
    // a must not have the bedroom directly over or under b's
    apart: {who: c => [c.a, c.b], test(c, at){ const a = at[c.a], b = at[c.b]; return a && b ? !pairIn(OVER, a, b) : null; }},
    alone: {who: c => [c.who], all: 1, test(c, at, L, w){ return others(c, at, L, (s, o) => lvOf(o, w) === lvOf(s, w)); }},          // a level to themselves
    nohall: {who: c => [c.who], all: 1, test(c, at, L){ return others(c, at, L, (s, o) => pairIn(HALLS, s, o)); }},                  // a hallway to themselves
    nowall: {who: c => [c.who], all: 1, test(c, at, L, w){ return others(c, at, L, (s, o) => pairIn(wallsOf(w), s, o)); }},          // nobody through the wall
    noover: {who: c => [c.who], all: 1, test(c, at, L){ return others(c, at, L, (s, o) => OVER.some(p => p[0] === o && p[1] === s)); }},   // nobody overhead
    // a thing that must not share a level with any bedroom in use
    quiet: {who: c => [c.who], all: 1, test(c, at, L, w){ const s = at[c.who]; if(!s) return null; let open = false;
      for(const g of sleepersOf(L)){ const o = at[g]; if(!o){ open = true; continue; } if(lvOf(o, w) === lvOf(s, w)) return false; } return open ? null : true; }}
  };
  const test = (c, at, L, world) => KINDS[c.k].test(c, at, L, world);
  const needs = (c, at) => KINDS[c.k].needs ? KINDS[c.k].needs(c, at) : [];
  const whoOf = c => KINDS[c.k].who(c);
  const isRel = c => whoOf(c).length > 1 || !!KINDS[c.k].all;

  /* ------------------------------------------------------------------ solver: every way to give every guest a room */
  const WORLDS = [{}, {cornerSide: 1}, {garageLower: 1}, {cornerSide: 1, garageLower: 1}];
  function solutions(L, world, limit){ const out = [], at = Object.assign({}, L.given || {}), used = new Set(Object.values(at));
    const todo = L.guests.filter(g => !at[g]);
    (function rec(i){ if(limit && out.length >= limit) return;
      if(i === todo.length){ for(const c of L.clues) if(test(c, at, L, world) !== true) return; out.push(Object.assign({}, at)); return; }
      const g = todo[i]; for(const s of (isP(g) ? BEDS : SPARE)){ if(used.has(s)) continue; at[g] = s; used.add(s);
        let ok = true; for(const c of L.clues) if(test(c, at, L, world) === false){ ok = false; break; }
        if(ok) rec(i + 1); used.delete(s); delete at[g]; } })(0);
    return out; }
  const sameAt = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k]);
  // a puzzle is sound when it has exactly one answer, and the same one, in every reading of the two unsure facts
  function prove(L){ const per = WORLDS.map(w => solutions(L, w, 3)), ok = per.every(p => p.length === 1) && per.every(p => sameAt(p[0], per[0][0]));
    return {ok, counts: per.map(p => p.length), answer: per[0][0] || null}; }
  // how many guests their own clues place, before any guest is weighed against another: fewer means more to work out
  function depth(L){ const world = WORLDS[0], given = L.given || {}, gs = L.guests.filter(g => !given[g]), cand = {};
    for(const g of gs) cand[g] = (isP(g) ? BEDS : SPARE).filter(s => { if(Object.values(given).includes(s)) return false;
      const at = Object.assign({}, given, {[g]: s}); return L.clues.every(c => test(c, at, L, world) !== false); });
    return {alone: gs.filter(g => cand[g].length === 1).length, total: gs.length, cand}; }
  // clues the puzzle would still be sound without
  const spare = L => L.clues.map((c, i) => prove(Object.assign({}, L, {clues: L.clues.filter((_, j) => j !== i)})).ok ? i + 1 : 0).filter(Boolean);

  /* ------------------------------------------------------------------ what each guest asks for
     must: asked every time that guest appears (it is who they are). may: asked on some days. The words are written once, here.
     The garage has a 50-amp, 240-volt outlet and no charger: no line may say or imply that a charger is installed. */
  const T = {
    puddleBath: 'Puddle takes a long bath every morning. She wants the one bathroom that nobody else walks into.',
    biscuitMain: 'Biscuit will not do stairs. Put him on the same level as the kitchen.',
    biscuitOak: 'Biscuit likes to watch the old oak. He wants it outside his window.',
    biscuitAm: 'Biscuit likes the morning sun on his bed.',
    admiralNone: 'Admiral must be kept out of direct sun. The bowl goes in a room that gets none at any hour.',
    rufusAm: 'Rufus is up before anyone. He wants the morning sun in his room.',
    rufusHall: 'Rufus crows at first light. Nobody else should have a bedroom on his hallway.',
    ziggyPm: 'Ziggy saves his best basking for last. He needs the evening sun in his room.',
    ziggyTerrace: 'Ziggy has his eye on the warm paving. He wants to see the terrace from his window.',
    oliveSky: 'Olive watches the sky all night. Her room needs a skylight.',
    oliveScope: 'Olive likes to sit on the telescope. Put her on the same level as it.',
    cloverOver: 'Clover bolts at a footstep. Nobody may have the bedroom over hers.',
    cloverHall: 'Clover also wants a hallway with nobody else on it.',
    cloverOak: 'Clover would like the old oak outside her window.',
    pepperFilm: 'Pepper loves colour. She wants a room where the window throws rainbows on the floor.',
    pepperSky: 'Pepper wants a skylight as well.',
    truffleLettuce: 'Truffle wants a bed on the same level as the lettuce.',
    wheelQuiet: 'The wheel squeaks all night. Nobody can have a bedroom on the same level as the wheel.',
    wheelIn: 'The wheel stays in the house, not the garage. That is too far for a hamster to walk.',
    mabelOut: 'Mabel takes her time. She needs a door that opens straight onto the terrace.',
    lettuceSky: 'Lettuce needs daylight from above. The tray goes in a room with a skylight in its own ceiling.',
    scopeUp: 'The telescope goes as high in the house as it can.',
    vanOutlet: 'The van is electric and nearly flat. It needs the 50-amp, 240-volt outlet.'};
  const ASK = {
    puddle: {may: [
      {k: 'attr', attr: 'own', t: T.puddleBath},
      {k: 'attr', attr: 'out', t: 'Puddle likes a waddle before breakfast. Her room needs a door straight outside.'}]},
    biscuit: {must: [{k: 'level', lv: ['main'], t: T.biscuitMain}], may: [
      {k: 'attr', attr: 'view:oak', t: T.biscuitOak},
      {k: 'attr', attr: 'am', t: T.biscuitAm}]},
    admiral: {must: [{k: 'attr', attr: 'none', t: T.admiralNone}]},
    rufus: {must: [{k: 'attr', attr: 'am', t: T.rufusAm}], may: [
      {k: 'nohall', t: T.rufusHall},
      {k: 'attr', attr: 'view:street', t: 'Rufus likes to see who is coming up the front walk. He wants a window toward the street.'}]},
    ziggy: {must: [{k: 'attr', attr: 'pm', t: T.ziggyPm}], may: [
      {k: 'attr', attr: 'out', t: 'Ziggy wants to step straight outside from his room.'},
      {k: 'attr', attr: 'view:terrace', t: T.ziggyTerrace}]},
    olive: {must: [{k: 'attr', attr: 'sky', t: T.oliveSky}], may: [
      {k: 'alone', t: 'Olive keeps night hours. She wants to be the only one with a bedroom on her level.'},
      {k: 'same', b: 'scope', t: T.oliveScope}]},
    nugget: {may: [{k: 'diff', b: 'wheel', t: 'Nugget sleeps best on a different level from the wheel.'},
      {k: 'attr', attr: 'sky', t: 'Nugget is up all night and likes to watch the moon. He wants a room with a skylight.'}]},
    clover: {must: [{k: 'noover', t: T.cloverOver}], may: [
      {k: 'nohall', t: T.cloverHall},
      {k: 'attr', attr: 'view:oak', t: T.cloverOak}]},
    pepper: {must: [{k: 'attr', attr: 'film', t: T.pepperFilm}], may: [
      {k: 'attr', attr: 'view:terrace', t: 'Pepper wants to see the outdoor kitchen from her window.'},
      {k: 'attr', attr: 'sky', t: T.pepperSky}]},
    truffle: {must: [{k: 'same', b: 'lettuce', t: T.truffleLettuce}], may: [
      {k: 'attr', attr: 'sky', t: 'Truffle wants a skylight over the bed too.'}]},
    wheel: {must: [{k: 'quiet', t: T.wheelQuiet},
      {k: 'notin', slots: ['garage'], t: T.wheelIn}]},
    mabel: {must: [{k: 'attr', attr: 'out', t: T.mabelOut}]},
    lettuce: {must: [{k: 'attr', attr: 'sky', t: T.lettuceSky}]},
    scope: {must: [{k: 'level', lv: ['upper'], t: T.scopeUp}]},
    van: {must: [{k: 'attr', attr: 'ev', t: T.vanOutlet}]}
  };
  const WITH = {wheel: 'nugget', lettuce: 'truffle', scope: 'olive', van: 'ziggy', mabel: 'biscuit'};   // which guest each of these arrives with
  const mk = (g, a) => { const c = Object.assign({}, a); if('b' in c) c.a = g; else c.who = g; return c; };
  const REL = [
    {k: 'same', sym: 1, t: (a, b) => `${nm(a)} ${vb(a, 'wants', 'want')} to be on the same level as ${nm(b)}.`},
    {k: 'diff', sym: 1, t: (a, b) => `${nm(a)} and ${nm(b)} are better on different levels this time.`},
    {k: 'higher', t: (a, b) => `${nm(a)} ${vb(a, 'sleeps', 'sleep')} on a higher level than ${nm(b)}.`},
    {k: 'hall', sym: 1, t: (a, b) => `${nm(a)} ${vb(a, 'wants', 'want')} a door on the same hallway as ${nm(b)}.`},
    {k: 'hall', sym: 1, no: true, t: (a, b) => `${nm(a)} would rather not share a hallway with ${nm(b)}.`},
    {k: 'apart', sym: 1, t: (a, b) => `${nm(a)} must not have the bedroom directly over or under ${nm(b)}.`}];

  /* ------------------------------------------------------------------ building a puzzle from a seed, proven by the same solver */
  function rng(seed){ let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const shuffle = (a, r) => { a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const countAll = L => WORLDS.reduce((n, w) => Math.max(n, solutions(L, w, 300).length), 0);
  function build(seed, opts){ opts = opts || {}; const SLEEPERS = Object.keys(GUESTS).filter(isP), THINGS = Object.keys(GUESTS).filter(g => !isP(g));
    for(let attempt = 0; attempt < 300; attempt++){ const r = rng((seed * 9973 + attempt * 7919) >>> 0);
      let guests = opts.guests;
      if(!guests){ const np = r() < .45 ? 4 : 5, ps = shuffle(SLEEPERS, r).slice(0, np), own = THINGS.filter(t => ps.indexOf(WITH[t]) >= 0);
        // Nugget never travels without the wheel, nor Truffle without the lettuce; the others come along some days
        const ts = own.filter(t => t === 'wheel' || t === 'lettuce').concat(shuffle(own.filter(t => t !== 'wheel' && t !== 'lettuce'), r).slice(0, r() < .6 ? 1 : 0));
        if(!ts.length || ts.length > 2) continue; guests = ps.concat(ts); }
      const given = opts.given || {}, musts = [];
      for(const g of guests) for(const a of ((ASK[g] || {}).must || [])){ if(a.b && guests.indexOf(a.b) < 0) continue; musts.push(mk(g, a)); }
      const all = solutions({guests, clues: musts, given}, WORLDS[0], 3000); if(!all.length) continue;
      const target = all[Math.floor(r() * all.length)], base = {guests, given};
      const fits = c => WORLDS.every(w => test(c, target, base, w) === true);
      // everything true of the target that a guest might say
      const pool = []; for(const g of guests) for(const a of ((ASK[g] || {}).may || [])){ if(a.b && guests.indexOf(a.b) < 0) continue; const c = mk(g, a); if(fits(c)) pool.push(c); }
      const ppl = guests.filter(isP); for(const a of ppl) for(const b of ppl){ if(a === b) continue; for(const R of REL){ if(R.sym && a > b) continue;
        const c = {k: R.k, a, b, no: !!R.no, t: R.t(a, b)}; if(fits(c)) pool.push(c); } }
      let clues = musts.slice(), rest = shuffle(pool, r), n = countAll({guests, clues, given});
      while(n > 1 && rest.length){ let best = -1, bn = n; const pick = rest.slice(0, 12);
        for(let i = 0; i < pick.length; i++){ const m = countAll({guests, clues: clues.concat([pick[i]]), given}); if(m < bn){ bn = m; best = i; } }
        if(best < 0){ rest = rest.slice(12); continue; } clues.push(rest[best]); rest.splice(best, 1); n = bn; }
      if(n !== 1) continue;
      // drop what is not needed (what a guest always asks stays: it is who they are)
      for(const c of shuffle(clues.filter(c => musts.indexOf(c) < 0), r)){ const less = clues.filter(x => x !== c); if(prove({guests, clues: less, given}).ok) clues = less; }
      const L = {guests, clues, given}, p = prove(L); if(!p.ok) continue;
      const d = depth(L); if(clues.length > (opts.maxClues || 10) || clues.filter(isRel).length < 2 || d.alone > d.total - 2) continue;
      L.answer = p.answer; L.seed = seed; L.attempt = attempt; return L; }
    return null; }
  const dayNumber = d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  function daily(day){ const L = build(day, {}); if(!L) return null; L.id = 'day' + day; L.daily = day; L.title = 'Today’s guest list';
    L.story = 'A different guest list every day, and exactly one way to fit everyone in.'; return L; }

  /* ------------------------------------------------------------------ the hand-made puzzles
     order: the order a careful player can work them out in, which is also the order Snowball's hints go in.
     hints: two nudges per guest (the third hint always puts that guest in their room). */
  const LEVELS = [
    {id: 'warm', title: 'First visitors',
      story: 'Snowball lives at 118 Hillside, and this weekend he has company. Puddle, Biscuit and Olive are on their way. Three bedrooms to choose.',
      guests: ['puddle', 'biscuit', 'olive'],
      clues: [
        {k: 'attr', who: 'puddle', attr: 'own', t: T.puddleBath},
        {k: 'level', who: 'biscuit', lv: ['main'], t: T.biscuitMain},
        {k: 'attr', who: 'biscuit', attr: 'view:oak', t: T.biscuitOak},
        {k: 'attr', who: 'olive', attr: 'sky', t: T.oliveSky}],
      order: ['puddle', 'biscuit', 'olive'],
      hints: {puddle: ['One bedroom has a bathroom all to itself. It is upstairs.', 'Go into the Primary suite and tap the gold ring by its bath.'],
        biscuit: ['The kitchen is on the main level. So are three bedrooms.', 'Look out of the windows on the main level. One of them is full of oak.'],
        olive: ['Two bedrooms have skylights, and one of those is taken.', 'Go downstairs to the Side bedroom and look up.']},
      epi: 'Three visitors settled, and Puddle is already running the bath.'},
    {id: 'sun', title: 'The longest day',
      story: 'Midsummer, the longest day of the year, and every visitor has a firm opinion about the sun. Even the big room upstairs is free.',
      guests: ['admiral', 'rufus', 'ziggy', 'pepper', 'van'],
      clues: [
        {k: 'attr', who: 'admiral', attr: 'none', t: T.admiralNone},
        {k: 'attr', who: 'rufus', attr: 'am', t: T.rufusAm},
        {k: 'nohall', who: 'rufus', t: T.rufusHall},
        {k: 'attr', who: 'ziggy', attr: 'pm', t: T.ziggyPm},
        {k: 'attr', who: 'pepper', attr: 'film', t: T.pepperFilm},
        {k: 'higher', a: 'ziggy', b: 'pepper', t: 'Ziggy sleeps on a higher level than Pepper.'},
        {k: 'attr', who: 'pepper', attr: 'sky', t: T.pepperSky},
        {k: 'attr', who: 'van', attr: 'ev', t: T.vanOutlet}],
      order: ['admiral', 'rufus', 'pepper', 'ziggy', 'van'],
      hints: {admiral: ['Go into each bedroom and drag the sun across the day. One bedroom never gets any.', 'The old oak shades one room on the main level from morning to night.'],
        rufus: ['Two bedrooms get the morning sun. One of them shares a hallway with Admiral.', 'Rufus needs the morning room that has no neighbour on its hallway.'],
        pepper: ['Two windows downstairs wear rainbow film. Only one of those rooms has skylights too.', 'Look up in both lower bedrooms.'],
        ziggy: ['Three bedrooms get the evening sun. Ziggy has to be above Pepper.', 'There is only one bedroom higher than the lower level with evening sun.'],
        van: ['Only one room in the house has an outlet big enough for the van.', 'Have a look in the garage.']},
      epi: 'The sun went down at half past eight, and Ziggy got the last of it.'},
    {id: 'wheel', title: 'The squeaky wheel',
      story: 'Nugget brought the wheel. Nobody asked for that. Mabel is heading for the terrace at her own speed, Clover has not slept properly since Tuesday, and the wheel is still in the entry.',
      guests: ['puddle', 'biscuit', 'nugget', 'clover', 'wheel', 'mabel'],
      clues: [
        {k: 'attr', who: 'mabel', attr: 'out', t: T.mabelOut},
        {k: 'quiet', who: 'wheel', t: T.wheelQuiet},
        {k: 'notin', who: 'wheel', slots: ['garage'], t: T.wheelIn},
        {k: 'attr', who: 'puddle', attr: 'own', t: T.puddleBath},
        {k: 'level', who: 'biscuit', lv: ['main'], t: T.biscuitMain},
        {k: 'nowall', who: 'clover', t: 'Clover hears everything. Nobody may have a bedroom on the other side of one of her walls.'},
        {k: 'hall', a: 'biscuit', b: 'clover', t: 'Biscuit keeps an eye on Clover. He wants a door on the same hallway as hers.'}],
      order: ['mabel', 'puddle', 'wheel', 'clover', 'biscuit', 'nugget'],
      hints: {mabel: ['One room that is not a bedroom has doors straight onto the terrace.', 'Go into the Bonus lounge and look at the glass doors.'],
        puddle: ['Same as ever: the bedroom with its own bath.', 'The Primary suite, upstairs.'],
        wheel: ['The wheel needs a level where no bedroom is taken. Puddle is upstairs, and the garage is out.', 'That leaves one room on the lower level, so nobody has a bedroom down there tonight.'],
        clover: ['If no bedroom downstairs is taken, three visitors share the main level. One bedroom there has no bedroom through any wall.', 'Lift the upper level off and look at the main level from above. One bedroom stands apart from the other two.'],
        biscuit: ['Two bedrooms on the main level open onto the same short hallway.', 'Clover has one of them. Biscuit takes the other.'],
        nugget: ['One bedroom left on the main level.', 'The Front bedroom.']},
      epi: 'Nugget ran until dawn. Clover slept through it. Nobody can explain this.'},
    {id: 'stars', title: 'Meteor shower',
      story: 'Olive has talked everyone into staying up for the meteors. Truffle is staying close to the lettuce, Ziggy wants the warm side of the house, and Rufus will be asleep by nine whatever happens.',
      guests: ['olive', 'truffle', 'ziggy', 'rufus', 'clover', 'scope', 'lettuce'],
      clues: [
        {k: 'level', who: 'scope', lv: ['upper'], t: T.scopeUp},
        {k: 'same', a: 'olive', b: 'scope', t: T.oliveScope},
        {k: 'attr', who: 'lettuce', attr: 'sky', t: T.lettuceSky},
        {k: 'same', a: 'truffle', b: 'lettuce', t: T.truffleLettuce},
        {k: 'attr', who: 'ziggy', attr: 'view:terrace', t: T.ziggyTerrace},
        {k: 'noover', who: 'clover', t: T.cloverOver},
        {k: 'attr', who: 'clover', attr: 'view:oak', t: T.cloverOak},
        {k: 'attr', who: 'rufus', attr: 'am', t: T.rufusAm},
        {k: 'nohall', who: 'rufus', t: T.rufusHall}],
      order: ['scope', 'olive', 'lettuce', 'ziggy', 'truffle', 'clover', 'rufus'],
      hints: {scope: ['Two rooms are on the upper level, and only one of them is not a bedroom.', 'The Loft, at the top of the stairs.'],
        olive: ['Olive goes on the telescope’s level.', 'There is one bedroom up there.'],
        lettuce: ['One room that is not a bedroom has skylights of its own.', 'It says so on the door: the Skylit office.'],
        ziggy: ['Look out of the windows downstairs. One of them faces the terrace.', 'One lower bedroom looks straight at the outdoor kitchen.'],
        truffle: ['Truffle sleeps on the lettuce’s level, and Ziggy has one of the two bedrooms there.', 'The Side bedroom.'],
        clover: ['Olive is upstairs, so Clover cannot be under her. One other bedroom looks at the oak.', 'The Garden bedroom, on the main level.'],
        rufus: ['Two bedrooms get the morning sun. One shares Clover’s hallway.', 'The Front bedroom.']},
      epi: 'Forty-one meteors. Rufus slept through every one.'},
    {id: 'full', title: 'Full house',
      story: 'Everyone said yes. Six bedrooms, six visitors and one squeaky wheel. Puddle has given up the big bath for the night and says it will be fine.',
      guests: ['puddle', 'biscuit', 'rufus', 'ziggy', 'clover', 'nugget', 'wheel'],
      clues: [
        {k: 'noover', who: 'clover', t: T.cloverOver},
        {k: 'nohall', who: 'clover', t: T.cloverHall},
        {k: 'attr', who: 'rufus', attr: 'am', t: T.rufusAm},
        {k: 'nohall', who: 'rufus', t: T.rufusHall},
        {k: 'level', who: 'biscuit', lv: ['main'], t: T.biscuitMain},
        {k: 'attr', who: 'biscuit', attr: 'am', t: T.biscuitAm},
        {k: 'attr', who: 'ziggy', attr: 'pm', t: T.ziggyPm},
        {k: 'attr', who: 'ziggy', attr: 'view:terrace', t: T.ziggyTerrace},
        {k: 'attr', who: 'puddle', attr: 'pm', t: 'Puddle only asks for the evening sun.'},
        {k: 'isin', who: 'wheel', slots: ['garage'], t: 'Every level with a bedroom has somebody on it, so the wheel goes out to the garage.'}],
      order: ['wheel', 'rufus', 'clover', 'biscuit', 'ziggy', 'puddle', 'nugget'],
      hints: {wheel: ['This one is spelled out for you.', 'The garage.'],
        rufus: ['Every bedroom is taken tonight. Two bedrooms get the morning sun, and one of them shares a hallway.', 'Rufus needs the morning room that opens off the dining area, not the bedroom hallway.'],
        clover: ['Every bedroom is taken, so somebody has the Primary suite. Clover cannot be under it, and she wants a hallway to herself.', 'Rufus has the Front bedroom. Only one room is left that has nobody overhead and nobody on its hallway.'],
        biscuit: ['Main level, with the morning sun, and Rufus has one of those.', 'The Middle bedroom.'],
        ziggy: ['Evening sun and a window onto the terrace.', 'The Corner bedroom, downstairs.'],
        puddle: ['Two bedrooms left. Only one of them gets the evening sun.', 'The Side bedroom, under the skylights.'],
        nugget: ['One bedroom left.', 'The Garden bedroom. Nugget can hear the wheel from there, just.']},
      epi: 'Six bedrooms, all taken, and the wheel in the one place nobody could object.'}
  ];

  return {SLOTS, WHERE, SLOT_IDS, BEDS, SPARE, LEVEL_NAME, LEVEL_RANK, HALLS, WALLS, WALLS_UNSURE, OVER, GUESTS, KINDS, ASK, REL, WITH, LEVELS, WORLDS,
    has, noteOf, isP, nm, Nm, vb, isRel, test, needs, whoOf, solutions, prove, depth, spare, rng, build, daily, dayNumber};
});
