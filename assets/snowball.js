/* Snowball: the house cat, an orange tabby with a cream bib and amber eyes, drawn as one shared SVG so every game uses the same cat.
   SNOWBALL.svg({pose, wear, bell, glow, id, eyes, seed, rim}) -> '<svg ...>' string (eyes: 'closed' for a blink frame). Poses: 'sit' (three-quarter, sitting), 'peek' (head and shoulders, cropped for a box or a sill).
   SNOWBALL.g(...) -> the same drawing as a <g> (viewBox units 0..400 x 0..470) for embedding in another SVG.
   wear: 'scarfRed' | 'scarfBlue' | 'scarfGreen' | 'bell' (red collar with a bell); bell: true hangs the bell on whatever he is wearing. glow: true lifts the eyes for night scenes. */
(function(){
  'use strict';
  const f = n => Math.round(n * 10) / 10;
  const rng = seed => { let s = (Math.abs(seed | 0) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  // Catmull-Rom through points -> smooth closed (or open) cubic path
  function smooth(pts, closed){ const n = pts.length, P = i => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]; let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for(let i = 0; i < (closed ? n : n - 1); i++){ const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), t = .18;
      d += ` C${f(p1[0] + (p2[0] - p0[0]) * t)} ${f(p1[1] + (p2[1] - p0[1]) * t)} ${f(p2[0] - (p3[0] - p1[0]) * t)} ${f(p2[1] - (p3[1] - p1[1]) * t)} ${f(p2[0])} ${f(p2[1])}`; }
    return d + (closed ? 'Z' : ''); }
  // points along a Catmull-Rom spline through pts, each with its heading: [x, y, angle]
  function spline(pts, n){ const m = pts.length - 1, P = j => pts[Math.max(0, Math.min(m, j))], out = [];
    for(let i = 0; i <= n; i++){ const u = i / n * m, k = Math.min(m - 1, Math.floor(u)), t = u - k, a = P(k - 1), b = P(k), c = P(k + 1), d = P(k + 2);
      const q = j => .5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t * t * t); out.push([q(0), q(1), 0]); }
    out.forEach((p, i) => { const a = out[Math.max(0, i - 1)], b = out[Math.min(n, i + 1)]; p[2] = Math.atan2(b[1] - a[1], b[0] - a[0]); }); return out; }
  // a closed shape around a centreline, half-width hw(t) for t = 0..1 along it: stripes, the tail
  function ribbon(pts, hw, n){ const s = spline(pts, n || 12), A = [], B = [];
    s.forEach(([x, y, a], i) => { const w = Math.max(.05, hw(i / (s.length - 1))), nx = -Math.sin(a), ny = Math.cos(a); A.push([x + nx * w, y + ny * w]); B.unshift([x - nx * w, y - ny * w]); }); return smooth(A.concat(B), true); }
  const lens = w => t => w * .5 * Math.pow(Math.sin(Math.PI * t), .55);            // pointed at both ends
  const dart = w => t => w * .5 * Math.pow(1 - t, .6) * Math.min(1, .55 + t * 3);  // starts broad (at the edge of the cat), ends in a point
  const bar = w => t => w * .5 * (.72 + .28 * Math.sin(Math.PI * t));              // a band right across a limb
  function pip(pts){ return (x, y) => { let c = false; for(let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const [xi, yi] = pts[i], [xj, yj] = pts[j]; if(((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }; }
  // fine fur: n short strokes inside a shape, following dirAt(x, y); one path, so the drawing stays light in the DOM
  function fur(box, inside, dirAt, R, n, len){ let d = ''; for(let i = 0; i < n; i++){ const x = box[0] + R() * (box[2] - box[0]), y = box[1] + R() * (box[3] - box[1]); if(!inside(x, y)) continue;
      const a = dirAt(x, y) + (R() - .5) * .35, l = len * (.6 + R() * .8); d += `M${f(x)} ${f(y)}q${f(Math.cos(a) * l * .5 + (R() - .5) * 1.5)} ${f(Math.sin(a) * l * .5)} ${f(Math.cos(a) * l)} ${f(Math.sin(a) * l)}`; } return d; }
  // hairs across a closed outline: each starts just inside the edge and lies the way the coat lies (o.flow -> [fx, fy]), lifted just enough to break the silhouette. o.len may be a function of (x, y); 0 leaves that stretch clean
  function hairs(pts, R, o){ let ar = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; ar += p[0] * q[1] - q[0] * p[1]; }); const sg = ar > 0 ? 1 : -1, step = o.step || 2.4, lift = o.lift == null ? .4 : o.lift, ins = o.inset == null ? 3 : o.inset; let d = '', carry = 0;
    for(let i = 0; i < pts.length; i++){ const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], L = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0), nx = Math.sin(a) * sg, ny = -Math.cos(a) * sg; let t = carry;
      for(; t < L; t += step * (.5 + R())){ const x = x0 + (x1 - x0) * t / L, y = y0 + (y1 - y0) * t / L, L0 = typeof o.len === 'function' ? o.len(x, y) : o.len, ln = L0 * (.4 + R() * .9), j = (R() - .5) * .5; if(!(L0 > 0) || R() < .15) continue;
        const fl = typeof o.flow === 'function' ? o.flow(x, y) : (o.flow || [0, 1]); let dx = fl[0] + nx * lift, dy = fl[1] + ny * lift; const dn = dx * nx + dy * ny; if(dn < lift){ dx += nx * (lift - dn); dy += ny * (lift - dn); }
        const m = Math.hypot(dx, dy) || 1, ux = (dx * Math.cos(j) - dy * Math.sin(j)) / m, uy = (dx * Math.sin(j) + dy * Math.cos(j)) / m, sx = x - nx * ins * .5 - ux * ins, sy = y - ny * ins * .5 - uy * ins, ex = x + ux * ln, ey = y + uy * ln;
        d += `M${f(sx)} ${f(sy)}Q${f((sx + ex) / 2 + nx * ln * .14)} ${f((sy + ey) / 2 + ny * ln * .14)} ${f(ex)} ${f(ey)}`; } carry = t - L; }
    return d; }
  // tufts leaving a line: [x, y, dx, dy] each, slightly curved
  const tufts = list => list.map(([x, y, dx, dy]) => `M${x} ${y}q${f(dx * .6)} ${f(dy * .35)} ${dx} ${dy}`).join('');

  // ---------- his coat ----------
  const C = {base: '#e58f3a', lite: '#f8bc6c', deep: '#c0621d', stripe: '#a64c15', edge: '#7a3b11', line: '#3d1c08', cream: '#fff5e4', creamSh: '#ecd0a8', nose: '#de8672', noseD: '#9d4a3a'};

  // ---------- the sitting pose (three-quarter, head turned toward the viewer) ----------
  const HEAD = [[134, 114], [127, 74], [125, 32], [155, 58], [179, 78], [199, 74], [219, 78], [245, 54], [273, 30], [267, 70], [259, 110], [268, 140], [267, 166], [256, 188], [238, 204], [214, 214], [193, 216], [170, 212], [150, 200], [137, 182], [129, 160], [129, 136]];
  const BODY = [[170, 204], [152, 226], [141, 262], [143, 300], [150, 330], [146, 390], [143, 448], [178, 457], [240, 459], [298, 457], [334, 442], [350, 404], [350, 344], [336, 284], [312, 234], [284, 196], [258, 168], [222, 204]];
  const TAIL = [[290, 444], [330, 447], [360, 436], [378, 414], [383, 386], [376, 362], [368, 350]];
  const BIB = [[164, 204], [153, 222], [151, 246], [156, 272], [165, 296], [177, 316], [189, 329], [199, 332], [209, 324], [221, 305], [231, 280], [238, 254], [240, 228], [234, 206], [198, 198]];
  function sitG(o){ o = o || {}; const id = o.id || ('sb' + Math.floor(Math.random() * 1e6)), R = rng(o.seed || 7), glow = !!o.glow, rimC = o.rim || '#ffe9c2', u = k => `url(#${id}${k})`;
    const tailHW = t => (13.5 - 4.5 * t) * (t > .9 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - .9) / .1, 2))) : 1), tailD = ribbon(TAIL, tailHW, 30), tailS = spline(TAIL, 40), headD = smooth(HEAD, true), bodyD = smooth(BODY, true), bibD = smooth(BIB, true);
    const tailO = tailS.map(([x, y, a], i) => [x - Math.sin(a) * tailHW(i / 40), y + Math.cos(a) * tailHW(i / 40)]).concat(tailS.slice().reverse().map(([x, y, a], i) => [x + Math.sin(a) * tailHW(1 - i / 40), y - Math.cos(a) * tailHW(1 - i / 40)]));
    // a furred shape: the clean silhouette, a slightly displaced copy so the edge is never a hard line, and (after its insides are painted) hairs across the edge
    const soft = (d, fill) => `<path d="${d}" fill="${fill}"/><path d="${d}" fill="${fill}" filter="${u('fz')}"/>`;
    let g = `<defs>
      <radialGradient id="${id}b" cx=".64" cy=".26" r=".9"><stop offset="0" stop-color="#f7b560"/><stop offset=".45" stop-color="${C.base}"/><stop offset="1" stop-color="#c4661f"/></radialGradient>
      <radialGradient id="${id}h" cx=".56" cy=".3" r=".8"><stop offset="0" stop-color="#f9bd6c"/><stop offset=".55" stop-color="#e8933d"/><stop offset="1" stop-color="#cb6e23"/></radialGradient>
      <radialGradient id="${id}e" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#dfe27c"/><stop offset=".26" stop-color="#f6d443"/><stop offset=".58" stop-color="#f2a926"/><stop offset=".86" stop-color="#c8751a"/><stop offset="1" stop-color="#6f3a0c"/></radialGradient>
      <radialGradient id="${id}g"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".5"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}ie" cx=".45" cy=".8" r=".85"><stop offset="0" stop-color="#b8705c"/><stop offset=".45" stop-color="#e9a892"/><stop offset="1" stop-color="#f6cdb6"/></radialGradient>
      <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#f4e0c2"/></linearGradient>
      <linearGradient id="${id}r" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rimC}" stop-opacity=".95"/><stop offset=".6" stop-color="${rimC}" stop-opacity=".25"/><stop offset="1" stop-color="${rimC}" stop-opacity="0"/></linearGradient>
      <filter id="${id}fz" filterUnits="userSpaceOnUse" x="40" y="0" width="380" height="490"><feTurbulence type="fractalNoise" baseFrequency=".5 .4" numOctaves="2" seed="5" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="4.5" xChannelSelector="R" yChannelSelector="G"/></filter>
      <filter id="${id}bl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="${id}bm" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4.5"/></filter>
      <filter id="${id}bs" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>
      <filter id="${id}sf" filterUnits="userSpaceOnUse" x="40" y="0" width="380" height="490"><feGaussianBlur stdDeviation="1.1"/></filter>
      <clipPath id="${id}cb"><path d="${bodyD}"/></clipPath><clipPath id="${id}ch"><path d="${headD}"/></clipPath><clipPath id="${id}ct"><path d="${tailD}"/></clipPath><clipPath id="${id}ci"><path d="${bibD}"/></clipPath></defs>`;
    g += `<ellipse cx="240" cy="462" rx="128" ry="10" fill="#1d0f05" opacity=".28" filter="${u('bs')}"/>`;
    const hair = (d, c, w, op) => `<path d="${d}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"${op ? ` opacity="${op}"` : ''}/>`;
    const coat = (pts, o) => hair(hairs(pts, R, o), '#c36d25', 1, .9) + hair(hairs(pts, R, o), '#f0a654', .9, .9);   // two passes of edge hair: the coat's shade and its light

    // tail: ringed, darker toward the tip, curling up behind him
    const ring = t => { const [x, y, a] = tailS[Math.round(t * 40)], w = tailHW(t) + 4, nx = -Math.sin(a), ny = Math.cos(a), bx = Math.cos(a) * 3.5, by = Math.sin(a) * 3.5; return ribbon([[x + nx * w, y + ny * w], [x + bx, y + by], [x - nx * w, y - ny * w]], bar(8), 6); };
    g += soft(tailD, '#e08a36') + `<g clip-path="${u('ct')}"><path d="${tailD}" fill="none" stroke="#a9541a" stroke-width="9" opacity=".45" filter="${u('bs')}"/>` +
      `<path d="${smooth(tailS.slice(8).map(([x, y, a]) => [x + Math.sin(a) * 5, y - Math.cos(a) * 5]), false)}" stroke="#f9c074" stroke-width="7" fill="none" opacity=".6" filter="${u('bs')}"/>` +
      `<g fill="${C.stripe}" opacity=".85" filter="${u('sf')}">${[.3, .43, .56, .68, .79].map(t => `<path d="${ring(t)}"/>`).join('')}<circle cx="${f(tailS[40][0])}" cy="${f(tailS[40][1])}" r="14"/></g></g>` +
      coat(tailO, {step: 2.6, len: (x, y) => x > 338 ? 4.5 : 0, lift: .3, flow: (x, y) => { let b = tailS[0], bd = 1e9; tailS.forEach(p => { const dd = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y); if(dd < bd){ bd = dd; b = p; } }); return [Math.cos(b[2]), Math.sin(b[2])]; }});

    // body: inside the silhouette, the form light, the legs, the stripes and the cream bib
    const S = (pts, w, kind) => `<path d="${ribbon(pts, (kind || dart)(w))}"/>`;
    g += soft(bodyD, u('b')) + `<g clip-path="${u('cb')}">` +
      // form: a soft turn into shade at the edge, lit flank and haunch, shade under the chin, on the far side and at the floor
      `<path d="${bodyD}" fill="none" stroke="#a04d16" stroke-width="16" opacity=".45" filter="${u('bm')}"/>` +
      `<g filter="${u('bl')}"><ellipse cx="316" cy="290" rx="38" ry="100" fill="#fbc67c" opacity=".55"/><ellipse cx="310" cy="384" rx="40" ry="56" fill="#f9bf72" opacity=".6"/><ellipse cx="200" cy="224" rx="74" ry="20" fill="#8d4310" opacity=".5"/><ellipse cx="240" cy="470" rx="120" ry="18" fill="#8d4310" opacity=".5"/><ellipse cx="258" cy="400" rx="16" ry="60" fill="#9a4a16" opacity=".5"/></g>` +
      // the two front legs, the gap between them, the fold where the haunch meets the belly
      `<path d="M150 300 C145 350 146 410 144 456 L184 456 C182 410 182 356 186 316Z" fill="#ec9c47"/><path d="M203 322 C198 366 197 412 198 458 L242 458 C242 414 242 370 240 334 C232 320 212 316 203 322Z" fill="#ea9843"/>` +
      `<g filter="${u('bs')}"><path d="M185 326 C183 370 183 420 184 458 L199 458 C197 420 197 372 201 330Z" fill="#8f4411" opacity=".62"/><path d="M242 340 C244 380 244 420 243 458" stroke="#8f4411" stroke-width="6" fill="none" opacity=".6"/><path d="M296 286 C264 314 248 368 252 446" stroke="#9a4a16" stroke-width="6" fill="none" opacity=".55"/>` +
      `<path d="M156 306 C153 350 153 400 152 440" stroke="#f9c47c" stroke-width="7" fill="none" opacity=".5"/><path d="M230 338 C231 370 231 410 230 440" stroke="#f9c47c" stroke-width="7" fill="none" opacity=".5"/><path d="M146 300 C142 350 142 410 141 456" stroke="#a04d16" stroke-width="5" fill="none" opacity=".4"/></g>` +
      // mackerel stripes: darts from the spine across the flank, arcs round the haunch, bracelets on the legs
      `<g fill="${C.stripe}" opacity=".78" filter="${u('sf')}">` +
      S([[288, 196], [272, 216], [254, 232]], 10) + S([[310, 226], [292, 252], [268, 270]], 11) + S([[330, 264], [310, 292], [284, 308]], 11) + S([[346, 306], [326, 330], [300, 342]], 10) +
      S([[354, 350], [332, 364], [304, 366], [280, 358]], 10) + S([[354, 388], [330, 400], [302, 400], [274, 392]], 10) + S([[346, 424], [324, 432], [298, 432], [272, 424]], 9) +
      S([[138, 256], [152, 260], [166, 270]], 8) + S([[138, 282], [152, 286], [164, 296]], 8) +
      S([[140, 330], [162, 338], [188, 333]], 8, bar) + S([[141, 357], [163, 365], [187, 359]], 7, bar) + S([[141, 382], [162, 389], [186, 384]], 6.5, bar) + S([[141, 405], [162, 411], [186, 407]], 5.5, bar) +
      S([[196, 348], [219, 356], [244, 350]], 8, bar) + S([[195, 373], [219, 381], [244, 375]], 7, bar) + S([[195, 397], [219, 404], [244, 399]], 6.5, bar) + S([[195, 419], [219, 425], [244, 421]], 5.5, bar) + `</g>` +
      // cream: the bib from chin to chest, and socks
      `<path d="${bibD}" fill="${u('c')}" filter="${u('bs')}"/><g clip-path="${u('ci')}"><path d="${bibD}" fill="none" stroke="#e6c79b" stroke-width="14" opacity=".5" filter="${u('bm')}"/><ellipse cx="200" cy="214" rx="56" ry="18" fill="#c99a66" opacity=".55" filter="${u('bm')}"/></g>` +
      `<g filter="${u('bs')}"><ellipse cx="162" cy="452" rx="27" ry="17" fill="${C.cream}"/><ellipse cx="221" cy="455" rx="27" ry="17" fill="${C.cream}"/><ellipse cx="274" cy="457" rx="26" ry="13" fill="${C.cream}"/></g></g>`;
    // fine fur over the body, lighter where the light falls, soft locks down the bib, and hairs across every edge
    g += `<g clip-path="${u('cb')}">` + hair(fur([130, 196, 356, 460], pip(BODY), (x, y) => Math.PI / 2 + (x - 240) / 500, R, 520, 6.5), '#a9541a', .9, .28) + hair(fur([280, 200, 356, 440], pip(BODY), () => Math.PI / 2 - .3, R, 150, 5.5), '#ffdca6', .9, .45) +
      hair(fur([150, 204, 246, 350], pip(BIB), (x, y) => Math.PI / 2 + (x - 198) / 110, R, 170, 9), '#dfbd8f', 1, .6) +
      hair(hairs(BIB, R, {step: 1.7, len: (x, y) => y < 215 ? 0 : 12, lift: .22, flow: (x, y) => [(x - 198) / 260, 1], inset: 5}), '#fff8ea', 1.4, .95) + `</g>` +
      coat(BODY, {step: 2.2, len: (x, y) => (y < 215 || y > 436) ? 0 : 7, lift: .32, flow: [0, 1]});
    // paws: cream mitts with toes
    g += `<g stroke="#b9895a" stroke-width="1.2">${['M252 452 C252 442 265 439 284 440 C302 441 320 446 320 453 C306 460 262 460 252 452Z','M136 452 C136 439 150 434 162 435 C175 435 187 441 187 452 C179 459 144 459 136 452Z', 'M197 455 C197 443 210 438 221 438 C234 438 246 444 246 455 C238 462 205 462 197 455Z'].map(d => `<path d="${d}" fill="${u('c')}"/>`).join('')}</g>` +
      hair([153, 162, 171].map(x => `M${x} 446q1.5 5 .5 9`).join('') + [212, 221, 230].map(x => `M${x} 449q1.5 5 .5 9`).join('') + [264, 273, 282].map(x => `M${x} 448q1.5 5 .5 8`).join(''), '#a97c4e', 1.5) +
      hair(tufts([[142, 440, -3, 5], [150, 437, -2, 5], [160, 436, 0, 5], [170, 437, 2, 5], [180, 440, 3, 5], [203, 443, -3, 5], [211, 440, -2, 5], [221, 439, 0, 5], [231, 440, 2, 5], [240, 443, 3, 5], [260, 443, -3, 4], [270, 440, -1, 5], [280, 439, 0, 5], [290, 440, 1, 6], [300, 441, 1, 6], [309, 443, 2, 6], [317, 446, 2, 5]]), '#dd8a39', 1.4, .9);
    // rim light along the back
    g += `<path d="${smooth([[262, 180], [294, 208], [323, 254], [343, 314], [350, 372], [345, 418]], false)}" stroke="${u('r')}" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".85" filter="${u('bs')}"/>`;

    // collar / scarf
    const w = o.wear;
    if(w && w.startsWith('scarf')){ const c = {scarfRed: ['#b3232c', '#f1ebe0', '#7c141c'], scarfBlue: ['#2b58ad', '#f1f4fb', '#1b3a78'], scarfGreen: ['#285f37', '#e3b545', '#173d22']}[w] || ['#b3232c', '#f1ebe0', '#7c141c'];
      g += `<path d="M226 226 L248 292 L230 298 L212 232Z" fill="${c[0]}" stroke="${c[2]}" stroke-width="1.2"/><path d="M234 286 L248 281 M231 274 L245 269" stroke="${c[1]}" stroke-width="3.4"/><path d="M233 296 l-2 12 M239 294 l-1 12 M245 291 l0 12" stroke="${c[0]}" stroke-width="2.2"/>` +
        `<path d="M146 196 C178 222 236 224 266 194 L272 214 C240 248 174 248 140 216Z" fill="${c[0]}" stroke="${c[2]}" stroke-width="1.2"/><path d="M144 213 C176 242 238 243 270 211" stroke="${c[2]}" stroke-width="5" fill="none" opacity=".45" filter="${u('bs')}"/><path d="M150 208 C184 232 234 232 266 206" stroke="${c[1]}" stroke-width="4" fill="none" stroke-dasharray="10 8"/>`; }
    // bell: true hangs his little gold bell on whatever he is wearing (the scarf, or a thin dark collar); wear: 'bell' is the red collar with the bell
    const bellAt = (x, y) => `<circle cx="${x}" cy="${y}" r="11.5" fill="#e0b84e" stroke="#7a5a14" stroke-width="1.4"/><circle cx="${x - 3}" cy="${y - 4}" r="3.6" fill="#fff7d2" opacity=".9"/><path d="M${x - 9} ${y + 3} L${x + 9} ${y + 3}" stroke="#6b5016" stroke-width="1.8"/><circle cx="${x}" cy="${y + 6}" r="2" fill="#4a3a10"/>`;
    if(o.bell && w !== 'bell') g += `${w ? '' : '<path d="M150 201 C184 223 234 223 264 199" stroke="#1f2a44" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M152 199 C186 220 232 220 262 197" stroke="#52648f" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/>'}${bellAt(204, w ? 236 : 223)}`;
    if(w === 'bell') g += `<path d="M148 200 C182 224 236 224 266 198" stroke="#7c141c" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M149 200 C182 223 236 223 265 198" stroke="#c22a34" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M152 197 C184 218 234 218 262 195" stroke="#f08a8f" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"/>${bellAt(208, 225)}`;

    // head: silhouette (ears included), then inside it the light, the pale spectacles, the tabby M and cheek stripes, the cream muzzle and chin
    const M = (pts, w, kind) => `<path d="${ribbon(pts, (kind || lens)(w), 10)}"/>`;
    g += soft(headD, u('h')) + `<g clip-path="${u('ch')}">` +
      `<path d="${headD}" fill="none" stroke="#a04d16" stroke-width="14" opacity=".42" filter="${u('bm')}"/>` +
      `<g filter="${u('bl')}"><ellipse cx="204" cy="92" rx="50" ry="20" fill="#fdd08a" opacity=".6"/><ellipse cx="250" cy="150" rx="16" ry="34" fill="#fbc67c" opacity=".6"/><ellipse cx="197" cy="224" rx="60" ry="12" fill="#a9541a" opacity=".4"/></g>` +
      `<g filter="${u('bm')}"><ellipse cx="166" cy="137" rx="28" ry="23" fill="#fde2b4" opacity=".75"/><ellipse cx="229" cy="135" rx="26" ry="22" fill="#fde2b4" opacity=".75"/><ellipse cx="197" cy="142" rx="9" ry="22" fill="#f9c47c" opacity=".6"/></g>` +
      `<g fill="${C.stripe}" opacity=".8" filter="${u('sf')}">` +
      M([[171, 117], [168, 102], [174, 87]], 6.5) + M([[175, 88], [186, 99], [197, 111]], 6) + M([[197, 111], [208, 99], [219, 87]], 6) + M([[220, 86], [226, 101], [223, 116]], 6.5) +
      M([[187, 95], [186, 84], [185, 70]], 4.2) + M([[197, 99], [197, 86], [197, 70]], 4.2) + M([[207, 95], [208, 84], [209, 70]], 4.2) +
      M([[150, 115], [140, 114], [130, 120]], 5) + M([[245, 113], [255, 112], [264, 117]], 5) +
      M([[146, 143], [136, 147], [126, 156]], 6, dart) + M([[151, 162], [140, 167], [129, 178]], 5.5) + M([[160, 182], [150, 188], [141, 197]], 4.5) +
      M([[248, 141], [258, 144], [269, 152]], 6, dart) + M([[244, 160], [254, 165], [265, 175]], 5.5) + M([[235, 181], [245, 187], [254, 196]], 4.5) +
      M([[184, 148], [182, 157], [178, 166]], 3.2) + M([[211, 147], [213, 156], [217, 165]], 3.2) + `</g>` +
      `<path d="${smooth([[197, 163], [186, 168], [174, 176], [166, 188], [168, 200], [180, 210], [197, 220], [214, 210], [226, 200], [228, 188], [221, 176], [209, 168]], true)}" fill="${u('c')}" filter="${u('sf')}"/>` +
      `<g filter="${u('bs')}"><path d="M176 203 C186 211 208 211 218 203" stroke="#c9a57c" stroke-width="5" fill="none" opacity=".5"/><ellipse cx="197" cy="182" rx="5" ry="7" fill="#d9b890" opacity=".45"/></g></g>`;
    // ears: warm pink inside with a deep shadow at the base, fine cream tufts across
    g += `<path d="M140 102 C134 84 131 66 132 50 C142 60 154 70 165 82 C156 86 146 94 140 102Z" fill="${u('ie')}"/><path d="M231 83 C242 70 254 56 266 44 C266 62 262 82 256 100 C250 92 240 86 231 83Z" fill="${u('ie')}"/>` +
      hair([[141, 101, 145, 68], [143, 102, 150, 72], [146, 102, 156, 78], [139, 98, 140, 64], [149, 102, 161, 84], [152, 101, 165, 90], [141, 104, 137, 80], [240, 87, 248, 62], [243, 88, 253, 64], [246, 90, 258, 68], [237, 85, 242, 60], [250, 93, 261, 76], [253, 98, 263, 86], [234, 84, 238, 66]].map(([a, b, c, d]) => `M${a} ${b}Q${(a + c) / 2 + 3} ${(b + d) / 2} ${c} ${d}`).join(''), '#fff5e3', 1.1, .9);
    g += `<g clip-path="${u('ch')}">` + hair(fur([124, 56, 272, 218], pip(HEAD), (x, y) => Math.atan2(y - 176, x - 197), R, 380, 5), '#b05a1c', .75, .2) + hair(fur([160, 66, 270, 130], pip(HEAD), (x, y) => Math.atan2(y - 176, x - 197), R, 120, 5), '#ffe0ae', .8, .4) +
      hair(fur([164, 164, 230, 218], (x, y) => Math.hypot((x - 197) / 30, (y - 192) / 24) < 1, (x, y) => Math.atan2(y - 170, x - 197), R, 60, 4), '#e2c59c', .9, .55) + `</g>` +
      coat(HEAD, {step: 2, lift: .34, len: (x, y) => y < 100 ? (x > 172 && x < 226 ? 2.4 : 0) : y > 207 ? 0 : 4 + 5 * Math.min(1, Math.max(0, (y - 112) / 50)), flow: (x, y) => y < 100 ? [(x - 197) / 14, -.5] : [(x - 197) / 170, 1]});
    g += `<path d="${smooth([[244, 58], [268, 38], [262, 70], [254, 110], [262, 140]], false)}" stroke="${u('r')}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".6" filter="${u('bs')}"/>`;

    // eyes: amber to gold, a green-gold ring at the pupil, fine iris rays, a window catchlight; dark liner with the inner corner dipping toward the nose
    const eye = (k, cx, cy, ew, eh, tilt, flip, px) => { const sh = s => `M${f(-ew * s)} ${f(-.1 * eh * s)} C${f(-.62 * ew * s)} ${f(-1.06 * eh * s)} ${f(.5 * ew * s)} ${f(-1.1 * eh * s)} ${f(ew * s)} ${f(.2 * eh * s)} C${f(.52 * ew * s)} ${f(.98 * eh * s)} ${f(-.56 * ew * s)} ${f(.88 * eh * s)} ${f(-ew * s)} ${f(-.1 * eh * s)}Z`;
      let rays = ''; for(let i = 0; i < 26; i++){ const a = i / 26 * Math.PI * 2 + (i % 2) * .08, r0 = eh * .5, r1 = eh * (.98 + (i % 3) * .1); rays += `M${f(px + Math.cos(a) * r0 * .7)} ${f(Math.sin(a) * r0)}L${f(px + Math.cos(a) * r1)} ${f(Math.sin(a) * r1)}`; }
      return `<g transform="translate(${cx} ${cy}) rotate(${tilt}) scale(${flip} 1)"><clipPath id="${id}k${k}"><path d="${sh(1)}"/></clipPath>` +
        `<path d="${sh(1.08)}" fill="${C.line}"/><path d="M${f(-ew * 1.04)} ${f(-.1 * eh)} C${f(-.64 * ew)} ${f(-1.11 * eh)} ${f(.5 * ew)} ${f(-1.15 * eh)} ${f(ew * 1.03)} ${f(.2 * eh)} l${f(ew * .1)} ${f(eh * .16)}" stroke="${C.line}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="M${f(-ew * .95)} ${f(-.62 * eh)} C${f(-.5 * ew)} ${f(-1.5 * eh)} ${f(.45 * ew)} ${f(-1.5 * eh)} ${f(ew * .98)} ${f(-.4 * eh)}" stroke="#a9541a" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".45"/>` +
        `<g clip-path="${u('k' + k)}"><rect x="${-ew * 1.3}" y="${-eh * 1.3}" width="${ew * 2.6}" height="${eh * 2.6}" fill="#b76a16"/><circle cx="${px}" cy="0" r="${f(Math.max(ew, eh) * 1.12)}" fill="${u('e')}"${glow ? ' style="filter:brightness(1.12) saturate(1.1)"' : ''}/>` +
        `<path d="${rays}" stroke="#8a4c0c" stroke-width=".7" opacity=".38" fill="none"/><ellipse cx="${f(px - ew * .06)}" cy="${f(eh * .5)}" rx="${f(ew * .55)}" ry="${f(eh * .34)}" fill="#fff3a6" opacity=".42" filter="${u('bs')}"/>` +
        `<path d="${sh(1)}" fill="none" stroke="#6b3508" stroke-width="5" opacity=".55" filter="${u('bs')}"/>` +
        `<ellipse cx="${px}" cy="0" rx="${f(ew * .32)}" ry="${f(eh * .84)}" fill="#0b0705"/>` +
        `<ellipse cx="0" cy="${f(-eh * 1.2)}" rx="${f(ew * 1.3)}" ry="${f(eh * .78)}" fill="#2b1203" opacity=".5" filter="${u('bs')}"/></g>` +
        `<ellipse cx="${f(px + ew * .34 * flip)}" cy="${f(-eh * .4)}" rx="${f(ew * .24)}" ry="${f(eh * .22)}" transform="rotate(${-24 * flip} ${f(px + ew * .34 * flip)} ${f(-eh * .4)})" fill="#fff" opacity=".97"/>` +
        `<circle cx="${f(px - ew * .36 * flip)}" cy="${f(eh * .44)}" r="${f(ew * .085)}" fill="#fff" opacity=".7"/></g>`; };
    if(glow && o.eyes !== 'closed') g += `<circle cx="166" cy="136" r="34" fill="${u('g')}"/><circle cx="229" cy="134" r="31" fill="${u('g')}"/>`;
    // eyes: 'closed' draws shut lids instead (a blink frame for animated uses); anything else is the open amber eyes
    const lid = (cx, cy, ew, tilt) => `<g transform="translate(${cx} ${cy}) rotate(${tilt})"><path d="M${-ew} -1 C${f(-ew * .5)} ${f(ew * .4)} ${f(ew * .5)} ${f(ew * .4)} ${ew} -2" stroke="${C.line}" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M${f(-ew * .8)} 6 C${f(-ew * .4)} ${f(ew * .4 + 6)} ${f(ew * .4)} ${f(ew * .4 + 6)} ${f(ew * .8)} 5" stroke="#fff1d6" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/></g>`;
    if(o.eyes === 'closed') g += `<g class="sbEyes">${lid(166, 138, 21, -4)}${lid(229, 136, 19, 4)}</g>`;
    else g += `<g class="sbEyes">${eye(1, 166, 136, 23, 19.5, 2, 1, 1)}${eye(2, 229, 134, 21, 18.5, -2, -1, 1)}</g>`;

    // nose, mouth, whisker pads, whiskers
    g += `<path d="M184.5 164 C191 160.5 203 160.5 209.5 164 C208 171 202 177 197 179.5 C192 177 186 171 184.5 164Z" fill="${C.nose}" stroke="${C.noseD}" stroke-width="1.3" stroke-linejoin="round"/><path d="M188.5 165.5 C194 163.5 200 163.5 205.5 165.5" stroke="#f7c0b0" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".9"/><path d="M190 171 q2 2 4 1 M204 171 q-2 2 -4 1" stroke="${C.noseD}" stroke-width="1.1" fill="none" stroke-linecap="round"/>` +
      `<path d="M197 180 L197 187 M197 187 C192 194 183 194 178 188 M197 187 C202 194 211 194 216 188" stroke="#5a2a14" stroke-width="2.1" fill="none" stroke-linecap="round"/>`;
    g += `<g fill="#b9763e">${[[178, 184], [172, 181], [184, 190.5], [216, 184], [222, 181], [210, 190.5], [175, 191], [219, 191]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2"/>`).join('')}</g>`;
    const wh = [[176, 183, 104, 168, 86], [176, 187, 100, 188, 82], [178, 191, 108, 208, 92], [174, 189, 112, 198, 98], [219, 183, 290, 166, 308], [219, 187, 294, 186, 312], [217, 191, 286, 206, 302], [221, 189, 288, 196, 304]].map(([x, y, cx, cy, ex]) => `M${x} ${y}Q${(x + cx) / 2} ${cy - 6} ${ex} ${cy + 3}`).join(''), brow = 'M152 112q6 -13 17 -17M157 109q4 -13 13 -19M229 108q9 -12 21 -11M225 107q6 -12 15 -15';
    g += `<g fill="none" stroke-linecap="round"><path d="${wh}" stroke="#4a2a12" stroke-width="2" opacity=".28"/><path d="${wh}" stroke="#fffaf0" stroke-width="1" opacity=".95"/><path d="${brow}" stroke="#4a2a12" stroke-width="1.5" opacity=".2"/><path d="${brow}" stroke="#fffaf0" stroke-width=".8" opacity=".85"/></g>`;
    return g; }
  // ---------- peeking over an edge (box, sill): the same head and shoulders, cropped ----------
  function peekG(o){ o = o || {}; const id = o.id || ('sp' + Math.floor(Math.random() * 1e6)); return `<g transform="translate(0 70)">` + sitG(Object.assign({}, o, {id})) + `</g>`; }
  function g(o){ o = o || {}; return o.pose === 'peek' ? peekG(o) : sitG(o); }
  function svg(o){ o = o || {}; const vb = o.pose === 'peek' ? '100 60 220 260' : '96 18 304 462'; return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${g(o)}</svg>`; }
  window.SNOWBALL = {svg, g, viewBox: {sit: [96, 18, 304, 462]}, v: 37, coat: 'orange tabby'};
})();
