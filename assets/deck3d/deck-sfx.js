/* Deck the House with Snowball (3D): the sounds. Web Audio only, no files.
   One small set of soft bell and mallet tones, all from D major pentatonic so every cue is in tune with every other.
   Sine and triangle oscillators only (plus filtered noise for the shutter, the whoosh, the purr and the wind); every voice has a
   few milliseconds of attack and a faded tail so nothing clicks; a short generated-impulse room gives it some space; everything
   leaves through a quiet master gain and a soft limiter whose ceiling is below -6 dBFS.
   Nothing is created before the first tap or key press; the mute state is kept in localStorage ("deck.snd"); the context is
   suspended while the tab is hidden. DECKSFX.measure() renders each cue offline through the same chain and reports peak, RMS,
   DC offset, length and clipping, which is how these were checked (by measurement, not by ear). */
(function(){
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, KEY = 'deck.snd';
  const ls = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } }, lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} };
  const D3 = 146.83, A3 = 220, D4 = 293.66, Fs4 = 369.99, A4 = 440, B4 = 493.88, D5 = 587.33, E5 = 659.26, Fs5 = 739.99, A5 = 880, B5 = 987.77, D6 = 1174.66, E6 = 1318.51, Fs6 = 1479.98, A6 = 1760, B6 = 1975.53, D7 = 2349.32;
  const PENT = [D5, E5, Fs5, A5, B5, D6, E6, Fs6, A6, B6];
  const MASTER = .8, CEIL = .46, KNEE = .3;   // limiter: straight up to KNEE, then eases toward CEIL (-6.7 dBFS) and never passes it
  const LIMIT = (() => { const n = 4097, a = new Float32Array(n); for(let i = 0; i < n; i++){ const x = i / (n - 1) * 2 - 1, m = Math.abs(x), y = m <= KNEE ? m : KNEE + (CEIL - KNEE) * Math.tanh((m - KNEE) / (CEIL - KNEE)); a[i] = x < 0 ? -y : y; } return a; })();
  const lcg = seed => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1; };
  function noiseBuf(ac){ const b = ac.createBuffer(1, Math.floor(ac.sampleRate * 2), ac.sampleRate), d = b.getChannelData(0), r = lcg(1234); for(let i = 0; i < d.length; i++) d[i] = r(); return b; }
  function impulse(ac){ const len = Math.floor(ac.sampleRate * 1.25), b = ac.createBuffer(2, len, ac.sampleRate);   // a small, soft room: decaying noise, darker toward the tail
    for(let c = 0; c < 2; c++){ const d = b.getChannelData(c), r = lcg(77 + c * 31); let lp = 0; for(let i = 0; i < len; i++){ const t = i / len, k = .25 + .6 * (1 - t); lp += (r() - lp) * k; d[i] = lp * Math.pow(1 - t, 2.6) * (i < 64 ? i / 64 : 1); } } return b; }
  function chain(ac){ const bus = ac.createGain(), dry = ac.createGain(), conv = ac.createConvolver(), wet = ac.createGain(), master = ac.createGain(), lim = ac.createWaveShaper(), out = ac.createGain();
    conv.buffer = impulse(ac); wet.gain.value = .16; master.gain.value = MASTER; lim.curve = LIMIT; bus.connect(master); bus.connect(conv); conv.connect(wet); wet.connect(master); dry.connect(master); master.connect(lim); lim.connect(out);
    return {ac, bus, dry, out, noise: noiseBuf(ac)}; }

  /* ---------- voices ---------- */
  function osc(E, type, f, t, end){ const o = E.ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(end + .06); return o; }
  function amp(E, t, a, d, peak, dest){ const g = E.ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(1e-5, peak * .001), t + a + d); g.gain.linearRampToValueAtTime(0, t + a + d + .04); g.connect(dest || E.bus); return g; }
  const BELL = [[1, 1, 1], [2, .36, .6], [2.99, .16, .36], [4.2, .07, .22], [5.4, .035, .14]];
  function bell(E, t, f, vel, len, bright, hum){ BELL.forEach((p, i) => { const fr = f * p[0]; if(fr > 9000) return; const d = len * p[2]; osc(E, 'sine', fr * (1 + i * .0007), t, t + .006 + d).connect(amp(E, t, .006, d, vel * .2 * p[1] * (i ? (bright || 1) : 1))); });
    if(hum) osc(E, 'sine', f / 2, t, t + .02 + len * 1.2).connect(amp(E, t, .02, len * 1.2, vel * .2 * hum)); }
  function mallet(E, t, f, vel, len){ const end = t + .004 + len, car = osc(E, 'sine', f, t, end), mod = osc(E, 'sine', f * 3.01, t, end), mg = E.ac.createGain(); mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * .02, t + .09); mod.connect(mg); mg.connect(car.frequency);
    car.connect(amp(E, t, .004, len, vel * .2)); osc(E, 'triangle', f, t, t + .004 + len * .7).connect(amp(E, t, .004, len * .7, vel * .05)); }
  function pad(E, t, f, vel, len){ osc(E, 'sine', f, t, t + .09 + len).connect(amp(E, t, .09, len, vel * .13)); osc(E, 'triangle', f * 1.003, t, t + .09 + len).connect(amp(E, t, .09, len * .8, vel * .03)); }
  function noise(E, t, dur, off){ const s = E.ac.createBufferSource(); s.buffer = E.noise; s.loop = true; s.start(t, off || 0); s.stop(t + dur); return s; }
  function filt(E, type, f, q){ const b = E.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if(q != null) b.Q.value = q; return b; }
  function click(E, t, f, d, peak, off){ const hp = filt(E, 'highpass', 1200, .7), bp = filt(E, 'bandpass', f, 1.3); noise(E, t, d + .08, off).connect(hp); hp.connect(bp); bp.connect(amp(E, t, .0015, d, peak, E.dry)); }

  /* ---------- cues ---------- */
  const CUES = {
    place(E, t, i){ const f = PENT[((i | 0) % 7 + 7) % 7]; bell(E, t, f, .62, .95, .8); mallet(E, t, f, .28, .22); },                 // a decoration goes up
    remove(E, t){ mallet(E, t, A4, .42, .26); },                                                                                         // and comes back down
    tick(E, t){ mallet(E, t, A5, .34, .15); },
    message(E, t){ mallet(E, t, A5, .6, .34); mallet(E, t + .13, D6, .62, .5); bell(E, t + .13, D6, .24, .8); },                        // a guest texts: a small rising two-note chime
    whoosh(E, t){ const bp = filt(E, 'bandpass', 420, .8), g = E.ac.createGain(); bp.frequency.setValueAtTime(420, t); bp.frequency.exponentialRampToValueAtTime(1500, t + .22); bp.frequency.exponentialRampToValueAtTime(600, t + .56);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.085, t + .18); g.gain.linearRampToValueAtTime(0, t + .6); noise(E, t, .66, .3).connect(bp); bp.connect(g); g.connect(E.bus); },
    sunset(E, t){ bell(E, t, A5, .5, 1.6); bell(E, t + .4, Fs5, .5, 1.8); bell(E, t + .8, D5, .55, 2.4, 1, .3); pad(E, t + .8, D4, .5, 2.6); },
    sparkle(E, t, step){ const b = Math.max(0, Math.min(6, step | 0)); [0, 1, 3].forEach((k, j) => mallet(E, t + j * .06, PENT[b + k], .44, .3)); bell(E, t + .12, PENT[b + 3], .2, .7, 1.2); },   // one string of lights comes on
    chord(E, t){ [D3, A3, D4, Fs4, A4, E5].forEach((f, i) => pad(E, t + i * .035, f, f < 200 ? .5 : .42, 3)); bell(E, t + .2, D5, .38, 2.4); bell(E, t + .27, A5, .3, 2.2); },   // everything lit: a warm D chord
    doorbell(E, t, mood){ bell(E, t, Fs5, .78, 1.5, 1, .22); bell(E, t + .52, D5, .82, 2.2, 1, .3);                                    // ding, dong
      if(mood === 'yes'){ bell(E, t + 1.08, A5, .36, .7, 1.3); bell(E, t + 1.17, D6, .42, 1.1, 1.3); } else if(mood === 'no') mallet(E, t + 1.2, B4, .5, .9); },
    shutter(E, t){ click(E, t, 3400, .016, .2, .1); click(E, t + .09, 2300, .03, .16, .7); const o = osc(E, 'sine', 150, t, t + .07); o.frequency.exponentialRampToValueAtTime(90, t + .06); o.connect(amp(E, t, .006, .055, .07, E.dry)); },
    jingle(E, t){ for(let k = 0; k < 3; k++){ const f = k % 2 ? D7 : B6, tt = t + k * .075; osc(E, 'sine', f, tt, tt + .2).connect(amp(E, tt, .004, .18, .05)); osc(E, 'sine', f * 2.7, tt, tt + .1).connect(amp(E, tt, .003, .09, .02)); } },   // his collar bell
    purr(E, t, len){ len = len || 1.7; const am = E.ac.createGain(), lfo = osc(E, 'triangle', 24, t, t + len), lg = E.ac.createGain(), env = E.ac.createGain(), n = noise(E, t, len + .05, .9), lp = filt(E, 'lowpass', 300, .7), bp = filt(E, 'bandpass', 520, 1), bg = E.ac.createGain();
      am.gain.value = .5; lg.gain.value = .46; lfo.connect(lg); lg.connect(am.gain); n.connect(lp); lp.connect(am); n.connect(bp); bg.gain.value = .3; bp.connect(bg); bg.connect(am); const sub = osc(E, 'triangle', 48, t, t + len), sg = E.ac.createGain(); sg.gain.value = .5; sub.connect(sg); sg.connect(am);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(.3, t + .3); env.gain.setValueAtTime(.3, t + len - .5); env.gain.linearRampToValueAtTime(0, t + len); am.connect(env); env.connect(E.dry); },
    wind(E, t, len){ startWind(E, t, 1, len); }};
  /* a very quiet bed of wind for snow and for dusk: low-passed noise that slowly breathes */
  function startWind(E, t, level, len){ const n = E.ac.createBufferSource(); n.buffer = E.noise; n.loop = true; const lp = filt(E, 'lowpass', 380, .5), hp = filt(E, 'highpass', 90, .5), g = E.ac.createGain(), l1 = E.ac.createOscillator(), l1g = E.ac.createGain(), l2 = E.ac.createOscillator(), l2g = E.ac.createGain();
    l1.frequency.value = .11; l1g.gain.value = 150; l1.connect(l1g); l1g.connect(lp.frequency); l2.frequency.value = .07; l2g.gain.value = .012; l2.connect(l2g); l2g.connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.034 * level, t + 2); n.connect(lp); lp.connect(hp); hp.connect(g); g.connect(E.dry); n.start(t); l1.start(t); l2.start(t);
    if(len){ g.gain.setValueAtTime(.034 * level, t + len - 1); g.gain.linearRampToValueAtTime(0, t + len); n.stop(t + len + .05); l1.stop(t + len + .05); l2.stop(t + len + .05); }
    return {g, stop(at){ try{ l2g.gain.setValueAtTime(0, at); g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(0, at, .5); n.stop(at + 3); l1.stop(at + 3); l2.stop(at + 3); }catch(e){} }, level(v, at){ try{ g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(.034 * v, at, .8); }catch(e){} }}; }

  /* ---------- the live context: made on the first gesture, asleep when muted or hidden ---------- */
  let ac = null, E = null, muted = ls(KEY) === '0', wind = null, windWant = 0;
  function gesture(){ if(!AC) return; if(!ac){ try{ ac = new AC(); E = chain(ac); E.out.connect(ac.destination); }catch(e){ ac = null; return; } if(muted) try{ ac.suspend(); }catch(e){} }
    if(!muted && !document.hidden && ac.state === 'suspended') try{ ac.resume(); }catch(e){} if(!muted) syncWind(); }
  ['pointerdown', 'keydown', 'touchend'].forEach(ev => window.addEventListener(ev, gesture, {capture: true, passive: true}));
  document.addEventListener('visibilitychange', () => { if(!ac) return; try{ if(document.hidden) ac.suspend(); else if(!muted) ac.resume(); }catch(e){} });
  function play(name){ if(muted || !ac || document.hidden || !CUES[name]) return; const args = Array.prototype.slice.call(arguments, 1), go = () => { try{ CUES[name].apply(null, [E, ac.currentTime + .03].concat(args)); }catch(e){} };
    if(ac.state === 'running') go(); else try{ ac.resume().then(go, () => {}); }catch(e){} }
  function syncWind(){ if(!ac || muted) return; const t = ac.currentTime + .05; if(windWant > 0){ if(!wind) wind = startWind(E, t, windWant); else wind.level(windWant, t); } else if(wind){ wind.stop(t); wind = null; } }
  function ambient(level){ windWant = level || 0; syncWind(); }
  function setMuted(m){ muted = !!m; lsSet(KEY, muted ? '0' : '1'); if(!ac) return; try{ if(muted){ if(wind){ wind.stop(ac.currentTime); wind = null; } setTimeout(() => { if(muted) try{ ac.suspend(); }catch(e){} }, 250); } else if(!document.hidden){ ac.resume(); syncWind(); } }catch(e){} }

  /* ---------- measurement: render every cue offline through the same chain ---------- */
  const TEST = {place: [3], remove: [], tick: [], message: [], whoosh: [], sunset: [], sparkle: [4], chord: [], 'doorbell yes': ['yes'], 'doorbell no': ['no'], shutter: [], jingle: [], purr: [], wind: [6]};
  async function measure(){ if(!OAC) return null; const out = {}, db = v => v > 0 ? +(20 * Math.log10(v)).toFixed(1) : -120;
    for(const key in TEST){ const name = key.split(' ')[0], sr = 44100, secs = name === 'wind' ? 6.5 : 5.5, oc = new OAC(2, Math.floor(sr * secs), sr), e = chain(oc); e.out.connect(oc.destination); CUES[name].apply(null, [e, .05].concat(TEST[key]));
      const buf = await oc.startRendering(); let peak = 0, sum = 0, dc = 0, last = 0, clip = 0, step = 0; const n = buf.length;
      for(let c = 0; c < buf.numberOfChannels; c++){ const d = buf.getChannelData(c); for(let i = 0; i < n; i++){ const v = d[i], a = v < 0 ? -v : v; if(a > peak) peak = a; sum += v * v; dc += v; if(a > .001 && i > last) last = i; if(a >= .999) clip++; if(i){ const s = Math.abs(v - d[i - 1]); if(s > step) step = s; } } }
      const m = n * buf.numberOfChannels; out[key] = {peakDb: db(peak), rmsDb: db(Math.sqrt(sum / m)), dc: +(dc / m).toFixed(5), seconds: +(last / sr).toFixed(2), clipped: clip, maxStep: +step.toFixed(3), silentAtEnd: Math.abs(buf.getChannelData(0)[n - 1]) < 1e-4}; }
    return out; }
  window.DECKSFX = {play, ambient, setMuted, get muted(){ return muted; }, get state(){ return ac ? ac.state : 'none'; }, measure, cues: Object.keys(CUES), ceilingDb: +(20 * Math.log10(CEIL)).toFixed(1)};
})();
