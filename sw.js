/* 복약 알림 — 백그라운드 알림 보조 (선택) */
self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(caches.open("pill-reminder-v1").then(function (cache) {
    return cache.addAll(["./", "./index.html", "./app.css", "./app.js", "./manifest.json"]);
  }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    }),
  );
});
