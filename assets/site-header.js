/* 118hillside.com shared site header. One file for every page: put <header id="siteHeader"></header> at the top of <body>
   and load this script. Desktop: The Home ▾ · 3D Tour · Games ▾ · [Schedule a Showing]. Phone: 3D Tour · Games · ☰ sheet. */
(function () {
  var css = '' +
  '#siteHeader{position:sticky;top:0;z-index:50;background:rgba(251,250,247,.94);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-bottom:1px solid #e5e1d8;font-family:"Jost","Avenir Next","Helvetica Neue",Arial,sans-serif}' +
  '#siteHeader .sh{max-width:1180px;margin:0 auto;padding:0 20px;height:62px;display:flex;align-items:center;justify-content:space-between;gap:14px}' +
  '#siteHeader .shBrand{font-family:"Cormorant Garamond",Georgia,serif;font-size:23px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;color:#1f1f1d;white-space:nowrap}' +
  '#siteHeader .shNav{display:flex;align-items:center;gap:8px}' +
  '#siteHeader .shItem{position:relative}' +
  '#siteHeader .shBtn{display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 16px;border:1px solid #d9d3c7;border-radius:999px;background:#fff;color:#1f1f1d;font:inherit;font-size:12.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;cursor:pointer;white-space:nowrap;transition:border-color .15s,background .15s}' +
  '#siteHeader .shBtn:hover,#siteHeader .shItem.open>.shBtn{border-color:#1f1f1d}' +
  '#siteHeader .shBtn.cur{border-color:#a8865b;color:#7d6038}' +
  '#siteHeader .shNav .shBtn{background:#1f1f1d;border-color:#1f1f1d;color:#fbfaf7}#siteHeader .shNav .shBtn:hover,#siteHeader .shNav .shItem.open>.shBtn{background:#3a3a36;border-color:#3a3a36}' +
  '#siteHeader .shBtn.games:hover,#siteHeader .shBtn.tour:hover,#siteHeader .shItem.open>.shBtn.games{background:#3a3a36;border-color:#3a3a36}' +
  '#siteHeader .shBtn.primary{background:#1f1f1d;border-color:#1f1f1d;color:#fbfaf7}' +
  '#siteHeader .shBtn.primary:hover{background:#3a3a36}' +
  '#siteHeader .car{font-size:10px;opacity:.7;transition:transform .15s}' +
  '#siteHeader .shItem.open .car{transform:rotate(180deg)}' +
  '#siteHeader .shMenu{position:absolute;top:calc(100% + 8px);left:0;min-width:220px;background:#fff;border:1px solid #e5e1d8;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.12);padding:6px;display:none}' +
  '#siteHeader .shItem.open .shMenu{display:block}' +
  '#siteHeader .shMenu a{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:8px;color:#1f1f1d;text-decoration:none;font-size:15px;white-space:nowrap}' +
  '#siteHeader .shMenu a:hover{background:#f3f0ea}' +
  '#siteHeader .shMenu small{color:#8a877e;font-size:12px;letter-spacing:.06em}' +
  '#siteHeader .shMenu hr{border:0;border-top:1px solid #eee9e0;margin:4px 6px}' +
  '#siteHeader .shBurger{display:none;width:44px;height:42px;border:1px solid #1f1f1d;border-radius:999px;background:#1f1f1d;font-size:18px;cursor:pointer;color:#fbfaf7}#siteHeader .shBurger:hover{background:#3a3a36}' +
  '#shSheet{position:fixed;inset:62px 0 0 0;z-index:49;background:#fbfaf7;overflow:auto;padding:12px 20px 32px;display:none;font-family:"Jost","Avenir Next",Arial,sans-serif}' +
  '#shSheet.open{display:block}' +
  '#shSheet .row{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:56px;padding:0 4px;border:0;border-bottom:1px solid #e5e1d8;background:none;font:inherit;font-size:19px;color:#1f1f1d;text-decoration:none;text-align:left;cursor:pointer}' +
  '#shSheet .sub{display:none;padding:2px 0 8px 14px}' +
  '#shSheet .sub.open{display:block}' +
  '#shSheet .sub a{display:flex;justify-content:space-between;min-height:48px;align-items:center;color:#4b4a45;text-decoration:none;font-size:17px}' +
  '#shSheet .sub small{color:#8a877e;font-size:13px}' +
  '#shSheet .ctaHead{margin:24px 4px 10px;font-size:12.5px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#7d6038}#shSheet .ctas{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:6px}#shSheet .cta{display:flex;justify-content:center;align-items:center;min-height:56px;border-radius:999px;background:#1f1f1d;color:#fbfaf7;text-decoration:none;font-size:15px;font-weight:500}' +
  '#siteHeader .shMenu.shRight{left:auto;right:0}' +
  '@media (max-width:980px){#siteHeader .shHome,#siteHeader .shShow{display:none}#siteHeader .shBurger{display:inline-block}#siteHeader .shItem .shMenu{display:none!important}#siteHeader .car{display:none}}' +
  '#siteHeader .shBrand .s{display:none}' +
  '@media (max-width:520px){#siteHeader .sh{padding:0 10px;gap:6px}#siteHeader .shNav{gap:6px}#siteHeader .shBrand{font-size:22px;letter-spacing:.05em;font-weight:600}#siteHeader .shBrand .l{display:none}#siteHeader .shBrand .s{display:inline}#siteHeader .shBtn{height:40px;padding:0 11px;font-size:11.5px;letter-spacing:.06em}#siteHeader .shBurger{width:40px;height:40px}}' +
  '@media (max-width:360px){#siteHeader .shBrand{font-size:19px;letter-spacing:.03em}#siteHeader .shBtn{padding:0 9px}#siteHeader .shBurger{width:38px}}';

  var path = location.pathname;
  var home = '/', HOME = [['Overview', '/#home'], ['Details', '/#details'], ['Gallery', '/#gallery'], ['Contact', '/#contact']];
  var GAMES = [['All games', '/games/', ''], ['Halloween', '/games/?season=halloween', ''], ['Thanksgiving', '/games/?season=thanksgiving', ''], ['Christmas', '/games/?season=christmas', 'soon']];
  var TOUR = [['Guided tour', '/tour/'], ['Walk around', '/tour/?view=walk'], ['Dollhouse', '/tour/?view=doll'], ['Design ideas', '/tour/?view=design']];
  var SHOW = [['Call Michael', 'tel:+16503150224', '650.315.0224'], ['Text Michael', 'sms:+16503150224', ''], ['Email Michael', 'mailto:Michael@MichaelWarrenRealEstate.com?subject=Showing%20request%3A%20118%20Hillside%20Drive', ''], ['Agent details', '/#contact', '']];
  var onGames = /^\/games\//.test(path), onTour = /^\/tour\//.test(path);
  function links(list) { return list.map(function (l) { return '<a href="' + l[1] + '">' + l[0] + (l[2] ? '<small>' + l[2] + '</small>' : '') + '</a>'; }).join(''); }

  var h = document.getElementById('siteHeader'); if (!h) return;
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  h.innerHTML = '<div class="sh">' +
    '<a class="shBrand" href="' + home + '"><span class="l">118 Hillside Drive</span><span class="s">118 Hillside</span></a>' +
    '<nav class="shNav" aria-label="Site">' +
      '<div class="shItem shHome"><button class="shBtn" aria-haspopup="true" aria-expanded="false">The Home <span class="car">▼</span></button><div class="shMenu" role="menu">' + links(HOME) + '</div></div>' +
      '<div class="shItem shTour"><a class="shBtn tour" href="/tour/" aria-haspopup="true" aria-expanded="false">3D Tour <span class="car">▼</span></a><div class="shMenu" role="menu">' + links(TOUR) + '</div></div>' +
      '<div class="shItem shGames"><a class="shBtn games" href="/games/" aria-haspopup="true" aria-expanded="false">Games <span class="car">▼</span></a><div class="shMenu" role="menu">' + links(GAMES.slice(0, 1)) + '<hr>' + links(GAMES.slice(1)) + '</div></div>' +
      '<div class="shItem shShow"><a class="shBtn primary" href="/#contact" aria-haspopup="true" aria-expanded="false">Schedule a Showing <span class="car">▼</span></a><div class="shMenu shRight" role="menu">' + links(SHOW) + '</div></div>' +
      '<button class="shBurger" aria-label="Menu" aria-expanded="false">☰</button>' +
    '</nav></div>';

  var sheet = document.createElement('div'); sheet.id = 'shSheet';
  sheet.innerHTML = '<button class="row" data-sub="h">The Home <span>▾</span></button><div class="sub" id="shSubH">' + links(HOME) + '</div>' +
    '<button class="row" data-sub="t">3D Tour <span>▾</span></button><div class="sub" id="shSubT">' + links(TOUR) + '</div>' +
    '<button class="row" data-sub="g">Games <span>▾</span></button><div class="sub" id="shSubG">' + links(GAMES) + '</div>' +
    '<button class="row" data-sub="s">Schedule a Showing <span>▾</span></button><div class="sub open" id="shSubS">' + links(SHOW) + '</div>';
  document.body.appendChild(sheet);

  var items = h.querySelectorAll('.shItem'), burger = h.querySelector('.shBurger'), fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  function closeAll(except) { items.forEach(function (it) { if (it !== except) { it.classList.remove('open'); it.firstChild.setAttribute('aria-expanded', 'false'); } }); }
  function narrow() { return innerWidth <= 980; }
  items.forEach(function (it) {
    var b = it.firstChild, t = 0;
    if (fine) {
      it.addEventListener('mouseenter', function () { if (narrow()) return; clearTimeout(t); closeAll(it); it.classList.add('open'); b.setAttribute('aria-expanded', 'true'); });
      it.addEventListener('mouseleave', function () { t = setTimeout(function () { it.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }, 180); });
    }
    b.addEventListener('click', function (e) {
      if (narrow()) return;                                   // phone: Games goes straight to the library
      if (b.tagName === 'A' && it.classList.contains('open') && fine) return;   // desktop: clicking "Games" opens the library
      if (b.tagName === 'A' && fine) return;
      e.preventDefault(); var o = !it.classList.contains('open'); closeAll(); it.classList.toggle('open', o); b.setAttribute('aria-expanded', o ? 'true' : 'false');
    });
  });
  burger.addEventListener('click', function () { var o = !sheet.classList.contains('open'); sheet.classList.toggle('open', o); burger.textContent = o ? '✕' : '☰'; burger.setAttribute('aria-expanded', o ? 'true' : 'false'); document.documentElement.style.overflow = o ? 'hidden' : ''; });
  sheet.addEventListener('click', function (e) {
    var r = e.target.closest('[data-sub]'); if (r) { document.getElementById({h: 'shSubH', g: 'shSubG', t: 'shSubT', s: 'shSubS'}[r.dataset.sub]).classList.toggle('open'); return; }
    if (e.target.closest('a')) { sheet.classList.remove('open'); burger.textContent = '☰'; document.documentElement.style.overflow = ''; }
  });
  document.addEventListener('click', function (e) { if (!h.contains(e.target)) closeAll(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeAll(); if (sheet.classList.contains('open')) burger.click(); } });
  h.addEventListener('click', function (e) { var a = e.target.closest('a'); if (a) { try { gtag('event', 'nav_click', {to: a.getAttribute('href')}); } catch (x) {} } });
  // Showing requests: any Call / Text / Email link anywhere on the page (GA4 key event "showing_contact").
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]'); if (!a) return;
    var m = a.getAttribute('href').split(':')[0], method = {tel: 'call', sms: 'text', mailto: 'email'}[m] || m;
    try { gtag('event', 'showing_contact', {method: method, page: location.pathname, where: h.contains(a) ? 'header' : 'page', transport_type: 'beacon'}); } catch (x) {}
  }, true);
})();
