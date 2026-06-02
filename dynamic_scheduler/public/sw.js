self.addEventListener('push', function (event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      vibrate: [200, 100, 200], // Haptic feedback pattern
      data: {
        dateOfArrival: Date.now(),
        url: data.url // Embed the navigation target for click handling
      },
    };
    // The waitUntil wrapper ensures the service worker does not terminate 
    // prematurely before the operating system acknowledges the notification
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  // Navigate the student to the dashboard if they click the notification
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});
