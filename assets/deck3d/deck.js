/* Deck the House with Snowball, in 3D. Played inside the walkable model of 118 Hillside Drive (the house as it is today).
   Loaded by tour/index.html only on ?deck=1; talks to the engine through window.HILLSIDE. Decorations are built by deck-props.js.
   Story: company is coming tonight and bringing their animals, and Snowball (an orange tabby) has collected a request from each one.
   The requests arrive as you decorate. Each is a small riddle about light, color, warmth, movement, smell or a box, and can be read
   off the finished house. Traditions (the tree, the menorah, the kinara, the diyas and rangoli, the lanterns, the wreaths) are the
   player's own choice: no guest asks for one and none of them can be wrong. At sunset you light it up, the animals arrive one at a
   time, and you can go back and fix what you missed. Then take a postcard from anywhere.
   No people appear, and it does not snow (Woodside does not get snow). */
(function(){
  'use strict';
  const H = window.HILLSIDE; if(!H || window.DECK3D) return;
  const THREE = H.THREE, V3 = THREE.Vector3, $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const ga = (n, p) => { try{ window.gtag && gtag('event', n, p || {}); }catch(e){} };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const store = {get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clone = o => JSON.parse(JSON.stringify(o));
  const el = (tag, attrs, html) => { const e = document.createElement(tag); for(const k in (attrs || {})) e.setAttribute(k, attrs[k]); if(html != null) e.innerHTML = html; return e; };

  /* ---------- state: the same fields and share codes as before, so old links open here ---------- */
  const DEFAULT = {name: '', trad: [], lights: 'warm', motion: 'twinkle', door: 'evergreen', win: ['candles'], hang: 'none', path: [], tree: 'fir', topper: 'star', room: [], oak: 'both', ter: ['bistro'], wear: 'none'};   // what a share link falls back to, field by field
  const FREE_START = {name: '', trad: [], lights: 'warm', motion: 'twinkle', door: 'none', win: ['candles'], hang: 'none', path: ['luminarias'], tree: 'none', topper: 'star', room: [], oak: 'both', ter: ['bistro'], wear: 'none'};   // "Just decorate" opens on plain lights; every tradition is left for the player to choose
  const STORY_START = {name: '', trad: [], lights: 'none', motion: 'twinkle', door: 'none', win: [], hang: 'none', path: [], tree: 'none', topper: 'star', room: [], oak: 'none', ter: [], wear: 'none'};
  let S = clone(STORY_START), MODE = 'story', PHASE = 'boot', shared = false, touched = new Set();

  /* ---------- the places you decorate from ----------
     pos/look: where you stand on a wide screen; posP/lookP on a tall one. fit: the corners of the thing being decorated; the view is
     turned (and widened if it has to be) until all of them sit in the part of the screen the panels leave free. cat: where Snowball sits. */
  const PLACES = [
    {id: 'street', label: 'Roofline', pos: [13, 2.6, 80], look: [0, 8, 20], posP: [10, 2.6, 84], lookP: [0, 8, 20], cat: [-1, 40], say: 'Start at the top. The roof is long, so choose carefully.', sections: ['lights'],
     fit: [[33.7, 7.9, 38.2], [18.4, 14.6, 38.2], [3.2, 7.9, 38.2], [-26.7, 5.5, 23.7], [-18, 10.9, 23.7], [-17.9, 18.6, -1.1], [-26.3, 13.4, -1.1]]},
    {id: 'door', label: 'Front door', pos: [-5.0, 4.6, 38], look: [-5.4, 2.0, 10], posP: [-5.2, 5.2, 44], lookP: [-5.4, 2.4, 10], cat: [-1.5, 13.4], say: 'The doors next. Everyone who arrives ends up standing right here.', sections: ['door', 'hang', 'path'],
     fit: [[-10.6, 8.4, 6.3], [3.9, 8.4, 6.3], [-10.6, -3.4, 24], [3.9, 3.3, 15.6], [-5, -3.4, 26]]},
    {id: 'windows', label: 'Windows', pos: [-8.5, 2.4, 40.5], look: [0, 3, 12], cat: [-4, 24], say: 'Now the windows. This is what the whole street sees.', sections: ['win'],
     fit: [[-10.5, 5.2, 4.7], [-10.5, 0, 4.7], [4.2, 5.8, 29.6], [4.2, .8, 29.6], [2.4, 5.2, 5.5]]},
    {id: 'living', label: 'Living room', inside: true, pos: [13, 5, 2.9], look: [4.8, 3.9, -3.9], cat: [10.7, -3.2], say: 'Inside now. This is where I spend most of my evenings.', sections: ['tree', 'room'],
     fit: [[-3.2, 7.6, -5.2], [-6.2, .1, -5.6], [9, 8.5, -6], [9.4, .1, 1.2], [2.5, .1, -3.3]],
     catP: [.6, -1.6], fitP: [[-3.2, 7.5, -5.2], [-5.8, .2, -5.4], [2.5, .2, -3.3], [7.2, 2.6, -.6], [3.05, 8.4, -8]]},   // a tall screen leaves a short band: the tree, the table, the box and the far beam
    {id: 'terrace', label: 'Terrace', pos: [27, 1.8, -38.5], look: [0, 3.4, -37.5], posP: [30, 2, -39], lookP: [0, 4.8, -37.5], cat: [9.5, -39.5], say: 'Out back. Dinner is on the terrace tonight.', sections: ['ter'],
     fit: [[-9.6, 5.4, -37.3], [8.3, 5, -27], [.7, -4.4, -25.6], [3.8, -4.4, -51.2], [-6, -1, -44]]},
    {id: 'oak', label: 'The oak', pos: [35, 2, -47], look: [8.3, 9, -27], posP: [39, 2, -52], lookP: [8.3, 9, -27], fitP: [[8.3, -4.4, -27], [8.3, 22, -29], [-4, 13, -29], [21, 13, -28]], cat: [14, -33], say: 'Last, the oak. It is the biggest thing here and it has never been decorated.', sections: ['oak', 'wear'],
     fit: [[8.3, -4.4, -27], [8.3, 26, -30], [-9, 15, -30], [26, 15, -28]]}];
  const EXTRA = [   // more places to stand once the house is lit
    {id: 'walk', label: 'Front walk', pos: [-1.5, 2.6, 49], look: [-2.5, 6.2, 14], posP: [-1.5, 2.8, 56], lookP: [-2.5, 7, 14], cat: [-3.4, 36.5]},
    {id: 'dining', label: 'Dining room', inside: true, pos: [16.2, 5, 30.5], look: [6, 4, 22.5], cat: [8.6, 26.4]},
    {id: 'tree', label: 'By the tree', inside: true, pos: [4.6, 4.6, .6], look: [-3.2, 3.6, -5.2], cat: [1.2, -2.6]},
    {id: 'table', label: 'Under the oak', pos: [10.5, .2, -45.5], look: [-2, -.6, -37], cat: [5.4, -41]},
    {id: 'corner', label: 'From the corner', pos: [-24, 2.6, 58], look: [-4, 6.5, 12], cat: [-13, 44]}];
  const placeOf = id => PLACES.find(p => p.id === id) || EXTRA.find(p => p.id === id);
  const theName = p => { const l = p.label.toLowerCase(); return /^the /.test(l) ? l : 'the ' + l; };
  let PLACE = PLACES[0];

  const SECT = {
    lights: {title: 'The roofline', help: 'One string along every edge of the roof. Pick the lights, then how they move.', type: 'single', key: 'lights', options: [
      {v: 'warm', b: 'Warm white', n: 'Classic big bulbs', say: 'Classic. The siding looks like it has been invited somewhere nice.'},
      {v: 'multi', b: 'Old-school color', n: 'Red, green, blue and gold', say: 'Five colors at once, and every one of them thinks it is the best.'},
      {v: 'icicle', b: 'Icicles', n: 'Cool white drips', say: 'Icicle lights in a town that never freezes. Optimistic.'},
      {v: 'hanukkah', b: 'Blue and white', n: 'Hanukkah colors', say: 'Blue and white. Calm, like a clear night with good manners.'},
      {v: 'kwanzaa', b: 'Red, black and green', n: 'Kwanzaa colors', say: 'Red, black and green. The roof is standing up a little straighter.'},
      {v: 'marigold', b: 'Marigold', n: 'Amber and gold fairy lights', say: 'Marigold. Very nearly my color. The roof has taste.'},
      {v: 'fairy', b: 'Fairy twinkle', n: 'Tiny warm white lights, lots of them', say: 'Hundreds of tiny lights. I will try to count them. I will lose count.'},
      {v: 'none', b: 'Leave the roof dark', n: 'Let everything else shine', say: 'A dark roof. Everything under it will have to work harder.'}],
      seg: {key: 'motion', label: 'How they move', when: s => s.lights !== 'none', opts: [['steady', 'Steady'], ['twinkle', 'Twinkle'], ['chase', 'Chase'], ['breathe', 'Slow fade']], say: {chase: 'Lights that run along the gutter. I will be watching these all night.', steady: 'Steady. Nobody gets startled. Especially me.', breathe: 'In and out, very slowly. Like a nap.', twinkle: 'A little twinkle. Tasteful.'}}},
    door: {title: 'On the front doors', help: 'However you celebrate. The iron-and-glass doors are the first thing anyone sees.', type: 'single', key: 'door', options: [
      {v: 'evergreen', b: 'Evergreen and red bow', n: 'Fir, berries, a big bow', say: 'Evergreen and a red bow. The doors look like they are expecting someone.'},
      {v: 'magnolia', b: 'Magnolia leaves', n: 'Glossy green, bronze undersides', say: 'Magnolia. Very Southern. Very shiny. I would like to bat at it.'},
      {v: 'eucalyptus', b: 'Eucalyptus and silver', n: 'Soft sage, a white ribbon', say: 'Eucalyptus smells like a spa. I do not go to spas. I could start.'},
      {v: 'citrus', b: 'Dried orange and cinnamon', n: 'Smells like a kitchen in December', say: 'Dried oranges. I will not eat them. Probably.'},
      {v: 'bluesilver', b: 'Blue and silver', n: 'Ornaments and a star', say: 'Blue and silver with a star on top. The doors look dressed for the occasion.'},
      {v: 'harvest', b: 'Harvest wreath', n: 'Wheat, corn and red berries', say: 'Wheat and corn for the harvest. Mice would be impressed. I am, too.'},
      {v: 'toran', b: 'Marigold toran', n: 'A garland across the doorway', say: 'Marigolds across the doorway. Everyone who walks in gets a welcome.'},
      {v: 'none', b: 'Just the doors', n: 'They are nice doors', say: 'The doors are nice on their own. I agree with the doors.'}]},
    hang: {title: 'Hanging from the porch', help: 'Something overhead on the way up the steps.', type: 'single', key: 'hang', options: [
      {v: 'star', b: 'Paper star lanterns', n: 'Akash kandil, glowing orange', say: 'Paper stars with a light inside. They spin a little in the wind. Mesmerizing.'},
      {v: 'red', b: 'Red lanterns', n: 'Round, gold trim, tassels', say: 'Red lanterns for luck. I will take all the luck I can get.'},
      {v: 'moravian', b: 'Moravian stars', n: 'White, many-pointed', say: 'Stars with that many points. Somebody was very patient.'},
      {v: 'none', b: 'Nothing hanging', n: 'Keep the porch clear', say: 'A clear porch. More room for me to sit on it.'}]},
    path: {title: 'Lighting the way in', help: 'Pick as many as you like.', type: 'multi', key: 'path', options: [
      {v: 'diyas', b: 'Diyas on the steps', n: 'Clay lamps, one at each end', say: 'Clay lamps on every step. I will walk around them very carefully, which is how I walk anyway.'},
      {v: 'luminarias', b: 'Luminarias', n: 'Paper bags along the walk', say: 'Glowing paper bags. I am told I may not sit in them.'},
      {v: 'garland', b: 'Garland on the railing', n: 'Evergreen and tiny lights', say: 'Garland on the railing. It smells like a forest I have never been allowed to visit.'},
      {v: 'rangoli', b: 'Rangoli', n: 'At the bottom of the steps', say: 'A rangoli at the steps. Beautiful. I will not walk on it. Promise.'}]},
    win: {title: 'In the windows', help: 'However you celebrate, this is what the street sees after dark. Pick as many as you like.', type: 'multi', key: 'win', options: [
      {v: 'candles', b: 'A candle in every window', n: 'Brass holders, one small flame each', say: 'A candle in every window. From the road the whole house looks awake.'},
      {v: 'menorah', b: 'The menorah', n: 'In the front window, facing the street', say: 'The menorah goes where the street can see it. That is the point.'},
      {v: 'kinara', b: 'The kinara', n: 'Seven candles in the dining room window', say: 'The kinara in the window. Three red, one black, three green, all in a row.'},
      {v: 'tree', b: 'A little tree by the door', n: 'Lit, where the street can see it', say: 'A tree you can see from the street. Cars will slow down.'}]},
    tree: {title: 'A tree by the glass doors', help: 'Under the beams, where you can see it from the sofa. Or no tree at all.', type: 'single', key: 'tree', options: [
      {v: 'fir', b: 'Noble fir', n: 'Colored lights, glass ornaments', say: 'A real tree, with ornaments at exactly my height. Thank you.'},
      {v: 'flocked', b: 'Flocked white', n: 'Warm white lights', say: 'A white tree. It will show every orange hair I leave on it. Challenge accepted.'},
      {v: 'pencil', b: 'Slim pencil tree', n: 'Gold lights, small footprint', say: 'Tall and narrow. Like me when I stretch.'},
      {v: 'olive', b: 'Potted olive', n: 'Fairy lights on silver leaves', say: 'An olive tree in lights. Very Woodside. Very climbable.'},
      {v: 'none', b: 'No tree this year', n: 'More room for everything else', say: 'No tree. I will find something else to climb. I always do.'}],
      seg: {key: 'topper', label: 'On top', when: s => s.tree !== 'none' && s.tree !== 'olive', opts: [['star', 'Gold star'], ['flake', 'White starburst'], ['none', 'Nothing']], say: {star: 'A gold star. I will not knock it off. Today.', flake: 'A white starburst. Pointy in six directions.', none: 'Nothing on top. The tree can speak for itself.'}}},
    room: {title: 'Around the room', help: 'However you celebrate: the coffee table, the beams and the floor by the doors. Pick as many as you like.', type: 'multi', key: 'room', options: [
      {v: 'menorah', b: 'Menorah on the table', n: 'All the candles lit', say: 'All nine lit. The helper candle is my favorite. It works the hardest.'},
      {v: 'kinara', b: 'Kinara on a mkeka', n: 'With the harvest on the mat', say: 'The kinara on its mat, with the harvest around it. I will guard the fruit.'},
      {v: 'beams', b: 'Garland on the beams', n: 'Evergreen swags with lights', say: 'Garland up on the beams. Out of reach. For now.'},
      {v: 'poinsettia', b: 'Poinsettias', n: 'Red, beside the sofa', say: 'Poinsettias. I have been told to keep my distance. Fine.'},
      {v: 'rangoli', b: 'Rangoli and diyas', n: 'On the floor by the doors', say: 'Colors on the floor and lamps all around. The doorway feels like a welcome.'},
      {v: 'box', b: 'A box for Snowball', n: 'Cardboard, empty, perfect', say: 'An empty box. Best present in the house, and it was free.'}]},
    ter: {title: 'The terrace', help: 'Dinner is out here tonight. Pick as many as you like.', type: 'multi', key: 'ter', options: [
      {v: 'bistro', b: 'Bistro lights', n: 'Strung from the oak, over the table', say: 'Big round bulbs over the table. Dinner looks better already.'},
      {v: 'luminarias', b: 'Luminarias', n: 'Along the edge of the pavers', say: 'A row of glowing bags around the terrace. Very welcoming. Still not allowed in them.'},
      {v: 'lanterns', b: 'Lanterns on the table', n: 'Candles in black iron', say: 'Candles on the table. I will stay off the table. Mostly.'},
      {v: 'smoker', b: 'Fire up the smoker', n: 'The ceramic smoker glowing', say: 'Whatever is in the smoker, I would like some of it.'}]},
    oak: {title: 'The heritage oak', help: 'It shades the whole terrace, and it has never been decorated.', type: 'single', key: 'oak', options: [
      {v: 'wrap', b: 'Wrap the trunk', n: 'Warm lights, spiraled up', say: 'Lights around the trunk. Like a scarf for a tree.'},
      {v: 'branches', b: 'Lights in the branches', n: 'Fairy lights in the canopy', say: 'Lights all the way up in the branches. Where the birds are. Interesting.'},
      {v: 'both', b: 'Both', n: 'Trunk and canopy', say: 'The whole oak, lit. You can probably see it from the hills.'},
      {v: 'none', b: 'Leave it natural', n: 'It has been fine for a long time', say: 'The oak is older than the house. Fair enough.'}]},
    wear: {title: 'One more thing', help: 'Snowball would like to be festive, within reason.', type: 'single', key: 'wear', options: [
      {v: 'none', b: 'Nothing, thanks', n: 'He is already a classic', say: 'I am already wearing orange. It goes with the season.'},
      {v: 'scarfRed', b: 'Red scarf', n: 'Striped, cozy', say: 'A red scarf. I look like I am about to go caroling. I am not.'},
      {v: 'scarfBlue', b: 'Blue and white scarf', n: 'Stripes, very soft', say: 'Blue and white. It sets off the orange. I checked.'},
      {v: 'scarfGreen', b: 'Green and gold scarf', n: 'Forest green, gold stripes', say: 'Green and gold. Orange goes with both. I am very easy to dress.'},
      {v: 'bell', b: 'A collar with a bell', n: 'Jingles when he walks', say: 'A bell. So everyone hears me coming. Fine.'}]}};

  /* ---------- the guests: animals, each with a wish that comes from its nature ----------
     A wish is one or more needs; each need belongs to one place, can be checked from the state, and has its own hint. No need looks at a
     tradition as such: a menorah, a kinara, a diya or a little tree counts only as what it plainly is (a light in a window, a lamp on a step). */
  const COLORED = ['multi', 'hanukkah', 'kwanzaa', 'marigold'], STILL = ['steady', 'breathe'], LOW = ['luminarias', 'diyas'];
  const GUESTS = [
    {id: 'pepper', name: 'Pepper', who: 'grey parrot', icon: '🦜', c: '#dfe4ea', place: 'street', msg: 'Color on the roof. Color on the roof. I am grey all over, so the roof will have to do it for both of us.',
     needs: [{place: 'street', ok: s => COLORED.includes(s.lights), hint: 'Pepper wants a roof string with real color in it. White and warm white do not count.'}],
     yes: 'Color on the roof. Color on the roof. Color on the roof.', no: 'No color up there. No color up there. I will be over here, being grey.'},
    {id: 'clover', name: 'Clover', who: 'rabbit, shy', icon: '🐇', c: '#e2eed6', place: 'windows', msg: 'I will wait under the hedge until I am sure. A light in a window tells me it is safe. A roof that flashes or runs about tells me it is not.',
     needs: [{place: 'street', ok: s => s.lights === 'none' || STILL.includes(s.motion), hint: 'Clover needs the roof lights to hold still. Steady is fine, and so is a slow fade.'},
       {place: 'windows', ok: s => s.win.length > 0, hint: 'Clover is waiting for a light in a window. Any one of these will do.'}],
     yes: 'A light in the window and a roof that holds still. I came all the way to the door.', no: 'I got as far as the hedge. It was a lot.'},
    {id: 'admiral', name: 'Admiral', who: 'goldfish, travels by bowl', icon: '🐟', c: '#d5e7f4', place: 'door', msg: 'I travel after sunset, for obvious reasons, and I travel by bowl. Whoever carries me up the walk has to see their feet. Put some light down low on the way in.',
     needs: [{place: 'door', ok: s => s.path.some(v => LOW.includes(v)), hint: 'Admiral needs light down low on the way in. Paper bags along the walk would do it. So would lamps on the steps.'}],
     yes: 'Light all the way up the walk. Not a drop spilled.', no: 'A dark walk. There was sloshing. I will say no more.'},
    {id: 'snowball', name: 'Snowball', who: 'orange tabby, lives here', icon: '🐈', c: '#f7dcbd', place: 'living', msg: 'I have asked for one thing. It is cardboard. It is empty.',
     needs: [{place: 'living', ok: s => s.room.includes('box'), hint: 'It is a box. I would like the box.'}],
     yes: 'The box is acceptable.', no: 'No box. I see how it is.'},
    {id: 'biscuit', name: 'Biscuit', who: 'old golden dog', icon: '🐕', c: '#f4e3b6', place: 'terrace', msg: 'I do not do stairs any more, so I will come around the side to the terrace. I find my way by nose. Please give my nose something to find.',
     needs: [{place: 'terrace', ok: s => s.ter.includes('smoker'), hint: 'Biscuit follows his nose. Only one thing on the terrace smells like dinner.'}],
     yes: 'I smelled the smoker from the road and followed it all the way round. Good terrace.', no: 'I came round to the terrace and sniffed. Nothing cooking. I will lie down here anyway.'},
    {id: 'mabel', name: 'Mabel', who: 'tortoise', icon: '🐢', c: '#dce8cd', place: 'terrace', msg: 'By the time I have crossed the terrace it will be dark. Lights overhead are no use to me. I never look up. Something warm along the edge of the paving, please, down at my height.',
     needs: [{place: 'terrace', ok: s => s.ter.includes('luminarias'), hint: 'Mabel lives a few inches off the ground. She wants a warm glow along the edge of the pavers.'}],
     yes: 'Warm light all along the pavers, right at my height. I may stay a while.', no: 'The paving was dark, so I stopped where I was. I am still there.'},
    {id: 'nugget', name: 'Nugget', who: 'hamster, up all night', icon: '🐹', c: '#f1dfcf', place: 'oak', msg: 'I sleep all day, so I only ever see this house in the dark. If the big oak out back is just a shadow again, I am going straight back to bed.',
     needs: [{place: 'oak', ok: s => s.oak !== 'none', hint: 'Nugget wants lights on the oak. Somewhere on it, at least.'}],
     yes: 'The oak is lit. I ran four miles on my wheel to celebrate.', no: 'The oak was dark. I could not tell it from the sky. Back to bed.'},
    {id: 'juniper', name: 'Juniper', who: 'bantam hen, roosts in the oak', icon: '🐔', c: '#f0d9d2', place: 'oak', msg: 'I go to bed when the sun does, on my branch in the oak. Decorate what you like, but keep the lights out of my branches. A hen needs her dark.',
     needs: [{place: 'oak', ok: s => s.oak === 'wrap' || s.oak === 'none', hint: 'Juniper sleeps up in the branches and wants them dark. The trunk is not the branches.'}],
     yes: 'Not one bulb in my branches. I slept beautifully.', no: 'There are lights in my bedroom. I will be up all night, and I will be telling everyone.'}];
  GUESTS.forEach(g => { g.ok = s => g.needs.every(n => n.ok(s)); });
  const guest = id => GUESTS.find(g => g.id === id);
  const WAVES = [['pepper', 'clover'], ['admiral'], ['snowball'], ['biscuit', 'mabel'], ['nugget'], ['juniper']];   // who writes as you reach each new place
  const ARRIVE = ['pepper', 'admiral', 'clover', 'snowball', 'biscuit', 'mabel', 'nugget', 'juniper'];
  const happy = () => GUESTS.filter(g => g.ok(S));
  const openNeeds = () => { const o = []; ARRIVE.map(guest).forEach(g => { if(arrived.includes(g.id)) g.needs.forEach(n => { if(!n.ok(S)) o.push({g, n}); }); }); return o; };
  let arrived = [], unread = 0, visited = new Set(), lastScore = null;

  /* ---------- share links (format "d"; APPEND ONLY) ----------
     Thirteen base-36 digits hold every choice as one mixed-radix number: each field has a fixed size (cap) and a list of options whose
     order is its code. New options go on the end of a list and never past its cap; new fields go on the end of LINK. Two fields are
     retired: the picture version had a weather field and a yard field. Their slots stay so every
     old link still decodes; whatever they held is dropped, and new links always write 0 there. */
  const LINK = [
    ['lights', 16, ['warm', 'multi', 'icicle', 'hanukkah', 'kwanzaa', 'marigold', 'fairy', 'none']], ['motion', 8, ['steady', 'twinkle', 'chase', 'breathe']],
    ['door', 16, ['evergreen', 'magnolia', 'eucalyptus', 'citrus', 'bluesilver', 'harvest', 'toran', 'none']], ['hang', 8, ['star', 'red', 'moravian', 'none']],
    ['tree', 8, ['fir', 'flocked', 'pencil', 'olive', 'none']], ['topper', 6, ['star', 'flake', 'none']], ['oak', 8, ['wrap', 'branches', 'both', 'none']],
    [null, 6], [null, 6], ['wear', 10, ['none', 'scarfRed', 'scarfBlue', 'scarfGreen', 'bell']],
    ['win', 64, ['candles', 'menorah', 'kinara', 'tree']], ['path', 64, ['diyas', 'luminarias', 'garland', 'rangoli']], ['room', 256, ['menorah', 'kinara', 'beams', 'poinsettia', 'rangoli', 'box']],
    ['ter', 64, ['bistro', 'luminarias', 'lanterns', 'smoker']], ['trad', 512, ['christmas', 'hanukkah', 'kwanzaa', 'diwali', 'solstice', 'lunar', 'lights']]];
  const KEYS = ['lights', 'motion', 'door', 'win', 'hang', 'path', 'tree', 'topper', 'room', 'oak', 'ter', 'wear', 'trad', 'name'];
  const LINK_VER = 'd', LINK_LEN = 13, B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  function nameToLink(n){ return String(n == null ? '' : n).replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}' -]/gu, '').replace(/ +/g, ' ').trim().slice(0, 32).trim().replace(/-/g, '_').replace(/ /g, '-'); }
  function nameFromLink(t){ return String(t == null ? '' : t).replace(/[^\p{L}\p{N}'_-]/gu, '').replace(/-+/g, ' ').replace(/_/g, '-').trim().slice(0, 32).trim(); }
  function encode(s){ s = s || S; const d = new Array(LINK_LEN).fill(0);
    LINK.forEach(([k, cap, opts]) => { let v = 0;
      if(!k) v = 0;
      else if(Array.isArray(DEFAULT[k])) (Array.isArray(s[k]) ? s[k] : []).forEach(x => { const i = opts.indexOf(x); if(i >= 0) v |= 1 << i; });
      else { v = opts.indexOf(s[k]); if(v < 0) v = opts.indexOf(DEFAULT[k]); }
      for(let i = LINK_LEN - 1; i >= 0; i--){ const t = d[i] * cap + v; d[i] = t % 36; v = Math.floor(t / 36); } });
    const nm = nameToLink(s.name); return LINK_VER + d.map(x => B36[x]).join('') + (nm ? '~' + nm : ''); }
  function decodeShort(c){ const m = /^d([0-9a-z]{13})(?![0-9a-z])(?:~([^&?#\/]*))?/i.exec(String(c)); if(!m) return null;
    const d = m[1].toLowerCase().split('').map(ch => B36.indexOf(ch)), n = clone(DEFAULT);
    for(let f = LINK.length - 1; f >= 0; f--){ const [k, cap, opts] = LINK[f]; let r = 0;
      for(let i = 0; i < LINK_LEN; i++){ const t = r * 36 + d[i]; d[i] = Math.floor(t / cap); r = t % cap; }
      if(!k) continue;   // a retired field: read past it
      if(Array.isArray(n[k])) n[k] = opts.filter((o, i) => r & (1 << i)); else if(r < opts.length) n[k] = opts[r]; }
    if(d.some(x => x)) return null; n.name = m[2] ? nameFromLink(m[2]) : ''; return n; }
  function decodeOld(h){ try{ const o = JSON.parse(decodeURIComponent(escape(atob(h.replace(/-/g, '+').replace(/_/g, '/'))))); const n = clone(DEFAULT); KEYS.forEach(k => { if(o[k] != null && typeof o[k] === typeof n[k]) n[k] = Array.isArray(n[k]) ? o[k].filter(v => typeof v === 'string').slice(0, 12) : typeof n[k] === 'string' ? String(o[k]).slice(0, 32) : o[k]; }); return n; }catch(e){ return null; } }
  function decode(h){ try{ h = String(h == null ? '' : h).replace(/^#/, ''); try{ h = decodeURIComponent(h); }catch(e){} const old = /^h=([A-Za-z0-9_-]+)/.exec(h); return old ? decodeOld(old[1]) : decodeShort(h); }catch(e){ return null; } }
  function shareLink(s){ const c = encode(s), i = c.indexOf('~'); return 'https://118hillside.com/games/deck/#' + (i < 0 ? c : c.slice(0, i) + '~' + encodeURIComponent(c.slice(i + 1))); }

  /* ---------- sound: assets/deck3d/deck-sfx.js (soft bells and mallets in one key; off with the speaker button) ---------- */
  let sound = store.get('deck.snd') !== '0';
  const sfx = function(){ const X = window.DECKSFX; if(X) try{ X.play.apply(null, arguments); }catch(e){} };
  function ambience(){ const X = window.DECKSFX; if(!X) return; try{ X.ambient(/dusk|lighting|arrive|result|photo|fix|shared/.test(PHASE) ? .5 : 0); }catch(e){} }
  const SOUND_OF = {lights: 0, door: 1, hang: 2, path: 3, win: 4, tree: 0, room: 2, oak: 1, ter: 3, wear: 5};

  /* ---------- the camera: the game puts you somewhere; you may look around, but you do not wander off ----------
     Each place lists the corners of what is being decorated there (fit). The view is turned, and widened when it has to be, until those
     corners and Snowball all sit inside the part of the screen that no panel covers, at any window size. */
  let P = null, FLY = null, anchor = null, veil = null, ZOOM = 1, CUT = 0, INSIDE = false;
  const portrait = () => innerWidth < innerHeight * .8, UP = new V3(0, 1, 0);
  function baseZoom(){ const cam = H.camera, t0 = Math.tan(cam.fov * Math.PI / 360); return cam.aspect < .8 ? Math.min(1, Math.max(t0 / Math.tan(40 * Math.PI / 180), t0 * cam.aspect / Math.tan(22 * Math.PI / 180))) : 1; }
  /* the free part of the canvas, in canvas pixels: below Snowball's line (and the message that drops over it), beside or above the panel, above any bar at the bottom */
  function freeRect(){ const c = H.canvas.getBoundingClientRect(), wide = innerWidth > 700, box = s => { const e = $(s); if(!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
    let x0 = 14, x1 = c.width - 14, y0 = 14, y1 = c.height - 14; const top = box('#dkTop'), pn = box('#dkPanel'), cd = box('#dkCard.side .c');
    if(top) y0 = top.top - c.top + (MODE === 'story' && PHASE === 'decor' ? (wide ? 180 : 164) : (wide ? 84 : 104));   // Snowball's line, or the tallest message that drops over it
    if(pn){ if(wide) x1 = pn.left - c.left - 14; else y1 = pn.top - c.top - 10; }
    if(cd){ if(wide) x1 = Math.min(x1, cd.left - c.left - 14); else y1 = Math.min(y1, cd.top - c.top - 10); }
    ['#dkPhoto', '#dkArrive', '#dkDusk'].forEach(s => { const r = box(s); if(r) y1 = Math.min(y1, r.top - c.top - 10); });
    if(y1 - y0 < 150){ const m = (y0 + y1) / 2; y0 = Math.max(14, m - 75); y1 = y0 + 150; } if(x1 - x0 < 200) x1 = x0 + 200;
    return [x0, y0, x1, y1, c.width, c.height]; }
  function fit(pos, look, pts){ const cam = H.camera, tv = Math.tan(cam.fov * Math.PI / 360), th = tv * cam.aspect, R = freeRect(), zb = baseZoom(), zmin = Math.min(zb, Math.max(.5, tv / 1.48, th / 1.54)), zmax = zb * 1.5;   // widen up to a 112 degree view; close in a little when the thing is small on the screen
    const pm = cam.projectionMatrix.elements, ox = pm[8] || 0, oy = pm[9] || 0;   // the engine shifts the lens on a tall screen (the horizon sits below the middle)
    const fx0 = R[0] / R[4] * 2 - 1 + ox, fx1 = R[2] / R[4] * 2 - 1 + ox, fy1 = 1 - R[1] / R[5] * 2 + oy, fy0 = 1 - R[3] / R[5] * 2 + oy, P0 = new V3(...pos), f = new V3(...look).sub(P0).normalize(), r = new V3(), u = new V3(), d = new V3(); let z = zb;
    for(let it = 0; it < 16; it++){ r.crossVectors(f, UP).normalize(); u.crossVectors(r, f); let ax0 = 1e9, ax1 = -1e9, ay0 = 1e9, ay1 = -1e9;
      for(const q of pts){ d.set(q[0], q[1], q[2]).sub(P0); const dz = Math.max(.5, d.dot(f)), tx = d.dot(r) / dz, ty = d.dot(u) / dz; ax0 = Math.min(ax0, tx); ax1 = Math.max(ax1, tx); ay0 = Math.min(ay0, ty); ay1 = Math.max(ay1, ty); }
      z = Math.max(zmin, Math.min(zmax, .95 * (fx1 - fx0) * th / Math.max(1e-3, ax1 - ax0), .95 * (fy1 - fy0) * tv / Math.max(1e-3, ay1 - ay0)));
      const dx = (ax0 + ax1) / 2 - (fx0 + fx1) / 2 * th / z, dy = (ay0 + ay1) / 2 - (fy0 + fy1) / 2 * tv / z;
      f.addScaledVector(r, dx).addScaledVector(u, dy).normalize(); if(Math.abs(dx) + Math.abs(dy) < 1e-4) break; }
    return {pos, look: P0.clone().addScaledVector(f, 30).toArray(), zoom: z}; }
  const stand = p => portrait() && p.posP ? [p.posP, p.lookP || p.look] : [p.pos, p.look];
  function catAt(p){ if(!P || !p.cat) return null; if(p.id === 'living' && S.room.includes('box')) return [P.BOX_AT[0], P.BOX_AT[1] + .12, P.BOX_AT[2]];
    const c = portrait() && p.catP ? p.catP : p.cat, k = c === p.cat ? 'catY' : 'catYP'; if(p[k] == null) p[k] = P.floorY(c[0], c[1], stand(p)[0][1] + 1.5, p.inside ? 0 : -3.5); return [c[0], p[k] + .02, c[1]]; }
  function view(p){ const [pos, look] = stand(p); if(!p.fit) return {pos, look, zoom: baseZoom()}; const c = catAt(p), pts = portrait() && p.fitP ? p.fitP : p.fit; return fit(pos, look, c ? pts.concat([c, [c[0], c[1] + 1.9, c[2]]]) : pts); }
  function setCam(v){ H.look(v.pos, v.look); anchor = new V3(...v.pos); FLY = null; ZOOM = v.zoom; }
  function cut(p, then){ if(reduce){ setCam(view(p)); then && then(); return; } CUT++; veil.classList.add('on'); setTimeout(() => { CUT--; setCam(view(p)); then && then(); setTimeout(() => veil.classList.remove('on'), 120); }, 260); }
  function fly(v, dur, then){ const c = H.camera, d = new V3(); c.getWorldDirection(d); H.anim = null; FLY = {t0: performance.now(), dur: (reduce ? .01 : (dur || 1.5)) * 1000, p0: c.position.clone(), p1: new V3(...v.pos), l0: c.position.clone().addScaledVector(d, 30), l1: new V3(...v.look), z0: c.zoom, z1: v.zoom, then}; }
  function moveTo(p, then){ const v = view(p), far = H.camera.position.distanceTo(new V3(...v.pos)) > 46, land = () => { afterMove(p); then && then(); };
    if(far || p.inside || INSIDE) cut(p, land); else { fly(v, 1.5, null); land(); } }
  function afterMove(p){ INSIDE = !!p.inside; P.apply(dressed(), {inside: INSIDE}); placeCat(p); }
  /* The yard trees arrive a moment after the house. The props measure the heritage oak once, the first time anything hangs on it, so nothing is hung on it
     (or strung from it) until it is there; then the house is dressed again. */
  let OAK_IN = false; const oakT0 = performance.now();
  const oakIn = () => { if(OAK_IN) return true; let ok = false; try{ H.scene.traverse(o => { if(o.name === 'tree:OAK-BACK' && o.children.some(c => c.name === 'bark')) ok = true; }); }catch(e){} if(ok || performance.now() - oakT0 > 45000) OAK_IN = true; return OAK_IN; };
  const dressed = () => Object.assign({menorahLit: 9}, S, oakIn() ? null : {oak: 'none', ter: []});   // every candle of the window menorah is lit: the game has no story about which night it is
  function oakWatch(){ if(oakIn()){ if(P && PHASE !== 'boot') try{ P.apply(dressed(), {inside: INSIDE}); if(PLACE && PHASE !== 'start') reframe(.4); }catch(e){} return; } setTimeout(oakWatch, 500); }
  /* the panels changed (a card opened, the choices were folded away, the window was resized): frame the same place for the room there is now */
  function reframe(dur){ if(CUT || PHASE === 'boot' || !P || !PLACE) return; const v = view(PLACE); if(FLY){ FLY.l1.set(...v.look); FLY.z1 = v.zoom; return; } fly(v, dur || .6, null); }
  const _l = new V3();
  function frame(){ requestAnimationFrame(frame); const now = performance.now();
    try{ const cam = H.camera; if(window.NAVL) window.NAVL.dirty = false;   // keep the tilt the player chose (the tour levels the view after a drag)
      if(PHASE !== 'boot'){ let z = ZOOM;
        if(FLY){ const k = Math.min(1, (now - FLY.t0) / FLY.dur), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; _l.lerpVectors(FLY.l0, FLY.l1, e); const q = FLY.p0.clone().lerp(FLY.p1, e); H.look(q.toArray(), _l.toArray()); z = FLY.z0 + (FLY.z1 - FLY.z0) * e; if(k >= 1){ anchor = FLY.p1.clone(); ZOOM = FLY.z1; const t = FLY.then; FLY = null; t && t(); } }
        else if(H.anim){ /* the engine is flying (first frame only) */ } else if(anchor && H.camera.position.distanceTo(anchor) > .25) H.camera.position.copy(anchor);
        if(Math.abs(cam.zoom - z) > .002){ cam.zoom = z; cam.updateProjectionMatrix(); } }
      if(P) P.tick(now / 1000, H.tod); }catch(e){ if(!frame.warned){ frame.warned = true; console.warn('[deck3d] frame', e); } } }
  H.hooks.click = () => true;   // every tap on the house is ours: nobody walks into the furniture mid-game
  let rsT = 0; addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => reframe(.4), 180); });

  /* ---------- the engine's light, tuned for this game ---------- */
  function tuneLight(){
    /* indoors by day the tour exposes for a bright, airy room; with white walls and white sofas that reads as blown out behind small decorations, so aim a little lower here */
    try{ const L = window.__light; if(L && L.meter && L.meter.tin > .5) L.meter.tin = .47; }catch(e){}
    /* the tour's exposure meter reads a 16 by 16 thumbnail back through one pixel-pack buffer, and Chrome logs a performance warning every time that buffer is
       reused, until it stops reporting for the context. Giving the buffer a fresh store before each read avoids it; the reading itself is unchanged. */
    try{ const gl = H.renderer.getContext(); if(gl && gl.PIXEL_PACK_BUFFER && gl.fenceSync && !gl.__dkRead){ gl.__dkRead = 1; const rp = gl.readPixels;
        gl.readPixels = function(){ if(typeof arguments[6] === 'number'){ try{ const n = this.getBufferParameter(this.PIXEL_PACK_BUFFER, this.BUFFER_SIZE); if(n > 0 && n <= 65536) this.bufferData(this.PIXEL_PACK_BUFFER, n, this.STREAM_READ); }catch(e){} } return rp.apply(this, arguments); }; } }catch(e){} }

  /* ---------- Snowball in the scene ---------- */
  function placeCat(p){ if(!P) return; P.setCat(catAt(p), S.wear, p.id === 'living' && S.room.includes('box')); }

  /* ---------- UI ---------- */
  const css = `
  html.dk #mini, html.dk #cv27, html.dk header.bar nav.tabs, html.dk header.bar .plate, html.dk #aboutBtn, html.dk #card, html.dk #labels, html.dk #wplabels, html.dk #ovtag, html.dk #tod, html.dk #viewBtn, html.dk #hwBtn, html.dk #tgBtn, html.dk #phMore, html.dk .g28pill, html.dk #navHelp, html.dk #hint, html.dk #wptip, html.dk #pad, html.dk #fsBtn, html.dk #peek27{display:none!important}
  .dk{font-family:Jost,"Avenir Next","Helvetica Neue",Arial,sans-serif;color:#1f2a3a;-webkit-font-smoothing:antialiased}
  .dk *{box-sizing:border-box}.dk [hidden]{display:none!important}
  .dk button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .dkChip{background:rgba(251,250,247,.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:18px;box-shadow:0 8px 30px rgba(15,20,35,.22)}
  #dkVeil{position:fixed;inset:0;z-index:50;background:#0d1220;opacity:0;pointer-events:none;transition:opacity .25s}#dkVeil.on{opacity:1}
  #dkTop{position:fixed;left:12px;right:12px;top:40px;z-index:60;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;pointer-events:none}
  #dkSay{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;padding:8px 14px 8px 8px;max-width:min(430px,calc(100% - 120px));border:0;text-align:left}
  #dkSay .av{width:50px;height:50px;border-radius:50%;background:radial-gradient(circle at 50% 35%,#34416b,#1a2340);overflow:hidden;display:grid;place-items:end center;flex:none}
  #dkSay .av svg{width:48px;height:auto;margin-bottom:-4px}
  #dkSay p{margin:0;font:21px/1.18 "Caveat Brush","Marker Felt",cursive;color:#2b2336;align-self:center}
  #dkSay small{display:block;font:500 12.5px Jost,sans-serif;color:#9b2c3c;margin-top:3px}
  #dkSide{pointer-events:auto;display:flex;gap:8px;align-items:center}
  #dkSide button{border:0;height:46px;min-width:46px;padding:0 14px;display:flex;align-items:center;gap:8px;font-weight:500;font-size:15px;position:relative}
  #dkSide button svg{width:22px;height:22px;flex:none}
  #dkMsgBtn .n{position:absolute;right:-4px;top:-6px;min-width:22px;height:22px;border-radius:11px;background:#9b2c3c;color:#fff;font-size:13px;display:grid;place-items:center;padding:0 6px}
  #dkMsgBtn.new{animation:dkPop .5s}@keyframes dkPop{40%{transform:scale(1.12)}}
  #dkPanel{position:fixed;z-index:62;right:14px;top:100px;width:clamp(316px,31vw,372px);max-height:calc(100% - 114px);display:flex;flex-direction:column;overflow:hidden}
  #dkPlaces{display:flex;flex-wrap:wrap;gap:6px;padding:10px 10px 8px;overflow-x:auto;scrollbar-width:none;flex:none}#dkPlaces::-webkit-scrollbar{display:none}
  #dkPlaces button{flex:none;border:1px solid #d9d4c7;background:#fff;border-radius:999px;padding:8px 13px;font-size:14.5px;white-space:nowrap;position:relative}
  #dkPlaces button[aria-pressed=true]{background:#1f2948;border-color:#1f2948;color:#fff}
  #dkPlaces button.done::after{content:"";position:absolute;right:5px;top:4px;width:7px;height:7px;border-radius:50%;background:#e0862a}
  #dkBody{overflow:auto;padding:2px 14px 10px;flex:1 1 auto;overscroll-behavior:contain}
  #dkBody h3{font-family:"Cormorant Garamond",Georgia,serif;font-size:25px;font-weight:600;line-height:1.05;margin:8px 0 2px}
  #dkBody .help{font-size:14px;line-height:1.35;color:#5c6575;margin:0 0 8px}
  #dkBody .opts{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:0 0 6px}
  #dkBody .opt{border:1.5px solid #dcd7ca;background:#fff;border-radius:13px;padding:9px 10px;text-align:left;min-height:54px;line-height:1.15;position:relative;transition:border-color .15s,background .15s}
  #dkBody .opt b{display:block;font-weight:500;font-size:15px}#dkBody .opt small{display:block;font-size:12.5px;color:#6a7282;margin-top:2px}
  #dkBody .opt[aria-pressed=true]{border-color:#9b2c3c;background:#fbf1ee;box-shadow:inset 0 0 0 1px #9b2c3c}
  #dkBody .opt[aria-pressed=true]::after{content:"";position:absolute;right:8px;top:8px;width:9px;height:9px;border-radius:50%;background:#9b2c3c}
  #dkBody .seg{margin:4px 0 10px}#dkBody .seg span{display:block;font-size:13px;color:#5c6575;margin-bottom:4px}
  #dkBody .seg div{display:flex;gap:5px;flex-wrap:wrap}
  #dkBody .seg button{border:1.5px solid #dcd7ca;background:#fff;border-radius:999px;padding:8px 14px;font-size:14.5px;min-height:40px}
  #dkBody .seg button[aria-pressed=true]{border-color:#1f2948;background:#1f2948;color:#fff}
  #dkFoot{display:flex;gap:8px;padding:8px 10px 10px;border-top:1px solid #e6e2d7;flex:none;align-items:center}
  #dkFoot .grow{flex:1}
  .dkBtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid #cfcabe;background:#fff;color:#1f2a3a;border-radius:999px;padding:11px 18px;font-size:15.5px;text-decoration:none;min-height:46px;line-height:1.1}
  .dkBtn.primary{background:#9b2c3c;border-color:#9b2c3c;color:#fff;font-weight:500}.dkBtn.dark{background:#1f2948;border-color:#1f2948;color:#fff}
  .dkBtn.gold{background:#e8b84a;border-color:#e8b84a;color:#2a1d07;font-weight:500}
  .dkBtn.big{font-size:19px;padding:15px 30px;min-height:56px}
  .dkBtn:active{transform:scale(.97)}.dkBtn[disabled]{opacity:.55}
  #dkFold{display:none}
  #dkToast{position:fixed;left:50%;top:112px;transform:translate(-50%,-10px);z-index:90;background:#1f2948;color:#fff;font-weight:500;font-size:15px;padding:10px 18px;border-radius:999px;opacity:0;transition:.3s;pointer-events:none;max-width:calc(100% - 40px);text-align:center}
  #dkToast.on{opacity:1;transform:translate(-50%,0)}
  .dkMsg{display:flex;gap:10px;align-items:flex-start}
  .dkMsg .av{flex:none;width:40px;height:40px;border-radius:50%;font-size:22px;line-height:1;display:grid;place-items:center}
  .dkMsg b{font-weight:500;font-size:15.5px}.dkMsg small{color:#6a7282;font-size:12.5px;margin-left:6px}
  .dkMsg p{margin:3px 0 0;font-size:15.5px;line-height:1.35;background:#eef0f4;border-radius:4px 14px 14px 14px;padding:8px 11px}
  #dkNew{position:fixed;z-index:64;left:12px;top:40px;width:min(430px,calc(100% - 24px));padding:12px 14px;border:0;text-align:left;transform:translateY(-12px);opacity:0;pointer-events:none;transition:.35s}
  #dkNew.on{transform:none;opacity:1;pointer-events:auto}
  #dkNew .k{font-size:12.5px;color:#9b2c3c;font-weight:500;margin:0 0 6px;display:block}
  #dkDrawer{position:fixed;z-index:75;inset:0;background:rgba(14,19,34,.45);display:grid;justify-items:end}
  #dkDrawer .d{background:#fbfaf7;width:min(430px,100%);height:100%;overflow:auto;padding:70px 16px 20px;box-shadow:-20px 0 60px rgba(0,0,0,.3)}
  #dkDrawer h3{font-family:"Cormorant Garamond",Georgia,serif;font-size:28px;font-weight:600;margin:0 0 4px}
  #dkDrawer .sub{font-size:14px;color:#5c6575;margin:0 0 14px}
  #dkDrawer .dkMsg{margin:0 0 14px}
  #dkDrawer .x{position:fixed;right:14px;top:14px;z-index:2}
  #dkCard{position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(14,19,34,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:14px}
  #dkCard.clear{background:rgba(14,19,34,.18);backdrop-filter:none;-webkit-backdrop-filter:none;place-items:end center}
  #dkCard.side{background:none;backdrop-filter:none;-webkit-backdrop-filter:none;place-items:center end;pointer-events:none;padding-right:18px}#dkCard.side .c{pointer-events:auto;max-width:410px}
  #dkCard .c{background:#fbfaf7;border-radius:24px;max-width:540px;width:100%;padding:22px 22px 18px;box-shadow:0 30px 90px rgba(0,0,0,.45);max-height:calc(100% - 28px);overflow:auto;text-align:center}
  #dkCard .cat{width:120px;margin:-4px auto 0}#dkCard .cat svg{width:100%;height:auto;display:block}
  #dkCard h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:clamp(31px,6vw,42px);font-weight:600;line-height:1;margin:4px 0 8px}
  #dkCard p{font-size:16.5px;line-height:1.42;margin:0 0 12px;color:#2b3442}
  #dkCard .fine{font-size:13.5px;color:#5c6575;margin:12px 0 0}#dkCard .fine a{color:#9b2c3c}
  #dkCard .row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:10px 0 0}
  #dkCard ul.g{list-style:none;margin:6px 0 4px;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:5px 14px;text-align:left}
  #dkCard ul.g li{display:flex;align-items:center;gap:8px;font-size:15.5px}
  #dkCard ul.g .h{font-size:19px;line-height:1;width:20px;text-align:center;flex:none}#dkCard ul.g small{color:#6a7282;font-size:12.5px;margin-left:-2px}#dkCard ul.g .h.y{color:#c0283c}#dkCard ul.g .h.n{color:#a6acb8}
  #dkCard .cta{background:#1f2948;color:#f4f1e8;border-radius:16px;padding:16px;margin:14px 0 4px;text-align:left}
  #dkCard .cta b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:23px;font-weight:600;line-height:1.1;margin-bottom:4px}
  #dkCard .cta span{display:block;font-size:14.5px;color:#cdd3e2;margin-bottom:12px;line-height:1.4}
  #dkCard input{font:inherit;font-size:16px;border:1.5px solid #cfcabe;border-radius:12px;padding:11px 12px;width:100%;background:#fff;color:#1f2a3a}
  #dkCard label{display:block;text-align:left;font-size:13.5px;color:#5c6575;margin:0 0 4px}
  #dkCard img.pc{width:100%;height:auto;border-radius:10px;display:block;box-shadow:0 8px 24px rgba(0,0,0,.25);margin:0 0 12px}
  #dkArrive{position:fixed;z-index:66;left:50%;bottom:26px;transform:translateX(-50%);width:min(520px,calc(100% - 24px));padding:14px 16px;display:flex;gap:12px;align-items:center}
  #dkArrive.in{animation:dkIn .45s}@keyframes dkIn{from{opacity:0;transform:translate(-50%,16px)}}
  #dkArrive .av{flex:none;width:48px;height:48px;border-radius:50%;font-size:27px;line-height:1;display:grid;place-items:center}
  #dkArrive b{font-weight:500;font-size:16.5px}#dkArrive small{color:#6a7282;font-size:13px;margin-left:6px}#dkArrive p{margin:3px 0 0;font-size:16.5px;line-height:1.3}
  #dkArrive .h{font-size:30px;line-height:1;flex:none}#dkArrive .h.y{color:#c0283c;animation:dkPop .6s}#dkArrive .h.n{color:#a6acb8}
  #dkArrive .skip{position:absolute;right:10px;top:-40px;background:rgba(251,250,247,.92);border:0;border-radius:999px;padding:8px 14px;font-size:14px}
  #dkDusk{position:fixed;z-index:66;left:50%;bottom:30px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;width:min(480px,calc(100% - 24px))}
  #dkDusk .dkBtn.big{box-shadow:0 0 0 6px rgba(232,184,74,.25),0 12px 40px rgba(0,0,0,.4)}
  #dkPhoto{position:fixed;z-index:62;left:50%;bottom:16px;transform:translateX(-50%);width:min(680px,calc(100% - 20px));padding:10px;display:flex;flex-direction:column;gap:8px}
  #dkPhoto .pl{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}#dkPhoto .pl::-webkit-scrollbar{display:none}
  #dkPhoto .pl button{flex:none;border:1px solid #d9d4c7;background:#fff;border-radius:999px;padding:8px 13px;font-size:14.5px;white-space:nowrap}
  #dkPhoto .pl button[aria-pressed=true]{background:#1f2948;border-color:#1f2948;color:#fff}
  #dkPhoto .act{display:flex;gap:8px;align-items:center}#dkPhoto .act span{font-size:13.5px;color:#5c6575;flex:1;line-height:1.25}
  #dkFlash{position:fixed;inset:0;z-index:95;background:#fff;opacity:0;pointer-events:none}#dkFlash.on{animation:dkFl .5s}@keyframes dkFl{10%{opacity:.85}100%{opacity:0}}
  @media (max-width:700px){
    #dkTop{top:40px;left:8px;right:8px}#dkPlaces{flex-wrap:nowrap}#dkCard.side{place-items:end center;padding:8px}#dkCard.side .c{max-width:none;max-height:64vh}#dkSay{max-width:calc(100% - 112px);padding:6px 10px 6px 6px}#dkSay .av{width:40px;height:40px}#dkSay .av svg{width:38px}#dkSay p{font-size:18px}
    #dkSide button{height:42px;min-width:42px;padding:0 11px}#dkSide button span.t{display:none}
    #dkPanel{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:44vh}
    #dkPanel.fold #dkBody{display:none}
    #dkFold{display:inline-flex;border:1px solid #cfcabe;background:#fff;border-radius:999px;min-height:46px;padding:0 14px;font-size:14.5px;align-items:center}
    #dkBody h3{font-size:22px;margin-top:4px}#dkBody .opt{min-height:50px;padding:8px 9px}
    #dkNew{top:40px;left:8px;width:calc(100% - 16px);padding:10px 12px}#dkNew .k{display:none}#dkNew .dkMsg p{font-size:14.5px;line-height:1.3;padding:7px 10px}#dkToast{top:150px}html.dk header.bar{visibility:hidden}#dkFoot .dkBtn{padding:11px 15px}
    #dkCard .c{padding:18px 16px 14px;border-radius:20px}#dkCard ul.g{gap:4px 8px}#dkCard ul.g li{font-size:14.5px}
    #dkArrive{bottom:14px}#dkDusk{bottom:18px}
    #dkPhoto .act span{display:none}
  }
  @media (prefers-reduced-motion:reduce){#dkArrive.in,#dkMsgBtn.new,#dkArrive .h.y,#dkFlash.on{animation:none}#dkVeil,#dkNew,#dkToast{transition:none}}
  `;
  const ICON = {msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" stroke-linejoin="round"/></svg>',
    sndOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    sndOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="22" height="22" aria-hidden="true"><path d="M3 8h4l2-3h6l2 3h4v11H3z" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.6"/></svg>'};
  const catHead = id => window.SNOWBALL.svg({id, seed: 7, wear: S.wear !== 'none' ? S.wear : null}).replace(/viewBox="[^"]+"/, 'viewBox="110 10 280 300"');
  let toastE, tt = 0, sayT = 0;
  const toast = (m, ms) => { toastE.textContent = m; toastE.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toastE.classList.remove('on'), ms || 2400); };
  function say(m, note){ const p = $('#dkSay p'); if(!p) return; p.innerHTML = esc(m) + (note ? `<small>${esc(note)}</small>` : ''); }
  function buildUI(){ document.head.appendChild(el('style', {}, css)); document.documentElement.classList.add('dk');
    if(!document.querySelector('link[href*="Caveat+Brush"]')) document.head.appendChild(el('link', {rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Caveat+Brush&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Jost:wght@300;400;500&display=swap'}));
    veil = el('div', {id: 'dkVeil'}); document.body.appendChild(veil);
    document.body.appendChild(el('div', {id: 'dkTop', class: 'dk', hidden: ''}, `<button class="dkChip" id="dkSay" type="button" aria-label="Ask Snowball for a hint"><span class="av" id="dkAv"></span><p></p></button>
      <div id="dkSide"><button class="dkChip" id="dkMsgBtn" type="button" hidden>${ICON.msg}<span class="t">Messages</span><span class="n" hidden>0</span></button><button class="dkChip" id="dkSnd" type="button"></button></div>`));
    document.body.appendChild(el('div', {id: 'dkPanel', class: 'dk dkChip', hidden: ''}, `<div id="dkPlaces" role="tablist" aria-label="Places to decorate"></div><div id="dkBody"></div><div id="dkFoot"></div>`));
    document.body.appendChild(el('button', {id: 'dkNew', class: 'dk dkChip', type: 'button'}));
    toastE = el('div', {id: 'dkToast', class: 'dk', role: 'status'}); document.body.appendChild(toastE); document.body.appendChild(el('div', {id: 'dkFlash'}));
    $('#dkSay').onclick = hint; $('#dkMsgBtn').onclick = openMsgs; $('#dkNew').onclick = () => { $('#dkNew').classList.remove('on'); openMsgs(); };
    const sb = $('#dkSnd'), si = () => { sb.innerHTML = sound ? ICON.sndOn : ICON.sndOff; sb.setAttribute('aria-pressed', sound); sb.setAttribute('aria-label', sound ? 'Sound is on' : 'Sound is off'); }; si(); sb.onclick = () => { sound = !sound; store.set('deck.snd', sound ? '1' : '0'); if(window.DECKSFX) DECKSFX.setMuted(!sound); si(); if(sound){ sfx('tick'); ambience(); } };
    $('#dkAv').innerHTML = catHead('dkav'); }
  const show = (sel, on) => { const e = $(sel); if(e) e.hidden = !on; };
  function card(html, o){ closeCard(); const c = el('div', {id: 'dkCard', class: 'dk' + (o && o.clear ? ' clear' : '') + (o && o.side ? ' side' : '')}, `<div class="c">${html}</div>`); document.body.appendChild(c); const f = c.querySelector('[data-focus]') || c.querySelector('button, a'); if(f) try{ f.focus({preventScroll: true}); }catch(e){} c.querySelectorAll('input').forEach(i => ['keydown', 'keyup', 'keypress'].forEach(ev => i.addEventListener(ev, e => e.stopPropagation()))); return c; }
  function closeCard(){ const c = $('#dkCard'); if(c) c.remove(); }

  /* ---------- the decorating panel ---------- */
  function renderPlaces(){ const box = $('#dkPlaces'); box.innerHTML = PLACES.map(p => `<button type="button" role="tab" data-p="${p.id}" aria-pressed="${p === PLACE}" class="${p.sections.some(s => touched.has(SECT[s].key)) ? 'done' : ''}">${esc(p.label)}</button>`).join('');
    box.querySelectorAll('button').forEach(b => b.onclick = () => goPlace(b.dataset.p)); const cur = box.querySelector('[aria-pressed=true]'); if(cur && cur.scrollIntoView) try{ cur.scrollIntoView({block: 'nearest', inline: 'center'}); }catch(e){} }
  function renderBody(keep){ const body = $('#dkBody'), top = body.scrollTop; let h = '';
    PLACE.sections.forEach(id => { const st = SECT[id]; h += `<h3>${esc(st.title)}</h3><p class="help">${esc(st.help)}</p><div class="opts">` + st.options.map(o => { const on = st.type === 'multi' ? S[st.key].includes(o.v) : S[st.key] === o.v; return `<button type="button" class="opt" data-s="${id}" data-v="${o.v}" aria-pressed="${on}"><b>${esc(o.b)}</b><small>${esc(o.n)}</small></button>`; }).join('') + '</div>';
      if(st.seg && (!st.seg.when || st.seg.when(S))) h += `<div class="seg"><span>${esc(st.seg.label)}</span><div>` + st.seg.opts.map(o => `<button type="button" data-s="${id}" data-g="${o[0]}" aria-pressed="${S[st.seg.key] === o[0]}">${esc(o[1])}</button>`).join('') + '</div></div>'; });
    body.innerHTML = h; body.scrollTop = keep ? top : 0;
    body.querySelectorAll('.opt').forEach(b => b.onclick = () => pick(b.dataset.s, b.dataset.v)); body.querySelectorAll('.seg button').forEach(b => b.onclick = () => pickSeg(b.dataset.s, b.dataset.g)); }
  function renderFoot(){ const i = PLACES.indexOf(PLACE), last = i === PLACES.length - 1, f = $('#dkFoot'), fix = PHASE === 'fix';
    f.innerHTML = `<button type="button" id="dkFold" aria-expanded="true" aria-label="Hide the choices">Hide</button><span class="grow"></span>` + (i > 0 ? `<button type="button" class="dkBtn" id="dkBack">Back</button>` : '') +
      (fix ? `<button type="button" class="dkBtn primary" id="dkNext">${MODE === 'story' ? 'See who is happy now' : 'Done decorating'}</button>` : last ? `<button type="button" class="dkBtn primary" id="dkNext">Wait for sunset</button>` : `<button type="button" class="dkBtn dark" id="dkNext">Next: ${esc(PLACES[i + 1].label.toLowerCase())}</button>`);
    if($('#dkBack')) $('#dkBack').onclick = () => goPlace(PLACES[i - 1].id);
    $('#dkNext').onclick = () => { if(fix) return refix(); if(last) return sunset(); goPlace(PLACES[i + 1].id); };
    const fold = $('#dkFold'), pn = $('#dkPanel'); fold.onclick = () => { const on = pn.classList.toggle('fold'); fold.textContent = on ? 'Show' : 'Hide'; fold.setAttribute('aria-label', on ? 'Show the choices' : 'Hide the choices'); fold.setAttribute('aria-expanded', !on); reframe(.5); }; if(pn.classList.contains('fold')){ fold.textContent = 'Show'; fold.setAttribute('aria-label', 'Show the choices'); fold.setAttribute('aria-expanded', 'false'); } }
  function refresh(keep){ renderPlaces(); renderBody(keep); renderFoot(); }
  function applyAll(){ P.apply(dressed(), {inside: !!PLACE.inside}); placeCat(PLACE); }
  function pick(sid, v){ const st = SECT[sid], o = st.options.find(q => q.v === v); touched.add(st.key);
    let added = true; if(st.type === 'multi'){ const a = S[st.key], i = a.indexOf(v); if(i >= 0){ a.splice(i, 1); added = false; } else { a.push(v); say(o.say); } } else { S[st.key] = v; say(o.say); if(v === 'none') added = false; }
    if(st.key === 'wear') $('#dkAv').innerHTML = catHead('dkav');
    if(v === 'bell') sfx('jingle'); else if(v === 'box' && added) sfx('purr', 1.5); else if(added) sfx('place', (SOUND_OF[st.key] || 0) + st.options.indexOf(o) % 2); else sfx('remove');
    applyAll(); refresh(true); if(v === 'box') reframe(.5); ga('deck_pick', {key: st.key, v}); }
  function pickSeg(sid, v){ const sg = SECT[sid].seg; S[sg.key] = v; touched.add(sg.key); if(sg.say && sg.say[v]) say(sg.say[v]); sfx('tick'); applyAll(); refresh(true); ga('deck_pick', {key: sg.key, v}); }
  function goPlace(id, quiet){ const p = placeOf(id); if(!p) return; const first = !visited.has(p.id); PLACE = p; visited.add(p.id); sfx('whoosh'); if(S.wear === 'bell') setTimeout(() => sfx('jingle'), 700); if((PHASE === 'decor' || PHASE === 'fix') && p.sections){ refresh(); if(!quiet && p.say && PHASE === 'decor') say(p.say); if(MODE === 'story' && first && PHASE === 'decor') setTimeout(wave, 1700); } moveTo(p); ga('deck_place', {place: p.id}); }

  /* ---------- messages from tonight's guests (Snowball passes them along) ---------- */
  const msgHTML = g => `<div class="dkMsg"><span class="av" style="background:${g.c}" aria-hidden="true">${g.icon}</span><div><b>${esc(g.name)}</b><small>${esc(g.who)}</small><p>${esc(g.msg)}</p></div></div>`;
  function badge(){ const b = $('#dkMsgBtn'), n = b.querySelector('.n'); b.hidden = MODE !== 'story' || !arrived.length; n.hidden = !unread; n.textContent = unread; }
  let newT = 0, queue = [];
  function wave(){ const w = WAVES.find(ids => ids.some(id => !arrived.includes(id))); if(!w || PHASE !== 'decor') return; w.filter(id => !arrived.includes(id)).forEach(id => queue.push(id)); pump(); }
  function pump(){ if(!queue.length || $('#dkNew').classList.contains('on')) return; const id = queue.shift(), g = guest(id); if(arrived.includes(id)) return pump(); arrived.push(id); unread++; badge(); sfx('message'); const b = $('#dkMsgBtn'); b.classList.remove('new'); void b.offsetWidth; b.classList.add('new');
    const n = $('#dkNew'); n.innerHTML = `<span class="k">New message. Tap to see them all.</span>` + msgHTML(g); n.classList.add('on'); clearTimeout(newT); newT = setTimeout(() => { n.classList.remove('on'); setTimeout(pump, 500); }, reduce ? 6500 : 5200); }
  function flushMsgs(){ queue = []; GUESTS.forEach(g => { if(!arrived.includes(g.id)){ arrived.push(g.id); unread++; } }); badge(); }
  function openMsgs(){ unread = 0; badge(); const d = el('div', {id: 'dkDrawer', class: 'dk'}, `<div class="d"><button class="dkBtn x" type="button">Close</button><h3>Tonight's guests</h3><p class="sub">Company is coming and bringing their animals. Each animal has asked for something. ${arrived.length < GUESTS.length ? 'More messages arrive as you go.' : ''}</p>` + arrived.slice().reverse().map(id => msgHTML(guest(id))).join('') + '</div>');
    document.body.appendChild(d); const close = () => d.remove(); d.querySelector('.x').onclick = close; d.onclick = e => { if(e.target === d) close(); }; d.querySelector('.x').focus(); ga('deck_msgs'); }
  function hint(){ sfx('purr', 1.1); if(PHASE !== 'decor' && PHASE !== 'fix'){ return; } ga('deck_hint', {place: PLACE.id});
    if(MODE !== 'story'){ say(PLACE.say || 'Pick whatever looks right to you. I trust you.'); return; }
    const open = openNeeds(), here = open.filter(o => o.n.place === PLACE.id); if(here.length){ const o = here[(hint.n = (hint.n || 0) + 1) % here.length]; say(o.n.hint, 'About ' + o.g.name); return; }
    if(open.length){ say('Nobody is waiting on anything here. Try ' + theName(placeOf(open[0].n.place)) + '.', 'About ' + open[0].g.name); return; }
    say(arrived.length < GUESTS.length ? 'Everyone who has written so far is taken care of. Keep going.' : 'Everyone is taken care of. I checked twice.'); }

  /* ---------- sunset, lighting up, arrivals ---------- */
  function dimUI(on){ show('#dkPanel', !on); }
  function sunset(){ if(PHASE !== 'decor') return; PHASE = 'dusk'; ga('deck_dusk', {mode: MODE}); if(MODE === 'story') flushMsgs(); $('#dkNew').classList.remove('on'); dimUI(true); PLACE = PLACES[0];
    say('Here it comes. Everybody hold still.'); sfx('sunset'); ambience(); veil.classList.add('on');
    setTimeout(() => { P.setOn(0); try{ H.setTOD('dusk'); }catch(e){}
      const d = el('div', {id: 'dkDusk', class: 'dk'}, `<button type="button" class="dkBtn gold big" id="dkLight">Light it up</button><button type="button" class="dkBtn" id="dkMore">Keep decorating</button>`); document.body.appendChild(d);
      setCam(view(PLACE)); afterMove(PLACE); setTimeout(() => veil.classList.remove('on'), 200);
      $('#dkLight').onclick = lightUp; $('#dkMore').onclick = () => { d.remove(); PHASE = 'decor'; try{ H.setTOD(DAY); }catch(e){} P.setOn(1); dimUI(false); refresh(); ambience(); reframe(.6); say('Fine. A little more daylight.'); }; say('The sun is down. Ready when you are.'); try{ $('#dkLight').focus({preventScroll: true}); }catch(e){} }, reduce ? 10 : 600); }
  function lightUp(){ const d = $('#dkDusk'); if(d) d.remove(); if(PHASE === 'lighting') return; PHASE = 'lighting'; reframe(1.2); ga('deck_lightup', {mode: MODE, shared}); say('Oh.'); ambience(); let lastK = null, gi = 0;
    P.lightUp((i, k) => { if(k !== lastK){ lastK = k; sfx('sparkle', gi++); } }, () => { sfx('chord'); say(MODE === 'story' && !shared ? 'Positions, everyone. I will be on the porch looking casual.' : 'Look at it. The whole street is going to slow down.'); setTimeout(() => { if(shared) return sharedDone(); if(MODE === 'story') arrivals(ARRIVE.map(guest), true); else result(); }, reduce ? 300 : 1500); }); }
  let arrT = 0;
  function arrivals(list, first){ PHASE = 'arrive'; const box = el('div', {id: 'dkArrive', class: 'dk dkChip'}); document.body.appendChild(box); let i = 0, over = false;
    const end = () => { if(over) return; over = true; clearTimeout(arrT); box.remove(); result(); };
    const showG = g => { const ok = g.ok(S); box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
      box.innerHTML = `<button class="skip" type="button">Skip to the end</button><span class="av" style="background:${g.c}" aria-hidden="true">${g.icon}</span><div style="flex:1"><b>${esc(g.name)}</b><small>${esc(g.who)}</small><p>${esc(ok ? g.yes : g.no)}</p></div><span class="h ${ok ? 'y' : 'n'}" role="img" aria-label="${ok ? 'is happy' : 'is not happy yet'}">${ok ? '♥' : '♡'}</span>`;
      box.querySelector('.skip').onclick = end; sfx('doorbell', ok ? 'yes' : 'no'); arrT = setTimeout(next, reduce ? 3200 : (ok ? 2900 : 3300)); };
    const next = () => { if(over) return; if(i >= list.length) return end(); const g = list[i++], p = placeOf(g.place); if(p !== PLACE){ PLACE = p; box.style.visibility = 'hidden'; moveTo(p, () => { box.style.visibility = ''; if(!over) showG(g); }); } else showG(g); };
    if(first) say('Here they come. I can hear the doorbell, and a great many feet.'); arrT = setTimeout(next, 500); }
  function refix(){ const before = lastScore || [], now = happy().map(g => g.id), gained = ARRIVE.filter(id => now.includes(id) && !before.includes(id)).map(guest); dimUI(true); P.setOn(1); ga('deck_refix', {gained: gained.length}); if(MODE !== 'story') return result(); if(gained.length) arrivals(gained, false); else result(); }

  /* ---------- how the evening went ---------- */
  const DAY = 'afternoon';
  function ctaHTML(){ return `<div class="cta"><b>The house is real, and it is for sale.</b><span>118 Hillside Drive, a mile from Woodside's Town Center. The oak, the terrace and the front porch are all there in person.</span><a class="dkBtn primary big" href="/#contact" id="dkSee">See it in person</a></div>`; }
  function result(){ PHASE = 'result'; $$('#dkArrive').forEach(e => e.remove()); dimUI(true); const story = MODE === 'story' && !shared, hp = story ? happy() : [], all = story && hp.length === GUESTS.length; if(story){ lastScore = hp.map(g => g.id); ga('deck_score', {happy: hp.length}); }
    if(PLACE.id !== 'street'){ PLACE = PLACES[0]; moveTo(PLACE); }
    say(!story ? 'Look at it. The whole street is going to slow down. Worth every minute.' : all ? 'Everyone is happy, and I am in a box. Best night this house has ever had.' : 'Some of them were being polite. I can tell. We could fix that.');
    if(all && !result.rang){ result.rang = true; setTimeout(() => sfx('chord'), 400); } ambience();
    const c = card(`<h2>${!story ? 'Snowball approves.' : all ? 'Every guest is happy.' : hp.length + ' of ' + GUESTS.length + ' guests are happy.'}</h2>` +
      (story ? `<ul class="g">${GUESTS.map(g => `<li><span class="h ${g.ok(S) ? 'y' : 'n'}" aria-hidden="true">${g.ok(S) ? '♥' : '♡'}</span>${esc(g.name)}<span style="position:absolute;left:-9999px">${g.ok(S) ? 'is happy' : 'is not happy yet'}</span></li>`).join('')}</ul>` : `<p>The house is lit. Walk around it, and take a postcard from wherever it looks best.</p>`) +
      `<div class="row">${story && !all ? `<button class="dkBtn primary" id="dkFix" type="button" data-focus>Go back and fix it</button>` : ''}<button class="dkBtn ${story && !all ? '' : 'primary'}" id="dkPc" type="button" ${story && !all ? '' : 'data-focus'}>${ICON.cam}Take a postcard</button><button class="dkBtn" id="dkShare" type="button">Send your house</button></div>` + ctaHTML() +
      `<div class="row"><a class="dkBtn" href="/games/" id="dkGames">More games</a><button class="dkBtn" id="dkAgain" type="button">Decorate again</button></div>`, {side: true});
    if($('#dkFix')) $('#dkFix').onclick = fixIt; $('#dkPc').onclick = () => photoMode(); $('#dkShare').onclick = shareHouse; $('#dkSee').onclick = () => ga('deck_cta', {cta: 'see_in_person'}); $('#dkGames').onclick = () => ga('deck_cta', {cta: 'games'}); $('#dkAgain').onclick = again; reframe(.8); }
  function fixIt(){ const g = ARRIVE.map(guest).find(q => !q.ok(S)); if(!g) return; const n = g.needs.find(q => !q.ok(S)); ga('deck_fix', {guest: g.id}); closeCard(); PHASE = 'fix'; ambience(); dimUI(false); $('#dkPanel').classList.remove('fold'); goPlace(n.place, true); say(g.name + ' was hoping for something here. Read the message again.', 'Tap me for a hint'); }
  function again(){ ga('deck_again'); closeCard(); $$('#dkPhoto').forEach(e => e.remove()); shared = false; try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){} begin(MODE === 'free' ? 'free' : 'story'); }
  async function shareHouse(){ const url = shareLink(), text = 'I decorated 118 Hillside Drive for the holidays with Snowball the cat. Light up my version, then do yours.'; ga('deck_share');
    try{ if(navigator.share){ await navigator.share({title: 'Deck the House with Snowball', text, url}); return; } }catch(e){ if(e && e.name === 'AbortError') return; }
    try{ await navigator.clipboard.writeText(text + ' ' + url); toast('Link copied. Paste it anywhere.'); }catch(e){ toast(url, 6000); } }

  /* ---------- photo mode and the postcard ---------- */
  function photoMode(){ closeCard(); PHASE = 'photo'; dimUI(true); ga('deck_photo_mode'); $$('#dkPhoto').forEach(e => e.remove()); const all = PLACES.concat(EXTRA);
    const bar = el('div', {id: 'dkPhoto', class: 'dk dkChip'}, `<div class="pl" role="tablist" aria-label="Places to stand">${all.map(p => `<button type="button" data-p="${p.id}" aria-pressed="${p === PLACE}">${esc(p.label === 'Roofline' ? 'From the street' : p.label)}</button>`).join('')}</div>
      <div class="act"><span>Drag to look around. The postcard is exactly what you see.</span><button type="button" class="dkBtn" id="dkPhDone">Done</button><button type="button" class="dkBtn gold" id="dkSnap">${ICON.cam}Take the postcard</button></div>`);
    document.body.appendChild(bar); bar.querySelectorAll('.pl button').forEach(b => b.onclick = () => { PLACE = placeOf(b.dataset.p); moveTo(PLACE); bar.querySelectorAll('.pl button').forEach(x => x.setAttribute('aria-pressed', x === b)); ga('deck_view', {place: PLACE.id}); });
    $('#dkPhDone').onclick = () => { bar.remove(); if(shared) sharedDone(); else result(); }; $('#dkSnap').onclick = snap; say('Stand wherever you like. I will try to stay in frame.'); reframe(.6); }
  let shot = null;
  function snap(){ let url = null; try{ url = H.snapshot('image/jpeg', .93); }catch(e){ console.warn('[deck3d] snapshot', e); } if(!url || url.length < 2000){ toast('That did not work here. Try a screenshot instead.'); return; }
    sfx('shutter'); const fl = $('#dkFlash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on'); shot = {url, place: PLACE.id}; ga('deck_photo', {place: PLACE.id}); setTimeout(postcardCard, reduce ? 0 : 260); }
  async function compose(){ const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = shot.url; });
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0; const ar = sw / sh; if(ar > 1.9){ const w2 = sh * 1.9; sx = (sw - w2) / 2; sw = w2; } else if(ar < .72){ const h2 = sw / .72; sy = (sh - h2) * .45; sh = h2; }   // keep the card a sensible shape
    try{ await Promise.all([document.fonts.load('600 60px "Cormorant Garamond"'), document.fonts.load('300 26px Jost')]); }catch(e){}
    const story = MODE === 'story' && !shared, hp = story ? happy().length : 0, perfect = story && hp === GUESTS.length;
    const W = sw >= sh ? 1600 : 1200, Hh = Math.round(W * sh / sw), k = sw >= sh ? 1 : 1.12, maxW = W - Math.round(112 * k) - (perfect ? Math.round(150 * k) : 0), m = document.createElement('canvas').getContext('2d'); m.font = `300 ${Math.round(26 * k)}px Jost, "Helvetica Neue", Arial, sans-serif`;
    const two = story && m.measureText(hp + ' of ' + GUESTS.length + ' guests are happy. Decorated with Snowball at 118hillside.com/games/deck').width > maxW, band = Math.round((two ? 184 : 150) * k), c = document.createElement('canvas'); c.width = W; c.height = Hh + band; const x = c.getContext('2d');
    x.fillStyle = '#18213a'; x.fillRect(0, 0, W, Hh + band); x.drawImage(img, sx, sy, sw, sh, 0, 0, W, Hh);
    x.textBaseline = 'alphabetic'; x.fillStyle = '#f6f5f1'; let fs = Math.round(60 * k); const title = 'Happy holidays from ' + (S.name || '118 Hillside'); do{ x.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`; fs -= 2; }while(x.measureText(title).width > maxW && fs > 22);
    x.fillText(title, Math.round(56 * k), Hh + Math.round(76 * k)); x.fillStyle = '#c4cad8'; fs = Math.round(26 * k); const l1 = story ? (perfect ? 'Every guest is happy.' : hp + ' of ' + GUESTS.length + ' guests are happy.') : '', l2 = 'Decorated with Snowball at 118hillside.com/games/deck'; x.font = `300 ${fs}px Jost, "Helvetica Neue", Arial, sans-serif`;
    if(!two){ x.fillText((l1 ? l1 + ' ' : '') + l2, Math.round(58 * k), Hh + Math.round(118 * k)); } else { x.fillText(l1, Math.round(58 * k), Hh + Math.round(116 * k)); x.fillText(l2, Math.round(58 * k), Hh + Math.round(150 * k)); }
    if(perfect){ x.save(); x.translate(W - Math.round(100 * k), Hh + Math.round(band / 2 - 4)); x.rotate(-.18); x.scale(k, k); x.beginPath(); for(let q = 0; q < 32; q++){ const a = q / 32 * Math.PI * 2, r = q % 2 ? 50 : 57; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fillStyle = '#e8b84a'; x.fill(); x.fillStyle = '#2a1d07'; x.textAlign = 'center'; x.font = '600 22px "Cormorant Garamond", Georgia, serif'; x.fillText('A perfect', 0, -4); x.fillText('evening', 0, 20); x.restore(); }
    return c; }
  async function postcardCard(){ let cv = null; try{ cv = await compose(); }catch(e){ console.warn('[deck3d] postcard', e); toast('That did not work here. Try a screenshot instead.'); return; }
    const draw = () => { const c = card(`<img class="pc" alt="Your postcard: the decorated house with a greeting underneath" src="${cv.toDataURL('image/jpeg', .9)}"><label for="dkName">Who is it from? This goes on the card.</label><input id="dkName" maxlength="32" autocomplete="off" placeholder="118 Hillside" value="${esc(S.name)}">
        <div class="row"><button class="dkBtn primary" id="dkSave" type="button" data-focus>Save the postcard</button><button class="dkBtn" id="dkShare2" type="button">Send your house</button><button class="dkBtn" id="dkRetake" type="button">Take another postcard</button></div>` + ctaHTML() + `<div class="row"><a class="dkBtn" href="/games/" id="dkGames">More games</a><button class="dkBtn" id="dkAgain" type="button">Decorate again</button></div>`);
      let nt = 0; $('#dkName').oninput = e => { S.name = e.target.value.replace(/\s+/g, ' ').slice(0, 32); clearTimeout(nt); nt = setTimeout(async () => { try{ cv = await compose(); const im = $('#dkCard img.pc'); if(im) im.src = cv.toDataURL('image/jpeg', .9); }catch(err){} }, 350); };
      $('#dkSave').onclick = () => { const fail = () => toast('That did not work here. Try a screenshot instead.'), give = href => { const a = document.createElement('a'); a.download = 'holidays-at-118-hillside.png'; a.href = href; document.body.appendChild(a); a.click(); a.remove(); toast('Postcard saved.'); ga('deck_save', {place: shot.place}); };
        try{ S.name = S.name.trim(); if(cv.toBlob) cv.toBlob(b => { try{ if(!b) return give(cv.toDataURL('image/png')); const u = URL.createObjectURL(b); give(u); setTimeout(() => URL.revokeObjectURL(u), 20000); }catch(e){ fail(); } }, 'image/png'); else give(cv.toDataURL('image/png')); }catch(e){ fail(); } };
      $('#dkShare2').onclick = shareHouse; $('#dkRetake').onclick = () => { closeCard(); ga('deck_retake'); }; $('#dkSee').onclick = () => ga('deck_cta', {cta: 'see_in_person'}); $('#dkGames').onclick = () => ga('deck_cta', {cta: 'games'}); $('#dkAgain').onclick = again; };
    draw(); }

  /* ---------- a house someone sent you ---------- */
  function sharedStart(){ PHASE = 'shared'; MODE = 'free'; ambience(); show('#dkTop', true); badge(); P.setOn(0); try{ H.setTOD('dusk'); }catch(e){} PLACE = PLACES[0]; setCam(view(PLACE)); afterMove(PLACE); $('#dkAv').innerHTML = catHead('dkav');
    say('Someone decorated this one for you. Go on, switch it on.'); const who = S.name ? esc(S.name.charAt(0).toUpperCase() + S.name.slice(1)) : 'A friend';
    card(`<div class="cat">${window.SNOWBALL.svg({id: 'dksh', seed: 7, wear: S.wear !== 'none' ? S.wear : null})}</div><h2>${who} decorated a house for you.</h2><p>It is 118 Hillside Drive in Woodside, dressed for the holidays with help from Snowball the cat. The sun is down. One switch left.</p><div class="row"><button class="dkBtn gold big" id="dkGo" type="button" data-focus>Light it up</button></div>`, {clear: true});
    $('#dkGo').onclick = () => { closeCard(); lightUp(); }; }
  function sharedDone(){ PHASE = 'result'; card(`<h2>${S.name ? 'Happy holidays from ' + esc(S.name) + '.' : 'Happy holidays.'}</h2><p>Walk around the house they decorated, then do your own. Company is coming, and their animals have requests.</p>
      <div class="row"><button class="dkBtn primary" id="dkMine" type="button" data-focus>Decorate your own</button><button class="dkBtn" id="dkPc" type="button">${ICON.cam}Look around</button></div>` + ctaHTML() + `<div class="row"><a class="dkBtn" href="/games/" id="dkGames">More games</a></div>`, {side: true});
    $('#dkMine').onclick = () => { ga('deck_shared_own'); shared = false; try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){} closeCard(); startCard(); }; $('#dkPc').onclick = () => photoMode(); $('#dkSee').onclick = () => ga('deck_cta', {cta: 'see_in_person'}); reframe(.8); }

  /* ---------- start ---------- */
  function begin(mode){ MODE = mode; S = clone(mode === 'story' ? STORY_START : FREE_START); PHASE = 'decor'; touched = new Set(); arrived = []; unread = 0; queue = []; visited = new Set(); lastScore = null; result.rang = false; ambience(); $$('#dkDusk,#dkArrive,#dkPhoto').forEach(e => e.remove());
    try{ H.setTOD(DAY); }catch(e){} P.setOn(1); PLACE = PLACES[0]; visited.add(PLACE.id); show('#dkTop', true); dimUI(false); $('#dkPanel').classList.remove('fold'); $('#dkAv').innerHTML = catHead('dkav'); badge(); refresh(); cut(PLACE, () => afterMove(PLACE));
    say(mode === 'story' ? 'It is December in Woodside and nothing is up yet. I have notes.' : 'No guests, no rules. Make it look like a holiday.', 'Tap me any time for a hint'); ga('deck_start', {mode}); if(mode === 'story') setTimeout(wave, 2600); }
  function startCard(){ PHASE = 'start'; show('#dkTop', false); dimUI(true); try{ H.setTOD(DAY); }catch(e){} PLACE = PLACES[0]; INSIDE = false; setCam(view(PLACE)); P.apply(dressed(), {}); P.setCat(null);
    card(`<div class="cat">${window.SNOWBALL.svg({id: 'dkst', seed: 7})}</div><h2>Deck the House with Snowball</h2>
      <p>Company is coming to 118 Hillside tonight, and they are bringing their animals. Each animal has sent a request. Read them, decorate the real house in 3D however you celebrate, then light it up at sunset and see who is happy.</p>
      <div class="row"><button class="dkBtn primary big" id="dkStory" type="button" data-focus>Start decorating</button></div><div class="row"><button class="dkBtn" id="dkFree" type="button">Just decorate</button></div>
      <p class="fine">Just decorate skips the guests. Good for small hands.</p>`);
    $('#dkStory').onclick = () => { closeCard(); begin('story'); }; $('#dkFree').onclick = () => { closeCard(); begin('free'); }; }
  function boot(){ try{ H.asBuilt && H.asBuilt(); }catch(e){} const go = () => { P = window.DECKPROPS(H); tuneLight(); buildUI(); requestAnimationFrame(frame); oakWatch(); try{ H.anim = null; }catch(e){}
      const n = location.hash.length > 1 ? decode(location.hash) : null; if(n){ S = n; shared = true; }
      const open = () => { if(shared) sharedStart(); else startCard(); };
      const intro = document.getElementById('intro28'); if(intro){ const mo = new MutationObserver(() => { if(!document.getElementById('intro28')){ mo.disconnect(); open(); } }); mo.observe(document.body, {childList: true}); } else open(); };
    let need = 0; const done = () => { if(--need <= 0) go(); }; const load = (src, has) => { if(has) return; need++; const s = document.createElement('script'); s.src = src; s.onload = done; s.onerror = () => { console.warn('[deck3d] could not load ' + src); done(); }; document.head.appendChild(s); };
    load('../assets/snowball.js?v=37', !!window.SNOWBALL); load('../assets/deck3d/deck-props.js?v=37', !!window.DECKPROPS); load('../assets/deck3d/deck-sfx.js?v=34', !!window.DECKSFX); if(!need) go(); }
  (function wait(n){ let fr = 0; try{ fr = H.renderer.info.render.frame; }catch(e){} const ld = document.getElementById('loading'), up = ld && !ld.classList.contains('done');
    if((fr > 8 && !up) || n > 240) setTimeout(boot, 700); else setTimeout(() => wait(n + 1), 250); })(0);

  /* QA hook */
  window.DECK3D = {get S(){ return S; }, get mode(){ return MODE; }, get phase(){ return PHASE; }, get place(){ return PLACE.id; }, get props(){ return P; }, get arrived(){ return arrived.slice(); },
    state: () => ({phase: PHASE, mode: MODE, place: PLACE.id, S: clone(S), happy: happy().map(g => g.id), arrived: arrived.slice(), on: P ? P.on : null, tod: H.tod, count: P ? P.count() : null}),
    go: id => goPlace(id, true), set(o){ Object.assign(S, clone(o)); if(P) applyAll(); if(PHASE === 'decor' || PHASE === 'fix') refresh(true); }, story: {GUESTS, SECT, PLACES, EXTRA, WAVES, ARRIVE, LINK, FREE_START}, freeRect, reframe, view, tune(id, o){ const p = placeOf(id); Object.assign(p, o); p.catY = p.catYP = null; if(p === PLACE){ setCam(view(p)); placeCat(p); } return view(p); }, start: m => { closeCard(); begin(m || 'story'); }, sunset, lightUp, dusk(){ try{ H.setTOD('dusk'); }catch(e){} }, day(){ try{ H.setTOD(DAY); }catch(e){} },
    on: v => P && P.setOn(v), get sfx(){ return window.DECKSFX; }, happy: () => happy().map(g => g.id), photo: photoMode, snap, result, encode, decode, shareLink, places: PLACES.concat(EXTRA).map(p => p.id), look: (pos, at) => { H.look(pos, at); anchor = new V3(...pos); FLY = null; }, DEFAULT, STORY_START};
})();

/* preview hosts: when the site is served from a sub-path (a test mirror), point root links like /games/ at that copy; no effect on 118hillside.com */
(function(){ if(window.__siteLinks) return; window.__siteLinks = 1; var m = /githack/.test(location.host) ? location.pathname.match(/^(\/[^\/]+\/[^\/]+\/[^\/]+)\//) : location.pathname.match(/^(.*)\/(tour|thanksgiving|halloween|games|woodside)\//), base = m ? m[1] : ''; if(!base) return;
  document.addEventListener('click', function(e){ var a = e.target && e.target.closest && e.target.closest('a[href]'); if(!a) return; var h = a.getAttribute('href'); if(!h || h.charAt(0) !== '/' || h.charAt(1) === '/' || h.indexOf(base + '/') === 0) return;
    a.setAttribute('href', base + h.replace(/^([^?#]*\/)(?=[?#]|$)/, '$1index.html')); }, true);
})();
