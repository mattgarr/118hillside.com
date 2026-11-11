/* Thanksgiving at Hillside (3D): the food, the table and the paper goods (bags, boxes and tags, signed with paw prints).
   Everything is built from three.js primitives (feet, y up) for the walkable model of 118 Hillside Drive.
   window.FEASTPROPS(H) returns builders and a small particle system; assets/feast3d/feast.js places and drives them.
   Each dish is a group whose origin sits on the surface it stands on. */
(function(){
  'use strict';
  window.FEASTPROPS = function(H){
    const THREE = H.THREE, V3 = THREE.Vector3;
    const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
    const rng = seed => { let s = (Math.abs(seed | 0) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
    const root = new THREE.Group(); root.name = 'feast3d'; H.scene.add(root);

    /* ---------- materials: a little of each colour is emitted, so food keeps its colour indoors and in the shade ---------- */
    const MATS = new Map(); let LIFT = 1;
    function std(hex, o){ o = o || {}; const k = hex + JSON.stringify(o); let m = MATS.get(k); if(m) return m;
      const lift = o.lift == null ? .1 : o.lift, p = Object.assign({color: lin(hex), roughness: .8, metalness: 0}, o); delete p.lift;
      if(lift && !p.emissive){ p.emissive = lin(hex); p.emissiveIntensity = lift; }
      m = new THREE.MeshStandardMaterial(p); m.userData.lift = p.emissiveIntensity || 0; MATS.set(k, m); return m; }
    const metal = (hex, rough) => std(hex, {metalness: .85, roughness: rough == null ? .32 : rough, lift: .05});
    function setLift(k){ LIFT = k; MATS.forEach(m => { if(m.userData.lift) m.emissiveIntensity = m.userData.lift * k; }); }
    const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; m.raycast = noop; return m; };
    const noop = function(){};
    const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg || 28);
    const grp = name => { const g = new THREE.Group(); g.name = 'feast-' + name; return g; };
    function canvasTex(w, h, draw){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; }
    const HAND = '"Caveat Brush","Marker Felt","Segoe Print",cursive';
    // a sphere whose colour runs from one shade underneath to another on top, with a little speckle: bread crust, roast skin
    function shaded(geo, lo, hi, seed, pow){ const n = geo.attributes.normal, c = new Float32Array(n.count * 3), a = lin(lo), b = lin(hi), R = rng(seed || 3);
      for(let i = 0; i < n.count; i++){ let t = Math.pow(Math.max(0, n.getY(i) * .5 + .5), pow || 1.6); t = Math.max(0, Math.min(1, t + (R() - .5) * .16)); c[i * 3] = a.r + (b.r - a.r) * t; c[i * 3 + 1] = a.g + (b.g - a.g) * t; c[i * 3 + 2] = a.b + (b.b - a.b) * t; }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo; }
    const vmat = (rough, lift) => { const k = 'v' + rough + '|' + lift; let m = MATS.get(k); if(!m){ m = new THREE.MeshStandardMaterial({vertexColors: true, roughness: rough, metalness: 0, emissive: lin('#6a3a14'), emissiveIntensity: lift == null ? .16 : lift}); m.userData.lift = m.emissiveIntensity; MATS.set(k, m); } return m; };

    /* ---------- paper: kraft, twine, tags ---------- */
    function kraftTex(doodle){ return canvasTex(256, 320, (x, w, h) => { const R = rng(11); const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#d6b684'); g.addColorStop(1, '#c6a26c'); x.fillStyle = g; x.fillRect(0, 0, w, h);
        for(let i = 0; i < 1500; i++){ x.fillStyle = `rgba(88,58,22,${R() * .06})`; x.fillRect(R() * w, R() * h, 1 + R() * 5, 1); }
        x.strokeStyle = 'rgba(96,66,28,.2)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, h * .16); x.lineTo(w, h * .16); x.stroke();
        if(doodle){ x.strokeStyle = '#3f2c17'; x.fillStyle = '#3f2c17'; x.lineWidth = 6; x.lineCap = 'round'; x.lineJoin = 'round'; doodle(x, w, h); } }); }
    const leafDoodle = (x, w, h) => { x.beginPath(); x.moveTo(w * .5, h * .78); x.bezierCurveTo(w * .14, h * .62, w * .2, h * .34, w * .5, h * .26); x.bezierCurveTo(w * .8, h * .34, w * .86, h * .62, w * .5, h * .78); x.stroke(); x.beginPath(); x.moveTo(w * .5, h * .86); x.lineTo(w * .5, h * .32); x.stroke();
      for(const t of [.42, .54, .66]){ x.beginPath(); x.moveTo(w * .5, h * t); x.lineTo(w * .36, h * (t - .07)); x.moveTo(w * .5, h * t); x.lineTo(w * .64, h * (t - .07)); x.stroke(); }
      // signed with two paw prints: a small one (the cat) and a big one (the dog)
      for(const [cx, k, rot] of [[w * .4, 1, -.25], [w * .61, 1.45, .2]]){ x.save(); x.translate(cx, h * .925); x.rotate(rot); x.scale(k, k); x.beginPath(); x.ellipse(0, 5, 9.5, 8, 0, 0, 6.3); x.fill();
        for(const [dx, dy, t] of [[-11.5, -5.5, -.5], [-4.3, -12.5, -.15], [4.3, -12.5, .15], [11.5, -5.5, .5]]){ x.beginPath(); x.ellipse(dx, dy, 3.6, 5, t, 0, 6.3); x.fill(); } x.restore(); } };
    let kraftA = null, kraftB = null;
    const kraft = () => kraftA || (kraftA = new THREE.MeshStandardMaterial({map: kraftTex(leafDoodle), roughness: .95, side: THREE.DoubleSide, emissive: lin('#8a6a3a'), emissiveIntensity: .12}));
    const kraftPlain = () => kraftB || (kraftB = new THREE.MeshStandardMaterial({map: kraftTex(null), roughness: .95, side: THREE.DoubleSide, emissive: lin('#8a6a3a'), emissiveIntensity: .12}));
    const twine = () => std('#b5894e', {roughness: 1});
    /* a brown paper grocery bag, open at the top, with twine handles. userData.inside is where its contents start. */
    function bag(){ const g = grp('bag'), w = .8, h = 1.0, d = .48, k = kraft(), kp = kraftPlain();
      const f = mesh(new THREE.PlaneGeometry(w, h), k, 0, h / 2, d / 2); const b = mesh(new THREE.PlaneGeometry(w, h), kp, 0, h / 2, -d / 2); b.rotation.y = Math.PI;
      const l = mesh(new THREE.PlaneGeometry(d, h), kp, -w / 2, h / 2, 0); l.rotation.y = -Math.PI / 2; const r = mesh(new THREE.PlaneGeometry(d, h), kp, w / 2, h / 2, 0); r.rotation.y = Math.PI / 2;
      const bt = mesh(new THREE.PlaneGeometry(w, d), kp, 0, .006, 0); bt.rotation.x = -Math.PI / 2; g.add(f, b, l, r, bt);
      for(const z of [d / 2 + .004, -d / 2 - .004]){ const hd = mesh(new THREE.TorusGeometry(.15, .013, 6, 18, Math.PI), twine(), 0, h - .02, z); g.add(hd); }
      g.userData.inside = new V3(0, .45, 0); g.userData.top = h; return g; }
    /* a white bakery box tied with twine; userData.lid swings open about its back edge */
    function box(){ const g = grp('box'), card = std('#f6f2e8', {roughness: .9, lift: .07}), s = .98, h = .3;
      g.add(mesh(new THREE.BoxGeometry(s, h, s), card, 0, h / 2, 0));
      const lid = new THREE.Group(); lid.position.set(0, h, -s / 2); const top = mesh(new THREE.BoxGeometry(s + .02, .035, s + .02), card, 0, .018, s / 2); lid.add(top);
      lid.add(mesh(new THREE.BoxGeometry(s + .03, .012, .03), twine(), 0, .04, s / 2)); const t2 = mesh(new THREE.BoxGeometry(.03, .012, s + .03), twine(), 0, .04, s / 2); lid.add(t2);
      const st = mesh(new THREE.CircleGeometry(.16, 24), kraftPlain(), .22, .041, s / 2 + .2); st.rotation.x = -Math.PI / 2; lid.add(st);
      const bow = mesh(new THREE.TorusGeometry(.05, .012, 6, 14), twine(), 0, .06, s / 2); bow.rotation.x = Math.PI / 2; lid.add(bow);
      g.add(lid); g.userData.lid = lid; g.userData.inside = new V3(0, .12, 0); g.userData.top = h; return g; }
    function crate(){ const g = grp('crate'), tex = canvasTex(128, 96, (x, w, h) => { x.fillStyle = '#b98b56'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(70,44,16,.55)'; for(const y of [30, 62]) x.fillRect(0, y, w, 4); const R = rng(5); for(let i = 0; i < 300; i++){ x.fillStyle = `rgba(70,44,16,${R() * .1})`; x.fillRect(R() * w, R() * h, 8 + R() * 20, 1); } });
      const m = new THREE.MeshStandardMaterial({map: tex, roughness: .9, emissive: lin('#6a4a22'), emissiveIntensity: .12}); g.add(mesh(new THREE.BoxGeometry(1.05, .6, .7), m, 0, .3, 0)); g.userData.top = .6; return g; }
    /* the letter tags that end up on the string over the table */
    function tagTex(letter){ return canvasTex(256, 360, (x, w, h) => { x.clearRect(0, 0, w, h); const R = rng(letter.charCodeAt(0));
        x.beginPath(); x.moveTo(52, 8); x.lineTo(w - 52, 8); x.lineTo(w - 10, 62); x.lineTo(w - 10, h - 10); x.lineTo(10, h - 10); x.lineTo(10, 62); x.closePath();
        const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#dcbd8c'); g.addColorStop(1, '#caa670'); x.fillStyle = g; x.fill(); x.save(); x.clip(); for(let i = 0; i < 900; i++){ x.fillStyle = `rgba(88,58,22,${R() * .07})`; x.fillRect(R() * w, R() * h, 1 + R() * 5, 1); } x.restore();
        x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(w / 2, 46, 13, 0, Math.PI * 2); x.fill(); x.globalCompositeOperation = 'source-over';
        x.strokeStyle = 'rgba(96,66,28,.5)'; x.lineWidth = 3; x.beginPath(); x.arc(w / 2, 46, 16, 0, Math.PI * 2); x.stroke();
        x.fillStyle = '#3a2814'; x.font = '250px ' + HAND; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(letter, w / 2, h * .6); }); }
    function tag(letter, flat){ const m = new THREE.MeshStandardMaterial({map: tagTex(letter), transparent: true, alphaTest: .5, roughness: .95, emissive: lin('#9a7a48'), emissiveIntensity: .22}), piv = new THREE.Group(), y = flat ? 0 : -.35;
      const f = mesh(new THREE.PlaneGeometry(.5, .7), m, 0, y, .002), b = mesh(new THREE.PlaneGeometry(.5, .7), m, 0, y, -.002); b.rotation.y = Math.PI; f.castShadow = b.castShadow = false; piv.add(f, b); piv.userData.mat = m; return piv; }   // readable from both sides
    /* a sagging string between two points, with n places to hang a tag */
    function bunting(a, b, sag, n){ const g = grp('bunting'), A = new V3(...a), B = new V3(...b), pts = []; for(let i = 0; i <= 24; i++){ const t = i / 24, p = A.clone().lerp(B, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); }
      const curve = new THREE.CatmullRomCurve3(pts); g.add(mesh(new THREE.TubeGeometry(curve, 48, .012, 5, false), twine()));
      const slots = []; for(let i = 0; i < n; i++) slots.push(curve.getPointAt(.12 + .76 * i / (n - 1)));
      g.userData.slots = slots; return g; }

    /* ---------- the table: runner, eight places, little pumpkins and leaves ---------- */
    function runner(len, wid){ const tex = canvasTex(512, 96, (x, w, h) => { x.fillStyle = '#efe6d2'; x.fillRect(0, 0, w, h); const R = rng(4); for(let i = 0; i < 2600; i++){ x.fillStyle = `rgba(120,96,60,${R() * .07})`; x.fillRect(R() * w, R() * h, 1 + R() * 6, 1); }
        x.fillStyle = '#a8482c'; x.fillRect(0, 9, w, 5); x.fillRect(0, h - 14, w, 5); x.fillStyle = '#c98a12'; x.fillRect(0, 18, w, 2); x.fillRect(0, h - 20, w, 2); });
      const m = mesh(new THREE.PlaneGeometry(len, wid), new THREE.MeshStandardMaterial({map: tex, roughness: 1, emissive: lin('#8a7a5a'), emissiveIntensity: .1}), 0, .012, 0); m.rotation.x = -Math.PI / 2; m.castShadow = false; return m; }
    const G = {};
    const geo = (k, f) => G[k] || (G[k] = f());
    function setting(flip){ const g = grp('setting'), white = std('#f4f1ea', {roughness: .35, lift: .12}), steel = metal('#c9ccd0', .3);
      g.add(mesh(geo('plate', () => lathe([[0, 0], [.2, 0], [.3, .012], [.36, .035], [.365, .045], [.3, .028], [.2, .016], [0, .016]], 32)), white));
      const nap = mesh(geo('nap', () => new THREE.BoxGeometry(.2, .026, .32)), std('#a8482c', {roughness: 1}), 0, .035, 0); nap.rotation.y = .22; g.add(nap);
      g.add(mesh(geo('fork', () => new THREE.BoxGeometry(.03, .008, .4)), steel, -.44, .006, 0)); g.add(mesh(geo('fork', null), steel, .44, .006, 0));
      const gl = mesh(geo('glass', () => lathe([[0, 0], [.07, 0], [.085, .01], [.1, .3], [.092, .3], [.078, .02], [0, .02]], 18)), new THREE.MeshStandardMaterial({color: lin('#dfeaf0'), transparent: true, opacity: .32, roughness: .05, metalness: 0}), .34, .0, flip ? .42 : -.42); gl.castShadow = false; g.add(gl);
      const ci = mesh(geo('ciderIn', () => new THREE.CylinderGeometry(.086, .074, .15, 16)), std('#b5651d', {roughness: .2, lift: .3}), .34, .1, flip ? .42 : -.42); ci.visible = false; g.add(ci); g.userData.cider = ci; return g; }
    function pumpkin(r, hex){ const g = grp('pumpkin'), sp = new THREE.SphereGeometry(r, 24, 14), p = sp.attributes.position;
      for(let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + .075 * Math.cos(a * 8) * (1 - Math.abs(y / r) * .6); p.setXYZ(i, x * k, y * .74, z * k); } sp.computeVertexNormals();
      g.add(mesh(sp, std(hex, {roughness: .55, lift: .14}), 0, r * .72, 0)); const st = mesh(new THREE.CylinderGeometry(r * .07, r * .11, r * .42, 7), std('#6d6238', {roughness: 1}), 0, r * 1.52, 0); st.rotation.z = .2; g.add(st); return g; }
    function leaf(hex, s){ const sh = new THREE.Shape(); sh.moveTo(0, -.5); sh.bezierCurveTo(.5, -.3, .46, .22, 0, .5); sh.bezierCurveTo(-.46, .22, -.5, -.3, 0, -.5);
      const m = mesh(geo('leaf', () => new THREE.ShapeGeometry(sh, 6)), std(hex, {roughness: .9, side: THREE.DoubleSide, lift: .16})); m.rotation.x = -Math.PI / 2; m.scale.setScalar(s || .22); m.castShadow = false; return m; }

    /* ---------- the dishes ---------- */
    function cider(){ const g = grp('cider'), glass = new THREE.MeshStandardMaterial({color: lin('#8a430f'), roughness: .07, metalness: 0, transparent: true, opacity: .96, emissive: lin('#4d2407'), emissiveIntensity: .24}); glass.userData.lift = .24; MATS.set('ciderGlass', glass);
      g.add(mesh(lathe([[0, 0], [.19, 0], [.225, .03], [.23, .4], [.2, .52], [.1, .66], [.075, .76], [.09, .79], [.09, .84], [0, .84]], 28), glass));
      const hd = mesh(new THREE.TorusGeometry(.065, .02, 7, 16), glass, .13, .68, 0); g.add(hd);
      g.add(mesh(new THREE.CylinderGeometry(.062, .052, .1, 12), std('#c9a26b', {roughness: 1}), 0, .88, 0));
      const lab = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#f3ead8'; x.fillRect(0, 0, w, h); x.fillStyle = '#7a2a1c'; x.font = '70px ' + HAND; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('cider', w / 2, h / 2 + 4); x.strokeStyle = '#7a2a1c'; x.lineWidth = 4; x.strokeRect(8, 8, w - 16, h - 16); });
      const lm = mesh(new THREE.CylinderGeometry(.233, .233, .2, 28, 1, true, -1.1, 2.2), new THREE.MeshStandardMaterial({map: lab, roughness: .9, emissive: lin('#8a8070'), emissiveIntensity: .2}), 0, .22, 0); lm.rotation.y = Math.PI / 2 - 0; g.add(lm); g.userData.redraw = () => {};
      g.userData.h = .95; g.userData.r = .25; return g; }
    function pie(){ const g = grp('pie'), crust = std('#d8a252', {roughness: .62, lift: .16});
      g.add(mesh(lathe([[0, 0], [.36, 0], [.4, .02], [.47, .13], [.49, .13], [.49, .15], [.45, .15], [.385, .035], [0, .03]], 32), metal('#b9bcc0', .45)));
      const fill = mesh(new THREE.CylinderGeometry(.445, .4, .1, 32), std('#7d1620', {roughness: .25, lift: .2}), 0, .09, 0); g.add(fill);
      const rim = mesh(new THREE.TorusGeometry(.455, .045, 8, 40), crust, 0, .15, 0); rim.rotation.x = Math.PI / 2; rim.scale.z = .75; g.add(rim);
      const lat = new THREE.Group(); lat.position.y = .152; lat.rotation.y = Math.PI / 4;
      for(let d = 0; d < 2; d++) for(let i = -3; i <= 3; i++){ const off = i * .125, len = 2 * Math.sqrt(Math.max(.01, .43 * .43 - off * off)), s = mesh(new THREE.BoxGeometry(len, .018, .062), crust, d ? off : 0, d ? .008 : 0, d ? 0 : off); if(d) s.rotation.y = Math.PI / 2; lat.add(s); }
      g.add(lat); g.userData.h = .2; g.userData.r = .5; g.userData.steam = [0, .2, 0]; return g; }
    function sauce(){ const g = grp('sauce');
      g.add(mesh(lathe([[0, 0], [.13, 0], [.16, .02], [.26, .19], [.275, .225], [.255, .225], [.235, .185], [.13, .04], [0, .035]], 28), std('#f4f1ea', {roughness: .3, lift: .14})));
      const top = mesh(new THREE.SphereGeometry(.245, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#7a0f22', {roughness: .16, lift: .15}), 0, .17, 0); top.scale.y = .22; g.add(top);
      const R = rng(9), berry = std('#8f1528', {roughness: .2, lift: .16}), bg = geo('berry', () => new THREE.SphereGeometry(.03, 8, 6)); for(let i = 0; i < 11; i++){ const a = R() * 6.28, r = R() * .17; g.add(mesh(bg, berry, Math.cos(a) * r, .215 - r * r * .5, Math.sin(a) * r)); }
      const sp = new THREE.Group(), st = metal('#c9ccd0', .25); sp.add(mesh(new THREE.BoxGeometry(.03, .012, .34), st, 0, 0, .17)); const bw = mesh(new THREE.SphereGeometry(.05, 10, 6), st, 0, 0, -.02); bw.scale.set(1, .35, 1.3); sp.add(bw); sp.position.set(.1, .235, .08); sp.rotation.set(-.45, .6, 0); g.add(sp);
      g.userData.h = .3; g.userData.r = .3; return g; }
    function potatoes(){ const g = grp('potatoes'), dish = std('#efe6d4', {roughness: .3, lift: .14}), body = mesh(lathe([[0, 0], [.27, 0], [.31, .03], [.345, .2], [.37, .225], [.335, .225], [.315, .2], [.285, .05], [0, .045]], 32), dish); body.scale.set(1.32, 1, .92); g.add(body);
      const mash = mesh(new THREE.SphereGeometry(.325, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#d9742a', {roughness: .85, lift: .22}), 0, .16, 0); mash.scale.set(1.3, .3, .9); g.add(mash);
      const R = rng(21), mg = geo('mallow', () => new THREE.CylinderGeometry(.045, .045, .06, 10)), tg = geo('mallowTop', () => new THREE.CylinderGeometry(.046, .046, .014, 10)), cream = std('#f7eedd', {roughness: .7, lift: .2}), toast = std('#c58a48', {roughness: .7, lift: .16});
      for(let i = 0; i < 17; i++){ const a = i * 2.4, r = .05 + .23 * Math.sqrt((i + .5) / 17), x = Math.cos(a) * r * 1.28, z = Math.sin(a) * r * .88, y = .235 - (r * r) * .5; const m = mesh(mg, cream, x, y, z); m.rotation.set((R() - .5) * .5, R() * 3, (R() - .5) * .5); g.add(m); const t = mesh(tg, toast, 0, .034, 0); m.add(t); }
      for(const s of [-1, 1]){ const hd = mesh(new THREE.TorusGeometry(.07, .022, 6, 12, Math.PI), dish, s * .47, .2, 0); hd.rotation.set(Math.PI / 2, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2); g.add(hd); }
      g.userData.h = .32; g.userData.r = .5; g.userData.steam = [0, .28, 0]; return g; }
    function rolls(){ const g = grp('rolls');
      const weave = canvasTex(128, 64, (x, w, h) => { x.fillStyle = '#a9753f'; x.fillRect(0, 0, w, h); for(let r = 0; r < 4; r++) for(let c = 0; c < 8; c++){ x.fillStyle = (r + c) % 2 ? '#8b5c2c' : '#c08a4e'; x.fillRect(c * 16 + 1, r * 16 + 1, 14, 14); } }); weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(5, 1);
      g.add(mesh(lathe([[0, 0], [.25, 0], [.29, .03], [.37, .24], [.4, .275], [.37, .275], [.335, .24], [.26, .06], [0, .05]], 28), new THREE.MeshStandardMaterial({map: weave, roughness: .9, emissive: lin('#6a4420'), emissiveIntensity: .14})));
      const cloth = mesh(new THREE.SphereGeometry(.385, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2), std('#f3ead6', {roughness: 1, lift: .16}), 0, .2, 0); cloth.scale.y = .2; g.add(cloth);
      const rg = geo('roll', () => shaded(new THREE.SphereGeometry(.13, 16, 12), '#b0702c', '#e9b566', 7, 1.2)), rm = vmat(.5, .2);
      const at = [[0, 0]]; for(let i = 0; i < 6; i++) at.push([Math.cos(i / 6 * 6.283) * .21, Math.sin(i / 6 * 6.283) * .21]);
      at.forEach((p, i) => { const r = mesh(rg, rm, p[0], i ? .285 : .33, p[1]); r.scale.set(1, .74, 1); r.rotation.y = i * 1.3; g.add(r); });
      g.userData.h = .46; g.userData.r = .42; g.userData.steam = [0, .42, 0]; return g; }
    function candles(){ const g = grp('candles'), brass = metal('#b8913f', .3), wax = std('#f4ecdb', {roughness: .55, lift: .2});
      const base = geo('stick', () => lathe([[0, 0], [.12, 0], [.13, .02], [.06, .05], [.032, .1], [.05, .17], [.03, .23], [.052, .27], [.058, .3], [0, .3]], 20));
      const spots = [[-1.02, -.07, .82], [-.88, .09, .62], [.88, -.09, .62], [1.02, .07, .82]], tight = [[-.21, 0], [-.07, .05], [.07, -.05], [.21, 0]]; g.userData.sticks = []; g.userData.flames = [];
      spots.forEach((s, i) => { const st = new THREE.Group(); st.add(mesh(base, brass)); st.add(mesh(new THREE.CylinderGeometry(.024, .03, s[2], 10), wax, 0, .3 + s[2] / 2, 0)); st.add(mesh(new THREE.CylinderGeometry(.004, .004, .04, 4), std('#2a2018', {lift: 0}), 0, .3 + s[2] + .02, 0));
        st.userData = {wide: new V3(s[0], 0, s[1]), tight: new V3(tight[i][0], 0, tight[i][1]), top: .3 + s[2] + .035}; st.position.copy(st.userData.tight); g.add(st); g.userData.sticks.push(st); });
      g.userData.spread = k => { for(const st of g.userData.sticks) st.position.lerpVectors(st.userData.tight, st.userData.wide, k); };
      g.userData.h = 1.15; g.userData.r = .32; return g; }
    function turkey(){ const g = grp('turkey'), white = std('#f4f1ea', {roughness: .3, lift: .12});
      const plat = mesh(lathe([[0, 0], [.4, 0], [.62, .02], [.72, .05], [.735, .065], [.62, .045], [.4, .025], [0, .025]], 40), white); plat.scale.set(1.08, 1, .74); g.add(plat); const dr = g.userData.dress = [plat];
      const skin = vmat(.3, .11);
      const body = mesh(shaded(new THREE.SphereGeometry(.5, 32, 22), '#a9591f', '#5c2a0d', 5, 2.2), skin, .03, .34, 0); body.scale.set(.98, .62, .74); g.add(body);
      const breast = mesh(shaded(new THREE.SphereGeometry(.34, 24, 16), '#b06224', '#6c3411', 8, 2), skin, .2, .43, 0); breast.scale.set(.95, .7, .86); g.add(breast);
      const legG = shaded(lathe([[0, 0], [.05, 0], [.115, .07], [.15, .2], [.125, .34], [.06, .46], [.036, .55], [.032, .6], [0, .6]], 16), '#a5571f', '#5e2b0d', 12, 1.4);
      for(const s of [-1, 1]){ const leg = mesh(legG, skin, -.3, .3, s * .3); leg.rotation.set(s * .5, 0, 1.25); leg.scale.setScalar(.95); g.add(leg);
        const fr = mesh(new THREE.CylinderGeometry(.05, .042, .09, 10), white, 0, .63, 0); leg.add(fr); const kn = mesh(new THREE.SphereGeometry(.052, 8, 6), white, 0, .68, 0); leg.add(kn);
        const wing = mesh(shaded(new THREE.SphereGeometry(.17, 14, 10), '#a65a20', '#62300f', 15 + s, 1.6), skin, .16, .3, s * .37); wing.scale.set(1.25, .55, .5); wing.rotation.y = s * .25; g.add(wing); }
      const R = rng(31), og = geo('oslice', () => new THREE.CylinderGeometry(.11, .11, .02, 20)), orange = std('#e8872a', {roughness: .5, lift: .26}), pith = std('#f7d79a', {roughness: .6, lift: .22}), herb = std('#3d5a2e', {roughness: .9, lift: .14}), berry = std('#a3182d', {roughness: .2, lift: .28});
      for(const [x, z, r] of [[.62, .2, .3], [.52, -.3, -.4], [-.6, .26, 1], [-.52, -.3, .6], [.1, .44, .2], [.0, -.45, 2]]){ const o = mesh(og, orange, x, .06, z); o.rotation.set(.25, r, .12); g.add(o); dr.push(o); const c = mesh(new THREE.CylinderGeometry(.085, .085, .022, 16), pith, 0, 0, 0); o.add(c); const c2 = mesh(new THREE.CylinderGeometry(.07, .07, .024, 16), orange, 0, 0, 0); o.add(c2); }
      for(let i = 0; i < 12; i++){ const a = R() * 6.28, rx = .64 + R() * .08, sp = mesh(geo('sprig', () => new THREE.BoxGeometry(.2, .012, .03)), herb, Math.cos(a) * rx * 1.05, .07, Math.sin(a) * rx * .7); sp.rotation.y = R() * 3; g.add(sp); dr.push(sp); }
      for(let i = 0; i < 14; i++){ const a = R() * 6.28, rx = .6 + R() * .1, bm = mesh(geo('berry', () => new THREE.SphereGeometry(.03, 8, 6)), berry, Math.cos(a) * rx * 1.05, .075, Math.sin(a) * rx * .7); g.add(bm); dr.push(bm); }
      g.userData.h = .72; g.userData.r = .8; g.userData.steam = [0, .62, 0]; return g; }
    const DISH = {cider, pie, sauce, potatoes, candles, rolls, turkey};
    /* what else is in the drinks fridges: cans and small bottles */
    function can(hex){ const g = grp('can'); g.add(mesh(geo('can', () => new THREE.CylinderGeometry(.1, .1, .36, 14)), std(hex, {roughness: .35, metalness: .5, lift: .12}), 0, .18, 0)); g.add(mesh(geo('canTop', () => new THREE.CylinderGeometry(.092, .1, .02, 14)), metal('#c9ccd0', .3), 0, .37, 0)); return g; }
    function bottle(kind){ const g = grp('bottle'), milk = kind === 'milk';
      g.add(mesh(geo('bottle', () => lathe([[0, 0], [.09, 0], [.1, .02], [.1, .3], [.05, .42], [.045, .5], [0, .5]], 14)), milk ? std('#f6f3ea', {roughness: .4, lift: .16}) : std('#3f7d52', {roughness: .1, lift: .18, transparent: true, opacity: .9})));
      g.add(mesh(geo('cap', () => new THREE.CylinderGeometry(.05, .05, .045, 10)), std(milk ? '#3b6fd8' : '#d8dbe0', {roughness: .5}), 0, .515, 0)); return g; }

    /* ---------- what is in the bags that hold no dinner ---------- */
    const DECOY = {
      ball(){ const g = grp('ball'); g.add(mesh(new THREE.SphereGeometry(.14, 16, 12), std('#c9dc3c', {roughness: .95, lift: .2}), 0, .14, 0)); const s = mesh(new THREE.TorusGeometry(.14, .008, 4, 28), std('#f4f4ea', {lift: .2}), 0, .14, 0); s.rotation.set(.5, 0, .4); g.add(s); return g; },
      acorn(){ const g = grp('acorn'); g.add(mesh(lathe([[0, 0], [.03, .01], [.07, .07], [.075, .14], [0, .14]], 14), std('#9a6a32', {roughness: .45, lift: .16}))); g.add(mesh(lathe([[.078, .13], [.082, .16], [.05, .2], [.012, .215], [.012, .25], [0, .25]], 14), std('#6a4a26', {roughness: 1}))); g.scale.setScalar(1.5); return g; },
      mouse(){ const g = grp('mouse'), grey = std('#8d9299', {roughness: 1, lift: .14}); const b = mesh(new THREE.SphereGeometry(.1, 14, 10), grey, 0, .07, 0); b.scale.set(1.5, .75, .9); g.add(b);
        for(const s of [-1, 1]){ const e = mesh(new THREE.CircleGeometry(.04, 12), std('#e6a3a8', {side: THREE.DoubleSide, lift: .2}), .09, .14, s * .05); e.rotation.y = Math.PI / 2 - s * .4; g.add(e); }
        g.add(mesh(new THREE.SphereGeometry(.014, 6, 5), std('#e6a3a8'), .155, .06, 0)); const t = mesh(new THREE.TorusGeometry(.09, .006, 4, 14, 2.2), std('#c98a12', {lift: .2}), -.2, .03, 0); t.rotation.x = Math.PI / 2; g.add(t); g.scale.setScalar(1.3); return g; },
      cone(){ const g = grp('cone'), br = std('#7a5330', {roughness: 1, lift: .14}); for(let i = 0; i < 6; i++){ const k = 1 - i / 7, c = mesh(new THREE.ConeGeometry(.1 * k + .02, .1, 9), br, 0, .05 + i * .05, 0); c.rotation.y = i * .7; g.add(c); } g.scale.setScalar(1.25); return g; },
      duck(){ const g = grp('duck'), y = std('#f2c230', {roughness: .4, lift: .22}); const b = mesh(new THREE.SphereGeometry(.12, 14, 10), y, 0, .1, 0); b.scale.set(1.25, .85, 1); g.add(b); g.add(mesh(new THREE.SphereGeometry(.075, 12, 9), y, .09, .23, 0)); const bk = mesh(new THREE.ConeGeometry(.03, .07, 8), std('#e8732a', {lift: .22}), .17, .22, 0); bk.rotation.z = -Math.PI / 2; g.add(bk);
        for(const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(.012, 6, 5), std('#1a1a1a', {lift: 0}), .135, .255, s * .04)); g.scale.setScalar(1.25); return g; },
      leaf(){ const g = grp('leafprop'); const l = leaf('#b5471d', .34); l.rotation.set(-1.2, .3, .2); l.position.y = .16; g.add(l); return g; },
      napkins(){ const g = grp('napkins'); for(let i = 0; i < 4; i++){ const n = mesh(new THREE.BoxGeometry(.5, .03, .5), std(i % 2 ? '#a8482c' : '#efe6d2', {roughness: 1}), 0, .02 + i * .032, 0); n.rotation.y = i * .07; g.add(n); } return g; }};

    /* ---------- smoke, steam and candle flames ---------- */
    const puffTex = canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.45, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
    function sun(){ const t = canvasTex(128, 128, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.08, 'rgba(255,250,225,1)'); g.addColorStop(.16, 'rgba(255,225,160,.55)'); g.addColorStop(.45, 'rgba(255,190,110,.16)'); g.addColorStop(1, 'rgba(255,170,90,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false})); sp.raycast = noop; sp.renderOrder = 1; sp.name = 'feast-sun'; sp.frustumCulled = false; root.add(sp); return sp; }
    function grate(r){ const t = canvasTex(256, 256, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 8, w / 2, w / 2, w / 2); g.addColorStop(0, '#ff8a1e'); g.addColorStop(.55, '#c8400c'); g.addColorStop(1, '#3a0c04'); x.fillStyle = g; x.fillRect(0, 0, w, w); const R = rng(41); for(let i = 0; i < 260; i++){ x.fillStyle = `rgba(20,6,2,${.25 + R() * .5})`; x.beginPath(); x.arc(R() * w, R() * w, 3 + R() * 9, 0, 6.3); x.fill(); }
        x.fillStyle = '#121214'; for(let i = 6; i < w; i += 15) x.fillRect(i, 0, 8, w); x.fillRect(0, w / 2 - 5, w, 10); x.fillRect(0, w * .22, w, 7); x.fillRect(0, w * .78, w, 7); });
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({map: t})); m.rotation.x = -Math.PI / 2; m.raycast = noop; root.add(m); return m; }
    const POOL = [], EMIT = [];
    function puff(){ let p = POOL.find(q => !q.live); if(!p){ if(POOL.length >= 72) return null; const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: puffTex, transparent: true, depthWrite: false, opacity: 0})); sp.raycast = noop; sp.renderOrder = 7; sp.visible = false; root.add(sp); p = {sp, live: false}; POOL.push(p); } return p; }
    /* an emitter: {at: Vector3, rate (per second), size, rise, drift: [x, z], life, color, alpha, on} */
    function emitter(o){ const e = Object.assign({rate: 3, size: .5, rise: .9, drift: [0, 0], life: 2.4, color: '#ffffff', alpha: .3, on: true, acc: 0, grow: 1.8}, o); e.col = lin(e.color); EMIT.push(e); return e; }
    function burst(e, n){ for(let i = 0; i < n; i++) spawn(e, Math.random() * .4); }
    function spawn(e, age){ const p = puff(); if(!p) return; p.live = true; p.e = e; p.age = age || 0; p.life = e.life * (.75 + Math.random() * .5); p.sp.visible = true; p.sp.material.color.copy(e.col);
      p.sp.position.set(e.at.x + (Math.random() - .5) * e.size * .5, e.at.y, e.at.z + (Math.random() - .5) * e.size * .5); p.vx = e.drift[0] * (.6 + Math.random() * .8) + (Math.random() - .5) * .12; p.vz = e.drift[1] * (.6 + Math.random() * .8) + (Math.random() - .5) * .12; p.vy = e.rise * (.7 + Math.random() * .6); p.s0 = e.size * (.6 + Math.random() * .6); p.rot = Math.random() * 6; }
    const FL = [];
    const flameGeo = () => geo('flame', () => lathe([[0, 0], [.36, .16], [.5, .36], [.4, .62], [.16, .86], [0, 1]], 8));
    const glowTex = canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,214,150,1)'); g.addColorStop(.3, 'rgba(255,170,80,.5)'); g.addColorStop(1, 'rgba(255,150,60,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
    /* a candle flame at a world point: a small bright teardrop and its glow; returns an object with .on(k) */
    function flame(at, s){ s = s || 1; const m = new THREE.Mesh(flameGeo(), new THREE.MeshBasicMaterial({color: new THREE.Color(1.9, 1.15, .42), transparent: true, opacity: 0})); m.raycast = noop; m.position.copy(at); m.scale.set(.05 * s, .15 * s, .05 * s); root.add(m);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0})); gl.raycast = noop; gl.renderOrder = 8; gl.position.copy(at).add(new V3(0, .07 * s, 0)); gl.scale.setScalar(.75 * s); root.add(gl);
      const f = {m, gl, k: 0, ph: Math.random() * 9, s, at: at.clone(), on(k){ f.k = k; m.material.opacity = Math.min(1, k * 1.2); gl.material.opacity = .85 * k; m.visible = gl.visible = k > .01; }}; f.on(0); FL.push(f); return f; }
    function sparkle(at, n){ const out = []; for(let i = 0; i < (n || 7); i++){ const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .9})); sp.raycast = noop; sp.renderOrder = 9; sp.position.copy(at); sp.scale.setScalar(.12); root.add(sp);
        const a = Math.random() * 6.28, b = Math.random() * 1.2 - .2; out.push({sp, v: new V3(Math.cos(a) * Math.cos(b), Math.sin(b) + .5, Math.sin(a) * Math.cos(b)).multiplyScalar(.7 + Math.random() * .8), age: 0}); } SPARK.push(...out); }
    const SPARK = [];
    function tick(t, dt){
      for(const e of EMIT){ if(!e.on) continue; e.acc += dt * e.rate; while(e.acc >= 1){ e.acc -= 1; spawn(e); } }
      for(const p of POOL){ if(!p.live) continue; p.age += dt; const u = p.age / p.life; if(u >= 1){ p.live = false; p.sp.visible = false; continue; }
        p.sp.position.x += p.vx * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt; p.vy *= (1 - dt * .25); const s = p.s0 * (1 + u * p.e.grow); p.sp.scale.set(s, s, 1); p.sp.material.rotation = p.rot + u * .8; p.sp.material.opacity = p.e.alpha * Math.min(1, u * 5) * (1 - u) * (1 - u) * 1.6; }
      for(const f of FL){ if(f.k <= .01) continue; const k = 1 + .16 * Math.sin(t * 9 + f.ph) * Math.sin(t * 5.3 + f.ph * 2.1); f.m.scale.y = .15 * f.s * k; f.m.position.x = f.at.x + .008 * Math.sin(t * 6.1 + f.ph); f.gl.material.opacity = .85 * f.k * (.86 + .14 * Math.sin(t * 11 + f.ph * 3)); }
      for(let i = SPARK.length - 1; i >= 0; i--){ const s = SPARK[i]; s.age += dt; const u = s.age / .9; if(u >= 1){ root.remove(s.sp); s.sp.material.dispose(); SPARK.splice(i, 1); continue; } s.sp.position.addScaledVector(s.v, dt); s.v.y -= dt * 1.2; s.sp.material.opacity = .9 * (1 - u); s.sp.scale.setScalar(.1 + .16 * u); } }
    function active(){ return SPARK.length > 0 || POOL.some(p => p.live) || FL.some(f => f.k > .01); }

    return {root, std, metal, mesh, lathe, grp, lin, canvasTex, setLift, bag, box, crate, tag, tagTex, bunting, runner, setting, pumpkin, leaf, can, bottle, sun, grate, DISH, DECOY, emitter, burst, flame, sparkle, tick, active, HAND};
  };
})();
