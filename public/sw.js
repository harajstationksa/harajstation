/* حراج ستيشن — service worker: Web Push + notification clicks.
   Kept cache-free on purpose: pages are dynamic (auctions/bids change every
   second) and a stale cache would show wrong prices. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "حراج ستيشن", body: event.data.text() };
  }
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon.png",
    badge: data.icon || "/icon.png",
    dir: "rtl",
    lang: "ar",
    vibrate: [100, 50, 100],
    data: { link: data.link || "/dashboard/notifications" },
  };
  event.waitUntil(
    self.registration.showNotification(data.title || "حراج ستيشن", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // focus an open tab if we have one, otherwise open a new one
      for (const client of list) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(link);
          return;
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
