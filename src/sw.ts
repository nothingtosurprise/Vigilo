/// <reference lib="webworker" />

import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: any[];
};

precacheAndRoute(self.__WB_MANIFEST);

// MediaPipe WASM runtime: cached on first use (only the variant the browser
// needs, ~11MB), available offline afterwards. Same-origin 200s cache by default.
registerRoute(
  ({ url }) => url.pathname.startsWith("/mediapipe-wasm/"),
  new CacheFirst({ cacheName: "mediapipe-wasm" }),
);

registerRoute(({ request }) => request.destination === "document", new StaleWhileRevalidate());

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  self.clients.claim();
});
