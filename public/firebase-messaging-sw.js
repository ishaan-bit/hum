importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

const HUM_FIREBASE_CONFIG = {
  apiKey: "AIzaSyA4PXzcIZ08WsiJjxoVTOzcD4U8eA8ViS4",
  authDomain: "hum-prod-c84e8.firebaseapp.com",
  projectId: "hum-prod-c84e8",
  storageBucket: "hum-prod-c84e8.firebasestorage.app",
  messagingSenderId: "115607793087",
  appId: "1:115607793087:web:43c8c0a7d4ad58cd6e050a",
};

if (Object.values(HUM_FIREBASE_CONFIG).every(Boolean)) {
  firebase.initializeApp(HUM_FIREBASE_CONFIG);

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};
    const title = notification.title || "Hum";
    const options = {
      body: notification.body || "A gentle reminder is ready.",
      icon: notification.icon || "/icons/hum-192.svg",
      badge: "/icons/hum-192.svg",
      data,
    };

    self.registration.showNotification(title, options);
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "https://hum-beta.vercel.app";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url === url) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    }),
  );
});
