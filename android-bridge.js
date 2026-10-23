/* طبقة الربط بين الموقع وتطبيق أندرويد (Capacitor) — لا تؤثر على الموقع الأصلي */
(function () {
  'use strict';

  var Cap = window.Capacitor;
  var FORCED = /[?&]appmode=1\b/.test(location.search); // للتجربة في المتصفح: أضف ?appmode=1 للرابط
  var NATIVE = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  if (!NATIVE && !FORCED) return; // يعمل فقط داخل التطبيق
  var P = (Cap && Cap.Plugins) || {};
  document.documentElement.classList.add('is-native-app');

  /* ---------- 1) شريط الحالة ---------- */
  try {
    if (P.StatusBar) {
      P.StatusBar.setStyle({ style: 'DARK' });
      P.StatusBar.setBackgroundColor({ color: '#022c22' });
    }
  } catch (e) {}

  /* ---------- 2) مظهر التطبيق: منع تحديد النصوص خارج القراءة + سحب التحديث ---------- */
  var css = document.createElement('style');
  css.textContent =
    'html.is-native-app{-webkit-tap-highlight-color:transparent;overscroll-behavior-y:none}' +
    'html.is-native-app body{-webkit-touch-callout:none}' +
    'html.is-native-app button,html.is-native-app a,html.is-native-app nav{-webkit-user-select:none;user-select:none}' +
    'html.is-native-app .novel-text,html.is-native-app #reader-paper,html.is-native-app input,html.is-native-app textarea{-webkit-user-select:text;user-select:text}';
  document.head.appendChild(css);

  /* ---------- 3) فتح الروابط الخارجية في المتصفح ---------- */
  function openExternal(url) {
    try {
      if (P.Browser) return P.Browser.open({ url: url });
    } catch (e) {}
    window.location.href = url;
  }
  var origOpen = window.open;
  window.open = function (url) {
    if (url && /^(https?:|mailto:|tel:|whatsapp:)/i.test(String(url))) {
      openExternal(String(url));
      return null;
    }
    return origOpen ? origOpen.apply(window, arguments) : null;
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^https?:/i.test(href) && href.indexOf('://' + location.host) === -1) {
      e.preventDefault();
      openExternal(href);
    }
  }, true);

  /* ---------- 4) حفظ/مشاركة الملفات (PDF والنسخ الاحتياطي) ---------- */
  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  function saveBlobUrl(url, name) {
    var safe = (name || 'file').replace(/[\\/:*?"<>|]+/g, '_');
    return fetch(url).then(function (r) { return r.blob(); }).then(blobToBase64).then(function (b64) {
      return P.Filesystem.writeFile({ path: safe, data: b64, directory: 'CACHE' });
    }).then(function (f) {
      return P.Share.share({ title: safe, dialogTitle: 'حفظ / مشاركة الملف', url: f.uri });
    }).catch(function (err) {
      if (err && /cancel/i.test(String(err.message || err))) return;
      alert('تعذّر حفظ الملف');
    });
  }
  function isBlobDownload(el) {
    return el instanceof HTMLAnchorElement && el.download && /^blob:/.test(el.href);
  }
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (P.Filesystem && P.Share && isBlobDownload(this)) { saveBlobUrl(this.href, this.download); return; }
    return origClick.apply(this, arguments);
  };
  var origDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === 'click' && P.Filesystem && P.Share && isBlobDownload(this)) {
      saveBlobUrl(this.href, this.download);
      return true;
    }
    return origDispatch.call(this, ev);
  };

  /* ---------- 6) زر الرجوع في أندرويد ---------- */
  var lastBack = 0;
  function visible(id) {
    var el = document.getElementById(id);
    return el && !el.classList.contains('hidden') && el.style.display !== 'none';
  }
  function toast(msg) {
    try {
      if (typeof window.showSimpleToast === 'function') return window.showSimpleToast(msg);
      if (typeof window.showToast === 'function') return window.showToast(msg);
    } catch (e) {}
  }
  function handleBack() {
    if (typeof window.__appCloseLibrary === 'function' && window.__appCloseLibrary()) return;
    var modals = [
      ['secret-pin-modal', 'closeSecretPinModal'],
      ['content-password-modal', 'closeContentPasswordModal'],
      ['control-panel-modal', 'closeControlPanel'],
      ['pdf-modal', 'closePdfModal']
    ];
    for (var i = 0; i < modals.length; i++) {
      if (visible(modals[i][0]) && typeof window[modals[i][1]] === 'function') {
        window[modals[i][1]]();
        return;
      }
    }
    if (visible('view-reader') && typeof window.backToNovelFromReader === 'function') {
      window.backToNovelFromReader();
      return;
    }
    if (visible('view-novel-details') && typeof window.navigateTo === 'function') {
      window.navigateTo('home');
      return;
    }
    var now = Date.now();
    if (now - lastBack < 2000) {
      P.App.exitApp();
    } else {
      lastBack = now;
      toast('اضغط مرة أخرى للخروج');
    }
  }
  try {
    if (P.App) P.App.addListener('backButton', handleBack);
  } catch (e) {}
})();

/* =====================================================================
   واجهة التطبيق (App Mode): تغيّر الشكل داخل التطبيق فقط — الموقع في المتصفح كما هو
   ===================================================================== */
(function () {
  'use strict';
  var Cap = window.Capacitor;
  var NATIVE = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  var FORCED = /[?&]appmode=1\b/.test(location.search);
  if (!NATIVE && !FORCED) return;

  var CSS = [
  /* ---- أساس ---- */
  'html.is-native-app{scroll-padding-top:84px}',
  'html.is-native-app body{padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))}',
  'html.is-native-app main{padding:14px 14px 24px!important}',
  'html.is-native-app footer{display:none!important}',
  'html.is-native-app ::-webkit-scrollbar{display:none}',
  'html.is-native-app .dynamic-card-radius{border-radius:22px!important}',

  /* ---- الهيدر: شريط أخضر مدمج ---- */
  'html.is-native-app header.sticky{background:linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark))!important;border:0!important;border-radius:0 0 26px 26px;box-shadow:0 6px 24px rgba(2,44,34,.35)!important;backdrop-filter:none!important}',
  'html.is-native-app header.sticky>div:first-child{height:60px!important;padding-left:14px!important;padding-right:14px!important}',
  'html.is-native-app header #header-site-title{color:#fff!important;font-size:1.02rem!important;line-height:1.3}',
  'html.is-native-app header #header-site-subtitle{display:none!important}',
  'html.is-native-app header [onclick*="navigateTo"]>div:first-child{width:2.5rem!important;height:2.5rem!important;border-radius:.9rem!important;background:rgba(255,255,255,.14)!important;border-color:rgba(255,255,255,.25)!important}',
  'html.is-native-app header button{background:rgba(255,255,255,.14)!important;color:#fcd34d!important;border:0!important}',
  'html.is-native-app header button.admin-only-ui{color:#fff!important}',
  'html.is-native-app header>div:nth-child(2){padding:0 14px 14px!important}',
  'html.is-native-app header #mobile-search-input{background:rgba(255,255,255,.96)!important;color:#0f172a!important;border:0!important;border-radius:16px!important;height:46px;font-size:.95rem;box-shadow:0 4px 14px rgba(0,0,0,.18)}',
  'html.is-native-app header #mobile-search-input::placeholder{color:#64748b}',
  'html.is-native-app header>div:nth-child(2) i{top:15px!important;color:#64748b!important}',
  'html.is-native-app:not([data-view="home"]) header>div:nth-child(2){display:none!important}',
  'html.is-native-app[data-view="reader"] header.sticky{display:none!important}',

  /* ---- البانر الرئيسي ---- */
  'html.is-native-app #hero-banner-wrapper>div{border-radius:26px!important}',
  'html.is-native-app #hero-banner-wrapper>div>div:nth-child(2){padding:18px!important;gap:16px!important;flex-direction:row!important;align-items:center!important}',
  'html.is-native-app #hero-banner-wrapper .book-cover{width:6.6rem!important;height:9.6rem!important}',
  'html.is-native-app #hero-banner-wrapper .flex-1{text-align:right!important;gap:.5rem}',
  'html.is-native-app #hero-banner-wrapper .flex-1>*{margin-top:0!important}',
  'html.is-native-app #hero-banner-wrapper .flex-1>div:first-child{font-size:.68rem!important;padding:.25rem .6rem!important}',
  'html.is-native-app #hero-banner-wrapper h2{font-size:1.2rem!important;line-height:1.55!important}',
  'html.is-native-app #hero-banner-wrapper p{display:none!important}',
  'html.is-native-app #hero-banner-wrapper .flex-wrap{justify-content:flex-start!important}',
  'html.is-native-app #hero-banner-wrapper button[onclick*="\'pdf\'"]{display:none!important}',
  'html.is-native-app #hero-banner-wrapper .pt-4{padding-top:.4rem!important}',
  'html.is-native-app #hero-banner-wrapper button{padding:.7rem 1.1rem!important;font-size:.85rem!important;border-radius:14px!important}',

  'html.is-native-app #hero-banner-wrapper>div>div:nth-child(2){display:flex!important}',
  'html.is-native-app #novels-grid{display:grid!important}',
  'html.is-native-app #announcement-bar{padding:.35rem .9rem!important;font-size:.7rem!important;line-height:1.5;border:0!important}',
  'html.is-native-app[data-view="reader"] #announcement-bar{display:none!important}',

  /* ---- عناوين الأقسام ---- */
  'html.is-native-app #library-section-title{font-size:1.15rem}',
  'html.is-native-app #library-section-subtitle{display:none!important}',
  'html.is-native-app #category-filters{scroll-snap-type:x proximity;padding-bottom:4px;margin-inline:-14px;padding-inline:14px}',
  'html.is-native-app #category-filters>*{flex-shrink:0;scroll-snap-align:start;border-radius:999px!important}',

  /* ---- كروت الروايات ---- */
  'html.is-native-app #view-home>*+*{margin-top:1.25rem!important}',
  'html.is-native-app #novels-grid{gap:14px!important;grid-template-columns:1fr!important}',
  'html.is-native-app #novels-grid>div{padding:14px!important;border-radius:22px!important;border:0!important;box-shadow:0 2px 16px rgba(15,23,42,.08)!important;transition:transform .15s ease!important}',
  'html.is-native-app #novels-grid>div:active{transform:scale(.982)}',
  'html.is-native-app #novels-grid .book-cover{width:5.4rem!important;height:7.9rem!important;border-radius:14px!important}',
  'html.is-native-app #novels-grid .flex.gap-5{gap:.9rem!important}',
  'html.is-native-app #novels-grid h3{font-size:1.02rem!important;line-height:1.5}',
  'html.is-native-app #novels-grid p.line-clamp-3{-webkit-line-clamp:2!important;margin-top:.6rem!important;font-size:.8rem!important}',
  'html.is-native-app #novels-grid .border-t{margin-top:.8rem!important;padding-top:.8rem!important}',
  'html.is-native-app #novels-grid .border-t button{border-radius:14px!important;padding:.65rem .5rem!important}',

  /* ---- بطاقة الكاتب ---- */
  'html.is-native-app #author-bio-card{border-radius:22px!important;padding:16px!important;border:0!important;box-shadow:0 2px 16px rgba(15,23,42,.08)!important}',

  /* ---- حركة الانتقال بين الصفحات ---- */
  '@keyframes appIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}',
  'html.is-native-app #view-home:not(.hidden),html.is-native-app #view-novel-details:not(.hidden),html.is-native-app #view-reader:not(.hidden){animation:appIn .32s cubic-bezier(.2,.8,.2,1) backwards}',

  /* ---- هيدر غير ثابت + غطاء شريط الحالة ---- */
  'html.is-native-app{--sat:0px}',
  'html.is-native-app body{padding-top:var(--sat)}',
  'html.is-native-app header.sticky{position:relative!important;top:auto!important}',
  'html.is-native-app{scroll-padding-top:calc(var(--sat) + 12px)}',
  '#app-sat{display:none}',
  'html.is-native-app #app-sat{display:block;position:fixed;top:0;left:0;right:0;height:var(--sat);background:#022c22;z-index:9500}',
  'html.is-native-app #hero-banner-wrapper .flex-1>div:first-child{white-space:nowrap;font-size:.62rem!important}',
  'html.is-native-app #hero-banner-wrapper button{white-space:nowrap}',
  'html.is-native-app #author-bio-card{margin-bottom:.5rem}',

  /* ---- شاشة المكتبة (متابعة القراءة) ---- */
  '#app-lib{display:none}',
  'html.is-native-app.lib-open #app-lib{display:block;position:fixed;left:0;right:0;top:var(--sat);bottom:0;z-index:8500;overflow-y:auto;direction:rtl;padding:18px 14px calc(92px + env(safe-area-inset-bottom,0px));font-family:var(--ui-font,Cairo,sans-serif);animation:appIn .28s ease backwards}',
  '#app-lib h2{font-size:1.35rem;font-weight:900;margin:2px 4px 2px;display:flex;align-items:center;gap:.5rem}',
  '#app-lib h2 i{color:var(--brand-accent)}',
  '#app-lib .sub{font-size:.78rem;opacity:.65;margin:0 4px 16px}',
  '#app-lib h3{font-size:.9rem;font-weight:800;margin:20px 4px 10px;opacity:.75}',
  '.lib-card{display:flex;gap:12px;align-items:center;background:#fff;border-radius:20px;padding:12px;margin-bottom:12px;box-shadow:0 2px 16px rgba(15,23,42,.08);position:relative;-webkit-tap-highlight-color:transparent;transition:transform .15s}',
  '.lib-card:active{transform:scale(.98)}',
  'html.dark .lib-card{background:#0f1a17;box-shadow:0 2px 16px rgba(0,0,0,.4)}',
  '.lib-cover{width:64px;height:92px;border-radius:12px;flex-shrink:0;background:linear-gradient(135deg,var(--brand-primary),var(--brand-primary-dark));background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;color:var(--brand-accent);font-size:1.4rem;box-shadow:0 6px 14px rgba(0,0,0,.25)}',
  '.lib-info{flex:1;min-width:0}',
  '.lib-title{font-weight:900;font-size:.98rem;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
  '.lib-meta{font-size:.72rem;opacity:.65;margin:2px 0 8px}',
  '.lib-bar{height:7px;border-radius:99px;background:rgba(100,116,139,.2);overflow:hidden}',
  '.lib-bar>i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--brand-accent),#fbbf24)}',
  '.lib-go{flex-shrink:0;width:40px;height:40px;border-radius:14px;border:0;background:var(--brand-primary);color:#fff;font-size:.95rem;display:flex;align-items:center;justify-content:center}',
  'html.dark .lib-go{background:var(--brand-accent);color:#022c22}',
  '.lib-x{position:absolute;top:6px;left:8px;border:0;background:none;color:inherit;opacity:.35;font-size:.8rem;padding:6px}',
  '.lib-empty{text-align:center;padding:48px 24px;opacity:.85}',
  '.lib-empty i{font-size:3.2rem;color:var(--brand-accent);margin-bottom:14px;display:block}',
  '.lib-empty b{display:block;font-size:1.05rem;margin-bottom:6px}',
  '.lib-empty span{font-size:.82rem;opacity:.7;line-height:1.8}',

  /* ---- القارئ ---- */
  'html.is-native-app[data-view="reader"] body{padding-bottom:env(safe-area-inset-bottom,0px)}',
  'html.is-native-app[data-view="reader"] main{padding:0 0 16px!important}',
  'html.is-native-app #view-reader{gap:0}',
  'html.is-native-app #view-reader>div:first-child{position:sticky;top:0;z-index:30;border-radius:0 0 20px 20px!important;border:0!important;padding:10px 12px!important;box-shadow:0 4px 18px rgba(15,23,42,.12)!important}',
  'html.is-native-app #reader-paper{border-radius:0!important;box-shadow:none!important;padding-left:18px!important;padding-right:18px!important}',
  'html.is-native-app #reading-progress-container{top:0}',

  /* ---- الشريط السفلي ---- */
  '#app-tabbar{display:none}',
  'html.is-native-app #app-tabbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:9000;direction:rtl;justify-content:space-around;align-items:stretch;background:#fff;border-radius:24px 24px 0 0;box-shadow:0 -6px 28px rgba(15,23,42,.14);padding:6px 6px calc(6px + env(safe-area-inset-bottom,0px));font-family:var(--ui-font,Cairo,sans-serif)}',
  'html.is-native-app.dark #app-tabbar{background:#0f1a17;box-shadow:0 -6px 28px rgba(0,0,0,.5)}',
  'html.is-native-app[data-view="reader"] #app-tabbar{display:none}',
  '#app-tabbar button{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:none;border:0;padding:6px 0 4px;color:#64748b;font:inherit;font-size:.68rem;font-weight:700;-webkit-tap-highlight-color:transparent;position:relative}',
  'html.dark #app-tabbar button{color:#94a3b8}',
  '#app-tabbar button i{font-size:1.15rem;width:3.1rem;height:1.9rem;display:flex;align-items:center;justify-content:center;border-radius:999px;transition:background .2s,color .2s,transform .15s}',
  '#app-tabbar button:active i{transform:scale(.9)}',
  '#app-tabbar button.on{color:var(--brand-primary)}',
  '#app-tabbar button.on i{background:rgba(var(--brand-primary-rgb),.14);color:var(--brand-primary)}',
  'html.dark #app-tabbar button.on{color:var(--brand-accent)}',
  'html.dark #app-tabbar button.on i{background:rgba(245,158,11,.16);color:var(--brand-accent)}'
  ].join('\n');

  var st = document.createElement('style');
  st.id = 'app-mode-css';
  st.textContent = CSS;
  document.head.appendChild(st);

  // تفعيل مناطق الأمان (الحواف) في أندرويد
  var vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/viewport-fit/.test(vp.content)) vp.content += ', viewport-fit=cover';

  var root = document.documentElement;
  var VIEWS = ['home', 'novel-details', 'reader'];
  function currentView() {
    for (var i = 0; i < VIEWS.length; i++) {
      var el = document.getElementById('view-' + VIEWS[i]);
      if (el && !el.classList.contains('hidden')) return VIEWS[i];
    }
    return 'home';
  }

  /* ---- مكتبتي: تتبّع القراءة ---- */
  var LS_KEY = 'app_reading_v1';
  var store = {};
  try { store = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { store = {}; }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {} }
  function G(name) { try { return (0, eval)('typeof ' + name + ' !== "undefined" ? ' + name + ' : null'); } catch (e) { return null; } }
  function novelById(id) { var arr = G('novels') || []; for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  var timer = null;
  function pct() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    return h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
  }
  function record(inReader) {
    var id = G('currentNovelId'), n = id && novelById(id);
    if (!n) return;
    var r = store[id] || { ch: 0, p: 0, ts: 0, done: false, seen: true };
    if (inReader) {
      var ch = parseInt(G('currentChapterIndex'), 10) || 0, p = pct();
      var last = n.chapters.length - 1;
      r.ch = ch; r.p = p; r.started = true;
      r.done = ch >= last && p >= 0.93 ? true : (r.done && ch >= last);
    }
    r.ts = Date.now(); r.seen = true;
    store[id] = r; save();
  }
  function trackView(v) {
    clearInterval(timer); timer = null;
    if (v === 'novel-details') { var id = G('currentNovelId'); if (id && !store[id] && novelById(id)) record(false); }
    if (v === 'reader') { setTimeout(function () { record(true); }, 400); timer = setInterval(function () { record(true); }, 1500); }
  }
  window.addEventListener('pagehide', function () { if (currentView() === 'reader') record(true); });

  /* ---- مكتبتي: الشاشة ---- */
  var lib = document.createElement('div');
  lib.id = 'app-lib';
  function libOpen() { return root.classList.contains('lib-open'); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function card(id, n, r) {
    var total = n.chapters.length, ratio = Math.min(1, ((r.ch || 0) + (r.p || 0)) / Math.max(1, total));
    var started = r.started && (r.ch > 0 || r.p > 0.02);
    var cover = n.coverImg ? '<div class="lib-cover" style="background-image:url(\'' + esc(n.coverImg) + '\')"></div>'
      : '<div class="lib-cover"><i class="fa-solid ' + esc(n.accentIcon || 'fa-book') + '"></i></div>';
    var meta = r.done ? 'أنهيت الرواية' : started ? 'الفصل ' + ((r.ch || 0) + 1) + ' من ' + total + ' · ' + Math.round(ratio * 100) + '%' : 'لم تبدأ القراءة بعد · ' + total + ' فصول';
    return '<div class="lib-card" data-id="' + esc(id) + '">' + cover +
      '<div class="lib-info"><div class="lib-title">' + esc(n.title) + '</div><div class="lib-meta">' + meta + '</div>' +
      '<div class="lib-bar"><i style="width:' + (r.done ? 100 : Math.round(ratio * 100)) + '%"></i></div></div>' +
      '<button class="lib-go" aria-label="متابعة"><i class="fa-solid ' + (started || r.done ? 'fa-play' : 'fa-book-open') + '" style="margin-right:-2px"></i></button>' +
      '<button class="lib-x" data-x="' + esc(id) + '" aria-label="إزالة"><i class="fa-solid fa-xmark"></i></button></div>';
  }
  function paintLib() {
    var ids = Object.keys(store).filter(function (id) { return novelById(id); })
      .sort(function (a, b) { return (store[b].ts || 0) - (store[a].ts || 0); });
    var cont = ids.filter(function (id) { return !store[id].done; }), done = ids.filter(function (id) { return store[id].done; });
    var h = '<h2><i class="fa-solid fa-bookmark"></i>مكتبتي</h2><p class="sub">الروايات التي دخلتها وتابع من حيث توقفت</p>';
    if (!ids.length) {
      h += '<div class="lib-empty"><i class="fa-solid fa-book-open-reader"></i><b>مكتبتك فارغة</b><span>الروايات التي تفتحها وتبدأ قراءتها<br>ستظهر هنا لتكمل منها لاحقًا</span></div>';
    } else {
      if (cont.length) h += '<h3>أكمل القراءة</h3>' + cont.map(function (id) { return card(id, novelById(id), store[id]); }).join('');
      if (done.length) h += '<h3>أنهيتها</h3>' + done.map(function (id) { return card(id, novelById(id), store[id]); }).join('');
    }
    lib.innerHTML = h;
    var bg = getComputedStyle(document.body).backgroundColor;
    if (!bg || bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg)) bg = root.classList.contains('dark') ? '#020617' : '#fcf8f2';
    lib.style.background = bg;
  }
  function openLib() { paintLib(); root.classList.add('lib-open'); lib.scrollTop = 0; }
  function closeLib() { root.classList.remove('lib-open'); }
  window.__appCloseLibrary = function () { if (libOpen()) { closeLib(); setActive('home'); return true; } return false; };
  lib.addEventListener('click', function (e) {
    var x = e.target.closest('[data-x]');
    if (x) { delete store[x.dataset.x]; save(); paintLib(); return; }
    var c = e.target.closest('.lib-card');
    if (!c) return;
    var id = c.dataset.id, r = store[id], n = novelById(id);
    if (!r || !n) return;
    closeLib();
    var started = r.started && (r.ch > 0 || r.p > 0.02);
    if (started && typeof window.openChapterReader === 'function') {
      window.openChapterReader(id, r.ch || 0);
      var target = r.p || 0;
      setTimeout(function () { var hh = document.documentElement.scrollHeight - window.innerHeight; if (hh > 0 && target > 0.02) window.scrollTo({ top: hh * target }); }, 700);
    } else if (typeof window.openNovelDetails === 'function') window.openNovelDetails(id, false, true);
  });

  /* ---- الشريط السفلي ---- */
  var TABS = [
    { id: 'home', icon: 'fa-house', label: 'الرئيسية' },
    { id: 'library', icon: 'fa-book-open', label: 'الروايات' },
    { id: 'search', icon: 'fa-magnifying-glass', label: 'بحث' },
    { id: 'mylib', icon: 'fa-bookmark', label: 'المكتبة' },
    { id: 'theme', icon: 'fa-moon', label: 'المظهر' }
  ];
  var bar = document.createElement('nav');
  bar.id = 'app-tabbar';
  bar.setAttribute('aria-label', 'التنقل');
  TABS.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.dataset.tab = t.id;
    b.innerHTML = '<i class="fa-solid ' + t.icon + '"></i><span>' + t.label + '</span>';
    bar.appendChild(b);
  });

  function setActive(id) {
    [].forEach.call(bar.children, function (b) { b.classList.toggle('on', b.dataset.tab === id); });
  }
  function syncThemeIcon() {
    var ic = bar.querySelector('[data-tab="theme"] i');
    if (ic) ic.className = 'fa-solid ' + (root.classList.contains('dark') ? 'fa-sun' : 'fa-moon');
  }
  function toHome() {
    if (currentView() !== 'home' && typeof window.navigateTo === 'function') window.navigateTo('home');
  }
  function scrollToEl(sel, delay) {
    setTimeout(function () {
      var el = document.querySelector(sel);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, delay || 60);
  }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (x) {}
    var id = b.dataset.tab;
    if (id === 'theme') {
      if (typeof window.toggleDarkMode === 'function') window.toggleDarkMode();
      setTimeout(function () { syncThemeIcon(); paintLib(); }, 60);
      return;
    }
    if (id === 'mylib') { setActive('mylib'); openLib(); return; }
    var wasHome = currentView() === 'home' && !libOpen();
    closeLib();
    setActive(id);
    toHome();
    var d = wasHome ? 0 : 350;
    if (id === 'home') setTimeout(function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }, d + 30);
    else if (id === 'library') scrollToEl('#library-section-title', d + 60);
    else if (id === 'search') {
      setTimeout(function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }, d + 30);
      setTimeout(function () {
        var inp = document.getElementById('mobile-search-input') || document.getElementById('search-input');
        if (inp) inp.focus();
      }, d + 400);
    }
  });

  /* ---- متابعة الصفحة الحالية ---- */
  function onView() {
    var v = currentView();
    root.setAttribute('data-view', v);
    if (libOpen()) closeLib();
    trackView(v);
    if (v === 'novel-details') setActive('library');
    else if (v === 'home' && !bar.querySelector('.on')) setActive('home');
  }
  var mo = new MutationObserver(onView);
  function init() {
    var cover = document.createElement('div'); cover.id = 'app-sat';
    document.body.appendChild(cover);
    document.body.appendChild(lib);
    // ارتفاع شريط الحالة: من Capacitor أو env أو قيمة افتراضية
    var pr = document.createElement('div');
    pr.style.cssText = 'position:fixed;visibility:hidden;padding-top:max(var(--safe-area-inset-top,0px),env(safe-area-inset-top,0px))';
    document.body.appendChild(pr);
    var sat = parseFloat(getComputedStyle(pr).paddingTop) || 0;
    pr.remove();
    root.style.setProperty('--sat', (sat > 0 ? sat : (NATIVE ? 28 : 0)) + 'px');
    document.body.appendChild(bar);
    VIEWS.forEach(function (v) {
      var el = document.getElementById('view-' + v);
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    new MutationObserver(syncThemeIcon).observe(root, { attributes: true, attributeFilter: ['class'] });
    setActive('home');
    onView();
    syncThemeIcon();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  /* ---- الضغط على أي مكان في كارت الرواية يفتح صفحتها ---- */
  document.addEventListener('click', function (e) {
    var card = e.target.closest && e.target.closest('#novels-grid>div');
    if (!card || e.target.closest('button,a,[onclick],select,input')) return;
    var btn = card.querySelector('button[onclick*="\'details\'"]');
    if (btn) btn.click();
  });
})();
