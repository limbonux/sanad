/* Service Worker لنظام سَند - يستقبل إشعارات الدفع (Web Push) حتى لو الصفحة مغلقة */

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  var data = { title: 'سَند', body: 'تنبيه جديد', url: '/' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  var options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: 'sanad-alert',
    requireInteraction: true,
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var rel = (event.notification.data && event.notification.data.url) || 'app/emergency.html';
  var url = new URL(rel, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url === url && 'focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
