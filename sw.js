/* sw.js — offline cache + การอัปเดตแบบให้ผู้ใช้กดเอง
 *
 * ทุกพาธเป็น relative เพื่อให้ทำงานได้ใน /app-name/ ของ GitHub Pages
 * เมื่อแก้ไฟล์แอปแล้วจะปล่อยเวอร์ชันใหม่ ต้องเปลี่ยน VERSION ด้านล่าง (และ APP_VERSION ใน core.js)
 * ไม่งั้นเบราว์เซอร์จะไม่เห็นว่า sw.js เปลี่ยน และผู้ใช้จะยังเห็นไฟล์เก่า
 */
const VERSION = '2.1.0';
const CACHE_PREFIX = 'gymlog-cache-';
const CACHE = CACHE_PREFIX + VERSION;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './core.js',
  './art.js',
  './library.js',
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
  './art/seated-machine-chest-press.svg',
  './art/flat-dumbbell-bench-press.svg',
  './art/smith-machine-flat-bench-press.svg',
  './art/incline-machine-chest-press.svg',
  './art/incline-dumbbell-press.svg',
  './art/smith-machine-incline-press.svg',
  './art/pec-deck-machine-chest-fly.svg',
  './art/standing-cable-chest-fly.svg',
  './art/flat-dumbbell-fly.svg',
  './art/machine-lateral-raise.svg',
  './art/single-arm-cable-lateral-raise.svg',
  './art/standing-dumbbell-lateral-raise.svg',
  './art/seated-machine-shoulder-press.svg',
  './art/seated-dumbbell-shoulder-press.svg',
  './art/smith-machine-seated-shoulder-press.svg',
  './art/dumbbell-front-raise.svg',
  './art/cable-rope-triceps-pushdown.svg',
  './art/cable-v-bar-triceps-pushdown.svg',
  './art/cable-straight-bar-triceps-pushdown.svg',
  './art/cable-rope-overhead-triceps-extension.svg',
  './art/single-arm-cable-overhead-extension.svg',
  './art/seated-dumbbell-overhead-triceps-extension.svg',
  './art/neutral-grip-lat-pulldown.svg',
  './art/medium-grip-lat-pulldown.svg',
  './art/assisted-pull-up-machine.svg',
  './art/wide-grip-t-bar-row.svg',
  './art/chest-supported-machine-row.svg',
  './art/wide-grip-seated-cable-row.svg',
  './art/incline-bench-chest-supported-dumbbell-row.svg',
  './art/close-grip-t-bar-row.svg',
  './art/neutral-grip-seated-cable-row.svg',
  './art/chest-supported-machine-low-row.svg',
  './art/seated-single-arm-chest-supported-machine-row.svg',
  './art/single-arm-cable-row.svg',
  './art/one-arm-dumbbell-row-bench.svg',
  './art/reverse-pec-deck.svg',
  './art/chest-supported-dumbbell-rear-delt-fly.svg',
  './art/cable-reverse-fly.svg',
  './art/machine-preacher-curl.svg',
  './art/cable-curl-ez-straight-bar.svg',
  './art/seated-dumbbell-supinating-curl.svg',
  './art/rope-cable-hammer-curl.svg',
  './art/seated-dumbbell-hammer-curl.svg',
  './art/standing-dumbbell-hammer-curl.svg',
  './art/45-leg-press.svg',
  './art/machine-hack-squat.svg',
  './art/smith-machine-squat.svg',
  './art/seated-leg-extension.svg',
  './art/single-leg-leg-extension.svg',
  './art/cable-ankle-strap-knee-extension.svg',
  './art/seated-leg-curl.svg',
  './art/lying-leg-curl.svg',
  './art/standing-single-leg-curl-machine.svg',
  './art/stability-ball-leg-curl.svg',
  './art/dumbbell-romanian-deadlift.svg',
  './art/smith-machine-romanian-deadlift.svg',
  './art/45-degree-back-extension.svg',
  './art/machine-hip-thrust-glute-drive.svg',
  './art/smith-machine-hip-thrust.svg',
  './art/barbell-glute-bridge.svg',
  './art/seated-hip-abduction-machine.svg',
  './art/standing-cable-hip-abduction.svg',
  './art/side-lying-hip-abduction.svg',
  './art/seated-hip-adduction-machine.svg',
  './art/standing-cable-hip-adduction.svg',
  './art/side-lying-hip-adduction.svg',
  './art/standing-calf-raise-machine.svg',
  './art/calf-press-on-leg-press.svg',
  './art/seated-calf-raise-machine.svg',
  './art/ab-crunch-machine.svg',
  './art/kneeling-cable-crunch.svg',
  './art/captains-chair-bent-knee-raise.svg',
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
        keys.filter((k) => (k.startsWith(CACHE_PREFIX) && k !== CACHE) || k === 'gymlib-photos-v1').map((k) => caches.delete(k))   // 2.1: ล้างแคชรูปถ่ายเดิมของ 2.0
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
