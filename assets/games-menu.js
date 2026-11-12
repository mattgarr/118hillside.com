/* The Games button on the 3D tour (118hillside.com/tour/, and the old /thanksgiving/ and /halloween/ copies of it).
   One tap opens this picker of the five current games, at once and without touching the house. Each row is a real link to the
   tour page with that game's parameter; a tapped row shows that it is loading, and the page's own loading screen takes over on
   the next page. Links are built from the current address, so they also work on a preview mirror served from a sub-path.
   window.GAMESMENU = {open(fromButton), close(), list()}. */
(function(){
  'use strict';
  if(window.GAMESMENU) return;
  var ga = function(n, p){ try{ window.gtag && gtag('event', n, p || {}); }catch(e){} };

  /* the same five games, names and ages as games/index.html; one fresh line each */
  var GAMES = {
    feast: {q: 'feast=1', title: 'Thanksgiving at Hillside', age: 'Ages 7 and up', line: 'Snowball hid dinner all over the house. Follow his clues and carry it to the table.'},
    deck: {q: 'deck=1', title: 'Deck the House with Snowball', age: 'All ages', line: 'Every animal has a wish. Decorate the house and light it up at dusk.'},
    snowball: {q: 'snowball=1', title: 'Where’s Snowball?', age: 'Ages 5 and up', line: 'Snowball’s hiding, and he’s good at it. Work out which room, then spot him.'},
    escape: {q: 'escape=1', title: 'Locked In at Hillside', age: 'Three levels, ages 8 and up', line: 'An escape room in three levels, from a quick one to a whole-house heist. Move the sun and read the light.'},
    room: {q: 'room=1', title: 'Room for Everyone', age: 'Ages 10 and up', line: 'A logic puzzle. Snowball’s friends are staying over, and they all want the right room.'}};
  /* seasons as on the games page: Thanksgiving leads from 1 to 27 November, Deck the House from 28 November to 6 January and the rest of the year */
  var SEASONS = [{id: 'feast', from: '11-01', to: '11-27'}, {id: 'deck', from: '11-28', to: '01-06'}];
  function md(d){ return ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function inSeason(s, t){ return s.from <= s.to ? (t >= s.from && t <= s.to) : (t >= s.from || t <= s.to); }
  function order(date){ var t = md(date || new Date()), live = SEASONS.filter(function(s){ return inSeason(s, t); })[0], first = live || SEASONS[1], second = SEASONS.filter(function(s){ return s !== first; })[0];
    return {ids: [first.id, second.id, 'snowball', 'escape', 'room'], live: live ? live.id : null}; }

  /* addresses relative to this page: /tour/ here, ../tour/ from the old seasonal pages; index.html is kept when the page was opened with it (preview mirrors) */
  function paths(){ var p = location.pathname, idx = /index\.html$/.test(p) ? 'index.html' : '', dir = p.replace(/[^\/]*$/, ''), up = /\/tour\/$/.test(dir) ? dir.replace(/tour\/$/, '') : dir.replace(/[^\/]+\/$/, '');
    return {tour: up + 'tour/' + idx, games: up + 'games/' + idx}; }
  function list(date){ var P = paths(), o = order(date); return o.ids.map(function(id){ var g = GAMES[id]; return {id: id, title: g.title, age: g.age, line: g.line, href: P.tour + '?' + g.q, season: o.live === id}; }); }

  var css = '\
#gm36{box-sizing:border-box;width:min(452px,calc(100vw - 20px));max-width:none;max-height:calc(100vh - 20px);max-height:calc(100dvh - 20px);margin:auto;padding:0;border:0;border-radius:20px;background:#fbfaf7;color:#1f1f1d;\
  font:400 15px/1.4 Jost,"Avenir Next","Helvetica Neue",Arial,sans-serif;box-shadow:0 30px 90px rgba(10,10,8,.45);overflow:hidden;-webkit-font-smoothing:antialiased;color-scheme:light}\
#gm36::backdrop{background:rgba(18,18,16,.5)}\
#gm36[open]{display:flex;flex-direction:column;animation:gm36in .18s ease-out}\
@keyframes gm36in{from{opacity:0;transform:translateY(8px) scale(.985)}}\
#gm36 *{box-sizing:border-box}\
#gm36 .hd{flex:none;padding:20px 60px 10px 22px}\
#gm36 h2{margin:0;font:600 30px/1.05 "Cormorant Garamond",Georgia,serif;letter-spacing:-.005em;color:#1f1f1d}\
#gm36 .hd p{margin:5px 0 0;font-size:14.5px;line-height:1.4;color:#67665f}\
#gm36 .ls{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;margin:0;padding:2px 10px 4px;list-style:none}\
#gm36 .ls li{margin:0;padding:0}\
#gm36 .ls li + li{border-top:1px solid #e9e5dc}\
#gm36 a.row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 22px;column-gap:10px;align-items:center;min-height:68px;padding:11px 12px;border-radius:13px;text-decoration:none;color:inherit;-webkit-tap-highlight-color:transparent;transition:background-color .12s}\
#gm36 a.row:hover{background:#f1eee6}\
#gm36 a.row:active,#gm36 a.row.go{background:#e9e4d8}\
#gm36 a.row:focus-visible,#gm36 .x:focus-visible,#gm36 .all:focus-visible{outline:2px solid #4b5f68;outline-offset:1px}\
#gm36 .t{display:block;font:600 22px/1.1 "Cormorant Garamond",Georgia,serif;color:#1f1f1d}\
#gm36 .s{display:block;margin-top:3px;font-size:14.5px;line-height:1.35;color:#55534c}\
#gm36 .m{display:block;margin-top:5px;font-size:12px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:#7a6a4f}\
#gm36 .m i{font-style:normal;color:#9b2c3c}\
#gm36 .m i::after{content:"\\00b7";margin:0 6px;color:#b9b2a2}\
#gm36 .ch{width:22px;height:22px;display:grid;place-items:center;color:#8d897f}\
#gm36 .ch svg{width:16px;height:16px}\
#gm36 .ch .sp{display:none;width:16px;height:16px;border-radius:50%;border:2px solid #9b2c3c;border-right-color:transparent;animation:gm36spin .7s linear infinite}\
@keyframes gm36spin{to{transform:rotate(360deg)}}\
#gm36 a.row.go .ch svg{display:none}#gm36 a.row.go .ch .sp{display:block}\
#gm36 a.row.go .s{color:#9b2c3c;font-weight:500}\
#gm36.going a.row:not(.go){opacity:.42;pointer-events:none}\
#gm36 .ft{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 22px 16px;border-top:1px solid #e9e5dc;font-size:13.5px;color:#67665f}\
#gm36 .all{color:#1f1f1d;font-weight:500;text-underline-offset:3px;border-radius:4px;padding:6px 2px}\
#gm36 .x{position:absolute;right:12px;top:12px;width:40px;height:40px;border:0;border-radius:50%;background:#efece4;color:#1f1f1d;cursor:pointer;display:grid;place-items:center;padding:0}\
#gm36 .x:hover{background:#e4dfd3}#gm36 .x svg{width:16px;height:16px}\
@media (max-width:480px){#gm36 .hd{padding:18px 58px 8px 18px}#gm36 h2{font-size:27px}#gm36 .ls{padding:2px 6px 4px}#gm36 .t{font-size:21px}#gm36 .ft{padding:10px 18px 14px}}\
@media (max-height:560px){#gm36 .hd p{display:none}#gm36 a.row{min-height:56px;padding:8px 12px}#gm36 .m{margin-top:3px}}\
@media (prefers-reduced-motion:reduce){#gm36[open]{animation:none}#gm36 .ch .sp{animation-duration:1.6s}}';

  var dlg = null, opener = null, going = false;
  function esc(t){ return String(t).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function build(){
    if(dlg) return dlg;
    var st = document.createElement('style'); st.id = 'gm36css'; st.textContent = css; document.head.appendChild(st);
    dlg = document.createElement('dialog'); dlg.id = 'gm36'; dlg.setAttribute('aria-labelledby', 'gm36h'); dlg.setAttribute('aria-describedby', 'gm36p');
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function(e){ if(e.target === dlg && !going) close(); });          // a tap on the dimmed page around the card
    dlg.addEventListener('cancel', function(e){ if(going) e.preventDefault(); });                    // Escape closes it, unless a game is already loading
    dlg.addEventListener('close', function(){ var o = opener; opener = null; if(o){ o.setAttribute('aria-expanded', 'false'); if(o.isConnected) try{ o.focus({preventScroll: true}); }catch(e){} } });
    dlg.addEventListener('keydown', function(e){ e.stopPropagation(); });                             // arrow keys and the space bar must not walk the tour behind the card
    dlg.addEventListener('keyup', function(e){ e.stopPropagation(); });
    return dlg; }
  function render(){
    var L = list(), P = paths(), h = '<div class="hd"><h2 id="gm36h">Games in this house</h2><p id="gm36p">Five games, each played inside this 3D model.</p></div><ul class="ls">';
    L.forEach(function(g){ h += '<li><a class="row" href="' + esc(g.href) + '" data-g="' + g.id + '"><span class="tx"><span class="t">' + esc(g.title) + '</span><span class="s" data-s="' + esc(g.line) + '">' + esc(g.line) + '</span><span class="m">' + (g.season ? '<i>In season</i>' : '') + esc(g.age) + '</span></span>'
      + '<span class="ch" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 10.5 8 6 12.5"/></svg><span class="sp"></span></span></a></li>'; });
    h += '</ul><div class="ft"><span>Each one opens here in the tour.</span><a class="all" href="' + esc(P.games) + '">See all games</a></div>'
      + '<button type="button" class="x" aria-label="Close"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button>';
    dlg.innerHTML = h; dlg.classList.remove('going'); going = false;
    dlg.querySelector('.x').addEventListener('click', function(){ close(); });
    dlg.querySelector('.all').addEventListener('click', function(){ ga('games_menu_all'); });
    [].forEach.call(dlg.querySelectorAll('a.row'), function(a){ a.addEventListener('click', function(e){ pick(a, e); }); }); }
  /* a tapped row answers at once: pressed, a spinner, "Loading..."; then the browser goes there */
  function pick(a, e){
    if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;   // open in a new tab: leave this one as it is
    e.preventDefault(); if(going) return; going = true;
    a.classList.add('go'); a.setAttribute('aria-busy', 'true'); dlg.classList.add('going');
    var s = a.querySelector('.s'); s.textContent = 'Loading…'; s.setAttribute('role', 'status');
    ga('games_pick', {game: a.dataset.g, from: 'tour_menu'});
    var href = a.href, done = false, leave = function(){ if(done) return; done = true; location.href = href; };
    requestAnimationFrame(function(){ requestAnimationFrame(leave); }); setTimeout(leave, 160); }   // let the pressed row paint first (a hidden tab gets no frames, so a timer backs it up)
  function open(from){
    if(/[?&]nogame=1\b/.test(location.search)) return false;
    build(); if(dlg.open) return true; render();
    opener = from && from.focus ? from : null; if(opener) opener.setAttribute('aria-expanded', 'true');
    try{ dlg.showModal(); }catch(e){ location.href = paths().games; return false; }   // a browser without <dialog>: the games page has the same five
    var f = dlg.querySelector('a.row'); if(f) try{ f.focus({preventScroll: true}); }catch(e){}
    ga('games_menu_open'); return true; }
  function close(){ if(dlg && dlg.open) dlg.close(); }
  addEventListener('pageshow', function(e){ if(e.persisted && dlg){ going = false; if(dlg.open) dlg.close(); } });   // back from a game: the picker is not left spinning
  window.GAMESMENU = {open: open, close: close, list: list, order: order, paths: paths, get isOpen(){ return !!(dlg && dlg.open); }};
})();
