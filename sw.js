/* RadPad — العمل بدون إنترنت
   - عند وجود إنترنت: يجلب أحدث نسخة من الموقع ويحفظها (فتظهر الروايات الجديدة فورًا).
   - بدون إنترنت أو مع شبكة بطيئة: يعرض آخر نسخة محفوظة.
   ضع هذا الملف بجانب index.html في مستودع الموقع (بنفس الاسم sw.js). */
const CACHE = 'radpad-v1';
const CFG_KEY = '__rp_cfg';
const NET_TIMEOUT = 7000;

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// طلبات لا نخزّنها أبدًا (بيانات حيّة)
const SKIP = /(\/api\/(me|my|admin|login|register|password)|firebaseio\.com|identitytoolkit|securetoken|firebaseinstallations|google-analytics|googletagmanager|youtube\.com|ytimg\.com|googlevideo\.com)/i;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (SKIP.test(url.host + url.pathname)) return;
  if (url.pathname.endsWith('/' + CFG_KEY)) { e.respondWith(cfgResponse()); return; }
  e.respondWith(handle(e, req));
});

/* آخر إعدادات تحديث التطبيق (الفيرجن + رابط التحميل) اللي اتقرت من الصفحة الأحدث */
async function cfgResponse() {
  try {
    const c = await caches.open(CACHE);
    const hit = await c.match(new URL(CFG_KEY, self.registration.scope).href);
    if (hit) return hit;
  } catch (err) {}
  return new Response('{}', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
async function rememberCfg(res) {
  try {
    const t = await res.clone().text();
    const v = /"appVersion"\s*:\s*"([^"]*)"/.exec(t), u = /"appDownloadUrl"\s*:\s*"([^"]*)"/.exec(t);
    if (!v) return;
    const c = await caches.open(CACHE);
    await c.put(new URL(CFG_KEY, self.registration.scope).href, new Response(JSON.stringify({ appVersion: v[1], appDownloadUrl: u ? u[1] : '' }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
  } catch (err) {}
}

async function handle(e, req) {
  const cache = await caches.open(CACHE);
  // الشبكة أولًا؛ ولو أي تحميل نجح (حتى بعد انتهاء المهلة) يُحفظ في الخلفية
  // الصفحة الرئيسية: نتجاوز كاش المتصفح (10 دقايق في GitHub Pages) علشان التعديلات الجديدة تظهر فورًا
  const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(req.url).pathname);
  const net = (isPage ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req)).then((res) => {
    if (res && (res.ok || res.type === 'opaque') && !/no-store/i.test(res.headers.get('cache-control') || '')) cache.put(req, res.clone()).catch(() => {});
    if (isPage && res && res.ok) e.waitUntil(rememberCfg(res.clone()));
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  try {
    return await withTimeout(net, NET_TIMEOUT);
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const home = await cache.match(new URL('./', self.registration.scope).href, { ignoreSearch: true });
      if (home) return home;
    }
    // لا يوجد نسخة محفوظة: انتظر نتيجة الشبكة الأصلية (قد تفشل)
    return net;
  }
}

// تخزين مسبق من أول فتحة: الصفحة ترسل قائمة الملفات التي حمّلتها
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type !== 'precache' || !Array.isArray(d.urls)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const seen = new Set();
    for (const u of d.urls) {
      if (seen.has(u) || !/^https?:/i.test(u) || SKIP.test(u)) continue;
      seen.add(u);
      try {
        if (await cache.match(u)) continue;
        const same = new URL(u).origin === self.location.origin;
        const res = await fetch(u, same ? {} : { mode: 'no-cors' });
        if (res && (res.ok || res.type === 'opaque')) await cache.put(u, res);
      } catch (err) {}
    }
  })());
});
