/* Locked In at Hillside: the animals of the house, for the Medium and Hard levels. Loaded only when one of those levels starts.
   The figures are the game pieces from Room for Everyone (assets/room3d/room.js, buildPiece), without their round bases, scaled
   to life size here, so the animals look the same in every game on the site. Each faces +x and stands on y = 0, in feet.
   The icons are the same game's 24 px drawings, used beside each animal's lines and in the notebook. */
(function(){
  'use strict';
  if(window.ESC_PETS) return;
  const COL = {biscuit: '#c08a2b', admiral: '#d2622a', nugget: '#8c5a3c', clover: '#5f7f8c', pepper: '#b8408a', mabel: '#2f8a80', snowball: '#d9822b'};
  const KIND = {biscuit: 'dog', admiral: 'fish', nugget: 'hamster', clover: 'rabbit', pepper: 'parrot', mabel: 'tortoise'};
  const SCALE = {dog: .78, fish: .42, hamster: .2, rabbit: .42, parrot: .52, tortoise: .34};
  function buildPiece(THREE, G, lin){   // ported as is; base() below draws no base here
    const g = new THREE.Group(), fig = new THREE.Group(); g.add(fig);
    const M = (col, o) => new THREE.MeshStandardMaterial(Object.assign({color: lin(col), roughness: .6, metalness: 0}, o || {}));
    const add = (geo, m, p, r, s) => { const x = new THREE.Mesh(geo, m); if(p) x.position.set(p[0], p[1], p[2]); if(r) x.rotation.set(r[0], r[1], r[2]); if(s) x.scale.set(s[0], s[1], s[2]); fig.add(x); return x; };
    const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 20, h || 14), cyl = (a, b, h, n) => new THREE.CylinderGeometry(a, b, h, n || 16), cone = (r, h, n) => new THREE.ConeGeometry(r, h, n || 14), box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
    const dark = M('#22252d', {roughness: .3}), white = M('#f7f3ea'), wood = M('#9a7650', {roughness: .75}), pink = M('#e79a96');
    const pair = (geo, m, p, r, s) => { add(geo, m, p, r, s); add(geo, m, [p[0], p[1], -p[2]], r ? [-r[0], -r[1], r[2]] : null, s); };   // the same part on both sides
    const eyes = (x, y, z, r) => pair(sph(r || .085, 10, 8), dark, [x, y, z]);
    const base = () => {};   // no game-piece base: the animal stands on the floor
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
  const GI = {
    dog: '<g stroke="none"><ellipse cx="12" cy="11.900" rx="6.200" ry="7" fill="currentColor"/><ellipse cx="5.500" cy="11" rx="2.500" ry="5.300" transform="rotate(10 5.500 11)" fill="#f7dfa6"/><ellipse cx="18.500" cy="11" rx="2.500" ry="5.300" transform="rotate(-10 18.500 11)" fill="#f7dfa6"/><circle cx="9.700" cy="10.600" r="1" fill="#1c2230"/><circle cx="14.300" cy="10.600" r="1" fill="#1c2230"/><ellipse cx="12" cy="14.400" rx="1.700" ry="1.200" fill="#1c2230"/></g><path d="M12 15.600v1.300" stroke="#1c2230" stroke-width="1.100"/>',
    fish: '<g stroke="none" fill="currentColor"><ellipse cx="13.300" cy="12.500" rx="6.700" ry="4.500"/><path d="M7.800 12.500L2.300 7.500v10z"/><path d="M10.800 8.600l3.400-3 1.900 3.200z"/><circle cx="16.800" cy="11.400" r="1" fill="#1c2230"/></g><circle cx="20.600" cy="5.300" r="1" stroke-width="1.200"/><circle cx="18.300" cy="3" r=".5" stroke-width="1.200"/>',
    hamster: '<g stroke="none"><circle cx="6.500" cy="6.800" r="2.900" fill="currentColor"/><circle cx="17.500" cy="6.800" r="2.900" fill="currentColor"/><circle cx="6.500" cy="6.800" r="1.300" fill="#f0a9a0"/><circle cx="17.500" cy="6.800" r="1.300" fill="#f0a9a0"/><ellipse cx="12" cy="13.500" rx="8.300" ry="6.900" fill="currentColor"/><circle cx="8.800" cy="12" r="1.100" fill="#1c2230"/><circle cx="15.200" cy="12" r="1.100" fill="#1c2230"/><ellipse cx="12" cy="14.500" rx="1.050" ry=".8" fill="#e2767a"/></g><path d="M10.300 16.900c.6.600 1.200.5 1.700-.3.500.8 1.100.9 1.700.3" stroke="#1c2230" stroke-width="1"/>',
    rabbit: '<g stroke="none"><ellipse cx="9" cy="6.800" rx="2.200" ry="5.300" transform="rotate(-8 9 6.800)" fill="currentColor"/><ellipse cx="15" cy="6.800" rx="2.200" ry="5.300" transform="rotate(8 15 6.800)" fill="currentColor"/><ellipse cx="9" cy="7.200" rx=".9" ry="3.500" transform="rotate(-8 9 7.200)" fill="#f0a9a0"/><ellipse cx="15" cy="7.200" rx=".9" ry="3.500" transform="rotate(8 15 7.200)" fill="#f0a9a0"/><ellipse cx="12" cy="15.600" rx="6.400" ry="5.600" fill="currentColor"/><circle cx="9.500" cy="14.500" r="1" fill="#1c2230"/><circle cx="14.500" cy="14.500" r="1" fill="#1c2230"/><ellipse cx="12" cy="16.700" rx=".95" ry=".7" fill="#e2767a"/></g>',
    parrot: '<g stroke="none"><path d="M11.700 2.800c-3.700 0-6.200 2.700-6.200 6.400 0 1.700.4 3 1 4.400.8 2 .9 3.900.3 6l5-1.200c3.300-1.500 4.900-4.500 4.900-8.200V7.300c-.4-2.800-2.200-4.500-5-4.500z" fill="currentColor"/><path d="M7 19.200l-1.800 3.600 5.600-1.600 1.100-2.800z" fill="#ff7b6b"/><path d="M15.400 5.900c3.200-.6 5 1 4.600 3.600-.3 1.900-1.400 3.200-2.800 3.900.3-1.500-.3-2.600-1.800-3z" fill="#1c2230"/><circle cx="12.600" cy="7.100" r="1.800" fill="#fff"/><circle cx="12.800" cy="7.100" r=".95" fill="#1c2230"/></g>',
    tortoise: '<g stroke="none" fill="currentColor"><path d="M2.900 15.600a8 7.600 0 0 1 16 0z"/><path d="M17.200 13.200h3.400v2.400h-3.400z"/><circle cx="20.600" cy="13" r="2.300"/><rect x="4.800" y="15" width="3.200" height="4.300" rx="1.300"/><rect x="13.800" y="15" width="3.200" height="4.300" rx="1.300"/><path d="M3.300 15.300l-2.200 1.200 2.500.5z"/><circle cx="21.200" cy="12.500" r=".75" fill="#1c2230"/></g><path d="M7.300 15.400c.4-3.400 1.800-5.500 3.600-6.600M14.500 15.400c-.4-3.400-1.800-5.500-3.600-6.600M5.300 12.300h11.200" stroke="rgba(28,34,48,.5)" stroke-width="1"/>',
  };
  const lin = c => new (window.HILLSIDE.THREE.Color)(c).convertSRGBToLinear();
  window.ESC_PETS = {COL, KIND,
    build(who){ const THREE = window.HILLSIDE.THREE, k = KIND[who]; const g = buildPiece(THREE, {col: COL[who], ico: k}, lin), s = SCALE[k] || .5; g.scale.setScalar(s);
      g.traverse(o => { o.raycast = () => {}; if(o.isMesh){ o.castShadow = false; o.receiveShadow = false; } }); g.name = 'esc-pet:' + who; return g; },
    icon(who, size){ const k = KIND[who]; if(!k) return ''; return `<svg viewBox="0 0 24 24" width="${size || 24}" height="${size || 24}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:${COL[who]}">${GI[k]}</svg>`; }};
})();
