// 푸시 알림 받기 + 알림 누르면 앱 열기
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'TC 점심', body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'TC 점심', {
    body: data.body || '', icon: '/icon-192.png', badge: '/icon-192.png',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('/');
  }));
});
