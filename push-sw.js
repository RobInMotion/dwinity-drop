/* Dead Drop push service worker. Shows generic notifications (no message content —
 * chat is E2E-encrypted and never known to the server). Click focuses/opens the target. */
self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  var title = data.title || "Dead Drop";
  var options = {
    body: data.body || "",
    icon: "/img/deaddrop-logo-256.png",
    badge: "/img/deaddrop-favicon-32.png",
    tag: data.tag || "dd",
    renotify: true,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ("focus" in c) {
          try { if (c.navigate) c.navigate(url); } catch (e) {}
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
