// ═══ ChoreQuest Service Worker ═══
const CACHE_NAME = "chorequest-v4";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./app-core.js",
  "./app-ui.js",
  "./gamedata.js",
  "./gamification.js",
  "./bounty.js",
  "./trading.js",
  "./manifest.json",
];

// Cache character images
const IMAGE_ASSETS = [
  "char_fox.png","char_wolf.png","char_dragon.png","char_panda.png",
  "char_owl.png","char_bunny.png","char_raccoon.png",
  "characters_batch_1.png","characters_batch_2.png","characters_batch_3.png",
  "characters_batch_4.png","characters_batch_5.png",
  "store_outfits.png","store_armor.png","store_weapons.png","store_accessories.png",
  "icon-192.png","icon-512.png"
].map(f => `./images/${f}`);

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
 const url = e.request.url;

 // Network-first for Firebase/auth APIs
 if (url.includes("firebasejs") || url.includes("googleapis.com") ||
     url.includes("firestore") || url.includes("identitytoolkit")) {
   return;
 }

 // Stale-while-revalidate for Google Fonts (fast load + stays fresh)
 if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) {
   e.respondWith(
     caches.open(CACHE_NAME).then(cache =>
       cache.match(e.request).then(cached => {
         const fetchPromise = fetch(e.request).then(response => {
           if (response.ok) cache.put(e.request, response.clone());
           return response;
         });
         return cached || fetchPromise;
       })
     )
   );
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
