// Service Worker for GeoRide Rider Map PWA

const CACHE_NAME = 'georide-map-v1';

self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Tell the active service worker to take control of all open clients.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through fetch handler to satisfy PWA criteria.
  // We let standard browser loading/caching rules handle next.js API/document requests,
  // preventing any conflicts with dynamic data layers, Leaflet tiles, and Auth0 sessions.
});

// Handle commands from the client UI
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
