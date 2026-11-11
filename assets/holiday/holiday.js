/* Holiday decor on the 3D tour of 118 Hillside Drive (tour/index.html loads this; the engine's side is window.HOLIDAY_HOST).
   One control, outside any game: see the house dressed for Halloween, Thanksgiving or the winter holidays, or with no decorations.
   - Halloween and Thanksgiving are the tour's own dresses (window.HALLOWEEN / window.THANKSGIVING); this file only switches them.
   - Winter holidays is one designed scheme built from the Deck the House game's props (assets/deck3d/deck-props.js, loaded on
     first use): warm white lights on every eave, a wreath with a red bow on the iron-and-glass doors, a lit tree by the doors,
     garland on the porch railing and the living-room beams, a menorah in the street-facing window and a candle in the others,
     luminarias up the front walk, lights in both oaks, bistro strings and lanterns on the terrace, poinsettias inside. No snow.
   - The choice lasts for the visit. ?holiday=winter|thanksgiving|halloween (and &dusk=1) opens the tour already dressed.
   - Game addresses (?feast= ?snowball= ?escape= ?room= ?deck=) never run this file's control: games start in the undecorated house.
   window.HOLIDAY = {set(kind), current, dusk(on), show(), state()} for QA. */
(function(){
  'use strict';
  const H = window.HOLIDAY_HOST; if(!H || window.HOLIDAY) return;
  if(/[?&](escape|snowball|deck|room|feast)=/.test(location.search)) return;
  const $ = s => document.querySelector(s), root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ga = (n, p) => { try{ window.gtag && gtag('event', n, p || {}); }catch(e){} };
  const isPh = () => root.classList.contains('ph');
  const HW = () => window.HALLOWEEN, TG = () => window.THANKSGIVING;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const paint = () => new Promise(r => { let d = false; const f = () => { if(!d){ d = true; r(); } }; requestAnimationFrame(() => setTimeout(f, 0)); setTimeout(f, 180); });   // a hidden tab gets no frames: the timer backs it up
  const ASSET = (document.currentScript && document.currentScript.src || '../assets/holiday/holiday.js').replace(/holiday\/holiday\.js.*$/, '');

  /* ---------- what each dress is, and the best places to see it from ---------- */
  const DRESS = {
    none: {label: 'No decorations', sub: 'The house as it is'},
    halloween: {label: 'Halloween', sub: 'Jack-o’-lanterns and cobwebs', busy: 'Carving the pumpkins…',
      views: [{t: 'From the street', pos: [6, 3, 66], look: [-2, 7, 14], posP: [6, 3, 74], lookP: [0, 9.5, 14]},
        {t: 'The front steps', pos: [-5.2, 3.2, 31], look: [-5.6, 4.2, 6], posP: [-5.2, 3.4, 36], lookP: [-5.6, 5, 6]},
        {t: 'From the foyer', inside: true, pos: [-10.4, 4.8, -4.0], look: [12, 4.2, -4.0]}]},
    thanksgiving: {label: 'Thanksgiving', sub: 'A set table and fall leaves', busy: 'Setting the table…',
      views: [{t: 'From the street', pos: [6, 3, 66], look: [-2, 7, 14], posP: [6, 3, 74], lookP: [0, 9.5, 14]},
        {t: 'The front steps', pos: [-5.2, 3.2, 31], look: [-5.6, 4.2, 6], posP: [-5.2, 3.4, 36], lookP: [-5.6, 5, 6]},
        {t: 'The dinner table', inside: true, pos: [13.6, 5, 29.5], look: [10.3, 3.3, 21.4]},
        {t: 'The living room', inside: true, pos: [13, 5, 2.9], look: [4.8, 3.9, -3.9]}]},
    winter: {label: 'Winter holidays', sub: 'Lights, a tree and a menorah', busy: 'Hanging the lights…',
      views: [{t: 'From the street', pos: [6, 3, 66], look: [-2, 7, 14], posP: [6, 3, 74], lookP: [0, 9.5, 14]},
        {t: 'The front doors', pos: [-5.2, 3.2, 31], look: [-5.6, 4.2, 6], posP: [-5.2, 3.4, 36], lookP: [-5.6, 5, 6]},
        {t: 'The living room', inside: true, pos: [13, 5, 2.9], look: [4.8, 3.9, -3.9]},
        {t: 'Under the oak', pos: [27, 1.8, -38.5], look: [0, 3.4, -37.5], posP: [30, 2, -39], lookP: [0, 4.8, -37.5]}]}};
  const KINDS = ['none', 'halloween', 'thanksgiving', 'winter'];

  /* ---------- Winter holidays: one scheme, in the Deck the House props' own state shape ---------- */
  const WINTER = {name: '', trad: [], lights: 'warm', motion: 'steady', door: 'evergreen', win: ['candles', 'menorah'], menorahLit: 9, hang: 'none', path: ['luminarias', 'garland'], tree: 'classic', topper: 'star',
    room: ['poinsettia'], room2: ['beams'], oak: 'both', oakFront: true, ter: ['lanterns'], ter2: ['bistro'], weather: 'clear', yard: 'none', wear: 'none'};
  const BLANK = {name: '', trad: [], lights: 'none', motion: 'steady', door: 'none', win: [], menorahLit: 9, hang: 'none', path: [], tree: 'none', topper: 'star', room: [], room2: [], oak: 'none', oakFront: false, ter: [], ter2: [], weather: 'clear', yard: 'none', wear: 'none'};
  const W = {on: false, built: false, S: null, P: null, inside: false, tod0: null, todMine: false, raf: 0, lastIn: 0, ms: 0, late: 0};
  let mine = false;   // true while this file changes the time of day (a change by the visitor is theirs to keep)
  function loadProps(){ if(window.DECKPROPS) return Promise.resolve(); if(loadProps.p) return loadProps.p;
    return (loadProps.p = new Promise((res, rej) => { const s = document.createElement('script'); s.src = ASSET + 'deck3d/deck-props.js?v=37'; s.onload = () => res(); s.onerror = () => { loadProps.p = null; rej(new Error('deck-props.js did not load')); }; document.head.appendChild(s); })); }
  const ctx = () => ({inside: true});   // window candles and the menorah sit on the inside sill, where they would really be; the glass shows them from the street
  /* parts follow what the tour is showing: nothing is left on a roof or in a tree that is not drawn */
  function syncVis(){ const P = W.P; if(!P) return; const show = W.on && H.mode !== 'design'; P.root.visible = show; if(!show) return;
    const fb = document.getElementById('furnBtn'), roof = H.shown('roof'), trees = H.shown('trees'), furn = !fb || fb.getAttribute('aria-pressed') !== 'false', asBuilt = H.variant === 'asbuilt';   // Furniture off empties the rooms piece by piece, so the button is the record of it
    const set = (k, v) => { const g = P.group(k); if(g) g.visible = !!v; };
    set('roof', roof); set('room2', roof && asBuilt);                 // roofline strings and the beam garland go with the roof
    set('oak', trees); set('oakFront', trees); set('ter2', trees && roof);   // strings in the oaks, and the bistro strings that hang from one, go with the trees
    set('tree', asBuilt); set('room', asBuilt && furn); set('ter', furn);    // the tree and poinsettias stand in the house as built; lanterns sit on the terrace table
  }
  function frame(){ W.raf = requestAnimationFrame(frame); const P = W.P; if(!W.on || !P || !P.root.visible) return; const now = performance.now(); try{ P.tick(now / 1000, H.tod); }catch(e){} }
  async function winterOn(step){
    await loadProps();
    if(!W.P){ W.P = window.DECKPROPS(H, {porchLight: false}); W.P.root.name = 'holiday-winter'; }
    const P = W.P; W.on = true; P.setOn(1);
    if(!W.raf) W.raf = requestAnimationFrame(frame);
    if(W.built){ syncVis(); return; }
    const S = Object.assign({}, BLANK), add = async (label, keys) => { step(label); await paint(); keys.forEach(k => { S[k] = WINTER[k]; }); P.apply(S, ctx()); syncVis(); await paint(); };
    P.apply(S, ctx());
    await add('Hanging the lights…', ['lights', 'motion']);
    await add('Putting the wreath on the doors…', ['door', 'win']);
    step('Lighting the walk…'); await new Promise(r => { let d = false; const f = () => { if(!d){ d = true; r(); } }; try{ P.prewarm(WINTER, f); }catch(e){ f(); } setTimeout(f, 6000); });
    await add('Lighting the walk…', ['path']);
    await add('Trimming the tree…', ['tree', 'topper', 'room', 'room2']);
    /* the two oaks are planted a moment after the house (and after the first view): wait a little for them, and if they are later still, string them when they arrive */
    const oaks = () => { try{ return P.oakInfo().trunk.length > 2 && P.oakInfo('tree:OAK-FRONT').trunk.length > 2; }catch(e){ return true; } };
    step('Stringing lights in the oak…'); for(let i = 0; i < 24 && !oaks(); i++) await sleep(250);
    await add('Stringing lights in the oak…', ['oak', 'oakFront', 'ter', 'ter2']);
    W.S = S; W.built = true;
    if(!oaks() && !W.late){ let n = 0; W.late = setInterval(() => { if(!oaks() && ++n < 90) return; clearInterval(W.late); W.late = 0; try{ P.apply(Object.assign({}, S, {oak: 'none', oakFront: false, ter2: []}), ctx()); P.apply(S, ctx()); syncVis(); }catch(e){} }, 1000); } }
  function winterOff(){ if(!W.on) return; W.on = false; if(W.raf){ cancelAnimationFrame(W.raf); W.raf = 0; } if(W.P) W.P.root.visible = false;
    if(W.todMine && W.tod0){ mine = true; try{ H.todSet(W.tod0.key, W.tod0.manual); }catch(e){} mine = false; } W.tod0 = null; W.todMine = false; }
  /* dusk and back. The lights are on by day too; at dusk they come on one string at a time. */
  function dusk(on){ if(!W.on || !W.P) return false; mine = true;
    try{ if(on){ if(!W.tod0) W.tod0 = H.todGet(); if(H.tod !== 'dusk'){ H.todSet('dusk', true); W.todMine = true; } if(!reduce){ W.P.setOn(0); W.P.lightUp(); } }
      else { const k = W.tod0 && W.tod0.key !== 'dusk' ? W.tod0.key : 'afternoon'; if(!W.tod0) W.tod0 = H.todGet(); H.todSet(k, true); W.todMine = true; W.P.setOn(1); } }catch(e){ console.warn('[holiday] dusk', e); }
    mine = false; render(); ga('holiday_dusk', {on: !!on}); return true; }

  /* ---------- state ---------- */
  let busy = null, lastMs = {};
  const current = () => (HW() && HW().isOn) ? 'halloween' : (TG() && TG().isOn) ? 'thanksgiving' : W.on ? 'winter' : 'none';
  function status(label){ const B = H.busy, e = document.getElementById('busy24'); if(e && e.classList.contains('on')){ const s = e.querySelector('span'); if(s) s.textContent = label; } else if(B && B.start && !B.active){ try{ B.start(btn, label, true); }catch(x){} }
    const live = $('#holLive'); if(live) live.textContent = label; const row = busy && panel ? panel.querySelector('[data-k="' + busy + '"] .s') : null; if(row) row.textContent = label; }
  async function settle(){ const B = H.busy; if(B && B.active){ try{ B.settle(); }catch(e){} for(let i = 0; i < 50 && B.active; i++) await sleep(100); if(B.active) try{ B.end(); }catch(e){} } }
  async function set(kind, o){ o = o || {};
    if(!DRESS[kind] || busy) return false; const cur = current(); if(kind === cur){ render(); return true; }
    if(!H.ready || (kind !== 'none' && H.mode === 'design')) return false;
    const t0 = performance.now(); busy = kind; show.stop(); render();
    status(kind === 'none' ? 'Taking the decorations down…' : DRESS[kind].busy); await paint();
    let ok = true;
    try{
      if(kind !== 'winter') winterOff();
      if(kind !== 'halloween' && kind !== 'thanksgiving'){ if(HW() && HW().isOn) HW().off(); if(TG() && TG().isOn) TG().off(); }
      if(kind === 'halloween') HW().on(); else if(kind === 'thanksgiving') TG().on(); else if(kind === 'winter') await winterOn(status);
    }catch(e){ ok = false; console.warn('[holiday]', kind, e); if(kind === 'winter') winterOff(); }
    await settle(); lastMs[kind] = Math.round(performance.now() - t0); busy = null;
    const live = $('#holLive'); if(live) live.textContent = !ok ? 'The decorations did not load. Try again.' : kind === 'none' ? 'The decorations are down.' : DRESS[kind].label + ' decorations are up.';
    render(); try{ window.__v33discPlace && __v33discPlace(); }catch(e){}
    ga('holiday_decor', {kind, ms: lastMs[kind], from: o.from || 'panel'}); return ok; }
  /* Design shows the house undecorated (its layouts, paint and furniture tools assume the plain house) */
  function putAway(){ try{ if(W.on) winterOff(); if(HW() && HW().isOn) HW().off(); if(TG() && TG().isOn) TG().off(); }catch(e){ console.warn('[holiday] put away', e); } show.stop(); render(); }
  H.on.mode = m => { if(m === 'design' && current() !== 'none' && !busy) putAway(); else { syncVis(); render(); } };
  H.on.vis = () => { syncVis(); };
  document.addEventListener('click', () => { if(W.on) setTimeout(syncVis, 90); }, true);   // Furniture, Trees and the level buttons: follow whatever the tap changed
  H.on.tod = () => { if(!mine && W.on) W.todMine = false; render(); };

  /* ---------- the control ---------- */
  const ICON = '<svg class="hi" viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M8.6 2.6c.6 3.8 2 5.2 5.8 5.8-3.8.6-5.2 2-5.8 5.8-.6-3.8-2-5.2-5.8-5.8 3.8-.6 5.2-2 5.8-5.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M15.4 12.4c.3 1.7.9 2.3 2.6 2.6-1.7.3-2.3.9-2.6 2.6-.3-1.7-.9-2.3-2.6-2.6 1.7-.3 2.3-.9 2.6-2.6z" fill="currentColor"/></svg>';
  const css = `
  #holBtn .hi,#holRow .hi{color:#a8782a}
  html.halloween #holBtn .hi,html.halloween #holRow .hi{color:#ffb04a}
  #holBtn.on{box-shadow:inset 0 0 0 1.5px #c9a24a,var(--shadow)}
  html.ph #holBtn{display:none!important}
  #phMenu #holRow{display:flex;align-items:center;gap:8px;width:100%}
  #phMenu #holRow .v31val{margin-left:auto;opacity:.7;font-style:normal}
  html:not(.ph) #phMenu #holRow .v31val{font-weight:400;color:var(--muted);opacity:1}
  @media (max-width:1019px){html:not(.ph) #holBtn .hl36{display:none}}
  #holPanel{position:fixed;z-index:62;top:var(--holTop,78px);right:var(--holRight,16px);width:316px;max-width:calc(100vw - 24px);max-height:calc(100vh - var(--holTop,78px) - 14px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:14px 10px 10px;
    border-radius:16px;border:1px solid var(--rim27,rgba(255,255,255,.6));background:var(--glass-hi,rgba(255,252,247,.94));-webkit-backdrop-filter:var(--bf27,none);backdrop-filter:var(--bf27,none);color:var(--ink,#1e1b17);
    box-shadow:0 2px 4px rgba(40,30,20,.06),0 16px 40px rgba(40,30,20,.22);font:400 14px/1.35 Jost,"Avenir Next","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
  #holPanel[hidden]{display:none}
  #holPanel *{box-sizing:border-box}
  #holPanel h2{margin:0 44px 2px 8px;font:600 25px/1.05 "Cormorant Garamond",Georgia,serif;letter-spacing:-.005em;color:inherit;text-shadow:none}
  #holPanel .lede{margin:0 44px 8px 8px;font-size:13.5px;color:var(--muted,#55534c)}
  #holPanel .x{position:absolute;right:8px;top:8px;width:36px;height:36px;border:0;border-radius:50%;background:var(--hov27,rgba(30,27,23,.06));color:inherit;cursor:pointer;display:grid;place-items:center;padding:0}
  #holPanel .x svg{width:14px;height:14px}
  #holPanel .opts{display:grid;gap:2px}
  #holPanel .opt{position:relative;display:grid;grid-template-columns:20px minmax(0,1fr);column-gap:10px;align-items:center;width:100%;min-height:50px;padding:7px 10px 7px 8px;border:0;border-radius:11px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}
  #holPanel .opt:hover{background:var(--hov27,rgba(30,27,23,.06))}
  #holPanel .opt:active{background:rgba(120,100,60,.16)}
  #holPanel .opt[aria-checked=true]{background:var(--sel27,#fff);box-shadow:0 1px 3px rgba(40,30,20,.14)}
  #holPanel .opt .r{width:18px;height:18px;border-radius:50%;border:1.5px solid currentColor;opacity:.55;display:grid;place-items:center}
  #holPanel .opt[aria-checked=true] .r{opacity:1;border-color:#a8782a}
  #holPanel .opt[aria-checked=true] .r::after{content:"";width:9px;height:9px;border-radius:50%;background:#a8782a}
  #holPanel .opt.busy .r{border-color:#a8782a;border-right-color:transparent;opacity:1;animation:hol36spin .7s linear infinite}
  #holPanel .opt.busy .r::after{display:none}
  @keyframes hol36spin{to{transform:rotate(360deg)}}
  #holPanel .opt b{display:block;font-weight:500;font-size:15px;line-height:1.2}
  #holPanel .opt .s{display:block;font-size:13px;line-height:1.3;color:var(--muted,#55534c)}
  #holPanel .opt.busy .s{color:#8a5f16;font-weight:500}
  html.halloween #holPanel .opt.busy .s{color:#ffb04a}
  #holPanel .opt[aria-disabled=true]{opacity:.45;cursor:default;pointer-events:none}
  #holPanel .opt.busy[aria-disabled=true]{opacity:1}
  #holPanel .acts{display:flex;flex-wrap:wrap;gap:8px;margin:10px 4px 2px;padding-top:10px;border-top:1px solid var(--line,rgba(30,27,23,.1))}
  #holPanel .acts[hidden]{display:none}
  #holPanel .act{flex:1 1 130px;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:8px 14px;border-radius:999px;border:1px solid var(--line,rgba(30,27,23,.16));background:var(--btn27,rgba(255,255,255,.6));color:inherit;font:500 14px/1.15 Jost,"Avenir Next",Arial,sans-serif;cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent}
  #holPanel .act:hover{background:var(--sel27,#fff)}
  #holPanel .act:active{transform:scale(.97)}
  #holPanel .act.dark{background:#1f1f1d;border-color:#1f1f1d;color:#fbfaf7}
  #holPanel .act.dark:hover{background:#3a3a36}
  html.halloween #holPanel .act.dark,html.halloween #holShow .done{background:#ff7a1a;border-color:#ff7a1a;color:#1b1020}
  html.halloween #holPanel .act.dark:hover,html.halloween #holShow .done:hover{background:#ff9a4a}
  html.thanksgiving #holPanel .act.dark,html.thanksgiving #holShow .done{background:#9E2B25;border-color:#9E2B25;color:#FFF4E2}
  #holPanel .act svg{width:15px;height:15px;flex:none}
  #holPanel .note{margin:8px 8px 4px;font-size:13px;line-height:1.4;color:var(--muted,#55534c)}
  #holPanel .note[hidden]{display:none}
  #holPanel :focus-visible,#holShow :focus-visible{outline:2px solid #4b5f68;outline-offset:1px}
  html.halloween #holPanel :focus-visible,html.halloween #holShow :focus-visible{outline-color:#ffb04a}
  html.ph #holPanel{top:auto;right:8px;left:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));width:auto;max-width:none;max-height:calc(100vh - 76px);max-height:calc(100dvh - 76px);padding:12px 8px 8px;border-radius:18px;background:var(--pgs,rgba(255,252,247,.96));color:var(--pt,#1e1b17)}
  html.ph #holPanel h2{font-size:23px}
  html.ph #holPanel .lede{display:none}
  html.ph #holPanel .opts{grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
  html.ph #holPanel .opt{min-height:58px;padding:7px 8px;column-gap:8px;border:1px solid var(--pl,rgba(30,27,23,.1));align-items:start}
  html.ph #holPanel .opt .r{margin-top:1px}
  html.ph #holPanel .opt b{font-size:14.5px}
  html.ph #holPanel .opt .s{font-size:12.5px}
  #holShow{position:fixed;z-index:62;left:50%;bottom:var(--holBot,76px);transform:translateX(-50%);display:flex;align-items:center;gap:4px;max-width:calc(100vw - 16px);box-sizing:border-box;padding:5px;border-radius:999px;
    border:1px solid var(--rim27,rgba(255,255,255,.6));background:var(--glass-hi,rgba(255,252,247,.94));color:var(--ink,#1e1b17);box-shadow:0 2px 4px rgba(40,30,20,.06),0 12px 32px rgba(40,30,20,.24);font:400 14px/1.2 Jost,"Avenir Next",Arial,sans-serif;-webkit-font-smoothing:antialiased}
  #holShow[hidden]{display:none}
  #holShow button{flex:none;height:40px;min-width:40px;border:0;border-radius:999px;background:none;color:inherit;font:500 14px/1 Jost,"Avenir Next",Arial,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;-webkit-tap-highlight-color:transparent}
  #holShow button:hover{background:var(--hov27,rgba(30,27,23,.06))}
  #holShow button svg{width:16px;height:16px;flex:none}
  #holShow .cap{flex:1 1 auto;min-width:0;padding:0 6px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #holShow .cap b{font:600 18px/1.1 "Cormorant Garamond",Georgia,serif}
  #holShow .cap i{font-style:normal;font-size:12.5px;color:var(--muted,#55534c);margin-left:8px}
  #holShow .sep{flex:none;width:1px;height:22px;background:var(--line,rgba(30,27,23,.14));margin:0 2px}
  #holShow .dk[aria-pressed=true]{background:#1f2948;color:#f4f1e8}
  #holShow .done{background:#1f1f1d;color:#fbfaf7;padding:0 14px}
  #holShow .done:hover{background:#3a3a36}
  html.ph #holShow{left:8px;right:8px;transform:none;max-width:none}
  html.ph #holShow .cap i{display:block;margin:1px 0 0}
  html.ph #holShow .cap b{font-size:17px}
  html.ph #holShow .dk span{display:none}
  #holVeil{position:fixed;inset:0;z-index:3;background:#0d1220;opacity:0;pointer-events:none;transition:opacity .24s}
  #holVeil.on{opacity:1}
  #holLive{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  html.uidle27 #holShow,html.clean27 #holShow{opacity:.0;visibility:hidden;pointer-events:none;transition:opacity .5s ease,visibility 0s linear .5s}
  @media (prefers-reduced-motion:reduce){#holVeil{transition:none}#holPanel .opt.busy .r{animation-duration:1.8s}}`;
  let btn = null, row = null, panel = null, opener = null, bar = null, veil = null;
  const SUN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="3.4"/><path d="M10 2.6v1.8M10 15.6v1.8M2.6 10h1.8M15.6 10h1.8M4.8 4.8l1.3 1.3M13.9 13.9l1.3 1.3M4.8 15.2l1.3-1.3M13.9 6.1l1.3-1.3"/></svg>';
  const MOON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M15.8 11.9A6.4 6.4 0 0 1 8.1 4.2a6.4 6.4 0 1 0 7.7 7.7z"/></svg>';
  const EYE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.2"/></svg>';
  function build(){
    const st = document.createElement('style'); st.id = 'hol36css'; st.textContent = css; document.head.appendChild(st);
    const view = document.getElementById('viewBtn'), menu = document.getElementById('phMenu');
    /* desktop: a pill in the header, beside View */
    btn = document.createElement('button'); btn.type = 'button'; btn.id = 'holBtn'; btn.className = 'tod vbtn27'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'holPanel');
    btn.title = 'See the house decorated for the holidays'; btn.innerHTML = ICON + '<span class="hl36">Holiday decor</span>';
    if(view && view.parentNode) view.parentNode.insertBefore(btn, view); else { const b = $('header.bar'); if(b) b.appendChild(btn); }
    btn.addEventListener('click', e => { e.stopPropagation(); toggle(btn); });
    /* phones (and the desktop View menu): a row near the top of the menu */
    if(menu){ row = document.createElement('button'); row.type = 'button'; row.id = 'holRow'; row.className = 'tod v33stg'; row.setAttribute('aria-haspopup', 'dialog'); row.title = btn.title;
      row.innerHTML = ICON + '<span>Holiday decor</span><em class="v31val"></em>';
      const after = document.getElementById('phDoll'); if(after && after.parentNode === menu) menu.insertBefore(row, after.nextSibling); else menu.insertBefore(row, menu.firstChild);
      row.addEventListener('click', e => { e.stopPropagation(); closeMenus(); open(isPh() ? document.getElementById('phMore') : btn); }); }
    panel = document.createElement('div'); panel.id = 'holPanel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'holH');
    panel.innerHTML = '<h2 id="holH">Holiday decor</h2><p class="lede">See the house dressed for the season.</p><div class="opts" role="radiogroup" aria-labelledby="holH">'
      + KINDS.map(k => '<button type="button" class="opt" role="radio" aria-checked="false" data-k="' + k + '"><span class="r" aria-hidden="true"></span><span><b>' + DRESS[k].label + '</b><span class="s"></span></span></button>').join('')
      + '</div><p class="note" id="holNote" hidden>Design shows the house undecorated. Go to Tour, Walk or Dollhouse to decorate it.</p>'
      + '<div class="acts" hidden><button type="button" class="act" data-a="dusk"></button><button type="button" class="act dark" data-a="show">' + EYE + '<span>Show me the best views</span></button></div>'
      + '<button type="button" class="x" aria-label="Close"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button>';
    document.body.appendChild(panel);
    const live = document.createElement('div'); live.id = 'holLive'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); document.body.appendChild(live);
    panel.addEventListener('click', e => { const o = e.target.closest('.opt'), a = e.target.closest('.act');
      if(e.target.closest('.x')) return close(true);
      if(o){ if(o.getAttribute('aria-disabled') === 'true') return; set(o.dataset.k); return; }
      if(a){ if(a.dataset.a === 'dusk') dusk(H.tod !== 'dusk'); else { close(false); show.start(); } } });
    panel.addEventListener('keydown', e => { e.stopPropagation();
      if(e.key === 'Escape'){ e.preventDefault(); close(true); return; }
      const os = [...panel.querySelectorAll('.opt')], i = os.indexOf(document.activeElement);
      if(i >= 0 && /^Arrow(Down|Up|Left|Right)$/.test(e.key)){ e.preventDefault(); os[(i + (/Down|Right/.test(e.key) ? 1 : os.length - 1)) % os.length].focus(); } });
    panel.addEventListener('keyup', e => e.stopPropagation());
    for(const ev of ['pointerdown', 'wheel', 'touchstart']) panel.addEventListener(ev, e => e.stopPropagation(), {passive: true});
    addEventListener('pointerdown', e => { if(panel.hidden) return; const t = e.target; if(panel.contains(t) || (btn && btn.contains(t)) || (row && row.contains(t))) return; if(busy) return; close(false); }, true);
    addEventListener('resize', () => { place(); placeBar(); });
    /* the caption bar for "Show me", and the veil that covers a jump indoors */
    bar = document.createElement('div'); bar.id = 'holShow'; bar.hidden = true; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Best views of the decorations');
    bar.innerHTML = '<button type="button" data-a="prev" aria-label="Previous view"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg></button>'
      + '<span class="cap" aria-live="polite"><b></b><i></i></span>'
      + '<button type="button" data-a="next" aria-label="Next view"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg></button>'
      + '<span class="sep" aria-hidden="true"></span><button type="button" class="dk" data-a="dusk" aria-pressed="false">' + MOON + '<span>Dusk</span></button><button type="button" class="done" data-a="done">Done</button>';
    document.body.appendChild(bar);
    bar.addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; e.stopPropagation(); const a = b.dataset.a; show.auto(false);
      if(a === 'prev') show.go(show.i - 1); else if(a === 'next') show.go(show.i + 1); else if(a === 'dusk') dusk(H.tod !== 'dusk'); else show.stop(); });
    bar.addEventListener('keydown', e => { e.stopPropagation(); if(e.key === 'Escape') show.stop(); });
    for(const ev of ['pointerdown', 'wheel', 'touchstart']) bar.addEventListener(ev, e => e.stopPropagation(), {passive: true});
    veil = document.createElement('div'); veil.id = 'holVeil'; veil.setAttribute('aria-hidden', 'true'); (document.getElementById('app') || document.body).appendChild(veil);
    render(); }
  function closeMenus(){ try{ if(root.classList.contains('vmo27')){ const v = document.getElementById('viewBtn'); v && v.click(); } if(window.__phone && __phone.setMenu) __phone.setMenu(false); }catch(e){} }
  function place(){ if(!panel || panel.hidden || isPh()) return; const a = btn && btn.offsetParent ? btn : document.getElementById('viewBtn'); if(!a) return; const r = a.getBoundingClientRect();
    panel.style.setProperty('--holTop', Math.round(r.bottom + 8) + 'px'); panel.style.setProperty('--holRight', Math.max(12, Math.round(innerWidth - r.right)) + 'px'); }
  function placeBar(){ if(!bar || bar.hidden) return; let top = innerHeight; for(const q of document.querySelectorAll('#card, .phlvbar')){ if(!q.offsetParent) continue; const r = q.getBoundingClientRect(); if(r.height > 4 && r.top > innerHeight * .45 && (isPh() || r.right > innerWidth / 2 - 190)) top = Math.min(top, r.top); }
    bar.style.setProperty('--holBot', Math.max(isPh() ? 12 : 64, Math.round(innerHeight - top + 10)) + 'px'); }
  function render(){ if(!panel) return; const cur = current(), design = H.mode === 'design', on = cur !== 'none';
    for(const o of panel.querySelectorAll('.opt')){ const k = o.dataset.k, b = busy === k; o.setAttribute('aria-checked', String(busy ? b : k === cur)); o.classList.toggle('busy', b);
      o.setAttribute('aria-disabled', String(!!busy || (design && k !== 'none'))); if(!b) o.querySelector('.s').textContent = DRESS[k].sub; o.tabIndex = (busy ? b : k === cur) ? 0 : -1; }
    $('#holNote').hidden = !design;
    const acts = panel.querySelector('.acts'); acts.hidden = !on || !!busy || design;
    const dk = acts.querySelector('[data-a=dusk]'), night = H.tod === 'dusk'; dk.hidden = cur !== 'winter'; dk.innerHTML = (night ? SUN : MOON) + '<span>' + (night ? 'See it by day' : 'See it at dusk') + '</span>';
    btn.classList.toggle('on', on); btn.querySelector('.hl36').textContent = on ? DRESS[cur].label : 'Holiday decor'; btn.setAttribute('aria-label', on ? 'Holiday decor: ' + DRESS[cur].label : 'Holiday decor');
    if(row) row.querySelector('.v31val').textContent = on ? DRESS[cur].label : 'Off';
    if(bar){ const d = bar.querySelector('.dk'); d.hidden = cur !== 'winter'; d.setAttribute('aria-pressed', String(night)); d.setAttribute('aria-label', night ? 'See it by day' : 'See it at dusk'); d.innerHTML = (night ? SUN : MOON) + '<span>' + (night ? 'Day' : 'Dusk') + '</span>'; bar.querySelector('.sep').hidden = d.hidden; } }
  function open(from){ if(!panel) return; opener = from || btn; panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); render(); place();
    const f = panel.querySelector('.opt[aria-checked=true]') || panel.querySelector('.opt'); if(f) try{ f.focus({preventScroll: true}); }catch(e){}
    try{ window.__v33discPlace && __v33discPlace(); }catch(e){} ga('holiday_open'); }
  function close(refocus){ if(!panel || panel.hidden) return; panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); const o = opener; opener = null; if(refocus && o && o.isConnected && o.offsetParent) try{ o.focus({preventScroll: true}); }catch(e){}
    try{ window.__v33discPlace && __v33discPlace(); }catch(e){} }
  function toggle(from){ if(panel.hidden) open(from); else close(true); }

  /* ---------- "Show me": the three or four best places to stand ---------- */
  const show = {i: -1, list: null, t: 0, on: false,
    start(o){ const k = current(); if(k === 'none' || busy) return false; this.list = DRESS[k].views; this.on = true; close(false);
      if(H.mode !== 'tour') try{ H.setMode('tour'); }catch(e){}
      bar.hidden = false; placeBar(); render(); this.go(0, true); this.auto(!(o && o.auto === false) && !reduce); ga('holiday_show', {kind: k});
      try{ window.__v33discPlace && __v33discPlace(); }catch(e){} return true; },
    go(i, first, own){ const L = this.list; if(!L) return; const now = performance.now(); if(!own && now - (this.autoAt || 0) < 900) return; if(own) this.autoAt = now; this.i = (i + L.length) % L.length; const v = L[this.i], tall = H.camera.aspect < .8, pos = tall && v.posP ? v.posP : v.pos, look = tall && v.lookP ? v.lookP : v.look;
      bar.querySelector('.cap b').textContent = v.t; bar.querySelector('.cap i').textContent = (this.i + 1) + ' of ' + L.length;
      const c = H.camera.position, far = Math.hypot(c.x - pos[0], c.y - pos[1], c.z - pos[2]) > 46, wasIn = H.inside(c);
      if(reduce){ H.look(pos, look); return; }
      if(v.inside || wasIn || far){ veil.classList.add('on'); clearTimeout(this.vt); this.vt = setTimeout(() => { try{ H.look(pos, look); }catch(e){} setTimeout(() => veil.classList.remove('on'), 140); }, 260); }
      else H.flyTo(pos, look, first ? 1.8 : 1.6); },
    auto(on){ clearInterval(this.t); this.t = 0; if(!on) return; let n = 0; this.t = setInterval(() => { if(!this.on) return this.auto(false); if(document.hidden) return; if(++n >= this.list.length){ this.auto(false); return; } this.go(this.i + 1, false, true); }, 8000); },
    stop(){ if(!this.on) return; this.on = false; this.auto(false); clearTimeout(this.vt); if(veil) veil.classList.remove('on'); if(bar) bar.hidden = true; this.list = null; this.i = -1; try{ window.__v33discPlace && __v33discPlace(); }catch(e){} }};
  /* moving on your own ends the slideshow's own pace (the bar stays, so the next view is one tap away) */
  { const cv = document.getElementById('c'); if(cv) for(const ev of ['pointerdown', 'wheel']) cv.addEventListener(ev, () => { if(show.on) show.auto(false); }, {passive: true}); }
  document.addEventListener('click', e => { if(show.on && e.target && e.target.closest && e.target.closest('#card, #mini, nav.tabs, #cv27, #wplabels, #labels')) show.stop(); }, true);
  setInterval(() => { if(bar && !bar.hidden){ placeBar(); if(H.mode !== 'tour' || current() === 'none') show.stop(); } }, 700);

  build();

  /* ---------- ?holiday=winter|thanksgiving|halloween (&dusk=1): open the tour already dressed, once the first view is up ---------- */
  { const m = /[?&]holiday=(winter|thanksgiving|halloween)\b/.exec(location.search), wantDusk = /[?&]dusk=1\b/.test(location.search);
    if(m){ const kind = m[1], t0 = performance.now(); (function wait(){ const L = document.getElementById('loading'), up = (L && (!L.classList.contains('done') || +getComputedStyle(L).opacity > .05)) || !!document.getElementById('intro28');   // the loading photo has faded out, and the loading pictures are gone (they stay up until a first-time visitor taps "Step inside")
        if((up || !H.ready) && performance.now() - t0 < 600000) return setTimeout(wait, 300);
        setTimeout(async () => { if(current() !== 'none' || H.mode === 'design') return; const ok = await set(kind, {from: 'link'}); if(!ok) return;
          if(kind === 'winter' && wantDusk) dusk(true);
          if(H.mode === 'tour' && !/[?&]stop=/.test(location.search)) show.start({auto: false}); }, 700); })(); } }

  window.HOLIDAY = {set, dusk, get current(){ return current(); }, get busy(){ return busy; }, show: o => show.start(o), stopShow: () => show.stop(), open: () => open(btn), close: () => close(false),
    state: () => ({current: current(), busy, mode: H.mode, tod: H.tod, winter: {on: W.on, built: W.built, count: W.P ? W.P.count() : null, visible: W.P ? W.P.root.visible : false}, ms: Object.assign({}, lastMs), show: show.on ? show.i : null, panel: panel ? !panel.hidden : false}),
    get props(){ return W.P; }, WINTER, DRESS};
})();
