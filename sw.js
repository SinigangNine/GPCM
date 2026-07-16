const CACHE_NAME = "connected-cache-v2";
const APP_SHELL = [
  "index.html",
  "manifest.json",
  "GPCM192.png",
  "GPCM512.png"
];

// ---------- INSTALL: pre-cache the app shell ----------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ---------- ACTIVATE: clean up old caches ----------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// ---------- FETCH: network-first, cache fallback, offline page for navigations ----------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== "GET") return;

  // Don't intercept cross-origin calls (e.g. Supabase API) — let those hit the network normally
  if (new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Page navigations: try network, fall back to cache (e.g. cached index.html)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match("index.html");
        })
    );
    return;
  }

  // Static assets: cache-first, then network, updating the cache as we go
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

// ---------- PUSH: display a notification when a push message arrives ----------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Connected", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Connected";
  const options = {
    body: data.body || "You have a new update.",
    icon: data.icon || "GPCM192.png",
    badge: data.badge || "GPCM192.png",
    data: data.url ? { url: data.url } : {},
    tag: data.tag || "connected-notification"
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ---------- NOTIFICATION CLICK: focus/open the app ----------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "index.html";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(targetUrl));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
