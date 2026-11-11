/* Snowball: the owner's black shorthair with yellow eyes, drawn as one shared SVG so every game uses the same cat.
   SNOWBALL.svg({pose, wear, bell, glow, id, eyes}) -> '<svg ...>' string (eyes: 'closed' for a blink frame). Poses: 'sit' (three-quarter, sitting), 'peek' (head and paws over an edge).
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
  const HEAD = [[134, 114], [127, 74], [125, 32], [155, 58], [179, 78], [199, 74], [219, 78], [245, 54], [273, 30], [267, 70], [259, 110], [268, 140], [267, 166], [256, 188], [238, 204], [214, 214], [193, 216], [170, 212], [150, 200], [137, 182], [129, 160], [129, 136]];
  const BODY = [[170, 204], [152, 226], [141, 262], [143, 300], [150, 330], [146, 390], [143, 448], [178, 457], [240, 459], [298, 457], [334, 442], [350, 404], [350, 344], [336, 284], [312, 234], [284, 196], [258, 168], [222, 204]];
  const TAIL = [[318, 450], [356, 446], [382, 424], [390, 392], [382, 362], [372, 352], [366, 362], [374, 390], [366, 416], [346, 432], [312, 438]];
  const EAR_L = [[136, 106], [130, 74], [131, 44], [150, 64], [168, 84]], EAR_R = [[226, 84], [246, 62], [264, 42], [259, 78], [253, 104]];
  function sitG(o){ o = o || {}; const id = o.id || ('sb' + Math.floor(Math.random() * 1e6)), R = rng(o.seed || 7), glow = !!o.glow, rimC = o.rim || '#8496bd';
    let g = `<defs>
      <radialGradient id="${id}b" cx=".62" cy=".28" r=".85"><stop offset="0" stop-color="#262a34"/><stop offset=".5" stop-color="#16181e"/><stop offset="1" stop-color="#09090c"/></radialGradient>
      <radialGradient id="${id}h" cx=".55" cy=".3" r=".8"><stop offset="0" stop-color="#2a2e39"/><stop offset=".55" stop-color="#15171d"/><stop offset="1" stop-color="#0a0b0e"/></radialGradient>
      <radialGradient id="${id}e" cx=".5" cy=".5" r=".55"><stop offset="0" stop-color="#d9e46a"/><stop offset=".32" stop-color="#f4d23e"/><stop offset=".7" stop-color="#e6a81c"/><stop offset=".92" stop-color="#b6720c"/><stop offset="1" stop-color="#5a3604"/></radialGradient>
      <radialGradient id="${id}g"><stop offset="0" stop-color="#ffe46b" stop-opacity=".7"/><stop offset="1" stop-color="#ffe46b" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}ie" cx=".4" cy=".75" r=".8"><stop offset="0" stop-color="#5a4652"/><stop offset="1" stop-color="#1e171c"/></radialGradient>
      <linearGradient id="${id}r" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rimC}" stop-opacity=".95"/><stop offset=".6" stop-color="${rimC}" stop-opacity=".2"/><stop offset="1" stop-color="${rimC}" stop-opacity="0"/></linearGradient>
      <filter id="${id}fz" filterUnits="userSpaceOnUse" x="40" y="0" width="380" height="490"><feTurbulence type="fractalNoise" baseFrequency=".75 .55" numOctaves="2" seed="5" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>
      <filter id="${id}bl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="${id}bs" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>
      <clipPath id="${id}cb"><path d="${smooth(BODY, true)}"/></clipPath><clipPath id="${id}ch"><path d="${smooth(HEAD, true)}"/></clipPath></defs>`;
    g += `<ellipse cx="240" cy="462" rx="128" ry="10" fill="#000" opacity=".26" filter="url(#${id}bs)"/>`;
    // tail
    g += `<g filter="url(#${id}fz)"><path d="${smooth(TAIL, true)}" fill="#111318"/></g><path d="${smooth([[356, 446], [382, 424], [390, 392], [382, 362]], false)}" stroke="url(#${id}r)" stroke-width="2.4" fill="none" opacity=".75"/>`;
    // body: soft silhouette, form light, fine fur
    g += `<g filter="url(#${id}fz)"><path d="${smooth(BODY, true)}" fill="url(#${id}b)"/></g>`;
    g += `<g clip-path="url(#${id}cb)"><g filter="url(#${id}bl)"><ellipse cx="316" cy="300" rx="44" ry="110" fill="#353c4b" opacity=".55"/><ellipse cx="324" cy="398" rx="40" ry="52" fill="#363d4c" opacity=".45"/><ellipse cx="196" cy="246" rx="40" ry="30" fill="#30364300" /><ellipse cx="194" cy="252" rx="34" ry="24" fill="#323846" opacity=".4"/><path d="M190 312 C192 366 194 420 196 456" stroke="#000" stroke-width="8" opacity=".45"/></g>` +
      `<g stroke="#2e3442" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".32">${fillFur([130, 196, 356, 460], pip(BODY), (x, y) => Math.PI / 2 + (x - 240) / 500, R, 700, 6)}</g>` +
      `<g stroke="#56627c" stroke-width=".8" fill="none" stroke-linecap="round" opacity=".28">${fillFur([290, 210, 356, 440], pip(BODY), () => Math.PI / 2 - .3, R, 170, 5)}</g></g>`;
    // front legs: two soft columns with a dark parting, toes
    g += `<path d="M150 306 C146 362 148 420 149 450 L176 452 C175 420 175 364 178 312Z" fill="#20232b" opacity=".75" filter="url(#${id}bs)"/><path d="M180 312 C178 362 178 420 178 451" stroke="#3a4152" stroke-width="1.6" fill="none" opacity=".6"/>` +
      `<path d="M236 330 C238 380 240 420 239 454" stroke="#2c3240" stroke-width="1.4" fill="none" opacity=".5"/>`;
    g += `<g filter="url(#${id}fz)"><path d="M138 452 C138 440 150 436 162 437 C174 437 184 442 184 452 C176 458 146 458 138 452Z" fill="#1b1d23"/><path d="M200 455 C200 443 212 440 222 440 C234 440 244 445 244 455 C236 461 208 461 200 455Z" fill="#1c1e25"/></g>` +
      [150, 160, 170].map(x => `<path d="M${x} 446 l1 9" stroke="#07080a" stroke-width="1.3"/>`).join('') + [212, 222, 232].map(x => `<path d="M${x} 449 l1 9" stroke="#07080a" stroke-width="1.3"/>`).join('');
    g += `<g filter="url(#${id}fz)"><path d="M300 452 C270 466 222 470 186 466 C164 464 148 458 140 448" stroke="#111318" stroke-width="16" fill="none" stroke-linecap="round"/></g>`;
    // rim light along the back
    g += `<path d="${smooth([[262, 178], [296, 206], [326, 252], [346, 314], [354, 372], [348, 418]], false)}" stroke="url(#${id}r)" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".8" filter="url(#${id}bs)"/>`;
    // collar / scarf
    const w = o.wear;
    if(w && w.startsWith('scarf')){ const c = {scarfRed: ['#b3232c', '#f1ebe0'], scarfBlue: ['#2b58ad', '#f1f4fb'], scarfGreen: ['#285f37', '#e3b545']}[w] || ['#b3232c', '#f1ebe0'];
      g += `<path d="M146 196 C178 222 236 224 266 194 L272 214 C240 248 174 248 140 216Z" fill="${c[0]}"/><path d="M150 208 C184 232 234 232 266 206" stroke="${c[1]}" stroke-width="4" fill="none" stroke-dasharray="10 8"/>` +
        `<path d="M226 226 L248 292 L230 298 L212 232Z" fill="${c[0]}"/><path d="M234 286 L248 281 M231 274 L245 269" stroke="${c[1]}" stroke-width="3.4"/><path d="M233 296 l-2 12 M239 294 l-1 12 M245 291 l0 12" stroke="${c[0]}" stroke-width="2.2"/>`; }
    // bell: true hangs his little gold bell on whatever he is wearing (the scarf, or a thin dark collar); wear: 'bell' is the red collar with the bell
    if(o.bell && w !== 'bell') g += `${w ? '' : '<path d="M152 202 C184 222 234 222 262 200" stroke="#2a2d36" stroke-width="5" fill="none" stroke-linecap="round"/>'}<circle cx="204" cy="${w ? 236 : 222}" r="11" fill="#d9b24e" stroke="#8a6a1c" stroke-width="1"/><circle cx="201" cy="${w ? 232 : 218}" r="3.4" fill="#fff5c8" opacity=".85"/><path d="M195 ${w ? 239 : 225} L213 ${w ? 239 : 225}" stroke="#6b5016" stroke-width="1.8"/><circle cx="204" cy="${w ? 242 : 228}" r="2" fill="#4a3a10"/>`;
    if(w === 'bell') g += `<path d="M150 200 C182 222 236 222 264 198" stroke="#9e1f28" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="208" cy="224" r="11" fill="#d9b24e"/><circle cx="205" cy="220" r="3.4" fill="#fff5c8" opacity=".8"/><path d="M199 227 L217 227" stroke="#6b5016" stroke-width="1.8"/><circle cx="208" cy="230" r="2" fill="#4a3a10"/>`;
    // ears: outer, inner with a warm tone, and pale tufts
    g += `<g filter="url(#${id}fz)"><path d="${smooth(EAR_L, false)}Z" fill="#0f1014"/><path d="${smooth(EAR_R, false)}Z" fill="#0f1014"/></g>`;
    // head
    g += `<g filter="url(#${id}fz)"><path d="${smooth(HEAD, true)}" fill="url(#${id}h)"/></g>`;
    g += `<path d="M142 100 L136 60 L160 82Z" fill="url(#${id}ie)" opacity=".95"/><path d="M234 84 L259 50 L253 94Z" fill="url(#${id}ie)" opacity=".85"/>` +
      `<g stroke="#a7acb8" stroke-width=".8" opacity=".55" fill="none" stroke-linecap="round">${[[141, 96, 148, 74], [145, 98, 156, 80], [139, 90, 144, 70], [148, 100, 160, 86], [242, 86, 250, 66], [246, 90, 254, 72], [240, 82, 246, 64]].map(([a, b, c, d]) => `<path d="M${a} ${b} Q${(a + c) / 2 + 3} ${(b + d) / 2} ${c} ${d}"/>`).join('')}</g>`;
    g += `<g clip-path="url(#${id}ch)"><g filter="url(#${id}bl)"><ellipse cx="200" cy="96" rx="52" ry="24" fill="#30353f" opacity=".55"/><ellipse cx="196" cy="184" rx="34" ry="22" fill="#2b2f39" opacity=".8"/><ellipse cx="166" cy="136" rx="30" ry="20" fill="#040405" opacity=".6"/><ellipse cx="229" cy="134" rx="27" ry="19" fill="#040405" opacity=".55"/><ellipse cx="250" cy="150" rx="18" ry="34" fill="#3a4152" opacity=".45"/></g>` +
      `<ellipse cx="182" cy="188" rx="15" ry="10" fill="#2e333e" opacity=".55" filter="url(#${id}bs)"/><ellipse cx="211" cy="188" rx="14" ry="9.5" fill="#2e333e" opacity=".5" filter="url(#${id}bs)"/>` +
      `<g stroke="#363c49" stroke-width=".85" fill="none" stroke-linecap="round" opacity=".4">${fillFur([124, 56, 272, 218], pip(HEAD), (x, y) => Math.atan2(y - 176, x - 196), R, 520, 4.2)}</g></g>`;
    // cheek ruff: a few soft tufts breaking the jaw line
    g += `<g stroke="#121318" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".9">${[[134, 176, -8, 10], [138, 186, -6, 12], [262, 172, 8, 10], [258, 182, 7, 12], [150, 200, -4, 10], [244, 198, 5, 10]].map(([x, y, dx, dy]) => `<path d="M${x} ${y} q${dx * .6} ${dy * .4} ${dx} ${dy}"/>`).join('')}</g>`;
    g += `<path d="${smooth([[245, 54], [273, 30], [267, 70], [259, 110], [268, 140]], false)}" stroke="url(#${id}r)" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".9" filter="url(#${id}bs)"/>` +
      `<path d="${smooth([[127, 74], [125, 32], [155, 58]], false)}" stroke="${rimC}" stroke-width="1.4" fill="none" opacity=".3"/>`;
    // eyes: amber, green toward the pupil, a window reflection
    const eye = (cx, cy, w, h, tilt, pupil) => `<g transform="translate(${cx} ${cy}) rotate(${tilt})">` +
      `<path d="M${-w * 1.08} 2 C${-w * .6} ${-h * 1.18} ${w * .6} ${-h * 1.18} ${w * 1.08} -2 C${w * .55} ${h * 1.02} ${-w * .55} ${h * 1.02} ${-w * 1.08} 2Z" fill="#030304"/>` +
      `<path d="M${-w * .95} 2 C${-w * .55} ${-h * .95} ${w * .55} ${-h * .95} ${w * .95} -2 C${w * .5} ${h * .86} ${-w * .5} ${h * .86} ${-w * .95} 2Z" fill="url(#${id}e)"/>` +
      `<path d="M${-w * .95} 2 C${-w * .55} ${-h * .95} ${w * .55} ${-h * .95} ${w * .95} -2" stroke="#2a1b04" stroke-width="${f(h * .3)}" fill="none" opacity=".5"/>` +
      `<ellipse cx="${pupil}" cy="0" rx="${f(w * .17)}" ry="${f(h * .8)}" fill="#040404"/>` +
      `<path d="M${f(pupil + w * .12)} ${f(-h * .62)} C${f(pupil + w * .5)} ${f(-h * .66)} ${f(pupil + w * .72)} ${f(-h * .42)} ${f(pupil + w * .74)} ${f(-h * .18)} C${f(pupil + w * .56)} ${f(-h * .4)} ${f(pupil + w * .36)} ${f(-h * .5)} ${f(pupil + w * .12)} ${f(-h * .62)}Z" fill="#fff" opacity=".85"/>` +
      `<circle cx="${f(pupil - w * .38)}" cy="${f(h * .34)}" r="${f(w * .07)}" fill="#fff" opacity=".5"/>` +
      `<path d="M${-w * .7} ${f(h * .78)} C${-w * .3} ${f(h * 1.0)} ${w * .3} ${f(h * 1.0)} ${w * .7} ${f(h * .72)}" stroke="#2c3240" stroke-width="1" fill="none" opacity=".6"/></g>`;
    if(glow && o.eyes !== 'closed') g += `<circle cx="166" cy="136" r="40" fill="url(#${id}g)"/><circle cx="229" cy="134" r="36" fill="url(#${id}g)"/>`;
    // eyes: 'closed' draws shut lids instead (a blink frame for animated uses); anything else is the open amber eyes
    const lid = (cx, cy, w, tilt) => `<g transform="translate(${cx} ${cy}) rotate(${tilt})"><path d="M${-w} -1 C${f(-w * .5)} ${f(w * .4)} ${f(w * .5)} ${f(w * .4)} ${w} -2" stroke="#020203" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M${-w} 2 C${f(-w * .5)} ${f(w * .4 + 3)} ${f(w * .5)} ${f(w * .4 + 3)} ${w} 1" stroke="#4a5266" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".7"/></g>`;
    if(o.eyes === 'closed') g += `<g class="sbEyes">${lid(166, 137, 20, -7)}${lid(229, 135, 18, 6)}</g>`;
    else g += `<g class="sbEyes">${eye(166, 136, 21, 17, -7, 1)}${eye(229, 134, 19, 16, 6, -1)}</g>`;
    // nose, mouth, whisker pads, whiskers
    g += `<path d="M184 165 C191 161 202 161 209 165 C207 172 201 177 197 179 C192 177 186 172 184 165Z" fill="#2a2228"/><path d="M188 166 C194 164 200 164 205 166" stroke="#6a5b64" stroke-width="1.6" fill="none" opacity=".8"/><path d="M197 156 L197 164" stroke="#262b35" stroke-width="5" opacity=".5" filter="url(#${id}bs)"/>` +
      `<path d="M197 179 L197 186 M197 186 C192 192 184 192 180 188 M197 186 C202 192 210 192 214 188" stroke="#060607" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    [[178, 185], [172, 181], [184, 191], [215, 185], [221, 181], [210, 191], [176, 192], [218, 192]].forEach(([x, y]) => { g += `<circle cx="${x}" cy="${y}" r="1.2" fill="#444a57"/>`; });
    g += `<g stroke="#e9ebf0" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".72">` +
      [[176, 183, 104, 168, 86], [176, 187, 100, 188, 82], [178, 191, 108, 208, 92], [174, 189, 112, 198, 98], [219, 183, 290, 166, 308], [219, 187, 294, 186, 312], [217, 191, 286, 206, 302], [221, 189, 288, 196, 304]].map(([x, y, cx, cy, ex]) => `<path d="M${x} ${y} Q${(x + cx) / 2} ${cy - 6} ${ex} ${cy + 3}"/>`).join('') + `</g>`;
    g += `<g stroke="#d8dbe2" stroke-width=".7" opacity=".5" fill="none"><path d="M148 114 q8 -12 20 -14"/><path d="M152 110 q6 -14 16 -18"/><path d="M228 110 q10 -10 22 -8"/></g>`;
    return g; }
  // ---------- peeking over an edge (box, sill): head and front paws ----------
  function peekG(o){ o = o || {}; const id = o.id || ('sp' + Math.floor(Math.random() * 1e6));
    // reuse the sitting head, shifted down, with two paws on the edge at y=300
    let g = `<g transform="translate(0 70)">` + sitG(Object.assign({}, o, {id})).replace(/<ellipse cx="236" cy="462"[^>]*>/, '') + `</g>`;
    return g; }
  function g(o){ o = o || {}; return o.pose === 'peek' ? peekG(o) : sitG(o); }
  function svg(o){ o = o || {}; const vb = o.pose === 'peek' ? '100 60 220 260' : '96 18 304 462'; return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${g(o)}</svg>`; }
  window.SNOWBALL = {svg, g, viewBox: {sit: [96, 18, 304, 462]}, v: 36};
})();
