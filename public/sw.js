// Minimal service worker: enables installability and serves the app shell
// from the network first so users always get fresh answers.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* network default */
});
