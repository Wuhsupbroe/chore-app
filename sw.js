// ═══ ChoreQuest Service Worker ═══
const CACHE_NAME = "chorequest-v1";
const SHELL_ASSETS = [
  "/chore-app/",
  "/chore-app/index.html",
  "/chore-app/style.css",
  "/chore-app/app.js",
  "/chore-app/app-core.js",
  "/chore-app/app-ui.js",
  "/chore-app/gamedata.js",
  "/chore-app/gamification.js",
  "/chore-app/bounty.js",
  "/chore-app/trading.js",
  "/chore-app/manifest.json",
];

// Cache character images
const IMAGE_ASSETS = [
  "char_fox.png","char_wolf.png","char_dragon.png","char_panda.png",
  "char_owl.png","char_bunny.png","char_raccoon.png",
  "characters_batch_1.png","characters_batch_2.png","characters_batch_3.png",
  "characters_batch_4.png","characters_batch_5.png",
  "store_outfits.png","store_armor.png","store_weapons.png","store_accessories.png"
].map(f => `/chore-app/images/${f}`);

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([...SHELL_ASSETS, ...IMAGE_ASSETS]))
      .catch(err => console.warn("SW cache error:", err))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Network-first for API calls and Firebase
  if (e.request.url.includes("firebasejs") ||
      e.request.url.includes("googleapis.com") ||
      e.request.url.includes("firestore") ||
      e.request.url.includes("identitytoolkit")) {
    return;
  }
  // Cache-first for app shell
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok && e.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => caches.match("/chore-app/index.html"))
  );
});
