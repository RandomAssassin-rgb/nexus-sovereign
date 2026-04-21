const CACHE_NAME = "nexus-sovereign-shell-v3";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/dashboard.png"];

async function networkFirst(request, fallbackKey) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackKey) {
      const fallback = await caches.match(fallbackKey);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function showNexusNotification(payload) {
  if (!payload?.title) return;

  await self.registration.showNotification(payload.title, {
    body: payload.body || "",
    tag: payload.id || payload.title,
    data: {
      route: payload.route || "/home",
      kind: payload.kind || "system",
      severity: payload.severity || "info",
      id: payload.id || null,
    },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, "/index.html"));
    return;
  }

  if (requestUrl.pathname.startsWith("/assets/")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (requestUrl.pathname.startsWith("/models/")) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "NEXUS_NOTIFY") return;
  event.waitUntil(showNexusNotification(event.data.payload));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = null;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "Nexus Sovereign",
      body: event.data.text(),
      route: "/home",
    };
  }

  event.waitUntil(showNexusNotification(payload));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const route = event.notification.data?.route || "/home";
  const targetUrl = new URL(route, self.location.origin).toString();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if (client.url === targetUrl && "navigate" in client) {
            return client.focus();
          }

          if ("navigate" in client) {
            return client.navigate(targetUrl).then(() => client.focus());
          }
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
