/* RadPad — العمل بدون إنترنت
   - عند وجود إنترنت: يجلب أحدث نسخة من الموقع ويحفظها (فتظهر الروايات الجديدة فورًا).
   - بدون إنترنت أو مع شبكة بطيئة: يعرض آخر نسخة محفوظة.
   ضع هذا الملف بجانب index.html في مستودع الموقع (بنفس الاسم sw.js). */
const CACHE = 'radpad-v1';
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
const SKIP = /(firebaseio\.com|identitytoolkit|securetoken|firebaseinstallations|google-analytics|googletagmanager|youtube\.com|ytimg\.com|googlevideo\.com)/i;

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
  e.respondWith(handle(e, req));
});

async function handle(e, req) {
  const cache = await caches.open(CACHE);
  // الشبكة أولًا؛ ولو أي تحميل نجح (حتى بعد انتهاء المهلة) يُحفظ في الخلفية
  const net = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
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
