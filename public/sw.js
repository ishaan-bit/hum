const HUM_CACHE = "hum-shell-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/hum-icon.svg", "/icons/hum-192.svg", "/icons/hum-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(HUM_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== HUM_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const copy = response.clone();
        caches.open(HUM_CACHE).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
