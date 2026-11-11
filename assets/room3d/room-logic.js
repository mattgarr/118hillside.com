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
    loft:    {name: 'Loft',           sp: 'SP-L2-LOFT',    lv: 'upper',  bed: 0},
    garden:  {name: 'Garden bedroom', sp: 'SP-L1-BED1',    lv: 'main',   bed: 1, none: 1, views: ['oak']},
    middle:  {name: 'Middle bedroom', sp: 'SP-L1-BED2',    lv: 'main',   bed: 1, am: 1, views: ['side']},
    front:   {name: 'Front bedroom',  sp: 'SP-L1-BED3',    lv: 'main',   bed: 1, am: 1, views: ['street']},
    corner:  {name: 'Corner bedroom', sp: 'SP-L0-BED1',    lv: 'lower',  bed: 1, pm: 1, film: 1, views: ['terrace']},
    side:    {name: 'Side bedroom',   sp: 'SP-L0-BED2',    lv: 'lower',  bed: 1, pm: 1, film: 1, sky: 1},
    office:  {name: 'Skylit office',  sp: 'SP-L0-OFFICE',  lv: 'lower',  bed: 0, sky: 1},
    lounge:  {name: 'Bonus lounge',   sp: 'SP-L0-LOUNGE',  lv: 'lower',  bed: 0, out: 1, none: 1, tv: 1, views: ['terrace']},
    garage:  {name: 'Garage',         sp: 'SP-LG-GARAGE',  lv: 'garage', bed: 0, ev: 1}
  };
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
     People sleep in bedrooms. Things (kind 't') go in the four rooms that are not bedrooms. */
  const GUESTS = {
    hosts:   {name: 'Elena and Marcus', short: 'Elena & Marcus', pl: 1, kind: 'p', col: '#9b2c3c', ico: 'key',
      bio: 'It is their house. They are hosting, cooking, and quietly counting heads.', yay: 'Everyone has a bed, including us.'},
    rosa:    {name: 'Rosa and Luis', short: 'Rosa & Luis', pl: 1, kind: 'p', col: '#bf6a26', ico: 'cups',
      bio: 'Elena’s parents. They brought their own coffee pot, as always.', yay: 'No stairs between us and the coffee.'},
    mara:    {name: 'Mara', kind: 'p', col: '#3d5a98', ico: 'moon',
      bio: 'Marcus’s sister, a nurse on the night shift. She drove here straight from the hospital.', yay: 'Dark at noon. Good night, everyone.'},
    walt:    {name: 'Walt', kind: 'p', col: '#c98a12', ico: 'sun',
      bio: 'Marcus’s dad. Up at five, cheerful about it, and he snores like a leaf blower.', yay: 'Sun on the pillow by seven. Lovely.'},
    june:    {name: 'June', kind: 'p', col: '#b5546b', ico: 'brush',
      bio: 'Aunt June paints the sunset every evening and says it is never the same one twice.', yay: 'There is my sunset.'},
    iris:    {name: 'Iris', kind: 'p', col: '#5b4a9c', ico: 'star',
      bio: 'Elena’s cousin, an astronomy student who keeps astronomer’s hours.', yay: 'Stars, straight from the pillow.'},
    nico:    {name: 'Nico', kind: 'p', col: '#2f8f6b', ico: 'sticks',
      bio: 'He brought a full drum kit to a family weekend. Nobody is surprised.', yay: 'Fine. I will practise after breakfast.'},
    wren:    {name: 'Wren', kind: 'p', col: '#5f7f8c', ico: 'feather',
      bio: 'The lightest sleeper anyone has met. One footstep overhead and she is awake.', yay: 'Not a footstep. Thank you.'},
    pia:     {name: 'Pia', kind: 'p', col: '#b8408a', ico: 'prism',
      bio: 'Collects prisms, and anything else that throws a rainbow.', yay: 'Rainbows on the floor at six o’clock.'},
    dev:     {name: 'Dev', kind: 'p', col: '#3f7f9f', ico: 'laptop',
      bio: 'On call for work all weekend, laptop under one arm.', yay: 'Ten steps from the bed to the desk.'},
    drums:   {name: 'Nico’s drums', short: 'The drums', kind: 't', col: '#2f8f6b', ico: 'drum', bio: 'Loud, and getting louder.', yay: 'A distant, happy thumping.'},
    biscuit: {name: 'Biscuit', kind: 't', col: '#a8773a', ico: 'dog', bio: 'Rosa and Luis’s dog. He needs to go out, often and urgently.', yay: 'Biscuit is already outside.'},
    desk:    {name: 'Dev’s desk', short: 'Dev’s desk', kind: 't', col: '#3f7f9f', ico: 'desk', bio: 'Two monitors and a folding table. He will be on calls.', yay: 'On mute, mostly.'},
    scope:   {name: 'Iris’s telescope', short: 'The telescope', kind: 't', col: '#5b4a9c', ico: 'scope', bio: 'Four feet long, and it does not travel well.', yay: 'Pointed at the sky.'},
    car:     {name: 'June’s car', short: 'June’s car', kind: 't', col: '#b5546b', ico: 'car', bio: 'Electric, and nearly flat after the drive.', yay: 'Charging.'}
  };
  const isP = g => GUESTS[g].kind === 'p';
  const nm = g => GUESTS[g].name;
  const vb = (g, s, p) => GUESTS[g].pl ? p : s;   // verb agreement: vb('rosa', 'wants', 'want')

  /* ------------------------------------------------------------------ clues
     A clue is {k: kind, ...args, t: text}. test(clue, at, level, world) returns true (met), false (broken) or null (cannot say
     yet, because someone it speaks of has no room). needs(clue, at) lists the [room, note, has] facts the clue leans on now. */
  const lvOf = (s, world) => (world && world.garageLower && s === 'garage') ? 'lower' : SLOTS[s].lv;
  const wallsOf = world => (world && world.cornerSide) ? WALLS.concat(WALLS_UNSURE) : WALLS;
  const peopleOf = L => L.guests.filter(isP);
  // "nobody else ..." clues: broken as soon as one other sleeper breaks them, met only when every sleeper has a room
  const others = (c, at, L, bad) => { const s = at[c.who]; if(!s) return null; let open = false;
    for(const g of peopleOf(L)){ if(g === c.who) continue; const o = at[g]; if(!o){ open = true; continue; } if(bad(s, o)) return false; } return open ? null : true; };
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
    // a must not sleep directly over or under b
    apart: {who: c => [c.a, c.b], test(c, at){ const a = at[c.a], b = at[c.b]; return a && b ? !pairIn(OVER, a, b) : null; }},
    alone: {who: c => [c.who], all: 1, test(c, at, L, w){ return others(c, at, L, (s, o) => lvOf(o, w) === lvOf(s, w)); }},          // a level to themselves
    nohall: {who: c => [c.who], all: 1, test(c, at, L){ return others(c, at, L, (s, o) => pairIn(HALLS, s, o)); }},                  // a hallway to themselves
    nowall: {who: c => [c.who], all: 1, test(c, at, L, w){ return others(c, at, L, (s, o) => pairIn(wallsOf(w), s, o)); }},          // nobody through the wall
    noover: {who: c => [c.who], all: 1, test(c, at, L){ return others(c, at, L, (s, o) => OVER.some(p => p[0] === o && p[1] === s)); }},   // nobody overhead
    // a thing that must not share a level with anyone asleep
    quiet: {who: c => [c.who], all: 1, test(c, at, L, w){ const s = at[c.who]; if(!s) return null; let open = false;
      for(const g of peopleOf(L)){ const o = at[g]; if(!o){ open = true; continue; } if(lvOf(o, w) === lvOf(s, w)) return false; } return open ? null : true; }}
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
     must: asked every time that guest appears (it is who they are). may: asked on some days. The words are written once, here. */
  const ASK = {
    hosts: {may: [
      {k: 'attr', attr: 'own', t: 'Elena and Marcus want the one bathroom that nobody else walks into.'},
      {k: 'attr', attr: 'out', t: 'Elena and Marcus take their first coffee outside, straight from the bedroom.'}]},
    rosa: {must: [{k: 'level', lv: ['main'], t: 'Rosa and Luis would rather skip the stairs. Put them on the same level as the kitchen.'}], may: [
      {k: 'attr', attr: 'view:oak', t: 'Rosa wants to wake up looking at the old oak.'},
      {k: 'attr', attr: 'am', t: 'Luis likes the sun on the bed before breakfast.'}]},
    mara: {must: [{k: 'attr', attr: 'none', t: 'Mara works nights and sleeps all day. Her room must get no direct sun at any hour.'}]},
    walt: {must: [{k: 'attr', attr: 'am', t: 'Walt is up at five. He wants the morning sun in his room.'}], may: [
      {k: 'nohall', t: 'Walt snores. Nobody else should sleep on his hallway.'},
      {k: 'attr', attr: 'view:street', t: 'Walt likes to see who is coming up the front walk.'}]},
    june: {must: [{k: 'attr', attr: 'pm', t: 'June paints the sunset. She needs the evening sun in her room.'}], may: [
      {k: 'attr', attr: 'out', t: 'June wants to step straight outside from her room with her easel.'},
      {k: 'attr', attr: 'view:terrace', t: 'June wants to see the terrace from her window.'}]},
    iris: {must: [{k: 'attr', attr: 'sky', t: 'Iris wants to see the sky from her bed.'}], may: [
      {k: 'alone', t: 'Iris keeps astronomer’s hours. She wants a level to herself.'},
      {k: 'same', b: 'scope', t: 'Iris wants her bed on the same level as her telescope.'}]},
    nico: {may: [{k: 'diff', b: 'drums', t: 'Nico says he sleeps best on a different level from his drums.'},
      {k: 'attr', attr: 'sky', t: 'Nico wants a skylight over the bed.'}]},
    wren: {must: [{k: 'noover', t: 'Wren wakes at a footstep. Nobody may sleep in the room over hers.'}], may: [
      {k: 'nohall', t: 'Wren also wants a hallway with nobody else on it.'},
      {k: 'attr', attr: 'view:oak', t: 'Wren would like the old oak outside her window.'}]},
    pia: {must: [{k: 'attr', attr: 'film', t: 'Pia wants a room where the window throws rainbows on the floor.'}], may: [
      {k: 'attr', attr: 'view:terrace', t: 'Pia wants to see the outdoor kitchen from her window.'},
      {k: 'attr', attr: 'sky', t: 'Pia wants a skylight as well.'}]},
    dev: {must: [{k: 'same', b: 'desk', t: 'Dev wants his bed on the same level as his desk.'}], may: [
      {k: 'attr', attr: 'sky', t: 'Dev wants a skylight over the bed too.'}]},
    drums: {must: [{k: 'quiet', t: 'Nobody can sleep on the same level as the drums.'},
      {k: 'notin', slots: ['garage'], t: 'The drums stay in the house, not the garage. Nico wants an audience.'}]},
    biscuit: {must: [{k: 'attr', attr: 'out', t: 'Biscuit needs a door that opens straight onto the terrace.'}]},
    desk: {must: [{k: 'attr', attr: 'sky', t: 'Dev’s desk goes under a skylight. He wants daylight on his calls.'}]},
    scope: {must: [{k: 'level', lv: ['upper'], t: 'The telescope goes as high in the house as it can.'}]},
    car: {must: [{k: 'attr', attr: 'ev', t: 'June’s car needs the big charger.'}]}
  };
  const WITH = {drums: 'nico', desk: 'dev', scope: 'iris', car: 'june', biscuit: 'rosa'};   // a thing arrives with its person
  const mk = (g, a) => { const c = Object.assign({}, a); if('b' in c) c.a = g; else c.who = g; return c; };
  const REL = [
    {k: 'same', sym: 1, t: (a, b) => `${nm(a)} ${vb(a, 'wants', 'want')} to be on the same level as ${nm(b)}.`},
    {k: 'diff', sym: 1, t: (a, b) => `${nm(a)} and ${nm(b)} are better on different levels this time.`},
    {k: 'higher', t: (a, b) => `${nm(a)} ${vb(a, 'sleeps', 'sleep')} on a higher level than ${nm(b)}.`},
    {k: 'hall', sym: 1, t: (a, b) => `${nm(a)} ${vb(a, 'wants', 'want')} a door on the same hallway as ${nm(b)}.`},
    {k: 'hall', sym: 1, no: true, t: (a, b) => `${nm(a)} would rather not share a hallway with ${nm(b)}.`},
    {k: 'apart', sym: 1, t: (a, b) => `${nm(a)} must not sleep directly over or under ${nm(b)}.`}];

  /* ------------------------------------------------------------------ building a puzzle from a seed, proven by the same solver */
  function rng(seed){ let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const shuffle = (a, r) => { a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const countAll = L => WORLDS.reduce((n, w) => Math.max(n, solutions(L, w, 300).length), 0);
  function build(seed, opts){ opts = opts || {}; const PEOPLE = Object.keys(GUESTS).filter(isP), THINGS = Object.keys(GUESTS).filter(g => !isP(g));
    for(let attempt = 0; attempt < 300; attempt++){ const r = rng((seed * 9973 + attempt * 7919) >>> 0);
      let guests = opts.guests;
      if(!guests){ const np = r() < .45 ? 4 : 5, ps = shuffle(PEOPLE, r).slice(0, np), own = THINGS.filter(t => ps.indexOf(WITH[t]) >= 0);
        // a drummer brings his drums and Dev brings his desk; other things come along some days
        const ts = own.filter(t => t === 'drums' || t === 'desk').concat(shuffle(own.filter(t => t !== 'drums' && t !== 'desk'), r).slice(0, r() < .6 ? 1 : 0));
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
    {id: 'warm', title: 'Housewarming',
      story: 'Elena and Marcus have the keys at last. Her parents are coming for the first weekend, and so is her cousin Iris. Three beds to choose.',
      guests: ['hosts', 'rosa', 'iris'],
      clues: [
        {k: 'attr', who: 'hosts', attr: 'own', t: 'Elena and Marcus want the one bathroom that nobody else walks into.'},
        {k: 'level', who: 'rosa', lv: ['main'], t: 'Rosa and Luis would rather skip the stairs. Put them on the same level as the kitchen.'},
        {k: 'attr', who: 'rosa', attr: 'view:oak', t: 'Rosa wants to wake up looking at the old oak.'},
        {k: 'attr', who: 'iris', attr: 'sky', t: 'Iris wants to see the sky from her bed.'}],
      order: ['hosts', 'rosa', 'iris'],
      hints: {hosts: ['One bedroom has a bathroom all to itself. It is upstairs.', 'Go into the Primary suite and tap the gold ring by its bath.'],
        rosa: ['The kitchen is on the main level. So are three bedrooms.', 'Look out of the windows on the main level. One of them is full of oak.'],
        iris: ['Two bedrooms have skylights, and one of those is taken.', 'Go downstairs to the Side bedroom and look up.']},
      epi: 'Three beds made, and the coffee pot is already on.'},
    {id: 'sun', title: 'The longest day',
      story: 'Midsummer. Marcus’s family is here for the longest day of the year, and every one of them has a firm opinion about the sun. Elena and Marcus are camping on the terrace, so even their room is free.',
      guests: ['mara', 'walt', 'june', 'pia', 'car'],
      clues: [
        {k: 'attr', who: 'mara', attr: 'none', t: 'Mara works nights and sleeps all day. Her room must get no direct sun at any hour.'},
        {k: 'attr', who: 'walt', attr: 'am', t: 'Walt is up at five. He wants the morning sun in his room.'},
        {k: 'nohall', who: 'walt', t: 'Walt snores. Nobody else should sleep on his hallway.'},
        {k: 'attr', who: 'june', attr: 'pm', t: 'June paints the sunset. She needs the evening sun in her room.'},
        {k: 'attr', who: 'pia', attr: 'film', t: 'Pia wants a room where the window throws rainbows on the floor.'},
        {k: 'higher', a: 'june', b: 'pia', t: 'June sleeps on a higher level than Pia.'},
        {k: 'attr', who: 'pia', attr: 'sky', t: 'Pia wants a skylight as well.'},
        {k: 'attr', who: 'car', attr: 'ev', t: 'June’s car needs the big charger.'}],
      order: ['mara', 'walt', 'pia', 'june', 'car'],
      hints: {mara: ['Go into each bedroom and drag the sun across the day. One bedroom never gets any.', 'The old oak shades one room on the main level from morning to night.'],
        walt: ['Two bedrooms get the morning sun. One of them shares a hallway with Mara.', 'Walt needs the morning room that has no neighbour on its hallway.'],
        pia: ['Two windows downstairs wear rainbow film. Only one of those rooms has skylights too.', 'Look up in both lower bedrooms.'],
        june: ['Three bedrooms get the evening sun. June has to be above Pia.', 'There is only one bedroom higher than the lower level with evening sun.'],
        car: ['Only one room in the house has a charger for a car.', 'Have a look in the garage.']},
      epi: 'The sun went down at half past eight, and June got all of it.'},
    {id: 'drums', title: 'Nico brought his drums',
      story: 'Nobody asked him to. Rosa and Luis have Biscuit with them, Wren has not slept properly since Tuesday, and the drum kit is still in the entry.',
      guests: ['hosts', 'rosa', 'nico', 'wren', 'drums', 'biscuit'],
      clues: [
        {k: 'attr', who: 'biscuit', attr: 'out', t: 'Biscuit needs a door that opens straight onto the terrace.'},
        {k: 'quiet', who: 'drums', t: 'Nobody can sleep on the same level as the drums.'},
        {k: 'notin', who: 'drums', slots: ['garage'], t: 'The drums stay in the house, not the garage. Nico wants an audience.'},
        {k: 'attr', who: 'hosts', attr: 'own', t: 'Elena and Marcus want the one bathroom that nobody else walks into.'},
        {k: 'level', who: 'rosa', lv: ['main'], t: 'Rosa and Luis would rather skip the stairs. Put them on the same level as the kitchen.'},
        {k: 'nowall', who: 'wren', t: 'Wren wakes at anything. Nobody may sleep on the other side of one of her walls.'},
        {k: 'hall', a: 'rosa', b: 'wren', t: 'Rosa and Luis want a door on the same hallway as Wren.'}],
      order: ['biscuit', 'hosts', 'drums', 'wren', 'rosa', 'nico'],
      hints: {biscuit: ['One room that is not a bedroom has doors straight onto the terrace.', 'Go into the Bonus lounge and look at the glass doors.'],
        hosts: ['Same as ever: the bedroom with its own bath.', 'The Primary suite, upstairs.'],
        drums: ['The drums need a level where nobody sleeps. Elena and Marcus are upstairs, and the garage is out.', 'That leaves one room on the lower level, so nobody sleeps down there tonight.'],
        wren: ['If nobody sleeps downstairs, three guests share the main level. Which bedroom there has no bedroom through the wall?', 'Lift the upper level off and look at the main level from above. One bedroom stands apart from the other two.'],
        rosa: ['Two bedrooms on the main level open onto the same short hallway.', 'Wren has one of them. Rosa and Luis take the other.'],
        nico: ['One bed left on the main level.', 'The Front bedroom.']},
      epi: 'Nico played until nine. Wren slept through it. Nobody can explain this.'},
    {id: 'stars', title: 'Meteor shower',
      story: 'Iris has talked everyone into staying up for the meteors. Dev is on call, June has brought her easel, and Walt will be asleep by nine whatever happens.',
      guests: ['iris', 'dev', 'june', 'walt', 'wren', 'scope', 'desk'],
      clues: [
        {k: 'level', who: 'scope', lv: ['upper'], t: 'The telescope goes as high in the house as it can.'},
        {k: 'same', a: 'iris', b: 'scope', t: 'Iris wants her bed on the same level as her telescope.'},
        {k: 'attr', who: 'desk', attr: 'sky', t: 'Dev’s desk goes under a skylight. He wants daylight on his calls.'},
        {k: 'same', a: 'dev', b: 'desk', t: 'Dev wants his bed on the same level as his desk.'},
        {k: 'attr', who: 'june', attr: 'view:terrace', t: 'June wants to paint the terrace from her window this time.'},
        {k: 'noover', who: 'wren', t: 'Wren wakes at a footstep. Nobody may sleep in the room over hers.'},
        {k: 'attr', who: 'wren', attr: 'view:oak', t: 'Wren would like the old oak outside her window.'},
        {k: 'attr', who: 'walt', attr: 'am', t: 'Walt is up at five. He wants the morning sun in his room.'},
        {k: 'nohall', who: 'walt', t: 'Walt snores. Nobody else should sleep on his hallway.'}],
      order: ['scope', 'iris', 'desk', 'june', 'dev', 'wren', 'walt'],
      hints: {scope: ['Two rooms are on the upper level, and only one of them is not a bedroom.', 'The Loft, at the top of the stairs.'],
        iris: ['Iris sleeps on the telescope’s level.', 'There is one bedroom up there.'],
        desk: ['Which room that is not a bedroom has skylights?', 'It says so on the door: the Skylit office.'],
        june: ['Which bedroom has a window onto the terrace? Look out of the windows downstairs.', 'One lower bedroom looks straight at the outdoor kitchen.'],
        dev: ['Dev sleeps on his desk’s level, and June has one of the two bedrooms there.', 'The Side bedroom.'],
        wren: ['Iris is upstairs, so Wren cannot sleep under her. Which other bedroom looks at the oak?', 'The Garden bedroom, on the main level.'],
        walt: ['Two bedrooms get the morning sun. One shares Wren’s hallway.', 'The Front bedroom.']},
      epi: 'Forty-one meteors. Walt slept through every one.'},
    {id: 'full', title: 'Full house',
      story: 'Everyone said yes. Six bedrooms, six lots of luggage and one drum kit. Elena and Marcus have given up their own room and say it will be fine.',
      guests: ['hosts', 'rosa', 'walt', 'june', 'wren', 'nico', 'drums'],
      clues: [
        {k: 'noover', who: 'wren', t: 'Wren wakes at a footstep. Nobody may sleep in the room over hers.'},
        {k: 'nohall', who: 'wren', t: 'Wren also wants a hallway with nobody else on it.'},
        {k: 'attr', who: 'walt', attr: 'am', t: 'Walt is up at five. He wants the morning sun in his room.'},
        {k: 'nohall', who: 'walt', t: 'Walt snores. Nobody else should sleep on his hallway.'},
        {k: 'level', who: 'rosa', lv: ['main'], t: 'Rosa and Luis would rather skip the stairs. Put them on the same level as the kitchen.'},
        {k: 'attr', who: 'rosa', attr: 'am', t: 'Luis likes the sun on the bed before breakfast.'},
        {k: 'attr', who: 'june', attr: 'pm', t: 'June paints the sunset. She needs the evening sun in her room.'},
        {k: 'attr', who: 'june', attr: 'view:terrace', t: 'June wants to see the terrace from her window.'},
        {k: 'attr', who: 'hosts', attr: 'pm', t: 'Elena and Marcus only ask for the evening sun.'},
        {k: 'isin', who: 'drums', slots: ['garage'], t: 'Every level with a bedroom has somebody asleep on it, so the drums go out to the garage.'}],
      order: ['drums', 'walt', 'wren', 'rosa', 'june', 'hosts', 'nico'],
      hints: {drums: ['This one is spelled out for you.', 'The garage.'],
        walt: ['Every bed is taken tonight. Two bedrooms get the morning sun, and one of them shares a hallway.', 'Walt needs the morning room that opens off the dining room, not the bedroom hallway.'],
        wren: ['Every bed is taken, so somebody sleeps in the Primary suite. Wren cannot be under it, and she wants a hallway to herself.', 'Walt has the Front bedroom. Only one room is left that has nobody overhead and nobody on its hallway.'],
        rosa: ['Main level, with the morning sun, and Walt has one of those.', 'The Middle bedroom.'],
        june: ['Evening sun and a window onto the terrace.', 'The Corner bedroom, downstairs.'],
        hosts: ['Two beds left. Only one of them gets the evening sun.', 'The Side bedroom, under the skylights.'],
        nico: ['One bed left.', 'The Garden bedroom. He can hear the drums from there, just.']},
      epi: 'Six bedrooms, all full, and the drums in the one place nobody could object.'}
  ];

  return {SLOTS, SLOT_IDS, BEDS, SPARE, LEVEL_NAME, LEVEL_RANK, HALLS, WALLS, WALLS_UNSURE, OVER, GUESTS, KINDS, ASK, REL, WITH, LEVELS, WORLDS,
    has, noteOf, isP, nm, vb, isRel, test, needs, whoOf, solutions, prove, depth, spare, rng, build, daily, dayNumber};
});
