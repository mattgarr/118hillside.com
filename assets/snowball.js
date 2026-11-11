/* Snowball: the owner's black shorthair with yellow eyes, drawn as one shared SVG so every game uses the same cat.
   SNOWBALL.svg({pose, wear, glow, id}) -> '<svg ...>' string. Poses: 'sit' (three-quarter, sitting), 'peek' (head and paws over an edge).
   SNOWBALL.g(...) -> the same drawing as a <g> (viewBox units 0..400 x 0..470) for embedding in another SVG. */
(function(){
  'use strict';
  const f = n => Math.round(n * 10) / 10;
  const rng = seed => { let s = (Math.abs(seed | 0) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  // Catmull-Rom through points -> smooth closed (or open) cubic path
  function smooth(pts, closed){ const n = pts.length, P = i => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]; let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for(let i = 0; i < (closed ? n : n - 1); i++){ const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), t = .18;
      d += ` C${f(p1[0] + (p2[0] - p0[0]) * t)} ${f(p1[1] + (p2[1] - p0[1]) * t)} ${f(p2[0] - (p3[0] - p1[0]) * t)} ${f(p2[1] - (p3[1] - p1[1]) * t)} ${f(p2[0])} ${f(p2[1])}`; }
    return d + (closed ? 'Z' : ''); }
  function resample(pts, step, closed){ const out = [], seq = closed ? pts.concat([pts[0]]) : pts; let carry = 0;
    for(let i = 0; i < seq.length - 1; i++){ const [x0, y0] = seq[i], [x1, y1] = seq[i + 1], L = Math.hypot(x1 - x0, y1 - y0); let t = carry;
      while(t < L){ out.push([x0 + (x1 - x0) * t / L, y0 + (y1 - y0) * t / L, Math.atan2(y1 - y0, x1 - x0)]); t += step; } carry = t - L; }
    return out; }
  // fur along an outline: short strokes leaving the edge outward (breaks the silhouette like real fur), plus a lighter rim on the lit side
  function edgeFur(pts, R, o){ let s = ''; resample(pts, o.step || 3.2, true).forEach(([x, y, a]) => { const nx = Math.sin(a), ny = -Math.cos(a), ln = (o.len || 7) * (.55 + R() * .8), tilt = (R() - .5) * .5 + (o.flow == null ? .85 : o.flow);
      const ex = x + (nx * Math.cos(tilt) - ny * Math.sin(tilt)) * ln * (o.out || 1), ey = y + (ny * Math.cos(tilt) + nx * Math.sin(tilt)) * ln * (o.out || 1);
      s += `<path d="M${f(x - nx * 3)} ${f(y - ny * 3)} Q${f((x + ex) / 2 + (R() - .5) * 2)} ${f((y + ey) / 2 + (R() - .5) * 2)} ${f(ex)} ${f(ey)}"/>`; }); return s; }
  function fillFur(box, inside, dirAt, R, n, len){ let s = ''; for(let i = 0; i < n; i++){ const x = box[0] + R() * (box[2] - box[0]), y = box[1] + R() * (box[3] - box[1]); if(!inside(x, y)) continue;
      const a = dirAt(x, y) + (R() - .5) * .35, l = len * (.6 + R() * .8); s += `<path d="M${f(x)} ${f(y)} q${f(Math.cos(a) * l * .5 + (R() - .5) * 1.5)} ${f(Math.sin(a) * l * .5)} ${f(Math.cos(a) * l)} ${f(Math.sin(a) * l)}"/>`; } return s; }
  function pip(pts){ return (x, y) => { let c = false; for(let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const [xi, yi] = pts[i], [xj, yj] = pts[j]; if(((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }; }

  // ---------- the sitting pose (three-quarter, head turned toward the viewer) ----------
  const HEAD = [[132, 112], [124, 70], [121, 34], [150, 58], [176, 80], [196, 76], [214, 79], [242, 52], [271, 28], [266, 66], [256, 106], [263, 138], [256, 168], [240, 194], [214, 210], [192, 214], [168, 209], [148, 194], [134, 168], [130, 140]];
  const BODY = [[170, 204], [152, 226], [140, 262], [142, 300], [150, 330], [146, 390], [143, 448], [178, 457], [240, 459], [298, 457], [334, 442], [350, 404], [350, 344], [336, 284], [312, 234], [284, 196], [258, 168], [222, 204]];
  const TAIL = [[318, 450], [356, 446], [382, 424], [390, 392], [382, 362], [372, 352], [366, 362], [374, 390], [366, 416], [346, 432], [312, 438]];
  const EAR_L = [[134, 104], [128, 72], [130, 46], [148, 64], [166, 82]], EAR_R = [[226, 82], [244, 62], [263, 42], [258, 76], [252, 102]];
  function sitG(o){ o = o || {}; const id = o.id || ('sb' + Math.floor(Math.random() * 1e6)), R = rng(o.seed || 7), glow = !!o.glow;
    const furC = '#2b3242', furHi = '#4a5670', rimC = o.rim || '#7d8db0';
    let g = `<defs>
      <radialGradient id="${id}b" cx=".42" cy=".3" r=".8"><stop offset="0" stop-color="#23262f"/><stop offset=".55" stop-color="#15171d"/><stop offset="1" stop-color="#0a0b0e"/></radialGradient>
      <radialGradient id="${id}h" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#262a34"/><stop offset=".6" stop-color="#14161c"/><stop offset="1" stop-color="#0b0c0f"/></radialGradient>
      <radialGradient id="${id}e" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#fff3a0"/><stop offset=".45" stop-color="#f3c93a"/><stop offset=".85" stop-color="#c88a12"/><stop offset="1" stop-color="#6e4a08"/></radialGradient>
      <radialGradient id="${id}g"><stop offset="0" stop-color="#ffe46b" stop-opacity=".75"/><stop offset="1" stop-color="#ffe46b" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}r" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rimC}" stop-opacity=".9"/><stop offset=".55" stop-color="${rimC}" stop-opacity=".25"/><stop offset="1" stop-color="${rimC}" stop-opacity="0"/></linearGradient>
      <radialGradient id="${id}s"><stop offset="0" stop-color="#3a4252" stop-opacity=".55"/><stop offset="1" stop-color="#3a4252" stop-opacity="0"/></radialGradient>
      <clipPath id="${id}cb"><path d="${smooth(BODY, true)}"/></clipPath><clipPath id="${id}ch"><path d="${smooth(HEAD, true)}"/></clipPath></defs>`;
    g += `<ellipse cx="236" cy="462" rx="132" ry="11" fill="#000" opacity=".28"/>`;
    // tail (behind the body, wrapping round the front)
    g += `<path d="${smooth(TAIL, true)}" fill="#111318"/><g stroke="#111318" stroke-width="1.2" fill="none" stroke-linecap="round">${edgeFur(TAIL, R, {len: 3.2, step: 2.4})}</g><path d="${smooth([[356, 446], [382, 424], [390, 392], [382, 362]], false)}" stroke="url(#${id}r)" stroke-width="2.4" fill="none" opacity=".7"/>`;
    // body
    g += `<path d="${smooth(BODY, true)}" fill="url(#${id}b)"/>`;
    g += `<g clip-path="url(#${id}cb)"><ellipse cx="312" cy="300" rx="70" ry="120" fill="url(#${id}s)"/><ellipse cx="322" cy="392" rx="54" ry="66" fill="url(#${id}s)"/><ellipse cx="186" cy="236" rx="46" ry="34" fill="url(#${id}s)" opacity=".8"/><path d="M190 300 C192 360 194 420 196 456" stroke="#050608" stroke-width="6" fill="none" opacity=".6" stroke-linecap="round"/>` +
      `<g stroke="${furC}" stroke-width="1" fill="none" stroke-linecap="round" opacity=".38">${fillFur([130, 196, 356, 460], pip(BODY), (x, y) => Math.PI / 2 + (x - 240) / 500, R, 650, 7)}</g>` +
      `<g stroke="${furHi}" stroke-width=".8" fill="none" stroke-linecap="round" opacity=".35">${fillFur([280, 200, 356, 440], pip(BODY), () => Math.PI / 2 - .3, R, 140, 6)}</g>` +
      `<path d="M268 304 C326 310 346 396 314 452" stroke="#2c323f" stroke-width="7" fill="none" opacity=".35" stroke-linecap="round"/></g>`;
    g += `<g stroke="#121419" stroke-width="1" fill="none" stroke-linecap="round" opacity=".8">${edgeFur(BODY, R, {len: 2.4, step: 2.6})}</g>`;
    // front legs and paws
    g += `<path d="M148 300 C144 360 146 420 147 450 L178 452 C177 420 177 362 180 308Z" fill="#1a1c23"/><path d="M180 306 C178 362 178 420 178 451" stroke="#363d4c" stroke-width="1.6" fill="none" opacity=".7"/>` +
      `<path d="M236 330 C238 380 240 420 239 454" stroke="#2c3240" stroke-width="1.4" fill="none" opacity=".55"/>` +
      `<g stroke="#262b36" stroke-width=".9" opacity=".45" fill="none">${[0, 1, 2, 3, 4, 5, 6, 7].map(k => `<path d="M${146 + (k % 2) * 16} ${330 + k * 15} q3 6 1 11"/><path d="M${206 + (k % 2) * 14} ${340 + k * 14} q3 6 1 11"/>`).join('')}</g>`;
    g += `<path d="M138 452 C138 440 150 436 162 437 C174 437 184 442 184 452 C176 458 146 458 138 452Z" fill="#191b21"/><path d="M200 455 C200 443 212 440 222 440 C234 440 244 445 244 455 C236 461 208 461 200 455Z" fill="#1b1d23"/>` + [150, 160, 170].map(x => `<path d="M${x} 446 l1 9" stroke="#07080a" stroke-width="1.4"/>`).join('') + [212, 222, 232].map(x => `<path d="M${x} 449 l1 9" stroke="#07080a" stroke-width="1.4"/>`).join('');
    // tail tip curling over the front paws
    g += `<path d="M300 452 C270 466 222 470 186 466 C164 464 148 458 140 448" stroke="#111318" stroke-width="16" fill="none" stroke-linecap="round"/><path d="M300 450 C270 462 222 466 186 462" stroke="${furC}" stroke-width="1.2" fill="none" opacity=".6" stroke-dasharray="2 5"/>`;
    // collar / scarf
    const w = o.wear;
    if(w && w.startsWith('scarf')){ const c = {scarfRed: ['#b3232c', '#f1ebe0'], scarfBlue: ['#2b58ad', '#f1f4fb'], scarfGreen: ['#285f37', '#e3b545']}[w] || ['#b3232c', '#f1ebe0'];
      g += `<path d="M146 196 C178 222 236 224 266 194 L272 214 C240 248 174 248 140 216Z" fill="${c[0]}"/><path d="M150 208 C184 232 234 232 266 206" stroke="${c[1]}" stroke-width="4" fill="none" stroke-dasharray="10 8"/>` +
        `<path d="M226 226 L248 292 L230 298 L212 232Z" fill="${c[0]}"/><path d="M234 286 L248 281 M231 274 L245 269" stroke="${c[1]}" stroke-width="3.4"/><path d="M233 296 l-2 12 M239 294 l-1 12 M245 291 l0 12" stroke="${c[0]}" stroke-width="2.2"/>`; }
    if(w === 'bell') g += `<path d="M150 200 C182 222 236 222 264 198" stroke="#9e1f28" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="208" cy="224" r="11" fill="#d9b24e"/><circle cx="205" cy="220" r="3.4" fill="#fff5c8" opacity=".8"/><path d="M199 227 L217 227" stroke="#6b5016" stroke-width="1.8"/><circle cx="208" cy="230" r="2" fill="#4a3a10"/>`;
    // head
    g += `<path d="${smooth(EAR_L, false)}Z" fill="#0f1014"/><path d="${smooth(EAR_R, false)}Z" fill="#0f1014"/>`;
    g += `<path d="${smooth(HEAD, true)}" fill="url(#${id}h)"/>`;
    g += `<path d="M140 98 L134 60 L156 80Z" fill="#3a2e36" opacity=".9"/><path d="M234 82 L258 50 L252 92Z" fill="#33282f" opacity=".85"/>` +
      `<g stroke="#8a8f9c" stroke-width=".8" opacity=".55" fill="none">${[[140, 92, 150, 72], [144, 96, 156, 80], [138, 86, 146, 66], [242, 84, 252, 64], [246, 88, 252, 72]].map(([a, b, c, d]) => `<path d="M${a} ${b} L${c} ${d}"/>`).join('')}</g>`;
    g += `<g clip-path="url(#${id}ch)"><ellipse cx="196" cy="184" rx="36" ry="24" fill="#2a2e38" opacity=".75"/><ellipse cx="182" cy="186" rx="16" ry="11" fill="#30353f" opacity=".6"/><ellipse cx="211" cy="186" rx="15" ry="10" fill="#30353f" opacity=".55"/><ellipse cx="166" cy="134" rx="30" ry="20" fill="#08090b" opacity=".55"/><ellipse cx="228" cy="132" rx="27" ry="19" fill="#08090b" opacity=".5"/><ellipse cx="170" cy="104" rx="52" ry="26" fill="#262b36" opacity=".55"/>` +
      `<g stroke="${furC}" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".42">${fillFur([120, 60, 272, 216], pip(HEAD), (x, y) => Math.atan2(y - 172, x - 194), R, 480, 4.5)}</g></g>`;
    g += `<g stroke="#111216" stroke-width="1" fill="none" stroke-linecap="round" opacity=".85">${edgeFur(HEAD.slice(10, 20), R, {len: 2.8, step: 2.6, flow: 1.1})}</g>`;
    // rim light along the back of the head, ear and back (light from upper right)
    g += `<path d="${smooth([[242, 52], [271, 28], [266, 66], [258, 106], [268, 138]], false)}" stroke="url(#${id}r)" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>` +
      `<path d="${smooth([[262, 178], [296, 206], [326, 252], [346, 314], [354, 372], [348, 418]], false)}" stroke="url(#${id}r)" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".75"/>` +
      `<path d="${smooth([[124, 70], [121, 34], [150, 58]], false)}" stroke="${rimC}" stroke-width="1.6" fill="none" opacity=".35"/>`;
    // eyes
    const eye = (cx, cy, w, h, tilt, pupil) => `<g transform="translate(${cx} ${cy}) rotate(${tilt})">` +
      `<path d="M${-w} 2 C${-w * .6} ${-h * 1.05} ${w * .6} ${-h * 1.05} ${w} -2 C${w * .55} ${h * .95} ${-w * .55} ${h * .95} ${-w} 2Z" fill="#050506"/>` +
      `<path d="M${-w * .92} 2 C${-w * .55} ${-h * .9} ${w * .55} ${-h * .9} ${w * .92} -2 C${w * .5} ${h * .82} ${-w * .5} ${h * .82} ${-w * .92} 2Z" fill="url(#${id}e)"/>` +
      `<path d="M${-w * .92} 2 C${-w * .55} ${-h * .9} ${w * .55} ${-h * .9} ${w * .92} -2" stroke="#3c2a06" stroke-width="3" fill="none" opacity=".55"/>` +
      `<ellipse cx="${pupil}" cy="0" rx="${f(w * .14)}" ry="${f(h * .78)}" fill="#050505"/>` +
      `<ellipse cx="${f(pupil + w * .3)}" cy="${f(-h * .38)}" rx="${f(w * .14)}" ry="${f(h * .17)}" fill="#fff" opacity=".92"/><circle cx="${f(pupil - w * .35)}" cy="${f(h * .3)}" r="${f(w * .06)}" fill="#fff" opacity=".45"/></g>`;
    if(glow) g += `<circle cx="167" cy="138" r="38" fill="url(#${id}g)"/><circle cx="228" cy="136" r="34" fill="url(#${id}g)"/>`;
    g += `<g class="sbEyes">${eye(167, 138, 19, 14, -9, 1)}${eye(228, 136, 17, 13, 8, -1)}</g>`;
    // nose, mouth, whisker pads, whiskers
    g += `<path d="M186 166 C192 163 202 163 207 166 C205 172 200 176 197 178 C193 176 188 172 186 166Z" fill="#2a2228"/><path d="M190 167 C194 166 199 166 203 167" stroke="#5a4d55" stroke-width="1.4" fill="none"/>` +
      `<path d="M197 178 L197 186 M197 186 C192 192 184 192 180 188 M197 186 C202 192 210 192 214 188" stroke="#0a0a0c" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    [[178, 184], [172, 180], [184, 190], [214, 184], [220, 180], [210, 190]].forEach(([x, y]) => { g += `<circle cx="${x}" cy="${y}" r="1.3" fill="#3a3f4c"/>`; });
    g += `<g stroke="#c9ccd4" stroke-width="1" fill="none" stroke-linecap="round" opacity=".7">` +
      [[176, 182, 108, 168, 96], [176, 186, 104, 186, 92], [178, 190, 112, 204, 100], [218, 182, 284, 166, 296], [218, 186, 290, 184, 302], [216, 190, 282, 202, 294]].map(([x, y, cx, cy, ex]) => `<path d="M${x} ${y} Q${(x + cx) / 2} ${cy - 4} ${ex} ${cy + 2}"/>`).join('') + `</g>`;
    g += `<g stroke="#c9ccd4" stroke-width=".8" opacity=".5" fill="none"><path d="M148 116 q8 -10 18 -12"/><path d="M228 112 q10 -8 20 -6"/></g>`;   // brow whiskers
    return g; }
  // ---------- peeking over an edge (box, sill): head and front paws ----------
  function peekG(o){ o = o || {}; const id = o.id || ('sp' + Math.floor(Math.random() * 1e6));
    // reuse the sitting head, shifted down, with two paws on the edge at y=300
    let g = `<g transform="translate(0 70)">` + sitG(Object.assign({}, o, {id})).replace(/<ellipse cx="236" cy="462"[^>]*>/, '') + `</g>`;
    return g; }
  function g(o){ o = o || {}; return o.pose === 'peek' ? peekG(o) : sitG(o); }
  function svg(o){ o = o || {}; const vb = o.pose === 'peek' ? '100 60 220 260' : '96 18 304 462'; return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${g(o)}</svg>`; }
  window.SNOWBALL = {svg, g, viewBox: {sit: [96, 18, 304, 462]}};
})();
