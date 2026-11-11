/* intro28 (owner 11/10): while the 3D house loads, a short photo introduction plays over the loading screen, so the wait reads as the
   start of the tour. Real listing photos, one line each, a slow push-in, and a hairline progress bar fed by the page's own loading text.
   When the house is ready: "Step inside" (first visit), or straight in (returning visitors, or a load that finishes almost at once).
   Self-contained: include with <script src="/assets/intro28.js" defer></script> on a page that has #loading (it watches for .done). */
(function(){
  'use strict';
  var L = document.getElementById('loading'); if(!L || window.__intro28) return; window.__intro28 = true;
  var q = location.search; if(/[?&](qa|nointro)=1\b/.test(q)) return;
  var store = { get: function(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set: function(k, v){ try{ localStorage.setItem(k, v); }catch(e){} } };
  var seen = store.get('intro28.seen') === '1', t0 = performance.now(), reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(L.classList.contains('done')) return;
  var game = /\/(thanksgiving|halloween)\//.test(location.pathname) || /[?&](snowball|escape|deck|room|feast)=/.test(q);
  var S = [
    ['front-exterior-1600.jpg', '118 Hillside Drive', 'A house in Woodside Glens, about a mile from the market, the bakery and the library in Town Center.'],
    ['entry-1600.jpg', 'Straight through to the oak', 'The iron-and-glass front doors open onto a foyer with a cathedral ceiling. The heritage oak is framed in the glass at the far end.'],
    ['living-room-1600.jpg', 'Beams over the living room', 'Exposed wood beams cross the vaulted ceiling, and the large windows look out to the trees.'],
    ['dining-1600.jpg', 'A wall of glass', 'The dining table sits beside it, looking out to the oak at the front of the house.'],
    ['kitchen-1180.jpg', 'The white kitchen', 'Quartz counters, a long peninsula, and a coffee bar with its own drinks fridge.'],
    ['rec-room-1180.jpg', 'The bonus lounge', 'Downstairs, with a refreshment counter, a beverage cooler and a 65-inch TV.'],
    ['primary-bedroom-1172.jpg', 'The primary suite', 'Upstairs, under four skylights, with a balcony that faces the western hills.'],
    ['office-1172.jpg', 'A skylit office', 'Downstairs, with its daylight coming in from above.'],
    ['rear-yard-1282.jpg', 'Under the heritage oak', 'A paver terrace with an outdoor kitchen and a ceramic smoker under the pergola.'],
    ['hills-view-1284.jpg', 'Sunset from the balcony', 'Looking west to the hills at the end of the day.']
  ];
  var css = '#intro28{position:fixed;inset:0;z-index:2147483000;background:#0e1113;color:#fff;font-family:"Jost","Avenir Next","Helvetica Neue",Arial,sans-serif;overflow:hidden;opacity:1;transition:opacity .7s ease}' +
    '#intro28.out{opacity:0;pointer-events:none}' +
    '#intro28 .sl{position:absolute;inset:0;opacity:0;transition:opacity 1.2s ease}#intro28 .sl.on{opacity:1}' +
    '#intro28 .sl img{width:100%;height:100%;object-fit:cover;transform:scale(1.02);transition:transform 7s linear}#intro28 .sl.on img{transform:scale(1.1)}' +
    '#intro28 .sh{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,14,.35) 0%,rgba(10,12,14,0) 30%,rgba(10,12,14,0) 50%,rgba(10,12,14,.78) 100%)}' +
    '#intro28 .top{position:absolute;left:clamp(18px,4vw,48px);top:clamp(16px,3vw,32px);right:clamp(18px,4vw,48px);display:flex;justify-content:space-between;align-items:center;gap:12px}' +
    '#intro28 .brand{font-family:"Cormorant Garamond",Georgia,serif;font-size:18px;letter-spacing:.14em;text-transform:uppercase}' +
    '#intro28 .st{font-size:13px;opacity:.82}' +
    '#intro28 .cap{position:absolute;left:clamp(18px,4vw,48px);right:clamp(18px,4vw,48px);bottom:clamp(64px,9vh,104px);max-width:640px}' +
    '#intro28 .cap h2{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:clamp(32px,5vw,56px);line-height:1.02;margin:0 0 10px;text-shadow:0 2px 18px rgba(0,0,0,.35)}' +
    '#intro28 .cap p{font-size:clamp(15px,1.6vw,18px);line-height:1.45;margin:0;opacity:.92;max-width:52ch;text-shadow:0 1px 10px rgba(0,0,0,.4)}' +
    '#intro28 .cap .t{transition:opacity .5s ease,transform .5s ease}#intro28 .cap.swap .t{opacity:0;transform:translateY(6px)}' +
    '#intro28 .bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.14)}#intro28 .bar i{display:block;height:100%;width:0;background:#e8d3b0;transition:width .6s ease}' +
    '#intro28 .go{position:absolute;right:clamp(18px,4vw,48px);bottom:clamp(64px,9vh,104px);display:flex;flex-direction:column;align-items:flex-end;gap:10px;opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;pointer-events:none}' +
    '#intro28.ready .go{opacity:1;transform:none;pointer-events:auto}' +
    '#intro28 .go button{font:inherit;font-size:16px;letter-spacing:.02em;border:0;border-radius:999px;background:#fff;color:#16191b;padding:14px 26px;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,.35)}' +
    '#intro28 .go button:hover{background:#f1ece2}#intro28 .go small{font-size:13px;opacity:.85;text-shadow:0 1px 8px rgba(0,0,0,.5)}' +
    '#intro28 .skip{font:inherit;font-size:13px;background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:6px 12px;cursor:pointer;display:none}#intro28.ready .skip{display:none}' +
    '#intro28 .ld{position:absolute;right:clamp(18px,4vw,48px);bottom:clamp(64px,9vh,104px);display:flex;align-items:center;gap:12px;background:rgba(14,17,19,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.18);border-radius:16px;padding:12px 16px;max-width:min(360px,calc(100% - 36px))}' +
    '#intro28 .ld i{flex:none;width:26px;height:26px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#e8d3b0;animation:i28spin .9s linear infinite}' +
    '#intro28 .ld b{display:block;font-weight:500;font-size:15.5px;font-variant-numeric:tabular-nums}#intro28 .ld span{display:block;font-size:13.5px;opacity:.85;line-height:1.3}' +
    '#intro28.ready .ld{display:none}@keyframes i28spin{to{transform:rotate(360deg)}}' +
    '#intro28 .bar{height:5px}' +
    '@media (max-width:640px){#intro28 .ld{left:18px;right:18px;bottom:24px;max-width:none}#intro28 .cap{bottom:112px}}' +
    '@media (prefers-reduced-motion:reduce){#intro28 .ld i{animation-duration:2.4s}}' +
    '#intro28 .dots{display:flex;gap:5px}#intro28 .dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.35)}#intro28 .dots i.on{background:#fff}' +
    '@media (max-width:640px){#intro28 .go{left:18px;right:18px;align-items:stretch;bottom:24px}#intro28 .go button{width:100%}#intro28.ready .cap{bottom:120px}#intro28 .dots{display:none}}' +
    '@media (prefers-reduced-motion:reduce){#intro28 .sl img,#intro28 .sl.on img{transform:none;transition:none}}' +
    '@media (min-width:641px) and (max-width:1100px){#intro28 .ld,#intro28 .go{bottom:24px}#intro28 .cap{bottom:128px}}';   // r35: between phone and wide desktop the status card sat on top of the caption
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var el = document.createElement('div'); el.id = 'intro28'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Introducing 118 Hillside Drive while the 3D house loads');
  var slides = S.map(function(s, i){ return '<div class="sl' + (i ? '' : ' on') + '"><img alt="" decoding="async" ' + (i < 3 ? 'src' : 'data-src') + '="../images/' + s[0] + '"></div>'; }).join('');
  el.innerHTML = slides + '<div class="sh"></div>' +
    '<div class="top"><span class="brand">118 Hillside Drive</span><span class="dots" aria-hidden="true">' + S.map(function(_, i){ return '<i' + (i ? '' : ' class="on"') + '></i>'; }).join('') + '</span></div>' +
    '<div class="cap" aria-live="polite"><h2 class="t"></h2><p class="t"></p></div>' +
    '<div class="go"><button type="button">' + (game ? 'Start playing' : 'Step inside') + '</button><small>' + (game ? 'The house is ready.' : 'You start at the street. Use Next to go through the house.') + '</small></div>' +
    '<div class="ld" role="status" aria-live="polite"><i aria-hidden="true"></i><div><b id="i28pct">Loading ' + (game ? 'the game' : 'the 3D house') + '…</b><span>Enjoy a few pictures of the house while it gets ready.</span></div></div>' +
    '<div class="bar" aria-hidden="true"><i></i></div>';
  document.body.appendChild(el);
  var sl = el.querySelectorAll('.sl'), dots = el.querySelectorAll('.dots i'), cap = el.querySelector('.cap'), h2 = cap.querySelector('h2'), p = cap.querySelector('p'), bar = el.querySelector('.bar i');
  var k = 0, timer = null, done = false, readyAt = 0;
  function warm(i){ var im = sl[i % S.length].querySelector('img'); if(im && !im.getAttribute('src') && im.dataset.src) im.src = im.dataset.src; }
  function show(i){ var nimg = sl[i % S.length].querySelector('img'); warm(i); if(!(nimg.complete && nimg.naturalWidth)) return;   // hold the current slide until the next photo is in
    sl[k].classList.remove('on'); if(dots[k]) dots[k].classList.remove('on'); k = i % S.length; sl[k].classList.add('on'); if(dots[k]) dots[k].classList.add('on');
    warm(k + 1); warm(k + 2);
    cap.classList.add('swap'); setTimeout(function(){ h2.textContent = S[k][1]; p.textContent = S[k][2]; cap.classList.remove('swap'); }, reduce ? 0 : 320); }
  h2.textContent = S[0][1]; p.textContent = S[0][2];
  timer = setInterval(function(){ show(k + 1); }, 3600);
  /* r35 progress (owner 11/10: "the rendering first view sits there for a long time"): the page writes its phase and a percentage into
     #loadtxt ("Furnishing the rooms... 55%"), then "Rendering the first view... 95%" while a gate (window.__reveal) waits for textures, shaders
     and exposure; after the loading card lifts, trees and reflections go in (window.__boot22). Each of those is said here in plain words, and
     the number never stands still: inside a phase it keeps creeping toward (never onto) the next mark. */
  var lt = document.getElementById('loadtxt'), pe = document.getElementById('i28pct'), what = 'Loading ' + (game ? 'the game' : 'the 3D house');
  var pct = 4, shown = 4, label = what, stageAt = t0, lastT = t0, lifted = 0, liftedVis = 0, G0 = -1, rafN = 0;
  var PH = [[/first view/i, 'Rendering the first view'], [/Finishing/i, 'Finishing the materials'], [/details/i, 'Adding the details'], [/Laying out/i, 'Laying out the garden'], [/Furnishing/i, 'Furnishing the rooms'],
    [/Building/i, 'Building the house'], [/Loading the house/i, 'Loading the house'], [/the lot/i, 'Loading the lot'], [/materials/i, 'Loading the materials']];
  function prog(){
    var now = performance.now(), txt = (lt && lt.textContent) || '', m = /(\d{1,3})\s*%/.exec(txt), lab = null, i, R = window.__reveal, B = window.__boot22;
    if(lt && lt.querySelector && lt.querySelector('.err')){ leave(); return; }   // the page could not load: show its message, not pictures
    if(m) pct = Math.max(pct, Math.min(95, +m[1]));
    for(i = 0; i < PH.length; i++) if(PH[i][0].test(txt)){ lab = PH[i][1]; break; }
    if(lifted){ var left = (B && B.left) || {}; lab = left.trees ? 'Planting the trees' : left.probes ? 'Polishing the reflections' : 'Opening the doors'; pct = Math.max(pct, 97); }
    else if(lab === PH[0][1] && R && R.unmet){ var u = R.unmet; lab = u.tex ? 'Loading the textures' : u.env ? 'Setting up the sky' : u.compile ? 'Preparing the graphics' : (u.meter != null || u.meterSettling != null) ? 'Balancing the light' : u.dark != null ? 'Letting the light in' : lab; }
    if(lab && lab !== label){ label = lab; stageAt = now; }
    var cap = lifted ? 99.4 : pct >= 95 ? 98.4 : Math.min(94, pct + 9), dt = Math.min(1000, now - lastT); lastT = now;
    shown = Math.max(shown, pct); if(shown < cap) shown += (cap - shown) * (1 - Math.exp(-dt / 5000));
    var say = label, held = now - stageAt; if(!done && held > 4500 && Math.floor(held / 3500) % 2) say = 'Nearly there';   // a long phase: the words still change
    bar.style.width = (done ? 100 : shown) + '%'; if(pe) pe.textContent = (done ? what : say) + '… ' + Math.round(done ? 100 : shown) + '%'; }
  var pi = setInterval(prog, 250), wi = 0; prog();
  if(lt && window.MutationObserver) new MutationObserver(function(){ if(!done) prog(); }).observe(lt, {childList: true, characterData: true, subtree: true});
  function leave(){ if(el.classList.contains('out')) return; store.set('intro28.seen', '1'); clearInterval(timer); clearInterval(pi); clearInterval(wi); el.classList.add('out');
    try{ window.gtag && gtag('event', 'intro28_enter', {seen_before: seen, wait_ms: Math.round(performance.now() - t0)}); }catch(e){}
    setTimeout(function(){ el.remove(); }, 800); }
  el.querySelector('.go button').addEventListener('click', leave);
  document.addEventListener('keydown', function(e){ if(done && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') && document.getElementById('intro28')){ e.preventDefault(); leave(); } }, true);
  function ready(){ if(done) return; done = true; readyAt = performance.now(); prog(); el.classList.add('ready');
    var waited = readyAt - t0;
    if(waited < 1400 || seen) setTimeout(leave, seen ? 350 : 200);   // quick loads and returning visitors walk straight in
    else el.querySelector('.go button').focus({preventScroll: true}); }
  /* r35: "ready" is the view, not the flag. #loading.done only starts the loading card's fade, and it can be set by a timeout before a frame
     has been drawn (a background tab). The pictures stay until the card has faded out, frames are really being drawn after that, and the
     trees and reflections that go in after the first view are done (or 6 s on screen have passed). Time in a hidden tab does not count. */
  function renders(){ try{ return window.__gov && __gov.G ? __gov.G.renders | 0 : -1; }catch(e){ return -1; } }
  function watch(){
    if(done || el.classList.contains('out')) return;
    if(!lifted){ if(!L.classList.contains('done')) return; lifted = performance.now(); G0 = renders(); (function f(){ rafN++; if(!done && rafN < 600) requestAnimationFrame(f); })(); prog(); }
    if(document.hidden) return; liftedVis += 200;
    var faded = +getComputedStyle(L).opacity < .05, r = renders(), drawn = r >= 0 && G0 >= 0 ? r - G0 >= 3 : rafN >= 8, B = window.__boot22, refined = !B || B.done || B.off;
    if(seen && B && B.settled) refined = true;   // a returning visitor goes in as soon as the view is drawn and the rooms have settled; the page's own "Refining the view" covers the trees
    if((faded && drawn && (refined || liftedVis > 6000)) || liftedVis > 15000) ready(); }
  wi = setInterval(watch, 200);
  new MutationObserver(watch).observe(L, {attributes: true, attributeFilter: ['class']});
  watch();
})();
