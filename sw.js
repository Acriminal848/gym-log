/* sw.js — offline cache + การอัปเดตแบบให้ผู้ใช้กดเอง
 *
 * ทุกพาธเป็น relative เพื่อให้ทำงานได้ใน /app-name/ ของ GitHub Pages
 * เมื่อแก้ไฟล์แอปแล้วจะปล่อยเวอร์ชันใหม่ ต้องเปลี่ยน VERSION ด้านล่าง (และ APP_VERSION ใน core.js)
 * ไม่งั้นเบราว์เซอร์จะไม่เห็นว่า sw.js เปลี่ยน และผู้ใช้จะยังเห็นไฟล์เก่า
 */
const VERSION = '1.8.0';
const CACHE_PREFIX = 'gymlog-cache-';
const CACHE = CACHE_PREFIX + VERSION;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './core.js',
  './rest.js',
  './charts.js',
  './views.js',
  './app.js',
  './storage.js',
  './progression.js',
  './summary.js',
  './icons.js',
  './program.js',
  './fonts/inter-latin-wght-normal.woff2',
  './fonts/noto-sans-thai-thai-wght-normal.woff2',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  // ไม่เรียก skipWaiting เอง: เวอร์ชันใหม่จะรอจนผู้ใช้กด "อัปเดตตอนนี้" ในแอป
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // ไม่ยุ่งกับเครือข่ายภายนอก

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || caches.match('./index.html'))
        .then((hit) => hit || fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req))
  );
});
