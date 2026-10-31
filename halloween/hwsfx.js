/*! hwsfx.js - procedural Halloween sound effects, music and radio (Web Audio only).
 *  No audio files, no dependencies, ES5. Exposes window.HWSFX.
 *  Friendly-spooky for ages 5-12. See README.md.
 */
(function (root) {
'use strict';

var AC = root.AudioContext || root.webkitAudioContext || null;
var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext || null;
var VERSION = '2.0.0';

var ctx = null, bus = null, comp = null, shaper = null, master = null, musGain = null;
var muted = false, vol = 0.35, musMuted = false, musVol = 0.2;
var MAXV = 10;                       // simultaneous SFX voices
var voices = [], lastPlay = {}, lastVar = {};
var S = {}, AMB = {}, TRACKS = {}, INS = {};
var amb = {}, wantAmb = {};
var wantMusic = null, curPlayer = null, players = [];
var musicListeners = [];
var userSuspended = false;

/* ---- calibration tables (peak-normalised through the master chain) ---- */
var LV = {"collect":1.202,"boing":1.469,"burp":0.538,"meow":0.505,"kazoo":0.679,"owl":0.408,"creak":1.344,"doorOpen":0.763,"ghostOoo":0.235,"cackle":0.892,"bats":0.513,"bubble":0.612,"win":0.404,"wrong":0.417,"step":1.182,"pumpkinPop":1.235,"thunderSoft":0.278};
var ALV = {"wind":0.393,"cauldronLoop":0.67};
var TLV = {"toccata":0.396,"danseMacabre":0.625,"mountainKing":0.41,"marionette":0.485,"baldMountain":0.532,"musicBoxMaze":0.825,"skeletonGroove":0.246,"midnightTicking":0.496,"hauntedAmbience":0.515};

/* ---- persistence (all guarded) ---- */
function ls(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { root.localStorage.setItem(k, String(v)); } catch (e) {} }
(function () {
  var m = ls('hwsfx.muted'); if (m === '1') { muted = true; }
  var mm = ls('hwsfx.musicMuted'); if (mm === '1') { musMuted = true; }
  var v = parseFloat(ls('hwsfx.vol')); if (v >= 0 && v <= 1) { vol = v; }
  var mv = parseFloat(ls('hwsfx.musicVol')); if (mv >= 0 && mv <= 1) { musVol = mv; }
})();

function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }

/* ---- master chain: bus -> compressor -> soft clip -> master gain -> out ---- */
var SOFTCLIP = (function () {
  try {
    var n = 2049, a = new Float32Array(n), i, x, e;
    for (i = 0; i < n; i++) { x = i / 1024 - 1; e = Math.exp(2 * x); a[i] = (e - 1) / (e + 1); }
    return a;
  } catch (err) { return null; }
})();

function buildChain(c, v, mv) {
  var b = c.createGain(); b.gain.value = 1;
  var cp = c.createDynamicsCompressor();
  cp.threshold.value = -16; cp.knee.value = 20; cp.ratio.value = 5;
  cp.attack.value = 0.004; cp.release.value = 0.2;
  var sh = c.createWaveShaper(); if (SOFTCLIP) { sh.curve = SOFTCLIP; }
  var m = c.createGain(); m.gain.value = v;
  var mus = c.createGain(); mus.gain.value = mv;
  mus.connect(b);
  b.connect(cp); cp.connect(sh); sh.connect(m); m.connect(c.destination);
  return { bus: b, comp: cp, shaper: sh, master: m, mus: mus };
}

/* ---- context lifecycle ---- */
function lazyOk() {
  try { return !!(root.navigator && root.navigator.userActivation && root.navigator.userActivation.hasBeenActive); }
  catch (e) { return false; }
}

function init() {
  if (!AC) { return false; }
  try {
    if (!ctx) {
      ctx = new AC();
      var ch = buildChain(ctx, muted ? 0 : vol, musVol);
      bus = ch.bus; comp = ch.comp; shaper = ch.shaper; master = ch.master; musGain = ch.mus;
      if (root.document && root.document.addEventListener) {
        root.document.addEventListener('visibilitychange', function () {
          if (!ctx) { return; }
          try {
            if (root.document.hidden) {
              if (ctx.state === 'running' && ctx.suspend) { userSuspended = true; ctx.suspend(); }
            } else if (userSuspended) { userSuspended = false; ctx.resume(); }
          } catch (e) {}
        }, false);
      }
    }
    if (ctx.state === 'suspended' && ctx.resume) {
      var p = ctx.resume(); if (p && p.catch) { p.catch(function () {}); }
    }
    var k; for (k in wantAmb) { if (wantAmb[k] && !amb[k]) { startAmb(k); } }
    syncMusic();
    return true;
  } catch (e) { return false; }
}

function setMuted(b) {
  muted = !!b; lsSet('hwsfx.muted', muted ? '1' : '0');
  try { if (master) { master.gain.setTargetAtTime(muted ? 0 : vol, ctx.currentTime, 0.02); } } catch (e) {}
  var k; for (k in amb) { if (muted && amb[k]) { stopAmb(k); } }
  if (!muted) { for (k in wantAmb) { if (wantAmb[k] && !amb[k] && ctx) { startAmb(k); } } }
  syncMusic();
}
function isMuted() { return muted; }
function setVolume(v) {
  v = parseFloat(v); if (!(v >= 0)) { return; }
  vol = clamp(v, 0, 1); lsSet('hwsfx.vol', vol);
  try { if (master && !muted) { master.gain.setTargetAtTime(vol, ctx.currentTime, 0.02); } } catch (e) {}
}
function getVolume() { return vol; }

/* ---- SFX playback ---- */
function play(name, opts) {
  try {
    var fn = S[name];
    if (!fn || muted) { return null; }
    if (!ctx) { if (!lazyOk()) { return null; } init(); }
    if (!ctx) { return null; }
    if (ctx.state === 'suspended' && ctx.resume) { var rp = ctx.resume(); if (rp && rp.catch) { rp.catch(function () {}); } }
    var now = ctx.currentTime, i, keep = [];
    for (i = 0; i < voices.length; i++) { if (voices[i] > now) { keep.push(voices[i]); } }
    voices = keep;
    if (voices.length >= MAXV) { return null; }
    var lp = lastPlay[name];
    if (lp != null && now - lp < 0.035) { return null; }
    lastPlay[name] = now;
    opts = opts || {};
    var v;
    if (typeof opts.variant === 'number') { v = (((opts.variant | 0) % 3) + 3) % 3; }
    else {
      var l = lastVar[name];
      v = (l == null) ? Math.floor(Math.random() * 3) : (l + 1 + Math.floor(Math.random() * 2)) % 3;
    }
    lastVar[name] = v;
    var P = opts.pitch > 0 ? opts.pitch : (1 + (Math.random() - 0.5) * 0.04);
    var vg = ctx.createGain();
    vg.gain.value = (LV[name] || 1) * (opts.volume == null ? 1 : clamp(opts.volume, 0, 2));
    var pan = null;
    if (opts.pan != null && ctx.createStereoPanner) {
      pan = ctx.createStereoPanner(); pan.pan.value = clamp(opts.pan, -1, 1);
      vg.connect(pan); pan.connect(bus);
    } else { vg.connect(bus); }
    var t = now + 0.008;
    var dur = fn(ctx, vg, t, v, opts, P);
    voices.push(t + dur + 0.05);
    setTimeout(function () { try { vg.disconnect(); if (pan) { pan.disconnect(); } } catch (e) {} }, (dur + 0.4) * 1000);
    return { name: name, variant: v, duration: dur };
  } catch (e) { return null; }
}

/* ---- ambient loops ---- */
function startAmb(name) {
  if (!ctx || !AMB[name] || muted) { return; }
  try {
    var ag = ctx.createGain(); ag.gain.value = ALV[name] || 1; ag.connect(bus);
    var h = AMB[name](ctx, ag, ctx.currentTime + 0.02);
    var rec = { h: h, g: ag, timer: null };
    if (h.tick) { rec.timer = setInterval(function () { try { h.tick(ctx.currentTime); } catch (e) {} }, 150); h.tick(ctx.currentTime); }
    amb[name] = rec;
  } catch (e) {}
}
function stopAmb(name) {
  var rec = amb[name]; if (!rec) { return; }
  amb[name] = null;
  try { if (rec.timer) { clearInterval(rec.timer); } rec.h.stop(ctx.currentTime); } catch (e) {}
  setTimeout(function () { try { rec.g.disconnect(); } catch (e) {} }, 3500);
}
function ambient(name, on) {
  if (!AMB[name]) { return false; }
  on = (on === undefined) ? true : !!on;
  wantAmb[name] = on;
  if (on) { if (ctx && !muted) { if (!amb[name]) { startAmb(name); } } }
  else { stopAmb(name); }
  return true;
}

/* =====================================================================
 *  Synthesis kit
 * ===================================================================== */
function G(c, v) { var g = c.createGain(); g.gain.value = v; return g; }
function O(c, type, f) { var o = c.createOscillator(); o.type = type; o.frequency.value = f; return o; }
function F(c, type, f, q) { var b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) { b.Q.value = q; } return b; }
function run(o, t, d) { o.start(t); o.stop(t + d); }
function hw(c) { return c.__hw || (c.__hw = {}); }
function env(g, t, a, pk, d) {
  var p = g.gain; p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(pk, t + a); p.exponentialRampToValueAtTime(0.0001, t + d);
}
function swell(g, t, a, pk, hold, d) {
  var p = g.gain; p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(pk, t + a);
  p.setValueAtTime(pk, t + hold); p.exponentialRampToValueAtTime(0.0001, t + d);
}
function path(p, t, pts, lin) {
  var i; p.setValueAtTime(pts[0][1], t + pts[0][0]);
  for (i = 1; i < pts.length; i++) {
    if (lin) { p.linearRampToValueAtTime(pts[i][1], t + pts[i][0]); }
    else { p.exponentialRampToValueAtTime(pts[i][1], t + pts[i][0]); }
  }
}
function nbuf(c) {
  var h = hw(c);
  if (!h.n) {
    var len = Math.floor(c.sampleRate * 2), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0), i;
    for (i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; }
    h.n = b;
  }
  return h.n;
}
function noise(c, t, d) {
  var s = c.createBufferSource(); s.buffer = nbuf(c); s.loop = true; s.start(t, Math.random() * 1.5); s.stop(t + d); return s;
}
function vib(c, param, t, d, rate, d0, d1) {
  var o = O(c, 'sine', rate), g = G(c, d0);
  g.gain.setValueAtTime(d0, t); g.gain.linearRampToValueAtTime(d1, t + d);
  o.connect(g); g.connect(param); run(o, t, d + 0.05);
}
function bell(c, out, f, t, d, pk) {
  var g = G(c, 0); env(g, t, 0.004, pk, d); g.connect(out);
  var o = O(c, 'sine', f), o2 = O(c, 'sine', f * 2.99), g2 = G(c, 0.25);
  o.connect(g); o2.connect(g2); g2.connect(g);
  run(o, t, d + 0.05); run(o2, t, d * 0.5 + 0.05);
}
function blub(c, out, t, f, pk, d) {
  var g = G(c, 0); env(g, t, 0.006, pk, d); g.connect(out);
  var o = O(c, 'sine', f); path(o.frequency, t, [[0, f], [d * 0.55, f * 2.2]]);
  var o2 = O(c, 'sine', f * 2), g2 = G(c, 0.2); path(o2.frequency, t, [[0, f * 2], [d * 0.55, f * 4.4]]);
  o.connect(g); o2.connect(g2); g2.connect(g); run(o, t, d + 0.05); run(o2, t, d + 0.05);
}

/* =====================================================================
 *  SFX  (fn(ctx, out, t, variant 0..2, opts, pitchMul) -> duration seconds)
 * ===================================================================== */
S.collect = function (c, out, t, v, o, P) {
  var n = [[784, 988, 1175, 1568], [659, 880, 1047, 1319], [880, 1109, 1319, 1760]][v], i;
  for (i = 0; i < 4; i++) { bell(c, out, n[i] * P, t + i * 0.065, 0.42 - i * 0.03, 0.22); }
  for (i = 0; i < 3; i++) { bell(c, out, n[3] * 2 * P, t + 0.14 + i * 0.055 + rnd(0, 0.02), 0.16, 0.05); }
  return 0.7;
};

S.boing = function (c, out, t, v, o, P) {
  var base = [250, 200, 320][v] * P, d = [0.75, 0.9, 0.62][v], rate = [20, 16, 26][v];
  var eg = G(c, 0); env(eg, t, 0.008, 0.6, d); eg.connect(out);
  var lp = F(c, 'lowpass', 2600, 0.7); lp.connect(eg);
  var parts = [['sine', 1, 1], ['triangle', 2, 0.25]], i, os, pg, m;
  for (i = 0; i < 2; i++) {
    m = parts[i][1]; os = O(c, parts[i][0], base * m);
    path(os.frequency, t, [[0, base * m * 0.55], [0.04, base * m * 1.7], [d, base * m * 0.95]]);
    vib(c, os.frequency, t, d, rate, base * m * 0.33, base * m * 0.02);
    pg = G(c, parts[i][2]); os.connect(pg); pg.connect(lp); run(os, t, d + 0.05);
  }
  return d;
};

S.burp = function (c, out, t, v, o, P) {
  var f0 = [88, 112, 70][v] * P, d = [0.5, 0.62, 0.4][v];
  var s = O(c, 'sawtooth', f0);
  path(s.frequency, t, [[0, f0 * 1.4], [0.06, f0 * 1.15], [d, f0 * 0.55]]);
  vib(c, s.frequency, t, d, 32, f0 * 0.1, f0 * 0.28);
  var am = G(c, 0.55), l = O(c, 'sine', 26), lg = G(c, 0.45);
  l.connect(lg); lg.connect(am.gain); run(l, t, d + 0.05);
  var a1 = F(c, 'bandpass', 480, 3), a2 = F(c, 'bandpass', 1050, 4), lp = F(c, 'lowpass', 2200, 0.5);
  path(a1.frequency, t, [[0, 380], [d * 0.3, 580], [d, 300]], true);
  var m1 = G(c, 1.6), m2 = G(c, 1.0), eg = G(c, 0); swell(eg, t, 0.03, 0.7, d * 0.6, d);
  s.connect(am); am.connect(a1); am.connect(a2); a1.connect(m1); a2.connect(m2);
  m1.connect(lp); m2.connect(lp); lp.connect(eg); eg.connect(out); run(s, t, d + 0.05);
  return d;
};

function meowOne(c, out, t, base, d, bright) {
  var s = O(c, 'sawtooth', base * 0.7);
  path(s.frequency, t, [[0, base * 0.72], [d * 0.33, base], [d, base * 0.6]]);
  vib(c, s.frequency, t, d, 6.5, base * 0.004, base * 0.02);
  var f1 = F(c, 'bandpass', 330, 5), f2 = F(c, 'bandpass', 2600, 6);
  path(f1.frequency, t, [[0, 330], [d * 0.33, 880 * bright], [d, 420]], true);
  path(f2.frequency, t, [[0, 2700], [d * 0.33, 1550], [d, 900]], true);
  var g1 = G(c, 1.4), g2 = G(c, 0.9), g0 = G(c, 0.05), lp = F(c, 'lowpass', 4200, 0.5), eg = G(c, 0);
  swell(eg, t, 0.05, 0.7, d * 0.62, d);
  s.connect(f1); f1.connect(g1); g1.connect(lp);
  s.connect(f2); f2.connect(g2); g2.connect(lp);
  s.connect(g0); g0.connect(lp); lp.connect(eg); eg.connect(out); run(s, t, d + 0.05);
  var n = noise(c, t, 0.12), nf = F(c, 'bandpass', 3200, 1), ng = G(c, 0); env(ng, t, 0.01, 0.03, 0.1);
  n.connect(nf); nf.connect(ng); ng.connect(out);
}
S.meow = function (c, out, t, v, o, P) {
  if (v === 0) { meowOne(c, out, t, 820 * P, 0.62, 1); return 0.65; }
  if (v === 1) { meowOne(c, out, t, 960 * P, 0.78, 1.1); return 0.8; }
  meowOne(c, out, t, 900 * P, 0.3, 0.95); meowOne(c, out, t + 0.36, 1000 * P, 0.34, 1.05); return 0.72;
};

S.kazoo = function (c, out, t, v, o, P) {
  var pts = [[[0, 262], [0.12, 330], [0.45, 311]], [[0, 330], [0.15, 440], [0.2, 440], [0.5, 392]], [[0, 220], [0.2, 294], [0.5, 262]]][v];
  var d = [0.5, 0.55, 0.52][v], i, k, s, pg;
  var bp = F(c, 'bandpass', 1250, 1.6), hp = F(c, 'highpass', 250, 0.7), lp = F(c, 'lowpass', 3200, 0.5);
  var am = G(c, 0.6), l = O(c, 'sine', 95), lg = G(c, 0.4), eg = G(c, 0);
  swell(eg, t, 0.04, 0.7, d * 0.6, d);
  l.connect(lg); lg.connect(am.gain); run(l, t, d + 0.05);
  var types = ['sawtooth', 'square'], lv = [0.8, 0.35];
  for (k = 0; k < 2; k++) {
    s = O(c, types[k], pts[0][1] * P);
    s.frequency.setValueAtTime(pts[0][1] * P, t);
    for (i = 1; i < pts.length; i++) { s.frequency.linearRampToValueAtTime(pts[i][1] * P, t + pts[i][0]); }
    vib(c, s.frequency, t, d, 5.5, 0.5, 5);
    pg = G(c, lv[k]); s.connect(pg); pg.connect(am); run(s, t, d + 0.05);
  }
  am.connect(hp); hp.connect(bp); bp.connect(lp); lp.connect(eg); eg.connect(out);
  return d;
};

function hoot(c, out, t, f, d) {
  var g = G(c, 0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.06);
  g.gain.setValueAtTime(0.7, t + d * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  var lp = F(c, 'lowpass', 1500, 0.6); lp.connect(g); g.connect(out);
  var o1 = O(c, 'sine', f), o2 = O(c, 'sine', f * 2), g2 = G(c, 0.28);
  path(o1.frequency, t, [[0, f * 1.07], [0.07, f], [d, f * 0.93]]);
  path(o2.frequency, t, [[0, f * 2.14], [0.07, f * 2], [d, f * 1.86]]);
  vib(c, o1.frequency, t, d, 5, f * 0.002, f * 0.012);
  o1.connect(lp); o2.connect(g2); g2.connect(lp); run(o1, t, d + 0.05); run(o2, t, d + 0.05);
}
S.owl = function (c, out, t, v, o, P) {
  if (v === 0) { hoot(c, out, t, 400 * P, 0.22); hoot(c, out, t + 0.3, 400 * P, 0.46); return 0.78; }
  if (v === 1) { hoot(c, out, t, 380 * P, 0.15); hoot(c, out, t + 0.2, 380 * P, 0.15); hoot(c, out, t + 0.42, 360 * P, 0.55); return 1.0; }
  hoot(c, out, t, 520 * P, 0.2); hoot(c, out, t + 0.27, 500 * P, 0.4); return 0.72;
};

function creakCore(c, out, t, d, base, sw0, sw1, lvl) {
  var s = O(c, 'sawtooth', base), tt, f, k = 0;
  s.frequency.setValueAtTime(base, t);
  for (tt = 0.06; tt < d; tt += 0.06) {
    f = base * (1 + 0.45 * Math.sin(tt * 3.1 + 0.7) + rnd(-0.18, 0.18)) * (0.8 + 0.5 * tt / d);
    s.frequency.linearRampToValueAtTime(Math.max(60, f), t + tt);
  }
  var bp = F(c, 'bandpass', sw0, 7), lp = F(c, 'lowpass', 2100, 0.6), eg = G(c, 0), tr = G(c, 0.8);
  path(bp.frequency, t, [[0, sw0], [d, sw1]], true);
  tr.gain.setValueAtTime(0.7, t);
  for (tt = 0.04; tt < d; tt += 0.04) { tr.gain.linearRampToValueAtTime(rnd(0.35, 1), t + tt); }
  swell(eg, t, 0.1, lvl, d * 0.7, d);
  s.connect(bp); bp.connect(tr); tr.connect(lp); lp.connect(eg); eg.connect(out); run(s, t, d + 0.05);
  var s2 = O(c, 'triangle', base * 0.5); s2.frequency.setValueAtTime(base * 0.5, t);
  s2.frequency.linearRampToValueAtTime(base * 0.62, t + d); var g2 = G(c, 0.1);
  s2.connect(g2); g2.connect(eg); run(s2, t, d + 0.05);
}
S.creak = function (c, out, t, v, o, P) {
  var d = [1.1, 0.9, 1.0][v];
  creakCore(c, out, t, d, [170, 140, 210][v] * P, [750, 650, 900][v], [1500, 1100, 1700][v], 0.55);
  return d;
};

S.doorOpen = function (c, out, t, v, o, P) {
  var n = noise(c, t, 0.05), bp = F(c, 'bandpass', [1800, 1500, 2200][v], 3), g = G(c, 0);
  env(g, t, 0.002, 0.7, 0.03); n.connect(bp); bp.connect(g); g.connect(out);
  var tk = O(c, 'sine', 900 * P), tg = G(c, 0); env(tk.frequency ? tg : tg, t, 0.002, 0.25, 0.04);
  tk.connect(tg); tg.connect(out); run(tk, t, 0.06);
  creakCore(c, out, t + 0.06, [0.62, 0.55, 0.7][v], [150, 190, 130][v] * P, 700, 1400, 0.5);
  var th = O(c, 'sine', 90), tg2 = G(c, 0); path(th.frequency, t + 0.72, [[0, 90], [0.14, 50]]);
  env(tg2, t + 0.72, 0.01, 0.5, 0.16); th.connect(tg2); tg2.connect(out); run(th, t + 0.72, 0.2);
  return 0.92;
};

S.ghostOoo = function (c, out, t, v, o, P) {
  var d = [1.1, 1.0, 1.15][v];
  var pts = [[[0, 330], [0.45, 460], [d, 350]], [[0, 520], [0.4, 390], [d, 430]], [[0, 280], [0.55, 370], [d, 300]]][v], i, k;
  var lp = F(c, 'lowpass', 900, 0.6), f1 = F(c, 'bandpass', 320, 2), f2 = F(c, 'bandpass', 800, 3);
  var mix = G(c, 1), eg = G(c, 0), tr = G(c, 0.8), tl = O(c, 'sine', 4.2), tlg = G(c, 0.2);
  swell(eg, t, 0.28, 0.65, d - 0.4, d);
  tl.connect(tlg); tlg.connect(tr.gain); run(tl, t, d + 0.05);
  var types = ['sine', 'triangle', 'sine'], dt = [0, 9, -7], lv = [1, 0.6, 0.5], os, pg;
  for (k = 0; k < 3; k++) {
    os = O(c, types[k], pts[0][1] * P); os.detune.value = dt[k];
    os.frequency.setValueAtTime(pts[0][1] * P, t);
    for (i = 1; i < pts.length; i++) { os.frequency.linearRampToValueAtTime(pts[i][1] * P, t + pts[i][0]); }
    vib(c, os.frequency, t, d, 5.3, 1, 14);
    pg = G(c, lv[k]); os.connect(pg); pg.connect(mix); run(os, t, d + 0.05);
  }
  var gf = G(c, 0.6), g2 = G(c, 0.4);
  mix.connect(lp); mix.connect(f1); f1.connect(gf); gf.connect(lp); mix.connect(f2); f2.connect(g2); g2.connect(lp);
  lp.connect(tr); tr.connect(eg); eg.connect(out);
  return d;
};

S.cackle = function (c, out, t, v, o, P) {
  var cfg = [{ b: 330, sp: 0.115, k: [1, 1.2, 1.35, 1.25, 1.15, 1.05, 0.95] },
             { b: 300, sp: 0.1, k: [1.1, 1.3, 1.2, 1.35, 1.1, 1, 0.9, 0.85] },
             { b: 360, sp: 0.13, k: [1, 1.15, 1.3, 1.2, 1.1, 0.9] }][v], i, st, f, d, s, f1, f2, eg, lp, g1, g2, n, nf, ng, ah;
  for (i = 0; i < cfg.k.length; i++) {
    st = t + i * cfg.sp; f = cfg.b * cfg.k[i] * P; d = 0.09 + (i === cfg.k.length - 1 ? 0.06 : 0); ah = (i % 2) ? 0.9 : 1.15;
    s = O(c, 'sawtooth', f); path(s.frequency, st, [[0, f * 1.06], [d, f * 0.92]]);
    vib(c, s.frequency, st, d, 7, f * 0.005, f * 0.015);
    f1 = F(c, 'bandpass', 650 * ah, 4); f2 = F(c, 'bandpass', 1650, 5); lp = F(c, 'lowpass', 2800, 0.5);
    g1 = G(c, 1.3); g2 = G(c, 0.7); eg = G(c, 0); env(eg, st, 0.012, 0.65 - i * 0.02, d + 0.03);
    s.connect(f1); f1.connect(g1); g1.connect(lp); s.connect(f2); f2.connect(g2); g2.connect(lp);
    lp.connect(eg); eg.connect(out); run(s, st, d + 0.08);
    n = noise(c, st, 0.04); nf = F(c, 'highpass', 2500, 0.7); ng = G(c, 0); env(ng, st, 0.004, 0.05, 0.03);
    n.connect(nf); nf.connect(ng); ng.connect(out);
  }
  return cfg.k.length * cfg.sp + 0.12;
};

S.bats = function (c, out, t, v, o, P) {
  var d = [0.95, 0.7, 1.05][v], n = noise(c, t, d + 0.05), hp = F(c, 'highpass', 900, 0.7), bp = F(c, 'bandpass', 2600, 0.8);
  var fl = G(c, 0.5), l = O(c, 'sine', 24), lg = G(c, 0.5), eg = G(c, 0);
  l.frequency.setValueAtTime([28, 24, 30][v], t); l.frequency.linearRampToValueAtTime(12, t + d);
  l.connect(lg); lg.connect(fl.gain); run(l, t, d + 0.05);
  swell(eg, t, 0.06, 0.8, d * 0.5, d);
  path(bp.frequency, t, [[0, 1900], [d * 0.5, 3000], [d, 2200]], true);
  n.connect(hp); hp.connect(bp); bp.connect(fl); fl.connect(eg); eg.connect(out);
  var n2 = noise(c, t, d + 0.05), lp2 = F(c, 'lowpass', 600, 0.5), g2 = G(c, 0.6);
  n2.connect(lp2); lp2.connect(g2); g2.connect(fl);
  var k, st, sq, sg, cnt = [2, 3, 2][v];
  for (k = 0; k < cnt; k++) {
    st = t + 0.08 + k * rnd(0.18, 0.26); sq = O(c, 'sine', 2600 * P); sg = G(c, 0);
    path(sq.frequency, st, [[0, 2300 * P], [0.05, 3300 * P]]); env(sg, st, 0.01, 0.1, 0.07);
    sq.connect(sg); sg.connect(out); run(sq, st, 0.1);
  }
  return d;
};

S.bubble = function (c, out, t, v, o, P) {
  var cnt = [3, 4, 2][v], i, st = t;
  for (i = 0; i < cnt; i++) { blub(c, out, st, rnd(180, 320) * P, 0.6, 0.13); st += rnd(0.1, 0.16); }
  return st - t + 0.15;
};

S.win = function (c, out, t, v, o, P) {
  var key = [0, 2, 5][v], seqs = [[0, 4, 7, 12], [0, 4, 7, 12, 16], [7, 4, 7, 12]][v], i, f, st, n, g, a, b, lp;
  function note(semi, st, d, pk) {
    f = 523.25 * Math.pow(2, (semi + key) / 12) * P;
    lp = F(c, 'lowpass', 3200, 0.5); g = G(c, 0); env(g, st, 0.01, pk, d); lp.connect(g); g.connect(out);
    a = O(c, 'triangle', f); b = O(c, 'square', f * 1.003); var bg = G(c, 0.22);
    var oc = O(c, 'sine', f * 2), og = G(c, 0.3);
    a.connect(lp); b.connect(bg); bg.connect(lp); oc.connect(og); og.connect(lp);
    run(a, st, d + 0.05); run(b, st, d + 0.05); run(oc, st, d + 0.05);
  }
  for (i = 0; i < seqs.length; i++) { note(seqs[i], t + i * 0.1, 0.2, 0.3); }
  st = t + 0.52;
  note(0, st, 0.58, 0.22); note(4, st, 0.58, 0.2); note(7, st, 0.58, 0.2); note(12, st, 0.58, 0.2);
  bell(c, out, 2093 * Math.pow(2, key / 12) * P, st + 0.02, 0.5, 0.06);
  return 1.1;
};

S.wrong = function (c, out, t, v, o, P) {
  var lp = F(c, 'lowpass', 1500, 0.6);
  lp.connect(out);
  function bonk(st, f, d, pk) {
    var g = G(c, 0), a = O(c, 'triangle', f * P);
    path(a.frequency, st, [[0, f * P * 1.12], [0.05, f * P], [d, f * P * 0.8]]);
    env(g, st, 0.006, pk, d); a.connect(g); g.connect(lp); run(a, st, d + 0.05);
    var th = O(c, 'sine', f * 0.5 * P), tg = G(c, 0); env(tg, st, 0.004, pk * 0.7, 0.1);
    th.connect(tg); tg.connect(lp); run(th, st, 0.12);
  }
  if (v === 0) { bonk(t, 330, 0.3, 0.6); return 0.4; }
  if (v === 1) { bonk(t, 330, 0.14, 0.5); bonk(t + 0.15, 262, 0.28, 0.6); return 0.5; }
  var g = G(c, 0), a = O(c, 'triangle', 440 * P);
  path(a.frequency, t, [[0, 440 * P], [0.38, 300 * P]]); vib(c, a.frequency, t, 0.38, 9, 6, 2);
  swell(g, t, 0.02, 0.55, 0.25, 0.4); a.connect(g); g.connect(lp); run(a, t, 0.45);
  return 0.45;
};

S.step = function (c, out, t, v, o, P) {
  var j = rnd(0.9, 1.1), n = noise(c, t, 0.12), lp = F(c, 'lowpass', [420, 560, 700][v] * j, 0.7), g = G(c, 0);
  env(g, t, 0.003, 0.7, 0.07); n.connect(lp); lp.connect(g); g.connect(out);
  var th = O(c, 'sine', [95, 82, 105][v] * j), tg = G(c, 0); path(th.frequency, t, [[0, [95, 82, 105][v] * j], [0.07, 55]]);
  env(tg, t, 0.003, 0.5, 0.09); th.connect(tg); tg.connect(out); run(th, t, 0.12);
  var n2 = noise(c, t, 0.05), bp = F(c, 'bandpass', 1600, 1), g2 = G(c, 0); env(g2, t + 0.01, 0.004, 0.06, 0.04);
  n2.connect(bp); bp.connect(g2); g2.connect(out);
  return 0.13;
};

S.pumpkinPop = function (c, out, t, v, o, P) {
  var f0 = [700, 560, 820][v] * P, o1 = O(c, 'sine', f0), g = G(c, 0);
  path(o1.frequency, t, [[0, f0], [0.09, 130]]); env(g, t, 0.003, 0.8, 0.14); o1.connect(g); g.connect(out); run(o1, t, 0.2);
  var n = noise(c, t, 0.1), bp = F(c, 'bandpass', 1100, 0.9), ng = G(c, 0); env(ng, t, 0.002, 0.5, 0.06);
  n.connect(bp); bp.connect(ng); ng.connect(out);
  blub(c, out, t + 0.07, 200 * P, 0.3, 0.12);
  if (v === 2) { f0 = 0; bell(c, out, 1568 * P, t + 0.12, 0.25, 0.1); }
  else { bell(c, out, [1319, 1047][v] * P, t + 0.14, 0.22, 0.08); }
  bell(c, out, 2093 * P, t + 0.2, 0.18, 0.05);
  return 0.42;
};

S.thunderSoft = function (c, out, t, v, o, P) {
  var d = 1.2, n = noise(c, t, d + 0.05), lp = F(c, 'lowpass', [260, 320, 210][v], 0.8), g = G(c, 0), tt;
  path(lp.frequency, t, [[0, [260, 320, 210][v]], [d, 110]]);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(5, t + 0.28);
  for (tt = 0.34; tt < 0.9; tt += 0.09) { g.gain.linearRampToValueAtTime(rnd(2.8, 5), t + tt); }
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  n.connect(lp); lp.connect(g); g.connect(out);
  var n2 = noise(c, t, d + 0.05), bp = F(c, 'bandpass', 140, 1.2), g2 = G(c, 0);
  env(g2, t, 0.3, 3.5, d); n2.connect(bp); bp.connect(g2); g2.connect(out);
  var sub = O(c, 'sine', 62 * P), sg = G(c, 0); env(sg, t, 0.3, 0.3, d); sub.connect(sg); sg.connect(out); run(sub, t, d + 0.05);
  return d;
};

/* =====================================================================
 *  Ambients: fn(ctx, out, t0) -> { stop(t), tick(now)? }
 * ===================================================================== */
AMB.wind = function (c, out, t) {
  var g = G(c, 0), srcs = [];
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 1.8); g.connect(out);
  function lfo(rate, depth, target, ph) { var l = O(c, 'sine', rate), lg = G(c, depth); l.connect(lg); lg.connect(target); l.start(t); srcs.push(l); }
  var n1 = c.createBufferSource(); n1.buffer = nbuf(c); n1.loop = true; n1.start(t, Math.random() * 1.5); srcs.push(n1);
  var b1 = F(c, 'bandpass', 420, 0.9), g1 = G(c, 0.6);
  lfo(0.17, 230, b1.frequency); lfo(0.11, 0.3, g1.gain);
  n1.connect(b1); b1.connect(g1); g1.connect(g);
  var n2 = c.createBufferSource(); n2.buffer = nbuf(c); n2.loop = true; n2.start(t, Math.random() * 1.5); srcs.push(n2);
  var b2 = F(c, 'bandpass', 1500, 1.2), g2 = G(c, 0.2);
  lfo(0.23, 0.15, g2.gain); lfo(0.09, 350, b2.frequency);
  n2.connect(b2); b2.connect(g2); g2.connect(g);
  return { stop: function (tt) {
    try { g.gain.cancelScheduledValues(tt); g.gain.setValueAtTime(g.gain.value, tt); g.gain.setTargetAtTime(0, tt, 0.4); } catch (e) {}
    var i; for (i = 0; i < srcs.length; i++) { try { srcs[i].stop(tt + 3); } catch (e) {} }
  } };
};

AMB.cauldronLoop = function (c, out, t) {
  var g = G(c, 0), srcs = [], next = t + 0.2;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 1.2); g.connect(out);
  var n = c.createBufferSource(); n.buffer = nbuf(c); n.loop = true; n.start(t, Math.random() * 1.5); srcs.push(n);
  var lp = F(c, 'lowpass', 240, 0.8), sg = G(c, 0.35), l = O(c, 'sine', 0.8), lg = G(c, 0.15);
  l.connect(lg); lg.connect(sg.gain); l.start(t); srcs.push(l);
  n.connect(lp); lp.connect(sg); sg.connect(g);
  return {
    tick: function (now) {
      while (next < now + 0.5) {
        blub(c, g, Math.max(next, now), rnd(150, 330), rnd(0.07, 0.16), rnd(0.1, 0.17));
        next += rnd(0.14, 0.5);
      }
    },
    stop: function (tt) {
      try { g.gain.cancelScheduledValues(tt); g.gain.setValueAtTime(g.gain.value, tt); g.gain.setTargetAtTime(0, tt, 0.3); } catch (e) {}
      var i; for (i = 0; i < srcs.length; i++) { try { srcs[i].stop(tt + 2.5); } catch (e) {} }
    }
  };
};

/* =====================================================================
 *  MUSIC: instruments, score builder, tracks, scheduler
 * ===================================================================== */
var WAVES = {
  organ: [1, 0.62, 0.42, 0.3, 0.2, 0.12, 0.08, 0.05],
  reed: [1, 0.7, 0.62, 0.45, 0.38, 0.26, 0.2, 0.13, 0.09, 0.05],
  stab: [1, 0.8, 0.6, 0.5, 0.38, 0.28, 0.2, 0.14, 0.1, 0.06]
};
function setWave(o, c, name) {
  try {
    var h = hw(c); h.w = h.w || {};
    if (!h.w[name]) {
      var a = WAVES[name], re = new Float32Array(a.length + 1), im = new Float32Array(a.length + 1), i;
      for (i = 0; i < a.length; i++) { im[i + 1] = a[i]; }
      h.w[name] = c.createPeriodicWave(re, im);
    }
    o.setPeriodicWave(h.w[name]);
  } catch (e) { o.type = 'sawtooth'; }
}
function padEnv(g, t, a, pk, d, rel) {
  var p = g.gain; d = Math.max(d, a + 0.02);
  p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(pk, t + a);
  p.setValueAtTime(pk, t + d); p.linearRampToValueAtTime(0.0001, t + d + rel);
}

INS.organ = function (c, out, t, d, n, v) {
  var f = mtof(n), g = G(c, 0), lp = F(c, 'lowpass', Math.min(f * 6, 3200), 0.4), rel = 0.14, k, o;
  padEnv(g, t, 0.025, 0.16 * v, d, rel); lp.connect(g); g.connect(out);
  for (k = 0; k < 2; k++) { o = O(c, 'sine', f); setWave(o, c, 'organ'); o.detune.value = k * 7; o.connect(lp); run(o, t, d + rel + 0.04); }
};
INS.stab = function (c, out, t, d, n, v) {
  var f = mtof(n), g = G(c, 0), lp = F(c, 'lowpass', 3400, 0.8), k, o;
  path(lp.frequency, t, [[0, 3600], [0.18, 900]]);
  padEnv(g, t, 0.006, 0.1 * v, Math.max(d, 0.1), 0.08); lp.connect(g); g.connect(out);
  for (k = 0; k < 2; k++) { o = O(c, 'sine', f); setWave(o, c, 'stab'); o.detune.value = k * 9 - 4; o.connect(lp); run(o, t, d + 0.3); }
};
INS.bassoon = function (c, out, t, d, n, v) {
  var f = mtof(n), g = G(c, 0), lp = F(c, 'lowpass', Math.min(f * 4 + 250, 1500), 0.9), o = O(c, 'sine', f), rel = 0.07;
  setWave(o, c, 'reed'); vib(c, o.frequency, t, d + rel, 5, 0.1, f * 0.006);
  padEnv(g, t, 0.03, 0.34 * v, d, rel); o.connect(lp); lp.connect(g); g.connect(out); run(o, t, d + rel + 0.04);
};
INS.fiddle = function (c, out, t, d, n, v) {
  var f = mtof(n), g = G(c, 0), lp = F(c, 'lowpass', 2800, 0.7), o = O(c, 'sawtooth', f), rel = 0.1;
  vib(c, o.frequency, t, d + rel, 5.5, 0.1, f * 0.01);
  padEnv(g, t, 0.05, 0.2 * v, d, rel); o.connect(lp); lp.connect(g); g.connect(out); run(o, t, d + rel + 0.04);
};
INS.pizz = function (c, out, t, d, n, v) {
  var f = mtof(n), g = G(c, 0), lp = F(c, 'lowpass', f * 6, 2), o = O(c, 'sawtooth', f);
  path(lp.frequency, t, [[0, Math.min(f * 7, 5000)], [0.14, Math.max(f * 1.4, 200)]]);
  env(g, t, 0.004, 0.42 * v, 0.28 + (n < 50 ? 0.12 : 0)); o.connect(lp); lp.connect(g); g.connect(out); run(o, t, 0.5);
};
INS.xylo = function (c, out, t, d, n, v) {
  var f = mtof(n), g = G(c, 0), o = O(c, 'sine', f), o2 = O(c, 'sine', f * 3.93), g2 = G(c, 0.3), dd = n > 84 ? 0.14 : 0.22;
  env(g, t, 0.002, 0.5 * v, dd); o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out); run(o, t, dd + 0.05); run(o2, t, dd * 0.5 + 0.05);
  var nz = noise(c, t, 0.02), nf = F(c, 'bandpass', 2500, 1), ng = G(c, 0); env(ng, t, 0.001, 0.05 * v, 0.012);
  nz.connect(nf); nf.connect(ng); ng.connect(out);
};
INS.musicbox = function (c, out, t, d, n, v) {
  var f = mtof(n), g = G(c, 0), o = O(c, 'sine', f), o2 = O(c, 'sine', f * 2), o3 = O(c, 'sine', f * 5.4), g2 = G(c, 0.18), g3 = G(c, 0.08), g23 = G(c, 1), dd = 1.1;
  env(g, t, 0.002, 0.34 * v, dd); o.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g23); g23.connect(g);
  g23.gain.setValueAtTime(1, t); g23.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  g.connect(out); run(o, t, dd + 0.05); run(o2, t, dd + 0.05); run(o3, t, 0.2);
};
INS.bell = function (c, out, t, d, n, v) {
  var f = mtof(n), g = G(c, 0), dd = 2.0, ps = [1, 2.0, 2.76, 5.4], am = [1, 0.35, 0.25, 0.08], i, o, pg;
  env(g, t, 0.003, 0.38 * v, dd); g.connect(out);
  for (i = 0; i < 4; i++) { o = O(c, 'sine', f * ps[i]); pg = G(c, am[i]); o.connect(pg); pg.connect(g); run(o, t, dd * (i ? 0.6 : 1) + 0.05); }
};
INS.bass = function (c, out, t, d, n, v) {
  var f = mtof(n), g = G(c, 0), lp = F(c, 'lowpass', f * 8, 4), o = O(c, 'sawtooth', f), s = O(c, 'sine', f), sg = G(c, 0.9);
  path(lp.frequency, t, [[0, f * 9], [0.16, f * 2.2]]);
  var dd = Math.max(d, 0.08);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.006);
  g.gain.setValueAtTime(0.42 * v, t + dd * 0.9); g.gain.linearRampToValueAtTime(0.0001, t + dd + 0.05);
  o.connect(lp); lp.connect(g); s.connect(sg); sg.connect(g); g.connect(out); run(o, t, dd + 0.1); run(s, t, dd + 0.1);
};
INS.kick = function (c, out, t, d, n, v) {
  var o = O(c, 'sine', 140), g = G(c, 0); path(o.frequency, t, [[0, 140], [0.12, 46]]);
  env(g, t, 0.003, 0.9 * v, 0.28); o.connect(g); g.connect(out); run(o, t, 0.32);
};
INS.thump = function (c, out, t, d, n, v) {
  var o = O(c, 'sine', 96), g = G(c, 0); path(o.frequency, t, [[0, 96], [0.15, 48]]);
  env(g, t, 0.005, 0.7 * v, 0.22); o.connect(g); g.connect(out); run(o, t, 0.26);
};
INS.clap = function (c, out, t, d, n, v) {
  var nz = noise(c, t, 0.25), bp = F(c, 'bandpass', 1500, 1), g = G(c, 0), p = g.gain;
  p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(0.6 * v, t + 0.002); p.exponentialRampToValueAtTime(0.12 * v, t + 0.011);
  p.linearRampToValueAtTime(0.6 * v, t + 0.013); p.exponentialRampToValueAtTime(0.12 * v, t + 0.022);
  p.linearRampToValueAtTime(0.7 * v, t + 0.024); p.exponentialRampToValueAtTime(0.0001, t + 0.2);
  nz.connect(bp); bp.connect(g); g.connect(out);
};
INS.hat = function (c, out, t, d, n, v) {
  var dd = n ? 0.18 : 0.045, nz = noise(c, t, dd + 0.02), hp = F(c, 'highpass', 7500, 0.7), g = G(c, 0);
  env(g, t, 0.002, 0.28 * v, dd); nz.connect(hp); hp.connect(g); g.connect(out);
};
INS.tick = function (c, out, t, d, n, v) {
  var nz = noise(c, t, 0.03), bp = F(c, 'bandpass', 4200, 5), g = G(c, 0), o = O(c, 'sine', 2600), og = G(c, 0);
  env(g, t, 0.001, 0.8 * v, 0.014); env(og, t, 0.001, 0.3 * v, 0.03);
  nz.connect(bp); bp.connect(g); g.connect(out); o.connect(og); og.connect(out); run(o, t, 0.05);
};
INS.tock = function (c, out, t, d, n, v) {
  var nz = noise(c, t, 0.04), bp = F(c, 'bandpass', 2200, 5), g = G(c, 0), o = O(c, 'sine', 1500), og = G(c, 0);
  env(g, t, 0.001, 0.8 * v, 0.02); env(og, t, 0.001, 0.4 * v, 0.045);
  nz.connect(bp); bp.connect(g); g.connect(out); o.connect(og); og.connect(out); run(o, t, 0.07);
};
INS.wood = function (c, out, t, d, n, v) {
  var o = O(c, 'sine', 900), g = G(c, 0); path(o.frequency, t, [[0, 960], [0.07, 720]]);
  env(g, t, 0.001, 0.4 * v, 0.07); o.connect(g); g.connect(out); run(o, t, 0.1);
};

/* ---- score builder ---- */
function mkClock(bpm) {
  if (typeof bpm === 'number') { return function (b) { return b * 60 / bpm; }; }
  var step = 1 / 16, N = 4800, tab = [0], i;
  for (i = 1; i <= N; i++) { tab.push(tab[i - 1] + step * 60 / bpm((i - 0.5) * step)); }
  return function (x) {
    var k = x / step, j = Math.floor(k); if (j >= N) { j = N - 1; }
    return tab[j] + (k - j) * (tab[j + 1] - tab[j]);
  };
}
function Score(bpm) { this.ev = []; this.sec = mkClock(bpm); }
var NOTEI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function pn(s) {
  var m = /^([a-g])(#|b)?(-?\d)$/.exec(s);
  if (!m) { throw new Error('bad note ' + s); }
  return (parseInt(m[3], 10) + 1) * 12 + NOTEI[m[1]] + (m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0));
}
Score.prototype.add = function (i, b, db, n, v) { this.ev.push({ i: i, b: b, db: db, n: n, v: v }); };
Score.prototype.line = function (inst, b, str, o) {
  o = o || {};
  var u = o.unit || 0.25, v = o.v == null ? 0.8 : o.v, tr = o.tr || 0, leg = o.leg || 0.95;
  var toks = str.replace(/^\s+|\s+$/g, '').split(/\s+/), i, j, k, parts, du, d, ns, n, dbl;
  for (i = 0; i < toks.length; i++) {
    parts = toks[i].split(':'); du = parts.length > 1 ? parseFloat(parts[1]) : 1; d = du * u;
    if (parts[0] !== 'r') {
      ns = parts[0].split('+');
      for (j = 0; j < ns.length; j++) {
        n = pn(ns[j]) + tr; this.add(inst, b, d * leg, n, v);
        if (o.dbl) { for (k = 0; k < o.dbl.length; k++) { dbl = o.dbl[k]; this.add(o.dblInst || inst, b, d * leg, n + dbl[0], v * dbl[1]); } }
      }
    }
    b += d;
  }
  return b;
};
Score.prototype.pat = function (inst, b, pattern, o) {
  o = o || {};
  var u = o.unit || 0.25, reps = o.reps || 1, v = o.v == null ? 0.8 : o.v, r, k, ch;
  for (r = 0; r < reps; r++) {
    for (k = 0; k < pattern.length; k++) {
      ch = pattern.charAt(k);
      if (ch === 'x' || ch === 'X' || ch === 'o') { this.add(inst, b + (r * pattern.length + k) * u, u, ch === 'o' ? 1 : 0, v * (ch === 'X' ? 1.25 : 1)); }
    }
  }
  return b + reps * pattern.length * u;
};
Score.prototype.done = function (total) {
  var sec = this.sec, out = [], i, e, t;
  this.ev.sort(function (a, b) { return a.b - b.b; });
  for (i = 0; i < this.ev.length; i++) {
    e = this.ev[i]; t = sec(e.b);
    out.push({ t: t, d: Math.max(0.03, sec(e.b + e.db) - t), i: e.i, n: e.n, v: Math.min(1.3, e.v) });
  }
  return { ev: out, len: sec(total) };
};
function rep(s, n) { var r = '', i; for (i = 0; i < n; i++) { r += s + ' '; } return r; }

/* ---- tracks ---- */
var PD = 'public domain', ORIG = 'original';

TRACKS.toccata = {
  title: 'Toccata and Fugue in D minor (opening)', by: 'J. S. Bach', status: PD,
  note: 'Re-synthesised organ arrangement of the opening gestures, with a friendly major ending.',
  build: function () {
    var s = new Score(70), b = 0, o = { v: 0.9, unit: 0.25, leg: 0.97, dbl: [[-12, 0.7]] };
    b = s.line('organ', b, 'a5:1 g5:1 a5:10 r:2 g5:1 f5:1 e5:1 d5:1 c#5:1 d5:14 r:6', o);
    b = s.line('organ', b, 'a4:1 g4:1 a4:8 r:2 g4:1 f4:1 e4:1 d4:1 c#4:1 d4:8 r:4', o);
    var fl = { v: 0.8, unit: 0.125, leg: 0.9 };
    s.line('organ', b, 'c#4:1 e4:1 g4:1 bb4:1 c#5:1 e5:1 g5:1 bb5:1 g5:1 e5:1 c#5:1 bb4:1 g4:1 e4:1 c#4:1 bb3:1', fl); b += 2;
    s.line('organ', b, 'bb5:1 g5:1 e5:1 c#5:1 bb4:1 g4:1 e4:1 c#4:1 e4:1 g4:1 bb4:1 c#5:1 e5:1 g5:1 bb5:1 c#6:1', fl); b += 2;
    s.line('organ', b, 'c#4+e4+g4+bb4:8', { v: 0.8, unit: 0.25, dbl: [[-12, 0.6]] });
    b = s.line('organ', b, 'd2:8', { v: 0.8 });
    b = s.line('organ', b, 'd5:1 c#5:1 d5:1 e5:1 f5:1 e5:1 d5:1 c#5:1 d5:1 a4:1 f4:1 d4:1', fl);
    s.line('organ', b, 'd3+a3+d4+f4+a4:16', { v: 0.85, unit: 0.25 });
    s.line('organ', b, 'd2:16', { v: 0.8 });
    b += 4;
    s.line('organ', b, 'd3+a3+d4+f#4+a4:12', { v: 0.8, unit: 0.25 });
    s.line('organ', b, 'd2:12', { v: 0.8 });
    s.line('musicbox', b + 0.3, 'd6:2 f#6:2 a6:2 d7:4', { v: 0.7, unit: 0.25, leg: 1 });
    b += 3;
    return s.done(b + 2);
  }
};

TRACKS.danseMacabre = {
  title: 'Danse Macabre (theme, simplified)', by: 'C. Saint-Saens', status: PD,
  note: 'Midnight bell strokes, the A/Eb "devil\'s interval", then a simplified paraphrase of the waltz theme for fiddle and xylophone "bones". Approximated by ear, not note-exact.',
  build: function () {
    var s = new Score(158), b = 0, i, p;
    s.line('bell', 0, rep('d4:1', 12), { v: 0.5, unit: 0.5 }); b = 6;
    b = s.line('fiddle', b, 'a4:1 eb5:2 a4:1 eb5:2', { v: 0.7, unit: 1, leg: 0.8 });
    var M = 'g4:1 g4:1 bb4:1 d5:2 c5:1 bb4:1 bb4:1 d5:1 g5:2 f5:1 eb5:1 d5:1 c5:1 bb4:1 a4:1 g4:1 a4:1 bb4:1 c5:1 d5:3';
    var roots = ['g2', 'g2', 'd2', 'g2', 'c2', 'g2', 'd2', 'g2'], chords = ['d3+bb3', 'd3+bb3', 'a3+c4', 'd3+bb3', 'g3+eb4', 'd3+bb3', 'a3+c4', 'd3+bb3'];
    function accomp(b0) {
      for (i = 0; i < 8; i++) {
        s.line('pizz', b0 + i * 3, roots[i] + ':1', { unit: 1, v: 0.9 });
        s.line('pizz', b0 + i * 3 + 1, chords[i] + ':1', { unit: 1, v: 0.5 });
        s.line('pizz', b0 + i * 3 + 2, chords[i] + ':1', { unit: 1, v: 0.5 });
      }
    }
    accomp(b); s.line('fiddle', b, M, { v: 0.8, unit: 1, leg: 0.88 }); b += 24;
    accomp(b); s.line('xylo', b, M, { v: 0.85, unit: 1, leg: 0.8, tr: 12 }); s.line('fiddle', b, M, { v: 0.35, unit: 1, leg: 0.88 });
    b += 24;
    b = s.line('xylo', b, 'g6:1 f#6:1 f6:1 e6:1 eb6:1 d6:1 c#6:1 c6:1 b5:1 bb5:1 a5:1 g#5:1 g5:4', { v: 0.8, unit: 0.25, leg: 0.9 });
    s.line('pizz', b - 1, 'g2:1', { unit: 1 }); s.line('xylo', b, 'g5:1 d5:1 bb4:1 g4:4', { v: 0.8, unit: 0.5 });
    return s.done(b + 3);
  }
};

TRACKS.mountainKing = {
  title: 'In the Hall of the Mountain King (accelerando)', by: 'E. Grieg', status: PD,
  note: 'Bassoon motif that speeds up and gains instruments each pass, with a big finish.',
  build: function () {
    var s = new Score(function (b) { return 76 * Math.pow(2.4, Math.min(b, 64) / 64); }), k, b0, tr;
    var P = 'b3:1 c#4:1 d4:1 e4:1 f#4:1 d4:1 f#4:2 f4:1 c#4:1 f4:2 e4:1 c#4:1 e4:2';
    for (k = 0; k < 8; k++) {
      b0 = k * 8; tr = k >= 4 ? 12 : 0;
      s.line('bassoon', b0, P, { v: 0.9, unit: 0.5, leg: 0.6, tr: tr - (k >= 4 ? 12 : 0) });
      if (k >= 4) { s.line('fiddle', b0, P, { v: 0.6, unit: 0.5, leg: 0.6, tr: 12 }); }
      if (k >= 2) { s.pat('pizz', b0, 'x.x.x.x.x.x.x.x.', { unit: 0.5, v: 0.6 }); }
      if (k >= 2) { s.line('pizz', b0, 'b2:2 r:2 b2:2 r:2 b2:2 r:2 b2:2 r:2', { unit: 1, v: 0.6, leg: 0.3 }); }
      if (k >= 6) { s.line('xylo', b0, P, { v: 0.6, unit: 0.5, leg: 0.5, tr: 12 }); s.pat('kick', b0, 'xxxxxxxx', { unit: 1, v: 0.5 }); }
      s.pat('wood', b0, 'xxxxxxxx', { unit: 1, v: k < 2 ? 0.4 : 0.25 });
    }
    s.line('organ', 64, 'b2+f#3+b3+d4+f#4:8', { v: 0.9, unit: 0.5 });
    s.pat('kick', 64, 'x', { unit: 1, v: 1 });
    s.line('xylo', 64.5, 'b5:1 d6:1 f#6:1 b6:6', { v: 0.8, unit: 0.25, leg: 0.9 });
    return s.done(69);
  }
};

TRACKS.marionette = {
  title: 'Funeral March of a Marionette (in the spirit of)', by: 'C. Gounod', status: PD,
  note: 'Jaunty staccato bassoon march in the spirit of the piece, an original paraphrase that is not note-exact.',
  build: function () {
    var s = new Score(116), pass, b0, p, beat, i;
    var A = 'd4:1 f4:1 a4:1 d5:1 c#5:1 a4:1 f4:1 d4:1 e4:1 g4:1 bb4:1 e5:1 d5:1 bb4:1 g4:1 e4:1 f4:1 a4:1 c5:1 f5:1 e5:1 c5:1 a4:1 f4:1 d4:2 a3:2 d4:4';
    var bs = [['d2', 'a2', 'f3+a3'], ['a2', 'e2', 'e3+g3+bb3'], ['f2', 'c3', 'a3+c4'], ['d2', 'a2', 'f3+a3']];
    for (pass = 0; pass < 3; pass++) {
      b0 = pass * 16;
      for (p = 0; p < 4; p++) {
        for (beat = 0; beat < 4; beat++) {
          s.line('pizz', b0 + p * 4 + beat, bs[p][beat % 2] + ':1', { unit: 1, v: 0.9 });
          s.line('pizz', b0 + p * 4 + beat + 0.5, bs[p][2] + ':1', { unit: 0.5, v: 0.4 });
        }
      }
      if (pass === 0) { s.line('bassoon', b0, A, { v: 0.95, unit: 0.5, leg: 0.5 }); }
      if (pass === 1) { s.line('fiddle', b0, A, { v: 0.7, unit: 0.5, leg: 0.55, tr: 12 }); s.line('bassoon', b0, A, { v: 0.6, unit: 0.5, leg: 0.5 }); }
      if (pass === 2) { s.line('xylo', b0, A, { v: 0.9, unit: 0.5, leg: 0.5, tr: 12 }); s.line('bassoon', b0, A, { v: 0.8, unit: 0.5, leg: 0.5 }); }
      s.pat('wood', b0, 'x.x.x.x.x.x.x.x.', { unit: 1, v: 0.18 });
    }
    s.line('bassoon', 48, 'd4+f4+a4:4', { v: 0.8, unit: 0.5, leg: 0.8 });
    s.line('xylo', 48.2, 'a5:1 f5:1 d5:2', { v: 0.8, unit: 0.5, leg: 0.8 });
    return s.done(51);
  }
};

TRACKS.baldMountain = {
  title: 'Night on Bald Mountain (motif)', by: 'M. Mussorgsky', status: PD,
  note: 'Rushing fiddle swirls, horn-like calls and a playful xylophone theme. Paraphrase of the spirit of the piece, not note-exact.',
  build: function () {
    var s = new Score(150), b = 0, R = 'd5:1 eb5:1 d5:1 c5:1 bb4:1 c5:1 d5:1 bb4:1 g4:1 a4:1 bb4:1 a4:1 g4:1 f#4:1 g4:1 d4:1';
    var ro = { v: 0.75, unit: 0.25, leg: 0.8 }, i, tr = [0, -2, 3];
    for (i = 0; i < 3; i++) { s.line('fiddle', b, R, { v: 0.75, unit: 0.25, leg: 0.8, tr: tr[i] }); s.pat('wood', b, 'x...', { unit: 0.25, reps: 4, v: 0.3 }); b += 4; }
    var call = 'g3:2 g3:2 d4:2 d4:2 bb3:2 g3:2 d3:4';
    s.line('bassoon', b, call, { v: 0.95, unit: 0.5, leg: 0.8 }); s.line('organ', b, call, { v: 0.5, unit: 0.5, leg: 0.8 });
    s.pat('kick', b, 'x.x.x.x.', { unit: 1, v: 0.6 }); b += 8;
    var T1 = 'g5:2 f5:1 eb5:1 d5:2 c5:2 bb4:2 a4:2 g4:4', T2 = 'bb4:2 a4:1 g4:1 f4:2 g4:2 a4:2 bb4:2 d5:4', j;
    function bass(b0) { for (j = 0; j < 8; j++) { s.line('pizz', b0 + j, (j % 2 ? 'd3' : 'g2') + ':1', { unit: 1, v: 0.9 }); s.line('pizz', b0 + j + 0.5, 'bb3+d4:1', { unit: 0.5, v: 0.35 }); } }
    bass(b); s.line('xylo', b, T1, { v: 0.9, unit: 0.5, leg: 0.8 }); s.line('fiddle', b, T1, { v: 0.45, unit: 0.5, leg: 0.9, tr: -12 }); b += 8;
    bass(b); s.line('xylo', b, T2, { v: 0.9, unit: 0.5, leg: 0.8, tr: 12 }); s.line('fiddle', b, T2, { v: 0.5, unit: 0.5, leg: 0.9 }); b += 8;
    s.line('fiddle', b, R, { v: 0.85, unit: 0.25, leg: 0.8, tr: 5 }); b += 4;
    s.line('bassoon', b, call, { v: 0.95, unit: 0.5, leg: 0.8 }); s.line('organ', b, call, { v: 0.5, unit: 0.5, leg: 0.8 }); b += 8;
    bass(b); s.line('xylo', b, T1, { v: 0.9, unit: 0.5, leg: 0.8, tr: 12 }); s.line('bell', b, 'g4:1', { v: 0.4, unit: 8 }); b += 8;
    s.line('organ', b, 'g3+d4+bb4+g4:8', { v: 0.8, unit: 0.5 });
    s.line('xylo', b + 0.3, 'd6:1 g6:1 bb6:1 g6:1 d7:6', { v: 0.7, unit: 0.25, leg: 0.9 }); b += 4;
    return s.done(b + 2);
  }
};

TRACKS.musicBoxMaze = {
  title: 'Music Box Maze', by: 'original', status: ORIG,
  note: 'Creepy-cute music box waltz in A minor.',
  build: function () {
    var s = new Score(104), M, ch, bar, i, notes;
    var CH = { Am: ['a3', 'c4', 'e4'], Dm: ['d4', 'f4', 'a4'], E: ['e3', 'g#3', 'b3'], F: ['f3', 'a3', 'c4'] };
    var prog = ['Am', 'Am', 'Dm', 'Dm', 'E', 'E', 'Am', 'Am', 'F', 'F', 'Dm', 'Dm', 'E', 'E', 'Am', 'Am'];
    var pat = [0, 1, 2, 1, 2, 1];
    for (bar = 0; bar < 16; bar++) {
      ch = CH[prog[bar]];
      s.line('musicbox', bar * 3, ch[0].replace(/(\d)/, function (d) { return String(parseInt(d, 10) - 1); }) + ':6', { unit: 0.5, v: 0.5, leg: 1 });
      for (i = 0; i < 6; i++) { s.line('musicbox', bar * 3 + i * 0.5, ch[pat[i]] + ':1', { unit: 0.5, v: 0.38, leg: 1 }); }
    }
    M = 'e5:2 c5:1 e5:3 a5:2 g5:1 e5:3 d5:2 f5:1 a5:3 g5:2 f5:1 d5:3 e5:2 g#5:1 b5:3 a5:2 g#5:1 e5:3 c6:2 b5:1 a5:2 e5:1 a5:5 r:1 ' +
        'a5:2 c6:1 a5:3 g5:2 f5:1 a5:3 f5:2 a5:1 d6:3 c6:2 a5:1 f5:3 g#5:2 b5:1 e6:3 d6:2 b5:1 g#5:3 e6:3 c6:1 a5:2 a5:3 bb5:1 a5:2';
    s.line('musicbox', 0, M, { unit: 0.5, v: 0.85, leg: 1 });
    s.line('bell', 45, 'a3:1', { unit: 1, v: 0.25 });
    return s.done(48);
  }
};

TRACKS.skeletonGroove = {
  title: 'Skeleton Groove', by: 'original', status: ORIG,
  note: 'Funky bass, claps, spooky organ stabs and an xylophone "bones" lick in E minor.',
  build: function () {
    var s = new Score(106), bar, b0, riff, am, tr, ro;
    var RA = 'e2:2 r:1 e2:1 g2:2 r:1 a2:1 b2:2 a2:1 g2:1 e2:2 r:2';
    var RB = 'e2:2 r:1 e2:1 g2:2 r:1 a2:1 b2:2 d3:1 b2:1 a2:1 g2:1 e2:2';
    for (bar = 0; bar < 16; bar++) {
      b0 = bar * 4; am = bar >= 8 && bar < 12; tr = am ? 5 : 0;
      s.line('bass', b0, bar % 2 ? RB : RA, { unit: 0.25, v: 0.95, leg: 0.8, tr: tr });
      s.line('stab', b0 + 1.5, am ? 'a4+c5+e5+g5:1' : 'e4+g4+b4+d5:1', { unit: 0.25, v: 0.9, leg: 1 });
      s.line('stab', b0 + 3.5, am ? 'a4+c5+e5+g5:1' : 'e4+g4+b4+d5:1', { unit: 0.25, v: 0.7, leg: 1 });
      if (bar % 4 === 3) { s.line('stab', b0 + 3.75, am ? 'g#4+b4+d5:1' : 'd#4+f#4+a4:1', { unit: 0.25, v: 0.6, leg: 1 }); }
    }
    s.pat('kick', 0, 'x.....x...x.....', { unit: 0.25, reps: 16, v: 0.95 });
    s.pat('clap', 0, '....x.......x...', { unit: 0.25, reps: 16, v: 0.8 });
    s.pat('hat', 0, 'x.x.x.x.x.x.x.o.', { unit: 0.25, reps: 16, v: 0.7 });
    s.pat('clap', 15 * 4, '....x...x.x.xxxx', { unit: 0.25, v: 0.55 });
    var LK = 'b5:2 d6:1 b5:1 g5:2 e5:2 r:2 g5:1 a5:1 b5:4', k;
    for (k = 0; k < 2; k++) {
      s.line('xylo', (4 + k * 8) * 4, LK, { unit: 0.25, v: 0.9, leg: 0.8 });
      s.line('xylo', (5 + k * 8) * 4, LK, { unit: 0.25, v: 0.9, leg: 0.8, tr: 0 });
    }
    s.pat('wood', 16, '..x...x..x...x..', { unit: 0.25, reps: 12, v: 0.25 });
    return s.done(64);
  }
};

TRACKS.midnightTicking = {
  title: 'Midnight Ticking', by: 'original', status: ORIG,
  note: 'Tense-but-fun clock loop for timed games.',
  build: function () {
    var s = new Score(126), bar, b0, beat;
    s.line('organ', 0, 'e2:192', { unit: 0.25, v: 0.5, leg: 1 });
    for (beat = 0; beat < 48; beat++) { s.add(beat % 2 ? 'tock' : 'tick', beat, 0.1, 0, 0.6); }
    for (bar = 0; bar < 12; bar++) {
      b0 = bar * 4;
      if (bar >= 2) { s.line('pizz', b0, 'e2:1 r:1 e2:1 f2:1 e2:1 r:1 f2:1 r:1', { unit: 0.5, v: 0.85, leg: 0.4 }); }
      if (bar >= 2) { s.add('thump', b0, 0.2, 0, 0.6); s.add('thump', b0 + 2, 0.2, 0, 0.5); }
      if (bar >= 6) { s.pat('tick', b0 + 0.5, 'x.x.x.x.', { unit: 0.5, v: 0.25 }); }
      if (bar >= 8) { s.line('musicbox', b0, 'e5:1 f5:1 e5:1 eb5:1 e5:1 r:3', { unit: 0.5, v: 0.8, leg: 1 }); }
    }
    s.line('bell', 0, 'a3+eb4:1', { unit: 1, v: 0.45 }); s.line('bell', 32, 'a3+eb4:1', { unit: 1, v: 0.45 });
    s.line('musicbox', 46, 'e4:1 f4:1 e4:1 f4:1 f#4:1 g4:1 g#4:1 a4:1', { unit: 0.25, v: 0.8, leg: 1 });
    return s.done(48);
  }
};

/* ---- generative track: Haunted Ambience (random, quiet) ---- */
TRACKS.hauntedAmbience = {
  title: 'Haunted Ambience', by: 'original soundscape', status: ORIG,
  note: 'No music: wind, cauldron and occasional owl, creak, thunder and friends at random.',
  gen: function (c, out, t0) {
    var wind = AMB.wind(c, out, t0), cauld = AMB.cauldronLoop(c, out, t0), next = t0 + rnd(1.5, 3), last = '';
    var sub = G(c, 0.9); sub.connect(out);
    var evs = [['owl', 3], ['creak', 2], ['thunderSoft', 1.5], ['bubble', 1.5], ['ghostOoo', 1.5], ['bats', 1], ['meow', 0.6], ['cackle', 0.4], ['doorOpen', 0.5]];
    var tot = 0, i; for (i = 0; i < evs.length; i++) { tot += evs[i][1]; }
    function choose() {
      var r = Math.random() * tot, k;
      for (k = 0; k < evs.length; k++) { r -= evs[k][1]; if (r <= 0) { return evs[k][0]; } }
      return 'owl';
    }
    return {
      tick: function (now) {
        cauld.tick(now);
        while (next < now + 0.8) {
          var nm = choose(), tries = 0;
          while (nm === last && tries++ < 5) { nm = choose(); }
          last = nm;
          var g = G(c, (LV[nm] || 1) * 0.5), dest = g;
          if (c.createStereoPanner) { var pn2 = c.createStereoPanner(); pn2.pan.value = rnd(-0.8, 0.8); g.connect(pn2); pn2.connect(sub); } else { g.connect(sub); }
          S[nm](c, g, Math.max(next, now + 0.02), Math.floor(Math.random() * 3), {}, rnd(0.95, 1.05));
          next += rnd(3.5, 8);
        }
      },
      stop: function (tt) { wind.stop(tt); cauld.stop(tt); }
    };
  }
};

var MUSIC_ORDER = ['toccata', 'danseMacabre', 'mountainKing', 'marionette', 'baldMountain', 'musicBoxMaze', 'skeletonGroove', 'midnightTicking', 'hauntedAmbience'];

function getData(tr) {
  if (!tr.data) { try { tr.data = tr.build(); } catch (e) { tr.data = { ev: [], len: 1, error: String(e) }; } }
  return tr.data;
}
function playEv(c, out, e, T) {
  var f = INS[e.i]; if (f) { f(c, out, T, e.d, e.n, e.v); }
}

/* ---- music transport ---- */
var LOOKAHEAD = 0.8, MAXNOTES = 30;

function shouldPlay() { return !!(ctx && !muted && !musMuted); }

function killPlayer(p, fade) {
  if (!p || p.dead) { return; }
  p.dead = true;
  var now = ctx.currentTime;
  try {
    p.tg.gain.cancelScheduledValues(now); p.tg.gain.setValueAtTime(p.tg.gain.value, now);
    p.tg.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.03, fade));
    if (p.h && p.h.stop) { p.h.stop(now + fade); }
  } catch (e) {}
  setTimeout(function () {
    if (p.timer) { clearInterval(p.timer); p.timer = null; }
    try { p.tg.disconnect(); } catch (e) {}
    var i; for (i = 0; i < players.length; i++) { if (players[i] === p) { players.splice(i, 1); break; } }
  }, (fade + 0.4) * 1000);
  if (p.timer) { clearInterval(p.timer); p.timer = null; }
  // keep generative handles ticking is unnecessary once faded
}

function startPlayer(name, opts) {
  var tr = TRACKS[name]; if (!tr) { return null; }
  var fade = opts.fade != null ? opts.fade : 1.5, now = ctx.currentTime;
  var tg = ctx.createGain(); tg.gain.setValueAtTime(0.0001, now);
  tg.gain.linearRampToValueAtTime(TLV[name] || 1, now + Math.max(0.03, fade)); tg.connect(musGain);
  var p = { name: name, tr: tr, tg: tg, loop: opts.loop !== false, fade: fade, onend: opts.onend, notes: [], idx: 0, loopN: 0, t0: now + 0.12, fired: false, dead: false };
  if (tr.gen) { p.h = tr.gen(ctx, tg, now + 0.05); p.loop = true; }
  else { p.data = getData(tr); }
  p.timer = setInterval(function () { try { tickPlayer(p); } catch (e) {} }, 140);
  players.push(p);
  tickPlayer(p);
  return p;
}

function tickPlayer(p) {
  if (p.dead || !ctx) { return; }
  var now = ctx.currentTime, hor = now + LOOKAHEAD, d = p.data, e, T, i, keep;
  if (p.h) { p.h.tick(now); return; }
  keep = []; for (i = 0; i < p.notes.length; i++) { if (p.notes[i] > now) { keep.push(p.notes[i]); } } p.notes = keep;
  if (!d.ev.length) { return; }
  while (true) {
    e = d.ev[p.idx];
    if (!e) {
      if (p.loop) { p.loopN++; p.idx = 0; continue; }
      p.exhausted = true; break;
    }
    T = p.t0 + p.loopN * d.len + e.t;
    if (T > hor) { break; }
    p.idx++;
    if (T < now - 0.05) { continue; }
    if (p.notes.length > MAXNOTES && e.v < 0.5) { continue; }
    playEv(ctx, p.tg, e, Math.max(T, now));
    p.notes.push(T + Math.min(e.d, 3) + 0.3);
  }
  if (!p.loop) {
    var endAbs = p.t0 + d.len;
    if (!p.fired && now >= endAbs - p.fade) { p.fired = true; if (p.onend) { try { p.onend(p.name); } catch (er) {} } }
    if (now >= endAbs + 0.5 && !p.dead) { if (curPlayer === p) { curPlayer = null; wantMusic = wantMusic && wantMusic.name === p.name ? null : wantMusic; fireMusic(); } killPlayer(p, 0.1); }
  }
}

function fireMusic() {
  var i, info = musicInfo(); for (i = 0; i < musicListeners.length; i++) { try { musicListeners[i](info); } catch (e) {} }
}
function musicInfo() {
  var n = wantMusic ? wantMusic.name : null; if (!n || !TRACKS[n]) { return null; }
  var t = TRACKS[n];
  return { name: n, title: t.title, by: t.by, status: t.status, note: t.note, playing: !!curPlayer };
}

function music(name, opts) {
  opts = opts || {};
  if (!TRACKS[name]) { return false; }
  wantMusic = { name: name, opts: opts };
  if (!ctx) { if (lazyOk()) { init(); } }
  if (curPlayer) { var old = curPlayer; curPlayer = null; killPlayer(old, opts.fade != null ? opts.fade : 1.5); }
  if (shouldPlay()) { curPlayer = startPlayer(name, opts); }
  fireMusic();
  return !!curPlayer;
}
function stopMusic(fade) {
  wantMusic = null;
  if (curPlayer) { var p = curPlayer; curPlayer = null; if (ctx) { killPlayer(p, fade == null ? 0.8 : fade); } }
  fireMusic();
}
function syncMusic() {
  if (!ctx) { return; }
  if (shouldPlay()) {
    if (wantMusic && !curPlayer) { curPlayer = startPlayer(wantMusic.name, wantMusic.opts); }
  } else if (curPlayer) { var p = curPlayer; curPlayer = null; killPlayer(p, 0.3); }
  fireMusic();
}
function setMusicMuted(b) { musMuted = !!b; lsSet('hwsfx.musicMuted', musMuted ? '1' : '0'); syncMusic(); }
function setMusicVolume(v) {
  v = parseFloat(v); if (!(v >= 0)) { return; }
  musVol = clamp(v, 0, 1); lsSet('hwsfx.musicVol', musVol);
  try { if (musGain) { musGain.gain.setTargetAtTime(musVol, ctx.currentTime, 0.03); } } catch (e) {}
}

/* =====================================================================
 *  RADIO: stations + DOM widget
 * ===================================================================== */
var STATIONS = [
  { id: 'off', name: 'Off', icon: '⏻', tracks: [] },
  { id: 'classics', name: 'Spooky Classics', icon: '🎻', mode: 'rotate', tracks: ['toccata', 'danseMacabre', 'mountainKing', 'marionette', 'baldMountain'] },
  { id: 'groove', name: 'Skeleton Groove', icon: '💀', mode: 'loop', tracks: ['skeletonGroove'] },
  { id: 'musicbox', name: 'Music Box', icon: '🎁', mode: 'loop', tracks: ['musicBoxMaze'] },
  { id: 'haunted', name: 'Haunted Ambience', icon: '🦉', mode: 'loop', tracks: ['hauntedAmbience'] },
  { id: 'tick', name: 'Midnight Tick', icon: '⏰', mode: 'loop', tracks: ['midnightTicking'] },
  { id: 'shuffle', name: 'Shuffle', icon: '🔀', mode: 'shuffle', tracks: ['toccata', 'danseMacabre', 'mountainKing', 'marionette', 'baldMountain', 'musicBoxMaze', 'skeletonGroove', 'midnightTicking'] }
];
var SBY = {}; (function () { var i; for (i = 0; i < STATIONS.length; i++) { SBY[STATIONS[i].id] = STATIONS[i]; } })();

var RST = { station: 'off', last: 'classics', idx: 0, token: 0, now: null, views: [], listeners: [] };
(function () { var s = ls('hwsfx.radioStation'); if (s && SBY[s] && s !== 'off') { RST.last = s; } })();

function radioPickTrack(st) {
  var n = st.tracks.length, name;
  if (n === 1) { return st.tracks[0]; }
  if (st.mode === 'shuffle') {
    do { name = st.tracks[Math.floor(Math.random() * n)]; } while (name === RST.now && n > 1);
    return name;
  }
  name = st.tracks[RST.idx % n]; RST.idx++; return name;
}
function radioPlayNext(first) {
  var st = SBY[RST.station]; if (!st || st.id === 'off') { return; }
  var name = radioPickTrack(st), single = st.tracks.length === 1, id = ++RST.token;
  RST.now = name;
  music(name, {
    loop: single, fade: first ? 1.2 : 2.2,
    onend: function () { if (RST.token === id && RST.station === st.id) { radioPlayNext(false); } }
  });
  radioRender();
}
function radioSet(id) {
  var st = SBY[id]; if (!st) { return false; }
  init();
  RST.station = id; RST.token++;
  if (id === 'off') { RST.now = null; stopMusic(1.0); }
  else { RST.last = id; lsSet('hwsfx.radioStation', id); RST.idx = 0; radioPlayNext(true); }
  radioRender(); radioFire();
  return true;
}
function radioStep(dir) {
  var list = [], i, cur;
  for (i = 0; i < STATIONS.length; i++) { if (STATIONS[i].id !== 'off') { list.push(STATIONS[i].id); } }
  cur = list.indexOf(RST.station === 'off' ? RST.last : RST.station);
  if (cur < 0) { cur = 0; }
  radioSet(list[(cur + dir + list.length) % list.length]);
}
function radioToggle() { if (RST.station === 'off') { radioSet(RST.last || 'classics'); } else { radioSet('off'); } }
function radioFire() { var i; for (i = 0; i < RST.listeners.length; i++) { try { RST.listeners[i](RST.station); } catch (e) {} } }

function radioNowText() {
  var st = SBY[RST.station];
  if (RST.station === 'off') { return 'Tap play to tune in: ' + SBY[RST.last].name; }
  var t = TRACKS[RST.now]; if (!t) { return st.name; }
  var tag = t.status === PD ? 'public domain' : 'original';
  if (RST.station === 'haunted') { return 'Wind, owls, creaks and a bubbling cauldron · ' + tag; }
  return t.title + (t.by && t.by !== 'original' ? ' — ' + t.by : '') + ' · ' + tag;
}

var radioCssDone = false;
function radioCss() {
  if (radioCssDone || !root.document) { return; }
  radioCssDone = true;
  var css =
    '.hwsfx-radio{box-sizing:border-box;width:100%;max-width:420px;padding:12px 14px 14px;border-radius:20px;color:var(--ink,#fff);' +
    'background:var(--glass,rgba(26,16,40,.62));-webkit-backdrop-filter:blur(16px) saturate(1.3);backdrop-filter:blur(16px) saturate(1.3);' +
    'border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 30px rgba(0,0,0,.35);font:14px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;' +
    '-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}' +
    '.hwsfx-radio *{box-sizing:border-box}' +
    '.hwsfx-radio .hr-top{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;letter-spacing:.2px}' +
    '.hwsfx-radio .hr-eq{display:inline-flex;gap:3px;align-items:flex-end;height:16px;opacity:.35}' +
    '.hwsfx-radio .hr-eq i{display:block;width:4px;height:4px;border-radius:2px;background:var(--accent,#ff8a1f)}' +
    '.hwsfx-radio.on .hr-eq{opacity:1}' +
    '.hwsfx-radio.on .hr-eq i{animation:hrEq .9s ease-in-out infinite}' +
    '.hwsfx-radio.on .hr-eq i:nth-child(2){animation-delay:.2s}.hwsfx-radio.on .hr-eq i:nth-child(3){animation-delay:.4s}.hwsfx-radio.on .hr-eq i:nth-child(4){animation-delay:.1s}' +
    '@keyframes hrEq{0%,100%{height:4px}50%{height:16px}}' +
    '.hwsfx-radio .hr-main{display:flex;align-items:center;gap:10px;margin:10px 0 6px}' +
    '.hwsfx-radio button{font:inherit;color:inherit;cursor:pointer;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);' +
    'border-radius:16px;min-height:48px;min-width:48px;padding:0 12px;touch-action:manipulation}' +
    '.hwsfx-radio button:active{transform:scale(.96)}' +
    '.hwsfx-radio button:focus-visible{outline:2px solid var(--accent,#ff8a1f);outline-offset:2px}' +
    '.hwsfx-radio .hr-play{min-width:64px;min-height:56px;font-size:24px;background:var(--accent,#ff8a1f);color:#1b0f06;border-color:transparent;font-weight:700}' +
    '.hwsfx-radio .hr-info{flex:1;min-width:0}' +
    '.hwsfx-radio .hr-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.hwsfx-radio .hr-now{font-size:12px;opacity:.8;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +
    '.hwsfx-radio .hr-chips{display:flex;gap:8px;overflow-x:auto;padding:6px 0 8px;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '.hwsfx-radio .hr-chips::-webkit-scrollbar{display:none}' +
    '.hwsfx-radio .hr-chip{flex:0 0 auto;min-height:44px;border-radius:22px;padding:0 14px;font-size:13px;white-space:nowrap}' +
    '.hwsfx-radio .hr-chip.act{background:var(--accent,#ff8a1f);color:#1b0f06;border-color:transparent;font-weight:700}' +
    '.hwsfx-radio .hr-vol{display:flex;align-items:center;gap:10px;min-height:44px}' +
    '.hwsfx-radio input[type=range]{flex:1;height:44px;margin:0;accent-color:var(--accent,#ff8a1f);background:transparent}' +
    '.hwsfx-radio .hr-note{font-size:11px;opacity:.65;margin-top:2px}';
  var st = root.document.createElement('style'); st.type = 'text/css';
  st.appendChild(root.document.createTextNode(css)); (root.document.head || root.document.documentElement).appendChild(st);
}

function radioRender() {
  var i, j, v, st = SBY[RST.station], on = RST.station !== 'off', chips, label;
  for (i = 0; i < RST.views.length; i++) {
    v = RST.views[i];
    v.el.className = 'hwsfx-radio' + (on && !musMuted && !muted ? ' on' : '');
    v.play.textContent = on ? '⏸' : '▶';
    v.play.setAttribute('aria-label', on ? 'Turn radio off' : 'Turn radio on');
    v.name.textContent = on ? st.name : 'Radio off';
    v.now.textContent = radioNowText();
    v.note.textContent = (musMuted || muted) && on ? 'Music is muted.' : '';
    for (j = 0; j < v.chips.length; j++) {
      label = v.chips[j].getAttribute('data-id');
      v.chips[j].className = 'hr-chip' + (label === RST.station ? ' act' : '');
      v.chips[j].setAttribute('aria-pressed', label === RST.station ? 'true' : 'false');
    }
    if (root.document.activeElement !== v.vol) { v.vol.value = String(Math.round(musVol * 100)); }
  }
}

function radioMount(container, o) {
  if (!root.document || !container) { return null; }
  radioCss();
  var el = root.document.createElement('div'), i, chip, v;
  el.className = 'hwsfx-radio';
  el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Spooky Radio');
  el.innerHTML =
    '<div class="hr-top"><span>📻 Spooky Radio</span><span class="hr-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>' +
    '<div class="hr-main"><button type="button" class="hr-prev" aria-label="Previous station">⏮</button>' +
    '<button type="button" class="hr-play">▶</button>' +
    '<button type="button" class="hr-next" aria-label="Next station">⏭</button>' +
    '<div class="hr-info"><div class="hr-name"></div><div class="hr-now" aria-live="polite"></div></div></div>' +
    '<div class="hr-chips"></div>' +
    '<div class="hr-vol"><span aria-hidden="true">🔊</span><input class="hr-v" type="range" min="0" max="100" step="1" aria-label="Music volume"></div>' +
    '<div class="hr-note"></div>';
  v = {
    el: el, play: el.querySelector('.hr-play'), name: el.querySelector('.hr-name'), now: el.querySelector('.hr-now'),
    note: el.querySelector('.hr-note'), vol: el.querySelector('.hr-v'), chips: []
  };
  var cc = el.querySelector('.hr-chips');
  for (i = 0; i < STATIONS.length; i++) {
    chip = root.document.createElement('button'); chip.type = 'button'; chip.className = 'hr-chip';
    chip.setAttribute('data-id', STATIONS[i].id);
    chip.textContent = STATIONS[i].icon + ' ' + STATIONS[i].name;
    (function (id) { chip.addEventListener('click', function () { radioSet(id); }, false); })(STATIONS[i].id);
    cc.appendChild(chip); v.chips.push(chip);
  }
  v.play.addEventListener('click', radioToggle, false);
  el.querySelector('.hr-prev').addEventListener('click', function () { radioStep(-1); }, false);
  el.querySelector('.hr-next').addEventListener('click', function () { radioStep(1); }, false);
  var onvol = function () { setMusicVolume(parseInt(v.vol.value, 10) / 100); };
  v.vol.addEventListener('input', onvol, false); v.vol.addEventListener('change', onvol, false);
  container.appendChild(el); RST.views.push(v); radioRender();
  return {
    el: el,
    destroy: function () {
      var k; for (k = 0; k < RST.views.length; k++) { if (RST.views[k] === v) { RST.views.splice(k, 1); break; } }
      if (el.parentNode) { el.parentNode.removeChild(el); }
    }
  };
}

musicListeners.push(function () { if (RST.views.length) { radioRender(); } });

var radio = {
  mount: radioMount,
  setStation: radioSet,
  getStation: function () { return RST.station; },
  stations: function () { var a = [], i; for (i = 0; i < STATIONS.length; i++) { a.push({ id: STATIONS[i].id, name: STATIONS[i].name }); } return a; },
  next: function () { radioStep(1); },
  prev: function () { radioStep(-1); },
  toggle: radioToggle,
  onChange: function (cb) { if (typeof cb === 'function') { RST.listeners.push(cb); } }
};

/* =====================================================================
 *  Offline render hook (used by the self-test; handy for peak checks)
 * ===================================================================== */
function renderOffline(kind, name, o) {
  o = o || {};
  if (!OAC) { return null; }
  var sr = o.sampleRate || 44100, secs = o.seconds || (kind === 'sfx' ? 1.6 : 24), c, ch, g, i, e, T, h, tr, d, t;
  c = new OAC(1, Math.ceil(sr * secs), sr);
  ch = buildChain(c, 1, 1);
  if (kind === 'sfx') {
    g = G(c, (LV[name] || 1) * (o.lv == null ? 1 : o.lv)); g.connect(ch.bus);
    S[name](c, g, 0.01, o.variant || 0, {}, 1);
  } else if (kind === 'amb') {
    g = G(c, (ALV[name] || 1) * (o.lv == null ? 1 : o.lv)); g.connect(ch.bus);
    h = AMB[name](c, g, 0.01);
    if (h.tick) { for (t = 0; t < secs; t += 0.25) { h.tick(t); } }
  } else {
    tr = TRACKS[name]; g = G(c, (TLV[name] || 1) * (o.lv == null ? 1 : o.lv)); g.connect(ch.mus);
    if (tr.gen) { h = tr.gen(c, g, 0.01); for (t = 0; t < secs; t += 0.25) { h.tick(t); } }
    else {
      d = getData(tr);
      for (i = 0; i < d.ev.length; i++) { e = d.ev[i]; T = 0.05 + e.t; if (T < secs) { playEv(c, g, e, T); } }
    }
  }
  return c.startRendering();
}

function trackInfo(name) {
  var t = TRACKS[name]; if (!t) { return null; }
  var r = { name: name, title: t.title, by: t.by, status: t.status, note: t.note, generative: !!t.gen };
  if (!t.gen) { var d = getData(t); r.seconds = d.len; r.events = d.ev.length; if (d.error) { r.error = d.error; } }
  return r;
}

function keysOf(o) { var a = [], k; for (k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { a.push(k); } } return a; }

var API = {
  version: VERSION,
  init: init,
  play: play,
  setMuted: setMuted,
  isMuted: isMuted,
  setVolume: setVolume,
  getVolume: getVolume,
  ambient: ambient,
  music: music,
  stopMusic: stopMusic,
  setMusicMuted: setMusicMuted,
  isMusicMuted: function () { return musMuted; },
  setMusicVolume: setMusicVolume,
  getMusicVolume: function () { return musVol; },
  onMusicChange: function (cb) { if (typeof cb === 'function') { musicListeners.push(cb); } },
  musicInfo: musicInfo,
  sounds: function () { return keysOf(S); },
  ambients: function () { return keysOf(AMB); },
  tracks: function () { var a = [], i; for (i = 0; i < MUSIC_ORDER.length; i++) { a.push(trackInfo(MUSIC_ORDER[i])); } return a; },
  available: function () { return !!AC; },
  radio: radio,
  _renderOffline: renderOffline,
  _trackInfo: trackInfo
};
root.HWSFX = API;

})(typeof window !== 'undefined' ? window : this);
