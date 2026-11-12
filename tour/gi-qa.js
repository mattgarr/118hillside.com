/* gi-r43 QA tools (loaded only with ?gi=...&giqa=1): comparison captures, frame cost, smoothness probes. Not part of the tour. */
(function(){
'use strict';
const GI = window.GI; if(!GI) return;
const QA = window.GIQA = {};
/* a simulated clock that never runs backwards: while a capture runs the page sees QA's own time; afterwards real time carries on from there
   (a clock that jumped back between captures gave the page's eases a negative step and blew its white balance out) */
const real = performance.now.bind(performance), CK = QA.clock = {off: 0, hold: null}; performance.now = () => CK.hold != null ? CK.hold : real() + CK.off;
const tick = () => new Promise(res => { const ch = new MessageChannel(); ch.port1.onmessage = () => res(); ch.port2.postMessage(0); });
QA.VIEWS = {kitchen: {pos: [16, 5, 20.5], at: [9.75, 5, 12.69], stop: 'kitchen'}, great: {pos: [15.2, 5, 17.6], at: [10.78, 5, 26.57], stop: 'great'}, living: {pos: [13, 5, 2.9], at: [5.53, 5, -3.75], stop: 'living'},
  'great-to-kitchen': {pos: [8.5, 5, 33.5], at: [11, 4.2, 12]}, 'kitchen-to-living': {pos: [12.5, 5, 13.5], at: [8, 4.6, 0]}};
/* one view at one time of day, drawn with the tiers asked for ('off' = the page as it is, 'a' = baked probes, 'b' = probes + the traced cache at rest).
   Returns {url: one JPEG, tiles side by side, meta}. A simulated clock drives the page so the meter and the fades settle the same way each time. */
QA.shot = async function(o = {}){ const T = window.__TOUR, H = GI.H, cv = H.canvas, v = typeof o.view === 'string' ? Object.assign({name: o.view}, QA.VIEWS[o.view]) : o.view, tiers = o.tiers || ['off', 'a', 'b'];
  const tw = o.tw || 600, th = o.th || Math.round(tw * cv.height / cv.width), frames = o.frames || 14, dt = o.dt || .3, RT = GI.rt;
  const sh = document.createElement('canvas'); sh.width = tiers.length * tw; sh.height = th; const g = sh.getContext('2d'), meta = [];
  let vt = performance.now(); CK.hold = vt; const adv = ms => { vt += ms; CK.hold = vt; };
  const LM = H.LIGHT && H.LIGHT.meter, slew0 = LM && LM.slew, tau0 = LM && LM.tau, ix = id => T.STOPS.findIndex(s => s.id === id);
  const place = () => { if(v.stop && !o.free){ T.setMode('tour'); T.showStop(ix(v.stop)); T.finish(); } else T.look(v.pos, v.at); };
  try{ for(let f = 0; f < tiers.length; f++){ const tier = tiers[f]; GI.forceOff = tier === 'off'; if(RT) RT.off = tier !== 'b'; GI.snap = true; GI.snapAO = true;
      if(LM){ LM.slew = 50; LM.tau = .12; }
      T.look([v.pos[0] + 30, v.pos[1], v.pos[2]], v.at); T.step(1); place(); if(o.tod && (H.TOD_KEY !== o.tod || f === 0)) H.setTOD(o.tod); if(o.pre) o.pre(H);
      for(let i = 0; i < frames; i++){ adv(dt * 1000); T.step(1); if(i % 2) await tick(); }
      let n = 0; if(tier === 'b' && RT){ const want = o.n || RT.max; if(o.spf) RT.fixed = o.spf; for(let i = 0; i < 900; i++){ adv(33); T.step(1); const c = RT.buf[RT.cur]; n = c ? c.n : 0; if(c && c.n >= want && c.k >= 1) break; if(i % 4 === 3) await tick(); } RT.fixed = 0; }
      if(LM){ LM.slew = slew0; LM.tau = tau0; } adv(33); T.step(1); H.renderFrame(1 / 30);
      g.drawImage(cv, f * tw, 0, tw, th); meta.push({tier, n, expo: +H.renderer.toneMappingExposure.toFixed(4), mul: H.METER ? +H.METER.mul.toFixed(3) : null, st: tier === 'off' ? null : GI.status()}); await tick(); } }
  finally{ CK.off = vt - real(); CK.hold = null; GI.forceOff = false; if(RT){ RT.off = false; RT.fixed = 0; } if(LM){ LM.slew = slew0; LM.tau = tau0; } }
  return {IMG: (v.name || 'view') + '_' + (o.tod || H.TOD_KEY) + (o.tag || ''), url: sh.toDataURL('image/jpeg', o.q || .9), meta: {view: v.name, tod: o.tod, tiers, tw, th, cw: cv.width, ch: cv.height, tiles: meta}}; };
/* frame cost with the flag's work on and off at tour stops (each frame finished on the GPU by a 1-px readback) */
QA.perf = async function(o = {}){ const T = window.__TOUR, H = GI.H, gl = H.renderer.getContext(), px = new Uint8Array(4), ix = id => T.STOPS.findIndex(s => s.id === id), n = o.n || 60, out = [];
  const one = () => { const t0 = performance.now(); T.step(1); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
  for(const st of (o.stops || ['kitchen', 'great', 'living'])){ T.setMode('tour'); T.showStop(ix(st)); T.finish(); if(o.tod && H.TOD_KEY !== o.tod) H.setTOD(o.tod);
    const row = {stop: st, w: H.canvas.width, h: H.canvas.height};
    for(const f of [0, 1, 0, 1]){ GI.forceOff = !f; if(GI.rt) GI.rt.off = true; GI.snap = true; GI.snapAO = true; for(let i = 0; i < 12; i++) one(); const a = [];
      for(let i = 0; i < n; i++){ a.push(one()); if(i % 10 === 9) await tick(); } a.sort((x, y) => x - y);
      (row[f ? 'on' : 'off'] || (row[f ? 'on' : 'off'] = [])).push({med: +a[n >> 1].toFixed(2), p90: +a[Math.floor(n * .9)].toFixed(2)}); row.calls = H.renderer.info.render.calls; }
    out.push(row); }
  GI.forceOff = false; if(GI.rt) GI.rt.off = false; GI.snap = true; return {out, programs: H.renderer.info.programs.length, phone: matchMedia('(pointer:coarse)').matches, dpr: devicePixelRatio, pr: H.renderer.getPixelRatio()}; };
/* the picture's change per small step: the canvas read back at 64x40 after each step of fn(i); returns the mean and largest per-pixel luma change of each step */
QA.steps = async function(n, fn, o = {}){ const T = window.__TOUR, H = GI.H, cv = H.canvas, c = document.createElement('canvas'); c.width = 64; c.height = 40; const g = c.getContext('2d', {willReadFrequently: true});
  let vt = performance.now(); CK.hold = vt; let prev = null; const rows = [];
  try{ for(let i = 0; i < n; i++){ fn(i, H, T); for(let k = 0; k < (o.settle || 1); k++){ vt += 33; CK.hold = vt; T.step(1); } H.renderFrame(1 / 30); g.drawImage(cv, 0, 0, 64, 40); const d = g.getImageData(0, 0, 64, 40).data, L = new Float32Array(2560);
      for(let p = 0; p < 2560; p++) L[p] = .2126 * d[p * 4] + .7152 * d[p * 4 + 1] + .0722 * d[p * 4 + 2];
      if(prev){ let s = 0, m = 0, sg = 0; for(let p = 0; p < 2560; p++){ const e = Math.abs(L[p] - prev[p]); s += e; sg += L[p] - prev[p]; if(e > m) m = e; } rows.push([+(s / 2560).toFixed(3), +m.toFixed(2), +(sg / 2560).toFixed(3)]); } prev = L; if(i % 8 === 7) await tick(); } }
  finally{ CK.off = vt - real(); CK.hold = null; }
  const mean = rows.map(r => r[0]), srt = mean.slice().sort((a, b) => a - b); return {n: rows.length, medMean: srt[srt.length >> 1], maxMean: Math.max(...mean), maxPix: Math.max(...rows.map(r => r[1])), worstAt: mean.indexOf(Math.max(...mean)), rows: o.rows ? rows : undefined}; };
})();
